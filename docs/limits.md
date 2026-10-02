# Limits

## What a folder can show

- **It shows what the files declare, not what runs.** A `package.json` that says `>=18` does not say which Node.js the servers use, and a Dockerfile can be built from a base image that someone else changed. A finding says what a file declares. A pass is not proof that the running system is supported.
- **A range is read at its lowest version.** The lowest version a range allows is the one that decides whether the project can be supported, but the project may in fact run on a newer one. The message says "lowest". A team that runs only the newest version of its range will see a worse state than it has.
- **A declared minimum is not a build.** The `go` line of `go.mod` is the lowest Go that can build the module, and `maven.compiler.release` is the Java level the code is compiled for, not the Java that runs it. The tool reports them as declared.
- **The support dates are the vendors' dates for their own releases.** A distribution, a cloud service or a company that sells longer support may support a version past the date on the page. The tool does not know of any such contract.
- **The data is as old as the saved pages.** The pages were saved on one day. A version released after that day is "not in the data", and a date that a vendor later moved is the old one until the pages are saved again and the data is changed. `test/data.test.js` keeps the data equal to the saved pages; it does not fetch anything.
- **The default of 180 days is the tool's own.** So is reading an end date as the first day without support, and reading a month as the whole month.
- **Only the files in [inputs.md](inputs.md) are read.** A runtime declared anywhere else is not seen.

## Runtimes and frameworks that are not in the data

The tool has a runtime only when an official page states its dates and the page is saved. These were considered and are not in the data, with the reason:

- **.NET Framework** (`net48`, `net472`): no saved page covers it, so a target of this kind is reported as unreadable, and says so. The tool does not read the project files of an old-style project (`TargetFrameworkVersion`) either.
- **.NET Standard** (`netstandard2.0`): it names no runtime and has no support date of its own on the saved pages.
- **Java vendors other than Eclipse Temurin**, and the commercial support dates of any vendor: no page for them is saved. Java 9 to 15 are not on the Temurin page, so they are not in the data.
- **Frameworks that are not runtimes** (Django, Rails, Laravel, Spring, Angular, React and the like): each has its own lifecycle pages, and none is saved. The tool reports runtimes and the .NET platform only.
- **Operating systems, databases and base image families** (Debian, Alpine, Ubuntu, PostgreSQL, MySQL): not read. A Docker tag such as `-bookworm` or `-alpine3.19` is ignored; only the version number at the front of the tag is read.
- **Other runtimes** (Rust, Swift, Kotlin, Perl, Elixir, Deno, Bun): not in the data.
- **Python implementations other than CPython** (`pypy3.9`) and Ruby implementations other than the reference one (`jruby-9.4`): reported as unreadable, because the saved pages are about CPython and the reference Ruby.

## What the readers cannot do

- **No evaluation.** A property (`${java.version}`, `$(Tfm)`), an `ARG` in a Dockerfile and a value computed by a build script are not evaluated. They are reported as unreadable.
- **No resolution of other files.** A Gemfile line `ruby file: ".ruby-version"` is reported as reading another file; `.ruby-version` is read when it is in the folder, as its own declaration.
- **TOML and XML are read by line and by pattern, not parsed.** `requires-python` is read in the `[project]` table when it is on one line, in single or double quotes. A multi-line string, a value that is not a string, and a key set in another way are not read. In a project file the tags `TargetFramework`, `TargetFrameworks`, `maven.compiler.release`, `maven.compiler.source` and `java.version` are read wherever they appear, outside comments, and a condition on a property group is not evaluated: a target inside a condition that never holds is still reported.
- **Dockerfile.** Each `FROM` line is read on its own. A line continued with a backslash, a `--platform` flag with a space and an image that is also a build stage name are not told apart from other lines, except that the flag words are dropped.
- **Monorepos.** Every file in the folder is a declaration of its own. The tool does not know which service a file belongs to, and it does not merge two declarations of the same runtime.

## Limits that stop a run

A file over 2 MB is not read. A line is cut at 2,000 characters, a file is read for at most 20,000 lines and 200 declarations, a run for at most 5,000 declarations. The walk goes down 8 levels by default and looks at no more than 200,000 entries; each stop is a note or a finding in the report. A declared value is read only up to 200 characters.

## What a finding is

A finding is a review item. A version past its end of support is a fact on the saved page. What to do about it, and how soon, depends on how the software is used, what it costs to change, and what else protects it; the tool does not know that.
