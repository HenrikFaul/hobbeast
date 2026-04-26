export async function logMilestone(
  appendLog: (level: 'info' | 'warn' | 'error' | 'success', event: string, message: string, details?: Record<string, unknown>, runId?: string) => Promise<string | null>,
  level: 'info' | 'warn' | 'error' | 'success',
  milestone: string,
  message: string,
  details: Record<string, unknown> = {},
  runId?: string,
) {
  return appendLog(level, milestone, message, details, runId);
}
