import { Pencil } from "lucide-react";
import type { RenderResult } from "./builder";
import { EmailThumbnail } from "./EmailThumbnail";
import type { Campaign } from "./types";
import { BTN_PRIMARY, Notice, type NewsletterEnv } from "./shared";

/** C12 card 3: the live thumbnail, "Edit design" and the two global header/footer switches. */
export const ContentCard = ({
  campaign,
  rendered,
  editable,
  env,
  onPatch,
  onEditDesign,
}: {
  campaign: Campaign;
  rendered: RenderResult;
  editable: boolean;
  env: NewsletterEnv;
  onPatch: (patch: Partial<Pick<Campaign, "useHeader" | "useFooter">>) => void;
  onEditDesign: () => void;
}) => {
  const { t } = env;
  const unsubscribeMissing = rendered.warnings.some((w) => w.code === "missing_unsubscribe");
  const emptyBody = !campaign.body || campaign.body.rows.length === 0;
  return (
    <div className="grid gap-4 ws-md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <EmailThumbnail html={rendered.html} label={t("Preview of the e-mail", "Náhľad e-mailu", "Az e-mail előnézete")} />
      <div className="grid content-start gap-4">
        {emptyBody && (
          <p className="text-ui text-slate-500">
            {t("The e-mail body is still empty. Open the design editor to start.", "Telo e-mailu je zatiaľ prázdne. Začnite v editore dizajnu.", "Az e-mail törzse még üres. A kezdéshez nyissa meg a dizájnszerkesztőt.")}
          </p>
        )}
        <div>
          <button type="button" className={BTN_PRIMARY} onClick={onEditDesign} data-testid="newsletter-edit-design">
            <Pencil className="size-4" />
            {editable ? t("Edit design", "Upraviť dizajn", "Dizájn szerkesztése") : t("View design", "Zobraziť dizajn", "Dizájn megtekintése")}
          </button>
        </div>
        <div className="grid gap-2">
          <label className="flex cursor-pointer items-center gap-3 text-ui text-slate-800">
            <input
              type="checkbox"
              role="switch"
              disabled={!editable}
              checked={campaign.useHeader}
              onChange={(e) => onPatch({ useHeader: e.target.checked })}
              className="size-4 accent-indigo-600"
            />
            {t("Use the global header", "Použiť globálnu hlavičku", "A globális fejléc használata")}
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-ui text-slate-800">
            <input
              type="checkbox"
              role="switch"
              disabled={!editable}
              checked={campaign.useFooter}
              onChange={(e) => onPatch({ useFooter: e.target.checked })}
              className="size-4 accent-indigo-600"
            />
            {t("Use the global footer", "Použiť globálnu pätičku", "A globális lábléc használata")}
          </label>
        </div>
        {!campaign.useFooter && unsubscribeMissing && (
          <Notice tone="warning">
            {t(
              "Without the global footer this e-mail has no unsubscribe link, and sending is refused without one. Add {{unsubscribe_url}} to a link in the body.",
              "Bez globálnej pätičky nemá tento e-mail odkaz na odhlásenie a odoslanie bez neho je zamietnuté. Pridajte {{unsubscribe_url}} do odkazu v obsahu.",
              "A globális lábléc nélkül ennek az e-mailnek nincs leiratkozási hivatkozása, és anélkül a küldés elutasításra kerül. Adja hozzá a {{unsubscribe_url}} címet egy hivatkozáshoz a törzsben.",
            )}
          </Notice>
        )}
      </div>
    </div>
  );
};
