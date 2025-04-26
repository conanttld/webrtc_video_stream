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
let serverReady = false;

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
    const data = JSON.parse(message);

    switch (data.type) {
      case 'broadcaster':
        broadcaster = socket;
        break;

      case 'viewer':
        if (broadcaster) {
          broadcaster.send(JSON.stringify({ type: 'viewer', from: socket.id }));
        }
        break;

      case 'offer':
      case 'answer':
      case 'candidate':
        const target = clients.get(data.target);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({
            type: data.type,
            [data.type]: data[data.type],
            from: socket.id
          }));
        }
        break;

      case 'stop': // Handle stop message from broadcaster
        const stopTarget = clients.get(data.target);
        if (stopTarget && stopTarget.readyState === WebSocket.OPEN) {
          console.log(`Forwarding stop message from ${socket.id} to ${data.target}`);
          stopTarget.send(JSON.stringify({ type: 'stop', from: socket.id }));
        }
        break;
    }
  });

  socket.on('close', () => {
    console.log(`Client disconnected: ${socket.id}`);
    clients.delete(socket.id);
    if (socket === broadcaster) {
      console.log(`Broadcaster ${socket.id} disconnected. Notifying viewers.`);
      broadcaster = null;
      // Notify all remaining clients that the broadcaster left
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'stop', from: socket.id }));
        }
      });
    }
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
