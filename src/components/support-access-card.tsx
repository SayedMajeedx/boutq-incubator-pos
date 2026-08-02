import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Loader2, ShieldAlert, CheckCircle2, History, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { getTenantAuditLogs, toggleSupportAccess } from "@/lib/impersonation.functions";

type SupportAccessCardProps = {
  brand: {
    id: string;
    support_access_enabled?: boolean | null;
  };
};

export function SupportAccessCard({ brand }: SupportAccessCardProps) {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [accessEnabled, setAccessEnabled] = useState(brand.support_access_enabled !== false);

  // Synchronize state when brand prop updates
  useEffect(() => {
    setAccessEnabled(brand.support_access_enabled !== false);
  }, [brand.support_access_enabled]);

  // Query audit logs using the secure server function
  const {
    data: auditLogs,
    isLoading: loadingLogs,
    error: logsError,
  } = useQuery({
    queryKey: ["tenant-audit-logs", brand.id],
    queryFn: async () => {
      // Calls the server function directly!
      return await getTenantAuditLogs({ data: { brandId: brand.id } });
    },
  });

  // Mutation to toggle support access
  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return await toggleSupportAccess({ data: { brandId: brand.id, enabled } });
    },
    onSuccess: (_, enabled) => {
      toast.success(
        lang === "ar"
          ? enabled
            ? "تم تمكين وصول الدعم الفني بنجاح"
            : "تم تعطيل وصول الدعم الفني"
          : enabled
            ? "Technical support access enabled successfully."
            : "Technical support access disabled.",
      );
      qc.invalidateQueries({ queryKey: ["business-settings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update support access.");
      // Rollback local state
      setAccessEnabled(!accessEnabled);
    },
  });

  const handleToggle = (checked: boolean) => {
    setAccessEnabled(checked);
    toggleMutation.mutate(checked);
  };

  return (
    <div className="space-y-6">
      {/* Support Access Control Toggle Card */}
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm relative">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-display font-medium text-foreground flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                <span>
                  {lang === "ar"
                    ? "وصول الدعم الفني لبوتك"
                    : "Allow Boutq Technical Support Access"}
                </span>
              </CardTitle>
              <CardDescription className="text-xs max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "قم بتمكين هذا الخيار للسماح لمسؤولو منصة بوتك بالدخول مؤقتاً إلى لوحة تحكم متجرك لحل المشاكل التقنية أو تنفيذ ميزات مخصصة."
                  : "Enable this toggle to allow Boutq platform administrators to temporarily access your store dashboard for remote troubleshooting and custom feature implementation."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-center">
              {toggleMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              <Switch
                checked={accessEnabled}
                onCheckedChange={handleToggle}
                disabled={toggleMutation.isPending}
                id="support-access-toggle"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-zinc-100/50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/50 text-xs text-muted-foreground">
            {accessEnabled ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>
                  {lang === "ar"
                    ? "وصول الدعم الفني نشط حالياً. يمكن لمهندسينا المعتمدين مساعدتك عن بعد."
                    : "Technical support access is currently active. Authorized engineers can assist you remotely."}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                <span>
                  {lang === "ar"
                    ? "وصول الدعم معطل. لن يتمكن مسؤولو المنصة من استكشاف الأخطاء عن بعد وإصلاحها."
                    : "Support access is disabled. Platform administrators will be unable to perform remote troubleshooting."}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Security & Auditing Logs Card */}
      <Card className="overflow-hidden border border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3 border-b border-zinc-100 dark:border-zinc-900/60">
          <CardTitle className="text-base font-display font-medium flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-muted-foreground" />
            <span>{lang === "ar" ? "سجل تدقيق الأمان والوصول" : "Security & Audit Logs"}</span>
          </CardTitle>
          <CardDescription className="text-xs">
            {lang === "ar"
              ? "سجل غير قابل للتعديل يوضح كافة عمليات الدخول ومحاكاة الجلسات التي قام بها مسؤولو المنصة."
              : "An immutable history trace of all administrative impersonation sessions and support access events."}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingLogs ? (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>
                {lang === "ar" ? "جاري تحميل سجلات التدقيق..." : "Loading security logs..."}
              </span>
            </div>
          ) : logsError ? (
            <div className="p-6 text-center text-xs text-destructive flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>
                {lang === "ar" ? "فشل تحميل سجلات التدقيق." : "Failed to load audit logs."}
              </span>
            </div>
          ) : !auditLogs || auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {lang === "ar"
                ? "لا توجد سجلات دخول سابقة."
                : "No prior access events logged for this store."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/80 text-muted-foreground font-medium">
                    <th className="p-3.5 pl-6">
                      {lang === "ar" ? "المهندس / المسؤول" : "Operator / Engineer"}
                    </th>
                    <th className="p-3.5">{lang === "ar" ? "نوع الإجراء" : "Action Type"}</th>
                    <th className="p-3.5">
                      {lang === "ar" ? "سبب الدخول" : "Troubleshooting Reason"}
                    </th>
                    <th className="p-3.5 pr-6 text-right">
                      {lang === "ar" ? "التاريخ والوقت" : "Date & Time"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80 font-mono text-[11px]">
                  {auditLogs.map((log: any) => {
                    const formattedDate = new Date(log.created_at).toLocaleString(
                      lang === "ar" ? "ar-BH-u-nu-latn" : "en-US",
                      { dateStyle: "medium", timeStyle: "short" },
                    );

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                      >
                        <td className="p-3.5 pl-6 font-medium text-foreground">
                          <div>{log.operator?.name || "Boutq Support"}</div>
                          <div className="text-[10px] text-muted-foreground font-normal">
                            {log.operator?.email || "support@boutq.store"}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                              log.action_type === "impersonation_start"
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {log.action_type === "impersonation_start"
                              ? "START_SESSION"
                              : "EXIT_SESSION"}
                          </span>
                        </td>
                        <td className="p-3.5 text-muted-foreground max-w-xs truncate font-sans">
                          {log.reason || "—"}
                        </td>
                        <td className="p-3.5 pr-6 text-right text-muted-foreground whitespace-nowrap">
                          {formattedDate}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
