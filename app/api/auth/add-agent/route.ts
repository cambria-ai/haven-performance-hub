import { NextRequest, NextResponse } from 'next/server';
import { hashPassword, getAgents } from '@/lib/auth';
import * as fs from 'fs';
import * as path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, name, password, role = 'agent' } = body;

    if (!agentId || !name || !password) {
      return NextResponse.json({ error: 'Agent ID, name, and password required' }, { status: 400 });
    }

    const agents = getAgents();
    if (agents.find(a => a.id === agentId)) {
      return NextResponse.json({ error: 'Agent already exists' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    
    const newAgent = { id: agentId, name, role, passwordHash };
    agents.push(newAgent);

    const dataPath = path.join(process.cwd(), 'data', 'agents.json');
    fs.writeFileSync(dataPath, JSON.stringify({ agents, note: 'Add agent passwords using the /api/auth/add-agent endpoint or edit this file. Passwords are hashed with bcrypt.' }, null, 2));

    return NextResponse.json({ success: true, agent: { id: agentId, name, role } });
  } catch (error) {
    console.error('Add agent error:', error);
    return NextResponse.json({ error: 'Failed to add agent' }, { status: 500 });
  }
}
