/**
 * Parses Oscar's New Jersey benefits grid into per plan copay schedules.
 *
 * Oscar do not publish per plan SBCs. They publish one landscape grid with
 * plans as columns and benefits as rows, and it is richer than an SBC: eleven
 * service types plus all four drug tiers, and it covers the cost sharing
 * variants as well as the base plans.
 *
 * A line based parse does not survive it. Plan names wrap across three header
 * rows and long values wrap across two or three body rows, so text extracted
 * in reading order interleaves columns. This works off x coordinates instead:
 * columns are found by clustering the x positions of the values, and every
 * fragment is assigned to the column it physically sits in.
 *
 * Oscar label their cost sharing variants by the top of the income band they
 * serve, so "CSR 150" is the variant for households up to 150 percent of the
 * federal poverty level, which is the 94 percent actuarial value plan.
 *
 * Usage: npx tsx scripts/parse-oscar-grid.ts <grid.pdf> [out.json]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { CsrVariant } from "../src/types.ts";

interface Item {
  x: number;
  y: number;
  /** Rendered width, needed to place a header fragment by its centre. */
  w: number;
  text: string;
}

/** The service rows we take, keyed by the label Oscar print. */
const BENEFITS: Array<[RegExp, string]> = [
  [/^Primary Care Office Visits/i, "primaryCare"],
  [/^Specialist Office Visits/i, "specialist"],
  [/^Urgent Care/i, "urgentCare"],
  [/^Emergency Room/i, "emergencyRoom"],
  [/^Mental Health Office Visits/i, "mentalHealth"],
  [/^Labs/i, "labs"],
  [/^X-rays & Diagnostic Imaging/i, "xray"],
  [/^MRIs & Advanced Imaging/i, "advancedImaging"],
  [/^Inpatient Facility Fee/i, "inpatient"],
  [/^Outpatient Facility Fee/i, "outpatient"],
  [/^RX \| Generics: Preferred/i, "rxGenericPreferred"],
  [/^RX \| Brand: Preferred/i, "rxBrandPreferred"],
  [/^RX \| Brand: Specialty/i, "rxSpecialty"],
  [/^Deductible \(Individual/i, "deductible"],
  [/^Out-of-Pocket Max/i, "outOfPocketMax"],
  [/^HSA-Compatible/i, "hsaCompatible"],
];

const LABEL_X_MAX = 240;

/**
 * Finds the column grid from the header rather than from the values.
 *
 * Clustering the values does not work, and the reason is worth stating. A wide
 * value starts further left than a narrow one in the same column, so the
 * spread inside a column can exceed the gap between two columns. On page 3 the
 * gap between columns three and four is 35 points while the spread inside a
 * single column is larger than that. No threshold separates those two columns
 * without splitting others in half, and when two columns merge their plan
 * names concatenate and the whole column becomes unusable.
 *
 * The header has no such problem. Each column carries one plan name fragment
 * per header line, centred over the column, and those centres form an evenly
 * spaced grid on every page. Columns come from there; everything else is
 * assigned to the nearest one.
 */
function findColumns(items: Item[], headerCutoff: number): number[] {
  const centres = items
    .filter((i) => i.y > headerCutoff && i.x > LABEL_X_MAX)
    .map((i) => i.x + i.w / 2)
    .sort((a, b) => a - b);
  if (!centres.length) return [];

  const groups: number[][] = [[centres[0]!]];
  for (let i = 1; i < centres.length; i += 1) {
    // Fragments of one plan name share a centre within a few points.
    // Neighbouring columns are tens of points apart.
    if (centres[i]! - centres[i - 1]! > 25) groups.push([centres[i]!]);
    else groups[groups.length - 1]!.push(centres[i]!);
  }
  return groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}

/** Assigns a fragment to the column whose centre it sits closest to. */
function columnOf(centre: number, anchors: number[]): number {
  if (!anchors.length) return -1;
  let best = 0;
  for (let i = 1; i < anchors.length; i += 1) {
    if (Math.abs(centre - anchors[i]!) < Math.abs(centre - anchors[best]!)) best = i;
  }
  const spacing =
    anchors.length > 1
      ? (anchors[anchors.length - 1]! - anchors[0]!) / (anchors.length - 1)
      : 120;
  // Further than about half a column from every anchor means it belongs to none.
  return Math.abs(centre - anchors[best]!) <= spacing * 0.65 ? best : -1;
}

/** Oscar name the variant by the income ceiling it serves. */
function csrFromName(name: string): CsrVariant {
  if (/CSR\s*150/i.test(name)) return "csr94";
  if (/CSR\s*200/i.test(name)) return "csr87";
  if (/CSR\s*250/i.test(name)) return "csr73";
  return "standard";
}

/** Strips the CSR suffix to leave the plan name as it appears in the filings. */
function baseName(name: string): string {
  return name
    .replace(/\bCSR\s*\d{3}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface OscarPlanCopays {
  planName: string;
  csrVariant: CsrVariant;
  benefits: Record<string, string>;
  /** Set when the reading looks like two columns merged into one cell. */
  suspect: boolean;
  suspectReasons: string[];
}

/**
 * Detects column bleed.
 *
 * On a couple of pages the header wraps differently and a value cell picks up
 * its neighbour, producing readings like "$0 $15" or "20% 40%". Those are
 * unusable and, worse, they look plausible. Two independent amounts in one
 * cell, or a plan name that contains two plan names, means the reading is
 * wrong and should be discarded rather than trusted.
 */
function cellIsBled(key: string, value: string): boolean {
  // Deductible and out of pocket maximum are legitimately two figures, filed as
  // individual and family. Everything else should carry one.
  if (key === "deductible" || key === "outOfPocketMax") {
    return /\d\s*\/\s*[\d$,]+\s+\$/.test(value);
  }
  return /\$[\d,]+\s+\$[\d,]+/.test(value) || /\d+%\s+\d+%/.test(value);
}

/**
 * Flags bleed at the level of the individual cell rather than the whole plan.
 *
 * The drug tier rows wrap over several lines and bleed most often. Discarding
 * an entire plan because one drug row is unreadable would throw away clean
 * office visit copays, which are the figures the cost model actually needs.
 *
 * A plan name carrying two plan names is different: that means the column
 * itself was misidentified, so nothing in it can be trusted.
 */
function bleedReasons(plan: OscarPlanCopays): string[] {
  const metals = plan.planName.match(/\b(Bronze|Silver|Gold|Secure)\b/gi) ?? [];
  if (metals.length > 1) {
    return [`plan name contains ${metals.length} plan names, column misidentified`];
  }
  return [];
}

/** Removes unreadable cells, leaving the rest of the plan usable. */
function dropBledCells(plan: OscarPlanCopays): string[] {
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(plan.benefits)) {
    if (cellIsBled(k, v)) {
      dropped.push(k);
      delete plan.benefits[k];
    }
  }
  return dropped;
}

async function parsePage(file: string, pageNo: number): Promise<OscarPlanCopays[]> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true })
    .promise;
  if (pageNo > doc.numPages) return [];
  const page = await doc.getPage(pageNo);
  const content = await page.getTextContent();

  const items: Item[] = (content.items as Array<{ str: string; transform: number[] }>)
    .filter((i) => i.str?.trim())
    .map((i) => ({
      x: Math.round(i.transform[4]!),
      y: Math.round(i.transform[5]!),
      w: Math.round((i as unknown as { width: number }).width ?? 0),
      text: i.str.trim(),
    }));

  // The header sits above the first benefit row, so that row bounds it.
  const firstBenefitY = Math.max(
    ...items
      .filter((i) => i.x <= LABEL_X_MAX && BENEFITS.some(([re]) => re.test(i.text)))
      .map((i) => i.y),
    0,
  );
  const headerCutoff = firstBenefitY > 0 ? firstBenefitY + 10 : 0;

  const cols = findColumns(items, headerCutoff);
  if (cols.length === 0) return [];

  const names: string[][] = cols.map(() => []);
  for (const i of items.filter((it) => it.y > headerCutoff && it.x > LABEL_X_MAX)) {
    const c = columnOf(i.x + i.w / 2, cols);
    if (c >= 0) names[c]!.push(i.text);
  }
  const planNames = names.map((parts) => parts.join(" ").replace(/\s+/g, " ").trim());

  // Body. Each labelled row owns everything down to the next labelled row, so
  // wrapped values attach to the benefit they belong to.
  const labelled = items
    .filter((i) => i.x <= LABEL_X_MAX)
    .map((i) => ({ y: i.y, text: i.text, key: BENEFITS.find(([re]) => re.test(i.text))?.[1] }))
    .filter((l) => l.key)
    .sort((a, b) => b.y - a.y);

  const plans: OscarPlanCopays[] = planNames.map((name) => ({
    planName: baseName(name),
    csrVariant: csrFromName(name),
    benefits: {},
    suspect: false,
    suspectReasons: [],
  }));

  for (let li = 0; li < labelled.length; li += 1) {
    const row = labelled[li]!;
    const upper = row.y + 14;
    const lower = li + 1 < labelled.length ? labelled[li + 1]!.y + 14 : -Infinity;

    const cells: string[][] = cols.map(() => []);
    for (const i of items) {
      if (i.x <= LABEL_X_MAX) continue;
      if (i.y > upper || i.y <= lower) continue;
      const c = columnOf(i.x + i.w / 2, cols);
      if (c >= 0) cells[c]!.push(i.text);
    }
    cells.forEach((parts, c) => {
      const value = parts.join(" ").replace(/\s+/g, " ").trim();
      if (value && plans[c]) plans[c]!.benefits[row.key!] = value;
    });
  }

  for (const p of plans) {
    p.suspectReasons = bleedReasons(p);
    p.suspect = p.suspectReasons.length > 0;
    if (!p.suspect) {
      const dropped = dropBledCells(p);
      if (dropped.length) p.suspectReasons.push(`unreadable cells dropped: ${dropped.join(', ')}`);
    }
  }
  return plans.filter((p) => p.planName && Object.keys(p.benefits).length > 2);
}

const file = process.argv[2];
if (!file) {
  console.error("usage: npx tsx scripts/parse-oscar-grid.ts <grid.pdf> [out.json]");
  process.exit(1);
}

const doc = await getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true })
  .promise;

const all: OscarPlanCopays[] = [];
for (let p = 1; p <= doc.numPages; p += 1) {
  all.push(...(await parsePage(file, p)));
}

// The same plan can appear on more than one page. Keep the fullest reading.
const merged = new Map<string, OscarPlanCopays>();
for (const p of all) {
  const key = `${p.planName}|${p.csrVariant}`;
  const existing = merged.get(key);
  // A clean reading always beats a suspect one, whatever its coverage.
  const better =
    !existing ||
    (existing.suspect && !p.suspect) ||
    (existing.suspect === p.suspect &&
      Object.keys(p.benefits).length > Object.keys(existing.benefits).length);
  if (better) merged.set(key, p);
}
const everything = [...merged.values()].sort(
  (a, b) => a.planName.localeCompare(b.planName) || a.csrVariant.localeCompare(b.csrVariant),
);

// Suspect readings are dropped rather than shipped. A wrong copay that looks
// plausible is worse than a missing one, because nothing downstream can tell.
const plans = everything.filter((p) => !p.suspect);
const rejected = everything.filter((p) => p.suspect);

console.log(`\nParsed ${doc.numPages} pages, ${plans.length} usable plan and variant combinations.\n`);
console.log(
  `${"PLAN".padEnd(34)} ${"VARIANT".padEnd(9)} ${"PRIMARY".padStart(9)} ${"SPECIALIST".padStart(11)} ${"ER".padStart(12)} ${"MRI".padStart(12)}`,
);
for (const p of plans) {
  const g = (k: string) => (p.benefits[k] ?? "-").slice(0, 12);
  console.log(
    `${p.planName.slice(0, 33).padEnd(34)} ${p.csrVariant.padEnd(9)} ${g("primaryCare").padStart(9)} ${g("specialist").padStart(11)} ${g("emergencyRoom").padStart(12)} ${g("advancedImaging").padStart(12)}`,
  );
}

if (rejected.length) {
  console.log(`\n${rejected.length} readings discarded as column bleed:`);
  for (const r of rejected) {
    console.log(`  ${r.planName.slice(0, 40).padEnd(41)} ${r.suspectReasons.join("; ")}`);
  }
}

const coverage = new Map<string, number>();
for (const p of plans) for (const k of Object.keys(p.benefits)) coverage.set(k, (coverage.get(k) ?? 0) + 1);
console.log(`\nService types recovered, out of ${plans.length} plans:`);
for (const [k, n] of [...coverage.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(22)} ${n}`);
}

const out = process.argv[3];
if (out) {
  writeFileSync(out, JSON.stringify(plans, null, 2), "utf8");
  console.log(`\nWritten to ${out}`);
}




