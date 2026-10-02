// Reading a declared version, or a range of versions, as the lowest version that it allows. A project that says ">=18"
// allows 18, 20 and 22, and the oldest of them is the one that decides whether it is still supported, so that is the
// one the tool reports, and the message says that it is the lowest. Every function here takes a short string, works
// without regular expressions that can backtrack on long input, and returns { ok: true, ... } or { ok: false, reason }.
// Nothing is run, and nothing is looked up on the network.

import { safeText } from './rules.js';

export const MAX_VERSION_TEXT = 200;
const MAX_ALTERNATIVES = 100;
const MAX_COMPARATORS = 50;

const fail = (reason) => ({ ok: false, reason });
const pad3 = (parts) => [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];

export function compareTuples(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export const tupleText = (t, given = 3) => t.slice(0, Math.max(1, Math.min(3, given))).join('.');

const tooLong = (text) => String(text).length > MAX_VERSION_TEXT;
const quote = (text) => `"${safeText(text, 60)}"`;

// A version such as "18", "v18.2", "1.2.3-beta.1", "20.x", "*". parts holds the numbers up to the first wildcard.
const VERSION = /^v?(\d{1,6}|[xX*])(?:\.(\d{1,6}|[xX*]))?(?:\.(\d{1,6}|[xX*]))?(?:[-+][0-9A-Za-z.+-]{0,40})?$/;

function readVersion(text) {
  const m = VERSION.exec(text);
  if (!m) return null;
  const parts = [];
  for (const piece of [m[1], m[2], m[3]]) {
    if (piece === undefined || /^[xX*]$/.test(piece)) break;
    parts.push(Number(piece));
  }
  return { parts };
}

// The lower bound of one comparator, or null when it sets none (an upper limit, "not equal", or a wildcard).
function comparatorLower(op, version) {
  if (op === '<' || op === '<=' || op === '!=') return null;
  if (version.parts.length === 0) return null;
  if (op === '>' && version.parts.length < 3) {
    const parts = version.parts.slice();
    parts[parts.length - 1] += 1;
    return { tuple: pad3(parts), given: parts.length };
  }
  return { tuple: pad3(version.parts), given: version.parts.length };
}

const higher = (a, b) => (a === null ? b : b === null ? a : compareTuples(b.tuple, a.tuple) > 0 ? b : a);
const lower = (a, b) => (compareTuples(a.tuple, b.tuple) <= 0 ? a : b);

// npm and Composer ranges: "18", ">=18 <21", "^18.17 || ^20", "18.x", "14 - 18", "~7.4", ">=7.2.5". An "or" takes the lowest of
// its sides; the parts of one side that are joined by spaces or commas must all hold, so the highest of their lower
// bounds is the lowest that the side allows. composer: Composer also reads a single "|" as "or" and ignores "@dev" flags.
export function lowestNpm(text, { composer = false } = {}) {
  let source = String(text).trim();
  if (tooLong(source)) return fail(`the value is longer than ${MAX_VERSION_TEXT} characters`);
  if (composer) source = source.replace(/@[A-Za-z]{1,10}/g, '');
  if (source === '' || /^(?:\*|x|X|latest)$/.test(source)) return fail('the value allows any version, so there is no lowest version to read');
  const alternatives = composer ? source.split(/\|\|?/) : source.split('||');
  if (alternatives.length > MAX_ALTERNATIVES) return fail(`the range has more than ${MAX_ALTERNATIVES} alternatives`);
  let best = null;
  for (const raw of alternatives) {
    let side = raw.trim();
    if (side === '') return fail(`${quote(text)} has an empty alternative`);
    const hyphen = /^(\S{1,60})\s+-\s+(\S{1,60})$/.exec(side);
    if (hyphen) side = `>=${hyphen[1]} <=${hyphen[2]}`;
    side = side.replace(/(>=|<=|!=|~>|\^|~|>|<|=)\s+/g, '$1');
    const tokens = side.split(/[\s,]+/).filter((t) => t !== '');
    if (tokens.length === 0) return fail(`${quote(text)} has an empty alternative`);
    if (tokens.length > MAX_COMPARATORS) return fail(`one alternative has more than ${MAX_COMPARATORS} parts`);
    let sideLower = null;
    for (const token of tokens) {
      const m = /^(>=|<=|!=|~>|\^|~|>|<|=)?(.{0,60})$/.exec(token);
      const version = readVersion(m[2]);
      if (!version) return fail(`${quote(token)} is not a version or a range the tool reads`);
      sideLower = higher(sideLower, comparatorLower(m[1] ?? '', version));
    }
    if (sideLower === null) return fail('the value sets no lower limit, so there is no lowest version to read');
    best = best === null ? sideLower : lower(best, sideLower);
  }
  return { ok: true, tuple: best.tuple, given: best.given };
}

// Python (PEP 440) specifiers, as in requires-python: ">=3.8", ">=3.8,<4", "~=3.9", "==3.9.*", "!=3.9.1". All of them
// must hold, so the highest lower bound is the lowest allowed version.
export function lowestPep440(text) {
  const source = String(text).trim();
  if (tooLong(source)) return fail(`the value is longer than ${MAX_VERSION_TEXT} characters`);
  if (source === '') return fail('the value is empty');
  const specs = source.split(',');
  if (specs.length > MAX_COMPARATORS) return fail(`the value has more than ${MAX_COMPARATORS} parts`);
  let best = null;
  for (const raw of specs) {
    const m = /^(~=|===|==|!=|>=|<=|>|<)\s*v?(\d{1,6}(?:\.\d{1,6}){0,5})(\.\*)?([0-9A-Za-z.+-]{0,40})$/.exec(raw.trim());
    if (!m) return fail(`${quote(raw.trim())} is not a Python version specifier the tool reads`);
    const nums = m[2].split('.').map(Number);
    const op = m[1];
    if (op === '<' || op === '<=' || op === '!=') continue;
    best = higher(best, { tuple: pad3(nums), given: Math.min(3, nums.length) });
  }
  if (best === null) return fail('the value sets no lower limit, so there is no lowest version to read');
  return { ok: true, tuple: best.tuple, given: best.given };
}

// Ruby requirements, given as the list of strings of the Gemfile: [">= 2.7", "< 3.2"], ["~> 3.0"], ["3.1.2"].
export function lowestGem(list) {
  if (!Array.isArray(list) || list.length === 0) return fail('the ruby line names no version');
  if (list.length > MAX_COMPARATORS) return fail(`the ruby line has more than ${MAX_COMPARATORS} requirements`);
  let best = null;
  for (const raw of list) {
    const text = String(raw).trim();
    if (tooLong(text)) return fail(`a requirement is longer than ${MAX_VERSION_TEXT} characters`);
    const m = /^(=|!=|>=|<=|>|<|~>)?\s*(\d{1,6}(?:\.\d{1,6}){0,3})(\.?[A-Za-z][0-9A-Za-z.]{0,20})?$/.exec(text);
    if (!m) return fail(`${quote(text)} is not a Ruby version requirement the tool reads`);
    if (m[1] === '<' || m[1] === '<=' || m[1] === '!=') continue;
    const nums = m[2].split('.').map(Number);
    best = higher(best, { tuple: pad3(nums), given: Math.min(3, nums.length) });
  }
  if (best === null) return fail('the ruby line sets no lower limit, so there is no lowest version to read');
  return { ok: true, tuple: best.tuple, given: best.given };
}

// A single declared version, as in .nvmrc, .python-version, runtime.txt or a Docker tag: "v18.19.1", "3.11", "ruby-3.1.2".
// Words such as "lts/*", "system" or "latest" name no version.
export function singleVersion(text, { prefix = null } = {}) {
  let source = String(text).trim();
  if (tooLong(source)) return fail(`the value is longer than ${MAX_VERSION_TEXT} characters`);
  if (source === '') return fail('the value is empty');
  if (prefix) source = source.replace(prefix, '');
  const m = /^v?(\d{1,6})(?:\.(\d{1,6}))?(?:\.(\d{1,6}))?(?![0-9])/.exec(source);
  if (!m) return fail(`${quote(text)} names no version number`);
  const parts = [m[1], m[2], m[3]].filter((p) => p !== undefined).map(Number);
  return { ok: true, tuple: pad3(parts), given: parts.length };
}

// The key that the data is looked up by, from a lowest version. single: the value is one declared version and not a
// range, so a missing minor version (a "3" for Python) cannot be told from the newest one and is not guessed.
export function versionKey(runtime, found, { single = false } = {}) {
  if (!found.ok) return found;
  const [major, minor] = found.tuple;
  if (runtime === 'node') {
    if (major === 0) {
      if (found.given < 2) return fail('the version names only the major version 0');
      return { ok: true, key: `0.${minor}` };
    }
    return { ok: true, key: String(major) };
  }
  if (runtime === 'java') return { ok: true, key: String(major) };
  if (single && found.given < 2) return fail(`the value names only the major version ${major}, and the minor version decides the support dates`);
  return { ok: true, key: `${major}.${minor}` };
}

// .NET target framework monikers: net8.0, net6.0-windows, netcoreapp3.1, netstandard2.0, net48.
export function parseTargetFramework(text) {
  const t = String(text).trim().toLowerCase();
  if (t === '') return fail('the value is empty');
  if (tooLong(t)) return fail(`the value is longer than ${MAX_VERSION_TEXT} characters`);
  if (t.includes('$(') || t.includes('@(')) return fail(`${quote(text)} uses a build property, which the tool does not evaluate`);
  let m = /^net(\d{1,2})\.(\d{1,2})(?:-[a-z0-9.]{1,40})?$/.exec(t);
  if (m) {
    const major = Number(m[1]);
    if (major >= 5) return { ok: true, key: String(major) };
    return fail(`${quote(text)} is not a .NET moniker the tool reads`);
  }
  m = /^netcoreapp(\d)\.(\d)$/.exec(t);
  if (m) return { ok: true, key: `${m[1]}.${m[2]}` };
  if (/^netstandard\d\.\d$/.test(t)) return fail(`${quote(text)} is a .NET Standard version, which names no runtime and has no support date of its own on the saved pages`);
  if (/^net\d{2,3}$/.test(t)) return fail(`${quote(text)} is .NET Framework, which the saved pages do not cover`);
  return fail(`${quote(text)} is not a .NET moniker the tool reads`);
}

// The version of the SDK in global.json: "8.0.100", "3.1.426", "6.0.400-preview.1". The first part is the version of .NET.
export function parseSdkVersion(text) {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,6}(?:-[0-9A-Za-z.-]{0,40})?$/.exec(String(text).trim());
  if (!m) return fail(`${quote(text)} is not an SDK version the tool reads`);
  const major = Number(m[1]);
  return { ok: true, key: major >= 5 ? String(major) : `${m[1]}.${m[2]}` };
}

// Java: "17", "1.8", "11", "VERSION_17", "JavaVersion.VERSION_1_8", "JavaLanguageVersion.of(21)", "8u392", "17.0.9_9".
export function parseJavaVersion(text) {
  let t = String(text).trim();
  if (t === '') return fail('the value is empty');
  if (tooLong(t)) return fail(`the value is longer than ${MAX_VERSION_TEXT} characters`);
  if (t.includes('${') || t.includes('$(')) return fail(`${quote(text)} uses a property, which the tool does not evaluate`);
  t = t.replace(/^(?:JavaVersion\.)?VERSION_/, '').replace(/_/g, '.');
  let m = /^1\.(\d{1,2})(?![0-9])/.exec(t);
  if (m) return { ok: true, key: String(Number(m[1])) };
  m = /^(\d{1,3})(?![0-9])/.exec(t);
  if (m) return { ok: true, key: String(Number(m[1])) };
  return fail(`${quote(text)} names no Java version`);
}

// The directive of go.mod: "1.21", "1.21.0", "1.21rc1".
export function parseGoVersion(text) {
  const m = /^(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?(?:rc\d{1,3}|beta\d{1,3})?$/.exec(String(text).trim());
  if (!m || m[1] !== '1') return fail(`${quote(text)} is not a Go version the tool reads`);
  return { ok: true, key: `1.${Number(m[2])}` };
}

const DOCKER_RUNTIME = new Map([
  ['node', 'node'],
  ['python', 'python'],
  ['php', 'php'],
  ['ruby', 'ruby'],
  ['golang', 'go'],
  ['openjdk', 'java'],
  ['eclipse-temurin', 'java'],
  ['mcr.microsoft.com/dotnet/sdk', 'dotnet'],
  ['mcr.microsoft.com/dotnet/aspnet', 'dotnet'],
  ['mcr.microsoft.com/dotnet/runtime', 'dotnet'],
  ['mcr.microsoft.com/dotnet/runtime-deps', 'dotnet'],
  ['mcr.microsoft.com/dotnet/core/sdk', 'dotnet'],
  ['mcr.microsoft.com/dotnet/core/aspnet', 'dotnet'],
  ['mcr.microsoft.com/dotnet/core/runtime', 'dotnet']
]);

// A FROM line of a Dockerfile. Returns null when the image is not one of the images of the readers, or
// { runtime, image, tag, result } where result is { ok: true, key } or { ok: false, reason }. Only the tag is read.
export function parseFromLine(line) {
  const text = String(line).slice(0, 1000).trim();
  const m = /^from\s+(.*)$/i.exec(text);
  if (!m) return null;
  const words = m[1].split(/\s+/).filter((w) => w !== '' && !w.startsWith('--'));
  if (words.length === 0) return null;
  let ref = words[0].toLowerCase();
  let digest = false;
  const at = ref.indexOf('@');
  if (at >= 0) {
    ref = ref.slice(0, at);
    digest = true;
  }
  const slash = ref.lastIndexOf('/');
  const colon = ref.indexOf(':', slash + 1);
  const image = (colon >= 0 ? ref.slice(0, colon) : ref).replace(/^(?:index\.)?docker\.io\/(?:library\/)?/, '').replace(/^library\//, '');
  const tag = colon >= 0 ? ref.slice(colon + 1) : '';
  const runtime = DOCKER_RUNTIME.get(image);
  if (!runtime) return null;
  const shown = tag === '' ? image : `${image}:${tag}`;
  if (tag === '') return { runtime, image, tag, result: fail(digest ? `${quote(shown)} is pinned by digest and has no tag to read` : `${quote(shown)} has no tag, so it means the newest image`) };
  if (tag.includes('$') || tag.includes('{')) return { runtime, image, tag, result: fail(`${quote(shown)} uses a variable, which the tool does not evaluate`) };
  let found;
  if (runtime === 'java') {
    const u = /^(\d{1,2})u\d{1,4}(?![0-9])/.exec(tag);
    found = u ? { ok: true, tuple: [Number(u[1]), 0, 0], given: 1 } : singleVersion(tag);
  } else {
    found = singleVersion(tag);
  }
  if (!found.ok) return { runtime, image, tag, result: fail(`the tag of ${quote(shown)} names no version number`) };
  if (runtime === 'dotnet') {
    const [major, minor] = found.tuple;
    if (major >= 5) return { runtime, image, tag, result: { ok: true, key: String(major) } };
    if (found.given < 2) return { runtime, image, tag, result: fail(`the tag of ${quote(shown)} names only the major version ${major}, and the minor version decides the support dates`) };
    return { runtime, image, tag, result: { ok: true, key: `${major}.${minor}` } };
  }
  const key = versionKey(runtime, found, { single: true });
  return { runtime, image, tag, result: key.ok ? key : fail(`the tag of ${quote(shown)}: ${key.reason}`) };
}
