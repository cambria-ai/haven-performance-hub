/**
 * Google Sheets data loader for Haven Performance Hub.
 * Fetches data from accessible Google Sheets via public CSV export endpoints.
 * Builds real snapshots from source-backed data with time-window rollups.
 */

import {
  WeeklySnapshot,
  AgentSnapshot,
  LeaderboardEntry,
  TeamStats,
  TransactionRecord,
  SnapshotMetadata,
  CapContribution,
  generateSnapshotId,
  getWeekDates,
  CAP_MAX,
} from './snapshot';

export interface TimeWindowStats {
  weekly: MetricRollup;
  monthly: MetricRollup;
  yearly: MetricRollup;
}

export interface MetricRollup {
  period: string;
  startDate: string;
  endDate: string;
  showings: number;
  cmasCompleted: number;
  listings: number;
  pendings: number;
  solds: number;
  closedVolume: number;
  pendingVolume: number;
}

export interface LoadResult {
  snapshot: WeeklySnapshot;
  timeWindowStats: Record<string, TimeWindowStats>; // keyed by agentId
  warnings: string[];
  errors: string[];
  sourcesLoaded: string[];
}

export interface SheetSource {
  id: string;
  name: string;
  tabs: string[];
}

// Accessible Google Sheet sources
export const ACCESSIBLE_SOURCES: SheetSource[] = [
  {
    id: '15Wfyp7Z8hvLayj2DtPQ9K_ydtdwIUojLhmlVzHOra3k',
    name: 'Haven Master Payout & Cap Dashboard',
    tabs: ['MASTER HAVEN PNDS'],
  },
  {
    id: '1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl',
    name: 'Haven Transactions 2026',
    tabs: ['MASTER HAVEN PNDS', 'Master Closed 2026', 'Listings', 'CMAS_2026'],
  },
  {
    id: '1cqoprcDPxah-1b9gSUiXwNUFJBlCcfrq5-XyUmIarmI',
    name: 'Weekly Zillow Stats',
    tabs: ['Sheet1'],
  },
  {
    id: '11lKgPwG_p7PTTD7nSetijPxx9gz5NEw0U20foCA9On4',
    name: 'Zillow Transactions Tracking',
    tabs: ['Sheet1'],
  },
];

// Locked/unavailable sources (explicitly NOT loaded)
export const LOCKED_SOURCES: string[] = [
  'Haven 2026 Offer Activity Reports',
  'WA Haven RE Group Commission Spreadsheet',
  'ID Haven RE Group Commission Spreadsheet',
];

/**
 * Fetch a Google Sheet as CSV using the gviz endpoint (no auth required for public/link-shared sheets)
 */
export async function fetchSheetCSV(spreadsheetId: string, gid?: string): Promise<string> {
  const url = gid 
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`
    : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet ${spreadsheetId}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Parse CSV text into rows of objects
 */
export function parseCSV(csvText: string): Record<string, any>[] {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // Parse header line (handle quoted fields)
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    
    const row: Record<string, any> = {};
    headers.forEach((header, idx) => {
      if (header && values[idx] !== undefined) {
        row[header] = values[idx];
      }
    });
    rows.push(row);
  }
  
  return rows;
}

/**
 * Parse a single CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

/**
 * Load all accessible sheet data and build a real snapshot
 */
export async function loadFromGoogleSheets(): Promise<LoadResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const sourcesLoaded: string[] = [];
  
  const allTransactions: TransactionRecord[] = [];
  const agents: Record<string, AgentSnapshot> = {};
  const activityData: any[] = [];
  const zillowData: any[] = [];
  const listingsData: any[] = [];
  const cmasData: any[] = [];
  const capContributions: Record<string, CapContribution[]> = {};
  
  // Load from each accessible source
  for (const source of ACCESSIBLE_SOURCES) {
    try {
      const csvText = await fetchSheetCSV(source.id);
      const rows = parseCSV(csvText);
      
      if (rows.length === 0) {
        warnings.push(`Sheet "${source.name}" returned no data`);
        continue;
      }
      
      sourcesLoaded.push(source.name);
      
      // Categorize data by sheet structure
      if (source.name.includes('Transactions')) {
        // Parse transaction data
        for (const row of rows) {
          const txn = parseTransactionFromRow(row);
          if (txn && txn.agentId) {
            allTransactions.push(txn);
            
            // Initialize agent if needed (only valid agent names)
            if (txn.agentId && !agents[txn.agentId] && isValidAgentName(txn.agentName || txn.agentId)) {
              agents[txn.agentId] = createEmptyAgent(txn.agentName || txn.agentId);
              capContributions[txn.agentId] = [];
            }
          }
        }
      }
      
      if (source.name.includes('Payout') || source.name.includes('Cap')) {
        // Parse financial/payout data
        for (const row of rows) {
          const agentId = extractAgentId(row);
          const agentName = extractAgentName(row);
          // Only process rows with valid agent names
          if (agentId && agentName && isValidAgentName(agentName)) {
            if (!agents[agentId]) {
              agents[agentId] = createEmptyAgent(agentName);
              capContributions[agentId] = [];
            }
            if (agents[agentId]) {
              updateAgentFinancials(agents[agentId], row);
            }
          }
        }
      }
      
      if (source.name.includes('Zillow')) {
        zillowData.push(...rows);
      }
      
      if (source.name.includes('Listings')) {
        listingsData.push(...rows);
      }
      
      if (source.name.includes('CMA') || source.name.includes('CMAS')) {
        cmasData.push(...rows);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to load "${source.name}": ${msg}`);
    }
  }
  
  // Aggregate transaction metrics per agent and calculate cap contributions
  for (const txn of allTransactions) {
    if (!txn.agentId || !agents[txn.agentId]) continue;
    const agent = agents[txn.agentId];
    
    if (txn.status === 'closed') {
      agent.closedTransactions += 1;
      agent.closedVolume += txn.price;
    } else if (txn.status === 'pending') {
      agent.pendingTransactions += 1;
      agent.pendingVolume += txn.price;
    }
    
    if (txn.isZillow) {
      agent.zillowLeads += 1;
    }
    
    agent.gci += txn.gci;
    
    // Calculate cap contribution for sphere deals only
    if (txn.isSphere && txn.status === 'closed' && txn.capContribution) {
      const remainingCap = Math.max(0, CAP_MAX - agent.capProgress);
      const actualContribution = Math.min(txn.capContribution, remainingCap);
      
      agent.capProgress += actualContribution;
      txn.capContribution = actualContribution;
      
      // Track cap-contributing transactions
      capContributions[txn.agentId].push({
        transactionId: txn.id,
        address: txn.address,
        closedDate: txn.closedDate,
        contractDate: txn.contractDate,
        purchasePrice: txn.price,
        capContribution: actualContribution,
        isSphere: true,
        notes: txn.leadSource,
      });
    }
  }
  
  // Process Zillow stats
  for (const row of zillowData) {
    const agentId = extractAgentId(row);
    const agentName = extractAgentName(row);
    if (agentId && agentName && isValidAgentName(agentName) && agents[agentId]) {
      const conversion = parsePercent(row['conversion rate'] || row['conversion'] || row['Conv %']);
      const cost = parseCurrency(row['total cost'] || row['cost'] || row['spend']);
      if (conversion !== null) agents[agentId].zillowConversion = conversion;
      if (cost !== null) agents[agentId].zillowCost = cost;
    }
  }
  
  // Process listings
  for (const row of listingsData) {
    const agentId = extractAgentId(row);
    const agentName = extractAgentName(row);
    if (agentId && agentName && isValidAgentName(agentName) && agents[agentId]) {
      agents[agentId].activeListings += 1;
    }
  }
  
  // Process CMAs
  for (const row of cmasData) {
    const agentId = extractAgentId(row);
    const agentName = extractAgentName(row);
    const status = (row['status'] || '').toLowerCase();
    if (agentId && agentName && isValidAgentName(agentName) && agents[agentId] && status.includes('complete')) {
      agents[agentId].cmasCompleted += 1;
    }
  }
  
  // Final cleanup: remove any agents that don't pass validation (safety net)
  for (const agentId of Object.keys(agents)) {
    const agent = agents[agentId];
    if (!isValidAgentName(agent.name)) {
      delete agents[agentId];
      delete capContributions[agentId];
      warnings.push(`Removed invalid agent entry: "${agent.name}"`);
    }
  }
  
  // Attach cap-contributing transactions to each agent
  for (const [agentId, agent] of Object.entries(agents)) {
    if (capContributions[agentId] && capContributions[agentId].length > 0) {
      agent.capContributingTransactions = capContributions[agentId];
    }
  }
  
  // Build leaderboard
  const leaderboard = buildLeaderboard(agents);
  
  // Calculate team stats
  const teamStats = calculateTeamStats(agents);
  
  // Build time-window rollups
  const timeWindowStats = buildTimeWindowStats(allTransactions, agents);
  
  // Create metadata
  const { weekStart, weekEnd } = getWeekDates();
  const metadata: SnapshotMetadata = {
    id: generateSnapshotId(),
    createdAt: new Date().toISOString(),
    uploadedBy: 'google-sheets-auto-load',
    sourceFiles: sourcesLoaded,
    agentCount: Object.keys(agents).length,
    transactionCount: allTransactions.length,
    weekStart,
    weekEnd,
    notes: `Auto-loaded from ${sourcesLoaded.length} accessible Google Sheets. Locked sources excluded: ${LOCKED_SOURCES.join(', ')}.`,
  };
  
  // Build final snapshot
  const snapshot: WeeklySnapshot = {
    metadata,
    agents,
    leaderboard,
    teamStats,
  };
  
  return {
    snapshot,
    timeWindowStats,
    warnings,
    errors,
    sourcesLoaded,
  };
}

/**
 * Build time-window rollups (weekly, monthly, yearly) for production metrics
 */
function buildTimeWindowStats(
  transactions: TransactionRecord[],
  agents: Record<string, AgentSnapshot>
): Record<string, TimeWindowStats> {
  const result: Record<string, TimeWindowStats> = {};
  const now = new Date();
  
  for (const [agentId, agent] of Object.entries(agents)) {
    const agentTxns = transactions.filter(t => t.agentId === agentId);
    
    result[agentId] = {
      weekly: calculateRollup(agentTxns, now, 'week'),
      monthly: calculateRollup(agentTxns, now, 'month'),
      yearly: calculateRollup(agentTxns, now, 'year'),
    };
  }
  
  return result;
}

/**
 * Calculate a metric rollup for a specific time window
 */
function calculateRollup(
  transactions: TransactionRecord[],
  referenceDate: Date,
  period: 'week' | 'month' | 'year'
): MetricRollup {
  const { startDate, endDate } = getPeriodBounds(referenceDate, period);
  
  const filtered = transactions.filter(t => {
    const txnDate = t.closedDate ? new Date(t.closedDate) : t.contractDate ? new Date(t.contractDate) : null;
    if (!txnDate) return false;
    return txnDate >= startDate && txnDate <= endDate;
  });
  
  const solds = filtered.filter(t => t.status === 'closed').length;
  const pendings = filtered.filter(t => t.status === 'pending').length;
  const listings = filtered.filter(t => t.side === 'seller').length;
  
  return {
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    showings: 0, // Not available in current source data
    cmasCompleted: 0, // Would need activity sheet with dates
    listings,
    pendings,
    solds,
    closedVolume: filtered.filter(t => t.status === 'closed').reduce((sum, t) => sum + t.price, 0),
    pendingVolume: filtered.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.price, 0),
  };
}

/**
 * Get date bounds for a period type
 */
function getPeriodBounds(referenceDate: Date, period: 'week' | 'month' | 'year'): { startDate: Date; endDate: Date } {
  const endDate = new Date(referenceDate);
  const startDate = new Date(referenceDate);
  
  switch (period) {
    case 'week':
      // Start of current week (Monday)
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'year':
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setMonth(11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;
  }
  
  return { startDate, endDate };
}

/**
 * Parse a transaction from a raw sheet row
 */
function parseTransactionFromRow(row: Record<string, any>): TransactionRecord | null {
  const agentName = extractAgentName(row);
  if (!agentName) return null;
  
  const agentId = normalizeAgentId(agentName);
  const address = row['ADDRESS'] || row['address'] || row['Property Address'] || 'Unknown';
  const price = parseCurrency(row['PRICE'] || row['price'] || row['Purchase Price'] || row['Sales Price']);
  const gci = parseCurrency(row['Gross Commission'] || row['GCI'] || row['commission']) || (price ? price * 0.03 : 0);
  
  const closedDate = parseDate(row['CLOSING'] || row['Closing Date'] || row['Closed Date']);
  const contractDate = parseDate(row['Mutual Acceptance'] || row['Contract Date'] || row['Pending Date']);
  
  const leadSource = row['Lead Source'] || row['lead source'] || 'Unknown';
  const isZillow = leadSource.toLowerCase().includes('zillow') || leadSource.toLowerCase().includes('zhl');
  
  // Determine if this is a sphere deal (cap-eligible)
  // Sphere = Personal, SOI, Repeat Client, Referral from past client
  // NOT sphere = Zillow, Redfin, Realtor.com, Floor time, Cold lead
  const isSphere = isSphereDeal(leadSource);
  
  // Determine status
  let status: 'closed' | 'pending' | 'rescinded' = 'pending';
  if (closedDate) {
    status = 'closed';
  } else if (row['Rescinded'] || (row['status'] || '').toLowerCase().includes('rescind')) {
    status = 'rescinded';
  }
  
  // Determine side
  let side: 'buyer' | 'seller' | 'both' = 'both';
  const type = (row['Purch/List'] || row['type'] || '').toLowerCase();
  if (type.includes('purch')) side = 'buyer';
  else if (type.includes('list')) side = 'seller';
  
  // Calculate cap contribution (3% of GCI for sphere deals, capped at agent's remaining cap)
  // Only sphere deals contribute to cap
  const capContribution = isSphere && status === 'closed' ? gci * 0.03 : 0;
  
  return {
    id: `txn-${Date.now()}-${agentId}-${address.toString().slice(0, 10)}`,
    address: String(address),
    status,
    side,
    closedDate: closedDate?.toISOString(),
    contractDate: contractDate?.toISOString(),
    price: price || 0,
    gci: gci || 0,
    leadSource: String(leadSource),
    isZillow,
    isSphere,
    capContribution,
    agentId,
    agentName,
  };
}

/**
 * Create an empty agent snapshot
 */
function createEmptyAgent(name: string): AgentSnapshot {
  const id = normalizeAgentId(name);
  return {
    id,
    name,
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
    capTarget: 3000,
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

/**
 * Update agent financials from a payout row
 */
function updateAgentFinancials(agent: AgentSnapshot, row: Record<string, any>) {
  const capProgress = parseCurrency(row['cap progress'] || row['cap paid'] || row['Cap Progress']);
  const capTarget = parseCurrency(row['cap target'] || row['cap goal']);
  const havenFees = parseCurrency(row['Haven Gross Commission'] || row['haven fee'] || row['Haven Fee']);
  const boTax = parseCurrency(row['B&O Tax'] || row['b&o'] || row['Agent B&O Tax']);
  const lni = parseCurrency(row['L&I'] || row['lni'] || row['Workers Comp']);
  const transactionFees = parseCurrency(row['Transaction Fees'] || row['transaction fee'] || row['TF']);
  const payoutTotal = parseCurrency(row['Agent Net Commission'] || row['payout'] || row['Agent Income']);
  
  if (capProgress !== null) agent.capProgress = capProgress;
  if (capTarget !== null) agent.capTarget = capTarget;
  if (havenFees !== null) agent.havenFees = havenFees;
  if (boTax !== null) agent.boTax = boTax;
  if (lni !== null) agent.lni = lni;
  if (transactionFees !== null) agent.transactionFees = transactionFees;
  if (payoutTotal !== null) agent.payoutTotal = payoutTotal;
}

/**
 * Build leaderboard from agents
 */
function buildLeaderboard(agents: Record<string, AgentSnapshot>): LeaderboardEntry[] {
  const entries = Object.values(agents).map(agent => ({
    agentId: agent.id,
    agentName: agent.name,
    closedTransactions: agent.closedTransactions,
    closedVolume: agent.closedVolume,
    pendingTransactions: agent.pendingTransactions,
    zillowClosed: (agent.transactions || []).filter(t => t.isZillow && t.status === 'closed').length,
  }));
  
  entries.sort((a, b) => {
    if (b.closedTransactions !== a.closedTransactions) return b.closedTransactions - a.closedTransactions;
    if (b.closedVolume !== a.closedVolume) return b.closedVolume - a.closedVolume;
    if (b.pendingTransactions !== a.pendingTransactions) return b.pendingTransactions - a.pendingTransactions;
    return b.zillowClosed - a.zillowClosed;
  });
  
  return entries.map((entry, index) => ({
    rank: index + 1,
    ...entry,
    movement: 'same',
    distanceToNext: entries[index + 1] ? entry.closedTransactions - entries[index + 1].closedTransactions : 0,
  }));
}

/**
 * Calculate team stats
 */
function calculateTeamStats(agents: Record<string, AgentSnapshot>): TeamStats {
  const values = Object.values(agents);
  return {
    totalClosedTransactions: values.reduce((sum, a) => sum + a.closedTransactions, 0),
    totalClosedVolume: values.reduce((sum, a) => sum + a.closedVolume, 0),
    totalPendingTransactions: values.reduce((sum, a) => sum + a.pendingTransactions, 0),
    totalPendingVolume: values.reduce((sum, a) => sum + a.pendingVolume, 0),
    totalActiveListings: values.reduce((sum, a) => sum + a.activeListings, 0),
    totalCmasCompleted: values.reduce((sum, a) => sum + a.cmasCompleted, 0),
    avgZillowConversion: values.length > 0 ? values.reduce((sum, a) => sum + a.zillowConversion, 0) / values.length : 0,
    totalZillowLeads: values.reduce((sum, a) => sum + a.zillowLeads, 0),
    totalZillowCost: values.reduce((sum, a) => sum + a.zillowCost, 0),
    totalCapContributions: values.reduce((sum, a) => sum + a.capProgress, 0),
  };
}

// Helper functions

/**
 * Extract and validate agent name from a row.
 * Returns null for non-agent rows (headers, dates, status labels, totals, etc.)
 */
function extractAgentName(row: Record<string, any>): string | null {
  const keys = ['Agent', 'agent', 'AGENT', 'Realtor', 'Team Member'];
  let rawValue: any = null;
  
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      rawValue = row[key];
      break;
    }
  }
  
  if (rawValue === null || rawValue === undefined) return null;
  
  const value = String(rawValue).trim();
  
  // Reject empty values
  if (!value) return null;
  
  // Reject obvious non-agent values
  const lower = value.toLowerCase();
  
  // Status labels, headers, and metadata that should never be agents
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
  
  for (const pattern of rejectedPatterns) {
    if (lower === pattern || lower.includes(pattern)) return null;
  }
  
  // Reject date-like values (MM-DD-YY, YYYY-MM-DD, etc.)
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(value)) return null;
  
  // Reject pure numbers or currency values
  if (/^[\d.,$%]+$/.test(value)) return null;
  
  // Reject values that are just punctuation or symbols
  if (/^[^a-zA-Z0-9]+$/.test(value)) return null;
  
  // Must contain at least one letter and be at least 2 characters
  if (value.length < 2 || !/[a-zA-Z]/.test(value)) return null;
  
  return value;
}

function extractAgentId(row: Record<string, any>): string | null {
  const name = extractAgentName(row);
  return name ? normalizeAgentId(name) : null;
}

/**
 * Check if an agent name appears to be a real person (not junk data)
 */
function isValidAgentName(name: string): boolean {
  // Must have at least a first and last name component (or hyphenated equivalent)
  const parts = name.split(/[-\s]+/).filter(p => p.length > 0);
  if (parts.length < 2) return false;
  
  // Each part should start with a letter
  for (const part of parts) {
    if (!/^[A-Za-z]/.test(part)) return false;
  }
  
  return true;
}

function normalizeAgentId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCurrency(value: any): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parsePercent(value: any): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).replace('%', '').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Determine if a lead source qualifies as "sphere" for cap contribution purposes.
 * Sphere deals = personal contacts, SOI, repeat clients, referrals from past clients
 * Non-sphere = paid leads (Zillow, Redfin, etc.), floor time, cold leads
 */
function isSphereDeal(leadSource: string): boolean {
  const source = leadSource.toLowerCase();
  
  // Explicitly sphere sources
  const sphereKeywords = [
    'sphere',
    'soi',
    'personal',
    'repeat',
    'referral',
    'past client',
    'family',
    'friend',
    'self-generated',
  ];
  
  // Explicitly non-sphere sources (paid leads, cold leads)
  const nonSphereKeywords = [
    'zillow',
    'redfin',
    'realtor.com',
    'floor',
    'cold',
    'google ads',
    'facebook ads',
    'paid',
    'zhl',
  ];
  
  // Check non-sphere first (explicit exclusion)
  for (const keyword of nonSphereKeywords) {
    if (source.includes(keyword)) return false;
  }
  
  // Check sphere keywords
  for (const keyword of sphereKeywords) {
    if (source.includes(keyword)) return true;
  }
  
  // Default: if unclear, conservatively treat as non-sphere
  // (agent must prove it's sphere to count toward cap)
  return false;
}
