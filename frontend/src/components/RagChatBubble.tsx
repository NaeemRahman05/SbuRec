import { useState, useRef, useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { useCoursesStore } from "@/store/courses";
import { formatCredits, formatInstructorList } from "@/lib/format";
import { parseCsvFiles } from "@/lib/csv";
import type { CourseRow } from "@/lib/types";

const SBC_OPTIONS = [
    "ARTS",
  "TECH",
  "SBS+",
  "HUM",
  "CER",
  "GLO",
  "HFA+",
  "LANG",
  "QPS",
  "SNW",
  "STAS",
  "USA",
];

export const RagChatBubble = () => {
  const [open, setOpen] = useState(false);
  const [interest, setInterest] = useState("");
  const [sbc, setSbc] = useState(SBC_OPTIONS[0]);
  const [mode, setMode] = useState<"sbc" | "lenient">("sbc");
  const [cleanedLoaded, setCleanedLoaded] = useState(false);
  const [cleanedRows, setCleanedRows] = useState<CourseRow[] | null>(null);
  const [sbcDropdownOpen, setSbcDropdownOpen] = useState(false);
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const sbcRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResults, setLastResults] = useState<string[] | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const PAGE_SIZE = 3;

  const courseList = useCoursesStore((s) => s.courseList);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (sbcRef.current && sbcRef.current.contains(target)) {
        return;
      }
      if (modeRef.current && modeRef.current.contains(target)) {
        return;
      }
      setSbcDropdownOpen(false);
      setModeDropdownOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const localRecommend = async (interestText: string, sbcCode: string, mode: "sbc" | "lenient") => {
    const q = (interestText || "").toLowerCase().trim();
    let candidates = courseList.slice();
    if (sbcCode) {
      candidates = candidates.filter((c) =>
        Array.isArray(c.sbc) ? c.sbc.map((t) => String(t).toUpperCase()).includes(String(sbcCode).toUpperCase()) : false,
      );
    }
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      candidates = candidates.filter((c) => {
        const hayBase = `${c.courseName} ${c.courseCode} ${c.prerequisites ?? ""} ${c.advisory ?? ""}`.toLowerCase();
        if (mode === "lenient") {
          // lenient mode: prefer matches in prerequisites/advisory/instructor as well
          const insts = Object.keys(c.instructors ?? {}).join(" ").toLowerCase();
          const hay = `${hayBase} ${insts}`.toLowerCase();
          return tokens.every((t) => hay.includes(t));
        }
        const hay = hayBase.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }
    // sort by aRate, then easeScore, then totalStudents
    candidates.sort((a, b) => {
      const r = (b.aRate ?? 0) - (a.aRate ?? 0);
      if (r !== 0) return r;
      const r2 = (b.easeScore ?? 0) - (a.easeScore ?? 0);
      if (r2 !== 0) return r2;
      return (b.totalStudents ?? 0) - (a.totalStudents ?? 0);
    });

    const lines = candidates.map((c) => {
      const firstInstructor = Object.keys(c.instructors ?? {})[0] ?? "TBD";
      const aRate = Number.isFinite(c.aRate ?? NaN) ? `${((c.aRate ?? 0) * 100).toFixed(1)}%` : "N/A";
      const study = c.seasons && c.seasons.length ? "" : "";
      return `${c.courseCode} — ${c.courseName} (${firstInstructor}; ${formatCredits(c.credits)}; SBC: ${c.sbc.join(", ")}; Prereq: ${c.prerequisites ?? "None"}; Advisory: ${c.advisory ?? "None"}; A≈${aRate})`;
    });
    if (!lines.length) return [] as string[];
    return lines;
  };

  // --- Lenient answer generator: flexible, LLM-like local answers from cleanedRows ---
  const answerLenient = (question: string, rows: CourseRow[]): string => {
    const q = (question || "").trim();
    const ql = q.toLowerCase();

    const codeMatch = q.match(/\b([A-Za-z]{2,4})\s*([0-9]{3})\b/);
    const hasCourse = !!codeMatch;
    const courseCodeNorm = hasCourse ? `${codeMatch![1].toUpperCase()} ${codeMatch![2]}` : null;

    // helpers
    const normalizeInstructor = (s: string) => (s || "").trim();

    const groupByInstructorForCourse = (code: string) => {
      const groups: Record<string, CourseRow[]> = {};
      for (const r of rows) {
        if (!r.courseCode) continue;
        if (r.courseCode.replace(/\s+/g, "").toUpperCase() !== code.replace(/\s+/g, "").toUpperCase()) continue;
        const inst = normalizeInstructor(r.instructor) || "Unknown";
        if (!groups[inst]) groups[inst] = [];
        groups[inst].push(r);
      }
      return groups;
    };

    const computeStats = (arr: CourseRow[]) => {
      const totalStudents = arr.reduce((s, r) => s + (r.totalStudents || 0), 0);
      const totalA = arr.reduce((s, r) => s + ((r.gradeA || 0) + (r.gradeAminus || 0)), 0);
      const avgARate = totalStudents > 0 ? totalA / totalStudents : 0;
      const avgStudy = arr.reduce((s, r) => s + (r.studyHoursMean || 0), 0) / Math.max(1, arr.length);
      return { totalStudents, avgARate, avgStudy, sections: arr.length };
    };

    // Intent: worst teacher for a course
    if (/(worst|avoid|bad|terrible|don't take|dont take)/.test(ql) && hasCourse) {
      const groups = groupByInstructorForCourse(courseCodeNorm!);
      const statsList = Object.entries(groups).map(([inst, arr]) => ({ inst, stats: computeStats(arr), samples: arr }));
      if (!statsList.length) return `No data found for ${courseCodeNorm}`;
      // rank by avgARate ascending (worst = lowest A rate) then by avgStudy descending
      statsList.sort((a, b) => a.stats.avgARate - b.stats.avgARate || b.stats.avgStudy - a.stats.avgStudy);
      const worst = statsList[0];
      const others = statsList.slice(1, 4);
      const sampleCons: string[] = [];
      for (const r of (worst.samples || [])) {
        for (const c of r.improvementComments || []) {
          if (c && sampleCons.length < 5 && !sampleCons.includes(c)) sampleCons.push(c);
        }
      }
      const s = `${worst.inst} appears to be the weakest choice for ${courseCodeNorm} based on review data.
Stats: A-rate ≈ ${(worst.stats.avgARate * 100).toFixed(1)}%; Avg study ≈ ${worst.stats.avgStudy.toFixed(1)}h; Sections=${worst.stats.sections}; Students=${worst.stats.totalStudents}.

Sample negative feedback:
${(sampleCons.length ? sampleCons.slice(0,3).map((t,i)=>`${i+1}. ${t}`).join('\n') : '(no negative comments found)')}

Other instructors for this course you might consider:
${others.map((o, i) => `${i+1}. ${o.inst} — A≈${(o.stats.avgARate*100).toFixed(1)}%; Study≈${o.stats.avgStudy.toFixed(1)}h; Sections=${o.stats.sections}`).join('\n')}`;
      return s;
    }

    // Intent: teacher rankings (for a course or overall)
    if (/(rank|ranking|rankings|best|top|bottom)/.test(ql) && /(teacher|instructor|professor|teacher)/.test(ql)) {
      if (hasCourse) {
        const groups = groupByInstructorForCourse(courseCodeNorm!);
        const statsList = Object.entries(groups).map(([inst, arr]) => ({ inst, stats: computeStats(arr) }));
        if (!statsList.length) return `No instructors found for ${courseCodeNorm}`;
        statsList.sort((a, b) => b.stats.avgARate - a.stats.avgARate || a.stats.avgStudy - b.stats.avgStudy);
        const lines = statsList.map((s, i) => `${i+1}. ${s.inst} — A≈${(s.stats.avgARate*100).toFixed(1)}%; Study≈${s.stats.avgStudy.toFixed(1)}h; Sections=${s.stats.sections}`);
        return `Instructor ranking for ${courseCodeNorm} (best → worst):\n${lines.join('\n')}`;
      } else {
        // overall instructor ranking across all courses
        const groups: Record<string, CourseRow[]> = {};
        for (const r of rows) {
          const inst = normalizeInstructor(r.instructor) || 'Unknown';
          if (!groups[inst]) groups[inst] = [];
          groups[inst].push(r);
        }
        const statsList = Object.entries(groups).map(([inst, arr]) => ({ inst, stats: computeStats(arr) }));
        statsList.sort((a, b) => b.stats.avgARate - a.stats.avgARate || a.stats.avgStudy - b.stats.avgStudy);
        const top = statsList.slice(0, 10).map((s,i) => `${i+1}. ${s.inst} — A≈${(s.stats.avgARate*100).toFixed(1)}%; Study≈${s.stats.avgStudy.toFixed(1)}h; Sections=${s.stats.sections}`);
        return `Top instructors (overall) by A-rate:\n${top.join('\n')}`;
      }
    }

    // If asking about a specific course (general question)
    if (hasCourse) {
      const code = courseCodeNorm!;
      const matched = rows.filter((r) => (r.courseCode || '').replace(/\s+/g,'').toUpperCase() === code.replace(/\s+/g,'').toUpperCase());
      if (!matched.length) return `No data found for ${code}`;
      const stats = computeStats(matched);
      const valuable = new Set<string>();
      const improv = new Set<string>();
      for (const r of matched) {
        (r.valuableComments || []).forEach((c) => c && valuable.add(c));
        (r.improvementComments || []).forEach((c) => c && improv.add(c));
      }
      const pros = Array.from(valuable).slice(0,3).map((t,i) => `${i+1}. ${t}`).join('\n') || '(no praise comments)';
      const cons = Array.from(improv).slice(0,3).map((t,i) => `${i+1}. ${t}`).join('\n') || '(no improvement comments)';
      return `Summary for ${code}:\nA-rate ≈ ${(stats.avgARate*100).toFixed(1)}%; Avg study ≈ ${stats.avgStudy.toFixed(1)}h; Based on ${stats.sections} sections.\n\nPros:\n${pros}\n\nCons:\n${cons}`;
    }

    // Fallback: free-text search over comments and course names
    const tokens = ql.split(/\s+/).filter(Boolean);
    const scored: { row: CourseRow; score: number }[] = [];
    for (const r of rows) {
      const hay = `${r.courseName} ${(r.valuableComments||[]).join(' ')} ${(r.improvementComments||[]).join(' ')} ${r.prerequisites ?? ''}`.toLowerCase();
      let score = 0;
      for (const t of tokens) if (hay.includes(t)) score += 1;
      if (score > 0) scored.push({ row: r, score });
    }
    scored.sort((a,b)=>b.score-a.score);
    if (!scored.length) return `Couldn't find data matching '${question}'`;
    const top = scored.slice(0,5).map((s,i) => `${i+1}. ${s.row.courseCode} — ${s.row.courseName} (${s.row.instructor}) — excerpt: ${(s.row.valuableComments||[])[0] || (s.row.improvementComments||[])[0] || ''}`);
    return `Top matches for '${question}':\n${top.join('\n')}`;
  };
  const handleSubmit = async (e?: any) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setResponse(null);
    setLoading(true);
    const question = `${interest} SBC:${sbc}`.trim();

    // If lenient mode selected, answer locally using cleaned CSVs (reviews + prereqs).
    if (mode === "lenient") {
      try {
        // load cleaned CSVs if not already loaded
        let parsedRows: CourseRow[] | null = null;
        if (!cleanedLoaded) {
          setLoading(true);
          const manifestResp = await fetch("/cleaned/index.json");
          let filesToLoad: string[] = [];
          if (manifestResp.ok) {
            const manifest = await manifestResp.json();
            if (Array.isArray(manifest)) filesToLoad = manifest;
          } else {
            // fallback: try to find known cleaned filenames
            filesToLoad = [
              "classie_missing_with_sbc.csv",
              "classie_evaluations_with_sbc_part1.csv",
              "classie_evaluations_with_sbc_part2.csv",
              "classie_evaluations_with_sbc_part3.csv",
              "classie_evaluations_with_sbc_part4.csv",
            ];
          }
          const fileObjs: File[] = [];
          for (const name of filesToLoad) {
            try {
              const resp = await fetch(`/cleaned/${name}`);
              if (!resp.ok) continue;
              const blob = await resp.blob();
              fileObjs.push(new File([blob], name, { type: "text/csv" }));
            } catch (err) {
              // skip
            }
          }
          if (fileObjs.length > 0) {
            parsedRows = await parseCsvFiles(fileObjs);
            setCleanedRows(parsedRows);
            setCleanedLoaded(true);
          } else {
            parsedRows = [];
            setCleanedRows(parsedRows);
            setCleanedLoaded(true);
          }
          setLoading(false);
        }

        // generate lenient answer using cleanedRows (prefer parsedRows if just-loaded)
        let rows: CourseRow[] = parsedRows ?? cleanedRows ?? [];
        if (!rows || rows.length === 0) {
          setResponse("Lenient data not available; no cleaned CSVs found.");
          setLoading(false);
          return;
        }

        // Use the flexible local answerer to handle free-form queries (rankings, worst teacher, general summaries)
        try {
          const ans = answerLenient(interest, rows);
          setResponse(ans);
        } catch (err: any) {
          setError(String(err ?? "Unknown error"));
        }
        setLoading(false);
        return;
      } catch (err: any) {
        setError(String(err ?? "Unknown error"));
        setLoading(false);
        return;
      }
    }

    // If not lenient mode, fall back to backend then client aggregates as before
    try {
      // Attempt to call a backend endpoint if available
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, mode }),
      });
      if (res.ok) {
        const text = await res.text();
        setResponse(text);
        setLoading(false);
        return;
      }
    } catch (err) {
      // network or missing backend — fall through to local
    }

    // Fallback: local recommendation using aggregates
    try {
      const outArr = await localRecommend(interest, sbc, mode);
      if (Array.isArray(outArr)) {
        if (outArr.length === 0) {
          setResponse(`No recommendations found for '${interest}' and SBC='${sbc}'.`);
          setLastResults(null);
        } else {
          setLastResults(outArr);
          setPageIndex(0);
          const page = outArr.slice(0, PAGE_SIZE).join("\n\n");
          setResponse(page);
        }
      } else {
        setResponse(String(outArr));
        setLastResults(null);
      }
    } catch (err: any) {
      setError(String(err ?? "Unknown error"));
    }
    setLoading(false);
  };

  return (
    <div className="fixed right-6 bottom-6 z-50 w-12 h-12">
      {open ? (
        <div
          className="absolute right-0 bottom-14 rounded-lg border border-border/40 bg-card p-3 shadow-lg"
          style={{ width: 'min(90vw, 480px)', maxHeight: '70vh', resize: 'both', overflow: 'auto' }}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">RAG Advisor</div>
            <button
              aria-label="Close chat"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 hover:bg-muted/40"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 text-xs text-foreground/70">Ask anything — I'll answer using the dataset (choose Lenient for data-backed answers).</div>
            <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
            <input
              className="w-full rounded-md border border-border/30 bg-transparent px-2 py-1 text-sm text-foreground"
              placeholder={mode === "lenient" ? 'Ask anything (e.g., "Pros/Cons of MUS 119? Teacher rankings for class?")' : 'Input your interest for the SBC you need'}
              value={interest}
              onChange={(ev: any) => setInterest(ev.target.value)}
            />
            <div className="flex gap-2 items-center">
              <label className="text-xs text-foreground/70">Mode:</label>
              <div className="relative w-full" ref={modeRef}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setModeDropdownOpen((o) => !o)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setModeDropdownOpen((o) => !o);
                  }}
                  className="w-full flex items-center justify-between rounded-md border border-border/30 bg-transparent px-2 py-1 text-sm text-foreground cursor-pointer"
                >
                  <span>{mode === "sbc" ? "SBC (vector)" : "Lenient (cleaned data)"}</span>
                  <span className="text-foreground/60">▾</span>
                </div>
                {modeDropdownOpen ? (
                  <ul
                    role="listbox"
                    aria-label="Mode options"
                    className="absolute left-0 right-0 z-40 bottom-full mb-1 max-h-40 w-full overflow-auto rounded-md border border-border/30 bg-card p-1 text-sm"
                  >
                    <li
                      role="option"
                      aria-selected={mode === "sbc"}
                      onClick={() => {
                        setMode("sbc");
                        setModeDropdownOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setMode("sbc");
                          setModeDropdownOpen(false);
                        }
                      }}
                      tabIndex={0}
                      className={`cursor-pointer rounded px-2 py-1 ${mode === "sbc" ? "bg-accent text-background" : "text-foreground hover:bg-muted/30"}`}
                    >
                      SBC (vector)
                    </li>
                    <li
                      role="option"
                      aria-selected={mode === "lenient"}
                      onClick={() => {
                        setMode("lenient");
                        setModeDropdownOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setMode("lenient");
                          setModeDropdownOpen(false);
                        }
                      }}
                      tabIndex={0}
                      className={`cursor-pointer rounded px-2 py-1 ${mode === "lenient" ? "bg-accent text-background" : "text-foreground hover:bg-muted/30"}`}
                    >
                      Lenient (cleaned data)
                    </li>
                  </ul>
                ) : null}
              </div>
            </div>
            {/* Custom dropdown to fully control styling across browsers */}
            <div className="relative" ref={sbcRef}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (mode === "lenient") return;
                  setSbcDropdownOpen((o) => !o);
                }}
                onKeyDown={(e) => {
                  if (mode === "lenient") return;
                  if (e.key === "Enter" || e.key === " ") setSbcDropdownOpen((o) => !o);
                }}
                className="w-full flex items-center justify-between rounded-md border border-border/30 bg-transparent px-2 py-1 text-sm text-foreground cursor-pointer"
              >
                <span>{sbc}</span>
                <span className="text-foreground/60">▾</span>
              </div>
              {mode === "lenient" ? (
                <div className="text-xs text-foreground/60 mt-1">SBC selection is ignored in Lenient mode.</div>
              ) : null}
              {sbcDropdownOpen ? (
                <ul
                  role="listbox"
                  aria-label="SBC options"
                  className="absolute left-0 right-0 z-40 bottom-full mb-1 max-h-40 w-full overflow-auto rounded-md border border-border/30 bg-card p-1 text-sm"
                >
                  {SBC_OPTIONS.map((opt) => (
                    <li
                      key={opt}
                      role="option"
                      aria-selected={sbc === opt}
                      onClick={() => {
                        setSbc(opt);
                        setSbcDropdownOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSbc(opt);
                          setSbcDropdownOpen(false);
                        }
                      }}
                      tabIndex={0}
                      className={`cursor-pointer rounded px-2 py-1 ${sbc === opt ? "bg-accent text-background" : "text-foreground hover:bg-muted/30"}`}
                    >
                      {opt}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1 text-sm font-medium text-background"
                disabled={loading}
              >
                {loading ? "Thinking…" : "Ask Wolfie"}
              </button>
              <button
                type="button"
                className="ml-auto text-xs text-foreground/60 underline"
                onClick={() => {
                  setInterest("");
                  setSbc(SBC_OPTIONS[0]);
                  setResponse(null);
                  setError(null);
                }}
              >
                Reset
              </button>
            </div>
          </form>
          <div className="mt-3 max-h-56 overflow-auto text-sm whitespace-pre-wrap">
            {error ? <div className="text-red-500">{error}</div> : null}
            {response ? <div className="whitespace-pre-wrap">{response}</div> : null}
            {!response && !error && !loading ? (
              <div className="text-xs text-foreground/50">Prompt: Ask anything — switch to Lenient mode for dataset-backed answers</div>
            ) : null}
            {/* Pagination controls for local recommendations */}
            {lastResults ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="text-xs text-foreground/60">Page {pageIndex + 1} of {Math.max(1, Math.ceil(lastResults.length / PAGE_SIZE))}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const prev = Math.max(0, pageIndex - 1);
                      setPageIndex(prev);
                      setResponse(lastResults.slice(prev * PAGE_SIZE, prev * PAGE_SIZE + PAGE_SIZE).join("\n\n"));
                    }}
                    disabled={pageIndex === 0}
                    className="rounded-md border border-border/30 bg-transparent px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = Math.min(Math.floor((lastResults.length - 1) / PAGE_SIZE), pageIndex + 1);
                      setPageIndex(next);
                      setResponse(lastResults.slice(next * PAGE_SIZE, next * PAGE_SIZE + PAGE_SIZE).join("\n\n"));
                    }}
                    disabled={(pageIndex + 1) * PAGE_SIZE >= lastResults.length}
                    className="rounded-md bg-accent px-2 py-1 text-xs text-background disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <button
        title="Open RAG chat"
        onClick={() => setOpen((v) => !v)}
        className="absolute right-0 bottom-0 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-background shadow-lg"
        aria-expanded={open}
      >
        <MessageSquare className="h-5 w-5" />
      </button>
    </div>
  );
};

export default RagChatBubble;
