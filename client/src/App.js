import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as tf from '@tensorflow/tfjs';
import './App.css';

function App() {
  const [fps, setFps] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [applyBlur, setApplyBlur] = useState(false);
  const [isSegmentationReady, setIsSegmentationReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // New state for connection status
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const rafRef = useRef(null);
  const segmentationRafRef = useRef(null);
  const bodyPixModelRef = useRef(null);
  const modelLoadingPromiseRef = useRef(null); // Ref to track model loading promise
  const cleanupInProgressRef = useRef(false); // Ref to prevent multiple cleanup calls
  const wsRetryTimeoutRef = useRef(null); // Ref for retry timeout
  const fpsStateRef = useRef({
    frameCount: 0,
    lastFrameTime: 0,
    lastFrameReceivedTime: 0,
    isCalculatingFPS: false,
    streamActive: false,
    myId: null
  });

  // --- Initialize BodyPix Model ---
  useEffect(() => {
    let isMounted = true;

    const loadBodyPixModel = async () => {
      // If already loading, return the existing promise
      if (modelLoadingPromiseRef.current) {
        return modelLoadingPromiseRef.current;
      }
      
      try {
        console.log("Loading BodyPix model...");
        // Set backend to WebGL for better performance
        await tf.setBackend('webgl');
        
        // Store the promise to prevent duplicate loading
        modelLoadingPromiseRef.current = bodyPix.load({
          architecture: 'MobileNetV1',
          outputStride: 16,
          multiplier: 0.75,
          quantBytes: 2
        });
        
        const model = await modelLoadingPromiseRef.current;
        
        if (isMounted) {
          bodyPixModelRef.current = model;
          setIsSegmentationReady(true);
          console.log("BodyPix model loaded and ready");
        }
        return model;
      } catch (error) {
        console.error("Failed to load BodyPix model:", error);
        if (isMounted) {
          setIsSegmentationReady(false);
        }
        // Clear the promise reference on error
        modelLoadingPromiseRef.current = null;
        throw error;
      }
    };

    loadBodyPixModel();

    return () => {
      isMounted = false;
      // TensorFlow.js handles cleanup of its own resources
      setIsSegmentationReady(false);
      console.log("Cleaning up BodyPix model");
    };
  }, []);

  // Rest of the component remains the same until WebSocket connection
  // ...existing code...

  const segmentationLoop = useCallback(() => {
    if (!bodyPixModelRef.current || !videoRef.current || !canvasRef.current) {
      segmentationRafRef.current = requestAnimationFrame(segmentationLoop);
      return;
    }

    // Ensure video has data
    if (videoRef.current.readyState < 2) {
      segmentationRafRef.current = requestAnimationFrame(segmentationLoop);
      return;
    }

    const processSegmentation = async () => {
      try {
        // Segment the person from the video
        const segmentation = await bodyPixModelRef.current.segmentPerson(videoRef.current, {
          flipHorizontal: false,
          internalResolution: 'medium',
          segmentationThreshold: 0.7
        });

        // Get canvas context and make sure dimensions match video
        const ctx = canvasRef.current.getContext('2d');
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        
        if (canvasRef.current.width !== videoWidth || canvasRef.current.height !== videoHeight) {
          canvasRef.current.width = videoWidth;
          canvasRef.current.height = videoHeight;
        }

        // Draw original video to canvas first
        ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
        
        // Get the original frame as ImageData
        const originalFrame = ctx.getImageData(0, 0, videoWidth, videoHeight);
        
        // Create a blurred version using a temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoWidth;
        tempCanvas.height = videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
        tempCtx.filter = 'blur(8px)';
        tempCtx.drawImage(tempCanvas, 0, 0, videoWidth, videoHeight);
        
        // Get the blurred frame
        const blurredFrame = tempCtx.getImageData(0, 0, videoWidth, videoHeight);
        
        // Create final composite frame
        const compositeFrame = new ImageData(
          new Uint8ClampedArray(originalFrame.data),
          videoWidth,
          videoHeight
        );
        
        // Replace background pixels with blurred pixels
        for (let i = 0; i < segmentation.data.length; i++) {
          // If pixel is not part of person (0), use the blurred pixel
          if (segmentation.data[i] === 0) {
            const pixelIndex = i * 4;
            compositeFrame.data[pixelIndex] = blurredFrame.data[pixelIndex];         // R
            compositeFrame.data[pixelIndex + 1] = blurredFrame.data[pixelIndex + 1]; // G
            compositeFrame.data[pixelIndex + 2] = blurredFrame.data[pixelIndex + 2]; // B
            // Keep original alpha
          }
        }
        
        // Put the composite frame back to the main canvas
        ctx.putImageData(compositeFrame, 0, 0);
        
      } catch (error) {
        console.error("Error in segmentation processing:", error);
      }

      // Continue loop
      segmentationRafRef.current = requestAnimationFrame(segmentationLoop);
    };

    processSegmentation();
  }, []);

  // --- Apply/Remove Blur Effect (controls segmentation) ---
  useEffect(() => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;

    if (!videoElement || !canvasElement) return;

    if (isViewing && applyBlur && isSegmentationReady) {
      console.log("Showing processed stream with background blur...");
      // Hide original video, show processed canvas
      videoElement.classList.add('hidden');
      canvasElement.classList.remove('hidden');

      // Start the segmentation loop
      if (segmentationRafRef.current) {
        cancelAnimationFrame(segmentationRafRef.current);
      }
      segmentationRafRef.current = requestAnimationFrame(segmentationLoop);

    } else {
      // Stop the segmentation loop if running
      if (segmentationRafRef.current) {
        console.log("Stopping segmentation processing.");
        cancelAnimationFrame(segmentationRafRef.current);
        segmentationRafRef.current = null;
      }
      
      // Show original video stream
      console.log("Showing original video stream...");
      videoElement.classList.remove('hidden');
      canvasElement.classList.add('hidden');
      
      // Clear canvas when hidden
      const canvasCtx = canvasElement.getContext('2d');
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      }
    }

    // Cleanup function
    return () => {
      if (segmentationRafRef.current) {
        cancelAnimationFrame(segmentationRafRef.current);
        segmentationRafRef.current = null;
      }
      if (videoElement && canvasElement) {
        videoElement.classList.remove('hidden');
        canvasElement.classList.add('hidden');
      }
    };
  }, [isViewing, applyBlur, isSegmentationReady, segmentationLoop]);

  // --- WebSocket Connection with Retry Logic ---
  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 5;
    const baseRetryDelay = 1000; // Start with 1 second delay
    let isMounted = true; // Track component mount state to prevent setState on unmounted component
    
    // Clear any existing retry timeout
    if (wsRetryTimeoutRef.current) {
      clearTimeout(wsRetryTimeoutRef.current);
      wsRetryTimeoutRef.current = null;
    }

    // Check server status before connecting WebSocket
    const checkServerAndConnect = async () => {
      if (!isMounted) return; // Skip if component unmounted
      
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname === '' ? 'localhost' : window.location.hostname; // Fix for when hostname is empty in local development
        
        // Connect WebSocket directly without status check (more reliable)
        const wsUrl = `${wsProtocol}//${wsHost}:8080`;
        console.log(`Connecting WebSocket to ${wsUrl} (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Close existing connection if any
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        
        // Create new WebSocket connection
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          if (!isMounted) return;
          console.log("WebSocket connection established.");
          setConnectionStatus('connected');
          retryCount = 0; // Reset retry count on success
        };
        
        ws.onclose = (event) => {
          if (!isMounted) return;
          console.log(`WebSocket connection closed: Code=${event.code}, Reason=${event.reason}`);
          setConnectionStatus('disconnected');
          
          // Don't retry if we deliberately closed the connection (code 1000) or during cleanup
          if (event.code !== 1000 && !cleanupInProgressRef.current && isMounted) {
            if (retryCount < maxRetries) {
              retryCount++;
              const retryDelay = baseRetryDelay * Math.pow(1.5, retryCount);
              console.log(`Retrying connection in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
              wsRetryTimeoutRef.current = setTimeout(checkServerAndConnect, retryDelay);
            } else {
              console.log("Max retries reached. Stopping connection attempts.");
              // Don't call stopStreaming here, just log the failure
            }
          } else {
            console.log("WebSocket was closed normally or during cleanup, not retrying.");
          }
        };
        
        ws.onerror = (error) => {
          if (!isMounted) return;
          console.error("WebSocket error:", error);
          setConnectionStatus('error');
          // No need to handle error further - onclose will be called after onerror
        };
        
        ws.onmessage = async (event) => {
          if (!isMounted) return;
          
          try {
            const msg = JSON.parse(event.data);
            console.log("Received message:", msg.type);
            
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
      } catch (error) {
        if (!isMounted) return;
        
        console.error("Error in WebSocket connection setup:", error);
        if (retryCount < maxRetries) {
          retryCount++;
          const retryDelay = baseRetryDelay * Math.pow(1.5, retryCount);
          console.log(`Error connecting, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
          wsRetryTimeoutRef.current = setTimeout(checkServerAndConnect, retryDelay);
        } else {
          console.log("Max retries reached. Stopping connection attempts.");
          // Don't call stopStreaming here as it may cause cascading issues
        }
      }
    };
    
    // Start the connection process
    checkServerAndConnect();
    
    // Cleanup function
    return () => {
      console.log("Cleaning up WebSocket connection on unmount.");
      isMounted = false; // Mark component as unmounted
      
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
        wsRetryTimeoutRef.current = null;
      }
      
      if (wsRef.current) {
        // Only attempt to close if in OPEN or CONNECTING state
        if (wsRef.current.readyState === WebSocket.OPEN || 
            wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close(1000, "Component unmounted");
        }
        wsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Helper to send WebSocket messages ---
  const sendMessage = useCallback((message) => {
    if (!wsRef.current) {
      console.warn("Cannot send message: WebSocket not initialized", message);
      return false;
    }

    if (wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
        return false;
      }
    } else {
      console.warn(`WebSocket not ready (state: ${
        wsRef.current.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
        wsRef.current.readyState === WebSocket.CLOSING ? 'CLOSING' :
        wsRef.current.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN'
      }). Message not sent:`, message);
      return false;
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

  // --- Enhanced Stop Streaming Function ---
  const stopStreaming = useCallback(() => {
    // Return early if cleanup is already in progress
    if (cleanupInProgressRef.current) {
      console.log("Cleanup already in progress, ignoring duplicate stopStreaming call.");
      return;
    }
    
    // Set cleanup flag to prevent multiple simultaneous cleanup attempts
    cleanupInProgressRef.current = true;
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
    setApplyBlur(false);

    // Stop segmentation loop explicitly if running
    if (segmentationRafRef.current) {
      cancelAnimationFrame(segmentationRafRef.current);
      segmentationRafRef.current = null;
    }

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

    // Clear video display and ensure canvas is hidden
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.classList.remove('hidden');
    }
    if (canvasRef.current) {
      canvasRef.current.classList.add('hidden');
      const canvasCtx = canvasRef.current.getContext('2d');
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    console.log("Stream stopped and resources cleaned up.");
    
    // Reset cleanup flag when done
    cleanupInProgressRef.current = false;
  }, [isBroadcasting, sendMessage]);

  // --- Render ---
  return (
    <div className="App">
      <h1>WebRTC Webcam Stream with BodyPix Segmentation</h1>
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
              Apply Background Blur (BodyPix)
            </label>
          </div>
        )}
      </div>
      <div className="video-container">
        <video ref={videoRef} id="video" autoPlay playsInline muted={isBroadcasting}></video>
        <canvas ref={canvasRef} id="canvas" className="hidden"></canvas>
      </div>
      <div id="fps-display">FPS: {fps}</div>
    </div>
  );
}

export default App;
