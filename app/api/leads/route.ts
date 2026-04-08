import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, ...leadData } = body;

    if (!agentId) {
      return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    }

    const dataPath = path.join(process.cwd(), 'data', 'performance-data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    data.leadTracking = data.leadTracking || {};
    data.leadTracking[agentId] = data.leadTracking[agentId] || [];
    data.leadTracking[agentId].push(leadData);

    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Add lead error:', error);
    return NextResponse.json({ error: 'Failed to add lead' }, { status: 500 });
  }
}
