const socket = io.connect(window.location.origin);
socket.on('connect', () => console.log('Connected to server with SID:', socket.id));
socket.on('connect_error', (error) => {
  console.error('Socket Connection Error:', error);
  alert('Could not connect to the server. Please refresh the page.');
});