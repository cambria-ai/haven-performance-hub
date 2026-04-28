'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface PendingTransaction {
  transactionId: string;
  address: string;
  contractDate?: string;
  expectedClosingDate?: string;
  purchasePrice?: number;
  expectedAgentIncome: number;
  epiqueIncome?: number;
  referralFee?: number;
  commissionPercent?: string | null;
  sourceIncomeField: string;
  incomeBreakdown: {
    agentIncome: number;
    personalSphere: number;
    havenIncome: number;
    epiqueIncome?: number;
    referralFee?: number;
  };
  leadSource?: string;
  isSphere?: boolean;
  isZillow?: boolean;
  boTax?: number;
  transactionFee?: number;
}

interface PendingBySource {
  source: string;
  count: number;
  volume: number;
  havenIncome: number;
  agentIncome: number;
  transactions: any[];
}

interface AgentData {
  id: string;
  name: string;
  pendingTransactions: number;
  pendingTransactionsDetail: PendingTransaction[];
  pendingTransactionsBySource?: PendingBySource[];
}

export default function AgentPendingsPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  
  const [agentData, setAgentData] = useState<AgentData | null>(null);
  const [isAdminView, setIsAdminView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const token = localStorage.getItem('haven_token');
        const agent = localStorage.getItem('haven_agent');
        
        if (!token || !agent) {
          router.push('/');
          return;
        }

        const agentData = JSON.parse(agent);
        const isAdmin = agentData.role === 'admin';
        setIsAdminView(isAdmin);

        const url = `/api/agent-data?agentId=${agentId}`;
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-agent-id': agentData.id,
          },
        });

        if (!res.ok) {
          if (res.status === 401) {
            router.push('/');
            return;
          }
          if (res.status === 404) {
            setError('Agent not found');
            setLoading(false);
            return;
          }
          throw new Error('Failed to load agent data');
        }

        const data = await res.json();
        
        // Check authorization: agents can only view their own pendings unless admin
        if (!isAdmin && data.agent?.id !== agentData.id) {
          setError('You can only view your own pending transactions');
          setLoading(false);
          return;
        }

        setAgentData(data.agent);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [agentId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading pending transactions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-lg font-semibold text-slate-900">{error}</p>
          <button
            onClick={() => router.push(`/agent/${agentId}`)}
            className="mt-4 text-sm text-slate-600 hover:text-slate-900 underline"
          >
            Back to agent dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!agentData || !agentData.pendingTransactionsDetail || agentData.pendingTransactionsDetail.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <button
            onClick={() => router.push(`/agent/${agentId}`)}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {agentData?.name || 'Agent'} dashboard
          </button>
          
          <div className="text-center py-20">
            <p className="text-xl font-semibold text-slate-900">No pending transactions</p>
            <p className="mt-2 text-slate-600">This agent has no pending deals at this time.</p>
          </div>
        </div>
      </div>
    );
  }

  const totalExpectedIncome = agentData.pendingTransactionsDetail.reduce(
    (sum, txn) => sum + (txn.expectedAgentIncome || 0),
    0
  );
  const totalPurchasePrice = agentData.pendingTransactionsDetail.reduce(
    (sum, txn) => sum + (txn.purchasePrice || 0),
    0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push(`/agent/${agentId}`)}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {agentData.name} dashboard
          </button>
          
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              {agentData.pendingTransactions} pending deal{agentData.pendingTransactions !== 1 ? 's' : ''}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">{agentData.name}</h1>
            <p className="mt-2 text-slate-600">All pending transactions and expected agent income breakdown</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-6 border border-emerald-200/60">
            <p className="text-sm font-medium text-emerald-900">Total expected agent income</p>
            <p className="mt-3 text-4xl font-bold text-emerald-700">
              {formatCurrency(totalExpectedIncome)}
            </p>
            <p className="mt-2 text-xs text-emerald-600">
              Across {agentData.pendingTransactions} pending transaction{agentData.pendingTransactions !== 1 ? 's' : ''}
            </p>
          </div>
          
          <div className="rounded-3xl bg-white p-6 border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-600">Total pending volume</p>
            <p className="mt-3 text-4xl font-bold text-slate-900">
              {formatCurrency(totalPurchasePrice)}
            </p>
            <p className="mt-2 text-xs text-slate-500">Combined purchase price of all pending deals</p>
          </div>
        </div>

        {/* Source Breakdown */}
        {agentData?.pendingTransactionsBySource && agentData.pendingTransactionsBySource.length > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-xl font-semibold text-slate-950">Pending Transactions by Source</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {agentData.pendingTransactionsBySource.map((sourceData) => (
                <div
                  key={sourceData.source}
                  className="group flex flex-col items-start gap-3 rounded-2xl border border-slate-200/60 bg-white/60 p-5 transition hover:border-indigo-200 hover:bg-white/80 hover:shadow-lg"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {sourceData.source}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {sourceData.count} transaction{sourceData.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="w-full space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Volume</span>
                      <span className="text-lg font-bold text-slate-950">{formatCurrency(sourceData.volume)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Haven Income</span>
                      <span className="text-base font-semibold text-emerald-600">{formatCurrency(sourceData.havenIncome)}</span>
                    </div>
                    {sourceData.agentIncome > 0 && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Agent Income</span>
                        <span className="text-base font-semibold text-indigo-600">{formatCurrency(sourceData.agentIncome)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction List */}
        <div className="space-y-4">
          {agentData.pendingTransactionsDetail.map((txn, idx) => (
            <div
              key={txn.transactionId || idx}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-bold text-slate-900">{txn.address}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                    {txn.contractDate && (
                      <span>Contract: {formatDate(txn.contractDate)}</span>
                    )}
                    {txn.expectedClosingDate && (
                      <span>• Expected closing: {formatDate(txn.expectedClosingDate)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-emerald-700">
                    {formatCurrency(txn.expectedAgentIncome || 0)}
                  </p>
                  <p className="text-xs text-slate-500">Expected agent income</p>
                </div>
              </div>

              {/* Income Breakdown */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
                <h4 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Income breakdown
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Agent Income (commission split)</span>
                    <span className="font-semibold text-slate-900">
                      {formatCurrency(txn.incomeBreakdown?.agentIncome || 0)}
                    </span>
                  </div>
                  
                  {txn.incomeBreakdown?.personalSphere && txn.incomeBreakdown.personalSphere > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Personal Sphere</span>
                      <span className="font-semibold text-emerald-700">
                        {formatCurrency(txn.incomeBreakdown.personalSphere)}
                      </span>
                    </div>
                  )}
                  
                  {isAdminView && txn.incomeBreakdown?.havenIncome && txn.incomeBreakdown.havenIncome > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Haven Income (GCI)</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(txn.incomeBreakdown.havenIncome)}
                      </span>
                    </div>
                  )}

                  {txn.incomeBreakdown?.epiqueIncome && txn.incomeBreakdown.epiqueIncome > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Epique Income</span>
                      <span className="font-semibold text-indigo-700">
                        {formatCurrency(txn.incomeBreakdown.epiqueIncome)}
                      </span>
                    </div>
                  )}

                  {isAdminView && txn.boTax !== undefined && txn.boTax > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">B&O State Tax</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(txn.boTax)}
                      </span>
                    </div>
                  )}

                  {isAdminView && txn.transactionFee !== undefined && txn.transactionFee > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">Transaction Fee</span>
                      <span className="font-semibold text-slate-900">
                        {formatCurrency(txn.transactionFee)}
                      </span>
                    </div>
                  )}

                  {/* Missing data warning */}
                  {txn.incomeBreakdown?.agentIncome === 0 &&
                   txn.incomeBreakdown?.personalSphere === 0 &&
                   (!isAdminView || txn.incomeBreakdown?.havenIncome === 0) && (
                    <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4">
                      <p className="text-sm font-medium text-amber-800">
                        Income data not available in source
                      </p>
                      <p className="mt-1 text-xs text-amber-700">
                        This transaction is tracked but income breakdown has not been entered in Master Haven PNDS yet.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Deal Info */}
              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 mb-1">Lead source</p>
                  <p className="font-medium text-slate-900">{txn.leadSource || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-slate-500 mb-1">Deal type</p>
                  <p className="font-medium text-slate-900">
                    {txn.isSphere ? 'Personal Sphere' : txn.isZillow ? 'Zillow' : 'Other'}
                  </p>
                </div>
                {txn.commissionPercent && (
                  <div>
                    <p className="text-slate-500 mb-1">Commission</p>
                    <p className="font-medium text-slate-900">{txn.commissionPercent}%</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}
