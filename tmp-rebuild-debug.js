/**
 * Debug the exact rebuild-snapshot.js logic to see what it's filtering
 */
const https = require('https');
const fs = require('fs');

const TRANSACTIONS_SHEET = '1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function fetchTabCSV(sheetId, tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
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

async function main() {
  console.log('\n=== Rebuild Snapshot Logic Debug ===\n');
  
  // Load roster
  const spokaneCSV = await fetchTabCSV(TRANSACTIONS_SHEET, 'Spokane Agent Roster');
  const spokaneRows = parseCSV(spokaneCSV);
  const cdaCSV = await fetchTabCSV(TRANSACTIONS_SHEET, 'CDA Agent Roster');
  const cdaRows = parseCSV(cdaCSV);
  
  const roster = new Map();
  const rosterMatchKeys = new Map();
  
  function processRosterRow(row) {
    let agentName = row['0'] || row['AGENT'] || row['Agent'] || row['agent'];
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
  
  console.log('Roster:', roster.size, 'agents');
  
  // Load closed - EXACT logic from rebuild-snapshot.js
  const closedCSV = await fetchTabCSV(TRANSACTIONS_SHEET, 'Master Closed 2026');
  const rows = parseCSV(closedCSV);
  const closed = [];
  const seenTransactions = new Map();
  const now = new Date();
  
  let step1_agentCheck = 0;
  let step2_priceCheck = 0;
  let step3_dateCheck = 0;
  let step4_dedupe = 0;
  let finalCount = 0;
  
  const excludedNoPrice = [];
  const excludedFuture = [];
  const excludedDedupe = [];
  
  for (const row of rows) {
    // Step 1: Agent name check
    const agentName = row['Name-2nd Agent'] || row['Name-2nd Agent '.trim()] || row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    if (!rosterAgentId) continue;
    
    step1_agentCheck++;
    
    // Step 2: Price check - THIS IS THE BUG! Only checks Team Purchase Price
    const price = parseCurrency(row['Team Purchase Price'] || row['PRICE'] || row['price']);
    if (!price) {
      excludedNoPrice.push({
        agent: agentName,
        address: row['Address'],
        teamPrice: row['Team Purchase Price'],
        independentPrice: row['Independent Purchase Price'],
      });
      continue;
    }
    
    step2_priceCheck++;
    
    // Step 3: Date check
    const address = row['Address'] || row['ADDRESS'] || row['address'] || 'Unknown';
    const normalizedAddress = normalizeAddress(address);
    const closingDate = parseDate(row['Settlement Date'] || row['CLOSING'] || row['closing']);
    
    if (!closingDate || closingDate > now) {
      excludedFuture.push({
        agent: agentName,
        address: row['Address'],
        date: row['Settlement Date'],
      });
      continue;
    }
    
    step3_dateCheck++;
    
    // Step 4: Dedupe
    const leadSource = row['Lead Generated'] || row['Lead Source'] || '';
    const havenIncome = parseCurrency(row['Haven Income'] || row['GCI']) || 0;
    const dedupeKey = `${normalizedAddress}|${matchKey}|${price}|${closingDate.toISOString().split('T')[0]}`;
    
    if (seenTransactions.has(dedupeKey)) {
      excludedDedupe.push({
        agent: agentName,
        address: row['Address'],
        key: dedupeKey,
      });
      continue;
    }
    
    step4_dedupe++;
    seenTransactions.set(dedupeKey, true);
    finalCount++;
  }
  
  console.log('\n=== Filter Steps (EXACT rebuild-snapshot.js logic) ===');
  console.log('Step 1 - Passed agent roster match:', step1_agentCheck);
  console.log('Step 2 - Passed Team Purchase Price check:', step2_priceCheck);
  console.log('Step 3 - Passed date check (in past):', step3_dateCheck);
  console.log('Step 4 - After dedupe:', step4_dedupe);
  console.log('FINAL COUNT:', finalCount);
  
  console.log('\n=== EXCLUDED: No Team Purchase Price (but may have Independent Price) ===');
  console.log('Count:', excludedNoPrice.length);
  excludedNoPrice.forEach((r, i) => {
    console.log(`  ${i+1}. ${r.agent} - ${r.address}`);
    console.log(`     Team Price: ${r.teamPrice || 'EMPTY'}, Independent Price: ${r.independentPrice || 'EMPTY'}`);
  });
  
  console.log('\n=== EXCLUDED: Future closing dates ===');
  console.log('Count:', excludedFuture.length);
  excludedFuture.forEach((r, i) => {
    console.log(`  ${i+1}. ${r.agent} - ${r.address} - ${r.date}`);
  });
  
  console.log('\n=== EXCLUDED: Duplicates ===');
  console.log('Count:', excludedDedupe.length);
  
  console.log('\n=== Current Production ===');
  const snapshot = JSON.parse(fs.readFileSync('./data/snapshots/current.json', 'utf-8'));
  console.log('Production closed:', snapshot.teamStats.totalClosedTransactions);
  console.log('Expected from this logic:', finalCount);
  console.log('Difference:', snapshot.teamStats.totalClosedTransactions - finalCount);
}

main().catch(console.error);
