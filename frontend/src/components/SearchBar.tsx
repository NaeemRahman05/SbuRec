import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { useCoursesStore } from "@/store/courses";
import { Search } from "lucide-react";

export const SearchBar = () => {
  const [localValue, setLocalValue] = useState(() => useCoursesStore.getState().search);
  const setSearch = useCoursesStore((state) => state.setSearch);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setSearch(localValue);
    }, 250);
    return () => window.clearTimeout(handler);
  }, [localValue, setSearch]);

  return (
    <div className="flex flex-1 items-center gap-3 rounded-full border border-border/40 bg-muted/40 px-4 py-2">
      <Search className="h-4 w-4 text-foreground/40" />
      <Input
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
        placeholder="Search courses, instructors, SBC tags..."
        className="border-none bg-transparent px-0 text-sm outline-none focus-visible:ring-0"
      />
    </div>
  );
};

