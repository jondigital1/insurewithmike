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

function renderInput(q: Question, suffix = ""): string {
  const name = esc(q.id + suffix);
  switch (q.kind) {
    case "code":
      return `<input class="field code" type="text" id="${name}" name="${name}" placeholder="K7M4QX" maxlength="6" autocomplete="off" spellcheck="false" />`;
    case "number":
      return `<div class="withunit"><input class="field short" type="number" id="${name}" name="${name}" min="0" />${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div>`;
    case "currency":
      return `<div class="withunit"><span class="unit">$</span><input class="field short" type="number" id="${name}" name="${name}" min="0" step="1" /></div>`;
    // Worked out from the boxes above and shown back for confirmation. The
    // client never adds anything up, and a wrong figure gets caught here
    // rather than at tax time.
    case "estimate":
      return `<div class="estimate" data-estimate="${name}">
        <div class="estfig"><span class="estcur">$</span><span class="estnum" id="${name}_figure">0</span><span class="estper">per year</span></div>
        <p class="estbreak" id="${name}_break">Fill in the boxes above and this works itself out.</p>
        <div class="estconfirm">
          <p class="estask" id="${name}-ask">${esc(q.help ?? "Does this look accurate?")}</p>
          <div class="choices" role="radiogroup" aria-labelledby="${name}-ask">
            <label class="choice"><input type="radio" name="${name}_ok" value="yes" /><span class="dot"></span><span class="ctext">Yes, that is about right</span></label>
            <label class="choice"><input type="radio" name="${name}_ok" value="no" /><span class="dot"></span><span class="ctext">No, it is not</span></label>
          </div>
          <div class="estfix" data-showif-q="${name}_ok" data-showif-v="no" hidden>
            <label class="qlabel small" for="${name}_correction">What should it be, for the year?</label>
            <p class="qhelp">Your figure is the one we will use. Your agent will go through it with you.</p>
            <div class="withunit"><span class="unit">$</span><input class="field short" type="number" id="${name}_correction" name="${name}_correction" min="0" step="1" /></div>
          </div>
        </div>
      </div>`;
    case "text":
      return `<input class="field" type="text" id="${name}" name="${name}" />`;
    case "longtext":
      return `<textarea class="field" id="${name}" name="${name}" rows="4"></textarea>`;
    case "repeater":
      return `<div class="repeater"><input class="field" type="text" name="${name}_1" aria-label="${esc(q.label)}, first entry" /><input class="field" type="text" name="${name}_2" aria-label="${esc(q.label)}, second entry" /><button class="btn quiet addmore" type="button">Add another</button></div>`;
    case "boolean":
      if (q.compact) {
        return `<div class="pillrow" role="radiogroup" aria-labelledby="${name}-label">
          <label class="pill"><input type="radio" name="${name}" value="yes" /><span class="ptext">Yes</span></label>
          <label class="pill"><input type="radio" name="${name}" value="no" /><span class="ptext">No</span></label>
        </div>`;
      }
      return `<div class="choices" role="radiogroup" aria-labelledby="${name}-label">
        <label class="choice"><input type="radio" name="${name}" value="yes" /><span class="dot"></span><span class="ctext">Yes</span></label>
        <label class="choice"><input type="radio" name="${name}" value="no" /><span class="dot"></span><span class="ctext">No</span></label>
      </div>`;
    case "choice":
      // Compact questions get pills on one line instead of a stack of cards.
      // Nine short scales in a row is a list to run down, not nine decisions,
      // and stacking them turns one screen into forty five rows of radio.
      if (q.compact) {
        return `<div class="pillrow" role="radiogroup" aria-labelledby="${name}-label">${(q.options ?? [])
          .map(
            (o) =>
              `<label class="pill"><input type="radio" name="${name}" value="${esc(o.value)}" aria-label="${esc(o.label)}" /><span class="ptext" aria-hidden="true">${esc(o.short ?? o.label)}</span></label>`,
          )
          .join("")}</div>`;
      }
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

function renderQuestion(q: Question, idx = ""): string {
  // Per person questions carry an index suffix so each member's answers stay
  // distinct. Conditions inside a person block point at that same member's
  // controlling question, not at the first person's.
  const suffix = idx ? `__${idx}` : "";
  const condQ = q.showIf ? `${q.showIf.question}${suffix}` : "";
  const cond = q.showIf
    ? ` data-showif-q="${esc(condQ)}" data-showif-v="${esc(q.showIf.equals.join("|"))}" hidden`
    : "";

  const tags = [
    q.required ? "" : `<span class="tag">optional</span>`,
    q.perPerson ? `<span class="tag">asked per person</span>` : "",
    q.showIf
      ? `<span class="tag cond">${
          q.showIf.equals.length === 1 && q.showIf.equals[0] === "__answered__"
            ? `only if ${esc(q.showIf.question.replace(/_/g, " "))} has an answer`
            : `only if ${esc(q.showIf.question.replace(/_/g, " "))} is ${esc(q.showIf.equals.join(" or "))}`
        }</span>`
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

  const nm = esc(q.id + suffix);
  return `<div class="q${q.compact ? " compact" : ""}" data-q="${nm}"${cond}>
    <label class="qlabel" id="${nm}-label" for="${nm}">${esc(q.label)}</label>
    ${q.help && q.kind !== "estimate" ? `<p class="qhelp">${esc(q.help)}</p>` : ""}
    ${renderInput(q, suffix)}
    ${q.allowUnsure ? `<label class="unsure"><input type="checkbox" name="${nm}_unsure" /><span>I am not sure</span></label>` : ""}
    ${why}
    <div class="meta"><div class="tags">${tags}</div></div>
  </div>`;
}

/**
 * Wraps a run of per person questions in a template the page clones once per
 * household member.
 *
 * Premium is age rated per member, so asking the age once and inferring the
 * rest is not a simplification, it is a wrong price. The template carries an
 * index token in every name, id and label reference, which the page replaces
 * when it clones.
 */
function renderPersonGroup(questions: Question[], groupId: string): string {
  const inner = questions.map((q) => renderQuestion(q, "__IDX__")).join("");
  return `<div class="persongroup" data-group="${esc(groupId)}">
    <template class="persontpl">${inner}</template>
    <div class="people"></div>
  </div>`;
}

/** Splits a section into alternating runs of shared and per person questions. */
function partition(questions: Question[]): Array<{ perPerson: boolean; items: Question[] }> {
  const runs: Array<{ perPerson: boolean; items: Question[] }> = [];
  for (const q of questions) {
    const last = runs[runs.length - 1];
    if (last && last.perPerson === Boolean(q.perPerson)) last.items.push(q);
    else runs.push({ perPerson: Boolean(q.perPerson), items: [q] });
  }
  return runs;
}

function renderSection(s: Section, n: number): string {
  return `<section class="step" data-step="${n}">
    <div class="card">
      <header class="stephead">
        <p class="eyebrow">Step ${n} of ${QUESTIONNAIRE.length}</p>
        <h2>${esc(s.title)}</h2>
        ${s.blurb ? `<p class="blurb">${esc(s.blurb)}</p>` : ""}
      </header>
      <div class="qs">${partition(s.questions)
        .map((run, ri) =>
          run.perPerson
            ? renderPersonGroup(run.items, `${s.id}-${ri}`)
            : run.items.map((q) => renderQuestion(q)).join(""),
        )
        .join("")}</div>
      <footer class="stepfoot">
        <button class="btn quiet later" type="button">Save and finish later</button>
        <div class="nav">
          ${n > 1 ? `<button class="btn secondary back" type="button">Back</button>` : ""}
          <button class="btn primary next" type="button">${n === QUESTIONNAIRE.length ? "Review my answers" : "Continue"}</button>
        </div>
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

  /* A wash of the brand blue behind the top of the page, gone by the time the
     first card starts. Gives the paper somewhere to come from. */
  body::before {
    content: ""; position: fixed; inset: 0 0 auto 0; height: 520px; z-index: -1;
    background:
      radial-gradient(120% 100% at 12% 0%, rgba(15,124,192,.10) 0%, rgba(15,124,192,0) 62%),
      radial-gradient(90% 80% at 96% 4%, rgba(242,166,90,.13) 0%, rgba(242,166,90,0) 60%);
    pointer-events: none;
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

  .lockup {
    display: inline-flex; align-items: center; gap: 0.34em; margin-right: auto;
    text-decoration: none; border-radius: 8px; padding: 2px 4px; margin-left: -4px;
    transition: opacity 150ms ease-out;
  }
  .lockup:hover { opacity: .78; }
  .lockup:focus-visible { outline: 2px solid var(--am-blue-600); outline-offset: 2px; }
  .lockup .word {
    font-family: var(--display); font-weight: 400; font-size: 26px;
    line-height: 1; letter-spacing: -0.015em; color: var(--am-ink);
  }

  .progress { display: flex; align-items: center; gap: 12px; }
  /* Ten segments rather than one bar. A continuous sliver says "you are some
     way through something"; ten notches say how many are left, which is the
     thing people actually want to know. */
  .progress .track {
    position: relative; width: 148px; height: 7px; border-radius: 4px;
    background: var(--am-blue-100); overflow: hidden;
  }
  .progress .fill {
    height: 100%; width: 0%;
    background: linear-gradient(90deg, var(--am-blue-600), #2E97D4);
    transition: width 320ms cubic-bezier(.22,1,.36,1);
  }
  .progress .pips { position: absolute; inset: 0; display: flex; }
  .progress .pip { flex: 1 1 0; border-right: 2px solid var(--am-white); }
  .progress .pip:last-child { border-right: 0; }
  .progress .count { font-size: 14px; line-height: 1.4; color: var(--am-muted); white-space: nowrap; }
  .progress .count b { color: var(--am-ink); font-weight: 600; }

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
    font-size: clamp(38px, 8vw, 58px); line-height: 1.02;
    letter-spacing: -0.02em; margin: 0 0 18px; color: var(--am-ink);
  }
  /* The one flourish on the page. An amber stroke under the two words that
     say what this is about, sitting behind the text rather than under it so
     descenders cut through it the way a real pen would. */
  /* Painted as a background on the words themselves, so it sits behind the
     glyphs and descenders cut through it the way a real pen would. */
  .hero h1 em {
    font-style: italic;
    background-image: linear-gradient(100deg, rgba(242,166,90,.9), rgba(242,166,90,.4));
    background-repeat: no-repeat;
    background-position: 0 86%;
    background-size: 0% 0.19em;
    animation: underline 620ms cubic-bezier(.22,1,.36,1) 340ms forwards;
  }
  @keyframes underline { to { background-size: 100% 0.19em; } }

  .hero p { margin: 0 0 12px; color: var(--am-ink-soft); }
  .hero .hlede { font-size: 19px; line-height: 1.55; color: var(--am-ink); }

  /* Three numbers instead of a paragraph of reassurance. The last one is the
     answer to the question people are actually holding. */
  .facts {
    list-style: none; margin: 26px 0 0; padding: 22px 0 0;
    border-top: 1px solid var(--am-line);
    display: flex; flex-wrap: wrap; gap: 14px 40px;
  }
  .facts li { display: flex; align-items: baseline; gap: 10px; }
  .facts .fnum {
    font-family: var(--display); font-size: 38px; line-height: .9;
    color: var(--am-blue-700); letter-spacing: -0.02em;
  }
  .facts .flabel { font-size: 13px; line-height: 1.35; color: var(--am-muted); }

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

  /* -------------------------------------------------- computed estimate */

  /* Reads as an answer the form worked out, not another box to fill in, so
     it sits on its own ground rather than looking like a disabled field. */
  .estimate {
    background: var(--am-blue-50); border: 1px solid var(--am-blue-100);
    border-radius: var(--r-card); padding: 22px 24px;
    display: flex; flex-direction: column; gap: 18px;
  }
  .estfig { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
  .estcur { font-family: var(--display); font-size: 30px; color: var(--am-blue-700); line-height: 1; }
  .estnum {
    font-family: var(--display); font-size: 46px; line-height: 1;
    letter-spacing: -0.015em; color: var(--am-ink); font-variant-numeric: tabular-nums;
  }
  .estper { font-size: 15px; color: var(--am-muted); margin-left: 6px; }
  .estbreak { margin: -10px 0 0; font-size: 14px; line-height: 1.55; color: var(--am-ink-soft); }

  .estconfirm { display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--am-blue-100); padding-top: 18px; }
  .estask { margin: 0; font-size: 17px; font-weight: 500; color: var(--am-ink); }
  .estconfirm .choice { background: var(--am-white); }
  .estfix { display: flex; flex-direction: column; gap: 8px; }
  .estfix[hidden] { display: none; }
  .qlabel.small { font-size: 16px; }

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
  .choice:active { transform: scale(.994); }
  .choice input { position: absolute; opacity: 0; width: 0; height: 0; }

  .choice .dot {
    flex: none; width: 20px; height: 20px; margin-top: 2px;
    border: 1.5px solid var(--am-muted); border-radius: 50%;
    background: var(--am-white);
    transition: border-color 150ms ease-out, box-shadow 220ms cubic-bezier(.22,1,.36,1);
  }
  .choice.multi .dot { border-radius: 6px; }

  .choice .ctext { font-size: 16px; line-height: 1.5; color: var(--am-ink); }

  /* Selection is driven by an explicit class rather than :has(input:checked).
     Some engines report :has() as supported but do not re-evaluate it when the
     checked state changes, and older Safari and Chrome lack it entirely. This
     is the most used control in the product, so it does not get to depend on
     a selector that might not repaint. */
  .choice.is-selected {
    border-color: var(--am-blue-600); background: var(--am-blue-50);
    box-shadow: 0 1px 3px rgba(15,124,192,.12);
  }
  .choice.is-selected .dot {
    border-color: var(--am-blue-600);
    box-shadow: inset 0 0 0 6px var(--am-blue-600);
  }
  /* The tick is the moment the client gets an answer back. Worth 240ms. */
  .choice.is-selected .ctext { color: var(--am-blue-800); }
  .choice.is-focus {
    border-color: var(--am-blue-600);
    box-shadow: 0 0 0 4px var(--am-blue-100);
  }

  /* ------------------------------------------------- compact scale rows */

  /* Label on the left, the scale on the right, one line each. A run of these
     reads as a short list rather than as nine separate questions. */
  .q.compact {
    display: grid; grid-template-columns: minmax(0, 1fr) auto;
    align-items: center; gap: 8px 20px;
    padding: 14px 0; border-top: 1px solid var(--am-line-soft);
  }
  .qs > .q.compact + .q.compact { margin-top: -32px; }
  .q.compact .qlabel { font-size: 16px; font-weight: 400; grid-column: 1; }
  .q.compact .qhelp { grid-column: 1; margin: 0; font-size: 13px; }
  .q.compact .pillrow { grid-column: 2; grid-row: 1 / span 2; }
  .q.compact .why, .q.compact .meta { grid-column: 1 / -1; }

  .pillrow { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .pill {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 46px; min-height: 40px; padding: 8px 12px;
    border: 1.5px solid var(--am-line); border-radius: var(--r-control);
    background: var(--am-white); cursor: pointer;
    transition: border-color 150ms ease-out, background-color 150ms ease-out;
  }
  .pill:hover { border-color: #C6DDEE; background: var(--am-paper); }
  .pill:active { transform: scale(.97); }
  .pill input { position: absolute; opacity: 0; width: 0; height: 0; }
  .pill .ptext { font-size: 15px; line-height: 1; color: var(--am-ink-soft); white-space: nowrap; }
  .pill.is-selected {
    border-color: var(--am-blue-600); background: var(--am-blue-600);
    box-shadow: 0 1px 3px rgba(15,124,192,.2);
  }
  .pill.is-selected .ptext { color: var(--am-white); font-weight: 500; }
  .pill.is-focus { border-color: var(--am-blue-600); box-shadow: 0 0 0 4px var(--am-blue-100); }

  /* Below this the label and a six option scale stop sharing a line. */
  @media (max-width: 640px) {
    .q.compact { grid-template-columns: 1fr; gap: 10px; }
    .q.compact .pillrow { grid-column: 1; grid-row: auto; justify-content: flex-start; }
  }

  /* Inside a person block the compact items sit side by side rather than as
     rows, so one member reads as one line: age, relationship, covered. */
  .person > .q.compact {
    display: flex; flex-direction: column; align-items: flex-start; gap: 7px;
    padding: 0; border-top: 0;
  }
  .person > .q.compact .qlabel { font-size: 14px; color: var(--am-ink-soft); }
  .person > .q.compact .pillrow { justify-content: flex-start; gap: 5px; }
  .person > .q.compact .pill { min-width: 38px; padding: 8px 10px; }
  .person > .q.compact .pill .ptext { font-size: 14px; }
  .person > .q.compact .field.short { max-width: 88px; }
  /* The label already says what the number is. "years" beside it costs 55px
     of a line that has to hold three answers. */
  .person > .q.compact .withunit .unit { display: none; }
  /* The reason we ask belongs to the question, not to each member. Repeated
     four times down a household it is noise, and it more than doubles the
     height of a row that is otherwise one line. Review view still shows it. */
  body:not(.reviewing) .person > .q.compact .why { display: none; }

  /* "I am not sure" must look like a legitimate answer, because it is one. */
  .unsure {
    display: inline-flex; align-items: center; gap: 9px;
    font-size: 14px; color: var(--am-ink-soft); cursor: pointer;
    padding: 6px 2px; align-self: flex-start;
  }
  .unsure input { accent-color: var(--am-blue-600); width: 16px; height: 16px; }

  .repeater { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }

  /* One block per household member. Premium is age rated per person, so each
     one gets its own answers rather than being inferred from the first. */
  .people { display: flex; flex-direction: column; gap: 28px; }
  /* Wrapping row, so compact items share a line and anything else takes the
     full width on its own. */
  .person {
    display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px;
    padding: 16px; border: 1px solid var(--am-line);
    border-radius: var(--r-card); background: var(--am-paper);
  }
  .person > * { flex: 1 1 100%; }
  .person > .q.compact { flex: 0 1 auto; }
  .person > .personhead {
    font-size: 12px; font-weight: 600; letter-spacing: .12em;
    text-transform: uppercase; color: var(--am-muted); margin: 0;
  }
  .persongroup .waiting {
    color: var(--am-ink-soft); font-size: 15px; margin: 0;
    padding: 16px 18px; border: 1px dashed var(--am-line);
    border-radius: var(--r-control);
  }

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
    display: flex; justify-content: space-between; align-items: center;
    gap: 12px; flex-wrap: wrap;
  }
  .stepfoot .nav { display: flex; gap: 10px; margin-left: auto; }

  /* One step at a time. Fifty questions on one page is a wall; ten short
     screens is a conversation. Review view overrides this and shows the lot. */
  .step { display: none; }
  .step.current { display: block; animation: stepin 260ms cubic-bezier(.22,1,.36,1); }
  body.reviewing .step { display: block; }
  body.reviewing .stepfoot .nav { display: none; }

  @keyframes stepin {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* The heading and the questions arrive a beat apart, so a new step reads as
     something arriving rather than a page swap. Client view only: the review
     view shows every step at once and staggering it would be nonsense. */
  body:not(.reviewing) .step.current .stephead,
  body:not(.reviewing) .step.current .qs > *,
  body:not(.reviewing) .step.current .stepfoot {
    animation: risein 380ms cubic-bezier(.22,1,.36,1) backwards;
  }
  body:not(.reviewing) .step.current .stephead { animation-delay: 40ms; }
  body:not(.reviewing) .step.current .qs > *:nth-child(1) { animation-delay: 100ms; }
  body:not(.reviewing) .step.current .qs > *:nth-child(2) { animation-delay: 145ms; }
  body:not(.reviewing) .step.current .qs > *:nth-child(3) { animation-delay: 185ms; }
  body:not(.reviewing) .step.current .qs > *:nth-child(n+4) { animation-delay: 220ms; }
  body:not(.reviewing) .step.current .stepfoot { animation-delay: 260ms; }

  @keyframes risein {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .end { display: none; }
  .end.current { display: block; animation: stepin 260ms cubic-bezier(.22,1,.36,1); }
  body.reviewing .end { display: block; }

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
  .end .endmark { display: flex; justify-content: center; margin-bottom: 6px; }
  .end .endmark svg { animation: pop 460ms cubic-bezier(.34,1.56,.64,1) 120ms backwards; }
  @keyframes pop {
    from { opacity: 0; transform: scale(.7) translateY(6px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  .end h2 {
    font-family: var(--display); font-weight: 400; font-size: clamp(30px, 6vw, 40px);
    line-height: 1.06; margin: 0 0 10px; color: var(--am-ink);
  }
  .end p { margin: 0 auto 24px; color: var(--am-ink-soft); font-size: 16px; max-width: 44ch; }

  /* What they built, counted back at them. The point of the last screen is
     that finishing feels like it was worth doing. */
  .tally {
    list-style: none; margin: 0 0 28px; padding: 22px 0;
    border-top: 1px solid var(--am-line); border-bottom: 1px solid var(--am-line);
    display: flex; flex-wrap: wrap; justify-content: center; gap: 18px 34px;
  }
  .tally li { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 84px; }
  .tally .tnum {
    font-family: var(--display); font-size: 34px; line-height: 1;
    color: var(--am-blue-700); letter-spacing: -0.02em;
  }
  .tally .tlabel { font-size: 13px; line-height: 1.3; color: var(--am-muted); }
  .tally:empty { display: none; }

  .end .actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .end .endnote {
    margin: 24px auto 0; font-size: 14px; color: var(--am-muted); max-width: 52ch;
  }

  footer.colophon {
    max-width: var(--measure); margin: 0 auto;
    padding: 0 clamp(16px, 4vw, 24px) 56px;
    color: var(--am-muted); font-size: 14px; line-height: 1.55;
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }
    /* The underline is drawn by the animation, so killing it would leave the
       flourish permanently at zero width. Draw it outright instead. */
    .hero h1 em { background-size: 100% 0.19em; }
  }
</style>

<div class="notice" role="status">
  <b>Draft for review.</b> This is not the live form yet, so it is not connected to anything. The finished version sends your answers straight to your agent before you meet.
</div>

<div class="topbar">
  <a class="lockup" href="/" id="home" aria-label="Ask Mike, back to the start">${MARK(32)}<span class="word">Ask Mike</span></a>
  <div class="progress">
    <div class="track" id="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${QUESTIONNAIRE.length}" aria-valuenow="0" aria-label="Progress through the form">
      <div class="fill" id="progress-fill"></div>
      <div class="pips">${QUESTIONNAIRE.map((s, i) => `<span class="pip" data-pip="${i}" title="${esc(s.title)}"></span>`).join("")}</div>
    </div>
    <span class="count" id="progress-count">Step 1 of ${QUESTIONNAIRE.length}</span>
  </div>
  <div class="viewtoggle" role="group" aria-label="View">
    <button type="button" class="btn secondary" id="v-client" aria-pressed="true">Client view</button>
    <button type="button" class="btn secondary" id="v-review" aria-pressed="false">Review view</button>
  </div>
</div>

<main>
  <div class="hero">
    <h1>Before we meet,<br />tell us about <em>your year</em></h1>
    <p class="hlede">Your agent uses this to work out which plans are actually worth your time, so the meeting can be about the decision rather than the paperwork.</p>
    <p>Rough answers are fine. Where you are not sure, say so rather than guessing, and your agent will pick it up.</p>
    <ul class="facts">
      <li><span class="fnum">${QUESTIONNAIRE.length}</span><span class="flabel">short steps,<br />one screen each</span></li>
      <li><span class="fnum">10</span><span class="flabel">minutes,<br />give or take</span></li>
      <li><span class="fnum">0</span><span class="flabel">of it sent until<br />you press send</span></li>
    </ul>
    <div class="helpful">${MARK_SMALL(19, "#C67E32")}<span><b>Worth having to hand:</b> your insurance card if you have one, and the bottles for anything you take regularly. Neither is essential, but they make a few of the questions much quicker to answer.</span></div>
  </div>

  ${sections}

  <div class="end">
    <div class="endmark">${MARK(46)}</div>
    <h2>That is everything</h2>
    <p>Here is what you have just handed your agent. It is more than most people manage to say in an hour across a desk.</p>
    <ul class="tally" id="tally"></ul>
    <div class="actions">
      <button class="btn primary" type="button" id="submit">Send to my agent</button>
      <button class="btn quiet" type="button">Save and finish later</button>
    </div>
    <p class="endnote">Nothing goes to an insurer, and no application is started. Your agent reads it, works through the plans, and brings you what he found.</p>
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
    if (!reviewing) { refresh(); showStep(stepIndex); } else { updateProgress(); }
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
        // Any selected value can satisfy the condition. Reading only the first
        // checked box is wrong for a multi-select, where a client can tick both
        // "got married" and something else.
        // A free text question has no value to match on, so "__answered__"
        // means shown once anything has been typed. Repeaters spread their
        // entries across medications_1, medications_2 and so on.
        if (wanted.length === 1 && wanted[0] === "__answered__") {
          const typed = [...document.querySelectorAll('[name="' + q + '"], [name^="' + q + '_"]')];
          el.hidden = !typed.some((i) => i.value && i.value.trim() !== "");
          return;
        }
        const checked = [...document.querySelectorAll('input[name="' + q + '"]:checked')];
        el.hidden = !checked.some((c) => wanted.includes(c.value));
      });
    }
    updateIncome();
    updateProgress();
  }

  const money = (n) => Math.round(n).toLocaleString("en-US");

  const STILL = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /**
   * Runs the figure up to its new value instead of swapping it.
   *
   * This is the one number on the form the client did not type, so it has to
   * read as something the page worked out. A value that silently changes is
   * easy to miss; one that moves is not. Small changes land immediately, so
   * correcting a typo does not set off an animation.
   */
  const counters = new WeakMap();
  function countTo(el, target) {
    const from = counters.get(el) || 0;
    counters.set(el, target);
    // The settled figure, so anything reading this back gets the real number
    // rather than whatever frame the animation happens to be on.
    el.dataset.value = String(target);
    if (STILL || Math.abs(target - from) < 500) {
      el.textContent = money(target);
      return;
    }
    const started = performance.now();
    const run = (now) => {
      // Bail if another keystroke has already retargeted this element.
      if (counters.get(el) !== target) return;
      const t = Math.min(1, (now - started) / 420);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + (target - from) * eased);
      if (t < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  function numOf(name) {
    const el = document.querySelector('[name="' + name + '"]');
    if (!el) return 0;
    const v = Number(el.value);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  /**
   * Adds the income boxes up and shows the total back for confirmation.
   *
   * Every box is already a yearly figure, so this is addition, with deductions
   * coming off the top because they lower the income the subsidy is figured
   * on. Anyone who says the total is wrong types their own figure and that
   * wins.
   */
  function updateIncome() {
    document.querySelectorAll("[data-estimate]").forEach((panel) => {
      const id = panel.getAttribute("data-estimate");

      // Each member is counted once. Person blocks are rebuilt into every
      // section that asks per person, so the same member appears several times
      // in the document and iterating the blocks would double their pay.
      const members = new Set();
      document.querySelectorAll(".person").forEach((p) => members.add(p.dataset.person));

      let wages = 0;
      let selfEmployed = 0;
      members.forEach((i) => {
        wages += numOf("wages__" + i);
        selfEmployed += numOf("self_employment_net__" + i);
      });

      const other = numOf("other_income_amount");
      const deductions = numOf("deductions_amount");
      const total = Math.max(0, wages + selfEmployed + other - deductions);

      const figure = document.getElementById(id + "_figure");
      const breakdown = document.getElementById(id + "_break");
      if (figure) countTo(figure, total);
      if (!breakdown) return;

      const parts = [];
      if (wages) parts.push("$" + money(wages) + " in pay");
      if (selfEmployed) parts.push("$" + money(selfEmployed) + " from self employment");
      if (other) parts.push("$" + money(other) + " from elsewhere");
      if (!parts.length) {
        breakdown.textContent = "Fill in the boxes above and this works itself out.";
        return;
      }
      const joined =
        parts.length === 1 ? parts[0] : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
      breakdown.textContent =
        joined + (deductions ? ", less $" + money(deductions) + " that lowers your taxable income." : ".");
    });
  }

  // Step navigation. The hero only belongs on the first screen; after that the
  // client is answering, not being introduced.
  const endPanel = document.querySelector(".end");
  const hero = document.querySelector(".hero");
  let stepIndex = 0; // 0..steps.length-1, then steps.length for the end panel

  /**
   * The last screen counts back what the client actually gave us.
   *
   * Ten steps of typing should end in something, and a bare "that is
   * everything" is not something. Only entries that came back with a count
   * are shown, so a household that takes no medication is not told it named
   * zero drugs.
   */
  function buildTally() {
    const host = document.getElementById("tally");
    if (!host) return;

    const filled = (name) =>
      [...document.querySelectorAll('[name^="' + name + '_"]')].filter(
        (i) => i.value && i.value.trim() !== "",
      ).length;
    const ticked = (name) =>
      document.querySelectorAll('input[name="' + name + '"]:checked').length;

    const people = Number((document.querySelector('[name="household_size"]') || {}).value) || 0;
    const answered = [...document.querySelectorAll(".q")].filter(isAnswered).length;

    const rows = [
      [people, people === 1 ? "person covered" : "people covered"],
      [ticked("health_system"), "health systems named"],
      [filled("specialists"), "doctors named"],
      [filled("medications"), "prescriptions listed"],
      [answered, "questions answered"],
    ].filter(([n]) => n > 0);

    host.innerHTML = rows
      .map(
        ([n, label]) =>
          '<li><span class="tnum">' + n + '<\\/span><span class="tlabel">' + label + "<\\/span><\\/li>",
      )
      .join("");
  }

  function showStep(n) {
    stepIndex = Math.max(0, Math.min(steps.length, n));
    steps.forEach((s, i) => s.classList.toggle("current", i === stepIndex));
    endPanel.classList.toggle("current", stepIndex === steps.length);
    hero.style.display = stepIndex === 0 ? "" : "none";
    if (stepIndex === steps.length) buildTally();
    updateProgress();
    window.scrollTo({ top: 0, behavior: "auto" });
    const heading = document.querySelector(".step.current h2, .end.current h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }

  function updateProgress() {
    if (body.classList.contains("reviewing")) {
      const all = [...document.querySelectorAll(".q")];
      const done = all.filter(isAnswered).length;
      fill.style.width = (all.length ? (done / all.length) * 100 : 0).toFixed(1) + "%";
      count.textContent = "All " + steps.length + " steps";
      return;
    }
    const shown = Math.min(stepIndex + 1, steps.length);
    fill.style.width = (((stepIndex) / steps.length) * 100).toFixed(1) + "%";
    const track = document.getElementById("progress-track");
    if (track) track.setAttribute("aria-valuenow", String(stepIndex));

    if (stepIndex >= steps.length) {
      count.innerHTML = "<b>Ready to send<\\/b>";
      return;
    }
    // Minutes left rather than steps left. Steps left is a count; minutes left
    // is the thing someone is deciding whether they have time for.
    // Roughly a minute a step, which is what the hero promises. A different
    // arithmetic here would quietly contradict the front page.
    const mins = Math.max(1, steps.length - stepIndex);
    count.innerHTML =
      "<b>Step " + shown + " of " + steps.length + "<\\/b> &middot; about " + mins + " min left";
  }

  function isAnswered(q) {
    if (q.hidden) return false;
    return [...q.querySelectorAll("input, textarea")].some((i) =>
      i.type === "radio" || i.type === "checkbox" ? i.checked : i.value.trim() !== "",
    );
  }

  // One block of questions per household member.
  //
  // Premium is age rated per person, so asking once and inferring the rest
  // produces a wrong price rather than an approximate one. Blocks are built
  // from the household size, and existing answers survive a size change so
  // correcting a typo does not wipe what has already been entered.
  const HOUSEHOLD_CAP = 10;

  function personLabel(i) {
    return i === 0 ? "You" : "Person " + (i + 1);
  }

  function buildPeople() {
    const sizeField = document.querySelector('[name="household_size"]');
    const size = Math.max(0, Math.min(HOUSEHOLD_CAP, Number(sizeField && sizeField.value) || 0));

    document.querySelectorAll(".persongroup").forEach((group) => {
      const tpl = group.querySelector(".persontpl");
      const host = group.querySelector(".people");
      if (!tpl || !host) return;

      if (size === 0) {
        host.innerHTML =
          '<p class="waiting">Tell us how many people are on your tax return and we will ask about each of them.</p>';
        return;
      }
      if (host.querySelectorAll(".person").length === size) return;

      // Preserve anything already answered before rebuilding.
      const saved = {};
      host.querySelectorAll("input, textarea").forEach((el) => {
        if (el.type === "radio" || el.type === "checkbox") {
          if (el.checked) saved[el.name + "::" + el.value] = true;
        } else if (el.value.trim() !== "") {
          saved[el.name] = el.value;
        }
      });

      host.innerHTML = "";
      for (let i = 0; i < size; i += 1) {
        const block = document.createElement("div");
        block.className = "person";
        block.dataset.person = String(i);
        block.innerHTML =
          '<p class="personhead">' + personLabel(i) + "</p>" +
          tpl.innerHTML.replace(/__IDX__/g, String(i));
        host.appendChild(block);
      }

      host.querySelectorAll("input, textarea").forEach((el) => {
        if (el.type === "radio" || el.type === "checkbox") {
          if (saved[el.name + "::" + el.value]) el.checked = true;
        } else if (saved[el.name] !== undefined) {
          el.value = saved[el.name];
        }
      });
    });
  }

  // Selection state, applied explicitly so it never depends on :has() support.
  function paintChoices() {
    document.querySelectorAll(".choice, .pill").forEach((row) => {
      const input = row.querySelector("input");
      row.classList.toggle("is-selected", !!input && input.checked);
    });
  }

  document.addEventListener("focusin", (e) => {
    const row = e.target.closest && e.target.closest(".choice, .pill");
    if (row) row.classList.add("is-focus");
  });
  document.addEventListener("focusout", (e) => {
    const row = e.target.closest && e.target.closest(".choice, .pill");
    if (row) row.classList.remove("is-focus");
  });

  document.addEventListener("change", (e) => {
    if (!e.target.matches("input, textarea")) return;
    if (e.target.name === "household_size") buildPeople();
    paintChoices();
    refresh();
  });
  document.addEventListener("input", (e) => {
    if (!e.target.matches("input, textarea")) return;
    // Live, on every keystroke. A total that only appears once the field loses
    // focus reads as broken.
    updateIncome();
    updateProgress();
  });
  window.addEventListener("scroll", updateProgress, { passive: true });

  document.querySelectorAll(".stepfoot .next").forEach((btn) => {
    btn.addEventListener("click", () => showStep(stepIndex + 1));
  });
  document.querySelectorAll(".stepfoot .back").forEach((btn) => {
    btn.addEventListener("click", () => showStep(stepIndex - 1));
  });
  document.querySelectorAll(".later").forEach((btn) => {
    btn.addEventListener("click", () => alert("Draft form. Saving is not wired up yet."));
  });

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
  // Per person answers come back as arrays in member order, so
  // person_age becomes ["44", "42", "9"] rather than a single value.
  function collect() {
    const answers = {};
    const perPerson = {};

    document.querySelectorAll(".q").forEach((q) => {
      if (q.hidden) return;
      const raw = q.dataset.q;
      // Doubled backslash on purpose: this script is emitted from a template
      // literal, where an unrecognised escape like \\d is silently stripped and
      // the regex quietly stops matching.
      const personMatch = raw.match(/^(.*)__(\\d+)$/);
      const id = personMatch ? personMatch[1] : raw;
      const personIndex = personMatch ? Number(personMatch[2]) : -1;
      const radios = q.querySelectorAll('input[type="radio"]:checked');
      const boxes = [...q.querySelectorAll('input[type="checkbox"]:checked')].filter(
        (b) => !b.name.endsWith("_unsure"),
      );
      const texts = [...q.querySelectorAll('input[type="text"], input[type="number"], textarea')]
        .map((i) => i.value.trim())
        .filter(Boolean);
      const unsure = q.querySelector('input[name$="_unsure"]:checked');

      // A computed estimate answers with a number, not with the yes or no of
      // the confirmation. A correction the client typed beats the estimate,
      // and the estimate is kept alongside it so the agent can see the gap.
      const panel = q.querySelector("[data-estimate]");
      if (panel) {
        const key = panel.getAttribute("data-estimate");
        const figure = document.getElementById(key + "_figure");
        const estimated = Number(figure ? figure.dataset.value || 0 : 0) || 0;
        const typed = document.querySelector('[name="' + key + '_correction"]');
        const corrected = typed && typed.value.trim() !== "" ? Number(typed.value) : null;
        const confirmed = q.querySelector('input[name="' + key + '_ok"]:checked');

        answers[id] = String(corrected !== null && Number.isFinite(corrected) ? corrected : estimated);
        answers[id + "_estimated"] = String(estimated);
        answers[id + "_confirmed"] = confirmed ? confirmed.value : "";
        if (corrected !== null && Number.isFinite(corrected)) answers[id + "_corrected"] = "yes";
        return;
      }

      let value;
      if (radios.length) value = radios[0].value;
      else if (boxes.length) value = boxes.map((b) => b.value);
      else if (texts.length) value = texts.length === 1 ? texts[0] : texts;

      if (personIndex >= 0) {
        if (value !== undefined) {
          perPerson[id] = perPerson[id] || [];
          perPerson[id][personIndex] = value;
        }
        if (unsure) answers[id + "_unsure"] = true;
        return;
      }

      if (value !== undefined) answers[id] = value;
      if (unsure) answers[id + "_unsure"] = true;
    });

    for (const [id, list] of Object.entries(perPerson)) {
      // Fill gaps so index position still means member position.
      answers[id] = Array.from(list, (v) => (v === undefined ? "" : v));
    }
    return answers;
  }

  document.getElementById("submit").addEventListener("click", () => {
    const answers = collect();
    localStorage.setItem(
      "askmike:submission",
      JSON.stringify({ answers, submittedAt: new Date().toISOString() }),
    );
    // Until there is an agent login, the recommendation opens in its own window
    // so both sides can be seen at once during testing. The client stays on
    // their own side and lands on the thank you page, which is the only thing
    // that will happen once the agent side sits behind a login.
    window.open("agent.html", "askmike-agent");
    window.location.href = "thanks.html";
  });

  // The logo goes home, and on this page home is step one. Reloading would be
  // the literal reading and would throw away everything typed so far, so it
  // moves rather than navigates. The href stays real for middle click and for
  // anyone with scripting off.
  const homeLink = document.getElementById("home");
  if (homeLink) {
    homeLink.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (body.classList.contains("reviewing")) setView(false);
      showStep(0);
    });
  }

  buildPeople();
  paintChoices();
  refresh();
  showStep(0);
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


