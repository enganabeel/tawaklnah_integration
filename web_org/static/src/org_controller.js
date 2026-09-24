import { Component, useRef } from '@odoo/owl';
import { useBus } from '@web/core/utils/hooks';
import { useModel } from '@web/model/model';
import { standardViewProps } from '@web/views/standard_view_props';

import { Layout } from '@web/search/layout';
import { SearchBar } from '@web/search/search_bar/search_bar';
import { CogMenu } from '@web/search/cog_menu/cog_menu';

export class OrgController extends Component {
    static components = { Layout, SearchBar, CogMenu };
    static template = 'web_org.OrgView';

    static props = {
        ...standardViewProps,
        Model: Function,
        Renderer: Function,
        archInfo: Object,
    };

    setup() {
        this.rootRef = useRef('root');

        const { Model, resModel, archInfo, fields, domain, context } = this.props;
        this.model = useModel(Model, { resModel, archInfo, fields, domain, context });

        useBus(this.model.bus, 'update', () => this.render(true));
    }

    get displayNoContent() {
        const nodes = this.model.data?.nodes;
        return !nodes || nodes.length === 0;
    }
}
