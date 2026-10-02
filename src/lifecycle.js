// Every end-of-support date and every quoted sentence in this file comes from an official lifecycle page that is saved
// as text in research/sources (the address is on the first line). test/data.test.js reads the saved text again, on its
// own, and compares it with this file: every version, every date, how exact the date is, and every quoted sentence.
// Nothing here was written from memory: a version that is not on a saved page is not in this file, and the tool says
// so ("not in the data") instead of guessing. docs/rules-and-sources.md lists the pages and what was taken from each.
//
// A release is { runtime, version, end, precision, kind, source }.
//   version    the key that the readers look up: the major version for Node.js and Java, the major and minor
//              version for Python, PHP, Ruby and Go, and for .NET the major version (5 and later) or major.minor
//              (.NET Core 3.1 and earlier)
//   end        the end date as the page gives it, "YYYY-MM-DD", or "YYYY-MM" when the page gives only a month,
//              or null when the page says the date is not set yet
//   precision  "day" or "month"
//   kind       "end"         the page gives the end of support
//              "expected"    the page marks the date as expected
//              "policy"      the date follows from a policy sentence (Go): the day the second newer release came out
//              "minimum"     the vendor commits to support until at least this date and states no end (Java LTS)
//              "unannounced" the page gives no date yet
//   source     the id of the saved page

export const SOURCES = [
  { id: 'node-schedule', runtime: 'node', label: 'Node.js Release Working Group, release schedule', url: 'https://github.com/nodejs/Release', file: 'nodejs-release-schedule.txt' },
  { id: 'node-previous', runtime: 'node', label: 'Node.js, previous releases', url: 'https://nodejs.org/en/about/previous-releases', file: 'nodejs-previous-releases.txt' },
  { id: 'python', runtime: 'python', label: 'Python Developer\'s Guide, status of Python versions', url: 'https://devguide.python.org/versions/', file: 'python-status-of-versions.txt' },
  { id: 'dotnet-policy', runtime: 'dotnet', label: '.NET and .NET Core official support policy', url: 'https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core', file: 'dotnet-support-policy.txt' },
  { id: 'dotnet-learn', runtime: 'dotnet', label: 'Microsoft Lifecycle, Microsoft .NET and .NET Core', url: 'https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-and-net-core', file: 'dotnet-lifecycle-microsoft-learn.txt' },
  { id: 'php-supported', runtime: 'php', label: 'PHP, supported versions', url: 'https://www.php.net/supported-versions.php', file: 'php-supported-versions.txt' },
  { id: 'php-eol', runtime: 'php', label: 'PHP, unsupported branches', url: 'https://www.php.net/eol.php', file: 'php-unsupported-branches.txt' },
  { id: 'ruby', runtime: 'ruby', label: 'Ruby maintenance branches', url: 'https://www.ruby-lang.org/en/downloads/branches/', file: 'ruby-maintenance-branches.txt' },
  { id: 'go', runtime: 'go', label: 'Go release history', url: 'https://go.dev/doc/devel/release', file: 'go-release-history.txt' },
  { id: 'java-temurin', runtime: 'java', label: 'Eclipse Temurin support, release roadmap', url: 'https://adoptium.net/support/', file: 'adoptium-temurin-support.txt' }
];

const BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
export const sourceUrl = (id) => BY_ID[id].url;
export const sourceLabel = (id) => BY_ID[id].label;

// The runtimes the tool reads, in the order of the README. keyParts says how many parts of a version make the key.
export const RUNTIMES = {
  node: { name: 'Node.js', keyParts: 1 },
  python: { name: 'Python', keyParts: 2 },
  dotnet: { name: '.NET', keyParts: 1 },
  java: { name: 'Java', keyParts: 1 },
  php: { name: 'PHP', keyParts: 2 },
  ruby: { name: 'Ruby', keyParts: 2 },
  go: { name: 'Go', keyParts: 2 }
};

// ---- the rows of the saved pages, as [version, end, precision, kind]; the newest version first
const NODE = [
    ['26', '2029-04-30'],
    ['25', '2026-06-01'],
    ['24', '2028-04-30'],
    ['23', '2025-06-01'],
    ['22', '2027-04-30'],
    ['21', '2024-06-01'],
    ['20', '2026-04-30'],
    ['19', '2023-06-01'],
    ['18', '2025-04-30'],
    ['17', '2022-06-01'],
    ['16', '2023-09-11'],
    ['15', '2021-06-01'],
    ['14', '2023-04-30'],
    ['13', '2020-06-01'],
    ['12', '2022-04-30'],
    ['11', '2019-06-01'],
    ['10', '2021-04-30'],
    ['9', '2018-06-30'],
    ['8', '2019-12-31'],
    ['7', '2017-06-30'],
    ['6', '2019-04-30'],
    ['5', '2016-06-30'],
    ['4', '2018-04-30'],
    ['0.12', '2016-12-31'],
    ['0.10', '2016-10-31']
];

const PYTHON = [
    ['3.15', '2031-10', 'month'],
    ['3.14', '2030-10', 'month'],
    ['3.13', '2029-10', 'month'],
    ['3.12', '2028-10', 'month'],
    ['3.11', '2027-10', 'month'],
    ['3.10', '2026-10-01', 'day'],
    ['3.9', '2025-10-31', 'day'],
    ['3.8', '2024-10-07', 'day'],
    ['3.7', '2023-06-27', 'day'],
    ['3.6', '2021-12-23', 'day'],
    ['3.5', '2020-09-30', 'day'],
    ['3.4', '2019-03-18', 'day'],
    ['3.3', '2017-09-29', 'day'],
    ['3.2', '2016-02-20', 'day'],
    ['3.1', '2012-04-09', 'day'],
    ['3.0', '2009-06-27', 'day'],
    ['2.7', '2020-01-01', 'day'],
    ['2.6', '2013-10-29', 'day']
];

const DOTNET = [
    ['10', '2028-11-14'],
    ['9', '2026-11-10'],
    ['8', '2026-11-10'],
    ['7', '2024-05-14'],
    ['6', '2024-11-12'],
    ['5', '2022-05-10'],
    ['3.1', '2022-12-13'],
    ['3.0', '2020-03-03'],
    ['2.2', '2019-12-23'],
    ['2.1', '2021-08-21'],
    ['2.0', '2018-10-01'],
    ['1.1', '2019-06-27'],
    ['1.0', '2019-06-27']
];

const PHP = [
    ['8.5', '2029-12-31'],
    ['8.4', '2028-12-31'],
    ['8.3', '2027-12-31'],
    ['8.2', '2026-12-31'],
    ['8.1', '2025-12-31'],
    ['8.0', '2023-11-26'],
    ['7.4', '2022-11-28'],
    ['7.3', '2021-12-06'],
    ['7.2', '2020-11-30'],
    ['7.1', '2019-12-01'],
    ['7.0', '2019-01-10'],
    ['5.6', '2018-12-31'],
    ['5.5', '2016-07-21'],
    ['5.4', '2015-09-03'],
    ['5.3', '2014-08-14'],
    ['5.2', '2011-01-06'],
    ['5.1', '2006-08-24'],
    ['5.0', '2005-09-05'],
    ['4.4', '2008-08-07'],
    ['4.3', '2005-03-31'],
    ['4.2', '2002-09-06'],
    ['4.1', '2002-03-12'],
    ['4.0', '2001-06-23'],
    ['3.0', '2000-10-20']
];

const RUBY = [
    ['4.0', null, 'day', 'unannounced'],
    ['3.4', null, 'day', 'unannounced'],
    ['3.3', '2027-03-31', 'day', 'expected'],
    ['3.2', '2026-04-01', 'day', 'end'],
    ['3.1', '2025-03-26', 'day', 'end'],
    ['3.0', '2024-04-23', 'day', 'end'],
    ['2.7', '2023-03-31', 'day', 'end'],
    ['2.6', '2022-04-12', 'day', 'end'],
    ['2.5', '2021-04-05', 'day', 'end'],
    ['2.4', '2020-03-31', 'day', 'end'],
    ['2.3', '2019-03-31', 'day', 'end'],
    ['2.2', '2018-03-31', 'day', 'end'],
    ['2.1', '2017-03-31', 'day', 'end'],
    ['2.0', '2016-02-24', 'day', 'end'],
    ['1.9', '2015-02-23', 'day', 'end']
];

const GO = [
    ['1.27', '2026-08-19'],
    ['1.26', '2026-02-10'],
    ['1.25', '2025-08-12'],
    ['1.24', '2025-02-11'],
    ['1.23', '2024-08-13'],
    ['1.22', '2024-02-06'],
    ['1.21', '2023-08-08'],
    ['1.20', '2023-02-01'],
    ['1.19', '2022-08-02'],
    ['1.18', '2022-03-15'],
    ['1.17', '2021-08-16'],
    ['1.16', '2021-02-16'],
    ['1.15', '2020-08-11'],
    ['1.14', '2020-02-25'],
    ['1.13', '2019-09-03'],
    ['1.12', '2019-02-25'],
    ['1.11', '2018-08-24'],
    ['1.10', '2018-02-16'],
    ['1.9', '2017-08-24'],
    ['1.8', '2017-02-16'],
    ['1.7', '2016-08-15'],
    ['1.6', '2016-02-17'],
    ['1.5', '2015-08-19'],
    ['1.4', '2014-12-10'],
    ['1.3', '2014-06-18'],
    ['1.2', '2013-12-01'],
    ['1.1', '2013-05-13'],
    ['1.0', '2012-03-28']
];

const JAVA = [
    ['27', '2027-03', 'month', 'end'],
    ['26', '2026-09', 'month', 'end'],
    ['25', '2031-09', 'month', 'minimum'],
    ['24', '2025-09', 'month', 'end'],
    ['23', '2025-03', 'month', 'end'],
    ['22', '2024-09', 'month', 'end'],
    ['21', '2029-12', 'month', 'minimum'],
    ['20', '2023-09', 'month', 'end'],
    ['19', '2023-03', 'month', 'end'],
    ['18', '2022-09', 'month', 'end'],
    ['17', '2027-10', 'month', 'minimum'],
    ['16', '2021-09', 'month', 'end'],
    ['11', '2027-10', 'month', 'minimum'],
    ['8', '2030-12', 'month', 'minimum']
];

// Go: "Each major Go release is supported until there are two newer major releases." So the end of Go 1.N is the day
// that Go 1.(N+2) came out; for the two newest releases the page gives no such day yet.
function goRows() {
  const day = new Map(GO.map(([v, d]) => [Number(v.split('.')[1]), d]));
  return GO.map(([v]) => {
    const later = day.get(Number(v.split('.')[1]) + 2);
    return later ? [v, later, 'day', 'policy'] : [v, null, 'day', 'unannounced'];
  });
}

const PHP_SUPPORTED_PAGE = new Set(['8.2', '8.3', '8.4', '8.5']);
const NODE_SOURCE = 'node-schedule';

const make = (runtime, rows, source) => rows.map(([version, end, precision = 'day', kind = 'end']) => ({ runtime, version, end, precision, kind, source: typeof source === 'function' ? source(version) : source }));

export const RELEASES = {
  node: make('node', NODE, NODE_SOURCE),
  python: make('python', PYTHON, 'python'),
  dotnet: make('dotnet', DOTNET, 'dotnet-policy'),
  java: make('java', JAVA, 'java-temurin'),
  php: make('php', PHP, (v) => (PHP_SUPPORTED_PAGE.has(v) ? 'php-supported' : 'php-eol')),
  ruby: make('ruby', RUBY, 'ruby'),
  go: make('go', goRows(), 'go')
};

// The release dates of Go that the end dates above come from; test/data.test.js compares them with the saved page.
export const GO_RELEASE_DAYS = Object.fromEntries(GO);

export function findRelease(runtime, version) {
  const list = RELEASES[runtime];
  if (!list) return null;
  return list.find((r) => r.version === version) ?? null;
}

// The name shown for a version: ".NET 8", ".NET Core 3.1", "Node.js 18", "Python 3.9".
export function displayName(runtime, version) {
  if (runtime === 'dotnet') return `${/\./.test(version) ? '.NET Core' : '.NET'} ${version}`;
  return `${RUNTIMES[runtime].name} ${version}`;
}

// How the report counts: the tool's own choices, explained in docs/method.md. No page gives a number of days.
export const DEFAULTS = { soonDays: 180, maxDepth: 8 };

// One sentence of the saved pages for each runtime, quoted in the findings of that runtime. Each sentence is on its
// saved page word for word (a line break or a run of spaces on the page does not count), and has no date in it.
export const FACTS = {
  node: { source: 'node-previous', section: 'Node.js Releases', text: 'Production applications should only use Active LTS or Maintenance LTS releases.' },
  python: { source: 'python', section: 'Status key, end-of-life', text: 'Five years after a release, support ends.' },
  dotnet: { source: 'dotnet-policy', section: 'What releases qualify for servicing', text: 'LTS releases get free support and patches for three years. STS releases get free support and patches for two years.' },
  java: { source: 'java-temurin', section: 'Release Roadmap', text: 'We will support LTS releases for at least four years.' },
  php: { source: 'php-supported', section: 'Supported Versions', text: 'Once the four years of support are completed, the branch reaches its end of life and is no longer supported.' },
  ruby: { source: 'ruby', section: 'Ruby Maintenance Branches', text: 'Branch is not supported by the ruby-core team any longer and does not receive any fixes.' },
  go: { source: 'go', section: 'Release Policy', text: 'Each major Go release is supported until there are two newer major releases.' }
};

// Further sentences that the tool relies on: what the footnote of the Temurin table says an end of service is, and the
// sentence of the Go policy that the derived dates rest on is FACTS.go. The Node.js sentence names the phases.
export const NOTES = {
  javaEndOfService: { source: 'java-temurin', section: 'Release Roadmap, footnote 2', text: 'End of Service/Support Life - this code stream is no longer being maintained.' },
  javaMinimum: { source: 'java-temurin', section: 'Release Roadmap, footnote 1', text: 'As a general philosophy, Adoptium will continue to build binaries for LTS releases as long as the corresponding upstream source is actively maintained.' }
};
