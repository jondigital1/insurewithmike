# What public data exists on these 176 plans, and what it can close

A survey run before asking Mike or any carrier for anything. Everything below
was verified by fetching it, on 8 August 2026, not read off a documentation
page. Sizes are as served.

The headline: New Jersey runs its own exchange, and that single fact closes the
two routes everybody reaches for first. It does not close the route that
matters most.

---

## 1. The federal route is shut, and this is why

New Jersey moved off healthcare.gov to a State-Based Exchange in 2021. Federal
public use files and the federal machine-readable programme both follow the
Federally-Facilitated Marketplace, so New Jersey simply is not in them.

Verified:

- **Machine-readable URL PUF, PY2026.** 346 issuer rows across 30 states:
  AK AL AR AZ DE FL HI IA IN KS LA MI MO MS MT NC ND NE NH OH OK OR SC SD TN TX
  UT WI WV WY. New Jersey is absent, and so is every one of our five issuer ids
  (17970, 23818, 37777, 91661, 91762).
- **Service Area PUF, PY2026.** The same 30 states. No NJ.

That second check is the one that matters, because it means the **Benefits and
Cost Sharing PUF** carries no New Jersey rows either. That is the file with
`COPAY INN TIER 1` and `COINS INN TIER 1` per benefit, the exact columns the NJ
SBE `NJBenefits` file omits. It is not that we have failed to find it. For New
Jersey it does not exist.

**Consequence:** the 11 of 13 service categories that run on estimates in
`src/assumptions.ts` cannot be fixed from a government file. Everything below
is about getting there another way.

### The CMS QHP machine-readable APIs are mostly shut too

Issuers must publish `/cms-data-index.json` pointing at `plans.json`,
`providers.json` and `drugs.json`. That obligation attaches to federal
marketplace certification, so most NJ issuers have no reason to publish.

Probed the well-known path on all five: only Centene answers. Horizon, Oscar,
UnitedHealthcare and AmeriHealth all 404 at the root path.

UnitedHealthcare does publish a real index, at
`www.uhc.com/content/dam/uhcdotcom/en/general/cms-data-index.json`, listing 21
plan, 22 provider and 20 formulary files. Every one is a federal marketplace
state. There is no New Jersey file. Oxford's NJ book is not in there.

---

## 2. AmeriHealth publishes for New Jersey anyway

The exception, and a valuable one. AmeriHealth hosts CMS-format indexes off
their developer resources page, not at the well-known path:

- `amerihealthnj.com/Resources/cms-data/ahnj-hmo/index.json` for issuer 77606
- `www.amerihealthnj.com/Resources/cms-data/ahnj-ic/index.json` for issuer
  **91762**, which is ours

The `ahnj-ic` `plans.json` has 36 entries over 18 HIOS ids, and it covers
**all 11 of our AmeriHealth standard component ids, so all 51 plan variants**.

Two things in it:

**Every plan carries an exact SBC url.** For example
`https://www.amerihealth.com/pdfs/sbcs/2026/2026-IHC151AHNJHA.pdf`. This
replaces the weakest data we hold. `scripts/fetch-sbcs.ts` currently records
that AmeriHealth SBCs are "addressed by an internal form code rather than by
anything in the filings, so there is no way to derive the URL from a plan id",
and the codes in it were found by probing. That guesswork is now unnecessary,
and the 6-of-11 coverage becomes 11 of 11. It also retires the name-parsing in
`copaysFromName`, which is currently the provenance behind 48 copay entries.

**2027 documents are already up**, at `/pdfs/sbcs/2027/`. Worth knowing with
open enrolment opening 1 November.

`cost_sharing` on every formulary tier is an empty array, so this does **not**
close the drug tier pricing gap.

Provider directories for 91762, in CMS shape with plan ids and network tier:

| File | Size |
|---|---|
| `91762-md-provider.json` (medical) | 329.6 MB |
| `91762-rx-provider-1.json` (pharmacy) | 33.4 MB |
| `91762-vs-provider.json` (vision) | 8.4 MB |

This is the second carrier's provider data, which is the first of the three
things `provider-data-findings.md` says would make provider data usable.

---

## 3. Transparency in Coverage is the route that reaches New Jersey

This rule binds every issuer regardless of which exchange it sells on, which is
exactly why it survives where the federal files do not.

**Horizon publishes, and publishes well.** Index at
`horizonblue.sapphiremrfhub.com/tocs/202608/2026-08-01_horizon-healthcare-services_index.json`,
schema 2.0.0, stamped `2026-08-01`. 41 reporting structures, 98 reporting
plans, 79 Group and 19 Individual. The individual ones are ours by name:
OMNIA Silver Saver, OMNIA Silver Saver HSA, OMNIA Gold, OMNIA Silver Value,
OMNIA Bronze, and Horizon Advantage EPO Silver, Bronze and Essentials.

### The find that matters

Horizon files **OMNIA tier 1 and tier 2 as two separate in-network files**:

| File | Size gzipped |
|---|---|
| `..._OMT1_in-network-rates_1_of_1.json.gz` | 750.9 MB |
| `..._OMT2_in-network-rates_1_of_1.json.gz` | 281.9 MB |

Each opens with a `provider_references` array carrying, per provider group, an
explicit `network_name` of `OMNIA-Horizon-Healthcare-Services-Inc-OMT2`, the
NPIs, and the tax id with a business name. Real names, for example
`Virtua Our Lady of Lourdes Hospital`.

**Membership of one file rather than the other is the tier.** That is Mike's
tier question, answered from a public file, by name, for the one carrier whose
tiering actually costs a client money. Today the engine says network is
unverified, which is honest but is also the single weakest answer it gives.

It is also cheap to get. The roster sits at the head of the file, ahead of the
negotiated rates, so it can be streamed and abandoned once the array closes
rather than inflating the whole thing. `scripts/extract-omnia-tiers.ts` does
exactly that, in resumable byte ranges, because the host drops long connections.

**It ran in under a minute and read 16 MB of each file**, out of 751 MB and
282 MB. The roster closes inside the first chunk.

### What came back

| | Tier 1 | Tier 2 |
|---|---|---|
| Provider groups | 629 | 1,354 |
| Distinct tax ids | 496 | 255 |
| Distinct business names | 428 | 238 |
| NPIs | 10,094 | 15,734 |

**Zero tax ids appear in both files.** The split is clean and it is drawn at the
organisation, so for any employer that appears the tier is unambiguous. 926
NPIs do appear in both, which is individual clinicians billing under more than
one group, and is a reason to answer this question by tax id rather than by
person.

South Jersey, which is Mike's patch:

| System | Tier |
|---|---|
| Cooper Hospital University Medical Center | **1** |
| Virtua Our Lady of Lourdes Hospital | **2** |
| Kennedy Memorial Hospital | **2** |
| Shore Medical Center | **2** |
| Inspira | **absent from both** |
| AtlantiCare | **absent from both** |

### Read this the same way as the last provider file

The same discipline in `provider-data-findings.md` applies. Presence is good
evidence. Absence is not evidence of exclusion.

Inspira and AtlantiCare are two of the largest systems in south Jersey and the
intake names Inspira explicitly. Their absence from a statewide product's
roster is far more likely to be a gap in the file than a genuine exclusion.
428 and 238 distinct organisations is also thin for a statewide network, even
allowing that these are billing entities rather than locations. The out of
state skew that ruined the Ambetter feed is not really present here, at 0 and 4
per cent of distinct names, which is a point in its favour.

So this is usable for the plans it names and must not be used to tell a client
that something is *not* covered.

### The completeness check, and what it found

The intended test was twenty facilities off Horizon's own Doctor & Hospital
Finder. **That test could not be run.** The finder is a Sapphire single page app
behind Imperva bot protection: its API returns 403 to any scripted request,
including one issued from inside the page, and the plan selector does not open
under synthetic clicks. It needs a person.

A second source was available. Horizon publishes an OMNIA hospital list as a
PDF, with a Tier 1 and Tier 2 column, at
`horizonblue.com/sites/default/files/pdf/OMNIA_health_Plan_Hospital_List.pdf`.
It carries 76 hospitals. It also says "complete as of October 2017", which is
the very list `provider-data-findings.md` warns about, so it is **not** ground
truth for a tier in 2026.

It can still measure one thing that does not depend on its age: whether our
roster names these hospitals at all.

**30 of 76, or 39 per cent.** Forty-five are not named anywhere in the
transparency roster, including AtlantiCare, both Inspira hospitals, Deborah
Heart and Lung, Virtua Memorial, and effectively all of RWJBarnabas and Atlantic
Health System: Morristown, Overlook, Newton, Chilton, Clara Maass, Saint
Barnabas, Jersey City Medical Center, Robert Wood Johnson at New Brunswick.

Some of that is nine years of drift and some is crude name matching on my part.
Neither explains whole founding systems being absent. The likelier reading is
structural: `provider_references` lists the **billing entities that have
negotiated rates in that file**, not a provider directory. A hospital can sit
under a parent tax id, under a different business name, or in a rate file we did
not read.

### What that means for using it

The tier label is still trustworthy *for an entity that appears*, because no tax
id appears in both files and the split is clean. What is now measured, rather
than merely suspected, is that **absence carries no information whatsoever**.

So this answers "what tier is X" when X is in the file, and can never answer "is
X in network". That is a narrower claim than it looked like an hour ago, and it
is not enough on its own to replace "network unverified" in front of a client.

The real ground truth check is still unrun, and now has a known shape: it needs
a person on the Doctor & Hospital Finder, or Horizon's current published list
rather than the 2017 one.

### What is still open here

The `allowed_amount_file` for every individual OMNIA and EPO structure is
effectively empty, which is correct rather than broken: these are EPO products
with no out-of-network benefit, so there are no out-of-network allowed amounts
to file. Real prices therefore have to come out of the in-network rate files,
which is a much heavier job than the roster and is not done.

Oscar, UnitedHealthcare and Centene all serve their transparency landing pages
as client-rendered shells. Both were found through the browser:

- UnitedHealthcare exposes `/api/v1/uhc/blobs/`, a 20.8 MB listing of 86,472
  files. Almost all are per-employer group files. The insurer-level Oxford ones
  exist and are unusable in practice: Choice Plus is 9,098 MB gzipped and Core
  is 8,556 MB.
- Oscar publishes one index per month back to July 2022, current at 2026-08-01.

Neither is worth pulling, for a reason worth writing down. **Transparency in
Coverage files carry negotiated rates, not cost sharing.** They can tell you
what a plan pays a provider. They cannot tell you what the member pays. So they
are the right route for allowed amounts and for network membership, and the
wrong route entirely for a copay gap. Only Horizon's is worth the bytes,
because there the network membership *is* the answer.

---

## 5. Two of the remaining gaps were not gaps

Chasing the Oscar and UnitedHealthcare copays turned up something better than
the data would have been.

**UnitedHealthcare is complete.** 24 of 24 read. The 10 with no primary care
copay are coinsured rather than copaid, which the index already records
distinctly, so a null there is the answer and not a hole.

**Oscar's 14 missing plans are all `zeroCostSharing` (7) and
`limitedCostSharing` (7)**, the American Indian and Alaska Native variations.
`rank.ts` already excludes both from recommendations, so they were never a gap
in anything the client sees.

### What that turned up instead

All 37 `zeroCostSharing` variants across every carrier are filed with a
deductible of $0, an out of pocket maximum of $0 and a coinsurance rate of 0.
That is the signature of the variation. **16 of them were carrying a non-zero
primary care copay**, up to $50, and another 9 sat at null.

A plan whose out of pocket maximum is $0 cannot charge $30 to see a doctor. The
copay index is keyed by plan id but sourced from a benefit summary written for
the standard variant, so the standard variant's copay was landing on the
variation. It has been invisible because these plans are excluded from ranking,
but the wrong figure was shipping in the browser bundle and would have become a
wrong answer the moment anyone surfaced them.

Fixed in `applyCopayIndex` in `src/puf.ts`, guarded on the plan's own filed
figures rather than on the variant label, so a filing that ever disagreed is
left alone rather than silently overwritten. All 37 now read $0 for both
primary care and specialist. The 37 `limitedCostSharing` variants are
deliberately untouched: those pay standard cost sharing except at Indian Health
Service providers, so their copays are correct as filed.

---

## 4. Where this leaves the gap list

| Gap | Status after this survey |
|---|---|
| AmeriHealth copays inferred from plan names | **Closable now.** Exact SBC url for all 11 standard ids. |
| Horizon OMNIA tier 1 vs tier 2 | **Retrieved but weaker than it looks.** 629 tier 1 and 1,354 tier 2 groups, no tax id in both, so the tier is sound for anyone named. But it names only 39% of the hospitals on Horizon's own OMNIA list, so absence means nothing and it cannot answer "is X in network". |
| Second carrier provider directory | **Available.** AmeriHealth 329.6 MB medical file in CMS shape. |
| Oscar and UHC remaining copays | **Not a gap.** UHC is 24 of 24, its nulls are coinsured plans. Oscar's 14 are AI/AN variants already excluded from ranking. |
| Zero cost sharing variants carrying a copay | **Fixed.** 16 of 37 held a copay of up to $50 against a $0 out of pocket maximum. All 37 now $0. |
| Drug tier cost sharing | Still open. AmeriHealth files it empty; no NJ federal file exists. |
| Allowed amounts for 11 service categories | Still open, and now known to be expensive: it means parsing multi-gigabyte in-network rate files rather than reading a column. |

Nothing here needs a carrier relationship or a request to Mike. All of it is
public and addressable by url.
