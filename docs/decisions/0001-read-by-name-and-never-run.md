# 1. The tool reads files by name and never runs what it reads

## Context

The versions of a project are declared in many places, and the easiest way to get an exact answer is to ask the tools that own those places: `node --version`, `dotnet --list-sdks`, `mvn help:evaluate`, `pip install` in a virtual environment. Each of them runs code that the folder controls (a build script, a plugin, a setup file), needs the tool to be installed, and answers for the machine and not for the project.

The tool is run on code that someone else wrote, often a customer's, often in a pipeline with credentials. It has to be safe to point at any folder, and it has to give the same answer on every machine.

## Decision

The tool reads a fixed list of files, by name, as text, and takes from each only the value or the lines named in [inputs.md](../inputs.md). It starts no process, evaluates no property, installs nothing and follows no link inside the folder. A value that depends on evaluation (a property, a variable, a computed version) is reported as such, not guessed.

## Consequences

- The tool is safe to run on an unknown folder, and the report is the same on Linux, macOS and Windows.
- Some declarations are not seen, and some values are not read. Each is reported as a finding or listed in [limits.md](../limits.md); none is silently passed.
- The XML, TOML and Dockerfile readers work by line and by pattern with expressions of bounded length, and each form they read has a test and a near miss that they must not read.
- The lifecycle data is saved from the official pages and compared with them by tests, so the tool needs no network at run time.
