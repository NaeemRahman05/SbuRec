import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GradeDistributionChart } from "@/components/GradeDistributionChart";
import { InstructorComparisonChart } from "@/components/InstructorComparisonChart";
import { SectionsTable } from "@/components/SectionsTable";
import { CommentsList } from "@/components/CommentsList";
import { useCoursesStore } from "@/store/courses";
import { formatCredits, formatPercent, formatInstructorList } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export const CourseDetailsPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { aggregates, rows } = useCoursesStore((state) => ({
    aggregates: state.aggregates,
    rows: state.rows,
  }));

  const course = code ? aggregates[decodeURIComponent(code)] : undefined;

  const courseRows = useMemo(
    () =>
      course
        ? rows.filter((row) => row.courseCode === course.courseCode)
        : [],
    [course, rows],
  );

  const gradeDistribution = useMemo(() => {
    const distribution: Record<string, number> = {
      A: 0,
      "A-": 0,
      "B+": 0,
      B: 0,
      "B-": 0,
      "C+": 0,
      C: 0,
      "C-": 0,
      D: 0,
      F: 0,
    };
    courseRows.forEach((row) => {
      distribution["A"] += row.gradeA;
      distribution["A-"] += row.gradeAminus;
      distribution["B+"] += row.gradeBplus;
      distribution["B"] += row.gradeB;
      distribution["B-"] += row.gradeBminus;
      distribution["C+"] += row.gradeCplus;
      distribution["C"] += row.gradeC;
      distribution["C-"] += row.gradeCminus;
      distribution["D"] += row.gradeD;
      distribution["F"] += row.gradeF;
    });
    return distribution;
  }, [courseRows]);

  const topInstructorNames = course?.topInstructors ?? [];
  const bottomInstructors = new Set(course?.bottomInstructors ?? []);

  const attendanceStats = useMemo(() => {
    const means = courseRows
      .map((row) => row.attendanceMean)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const stds = courseRows
      .map((row) => row.attendanceStdDev)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
    return {
      mean: means.length > 0 ? means.reduce((sum, val) => sum + val, 0) / means.length : undefined,
      std: stds.length > 0 ? stds.reduce((sum, val) => sum + val, 0) / stds.length : undefined,
    };
  }, [courseRows]);

  const studyStats = useMemo(() => {
    const means = courseRows
      .map((row) => row.studyHoursMean)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
    const stds = courseRows
      .map((row) => row.studyHoursStdDev)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
    return {
      mean: means.length > 0 ? means.reduce((sum, val) => sum + val, 0) / means.length : undefined,
      std: stds.length > 0 ? stds.reduce((sum, val) => sum + val, 0) / stds.length : undefined,
    };
  }, [courseRows]);

  const downloadCourseCsv = () => {
    if (!course) return;
    const headers = [
      "Course Code",
      "Course Name",
      "Season",
      "Year",
      "Instructor",
      "Total Students",
      "Grade A",
      "Grade A-",
      "Grade B+",
      "Grade B",
      "Grade C+",
      "Grade C",
      "Grade D",
      "Grade F",
      "Valuable Comments",
      "Improvement Comments",
    ];
    const rowsCsv = courseRows
      .map((row) =>
        [
          row.courseCode,
          row.courseName,
          row.season,
          row.year,
          row.instructor,
          row.totalStudents,
          row.gradeA,
          row.gradeAminus,
          row.gradeBplus,
          row.gradeB,
          row.gradeCplus,
          row.gradeC,
          row.gradeD,
          row.gradeF,
          row.valuableComments.join(" | "),
          row.improvementComments.join(" | "),
        ]
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const csv = `${headers.join(",")}\n${rowsCsv}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${course.courseCode.replace(" ", "_")}_sections.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  if (!course) {
    return (
      <div className="card-surface flex flex-col items-center gap-4 p-12 text-center">
        <p className="text-lg font-semibold text-foreground">Course not found.</p>
        <Button variant="primary" onClick={() => navigate("/")}>
          Back to Top 10
        </Button>
      </div>
    );
  }

  const overviewInstructors = topInstructorNames.filter((name) => !bottomInstructors.has(name));

  return (
    <div className="flex flex-col gap-8">
      <section className="card-surface flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold text-foreground">{course.courseCode}</h2>
            <p className="text-lg text-foreground/70">{course.courseName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{formatCredits(course.credits)}</Badge>
            {course.sbc.map((token) => (
              <Badge key={token} variant="default">
                {token}
              </Badge>
            ))}
          </div>
        </div>
        {course.prerequisites ? (
          <p className="text-xs uppercase tracking-wide text-foreground/40">
            Prerequisites: {course.prerequisites}
          </p>
        ) : null}
        {course.advisory ? (
          <p className="text-xs uppercase tracking-wide text-foreground/40">
            Advisory: {course.advisory}
          </p>
        ) : null}
        <div className="grid gap-4 rounded-2xl border border-border/40 bg-muted/30 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-foreground/40">Total Students</p>
            <p className="text-2xl font-semibold text-foreground">{course.totalStudents}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-foreground/40">A-rate</p>
            <p className="text-2xl font-semibold text-foreground">{formatPercent(course.aRate)}</p>
          </div>
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-foreground/40">
              Ease Score
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 text-left text-2xl font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="What is the ease score?"
                >
                  <span className="underline decoration-dotted underline-offset-4">
                    {formatPercent(course.easeScore)}
                  </span>
                  <span className="inline-flex size-6 items-center justify-center rounded-full border border-border/50 bg-muted/40 text-xs font-semibold text-foreground/60">
                    <Info className="h-3.5 w-3.5" />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Ease score blends the share of A grades with enrollment so reliable, larger sections
                earn higher marks than tiny one-off classes.
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-foreground/40">
              Top Instructors (filtered)
            </p>
            <p className="text-sm text-foreground/70">
              {overviewInstructors.length > 0
                ? formatInstructorList(overviewInstructors, 3)
                : "Varied instructors"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" size="sm" onClick={downloadCourseCsv}>
            Download sections CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            Back to rankings
          </Button>
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <GradeDistributionChart distribution={gradeDistribution} />
        <div className="card-surface flex flex-col gap-4 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground/60">
            Study & Attendance
          </h3>
          <div className="grid gap-4 text-sm text-foreground/70">
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground/40">Study Hours</p>
              <p>
                Mean: {studyStats.mean ? studyStats.mean.toFixed(2) : "N/A"} · Std Dev:{" "}
                {studyStats.std ? studyStats.std.toFixed(2) : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground/40">Attendance</p>
              <p>
                Mean: {attendanceStats.mean ? attendanceStats.mean.toFixed(2) : "N/A"} · Std Dev:{" "}
                {attendanceStats.std ? attendanceStats.std.toFixed(2) : "N/A"}
              </p>
            </div>
          </div>
        </div>
      </div>
      <InstructorComparisonChart
        instructors={Object.values(course.instructors).sort(
          (a, b) => b.easeScore - a.easeScore,
        )}
      />
      <SectionsTable course={course} />
      <div className="grid gap-6 md:grid-cols-2">
        <CommentsList rows={courseRows} type="valuable" />
        <CommentsList rows={courseRows} type="improvement" />
      </div>
    </div>
  );
};

