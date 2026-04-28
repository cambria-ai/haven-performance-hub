/**
 * Cap rules for Haven Performance Hub.
 * Defines agent-specific cap exceptions and defaults.
 */

// Default cap values
export const DEFAULT_EPIQUE_CAP = 5000; // Default Epique transaction-fee cap per agent
export const HAVEN_CAP_TARGET = 20000; // Standard Haven cap target for agents

// Agent-specific exceptions
const AGENT_CAP_EXCEPTIONS: Record<string, { epiqueCap?: number; havenCap?: number | null }> = {
  'cambria-henry': {
    epiqueCap: 10000, // Cambria has a higher Epique cap
    havenCap: null, // Cambria does not pay into a Haven cap
  },
};

/**
 * Get the Epique cap for a specific agent.
 * @param agentId - The normalized agent ID (e.g., 'cambria-henry')
 * @returns The Epique cap amount for this agent
 */
export function getEpiqueCap(agentId: string): number {
  const exception = AGENT_CAP_EXCEPTIONS[agentId];
  if (exception?.epiqueCap !== undefined) {
    return exception.epiqueCap;
  }
  return DEFAULT_EPIQUE_CAP;
}

/**
 * Get the Haven cap target for a specific agent.
 * @param agentId - The normalized agent ID (e.g., 'cambria-henry')
 * @returns The Haven cap target, or null if the agent does not pay into a Haven cap
 */
export function getHavenCap(agentId: string): number | null {
  const exception = AGENT_CAP_EXCEPTIONS[agentId];
  if (exception?.havenCap !== undefined) {
    return exception.havenCap;
  }
  return HAVEN_CAP_TARGET;
}

/**
 * Check if an agent should display Haven cap progress/contribution.
 * @param agentId - The normalized agent ID
 * @returns true if the agent pays into a Haven cap, false otherwise
 */
export function agentPaysHavenCap(agentId: string): boolean {
  return getHavenCap(agentId) !== null;
}
