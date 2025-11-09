import { Link, useLocation } from "react-router-dom";
import { ReactNode, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useCoursesStore } from "@/store/courses";
import { UploadCsvButton } from "@/components/UploadCsvButton";

interface AppShellProps {
  children: ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const location = useLocation();
  const hasData = useCoursesStore((state) => state.courseList.length > 0);

  const breadcrumbs = useMemo(() => {
    if (location.pathname === "/") {
      return "Top 10 Easiest Courses";
    }
    if (location.pathname.startsWith("/course/")) {
      return "Course Details";
    }
    return "";
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-accent/20 p-2">
              <div className="size-full rounded-full bg-accent" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-wide text-foreground">SBU-Recs</h1>
              <p className="text-xs uppercase tracking-[0.3em] text-foreground/50">
                Easy-A Course Recommendations
              </p>
            </div>
          </Link>
          <div className="flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
            <UploadCsvButton />
            {hasData ? (
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link to="/">Back to Top 10</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 pb-16 pt-8">
        <div className="text-sm uppercase tracking-[0.4em] text-foreground/40">{breadcrumbs}</div>
        {children}
      </main>
      <footer className="border-t border-border/40 bg-background/80">
        <div className="mx-auto w-full max-w-7xl px-6 py-6 text-xs text-foreground/50">
          Data from Classie Evals · Easiness scored via Bayesian smoothing · Built for SBU students.
        </div>
      </footer>
    </div>
  );
};

