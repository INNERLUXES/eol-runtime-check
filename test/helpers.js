// Shared test helpers: project folders written inline as text into a temporary folder that is removed after the test,
// and the command line run with captured output. Paths are built with resolve() from forward-slash names, so the same
// test runs on Linux, macOS and Windows. Every run passes --today (or today in the options), so no test depends on the
// calendar.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkFolder, main } from '../src/index.js';

export const TODAY = '2026-03-01';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'eol-runtime-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Writes the files and runs the command line with these arguments; the folder to check is the temporary folder, given
// as the first argument "." unless the arguments name another one.
export async function run(files, args = ['.'], extra = {}) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, dir, extra);
    return { code, out, err };
  });
}

// Runs the command line with exactly these arguments and the current folder as the base.
export async function cli(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}

// Writes the files and returns the report for the folder.
export async function report(files, options = {}) {
  return withFiles(files, (dir) => checkFolder(dir, { today: TODAY, ...options }));
}

export const ids = (r) => r.findings.map((f) => f.id);
export const find = (r, id) => r.findings.filter((f) => f.id === id);
export const subjects = (r, id) => find(r, id).map((f) => f.subject);

// A declaration as the readers return it, for tests of the judging code that read no file.
export const decl = (runtime, key, extra = {}) => ({ runtime, key, lowest: key, range: false, file: 'x/file', where: 'where', raw: key, reason: null, ...extra });
