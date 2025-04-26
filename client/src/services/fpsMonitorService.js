import { useCallback, useRef } from 'react';

/**
 * FPS Monitoring Service
 * Handles calculating and tracking frames per second in video streams
 */
export const useFPSMonitor = (setFps) => {
  // Refs for FPS calculation state
  const rafRef = useRef(null);
  const fpsStateRef = useRef({
    frameCount: 0,
    lastFrameTime: 0,
    lastFrameReceivedTime: 0,
    isCalculatingFPS: false,
    streamActive: false,
    myId: null
  });

  /**
   * Calculates FPS using requestAnimationFrame
   */
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
  }, [setFps]);

  /**
   * Starts FPS monitoring
   * @param {boolean} isBroadcaster - Whether the current client is broadcasting
   */
  const startMonitoring = useCallback(() => {
    console.log('Starting FPS calculation...');
    fpsStateRef.current.streamActive = true;
    fpsStateRef.current.isCalculatingFPS = true;
    fpsStateRef.current.frameCount = 0;
    fpsStateRef.current.lastFrameTime = performance.now();
    fpsStateRef.current.lastFrameReceivedTime = performance.now();
    
    // Cancel existing animation frame if any
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    // Start the FPS calculation loop
    rafRef.current = requestAnimationFrame(calculateFPS);
  }, [calculateFPS]);

  /**
   * Stops FPS monitoring
   */
  const stopMonitoring = useCallback(() => {
    console.log('Stopping FPS calculation.');
    fpsStateRef.current.streamActive = false;
    fpsStateRef.current.isCalculatingFPS = false;
    
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    
    setFps(0);
  }, [setFps]);

  /**
   * Set or clear the peer ID
   * @param {string|null} id - The peer ID or null to clear
   */
  const setPeerId = useCallback((id) => {
    fpsStateRef.current.myId = id;
  }, []);

  return {
    calculateFPS,
    startMonitoring,
    stopMonitoring,
    setPeerId,
    rafRef,
    fpsStateRef
  };
};

export default useFPSMonitor;