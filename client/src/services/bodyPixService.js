import { useEffect, useRef, useCallback } from 'react';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as tf from '@tensorflow/tfjs';

/**
 * BodyPix Segmentation Service
 * Handles loading and using the BodyPix model for background segmentation
 */
export const useBodyPixSegmentation = (setIsSegmentationReady, videoVisualization) => {
  // Refs for BodyPix
  const bodyPixModelRef = useRef(null);
  const modelLoadingPromiseRef = useRef(null);
  const segmentationRafRef = useRef(null);

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
  }, [setIsSegmentationReady]);

  /**
   * Determines if an element is being mirrored via CSS
   * @param {HTMLElement} element - HTML element to check
   * @returns {boolean} - Whether the element is mirrored
   */
  const isElementMirrored = (element) => {
    if (!element) return false;
    
    // Check applied styles, including from CSS classes
    const computedStyle = window.getComputedStyle(element);
    const transform = computedStyle.transform || computedStyle.webkitTransform;
    
    // Check for scaleX(-1) in the computed transform
    return transform.includes('matrix(-1') || transform.includes('scaleX(-1)');
  };

  /**
   * Segmentation loop for processing video frames with BodyPix
   */
  const segmentationLoop = useCallback(() => {
    // Use videoVisualization service if available, otherwise fall back to direct refs
    const videoRef = videoVisualization ? videoVisualization.videoRef : null;
    const canvasRef = videoVisualization ? videoVisualization.canvasRef : null;
    
    if (!bodyPixModelRef.current || !videoRef?.current || !canvasRef?.current) {
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
        // Check if video is mirrored via CSS
        const shouldMirror = isElementMirrored(videoRef.current);
        
        // Segment the person from the video
        // Note: We don't use flipHorizontal here as we'll handle mirroring at the drawing stage
        const segmentation = await bodyPixModelRef.current.segmentPerson(videoRef.current, {
          flipHorizontal: false, // Don't flip during segmentation
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

        // Clear the canvas first
        ctx.clearRect(0, 0, videoWidth, videoHeight);
        
        // Create a temporary canvas for our blurred background
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoWidth;
        tempCanvas.height = videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw and blur on the temp canvas first
        if (shouldMirror) {
          tempCtx.save();
          tempCtx.scale(-1, 1);
          tempCtx.translate(-videoWidth, 0);
          tempCtx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
          tempCtx.restore();
        } else {
          tempCtx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
        }
        
        // Apply blur effect
        tempCtx.filter = 'blur(8px)';
        tempCtx.drawImage(tempCanvas, 0, 0, videoWidth, videoHeight);
        
        // Get the blurred frame
        const blurredFrame = tempCtx.getImageData(0, 0, videoWidth, videoHeight);
        
        // Now draw the original frame to our main canvas with correct mirroring if needed
        if (shouldMirror) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-videoWidth, 0);
          ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
          ctx.restore();
        } else {
          ctx.drawImage(videoRef.current, 0, 0, videoWidth, videoHeight);
        }
        
        // Get the original frame
        const originalFrame = ctx.getImageData(0, 0, videoWidth, videoHeight);
        
        // Create the composite frame
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
  }, [videoVisualization]);

  /**
   * Start the background blur processing
   */
  const startBackgroundBlur = useCallback(() => {
    console.log("Starting background blur processing...");
    
    // Use videoVisualization service if available
    if (videoVisualization) {
      // Switch to blur visualization mode
      videoVisualization.setVisualizationMode('blur');
    } else {
      console.error("No videoVisualization service available");
    }

    // Start the segmentation loop
    if (segmentationRafRef.current) {
      cancelAnimationFrame(segmentationRafRef.current);
    }
    segmentationRafRef.current = requestAnimationFrame(segmentationLoop);
  }, [segmentationLoop, videoVisualization]);

  /**
   * Stop the background blur processing
   */
  const stopBackgroundBlur = useCallback(() => {
    console.log("Stopping background blur processing...");
    
    // Stop the segmentation loop if running
    if (segmentationRafRef.current) {
      cancelAnimationFrame(segmentationRafRef.current);
      segmentationRafRef.current = null;
    }
    
    // Use videoVisualization service if available
    if (videoVisualization) {
      // Switch back to raw video visualization mode
      videoVisualization.setVisualizationMode('raw');
    }
  }, [videoVisualization]);

  return {
    bodyPixModelRef,
    modelLoadingPromiseRef,
    segmentationRafRef,
    segmentationLoop,
    startBackgroundBlur,
    stopBackgroundBlur
  };
};

export default useBodyPixSegmentation;