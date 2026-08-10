/**
 * Reads the notes agents left and sorts them into the taxonomy.
 *
 * This runs after the fact, on purpose. The agent said a sentence into a
 * phone between two calls; turning that into a code is our job, not theirs,
 * and doing it here rather than in the interface means the categories can be
 * wrong for a while without costing anyone a tap.
 *
 * Nothing here writes to plan_action. The note stays exactly as it was said,
 * and every reading of it is a new row in plan_action_label carrying the
 * taxonomy version it was made under. Change the taxonomy, re-run this, and
 * the whole back catalogue is relabelled without losing what it said before.
 *
 * Usage: npx tsx scripts/classify-notes.ts [dbfile] [--dry]
 */

import Anthropic from "@anthropic-ai/sdk";
import { Store } from "../src/store/db.ts";
import {
  TAXONOMY_VERSION,
  ACTION_KINDS,
  TOPICS,
  DETAIL_CODES,
  BROKER_ECONOMICS_CODES,
  taxonomyForPrompt,
} from "../src/review/taxonomy.ts";

const MODEL = "claude-opus-5";
const dbFile = process.argv[2]?.startsWith("--") ? "data/testing.sqlite" : process.argv[2] ?? "data/testing.sqlite";
const dryRun = process.argv.includes("--dry");

const store = new Store({ file: dbFile });
const pending = store.unlabelledActions(TAXONOMY_VERSION);

if (!pending.length) {
  console.log(`\n  Nothing to classify. Every note already carries a ${TAXONOMY_VERSION} label.\n`);
  store.close();
  process.exit(0);
}

console.log(`\n  ${pending.length} note${pending.length === 1 ? "" : "s"} to read, taxonomy ${TAXONOMY_VERSION}\n`);

if (dryRun) {
  for (const p of pending) console.log(`    ${p.action.padEnd(10)} ${p.plan_id.padEnd(20)} ${p.raw_note}`);
  console.log(`\n  Dry run. Nothing was sent anywhere and nothing was written.\n`);
  store.close();
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    `\n  ANTHROPIC_API_KEY is not set, so there is nothing to classify with.\n` +
      `  The notes are safe in the database and this can be run again later.\n` +
      `  Use --dry to see what is waiting.\n`,
  );
  store.close();
  process.exit(1);
}

const SYSTEM = `You are sorting notes written by a licensed health insurance agent in southern New Jersey into a fixed set of codes.

Each note explains why the agent led with a particular marketplace plan, or ruled it out, for one household. They are dictated between client calls, so they are short, spoken, and often incomplete. Read them as speech, not prose.

Three things decide what happens to a note, and getting this split right matters more than the fine grained code:

- data_error: the agent is telling us a fact about the world that our plan data has wrong. A provider we list as in network who is not. A drug we show as covered that is not. These raise a data ticket.
- client_fit: our data is right, but the plan is wrong for this particular household. Deductible they cannot carry, a carrier they will not leave, a hospital they will not give up. These teach the ranking.
- broker_economics: the reason is about the agent's own position rather than the client's. No appointment with the carrier, the plan pays them less, the carrier's enrolment process is painful. These are logged and then deliberately excluded from anything that influences a recommendation, because they say nothing about whether the plan suited the client. Do not disguise these as client_fit out of charity. Recording them honestly is what keeps them out of the ranking.

The codes:

${taxonomyForPrompt()}

Broker economics codes: ${BROKER_ECONOMICS_CODES.join(", ")}

When a note names a specific provider, hospital or drug, put that name in subject exactly as the agent said it. That is the most valuable thing in the note.

When the note does not support a confident reading, say so with a low confidence rather than picking the nearest code. An honestly uncertain label is useful; a confident wrong one quietly corrupts the ranking. If a note carries two reasons, code the one the agent leads with.`;

const SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ACTION_KINDS as unknown as string[] },
    topic: { type: "string", enum: TOPICS as unknown as string[] },
    detail: { type: "string", enum: DETAIL_CODES as unknown as string[] },
    subject: {
      type: "string",
      description: "The provider, hospital or drug named, verbatim. Empty string when none is named.",
    },
    confidence: { type: "number", description: "0 to 1. Below 0.5 means the note is too thin to code well." },
  },
  required: ["kind", "topic", "detail", "subject", "confidence"],
  additionalProperties: false,
} as const;

const client = new Anthropic();

let written = 0;
let refused = 0;
const unsure: Array<{ note: string; detail: string; confidence: number }> = [];

for (const p of pending) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // Short, bounded reading of one sentence. Opus at low effort is well
    // beyond what this needs, and the cost per note matters at season volume.
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    // A safety classifier declining a note about a health plan would be a
    // surprise, but a declined request returns 200 with an empty body rather
    // than raising, so it is handled rather than assumed away.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `The agent ${p.action === "ruled_out" ? "ruled out" : "led with"} plan ${p.plan_id}` +
          (p.rank ? `, which we ranked ${p.rank}` : "") +
          `.\n\nWhat they said: ${p.raw_note}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    refused += 1;
    console.log(`    declined  ${p.raw_note.slice(0, 70)}`);
    continue;
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") continue;
  const out = JSON.parse(text.text) as {
    kind: string;
    topic: string;
    detail: string;
    subject: string;
    confidence: number;
  };

  // The one correction worth making mechanically: a broker economics code is
  // broker economics whatever else the reading said, because that is the
  // classification the exclusion rule depends on.
  const kind = BROKER_ECONOMICS_CODES.includes(out.detail) ? "broker_economics" : out.kind;

  store.recordActionLabel({
    actionId: p.id,
    taxonomyVersion: TAXONOMY_VERSION,
    labelledBy: `model:${MODEL}`,
    kind,
    topic: out.topic,
    detail: out.detail,
    subject: out.subject || undefined,
    confidence: out.confidence,
  });
  written += 1;
  if (out.confidence < 0.5) unsure.push({ note: p.raw_note, detail: out.detail, confidence: out.confidence });
}

console.log(`\n  labelled  ${written}`);
if (refused) console.log(`  declined  ${refused}`);

if (unsure.length) {
  console.log(`\n  ${unsure.length} the model was not confident about. Worth reading yourself:\n`);
  for (const u of unsure) {
    console.log(`    ${u.confidence.toFixed(2)}  ${u.detail.padEnd(26)} ${u.note.slice(0, 70)}`);
  }
}

console.log(
  `\n  These labels are a reading, not the record. The notes themselves are untouched\n` +
    `  in plan_action.raw_note, so revising the taxonomy and re-running this costs nothing.\n`,
);

store.close();
