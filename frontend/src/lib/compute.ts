import type { CourseAggregate, CourseRow, InstructorAggregate } from "./types";

const GRADE_KEYS = [
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D",
  "F",
] as const;

export interface AggregationResult {
  courses: Record<string, CourseAggregate>;
  courseList: CourseAggregate[];
  globalAmean: number;
}

export function computeGlobalAmean(rows: CourseRow[]): number {
  let totalA = 0;
  let totalN = 0;
  for (const row of rows) {
    const a = row.gradeA + row.gradeAminus;
    const n = row.totalStudents;
    if (!Number.isFinite(n) || n <= 0) continue;
    totalA += a;
    totalN += n;
  }
  return totalN > 0 ? totalA / totalN : 0;
}

export function easeScore(totalA: number, totalStudents: number, globalAmean: number, k = 50) {
  if (!Number.isFinite(totalStudents) || totalStudents < 0) {
    return 0;
  }
  return totalStudents + k === 0 ? 0 : (totalA + k * globalAmean) / (totalStudents + k);
}

function buildGradeDist(rows: CourseRow[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const key of GRADE_KEYS) {
    dist[key] = 0;
  }
  for (const row of rows) {
    dist["A"] += row.gradeA;
    dist["A-"] += row.gradeAminus;
    dist["B+"] += row.gradeBplus;
    dist["B"] += row.gradeB;
    dist["B-"] += row.gradeBminus;
    dist["C+"] += row.gradeCplus;
    dist["C"] += row.gradeC;
    dist["C-"] += row.gradeCminus;
    dist["D"] += row.gradeD;
    dist["F"] += row.gradeF;
  }
  return dist;
}

function aggregateInstructor(
  instructor: string,
  rows: CourseRow[],
  globalAmean: number,
): InstructorAggregate {
  let totalStudents = 0;
  let totalA = 0;

  for (const row of rows) {
    totalStudents += row.totalStudents;
    totalA += row.gradeA + row.gradeAminus;
  }

  const aRate = totalStudents > 0 ? totalA / totalStudents : 0;

  return {
    instructor,
    totalStudents,
    totalA,
    aRate,
    easeScore: easeScore(totalA, totalStudents, globalAmean),
    gradeDist: buildGradeDist(rows),
    sections: rows,
  };
}

export function aggregateCourses(rows: CourseRow[]): AggregationResult {
  const cleaned: CourseRow[] = rows.filter((row) => row.totalStudents > 0);
  const globalAmean = computeGlobalAmean(cleaned);
  const courses: Record<string, CourseAggregate> = {};

  const courseGroups = new Map<string, CourseRow[]>();
  for (const row of cleaned) {
    if (!courseGroups.has(row.courseCode)) {
      courseGroups.set(row.courseCode, []);
    }
    courseGroups.get(row.courseCode)!.push(row);
  }

  for (const [courseCode, courseRows] of courseGroups) {
    let totalStudents = 0;
    let totalA = 0;
    const seasons = new Set<string>();
    const years = new Set<number>();

    for (const row of courseRows) {
      totalStudents += row.totalStudents;
      totalA += row.gradeA + row.gradeAminus;
      seasons.add(row.season);
      years.add(row.year);
    }

    const instructorsByName = new Map<string, CourseRow[]>();
    for (const row of courseRows) {
      const key = row.instructor.trim() || "Unknown Instructor";
      if (!instructorsByName.has(key)) {
        instructorsByName.set(key, []);
      }
      instructorsByName.get(key)!.push(row);
    }

    const instructorAggregates: Record<string, InstructorAggregate> = {};
    const instructorScores: number[] = [];
    for (const [name, rowsForInstructor] of instructorsByName) {
      const agg = aggregateInstructor(name, rowsForInstructor, globalAmean);
      instructorAggregates[name] = agg;
      if (agg.totalStudents >= 1) {
        instructorScores.push(agg.easeScore);
      }
    }

    instructorScores.sort((a, b) => b - a);
    const quartileIndex = Math.max(Math.floor(instructorScores.length / 4) - 1, 0);
    const thresholdTop = instructorScores[quartileIndex] ?? 0;
    const thresholdBottom =
      instructorScores[Math.floor((3 * instructorScores.length) / 4)] ?? 0;

    const courseEase = easeScore(totalA, totalStudents, globalAmean);

    const topInstructors = Object.values(instructorAggregates)
      .filter(
        (inst) =>
          inst.totalStudents >= 30 &&
          (inst.easeScore >= courseEase || inst.easeScore >= thresholdTop),
      )
      .sort((a, b) => b.easeScore - a.easeScore)
      .map((inst) => inst.instructor);

    const bottomInstructors = Object.values(instructorAggregates)
      .filter((inst) => inst.easeScore <= thresholdBottom)
      .map((inst) => inst.instructor);

    const seasonList = Array.from(seasons);
    const yearList = Array.from(years);

    const courseAggregate: CourseAggregate = {
      courseCode,
      courseName: courseRows[0].courseName,
      credits: courseRows[0].credits,
      sbc: courseRows[0].sbc,
      prerequisites: courseRows[0].prerequisites,
      advisory: courseRows[0].advisory,
      totalStudents,
      totalA,
      aRate: totalStudents > 0 ? totalA / totalStudents : 0,
      easeScore: courseEase,
      instructors: instructorAggregates,
      seasons: seasonList,
      years: yearList,
      topInstructors,
      bottomInstructors,
    };

    courses[courseCode] = courseAggregate;
  }

  const courseList = Object.values(courses).sort((a, b) => {
    if (b.easeScore !== a.easeScore) return b.easeScore - a.easeScore;
    if (b.totalStudents !== a.totalStudents) return b.totalStudents - a.totalStudents;
    return a.courseCode.localeCompare(b.courseCode);
  });

  return { courses, courseList, globalAmean };
}

export function normalizeCourseCode(prefix: string, number: string): string {
  const cleanPrefix = (prefix || "").toUpperCase().trim();
  const cleanNumber = number.trim();
  if (cleanPrefix && cleanNumber) {
    return `${cleanPrefix} ${cleanNumber}`;
  }
  return `${prefix} ${number}`.trim();
}

const COMMENT_DELIMITERS = ["||", "\n", "\r\n"];

export function splitComments(raw: string | undefined | null): string[] {
  if (!raw) return [];
  let chunks = [raw];
  for (const delimiter of COMMENT_DELIMITERS) {
    if (chunks.length === 1 && raw.includes(delimiter)) {
      chunks = raw.split(delimiter);
    } else if (chunks.length > 1) {
      chunks = chunks.flatMap((chunk) => chunk.split(delimiter));
    }
  }
  return chunks
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length > 0);
}

export function deduplicateRows(rows: CourseRow[]): CourseRow[] {
  const deduped = new Map<string, CourseRow>();
  for (const row of rows) {
    const key = `${row.courseCode}-${row.courseSection}-${row.season}-${row.year}-${row.instructor}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }
    const existingResponses = existing.overallResponses ?? 0;
    const currentResponses = row.overallResponses ?? 0;
    if (currentResponses >= existingResponses) {
      deduped.set(key, row);
    }
  }
  return Array.from(deduped.values());
}

export function normalizeRow(raw: Record<string, string>): CourseRow {
  const toNumber = (value: string | undefined | null): number =>
    value && value.trim().length > 0 ? Number(value) || 0 : 0;

  const courseCode = (raw["Course Code"] || "").trim();
  const coursePrefix = (raw["Course Prefix"] || courseCode.split(/\s+/)[0] || "").trim();
  const courseNumber = (raw["Course Number"] || courseCode.replace(/[^\d]/g, "")).trim();

  const sbcRaw = raw["SBC"] || "";
  const sbcTokens = sbcRaw
    .split(/[,|;]/)
    .map((token) => token.trim())
    .filter(Boolean);

  return {
    courseCode: normalizeCourseCode(coursePrefix, courseNumber || courseCode.split(/\s+/)[1] || ""),
    coursePrefix,
    courseNumber,
    courseSection: (raw["Course Section"] || "").trim(),
    season: (raw["Season"] || "").trim(),
    year: Number(raw["Year"] || "0") || 0,
    courseName: (raw["Course Name"] || "").trim(),
    instructor: (raw["Instructor"] || "").trim(),
    url: raw["URL"]?.trim(),
    page: raw["Page"]?.toString(),
    linkIndex: raw["Link Index"]?.toString(),
    totalStudents: Math.max(toNumber(raw["Total Students"]), 0),
    gradeA: Math.max(toNumber(raw["Grade A"]), 0),
    gradeAminus: Math.max(toNumber(raw["Grade A-"]), 0),
    gradeBplus: Math.max(toNumber(raw["Grade B+"]), 0),
    gradeB: Math.max(toNumber(raw["Grade B"]), 0),
    gradeBminus: Math.max(toNumber(raw["Grade B-"]), 0),
    gradeCplus: Math.max(toNumber(raw["Grade C+"]), 0),
    gradeC: Math.max(toNumber(raw["Grade C"]), 0),
    gradeCminus: Math.max(toNumber(raw["Grade C-"]), 0),
    gradeD: Math.max(toNumber(raw["Grade D"]), 0),
    gradeF: Math.max(toNumber(raw["Grade F"]), 0),
    overallMean: toNumber(raw["Overall Mean"]),
    overallStdDev: toNumber(raw["Overall StdDev"]),
    overallResponses: toNumber(raw["Overall Responses"]),
    studyHoursMean: toNumber(raw["StudyHours Mean"]),
    studyHoursStdDev: toNumber(raw["StudyHours StdDev"]),
    studyHoursResponses: toNumber(raw["StudyHours Responses"]),
    attendanceMean: toNumber(raw["Attendance Mean"]),
    attendanceStdDev: toNumber(raw["Attendance StdDev"]),
    attendanceResponses: toNumber(raw["Attendance Responses"]),
    valuableComments: splitComments(raw["Valuable Comments"]),
    improvementComments: splitComments(raw["Improvement Comments"]),
    credits: toNumber(raw["Credits"]),
    sbc: sbcTokens,
    prerequisites: raw["Prerequisites"]?.trim(),
    advisory: raw["Advisory"]?.trim(),
  };
}

