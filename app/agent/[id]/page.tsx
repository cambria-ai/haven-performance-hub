'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { BarChart3, Target, Phone, Mail, Home, DollarSign, TrendingUp, LogOut, PlusCircle } from 'lucide-react';

export default function AgentDashboard() {
  const router = useRouter();
  const params = useParams();
  const [agent, setAgent] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [newLead, setNewLead] = useState({ type: 'sphere', name: '', source: '', notes: '' });

  useEffect(() => {
    const stored = localStorage.getItem('haven_agent');
    if (!stored) {
      router.push('/');
      return;
    }
    const agentData = JSON.parse(stored);
    if (params.id !== agentData.id) {
      router.push('/');
      return;
    }
    setAgent(agentData);
    loadData();
  }, [router, params.id]);

  async function loadData() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();
    if (!agent) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          ...newLead,
          createdAt: new Date().toISOString()
        })
      });

      if (res.ok) {
        alert('✅ Lead added!');
        setShowLeadForm(false);
        setNewLead({ type: 'sphere', name: '', source: '', notes: '' });
        loadData();
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

  if (!agent) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const agentData = data?.agents?.[agent.id];
  const leads = data?.leadTracking?.[agent.id] || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Haven Performance Hub</h1>
              <p className="text-sm text-gray-500">Your Performance Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">Welcome, {agent.name}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {agentData ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <StatCard
                icon={<Target className="w-6 h-6" />}
                label="Opportunities"
                value={agentData.opportunities || 0}
                color="blue"
              />
              <StatCard
                icon={<DollarSign className="w-6 h-6" />}
                label="GCI"
                value={formatCurrency(agentData.gci || 0)}
                color="green"
              />
              <StatCard
                icon={<TrendingUp className="w-6 h-6" />}
                label="Conversion Rate"
                value={`${(agentData.conversionRate || 0).toFixed(1)}%`}
                benchmark={agentData.conversionRate >= 4 ? '✅ On Target' : '⚠️ Below 4%'}
                color="orange"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Activities</h3>
                <div className="space-y-3">
                  <ActivityRow icon={<Phone className="w-4 h-4" />} label="Calls" value={agentData.calls || 0} />
                  <ActivityRow icon={<Home className="w-4 h-4" />} label="Showings" value={agentData.showings || 0} />
                  <ActivityRow icon={<Mail className="w-4 h-4" />} label="Emails" value={agentData.emails || 0} />
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Zillow Performance</h3>
                <div className="space-y-3">
                  <MetricRow label="Lead Volume" value={agentData.zillowLeads || 0} />
                  <MetricRow label="Conversion Rate" value={`${(agentData.zillowConversion || 0).toFixed(1)}%`} />
                  <MetricRow label="Cost Per Lead" value={formatCurrency(agentData.zillowCPL || 0)} />
                  <MetricRow label="Total Zillow Cost" value={formatCurrency(agentData.zillowCost || 0)} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <FinancialItem label="Cap (Epique)" value={formatCurrency(agentData.cap || 0)} />
                <FinancialItem label="Haven Fees" value={formatCurrency(agentData.havenFees || 0)} />
                <FinancialItem label="B&O Tax" value={formatCurrency(agentData.boTax || 0)} />
                <FinancialItem label="L&I" value={formatCurrency(agentData.lni || 0)} />
                <FinancialItem label="Transaction Fees" value={formatCurrency(agentData.transactionFees || 0)} />
                <FinancialItem label="Zillow Costs" value={formatCurrency(agentData.zillowCost || 0)} />
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center mb-8">
            <p className="text-gray-600">No performance data uploaded yet.</p>
            <p className="text-sm text-gray-500 mt-2">Your team leader will upload Excel reports with your metrics.</p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Your Lead Tracking</h3>
            <button
              onClick={() => setShowLeadForm(!showLeadForm)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
            >
              <PlusCircle className="w-4 h-4" />
              Add Lead
            </button>
          </div>

          {showLeadForm && (
            <form onSubmit={handleAddLead} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <select
                  value={newLead.type}
                  onChange={(e) => setNewLead({ ...newLead, type: e.target.value })}
                  className="px-3 py-2 border rounded-lg"
                >
                  <option value="sphere">Sphere / Personal</option>
                  <option value="floor">Floor Time</option>
                </select>
                <input
                  type="text"
                  placeholder="Lead Name"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  className="px-3 py-2 border rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Source"
                  value={newLead.source}
                  onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                  className="px-3 py-2 border rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Notes"
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  className="px-3 py-2 border rounded-lg"
                />
              </div>
              <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                Add Lead
              </button>
            </form>
          )}

          {leads.length > 0 ? (
            <div className="space-y-2">
              {leads.map((lead: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{lead.name}</p>
                    <p className="text-sm text-gray-500">
                      {lead.type === 'sphere' ? '🔵 Sphere' : '🟢 Floor Time'} {lead.source && `• ${lead.source}`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(lead.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No leads tracked yet. Add your sphere and floor time leads above.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color, benchmark }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colors[color]}`}>{icon}</div>
        {benchmark && (
          <span className={`text-xs font-medium px-2 py-1 rounded ${benchmark.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
            {benchmark}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function ActivityRow({ icon, label, value }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className="p-2 bg-gray-100 rounded-lg text-gray-600">{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: any) {
  return (
    <div className="flex justify-between items-center py-2 border-b last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function FinancialItem({ label, value }: any) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (!value) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
