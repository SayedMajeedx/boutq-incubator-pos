import React from "react";
import { Search, SlidersHorizontal, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type PaymentMethodFilter = "all" | "benefit" | "cod" | "card";

interface OrdersToolbarProps {
  lang: "en" | "ar";
  search: string;
  onSearchChange: (val: string) => void;
  paymentFilter: string;
  onPaymentFilterChange: (val: string) => void;
  fulfillmentStatusFilter: string;
  onFulfillmentStatusFilterChange: (val: string) => void;
  fulfillmentMethodFilter: string;
  onFulfillmentMethodFilterChange: (val: string) => void;
  gatewayFilter: PaymentMethodFilter;
  onGatewayFilterChange: (val: PaymentMethodFilter) => void;
  includeHistorical: boolean;
  onIncludeHistoricalChange: (val: boolean) => void;
  sortOrder: "newest" | "oldest";
  onSortOrderChange: (val: "newest" | "oldest") => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export const OrdersToolbar: React.FC<OrdersToolbarProps> = ({
  lang,
  search,
  onSearchChange,
  paymentFilter,
  onPaymentFilterChange,
  fulfillmentStatusFilter,
  onFulfillmentStatusFilterChange,
  fulfillmentMethodFilter,
  onFulfillmentMethodFilterChange,
  gatewayFilter,
  onGatewayFilterChange,
  includeHistorical,
  onIncludeHistoricalChange,
  sortOrder,
  onSortOrderChange,
  activeFilterCount,
  onClearFilters,
}) => {
  const isAr = lang === "ar";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 bg-card p-2 rounded-xl border border-border/60 shadow-2xs">
        {/* Search Bar - Flex 1 */}
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={
              isAr
                ? "ابحث برقم الفاتورة، العميل، أو الهاتف..."
                : "Search invoice, customer, or phone..."
            }
            className="h-9 ps-9 text-xs bg-background/50 border-border/70"
          />
        </div>

        {/* Desktop Filter Popover */}
        <div className="hidden sm:block">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                aria-label={isAr ? "فتح خيارات التصفية" : "Open filter options"}
                variant={activeFilterCount > 0 ? "default" : "outline"}
                size="sm"
                className="h-9 gap-1.5 text-xs font-semibold"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>{isAr ? "التصفية" : "Filters"}</span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.2 text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align={isAr ? "start" : "end"} className="w-80 space-y-3 p-4">
              <div className="text-xs font-bold text-foreground">
                {isAr ? "تصفية المتقدمة" : "Advanced Filters"}
              </div>

              {/* Payment Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? "حالة الدفع" : "Payment Status"}
                </label>
                <Select value={paymentFilter} onValueChange={onPaymentFilterChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="unpaid">{isAr ? "غير مدفوع" : "Unpaid"}</SelectItem>
                    <SelectItem value="pending_verification">
                      {isAr ? "بانتظار التحقق" : "Pending Verification"}
                    </SelectItem>
                    <SelectItem value="partial">
                      {isAr ? "مدفوع جزئيًا" : "Partially Paid"}
                    </SelectItem>
                    <SelectItem value="paid">{isAr ? "مدفوع" : "Paid"}</SelectItem>
                    <SelectItem value="refunded">{isAr ? "مسترجع" : "Refunded"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Fulfillment Status Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? "حالة التنفيذ" : "Fulfillment Status"}
                </label>
                <Select
                  value={fulfillmentStatusFilter}
                  onValueChange={onFulfillmentStatusFilterChange}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="on_hold">{isAr ? "قيد الانتظار" : "On Hold"}</SelectItem>
                    <SelectItem value="needs_packing">
                      {isAr ? "بحاجة للتعبئة" : "Needs Packing"}
                    </SelectItem>
                    <SelectItem value="ready_for_pickup">
                      {isAr ? "جاهز للاستلام" : "Ready for Pickup"}
                    </SelectItem>
                    <SelectItem value="out_for_delivery">
                      {isAr ? "خرج للتوصيل" : "Out for Delivery"}
                    </SelectItem>
                    <SelectItem value="completed">
                      {isAr ? "تم التوصيل/الاستلام" : "Delivered/Picked Up"}
                    </SelectItem>
                    <SelectItem value="cancelled">{isAr ? "ملغي" : "Cancelled"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Gateway Filter */}
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  {isAr ? "طريقة الدفع" : "Payment Method"}
                </label>
                <Select
                  value={gatewayFilter}
                  onValueChange={(val) => onGatewayFilterChange(val as PaymentMethodFilter)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="benefit">{isAr ? "بنفت بي" : "BenefitPay"}</SelectItem>
                    <SelectItem value="cod">
                      {isAr ? "الدفع عند الاستلام" : "Cash on Delivery"}
                    </SelectItem>
                    <SelectItem value="card">
                      {isAr ? "بطاقة (أونلاين)" : "Card (Online)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Mobile Filter Sheet */}
        <div className="block sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                aria-label={isAr ? "فتح خيارات التصفية" : "Open filter options"}
                variant={activeFilterCount > 0 ? "default" : "outline"}
                size="sm"
                className="h-9 px-2.5 text-xs font-semibold"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary-foreground/20 px-1 py-0.2 text-[10px]">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="p-4 space-y-4">
              <SheetHeader>
                <SheetTitle className="text-sm font-bold">
                  {isAr ? "خيارات التصفية" : "Filter Options"}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {isAr ? "حالة الدفع" : "Payment Status"}
                  </label>
                  <Select value={paymentFilter} onValueChange={onPaymentFilterChange}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                      <SelectItem value="unpaid">{isAr ? "غير مدفوع" : "Unpaid"}</SelectItem>
                      <SelectItem value="pending_verification">
                        {isAr ? "بانتظار التحقق" : "Pending Verification"}
                      </SelectItem>{" "}
                      <SelectItem value="paid">{isAr ? "مدفوع" : "Paid"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Sort Control */}
        <Select
          value={sortOrder}
          onValueChange={(val) => onSortOrderChange(val as "newest" | "oldest")}
        >
          <SelectTrigger className="h-9 w-28 text-xs border-border/70 hidden md:flex">
            <ArrowUpDown className="h-3 w-3 me-1 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="newest">{isAr ? "الأحدث أولاً" : "Newest First"}</SelectItem>
            <SelectItem value="oldest">{isAr ? "الأقدم أولاً" : "Oldest First"}</SelectItem>
          </SelectContent>
        </Select>

        {/* Historical Switch */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border/60 bg-muted/30 shrink-0">
          <Switch
            id="include-historical-toggle"
            aria-label={isAr ? "تضمين الطلبات المؤرشفة" : "Include archived orders"}
            checked={includeHistorical}
            onCheckedChange={onIncludeHistoricalChange}
          />
          <label
            htmlFor="include-historical-toggle"
            className="text-[10px] font-bold text-muted-foreground cursor-pointer whitespace-nowrap hidden sm:inline"
          >
            {isAr ? "الأرشيف" : "Archive"}
          </label>
        </div>
      </div>

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[11px] text-muted-foreground font-medium me-1">
            {isAr ? "التصفية النشطة:" : "Active filters:"}
          </span>
          {paymentFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              {isAr ? "الدفع:" : "Payment:"} {paymentFilter}
              <button
                type="button"
                onClick={() => onPaymentFilterChange("all")}
                className="hover:text-primary/70"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {fulfillmentStatusFilter !== "all" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
              {isAr ? "التنفيذ:" : "Fulfillment:"} {fulfillmentStatusFilter}
              <button
                type="button"
                onClick={() => onFulfillmentStatusFilterChange("all")}
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
