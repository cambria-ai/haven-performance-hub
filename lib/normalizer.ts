/**
 * Data normalization for Haven Performance Hub v1.
 * Transforms raw uploaded data into normalized snapshot format.
 */

import {
  WeeklySnapshot,
  AgentSnapshot,
  LeaderboardEntry,
  TeamStats,
  TransactionRecord,
  SnapshotMetadata,
  generateSnapshotId,
  getWeekDates,
} from './snapshot';

export interface NormalizedData {
  agents: Record<string, AgentSnapshot>;
  transactions: TransactionRecord[];
}

export interface ImportResult {
  snapshot: WeeklySnapshot;
  warnings: ImportWarning[];
  errors: ImportError[];
}

export interface ImportWarning {
  type: 'missing_source' | 'data_conflict' | 'agent_mismatch' | 'date_format';
  message: string;
  details?: any;
}

export interface ImportError {
  type: 'parse_error' | 'validation_error' | 'critical_missing';
  message: string;
  details?: any;
}

/**
 * Normalize raw parsed data into the snapshot format
 */
export function normalizeToSnapshot(
  parsedData: Record<string, any>,
  uploadedBy: string,
  sourceFiles: string[],
): ImportResult {
  const warnings: ImportWarning[] = [];
  const errors: ImportError[] = [];
  
  // Initialize agents from parsed data
  const agents = extractAgents(parsedData, warnings);
  
  // Extract and normalize transactions
  const transactions = extractTransactions(parsedData, agents, warnings);
  
  // Aggregate agent metrics from transactions and other sheets
  aggregateMetrics(agents, transactions, parsedData, warnings);
  
  // Build leaderboard
  const leaderboard = buildLeaderboard(agents);
  
  // Calculate team stats
  const teamStats = calculateTeamStats(agents);
  
  // Create metadata
  const { weekStart, weekEnd } = getWeekDates();
  const metadata: SnapshotMetadata = {
    id: generateSnapshotId(),
    createdAt: new Date().toISOString(),
    uploadedBy,
    sourceFiles,
    agentCount: Object.keys(agents).length,
    transactionCount: transactions.length,
    weekStart,
    weekEnd,
  };
  
  // Check for missing expected sources
  checkMissingSources(parsedData, warnings);
  
  const snapshot: WeeklySnapshot = {
    metadata,
    agents,
    leaderboard,
    teamStats,
  };
  
  return { snapshot, warnings, errors };
}

function extractAgents(parsedData: Record<string, any>, warnings: ImportWarning[]): Record<string, AgentSnapshot> {
  const agents: Record<string, AgentSnapshot> = {};
  
  // Look for agent roster sheets
  const agentSheets = Object.keys(parsedData).filter(key => 
    key.toLowerCase().includes('agent') || 
    key.toLowerCase().includes('roster')
  );
  
  if (agentSheets.length === 0) {
    warnings.push({
      type: 'missing_source',
      message: 'No agent roster sheet found. Agents will be derived from transaction data.',
    });
  }
  
  // Extract agents from roster sheets
  for (const sheetName of agentSheets) {
    const sheet = parsedData[sheetName];
    if (!sheet?.rows) continue;
    
    for (const row of sheet.rows) {
      const agentId = normalizeAgentId(row);
      if (!agentId) continue;
      
      if (!agents[agentId]) {
        agents[agentId] = createEmptyAgentSnapshot(agentId, row);
      }
    }
  }
  
  // Also extract from transaction sheets
  for (const sheet of Object.values(parsedData)) {
    if (!sheet?.rows) continue;
    for (const row of sheet.rows) {
      const agentId = normalizeAgentId(row);
      if (agentId && !agents[agentId]) {
        const agentName = getAgentName(row);
        agents[agentId] = createEmptyAgentSnapshot(agentId, { name: agentName });
      }
    }
  }
  
  return agents;
}

function createEmptyAgentSnapshot(id: string, rowData: any): AgentSnapshot {
  return {
    id,
    name: getAgentName(rowData) || id,
    closedTransactions: 0,
    closedVolume: 0,
    pendingTransactions: 0,
    pendingVolume: 0,
    activeListings: 0,
    cmasCompleted: 0,
    zillowLeads: 0,
    zillowConversion: 0,
    zillowCost: 0,
    gci: 0,
    capProgress: 0,
    capTarget: 0,
    commissionLevel: 0,
    payoutTotal: 0,
    havenFees: 0,
    boTax: 0,
    lni: 0,
    transactionFees: 0,
    calls: 0,
    showings: 0,
    emails: 0,
    transactions: [],
  };
}

function extractTransactions(
  parsedData: Record<string, any>,
  agents: Record<string, AgentSnapshot>,
  warnings: ImportWarning[]
): TransactionRecord[] {
  const transactions: TransactionRecord[] = [];
  
  // Look for transaction sheets
  const transactionSheets = Object.keys(parsedData).filter(key => 
    key.toLowerCase().includes('closed') ||
    key.toLowerCase().includes('pending') ||
    key.toLowerCase().includes('transaction') ||
    key.toLowerCase().includes('pnd')
  );
  
  for (const sheetName of transactionSheets) {
    const sheet = parsedData[sheetName];
    if (!sheet?.rows) continue;
    
    const isClosed = sheetName.toLowerCase().includes('closed');
    const isPending = sheetName.toLowerCase().includes('pending') || sheetName.toLowerCase().includes('pnd');
    const isRescinded = sheetName.toLowerCase().includes('rescind');
    
    for (const row of sheet.rows) {
      const agentId = normalizeAgentId(row);
      if (!agentId) continue;
      
      const transaction: TransactionRecord = {
        id: generateTransactionId(row),
        address: getFieldValue(row, ['address', 'property address', 'street']) || 'Unknown',
        status: isRescinded ? 'rescinded' : isClosed ? 'closed' : isPending ? 'pending' : 'pending',
        side: determineSide(row),
        closedDate: getDateField(row, ['closed date', 'closing date', 'close date']) || undefined,
        contractDate: getDateField(row, ['contract date', 'pending date', 'ratified date']) || undefined,
        price: getNumericField(row, ['price', 'sales price', 'sale price']) || 0,
        gci: getNumericField(row, ['gci', 'commission', 'gross commission']) || 0,
        leadSource: getFieldValue(row, ['lead source', 'source', 'origin']) || 'Unknown',
        isZillow: isZillowLead(row),
      };
      
      transactions.push(transaction);
      
      // Add to agent's transactions
      if (agents[agentId]) {
        agents[agentId].transactions = agents[agentId].transactions || [];
        agents[agentId].transactions!.push(transaction);
      }
    }
  }
  
  return transactions;
}

function aggregateMetrics(
  agents: Record<string, AgentSnapshot>,
  transactions: TransactionRecord[],
  parsedData: Record<string, any>,
  warnings: ImportWarning[]
) {
  // Aggregate from transactions
  for (const agent of Object.values(agents)) {
    const agentTransactions = agent.transactions || [];
    
    agent.closedTransactions = agentTransactions.filter(t => t.status === 'closed').length;
    agent.closedVolume = agentTransactions
      .filter(t => t.status === 'closed')
      .reduce((sum, t) => sum + t.price, 0);
    
    agent.pendingTransactions = agentTransactions.filter(t => t.status === 'pending').length;
    agent.pendingVolume = agentTransactions
      .filter(t => t.status === 'pending')
      .reduce((sum, t) => sum + t.price, 0);
    
    agent.gci = agentTransactions.reduce((sum, t) => sum + t.gci, 0);
    
    const zillowTransactions = agentTransactions.filter(t => t.isZillow && t.status === 'closed');
    agent.zillowLeads = agentTransactions.filter(t => t.isZillow).length;
  }
  
  // Extract from Zillow stats sheet
  const zillowSheet = parsedData['Zillow Stats'] || parsedData['Zillow'] || parsedData['Weekly Zillow Stats'];
  if (zillowSheet?.rows) {
    for (const row of zillowSheet.rows) {
      const agentId = normalizeAgentId(row);
      if (agentId && agents[agentId]) {
        agents[agentId].zillowConversion = getNumericField(row, ['conversion rate', 'conversion', 'conv %']) || 0;
        agents[agentId].zillowCost = getNumericField(row, ['total cost', 'cost', 'spend']) || 0;
      }
    }
  }
  
  // Extract from financial/payout sheets
  const payoutSheets = Object.keys(parsedData).filter(key => 
    key.toLowerCase().includes('payout') ||
    key.toLowerCase().includes('cap') ||
    key.toLowerCase().includes('financial')
  );
  
  for (const sheetName of payoutSheets) {
    const sheet = parsedData[sheetName];
    if (!sheet?.rows) continue;
    
    for (const row of sheet.rows) {
      const agentId = normalizeAgentId(row);
      if (agentId && agents[agentId]) {
        agents[agentId].capProgress = getNumericField(row, ['cap progress', 'cap paid', 'cap']) || 0;
        agents[agentId].capTarget = getNumericField(row, ['cap target', 'cap goal']) || 3000;
        agents[agentId].havenFees = getNumericField(row, ['haven fee', 'fee']) || 0;
        agents[agentId].boTax = getNumericField(row, ['b&o', 'b&o tax', 'tax']) || 0;
        agents[agentId].lni = getNumericField(row, ['l&i', 'lni', 'workers comp']) || 0;
        agents[agentId].transactionFees = getNumericField(row, ['transaction fee', 'tech fee', 'desk fee']) || 0;
        agents[agentId].payoutTotal = getNumericField(row, ['payout', 'net', 'agent payout']) || 0;
      }
    }
  }
  
  // Extract activity metrics
  const activitySheet = parsedData['Activities'] || parsedData['Activity'];
  if (activitySheet?.rows) {
    for (const row of activitySheet.rows) {
      const agentId = normalizeAgentId(row);
      if (agentId && agents[agentId]) {
        agents[agentId].calls = getNumericField(row, ['calls', 'phone calls']) || 0;
        agents[agentId].showings = getNumericField(row, ['showings', 'tours']) || 0;
        agents[agentId].emails = getNumericField(row, ['emails', 'e-mails']) || 0;
      }
    }
  }
  
  // Extract listings
  const listingsSheet = parsedData['Listings'] || parsedData['Active Listings'];
  if (listingsSheet?.rows) {
    for (const agent of Object.values(agents)) {
      const agentListings = listingsSheet.rows.filter((row: any) => normalizeAgentId(row) === agent.id);
      agent.activeListings = agentListings.length;
    }
  }
  
  // Extract CMAs
  const cmaSheet = parsedData['CMAS_2026'] || parsedData['CMAs'] || parsedData['CMA'];
  if (cmaSheet?.rows) {
    for (const agent of Object.values(agents)) {
      const agentCmas = cmaSheet.rows.filter((row: any) => normalizeAgentId(row) === agent.id);
      agent.cmasCompleted = agentCmas.filter((row: any) => {
        const status = getFieldValue(row, ['status', 'completed']);
        return status && status.toLowerCase().includes('complete');
      }).length;
    }
  }
}

function buildLeaderboard(agents: Record<string, AgentSnapshot>): LeaderboardEntry[] {
  const entries = Object.values(agents).map(agent => ({
    agentId: agent.id,
    agentName: agent.name,
    closedTransactions: agent.closedTransactions,
    closedVolume: agent.closedVolume,
    pendingTransactions: agent.pendingTransactions,
    zillowClosed: (agent.transactions || []).filter(t => t.isZillow && t.status === 'closed').length,
  }));
  
  // Sort by primary metric (closed transactions), then tiebreakers
  entries.sort((a, b) => {
    if (b.closedTransactions !== a.closedTransactions) {
      return b.closedTransactions - a.closedTransactions;
    }
    if (b.closedVolume !== a.closedVolume) {
      return b.closedVolume - a.closedVolume;
    }
    if (b.pendingTransactions !== a.pendingTransactions) {
      return b.pendingTransactions - a.pendingTransactions;
    }
    return b.zillowClosed - a.zillowClosed;
  });
  
  // Assign ranks and calculate distances
  const leaderboard: LeaderboardEntry[] = entries.map((entry, index) => {
    const nextEntry = entries[index + 1];
    return {
      rank: index + 1,
      ...entry,
      movement: 'same', // Will be calculated when comparing to previous snapshot
      distanceToNext: nextEntry ? entry.closedTransactions - nextEntry.closedTransactions : 0,
    };
  });
  
  return leaderboard;
}

function calculateTeamStats(agents: Record<string, AgentSnapshot>): TeamStats {
  const agentValues = Object.values(agents);
  
  return {
    totalClosedTransactions: agentValues.reduce((sum, a) => sum + a.closedTransactions, 0),
    totalClosedVolume: agentValues.reduce((sum, a) => sum + a.closedVolume, 0),
    totalPendingTransactions: agentValues.reduce((sum, a) => sum + a.pendingTransactions, 0),
    totalActiveListings: agentValues.reduce((sum, a) => sum + a.activeListings, 0),
    totalCmasCompleted: agentValues.reduce((sum, a) => sum + a.cmasCompleted, 0),
    avgZillowConversion: agentValues.length > 0 
      ? agentValues.reduce((sum, a) => sum + a.zillowConversion, 0) / agentValues.length 
      : 0,
    totalZillowLeads: agentValues.reduce((sum, a) => sum + a.zillowLeads, 0),
    totalZillowCost: agentValues.reduce((sum, a) => sum + a.zillowCost, 0),
  };
}

function checkMissingSources(parsedData: Record<string, any>, warnings: ImportWarning[]) {
  const expectedSources = [
    'transactions',
    'zillow',
    'payout',
    'listings',
  ];
  
  const availableSources = Object.keys(parsedData).map(k => k.toLowerCase());
  
  for (const expected of expectedSources) {
    if (!availableSources.some(s => s.includes(expected))) {
      warnings.push({
        type: 'missing_source',
        message: `Expected source containing "${expected}" not found in upload.`,
      });
    }
  }
}

// Helper functions

function normalizeAgentId(row: any): string | null {
  const name = getAgentName(row);
  if (!name) return null;
  
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getAgentName(row: any): string | null {
  const keys = ['agent', 'agent name', 'agent_name', 'team member', 'name', 'realtor'];
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) {
      return String(row[key]).trim();
    }
  }
  return null;
}

function getFieldValue(row: any, keys: string[]): string | null {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim()) {
      return String(row[key]).trim();
    }
  }
  return null;
}

function getNumericField(row: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (value != null) {
      const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : Number(value);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

function getDateField(row: any, keys: string[]): string | null {
  for (const key of keys) {
    if (row[key]) {
      const date = new Date(row[key]);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }
  return null;
}

function determineSide(row: any): 'buyer' | 'seller' | 'both' {
  const side = getFieldValue(row, ['side', 'transaction side', 'type']);
  if (!side) return 'both';
  
  const lower = side.toLowerCase();
  if (lower.includes('buyer')) return 'buyer';
  if (lower.includes('seller')) return 'seller';
  return 'both';
}

function isZillowLead(row: any): boolean {
  const source = getFieldValue(row, ['lead source', 'source', 'origin']);
  if (!source) return false;
  
  const lower = source.toLowerCase();
  return lower.includes('zillow') || lower.includes('zhl') || lower.includes('z');
}

function generateTransactionId(row: any): string {
  const address = getFieldValue(row, ['address', 'property address']) || 'unknown';
  const price = getNumericField(row, ['price', 'sales price']) || 0;
  const date = getDateField(row, ['closed date', 'contract date']) || Date.now().toString();
  
  return `txn-${Date.now()}-${address.slice(0, 10)}-${price}`;
}
