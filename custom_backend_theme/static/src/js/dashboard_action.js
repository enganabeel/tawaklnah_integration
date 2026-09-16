/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";

export class CustomDashboard extends Component {
    static template = "custom_backend_theme.Dashboard";
    static props = ["*"];

    setup() {
        this.orm = useService("orm");
        this.actionService = useService("action");
        this.user = user;

        this.state = useState({
            loading: true,
            data: null,
        });

        const hour = new Date().getHours();
        this.greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

        onWillStart(async () => {
            this.state.data = await this.orm.call("custom.dashboard", "get_dashboard_data", []);
            this.state.loading = false;
        });
    }

    openWindow(resModel, domain, viewType) {
        this.actionService.doAction({
            type: "ir.actions.act_window",
            res_model: resModel,
            views: [[false, viewType || "list"]],
            domain: domain || [],
            target: "current",
        });
    }

    openOverdue() {
        this.openWindow("mail.activity", [["date_deadline", "<", this._today()]]);
    }

    openDueToday() {
        this.openWindow("mail.activity", [["date_deadline", "=", this._today()]]);
    }

    openSalesOrders() {
        this.openWindow("sale.order", [["state", "=", "sale"]]);
    }

    openInvoices() {
        this.openWindow("account.move", [["move_type", "=", "out_invoice"], ["state", "=", "posted"]]);
    }

    openCrmLeads() {
        this.openWindow("crm.lead", [["type", "=", "lead"]]);
    }

    openQuotations() {
        this.openWindow("sale.order", [["state", "in", ["draft", "sent"]]]);
    }

    openUnpaidInvoices() {
        this.openWindow("account.move", [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["payment_state", "in", ["not_paid", "partial"]],
        ]);
    }

    _today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
}

registry.category("actions").add("custom_backend_theme.dashboard", CustomDashboard);
