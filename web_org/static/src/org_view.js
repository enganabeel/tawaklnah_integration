import { registry } from '@web/core/registry';
import { OrgController } from './org_controller';
import { OrgModel } from './org_model';
import { OrgRenderer } from './org_renderer';
import { OrgArchParser } from './org_arch_parser';

export const orgView = {
    type: 'org',
    display_name: 'Org Chart',
    icon: 'fa fa-sitemap',
    multiRecord: true,
    searchMenuTypes: ['filter', 'favorite'],

    Controller: OrgController,
    Model: OrgModel,
    Renderer: OrgRenderer,
    ArchParser: OrgArchParser,

    props: (genericProps, view) => {
        const { ArchParser, Model, Renderer } = view;
        const { arch, relatedModels, resModel } = genericProps;
        const archInfo = new ArchParser().parse(arch, relatedModels, resModel);
        return {
            ...genericProps,
            archInfo,
            Model,
            Renderer,
        };
    },
};

registry.category('views').add('org', orgView);
