import React from "react";
import { Search, X, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";

interface CustomersToolbarProps {
  lang: "en" | "ar";
  search: string;
  onSearchChange: (val: string) => void;
  regionFilter: string;
  onRegionChange: (val: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export const CustomersToolbar: React.FC<CustomersToolbarProps> = ({
  lang,
  search,
  onSearchChange,
  regionFilter,
  onRegionChange,
  activeFilterCount,
  onClearFilters,
}) => {
  const isAr = lang === "ar";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl bg-card border border-border/60 shadow-2xs">
      {/* Search Input */}
      <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            isAr
              ? "ابحث باسم العميل، رقم الهاتف، أو البريد الإلكتروني..."
              : "Search customer name, phone, or email..."
          }
          className="ps-9 h-8 text-xs bg-muted/30 border-border/60 focus:bg-background"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={isAr ? "مسح البحث" : "Clear search"}
            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Region Selector & Reset */}
      <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
        <div className="min-w-0 flex-1 sm:w-[180px] sm:flex-none">
          <Select value={regionFilter} onValueChange={onRegionChange}>
            <SelectTrigger className="h-8 text-xs bg-muted/30 border-border/60">
              <div className="flex items-center gap-1.5 truncate">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent align={isAr ? "start" : "end"} className="text-xs">
              <SelectItem value="all">{isAr ? "كل المناطق" : "All Regions"}</SelectItem>
              {BAHRAIN_REGIONS.map((region) => (
                <SelectItem key={region.value} value={region.value}>
                  {isAr ? region.ar : region.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-8 px-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5 me-1" />
            {isAr ? "مسح التصفية" : "Clear"}
          </Button>
        )}
      </div>
    </div>
  );
};
