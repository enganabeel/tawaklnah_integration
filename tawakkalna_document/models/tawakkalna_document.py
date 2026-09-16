import base64
import uuid

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

MAX_FILE_SIZE = 400 * 1024  # 400 KB, per Tawakkalna Document API spec
ALLOWED_EXTENSIONS = ('.pdf',)

DOCUMENT_TYPE_SELECTION = [
    ('1', 'Passport'),
    ('2', 'Attorney'),
    ('3', 'Moj Deeds'),
    ('4', 'Permits'),
    ('5', 'Real Estate'),
    ('6', 'Reports'),
    ('7', 'Certificates'),
    ('8', 'Health Passport'),
    ('9', 'Rentals'),
    ('10', 'Bookings'),
    ('11', 'Loyalty'),
]


class TawakkalnaDocument(models.Model):
    _name = 'tawakkalna.document'
    _description = 'Tawakkalna Document'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc'

    name = fields.Char(string='Title', required=True, tracking=True)
    reference_number = fields.Char(
        string='Reference Number', required=True, copy=False, tracking=True,
        default=lambda self: str(uuid.uuid4()))
    document_type = fields.Selection(
        DOCUMENT_TYPE_SELECTION, string='Document Category', required=True,
        default='7', tracking=True)

    document_file = fields.Binary(string='File (PDF)', required=True, attachment=True)
    document_filename = fields.Char(string='File Name')

    partner_id = fields.Many2one('res.partner', string='Related Contact')
    national_id_ids = fields.One2many(
        'tawakkalna.document.national.id', 'document_id', string='National IDs')

    property_key = fields.Char(string='Property Key', required=True, tracking=True)
    property_value_ar = fields.Char(string='Property Value (Arabic)', required=True)
    property_value_en = fields.Char(string='Property Value (English)', required=True)

    state = fields.Selection([
        ('draft', 'Draft'),
        ('pushed', 'Pushed'),
        ('updated', 'Updated'),
        ('deleted', 'Deleted'),
        ('error', 'Error'),
    ], string='Status', default='draft', tracking=True, copy=False)

    push_date = fields.Datetime(string='Pushed On', readonly=True, copy=False)
    update_date = fields.Datetime(string='Last Updated On', readonly=True, copy=False)
    delete_date = fields.Datetime(string='Deleted On', readonly=True, copy=False)
    last_error_message = fields.Text(string='Last Error', readonly=True, copy=False)

    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        default=lambda self: self.env.company)
    active = fields.Boolean(default=True)

    _sql_constraints = [
        ('reference_number_company_uniq', 'unique(reference_number, company_id)',
         'The reference number must be unique per company.'),
    ]

    @api.constrains('document_file', 'document_filename')
    def _check_file(self):
        for rec in self:
            if not rec.document_file:
                continue
            if rec.document_filename and not rec.document_filename.lower().endswith(ALLOWED_EXTENSIONS):
                raise ValidationError(_('Only PDF files are allowed by the Tawakkalna Document API.'))
            file_size = len(base64.b64decode(rec.document_file))
            if file_size > MAX_FILE_SIZE:
                raise ValidationError(_(
                    'The file exceeds the maximum allowed size of 400 KB (current size: %.1f KB).'
                ) % (file_size / 1024.0))

    @api.constrains('national_id_ids')
    def _check_national_ids(self):
        for rec in self:
            if not rec.national_id_ids:
                raise ValidationError(_('At least one National ID is required.'))

    def unlink(self):
        for rec in self:
            if rec.state not in ('draft', 'error'):
                raise UserError(_(
                    'You cannot delete a document that has already been pushed to Tawakkalna. '
                    'Use the "Remove from Tawakkalna" action instead.'))
        return super().unlink()

    def _get_config(self):
        return self.env['tawakkalna.config'].get_config(self.company_id)

    def _build_payload(self):
        self.ensure_one()
        return {
            'file': self.document_file.decode('ascii'),
            'fileName': self.document_filename or self.name,
            'referenceNumber': self.reference_number,
            'documentId': int(self.document_type),
            'nationalIds': [int(line.national_id) for line in self.national_id_ids],
            'properties': {
                'key': self.property_key,
                'valueAr': self.property_value_ar,
                'valueEn': self.property_value_en,
            },
        }

    def action_push(self):
        for rec in self:
            if rec.state not in ('draft', 'error'):
                raise UserError(_('Only draft or errored documents can be pushed.'))
            config = rec._get_config()
            try:
                config.call_api('POST', '/push', rec._build_payload())
            except UserError as exc:
                rec.write({'state': 'error', 'last_error_message': str(exc)})
                rec.message_post(body=_('Push to Tawakkalna failed: %s') % exc)
                raise
            rec.write({
                'state': 'pushed',
                'push_date': fields.Datetime.now(),
                'last_error_message': False,
            })
            rec.message_post(body=_('Document successfully pushed to Tawakkalna.'))

    def action_update(self):
        for rec in self:
            if rec.state not in ('pushed', 'updated', 'error'):
                raise UserError(_('Only previously pushed documents can be updated.'))
            config = rec._get_config()
            try:
                config.call_api('PUT', '/update', rec._build_payload())
            except UserError as exc:
                rec.write({'state': 'error', 'last_error_message': str(exc)})
                rec.message_post(body=_('Update on Tawakkalna failed: %s') % exc)
                raise
            rec.write({
                'state': 'updated',
                'update_date': fields.Datetime.now(),
                'last_error_message': False,
            })
            rec.message_post(body=_('Document successfully updated on Tawakkalna.'))

    def action_delete(self):
        for rec in self:
            if rec.state not in ('pushed', 'updated', 'error'):
                raise UserError(_('Only previously pushed documents can be removed from Tawakkalna.'))
            config = rec._get_config()
            payload = {
                'referenceNumber': rec.reference_number,
                'documentId': int(rec.document_type),
            }
            try:
                config.call_api('DELETE', '/delete', payload)
            except UserError as exc:
                rec.write({'state': 'error', 'last_error_message': str(exc)})
                rec.message_post(body=_('Removal from Tawakkalna failed: %s') % exc)
                raise
            rec.write({
                'state': 'deleted',
                'delete_date': fields.Datetime.now(),
                'last_error_message': False,
            })
            rec.message_post(body=_('Document successfully removed from Tawakkalna.'))

    def action_reset_to_draft(self):
        self.write({'state': 'draft', 'last_error_message': False})


class TawakkalnaDocumentNationalId(models.Model):
    _name = 'tawakkalna.document.national.id'
    _description = 'Tawakkalna Document National ID'
    _order = 'id'

    document_id = fields.Many2one(
        'tawakkalna.document', string='Document', required=True, ondelete='cascade')
    national_id = fields.Char(string='National ID', required=True)

    @api.constrains('national_id')
    def _check_national_id(self):
        for rec in self:
            if not rec.national_id.isdigit():
                raise ValidationError(_('National ID must contain digits only.'))
