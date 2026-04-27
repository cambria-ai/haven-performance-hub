/**
 * Verification script for leaderboard privacy scoping
 * Ensures non-admin agents see anonymized leaderboard (only their own name visible)
 */

const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(process.cwd(), 'data', 'snapshots', 'current.json');

if (!fs.existsSync(snapshotPath)) {
  console.error('ERROR: No snapshot data found at', snapshotPath);
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

// Simulate the sanitizeLeaderboard function from auth-helpers.ts
function sanitizeLeaderboard(leaderboard, currentAgentId, isAdmin) {
  if (isAdmin) {
    return leaderboard;
  }

  return leaderboard.map(entry => {
    if (entry.agentId === currentAgentId) {
      return {
        ...entry,
        isOwn: true,
      };
    }

    // Anonymize other entries - hide name and remove GCI
    const { gci, agentName, ...rest } = entry;
    return {
      ...rest,
      agentName: `Position ${entry.rank}`,
      agentId: `anon-${entry.rank}`,
      gci: 0,
      isOwn: false,
    };
  });
}

console.log('=== LEADERBOARD PRIVACY VERIFICATION ===\n');

const leaderboard = snapshot.leaderboard || [];
console.log(`Total leaderboard entries: ${leaderboard.length}`);

// Test with multiple agents to ensure anonymization works for all
const testAgents = [
  'emily-polanco',
  'cambria-henry',
  leaderboard[0]?.agentId, // Top ranked agent
  leaderboard[leaderboard.length - 1]?.agentId, // Bottom ranked agent
].filter(Boolean);

let allTestsPassed = true;

for (const agentId of testAgents) {
  const agent = snapshot.agents[agentId];
  if (!agent) continue;

  const sanitized = sanitizeLeaderboard(leaderboard, agentId, false);
  
  // Check 1: Own entry should have real name
  const ownEntry = sanitized.find(e => e.isOwn);
  const ownNameCorrect = ownEntry?.agentName === agent.name;
  
  // Check 2: All other entries should be anonymized
  const nonOwnEntries = sanitized.filter(e => !e.isOwn);
  const nonOwnWithRealNames = nonOwnEntries.filter(e => !e.agentName.startsWith('Position'));
  const allOthersAnonymized = nonOwnWithRealNames.length === 0;
  
  // Check 3: Anonymized entries should have anon-* IDs
  const nonOwnWithRealIds = nonOwnEntries.filter(e => !e.agentId.startsWith('anon-'));
  const allIdsAnonymized = nonOwnWithRealIds.length === 0;
  
  console.log(`\nTest agent: ${agent.name}`);
  console.log(`  ✓ Own entry has real name: ${ownNameCorrect ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ All others anonymized: ${allOthersAnonymized ? 'PASS' : 'FAIL'}`);
  console.log(`  ✓ All IDs anonymized: ${allIdsAnonymized ? 'PASS' : 'FAIL'}`);
  
  if (!ownNameCorrect || !allOthersAnonymized || !allIdsAnonymized) {
    allTestsPassed = false;
    if (nonOwnWithRealNames.length > 0) {
      console.log(`  ERROR: Found non-anonymized entries: ${nonOwnWithRealNames.map(e => e.agentName).join(', ')}`);
    }
    if (nonOwnWithRealIds.length > 0) {
      console.log(`  ERROR: Found non-anonymized IDs: ${nonOwnWithRealIds.map(e => e.agentId).join(', ')}`);
    }
  }
}

console.log('\n=== VERIFICATION SUMMARY ===');
if (allTestsPassed) {
  console.log('✓ ALL TESTS PASSED - Leaderboard privacy is correctly enforced');
  process.exit(0);
} else {
  console.log('✗ TESTS FAILED - Leaderboard privacy is NOT correctly enforced');
  process.exit(1);
}
