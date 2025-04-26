import { useEffect, useRef, useCallback } from 'react';
import * as bodyPix from '@tensorflow-models/body-pix';
import * as tf from '@tensorflow/tfjs';

/**
 * BodyPix Segmentation Service
 * Handles loading and using the BodyPix model for background segmentation
 */
export const useBodyPixSegmentation = (setIsSegmentationReady) => {
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
   * Segmentation loop for processing video frames with BodyPix
   */
  const segmentationLoop = useCallback((videoRef, canvasRef) => {
    if (!bodyPixModelRef.current || !videoRef.current || !canvasRef.current) {
      segmentationRafRef.current = requestAnimationFrame(() => segmentationLoop(videoRef, canvasRef));
      return;
    }

    // Ensure video has data
    if (videoRef.current.readyState < 2) {
      segmentationRafRef.current = requestAnimationFrame(() => segmentationLoop(videoRef, canvasRef));
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
      segmentationRafRef.current = requestAnimationFrame(() => segmentationLoop(videoRef, canvasRef));
    };

    processSegmentation();
  }, []);

  /**
   * Start the background blur processing
   */
  const startBackgroundBlur = useCallback((videoRef, canvasRef) => {
    console.log("Starting background blur processing...");
    
    // Hide original video, show processed canvas
    if (videoRef.current && canvasRef.current) {
      videoRef.current.classList.add('hidden');
      canvasRef.current.classList.remove('hidden');
    }

    // Start the segmentation loop
    if (segmentationRafRef.current) {
      cancelAnimationFrame(segmentationRafRef.current);
    }
    segmentationRafRef.current = requestAnimationFrame(() => segmentationLoop(videoRef, canvasRef));
  }, [segmentationLoop]);

  /**
   * Stop the background blur processing
   */
  const stopBackgroundBlur = useCallback((videoRef, canvasRef) => {
    console.log("Stopping background blur processing...");
    
    // Stop the segmentation loop if running
    if (segmentationRafRef.current) {
      cancelAnimationFrame(segmentationRafRef.current);
      segmentationRafRef.current = null;
    }
    
    // Show original video stream
    if (videoRef.current && canvasRef.current) {
      videoRef.current.classList.remove('hidden');
      canvasRef.current.classList.add('hidden');
      
      // Clear canvas when hidden
      const canvasCtx = canvasRef.current.getContext('2d');
      if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
  }, []);

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