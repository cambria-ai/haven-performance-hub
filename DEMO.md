# Haven Performance Hub v1 - Demo Preview

## Quick Start

The app is pre-loaded with demo data. Just start the dev server and log in.

```bash
cd /Users/cambriahenry/.openclaw/workspace-haveninsights/haven-dashboard
npm run dev
```

Open http://localhost:3000

## Demo Credentials

### Admin Account
| Agent ID | Password | Role |
|----------|----------|------|
| `cambria` | `demo123` | Admin (full team visibility) |

### Agent Accounts
| Agent ID | Password | Role |
|----------|----------|------|
| `maegen` | `demo123` | Agent (own data + anonymous leaderboard) |
| `sarah` | `demo123` | Agent |
| `jessica` | `demo123` | Agent |
| `michael` | `demo123` | Agent |
| `ashley` | `demo123` | Agent |
| `david` | `demo123` | Agent |
| `emily` | `demo123` | Agent |

**Note:** All demo passwords are hashed with bcrypt. In production, each agent should have a unique secure password.

## What You'll See

### Admin Dashboard (cambria login)
- Team overview: 8 agents, 66 closed transactions, $35.9M volume
- Import health panel with warnings if data is stale
- Snapshot timeline showing import history
- Full named leaderboard
- Upload center for weekly imports

### Agent Dashboard (any agent login)
- Personal rank card with movement indicator
- Anonymous leaderboard (own name highlighted, others show as "Position 1", "Position 2", etc.)
- Distance to next rank
- Personal metrics: closed transactions, volume, conversion rate
- Activity metrics: calls, showings, emails, CMAs, listings
- Zillow health panel with benchmark progress
- Financial breakdown: cap progress, fees, taxes

## Demo Data Sources

The demo snapshot includes realistic data representing these accessible source workbooks:

✅ **Represented in Demo:**
- Haven Master Payout & Cap Dashboard
- Haven Transactions 2026
- Team Commission Level Tracking Template
- Weekly Zillow Stats
- Zillow Transactions Tracking

⏳ **Pending/Locked Sources:**
- Contracts Written (Haven 2026 Offer Activity Reports - access not yet confirmed)

## Data Model

### Snapshot Storage
- Location: `data/snapshots/`
- Current snapshot: `data/snapshots/current.json`
- History: `data/snapshots/history.json`
- Archives: `data/snapshots/snapshot-*.json`

### Weekly Import Flow
1. Admin uploads Excel file via dashboard
2. System normalizes data to snapshot format
3. Current snapshot archived
4. New snapshot saved
5. All dashboards update automatically

### Privacy Enforcement
- **Server-side scoping:** API endpoints verify auth token and return role-appropriate data
- **Agents:** Receive only their own detailed data + anonymized leaderboard
- **Admins:** Receive full team data with all names
- **No client-side filtering:** Private data never leaves the server

## Testing Scenarios

### Test 1: Admin View
1. Log in as `cambria` / `demo123`
2. Verify you see all 8 agents with names
3. Check import health panel
4. Try uploading a new Excel file

### Test 2: Agent View
1. Log in as `maegen` / `demo123`
2. Verify you see your own name highlighted in leaderboard
3. Verify all other positions show as "Position 1", "Position 2", etc.
4. Check your rank, distance to next, and personal metrics
5. Verify you cannot see other agents' private data

### Test 3: Privacy Boundary
1. Open browser dev tools
2. Log in as an agent
3. Check network tab for `/api/agent-data` response
4. Verify `agents` object contains ONLY your own data
5. Verify leaderboard has `isOwn: true` only for your entry

## Next Steps for Production

1. **Replace demo snapshot** with real weekly import
2. **Set unique passwords** for each agent
3. **Configure JWT_SECRET** environment variable
4. **Add real source workbooks** to upload flow
5. **Test with actual Haven data** from accessible sources

## Known Limitations (v1)

- Weekly manual import (not live sync)
- Contracts Written metric pending source access
- No email notifications
- No mobile app (web only)

These are acceptable for v1 and can be added in future iterations.
