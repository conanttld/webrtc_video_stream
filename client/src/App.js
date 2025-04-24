import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

function App() {
  const [fps, setFps] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [applyBlur, setApplyBlur] = useState(false); // <-- Add state for blur
  const videoRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const rafRef = useRef(null); // For requestAnimationFrame ID
  const fpsStateRef = useRef({ // Ref to hold latest state for FPS calculation
    frameCount: 0,
    lastFrameTime: 0,
    lastFrameReceivedTime: 0,
    isCalculatingFPS: false,
    streamActive: false,
    myId: null
  });

  // Ensure state updates in ref for access in callbacks/loops
  useEffect(() => {
    fpsStateRef.current.streamActive = isBroadcasting || isViewing;
  }, [isBroadcasting, isViewing]);

  // --- Apply/Remove Blur Effect ---
  useEffect(() => {
    if (videoRef.current) {
      if (isViewing && applyBlur) {
        videoRef.current.classList.add('blur-background');
      } else {
        videoRef.current.classList.remove('blur-background');
      }
    }
  }, [isViewing, applyBlur]); // Re-run when viewing state or blur state changes

  // --- WebSocket Connection and Handling ---
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:8080`; // Assuming server runs on 8080
    console.log(`Connecting WebSocket to ${wsUrl}`);
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log("WebSocket connection established.");
      // Request ID or handle initial setup if needed
    };

    wsRef.current.onclose = (event) => {
      console.log(`WebSocket connection closed: Code=${event.code}, Reason=${event.reason}`);
      stopStreaming(); // Clean up on close
    };

    wsRef.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      stopStreaming(); // Clean up on error
    };

    wsRef.current.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("WebSocket message received:", msg);

        switch (msg.type) {
          case 'your-id':
            fpsStateRef.current.myId = msg.id;
            console.log("Received my ID from server:", msg.id);
            break;

          case 'viewer': // Received by broadcaster
            console.log("Broadcaster received 'viewer' request from:", msg.from);
            if (pcRef.current) {
              fpsStateRef.current.myId = msg.from; // Store target viewer's ID
              try {
                const offer = await pcRef.current.createOffer();
                await pcRef.current.setLocalDescription(offer);
                console.log("Broadcaster sending offer to viewer:", msg.from);
                sendMessage({ type: 'offer', offer, target: msg.from });
              } catch (error) {
                console.error("Error creating/sending offer:", error);
              }
            } else {
              console.error("Broadcaster PC not initialized when viewer connected.");
            }
            break;

          case 'offer': // Received by viewer
            console.log("Viewer received 'offer' from:", msg.from);
            fpsStateRef.current.myId = msg.from; // Store broadcaster's ID
            if (!pcRef.current) {
              createPeerConnection(false); // Create viewer PC
            }
            if (pcRef.current) {
              try {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.offer));
                const answer = await pcRef.current.createAnswer();
                await pcRef.current.setLocalDescription(answer);
                console.log("Viewer sending answer to broadcaster:", msg.from);
                sendMessage({ type: 'answer', answer, target: msg.from });
              } catch (error) {
                console.error("Error handling offer:", error);
              }
            } else {
                 console.error("Viewer PC could not be initialized for offer.");
            }
            break;

          case 'answer': // Received by broadcaster
            console.log("Broadcaster received 'answer' from:", msg.from);
            if (pcRef.current && pcRef.current.signalingState !== 'closed') {
              try {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.answer));
                console.log("Broadcaster set remote description (answer).");
              } catch (error) {
                console.error("Error setting remote description (answer):", error);
              }
            } else {
              console.warn("Received answer but PC is closed or doesn't exist.");
            }
            break;

          case 'candidate': // Received by both
            console.log("Received ICE candidate from:", msg.from);
            if (pcRef.current && pcRef.current.signalingState !== 'closed') {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
                console.log("Added ICE candidate.");
              } catch (e) {
                console.error('Error adding received ICE candidate', e);
              }
            } else {
              console.warn("Received ICE candidate but PC is closed or doesn't exist.");
            }
            break;

          case 'stop': // Received by viewer when broadcaster stops
            console.log("Received 'stop' signal.");
            stopStreaming(); // Stop video on the receiver side
            break;

          default:
            console.log("Unknown message type:", msg.type);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message or handle:", error);
      }
    };

    // Cleanup function
    return () => {
      console.log("Cleaning up WebSocket connection.");
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopStreaming(); // Ensure cleanup on component unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Helper to send WebSocket messages ---
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error("WebSocket is not open. Cannot send message:", message);
    }
  }, []);

  // --- FPS Calculation ---
  const calculateFPS = useCallback(() => {
    if (!fpsStateRef.current.streamActive || !fpsStateRef.current.isCalculatingFPS) {
      setFps(0);
      fpsStateRef.current.isCalculatingFPS = false;
      rafRef.current = null;
      return;
    }

    const currentTime = performance.now();
    const deltaTime = currentTime - fpsStateRef.current.lastFrameTime;
    fpsStateRef.current.frameCount++;

    if (deltaTime >= 1000) {
      const calculatedFps = (fpsStateRef.current.frameCount / deltaTime) * 1000;
      setFps(Math.round(calculatedFps));
      fpsStateRef.current.frameCount = 0;
      fpsStateRef.current.lastFrameTime = currentTime;
    }

    rafRef.current = requestAnimationFrame(calculateFPS);
  }, []); // No dependencies needed as it uses refs and setFps

  // --- Peer Connection Setup ---
  const createPeerConnection = useCallback(async (isBroadcaster) => {
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
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
      }

      // Start FPS calculation for the VIEWER
      if (!isBroadcaster) {
        console.log("Viewer received track. Starting FPS calculation.");
        if (!fpsStateRef.current.isCalculatingFPS) {
          fpsStateRef.current.streamActive = true; // Redundant? Set by isViewing
          fpsStateRef.current.isCalculatingFPS = true;
          fpsStateRef.current.frameCount = 0;
          fpsStateRef.current.lastFrameTime = performance.now();
          fpsStateRef.current.lastFrameReceivedTime = performance.now(); // Initialize
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(calculateFPS);
        }
      }
    };

    pcRef.current.onconnectionstatechange = () => {
        if (pcRef.current) {
            console.log("PeerConnection state:", pcRef.current.connectionState);
            if (pcRef.current.connectionState === 'disconnected' || pcRef.current.connectionState === 'failed' || pcRef.current.connectionState === 'closed') {
                console.log("PeerConnection disconnected/failed/closed. Cleaning up.");
                stopStreaming();
            }
        }
    };

    if (isBroadcaster) {
      console.log('Requesting user media...');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        console.log('getUserMedia success!');
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        localStreamRef.current = stream;
        fpsStateRef.current.streamActive = true; // Set via setIsBroadcasting

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
        if (!fpsStateRef.current.isCalculatingFPS) {
          console.log('Starting FPS calculation for broadcaster...');
          fpsStateRef.current.isCalculatingFPS = true;
          fpsStateRef.current.frameCount = 0;
          fpsStateRef.current.lastFrameTime = performance.now();
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(calculateFPS);
        }
      } catch (err) {
        console.error('getUserMedia error:', err);
        alert('Could not access webcam. Please check permissions.');
        stopStreaming(); // Clean up if getUserMedia fails
      }
    }
  }, [sendMessage, calculateFPS]); // Dependencies

  // --- Control Functions ---
  const startBroadcasting = useCallback(() => {
    if (isBroadcasting || isViewing) return; // Prevent starting if already active
    console.log("Start Broadcasting clicked.");
    setIsBroadcasting(true);
    setIsViewing(false);
    sendMessage({ type: 'broadcaster' });
    createPeerConnection(true);
  }, [isBroadcasting, isViewing, sendMessage, createPeerConnection]);

  const startViewing = useCallback(() => {
    if (isBroadcasting || isViewing) return; // Prevent starting if already active
    console.log("Start Viewing clicked.");
    setIsBroadcasting(false);
    setIsViewing(true);
    // PeerConnection is created when the 'offer' arrives
    sendMessage({ type: 'viewer' });
  }, [isBroadcasting, isViewing, sendMessage]);

  const stopStreaming = useCallback(() => {
    console.log("Stop Streaming called.");

    // Send stop signal if broadcasting
    if (isBroadcasting && fpsStateRef.current.myId) {
      console.log("Sending 'stop' signal to peer:", fpsStateRef.current.myId);
      sendMessage({ type: 'stop', target: fpsStateRef.current.myId });
    } else if (isBroadcasting) {
        console.warn("Stop clicked (broadcaster), but no peer ID known.");
        // Consider a general stop message if server supports broadcast
        // sendMessage({ type: 'stop' });
    }

    fpsStateRef.current.streamActive = false;
    fpsStateRef.current.isCalculatingFPS = false;
    fpsStateRef.current.myId = null; // Clear peer ID
    setIsBroadcasting(false);
    setIsViewing(false);
    setFps(0);
    setApplyBlur(false); // Reset blur on stop

    // Cancel FPS calculation loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      console.log("Cancelled requestAnimationFrame.");
    }

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

    // Clear video display
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.classList.remove('blur-background'); // Ensure class is removed
    }

    console.log("Stream stopped and resources cleaned up.");
  }, [isBroadcasting, sendMessage]); // Dependencies

  // --- Render ---
  return (
    <div className="App">
      <h1>WebRTC Webcam Stream</h1>
      <div className="controls">
        <button onClick={startBroadcasting} disabled={isBroadcasting || isViewing}>
          Start Broadcasting
        </button>
        <button onClick={startViewing} disabled={isBroadcasting || isViewing}>
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
                onChange={(e) => setApplyBlur(e.target.checked)}
              />
              Apply Background Blur
            </label>
          </div>
        )}
      </div>
      <div className="video-container">
        <video ref={videoRef} id="video" autoPlay playsInline muted={isBroadcasting}></video>
        {/* Mute if broadcasting to prevent echo, unmute if viewing */}
      </div>
      <div id="fps-display">FPS: {fps}</div>
    </div>
  );
}

export default App;
