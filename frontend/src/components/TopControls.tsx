import { SearchBar } from "@/components/SearchBar";
import { SortMenu } from "@/components/SortMenu";
import { FiltersSheet } from "@/components/FiltersSheet";

export const TopControls = () => {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border/40 bg-muted/30 p-4 shadow-card md:flex-row md:items-center">
      <div className="w-full">
        <SearchBar />
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <SortMenu />
        <FiltersSheet />
      </div>
    </div>
  );
};

