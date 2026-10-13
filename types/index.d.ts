export type DiffFile = { path: string; status: string; added: string; removed: string }
export type DiffView = { git: string[]; label: string; files: DiffFile[]; added: number; removed: number }

declare module 'claude-code' {
  interface PluginState {
    'git-diff': { view: DiffView | null; selected: string; patch: string }
  }
}
