from pathlib import Path
import unittest


ROOT_DIR = Path(__file__).resolve().parents[1]
PORTAL_HTML = (ROOT_DIR / "sso-portal.html").read_text(encoding="utf-8")


class FrontendRegressionTest(unittest.TestCase):
    def test_hub_popup_launchers_stop_event_bubbling(self):
        self.assertIn("function invokeHubAction(event, action) {", PORTAL_HTML)
        self.assertIn("if (typeof event.stopPropagation === 'function') event.stopPropagation();", PORTAL_HTML)
        expected_launchers = [
            "onclick=\"invokeHubAction(event, \\'health\\')\"",
            "onclick=\"invokeHubAction(event, \\'audit\\')\"",
            "onclick=\"invokeHubAction(event, \\'backup\\')\"",
            "onclick=\"invokeHubAction(event, \\'update-center\\')\"",
        ]
        for launcher in expected_launchers:
            with self.subTest(launcher=launcher):
                self.assertIn(launcher, PORTAL_HTML)

    def test_focus_and_onboarding_popup_entries_are_guarded(self):
        guarded_entries = [
            "onclick=\"document.getElementById('installModal').classList.add('active')\"",
            "onclick=\"event.stopPropagation();toggleGuidePopup()\"",
            "onclick=\"event.stopPropagation();toggleUpdateCenterPopup()\"",
        ]
        for entry in guarded_entries:
            with self.subTest(entry=entry):
                self.assertIn(entry, PORTAL_HTML)

    def test_support_hub_is_collapsed_and_floating_entries_remain(self):
        self.assertIn("function renderSupportHub() {", PORTAL_HTML)
        self.assertIn("box.hidden = true;", PORTAL_HTML)
        self.assertIn("box.innerHTML = '';", PORTAL_HTML)
        self.assertIn("onclick=\"toggleSupportedPopup()\"", PORTAL_HTML)
        self.assertIn("onclick=\"toggleMsgPopup()\"", PORTAL_HTML)

    def test_card_action_spacing_prevents_favorite_delete_overlap(self):
        self.assertIn(".card-ops-row {", PORTAL_HTML)
        self.assertIn(".card-ops-row .card-actions {\n    display: inline-flex;\n    position: static;\n  }", PORTAL_HTML)
        self.assertIn(".card-ops-row .card-favorite-btn,\n  .card-ops-row .card-actions button {\n    position: static;\n    flex: 0 0 auto;\n  }", PORTAL_HTML)
        self.assertIn(".card-favorite-btn { z-index: 3; }", PORTAL_HTML)
        self.assertIn("body.enterprise-density .card-actions { gap: 3px; }", PORTAL_HTML)
        self.assertIn("body.enterprise-density .card-favorite-btn {\n    width: 23px;\n    height: 23px;", PORTAL_HTML)

    def test_login_rules_modal_keeps_wide_editor_layout(self):
        self.assertIn(".modal.login-rules-modal {\n    width: min(1080px, calc(100vw - 40px));\n    max-width: 1080px;\n  }", PORTAL_HTML)
        self.assertIn("body.enterprise-density .login-rules-modal {\n    width: min(1080px, calc(100vw - 40px));\n    max-width: 1080px;\n  }", PORTAL_HTML)
        self.assertIn(".login-rules-layout {\n    display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 16px; align-items: start;\n  }", PORTAL_HTML)

    def test_login_rule_center_exposes_submit_delay_for_token_pages(self):
        self.assertIn('label for="lr_submit_delay_ms">提交前等待（毫秒）</label>', PORTAL_HTML)
        self.assertIn("K8s 模板默认 700ms", PORTAL_HTML)
        self.assertIn("submit_delay_ms: 700", PORTAL_HTML)

    def test_auth_flow_prompts_new_users_and_refreshes_login_state(self):
        self.assertIn("async function refreshAuthDependentViews() {", PORTAL_HTML)
        self.assertIn("initUserBar();\n  await loadSystems();\n  mountLikeSection();", PORTAL_HTML)
        self.assertIn("if (!checkData.registered) {\n      const registerForm = await showPasswordEntryDialog({", PORTAL_HTML)
        self.assertNotIn("if (!checkData.registered) {\n      if (!shouldPrompt) return;", PORTAL_HTML)
        self.assertIn("await refreshAuthDependentViews();\n          return true;", PORTAL_HTML)


if __name__ == "__main__":
    unittest.main()
