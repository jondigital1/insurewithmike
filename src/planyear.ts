/**
 * Plan year boundaries, and what they mean for a client enrolling today.
 *
 * A client who enrols through a special enrolment period in August is not
 * making one decision. They are buying a few months of the current plan year,
 * and they will have to choose again during open enrolment for the next one.
 * Two decisions, two sets of plans, two appointments.
 *
 * That is easy to miss and expensive to miss, because the deductible resets on
 * 1 January. Someone who enrols in September and meets a deductible in
 * November starts again from zero six weeks later.
 */

/**
 * Open enrolment in New Jersey runs 1 November to 31 January, which is longer
 * than the federal window. Confirmed against GetCoveredNJ, whose 2026 open
 * enrolment closed on 31 January 2026.
 */
export interface PlanYearWindow {
  planYear: number;
  openEnrolmentStart: Date;
  openEnrolmentEnd: Date;
  /** Coverage start for anyone enrolling in the main part of the window. */
  coverageStart: Date;
  coverageEnd: Date;
}

export function planYearWindow(planYear: number): PlanYearWindow {
  return {
    planYear,
    openEnrolmentStart: new Date(Date.UTC(planYear - 1, 10, 1)),
    openEnrolmentEnd: new Date(Date.UTC(planYear, 0, 31)),
    coverageStart: new Date(Date.UTC(planYear, 0, 1)),
    coverageEnd: new Date(Date.UTC(planYear, 11, 31)),
  };
}

export interface CoverageDecision {
  planYear: number;
  /** Months of that plan year this decision actually buys. */
  months: number;
  /** When coverage under this decision begins. */
  startsOn: Date;
  /** True when we hold filed plan data for this year and can price it. */
  priceable: boolean;
  /** What the client and agent need to do, in plain terms. */
  action: string;
}

export interface Timeline {
  decisions: CoverageDecision[];
  /** Set when more than one decision is needed, which is the trap. */
  needsSecondEnrolment: boolean;
  notes: string[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fmt = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/**
 * Works out how many enrolment decisions a client faces from today.
 *
 * `datasetYears` is the set of plan years we hold filed data for, so the
 * output can say plainly which decisions can be priced now and which cannot.
 */
export function coverageTimeline(
  today: Date,
  startPreference: "asap" | "january" | "unsure",
  datasetYears: number[],
): Timeline {
  const currentYear = today.getUTCFullYear();
  const nextYear = currentYear + 1;
  const notes: string[] = [];
  const decisions: CoverageDecision[] = [];

  const startsNextMonth = new Date(Date.UTC(currentYear, today.getUTCMonth() + 1, 1));
  const monthsLeft = 12 - (today.getUTCMonth() + 1);

  const wantsNow = startPreference !== "january";

  if (wantsNow && monthsLeft > 0) {
    decisions.push({
      planYear: currentYear,
      months: monthsLeft,
      startsOn: startsNextMonth,
      priceable: datasetYears.includes(currentYear),
      action: `Enrol now for the rest of ${currentYear}. Coverage starts ${fmt(startsNextMonth)} and runs ${monthsLeft} month${monthsLeft === 1 ? "" : "s"}. Requires a qualifying life event, since open enrolment has closed.`,
    });
  }

  const next = planYearWindow(nextYear);
  decisions.push({
    planYear: nextYear,
    months: 12,
    startsOn: next.coverageStart,
    priceable: datasetYears.includes(nextYear),
    action: `Choose again for ${nextYear} during open enrolment, which runs ${fmt(next.openEnrolmentStart)} to ${fmt(next.openEnrolmentEnd)}. Enrol by 31 December for coverage starting ${fmt(next.coverageStart)}.`,
  });

  const needsSecondEnrolment = decisions.length > 1;

  if (needsSecondEnrolment) {
    notes.push(
      `This is two decisions, not one. The plan chosen now covers ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} and then ends. Book the second appointment for November.`,
    );
    notes.push(
      `The deductible resets on 1 January. Anything paid toward it between ${fmt(startsNextMonth)} and 31 December does not carry over, so a client planning a procedure is usually better off timing it to one side of that line rather than across it.`,
    );
  }

  const priceableYear = decisions.find((d) => d.priceable)?.planYear;
  for (const d of decisions.filter((x) => !x.priceable)) {
    if (priceableYear) {
      notes.push(
        `Plans for ${d.planYear} are not filed yet. New Jersey publishes rates in the autumn, so they should appear around October ${d.planYear - 1}. Everything priced below is ${priceableYear}, and covers only the first of these two decisions.`,
      );
    } else {
      // Nothing on the page is the year the client is actually buying. Say so
      // rather than letting the figures pass as a quote.
      notes.push(
        `Plans for ${d.planYear} are not filed yet, and that is the only year this client is buying. Every figure below is a ${datasetYears[0] ?? "prior"} plan used as a stand in, so treat it as a guide to the shape of the market rather than as a quote. New Jersey publishes ${d.planYear} rates around October ${d.planYear - 1}, and 2026 premiums rose about 16 percent on average, so expect movement.`,
      );
    }
  }

  const carriersChange = decisions.length > 1;
  if (carriersChange) {
    notes.push(
      "Carriers and plans change between years. Sixteen plans were discontinued going into 2026 and Aetna left the market entirely, so do not promise that whatever is chosen now will still exist in January.",
    );
  }

  return { decisions, needsSecondEnrolment, notes };
}
