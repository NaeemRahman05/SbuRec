import type { CourseAggregate } from "@/lib/types";
import { formatPercent } from "@/lib/format";

interface SectionsTableProps {
  course: CourseAggregate;
}

export const SectionsTable = ({ course }: SectionsTableProps) => {
  const rows = Object.values(course.instructors).flatMap((inst) =>
    inst.sections.map((section) => ({
      instructor: inst.instructor,
      season: section.season,
      year: section.year,
      students: section.totalStudents,
      aRate:
        section.totalStudents > 0
          ? (section.gradeA + section.gradeAminus) / section.totalStudents
          : 0,
      ease: inst.easeScore,
      grades: {
        A: section.gradeA,
        "A-": section.gradeAminus,
        "B+": section.gradeBplus,
        B: section.gradeB,
        "B-": section.gradeBminus,
        "C+": section.gradeCplus,
        C: section.gradeC,
        "C-": section.gradeCminus,
        D: section.gradeD,
        F: section.gradeF,
      },
    })),
  );

  const sorted = rows.sort((a, b) => b.aRate - a.aRate);

  return (
    <div className="card-surface overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="min-w-full divide-y divide-border/40 text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-[0.2em] text-foreground/50">
          <tr>
            <th className="px-4 py-3 text-left">Offering</th>
            <th className="px-4 py-3 text-left">Instructor</th>
            <th className="px-4 py-3 text-right">Students</th>
            <th className="px-4 py-3 text-right">A-rate</th>
            <th className="px-4 py-3 text-right">Ease Score</th>
            <th className="px-4 py-3 text-right">A</th>
            <th className="px-4 py-3 text-right">A-</th>
            <th className="px-4 py-3 text-right">B+</th>
            <th className="px-4 py-3 text-right">B</th>
            <th className="px-4 py-3 text-right">C+</th>
            <th className="px-4 py-3 text-right">D</th>
            <th className="px-4 py-3 text-right">F</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {sorted.map((row, index) => (
            <tr
              key={`${row.instructor}-${row.season}-${row.year}-${index}`}
              className="hover:bg-border/20"
            >
              <td className="px-4 py-3 font-medium text-foreground/80">
                {row.season} {row.year}
              </td>
              <td className="px-4 py-3 text-foreground/60">{row.instructor}</td>
              <td className="px-4 py-3 text-right text-foreground/70">{row.students}</td>
              <td className="px-4 py-3 text-right text-foreground/70">{formatPercent(row.aRate)}</td>
              <td className="px-4 py-3 text-right text-foreground/70">
                {formatPercent(row.ease)}
              </td>
              <td className="px-4 py-3 text-right text-foreground/60">{row.grades["A"]}</td>
              <td className="px-4 py-3 text-right text-foreground/60">{row.grades["A-"]}</td>
              <td className="px-4 py-3 text-right text-foreground/60">{row.grades["B+"]}</td>
              <td className="px-4 py-3 text-right text-foreground/60">{row.grades["B"]}</td>
              <td className="px-4 py-3 text-right text-foreground/60">{row.grades["C+"]}</td>
              <td className="px-4 py-3 text-right text-foreground/60">{row.grades["D"]}</td>
              <td className="px-4 py-3 text-right text-foreground/60">{row.grades["F"]}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </div>
  );
};

