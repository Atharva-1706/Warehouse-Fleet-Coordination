# Warehouse Fleet Coordination Simulator

An interactive, browser-based simulation of a multi-robot warehouse fleet. Watch autonomous robots navigate a warehouse grid, pick up and deliver tasks, manage battery levels, and coordinate with each other in real time — all rendered with live analytics.

## Features

- **Live grid simulation** — robots pathfind (BFS) around storage racks and obstacles to fulfill delivery tasks between storage locations and a central inventory point.
- **Task management** — inject tasks manually with a configurable location, weight, priority, and team size, or let the simulator auto-generate tasks continuously.
- **Battery & charging logic** — robots consume battery while moving, dock at charging slots when low, and hand off in-progress tasks to teammates when battery gets critical.
- **Fleet coordination** — priority-based task assignment, collision avoidance/yielding between robots, and multi-robot ("team") tasks for heavier loads.
- **Fleet settings** — adjust robot count and per-robot efficiency to simulate degraded or high-performing units.
- **Live analytics** — charts (via Recharts) tracking fleet performance over time, plus a running event log of robot activity.
- **Playback controls** — play/pause, adjust simulation speed, and reset the simulation state.

## Tech Stack

- [React 19](https://react.dev/)
- [Vite](https://vitejs.dev/) — dev server & build tool
- [Recharts](https://recharts.org/) — analytics charts
- [Lucide React](https://lucide.dev/) — icons
- ESLint for linting

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm

### Installation

```bash
git clone <your-repo-url>
cd warehouse-sim
npm install
```

### Development

Start the dev server with hot module reload:

```bash
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`) in your browser.

### Build

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

### Linting

```bash
npm run lint
```

## Project Structure

```
.
├── public/            # Static assets (favicon, icons)
├── src/
│   ├── assets/         # Images used in the app
│   ├── App.jsx          # Main simulation logic, UI, and rendering
│   ├── App.css           # App-level styles
│   ├── index.css          # Global styles
│   └── main.jsx            # React entry point
├── index.html
├── vite.config.js
├── eslint.config.js
└── package.json
```

## How It Works

The simulation runs on a fixed grid (configurable in `App.jsx` via `COLS`/`ROWS`). Each tick:

1. Robots move one step toward their current destination using a shared BFS pathfinder, yielding to higher-priority robots when blocked.
2. Battery drains per step moved and recharges at dedicated charging slots.
3. Robots with critically low battery hand off their remaining tasks to an available teammate before returning to charge.
4. New tasks are either injected manually through the UI or spawned automatically depending on the selected task mode.
5. Fleet-wide stats (completed tasks, active robots, battery levels, etc.) are recorded each tick and rendered in the Analytics panel.

## License

This project does not currently specify a license. Add one (e.g. MIT) if you plan to share or open-source it.
