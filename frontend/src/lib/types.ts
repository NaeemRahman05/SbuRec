export interface CourseRow {
  courseCode: string;
  coursePrefix: string;
  courseNumber: string;
  courseSection: string;
  season: string;
  year: number;
  courseName: string;
  instructor: string;
  url?: string;
  page?: string;
  linkIndex?: string;
  totalStudents: number;
  gradeA: number;
  gradeAminus: number;
  gradeBplus: number;
  gradeB: number;
  gradeBminus: number;
  gradeCplus: number;
  gradeC: number;
  gradeCminus: number;
  gradeD: number;
  gradeF: number;
  overallMean?: number;
  overallStdDev?: number;
  overallResponses?: number;
  studyHoursMean?: number;
  studyHoursStdDev?: number;
  studyHoursResponses?: number;
  attendanceMean?: number;
  attendanceStdDev?: number;
  attendanceResponses?: number;
  valuableComments: string[];
  improvementComments: string[];
  credits: number;
  sbc: string[];
  prerequisites?: string;
  advisory?: string;
}

export interface InstructorAggregate {
  instructor: string;
  totalStudents: number;
  totalA: number;
  aRate: number;
  easeScore: number;
  gradeDist: Record<string, number>;
  sections: CourseRow[];
}

export interface CourseAggregate {
  courseCode: string;
  courseName: string;
  credits: number;
  sbc: string[];
  prerequisites?: string;
  advisory?: string;
  totalStudents: number;
  totalA: number;
  aRate: number;
  easeScore: number;
  instructors: Record<string, InstructorAggregate>;
  seasons: string[];
  years: number[];
  topInstructors: string[];
  bottomInstructors: string[];
}

export interface FiltersState {
  prefixes: string[];
  sbc: string[];
  includeLowCredit: boolean;
  seasons: string[];
  years: number[];
}

export type SortMode =
  | "ease"
  | "students"
  | "code"
  | "name"
  | "sbc";

