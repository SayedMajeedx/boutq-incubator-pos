type OrderCustomerSource = {
  customer_name_snapshot?: string | null;
  customer_email_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  billing_name?: string | null;
  shipping_name?: string | null;
  customer?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  customers?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

export function getOrderCustomerName(order: OrderCustomerSource): string {
  const name =
    order.customer_name_snapshot?.trim() ||
    order.customers?.name?.trim() ||
    order.customer_name?.trim() ||
    order.customer?.name?.trim() ||
    order.billing_name?.trim() ||
    order.shipping_name?.trim() ||
    "";
  return name;
}

export function getOrderCustomerEmail(order: OrderCustomerSource): string {
  return (
    order.customer_email_snapshot?.trim() ||
    order.customers?.email?.trim() ||
    order.customer_email?.trim() ||
    order.customer?.email?.trim() ||
    ""
  );
}

export function getOrderCustomerPhone(order: OrderCustomerSource): string {
  return (
    order.customer_phone_snapshot?.trim() ||
    order.customers?.phone?.trim() ||
    order.customer_phone?.trim() ||
    order.customer?.phone?.trim() ||
    ""
  );
}

export function getOrderCustomerContact(order: OrderCustomerSource) {
  return {
    name: getOrderCustomerName(order),
    email: getOrderCustomerEmail(order),
    phone: getOrderCustomerPhone(order),
  };
}
