const sourceText = document.getElementById("sourceText");
const scanBtn = document.getElementById("scanBtn");
const copyBtn = document.getElementById("copyBtn");
const resetBtn = document.getElementById("resetBtn");
const actionNotice = document.getElementById("actionNotice");
const issuesList = document.getElementById("issuesList");
const issueSummary = document.getElementById("issueSummary");
const issueItemTemplate = document.getElementById("issueItemTemplate");

let reviewState = {
  currentText: "",
  issues: [],
  hasScanned: false,
  queueDirty: false,
  skippedSignatures: [],
  activeIssueId: null,
};

const DEFINITE = "definite";
const POSSIBLE = "possible";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const ROADWAY_MAP = {
  Rd: "Road",
  Ave: "Avenue",
  St: "Street",
  Blvd: "Boulevard",
  Dr: "Drive",
  Ln: "Lane",
  Ct: "Court",
  Hwy: "Highway",
  Pkwy: "Parkway",
  Pl: "Place",
  Ter: "Terrace",
  Cir: "Circle",
  Expy: "Expressway",
  Fwy: "Freeway",
  Trl: "Trail",
  Sq: "Square",
  Aly: "Alley",
  Byp: "Bypass",
  Rte: "Route",
  Mtwy: "Motorway",
  Xing: "Crossing",
  Spur: "Spur",
  Tpke: "Turnpike",
  Cv: "Cove",
};

const ROADWAY_KEYS = Object.keys(ROADWAY_MAP).join("|");
const DEV_PREFILL_SAMPLE_TEXT = true;
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;

const SAMPLE_TEXT = `City Updates and Public Service Information

The City & County has scheduled road work for August 31 and September 3, 2026. Work will begin at 8:00 AM and end at 4:30 p.m. Please call (555) 123-4567 or 555.987.6543 ext 89 for questions.

Residents on Oak Rd, Pine Ave., and Lake St should expect delays. Crews will also visit River Blvd, Sunset Dr, and Meadow Ln.

A public meeting is set for Jan. 5, 2026 at 7 PM. A follow-up workshop is planned for 1/8/2026 at 12:00 pm. Final notice will be posted on January 9th and again on January 10.

For emergency assistance, contact 555-222-1111 x77. Standard office hours are 8 a.m. to 5 p.m.

The NASA liaison and the FBI task group will attend. All CAPS TERMS, PDF forms, and ID labels should be reviewed for consistency.

Please read the guide carefully.  There should be no double spaces after periods.  Internal spacing should also be consistent.
This  line has two spaces between words for testing.
This   line has three spaces between words for testing.
Spacing before punctuation should be checked too ,  including double spaces near commas.
Missing space after comma,please and after colon:please fix this.
There is a space before a period . And before a semicolon ; too.
    This line starts with leading spaces and should be reviewed.
This line has trailing spaces at the end.    
Correct spacing after punctuation, please: keep this sentence unchanged.
Visit https://www.example.gov/public-notice and www.city-services.gov/forms for more details.
•    This line starts with a Unicode bullet and should be normalized.
•\t\t2026 update item should also be normalized.

Approved examples in this paragraph include January 1, 2026, March 14, and 8:00 a.m.`;

const RULES = [
  {
    id: "ampersand",
    title: "Replace ampersand",
    severity: DEFINITE,
    run(text) {
      return matchAll(text, /&/g).map((m) => ({
        start: m.index,
        end: m.index + 1,
        message: 'Use "and" instead of ampersand.',
        replacement: "and",
      }));
    },
  },
  {
    id: "trailing-whitespace-line",
    title: "Trailing whitespace",
    severity: DEFINITE,
    run(text) {
      return matchAll(text, /[ \t]+(?=\r?\n|$)/g).map((m) => ({
        start: m.index,
        end: m.index + m[0].length,
        message: "Remove trailing spaces at the end of lines.",
        replacement: "",
      }));
    },
  },
  {
    id: "leading-whitespace-line",
    title: "Leading whitespace",
    severity: POSSIBLE,
    run(text) {
      return matchAll(text, /^[ \t]+(?=\S)/gm).map((m) => ({
        start: m.index,
        end: m.index + m[0].length,
        message: "Review line-leading indentation and remove if not intentional.",
        replacement: null,
      }));
    },
  },
  {
    id: "space-before-punctuation",
    title: "Space before punctuation",
    severity: DEFINITE,
    run(text) {
      const urlSpans = getUrlSpans(text);
      const results = [];
      for (const m of matchAll(text, /[ \t]+([,.;:!?])/g)) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (overlapsAnySpan(start, end, urlSpans)) {
          continue;
        }
        results.push({
          start,
          end,
          message: "Remove spaces before punctuation.",
          replacement: m[1],
        });
      }
      return results;
    },
  },
  {
    id: "spacing-after-punctuation",
    title: "Spacing after punctuation",
    severity: DEFINITE,
    run(text) {
      const urlSpans = getUrlSpans(text);
      const results = [];

      for (const m of matchAll(text, /([,.;:!?])[ \t]{2,}(?=\S)/g)) {
        const start = m.index + 1;
        const end = m.index + m[0].length;
        if (overlapsAnySpan(start, end, urlSpans)) {
          continue;
        }
        results.push({
          start,
          end,
          message: "Use one space after punctuation.",
          replacement: " ",
        });
      }

      for (const m of matchAll(text, /([,;:!?])(?=[A-Za-z0-9])/g)) {
        const start = m.index + 1;
        const end = start;
        if (overlapsAnySpan(start, end + 1, urlSpans)) {
          continue;
        }
        results.push({
          start,
          end,
          message: "Insert one space after punctuation.",
          replacement: " ",
        });
      }

      return results;
    },
  },
  {
    id: "extra-internal-whitespace",
    title: "Extra internal spacing",
    severity: DEFINITE,
    run(text) {
      return matchAll(text, /[^\S\n]{2,}/g)
        .filter((m) => !m[0].includes("\n"))
        .filter((m) => {
          const prev = text[m.index - 1] || "";
          const next = text[m.index + m[0].length] || "";
          if (!prev || prev === "\n") {
            return false;
          }
          if (/[,.;:!?]/.test(prev) || /[,.;:!?]/.test(next)) {
            return false;
          }
          return true;
        })
        .map((m) => ({
          start: m.index,
          end: m.index + m[0].length,
          message: "Use a single space.",
          replacement: " ",
        }));
    },
  },
  {
    id: "roadway-abbrev",
    title: "Roadway abbreviation",
    severity: DEFINITE,
    run(text) {
      const pattern = new RegExp(`\\b(${ROADWAY_KEYS})(?:\\.)?(?=$|[\\s,;:!?])`, "g");
      return matchAll(text, pattern).map((m) => {
        const replacement = ROADWAY_MAP[m[1]] || m[1];
        return {
          start: m.index,
          end: m.index + m[0].length,
          message: `Replace with \"${replacement}\".`,
          replacement,
        };
      });
    },
  },
  {
    id: "phone-format",
    title: "Phone number format",
    severity: DEFINITE,
    autoFix(snippet) {
      return normalizePhone(snippet);
    },
    run(text) {
      const results = [];
      const broad = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?:\s?(?:x|ext\.?|extension)\s?\d+)?/gi;
      const strict = /^\d{3}-\d{3}-\d{4}(?: x\d+)?$/;

      for (const m of matchAll(text, broad)) {
        const candidate = m[0].trim();
        if (candidate.length < 10) {
          continue;
        }
        if (!strict.test(candidate)) {
          results.push({
            start: m.index,
            end: m.index + m[0].length,
            message: "Use format 123-456-7890 or 123-456-7890 x123.",
            replacement: null,
          });
        }
      }
      return results;
    },
  },
  {
    id: "date-format",
    title: "Date format",
    severity: DEFINITE,
    autoFix(snippet) {
      return normalizeDate(snippet);
    },
    run(text) {
      const results = [];
      const monthAlternates =
        "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
      const broadDate = new RegExp(
        `\\b(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}|(?:${monthAlternates})\\.?[ -]+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*\\d{2,4})?|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthAlternates})(?:,?\\s*\\d{2,4})?)\\b`,
        "gi"
      );

      for (const m of matchAll(text, broadDate)) {
        const candidate = m[0].replace(/\s+/g, " ").trim();
        if (!isValidGovernmentDate(candidate)) {
          results.push({
            start: m.index,
            end: m.index + m[0].length,
            message: 'Use full month format like "January 1" or "January 1, 2026" (no numeric dates, no month abbreviations, no ordinal suffixes).',
            replacement: null,
          });
        }
      }
      return results;
    },
  },
  {
    id: "time-format",
    title: "Time format",
    severity: DEFINITE,
    autoFix(snippet) {
      return normalizeTimeCandidate(snippet);
    },
    run(text) {
      const results = [];
      const broadTime = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?|am|pm|AM|PM)(?=$|[\s,;:!?])|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
      const strict = /^(?:[1-9]|1[0-2])(?::[0-5]\d)? (?:a\.m\.|p\.m\.)$/;

      for (const m of matchAll(text, broadTime)) {
        const candidate = m[0].trim().replace(/\s+/g, " ");
        if (!strict.test(candidate)) {
          results.push({
            start: m.index,
            end: m.index + m[0].length,
            message: 'Use format like "8 a.m.", "8:00 a.m.", or "12:30 p.m.".',
            replacement: null,
          });
        }
      }
      return results;
    },
  },
  {
    id: "all-caps-review",
    title: "All-caps token review",
    severity: POSSIBLE,
    run(text) {
      const urlSpans = getUrlSpans(text);
      const results = [];
      for (const m of matchAll(text, /\b[A-Z]{2,}[A-Z0-9-]*\b/g)) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (overlapsAnySpan(start, end, urlSpans)) {
          continue;
        }
        const token = m[0];
        if ((token === "AM" || token === "PM") && isMeridiemTokenInTimeContext(text, m.index, m.index + token.length)) {
          continue;
        }
        results.push({
          start,
          end,
          message: "Review all-caps token for appropriateness.",
          replacement: null,
        });
      }
      return results;
    },
  },
  {
    id: "abbreviation-review",
    title: "Abbreviation review",
    severity: POSSIBLE,
    run(text) {
      const urlSpans = getUrlSpans(text);
      const results = [];
      for (const m of matchAll(text, /\b(?:[A-Za-z]{2,}\.){1,}[A-Za-z]*\b/g)) {
        const start = m.index;
        const end = m.index + m[0].length;
        if (overlapsAnySpan(start, end, urlSpans)) {
          continue;
        }
        results.push({
          start,
          end,
          message: "Possible abbreviation. Verify consistency and necessity.",
          replacement: null,
        });
      }
      return results;
    },
  },
  {
    id: "url-review",
    title: "URL review",
    severity: POSSIBLE,
    run(text) {
      return getUrlSpans(text).map((span) => ({
        start: span.start,
        end: span.end,
        message: "Review URL for formatting and policy compliance.",
        replacement: null,
      }));
    },
  },
  {
    id: "manual-bullet-prefix",
    title: "Manual bullet prefix",
    severity: DEFINITE,
    autoFix(snippet) {
      return normalizeManualBulletLine(snippet);
    },
    run(text) {
      const pattern = /^(\u2022[ \t]+[^\n\r]*)/gm;
      return matchAll(text, pattern).map((m) => ({
        start: m.index,
        end: m.index + m[0].length,
        message: "Remove manual Unicode bullet prefix and leading spacing.",
        replacement: null,
      }));
    },
  },
];

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule]));

scanBtn.classList.add("primary");

sourceText.addEventListener("input", () => {
  if (!reviewState.hasScanned) {
    return;
  }
  reviewState.currentText = sourceText.value;
  reviewState.queueDirty = true;
  renderAll();
});

scanBtn.addEventListener("click", () => {
  reviewState.currentText = sourceText.value;
  reviewState.skippedSignatures = [];
  reviewState.issues = scanText(reviewState.currentText, reviewState.skippedSignatures);
  reviewState.activeIssueId = reviewState.issues[0] ? reviewState.issues[0].id : null;
  reviewState.hasScanned = true;
  reviewState.queueDirty = false;
  renderAll(true);
});

copyBtn.addEventListener("click", async () => {
  const revised = reviewState.currentText || sourceText.value;
  try {
    await navigator.clipboard.writeText(revised);
    flashActionNotice("Revised text copied to clipboard.");
  } catch {
    flashActionNotice("Clipboard access failed. Copy directly from the text area.", true);
  }
});

resetBtn.addEventListener("click", () => {
  reviewState.currentText = sourceText.value;
  reviewState.issues = [];
  reviewState.hasScanned = false;
  reviewState.queueDirty = false;
  reviewState.skippedSignatures = [];
  reviewState.activeIssueId = null;
  renderAll();
});

if (DEV_PREFILL_SAMPLE_TEXT) {
  sourceText.value = SAMPLE_TEXT;
}

renderAll();

function scanText(text, skippedSignatures = []) {
  const findings = [];
  for (const rule of RULES) {
    for (const match of rule.run(text)) {
      findings.push({
        id: crypto.randomUUID(),
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        ...match,
      });
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const issue of findings) {
    const key = `${issue.start}|${issue.end}|${issue.message}|${issue.ruleId}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(issue);
    }
  }

  deduped.sort((a, b) => a.start - b.start || a.end - b.end);
  if (!skippedSignatures.length) {
    return deduped;
  }
  return deduped.filter((issue) => !isSuppressedIssue(issue, skippedSignatures, text));
}

function renderAll(autoJumpToCurrent = false) {
  const targetText = reviewState.currentText || sourceText.value;
  if (sourceText.value !== targetText) {
    sourceText.value = targetText;
  }
  renderIssueSummary();
  renderIssues();
  if (autoJumpToCurrent) {
    focusCurrentIssue();
  }
}

function renderIssueSummary() {
  if (!reviewState.hasScanned) {
    issueSummary.textContent = "No scan yet.";
    return;
  }

  if (!reviewState.issues.length) {
    issueSummary.textContent = "Queue complete. No pending issues.";
    return;
  }

  const definite = reviewState.issues.filter((i) => i.severity === DEFINITE).length;
  const possible = reviewState.issues.filter((i) => i.severity === POSSIBLE).length;
  const dirtyNote = reviewState.queueDirty ? " Text edited; queue updates on Fix/Skip." : "";
  issueSummary.textContent = `${reviewState.issues.length} remaining (${definite} auto-fix, ${possible} manual review).${dirtyNote}`;
}

function renderIssues() {
  issuesList.innerHTML = "";
  if (!reviewState.issues.length) {
    const empty = document.createElement("li");
    empty.className = "issue-item";
    empty.textContent = reviewState.hasScanned ? "All queue items are complete." : "Scan text to view issues.";
    issuesList.append(empty);
    return;
  }

  const activeId = getActiveIssueId();
  for (const issue of reviewState.issues) {
    const node = issueItemTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.severity = issue.severity;
    node.dataset.issueId = issue.id;
    if (issue.id === activeId) {
      node.classList.add("active");
    }

    node.querySelector(".issue-title").textContent = issue.title;
    node.querySelector(".issue-context").innerHTML = issueContext(issue);
    node.querySelector(".issue-message").textContent = shortHelperText(issue);

    const controls = node.querySelector(".issue-controls");
    controls.append(
      createButton("Fix", "accept-btn", () => {
        const activeIssue = syncQueueToTextarea(issue);
        if (!activeIssue) {
          flashActionNotice("This item appears resolved already.");
          renderAll();
          return;
        }
        setNextActiveAfterAction(activeIssue.id);
        applyIssueFix(activeIssue);
        renderAll(true);
      })
    );
    controls.append(
      createButton("Skip", "ignore-btn", () => {
        const targetIssue = syncQueueToTextarea(issue);
        if (!targetIssue) {
          flashActionNotice("This item appears resolved already.");
          renderAll(true);
          return;
        }
        setNextActiveAfterAction(targetIssue.id);
        rememberSkippedIssue(targetIssue);
        dismissIssue(targetIssue.id);
        flashActionNotice("Issue skipped.");
        renderAll(true);
      })
    );
    controls.append(
      createButton("Jump", "ignore-btn jump-btn", () => {
        reviewState.activeIssueId = issue.id;
        renderAll();
        jumpToIssue(issue);
      })
    );

    issuesList.append(node);
  }
}

function issueContext(issue) {
  const lead = Math.max(0, issue.start - 14);
  const text = reviewState.currentText || "";
  const trail = Math.min(text.length, issue.end + 14);

  const before = escapeHtml(text.slice(lead, issue.start).replace(/\s+/g, " "));
  const focus = escapeHtml(text.slice(issue.start, issue.end).replace(/\s+/g, " "));
  const after = escapeHtml(text.slice(issue.end, trail).replace(/\s+/g, " "));
  return `<code>${before}<mark>${focus}</mark>${after}</code>`;
}

function shortHelperText(issue) {
  switch (issue.ruleId) {
    case "ampersand":
      return 'Use "and".';
    case "trailing-whitespace-line":
      return "Remove trailing spaces.";
    case "leading-whitespace-line":
      return "Review/remove line indentation.";
    case "space-before-punctuation":
      return "No spaces before punctuation.";
    case "spacing-after-punctuation":
      return "One space after punctuation.";
    case "extra-internal-whitespace":
      return "Use one space only.";
    case "roadway-abbrev":
      return "Spell out roadway type.";
    case "phone-format":
      return "Use 123-456-7890 (x123 optional).";
    case "date-format":
      return "Use full month, no suffixes.";
    case "time-format":
      return "Use 8 a.m. / 8:00 a.m. format.";
    case "url-review":
      return "Review URL format manually.";
    case "manual-bullet-prefix":
      return "Remove manual bullet prefix.";
    case "all-caps-review":
      return "Review all-caps term manually.";
    case "abbreviation-review":
      return "Review abbreviation manually.";
    default:
      return "Review this item.";
  }
}

function jumpToIssue(issue) {
  sourceText.focus();
  sourceText.value = reviewState.currentText || sourceText.value;
  sourceText.setSelectionRange(issue.start, issue.end);
  scrollTextareaToIndex(sourceText, issue.start);
}

function focusCurrentIssue() {
  const activeId = getActiveIssueId();
  const nextIssue = reviewState.issues.find((issue) => issue.id === activeId) || reviewState.issues[0];
  if (!nextIssue) {
    return;
  }
  jumpToIssue(nextIssue);
}

function dismissIssue(issueId) {
  reviewState.issues = reviewState.issues.filter((issue) => issue.id !== issueId);
}

function syncQueueToTextarea(anchorIssue = null) {
  if (!reviewState.hasScanned) {
    return null;
  }
  if (sourceText.value !== reviewState.currentText || reviewState.queueDirty) {
    reviewState.currentText = sourceText.value;
    reviewState.issues = scanText(reviewState.currentText, reviewState.skippedSignatures);
    reviewState.queueDirty = false;
    if (!reviewState.issues.some((issue) => issue.id === reviewState.activeIssueId)) {
      reviewState.activeIssueId = reviewState.issues[0] ? reviewState.issues[0].id : null;
    }
  }
  if (!anchorIssue) {
    return reviewState.issues.find((issue) => issue.id === getActiveIssueId()) || reviewState.issues[0] || null;
  }
  return findMatchingIssue(anchorIssue, reviewState.issues);
}

function findMatchingIssue(anchorIssue, issues) {
  if (!issues.length) {
    return null;
  }
  const exact = issues.find((issue) => issue.ruleId === anchorIssue.ruleId && issue.start === anchorIssue.start && issue.end === anchorIssue.end);
  if (exact) {
    return exact;
  }

  const sameRule = issues.filter((issue) => issue.ruleId === anchorIssue.ruleId);
  if (!sameRule.length) {
    return null;
  }

  sameRule.sort((a, b) => Math.abs(a.start - anchorIssue.start) - Math.abs(b.start - anchorIssue.start));
  const nearest = sameRule[0];
  return Math.abs(nearest.start - anchorIssue.start) <= 100 ? nearest : null;
}

function getActiveIssueId() {
  if (reviewState.activeIssueId && reviewState.issues.some((issue) => issue.id === reviewState.activeIssueId)) {
    return reviewState.activeIssueId;
  }
  reviewState.activeIssueId = reviewState.issues[0] ? reviewState.issues[0].id : null;
  return reviewState.activeIssueId;
}

function setNextActiveAfterAction(currentIssueId) {
  const index = reviewState.issues.findIndex((issue) => issue.id === currentIssueId);
  if (index === -1) {
    reviewState.activeIssueId = reviewState.issues[0] ? reviewState.issues[0].id : null;
    return;
  }
  const next = reviewState.issues[index + 1] || reviewState.issues[index - 1] || null;
  reviewState.activeIssueId = next ? next.id : null;
}

function rememberSkippedIssue(issue) {
  const snippet = (reviewState.currentText || "").slice(issue.start, issue.end).trim();
  if (!snippet) {
    return;
  }
  const signature = {
    ruleId: issue.ruleId,
    snippet,
    start: issue.start,
  };
  reviewState.skippedSignatures.push(signature);
  if (reviewState.skippedSignatures.length > 500) {
    reviewState.skippedSignatures = reviewState.skippedSignatures.slice(-500);
  }
}

function isSuppressedIssue(issue, signatures, text) {
  const snippet = text.slice(issue.start, issue.end).trim();
  if (!snippet) {
    return false;
  }
  return signatures.some(
    (sig) => sig.ruleId === issue.ruleId && sig.snippet === snippet && Math.abs(sig.start - issue.start) <= 150
  );
}

function applyIssueFix(issue) {
  const current = reviewState.currentText || "";
  const snippet = current.slice(issue.start, issue.end);
  const rule = RULE_BY_ID.get(issue.ruleId);
  const computedReplacement = issue.replacement ?? (rule && typeof rule.autoFix === "function" ? rule.autoFix(snippet, issue, current) : null);

  if (computedReplacement === null) {
    flashActionNotice("No safe automatic fix for this item. Use Skip to continue.", true);
    return;
  }

  const originalLength = issue.end - issue.start;
  const delta = computedReplacement.length - originalLength;
  reviewState.currentText = `${current.slice(0, issue.start)}${computedReplacement}${current.slice(issue.end)}`;
  sourceText.value = reviewState.currentText;
  flashActionNotice("Issue fixed.");

  const nextIssues = [];
  for (const candidate of reviewState.issues) {
    if (candidate.id === issue.id) {
      continue;
    }

    if (candidate.end <= issue.start) {
      nextIssues.push(candidate);
      continue;
    }

    if (candidate.start >= issue.end) {
      nextIssues.push({
        ...candidate,
        start: candidate.start + delta,
        end: candidate.end + delta,
      });
      continue;
    }
    // Drop overlapping issues because offsets changed in-place.
  }

  nextIssues.sort((a, b) => a.start - b.start || a.end - b.end);
  reviewState.issues = nextIssues;
  if (!reviewState.issues.some((item) => item.id === reviewState.activeIssueId)) {
    reviewState.activeIssueId = reviewState.issues[0] ? reviewState.issues[0].id : null;
  }
}

function createButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function scrollTextareaToIndex(textarea, index) {
  const style = getComputedStyle(textarea);
  const mirror = document.createElement("div");
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  mirror.style.overflowWrap = "break-word";
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.font = style.font;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.textIndent = style.textIndent;
  mirror.style.textTransform = style.textTransform;

  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = textarea.value[index] || " ";
  mirror.append(marker);
  document.body.append(mirror);

  const markerTop = marker.offsetTop;
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  textarea.scrollTop = Math.max(0, markerTop - textarea.clientHeight / 2 + lineHeight);

  mirror.remove();
}

function normalizePhone(value) {
  const extMatch = value.match(/(?:x|ext\.?|extension)\s*(\d+)/i);
  const ext = extMatch ? extMatch[1] : "";
  const mainPart = value.replace(/(?:x|ext\.?|extension)\s*\d+/i, "");
  const digits = mainPart.replace(/\D/g, "");
  const core = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (core.length !== 10) {
    return null;
  }
  const formatted = `${core.slice(0, 3)}-${core.slice(3, 6)}-${core.slice(6)}`;
  return ext ? `${formatted} x${ext}` : formatted;
}

function normalizeDate(value) {
  const compact = value.replace(/\s+/g, " ").replace(/\./g, "").trim();
  let monthIndex = null;
  let day = null;
  let year = null;

  const slash = compact.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) {
    monthIndex = Number(slash[1]) - 1;
    day = Number(slash[2]);
    year = Number(slash[3]);
  }

  const ymd = compact.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (ymd) {
    year = Number(ymd[1]);
    monthIndex = Number(ymd[2]) - 1;
    day = Number(ymd[3]);
  }

  const monthFirst = compact.match(/^([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,)? (\d{4})$/);
  if (monthFirst) {
    monthIndex = monthNameToIndex(monthFirst[1]);
    day = Number(monthFirst[2]);
    year = Number(monthFirst[3]);
  }

  const dayFirst = compact.match(/^(\d{1,2})(?:st|nd|rd|th)? ([A-Za-z]+)(?:,)? (\d{4})$/);
  if (dayFirst) {
    day = Number(dayFirst[1]);
    monthIndex = monthNameToIndex(dayFirst[2]);
    year = Number(dayFirst[3]);
  }

  const monthDayOnly = compact.match(/^([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?$/);
  if (monthDayOnly) {
    monthIndex = monthNameToIndex(monthDayOnly[1]);
    day = Number(monthDayOnly[2]);
    year = null;
  }

  if (monthIndex === null || day === null) {
    return null;
  }
  if (monthIndex < 0 || monthIndex > 11 || day < 1) {
    return null;
  }

  const maxDay = year === null ? maxDayForMonth(monthIndex) : new Date(year, monthIndex + 1, 0).getDate();
  if (day > maxDay) {
    return null;
  }

  return year === null ? `${MONTHS[monthIndex]} ${day}` : `${MONTHS[monthIndex]} ${day}, ${year}`;
}

function monthNameToIndex(name) {
  const normalized = name.toLowerCase();
  const map = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sept: 8,
    sep: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  };
  return Object.prototype.hasOwnProperty.call(map, normalized) ? map[normalized] : null;
}

function isValidGovernmentDate(value) {
  const m = value.match(/^([A-Za-z]+) ([0-9]{1,2})(?:, ([0-9]{4}))?$/);
  if (!m) {
    return false;
  }

  const [, month, dayText, yearText] = m;
  if (!MONTHS.includes(month)) {
    return false;
  }

  // Reject leading zeros in day.
  if (dayText.length > 1 && dayText.startsWith("0")) {
    return false;
  }

  const day = Number(dayText);
  if (day < 1) {
    return false;
  }

  const monthIndex = MONTHS.indexOf(month);
  const maxDay = yearText ? new Date(Number(yearText), monthIndex + 1, 0).getDate() : maxDayForMonth(monthIndex);
  return day <= maxDay;
}

function maxDayForMonth(monthIndex) {
  if (monthIndex === 1) {
    return 29;
  }
  return [3, 5, 8, 10].includes(monthIndex) ? 30 : 31;
}

function getUrlSpans(text) {
  return matchAll(text, URL_PATTERN).map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
}

function overlapsAnySpan(start, end, spans) {
  return spans.some((span) => start < span.end && end > span.start);
}

function normalizeTimeCandidate(value) {
  const compact = value.trim().replace(/\s+/g, " ");
  const withMeridiem = compact.match(/^([0-9]{1,2})(?::([0-9]{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm|AM|PM)$/);
  if (withMeridiem) {
    const hour = Number(withMeridiem[1]);
    const minute = withMeridiem[2];
    if (hour < 1 || hour > 12) {
      return null;
    }
    if (minute && (Number(minute) < 0 || Number(minute) > 59)) {
      return null;
    }
    const meridiem = /^p/i.test(withMeridiem[3]) ? "p.m." : "a.m.";
    return minute ? `${hour}:${minute} ${meridiem}` : `${hour} ${meridiem}`;
  }

  return null;
}

function normalizeManualBulletLine(value) {
  const firstAlphaNum = value.search(/[A-Za-z0-9]/);
  if (firstAlphaNum === -1) {
    return value.replace(/^\u2022[ \t]*/, "");
  }
  return value.slice(firstAlphaNum);
}

function isMeridiemTokenInTimeContext(text, start, end) {
  const before = text.slice(Math.max(0, start - 10), start);
  const after = text.slice(end, Math.min(text.length, end + 2));
  const hasTimeBefore = /(?:[1-9]|1[0-2])(?::[0-5]\d)?\s*$/i.test(before);
  const hasBoundaryAfter = after === "" || /^[\s.,;!?)]/.test(after);
  return hasTimeBefore && hasBoundaryAfter;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function flashActionNotice(message, isError = false) {
  actionNotice.textContent = message;
  if (isError) {
    actionNotice.style.color = "#9f1239";
  } else {
    actionNotice.style.color = "";
  }

  setTimeout(() => {
    if (actionNotice.textContent === message) {
      actionNotice.textContent = "";
    }
  }, 2500);
}

function matchAll(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const safePattern = new RegExp(pattern.source, flags);
  return Array.from(text.matchAll(safePattern));
}
