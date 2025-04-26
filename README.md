# WebRTC Video Streaming Application Documentation

## Overview

This application is a real-time video streaming platform built with WebRTC, React, and TensorFlow.js. It enables peer-to-peer video broadcasting with an optional background blur effect using the BodyPix machine learning model. The system consists of a client application (React) and a signaling server (Node.js) that facilitates WebRTC connection establishment.

## System Architecture

### Components

1. **Client Application (React)**
   - Handles user media capture (webcam)
   - Establishes WebRTC peer connections
   - Processes video streams with TensorFlow.js BodyPix for background blur
   - Manages UI states for broadcasting and viewing

2. **Signaling Server (Node.js)**
   - Facilitates WebRTC connection establishment
   - Manages client connections and roles (broadcaster/viewer)
   - Relays signaling messages between peers

### Technologies Used

- **Frontend**: React, WebRTC API
- **Backend**: Node.js, Express, WebSocket (ws)
- **Machine Learning**: TensorFlow.js, BodyPix model
- **Communication**: WebSockets for signaling, WebRTC for media streaming

## Client-Side Operation

### Key Components

1. **User Interface**
   - Control buttons for starting/stopping broadcasting and viewing
   - Video display area (shows webcam feed or received stream)
   - Background blur toggle option (for viewers)
   - FPS (Frames Per Second) counter
   - **Connection status indicator** with visual feedback

2. **WebRTC Connection Management**
   - `RTCPeerConnection` setup and configuration
   - ICE candidate gathering and exchange
   - SDP (Session Description Protocol) offer/answer exchange
   - **Robust connection retry logic with exponential backoff**
   - **Connection state management and visualization**

3. **Video Processing**
   - Raw webcam feed capture
   - Optional background segmentation and blur using BodyPix
   - Real-time FPS calculation

### State Management

The client application maintains several states:
- `isBroadcasting`: Indicates if the user is currently broadcasting
- `isViewing`: Indicates if the user is currently viewing a broadcast
- `applyBlur`: Controls whether background blur is applied to the video
- `isSegmentationReady`: Tracks if the BodyPix model is loaded and ready
- `fps`: Tracks the current frames per second rate of the video
- **`connectionStatus`**: Tracks the current WebSocket connection status (connected, connecting, disconnected, error)

### Process Flow

#### Initialization
1. The application loads and establishes a WebSocket connection to the signaling server
   - **Connection status changes to "connecting"**
   - **WebSocket connection attempts employ retry logic with exponential backoff**
   - **UI provides visual feedback during connection process**
2. The BodyPix ML model is loaded asynchronously in the background
3. **Once connected, the status indicator turns green and streaming options become available**

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
2. For each video frame:
   - The BodyPix model segments the person from the background
   - The original frame is drawn to a canvas
   - A blurred version of the frame is created
   - A composite frame is created, with the person from the original frame and the background from the blurred frame
   - The composite frame is displayed on the canvas

## Server-Side Operation

### Components

1. **Express HTTP Server**
   - Serves static files
   - Hosts the WebSocket server

2. **WebSocket Server**
   - Maintains client connections
   - Tracks the broadcaster
   - Relays signaling messages

### Client Tracking

- Each connected client is assigned a unique UUID
- Clients are stored in a Map with their UUID as the key
- The broadcaster is tracked with a special variable

### Message Handling

The server processes several types of WebSocket messages:

1. **`broadcaster`**: Designates the sender as the broadcaster
2. **`viewer`**: Notifies the broadcaster that a viewer wants to connect
3. **`offer`**: Relays the SDP offer from broadcaster to viewer
4. **`answer`**: Relays the SDP answer from viewer to broadcaster
5. **`candidate`**: Relays ICE candidates between peers
6. **`stop`**: Notifies affected clients when a stream ends

### Disconnect Handling

- When clients disconnect, they are removed from the client map
- If the broadcaster disconnects, all viewers are notified with a `stop` message
- **Server maintains a readiness state to prevent premature connections**
- **Server provides a status endpoint for clients to check availability**

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

### Media Flow (WebRTC)

After the signaling process completes, a direct peer-to-peer connection is established:

```
Broadcaster ───[Video Stream]───→ Viewer
```

This direct connection operates outside the server, reducing latency and server load. The media data never passes through the signaling server.

### Data Processing Pipeline

For broadcasting:
```
Webcam → getUserMedia() → RTCPeerConnection → Peer-to-Peer → Viewer
```

For viewing with background blur:
```
P2P Stream → Video Element → BodyPix Segmentation → Canvas → Display
```

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

## Connection Reliability Improvements

1. **Robust WebSocket Connection Management**
   - Implemented connection retry logic with exponential backoff
   - Added proper handling of connection state transitions
   - Improved error handling for WebSocket operations
   - Proper component lifecycle management to prevent memory leaks

2. **Server Readiness Protocol**
   - Server indicates when it's fully initialized and ready to accept connections
   - Status endpoint allows clients to check server availability
   - Prevents connection attempts to a server that's not ready

3. **User Experience Enhancements**
   - Visual connection status indicator with color coding:
     - Green: Connected and ready
     - Yellow: Connecting/reconnecting
     - Red: Disconnected
     - Purple: Connection error
   - Broadcasting and viewing options automatically disable when not connected
   - Clear feedback during connection attempts and failures

4. **Resource Management**
   - Prevention of redundant cleanup operations
   - Better handling of connection errors without cascading failures
   - Improved synchronization between BodyPix model and connection lifecycle

## Security Considerations

1. The application uses client-generated UUIDs for identifying peers
2. The signaling server only relays messages to intended recipients
3. WebRTC employs encryption for media streams
4. No authentication or authorization is implemented in this version

## Limitations

1. Only supports one broadcaster at a time
2. No TURN server configuration for NAT traversal
3. No fallback for browsers without WebRTC support
4. Background blur processing can be CPU-intensive

## Conclusion

This WebRTC application demonstrates a complete implementation of real-time video streaming with optional ML-based video processing. The combination of WebSockets for signaling and WebRTC for media transport creates a scalable and efficient architecture where the server's role is minimized once connections are established. **The improved connection handling ensures a more reliable user experience, with transparent feedback about the application's connection state.**