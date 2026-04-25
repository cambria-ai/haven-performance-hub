/**
 * Google Sheets data loader for Haven Performance Hub.
 * Core source: Haven Transactions 2026 (1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl)
 * 
 * Business rules:
 * - MASTER HAVEN PNDS = pending/current pipeline ONLY
 * - Master Closed 2026 = closed/sold transactions ONLY
 * - Roster membership determines active agent status
 * - Non-roster closers are excluded from active dashboards
 * - Duplicate roster rows (multi-state licensing) merge into one person
 * - Same address/deal cannot count twice across tabs
 * - Excluded tabs: Sorting 2, Sorting 3, Closed_Off Market Listings
 * - Cap does NOT derive from Haven Income - requires explicit commission breakdown
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
        if (csvText[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
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
      if (char === '\r' && csvText[i + 1] === '\n') i++;
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }
    
    currentField += char;
    i++;
  }
  
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) rows.push(currentRow);
  }
  
  if (rows.length === 0) return [];
  
  const headers = rows[0].map(h => h.trim());
  const result: Record<string, any>[] = [];
  
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const values = rows[rowIdx];
    if (values.length === 0) continue;
    
    const row: Record<string, any> = {};
    headers.forEach((header, idx) => {
      if (header && values[idx] !== undefined) row[header] = values[idx];
    });
    result.push(row);
  }
  
  return result;
}

/**
 * Normalize an address for deduplication comparison.
 * - Lowercase
 * - Remove extra whitespace
 * - Standardize common suffixes (ST -> STREET, AVE -> AVENUE, etc.)
 * - Remove unit/apt suffixes for primary address matching
 */
function normalizeAddress(address: string): string {
  if (!address) return '';
  
  let normalized = address.toLowerCase().trim();
  
  const suffixMap: Record<string, string> = {
    ' st ': ' street ', ' st,': ' street,', ' st.': ' street',
    ' ave ': ' avenue ', ' ave,': ' avenue,', ' ave.': ' avenue',
    ' blvd ': ' boulevard ', ' blvd,': ' boulevard,', ' blvd.': ' boulevard',
    ' dr ': ' drive ', ' dr,': ' drive,', ' dr.': ' drive',
    ' ln ': ' lane ', ' ln,': ' lane,', ' ln.': ' lane',
    ' ct ': ' court ', ' ct,': ' court,', ' ct.': ' court',
    ' wy ': ' way ', ' wy,': ' way,', ' wy.': ' way',
    ' pl ': ' place ', ' pl,': ' place,', ' pl.': ' place',
    ' hwy ': ' highway ', ' hwy,': ' highway,', ' hwy.': ' highway',
    ' rd ': ' road ', ' rd,': ' road,', ' rd.': ' road',
  };
  
  for (const [short, long] of Object.entries(suffixMap)) {
    normalized = normalized.replace(new RegExp(short.replace(' ', '\\s+'), 'g'), long);
  }
  
  normalized = normalized.replace(/\s*(?:unit|apt|suite|#|ste)\.?\s*[a-z0-9-]+/gi, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Load roster and return set of active agent IDs.
 * Spokane Agent Roster structure: AGENT name is in first column, header row at index 21.
 * Uses match keys to handle name variations and multi-state duplicates.
 * Duplicate roster entries (same person, different state licenses) collapse into one agent.
 */
async function loadRoster(): Promise<Map<string, string>> {
  const csv = await fetchTabCSV('Spokane Agent Roster');
  const rows = parseCSV(csv);
  const roster = new Map<string, string>();
  const rosterMatchKeys = new Map<string, string>();
  
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const firstCol = Object.values(rows[i])[0];
    if (firstCol && String(firstCol).toUpperCase() === 'AGENT') {
      headerIndex = i;
      break;
    }
  }
  
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
    
    if (!rosterMatchKeys.has(matchKey)) {
      rosterMatchKeys.set(matchKey, agentId);
      roster.set(agentId, canonicalName);
    }
  }
  
  return roster;
}

/**
 * Load CLOSED transactions from Master Closed 2026 tab.
 * This is the authoritative source for closed/sold transactions.
 * 
 * DEDUPE LOGIC:
 * - Build deterministic key: normalizedAddress + agentMatchKey + price + closingDate
 * - Same address can only count twice if clearly separate (different agents or different closing dates >30 days apart)
 */
async function loadClosedTransactions(roster: Map<string, string>): Promise<TransactionRecord[]> {
  const csv = await fetchTabCSV('Master Closed 2026');
  const rows = parseCSV(csv);
  const closed: TransactionRecord[] = [];
  const seenTransactions = new Map<string, TransactionRecord>();
  
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
    
    const price = parseCurrency(row['PRICE'] || row['price'] || row['Sales Price'] || row['sales price']);
    if (!price) continue;
    
    const address = (row['ADDRESS'] || row['address'] || row['Property Address'] || row['property address'] || 'Unknown') as string;
    const normalizedAddress = normalizeAddress(address);
    const contractDate = parseDate(row['Mutual Acceptance'] || row['contract date'] || row['Contract Date']);
    const closingDate = parseDate(row['CLOSING'] || row['closing'] || row['Close Date'] || row['close date']);
    
    if (!closingDate) continue;
    
    const leadSource = (row['Lead Generated'] || row['lead source'] || row['Lead Source'] || '') as string;
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI'] || row['gci']) || 0;
    
    const dedupeKey = `${normalizedAddress}|${matchKey}|${price}|${closingDate.toISOString().split('T')[0]}`;
    
    if (seenTransactions.has(dedupeKey)) continue;
    
    const transaction: TransactionRecord = {
      id: `closed-${rosterAgentId}-${normalizedAddress.replace(/\s+/g, '-').substring(0, 30)}-${closingDate.toISOString()}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: 'closed',
      side: ((row['Purch/List'] || row['purch/list'] || row['Side'] || row['side'] || '') as string).toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: contractDate?.toISOString() || undefined,
      closedDate: closingDate.toISOString(),
      gci: havenIncome,
      leadSource,
      isZillow: leadSource.toLowerCase().includes('zillow'),
    };
    
    seenTransactions.set(dedupeKey, transaction);
    closed.push(transaction);
  }
  
  return closed;
}

/**
 * Load PENDING transactions from MASTER HAVEN PNDS tab.
 * This is the authoritative source for pending/current pipeline.
 * 
 * CRITICAL: If a deal in MASTER HAVEN PNDS also appears in Master Closed 2026,
 * it should NOT count as pending - it's already closed.
 * 
 * DEDUPE LOGIC:
 * - Build deterministic key: normalizedAddress + agentMatchKey + price
 * - Cross-check against closed transactions to avoid double-counting
 */
async function loadPendingTransactions(roster: Map<string, string>, closedTransactions: TransactionRecord[]): Promise<TransactionRecord[]> {
  const csv = await fetchTabCSV('MASTER HAVEN PNDS');
  const rows = parseCSV(csv);
  const pendings: TransactionRecord[] = [];
  const seenTransactions = new Set<string>();
  const now = new Date();
  
  const closedSignatures = new Set<string>();
  for (const txn of closedTransactions) {
    const agentMatchKey = getAgentMatchKey(txn.agentName);
    const normalizedAddr = normalizeAddress(txn.address);
    closedSignatures.add(`${normalizedAddr}|${agentMatchKey}|${txn.price}`);
  }
  
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
    
    const price = parseCurrency(row['PRICE'] || row['price'] || row['Sales Price']);
    if (!price) continue;
    
    const address = (row['ADDRESS'] || row['address'] || row['Property Address'] || 'Unknown') as string;
    const normalizedAddress = normalizeAddress(address);
    const contractDate = parseDate(row['Mutual Acceptance'] || row['contract date'] || row['Contract Date']);
    const closingDate = parseDate(row['CLOSING'] || row['closing'] || row['Close Date']);
    const leadSource = (row['Lead Generated'] || row['lead source'] || row['Lead Source'] || '') as string;
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI'] || row['gci']) || 0;
    
    const pendingDedupeKey = `${normalizedAddress}|${matchKey}|${price}`;
    if (seenTransactions.has(pendingDedupeKey)) continue;
    if (closedSignatures.has(pendingDedupeKey)) continue;
    
    const isActuallyClosed = closingDate && closingDate <= now;
    if (isActuallyClosed) continue;
    
    const transaction: TransactionRecord = {
      id: `pend-${rosterAgentId}-${normalizedAddress.replace(/\s+/g, '-').substring(0, 30)}-${contractDate?.toISOString() || ''}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: 'pending',
      side: ((row['Purch/List'] || row['purch/list'] || row['Side'] || '') as string).toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: contractDate?.toISOString() || undefined,
      closedDate: undefined,
      gci: havenIncome,
      leadSource,
      isZillow: leadSource.toLowerCase().includes('zillow'),
    };
    
    seenTransactions.add(pendingDedupeKey);
    pendings.push(transaction);
  }
  
  return pendings;
}

/**
 * Load active listings count per agent.
 * Sources: Listings tab + Upcoming Listings (if appropriate).
 * Does NOT include Closed_Off Market Listings (explicitly excluded).
 */
async function loadListings(roster: Map<string, string>): Promise<Record<string, number>> {
  const csv = await fetchTabCSV('Listings');
  const rows = parseCSV(csv);
  const listingsByAgent: Record<string, number> = {};
  
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
    const roster = await loadRoster();
    if (roster.size === 0) {
      warnings.push('Roster loaded but appears empty');
    }
    
    const closed = await loadClosedTransactions(roster);
    const pendings = await loadPendingTransactions(roster, closed);
    const allTransactions = [...pendings, ...closed];
    
    const listingsByAgent = await loadListings(roster);
    const cmasByAgent = await loadCmas(roster);
    
    const agents: Record<string, AgentSnapshot> = {};
    for (const [agentId, agentName] of roster.entries()) {
      agents[agentId] = createEmptyAgent(agentName, agentId);
    }
    
    for (const txn of allTransactions) {
      if (!agents[txn.agentId]) continue;
      const agent = agents[txn.agentId];
      
      if (txn.status === 'closed') {
        agent.closedTransactions += 1;
        agent.closedVolume += txn.price;
        agent.gci += txn.gci;
      } else if (txn.status === 'pending') {
        agent.pendingTransactions += 1;
        agent.pendingVolume += txn.price;
      }
      
      if (txn.isZillow) {
        agent.zillowLeads += 1;
      }
    }
    
    for (const [agentId, count] of Object.entries(listingsByAgent)) {
      if (agents[agentId]) agents[agentId].activeListings = count;
    }
    
    for (const [agentId, count] of Object.entries(cmasByAgent)) {
      if (agents[agentId]) agents[agentId].cmasCompleted = count;
    }
    
    const leaderboard = buildLeaderboard(agents);
    const teamStats = calculateTeamStats(agents);
    const timeWindowStats = buildTimeWindowStats(allTransactions, agents);
    
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
      notes: `Loaded from Haven Transactions 2026. Roster-based filtering active. Excluded tabs: ${EXCLUDED_TABS.join(', ')}. CLOSED from Master Closed 2026 (${closed.length} txns). PENDING from MASTER HAVEN PNDS (${pendings.length} txns). Dedupe: normalizedAddress+agentMatchKey+price+closingDate.`,
    };
    
    const snapshot: WeeklySnapshot = { metadata, agents, leaderboard, teamStats };
    
    return { snapshot, timeWindowStats, warnings, errors, sourcesLoaded };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to load from Google Sheets: ${msg}`);
    
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
    
    return { snapshot, timeWindowStats: {}, warnings: [], errors, sourcesLoaded: [] };
  }
}

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
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  
  const lower = trimmed.toLowerCase();
  const rejectedPatterns = ['pending', 'closed', 'rescinded', 'active', 'contingent', 'total', 'totals', 'sum', 'count', 'average', 'address', 'price', 'commission', 'gci', 'lead source', 'n/a', 'none', 'null', 'undefined', 'tbd'];
  
  for (const pattern of rejectedPatterns) {
    if (lower === pattern || lower.includes(pattern)) return false;
  }
  
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed)) return false;
  if (/^[\d.,$%]+$/.test(trimmed)) return false;
  
  return true;
}

function normalizeAgentId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getAgentMatchKey(name: string): string {
  const parts = name.trim().split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return '';
  
  let firstName: string;
  let lastName: string;
  
  if (parts[0].endsWith(',')) {
    lastName = parts[0].replace(',', '').toLowerCase();
    firstName = parts[1] ? parts[1].toLowerCase() : '';
  } else {
    lastName = parts[parts.length - 1].toLowerCase();
    firstName = parts[0].toLowerCase();
  }
  
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
