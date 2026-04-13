export const BROWSER_DATA_KEY = 'haven-performance-data';

export interface UploadRecord {
  filename: string;
  uploadedBy: string;
  uploadedAt: string;
  sheetCount: number;
  sheets: string[];
}

export interface PerformanceDataShape {
  agents: Record<string, any>;
  uploads: UploadRecord[];
  leadTracking: Record<string, any>;
  latestUpload?: any;
  note?: string;
}

function normalizeAgentId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getAgentValue(row: Record<string, any>): string | null {
  const preferredKeys = [
    'agent',
    'agent name',
    'agent_name',
    'agent id',
    'agent_id',
    'team member',
    'team_member',
  ];

  const entries = Object.entries(row || {});
  for (const preferred of preferredKeys) {
    const match = entries.find(([key]) => key.trim().toLowerCase() === preferred);
    if (match && match[1] != null && String(match[1]).trim()) {
      return String(match[1]).trim();
    }
  }

  return null;
}

export function deriveAgentsFromParsedData(parsedData: Record<string, any>, existingAgents: Record<string, any> = {}) {
  const agents = { ...existingAgents };

  for (const sheet of Object.values(parsedData || {})) {
    const rows = Array.isArray((sheet as any)?.rows) ? (sheet as any).rows : [];
    for (const row of rows) {
      const agentName = getAgentValue(row);
      if (!agentName) continue;

      const id = normalizeAgentId(agentName);
      if (!id) continue;

      if (!agents[id]) {
        agents[id] = {
          id,
          name: agentName,
        };
      }
    }
  }

  return agents;
}

export function mergePerformanceData(
  currentData: Partial<PerformanceDataShape> | null | undefined,
  parsedData: Record<string, any>,
  uploadRecord: UploadRecord,
): PerformanceDataShape {
  const base: PerformanceDataShape = {
    agents: currentData?.agents || {},
    uploads: currentData?.uploads || [],
    leadTracking: currentData?.leadTracking || {},
    latestUpload: currentData?.latestUpload,
    note: currentData?.note,
  };

  return {
    ...base,
    agents: deriveAgentsFromParsedData(parsedData, base.agents),
    uploads: [...base.uploads, uploadRecord],
    latestUpload: parsedData,
  };
}

export function readBrowserPerformanceData(): PerformanceDataShape | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(BROWSER_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeBrowserPerformanceData(data: PerformanceDataShape) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BROWSER_DATA_KEY, JSON.stringify(data));
}
