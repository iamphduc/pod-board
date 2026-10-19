/** Repo-relative path → file text, as the Shared contract's Repo snapshot. */
export type RepoFiles = Record<string, string>

export function loadFixture(name: string): RepoFiles {
  void name
  return {}
}
