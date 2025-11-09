import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface GradeDistributionChartProps {
  distribution: Record<string, number>;
}

const GRADE_ORDER = ["A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F"];

export const GradeDistributionChart = ({ distribution }: GradeDistributionChartProps) => {
  const data = GRADE_ORDER.map((grade) => ({
    grade,
    students: distribution[grade] ?? 0,
  }));

  return (
    <div className="card-surface h-64 p-6">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-foreground/60">
        Grade Distribution
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2024" />
          <XAxis dataKey="grade" stroke="#666" />
          <YAxis stroke="#666" />
          <Tooltip
            cursor={{ fill: "rgba(239,35,60,0.1)" }}
            contentStyle={{ backgroundColor: "#141518", borderRadius: "0.75rem", border: "1px solid #27292f" }}
          />
          <Bar dataKey="students" fill="#ef233c" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

