import type { Env } from './config.ts'

export type AgentFile = { id: string; session: string; jsonlPath: string; metaPath: string }
export type AgentFileText = { id: string; session: string; meta: string; jsonl: string }

export function claudeDir(_env: Env, _home: string): string {
  return ''
}

export function transcriptDays(_env: Env): number {
  return 0
}

export function projectDirName(repoPath: string): string {
  return repoPath
}

export async function listAgentFiles(
  _claudeDir: string,
  _repoPath: string,
  _maxAgeDays: number,
  _now: number,
): Promise<AgentFile[]> {
  return [{ id: '', session: '', jsonlPath: '', metaPath: '' }]
}

export function createAgentFileReader(): {
  read(file: AgentFile): Promise<AgentFileText>
  retain(files: AgentFile[]): void
} {
  return {
    read: async (f) => ({ id: f.id, session: f.session, meta: 'stub', jsonl: 'stub' }),
    retain: () => {},
  }
}
