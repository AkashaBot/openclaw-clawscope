// Simple server test
import { createServer } from 'node:http';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK\n');
});

console.log('Starting test server...');
server.listen(3099, () => {
  console.log('Test server listening on http://localhost:3099');
});

// Keep alive
setInterval(() => {}, 1000000);
