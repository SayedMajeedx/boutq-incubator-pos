import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Users, Shield, UserX, Check, X, Crown } from "lucide-react";
import { toast } from "sonner";
import { useI18n, useT } from "@/lib/i18n";
import { useProfile, SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { useBrand } from "@/lib/brand-context";
import type { Profile, UserRole, UserStatus } from "@/lib/profile-context";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/team")({
  beforeLoad: async ({ params }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, email")
      .eq("id", user.id)
      .maybeSingle();

    const role = profile?.role;
    const allowed =
      !profile ||
      role === "admin" ||
      role === "super_admin" ||
      role === "brand_admin" ||
      (profile.email || "").toLowerCase() === SUPER_ADMIN_EMAIL;

    if (!allowed) {
      throw redirect({ to: "/admin/b/$slug/dashboard", params: { slug: params.slug } });
    }
    if (profile && profile.status !== "active") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  component: TeamManagement,
});

type StaffMember = Profile;

const USER_MANAGEMENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/user-management`;
const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callUserManagement(action: string, body?: any) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No session");

  const url = new URL(USER_MANAGEMENT_URL);
  url.searchParams.set("action", action);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(SUPABASE_PUBLIC_KEY ? { apikey: SUPABASE_PUBLIC_KEY } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let result: any = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    result = { error: responseText || `Request failed (${response.status})` };
  }
  if (!response.ok) {
    throw new Error(result.error || `Request failed (${response.status})`);
  }
  return result;
}

const AVAILABLE_PERMISSIONS = [
  { id: "manage_inventory", labelEn: "Manage Inventory", labelAr: "إدارة المخزون" },
  { id: "manage_orders", labelEn: "Manage Orders", labelAr: "إدارة الطلبات" },
  { id: "manage_customers", labelEn: "Manage Customers", labelAr: "إدارة العملاء" },
  { id: "view_financials", labelEn: "View Financials", labelAr: "عرض البيانات المالية" },
  { id: "manage_settings", labelEn: "Manage Settings", labelAr: "إدارة الإعدادات" },
];

function TeamManagement() {
  const t = useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const { profile: currentUser, isSuperAdmin } = useProfile();
  const brand = useBrand();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<StaffMember | null>(null);

  const staffQ = useQuery({
    queryKey: ["staff", brand.id, isSuperAdmin],
    queryFn: async () => {
      const result = await callUserManagement("list");
      const list = (result.profiles || []) as StaffMember[];
      // Defense in depth: non-super-admins must never receive or render a
      // super-admin identity, even if a stale backend returns one.
      return list.filter(
        (m) =>
          (m.brand_id === brand.id || (isSuperAdmin && m.role === "super_admin")) &&
          (isSuperAdmin ||
            (m.role !== "super_admin" && m.email.toLowerCase() !== SUPER_ADMIN_EMAIL)),
      );
    },
  });

  const [form, setForm] = useState({
    email: "",
    name: "",
    phone: "",
    password: "",
    role: "staff" as UserRole,
    permissions: [] as string[],
  });

  const resetForm = () => {
    setForm({ email: "", name: "", phone: "", password: "", role: "staff", permissions: [] });
  };

  const handleAdd = async () => {
    if (!form.email.trim()) {
      toast.error(isAr ? "البريد الإلكتروني مطلوب" : "Email is required");
      return;
    }

    try {
      const result = await callUserManagement("create", {
        email: form.email.trim(),
        name: form.name.trim() || undefined,
        phone: form.phone.trim() || undefined,
        password: form.password,
        role: form.role,
        // Attach the new user to the brand this team page is scoped to
        brand_id: form.role === "super_admin" ? null : brand.id,
        permissions: form.role === "staff" ? form.permissions : [],
      });
      toast.success(
        result.linked_existing_identity
          ? isAr
            ? "تم منح حساب العميل الحالي صلاحية الفريق مع الاحتفاظ بكلمة مروره وبياناته"
            : "Team access added to the existing customer account. Its password and customer data were preserved."
          : isAr
            ? "تمت إضافة المستخدم بنجاح"
            : "User added successfully",
      );
      setAddOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل إضافة المستخدم" : "Failed to add user"));
    }
  };

  const handleUpdate = async (
    userId: string,
    updates: {
      role?: UserRole;
      status?: UserStatus;
      name?: string;
      phone?: string | null;
      permissions?: string[];
    },
  ) => {
    try {
      await callUserManagement("update", { userId, ...updates });
      toast.success(isAr ? "تم التحديث بنجاح" : "Updated successfully");
      setEditOpen(false);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل التحديث" : "Failed to update"));
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await callUserManagement("delete", { userId });
      toast.success(isAr ? "تم حذف المستخدم" : "User deleted");
      setDeleteConfirm(null);
      qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل الحذف" : "Failed to delete"));
    }
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setEditPassword("");
    setEditOpen(true);
  };

  const staff = staffQ.data ?? [];
  const locale = isAr ? "ar-BH-u-nu-latn" : "en-US";

  return (
    <div
      className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 animate-fade-in"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight bg-clip-text bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 dark:from-slate-50 dark:to-slate-300">
            {isAr ? "إدارة الموظفين" : "Team Management"}
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm max-w-md">
            {isAr
              ? "أضف وأدِر حسابات الموظفين. فقط المدراء يمكنهم رؤية هذه الصفحة."
              : "Add and manage staff accounts. Only admins can view this page."}
          </p>
        </div>
        <Dialog
          open={addOpen}
          onOpenChange={(v) => {
            setAddOpen(v);
            if (!v) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95 gap-2">
              <Plus className="h-4 w-4" />
              {isAr ? "إضافة موظف" : "Add Staff"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAr ? "إضافة موظف جديد" : "Add New Staff Member"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("customers.name")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Sayeed Majeed"
                />
              </div>
              <div>
                <Label>{t("customers.email")}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. name@example.com"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>
                  {isAr
                    ? "رقم الهاتف / الواتساب (مطلوب للمناديب)"
                    : "Phone / WhatsApp (required for couriers)"}
                </Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="e.g. +973 33000000"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>
                  {isAr ? "كلمة المرور (للحسابات الجديدة فقط)" : "Password (new accounts only)"}
                </Label>
                <Input
                  type="password"
                  className="text-start"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={isAr ? "كلمة مرور مؤقتة" : "Temporary password"}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {isAr
                    ? "اتركها فارغة إذا كان البريد مرتبطاً بحساب عميل حالي؛ لن تتغير كلمة مروره."
                    : "Leave blank when the email belongs to an existing customer; their current password will not change."}
                </p>
              </div>
              <div>
                <Label>{isAr ? "الدور" : "Role"}</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
                >
                  <SelectTrigger className="text-start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {isAr ? "موظف" : "Staff"}
                      </div>
                    </SelectItem>
                    <SelectItem value="courier">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {isAr ? "مندوب توصيل" : "Courier"}
                      </div>
                    </SelectItem>
                    {isSuperAdmin && (
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          {isAr ? "مدير" : "Admin"}
                        </div>
                      </SelectItem>
                    )}
                    {isSuperAdmin && (
                      <SelectItem value="brand_admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                        </div>
                      </SelectItem>
                    )}
                    {isSuperAdmin && (
                      <SelectItem value="super_admin">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4" />
                          {isAr ? "مدير عام" : "Super Admin"}
                        </div>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {form.role === "staff" && (
                <div className="space-y-2">
                  <Label>{isAr ? "الصلاحيات" : "Permissions"}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-secondary/5">
                    {AVAILABLE_PERMISSIONS.map((p) => {
                      const checked = form.permissions.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                            onChange={() => {
                              const newPerms = checked
                                ? form.permissions.filter((x) => x !== p.id)
                                : [...form.permissions, p.id];
                              setForm({ ...form, permissions: newPerms });
                            }}
                          />
                          <span>{isAr ? p.labelAr : p.labelEn}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "سيتمكن المستخدم من تسجيل الدخول فوراً. يمكنه تغيير كلمة المرور لاحقاً."
                  : "The user will be able to sign in immediately. They can change their password later."}
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => {
                  setAddOpen(false);
                  resetForm();
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={handleAdd}>{t("common.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {staff.length === 0 ? (
        <Card className="p-16 text-center border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {isAr ? "لا يوجد موظفين بعد." : "No staff members yet."}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-lg rounded-2xl bg-card/40 backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm lg:min-w-[640px]">
              <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                <tr>
                  <th className="p-4 text-start">{isAr ? "الاسم" : "Name"}</th>
                  <th className="hidden p-4 text-start md:table-cell">
                    {isAr ? "البريد الإلكتروني" : "Email"}
                  </th>
                  <th className="hidden p-4 text-start sm:table-cell">
                    {isAr ? "الهاتف / الواتساب" : "Phone / WhatsApp"}
                  </th>
                  <th className="p-4 text-start">{isAr ? "الدور" : "Role"}</th>
                  <th className="hidden p-4 text-start sm:table-cell">
                    {isAr ? "الحالة" : "Status"}
                  </th>
                  <th className="hidden p-4 text-start lg:table-cell">
                    {isAr ? "تاريخ الإنشاء" : "Created"}
                  </th>
                  <th className="p-4 text-end">{isAr ? "إجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id} className="border-t border-border">
                    <td className="p-4 font-medium">{member.name || member.email.split("@")[0]}</td>
                    <td className="hidden p-4 text-muted-foreground md:table-cell" dir="ltr">
                      {member.email}
                    </td>
                    <td className="hidden p-4 text-muted-foreground sm:table-cell" dir="ltr">
                      {member.phone ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md">
                          📱 {member.phone}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/60 italic">
                          {isAr ? "غير محدد" : "None"}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                          member.role === "super_admin"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : member.role === "brand_admin"
                              ? "bg-blue-500/15 text-blue-700 dark:text-blue-400"
                              : member.role === "admin"
                                ? "bg-primary/10 text-primary"
                                : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {member.role === "super_admin" ? (
                          <>
                            <Crown className="h-3 w-3" />
                            {isAr ? "مدير عام" : "Super Admin"}
                          </>
                        ) : member.role === "brand_admin" ? (
                          <>
                            <Shield className="h-3 w-3" />
                            {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                          </>
                        ) : member.role === "admin" ? (
                          <>
                            <Shield className="h-3 w-3" />
                            {isAr ? "مدير" : "Admin"}
                          </>
                        ) : member.role === "courier" ? (
                          <>
                            <Users className="h-3 w-3" />
                            {isAr ? "مندوب توصيل" : "Courier"}
                          </>
                        ) : (
                          <>
                            <Users className="h-3 w-3" />
                            {isAr ? "موظف" : "Staff"}
                          </>
                        )}
                      </span>
                    </td>

                    <td className="p-4">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                          member.status === "active"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300"
                        }`}
                      >
                        {member.status === "active" ? (
                          <>
                            <Check className="h-3 w-3" />
                            {isAr ? "نشط" : "Active"}
                          </>
                        ) : (
                          <>
                            <X className="h-3 w-3" />
                            {isAr ? "غير نشط" : "Inactive"}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="hidden p-4 text-muted-foreground lg:table-cell">
                      {new Date(member.created_at).toLocaleDateString(locale)}
                    </td>
                    <td className="p-4 text-end">
                      <div className="flex items-center justify-end gap-1">
                        {(() => {
                          const isSelf = member.id === currentUser?.id;
                          const targetIsSuper =
                            member.role === "super_admin" ||
                            member.email.toLowerCase() === SUPER_ADMIN_EMAIL;
                          const canManage = !isSelf && (!targetIsSuper || isSuperAdmin);
                          if (!canManage) {
                            return (
                              <span className="text-xs text-muted-foreground">
                                {isSelf ? (isAr ? "أنت" : "You") : isAr ? "محمي" : "Protected"}
                              </span>
                            );
                          }
                          return (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(member)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {member.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={isAr ? "إلغاء تفعيل الحساب" : "Deactivate account"}
                                  onClick={() => handleUpdate(member.id, { status: "inactive" })}
                                >
                                  <UserX className="h-4 w-4 text-amber-600" />
                                </Button>
                              )}
                              {member.status === "inactive" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title={isAr ? "إعادة تفعيل الحساب" : "Reactivate account"}
                                  onClick={() => handleUpdate(member.id, { status: "active" })}
                                >
                                  <Check className="h-4 w-4 text-emerald-600" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteConfirm(member)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) {
            setEditing(null);
            setEditPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAr ? "تعديل المستخدم" : "Edit User"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>{t("customers.name")}</Label>
                <Input
                  className="text-start"
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <Label>{isAr ? "رقم الهاتف / الواتساب" : "Phone / WhatsApp"}</Label>
                <Input
                  type="tel"
                  className="text-start"
                  value={editing.phone || ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  placeholder="e.g. +973 33000000"
                  dir="ltr"
                />
              </div>
              <div>
                <Label>{isAr ? "الدور" : "Role"}</Label>
                <Select
                  value={editing.role}
                  onValueChange={(v) => setEditing({ ...editing, role: v as UserRole })}
                >
                  <SelectTrigger className="text-start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {isAr ? "موظف" : "Staff"}
                      </div>
                    </SelectItem>
                    <SelectItem value="courier">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        {isAr ? "مندوب توصيل" : "Courier"}
                      </div>
                    </SelectItem>
                    {isSuperAdmin && (
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          {isAr ? "مدير" : "Admin"}
                        </div>
                      </SelectItem>
                    )}
                    {(isSuperAdmin || editing.role === "brand_admin") && (
                      <SelectItem value="brand_admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          {isAr ? "مدير علامة تجارية" : "Brand Admin"}
                        </div>
                      </SelectItem>
                    )}
                    {(isSuperAdmin || editing.role === "super_admin") && (
                      <SelectItem value="super_admin">
                        <div className="flex items-center gap-2">
                          <Crown className="h-4 w-4" />
                          {isAr ? "مدير عام" : "Super Admin"}
                        </div>
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isAr ? "الحالة" : "Status"}</Label>
                <Select
                  value={editing.status}
                  onValueChange={(v) => setEditing({ ...editing, status: v as UserStatus })}
                >
                  <SelectTrigger className="text-start">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-600" />
                        {isAr ? "نشط" : "Active"}
                      </div>
                    </SelectItem>
                    <SelectItem value="inactive">
                      <div className="flex items-center gap-2">
                        <X className="h-4 w-4 text-amber-600" />
                        {isAr ? "غير نشط" : "Inactive"}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.role === "staff" && (
                <div className="space-y-2">
                  <Label>{isAr ? "الصلاحيات" : "Permissions"}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-secondary/5">
                    {AVAILABLE_PERMISSIONS.map((p) => {
                      const memberPerms = (editing as any).permissions || [];
                      const checked = memberPerms.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                            onChange={() => {
                              const newPerms = checked
                                ? memberPerms.filter((x: string) => x !== p.id)
                                : [...memberPerms, p.id];
                              setEditing({ ...editing, permissions: newPerms } as any);
                            }}
                          />
                          <span>{isAr ? p.labelAr : p.labelEn}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <Label>
                  {isAr ? "تعيين كلمة مرور جديدة (اختياري)" : "Set New Password (optional)"}
                </Label>
                <Input
                  type="password"
                  className="text-start"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder={isAr ? "أدخل كلمة مرور جديدة" : "Enter new password"}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEditOpen(false);
                setEditing(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (editing) {
                  handleUpdate(editing.id, {
                    name: editing.name || undefined,
                    phone: editing.phone || null,
                    role: editing.role,
                    status: editing.status,
                    permissions: editing.role === "staff" ? (editing as any).permissions : [],
                    ...(editPassword.trim() ? { password: editPassword.trim() } : {}),
                  });
                }
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(v) => {
          if (!v) setDeleteConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? "حذف المستخدم" : "Delete User"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm && (
                <>
                  {isAr ? (
                    <>
                      هل أنت متأكد من إزالة صلاحية الفريق عن{" "}
                      <strong>{deleteConfirm.name || deleteConfirm.email}</strong>؟
                      <br />
                      إذا كان لديه حساب عميل فسيتم الاحتفاظ بملفه وكلمة مروره وطلباته وعناوينه.
                    </>
                  ) : (
                    <>
                      Are you sure you want to delete{" "}
                      <strong>{deleteConfirm.name || deleteConfirm.email}</strong>?
                      <br />
                      Team access will be removed. If this person also has a customer account, their
                      profile, password, orders, and addresses will be preserved.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
