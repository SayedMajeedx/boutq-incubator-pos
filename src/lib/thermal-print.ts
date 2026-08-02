import { formatDate, formatMoney } from "@/lib/format";

type ThermalItem = {
  description: string;
  quantity: number;
  unit_price: number;
  customization_total: number;
  line_total: number;
  customizations?: { name: string; price_delta: number }[];
};

type ThermalArgs = {
  brand: string;
  invoiceNumber: string | number;
  orderDate: string;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  items: ThermalItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  shipping: number;
  total: number;
  currency: string;
  lang: "en" | "ar";
  labels: {
    receipt: string;
    invoiceNumber: string;
    date: string;
    status: string;
    payment: string;
    customer: string;
    item: string;
    qty: string;
    price: string;
    total: string;
    subtotal: string;
    discount: string;
    vat: string;
    shipping: string;
    grandTotal: string;
    thankYou: string;
  };
  footerNote?: string | null;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printThermalReceipt(a: ThermalArgs) {
  const isRTL = a.lang === "ar";
  const locale = isRTL ? "ar-BH-u-nu-latn" : "en-US";
  const money = (n: number) => escapeHtml(formatMoney(n, a.currency, locale));

  const itemsHtml = a.items
    .map((it) => {
      const unit = Number(it.unit_price) + Number(it.customization_total);
      const addons =
        (it.customizations ?? []).length > 0
          ? `<div class="addons">${it
              .customizations!.map((c) => `+ ${escapeHtml(c.name)} (${money(c.price_delta)})`)
              .join("<br/>")}</div>`
          : "";
      return `
        <tr>
          <td class="desc">
            <div>${escapeHtml(it.description || "—")}</div>
            ${addons}
          </td>
          <td class="qty">${it.quantity}</td>
          <td class="price">${money(unit)}</td>
          <td class="tot">${money(it.line_total)}</td>
        </tr>`;
    })
    .join("");

  const rows: [string, string][] = [[a.labels.subtotal, money(a.subtotal)]];
  if (a.discount > 0) rows.push([a.labels.discount, `- ${money(a.discount)}`]);
  if (a.taxRate > 0) rows.push([`${a.labels.vat} (${a.taxRate}%)`, money(a.taxAmount)]);
  if (a.shipping > 0) rows.push([a.labels.shipping, money(a.shipping)]);

  const totalsHtml = rows
    .map(([k, v]) => `<div class="row"><span>${escapeHtml(k)}</span><span>${v}</span></div>`)
    .join("");

  const dateStr = escapeHtml(formatDate(a.orderDate, locale));

  const html = `<!doctype html>
<html lang="${a.lang}" dir="${isRTL ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(a.brand)} — #${escapeHtml(String(a.invoiceNumber))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body {
    width: 80mm;
    padding: 4mm 3mm;
    font-family: ${isRTL ? "'Tajawal','Cairo',sans-serif" : "'Menlo','Consolas','Courier New',monospace"};
    font-size: 12px;
    line-height: 1.35;
  }
  .center { text-align: center; }
  .brand { font-size: 18px; font-weight: 700; letter-spacing: 1px; margin: 0; }
  .muted { color: #444; font-size: 11px; }
  hr.dash { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: 11px; }
  .meta div { display: flex; justify-content: space-between; gap: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { padding: 3px 0; vertical-align: top; font-size: 11px; }
  th { text-align: ${isRTL ? "right" : "left"}; border-bottom: 1px solid #000; }
  th.qty, th.price, th.tot, td.qty, td.price, td.tot { text-align: ${isRTL ? "left" : "right"}; white-space: nowrap; }
  td.desc { word-break: break-word; }
  .addons { color: #333; font-size: 10px; margin-top: 2px; }
  .totals { margin-top: 4px; font-size: 12px; }
  .row { display: flex; justify-content: space-between; padding: 2px 0; }
  .grand { border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; font-weight: 700; font-size: 14px; }
  .footer { margin-top: 8px; text-align: center; font-size: 11px; }
  @media print { body { padding: 3mm 2mm; } }
</style>
</head>
<body>
  <div class="center">
    <h1 class="brand">${escapeHtml(a.brand)}</h1>
    ${a.footerNote ? `<div class="muted">${escapeHtml(a.footerNote)}</div>` : ""}
  </div>
  <hr class="dash" />
  <div class="meta">
    <div><span>${escapeHtml(a.labels.invoiceNumber)}</span><span>#${escapeHtml(String(a.invoiceNumber))}</span></div>
    <div><span>${escapeHtml(a.labels.date)}</span><span>${dateStr}</span></div>
    <div><span>${escapeHtml(a.labels.status)}</span><span>${escapeHtml(a.status)}</span></div>
    ${a.paymentMethod ? `<div><span>${escapeHtml(a.labels.payment)}</span><span>${escapeHtml(a.paymentMethod)}</span></div>` : ""}
  </div>
  ${
    a.customerName || a.customerPhone
      ? `<hr class="dash" /><div class="muted"><strong>${escapeHtml(a.labels.customer)}:</strong> ${escapeHtml(a.customerName ?? "")}${a.customerPhone ? `<br/>${escapeHtml(a.customerPhone)}` : ""}</div>`
      : ""
  }
  <hr class="dash" />
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(a.labels.item)}</th>
        <th class="qty">${escapeHtml(a.labels.qty)}</th>
        <th class="price">${escapeHtml(a.labels.price)}</th>
        <th class="tot">${escapeHtml(a.labels.total)}</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>
  <hr class="dash" />
  <div class="totals">
    ${totalsHtml}
    <div class="row grand"><span>${escapeHtml(a.labels.grandTotal)}</span><span>${money(a.total)}</span></div>
  </div>
  <div class="footer">${escapeHtml(a.labels.thankYou)}</div>
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () { window.focus(); window.print(); }, 150);
    });
    window.addEventListener('afterprint', function () { window.close(); });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=380,height=720");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
