import { useState, useCallback, useRef } from 'react';

/**
 * UI State Management Service
 * Manages all UI-related state for the video streaming application
 */
export const useUIState = (videoVisualization) => {
  // UI-related state
  const [fps, setFps] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [applyBlur, setApplyBlur] = useState(false);
  const [isSegmentationReady, setIsSegmentationReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  
  // Flag to prevent multiple cleanup calls
  const cleanupInProgressRef = useRef(false);

  /**
   * Starts broadcasting mode
   * @param {Function} sendMessage - Function to send WebSocket messages
   * @param {Function} createPeerConnection - Function to create a WebRTC peer connection
   */
  const startBroadcasting = useCallback((sendMessage, createPeerConnection) => {
    if (isBroadcasting || isViewing) return; // Prevent starting if already active
    console.log("Start Broadcasting clicked.");
    setIsBroadcasting(true);
    setIsViewing(false);
    sendMessage({ type: 'broadcaster' });
    createPeerConnection(true);
  }, [isBroadcasting, isViewing]);

  /**
   * Starts viewing mode
   * @param {Function} sendMessage - Function to send WebSocket messages
   */
  const startViewing = useCallback((sendMessage) => {
    if (isBroadcasting || isViewing) return; // Prevent starting if already active
    console.log("Start Viewing clicked.");
    setIsBroadcasting(false);
    setIsViewing(true);
    // PeerConnection is created when the 'offer' arrives
    sendMessage({ type: 'viewer' });
  }, [isBroadcasting, isViewing]);

  /**
   * Stops streaming (both broadcasting and viewing)
   * @param {Function} sendMessage - Function to send WebSocket messages
   * @param {Object} refs - Object containing references (segmentationRafRef, rafRef, localStreamRef, peerConnectionsRef, videoRef, canvasRef)
   * @param {Object} state - Object containing state (fpsStateRef)
   */
  const stopStreaming = useCallback((sendMessage, refs, state) => {
    // Return early if cleanup is already in progress
    if (cleanupInProgressRef.current) {
      console.log("Cleanup already in progress, ignoring duplicate stopStreaming call.");
      return;
    }
    
    // Set cleanup flag to prevent multiple simultaneous cleanup attempts
    cleanupInProgressRef.current = true;
    console.log("Stop Streaming called.");

    // Send stop signal if broadcasting
    if (isBroadcasting && state.fpsStateRef.current.myId) {
      console.log("Sending 'stop' signal to peer:", state.fpsStateRef.current.myId);
      sendMessage({ type: 'stop', target: state.fpsStateRef.current.myId });
    } else if (isBroadcasting) {
      console.warn("Stop clicked (broadcaster), but no peer ID known.");
      // Consider a general stop message if server supports broadcast
      // sendMessage({ type: 'stop' });
    }

    state.fpsStateRef.current.streamActive = false;
    state.fpsStateRef.current.isCalculatingFPS = false;
    state.fpsStateRef.current.myId = null; // Clear peer ID
    setIsBroadcasting(false);
    setIsViewing(false);
    setFps(0);
    setApplyBlur(false);

    // Stop segmentation loop explicitly if running
    if (refs.segmentationRafRef && refs.segmentationRafRef.current) {
      cancelAnimationFrame(refs.segmentationRafRef.current);
      refs.segmentationRafRef.current = null;
    }

    // Cancel FPS calculation loop
    if (refs.rafRef && refs.rafRef.current) {
      cancelAnimationFrame(refs.rafRef.current);
      refs.rafRef.current = null;
      console.log("Cancelled requestAnimationFrame.");
    }

    // Use videoVisualization service if available
    if (videoVisualization) {
      videoVisualization.clearVisualization();
    } else {
      // Legacy direct DOM manipulation
      // Stop local media tracks
      if (refs.localStreamRef && refs.localStreamRef.current) {
        console.log("Stopping local video tracks.");
        refs.localStreamRef.current.getTracks().forEach(track => track.stop());
        refs.localStreamRef.current = null;
      }

      // Clear video display and ensure canvas is hidden
      if (refs.videoRef && refs.videoRef.current) {
        refs.videoRef.current.srcObject = null;
        refs.videoRef.current.classList.remove('hidden');
      }
      if (refs.canvasRef && refs.canvasRef.current) {
        refs.canvasRef.current.classList.add('hidden');
        const canvasCtx = refs.canvasRef.current.getContext('2d');
        if (canvasCtx) {
          canvasCtx.clearRect(0, 0, refs.canvasRef.current.width, refs.canvasRef.current.height);
        }
      }
    }

    // Close PeerConnection
    if (refs.pcRef && refs.pcRef.current) {
      console.log("Closing PeerConnection.");
      refs.pcRef.current.onicecandidate = null;
      refs.pcRef.current.ontrack = null;
      refs.pcRef.current.onconnectionstatechange = null;
      refs.pcRef.current.close();
      refs.pcRef.current = null;
    }
    // Handle multiple peer connections (for multi-viewer setup)
    else if (refs.peerConnectionsRef && refs.peerConnectionsRef.current) {
      console.log("Closing all peer connections.");
      // The actual cleanup is handled by the webrtcService's cleanupConnection function
    }

    console.log("Stream stopped and resources cleaned up.");
    
    // Reset cleanup flag when done
    cleanupInProgressRef.current = false;
  }, [isBroadcasting, videoVisualization]);

  /**
   * Toggle background blur effect
   * @param {boolean} value - New blur state (optional - if not provided, will toggle current state)
   */
  const toggleBlur = useCallback((value, bodyPixService) => {
    const newValue = value !== undefined ? value : !applyBlur;
    setApplyBlur(newValue);
    
    // Apply/remove blur effect using provided service
    if (bodyPixService) {
      if (newValue) {
        bodyPixService.startBackgroundBlur();
      } else {
        bodyPixService.stopBackgroundBlur();
      }
    }
    
    console.log(`Background blur ${newValue ? 'enabled' : 'disabled'}`);
  }, [applyBlur]);

  return {
    // States
    fps,
    setFps,
    isBroadcasting,
    setIsBroadcasting,
    isViewing,
    setIsViewing,
    applyBlur,
    setApplyBlur,
    isSegmentationReady,
    setIsSegmentationReady,
    connectionStatus,
    setConnectionStatus,
    cleanupInProgressRef,
    
    // Actions
    startBroadcasting,
    startViewing,
    stopStreaming,
    toggleBlur
  };
};

export default useUIState;