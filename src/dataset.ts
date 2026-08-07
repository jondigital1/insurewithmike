/**
 * Pure lookups over a loaded dataset. No filesystem, no CSV parsing, so this
 * runs unchanged in the browser as well as in Node.
 *
 * puf.ts loads the filings and produces the dataset. Everything that reasons
 * over one lives here or downstream of here.
 */

import type { PlanDataset, RateRow } from "./types.ts";

/**
 * Resolves a member age to the filed rate for a plan. Age bands in the filings
 * are a mixture of single years ("27"), a banded floor ("0-14") and a banded
 * ceiling ("64 and over").
 */
export function rateForAge(
  rates: RateRow[],
  age: number,
  tobaccoUser: boolean,
): number | null {
  const exact = rates.find((r) => Number(r.age) === age);
  const banded =
    exact ??
    rates.find((r) => {
      const range = r.age.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) return age >= Number(range[1]) && age <= Number(range[2]);
      const ceiling = r.age.match(/^(\d+)\s*and\s*over$/i);
      if (ceiling) return age >= Number(ceiling[1]);
      const floor = r.age.match(/^(\d+)\s*and\s*under$/i);
      if (floor) return age <= Number(floor[1]);
      return false;
    });
  if (!banded) return null;
  return tobaccoUser
    ? (banded.individualTobaccoRate ?? banded.individualRate)
    : banded.individualRate;
}

/** Counties where an issuer sells, used to gate plan availability. */
export function issuerCounties(dataset: PlanDataset, issuerId: string): Set<string> {
  const counties = new Set<string>();
  for (const area of dataset.serviceAreas) {
    if (area.issuerId === issuerId && area.countyName) counties.add(area.countyName);
  }
  return counties;
}
