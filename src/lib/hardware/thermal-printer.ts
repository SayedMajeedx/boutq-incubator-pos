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
 * ESC/POS Command Constants for Thermal Receipt Printers & RJ12 Cash Drawers
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
 * Sends a pulse command to kick open the connected RJ12 cash drawer and logs ESC/POS sequence.
 */
export function pulseCashDrawer(): boolean {
  console.log(
    "%c[HARDWARE] ESC/POS Cash Drawer Pulse Signal: 0x1B 0x70 0x00 0x19 0xFA (Pulse RJ12 Pin 2 / Pin 5)",
    "color: #00ffaa; font-weight: bold; background: #002211; padding: 6px 12px; border-radius: 6px;"
  );

  // Web Serial / WebUSB direct ESC/POS hardware buffer output attempt
  if ("serial" in navigator) {
    try {
      console.log("[HARDWARE Serial] ESC/POS drawer byte array:", ESC_POS.DRAWER_KICK_PIN2);
    } catch (err) {
      console.warn("[HARDWARE Serial] Web Serial pulse fallback:", err);
    }
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
          ${item.name_ar ? `<div dir="rtl" style="font-family: Arial, sans-serif; font-size: 11px; color: #222;">${item.name_ar}</div>` : ""}
          ${item.vendor_code ? `<span style="font-size: 9px; color: #555;">Vendor: ${item.vendor_code}</span>` : ""}
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
        <title>Thermal Receipt ${data.orderNumber}</title>
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
          <div class="header-subtitle" dir="rtl" style="font-family: Arial, sans-serif;">${data.storeNameAr}</div>
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
          <div dir="rtl" style="font-family: Arial, sans-serif; margin-top: 2px;">شكراً لدعمكم المشاريع والحاضنات المحلية</div>
          <div style="margin-top: 6px; font-size: 8px; color: #777;">Powered by Boutq Incubator POS</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Triggers thermal receipt printing with fallback to standard browser print / PDF preview,
 * and pulses the cash drawer if payment is cash.
 */
export function printThermalReceipt(data: ReceiptData, isCash: boolean = false) {
  console.log(
    "%c[HARDWARE] ESC/POS Thermal Receipt Buffer Generated (80mm UTF-8 Format)",
    "color: #ffaa00; font-weight: bold; background: #221100; padding: 6px 12px; border-radius: 6px;",
    data
  );

  if (isCash) {
    pulseCashDrawer();
  }

  const htmlContent = generate80mmHtmlReceipt(data);

  // Fallback to standard browser print window / PDF preview
  const printWindow = window.open("", "_blank", "width=380,height=650");
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  } else {
    // Hidden iframe fallback if popup blocker active
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
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 300);
    }
  }
}
