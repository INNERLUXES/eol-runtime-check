# eol-runtime-check

Reads a code folder and finds the runtime and framework versions that the project declares (Node.js, Python, .NET, Java, PHP, Ruby and Go), then reports which of them are past the end of support, or will be soon, so that a modernization can be planned. It reads the version files and Dockerfiles that the project already has, and compares each version with the lifecycle page of the vendor. For every version it names the file, the declared value, the lowest version that value allows, how many days are left or gone, a sentence on what to do, and the sentence of the official page that the finding rests on, with the address of the page.

Old runtimes hide in plain sight. A `package.json` that says `>=14`, a `requires-python` of `>=3.8`, a project file that targets `net6.0` and a Dockerfile that starts from `php:7.4-apache` each look like a detail. Each one is a choice that the vendor has stopped supporting, and the date it stopped is on a public page. Before a team plans a move, it needs the list: which versions, in which files, and how long ago or how soon. This tool reads that list in a second, from the files, with no network and no install, so the check can run on every pull request.

- Every finding has an id, a severity (error, warning or info), the file and the place in it, the declared value, the days left or gone, a fix and the quoted sentence of the lifecycle page with its address.
- For a range such as `>=18`, `^3.9` or `8.*` the tool reports the **lowest version the range allows**, and says so. That version decides whether the project can still be supported.
- The dates are quotes. The lifecycle pages of Node.js, Python, .NET, PHP, Ruby, Go and Eclipse Temurin are saved in [research/sources](research/sources), and a test reads them again and compares every version, every end date and every quoted sentence in [src/lifecycle.js](src/lifecycle.js) with the saved text. A version that is on no saved page is reported as "not in the data" and never given a date.
- Nothing is skipped without a word. A file that cannot be read, a value that is not a version, a range with no lower limit and a folder with no declaration at all are findings, never a pass and never a guess.
- It reads text files by name only. It never runs or imports what it reads, never installs a package, never follows a symbolic link inside the folder and never opens a connection. See [docs/secure-defaults.md](docs/secure-defaults.md).
- The report date is an input: `--today` repeats a report for a given day, and `--no-dates` leaves every calendar date out of the report and keeps the counts of days.
- Reports as text, Markdown, JSON and CSV, with an exit code for a pipeline gate. Info findings never fail the run.
- Plain JavaScript, no dependencies; the same folder and the same report date always give the same report.

```
npm test
```

```
ℹ tests 180
ℹ pass 172
ℹ fail 0
ℹ skipped 8
```

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/eol-runtime-check.git
cd eol-runtime-check
node bin/eol-runtime-check.js examples/billing-legacy --fail-on warning --no-dates
```

On your own project:

```
npx --yes github:INNERLUXES/eol-runtime-check path/to/project --fail-on warning
```

`examples/` holds `billing-legacy`, the folder of a made-up invoicing system, wrong on purpose: a Node.js back end whose `engines` still allows Node.js 18 and whose `.nvmrc` says 20, a Python reports tool that requires Python 3.8 or newer, a .NET ledger project that targets `net6.0` and `netstandard2.0`, a PHP web image built from `php:7.4-apache`, and a Maven export project for Java 11. `examples/billing-modernized` is the same system moved to releases that are supported, and it passes the gate at the stricter level. Both are checked for the same report date.

## Usage

```
node bin/eol-runtime-check.js examples/billing-legacy --fail-on warning --no-dates
```

The runs below use a fixed report date, which `npm run example` sets with `--today`, so that the day counts are the same for every reader; on another day the counts differ. `--no-dates` leaves the calendar dates out, so this page shows days only. Without `--no-dates` the report also shows the end date of each version and the report date (see [examples/output/billing-legacy-with-dates.txt](examples/output/billing-legacy-with-dates.txt)).

```
eol-runtime-check: billing-legacy
read: 6 files of interest in 5 folders, 7 declarations
report date: left out (--no-dates)
findings: 4 error, 1 warning, 2 info

ERROR    runtime-past-support  .NET 6
         ledger/Ledger.csproj TargetFramework "net6.0" names .NET 6, which is past its end of support: it ended 474 days ago.
         fix: Move to a release that is still supported and change this file to name it; then run the check again.
         source (.NET and .NET Core official support policy, What releases qualify for servicing): "LTS releases get free support and patches for three years. STS releases get free support and patches for two years."
           https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core

ERROR    runtime-past-support  Node.js 18
         package.json engines.node ">=18" allows Node.js 18 as its lowest version, which is past its end of support: it ended 305 days ago.
         fix: Raise the lower limit to a release that is still supported and move the code to it; then run the check again.
         source (Node.js, previous releases, Node.js Releases): "Production applications should only use Active LTS or Maintenance LTS releases."
           https://nodejs.org/en/about/previous-releases

ERROR    runtime-past-support  Python 3.8
         reports/pyproject.toml requires-python ">=3.8" allows Python 3.8 as its lowest version, which is past its end of support: it ended 510 days ago.
         fix: Raise the lower limit to a release that is still supported and move the code to it; then run the check again.
         source (Python Developer's Guide, status of Python versions, Status key, end-of-life): "Five years after a release, support ends."
           https://devguide.python.org/versions/

ERROR    runtime-past-support  PHP 7.4
         web/Dockerfile FROM line 6 "php:7.4-apache" names PHP 7.4, which is past its end of support: it ended 1,189 days ago.
         fix: Move to a release that is still supported and change this file to name it; then run the check again.
         source (PHP, supported versions, Supported Versions): "Once the four years of support are completed, the branch reaches its end of life and is no longer supported."
           https://www.php.net/supported-versions.php

WARNING  runtime-ending-soon  Node.js 20
         .nvmrc "20" names Node.js 20, which is still supported but whose support ends in 60 days. That is within the 180 days of --soon-days.
         fix: Plan the move to a release that will still be supported after this one ends.
         source (Node.js, previous releases, Node.js Releases): "Production applications should only use Active LTS or Maintenance LTS releases."
           https://nodejs.org/en/about/previous-releases

INFO     runtime-vendor-minimum  Java 11
         export/pom.xml maven.compiler.release "11" names Java 11, an LTS release that Eclipse Temurin builds until at least the month on the saved page; the page states no end.
         fix: Nothing to fix now.
         source (Eclipse Temurin support, release roadmap, Release Roadmap): "We will support LTS releases for at least four years."
           https://adoptium.net/support/
         source (Eclipse Temurin support, release roadmap, Release Roadmap, footnote 1): "As a general philosophy, Adoptium will continue to build binaries for LTS releases as long as the corresponding upstream source is actively maintained."
           https://adoptium.net/support/

INFO     version-unreadable  ledger/Ledger.csproj
         ledger/Ledger.csproj TargetFramework "netstandard2.0": the version could not be read: "netstandard2.0" is a .NET Standard version, which names no runtime and has no support date of its own on the saved pages.
         fix: Write the version in a form the tool reads (docs/inputs.md lists them), or check it by hand.

GATE: FAIL - 4 errors and 1 warning
```

The same system, moved to supported releases, passes the gate at the stricter level:

```
node bin/eol-runtime-check.js examples/billing-modernized --fail-on warning --no-dates
```

```
eol-runtime-check: billing-modernized
read: 6 files of interest in 5 folders, 6 declarations
report date: left out (--no-dates)
findings: 0 error, 0 warning, 6 info

INFO     runtime-supported  Node.js 24
         .nvmrc "24" names Node.js 24, which is supported; its support ends in 791 days.
         fix: Nothing to fix now.
         source (Node.js, previous releases, Node.js Releases): "Production applications should only use Active LTS or Maintenance LTS releases."
           https://nodejs.org/en/about/previous-releases

INFO     runtime-supported  .NET 10
         ledger/Ledger.csproj TargetFramework "net10.0" names .NET 10, which is supported; its support ends in 989 days.
         fix: Nothing to fix now.
         source (.NET and .NET Core official support policy, What releases qualify for servicing): "LTS releases get free support and patches for three years. STS releases get free support and patches for two years."
           https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core

INFO     runtime-supported  Node.js 24
         package.json engines.node ">=24" allows Node.js 24 as its lowest version, which is supported; its support ends in 791 days.
         fix: Nothing to fix now.
         source (Node.js, previous releases, Node.js Releases): "Production applications should only use Active LTS or Maintenance LTS releases."
           https://nodejs.org/en/about/previous-releases

INFO     runtime-supported  Python 3.13
         reports/pyproject.toml requires-python ">=3.13" allows Python 3.13 as its lowest version, which is supported; its support ends in 1,310 days at the earliest; the page gives the month only.
         fix: Nothing to fix now.
         source (Python Developer's Guide, status of Python versions, Status key, end-of-life): "Five years after a release, support ends."
           https://devguide.python.org/versions/

INFO     runtime-supported  PHP 8.5
         web/Dockerfile FROM line 6 "php:8.5-apache" names PHP 8.5, which is supported; its support ends in 1,401 days.
         fix: Nothing to fix now.
         source (PHP, supported versions, Supported Versions): "Once the four years of support are completed, the branch reaches its end of life and is no longer supported."
           https://www.php.net/supported-versions.php

INFO     runtime-vendor-minimum  Java 25
         export/pom.xml maven.compiler.release "25" names Java 25, an LTS release that Eclipse Temurin builds until at least the month on the saved page; the page states no end.
         fix: Nothing to fix now.
         source (Eclipse Temurin support, release roadmap, Release Roadmap): "We will support LTS releases for at least four years."
           https://adoptium.net/support/
         source (Eclipse Temurin support, release roadmap, Release Roadmap, footnote 1): "As a general philosophy, Adoptium will continue to build binaries for LTS releases as long as the corresponding upstream source is actively maintained."
           https://adoptium.net/support/

GATE: PASS (--fail-on warning)
```

Both runs are checked by `npm run example`, which fails when this README shows anything other than what the tool prints, and which writes the report of the legacy folder in every format to `examples/output`.

## What is checked

Files read: `package.json`, `.nvmrc`, `.node-version`, `.python-version`, `pyproject.toml`, `runtime.txt`, `global.json`, `*.csproj`, `pom.xml`, `build.gradle` and `build.gradle.kts`, `composer.json`, `Gemfile`, `.ruby-version`, `go.mod`, and `Dockerfile`, `Dockerfile.*` and `*.Dockerfile`. [docs/inputs.md](docs/inputs.md) says what is read from each file and what is not.

| Check | Severity | What it reports |
| --- | --- | --- |
| `runtime-past-support` | error | a declared version is past its end of support on the report date |
| `runtime-ending-soon` | warning | support ends within `--soon-days` days, or within the month that the page gives |
| `runtime-supported` | info | the version is supported, with the days left, or the page gives no end date yet |
| `runtime-vendor-minimum` | info | a Java long-term support release: the vendor builds it until at least a month and states no end |
| `version-not-in-data` | info | the version is on no saved page (older, newer, or a line the pages do not cover); no date is guessed |
| `version-unreadable` | info | the value is not a version the tool reads: a range with no lower limit, `lts/*`, a build property, .NET Standard, .NET Framework, a tag with no version |
| `file-not-read` | info | a file or folder could not be read, and why: too big, not text, not valid JSON, a link, no access |
| `no-runtime-found` | info | no declaration was found in the folder |

[docs/method.md](docs/method.md) gives each check, its exact rule, what it can see and what it cannot. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every saved page and every quoted sentence.

### Which version, for a range

A range is reported by the lowest version it allows: `>=18 <22` is Node.js 18, `^18.17 || ^20` is Node.js 18, `~=3.9` is Python 3.9, `^7.4 || ^8.0` is PHP 7.4, `~> 3.0` is Ruby 3.0, `go 1.21` is Go 1.21. An upper limit alone (`<21`) or a wildcard alone (`*`) has no lowest version, and is reported as unreadable with that reason. This choice is the tool's own, and [docs/method.md](docs/method.md) gives the rule for each kind of range.

### Which date

An end date is read as the first day without support, so a version is past its end on the end date itself. Where a page gives only a month, the tool reads the whole month: before it the support ends "at the earliest" on its first day, during it the finding is a warning, after it the version has ended. Go has no end date on its page; its policy says that a release is supported until two newer major releases are out, so its end is the day of the second newer release. Eclipse Temurin gives only a minimum for the long-term support releases of Java. These readings are the tool's own, and the messages say so.

## Severity

The lifecycle pages give dates and no scale, so the severity is the tool's own mapping. An error is a declared version that is past its end of support. A warning is a version whose support ends within `--soon-days`, 180 by default. Info is everything else, and it never fails a run. The 180 is the tool's own choice, and a team will set its own.

## Where the facts come from

| Fact | Source |
| --- | --- |
| Node.js release lines and end-of-life dates | https://github.com/nodejs/Release and https://nodejs.org/en/about/previous-releases |
| Python branches and end of life | https://devguide.python.org/versions/ |
| .NET and .NET Core end of support | https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core and https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-and-net-core |
| PHP branches, security support and end of life | https://www.php.net/supported-versions.php and https://www.php.net/eol.php |
| Ruby branches and end of life | https://www.ruby-lang.org/en/downloads/branches/ |
| Go releases and the release policy | https://go.dev/doc/devel/release |
| Java long-term support and end of availability, for Eclipse Temurin | https://adoptium.net/support/ |

## Formats

- `text`: for a terminal: the folder, what was read, the report date, the counts, then each finding with the file, the declared value, the days, the fix and the quoted sentence with its address.
- `markdown`: the same as a table for a pull request comment or the job summary. Pipes, line breaks and angle brackets from the folder are escaped, so a name from a file cannot break the table.
- `json`: the whole report: the input (folders, files, declarations), every finding with id, severity, subject, file, place, declared value, message, fix, details (the key, the lowest version, the end date, the days left or gone) and source sentences, the notes, the options and the gate.
- `csv`: one row per finding, quoted as RFC 4180 says. A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet does not run it as a formula.

To put the report in the job summary of a GitHub Actions run:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Runtime support report
    run: npx --yes github:INNERLUXES/eol-runtime-check . --format markdown >> "$GITHUB_STEP_SUMMARY"
  - name: Runtime support gate
    run: npx --yes github:INNERLUXES/eol-runtime-check . --fail-on warning
```

It needs no credentials and no network access of its own. Start with the default gate (errors only), and move to `--fail-on warning` when the first report is clean.

## Options and exit codes

`eol-runtime-check <folder> [options]`.

- `--format <name>` is `text` (the default), `markdown`, `json` or `csv`.
- `--fail-on <level>` is `error` (the default) or `warning`; info never fails the run.
- `--soon-days <n>` (default 180, from 0 to 3650) is how many days before the end a version becomes a warning.
- `--today <YYYY-MM-DD>` is the report date; the default is the current day in UTC.
- `--no-dates` leaves every calendar date out of the report and keeps the counts of days.
- `--max-depth <n>` (default 8, from 0 to 32) is how many folder levels to go down.
- `--skip <name>` skips every folder with that name; repeat it for more names. `--no-default-skip` does not skip `node_modules`, `vendor`, `bin`, `obj`, `target`, `dist`, `.git` and the other default names.
- `--help` and `--version` print and exit with `0`.

`0` no finding at the `--fail-on` level, `1` at least one such finding (by default: an error), `2` a usage or input error (a folder that does not exist, a path that is a file, a URL in place of a path, standard input, an option that cannot be used).

A run that cannot start is exit code `2` and writes nothing to standard output, so a pipeline stops instead of passing on an empty report.

## Limits

The tool reads what a folder declares, not what runs. A range is read at its lowest version, a build property is not evaluated, a runtime declared in a file that the tool does not read is not seen, and a version that no saved page covers (.NET Framework, Java 9 to 15, the frameworks built on a runtime) is reported as not in the data. The data is as old as the saved pages. The default of 180 days, the reading of an end date as the first day without support and the reading of a month as a whole month are the tool's own. [docs/limits.md](docs/limits.md) lists them and the runtimes that were left out.

## Related

The tool reads the runtime versions that a project declares, before the work of moving it starts. Its neighbour `dotnet-port-scan` makes an inventory of a .NET Framework solution before it is moved to modern .NET. This tool does not read the projects of an old-style .NET Framework solution, and `dotnet-port-scan` does not read lifecycle dates.

## Background

- How old systems are assessed, moved and kept running, with a check on runtime support like this one at the start of the work: [legacy application modernization services](https://innerluxes.dev/application/modernization).

## License

MIT
