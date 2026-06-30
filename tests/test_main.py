from __future__ import annotations

import asyncio
import importlib
import sys
import types
import unittest
from unittest.mock import AsyncMock, Mock, patch


class _Logger:
    def info(self, *args, **kwargs):
        pass

    def warning(self, *args, **kwargs):
        pass

    def error(self, *args, **kwargs):
        pass


sys.modules.setdefault("decky", types.SimpleNamespace(logger=_Logger()))
mote_main = importlib.import_module("main")


class FakeProcess:
    def __init__(self, *, stdout=b"", stderr=b"", returncode=0):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode
        self.terminated = False
        self.killed = False
        self.wait_called = False

    async def communicate(self):
        return self._stdout, self._stderr

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True

    async def wait(self):
        self.wait_called = True
        return self.returncode


class SlowProcess(FakeProcess):
    async def communicate(self):
        await asyncio.sleep(1)
        return await super().communicate()


class PluginTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.plugin = mote_main.Plugin()

    def test_parse_audio_logical_address_tv(self):
        self.assertEqual(self.plugin._parse_audio_logical_address("y 0"), 0)

    def test_parse_audio_logical_address_audio_system(self):
        self.assertEqual(self.plugin._parse_audio_logical_address("y 5"), 5)

    def test_rejects_malformed_audio_logical_address(self):
        with self.assertRaisesRegex(mote_main.CecError, "Malformed AudioLogicalAddress"):
            self.plugin._parse_audio_logical_address("bogus")

    def test_rejects_logical_address_fifteen(self):
        with self.assertRaisesRegex(mote_main.CecError, "Invalid audio logical address"):
            self.plugin._parse_audio_logical_address("y 15")

    async def test_volume_up_maps_to_volume_up_method(self):
        await self._assert_action_mapping("volume_up", "VolumeUp")

    async def test_volume_down_maps_to_volume_down_method(self):
        await self._assert_action_mapping("volume_down", "VolumeDown")

    async def test_mute_maps_to_mute_method(self):
        await self._assert_action_mapping("mute", "Mute")

    async def test_call_cec_method_uses_signature_and_dynamic_address(self):
        session = mote_main.SessionContext(
            busctl_path="/usr/bin/busctl",
            systemctl_path=None,
            env={"LC_ALL": "C"},
        )
        self.plugin._run_command = AsyncMock(
            return_value=mote_main.CommandResult(
                args=tuple(),
                returncode=0,
                stdout="",
                stderr="",
            )
        )

        await self.plugin._call_cec_method(
            session,
            "/com/steampowered/CecDaemon1/Devices/Cec1",
            "VolumeDown",
            5,
        )

        args = self.plugin._run_command.await_args.args[0]
        self.assertEqual(
            args,
            (
                "/usr/bin/busctl",
                "--user",
                "call",
                "com.steampowered.CecDaemon1",
                "/com/steampowered/CecDaemon1/Devices/Cec1",
                "com.steampowered.CecDaemon1.CecDevice1",
                "VolumeDown",
                "y",
                "5",
            ),
        )

    async def test_device_discovery_prefers_active_object(self):
        session = mote_main.SessionContext(
            busctl_path="/usr/bin/busctl",
            systemctl_path=None,
            env={"LC_ALL": "C"},
        )

        async def read_property(_session, object_path, property_name, *, error_message):
            if object_path.endswith("Cec0") and property_name == "AudioLogicalAddress":
                return "y 0"
            if object_path.endswith("Cec0") and property_name == "Active":
                return "b false"
            if object_path.endswith("Cec1") and property_name == "AudioLogicalAddress":
                return "y 5"
            if object_path.endswith("Cec1") and property_name == "Active":
                return "b true"
            raise mote_main.CecError(error_message, stderr="Unknown object")

        self.plugin._read_property = AsyncMock(side_effect=read_property)

        device = await self.plugin._discover_device_once(session)

        self.assertEqual(device.object_path, "/com/steampowered/CecDaemon1/Devices/Cec1")
        self.assertTrue(device.active)

    async def test_stale_cached_object_is_invalidated_and_rediscovered(self):
        session = mote_main.SessionContext(
            busctl_path="/usr/bin/busctl",
            systemctl_path=None,
            env={"LC_ALL": "C"},
        )
        self.plugin._cached_object_path = "/com/steampowered/CecDaemon1/Devices/Cec0"
        self.plugin._get_session_context = Mock(return_value=session)
        self.plugin._discover_device = AsyncMock(
            return_value=mote_main.DeviceInfo(
                object_path="/com/steampowered/CecDaemon1/Devices/Cec1",
                active=True,
            )
        )
        self.plugin._read_audio_logical_address = AsyncMock(
            side_effect=[
                mote_main.CecError(
                    "No CEC device object discovered",
                    stderr="Unknown object",
                ),
                5,
            ]
        )
        self.plugin._call_cec_method = AsyncMock(return_value=None)

        result = await self.plugin.volume_up()

        self.assertTrue(result["ok"])
        self.assertEqual(result["objectPath"], "/com/steampowered/CecDaemon1/Devices/Cec1")
        self.assertEqual(self.plugin._cached_object_path, "/com/steampowered/CecDaemon1/Devices/Cec1")
        self.plugin._discover_device.assert_awaited_once()

    async def test_run_command_returns_controlled_timeout(self):
        process = SlowProcess()

        with patch("main.asyncio.create_subprocess_exec", AsyncMock(return_value=process)), patch(
            "main.COMMAND_TIMEOUT_SECONDS",
            0.01,
        ):
            with self.assertRaisesRegex(mote_main.CecError, "D-Bus call timeout"):
                await self.plugin._run_command(
                    ("/usr/bin/busctl", "--user"),
                    env={"LC_ALL": "C"},
                    error_message="ignored",
                )

        self.assertTrue(process.terminated)
        self.assertTrue(process.wait_called)

    async def test_run_command_never_invokes_shell(self):
        process = FakeProcess(stdout=b"y 0", stderr=b"", returncode=0)

        async def wait_for_side_effect(awaitable, timeout):
            return await awaitable

        with patch("main.asyncio.create_subprocess_exec", AsyncMock(return_value=process)) as exec_mock, patch(
            "main.asyncio.wait_for",
            side_effect=wait_for_side_effect,
        ):
            result = await self.plugin._run_command(
                ("/usr/bin/busctl", "--user", "get-property"),
                env={"LC_ALL": "C"},
                error_message="ignored",
            )

        self.assertEqual(result.stdout, "y 0")
        self.assertNotIn("shell", exec_mock.await_args.kwargs)

    async def _assert_action_mapping(self, action_name: str, expected_method: str):
        session = mote_main.SessionContext(
            busctl_path="/usr/bin/busctl",
            systemctl_path=None,
            env={"LC_ALL": "C"},
        )
        self.plugin._get_session_context = Mock(return_value=session)
        self.plugin._get_object_path = AsyncMock(
            return_value="/com/steampowered/CecDaemon1/Devices/Cec0"
        )
        self.plugin._read_audio_logical_address = AsyncMock(return_value=5)
        self.plugin._call_cec_method = AsyncMock(return_value=None)

        result = await getattr(self.plugin, action_name)()

        self.assertTrue(result["ok"])
        self.plugin._call_cec_method.assert_awaited_once_with(
            session,
            "/com/steampowered/CecDaemon1/Devices/Cec0",
            expected_method,
            5,
        )


if __name__ == "__main__":
    unittest.main()
