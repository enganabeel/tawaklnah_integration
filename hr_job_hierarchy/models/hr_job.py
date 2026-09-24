# -*- coding: utf-8 -*-
from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class HrJob(models.Model):
    _inherit = 'hr.job'

    parent_id = fields.Many2one(
        'hr.job', string='Reports To',
        domain="[('id', '!=', id)]",
        help='The job position this position reports to, independent of the department hierarchy.',
    )
    child_ids = fields.One2many('hr.job', 'parent_id', string='Direct Reports')

    @api.constrains('parent_id')
    def _check_parent_id_recursion(self):
        if not self._check_recursion():
            raise ValidationError(_('You cannot create a recursive hierarchy of job positions.'))
