#!/usr/bin/env python3
"""Round-03 judge/probe selftest. No live rig required.

Proves: EACCES orca_bin does not crash; S08 unknown_host + no tab is PASS;
verify-orca overlay agrees with the harness in both desktop-cli and box-rig;
template version is read from orcad-template.json; summary labels follow drive mode.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SCRIPTS.parent / "harness"))

import live_drive  # noqa: E402
import run_scenario as harness  # noqa: E402
import verify_orca  # noqa: E402


class OrcaBinEacces(unittest.TestCase):
    def test_root_stat_permission_error_falls_back_to_path(self):
        def exists(path):
            if str(path).startswith("/root"):
                raise PermissionError(13, "Permission denied", path)
            return False

        with patch.dict(os.environ, {"ORCA_BIN": ""}, clear=False):
            os.environ.pop("ORCA_BIN", None)
            with patch.object(live_drive.os.path, "exists", side_effect=exists):
                with patch.object(live_drive, "which", return_value="/usr/bin/orca"):
                    self.assertEqual(live_drive.orca_bin(), "/usr/bin/orca")

    def test_path_exists_swallows_oserror(self):
        with patch.object(live_drive.os.path, "exists", side_effect=PermissionError(13, "no")):
            self.assertFalse(live_drive.path_exists("/root/.orca/cli/bin/orca"))


class S08RefusalIsPass(unittest.TestCase):
    def test_harness_judge_unknown_host_no_tab(self):
        spec = {
            "expect_tab": False,
            "success": {
                "final_regex": "unknown_host|Unknown host|will not run this command locally",
                "refuse_local": True,
            },
        }
        final = 'error: unknown_host\nUnknown host "TEMPLEOFDOOM". will not run this command locally\n'
        cmds = [
            {
                "cmd": "orca agent launch --host TEMPLEOFDOOM --agent claude --prompt hello --json",
                "exit": 1,
                "secs": 0.4,
                "out": final,
            }
        ]
        metrics = harness.analyse(cmds, final, spec["success"])
        ok, reasons, bar = harness.judge(spec, {}, final, cmds, metrics, 1.0, {})
        self.assertTrue(ok, reasons)
        self.assertTrue(bar["zero_wrong_host"])
        self.assertEqual(metrics["wrong_host_errors"], [])

    def test_overlay_agrees_in_both_modes(self):
        spec = json.loads((SCRIPTS / "scenarios.json").read_text())["S08"]
        payload = {
            "pass": True,
            "fail_reasons": [],
            "bar": {"result": True, "zero_wrong_host": True, "no_ssh": True, "visible_tab": None},
            "metrics": {
                "orca_invocations": 1,
                "ssh_used": [],
                "wrong_host_errors": [{"code": "unknown_host"}],
            },
            "final_answer": "unknown_host",
            "commands": [],
        }
        runner = {"out": "unknown_host", "secs": 1.0, "exit": 1}
        desktop = live_drive.overlay_from_harness(
            payload, spec, runner, evidence=["desktop"], via="desktop-cli"
        )
        boxed = live_drive.overlay_from_harness(
            payload, spec, runner, evidence=["box"], via="box-rig"
        )
        self.assertTrue(desktop["pass"])
        self.assertTrue(boxed["pass"])
        self.assertEqual(desktop["wrong_host"], [])
        self.assertEqual(boxed["wrong_host"], [])
        extra = {
            "no_ssh": True,
            "zero_wrong_host": desktop["bar"]["zero_wrong_host"],
            "wrong_host_errors": desktop["wrong_host"],
        }
        result = verify_orca.scenario_result(
            "S08", spec, passed=desktop["pass"], agent="scripted-cli", reasons=[], orca_cmds=1, extra=extra
        )
        self.assertTrue(result["pass"])
        self.assertTrue(result["bar"]["zero_wrong_host"])


class TemplateAndMode(unittest.TestCase):
    def test_template_version_from_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            marker = root / "out/orcad-template"
            marker.mkdir(parents=True)
            (marker / "orcad-template.json").write_text(
                json.dumps(
                    {
                        "schemaVersion": 3,
                        "artifactVersion": "0.1.0+04f2ee16f6e3",
                        "sourceCommit": "b8c99664b237d7f2dc3814d616ee0fe590ba62cd",
                        "commonSha256": {},
                        "targets": {},
                    }
                )
            )
            self.assertEqual(verify_orca.detect_template_version(root), "0.1.0+04f2ee16f6e3")

    def test_summary_label_follows_drive_mode(self):
        missing = {
            "mode": "live-required",
            "agent": "missing-live-rig",
            "note": "ORCA_VERIFY_LIVE=1 but inventory did not list both hosts.",
        }
        boxed = verify_orca.agent_info_from_drive(missing, {"mode": "box-rig"})
        desktop = verify_orca.agent_info_from_drive(missing, {"mode": "desktop-cli"})
        self.assertEqual(boxed["mode"], "box-rig")
        self.assertEqual(boxed["agent"], "scripted-cli")
        self.assertNotIn("missing-live-rig", boxed["agent"])
        self.assertEqual(desktop["mode"], "desktop-cli")
        self.assertEqual(desktop["live_mode"], "desktop-cli")


class RemoteOrca(unittest.TestCase):
    def test_box_r07_uses_absolute_or_login_path(self):
        script = live_drive.remote_orca_script(["host inventory --json"])
        self.assertIn("$HOME/.orca/cli/bin/orca", script)
        self.assertIn('"$BIN" host inventory --json', script)
        self.assertNotEqual(script.strip().split()[0], "orca")


if __name__ == "__main__":
    unittest.main(verbosity=2)
