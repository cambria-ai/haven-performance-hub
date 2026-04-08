import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'performance-data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    return NextResponse.json(data);
  } catch (error) {
    console.error('Data load error:', error);
    return NextResponse.json({ agents: {}, uploads: [], leadTracking: {} });
  }
}
