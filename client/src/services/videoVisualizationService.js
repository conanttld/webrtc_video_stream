import { useRef, useCallback, useEffect } from 'react';

/**
 * Video Visualization Service
 * Manages and unifies the state and control of video and canvas visualization
 * Ensures proper display of video streams received through WebRTC
 */
export const useVideoVisualization = () => {
  // Refs for video elements
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const videoStreamActiveRef = useRef(false);
  const visualizationModeRef = useRef('raw'); // 'raw', 'blur', or any future visualization modes

  /**
   * Initializes video and canvas elements with proper settings
   * @param {HTMLVideoElement} videoElement - The video element to initialize
   * @param {HTMLCanvasElement} canvasElement - The canvas element to initialize
   */
  const initializeVideoElements = useCallback((videoElement, canvasElement) => {
    if (videoElement && canvasElement) {
      videoRef.current = videoElement;
      canvasRef.current = canvasElement;
      
      // Set up video element
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      videoElement.muted = true;
      
      console.log("Video visualization elements initialized");
    }
  }, []);

  /**
   * Handles video stream attachment to video element
   * @param {MediaStream} stream - The media stream to attach
   * @param {boolean} isLocalStream - Whether this is a local camera stream or remote stream
   */
  const attachVideoStream = useCallback((stream, isLocalStream = false) => {
    if (!videoRef.current) {
      console.error("Cannot attach stream: video element not initialized");
      return false;
    }
    
    try {
      videoRef.current.srcObject = stream;
      videoStreamActiveRef.current = true;
      
      // Auto-play the video
      videoRef.current.play().catch(err => {
        console.error("Error auto-playing video:", err);
        // Try again with user interaction
        videoRef.current.oncanplay = () => {
          videoRef.current.play().catch(e => console.error("Second play attempt failed:", e));
        };
      });
      
      // Make sure the video is visible (not hidden)
      videoRef.current.classList.remove('hidden');
      
      // Configure mirror effect for local streams
      if (isLocalStream) {
        videoRef.current.style.transform = 'scaleX(-1)';
      } else {
        videoRef.current.style.transform = '';
      }
      
      console.log(`${isLocalStream ? 'Local' : 'Remote'} video stream attached successfully`);
      return true;
    } catch (error) {
      console.error("Error attaching video stream:", error);
      return false;
    }
  }, []);

  /**
   * Sets up canvas dimensions to match the video
   */
  const setupCanvas = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    
    if (videoWidth && videoHeight) {
      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;
      console.log(`Canvas dimensions set to match video: ${videoWidth}x${videoHeight}`);
    } else {
      console.warn("Video dimensions not available yet");
    }
  }, []);

  /**
   * Switches between raw video and processed canvas visualization
   * @param {string} mode - Visualization mode ('raw' or 'blur')
   */
  const setVisualizationMode = useCallback((mode) => {
    if (!videoRef.current || !canvasRef.current) {
      console.error("Cannot set visualization mode: elements not initialized");
      return;
    }
    
    visualizationModeRef.current = mode;
    
    if (mode === 'raw') {
      videoRef.current.classList.remove('hidden');
      canvasRef.current.classList.add('hidden');
      console.log("Visualization mode set to raw video");
    } else if (mode === 'blur') {
      // The actual blur processing is handled by bodyPixService
      // This just handles the visibility of elements
      videoRef.current.classList.add('hidden');
      canvasRef.current.classList.remove('hidden');
      console.log("Visualization mode set to processed canvas (blur)");
    }
  }, []);

  /**
   * Gets the current video frame as an ImageData object
   * @returns {ImageData|null} - The current video frame or null if not available
   */
  const getCurrentVideoFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !videoStreamActiveRef.current) {
      return null;
    }
    
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    
    if (!videoWidth || !videoHeight) {
      return null;
    }
    
    // Use a temporary canvas to get the image data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoWidth;
    tempCanvas.height = videoHeight;
    
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
    
    return ctx.getImageData(0, 0, videoWidth, videoHeight);
  }, []);

  /**
   * Renders data to the canvas
   * @param {ImageData} imageData - The image data to render
   */
  const renderToCanvas = useCallback((imageData) => {
    if (!canvasRef.current) {
      console.error("Cannot render to canvas: canvas element not initialized");
      return;
    }
    
    const ctx = canvasRef.current.getContext('2d');
    if (ctx && imageData) {
      ctx.putImageData(imageData, 0, 0);
    }
  }, []);

  /**
   * Clears all video visualization resources
   */
  const clearVisualization = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.classList.remove('hidden');
      videoRef.current.style.transform = '';
    }
    
    if (canvasRef.current) {
      canvasRef.current.classList.add('hidden');
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    videoStreamActiveRef.current = false;
    visualizationModeRef.current = 'raw';
    console.log("Video visualization cleared");
  }, []);

  /**
   * Check if video is ready and playing
   * @returns {boolean} - Whether the video is ready and active
   */
  const isVideoReady = useCallback(() => {
    return (
      videoRef.current && 
      videoRef.current.readyState >= 2 && 
      videoStreamActiveRef.current
    );
  }, []);

  return {
    videoRef,
    canvasRef,
    videoStreamActiveRef,
    visualizationModeRef,
    initializeVideoElements,
    attachVideoStream,
    setupCanvas,
    setVisualizationMode,
    getCurrentVideoFrame,
    renderToCanvas,
    clearVisualization,
    isVideoReady
  };
};

export default useVideoVisualization;