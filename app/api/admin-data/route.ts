import { NextRequest, NextResponse } from 'next/server';
import { loadCurrentSnapshot, getSnapshotHistory } from '@/lib/snapshot';
import { getAuthFromRequest } from '@/lib/auth-helpers';

/**
 * Admin dashboard data endpoint.
 * Returns full team data, import health, and snapshot history.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    
    const snapshot = loadCurrentSnapshot();
    const history = getSnapshotHistory();
    
    // Calculate import health
    const importHealth: {
      lastImport: string | null;
      agentCount: number;
      transactionCount: number;
      sourceFiles: string[];
      warnings: string[];
    } = {
      lastImport: snapshot?.metadata.createdAt || null,
      agentCount: snapshot?.metadata.agentCount || 0,
      transactionCount: snapshot?.metadata.transactionCount || 0,
      sourceFiles: snapshot?.metadata.sourceFiles || [],
      warnings: [],
    };
    
    // Check for stale data (older than 7 days)
    if (snapshot?.metadata.createdAt) {
      const lastImport = new Date(snapshot.metadata.createdAt);
      const daysSinceImport = Math.floor((Date.now() - lastImport.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceImport > 7) {
        importHealth.warnings.push(`Data is ${daysSinceImport} days old. Consider running a weekly import.`);
      }
    } else {
      importHealth.warnings.push('No snapshot data available. Run your first import to populate dashboards.');
    }
    
    return NextResponse.json({
      snapshot,
      history,
      importHealth,
      teamStats: snapshot?.teamStats || null,
      leaderboard: snapshot?.leaderboard || [],
    });
  } catch (error) {
    console.error('Admin data error:', error);
    return NextResponse.json({ 
      error: 'Failed to load admin data',
      snapshot: null,
      history: [],
      importHealth: null,
    });
  }
}
