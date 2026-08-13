/**
 * Web-storage safety net.
 *
 * On iOS Safari with "Block All Cookies" enabled — and in some in-app webviews,
 * partitioned third-party contexts and low-disk situations — reading
 * `window.localStorage` does not return null, it *throws*:
 *
 *     SecurityError: The operation is insecure.
 *
 * Every unguarded `localStorage.getItem(...)` in the app therefore crashed the
 * whole SPA into the ErrorBoundary before it could paint a single pixel, and the
 * customer only saw the red "Application runtime exception" screen.
 *
 * We probe both storages once, before React mounts, and swap in an in-memory
 * stand-in whenever the real one is unusable. The app then behaves normally for
 * the lifetime of the page; only persistence across reloads is lost, which is
 * exactly what a browser configured to forbid storage is asking for.
 *
 * Durable state does NOT rely on this: user preferences live in the DB
 * (`users.metadata_json.preferences`, see utils/userPrefs.ts) and CRM data comes
 * from sync.php. What is left in web storage is the per-tab session identity and
 * a couple of caches, all of which are allowed to be volatile.
 */

type StorageKind = "localStorage" | "sessionStorage";

const STORAGE_KINDS: StorageKind[] = ["localStorage", "sessionStorage"];

/** Tracks, per kind, whether writes actually survive a reload. */
const persistent: Record<StorageKind, boolean> = {
  localStorage: true,
  sessionStorage: true,
};

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      const value = store.get(String(key));
      return value === undefined ? null : value;
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  } as Storage;
};

/**
 * A read/write round-trip is the only reliable probe: Safari throws on the
 * property access itself, private modes of older browsers accept the getter but
 * throw on setItem, and a full quota throws only on write.
 */
const isUsable = (kind: StorageKind): boolean => {
  try {
    const storage = window[kind];
    if (!storage) return false;
    const probeKey = "__ccrm_storage_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return true;
  } catch (e) {
    return false;
  }
};

export const installStorageFallback = (): void => {
  STORAGE_KINDS.forEach((kind) => {
    if (isUsable(kind)) return;
    persistent[kind] = false;
    try {
      // `localStorage` is an accessor on the Window instance, so a plain
      // assignment is ignored (or throws in strict mode) — it has to be
      // redefined. `configurable` keeps the descriptor replaceable.
      Object.defineProperty(window, kind, {
        value: createMemoryStorage(),
        configurable: true,
        writable: false,
      });
    } catch (e) {
      // Nothing further we can do; call sites are individually guarded.
    }
  });
};

/**
 * False when the given storage is our in-memory stand-in, i.e. nothing written
 * to it will be there after a reload. Callers that use storage as a "have I
 * already done this once?" latch across reloads must check this — see the
 * chunk-error reload guard in App.tsx, which would otherwise reload forever.
 */
export const hasPersistentStorage = (kind: StorageKind): boolean => persistent[kind];

// Installed on import so that module evaluation order alone guarantees the
// fallback is in place before any other module touches storage.
installStorageFallback();
