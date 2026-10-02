import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_SKIP, InputError, SCAN_LIMITS, folderName, scanFolder } from '../src/index.js';
import { withFiles } from './helpers.js';

// Platform notes for this file. On Windows a backslash separates folders and a name is not case sensitive. On Linux and
// macOS a backslash is an ordinary character in a file name, and a name is case sensitive on Linux. Creating a link can
// need a privilege on Windows. Tests that depend on this are guarded with process.platform or try the link and skip,
// and every other test builds its paths with resolve() from names with forward slashes. The result of the walk uses
// forward slashes on every system, because the tool builds the relative path itself from the names.

const rels = (scan) => scan.found.map((f) => f.rel);

test('scan: the files of interest are found in nested folders, with relative paths written with forward slashes, in a fixed order', async () => {
  await withFiles({ 'package.json': '{}', 'b/.nvmrc': '1', 'a/pom.xml': '<x/>', 'a/deep/er/Dockerfile': 'FROM node:18', 'notes.txt': 'x' }, async (dir) => {
    const scan = await scanFolder(dir);
    assert.deepEqual(rels(scan), ['a/deep/er/Dockerfile', 'a/pom.xml', 'b/.nvmrc', 'package.json']);
    assert.deepEqual(scan.found.map((f) => f.kind), ['dockerfile', 'pom', 'nvmrc', 'package-json']);
    assert.equal(scan.stats.folders, 5);
    assert.equal(scan.found[0].abs, resolve(dir, 'a', 'deep', 'er', 'Dockerfile'));
  });
});

test('scan: the order does not depend on the order in which the system lists names', async () => {
  const files = {};
  for (const name of ['z', 'a', 'm', 'Bb', 'Qq', '10', '9', '_x']) files[`${name}/package.json`] = '{}';
  await withFiles(files, async (dir) => {
    const first = rels(await scanFolder(dir));
    const second = rels(await scanFolder(dir));
    assert.deepEqual(first, second);
    assert.deepEqual(first, [...first].sort());
  });
});

test('scan: the folders that hold other code or build output are skipped by name, in any case (one folder per name, because Windows treats Node_Modules and node_modules as one), and counted', async () => {
  await withFiles({ 'Node_Modules/x/package.json': '{}', 'vendor/composer.json': '{}', 'bin/Dockerfile': 'FROM node:18', 'obj/a.csproj': '<x/>', 'src/package.json': '{}' }, async (dir) => {
    const scan = await scanFolder(dir);
    assert.deepEqual(rels(scan), ['src/package.json']);
    assert.equal(scan.stats.skipped.node_modules, 1);
    assert.equal(scan.stats.skipped.vendor, 1);
    assert.equal(scan.stats.skipped.bin, 1);
    assert.equal(scan.stats.skipped.obj, 1);
  });
});

test('scan: --skip adds names, and defaultSkip false skips nothing by default', async () => {
  await withFiles({ 'node_modules/package.json': '{}', 'legacy/package.json': '{}', 'app/package.json': '{}' }, async (dir) => {
    assert.deepEqual(rels(await scanFolder(dir, { skip: ['LEGACY'] })), ['app/package.json']);
    assert.deepEqual(rels(await scanFolder(dir, { defaultSkip: false })), ['app/package.json', 'legacy/package.json', 'node_modules/package.json']);
    assert.deepEqual(rels(await scanFolder(dir, { defaultSkip: false, skip: ['node_modules', 'legacy'] })), ['app/package.json']);
  });
  assert.ok(DEFAULT_SKIP.includes('node_modules') && DEFAULT_SKIP.includes('.git') && DEFAULT_SKIP.includes('vendor'));
});

test('scan: the depth limit stops the walk, counts the folders it did not enter, and 0 reads the top folder only', async () => {
  await withFiles({ 'package.json': '{}', 'a/package.json': '{}', 'a/b/package.json': '{}', 'a/b/c/package.json': '{}', 'x/package.json': '{}' }, async (dir) => {
    const top = await scanFolder(dir, { maxDepth: 0 });
    assert.deepEqual(rels(top), ['package.json']);
    assert.equal(top.stats.tooDeep, 2);
    const two = await scanFolder(dir, { maxDepth: 2 });
    assert.deepEqual(rels(two), ['a/b/package.json', 'a/package.json', 'package.json', 'x/package.json']);
    assert.equal(two.stats.tooDeep, 1);
    assert.equal((await scanFolder(dir)).stats.tooDeep, 0);
    assert.equal(SCAN_LIMITS.maxDepth, 8);
  });
});

test('scan: a very deep chain of folders is cut at the depth limit and does not use the stack', async () => {
  const path = Array.from({ length: 40 }, () => 'd').join('/');
  await withFiles({ [`${path}/package.json`]: '{}', 'package.json': '{}' }, async (dir) => {
    const scan = await scanFolder(dir);
    assert.deepEqual(rels(scan), ['package.json']);
    assert.equal(scan.stats.tooDeep, 1);
    assert.equal(scan.stats.folders, 9);
    assert.equal((await scanFolder(dir, { maxDepth: 32 })).stats.tooDeep, 1);
    assert.deepEqual(rels(await scanFolder(dir, { maxDepth: 40 })).length, 2);
  });
});

test('scan: the limit on entries stops the walk and says so', async () => {
  const files = {};
  for (let i = 0; i < 30; i += 1) files[`f${String(i).padStart(2, '0')}.txt`] = 'x';
  files['package.json'] = '{}';
  await withFiles(files, async (dir) => {
    const scan = await scanFolder(dir, { maxEntries: 10 });
    assert.equal(scan.stats.entryLimit, true);
    assert.equal(scan.limits.maxEntries, 10);
    assert.equal((await scanFolder(dir)).stats.entryLimit, false);
  });
});

test('scan: the limit on files of interest keeps the first ones in order and says so', async () => {
  const files = {};
  for (let i = 0; i < 12; i += 1) files[`p${String(i).padStart(2, '0')}/package.json`] = '{}';
  await withFiles(files, async (dir) => {
    const scan = await scanFolder(dir, { maxFiles: 5 });
    assert.equal(scan.found.length, 5);
    assert.equal(scan.stats.fileLimit, true);
    assert.deepEqual(rels(scan), [...rels(scan)].sort());
  });
});

test('scan: a path that is not a folder, or does not exist, is an input error that names the last part only', async () => {
  await withFiles({ 'a.txt': 'x' }, async (dir) => {
    await assert.rejects(scanFolder(resolve(dir, 'a.txt')), (e) => e instanceof InputError && /^a\.txt is not a folder/.test(e.message));
    await assert.rejects(scanFolder(resolve(dir, 'missing')), (e) => e instanceof InputError && /^missing: no such folder$/.test(e.message));
  });
});

test('scan: names with spaces, non-ASCII letters and a leading dot are read', async () => {
  const E = String.fromCharCode(0xe9);
  await withFiles({ [`my project/${E}t${E}/package.json`]: '{}', '.hidden/.nvmrc': '20' }, async (dir) => {
    // A file system may store the accented letters in a decomposed form (older macOS volumes), which is the same name.
    assert.deepEqual(rels(await scanFolder(dir)).map((r) => r.normalize('NFC')), ['.hidden/.nvmrc', `my project/${E}t${E}/package.json`]);
  });
});

test('scan: a file name in another case is still found, because names are compared in lower case', async () => {
  await withFiles({ 'Package.JSON': '{}', 'sub/DOCKERFILE': 'FROM node:18', 'sub/App.Dockerfile': 'FROM node:18' }, async (dir) => {
    assert.deepEqual(rels(await scanFolder(dir)), ['Package.JSON', 'sub/App.Dockerfile', 'sub/DOCKERFILE']);
  });
});

test('scan: a folder named like a file is a folder, and is walked', async () => {
  await withFiles({ 'package.json/.nvmrc': '20' }, async (dir) => {
    assert.deepEqual(rels(await scanFolder(dir)), ['package.json/.nvmrc']);
  });
});

test('scan: a symbolic link to a folder is not followed, even when it points back up the tree, where the system allows links', async (t) => {
  await withFiles({ 'package.json': '{}', 'real/package.json': '{}' }, async (dir) => {
    try {
      await symlink(dir, resolve(dir, 'real', 'loop'), 'dir');
      await symlink(resolve(dir, 'real'), resolve(dir, 'alias'), 'dir');
    } catch {
      t.skip('this system does not allow symbolic links here');
      return;
    }
    const start = Date.now();
    const scan = await scanFolder(dir);
    assert.ok(Date.now() - start < 5000);
    assert.deepEqual(rels(scan), ['package.json', 'real/package.json']);
    assert.equal(scan.stats.links, 2);
  });
});

test('scan: a symbolic link to a file is not read as a file of interest, where the system allows links', async (t) => {
  await withFiles({ 'other.txt': '{}' }, async (dir) => {
    try {
      await symlink(resolve(dir, 'other.txt'), resolve(dir, 'package.json'));
    } catch {
      t.skip('this system does not allow symbolic links here');
      return;
    }
    const scan = await scanFolder(dir);
    assert.deepEqual(rels(scan), []);
    assert.equal(scan.stats.links, 1);
  });
});

test('scan: a link to a folder that was given as the folder itself is followed, because the user chose that path', async (t) => {
  await withFiles({ 'real/package.json': '{}' }, async (dir) => {
    try {
      await symlink(resolve(dir, 'real'), resolve(dir, 'start'), 'dir');
    } catch {
      t.skip('this system does not allow symbolic links here');
      return;
    }
    assert.deepEqual(rels(await scanFolder(resolve(dir, 'start'))), ['package.json']);
  });
});

test('scan: the name shown is the last part of the path, with control characters cleaned', () => {
  assert.equal(folderName(resolve('/some/folder/project')), 'project');
  assert.equal(folderName(`${resolve('/some/folder')}/a${String.fromCharCode(27)}[31mb`), 'a [31mb');
  assert.equal(folderName(`${resolve('/some/folder')}/${'n'.repeat(300)}`).length, 120);
});

test('scan: on Windows a backslash separates folders, so the name is the last part', (t) => {
  if (process.platform !== 'win32') {
    t.skip('a backslash is an ordinary character in a file name on this system');
    return;
  }
  assert.equal(folderName('C:\\data\\projects\\billing'), 'billing');
});

test('scan: on Linux and macOS a backslash is part of the name, and the folder is walked under that name', async (t) => {
  if (process.platform === 'win32') {
    t.skip('a backslash separates folders on Windows');
    return;
  }
  await withFiles({ 'we\\ird/package.json': '{}' }, async (dir) => {
    assert.equal(folderName(resolve(dir, 'we\\ird')), 'we\\ird');
    assert.deepEqual(rels(await scanFolder(dir)), ['we\\ird/package.json']);
    assert.deepEqual(rels(await scanFolder(resolve(dir, 'we\\ird'))), ['package.json']);
  });
});

test('scan: a name that differs only by case is the same folder where the file system ignores case, and another on Linux', async (t) => {
  await withFiles({ 'Project/package.json': '{}' }, async (dir) => {
    if (process.platform === 'linux') {
      await assert.rejects(scanFolder(resolve(dir, 'project')), (e) => e instanceof InputError && /no such folder/.test(e.message));
    } else if (process.platform === 'win32') {
      assert.equal((await scanFolder(resolve(dir, 'project'))).found.length, 1);
    } else {
      t.skip('macOS can be set up either way');
    }
  });
});

test('scan: a folder that cannot be listed is reported with the reason and does not stop the walk', async (t) => {
  if (process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0)) {
    t.skip('folder permissions are not enforced here (Windows, or running as the superuser)');
    return;
  }
  const { chmod } = await import('node:fs/promises');
  await withFiles({ 'ok/package.json': '{}', 'locked/package.json': '{}' }, async (dir) => {
    await chmod(resolve(dir, 'locked'), 0o000);
    try {
      const scan = await scanFolder(dir);
      assert.deepEqual(rels(scan), ['ok/package.json']);
      assert.equal(scan.stats.unreadable.length, 1);
      assert.equal(scan.stats.unreadable[0].file, 'locked');
      assert.match(scan.stats.unreadable[0].reason, /folder cannot be read/);
    } finally {
      await chmod(resolve(dir, 'locked'), 0o755);
    }
    await mkdir(resolve(dir, 'after'), { recursive: true });
    await writeFile(resolve(dir, 'after', '.nvmrc'), '20');
  });
});
