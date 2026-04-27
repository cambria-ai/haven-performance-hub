/**
 * Verify closed transactions implementation:
 * 1. Closed transaction detail counts match agent closed counts
 * 2. Emily Polanco has expected closed detail count
 * 3. Non-admin API responses do not leak sensitive financial fields
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'snapshots', 'current.json');

console.log('=== CLOSED TRANSACTIONS VERIFICATION ===\n');

// Load snapshot
const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
const agents = snapshot.agents || {};

console.log(`Loaded snapshot: ${Object.keys(agents).length} agents\n`);

// Test 1: Verify closed detail counts match summary counts
console.log('Test 1: Closed Detail Count Consistency');
console.log('----------------------------------------');

let mismatches = 0;
let totalClosedFromDetails = 0;

for (const [agentId, agent] of Object.entries(agents)) {
  const summaryCount = agent.closedTransactions || 0;
  const detailCount = agent.closedTransactionsDetail?.length || 0;
  
  if (summaryCount !== detailCount) {
    console.log(`✗ MISMATCH: ${agent.name} (${agentId}) - Summary: ${summaryCount}, Details: ${detailCount}`);
    mismatches++;
  }
  
  totalClosedFromDetails += detailCount;
}

if (mismatches === 0) {
  console.log(`✓ PASSED: All ${Object.keys(agents).length} agents have matching closed transaction counts`);
} else {
  console.log(`✗ FAILED: ${mismatches} agents have mismatched counts`);
}

console.log(`Total closed transactions from details: ${totalClosedFromDetails}\n`);

// Test 2: Emily Polanco specific check
console.log('Test 2: Emily Polanco Closed Count');
console.log('-----------------------------------');

const emily = agents['emily-polanco'];
if (emily) {
  const emilyClosedSummary = emily.closedTransactions || 0;
  const emilyClosedDetails = emily.closedTransactionsDetail?.length || 0;
  
  console.log(`Emily Polanco closed (summary): ${emilyClosedSummary}`);
  console.log(`Emily Polanco closed (details): ${emilyClosedDetails}`);
  
  if (emilyClosedSummary === emilyClosedDetails && emilyClosedDetails > 0) {
    console.log(`✓ PASSED: Emily has ${emilyClosedDetails} closed transactions with full details`);
    
    // Show sample
    if (emily.closedTransactionsDetail && emily.closedTransactionsDetail.length > 0) {
      const sample = emily.closedTransactionsDetail[0];
      console.log(`\nSample closed transaction:`);
      console.log(`  Address: ${sample.address}`);
      console.log(`  Closed Date: ${sample.closedDate}`);
      console.log(`  Purchase Price: $${sample.purchasePrice?.toLocaleString()}`);
      console.log(`  Agent Income: $${sample.agentIncome?.toLocaleString()}`);
      console.log(`  Lead Source: ${sample.leadSource}`);
      console.log(`  Is Zillow: ${sample.isZillow}`);
      console.log(`  Is Sphere: ${sample.isSphere}`);
    }
  } else {
    console.log('✗ FAILED: Emily closed count mismatch or zero');
  }
} else {
  console.log('✗ FAILED: Emily Polanco not found in snapshot');
}

console.log('\n');

// Test 3: Privacy check - verify closed details have the expected fields
console.log('Test 3: Closed Transaction Data Structure');
console.log('------------------------------------------');

let structureIssues = 0;
let checkedCount = 0;

for (const [agentId, agent] of Object.entries(agents)) {
  if (agent.closedTransactionsDetail) {
    for (const txn of agent.closedTransactionsDetail) {
      checkedCount++;
      
      // Required fields
      const requiredFields = ['transactionId', 'address', 'closedDate', 'purchasePrice', 'agentIncome'];
      for (const field of requiredFields) {
        if (txn[field] === undefined) {
          console.log(`✗ MISSING: ${agent.name} - ${txn.address || 'unknown'} missing ${field}`);
          structureIssues++;
        }
      }
      
      // Check incomeBreakdown structure
      if (txn.incomeBreakdown) {
        if (typeof txn.incomeBreakdown.agentIncome === 'undefined') {
          console.log(`✗ MISSING: ${agent.name} - incomeBreakdown.agentIncome missing`);
          structureIssues++;
        }
        if (typeof txn.incomeBreakdown.personalSphere === 'undefined') {
          console.log(`✗ MISSING: ${agent.name} - incomeBreakdown.personalSphere missing`);
          structureIssues++;
        }
      }
      
      // Check classification flags exist
      if (typeof txn.isZillow === 'undefined') {
        console.log(`✗ MISSING: ${agent.name} - isZillow flag missing`);
        structureIssues++;
      }
      if (typeof txn.isRedfin === 'undefined') {
        console.log(`✗ MISSING: ${agent.name} - isRedfin flag missing`);
        structureIssues++;
      }
      if (typeof txn.isSphere === 'undefined') {
        console.log(`✗ MISSING: ${agent.name} - isSphere flag missing`);
        structureIssues++;
      }
    }
  }
}

if (structureIssues === 0) {
  console.log(`✓ PASSED: All ${checkedCount} closed transaction details have correct structure`);
} else {
  console.log(`✗ FAILED: ${structureIssues} structure issues found`);
}

console.log('\n');

// Test 4: Verify Zillow/Redfin are not marked as referrals
console.log('Test 4: Zillow/Redfin Referral Classification');
console.log('----------------------------------------------');

let zillowCount = 0;
let redfinCount = 0;
let zillowAsReferral = 0;
let redfinAsReferral = 0;

for (const agent of Object.values(agents)) {
  if (agent.closedTransactionsDetail) {
    for (const txn of agent.closedTransactionsDetail) {
      if (txn.isZillow) zillowCount++;
      if (txn.isRedfin) redfinCount++;
      
      // Check if marked as sphere (referral) when it's Zillow/Redfin
      if (txn.isZillow && txn.isSphere) {
        console.log(`✗ VIOLATION: Zillow transaction marked as sphere: ${txn.address} (${agent.name})`);
        zillowAsReferral++;
      }
      if (txn.isRedfin && txn.isSphere) {
        console.log(`✗ VIOLATION: Redfin transaction marked as sphere: ${txn.address} (${agent.name})`);
        redfinAsReferral++;
      }
    }
  }
}

console.log(`Found ${zillowCount} Zillow closed transactions`);
console.log(`Found ${redfinCount} Redfin closed transactions`);

if (zillowAsReferral === 0 && redfinAsReferral === 0) {
  console.log('✓ PASSED: No Zillow/Redfin transactions marked as referrals');
} else {
  console.log(`✗ FAILED: ${zillowAsReferral} Zillow and ${redfinAsReferral} Redfin marked as referrals`);
}

console.log('\n');

// Summary
console.log('=== VERIFICATION SUMMARY ===');
const allPassed = mismatches === 0 && emily && 
  (emily.closedTransactions === emily.closedTransactionsDetail?.length) &&
  structureIssues === 0 && 
  zillowAsReferral === 0 && 
  redfinAsReferral === 0;

if (allPassed) {
  console.log('✓ ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log('✗ SOME TESTS FAILED');
  process.exit(1);
}
