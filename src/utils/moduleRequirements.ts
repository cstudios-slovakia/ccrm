/**
 * What a module needs configured before it can do anything.
 *
 * RAG AI and Mail used to be hidden from the navigation until their setup was
 * done, so a fresh install gave no hint they existed or what they were waiting
 * for. They are always listed now; these checks decide whether the view runs or
 * shows ModuleSetupRequired instead.
 */

/** A vector database was chosen in Settings → AI and passed the connection test. */
export const isVectorDbConfigured = (integrationsConfig: any): boolean => {
  const db = integrationsConfig?.vectorDb;
  return integrationsConfig?.vectorDbValidated === true && typeof db === "string" && db !== "" && db !== "none";
};

/** The user connected and verified their own mailbox in Personal settings → Email. */
export const isPersonalMailboxConfigured = (user: { metadata_json?: unknown } | null | undefined): boolean => {
  if (!user?.metadata_json) return false;
  try {
    const meta = typeof user.metadata_json === "string" ? JSON.parse(user.metadata_json) : user.metadata_json;
    return (meta as any)?.emailSettings?.isValidated === true;
  } catch {
    return false;
  }
};
