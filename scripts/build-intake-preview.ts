/**
 * Validates the questionnaire definition and generates the client intake form
 * from it, so the form Mike reviews and the definition we build from cannot
 * drift apart.
 *
 * Presentation follows ASK-MIKE-IDENTITY.md. No question wording or logic is
 * set here; all of that lives in src/intake/questionnaire.ts.
 *
 * Usage: npx tsx scripts/build-intake-preview.ts <output.html>
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { QUESTIONNAIRE, allQuestions } from "../src/intake/questionnaire.ts";
import type { Question, Section } from "../src/intake/questionnaire.ts";

// ---------------------------------------------------------------- validation

const problems: string[] = [];
const byId = new Map<string, Question>();

for (const q of allQuestions()) {
  if (byId.has(q.id)) problems.push(`duplicate question id: ${q.id}`);
  byId.set(q.id, q);
}

for (const q of allQuestions()) {
  if (!q.showIf) continue;
  const target = byId.get(q.showIf.question);
  if (!target) {
    problems.push(`${q.id} is revealed by "${q.showIf.question}", which does not exist`);
    continue;
  }
  if (target.kind === "boolean") {
    const bad = q.showIf.equals.filter((v) => v !== "yes" && v !== "no");
    if (bad.length) problems.push(`${q.id} expects ${bad.join(", ")} from the yes/no question ${target.id}`);
  } else if (target.options) {
    const valid = new Set(target.options.map((o) => o.value));
    const bad = q.showIf.equals.filter((v) => !valid.has(v));
    if (bad.length) problems.push(`${q.id} expects ${bad.join(", ")} from ${target.id}, which never offers it`);
  }
}

for (const q of allQuestions()) {
  if ((q.kind === "choice" || q.kind === "multichoice") && !q.options?.length) {
    problems.push(`${q.id} is a ${q.kind} with no options`);
  }
}

if (problems.length) {
  console.error("QUESTIONNAIRE PROBLEMS:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const total = allQuestions().length;
console.log("Questionnaire is consistent.");
console.log(`  sections            ${QUESTIONNAIRE.length}`);
console.log(
  `  questions           ${total}  (${allQuestions().filter((q) => q.half === "eligibility").length} eligibility, ${allQuestions().filter((q) => q.half === "fit").length} fit)`,
);
console.log(`  asked per person    ${allQuestions().filter((q) => q.perPerson).length}`);
console.log(`  conditional         ${allQuestions().filter((q) => q.showIf).length}`);
console.log(`  optional            ${allQuestions().filter((q) => !q.required).length}`);
console.log(`  offer "not sure"    ${allQuestions().filter((q) => q.allowUnsure).length}`);

// -------------------------------------------------------------------- output

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The Reply. Wide soft speech bubble, amber dot. Never outlined, never shadowed. */
const MARK = (size: number, fill = "#0F7CC0") =>
  `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true">` +
  `<path d="M6 17a11 11 0 0 1 11-11h14a11 11 0 0 1 11 11v7a11 11 0 0 1-11 11h-8l-9 6.5V35A11 11 0 0 1 6 24z" fill="${fill}"/>` +
  `<circle cx="24" cy="20.5" r="5.5" fill="#F2A65A"/></svg>`;

/** Fatter variant for small sizes, where the tail and radii collapse. */
const MARK_SMALL = (size: number, fill: string) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true">` +
  `<path d="M5 16.5a11.5 11.5 0 0 1 11.5-11.5h15A11.5 11.5 0 0 1 43 16.5v8A11.5 11.5 0 0 1 31.5 36h-8l-9 7v-7.3A11.5 11.5 0 0 1 5 24.5z" fill="${fill}"/>` +
  `<circle cx="24" cy="20.5" r="6" fill="#FBEEDD"/></svg>`;

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#FCFBF8"/><path d="M5 16.5a11.5 11.5 0 0 1 11.5-11.5h15A11.5 11.5 0 0 1 43 16.5v8A11.5 11.5 0 0 1 31.5 36h-8l-9 7v-7.3A11.5 11.5 0 0 1 5 24.5z" fill="#0F7CC0"/><circle cx="24" cy="20.5" r="6" fill="#F2A65A"/></svg>`,
  );

function renderInput(q: Question): string {
  const name = esc(q.id);
  switch (q.kind) {
    case "code":
      return `<input class="field code" type="text" id="${name}" name="${name}" placeholder="K7M4QX" maxlength="6" autocomplete="off" spellcheck="false" />`;
    case "number":
      return `<div class="withunit"><input class="field short" type="number" id="${name}" name="${name}" min="0" />${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div>`;
    case "currency":
      return `<div class="withunit"><span class="unit">$</span><input class="field short" type="number" id="${name}" name="${name}" min="0" step="1" /></div>`;
    case "text":
      return `<input class="field" type="text" id="${name}" name="${name}" />`;
    case "longtext":
      return `<textarea class="field" id="${name}" name="${name}" rows="4"></textarea>`;
    case "repeater":
      return `<div class="repeater"><input class="field" type="text" name="${name}_1" aria-label="${esc(q.label)}, first entry" /><input class="field" type="text" name="${name}_2" aria-label="${esc(q.label)}, second entry" /><button class="btn quiet addmore" type="button">Add another</button></div>`;
    case "boolean":
      return `<div class="choices" role="radiogroup" aria-labelledby="${name}-label">
        <label class="choice"><input type="radio" name="${name}" value="yes" /><span class="dot"></span><span class="ctext">Yes</span></label>
        <label class="choice"><input type="radio" name="${name}" value="no" /><span class="dot"></span><span class="ctext">No</span></label>
      </div>`;
    case "choice":
      return `<div class="choices" role="radiogroup" aria-labelledby="${name}-label">${(q.options ?? [])
        .map(
          (o) =>
            `<label class="choice"><input type="radio" name="${name}" value="${esc(o.value)}" /><span class="dot"></span><span class="ctext">${esc(o.label)}</span></label>`,
        )
        .join("")}</div>`;
    case "multichoice":
      return `<div class="choices">${(q.options ?? [])
        .map(
          (o) =>
            `<label class="choice multi"><input type="checkbox" name="${name}" value="${esc(o.value)}" /><span class="dot"></span><span class="ctext">${esc(o.label)}</span></label>`,
        )
        .join("")}</div>`;
    default:
      return `<input class="field" type="text" id="${name}" name="${name}" />`;
  }
}

function renderQuestion(q: Question): string {
  const cond = q.showIf
    ? ` data-showif-q="${esc(q.showIf.question)}" data-showif-v="${esc(q.showIf.equals.join("|"))}" hidden`
    : "";

  const tags = [
    q.required ? "" : `<span class="tag">optional</span>`,
    q.perPerson ? `<span class="tag">asked per person</span>` : "",
    q.showIf
      ? `<span class="tag cond">only if ${esc(q.showIf.question.replace(/_/g, " "))} is ${esc(q.showIf.equals.join(" or "))}</span>`
      : "",
    `<span class="tag route-${q.routing}">${q.routing}</span>`,
  ]
    .filter(Boolean)
    .join("");

  // The "why we ask" callout is collapsed on the client view and always open on
  // the review view. Reassurance, never an alert.
  const why = q.rationale
    ? `<details class="why"><summary>${MARK_SMALL(19, "#C67E32")}<span>Why we ask</span></summary><p>${esc(q.rationale)}</p></details>`
    : "";

  return `<div class="q" data-q="${esc(q.id)}"${cond}>
    <label class="qlabel" id="${esc(q.id)}-label" for="${esc(q.id)}">${esc(q.label)}</label>
    ${q.help ? `<p class="qhelp">${esc(q.help)}</p>` : ""}
    ${renderInput(q)}
    ${q.allowUnsure ? `<label class="unsure"><input type="checkbox" name="${esc(q.id)}_unsure" /><span>I am not sure</span></label>` : ""}
    ${why}
    <div class="meta"><div class="tags">${tags}</div></div>
  </div>`;
}

function renderSection(s: Section, n: number): string {
  return `<section class="step" data-step="${n}">
    <div class="card">
      <header class="stephead">
        <p class="eyebrow">Step ${n} of ${QUESTIONNAIRE.length}</p>
        <h2>${esc(s.title)}</h2>
        ${s.blurb ? `<p class="blurb">${esc(s.blurb)}</p>` : ""}
      </header>
      <div class="qs">${s.questions.map(renderQuestion).join("")}</div>
      <footer class="stepfoot">
        <button class="btn quiet" type="button">Save and finish later</button>
      </footer>
    </div>
  </section>`;
}

const sections = QUESTIONNAIRE.map((s, i) => renderSection(s, i + 1)).join("");

const html = `<title>Ask Mike, client intake</title>
<meta name="robots" content="noindex, nofollow" />
<meta name="theme-color" content="#FCFBF8" />
<link rel="icon" href="${FAVICON}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />

<style>
  :root {
    --am-ink:        #14304A;
    --am-ink-soft:   #4A6076;
    --am-muted:      #7C8FA3;

    --am-blue-800:   #083F66;
    --am-blue-700:   #0B5E96;
    --am-blue-600:   #0F7CC0;
    --am-blue-300:   #7FBCE4;
    --am-blue-100:   #E3F0F9;
    --am-blue-50:    #F2F8FC;

    --am-amber-600:  #C67E32;
    --am-amber-500:  #E8973F;
    --am-amber-400:  #F2A65A;
    --am-amber-100:  #FBEEDD;
    --am-amber-text: #8A5A1E;

    --am-green:      #2E8B72;
    --am-green-100:  #E4F1EC;
    --am-alert:      #B4472E;
    --am-alert-100:  #F8E9E5;

    --am-paper:      #FCFBF8;
    --am-white:      #FFFFFF;
    --am-line:       #E0E8EF;
    --am-line-soft:  #F0F4F8;

    --display: "Instrument Serif", Georgia, serif;
    --sans: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
    --measure: 620px;
    --r-control: 12px;
    --r-card: 18px;
    --r-panel: 24px;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: var(--am-paper);
    color: var(--am-ink);
    font-family: var(--sans);
    font-size: 17px;
    line-height: 1.65;
    -webkit-text-size-adjust: 100%;
    font-variant-numeric: tabular-nums;
  }

  p, h1, h2 { text-wrap: pretty; }

  /* ---------------------------------------------------------------- header */

  .topbar {
    position: sticky; top: 0; z-index: 20;
    background: var(--am-white);
    border-bottom: 1px solid var(--am-line);
    padding: 12px clamp(16px, 4vw, 32px);
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }

  .lockup { display: inline-flex; align-items: center; gap: 0.34em; margin-right: auto; }
  .lockup .word {
    font-family: var(--display); font-weight: 400; font-size: 26px;
    line-height: 1; letter-spacing: -0.015em; color: var(--am-ink);
  }

  .progress { display: flex; align-items: center; gap: 12px; }
  .progress .track {
    width: 130px; height: 6px; border-radius: 3px;
    background: var(--am-blue-100); overflow: hidden;
  }
  .progress .fill {
    height: 100%; width: 0%; background: var(--am-blue-600);
    transition: width 150ms ease-out;
  }
  .progress .count { font-size: 14px; line-height: 1.4; color: var(--am-muted); }

  .viewtoggle { display: flex; gap: 8px; }
  .viewtoggle .btn { padding: 8px 14px; font-size: 14px; min-height: 36px; }

  /* ------------------------------------------------------------- the notice */

  .notice {
    background: var(--am-blue-50);
    border-bottom: 1px solid var(--am-line);
    color: var(--am-ink-soft);
    font-size: 14px; line-height: 1.55;
    padding: 12px clamp(16px, 4vw, 32px);
  }
  .notice b { color: var(--am-ink); font-weight: 600; }

  /* ----------------------------------------------------------------- shell */

  main { max-width: var(--measure); margin: 0 auto; padding: 56px clamp(16px, 4vw, 24px) 64px; }

  .hero { margin-bottom: 40px; }
  .hero h1 {
    font-family: var(--display); font-weight: 400;
    font-size: clamp(34px, 7vw, 46px); line-height: 1.06;
    letter-spacing: -0.02em; margin: 0 0 16px; color: var(--am-ink);
  }
  .hero p { margin: 0 0 12px; color: var(--am-ink-soft); }

  .helpful {
    background: var(--am-amber-100); color: var(--am-amber-text);
    border-radius: var(--r-control); padding: 15px 17px;
    font-size: 14px; line-height: 1.55; margin-top: 20px;
    display: flex; gap: 10px; align-items: flex-start;
  }
  .helpful b { color: var(--am-amber-text); font-weight: 600; }
  .helpful svg { flex: none; margin-top: 1px; }

  /* ------------------------------------------------------------------ card */

  .step { margin-bottom: 24px; }
  .card {
    background: var(--am-white);
    border: 1px solid var(--am-line);
    border-radius: var(--r-card);
    box-shadow: 0 1px 2px rgba(20, 48, 74, 0.04);
    padding: clamp(20px, 5vw, 32px);
  }

  .stephead { margin-bottom: 28px; }
  .eyebrow {
    font-size: 12px; line-height: 1; font-weight: 600;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--am-muted); margin: 0 0 10px;
  }
  .stephead h2 {
    font-family: var(--display); font-weight: 400;
    font-size: clamp(26px, 5vw, 34px); line-height: 1.1;
    margin: 0; color: var(--am-ink); letter-spacing: -0.01em;
  }
  .blurb { margin: 12px 0 0; color: var(--am-ink-soft); font-size: 16px; line-height: 1.6; }

  .qs { display: flex; flex-direction: column; gap: 32px; }

  .q { display: flex; flex-direction: column; gap: 10px; }
  .q[hidden] { display: none; }

  .qlabel { font-size: 21px; line-height: 1.35; font-weight: 500; color: var(--am-ink); }
  .qhelp { margin: -2px 0 2px; font-size: 14px; line-height: 1.55; color: var(--am-ink-soft); }

  /* ---------------------------------------------------------------- fields */

  .field {
    font: inherit; font-size: 17px; width: 100%;
    padding: 13px 16px;
    border: 1.5px solid var(--am-line);
    border-radius: var(--r-control);
    background: var(--am-white); color: var(--am-ink);
    min-height: 48px;
    transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
  }
  .field:hover { border-color: #C6DDEE; }
  .field:focus-visible {
    outline: none;
    border-color: var(--am-blue-600);
    box-shadow: 0 0 0 4px var(--am-blue-100);
  }
  .field.short { max-width: 180px; }
  .field.code { max-width: 180px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500; }
  textarea.field { resize: vertical; line-height: 1.6; }

  .withunit { display: flex; align-items: center; gap: 10px; }
  .unit { color: var(--am-muted); font-size: 16px; }

  /* --------------------------------------------------------------- choices */

  .choices { display: flex; flex-direction: column; gap: 10px; }

  .choice {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 16px 18px; min-height: 44px;
    border: 1.5px solid var(--am-line);
    border-radius: var(--r-control);
    background: var(--am-white);
    cursor: pointer;
    transition: border-color 150ms ease-out, background-color 150ms ease-out;
  }
  .choice:hover { border-color: #C6DDEE; background: var(--am-paper); }
  .choice input { position: absolute; opacity: 0; width: 0; height: 0; }

  .choice .dot {
    flex: none; width: 20px; height: 20px; margin-top: 2px;
    border: 1.5px solid var(--am-muted); border-radius: 50%;
    background: var(--am-white);
    transition: border-color 150ms ease-out, box-shadow 150ms ease-out;
  }
  .choice.multi .dot { border-radius: 6px; }

  .choice .ctext { font-size: 16px; line-height: 1.5; color: var(--am-ink); }

  /* Selection is driven by an explicit class rather than :has(input:checked).
     Some engines report :has() as supported but do not re-evaluate it when the
     checked state changes, and older Safari and Chrome lack it entirely. This
     is the most used control in the product, so it does not get to depend on
     a selector that might not repaint. */
  .choice.is-selected { border-color: var(--am-blue-600); background: var(--am-blue-50); }
  .choice.is-selected .dot {
    border-color: var(--am-blue-600);
    box-shadow: inset 0 0 0 6px var(--am-blue-600);
  }
  .choice.is-focus {
    border-color: var(--am-blue-600);
    box-shadow: 0 0 0 4px var(--am-blue-100);
  }

  /* "I am not sure" must look like a legitimate answer, because it is one. */
  .unsure {
    display: inline-flex; align-items: center; gap: 9px;
    font-size: 14px; color: var(--am-ink-soft); cursor: pointer;
    padding: 6px 2px; align-self: flex-start;
  }
  .unsure input { accent-color: var(--am-blue-600); width: 16px; height: 16px; }

  .repeater { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }

  /* --------------------------------------------------------------- buttons */

  .btn {
    font: inherit; font-size: 16px; font-weight: 600;
    border-radius: var(--r-control);
    padding: 14px 26px; min-height: 48px;
    cursor: pointer; border: none;
    transition: background-color 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
  }
  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px var(--am-blue-100);
    border-color: var(--am-blue-600);
  }
  .btn.primary { background: var(--am-blue-600); color: #fff; }
  .btn.primary:hover { background: var(--am-blue-700); }
  .btn.secondary {
    background: var(--am-white); color: var(--am-blue-700);
    border: 1.5px solid #C6DDEE;
  }
  .btn.secondary:hover { border-color: var(--am-blue-600); background: var(--am-blue-50); }
  .btn.secondary[aria-pressed="true"] { background: var(--am-blue-600); color: #fff; border-color: var(--am-blue-600); }
  .btn.quiet { background: transparent; color: var(--am-ink-soft); padding: 12px 8px; min-height: 44px; }
  .btn.quiet:hover { color: var(--am-ink); }

  .stepfoot {
    margin-top: 28px; padding-top: 20px;
    border-top: 1px solid var(--am-line-soft);
    display: flex; justify-content: flex-end;
  }

  /* ------------------------------------------------------- why we ask */

  .why {
    background: var(--am-amber-100);
    border-radius: var(--r-control);
    padding: 15px 17px;
    align-self: flex-start; max-width: 100%;
  }
  .why summary {
    display: flex; align-items: center; gap: 9px;
    cursor: pointer; list-style: none;
    font-size: 14px; font-weight: 600; color: var(--am-amber-text);
    min-height: 24px;
  }
  .why summary::-webkit-details-marker { display: none; }
  .why summary:focus-visible { outline: 2px solid var(--am-amber-600); outline-offset: 3px; border-radius: 4px; }
  .why p {
    margin: 10px 0 0; font-size: 14px; line-height: 1.55;
    color: var(--am-amber-text);
  }

  /* ------------------------------------------------- review layer */

  .meta { display: none; }
  body.reviewing .meta { display: block; }
  body.reviewing .q[hidden] { display: flex; opacity: 0.6; }

  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag {
    font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
    font-weight: 600; padding: 3px 8px; border-radius: 6px;
    background: var(--am-line-soft); color: var(--am-muted);
  }
  .tag.cond { background: var(--am-green-100); color: var(--am-green); }
  .tag.route-intake { background: var(--am-blue-100); color: var(--am-blue-700); }
  .tag.route-flag { background: var(--am-amber-100); color: var(--am-amber-text); }

  /* ------------------------------------------------------------------ end */

  .end {
    background: var(--am-white); border: 1px solid var(--am-line);
    border-radius: var(--r-panel); padding: 32px; text-align: center;
    margin-top: 8px;
  }
  .end h2 {
    font-family: var(--display); font-weight: 400; font-size: 30px;
    line-height: 1.1; margin: 0 0 10px; color: var(--am-ink);
  }
  .end p { margin: 0 0 24px; color: var(--am-ink-soft); font-size: 16px; }
  .end .actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }

  footer.colophon {
    max-width: var(--measure); margin: 0 auto;
    padding: 0 clamp(16px, 4vw, 24px) 56px;
    color: var(--am-muted); font-size: 14px; line-height: 1.55;
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
  }
</style>

<div class="notice" role="status">
  <b>Draft for review.</b> This is not the live form yet, so it is not connected to anything. The finished version sends your answers straight to your agent before you meet.
</div>

<div class="topbar">
  <span class="lockup">${MARK(32)}<span class="word">Ask Mike</span></span>
  <div class="progress">
    <div class="track"><div class="fill" id="progress-fill"></div></div>
    <span class="count" id="progress-count">Step 1 of ${QUESTIONNAIRE.length}</span>
  </div>
  <div class="viewtoggle" role="group" aria-label="View">
    <button type="button" class="btn secondary" id="v-client" aria-pressed="true">Client view</button>
    <button type="button" class="btn secondary" id="v-review" aria-pressed="false">Review view</button>
  </div>
</div>

<main>
  <div class="hero">
    <h1>Before we meet, tell us about your year</h1>
    <p>This takes about ten minutes. Your agent uses it to work out which plans are worth your time, so the meeting can be about the decision rather than the paperwork.</p>
    <p>Rough answers are fine. Where you are not sure, say so rather than guessing, and your agent will pick it up.</p>
    <div class="helpful">${MARK_SMALL(19, "#C67E32")}<span><b>Worth having to hand:</b> your insurance card if you have one, and the bottles for anything you take regularly. Neither is essential, but they make a few of the questions much quicker to answer.</span></div>
  </div>

  ${sections}

  <div class="end">
    <h2>That is everything</h2>
    <p>Your agent will review this before you meet and will have your options ready.</p>
    <div class="actions">
      <button class="btn primary" type="button" id="submit">Send to my agent</button>
      <button class="btn quiet" type="button">Save and finish later</button>
    </div>
  </div>
</main>

<footer class="colophon">
  Generated from <code>src/intake/questionnaire.ts</code>, so this form and the definition we build from cannot drift apart.
  Review view reveals every conditional question, why each one is asked, and where each answer is routed.
</footer>

<script>
  const body = document.body;
  const vClient = document.getElementById("v-client");
  const vReview = document.getElementById("v-review");
  const fill = document.getElementById("progress-fill");
  const count = document.getElementById("progress-count");
  const steps = [...document.querySelectorAll(".step")];

  function setView(reviewing) {
    body.classList.toggle("reviewing", reviewing);
    vClient.setAttribute("aria-pressed", String(!reviewing));
    vReview.setAttribute("aria-pressed", String(reviewing));
    document.querySelectorAll("details.why").forEach((d) => { d.open = reviewing; });
    if (!reviewing) refresh();
  }
  vClient.addEventListener("click", () => setView(false));
  vReview.addEventListener("click", () => setView(true));

  // Conditional reveal. A question shows when its controlling question holds
  // one of the listed values.
  function refresh() {
    if (!body.classList.contains("reviewing")) {
      document.querySelectorAll("[data-showif-q]").forEach((el) => {
        const q = el.getAttribute("data-showif-q");
        const wanted = (el.getAttribute("data-showif-v") || "").split("|");
        const checked = document.querySelector('input[name="' + q + '"]:checked');
        el.hidden = !(checked && wanted.includes(checked.value));
      });
    }
    updateProgress();
  }

  function updateProgress() {
    const visible = [...document.querySelectorAll(".q")].filter((q) => !q.hidden);
    let answered = 0;
    for (const q of visible) {
      const inputs = [...q.querySelectorAll("input, textarea")];
      const done = inputs.some((i) =>
        (i.type === "radio" || i.type === "checkbox") ? i.checked : i.value.trim() !== "",
      );
      if (done) answered += 1;
    }
    const pct = visible.length ? (answered / visible.length) * 100 : 0;
    fill.style.width = pct.toFixed(1) + "%";

    let current = 1;
    for (const s of steps) {
      if (s.getBoundingClientRect().top <= 140) current = Number(s.dataset.step);
    }
    count.textContent = "Step " + current + " of " + steps.length;
  }

  // Selection state, applied explicitly so it never depends on :has() support.
  function paintChoices() {
    document.querySelectorAll(".choice").forEach((row) => {
      const input = row.querySelector("input");
      row.classList.toggle("is-selected", !!input && input.checked);
    });
  }

  document.addEventListener("focusin", (e) => {
    const row = e.target.closest && e.target.closest(".choice");
    if (row) row.classList.add("is-focus");
  });
  document.addEventListener("focusout", (e) => {
    const row = e.target.closest && e.target.closest(".choice");
    if (row) row.classList.remove("is-focus");
  });

  document.addEventListener("change", (e) => {
    if (e.target.matches("input, textarea")) { paintChoices(); refresh(); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.matches("input, textarea")) updateProgress();
  });
  window.addEventListener("scroll", updateProgress, { passive: true });

  document.querySelectorAll(".addmore").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.createElement("input");
      input.className = "field";
      input.type = "text";
      btn.parentNode.insertBefore(input, btn);
      input.focus();
    });
  });

  // Collects every answered field into a flat payload keyed by question id.
  // Checkboxes become arrays; everything else is a scalar.
  function collect() {
    const answers = {};
    document.querySelectorAll(".q").forEach((q) => {
      if (q.hidden) return;
      const id = q.dataset.q;
      const radios = q.querySelectorAll('input[type="radio"]:checked');
      const boxes = [...q.querySelectorAll('input[type="checkbox"]:checked')].filter(
        (b) => !b.name.endsWith("_unsure"),
      );
      const texts = [...q.querySelectorAll('input[type="text"], input[type="number"], textarea')]
        .map((i) => i.value.trim())
        .filter(Boolean);
      const unsure = q.querySelector('input[name$="_unsure"]:checked');

      if (radios.length) answers[id] = radios[0].value;
      else if (boxes.length) answers[id] = boxes.map((b) => b.value);
      else if (texts.length) answers[id] = texts.length === 1 ? texts[0] : texts;
      if (unsure) answers[id + "_unsure"] = true;
    });
    return answers;
  }

  document.getElementById("submit").addEventListener("click", () => {
    const answers = collect();
    localStorage.setItem(
      "askmike:submission",
      JSON.stringify({ answers, submittedAt: new Date().toISOString() }),
    );
    // Until there is an agent login, the recommendation opens in its own window
    // so the two sides can be seen side by side.
    window.open("agent.html", "askmike-agent");
  });

  paintChoices();
  refresh();
</script>
`;

const out = process.argv[2];
if (!out) {
  console.error("\nNo output path given, nothing written.");
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, "utf8");
console.log(`\nPrototype written to ${out}  (${(html.length / 1024).toFixed(1)} KB)`);
