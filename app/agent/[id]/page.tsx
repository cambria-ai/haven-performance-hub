'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  DollarSign,
  FileText,
  Home,
  LogOut,
  Mail,
  MessageSquare,
  Phone,
  PlusCircle,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  X,
  CheckCircle2,
  Activity,
} from 'lucide-react';
import { getEpiqueCap, getHavenCap, agentPaysHavenCap } from '../../../lib/cap-rules';

interface AgentData {
  agent: any;
  leaderboard: any[];
  teamStats: any;
  isAdmin: boolean;
  snapshotDate: string;
  timeWindowStats?: any;
}

export default function AgentDashboard() {
  const router = useRouter();
  const params = useParams();
  const requestedAgentId = Array.isArray(params.id) ? params.id[0] : String(params.id || '');
  const [agent, setAgent] = useState<any>(null);
  const [token, setToken] = useState<string>('');
  const [data, setData] = useState<AgentData | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showCapDrilldown, setShowCapDrilldown] = useState(false);
  const [showEpiqueCapDrilldown, setShowEpiqueCapDrilldown] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'weekly' | 'results'>('overview');
  const [newLead, setNewLead] = useState({ type: 'sphere', name: '', source: '', notes: '' });

  useEffect(() => {
    const stored = localStorage.getItem('haven_agent');
    const storedToken = localStorage.getItem('haven_token');
    if (!stored || !storedToken) {
      router.push('/');
      return;
    }
    const agentData = JSON.parse(stored);
    // Allow admin to view any agent page; agents can only view their own
    if (agentData.role !== 'admin' && requestedAgentId !== agentData.id) {
      router.push('/');
      return;
    }
    setAgent(agentData);
    setToken(storedToken);
    loadData(storedToken, agentData.role === 'admin' ? requestedAgentId : agentData.id, agentData.role === 'admin');
  }, [router, requestedAgentId]);

  async function loadData(authToken: string, targetAgentId: string, isAdminView = false) {
    try {
      const [dashboardRes, leadsRes] = await Promise.all([
        fetch(`/api/agent-data${isAdminView ? `?agentId=${encodeURIComponent(targetAgentId)}` : ''}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        }),
        fetch('/api/leads', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        }),
      ]);

      if (dashboardRes.ok) {
        const result = await dashboardRes.json();
        setData(result);
      } else if (dashboardRes.status === 401 || dashboardRes.status === 403) {
        router.push('/');
      }

      if (leadsRes.ok) {
        const leadsResult = await leadsRes.json();
        setLeads(leadsResult?.leads?.[targetAgentId] || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newLead,
          createdAt: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        const createdLead = {
          ...newLead,
          createdAt: new Date().toISOString(),
        };
        setLeads((current) => [createdLead, ...current]);
        alert('✅ Lead added!');
        setShowLeadForm(false);
        setNewLead({ type: 'sphere', name: '', source: '', notes: '' });
      } else {
        alert('Failed to add lead');
      }
    } catch (err) {
      alert('Failed to add lead');
    }
  }

  function handleLogout() {
    localStorage.removeItem('haven_token');
    localStorage.removeItem('haven_agent');
    router.push('/');
  }

  if (!agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Loading dashboard...
      </div>
    );
  }

  const agentData = data?.agent;
  const leaderboard = data?.leaderboard || [];
  const myRank = leaderboard.find(l => l.isOwn);
  const conversionRate = agentData?.zillowConversion || 0;
  const conversionProgress = Math.min((conversionRate / 4) * 100, 100);
  const timeWindowStats = data?.timeWindowStats;
  const isAdminViewing = agent?.role === 'admin';

  // Cap rules: Cambria has different cap rules than other agents
  const epiqueCapTarget = agentData ? getEpiqueCap(agentData.id) : 5000;
  const havenCapTarget = agentData ? getHavenCap(agentData.id) : 20000;
  const showsHavenCap = agentData ? agentPaysHavenCap(agentData.id) : true;

  const motivationMessage = !agentData
    ? 'Your dashboard is ready and waiting for the next report upload.'
    : conversionRate >= 4
      ? 'You are at or above the Zillow benchmark. Nice work.'
      : conversionRate >= 2.5
        ? 'You are building momentum. A little more follow up can push you over benchmark.'
        : 'You have room to grow here, and this dashboard will help you spot exactly where to focus next.';

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef6ff_35%,_#f8fafc_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 overflow-hidden rounded-[2rem] border border-white/70 bg-slate-950 text-white shadow-[0_35px_90px_-40px_rgba(15,23,42,0.72)]">
          <div className="relative px-6 py-7 sm:px-8 sm:py-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.42),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.28),_transparent_30%)]" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-cyan-100 backdrop-blur">
                  <Sparkles className="h-4 w-4" />
                  Your personal performance view
                </div>
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-white backdrop-blur">
                    <BarChart3 className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Haven Performance Hub</p>
                    <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Hi {agentData?.name || agent.name}, here is your scoreboard.</h1>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">{motivationMessage}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/15"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        {agentData && (
          <div className="mb-8 flex gap-3">
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                activeTab === 'overview'
                  ? 'bg-slate-950 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('weekly')}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                activeTab === 'weekly'
                  ? 'bg-slate-950 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Weekly Activity
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                activeTab === 'results'
                  ? 'bg-slate-950 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Results & Pay
            </button>
          </div>
        )}

        {agentData ? (
          <>
            {activeTab === 'overview' ? (
              <>
                <section className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-4">
              <RankCard
                rank={myRank?.rank || '--'}
                totalAgents={leaderboard.length}
                movement={myRank?.movement || 'same'}
                distanceToNext={myRank?.distanceToNext || 0}
              />
              <StatCard
                icon={<Target className="h-5 w-5" />}
                label="Closed transactions"
                value={agentData.closedTransactions || 0}
                helper="Year to date closings"
                accent="indigo"
                clickable={agentData.closedTransactions && agentData.closedTransactions > 0}
                onClick={() => {
                  router.push(`/agent/${agentData.id}/closings`);
                }}
              />
              <StatCard
                icon={<DollarSign className="h-5 w-5" />}
                label="Closed volume"
                value={formatCurrency(agentData.closedVolume || 0)}
                helper="Total sales volume"
                accent="emerald"
              />
              <StatCard
                icon={<TrendingUp className="h-5 w-5" />}
                label="Pending deals"
                value={agentData.pendingTransactions || 0}
                helper="In-flight transactions"
                accent="emerald"
                clickable={agentData.pendingTransactions && agentData.pendingTransactions > 0}
                onClick={() => {
                  router.push(`/agent/${agentData.id}/pendings`);
                }}
              />
            </section>

            <section className="mb-8 grid gap-6 xl:grid-cols-[1fr_380px]">
              <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                <div className="mb-6">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Leaderboard</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Leaderboard - Closed Transactions</h2>
                  <p className="mt-2 text-sm text-slate-600">You see your position highlighted. Other positions are anonymous to protect privacy.</p>
                </div>

                <div className="space-y-3">
                  {leaderboard.slice(0, 5).map((entry) => (
                    <LeaderboardRow
                      key={entry.rank}
                      entry={entry}
                      isOwn={entry.isOwn}
                    />
                  ))}
                  {leaderboard.length > 5 && (
                    <div className="text-center text-sm text-slate-500 py-3">
                      {leaderboard.filter(e => !e.isOwn).length - 5} more agents (anonymized for privacy)
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Your activity</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Daily effort metrics</h2>

                  <div className="mt-6 space-y-3">
                    <ActivityRow icon={<Phone className="h-4 w-4" />} label="Calls" value={agentData.calls || 0} />
                    <ActivityRow icon={<Home className="h-4 w-4" />} label="Showings" value={agentData.showings || 0} />
                    <ActivityRow icon={<Mail className="h-4 w-4" />} label="Emails" value={agentData.emails || 0} />
                    <ActivityRow icon={<Target className="h-4 w-4" />} label="CMAs completed" value={agentData.cmasCompleted || 0} />
                    <ActivityRow icon={<Trophy className="h-4 w-4" />} label="Active listings" value={agentData.activeListings || 0} />
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Zillow health</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Paid lead performance</h2>

                  <div className="mt-6 space-y-3">
                    <MetricRow label="Zillow leads" value={agentData.zillowLeads || 0} />
                    <MetricRow label="Conversion rate" value={`${(agentData.zillowConversion || 0).toFixed(1)}%`} />
                    <MetricRow label="Zillow closings" value={agentData.zillowClosed || Math.round((agentData.zillowLeads || 0) * (agentData.zillowConversion || 0) / 100)} />
                  </div>

                  <div className="mt-6 rounded-3xl bg-slate-50 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Benchmark progress</p>
                        <p className="mt-1 text-xl font-semibold text-slate-900">Zillow conversion goal</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${conversionRate >= 4 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {conversionRate >= 4 ? 'On target' : 'In progress'}
                      </span>
                    </div>
                    <div className="mt-4 h-3 rounded-full bg-slate-200">
                      <div
                        className="h-3 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 transition-all"
                        style={{ width: `${Math.max(conversionProgress, 6)}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                      <span>Current: {conversionRate.toFixed(1)}%</span>
                      <span>Goal: 4.0%</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Financial clarity</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950">Where your money is going</h2>
                </div>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">Readable at a glance</div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                <div
                  className="cursor-pointer rounded-3xl border border-slate-100 bg-slate-50/80 p-5 transition hover:border-indigo-200 hover:bg-indigo-50/80"
                  onClick={() => setShowCapDrilldown(true)}
                >
                  <p className="text-sm font-medium text-slate-500">Cap progress</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {`${((agentData.capProgress || 0) / (agentData.capTarget || 1) * 100).toFixed(0)}%`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatCurrency(agentData.capProgress || 0)} of {formatCurrency(agentData.capTarget || 20000)}
                  </p>
                  {agentData.capContributingTransactions && agentData.capContributingTransactions.length > 0 && (
                    <p className="mt-2 text-xs text-indigo-600 font-medium">
                      {agentData.capContributingTransactions.length} deal{agentData.capContributingTransactions.length !== 1 ? 's' : ''} contributing
                    </p>
                  )}
                </div>

              </div>
            </section>
              </>
            ) : activeTab === 'weekly' ? (
              <>
                {/* Weekly Activity Tab Content */}
                <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                  <div className="mb-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">FUB integration</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">Weekly Activity</h2>
                    <p className="mt-2 text-sm text-slate-600">Track your daily effort and lead engagement from Follow Up Boss</p>
                  </div>

                  {agentData.weeklyStats ? (
                    <>
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
                        <StatCard
                          icon={<Users className="h-5 w-5" />}
                          label="New leads"
                          value={agentData.weeklyStats.newLeads || 0}
                          helper="This week"
                          accent="indigo"
                        />
                        <StatCard
                          icon={<Phone className="h-5 w-5" />}
                          label="Calls"
                          value={agentData.weeklyStats.calls || 0}
                          helper="This week"
                          accent="emerald"
                        />
                        <StatCard
                          icon={<Mail className="h-5 w-5" />}
                          label="Emails sent"
                          value={agentData.weeklyStats.emails || 0}
                          helper="This week"
                          accent="indigo"
                        />
                        <StatCard
                          icon={<MessageSquare className="h-5 w-5" />}
                          label="Texts sent"
                          value={agentData.weeklyStats.texts || 0}
                          helper="This week"
                          accent="amber"
                        />
                      </div>

                      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-4">
                        <StatCard
                          icon={<MessageSquare className="h-5 w-5" />}
                          label="Zillow messages"
                          value={agentData.weeklyStats.zillowMessages || 0}
                          helper="This week"
                          accent="indigo"
                        />
                        <StatCard
                          icon={<FileText className="h-5 w-5" />}
                          label="Notes added"
                          value={agentData.weeklyStats.notes || 0}
                          helper="This week"
                          accent="emerald"
                        />
                        <StatCard
                          icon={<CheckSquare className="h-5 w-5" />}
                          label="Tasks completed"
                          value={agentData.weeklyStats.tasksCompleted || 0}
                          helper="This week"
                          accent="emerald"
                        />
                        <StatCard
                          icon={<Calendar className="h-5 w-5" />}
                          label="Appointments set"
                          value={agentData.weeklyStats.appointmentsSet || 0}
                          helper="This week"
                          accent="indigo"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                        <Activity className="h-8 w-8 text-slate-400" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-700">Not yet connected</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        FUB activity tracking is not yet enabled for your account.
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Contact your broker to enable Follow Up Boss integration.
                      </p>
                    </div>
                  )}
                </section>
              </>
            ) : activeTab === 'results' ? (
              <>
                {/* Results & Pay Tab Content */}
                <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                  <div className="mb-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Your earnings</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950">Results and Pay</h2>
                    <p className="mt-2 text-sm text-slate-600">Track your earned income and cap progress</p>
                  </div>

                  <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                    {showsHavenCap && (
                      <button
                        type="button"
                        onClick={() => setShowCapDrilldown(true)}
                        className="rounded-[1.75rem] border border-white/70 bg-gradient-to-br from-emerald-500/15 to-teal-500/10 p-6 text-left backdrop-blur transition hover:shadow-lg"
                      >
                        <p className="text-sm font-medium text-slate-500">Haven cap paid</p>
                        <p className="mt-2 text-4xl font-bold text-slate-950">{formatCurrency(agentData.capProgress || 0)}</p>
                        <p className="mt-1 text-sm text-slate-500">Of {formatCurrency(havenCapTarget || 0)} annual cap</p>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowEpiqueCapDrilldown(true)}
                      className="rounded-[1.75rem] border border-white/70 bg-gradient-to-br from-indigo-500/15 to-violet-500/10 p-6 text-left backdrop-blur transition hover:shadow-lg"
                    >
                      <p className="text-sm font-medium text-slate-500">Epique cap paid</p>
                      <p className="mt-2 text-4xl font-bold text-slate-950">{formatCurrency(agentData.epiqueCapProgress || 0)}</p>
                      <p className="mt-1 text-sm text-slate-500">Of {formatCurrency(epiqueCapTarget)} Epique cap</p>
                    </button>
                    <div className="rounded-[1.75rem] border border-white/70 bg-gradient-to-br from-amber-500/15 to-orange-500/10 p-6 backdrop-blur">
                      <p className="text-sm font-medium text-slate-500">Income split</p>
                      <p className="mt-2 text-4xl font-bold text-slate-950">{formatCurrency((agentData.closedTransactionsDetail || []).reduce((sum: number, txn: any) => sum + (txn.agentIncome || 0), 0))}</p>
                      <p className="mt-1 text-sm text-slate-500">Closed agent income with Haven and Epique detail below</p>
                    </div>
                  </div>
                </section>

                {/* Pending Transactions - Clickable */}
                {agentData.pendingTransactions && agentData.pendingTransactions > 0 && (
                  <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                    <div className="mb-6">
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">In-flight deals</p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Pending transactions</h2>
                      <p className="mt-2 text-sm text-slate-600">Click any deal to see your expected income</p>
                    </div>

                    <div className="space-y-3">
                      {agentData.pendingTransactionsDetail && agentData.pendingTransactionsDetail.length > 0 ? (
                        agentData.pendingTransactionsDetail.map((txn: any, idx: number) => (
                          <div
                            key={txn.transactionId}
                            className="cursor-pointer rounded-2xl border border-slate-100 bg-slate-50/80 p-4 transition hover:bg-indigo-50/80"
                            onClick={() => {
                              router.push(`/agent/${agentData.id}/pendings`);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-slate-900">{txn.address}</p>
                                <p className="text-sm text-slate-600">
                                  {txn.expectedClosingDate ? `Expected closing: ${new Date(txn.expectedClosingDate).toLocaleDateString()}` : 'Closing date TBD'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-emerald-700">{formatCurrency(txn.expectedAgentIncome || 0)}</p>
                                <p className="text-xs text-slate-500">Expected agent income</p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                          <p className="text-sm text-slate-600">{agentData.pendingTransactions} pending deal(s) - details loading</p>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {/* Week-to-Week Trends */}
                {timeWindowStats && (
                  <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                    <div className="mb-6">
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Trends</p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Week-over-week and month-to-date</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
                        <p className="text-sm font-medium text-slate-500">This week</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{timeWindowStats.thisWeek?.closedTransactions || 0} closed</p>
                        <p className="text-sm text-slate-600 mt-1">{formatCurrency(timeWindowStats.thisWeek?.closedVolume || 0)} volume</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
                        <p className="text-sm font-medium text-slate-500">Last week</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{timeWindowStats.lastWeek?.closedTransactions || 0} closed</p>
                        <p className="text-sm text-slate-600 mt-1">{formatCurrency(timeWindowStats.lastWeek?.closedVolume || 0)} volume</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
                        <p className="text-sm font-medium text-slate-500">Month to date</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900">{timeWindowStats.monthToDate?.closedTransactions || 0} closed</p>
                        <p className="text-sm text-slate-600 mt-1">{formatCurrency(timeWindowStats.monthToDate?.closedVolume || 0)} volume</p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Cap Contributing Transactions */}
                {agentData.capContributingTransactions && agentData.capContributingTransactions.length > 0 && (
                  <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
                    <div className="mb-6">
                      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Cap contributors</p>
                      <h2 className="mt-2 text-2xl font-semibold text-slate-950">Sphere transactions counting toward cap</h2>
                    </div>

                    <div className="space-y-3">
                      {agentData.capContributingTransactions.map((txn: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-900">{txn.address}</p>
                            <p className="text-sm text-slate-600">
                              Closed {txn.closedDate ? new Date(txn.closedDate).toLocaleDateString() : 'TBD'} • {formatCurrency(txn.purchasePrice)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-emerald-700">
                              +{formatCurrency(txn.capContribution || 0)}
                            </p>
                            <p className="text-xs text-slate-500">to cap</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : null}
          </>
        ) : (
          <section className="mb-8 rounded-[2rem] border border-white/70 bg-white/85 p-10 text-center shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-100 text-indigo-700">
              <BarChart3 className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-slate-950">No performance data yet</h2>
            <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-slate-600">
              Your page is ready. As soon as your team leader uploads the next Excel report, your personalized metrics will appear here.
            </p>
          </section>
        )}

        {showCapDrilldown && agentData?.capContributingTransactions && showsHavenCap ? (
          <CapDrilldownModal
            transactions={agentData.capContributingTransactions}
            capProgress={agentData.capProgress}
            capTarget={havenCapTarget || 0}
            title="Sphere transactions counting toward your Haven cap"
            description={`Only sphere/personal deals count toward your ${formatCurrency(havenCapTarget || 0)} Haven cap maximum.`}
            amountLabel="to Haven cap"
            emptyTitle="No contracts have contributed to your Haven cap yet."
            emptyDescription="Sphere deals will appear here once they close."
            onClose={() => setShowCapDrilldown(false)}
          />
        ) : null}

        {showEpiqueCapDrilldown && agentData?.epiqueCapContributingTransactions ? (
          <CapDrilldownModal
            transactions={agentData.epiqueCapContributingTransactions}
            capProgress={agentData.epiqueCapProgress || 0}
            capTarget={epiqueCapTarget || 0}
            title="Transactions counting toward your Epique cap"
            description={`Epique transaction fees count toward a separate ${formatCurrency(epiqueCapTarget || 0)} cap that resets on April 7.`}
            amountLabel="to Epique cap"
            emptyTitle="No transactions have contributed to your Epique cap yet."
            emptyDescription="Epique fees will appear here once qualifying transactions close."
            onClose={() => setShowEpiqueCapDrilldown(false)}
          />
        ) : null}

        {agentData?.referrals && agentData.referrals > 0 ? (
          <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Your referrals</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">Referral transactions</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {agentData.referrals} referral{agentData.referrals !== 1 ? 's' : ''} totaling {formatCurrency(agentData.referralVolume || 0)}
                </p>
              </div>
            </div>

            {agentData.referralTransactions && agentData.referralTransactions.length > 0 ? (
              <div className="space-y-3">
                {agentData.referralTransactions.map((txn: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{txn.address}</p>
                      <p className="text-sm text-slate-600">
                        {txn.referralSource || 'Referral'} • Closed {new Date(txn.closedDate).toLocaleDateString()} • {formatCurrency(txn.purchasePrice)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-700">
                        {txn.referralFee ? formatCurrency(txn.referralFee) : 'Referral'}
                      </p>
                      {txn.isZillowFlex && <p className="text-xs text-slate-500">Zillow Flex</p>}
                      {txn.isRedfin && <p className="text-xs text-slate-500">Redfin</p>}
                      {txn.isSphere && <p className="text-xs text-slate-500">Personal Sphere</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600">Referral details will appear here as data is imported.</p>
            )}
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_30px_80px_-35px_rgba(15,23,42,0.24)] backdrop-blur">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Lead tracker</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">Keep your sphere and floor time leads organized</h2>
            </div>
            <button
              onClick={() => setShowLeadForm(!showLeadForm)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <PlusCircle className="h-4 w-4" />
              {showLeadForm ? 'Close form' : 'Add lead'}
            </button>
          </div>

          {showLeadForm && (
            <form onSubmit={handleAddLead} className="mb-6 rounded-[1.75rem] border border-slate-200 bg-slate-50/90 p-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <select
                  value={newLead.type}
                  onChange={(e) => setNewLead({ ...newLead, type: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="sphere">Sphere / Personal</option>
                  <option value="floor">Floor Time</option>
                </select>
                <input
                  type="text"
                  placeholder="Lead name"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  required
                />
                <input
                  type="text"
                  placeholder="Source"
                  value={newLead.source}
                  onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
                <input
                  type="text"
                  placeholder="Notes"
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <button
                type="submit"
                className="mt-4 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Save lead
              </button>
            </form>
          )}

          {leads.length > 0 ? (
            <div className="space-y-3">
              {leads.map((lead: any, i: number) => (
                <div key={i} className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{lead.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {lead.type === 'sphere' ? 'Sphere / Personal' : 'Floor Time'}
                      {lead.source ? ` • ${lead.source}` : ''}
                    </p>
                    {lead.notes && <p className="mt-2 text-sm text-slate-600">{lead.notes}</p>}
                  </div>
                  <span className="text-sm text-slate-400">{formatDate(lead.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-3xl bg-slate-50 px-5 py-6 text-center text-sm leading-6 text-slate-500">
              No leads tracked yet. Add your sphere and floor time leads here so they stay organized.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  helper,
  accent,
  clickable,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  helper: string;
  accent: 'indigo' | 'emerald' | 'amber';
  clickable?: boolean;
  onClick?: () => void;
}) {
  const accents = {
    indigo: 'from-indigo-500/15 to-violet-500/10 text-indigo-700',
    emerald: 'from-emerald-500/15 to-teal-500/10 text-emerald-700',
    amber: 'from-amber-500/15 to-orange-500/10 text-amber-700',
  };

  return (
    <div
      className={`rounded-[1.75rem] border border-white/70 bg-white/85 p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.24)] backdrop-blur${clickable ? ' cursor-pointer transition hover:border-indigo-200 hover:bg-indigo-50/80' : ''}`}
      onClick={clickable ? onClick : undefined}
    >
      <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accents[accent]}`}>
        {icon}
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-3 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function ActivityCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: 'indigo' | 'emerald' | 'amber';
}) {
  const accents = {
    indigo: 'bg-indigo-100 text-indigo-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/90 p-5">
      <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${accents[accent]}`}>{icon}</div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="text-base font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function FinancialItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (!value) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RankCard({ rank, totalAgents, movement, distanceToNext }: {
  rank: number | string;
  totalAgents: number;
  movement: 'up' | 'down' | 'same' | 'new';
  distanceToNext: number;
}) {
  const movementIcon = movement === 'up' ? (
    <ArrowUpRight className="h-5 w-5 text-emerald-500" />
  ) : movement === 'down' ? (
    <ArrowDownRight className="h-5 w-5 text-rose-500" />
  ) : (
    <Minus className="h-5 w-5 text-slate-400" />
  );

  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-gradient-to-br from-indigo-500/15 via-violet-500/10 to-cyan-500/10 p-6 backdrop-blur">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Your rank</p>
          <p className="mt-2 text-5xl font-bold text-slate-950">{rank}</p>
          <p className="mt-1 text-sm text-slate-500">of {totalAgents} agents</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {movementIcon}
          {distanceToNext > 0 && (
            <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              {distanceToNext} to next
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({ entry, isOwn }: { entry: any; isOwn: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
      isOwn
        ? 'border-indigo-200 bg-indigo-50/80'
        : 'border-slate-100 bg-slate-50/50'
    }`}>
      <div className="flex items-center gap-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
          entry.rank === 1 ? 'bg-amber-100 text-amber-700' :
          entry.rank === 2 ? 'bg-slate-200 text-slate-700' :
          entry.rank === 3 ? 'bg-orange-100 text-orange-700' :
          'bg-slate-100 text-slate-600'
        }`}>
          {entry.rank}
        </div>
        <div>
          <p className={`font-semibold ${isOwn ? 'text-indigo-900' : 'text-slate-700'}`}>
            {entry.agentName}
            {isOwn && <span className="ml-2 text-xs font-normal text-indigo-600">(You)</span>}
          </p>
          <p className="text-xs text-slate-500">
            {entry.closedVolume ? formatCurrency(entry.closedVolume) : ''}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-slate-900">{entry.closedTransactions}</p>
        <p className="text-xs text-slate-500">closed</p>
      </div>
    </div>
  );
}

function ActivityRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="text-slate-500">{icon}</div>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <span className="text-base font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function CapDrilldownModal({
  transactions,
  capProgress,
  capTarget,
  title,
  description,
  amountLabel,
  emptyTitle,
  emptyDescription,
  onClose,
}: {
  transactions: any[];
  capProgress: number;
  capTarget: number;
  title: string;
  description: string;
  amountLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Cap breakdown</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 rounded-2xl bg-indigo-50 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-indigo-900">Total cap progress</p>
              <p className="mt-1 text-3xl font-bold text-indigo-700">
                {formatCurrency(capProgress)} <span className="text-lg text-indigo-600">/ {formatCurrency(capTarget)}</span>
              </p>
            </div>
            <div className="rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-700">
              {((capProgress / capTarget) * 100).toFixed(0)}% complete
            </div>
          </div>
          <div className="mt-4 h-3 rounded-full bg-indigo-200">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 transition-all"
              style={{ width: `${Math.min((capProgress / capTarget) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-3">
          {transactions.length > 0 ? (
            transactions.map((txn, i) => (
              <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{txn.address}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {txn.closedDate ? formatDate(txn.closedDate) : txn.contractDate ? formatDate(txn.contractDate) : 'Date TBD'}
                      {txn.notes && <span> • {txn.notes}</span>}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Purchase price: {formatCurrency(txn.purchasePrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <p className="text-lg font-bold">+{formatCurrency(txn.capContribution)}</p>
                    </div>
                    <p className="text-xs text-slate-500">{amountLabel}</p>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl bg-slate-50 p-8 text-center">
              <p className="text-slate-600">{emptyTitle}</p>
              <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
