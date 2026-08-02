import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

export type UserRole = "super_admin" | "admin" | "brand_admin" | "staff" | "courier";
export type UserStatus = "active" | "inactive";

export const SUPER_ADMIN_EMAIL = "majeed@hotmail.it";

export type BrandSummary = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  is_active: boolean;
};

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  role: UserRole;
  status: UserStatus;
  brand_id: string | null;
  brand?: BrandSummary | null;
  permissions?: string[] | null;
  created_at: string;
  updated_at: string;
};

type ProfileContextType = {
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isBrandAdmin: boolean;
  isCourier: boolean;
  isActive: boolean;
  profileError: boolean;
  canViewFinancials: boolean;
  hasPermission: (permission: string) => boolean;
  refreshProfile: () => Promise<void>;
  signOutAndRedirect: () => Promise<void>;
};

const ProfileContext = createContext<ProfileContextType | null>(null);

// SECURITY: there is intentionally no "fallback" profile anymore. A user
// without a resolvable profile row gets `profile = null`, which the rest of
// this context (and AppShell) treats as "no access" rather than "admin".
// Failing open here previously meant any hiccup in profile creation silently
// granted platform-wide admin rights.

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const navigate = useNavigate();

  // Admin identities must be provisioned explicitly by an authorized admin.
  // Storefront customers share the Supabase Auth project, so auto-creating a
  // dashboard profile here would incorrectly turn any customer who visits an
  // /admin URL into an active staff identity.
  const ensureProfile = useCallback(
    async (userId: string, email: string): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, brand:brands(id, slug, name_en, name_ar, logo_url, is_active)")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("[ProfileContext] Error fetching profile:", error);
        setProfileError(true);
        return null;
      }

      if (data) {
        return data as Profile;
      }

      console.warn(
        `[ProfileContext] Authenticated account ${email || userId} has no dashboard profile`,
      );
      setProfileError(true);
      return null;
    },
    [],
  );

  const fetchProfile = useCallback(
    async (userId: string): Promise<Profile | null> => {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email || "";
      return ensureProfile(userId, email);
    },
    [ensureProfile],
  );

  const signOutAndRedirect = useCallback(async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }, [navigate]);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(user.id);
    setProfile(p);
  }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        setIsLoading(false);
        return;
      }

      const p = await fetchProfile(user.id);
      if (!mounted) return;
      setProfile(p);
      setIsLoading(false);
    };

    init();

    // Listen for auth state changes
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      (async () => {
        if (event === "SIGNED_OUT" || !session) {
          setProfile(null);
          return;
        }
        const p = await fetchProfile(session.user.id);
        if (mounted) setProfile(p);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Defensive: the fixed super admin is always treated as such client-side too.
  const emailIsSuperAdmin = profile?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
  // SECURITY: all of these now require a resolved profile row with status
  // "active". A null profile (couldn't be found or created) grants nothing.
  const isActive = profile?.status === "active";
  const isSuperAdmin = isActive && (profile?.role === "super_admin" || emailIsSuperAdmin);
  const isBrandAdmin = isActive && profile?.role === "brand_admin";
  const isCourier = isActive && profile?.role === "courier";
  const isAdmin = isActive && (profile?.role === "admin" || isBrandAdmin || isSuperAdmin);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!isActive) return false;
      if (
        profile?.role === "admin" ||
        profile?.role === "brand_admin" ||
        profile?.role === "super_admin" ||
        emailIsSuperAdmin
      ) {
        return true; // Admins automatically possess all permissions.
      }
      const permissions = (profile?.permissions as string[]) || [];
      return permissions.includes(permission);
    },
    [isActive, profile, emailIsSuperAdmin],
  );

  // Only authorized roles or users with explicit financials permission can view financial data
  const canViewFinancials = isActive && (isAdmin || hasPermission("view_financials"));

  return (
    <ProfileContext.Provider
      value={{
        profile,
        isLoading,
        isAdmin,
        isSuperAdmin,
        isBrandAdmin,
        isCourier,
        isActive,
        profileError,
        canViewFinancials,
        hasPermission,
        refreshProfile,
        signOutAndRedirect,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error("useProfile must be used within a ProfileProvider");
  }
  return ctx;
}
