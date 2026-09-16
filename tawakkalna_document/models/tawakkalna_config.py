import logging
from datetime import datetime, timedelta

import requests

from odoo import api, fields, models, _
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)

TOKEN_EXPIRY_BUFFER_SECONDS = 60
REQUEST_TIMEOUT = 30

ENVIRONMENT_BASE_URLS = {
    'gov_qa': 'https://external.sandbox.api.tawakkalna.sa',
    'gov_prod': 'https://external.api.tawakkalna.nic.gov.sa',
    'nongov_qa': 'https://sandbox.api.tawakkalna.sa',
    'nongov_prod': 'https://api.tawakkalna.nic.gov.sa',
    'internal_prod': 'https://devportal.tawakkalna.sa',
    'internal_qa': 'https://apigateway-qa.twk.sa',
}


class TawakkalnaConfig(models.Model):
    _name = 'tawakkalna.config'
    _description = 'Tawakkalna API Configuration'
    _rec_name = 'display_name'

    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        default=lambda self: self.env.company)
    environment = fields.Selection([
        ('gov_qa', 'Gov QA (Sandbox)'),
        ('gov_prod', 'Gov Production'),
        ('nongov_qa', 'Non-Gov QA (Sandbox)'),
        ('nongov_prod', 'Non-Gov Production'),
        ('internal_prod', 'Internal Production'),
        ('internal_qa', 'Internal QA'),
    ], string='Environment', required=True, default='gov_qa')
    client_id = fields.Char(string='Client ID (Username)', required=True)
    client_secret = fields.Char(string='Client Secret (Password)', required=True)
    default_language = fields.Selection([
        ('ar', 'Arabic'),
        ('en', 'English'),
    ], string='Accept-Language', default='en')

    access_token = fields.Char(string='Access Token', readonly=True, copy=False)
    token_expires_at = fields.Datetime(string='Token Expires At', readonly=True, copy=False)
    token_issued_at = fields.Datetime(string='Token Issued At', readonly=True, copy=False)

    active = fields.Boolean(default=True)
    display_name = fields.Char(compute='_compute_display_name', store=True)

    _sql_constraints = [
        ('company_uniq', 'unique(company_id)',
         'Only one Tawakkalna configuration is allowed per company.'),
    ]

    @api.depends('company_id', 'environment')
    def _compute_display_name(self):
        for rec in self:
            rec.display_name = _('Tawakkalna Config (%s - %s)') % (
                rec.company_id.name, dict(rec._fields['environment'].selection).get(rec.environment))

    def _get_base_url(self):
        self.ensure_one()
        return ENVIRONMENT_BASE_URLS[self.environment] + '/document/v1'

    @api.model
    def get_config(self, company=None):
        company = company or self.env.company
        config = self.search([('company_id', '=', company.id)], limit=1)
        if not config:
            raise UserError(_(
                'No Tawakkalna API configuration found for company "%s". '
                'Please configure it under Tawakkalna > Configuration > API Settings.'
            ) % company.name)
        return config

    def _parse_error_response(self, response):
        try:
            data = response.json()
            error = data.get('error', {})
            message = error.get('message') or response.text
            code = error.get('code')
            trace_id = error.get('traceId')
        except ValueError:
            message = response.text
            code = None
            trace_id = None
        parts = [message or _('Unknown error')]
        if code:
            parts.append(_('Code: %s') % code)
        if trace_id:
            parts.append(_('Trace ID: %s') % trace_id)
        return ' - '.join(parts)

    def _fetch_new_token(self):
        self.ensure_one()
        url = self._get_base_url() + '/token'
        try:
            response = requests.post(
                url,
                auth=(self.client_id, self.client_secret),
                timeout=REQUEST_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise UserError(_('Unable to reach Tawakkalna authentication server: %s') % exc)

        if not response.ok:
            raise UserError(_('Tawakkalna authentication failed: %s') % self._parse_error_response(response))

        data = response.json()
        bearer_token = data.get('bearerToken')
        expires_at = data.get('expiresAt')
        issued_at = data.get('issuedAt')
        if not bearer_token:
            raise UserError(_('Tawakkalna authentication did not return a valid token.'))

        vals = {'access_token': bearer_token}
        if expires_at:
            vals['token_expires_at'] = datetime.utcfromtimestamp(int(expires_at))
        if issued_at:
            vals['token_issued_at'] = datetime.utcfromtimestamp(int(issued_at))
        self.write(vals)
        return bearer_token

    def _get_access_token(self, force_refresh=False):
        self.ensure_one()
        now = datetime.utcnow()
        if (not force_refresh and self.access_token and self.token_expires_at
                and self.token_expires_at > now + timedelta(seconds=TOKEN_EXPIRY_BUFFER_SECONDS)):
            return self.access_token
        return self._fetch_new_token()

    def action_test_connection(self):
        self.ensure_one()
        self._get_access_token(force_refresh=True)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Success'),
                'message': _('Connection to Tawakkalna API successful. Token acquired.'),
                'type': 'success',
                'sticky': False,
            },
        }

    def call_api(self, method, path, payload=None, lang=None):
        """Call the Tawakkalna Document API and return the parsed JSON body (or True)."""
        self.ensure_one()
        lang = lang or self.default_language
        url = self._get_base_url() + path

        def _do_request(token):
            headers = {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer %s' % token,
            }
            if lang:
                headers['Accept-Language'] = lang
            return requests.request(
                method, url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)

        token = self._get_access_token()
        try:
            response = _do_request(token)
        except requests.RequestException as exc:
            raise UserError(_('Unable to reach Tawakkalna API: %s') % exc)

        if response.status_code == 401:
            token = self._get_access_token(force_refresh=True)
            try:
                response = _do_request(token)
            except requests.RequestException as exc:
                raise UserError(_('Unable to reach Tawakkalna API: %s') % exc)

        if not response.ok:
            raise UserError(_('Tawakkalna API error: %s') % self._parse_error_response(response))

        if response.content:
            try:
                return response.json()
            except ValueError:
                return True
        return True
