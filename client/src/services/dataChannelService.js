import { useCallback, useRef, useState } from 'react';

/**
 * WebRTC Data Channel Service
 * Handles text chat and file sharing through WebRTC data channels
 */
export const useDataChannel = () => {
  // Store data channels in a map: peerId => RTCDataChannel
  const dataChannelsRef = useRef(new Map());
  
  // Message history
  const [messages, setMessages] = useState([]);
  
  // File transfer state
  const [fileTransfers, setFileTransfers] = useState([]);
  
  // Maximum file size for transfer (5MB)
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  
  /**
   * Adds a new message to the message history
   * @param {Object} message - Message object
   */
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, message]);
  }, []);

  /**
   * Handles a received file chunk
   * @param {ArrayBuffer} data - Binary file chunk data
   * @param {string} peerId - The ID of the sender
   */
  const handleFileChunk = useCallback((data, peerId) => {
    try {
      // Extract file ID from the first bytes
      const headerView = new Uint8Array(data, 0, 36); // 36 bytes for UUID
      const decoder = new TextDecoder();
      const fileId = decoder.decode(headerView);
      
      // Actual file data starts after the header
      const fileData = data.slice(36);
      
      // Update file transfer state
      setFileTransfers(prev => {
        const transfers = [...prev];
        const transferIndex = transfers.findIndex(t => t.id === fileId);
        
        if (transferIndex >= 0) {
          // Update existing transfer
          const transfer = transfers[transferIndex];
          
          // Add chunk to array
          transfer.chunks.push(fileData);
          
          // Update received size
          transfer.receivedSize += fileData.byteLength;
          
          // Calculate progress
          transfer.progress = Math.round((transfer.receivedSize / transfer.fileSize) * 100);
          
          // Check if transfer is complete
          if (transfer.receivedSize >= transfer.fileSize) {
            transfer.status = 'completed';
            
            // Combine chunks into a single file
            const completeFile = new Blob(transfer.chunks);
            transfer.fileUrl = URL.createObjectURL(completeFile);
            transfer.chunks = []; // Free memory
            
            // Notify about completed transfer
            addMessage({
              type: 'file',
              content: `File received: ${transfer.fileName}`,
              fileUrl: transfer.fileUrl,
              fileName: transfer.fileName,
              fileSize: transfer.fileSize,
              timestamp: new Date(),
              sender: transfer.sender,
              peerId: peerId
            });
          } else {
            transfer.status = 'receiving';
          }
        }
        
        return transfers;
      });
    } catch (error) {
      console.error('Error processing file chunk:', error);
    }
  }, [addMessage]);

  /**
   * Parses and handles data received through the data channel
   * @param {string|ArrayBuffer} data - The received data
   * @param {string} peerId - The ID of the sender
   */
  const handleReceivedData = useCallback((data, peerId) => {
    try {
      // Check if data is string or binary
      if (typeof data === 'string') {
        // Try to parse as JSON
        const parsedData = JSON.parse(data);
        
        // Handle different message types
        switch (parsedData.type) {
          case 'chat':
            // Handle text chat message
            addMessage({
              type: 'received',
              content: parsedData.content,
              timestamp: new Date(parsedData.timestamp),
              sender: parsedData.sender,
              peerId: peerId
            });
            break;
            
          case 'file-info':
            // Prepare for file transfer
            console.log(`File transfer starting: ${parsedData.fileName}`, parsedData);
            
            // Add new file transfer to state
            setFileTransfers(prev => [...prev, {
              id: parsedData.fileId,
              fileName: parsedData.fileName,
              fileSize: parsedData.fileSize,
              receivedSize: 0,
              progress: 0,
              status: 'starting',
              sender: parsedData.sender,
              timestamp: new Date(),
              peerId: peerId,
              chunks: []
            }]);
            
            // Notify about upcoming file
            addMessage({
              type: 'system',
              content: `${parsedData.sender} is sending file: ${parsedData.fileName} (${formatFileSize(parsedData.fileSize)})`,
              timestamp: new Date(),
              peerId: peerId
            });
            break;
            
          default:
            console.warn(`Unknown message type: ${parsedData.type}`);
        }
      } else {
        // Handle binary data (likely file chunks)
        handleFileChunk(data, peerId);
      }
    } catch (error) {
      console.error('Error processing received data:', error);
    }
  }, [addMessage, handleFileChunk]);

  /**
   * Sets up event handlers for a data channel
   * @param {RTCDataChannel} dataChannel - The WebRTC data channel
   * @param {string} peerId - The ID of the peer
   */
  const setupDataChannelEvents = useCallback((dataChannel, peerId) => {
    if (!dataChannel) return;
    
    dataChannel.onopen = () => {
      console.log(`Data channel with peer ${peerId} opened`);
      
      // Add system message
      addMessage({
        type: 'system',
        content: 'Chat connection established',
        timestamp: new Date(),
        peerId: peerId
      });
    };
    
    dataChannel.onclose = () => {
      console.log(`Data channel with peer ${peerId} closed`);
      
      // Add system message
      addMessage({
        type: 'system',
        content: 'Chat connection closed',
        timestamp: new Date(),
        peerId: peerId
      });
      
      // Clean up
      dataChannelsRef.current.delete(peerId);
    };
    
    dataChannel.onerror = (error) => {
      console.error(`Data channel error with peer ${peerId}:`, error);
      
      // Add error message
      addMessage({
        type: 'error',
        content: `Chat error: ${error.message || 'Unknown error'}`,
        timestamp: new Date(),
        peerId: peerId
      });
    };
    
    dataChannel.onmessage = (event) => {
      // Handle received data
      handleReceivedData(event.data, peerId);
    };
  }, [addMessage, handleReceivedData]);

  /**
   * Creates a data channel on an existing peer connection
   * @param {RTCPeerConnection} peerConnection - The WebRTC peer connection
   * @param {string} peerId - The ID of the peer
   * @param {boolean} isInitiator - Whether this peer initiated the connection
   * @returns {RTCDataChannel} The created data channel
   */
  const createDataChannel = useCallback((peerConnection, peerId, isInitiator) => {
    if (!peerConnection) {
      console.error('Cannot create data channel: No peer connection provided');
      return null;
    }
    
    try {
      let dataChannel;
      
      // If initiator (broadcaster), create the channel
      if (isInitiator) {
        console.log(`Creating data channel for peer: ${peerId}`);
        dataChannel = peerConnection.createDataChannel('chat', {
          ordered: true,
        });
        
        // Store the data channel
        dataChannelsRef.current.set(peerId, dataChannel);
        
        // Set up event handlers
        setupDataChannelEvents(dataChannel, peerId);
      } else {
        // For non-initiators (viewers), listen for the ondatachannel event
        console.log(`Setting up ondatachannel handler for peer: ${peerId}`);
        peerConnection.ondatachannel = (event) => {
          console.log(`Received data channel for peer: ${peerId}`, event.channel);
          dataChannel = event.channel;
          
          // Store the data channel
          dataChannelsRef.current.set(peerId, dataChannel);
          
          // Set up event handlers
          setupDataChannelEvents(dataChannel, peerId);
        };
      }
      
      return dataChannel;
    } catch (error) {
      console.error('Error creating data channel:', error);
      return null;
    }
  }, [setupDataChannelEvents]);

  /**
   * Updates the progress of a file transfer
   * @param {string} fileId - The ID of the file transfer
   * @param {number} sentSize - Number of bytes sent
   */
  const updateFileTransferProgress = useCallback((fileId, sentSize) => {
    setFileTransfers(prev => {
      const transfers = [...prev];
      const transferIndex = transfers.findIndex(t => t.id === fileId);
      
      if (transferIndex >= 0) {
        const transfer = transfers[transferIndex];
        transfer.sentSize = sentSize;
        transfer.progress = Math.round((sentSize / transfer.fileSize) * 100);
      }
      
      return transfers;
    });
  }, []);

  /**
   * Updates the status of a file transfer
   * @param {string} fileId - The ID of the file transfer
   * @param {string} status - The new status ('sending', 'completed', 'failed')
   */
  const updateFileTransferStatus = useCallback((fileId, status) => {
    setFileTransfers(prev => {
      const transfers = [...prev];
      const transferIndex = transfers.findIndex(t => t.id === fileId);
      
      if (transferIndex >= 0) {
        transfers[transferIndex].status = status;
      }
      
      return transfers;
    });
  }, []);

  /**
   * Formats a file size in bytes to a human-readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Formatted file size
   */
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  /**
   * Sends a text message to a specific peer
   * @param {string} peerId - The ID of the recipient
   * @param {string} content - Message content
   * @param {string} senderName - Name of the sender
   */
  const sendTextMessage = useCallback((peerId, content, senderName) => {
    const dataChannel = dataChannelsRef.current.get(peerId);
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error(`Cannot send message: Data channel for peer ${peerId} not open`);
      return false;
    }
    
    try {
      // Create message object
      const message = {
        type: 'chat',
        content: content,
        sender: senderName,
        timestamp: new Date().toISOString()
      };
      
      // Send as JSON string
      dataChannel.send(JSON.stringify(message));
      
      // Add to local message history
      addMessage({
        type: 'sent',
        content: content,
        timestamp: new Date(),
        sender: senderName,
        peerId: peerId
      });
      
      return true;
    } catch (error) {
      console.error('Error sending text message:', error);
      return false;
    }
  }, [addMessage]);

  /**
   * Sends a file to a specific peer
   * @param {string} peerId - The ID of the recipient
   * @param {File} file - The file to send
   * @param {string} senderName - Name of the sender
   */
  const sendFile = useCallback((peerId, file, senderName) => {
    const dataChannel = dataChannelsRef.current.get(peerId);
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.error(`Cannot send file: Data channel for peer ${peerId} not open`);
      return false;
    }
    
    // Check file size limit
    if (file.size > MAX_FILE_SIZE) {
      console.error(`File too large: ${formatFileSize(file.size)} exceeds limit of ${formatFileSize(MAX_FILE_SIZE)}`);
      addMessage({
        type: 'error',
        content: `File too large: ${formatFileSize(file.size)} exceeds limit of ${formatFileSize(MAX_FILE_SIZE)}`,
        timestamp: new Date(),
        peerId: peerId
      });
      return false;
    }
    
    try {
      // Generate file ID
      const fileId = crypto.randomUUID();
      
      // Send file information first
      const fileInfo = {
        type: 'file-info',
        fileId: fileId,
        fileName: file.name,
        fileSize: file.size,
        sender: senderName,
        timestamp: new Date().toISOString()
      };
      
      dataChannel.send(JSON.stringify(fileInfo));
      
      // Add to file transfers
      setFileTransfers(prev => [...prev, {
        id: fileId,
        fileName: file.name,
        fileSize: file.size,
        sentSize: 0,
        progress: 0,
        status: 'sending',
        recipient: peerId,
        timestamp: new Date()
      }]);
      
      // Notify about file transfer start
      addMessage({
        type: 'system',
        content: `Sending file: ${file.name} (${formatFileSize(file.size)})`,
        timestamp: new Date(),
        peerId: peerId
      });
      
      // Read and send the file in chunks
      const chunkSize = 16384; // 16KB chunks
      let offset = 0;
      
      const reader = new FileReader();
      
      reader.onload = (event) => {
        if (!dataChannel || dataChannel.readyState !== 'open') {
          console.error('Data channel closed during file transfer');
          updateFileTransferStatus(fileId, 'failed');
          return;
        }
        
        // Create header with file ID
        const encoder = new TextEncoder();
        const fileIdBytes = encoder.encode(fileId);
        
        // Combine header and file chunk
        const fileChunk = new Uint8Array(fileIdBytes.length + event.target.result.byteLength);
        fileChunk.set(fileIdBytes, 0);
        fileChunk.set(new Uint8Array(event.target.result), fileIdBytes.length);
        
        // Send chunk
        dataChannel.send(fileChunk.buffer);
        
        // Update progress
        offset += event.target.result.byteLength;
        
        // Update file transfer state
        updateFileTransferProgress(fileId, offset);
        
        // Continue with next chunk or finish
        if (offset < file.size) {
          readSlice(offset);
        } else {
          // Transfer complete
          updateFileTransferStatus(fileId, 'completed');
          
          // Notify about completed transfer
          addMessage({
            type: 'system',
            content: `File sent: ${file.name}`,
            timestamp: new Date(),
            peerId: peerId
          });
        }
      };
      
      reader.onerror = () => {
        console.error('Error reading file');
        updateFileTransferStatus(fileId, 'failed');
      };
      
      // Function to read a slice of the file
      const readSlice = (startByte) => {
        const slice = file.slice(startByte, startByte + chunkSize);
        reader.readAsArrayBuffer(slice);
      };
      
      // Start reading
      readSlice(0);
      return true;
    } catch (error) {
      console.error('Error sending file:', error);
      return false;
    }
  }, [addMessage, MAX_FILE_SIZE, updateFileTransferProgress, updateFileTransferStatus]);

  /**
   * Broadcasts a text message to all connected peers
   * @param {string} content - Message content
   * @param {string} senderName - Name of the sender
   */
  const broadcastTextMessage = useCallback((content, senderName) => {
    let successCount = 0;
    
    // Send to all peers
    dataChannelsRef.current.forEach((channel, peerId) => {
      if (sendTextMessage(peerId, content, senderName)) {
        successCount++;
      }
    });
    
    return successCount;
  }, [sendTextMessage]);

  /**
   * Cleans up all data channels
   */
  const cleanupDataChannels = useCallback(() => {
    // Close all data channels
    dataChannelsRef.current.forEach((channel, peerId) => {
      try {
        if (channel && channel.readyState !== 'closed') {
          channel.close();
        }
      } catch (error) {
        console.error(`Error closing data channel for peer ${peerId}:`, error);
      }
    });
    
    // Clear the map
    dataChannelsRef.current.clear();
    
    // Clear file transfers that are in progress
    setFileTransfers(prev => 
      prev.map(transfer => 
        transfer.status === 'sending' || transfer.status === 'receiving'
          ? { ...transfer, status: 'cancelled' }
          : transfer
      )
    );
  }, []);

  return {
    dataChannelsRef,
    messages,
    fileTransfers,
    createDataChannel,
    sendTextMessage,
    sendFile,
    broadcastTextMessage,
    cleanupDataChannels,
    MAX_FILE_SIZE,
    formatFileSize
  };
};

export default useDataChannel;