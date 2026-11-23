export interface ScopeApproval {
  /** UTC ISO 8601 with `Z`, or null when the scope is not approved. */
  scopeApprovedAt: string | null;
  scopeApprovedBy: string | null;
}

/**
 * Approves or withdraws the scope of a project on the server. The approval never rides on a project
 * save (a stale tab would clear or restore it): api/project_scope_action.php stamps it with its own
 * clock and the session user, and answers with what is stored. Throws when the request failed.
 */
export const requestScopeAction = async (projectId: string, action: "approve" | "withdraw"): Promise<ScopeApproval> => {
  const response = await fetch("/api/project_scope_action.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, action }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success !== true) throw new Error(result.message || "The approval could not be saved.");
  return { scopeApprovedAt: result.scopeApprovedAt ?? null, scopeApprovedBy: result.scopeApprovedBy ?? null };
};
