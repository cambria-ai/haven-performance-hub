import { NextRequest, NextResponse } from 'next/server';
import { loadCurrentSnapshot, getSnapshotHistory } from '@/lib/snapshot';
import { getAuthFromRequest } from '@/lib/auth-helpers';
import * as fs from 'fs';
import * as path from 'path';

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

    // Load time-window stats if available
    let timeWindowStats: Record<string, any> | null = null;
    try {
      const statsPath = path.join(process.cwd(), 'data', 'snapshots', 'time-window-stats.json');
      if (fs.existsSync(statsPath)) {
        timeWindowStats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      }
    } catch {
      // Time-window stats not available yet
    }

    // Aggregate all pending transactions with full details
    const allPendingTransactions: any[] = [];
    let totalHavenReceivables = 0;
    let totalAgentReceivables = 0;
    let totalPurchasePrice = 0;

    if (snapshot?.agents) {
      for (const agent of Object.values(snapshot.agents)) {
        if (agent.pendingTransactionsDetail && agent.pendingTransactionsDetail.length > 0) {
          for (const txn of agent.pendingTransactionsDetail) {
            allPendingTransactions.push({
              transactionId: txn.transactionId,
              agentId: agent.id,
              agentName: agent.name,
              address: txn.address,
              contractDate: txn.contractDate,
              expectedClosingDate: txn.expectedClosingDate,
              purchasePrice: txn.purchasePrice || 0,
              expectedAgentIncome: txn.expectedAgentIncome || 0,
              havenIncome: txn.incomeBreakdown?.havenIncome || 0,
              commissionPercent: txn.commissionPercent || null,
              boTax: txn.boTax || 0,
              transactionFee: txn.transactionFee || 0,
              leadSource: txn.leadSource || 'Unknown',
              isSphere: txn.isSphere || false,
              isZillow: txn.isZillow || false,
              incomeBreakdown: txn.incomeBreakdown,
            });

            totalHavenReceivables += txn.incomeBreakdown?.havenIncome || 0;
            totalAgentReceivables += txn.expectedAgentIncome || 0;
            totalPurchasePrice += txn.purchasePrice || 0;
          }
        }
      }
    }

    // Group pending transactions by lead source for dashboard
    const pendingBySource: Record<string, {
      count: number;
      volume: number;
      havenIncome: number;
      agentIncome: number;
      transactions: any[];
    }> = {};

    if (snapshot?.agents) {
      for (const agent of Object.values(snapshot.agents)) {
        if (agent.pendingTransactionsDetail && agent.pendingTransactionsDetail.length > 0) {
          for (const txn of agent.pendingTransactionsDetail) {
            const source = txn.leadSource || 'Unknown';
            if (!pendingBySource[source]) {
              pendingBySource[source] = {
                count: 0,
                volume: 0,
                havenIncome: 0,
                agentIncome: 0,
                transactions: [],
              };
            }
            pendingBySource[source].count++;
            pendingBySource[source].volume += txn.purchasePrice || 0;
            pendingBySource[source].havenIncome += txn.incomeBreakdown?.havenIncome || 0;
            pendingBySource[source].agentIncome += txn.expectedAgentIncome || 0;
            pendingBySource[source].transactions.push({
              transactionId: txn.transactionId,
              agentId: agent.id,
              agentName: agent.name,
              address: txn.address,
              contractDate: txn.contractDate,
              expectedClosingDate: txn.expectedClosingDate,
              purchasePrice: txn.purchasePrice || 0,
              havenIncome: txn.incomeBreakdown?.havenIncome || 0,
              expectedAgentIncome: txn.expectedAgentIncome || 0,
              commissionPercent: txn.commissionPercent || null,
              leadSource: source,
            });

            totalHavenReceivables += txn.incomeBreakdown?.havenIncome || 0;
            totalAgentReceivables += txn.expectedAgentIncome || 0;
            totalPurchasePrice += txn.purchasePrice || 0;
          }
        }
      }
    }

    // Convert pendingBySource to sorted array for dashboard
    const pendingTransactionsBySource = Object.entries(pendingBySource)
      .map(([source, stats]) => ({
        source,
        count: stats.count,
        volume: stats.volume,
        havenIncome: stats.havenIncome,
        agentIncome: stats.agentIncome,
        transactions: stats.transactions,
      }))
      .sort((a, b) => b.volume - a.volume);

    // Aggregate all closed transactions with full details
    const allClosedTransactions: any[] = [];
    let totalClosedVolume = 0;
    let totalClosedCount = 0;
    let totalClosedHavenIncome = 0;

    // Group closed transactions by lead source for dashboard
    const closedBySource: Record<string, {
      count: number;
      volume: number;
      gci: number;
      agentIncome: number;
      havenIncome: number;
      transactions: any[];
    }> = {};

    if (snapshot?.agents) {
      for (const agent of Object.values(snapshot.agents)) {
        if (agent.closedTransactionsDetail && agent.closedTransactionsDetail.length > 0) {
          for (const txn of agent.closedTransactionsDetail) {
            allClosedTransactions.push({
              transactionId: txn.transactionId,
              agentId: agent.id,
              agentName: agent.name,
              address: txn.address,
              closedDate: txn.closedDate,
              contractDate: txn.contractDate,
              purchasePrice: txn.purchasePrice || 0,
              agentIncome: txn.agentIncome || 0,
              havenIncome: txn.incomeBreakdown?.havenIncome || 0,
              boTax: txn.boTax || 0,
              transactionFee: txn.transactionFee || 0,
              commissionPercent: txn.commissionPercent || null,
              leadSource: txn.leadSource || 'Unknown',
              isSphere: txn.isSphere || false,
              isZillow: txn.isZillow || false,
              isRedfin: txn.isRedfin || false,
              incomeBreakdown: txn.incomeBreakdown,
            });

            // Aggregate by source
            const source = txn.leadSource || 'Unknown';
            if (!closedBySource[source]) {
              closedBySource[source] = {
                count: 0,
                volume: 0,
                gci: 0,
                agentIncome: 0,
                havenIncome: 0,
                transactions: [],
              };
            }
            closedBySource[source].count++;
            closedBySource[source].volume += txn.purchasePrice || 0;
            closedBySource[source].gci += txn.incomeBreakdown?.havenIncome || 0;
            closedBySource[source].agentIncome += txn.incomeBreakdown?.agentIncome || 0;
            closedBySource[source].havenIncome += txn.incomeBreakdown?.havenIncome || 0;
            closedBySource[source].transactions.push({
              transactionId: txn.transactionId,
              agentId: agent.id,
              agentName: agent.name,
              address: txn.address,
              closedDate: txn.closedDate,
              purchasePrice: txn.purchasePrice || 0,
              havenIncome: txn.incomeBreakdown?.havenIncome || 0,
              agentIncome: txn.incomeBreakdown?.agentIncome || 0,
              leadSource: source,
            });

            totalClosedVolume += txn.purchasePrice || 0;
            totalClosedCount += 1;
            totalClosedHavenIncome += txn.incomeBreakdown?.havenIncome || 0;
          }
        }
      }
    }

    // Convert closedBySource to sorted array for dashboard
    const closedTransactionsBySource = Object.entries(closedBySource)
      .map(([source, stats]) => ({
        source,
        count: stats.count,
        volume: stats.volume,
        gci: stats.gci,
        agentIncome: stats.agentIncome,
        havenIncome: stats.havenIncome,
        transactions: stats.transactions,
      }))
      .sort((a, b) => b.volume - a.volume);

    return NextResponse.json({
      snapshot,
      history,
      importHealth,
      teamStats: snapshot?.teamStats || null,
      leaderboard: snapshot?.leaderboard || [],
      timeWindowStats,
      allPendingTransactions,
      allClosedTransactions,
      pendingTransactionsBySource,
      closedTransactionsBySource,
      closedStats: {
        totalClosedVolume,
        totalClosedCount,
        totalClosedHavenIncome,
      },
      pendingStats: {
        totalHavenReceivables,
        totalAgentReceivables,
        totalPurchasePrice,
      },
      transactionCount: allPendingTransactions.length,
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
