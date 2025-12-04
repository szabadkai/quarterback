# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuarterBack is a drag-first capacity planner built as a static single-page application using Vite + vanilla JavaScript. It helps engineering managers translate headcount into accountable quarterly plans with quarter-aware Gantt boards and capacity estimation.

**Core Philosophy**: Drag-first interactions without modals. Everything runs in the browser with localStorage persistence.

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server with HMR (runs at http://localhost:5173)
npm run dev

# Build production bundle (outputs to docs/ directory)
npm run build

# Preview production build locally
npm run preview

# Build and deploy to gh-pages branch
npm run deploy
```

## Architecture

### Module Structure

The application follows a modular architecture with clear separation of concerns:

- **main.js**: Entry point that renders the app shell HTML template and initializes App
- **app.js**: Main controller (QuarterBackApp class) coordinating all UI, modals, storage, capacity calculations, and exports
- **gantt.js**: Timeline renderer and drag-and-drop logic (GanttChart object)
- **capacity.js**: Pure capacity calculation helpers (CapacityCalculator object)
- **storage.js**: localStorage adapter with default demo data initialization (Storage object)
- **style.css**: All layout, styling for backlog, modals, tooltips, themes

### Key Patterns

**Global Singleton Pattern**: App, GanttChart, CapacityCalculator, and Storage are all object singletons (not classes). App is exposed on `window.App` for debugging.

**Data Flow**:
1. App loads data from Storage (localStorage) on init
2. App manages all state (projects, team, capacity, settings)
3. App calls GanttChart.update() to render the timeline
4. User interactions trigger App methods which update state and save to Storage
5. App refreshes the Gantt chart after state changes

**Drag-and-Drop Architecture**:
- Backlog cards use `application/x-quarterback-project` MIME type
- Unscheduling uses `application/x-quarterback-unschedule` MIME type
- GanttChart handles all drop zones (swimlanes, backlog dock)
- Dragging from backlog → swimlane auto-assigns owner and creates 2-week window
- Dragging bars back to backlog clears dates/owners (unschedule)

### State Management

All state lives in the QuarterBackApp instance:
- `projects[]`: All project cards with ICE scores, dates, assignees
- `team[]`: Team members with regions, roles, PTO dates, avatars
- `capacity`: Capacity totals (theoretical, net, committed, reserves)
- `regions[]`, `roles[]`, `companyHolidays[]`: Planning profiles
- `settings`: UI preferences (theme, viewType, quarter)

Changes are saved immediately to localStorage via Storage methods.

### Capacity Calculation

**Two-tier calculation**:
1. **Simple mode**: `numEngineers * workingDays - (PTO + holidays + reserves)`
2. **Profile mode**: Per-member calculation using region PTO, role focus %, and company holidays

CapacityCalculator.calculateWithProfiles() aggregates:
- Theoretical capacity: `workingDays * (role.focus/100)` per member
- Time off: region PTO per member (company holidays already deducted from working days)
- Reserves: ad-hoc % + bug % applied to theoretical capacity
- Net capacity: `theoretical - timeOff - reserves`

### Demo Data System

**First-time user detection**: Storage.isFirstTimeUser() checks if localStorage has any projects/team/capacity. If not, Storage.initializeDemoMode() loads rich demo data with:
- 6 team members across 3 regions with varied roles and PTO dates
- 12+ demo projects showing completed, in-progress, and backlog states
- Regional profiles (US West, Europe, Asia Pacific) with different PTO/holiday allowances
- Role profiles (Senior Engineer, Engineering Manager, QA, Tech Lead) with focus percentages

Demo mode is tracked with `quarterback_demo_mode` flag. Users can exit demo mode via banner.

## Important Implementation Details

### Date Handling
- All dates stored as ISO strings (YYYY-MM-DD)
- Quarter ranges calculated from quarter label (e.g., "Q1-2025" → Jan 1 - Mar 31)
- Gantt chart snaps to Monday start for week boundaries
- Drag operations clamp dates to current quarter/view boundaries

### Project Timeline Constraints
- Minimum auto-schedule duration: 3 days (this.minAutoScheduleDays)
- Story points to days ratio: 1:1 (this.storyPointDayRatio)
- Backlog drag creates 2-week default window (this.backlogDurationDays)

### ICE Score Normalization
- ICE inputs (Impact, Confidence, Effort) normalized to 1-10 scale
- ICE score = (Impact * Confidence) / Effort
- Story points estimated from Effort + Confidence if not explicitly set
- Man-day estimate = max(minDays, storyPoints * dayRatio)

### Export Formats
- **PNG/PDF**: Uses html2canvas + jsPDF to capture board snapshots
- **CSV**: Per-member breakdown with project assignments
- **JSON**: Full state export for backup/transfer via Storage.exportData()

### Theming
11 built-in themes (light and dark variants) stored in settings.theme. Theme CSS classes applied dynamically to body element.

### Build Configuration

Vite config (vite.config.js) uses `VITE_BASE_PATH` environment variable for deploy paths:
- Dev mode: base = '/'
- Production: base = VITE_BASE_PATH or './'
- Build output: docs/ directory (for GitHub Pages)
- Target: ES2018

## Common Gotchas

1. **Assignees normalization**: Always check if assignees is array or single value - normalize to array
2. **Quarter label format**: Must be "Q[1-4]-YYYY" format for quarter parsing
3. **localStorage namespace**: All keys prefixed with "quarterback_" to avoid collisions
4. **Drag preview cleanup**: Always remove drag preview elements after drag ends
5. **Capacity calculations**: Company holidays reduce working days globally; PTO is per-member
6. **Build path**: GitHub Pages deploy assumes "/quarterback/" base path unless overridden

## External Dependencies

- **html2canvas**: PNG capture for board snapshots
- **jsPDF**: PDF generation from canvas
- **jspreadsheet-ce** (CDN): Spreadsheet editing in capacity tool (loaded via index.html)
- **jsuites** (CDN): Supporting library for jspreadsheet

## Debugging Tips

- App singleton exposed as `window.App` for console debugging
- Check `localStorage` keys with prefix "quarterback_*" to inspect state
- Use `npm run build && npm run preview` to test production build before deploy
- Verify base path matches deployment URL to avoid blank screen after deploy
