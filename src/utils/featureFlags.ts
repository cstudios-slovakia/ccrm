// Temporary kill switches for features that are code-complete but not yet
// ready to ship to all users. Flip back to false to hide one again.

// Social Media (Zernio) section — released in 1.7.91 after the integration
// audit; kept as a switch so the section can be pulled without a code change.
export const SOCIAL_MEDIA_ENABLED = true;

// View size (Auto / Compact / Normal / Big) — see docs/VIEW-SIZE.md.
// While false: the default mode is "compact" (≈ the pre-feature look), the
// setting UI is not rendered, and a value stored in `ccrm_view_size` is still
// honoured so Normal/Big can be previewed. Enabled in Phase F: default "auto".
// index.html's pre-paint script must use the same default (unit-tested).
export const VIEW_SIZE_ENABLED = true;

// Automatic project creation from incoming leads — PROJECT-AUTO-CREATE-DISABLED
// (v1.9.29). While false its settings card is hidden, and so is the Projects &
// tasks › Auto-create section. Setting this back to true also needs the server
// calls restored — grep for the same marker.
export const PROJECT_AUTO_CREATE_ENABLED = false;
