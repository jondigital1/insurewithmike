# CRM invitation templates

Written 10 August 2026. These are for Mike to paste into his CRM as saved
templates, so inviting a prospect to the survey is two clicks. They go out
from his CRM, his name, his number, per the decision in
[handoff-2026-08-10.md](handoff-2026-08-10.md): the invitation must come from
a sender the prospect recognises, because an unknown number asking someone to
click a link and enter health details reads as a scam even when it is not.

`[SURVEY LINK]` is a placeholder. The permanent address is decided:
**https://beforewequote.com**, bought 10 August 2026 and not yet pointed at
the site. Keep the placeholder until the domain actually serves the form,
then paste the address in directly. Do not run it through a link shortener: a
shortened link in an email about health insurance looks exactly like
phishing, and the whole point of sending from Mike's CRM is that nothing
about the message smells wrong. The domain is also the message: "before we
quote" is the sentence Mike is already saying, so the link reads as his own
words rather than a product name.

Every claim in this copy was checked against the form as built on 10 August:
it asks no name, no birthdate, no Social Security number; it takes about 10
minutes across 8 sections; nothing is sent until the last page; it ends by
showing a short code. If the form changes, re-check this copy against it.

## Email version

Subject: Before we quote you: a 10 minute head start

> Good afternoon [First name],
>
> Thank you for the opportunity to earn your business.
>
> To show you what coverage will actually cost your household, I need a clear
> picture of your year first. The short survey below covers it: your
> household, your income, and the care your family actually uses. It takes
> about 10 minutes.
>
> [SURVEY LINK]
>
> Three things worth knowing before you start:
>
> - It never asks for your name, date of birth, or Social Security number.
>   When you finish, it shows you a short code instead. Reply or text me that
>   code and I will match it to your file.
> - Worth having nearby: your current insurance card if you have one, last
>   year's tax return, and the bottles for anything you take regularly.
> - Nothing is sent until you press send on the last page.
>
> Once I have your code, I will walk into our meeting with the plans already
> narrowed to the ones worth your time.
>
> Talk soon,
> Mike Kachur
> [phone]

## Text message version

> Hi [First name], it's Mike Kachur. Thanks for the chance to earn your
> business. Before I quote you anything, this 10 minute survey lets me narrow
> the plans to the ones worth your time: [SURVEY LINK]. It never asks your
> name or Social Security number. When you finish it shows a short code. Text
> that code back to me and we're set.

## Notes for whoever maintains these

- The code relay is load-bearing. The system never learns who a prospect is;
  the code the prospect sends back is the only join between their answers and
  Mike's file. Both templates therefore say explicitly what to do with the
  code. If a prospect finishes the survey and never sends the code, their
  answers are orphaned, which is why the ask is in the message itself and
  repeated on the survey's thank you page.
- "About 10 minutes" matches the form's own intro copy. Keep them in sync.
- The reassurance list (no name, no birthdate, no SSN) is the strongest line
  in the message for a wary reader. It stays true because the survey was
  designed that way on purpose: identity lives in the CRM, never in our
  system.
