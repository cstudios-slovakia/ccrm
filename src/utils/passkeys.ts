/**
 * WebAuthn (Passkeys) pure utility helpers.
 *
 * Runs in both browser and headless Node test environments without DOM dependencies.
 */

interface NodeBufferGlobal {
  Buffer?: {
    from: (str: string, enc: string) => { toString: (enc: string) => string };
  };
}

/** Convert base64url string (unpadded, safe) to ArrayBuffer */
export function b64uToBuffer(s: string): ArrayBuffer {
  if (typeof s !== "string") {
    return new ArrayBuffer(0);
  }
  let base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = typeof atob !== "undefined"
    ? atob(base64)
    : (globalThis as unknown as NodeBufferGlobal).Buffer?.from(base64, "base64").toString("binary") || "";
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Convert ArrayBuffer to unpadded base64url string */
export function bufferToB64u(b: ArrayBuffer): string {
  const bytes = new Uint8Array(b);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa !== "undefined"
    ? btoa(binary)
    : (globalThis as unknown as NodeBufferGlobal).Buffer?.from(binary, "binary").toString("base64") || "";
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Returns true if the client environment supports WebAuthn / Passkeys */
export function isPasskeySupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials
  );
}

/** Pre-fills a human-friendly default name for the passkey from user-agent */
export function defaultPasskeyName(userAgent: string): string {
  if (!userAgent) return "";

  const browser = [
    { pattern: /Edg|Edge/, name: "Edge" },
    { pattern: /OPR|Opera|OPiOS/, name: "Opera" },
    { pattern: /Firefox|FxiOS/, name: "Firefox" },
    { pattern: /Chrome|CriOS/, name: "Chrome" },
    { pattern: /Safari/, name: "Safari" },
  ].find(({ pattern }) => pattern.test(userAgent))?.name;

  const os = [
    { pattern: /iPhone/, name: "iPhone" },
    { pattern: /iPad|Macintosh(?=.*Mobile)/, name: "iPad" },
    { pattern: /Android/, name: "Android" },
    { pattern: /Mac/, name: "Mac" },
    { pattern: /Windows/, name: "Windows" },
  ].find(({ pattern }) => pattern.test(userAgent))?.name;

  return [browser, os].filter(Boolean).join(" on ") || "";
}

export interface ServerCreationOptionsJson {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  excludeCredentials?: Array<{ id: string; type: PublicKeyCredentialType; transports?: AuthenticatorTransport[] }>;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  extensions?: AuthenticationExtensionsClientInputs;
}

/** Converts server JSON options into browser PublicKeyCredentialCreationOptions */
export function toCreationOptions(json: ServerCreationOptionsJson): PublicKeyCredentialCreationOptions {
  const challenge = typeof json.challenge === "string" ? b64uToBuffer(json.challenge) : json.challenge;

  const user: PublicKeyCredentialUserEntity = {
    name: json.user.name,
    displayName: json.user.displayName,
    id: typeof json.user.id === "string" ? b64uToBuffer(json.user.id) : (json.user.id as unknown as ArrayBuffer),
  };

  const excludeCredentials = Array.isArray(json.excludeCredentials)
    ? json.excludeCredentials.map((c) => ({
        ...c,
        id: typeof c.id === "string" ? b64uToBuffer(c.id) : (c.id as unknown as ArrayBuffer),
      }))
    : undefined;

  return {
    ...json,
    challenge,
    user,
    excludeCredentials,
  } as PublicKeyCredentialCreationOptions;
}

export interface ServerRequestOptionsJson {
  challenge: string;
  rpId?: string;
  timeout?: number;
  allowCredentials?: Array<{ id: string; type: PublicKeyCredentialType; transports?: AuthenticatorTransport[] }>;
  userVerification?: UserVerificationRequirement;
  extensions?: AuthenticationExtensionsClientInputs;
}

/** Converts server JSON options into browser PublicKeyCredentialRequestOptions */
export function toRequestOptions(json: ServerRequestOptionsJson): PublicKeyCredentialRequestOptions {
  const challenge = typeof json.challenge === "string" ? b64uToBuffer(json.challenge) : json.challenge;

  const allowCredentials = Array.isArray(json.allowCredentials)
    ? json.allowCredentials.map((c) => ({
        ...c,
        id: typeof c.id === "string" ? b64uToBuffer(c.id) : (c.id as unknown as ArrayBuffer),
      }))
    : undefined;

  return {
    ...json,
    challenge,
    allowCredentials,
  } as PublicKeyCredentialRequestOptions;
}

export interface SerializedCreationCredential {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment?: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
    transports: string[];
  };
  clientExtensionResults: Record<string, unknown>;
}

/** Formats registration credential into JSON payload for server deserializer */
export function creationCredentialToJson(cred: Credential): SerializedCreationCredential {
  const pkCred = cred as PublicKeyCredential;
  const rawId = pkCred.rawId instanceof ArrayBuffer ? bufferToB64u(pkCred.rawId) : pkCred.id;
  const response = pkCred.response as AuthenticatorAttestationResponse;

  const clientDataJSON = response.clientDataJSON instanceof ArrayBuffer
    ? bufferToB64u(response.clientDataJSON)
    : (response.clientDataJSON || "");

  const attestationObject = response.attestationObject instanceof ArrayBuffer
    ? bufferToB64u(response.attestationObject)
    : (response.attestationObject || "");

  const transports = typeof response.getTransports === "function"
    ? response.getTransports()
    : ((response as unknown as { transports?: string[] }).transports || []);

  const res: SerializedCreationCredential = {
    id: pkCred.id || rawId,
    rawId,
    type: pkCred.type || "public-key",
    response: {
      clientDataJSON,
      attestationObject,
      transports,
    },
    clientExtensionResults: (pkCred.getClientExtensionResults ? (pkCred.getClientExtensionResults() as unknown as Record<string, unknown>) : {}),
  };

  const attachment = (pkCred as unknown as { authenticatorAttachment?: string }).authenticatorAttachment;
  if (attachment) {
    res.authenticatorAttachment = attachment;
  }

  return res;
}

export interface SerializedAssertionCredential {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment?: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string | null;
  };
  clientExtensionResults: Record<string, unknown>;
}

/** Formats assertion (login) credential into JSON payload for server deserializer */
export function assertionCredentialToJson(cred: Credential): SerializedAssertionCredential {
  const pkCred = cred as PublicKeyCredential;
  const rawId = pkCred.rawId instanceof ArrayBuffer ? bufferToB64u(pkCred.rawId) : pkCred.id;
  const response = pkCred.response as AuthenticatorAssertionResponse;

  const clientDataJSON = response.clientDataJSON instanceof ArrayBuffer
    ? bufferToB64u(response.clientDataJSON)
    : (response.clientDataJSON || "");

  const authenticatorData = response.authenticatorData instanceof ArrayBuffer
    ? bufferToB64u(response.authenticatorData)
    : ((response as unknown as { authenticatorData?: string }).authenticatorData || "");

  const signature = response.signature instanceof ArrayBuffer
    ? bufferToB64u(response.signature)
    : ((response as unknown as { signature?: string }).signature || "");

  const userHandle = response.userHandle instanceof ArrayBuffer
    ? bufferToB64u(response.userHandle)
    : (response.userHandle ? String(response.userHandle) : null);

  const res: SerializedAssertionCredential = {
    id: pkCred.id || rawId,
    rawId,
    type: pkCred.type || "public-key",
    response: {
      clientDataJSON,
      authenticatorData,
      signature,
      userHandle,
    },
    clientExtensionResults: (pkCred.getClientExtensionResults ? (pkCred.getClientExtensionResults() as unknown as Record<string, unknown>) : {}),
  };

  const attachment = (pkCred as unknown as { authenticatorAttachment?: string }).authenticatorAttachment;
  if (attachment) {
    res.authenticatorAttachment = attachment;
  }

  return res;
}

/** Classifies WebAuthn browser DOMExceptions into friendly kinds */
export function passkeyErrorKind(err: unknown): "cancelled" | "excluded" | "other" {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name: string }).name;
    if (name === "NotAllowedError" || name === "AbortError") {
      return "cancelled";
    }
    if (name === "InvalidStateError") {
      return "excluded";
    }
  }
  return "other";
}

/** Formats a relative time string using Intl.RelativeTimeFormat */
export function formatAgo(seconds: number | null | undefined, lang: "en" | "sk" | "hu" = "en"): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return "";
  }
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "always" });
  const absSec = Math.abs(seconds);

  if (absSec < 60) {
    return rtf.format(-Math.round(absSec), "second");
  }
  const minutes = absSec / 60;
  if (minutes < 60) {
    return rtf.format(-Math.round(minutes), "minute");
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return rtf.format(-Math.round(hours), "hour");
  }
  const days = hours / 24;
  if (days < 30) {
    return rtf.format(-Math.round(days), "day");
  }
  const months = days / 30;
  if (months < 12) {
    return rtf.format(-Math.round(months), "month");
  }
  const years = days / 365;
  return rtf.format(-Math.round(years), "year");
}
