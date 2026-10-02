# Secure defaults

What the tool does and does not do on a machine, so that you can run it on a folder in a pipeline without a surprise.

- **It reads text files by name.** It lists the folders under the one you name, picks out the files in [inputs.md](inputs.md) by their names, opens each without following a link, takes the type and the size from the open file, and reads it only when it is a regular file under the size limit.
- **It never runs what it reads.** It does not run, import, evaluate or compile anything from the folder. A `package.json` is parsed as data; a project file, a Gemfile and a Dockerfile are read line by line; a build property is reported as not evaluated.
- **It installs nothing and calls no tool.** It starts no process, runs no package manager and does not use the version managers (`nvm`, `pyenv`, `rbenv`) that its input files are written for.
- **It never follows a symbolic link inside the folder.** A link cannot make it read a file outside the folder or walk a loop. The folder you name may itself be a link: you chose that path.
- **It writes nothing.** The report goes to standard output, and errors go to standard error. The tool creates no file, no folder and no temporary file.
- **It opens no connection.** There is no network code. A URL in place of a path is refused. The lifecycle data is in the package, saved from the official pages; the tool never fetches it, so it needs no credentials and no network.
- **It has no dependencies.** The package has no runtime dependencies; Node 22 or newer is all it needs.
- **It prints no file content except the declared version.** The report holds the name of the file and the place in it, the declared version string (cut to 80 characters), the lowest version read from it, and counts of days. Names and values go through a function that replaces control characters, line separators and direction controls with a space.
- **It escapes what it formats.** The Markdown report escapes pipes, angle brackets, ampersands, backslashes and line breaks, and the CSV report puts a quote before a cell that a spreadsheet would run as a formula.
- **It has limits.** A file of 2 MB, 200,000 entries, 5,000 files of interest, 8 folder levels by default, a declared value of 200 characters, and a regular expression on file content always has a bounded length, so a hostile folder is refused or cut and does not use the time or the memory of the machine.
- **The report date is an input.** The tool takes the date from the clock, or from `--today`. It does not ask a server for the time.

## In a pipeline

A repository holds the names of your files and the versions you run. The report holds fewer values than the folder, but it still names files and versions, so keep it out of artifacts that others can download. Start with the default gate (errors only), and move to `--fail-on warning` when the first report is clean.
