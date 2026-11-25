# Shipping dock greybox

Open `index.html` in a browser. Keep `replays.js` beside it. No server or game save is needed. Start with `?start=tight` to reverse the case order, or `?lang=pt-BR` for Brazilian Portuguese.

## What this tests

Can a new player read a dock, make a consequential choice within 30 seconds, and want to make another? The player sees a real partner forecast. Pressing a choice shows the immediate booking and the receipts from that branch. This is a decision replay: the browser reveals the recorded branch without waiting through the simulated shift. There is no simulated reward or shipment at click time.

| Case | Take now | Wait |
| --- | --- | --- |
| Roomy | All five orders on time. 369.25 game minutes, five departures. | All five on time. 444 minutes, six departures. |
| Tight | All five on time. The closest existing deadline had 2.25 game minutes to spare. | All five on time. The closest existing deadline had 134.5 game minutes to spare. |

In the tight replay, County School Meals went from 166.5 minutes to spare to 2.25. The partner forecast two additional orders at risk; that forecast did not turn into two late deliveries.

## Run a first-player session

1. Invite five people who have not played MillOS and enjoy management or simulation games. Alternate which case opens first. Ask them to try the screen, without explaining the dock or the partner’s choice.
2. Time from the decision buttons becoming available to the first choice. Record the choice, any request for help and whether they try the other dock without prompting. Give them room to stop before asking: “What did your choice change?” and “What would make you choose differently?”
3. Advance to an opening test if at least four of five make a choice within 30 seconds and can explain its tradeoff, and at least three take the second case unprompted. These are provisional thresholds for this small sample. If comprehension fails, revise the information shown. If comprehension passes and interest fails, test a different decision.

## Reproduce the receipts

From the repository root:

```sh
MILLOS_DOCK_GREYBOX_OUT=prototypes/dock-decision/replays.js \
  ./node_modules/.bin/vitest run src/systems/__tests__/UnifiedGameTick.playableJourney.test.ts \
  -t 'captures both answers'
./node_modules/.bin/prettier --write prototypes/dock-decision/replays.js
```

The harness uses the actual scene machine roster, standard-pace game tick, partner pricing and answer handler, and fixed-step truck controllers. It replays each case twice from the same opening, with no authored deadline or stock changes. The Wait branch keeps waiting on follow-up early offers and picks up the next programme when the current one closes. Every completed order has a departure manifest. The greybox keeps forecasts separate from recorded outcomes and reads no player data.
