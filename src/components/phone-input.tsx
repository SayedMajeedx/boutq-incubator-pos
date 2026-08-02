import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const COUNTRIES = [
  { code: "+973", label: "🇧🇭 +973" },
  { code: "+966", label: "🇸🇦 +966" },
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+965", label: "🇰🇼 +965" },
  { code: "+974", label: "🇶🇦 +974" },
  { code: "+968", label: "🇴🇲 +968" },
];
const DEFAULT_CODE = "+973";

function parse(value: string | null | undefined): { code: string; local: string } {
  const v = (value ?? "").trim();
  if (!v) return { code: DEFAULT_CODE, local: "" };
  const normalized = v.startsWith("00") ? "+" + v.slice(2) : v;
  const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  for (const c of sorted) {
    if (normalized.startsWith(c.code)) {
      return { code: c.code, local: normalized.slice(c.code.length).replace(/\D/g, "") };
    }
  }
  const digits = normalized.replace(/\D/g, "");
  return { code: DEFAULT_CODE, local: digits };
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  id,
  name,
}: {
  value: string | null | undefined;
  onChange: (fullE164: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
}) {
  const { code, local } = parse(value);

  const emit = (nextCode: string, nextLocal: string) => {
    const digits = nextLocal.replace(/\D/g, "");
    onChange(digits ? `${nextCode}${digits}` : "");
  };

  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      <Select
        name={name ? `${name}-country-code` : undefined}
        value={code}
        onValueChange={(v) => emit(v, local)}
      >
        <SelectTrigger aria-label="Country code" className="h-11 w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRIES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        name={name}
        className="h-11 flex-1 text-left"
        dir="ltr"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder ?? "12345678"}
        value={local}
        onChange={(e) => emit(code, e.target.value)}
      />
    </div>
  );
}
