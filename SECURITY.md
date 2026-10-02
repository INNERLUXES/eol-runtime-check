# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "eol-runtime-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up folder (the files, written out) that shows the problem, what you expected and what happened. Use made-up names, and no real code, credentials, account numbers, internal addresses or customer information.

## Scope

In scope:

- an input that makes the tool run or import a file of the folder, start a process, fetch an address, open a network connection, write a file, or read a file other than the ones named in docs/inputs.md
- a symbolic link, a loop of links or a very deep folder that makes the tool leave the folder, loop, overflow the stack or read what it should not
- an input that makes the tool print file content other than the values named in docs/secure-defaults.md
- an input that makes the tool hang, take very long, run out of memory or crash, such as a huge file, a very long line or value, a file with very many unclosed tags, a deeply nested JSON file, or very many folders and files
- text from a name or a value that breaks a Markdown table, injects a formula into a CSV report, or rewrites the terminal through control or direction characters
- a declared version that docs/method.md says is read, for an input the tool accepts, that is read as another version or left out of the report, and a file that cannot be read and is not reported
- a date or a sentence in src/lifecycle.js that differs from the saved page in research/sources

Out of scope: whether the software you run is supported or safe (docs/limits.md lists what a folder cannot show), the content of the vendors' lifecycle pages, a vendor changing a date after the pages were saved, and how your pipeline stores the folder and the reports.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
