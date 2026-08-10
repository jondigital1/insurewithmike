/**
 * Flags notes that may carry something about the client that should not be
 * here. It does not remove anything.
 *
 * Deleting on a match would be worse than useless in this domain. Cooper is a
 * hospital in Camden and a surname. Virtua, Inspira and Horizon all read as
 * proper nouns. And the single most valuable thing an agent can tell us is
 * "Dr Patel is not actually taking Omnia", which names a person on purpose:
 * provider names are the asset, client names are the liability, and a scrubber
 * cannot reliably tell them apart. So this raises a hand and a human looks.
 *
 * Precision matters more than recall here. A flag that fires on every third
 * note gets ignored within a week, at which point it protects nothing.
 */

export interface PiiFinding {
  kind: "phone" | "email" | "ssn" | "street" | "date_of_birth" | "honorific";
  /** The matched text, kept so a reviewer can see what tripped it. */
  match: string;
}

/** Titles that precede a client's name. Dr is absent on purpose. */
const CLIENT_HONORIFIC = /\b(?:Mr|Mrs|Ms|Miss)\.?\s+[A-Z][a-z]{2,}/g;

const PATTERNS: ReadonlyArray<{ kind: PiiFinding["kind"]; re: RegExp }> = [
  // 609 555 0134, (856) 555-0134, 856-555-0134
  { kind: "phone", re: /\b(?:\(\d{3}\)\s*|\d{3}[.\s-])\d{3}[.\s-]\d{4}\b/g },
  { kind: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { kind: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { kind: "street", re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Blvd|Ct|Court|Way|Pike)\b/g },
  { kind: "date_of_birth", re: /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g },
  { kind: "honorific", re: CLIENT_HONORIFIC },
];

export function findPii(note: string | null | undefined): PiiFinding[] {
  if (!note) return [];
  const found: PiiFinding[] = [];
  for (const { kind, re } of PATTERNS) {
    // Fresh lastIndex per call: these are module level and /g is stateful.
    re.lastIndex = 0;
    for (const m of note.matchAll(re)) found.push({ kind, match: m[0] });
  }
  return found;
}

export function suspectsPii(note: string | null | undefined): boolean {
  return findPii(note).length > 0;
}

/** One line for the import log, so a reviewer knows what to look at. */
export function describePii(findings: PiiFinding[]): string {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.kind, (counts.get(f.kind) ?? 0) + 1);
  return [...counts].map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(", ");
}
