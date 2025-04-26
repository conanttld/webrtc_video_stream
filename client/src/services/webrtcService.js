import { useCallback, useRef, useState } from 'react';

/**
 * WebRTC Peer Connection Service
 * Handles WebRTC peer connection setup, track management, and connection state
 * Updated to support one broadcaster with multiple viewers
 */
export const useWebRTCConnection = (sendMessage, fpsStateRef, startMonitoring, videoVisualization) => {
  // Replace single pcRef with a map for multiple connections
  const peerConnectionsRef = useRef(new Map()); // viewerId => RTCPeerConnection
  const localStreamRef = useRef(null);
  // Track viewer count
  const [viewerCount, setViewerCount] = useState(0);
  // Store ICE candidates that arrive before remote description is set
  const pendingIceCandidatesRef = useRef(new Map()); // peerId => [candidates]

  /**
   * Creates a new RTCPeerConnection for specific viewer
   * @param {boolean} isBroadcaster - Whether the client is the broadcaster
   * @param {Object} refs - Object containing references (videoRef)
   * @param {Function} stopStreaming - Function to call when connection is closed or fails
   * @param {string} viewerId - ID of the viewer (used when broadcaster creates connection)
   */
  const createPeerConnection = useCallback(async (isBroadcaster, refs, stopStreaming, viewerId = null) => {
    console.log('createPeerConnection called', { isBroadcaster, viewerId });
    
    if (isBroadcaster && !viewerId) {
      // For broadcaster without specific viewerId, just prepare local media
      console.log('Setting up broadcaster media without specific viewer');
      await setupBroadcasterMedia(refs, stopStreaming);
      return null;
    }

    // For viewer, or broadcaster connecting to specific viewer
    const connectionId = isBroadcaster ? viewerId : fpsStateRef.current.myId;
    console.log(`Connection ID determined: ${connectionId}`);
    
    // Close existing connection if any
    if (peerConnectionsRef.current.has(connectionId)) {
      console.log(`Closing existing PeerConnection for ${connectionId}`);
      const existingPC = peerConnectionsRef.current.get(connectionId);
      existingPC.close();
      peerConnectionsRef.current.delete(connectionId);
    }
    
    console.log(`Creating new PeerConnection for ${connectionId}. isBroadcaster: ${isBroadcaster}`);
    const pc = new RTCPeerConnection({
      // Explicitly use Google's STUN servers to improve connection success
      iceServers: [
        {urls: 'stun:stun.l.google.com:19302'},
        {urls: 'stun:stun1.l.google.com:19302'}
      ]
    });
    peerConnectionsRef.current.set(connectionId, pc);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        const targetId = isBroadcaster ? viewerId : fpsStateRef.current.myId;
        if (targetId) {
          console.log(`Sending ICE candidate to: ${targetId}`, candidate);
          sendMessage({ type: 'candidate', candidate, target: targetId });
        } else {
          console.warn("No target ID found for ICE candidate.");
        }
      }
    };

    pc.ontrack = (event) => {
      console.log("pc.ontrack event received for stream:", event.streams[0]?.id);
      
      // Use the videoVisualization service to handle the video stream
      if (videoVisualization) {
        console.log("Using videoVisualization service to display stream");
        videoVisualization.attachVideoStream(event.streams[0], false);
        // Set up canvas dimensions once video has metadata
        videoVisualization.videoRef.current.onloadedmetadata = () => {
          console.log("Video metadata loaded, setting up canvas");
          videoVisualization.setupCanvas();
        };
      } else if (refs.videoRef.current) {
        // Fallback to direct video element manipulation if visualization service not available
        console.log("Using direct video element assignment for stream");
        refs.videoRef.current.srcObject = event.streams[0];
        
        // Ensure the video element plays when ready
        refs.videoRef.current.onloadedmetadata = () => {
          console.log("Video metadata loaded, attempting to play");
          refs.videoRef.current.play().catch(e => 
            console.error("Error auto-playing video:", e)
          );
        };
      }

      // Start FPS calculation for the VIEWER
      if (!isBroadcaster) {
        console.log("Viewer received track. Starting FPS calculation.");
        startMonitoring();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`PeerConnection state for ${connectionId}: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || 
          pc.connectionState === 'failed' || 
          pc.connectionState === 'closed') {
        console.log(`PeerConnection for ${connectionId} disconnected/failed/closed.`);
        
        // Clean up this specific connection
        if (peerConnectionsRef.current.has(connectionId)) {
          peerConnectionsRef.current.delete(connectionId);
        }
        
        // If viewer and connection fails, stop streaming completely
        if (!isBroadcaster) {
          stopStreaming();
        } else {
          // If broadcaster and all connections are closed, can consider stopping
          if (peerConnectionsRef.current.size === 0) {
            console.log("All viewers disconnected.");
          }
        }
      }
    };

    // If broadcasting, add media tracks to the peer connection
    if (isBroadcaster && localStreamRef.current) {
      console.log(`Adding tracks to peer connection for viewer: ${viewerId}`);
      localStreamRef.current.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStreamRef.current);
          console.log(`Added track of kind ${track.kind} to peer connection`);
        } catch (error) {
          console.error("Error adding track:", error);
        }
      });
    }

    return pc;
  }, [sendMessage, fpsStateRef, startMonitoring, videoVisualization]);

  /**
   * Sets up broadcaster's media (camera) and adds tracks to the peer connection
   */
  const setupBroadcasterMedia = useCallback(async (refs, stopStreaming) => {
    console.log('Requesting user media...');
    try {
      if (localStreamRef.current) {
        console.log('Reusing existing localStream');
        return localStreamRef.current;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }, 
        audio: false 
      });
      console.log('getUserMedia success!');
      
      // Use the videoVisualization service to handle the local stream
      if (videoVisualization) {
        videoVisualization.attachVideoStream(stream, true);
        // Set up canvas dimensions once video has metadata
        videoVisualization.videoRef.current.onloadedmetadata = () => {
          videoVisualization.setupCanvas();
        };
      } else if (refs.videoRef.current) {
        // Fallback to direct video element manipulation if visualization service not available
        refs.videoRef.current.srcObject = stream;
      }
      
      localStreamRef.current = stream;
      fpsStateRef.current.streamActive = true;

      // Start FPS calculation for broadcaster
      startMonitoring();
      
      return stream;
    } catch (err) {
      console.error('getUserMedia error:', err);
      alert('Could not access webcam. Please check permissions.');
      stopStreaming(); // Clean up if getUserMedia fails
      return null;
    }
  }, [videoVisualization, startMonitoring]);

  /**
   * Creates and sends an offer to a specific viewer
   * @param {string} targetId - ID of the target peer (viewer)
   * @param {Object} refs - Object containing references (videoRef, etc.)
   */
  const createAndSendOffer = useCallback(async (targetId, refs) => {
    console.log(`createAndSendOffer called for viewer: ${targetId}`);
    
    try {
      // Ensure we have a peer connection for this viewer
      let pc = peerConnectionsRef.current.get(targetId);
      
      if (!pc) {
        console.log(`No existing peer connection for ${targetId}, creating new one.`);
        // Create a new peer connection for this viewer
        pc = await createPeerConnection(true, refs, () => {
          console.log(`Connection cleanup for ${targetId}`);
        }, targetId);
        
        if (!pc) {
          console.error(`Failed to create peer connection for viewer ${targetId}`);
          return;
        }
      }
      
      // Create the offer
      const offer = await pc.createOffer({
        offerToReceiveVideo: false, // We only send, don't receive video from viewers
        offerToReceiveAudio: false
      });
      await pc.setLocalDescription(offer);
      console.log(`Offer created and local description set, sending to viewer: ${targetId}`);
      
      // Send the offer to the viewer
      sendMessage({ 
        type: 'offer', 
        offer, 
        target: targetId 
      });
    } catch (error) {
      console.error(`Error in createAndSendOffer for ${targetId}:`, error);
    }
  }, [sendMessage, createPeerConnection, setupBroadcasterMedia]);

  /**
   * Handles receiving and processing an offer from a remote peer
   * @param {RTCSessionDescription} offer - The received offer
   * @param {string} peerId - ID of the peer who sent the offer
   * @param {Object} refs - Object containing references (videoRef, etc.)
   */
  const handleReceivedOffer = useCallback(async (offer, peerId, refs) => {
    try {
      console.log(`Processing offer from broadcaster: ${peerId}`, offer);
      let pc = peerConnectionsRef.current.get(peerId);
      
      if (!pc) {
        console.log(`Creating new peer connection for broadcaster: ${peerId}`);
        // Pass the proper refs object to createPeerConnection
        pc = await createPeerConnection(false, refs, () => { 
          console.log('Viewer connection cleanup');
        }, peerId);
        
        if (!pc) {
          console.error(`Failed to create peer connection for broadcaster ${peerId}`);
          return;
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('Set remote description from offer');
      
      // Process any pending ICE candidates that arrived before the remote description
      if (pendingIceCandidatesRef.current.has(peerId)) {
        const pendingCandidates = pendingIceCandidatesRef.current.get(peerId);
        console.log(`Processing ${pendingCandidates.length} pending ICE candidates for ${peerId}`);
        
        for (const candidate of pendingCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log(`Added pending ICE candidate for ${peerId}`);
        }
        
        pendingIceCandidatesRef.current.delete(peerId);
      }
      
      const answer = await pc.createAnswer();
      console.log('Created answer:', answer);
      
      await pc.setLocalDescription(answer);
      console.log(`Set local description. Sending answer to broadcaster: ${peerId}`);
      
      sendMessage({ 
        type: 'answer', 
        answer, 
        target: peerId 
      });
    } catch (error) {
      console.error(`Error handling offer from ${peerId}:`, error);
    }
  }, [sendMessage, createPeerConnection]);

  /**
   * Handles receiving and processing an answer from a remote peer
   * @param {RTCSessionDescription} answer - The received answer
   * @param {string} peerId - ID of the peer who sent the answer
   */
  const handleReceivedAnswer = useCallback(async (answer, peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    
    if (!pc || pc.signalingState === 'closed') {
      console.warn(`Cannot handle answer: PeerConnection for ${peerId} is closed or not initialized`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log(`Set remote description (answer) for peer: ${peerId}`);
      
      // Process any pending ICE candidates that arrived before the remote description
      if (pendingIceCandidatesRef.current.has(peerId)) {
        const pendingCandidates = pendingIceCandidatesRef.current.get(peerId);
        console.log(`Processing ${pendingCandidates.length} pending ICE candidates for ${peerId}`);
        
        for (const candidate of pendingCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log(`Added pending ICE candidate for ${peerId}`);
        }
        
        pendingIceCandidatesRef.current.delete(peerId);
      }
    } catch (error) {
      console.error(`Error setting remote description (answer) for ${peerId}:`, error);
    }
  }, [fpsStateRef]);

  /**
   * Handles a received ICE candidate from a remote peer
   * @param {RTCIceCandidate} candidate - The received ICE candidate
   * @param {string} peerId - ID of the peer who sent the candidate
   */
  const handleReceivedCandidate = useCallback(async (candidate, peerId) => {
    try {
      console.log(`Received ICE candidate from ${peerId}:`, candidate);
      const pc = peerConnectionsRef.current.get(peerId);
      
      if (!pc) {
        console.warn(`No peer connection found for ${peerId} when receiving ICE candidate. Storing for later.`);
        return;
      }
      
      if (pc.signalingState === 'closed') {
        console.warn(`Cannot handle ICE candidate: PeerConnection for ${peerId} is closed`);
        return;
      }

      // If remote description isn't set yet, store the candidate for later
      if (pc.remoteDescription === null) {
        console.warn(`Cannot add ICE candidate yet: Remote description not set for ${peerId}. Storing for later.`);
        
        // Initialize array for this peer if not already done
        if (!pendingIceCandidatesRef.current.has(peerId)) {
          pendingIceCandidatesRef.current.set(peerId, []);
        }
        
        // Add this candidate to the pending list
        pendingIceCandidatesRef.current.get(peerId).push(candidate);
        return;
      }

      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`Successfully added ICE candidate for peer: ${peerId}`);
    } catch (error) {
      console.error(`Error adding received ICE candidate for ${peerId}:`, error);
    }
  }, []);

  /**
   * Handles notification of a viewer that disconnected
   * @param {string} viewerId - ID of the viewer who disconnected
   * @param {number} newViewerCount - Updated viewer count
   */
  const handleViewerDisconnected = useCallback((viewerId, newViewerCount) => {
    console.log(`Viewer disconnected: ${viewerId}, new count: ${newViewerCount}`);
    
    // Close and remove the peer connection for this viewer
    if (peerConnectionsRef.current.has(viewerId)) {
      const pc = peerConnectionsRef.current.get(viewerId);
      pc.close();
      peerConnectionsRef.current.delete(viewerId);
      console.log(`Closed peer connection for viewer: ${viewerId}`);
    }
    
    // Update viewer count
    setViewerCount(newViewerCount);
  }, []);

  /**
   * Updates the viewer count when new information is received
   * @param {number} count - The new viewer count
   */
  const updateViewerCount = useCallback((count) => {
    console.log(`Updating viewer count to: ${count}`);
    setViewerCount(count);
  }, []);

  /**
   * Cleans up all WebRTC resources
   */
  const cleanupConnection = useCallback(() => {
    // Stop local media tracks
    if (localStreamRef.current) {
      console.log("Stopping local video tracks.");
      localStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
          console.log(`Track ${track.id} (${track.kind}) stopped`);
        } catch (e) {
          console.error(`Error stopping track ${track.id}:`, e);
        }
      });
      
      // Important: set to null only after stopping all tracks
      localStreamRef.current = null;
    }

    // Close all peer connections
    if (peerConnectionsRef.current.size > 0) {
      console.log(`Closing ${peerConnectionsRef.current.size} peer connections.`);
      peerConnectionsRef.current.forEach((pc, peerId) => {
        console.log(`Closing peer connection for: ${peerId}`);
        
        // Remove all event handlers to prevent callbacks after cleanup
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        
        // Explicitly close the connection
        try {
          pc.close();
          console.log(`Connection ${peerId} closed successfully`);
        } catch (e) {
          console.error(`Error closing connection ${peerId}:`, e);
        }
      });
      
      // Clear the map after closing all connections
      peerConnectionsRef.current.clear();
      console.log("All peer connections cleared");
    }
    
    // Clear any pending ICE candidates
    pendingIceCandidatesRef.current.clear();
    
    // Reset viewer count
    setViewerCount(0);
    
    // Clean up visualization if the service is available
    if (videoVisualization) {
      videoVisualization.clearVisualization();
    }
  }, [videoVisualization]);

  return {
    peerConnectionsRef, // Export peerConnectionsRef instead of pcRef
    localStreamRef,
    viewerCount,
    createPeerConnection,
    createAndSendOffer,
    handleReceivedOffer,
    handleReceivedAnswer,
    handleReceivedCandidate,
    handleViewerDisconnected,
    updateViewerCount,
    cleanupConnection
  };
};

export default useWebRTCConnection;