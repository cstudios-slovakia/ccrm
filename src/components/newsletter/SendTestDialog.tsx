import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Dialog } from "./Dialog";
import { parseExtraAddresses } from "./audience";
import { newsletterApi, newsletterErrorDetail, newsletterErrorMessage } from "./newsletterApi";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD, HINT, LABEL, Notice, type NewsletterEnv } from "./shared";

const MAX_TEST = 5;

/** The addresses a test is prefilled with: the configured test recipients, then the user's own, at most 5, no repeats. */
export const prefillTestAddresses = (configured: string[], own: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of [...configured, own]) {
    const email = a.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out.slice(0, MAX_TEST);
};

/** C12 card 4: "Send test": up to 5 addresses, the current e-mail exactly as it would be sent. */
export const SendTestDialog = ({
  open,
  onClose,
  env,
  campaignId,
  subject,
  render,
  configured,
  userEmail,
  beforeSend,
}: {
  open: boolean;
  onClose: () => void;
  env: NewsletterEnv;
  campaignId: string;
  subject: string;
  /** Called when the dialog sends, so the newest design is rendered; returns the HTML and the text. */
  render: () => { html: string; text: string };
  configured: string[];
  userEmail: string;
  /** Writes pending edits first (the server checks the saved subject). */
  beforeSend?: () => Promise<void>;
}) => {
  const { t } = env;
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ line: string; detail: string | null } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRaw(prefillTestAddresses(configured, userEmail).join("\n"));
    setError(null);
    setDone(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const parsed = parseExtraAddresses(raw);
  const tooMany = parsed.valid.length > MAX_TEST;
  const canSend = parsed.valid.length > 0 && !tooMany && parsed.invalid.length === 0 && !busy;

  const send = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await beforeSend?.();
      const { html, text } = render();
      const r = await newsletterApi.sendTest({ id: campaignId, subject, html, text, to: parsed.valid });
      setDone(
        r.demo
          ? t("Demo mode: nothing was sent.", "Demo režim: nič sa neodoslalo.", "Demó mód: semmi nem lett elküldve.")
          : t(`Test sent to ${r.sent} address(es).`, `Test bol odoslaný na ${r.sent} adries.`, `A tesztet ${r.sent} címre elküldtük.`),
      );
    } catch (e) {
      setError({ line: newsletterErrorMessage(e, t), detail: newsletterErrorDetail(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("Send a test e-mail", "Odoslať testovací e-mail", "Tesztlevél küldése")} closeLabel={t("Close", "Zavrieť", "Bezárás")}>
      <div className="grid gap-4">
        <label className="grid gap-1">
          <span className={LABEL}>{t("Send to (one address per line, up to 5)", "Odoslať na (jedna adresa na riadok, najviac 5)", "Címzettek (soronként egy cím, legfeljebb 5)")}</span>
          <textarea rows={4} value={raw} onChange={(e) => setRaw(e.target.value)} className={`${FIELD} h-auto py-2`} data-testid="newsletter-test-addresses" />
          <span className={HINT} aria-live="polite">
            {t(`${parsed.valid.length} valid`, `${parsed.valid.length} platných`, `${parsed.valid.length} érvényes`)}
            {parsed.invalid.length > 0 && `, ${t(`${parsed.invalid.length} invalid`, `${parsed.invalid.length} neplatných`, `${parsed.invalid.length} érvénytelen`)}`}
            {tooMany && `, ${t("at most 5", "najviac 5", "legfeljebb 5")}`}
          </span>
        </label>
        <p className={HINT}>
          {t(
            "Merge tags show sample values in a test. Test e-mails carry a test unsubscribe link that does nothing.",
            "Zlučovacie polia majú v teste ukážkové hodnoty. Testovacie e-maily majú testovací odkaz na odhlásenie, ktorý nič nerobí.",
            "Az egyesítő mezők a tesztben mintaértékeket mutatnak. A tesztlevél leiratkozási hivatkozása teszt, nem csinál semmit.",
          )}
        </p>
        {error && (
          <Notice tone="error">
            <p>{error.line}</p>
            {error.detail && <p className="mt-1 break-words font-mono text-micro">{error.detail}</p>}
          </Notice>
        )}
        {done && <Notice tone="info">{done}</Notice>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_PRIMARY} disabled={!canSend} onClick={send} data-testid="newsletter-test-send">
            <Send className="size-4" />
            {busy ? t("Sending…", "Odosiela sa…", "Küldés…") : t("Send test", "Odoslať test", "Teszt küldése")}
          </button>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {t("Close", "Zavrieť", "Bezárás")}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
