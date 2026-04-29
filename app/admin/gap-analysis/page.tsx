'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  Target,
  Home,
  CheckCircle2,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import {
  calculateGapMetrics,
  formatPercentage,
  getGapDataStatus,
  hasGapMetrics,
  calculateTeamGapAverages,
} from '@/lib/gap-metrics';

interface AgentData {
  agent: {
    id: string;
    name: string;
    closedTransactions: number;
    cmasCompleted: number;
    activeListings: number;
    leadSourcesByCategory?: {
      zillow: number;
      sphere: number;
      companyGenerated: number;
      other: number;
    };
  };
  leaderboard: any[];
  teamStats: any;
  isAdmin: boolean;
  snapshotDate: string;
  timeWindowStats?: any;
}

interface TeamAgent {
  agentId: string;
  agentName: string;
  closedTransactions: number;
  cmasCompleted?: number;
  activeListings?: number;
  leadSourcesByCategory?: {
    zillow: number;
    sphere: number;
    companyGenerated: number;
    other: number;
  };
}

export default function AdminGapAnalysisPage() {
  const router = useRouter();
  const [data, setData] = useState<AgentData | null>(null);
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
        if (agentData.role !== 'admin') {
          router.push('/');
          return;
        }

        const res = await fetch('/api/admin-data', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            router.push('/');
            return;
          }
          throw new Error('Failed to load admin data');
        }

        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading gap analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h2 className="mt-4 text-xl font-semibold">Error loading gap analysis</h2>
          <p className="mt-2 text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  // Build team agent list from leaderboard
  const teamAgents: TeamAgent[] = (data?.leaderboard || []).map(entry => ({
    agentId: entry.agentId,
    agentName: entry.agentName,
    closedTransactions: entry.closedTransactions,
  }));

  // Calculate team averages (Phase 0 - mostly placeholder until activity tracking enabled)
  const teamAverages = calculateTeamGapAverages(
    teamAgents.map(agent => ({
      agentId: agent.agentId,
      agentName: agent.agentName,
      ...calculateGapMetrics({
        closedTransactions: agent.closedTransactions,
        totalLeads: agent.leadSourcesByCategory
          ? agent.leadSourcesByCategory.zillow +
            agent.leadSourcesByCategory.sphere +
            agent.leadSourcesByCategory.companyGenerated +
            agent.leadSourcesByCategory.other
          : undefined,
        sphereDeals: agent.leadSourcesByCategory?.sphere,
      }),
    }))
  );

  const status = getGapDataStatus({
    leadsToClosed: teamAverages.avgLeadsToClosed,
    sphereWork: teamAgents.reduce((sum, a) => sum + (a.leadSourcesByCategory?.sphere || 0), 0),
  });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef6ff_35%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 text-white shadow-[0_35px_90px_-40px_rgba(15,23,42,0.72)]">
          <div className="relative px-6 py-7 sm:px-8 sm:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.42),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.28),_transparent_30%)]" />
            <div className="relative">
              <button
                onClick={() => router.push('/admin')}
                className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </button>
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-white backdrop-blur">
                  <BarChart3 className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
                    Team Performance Intelligence
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                    Gap Analysis
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
                    {status.message}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Team Overview */}
        <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Team Overview
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Team-wide conversion benchmarks
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
            <MetricCard
              label="Leads to Closed"
              value={formatPercentage(teamAverages.avgLeadsToClosed)}
              icon={<Target className="h-5 w-5" />}
              accent="indigo"
              tooltip="Percentage of leads that convert to closed transactions"
            />
            <MetricCard
              label="Sphere Deals"
              value={teamAgents.reduce((sum, a) => sum + (a.leadSourcesByCategory?.sphere || 0), 0).toString()}
              icon={<Users className="h-5 w-5" />}
              accent="emerald"
              tooltip="Total sphere/personal deals across the team"
            />
            <MetricCard
              label="Agents Tracked"
              value={teamAverages.agentsWithData.toString()}
              subValue={`of ${teamAverages.totalAgents} active`}
              icon={<BarChart3 className="h-5 w-5" />}
              accent="amber"
              tooltip="Agents with at least one gap metric available"
            />
            <MetricCard
              label="Data Status"
              value={status.status === 'available' ? 'Complete' : status.status === 'partial' ? 'Partial' : 'Not Tracked'}
              icon={status.status === 'available' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              accent={status.status === 'available' ? 'emerald' : status.status === 'partial' ? 'amber' : 'indigo'}
              tooltip="Overall gap analysis data availability"
            />
          </div>
        </section>

        {/* Agent Comparison Table */}
        <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Performance Comparison
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">
              Per-agent gap metrics
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Click on an agent to view their personal gap analysis dashboard
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-600">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                    Closed
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                    Sphere
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                    Zillow
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                    Company
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                    Other
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-600">
                    Leads→Closed
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamAgents.map((agent) => {
                  const totalLeads = agent.leadSourcesByCategory
                    ? agent.leadSourcesByCategory.zillow +
                      agent.leadSourcesByCategory.sphere +
                      agent.leadSourcesByCategory.companyGenerated +
                      agent.leadSourcesByCategory.other
                    : 0;
                  const leadsToClosed = totalLeads > 0
                    ? agent.closedTransactions / totalLeads
                    : null;

                  return (
                    <tr
                      key={agent.agentId}
                      className="border-b border-slate-100 transition hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-4">
                        <button
                          onClick={() => router.push(`/agent/${agent.agentId}`)}
                          className="text-left font-semibold text-indigo-600 transition hover:text-indigo-700"
                        >
                          {agent.agentName}
                        </button>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-slate-900">
                        {agent.closedTransactions}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-700">
                        {agent.leadSourcesByCategory?.sphere || 0}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-700">
                        {agent.leadSourcesByCategory?.zillow || 0}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-700">
                        {agent.leadSourcesByCategory?.companyGenerated || 0}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-700">
                        {agent.leadSourcesByCategory?.other || 0}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {leadsToClosed != null ? (
                          <span className="font-semibold text-emerald-700">
                            {formatPercentage(leadsToClosed)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Phase 0 Notice */}
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <div className="flex items-start gap-4">
            <AlertCircle className="mt-1 h-6 w-6 text-amber-600" />
            <div>
              <h3 className="text-lg font-semibold text-amber-900">
                Phase 0 - Limited Activity Tracking
              </h3>
              <p className="mt-2 text-sm text-amber-800">
                Gap analysis is currently limited to lead source categorization and basic conversion metrics.
                Weekly showings, offers written/accepted, and CMA-to-listing tracking will be added in future phases
                once the Weekly Activity by Agent tab is implemented in the Google Sheet.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white/60 px-4 py-3">
                  <p className="text-sm font-medium text-amber-900">Available Now</p>
                  <ul className="mt-1 text-sm text-amber-800">
                    <li>• Lead source normalization</li>
                    <li>• Sphere deal tracking</li>
                    <li>• Basic leads-to-closed conversion</li>
                  </ul>
                </div>
                <div className="rounded-xl bg-white/60 px-4 py-3">
                  <p className="text-sm font-medium text-amber-900">Coming Soon</p>
                  <ul className="mt-1 text-sm text-amber-800">
                    <li>• Weekly showings per agent</li>
                    <li>• Offers written vs accepted</li>
                    <li>• CMA to listing taken conversion</li>
                    <li>• Average showings before offer</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subValue,
  icon,
  accent,
  tooltip,
}: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  accent: 'indigo' | 'emerald' | 'amber';
  tooltip: string;
}) {
  const accents = {
    indigo: 'from-indigo-500/15 to-violet-500/10 text-indigo-700',
    emerald: 'from-emerald-500/15 to-teal-500/10 text-emerald-700',
    amber: 'from-amber-500/15 to-orange-500/10 text-amber-700',
  };

  return (
    <div
      className="group relative rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.24)] backdrop-blur"
      title={tooltip}
    >
      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[accent]}`}>
        {icon}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      {subValue && <p className="mt-1 text-sm text-slate-500">{subValue}</p>}
    </div>
  );
}
