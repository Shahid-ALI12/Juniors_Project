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
 *
 * ── Native-share promise handling ──
 * The Web Share API path is special: shareBillOnWhatsApp() returns
 * immediately with reason="native-share", but navigator.share()
 * itself is async. We must await it to know whether the share
 * sheet actually opened or whether the browser blocked it (the
 * most common cause of "toast appeared but nothing opened" is
 * NotAllowedError — the user gesture was lost between the click
 * on sonner's toast action button and the navigator.share() call,
 * so Chrome silently rejects the share).
 *
 * To handle this we show an intermediate "Opening share sheet..."
 * toast, then react to the promise:
 *   - resolved → success toast (sheet opened, user picked app)
 *   - rejected AbortError → user dismissed silently, no toast
 *   - rejected other → error toast with manual wa.me fallback link
 */
import { toast } from "sonner";
import { getShareHelpText, type ShareBillResult } from "@/lib/share-whatsapp";

export function showWhatsAppShareToast(result: ShareBillResult): void {
  // ── Native share path — must await the share promise ──
  if (result.sharePromise) {
    // Show an intermediate toast — DO NOT claim success yet.
    const openingId = toast.info("WhatsApp share sheet open ho rahi hai...", {
      description: (
        <span className="text-xs leading-relaxed">
          Agar share sheet 5 second mein open na ho, to browser ne
          usay block kar diya hai. Neeche link par click karein
          (lekin PDF manually attach karni padegi):
          <br />
          <br />
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline font-medium"
          >
            Open WhatsApp Chat →
          </a>
        </span>
      ),
      duration: 30000,
    });

    result.sharePromise.then(
      () => {
        // Share sheet opened & user dismissed it normally (either
        // picked an app and sent, or just closed the sheet).
        toast.dismiss(openingId);
        toast.success("Bill PDF share sheet khul gayi!", {
          description: (
            <span className="text-xs leading-relaxed">
              Share sheet mein se WhatsApp chunein → client ki chat
              chunein → Send. PDF bil attached hai.
            </span>
          ),
          duration: 15000,
        });
      },
      (err: any) => {
        toast.dismiss(openingId);

        const errName = err?.name || "UnknownError";
        const errMsg = err?.message || "no message";
        console.error("[share-whatsapp] share sheet failed to open:", errName, errMsg);

        // AbortError = normally "user cancelled", BUT on Android
        // Chrome this is also what's thrown when the file is
        // silently rejected by the share system. If the user
        // never saw a sheet, this is a silent failure — treat
        // it as an error and show the fallback.
        if (errName === "AbortError") {
          console.log("[share-whatsapp] AbortError — assuming silent file-share failure (Android bug)");
          toast.error("Share sheet open nahi ho saki (AbortError)", {
            description: (
              <span className="text-xs leading-relaxed">
                Ye Android Chrome ka known issue hai — jab PDF file
                share system reject kar deta hai, to share sheet
                open nahi hoti aur <code>AbortError</code> throw
                ho jata hai.
                <br />
                <br />
                <strong>Manual tarika:</strong> Neeche link par
                click karein → WhatsApp chat khul jayegi → upar{" "}
                <strong>📎 attachment icon</strong> par tap karein
                → <strong>Document</strong> chunein → apni Downloads
                folder mein se bill PDF select karein → Send.
                <br />
                <br />
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Open WhatsApp Chat →
                </a>
              </span>
            ),
            duration: 60000,
          });
          return;
        }

        if (errName === "TimeoutError") {
          toast.error("Share sheet open nahi ho saki (Timeout)", {
            description: (
              <span className="text-xs leading-relaxed">
                Browser 4 second tak share sheet open nahi kar saka.
                Ye usually is liye hota hai ke OS ne PDF file share
                system ke through reject kar diya.
                <br />
                <br />
                <strong>Manual tarika:</strong> Neeche link par
                click karein → WhatsApp chat mein{" "}
                <strong>📎 → Document →</strong> Downloads se bill
                PDF select karein → Send.
                <br />
                <br />
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Open WhatsApp Chat →
                </a>
              </span>
            ),
            duration: 60000,
          });
          return;
        }

        // Any other rejection = browser blocked the share.
        toast.error("Share sheet open nahi ho saki", {
          description: (
            <span className="text-xs leading-relaxed">
              <strong>Error:</strong> {errName} — {errMsg}
              <br />
              Browser ne share block kar diya. Neeche link par
              click karein — PDF Downloads folder mein hai, chat
              mein manually attach karein (📎 → Document).
              <br />
              <br />
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline font-medium"
              >
                Open WhatsApp Chat →
              </a>
            </span>
          ),
          duration: 60000,
        });
      },
    );
    return;
  }

  // ── Non-native paths — show appropriate message immediately ──
  const help = getShareHelpText(result);

  const description = (
    <span className="text-xs leading-relaxed">
      {help.description}
      {/* Manual fallback link — always shown on non-native paths
          (where PDF auto-attach wasn't possible). */}
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
