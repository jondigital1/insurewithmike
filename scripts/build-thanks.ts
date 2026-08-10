/**
 * Builds the page a client lands on after submitting the intake form.
 *
 * It does three things: thank them properly, give the agency a place to say
 * that in their own voice on video, and let the client book the meeting
 * without another round of messages.
 *
 * The video and the calendar are configured in src/web/agency.ts and are null
 * until real ones exist. While draft is true they render as worked examples,
 * each labelled as a sample, so the page can be judged on how it will actually
 * look. With draft false they are simply omitted, because inviting a real
 * client to book a meeting that will not happen is worse than showing nothing.
 *
 * Usage: npx tsx scripts/build-thanks.ts <outdir>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TOKENS, FONT_LINKS, FAVICON, lockup, markSmall } from "../src/web/identity.ts";
import { AGENCY } from "../src/web/agency.ts";

const outDir = process.argv[2] ?? "web";
mkdirSync(outDir, { recursive: true });

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ------------------------------------------------------------------ video

function videoBlock(): string {
  const v = AGENCY.video;
  if (v) {
    const inner =
      v.kind === "embed"
        ? `<iframe class="frame" src="${esc(v.url)}" title="A message from ${esc(AGENCY.agencyName)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
        : `<video class="frame" controls preload="metadata"${v.poster ? ` poster="${esc(v.poster)}"` : ""}><source src="${esc(v.url)}" />Your browser cannot play this video.</video>`;
    return `<section class="card">
      <div class="ratio">${inner}</div>
      ${v.caption ? `<p class="cap">${esc(v.caption)}</p>` : ""}
    </section>`;
  }
  if (!AGENCY.draft) return "";

  // Draft mode renders the shape the real thing will take rather than an empty
  // box, so the page can be judged on how it will look. It is a still frame
  // with a play affordance, not a working player, and it says so.
  return `<section class="card">
    <p class="sample">Sample, so the layout can be judged. Not a real video.</p>
    <div class="ratio player">
      <div class="playerbg"></div>
      <div class="playerinner">
        <span class="playbtn" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>
        </span>
        <p class="playtitle">A message from ${esc(AGENCY.agentName)}</p>
        <p class="playmeta">${esc(AGENCY.agencyName)} &middot; 0:47</p>
      </div>
      <div class="scrubber"><span></span></div>
    </div>
    <p class="cap">A short thank you to camera does more here than any amount of copy.</p>
  </section>`;
}

// --------------------------------------------------------------- calendar

function calendarBlock(): string {
  if (AGENCY.calendarEmbedUrl) {
    return `<section class="card">
      <h2>Book a time</h2>
      <p class="lede">Pick whatever suits you. You will get a confirmation by email, and you can move it later if you need to.</p>
      <div class="calwrap">
        <iframe class="cal" src="${esc(AGENCY.calendarEmbedUrl)}" title="Book a meeting with ${esc(AGENCY.agentName)}" loading="lazy"></iframe>
      </div>
    </section>`;
  }
  if (!AGENCY.draft) {
    return `<section class="card">
      <h2>Booking your meeting</h2>
      <p class="lede">${esc(AGENCY.agentName)} will be in touch to arrange a time.</p>
    </section>`;
  }
  // A worked example of the scheduling widget, built from the next few weekdays
  // so the dates read as real. Not wired to anything.
  const days: Array<{ dow: string; dom: number; month: string; slots: string[] }> = [];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SLOTS = [
    ["9:00 am", "10:30 am", "1:00 pm", "3:30 pm"],
    ["9:30 am", "11:00 am", "2:00 pm"],
    ["10:00 am", "12:30 pm", "2:30 pm", "4:00 pm"],
    ["9:00 am", "11:30 am", "3:00 pm"],
    ["10:30 am", "1:30 pm"],
  ];
  const cursor = new Date();
  let added = 0;
  while (added < 5) {
    cursor.setDate(cursor.getDate() + 1);
    const d = cursor.getDay();
    if (d === 0 || d === 6) continue;
    days.push({
      dow: DOW[d]!,
      dom: cursor.getDate(),
      month: MONTHS[cursor.getMonth()]!,
      slots: SLOTS[added]!,
    });
    added += 1;
  }

  return `<section class="card">
    <h2>Book a time</h2>
    <p class="lede">Pick whatever suits you. You will get a confirmation by email, and you can move it later if you need to.</p>
    <p class="sample">Sample, so the layout can be judged. These times are not real and nothing is booked.</p>
    <div class="calmock">
      <div class="calside">
        <p class="calagent">${esc(AGENCY.agentName)}</p>
        <p class="calmeeting">Health plan review</p>
        <ul class="calfacts">
          <li>45 minutes</li>
          <li>Phone, video or in person</li>
          <li>Eastern time</li>
        </ul>
        <p class="calnote">He will have read your answers before you speak.</p>
      </div>
      <div class="calmain">
        ${days
          .map(
            (d, i) => `<div class="calday${i === 0 ? " today" : ""}">
          <div class="caldate"><span class="dow">${d.dow}</span><span class="dom">${d.dom}</span><span class="mon">${d.month}</span></div>
          <div class="calslots">${d.slots.map((s) => `<button class="slotbtn" type="button" disabled>${s}</button>`).join("")}</div>
        </div>`,
          )
          .join("")}
      </div>
    </div>
    <p class="cap">Calendly, Google appointment schedules, Acuity and HubSpot Meetings all drop straight in here once there is a real one to use.</p>
  </section>`;
}

// ------------------------------------------------------------------- page

const html = `<title>Thank you</title>
<meta name="robots" content="noindex, nofollow" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#FCFBF8" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Ask Mike" />
<link rel="icon" href="${FAVICON}" />
${FONT_LINKS}

<style>
${TOKENS}

  * { box-sizing: border-box; }

  body {
    margin: 0; background: var(--am-paper); color: var(--am-ink);
    font-family: var(--sans); font-size: 17px; line-height: 1.62;
    -webkit-text-size-adjust: 100%;
  }
  p, h1, h2 { text-wrap: pretty; }

  .topbar {
    background: var(--am-white); border-bottom: 1px solid var(--am-line);
    padding: 12px clamp(16px, 4vw, 32px);
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  }
  /* A testing control, so it only exists while the page is in draft. A real
     client must never be one click from the agent's working document. It lives
     in the draft band with the rest of the scaffolding, not in the header, and
     reads as one segmented switch rather than two competing buttons. */
  .viewtoggle { display: flex; margin-left: auto; flex: none; }
  .viewtoggle .btn {
    font: inherit; font-size: 13px; font-weight: 500; text-decoration: none;
    display: inline-flex; align-items: center; padding: 6px 13px; min-height: 32px;
    border: 1px solid var(--am-line); border-radius: 0;
    background: transparent; color: var(--am-ink-soft);
  }
  .viewtoggle .btn:first-child { border-radius: 8px 0 0 8px; }
  .viewtoggle .btn:last-child { border-radius: 0 8px 8px 0; margin-left: -1px; }
  .viewtoggle a.btn:hover { background: var(--am-paper); color: var(--am-ink); border-color: #C6DDEE; }
  .viewtoggle .is-current {
    background: var(--am-white); color: var(--am-ink); cursor: default;
    border-color: var(--am-blue-300); box-shadow: inset 0 0 0 1px var(--am-blue-300);
    z-index: 1;
  }
  .lockup {
    display: inline-flex; align-items: center; gap: 0.34em;
    text-decoration: none; border-radius: 8px; padding: 2px 4px; margin-left: -4px;
    transition: opacity 150ms ease-out;
  }
  .lockup:hover { opacity: .78; }
  .lockup:focus-visible { outline: 2px solid var(--am-blue-600); outline-offset: 2px; }
  .lockup .word {
    font-family: var(--display); font-weight: 400; font-size: 26px;
    line-height: 1; letter-spacing: -0.015em; color: var(--am-ink);
  }

  /* Deliberately not brand blue. This band is scaffolding, and tinting it with
     the primary makes it read as the first thing the product wants to say. */
  .notice {
    background: var(--am-line-soft); border-bottom: 1px solid var(--am-line);
    color: var(--am-ink-soft); font-size: 14px; line-height: 1.55;
    padding: 10px clamp(16px, 4vw, 32px);
    display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap;
  }
  .notice .ntext { margin: 0; flex: 1 1 320px; }
  .notice b { color: var(--am-ink); font-weight: 600; }

  main { max-width: 700px; margin: 0 auto; padding: 56px clamp(16px, 4vw, 24px) 72px; }

  .hero { margin-bottom: 36px; }
  .hero h1 {
    font-family: var(--display); font-weight: 400;
    font-size: clamp(38px, 8vw, 54px); line-height: 1.04;
    letter-spacing: -0.02em; margin: 0 0 20px;
  }
  .hero p { margin: 0 0 14px; color: var(--am-ink-soft); font-size: 18px; line-height: 1.6; }
  .hero p.first { color: var(--am-ink); }

  .card {
    background: var(--am-white); border: 1px solid var(--am-line);
    border-radius: var(--r-card); box-shadow: 0 1px 2px rgba(20,48,74,.04);
    padding: 24px 26px; margin-bottom: 20px;
  }
  h2 {
    font-family: var(--display); font-weight: 400; font-size: 27px;
    line-height: 1.12; margin: 0 0 10px;
  }
  .lede { margin: 0 0 18px; color: var(--am-ink-soft); font-size: 16px; }
  .cap { margin: 14px 0 0; font-size: 14px; color: var(--am-muted); }

  /* Media slots. Both keep their shape whether filled or empty, so the page
     does not jump around once a real video and calendar are dropped in. */
  .ratio { position: relative; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--r-control); overflow: hidden; background: var(--am-paper); }
  .ratio .frame { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; }
  .calwrap { width: 100%; min-height: 640px; border-radius: var(--r-control); overflow: hidden; background: var(--am-paper); }
  .cal { width: 100%; height: 640px; border: 0; display: block; }

  .sample {
    margin: 0 0 14px; font-size: 12px; font-weight: 600; letter-spacing: .06em;
    text-transform: uppercase; color: var(--am-amber-text);
    background: var(--am-amber-100); border-radius: 6px;
    padding: 5px 9px; display: inline-block;
  }
  code {
    font-family: ui-monospace, "SF Mono", Consolas, monospace; font-size: 13px;
    background: var(--am-line-soft); padding: 1px 5px; border-radius: 4px;
  }

  /* Video, drawn as a still frame with a play affordance. */
  .player { color: #fff; }
  .playerbg {
    position: absolute; inset: 0;
    background: linear-gradient(150deg, var(--am-blue-800) 0%, var(--am-blue-700) 58%, #0A4A76 100%);
  }
  .playerinner {
    position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 4px; text-align: center; padding: 20px;
  }
  .playbtn {
    width: 62px; height: 62px; border-radius: 50%; margin-bottom: 14px;
    background: rgba(255,255,255,.16); border: 1.5px solid rgba(255,255,255,.55);
    display: flex; align-items: center; justify-content: center; color: #fff;
    padding-left: 3px;
  }
  .playtitle { margin: 0; font-family: var(--display); font-size: 26px; line-height: 1.15; }
  .playmeta { margin: 2px 0 0; font-size: 13px; color: rgba(255,255,255,.72); letter-spacing: .03em; }
  .scrubber {
    position: absolute; left: 16px; right: 16px; bottom: 14px; height: 3px;
    border-radius: 2px; background: rgba(255,255,255,.28);
  }
  .scrubber span { display: block; width: 22%; height: 100%; border-radius: 2px; background: var(--am-amber-400); }

  /* Scheduling widget, drawn as a worked example. */
  .calmock {
    display: grid; grid-template-columns: 210px 1fr; gap: 0;
    border: 1px solid var(--am-line); border-radius: var(--r-control); overflow: hidden;
  }
  .calside { background: var(--am-blue-50); padding: 20px; border-right: 1px solid var(--am-line); }
  .calagent { margin: 0; font-family: var(--display); font-size: 22px; line-height: 1.15; color: var(--am-ink); }
  .calmeeting { margin: 2px 0 14px; font-size: 15px; color: var(--am-ink-soft); }
  .calfacts { list-style: none; margin: 0 0 14px; padding: 0; display: flex; flex-direction: column; gap: 7px; }
  .calfacts li { font-size: 14px; color: var(--am-ink-soft); padding-left: 15px; position: relative; }
  .calfacts li::before {
    content: ""; position: absolute; left: 0; top: 8px; width: 6px; height: 6px;
    border-radius: 50%; background: var(--am-blue-300);
  }
  .calnote { margin: 0; font-size: 13px; line-height: 1.5; color: var(--am-muted); }

  .calmain { padding: 8px 18px 16px; background: var(--am-white); }
  .calday { display: grid; grid-template-columns: 62px 1fr; gap: 16px; padding: 14px 0; border-top: 1px solid var(--am-line-soft); }
  .calday:first-child { border-top: 0; }
  .caldate { text-align: center; padding-top: 2px; }
  .caldate .dow { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--am-muted); }
  .caldate .dom { display: block; font-family: var(--display); font-size: 26px; line-height: 1.05; color: var(--am-ink); }
  .caldate .mon { display: block; font-size: 11px; color: var(--am-muted); }
  .calday.today .dom { color: var(--am-blue-700); }
  .calslots { display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start; }
  .slotbtn {
    font: inherit; font-size: 14px; font-weight: 500;
    padding: 9px 14px; min-height: 40px; border-radius: var(--r-control);
    border: 1.5px solid #C6DDEE; background: var(--am-white); color: var(--am-blue-700);
    cursor: default;
  }
  .slotbtn[disabled] { opacity: .85; }

  @media (max-width: 620px) {
    .calmock { grid-template-columns: 1fr; }
    .calside { border-right: 0; border-bottom: 1px solid var(--am-line); }
    .playtitle { font-size: 21px; }
  }

  /* Phones. The client reaches this page from the form, on the same handset,
     so it gets the same treatment: cards edge to edge rather than framed, and
     type that does not need pinching. */
  @media (max-width: 720px) {
    body { -webkit-tap-highlight-color: transparent; }
    .topbar { padding: 10px max(14px, env(safe-area-inset-left, 0px)); }
    .lockup .word { font-size: 21px; }
    .notice { padding: 10px 14px; font-size: 13px; }
    main { padding: 34px 0 calc(44px + env(safe-area-inset-bottom, 0px)); }
    .hero { padding: 0 16px; }
    .card {
      border-left: 0; border-right: 0; border-radius: 0;
      box-shadow: none; padding: 22px 16px;
    }
    .viewtoggle .btn { padding: 7px 10px; font-size: 12px; min-height: 32px; }
    .slotbtn { min-height: 46px; font-size: 16px; }
    .calslots { gap: 8px; }
    footer { padding: 0 16px calc(40px + env(safe-area-inset-bottom, 0px)); }
  }

  .next { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .next li { display: grid; grid-template-columns: 26px 1fr; gap: 12px; font-size: 16px; color: var(--am-ink-soft); }
  .next .n {
    width: 24px; height: 24px; border-radius: 50%; background: var(--am-blue-100);
    color: var(--am-blue-700); font-size: 13px; font-weight: 600;
    display: flex; align-items: center; justify-content: center;
  }
  .next b { color: var(--am-ink); font-weight: 600; }

  footer {
    max-width: 700px; margin: 0 auto;
    padding: 0 clamp(16px, 4vw, 24px) 64px;
    color: var(--am-muted); font-size: 14px; line-height: 1.55;
  }
  footer a { color: var(--am-blue-700); }

  /* The code the client carries to their agent. Large because it will be
     photographed, and monospace because 4 and A must not be mistakable. */
  .codecard h2 { margin-bottom: 8px; }
  .codelead { margin: 0 0 16px; color: var(--am-ink-soft); }
  .coderow { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .codeval {
    font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
    font-size: clamp(26px, 7vw, 38px); letter-spacing: 0.08em;
    color: var(--am-ink); background: var(--am-blue-50);
    border: 1.5px dashed var(--am-blue-300); border-radius: var(--r-control);
    padding: 10px 18px;
  }
  .codebtn {
    font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
    border-radius: var(--r-control); padding: 11px 20px; min-height: 44px;
    background: var(--am-white); color: var(--am-blue-700);
    border: 1.5px solid #C6DDEE;
  }
  .codebtn:hover { border-color: var(--am-blue-600); background: var(--am-blue-50); }
  .codehint { margin: 14px 0 0; font-size: 14px; color: var(--am-muted); }
  .afternote {
    margin: 18px 0 0; padding-top: 14px; border-top: 1px solid var(--am-line-soft);
    font-size: 14px; line-height: 1.55; color: var(--am-ink-soft);
  }

  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="notice">
  <p class="ntext" role="status"><b>Draft for review.</b> This is not the live form yet, so nothing was actually sent.</p>
  ${
    AGENCY.draft
      ? `<div class="viewtoggle" role="group" aria-label="View">
    <a class="btn secondary" href="agent.html">Agent recommendation</a>
    <span class="btn secondary is-current" aria-current="page">What the client sees</span>
  </div>`
      : ""
  }
</div>

<div class="topbar">
  ${lockup(32)}
</div>

<main>
  <div class="hero">
    <h1>Thank you</h1>
    <p class="first">You have given ${esc(AGENCY.agentName)} something far better to start from than a blank page. The meeting can now be about which plan suits your family, not an hour of paperwork.</p>
  </div>

  <section class="card codecard" id="codecard" hidden>
    <h2>Your code</h2>
    <p class="codelead">Give this to ${esc(AGENCY.agentName)}. It is the only thing that connects these answers to you; your name was never asked.</p>
    <div class="coderow">
      <span class="codeval" id="codeval"></span>
      <button class="codebtn" type="button" id="codecopy">Copy</button>
    </div>
    <p class="codehint">Screenshot it, or copy it into the message you send him. Your browser also remembers it on this page.</p>
  </section>

  ${videoBlock()}

  ${calendarBlock()}

  <section class="card">
    <h2>What happens now</h2>
    <ul class="next">
      <li><span class="n">1</span><span><b>${esc(AGENCY.agentName)} reads your answers before you meet.</b> Nothing goes to an insurer; no application has started.</span></li>
      <li><span class="n">2</span><span><b>He checks every plan sold in New Jersey</b> against your doctors, your prescriptions and the year you described.</span></li>
      <li><span class="n">3</span><span><b>You meet, and he walks you through what he found.</b> The recommendation is his, made by a licensed agent accountable for it.</span></li>
    </ul>
    <p class="afternote">Gave a wrong figure, or forgot a prescription? Mention it when you meet. Nothing here is binding.</p>
  </section>
</main>

<footer>
  ${AGENCY.phone || AGENCY.email
    ? `Need to reach ${esc(AGENCY.agentName)} sooner? ${AGENCY.phone ? `Call <a href="tel:${esc(AGENCY.phone.replace(/[^\d+]/g, ""))}">${esc(AGENCY.phone)}</a>` : ""}${AGENCY.phone && AGENCY.email ? " or " : ""}${AGENCY.email ? `email <a href="mailto:${esc(AGENCY.email)}">${esc(AGENCY.email)}</a>` : ""}.`
    : `${esc(AGENCY.agencyName)} will be in touch.`}
</footer>

<script>
(function () {
  // The code was minted when the form was submitted and lives in this
  // browser. Showing it again on every return visit is recovery layer one:
  // the common loss case is someone who never took the screenshot but is
  // still on the phone they filled the form in on.
  var code = localStorage.getItem("askmike:clientCode");
  if (!code) return;
  document.getElementById("codeval").textContent = code;
  document.getElementById("codecard").hidden = false;
  var btn = document.getElementById("codecopy");
  btn.addEventListener("click", function () {
    navigator.clipboard.writeText(code).then(function () {
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = "Copy"; }, 1600);
    }, function () {
      // Clipboard can be refused. Select the code so a long press finishes
      // the job instead of the button silently doing nothing.
      var range = document.createRange();
      range.selectNodeContents(document.getElementById("codeval"));
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = "Press and hold to copy";
    });
  });
})();
</script>
`;

writeFileSync(join(outDir, "thanks.html"), html, "utf8");

console.log(`thanks.html     ${(html.length / 1024).toFixed(1)} KB`);
console.log(`  video          ${AGENCY.video ? AGENCY.video.kind : "not configured, sample rendered"}`);
console.log(`  calendar       ${AGENCY.calendarEmbedUrl ? "embedded" : "not configured, sample rendered"}`);
console.log(`  contact        ${AGENCY.phone || AGENCY.email ? "shown" : "not configured"}`);
// Where to fill these in is said here rather than on the page. A client should
// never be shown the workings of the thing they are reading.
console.log(`\n  All of the above are set in src/web/agency.ts.`);
if (AGENCY.draft) {
  console.log(
    `\n  Draft mode is on, so unfilled slots render as labelled samples.\n  Set draft to false in src/web/agency.ts before any real client sees this.`,
  );
}
