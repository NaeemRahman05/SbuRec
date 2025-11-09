import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCoursesStore } from "@/store/courses";
import type { SortMode } from "@/lib/types";

const LABELS: Record<SortMode, string> = {
  ease: "Easiness (default)",
  students: "Total Students",
  code: "Course Code (A→Z)",
  name: "Course Name (A→Z)",
  sbc: "SBC",
};

export const SortMenu = () => {
  const sort = useCoursesStore((state) => state.sort);
  const setSort = useCoursesStore((state) => state.setSort);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          Sort: {LABELS[sort]}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className="card-surface mt-2 w-64 border border-border/60 p-2">
        {(Object.keys(LABELS) as SortMode[]).map((mode) => (
          <DropdownMenu.Item
            key={mode}
            className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-foreground/80 outline-none transition hover:bg-border/40 data-[highlighted]:bg-border/40"
            onSelect={() => setSort(mode)}
          >
            {LABELS[mode]}
            {mode === sort ? <span className="text-accent">●</span> : null}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};

