# Provider directory data: what the extract found, and why it is not wired in

The extract ran. 64 shards, 164,795 national facility records scanned, 2,472
kept that list a New Jersey plan id. The data is current, stamped
`last_updated_on: 2026-08-04`.

It is not wired into the recommendation, and this records why.

## What is trustworthy

342 records carry a genuine New Jersey address, across 244 postcodes, in towns
that make sense for the carrier: Cherry Hill, Voorhees, Camden, Sewell,
Newark, Jersey City, Trenton, Paterson, Toms River.

29 of them read as hospitals rather than practices, and they are recognisable:
AtlantiCare Regional, Cooper Health System in Camden, Jersey City Medical
Center, Capital Health Regional in Trenton, Englewood, JFK, CentraState,
Christ Hospital, Chilton Memorial.

Every record carries the HIOS plan id and a `network_tier`, which is the join
we wanted and the field that would answer the tier question.

## What is not

**The plan participation lists over-report, provably.** 2,130 of the 2,472
records have no New Jersey address at all, and the largest groups among them
are Geisinger, Excela Health, Guthrie and Lehigh Valley Physician Group. Those
are central and western Pennsylvania, hours from the state line.

Every New Jersey plan in the filings answers "No" to national network. An
Ambetter EPO sold in New Jersey does not have an in-network orthopaedic
practice in Meadville, Pennsylvania. So the `plans` array on a record is not a
reliable statement that the facility is in that plan's network.

The same pattern shows in the source sample: a Michigan practice listed plans
in Michigan, Ohio and Indiana. The field looks like it reflects a corporate or
legal-entity relationship rather than an actual network.

**Every tier reads PREFERRED.** All 14,832 plan and facility pairs, on all six
plans. Ambetter runs one flat network in New Jersey, which matches the filings,
where they file a single network id. So this data cannot answer the tier
question. The tier question belongs to Horizon's OMNIA plans, and Horizon is
not in this feed.

**Inspira does not appear at all.** It is one of the largest systems in south
Jersey and the intake names it explicitly. Ambetter is a narrow network carrier
selling in 17 of 21 counties, so genuinely excluding Inspira is plausible. It
is also exactly what a data gap looks like. Nothing here distinguishes the two.

**342 facilities is thin** for a carrier selling across 17 counties. A real
statewide network runs to thousands of locations.

## What this means for the product

Presence is weak positive evidence. Absence is not evidence of exclusion.

Telling a client "Inspira is not in this network" on the strength of this would
be the same mistake as the October 2017 tier list, arrived at from the opposite
direction: there the data was clearly stale, here it is current but its central
claim does not survive a sanity check.

## What would make it usable

1. The other four carriers. One narrow-network carrier is not a market view,
   and Horizon is the one whose tiering actually costs money.
2. A ground truth check. Take twenty facilities from a carrier's own live
   provider finder and see whether the file agrees. That is the test this data
   has not passed and cannot pass on its own.
3. Individual practitioner files, which the intake also needs, since clients
   name a doctor rather than a hospital.

Until at least the first two, the engine keeps saying network is unverified,
which is true, rather than answering from data whose main claim it cannot
stand behind.
