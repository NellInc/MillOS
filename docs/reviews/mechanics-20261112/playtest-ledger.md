# Stranger play-test, 12 November 2026

One headless session on a production build of `ffe9e70e`, from a cold start with
empty storage. Chrome headless, 1366x681 viewport, medium quality (the default),
English, sound muted by the browser. 13 minutes under the primary checkout's
capture lock. Driven by Claude Fable 5.2 through `tools/play-host.mjs` and
`tools/play-step.mjs` in this folder, acting only on what was on screen.

**Load:** the machine's load average was 375 to 600 on 10 cores throughout (other
sessions). Frame rate read 14 to 39. No timing or frame-rate claim is made from
this session; game-clock readings are reliable, real-time ones are not.

**Page health:** 0 console errors, 0 page errors, 0 failed requests in 13 minutes.

## What happened

| Game clock | Real | What was on screen | What I did |
|---|---|---|---|
| 10:00, held | 0:00 | Tour card 1 of 3, "Follow the grain", camera on the silos. Chip: "Paused for the tour". | Next |
| 10:00, held | 1:30 | Card 2, "Look first, touch second". Card 3, "Protect the day's flour". | Next, Start operating |
| 10:03 | 2:30 | Guide: "Your first delivery. Riverside Bakers' Cooperative: 6,000 kg Strong white bread flour. Due in 3h 56m." Already "Ready for the shipping truck: 480 kg ... waiting". Buttons: Show shipping bay, Open SCADA. A chip: "Cooperative season running: take over". HUD: "288 bags/h · Agreement between shifts · Target 19 / 1,200". Camera had moved inside the hall. | Nothing was asked of me |
| 10:50 | 3:30 | Guide: "Ready to depart. The outbound load is ready. Watch its departure from the shipping bay." "At least 2 loads needed (up to 5,000 kg each)". | Set Shift pace to 4x |
| 11:42 | 4:30 | "Truck departed". | Watched |
| 13:53 | 5:30 | "Delivery fulfilled ... 6,000 of 6,000 kg, delivered on time." HUD: "0 bags/h · Line idle: order packed, awaiting dispatch". Bell: 1 unread. | Opened Mill Chronicle from the dock |
| 13:55 | 6:00 | Charter: five radio groups in a 384 px sidebar, then "Sign the charter". Nothing says how long a chronicle is or what it asks. | Signed with the defaults |
| 17:24 | 7:30 | Chronicle overview: Era, Crop year, Fund 300, Know-how 0, Standing 5 of 9, three desks 2/2, Shift 0 of 63, Upkeep 6, next era needs. No first goal named. Bell: 3 unread. Guide now offers "Review shift and next programme". | Pressed it |
| 21:29 | 9:30 | Overview sidebar: "Current programme complete. Next: Accept next production programme" over a 60-word paragraph. HUD: "0 bags/h · Target 1,320 / 1,200". Night. Bell: 5 unread. | Opened Autonomy |
| 23:35 | 11:30 | "Workplace laboratory ... Automatic three-shift season complete. Read the individual receipts and rehearse safe reload." Buttons: Skip guide and run fictional demo, Keep decisions manual, Open ten-minute guide, Download public cooperative receipt, Save and safely reload workplace. Six tabs. "Game: review, minute 90.0 of 90. Revision 12." Bell: 6 unread. | Host reached its 13-minute hold |

## What a stranger would take from it

1. **Seven game hours with nothing asked, and one decision in thirteen and a
   half.** The first order (6,000 kg) and then the whole 18 t first programme
   shipped on time while I pressed Next three times and changed the pace. The
   first thing the game needed from me was "Accept next production programme".
   It was offered by 17:24, about seven game hours in; I pressed it at 21:29.
2. **The guide's verbs are "Show" and "Watch".** Every button on the first-delivery
   card moves the camera or opens a panel.
3. **The cooperative season ran and finished without me.** It started itself,
   showed "Agreement between shifts" on the HUD with no meaning I could get from
   the screen, and ended as a bell badge and a sentence about receipts and reload.
4. **The Chronicle is found only by curiosity.** Nothing pointed to it. Its charter
   is signed in one click with the defaults, and the screen after signing names
   fourteen numbers and no first aim.
5. **Six notices went unread** in the bell and none surfaced.
6. **Success was quiet.** "Delivery fulfilled" appeared as a heading on the guide
   card. Nothing in the plant or the HUD marked it.
7. **The line stood idle** ("0 bags/h") from 13:53 until I looked again, and again
   from the programme's end until 21:29, with the day's bag target already passed.
8. **Two goals on screen:** a bag target on the HUD (1,320 / 1,200 by evening,
   from stock nobody ordered) and customer kilograms on the guide.

## What worked

The tour is short and clear. The clock chip says why time is held. The guide's
state lines are true to the plant ("Only a departed manifest credits this
customer"). The 6,000 kg order's second truck is announced before it is needed.
Nothing broke.

## Not covered

Phone layout, Brazilian Portuguese, first-person walking and driving, the Safety
panel and drill, SCADA, a Chronicle event dialog, a second session after reload,
and anything at standard pace beyond the first three minutes.

Screenshots: `output/mechanics-review-20261112/playtest/shots/001` to `009`
(git-ignored, local to the machine that ran the session).
