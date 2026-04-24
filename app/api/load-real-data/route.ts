import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth-helpers';
import { saveCurrentSnapshot, archiveCurrentSnapshot } from '@/lib/snapshot';
import { loadFromGoogleSheets, LOCKED_SOURCES } from '@/lib/google-sheets-loader';

export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const auth = getAuthFromRequest(request);
    
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required for data loading' },
        { status: 403 }
      );
    }

    // Archive current snapshot before creating new one
    archiveCurrentSnapshot();
    
    // Load real data from Google Sheets
    const result = await loadFromGoogleSheets();
    
    // Save new snapshot
    saveCurrentSnapshot(result.snapshot);
    
    // Store time-window stats in a separate file for dashboard access
    const fs = await import('fs');
    const path = await import('path');
    const statsPath = path.join(process.cwd(), 'data', 'snapshots', 'time-window-stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(result.timeWindowStats, null, 2));
    
    return NextResponse.json({
      success: true,
      message: `Loaded real data from ${result.sourcesLoaded.length} Google Sheets`,
      sourcesLoaded: result.sourcesLoaded,
      lockedSourcesExcluded: LOCKED_SOURCES,
      snapshotId: result.snapshot.metadata.id,
      agentCount: result.snapshot.metadata.agentCount,
      transactionCount: result.snapshot.metadata.transactionCount,
      warnings: result.warnings,
      errors: result.errors,
      timeWindowStatsAvailable: Object.keys(result.timeWindowStats).length > 0,
    });
  } catch (error) {
    console.error('Load real data error:', error);
    return NextResponse.json({ 
      error: 'Failed to load real data from Google Sheets',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Return info about accessible sources without loading
    const { ACCESSIBLE_SOURCES, LOCKED_SOURCES } = await import('@/lib/google-sheets-loader');
    
    return NextResponse.json({
      accessibleSources: ACCESSIBLE_SOURCES,
      lockedSources: LOCKED_SOURCES,
      note: 'POST to this endpoint to load real data from accessible Google Sheets',
    });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to get source info',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
