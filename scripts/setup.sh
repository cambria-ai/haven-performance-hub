#!/bin/bash

echo "🏠 Haven Performance Hub - Initial Setup"
echo ""

# Start dev server in background
echo "Starting development server..."
npm run dev &
DEV_PID=$!

# Wait for server to be ready
sleep 5

echo ""
echo "📋 Setup Commands"
echo ""
echo "1. Add Team Leader account (run this first):"
echo "curl -X POST http://localhost:3000/api/auth/add-agent \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"agentId\":\"team-leader\",\"name\":\"Team Leader\",\"password\":\"YOUR_PASSWORD_HERE\",\"role\":\"admin\"}'"
echo ""
echo "2. Add agents (one per agent):"
echo "curl -X POST http://localhost:3000/api/auth/add-agent \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"agentId\":\"agent-name\",\"name\":\"Agent Name\",\"password\":\"AGENT_PASSWORD\"}'"
echo ""
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "Server running (PID: $DEV_PID). Press Ctrl+C to stop."
