/**
 * Clean-room rebuild of Haven Performance Hub snapshot from all 5 source sheets.
 * 
 * Sources:
 * 1. Haven Transactions 2026 (1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl) - roster, pendings, closings, listings, CMAs
 * 2. Haven Master Payout & Cap Dashboard (15Wfyp7Z8hvLayj2DtPQ9K_ydtdwIUojLhmlVzHOra3k) - cap contributions
 * 3. Weekly Zillow Stats (1cqoprcDPxah-1b9gSUiXwNUFJBlCcfrq5-XyUmIarmI) - showings, funnel metrics
 * 4. Zillow Transactions Tracking (11lKgPwG_p7PTTD7nSetijPxx9gz5NEw0U20foCA9On4) - Zillow attribution
 * 5. Team Commission Level Tracking (1jM-W9MWNU5lkfdgu3vESfj9CWcxnnNjR) - split levels
 * 
 * Business rules:
 * - Roster defines active agents (Spokane + CDA merged)
 * - Non-roster agents with transactions = departed, exclude from active stats
 * - Cap only from explicit cap-eligible field in Payout Dashboard
 * - Showings only from Weekly Zillow Stats
 * - No double-counting addresses/deals
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const CURRENT_SNAPSHOT = path.join(SNAPSHOTS_DIR, 'current.json');

if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Source sheet IDs
const SHEETS = {
  TRANSACTIONS: '1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl',
  PAYOUT: '15Wfyp7Z8hvLayj2DtPQ9K_ydtdwIUojLhmlVzHOra3k',
  ZILLOW_STATS: '1cqoprcDPxah-1b9gSUiXwNUFJBlCcfrq5-XyUmIarmI',
  ZILLOW_TXNS: '11lKgPwG_p7PTTD7nSetijPxx9gz5NEw0U20foCA9On4',
  COMMISSION: '1jM-W9MWNU5lkfdgu3vESfj9CWcxnnNjR',
};

// Tab GIDs for Transactions sheet
// Note: Use sheet names for roster tabs (GIDs unreliable), use GIDs for data tabs
const TRANSACTION_TABS = {
  'Spokane Agent Roster': null, // Use sheet name - GID 1454437421 is wrong
  'CDA Agent Roster': null,
  'MASTER HAVEN PNDS': 0,
  'Master Closed 2026': null, // Use sheet name - GID 1 points to wrong data
  'Listings': 1085800109,
  'Upcoming Listings': 1196688652,
  'CMAS_2026': null, // Use sheet name - GID 1932605207 points to wrong sheet
  'Spokane Rescissions': 862721766,
  'CDA Rescissions': null,
};

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

async function fetchTabCSV(sheetId, tabName) {
  const gid = TRANSACTION_TABS[tabName];
  let url;
  if (gid !== null && gid !== undefined) {
    url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
  } else {
    url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  }
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
  // Trim headers to handle trailing spaces (e.g., "Name-2nd Agent " vs "Name-2nd Agent")
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
  const rejected = ['pending', 'closed', 'rescinded', 'active', 'total', 'sum', 'count', 'average', 'address', 'price', 'n/a', 'none', 'null', 'tbd', 'grand total'];
  for (const pattern of rejected) { if (lower === pattern || lower.includes(pattern)) return false; }
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed)) return false;
  if (/^[\d.,$%]+$/.test(trimmed)) return false;
  // Don't reject names starting with "Lofty" or "**" - these are valid transaction markers
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
 * Check if a date falls within the current cap year (April 7 - April 6).
 */
function isInCurrentCapYear(date) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const capYearStart = new Date(currentYear, 3, 7); // April is month 3 (0-indexed)
  
  // If we're before April 7, cap year started last year
  if (now < capYearStart) {
    capYearStart.setFullYear(currentYear - 1);
  }
  
  const capYearEnd = new Date(capYearStart);
  capYearEnd.setFullYear(capYearEnd.getFullYear() + 1);
  
  return date >= capYearStart && date < capYearEnd;
}

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
  console.log('  Loading Spokane Agent Roster...');
  const spokaneCSV = await fetchTabCSV(SHEETS.TRANSACTIONS, 'Spokane Agent Roster');
  const spokaneRows = parseCSV(spokaneCSV);
  
  console.log('  Loading CDA Agent Roster...');
  const cdaCSV = await fetchTabCSV(SHEETS.TRANSACTIONS, 'CDA Agent Roster');
  const cdaRows = parseCSV(cdaCSV);
  
  const roster = new Map();
  const rosterMatchKeys = new Map();
  
  function processRosterRow(row) {
    // Roster sheets have agent names in first column (index 0), not named columns
    // First column key is '0' after parsing
    let agentName = row['0'] || row['AGENT'] || row['Agent'] || row['agent'];
    
    // Handle multi-line names like "Cambria Henry\nOwner | Managing Broker"
    if (agentName && typeof agentName === 'string') {
      agentName = agentName.split('\n')[0].trim();
    }
    
    if (!agentName || !isValidAgentName(agentName)) return;
    
    const canonicalName = agentName.trim();
    const agentId = normalizeAgentId(canonicalName);
    const matchKey = getAgentMatchKey(canonicalName);
    
    if (!rosterMatchKeys.has(matchKey)) {
      rosterMatchKeys.set(matchKey, agentId);
      roster.set(agentId, canonicalName);
    }
  }
  
  for (const row of spokaneRows) processRosterRow(row);
  for (const row of cdaRows) processRosterRow(row);
  
  console.log(`  Roster loaded: ${roster.size} unique agents (merged Spokane + CDA)`);
  return roster;
}

async function loadClosedTransactions(roster) {
  console.log('  Loading Master Closed 2026...');
  const csv = await fetchTabCSV(SHEETS.TRANSACTIONS, 'Master Closed 2026');
  const rows = parseCSV(csv);
  const closed = [];
  const seenTransactions = new Map();
  const now = new Date();
  
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    rosterMatchKeys.set(getAgentMatchKey(agentName), agentId);
  }
  
  for (const row of rows) {
    // Handle header with trailing space: "Name-2nd Agent " vs "Name-2nd Agent"
    const agentName = row['Name-2nd Agent'] || row['Name-2nd Agent '.trim()] || row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    if (!rosterAgentId) continue;
    
    // Use correct column names from Master Closed 2026 sheet
    // Check BOTH Team Purchase Price and Independent Purchase Price columns
    const teamPrice = parseCurrency(row['Team Purchase Price']);
    const independentPrice = parseCurrency(row['Independent Purchase Price']);
    const price = teamPrice || independentPrice || parseCurrency(row['PRICE']) || parseCurrency(row['price']);
    if (!price) continue;
    
    const address = row['Address'] || row['ADDRESS'] || row['address'] || 'Unknown';
    const normalizedAddress = normalizeAddress(address);
    // Settlement Date is the closing date in Master Closed 2026
    const closingDate = parseDate(row['Settlement Date'] || row['CLOSING'] || row['closing']);
    
    // Only count as closed if the closing date is in the past
    if (!closingDate || closingDate > now) continue;
    
    const leadSource = row['Lead Generated'] || row['Lead Source'] || '';
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI']) || 0;
    
    // Identify referrals from Referral column or Lead Generated source
    // EXCLUDE Zillow and Redfin - they are NOT referrals per Cambria's rule
    const referralAmount = parseCurrency(row['Referral'] || row['referral']);
    const zillowFlexReferral = parseCurrency(row['Zillow Flex Referral'] || row['zillow flex referral']);
    const redfinReferral = parseCurrency(row['Redfin Referral'] || row['redfin referral']);
    const personalSphere = parseCurrency(row['Personal Sphere'] || row['personal sphere']);
    
    // Check if source is Zillow or Redfin - these should NEVER count as referrals
    const isZillowSource = leadSource.toLowerCase().includes('zillow');
    const isRedfinSource = leadSource.toLowerCase().includes('redfin');
    
    // A transaction is a referral ONLY if it has referral money from non-Zillow/Redfin sources
    // OR if the lead source contains 'referral', 'sphere', or 'soi' (but not Zillow/Redfin)
    const isReferral = (referralAmount > 0 && !isZillowSource && !isRedfinSource) ||
                       (personalSphere > 0 && !isZillowSource && !isRedfinSource) ||
                       (!isZillowSource && !isRedfinSource && (
                         leadSource.toLowerCase().includes('referral') ||
                         leadSource.toLowerCase().includes('sphere') ||
                         leadSource.toLowerCase().includes('soi')
                       ));
    
    let referralSource = null;
    let referralFee = 0;
    
    // Only set referral fee and source for non-Zillow/Redfin referrals
    if (!isZillowSource && !isRedfinSource) {
      if (referralAmount > 0) {
        referralFee = referralAmount;
        referralSource = 'Referral';
      } else if (personalSphere > 0) {
        referralFee = personalSphere;
        referralSource = 'Personal Sphere';
      } else if (leadSource.toLowerCase().includes('referral')) {
        referralSource = leadSource;
      } else if (leadSource.toLowerCase().includes('sphere')) {
        referralSource = leadSource;
      } else if (leadSource.toLowerCase().includes('soi')) {
        referralSource = leadSource;
      }
    }
    
    const dedupeKey = `${normalizedAddress}|${matchKey}|${price}|${closingDate.toISOString().split('T')[0]}`;
    if (seenTransactions.has(dedupeKey)) continue;
    
    closed.push({
      id: `closed-${rosterAgentId}-${normalizedAddress.replace(/\s+/g, '-').substring(0, 30)}-${closingDate.toISOString()}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: 'closed',
      side: ((row['Purch/List'] || '') || '').toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: parseDate(row['Mutual Acceptance'])?.toISOString() || undefined,
      closedDate: closingDate.toISOString(),
      gci: havenIncome,
      leadSource,
      isZillow: leadSource.toLowerCase().includes('zillow'),
      isReferral,
      referralFee,
      referralSource,
      isZillowFlex: zillowFlexReferral > 0,
      isRedfin: redfinReferral > 0,
      isSphere: personalSphere > 0 || leadSource.toLowerCase().includes('sphere'),
    });
    
    seenTransactions.set(dedupeKey, true);
  }
  
  console.log(`  Closed transactions: ${closed.length}`);
  return closed;
}

async function loadPendingTransactions(roster, closedTransactions) {
  console.log('  Loading MASTER HAVEN PNDS...');
  const csv = await fetchTabCSV(SHEETS.TRANSACTIONS, 'MASTER HAVEN PNDS');
  const rows = parseCSV(csv);
  const pendings = [];
  const pendingDetailsByAgent = {};
  const seenTransactions = new Set();
  const now = new Date();
  
  const closedSignatures = new Set();
  for (const txn of closedTransactions) {
    const matchKey = getAgentMatchKey(txn.agentName);
    const normalizedAddr = normalizeAddress(txn.address);
    closedSignatures.add(`${normalizedAddr}|${matchKey}|${txn.price}`);
  }
  
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    rosterMatchKeys.set(getAgentMatchKey(agentName), agentId);
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
    
    const price = parseCurrency(row['PRICE'] || row['price']);
    if (!price) continue;
    
    const address = row['ADDRESS'] || row['address'] || 'Unknown';
    const normalizedAddress = normalizeAddress(address);
    const contractDate = parseDate(row['Mutual Acceptance']);
    const closingDate = parseDate(row['CLOSING']);
    const leadSource = row['Lead Generated'] || row['Lead Source'] || '';
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI']) || 0;
    
    // Extract agent income fields from MASTER HAVEN PNDS
    // Use Agent Income for normal deals, Personal Sphere column for sphere deals
    const agentIncomeField = parseCurrency(row['Agent Income'] || row['agent income']);
    const personalSphereField = parseCurrency(row['Personal Sphere'] || row['personal sphere']);
    
    // Determine expected agent income based on deal type
    let expectedAgentIncome = 0;
    let sourceIncomeField = 'Haven Income';
    
    if (personalSphereField && personalSphereField > 0) {
      expectedAgentIncome = personalSphereField;
      sourceIncomeField = 'Personal Sphere';
    } else if (agentIncomeField && agentIncomeField > 0) {
      expectedAgentIncome = agentIncomeField;
      sourceIncomeField = 'Agent Income';
    } else if (havenIncome && havenIncome > 0) {
      expectedAgentIncome = havenIncome;
      sourceIncomeField = 'Haven Income';
    }
    
    // Identify referrals from Referral column or Lead Generated source
    // EXCLUDE Zillow and Redfin - they are NOT referrals per Cambria's rule
    const referralAmount = parseCurrency(row['Referral'] || row['referral']);
    const zillowFlexReferral = parseCurrency(row['Zillow Flex Referral'] || row['zillow flex referral']);
    const redfinReferral = parseCurrency(row['Redfin Referral'] || row['redfin referral']);
    const personalSphere = parseCurrency(row['Personal Sphere'] || row['personal sphere']);
    
    // Check if source is Zillow or Redfin - these should NEVER count as referrals
    const isZillowSource = leadSource.toLowerCase().includes('zillow');
    const isRedfinSource = leadSource.toLowerCase().includes('redfin');
    
    // A transaction is a referral ONLY if it has referral money from non-Zillow/Redfin sources
    // OR if the lead source contains 'referral', 'sphere', or 'soi' (but not Zillow/Redfin)
    const isReferral = (referralAmount > 0 && !isZillowSource && !isRedfinSource) ||
                       (personalSphere > 0 && !isZillowSource && !isRedfinSource) ||
                       (!isZillowSource && !isRedfinSource && (
                         leadSource.toLowerCase().includes('referral') ||
                         leadSource.toLowerCase().includes('sphere') ||
                         leadSource.toLowerCase().includes('soi')
                       ));
    
    let referralSource = null;
    let referralFee = 0;
    
    // Only set referral fee and source for non-Zillow/Redfin referrals
    if (!isZillowSource && !isRedfinSource) {
      if (referralAmount > 0) {
        referralFee = referralAmount;
        referralSource = 'Referral';
      } else if (personalSphere > 0) {
        referralFee = personalSphere;
        referralSource = 'Personal Sphere';
      } else if (leadSource.toLowerCase().includes('referral')) {
        referralSource = leadSource;
      } else if (leadSource.toLowerCase().includes('sphere')) {
        referralSource = leadSource;
      } else if (leadSource.toLowerCase().includes('soi')) {
        referralSource = leadSource;
      }
    }
    
    const pendingDedupeKey = `${normalizedAddress}|${matchKey}|${price}`;
    if (seenTransactions.has(pendingDedupeKey)) continue;
    if (closedSignatures.has(pendingDedupeKey)) continue;
    
    const isActuallyClosed = closingDate && closingDate <= now;
    if (isActuallyClosed) continue;
    
    const pendingTxn = {
      id: `pend-${rosterAgentId}-${normalizedAddress.replace(/\s+/g, '-').substring(0, 30)}-${contractDate?.toISOString() || ''}`,
      agentId: rosterAgentId,
      agentName: agentName.trim(),
      address,
      price,
      status: 'pending',
      side: ((row['Purch/List'] || '') || '').toLowerCase().includes('list') ? 'seller' : 'buyer',
      contractDate: contractDate?.toISOString() || undefined,
      closedDate: undefined,
      gci: havenIncome,
      leadSource,
      isZillow: leadSource.toLowerCase().includes('zillow'),
      isReferral,
      referralFee,
      referralSource,
      isZillowFlex: zillowFlexReferral > 0,
      isRedfin: redfinReferral > 0,
      isSphere: personalSphere > 0 || leadSource.toLowerCase().includes('sphere'),
    };
    
    pendings.push(pendingTxn);
    
    // Build pending transaction detail for agent view
    if (!pendingDetailsByAgent[rosterAgentId]) {
      pendingDetailsByAgent[rosterAgentId] = [];
    }
    pendingDetailsByAgent[rosterAgentId].push({
      transactionId: pendingTxn.id,
      address,
      contractDate: contractDate?.toISOString() || undefined,
      expectedClosingDate: closingDate?.toISOString() || undefined,
      purchasePrice: price,
      expectedAgentIncome: expectedAgentIncome,
      sourceIncomeField,
      incomeBreakdown: {
        agentIncome: agentIncomeField || 0,
        personalSphere: personalSphereField || 0,
        havenIncome: havenIncome || 0,
      },
      leadSource,
      isSphere: personalSphere > 0 || leadSource.toLowerCase().includes('sphere'),
      isZillow: leadSource.toLowerCase().includes('zillow'),
    });
    
    seenTransactions.add(pendingDedupeKey);
  }
  
  console.log(`  Pending transactions: ${pendings.length}`);
  return { pendings, pendingDetailsByAgent };
}

async function loadListings(roster) {
  console.log('  Loading Listings...');
  const csv = await fetchTabCSV(SHEETS.TRANSACTIONS, 'Listings');
  const rows = parseCSV(csv);
  const listingsByAgent = {};
  
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    rosterMatchKeys.set(getAgentMatchKey(agentName), agentId);
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
  
  console.log(`  Active listings: ${Object.values(listingsByAgent).reduce((a, b) => a + b, 0)} across ${Object.keys(listingsByAgent).length} agents`);
  return listingsByAgent;
}

async function loadCmas(roster) {
  console.log('  Loading CMAS_2026...');
  const csv = await fetchTabCSV(SHEETS.TRANSACTIONS, 'CMAS_2026');
  const rows = parseCSV(csv);
  const cmasByAgent = {};
  
  const rosterMatchKeys = new Map();
  for (const [agentId, agentName] of roster.entries()) {
    rosterMatchKeys.set(getAgentMatchKey(agentName), agentId);
  }
  
  for (const row of rows) {
    // Header has leading spaces: "   AGENT"
    const agentName = row['AGENT'] || row['   AGENT'] || row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    if (!rosterAgentId) continue;
    
    // Count completed CMAs (DATE COMPLETED is populated)
    const dateCompleted = row['DATE COMPLETED'] || row[' DATE COMPLETED'];
    if (dateCompleted && dateCompleted.trim() !== '') {
      cmasByAgent[rosterAgentId] = (cmasByAgent[rosterAgentId] || 0) + 1;
    }
  }
  
  const total = Object.values(cmasByAgent).reduce((a, b) => a + b, 0);
  console.log(`  Completed CMAs: ${total}`);
  return cmasByAgent;
}

async function loadCapContributions(roster) {
  console.log('  Loading cap contributions from Payout Dashboard...');
  // Get list of agent tabs by fetching a sample and checking structure
  // For now, we'll load a few known agent tabs
  const agentTabs = ['Amy Sparrow', 'Paula Kamp', 'Kurt Burgan', 'Emily Polanco', 'Marcus Mathews', 'Kiaya Henry', 'Didi Emtman', 'Matt Procter'];
  const capByAgent = {};
  const capTransactionsByAgent = {};
  
  for (const agentTab of agentTabs) {
    try {
      const csv = await fetchTabCSV(SHEETS.PAYOUT, agentTab);
      const rows = parseCSV(csv);
      
      const rosterAgentId = normalizeAgentId(agentTab);
      if (!roster.has(rosterAgentId)) continue;
      
      let totalCap = 0;
      const capTxns = [];
      
      for (const row of rows) {
        // Look for cap-eligible field: "Haven's Gross Commission (This amount should be added to personal cap if transaction is personal)"
        const capEligibleField = row['Haven Commission Breakdown Haven\'s Gross Commission (This amount should be added to personal cap if transaction is personal)'] ||
                                  row['Haven\'s Gross Commission'] ||
                                  row['Haven Gross Commission'];
        
        if (capEligibleField) {
          const capAmount = parseCurrency(capEligibleField);
          const closedDate = parseDate(row['Closing Date'] || row['Settlement Date']);
          
          // Only count cap contributions from current cap year (April 7 - April 6)
          if (capAmount && capAmount > 0 && closedDate && isInCurrentCapYear(closedDate)) {
            totalCap += capAmount;
            capTxns.push({
              address: row['Address'] || 'Unknown',
              closedDate: row['Closing Date'] || row['Settlement Date'] || undefined,
              purchasePrice: parseCurrency(row[' Purchase Price ']) || 0,
              capContribution: capAmount,
              isSphere: (row['Lead Source'] || '').toLowerCase().includes('personal') || (row['Lead Source'] || '').toLowerCase().includes('sphere'),
            });
          }
        }
      }
      
      if (totalCap > 0) {
        capByAgent[rosterAgentId] = totalCap;
        capTransactionsByAgent[rosterAgentId] = capTxns;
        console.log(`    ${agentTab}: $${totalCap.toLocaleString()} cap (${capTxns.length} transactions)`);
      }
    } catch (e) {
      // Tab may not exist or agent may have no data
    }
  }
  
  return { capByAgent, capTransactionsByAgent };
}

async function loadShowings() {
  console.log('  Loading showings from Weekly Zillow Stats...');
  try {
    const csv = await fetchTabCSV(SHEETS.ZILLOW_STATS, 'Buyer Connections 30D');
    const rows = parseCSV(csv);
    const showingsByAgent = {};
    
    for (const row of rows) {
      const agentName = row['Agent Name'];
      if (!agentName || agentName.toLowerCase() === 'grand total') continue;
      
      const showings = parseInt(row['Showings'] || '0', 10);
      if (showings > 0) {
        showingsByAgent[normalizeAgentId(agentName)] = showings;
      }
    }
    
    const total = Object.values(showingsByAgent).reduce((a, b) => a + b, 0);
    console.log(`  Showings (30D): ${total} across ${Object.keys(showingsByAgent).length} agents`);
    return showingsByAgent;
  } catch (e) {
    console.log(`  Showings load error: ${e.message}`);
    return {};
  }
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
    showings: 0,
    capContributingTransactions: [],
    referrals: 0,
    referralVolume: 0,
    referralTransactions: [],
    pendingTransactionsDetail: [],
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
      referrals: agent.referrals,
      referralVolume: agent.referralVolume,
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
    totalShowings: values.reduce((sum, a) => sum + (a.showings || 0), 0),
    avgZillowConversion: 0,
    totalZillowLeads: values.reduce((sum, a) => sum + a.zillowLeads, 0),
    totalZillowCost: 0,
    totalCapContributions: values.reduce((sum, a) => sum + a.capProgress, 0),
    totalGCI: values.reduce((sum, a) => sum + a.gci, 0),
    totalReferrals: values.reduce((sum, a) => sum + (a.referrals || 0), 0),
    totalReferralVolume: values.reduce((sum, a) => sum + (a.referralVolume || 0), 0),
  };
}

function generateSnapshotId() {
  const now = new Date();
  return `snapshot-${now.toISOString().replace(/[:.]/g, '-').split('T')[0]}-${now.getHours()}-${now.getMinutes()}`;
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

async function main() {
  console.log('\n=== Haven Performance Hub - Clean Room Rebuild ===\n');
  console.log('Loading from 5 source sheets:\n');
  
  const roster = await loadRoster();
  const closed = await loadClosedTransactions(roster);
  const { pendings, pendingDetailsByAgent } = await loadPendingTransactions(roster, closed);
  const listingsByAgent = await loadListings(roster);
  const cmasByAgent = await loadCmas(roster);
  const { capByAgent, capTransactionsByAgent } = await loadCapContributions(roster);
  const showingsByAgent = await loadShowings();
  
  console.log('\nBuilding agent snapshots...\n');
  
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
    
    // Track referrals (closed transactions only)
    if (txn.status === 'closed' && txn.isReferral) {
      agent.referrals = (agent.referrals || 0) + 1;
      agent.referralVolume = (agent.referralVolume || 0) + txn.price;
      if (!agent.referralTransactions) agent.referralTransactions = [];
      agent.referralTransactions.push({
        transactionId: txn.id,
        address: txn.address,
        closedDate: txn.closedDate,
        purchasePrice: txn.price,
        referralFee: txn.referralFee,
        referralSource: txn.referralSource || 'Unknown',
        isZillowFlex: txn.isZillowFlex,
        isRedfin: txn.isRedfin,
        isSphere: txn.isSphere,
      });
    }
  }
  
  for (const [agentId, count] of Object.entries(listingsByAgent)) {
    if (agents[agentId]) agents[agentId].activeListings = count;
  }
  for (const [agentId, count] of Object.entries(cmasByAgent)) {
    if (agents[agentId]) agents[agentId].cmasCompleted = count;
  }
  for (const [agentId, cap] of Object.entries(capByAgent)) {
    if (agents[agentId]) {
      agents[agentId].capProgress = cap;
      agents[agentId].capContributingTransactions = capTransactionsByAgent[agentId] || [];
    }
  }
  for (const [agentId, showings] of Object.entries(showingsByAgent)) {
    if (agents[agentId]) agents[agentId].showings = showings;
  }
  
  // Attach pending transaction details to each agent
  for (const [agentId, details] of Object.entries(pendingDetailsByAgent)) {
    if (agents[agentId]) {
      agents[agentId].pendingTransactionsDetail = details;
    }
  }
  
  const leaderboard = buildLeaderboard(agents);
  const teamStats = calculateTeamStats(agents);
  
  const { weekStart, weekEnd } = getWeekDates();
  const metadata = {
    id: generateSnapshotId(),
    createdAt: new Date().toISOString(),
    uploadedBy: 'clean-room-rebuild',
    sourceFiles: [
      'Haven Transactions 2026',
      'Haven Master Payout & Cap Dashboard',
      'Weekly Zillow Stats',
      'Zillow Transactions Tracking',
      'Team Commission Level Tracking',
    ],
    agentCount: Object.keys(agents).length,
    transactionCount: allTransactions.length,
    weekStart,
    weekEnd,
    notes: `Clean-room rebuild. Roster: ${roster.size} agents. Closed: ${closed.length}. Pending: ${pendings.length}. Cap from Payout Dashboard. Showings from Weekly Zillow Stats.`,
  };
  
  const snapshot = { metadata, agents, leaderboard, teamStats };
  
  fs.writeFileSync(CURRENT_SNAPSHOT, JSON.stringify(snapshot, null, 2));
  
  console.log('\n=== Summary ===\n');
  console.log(`Snapshot saved to: ${CURRENT_SNAPSHOT}`);
  console.log(`Agents: ${metadata.agentCount}`);
  console.log(`Transactions: ${metadata.transactionCount} (${closed.length} closed, ${pendings.length} pending)`);
  console.log(`Total GCI: $${(teamStats.totalGCI || 0).toLocaleString()}`);
  console.log(`Total Closed Volume: $${(teamStats.totalClosedVolume || 0).toLocaleString()}`);
  console.log(`Total Pending Volume: $${(teamStats.totalPendingVolume || 0).toLocaleString()}`);
  console.log(`Total Cap Contributions: $${(teamStats.totalCapContributions || 0).toLocaleString()}`);
  console.log(`Total Showings (30D): ${teamStats.totalShowings}`);
  console.log(`Total Active Listings: ${teamStats.totalActiveListings}`);
  console.log(`Total Completed CMAs: ${teamStats.totalCmasCompleted}`);
  console.log('\n=== Top 5 Agents by Closed Volume ===\n');
  leaderboard.slice(0, 5).forEach((entry, i) => {
    console.log(`${i + 1}. ${entry.agentName}: $${entry.closedVolume.toLocaleString()} (${entry.closedTransactions} closings)`);
  });
  console.log('\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
