import {
    Component,
    onMounted,
    onWillStart,
    onWillUnmount,
    useEffect,
    useRef,
    useState,
} from '@odoo/owl';
import { ensureHighchartsLoaded } from './highcharts_loader';
import { useService } from '@web/core/utils/hooks';
import { useViewCompiler } from '@web/views/view_compiler';
import { KanbanCompiler } from '@web/views/kanban/kanban_compiler';
import { renderToString } from '@web/core/utils/render';
import { getFormattedValue } from '@web/views/utils';

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const linkKey = (from, to) => `${from}->${to}`;

// Highcharts' organization series builds its nodes out of the links, so a
// record with no parent and no children on screen cannot be drawn on its own.
// The model marks those with a self-link; handing that to Highcharts is what
// produces a stray loop around a collapsed, zero-height box. Every isolated
// node is linked from this one invisible anchor instead.
const ISOLATED_ANCHOR_ID = '__org_isolated_anchor__';

// When a search filter is active the chart shows only a slice of the tree
// (e.g. one department "& everything below"). At the full design box size a
// deep slice still fills the whole page, so shrink the boxes while filtered
// to keep the filtered view compact and readable.
const FILTERED_NODE_SCALE = 0.6;

// In the Vertical (hanging) layout every department sits alone on its row and
// otherwise stretches to the full page width. While filtered, cap the chart to
// this width (plus the hanging-indent staircase) so the boxes stay compact.
const FILTERED_VERTICAL_WIDTH = 700;

export class OrgRenderer extends Component {
    static template = 'web_org.OrgRenderer';
    static Compiler = KanbanCompiler;
    static props = {
        model: Object,
        archInfo: Object,
        templates: { type: Object, optional: true },
    };

    setup() {
        this.containerRef = useRef('chart');
        this.chart = null;
        this.highcharts = null;
        this.action = useService('action');

        const { templates = {}, inverted, nodeWidth, nodeHeight, padding } = this.props.archInfo;
        // Base (design) sizes from the view arch. The effective sizes used to
        // draw are derived from these each render, shrunk while a filter is
        // active - see `_applyNodeSizing`.
        this.baseNodeWidth = nodeWidth;
        this.baseNodeHeight = nodeHeight;
        this.basePadding = padding;
        this.nodeWidth = nodeWidth;
        this.nodeHeight = nodeHeight;
        this.padding = padding;

        this.state = useState({
            inverted,
            hideIsolatedNodes: false,
            hideDimmedNodes: false,
            selectedNodeId: null,
        });

        this.compiledTemplates = useViewCompiler(this.constructor.Compiler, templates);
        this.cardTemplate = this.compiledTemplates['org-box'] || Object.values(templates)[0];
        this._prepareCardTemplate();

        onWillStart(async () => {
            this.highcharts = await ensureHighchartsLoaded();
        });

        onMounted(() => {
            this._renderChart();
        });

        onWillUnmount(() => {
            this.chart?.destroy();
            this.chart = null;
        });

        useEffect(
            () => this._renderChart(),
            () => [
                this.props.model.data,
                this.state.inverted,
                this.state.hideDimmedNodes,
                this.state.hideIsolatedNodes,
                this.state.selectedNodeId,
            ]
        );

        this.selectNodeAndLinks = this.selectNodeAndLinks.bind(this);
    }

    openRecord() {
        this._openRecordForm(this.state.selectedNodeId);
    }

    toggleDimmedNodes() {
        this.state.hideDimmedNodes = !this.state.hideDimmedNodes;
    }

    toggleIsolatedNodes() {
        this.state.hideIsolatedNodes = !this.state.hideIsolatedNodes;
    }

    toggleOrientation() {
        this.state.inverted = !this.state.inverted;
    }

    // ---------- Helpers ----------

    _selectNode(nodeId) {
        if (this.state.selectedNodeId !== nodeId) {
            this.state.selectedNodeId = nodeId || null;
            return;
        }
        this.state.selectedNodeId = null;
        this.state.hideDimmedNodes = false;
    }

    _getRelated(nodeId) {
        if (!nodeId) return new Set();

        const links = this.props.model.data.links || [];

        const parents = new Set();
        const children = new Set();

        const collectParents = (id) => {
            for (const [from, to] of links) {
                if (to === id && !parents.has(from)) {
                    parents.add(from);
                    collectParents(from);
                }
            }
        };

        const collectChildren = (id) => {
            for (const [from, to] of links) {
                if (from === id && !children.has(to)) {
                    children.add(to);
                    collectChildren(to);
                }
            }
        };

        collectParents(nodeId);
        collectChildren(nodeId);

        return new Set([nodeId, ...parents, ...children]);
    }

    _getRenderingContext(record) {
        return {
            context: this.props.model.config.context,
            JSON,
            luxon,
            record,
            __comp__: Object.assign(Object.create(this), {
                this: this,
                props: { ...this.props, record },
                getFormattedValue: this.getFormattedValue,
            }),
            __record__: record,
        };
    }

    getNodeById(nodeId) {
        return this.props.model.data.nodesById[nodeId];
    }

    getFormattedValue(fieldId) {
        const { archInfo, record } = this.props;
        const fieldInfo = archInfo.fieldNodes[fieldId];
        return getFormattedValue(record, fieldInfo.name, fieldInfo);
    }

    removeIntermediateLinks(links) {
        const adjacency = new Map();
        for (const [from, to] of links) {
            if (!adjacency.has(from)) adjacency.set(from, new Set());
            adjacency.get(from).add(to);
        }

        const result = [];
        for (const [from, to] of links) {
            const children = adjacency.get(from) || new Set();
            const isIntermediate = Array.from(children).some(
                (mid) => adjacency.get(mid)?.has(to)
            );
            if (!isIntermediate) {
                result.push([from, to]);
            }
        }
        return result;
    }

    _prepareCardTemplate() {
        if (!this.cardTemplate) {
            this.renderCardHtml = null;
            return;
        }
        this.renderCardHtml = (node) => renderToString(this.cardTemplate, this._getRenderingContext(node.values));
    }

    _openRecordForm(resId) {
        if (resId) {
            this.env.services.action.switchView('form', { resId });
        }
    }

    // The SVG node reliably receives the click (it sits above the HTML card
    // layer). To tell an "employee icon" click from a "card" click we hit-test
    // the click coordinates against the badge's on-screen rectangle — the badge
    // HTML element is always laid out over the node even though it's behind the
    // SVG. Returns true when the pointer is inside the badge for `nodeId`.
    _isBadgeClick(nodeId, event) {
        const el = this.containerRef.el;
        if (!el) {
            return false;
        }
        const badge = el.querySelector(`[data-open-employees="${nodeId}"]`);
        if (!badge) {
            return false;
        }
        let x = event?.clientX;
        let y = event?.clientY;
        if (typeof x !== 'number' || typeof y !== 'number') {
            // Fall back to Highcharts' chart-relative coordinates.
            const cr = el.getBoundingClientRect();
            x = cr.left + (event?.chartX ?? -1);
            y = cr.top + (event?.chartY ?? -1);
        }
        const r = badge.getBoundingClientRect();
        const hit = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        console.debug('[web_org] employee badge hit-test', {
            nodeId,
            click: { x, y },
            badgeRect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
            hit,
        });
        return hit;
    }

    _openEmployees(departmentId, departmentName) {
        // Only meaningful for the department org chart.
        if (this.props.model.resModel !== 'hr.department') {
            return;
        }
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: departmentName ? `${departmentName} — Employees` : 'Employees',
            res_model: 'hr.employee',
            views: [[false, 'kanban'], [false, 'list'], [false, 'form']],
            domain: [['department_id', '=', departmentId]],
            context: {
                search_default_department_id: departmentId,
                default_department_id: departmentId,
            },
            target: 'current',
        });
    }

    _escapeHTML(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _computeChartSize(depth, maxBreadth, isVertical, hangingDepth = 0) {
        const { hangingIndent = 0, hangingIndentTranslation } = this.props.archInfo;

        // With hangingIndentTranslation 'shrink' every hanging level costs the
        // card `hangingIndent` px of usable breadth, so buy the staircase back
        // per column slot - otherwise deep nodes get squeezed below the design
        // width and their titles start truncating.
        const shrinkExtra =
            isVertical && hangingIndentTranslation === 'shrink' ? hangingDepth * hangingIndent : 0;
        const slotWidth = this.nodeWidth + this.padding + shrinkExtra;

        const baseWidth = isVertical ? maxBreadth : depth;
        const baseHeight = isVertical ? depth : maxBreadth;

        const chartHeight = clamp(baseHeight * (this.nodeHeight + this.padding), 200, 48000);

        let chartWidth = clamp(
            baseWidth * (isVertical ? slotWidth : this.nodeWidth + this.padding),
            200,
            48000
        );

        // Filtered + Vertical: a narrow hanging slice is one box per row, so its
        // natural width is tiny and CSS `min-width: 100%` would stretch every
        // box across the page. Give it a comfortable floor (the boxes are
        // centered by the `o_org_filtered` class, which also drops that
        // min-width). A wider filtered tree keeps its larger natural width, so
        // its boxes are never crushed below design size.
        if (isVertical && this.isFiltered) {
            chartWidth = Math.max(chartWidth, FILTERED_VERTICAL_WIDTH + hangingDepth * hangingIndent);
        }

        return { chartWidth, chartHeight };
    }

    // True when a search filter is narrowing the chart to a slice of the tree.
    get isFiltered() {
        const domain = this.props.model.config.domain;
        return Array.isArray(domain) && domain.length > 0;
    }

    // Derive the effective box sizes for this render: full design size normally,
    // shrunk while a filter is active so a deep filtered slice stays compact
    // instead of stretching over the whole page. Everything downstream reads
    // `this.nodeWidth/nodeHeight/padding`, so setting them here is enough.
    _applyNodeSizing() {
        const scale = this.isFiltered ? FILTERED_NODE_SCALE : 1;
        this.nodeWidth = Math.round(this.baseNodeWidth * scale);
        this.nodeHeight = Math.round(this.baseNodeHeight * scale);
        this.padding = Math.round(this.basePadding * scale);
    }

    // `column` pins are absolute row numbers, worked out for the chart as a
    // whole. A search shows a slice of it in which those rows no longer exist:
    // the pin then leaves a block of empty rows above the box, and Highcharts
    // collapses the box itself to zero height. So pins apply unfiltered only.
    get columnPinsEnabled() {
        return !this.isFiltered;
    }

    // Ids of nodes carrying an explicit column pin. Highcharts skips its whole
    // hanging block for such a node (`!defined(options.column)`), which is the
    // only way to keep one child out of a hanging parent's vertical stack.
    _getPinnedColumnIds() {
        const field = this.props.archInfo.columnFieldName;
        if (!field || !this.state.inverted || !this.columnPinsEnabled) {
            return new Set();
        }
        const ids = new Set();
        for (const n of this.props.model.data.nodes || []) {
            const col = n.values?.data?.[field];
            if (Number.isInteger(col) && col > 0) {
                ids.add(n.id);
            }
        }
        return ids;
    }

    _buildHighchartsNodes(nodes, relatedIds = new Set(), selectedId = null) {
        const hasImageField = !!this.props.archInfo.imageFieldName;
        const resModel = this.props.model.resModel;
        const imageField = this.props.model.imageField;
        const highlightMode = !!selectedId;

        return nodes.map((n) => {
            const isRelated = relatedIds.has(n.id);
            const isSelected = n.id === selectedId;
            const isDimmed = highlightMode && !isRelated;
            const status = isSelected ? 'selected' : isRelated ? 'related' : isDimmed ? 'dimmed' : 'normal';

            const point = {
                id: n.id,
                name: n.name,
                tooltip: n.tooltip,
                height: this.nodeHeight,
                status,
                isSelected,
                isRelated,
                isDimmed,
                values: n.values,
            };

            if (hasImageField) {
                point.image = `/web/image/${resModel}/${n.id}/${imageField}`;
            }
            if (this.renderCardHtml) {
                point.cardHtml = this.renderCardHtml(n);
            }

            // Hanging layout only works top-down: in a left->right chart the
            // per-node `height` above pins shapeArgs.height, so Highcharts eats
            // the indent out of the card instead of turning it into one. Emit
            // layout and column together - a pin computed for the hanging
            // arrangement would leave a hole in a non-hanging chart.
            if (this.state.inverted) {
                const { layoutFieldName, columnFieldName } = this.props.archInfo;
                const layout = layoutFieldName && n.values?.data?.[layoutFieldName];
                if (layout === 'hanging' || layout === 'normal') {
                    point.layout = layout;
                }
                const column = columnFieldName && n.values?.data?.[columnFieldName];
                if (this.columnPinsEnabled && Number.isInteger(column) && column > 0) {
                    point.column = column;
                }
            }
            // An isolated node is a root of what is on screen, so put it in the
            // first column: without this it lands one row below its anchor,
            // reading as the child of nothing.
            if (n.isolated) {
                point.column = 0;
            }
            return point;
        });
    }

    _buildHighchartsSeries(data, relatedIds = new Set()) {
        const pinned = this._getPinnedColumnIds();
        // Highcharts' hanging column arithmetic walks fromNode.linksFrom in
        // series.data order and adds the descendant count of every sibling it
        // passes - including column-pinned ones. Emitting links to pinned nodes
        // last keeps them out of their hanging siblings' column maths.
        // Array#sort is stable, so the remaining order is preserved.
        const ordered = pinned.size
            ? [...data].sort((a, b) => (pinned.has(a[1]) ? 1 : 0) - (pinned.has(b[1]) ? 1 : 0))
            : data;

        return ordered.map(([from, to]) => {
            if (from === to) {
                // Isolated node: hang it off the invisible anchor instead of
                // off itself. `lineWidth: 0` is what keeps the connector from
                // being drawn - a link colour does not reach its graphic.
                return {
                    from: ISOLATED_ANCHOR_ID,
                    to,
                    className: 'o_org_link_hidden',
                    link: { lineWidth: 0 },
                };
            }
            return {
                from,
                to,
                color: relatedIds.has(from) && relatedIds.has(to) ? '#3b82f6' : 'rgba(0, 0, 0, 0.15)',
            };
        });
    }

    /**
     * The node every isolated box hangs from. Highcharts never creates a node
     * that appears in no link, so this is what keeps a parentless, childless
     * record on screen: one pixel thin, transparent, no card, no tooltip.
     */
    _buildIsolatedAnchorNode() {
        return {
            id: ISOLATED_ANCHOR_ID,
            name: '',
            height: 1,
            color: 'transparent',
            borderColor: 'transparent',
            className: 'o_org_node_hidden',
            dataLabels: { enabled: false },
        };
    }

    selectNodeAndLinks(chart = null, nodeId) {
        const targetChart = chart || this.chart;
        const series = targetChart?.series?.[0];
        if (!series) return;

        series.points.forEach((p) => {
            p.setState('');
            p.selected = false;
        });

        const node = series.nodes.find((n) => n.id === nodeId);
        if (!node) return;

        node.select(true, false);

        const relatedIds = this._getRelated(nodeId);
        series.points.forEach((p) => {
            if (!p.isNode && p.graphic && p.from !== ISOLATED_ANCHOR_ID) {
                const related = relatedIds.has(p.from) && relatedIds.has(p.to);
                p.graphic.addClass(related ? 'highcharts-path-highlight' : 'highcharts-path-dimmed');
            }
        });
    }

    get relatedIds() {
        return this._getRelated(this.state.selectedNodeId);
    }

    get links() {
        const data = this.props.model.data || {};
        const relatedIds = this.relatedIds;

        let result = data.nonIsolatedLinks || [];
        if (this.state.hideDimmedNodes && relatedIds.size) {
            result = result.filter((l) => relatedIds.has(l[0]) && relatedIds.has(l[1]));
        }

        result = this.removeIntermediateLinks(result);

        if (!this.state.hideIsolatedNodes && data.isolatedLinks) {
            let isolated = data.isolatedLinks;
            if (this.state.hideDimmedNodes && relatedIds.size) {
                isolated = isolated.filter((l) => relatedIds.has(l[0]) && relatedIds.has(l[1]));
            }
            result = [...result, ...isolated];
        }

        return result;
    }

    get nodes() {
        let result = this.props.model.data.nodes || [];
        if (this.state.hideIsolatedNodes) {
            result = result.filter((n) => !n.isolated);
        }
        if (this.state.hideDimmedNodes) {
            const relatedIds = this.relatedIds;
            result = result.filter((n) => relatedIds.has(n.id));
        }
        return result;
    }

    // ---------- Chart options (extension points) ----------

    /**
     * The `organization` series options. Split out of `_renderChart` so that a
     * module can tune the chart with a small `patch()` instead of copying the
     * whole config object.
     */
    _getSeriesOptions(seriesData, highNodes) {
        const {
            hangingIndent,
            hangingIndentTranslation,
            hangingSide,
            linkType,
            linkRadius,
            linkLineWidth,
        } = this.props.archInfo;
        const escapeHTML = (txt) => this._escapeHTML(txt);

        return {
            type: 'organization',
            states: {
                select: { color: '#ffcccc', borderColor: '#ff0000', lineWidth: 2 },
            },
            data: seriesData,
            nodes: highNodes,
            nodeWidth: this.state.inverted ? this.nodeHeight : this.nodeWidth,
            // Hanging layout: nodes flagged via `layout_field` stack their
            // children vertically, progressively indented. Defaults match
            // Highcharts', so views that set none of these are unaffected.
            hangingIndent,
            hangingIndentTranslation,
            hangingSide,
            linkRadius,
            linkLineWidth,
            link: { type: linkType, radius: linkRadius, lineWidth: linkLineWidth },
            borderColor: '#999999',
            borderWidth: 1,
            colorByPoint: false,
            color: 'white',
            dataLabels: {
                useHTML: true,
                padding: 0,
                align: 'center',
                verticalAlign: 'middle',
                borderWidth: 0,
                nodeFormatter: function () {
                    const point = this.point;
                    const extraClass = `o_org_node--${point.status}`;

                    if (point.cardHtml) {
                        return `
                            <div class="o_org_node_inner ${extraClass}">
                                ${point.cardHtml}
                            </div>
                        `;
                    }

                    const name = escapeHTML(point.name || '');
                    const imgHtml = point.image
                        ? `
                            <div class="o_org_node_img_wrap">
                                <img src="${point.image}" alt="${name}" class="o_org_node_img"/>
                            </div>
                          `
                        : '';

                    return `
                        <div class="o_org_node_inner ${extraClass}">
                            ${imgHtml}
                            <div class="o_org_node_title">${name}</div>
                        </div>
                    `;
                },
                style: { textOutline: 'none' },
            },
        };
    }

    _getPlotOptions() {
        const renderer = this;
        return {
            series: {
                animation: false,
                linkOpacity: 0.7,
                cursor: 'pointer',
                nodeWidth: this.state.inverted ? this.nodeHeight : this.nodeWidth,
                nodePadding: this.padding,
                point: {
                    events: {
                        click: function (event) {
                            if (!this.isNode || this.id === ISOLATED_ANCHOR_ID) {
                                return;
                            }
                            // For the department chart, clicking the employee
                            // icon opens that department's employees; clicking
                            // anywhere else on the card selects the node, which
                            // reveals the toolbar "Open <name>" button.
                            if (
                                renderer.props.model.resModel === 'hr.department' &&
                                renderer._isBadgeClick(this.id, event)
                            ) {
                                renderer._openEmployees(this.id, this.name);
                                return;
                            }
                            renderer._selectNode(this.id);
                        },
                    },
                },
            },
        };
    }

    // ---------- Main render ----------

    _renderChart() {
        if (!this.highcharts) return;

        const el = this.containerRef.el;
        if (!el) return;

        // Size the boxes for this render (shrunk while filtered) before any
        // node/option is built from this.nodeWidth/nodeHeight/padding.
        this._applyNodeSizing();

        // Let the filtered view keep its compact computed width instead of
        // being stretched to full width by the chart area's `min-width: 100%`.
        el.classList.toggle('o_org_filtered', this.isFiltered);

        const links = this.links;
        const nodes = this.nodes || [];

        if (!nodes.length) {
            this.chart?.destroy();
            this.chart = null;
            el.innerHTML = '';
            return;
        }

        const isVerticalView = this.state.inverted;
        this.chart?.destroy();
        this.chart = null;

        const Highcharts = this.highcharts;
        const renderer = this;
        const selectedId = this.state.selectedNodeId;
        const relatedIds = this._getRelated(selectedId);
        const seriesData = this._buildHighchartsSeries(links, relatedIds);
        const highNodes = this._buildHighchartsNodes(nodes, relatedIds, selectedId);
        if (seriesData.some((link) => link.from === ISOLATED_ANCHOR_ID)) {
            highNodes.push(this._buildIsolatedAnchorNode());
        }
        const escapeHTML = (txt) => this._escapeHTML(txt);

        this.chart = Highcharts.chart(el, {
            chart: {
                inverted: isVerticalView,
                animation: false,
                backgroundColor: 'transparent',
                events: {
                    load: function () {
                        const series = this.series[0];
                        const levelCounts = {};
                        let maxColumn = 0;
                        let maxHangingDepth = 0;

                        // The isolated anchor is counted like any other node:
                        // invisible or not, Highcharts gives it a slot in its
                        // column, and leaving it out of the breadth here is
                        // what squeezes the real cards below their design width.
                        (series.nodes || []).forEach((node) => {
                            const level = node.column || 0;
                            levelCounts[level] = (levelCounts[level] || 0) + 1;
                            if (level > maxColumn) {
                                maxColumn = level;
                            }
                            let hangingDepth = 0;
                            for (let h = node.hangsFrom; h; h = h.hangsFrom) {
                                hangingDepth++;
                            }
                            if (hangingDepth > maxHangingDepth) {
                                maxHangingDepth = hangingDepth;
                            }
                        });

                        // Highcharts pads nodeColumns up to max(column) + 1 and
                        // spaces rows with plotSize / (nodeColumns.length - 1),
                        // so counting only *populated* columns under-sizes the
                        // canvas as soon as hanging or a column pin leaves a gap.
                        const depth = maxColumn + 1;
                        const maxBreadth = Math.max(1, ...Object.values(levelCounts));
                        const { chartWidth, chartHeight } = renderer._computeChartSize(
                            depth,
                            maxBreadth,
                            isVerticalView,
                            maxHangingDepth
                        );
                        el.style.width = `${chartWidth}px`;
                        el.style.height = `${chartHeight}px`;
                    },
                    render: function () {
                        renderer.selectNodeAndLinks(this, selectedId);
                    },
                },
            },
            title: { text: '' },
            credits: { enabled: false },

            tooltip: {
                outside: true,
                useHTML: true,
                style: { zIndex: 9999 },
                formatter: function () {
                    const p = this.point;
                    if (p.isNode ? p.id === ISOLATED_ANCHOR_ID : p.from === ISOLATED_ANCHOR_ID) {
                        return false;
                    }
                    const label = p.isNode
                        ? p.tooltip || p.name
                        : `${p.fromNode.name} → ${p.toNode.name}`;
                    return `<div class="o_org_tooltip">${escapeHTML(label || '')}</div>`;
                },
            },

            series: [this._getSeriesOptions(seriesData, highNodes)],

            plotOptions: this._getPlotOptions(),
        });

        setTimeout(() => {
            this.chart?.reflow();
        });
    }
}
