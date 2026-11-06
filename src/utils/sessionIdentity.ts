/**
 * Who the logged-in user is, by id rather than e-mail.
 *
 * The e-mail is editable (Personal settings, the user card), so matching on it lost
 * track of the logged-in user the moment they changed their own address: the app
 * kept the stale profile, the server's session soon reported the new address, and
 * the tab logged itself out as if someone else had signed in. The e-mail is only a
 * fallback for a profile or server answer that predates ids.
 */

type Identity = { id?: unknown; email?: unknown } | null | undefined;

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** The row in `users` that is `me`: same id, or same e-mail when an id is missing. */
export const findSelf = <T extends { id?: unknown; email?: unknown }>(users: T[], me: Identity): T | undefined => {
  if (!me) return undefined;
  const id = String(me.id ?? "");
  if (id !== "") {
    const byId = users.find((u) => String(u.id ?? "") === id);
    if (byId) return byId;
  }
  const email = norm(me.email);
  return email === "" ? undefined : users.find((u) => norm(u.email) === email);
};

/** True when the server's session belongs to someone other than the user this tab shows. */
export const isDifferentSessionUser = (sessionUser: Identity, shown: Identity): boolean => {
  if (!sessionUser || !shown) return false;
  const serverId = String(sessionUser.id ?? "");
  const shownId = String(shown.id ?? "");
  if (serverId !== "" && shownId !== "") return serverId !== shownId;
  const serverEmail = norm(sessionUser.email);
  const shownEmail = norm(shown.email);
  return serverEmail !== "" && shownEmail !== "" && serverEmail !== shownEmail;
};
