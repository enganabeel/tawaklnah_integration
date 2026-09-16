{
    'name': 'Custom Backend Theme & Dashboard',
    'version': '18.0.1.0.0',
    'category': 'Themes/Backend',
    'summary': 'Modern backend restyle with a live operational dashboard home screen',
    'description': """
Custom Backend Theme & Dashboard
=================================
- Restyles the Odoo backend: rounded kanban/list cards, refreshed top bar,
  buttons and badges, original color palette.
- Adds a "Dashboard" app as an operational home screen with live stat tiles,
  a record-mix chart, activity workload, a live summary panel and a recent
  activities feed, backed by real ORM data.
- Adds a left icon-rail app switcher (with a light/dark toggle) alongside
  the standard top navigation.
""",
    'author': 'Ejad Tech',
    'license': 'LGPL-3',
    'depends': ['web', 'mail', 'sale', 'crm', 'account'],
    'data': [
        'views/dashboard_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'custom_backend_theme/static/src/scss/theme.scss',
            'custom_backend_theme/static/src/js/dashboard_action.js',
            'custom_backend_theme/static/src/xml/dashboard_templates.xml',
            'custom_backend_theme/static/src/js/app_icon_rail.js',
            'custom_backend_theme/static/src/xml/app_icon_rail_templates.xml',
        ],
    },
    'installable': True,
    'application': False,
}
