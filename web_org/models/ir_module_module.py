from odoo import api, fields, models, Command, _
from odoo.exceptions import UserError, ValidationError


class IrModuleModule(models.Model):
    _inherit = 'ir.module.module'

    all_parent_ids = fields.Many2many(
        comodel_name='ir.module.module',
        compute='compute_all_parent_ids',
        recursive=True,
    )

    @api.depends('dependencies_id.depend_id')
    def compute_all_parent_ids(self):
        for rec in self:
            parents = rec.dependencies_id.depend_id
            rec.all_parent_ids = parents | parents.all_parent_ids
