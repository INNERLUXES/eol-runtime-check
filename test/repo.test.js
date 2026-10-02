import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTS, FINDINGS, INPUTS, NOTES, SOURCES, main } from '../src/index.js';
import { TODAY } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/application/modernization';

async function markdownFiles() {
  const docs = (await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`);
  return ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', ...docs];
}

async function runTool(args) {
  let out = '';
  const code = await main(args, { out: (t) => { out += t; }, err: () => {} }, root);
  return { code, out };
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'eol-runtime-check');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['eol-runtime-check'], 'bin/eol-runtime-check.js');
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  assert.ok(pkg.files.includes('research') && pkg.files.includes('docs'));
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
});

test('README: the closing Background section links to the modernization page with the agreed anchor text', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[legacy application modernization services](${HOMEPAGE})`));
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README and documents: no date and no year anywhere', async () => {
  for (const file of await markdownFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d/, file);
    assert.doesNotMatch(text, /\b\d{4}-\d{2}-\d{2}\b/, file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.doesNotMatch(text, /within\s+\d|\bSLA\b|business days|hours|within a (?:day|week)|\bdays\b|\bweeks\b|\bpromptly\b|\bquickly\b/i);
});

test('the documents carry no company numbers and no promise', async () => {
  for (const file of await markdownFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, /\b\d[\d,]*\+? (?:clients|customers|projects|engineers|developers)\b/i, file);
    assert.doesNotMatch(text, /\bguarantee[sd]?\b/i, file);
  }
});

test('workflows: every action is pinned to a commit, the CI runs three systems and two Node versions, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --format markdown >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  assert.match(ci, /npm run check/);
  assert.match(ci, /npm run example/);
  assert.match(ci, /git diff --exit-code -- examples/);
});

test('workflows: the pinned commits are the ones that the sibling repositories use', async () => {
  const known = new Set([
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
    'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    'github/codeql-action/init@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
    'github/codeql-action/analyze@2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2',
    'actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8'
  ]);
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    for (const m of text.matchAll(/^\s*- uses: (\S+)/gm)) assert.ok(known.has(m[1]), `${name}: ${m[1]}`);
  }
  assert.match(await read('.github/workflows/ci.yml'), /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  for (const m of (await read('README.md')).matchAll(/uses: (\S+)/g)) assert.ok(known.has(m[1]), `README: ${m[1]}`);
});

test('release workflow: a tgz, a CycloneDX SBOM and SHA256SUMS named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/eol-runtime-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.doesNotMatch(release, /focus-cost-check/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/workflows/codeql.yml'), /security-extended/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/CODEOWNERS'), /^\/src\/lifecycle\.js @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  assert.match(await read('.github/pull_request_template.md'), /process\.platform/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^examples\/output\/\*\.csv -text$/m);
});

test('the repository names no other project except its neighbour', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md']) {
    const text = await read(file);
    assert.doesNotMatch(text, /sql-migration-check|openapi-security-check|desktop-release-check|pwa-offline-check|k8s-manifest-check|lockfile-check|requirements-check|security-headers-check|focus-cost-check|tfplan-risk-check/i, file);
  }
});

test('docs: every finding id of the tool is described in docs/method.md, in the README table and in the changelog', async () => {
  const method = await read('docs/method.md');
  const readme = await read('README.md');
  const changelog = await read('CHANGELOG.md');
  for (const f of FINDINGS) {
    assert.ok(method.includes(`### \`${f.id}\``), `docs/method.md heading: ${f.id}`);
    assert.ok(readme.includes(`| \`${f.id}\` |`), `README: ${f.id}`);
    assert.ok(changelog.includes(`\`${f.id}\``), `CHANGELOG: ${f.id}`);
  }
});

test('docs: every file the tool reads is named in docs/inputs.md and in the README', async () => {
  const inputs = await read('docs/inputs.md');
  const readme = await read('README.md');
  for (const input of INPUTS) {
    assert.ok(inputs.includes(`\`${input.match}\``) || input.match.split(', ').every((m) => inputs.includes(`\`${m}\``)), `docs/inputs.md: ${input.match}`);
    assert.ok(readme.includes(input.match.split(', ')[0]), `README: ${input.match}`);
  }
});

test('docs: docs/rules-and-sources.md lists every saved page with its address and file, and every quoted sentence', async () => {
  const rules = await read('docs/rules-and-sources.md');
  for (const s of SOURCES) {
    assert.ok(rules.includes(s.url), s.url);
    assert.ok(rules.includes(`research/sources/${s.file}`), s.file);
  }
  for (const fact of [...Object.values(FACTS), ...Object.values(NOTES)]) assert.ok(rules.includes(fact.text), fact.text);
});

test('examples: the legacy folder fails and the modernized copy passes with --fail-on warning, on the same report date', async () => {
  const legacy = await runTool(['examples/billing-legacy', '--today', TODAY, '--no-dates', '--fail-on', 'warning']);
  assert.equal(legacy.code, 1);
  assert.match(legacy.out, /findings: 4 error, 1 warning, 2 info/);
  for (const subject of ['Node.js 18', 'Python 3.8', '.NET 6', 'PHP 7.4']) assert.ok(legacy.out.includes(`runtime-past-support  ${subject}\n`), subject);
  assert.ok(legacy.out.includes('runtime-ending-soon  Node.js 20\n'));
  const modern = await runTool(['examples/billing-modernized', '--today', TODAY, '--no-dates', '--fail-on', 'warning']);
  assert.equal(modern.code, 0);
  assert.match(modern.out, /findings: 0 error, 0 warning, 6 info/);
  assert.ok(modern.out.endsWith('GATE: PASS (--fail-on warning)\n'));
  assert.equal((await runTool(['examples/billing-legacy', '--today', TODAY, '--no-dates'])).code, 1);
});

test('examples: the output files in the repository are what the tool prints today, and the README shows the same runs', async () => {
  const args = ['examples/billing-legacy', '--fail-on', 'warning', '--today', TODAY, '--no-dates'];
  const readme = (await read('README.md')).replaceAll(String.fromCharCode(13), '');
  const text = await runTool(args);
  assert.equal(await read('examples/output/billing-legacy.txt'), text.out);
  assert.ok(readme.includes(text.out), 'README shows the legacy run');
  for (const [format, name] of [['markdown', 'billing-legacy.md'], ['json', 'billing-legacy.json'], ['csv', 'billing-legacy.csv']]) {
    assert.equal(await read(`examples/output/${name}`), (await runTool([...args, '--format', format])).out, name);
  }
  const modern = await runTool(['examples/billing-modernized', '--fail-on', 'warning', '--today', TODAY, '--no-dates']);
  assert.ok(readme.includes(modern.out), 'README shows the modernized run');
  assert.equal(await read('examples/output/billing-legacy-with-dates.txt'), (await runTool(['examples/billing-legacy', '--fail-on', 'warning', '--today', TODAY])).out);
});

test('examples: the README output holds no calendar year, and the output with dates is the only output that has one', async () => {
  const readme = await read('README.md');
  assert.doesNotMatch(readme, /\b(?:19|20)\d{2}\b/);
  for (const name of ['billing-legacy.txt', 'billing-legacy.md', 'billing-legacy.json', 'billing-legacy.csv']) assert.doesNotMatch(await read(`examples/output/${name}`), /\b(?:19|20)\d{2}\b/, name);
  assert.match(await read('examples/output/billing-legacy-with-dates.txt'), /\(on 2025-04-30\)/);
});

test('tests: a test file that makes a link, names a drive or writes a backslash in a path guards it with process.platform', async () => {
  const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.js'));
  let guarded = 0;
  for (const f of files) {
    const text = await read(`test/${f}`);
    if (/symlink\(|[A-Z]:\\\\|\\\\[a-z]+\/package\.json/.test(text.replace(/\/\/.*$/gm, ''))) {
      assert.match(text, /process\.platform/, `${f} uses a link, a backslash or a drive name`);
      guarded += 1;
    }
  }
  assert.ok(guarded >= 3);
});

test('tests: no test names a fixed absolute path, a home folder or a temporary folder of one system', async () => {
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.js'))) {
    const text = await read(`test/${f}`);
    assert.doesNotMatch(text, /['"`]\/(?:tmp|home|Users|var|etc)\//, f);
    assert.doesNotMatch(text.replace(/['"]C:\\\\data\\\\projects\\\\billing['"]/, ''), /['"`][A-Z]:[\\/]/, f);
  }
});

test('the repository holds no token-shaped text', async () => {
  const names = [];
  async function walk(dir) {
    for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      const rel = dir === '.' ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(rel);
      else names.push(rel);
    }
  }
  await walk('.');
  const token = new RegExp(`\\b(?:${['gh', '[pous]_'].join('')}|${['github', 'pat_'].join('_')}|${['AK', 'IA'].join('')})[A-Za-z0-9_]{12,}`);
  for (const rel of names) {
    const text = await read(rel);
    assert.doesNotMatch(text, token, rel);
  }
  assert.ok(names.length > 60);
});
