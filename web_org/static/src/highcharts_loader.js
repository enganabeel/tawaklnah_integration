import {loadJS} from '@web/core/assets';

let highchartsPromise;

/**
 * Ensure Highcharts + organization module are loaded exactly once.
 * - If Highcharts already exists on window (maybe loaded by another module),
 *   we DO NOT reload highcharts.js.
 * - We only load sankey/organization modules if missing.
 * Returns a Promise<Highcharts>.
 */
export function ensureHighchartsLoaded() {
    if (!highchartsPromise) {
        highchartsPromise = (async () => {
            if (!window.Highcharts) {
                await loadJS('/web_org/static/lib/highcharts/highcharts.js');
            }
            const H = window.Highcharts;
            if (!H) {
                throw new Error('Highcharts did not load correctly.');
            }

            if (!H.seriesTypes || !H.seriesTypes.sankey) {
                await loadJS('/web_org/static/lib/highcharts/sankey.js');
            }

            if (!H.seriesTypes || !H.seriesTypes.organization) {
                await loadJS('/web_org/static/lib/highcharts/organization.js');
            }

            // Highcharts sanitizes useHTML content through its AST and strips
            // any attribute not on this allow-list (logging "warning #33"). Our
            // card templates rely on these data-* hooks, so keep them.
            const allowed = H.AST?.allowedAttributes;
            if (allowed) {
                for (const attr of ['data-open-employees', 'data-dept-name', 'data-select-node']) {
                    if (!allowed.includes(attr)) {
                        allowed.push(attr);
                    }
                }
            }

            return H;
        })();
    }
    return highchartsPromise;
}
