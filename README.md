# Haven Performance Hub

Performance analytics dashboard for Haven Real Estate Group at Epique Realty.

## Features

- **Team Leader Dashboard**: Upload Excel reports, view full team performance, rankings, and financials
- **Agent Dashboard**: Password-protected individual views showing only their own data
- **Lead Tracking**: Agents can add sphere and floor time leads (read-only for uploaded data)
- **Excel Parsing**: Handles multiple sheets (opportunities, activities, GCI, Zillow stats, financials)
- **Zillow Benchmarks**: Built-in conversion rate targets and performance comparisons

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Add team leader account (run once):
```bash
curl -X POST http://localhost:3000/api/auth/add-agent \
  -H "Content-Type: application/json" \
  -d '{"agentId":"team-leader","name":"Team Leader","password":"your-password","role":"admin"}'
```

3. Add agents:
```bash
curl -X POST http://localhost:3000/api/auth/add-agent \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent-name","name":"Agent Name","password":"agent-password"}'
```

4. Run development server:
```bash
npm run dev
```

5. Open http://localhost:3000

## Deploy to Vercel

1. Push to GitHub
2. Import project in Vercel
3. Deploy

## Data Files

- `data/agents.json` - Agent accounts (passwords are hashed)
- `data/performance-data.json` - Parsed Excel data and lead tracking

## Excel Sheet Format

The parser expects sheets with headers in the first row. Supported categories:
- Opportunities / Pipeline
- Activities (calls, showings, emails)
- Closed/Pending transactions
- GCI / Revenue
- Zillow stats (leads, conversion, cost)
- Financial breakdown (cap, fees, B&O, L&I, transaction fees)
