// Temporary kill switches for features that are code-complete but not yet
// ready to ship to all users. Flip back to false to hide one again.

// Social Media (Zernio) section — released in 1.7.91 after the integration
// audit; kept as a switch so the section can be pulled without a code change.
export const SOCIAL_MEDIA_ENABLED = true;

// View size (Auto / Compact / Normal / Big) — see docs/VIEW-SIZE.md.
// While false: the default mode is "compact" (≈ the pre-feature look), the
// setting UI is not rendered, and a value stored in `ccrm_view_size` is still
// honoured so Normal/Big can be previewed. Phase F flips this and the default.
// index.html's pre-paint script must use the same default (unit-tested).
export const VIEW_SIZE_ENABLED = false;
