/**
 * WhatsApp Bill Sharing Helper
 * ─────────────────────────────────────────────────────────────
 * After a bill PDF downloads, the user may optionally share it
 * with the shop owner (client) on WhatsApp. The client's number
 * is hard-coded below.
 *
 * Behavior:
 *   1. On mobile browsers that support navigator.share with files
 *      (Chrome, Edge, Samsung Internet, Safari iOS) — opens the
 *      native share sheet with the PDF attached AND a pre-filled
 *      caption. The user picks WhatsApp → picks the chat → sends.
 *      This is the only path where the PDF is auto-attached.
 *   2. On desktop browsers (no file share support) — opens
 *      https://wa.me/<number>?text=<caption> in a new tab. The
 *      caption message is pre-filled; the user must manually
 *      attach the just-downloaded PDF (which is already in their
 *      Downloads folder).
 *
 * In BOTH cases the client's chat is the target. The caption is
 * a short summary of the bill (customer name, amount, date) so
 * the recipient knows what the bill is for even before opening
 * the PDF.
 */

/** Client's WhatsApp number in international format (no "+", no spaces). */
// Local number 03003966715 → drop leading 0, prepend Pakistan country code 92.
export const CLIENT_WHATSAPP_NUMBER = "923003966715";

/** Client's local number (for display only). */
export const CLIENT_WHATSAPP_DISPLAY = "0300-3966715";

export interface BillShareInfo {
  /** PDF blob returned by jsPDF.output("blob"). */
  blob: Blob;
  /** Filename (without path) — used when constructing the File. */
  fileName: string;
  /** Short human-readable caption for the WhatsApp message. */
  caption: string;
}

/**
 * Open WhatsApp chat with the client's number pre-filled with
 * the caption text. Used as a desktop fallback (user must
 * manually attach the downloaded PDF).
 *
 * MUST be called synchronously from a user-gesture event handler
 * (e.g. onClick) — otherwise the browser's popup blocker will
 * silently swallow the window.open call.
 *
 * Tries window.open first (preserves current tab). If the popup
 * is blocked (window.open returns null), falls back to setting
 * window.location.href so the chat opens in the same tab.
 */
function openWhatsAppChat(caption: string): boolean {
  const url = `https://wa.me/${CLIENT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    caption,
  )}`;
  // Try opening in a new tab. Synchronous — preserves user gesture.
  let win: Window | null = null;
  try {
    win = window.open(url, "_blank");
  } catch {
    // window.open can throw in rare sandboxed environments.
    win = null;
  }
  if (!win) {
    // Popup blocker engaged — fall back to navigating current tab.
    // This is also synchronous so the user gesture still counts.
    window.location.href = url;
  }
  return true;
}

/**
 * Synchronously check whether the Web Share API is available AND
 * can share files. Returns the prepared ShareData if yes, or null
 * if not. This is sync so the caller doesn't lose the user gesture.
 */
function prepareNativeShareData(info: BillShareInfo): ShareData | null {
  if (typeof navigator === "undefined") return null;
  if (!navigator.share || !navigator.canShare) return null;
  try {
    const file = new File([info.blob], info.fileName, {
      type: "application/pdf",
    });
    const shareData: ShareData = {
      files: [file],
      text: info.caption,
      title: "Bill from DANISH CATTLE FEED",
    };
    if (!navigator.canShare(shareData)) return null;
    return shareData;
  } catch {
    return null;
  }
}

/**
 * Share a bill PDF on WhatsApp with the shop owner.
 *
 * CRITICAL: this function is SYNCHRONOUS on the desktop path so
 * the browser's popup blocker doesn't swallow the new-tab open.
 * The mobile path (navigator.share) is fire-and-forget — we kick
 * it off and don't await, because awaiting would also lose the
 * user gesture on devices where share isn't actually supported.
 *
 * Behavior:
 *   1. Mobile (Web Share API with files support): fires
 *      navigator.share() with the PDF attached. The OS share
 *      sheet appears → user picks WhatsApp → user picks chat →
 *      sends. Fire-and-forget — if the user cancels, we don't
 *      also pop a wa.me tab.
 *   2. Desktop / no file share support: synchronously opens
 *      https://wa.me/<number>?text=<caption> in a new tab. The
 *      PDF must be attached manually by the user (it's already
 *      in their Downloads folder from doc.save()).
 *
 * Returns true always — there's no useful failure mode to signal
 * to the caller. Errors are caught and logged to console.
 */
export function shareBillOnWhatsApp(info: BillShareInfo): boolean {
  // Mobile path — prepare the share data synchronously so we
  // don't lose the user gesture.
  const shareData = prepareNativeShareData(info);
  if (shareData) {
    // Fire-and-forget. navigator.share returns a promise that
    // resolves when the user dismisses the share sheet. We don't
    // await it — that would block the call stack and lose the
    // user gesture for any subsequent code (not an issue here
    // since we return immediately, but it's the correct pattern).
    navigator.share(shareData).catch((err: any) => {
      // AbortError = user cancelled the share sheet — no action needed.
      // Any other error (e.g. NotAllowedError on a flaky device) —
      // we can't recover the user gesture here, so just log it.
      if (err?.name !== "AbortError") {
        console.warn("[share-whatsapp] navigator.share failed:", err);
      }
    });
    return true;
  }

  // Desktop path — synchronous, preserves user gesture.
  return openWhatsAppChat(info.caption);
}

/* ── Caption builders ──────────────────────────────────────
 * Each bill type has its own caption format. All captions are
 * short enough to fit in a WhatsApp text bubble and include the
 * key numbers so the recipient can identify the bill without
 * opening the PDF.
 */

export function buildCustomerBillCaption(params: {
  customerName: string;
  generatedAt: string;
  totalBill: number;
  cashPaid: number;
  balanceDue: number;
  advancePayment?: number;
}): string {
  const { customerName, generatedAt, totalBill, cashPaid, balanceDue, advancePayment } = params;
  const lines = [
    "🧾 *Bill from DANISH CATTLE FEED*",
    `Customer: ${customerName || "—"}`,
    `Date: ${generatedAt}`,
    `Total Bill: Rs. ${totalBill.toLocaleString("en-PK")}`,
    `Cash Paid: Rs. ${cashPaid.toLocaleString("en-PK")}`,
  ];
  if (advancePayment && advancePayment > 0) {
    lines.push(`Advance Paid: Rs. ${advancePayment.toLocaleString("en-PK")}`);
  }
  lines.push(`*Balance Due: Rs. ${balanceDue.toLocaleString("en-PK")}*`);
  lines.push("\n(PDF bill attached 👆)");
  return lines.join("\n");
}

export function buildMixBillCaption(params: {
  orderId: string;
  customerName: string;
  orderDate: string;
  grandTotal: number;
  cashReceived?: number;
  driverName?: string | null;
}): string {
  const { orderId, customerName, orderDate, grandTotal, cashReceived, driverName } = params;
  const lines = [
    "🧾 *Mix Order Bill from DANISH CATTLE FEED*",
    `Order #: ${orderId}`,
    `Customer: ${customerName || "—"}`,
    `Date: ${orderDate}`,
  ];
  if (driverName) lines.push(`Driver: ${driverName}`);
  lines.push(`*Grand Total: Rs. ${grandTotal.toLocaleString("en-PK")}*`);
  if (cashReceived !== undefined) {
    const change = cashReceived - grandTotal;
    lines.push(`Cash Received: Rs. ${cashReceived.toLocaleString("en-PK")}`);
    if (change >= 0) {
      lines.push(`Change: Rs. ${change.toLocaleString("en-PK")}`);
    }
  }
  lines.push("\n(PDF bill attached 👆)");
  return lines.join("\n");
}

export function buildPurchaseBillCaption(params: {
  billId: number | string;
  counterpartyName: string;
  counterpartyType: string; // "Supplier" | "Credit Customer" | "Cash Customer"
  date: string;
  totalAmount: number;
  cashPaid: number;
  pending: number;
  status: string;
  productName?: string;
}): string {
  const { billId, counterpartyName, counterpartyType, date, totalAmount, cashPaid, pending, status, productName } = params;
  const lines = [
    "🧾 *Purchase Bill from DANISH CATTLE FEED*",
    `Bill #: ${billId}`,
    `${counterpartyType}: ${counterpartyName || "—"}`,
    `Date: ${date}`,
  ];
  if (productName) lines.push(`Product: ${productName}`);
  lines.push(`Total Amount: Rs. ${totalAmount.toLocaleString("en-PK")}`);
  lines.push(`Cash Paid: Rs. ${cashPaid.toLocaleString("en-PK")}`);
  lines.push(`Pending: Rs. ${pending.toLocaleString("en-PK")}`);
  lines.push(`Status: *${status}*`);
  lines.push("\n(PDF bill attached 👆)");
  return lines.join("\n");
}

export function buildPurchaseReceiptCaption(params: {
  receiptId: number | string;
  counterpartyName: string;
  counterpartyType: string;
  date: string;
  cashPaid: number;
  pending: number;
  status: string;
  productName?: string;
}): string {
  const { receiptId, counterpartyName, counterpartyType, date, cashPaid, pending, status, productName } = params;
  const lines = [
    "🧾 *Payment Receipt from DANISH CATTLE FEED*",
    `Receipt #: ${receiptId}`,
    `Paid To (${counterpartyType}): ${counterpartyName || "—"}`,
    `Date: ${date}`,
  ];
  if (productName) lines.push(`Product: ${productName}`);
  lines.push(`*Amount Paid: Rs. ${cashPaid.toLocaleString("en-PK")}*`);
  lines.push(`Pending: Rs. ${pending.toLocaleString("en-PK")}`);
  lines.push(`Status: *${status}*`);
  lines.push("\n(PDF receipt attached 👆)");
  return lines.join("\n");
}
