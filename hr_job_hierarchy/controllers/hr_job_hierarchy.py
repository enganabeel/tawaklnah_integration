# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request


class HrJobHierarchyController(http.Controller):

    @http.route('/job_hierarchy', type='http', auth='user')
    def job_hierarchy_reports_to(self, **kw):
        """Interactive, expandable Reports-To job hierarchy."""
        jobs = request.env['hr.job'].search([('active', '=', True)])
        roots = jobs.filtered(lambda j: not j.parent_id or j.parent_id not in jobs).sorted(key=lambda j: j.name or '')
        return request.render('hr_job_hierarchy.job_hierarchy_page', {
            'title': 'Job Hierarchy',
            'subtitle': "Reporting chain between job positions, independent of the department structure.",
            'roots': roots,
            'all_jobs': jobs,
            'mode': 'reports_to',
        })

    @http.route('/job_hierarchy/by_department', type='http', auth='user')
    def job_hierarchy_by_department(self, **kw):
        """Interactive, expandable department hierarchy with job positions nested under each department."""
        departments = request.env['hr.department'].search([('active', '=', True)])
        roots = departments.filtered(
            lambda d: not d.parent_id or d.parent_id not in departments
        ).sorted(key=lambda d: d.name or '')
        return request.render('hr_job_hierarchy.job_hierarchy_page', {
            'title': 'Job Hierarchy by Department',
            'subtitle': 'Job positions nested under the department they belong to.',
            'roots': roots,
            'all_departments': departments,
            'mode': 'by_department',
        })
