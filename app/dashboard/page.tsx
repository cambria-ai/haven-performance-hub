'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, Upload, Users, DollarSign, Target, TrendingUp, LogOut } from 'lucide-react';

export default function TeamLeaderDashboard() {
  const router = useRouter();
  const [agent, setAgent] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [stats, setStats] = useState({
    totalAgents: 0,
    totalGCI: 0,
    totalTransactions: 0,
    avgConversionRate: 0
  });

  useEffect(() => {
    const stored = localStorage.getItem('haven_agent');
    if (!stored) {
      router.push('/');
      return;
    }
    const agentData = JSON.parse(stored);
    if (agentData.role !== 'admin') {
      router.push('/');
      return;
    }
    setAgent(agentData);
    loadData();
  }, [router]);

  async function loadData() {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const data = await res.json();
        setData(data);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !agent) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', agent.id);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await res.json();
      if (res.ok) {
        alert(`✅ Upload successful! Parsed ${result.sheets?.length || 0} sheets.`);
        loadData();
      } else {
        alert(`❌ Error: ${result.error}`);
      }
    } catch (err) {
      alert('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function handleLogout() {
    localStorage.removeItem('haven_token');
    localStorage.removeItem('haven_agent');
    router.push('/');
  }

  if (!agent) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Haven Performance Hub</h1>
              <p className="text-sm text-gray-500">Team Leader Dashboard</p>
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
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Upload Excel Report</h2>
            <label className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700 transition-colors">
              <Upload className="w-5 h-5" />
              <span>{uploading ? 'Uploading...' : 'Upload File'}</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
          <p className="text-gray-600">
            Upload your team performance Excel report. Supports multiple sheets (opportunities, activities, GCI, Zillow stats, financials).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            icon={<Users className="w-6 h-6" />}
            label="Total Agents"
            value={stats.totalAgents || data?.agents?.length || 0}
            color="blue"
          />
          <StatCard
            icon={<DollarSign className="w-6 h-6" />}
            label="Total GCI"
            value={formatCurrency(stats.totalGCI)}
            color="green"
          />
          <StatCard
            icon={<Target className="w-6 h-6" />}
            label="Transactions"
            value={stats.totalTransactions || 0}
            color="purple"
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="Avg Conversion Rate"
            value={`${(stats.avgConversionRate || 2.5).toFixed(1)}%`}
            benchmark="Target: 4%+"
            color="orange"
          />
        </div>

        {data?.uploads?.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Uploads</h3>
            <div className="space-y-3">
              {data.uploads.slice(-5).reverse().map((upload: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium text-gray-900">{upload.filename}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(upload.uploadedAt).toLocaleDateString()} by {upload.uploadedBy}
                    </p>
                  </div>
                  <div className="text-sm text-gray-600">
                    {upload.sheetCount} sheet{upload.sheetCount !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 bg-white rounded-xl shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Zillow Performance Benchmarks</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BenchmarkCard
              label="Standard Conversion Rate"
              value="4%+"
              description="Zillow Preferred standard"
            />
            <BenchmarkCard
              label="Top 10% Agents"
              value="3-5%"
              description="From online leads"
            />
            <BenchmarkCard
              label="Speed to Lead"
              value="5 min"
              description="9x more likely to convert"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, color, benchmark }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colors[color]}`}>{icon}</div>
        {benchmark && (
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {benchmark}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function BenchmarkCard({ label, value, description }: any) {
  return (
    <div className="border rounded-lg p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-indigo-600 mt-1">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </div>
  );
}

function formatCurrency(value: number): string {
  if (!value) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}
