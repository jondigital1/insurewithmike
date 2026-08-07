/**
 * Drug coverage lookup.
 *
 * The intake asks clients to name what they take, from the bottle. That gives
 * free text like "metformin 500mg" or "Eliquis", which has to be matched
 * against formulary entries written as "metformin hydrochloride 500 MG Oral
 * Tablet". The matching is deliberately conservative: it reports what it found
 * and what it could not find, and never silently decides a drug is uncovered.
 *
 * "Not found" and "not covered" are different answers and are kept apart. We
 * hold formulary data for one carrier of five, so a miss usually means we have
 * no data rather than that the plan excludes the drug.
 */

export interface DrugOnPlan {
  tier: string;
  priorAuth: boolean;
  stepTherapy: boolean;
  quantityLimit: boolean;
}

export interface FormularyEntry {
  rxnorm: string;
  name: string;
  plans: Record<string, DrugOnPlan>;
}

export interface FormularyIndex {
  planYear: number;
  drugs: FormularyEntry[];
}

/**
 * Words carrying no identifying information.
 *
 * Two kinds are needed, and the frequency filter further down only catches one
 * of them. It removes words that are common in the formulary, such as "tablet".
 * It cannot remove words that are rare in the formulary but common in English:
 * "drug" appears in exactly two drug names, so it survives that filter and then
 * happily matches a client who wrote "some made up drug".
 */
const NOISE = new Set([
  // dosage and packaging
  "mg", "mcg", "ml", "iu", "unit", "units", "daily", "twice", "once", "day",
  "night", "pill", "pills", "dose", "doses", "release", "delayed", "extended",
  // ordinary English a client might type around the drug name
  "and", "the", "for", "with", "some", "made", "this", "that", "take", "takes",
  "taking", "drug", "drugs", "medication", "medications", "medicine", "med",
  "meds", "thing", "stuff", "other", "another", "generic", "brand", "name",
  "morning", "evening", "week", "weekly", "month", "monthly", "every",
]);

/**
 * Words describing the form a drug comes in.
 *
 * These are not noise. A client who writes "inhaler" means an inhaler, and
 * matching them to an oral tablet of the same molecule is a wrong answer, so
 * form is scored rather than discarded.
 */
const FORMS: Record<string, string[]> = {
  inhaler: ["inhalation", "inhaler", "aerosol", "powder"],
  inhalation: ["inhalation", "inhaler", "aerosol"],
  injection: ["injection", "injectable", "prefilled", "syringe", "pen"],
  injectable: ["injection", "injectable"],
  pen: ["pen", "injection"],
  cream: ["cream", "topical"],
  ointment: ["ointment", "topical"],
  patch: ["patch", "transdermal"],
  drops: ["drop", "drops", "ophthalmic", "otic"],
  liquid: ["solution", "suspension", "syrup", "liquid"],
  solution: ["solution", "liquid"],
  tablet: ["tablet"],
  tablets: ["tablet"],
  capsule: ["capsule"],
  capsules: ["capsule"],
};

export interface ParsedQuery {
  /** Words that identify the molecule or brand. */
  words: string[];
  /** Strengths the client wrote, such as 500 from "metformin 500mg". */
  strengths: number[];
  /** Form words the client wrote, expanded to their synonyms. */
  forms: string[];
}

/** Splits free text into the parts that identify a drug. */
export function parseQuery(text: string): ParsedQuery {
  const rawTokens = text
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const words: string[] = [];
  const strengths: number[] = [];
  const forms: string[] = [];

  for (const t of rawTokens) {
    if (/^\d+(\.\d+)?$/.test(t)) {
      strengths.push(Number(t));
      continue;
    }
    if (FORMS[t]) {
      forms.push(...FORMS[t]!);
      continue;
    }
    if (NOISE.has(t) || t.length < 4) continue;
    words.push(t);
  }
  return { words, strengths, forms: [...new Set(forms)] };
}

/** Splits a formulary drug name into whole words for word level matching. */
function nameWords(name: string): Set<string> {
  return new Set(
    name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean),
  );
}

/** Strengths appearing in a formulary drug name. */
function nameStrengths(name: string): number[] {
  return [...name.matchAll(/(\d+(?:\.\d+)?)\s*(?:mg|mcg|ml|unit)/gi)].map((m) => Number(m[1]));
}

export type MatchConfidence = "exact" | "likely" | "none";

export interface DrugLookup {
  /** What the client typed. */
  query: string;
  confidence: MatchConfidence;
  /** The formulary entry we matched, when we matched one. */
  matchedName: string | null;
  /** How many entries matched, so an ambiguous match can be shown as such. */
  candidateCount: number;
  /** Coverage per plan id, empty when nothing matched. */
  plans: Record<string, DrugOnPlan>;
}

/**
 * Looks one client entered drug up against the formulary.
 *
 * A single distinct token match is treated as likely rather than exact,
 * because "metformin" legitimately matches a dozen strengths and forms. Where
 * several entries match, the one with the shortest name is preferred, since
 * that is usually the plain form rather than a combination product.
 */
/**
 * Words that appear in too many drug names to identify anything.
 *
 * Built from the data rather than hand maintained. "Drug" is a real word in
 * "goserelin 3.6 MG Drug Implant", so a stoplist would have to guess at
 * exactly these cases; counting how often a word appears finds them all,
 * including the ones nobody would think to list.
 */
const commonWords = new WeakMap<FormularyIndex, Set<string>>();

function nonDiscriminative(index: FormularyIndex): Set<string> {
  const cached = commonWords.get(index);
  if (cached) return cached;

  const counts = new Map<string, number>();
  for (const d of index.drugs) {
    for (const w of nameWords(d.name)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const ceiling = index.drugs.length * 0.02;
  const set = new Set<string>();
  for (const [w, n] of counts) if (n > ceiling) set.add(w);
  commonWords.set(index, set);
  return set;
}

export function lookupDrug(query: string, index: FormularyIndex): DrugLookup {
  // An exact name wins outright, before any scoring runs.
  //
  // The client form now suggests from this same corpus and records what was
  // picked verbatim, so most queries arrive as a name we already hold. Putting
  // one of those through the ranking is how "amlodipine 5 MG / atorvastatin 20
  // MG Oral Tablet" came back matched to the 80 MG version: a right answer
  // beaten by a heuristic built for people typing from memory.
  const wanted = query.toLowerCase().trim();
  const exact = index.drugs.find((d) => d.name.toLowerCase().trim() === wanted);
  if (exact) {
    return {
      query,
      confidence: "exact",
      matchedName: exact.name,
      candidateCount: 1,
      plans: exact.plans,
    };
  }

  const parsed = parseQuery(query);
  const common = nonDiscriminative(index);
  parsed.words = parsed.words.filter((w) => !common.has(w));

  // Micrograms are written as milligrams in the formulary, so 75 mcg has to be
  // tried as 0.075 mg or the strength never matches.
  if (/\bmcg\b/i.test(query)) {
    parsed.strengths = [...parsed.strengths, ...parsed.strengths.map((s) => s / 1000)];
  }
  const none: DrugLookup = {
    query,
    confidence: "none",
    matchedName: null,
    candidateCount: 0,
    plans: {},
  };
  if (parsed.words.length === 0) return none;

  // Match on whole words. Substring matching is what made "some made up drug"
  // return esomeprazole, since that name contains the letters s-o-m-e.
  const candidates = index.drugs.filter((d) => {
    const words = nameWords(d.name);
    return parsed.words.some((w) => words.has(w));
  });
  if (candidates.length === 0) return none;

  // Prefer the candidate that also matches the strength and form the client
  // wrote, rather than whichever name happens to be shortest. Picking
  // atorvastatin 80 MG when someone wrote 20 mg is a wrong answer that looks
  // like a right one.
  const scored = candidates.map((d) => {
    const words = nameWords(d.name);
    let score = parsed.words.filter((w) => words.has(w)).length * 4;
    if (parsed.strengths.length) {
      const strengths = nameStrengths(d.name);
      if (parsed.strengths.some((s) => strengths.includes(s))) score += 6;
    }
    if (parsed.forms.length) {
      if (parsed.forms.some((f) => words.has(f))) score += 5;
      else score -= 3;
    }
    // Shorter names are usually the plain molecule rather than a combination
    // product, so they break ties without overriding a real signal.
    score -= d.name.length / 100;
    return { drug: d, score };
  });

  const best = scored.reduce((a, b) => (a.score >= b.score ? a : b));
  const topScore = best.score;
  const closeRivals = scored.filter((s) => s.score >= topScore - 0.5).length;

  const matchedAllWords = parsed.words.every((w) => nameWords(best.drug.name).has(w));
  const strengthResolved =
    parsed.strengths.length === 0 ||
    parsed.strengths.some((s) => nameStrengths(best.drug.name).includes(s));

  return {
    query,
    confidence: matchedAllWords && strengthResolved && closeRivals === 1 ? "exact" : "likely",
    matchedName: best.drug.name,
    candidateCount: candidates.length,
    plans: best.drug.plans,
  };
}

export interface FormularyFinding {
  lookups: DrugLookup[];
  /** Plan ids we hold formulary data for, so gaps can be stated honestly. */
  coveredPlanIds: string[];
  notes: string[];
}

/**
 * Runs every drug the client named against the formulary and produces the
 * agent facing summary.
 */
export function checkDrugs(queries: string[], index: FormularyIndex | null): FormularyFinding {
  if (!index || queries.length === 0) {
    return { lookups: [], coveredPlanIds: [], notes: [] };
  }

  const lookups = queries.map((q) => lookupDrug(q, index));
  const coveredPlanIds = [
    ...new Set(index.drugs.flatMap((d) => Object.keys(d.plans))),
  ].sort();

  const notes: string[] = [];
  const missing = lookups.filter((l) => l.confidence === "none");
  if (missing.length) {
    notes.push(
      `${missing.map((m) => m.query).join(", ")} could not be found in the formulary data we hold. That means we have no data, not that the drug is excluded, so it still needs checking.`,
    );
  }

  const needsAuth = lookups.filter((l) =>
    Object.values(l.plans).some((p) => p.priorAuth),
  );
  if (needsAuth.length) {
    notes.push(
      `${needsAuth.map((m) => m.matchedName ?? m.query).join(", ")} needs prior authorisation on at least one of these plans. Covered, but not without a form and a wait.`,
    );
  }

  const ambiguous = lookups.filter((l) => l.candidateCount > 8);
  if (ambiguous.length) {
    notes.push(
      `${ambiguous.map((m) => m.query).join(", ")} matched many formulary entries, so the strength and form need confirming before the tier below can be trusted.`,
    );
  }

  return { lookups, coveredPlanIds, notes };
}

