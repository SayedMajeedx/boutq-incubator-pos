import { Mail, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CommunicationsCommandHeaderProps {
  lang: "ar" | "en";
  brandName: string;
  recipientCount: number;
  onAddRecipient: () => void;
}

export function CommunicationsCommandHeader({
  lang,
  brandName,
  recipientCount,
  onAddRecipient,
}: CommunicationsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span>{isAr ? "مركز الإشعارات والبريد" : "COMMUNICATIONS & ALERT HUB"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {brandName}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
            <span>{isAr ? "سجل المراسلات وتنبيهات الإدارة" : "Outbound Logs & Admin Alerts"}</span>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border/60 rounded-full">
              {recipientCount} {isAr ? "مستلمين" : "recipients"}
            </span>
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "إدارة مستلمي تنبيهات الطلبات والمدفوعات، ومتابعة سجل رسائل البريد الإلكتروني الصادرة."
              : "Manage operational alert recipients and audit outbound transactional email activity logs."}
          </p>
        </div>

        <Button
          type="button"
          onClick={onAddRecipient}
          className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold self-start sm:self-center"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{isAr ? "+ إضافة مستلم تنبيهات" : "+ Add Alert Recipient"}</span>
        </Button>
      </div>
    </div>
  );
}
