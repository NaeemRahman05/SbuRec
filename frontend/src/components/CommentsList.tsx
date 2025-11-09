import { useState } from "react";
import type { CourseRow } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface CommentsListProps {
  rows: CourseRow[];
  type: "valuable" | "improvement";
}

const TITLE = {
  valuable: "Valuable Insights",
  improvement: "Areas for Improvement",
};

export const CommentsList = ({ rows, type }: CommentsListProps) => {
  const comments = rows
    .flatMap((row) =>
      (type === "valuable" ? row.valuableComments : row.improvementComments).map((comment) => ({
        comment,
        season: row.season,
        year: row.year,
      })),
    )
    .sort((a, b) => b.comment.length - a.comment.length);

  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? comments : comments.slice(0, 3);

  return (
    <div className="card-surface flex flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground/60">
          {TITLE[type]}
        </h3>
        <Badge variant={type === "valuable" ? "success" : "danger"}>{comments.length}</Badge>
      </header>
      <div className="flex flex-col gap-4 text-sm text-foreground/70">
        {visible.map((item, index) => (
          <div
            key={`${item.comment.slice(0, 16)}-${index}`}
            className="rounded-2xl border border-border/30 bg-muted/30 p-4"
          >
            <div className="mb-2 text-xs uppercase tracking-wide text-foreground/50">
              {item.season} {item.year}
            </div>
            <p className="leading-relaxed text-foreground/80">{item.comment}</p>
          </div>
        ))}
        {comments.length === 0 ? <p className="text-xs text-foreground/40">No comments yet.</p> : null}
      </div>
      {comments.length > 3 ? (
        <button
          onClick={() => setExpanded((state) => !state)}
          className="self-start text-xs font-semibold uppercase tracking-wide text-accent transition hover:text-accent-hover"
        >
          {expanded ? "Show less" : `Show ${comments.length - 3} more`}
        </button>
      ) : null}
    </div>
  );
};

