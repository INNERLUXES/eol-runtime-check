// Reading the files that declare a runtime. The tool reads only the files in INPUTS, as text, and only the value or the
// lines named in docs/inputs.md. Nothing is run, imported or evaluated: a package.json is parsed as data, a project
// file or a Dockerfile is read line by line, and a build property is reported as "not evaluated". Every regular
// expression that runs on the content of a file has a bounded length, so a hostile file cannot make it slow.

import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { safeText } from './rules.js';
import { RUNTIMES } from './lifecycle.js';
import { lowestGem, lowestNpm, lowestPep440, parseFromLine, parseGoVersion, parseJavaVersion, parseSdkVersion, parseTargetFramework, singleVersion, tupleText, versionKey } from './version.js';

export const READ_LIMITS = {
  maxFileBytes: 2 * 1024 * 1024,
  maxLines: 20000,
  maxLineChars: 2000,
  maxDeclarations: 5000,
  maxPerFile: 200
};

// The files that are read, as shown in docs/inputs.md. Names are compared in lower case, so Dockerfile and dockerfile
// are the same on every system.
export const INPUTS = [
  { reader: 'package-json', match: 'package.json', reads: 'engines.node' },
  { reader: 'nvmrc', match: '.nvmrc', reads: 'the first line' },
  { reader: 'node-version', match: '.node-version', reads: 'the first line' },
  { reader: 'python-version', match: '.python-version', reads: 'every line' },
  { reader: 'pyproject', match: 'pyproject.toml', reads: 'requires-python in the [project] table' },
  { reader: 'runtime-txt', match: 'runtime.txt', reads: 'the first line' },
  { reader: 'global-json', match: 'global.json', reads: 'sdk.version' },
  { reader: 'csproj', match: '*.csproj', reads: 'TargetFramework and TargetFrameworks' },
  { reader: 'pom', match: 'pom.xml', reads: 'maven.compiler.release, maven.compiler.source and java.version' },
  { reader: 'gradle', match: 'build.gradle', reads: 'sourceCompatibility and the toolchain language version' },
  { reader: 'gradle-kts', match: 'build.gradle.kts', reads: 'sourceCompatibility and the toolchain language version' },
  { reader: 'composer', match: 'composer.json', reads: 'require.php' },
  { reader: 'gemfile', match: 'Gemfile', reads: 'the ruby line' },
  { reader: 'ruby-version', match: '.ruby-version', reads: 'the first line' },
  { reader: 'go-mod', match: 'go.mod', reads: 'the go and toolchain lines' },
  { reader: 'dockerfile', match: 'Dockerfile, Dockerfile.*, *.Dockerfile', reads: 'FROM lines' }
];

// A problem with a whole file: it cannot be read, it is not text, it is too big or it does not parse. It becomes a
// finding, never a silent skip.
export class FileProblem extends Error {
  constructor(message) {
    super(message);
    this.name = 'FileProblem';
  }
}

// Which reader a file name belongs to, or null.
export function classify(name) {
  const n = String(name).toLowerCase();
  switch (n) {
    case 'package.json': return 'package-json';
    case '.nvmrc': return 'nvmrc';
    case '.node-version': return 'node-version';
    case '.python-version': return 'python-version';
    case 'pyproject.toml': return 'pyproject';
    case 'runtime.txt': return 'runtime-txt';
    case 'global.json': return 'global-json';
    case 'pom.xml': return 'pom';
    case 'build.gradle': return 'gradle';
    case 'build.gradle.kts': return 'gradle-kts';
    case 'composer.json': return 'composer';
    case 'gemfile': return 'gemfile';
    case '.ruby-version': return 'ruby-version';
    case 'go.mod': return 'go-mod';
    case 'dockerfile': return 'dockerfile';
    default:
  }
  if (n.endsWith('.csproj') && n.length > '.csproj'.length) return 'csproj';
  if (n.startsWith('dockerfile.') || (n.endsWith('.dockerfile') && n.length > '.dockerfile'.length)) return 'dockerfile';
  return null;
}

// ---- reading a file

// Reads the file as UTF-8 text. The file is opened without following a link, the type and the size are taken from the
// open file, and a file that is not a regular file, is over the limit, holds a control byte, or is not valid UTF-8 is
// a FileProblem.
export async function readTextFile(path, limits = READ_LIMITS) {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error.code === 'ELOOP') throw new FileProblem('is a symbolic link, so it was not read');
    throw new FileProblem(`cannot be read (${error.code ?? error.message})`);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new FileProblem('is not a regular file, so it was not read');
    if (info.size > limits.maxFileBytes) throw new FileProblem(`is ${info.size.toLocaleString('en-US')} bytes, over the ${limits.maxFileBytes.toLocaleString('en-US')} bytes limit, so it was not read`);
    const buffer = Buffer.alloc(info.size);
    let done = 0;
    while (done < info.size) {
      const { bytesRead } = await handle.read(buffer, done, info.size - done, done);
      if (bytesRead === 0) break;
      done += bytesRead;
    }
    return decodeText(buffer.subarray(0, done));
  } finally {
    await handle.close();
  }
}

// Decodes bytes as UTF-8 text. A UTF-16 file and a file with a NUL or another control byte are not text.
export function decodeText(buffer) {
  if (buffer.length >= 2 && ((buffer[0] === 0xff && buffer[1] === 0xfe) || (buffer[0] === 0xfe && buffer[1] === 0xff))) throw new FileProblem('is UTF-16 text, which the tool does not read; save it as UTF-8');
  for (let i = 0; i < buffer.length; i += 1) {
    const b = buffer[i];
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) throw new FileProblem(`is not text: it holds the byte 0x${b.toString(16).padStart(2, '0')} at offset ${i.toLocaleString('en-US')}`);
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    throw new FileProblem('is not valid UTF-8 text');
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// ---- helpers for the readers

function linesOf(text, limits) {
  const out = [];
  let start = 0;
  while (start <= text.length && out.length < limits.maxLines) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    let line = text.slice(start, Math.min(end, start + limits.maxLineChars));
    if (line.endsWith('\r')) line = line.slice(0, -1);
    out.push(line);
    start = end + 1;
  }
  return out;
}

// Removes <!-- ... --> in one pass, so that a file with many unclosed comments is not read again and again.
export function stripXmlComments(text) {
  let out = '';
  let from = 0;
  for (;;) {
    const open = text.indexOf('<!--', from);
    if (open < 0) return out + text.slice(from);
    out += text.slice(from, open);
    const close = text.indexOf('-->', open + 4);
    if (close < 0) return out;
    from = close + 3;
  }
}

// Removes // and /* */ comments outside strings, in one pass (global.json allows comments).
export function stripJsonComments(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

function parseJsonObject(text, what) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new FileProblem(`is not valid JSON, so ${what} was not read`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new FileProblem('is not a JSON object, so nothing was read');
  return value;
}

const own = (object, key) => (object !== null && typeof object === 'object' && Object.hasOwn(object, key) ? object[key] : undefined);

// A declaration: what a file says about one runtime. key is what the data is looked up by, null when the value could
// not be read, and then reason says why. lowest is the lowest version the value allows, as text. range is true when the
// value is a range or a minimum and not one version.
function declaration(runtime, where, raw, result, { range = false } = {}) {
  return {
    runtime,
    where,
    raw: safeText(raw, 80),
    range,
    key: result.ok ? result.key : null,
    lowest: result.ok ? result.lowest ?? result.key : null,
    reason: result.ok ? null : result.reason
  };
}

// A lowest version from a range or a single value, as a result with a key.
function keyed(runtime, found, single = false) {
  const k = versionKey(runtime, found, { single });
  if (!k.ok) return k;
  return { ok: true, key: k.key, lowest: tupleText(found.tuple, Math.max(found.given, RUNTIMES[runtime].keyParts)) };
}

const stringValue = (value) => (typeof value === 'string' ? value : null);

// ---- the readers: each takes the text of a file and returns declarations

function readPackageJson(text) {
  const pkg = parseJsonObject(text, 'engines');
  const engines = own(pkg, 'engines');
  const node = own(engines, 'node');
  if (node === undefined) return [];
  const s = stringValue(node);
  if (s === null) return [declaration('node', 'engines.node', JSON.stringify(node) ?? String(node), { ok: false, reason: 'engines.node is not a string' })];
  return [declaration('node', 'engines.node', s, keyed('node', lowestNpm(s)), { range: true })];
}

function firstLine(text, limits) {
  for (const raw of linesOf(text, limits)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line !== '') return line;
  }
  return null;
}

function readNodeVersionFile(where) {
  return (text, limits) => {
    const line = firstLine(text, limits);
    if (line === null) return [];
    return [declaration('node', where, line, keyed('node', singleVersion(line), true))];
  };
}

function readPythonVersion(text, limits) {
  const out = [];
  for (const raw of linesOf(text, limits)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    out.push(declaration('python', '.python-version', line, keyed('python', singleVersion(line), true)));
  }
  return out;
}

function readPyproject(text, limits) {
  let table = '';
  for (const line of linesOf(text, limits)) {
    const header = /^\s*\[{1,2}\s*([^\]]{1,200}?)\s*\]{1,2}\s*(?:#.*)?$/.exec(line);
    if (header) {
      table = header[1];
      continue;
    }
    if (table !== 'project') continue;
    const m = /^\s*requires-python\s*=\s*(?:"([^"\\]{0,200})"|'([^']{0,200})')\s*(?:#.*)?$/.exec(line);
    if (m) {
      const value = m[1] ?? m[2];
      return [declaration('python', 'requires-python', value, keyed('python', lowestPep440(value)), { range: true })];
    }
  }
  return [];
}

function readRuntimeTxt(text, limits) {
  const line = firstLine(text, limits);
  if (line === null) return [];
  if (!/^python-/i.test(line)) return [declaration('python', 'runtime.txt', line, { ok: false, reason: `${JSON.stringify(safeText(line, 40))} is not a python-VERSION line` })];
  return [declaration('python', 'runtime.txt', line, keyed('python', singleVersion(line, { prefix: /^python-/i }), true))];
}

function readGlobalJson(text) {
  const obj = parseJsonObject(stripJsonComments(text), 'sdk.version');
  const version = own(own(obj, 'sdk'), 'version');
  if (version === undefined) return [];
  const s = stringValue(version);
  if (s === null) return [declaration('dotnet', 'sdk.version', JSON.stringify(version) ?? String(version), { ok: false, reason: 'sdk.version is not a string' })];
  const r = parseSdkVersion(s);
  return [declaration('dotnet', 'sdk.version', s, r.ok ? { ...r, lowest: r.key } : r)];
}

function readCsproj(text, limits) {
  const body = stripXmlComments(text);
  const out = [];
  const re = /<TargetFrameworks?(?:\s[^>]{0,200})?>([^<]{0,500})<\/TargetFrameworks?>/gi;
  for (let m = re.exec(body); m !== null && out.length < limits.maxPerFile; m = re.exec(body)) {
    for (const part of m[1].split(';')) {
      const value = part.trim();
      if (value === '') continue;
      const r = parseTargetFramework(value);
      out.push(declaration('dotnet', 'TargetFramework', value, r.ok ? { ...r, lowest: r.key } : r));
      if (out.length >= limits.maxPerFile) break;
    }
  }
  return out;
}

function readPom(text, limits) {
  const body = stripXmlComments(text);
  const out = [];
  const re = /<(maven\.compiler\.release|maven\.compiler\.source|java\.version)>\s{0,20}([^<]{0,60}?)\s{0,20}<\/\1>/g;
  for (let m = re.exec(body); m !== null && out.length < limits.maxPerFile; m = re.exec(body)) {
    const r = parseJavaVersion(m[2]);
    out.push(declaration('java', m[1], m[2], r.ok ? { ...r, lowest: r.key } : r));
  }
  return out;
}

// The whole expression must be a version: 17, '1.8', "11", JavaVersion.VERSION_11 or JavaVersion.toVersion("17").
const GRADLE_VALUE = /^\s*(?:['"]?(\d{1,2}(?:\.\d{1,2})?)['"]?|JavaVersion\.VERSION_([0-9_]{1,6})|JavaVersion\.toVersion\(\s*['"]?(\d{1,2}(?:\.\d{1,2})?)['"]?\s*\))\s*;?\s*(?:\/\/.*)?$/;

function gradleValue(expression) {
  const m = GRADLE_VALUE.exec(expression);
  if (m) return parseJavaVersion(m[2] !== undefined ? `VERSION_${m[2]}` : (m[1] ?? m[3]));
  return { ok: false, reason: `${JSON.stringify(safeText(expression, 40))} is not a Java version the tool reads` };
}

function readGradle(text, limits) {
  const out = [];
  for (const raw of linesOf(text, limits)) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    let m = /\bsourceCompatibility\s{0,5}=?\s{0,5}(.{1,80})$/.exec(line);
    if (m) {
      const r = gradleValue(m[1]);
      out.push(declaration('java', 'sourceCompatibility', m[1].replace(/\s*\/\/.*$/, ''), r.ok ? { ...r, lowest: r.key } : r));
    }
    m = /\blanguageVersion(?:\.set\(|\s{0,5}=)\s{0,5}JavaLanguageVersion\.of\(\s{0,5}(\d{1,3})\s{0,5}\)/.exec(line);
    if (m) {
      const r = parseJavaVersion(m[1]);
      out.push(declaration('java', 'toolchain languageVersion', m[1], r.ok ? { ...r, lowest: r.key } : r));
    }
    if (out.length >= limits.maxPerFile) break;
  }
  return out;
}

function readComposer(text) {
  const json = parseJsonObject(text, 'require.php');
  const php = own(own(json, 'require'), 'php');
  if (php === undefined) return [];
  const s = stringValue(php);
  if (s === null) return [declaration('php', 'require.php', JSON.stringify(php) ?? String(php), { ok: false, reason: 'require.php is not a string' })];
  return [declaration('php', 'require.php', s, keyed('php', lowestNpm(s, { composer: true })), { range: true })];
}

function readGemfile(text, limits) {
  const out = [];
  for (const line of linesOf(text, limits)) {
    const m = /^\s*ruby\s+(.{1,300})$/.exec(line);
    if (!m) continue;
    const args = m[1];
    if (/^(?:file\s*:|:file\s*=>)/.test(args)) {
      out.push(declaration('ruby', 'ruby', args, { ok: false, reason: 'the ruby line reads the version from another file, which the tool reads only when it is .ruby-version in the folder' }));
      continue;
    }
    const cut = args.search(/,\s*(?::?engine|:?patchlevel|:?engine_version)\b/);
    const head = cut >= 0 ? args.slice(0, cut) : args;
    const list = [...head.matchAll(/["']([^"']{1,40})["']/g)].map((x) => x[1]);
    const found = lowestGem(list);
    out.push(declaration('ruby', 'ruby', head, keyed('ruby', found), { range: list.length > 1 || /^\s*(?:>=|>|~>|<=|<|!=)/.test(list[0] ?? '') }));
  }
  return out;
}

function readRubyVersion(text, limits) {
  const line = firstLine(text, limits);
  if (line === null) return [];
  return [declaration('ruby', '.ruby-version', line, keyed('ruby', singleVersion(line, { prefix: /^ruby-/i }), true))];
}

function readGoMod(text, limits) {
  const out = [];
  for (const raw of linesOf(text, limits)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    let m = /^go\s+(\S{1,40})$/.exec(line);
    if (m) {
      const r = parseGoVersion(m[1]);
      out.push(declaration('go', 'go directive', m[1], r.ok ? { ...r, lowest: r.key } : r, { range: true }));
      continue;
    }
    m = /^toolchain\s+(\S{1,40})$/.exec(line);
    if (m) {
      const r = /^go\d/.test(m[1]) ? parseGoVersion(m[1].slice(2).replace(/\+.*$/, '')) : { ok: false, reason: `${JSON.stringify(safeText(m[1], 40))} names no Go version` };
      out.push(declaration('go', 'toolchain', m[1], r.ok ? { ...r, lowest: r.key } : r));
    }
  }
  return out;
}

function readDockerfile(text, limits) {
  const out = [];
  const lines = linesOf(text, limits);
  for (let i = 0; i < lines.length && out.length < limits.maxPerFile; i += 1) {
    if (!/^\s*from\s/i.test(lines[i])) continue;
    const parsed = parseFromLine(lines[i]);
    if (!parsed) continue;
    const raw = parsed.tag === '' ? parsed.image : `${parsed.image}:${parsed.tag}`;
    const r = parsed.result;
    out.push(declaration(parsed.runtime, `FROM line ${i + 1}`, raw, r.ok ? { ...r, lowest: r.key } : r));
  }
  return out;
}

const READERS = {
  'package-json': readPackageJson,
  nvmrc: readNodeVersionFile('.nvmrc'),
  'node-version': readNodeVersionFile('.node-version'),
  'python-version': readPythonVersion,
  pyproject: readPyproject,
  'runtime-txt': readRuntimeTxt,
  'global-json': readGlobalJson,
  csproj: readCsproj,
  pom: readPom,
  gradle: readGradle,
  'gradle-kts': readGradle,
  composer: readComposer,
  gemfile: readGemfile,
  'ruby-version': readRubyVersion,
  'go-mod': readGoMod,
  dockerfile: readDockerfile
};

// Runs the reader of a kind on the text of a file. Returns the declarations (each with the file name added later).
export function readDeclarationsFromText(kind, text, limits = READ_LIMITS) {
  const reader = READERS[kind];
  if (!reader) throw new FileProblem(`has no reader (${kind})`);
  return reader(text, limits);
}

// Reads every file of the list ({ rel, abs, kind }) and returns { declarations, problems, filesRead, truncated }. A
// file that cannot be read is a problem with the reason; it never stops the run.
export async function readDeclarations(files, limits = READ_LIMITS) {
  const declarations = [];
  const problems = [];
  let filesRead = 0;
  let truncated = false;
  for (const file of files) {
    if (declarations.length >= limits.maxDeclarations) {
      truncated = true;
      break;
    }
    try {
      const text = await readTextFile(file.abs, limits);
      const found = readDeclarationsFromText(file.kind, text, limits);
      filesRead += 1;
      for (const d of found) {
        if (declarations.length >= limits.maxDeclarations) {
          truncated = true;
          break;
        }
        declarations.push({ ...d, file: file.rel });
      }
    } catch (error) {
      if (error instanceof FileProblem) problems.push({ file: file.rel, reason: error.message });
      else problems.push({ file: file.rel, reason: `could not be read (${safeText(error.code ?? error.message, 80)})` });
    }
  }
  return { declarations, problems, filesRead, truncated };
}
