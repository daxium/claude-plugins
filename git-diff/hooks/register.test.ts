import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const NUMSTAT = '3\t1\ta.txt\n0\t2\tsub/b.txt\n'
const NAME_STATUS = 'M\ta.txt\nD\tsub/b.txt\n'
const result = (exitCode: number, stdout: string): ProcessRunResult =>
  ({ exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
const hunkFor = (pathspec: string) =>
  `diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old ${pathspec}\n+new ${pathspec}\n`

function fakeGit(on: On, dirs: string[], seen: string[][]) {
  on('process.run', async (_$, e) => {
    seen.push([...e.argv])
    if (e.argv[0] === 'test') return { value: result(dirs.includes(e.argv[2] ?? '') ? 0 : 1, '') }
    if (e.argv.includes('--numstat')) return { value: result(0, NUMSTAT) }
    if (e.argv.includes('--name-status')) return { value: result(0, NAME_STATUS) }
    return { value: result(0, hunkFor(e.argv.at(-1) ?? '')) }
  })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
}

const gitDiff = ($: Engine, args: string) =>
  $.command.run({
    command: 'git-diff',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  })

const mountPane = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({
    plugin: 'git-diff',
    surface,
    component: 'Pane',
    requestId: 'git-diff',
    props: {
      title: 'Git diff', isFocused: true, bodyColumns: 80, placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 }, view: {},
    },
  })

test('no arg: one-line summary, first file loaded from the repo root', async ($, on) => {
  const seen: string[][] = []
  fakeGit(on, [], seen)
  const out = await gitDiff($, '')
  expect(out.text).toBe('HEAD: 2 files, +3 −3')
  expect(seen).toContainEqual(['git', 'diff', '--no-renames', 'HEAD', '--numstat'])
  expect(seen.at(-1)).toEqual(['git', 'diff', '--no-renames', 'HEAD', '--', ':(top)a.txt'])
})

test('a directory diffs that worktree, anything else is a branch', async ($, on) => {
  const seen: string[][] = []
  fakeGit(on, ['../other'], seen)
  await gitDiff($, '../other')
  expect(seen).toContainEqual(['git', '-C', '../other', 'diff', '--no-renames', 'HEAD', '--numstat'])
  await gitDiff($, 'main')
  expect(seen).toContainEqual(['git', 'diff', '--no-renames', 'HEAD...main', '--numstat'])
})

test('the selected file is drawn as a Code diff, hunks only; pressing another switches', async ($, on) => {
  fakeGit(on, [], [])
  await gitDiff($, '')
  const pane = await mountPane($)
  const first = JSON.stringify(await pane.drawn())
  expect(first).toContain('"type":"Code"')
  expect(first).toContain('@@ -1 +1 @@\\n-old :(top)a.txt')
  expect(first).not.toContain('index 1..2')
  await pane.press({ key: 'sub/b.txt' })
  expect(JSON.stringify(await pane.drawn())).toContain('+new :(top)sub/b.txt')
})

test('the Close button closes the pane', async ($, on) => {
  fakeGit(on, [], [])
  const closed: string[] = []
  on('ui.close', async (_$, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  await gitDiff($, '')
  const pane = await mountPane($)
  await pane.press({ key: 'close' })
  expect(closed).toEqual(['git-diff'])
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the pane validates on ${surface}`, async ($, on) => {
    fakeGit(on, [], [])
    await gitDiff($, '')
    const pane = await mountPane($, surface)
    expect(JSON.stringify(await pane.drawn())).toContain('"type":"Code"')
  })
}
