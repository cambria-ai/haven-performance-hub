import { NextRequest, NextResponse } from 'next/server';
import { loadCurrentSnapshot, getSnapshotHistory } from '@/lib/snapshot';
import { getAuthFromRequest, getScopedSnapshotData } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  try {
    // Get auth context
    const auth = getAuthFromRequest(request);
    
    if (!auth) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Load current snapshot
    const snapshot = loadCurrentSnapshot();
    
    // Get role-scoped data
    const scopedData = getScopedSnapshotData(snapshot, auth);
    
    // Get snapshot history for admin
    const history = auth.role === 'admin' ? getSnapshotHistory() : [];
    
    return NextResponse.json({
      snapshot: scopedData.snapshot,
      leaderboard: scopedData.leaderboard,
      teamStats: scopedData.teamStats,
      isAdmin: scopedData.isAdmin,
      history,
      warnings: scopedData.error ? [scopedData.error] : [],
    });
  } catch (error) {
    console.error('Data load error:', error);
    return NextResponse.json({ 
      error: 'Failed to load data',
      snapshot: null,
      leaderboard: [],
      teamStats: null,
    });
  }
}
