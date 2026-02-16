const Database = require('better-sqlite3');
const db = new Database(require('os').homedir() + '/.openclaw/memory/offline.sqlite');

const items = db.prepare('SELECT COUNT(*) as c FROM items').get();
console.log('Total items:', items.c);

const factsTable = db.prepare('SELECT COUNT(*) as c FROM facts').get();
console.log('Total facts:', factsTable.c);

const tags = db.prepare('SELECT tags, COUNT(*) as c FROM items GROUP BY tags ORDER BY c DESC LIMIT 15').all();
console.log('\nTop tags:');
tags.forEach(t => console.log(`  ${t.tags || '(null)'}: ${t.c}`));

db.close();
