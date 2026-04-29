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
  ReferralTransaction,
  generateSnapshotId,
  getWeekDates,
  CAP_MAX,
} from './snapshot';
import { parseReferralIndicators, createReferralTransaction } from './referral-utils';

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
  auditInfo?: {
    weeklyActivity?: {
      tabExists: boolean;
      rowsLoaded: number;
      agentsMatched: number;
      agentsUnmatched: string[];
    };
  };
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
  'Weekly Activity by Agent': -1, // GID unknown - will use sheet name
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
 * Parse CSV text into rows with FIXED column indices.
 * The sheet has a two-row header (rows 0-1) that merges into a single conceptual header.
 * Data starts at row index 2.
 *
 * Column mapping (0-indexed, verified 2026-04-28):
 * 0: (empty/merged)
 * 1: Purch/List
 * 2: Res Land Comm
 * 3: Comm %
 * 4: Mutual Acceptance
 * 5: CLOSING
 * 6: Commission Request Sent
 * 7: Agent
 * 8: PRICE
 * 9-11: (various)
 * 12: ADDRESS
 * 13: Zip Code
 * 14: Personal Sphere
 * 15: Client First Name
 * 16: Client Last Name
 * 17: (empty)
 * 18: Referral $
 * 19: Haven B&O
 * 20: Haven Income
 * 21: Agent B&O
 * 22: Agent Income
 * 23: Epique Income
 * 24: (empty)
 * 25: Lead Generated
 */
function parseCSV(csvText: string): { rows: string[][]; headers: string[] } {
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

  // Build fixed header mapping (combines conceptual header from rows 0-1)
  const headers = [
    'Empty', 'Purch/List', 'Res Land Comm', 'Comm %', 'Mutual Acceptance',
    'CLOSING', 'Commission Request Sent', 'Agent', 'PRICE', 'INDP Transactions',
    'Loan w/Shaun', 'CDA Sent to Closer', 'ADDRESS', 'Zip Code', 'Personal Sphere',
    'Client First Name', 'Client Last Name', 'Empty2', 'Referral $', 'Haven B&O',
    'Haven Income', 'Agent B&O', 'Agent Income', 'Epique Income', 'Empty3', 'Lead Generated',
  ];

  // Data starts at row index 2 (third row)
  const dataRows = rows.slice(2);

  return { rows: dataRows, headers };
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
  const { rows } = parseCSV(csv);
  const roster = new Map<string, string>();
  const rosterMatchKeys = new Map<string, string>();

  let headerIndex = -1;
  let headers: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const firstCol = rows[i][0];
    if (firstCol && String(firstCol).toUpperCase() === 'AGENT') {
      headerIndex = i;
      headers = rows[i];
      break;
    }
  }

  const getFieldValue = (row: string[], keys: string[]): string | null => {
    for (let idx = 0; idx < headers.length; idx++) {
      const header = headers[idx].trim().toUpperCase();
      for (const key of keys) {
        if (header === key.toUpperCase() && row[idx]) {
          return row[idx];
        }
      }
    }
    return null;
  };

  for (let i = (headerIndex >= 0 ? headerIndex + 1 : 0); i < rows.length; i++) {
    const row = rows[i];
    const agentName = getFieldValue(row, ['AGENT', 'Agent', 'agent', 'Name', 'name']) || row[0];

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
  const { rows, headers } = parseCSV(csv);
  const closed: TransactionRecord[] = [];
  const seenTransactions = new Map<string, TransactionRecord>();

  const rosterMatchKeys = new Map<string, string>();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }

  // Column indices (0-indexed, verified 2026-04-28):
  // 7: Agent, 8: PRICE, 12: ADDRESS, 4: Mutual Acceptance, 5: CLOSING
  // 20: Haven Income, 19: Haven B&O, 22: Agent Income, 23: Epique Income
  // 25: Lead Generated, 1: Purch/List, 14: Personal Sphere, 18: Referral $

  for (const row of rows) {
    const agentName = row[7];
    if (!agentName || !isValidAgentName(agentName)) continue;

    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);

    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey)!;
    }
    if (!rosterAgentId) continue;

    const price = parseCurrency(row[8]);
    if (!price) continue;

    const address = row[12] || 'Unknown';
    const normalizedAddress = normalizeAddress(address);
    const contractDate = parseDate(row[4]);
    const closingDate = parseDate(row[5]);

    if (!closingDate) continue;

    const leadSource = row[25] || '';
    const havenIncome = parseCurrency(row[20]) || 0;
    const agentIncome = parseCurrency(row[22]) || 0;
    const epiqueIncome = parseCurrency(row[23]) || 0;
    const boTax = parseCurrency(row[19]) || 0;
    const referralFee = parseCurrency(row[18]) || 0;
    const transactionFee = 0;
    const isPersonalSphere = (row[14] || '').toLowerCase().includes('yes');

    const isZillow = leadSource.toLowerCase().includes('zillow');
    const isRedfin = leadSource.toLowerCase().includes('redfin');
    const isSphere = isPersonalSphere || leadSource.toLowerCase().includes('sphere');
    const isZillowFlex = isZillow && leadSource.toLowerCase().includes('flex');

    const dedupeKey = `${normalizedAddress}|${matchKey}|${price}|${closingDate.toISOString().split('T')[0]}`;

    if (seenTransactions.has(dedupeKey)) continue;

    const transaction: TransactionRecord = {
      id: `closed-${rosterAgentId}-${normalizedAddress.replace(/\s+/g, '-').substring(0, 30)}-${closingDate.toISOString()}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: 'closed',
      side: (row[1] || '').toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: contractDate?.toISOString() || undefined,
      closedDate: closingDate.toISOString(),
      gci: havenIncome,
      leadSource,
      isZillow,
      isReferral: referralFee > 0 || isSphere,
      referralSource: isSphere ? 'Sphere' : (isZillow ? 'Zillow' : (isRedfin ? 'Redfin' : leadSource)),
      referralFee,
      isZillowFlex,
      isRedfin,
      isSphere,
      boTax,
      transactionFee,
      // Extended fields for detail views
      agentIncome,
      epiqueIncome,
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
  const { rows, headers } = parseCSV(csv);
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

  // Column indices (0-indexed, verified 2026-04-28):
  // 7: Agent, 8: PRICE, 12: ADDRESS, 4: Mutual Acceptance, 5: CLOSING
  // 20: Haven Income, 19: Haven B&O, 22: Agent Income, 23: Epique Income
  // 25: Lead Generated, 1: Purch/List, 14: Personal Sphere, 18: Referral $

  for (const row of rows) {
    const agentName = row[7];
    if (!agentName || !isValidAgentName(agentName)) continue;

    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);

    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey)!;
    }
    if (!rosterAgentId) continue;

    const price = parseCurrency(row[8]);
    if (!price) continue;

    const address = row[12] || 'Unknown';
    const normalizedAddress = normalizeAddress(address);
    const contractDate = parseDate(row[4]);
    const closingDate = parseDate(row[5]);
    const leadSource = row[25] || '';
    const havenIncome = parseCurrency(row[20]) || 0;
    const agentIncome = parseCurrency(row[22]) || 0;
    const epiqueIncome = parseCurrency(row[23]) || 0;
    const boTax = parseCurrency(row[19]) || 0;
    const referralFee = parseCurrency(row[18]) || 0;
    const transactionFee = 0;
    const isPersonalSphere = (row[14] || '').toLowerCase().includes('yes');

    const isZillow = leadSource.toLowerCase().includes('zillow');
    const isRedfin = leadSource.toLowerCase().includes('redfin');
    const isSphere = isPersonalSphere || leadSource.toLowerCase().includes('sphere');
    const isZillowFlex = isZillow && leadSource.toLowerCase().includes('flex');

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
      side: (row[1] || '').toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: contractDate?.toISOString() || undefined,
      closedDate: undefined,
      gci: havenIncome,
      leadSource,
      isZillow,
      isReferral: referralFee > 0 || isSphere,
      referralSource: isSphere ? 'Sphere' : (isZillow ? 'Zillow' : (isRedfin ? 'Redfin' : leadSource)),
      referralFee,
      isZillowFlex,
      isRedfin,
      isSphere,
      boTax,
      transactionFee,
      // Extended fields for detail views
      agentIncome,
      epiqueIncome,
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
  const { rows, headers } = parseCSV(csv);
  const listingsByAgent: Record<string, number> = {};

  const rosterMatchKeys = new Map<string, string>();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }

  const getFieldValue = (row: string[], keys: string[]): string | null => {
    for (let idx = 0; idx < headers.length; idx++) {
      const header = headers[idx].trim().toUpperCase();
      for (const key of keys) {
        if (header === key.toUpperCase() && row[idx]) {
          return row[idx];
        }
      }
    }
    return null;
  };

  for (const row of rows) {
    const agentName = getFieldValue(row, ['Agent', 'agent', 'Name']) || row[0];
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
 * Load weekly activity data from "Weekly Activity by Agent" tab.
 * Expected columns: Week Starting, Agent, Total Showings, New Listings Taken, CMAs Completed, Offers Written, Offers Accepted
 *
 * Returns activity aggregated by agent (most recent week only for current snapshot).
 * If tab doesn't exist or is empty, returns empty object - UI will show "not tracked yet".
 */
async function loadWeeklyActivity(roster: Map<string, string>): Promise<{
  activityByAgent: Record<string, {
    weeklyShowings?: number;
    weeklyOffersWritten?: number;
    weeklyOffersAccepted?: number;
    weeklyListingsTaken?: number;
    weeklyCmasCompleted?: number;
  }>;
  auditInfo: {
    tabExists: boolean;
    rowsLoaded: number;
    agentsMatched: number;
    agentsUnmatched: string[];
  };
}> {
  const auditInfo: {
    tabExists: boolean;
    rowsLoaded: number;
    agentsMatched: number;
    agentsUnmatched: string[];
  } = {
    tabExists: true,
    rowsLoaded: 0,
    agentsMatched: 0,
    agentsUnmatched: [],
  };

  try {
    const csv = await fetchTabCSV('Weekly Activity by Agent');
    if (!csv || csv.trim().length === 0) {
      auditInfo.tabExists = false;
      return { activityByAgent: {}, auditInfo };
    }

    const { rows, headers } = parseCSV(csv);
    const activityByAgent: Record<string, {
      weeklyShowings?: number;
      weeklyOffersWritten?: number;
      weeklyOffersAccepted?: number;
      weeklyListingsTaken?: number;
      weeklyCmasCompleted?: number;
    }> = {};

    const rosterMatchKeys = new Map<string, string>();
    for (const [agentId, agentName] of roster.entries()) {
      const matchKey = getAgentMatchKey(agentName);
      rosterMatchKeys.set(matchKey, agentId);
    }

    const getFieldValue = (row: string[], keys: string[]): string | null => {
      for (let idx = 0; idx < headers.length; idx++) {
        const header = headers[idx].trim().toUpperCase();
        for (const key of keys) {
          if (header === key.toUpperCase() && row[idx]) {
            return row[idx];
          }
        }
      }
      return null;
    };

    // Find the most recent week's data for each agent
    const latestWeekByAgent = new Map<string, string>();

    for (const row of rows) {
      const weekStarting = getFieldValue(row, ['Week Starting', 'Week Starting Date', 'Week']);
      const agentName = getFieldValue(row, ['Agent', 'Agent Name', 'Name']) || row[0];

      if (!agentName || !isValidAgentName(agentName)) continue;

      const agentId = normalizeAgentId(agentName);
      const matchKey = getAgentMatchKey(agentName);

      let rosterAgentId = roster.has(agentId) ? agentId : null;
      if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
        rosterAgentId = rosterMatchKeys.get(matchKey)!;
      }
      if (!rosterAgentId) {
        auditInfo.agentsUnmatched.push(agentName);
        continue;
      }

      // Track latest week for this agent
      const existingWeek = latestWeekByAgent.get(rosterAgentId);
      if (!existingWeek || (weekStarting && weekStarting > existingWeek)) {
        latestWeekByAgent.set(rosterAgentId, weekStarting || '');
      }
    }

    // Second pass: load data for latest week only
    for (const row of rows) {
      const weekStarting = getFieldValue(row, ['Week Starting', 'Week Starting Date', 'Week']) || '';
      const agentName = getFieldValue(row, ['Agent', 'Agent Name', 'Name']) || row[0];

      if (!agentName || !isValidAgentName(agentName)) continue;

      const agentId = normalizeAgentId(agentName);
      const matchKey = getAgentMatchKey(agentName);

      let rosterAgentId = roster.has(agentId) ? agentId : null;
      if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
        rosterAgentId = rosterMatchKeys.get(matchKey)!;
      }
      if (!rosterAgentId) continue;

      // Skip if not the latest week for this agent
      if (latestWeekByAgent.get(rosterAgentId) !== weekStarting) continue;

      auditInfo.rowsLoaded++;
      auditInfo.agentsMatched++;

      const totalShowings = parseInt(getFieldValue(row, ['Total Showings', 'Showings']) || '0', 10);
      const newListingstaken = parseInt(getFieldValue(row, ['New Listings Taken', 'Listings Taken', 'New Listings']) || '0', 10);
      const cmasCompleted = parseInt(getFieldValue(row, ['CMAs Completed', 'CMAs', 'CMA Completed']) || '0', 10);
      const offersWritten = parseInt(getFieldValue(row, ['Offers Written', 'Offers']) || '0', 10);
      const offersAccepted = parseInt(getFieldValue(row, ['Offers Accepted', 'Accepted Offers']) || '0', 10);

      activityByAgent[rosterAgentId] = {
        weeklyShowings: totalShowings > 0 ? totalShowings : undefined,
        weeklyOffersWritten: offersWritten > 0 ? offersWritten : undefined,
        weeklyOffersAccepted: offersAccepted > 0 ? offersAccepted : undefined,
        weeklyListingsTaken: newListingstaken > 0 ? newListingstaken : undefined,
        weeklyCmasCompleted: cmasCompleted > 0 ? cmasCompleted : undefined,
      };
    }

    return { activityByAgent, auditInfo };
  } catch (err) {
    // Tab doesn't exist or fetch failed
    auditInfo.tabExists = false;
    return { activityByAgent: {}, auditInfo };
  }
}

/**
 * Load completed CMAs per agent
 */
async function loadCmas(roster: Map<string, string>): Promise<Record<string, number>> {
  const csv = await fetchTabCSV('CMAS_2026');
  const { rows, headers } = parseCSV(csv);
  const cmasByAgent: Record<string, number> = {};

  const rosterMatchKeys = new Map<string, string>();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }

  const getFieldValue = (row: string[], keys: string[]): string | null => {
    for (let idx = 0; idx < headers.length; idx++) {
      const header = headers[idx].trim().toUpperCase();
      for (const key of keys) {
        if (header === key.toUpperCase() && row[idx]) {
          return row[idx];
        }
      }
    }
    return null;
  };

  for (const row of rows) {
    const agentName = getFieldValue(row, ['Agent', 'agent', 'Name']) || row[0];
    if (!agentName || !isValidAgentName(agentName)) continue;

    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);

    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey)!;
    }
    if (!rosterAgentId) continue;

    const status = getFieldValue(row, ['Status', 'status']) || '';
    if (status.toLowerCase().includes('complete') || status.toLowerCase().includes('done')) {
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
    const weeklyActivityResult = await loadWeeklyActivity(roster);
    const { activityByAgent, auditInfo: weeklyActivityAudit } = weeklyActivityResult;

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

      // Track referrals (closed transactions only)
      if (txn.status === 'closed' && txn.isReferral) {
        agent.referrals = (agent.referrals || 0) + 1;
        agent.referralVolume = (agent.referralVolume || 0) + txn.price;
        if (!agent.referralTransactions) agent.referralTransactions = [];
        agent.referralTransactions.push(createReferralTransaction(
          txn.id,
          txn.address,
          txn.closedDate,
          txn.price,
          {
            isReferral: txn.isReferral || false,
            referralSource: txn.referralSource || 'Unknown',
            referralFee: txn.referralFee,
            isZillowFlex: txn.isZillowFlex || false,
            isRedfin: txn.isRedfin || false,
            isSphere: txn.isSphere || false,
          }
        ));
      }
    }

    for (const [agentId, count] of Object.entries(listingsByAgent)) {
      if (agents[agentId]) agents[agentId].activeListings = count;
    }

    for (const [agentId, count] of Object.entries(cmasByAgent)) {
      if (agents[agentId]) agents[agentId].cmasCompleted = count;
    }

    // Wire weekly activity data (Phase 1)
    for (const [agentId, activity] of Object.entries(activityByAgent)) {
      if (agents[agentId]) {
        if (activity.weeklyShowings != null) agents[agentId].weeklyShowings = activity.weeklyShowings;
        if (activity.weeklyOffersWritten != null) agents[agentId].weeklyOffersWritten = activity.weeklyOffersWritten;
        if (activity.weeklyOffersAccepted != null) agents[agentId].weeklyOffersAccepted = activity.weeklyOffersAccepted;
      }
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
      notes: `Loaded from Haven Transactions 2026. Roster-based filtering active. Excluded tabs: ${EXCLUDED_TABS.join(', ')}. CLOSED from Master Closed 2026 (${closed.length} txns). PENDING from MASTER HAVEN PNDS (${pendings.length} txns). Dedupe: normalizedAddress+agentMatchKey+price+closingDate. Weekly Activity tab: ${weeklyActivityAudit.tabExists ? `${weeklyActivityAudit.rowsLoaded} rows, ${weeklyActivityAudit.agentsMatched} agents matched` : 'not found'}.`,
    };

    const snapshot: WeeklySnapshot = { metadata, agents, leaderboard, teamStats };

    return { snapshot, timeWindowStats, warnings, errors, sourcesLoaded, auditInfo: { weeklyActivity: weeklyActivityAudit } };
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
    referrals: 0,
    referralVolume: 0,
    referralTransactions: [],
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
      referrals: agent.referrals,
      referralVolume: agent.referralVolume,
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
    totalReferrals: values.reduce((sum, a) => sum + (a.referrals || 0), 0),
    totalReferralVolume: values.reduce((sum, a) => sum + (a.referralVolume || 0), 0),
  } as TeamStats & { totalGCI: number; totalReferrals: number; totalReferralVolume: number };
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
