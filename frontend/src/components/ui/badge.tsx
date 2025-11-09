import * as React from "react";
import { clsx } from "clsx";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "success" | "danger";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants: Record<NonNullable<BadgeProps["variant"]>, string> = {
      default: "bg-accent/30 text-accent border border-accent/40",
      outline: "border border-border text-foreground",
      success: "bg-success/10 text-success border border-success/40",
      danger: "bg-danger/10 text-danger border border-danger/40",
    };
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
Badge.displayName = "Badge";

