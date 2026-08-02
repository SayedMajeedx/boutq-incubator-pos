import { Search, Download, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type DatePreset = "today" | "week" | "month" | "custom";

interface ExpensesToolbarProps {
  lang: "ar" | "en";
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (category: string) => void;
  categories: string[];
  datePreset: DatePreset;
  onDatePresetChange: (preset: DatePreset) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
  onDownloadCogsCsv: () => void;
}

export function ExpensesToolbar({
  lang,
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
  datePreset,
  onDatePresetChange,
  activeFilterCount,
  onClearFilters,
  onDownloadCogsCsv,
}: ExpensesToolbarProps) {
  const isAr = lang === "ar";

  const presets: { id: DatePreset; labelAr: string; labelEn: string }[] = [
    { id: "today", labelAr: "اليوم", labelEn: "Today" },
    { id: "week", labelAr: "الأسبوع", labelEn: "This Week" },
    { id: "month", labelAr: "الشهر", labelEn: "This Month" },
    { id: "custom", labelAr: "الكل", labelEn: "All" },
  ];

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between p-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl shadow-2xs">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {/* Date Presets */}
        <div className="grid w-full grid-cols-4 gap-1 rounded-lg border border-border/40 bg-muted/40 p-0.5 sm:flex sm:w-auto sm:items-center">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onDatePresetChange(p.id)}
              className={cn(
                "min-h-9 min-w-0 truncate rounded-md px-1.5 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-all duration-150 cursor-pointer",
                datePreset === p.id
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
              )}
            >
              {isAr ? p.labelAr : p.labelEn}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-full flex-1 sm:min-w-0 sm:max-w-xs">
          <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isAr ? "ابحث بالوصف أو المتجر..." : "Search description or store..."}
            className="ps-9 h-9 text-xs bg-background/80"
          />
        </div>

        {/* Category Dropdown */}
        <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
          <SelectTrigger className="h-10 min-w-0 flex-1 text-xs font-semibold bg-background/80 sm:h-9 sm:w-[150px] sm:flex-none">
            <SelectValue placeholder={isAr ? "جميع التصنيفات" : "All Categories"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "جميع التصنيفات" : "All Categories"}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3.5 w-3.5" />
            <span>{isAr ? "مسح" : "Clear"}</span>
          </Button>
        )}
      </div>

      {/* COGS Exporter */}
      <Button
        variant="outline"
        size="sm"
        onClick={onDownloadCogsCsv}
        className="h-10 w-full text-xs font-bold gap-1.5 sm:h-9 sm:w-auto self-start sm:self-auto border-border/60 hover:bg-muted/40"
      >
        <Download className="h-3.5 w-3.5 text-primary shrink-0" />
        <span>{isAr ? "تصدير تكلفة المبيعات (COGS CSV)" : "Export COGS CSV"}</span>
      </Button>
    </div>
  );
}
