'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, DollarSign, Calendar, Home, Tag, TrendingUp } from 'lucide-react';

interface ClosedTransaction {
  transactionId: string;
  address: string;
  closedDate: string;
  contractDate?: string;
  purchasePrice: number;
  agentIncome: number;
  sourceIncomeField: string;
  incomeBreakdown: {
    agentIncome: number;
    personalSphere: number;
    havenIncome: number;
  };
  leadSource?: string;
  isSphere?: boolean;
  isZillow?: boolean;
  isRedfin?: boolean;
}

interface AgentData {
  id: string;
  name: string;
  closedTransactions: number;
  closedTransactionsDetail: ClosedTransaction[];
}

export default function AgentClosingsPage() {
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
        
        // Check authorization: agents can only view their own closings unless admin
        if (!isAdmin && data.agent?.id !== agentData.id) {
          setError('You can only view your own closed transactions');
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
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading closed transactions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <p className="text-lg font-medium text-red-400">{error}</p>
          <button
            onClick={() => router.push(`/agent/${agentId}`)}
            className="mt-4 text-indigo-400 hover:text-indigo-300"
          >
            ← Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const transactions = agentData?.closedTransactionsDetail || [];
  const totalVolume = transactions.reduce((sum, txn) => sum + (txn.purchasePrice || 0), 0);
  const totalAgentIncome = transactions.reduce((sum, txn) => sum + (txn.agentIncome || 0), 0);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_38%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => router.push(`/agent/${agentId}`)}
            className="group flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-sm font-medium text-slate-700 backdrop-blur transition hover:bg-white/80"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to dashboard
          </button>
          <div className="flex-1" />
          <div className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700">
            {agentData?.name || 'Agent'} - Closed Transactions
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-3">
                <Home className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Closed</p>
                <p className="text-2xl font-semibold text-slate-950">{transactions.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-cyan-100 p-3">
                <DollarSign className="h-5 w-5 text-cyan-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Volume</p>
                <p className="text-2xl font-semibold text-slate-950">{formatCurrency(totalVolume)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-indigo-100 p-3">
                <TrendingUp className="h-5 w-5 text-indigo-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agent Income</p>
                <p className="text-2xl font-semibold text-slate-950">{formatCurrency(totalAgentIncome)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-3">
                <Calendar className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Avg Close Price</p>
                <p className="text-2xl font-semibold text-slate-950">
                  {transactions.length > 0 ? formatCurrency(totalVolume / transactions.length) : '$0'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transaction List */}
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <h2 className="mb-6 text-xl font-semibold text-slate-950">Closed Transactions</h2>
          
          {transactions.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <Home className="mx-auto mb-3 h-12 w-12 text-slate-300" />
              <p className="text-lg font-medium">No closed transactions yet</p>
              <p className="mt-1 text-sm">Closed deals will appear here once imported</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transactions.map((txn, index) => (
                <div
                  key={txn.transactionId}
                  className="group rounded-2xl border border-slate-200/60 bg-white/60 p-5 transition hover:border-indigo-200 hover:bg-white/80 hover:shadow-lg"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
                          {index + 1}
                        </span>
                        <h3 className="text-lg font-semibold text-slate-950">{txn.address}</h3>
                      </div>

                      <div className="flex flex-wrap gap-4 pt-2 text-sm text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          <span>Closed: {formatDate(txn.closedDate)}</span>
                        </div>
                        {txn.contractDate && (
                          <div className="flex items-center gap-1.5">
                            <Tag className="h-4 w-4 text-slate-400" />
                            <span>Contract: {formatDate(txn.contractDate)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-3">
                        {txn.isSphere && (
                          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
                            Personal Sphere
                          </span>
                        )}
                        {txn.isZillow && (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                            Zillow
                          </span>
                        )}
                        {txn.isRedfin && (
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                            Redfin
                          </span>
                        )}
                        {txn.leadSource && !txn.isZillow && !txn.isRedfin && !txn.isSphere && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {txn.leadSource}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Purchase Price</p>
                        <p className="text-2xl font-bold text-slate-950">{formatCurrency(txn.purchasePrice)}</p>
                      </div>
                      {txn.agentIncome > 0 && (
                        <div className="text-right">
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Agent Income</p>
                          <p className="text-lg font-semibold text-emerald-600">{formatCurrency(txn.agentIncome)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
