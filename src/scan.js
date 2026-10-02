// Walking the folder. The tool lists the folders under the one it is given and picks out the files that
// docs/inputs.md names, by name only. It never follows a symbolic link (so a link that points back up the tree cannot
// make it loop or leave the folder), skips the folders that hold other people's code or build output, stops at a depth
// and at a number of entries, and says in a note what it did not look at. The walk uses a list and no recursion, so a
// very deep folder cannot overflow the stack. Paths in the result are relative and written with "/" on every system.

import { readdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { InputError } from './errors.js';
import { classify } from './readers.js';
import { safeText } from './rules.js';

export const SCAN_LIMITS = { maxDepth: 8, maxEntries: 200000, maxFiles: 5000 };

// Folders that hold installed packages, other people's code, caches or build output. Compared in lower case.
export const DEFAULT_SKIP = ['node_modules', '.git', '.hg', '.svn', 'vendor', 'bin', 'obj', 'target', 'dist', '.venv', 'venv', '__pycache__', '.gradle', '.idea', '.vs', 'bower_components'];

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export const folderName = (path) => safeText(basename(String(path)), 120);

// Lists the files of interest under root. options: maxDepth, maxEntries, maxFiles, skip (extra folder names),
// defaultSkip (false to skip nothing by default). Returns { root, name, found, stats }.
export async function scanFolder(root, options = {}) {
  const limits = { ...SCAN_LIMITS, ...Object.fromEntries(Object.entries(options).filter(([k, v]) => k in SCAN_LIMITS && v !== undefined)) };
  const skip = new Set([...(options.defaultSkip === false ? [] : DEFAULT_SKIP), ...(options.skip ?? [])].map((s) => s.toLowerCase()));
  const path = resolve(root);
  const name = folderName(path);
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    throw new InputError(`${name}: ${error.code === 'ENOENT' ? 'no such folder' : `cannot be read (${error.code ?? error.message})`}`);
  }
  if (!info.isDirectory()) throw new InputError(`${name} is not a folder. Give the folder of the project; the tool reads files by name inside it.`);

  const found = [];
  const stats = { folders: 1, entries: 0, links: 0, skipped: {}, tooDeep: 0, entryLimit: false, fileLimit: false, unreadable: [] };
  const todo = [{ abs: path, rel: '', depth: 0 }];
  while (todo.length > 0) {
    const dir = todo.pop();
    let entries;
    try {
      entries = await readdir(dir.abs, { withFileTypes: true });
    } catch (error) {
      stats.unreadable.push({ file: dir.rel === '' ? '.' : dir.rel, reason: `folder cannot be read (${safeText(error.code ?? error.message, 40)})` });
      continue;
    }
    entries.sort((a, b) => byName(a.name, b.name));
    for (const entry of entries) {
      stats.entries += 1;
      if (stats.entries > limits.maxEntries) {
        stats.entryLimit = true;
        break;
      }
      const rel = dir.rel === '' ? entry.name : `${dir.rel}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        stats.links += 1;
      } else if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (skip.has(lower)) stats.skipped[lower] = (stats.skipped[lower] ?? 0) + 1;
        else if (dir.depth + 1 > limits.maxDepth) stats.tooDeep += 1;
        else {
          stats.folders += 1;
          todo.push({ abs: resolve(dir.abs, entry.name), rel, depth: dir.depth + 1 });
        }
      } else if (entry.isFile()) {
        const kind = classify(entry.name);
        if (kind === null) continue;
        if (found.length >= limits.maxFiles) {
          stats.fileLimit = true;
        } else {
          found.push({ rel, abs: resolve(dir.abs, entry.name), kind });
        }
      }
    }
    if (stats.entryLimit) break;
  }
  found.sort((a, b) => byName(a.rel, b.rel));
  stats.unreadable.sort((a, b) => byName(a.file, b.file));
  return { root: path, name, found, stats, limits };
}
