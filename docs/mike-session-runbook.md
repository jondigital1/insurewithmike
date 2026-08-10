# The Mike session, one page

The point: run 3 to 5 of last season's real enrolments through the tool and
record where Mike disagrees with it and why. Until this happens the engine is
unvalidated. Everything below is in service of getting his reactions onto
disk in his own words.

## Before he sits down

- Open https://ask-mike.vercel.app on ONE device, the same browser for form
  and agent view. The two pages talk through the browser, not a server.
- Silence nothing, record nothing. The capture UI is the recorder.
- Have his CRM or client list open on his side, for picking cases and for
  writing codes next to names. Names never go into the tool.

## Running a case

1. Fill the intake with the client's facts, from his records. No names. The
   thank you page mints a code; he writes it next to the client in his CRM.
2. Open the agent view. **Say nothing. Watch what he looks at first.** This
   is one of the three design questions, and telling him anything before he
   reacts contaminates it.
3. Let him react to the shortlist. When he rules a plan out, tap "Rule this
   out" and have him say why into the note, one sentence, his words. When he
   picks, tap "This is the one." If his pick was not our number one, the box
   asks him why; that answer is the most valuable data of the day.
4. His words go in verbatim. Do not summarise for him, do not suggest
   categories, do not defend the engine. "That's wrong" is a finding, not an
   argument to win.
5. Provider and hospital names in notes: good, wanted. Client names: never.

## Case order matters

- **Wide-margin picks first.** Where our first place beats second by $1,000+,
  disagreement means a bug or a data error, and that is cheap gold.
- **Tight races second.** Where the top two are within a few hundred dollars,
  disagreement is expected; what you are learning is his tiebreakers.
- If a moderate utiliser case goes sideways (someone on brand-name drugs,
  neither light nor heavy), suspect our drug price assumption before the
  engine. That is the one segment where a price error flips rankings.
- "I am not appointed with that carrier" or "that pays less" are honest,
  wanted answers. They get recorded and then excluded from ranking. Say so if
  he hesitates.

## The three questions to ask before he leaves

1. Where does his figure of 63 plans come from? (We count 37 to 39 eligible
   for most households.)
2. What does his eye land on first when he skims a plan? (Compare with what
   he actually did in step 2 above.)
3. How does he check network tier status today, for OMNIA tier 2 especially?

## Watch for, but do not prompt

- Does he use the sort on the big table, and which column?
- Do the "effectively tied" banners match his instinct, or does he argue
  with a tie?
- Does he reach for the staying-put card on renewal cases?
- Does he print, and which button?

## Before you leave

Press **Export notes** in the header. It downloads a JSON file. That file is
the entire yield of the session; do not leave without it.

## Afterwards, at the machine

```bash
npx tsx scripts/import-review.ts <the exported file> data/testing.sqlite
npx tsx scripts/classify-notes.ts data/testing.sqlite --dry
npm run review
```

Import flags any note that looks like it carries client details; read those
before the data goes anywhere. The classifier dry run shows what is waiting;
running it for real needs an API key. `review.ts` then shows the first honest
measurement this project has had: how often the agent led with our top pick,
and why not.
