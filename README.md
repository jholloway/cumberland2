# Cumberland

Cumberland is a client-side proofreading web app used by the Nashville.gov Support Team to review and clean text before publishing.

## What the app does

- Accepts pasted text in a large editor.
- Scans text against a rule set based on your custom standards and Chicago-style consistency checks.
- Shows all findings in a fix queue with two categories:
  - `Auto-fix Available`
  - `Needs Manual Review`
- Lets reviewers process findings item-by-item with:
  - `Fix` (safe automated correction when available)
  - `Skip` (keep text as-is and move on)
  - `Jump` (focus the matching location in the text)
- Preserves manual edits and supports copying the revised text to clipboard.

## Current rule coverage (high level)

- Spacing and punctuation cleanup (including line-level whitespace checks).
- Date and time format consistency.
- Phone number format normalization.
- Roadway abbreviation expansion.
- URL detection for manual review.
- All-caps/acronym and abbreviation review.
- Manual Unicode bullet prefix cleanup.

## Technical notes

- Pure front-end app (`index.html`, `styles.css`, `app.js`).
- No backend required.
- Designed for modern browsers.
