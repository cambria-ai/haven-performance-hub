/**
 * Load demo snapshot for preview/testing
 * Run: node scripts/load-demo-snapshot.js
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const DEMO_SNAPSHOT = path.join(__dirname, '..', 'data', 'demo-snapshot.json');
const CURRENT_SNAPSHOT = path.join(SNAPSHOTS_DIR, 'current.json');
const HISTORY_PATH = path.join(SNAPSHOTS_DIR, 'history.json');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  console.log('✓ Created snapshots directory');
}

// Load demo snapshot
const demoData = JSON.parse(fs.readFileSync(DEMO_SNAPSHOT, 'utf-8'));

// Save as current snapshot
fs.writeFileSync(CURRENT_SNAPSHOT, JSON.stringify(demoData, null, 2));
console.log('✓ Loaded demo snapshot as current');

// Add to history
let history = [];
try {
  if (fs.existsSync(HISTORY_PATH)) {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  }
} catch {}

// Add demo snapshot metadata to history
history.push(demoData.metadata);
history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
console.log('✓ Added snapshot to history');

console.log('\n📊 Demo Snapshot Loaded Successfully');
console.log('=====================================');
console.log(`Agents: ${demoData.metadata.agentCount}`);
console.log(`Transactions: ${demoData.metadata.transactionCount}`);
console.log(`Week: ${demoData.metadata.weekStart.split('T')[0]} to ${demoData.metadata.weekEnd.split('T')[0]}`);
console.log('\n📝 Sources represented:');
demoData.metadata.sourceFiles.forEach(src => console.log(`  • ${src}`));
console.log('\n✅ Ready for preview login!');
