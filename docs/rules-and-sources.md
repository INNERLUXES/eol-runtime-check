# Rules and sources

Every version and end date that the tool reports, and every sentence it quotes, comes from an official lifecycle page that is saved in this repository. The first line of each saved file is the address of the page, and `src/lifecycle.js` holds the dates and sentences. `test/data.test.js` reads the saved text again with parsers of its own and compares it with `src/lifecycle.js`: every version, every end date, how exact the date is (a day or a month), and every quoted sentence. Nothing was written from memory. A version that is not on a saved page is not in the data, and the tool says "not in the data" and does not guess.

The pages were fetched with `curl` and a browser-style user agent, turned from HTML to text, and cut to the part that holds the data and the policy sentences. The menus, the footers and the columns of names of people are left out; no word of the kept text is changed. For the Node.js schedule, which is a Markdown file, the links and the emphasis marks are removed.

## Saved pages

| Page | Address | Saved text |
| --- | --- | --- |
| Node.js Release Working Group, release schedule | https://github.com/nodejs/Release | `research/sources/nodejs-release-schedule.txt` |
| Node.js, previous releases | https://nodejs.org/en/about/previous-releases | `research/sources/nodejs-previous-releases.txt` |
| Python Developer's Guide, status of Python versions | https://devguide.python.org/versions/ | `research/sources/python-status-of-versions.txt` |
| .NET and .NET Core official support policy | https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core | `research/sources/dotnet-support-policy.txt` |
| Microsoft Lifecycle, Microsoft .NET and .NET Core | https://learn.microsoft.com/en-us/lifecycle/products/microsoft-net-and-net-core | `research/sources/dotnet-lifecycle-microsoft-learn.txt` |
| PHP, supported versions | https://www.php.net/supported-versions.php | `research/sources/php-supported-versions.txt` |
| PHP, unsupported branches | https://www.php.net/eol.php | `research/sources/php-unsupported-branches.txt` |
| Ruby maintenance branches | https://www.ruby-lang.org/en/downloads/branches/ | `research/sources/ruby-maintenance-branches.txt` |
| Go release history | https://go.dev/doc/devel/release | `research/sources/go-release-history.txt` |
| Eclipse Temurin support, release roadmap | https://adoptium.net/support/ | `research/sources/adoptium-temurin-support.txt` |

## What is taken from each page

- **Node.js.** The version lines and their end-of-life dates from the table of the release schedule and the table of end-of-life releases. The previous releases page is used to check that every line it calls EOL has an end date in the data, and that the three lines it shows as supported are the three the schedule shows.
- **Python.** The branch and the end of life of every row of both tables. Where the page gives only a month, the data keeps only the month. The release manager column is not saved.
- **.NET.** The version and the end of support of every release in the supported and the out-of-support tables. The Microsoft Lifecycle page is used to check the dates within one day.
- **PHP.** The end of security support of each supported branch, and the end of life date of each unsupported branch. The columns that say how long ago a date was, which change with the day the page is fetched, are not saved.
- **Ruby.** The EOL date of each branch, and whether the page marks it as expected or gives none yet.
- **Go.** The release day of each major version. The end of support is derived from the policy sentence, and `test/data.test.js` derives it again from the saved days.
- **Java.** The rows of the Temurin table for Java 8, 11 and 16 to 27: the end of availability, and whether the row is a long-term support release.

## Quoted sentences

Each finding for a runtime quotes the sentence below, with the label of the page, the section and the address. The sentences have no date in them.

| Runtime | Page | Section | Sentence |
| --- | --- | --- | --- |
| Node.js | Node.js, previous releases | Node.js Releases | Production applications should only use Active LTS or Maintenance LTS releases. |
| Python | Python Developer's Guide, status of Python versions | Status key, end-of-life | Five years after a release, support ends. |
| .NET | .NET and .NET Core official support policy | What releases qualify for servicing | LTS releases get free support and patches for three years. STS releases get free support and patches for two years. |
| Java | Eclipse Temurin support, release roadmap | Release Roadmap | We will support LTS releases for at least four years. |
| PHP | PHP, supported versions | Supported Versions | Once the four years of support are completed, the branch reaches its end of life and is no longer supported. |
| Ruby | Ruby maintenance branches | Ruby Maintenance Branches | Branch is not supported by the ruby-core team any longer and does not receive any fixes. |
| Go | Go release history | Release Policy | Each major Go release is supported until there are two newer major releases. |

Two more sentences are quoted for Java, because they say what the two kinds of row mean.

| Used for | Page | Section | Sentence |
| --- | --- | --- | --- |
| a Java release that has ended | Eclipse Temurin support, release roadmap | Release Roadmap, footnote 2 | End of Service/Support Life - this code stream is no longer being maintained. |
| a long-term support release | Eclipse Temurin support, release roadmap | Release Roadmap, footnote 1 | As a general philosophy, Adoptium will continue to build binaries for LTS releases as long as the corresponding upstream source is actively maintained. |

## What the pages do not say, and the tool's own choices

The pages give dates. They do not say how many days before an end a team should be told, whether an end date is the last day of support or the first day without it, how to read a range, or which version a tag such as `18-alpine` means. Those are the tool's own choices, and [method.md](method.md) says what each is. A choice of this kind is worded as the tool's own in the message of the finding.

A version that no saved page covers (.NET Framework, Java 9 to 15, a runtime that is not in the list) is reported as not in the data. It is not added from memory: [limits.md](limits.md) lists what was left out and why.
