import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { INPUTS, READ_LIMITS, checkFolder, lowestNpm, lowestPep440, readDeclarationsFromText, scanFolder } from '../src/index.js';
import { TODAY, find, ids, report, withFiles } from './helpers.js';

// Hostile input. Each test has a time limit, because the way these inputs fail is by taking very long or by using the
// memory of the machine. A refusal is a finding with a reason; nothing may be thrown, and the run goes on to the next file.
const LIMIT = { timeout: 30000 };

test('hostile: a package.json over the size limit is not read, and the finding says so', LIMIT, async () => {
  const big = `{"engines":{"node":">=18"},"pad":"${'x'.repeat(READ_LIMITS.maxFileBytes)}"}`;
  const r = await report({ 'package.json': big, '.nvmrc': '24\n' });
  assert.deepEqual(ids(r), ['runtime-supported', 'file-not-read']);
  assert.match(find(r, 'file-not-read')[0].message, /^package\.json is 2,097,\d{3} bytes, over the 2,097,152 bytes limit, so it was not read\./);
});

test('hostile: a binary file with the name of an input is refused as not text', LIMIT, async () => {
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0xff, 0xfe, 0x00]);
  const r = await report({ 'package.json': bytes, 'x/Dockerfile': Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]), 'y/.nvmrc': Buffer.alloc(1000, 0) });
  assert.deepEqual(ids(r), ['file-not-read', 'file-not-read', 'file-not-read', 'no-runtime-found']);
  for (const f of find(r, 'file-not-read')) assert.match(f.message, /is not text: it holds the byte 0x[0-9a-f]{2} at offset \d+/);
});

test('hostile: UTF-16 text and bytes that are not UTF-8 are refused, and a byte order mark in UTF-8 is accepted', LIMIT, async () => {
  const utf16 = Buffer.from('\ufeff{"engines":{"node":">=10"}}', 'utf16le');
  const r = await report({ 'a/package.json': utf16, 'b/.nvmrc': Buffer.from([0x31, 0x38, 0x0a, 0xc3, 0x28]), 'c/.nvmrc': Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('24\n')]) });
  assert.deepEqual(ids(r), ['runtime-supported', 'file-not-read', 'file-not-read']);
  assert.match(find(r, 'file-not-read')[0].message, /UTF-16/);
  assert.match(find(r, 'file-not-read')[1].message, /not valid UTF-8/);
});

test('hostile: a declared value of a million characters is refused for its length, quickly', LIMIT, async () => {
  const start = Date.now();
  const r = await report({ 'package.json': JSON.stringify({ engines: { node: `>=${'1'.repeat(1000000)}` } }) });
  assert.ok(Date.now() - start < 5000);
  assert.deepEqual(ids(r), ['version-unreadable']);
  assert.match(r.findings[0].message, /longer than 200 characters/);
  assert.ok(r.findings[0].message.length < 400, 'the message does not repeat the value');
});

test('hostile: a range of thousands of alternatives or comparators is refused, and a long run of operators is read in linear time', LIMIT, () => {
  const start = Date.now();
  assert.equal(lowestNpm(Array.from({ length: 5000 }, () => '1').join('||')).ok, false);
  assert.equal(lowestNpm(Array.from({ length: 5000 }, () => '>=1').join(' ')).ok, false);
  assert.equal(lowestNpm('>'.repeat(100000)).ok, false);
  assert.equal(lowestNpm(`^${'~'.repeat(100000)}`).ok, false);
  assert.equal(lowestPep440(`>=${'1.'.repeat(100000)}`).ok, false);
  assert.equal(lowestPep440(','.repeat(100000)).ok, false);
  assert.ok(Date.now() - start < 3000);
});

test('hostile: very deep JSON is a problem with the file and not a crash', LIMIT, async () => {
  const deep = `{"engines":${'['.repeat(300000)}`;
  const r = await report({ 'package.json': deep, 'x/composer.json': `{"require":{"php":"^8.1"},"x":${'{"a":'.repeat(100000)}1${'}'.repeat(100000)}}` });
  assert.ok(ids(r).includes('file-not-read'));
  assert.equal(find(r, 'file-not-read')[0].file, 'package.json');
  for (const f of find(r, 'file-not-read')) assert.match(f.message, /is not valid JSON/);
});

test('hostile: a project file with a hundred thousand unclosed tags or comments is read in linear time', LIMIT, () => {
  const start = Date.now();
  assert.deepEqual(readDeclarationsFromText('csproj', '<TargetFramework'.repeat(100000)), []);
  assert.deepEqual(readDeclarationsFromText('csproj', '<TargetFramework>'.repeat(100000)), []);
  assert.deepEqual(readDeclarationsFromText('csproj', '<!--'.repeat(100000)), []);
  assert.deepEqual(readDeclarationsFromText('pom', '<java.version>'.repeat(100000)), []);
  assert.deepEqual(readDeclarationsFromText('pom', `<maven.compiler.release>${' '.repeat(100000)}`), []);
  assert.deepEqual(readDeclarationsFromText('pom', '<!--'.repeat(100000) + '<java.version>8</java.version>'), []);
  assert.ok(Date.now() - start < 5000);
});

test('hostile: a line of a million characters, and a file of a hundred thousand lines, are cut at the limits', LIMIT, () => {
  const start = Date.now();
  assert.deepEqual(readDeclarationsFromText('gemfile', `ruby '3.1.2'${' '.repeat(1000000)}`).length, 0);
  assert.deepEqual(readDeclarationsFromText('gemfile', `${'x'.repeat(1000000)}\nruby '3.1.2'\n`).map((d) => d.key), ['3.1']);
  assert.equal(readDeclarationsFromText('dockerfile', 'FROM node:18\n'.repeat(100000)).length, READ_LIMITS.maxPerFile);
  assert.equal(readDeclarationsFromText('go-mod', 'go 1.21\n'.repeat(100000)).length, READ_LIMITS.maxLines);
  assert.equal(readDeclarationsFromText('python-version', '3.11\n'.repeat(100000)).length, READ_LIMITS.maxLines);
  assert.ok(Date.now() - start < 5000);
});

test('hostile: more declarations than the limit stop the run with a note, and the report is still made', LIMIT, async () => {
  const files = {};
  for (let i = 0; i < 30; i += 1) files[`p${String(i).padStart(2, '0')}/.nvmrc`] = '24\n';
  const r = await withFiles(files, (dir) => checkFolder(dir, { today: TODAY, limits: { ...READ_LIMITS, maxDeclarations: 10 } }));
  assert.equal(r.input.declarations, 10);
  assert.ok(r.notes.some((n) => /stopped after 5,000 declarations/.test(n)));
});

test('hostile: odd version strings in every reader give a declaration or a reason, and never throw', LIMIT, () => {
  const odd = ['', ' ', '0', '00', '-1', '1e3', '0x12', '\u0661\u0662', '18.', '.18', '18..19', '>=', '^^18', '~>', '>=18 <', 'v', 'V18', '18 19', '18,19', '\t18', '18\u0000', 'NaN', 'Infinity', '9'.repeat(30), '1'.repeat(7), '1.2.3.4.5', '*.*.*', 'x.x.x', '1.x.2', '||', '|', '>=1||', '<1', '=', '18-', '18+build', '1.2.3-', '\u202e18', '__proto__', 'constructor', "'; DROP TABLE x; --", '${jndi:ldap://x}', '$(whoami)', '`id`', '../../etc/passwd'];
  for (const raw of odd) {
    const cases = [
      ['package-json', JSON.stringify({ engines: { node: raw } })],
      ['nvmrc', raw],
      ['python-version', raw],
      ['pyproject', `[project]\nrequires-python = ${JSON.stringify(raw)}\n`],
      ['runtime-txt', raw],
      ['global-json', JSON.stringify({ sdk: { version: raw } })],
      ['csproj', `<TargetFramework>${raw.replace(/</g, '')}</TargetFramework>`],
      ['pom', `<java.version>${raw.replace(/</g, '')}</java.version>`],
      ['gradle', `sourceCompatibility = ${raw}`],
      ['composer', JSON.stringify({ require: { php: raw } })],
      ['gemfile', `ruby '${raw.replace(/'/g, '')}'`],
      ['ruby-version', raw],
      ['go-mod', `go ${raw}\ntoolchain ${raw}\n`],
      ['dockerfile', `FROM node:${raw}\nFROM python:${raw}\nFROM mcr.microsoft.com/dotnet/sdk:${raw}`]
    ];
    for (const [kind, text] of cases) {
      let list;
      assert.doesNotThrow(() => { list = readDeclarationsFromText(kind, text); }, `${kind}: ${JSON.stringify(raw)}`);
      for (const d of list) assert.ok((d.key === null) === (typeof d.reason === 'string'), `${kind}: ${JSON.stringify(raw)}`);
    }
  }
  assert.equal(INPUTS.length, 16);
});

test('hostile: a file name with control characters or very long is cleaned in the report, where the system allows such a name', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not allow a control character in a file name');
    return;
  }
  const name = `evil${String.fromCharCode(27)}[31m${String.fromCharCode(10)}x`;
  let r;
  try {
    r = await withFiles({ [`${name}/package.json`]: '{"engines":{"node":"14"}}' }, (dir) => checkFolder(dir, { today: TODAY }));
  } catch (error) {
    if (!['EINVAL', 'EILSEQ', 'ENOENT', 'EPERM', 'EACCES'].includes(error.code)) throw error;
    t.skip(`this file system does not allow the name (${error.code})`);
    return;
  }
  assert.equal(r.findings[0].id, 'runtime-past-support');
  assert.equal(r.findings[0].file, 'evil [31m x/package.json');
  assert.doesNotMatch(r.findings[0].message, new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}]`));
});

test('hostile: a declared value with escape sequences and direction controls is cleaned in the message', LIMIT, async () => {
  const value = `>=14${String.fromCharCode(27)}[31m${String.fromCharCode(0x202e)}${String.fromCharCode(10)}ERROR`;
  const r = await report({ 'package.json': JSON.stringify({ engines: { node: value } }) });
  const message = r.findings[0].message;
  assert.doesNotMatch(message, new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(0x202e)}]`));
  assert.equal(r.findings[0].declared.includes('ERROR'), true);
});

test('hostile: many folders and files in one folder are walked within the limits, and in order', LIMIT, async () => {
  const files = {};
  for (let i = 0; i < 400; i += 1) files[`d${String(i).padStart(3, '0')}/.nvmrc`] = '24\n';
  await withFiles(files, async (dir) => {
    const start = Date.now();
    const scan = await scanFolder(dir);
    assert.equal(scan.found.length, 400);
    assert.equal(scan.stats.folders, 401);
    assert.deepEqual(scan.found.map((f) => f.rel), scan.found.map((f) => f.rel).sort());
    assert.ok(Date.now() - start < 10000);
  });
});

test('hostile: a symbolic link loop and a link to a file outside the folder add nothing, where the system allows links', LIMIT, async (t) => {
  await withFiles({ 'inner/.nvmrc': '24\n', 'outside/package.json': '{"engines":{"node":"10"}}' }, async (dir) => {
    try {
      await mkdir(resolve(dir, 'inner', 'sub'), { recursive: true });
      await symlink(resolve(dir, 'inner'), resolve(dir, 'inner', 'sub', 'again'), 'dir');
      await symlink(resolve(dir, 'outside', 'package.json'), resolve(dir, 'inner', 'package.json'));
    } catch {
      t.skip('this system does not allow symbolic links here');
      return;
    }
    const r = await checkFolder(resolve(dir, 'inner'), { today: TODAY });
    assert.deepEqual(ids(r), ['runtime-supported']);
    assert.equal(r.input.files, 1);
    assert.ok(r.notes.some((n) => /2 symbolic links in the folder were not followed/.test(n)));
  });
});

test('hostile: a folder named like a skipped folder inside a skipped folder is not read, and nothing under it is listed', LIMIT, async () => {
  const r = await report({ 'node_modules/a/node_modules/b/package.json': '{"engines":{"node":"8"}}', '.git/hooks/package.json': '{"engines":{"node":"8"}}', 'ok/.nvmrc': '24\n' });
  assert.deepEqual(ids(r), ['runtime-supported']);
});

test('hostile: a path with a line feed, a NUL byte or a very long name as the folder is an input error and not a crash', LIMIT, async () => {
  for (const name of [`a${String.fromCharCode(10)}b`, `a${String.fromCharCode(0)}b`, 'n'.repeat(5000)]) {
    await assert.rejects(checkFolder(resolve(name), { today: TODAY }), (e) => e.name === 'InputError');
  }
});

test('hostile: a report on a folder full of hostile files still ends in a gate line, and a thrown error never escapes', LIMIT, async () => {
  const r = await report({
    'a/package.json': '\u0000\u0001',
    'b/.nvmrc': '\ufeff',
    'c/pom.xml': '<!--',
    'd/Dockerfile': 'FROM',
    'e/go.mod': 'go',
    'f/global.json': '{"sdk":{"version":null}}',
    'g/.python-version': '#\n#\n',
    'h/Gemfile': 'ruby',
    'i/composer.json': '{"require":null}',
    'j/pyproject.toml': '[project\nrequires-python = ">=3"'
  });
  assert.equal(r.gate.pass, true);
  assert.ok(ids(r).includes('file-not-read'));
  assert.ok(ids(r).includes('version-unreadable'));
});
