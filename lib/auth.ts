import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'haven-insights-secret-key-change-in-production';

export interface Agent {
  id: string;
  name: string;
  role: 'admin' | 'agent';
  passwordHash: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(agentId: string, role: string): string {
  return jwt.sign({ agentId, role }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { agentId: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { agentId: string; role: string };
  } catch {
    return null;
  }
}

export function getAgents(): Agent[] {
  try {
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(process.cwd(), 'data', 'agents.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    return data.agents || [];
  } catch {
    return [];
  }
}

export function findAgent(agentId: string): Agent | undefined {
  return getAgents().find(a => a.id === agentId);
}
