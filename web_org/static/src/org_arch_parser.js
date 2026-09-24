import { visitXML } from '@web/core/utils/xml';
import { Field } from '@web/views/fields/field';
import { getActiveActions } from '@web/views/utils';
import { exprToBoolean } from '@web/core/utils/strings';

export class OrgArchParser {
    parse(xmlDoc, models, modelName) {
        const fields = models[modelName].fields;
        const archInfo = {
            activeActions: getActiveActions(xmlDoc),
            draggable: false,
            icon: 'fa-sitemap',
            titleFieldName: 'display_name',
            tooltip_field: null,
            parentFieldName: 'parent_id',
            fieldsToFetch: new Set(['id']),
            fieldNodes: {},
            templates: {},
            xmlDoc,
        };
        const fieldNextIds = {};

        const validateParentField = (parentFieldName) => {
            const field = fields[parentFieldName];
            if (!field) {
                throw new Error(`The parent field set (${parentFieldName}) is not defined in the model (${modelName}).`);
            }
            if (!['many2one', 'one2many', 'many2many'].includes(field.type)) {
                throw new Error('Invalid parent field, it should be a relational field.');
            }
            if (field.relation !== modelName) {
                throw new Error(`Invalid parent field, the co-model should be same model than the current one (expected: ${modelName}).`);
            }
        };

        const addFieldToFetch = (fieldName) => {
            if (fieldName) {
                archInfo.fieldsToFetch.add(fieldName);
            }
        };

        visitXML(xmlDoc, (node) => {
            if (node.nodeType !== 1) return;

            if (node.tagName === 'org') {
                if (node.hasAttribute('parent_field')) {
                    const parentFieldName = node.getAttribute('parent_field');
                    validateParentField(parentFieldName);
                    archInfo.parentFieldName = parentFieldName;
                }
                addFieldToFetch(archInfo.parentFieldName);

                if (node.hasAttribute('title_field')) {
                    archInfo.titleFieldName = node.getAttribute('title_field');
                }
                addFieldToFetch(archInfo.titleFieldName);

                if (node.hasAttribute('tooltip_field')) {
                    archInfo.toolTipFieldName = node.getAttribute('tooltip_field');
                    addFieldToFetch(archInfo.toolTipFieldName);
                }

                if (node.hasAttribute('image_field')) {
                    archInfo.imageFieldName = node.getAttribute('image_field');
                    addFieldToFetch(archInfo.imageFieldName);
                }

                if (node.hasAttribute('default_order')) {
                    archInfo.defaultOrder = node.getAttribute('default_order');
                }

                if (node.hasAttribute('icon')) {
                    archInfo.icon = node.getAttribute('icon');
                }

                archInfo.nodeWidth = parseInt(node.getAttribute('node_width'), 10) || 200;
                archInfo.nodeHeight = parseInt(node.getAttribute('node_height'), 10) || 160;
                archInfo.padding = parseInt(node.getAttribute('padding'), 10) || 20;
                archInfo.inverted = exprToBoolean(node.getAttribute('inverted'));

                // Per-node layout: a field holding 'hanging' or 'normal'. A node set
                // to 'hanging' stacks its children vertically, progressively indented,
                // and the whole sub-tree inherits it (Highcharts organization series).
                if (node.hasAttribute('layout_field')) {
                    archInfo.layoutFieldName = node.getAttribute('layout_field');
                    addFieldToFetch(archInfo.layoutFieldName);
                }
                // Per-node column pin: an integer field. A value > 0 pins the node to
                // that column, which also lifts it out of a hanging parent's stack.
                if (node.hasAttribute('column_field')) {
                    archInfo.columnFieldName = node.getAttribute('column_field');
                    addFieldToFetch(archInfo.columnFieldName);
                }

                // Defaults below mirror Highcharts' own, so views that don't set
                // these attributes keep rendering exactly as before.
                archInfo.hangingIndent = parseInt(node.getAttribute('hanging_indent'), 10) || 20;
                archInfo.hangingIndentTranslation =
                    node.getAttribute('hanging_indent_translation') || 'inherit';
                archInfo.hangingSide = node.getAttribute('hanging_side') || 'left';
                archInfo.linkType = node.getAttribute('link_type') || 'default';
                archInfo.linkRadius = node.hasAttribute('link_radius')
                    ? parseInt(node.getAttribute('link_radius'), 10) || 0
                    : 10;
                archInfo.linkLineWidth = node.hasAttribute('link_line_width')
                    ? parseInt(node.getAttribute('link_line_width'), 10) || 0
                    : 1;
                return;
            }

            if (node.tagName === 'field') {
                const fieldInfo = Field.parseFieldNode(node, models, modelName, 'org');
                const { name } = fieldInfo;
                const nextId = fieldNextIds[name] ?? 0;
                const fieldId = `${name}_${nextId}`;
                fieldNextIds[name] = nextId + 1;

                archInfo.fieldNodes[fieldId] = fieldInfo;
                addFieldToFetch(fieldInfo.name);
                node.setAttribute('field_id', fieldId);
                return;
            }

            if (node.tagName === 'templates') {
                for (const child of node.children) {
                    if (child.tagName !== 't') continue;
                    const tName = child.getAttribute('t-name');
                    if (tName) {
                        archInfo.templates[tName] = child;
                    }
                }
                node.remove();
            }
        });

        return archInfo;
    }
}
