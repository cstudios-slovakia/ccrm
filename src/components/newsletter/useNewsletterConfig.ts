import { useCallback, useEffect, useRef, useState } from "react";
import { useAutosave, type AutosaveStatus } from "../settings/useAutosave";
import type { TFn } from "../../utils/timeTracking";
import { newsletterApi, newsletterErrorMessage } from "./newsletterApi";
import type { NewsletterConfig, NewsletterSettingsResponse } from "./types";

export interface NewsletterConfigState {
  loading: boolean;
  error: string | null;
  /** The server's answer to `settings_get`; `null` until it arrives. */
  info: NewsletterSettingsResponse | null;
  draft: NewsletterConfig | null;
  setDraft: (updater: (c: NewsletterConfig) => NewsletterConfig) => void;
  status: AutosaveStatus;
  reload: () => void;
}

/**
 * Settings > Newsletter state shared by the two sections: loads `settings_get`, keeps an editable
 * draft and writes it back on its own (`useAutosave`), like the rest of Settings.
 */
export const useNewsletterConfig = (t: TFn, canEdit: boolean): NewsletterConfigState => {
  const [info, setInfo] = useState<NewsletterSettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraftState] = useState<NewsletterConfig | null>(null);
  const [stored, setStored] = useState<NewsletterConfig | null>(null);
  const [attempt, setAttempt] = useState(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    let cancelled = false;
    setError(null);
    newsletterApi
      .settingsGet()
      .then((r) => {
        if (cancelled) return;
        setInfo(r);
        setDraftState(r.config);
        setStored(r.config);
      })
      .catch((e) => !cancelled && setError(newsletterErrorMessage(e, t)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const setDraft = useCallback((updater: (c: NewsletterConfig) => NewsletterConfig) => {
    setDraftState((d) => (d ? updater(d) : d));
  }, []);

  const save = useCallback(
    (cfg: NewsletterConfig) => {
      setStored(cfg);
      newsletterApi
        .settingsSave(cfg)
        .then((saved) => {
          // The server clamps numbers and normalises colours: show what it kept.
          if (JSON.stringify(saved) !== JSON.stringify(cfg) && JSON.stringify(draftRef.current) === JSON.stringify(cfg)) {
            setStored(saved);
            setDraftState(saved);
          }
        })
        .catch((e) => window.showToast?.(newsletterErrorMessage(e, t), "error"));
    },
    [t],
  );

  const status = useAutosave<NewsletterConfig | null>({
    value: draft,
    dirty: !!draft && !!stored && JSON.stringify(draft) !== JSON.stringify(stored),
    enabled: canEdit && !!draft,
    save: (v) => v && save(v),
  });

  return { loading: !info && !error, error, info, draft, setDraft, status, reload: () => setAttempt((n) => n + 1) };
};
