#!/usr/bin/env python3
"""verify-orca judge/probe selftest. No live rig required.

Proves: EACCES path probes do not crash; S08 unknown_host + no tab is PASS;
template version from manifest, resources, ssh/runtime active record; S03 marker
from a real ls listing; box-rig R07 cds into ~/work; overlay agrees in both modes;
expect_tab + headless group fails the judge and R09.
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


class IsolatedEnv(unittest.TestCase):
    """Clear ORCA_TEMPLATE_VERSION and ORCA_VERIFY_* so the suite does not depend on the caller env."""

    def setUp(self):
        keys = [k for k in os.environ if k == "ORCA_TEMPLATE_VERSION" or k.startswith("ORCA_VERIFY_")]
        self._env = patch.dict(os.environ, {k: "" for k in keys}, clear=False)
        self._env.start()
        for k in keys:
            os.environ.pop(k, None)

    def tearDown(self):
        self._env.stop()


class OrcaBinEacces(IsolatedEnv):
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


class S08RefusalIsPass(IsolatedEnv):
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


class HiddenTabFails(IsolatedEnv):
    def test_listed_remote_repo_without_tab_id_is_visible(self):
        spec = {"expect_tab": True, "success": {}}
        cmds = [
            {
                "cmd": "orca agent launch --host ubuntu-server-local --json",
                "exit": 0,
                "secs": 0.2,
                "out": "ok",
            }
        ]
        metrics = harness.analyse(cmds, "ok", spec["success"])
        terms = {
            "term_x": {
                "tabId": None,
                "group": "dockhand-group",
                "worktree": "id:repo-clawd::/home/hostb/clawd",
            }
        }
        listed = {"/home/hostb/clawd", "id:repo-clawd"}
        ok, reasons, bar = harness.judge(spec, {}, "ok", cmds, metrics, 1.0, terms, listed)
        self.assertTrue(ok, reasons)
        self.assertTrue(bar["visible_tab"])

    def test_listed_headless_remote_repo_is_visible(self):
        spec = {"expect_tab": True, "success": {}}
        cmds = [
            {
                "cmd": "orca agent launch --host ubuntu-server-local --json",
                "exit": 0,
                "secs": 0.2,
                "out": "ok",
            }
        ]
        metrics = harness.analyse(cmds, "ok", spec["success"])
        terms = {
            "term_x": {
                "tabId": None,
                "group": "headless-terminals:folder:fld_clawd",
                "worktree": "id:repo-clawd::/home/hostb/clawd",
            }
        }
        listed = {"/home/hostb/clawd", "id:repo-clawd"}
        ok, reasons, bar = harness.judge(spec, {}, "ok", cmds, metrics, 1.0, terms, listed)
        self.assertTrue(ok, reasons)
        self.assertTrue(bar["visible_tab"])
        overlay = live_drive.overlay_from_harness(
            {
                "pass": True,
                "fail_reasons": [],
                "bar": {"visible_tab": False, "zero_wrong_host": True},
                "metrics": {"orca_invocations": 1, "ssh_used": [], "wrong_host_errors": []},
                "new_target_terminals": terms,
                "listed_workspaces": sorted(listed),
            },
            spec,
            {"out": "ok", "secs": 1.0, "exit": 0},
            evidence=["listed-headless"],
        )
        self.assertTrue(overlay["pass"], overlay["reasons"])

    def test_reverse_s07_listed_headless_tab_is_visible(self):
        listed = {"/home/hostb/clawd", "id:repo-clawd"}
        row = {
            "tabId": None,
            "group": "headless-terminals:folder:fld_clawd",
            "worktree": "id:repo-clawd::/home/hostb/clawd",
        }
        tab = {**row, "visible": live_drive.tab_is_visible(row, listed)}
        headless = [
            t
            for t in [tab]
            if not t.get("visible")
            and str(t.get("group") or "").startswith(live_drive.HEADLESS_PREFIX)
        ]
        visible = [t for t in [tab] if t.get("visible")]
        self.assertTrue(visible)
        self.assertFalse(headless)

    def test_harness_judge_expect_tab_headless_fails(self):
        spec = {"expect_tab": True, "success": {}}
        cmds = [
            {
                "cmd": "orca terminal create --host ubuntu-server-local --json",
                "exit": 0,
                "secs": 0.2,
                "out": "ok",
            }
        ]
        metrics = harness.analyse(cmds, "ok", spec["success"])
        terms = {
            "term_x": {
                "tabId": "tab_1",
                "group": "headless-terminals:folder:fld_work",
            }
        }
        ok, reasons, bar = harness.judge(spec, {}, "ok", cmds, metrics, 1.0, terms)
        self.assertFalse(ok, reasons)
        self.assertFalse(bar["visible_tab"])
        self.assertTrue(any("headless" in r for r in reasons))

    def test_overlay_expect_tab_headless_fails(self):
        spec = json.loads((SCRIPTS / "scenarios.json").read_text())["S02"]
        payload = {
            "pass": True,
            "fail_reasons": [],
            "bar": {"result": True, "zero_wrong_host": True, "no_ssh": True, "visible_tab": False},
            "metrics": {"orca_invocations": 1, "ssh_used": [], "wrong_host_errors": []},
            "final_answer": "load average",
            "commands": [],
        }
        overlay = live_drive.overlay_from_harness(
            payload, spec, {"out": "ok", "secs": 1.0, "exit": 0}, evidence=["s02"]
        )
        self.assertFalse(overlay["pass"])
        self.assertTrue(any("headless" in r for r in overlay["reasons"]))

    def test_r09_fails_when_expect_tab_scenario_is_headless(self):
        specs = json.loads((SCRIPTS / "scenarios.json").read_text())
        results = {
            "S02": {
                "pass": True,
                "bar": {"visible_tab": False},
            }
        }
        r09 = live_drive.r09_from_results(results, specs, via="selftest")
        self.assertFalse(r09["pass"])
        self.assertTrue(any("S02" in r for r in r09["reasons"]))

    def test_r09_passes_when_expect_tab_scenarios_are_visible(self):
        specs = json.loads((SCRIPTS / "scenarios.json").read_text())
        results = {
            sid: {"pass": True, "bar": {"visible_tab": True}}
            for sid, spec in specs.items()
            if spec.get("expect_tab")
        }
        r09 = live_drive.r09_from_results(results, specs, via="selftest")
        self.assertTrue(r09["pass"], r09["reasons"])


class TemplateAndMode(IsolatedEnv):
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

    def test_template_version_from_resources_and_active_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            resources = root / "resources/orcad-template"
            resources.mkdir(parents=True)
            (resources / "orcad-template.json").write_text(
                json.dumps({"schemaVersion": 3, "artifactVersion": "0.1.0+50f5395cdfd8", "commonSha256": {}, "targets": {}})
            )
            self.assertEqual(verify_orca.detect_template_version(root), "0.1.0+50f5395cdfd8")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rec = Path(tmp) / "orcad-active.json"
            rec.write_text(json.dumps({"schemaVersion": 1, "active": "0.1.0+50f5395cdfd8"}))
            with patch.object(verify_orca, "_active_orcad_records", return_value=[rec]):
                self.assertEqual(verify_orca.detect_template_version(root), "0.1.0+50f5395cdfd8")

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


class RemoteOrca(IsolatedEnv):
    def test_box_r07_uses_absolute_or_login_path(self):
        script = live_drive.remote_orca_script(["host inventory --json"])
        self.assertIn("$HOME/.orca/cli/bin/orca", script)
        self.assertIn('"$BIN" host inventory --json', script)
        self.assertNotEqual(script.strip().split()[0], "orca")


class DesktopFactsAndR07(IsolatedEnv):
    def test_hostname_comes_from_inventory_machine_name(self):
        mapping = live_drive.machine_names_from_inventory(
            {
                "result": {
                    "hosts": [
                        {
                            "name": "ubuntu-server-local",
                            "machineName": "hostB-ubuntu",
                            "status": "connected",
                        },
                        {"name": "dockhand", "machineName": "dezignerdrugz00", "status": "connected"},
                    ]
                }
            },
            "",
        )
        self.assertEqual(mapping["ubuntu-server-local"], "hostB-ubuntu")
        self.assertEqual(mapping["dockhand"], "dezignerdrugz00")
        facts = live_drive.scripted_facts(
            {"target": "ubuntu-server-local"},
            {"machine_names": mapping},
        )
        self.assertEqual(facts["target_hostname"], "hostB-ubuntu")
        self.assertNotEqual(facts["target_hostname"], "ubuntu-server-local")

    def test_stub_mode_auto_on_box_rig(self):
        with patch.object(live_drive, "box_rig_available", return_value=True):
            with patch.dict(os.environ, {"ORCA_VERIFY_STUB": ""}, clear=False):
                os.environ.pop("ORCA_VERIFY_STUB", None)
                self.assertTrue(live_drive.stub_mode())
                facts = live_drive.scripted_facts({"target": "ubuntu-server-local"}, {"machine_names": {}})
                self.assertEqual(facts.get("stub"), "1")
        with patch.object(live_drive, "box_rig_available", return_value=False):
            with patch.dict(os.environ, {"ORCA_VERIFY_STUB": "0"}):
                self.assertFalse(live_drive.stub_mode())

    def test_r07_fails_on_no_active_sender_without_owned_flag(self):
        judged = live_drive.r07_eval(
            inv_exit=0,
            ws={"exit": 1, "out": "no_active_sender_terminal"},
            launch_host={"exit": 0, "out": "ok"},
            launch_local={"exit": 0, "out": "ok"},
            combined="no_active_sender_terminal\nworker-start failed",
        )
        self.assertFalse(judged["pass"])
        self.assertTrue(any("no_active_sender_terminal" in r for r in judged["reasons"]))

    def test_r07_requires_owned_flag_and_zero_exits(self):
        judged = live_drive.r07_eval(
            inv_exit=0,
            ws={"exit": 0},
            launch_host={"exit": 0},
            launch_local={"exit": 0},
            combined="claude --append-system-prompt-file /tmp/ORCA.md --prompt hostname",
        )
        self.assertTrue(judged["pass"], judged["reasons"])


class PathProbesNeverCrash(IsolatedEnv):
    def test_template_version_swallows_permission_error_on_unreadable_homes(self):
        real_is_file = Path.is_file

        def is_file(self):
            if any(part in str(self) for part in ("/home/hosta", "/home/hostb", "/root")):
                raise PermissionError(13, "Permission denied", str(self))
            return real_is_file(self)

        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(Path, "is_file", is_file):
                with patch.object(verify_orca, "runtime_orcad_version", return_value=None):
                    self.assertEqual(verify_orca.detect_template_version(Path(tmp)), "unknown")

    def test_active_records_do_not_hardcode_rig_homes(self):
        paths = [str(p) for p in verify_orca._active_orcad_records()]
        joined = "\n".join(paths)
        self.assertNotIn("/home/hosta", joined)
        self.assertNotIn("/home/hostb", joined)

    def test_path_is_file_swallows_oserror(self):
        bogus = Path("/home/hosta/.orca-remote/orcad-active.json")
        with patch.object(Path, "is_file", side_effect=PermissionError(13, "no")):
            self.assertFalse(verify_orca.path_is_file(bogus))


class TemplateVersionFromRuntime(IsolatedEnv):
    def test_schema4_manifest_falls_back_to_runtime_active(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            marker = root / "resources/orcad-template"
            marker.mkdir(parents=True)
            (marker / "orcad-template.json").write_text(json.dumps({"schemaVersion": 4}))
            with patch.object(verify_orca, "_template_dirs", return_value=[marker]):
                with patch.object(verify_orca, "_active_orcad_records", return_value=[]):
                    with patch.object(
                        verify_orca, "runtime_orcad_version", return_value="0.1.0+a46e76b8b300"
                    ):
                        self.assertEqual(
                            verify_orca.detect_template_version(root), "0.1.0+a46e76b8b300"
                        )

    def test_runtime_probe_reads_ssh_orcad_active_json(self):
        payload = json.dumps({"schemaVersion": 1, "active": "0.1.0+a46e76b8b300"})
        with patch.object(live_drive, "box_rig_available", return_value=True):
            with patch.object(live_drive, "orca", return_value={"exit": 1, "out": ""}):
                with patch.object(
                    live_drive,
                    "run",
                    return_value={"exit": 0, "out": payload},
                ):
                    self.assertEqual(live_drive.runtime_orcad_version(), "0.1.0+a46e76b8b300")


class S03HomeMarker(IsolatedEnv):
    S03 = {
        "target": "ubuntu-server-local",
        "success": {"final_contains_any": ["{target_home_marker}"]},
    }

    def test_pick_home_marker_uses_real_listing_not_magic_home(self):
        self.assertEqual(live_drive.pick_home_marker("gitproj\n.orca\n"), "gitproj")
        self.assertEqual(live_drive.pick_home_marker("Desktop\nDownloads\n"), "Desktop")
        self.assertIsNone(live_drive.pick_home_marker(""))
        self.assertNotEqual(live_drive.pick_home_marker("Desktop\n.gitconfig\n"), "home")

    def test_scripted_facts_s03_uses_listed_entry(self):
        with patch.object(live_drive, "list_target_home", return_value="Desktop\n.gitconfig\nwork\n"):
            facts = live_drive.scripted_facts(self.S03, {"machine_names": {}})
            self.assertEqual(facts["target_home_marker"], "Desktop")
            self.assertNotEqual(facts["target_home_marker"], "home")

    def test_scripted_facts_s03_seeds_when_listing_empty(self):
        with patch.object(live_drive, "list_target_home", return_value=""):
            with patch.object(
                live_drive, "seed_home_marker", return_value=".orca-verify-s03"
            ) as seed:
                facts = live_drive.scripted_facts(self.S03, {"machine_names": {}})
                seed.assert_called()
                self.assertEqual(facts["target_home_marker"], ".orca-verify-s03")

    def test_pick_home_marker_drops_terminal_headers_prompts_and_echo(self):
        raw = (
            "handle: term_ab12cd34\n"
            "title: verify-s03-ls\n"
            "group orca-orchestration:folder:fld\n"
            "ls -A ~; echo ORCA_S03_LS_DONE\n"
            "hostB-ubuntu:~$ ls -A ~\n"
            ".gitconfig\n"
            "gitproj\n"
            "ORCA_S03_LS_DONE\n"
            "hostB-ubuntu:~$ \n"
        )
        self.assertEqual(live_drive.pick_home_marker(raw), "gitproj")
        self.assertNotEqual(live_drive.pick_home_marker(raw), "handle: term_ab12cd34")
        lines = live_drive.listing_lines(raw)
        self.assertNotIn("handle: term_ab12cd34", lines)
        self.assertNotIn("ls -A ~", lines)
        self.assertIn("gitproj", lines)

    def test_box_rig_prefers_ssh_ls_over_desktop_terminal(self):
        with patch.object(live_drive, "box_rig_available", return_value=True):
            with patch.object(live_drive, "ssh_base", return_value=["ssh"]):
                with patch.object(
                    live_drive, "run", return_value={"exit": 0, "out": ".orca\ngitproj\n"}
                ) as run:
                    with patch.object(live_drive, "orca") as orca_mock:
                        listing = live_drive.list_target_home("ubuntu-server-local")
        self.assertEqual(live_drive.pick_home_marker(listing), "gitproj")
        run.assert_called()
        self.assertTrue(any("ls -A ~" in str(c) for c in run.call_args_list))
        for call in orca_mock.call_args_list:
            self.assertNotIn("terminal", str(call))

    def test_desktop_ls_waits_for_sentinel_and_closes_terminal(self):
        calls: list[list[str]] = []

        def orca(args, **_kw):
            calls.append(list(args))
            if args[:2] == ["terminal", "create"]:
                return {"exit": 0, "out": '{"result":{"terminal":{"handle":"term_abc"}}}'}
            if args[:2] == ["terminal", "read"]:
                return {
                    "exit": 0,
                    "out": "handle: term_abc\n.gitconfig\ngitproj\nORCA_S03_LS_DONE\n",
                }
            return {"exit": 0, "out": "ok"}

        with patch.object(live_drive, "box_rig_available", return_value=False):
            with patch.object(live_drive.time, "sleep"):
                with patch.object(live_drive, "orca", side_effect=orca):
                    listing = live_drive.list_target_home("ubuntu-server-local")
        self.assertEqual(live_drive.pick_home_marker(listing), "gitproj")
        self.assertTrue(any(c[:2] == ["terminal", "close"] for c in calls))
        send = next(c for c in calls if c[:2] == ["terminal", "send"])
        self.assertTrue(any(live_drive.LS_SENTINEL in a for a in send))


class EnvIsolation(unittest.TestCase):
    def test_setup_clears_exported_template_version_and_verify_star(self):
        with patch.dict(
            os.environ,
            {"ORCA_TEMPLATE_VERSION": "0.1.0+deadbeefc0de", "ORCA_VERIFY_LIVE": "1"},
            clear=False,
        ):
            inner = IsolatedEnv(methodName="run")
            inner.setUp()
            try:
                self.assertFalse(os.environ.get("ORCA_TEMPLATE_VERSION"))
                self.assertFalse(os.environ.get("ORCA_VERIFY_LIVE"))
                with tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    marker = root / "out/orcad-template"
                    marker.mkdir(parents=True)
                    (marker / "orcad-template.json").write_text(
                        json.dumps(
                            {
                                "schemaVersion": 3,
                                "artifactVersion": "0.1.0+04f2ee16f6e3",
                                "commonSha256": {},
                                "targets": {},
                            }
                        )
                    )
                    self.assertEqual(verify_orca.detect_template_version(root), "0.1.0+04f2ee16f6e3")
            finally:
                inner.tearDown()
            self.assertEqual(os.environ.get("ORCA_TEMPLATE_VERSION"), "0.1.0+deadbeefc0de")
            self.assertEqual(os.environ.get("ORCA_VERIFY_LIVE"), "1")


class BoxR07Workspace(IsolatedEnv):
    def test_box_r07_cds_into_work_before_terminal_create(self):
        script = live_drive.box_r07_remote_script()
        self.assertRegex(script, r'cd\s+"?\$HOME/work"?')
        self.assertIn("terminal create", script)
        self.assertLess(script.find("$HOME/work"), script.find("terminal create"))

    def test_box_r07_skips_from_when_caller_handle_empty(self):
        script = live_drive.box_r07_remote_script()
        self.assertIn('if [ -n "$HANDLE" ]', script)
        self.assertIn("--from", script)
        self.assertNotRegex(script, r'worker-start[^;\n]*--from "\$HANDLE"')

    def test_workspace_from_inventory_prefers_work_folder(self):
        parsed = {
            "hosts": [
                {
                    "name": "ubuntu-server-local",
                    "inventory": {
                        "folderWorkspaces": [
                            {"name": "scratch", "path": "/tmp/scratch"},
                            {"name": "work", "path": "/home/someone/work"},
                        ]
                    },
                }
            ]
        }
        self.assertEqual(live_drive.workspace_from_inventory(parsed), "/home/someone/work")

    def test_inventory_keeps_full_json_so_listed_workspaces_parse(self):
        folders = [
            {
                "id": f"fld_{i:04d}",
                "selector": f"folder:fld_{i:04d}",
                "path": f"/home/hostb/work/ws{i:04d}",
            }
            for i in range(80)
        ]
        folders.append(
            {
                "id": "fld_clawd",
                "selector": "folder:fld_clawd",
                "path": "/home/hostb/clawd",
            }
        )
        payload = {
            "result": {
                "hosts": [
                    {
                        "name": "ubuntu-server-local",
                        "inventory": {"folderWorkspaces": folders, "repos": []},
                    },
                    {
                        "name": "dockhand",
                        "inventory": {"folderWorkspaces": [], "repos": []},
                    },
                ]
            }
        }
        raw = "ok " + json.dumps(payload)
        self.assertGreater(len(raw), 4000)
        with patch.object(
            live_drive,
            "orca",
            return_value={"exit": 0, "out": raw, "cmd": ["host", "inventory"], "secs": 0.1},
        ):
            with patch.object(
                live_drive, "host_names", return_value=("ubuntu-server-local", "dockhand")
            ):
                inv = live_drive.inventory()
        self.assertGreater(len(inv["out"]), 4000)
        self.assertIsNone(live_drive.jparse(raw[:4000]))
        parsed = inv.get("parsed") or live_drive.jparse(inv["out"]) or {}
        listed = live_drive.desktop_listed_workspaces(parsed)
        self.assertIn("/home/hostb/clawd", listed)
        self.assertTrue(live_drive.workspace_from_inventory(parsed))


class R08Ingest(IsolatedEnv):
    def test_ingest_counts_orca_cmds_not_subcheck_keys_and_skips_max_orca(self):
        ev = Path(tempfile.mkdtemp())
        payload = {
            "results": {
                "R14a": {"pass": True, "detail": "a"},
                "R14b": {"pass": True, "detail": "b"},
                "R14T worker-start": {"pass": True, "detail": "t"},
            },
            "log": [
                {
                    "section": "R14",
                    "cmd": "~/.orca/cli/bin/orca orchestration worker-start --json",
                },
                {
                    "section": "R14",
                    "cmd": "~/.orca/cli/bin/orca orchestration worker-show --dispatch ctx_1",
                },
                {"section": "R15", "cmd": "orca terminal create --host dockhand --json"},
                {"section": "R14", "cmd": "echo gpt-5.4 > ~/.stub-reject-models"},
            ],
        }
        ingested = live_drive.ingest_r08_payload(
            payload, ev, "box-rig-r08", str(ev / "transcripts" / "r08" / "r08-live.json")
        )
        self.assertEqual(ingested["R14"]["orca_cmds"], 2)
        self.assertTrue(ingested["R14"]["skip_max_orca"])
        self.assertTrue(ingested["R14"]["pass"])
        extra = {"skip_max_orca": True, "no_ssh": True, "zero_wrong_host": True}
        judged = verify_orca.scenario_result(
            "R14",
            {"max_orca": 6, "kind": "regression", "text": "first-turn"},
            passed=True,
            agent="scripted-cli",
            reasons=[],
            orca_cmds=10,
            extra=extra,
        )
        self.assertTrue(judged["pass"])
        self.assertTrue(judged["bar"]["le_6_orca_cmds"])
        self.assertEqual(
            ingested["R14"]["evidence"],
            [str(ev / "transcripts" / "r08" / "r08-live.json")],
        )

    def test_ingest_evidence_uses_the_file_that_was_read(self):
        ev = Path(tempfile.mkdtemp())
        path = str(ev / "transcripts" / "r08" / "r08-live-R10-R11-R12-R13-R14-R15.json")
        ingested = live_drive.ingest_r08_payload(
            {"results": {"R10a": {"pass": True, "detail": "ok"}}, "log": []},
            ev,
            "box-rig-r08",
            path,
        )
        self.assertEqual(ingested["R10"]["evidence"], [path])


class R08LiveSource(IsolatedEnv):
    def test_r13_restores_scratch_with_host_and_no_worktree(self):
        source = (SCRIPTS.parent / "harness" / "live" / "r08_live.py").read_text()
        self.assertIn('terminal create --host ubuntu-server-local --json', source)
        self.assertNotIn(
            "terminal create --host ubuntu-server-local --worktree \" + sel",
            source,
        )

    def test_r14_caller_record_reads_show_or_list_not_error_payload(self):
        source = (SCRIPTS.parent / "harness" / "live" / "r08_live.py").read_text()
        rec = 'R14T caller record after {delay}s 400 is failed agent_turn_failed'
        start = source.index(rec)
        chunk = source[start : start + 500]
        self.assertIn("worker-show --dispatch", source)
        self.assertIn("worker-list --json", source)
        self.assertNotIn('r["exit"] != 0 and "state=failed"', chunk)
        self.assertIn('"state=failed" in home and "agent_turn_failed" in home', chunk)


if __name__ == "__main__":
    unittest.main(verbosity=2)
