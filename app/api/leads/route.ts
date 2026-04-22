import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getAuthFromRequest, validateAgentAccess } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const body = await request.json();
    const { agentId, ...leadData } = body;

    // Agents can only add leads for themselves
    if (auth.role !== 'admin' && agentId && agentId !== auth.agentId) {
      return NextResponse.json(
        { error: 'You can only add leads for yourself' },
        { status: 403 }
      );
    }
    
    // Use authenticated agent ID if not provided or if agent is adding for self
    const finalAgentId = agentId || auth.agentId;

    const leadsPath = path.join(process.cwd(), 'data', 'leads.json');
    let leadsData: Record<string, any[]> = {};
    
    try {
      if (fs.existsSync(leadsPath)) {
        leadsData = JSON.parse(fs.readFileSync(leadsPath, 'utf-8'));
      }
    } catch {
      leadsData = {};
    }

    leadsData[finalAgentId] = leadsData[finalAgentId] || [];
    leadsData[finalAgentId].push({
      ...leadData,
      createdAt: new Date().toISOString(),
      addedBy: auth.agentId,
    });

    fs.writeFileSync(leadsPath, JSON.stringify(leadsData, null, 2));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Add lead error:', error);
    return NextResponse.json({ error: 'Failed to add lead' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const leadsPath = path.join(process.cwd(), 'data', 'leads.json');
    let leadsData: Record<string, any[]> = {};
    
    try {
      if (fs.existsSync(leadsPath)) {
        leadsData = JSON.parse(fs.readFileSync(leadsPath, 'utf-8'));
      }
    } catch {
      leadsData = {};
    }
    
    // Admin sees all leads, agents see only their own
    if (auth.role === 'admin') {
      return NextResponse.json({ leads: leadsData });
    }
    
    return NextResponse.json({ 
      leads: {
        [auth.agentId]: leadsData[auth.agentId] || [],
      }
    });
  } catch (error) {
    console.error('Get leads error:', error);
    return NextResponse.json({ error: 'Failed to get leads' }, { status: 500 });
  }
}
