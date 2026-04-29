# 🏍️ Aquaveo Light Cycles

A neon-soaked random selection tool inspired by Tron. Each participant becomes a light cycle on the grid, leaves a glowing trail behind it, and the last cycle un-derezzed wins. Order of elimination + identity-disc takedowns produce the final ranking.

## Screenshots

### The Grid

![The Grid](screenshots/racing.png)

### Grid Champion

![Grid Champion](screenshots/winner.png)

### Final Standings

![Final Standings](screenshots/standings.png)

## About

All cycles spawn around the perimeter of the arena, each assigned a random "personality" that drives its AI. They race continuously at 90° turns only, leaving axis-aligned neon trails. Crash into a trail, the perimeter, or get hit by an Identity Disc, and you're derezzed. Each elimination triggers a slow-motion replay zoomed on the fallen cycle. The last cycle on the grid is the Grid Champion; the rest are ranked by elimination order and takedowns.

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

The app starts at `http://localhost:5174` with hot-module reload.

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## The Cycles

Each cycle is assigned one of four AI personalities at the start of every match, randomly selected from the pool. Personality determines turn decisions and power-up usage.

| Personality | Behavior | Power-up Style |
|---|---|---|
| 🗡️ **Aggressive** | Cuts in front of nearest opponent's projected path; uses Boost and Disc liberally to engage. | Eager — fires Disc on alignment, Boosts to close gaps. |
| 🛡️ **Defensive** | Picks the direction with the most open space ahead (flood-fill); avoids crowded sectors. | Reactive — uses Hop, Derez, and Phase only when boxed in. |
| 🎯 **Hunter** | Chases the nearest opponent's tail; closes distance with Boost; throws Disc when aligned. | Hunter — Boost to close, Disc to finish. |
| 🌪️ **Wanderer** | Random whims at random intervals (with anti-suicide guard); rarely pre-empts power-ups. | Sparing — uses Hop on a coin flip when threatened. |

All personalities share a "don't immediately crash" guard: if forward motion would hit a trail or wall within ~6 cells, the AI prefers a safer 90° turn.

## Power-ups

Five power-up types spawn periodically as glowing hex pickups on the grid (one cycle holds at most one charge at a time). The AI decides when to use whatever it's holding based on personality and situation.

| Glyph | Power-up | Effect |
|---|---|---|
| `»` | **Light Boost** | 1.6× speed for 2.5 seconds; trail glows brighter, leaves a flare. |
| `⌃` | **Hop** | Instantly jumps 30 px forward, briefly intangible to trails — the iconic TRON: Legacy move. |
| `◎` | **Identity Disc** | Throws a glowing disc forward; first trail it hits gets derezzed, first cycle it hits is killed (takedown credited to thrower). |
| `✕` | **Derez** | Instantly erases the cycle's entire frozen trail — useful when boxed in. |
| `⌬` | **Wall Phase** | Pass through any trail (your own or others') for 1.2 seconds. |

## The Grid

A clean perimeter-walled arena with no obstacles. Cycles only have to avoid each other's trails, the perimeter, and Identity Discs in flight.

- Continuous pixel motion at 60 FPS
- 90° turns only — all trails are axis-aligned
- Stable per-participant trail color hashed from participant id (drawn from a 12-color Tron palette)

## Match Flow

1. **Initialize Grid** — Each participant's avatar materializes one-by-one on the grid, then dissolves into a glowing cycle outline at their starting position.
2. **3-2-1 Countdown** — Pulsing neon countdown.
3. **Run** — All cycles race simultaneously. Power-ups spawn periodically (every 3.5–6.5 seconds) and live for 12 seconds before despawning.
4. **First Crash** — The instant any cycle is derezzed, the run ends and a slow-motion replay (0.35×) zooms in on the crash for 3 seconds.
5. **Banner** — Eliminated participant is shown along with who derezzed them and how (Trail · Identity Disc · Wall).
6. **Next Run** — Click ▶ Next Run to start a fresh run with the surviving cycles. Repeat until one Grid Champion remains.

## Takedown Attribution

- Crash into another cycle's trail → that cycle's owner gets the takedown
- Hit by an Identity Disc → disc thrower gets the takedown
- Crash into the perimeter or your own trail → self-derez, no one credited

## Features

- **Personality-Based AI** — Four distinct AI archetypes mixed across cycles for narrative variety.
- **Five Power-Ups** — Light Boost, Hop, Identity Disc, Derez, Wall Phase.
- **Pre-Run Materialization** — Avatar-to-cycle morph with a Tron-style scan-line rezzing animation.
- **Identity Disc Combat** — Ranged kill option that derezzes trails and cycles alike.
- **Instant Replay** — 3-second slow-motion replay zoomed on the crash, with deresolution effect.
- **Smart Ranking** — Last cycle standing gets 1st place; all others ranked by takedowns and then elimination order.
- **Group Management** — Save, load, and delete named rosters of participants; all persisted via `localStorage`.
- **Participant Avatars** — Optional avatar images per participant, shown during materialization, on elimination, and in the final standings.

## Technology Stack

- **React 19** with TypeScript
- **Vite 7** for dev server and builds
- **HTML5 Canvas** for real-time grid rendering at 60 FPS
- **localStorage** for participant and group persistence

## Architecture

- `App.tsx` — Top-level state, winner dialog, group management, final standings
- `components/LightCycles.tsx` — The entire grid game: AI personalities, trails, collisions, power-ups, Identity Disc, materialization, replay
- `components/EntryManager.tsx` — Sidebar participant and group UI
- `components/LightCycles.css`, `App.css` — Styling, neon glow effects, animations
