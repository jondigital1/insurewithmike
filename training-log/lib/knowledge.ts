// The built-in knowledge base. Every answer here is authored into the app:
// nothing searches the internet, and a question this file cannot answer says
// so instead of guessing. That gate is the feature.

export interface KnowledgeEntry {
  id: string
  q: string
  a: string
  group: string
  aliases: string[]
}

export const KNOWLEDGE_GROUPS = [
  'The basics',
  'Getting stronger',
  'Using the app',
  'Your numbers',
] as const

// --- Using the app -----------------------------------------------------------

const APP: KnowledgeEntry[] = [
  {
    id: 'app-superset-how',
    q: 'How do I make a superset in the app?',
    group: 'Using the app',
    aliases: ['create superset', 'link exercises', 'pair exercises', 'multiple supersets'],
    a: 'Three ways. In the exercise picker, switch the Superset toggle on and everything you pick joins one group until you switch it off. In a session, tap Link between any two blocks to join them. In the workout builder, the same toggle exists, and saved workouts keep their groups. A workout can hold as many supersets as you like: they letter themselves A, B, C and onward, and each group rests as one, with the clock starting after its last movement.',
  },
  {
    id: 'app-dropset-how',
    q: 'How do I log a drop set?',
    group: 'Using the app',
    aliases: ['log drop set', 'record drop set', 'strip set entry'],
    a: 'Tap Drop under the exercise after your working set: it adds a row marked drop, prefilled about 20 percent lighter, and you type the reps. Chain another tap for a double drop. Drop rows are excluded from records and from the ghost comparison, because near failure at a lighter load is a technique, not a best. The importer also reads a notes line like 130x12 110x15 as a set and its drop.',
  },
  {
    id: 'app-ghost',
    q: 'What is the grey line above my sets?',
    group: 'Using the app',
    aliases: ['ghost line', 'last session line', 'previous workout numbers'],
    a: 'Your last session of that movement: date, every set, and the RPE if you logged one. It is the number to beat today. The weight from it also prefills when you add a set, so most sets are two taps.',
  },
  {
    id: 'app-coach',
    q: 'What is the orange advice line under a set?',
    group: 'Using the app',
    aliases: ['coach line', 'over target', 'under target', 'try suggestion'],
    a: 'The coach line. It compares your set against the rep and effort range of your goal and suggests one concrete change: a load about 5 percent up, 7.5 percent down, or a rep adjustment. When the three week effort wave is on, it aims at the week you are in instead of the goal band.',
  },
  {
    id: 'app-rest-timer',
    q: 'How does the rest timer work?',
    group: 'Using the app',
    aliases: ['timer', 'rest countdown', 'rest between sets'],
    a: 'It starts itself the moment a set is complete, sized to the movement and your goal: longer for big lifts, shorter for arms and calves, none for cardio. In a superset it waits for the last movement of the group. It counts to a fixed end time, so locking your phone gives back the right number, and every exercise has a manual Rest button when the guess is wrong.',
  },
  {
    id: 'app-rpe-hidden',
    q: 'Why do I not see an RPE box?',
    group: 'Using the app',
    aliases: ['no rpe field', 'rpe missing', 'effort scale hidden'],
    a: 'New lifters misjudge how many reps they have left by 4 to 5, which makes the number worse than useless, so the box stays hidden until your answers say it will mean something. Progress without it is simple: add a rep when the last set felt like two were left, add weight when you clear the top of the range.',
  },
  {
    id: 'app-offline',
    q: 'What happens if I lose signal mid workout?',
    group: 'Using the app',
    aliases: ['no wifi', 'offline', 'gym has no signal', 'lost connection'],
    a: 'Nothing you typed is lost. Sets are held on your phone, retried automatically, and written the moment the connection returns, even if the tab died in between. The one thing that needs a connection is opening the app fresh.',
  },
  {
    id: 'app-swap',
    q: 'Why did the app swap an exercise in my plan?',
    group: 'Using the app',
    aliases: ['different exercise', 'substitution', 'sore joint swap', 'knee swap'],
    a: 'You flagged a joint, so sessions swap the movement and keep the pattern: a sore knee gets leg press instead of squats, not a day without legs. Flags live in Settings and every swap is undoable by picking the original from the library.',
  },
  {
    id: 'app-order',
    q: 'Why are my exercises in this order?',
    group: 'Using the app',
    aliases: ['exercise order', 'hardest first', 'reorder', 'move exercise'],
    a: 'Sessions generated from your plan come out hardest first: big multi joint lifts before small ones, judged partly on your own logged weights, because the hardest thing should meet you fresh. Days you picked by name or built yourself keep exactly the order they were written in. The arrows on each block move anything, and a superset moves as one.',
  },
  {
    id: 'app-import',
    q: 'How do I bring in my old training history?',
    group: 'Using the app',
    aliases: ['import', 'old data', 'artifact', 'migrate history'],
    a: 'Settings, then paste your exported history into the import box. Both old formats are understood, including text sets like 135x8 @8. Everything can also leave again as CSV, one row per set, from the same screen.',
  },
  {
    id: 'app-nutrition',
    q: 'Does the app track food or protein?',
    group: 'Using the app',
    aliases: ['nutrition', 'protein', 'diet', 'calories', 'macros'],
    a: 'No, and it will not pretend to. This is a training log: it holds and shows the lifting. Eating for your goal matters at least as much, and it deserves a tool that takes it seriously rather than a widget here.',
  },
]

// --- Your numbers ------------------------------------------------------------

const NUMBERS: KnowledgeEntry[] = [
  {
    id: 'num-pr',
    q: 'What counts as a PR here?',
    group: 'Your numbers',
    aliases: ['personal record', 'pr flag', 'best set'],
    a: 'Four things, each flagged on the set as you type it: your heaviest load, the most reps at your best load or above, your best estimated max, and your best single session volume on that movement. A first outing is never a record, and a heavy single only counts when your goal is strength, because a log that rewards grinding teaches ego lifting.',
  },
  {
    id: 'num-e1rm',
    q: 'What is estimated max?',
    group: 'Your numbers',
    aliases: ['e1rm', 'estimated 1rm', 'one rep max', 'projected max'],
    a: 'What your set suggests you could lift once, from the Epley formula: weight times one plus reps over thirty. It is why 80 x 9 counts as progress over 80 x 8 without touching the plates, and it is the line the progress charts draw for weighted movements. It is an estimate, not an invitation to test it.',
  },
  {
    id: 'num-volume',
    q: 'What does the lb number on a session mean?',
    group: 'Your numbers',
    aliases: ['session volume', 'total lifted', 'tonnage'],
    a: 'Weight times reps, summed over every weighted set: the session’s tonnage. Useful against the same session last time, and meaningless between a leg day and an arm day, which is why the app never compares those.',
  },
  {
    id: 'num-coverage',
    q: 'What is the sets per muscle bar for?',
    group: 'Your numbers',
    aliases: ['weekly coverage', '10 sets', 'muscle group target'],
    a: 'Hard sets per muscle group this week against a target of 10, which is where the growth evidence points for most people. It is the one number here that tells you what to do differently: an empty bar on Thursday is a muscle you still have time to train.',
  },
  {
    id: 'num-streak',
    q: 'How does the streak work?',
    group: 'Your numbers',
    aliases: ['week streak', 'grid', '28 days', 'consistency'],
    a: 'It counts weeks that met the days you said you would train, not consecutive days, so a rest day costs nothing and a quiet current week cannot break the run behind it. The grid above it is the last 28 days, one dot per day trained.',
  },
  {
    id: 'num-wave',
    q: 'What is the effort wave?',
    group: 'Your numbers',
    aliases: ['three week wave', 'build push send', 'rir cycle', 'effort cycle'],
    a: 'An optional three week cycle, off by default in Settings: a week at two reps in reserve, a week at one, then a week where last sets go to the end, repeating. While it runs, the coach line aims at the week you are in, and the card on the log tab reads your logged RPE back against it.',
  },
]

// --- The basics --------------------------------------------------------------

const BASICS: KnowledgeEntry[] = [
  {
    id: 'basic-superset',
    q: 'What is a superset?',
    group: 'The basics',
    aliases: ['superset meaning', 'back to back exercises', 'antagonist superset', 'paired sets'],
    a: 'Two exercises done back to back with no rest between them, then a rest before the next round of the pair. Pairing muscles that do not compete, like a row with a press, saves real time and costs almost nothing in performance. It is a time tool, not a growth trick, and this app treats a superset as one unit: grouped on screen, one rest clock, started after the last movement.',
  },
  {
    id: 'basic-dropset',
    q: 'What is a drop set?',
    group: 'The basics',
    aliases: ['drop set meaning', 'strip set', 'running the rack'],
    a: 'Take a set close to failure, immediately cut the weight by 10 to 30 percent, and keep going for more reps. So 130 x 12 straight into 110 x 15 is one drop set. It buys extra hard work in very little time and grows muscle about as well as the same work done as straight sets. Log the drop as its own set row at the lighter weight.',
  },
  {
    id: 'basic-rpe',
    q: 'What is RPE?',
    group: 'The basics',
    aliases: ['rpe meaning', 'rir', 'reps in reserve', 'rate of perceived exertion', 'what does rpe 8 mean'],
    a: 'A 1 to 10 scale for how hard a set was. 10 means nothing left, 9 means one more rep was there, 8 means two more. RIR is the same idea counted the other way: RPE 8 equals 2 reps in reserve. New lifters misjudge it by 4 to 5 reps at first and calibrate over 2 to 3 months of honest logging, which is why the box only appears here once it will mean something.',
  },
  {
    id: 'basic-sets-reps',
    q: 'How many sets and reps should I do?',
    group: 'The basics',
    aliases: ['what does 3x8 mean', 'how many reps to build muscle', 'rep ranges', 'is 3 sets enough'],
    a: '3x8 means three sets of eight reps. Muscle grows across a wide range, roughly 5 to 20 reps, as long as sets end close to failure, so the range matters less than the effort. A good week lands about 10 hard sets per muscle, which is exactly what the weekly bars on the History tab count.',
  },
  {
    id: 'basic-start-weight',
    q: 'How much weight should I start with?',
    group: 'The basics',
    aliases: ['starting weight', 'how heavy should I go', 'is the weight too heavy', 'empty bar'],
    a: 'Lighter than feels impressive. Pick a weight you can lift for your target reps with clean form while finishing the set feeling like 2 to 3 reps were left. On barbell lifts, starting near the empty bar and learning the movement is normal. Where you start barely matters, because the whole game is adding to it steadily, and the log is how you see that happening.',
  },
  {
    id: 'basic-rest',
    q: 'How long should I rest between sets?',
    group: 'The basics',
    aliases: ['rest time', 'rest between sets', 'is 30 seconds enough'],
    a: 'Roughly 2 to 3 minutes on big lifts, 1 to 2 on smaller ones. Too little rest quietly costs reps on the later sets, which costs growth. The timer here starts itself when a set is complete and is sized to the movement and your goal, so mostly you just lift when it says so.',
  },
  {
    id: 'basic-failure',
    q: 'Should I train to failure?',
    group: 'The basics',
    aliases: ['go to failure', 'leave reps in the tank', 'max out every set'],
    a: 'No. Stopping 1 to 3 reps short builds essentially the same muscle as grinding to zero, with far less wear. The effort has to be real, the last reps should be slow, but the set does not have to end in a failed rep. The exception is the send week of the effort wave, where last sets deliberately go to the end.',
  },
  {
    id: 'basic-soreness',
    q: 'Why am I sore, and can I train while sore?',
    group: 'The basics',
    aliases: ['doms', 'muscle soreness', 'sore two days later', 'train sore', 'not sore anymore'],
    a: 'Soreness peaks 1 to 3 days after unfamiliar work and fades as your body adapts. It is not a scorecard: its absence does not mean the session failed, and chasing it is chasing the wrong thing. Mild soreness is fine to train through. If it is bad enough to change your form, train something else today. Sharp pain in a joint is not soreness, and it is a stop.',
  },
  {
    id: 'basic-compound',
    q: 'What are compound and isolation exercises?',
    group: 'The basics',
    aliases: ['compound vs isolation', 'multi joint', 'exercise order', 'big lifts first'],
    a: 'Compounds move several joints at once, like presses, rows and leg presses. Isolations move one, like curls and lateral raises. Most of your results come from compounds done early while you are fresh, with isolations after, which is exactly the order generated sessions here arrive in.',
  },
  {
    id: 'basic-machines',
    q: 'Are machines or free weights better?',
    group: 'The basics',
    aliases: ['machines vs free weights', 'are machines cheating', 'smith machine'],
    a: 'Neither. Matched for effort and volume they build the same muscle. Machines are easier to learn and safer to push hard on alone; free weights train balance and cover more muscle per movement. Use what you will actually progress on, and mix freely.',
  },
  {
    id: 'basic-warmup',
    q: 'How should I warm up?',
    group: 'The basics',
    aliases: ['warm up sets', 'stretching before lifting', 'ramp up sets'],
    a: 'A few minutes of easy movement, then 2 to 3 ramping sets of your first exercise, roughly half then three quarters of the working weight for falling reps. Later movements for the same muscles need little or nothing. Long stretching before lifting is not required, and warm up sets are free technique practice. Warm up sets do not need logging, only the work does.',
  },
  {
    id: 'basic-bulky',
    q: 'Will lifting make me bulky?',
    group: 'The basics',
    aliases: ['toned not big', 'women bulky', 'get huge'],
    a: 'Not by accident. Visible muscle takes months to years of deliberate training plus deliberate eating, and nobody wakes up bulky. Toned is muscle with less fat over it, which is precisely what lifting builds. You steer the outcome with load, volume and food, and it steers slowly.',
  },
  {
    id: 'basic-results',
    q: 'How long until I see results?',
    group: 'The basics',
    aliases: ['newbie gains', 'when will I look different', 'how long to build muscle'],
    a: 'Strength moves inside 2 to 4 weeks. The mirror moves in 6 to 12. The fast early phase lasts roughly the first year. Judge progress by the log, not the mirror: the numbers move first, and the Progress tab exists to show them moving.',
  },
  {
    id: 'basic-restdays',
    q: 'Do I need rest days?',
    group: 'The basics',
    aliases: ['lift every day', 'overtraining', 'how many rest days', '48 hours'],
    a: 'Yes. A muscle wants about 48 hours before the next hard session, and 1 to 3 rest days a week is normal at every level. That is why the streak here counts weeks that met your plan, never consecutive days: a rest day costs you nothing.',
  },
  {
    id: 'basic-missed',
    q: 'What if I miss a workout or a week?',
    group: 'The basics',
    aliases: ['skipped a week', 'lose gains', 'restart program', 'coming back after a break'],
    a: 'A missed session means nothing: do the next one. Muscle takes weeks of full stop to fade, and after 2 or more weeks away, restarting about 10 percent lighter gets you back fast because rebuilt strength returns quicker than it was earned. The ghost line tells you exactly where you left off.',
  },
  {
    id: 'basic-cardio',
    q: 'Does cardio hurt my gains?',
    group: 'The basics',
    aliases: ['cardio before or after lifting', 'running and lifting', 'cardio kills gains'],
    a: 'Only at volumes most people never do. Lift first when both share a day, keep most cardio easy, and know that hard running interferes more than cycling. For general fitness the two are teammates, not rivals.',
  },
  {
    id: 'basic-recomp',
    q: 'Can I lose fat and build muscle at the same time?',
    group: 'The basics',
    aliases: ['body recomposition', 'bulk or cut', 'scale not moving'],
    a: 'As a newer lifter, yes: lift hard, eat enough protein, and hold a small calorie deficit or maintenance. The scale can sit still while your shape changes, so trust measurements and logged strength over weight. Diet planning beyond that headline is outside this app, deliberately.',
  },
  {
    id: 'basic-protein',
    q: 'How much protein do I need?',
    group: 'The basics',
    aliases: ['protein per day', 'protein shake', 'what to eat to build muscle'],
    a: 'The consensus headline: roughly 0.7 to 1 g per lb of bodyweight per day, and the daily total matters far more than timing around the workout. Beyond that one line, nutrition is outside this app: no calorie targets, no meal plans, no pretending. A tool that takes food seriously is the right place for those.',
  },
  {
    id: 'basic-pain',
    q: 'Something hurts when I lift. Should I push through?',
    group: 'The basics',
    aliases: ['pain when lifting', 'knee pain', 'back hurts', 'injury or soreness'],
    a: 'No. Sharp pain, joint pain, or pain that persists is a question for a clinician, and this app will not diagnose it. Stop the movement that hurts, train around it, and get it looked at if it lasts or worsens. Flagging the joint in Settings makes sessions swap around it in the meantime. Next day muscle soreness is different and normal.',
  },
  {
    id: 'basic-supplements',
    q: 'Do I need supplements?',
    group: 'The basics',
    aliases: ['creatine', 'pre workout', 'protein powder needed'],
    a: 'No supplement is required for progress, and this app does not give supplement advice. The honest summary: creatine monohydrate is the only one with deep evidence behind a modest benefit, most of the rest is marketing, and anything beyond that belongs with a professional, not a training log.',
  },
]

// --- Getting stronger --------------------------------------------------------

const STRONGER: KnowledgeEntry[] = [
  {
    id: 'strong-progression',
    q: 'How should I increase my weights week by week?',
    group: 'Getting stronger',
    aliases: ['add weight', 'when to increase weight', 'double progression', 'progress weights weekly'],
    a: 'Use double progression: pick a rep range, keep the weight fixed, and add reps across sessions. When you hit the top of the range on every set with clean form, add the smallest jump available and drop back to the bottom. Reps and load build muscle interchangeably, so a rep added is progress the same as a pound added. The coach line here says exactly this at the moment it applies: add a rep, or try a specific new weight.',
  },
  {
    id: 'strong-overload',
    q: 'What is progressive overload?',
    group: 'Getting stronger',
    aliases: ['progressive overload meaning', 'do more over time'],
    a: 'Doing slightly more over time: a rep, a pound, a set. It is the single mechanism behind nearly all progress, and it only works when you know what last time was, which is the entire reason a log exists. The ghost line above your sets is progressive overload made visible.',
  },
  {
    id: 'strong-increments',
    q: 'How big should each weight jump be?',
    group: 'Getting stronger',
    aliases: ['how much weight to add', 'increment size', 'dumbbell jumps too big', 'fractional plates'],
    a: 'Lower body barbell lifts take 5 to 10 lb, upper body 2.5 to 5. Dumbbells jump about 5 lb a hand, which can be a 10 to 15 percent leap, so expect 2 to 4 weeks of rep building between jumps. Machine pins often move 10 to 15 lb at once: use the small add on plates if the stack has them, or widen your rep range and ride reps longer. When the smallest jump is still too big, more reps at the same weight is the move, not a grinded jump.',
  },
  {
    id: 'strong-rates',
    q: 'How fast should I be progressing?',
    group: 'Getting stronger',
    aliases: ['realistic progress', 'newbie linear progression', 'adding weight every session'],
    a: 'New lifters can add small amounts every session or week for roughly the first 3 to 6 months. After that, progress moves to monthly: think 5 to 10 lb a month on leg work and 2.5 to 5 on pressing, earned through reps in between. When session to session jumps start grinding for 2 to 3 sessions running, that is not failure, that is graduation to the slower, permanent pace.',
  },
  {
    id: 'strong-hold',
    q: 'When should I not add weight?',
    group: 'Getting stronger',
    aliases: ['should I add weight', 'form breaking down', 'missed reps', 'bad sleep training'],
    a: 'Hold the load when form broke on the last reps, when you missed the target, or when the same weight suddenly reads a full RPE point harder than last week. Reps that only happened through grinding did not earn a jump. On short sleep or heavy life weeks, cut the load 5 to 10 percent, hit the same reps, and let the week pass. Progress is judged across weeks, never against one bad day.',
  },
  {
    id: 'strong-plateau',
    q: 'My lifts are stuck. What do I do?',
    group: 'Getting stronger',
    aliases: ['plateau', 'not making progress', 'stalled bench', 'cant add weight'],
    a: 'First read the log: were you actually adding reps or load, or repeating the same session? Then, in order: add reps before weight, take smaller jumps, or back off about 10 percent and rebuild past the sticking point over 2 to 3 weeks. Sleep and food break more plateaus than programs do. The Progress tab makes a real plateau visible as a flat line, which is different from a noisy one.',
  },
  {
    id: 'strong-deload',
    q: 'What is a deload?',
    group: 'Getting stronger',
    aliases: ['deload week', 'easy week', 'week off'],
    a: 'A planned easy week: about half the sets at 60 to 70 percent of normal weight, nothing hard. Take one when performance grinds for 2 straight sessions despite decent sleep and food, or roughly every 4 to 8 weeks of hard training. Strength does not leave in a week, and the light week is what buys the next two months of progress.',
  },
  {
    id: 'strong-1rm',
    q: 'What is a 1RM and should I test mine?',
    group: 'Getting stronger',
    aliases: ['one rep max', 'test my max', 'max out'],
    a: 'The most you can lift once. Testing it is a skill with real risk and near zero information that a hard set of 3 to 8 reps does not already give: the app estimates your max from every weighted set and charts it on the Progress tab. Watch the estimate climb instead of testing the real thing, especially in your first year.',
  },
]

export const KNOWLEDGE: KnowledgeEntry[] = [...BASICS, ...STRONGER, ...APP, ...NUMBERS]

// --- Search ------------------------------------------------------------------

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

const STOP = new Set(['what', 'is', 'the', 'a', 'an', 'do', 'does', 'how', 'my', 'in', 'to', 'of', 'for', 'and', 'or', 'it', 'are', 'can', 'should', 'best', 'good', 'need'])

// Local scoring over authored text, nothing else. Question and alias words
// count most, body words keep long tails findable.
export function searchKnowledge(query: string, limit = 6): KnowledgeEntry[] {
  const terms = tokens(query).filter((t) => !STOP.has(t))
  if (!terms.length) return []

  const scored = KNOWLEDGE.map((entry) => {
    const inQ = new Set(tokens(entry.q))
    const inAlias = new Set(entry.aliases.flatMap(tokens))
    const inBody = new Set(tokens(entry.a))
    let score = 0
    for (const term of terms) {
      if (inQ.has(term)) score += 4
      else if (inAlias.has(term)) score += 3
      else if (inBody.has(term)) score += 1
      else {
        // prefix match keeps "supersets" finding "superset", but only between
        // real words: short fragments like "be" must never anchor a match
        for (const w of inQ) {
          if (w.length >= 4 && term.length >= 4 && (w.startsWith(term) || term.startsWith(w))) {
            score += 3
            break
          }
        }
      }
    }
    return { entry, score }
  })

  return scored
    .filter((s) => s.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry)
}
