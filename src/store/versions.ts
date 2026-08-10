/**
 * Version stamps recorded against every recommendation run.
 *
 * The point is to make a bad recommendation diagnosable months later. Given a
 * stored run you can tell whether the engine code, the plan filings, the
 * estimated service prices or the questionnaire changed underneath it.
 *
 * These are content hashes rather than semantic versions, because nobody
 * remembers to bump a semantic version and everybody edits files.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function hashFiles(paths: string[]): string {
  const h = createHash("sha256");
  for (const p of paths.sort()) {
    h.update(p);
    h.update(readFileSync(p));
  }
  return h.digest("hex").slice(0, 12);
}

/** Hash of the code that actually produces numbers. */
export function engineVersion(root = "."): string {
  return hashFiles([
    join(root, "src/cost.ts"),
    join(root, "src/rank.ts"),
    join(root, "src/subsidy.ts"),
    join(root, "src/premium.ts"),
    join(root, "src/puf.ts"),
  ]);
}

/** Hash of every value we invented rather than sourced from a filing. */
export function assumptionsVersion(root = "."): string {
  return hashFiles([join(root, "src/assumptions.ts")]);
}

export function questionnaireVersion(root = "."): string {
  return hashFiles([join(root, "src/intake/questionnaire.ts")]);
}

/**
 * Hash of the plan filings themselves, including file names and sizes, so a
 * refreshed CMS download produces a different version even if we forget to
 * note it anywhere.
 */
export function planDataVersion(dataDir: string): string {
  const h = createHash("sha256");
  for (const name of readdirSync(dataDir).sort()) {
    const full = join(dataDir, name);
    h.update(name);
    h.update(String(statSync(full).size));
    h.update(readFileSync(full));
  }
  return h.digest("hex").slice(0, 12);
}

export interface Versions {
  engine: string;
  assumptions: string;
  questionnaire: string;
  planData: string;
  /**
   * Hash of the rules for one state, once those live somewhere of their own.
   *
   * Deliberately absent today rather than faked. New Jersey's rules are still
   * entangled with the engine: the statewide rating area sits in premium.ts,
   * the Health Plan Savings estimate in subsidy.ts, and hashing those files
   * again under a second name would produce a stamp that looks meaningful and
   * moves in lockstep with engineVersion.
   *
   * The field and its column exist now because a run recorded before the split
   * should read as null, which is true, rather than needing a backfill that
   * invents an answer.
   */
  stateRules?: string;
}

export function currentVersions(dataDir: string, root = "."): Versions {
  return {
    engine: engineVersion(root),
    assumptions: assumptionsVersion(root),
    questionnaire: questionnaireVersion(root),
    planData: planDataVersion(dataDir),
  };
}
