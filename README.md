# ⚔️ Aquaveo Battle Bots Picker

A chaotic battle-royale random selection tool. Instead of drawing names, participants become bots armed with toy weapons and fight it out in an arena until one stands. The order in which bots fall produces the ranking.

## Screenshots

### Battle Arena
![Battle Arena](screenshots/racing.png)

### Winner Announcement
![Winner Announcement](screenshots/winner.png)

### Final Standings
![Final Standings](screenshots/standings.png)

## About

Each participant is spawned as a bot with a randomly assigned toy weapon. Bots pathfind around obstacles, target each other, and battle using their weapon's unique mechanics. Eliminations trigger an instant replay zoomed in on the fallen bot. The last bot standing wins, and ranking is determined by kill count and elimination order.

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

## The Bots

Each bot is randomly assigned one of eight toy weapons at the start of every battle. A **weapon reveal** phase with a 3-2-1 countdown shows each bot's loadout before the fight begins.

### Ranged Weapons

| Weapon | Damage | Rate | Range | Notes |
|---|---|---|---|---|
| 💦 **Water Balloon** | 15–22 | Medium | Long | Wobbling blue projectile, moderate knockback |
| 💧 **Squirt Gun** | 5–9 | Very fast | Medium | Rapid-fire water droplets |
| 🫧 **Bubble Blower** | 3–6 per bubble | Very fast burst | Short | Cone of translucent bubbles |

### Melee Weapons

| Weapon | Damage | Speed | Range | Special |
|---|---|---|---|---|
| 🌀 **Pinwheel** | 25–32 | Very fast | Short | Colorful spinning petals, light knockback |
| 🗡️ **Boffer Sword** | 35–42 | Slow | Medium | Wide foam swing, heavy knockback |
| 🪀 **Yo-Yo** | 10–16 | Fast | Medium | Extends and retracts on a string |
| 🖐️ **Sticky Hand** | 18–28 | Fast | Long | **Pulls target toward attacker** instead of pushing away |
| 🥒 **Inflatable Club** | 30–42 | Very slow | Short | Biggest knockback in the game — punts bots into hazards |

## Arena Hazards

Three hazard types spawn randomly in each arena. Bots pathfind around lava and spikes, but knockback can still launch them into danger.

- **🌋 Lava Pit** — Instant kill on contact
- **🪤 Spike Pit** — Appears dynamically during battle, pops open every 400ms at random locations for 500ms each, dealing heavy damage on contact
- **🟢 Goo Pool** — Bots walk through it, but are permanently slowed to half speed for the rest of the battle

## Features

- **Pre-Battle Weapon Reveal** — Bots appear one by one with their assigned weapon, followed by a 3-2-1 countdown before "GO!"
- **Dynamic Pathfinding** — A* navigation around walls, pillars, lava, and spike pits; re-routes every 3 seconds if target isn't reached
- **Knockback Physics** — Weapons push (or pull) targets; collisions with walls deal extra damage
- **Damage Numbers** — Floating damage numbers drift upward on every hit
- **Dynamic Spike Traps** — Spike pits continuously open and close at random locations throughout the battle
- **Instant Replay** — After each elimination, a 3-second slow-motion replay zooms in and tracks the fallen bot
- **Minimizable Winner Dialog** — Elimination/winner banner auto-minimizes after 3 seconds (triggering the replay) and can be re-expanded from the bottom bar
- **Smart Ranking** — Last bot standing gets 1st place; all others ranked by kill count (takedowns) and then elimination order
- **Group Management** — Save, load, and delete named rosters of participants; all persisted via `localStorage`
- **Participant Images** — Optional avatar images per participant, shown on bots, eliminations, and the final standings

## Technology Stack

- **React 19** with TypeScript
- **Vite 7** for dev server and builds
- **HTML5 Canvas** for real-time battle rendering at 60fps
- **localStorage** for participant and group persistence

## Architecture

- `App.tsx` — Top-level state, winner dialog, group management, final standings
- `components/BattleArena.tsx` — The entire battle game: physics, AI, pathfinding, hazards, weapon visuals, instant replay
- `components/EntryManager.tsx` — Sidebar participant and group UI
- `components/BattleArena.css`, `App.css` — Styling and animations
