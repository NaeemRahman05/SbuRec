import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useCoursesStore } from "@/store/courses";
import { formatCredits, formatInstructorList } from "@/lib/format";

const SBC_OPTIONS = [
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
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const courseList = useCoursesStore((s) => s.courseList);

  const localRecommend = async (interestText: string, sbcCode: string) => {
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
        const hay = `${c.courseName} ${c.courseCode}`.toLowerCase();
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

    const top = candidates.slice(0, 3);
    if (!top.length) {
      return `No recommendations found for '${interestText}' and SBC='${sbcCode}'.`;
    }
    const lines = top.map((c) => {
      const firstInstructor = Object.keys(c.instructors ?? {})[0] ?? "TBD";
      const aRate = Number.isFinite(c.aRate ?? NaN) ? `${((c.aRate ?? 0) * 100).toFixed(1)}%` : "N/A";
      const study = c.seasons && c.seasons.length ? "" : "";
      return `${c.courseCode} — ${c.courseName} (${firstInstructor}; ${formatCredits(c.credits)}; SBC: ${c.sbc.join(", ")}; Prereq: ${c.prerequisites ?? "None"}; Advisory: ${c.advisory ?? "None"}; A≈${aRate})`;
    });
    return lines.join("\n\n");
  };

  const handleSubmit = async (e?: any) => {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);
    setResponse(null);
    setLoading(true);
    const question = `${interest} SBC:${sbc}`.trim();
    try {
      // Attempt to call a backend endpoint if available
      const res = await fetch("/api/rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
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
      const out = await localRecommend(interest, sbc);
      setResponse(out);
    } catch (err: any) {
      setError(String(err ?? "Unknown error"));
    }
    setLoading(false);
  };

  return (
    <div className="fixed right-6 bottom-6 z-50 w-12 h-12">
      {open ? (
        <div className="absolute right-0 bottom-14 w-80 rounded-lg border border-border/40 bg-card p-3 shadow-lg">
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
          <div className="mt-2 text-xs text-foreground/70">Enter an interest and choose an SBC; I'll give a short recommendation.</div>
            <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
            <input
              className="w-full rounded-md border border-border/30 bg-transparent px-2 py-1 text-sm"
              placeholder="Interest (e.g., programming, stats, art)"
              value={interest}
              onChange={(ev) => setInterest(ev.target.value)}
            />
            <select
              value={sbc}
              onChange={(ev) => setSbc(ev.target.value)}
              className="w-full rounded-md border border-border/30 bg-black text-red-400 px-2 py-1 text-sm appearance-none"
            >
              {SBC_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1 text-sm font-medium text-background"
                disabled={loading}
              >
                {loading ? "Thinking…" : "Ask RAG"}
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
              <div className="text-xs text-foreground/50">Prompt: "Input an interest and the SBC you need"</div>
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
