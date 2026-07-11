from pathlib import Path
import unittest


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "bin" / "steamos-cec-bt-wake.sh"


class CecPowerLifecycleSetupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = SCRIPT_PATH.read_text(encoding="utf-8")

    def test_installs_shutdown_service_before_user_sessions_stop(self):
        self.assertIn('CEC_SHUTDOWN_SERVICE="/etc/systemd/system/cec-shutdown.service"', self.script)
        self.assertIn("Description=CEC TV Standby on Shutdown", self.script)
        self.assertIn("Before=shutdown.target systemd-user-sessions.service", self.script)
        self.assertIn("ExecStart=$CEC_HELPER shutdown", self.script)
        self.assertIn("WantedBy=halt.target poweroff.target reboot.target", self.script)

    def test_installs_startup_service_and_keeps_it_across_updates(self):
        self.assertIn('CEC_STARTUP_SERVICE="/etc/systemd/system/cec-startup.service"', self.script)
        self.assertIn("Description=CEC TV Wake on Startup", self.script)
        self.assertIn("After=graphical.target", self.script)
        self.assertIn("WantedBy=multi-user.target", self.script)
        self.assertIn("/etc/systemd/system/cec-startup.service", self.script)

    def test_shutdown_action_does_not_restart_cecd(self):
        shutdown_action = self.script.split('shutdown)\n', 1)[1].split('    wake)', 1)[0]
        self.assertIn("call_cec Standby 0", shutdown_action)
        self.assertNotIn("restart_cecd", shutdown_action)


if __name__ == "__main__":
    unittest.main()
