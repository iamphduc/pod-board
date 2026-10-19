export type AddRepoError = 'not absolute' | 'not a directory' | 'already registered' | 'config unreadable'

export async function loadRepos(_file: string): Promise<{ repos: string[] } | { error: 'config unreadable' }> {
  return { repos: ['stub'] }
}

export async function addRepo(
  _file: string,
  _path: string,
  _platform: NodeJS.Platform,
): Promise<{ path: string } | { error: AddRepoError }> {
  return { path: 'stub' }
}
