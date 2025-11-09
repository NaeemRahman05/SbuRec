import {
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { InstructorAggregate } from "@/lib/types";
import { formatPercent } from "@/lib/format";

interface InstructorComparisonChartProps {
  instructors: InstructorAggregate[];
}

export const InstructorComparisonChart = ({ instructors }: InstructorComparisonChartProps) => {
  const sorted = [...instructors].sort((a, b) => b.easeScore - a.easeScore);
  const data = sorted.map((inst) => ({
    name: inst.instructor,
    students: inst.totalStudents,
    ease: Number((inst.easeScore * 100).toFixed(2)),
  }));

  return (
    <div className="card-surface grid gap-4 p-6 md:grid-cols-2">
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-foreground/60">
          Instructor Students
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2024" />
            <XAxis dataKey="name" stroke="#666" />
            <YAxis stroke="#666" />
            <Tooltip
              cursor={{ fill: "rgba(239,35,60,0.1)" }}
              contentStyle={{
                backgroundColor: "#141518",
                borderRadius: "0.75rem",
                border: "1px solid #27292f",
              }}
            />
            <Legend />
            <Bar dataKey="students" name="Students" fill="#ff2d4a" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-widest text-foreground/60">
          Instructor Easiness Score
        </h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2024" />
            <XAxis dataKey="name" stroke="#666" />
            <YAxis stroke="#666" tickFormatter={(value) => formatPercent(value / 100)} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#141518",
                borderRadius: "0.75rem",
                border: "1px solid #27292f",
              }}
              formatter={(value: number) => formatPercent(value / 100)}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="ease"
              name="Ease Score"
              stroke="#ef233c"
              strokeWidth={2}
              dot={{ r: 4, stroke: "#fff", fill: "#ef233c" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

