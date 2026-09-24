from odoo import fields, models


class View(models.Model):
    _inherit = 'ir.ui.view'

    type = fields.Selection(selection_add=[('org', 'Organizational Chart')])

    def _get_view_info(self):
        return {'org': {'icon': 'fa fa-sitemap'}} | super()._get_view_info()

    def _is_qweb_based_view(self, view_type):
        return view_type == 'org' or super()._is_qweb_based_view(view_type)
