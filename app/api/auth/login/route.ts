import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, generateToken, findAgent } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, password } = body;

    if (!agentId || !password) {
      return NextResponse.json({ error: 'Agent ID and password required' }, { status: 400 });
    }

    const agent = findAgent(agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, agent.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = generateToken(agent.id, agent.role);
    
    return NextResponse.json({
      success: true,
      token,
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
