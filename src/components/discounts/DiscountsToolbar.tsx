import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DiscountsToolbarProps {
  lang: "ar" | "en";
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export function DiscountsToolbar({
  lang,
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  activeFilterCount,
  onClearFilters,
}: DiscountsToolbarProps) {
  const isAr = lang === "ar";

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between p-3 bg-card/60 backdrop-blur-sm border border-border/60 rounded-xl shadow-2xs">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={isAr ? "ابحث برمز الخصم..." : "Search by promo code..."}
            className="ps-9 h-9 text-xs bg-background/80"
          />
        </div>

        {/* Type Selector */}
        <Select value={typeFilter} onValueChange={onTypeFilterChange}>
          <SelectTrigger className="h-9 w-full sm:w-[160px] text-xs font-semibold bg-background/80">
            <SelectValue placeholder={isAr ? "نوع الخصم" : "Discount Type"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isAr ? "جميع الأنواع" : "All Types"}</SelectItem>
            <SelectItem value="percentage">{isAr ? "نسبة مئوية (%)" : "Percentage (%)"}</SelectItem>
            <SelectItem value="fixed">{isAr ? "مبلغ ثابت" : "Fixed Amount"}</SelectItem>
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <X className="h-3.5 w-3.5" />
            <span>{isAr ? "مسح التصفية" : "Clear"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
