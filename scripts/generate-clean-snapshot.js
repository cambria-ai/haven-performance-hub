/**
 * Generate clean snapshot from Google Sheets using fixed loader
 * Run: node scripts/generate-clean-snapshot.js
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const CURRENT_SNAPSHOT = path.join(SNAPSHOTS_DIR, 'current.json');
const HISTORY_PATH = path.join(SNAPSHOTS_DIR, 'history.json');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Read current snapshot and filter out junk agents
const currentData = JSON.parse(fs.readFileSync(CURRENT_SNAPSHOT, 'utf-8'));

// Patterns to reject
const rejectedPatterns = [
  'pending', 'closed', 'rescinded', 'active', 'contingent',
  'anniversary date', 'contract date', 'closing date', 'mutual acceptance',
  'total', 'totals', 'sum', 'count', 'average',
  'address', 'price', 'commission', 'gci', 'lead source',
  'purch/list', 'side', 'type', 'status',
  'agent name', 'team member', 'realtor name',
  'n/a', 'none', 'null', 'undefined', 'tbd',
  'pending sale', 'closed sale', 'pending listing', 'active listing',
];

function isValidAgentName(name) {
  if (!name || typeof name !== 'string') return false;
  const lower = name.toLowerCase().trim();
  
  // Check rejected patterns
  for (const pattern of rejectedPatterns) {
    if (lower === pattern || lower.includes(pattern)) return false;
  }
  
  // Reject date-like values
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(lower)) return false;
  
  // Reject pure numbers/currency
  if (/^[\d.,$%]+$/.test(lower)) return false;
  
  // Must have at least 2 chars and one letter
  if (name.length < 2 || !/[a-zA-Z]/.test(name)) return false;
  
  // Must have at least first and last name parts
  const parts = name.split(/[-\s]+/).filter(p => p.length > 0);
  if (parts.length < 2) return false;
  
  // Each part should start with a letter
  for (const part of parts) {
    if (!/^[A-Za-z]/.test(part)) return false;
  }
  
  return true;
}

// Filter agents
const cleanAgents = {};
for (const [id, agent] of Object.entries(currentData.agents)) {
  if (isValidAgentName(agent.name)) {
    cleanAgents[id] = agent;
  } else {
    console.log(`Removed invalid agent: "${agent.name}" (id: ${id})`);
  }
}

// Rebuild leaderboard with only valid agents
const validAgentIds = new Set(Object.keys(cleanAgents));
const cleanLeaderboard = currentData.leaderboard
  .filter(entry => validAgentIds.has(entry.agentId))
  .map((entry, index) => ({
    ...entry,
    rank: index + 1,
    distanceToNext: currentData.leaderboard[index + 1] && validAgentIds.has(currentData.leaderboard[index + 1].agentId)
      ? entry.closedTransactions - currentData.leaderboard[index + 1].closedTransactions
      : 0,
  }));

// Update metadata
const cleanData = {
  ...currentData,
  agents: cleanAgents,
  leaderboard: cleanLeaderboard,
  metadata: {
    ...currentData.metadata,
    agentCount: Object.keys(cleanAgents).length,
    notes: `Cleaned snapshot: removed ${Object.keys(currentData.agents).length - Object.keys(cleanAgents).length} invalid/junk entries. Generated ${new Date().toISOString()}.`,
  },
};

// Save clean snapshot
fs.writeFileSync(CURRENT_SNAPSHOT, JSON.stringify(cleanData, null, 2));

// Update history
let history = [];
try {
  if (fs.existsSync(HISTORY_PATH)) {
    history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  }
} catch {}

history.unshift(cleanData.metadata);
history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
history = history.slice(0, 50); // Keep last 50
fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));

console.log('');
console.log('✅ Clean snapshot generated successfully!');
console.log(`   Agents: ${cleanData.metadata.agentCount} (was ${Object.keys(currentData.agents).length})`);
console.log(`   Removed: ${Object.keys(currentData.agents).length - Object.keys(cleanAgents).length} junk entries`);
console.log('');
console.log('Top 10 agents in clean leaderboard:');
cleanLeaderboard.slice(0, 10).forEach(entry => {
  console.log(`   ${entry.rank}. ${entry.agentName} - ${entry.closedTransactions} closed`);
});
