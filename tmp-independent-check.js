/**
 * Check why Independent Purchase Price transactions aren't all being counted
 */
const https = require('https');

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

async function fetchTabCSV(tabName) {
  const url = `https://docs.google.com/spreadsheets/d/${TRANSACTIONS_SHEET}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
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

async function main() {
  console.log('=== Independent Purchase Price Analysis ===\n');
  
  // Load roster
  const spokaneCSV = await fetchTabCSV('Spokane Agent Roster');
  const spokaneRows = parseCSV(spokaneCSV);
  const cdaCSV = await fetchTabCSV('CDA Agent Roster');
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
  
  // Load closed
  const closedCSV = await fetchTabCSV('Master Closed 2026');
  const rows = parseCSV(closedCSV);
  const now = new Date();
  
  // Find rows with Independent Price but no Team Price
  console.log('\n=== Rows with Independent Price but NO Team Price ===\n');
  
  for (const row of rows) {
    const agentName = row['Name-2nd Agent'] || row['Agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const teamPrice = parseCurrency(row['Team Purchase Price']);
    const independentPrice = parseCurrency(row['Independent Purchase Price']);
    
    if (!teamPrice && independentPrice) {
      const agentId = normalizeAgentId(agentName);
      const matchKey = getAgentMatchKey(agentName);
      
      let rosterAgentId = roster.has(agentId) ? agentId : null;
      if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
        rosterAgentId = rosterMatchKeys.get(matchKey);
      }
      
      const closingDate = parseDate(row['Settlement Date']);
      const inPast = closingDate && closingDate <= now;
      
      console.log(`Agent: ${agentName}`);
      console.log(`  Address: ${row['Address']}`);
      console.log(`  Team Price: ${row['Team Purchase Price'] || 'EMPTY'}`);
      console.log(`  Independent Price: ${row['Independent Purchase Price']}`);
      console.log(`  Closing Date: ${row['Settlement Date']}`);
      console.log(`  In roster: ${rosterAgentId ? 'YES (' + rosterAgentId + ')' : 'NO'}`);
      console.log(`  Date in past: ${inPast ? 'YES' : 'NO'}`);
      console.log('');
    }
  }
}

main().catch(console.error);
