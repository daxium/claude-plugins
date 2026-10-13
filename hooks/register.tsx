import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DiffFile, DiffView } from '../types'

const PANE = 'git-diff'
const HOTKEYS = '123456789abcdefghijklmnopqrstuvwxyz'
// Code draws at most 100000 characters per element.
const MAX_PATCH = 100_000
const view = atom({ plugin: 'git-diff', key: 'view' } as const, null)
const selected = atom({ plugin: 'git-diff', key: 'selected' } as const, '')
const patch = atom({ plugin: 'git-diff', key: 'patch' } as const, '')

// The git command minus its file filter. No arg or a directory (worktree
// included): its working tree vs HEAD. Else a revision: what it adds since
// forking from HEAD.
async function resolveGit($: EngineInterface, target: string): Promise<string[]> {
  if (target === '') return ['git', 'diff', '--no-renames', 'HEAD']
  const { exitCode } = await $.process.run(['test', '-d', target])
  if (exitCode === 0) return ['git', '-C', target, 'diff', '--no-renames', 'HEAD']
  return ['git', 'diff', '--no-renames', `HEAD...${target}`]
}

function parseFiles(numstat: string, nameStatus: string): DiffFile[] {
  const statusOf = new Map(
    nameStatus.split('\n').filter(Boolean).map(line => {
      const [status = 'M', ...path] = line.split('\t')
      return [path.join('\t'), status] as const
    }),
  )
  return numstat.split('\n').filter(Boolean).map(line => {
    const [added = '', removed = '', ...rest] = line.split('\t')
    const path = rest.join('\t')
    return { path, status: statusOf.get(path) ?? 'M', added, removed }
  })
}

const total = (files: DiffFile[], pick: (f: DiffFile) => string) =>
  files.reduce((n, f) => n + (Number(pick(f)) || 0), 0)

function summarize(shown: DiffView): string {
  const count = `${shown.files.length} file${shown.files.length === 1 ? '' : 's'}`
  return `${shown.label}: ${count}, +${shown.added} −${shown.removed}`
}

// Code's diff format wants hunks only: drop the diff/index/---/+++ preamble.
function hunksOf(text: string): string {
  const start = text.startsWith('@@') ? 0 : text.indexOf('\n@@') + 1
  if (start === 0 && !text.startsWith('@@')) return ''
  const body = text.slice(start).trimEnd()
  if (body.length <= MAX_PATCH) return body
  return body.slice(0, body.lastIndexOf('\n@@', MAX_PATCH))
}

async function showFile($: EngineInterface, git: string[], path: string) {
  // :(top) because numstat paths are from the repo root, git's cwd may be a subdir.
  const run = await $.process.run([...git, '--', `:(top)${path}`])
  await update($, selected, () => path)
  await update($, patch, () => (run.exitCode === 0 ? run.stdout : run.stderr))
}

const STATUS_COLOR: Record<string, string> = { A: 'success', D: 'error', M: 'warning' }

// GitHub-style 5-cell bar: the share of added vs removed lines in one file.
function bar(file: DiffFile): { plus: string; minus: string; none: string } {
  const added = Number(file.added) || 0
  const removed = Number(file.removed) || 0
  if (added + removed === 0) return { plus: '', minus: '', none: '■■■■■' }
  const plus = Math.round((5 * added) / (added + removed))
  return { plus: '■'.repeat(plus), minus: '■'.repeat(5 - plus), none: '' }
}

function splitPath(path: string): { dir: string; name: string } {
  const cut = path.lastIndexOf('/') + 1
  return { dir: path.slice(0, cut), name: path.slice(cut) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'git-diff',
      description: 'Git diff in a side pane: current dir, or a branch / worktree / dir',
      argumentHint: '[branch | worktree | dir]',
    })
    return next(e)
  })

  on('command.run', { command: 'git-diff' }, async ($, e) => {
    const target = e.args.trim()
    const git = await resolveGit($, target)
    const [numstat, nameStatus] = await Promise.all([
      $.process.run([...git, '--numstat']),
      $.process.run([...git, '--name-status']),
    ])
    if (numstat.exitCode !== 0) return { text: `\`${git.join(' ')}\` failed: ${numstat.stderr.trim()}` }

    const files = parseFiles(numstat.stdout, nameStatus.stdout)
    const label = git.slice(git.indexOf('diff') + 2).join(' ') + (target === '' ? '' : ` (${target})`)
    const fresh: DiffView = {
      git, label, files, added: total(files, f => f.added), removed: total(files, f => f.removed),
    }
    await update($, view, () => fresh)
    await update($, selected, () => '')
    await update($, patch, () => '')
    const first = files[0]
    if (first !== undefined) await showFile($, git, first.path)
    await $.ui.open({ id: PANE, title: 'Git diff', focus: true, closeOnEscape: true })

    return { text: files.length === 0 ? `No changes: ${label}` : summarize(fresh) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const shown = await read($, view)
    if (shown === null) return <Text dimColor>Run /git-diff.</Text>
    const current = await read($, selected)
    const raw = await read($, patch)
    const hunks = hunksOf(raw)
    const file = shown.files.find(f => f.path === current)
    const rule = '─'.repeat(Math.max(10, e.props.bodyColumns))

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>{shown.label}</Text>
          <Text>
            <Text dimColor>{shown.files.length} files </Text>
            <Text color="success">+{shown.added}</Text> <Text color="error">−{shown.removed}</Text>
          </Text>
        </Box>
        <Text dimColor>{rule}</Text>

        <Box flexDirection="column" marginY={1}>
          {shown.files.length === 0 && <Text dimColor>No changes.</Text>}
          {shown.files.map((f, i) => {
            const isCurrent = f.path === current
            const { dir, name } = splitPath(f.path)
            const cells = bar(f)
            return (
              <Box key={`row-${f.path}`} justifyContent="space-between" backgroundColor={isCurrent ? 'subtle' : undefined}>
                <Button key={f.path} plain hotkey={HOTKEYS[i]} onPress={() => showFile($, shown.git, f.path)}>
                  <Text color={STATUS_COLOR[f.status] ?? 'warning'} bold>{f.status} </Text>
                  <Text dimColor>{dir}</Text>
                  <Text bold={isCurrent}>{name}</Text>
                </Button>
                <Text>
                  <Text color="success">+{f.added}</Text> <Text color="error">−{f.removed}</Text>{' '}
                  <Text color="success">{cells.plus}</Text>
                  <Text color="error">{cells.minus}</Text>
                  <Text dimColor>{cells.none}</Text>
                </Text>
              </Box>
            )
          })}
        </Box>

        {file !== undefined && (
          <Box flexDirection="column">
            <Text dimColor>{rule}</Text>
            <Text>
              <Text color={STATUS_COLOR[file.status] ?? 'warning'} bold>{file.status} </Text>
              <Text bold>{file.path}</Text>
            </Text>
            <Box marginTop={1}>
              {hunks === ''
                ? <Text dimColor>{raw.trim() === '' ? 'No textual changes.' : raw.trim()}</Text>
                : <Code source={hunks} format="diff" path={file.path} />}
            </Box>
            {hunks.length >= MAX_PATCH - 1 && <Text dimColor>(diff truncated)</Text>}
          </Box>
        )}

        <Box marginTop={1} gap={1}>
          <Button key="close" hotkey="0" onPress={() => $.ui.close({ id: PANE })}>Close</Button>
          <Text dimColor>1–9 a–z pick a file · arrows scroll · Esc closes</Text>
        </Box>
      </Box>
    )
  })
}
