from odoo import api, fields, models, Command, _
from odoo.exceptions import UserError, ValidationError


class IrUiMenu(models.Model):
    _inherit = 'ir.ui.menu'

    all_parent_ids = fields.Many2many(
        comodel_name='ir.ui.menu',
        compute='compute_all_parent_ids',
        recursive=True,
    )

    @api.depends('parent_id')
    def compute_all_parent_ids(self):
        for rec in self:
            parent = rec.parent_id
            rec.all_parent_ids = parent | parent.all_parent_ids
