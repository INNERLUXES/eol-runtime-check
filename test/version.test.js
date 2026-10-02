import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VERSION_TEXT, compareTuples, lowestGem, lowestNpm, lowestPep440, parseFromLine, parseGoVersion, parseJavaVersion, parseSdkVersion, parseTargetFramework, singleVersion, tupleText, versionKey } from '../src/index.js';

const tuple = (r) => (r.ok ? `${r.tuple.join('.')}/${r.given}` : `fail:${r.reason}`);
const failed = (r) => assert.equal(r.ok, false, JSON.stringify(r));

test('npm ranges: the lowest version that a range allows', () => {
  const table = [
    ['>=18', '18.0.0/1'],
    ['>=18.17', '18.17.0/2'],
    ['>=18.17.1', '18.17.1/3'],
    ['^18.17.0 || ^20', '18.17.0/3'],
    ['^20 || ^18', '18.0.0/1'],
    ['>=14 <21', '14.0.0/1'],
    ['>= 14 < 21', '14.0.0/1'],
    ['18.x', '18.0.0/1'],
    ['18.2.x', '18.2.0/2'],
    ['~16.13', '16.13.0/2'],
    ['^0.10', '0.10.0/2'],
    ['14 - 18', '14.0.0/1'],
    ['v18.19.1', '18.19.1/3'],
    ['=20', '20.0.0/1'],
    ['20', '20.0.0/1'],
    ['>18', '19.0.0/1'],
    ['>18.2', '18.3.0/2'],
    ['>18.2.1', '18.2.1/3'],
    ['>=16 >=18', '18.0.0/1'],
    ['>=18.0.0-0', '18.0.0/3']
  ];
  for (const [text, expected] of table) assert.equal(tuple(lowestNpm(text)), expected, text);
});

test('npm ranges: a range with no lower limit, a wildcard or a word has no lowest version, and the reason says so', () => {
  for (const text of ['*', 'x', '', '  ', 'latest', '<=20', '<21', '!=18', '>=*', 'lts/*', 'lts/iron', 'node', '^', '>=', 'abc', '18..2', '1.2.3.4', '||', '>=18 ||', '999999999']) failed(lowestNpm(text));
  assert.match(lowestNpm('*').reason, /any version/);
  assert.match(lowestNpm('<=20').reason, /no lower limit/);
  assert.match(lowestNpm('lts/*').reason, /not a version or a range/);
});

test('npm ranges: a composer constraint reads a single bar as "or", a comma as "and", and ignores a stability flag', () => {
  assert.equal(tuple(lowestNpm('^7.4|^8.0', { composer: true })), '7.4.0/2');
  assert.equal(tuple(lowestNpm('>=7.2.5,<8', { composer: true })), '7.2.5/3');
  assert.equal(tuple(lowestNpm('7.4.*', { composer: true })), '7.4.0/2');
  assert.equal(tuple(lowestNpm('~8.0.0', { composer: true })), '8.0.0/3');
  assert.equal(tuple(lowestNpm('>=8.1@dev', { composer: true })), '8.1.0/2');
  assert.equal(tuple(lowestNpm('^8.1 || ^7.4', { composer: true })), '7.4.0/2');
});

test('npm ranges: a value longer than the limit, or with too many parts, is refused and not read', () => {
  failed(lowestNpm('>=1'.padEnd(MAX_VERSION_TEXT + 1, ' ') + '2'));
  failed(lowestNpm(Array.from({ length: 101 }, () => '1').join('||')));
  failed(lowestNpm(Array.from({ length: 51 }, () => '>=1').join(' ')));
  assert.equal(tuple(lowestNpm(Array.from({ length: 60 }, (_, i) => String(9 - (i % 9))).join('||'))), '1.0.0/1');
  assert.equal(tuple(lowestNpm(Array.from({ length: 50 }, () => '>=1').join(' '))), '1.0.0/1');
});

test('python specifiers: the lowest version that requires-python allows', () => {
  const table = [
    ['>=3.8', '3.8.0/2'],
    ['>=3.8,<4', '3.8.0/2'],
    ['>=3.8, <4', '3.8.0/2'],
    ['~=3.9', '3.9.0/2'],
    ['==3.9.*', '3.9.0/2'],
    ['==3.9.1', '3.9.1/3'],
    ['>3.8', '3.8.0/2'],
    ['>=3', '3.0.0/1'],
    ['>=3.6,>=3.8', '3.8.0/2'],
    ['>=3.10.0rc1', '3.10.0/3'],
    ['>=3.8,!=3.9.1', '3.8.0/2']
  ];
  for (const [text, expected] of table) assert.equal(tuple(lowestPep440(text)), expected, text);
});

test('python specifiers: no lower limit, odd text and too much text are refused', () => {
  for (const text of ['', '<4', '!=3.9', '<=3.12', '3.8', '>=', '>=abc', '>=3.8;', 'python>=3.8', '>=3.8,', '>= 3.8 4']) failed(lowestPep440(text));
  failed(lowestPep440(`>=${'1'.repeat(MAX_VERSION_TEXT)}`));
  failed(lowestPep440(Array.from({ length: 51 }, () => '>=3').join(',')));
});

test('ruby requirements: the lowest version that the ruby line allows', () => {
  assert.equal(tuple(lowestGem(['>= 2.7', '< 3.2'])), '2.7.0/2');
  assert.equal(tuple(lowestGem(['~> 3.0'])), '3.0.0/2');
  assert.equal(tuple(lowestGem(['3.1.2'])), '3.1.2/3');
  assert.equal(tuple(lowestGem(['= 3.1.2'])), '3.1.2/3');
  assert.equal(tuple(lowestGem(['>= 2.6', '>= 2.7.1'])), '2.7.1/3');
  assert.equal(tuple(lowestGem(['3.2.0.rc1'])), '3.2.0/3');
  for (const bad of [[], ['< 3'], ['!= 3.1'], ['three'], ['>= '], ['3.1.2', 'x']]) failed(lowestGem(bad));
  failed(lowestGem('3.1'));
});

test('single versions: a declared version in .nvmrc, runtime.txt or a tag, and words that name no version', () => {
  assert.equal(tuple(singleVersion('v18.19.1')), '18.19.1/3');
  assert.equal(tuple(singleVersion('3.11')), '3.11.0/2');
  assert.equal(tuple(singleVersion('20')), '20.0.0/1');
  assert.equal(tuple(singleVersion('python-3.9.7', { prefix: /^python-/i })), '3.9.7/3');
  assert.equal(tuple(singleVersion('ruby-3.1.2', { prefix: /^ruby-/i })), '3.1.2/3');
  assert.equal(tuple(singleVersion('18-alpine')), '18.0.0/1');
  for (const text of ['lts/*', 'system', 'latest', 'node', '', '   ', 'pypy3.9', 'v', '-1', 'x.y', '\uff11\uff18', 'e3']) failed(singleVersion(text));
});

test('single versions: a number with too many digits or parts is not a version of the tool', () => {
  assert.equal(tuple(singleVersion('18.19.1.2')), '18.19.1/3');
  failed(singleVersion('1234567'));
  failed(singleVersion('x'.repeat(MAX_VERSION_TEXT + 1)));
});

test('version keys: Node.js and Java use the major version, the others the major and minor version', () => {
  assert.deepEqual(versionKey('node', lowestNpm('>=18')), { ok: true, key: '18' });
  assert.deepEqual(versionKey('node', lowestNpm('^0.12')), { ok: true, key: '0.12' });
  assert.equal(versionKey('node', lowestNpm('>=0')).ok, false);
  assert.deepEqual(versionKey('java', { ok: true, tuple: [17, 0, 0], given: 1 }), { ok: true, key: '17' });
  assert.deepEqual(versionKey('python', lowestPep440('>=3.8')), { ok: true, key: '3.8' });
  assert.deepEqual(versionKey('php', lowestNpm('^7.4', { composer: true })), { ok: true, key: '7.4' });
});

test('version keys: a single value that names only the major version is not guessed, but a range is read at its lower limit', () => {
  const single = versionKey('python', singleVersion('3'), { single: true });
  assert.equal(single.ok, false);
  assert.match(single.reason, /only the major version 3/);
  assert.deepEqual(versionKey('python', lowestPep440('>=3')), { ok: true, key: '3.0' });
  assert.deepEqual(versionKey('ruby', singleVersion('3.2'), { single: true }), { ok: true, key: '3.2' });
  assert.equal(versionKey('go', { ok: false, reason: 'x' }).ok, false);
});

test('compare and show: tuples compare part by part, and are shown with the parts that were given', () => {
  assert.ok(compareTuples([18, 0, 0], [20, 0, 0]) < 0);
  assert.ok(compareTuples([3, 10, 0], [3, 9, 9]) > 0);
  assert.equal(compareTuples([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(tupleText([18, 17, 1], 2), '18.17');
  assert.equal(tupleText([18, 0, 0], 1), '18');
  assert.equal(tupleText([18, 0, 0], 0), '18');
  assert.equal(tupleText([1, 2, 3]), '1.2.3');
});

test('.NET monikers: net5.0 and later by major version, netcoreapp by major and minor, and the ones that name no runtime', () => {
  const key = (t) => parseTargetFramework(t).key;
  assert.equal(key('net8.0'), '8');
  assert.equal(key('net10.0'), '10');
  assert.equal(key('net6.0-windows'), '6');
  assert.equal(key('net7.0-android31.0'), '7');
  assert.equal(key('NET9.0'), '9');
  assert.equal(key('netcoreapp3.1'), '3.1');
  assert.equal(key('netcoreapp2.1'), '2.1');
  assert.equal(key(' net5.0 '), '5');
  for (const t of ['netstandard2.0', 'netstandard2.1', 'net48', 'net472', 'net45', '$(TargetFrameworkVersion)', '@(Tfm)', 'uap10.0', 'net4.8', 'net', '', 'netcoreapp', `net${'9'.repeat(300)}.0`]) failed(parseTargetFramework(t));
  assert.match(parseTargetFramework('net48').reason, /\.NET Framework/);
  assert.match(parseTargetFramework('netstandard2.0').reason, /\.NET Standard/);
  assert.match(parseTargetFramework('$(Tfm)').reason, /does not evaluate/);
});

test('.NET SDK versions: the first part is the version of .NET, and .NET Core versions keep the minor part', () => {
  assert.equal(parseSdkVersion('8.0.100').key, '8');
  assert.equal(parseSdkVersion('6.0.400-preview.1').key, '6');
  assert.equal(parseSdkVersion('3.1.426').key, '3.1');
  assert.equal(parseSdkVersion('2.1.818').key, '2.1');
  for (const t of ['8.0', '8', 'latest', '', '8.0.100.1', 'v8.0.100']) failed(parseSdkVersion(t));
});

test('Java versions: 1.8 is 8, a constant of Gradle is read, and a property is not evaluated', () => {
  const key = (t) => parseJavaVersion(t).key;
  assert.equal(key('1.8'), '8');
  assert.equal(key('1.7'), '7');
  assert.equal(key('8'), '8');
  assert.equal(key('11'), '11');
  assert.equal(key('17.0.9'), '17');
  assert.equal(key('17.0.9_9'), '17');
  assert.equal(key('1.8.0_292'), '8');
  assert.equal(key('VERSION_17'), '17');
  assert.equal(key('JavaVersion.VERSION_1_8'), '8');
  assert.equal(key('JavaVersion.VERSION_11'), '11');
  for (const t of ['${java.version}', '$(JavaVersion)', '', 'latest', 'abc', 'x'.repeat(MAX_VERSION_TEXT + 1)]) failed(parseJavaVersion(t));
});

test('Go versions: 1.21, 1.21.0 and 1.21rc1 are Go 1.21; another major version is refused', () => {
  assert.equal(parseGoVersion('1.21').key, '1.21');
  assert.equal(parseGoVersion('1.21.0').key, '1.21');
  assert.equal(parseGoVersion('1.22.5').key, '1.22');
  assert.equal(parseGoVersion('1.21rc1').key, '1.21');
  assert.equal(parseGoVersion('1.9').key, '1.9');
  for (const t of ['1', '2.0', 'go1.21', '1.x', '', 'latest', '1.21.0.1']) failed(parseGoVersion(t));
});

test('Docker FROM lines: the tag of an image of a runtime gives the version, and nothing else is read', () => {
  const read = (line) => parseFromLine(line);
  assert.deepEqual(read('FROM node:18-alpine').result, { ok: true, key: '18' });
  assert.deepEqual(read('FROM node:20.11.1-bookworm-slim AS build').result, { ok: true, key: '20' });
  assert.deepEqual(read('FROM --platform=$BUILDPLATFORM python:3.9-slim AS build').result, { ok: true, key: '3.9' });
  assert.deepEqual(read('from python:3.12.1-alpine3.19').result, { ok: true, key: '3.12' });
  assert.deepEqual(read('FROM mcr.microsoft.com/dotnet/aspnet:6.0').result, { ok: true, key: '6' });
  assert.deepEqual(read('FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine').result, { ok: true, key: '8' });
  assert.deepEqual(read('FROM mcr.microsoft.com/dotnet/core/aspnet:3.1').result, { ok: true, key: '3.1' });
  assert.deepEqual(read('FROM eclipse-temurin:17-jre').result, { ok: true, key: '17' });
  assert.deepEqual(read('FROM eclipse-temurin:21.0.1_12-jdk').result, { ok: true, key: '21' });
  assert.deepEqual(read('FROM openjdk:8u342-jdk').result, { ok: true, key: '8' });
  assert.deepEqual(read('FROM openjdk:11-jre-slim').result, { ok: true, key: '11' });
  assert.deepEqual(read('FROM php:7.4-fpm').result, { ok: true, key: '7.4' });
  assert.deepEqual(read('FROM ruby:2.7').result, { ok: true, key: '2.7' });
  assert.deepEqual(read('FROM golang:1.21-alpine').result, { ok: true, key: '1.21' });
  assert.deepEqual(read('FROM docker.io/library/node:16').result, { ok: true, key: '16' });
  assert.deepEqual(read('FROM docker.io/node:16').result, { ok: true, key: '16' });
  assert.deepEqual(read('FROM library/node:16').result, { ok: true, key: '16' });
  assert.equal(read('FROM php:7.4-fpm').runtime, 'php');
});

test('Docker FROM lines: an image of another kind, a stage name and a private registry are not read', () => {
  for (const line of ['FROM scratch', 'FROM base AS final', 'FROM composer:2 AS vendor', 'FROM registry.example.com:5000/node:18', 'FROM ubuntu:22.04', 'FROM ${BASE_IMAGE}', 'FROM', 'FROM  ', 'RUN echo FROM node:18', '# FROM node:18', '']) {
    assert.equal(parseFromLine(line), null, line);
  }
});

test('Docker FROM lines: a tag with no version, a variable, a digest or only the major version is reported with the reason', () => {
  const reason = (line) => parseFromLine(line).result.reason;
  assert.match(reason('FROM node'), /no tag/);
  assert.match(reason('FROM node:latest'), /names no version number/);
  assert.match(reason('FROM node:lts-alpine'), /names no version number/);
  assert.match(reason('FROM node:${NODE_VERSION}'), /variable/);
  assert.match(reason('FROM node@sha256:0123456789abcdef'), /digest/);
  assert.match(reason('FROM python:3'), /only the major version 3/);
  assert.match(reason('FROM php:8-cli'), /only the major version 8/);
  assert.match(reason('FROM mcr.microsoft.com/dotnet/aspnet:3'), /only the major version 3/);
  assert.equal(parseFromLine('FROM python:3').runtime, 'python');
  assert.equal(parseFromLine('FROM node:18@sha256:0123456789abcdef').result.ok, true);
});
