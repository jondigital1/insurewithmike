/**
 * Validates the questionnaire definition and generates a clickable prototype
 * from it, so the form Mike reviews and the definition we build from cannot
 * drift apart.
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
const perPerson = allQuestions().filter((q) => q.perPerson).length;
const conditional = allQuestions().filter((q) => q.showIf).length;
const eligibility = allQuestions().filter((q) => q.half === "eligibility").length;
const fit = allQuestions().filter((q) => q.half === "fit").length;

console.log("Questionnaire is consistent.");
console.log(`  sections            ${QUESTIONNAIRE.length}`);
console.log(`  questions           ${total}  (${eligibility} eligibility, ${fit} fit)`);
console.log(`  asked per person    ${perPerson}`);
console.log(`  conditional         ${conditional}`);
console.log(`  optional            ${allQuestions().filter((q) => !q.required).length}`);
console.log(`  offer "not sure"    ${allQuestions().filter((q) => q.allowUnsure).length}`);

// -------------------------------------------------------------------- output

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderInput(q: Question): string {
  const name = esc(q.id);
  switch (q.kind) {
    case "code":
      return `<input class="field code" type="text" id="${name}" name="${name}" placeholder="K7M4QX" maxlength="6" autocomplete="off" />`;
    case "number":
      return `<div class="withunit"><input class="field short" type="number" id="${name}" name="${name}" min="0" />${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div>`;
    case "currency":
      return `<div class="withunit"><span class="unit lead">$</span><input class="field short" type="number" id="${name}" name="${name}" min="0" step="1" /></div>`;
    case "text":
      return `<input class="field" type="text" id="${name}" name="${name}" />`;
    case "longtext":
      return `<textarea class="field" id="${name}" name="${name}" rows="4"></textarea>`;
    case "repeater":
      return `<div class="repeater"><input class="field" type="text" name="${name}_1" /><input class="field" type="text" name="${name}_2" /><button class="addmore" type="button">Add another</button></div>`;
    case "boolean":
      return `<div class="options" role="radiogroup" aria-labelledby="${name}-label">
        <label class="opt"><input type="radio" name="${name}" value="yes" data-controls="${name}" /><span>Yes</span></label>
        <label class="opt"><input type="radio" name="${name}" value="no" data-controls="${name}" /><span>No</span></label>
      </div>`;
    case "choice":
      return `<div class="options" role="radiogroup" aria-labelledby="${name}-label">${(q.options ?? [])
        .map(
          (o) =>
            `<label class="opt"><input type="radio" name="${name}" value="${esc(o.value)}" data-controls="${name}" /><span>${esc(o.label)}</span></label>`,
        )
        .join("")}</div>`;
    case "multichoice":
      return `<div class="options">${(q.options ?? [])
        .map(
          (o) =>
            `<label class="opt"><input type="checkbox" name="${name}" value="${esc(o.value)}" /><span>${esc(o.label)}</span></label>`,
        )
        .join("")}</div>`;
    default:
      return `<input class="field" type="text" id="${name}" name="${name}" />`;
  }
}

function renderQuestion(q: Question, index: number): string {
  const cond = q.showIf
    ? ` data-showif-q="${esc(q.showIf.question)}" data-showif-v="${esc(q.showIf.equals.join("|"))}" hidden`
    : "";
  const tags = [
    q.required ? "" : `<span class="tag optional">optional</span>`,
    q.perPerson ? `<span class="tag person">asked per person</span>` : "",
    q.showIf ? `<span class="tag cond">only if ${esc(q.showIf.question.replace(/_/g, " "))} is ${esc(q.showIf.equals.join(" or "))}</span>` : "",
    `<span class="tag route route-${q.routing}">${q.routing}</span>`,
  ]
    .filter(Boolean)
    .join("");

  return `<div class="q" data-q="${esc(q.id)}"${cond}>
    <div class="qnum">${index}</div>
    <div class="qbody">
      <label class="qlabel" id="${esc(q.id)}-label" for="${esc(q.id)}">${esc(q.label)}</label>
      ${q.help ? `<p class="qhelp">${esc(q.help)}</p>` : ""}
      ${renderInput(q)}
      ${q.allowUnsure ? `<label class="unsure"><input type="checkbox" name="${esc(q.id)}_unsure" /><span>I am not sure</span></label>` : ""}
      <div class="review">
        <div class="tags">${tags}</div>
        ${q.rationale ? `<p class="why"><b>Why we ask:</b> ${esc(q.rationale)}</p>` : ""}
      </div>
    </div>
  </div>`;
}

function renderSection(s: Section, n: number, counter: { i: number }): string {
  return `<section class="sect" data-half="${s.half}">
    <header class="sechead">
      <div class="secnum">Step ${n}</div>
      <h2>${esc(s.title)}</h2>
      <span class="halfmark ${s.half}">${s.half === "eligibility" ? "Eligibility and price" : "Which plan fits"}</span>
      ${s.blurb ? `<p class="blurb">${esc(s.blurb)}</p>` : ""}
    </header>
    <div class="qs">${s.questions.map((q) => renderQuestion(q, (counter.i += 1))).join("")}</div>
  </section>`;
}

const counter = { i: 0 };
const sections = QUESTIONNAIRE.map((s, i) => renderSection(s, i + 1, counter)).join("");

const html = `<title>Ask Mike, client intake</title>
<meta name="robots" content="noindex, nofollow" />

<style>
  :root {
    --paper: #FBFCFD;
    --card: #FFFFFF;
    --ink: #141C26;
    --ink-2: #4C5967;
    --ink-3: #74818F;
    --rule: #DCE3EA;
    --rule-2: #EDF1F5;
    --accent: #1B4D8F;
    --accent-soft: #E8EFF8;
    --amber: #8A6320;
    --amber-soft: #FBF2E0;
    --green: #2C6B4A;
    --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --paper: #0E1319; --card: #151C24; --ink: #E6EBF0; --ink-2: #A6B2BE;
      --ink-3: #7B8794; --rule: #29333D; --rule-2: #1E262E; --accent: #7FB0EA;
      --accent-soft: #1A2634; --amber: #D9AE62; --amber-soft: #2A2417; --green: #74C79A;
    }
  }
  :root[data-theme="dark"] {
    --paper: #0E1319; --card: #151C24; --ink: #E6EBF0; --ink-2: #A6B2BE;
    --ink-3: #7B8794; --rule: #29333D; --rule-2: #1E262E; --accent: #7FB0EA;
    --accent-soft: #1A2634; --amber: #D9AE62; --amber-soft: #2A2417; --green: #74C79A;
  }
  :root[data-theme="light"] {
    --paper: #FBFCFD; --card: #FFFFFF; --ink: #141C26; --ink-2: #4C5967;
    --ink-3: #74818F; --rule: #DCE3EA; --rule-2: #EDF1F5; --accent: #1B4D8F;
    --accent-soft: #E8EFF8; --amber: #8A6320; --amber-soft: #FBF2E0; --green: #2C6B4A;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font-family: var(--sans); font-size: 1.0625rem; line-height: 1.55;
    -webkit-text-size-adjust: 100%;
  }

  .notice {
    background: var(--amber-soft); color: var(--ink);
    border-bottom: 1px solid var(--amber);
    padding: 0.6rem clamp(1rem, 4vw, 2rem);
    font-size: 0.85rem; line-height: 1.45;
  }
  .notice b { color: var(--amber); }

  .bar {
    position: sticky; top: 0; z-index: 10;
    background: var(--card); border-bottom: 1px solid var(--rule);
    padding: 0.7rem clamp(1rem, 4vw, 2rem);
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1rem;
  }
  .bar .who { font-weight: 650; font-size: 0.95rem; margin-right: auto; }
  .bar .who span { color: var(--ink-3); font-weight: 400; }

  .toggle { display: flex; border: 1px solid var(--rule); border-radius: 3px; overflow: hidden; }
  .toggle button {
    font: inherit; font-size: 0.8rem; padding: 0.35rem 0.8rem; border: 0;
    background: transparent; color: var(--ink-2); cursor: pointer;
  }
  .toggle button[aria-pressed="true"] { background: var(--accent); color: #fff; }
  .toggle button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

  main { max-width: 40rem; margin: 0 auto; padding: clamp(1.2rem, 5vw, 2.5rem) clamp(1rem, 4vw, 2rem) 5rem; }

  .intro { margin-bottom: 2.5rem; padding-bottom: 2rem; border-bottom: 2px solid var(--accent); }
  .intro h1 { font-size: clamp(1.6rem, 5vw, 2.2rem); line-height: 1.15; margin: 0 0 0.6rem; letter-spacing: -0.02em; text-wrap: balance; }
  .intro p { color: var(--ink-2); margin: 0 0 0.7rem; font-size: 0.98rem; }
  .privacy {
    background: var(--accent-soft); border-left: 3px solid var(--accent);
    padding: 0.75rem 0.9rem; font-size: 0.9rem; color: var(--ink-2); margin-top: 1rem;
  }
  .privacy b { color: var(--ink); }

  .sect { margin-bottom: 3rem; }
  .sechead { margin-bottom: 1.4rem; }
  .secnum {
    font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--accent); margin-bottom: 0.3rem;
  }
  .sechead h2 { font-size: 1.35rem; margin: 0 0 0.35rem; letter-spacing: -0.01em; }
  .halfmark {
    display: inline-block; font-family: var(--mono); font-size: 0.62rem;
    letter-spacing: 0.09em; text-transform: uppercase; padding: 0.14em 0.45em;
    border: 1px solid currentColor; border-radius: 2px;
  }
  .halfmark.eligibility { color: var(--ink-3); }
  .halfmark.fit { color: var(--green); }
  .blurb { color: var(--ink-2); font-size: 0.94rem; margin: 0.6rem 0 0; }

  .qs { display: flex; flex-direction: column; gap: 1.1rem; }
  .q {
    display: grid; grid-template-columns: 2rem 1fr; gap: 0.8rem;
    background: var(--card); border: 1px solid var(--rule);
    padding: 1rem 1.1rem;
  }
  .q[hidden] { display: none; }
  .qnum { font-family: var(--mono); font-size: 0.72rem; color: var(--ink-3); padding-top: 0.3rem; }
  .qbody { display: flex; flex-direction: column; gap: 0.55rem; min-width: 0; }
  .qlabel { font-weight: 600; font-size: 1rem; line-height: 1.35; }
  .qhelp { margin: 0; font-size: 0.88rem; color: var(--ink-2); }

  .field {
    font: inherit; font-size: 1rem; width: 100%;
    padding: 0.55rem 0.65rem; border: 1px solid var(--rule);
    background: var(--paper); color: var(--ink); border-radius: 2px;
  }
  .field:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
  .field.short { max-width: 9rem; }
  .field.code { max-width: 9rem; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.15em; }
  textarea.field { resize: vertical; }
  .withunit { display: flex; align-items: center; gap: 0.45rem; }
  .unit { color: var(--ink-3); font-size: 0.9rem; }

  .options { display: flex; flex-direction: column; gap: 0.35rem; }
  .opt {
    display: flex; align-items: flex-start; gap: 0.55rem;
    padding: 0.5rem 0.6rem; border: 1px solid var(--rule);
    border-radius: 2px; cursor: pointer; font-size: 0.95rem; background: var(--paper);
  }
  .opt:hover { border-color: var(--accent); }
  .opt input { margin: 0.25rem 0 0; flex: none; accent-color: var(--accent); }
  .opt:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }

  .unsure { display: flex; align-items: center; gap: 0.45rem; font-size: 0.88rem; color: var(--ink-2); cursor: pointer; }
  .unsure input { accent-color: var(--amber); }

  .repeater { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start; }
  .addmore {
    font: inherit; font-size: 0.85rem; background: transparent; color: var(--accent);
    border: 1px dashed var(--rule); padding: 0.35rem 0.7rem; cursor: pointer; border-radius: 2px;
  }
  .addmore:hover { border-color: var(--accent); }

  /* review layer, hidden in client view */
  .review { display: none; border-top: 1px dashed var(--rule); padding-top: 0.6rem; margin-top: 0.2rem; }
  body.reviewing .review { display: block; }
  body.reviewing .q[hidden] { display: grid; opacity: 0.72; }
  .tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .tag {
    font-family: var(--mono); font-size: 0.6rem; letter-spacing: 0.06em;
    text-transform: uppercase; padding: 0.14em 0.4em; border: 1px solid currentColor;
    border-radius: 2px; color: var(--ink-3);
  }
  .tag.route-intake { color: var(--accent); }
  .tag.route-flag { color: var(--amber); }
  .tag.route-application { color: var(--ink-3); }
  .tag.cond { color: var(--green); }
  .why { margin: 0.45rem 0 0; font-size: 0.84rem; color: var(--ink-2); }
  .why b { color: var(--ink); }

  .end {
    margin-top: 2.5rem; padding: 1.4rem; background: var(--card);
    border: 1px solid var(--rule); text-align: center;
  }
  .end h2 { margin: 0 0 0.5rem; font-size: 1.2rem; }
  .end p { margin: 0 0 1rem; color: var(--ink-2); font-size: 0.94rem; }
  .submit {
    font: inherit; font-weight: 600; font-size: 1rem; background: var(--accent);
    color: #fff; border: 0; padding: 0.7rem 1.6rem; border-radius: 3px; cursor: pointer;
  }
  .submit:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

  footer {
    max-width: 40rem; margin: 0 auto; padding: 0 clamp(1rem, 4vw, 2rem) 3rem;
    color: var(--ink-3); font-size: 0.82rem;
  }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>

<div class="notice" role="status">
  <b>Draft for review.</b> This is not the live form yet, so it is not connected to anything. The finished version sends your answers straight to your agent before you meet.
</div>

<div class="bar">
  <div class="who">Ask Mike <span>&middot; client intake, draft one</span></div>
  <div class="toggle" role="group" aria-label="View">
    <button type="button" id="v-client" aria-pressed="true">Client view</button>
    <button type="button" id="v-review" aria-pressed="false">Review view</button>
  </div>
</div>

<main>
  <div class="intro">
    <h1>Before we meet, tell us about your year</h1>
    <p>This takes about ten minutes. Your agent uses it to work out which plans are worth your time, so the meeting can be about the decision rather than the paperwork.</p>
    <p>Rough answers are fine. Where you are not sure, say so rather than guessing, and your agent will pick it up.</p>
    <div class="privacy"><b>Worth having to hand:</b> your insurance card if you have one, and the bottles for anything you take regularly. Neither is essential, but they make a few of the questions much quicker to answer.</div>
  </div>

  ${sections}

  <div class="end">
    <h2>That is everything</h2>
    <p>Your agent will review this before you meet and will have your options ready.</p>
    <button class="submit" type="button">Send to my agent</button>
  </div>
</main>

<footer>
  Generated from <code>src/intake/questionnaire.ts</code>, so this form and the definition we build from cannot drift apart.
  Review view reveals every conditional question, why each one is asked, and where each answer is routed.
</footer>

<script>
  const body = document.body;
  const vClient = document.getElementById("v-client");
  const vReview = document.getElementById("v-review");

  function setView(reviewing) {
    body.classList.toggle("reviewing", reviewing);
    vClient.setAttribute("aria-pressed", String(!reviewing));
    vReview.setAttribute("aria-pressed", String(reviewing));
    if (!reviewing) refresh();
  }
  vClient.addEventListener("click", () => setView(false));
  vReview.addEventListener("click", () => setView(true));

  // Conditional reveal. A question shows when its controlling question holds
  // one of the listed values.
  function refresh() {
    if (body.classList.contains("reviewing")) return;
    document.querySelectorAll("[data-showif-q]").forEach((el) => {
      const q = el.getAttribute("data-showif-q");
      const wanted = (el.getAttribute("data-showif-v") || "").split("|");
      const checked = document.querySelector('input[name="' + q + '"]:checked');
      el.hidden = !(checked && wanted.includes(checked.value));
    });
  }

  document.addEventListener("change", (e) => {
    if (e.target.matches("input[type=radio], input[type=checkbox]")) refresh();
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

  document.querySelector(".submit").addEventListener("click", () => {
    alert("Draft form. Submitting is not wired up yet.");
  });

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
