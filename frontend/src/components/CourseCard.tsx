import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CourseAggregate } from "@/lib/types";
import { formatCredits, formatPercent } from "@/lib/format";

interface CourseCardProps {
  course: CourseAggregate;
  rank: number;
}

export const CourseCard = ({ course, rank }: CourseCardProps) => {
  const topInstructorList =
    course.topInstructors.length > 0 ? course.topInstructors.slice(0, 3).join(", ") : "Varied";

  const aRate = formatPercent(course.aRate);
  const topSbc = course.sbc.slice(0, 3);

  return (
    <Link to={`/course/${encodeURIComponent(course.courseCode)}`} className="group">
      <Card className="relative h-full overflow-hidden transition-transform duration-200 group-hover:-translate-y-1 group-hover:border-accent/70">
        <div className="absolute right-6 top-6 flex flex-col items-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-accent/30 bg-accent/15 text-sm font-semibold text-accent shadow-[0_10px_20px_-12px_rgba(239,35,60,0.6)]">
            #{rank}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-[0.35em] text-foreground/40">
            Rank
          </span>
        </div>
        <CardHeader>
          <CardTitle className="text-lg text-foreground">{course.courseCode}</CardTitle>
          <CardDescription className="text-base text-foreground/80">
            {course.courseName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
            <span className="rounded-full border border-border/60 px-3 py-1">
              {formatCredits(course.credits)}
            </span>
            {topSbc.map((token) => (
              <Badge key={token} variant="outline">
                {token}
              </Badge>
            ))}
          </div>
          {course.prerequisites ? (
            <p className="text-xs uppercase tracking-wide text-foreground/40">
              Prereqs: {course.prerequisites}
            </p>
          ) : null}
          <section className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl border border-border/30 bg-muted/20 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.25em] text-foreground/40">A-Rate</p>
              <p className="text-xl font-semibold text-foreground">{aRate}</p>
            </div>
            <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 sm:text-right">
              <p className="text-xs uppercase tracking-[0.25em] text-accent/70">
                Ease score
              </p>
              <p className="text-xl font-semibold text-accent">{formatPercent(course.easeScore)}</p>
            </div>
          </section>
          <div className="mt-3 flex flex-col items-start gap-2 text-xs text-foreground/60 md:flex-row md:items-center md:justify-between">
            <span>{course.totalStudents} students</span>
            <span>Top instructors: {topInstructorList}</span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-border/40">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(Math.min(course.aRate * 100, 100), 0)}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

