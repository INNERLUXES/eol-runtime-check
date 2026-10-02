# Inputs

The tool reads a folder: the folder of one project, or of a repository that holds several. It looks at the names of the files under it, picks out the files in the table below, and reads only the value or the lines named here. Nothing else in the folder is opened.

## The files, and what is read from each

| File | What is read | Reported as |
| --- | --- | --- |
| `package.json` | `engines.node`, a range | Node.js, by the lowest version the range allows |
| `.nvmrc` | the first line that is not blank or a comment | Node.js |
| `.node-version` | the first line that is not blank or a comment | Node.js |
| `.python-version` | every line that is not blank or a comment | Python |
| `pyproject.toml` | `requires-python` in the `[project]` table, a range | Python, by the lowest version |
| `runtime.txt` | the first line, written `python-3.11.4` | Python |
| `global.json` | `sdk.version` (comments in the file are allowed) | .NET, by the first part of the SDK version |
| `*.csproj` | `TargetFramework` and `TargetFrameworks`, every target by itself | .NET |
| `pom.xml` | `maven.compiler.release`, `maven.compiler.source` and `java.version` | Java |
| `build.gradle`, `build.gradle.kts` | `sourceCompatibility`, and `languageVersion` of a `JavaLanguageVersion.of(...)` | Java |
| `composer.json` | `require.php`, a range | PHP, by the lowest version |
| `Gemfile` | the `ruby` line, with one or several requirements | Ruby, by the lowest version |
| `.ruby-version` | the first line that is not blank or a comment | Ruby |
| `go.mod` | the `go` line and the `toolchain` line | Go |
| `Dockerfile`, `Dockerfile.*`, `*.Dockerfile` | every `FROM` line of an image named below, by its tag | the runtime of the image |

Names are compared in lower case, so `Dockerfile` and `dockerfile` are the same file on every system.

## Images in a Dockerfile

Only the tag is read, and only for these images: `node`, `python`, `php`, `ruby`, `golang`, `openjdk`, `eclipse-temurin`, and the .NET images `mcr.microsoft.com/dotnet/sdk`, `aspnet`, `runtime` and `runtime-deps` (also under `dotnet/core`). A prefix such as `docker.io/library/` is accepted. An image from a private registry, a stage name, `scratch` and an image named by a variable are not read. A tag with no version number (`lts`, `alpine`, `latest`), no tag at all, a digest alone and a variable in the tag are each reported as a version that could not be read, with the reason.

A tag that names only the major version of a runtime whose support dates follow the minor version (`python:3`, `php:8`) is reported as unreadable, because the image then means the newest minor version and the tool does not guess which one that is.

## Ranges

A range is reported by the lowest version it allows, and the message says so ("allows Node.js 18 as its lowest version"). [method.md](method.md) gives the rules for each kind of range.

## Where the tool looks

- The walk goes down 8 folder levels by default (`--max-depth`), and the folders named `node_modules`, `vendor`, `bin`, `obj`, `target`, `dist`, `.git`, `.hg`, `.svn`, `.venv`, `venv`, `__pycache__`, `.gradle`, `.idea`, `.vs` and `bower_components` are skipped by name, in any case. `--skip` adds names and `--no-default-skip` removes the default ones.
- A symbolic link inside the folder is never followed, and a link to a file is not read. The report counts the links it left alone. The folder that you name on the command line may itself be a link: you chose that path.
- At most 200,000 entries are looked at and at most 5,000 files of interest are read. A file of more than 2 MB is not read.
- Files must be text: UTF-8, with or without a byte order mark. A file with a control byte, a UTF-16 file and a file that is not valid UTF-8 are reported as not read, with the reason.

## What is not read

A project that declares its runtime anywhere else is not seen: a `Directory.Build.props`, a `TargetFrameworkVersion` of an old-style project file, the `python` line of a Poetry table, a `.tool-versions` file, a CI workflow, a `Procfile`, `engines` in a workspace package that the root file does not name, a Dockerfile `ARG` that holds the image, or a version that a build script computes. [limits.md](limits.md) lists these. The tool says what it read; it does not say that nothing else exists.
