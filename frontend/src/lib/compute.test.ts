import { aggregateCourses, computeGlobalAmean, easeScore, normalizeRow } from "./compute";

const baseRow = {
  "Course Code": "CSE 101",
  "Course Prefix": "CSE",
  "Course Number": "101",
  "Course Section": "01",
  Season: "Fall",
  Year: "2023",
  "Course Name": "Intro to Programming",
  Instructor: "Ada Lovelace",
  URL: "",
  Page: "",
  "Link Index": "",
  "Total Students": "100",
  "Grade A": "50",
  "Grade A-": "10",
  "Grade B+": "20",
  "Grade B": "10",
  "Grade B-": "5",
  "Grade C+": "3",
  "Grade C": "1",
  "Grade C-": "0",
  "Grade D": "1",
  "Grade F": "0",
  "Overall Mean": "4.0",
  "Overall StdDev": "0.5",
  "Overall Responses": "60",
  "StudyHours Mean": "2.5",
  "StudyHours StdDev": "0.5",
  "StudyHours Responses": "60",
  "Attendance Mean": "4.5",
  "Attendance StdDev": "0.2",
  "Attendance Responses": "60",
  "Valuable Comments": "Great course||Loved the projects",
  "Improvement Comments": "More office hours",
  Credits: "4",
  SBC: "STEM+|TECH",
  Prerequisites: "None",
  Advisory: "",
};

describe("compute utilities", () => {
  it("computes global A mean", () => {
    const rows = [
      normalizeRow(baseRow),
      normalizeRow({ ...baseRow, "Grade A": "25", "Grade A-": "5", "Total Students": "50" }),
    ];
    expect(computeGlobalAmean(rows)).toBeCloseTo((60 + 30) / (100 + 50));
  });

  it("applies Bayesian smoothing", () => {
    const global = 0.6;
    const score = easeScore(10, 10, global, 50);
    expect(score).toBeCloseTo((10 + 50 * global) / (10 + 50));
  });

  it("aggregates courses and instructors", () => {
    const rows = [
      normalizeRow(baseRow),
      normalizeRow({
        ...baseRow,
        Instructor: "Grace Hopper",
        "Course Section": "02",
        "Grade A": "40",
        "Grade A-": "5",
        "Total Students": "80",
      }),
    ];
    const agg = aggregateCourses(rows);
    expect(agg.courseList).toHaveLength(1);
    const course = agg.courseList[0];
    expect(course.totalStudents).toBe(180);
    expect(course.totalA).toBe(105);
    expect(Object.keys(course.instructors)).toContain("Ada Lovelace");
    expect(Object.keys(course.instructors)).toContain("Grace Hopper");
  });
});

