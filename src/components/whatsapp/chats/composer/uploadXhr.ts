/**
 * Upload a form with progress. `fetch` cannot report how much of a request body has been sent, and a
 * 30 MB video over a slow line needs a bar, so attachments go through XMLHttpRequest. The answer is
 * decoded the way `WaaiClient` decodes it (JSON, or WAAI's error envelope).
 */

import type { ApiErrorBody } from "../../api/contract.ts";
import { WaaiApiError, type WaaiErrorCode } from "../../api/waaiClient.ts";

export interface UploadOptions {
  url: string;
  token: string;
  body: FormData;
  /** Called with 0..1 as the body goes out. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** The part of XMLHttpRequest used here, so a test can stand in for it. */
export interface XhrLike {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: FormData): void;
  abort(): void;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  status: number;
  responseText: string;
  getResponseHeader(name: string): string | null;
  withCredentials: boolean;
}

/** The error an answer with a non-2xx status stands for. */
export function failureOf(status: number, text: string, retryAfter: string | null): WaaiApiError {
  const retry = Number(retryAfter);
  const wait = Number.isFinite(retry) && retry > 0 ? retry : null;
  try {
    const json = JSON.parse(text) as Partial<ApiErrorBody> | null;
    if (json?.error && typeof json.error.code === "string") {
      return new WaaiApiError(status, json.error.code, json.error.message ?? "", json.error.request_id ?? null, wait);
    }
  } catch {
    // not JSON: a proxy's error page, say
  }
  const code: WaaiErrorCode =
    status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 404 ? "not_found" : status === 413 ? "payload_too_large" : status === 429 ? "rate_limited" : "server_error";
  return new WaaiApiError(status, code, `WAAI answered ${status}.`, null, wait);
}

export function uploadWithProgress<T>(opts: UploadOptions, create: () => XhrLike = () => new XMLHttpRequest() as unknown as XhrLike): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const xhr = create();
    xhr.open("POST", opts.url);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.token}`);
    xhr.setRequestHeader("Accept", "application/json");
    // WAAI's API ignores cookies, and the CRM's own cookie has no business there.
    xhr.withCredentials = false;
    const onAbort = () => xhr.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const done = () => opts.signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          opts.onProgress?.(1);
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new WaaiApiError(xhr.status, "invalid_response", "WAAI sent an answer that is not JSON."));
        }
      } else {
        reject(failureOf(xhr.status, xhr.responseText, xhr.getResponseHeader("Retry-After")));
      }
    };
    xhr.onerror = () => {
      done();
      reject(new WaaiApiError(0, "network", "WAAI could not be reached."));
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException("Aborted", "AbortError"));
    };
    xhr.send(opts.body);
  });
}
