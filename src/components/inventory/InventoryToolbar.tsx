import React from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CategoryOption {
  id: string;
  name: string;
  name_ar?: string | null;
}

interface InventoryToolbarProps {
  lang: "en" | "ar";
  search: string;
  onSearchChange: (val: string) => void;
  selectedCategory: string;
  onCategoryChange: (val: string) => void;
  categories: CategoryOption[];
  sortBy: string;
  onSortChange: (val: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export const InventoryToolbar: React.FC<InventoryToolbarProps> = ({
  lang,
  search,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
  sortBy,
  onSortChange,
  activeFilterCount,
  onClearFilters,
}) => {
  const isAr = lang === "ar";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-card p-2 rounded-xl border border-border/60 shadow-2xs">
        {/* Search Input - Flex 1 */}
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              isAr
                ? "ابحث باسم المنتج، SKU، أو الباركوّد..."
                : "Search by product name, SKU, or barcode..."
            }
            className="h-9 ps-9 text-xs bg-background/50 border-border/70"
          />
        </div>

        {/* Category Select */}
        <Select value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger className="h-9 w-36 text-xs border-border/70 hidden sm:flex">
            <SelectValue placeholder={isAr ? "جميع الأقسام" : "All Categories"} />
          </SelectTrigger>
          <SelectContent align={isAr ? "start" : "end"}>
            <SelectItem value="all">{isAr ? "جميع الأقسام" : "All Categories"}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {isAr ? cat.name_ar || cat.name : cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort Select */}
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="h-9 w-32 text-xs border-border/70 hidden md:flex">
            <ArrowUpDown className="h-3 w-3 me-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="newest">{isAr ? "الأحدث" : "Newest"}</SelectItem>
            <SelectItem value="price-asc">
              {isAr ? "السعر: الأدنى" : "Price: Low to High"}
            </SelectItem>
            <SelectItem value="price-desc">
              {isAr ? "السعر: الأعلى" : "Price: High to Low"}
            </SelectItem>
            <SelectItem value="stock-asc">
              {isAr ? "المخزون: الأدنى" : "Stock: Low to High"}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:hidden">
        <Select value={selectedCategory} onValueChange={onCategoryChange}>
          <SelectTrigger className="h-10 min-w-0 text-xs border-border/70">
            <SelectValue placeholder={isAr ? "جميع الأقسام" : "All Categories"} />
          </SelectTrigger>
          <SelectContent align={isAr ? "start" : "end"}>
            <SelectItem value="all">{isAr ? "جميع الأقسام" : "All Categories"}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {isAr ? cat.name_ar || cat.name : cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="h-10 min-w-0 text-xs border-border/70">
            <ArrowUpDown className="me-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align={isAr ? "start" : "end"}>
            <SelectItem value="newest">{isAr ? "الأحدث" : "Newest"}</SelectItem>
            <SelectItem value="price-asc">
              {isAr ? "السعر: الأدنى" : "Price: Low to High"}
            </SelectItem>
            <SelectItem value="price-desc">
              {isAr ? "السعر: الأعلى" : "Price: High to Low"}
            </SelectItem>
            <SelectItem value="stock-asc">
              {isAr ? "المخزون: الأدنى" : "Stock: Low to High"}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[11px] text-muted-foreground font-medium me-1">
            {isAr ? "التصفية النشطة:" : "Active filters:"}
          </span>
          {selectedCategory !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              {isAr ? "القسم:" : "Category:"} {selectedCategory}
              <button
                type="button"
                onClick={() => onCategoryChange("all")}
                aria-label={isAr ? "إزالة تصفية القسم" : "Remove category filter"}
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground font-bold"
          >
            {isAr ? "مسح الكل" : "Clear all"}
          </Button>
        </div>
      )}
    </div>
  );
};
