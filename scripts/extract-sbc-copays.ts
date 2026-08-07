/**
 * Extracts office visit copays from Summary of Benefits and Coverage PDFs.
 *
 * The New Jersey filings carry no copay columns, which is the single biggest
 * gap in the cost model. SBCs do carry them, in a table whose wording is fixed
 * by federal regulation, which is what makes this parseable rather than a
 * scraping exercise.
 *
 * The rows we want are always phrased exactly:
 *   "Primary care visit to treat an injury or illness"
 *   "Specialist visit"
 * and the first cost token after each is the in network, tier 1 figure.
 *
 * Anything ambiguous is recorded as unparsed rather than guessed. A wrong
 * copay is worse than a missing one, because a missing one is visible.
 *
 * Usage: npx tsx scripts/extract-sbc-copays.ts <dir-of-pdfs> [out.json]
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface SbcCopays {
  source: string;
  /** Plan id when the filename carries one, as Centene's SBC endpoint does. */
  planId: string | null;
  planName: string | null;
  primaryCare: number | null;
  specialist: number | null;
  /** True when the copay applies without the deductible being met first. */
  primaryBeforeDeductible: boolean;
  specialistBeforeDeductible: boolean;
  /** Set when a service is coinsured rather than metered by a flat copay. */
  primaryCoinsurance: number | null;
  specialistCoinsurance: number | null;
  notes: string[];
}

async function pdfText(file: string, maxPages = 4): Promise<string> {
  const data = new Uint8Array(readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const lines = new Map<number, Array<{ x: number; text: string }>>();
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]!);
      const bucket = lines.get(y) ?? [];
      bucket.push({ x: item.transform[4]!, text: item.str });
      lines.set(y, bucket);
    }
    pages.push(
      [...lines.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, items]) =>
          items.sort((a, b) => a.x - b.x).map((i) => i.text).join(" ").replace(/\s+/g, " ").trim(),
        )
        .join("\n"),
    );
  }
  return pages.join("\n");
}

/**
 * Reads the first cost figure stated for a benefit row.
 *
 * Order matters. A row often lists the headline copay, then a telemedicine
 * copay, then an out of network coinsurance. The first token is the one that
 * applies to an ordinary in network visit.
 */
function firstCost(segment: string): {
  copay: number | null;
  coinsurance: number | null;
  beforeDeductible: boolean;
} {
  const window = segment.slice(0, 260);
  const copayMatch = window.match(/\$\s?([\d,]+)(?:\.\d\d)?\s*Copay/i);
  const coinsMatch = window.match(/(\d{1,3})\s?%\s*Coinsurance/i);
  const noChargeMatch = window.match(/No Charge/i);

  // "Deductible does not apply" appearing near the figure means the copay bites
  // from the first visit rather than after the deductible is satisfied. The
  // phrase lands on the line below the amount in the same table cell, so the
  // window has to be wide enough to reach it.
  const beforeDeductible = /Deductible does not apply/i.test(window);

  const copayAt = copayMatch?.index ?? Infinity;
  const coinsAt = coinsMatch?.index ?? Infinity;
  const freeAt = noChargeMatch?.index ?? Infinity;

  // Whichever is stated first is the in network answer. "No Charge" is a real
  // reading, not an absence of one: the zero cost sharing variants say it for
  // every service, and treating it as nothing found loses a whole variant tier.
  if (freeAt < copayAt && freeAt < coinsAt) {
    return { copay: 0, coinsurance: null, beforeDeductible: true };
  }

  if (copayAt < coinsAt && copayMatch) {
    return {
      copay: Number(copayMatch[1]!.replace(/,/g, "")),
      coinsurance: null,
      beforeDeductible,
    };
  }
  if (coinsMatch) {
    return { copay: null, coinsurance: Number(coinsMatch[1]) / 100, beforeDeductible };
  }
  return { copay: null, coinsurance: null, beforeDeductible: false };
}

function segmentAfter(text: string, marker: RegExp, stop: RegExp): string | null {
  const m = text.match(marker);
  if (!m || m.index === undefined) return null;
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(stop);
  return end > 0 ? rest.slice(0, end) : rest.slice(0, 400);
}

/**
 * The text immediately preceding a benefit label.
 *
 * Some issuers lay the table out so the value cell renders on the line above
 * its own label, which reading order then puts before it:
 *
 *   $50 Copay / visit          Not covered      Unlimited Virtual 24/7 Care
 *   Primary care visit to treat an              from the designated telehealth
 *
 * Looking only forward from the label walks straight past the copay and into
 * the footnote. The lookback is bounded so it cannot reach into the previous
 * benefit row and report that row's price instead.
 */
function segmentBefore(text: string, marker: RegExp, maxChars = 220): string | null {
  const m = text.match(marker);
  if (!m || m.index === undefined) return null;
  return text.slice(Math.max(0, m.index - maxChars), m.index);
}

export async function extract(file: string): Promise<SbcCopays> {
  const text = await pdfText(file);
  const notes: string[] = [];

  const nameMatch = text.match(/^(.*?):\s*(.+?)\s*$/m);
  const planName =
    text.match(/(?:BCBSNJ|Ambetter|Oscar|AmeriHealth|UnitedHealthcare|Oxford)[:\s]+([^\n]{3,70})/)?.[1]?.trim() ??
    nameMatch?.[2]?.trim() ??
    null;

  const base = file.split(/[\\/]/).pop() ?? file;
  const planId = base.match(/^(\d{5}[A-Z]{2}\d{7}-\d{2})/)?.[1] ?? null;

  // The full regulated phrase is "Primary care visit to treat an injury or
  // illness", but the SBC lays it out as a narrow table cell, so the words are
  // split across three lines with other columns interleaved between them.
  // Matching the opening fragment is the only thing that survives the layout.
  const pcSeg = segmentAfter(text, /Primary care visit/i, /Specialist visit/i);
  const spSeg = segmentAfter(text, /Specialist visit/i, /Preventive care|Diagnostic test/i);

  if (!pcSeg) notes.push("primary care row not found");
  if (!spSeg) notes.push("specialist row not found");

  const empty = { copay: null, coinsurance: null, beforeDeductible: false };
  const found = (c: { copay: number | null; coinsurance: number | null }) =>
    c.copay !== null || c.coinsurance !== null;

  // Forward from the label first, since that is the common layout. Only fall
  // back to the lookback when forward finds nothing, so a correct reading is
  // never overridden by a stray figure sitting above the row.
  let pc = pcSeg ? firstCost(pcSeg) : empty;
  if (!found(pc)) {
    const back = segmentBefore(text, /Primary care visit/i);
    if (back) {
      const reversed = firstCost(back.slice(-220));
      if (found(reversed)) {
        pc = reversed;
        notes.push("primary care read from the line above its label");
      }
    }
  }

  let sp = spSeg ? firstCost(spSeg) : empty;
  if (!found(sp)) {
    const back = segmentBefore(text, /Specialist visit/i);
    // The specialist row is preceded by the primary care row, so a lookback can
    // easily report the wrong price. Only trust it when the window is clear of
    // the primary care label.
    if (back && !/Primary care/i.test(back.slice(-220))) {
      const reversed = firstCost(back.slice(-220));
      if (found(reversed)) {
        sp = reversed;
        notes.push("specialist read from the line above its label");
      }
    }
  }

  if (pc.copay !== null && sp.copay !== null && sp.copay < pc.copay) {
    notes.push("specialist copay below primary care copay, columns may have been misread");
  }

  return {
    source: base,
    planId,
    planName,
    primaryCare: pc.copay,
    specialist: sp.copay,
    primaryBeforeDeductible: pc.beforeDeductible,
    specialistBeforeDeductible: sp.beforeDeductible,
    primaryCoinsurance: pc.coinsurance,
    specialistCoinsurance: sp.coinsurance,
    notes,
  };
}

const dir = process.argv[2];
if (!dir) {
  console.error("usage: npx tsx scripts/extract-sbc-copays.ts <dir-of-pdfs> [out.json]");
  process.exit(1);
}

const files: string[] = [];
const walk = (d: string) => {
  for (const name of readdirSync(d)) {
    const full = join(d, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.toLowerCase().endsWith(".pdf")) files.push(full);
  }
};
walk(dir);

const results: SbcCopays[] = [];
for (const f of files) {
  try {
    results.push(await extract(f));
  } catch (err) {
    results.push({
      source: f.split(/[\\/]/).pop() ?? f,
      planId: null,
      planName: null,
      primaryCare: null,
      specialist: null,
      primaryBeforeDeductible: false,
      specialistBeforeDeductible: false,
      primaryCoinsurance: null,
      specialistCoinsurance: null,
      notes: [`failed to read: ${(err as Error).message}`],
    });
  }
}

const clean = results.filter((r) => r.primaryCare !== null || r.primaryCoinsurance !== null);
console.log(`\nRead ${results.length} SBC documents, ${clean.length} yielded a primary care figure.\n`);
console.log(
  `${"SOURCE".padEnd(26)} ${"PLAN".padEnd(34)} ${"PRIMARY".padStart(9)} ${"SPECIALIST".padStart(11)} ${"PRE-DED".padStart(8)}`,
);
for (const r of results.slice(0, 40)) {
  const pc = r.primaryCare !== null ? `$${r.primaryCare}` : r.primaryCoinsurance !== null ? `${(r.primaryCoinsurance * 100).toFixed(0)}%` : "-";
  const sp = r.specialist !== null ? `$${r.specialist}` : r.specialistCoinsurance !== null ? `${(r.specialistCoinsurance * 100).toFixed(0)}%` : "-";
  console.log(
    `${r.source.slice(0, 25).padEnd(26)} ${(r.planName ?? "").slice(0, 33).padEnd(34)} ${pc.padStart(9)} ${sp.padStart(11)} ${(r.primaryBeforeDeductible ? "yes" : "no").padStart(8)}`,
  );
}
if (results.length > 40) console.log(`  ... and ${results.length - 40} more`);

const problems = results.filter((r) => r.notes.length);
if (problems.length) {
  console.log(`\n${problems.length} documents raised notes:`);
  for (const p of problems.slice(0, 10)) console.log(`  ${p.source}: ${p.notes.join("; ")}`);
}

const out = process.argv[3];
if (out) {
  writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nWritten to ${out}`);
}
