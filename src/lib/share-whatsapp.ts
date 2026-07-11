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
 * Try to share the PDF + caption via the Web Share API.
 * Returns true if shared successfully, false otherwise (caller
 * should fall back to wa.me link).
 */
async function tryNativeShare(info: BillShareInfo): Promise<boolean> {
  // Feature-detect Web Share API with file support
  if (typeof navigator === "undefined" || !navigator.share) return false;
  if (!navigator.canShare) return false;

  try {
    const file = new File([info.blob], info.fileName, {
      type: "application/pdf",
    });
    const shareData: ShareData = {
      files: [file],
      text: info.caption,
      title: "Bill from DANISH CATTLE FEED",
    };
    if (!navigator.canShare(shareData)) return false;
    await navigator.share(shareData);
    return true;
  } catch (err: any) {
    // User cancelled (AbortError) — treat as "handled" so we don't
    // also pop a new tab. Any other error → fall back to wa.me link.
    if (err?.name === "AbortError") return true;
    return false;
  }
}

/**
 * Open WhatsApp chat with the client's number pre-filled with
 * the caption text. Used as a desktop fallback (user must
 * manually attach the downloaded PDF).
 */
function openWhatsAppChat(caption: string): void {
  const url = `https://wa.me/${CLIENT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    caption,
  )}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Share a bill PDF on WhatsApp with the shop owner.
 *
 * Tries the native share sheet first (mobile). Falls back to
 * opening wa.me with a pre-filled text caption (desktop).
 *
 * Returns true if any share path was triggered, false if both
 * paths failed (rare — e.g. popup blocker on desktop).
 */
export async function shareBillOnWhatsApp(
  info: BillShareInfo,
): Promise<boolean> {
  // Mobile path — attach the PDF via Web Share API
  const shared = await tryNativeShare(info);
  if (shared) return true;

  // Desktop path — open WhatsApp Web with pre-filled caption
  openWhatsAppChat(info.caption);
  return true;
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
