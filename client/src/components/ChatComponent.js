import React, { useState, useRef, useEffect } from 'react';
import './ChatComponent.css';

const ChatComponent = ({ messages, dataChannelService, isActive, peerId, username }) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Default username if not provided
  const effectiveUsername = username || 'User';
  
  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);
  
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim() || !isActive) return;
    
    if (peerId) {
      // Send to specific peer
      dataChannelService.sendTextMessage(peerId, inputMessage, effectiveUsername);
    } else {
      // Broadcast to all connected peers
      dataChannelService.broadcastTextMessage(inputMessage, effectiveUsername);
    }
    
    setInputMessage('');
  };
  
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
  };
  
  const handleFileSend = () => {
    if (!selectedFile || !isActive) return;
    
    if (selectedFile.size > dataChannelService.MAX_FILE_SIZE) {
      alert(`File is too large. Maximum allowed size is ${dataChannelService.formatFileSize(dataChannelService.MAX_FILE_SIZE)}`);
      return;
    }
    
    if (peerId) {
      // Send to specific peer
      dataChannelService.sendFile(peerId, selectedFile, effectiveUsername);
    } else {
      // Broadcast is not supported for files as they're too large
      alert('File sharing requires a direct peer connection');
    }
    
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleCancelFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const renderMessage = (message, index) => {
    switch (message.type) {
      case 'sent':
        return (
          <div key={index} className="chat-message sent">
            <div className="message-content">
              <div className="message-text">
                {message.content}
              </div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );
        
      case 'received':
        return (
          <div key={index} className="chat-message received">
            <div className="sender-name">{message.sender}</div>
            <div className="message-content">
              <div className="message-text">
                {message.content}
              </div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );
        
      case 'system':
        return (
          <div key={index} className="chat-message system">
            <div className="message-content">
              <div className="message-text">
                {message.content}
              </div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );
        
      case 'error':
        return (
          <div key={index} className="chat-message error">
            <div className="message-content">
              <div className="message-text">
                {message.content}
              </div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );
        
      case 'file':
        return (
          <div key={index} className="chat-message file">
            <div className="sender-name">{message.sender}</div>
            <div className="message-content">
              <div className="message-text">
                <div className="file-message">
                  <span className="file-icon">📁</span>
                  <a 
                    href={message.fileUrl} 
                    download={message.fileName}
                    className="file-link"
                  >
                    {message.fileName} ({dataChannelService.formatFileSize(message.fileSize)})
                  </a>
                </div>
              </div>
              <div className="message-time">{formatTime(message.timestamp)}</div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <div className={`chat-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div className="chat-header" onClick={toggleExpand}>
        <span>Chat</span>
        <button className="toggle-btn">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>
      
      {isExpanded && (
        <>
          <div className="messages-container">
            {messages.length > 0 ? (
              messages.map((message, index) => renderMessage(message, index))
            ) : (
              <div className="no-messages">
                {isActive ? 'No messages yet. Start the conversation!' : 'Connect to start chatting'}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="chat-controls">
            {selectedFile ? (
              <div className="selected-file">
                <span className="file-name">{selectedFile.name} ({dataChannelService.formatFileSize(selectedFile.size)})</span>
                <button 
                  onClick={handleFileSend} 
                  disabled={!isActive || selectedFile.size > dataChannelService.MAX_FILE_SIZE}
                  className="send-file-btn"
                >
                  Send
                </button>
                <button onClick={handleCancelFile} className="cancel-file-btn">
                  Cancel
                </button>
              </div>
            ) : (
              <form className="input-area" onSubmit={handleSendMessage}>
                <input 
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={isActive ? "Type a message..." : "Connect to chat..."}
                  disabled={!isActive}
                  className="message-input"
                />
                <button 
                  type="submit" 
                  disabled={!inputMessage.trim() || !isActive}
                  className="send-btn"
                >
                  Send
                </button>
                <label className="file-btn" disabled={!isActive}>
                  <span>📎</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    disabled={!isActive}
                    style={{ display: 'none' }}
                  />
                </label>
              </form>
            )}
          </div>
          
          {dataChannelService.fileTransfers.length > 0 && (
            <div className="file-transfers">
              <h4>File Transfers</h4>
              {dataChannelService.fileTransfers.map((transfer, index) => (
                <div key={index} className={`file-transfer ${transfer.status}`}>
                  <span className="file-name">{transfer.fileName}</span>
                  <div className="progress-bar">
                    <div 
                      className="progress" 
                      style={{ width: `${transfer.progress}%` }}
                    ></div>
                  </div>
                  <span className="status">
                    {transfer.status === 'sending' && `Sending ${transfer.progress}%`}
                    {transfer.status === 'receiving' && `Receiving ${transfer.progress}%`}
                    {transfer.status === 'completed' && 'Completed'}
                    {transfer.status === 'failed' && 'Failed'}
                    {transfer.status === 'cancelled' && 'Cancelled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ChatComponent;