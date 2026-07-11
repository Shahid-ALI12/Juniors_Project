/**
 * Shared WhatsApp-share follow-up toast.
 * ─────────────────────────────────────────────────────────────
 * Every bill-download flow (customer khata, mix order, purchase
 * bill, purchase receipt, buy-product) calls shareBillOnWhatsApp()
 * right after the PDF downloads. They all need to show the SAME
 * kind of follow-up toast:
 *   - a short title saying what just happened
 *   - a longer description explaining whether the PDF was attached
 *     (and if not, why — see getShareHelpText for the exact reasons)
 *   - a clickable wa.me link as a manual fallback
 *
 * Centralising that here means the message stays consistent across
 * all five call sites and any future ones. Callers just do:
 *
 *     const result = shareBillOnWhatsApp(billResult);
 *     showWhatsAppShareToast(result);
 */
import { toast } from "sonner";
import { getShareHelpText, type ShareBillResult } from "@/lib/share-whatsapp";

export function showWhatsAppShareToast(result: ShareBillResult): void {
  const help = getShareHelpText(result);

  const description = (
    <span className="text-xs leading-relaxed">
      {help.description}
      {/* Manual fallback link — shown on every path except the
          successful native-share path (where the share sheet is
          already open with the PDF attached, so a link is noise). */}
      {result.reason !== "native-share" && (
        <>
          <br />
          <br />
          Agar WhatsApp auto-open nahi hua, to yahan click karein:{" "}
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline font-medium"
          >
            Open WhatsApp Chat →
          </a>
        </>
      )}
    </span>
  );

  if (help.variant === "success") {
    toast.success(help.title, { description, duration: 15000 });
  } else if (help.variant === "error") {
    toast.error(help.title, { description, duration: 30000 });
  } else {
    toast.info(help.title, { description, duration: 30000 });
  }
}
