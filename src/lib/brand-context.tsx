import { createContext, useContext, type ReactNode } from "react";

export type Brand = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  logo_url: string | null;
  favicon_url?: string | null;
  is_active: boolean;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_expires_at?: string | null;
  payment_receipt_url?: string | null;
  payment_receipt_uploaded_at?: string | null;
  custom_domain?: string | null;
  plan_type?: "lifetime" | "trial" | null;
  trial_ends_at?: string | null;
  created_at?: string;
};

const BrandContext = createContext<Brand | null>(null);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  const b = useContext(BrandContext);
  if (!b) throw new Error("useBrand must be used within a BrandProvider (inside /b/$slug/*)");
  return b;
}

export function useBrandOptional(): Brand | null {
  return useContext(BrandContext);
}
