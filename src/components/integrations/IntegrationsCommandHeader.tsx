import { Plug, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface IntegrationsCommandHeaderProps {
  lang: "ar" | "en";
  brandName: string;
  integrationCount: number;
  onNewIntegration: () => void;
}

export function IntegrationsCommandHeader({
  lang,
  brandName,
  integrationCount,
  onNewIntegration,
}: IntegrationsCommandHeaderProps) {
  const isAr = lang === "ar";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-card p-4 sm:p-5 shadow-sm">
      {/* Background Mesh */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary tracking-wide">
            <Plug className="h-3.5 w-3.5 shrink-0" />
            <span>
              {isAr ? "التكاملات والربط البرمجي WEBHOOKS" : "INTEGRATIONS & WEBHOOKS HUB"}
            </span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold">
              {brandName}
            </span>
          </div>

          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl flex items-center gap-2">
            <span>{isAr ? "التكاملات وبوابات الربط" : "Integrations & API Keys"}</span>
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-bold bg-muted text-foreground border border-border/60 rounded-full">
              {integrationCount} {isAr ? "تكاملات" : "integrations"}
            </span>
          </h1>

          <p className="text-xs text-muted-foreground max-w-xl">
            {isAr
              ? "ربط بوابات الدفع الإلكتروني (بينفت، Tap، Stripe)، شركات الشحن (أرامكس)، الذكاء الاصطناعي، وبيكسلات التتبع."
              : "Connect payment gateways (BenefitPay, Tap, Stripe), shipping couriers (Aramex), AI models, and tracking pixels."}
          </p>
        </div>

        <Button
          type="button"
          onClick={onNewIntegration}
          className="w-full shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-1.5 text-xs font-bold sm:w-auto sm:self-center"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{isAr ? "+ إضافة ربط جديد" : "+ Add Integration"}</span>
        </Button>
      </div>
    </div>
  );
}
