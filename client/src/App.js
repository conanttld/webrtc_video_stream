import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import useUIState from './services/uiStateService';
import useFPSMonitor from './services/fpsMonitorService';
import useBodyPixSegmentation from './services/bodyPixService';
import useWebRTCConnection from './services/webrtcService';
import useWebSocketCommunication from './services/websocketService';
import { useVideoVisualization } from './services/videoVisualizationService';
import useDataChannel from './services/dataChannelService';
import ChatComponent from './components/ChatComponent';
import './App.css';

function App() {
  // Refs for DOM elements
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  
  // User display name for chat
  const [username, setUsername] = useState(`User-${Math.floor(Math.random() * 1000)}`);

  // Initialize the Video Visualization Service
  const videoVisualization = useVideoVisualization();

  // Use the UI State Management Service with videoVisualization
  const {
    fps,
    setFps,
    isBroadcasting,
    isViewing,
    applyBlur,
    // setApplyBlur is not used directly, but through toggleBlur
    isSegmentationReady,
    setIsSegmentationReady,
    connectionStatus,
    setConnectionStatus,
    cleanupInProgressRef,
    startBroadcasting: uiStartBroadcasting,
    startViewing: uiStartViewing,
    stopStreaming: uiStopStreaming,
    toggleBlur
  } = useUIState(videoVisualization);

  // Use the FPS Monitoring Service
  const {
    startMonitoring,
    stopMonitoring,
    setPeerId,
    rafRef,
    fpsStateRef,
    resetFPSCount // New function to reset FPS count
  } = useFPSMonitor(setFps);

  // Use the BodyPix Segmentation Service with videoVisualization
  const {
    segmentationRafRef,
    startBackgroundBlur,
    stopBackgroundBlur
  } = useBodyPixSegmentation(setIsSegmentationReady, videoVisualization);

  // Use the WebSocket Communication Service
  const {
    wsRef,
    // wsRetryTimeoutRef is not used directly
    sendMessage,
    initializeWebSocketConnection
  } = useWebSocketCommunication(setConnectionStatus, cleanupInProgressRef);

  // Use the DataChannel Service for chat functionality
  const dataChannelService = useDataChannel();

  // Create a refs object to pass to services using useMemo to prevent recreation on every render
  const refs = useMemo(() => ({
    videoRef,
    canvasRef,
    wsRef,
    rafRef,
    segmentationRafRef
  }), [videoRef, canvasRef, wsRef, rafRef, segmentationRafRef]);

  // Create a state object to pass to services using useMemo
  const state = useMemo(() => ({
    fpsStateRef
  }), [fpsStateRef]);

  // Message handler for WebSocket messages - define this before WebRTC service
  // This handler is no longer used directly, as we use fullMessageHandler instead
  // Using useRef to avoid dependency issues with fullMessageHandler
  const handleWebSocketMessageRef = useRef((msg) => {
    console.log("Received message:", msg.type);
    
    switch (msg.type) {
      case 'your-id':
        setPeerId(msg.id);
        console.log("Received my ID from server:", msg.id);
        break;
        
      case 'viewer': // Other message handlers will be handled after WebRTC service is defined
        // We'll update this handler after WebRTC service is defined
        break;
        
      default:
        // Don't process other message types here - will be handled after setup
        break;
    }
  });

  // Update the handler when setPeerId changes
  useEffect(() => {
    handleWebSocketMessageRef.current = (msg) => {
      if (msg.type === 'your-id') {
        setPeerId(msg.id);
        console.log("Received my ID from server:", msg.id);
      }
    };
  }, [setPeerId]);

  // Use the WebRTC Connection Service with videoVisualization and dataChannelService
  const {
    peerConnectionsRef, // Now using map of connections instead of single pcRef
    localStreamRef,
    viewerCount, // New state for tracking number of viewers
    createPeerConnection,
    createAndSendOffer,
    handleReceivedOffer,
    handleReceivedAnswer,
    handleReceivedCandidate,
    handleViewerDisconnected, // New function to handle viewer disconnection
    updateViewerCount, // New function to update viewer count
    cleanupConnection
  } = useWebRTCConnection(sendMessage, fpsStateRef, startMonitoring, videoVisualization, dataChannelService);

  // Update refs object with WebRTC refs
  refs.peerConnectionsRef = peerConnectionsRef;
  refs.localStreamRef = localStreamRef;

  // Define stopStreaming before it's used in createPeerConnection
  const stopStreaming = useCallback(() => {
    stopMonitoring(); // Stop FPS monitoring
    stopBackgroundBlur(); // Stop background blur without passing refs
    cleanupConnection(); // Clean up WebRTC connection
    uiStopStreaming(sendMessage, refs, state);
  }, [uiStopStreaming, sendMessage, refs, state, stopMonitoring, stopBackgroundBlur, cleanupConnection]);

  // Enhanced message handler that uses WebRTC functions
  const fullMessageHandler = useCallback((msg) => {
    console.log("Received message:", msg.type);
    
    switch (msg.type) {
      case 'your-id':
        setPeerId(msg.id);
        console.log("Received my ID from server:", msg.id);
        break;
        
      case 'viewer': // Received by broadcaster
        console.log("Broadcaster received 'viewer' request from:", msg.from);
        // Pass the viewer ID and refs object to create a connection for this specific viewer
        createAndSendOffer(msg.from, refs);
        break;
        
      case 'offer': // Received by viewer
        console.log("Viewer received 'offer' from:", msg.from);
        setPeerId(msg.from); // Store broadcaster's ID
        
        // Handle the offer - refs passed to allow proper video setup
        handleReceivedOffer(msg.offer, msg.from, refs);
        break;
        
      case 'answer': // Received by broadcaster
        console.log("Broadcaster received 'answer' from:", msg.from);
        handleReceivedAnswer(msg.answer, msg.from);
        break;
        
      case 'candidate': // Received by both
        console.log("Received ICE candidate from:", msg.from);
        handleReceivedCandidate(msg.candidate, msg.from);
        break;
        
      case 'stop': // Received by viewer when broadcaster stops
        console.log("Received 'stop' signal.");
        stopStreaming(); // Stop video on the receiver side
        break;
        
      case 'viewer-disconnected': // New message type - received by broadcaster when viewer disconnects
        console.log(`Viewer disconnected: ${msg.viewerId}, new count: ${msg.viewerCount}`);
        handleViewerDisconnected(msg.viewerId, msg.viewerCount);
        break;
        
      case 'viewer-count': // New message type - received when viewer count changes
        console.log(`Updating viewer count to: ${msg.count}`);
        updateViewerCount(msg.count);
        break;
        
      default:
        console.log("Unknown message type:", msg.type);
    }
  }, [setPeerId, createAndSendOffer, refs, handleReceivedOffer, handleReceivedAnswer, handleReceivedCandidate, stopStreaming, handleViewerDisconnected, updateViewerCount]);

  // Initialize WebSocket connection once on component mount
  useEffect(() => {
    // Initialize the WebSocket connection with the message handler
    initializeWebSocketConnection(fullMessageHandler);
    
    // Capture the current websocket reference for cleanup
    const currentWs = wsRef.current;
    
    // Return a cleanup function
    return () => {
      console.log("App component unmounting, performing cleanup");
      if (currentWs) {
        console.log("Cleaning up WebSocket connection...");
      }
    };
  }, [initializeWebSocketConnection, fullMessageHandler, wsRef]);

  // --- Apply/Remove Blur Effect (controls segmentation) ---
  useEffect(() => {
    // Initialize video elements when they're available
    if (videoRef.current && canvasRef.current) {
      videoVisualization.initializeVideoElements(videoRef.current, canvasRef.current);
    }
  }, [videoVisualization]);

  // Updated effect for blur handling
  useEffect(() => {
    if (!isViewing || !videoVisualization.videoStreamActiveRef.current) return;

    if (applyBlur && isSegmentationReady) {
      // Use the bodyPixService with the visualization service
      startBackgroundBlur();
    } else {
      stopBackgroundBlur();
    }

    // Cleanup function
    return () => {
      stopBackgroundBlur();
    };
  }, [isViewing, applyBlur, isSegmentationReady, startBackgroundBlur, stopBackgroundBlur, videoVisualization]);

  // Wrapper for startBroadcasting
  const startBroadcasting = useCallback(async () => {
    // For broadcaster, create the initial peer connection without a specific viewer ID
    await createPeerConnection(true, refs, stopStreaming);
    uiStartBroadcasting(sendMessage, () => {}); // Pass empty function since we already created connection
  }, [uiStartBroadcasting, sendMessage, createPeerConnection, refs, stopStreaming]);

  // Wrapper for startViewing
  const startViewing = useCallback(() => {
    uiStartViewing(sendMessage);
  }, [uiStartViewing, sendMessage]);

  // Handle blur toggle
  const handleBlurToggle = useCallback((e) => {
    toggleBlur(e.target.checked, { 
      startBackgroundBlur, 
      stopBackgroundBlur,
      resetFPSCount // Pass the resetFPSCount function to reset FPS when blur state changes
    });
  }, [toggleBlur, startBackgroundBlur, stopBackgroundBlur, resetFPSCount]);

  // Handle username change
  const handleUsernameChange = useCallback((e) => {
    setUsername(e.target.value);
  }, []);

  // --- Render ---
  return (
    <div className="App">
      <h1>WebRTC Webcam Stream with BodyPix Segmentation</h1>
      
      {/* Connection Status Indicator */}
      <div className="connection-status-container">
        <span className={`connection-status status-${connectionStatus}`}>
          {connectionStatus === 'connected' && 'Connected to server'}
          {connectionStatus === 'connecting' && 'Connecting to server...'}
          {connectionStatus === 'disconnected' && 'Disconnected from server'}
          {connectionStatus === 'error' && 'Connection error'}
        </span>
      </div>
      
      {/* Username input */}
      <div className="username-container">
        <label htmlFor="username">Your Name: </label>
        <input
          type="text"
          id="username"
          value={username}
          onChange={handleUsernameChange}
          placeholder="Enter your name"
          disabled={isBroadcasting || isViewing}
        />
      </div>
      
      <div className="controls">
        <button onClick={startBroadcasting} disabled={isBroadcasting || isViewing || connectionStatus !== 'connected'}>
          Start Broadcasting
        </button>
        <button onClick={startViewing} disabled={isBroadcasting || isViewing || connectionStatus !== 'connected'}>
          Start Viewing
        </button>
        {/* Show stop button only when broadcasting or viewing */}
        {(isBroadcasting || isViewing) && (
          <button onClick={stopStreaming}>Stop</button>
        )}
        {/* Add Checkbox for Blur - only show when viewing */}
        {isViewing && (
          <div className="blur-control">
            <label>
              <input
                type="checkbox"
                checked={applyBlur}
                onChange={handleBlurToggle}
              />
              Apply Background Blur (BodyPix)
            </label>
          </div>
        )}
        {/* Display viewer count for broadcaster */}
        {isBroadcasting && (
          <div className="viewer-count">
            Viewers: {viewerCount}
          </div>
        )}
      </div>
      <div className={`video-container ${isViewing ? 'viewing-mode' : ''}`}>
        <video ref={videoRef} id="video" autoPlay playsInline muted={isBroadcasting}></video>
        <canvas ref={canvasRef} id="canvas" className="hidden"></canvas>
      </div>
      <div id="fps-display">FPS: {fps}</div>
      
      {/* Chat Component */}
      {(isBroadcasting || isViewing) && (
        <ChatComponent
          messages={dataChannelService.messages}
          dataChannelService={dataChannelService}
          isActive={isBroadcasting || isViewing}
          peerId={isBroadcasting ? null : fpsStateRef.current.myId}
          username={username}
        />
      )}
    </div>
  );
}

export default App;
