/**
 * Analyze Master Closed 2026 sheet to find why count is 97 instead of 130+
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
  console.log('\n=== Master Closed 2026 - Full Analysis ===\n');
  const csv = await fetchTabCSV(TRANSACTIONS_SHEET, 'Master Closed 2026');
  const rows = parseCSV(csv);
  const now = new Date();
  
  let totalRows = rows.length;
  let withValidAgent = 0;
  let withValidPrice = 0;
  let withValidDate = 0;
  let dateInPast = 0;
  let finalCount = 0;
  
  const rejectReasons = {
    noAgent: 0,
    invalidAgent: 0,
    noPrice: 0,
    noDate: 0,
    futureDate: 0,
  };
  
  for (const row of rows) {
    const agentName = row['Name-2nd Agent'] || row['Agent'] || row['agent'];
    if (!agentName) { rejectReasons.noAgent++; continue; }
    if (!isValidAgentName(agentName)) { rejectReasons.invalidAgent++; continue; }
    withValidAgent++;
    
    // Check BOTH price fields
    const teamPrice = parseCurrency(row['Team Purchase Price']);
    const independentPrice = parseCurrency(row['Independent Purchase Price']);
    const price = teamPrice || independentPrice;
    
    if (!price) { rejectReasons.noPrice++; continue; }
    withValidPrice++;
    
    const closingDate = parseDate(row['Settlement Date'] || row['CLOSING'] || row['closing']);
    if (!closingDate) { rejectReasons.noDate++; continue; }
    withValidDate++;
    
    if (closingDate > now) { rejectReasons.futureDate++; continue; }
    dateInPast++;
    
    finalCount++;
  }
  
  console.log('Total rows in sheet:', totalRows);
  console.log('\nFilter breakdown:');
  console.log('  - Valid agent names:', withValidAgent);
  console.log('  - Valid prices (Team OR Independent):', withValidPrice);
  console.log('  - Valid closing dates:', withValidDate);
  console.log('  - Closing date in past:', dateInPast);
  console.log('  - FINAL COUNT (should be counted as closed):', finalCount);
  
  console.log('\nRejection reasons:');
  console.log('  - No agent field:', rejectReasons.noAgent);
  console.log('  - Invalid agent name:', rejectReasons.invalidAgent);
  console.log('  - No price (neither Team nor Independent):', rejectReasons.noPrice);
  console.log('  - No closing date:', rejectReasons.noDate);
  console.log('  - Future closing date:', rejectReasons.futureDate);
  
  // Check how many have Independent Price but no Team Price
  const independentOnly = rows.filter(r => {
    const agentName = r['Name-2nd Agent'] || r['Agent'];
    if (!agentName || !isValidAgentName(agentName)) return false;
    const teamPrice = parseCurrency(r['Team Purchase Price']);
    const independentPrice = parseCurrency(r['Independent Purchase Price']);
    return !teamPrice && independentPrice;
  });
  
  console.log('\n*** CRITICAL: Rows with Independent Price but NO Team Price:', independentOnly.length, '***');
  console.log('The current rebuild-snapshot.js script ONLY checks "Team Purchase Price"');
  console.log('It does NOT check "Independent Purchase Price" field!');
  
  if (independentOnly.length > 0) {
    console.log('\nSample Independent-only rows (these are being EXCLUDED):');
    independentOnly.slice(0, 10).forEach((r, i) => {
      const agent = r['Name-2nd Agent'] || r['Agent'];
      const price = r['Independent Purchase Price'];
      const date = r['Settlement Date'];
      const addr = r['Address'];
      console.log(`  ${i+1}. ${agent} - ${addr} - $${price} - Closed: ${date}`);
    });
  }
  
  console.log('\n=== Current Production Snapshot Stats ===');
  const snapshotPath = './data/snapshots/current.json';
  if (fs.existsSync(snapshotPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    console.log('Closed transactions:', snapshot.teamStats.totalClosedTransactions);
    console.log('Pending transactions:', snapshot.teamStats.totalPendingTransactions);
    console.log('Expected closed (Cambria): 130+');
    console.log('Missing closed:', Math.max(0, 130 - snapshot.teamStats.totalClosedTransactions), '+');
  }
}

main().catch(console.error);
