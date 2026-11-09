import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { Campaign, NewsletterSettingsResponse } from "./types";
import { FIELD, HINT, LABEL, type NewsletterEnv } from "./shared";

const SUBJECT_TAGS = ["first_name", "name", "company"] as const;

/** C12 card 2: From name, From address (read-only, from the system mail profile), Reply-To, subject, preheader. */
export const SenderCard = ({
  campaign,
  settings,
  disabled,
  env,
  onPatch,
}: {
  campaign: Campaign;
  settings: NewsletterSettingsResponse | null;
  disabled: boolean;
  env: NewsletterEnv;
  onPatch: (patch: Partial<Pick<Campaign, "fromName" | "replyTo" | "subject" | "preheader">>) => void;
}) => {
  const { t } = env;
  const subjectRef = useRef<HTMLInputElement>(null);
  const defaults = settings?.config.sender;

  const insertTag = (tag: string) => {
    const el = subjectRef.current;
    const token = `{{${tag}}}`;
    const at = el?.selectionStart ?? campaign.subject.length;
    const end = el?.selectionEnd ?? at;
    const next = campaign.subject.slice(0, at) + token + campaign.subject.slice(end);
    onPatch({ subject: next });
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  const len = campaign.subject.length;

  return (
    <div className="grid gap-4 ws-md:grid-cols-2">
      <label className="grid gap-1">
        <span className={LABEL}>{t("From name", "Meno odosielateľa", "Feladó neve")}</span>
        <input
          disabled={disabled}
          value={campaign.fromName ?? ""}
          onChange={(e) => onPatch({ fromName: e.target.value })}
          placeholder={defaults?.fromName || t("Company name", "Názov firmy", "Cégnév")}
          className={FIELD}
        />
      </label>
      <div className="grid gap-1">
        <span className={LABEL}>{t("From address", "Adresa odosielateľa", "Feladó címe")}</span>
        <div className={`${FIELD} flex items-center bg-slate-50 text-slate-700`} data-testid="newsletter-from-address">
          <span className="truncate">{settings?.senderEmail || "-"}</span>
        </div>
      </div>
      {settings && !settings.senderConfigured && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-ui text-amber-800 ws-md:col-span-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {t("Outgoing e-mail is not set up, so nothing can be sent. ", "Odchádzajúca pošta nie je nastavená, preto sa nedá nič odoslať. ", "A kimenő levelezés nincs beállítva, ezért semmi sem küldhető. ")}
            <a href="#settings/email/outgoing" className="font-semibold underline">
              {t("Open the outgoing server settings", "Otvoriť nastavenia odchádzajúceho servera", "A kimenő szerver beállításainak megnyitása")}
            </a>
          </span>
        </div>
      )}
      <label className="grid gap-1 ws-md:col-span-2">
        <span className={LABEL}>{t("Reply-To", "Odpovedať na", "Válaszcím")}</span>
        <input
          type="email"
          disabled={disabled}
          value={campaign.replyTo ?? ""}
          onChange={(e) => onPatch({ replyTo: e.target.value })}
          placeholder={defaults?.replyTo || t("Same as the From address", "Rovnaká ako adresa odosielateľa", "Megegyezik a feladó címével")}
          className={FIELD}
        />
      </label>
      <div className="grid gap-1 ws-md:col-span-2">
        <label htmlFor="newsletter-subject" className={LABEL}>
          {t("Subject", "Predmet", "Tárgy")}
        </label>
        <input
          id="newsletter-subject"
          ref={subjectRef}
          disabled={disabled}
          value={campaign.subject}
          onChange={(e) => onPatch({ subject: e.target.value })}
          className={FIELD}
          data-testid="newsletter-subject"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`${HINT} ${len > 60 ? "text-amber-700" : ""}`}>
            {len} {len > 60 && `- ${t("long subjects are cut off in many inboxes", "dlhé predmety sa v mnohých schránkach skrátia", "a hosszú tárgyat sok postafiók levágja")}`}
          </span>
          {!disabled && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={HINT}>{t("Insert", "Vložiť", "Beszúrás")}:</span>
              {SUBJECT_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => insertTag(tag)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 type-label text-slate-600 hover:border-slate-300 cursor-pointer"
                >
                  {`{{${tag}}}`}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>
      <label className="grid gap-1 ws-md:col-span-2">
        <span className={LABEL}>{t("Preheader", "Preheader", "Előnézeti szöveg")}</span>
        <input disabled={disabled} value={campaign.preheader} onChange={(e) => onPatch({ preheader: e.target.value })} className={FIELD} />
        <span className={HINT}>{t("Shown after the subject in the inbox.", "Zobrazuje sa v schránke za predmetom.", "A postafiókban a tárgy után jelenik meg.")}</span>
      </label>
    </div>
  );
};
