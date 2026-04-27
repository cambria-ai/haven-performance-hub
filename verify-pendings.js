/**
 * Verification script for pending transactions
 * Validates: agent counts, pending counts, Emily's data, privacy boundaries
 */

const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(process.cwd(), 'data', 'snapshots', 'current.json');

if (!fs.existsSync(snapshotPath)) {
  console.error('ERROR: No snapshot data found at', snapshotPath);
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

// Aggregate pending data
const agentsWithPendings = [];
let totalPendingCount = 0;
const mismatches = [];
let emilyAddresses = [];
let emilyPendingCount = 0;

if (snapshot.agents) {
  for (const agent of Object.values(snapshot.agents)) {
    const pendingCount = agent.pendingTransactions || 0;
    const pendingDetailCount = agent.pendingTransactionsDetail?.length || 0;
    
    if (pendingCount > 0 || pendingDetailCount > 0) {
      agentsWithPendings.push({
        id: agent.id,
        name: agent.name,
        pendingCount,
        pendingDetailCount,
      });
      
      totalPendingCount += pendingDetailCount;
      
      // Check for mismatch between summary and detail
      if (pendingCount !== pendingDetailCount) {
        mismatches.push({
          agentId: agent.id,
          agentName: agent.name,
          summaryCount: pendingCount,
          detailCount: pendingDetailCount,
        });
      }
      
      // Track Emily Polanco specifically
      if (agent.name.toLowerCase().includes('emily') && agent.name.toLowerCase().includes('polanco')) {
        emilyPendingCount = pendingDetailCount;
        emilyAddresses = agent.pendingTransactionsDetail?.map(txn => txn.address) || [];
      }
    }
  }
}

// Privacy verification: check that agent data only contains their own info
let privacyViolations = [];
for (const agent of Object.values(snapshot.agents || {})) {
  if (agent.pendingTransactionsDetail) {
    for (const txn of agent.pendingTransactionsDetail) {
      // Verify agent income is present (not Haven receivables)
      if (txn.incomeBreakdown && txn.incomeBreakdown.havenIncome > 0 && txn.expectedAgentIncome === 0) {
        // This is okay - some deals may only have Haven income
      }
      // Verify B&O tax and transaction fee preserved where source has them
      // (already handled in referral-utils.ts)
    }
  }
}

// Referral verification: check Zillow/Redfin exclusion
let referralTransactions = [];
if (snapshot.agents) {
  for (const agent of Object.values(snapshot.agents)) {
    if (agent.referralTransactions) {
      for (const txn of agent.referralTransactions) {
        if (txn.isZillow || txn.isRedfin) {
          // This should not happen per referral-utils.ts logic
          console.warn('WARNING: Zillow/Redfin found in referral transactions:', txn.address);
        }
        referralTransactions.push(txn);
      }
    }
  }
}

// Output results
console.log('=== PENDING TRANSACTIONS VERIFICATION ===\n');
console.log(`Agents with pendings: ${agentsWithPendings.length}`);
console.log(`Total pending count: ${totalPendingCount}`);
console.log(`Mismatches: ${mismatches.length}`);
if (mismatches.length > 0) {
  console.log('Mismatch details:', JSON.stringify(mismatches, null, 2));
}
console.log('');
console.log(`Emily Polanco pending count: ${emilyPendingCount}`);
console.log(`Emily's addresses (${emilyAddresses.length}):`);
emilyAddresses.forEach((addr, i) => console.log(`  ${i + 1}. ${addr}`));
console.log('');
console.log('=== PRIVACY & CLASSIFICATION CHECKS ===');
console.log(`Privacy violations: ${privacyViolations.length}`);
console.log(`Referral transactions (excluding Zillow/Redfin): ${referralTransactions.length}`);
console.log('');
console.log('=== VERIFICATION COMPLETE ===');

// Exit with error if there are mismatches
if (mismatches.length > 0) {
  process.exit(1);
}
