# WebRTC Video Streaming Application Documentation

## Overview

This application is a real-time video streaming platform built with WebRTC, React, and TensorFlow.js. It enables peer-to-peer video broadcasting with an optional background blur effect using the BodyPix machine learning model. The system also includes in-stream text chat and file sharing through WebRTC data channels. The system consists of a client application (React) and a signaling server (Node.js) that facilitates WebRTC connection establishment.

## System Architecture

### Components

1. **Client Application (React)**
   - Handles user media capture (webcam)
   - Establishes WebRTC peer connections
   - Processes video streams with TensorFlow.js BodyPix for background blur
   - Implements real-time text chat and file sharing via WebRTC data channels
   - Manages UI states for broadcasting and viewing
   - Implements a modular architecture with specialized service modules

2. **Signaling Server (Node.js)**
   - Facilitates WebRTC connection establishment
   - Manages client connections and roles (broadcaster/viewer)
   - Relays signaling messages between peers
   - Tracks viewer count and broadcasts updates
   - Handles connection state changes and reconnections

### Technologies Used

- **Frontend**: React (v19.1.0), WebRTC API
- **Backend**: Node.js, Express (v5.1.0), WebSocket (ws v8.18.1)
- **Machine Learning**: TensorFlow.js, BodyPix model (v2.2.1)
- **Communication**: WebSockets for signaling, WebRTC for media streaming and data channels
- **Development**: Modern JavaScript (ES6+), React Hooks

## Client-Side Architecture

### Service-Based Design

The client application follows a modular, service-based architecture that separates concerns:

1. **UI State Management Service (`uiStateService.js`)**
   - Manages application state (broadcasting, viewing, blur settings)
   - Centralizes UI-related state changes
   - Provides hooks for component integration
   - Handles streamlined start/stop operations

2. **FPS Monitoring Service (`fpsMonitorService.js`)**
   - Calculates and tracks frames per second in video streams
   - Manages animation frames for performance monitoring
   - Provides real-time performance metrics

3. **BodyPix Segmentation Service (`bodyPixService.js`)**
   - Handles TensorFlow.js and BodyPix model initialization
   - Performs background blur processing via segmentation
   - Manages canvas rendering and video processing
   - Optimizes performance with WebGL acceleration

4. **WebRTC Connection Service (`webrtcService.js`)**
   - Manages WebRTC peer connections (multiple simultaneous connections)
   - Handles media stream acquisition and track management
   - Processes signaling data (offers, answers, ICE candidates)
   - Supports one-to-many broadcasting model

5. **WebSocket Communication Service (`websocketService.js`)**
   - Manages WebSocket connection establishment and maintenance
   - Implements reconnection logic with exponential backoff
   - Handles message serialization and transmission
   - Provides connection status updates

6. **Video Visualization Service (`videoVisualizationService.js`)**
   - Centralizes and unifies the state and control of video and canvas visualization
   - Manages video stream attachment and display properties
   - Handles switching between raw video and processed canvas modes
   - Ensures proper display of video streams received through WebRTC
   - Provides a consistent interface for other services to interact with visual elements

7. **Data Channel Service (`dataChannelService.js`)**
   - Manages WebRTC data channels for real-time communication
   - Handles text messaging between connected peers
   - Implements file sharing with chunking for large files
   - Tracks file transfer progress and status
   - Maintains message history and provides chat interface utilities

This service-oriented architecture improves:
- **Maintainability**: Each service has a clearly defined responsibility
- **Testability**: Services can be tested in isolation
- **Reusability**: Services can be used across different components
- **Scalability**: New features can be added without modifying existing services

### Key Components

1. **User Interface**
   - Control buttons for starting/stopping broadcasting and viewing
   - Video display area (shows webcam feed or received stream)
   - Background blur toggle option (for viewers)
   - FPS (Frames Per Second) counter
   - Connection status indicator with visual feedback
   - Viewer count display for broadcasters

2. **WebRTC Connection Management**
   - `RTCPeerConnection` setup and configuration
   - ICE candidate gathering and exchange
   - SDP (Session Description Protocol) offer/answer exchange
   - Robust connection retry logic with exponential backoff
   - Connection state management and visualization
   - Multi-viewer support with connection mapping

3. **Video Processing**
   - Raw webcam feed capture
   - Optional background segmentation and blur using BodyPix
   - Real-time FPS calculation
   - Unified video visualization through centralized service
   - Mirror effect for local camera preview

4. **Chat Component**
   - Collapsible chat interface that appears during active connections
   - Real-time message display with different styling for sent/received messages
   - Support for file sharing with progress indicators
   - Username customization for chat participants
   - System notifications for connection events and file transfers

### State Management

The client application maintains several states:
- `isBroadcasting`: Indicates if the user is currently broadcasting
- `isViewing`: Indicates if the user is currently viewing a broadcast
- `applyBlur`: Controls whether background blur is applied to the video
- `isSegmentationReady`: Tracks if the BodyPix model is loaded and ready
- `fps`: Tracks the current frames per second rate of the video
- `connectionStatus`: Tracks the current WebSocket connection status (connected, connecting, disconnected, error)
- `videoStreamActive`: Tracks if a video stream is currently active and attached
- `visualizationMode`: Controls the current video display mode (raw or processed)
- `viewerCount`: Tracks number of connected viewers (for broadcaster)
- `cleanupInProgress`: Prevents multiple simultaneous cleanup operations
- `username`: Displays the user's chosen display name for chat messages
- `messages`: Chat message history between connected peers
- `fileTransfers`: Current and past file transfer statuses and progress

### Process Flow

#### Initialization
1. The application loads and establishes a WebSocket connection to the signaling server
   - Connection status changes to "connecting"
   - WebSocket connection attempts employ retry logic with exponential backoff
   - UI provides visual feedback during connection process
2. The BodyPix ML model is loaded asynchronously in the background
3. Once connected, the status indicator turns green and streaming options become available
4. Each client receives a unique UUID from the server for identification

#### When Broadcasting
1. User clicks "Start Broadcasting"
2. Application sends a `broadcaster` message to the server
3. WebRTC peer connection is created
4. Local webcam feed is obtained via `getUserMedia()` and displayed
5. Local media tracks are added to the peer connection
6. When a viewer connects, the server notifies the broadcaster
7. Broadcaster creates an SDP offer and sends it to the viewer
8. ICE candidates are gathered and exchanged
9. Once connection is established, video streaming begins
10. UI updates to show current viewer count

#### When Viewing
1. User clicks "Start Viewing"
2. Application sends a `viewer` message to the server
3. If a broadcaster exists, the server notifies both parties
4. When an offer is received from the broadcaster, the viewer creates a peer connection
5. Viewer sets the remote description using the broadcaster's offer
6. Viewer creates an SDP answer and sends it to the broadcaster
7. ICE candidates are gathered and exchanged
8. Once connection is established, video stream is received and displayed
9. Optionally, the background blur effect can be toggled

#### Background Blur Processing
1. When background blur is enabled, the segmentation loop is started
2. The videoVisualization service switches display mode from raw video to processed canvas
3. For each video frame:
   - The BodyPix model segments the person from the background
   - The original frame is drawn to a canvas
   - A blurred version of the frame is created
   - A composite frame is created, with the person from the original frame and the background from the blurred frame
   - The composite frame is displayed on the canvas
4. When disabled, the visualization service switches back to raw video display

### Media and Data Flow (WebRTC)

After the signaling process completes, direct peer-to-peer connections are established:

```
Broadcaster ───[Video Stream]───→ Viewer 1
Broadcaster ←──[Data Channel]───→ Viewer 1
Broadcaster ───[Video Stream]───→ Viewer 2
Broadcaster ←──[Data Channel]───→ Viewer 2
Broadcaster ───[Video Stream]───→ Viewer n
Broadcaster ←──[Data Channel]───→ Viewer n
```

These direct connections operate outside the server, reducing latency and server load. Neither media data nor chat messages pass through the signaling server.

## Server-Side Operation

### Components

1. **Express HTTP Server**
   - Serves static files for the client application
   - Hosts the WebSocket server
   - Provides status endpoint for healthchecks

2. **WebSocket Server**
   - Maintains client connections with unique IDs (UUID v4)
   - Tracks broadcaster and viewers
   - Relays signaling messages between appropriate peers
   - Manages viewer count and broadcasts updates
   - Handles graceful disconnections

### Client Tracking

- Each connected client is assigned a unique UUID via the uuid package
- Clients are stored in a Map with their UUID as the key (`clients` Map)
- Viewers are tracked in a separate Set (`viewers` Set)
- The broadcaster is tracked with a special variable
- Viewer count is broadcast to all relevant clients when it changes

### Message Handling

The server processes several types of WebSocket messages:

1. **`broadcaster`**: Designates the sender as the broadcaster
   - Stores the client as the broadcaster
   - Notifies the broadcaster of existing viewers
   - Broadcasts viewer count

2. **`viewer`**: Registers a client as a viewer
   - Adds client to viewers set
   - Notifies broadcaster of new viewer
   - Updates and broadcasts viewer count

3. **`offer`**: Relays the SDP offer from broadcaster to specific viewer
   - Forwards offer with sender information

4. **`answer`**: Relays the SDP answer from viewer to broadcaster
   - Forwards answer with sender information

5. **`candidate`**: Relays ICE candidates between peers
   - Forwards candidate with sender information to specific target

6. **`stop`**: Handles stream termination
   - From broadcaster: Notifies all viewers, clears viewer list
   - From viewer: Updates viewer count, notifies broadcaster

7. **`viewer-disconnected`**: Notifies broadcaster when a viewer disconnects
   - Updates viewer count
   - Provides information about which viewer disconnected

### Server Readiness and Disconnect Handling

- Server maintains a `serverReady` flag to prevent premature connections
- When clients disconnect, they are removed from the client map
- If the broadcaster disconnects, all viewers are notified with a `stop` message
- Server provides a `/status` endpoint for clients to check availability
- Viewer disconnections are tracked and reported to the broadcaster
- Viewer count is maintained accurately through connection lifecycle

## Signal and Data Flow

### Signaling Flow (WebSocket)

1. **Connection Establishment**
   ```
   Client ───[WS Connection]──→ Server
   Client ←──[Assigned UUID]──── Server
   ```

2. **Broadcast Initialization**
   ```
   Broadcaster ───[broadcaster]──→ Server
   ```

3. **Viewer Connection**
   ```
   Viewer ───[viewer]──→ Server
   Server ───[viewer, viewerId]──→ Broadcaster
   ```

4. **SDP Exchange**
   ```
   Broadcaster ───[offer, SDP]──→ Server ───[offer, SDP]──→ Viewer
   Viewer ───[answer, SDP]──→ Server ───[answer, SDP]──→ Broadcaster
   ```

5. **ICE Candidate Exchange**
   ```
   Peer A ───[candidate, ICE]──→ Server ───[candidate, ICE]──→ Peer B
   ```

6. **Stream Termination**
   ```
   Broadcaster ───[stop]──→ Server ───[stop]──→ Viewer(s)
   ```

7. **Viewer Count Updates**
   ```
   Server ───[viewer-count, count]──→ Broadcaster
   Server ───[viewer-count, count]──→ Viewers
   ```

8. **Viewer Disconnection**
   ```
   Server ───[viewer-disconnected, viewerId]──→ Broadcaster
   ```

### Media Flow (WebRTC)

After the signaling process completes, direct peer-to-peer connections are established:

```
Broadcaster ───[Video Stream]───→ Viewer 1
Broadcaster ───[Video Stream]───→ Viewer 2
Broadcaster ───[Video Stream]───→ Viewer n
```

These direct connections operate outside the server, reducing latency and server load. The media data never passes through the signaling server.

### Data Processing Pipeline

For broadcasting:
```
Webcam → getUserMedia() → videoVisualization service → RTCPeerConnection → Peer-to-Peer → Viewer
```

For viewing with background blur:
```
P2P Stream → videoVisualization service → BodyPix Segmentation → Canvas → Display
```

For chat and file sharing:
```
P2P Data Channel → dataChannelService → Chat UI → Display
```

## WebRTC Data Channel Chat

### Features

1. **Real-Time Text Messaging**
   - Direct peer-to-peer communication through WebRTC data channels
   - Instant message delivery without server involvement
   - User identification with customizable display names
   - Message history with timestamps
   - Different styling for sent and received messages

2. **File Sharing**
   - Direct peer-to-peer file transfers
   - Progress tracking for both sender and receiver
   - File size limit (5MB) to prevent channel saturation
   - Automatic file reassembly on the receiving end
   - Support for all file types

3. **User Experience**
   - Collapsible chat UI that doesn't interfere with video
   - Automatic scrolling to latest messages
   - System notifications for connections, disconnections, and file transfers
   - Error handling with user-friendly notifications

### Implementation

1. **Data Channel Establishment**
   - Data channels are automatically created alongside video connections
   - Uses ordered and reliable channel configuration
   - Channel state is managed through the dataChannelService

2. **Message Handling**
   - Text messages are JSON-serialized with metadata (sender, timestamp)
   - Binary data handling for file transfers
   - Chunked file transfers to accommodate WebRTC's message size limitations
   - Message types: chat, system, error, file-info, file

3. **File Transfer Process**
   - Sender sends file metadata (name, size, ID) to receiver
   - File is split into manageable chunks (16KB)
   - Each chunk is prefixed with the file ID
   - Receiver reassembles chunks using the file ID
   - Progress is tracked and displayed to both parties
   - Completed files are made available for download

### Chat UI Components

1. **Message Display**
   - Real-time message list with scroll functionality
   - Different styling for sent, received, system, and error messages
   - Timestamp display for all messages
   - Sender identification for received messages

2. **Input Controls**
   - Text input field for messages
   - Send button for text messages
   - File attachment button with size validation
   - File sending controls with cancel option

3. **File Transfer Display**
   - Progress bars for active transfers
   - Status indicators (sending, receiving, completed, failed)
   - Download links for completed transfers
   - File size information

### Benefits

1. **No Server Load**
   - All chat communication happens directly between peers
   - Server is not involved after initial connection setup
   - Reduces bandwidth costs and server processing

2. **Enhanced Privacy**
   - End-to-end communication without intermediaries
   - Files never pass through the server
   - Communication ceases when connection ends

3. **Low Latency**
   - Direct peer-to-peer communication reduces delay
   - Ideal for real-time collaboration during broadcasts
   - Immediate file transfer without server upload/download cycle

4. **Offline Capability**
   - Communication can continue even if the signaling server goes offline
   - Only requires the WebRTC connection to remain established

## Performance Considerations

1. **BodyPix Model Configuration**
   - Uses WebGL backend for better performance
   - Configured with lower resolution settings:
     - architecture: 'MobileNetV1'
     - outputStride: 16
     - multiplier: 0.75
     - quantBytes: 2

2. **FPS Monitoring**
   - Real-time calculation of frames per second
   - Helps monitor performance impact of video processing

3. **Resource Management**
   - Cancellation of animation frames when not in use
   - Proper cleanup of media tracks and connections on stop
   - Memory management through reference cleanup
   - Prevention of redundant cleanup operations
   - Efficient handling of multiple peer connections

4. **Video Quality Settings**
   - Optimized video constraints:
     - Resolution: 1280x720 (ideal)
     - Frame rate: 30fps (ideal)
   - Balanced for quality and performance

## Integration Improvements

1. **Unified Video Handling**
   - Centralized video stream management through the videoVisualization service
   - Consistent handling of video elements across different components
   - Improved reliability of video stream display for viewers
   - Standardized interface for video operations

2. **Enhanced Service Collaboration**
   - Better integration between services through proper dependency injection
   - Clear separation of concerns with video handling isolated in its own service
   - Services now communicate through well-defined interfaces
   - Reduced inter-service dependencies

3. **Improved User Experience**
   - More reliable background blur toggle functionality
   - Better handling of video stream attachment and display
   - Smoother transitions between video visualization modes
   - Real-time viewer count updates
   - Connection status feedback

4. **Code Maintainability**
   - Reduced code duplication for video handling across services
   - Better organized video-related functionality
   - More consistent state management for video elements
   - Clearer component lifecycle management

## Connection Reliability Improvements

1. **Robust WebSocket Connection Management**
   - Implemented connection retry logic with exponential backoff
   - Added proper handling of connection state transitions
   - Improved error handling for WebSocket operations
   - Proper component lifecycle management to prevent memory leaks
   - Efficient reconnection strategy

2. **Server Readiness Protocol**
   - Server indicates when it's fully initialized and ready to accept connections
   - Status endpoint allows clients to check server availability
   - Prevents connection attempts to a server that's not ready
   - Graceful rejection of premature connections

3. **User Experience Enhancements**
   - Visual connection status indicator with color coding:
     - Green: Connected and ready
     - Yellow: Connecting/reconnecting
     - Red: Disconnected
     - Purple: Connection error
   - Broadcasting and viewing options automatically disable when not connected
   - Clear feedback during connection attempts and failures
   - Proper error messages for common failure scenarios

4. **Resource Management**
   - Prevention of redundant cleanup operations
   - Better handling of connection errors without cascading failures
   - Improved synchronization between BodyPix model and connection lifecycle
   - Proper cleanup of WebRTC peer connections

## Multi-Viewer Support

1. **One-to-Many Broadcasting**
   - Support for multiple simultaneous viewers
   - Dynamic peer connection management
   - Efficient handling of viewer connections and disconnections
   - Real-time viewer count updates

2. **Connection Management**
   - Map-based peer connection tracking
   - Individual offer/answer exchange for each viewer
   - Proper ICE candidate routing
   - Efficient cleanup of terminated connections

3. **Viewer Experience**
   - Individual video processing for each viewer
   - Background blur can be toggled independently by each viewer
   - Connection status feedback
   - Clean disconnection handling

## Security Considerations

1. The application uses client-generated UUIDs for identifying peers
2. The signaling server only relays messages to intended recipients
3. WebRTC employs encryption for media streams
4. No authentication or authorization is implemented in this version
5. Uses STUN servers for NAT traversal:
   - stun:stun.l.google.com:19302
   - stun:stun1.l.google.com:19302

## Limitations and Future Improvements

1. Only supports one broadcaster at a time
2. No TURN server configuration for complex NAT traversal scenarios
3. No fallback for browsers without WebRTC support
4. Background blur processing can be CPU-intensive
5. Potential future improvements:
   - Multiple room support
   - Authentication and authorization
   - Audio support
   - Recording capability
   - Screen sharing functionality
   - Mobile responsiveness enhancements
6. **Data Channel Limitations**
   - 5MB file size limit for transfers
   - No message history persistence between sessions
   - No broadcast chat messages to all viewers simultaneously
   - No typing indicators or read receipts

7. **Potential future improvements:**
   - End-to-end encryption for chat messages
   - Persistent chat history
   - Group chat capabilities
   - Increased file size limit with chunking improvements

## Conclusion

This WebRTC application demonstrates a complete implementation of real-time video streaming with optional ML-based video processing and direct peer-to-peer communication through data channels. The combination of WebSockets for signaling and WebRTC for media transport and data communication creates a scalable and efficient architecture where the server's role is minimized once connections are established. The improved connection handling ensures a more reliable user experience, with transparent feedback about the application's connection state. The videoVisualization service further enhances reliability by centralizing video stream handling and ensuring proper visualization in all states of the application. The multi-viewer support architecture demonstrates WebRTC's capacity for efficient one-to-many broadcasting scenarios, while the data channel implementation showcases WebRTC's ability to provide comprehensive communication capabilities.

## Last Updated

May 1, 2025