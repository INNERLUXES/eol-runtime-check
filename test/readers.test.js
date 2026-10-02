import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FileProblem, INPUTS, READ_LIMITS, classify, decodeText, readDeclarations, readDeclarationsFromText, readTextFile, stripJsonComments, stripXmlComments } from '../src/index.js';
import { withFiles } from './helpers.js';

const read = (kind, text) => readDeclarationsFromText(kind, text);
const keys = (list) => list.map((d) => `${d.runtime}:${d.key}`);

test('package.json: engines.node is read as a range and reported by its lowest version', () => {
  const [d] = read('package-json', '{"name":"x","engines":{"node":">=18 <22","npm":">=9"}}');
  assert.equal(d.runtime, 'node');
  assert.equal(d.key, '18');
  assert.equal(d.where, 'engines.node');
  assert.equal(d.raw, '>=18 <22');
  assert.equal(d.range, true);
  assert.equal(d.lowest, '18');
});

test('package.json: no engines, engines without node, an array and a number give no declaration or an unreadable one', () => {
  assert.deepEqual(read('package-json', '{"name":"x"}'), []);
  assert.deepEqual(read('package-json', '{"engines":{"npm":"9"}}'), []);
  assert.deepEqual(read('package-json', '{"engines":["node"]}'), []);
  const [n] = read('package-json', '{"engines":{"node":18}}');
  assert.equal(n.key, null);
  assert.match(n.reason, /not a string/);
  const [any] = read('package-json', '{"engines":{"node":"*"}}');
  assert.equal(any.key, null);
  assert.match(any.reason, /any version/);
});

test('package.json: text that is not JSON, or not an object, is a problem with the file and not a guess', () => {
  assert.throws(() => read('package-json', '{"engines":'), FileProblem);
  assert.throws(() => read('package-json', '[1,2]'), (e) => e instanceof FileProblem && /not a JSON object/.test(e.message));
  assert.throws(() => read('package-json', 'null'), FileProblem);
  assert.throws(() => read('package-json', ''), FileProblem);
  assert.throws(() => read('package-json', `${'['.repeat(200000)}`), FileProblem);
});

test('package.json: a key named __proto__ or constructor is only a key', () => {
  assert.deepEqual(read('package-json', '{"__proto__":{"engines":{"node":">=10"}}}'), []);
  assert.deepEqual(read('package-json', '{"constructor":{"engines":{"node":">=10"}}}'), []);
  assert.deepEqual(keys(read('package-json', '{"engines":{"__proto__":1,"node":"20"}}')), ['node:20']);
  assert.deepEqual(keys(read('package-json', '{"engines":{"node":"16","node":"20"}}')), ['node:20']);
});

test('.nvmrc and .node-version: the first line is one version, a comment and blank lines are skipped', () => {
  assert.deepEqual(keys(read('nvmrc', 'v18.19.1\n')), ['node:18']);
  assert.deepEqual(keys(read('nvmrc', '\n\n# the version\n20\n22\n')), ['node:20']);
  assert.deepEqual(keys(read('nvmrc', '20 # lts')), ['node:20']);
  assert.deepEqual(keys(read('node-version', '16.20.2\r\n')), ['node:16']);
  assert.deepEqual(read('nvmrc', ''), []);
  assert.deepEqual(read('nvmrc', '# nothing\n'), []);
});

test('.nvmrc: a name that is not a version number is reported as unreadable with the reason', () => {
  for (const text of ['lts/*', 'lts/iron', 'node', 'stable', 'system']) {
    const [d] = read('nvmrc', text);
    assert.equal(d.key, null, text);
    assert.match(d.reason, /names no version number/, text);
  }
});

test('.python-version: every line is a version, and a major version alone is not guessed', () => {
  assert.deepEqual(keys(read('python-version', '3.11.4\n3.9\n')), ['python:3.11', 'python:3.9']);
  assert.deepEqual(keys(read('python-version', '# comment\n3.12\n\n')), ['python:3.12']);
  const [major, pypy, system] = read('python-version', '3\npypy3.9-7.3\nsystem\n');
  assert.match(major.reason, /only the major version 3/);
  assert.match(pypy.reason, /names no version number/);
  assert.match(system.reason, /names no version number/);
});

test('pyproject.toml: requires-python is read in the [project] table only', () => {
  const [d] = read('pyproject', '[build-system]\nrequires = ["x"]\n\n[project]\nname = "x"\nrequires-python = ">=3.9,<4"\n');
  assert.equal(d.key, '3.9');
  assert.equal(d.where, 'requires-python');
  assert.equal(d.range, true);
  assert.deepEqual(keys(read('pyproject', "[project]\nrequires-python = '~=3.10'  # comment\n")), ['python:3.10']);
  assert.deepEqual(read('pyproject', '[tool.other]\nrequires-python = ">=3.6"\n'), []);
  assert.deepEqual(read('pyproject', '[project]\nname = "x"\n[tool.x]\nrequires-python = ">=3.6"\n'), []);
  assert.deepEqual(read('pyproject', 'requires-python = ">=3.6"\n'), []);
  assert.deepEqual(read('pyproject', '[ project ]\nrequires-python=">=3.7"\n').length, 1);
});

test('pyproject.toml: a value that is not a Python specifier is unreadable, and a multi-line or unquoted value is not read', () => {
  const [d] = read('pyproject', '[project]\nrequires-python = "three"\n');
  assert.equal(d.key, null);
  assert.match(d.reason, /not a Python version specifier/);
  assert.deepEqual(read('pyproject', '[project]\nrequires-python = 3.9\n'), []);
  assert.deepEqual(read('pyproject', '[project]\nrequires-python = """\n>=3.9"""\n'), []);
});

test('runtime.txt: python-3.9.7 is Python 3.9, and any other line is unreadable', () => {
  assert.deepEqual(keys(read('runtime-txt', 'python-3.9.7\n')), ['python:3.9']);
  assert.deepEqual(keys(read('runtime-txt', 'Python-3.11.4')), ['python:3.11']);
  const [d] = read('runtime-txt', 'pypy-3.9');
  assert.equal(d.key, null);
  assert.match(d.reason, /python-VERSION/);
  assert.deepEqual(read('runtime-txt', '\n'), []);
});

test('global.json: sdk.version gives the version of .NET, and comments are allowed in the file', () => {
  assert.deepEqual(keys(read('global-json', '{"sdk":{"version":"8.0.100","rollForward":"latestFeature"}}')), ['dotnet:8']);
  assert.deepEqual(keys(read('global-json', '{\n // the SDK\n "sdk": { "version": "3.1.426" /* old */ }\n}')), ['dotnet:3.1']);
  assert.deepEqual(read('global-json', '{"tools":{}}'), []);
  assert.deepEqual(read('global-json', '{"sdk":{"rollForward":"major"}}'), []);
  assert.equal(read('global-json', '{"sdk":{"version":8}}')[0].key, null);
  assert.equal(read('global-json', '{"sdk":{"version":"latest"}}')[0].key, null);
  assert.throws(() => read('global-json', '{"sdk":'), FileProblem);
});

test('.csproj: TargetFramework and TargetFrameworks are read, each target by itself', () => {
  const list = read('csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFrameworks>net6.0;netstandard2.0; net48 </TargetFrameworks></PropertyGroup></Project>');
  assert.deepEqual(list.map((d) => d.raw), ['net6.0', 'netstandard2.0', 'net48']);
  assert.deepEqual(list.map((d) => d.key), ['6', null, null]);
  assert.deepEqual(keys(read('csproj', '<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>')), ['dotnet:8']);
  assert.deepEqual(keys(read('csproj', '<TargetFramework Condition="\'$(X)\'==\'1\'">netcoreapp3.1</TargetFramework>')), ['dotnet:3.1']);
  assert.deepEqual(keys(read('csproj', '<targetframework>net7.0</targetframework>')), ['dotnet:7']);
  assert.deepEqual(read('csproj', '<Project><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>'), []);
});

test('.csproj: a commented-out target is not read, a build property is not evaluated, and the old TargetFrameworkVersion is not read', () => {
  assert.deepEqual(read('csproj', '<!-- <TargetFramework>net5.0</TargetFramework> --><TargetFramework>net8.0</TargetFramework>').map((d) => d.raw), ['net8.0']);
  const [d] = read('csproj', '<TargetFramework>$(Tfm)</TargetFramework>');
  assert.equal(d.key, null);
  assert.match(d.reason, /does not evaluate/);
  assert.deepEqual(read('csproj', '<TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>'), []);
});

test('pom.xml: the release, the source and java.version are read, and 1.8 is Java 8', () => {
  const list = read('pom', '<properties><maven.compiler.release>17</maven.compiler.release><maven.compiler.source>1.8</maven.compiler.source><java.version> 11 </java.version><maven.compiler.target>8</maven.compiler.target></properties>');
  assert.deepEqual(list.map((d) => [d.where, d.key]), [['maven.compiler.release', '17'], ['maven.compiler.source', '8'], ['java.version', '11']]);
  assert.deepEqual(read('pom', '<project></project>'), []);
});

test('pom.xml: a commented-out property is not read, and a property reference is not evaluated', () => {
  assert.deepEqual(read('pom', '<!-- <java.version>8</java.version> --><java.version>21</java.version>').map((d) => d.key), ['21']);
  const [d] = read('pom', '<maven.compiler.release>${jdk.level}</maven.compiler.release>');
  assert.equal(d.key, null);
  assert.match(d.reason, /does not evaluate/);
});

test('build.gradle and build.gradle.kts: sourceCompatibility and the toolchain language version', () => {
  const groovy = read('gradle', "plugins { id 'java' }\nsourceCompatibility = '1.8'\ntargetCompatibility = 8\njava {\n  toolchain {\n    languageVersion = JavaLanguageVersion.of(17)\n  }\n}\n");
  assert.deepEqual(groovy.map((d) => [d.where, d.key]), [['sourceCompatibility', '8'], ['toolchain languageVersion', '17']]);
  const kts = read('gradle-kts', 'java {\n  sourceCompatibility = JavaVersion.VERSION_11\n  toolchain { languageVersion.set(JavaLanguageVersion.of(21)) }\n}\n');
  assert.deepEqual(kts.map((d) => [d.where, d.key]), [['sourceCompatibility', '11'], ['toolchain languageVersion', '21']]);
  assert.deepEqual(read('gradle', 'sourceCompatibility JavaVersion.VERSION_1_8\n').map((d) => d.key), ['8']);
  assert.deepEqual(read('gradle', 'sourceCompatibility = JavaVersion.toVersion("17") // comment\n').map((d) => d.key), ['17']);
});

test('build.gradle: a comment line is not read, and an expression that is not a version is unreadable and not guessed', () => {
  assert.deepEqual(read('gradle', "// sourceCompatibility = '1.7'\n/* sourceCompatibility = 6 */\n * sourceCompatibility = 5\n"), []);
  const [d] = read('gradle', "sourceCompatibility = project.property('java11')\n");
  assert.equal(d.key, null);
  assert.match(d.reason, /not a Java version the tool reads/);
});

test('composer.json: require.php is a range and is reported by its lowest version', () => {
  const [d] = read('composer', '{"require":{"php":"^7.4 || ^8.0","ext-json":"*"},"require-dev":{"php":"^5.6"}}');
  assert.equal(d.key, '7.4');
  assert.equal(d.range, true);
  assert.deepEqual(read('composer', '{"require":{"monolog/monolog":"^2"}}'), []);
  assert.deepEqual(read('composer', '{}'), []);
  assert.equal(read('composer', '{"require":{"php":7}}')[0].key, null);
  assert.throws(() => read('composer', 'not json'), FileProblem);
});

test('Gemfile: the ruby line is read, with one or several requirements', () => {
  assert.deepEqual(keys(read('gemfile', "source 'https://rubygems.org'\nruby '3.1.2'\ngem 'rails'\n")), ['ruby:3.1']);
  assert.deepEqual(keys(read('gemfile', 'ruby ">= 2.7", "< 3.2"\n')), ['ruby:2.7']);
  assert.deepEqual(keys(read('gemfile', 'ruby "~> 3.0"\n')), ['ruby:3.0']);
  assert.deepEqual(keys(read('gemfile', "  ruby '2.7.8', engine: 'jruby', engine_version: '9.3'\n")), ['ruby:2.7']);
  assert.equal(read('gemfile', "ruby '3.1.2'")[0].range, false);
  assert.equal(read('gemfile', 'ruby ">= 2.7"')[0].range, true);
});

test('Gemfile: a comment, another word that starts with ruby and a version read from a file are handled', () => {
  assert.deepEqual(read('gemfile', "# ruby '2.0.0'\nruby_dep = 1\ngem 'rubyzip'\n"), []);
  const [d] = read('gemfile', 'ruby file: ".ruby-version"\n');
  assert.equal(d.key, null);
  assert.match(d.reason, /another file/);
  assert.equal(read('gemfile', "ruby 'three'\n")[0].key, null);
});

test('.ruby-version: one version, with or without the ruby- prefix', () => {
  assert.deepEqual(keys(read('ruby-version', '3.1.2\n')), ['ruby:3.1']);
  assert.deepEqual(keys(read('ruby-version', 'ruby-3.2.0\n')), ['ruby:3.2']);
  assert.match(read('ruby-version', 'jruby-9.4.0.0\n')[0].reason, /names no version number/);
  assert.match(read('ruby-version', '3\n')[0].reason, /only the major version 3/);
});

test('go.mod: the go directive and the toolchain line, and nothing from the require lines', () => {
  const list = read('go-mod', 'module example.com/x\n\ngo 1.21.0\n\ntoolchain go1.22.1\n\nrequire (\n\tgolang.org/x/text v0.3.0\n\tgo.uber.org/zap v1.0.0\n)\n');
  assert.deepEqual(list.map((d) => [d.where, d.key]), [['go directive', '1.21'], ['toolchain', '1.22']]);
  assert.deepEqual(keys(read('go-mod', 'go 1.19 // minimum\n')), ['go:1.19']);
  assert.deepEqual(keys(read('go-mod', 'go\t1.20\r\n')), ['go:1.20']);
  assert.equal(read('go-mod', 'toolchain default\n')[0].key, null);
  assert.equal(read('go-mod', 'go 1\n')[0].key, null);
  assert.deepEqual(read('go-mod', 'module x\n'), []);
});

test('Dockerfile: every FROM line of an image of a runtime is read, with its line number', () => {
  const list = read('dockerfile', 'FROM node:18-alpine AS build\nRUN npm ci\n\nFROM php:7.4-apache\nfrom python:3.9-slim\nFROM base AS final\n');
  assert.deepEqual(list.map((d) => [d.where, d.runtime, d.key]), [['FROM line 1', 'node', '18'], ['FROM line 4', 'php', '7.4'], ['FROM line 5', 'python', '3.9']]);
  assert.deepEqual(list.map((d) => d.raw), ['node:18-alpine', 'php:7.4-apache', 'python:3.9-slim']);
  assert.deepEqual(read('dockerfile', 'FROM node:18\r\nFROM node:20\r\n').map((d) => d.key), ['18', '20']);
  assert.equal(read('dockerfile', 'FROM node\n')[0].key, null);
});

test('inputs: each name is sorted to its reader, in any case, and a name that only looks alike is not read', () => {
  const table = [
    ['package.json', 'package-json'], ['Package.JSON', 'package-json'], ['.nvmrc', 'nvmrc'], ['.node-version', 'node-version'],
    ['.python-version', 'python-version'], ['pyproject.toml', 'pyproject'], ['runtime.txt', 'runtime-txt'], ['global.json', 'global-json'],
    ['Ledger.csproj', 'csproj'], ['LEDGER.CSPROJ', 'csproj'], ['pom.xml', 'pom'], ['build.gradle', 'gradle'], ['build.gradle.kts', 'gradle-kts'],
    ['composer.json', 'composer'], ['Gemfile', 'gemfile'], ['.ruby-version', 'ruby-version'], ['go.mod', 'go-mod'],
    ['Dockerfile', 'dockerfile'], ['dockerfile', 'dockerfile'], ['Dockerfile.dev', 'dockerfile'], ['web.Dockerfile', 'dockerfile']
  ];
  for (const [name, kind] of table) assert.equal(classify(name), kind, name);
  for (const name of ['.csproj', '.Dockerfile', 'Dockerfile~', 'package.json.bak', 'package-lock.json', 'composer.lock', 'Gemfile.lock', 'go.sum', 'readme.md', 'tsconfig.json', 'app.vbproj', 'x.fsproj', '']) assert.equal(classify(name), null, name);
  assert.equal(INPUTS.length, 16);
});

test('text: a byte order mark is removed, and UTF-16, a control byte and bad UTF-8 are refused', () => {
  assert.equal(decodeText(Buffer.from([0xef, 0xbb, 0xbf, 0x31, 0x38])), '18');
  assert.equal(decodeText(Buffer.from('18\r\n\t')), '18\r\n\t');
  assert.throws(() => decodeText(Buffer.from([0xff, 0xfe, 0x31, 0x00])), (e) => e instanceof FileProblem && /UTF-16/.test(e.message));
  assert.throws(() => decodeText(Buffer.from([0xfe, 0xff, 0x00, 0x31])), FileProblem);
  assert.throws(() => decodeText(Buffer.from([0x31, 0x00, 0x32])), (e) => /not text: it holds the byte 0x00 at offset 1/.test(e.message));
  assert.throws(() => decodeText(Buffer.from([0x31, 0x1b, 0x32])), FileProblem);
  assert.throws(() => decodeText(Buffer.from([0x31, 0xc3, 0x28])), /not valid UTF-8/);
});

test('comments: XML and JSON comments are removed in one pass, and a string that looks like a comment is kept', () => {
  assert.equal(stripXmlComments('a<!-- x -->b<!--y-->c'), 'abc');
  assert.equal(stripXmlComments('a<!-- never closed'), 'a');
  assert.equal(stripXmlComments('no comment'), 'no comment');
  assert.equal(stripJsonComments('{"a":"//not","b":1 // c\n}'), '{"a":"//not","b":1 \n}');
  assert.equal(stripJsonComments('{/* x */"a":1}'), '{"a":1}');
  assert.equal(stripJsonComments('{"a":"q\\"//still"}'), '{"a":"q\\"//still"}');
  assert.equal(stripJsonComments('1 /* open'), '1 ');
});

test('files: a regular file is read whole, and one over the size limit is refused before it is read', async () => {
  await withFiles({ 'a.txt': 'hello\n', 'big.txt': 'x'.repeat(100) }, async (dir) => {
    assert.equal(await readTextFile(resolve(dir, 'a.txt')), 'hello\n');
    await assert.rejects(readTextFile(resolve(dir, 'big.txt'), { ...READ_LIMITS, maxFileBytes: 99 }), (e) => e instanceof FileProblem && /is 100 bytes, over the 99 bytes limit/.test(e.message));
    assert.equal((await readTextFile(resolve(dir, 'big.txt'), { ...READ_LIMITS, maxFileBytes: 100 })).length, 100);
    await assert.rejects(readTextFile(resolve(dir, 'missing.txt')), (e) => e instanceof FileProblem && /cannot be read \(ENOENT\)/.test(e.message));
  });
});

test('files: a folder is not read as a file', async () => {
  await withFiles({ 'sub/a.txt': 'x' }, async (dir) => {
    await assert.rejects(readTextFile(resolve(dir, 'sub')), FileProblem);
  });
});

test('files: a symbolic link is not followed (on systems that open a link with the no-follow flag)', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no no-follow flag for open, and creating links needs a privilege');
    return;
  }
  await withFiles({ 'real.txt': 'secret\n' }, async (dir) => {
    await symlink(resolve(dir, 'real.txt'), resolve(dir, 'link.txt'));
    await assert.rejects(readTextFile(resolve(dir, 'link.txt')), (e) => e instanceof FileProblem && /symbolic link/.test(e.message));
  });
});

test('files: readDeclarations collects the declarations of every file, names the file of each, and reports a file it cannot read', async () => {
  await withFiles({ 'package.json': '{"engines":{"node":"18"}}', 'bad/package.json': '{', 'ok/.nvmrc': '20\n', 'bin.bin': 'x' }, async (dir) => {
    const files = [
      { rel: 'package.json', abs: resolve(dir, 'package.json'), kind: 'package-json' },
      { rel: 'bad/package.json', abs: resolve(dir, 'bad/package.json'), kind: 'package-json' },
      { rel: 'ok/.nvmrc', abs: resolve(dir, 'ok/.nvmrc'), kind: 'nvmrc' },
      { rel: 'gone/.nvmrc', abs: resolve(dir, 'gone/.nvmrc'), kind: 'nvmrc' }
    ];
    const r = await readDeclarations(files);
    assert.deepEqual(r.declarations.map((d) => [d.file, d.key]), [['package.json', '18'], ['ok/.nvmrc', '20']]);
    assert.deepEqual(r.problems.map((p) => p.file), ['bad/package.json', 'gone/.nvmrc']);
    assert.equal(r.filesRead, 2);
    assert.equal(r.truncated, false);
  });
});

test('files: readDeclarations stops at the limit of declarations and says so', async () => {
  await withFiles({ 'a/.nvmrc': '18\n', 'b/.nvmrc': '20\n', 'c/.nvmrc': '22\n' }, async (dir) => {
    const files = ['a', 'b', 'c'].map((n) => ({ rel: `${n}/.nvmrc`, abs: resolve(dir, n, '.nvmrc'), kind: 'nvmrc' }));
    const r = await readDeclarations(files, { ...READ_LIMITS, maxDeclarations: 2 });
    assert.equal(r.declarations.length, 2);
    assert.equal(r.truncated, true);
    await writeFile(resolve(dir, 'unused'), '');
  });
});
