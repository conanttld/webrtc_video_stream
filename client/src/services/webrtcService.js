import { useCallback, useRef } from 'react';

/**
 * WebRTC Peer Connection Service
 * Handles WebRTC peer connection setup, track management, and connection state
 */
export const useWebRTCConnection = (sendMessage, fpsStateRef, startMonitoring) => {
  // WebRTC-related refs
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);

  /**
   * Creates a new RTCPeerConnection and sets up event handlers
   * @param {boolean} isBroadcaster - Whether the client is the broadcaster
   * @param {Object} refs - Object containing references (videoRef)
   * @param {Function} stopStreaming - Function to call when connection is closed or fails
   */
  const createPeerConnection = useCallback(async (isBroadcaster, refs, stopStreaming) => {
    if (pcRef.current) {
      console.log("Closing existing PeerConnection");
      pcRef.current.close();
    }
    
    console.log("Creating new PeerConnection. isBroadcaster:", isBroadcaster);
    pcRef.current = new RTCPeerConnection();

    pcRef.current.onicecandidate = ({ candidate }) => {
      if (candidate && fpsStateRef.current.myId) { // Ensure we have a target ID
        console.log("Sending ICE candidate to:", fpsStateRef.current.myId);
        sendMessage({ type: 'candidate', candidate, target: fpsStateRef.current.myId });
      } else if (candidate) {
        console.warn("No target ID found for ICE candidate.");
      }
    };

    pcRef.current.ontrack = (event) => {
      console.log("pc.ontrack event received.");
      if (refs.videoRef.current) {
        refs.videoRef.current.srcObject = event.streams[0];
      }

      // Start FPS calculation for the VIEWER
      if (!isBroadcaster) {
        console.log("Viewer received track. Starting FPS calculation.");
        startMonitoring();
      }
    };

    pcRef.current.onconnectionstatechange = () => {
      if (pcRef.current) {
        console.log("PeerConnection state:", pcRef.current.connectionState);
        if (pcRef.current.connectionState === 'disconnected' || 
            pcRef.current.connectionState === 'failed' || 
            pcRef.current.connectionState === 'closed') {
          console.log("PeerConnection disconnected/failed/closed. Cleaning up.");
          stopStreaming();
        }
      }
    };

    if (isBroadcaster) {
      await setupBroadcasterMedia(refs, stopStreaming);
    }

    return pcRef.current;
  }, [sendMessage, fpsStateRef, startMonitoring]);

  /**
   * Sets up broadcaster's media (camera) and adds tracks to the peer connection
   */
  const setupBroadcasterMedia = useCallback(async (refs, stopStreaming) => {
    console.log('Requesting user media...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      console.log('getUserMedia success!');
      
      if (refs.videoRef.current) {
        refs.videoRef.current.srcObject = stream;
      }
      
      localStreamRef.current = stream;
      fpsStateRef.current.streamActive = true; // Set via startMonitoring

      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        try {
          if (pcRef.current) {
            pcRef.current.addTrack(track, stream);
          }
        } catch (error) {
          console.error("Error adding track:", error);
        }
      });

      // Start FPS calculation for broadcaster
      startMonitoring();
    } catch (err) {
      console.error('getUserMedia error:', err);
      alert('Could not access webcam. Please check permissions.');
      stopStreaming(); // Clean up if getUserMedia fails
    }
  }, [startMonitoring]);

  /**
   * Handles the creation and sending of an offer to a remote peer
   * @param {string} targetId - ID of the target peer
   */
  const createAndSendOffer = useCallback(async (targetId) => {
    if (!pcRef.current) {
      console.error("Cannot create offer: PeerConnection not initialized");
      return;
    }

    try {
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      console.log("Sending offer to:", targetId);
      sendMessage({ type: 'offer', offer, target: targetId });
    } catch (error) {
      console.error("Error creating or sending offer:", error);
    }
  }, [sendMessage]);

  /**
   * Handles receiving and processing an offer from a remote peer
   * @param {RTCSessionDescription} offer - The received offer
   * @param {string} peerId - ID of the peer who sent the offer
   */
  const handleReceivedOffer = useCallback(async (offer, peerId) => {
    if (!pcRef.current) {
      console.error("Cannot handle offer: PeerConnection not initialized");
      return;
    }

    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      console.log("Sending answer to:", peerId);
      sendMessage({ type: 'answer', answer, target: peerId });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  }, [sendMessage]);

  /**
   * Handles receiving and processing an answer from a remote peer
   * @param {RTCSessionDescription} answer - The received answer
   */
  const handleReceivedAnswer = useCallback(async (answer) => {
    if (!pcRef.current || pcRef.current.signalingState === 'closed') {
      console.warn("Cannot handle answer: PeerConnection is closed or not initialized");
      return;
    }

    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("Set remote description (answer).");
    } catch (error) {
      console.error("Error setting remote description (answer):", error);
    }
  }, []);

  /**
   * Handles a received ICE candidate from a remote peer
   * @param {RTCIceCandidate} candidate - The received ICE candidate
   */
  const handleReceivedCandidate = useCallback(async (candidate) => {
    if (!pcRef.current || pcRef.current.signalingState === 'closed') {
      console.warn("Cannot handle ICE candidate: PeerConnection is closed or not initialized");
      return;
    }

    try {
      await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("Added ICE candidate.");
    } catch (error) {
      console.error('Error adding received ICE candidate', error);
    }
  }, []);

  /**
   * Cleans up all WebRTC resources
   */
  const cleanupConnection = useCallback(() => {
    // Stop local media tracks
    if (localStreamRef.current) {
      console.log("Stopping local video tracks.");
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // Close PeerConnection
    if (pcRef.current) {
      console.log("Closing PeerConnection.");
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  return {
    pcRef,
    localStreamRef,
    createPeerConnection,
    createAndSendOffer,
    handleReceivedOffer,
    handleReceivedAnswer,
    handleReceivedCandidate,
    cleanupConnection
  };
};

export default useWebRTCConnection;