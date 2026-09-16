/** @odoo-module **/

import { Component, onMounted, onWillUnmount, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { WebClient } from "@web/webclient/webclient";

export class AppIconRail extends Component {
    static template = "custom_backend_theme.AppIconRail";
    static props = {};

    setup() {
        this.menuService = useService("menu");
        this.actionService = useService("action");
        this.state = useState({ darkMode: this._getStoredDarkMode() });

        onMounted(() => {
            document.body.classList.add("o_cbt_has_rail");
            this._applyDarkMode(this.state.darkMode);
        });
        onWillUnmount(() => {
            document.body.classList.remove("o_cbt_has_rail");
        });
    }

    get apps() {
        return this.menuService.getApps();
    }

    isActive(app) {
        const currentApp = this.menuService.getCurrentApp();
        return Boolean(currentApp && currentApp.id === app.id);
    }

    onAppClick(app) {
        this.menuService.selectMenu(app);
    }

    onSettingsClick() {
        this.actionService.doAction("base_setup.action_general_configuration");
    }

    onAppsGridClick() {
        this.actionService.doAction("base.open_module_tree");
    }

    onLogoutClick() {
        window.location.href = "/web/session/logout";
    }

    toggleDarkMode() {
        this.state.darkMode = !this.state.darkMode;
        this._applyDarkMode(this.state.darkMode);
        try {
            window.localStorage.setItem("cbt_dark_mode", this.state.darkMode ? "1" : "0");
        } catch {
            // localStorage unavailable (private browsing, etc.) - ignore
        }
    }

    _getStoredDarkMode() {
        try {
            return window.localStorage.getItem("cbt_dark_mode") === "1";
        } catch {
            return false;
        }
    }

    _applyDarkMode(active) {
        document.documentElement.classList.toggle("o_cbt_dark", active);
    }
}

patch(WebClient, {
    components: { ...WebClient.components, AppIconRail },
});
