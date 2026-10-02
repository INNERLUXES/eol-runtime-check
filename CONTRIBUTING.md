# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, with `!` for a breaking change.

## Changing a check or a reader

1. Describe the change in docs/method.md or docs/inputs.md first: what the check or the reader reports, its severity, what it can see and what it cannot. Where the tool makes a conclusion of its own (a severity, the default number of days, how a range or a month is read), say so and say why, and say it in the message of the finding too.
2. Add a test with the file written inline, small enough that the result can be worked out by hand, and a near miss that must not match. Use made-up names.
3. A value of the folder reaches a finding only as the name of the file, the place in it, or the declared version string, cut and cleaned with `safeText`. Nothing else from a file is kept or shown.
4. A finding id, once released, keeps its meaning: pipelines and other tools read it from the JSON and CSV reports.
5. A thing the tool cannot read is reported, never skipped. A file that cannot be read, a value that cannot be turned into a version, and a version that is not in the data each give a finding, and no date is made up for a version that no saved page lists.
6. A regular expression that runs on the content of a file has a bounded length (`{0,200}`, never `*` on text from a file), and a loop over the content of a file passes it once.

## Changing a date, a version or a quoted sentence

The dates, the versions and the sentences in `src/lifecycle.js` come from the pages saved in `research/sources`. When a page changes, or a release is added, save the new text in `research/sources` (the address on the first line), change `src/lifecycle.js` to match, and update docs/rules-and-sources.md. `test/data.test.js` reads the saved pages with parsers of its own and compares every version, every date, how exact the date is and every quoted sentence, so a date that was typed wrong, or a page that was changed without the data, fails the test.

Never add a version, a date or a sentence from memory or from a blog post. A new runtime needs the official page, fetched and saved, and the words of the page that give the dates. If no page states the dates, the runtime is not added: it goes in docs/limits.md with the reason. Keep a quoted sentence free of a calendar year, because the report shows it with `--no-dates`.

## Dates and years

The README and the documents carry no date and no year. Dates live in `src/lifecycle.js`, in `research/sources` and in the tests. The README example is made with `--no-dates`, and shows counts of days. `npm run example` fixes the report date with `--today`, so the counts never change with the calendar, and fails if the README shows anything other than what the tool prints.

## Paths and platforms

The tests run on Linux, macOS and Windows. A test that depends on the system must say so and be guarded with `process.platform`: a backslash separates folders on Windows and is an ordinary character in a file name on Linux and macOS, a link may not be allowed (and needs a privilege on Windows), a name may or may not be case sensitive (two folders that differ only by case cannot exist on Windows), a control character cannot be in a file name on Windows, folder permissions are not enforced for the superuser, and a device such as `/dev/null` is not there on Windows. Build paths in tests with `resolve()` from names with forward slashes. The report shows paths with forward slashes on every system. Every test passes `--today` or a date in the options, so no test depends on the calendar. Write the line end of a file yourself in a test; never take it from a file in the repository.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the files in docs/inputs.md and writes only to the screen. It fetches nothing, opens no network connection, runs no program, and follows no link inside the folder.
- Source files stay ASCII; build any other character from its number.
- Never commit a real secret or key, even as a fixture. `npm run check` fails on anything that looks like a credential.
- The README and the documents carry no dates or years.

## Before you open the pull request

```
npm test
npm run check
npm run example
```
