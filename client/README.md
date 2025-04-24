# WebRTC Webcam Stream Client

This React application acts as the client-side interface for a simple WebRTC video streaming setup. It allows one user to broadcast their webcam feed and another user to view it.

## How it Works

1.  **WebSocket Connection:** The client connects to a signaling server (expected to be running on `ws://<your-server-ip>:8080`) via WebSocket upon loading.
2.  **Signaling:** The WebSocket server manages connections and relays signaling messages (offers, answers, ICE candidates) between the broadcaster and the viewer to establish a direct peer-to-peer WebRTC connection.
3.  **Broadcasting:**
    *   Clicking "Start Broadcasting" initiates the process.
    *   The app requests webcam access (`getUserMedia`).
    *   It creates an `RTCPeerConnection`.
    *   It sends a `broadcaster` message to the signaling server.
    *   When a viewer connects (signaled by the server), the broadcaster creates an SDP offer, sets it as the local description, and sends it to the viewer via the server.
    *   It receives the viewer's SDP answer, sets it as the remote description.
    *   ICE candidates are exchanged via the server to facilitate NAT traversal.
    *   The local webcam stream is displayed and sent over the peer connection.
4.  **Viewing:**
    *   Clicking "Start Viewing" sends a `viewer` message to the signaling server.
    *   The server notifies the broadcaster.
    *   The viewer receives the broadcaster's SDP offer, sets it as the remote description.
    *   It creates an SDP answer, sets it as the local description, and sends it back to the broadcaster via the server.
    *   ICE candidates are exchanged.
    *   When the remote video track is received, it's displayed in the video element.
5.  **Stopping:** Clicking "Stop" closes the `RTCPeerConnection`, stops the webcam tracks (if broadcasting), and notifies the peer (if broadcasting) via the signaling server.

## Key Components

*   **`src/App.js`:** Contains the main application logic, including state management (using `useState`), side effects like WebSocket connection and `getUserMedia` (using `useEffect`), DOM element references (using `useRef`), and memoized callbacks (using `useCallback`).
*   **`RTCPeerConnection`:** The core WebRTC API for establishing the peer-to-peer connection.
*   **WebSocket API:** Used for communication with the signaling server.
*   **`navigator.mediaDevices.getUserMedia`:** Used to access the user's webcam.

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.
