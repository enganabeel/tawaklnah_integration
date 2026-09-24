{
    'name': "Organizational Chart View",
    'summary': "Add Organization/ Hierarchy Chart view type using Highcharts",
    'description': '''
        Adds a new “Organization Chart” view type for any Odoo model with parent/child hierarchical structure. 
        Provides a visual tree layout to explore relationships between records.
    ''',
    'author': 'Hoang Minh Hieu',
    'version': '18.0.1.0.2',
    'license': 'LGPL-3',
    'support ': 'hieuhoangminh1996@gmail.com',
    'depends': ['web'],
    'data': [
        'views/ir_module_module_views.xml',
        'views/ir_ui_menu_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'web_org/static/src/highcharts_loader.js',

            'web_org/static/src/org_view.scss',
            'web_org/static/src/org_renderer.xml',
            'web_org/static/src/org_controller.xml',
            'web_org/static/src/org_arch_parser.js',
            'web_org/static/src/org_model.js',
            'web_org/static/src/org_renderer.js',
            'web_org/static/src/org_controller.js',
            'web_org/static/src/org_view.js',

        ],
    },
    'images': ['static/description/main_screenshot.gif'],
}
