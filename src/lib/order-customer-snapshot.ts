type OrderCustomerSource = {
  customer_name_snapshot?: string | null;
  customer_email_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  customers?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

export function getOrderCustomerName(order: OrderCustomerSource): string {
  return order.customer_name_snapshot?.trim() || order.customers?.name?.trim() || "";
}

export function getOrderCustomerEmail(order: OrderCustomerSource): string {
  return order.customer_email_snapshot?.trim() || order.customers?.email?.trim() || "";
}

export function getOrderCustomerPhone(order: OrderCustomerSource): string {
  return order.customer_phone_snapshot?.trim() || order.customers?.phone?.trim() || "";
}

export function getOrderCustomerContact(order: OrderCustomerSource) {
  return {
    name: getOrderCustomerName(order),
    email: getOrderCustomerEmail(order),
    phone: getOrderCustomerPhone(order),
  };
}
