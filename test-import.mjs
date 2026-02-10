// Test import of the backend
console.log('Starting import test...');

try {
  const { OfflineSqliteSearchBackend } = await import('./dist/offline-sqlite-backend.js');
  console.log('OfflineSqliteSearchBackend imported successfully');
  
  const backend = new OfflineSqliteSearchBackend();
  console.log('Backend instantiated successfully');
} catch (err) {
  console.error('Error during import/instantiation:', err);
  process.exit(1);
}

console.log('Test complete!');
