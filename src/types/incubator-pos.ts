export type VendorStatus = 'active' | 'suspended' | 'inactive';

export interface Vendor {
  id: string;
  brand_id?: string | null;
  vendor_code: string;
  name_ar: string;
  name_en: string;
  status: VendorStatus;
  default_commission_bps: number; // 1000 = 10.0%
  created_at: string;
  updated_at: string;
}

export type VendorMemberRole = 'owner' | 'manager' | 'staff';
export type VendorMemberStatus = 'active' | 'inactive';

export interface VendorMember {
  id: string;
  vendor_id: string;
  user_id: string;
  role: VendorMemberRole;
  status: VendorMemberStatus;
  created_at: string;
}

export interface ProductBarcode {
  id: string;
  brand_id?: string | null;
  vendor_id?: string | null;
  variant_id?: string | null;
  code: string; // Formats e.g. [VENDOR_CODE]-[SKU]-[CHECK]
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ContractStatus = 'draft' | 'active' | 'expired' | 'terminated';

export interface VendorContract {
  id: string;
  vendor_id: string;
  rack_number?: string | null;
  monthly_rent: number;
  commission_bps: number;
  start_date: string;
  end_date: string;
  signature_png_url?: string | null;
  pdf_url?: string | null;
  status: ContractStatus;
  created_at: string;
  updated_at: string;
}

export type RentInvoiceStatus = 'pending' | 'paid' | 'deducted_from_sales' | 'overdue' | 'cancelled';

export interface VendorRentInvoice {
  id: string;
  vendor_id: string;
  due_date: string;
  amount: number;
  status: RentInvoiceStatus;
  payment_method?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type POSRegisterStatus = 'active' | 'inactive' | 'maintenance';

export interface POSRegister {
  id: string;
  brand_id?: string | null;
  name: string;
  status: POSRegisterStatus;
  created_at: string;
  updated_at: string;
}

export type POSShiftStatus = 'open' | 'closed' | 'reconciled';

export interface POSShift {
  id: string;
  register_id: string;
  opened_by?: string | null;
  closed_by?: string | null;
  opening_cash_float: number;
  expected_cash?: number | null;
  actual_cash?: number | null;
  cash_variance?: number | null;
  status: POSShiftStatus;
  opened_at: string;
  closed_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}
