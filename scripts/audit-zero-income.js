/**
 * Zero-Income Transaction Audit Script
 * Identifies all transactions where displayed income is 0 or missing
 * Categorizes by: closed vs pending, agent, root cause
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOT_PATH = path.join(__dirname, '..', 'data', 'snapshots', 'current.json');

console.log('=== ZERO-INCOME TRANSACTION AUDIT ===\n');

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
const agents = snapshot.agents || {};

const audit = {
  closedZeroIncome: [],
  pendingZeroIncome: [],
  closedMissingSource: [],
  pendingMissingSource: [],
  summary: {
    totalClosed: 0,
    totalPending: 0,
    closedWithZeroAgentIncome: 0,
    pendingWithZeroAgentIncome: 0,
    closedWithZeroHavenIncome: 0,
    pendingWithZeroHavenIncome: 0,
    closedWithAllZeroIncome: 0,
    pendingWithAllZeroIncome: 0,
  }
};

// Analyze all agents
for (const [agentId, agent] of Object.entries(agents)) {
  // Skip empty/invalid agents
  if (!agent.name || agent.name.trim().length < 2 || agent.name.toUpperCase() === 'AGENT') continue;
  
  // Closed transactions
  if (agent.closedTransactionsDetail) {
    for (const txn of agent.closedTransactionsDetail) {
      audit.summary.totalClosed++;
      
      const agentIncome = txn.agentIncome || 0;
      const havenIncome = txn.incomeBreakdown?.havenIncome || 0;
      const personalSphere = txn.incomeBreakdown?.personalSphere || 0;
      const allZero = agentIncome === 0 && havenIncome === 0 && personalSphere === 0;
      
      if (havenIncome === 0) audit.summary.closedWithZeroHavenIncome++;
      if (agentIncome === 0) audit.summary.closedWithZeroAgentIncome++;
      if (allZero) {
        audit.summary.closedWithAllZeroIncome++;
        audit.closedZeroIncome.push({
          agentId,
          agentName: agent.name,
          transactionId: txn.transactionId,
          address: txn.address,
          closedDate: txn.closedDate,
          purchasePrice: txn.purchasePrice,
          agentIncome,
          havenIncome,
          personalSphere,
          leadSource: txn.leadSource || 'Unknown',
          isSphere: txn.isSphere || false,
          isZillow: txn.isZillow || false,
          isRedfin: txn.isRedfin || false,
          sourceIncomeField: txn.sourceIncomeField || 'Unknown',
        });
      }
    }
  }
  
  // Pending transactions
  if (agent.pendingTransactionsDetail) {
    for (const txn of agent.pendingTransactionsDetail) {
      audit.summary.totalPending++;
      
      const expectedAgentIncome = txn.expectedAgentIncome || 0;
      const agentIncome = txn.incomeBreakdown?.agentIncome || 0;
      const havenIncome = txn.incomeBreakdown?.havenIncome || 0;
      const personalSphere = txn.incomeBreakdown?.personalSphere || 0;
      const allZero = expectedAgentIncome === 0 && agentIncome === 0 && havenIncome === 0 && personalSphere === 0;
      
      if (havenIncome === 0) audit.summary.pendingWithZeroHavenIncome++;
      if (agentIncome === 0) audit.summary.pendingWithZeroAgentIncome++;
      if (allZero) {
        audit.summary.pendingWithAllZeroIncome++;
        audit.pendingZeroIncome.push({
          agentId,
          agentName: agent.name,
          transactionId: txn.transactionId,
          address: txn.address,
          contractDate: txn.contractDate,
          expectedClosingDate: txn.expectedClosingDate,
          purchasePrice: txn.purchasePrice,
          expectedAgentIncome,
          agentIncome,
          havenIncome,
          personalSphere,
          leadSource: txn.leadSource || 'Unknown',
          isSphere: txn.isSphere || false,
          isZillow: txn.isZillow || false,
          sourceIncomeField: txn.sourceIncomeField || 'Unknown',
        });
      }
    }
  }
}

// Print summary
console.log('SUMMARY');
console.log('=======');
console.log(`Total closed transactions: ${audit.summary.totalClosed}`);
console.log(`Total pending transactions: ${audit.summary.totalPending}`);
console.log('');
console.log('Closed Transactions:');
console.log(`  - With zero Haven Income: ${audit.summary.closedWithZeroHavenIncome}`);
console.log(`  - With zero Agent Income: ${audit.summary.closedWithZeroAgentIncome}`);
console.log(`  - With ALL income fields zero: ${audit.summary.closedWithAllZeroIncome}`);
console.log('');
console.log('Pending Transactions:');
console.log(`  - With zero Haven Income: ${audit.summary.pendingWithZeroHavenIncome}`);
console.log(`  - With zero Agent Income: ${audit.summary.pendingWithZeroAgentIncome}`);
console.log(`  - With ALL income fields zero: ${audit.summary.pendingWithAllZeroIncome}`);
console.log('');

// Print detailed lists
if (audit.closedZeroIncome.length > 0) {
  console.log('CLOSED TRANSACTIONS WITH ZERO INCOME');
  console.log('====================================');
  audit.closedZeroIncome.forEach((txn, i) => {
    console.log(`\n${i + 1}. ${txn.address}`);
    console.log(`   Agent: ${txn.agentName}`);
    console.log(`   Closed: ${txn.closedDate?.split('T')[0]}`);
    console.log(`   Price: $${txn.purchasePrice?.toLocaleString()}`);
    console.log(`   Agent Income: $${txn.agentIncome?.toLocaleString()}`);
    console.log(`   Haven Income: $${txn.havenIncome?.toLocaleString()}`);
    console.log(`   Personal Sphere: $${txn.personalSphere?.toLocaleString()}`);
    console.log(`   Lead Source: ${txn.leadSource}`);
    console.log(`   Source Field: ${txn.sourceIncomeField}`);
    console.log(`   Is Sphere: ${txn.isSphere}`);
  });
  console.log('');
}

if (audit.pendingZeroIncome.length > 0) {
  console.log('PENDING TRANSACTIONS WITH ZERO INCOME');
  console.log('=====================================');
  audit.pendingZeroIncome.forEach((txn, i) => {
    console.log(`\n${i + 1}. ${txn.address}`);
    console.log(`   Agent: ${txn.agentName}`);
    console.log(`   Contract: ${txn.contractDate?.split('T')[0]}`);
    console.log(`   Expected Close: ${txn.expectedClosingDate?.split('T')[0]}`);
    console.log(`   Price: $${txn.purchasePrice?.toLocaleString()}`);
    console.log(`   Expected Agent Income: $${txn.expectedAgentIncome?.toLocaleString()}`);
    console.log(`   Agent Income (breakdown): $${txn.agentIncome?.toLocaleString()}`);
    console.log(`   Haven Income (breakdown): $${txn.havenIncome?.toLocaleString()}`);
    console.log(`   Personal Sphere: $${txn.personalSphere?.toLocaleString()}`);
    console.log(`   Lead Source: ${txn.leadSource}`);
    console.log(`   Source Field: ${txn.sourceIncomeField}`);
    console.log(`   Is Sphere: ${txn.isSphere}`);
  });
  console.log('');
}

// Save audit results
const outputPath = path.join(__dirname, '..', 'data', 'zero-income-audit.json');
fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2));
console.log(`\nAudit results saved to: ${outputPath}`);

// Exit with warning if there are zero-income transactions
if (audit.closedWithAllZeroIncome > 0 || audit.pendingWithAllZeroIncome > 0) {
  console.log('\n⚠️  WARNING: Zero-income transactions found - review required');
  process.exit(0); // Don't fail - this is informational
} else {
  console.log('\n✓ All transactions have income data');
  process.exit(0);
}
