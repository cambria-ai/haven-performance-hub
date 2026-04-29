/**
 * Map the actual column indices from the Google Sheet data
 */

const https = require('https');

const SHEET_ID = '1qmwuePI7Q47gjcI5WmvQj1gjTLmmVpnl';
const TAB_GIDS = {
  'MASTER HAVEN PNDS': 0,
  'Master Closed 2026': 1,
};

function fetchTabCSV(tabName, gid) {
  return new Promise((resolve, reject) => {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSVRow(line) {
  const row = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }
  
  row.push(currentField.trim());
  return row;
}

async function mapColumns() {
  for (const [tabName, gid] of Object.entries(TAB_GIDS)) {
    console.log(`\n${'='.repeat(100)}`);
    console.log(`TAB: ${tabName}`);
    console.log('='.repeat(100));
    
    const csv = await fetchTabCSV(tabName, gid);
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    
    // Parse data row (row index 2, which is lines[2])
    const dataRow = parseCSVRow(lines[2]);
    
    console.log(`\nTotal columns in data row: ${dataRow.length}`);
    
    console.log('\n--- ALL COLUMNS (0-62) ---');
    for (let i = 0; i < dataRow.length; i++) {
      if (dataRow[i]) {
        console.log(`  [${String(i).padStart(2)}] = "${dataRow[i]}"`);
      }
    }
    
    console.log('\n--- KEY FIELD MAPPING ---');
    const keyFields = {
      'Agent': 7,
      'PRICE': 8,
      'ADDRESS': 12,
      'Personal Sphere': 14,
      'Client First Name': 15,
      'Client Last Name': 16,
      'Referral $': 18,
      'Haven B&O': 19,
      'Haven Income': 20,
      'Agent B&O': 21,
      'Agent Income': 22,
      'Epique Income': 23,
      'Lead Generated': 25,
      'Mutual Acceptance': 4,
      'CLOSING': 5,
      'Comm %': 3,
      'Purch/List': 1,
    };
    
    for (const [fieldName, colIdx] of Object.entries(keyFields)) {
      const value = dataRow[colIdx];
      console.log(`  ${fieldName.padEnd(20)} [${String(colIdx).padStart(2)}] = "${value || '(empty)'}"`);
    }
    
    // Show 3 sample transactions
    console.log('\n--- SAMPLE TRANSACTIONS (rows 2-4) ---');
    for (let rowIdx = 2; rowIdx <= 4 && rowIdx < lines.length; rowIdx++) {
      const row = parseCSVRow(lines[rowIdx]);
      const agent = row[7] || 'Unknown';
      const address = row[12] || 'Unknown';
      const price = row[8] || '0';
      const havenIncome = row[20] || '0';
      const agentIncome = row[22] || '0';
      const leadSource = row[25] || 'Unknown';
      
      console.log(`\n  Transaction ${rowIdx - 1}:`);
      console.log(`    Agent: ${agent}`);
      console.log(`    Address: ${address}`);
      console.log(`    Price: ${price}`);
      console.log(`    Haven Income: ${havenIncome}`);
      console.log(`    Agent Income: ${agentIncome}`);
      console.log(`    Lead Source: ${leadSource}`);
    }
  }
}

mapColumns().catch(console.error);
