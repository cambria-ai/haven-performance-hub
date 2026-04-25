/**
 * Google Sheets data loader for Haven Performance Hub.
 * Core source: Haven Transactions 2026 (1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl)
 * 
 * Business rules:
 * - Roster membership determines active agent status
 * - Non-roster closers are excluded from active dashboards
 * - Cap applies only to sphere deals, maxes at $20,000
 * - Excluded tabs: Sorting 2, Sorting 3, Closed_Off Market Listings
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
  timeWindowStats: Record<string, TimeWindowStats>;
  warnings: string[];
  errors: string[];
  sourcesLoaded: string[];
}

// Core source sheet
export const SHEET_ID = '1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl';

// Tab GIDs from inspection
export const TAB_GIDS: Record<string, number> = {
  'MASTER HAVEN PNDS': 0,
  'Master Closed 2026': 1,
  'Spokane Agent Roster': 1454437421,
  'Upcoming Listings': 1196688652,
  'Listings': 1085800109,
  'Closed_Off Market Listings': 1044193093,
  'Spokane Rescissions': 862721766,
  'CMAS_2026': 1932605207,
  'Sorting 2': 2043111127,
  'Sorting 3': 1948698996,
};

// Explicitly excluded per business rules
export const EXCLUDED_TABS = ['Sorting 2', 'Sorting 3', 'Closed_Off Market Listings'];

/**
 * Fetch a Google Sheet tab as CSV
 */
export async function fetchTabCSV(tabName: string): Promise<string> {
  const gid = TAB_GIDS[tabName];
  if (gid === undefined) {
    throw new Error(`Unknown tab: ${tabName}`);
  }
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tab ${tabName}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Parse CSV text into rows. Handles multi-line quoted fields.
 */
function parseCSV(csvText: string): Record<string, any>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < csvText.length) {
    const char = csvText[i];
    
    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote
        if (csvText[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
    
    // Not in quotes
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    
    if (char === ',') {
      currentRow.push(currentField.trim());
      currentField = '';
      i++;
      continue;
    }
    
    if (char === '\n' || char === '\r') {
      // Skip \r\n combinations
      if (char === '\r' && csvText[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField.trim());
      if (currentRow.length > 0 && currentRow.some(f => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }
    
    currentField += char;
    i++;
  }
  
  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) {
      rows.push(currentRow);
    }
  }
  
  if (rows.length === 0) return [];
  
  const headers = rows[0].map(h => h.trim());
  const result: Record<string, any>[] = [];
  
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const values = rows[rowIdx];
    if (values.length === 0) continue;
    
    const row: Record<string, any> = {};
    headers.forEach((header, idx) => {
      if (header && values[idx] !== undefined) {
        row[header] = values[idx];
      }
    });
    result.push(row);
  }
  
  return result;
}

/**
 * Load roster and return set of active agent IDs
 * Spokane Agent Roster structure: AGENT name is in first column, header row at index 21
 * Uses match keys to handle name variations and multi-state duplicates
 */
async function loadRoster(): Promise<Map<string, string>> {
  const csv = await fetchTabCSV('Spokane Agent Roster');
  const rows = parseCSV(csv);
  const roster = new Map<string, string>(); // agentId -> canonical display name
  const rosterMatchKeys = new Map<string, string>(); // matchKey -> canonical agentId
  
  // Find the header row that contains 'AGENT' in first column
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const firstCol = Object.values(rows[i])[0];
    if (firstCol && String(firstCol).toUpperCase() === 'AGENT') {
      headerIndex = i;
      break;
    }
  }
  
  // Load roster entries, building a map of match keys to canonical IDs
  for (let i = (headerIndex >= 0 ? headerIndex + 1 : 0); i < rows.length; i++) {
    const row = rows[i];
    const agentName = 
      (row['AGENT'] as string) || 
      (row['Agent'] as string) || 
      (row['agent'] as string) || 
      (row['Name'] as string) || 
      (row['name'] as string) ||
      (headerIndex >= 0 ? (Object.values(row)[0] as string) : null);
    
    if (!agentName || !isValidAgentName(agentName)) continue;

    const canonicalName = agentName.trim();
    const agentId = normalizeAgentId(canonicalName);
    const matchKey = getAgentMatchKey(canonicalName);
    
    // Store the first occurrence as canonical (handles multi-state duplicates)
    if (!rosterMatchKeys.has(matchKey)) {
      rosterMatchKeys.set(matchKey, agentId);
      roster.set(agentId, canonicalName);
    }
  }
  
  return roster;
}

/**
 * Load all transactions from MASTER HAVEN PNDS and classify as pending or closed based on CLOSING date.
 * Uses match keys to match transaction agents to roster entries.
 * A transaction is "closed" if it has a valid CLOSING date in the past.
 * A transaction is "pending" if CLOSING is empty or in the future.
 */
async function loadTransactions(roster: Map<string, string>): Promise<{ pendings: TransactionRecord[]; closed: TransactionRecord[] }> {
  const csv = await fetchTabCSV('MASTER HAVEN PNDS');
  const rows = parseCSV(csv);
  const pendings: TransactionRecord[] = [];
  const closed: TransactionRecord[] = [];
  const now = new Date();
  
  // Build a reverse map: matchKey -> roster agentId
  const rosterMatchKeys = new Map<string, string>();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }
  
  for (const row of rows) {
    const agentName = (row['Agent'] || row['agent']) as string;
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    // Check direct roster membership first
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    
    // If not found, try match key (handles "Kurt Burgan" vs "Kurt Antone Burgan")
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey)!;
    }
    
    // Skip non-roster agents
    if (!rosterAgentId) continue;
    
    const price = parseCurrency(row['PRICE'] || row['price']);
    if (!price) continue;
    
    const address = (row['ADDRESS'] || row['address'] || 'Unknown') as string;
    const contractDate = parseDate(row['Mutual Acceptance'] || row['contract date']);
    const closingDate = parseDate(row['CLOSING'] || row['closing']);
    const leadSource = (row['Lead Generated'] || row['lead source'] || '') as string;
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI']) || 0;
    
    // Classify based on closing date
    const isClosed = closingDate && closingDate <= now;
    
    // Calculate cap contribution for sphere deals only (closed transactions)
    let capContribution = 0;
    if (isClosed && isSphereDeal(leadSource)) {
      capContribution = havenIncome;
    }
    
    const transaction: TransactionRecord = {
      id: `${isClosed ? 'closed' : 'pend'}-${agentId}-${address.replace(/\s+/g, '-').substring(0, 20)}-${closingDate?.toISOString() || contractDate?.toISOString() || ''}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: isClosed ? 'closed' : 'pending',
      side: ((row['Purch/List'] || '') as string).toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: contractDate?.toISOString() || undefined,
      closedDate: closingDate?.toISOString() || undefined,
      gci: havenIncome,
      leadSource,
      isSphere: isSphereDeal(leadSource),
      capContribution,
      isZillow: leadSource.toLowerCase().includes('zillow'),
    };
    
    if (isClosed) {
      closed.push(transaction);
    } else {
      pendings.push(transaction);
    }
  }
  
  return { pendings, closed };
}

/**
 * Load active listings count per agent
 */
async function loadListings(roster: Map<string, string>): Promise<Record<string, number>> {
  const csv = await fetchTabCSV('Listings');
  const rows = parseCSV(csv);
  const listingsByAgent: Record<string, number> = {};
  
  // Build reverse map: matchKey -> roster agentId
  const rosterMatchKeys = new Map<string, string>();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }
  
  for (const row of rows) {
    const agentName = (row['Agent'] || row['agent']) as string;
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey)!;
    }
    if (!rosterAgentId) continue;
    
    listingsByAgent[rosterAgentId] = (listingsByAgent[rosterAgentId] || 0) + 1;
  }
  
  return listingsByAgent;
}

/**
 * Load completed CMAs per agent
 */
async function loadCmas(roster: Map<string, string>): Promise<Record<string, number>> {
  const csv = await fetchTabCSV('CMAS_2026');
  const rows = parseCSV(csv);
  const cmasByAgent: Record<string, number> = {};
  
  // Build reverse map: matchKey -> roster agentId
  const rosterMatchKeys = new Map<string, string>();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }
  
  for (const row of rows) {
    const agentName = (row['Agent'] || row['agent']) as string;
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey)!;
    }
    if (!rosterAgentId) continue;
    
    const status = ((row['Status'] || row['status'] || '') as string).toLowerCase();
    if (status.includes('complete') || status.includes('done')) {
      cmasByAgent[rosterAgentId] = (cmasByAgent[rosterAgentId] || 0) + 1;
    }
  }
  
  return cmasByAgent;
}

/**
 * Main loader function
 */
export async function loadFromGoogleSheets(): Promise<LoadResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const sourcesLoaded: string[] = ['Haven Transactions 2026'];
  
  try {
    // Step 1: Load roster first
    const roster = await loadRoster();
    if (roster.size === 0) {
      warnings.push('Roster loaded but appears empty');
    }
    
    // Step 2: Load transactions from MASTER HAVEN PNDS (single source, classified by closing date)
    const { pendings, closed } = await loadTransactions(roster);
    const allTransactions = [...pendings, ...closed];
    
    // Step 3: Load activity metrics
    const listingsByAgent = await loadListings(roster);
    const cmasByAgent = await loadCmas(roster);
    
    // Step 4: Build agent records
    const agents: Record<string, AgentSnapshot> = {};
    const capContributions: Record<string, CapContribution[]> = {};
    
    // Initialize agents from roster
    for (const [agentId, agentName] of roster.entries()) {
      agents[agentId] = createEmptyAgent(agentName, agentId);
      capContributions[agentId] = [];
    }
    
    // Process transactions
    for (const txn of allTransactions) {
      if (!agents[txn.agentId]) continue;
      const agent = agents[txn.agentId];
      
      if (txn.status === 'closed') {
        agent.closedTransactions += 1;
        agent.closedVolume += txn.price;
        agent.gci += txn.gci;
        
        // Track cap contribution for sphere deals only
        if (txn.isSphere && (txn.capContribution || 0) > 0) {
          const remainingCap = Math.max(0, CAP_MAX - agent.capProgress);
          const actualContribution = Math.min(txn.capContribution || 0, remainingCap);
          agent.capProgress += actualContribution;
          
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
      } else if (txn.status === 'pending') {
        agent.pendingTransactions += 1;
        agent.pendingVolume += txn.price;
      }
      
      if (txn.isZillow) {
        agent.zillowLeads += 1;
      }
    }
    
    // Add activity metrics
    for (const [agentId, count] of Object.entries(listingsByAgent)) {
      if (agents[agentId]) {
        agents[agentId].activeListings = count;
      }
    }
    
    for (const [agentId, count] of Object.entries(cmasByAgent)) {
      if (agents[agentId]) {
        agents[agentId].cmasCompleted = count;
      }
    }
    
    // Attach cap-contributing transactions
    for (const [agentId, agent] of Object.entries(agents)) {
      if (capContributions[agentId].length > 0) {
        agent.capContributingTransactions = capContributions[agentId];
      }
    }
    
    // Build leaderboard
    const leaderboard = buildLeaderboard(agents);
    
    // Calculate team stats
    const teamStats = calculateTeamStats(agents);
    
    // Build time-window rollups
    const timeWindowStats = buildTimeWindowStats(allTransactions, agents);
    
    // Metadata
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
      notes: `Loaded from Haven Transactions 2026. Roster-based filtering active. Excluded tabs: ${EXCLUDED_TABS.join(', ')}.`,
    };
    
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to load from Google Sheets: ${msg}`);
    
    // Return empty snapshot on error
    const { weekStart, weekEnd } = getWeekDates();
    const snapshot: WeeklySnapshot = {
      metadata: {
        id: generateSnapshotId(),
        createdAt: new Date().toISOString(),
        uploadedBy: 'error-fallback',
        sourceFiles: [],
        agentCount: 0,
        transactionCount: 0,
        weekStart,
        weekEnd,
        notes: 'Error loading data',
      },
      agents: {},
      leaderboard: [],
      teamStats: {
        totalAgents: 0,
        totalClosedTransactions: 0,
        totalClosedVolume: 0,
        totalPendingTransactions: 0,
        totalPendingVolume: 0,
        totalActiveListings: 0,
        totalCmasCompleted: 0,
        avgZillowConversion: 0,
        totalZillowLeads: 0,
        totalZillowCost: 0,
        totalCapContributions: 0,
        totalGCI: 0,
      },
    };
    
    return {
      snapshot,
      timeWindowStats: {},
      warnings: [],
      errors,
      sourcesLoaded: [],
    };
  }
}

/**
 * Build time-window rollups
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
    showings: 0,
    cmasCompleted: 0,
    listings,
    pendings,
    solds,
    closedVolume: filtered.filter(t => t.status === 'closed').reduce((sum, t) => sum + t.price, 0),
    pendingVolume: filtered.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.price, 0),
  };
}

function getPeriodBounds(referenceDate: Date, period: 'week' | 'month' | 'year'): { startDate: Date; endDate: Date } {
  const endDate = new Date(referenceDate);
  const startDate = new Date(referenceDate);
  
  switch (period) {
    case 'week':
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

function createEmptyAgent(name: string, id?: string): AgentSnapshot {
  return {
    id: id || normalizeAgentId(name),
    name: name.trim(),
    closedTransactions: 0,
    pendingTransactions: 0,
    closedVolume: 0,
    pendingVolume: 0,
    gci: 0,
    capProgress: 0,
    activeListings: 0,
    cmasCompleted: 0,
    zillowLeads: 0,
    zillowConversion: null,
    zillowCost: null,
    capContributingTransactions: [],
  };
}

function buildLeaderboard(agents: Record<string, AgentSnapshot>): LeaderboardEntry[] {
  return Object.values(agents)
    .filter(agent => agent.closedTransactions > 0 || agent.pendingTransactions > 0)
    .sort((a, b) => b.closedVolume - a.closedVolume)
    .map((agent, index) => ({
      rank: index + 1,
      agentId: agent.id,
      agentName: agent.name,
      closedVolume: agent.closedVolume,
      closedTransactions: agent.closedTransactions,
      pendingTransactions: agent.pendingTransactions,
      gci: agent.gci,
      capProgress: agent.capProgress,
    }));
}

function calculateTeamStats(agents: Record<string, AgentSnapshot>): TeamStats {
  const values = Object.values(agents);
  return {
    totalAgents: values.length,
    totalClosedTransactions: values.reduce((sum, a) => sum + a.closedTransactions, 0),
    totalClosedVolume: values.reduce((sum, a) => sum + a.closedVolume, 0),
    totalPendingTransactions: values.reduce((sum, a) => sum + a.pendingTransactions, 0),
    totalPendingVolume: values.reduce((sum, a) => sum + a.pendingVolume, 0),
    totalActiveListings: values.reduce((sum, a) => sum + a.activeListings, 0),
    totalCmasCompleted: values.reduce((sum, a) => sum + a.cmasCompleted, 0),
    avgZillowConversion: values.length ? values.reduce((sum, a) => sum + (a.zillowConversion || 0), 0) / values.length : 0,
    totalZillowLeads: values.reduce((sum, a) => sum + a.zillowLeads, 0),
    totalZillowCost: values.reduce((sum, a) => sum + (a.zillowCost || 0), 0),
    totalCapContributions: values.reduce((sum, a) => sum + a.capProgress, 0),
    totalGCI: values.reduce((sum, a) => sum + a.gci, 0),
  } as TeamStats & { totalGCI: number };
}

function isValidAgentName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  
  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  
  // Reject obvious non-agent values
  const lower = trimmed.toLowerCase();
  const rejectedPatterns = [
    'pending', 'closed', 'rescinded', 'active', 'contingent',
    'total', 'totals', 'sum', 'count', 'average',
    'address', 'price', 'commission', 'gci', 'lead source',
    'n/a', 'none', 'null', 'undefined', 'tbd',
  ];
  
  for (const pattern of rejectedPatterns) {
    if (lower === pattern || lower.includes(pattern)) return false;
  }
  
  // Reject date-like values
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed)) return false;
  
  // Reject pure numbers or currency
  if (/^[\d.,$%]+$/.test(trimmed)) return false;
  
  return true;
}

function normalizeAgentId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extract a canonical agent key for matching roster to transactions.
 * Uses last name + first initial to handle variations like:
 * - "Kurt Antone Burgan" (roster) vs "Kurt Burgan" (transactions)
 * - Multi-state duplicates (same person, different license numbers)
 */
function getAgentMatchKey(name: string): string {
  const parts = name.trim().split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return '';
  
  // Handle "Last, First" format
  let firstName: string;
  let lastName: string;
  
  if (parts[0].endsWith(',')) {
    // "Burgan, Kurt" format
    lastName = parts[0].replace(',', '').toLowerCase();
    firstName = parts[1] ? parts[1].toLowerCase() : '';
  } else {
    // "Kurt Antone Burgan" format - assume last word is last name
    lastName = parts[parts.length - 1].toLowerCase();
    firstName = parts[0].toLowerCase();
  }
  
  // Create a match key: lastname + first initial
  // This matches "Kurt Antone Burgan" with "Kurt Burgan"
  const firstInitial = firstName.charAt(0);
  return `${lastName}-${firstInitial}`;
}

function parseCurrency(value: any): number | null {
  if (value === null || value === undefined) return null;
  const str = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Determine if a lead source qualifies as "sphere" for cap contribution.
 * Sphere = personal contacts, SOI, repeat clients, referrals
 * Non-sphere = paid leads (Zillow, Redfin, etc.)
 */
function isSphereDeal(leadSource: string): boolean {
  const source = leadSource.toLowerCase();
  
  const nonSphereKeywords = [
    'zillow', 'redfin', 'realtor.com', 'floor', 'cold',
    'google ads', 'facebook ads', 'paid', 'zhl', 'myplusleads',
  ];
  
  const sphereKeywords = [
    'sphere', 'soi', 'personal', 'repeat', 'referral',
    'past client', 'family', 'friend', 'self-generated',
  ];
  
  // Check non-sphere first
  for (const keyword of nonSphereKeywords) {
    if (source.includes(keyword)) return false;
  }
  
  // Check sphere keywords
  for (const keyword of sphereKeywords) {
    if (source.includes(keyword)) return true;
  }
  
  // Default: not sphere (conservative)
  return false;
}
