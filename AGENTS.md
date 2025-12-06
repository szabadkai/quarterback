# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds all runtime code: `main.js` boots the app, `app.js` orchestrates UI + storage, `gantt.js` handles drag timelines, `capacity.js` covers math, `storage.js` wraps `localStorage`, `style.css` contains themes/components.
- `public/` serves static assets (favicon), `index.html` is the Vite entry, `vite.config.js` manages base path for GitHub Pages, `prd.md` documents product intents, `docs/` contains design notes.
- Bundles output to `dist/` after builds; avoid committing it. Keep feature docs or experiments in `docs/` rather than `src/` to prevent shipping dead code.

## Build, Test, and Development Commands
- `npm install` — install deps (Node 18+ recommended).
- `npm run dev` — Vite dev server with HMR at `http://localhost:5173`.
- `npm run build` — production bundle in `dist/` (minified).
- `npm run preview` — serve the built bundle for smoke tests.
- `npm run deploy` — build then publish `dist/` to `gh-pages`; override base with `VITE_BASE_PATH=/custom/ npm run build` when deploying elsewhere.

## Coding Style & Naming Conventions
- JavaScript is ESM with 2-space indent; prefer small pure helpers and early returns over deep branching.
- Use `camelCase` for functions/vars, `PascalCase` only for constructor-like factories, and keep module-level constants in `SCREAMING_SNAKE_CASE`.
- CSS lives in `src/style.css`; extend existing CSS variables and component blocks (e.g., `gantt-*`, `.backlog-*`) instead of ad-hoc inline styles. Favor utility-like tokens already defined over new colors.
- Keep DOM queries scoped to module-level containers to avoid global selectors; avoid adding new libraries without need—runtime is intentionally lightweight.

## Testing Guidelines
- No automated test suite yet; perform manual regression in dev/preview: create projects, drag bars, unschedule to backlog, adjust capacity sliders, and verify toasts/tooltips render.
- Before PRs, run `npm run build` to catch bundling or base-path regressions. If you add tests, colocate them near modules and mirror file names (e.g., `gantt.test.js`), aiming for coverage of drag math and storage import/export.

## Commit & Pull Request Guidelines
- Use short, imperative commit messages (seen in history: “better allocation”, “fixed audit items”); keep subjects ≤72 chars.
- PRs should explain intent, risk areas, and deployment steps; attach screenshots/GIFs for UI changes and note any base-path or storage migrations.
- Link issues or TODOs, and mention manual test steps taken. Ensure `npm run build` passes before requesting review.

## Data & Security Notes
- State is stored locally under the `quarterback_*` `localStorage` keys; avoid shipping secrets or environment-specific data.
- When modifying export/import flows, validate JSON shape and guard against corrupted payloads; do not add remote calls without a clear privacy review recorded in `docs/`.
