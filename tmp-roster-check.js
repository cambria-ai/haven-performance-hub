/**
 * Check roster matching to see how many valid transactions are being filtered out
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

async function main() {
  console.log('\n=== Roster Matching Analysis ===\n');
  
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
  
  console.log('Roster loaded:', roster.size, 'unique agents');
  console.log('Match keys:', rosterMatchKeys.size);
  
  // Load closed transactions
  const closedCSV = await fetchTabCSV(TRANSACTIONS_SHEET, 'Master Closed 2026');
  const closedRows = parseCSV(closedCSV);
  const now = new Date();
  
  let totalValid = 0;
  let matchedRoster = 0;
  let noRosterMatch = 0;
  const unmatchedAgents = new Set();
  const unmatchedTransactions = [];
  
  for (const row of closedRows) {
    const agentName = row['Name-2nd Agent'] || row['Agent'] || row['agent'];
    if (!agentName || !isValidAgentName(agentName)) continue;
    
    const teamPrice = parseCurrency(row['Team Purchase Price']);
    const independentPrice = parseCurrency(row['Independent Purchase Price']);
    const price = teamPrice || independentPrice;
    if (!price) continue;
    
    const closingDate = parseDate(row['Settlement Date'] || row['CLOSING'] || row['closing']);
    if (!closingDate || closingDate > now) continue;
    
    totalValid++;
    
    const agentId = normalizeAgentId(agentName);
    const matchKey = getAgentMatchKey(agentName);
    
    let rosterAgentId = roster.has(agentId) ? agentId : null;
    if (!rosterAgentId && rosterMatchKeys.has(matchKey)) {
      rosterAgentId = rosterMatchKeys.get(matchKey);
    }
    
    if (rosterAgentId) {
      matchedRoster++;
    } else {
      noRosterMatch++;
      unmatchedAgents.add(agentName);
      unmatchedTransactions.push({
        agent: agentName,
        address: row['Address'],
        price: price,
        date: row['Settlement Date'],
      });
    }
  }
  
  console.log('\n=== Transaction Matching Results ===');
  console.log('Total valid transactions in sheet:', totalValid);
  console.log('Matched to roster:', matchedRoster);
  console.log('NO ROSTER MATCH:', noRosterMatch);
  console.log('\nUnmatched agent names:', [...unmatchedAgents].join(', '));
  
  if (unmatchedTransactions.length > 0) {
    console.log('\nUnmatched transactions:');
    unmatchedTransactions.slice(0, 15).forEach((t, i) => {
      console.log(`  ${i+1}. ${t.agent} - ${t.address} - $${t.price} - ${t.date}`);
    });
  }
  
  console.log('\n=== Summary ===');
  console.log('Production shows: 97 closed');
  console.log('Source sheet has:', totalValid, 'valid closed transactions');
  console.log('Roster matches:', matchedRoster);
  console.log('Missing due to roster mismatch:', noRosterMatch);
  console.log('\nIf roster matching is correct, production should show:', matchedRoster, 'closed');
  console.log('Difference from expected 130+:', 130 - matchedRoster, '+ transactions');
}

main().catch(console.error);
