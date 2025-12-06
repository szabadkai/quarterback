# QuarterBack

> A drag-first capacity planner for teams who want to see every quarter, stay honest about commitments, and pull work back the moment priorities shift.

QuarterBack pairs a lightweight capacity estimator with a tactile, quarter-aware Gantt board so engineering managers can translate headcount into accountable plans. Everything runs in the browser (Vite + vanilla JS), deploys statically, and saves state to `localStorage` for instant reloads.

## Why QuarterBack?

- **Plan with confidence** – model PTO, holidays, reserve buffers, regional calendars, and occupational focus rules before you promise outcomes.
- **Move fast without modals** – drag projects out of the backlog, stretch timelines, hand off work, or ripcord tasks back into the dock—no context switching required.
- **Stay transparent** – commitment meters, ICE scores, and inline toasts keep the entire crew aligned on where capacity goes.
- **Ship from anywhere** – Vite build + GitHub Pages deploy keeps hosting simple while remaining easy to fork internally.

## Feature Highlights

### Quarter-smart planning
- 13-week swimlanes with sticky headers, live "today" detection, and multi-quarter selectors.
- Timeline tooltips echo exact dates while you drag or resize.
- Per-person rows with avatars make ownership obvious during reviews.

### Capacity intelligence
- Region + role profiles drive PTO, holidays, and focus multipliers.
- Reserve sliders (ad-hoc + bug) keep slack visible in the commitment meter.
- Member-level breakdown shows theoretical vs. net days for every teammate.

### Backlog + drag flows
- Backlog dock surfaces unscheduled or unassigned cards with ICE badges.
- Drag cards onto a lane to auto-fill owners and seed a two-week window.
- Ripcord handle or hover-over-dock gesture immediately unschedules work and sends it back to backlog.

### Collaboration & sharing
- PNG/PDF board snapshots, CSV + JSON exports, guarded imports, and shareable URLs for async reviews.
- Deploy-ready base path keeps GitHub Pages links stable (`/quarterback/` by default).

## Quick Start

### Requirements
- Node.js 18+ (or any runtime supported by Vite 5)
- npm 9+ (or pnpm/yarn with equivalent scripts)
- Supabase (optional): set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` if you want cloud sync.

### Install & run

```bash
cd quarterback
npm install
npm run dev
```

- Dev server: <http://localhost:5173>
- Hot Module Replacement (HMR) reloads whenever you edit files under `src/`.

Stop the server with `Ctrl+C`. Use a dedicated terminal for build/deploy commands.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR. |
| `npm run build` | Produce a production bundle in `dist/` (esbuild minified). |
| `npm run preview` | Serve the production build locally for smoke testing. |
| `npm run deploy` | Build and publish `dist/` to the `gh-pages` branch via `gh-pages`. |

### Optional: Supabase cloud sync
- Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Create tables/policies from `docs/supabase-schema.sql` (includes shared board table for read-only links).
- Use the Supabase auth endpoints for email/password signup and session handling; the client is initialized in `src/supabaseClient.js`.
- In the app header, click **☁️ Cloud Sync** to log in, sign up, and push/pull the current board to Supabase.

## Everyday Workflows

### 1. Calibrate team capacity
1. Click **⚙️ Capacity Tool**.
2. Set engineer count, PTO, holidays, and reserve sliders.
3. Assign each teammate to a region + role so profile math (PTO + focus %) applies.
4. Review the member breakdown and apply the settings—the capacity meter updates instantly.

### 2. Build the backlog & prioritize
- Add projects via **+ Add Project**; capture ICE inputs to auto-score cards.
- Anything missing owners or dates lands in the backlog dock with badges describing the gap.
- Search + ICE badges keep priority work surfaced even if the dock is collapsed.

### 3. Schedule directly from backlog
- Drag a backlog card onto any swimlane.
- The drop fills the assignee, seeds a two-week window, and announces the change via toast.
- Resize or reposition immediately if you need a different timebox.

### 4. Drag tasks back to the backlog (unscheduling)
- **Ripcord handle**: grab the ↩ button on any bar, drag it to the backlog dock, and release to clear owners + dates.
- **Whole-bar drag**: while moving a bar, hover over the backlog dock; once it highlights, drop to unschedule.
- **Modal actions**: inside the project modal use **Send to Backlog**, **Clear owners**, or **Clear dates** for point-and-click reversals.

Every method posts a toast confirmation and the backlog immediately reflects the returned project.

### 5. Edit timelines inline
- Drag entire bars horizontally to shift schedules; tooltips show start/end as you move.
- Pull either resize handle to extend/shorten work (clamped to the active quarter).
- Drop onto another teammate’s lane to reassign ownership without touching the modal.

## Project Structure

```
quarterback/
├── index.html          # App shell + mount point
├── vite.config.js      # Base-path aware Vite config
├── src/
│   ├── main.js         # Renders shell + bootstraps the app
│   ├── app.js          # Controller (storage, modals, capacity, exports)
│   ├── gantt.js        # Timeline renderer & drag logic
│   ├── capacity.js     # Capacity math helpers
│   ├── storage.js      # localStorage adapter + defaults
│   └── style.css       # Layout, backlog, modals, tooltips, etc.
├── public/
│   └── favicon.svg     # Gradient QB favicon
└── prd.md              # Product brief + roadmap notes
```

## Deployment (GitHub Pages)

1. Ensure your changes are on `main`.
2. Run `npm run build` to test locally (optional but recommended).
3. Run `npm run deploy` – this builds and pushes `dist/` to `gh-pages` using the repo-aware base path (`/quarterback/`).
4. In GitHub → **Settings → Pages**, point the site to the `gh-pages` branch.
5. Custom repo name or domain? Override `VITE_BASE_PATH` at build time, e.g. `VITE_BASE_PATH=/capacity/ npm run build`.

After the Pages job finishes, the dashboard lives at `https://<user>.github.io/quarterback/` (or your custom domain/CNAME).

## Data & Privacy Model

- Everything persists to `localStorage` under the `quarterback_*` namespace (capacity, team, regions, roles, projects, settings).
- `Storage.exportData()` / `Storage.importData()` power the UI’s JSON export/import buttons for safe transfers between browsers.
- No network calls are made after the bundle loads; exports are the only time data leaves your machine.
- Clearing browser storage (or using the Import modal with a blank payload) resets the workspace.

## Troubleshooting

- **Dev server won’t start**: ensure Node 18+, delete `node_modules`, reinstall.
- **Blank screen after deploy**: confirm `base` in `vite.config.js` matches your published path or set `VITE_BASE_PATH` during build.
- **Fonts/colors off**: run `npm run build` to rebuild CSS and verify no manual tweaks were lost.

## Roadmap & Contributing

- Add alternate timelines (monthly, rolling 6-week) by extending `settings.viewType` + `GanttChart.generateWeeks`.
- Wire the existing filter button to advanced query controls.
- Explore replacing the local `Storage` adapter with your internal planning API.

QuarterBack is designed for rapid iteration—drag, drop, unschedule, repeat. If you ship new ideas, capture them in `prd.md` or open an issue so the next planner benefits too.
