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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const remaining = expiresAt ? Math.max(0, Math.round((Date.parse(expiresAt) - nowMs) / 1000)) : 0;
  useEffect(() => {
    if (!expiresAt) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

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
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="tt-pairing-card">
        <div>
          <p className="text-ui font-semibold text-slate-900">{t("One-time pairing code", "Jednorazový párovací kód", "Egyszer használatos párosító kód")}</p>
          <p className="type-meta text-slate-500">
            {t("Works once and expires after 10 minutes. The extension trades it for its own device key.", "Platí raz a vyprší po 10 minútach. Rozšírenie si ho vymení za vlastný kľúč zariadenia.", "Egyszer használható, és 10 perc után lejár. A bővítmény a saját eszközkulcsára cseréli.")}
            {code && expiresAt && (
              <>
                {" "}
                {remaining > 0 ? (
                  <span data-testid="tt-pairing-expires">{t("Expires in", "Vyprší o", "Lejár")} <span className="font-semibold tabular-nums text-slate-700">{clock(remaining)}</span>.</span>
                ) : (
                  <span className="font-semibold text-slate-700" data-testid="tt-pairing-expires">{t("This code has expired.", "Tento kód vypršal.", "Ez a kód lejárt.")}</span>
                )}
              </>
            )}
          </p>
        </div>
        {code ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-xl border border-slate-200 bg-white px-4 py-2 type-panel-title tracking-widest tabular-nums ${remaining > 0 ? "text-slate-900" : "text-slate-400 line-through"}`} data-testid="tt-pairing-code">{code}</span>
            <button
              type="button"
              onClick={() => void copyCode()}
              data-testid="tt-copy-pairing-code"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 cursor-pointer"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t("Copied", "Skopírované", "Másolva") : t("Copy", "Kopírovať", "Másolás")}
            </button>
            <button
              type="button"
              onClick={() => void freshCode()}
              disabled={busy}
              data-testid="tt-new-pairing-code"
              aria-label={t("New code", "Nový kód", "Új kód")}
              title={t("New code", "Nový kód", "Új kód")}
              className="inline-flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => void freshCode()}
              disabled={busy}
              data-testid="tt-new-pairing-code"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-ui font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className="size-4" />
              {t("New code", "Nový kód", "Új kód")}
            </button>
          </div>
        )}
      </div>
      {devices.length === 0 ? (
        <p className="text-body text-slate-500">{t("No browsers paired yet.", "Zatiaľ nie je spárovaný žiadny prehliadač.", "Még nincs párosított böngésző.")}</p>
      ) : (
        <ul className="grid gap-2">
          {devices.map((device) => (
            <li key={device.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2" data-testid="paired-device">
              <MonitorSmartphone className="size-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ui font-semibold text-slate-900">{device.name}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-semibold ${device.state === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    <span className={`size-1.5 rounded-full ${device.state === "active" ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {device.state === "active" ? t("Active", "Aktívny", "Aktív") : t("Idle", "Nečinný", "Tétlen")}
                  </span>
                  {device.updateAvailable && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-micro font-semibold text-amber-800">{t("Update available", "Dostupná aktualizácia", "Frissítés érhető el")}</span>
                  )}
                </div>
                <p className="type-meta text-slate-500">
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
