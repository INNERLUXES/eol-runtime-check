## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a reader or to a version range is described in docs/method.md, says what it can and cannot read, and has a test with the file written inline and a near miss that must not match
- [ ] A change to a date, a version or a quoted sentence follows the source: the new page text is saved in research/sources, `src/lifecycle.js` and docs/rules-and-sources.md match it, and nothing was added from memory
- [ ] A runtime that no saved page supports is not added; it goes in docs/limits.md
- [ ] A conclusion that no source states (a severity, the default number of days, how a month without a day is read) is worded as the tool's own, in the message and in docs/method.md
- [ ] The tool still reads only the files named in docs/inputs.md, never runs or imports what it reads, and never follows a symbolic link inside the folder
- [ ] A thing the tool cannot read is reported as a finding or a note, never skipped and never shown as passed
- [ ] Every size, depth and count limit still holds, and a regular expression on file content has a bounded length
- [ ] A test that depends on the operating system (a path, a backslash, a link, the case of a name, a line end) is guarded with `process.platform` or writes the line end itself
- [ ] The README and the documents carry no date and no year; dates stay in `src/lifecycle.js`, `research/sources` and the tests
- [ ] No real secret, key or account number in fixtures or examples
- [ ] The commit messages of this pull request follow Conventional Commits
