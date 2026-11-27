import React from "react";

/**
 * A text input that saves once, when the user is done, instead of on every keystroke.
 *
 * The draft lives here. It is handed to `onCommit` on blur or Enter, and only if it
 * differs from `value`. Escape puts the stored value back. An edit still open when the
 * field unmounts (the card closes, the route changes) is saved rather than dropped.
 *
 * Why: the user card wrote name, email and password through `setUsers` on every
 * keystroke. Each one was a full sync push, a half-typed email was stored (and could
 * collide with another account's), and a half-typed password became the real one.
 *
 * `required` refuses an empty commit and restores the stored value. `trim` trims
 * before comparing and saving; leave it off for passwords.
 */
export const CommitOnBlurInput: React.FC<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
    value: string;
    onCommit: (next: string) => void;
    trim?: boolean;
  }
> = ({ value, onCommit, trim = false, required, onBlur, onFocus, onKeyDown, ...rest }) => {
  const [draft, setDraft] = React.useState(value);
  const focusedRef = React.useRef(false);

  // A new stored value (another tab, a pull) replaces the draft unless the user is typing.
  React.useEffect(() => {
    if (!focusedRef.current) setDraft(value);
  }, [value]);

  const pending = React.useRef({ draft, value, onCommit, trim, required });
  pending.current = { draft, value, onCommit, trim, required };

  const commit = React.useCallback(() => {
    const cur = pending.current;
    const next = cur.trim ? cur.draft.trim() : cur.draft;
    if (cur.required && next.trim() === "") {
      setDraft(cur.value);
      return;
    }
    if (next !== cur.value) cur.onCommit(next);
    if (next !== cur.draft) setDraft(next);
  }, []);

  React.useEffect(
    () => () => {
      if (focusedRef.current) commit();
    },
    [commit],
  );

  return (
    <input
      {...rest}
      required={required}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        focusedRef.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focusedRef.current = false;
        commit();
        onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          pending.current.draft = value;
          e.currentTarget.blur();
        }
        onKeyDown?.(e);
      }}
    />
  );
};
