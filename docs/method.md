# Method

How a run works, what each check reports, its exact rule, and what it can and cannot see. A sentence in quotes is on a saved page of an official lifecycle source, listed in [rules-and-sources.md](rules-and-sources.md). A conclusion that no page states is called the tool's own, here and in the message of the finding.

## A run

1. The folder named on the command line is walked by name (see [inputs.md](inputs.md)). Folders that hold other code or build output are skipped, links are not followed, and the walk stops at a depth and at a number of entries.
2. Each file of interest is opened without following a link, its type and size are taken from the open file, and it is read as UTF-8 text. A file that is not text, is too big, or does not parse is reported as not read, and the run goes on with the next file.
3. A reader takes the value or the lines it needs from the text and turns each into a declaration: the file, the place in the file, the declared value, and the lowest version that the value allows.
4. Each declaration is looked up in the saved lifecycle data by runtime and version, and compared with the report date.
5. Findings are sorted by the order of the checks below, then by file and place. The same folder and the same report date always give the same report.

The tool never runs, imports or evaluates what it reads, and it never installs a package. A build property such as `$(Tfm)` or `${java.version}` is reported as "not evaluated".

## The lowest version of a range

A project that says `>=18` allows 18, 20 and 22. The oldest of them decides whether the project can still be supported, so that is the one the tool reports, and the message says that it is the lowest. This choice is the tool's own.

- **npm and Composer ranges** (`engines.node`, `require.php`). An "or" (`||`, and for Composer also a single `|`) takes the lowest of its sides. The parts of one side, joined by spaces or commas, must all hold, so the highest of their lower bounds is the lowest version that side allows. `^`, `~`, `>=`, `=`, a bare version, a wildcard (`18.x`) and a hyphen range (`14 - 18`) give their first version. `>18` is read as 19 (a partial version is a whole line), and `>18.2` as 18.3. An upper limit alone (`<21`) and a wildcard alone (`*`) set no lower limit, and are reported as unreadable with that reason.
- **Python specifiers** (`requires-python`). All parts must hold, so the highest lower bound wins. `>=`, `==`, `===`, `~=` and `>` give their version, `==3.9.*` gives 3.9, and `<`, `<=` and `!=` set no lower limit.
- **Ruby requirements** (the `ruby` line of a Gemfile). The same rule with `=`, `>=`, `>` and `~>`.
- **A single declared version** (`.nvmrc`, `.python-version`, `runtime.txt`, `.ruby-version`, a Docker tag). A leading `v` and the `python-` and `ruby-` prefixes are removed. A word that names no version (`lts/*`, `system`, `latest`) is unreadable. For Python, PHP, Ruby and Go, a value that gives only the major version is unreadable: it cannot be told from the newest minor version, and the tool does not guess.
- **A range given as a minimum of the language** (`go 1.21`) is the lowest Go version that can build the module; the toolchain that builds it may be newer, and the message says "allows".

A range that gives only a major version for a runtime keyed by minor version (`>=3` for Python) is read at its lower limit, 3.0, and so reports the oldest line of that major version. That is what "lowest allowed" means, and the message shows the version it read.

## Keys

Support dates follow the version line: the major version for Node.js and Java, the major and minor version for Python, PHP, Ruby and Go. For .NET the key is the major version from 5 on, and the major and minor version for .NET Core 3.1 and before. `net6.0` is .NET 6 and `netcoreapp3.1` is .NET Core 3.1. The SDK version of `global.json` gives the version of .NET by its first part. Java `1.8` is 8. These readings of a name or number are the tool's own; the dates are the pages'.

## Dates and counting

Every date is a calendar day and every difference is a whole number of days, so a clock change or a time zone cannot move it. The report date is the current day in UTC, or the day given with `--today`.

- **An end date is the first day without support.** A release is past its end of support on its end date itself, and "ended 0 days ago" is shown as "ended today". Pages differ in whether the end date is the last supported day or the first unsupported one. The tool reads it the strict way so that a pipeline does not pass on the day support ends. This reading is the tool's own.
- **A date with no day.** Python (for the versions not yet at their end of life), Java (every date) and nothing else give a month only. The tool reads it as the whole month: before the month, support ends "at the earliest" on its first day; during the month it ends "this month" and the finding is a warning; after the month it has ended, "at least" so many days ago, counted from the last day of the month.
- **An expected date.** Ruby marks some dates as expected. The message says so.
- **No date yet.** Ruby 4.0 and 3.4 have no end date on the saved page, and Go has none for its two newest releases. They are reported as supported, with "the saved page gives no end date yet".
- **Go.** The policy says "Each major Go release is supported until there are two newer major releases." The end of Go 1.N is the day that Go 1.(N+2) came out, taken from the release history on the saved page. The message says so.
- **Java.** The saved page is the roadmap of Eclipse Temurin. A release with an `EOSL` mark ends in the month the page gives. A long-term support release has "At least" and a month: the vendor commits to build it until then and states no end. It is reported as info, whatever the date, and the message quotes the footnote. The page covers Java 8, 11 and 16 to 27 only; the others are "not in the data".
- **PHP.** The end of support is the end of security support, because the page says that "Once the four years of support are completed, the branch reaches its end of life and is no longer supported."
- **.NET.** The dates are those of the support policy page. The Microsoft Lifecycle page gives the same dates, a day apart for some releases because it counts in another time zone; a test checks that they stay within a day.

## Severity

The lifecycle pages give dates and no scale, so the severity is the tool's own mapping.

- **error**: a declared version is past its end of support.
- **warning**: its support ends within `--soon-days`, 180 by default, or within the month that the page gives.
- **info**: everything else. Info never fails a run.

The number 180 is the tool's own choice, about half a year, so that a team that plans in quarters sees a version two quarters before its end. A team will set its own number.

## The checks

### `runtime-past-support`

Severity: error. A declared version is past its end of support on the report date. The message names the file, the place, the declared value, the lowest version it allows, the days since the end, and (unless `--no-dates`) the end date. The fix says to move to a supported release and, for a range, to raise the lower limit.

### `runtime-ending-soon`

Severity: warning. The version is supported and its support ends within `--soon-days` days, or within the month that the page gives. The message says how many days are left, "at the earliest" when the page gives a month.

### `runtime-supported`

Severity: info. The version is supported and its end is further away than `--soon-days`, or the saved page gives no end date yet. The message says how many days are left.

### `runtime-vendor-minimum`

Severity: info. A Java long-term support release. The vendor commits to build it until at least the month on the page and states no end, so the tool has no end date to count to. The message quotes the footnote that says how long the builds continue.

### `version-not-in-data`

Severity: info. The version was read, and it is not on the saved page: it is older than the page lists, newer than the page lists, or a line the page does not cover. No date is guessed. The fix says to look the version up on the vendor page.

### `version-unreadable`

Severity: info. The declared value could not be turned into a version, and the message gives the reason: a range with no lower limit, a word such as `lts/*`, a build property that the tool does not evaluate, .NET Standard (which names no runtime), .NET Framework (which the saved pages do not cover), a tag with no version number, a value of the wrong type. The tool does not guess.

### `file-not-read`

Severity: info. A file of interest, or a folder, could not be read, and the message says why: it is too big, it is not text, it is not valid JSON, it is a link, it cannot be opened. Nothing is skipped without a finding.

### `no-runtime-found`

Severity: info. No declaration was found in the folder. The message says how many files of interest and how many folders were looked at. A folder with no declaration is not a pass: the tool has nothing to say about it.

## What the report shows

- No value of a file is copied except the declared version string (cut to 80 characters and cleaned), the name of the file and the place in it. Names and values from the folder go through a function that replaces control characters, line separators and direction controls with a space.
- With `--no-dates` the report holds no calendar date: not the report date, not an end date. It holds counts of days.
