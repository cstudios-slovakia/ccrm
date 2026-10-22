/**
 * Browser-side passkey ceremonies shared by the login screen, the post-login
 * setup offer and Personal settings. The pure helpers live in ./passkeys.ts;
 * everything here may touch the DOM, `navigator.credentials` and storage.
 */
import type { UserProfile } from "../types";
import {
  assertionCredentialToJson,
  creationCredentialToJson,
  isPasskeySupported,
  passkeyErrorKind,
  toCreationOptions,
  toRequestOptions,
} from "./passkeys";

const ENDPOINT = "/api/passkeys.php";

const postAction = (body: Record<string, unknown>): Promise<Response> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// --- Per-device markers --------------------------------------------------
// Storage can be blocked (LoginView already warns about it), so every access
// is guarded and a failure reads as "not set".

const KEY_ON_THIS_DEVICE = "ccrm.passkey.onThisDevice";
const KEY_OFFER_DISMISSED = "ccrm.passkey.offerDismissed";

const readFlag = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeFlag = (key: string): void => {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* blocked storage: the offer may come back, nothing breaks */
  }
};

const clearFlag = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* blocked storage: nothing to clear */
  }
};

export const isPasskeyOnThisDevice = (): boolean => readFlag(KEY_ON_THIS_DEVICE);
export const markPasskeyOnThisDevice = (): void => writeFlag(KEY_ON_THIS_DEVICE);
/** The account has no passkeys left, so the sign-in button has nothing to offer here. */
export const clearPasskeyOnThisDevice = (): void => clearFlag(KEY_ON_THIS_DEVICE);
export const isPasskeyOfferDismissed = (): boolean => readFlag(KEY_OFFER_DISMISSED);
export const dismissPasskeyOffer = (): void => writeFlag(KEY_OFFER_DISMISSED);

/** A phone or security key used through the "other device" menu is not this device. */
const isThisDeviceCredential = (cred: Credential): boolean =>
  (cred as PublicKeyCredential & { authenticatorAttachment?: string }).authenticatorAttachment === "platform";

// --- Capability probes ----------------------------------------------------

/** True when Windows Hello, Touch ID, Face ID or an Android fingerprint can verify the user. */
export async function platformAuthenticatorAvailable(): Promise<boolean> {
  try {
    if (!isPasskeySupported()) return false;
    const probe = window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable;
    return typeof probe === "function" ? !!(await probe.call(window.PublicKeyCredential)) : false;
  } catch {
    return false;
  }
}

async function conditionalMediationAvailable(): Promise<boolean> {
  try {
    if (!isPasskeySupported()) return false;
    const probe = window.PublicKeyCredential.isConditionalMediationAvailable;
    return typeof probe === "function" ? !!(await probe.call(window.PublicKeyCredential)) : false;
  } catch {
    return false;
  }
}

/** Whether the server has passkeys switched on. Never throws. */
export async function fetchPasskeyStatus(): Promise<boolean> {
  try {
    const res = await postAction({ action: "status" });
    const data = await res.json();
    return !!(data && data.success && data.available);
  } catch {
    return false;
  }
}

/**
 * Drops a stale "passkey on this device" marker once the signed-in account has no
 * passkeys at all (removed in Personal settings, or from another device). Signed-in only.
 */
export async function reconcilePasskeyMarker(): Promise<void> {
  if (!isPasskeyOnThisDevice()) return;
  try {
    const res = await postAction({ action: "list" });
    const data = await res.json();
    if (data && data.success && Array.isArray(data.passkeys) && data.passkeys.length === 0) {
      clearPasskeyOnThisDevice();
    }
  } catch {
    /* offline: keep the marker */
  }
}

// --- Registration ---------------------------------------------------------

export type RegisterResult =
  | { kind: "ok" }
  /** The user closed the OS prompt: stay silent. */
  | { kind: "cancelled" }
  /** This device already holds a passkey for the account. */
  | { kind: "excluded" }
  | { kind: "wrong-password" }
  /** No password was sent and the server wants one (the recent-sign-in window has passed). */
  | { kind: "password-required" }
  | { kind: "throttled"; message?: string }
  | { kind: "failed"; message?: string };

export interface RegisterPasskeyInput {
  name: string;
  /** Omit to rely on the server's recent-password-login window. */
  password?: string;
}

/** options -> navigator.credentials.create -> verify. */
export async function registerPasskey({ name, password }: RegisterPasskeyInput): Promise<RegisterResult> {
  try {
    const optRes = await postAction({ action: "register_options", ...(password ? { password } : {}) });

    if (!optRes.ok) {
      if (optRes.status === 403) return { kind: "wrong-password" };
      if (optRes.status === 400 && !password) return { kind: "password-required" };
      let message: string | undefined;
      try {
        const body = await optRes.json();
        if (body && typeof body.message === "string") message = body.message;
      } catch {
        /* fall back to the caller's wording */
      }
      return optRes.status === 429 ? { kind: "throttled", message } : { kind: "failed", message };
    }

    const optData = await optRes.json();
    if (!optData || !optData.success || !optData.options) return { kind: "failed" };

    let cred: Credential | null = null;
    try {
      cred = await navigator.credentials.create({ publicKey: toCreationOptions(optData.options) });
    } catch (err: unknown) {
      const kind = passkeyErrorKind(err);
      if (kind === "cancelled") return { kind: "cancelled" };
      if (kind === "excluded") return { kind: "excluded" };
      return { kind: "failed" };
    }
    if (!cred) return { kind: "cancelled" };

    const verifyRes = await postAction({
      action: "register_verify",
      name: name.trim(),
      credential: creationCredentialToJson(cred),
    });
    const verifyData = await verifyRes.json();
    if (verifyData && verifyData.success) {
      if (isThisDeviceCredential(cred)) markPasskeyOnThisDevice();
      return { kind: "ok" };
    }
    return { kind: "failed", message: typeof verifyData?.message === "string" ? verifyData.message : undefined };
  } catch {
    return { kind: "failed" };
  }
}

// --- Login ----------------------------------------------------------------

export type LoginOptionsResult =
  | { ok: true; options: PublicKeyCredentialRequestOptions }
  | { ok: false; throttled: boolean; message?: string };

export async function getLoginOptions(): Promise<LoginOptionsResult> {
  const res = await postAction({ action: "login_options" });
  if (!res.ok) {
    if (res.status === 429) return { ok: false, throttled: true };
    let message: string | undefined;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string") message = body.message;
    } catch {
      /* fall back to the caller's wording */
    }
    return { ok: false, throttled: false, message };
  }
  const data = await res.json();
  if (!data || !data.success || !data.options) return { ok: false, throttled: false };
  return { ok: true, options: toRequestOptions(data.options) };
}

/** Sends the assertion to the server. Returns the signed-in user, or null on any failure. */
export async function verifyLoginAssertion(cred: Credential, remember: boolean): Promise<UserProfile | null> {
  const res = await postAction({
    action: "login_verify",
    credential: assertionCredentialToJson(cred),
    remember,
  });
  const data = await res.json();
  if (data && data.success && data.user) {
    if (isThisDeviceCredential(cred)) markPasskeyOnThisDevice();
    return data.user as UserProfile;
  }
  return null;
}

// --- Conditional mediation (passkeys in the email field's autofill) -------

/**
 * The server keeps one pending challenge per session and expires it after 120 s,
 * so a conditional request that waits quietly must be re-issued before then.
 */
const CONDITIONAL_RESTART_MS = 90_000;

export interface ConditionalLoginHandlers {
  getRemember: () => boolean;
  onSuccess: (user: UserProfile) => void;
  /** The user picked a passkey from the autofill list but the server refused it. */
  onVerifyFailed: () => void;
}

export interface ConditionalLogin {
  /** Begin (or resume) waiting for the user to pick a passkey from autofill. */
  start: () => void;
  /**
   * Abort the pending request and stay idle until `start()`. Resolves once any
   * in-flight `login_options` call has settled, so a modal ceremony that follows
   * stores the last challenge. Used before the passkey button and password submit.
   */
  suspend: () => Promise<void>;
  /** Unmount: abort and detach the visibility listener for good. */
  dispose: () => void;
}

export function createConditionalLogin(handlers: ConditionalLoginHandlers): ConditionalLogin {
  let wanted = false;
  let generation = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let optionsInFlight: Promise<unknown> | null = null;

  const abortCurrent = () => {
    generation += 1;
    if (timer) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
  };

  const run = async () => {
    const mine = ++generation;
    const abort = new AbortController();
    controller = abort;
    const stale = () => mine !== generation;

    try {
      if (!(await conditionalMediationAvailable()) || stale()) return;

      // Deliberately not abortable: if the call is already on its way, let it
      // land so `suspend()` can wait for the server to have stored the challenge.
      const fetching = getLoginOptions();
      optionsInFlight = fetching.catch(() => undefined);
      const opts = await fetching;
      if (stale() || !opts.ok) return;

      timer = setTimeout(() => {
        if (stale()) return;
        abortCurrent();
        if (wanted && !document.hidden) run();
      }, CONDITIONAL_RESTART_MS);

      let cred: Credential | null = null;
      try {
        cred = await navigator.credentials.get({
          publicKey: opts.options,
          mediation: "conditional" as CredentialMediationRequirement,
          signal: abort.signal,
        });
      } catch {
        return; // our own abort, the user dismissing autofill, or no support: all silent
      }
      if (stale() || !cred) return;

      if (timer) clearTimeout(timer);
      timer = null;
      wanted = false; // the challenge is spent; the caller decides whether to ask again
      let user: UserProfile | null = null;
      try {
        user = await verifyLoginAssertion(cred, handlers.getRemember());
      } catch {
        user = null;
      }
      if (user) handlers.onSuccess(user);
      else handlers.onVerifyFailed();
    } catch {
      /* conditional failures stay silent */
    } finally {
      if (!stale()) controller = null;
    }
  };

  const onVisibility = () => {
    if (!wanted) return;
    if (document.hidden) abortCurrent();
    else if (!controller) run();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return {
    start() {
      wanted = true;
      if (controller || document.hidden) return;
      run();
    },
    async suspend() {
      wanted = false;
      abortCurrent();
      await optionsInFlight;
    },
    dispose() {
      wanted = false;
      abortCurrent();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
