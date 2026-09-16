from odoo import api, models, fields


class CustomDashboard(models.AbstractModel):
    _name = 'custom.dashboard'
    _description = 'Operational Dashboard Data Provider'

    @api.model
    def get_dashboard_data(self):
        Partner = self.env['res.partner']
        Activity = self.env['mail.activity']
        Sale = self.env['sale.order']
        Move = self.env['account.move']
        Lead = self.env['crm.lead']

        today = fields.Date.context_today(self)

        companies = Partner.search_count([('is_company', '=', True)])
        customers = Partner.search_count([('customer_rank', '>', 0)])
        vendors = Partner.search_count([('supplier_rank', '>', 0)])

        sales_orders = Sale.search_count([('state', '=', 'sale')])
        invoices = Move.search_count([('move_type', '=', 'out_invoice'), ('state', '=', 'posted')])

        overdue_activities = Activity.search_count([('date_deadline', '<', today)])
        due_today = Activity.search_count([('date_deadline', '=', today)])
        open_activities = Activity.search_count([])
        urgent_activities = overdue_activities + due_today

        crm_leads = Lead.search_count([('type', '=', 'lead')])
        quotations = Sale.search_count([('state', 'in', ('draft', 'sent'))])
        unpaid_invoices = Move.search_count([
            ('move_type', '=', 'out_invoice'),
            ('state', '=', 'posted'),
            ('payment_state', 'in', ('not_paid', 'partial')),
        ])

        recent_activities = []
        for act in Activity.search([], order='date_deadline desc', limit=5):
            if act.date_deadline < today:
                status = 'Overdue'
            elif act.date_deadline == today:
                status = 'Today'
            else:
                status = 'Planned'
            recent_activities.append({
                'summary': act.summary or act.activity_type_id.name,
                'model': act.res_model,
                'status': status,
                'date_deadline': act.date_deadline,
            })

        record_mix = [
            {'label': 'Customers', 'count': customers},
            {'label': 'Vendors', 'count': vendors},
            {'label': 'Sales', 'count': sales_orders},
            {'label': 'Invoices', 'count': invoices},
        ]
        max_mix = max([item['count'] for item in record_mix] + [1])
        for item in record_mix:
            item['pct'] = round(item['count'] * 100.0 / max_mix) if max_mix else 0

        total_records = companies + customers + vendors + sales_orders + invoices

        workload_pct = round(urgent_activities * 100.0 / open_activities) if open_activities else 0

        return {
            'total_records': total_records,
            'companies': companies,
            'customers': customers,
            'vendors': vendors,
            'sales_orders': sales_orders,
            'invoices': invoices,
            'overdue_activities': overdue_activities,
            'due_today': due_today,
            'record_mix': record_mix,
            'activity_workload': {
                'urgent': urgent_activities,
                'open': open_activities,
                'pct': workload_pct,
            },
            'live_summary': {
                'crm_leads': crm_leads,
                'quotations': quotations,
                'unpaid_invoices': unpaid_invoices,
            },
            'recent_activities': recent_activities,
        }
