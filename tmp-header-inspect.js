/**
 * Inspect the actual header structure of the Google Sheet tabs
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

async function inspectHeaders() {
  for (const [tabName, gid] of Object.entries(TAB_GIDS)) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TAB: ${tabName} (gid=${gid})`);
    console.log('='.repeat(80));
    
    const csv = await fetchTabCSV(tabName, gid);
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    
    console.log(`\nTotal rows: ${lines.length}`);
    
    // Parse first 3 rows
    const row0 = parseCSVRow(lines[0]);
    const row1 = parseCSVRow(lines[1]);
    const row2 = parseCSVRow(lines[2]);
    
    console.log(`\nRow 0 columns: ${row0.length}`);
    console.log(`Row 1 columns: ${row1.length}`);
    console.log(`Row 2 columns: ${row2.length}`);
    
    console.log('\n--- HEADER STRUCTURE (first 30 columns) ---');
    console.log('Col# | Row 0 (header part 1) | Row 1 (header part 2) | COMBINED');
    console.log('-'.repeat(100));
    
    const maxCols = Math.max(row0.length, row1.length);
    for (let i = 0; i < Math.min(maxCols, 30); i++) {
      const col0 = row0[i] || '';
      const col1 = row1[i] || '';
      const combined = col0 && col1 ? `${col0} ${col1}` : (col0 || col1);
      console.log(`${String(i).padStart(4)} | ${String(col0).padEnd(21)} | ${String(col1).padEnd(21)} | ${combined}`);
    }
    
    console.log('\n--- SAMPLE DATA ROW (row 2) ---');
    for (let i = 0; i < Math.min(row2.length, 30); i++) {
      const col0 = row0[i] || '';
      const col1 = row1[i] || '';
      const combined = col0 && col1 ? `${col0} ${col1}` : (col0 || col1);
      if (row2[i]) {
        console.log(`  ${String(i).padStart(2)} [${combined || 'unnamed'}]: ${row2[i]}`);
      }
    }
    
    // Find key columns
    console.log('\n--- KEY COLUMNS SEARCH ---');
    const keyTerms = ['Agent', 'PRICE', 'ADDRESS', 'Haven Income', 'Agent Income', 'Epique Income', 'B&O', 'Lead Generated', 'Personal Sphere', 'Zillow', 'Redfin', 'Mutual Acceptance', 'CLOSING'];
    
    for (const term of keyTerms) {
      const matches = [];
      for (let i = 0; i < maxCols; i++) {
        const col0 = (row0[i] || '').toLowerCase();
        const col1 = (row1[i] || '').toLowerCase();
        const combined = `${col0} ${col1}`;
        if (combined.includes(term.toLowerCase())) {
          matches.push({ col: i, name: `${row0[i] || ''} ${row1[i] || ''}`.trim() });
        }
      }
      if (matches.length > 0) {
        console.log(`  "${term}": columns ${matches.map(m => `${m.col} (${m.name})`).join(', ')}`);
      } else {
        console.log(`  "${term}": NOT FOUND`);
      }
    }
  }
}

inspectHeaders().catch(console.error);
