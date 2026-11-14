# MillOS game-mechanics review: shared brief

You are one of ten reviewers. Each has one area of the game. The lead will
merge the ten reports into a single plan for making MillOS's mechanics
correct, fun, engaging and educational. You review; you do not fix.

## Delivery contract

Your plain text output is not visible to the lead while you work. Before you
finish you MUST deliver your findings two ways: (1) write the full report to
the report path named in your task, and (2) return a condensed summary as
your final message. Stopping without both counts as not having done the work.

## What MillOS is

A browser game and digital twin of a grain mill (React Three Fiber, Zustand,
TypeScript). The player runs a flour mill: silos, roller mills, plansifters,
packers, trucks, forklifts, a QC lab, a cooperative workplace, and a long
campaign called the Chronicle. It is meant to teach real things: how flour
milling works, how a plant is operated and kept safe, and how a cooperative
governs itself alongside an AI partner. Players are curious adults, not
industry experts. It runs on desktop and phones, in English and Brazilian
Portuguese.

## Where to read

- Frozen snapshot (read this, not the main checkout):
  `<repo>` (a worktree of this repository on the review branch)
- Project rules: `CLAUDE.md` in that directory.
- Design decisions and who made them: `docs/DECISIONS.md`. `[Nell]` entries
  are the owner's and outrank `[proposed]` ones.
- Chronicle design: `docs/CHRONICLE.md`.
- Earlier play-test and gameplay work: `_contprompts/millos_resolute_fix_20261018.md`
  (play-test ledger near line 246, gameplay brief near line 60),
  `_contprompts/millos_gameplay_polish_20261002.md`,
  `_contprompts/millos_polish_ledger_20261020.md`.
- `_wiki/` is a May snapshot and names stores that no longer exist. Do not
  trust it.

## Only review what ships

53 modules under `src/` are dead code that look alive. Before you spend time
on a file, check it reaches the browser:

    grep -a "<path fragment>" <scratch>/reachability.txt

(`<scratch>/reachability.txt` is the output of `npm run validate:reachability -- --list`.)

A line starting `alive` ships. `dead` or `tree-shaken` does not: note it in
one line and move on. Known dead: `components/Machines.tsx`,
`components/ProductionMetrics.tsx`, `components/ambient/*`,
`components/breakdown/BreakdownEffects.tsx`, `hooks/useSafetySimulation.ts`,
`components/knowledge/KnowledgeTooltip.tsx`, `components/knowledge/UnlockNotification.tsx`,
`components/ui/EmergencyStopButton.tsx`.

## Rules for this review

- Read-only. Do not edit, create or delete anything in either checkout. Do
  not build, run the test suite, start a server or open a browser. The lead
  is running those and concurrent runs corrupt the measurements.
- Every claim cites `file:line` in the snapshot.
- A claim about what happens at runtime that you derived by reading, without
  seeing it run, is tagged `[Unverified]`. Tests that already pin a behaviour
  count as evidence: cite the test.
- Do not report as a defect something `docs/DECISIONS.md` records as decided.
  If you think a decision is hurting the game, say so under "Needs the owner"
  and name the entry.
- Problems found in the October play-test may already be fixed. Check the
  current source before repeating one, and say which it is.

## The rubric: answer these for each mechanic in your area

A mechanic is anything the player can do, decide or learn that the game
responds to. List every one you find, including small ones.

1. **Verbs.** What does the player decide or do? How often? What does it
   cost them (time, money, risk, attention)?
2. **Feedback.** What tells them it mattered, right away and later? Is the
   result visible in the 3D plant, or only in a panel?
3. **Choice quality.** Is there a dominant choice (always right) or a dead
   one (never worth taking)? Is there any decision with no consequence?
4. **Failure.** Can the player fail? Is the failure legible (they can see
   why) and recoverable through the ordinary interface? Is there any state
   with no way out?
5. **Pacing.** How long until the first meaningful decision? Where is the
   player waiting with nothing to do or no visible next step?
6. **Teaching.** What true thing about the real world does it teach? Name
   the concept. Does the play itself teach it, or only a text panel beside
   the play? Is any stated fact wrong, dated or doubtful?
7. **Discovery and wiring.** How does a player find this mechanic? What
   feeds it and what reads its results? Is it joined to the other loops or
   an island?
8. **Defects.** Bugs, contradictions, numbers that do not add up, stale or
   false copy, unreachable states, half-built features. Give the shortest
   path to reproduce each.

## Constraints every proposal must pass

These kill the most obvious "more engaging" ideas. Filter before you write.

- **No helper text** (D-012): no hints, tooltips, taglines, tutorial captions
  or secondary labels. Teaching comes from layout, playable onboarding, the
  world itself and the Datalinks reference. Error messages are allowed.
- **The PA speaks only problems and pertinent updates** (D-054). It cannot
  cheer, narrate nominal running or speak on a timer.
- **No number about a person** (D-008, D-058): no morale, loyalty, trust,
  wellbeing or productivity score for any worker or crew member. Personnel
  are anonymous roles.
- **The drill verifies egress; nobody evacuates** (D-010).
- **The Chronicle never creates goods, revenue or orders**; all its chance is
  seeded; every state it raises has a way out (CLAUDE.md, The Mill Chronicle).
- **No randomness** in the campaign or Chronicle outside the seeded generator.
- **Both languages.** All copy goes through `src/i18n` catalogues in English
  and Brazilian Portuguese. New real-world facts must be source-checked.
- **No emoji.** Lucide icons only.
- **Benchmarks stay stable.** Anything new is inert in benchmark runs.
- **Saves must keep loading.** A change to persisted state needs a migration
  and a fixture. The last three commits were save-restore fixes.

## Report format

Write to your report path, 1,500 to 3,000 words, in this order:

    # <Area>
    ## Mechanics inventory
    One table row per mechanic: name | entry point (file:line) | what the
    player does | verdict (keep / tune / rework / connect / cut).
    ## What works
    Three to six things that are genuinely good and must not be lost.
    ## Findings
    Ranked by harm to fun, engagement or learning. Each: title, evidence
    (file:line), what the player experiences, rubric item, severity
    (high / medium / low), and Verified or [Unverified].
    ## Defects
    Ranked. Each: what is wrong, file:line, shortest reproduction, severity.
    ## Proposals
    Five to ten, ranked by value for effort. Each has:
    - what changes, concretely (files and functions);
    - why it makes the game more fun, more engaging or more educational;
    - how we would know it worked: a named test, a number, or something a
      play-tester would see;
    - what still speaks the old contract (saves, tests, agent commands,
      SCADA tags, translations);
    - size: S (under a day), M (days), L (a week or more);
    - whether it needs the owner (it changes what a mechanic is, or touches
      a `[Nell]` decision) or is safe to do.
    ## Needs the owner
    Design questions only the owner can answer, each with your recommendation.
    ## Not reviewed
    Anything in your scope you did not get to, so the lead knows the gap.

Your final message: at most 500 words. Lead with the three findings that
matter most, then the three best proposals, then the count of defects by
severity, then the report path.

Write plainly. Say what you found, not how you looked.
