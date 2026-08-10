/**
 * Takes the notes file the agent page exports and puts it in the database.
 *
 * The hosted page has no server, so a note leaves the browser as a download
 * and arrives here by hand. That is a bridge across a gap the product has not
 * closed yet, not an intended workflow, and it goes away the day there is an
 * agent login.
 *
 * Re-importing the same file is safe: rows carry the id the browser generated,
 * so a second run inserts nothing.
 *
 * Usage: npx tsx scripts/import-review.ts <notes.json> [dbfile]
 */

import { readFileSync } from "node:fs";
import { Store } from "../src/store/db.ts";
import { findPii, describePii } from "../src/review/pii.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npx tsx scripts/import-review.ts <notes.json> [dbfile]");
  process.exit(1);
}

const AGENCY_ID = "insurewithmike";

interface ExportedAction {
  id: string;
  runKey: string;
  planId: string;
  rank: number | null;
  action: "led_with" | "ruled_out";
  note: string;
  noteSource: "voice" | "typed" | null;
  noteMs: number;
  at: string;
  agent: string;
}

const payload = JSON.parse(readFileSync(file, "utf8")) as {
  exportedAt: string;
  planYear: number;
  actions: ExportedAction[];
};

const store = new Store({ file: process.argv[3] ?? "data/testing.sqlite" });
store.ensureAgency(AGENCY_ID, "Insure with Mike");

let added = 0;
let skipped = 0;
const flagged: Array<{ id: string; why: string; note: string }> = [];

// Resolved once per submission rather than once per note. Several notes share
// a run, and looking each one up separately would report the notes that found
// the placeholder we had just created as having matched a real run.
const runs = new Map<string, { id: string; real: boolean }>();
function runFor(runKey: string): string {
  const known = runs.get(runKey);
  if (known) return known.id;
  const real = store.findRunBySubmittedAt(runKey);
  const id =
    real ??
    store.placeholderRun({
      agencyId: AGENCY_ID,
      submittedAt: runKey,
      planYear: payload.planYear,
    });
  runs.set(runKey, { id, real: real !== null });
  return id;
}

for (const a of payload.actions) {
  if (store.hasPlanAction(a.id)) {
    skipped += 1;
    continue;
  }

  const runId = runFor(a.runKey);

  // Flagged, never edited. A note is evidence, and quietly rewriting evidence
  // to make it tidier is how you end up unable to trust any of it.
  const pii = findPii(a.note);
  if (pii.length) flagged.push({ id: a.id, why: describePii(pii), note: a.note });

  store.recordPlanActionWithId(a.id, {
    runId,
    agencyId: AGENCY_ID,
    agentName: a.agent || "unknown",
    planId: a.planId,
    action: a.action,
    rank: a.rank,
    rawNote: a.note || undefined,
    noteSource: a.noteSource ?? undefined,
    noteMs: a.noteMs || undefined,
    piiSuspected: pii.length > 0,
    actedAt: a.at,
  });
  added += 1;
}

const linked = [...runs.values()].filter((r) => r.real).length;
const placeheld = runs.size - linked;

console.log(`\n  imported     ${added}`);
console.log(`  already held ${skipped}`);
console.log(`  submissions matched to a recorded run  ${linked}`);
if (placeheld) {
  console.log(
    `  submissions with no run in this database   ${placeheld}` +
      `\n\n  Those notes are kept against a placeholder marked synthetic. The engine run\n` +
      `  behind them happened in a browser and was never recorded here, so there are\n` +
      `  no figures to compare them against.`,
  );
}

if (flagged.length) {
  console.log(
    `\n  ${flagged.length} note${flagged.length === 1 ? "" : "s"} to read before this data goes anywhere.` +
      `\n  Nothing was removed. Provider names are expected here and are fine; a client's is not.\n`,
  );
  for (const f of flagged) {
    console.log(`    ${f.why.padEnd(18)} ${f.note.slice(0, 90)}`);
  }
  console.log(
    `\n  SQL for the queue:  SELECT id, raw_note FROM plan_action WHERE pii_suspected = 1;`,
  );
}

store.close();
