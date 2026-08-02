// Client-only helper: renders an on-screen invoice element into a downloadable
// PDF that mirrors the live preview exactly (colors, fonts, RTL layout).
//
// Uses html2canvas-pro (supports modern CSS color functions like oklch()
// emitted by Tailwind v4) + jsPDF to fit the invoice onto one A4 page.
//
// Mobile fix: on phones the source element renders at the phone's viewport
// width (often ~360px), which makes html2canvas capture a compressed / broken
// layout and forces the PDF into multiple cramped pages. To make the PDF look
// identical on desktop, iOS and Android we clone the element into an
// off-screen container with a FIXED desktop width (800px) before capturing.

const PDF_RENDER_WIDTH_PX = 800;

export async function downloadInvoicePdf(element: HTMLElement | null, filename: string) {
  if (!element || typeof window === "undefined") return;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const safeName = filename.replace(/[^a-zA-Z0-9-_\.\u0600-\u06FF]+/g, "_");
  const finalName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;

  // Build a fixed-width render shell. Mobile browsers still evaluate Tailwind's
  // responsive CSS against the phone viewport, so width alone is not enough: the
  // injected `.pdf-render-root` rules below force the desktop invoice structure
  // in the cloned subtree before html2canvas measures it.
  const style = document.createElement("style");
  style.textContent = `
    .pdf-render-root {
      width: ${PDF_RENDER_WIDTH_PX}px !important;
      min-width: ${PDF_RENDER_WIDTH_PX}px !important;
      max-width: none !important;
      overflow: visible !important;
      box-sizing: border-box !important;
    }
    .pdf-render-root, .pdf-render-root * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .pdf-render-root[dir="rtl"],
    .pdf-render-root[dir="rtl"] * {
      letter-spacing: normal !important;
      text-transform: none !important;
      font-kerning: normal !important;
    }
    .pdf-render-root .pdf-invoice-body {
      padding: 40px !important;
    }
    .pdf-render-root .pdf-invoice-header {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      align-items: flex-start !important;
      justify-content: space-between !important;
      gap: 40px !important;
      margin-bottom: 40px !important;
    }
    .pdf-render-root .pdf-brand-block,
    .pdf-render-root .pdf-meta-block {
      width: calc(50% - 20px) !important;
      min-width: 0 !important;
      max-width: calc(50% - 20px) !important;
      flex: 0 0 calc(50% - 20px) !important;
    }
    .pdf-render-root .pdf-brand-block { text-align: start !important; }
    .pdf-render-root .pdf-meta-block { text-align: end !important; }
    .pdf-render-root .pdf-brand-logo-wrap {
      display: flex !important;
      justify-content: flex-start !important;
    }
    .pdf-render-root .pdf-brand-logo {
      max-width: 100% !important;
      object-fit: contain !important;
    }
    .pdf-render-root .pdf-table-wrap {
      margin-left: 0 !important;
      margin-right: 0 !important;
      overflow: visible !important;
    }
    .pdf-render-root .pdf-line-items {
      width: 100% !important;
      min-width: 0 !important;
    }
    .pdf-render-root .pdf-totals-row {
      display: flex !important;
    }
    .pdf-render-root .pdf-totals-block {
      width: 288px !important;
      max-width: 288px !important;
      flex: 0 0 288px !important;
    }
  `;

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.top = "0";
  wrapper.style.left = "0";
  wrapper.style.zIndex = "-1";
  wrapper.style.pointerEvents = "none";
  wrapper.style.opacity = "1";
  wrapper.style.width = `${PDF_RENDER_WIDTH_PX}px`;
  wrapper.style.minWidth = `${PDF_RENDER_WIDTH_PX}px`;
  wrapper.style.maxWidth = `${PDF_RENDER_WIDTH_PX}px`;
  wrapper.style.overflow = "visible";
  wrapper.style.background = "#ffffff";
  // Preserve RTL/LTR from the source subtree so the Arabic layout mirrors correctly.
  const sourceDir =
    element.getAttribute("dir") ||
    element.closest("[dir]")?.getAttribute("dir") ||
    document.documentElement.getAttribute("dir") ||
    "ltr";
  wrapper.setAttribute("dir", sourceDir);

  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.add("pdf-render-root");
  // Ensure the clone itself fills the fixed-width wrapper so inner responsive
  // classes (sm:*, flex-col on small screens) resolve against a desktop width.
  clone.style.width = `${PDF_RENDER_WIDTH_PX}px`;
  clone.style.maxWidth = "none";
  clone.style.minWidth = `${PDF_RENDER_WIDTH_PX}px`;
  clone.style.margin = "0";

  wrapper.appendChild(style);
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Give the browser a tick to lay out the cloned subtree at the forced width.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await document.fonts?.ready.catch(() => undefined);
    await Promise.all(
      Array.from(clone.querySelectorAll("img")).map(async (img) => {
        const src = img.currentSrc || img.src;
        // Inline remote brand assets before html2canvas runs. A cloned image can
        // otherwise be omitted even though it is visible in the live preview.
        if (src && !src.startsWith("data:") && !src.startsWith("blob:")) {
          try {
            const { getInvoiceAssetDataUrl } = await import("@/lib/invoice-assets.functions");
            img.src = await getInvoiceAssetDataUrl({ data: { url: src } });
          } catch {
            /* keep the original URL as a fallback */
          }
        }
        if (img.complete && img.naturalWidth > 0) return;
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 3000);
          img.addEventListener(
            "load",
            () => {
              window.clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
          img.addEventListener(
            "error",
            () => {
              window.clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
        });
      }),
    );

    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: PDF_RENDER_WIDTH_PX,
      windowHeight: Math.max(clone.scrollHeight, 1200),
      width: PDF_RENDER_WIDTH_PX,
      height: clone.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    // Preserve a readable A4 width and paginate vertically. The previous
    // implementation shrank the entire invoice onto one page, making longer
    // invoices unreadably small.
    const pxPerMm = canvas.width / contentW;
    const pageSliceHeightPx = Math.floor(contentH * pxPerMm);
    let sourceY = 0;
    let pageIndex = 0;
    while (sourceY < canvas.height) {
      const sliceHeight = Math.min(pageSliceHeightPx, canvas.height - sourceY);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const ctx = pageCanvas.getContext("2d");
      if (!ctx) throw new Error("Unable to prepare invoice PDF page");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (pageIndex > 0) pdf.addPage();
      const sliceHeightMm = sliceHeight / pxPerMm;
      pdf.addImage(
        pageCanvas.toDataURL("image/jpeg", 0.94),
        "JPEG",
        margin,
        margin,
        contentW,
        sliceHeightMm,
      );
      sourceY += sliceHeight;
      pageIndex += 1;
    }

    pdf.save(finalName);
  } finally {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  }
}
