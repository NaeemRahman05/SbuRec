# SBU-Recs Frontend

SBU-Recs ranks Stony Brook courses by “easy A” likelihood using Classie Evals grade distributions. This MVP is a self-contained React + Vite SPA that loads CSV exports (including the bundled `classie_evaluations_with_sbc.csv`), applies Bayesian smoothing to avoid tiny-class bias, and surfaces rich course insights with a modern red/black theme.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 to explore the Top 10 easiest courses (credits ≥3 by default). Upload additional Classie Evals CSVs at any time; parsing happens client-side via PapaParse.

### Production Build

```bash
npm run build
npm run preview
```

### Tests

```bash
npm run test
```

Tests cover the Bayesian scoring and aggregation pipeline (Vitest + React Testing Library setup).

## Data Ingestion & Scoring

1. **CSV Parsing** – Upload one or many files with the exact headers listed in the PRD. PapaParse normalizes headers, trims whitespace, and deduplicates duplicate section rows (prefers higher response counts).
2. **Normalization** – `normalizeRow` coerces numbers, canonicalizes the course code (`CSE 214` style), splits SBC tokens (`","`, `"|"`, `";"`), and breaks Valuable/Improvement comments into arrays (`||` or newline delimiters).
3. **Aggregation** – `aggregateCourses` groups rows by course and instructor, computing:
   - Total students
   - Total A-count (`Grade A + Grade A-`)
   - Raw A-rate (`totalA / N`)
   - Instructor-specific grade distributions and section history
4. **Bayesian Ease Score** – Smooths toward the global A-rate using prior strength `k = 50`:

   ```ts
   easeScore = (totalA + k * globalAmean) / (N + k)
   ```

   This keeps small sections from dominating rankings while still rewarding consistently high A rates. The homepage sorts by `easeScore` desc, then `totalStudents`, then course code.

5. **Filters & Search** – Zustand stores filter state (prefix, SBC, season, year, credits toggle, search). Search is debounced (250 ms) and auto-resorts by easiness unless the user explicitly chooses another sort.

## UI Overview

- **Dark, modern red/black theme** powered by Tailwind + custom tokens.
- **Top Toolbar** – Search, Sort dropdown, Filters sheet (course prefix, SBC, credits toggle, season/year, reset).
- **Home Grid** – Top 10 easiness cards with mini A-rate bars, credits, SBC chips, and instructor highlights.
- **Course Details** – Instructor-aware ease scores, grade distribution charts, study/attendance stats, sections table, and comment tabs (valuable vs improvement) sorted by length with season/year chips.
- **CSV Upload** – Always available in the header; merges new data into the current state.

## Render Deployment (Later)

1. Build static assets: `npm run build` (emits to `frontend/dist`).
2. Deploy dist folder to Render Static Site with build command `npm install && npm run build` and publish directory `dist`.

## Notes

- Default dataset lives at `frontend/public/data/classie_evaluations_with_sbc.csv` (first 100 rows sampled from the full Classie Evals export for size). Replace it with the full file for complete coverage.
- State persists to `localStorage` so filters and sort choices stick between refreshes.
- Charts use Recharts with accessible tooltips and respect dark mode.

Enjoy finding courses that maximize your GPA confidence!

