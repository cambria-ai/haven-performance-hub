/**
 * Load real data from Google Sheets and build production snapshot
 * Run: node scripts/load-real-snapshot.js
 */

const fs = require('fs');
const path = require('path');

// Copy the loader logic for standalone execution
const { fetch } = require('undici');
global.fetch = fetch;

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data', 'snapshots');
const CURRENT_SNAPSHOT = path.join(SNAPSHOTS_DIR, 'current.json');
const HISTORY_PATH = path.join(SNAPSHOTS_DIR, 'history.json');
const TIME_WINDOW_STATS = path.join(SNAPSHOTS_DIR, 'time-window-stats.json');

// Ensure snapshots directory exists
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
}

// Import loader functions (simplified inline version)
async function loadRealSnapshot() {
  console.log('Loading real data from Google Sheets...');
  
  // Use Next.js server to load data via the API
  const { spawn } = require('child_process');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', 'app/api/load-real-data/route.ts'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    
    let output = '';
    proc.stdout.on('data', (data) => { output += data.toString(); });
    proc.stderr.on('data', (data) => { output += data.toString(); });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Process exited with code ${code}: ${output}`));
      }
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout after 30 seconds'));
    }, 30000);
  });
}

// Simpler approach: just run the loader directly
async function main() {
  try {
    // We need to use the built Next.js server or call the loader directly
    // For now, let's use a curl-like approach to hit the API
    console.log('Note: Run this after starting the dev server, or use the /api/load-real-data endpoint directly');
    console.log('');
    console.log('To load real data:');
    console.log('1. Start the server: npm run dev');
    console.log('2. In another terminal, run:');
    console.log('   curl -X POST http://localhost:3000/api/load-real-data \\');
    console.log('     -H "Authorization: Bearer <admin-token>"');
    console.log('');
    console.log('Or deploy to Vercel and use the production endpoint.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
