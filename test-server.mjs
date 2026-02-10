// Test server startup
console.log('Starting server test...');

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

try {
  await import('./dist/server.js');
  console.log('Server imported successfully');
} catch (err) {
  console.error('Error during server import:', err);
  process.exit(1);
}

console.log('Server test complete, keeping process alive...');
// Keep process alive indefinitely
setInterval(() => {}, 24 * 60 * 60 * 1000); // Keep alive forever
