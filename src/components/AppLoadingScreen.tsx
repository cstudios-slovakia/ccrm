import React from "react";

interface AppLoadingScreenProps {
  systemName: string;
  label: string;
}

/**
 * Lightweight, theme-aware startup loading surface shown while initial database
 * sync resolves. Uses a semantic indeterminate `<progress>` spinner driven by pure CSS.
 */
export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({ systemName, label }) => {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6 bg-background text-foreground font-sans select-none">
      <div className="w-full max-w-xs sm:max-w-sm rounded-2xl bg-card text-card-foreground border border-border shadow-sm px-8 py-9 flex flex-col items-center text-center">
        <progress aria-label={label} className="loading-spinner" />
        <h2 className="mt-5 text-title font-heading font-semibold tracking-[-0.02em] text-card-foreground">
          {systemName}
        </h2>
        <p role="status" aria-live="polite" className="mt-2 text-ui text-muted-foreground">
          {label}
        </p>
      </div>
    </main>
  );
};
