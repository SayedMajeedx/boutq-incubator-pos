import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";

interface DatePickerWithRangeProps extends React.HTMLAttributes<HTMLDivElement> {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
}

export function DatePickerWithRange({ className, date, setDate }: DatePickerWithRangeProps) {
  const { lang } = useI18n();
  const datePattern = lang === "ar" ? "dd/MM/yyyy" : "dd MMM yyyy";
  const label = date?.from
    ? date.to
      ? `${format(date.from, datePattern)} – ${format(date.to, datePattern)}`
      : format(date.from, datePattern)
    : lang === "ar"
      ? "اختر الفترة"
      : "Select dates";

  return (
    <div className={cn("w-full sm:w-auto", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-11 w-full justify-start rounded-xl bg-white px-4 text-start font-medium shadow-sm sm:w-[310px]"
          >
            <CalendarIcon className="me-2 h-4 w-4 text-[#6b1d24]" />
            <span className="flex-1 tabular-nums" dir="ltr">
              {label}
            </span>
            <ChevronDown className="ms-2 h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={1}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
