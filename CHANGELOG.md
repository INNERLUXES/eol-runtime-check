# Changes

## 1.0.0

First release.

- Reads a code folder and finds the runtime and framework versions that it declares, then reports which are past the end of support or close to it. Reads text files by name only. Never runs or imports what it reads, never installs a package, never follows a symbolic link inside the folder, never opens a connection.
- Reads: `package.json` (`engines.node`), `.nvmrc`, `.node-version`, `.python-version`, `pyproject.toml` (`requires-python`), `runtime.txt`, `global.json` (`sdk.version`), `*.csproj` (`TargetFramework`, `TargetFrameworks`), `pom.xml`, `build.gradle` and `build.gradle.kts`, `composer.json` (`require.php`), `Gemfile`, `.ruby-version`, `go.mod`, and the `FROM` lines of Dockerfiles for the node, python, dotnet, openjdk, eclipse-temurin, php, ruby and golang images.
- Runtimes in the data: Node.js, Python, .NET, PHP, Ruby, Go and Java (Eclipse Temurin).
- Errors: `runtime-past-support`.
- Warnings: `runtime-ending-soon`.
- Info findings, which never fail a run: `runtime-supported`, `runtime-vendor-minimum`, `version-not-in-data`, `version-unreadable`, `file-not-read` and `no-runtime-found`.
- For a range such as `>=18`, `^3.9` or `8.*` the tool reports the lowest version the range allows, and says so.
- Every finding names the file, the place, the declared value, the days left or gone, a fix, and the sentence of the official lifecycle page that it rests on, with the address of the page.
- The lifecycle pages (Node.js, Python, .NET, PHP, Ruby, Go, Eclipse Temurin) are saved in `research/sources`; a test reads them again and compares every version, every end date and every quoted sentence with `src/lifecycle.js`. Runtimes that no saved page supports are listed in `docs/limits.md` and are not in the data.
- Options: `--format`, `--fail-on`, `--soon-days`, `--today`, `--no-dates`, `--max-depth`, `--skip` and `--no-default-skip`.
- `--today` fixes the report date, so a report can be repeated for a given day; `--no-dates` leaves every calendar date out of the report and keeps the counts of days.
- Reports as text, Markdown, JSON and CSV; `--fail-on` for a pipeline gate; info never fails the run; exit code `2` for a usage or input error.
- Limits on file size, line length, number of entries, files and declarations, depth and the length of a declared value; the walk uses no recursion.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
