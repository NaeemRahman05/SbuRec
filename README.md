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

## SBU-Recs — what this project does

This repository powers SBU-Recs, an interactive web app that helps Stony Brook students discover which courses and instructors are most likely to give high grades, plus read real student comments and ask an AI assistant for help. The project runs live here:

https://sburec.onrender.com/

Key capabilities
- Ranked course listings using full Classie Evals grade-distribution data (all classes and sections when the full CSV is present).
- Professor/instructor ranking by an ease score derived from actual grade distributions (Bayesian-smoothed A-rate + volume weighting).
- Full comment visibility: view every 'valuable' and 'improvement' comment collected from Classie Evals for each course/section.
- Built-in RAG assistant (Retrieval-Augmented Generation) and a lenient offline fallback — ask natural-language questions about courses, instructors, and trends and get concise answers powered by the local dataset or an LLM.
- Client-side CSV ingestion and cleaning pipeline with a preference for pre-cleaned files in `frontend/public/cleaned/`.

Who this is for
- Students choosing courses who want to prioritize GPA-friendly classes.
- Advisors and admins who want quick overviews of grading patterns.
- Researchers exploring course/instructor-level grade distribution trends.

Quick features tour
- Home: top-ranked courses by 'ease' (probability of A after smoothing), sortable and filterable by prefix, credits, term, and SBC tags.
- Course detail: instructor breakdowns, historical sections, grade distribution charts, and a table of comments (valuable vs improvement) with easy filtering.
- Professor ranking: leaderboard-style view for instructors teaching the same course or across a department.
- Floating RAG chat bubble: ask free-text questions ("Who is the hardest instructor for CSE 214?", "Summarize pros/cons for ECO 110") and get data-backed answers. The assistant uses an LLM when API keys are available; otherwise it uses the lenient offline retriever that searches cleaned CSVs and synthesizes answers heuristically.

Data & provenance
- Primary source: Classie Evals exports (grade distributions + free-text comments). The project loads CSVs placed in `frontend/public/` by default and prefers cleaned versions in `frontend/public/cleaned/` when present.
- The app retains full-grade distribution data (counts per grade bucket) so all computed rankings and charts are derived from real, per-section numbers — not heuristics alone.
- Comments are cleaned to strip common footers and repeated signatures; the cleaning pipeline is in `scripts/clean_comments.py` and produces cleaned CSVs plus a `frontend/public/cleaned/index.json` manifest.

How the ranking works (high level)
- Aggregate all sections for a course/instructor to compute: total students, total A-count (A + A-), and raw A-rate.
- Apply Bayesian smoothing toward the global A-rate with a configurable prior strength to avoid small-sample bias. The smoothed 'ease' score is the primary sort key (ties broken by total students and recency).

RAG (Retrieval-Augmented Generation) assistant
- Two modes:
   - SBC / vector mode: uses OpenAI embeddings + a Chroma vectorstore to find semantically-related snippets and then an LLM to generate fluent answers (requires OPENAI_API_KEY and vectorstore initialization).
   - Lenient / offline mode: a fast, rule-based retriever that searches the cleaned Classie CSVs for keyword matches (and lightweight heuristics like numeric boosts for grades/response counts) so you can get useful answers without an API key.
- Use cases: "Which instructor gives the most A's for CSE 114?", "Summarize student pros and cons for BIO 203", "Show comments mentioning 'projects' for ART 101".

Developer notes — important files
- frontend/: React + TypeScript app (Vite). Key files:
   - `src/pages/Home.tsx` — bootstrap & course listing (now prefers `frontend/public/cleaned/index.json` when present).
   - `src/components/RagChatBubble.tsx` — floating assistant UI; supports mode switching and a client-side lenient answerer.
   - `src/lib/csv.ts` — CSV parsing + normalization (PapaParse wrapper used by client-side loader).
   - `src/store/courses.ts` — Zustand store for filters and course aggregates.
- frontend/rag.py — a CLI helper that can run in `sbc` (vector) or `lenient` modes for interactive question answering and vector ingestion.
- scripts/clean_comments.py — cleans comment footers and writes cleaned CSVs and a manifest used by the frontend.
- scripts/split_rag_data.py & scripts/recombine_and_resplit_rag.py — helpers to split very large RAG datasets into <50MB parts for Chroma ingestion and web hosting.

Running locally (quick)
1. Web UI
```powershell
cd frontend
npm install
npm run dev
# open http://localhost:5173 (vite will report the actual port)
```
2. RAG CLI (lenient mode, no OpenAI key required)
```powershell
python frontend/rag.py --mode lenient
```
3. Recreate cleaned CSVs (if you edit cleaning rules)
```powershell
python scripts/clean_comments.py
```

Privacy & limitations
- The app stores and displays student comments from Classie Evals. Only use and host datasets you have permission to publish.
- The lenient retriever is a heuristic fallback and may miss nuanced semantic matches compared to an LLM-backed retriever.
- If you enable OpenAI for richer answers, prompts and data may be sent to the LLM provider — keep that in mind for sensitive or private comments.

Contact & contribution
- Repo owner / maintainer: see Git history for commit authors.
- Contributions welcome: open issues or PRs, and add tests when changing parsing/aggregation logic (Vitest is configured).

Thanks for using SBU-Recs — check the live site at https://sburec.onrender.com/ and feel free to open an issue here for feature requests or data concerns.

