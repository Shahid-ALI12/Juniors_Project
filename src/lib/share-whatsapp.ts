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
 * silently swallow the new-tab open.
 *
 * Strategy (most reliable first):
 *   1. Create a real <a href="..." target="_blank"> element, append
 *      to DOM, call .click(), then remove. Browsers treat anchor
 *      clicks as "navigation" (not popups) and allow them much more
 *      reliably than window.open. This is the standard pattern used
 *      by download libraries (jsPDF, file-saver, etc.).
 *   2. If that somehow fails (returns false / throws), fall back to
 *      window.open(url, "_blank").
 *   3. If window.open returns null (popup blocker engaged), fall
 *      back to window.location.href = url so the chat opens in the
 *      same tab.
 *
 * Returns the URL that was attempted, so callers can show a manual
 * "click here" fallback link in case everything failed.
 */
function openWhatsAppChat(caption: string): { url: string; opened: boolean } {
  const url = `https://wa.me/${CLIENT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    caption,
  )}`;

  console.log("[share-whatsapp] openWhatsAppChat called with URL:", url);

  // Strategy 1: anchor element click (most reliable)
  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    // Some browsers require the anchor to be in the DOM for .click() to fire.
    a.style.position = "fixed";
    a.style.left = "-9999px";
    a.style.top = "0";
    a.setAttribute("aria-hidden", "true");
    document.body.appendChild(a);
    a.click();
    // Cleanup — small delay so the click event has time to register
    setTimeout(() => {
      try { document.body.removeChild(a); } catch { /* already removed */ }
    }, 100);
    console.log("[share-whatsapp] anchor click fired");
    return { url, opened: true };
  } catch (err) {
    console.warn("[share-whatsapp] anchor click failed:", err);
  }

  // Strategy 2: window.open
  try {
    const win = window.open(url, "_blank");
    if (win) {
      console.log("[share-whatsapp] window.open succeeded");
      return { url, opened: true };
    }
    console.warn("[share-whatsapp] window.open returned null (popup blocked)");
  } catch (err) {
    console.warn("[share-whatsapp] window.open threw:", err);
  }

  // Strategy 3: same-tab navigation (last resort)
  try {
    window.location.href = url;
    console.log("[share-whatsapp] falling back to location.href");
    return { url, opened: true };
  } catch (err) {
    console.error("[share-whatsapp] location.href failed:", err);
  }

  // All strategies failed — return the URL so caller can show a link
  return { url, opened: false };
}

/**
 * Synchronously check whether the Web Share API is available AND
 * can share files. Returns the prepared ShareData if yes, or null
 * if not. This is sync so the caller doesn't lose the user gesture.
 *
 * Also returns a `reason` so the caller can explain to the user
 * WHY the PDF won't be auto-attached (the most common cause is
 * accessing the app over plain HTTP from a phone — the Web Share
 * API is only available in secure contexts: HTTPS or localhost).
 */
function prepareNativeShareData(
  info: BillShareInfo,
): { data: ShareData } | { data: null; reason: ShareBillResult["reason"] } {
  if (typeof navigator === "undefined") {
    return { data: null, reason: "no-share-api" };
  }
  if (!navigator.share || !navigator.canShare) {
    // Distinguish "insecure context" (HTTP from a remote device) from
    // "browser simply has no share API" (old / desktop browser).
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      return { data: null, reason: "insecure-context" };
    }
    return { data: null, reason: "no-share-api" };
  }
  try {
    const file = new File([info.blob], info.fileName, {
      type: "application/pdf",
    });
    const shareData: ShareData = {
      files: [file],
      text: info.caption,
      title: "Bill from DANISH CATTLE FEED",
    };
    if (!navigator.canShare(shareData)) {
      return { data: null, reason: "cannot-share-files" };
    }
    return { data: shareData };
  } catch {
    return { data: null, reason: "cannot-share-files" };
  }
}

/**
 * Result of shareBillOnWhatsApp — used by callers to decide whether
 * to show a fallback toast with a manual "Open WhatsApp" link.
 */
export interface ShareBillResult {
  /** true if some share mechanism was triggered. */
  triggered: boolean;
  /** The wa.me URL — caller can render it as a clickable link as
   *  a fallback if triggered=false or as an "open manually" option. */
  url: string;
  /** "native" if Web Share API was used, "link" if anchor/window.open
   *  was used, "failed" if all mechanisms failed. */
  method: "native" | "link" | "failed";
  /** true ONLY if the PDF file was actually attached to the share
   *  (i.e. the native Web Share API path was taken). false on the
   *  desktop/link path because wa.me URLs cannot carry files. */
  fileAttached: boolean;
  /** Short machine-readable reason explaining the outcome — callers
   *  can use it to pick a message. See getShareHelpText(). */
  reason:
    | "native-share"        // PDF attached via Web Share API
    | "insecure-context"    // not HTTPS & not localhost → API unavailable
    | "no-share-api"        // browser has no navigator.share at all
    | "cannot-share-files"  // API present but canShare(files) returned false
    | "link-fallback"       // opened wa.me with text only
    | "all-failed";         // every mechanism failed
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
 *   2. Desktop / no file share support: synchronously creates an
 *      <a target="_blank"> element and clicks it (most reliable
 *      cross-browser pattern). Falls back to window.open, then
 *      location.href if popup blocked.
 *
 * Returns a ShareBillResult so the caller can show a fallback
 * toast with a clickable link if all automated methods failed.
 */
export function shareBillOnWhatsApp(info: BillShareInfo): ShareBillResult {
  console.log("[share-whatsapp] shareBillOnWhatsApp called", {
    hasBlob: !!info.blob,
    fileName: info.fileName,
    captionLength: info.caption?.length ?? 0,
    isSecureContext:
      typeof window !== "undefined" ? window.isSecureContext : "n/a",
  });

  // Mobile path — prepare the share data synchronously so we
  // don't lose the user gesture.
  const prepared = prepareNativeShareData(info);
  if (prepared.data) {
    console.log("[share-whatsapp] Web Share API available — firing navigator.share()");
    // Fire-and-forget. navigator.share returns a promise that
    // resolves when the user dismisses the share sheet.
    navigator.share(prepared.data).catch((err: any) => {
      // AbortError = user cancelled the share sheet — no action needed.
      if (err?.name !== "AbortError") {
        console.warn("[share-whatsapp] navigator.share failed:", err);
      }
    });
    return {
      triggered: true,
      url: `https://wa.me/${CLIENT_WHATSAPP_NUMBER}`,
      method: "native",
      fileAttached: true,
      reason: "native-share",
    };
  }

  // Desktop / no-file-share path — synchronous, preserves user gesture.
  console.log(
    "[share-whatsapp] Web Share API not available (reason:",
    prepared.reason,
    ") — using anchor click",
  );
  const result = openWhatsAppChat(info.caption);
  if (result.opened) {
    return {
      triggered: true,
      url: result.url,
      method: "link",
      fileAttached: false,
      reason: prepared.reason === "no-share-api"
        ? "no-share-api"
        : prepared.reason === "insecure-context"
          ? "insecure-context"
          : prepared.reason === "cannot-share-files"
            ? "cannot-share-files"
            : "link-fallback",
    };
  }
  return {
    triggered: false,
    url: result.url,
    method: "failed",
    fileAttached: false,
    reason: "all-failed",
  };
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

/* ── User-facing share-status helpers ──────────────────────
 * Translates the machine-readable ShareBillResult into a short,
 * human-friendly message (Roman Urdu + English mix matching the
 * rest of the app's UI copy). Used by the shared toast helper
 * in src/components/share-whatsapp-toast.tsx.
 */

export interface ShareHelpText {
  /** One-line toast title. */
  title: string;
  /** Longer description explaining what happened and what to do. */
  description: string;
  /** Toast variant — "success" only when the PDF was actually
   *  attached; "info" for the text-only fallback; "error" when
   *  every mechanism failed. */
  variant: "success" | "info" | "error";
}

export function getShareHelpText(result: ShareBillResult): ShareHelpText {
  if (result.reason === "native-share") {
    return {
      title: "Bill PDF share sheet khul gayi!",
      description:
        "Share sheet mein se WhatsApp chunein → client ki chat chunein → Send. PDF bil attached hai.",
      variant: "success",
    };
  }
  if (result.reason === "insecure-context") {
    return {
      title: "WhatsApp chat open hua, lekin PDF attach nahi hua",
      description:
        "App abhi HTTP par chal raha hai. PDF auto-attach karne ke liye app ko HTTPS se open karein: browser mein https://21.0.3.252:3000 likhein, certificate warning ko 'Advanced → Proceed' karke accept karein, phir dobara Share dabayein. Tab PDF bhi saath jayegi.",
      variant: "info",
    };
  }
  if (result.reason === "cannot-share-files") {
    return {
      title: "WhatsApp chat open hua, lekin PDF attach nahi hua",
      description:
        "Is browser mein file-share support nahi hai. PDF abhi Downloads folder mein save ho chuki hai — WhatsApp chat mein manually attach karein (📎 icon → Document → bill PDF).",
      variant: "info",
    };
  }
  if (result.reason === "no-share-api") {
    return {
      title: "WhatsApp chat open hua, lekin PDF attach nahi hua",
      description:
        "Ye browser Web Share API support nahi karta (desktop browser). PDF Downloads folder mein hai — chat mein manually attach karein (📎 icon → Document).",
      variant: "info",
    };
  }
  if (result.reason === "link-fallback") {
    return {
      title: "WhatsApp chat open hua (text caption ke saath)",
      description:
        "PDF auto-attach nahi hua. Downloads folder se manually attach karein (📎 → Document).",
      variant: "info",
    };
  }
  // all-failed
  return {
    title: "WhatsApp auto-open nahi ho saka",
    description:
      "Popup blocker ne block kar diya. Niche diye link par click karein:",
    variant: "error",
  };
}
