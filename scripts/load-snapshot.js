/**
 * Load snapshot from Google Sheets and save to data/snapshots/current.json
 * Run: node scripts/load-snapshot.js
 * 
 * BUSINESS RULES:
 * - MASTER HAVEN PNDS = pending/current pipeline ONLY
 * - Master Closed 2026 = closed/sold transactions ONLY
 * - Roster membership determines active agent status
 * - Duplicate roster rows (multi-state licensing) merge into one person
 * - Same address/deal cannot count twice across tabs
 * - Excluded tabs: Sorting 2, Sorting 3, Closed_Off Market Listings
 * - Cap does NOT derive from Haven Income
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const CURRENT_SNAPSHOT = path.join(SNAPSHOTS_DIR, 'current.json');
const TIME_WINDOW_STATS = path.join(SNAPSHOTS_DIR, 'time-window-stats.json');

if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

const SHEET_ID = '1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl';
const TAB_GIDS = {
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

async function fetchTabCSV(tabName) {
  const gid = TAB_GIDS[tabName];
  if (gid === undefined) throw new Error(`Unknown tab: ${tabName}`);
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  return httpsGet(url);
}

function parseCSV(csvText) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  
  while (i < csvText.length) {
    const char = csvText[i];
    if (inQuotes) {
      if (char === '"') {
        if (csvText[i + 1] === '"') { currentField += '"'; i += 2; continue; }
        else { inQuotes = false; i++; continue; }
      } else { currentField += char; i++; continue; }
    }
    if (char === '"') { inQuotes = true; i++; continue; }
    if (char === ',') { currentRow.push(currentField.trim()); currentField = ''; i++; continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && csvText[i + 1] === '\n') i++;
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f.length > 0)) rows.push(currentRow);
      currentRow = []; currentField = ''; i++; continue;
    }
    currentField += char; i++;
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f.length > 0)) rows.push(currentRow);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  const result = [];
  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const values = rows[rowIdx];
    if (values.length === 0) continue;
    const row = {};
    headers.forEach((header, idx) => { if (header && values[idx] !== undefined) row[header] = values[idx]; });
    result.push(row);
  }
  return result;
}

function isValidAgentName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  const rejected = ['pending', 'closed', 'rescinded', 'active', 'total', 'sum', 'count', 'average', 'address', 'price', 'n/a', 'none', 'null', 'tbd'];
  for (const pattern of rejected) { if (lower === pattern || lower.includes(pattern)) return false; }
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed)) return false;
  if (/^[\d.,$%]+$/.test(trimmed)) return false;
  return true;
}

function normalizeAgentId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getAgentMatchKey(name) {
  const parts = name.trim().split(/\s+/).filter(p => p.length > 0);
  if (parts.length === 0) return '';
  let firstName, lastName;
  if (parts[0].endsWith(',')) {
    lastName = parts[0].replace(',', '').toLowerCase();
    firstName = parts[1] ? parts[1].toLowerCase() : '';
  } else {
    lastName = parts[parts.length - 1].toLowerCase();
    firstName = parts[0].toLowerCase();
  }
  return `${lastName}-${firstName.charAt(0)}`;
}

function parseCurrency(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Normalize address for deduplication
 */
function normalizeAddress(address) {
  if (!address) return '';
  let normalized = address.toLowerCase().trim();
  const suffixMap = {
    ' st ': ' street ', ' st,': ' street,', ' st.': ' street',
    ' ave ': ' avenue ', ' ave,': ' avenue,', ' ave.': ' avenue',
    ' blvd ': ' boulevard ', ' blvd,': ' boulevard,', ' blvd.': ' boulevard',
    ' dr ': ' drive ', ' dr,': ' drive,', ' dr.': ' drive',
    ' ln ': ' lane ', ' ln,': ' lane,', ' ln.': ' lane',
    ' ct ': ' court ', ' ct,': ' court,', ' ct.': ' court',
    ' wy ': ' way ', ' wy,': ' way,', ' wy.': ' way',
    ' pl ': ' place ', ' pl,': ' place,', ' pl.': ' place',
    ' rd ': ' road ', ' rd,': ' road,', ' rd.': ' road',
  };
  for (const [short, long] of Object.entries(suffixMap)) {
    normalized = normalized.replace(new RegExp(short.replace(' ', '\\s+'), 'g'), long);
  }
  normalized = normalized.replace(/\s*(?:unit|apt|suite|#|ste)\.?\s*[a-z0-9-]+/gi, '');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

async function loadRoster() {
  const csv = await fetchTabCSV('Spokane Agent Roster');
  const rows = parseCSV(csv);
  const roster = new Map();
  const rosterMatchKeys = new Map();
  
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
    const agentName = row['AGENT'] || row['Agent'] || row['agent'] || row['Name'] || row['name'] || (headerIndex >= 0 ? Object.values(row)[0] : null);
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
 * Load CLOSED transactions from Master Closed 2026 (authoritative closed source)
 * DEDUPE: normalizedAddress + agentMatchKey + price + closingDate
 */
async function loadClosedTransactions(roster) {
  const csv = await fetchTabCSV('Master Closed 2026');
  const rows = parseCSV(csv);
  const closed = [];
  const seenTransactions = new Map();
  
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }
  
  for (const row of rows) {
    const agentName = row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    if (!rosterAgentId) continue;
    
    const price = parseCurrency(row['PRICE'] || row['price'] || row['Sales Price'] || row['sales price']);
    if (!price) continue;
    
    const address = row['ADDRESS'] || row['address'] || row['Property Address'] || row['property address'] || 'Unknown';
    const normalizedAddress = normalizeAddress(address);
    const closingDate = parseDate(row['CLOSING'] || row['closing'] || row['Close Date'] || row['close date']);
    if (!closingDate) continue;
    
    const leadSource = row['Lead Generated'] || row['lead source'] || row['Lead Source'] || '';
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI'] || row['gci']) || 0;
    const clientName = row['Client'] || row['client'] || row['Buyer'] || row['buyer'] || row['Seller'] || row['seller'] || '';
    
    const dedupeKey = `${normalizedAddress}|${matchKey}|${price}|${closingDate.toISOString().split('T')[0]}`;
    if (seenTransactions.has(dedupeKey)) continue;
    
    const transaction = {
      id: `closed-${rosterAgentId}-${normalizedAddress.replace(/\s+/g, '-').substring(0, 30)}-${closingDate.toISOString()}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: 'closed',
      side: ((row['Purch/List'] || row['purch/list'] || row['Side'] || row['side'] || '') || '').toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: parseDate(row['Mutual Acceptance'] || row['contract date'] || row['Contract Date'])?.toISOString() || undefined,
      closedDate: closingDate.toISOString(),
      gci: havenIncome,
      leadSource,
      isZillow: leadSource.toLowerCase().includes('zillow'),
      clientName: clientName || undefined,
    };
    
    seenTransactions.set(dedupeKey, transaction);
    closed.push(transaction);
  }
  return closed;
}

/**
 * Load PENDING transactions from MASTER HAVEN PNDS (authoritative pending source)
 * Cross-checks against closed transactions to avoid double-counting
 */
async function loadPendingTransactions(roster, closedTransactions) {
  const csv = await fetchTabCSV('MASTER HAVEN PNDS');
  const rows = parseCSV(csv);
  const pendings = [];
  const seenTransactions = new Set();
  const now = new Date();
  
  const closedSignatures = new Set();
  for (const txn of closedTransactions) {
    const agentMatchKey = getAgentMatchKey(txn.agentName);
    const normalizedAddr = normalizeAddress(txn.address);
    closedSignatures.add(`${normalizedAddr}|${agentMatchKey}|${txn.price}`);
  }
  
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }
  
  for (const row of rows) {
    const agentName = row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    if (!rosterAgentId) continue;
    
    const price = parseCurrency(row['PRICE'] || row['price'] || row['Sales Price']);
    if (!price) continue;
    
    const address = row['ADDRESS'] || row['address'] || row['Property Address'] || 'Unknown';
    const normalizedAddress = normalizeAddress(address);
    const contractDate = parseDate(row['Mutual Acceptance'] || row['contract date'] || row['Contract Date']);
    const closingDate = parseDate(row['CLOSING'] || row['closing'] || row['Close Date']);
    const leadSource = row['Lead Generated'] || row['lead source'] || row['Lead Source'] || '';
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI'] || row['gci']) || 0;
    const clientName = row['Client'] || row['client'] || row['Buyer'] || row['buyer'] || '';
    
    const pendingDedupeKey = `${normalizedAddress}|${matchKey}|${price}`;
    if (seenTransactions.has(pendingDedupeKey)) continue;
    if (closedSignatures.has(pendingDedupeKey)) continue;
    
    const isActuallyClosed = closingDate && closingDate <= now;
    if (isActuallyClosed) continue;
    
    const transaction = {
      id: `pend-${rosterAgentId}-${normalizedAddress.replace(/\s+/g, '-').substring(0, 30)}-${contractDate?.toISOString() || ''}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: 'pending',
      side: ((row['Purch/List'] || row['purch/list'] || row['Side'] || '') || '').toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: contractDate?.toISOString() || undefined,
      closedDate: undefined,
      gci: havenIncome,
      leadSource,
      isZillow: leadSource.toLowerCase().includes('zillow'),
      clientName: clientName || undefined,
    };
    
    seenTransactions.add(pendingDedupeKey);
    pendings.push(transaction);
  }
  return pendings;
}

async function loadListings(roster) {
  const csv = await fetchTabCSV('Listings');
  const rows = parseCSV(csv);
  const listingsByAgent = {};
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }
  for (const row of rows) {
    const agentName = row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    if (!rosterAgentId) continue;
    listingsByAgent[rosterAgentId] = (listingsByAgent[rosterAgentId] || 0) + 1;
  }
  return listingsByAgent;
}

async function loadCmas(roster) {
  const csv = await fetchTabCSV('CMAS_2026');
  const rows = parseCSV(csv);
  const cmasByAgent = {};
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    const matchKey = getAgentMatchKey(agentName);
    rosterMatchKeys.set(matchKey, agentId);
  }
  for (const row of rows) {
    const agentName = row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    if (!rosterAgentId) continue;
    const status = ((row['Status'] || row['status'] || '') || '').toLowerCase();
    if (status.includes('complete') || status.includes('done')) {
      cmasByAgent[rosterAgentId] = (cmasByAgent[rosterAgentId] || 0) + 1;
    }
  }
  return cmasByAgent;
}

function createEmptyAgent(name, id) {
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

function buildLeaderboard(agents) {
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

function calculateTeamStats(agents) {
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
  };
}

function getWeekDates(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay();
  const diff = current.getDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(current.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString() };
}

function generateSnapshotId() {
  const now = new Date();
  return `snapshot-${now.toISOString().replace(/[:.]/g, '-').split('T')[0]}-${now.getHours()}-${now.getMinutes()}`;
}

async function main() {
  console.log('Loading data from Google Sheets...');
  console.log('Sheet ID:', SHEET_ID);
  
  const roster = await loadRoster();
  console.log(`Roster loaded: ${roster.size} agents`);
  
  const closed = await loadClosedTransactions(roster);
  console.log(`Closed transactions loaded: ${closed.length}`);
  
  const pendings = await loadPendingTransactions(roster, closed);
  console.log(`Pending transactions loaded: ${pendings.length}`);
  
  const listingsByAgent = await loadListings(roster);
  const cmasByAgent = await loadCmas(roster);
  
  const agents = {};
  for (const [agentId, agentName] of roster.entries()) {
    agents[agentId] = createEmptyAgent(agentName, agentId);
  }
  
  const allTransactions = [...pendings, ...closed];
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
    if (txn.isZillow) agent.zillowLeads += 1;
  }
  
  for (const [agentId, count] of Object.entries(listingsByAgent)) {
    if (agents[agentId]) agents[agentId].activeListings = count;
  }
  for (const [agentId, count] of Object.entries(cmasByAgent)) {
    if (agents[agentId]) agents[agentId].cmasCompleted = count;
  }
  
  const leaderboard = buildLeaderboard(agents);
  const teamStats = calculateTeamStats(agents);
  
  const { weekStart, weekEnd } = getWeekDates();
  const metadata = {
    id: generateSnapshotId(),
    createdAt: new Date().toISOString(),
    uploadedBy: 'google-sheets-auto-load',
    sourceFiles: ['Haven Transactions 2026'],
    agentCount: Object.keys(agents).length,
    transactionCount: allTransactions.length,
    weekStart,
    weekEnd,
    notes: `Loaded from Haven Transactions 2026. Roster-based filtering active. CLOSED from Master Closed 2026 (${closed.length} txns). PENDING from MASTER HAVEN PNDS (${pendings.length} txns). Dedupe: normalizedAddress+agentMatchKey+price+closingDate.`,
  };
  
  const snapshot = { metadata, agents, leaderboard, teamStats };
  
  fs.writeFileSync(CURRENT_SNAPSHOT, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot saved to ${CURRENT_SNAPSHOT}`);
  console.log(`Agents: ${metadata.agentCount}`);
  console.log(`Transactions: ${metadata.transactionCount}`);
  console.log(`Total GCI: $${(teamStats.totalGCI || 0).toLocaleString()}`);
  console.log(`Total Closed Volume: $${(teamStats.totalClosedVolume || 0).toLocaleString()}`);
  console.log(`Total Pending Volume: $${(teamStats.totalPendingVolume || 0).toLocaleString()}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
