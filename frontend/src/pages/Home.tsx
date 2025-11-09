import { useEffect, useMemo, useState } from "react";
import { CourseCard } from "@/components/CourseCard";
import { TopControls } from "@/components/TopControls";
import { useCoursesStore } from "@/store/courses";
import { parseCsvFiles } from "@/lib/csv";

// Public files are placed at the site root (frontend/public)
// Files to attempt to load. For each base name we prefer a cleaned copy under /cleaned/
// if present (created by `scripts/clean_comments.py`).
const DEFAULT_DATA_FILES = [
  "classie_missing_with_sbc.csv",
  "classie_evaluations_with_sbc_part1.csv",
  "classie_evaluations_with_sbc_part2.csv",
  "classie_evaluations_with_sbc_part3.csv",
  "classie_evaluations_with_sbc_part4.csv",
];

export const HomePage = () => {
  const { courseList, visibleCourses, loadRows } = useCoursesStore((state) => ({
    courseList: state.courseList,
    visibleCourses: state.visibleCourses,
    loadRows: state.loadRows,
  }));
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<string | null>(null);
  const [totalFiles, setTotalFiles] = useState<number>(0);
  const [filesFetched, setFilesFetched] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  useEffect(() => {
    const bootstrap = async () => {
      if (courseList.length > 0) return;
      setLoading(true);
      try {
        const files: File[] = [];

        // Prefer a manifest under /cleaned/index.json which lists cleaned CSV filenames.
        // This allows the frontend to enumerate all files written by the cleaning script.
        try {
          setLoadingPhase("Checking for cleaned manifest...");
          const manifestResp = await fetch("/cleaned/index.json");
          if (manifestResp.ok) {
            const manifest = await manifestResp.json();
            if (Array.isArray(manifest) && manifest.length > 0) {
              setTotalFiles(manifest.length);
              let attempted = 0;
              for (const name of manifest) {
                try {
                  setLoadingPhase(`Downloading cleaned file: ${name}`);
                  const resp = await fetch(`/cleaned/${name}`);
                  attempted += 1;
                  setFilesFetched(attempted);
                  setProgressPercent(Math.round((attempted / manifest.length) * 50));
                  if (!resp.ok) {
                    console.warn(`Missing cleaned file listed in manifest: ${name}`);
                    continue;
                  }
                  const blob = await resp.blob();
                  files.push(new File([blob], name, { type: "text/csv" }));
                } catch (err) {
                  attempted += 1;
                  setFilesFetched(attempted);
                  setProgressPercent(Math.round((attempted / manifest.length) * 50));
                  console.warn(`Error fetching cleaned file ${name}:`, err);
                }
              }
            }
          }
        } catch (err) {
          // manifest fetch failed; fall back to per-file attempts below
          console.warn("Could not fetch /cleaned/index.json; falling back to file list", err);
        }

        // If manifest didn't yield files, fall back to attempting the configured filenames.
        if (files.length === 0) {
          setTotalFiles(DEFAULT_DATA_FILES.length);
          let attempted = 0;
          for (const baseName of DEFAULT_DATA_FILES) {
            // prefer cleaned version if available
            const cleanedPath = `/cleaned/${baseName}`;
            const fallbackPath = `/${baseName}`;
            try {
              setLoadingPhase(`Downloading ${baseName}`);
              const respClean = await fetch(cleanedPath);
              attempted += 1;
              setFilesFetched(attempted);
              if (!respClean.ok) {
                const respFallback = await fetch(fallbackPath);
                if (!respFallback.ok) {
                  console.warn(`Dataset file not found: ${cleanedPath} or ${fallbackPath}`);
                  setProgressPercent(Math.round((attempted / DEFAULT_DATA_FILES.length) * 50));
                  continue;
                }
                const blob = await respFallback.blob();
                files.push(new File([blob], baseName, { type: "text/csv" }));
              } else {
                const blob = await respClean.blob();
                files.push(new File([blob], baseName, { type: "text/csv" }));
              }
              setProgressPercent(Math.round((attempted / DEFAULT_DATA_FILES.length) * 50));
            } catch (err) {
              attempted += 1;
              setFilesFetched(attempted);
              setProgressPercent(Math.round((attempted / DEFAULT_DATA_FILES.length) * 50));
              console.warn(`Error fetching ${baseName}:`, err);
            }
          }
        }

  if (files.length === 0) throw new Error("No dataset files found in public assets");
  setLoadingPhase("Parsing CSV files...");
  setProgressPercent(60);
  const rows = await parseCsvFiles(files);
  setProgressPercent(95);
  loadRows(rows);
  setProgressPercent(100);
      } catch (error) {
        console.warn("Unable to load default dataset automatically", error);
      } finally {
        // give UI a moment to show 100%
        setTimeout(() => {
          setLoading(false);
          setLoadingPhase(null);
          setTotalFiles(0);
          setFilesFetched(0);
          setProgressPercent(0);
        }, 300);
      }
    };
    void bootstrap();
  }, [courseList.length, loadRows]);

  const topTen = useMemo(() => visibleCourses.slice(0, 10), [visibleCourses]);
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(visibleCourses.length / PAGE_SIZE));
  const pageItems = useMemo(() => visibleCourses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [visibleCourses, page]);
  useEffect(() => {
    // reset to first page when the filter/search results change
    setPage(0);
  }, [visibleCourses]);

  if (loading && courseList.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <div className="w-full max-w-xl">
          <div className="text-sm text-foreground/70 mb-2">{loadingPhase ?? "Loading dataset..."}</div>
          <div className="w-full bg-muted/20 h-3 rounded overflow-hidden">
            <div
              className="h-3 bg-accent"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-foreground/60">
            {totalFiles > 0 ? `Files: ${filesFetched} / ${totalFiles}` : null}
          </div>
        </div>
        <div className="text-sm text-foreground/60">If this takes a while, make sure the cleaned CSVs are present in /public/cleaned/</div>
      </div>
    );
  }

  if (courseList.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <TopControls />
        <div className="card-surface flex flex-col items-center gap-4 p-12 text-center">
          <h2 className="text-2xl font-semibold text-foreground">No data available</h2>
          <p className="max-w-xl text-sm text-foreground/60">
            The app attempts to load the packaged dataset automatically from
            <code>/classie_evaluations_with_sbc_part1.csv</code> (and related parts).
            If you see this message the default dataset could not be loaded. Please ensure
            the files are present in the `frontend/public` directory and the dev server is serving static assets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <TopControls />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((course, index) => (
          <CourseCard key={course.courseCode} course={course} rank={page * PAGE_SIZE + index + 1} />
        ))}
      </section>

      {visibleCourses.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between gap-4">
          <div className="card-surface p-6 text-sm text-foreground/50">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleCourses.length)} of <span className="text-accent">{visibleCourses.length}</span> matches.
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-border/30 bg-transparent px-3 py-1 text-sm disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <div className="text-sm text-foreground/60">Page {page + 1} / {pageCount}</div>
            <button
              className="rounded-md bg-accent px-3 py-1 text-sm text-background disabled:opacity-40"
              disabled={(page + 1) >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

