# -*- coding: utf-8 -*-
{
    'name': 'HR Job Hierarchy',
    'summary': 'Reports-To hierarchy between Job Positions, plus interactive and printable tree views (by position and by department)',
    'description': """
HR Job Hierarchy
=================
Adds a "Reports To" field on Job Position so positions can be linked into
a reporting chain, independent of the department tree.

Provides, for both the position-reporting hierarchy and the existing
department hierarchy:
- A native Hierarchy view (Employees > Reporting > Jobs by Parent Job /
  Jobs by Department), same box-and-connector widget as the stock
  Departments Hierarchy view. Requires whatever app/module already
  provides that <hierarchy> view type on this database (it was already
  in use for Departments when this module was written) -- if that is
  ever uninstalled, these two menu items will need to be revisited.
- An interactive, expandable tree page inside Odoo (Employees > Reporting)
  built with plain HTML, as a fallback that needs no extra view type.
- A printable QWeb PDF report, in the same visual style as the Department
  Tree report.
""",
    'version': '18.0.1.0.0',
    'category': 'Human Resources',
    'author': 'Ejad Tech',
    'website': 'https://ejadtech.sa',
    'license': 'LGPL-3',
    'depends': ['hr_recruitment'],
    'data': [
        'views/hr_job_views.xml',
        'views/hr_job_hierarchy_templates.xml',
        'views/hr_job_native_hierarchy_views.xml',
        'reports/hr_job_hierarchy_report.xml',
        'reports/hr_job_by_department_report.xml',
        'views/hr_job_hierarchy_menus.xml',
    ],
    'installable': True,
    'application': False,
    'auto_install': False,
}
