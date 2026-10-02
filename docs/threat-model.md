# Threat model

The tool is run on a folder that someone else may have written or changed: a repository that was cloned, an archive that was unpacked, a customer's code. What can go wrong, and what the tool does about it.

## What the tool protects

- The machine that runs it: nothing from the folder is run or imported, nothing is fetched, nothing is written, a link cannot lead it out of the folder, and time and memory are bounded.
- The person who reads the report: no control sequence reaches the terminal, no HTML or Markdown from the folder is active, and no cell of the CSV report runs as a formula.
- The answer: a value that cannot be read is reported with the reason and never guessed, and a version that is not on a saved page is reported as such and never given a date.

## Inputs and the answer to each

| Input | What the tool does |
| --- | --- |
| A symbolic link to a folder, a link that points back up the tree, a link to a file | not followed; counted in a note; a link file is not read |
| A very deep chain of folders | the walk stops at the depth limit, without recursion, and counts what it left |
| Very many files or folders | the walk stops at the entry limit and says so |
| A folder named like a file of interest, or a file named like a skipped folder | a folder is walked as a folder; a file is never skipped by a folder name |
| A file that is huge | refused from the size of the open file, before it is read |
| A binary file, a UTF-16 file, bytes that are not UTF-8 | reported as not read, with the reason |
| JSON nested very deeply, or with `__proto__`, `constructor` or a repeated key | parsed as data by the JSON parser; a failure is a problem with the file; a key is only a key |
| An XML or TOML file with many unclosed tags, comments or tables | read in one pass with expressions of bounded length; no step starts again from the top |
| A line of a million characters, or a file of a hundred thousand lines | the line is cut and the lines are limited |
| A declared value that is very long, or a range with thousands of parts | refused for its length; the message does not repeat the value |
| A value with escape sequences, line separators or direction controls | replaced by a space in every report |
| A value or a file name that starts with a formula character | a quote is put before it in the CSV report |
| A build property, an `ARG`, a variable in a tag | reported as not evaluated |
| A path that is a file, a missing path, a URL, standard input | refused with a message; exit code 2 |
| A file name with a backslash, a space, non-ASCII letters or a leading dot | read as a name; paths in the report always use forward slashes |

## Out of scope

Whether the software you run is safe, what a vendor decides about a release, and how your pipeline stores the folder and the reports. [limits.md](limits.md) lists what a folder cannot show, and [secure-defaults.md](secure-defaults.md) lists what the tool does on a machine.
