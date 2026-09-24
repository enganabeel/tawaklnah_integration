import { Model } from '@web/model/model';

const DEFAULT_CONFIG = { isMonoRecord: false, isRoot: true };

export class OrgModel extends Model {
    setup(params, services) {
        super.setup(params, services);

        const { resModel, archInfo, fields = {}, config = {} } = params;

        this.orm = services.orm;
        this.resModel = resModel;
        this.archInfo = archInfo;
        this.fieldsInfo = fields;

        this.parentField = archInfo.parentFieldName;
        this.titleField = archInfo.titleFieldName || 'name';
        this.tooltipField = archInfo.toolTipFieldName;
        this.imageField = archInfo.imageFieldName;
        this.parentFieldType = this.parentField ? this.fieldsInfo[this.parentField]?.type : undefined;

        this.config = { ...DEFAULT_CONFIG, ...config, isRoot: true };
        this.data = { nodes: [], links: [] };
    }

    _getNextConfig(currentConfig, params) {
        const { domain, context } = params;
        return {
            ...currentConfig,
            ...(domain !== undefined ? { domain: domain || [] } : {}),
            ...(context !== undefined ? { context: context || {} } : {}),
        };
    }

    async load(params = {}) {
        this.config = this._getNextConfig(this.config, params);
        await this._loadRecords();
        this.notify(); // re-render after search change
    }

    async reload(extra = {}) {
        const merged = {
            domain: 'domain' in extra ? extra.domain : this.config.domain,
            context: 'context' in extra ? extra.context : this.config.context,
        };
        await this.load(merged);
    }

    /**
     * Normalize relational field values to an array of IDs:
     * - many2one: [id, display] / id -> [id]
     * - one2many/many2many: [ids] or [[id, display], ...]
     */
    _extractIds(value, type) {
        if (!value) return [];

        if (type === 'many2one') {
            if (Array.isArray(value)) return value[0] ? [value[0]] : [];
            if (typeof value === 'number') return [value];
            return [];
        }

        if (!Array.isArray(value)) return [];
        return value.reduce((ids, item) => {
            if (Array.isArray(item) && item[0]) ids.push(item[0]);
            else if (typeof item === 'number') ids.push(item);
            return ids;
        }, []);
    }

    _normalizeId(id) {
        const num = Number(id);
        return Number.isNaN(num) ? id : num;
    }

    async _loadRecords() {
        const fields = Array.from(this.archInfo.fieldsToFetch);
        const { domain = [], context = {} } = this.config;

        const kwargs = { context };
        if (this.archInfo.defaultOrder) {
            kwargs.order = this.archInfo.defaultOrder;
        }

        const records = await this.orm.searchRead(this.resModel, domain, fields, kwargs);

        const nodes = Object.create(null);
        for (const rec of records) {
            nodes[rec.id] = {
                id: rec.id,
                name: rec[this.titleField],
                tooltip: rec[this.tooltipField],
                image: rec[this.imageField],
                values: { fields: this.fieldsInfo, data: rec },
            };
        }

        const linkSet = new Set();
        if (this.parentField && this.parentFieldType) {
            for (const rec of records) {
                const parentIds = this._extractIds(rec[this.parentField], this.parentFieldType);
                for (const parentId of parentIds) {
                    if (nodes[parentId] && nodes[rec.id]) {
                        linkSet.add(`${parentId}-${rec.id}`); // parent -> child
                    }
                }
            }
        }

        const nonIsolatedLinks = [];
        const linkedIds = new Set();
        for (const key of linkSet) {
            const [fromStr, toStr] = key.split('-');
            const from = this._normalizeId(fromStr);
            const to = this._normalizeId(toStr);
            nonIsolatedLinks.push([from, to]);
            linkedIds.add(from);
            linkedIds.add(to);
        }

        const isolatedLinks = [];
        const links = [...nonIsolatedLinks];
        for (const nodeId of Object.keys(nodes)) {
            const normalized = this._normalizeId(nodeId);
            if (!linkedIds.has(normalized)) {
                isolatedLinks.push([normalized, normalized]);
                nodes[nodeId].isolated = true;
            }
        }
        links.push(...isolatedLinks);

        this.data = {
            nodes: Object.values(nodes),
            nodesById: nodes,
            nonIsolatedLinks,
            isolatedLinks,
            links,
            records,
            hasIsolated: isolatedLinks.length > 0,
        };
    }
}
