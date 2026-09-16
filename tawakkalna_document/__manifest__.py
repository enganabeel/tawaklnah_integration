{
    'name': 'Tawakkalna Document Integration',
    'version': '18.0.1.0.0',
    'category': 'Integration',
    'summary': 'Push, update and delete documents/certificates on the Tawakkalna Document API',
    'description': """
Tawakkalna Document Integration
================================
Allows uploading documents (certificates, deeds, permits, ...) in Odoo and
synchronizing them with the Tawakkalna Document Web Service (push, update,
delete), following the official Tawakkalna Document Services API.
""",
    'author': 'Ejad Tech',
    'license': 'LGPL-3',
    'depends': ['base', 'mail'],
    'external_dependencies': {
        'python': ['requests'],
    },
    'data': [
        'security/tawakkalna_security.xml',
        'security/ir.model.access.csv',
        'views/tawakkalna_config_views.xml',
        'views/tawakkalna_document_views.xml',
        'views/tawakkalna_menus.xml',
    ],
    'installable': True,
    'application': True,
}
