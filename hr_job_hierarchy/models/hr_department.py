# -*- coding: utf-8 -*-
from odoo import _, fields, models


class HrDepartment(models.Model):
    _inherit = 'hr.department'

    job_count = fields.Integer(string='Job Position Count', compute='_compute_job_count')

    def _compute_job_count(self):
        job_data = self.env['hr.job']._read_group(
            [('department_id', 'in', self.ids), ('active', '=', True)],
            ['department_id'], ['__count'],
        )
        counts = {department.id: count for department, count in job_data}
        for department in self:
            department.job_count = counts.get(department.id, 0)

    def action_view_department_jobs(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Job Positions'),
            'res_model': 'hr.job',
            'view_mode': 'list,form',
            'domain': [('department_id', '=', self.id)],
            'context': {'default_department_id': self.id},
        }
