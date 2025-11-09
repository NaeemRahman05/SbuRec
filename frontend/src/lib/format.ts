export function formatCourseCode(code: string): string {
  return code.trim().replace(/\s+/g, " ");
}

export function formatNumber(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "N/A";
}

export function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "N/A";
}

export function formatCredits(credits: number): string {
  return `${credits} credit${credits === 1 ? "" : "s"}`;
}

export function formatInstructorList(instructors: string[], max = 2): string {
  if (instructors.length <= max) {
    return instructors.join(", ");
  }
  const slice = instructors.slice(0, max).join(", ");
  return `${slice} +${instructors.length - max}`;
}

