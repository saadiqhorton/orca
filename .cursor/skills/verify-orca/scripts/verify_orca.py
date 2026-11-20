#!/usr/bin/env python3
"""verify-orca: launch, doctor, drive Cook S01–S08 + permanent R* regressions, evidence, cleanup.

Agent-facing. Stdlib only. Invoke via ./verify-orca <launch|doctor|run|cleanup|all>.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

SKILL_DIR = Path(__file__).resolve().parents[1]
SCRIPTS = Path(__file__).resolve().parent
REPO_HINTS = [
    Path(os.environ.get("ORCA_ROOT", "")),
    SKILL_DIR.parents[2],  # repo/.cursor/skills/verify-orca
    Path("/tmp/scratch/orca-xhost"),
]


def repo_root() -> Path:
    env = os.environ.get("ORCA_ROOT")
    if env:
        return Path(env).resolve()
    here = SKILL_DIR
    for parent in [here, *here.parents]:
        if path_exists(parent / "src/main/runtime/orchestration/desktop-hub/run-desktop-hub-e2e.ts"):
            return parent
    raise SystemExit("verify-orca: cannot find Orca checkout (set ORCA_ROOT)")


def git_sha(root: Path) -> str:
    p = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    return (p.stdout or "").strip() or "unknown"


def git_sha_short(sha: str) -> str:
    return sha[:8] if sha else "unknown"


def which(name: str) -> str | None:
    return shutil.which(name)


def run_cmd(
    args: list[str],
    cwd: Path,
    timeout: int = 600,
    env: dict[str, str] | None = None,
) -> dict[str, Any]:
    t0 = time.time()
    try:
        p = subprocess.run(
            args,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env or os.environ.copy(),
        )
        out = (p.stdout or "") + (("\n" + p.stderr) if p.stderr else "")
        return {
            "cmd": " ".join(args),
            "exit": p.returncode,
            "secs": round(time.time() - t0, 1),
            "out": out,
        }
    except subprocess.TimeoutExpired as e:
        out = ""
        if e.stdout:
            out += e.stdout if isinstance(e.stdout, str) else e.stdout.decode(errors="ignore")
        if e.stderr:
            out += "\n" + (e.stderr if isinstance(e.stderr, str) else e.stderr.decode(errors="ignore"))
        return {"cmd": " ".join(args), "exit": 124, "secs": round(time.time() - t0, 1), "out": out}


def evidence_dir(root: Path, sha: str) -> Path:
    env = os.environ.get("ORCA_VERIFY_EVIDENCE_DIR")
    if env:
        return Path(env).resolve()
    return root / ".verify-evidence" / git_sha_short(sha)


def run_dir(sha: str) -> Path:
    return Path(os.environ.get("ORCA_VERIFY_RUN_DIR", f"/tmp/orca-verify-{git_sha_short(sha)}"))


def load_scenarios() -> dict[str, Any]:
    return json.loads((SCRIPTS / "scenarios.json").read_text())


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, default=str) + "\n")


def append(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as fh:
        fh.write(text)


def path_is_file(path: Path) -> bool:
    """True if path is a file. EACCES on 700 home dirs must not crash doctor/run."""
    try:
        return Path(path).is_file()
    except OSError:
        return False


def path_is_dir(path: Path) -> bool:
    try:
        return Path(path).is_dir()
    except OSError:
        return False


def path_exists(path: Path) -> bool:
    try:
        return Path(path).exists()
    except OSError:
        return False


def read_text_safe(path: Path) -> str | None:
    try:
        return Path(path).read_text()
    except OSError:
        return None


def _version_from_text(text: str | None) -> str | None:
    if not text:
        return None
    token = text.strip().split()[0]
    if token.startswith("0.1.0+"):
        return token
    m = re.search(r"0\.1\.0\+[0-9a-f]+", text)
    return m.group(0) if m else None


def _template_dirs(root: Path) -> list[Path]:
    env = os.environ.get("ORCA_ORCAD_TEMPLATE_PATH", "").strip()
    dirs = [
        root / "out/orcad-template",
        root / "resources/orcad-template",
    ]
    if env:
        dirs.insert(0, Path(env))
    resources = os.environ.get("ELECTRON_RESOURCES_PATH") or os.environ.get("ORCA_RESOURCES_PATH")
    if resources:
        dirs.insert(0, Path(resources) / "orcad-template")
    home = Path.home()
    dirs.extend(
        [
            home / ".orca" / "resources" / "orcad-template",
            home / "orca" / "resources" / "orcad-template",
        ]
    )
    cwd = Path.cwd()
    if cwd.resolve() == root.resolve():
        dirs.extend([cwd / "resources/orcad-template", cwd / "out/orcad-template"])
    seen: set[str] = set()
    out: list[Path] = []
    for path in dirs:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def _active_orcad_records() -> list[Path]:
    """Local activation records only. Never hard-code rig homes (/home/hosta, /home/hostb, /root)."""
    homes = [Path.home()]
    for key in ("HOME", "ORCA_REMOTE_HOME"):
        value = os.environ.get(key)
        if value:
            homes.append(Path(value))
    paths = [home / ".orca-remote" / "orcad-active.json" for home in homes]
    seen: set[str] = set()
    out: list[Path] = []
    for path in paths:
        key = str(path)
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def runtime_orcad_version() -> str | None:
    """Active orcad version from the CLI or the box-rig ssh path, not unreadable local homes."""
    try:
        from live_drive import runtime_orcad_version as probe

        return probe()
    except OSError:
        return None


def detect_template_version(root: Path) -> str:
    env = os.environ.get("ORCA_TEMPLATE_VERSION")
    if env:
        return env
    for marker in _template_dirs(root):
        manifest = marker / "orcad-template.json"
        if path_is_file(manifest):
            raw = read_text_safe(manifest)
            try:
                data = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                data = {}
            if isinstance(data, dict):
                for key in ("artifactVersion", "version", "fullVersion"):
                    found = _version_from_text(
                        data.get(key) if isinstance(data.get(key), str) else None
                    )
                    if found:
                        return found
        version_file = marker / ".version"
        if path_is_file(version_file):
            found = _version_from_text(read_text_safe(version_file))
            if found:
                return found
        if path_is_dir(marker):
            try:
                children = list(marker.iterdir())
            except OSError:
                children = []
            for child in children:
                m = re.search(r"orcad-(0\.1\.0\+[0-9a-f]+)", child.name)
                if m:
                    return m.group(1)
    slot = root / "out/orcad" / ".version"
    if path_is_file(slot):
        found = _version_from_text(read_text_safe(slot))
        if found:
            return found
    for record in _active_orcad_records():
        if not path_is_file(record):
            continue
        raw = read_text_safe(record)
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):
            continue
        for key in ("active", "artifactVersion", "version"):
            found = _version_from_text(data.get(key) if isinstance(data.get(key), str) else None)
            if found:
                return found
    found = runtime_orcad_version()
    if found:
        return found
    return "unknown"


def bun_doctor(root: Path, env: dict[str, str]) -> dict[str, Any]:
    """Fail ready when bun's postinstall has not produced a runnable pinned binary."""
    pinned_path = root / "config/.bun-version"
    pinned = (read_text_safe(pinned_path) or "").strip() or None if path_exists(pinned_path) else None
    bun_pkg = root / "node_modules/bun/package.json"
    vitest = root / "node_modules/vitest/vitest.mjs"
    runner = root / "config/scripts/test-runtime/execution-policy/run-vitest.mjs"
    bun_bin: Path | None = None
    bun_ver = None
    bun_exists = False
    if path_exists(bun_pkg):
        try:
            meta = json.loads(bun_pkg.read_text())
            rel = (meta.get("bin") or {}).get("bun")
            if rel:
                bun_bin = bun_pkg.parent / rel
                bun_exists = path_exists(bun_bin)
                if bun_exists:
                    probed = run_cmd([str(bun_bin), "--version"], cwd=root, timeout=8, env=env)
                    bun_ver = (probed["out"] or "").strip().splitlines()[0] if probed["exit"] == 0 else None
        except (OSError, json.JSONDecodeError, IndexError):
            bun_bin = bun_bin
    bun_ok = bool(pinned and bun_exists and bun_ver == pinned)
    return {
        "pinned": pinned,
        "bun_package": path_exists(bun_pkg),
        "bun_bin": str(bun_bin) if bun_bin else None,
        "bun_bin_exists": bun_exists,
        "bun_version": bun_ver,
        "vitest_mjs": path_exists(vitest),
        "run_vitest": path_exists(runner),
        "ok": bun_ok and path_exists(vitest) and path_exists(runner),
        "fail_reason": (
            None
            if bun_ok and path_exists(vitest) and path_exists(runner)
            else (
                "bun/vitest setup missing: bun postinstall has not produced a runnable "
                f"pinned binary (pinned {pinned}, found {bun_ver}, bin_exists={bun_exists}, "
                f"vitest_mjs={path_exists(vitest)})"
            )
        ),
    }


def detect_agent_mode(root: Path) -> dict[str, Any]:
    from live_drive import box_rig_available, inventory, live_wanted, orca_bin

    claude = which("claude")
    codex = which("codex")
    try:
        orca = orca_bin()
    except OSError:
        orca = which("orca")
    try:
        inv = inventory() if orca else {"ok": False, "out": "", "names": [], "exit": 127}
    except OSError as err:
        inv = {"ok": False, "out": f"inventory probe failed: {err}", "names": [], "exit": 13}
    if inv.get("ok"):
        agent = "scripted-cli"
        return {
            "mode": "desktop-cli",
            "agent": agent,
            "claude": claude,
            "codex": codex,
            "orca": orca,
            "inventory_ok": True,
            "inventory_out": inv.get("out", "")[:2000],
            "hosts": inv.get("names") or [],
            "note": (
                "Live two-host desktop. Drive runs the real orca CLI (scripted harness + "
                "reverse worker-start + Claude-after-inventory). Green means the real rig passed."
            ),
        }
    if box_rig_available():
        return {
            "mode": "box-rig",
            "agent": "scripted-cli",
            "claude": claude,
            "codex": codex,
            "orca": orca,
            "inventory_ok": False,
            "inventory_out": inv.get("out", "")[:2000],
            "note": (
                "Operator box rig at /workspace/xhost-real-test. Drive runs the real orca CLI "
                "on hosta/hostb (login shell / absolute path)."
            ),
        }
    if live_wanted():
        return {
            "mode": "live-required",
            "agent": "missing-live-rig",
            "claude": claude,
            "codex": codex,
            "orca": orca,
            "inventory_ok": False,
            "inventory_out": inv.get("out", "")[:2000],
            "note": "ORCA_VERIFY_LIVE=1 but inventory did not list both hosts and no box rig is present. S01–S08 will fail.",
        }
    return {
        "mode": "no-live-rig",
        "agent": "no-live-rig",
        "claude": claude,
        "codex": codex,
        "orca": orca,
        "inventory_ok": False,
        "inventory_out": inv.get("out", "")[:2000],
        "note": (
            "No live Orca desktop with dockhand + ubuntu-server-local. S01–S08 FAIL "
            "(refusing to false-green from greps / in-process e2e). R* unit tests may still run."
        ),
    }


def agent_info_from_drive(agent_info: dict[str, Any], live: dict[str, Any]) -> dict[str, Any]:
    mode = live.get("mode") or "none"
    notes = {
        "desktop-cli": "Live two-host desktop. Drive ran the real orca CLI.",
        "box-rig": "Operator box rig. Drive ran the real orca CLI on hosta/hostb.",
        "none": agent_info.get("note", "No live two-host path."),
    }
    agent = "scripted-cli" if mode in ("desktop-cli", "box-rig") else agent_info.get("agent", "no-live-rig")
    return {
        **agent_info,
        "mode": mode,
        "agent": agent,
        "live_mode": mode,
        "note": notes.get(mode, notes["none"]),
    }


def node_env(root: Path) -> dict[str, str]:
    env = os.environ.copy()
    node_bin = Path(sys.executable).parent  # unused; prefer PATH
    nvm = Path.home() / ".nvm/versions/node"
    extras = []
    if path_is_dir(nvm):
        try:
            versions = sorted(nvm.iterdir(), reverse=True)
        except OSError:
            versions = []
        if versions:
            extras.append(str(versions[0] / "bin"))
    extras.append(str(root / "node_modules/.bin"))
    env["PATH"] = ":".join(extras + [env.get("PATH", "")])
    env["NODE_OPTIONS"] = env.get("NODE_OPTIONS", "")
    return env


VITEST_FILES = [
    "src/cli/hosts/desktop-hub-bind.test.ts",
    "src/cli/hosts/desktop-hub-command-route.test.ts",
    "src/cli/hosts/desktop-hub-selector-resolve.test.ts",
    "src/cli/hosts/desktop-hub-cli-bind.test.ts",
    "src/main/runtime/orchestration/desktop-hub/desktop-hub-route.test.ts",
    "src/main/runtime/orchestration/desktop-hub/orca-host-instruction-install.test.ts",
    "src/shared/agent-launch/startup/orca-owned-claude-launch-args.test.ts",
    "src/main/runtime/terminal/surface/mobile-session-layout-projection-group-id.test.ts",
    "src/shared/orchestration/orca-host-awareness.test.ts",
    "src/shared/orchestration/box-safety-probe.test.ts",
    "src/shared/orchestration/desktop-hub-contract.test.ts",
    "src/shared/agent-launch/startup/agent-launch-blocked-prompt.test.ts",
    "src/cli/terminals/terminal-send-startup-dialog.test.ts",
    "src/cli/agents/cli-launch-presentation.test.ts",
    "src/main/runtime/rpc/methods/orchestration/surface/ensure-orchestration-scratch.test.ts",
    "src/main/runtime/rpc/methods/orchestration/surface/orchestration-session-placement.test.ts",
    "src/main/runtime/rpc/methods/orchestration/surface/orchestration-surface-inventory.test.ts",
    "src/shared/orchestration/orchestration-group-selector.test.ts",
    "src/shared/orchestration/host-same-machine.test.ts",
    "src/shared/orchestration/agent-launch-first-turn.test.ts",
    "src/shared/orchestration/codex-model-version-gate.test.ts",
    "src/shared/orchestration/host-catalog-empty-fetch.test.ts",
    "src/cli/hosts/execution-host-flag.test.ts",
    "src/main/runtime/rpc/methods/agent-launch/agent-launch-first-turn-watch.test.ts",
    "src/main/runtime/rpc/methods/agent-launch/agent-launch-codex-model-gate.test.ts",
    "src/main/runtime/rpc/methods/orchestration/worker/stop/worker-stop-missing-folder.test.ts",
    "src/cli/agents/agent-launch-request.test.ts",
    "src/cli/workspaces/worktree-selector-recovery.test.ts",
    "src/cli/agents/agent-launch-process.test.ts",
    "src/cli/output/cli-exit-code.test.ts",
    "src/cli/discovery/root-help-text.test.ts",
    "src/main/runtime/terminal/output/newest-terminal-read.test.ts",
]


def cmd_launch(root: Path, sha: str, ev: Path) -> dict[str, Any]:
    rd = run_dir(sha)
    rd.mkdir(parents=True, exist_ok=True)
    ev.mkdir(parents=True, exist_ok=True)
    env = node_env(root)
    build = run_cmd(
        [
            str(root / "node_modules/.bin/tsx"),
            "--conditions=orca-source",
            "src/packages/process-host/scripts/build-dist.mjs",
        ],
        cwd=root,
        timeout=180,
        env=env,
    )
    e2e_path = root / "src/main/runtime/orchestration/desktop-hub/run-desktop-hub-e2e.ts"
    from live_drive import try_start_desktop

    start = try_start_desktop(root, ev)
    state = {
        "sha": sha,
        "kind": (
            "live-desktop"
            if start.get("already_live") or start.get("started")
            else "build-plus-optional-desktop"
        ),
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pids": list(start.get("pids") or []),
        "process_host_build_exit": build["exit"],
        "e2e_entry": str(e2e_path),
        "hosts": ["dockhand", "ubuntu-server-local"],
        "ssh": False,
        "desktop_start": start,
        "ready": build["exit"] == 0 and path_exists(e2e_path),
    }
    write_json(rd / "run.json", state)
    (ev / "launch.log").write_text(build["out"][-8000:] + f"\nready={state['ready']}\n")
    print(json.dumps({"launch": "ok" if state["ready"] else "fail", "run_dir": str(rd), **{k: state[k] for k in ("sha", "kind", "ready", "hosts")}}))
    if not state["ready"]:
        raise SystemExit(1)
    return state


def cmd_doctor(root: Path, sha: str, ev: Path) -> dict[str, Any]:
    rd = run_dir(sha)
    env = node_env(root)
    e2e = root / "src/main/runtime/orchestration/desktop-hub/run-desktop-hub-e2e.ts"
    tc = root / "config/scripts/typecheck/project-execution/run-typecheck-projects-in-parallel.mjs"
    skill = SKILL_DIR / "SKILL.md"
    orch = read_text_safe(root / "skill-guides/orchestration.md") or ""
    cli = read_text_safe(root / "skill-guides/orca-cli.md") or ""
    typefix = ""
    blocked = root / "src/shared/agent-launch/startup/agent-launch-blocked-prompt.ts"
    if path_exists(blocked):
        typefix = read_text_safe(blocked) or ""
    agent = detect_agent_mode(root)
    leftover = []
    if path_exists(rd / "run.json"):
        prev = json.loads(read_text_safe(rd / "run.json") or "{}")
        for pid in prev.get("pids") or []:
            try:
                os.kill(int(pid), 0)
                leftover.append(pid)
            except OSError:
                pass
    bun = bun_doctor(root, env)
    ready = (
        path_exists(e2e)
        and path_exists(tc)
        and path_exists(skill)
        and "open a terminal on" in orch
        and "never ssh" in orch
        and "what machines" in orch
        and "reason is string" in typefix
        and not leftover
        and bun["ok"]
    )
    doc = {
        "sha": sha,
        "template_version": detect_template_version(root),
        "ready": ready,
        "e2e_entry": str(e2e),
        "typecheck_runner": str(tc),
        "skill": str(skill),
        "hosts_expected": ["dockhand", "ubuntu-server-local"],
        "ssh_between_hosts": False,
        "agent": agent,
        "leftover_pids": leftover,
        "path_has_tsx": bool(which("tsx") or path_exists(root / "node_modules/.bin/tsx")),
        "node": run_cmd(["node", "-v"], cwd=root, timeout=10, env=env)["out"].strip(),
        "box_rig": path_is_dir(Path("/workspace/xhost-real-test")),
        "bun": bun,
        "evidence_dir": str(ev),
    }
    write_json(ev / "doctor.json", doc)
    print(json.dumps({"doctor": "ok" if ready else "fail", "ready": ready, "sha": sha, "agent": agent["mode"]}))
    if not ready:
        raise SystemExit(1)
    return doc


def grep_ok(text: str, needles: list[str]) -> list[str]:
    missing = []
    low = text.lower()
    for n in needles:
        if n.lower() not in low:
            missing.append(n)
    return missing


def scenario_result(
    sid: str,
    spec: dict[str, Any],
    *,
    passed: bool,
    agent: str,
    reasons: list[str],
    orca_cmds: int,
    extra: dict[str, Any],
) -> dict[str, Any]:
    bar = {
        "result": passed,
        "le_6_orca_cmds": orca_cmds <= spec.get("max_orca", 6),
        "zero_wrong_host": extra.get("zero_wrong_host", True),
        "no_ssh": extra.get("no_ssh", True),
        "no_hang": extra.get("no_hang", True),
    }
    ok = passed and bar["le_6_orca_cmds"] and bar["zero_wrong_host"] and bar["no_ssh"]
    if not bar["le_6_orca_cmds"]:
        reasons = reasons + [f"orca cmds {orca_cmds} > {spec.get('max_orca', 6)}"]
    return {
        "scenario": sid,
        "kind": spec.get("kind"),
        "text": spec.get("text"),
        "agent": agent,
        "pass": ok,
        "fail_reasons": reasons if not ok else [],
        "metrics": {
            "orca_invocations": orca_cmds,
            "ssh_used": extra.get("ssh_used", []),
            "wrong_host_errors": extra.get("wrong_host_errors", []),
        },
        "bar": bar,
        "stand_in_unverified": extra.get("stand_in_unverified", []),
        "evidence": extra.get("evidence", []),
        "wall_s": extra.get("wall_s", 0),
    }


def run_typecheck(root: Path, ev: Path, env: dict[str, str]) -> dict[str, Any]:
    r = run_cmd(
        [
            "node",
            "config/scripts/typecheck/project-execution/run-typecheck-projects-in-parallel.mjs",
        ],
        cwd=root,
        timeout=900,
        env=env,
    )
    (ev / "typecheck.log").write_text(
        (r["out"][-200000:] or "(no stdout/stderr; success is silent)\n")
        + f"\nexit={r['exit']} secs={r['secs']}\n"
    )
    return r


def run_vitest(root: Path, ev: Path, env: dict[str, str]) -> dict[str, Any]:
    files = [f for f in VITEST_FILES if path_exists(root / f)]
    r = run_cmd(
        [
            "node",
            "config/scripts/test-runtime/execution-policy/run-vitest.mjs",
            "run",
            "--config",
            "config/vitest.config.ts",
            "--reporter=verbose",
            *files,
        ],
        cwd=root,
        timeout=420,
        env=env,
    )
    (ev / "vitest.log").write_text(r["out"][-200000:])
    r["files"] = files
    return r


def run_e2e(root: Path, ev: Path, env: dict[str, str]) -> dict[str, Any]:
    r = run_cmd(
        [
            "node",
            "node_modules/tsx/dist/cli.mjs",
            "src/main/runtime/orchestration/desktop-hub/run-desktop-hub-e2e.ts",
        ],
        cwd=root,
        timeout=120,
        env=env,
    )
    (ev / "e2e.log").write_text(r["out"][-200000:] + f"\nexit={r['exit']} secs={r['secs']}\n")
    (ev / "transcripts" / "desktop-hub-e2e.log").parent.mkdir(parents=True, exist_ok=True)
    (ev / "transcripts" / "desktop-hub-e2e.log").write_text(r["out"])
    return r


def write_scenario_files(ev: Path, result: dict[str, Any]) -> None:
    sid = result["scenario"]
    write_json(ev / "scenarios" / f"{sid}.json", result)
    md = [
        f"# {sid} agent={result['agent']}",
        "",
        f"Prompt / regression: {result.get('text')}",
        "",
        f"Result: {'PASS' if result['pass'] else 'FAIL'} | orca invocations {result['metrics']['orca_invocations']}",
        "",
    ]
    if result.get("fail_reasons"):
        md.append("Fail reasons: " + "; ".join(result["fail_reasons"]))
        md.append("")
    if result.get("stand_in_unverified"):
        md.append("Stand-in did not cover: " + "; ".join(result["stand_in_unverified"]))
        md.append("")
    md.append("## Evidence")
    md.append("")
    for line in result.get("evidence") or []:
        md.append(f"- {line}")
    md.append("")
    (ev / "scenarios" / f"{sid}.md").write_text("\n".join(md))


def stand_in_suite(
    root: Path,
    specs: dict[str, Any],
    wanted: list[str],
    agent_info: dict[str, Any],
    ev: Path,
    env: dict[str, str],
) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    agent = agent_info["agent"]
    unverified_live = [
        "fresh Claude/Codex with no-hint prompt",
        "real ubuntu-server-local uptime",
        "desktop tab strip screenshot",
        "Codex Hooks need review on a real TTY",
    ]

    # Shared gates
    tc = None
    vt = None
    e2e = None
    orch = (root / "skill-guides/orchestration.md").read_text()
    cli = (root / "skill-guides/orca-cli.md").read_text()
    preamble_src = (root / "src/shared/orchestration/orca-host-awareness.ts").read_text()
    typefix_src = (root / "src/shared/agent-launch/startup/agent-launch-blocked-prompt.ts").read_text()
    presentation_src = (root / "src/cli/agents/cli-launch-presentation.ts").read_text()
    bind_src = (root / "src/cli/hosts/desktop-hub-bind.ts").read_text()
    reveal_src = (root / "src/main/runtime/terminal/launch/terminal-create-reveal.ts").read_text()

    need_tc = any(s in wanted for s in ("R05",))
    need_vt = True
    need_e2e = any(s in ("R02", "R06") for s in wanted)

    if need_tc:
        print("verify-orca: typecheck…", flush=True)
        tc = run_typecheck(root, ev, env)
    if need_vt:
        print("verify-orca: vitest (mapped files)…", flush=True)
        vt = run_vitest(root, ev, env)
    if need_e2e:
        print("verify-orca: desktop-hub e2e…", flush=True)
        e2e = run_e2e(root, ev, env)

    e2e_out = (e2e or {}).get("out", "")
    vt_out = (vt or {}).get("out", "")
    vt_ok = (vt or {}).get("exit", 1) == 0
    e2e_ok = (e2e or {}).get("exit", 1) == 0
    tc_ok = (tc or {}).get("exit", 1) == 0 if tc else True

    trigger_needles = [
        "ubuntu-server-local",
        "open a terminal on",
        "what machines",
        "never ssh",
        "host inventory",
    ]
    orch_miss = grep_ok(orch, trigger_needles)
    cli_miss = grep_ok(cli, trigger_needles)
    preamble_ok = all(
        s in preamble_src
        for s in (
            "Never use ssh",
            "orca host inventory --json",
            "You are running inside Orca",
            "pass its selector as --worktree",
            "never leave placeholders or shell variables unset",
            "gpt 6 luna maps to gpt-6-luna",
            "orca terminal read --terminal",
            "Copy handles exactly",
        )
    )
    r01_ok = not orch_miss and not cli_miss and preamble_ok and vt_ok
    r02_ok = (
        vt_ok
        and "unknown_host" in bind_src
        and "desktop_hub_unavailable" in bind_src
        and ("unknown_host" in vt_out or "refuses unknown --host" in vt_out)
        and "SSH was used" not in e2e_out
    )
    if e2e_ok:
        r02_ok = r02_ok and "a host that is not connected was dialed" not in e2e_out
    r03_ok = vt_ok and "reason is string" in typefix_src and "agent_blocked_on_prompt" in typefix_src
    r04_ok = vt_ok and "folder:fld_remote" in (
        read_text_safe(root / "src/cli/hosts/desktop-hub-selector-resolve.test.ts") or ""
    )
    r05_ok = tc_ok and "reason is string" in typefix_src
    r06_ok = (
        vt_ok
        and "visibleRemote" in presentation_src
        and "surface: 'visible'" in reveal_src
        and (not e2e or (e2e_ok and "term_visible_e2e" in e2e_out))
    )

    r07_src = root / "src/shared/agent-launch/startup/orca-owned-claude-launch-args.test.ts"
    r08_src = root / "src/main/runtime/terminal/surface/mobile-session-layout-projection-group-id.test.ts"
    r07_ok = (
        vt_ok
        and path_exists(r07_src)
        and "parseExtraAgentArgs" in (read_text_safe(r07_src) or "")
        and "buildAgentStartupPlan" in (read_text_safe(r07_src) or "")
        and "orcaOwnedAgentArgs" in (read_text_safe(r07_src) or "")
    )
    r08_ok = (
        vt_ok
        and path_exists(r08_src)
        and "orca-orchestration:folder:" in (read_text_safe(r08_src) or "")
        and "headless-terminals:" in (read_text_safe(r08_src) or "")
    )
    r09_src = root / "src/main/runtime/rpc/methods/orchestration/surface/orchestration-session-placement.test.ts"
    r09_place = read_text_safe(r09_src) or ""
    r09_judge = read_text_safe(SKILL_DIR / "harness" / "run_scenario.py") or ""
    r09_ok = (
        vt_ok
        and path_exists(r09_src)
        and "defaults to the visible Orca orchestration scratch" in r09_place
        and "not a more recent real repo" in r09_place
        and "target tab is missing or headless" in r09_judge
    )
    r10_src = root / "src/shared/orchestration/orchestration-group-selector.test.ts"
    r10_ok = (
        vt_ok
        and path_exists(r10_src)
        and 'group:"dockhand group"' in (read_text_safe(r10_src) or "")
        and "places --worktree group:" in r09_place
    )
    r11_ok = (
        vt_ok
        and "uses a same-named group on the target host" in r09_place
        and "placement.source" in (read_text_safe(root / "src/cli/agents/agent-launch-request.ts") or "")
        and "source: 'named' | 'same-group' | 'scratch'" in (
            read_text_safe(root / "src/main/runtime/rpc/methods/orchestration/surface/orchestration-session-placement.ts") or ""
        )
    )
    r12_src = root / "src/main/runtime/rpc/methods/orchestration/surface/ensure-orchestration-scratch.test.ts"
    r12_e2e = read_text_safe(
        root / "src/main/runtime/orchestration/desktop-hub/desktop-hub-e2e-scenario.ts"
    ) or ""
    r12_ok = (
        vt_ok
        and "reuses the scratch folder by path even when listings hide it" in (read_text_safe(r12_src) or "")
        and "fld_persist" in (read_text_safe(r12_src) or "")
        and "preserveCatalogOnEmptyFetch" in (
            read_text_safe(root / "src/renderer/src/store/folder-workspaces/folder-workspace-catalog.ts") or ""
        )
        and "scratch reuse" in r12_e2e
        and "folderWorkspaces lists" in r12_e2e
    )
    r13_src = root / "src/main/runtime/rpc/methods/orchestration/worker/stop/worker-stop-missing-folder.ts"
    r13_claim = read_text_safe(root / "src/main/runtime/orchestration/db/tasks/task-start-claim.ts") or ""
    r13_ok = (
        vt_ok
        and path_exists(r13_src)
        and "shouldSettleMissingWorkerStop" in (read_text_safe(r13_src) or "")
        and "stop_unknown" in r13_claim
        and "--retry-of" in r13_claim
    )
    r14_src = root / "src/shared/orchestration/agent-launch-first-turn.ts"
    r14_ok = (
        vt_ok
        and path_exists(r14_src)
        and "agent_turn_failed" in (read_text_safe(r14_src) or "")
        and "model_not_found" in (read_text_safe(r14_src) or "")
        and "watchAgentLaunchFirstTurn" in (
            read_text_safe(root / "src/main/runtime/rpc/methods/agent-launch/agent-launch.ts") or ""
        )
    )
    r15_src = root / "src/shared/orchestration/host-same-machine.ts"
    r15_ok = (
        vt_ok
        and path_exists(r15_src)
        and "preferPairedServerForSameMachine" in (read_text_safe(r15_src) or "")
        and "192.168.1.35" in (
            read_text_safe(root / "src/cli/hosts/execution-host-flag.test.ts") or ""
        )
    )

    mapping = {
        "R01": (r01_ok, 0, ["skill YAML + preamble + instruction-install tests"] + ([] if r01_ok else orch_miss + cli_miss), unverified_live),
        "R02": (r02_ok, 1, ["bindDesktopHubHost unknown_host / desktop_hub_unavailable; e2e does not dial unknown hosts"], []),
        "R03": (r03_ok, 0, ["blocked-prompt + terminal-send-startup-dialog tests"], ["live Codex hooks TTY"]),
        "R04": (r04_ok, 0, ["desktop-hub-selector-resolve unique folder:"], ["live bare folder: against two real hosts"]),
        "R05": (r05_ok, 0, [f"full typecheck exit {(tc or {}).get('exit')}"], []),
        "R06": (r06_ok, 1, ["cliLaunchPresentation omits background; e2e term_visible_e2e"], ["desktop window screenshot"]),
        "R07": (r07_ok, 0, ["real parseExtraAgentArgs + resolveAgentStartupPlanInputs + buildAgentStartupPlan"], ["live Claude after inventory"]),
        "R08": (r08_ok, 0, ["getHeadlessMobileSessionGroupId(folder:) is not headless-terminals:"], ["live reverse worker-start group"]),
        "R09": (r09_ok, 0, ["--host defaults to visible scratch; expect_tab fails when headless"], ["live S02/S04 tab strip"]),
        "R10": (r10_ok, 0, ["group: selector resolves a unique workspace or lists candidates"], ["live --group on clawd"]),
        "R11": (r11_ok, 0, ["named → same-group → scratch placement.source"], ["live Hawser/clawd same-group"]),
        "R12": (r12_ok, 0, ["scratch reused by path; empty catalog fetch preserves host rows; e2e two ensureScratch keep folder:fld_e2e"], ["live managed-SSH two-launch folder id"]),
        "R13": (r13_ok, 0, ["missing folder stop settles; stop_unknown offers --retry-of"], ["live worker-stop after vanished folder"]),
        "R14": (r14_ok, 0, ["first-turn model_not_found is agent_blocked_on_prompt, non-zero"], ["live Codex 0.154 model_not_found"]),
        "R15": (r15_ok, 0, ["--host prefers paired server when SSH names the same machine"], ["live desktop --host dockhand"]),
    }

    for sid in wanted:
        if sid not in mapping:
            continue
        spec = specs[sid]
        passed, cmds, evidence, skip = mapping[sid]
        reasons = []
        if not passed:
            reasons.append("stand-in checks failed")
            if sid == "S01":
                reasons.append("e2e must show `agent launch` and term_visible_e2e")
            if sid == "R01" and (orch_miss or cli_miss):
                reasons.append("skill missing: " + ", ".join(orch_miss + cli_miss))
            if sid == "R05" and not tc_ok:
                reasons.append("typecheck exit " + str((tc or {}).get("exit")))
            if sid in ("S01", "S03", "S06", "S07", "S08", "R02", "R06") and e2e and not e2e_ok:
                reasons.append("e2e exit " + str(e2e["exit"]))
            if not vt_ok and sid != "R05":
                reasons.append("vitest exit " + str((vt or {}).get("exit")))
            if sid in ("S08", "R02") and "unknown_host" not in bind_src:
                reasons.append("bindDesktopHubHost missing unknown_host")
        extra = {
            "no_ssh": True,
            "zero_wrong_host": True,
            "stand_in_unverified": skip if agent == "scripted-stand-in" else [],
            "evidence": evidence,
            "wall_s": (e2e or {}).get("secs", 0) if sid.startswith("S") else (tc or {}).get("secs", 0) if sid == "R05" else (vt or {}).get("secs", 0),
        }
        results[sid] = scenario_result(sid, spec, passed=passed, agent=agent, reasons=reasons, orca_cmds=cmds, extra=extra)
        write_scenario_files(ev, results[sid])
    return results


def write_summary(
    ev: Path,
    sha: str,
    template: str,
    agent_info: dict[str, Any],
    results: dict[str, dict[str, Any]],
    doctor: dict[str, Any],
) -> None:
    order = [k for k in load_scenarios() if k in results]
    lines = [
        "# verify-orca summary",
        "",
        f"- **SHA:** `{sha}`",
        f"- **Template:** `{template}`",
        f"- **Agent mode:** `{agent_info.get('live_mode') or agent_info['mode']}` ({agent_info['agent']})",
        f"- **Note:** {agent_info['note']}",
        f"- **Evidence:** `{ev}`",
        "",
        "## Scenarios",
        "",
        "| ID | Kind | Agent | Result | orca cmds | Notes |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    fails = []
    for sid in order:
        r = results[sid]
        note = "; ".join(r.get("fail_reasons") or r.get("stand_in_unverified")[:1] or ["ok"])
        status = "PASS" if r["pass"] else "FAIL"
        if not r["pass"]:
            fails.append(sid)
        lines.append(
            f"| {sid} | {r.get('kind')} | {r['agent']} | **{status}** | {r['metrics']['orca_invocations']} | {note[:80]} |"
        )
    lines += [
        "",
        "## Bar",
        "",
        f"- All wanted scenarios pass: {'yes' if not fails else 'NO — ' + ', '.join(fails)}",
        "- ≤6 orca commands, no ssh, no wrong-host (stand-in command counts are the scripted/e2e path).",
        "",
        "## Stand-in vs real target",
        "",
        "S01–S08 pass only when the Drive step ran the real orca CLI against a desktop + 2 hosts",
        "(or the operator box rig). Greps, unit tests, and in-process e2e cannot green those IDs.",
        "R07 always runs the real launch-argument builder; live R07 also runs Claude after inventory.",
        "R08 always runs the folder: group-id unit; live R08 also reverse worker-start visibility.",
        "",
        "## Doctor",
        "",
        "```json",
        json.dumps({k: doctor.get(k) for k in ("sha", "template_version", "ready", "agent", "box_rig")}, indent=2, default=str),
        "```",
        "",
    ]
    (ev / "summary.md").write_text("\n".join(lines))
    print((ev / "summary.md").read_text())


def cmd_run(root: Path, sha: str, ev: Path, ids: list[str] | None) -> dict[str, dict[str, Any]]:
    specs = load_scenarios()
    wanted = ids or list(specs.keys())
    for sid in wanted:
        if sid not in specs:
            raise SystemExit(f"unknown scenario {sid}")
    env = node_env(root)
    ev.mkdir(parents=True, exist_ok=True)
    (ev / "scenarios").mkdir(exist_ok=True)
    doctor = cmd_doctor(root, sha, ev)
    agent_info = doctor.get("agent") or detect_agent_mode(root)
    template = doctor.get("template_version") or detect_template_version(root)

    results = stand_in_suite(root, specs, wanted, agent_info, ev, env)

    from live_drive import drive as live_drive, try_start_desktop

    start_info = try_start_desktop(root, ev)
    live = live_drive(SKILL_DIR, root, ev, wanted, specs, start_info)
    write_json(ev / "live-drive.json", {k: live[k] for k in live if k != "results"})
    live_results = live.get("results") or {}
    agent_info = agent_info_from_drive(agent_info, live)
    no_live_reason = live.get("reason") or (
        "no live two-host desktop; refusing to false-green"
    )
    for sid in wanted:
        spec = specs[sid]
        if sid.startswith("S") or sid in ("R10", "R11", "R12", "R13", "R14", "R15"):
            lr = live_results.get(sid)
            if not lr:
                lr = {
                    "pass": False,
                    "reasons": [no_live_reason],
                    "orca_cmds": 0,
                    "evidence": [],
                    "ssh": [],
                    "wrong_host": [],
                    "wall_s": 0,
                    "via": "missing",
                    "bar": {},
                }
            bar = lr.get("bar") or {}
            extra = {
                "no_ssh": bar.get("no_ssh", not lr.get("ssh")),
                "zero_wrong_host": bar.get("zero_wrong_host", not lr.get("wrong_host")),
                "stand_in_unverified": [] if lr.get("pass") else [no_live_reason] if live.get("mode") == "none" else [],
                "evidence": lr.get("evidence") or [],
                "wall_s": lr.get("wall_s") or 0,
                "ssh_used": lr.get("ssh") or [],
                "wrong_host_errors": lr.get("wrong_host") or [],
            }
            reasons = list(lr.get("reasons") or [])
            results[sid] = scenario_result(
                sid,
                spec,
                passed=bool(lr.get("pass")),
                agent=agent_info["agent"],
                reasons=reasons,
                orca_cmds=int(lr.get("orca_cmds") or 0),
                extra=extra,
            )
            write_scenario_files(ev, results[sid])
            continue
        if sid in ("R07", "R08", "R09") and live.get("mode") != "none" and sid in live_results:
            lr = live_results[sid]
            if not lr.get("pass"):
                existing = results.get(sid)
                reasons = list(lr.get("reasons") or ["live CLI failed"])
                extra = {
                    "no_ssh": True,
                    "zero_wrong_host": True,
                    "stand_in_unverified": [],
                    "evidence": (existing.get("evidence") if existing else []) + (lr.get("evidence") or []),
                    "wall_s": lr.get("wall_s") or 0,
                }
                results[sid] = scenario_result(
                    sid,
                    spec,
                    passed=False,
                    agent=agent_info["agent"],
                    reasons=reasons,
                    orca_cmds=int(lr.get("orca_cmds") or 0),
                    extra=extra,
                )
                write_scenario_files(ev, results[sid])
    write_summary(ev, sha, template, agent_info, results, doctor)
    if any(not results[s]["pass"] for s in wanted):
        raise SystemExit(2)
    return results


def cmd_cleanup(sha: str, ev: Path) -> None:
    rd = run_dir(sha)
    pids = []
    if path_exists(rd / "run.json"):
        pids = json.loads((read_text_safe(rd / "run.json") or "{}")).get("pids") or []
    for pid in pids:
        try:
            os.kill(int(pid), signal.SIGTERM)
        except OSError:
            pass
    if path_exists(rd):
        shutil.rmtree(rd, ignore_errors=True)
    # Evidence must remain.
    print(json.dumps({"cleanup": "ok", "removed_run_dir": str(rd), "evidence_kept": str(ev), "evidence_exists": path_exists(ev)}))
    if not path_exists(ev) or not path_exists(ev / "summary.md"):
        raise SystemExit("cleanup ate the proof or evidence missing")


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(prog="verify-orca")
    ap.add_argument("command", choices=["launch", "doctor", "run", "cleanup", "all"])
    ap.add_argument("--scenarios", default="", help="comma-separated IDs (default: all S* and R*)")
    ap.add_argument("--evidence-dir", default="")
    return ap.parse_args()


def main() -> None:
    args = parse_args()
    root = repo_root()
    sha = git_sha(root)
    if args.evidence_dir:
        os.environ["ORCA_VERIFY_EVIDENCE_DIR"] = args.evidence_dir
    ev = evidence_dir(root, sha)
    ev.mkdir(parents=True, exist_ok=True)
    ids = [s.strip() for s in args.scenarios.split(",") if s.strip()] or None
    if args.command == "launch":
        cmd_launch(root, sha, ev)
    elif args.command == "doctor":
        cmd_doctor(root, sha, ev)
    elif args.command == "run":
        cmd_run(root, sha, ev, ids)
    elif args.command == "cleanup":
        cmd_cleanup(sha, ev)
    elif args.command == "all":
        cmd_launch(root, sha, ev)
        cmd_doctor(root, sha, ev)
        try:
            cmd_run(root, sha, ev, ids)
        finally:
            cmd_cleanup(sha, ev)


if __name__ == "__main__":
    main()
