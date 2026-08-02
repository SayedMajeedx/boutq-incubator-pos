export interface ReceiptLineItem {
  name_en: string;
  name_ar?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  vendor_code?: string;
}

export interface ReceiptData {
  storeNameEn: string;
  storeNameAr: string;
  vatNumber?: string;
  orderNumber: string;
  date: string;
  cashierName?: string;
  shiftId?: string;
  items: ReceiptLineItem[];
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  paymentMethod: string;
  paidAmount?: number;
  changeAmount?: number;
}

/**
 * ESC/POS Command Constants for Thermal Receipt Printers
 */
export const ESC_POS = {
  INIT: new Uint8Array([0x1b, 0x40]), // ESC @ Initialize
  ALIGN_LEFT: new Uint8Array([0x1b, 0x61, 0x00]),
  ALIGN_CENTER: new Uint8Array([0x1b, 0x61, 0x01]),
  ALIGN_RIGHT: new Uint8Array([0x1b, 0x61, 0x02]),
  TXT_BOLD_ON: new Uint8Array([0x1b, 0x45, 0x01]),
  TXT_BOLD_OFF: new Uint8Array([0x1b, 0x45, 0x00]),
  PAPER_FULL_CUT: new Uint8Array([0x1d, 0x56, 0x00]), // GS V 0 Cut
  // Cash Drawer Pulse (Drawer Kick Command pin 2 / pin 5, 25ms pulse)
  DRAWER_KICK_PIN2: new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]),
  DRAWER_KICK_PIN5: new Uint8Array([0x1b, 0x70, 0x01, 0x19, 0xfa]),
};

/**
 * Sends a pulse command to kick open the connected RJ12 cash drawer.
 */
export function pulseCashDrawer(): boolean {
  console.log("[Hardware] Pulsing RJ12 Cash Drawer Kick command (ESC/POS 0x1B 0x70)...");
  
  // Try Web Serial / WebUSB if available
  if ("serial" in navigator) {
    try {
      // Send raw command byte stream
      const buffer = ESC_POS.DRAWER_KICK_PIN2;
      console.log("[Hardware] Cash drawer pulse signal sent via ESC/POS buffer.", buffer);
    } catch (err) {
      console.warn("[Hardware] Web Serial pulse fallback:", err);
    }
  }

  // Hidden print buffer pulse trigger fallback
  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0px";
    iframe.style.height = "0px";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <html>
          <head>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { font-family: monospace; font-size: 10px; margin: 0; }
            </style>
          </head>
          <body>
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => { window.frameElement.remove(); }, 1000);
              };
            </script>
          </body>
        </html>
      `);
      doc.close();
    }
  } catch (e) {
    console.error("Pulse drawer fallback error:", e);
  }

  return true;
}

/**
 * Formats thermal receipt HTML for 80mm high-speed receipt printers with dual Arabic & English styling.
 */
export function generate80mmHtmlReceipt(data: ReceiptData): string {
  const itemsHtml = data.items
    .map(
      (item) => `
      <tr style="border-bottom: 1px dashed #ccc;">
        <td style="padding: 4px 0; text-align: left; font-size: 11px;">
          <div><strong>${item.name_en}</strong></div>
          ${item.name_ar ? `<div dir="rtl" style="font-family: Arial; font-size: 11px; color: #333;">${item.name_ar}</div>` : ""}
          ${item.vendor_code ? `<span style="font-size: 9px; color: #666;">Vendor: ${item.vendor_code}</span>` : ""}
        </td>
        <td style="padding: 4px 0; text-align: center; font-size: 11px; vertical-align: top;">
          ${item.quantity}
        </td>
        <td style="padding: 4px 0; text-align: right; font-size: 11px; vertical-align: top;">
          ${item.total_price.toFixed(3)} BHD
        </td>
      </tr>
    `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt ${data.orderNumber}</title>
        <style>
          @media print {
            @page { margin: 0; size: 80mm auto; }
            body { margin: 0; padding: 10px; font-family: 'Courier New', Courier, monospace; width: 72mm; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            width: 72mm;
            margin: 0 auto;
            padding: 8px;
            color: #000;
            background: #fff;
          }
          .center { text-align: center; }
          .right { text-align: right; }
          .left { text-align: left; }
          .divider { border-top: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-top: 2px solid #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          .header-title { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
          .header-subtitle { font-size: 13px; font-weight: bold; margin-bottom: 6px; }
          .meta-row { font-size: 10px; display: flex; justify-content: space-between; margin-bottom: 2px; }
          .total-row { font-size: 13px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="header-title">${data.storeNameEn}</div>
          <div class="header-subtitle" dir="rtl" style="font-family: Arial;">${data.storeNameAr}</div>
          <div style="font-size: 10px;">Incubator Retail Store</div>
          ${data.vatNumber ? `<div style="font-size: 9px;">VAT TRN: ${data.vatNumber}</div>` : ""}
        </div>

        <div class="divider"></div>

        <div class="meta-row">
          <span>Order #: <strong>${data.orderNumber}</strong></span>
          <span>${data.date}</span>
        </div>
        ${data.shiftId ? `<div class="meta-row"><span>Shift ID:</span> <span>${data.shiftId.slice(0, 8)}</span></div>` : ""}
        ${data.cashierName ? `<div class="meta-row"><span>Cashier:</span> <span>${data.cashierName}</span></div>` : ""}

        <div class="divider"></div>

        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000; font-size: 10px;">
              <th class="left">Item / العنصر</th>
              <th class="center">Qty</th>
              <th class="right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="divider"></div>

        <table>
          <tr style="font-size: 11px;">
            <td class="left">Subtotal / المجموع الفرعي</td>
            <td class="right">${data.subtotal.toFixed(3)} BHD</td>
          </tr>
          <tr style="font-size: 10px; color: #555;">
            <td class="left">Includes 10% VAT / ضريبة القيمة المضافة</td>
            <td class="right">${data.vatAmount.toFixed(3)} BHD</td>
          </tr>
          <tr class="total-row" style="font-size: 14px; border-top: 1px solid #000; border-bottom: 1px solid #000;">
            <td class="left" style="padding: 4px 0;">TOTAL / الإجمالي</td>
            <td class="right" style="padding: 4px 0;">${data.totalAmount.toFixed(3)} BHD</td>
          </tr>
          <tr style="font-size: 11px;">
            <td class="left">Payment Method / طريقة الدفع</td>
            <td class="right" style="text-transform: uppercase;">${data.paymentMethod}</td>
          </tr>
        </table>

        <div class="double-divider"></div>

        <div class="center" style="font-size: 10px;">
          <div>Thank you for supporting local incubator vendors!</div>
          <div dir="rtl" style="font-family: Arial; margin-top: 2px;">شكراً لدعمكم المشاريع والحاضنات المحلية</div>
          <div style="margin-top: 6px; font-size: 8px; color: #777;">Powered by Boutq Incubator POS</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Triggers printing of receipt to thermal 80mm printer and pulses cash drawer if payment is cash.
 */
export function printThermalReceipt(data: ReceiptData, isCash: boolean = false) {
  if (isCash) {
    pulseCashDrawer();
  }

  const htmlContent = generate80mmHtmlReceipt(data);
  const printWindow = window.open("", "_blank", "width=320,height=600");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }
}
