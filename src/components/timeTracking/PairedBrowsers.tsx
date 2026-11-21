import { useCallback, useEffect, useState } from "react";
import { Check, Copy, MonitorSmartphone, RefreshCw } from "lucide-react";
import { HoldToConfirmButton } from "../ui/HoldToConfirm";
import type { Language } from "../../utils/translations";
import type { TFn } from "../../utils/timeTracking.ts";
import { TimeApiError, timeErrorMessage } from "../../utils/timeTrackingApi.ts";
import { issuePairingCode, listPairedDevices, revokeDevice, type TrackerDevice } from "../../utils/timeTrackerApi.ts";

/** One-time pairing code and the signed-in user's browsers, with Revoke. */
export function PairedBrowsers({ t, language }: { t: TFn; language: Language }) {
  const [devices, setDevices] = useState<TrackerDevice[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await listPairedDevices();
      setDevices(res.devices);
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const freshCode = async () => {
    setBusy(true);
    try {
      const issued = await issuePairingCode();
      setCode(issued.code);
      setCopied(false);
      setExpiresAt(issued.expiresAt);
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code stays readable on screen */
    }
  };

  const revoke = async (device: TrackerDevice) => {
    try {
      await revokeDevice(device.id);
      setDevices((list) => list.filter((item) => item.id !== device.id));
      window.showToast?.(t("Browser revoked.", "Prehliadač bol odpojený.", "A böngésző visszavonva."));
    } catch (e) {
      window.showToast?.(timeErrorMessage(e instanceof TimeApiError ? e.code : "save_failed", t), "error");
    }
  };

  const when = (iso: string | null) => {
    if (!iso) return "—";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(language === "sk" ? "sk-SK" : language === "hu" ? "hu-HU" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div className="grid gap-3" data-testid="paired-browsers">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void freshCode()}
          disabled={busy}
          data-testid="tt-new-pairing-code"
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-gray-900 px-3 text-ui font-semibold text-white transition-all hover:bg-gray-800 active:scale-95 disabled:opacity-60 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        >
          <RefreshCw className="size-4" />
          {t("New code", "Nový kód", "Új kód")}
        </button>
        {code && (
          <div className="grid gap-0.5">
            <span className="type-panel-title tracking-widest text-gray-900 tabular-nums" data-testid="tt-pairing-code">{code}</span>
            <span className="type-meta text-gray-500">
              {t("Valid for 10 minutes, once.", "Platí 10 minút, raz.", "10 percig érvényes, egyszer.")}
              {expiresAt ? ` · ${when(expiresAt)}` : ""}
            </span>
          </div>
        )}
        {code && (
          <button
            type="button"
            onClick={() => void copyCode()}
            data-testid="tt-copy-pairing-code"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-ui font-semibold text-gray-700 transition-all hover:bg-gray-50 active:scale-95 cursor-pointer"
          >
            {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            {copied ? t("Copied", "Skopírované", "Másolva") : t("Copy", "Kopírovať", "Másolás")}
          </button>
        )}
      </div>
      {devices.length === 0 ? (
        <p className="text-body text-gray-500">{t("No browsers paired yet.", "Zatiaľ nie je spárovaný žiadny prehliadač.", "Még nincs párosított böngésző.")}</p>
      ) : (
        <ul className="grid gap-2">
          {devices.map((device) => (
            <li key={device.id} className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white px-3 py-2" data-testid="paired-device">
              <MonitorSmartphone className="size-4 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ui font-semibold text-gray-900">{device.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-micro font-semibold ${device.state === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                    {device.state === "active" ? t("Active", "Aktívny", "Aktív") : t("Idle", "Nečinný", "Tétlen")}
                  </span>
                  {device.updateAvailable && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-micro font-semibold text-amber-800">{t("Update available", "Dostupná aktualizácia", "Frissítés érhető el")}</span>
                  )}
                </div>
                <p className="type-meta text-gray-500">
                  {[device.os, device.browser].filter(Boolean).join(" · ") || t("Browser", "Prehliadač", "Böngésző")}
                  {" · "}
                  {t("Paired", "Spárované", "Párosítva")} {when(device.createdAt)}
                  {" · "}
                  {t("Last sync", "Posledná synchronizácia", "Utolsó szinkron")} {when(device.lastUsedAt)}
                </p>
              </div>
              <HoldToConfirmButton
                onConfirm={() => void revoke(device)}
                tone="danger"
                lang={language}
                what={device.name}
                className="inline-flex h-8 items-center rounded-lg px-2 text-ui font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
              >
                {t("Revoke", "Odpojiť", "Visszavonás")}
              </HoldToConfirmButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
