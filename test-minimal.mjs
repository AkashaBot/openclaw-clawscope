// Minimal test server - no backend
import http from 'node:http';

const server = http.createServer((req, res) => {
  console.log('Request received:', req.url);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status: 'ok', url: req.url }));
});

server.listen(3099, () => {
  console.log('Minimal server listening on http://localhost:3099');
});

console.log('Server setup complete');

// Keep process alive
setInterval(() => console.log('Still alive...'), 5000);
