# Light Cycles Picker — Improvement Suggestions

## Gameplay

1. **Shrinking arena** — after a 15-20s rage timer, perimeter walls slowly contract from the edges with a "deresolution" effect, forcing confrontations and preventing stalemates.
2. **Bouncing Identity Disc** — disc reflects off the perimeter once or twice instead of derezzing on contact, adding bank-shot kills.
3. **Color-swap power-up** — temporarily lets a cycle "wear" another cycle's color, confusing aggressive AI personalities.
4. **Personality reveals** — pre-match phase shows each cycle's assigned personality next to its name (badge/icon).
5. **Cycle health / multi-hit** — instead of one-shot crashes, give cycles 2 HP so a glancing trail clip is a wound, not a death — opens room for comebacks.

## Visual Polish

6. **Trail fade gradient** — older trail segments fade to dimmer color toward the spawn point, giving depth and showing how long each cycle has been alive.
7. **Crash-cam shake** — brief screen shake on every crash for impact.
8. **Disc throw windup** — half-second charge animation before the Identity Disc launches, telegraphing the attack to viewers.
9. **Boost speed lines** — angular streaks behind a boosting cycle for a sense of velocity.
10. **Power-up spawn beam** — a vertical beam of light "drops" each power-up onto the grid like a Tron data packet.

## Arena

11. **Data nodes** — small destructible cubes on the grid that, when crashed into by a disc, release a power-up.
12. **Recognizer flyover** — periodic Tron Recognizer silhouette crosses the screen, briefly dimming all trails for one tick (no gameplay effect, pure flavor).
13. **Two arena themes** — alternate between "Game Grid" (cyan/orange) and "Outlands" (magenta/purple) on each run for visual variety.

## UX

14. **Match log overlay** — minimizable feed showing key events ("Bob picked up Identity Disc · Carol Boosted · Alice was derezzed by Bob's disc").
15. **Speed controls** — 1× / 1.5× / 2× playback speed during the run.
16. **Cycle inspector** — hover over a cycle in the standings to see its personality, takedowns, and elimination cause.
17. **Sound design** — engine hum that pitches up with speed; disc whoosh; deresolution shatter; countdown beeps.

## AI Tuning

18. **Personality weights** — let users skew the personality mix (more aggressive vs more defensive) per match for different vibes.
19. **Smarter disc avoidance** — defensive cycles should attempt to dodge incoming Identity Discs (currently they don't react to disc trajectories).
20. **Look-ahead deepening** — increase the anti-suicide look-ahead distance during boost (since cycles cover ground faster).
