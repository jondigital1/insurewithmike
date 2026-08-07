# insurewithmike

Plan comparison engine for New Jersey individual health coverage.

Client answers intake questions without giving us any directly identifying
information. The engine prices every plan on the New Jersey marketplace against
what they told us, and hands the agent a ranked shortlist with the reasoning
shown. The agent reviews it, applies their judgement, and presents their own
recommendation to the client. The system never recommends to the client.

## Why the maths is not done by a language model

A licensed agent signs their name to what comes out of this. Ranking runs as
plain code so that the same inputs always produce the same answer, so the
arithmetic can be shown line by line when challenged, and so it can be tested
against cases where we know the right answer. A language model is the right
tool for reading messy client answers into structured fields and for writing
the explanation. It is the wrong tool for computing an annual cost across 39
plans.

## Data

`data/nj-sbe-puf-2026` and `data/nj-sbe-puf-2025` hold the CMS State-Based
Exchange QHP Public Use Files for New Jersey, sourced from carrier SERFF
filings via the NAIC and published by CMS. Committed rather than fetched so the
dataset is pinned and results are reproducible.

The 2026 files are current as of 3 June 2026. New Jersey is absent from the
main CMS Exchange PUF, which covers only the 30 federally facilitated states.

## Layout

    src/types.ts        domain model
    src/puf.ts          CSV loading and normalisation
    src/premium.ts      age rated list premium
    src/subsidy.ts      federal premium tax credit, 2026 rules
    src/cost.ts         deductible, coinsurance and out of pocket maximum
    src/rank.ts         eligibility filtering and the good / better / best spread
    src/assumptions.ts  every value NOT sourced from the filings

Anything in `assumptions.ts` is an estimate standing in for data we do not have
yet. Treat it as a list of things to replace.

## Running

    npm install
    npm run demo         end to end shortlist for a sample household
    npm run typecheck
    npx tsx scripts/deep-dive.ts    full market analysis

## Known gaps

Per benefit copay amounts, formulary contents and provider directories are not
in the state based exchange files. Cost estimates currently run everything
through the deductible and coinsurance, which overstates cost for low utilisers
on copay heavy plans.
