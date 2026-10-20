import { Chart, registerables } from "chart.js";

/**
 * chart.js, bundled with the app.
 *
 * It used to be loaded from `https://cdn.jsdelivr.net/npm/chart.js` by a plain
 * <script> tag — the latest version, with no integrity hash — which made a third
 * party's CDN able to run script in every CRM session, and forced that CDN into the
 * Content-Security-Policy's script-src. Bundling it removes both.
 *
 * Importing this module registers every controller, scale and element once, the same
 * thing the CDN build did for the `window.Chart` global the components used.
 */
Chart.register(...registerables);

export { Chart };
