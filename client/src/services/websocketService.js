import { useEffect, useRef, useCallback } from 'react';

/**
 * WebSocket Communication Service
 * Handles WebSocket connection management, message sending, and reconnection logic
 */
export const useWebSocketCommunication = (setConnectionStatus, cleanupInProgressRef) => {
  // WebSocket-related refs
  const wsRef = useRef(null);
  const wsRetryTimeoutRef = useRef(null);
  const isMountedRef = useRef(true); // Track mounted state to prevent state updates after unmount
  const connectionAttemptedRef = useRef(false); // Prevent multiple connection attempts

  /**
   * Sends a message over the WebSocket connection
   * @param {Object} message - The message object to send
   * @returns {boolean} - Whether the message was sent successfully
   */
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

  /**
   * Establishes WebSocket connection with retry logic
   * @param {Function} handleMessage - Callback function to handle received messages
   */
  const initializeWebSocketConnection = useCallback((handleMessage) => {
    // Only attempt to connect if not already attempted and component is still mounted
    if (connectionAttemptedRef.current || !isMountedRef.current) {
      return;
    }
    
    // Mark that a connection attempt has been made
    connectionAttemptedRef.current = true;
    
    let retryCount = 0;
    const maxRetries = 5;
    const baseRetryDelay = 1000; // Start with 1 second delay
    
    // Set initial status to connecting
    setConnectionStatus('connecting');
    
    // Clear any existing retry timeout
    if (wsRetryTimeoutRef.current) {
      clearTimeout(wsRetryTimeoutRef.current);
      wsRetryTimeoutRef.current = null;
    }

    // Check server status before connecting WebSocket
    const checkServerAndConnect = async () => {
      if (!isMountedRef.current) return; // Skip if component unmounted
      
      try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname === '' ? 'localhost' : window.location.hostname; // Fix for when hostname is empty in local development
        
        // Connect WebSocket directly without status check (more reliable)
        const wsUrl = `${wsProtocol}//${wsHost}:8080`;
        console.log(`Connecting WebSocket to ${wsUrl} (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Close existing connection if any
        if (wsRef.current) {
          console.log("Closing existing WebSocket connection before creating a new one");
          wsRef.current.onclose = null; // Remove close handler to prevent reconnection loop
          wsRef.current.close();
          wsRef.current = null;
        }
        
        // Create new WebSocket connection
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          if (!isMountedRef.current) return;
          console.log("WebSocket connection established.");
          setConnectionStatus('connected');
          retryCount = 0; // Reset retry count on success
        };
        
        ws.onclose = (event) => {
          if (!isMountedRef.current) return;
          console.log(`WebSocket connection closed: Code=${event.code}, Reason=${event.reason}`);
          
          // Don't update status or retry if we're in cleanup
          if (cleanupInProgressRef.current) {
            console.log("Cleanup in progress, not updating status or retrying");
            return;
          }
          
          setConnectionStatus('disconnected');
          
          // Don't retry if we deliberately closed the connection (code 1000) or during cleanup
          if (event.code !== 1000 && !cleanupInProgressRef.current && isMountedRef.current) {
            if (retryCount < maxRetries) {
              retryCount++;
              const retryDelay = baseRetryDelay * Math.pow(1.5, retryCount);
              console.log(`Retrying connection in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
              setConnectionStatus('connecting');
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
          if (!isMountedRef.current) return;
          console.error("WebSocket error:", error);
          // Only set error state if not in cleanup
          if (!cleanupInProgressRef.current) {
            setConnectionStatus('error');
          }
          // No need to handle error further - onclose will be called after onerror
        };
        
        ws.onmessage = async (event) => {
          if (!isMountedRef.current) return;
          
          try {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };
      } catch (error) {
        if (!isMountedRef.current) return;
        
        console.error("Error in WebSocket connection setup:", error);
        
        // Only update status if not in cleanup
        if (!cleanupInProgressRef.current) {
          setConnectionStatus('error');
        }
        
        if (retryCount < maxRetries && !cleanupInProgressRef.current) {
          retryCount++;
          const retryDelay = baseRetryDelay * Math.pow(1.5, retryCount);
          console.log(`Error connecting, retrying in ${retryDelay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
          setConnectionStatus('connecting');
          wsRetryTimeoutRef.current = setTimeout(checkServerAndConnect, retryDelay);
        } else {
          console.log("Max retries reached. Stopping connection attempts.");
          // Don't call stopStreaming here as it may cause cascading issues
        }
      }
    };
    
    // Start the connection process
    checkServerAndConnect();
  }, [setConnectionStatus, cleanupInProgressRef]);

  // Set up component mount/unmount handling
  useEffect(() => {
    isMountedRef.current = true;
    connectionAttemptedRef.current = false;
    
    // Return cleanup function for component unmount
    return () => {
      console.log("Component unmounting, cleaning up WebSocket");
      isMountedRef.current = false;
      
      if (wsRetryTimeoutRef.current) {
        clearTimeout(wsRetryTimeoutRef.current);
        wsRetryTimeoutRef.current = null;
      }
      
      if (wsRef.current) {
        // Remove all event handlers first to prevent reconnection attempts
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        
        // Only attempt to close if in OPEN or CONNECTING state
        if (wsRef.current.readyState === WebSocket.OPEN || 
            wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close(1000, "Component unmounted");
        }
        wsRef.current = null;
      }
    };
  }, []);

  return {
    wsRef,
    wsRetryTimeoutRef,
    sendMessage,
    initializeWebSocketConnection
  };
};

export default useWebSocketCommunication;