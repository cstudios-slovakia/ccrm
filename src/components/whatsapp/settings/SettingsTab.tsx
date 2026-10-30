import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { HoldToConfirmButton } from "../../ui/HoldToConfirm";
import { SecretInput } from "../../ui/SecretInput";
import { Surface } from "../../layout";
import { SECRET_MASK } from "../../../utils/aiConfig";
import type { Language } from "../../../utils/translations";
import type { WaaiClient } from "../api/waaiClient.ts";
import { WaaiApiError } from "../api/waaiClient.ts";
import { primaryButton, secondaryButton } from "../StateCard";
import { homeCopy, type HomeCopy } from "../home/copy";
import { SETTINGS_SECTIONS, settingsRoute, settingsSection, type SettingsSection } from "../home/settingsRoute";
import type { AiSettings, CrmSettings, PeopleResponse, PreferencesResponse, WaAccountRow } from "../home/types";

const field = "type-body min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-slate-800";

function useLoad<T>(client: WaaiClient, path: string | null, failed: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    client
      .get<T>(path)
      .then((next) => !cancelled && setData(next))
      .catch((err: unknown) => !cancelled && setError(err instanceof WaaiApiError ? err.message : failed));
    return () => {
      cancelled = true;
    };
  }, [client, failed, path, tick]);
  return { data, setData, error, setError, reload: () => setTick((n) => n + 1) };
}

const Accounts = ({ client, t, admin }: { client: WaaiClient; t: HomeCopy; admin: boolean }) => {
  const own = useLoad<{ accounts: WaAccountRow[] }>(client, "/wa-accounts", t.failed);
  const all = useLoad<{ accounts: WaAccountRow[] }>(client, admin ? "/admin/wa-accounts" : null, t.failed);
  const [qr, setQr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const link = async () => {
    setNote(null);
    const started = await client.post<{ account_id: string; worker_offline: boolean }>("/wa-accounts");
    if (started.worker_offline) setNote(t.settings.worker);
    const ctrl = new AbortController();
    await client.stream(`/wa-accounts/${started.account_id}/stream`, (event) => {
      if (event.event === "qr") {
        try {
          const parsed = JSON.parse(event.data) as { qr?: string } | string;
          setQr(typeof parsed === "string" ? parsed : parsed.qr ?? event.data);
        } catch {
          setQr(event.data);
        }
      }
      if (event.event === "status") {
        const status = JSON.parse(event.data) as { status?: string };
        if (status.status === "connected") ctrl.abort();
      }
      if (event.event === "stream-error") setNote(t.settings.worker);
    }, { signal: ctrl.signal }).catch(() => undefined);
    own.reload();
  };

  const act = async (id: string, action: string, adminAccount: boolean) => {
    const root = adminAccount ? "/admin/wa-accounts" : "/wa-accounts";
    if (action === "delete") await client.del(`${root}/${id}`);
    else await client.post(`${root}/${id}/${action}`);
    own.reload();
    all.reload();
  };

  const list = (rows: WaAccountRow[] | undefined, adminAccount: boolean) => (
    <ul className="flex flex-col gap-3">
      {(rows ?? []).map((account) => (
        <li key={account.id} className="rounded-2xl border border-slate-200 p-3">
          <p className="type-body font-semibold text-slate-800">{account.display_name || account.phone_number || account.id}</p>
          <p className="type-meta text-slate-500">{account.status}{account.owner_email ? ` · ${account.owner_email}` : ""}{account.last_error ? ` · ${account.last_error}` : ""}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {adminAccount ? null : <button type="button" className={secondaryButton} onClick={() => void act(account.id, "retry", adminAccount)}>{t.retry}</button>}
            <button type="button" className={secondaryButton} onClick={() => void act(account.id, "disconnect", adminAccount)}>{t.settings.disconnect}</button>
            <button type="button" className={secondaryButton} onClick={() => void act(account.id, "reconnect", adminAccount)}>{t.settings.reconnect}</button>
            <button type="button" className={secondaryButton} onClick={() => void act(account.id, "resync", adminAccount)}>{t.settings.resync}</button>
            <button type="button" className={secondaryButton} onClick={() => void act(account.id, "delete", adminAccount)}>{t.settings.remove}</button>
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <button type="button" className={primaryButton} onClick={() => void link()}>{t.settings.link}</button>
      {note ? <p className="type-body text-amber-700">{note}</p> : null}
      {qr ? (
        <div>
          <p className="type-meta text-slate-500">{t.settings.qr}</p>
          <img className="mt-2 w-48 rounded-2xl border border-slate-200" src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt={t.settings.qr} />
        </div>
      ) : null}
      {own.error ? <p className="type-body text-rose-600">{own.error}</p> : null}
      {list(own.data?.accounts, false)}
      {admin ? (
        <div>
          <h3 className="type-label mb-2 text-slate-500">{t.settings.accounts}</h3>
          {list(all.data?.accounts, true)}
        </div>
      ) : null}
    </div>
  );
};

const Reactions = ({ client, t }: { client: WaaiClient; t: HomeCopy }) => {
  const prefs = useLoad<PreferencesResponse>(client, "/preferences", t.failed);
  const [text, setText] = useState("");
  useEffect(() => {
    if (prefs.data) setText(prefs.data.quick_reactions.join(" "));
  }, [prefs.data]);
  const save = async () => {
    const emojis = [...text.trim()].filter((ch) => /\p{Extended_Pictographic}/u.test(ch));
    await client.put("/preferences/quick-reactions", { emojis });
    prefs.reload();
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body text-slate-500">{t.settings.reactionsHelp}</p>
      <input className={field} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" className={primaryButton} onClick={() => void save()}>{t.save}</button>
        <button type="button" className={secondaryButton} onClick={() => void client.del("/preferences/quick-reactions").then(() => prefs.reload())}>{t.settings.remove}</button>
      </div>
      {prefs.error ? <p className="type-body text-rose-600">{prefs.error}</p> : null}
    </div>
  );
};

const Language = ({ client, t }: { client: WaaiClient; t: HomeCopy }) => {
  const prefs = useLoad<PreferencesResponse>(client, "/preferences", t.failed);
  return (
    <label className="type-body flex items-center gap-2 text-slate-700">
      <input
        type="checkbox"
        checked={!!prefs.data?.auto_detect_summary_lang}
        onChange={(e) => void client.put("/preferences", { auto_detect_summary_lang: e.target.checked }).then(() => prefs.reload())}
      />
      {t.settings.autoLang}
    </label>
  );
};

const Ai = ({ client, t, language }: { client: WaaiClient; t: HomeCopy; language: Language }) => {
  const ai = useLoad<AiSettings>(client, "/admin/ai", t.failed);
  const [openai, setOpenai] = useState(SECRET_MASK);
  const [anthropic, setAnthropic] = useState(SECRET_MASK);
  const [prompts, setPrompts] = useState({ general: "", summary: "", task: "" });
  const [models, setModels] = useState({ text: "", embed: "", transcribe: "" });
  const [cost, setCost] = useState("0");
  const [speech, setSpeech] = useState({ model: "", speed: "1" });
  const [skill, setSkill] = useState("");
  const [check, setCheck] = useState<string | null>(null);
  useEffect(() => {
    if (!ai.data) return;
    setOpenai(ai.data.openai_key_set ? SECRET_MASK : "");
    setAnthropic(ai.data.anthropic_key_set ? SECRET_MASK : "");
    setPrompts({ general: ai.data.prompts.general, summary: ai.data.prompts.summary, task: ai.data.prompts.task });
    setModels(ai.data.models);
    setCost(String(ai.data.cost_limit_usd));
    setSpeech({ model: ai.data.speech.model, speed: String(ai.data.speech.speed) });
  }, [ai.data]);
  if (!ai.data) return ai.error ? <p className="type-body text-rose-600">{ai.error}</p> : <Loader2 className="size-4 animate-spin" />;
  return (
    <div className="flex flex-col gap-4">
      <label className="type-label text-slate-500">{t.settings.provider}
        <select className={field} value={ai.data.provider} onChange={(e) => void client.put("/admin/ai/provider", { provider: e.target.value }).then(() => ai.reload())}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      <label className="type-label text-slate-500">{t.settings.openai}
        <SecretInput language={language} value={openai} onChange={setOpenai} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} onClick={() => void client.put("/admin/ai/openai-key", { key: openai === SECRET_MASK ? "" : openai })}>{t.save}</button>
        <button type="button" className={secondaryButton} onClick={() => void client.del("/admin/ai/openai-key")}>{t.settings.remove}</button>
        <button type="button" className={secondaryButton} onClick={() => void client.post("/admin/ai/openai-key/check").then((r) => setCheck(JSON.stringify(r)))}>{t.settings.check}</button>
      </div>
      {check ? <p className="type-meta text-slate-500">{check}</p> : null}
      <label className="type-label text-slate-500">{t.settings.anthropic}
        <SecretInput language={language} value={anthropic} onChange={setAnthropic} />
      </label>
      <button type="button" className={primaryButton} onClick={() => void client.put("/admin/ai/anthropic-key", { key: anthropic === SECRET_MASK ? "" : anthropic })}>{t.save}</button>
      {(["general", "summary", "task"] as const).map((key) => (
        <label key={key} className="type-label text-slate-500">{t.settings.prompts} · {key}
          <textarea className={field} rows={3} value={prompts[key]} onChange={(e) => setPrompts({ ...prompts, [key]: e.target.value })} />
        </label>
      ))}
      <button type="button" className={primaryButton} onClick={() => void client.put("/admin/ai/prompts", { prompts: { ...ai.data!.prompts, ...prompts } })}>{t.save}</button>
      <label className="type-label text-slate-500">{t.settings.skill}
        <textarea className={field} rows={4} value={skill} onChange={(e) => setSkill(e.target.value)} />
      </label>
      <button type="button" className={secondaryButton} onClick={() => void client.post<{ text: string }>("/admin/ai/skill", { file_name: "skill.md", text: skill }).then((r) => setPrompts((p) => ({ ...p, general: r.text })))}>{t.save}</button>
      {(["text", "embed", "transcribe"] as const).map((key) => (
        <label key={key} className="type-label text-slate-500">{t.settings.models} · {key}
          <input className={field} value={models[key]} onChange={(e) => setModels({ ...models, [key]: e.target.value })} />
        </label>
      ))}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButton} onClick={() => void client.put("/admin/ai/models", { models })}>{t.save}</button>
        <button type="button" className={secondaryButton} onClick={() => void client.post("/admin/ai/models/refresh")}>{t.settings.refreshModels}</button>
      </div>
      <label className="type-label text-slate-500">{t.settings.cost}
        <input className={field} value={cost} onChange={(e) => setCost(e.target.value)} />
      </label>
      <button type="button" className={primaryButton} onClick={() => void client.put("/admin/ai/cost-limit", { limit_usd: Number(cost) })}>{t.save}</button>
      <label className="type-label text-slate-500">{t.settings.speech}
        <input className={field} value={speech.model} onChange={(e) => setSpeech({ ...speech, model: e.target.value })} />
      </label>
      <button type="button" className={primaryButton} onClick={() => void client.put("/admin/ai/speech", { speech: { model: speech.model, speed: Number(speech.speed) } })}>{t.save}</button>
      <label className="type-body flex items-center gap-2 text-slate-700">
        <input type="checkbox" checked={ai.data.digest_audio_auto} onChange={(e) => void client.put("/admin/ai/digest-audio", { enabled: e.target.checked }).then(() => ai.reload())} />
        {t.settings.digestAudio}
      </label>
    </div>
  );
};

const Crm = ({ client, t }: { client: WaaiClient; t: HomeCopy }) => {
  const crm = useLoad<CrmSettings>(client, "/admin/crm", t.failed);
  if (!crm.data) return crm.error ? <p className="type-body text-rose-600">{crm.error}</p> : <Loader2 className="size-4 animate-spin" />;
  const data = crm.data;
  return (
    <div className="flex flex-col gap-3">
      <label className="type-body flex items-center gap-2"><input type="checkbox" checked={data.push_enabled} onChange={(e) => void client.put("/admin/crm/direction", { direction: "push", enabled: e.target.checked }).then(() => crm.reload())} />{t.settings.push}</label>
      <label className="type-body flex items-center gap-2"><input type="checkbox" checked={data.pull_enabled} onChange={(e) => void client.put("/admin/crm/direction", { direction: "pull", enabled: e.target.checked }).then(() => crm.reload())} />{t.settings.pull}</label>
      {data.paused_reason ? <p className="type-meta text-amber-700">{data.paused_reason}</p> : null}
      {data.last_ping ? <p className="type-meta text-slate-500">{data.last_ping.ok ? "OK" : data.last_ping.error} · {data.last_ping.at}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} onClick={() => void client.post("/admin/crm/ping").then(() => crm.reload())}>{t.settings.ping}</button>
        <button type="button" className={secondaryButton} onClick={() => void client.post("/admin/crm/directory").then(() => crm.reload())}>{t.settings.directory}</button>
      </div>
      <label className="type-label text-slate-500">{t.settings.country}
        <input className={field} defaultValue={data.default_country} onBlur={(e) => void client.put("/admin/crm/country", { country: e.target.value })} />
      </label>
      <h3 className="type-label text-slate-500">{t.settings.linkedChats}</h3>
      <ul>{data.linked_chats.map((link) => <li key={`${link.conversation_id}-${link.crm_id}`} className="type-meta text-slate-600">{link.title} · {link.entity_type} · {link.source}</li>)}</ul>
      <h3 className="type-label text-slate-500">{t.settings.taskErrors}</h3>
      <ul>
        {data.task_errors.map((task) => (
          <li key={task.id} className="flex items-center gap-2">
            <span className="type-body text-slate-800">{task.title}</span>
            <button type="button" className={secondaryButton} onClick={() => void client.post(`/admin/crm/tasks/${task.id}/retry`).then(() => crm.reload())}>{t.retry}</button>
          </li>
        ))}
      </ul>
      <h3 className="type-label text-slate-500">{t.settings.pair}</h3>
      {data.accounts.map((account) => (
        <label key={account.id} className="type-meta text-slate-600">{account.label}
          <input className={field} defaultValue={account.crm_user_id ?? ""} onBlur={(e) => void client.put("/admin/crm/pair-account", { id: account.id, crm_user_id: e.target.value || null })} />
        </label>
      ))}
    </div>
  );
};

const People = ({ client, t }: { client: WaaiClient; t: HomeCopy }) => {
  const people = useLoad<PeopleResponse>(client, "/admin/people", t.failed);
  if (!people.data) return people.error ? <p className="type-body text-rose-600">{people.error}</p> : <Loader2 className="size-4 animate-spin" />;
  return (
    <ul className="flex flex-col gap-3">
      {people.data.crm_users.filter((u) => u.active).map((crm) => {
        const mapped = people.data!.waai_users.find((u) => u.crm_user_id === crm.crm_user_id);
        return (
          <li key={crm.crm_user_id} className="flex flex-wrap items-center gap-2">
            <span className="type-body text-slate-800">{crm.name}</span>
            <span className="type-meta text-slate-500">{mapped ? mapped.email : t.empty}</span>
            {mapped ? (
              <button type="button" className={secondaryButton} onClick={() => void client.put(`/admin/people/${mapped.id}`, { crm_user_id: null }).then(() => people.reload())}>{t.settings.unmap}</button>
            ) : (
              <button type="button" className={primaryButton} onClick={() => void client.post("/admin/people", { crm_user_id: crm.crm_user_id }).then(() => people.reload())}>{t.settings.createUser}</button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

const Members = ({ client, t }: { client: WaaiClient; t: HomeCopy }) => {
  const members = useLoad<{ members: { id: string; email: string; role: string }[] }>(client, "/admin/members", t.failed);
  if (!members.data) return members.error ? <p className="type-body text-rose-600">{members.error}</p> : <Loader2 className="size-4 animate-spin" />;
  return (
    <ul className="flex flex-col gap-2">
      {members.data.members.map((member) => (
        <li key={member.id} className="flex flex-wrap items-center gap-2">
          <span className="type-body text-slate-800">{member.email}</span>
          <span className="type-meta text-slate-500">{member.role}</span>
          {member.role === "member" ? (
            <button type="button" className={secondaryButton} onClick={() => void client.del(`/admin/members/${member.id}`).then(() => members.reload())}>{t.settings.remove}</button>
          ) : null}
        </li>
      ))}
    </ul>
  );
};

const Invites = ({ client, t }: { client: WaaiClient; t: HomeCopy }) => {
  const invites = useLoad<{ invites: { id: string; email: string | null; revoked: boolean; used: boolean }[] }>(client, "/admin/wa-invites", t.failed);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body text-slate-500">{t.settings.inviteHint}</p>
      <div className="flex flex-wrap gap-2">
        <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className={primaryButton} onClick={() => void client.post<{ token: string }>("/admin/wa-invites", { email }).then((r) => { setToken(r.token); invites.reload(); })}>{t.settings.invite}</button>
      </div>
      {token ? <p className="type-meta text-slate-700">{token}</p> : null}
      <ul>
        {(invites.data?.invites ?? []).map((invite) => (
          <li key={invite.id} className="flex items-center gap-2">
            <span className="type-body text-slate-800">{invite.email || invite.id}</span>
            {!invite.revoked ? <button type="button" className={secondaryButton} onClick={() => void client.del(`/admin/wa-invites/${invite.id}`).then(() => invites.reload())}>{t.settings.revoke}</button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const SettingsTab = ({
  client,
  language,
  route,
  admin,
}: {
  client: WaaiClient;
  language: string;
  route: string;
  admin: boolean;
}) => {
  const t = homeCopy(language);
  const lang = (language === "sk" || language === "hu" ? language : "en") as Language;
  const section = settingsSection(route);
  const visible = SETTINGS_SECTIONS.filter((key) => admin || key === "accounts" || key === "reactions" || key === "language" || key === "reset");
  const panels: Record<SettingsSection, ReactNode> = {
    accounts: <Accounts client={client} t={t} admin={admin} />,
    reactions: <Reactions client={client} t={t} />,
    language: <Language client={client} t={t} />,
    ai: admin ? <Ai client={client} t={t} language={lang} /> : <p className="type-body text-slate-500">{t.settings.adminOnly}</p>,
    crm: admin ? <Crm client={client} t={t} /> : <p className="type-body text-slate-500">{t.settings.adminOnly}</p>,
    people: admin ? <People client={client} t={t} /> : <p className="type-body text-slate-500">{t.settings.adminOnly}</p>,
    members: admin ? <Members client={client} t={t} /> : <p className="type-body text-slate-500">{t.settings.adminOnly}</p>,
    invites: admin ? <Invites client={client} t={t} /> : <p className="type-body text-slate-500">{t.settings.adminOnly}</p>,
    reset: (
      <div className="flex flex-col gap-3">
        <h3 className="type-card-title text-slate-800">{t.settings.resetTitle}</h3>
        <p className="type-body text-slate-500">{t.settings.resetBody}</p>
        <HoldToConfirmButton lang={lang} onConfirm={() => void client.post("/reset-data")} tone="danger">{t.settings.resetHold}</HoldToConfirmButton>
      </div>
    ),
  };
  return (
    <Surface className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {visible.map((key) => (
          <a key={key} className={key === section ? primaryButton : secondaryButton} href={`#${settingsRoute(key)}`}>{t.settings[key]}</a>
        ))}
      </div>
      {panels[section]}
    </Surface>
  );
};
