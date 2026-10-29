# Phase 4 → phase 3

Already in `TimeTrackingView.tsx` when phase 4 finished. Keep it if you rewrite the file.

`extraTimeTrackingTabs` is imported, the screen is wrapped in `ViewingAsProvider`,
`ViewingAsSelect` sits right of the tabs, and `ccrm-time-tab` switches the tab.
Do not replace `extraTabs.tsx` with an empty array.

## 1. Extra tabs

```tsx
import { extraTimeTrackingTabs } from "./extraTabs";

// inside Tabs items, after List and Day:
...extraTimeTrackingTabs.map((tab) => ({
  key: tab.id,
  label: tab.label(t),
})),

// when the active tab is one of them:
extraTimeTrackingTabs.find((tab) => tab.id === tabKey)?.render({ deps, onNavigate })
```

`extraTimeTrackingTabs` is `{ id: 'team' | 'reports', label: (t) => string, render }`.
Do not replace the array with `[]`.

## 2. Viewing as

```tsx
import { ViewingAsProvider } from "./ViewingAsContext";
import { ViewingAsSelect } from "./ViewingAsSelect";

<ViewingAsProvider>
  {/* right of the tab bar, instead of the inline <select data-testid="viewing-as"> */}
  <ViewingAsSelect users={people} />
  {/* List and Day read the context. The scope prop can stay; they prefer context when the provider is mounted. */}
</ViewingAsProvider>
```

Context value: `{ mode: 'me' | 'team' | 'user', userId: string | null, setMode, setUserId }`.

## 3. Open entries → List

```tsx
useEffect(() => {
  const onTab = (e: Event) => {
    const next = (e as CustomEvent<string>).detail;
    if (next === "list" || next === "day" || next === "team" || next === "reports") {
      setTab(next);
      onNavigate(next === "list" ? "time-tracking" : `time-tracking/${next}`);
    }
  };
  window.addEventListener("ccrm-time-tab", onTab);
  return () => window.removeEventListener("ccrm-time-tab", onTab);
}, [onNavigate]);
```

Also follow `route` when it changes, so a hash of `time-tracking/team` opens that tab.
