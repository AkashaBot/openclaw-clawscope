import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(os.homedir(), '.openclaw', 'memory', 'offline.sqlite');
const db = new Database(dbPath);

const cols = db.prepare("PRAGMA table_info(items)").all();
console.log('Items table columns:');
cols.forEach(c => console.log(`  - ${c.name} (${c.type})`));

const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='items'").all();
console.log('\nIndexes on items:');
indexes.forEach(i => console.log(`  - ${i.name}`));

db.close();
