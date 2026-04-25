/**
 * Regenerate snapshot from Google Sheets using the fixed loader
 * Run: node scripts/regenerate-snapshot.js
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const CURRENT_SNAPSHOT = path.join(SNAPSHOTS_DIR, 'current.json');
const HISTORY_PATH = path.join(SNAPSHOTS_DIR, 'history.json');
const TIME_WINDOW_STATS = path.join(SNAPSHOTS_DIR, 'time-window-stats.json');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Import the loader directly
const loaderPath = path.join(__dirname, '..', 'lib', 'google-sheets-loader.ts');

async function main() {
  console.log('Regenerating snapshot from Google Sheets...');
  console.log('');
  
  // Use dynamic import for the TypeScript loader
  const { loadFromGoogleSheets } = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(`
    import { loadFromGoogleSheets } from 'file://${loaderPath.replace('.ts', '.js')}';
    export { loadFromGoogleSheets };
  `));
  
  // Actually, we need to compile TS first or use tsx
  // Let's use a simpler approach - call the API endpoint
  
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    console.log('Calling Next.js API to load data...');
    
    // Start a minimal dev server or use tsx to run the loader
    const proc = spawn('npx', ['tsx', '--tsconfig', 'tsconfig.json', '-e', `
      import { loadFromGoogleSheets } from './lib/google-sheets-loader';
      
      async function run() {
        const result = await loadFromGoogleSheets();
        console.log(JSON.stringify(result));
      }
      
      run().catch(err => {
        console.error(JSON.stringify({ error: err.message }));
        process.exit(1);
      });
    `], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    let output = '';
    let errorOutput = '';
    
    proc.stdout.on('data', (data) => { 
      output += data.toString(); 
    });
    proc.stderr.on('data', (data) => { 
      errorOutput += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output.trim());
          resolve(result);
        } catch (e) {
          console.log('Output:', output.substring(0, 500));
          reject(new Error(`Failed to parse output: ${e.message}`));
        }
      } else {
        reject(new Error(`Process exited with code ${code}: ${errorOutput || output}`));
      }
    });
    
    // Timeout after 60 seconds
    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout after 60 seconds'));
    }, 60000);
  });
}

// Alternative: directly copy the loader logic here for standalone execution
async function loadSnapshotStandalone() {
  console.log('Loading data directly from Google Sheets...');
  
  // We need to use fetch - make it available globally
  const { fetch } = require('undici');
  global.fetch = fetch;
  
  // Import the loader functions by reading and evaluating the file
  const loaderCode = fs.readFileSync(loaderPath, 'utf-8');
  
  // This is complex - let's use a simpler approach: call the API via curl after starting dev server
  // Or just run the loader using ts-node/tsx
  
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  try {
    // Run the loader using tsx
    const { stdout, stderr } = await execPromise(`
      cd /Users/cambriahenry/.openclaw/workspace-haveninsights/haven-dashboard &&
      npx tsx -e "
        const { loadFromGoogleSheets } = require('./lib/google-sheets-loader.ts');
        loadFromGoogleSheets().then(r => console.log(JSON.stringify(r))).catch(e => console.error(JSON.stringify({error: e.message})));
      "
    `, { maxBuffer: 50 * 1024 * 1024 });
    
    if (stderr && !stderr.includes('npm warn')) {
      console.error('Warnings:', stderr);
    }
    
    const result = JSON.parse(stdout.trim());
    return result;
  } catch (err) {
    throw new Error(`Failed to run loader: ${err.message}`);
  }
}

async function mainStandalone() {
  try {
    const result = await loadSnapshotStandalone();
    
    if (result.error) {
      console.error('Loader error:', result.error);
      process.exit(1);
    }
    
    const { snapshot, timeWindowStats, warnings, errors, sourcesLoaded } = result;
    
    console.log('');
    console.log('=== Snapshot Generation Results ===');
    console.log(`Agents: ${snapshot.metadata.agentCount}`);
    console.log(`Transactions: ${snapshot.metadata.transactionCount}`);
    console.log(`Sources: ${sourcesLoaded.join(', ')}`);
    console.log(`Week: ${new Date(snapshot.metadata.weekStart).toLocaleDateString()} - ${new Date(snapshot.metadata.weekEnd).toLocaleDateString()}`);
    console.log('');
    
    if (warnings.length > 0) {
      console.log('Warnings:');
      warnings.forEach(w => console.log(`  - ${w}`));
      console.log('');
    }
    
    if (errors.length > 0) {
      console.log('Errors:');
      errors.forEach(e => console.log(`  - ${e}`));
      console.log('');
    }
    
    // Save current snapshot
    fs.writeFileSync(CURRENT_SNAPSHOT, JSON.stringify(snapshot, null, 2));
    console.log(`✅ Saved: ${CURRENT_SNAPSHOT}`);
    
    // Save time window stats if available
    if (timeWindowStats && Object.keys(timeWindowStats).length > 0) {
      fs.writeFileSync(TIME_WINDOW_STATS, JSON.stringify(timeWindowStats, null, 2));
      console.log(`✅ Saved: ${TIME_WINDOW_STATS}`);
    }
    
    // Update history
    let history = [];
    try {
      if (fs.existsSync(HISTORY_PATH)) {
        history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
      }
    } catch {}
    
    history.unshift(snapshot.metadata);
    history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    history = history.slice(0, 50);
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    console.log(`✅ Updated history with ${history.length} entries`);
    
    console.log('');
    console.log('=== Top 10 Leaderboard ===');
    snapshot.leaderboard.slice(0, 10).forEach(entry => {
      console.log(`  ${entry.rank}. ${entry.agentName}: ${entry.closedTransactions} closed, ${entry.pendingTransactions} pending, $${entry.closedVolume.toLocaleString()}`);
    });
    
    console.log('');
    console.log('=== Team Stats ===');
    console.log(`  Total Agents: ${snapshot.teamStats.totalAgents}`);
    console.log(`  Closed Transactions: ${snapshot.teamStats.totalClosedTransactions}`);
    console.log(`  Closed Volume: $${snapshot.teamStats.totalClosedVolume.toLocaleString()}`);
    console.log(`  Pending Transactions: ${snapshot.teamStats.totalPendingTransactions}`);
    console.log(`  Pending Volume: $${snapshot.teamStats.totalPendingVolume.toLocaleString()}`);
    console.log(`  Active Listings: ${snapshot.teamStats.totalActiveListings}`);
    console.log(`  CMAs Completed: ${snapshot.teamStats.totalCmasCompleted}`);
    console.log(`  Total GCI: $${(snapshot.teamStats as any).totalGCI?.toLocaleString() || 0}`);
    console.log(`  Total Cap Contributions: $${snapshot.teamStats.totalCapContributions.toLocaleString()}`);
    
    console.log('');
    console.log('✅ Snapshot regenerated successfully!');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

mainStandalone();
