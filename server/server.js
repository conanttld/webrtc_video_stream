const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Add server status route
app.use(express.static('public'));
app.get('/status', (req, res) => {
  res.status(200).json({ status: 'ok', ready: serverReady });
});

let broadcaster = null;
const clients = new Map(); // socket.id => socket
const viewers = new Set(); // Set of viewer IDs
let serverReady = false;

// Utility function to broadcast viewer count updates
function broadcastViewerCount() {
  const count = viewers.size;
  console.log(`Broadcasting updated viewer count: ${count}`);
  
  // Send count to broadcaster
  if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
    broadcaster.send(JSON.stringify({ 
      type: 'viewer-count', 
      count 
    }));
  }
  
  // Optionally send to all viewers too
  viewers.forEach(viewerId => {
    const viewer = clients.get(viewerId);
    if (viewer && viewer.readyState === WebSocket.OPEN) {
      viewer.send(JSON.stringify({ 
        type: 'viewer-count', 
        count 
      }));
    }
  });
}

wss.on('connection', socket => {
  // Only accept WebSocket connections when server is ready
  if (!serverReady) {
    console.log('Server not fully initialized, rejecting connection');
    socket.close(1013, 'Server not ready'); // 1013 = Try again later
    return;
  }

  socket.id = uuidv4();
  clients.set(socket.id, socket);
  console.log(`Client connected: ${socket.id}`);

  // Send client their ID immediately after connection
  socket.send(JSON.stringify({ type: 'your-id', id: socket.id }));

  // Rest of the connection handling
  socket.on('message', message => {
    try {
      const data = JSON.parse(message);
      console.log(`Received ${data.type} message from ${socket.id}`);

      switch (data.type) {
        case 'broadcaster':
          broadcaster = socket;
          console.log(`Client ${socket.id} registered as broadcaster`);
          
          // If there are existing viewers, send them to the new broadcaster
          if (viewers.size > 0) {
            console.log(`Notifying broadcaster of ${viewers.size} existing viewers`);
            
            // Send current viewer count
            broadcastViewerCount();
            
            // Send individual viewer notifications
            viewers.forEach(viewerId => {
              broadcaster.send(JSON.stringify({ 
                type: 'viewer', 
                from: viewerId 
              }));
            });
          }
          break;

        case 'viewer':
          // Add to viewers set
          viewers.add(socket.id);
          console.log(`Client ${socket.id} registered as viewer. Total viewers: ${viewers.size}`);
          
          // Notify broadcaster
          if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
            broadcaster.send(JSON.stringify({ 
              type: 'viewer', 
              from: socket.id 
            }));
            
            // Update viewer count
            broadcastViewerCount();
          } else {
            console.log("No broadcaster available for the viewer");
            socket.send(JSON.stringify({ 
              type: 'error', 
              message: 'No broadcaster available' 
            }));
          }
          break;

        case 'offer':
        case 'answer':
        case 'candidate':
          const target = clients.get(data.target);
          if (target && target.readyState === WebSocket.OPEN) {
            console.log(`Forwarding ${data.type} from ${socket.id} to ${data.target}`);
            target.send(JSON.stringify({
              type: data.type,
              [data.type]: data[data.type],
              from: socket.id
            }));
          } else {
            console.log(`Target ${data.target} not found or not connected`);
          }
          break;

        case 'stop': // Handle stop message from broadcaster
          if (socket === broadcaster) {
            console.log(`Broadcaster ${socket.id} sent stop signal. Notifying all viewers.`);
            // Notify all viewers
            viewers.forEach(viewerId => {
              const viewer = clients.get(viewerId);
              if (viewer && viewer.readyState === WebSocket.OPEN) {
                console.log(`Sending stop to viewer ${viewerId}`);
                viewer.send(JSON.stringify({ 
                  type: 'stop', 
                  from: socket.id 
                }));
              }
            });
            
            // Clear viewers list
            viewers.clear();
            broadcastViewerCount();
          } else {
            // Single viewer is stopping
            if (viewers.has(socket.id)) {
              console.log(`Viewer ${socket.id} is stopping`);
              viewers.delete(socket.id);
              
              // Notify broadcaster of viewer disconnection
              if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
                broadcaster.send(JSON.stringify({
                  type: 'viewer-disconnected',
                  viewerId: socket.id,
                  viewerCount: viewers.size
                }));
              }
              
              // Update viewer count for remaining clients
              broadcastViewerCount();
            }
            
            // If there's a specific target, forward the stop message
            if (data.target) {
              const stopTarget = clients.get(data.target);
              if (stopTarget && stopTarget.readyState === WebSocket.OPEN) {
                console.log(`Forwarding stop message from ${socket.id} to ${data.target}`);
                stopTarget.send(JSON.stringify({ 
                  type: 'stop', 
                  from: socket.id 
                }));
              }
            }
          }
          break;
          
        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error(`Error processing message from ${socket.id}:`, error);
    }
  });

  socket.on('close', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Handle broadcaster disconnection
    if (socket === broadcaster) {
      console.log(`Broadcaster ${socket.id} disconnected. Notifying all viewers.`);
      broadcaster = null;
      
      // Notify all viewers
      viewers.forEach(viewerId => {
        const viewer = clients.get(viewerId);
        if (viewer && viewer.readyState === WebSocket.OPEN) {
          viewer.send(JSON.stringify({ 
            type: 'stop', 
            from: socket.id 
          }));
        }
      });
      
      // Clear viewers set
      viewers.clear();
    }
    
    // Handle viewer disconnection
    if (viewers.has(socket.id)) {
      console.log(`Viewer ${socket.id} disconnected`);
      viewers.delete(socket.id);
      
      // Notify broadcaster
      if (broadcaster && broadcaster.readyState === WebSocket.OPEN) {
        broadcaster.send(JSON.stringify({
          type: 'viewer-disconnected',
          viewerId: socket.id,
          viewerCount: viewers.size
        }));
        
        // Update viewer count
        broadcastViewerCount();
      }
    }
    
    // Remove from clients map
    clients.delete(socket.id);
  });

  // Handle socket errors
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
});

// Wait until server is fully initialized
server.listen(8080, '0.0.0.0', () => {
  console.log('WebRTC signaling server running on http://0.0.0.0:8080');
  // Set server as ready after a short delay to ensure everything is initialized
  setTimeout(() => {
    serverReady = true;
    console.log('Server is now ready to accept connections');
  }, 500);
});
