#!/usr/bin/env python3
"""Drive S01–S08 / live R07–R08 with the real orca CLI against a desktop + 2 hosts.

A green result here means spawned terminals and real CLI commands, not greps.
Agents under test never ssh. The operator box-rig path may ssh to copy/run the harness.
"""
from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ERROR_ALLOWLIST = (
    "isn't allowed in extra arguments",
    "isn t allowed in extra arguments",
    "optionNotAllowed",
    "agent_session_operation_unknown",
)
HEADLESS_PREFIX = "headless-terminals:"
BOX_ROOT = Path("/workspace/xhost-real-test")
DEFAULT_A = "ubuntu-server-local"
DEFAULT_B = "dockhand"


def which(name: str) -> str | None:
    return shutil.which(name)


def path_exists(path: str) -> bool:
    """True if path is visible. EACCES on /root/.orca must not crash a non-root run."""
    try:
        return os.path.exists(path)
    except OSError:
        return False


def orca_bin() -> str | None:
    env = os.environ.get("ORCA_BIN")
    if env:
        return env
    for p in (
        os.path.expanduser("~/.orca/cli/bin/orca"),
        os.path.expanduser("~/.local/bin/orca"),
        "/root/.orca/cli/bin/orca",
    ):
        if path_exists(p):
            return p
    return which("orca")


def run(
    args: list[str],
    cwd: Path | None = None,
    timeout: int = 120,
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
            "cmd": " ".join(shlex.quote(a) for a in args),
            "exit": p.returncode,
            "secs": round(time.time() - t0, 1),
            "out": out,
        }
    except subprocess.TimeoutExpired as e:
        out = ""
        if e.stdout:
            out += e.stdout if isinstance(e.stdout, str) else e.stdout.decode(errors="ignore")
        if e.stderr:
            out += "\n" + (
                e.stderr if isinstance(e.stderr, str) else e.stderr.decode(errors="ignore")
            )
        return {"cmd": " ".join(shlex.quote(a) for a in args), "exit": 124, "secs": round(time.time() - t0, 1), "out": out}
    except FileNotFoundError as e:
        return {"cmd": " ".join(shlex.quote(a) for a in args), "exit": 127, "secs": round(time.time() - t0, 1), "out": str(e)}


def orca(args: list[str], timeout: int = 120, env: dict[str, str] | None = None) -> dict[str, Any]:
    bin_path = orca_bin()
    if not bin_path:
        return {"cmd": "orca " + " ".join(args), "exit": 127, "secs": 0, "out": "orca CLI not found"}
    return run([bin_path, *args], timeout=timeout, env=env)


def jparse(text: str) -> dict[str, Any] | None:
    try:
        i = text.index("{")
        return json.loads(text[i:])
    except Exception:
        return None


def host_names() -> tuple[str, str]:
    return (
        os.environ.get("ORCA_VERIFY_HOST_A", DEFAULT_A),
        os.environ.get("ORCA_VERIFY_HOST_B", DEFAULT_B),
    )


def inventory_host_rows(parsed: dict[str, Any], text: str) -> list[dict[str, Any]]:
    hosts = parsed.get("hosts") or parsed.get("result", {}).get("hosts") or []
    if isinstance(hosts, list):
        return [row for row in hosts if isinstance(row, dict)]
    return []


def machine_names_from_inventory(parsed: dict[str, Any], text: str) -> dict[str, str]:
    """Orca --host name → OS hostname (inventory machineName), not the Orca label."""
    mapping: dict[str, str] = {}
    for row in inventory_host_rows(parsed, text):
        name = str(row.get("name") or "")
        inv = row.get("inventory") if isinstance(row.get("inventory"), dict) else {}
        machine = row.get("machineName") or inv.get("machineName")
        if name and machine:
            mapping[name] = str(machine)
    for match in re.finditer(r"^(\S+) \(([^)]+)\)\s+\S+", text or "", re.M):
        mapping.setdefault(match.group(1), match.group(2))
    return mapping


def inventory(timeout: int = 40) -> dict[str, Any]:
    r = orca(["host", "inventory", "--json"], timeout=timeout)
    parsed = jparse(r["out"]) or {}
    text = r["out"]
    a, b = host_names()
    names = []
    hosts = parsed.get("hosts") or parsed.get("result", {}).get("hosts") or []
    if isinstance(hosts, list):
        for row in hosts:
            if isinstance(row, dict):
                name = row.get("name") or row.get("machineName") or ""
                if name:
                    names.append(str(name))
            elif isinstance(row, str):
                names.append(row)
    if not names:
        names = re.findall(r'"name"\s*:\s*"([^"]+)"', text)
    ok = r["exit"] == 0 and a in text and b in text
    return {
        "ok": ok,
        "exit": r["exit"],
        "out": text[:4000],
        "names": names,
        "machine_names": machine_names_from_inventory(parsed, text),
        "cmd": r["cmd"],
        "secs": r["secs"],
        "has_a": a in text,
        "has_b": b in text,
    }


def stub_mode() -> bool:
    """Rig stub agents run shell lines, not the NL spec. Auto-on when the box rig is present."""
    env = os.environ.get("ORCA_VERIFY_STUB", "").strip().lower()
    if env in ("0", "false", "no"):
        return False
    if env in ("1", "true", "yes"):
        return True
    return box_rig_available()


def scripted_facts(spec: dict[str, Any], inv: dict[str, Any]) -> dict[str, str]:
    host_a, host_b = host_names()
    target = spec.get("target") or host_a
    machines = inv.get("machine_names") or {}
    hostname = (
        os.environ.get("ORCA_VERIFY_HOSTNAME")
        or machines.get(target)
        or (host_a if target == host_a else host_b)
    )
    # Never use the Orca --host label (ubuntu-server-local) when inventory named the machine.
    if hostname == target and machines.get(target):
        hostname = machines[target]
    facts = {
        "target_agent": "claude",
        "target_hostname": hostname,
    }
    if "{target_home_marker}" in json.dumps(spec):
        facts["target_home_marker"] = home_marker_for_target(str(target))
    if stub_mode():
        facts["stub"] = "1"
    return facts


def live_wanted() -> bool:
    return os.environ.get("ORCA_VERIFY_LIVE", "").strip().lower() in ("1", "true", "yes")


def box_rig_available() -> bool:
    if os.environ.get("ORCA_VERIFY_BOX_RIG", "").strip() in ("0", "false", "no"):
        return False
    try:
        return BOX_ROOT.is_dir() and (BOX_ROOT / "keys/id_ed25519").exists()
    except OSError:
        return False


def try_start_desktop(root: Path, ev: Path) -> dict[str, Any]:
    """Start a user-provided desktop/runtime if inventory is not already live."""
    note: dict[str, Any] = {"started": False, "pids": [], "cmd": None, "inventory_before": None}
    before = inventory()
    note["inventory_before"] = {k: before[k] for k in ("ok", "exit", "has_a", "has_b", "names")}
    if before["ok"]:
        note["already_live"] = True
        return note
    start_cmd = os.environ.get("ORCA_VERIFY_START_CMD", "").strip()
    if not start_cmd:
        note["reason"] = (
            "no live inventory; set ORCA_VERIFY_START_CMD to spawn the built desktop+runtime, "
            "or start Orca yourself so `orca host inventory --json` lists both hosts"
        )
        (ev / "launch-start.log").write_text(json.dumps(note, indent=2) + "\n")
        return note
    log_path = ev / "desktop-start.log"
    log_f = log_path.open("w")
    proc = subprocess.Popen(
        start_cmd,
        shell=True,
        cwd=root,
        stdout=log_f,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        env=os.environ.copy(),
    )
    note["started"] = True
    note["pids"] = [proc.pid]
    note["cmd"] = start_cmd
    deadline = time.time() + int(os.environ.get("ORCA_VERIFY_START_WAIT_S", "45"))
    last = before
    while time.time() < deadline:
        time.sleep(3)
        last = inventory()
        if last["ok"]:
            break
    note["inventory_after"] = {k: last[k] for k in ("ok", "exit", "has_a", "has_b", "names")}
    (ev / "launch-start.log").write_text(json.dumps(note, indent=2) + "\n")
    return note


def terminals_on(host: str) -> tuple[dict[str, Any], str]:
    r = orca(["terminal", "list", "--host", host, "--json"], timeout=40)
    parsed = jparse(r["out"]) or {}
    terms: dict[str, Any] = {}
    for t in (parsed.get("result") or {}).get("terminals") or []:
        terms[t["handle"]] = {
            "title": t.get("title"),
            "tabId": t.get("tabId"),
            "worktree": t.get("worktreePath") or t.get("worktreeId"),
            "group": None,
        }
    txt = orca(["terminal", "list", "--host", host], timeout=40)["out"]
    group = None
    for line in txt.splitlines():
        m = re.match(r"\s*group (\S+)", line)
        if m:
            group = m.group(1)
        m = re.search(r"\*\s+(term_[0-9a-f-]+)", line)
        if m and m.group(1) in terms:
            terms[m.group(1)]["group"] = group
    return terms, txt


def desktop_listed_workspaces(inv: dict[str, Any] | None) -> set[str]:
    listed: set[str] = set()
    hosts = (inv or {}).get("hosts") or (inv or {}).get("result", {}).get("hosts") or []
    if not isinstance(hosts, list):
        return listed
    for host in hosts:
        if not isinstance(host, dict):
            continue
        body = host.get("inventory") if isinstance(host.get("inventory"), dict) else host
        for repo in body.get("repos") or []:
            if not isinstance(repo, dict):
                continue
            for key in ("path", "selector", "id", "name"):
                if repo.get(key):
                    listed.add(str(repo[key]))
            if repo.get("id"):
                listed.add("id:" + str(repo["id"]))
        for folder in body.get("folderWorkspaces") or []:
            if not isinstance(folder, dict):
                continue
            for key in ("path", "selector", "id", "name"):
                if folder.get(key):
                    listed.add(str(folder[key]))
            if folder.get("id"):
                listed.add("folder:" + str(folder["id"]))
    return listed


def worktree_is_listed(worktree: Any, listed: set[str] | None) -> bool:
    wt = str(worktree or "")
    if not wt or not listed:
        return False
    if wt in listed:
        return True
    return any(token and (token in wt or wt in token) for token in listed)


def tab_is_visible(row: dict[str, Any], listed: set[str] | None = None) -> bool:
    group = str(row.get("group") or "")
    if group.startswith(HEADLESS_PREFIX):
        return False
    if row.get("tabId"):
        return True
    return worktree_is_listed(row.get("worktree"), listed)


def visible_new_tabs(
    before: dict[str, Any], after: dict[str, Any], listed: set[str] | None = None
) -> list[dict[str, Any]]:
    visible = []
    for handle, row in after.items():
        if handle in before:
            continue
        row = {**row, "handle": handle, "visible": tab_is_visible(row, listed)}
        visible.append(row)
    return visible


def extra_args_violation(text: str) -> bool:
    low = text.lower()
    return any(s.lower() in low for s in ERROR_ALLOWLIST)


OWNED_CLAUDE_FLAG = "--append-system-prompt-file"


def process_args_probe() -> str:
    """Live process argv so R07 can require the owned Claude flag, not just 'no allowlist error'."""
    chunks: list[str] = []
    ps = run(["ps", "-ww", "-eo", "args="], timeout=8)
    chunks.append(ps.get("out") or "")
    proc = Path("/proc")
    try:
        entries = list(proc.iterdir()) if proc.is_dir() else []
    except OSError:
        entries = []
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / "cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", "ignore")
        except OSError:
            continue
        if OWNED_CLAUDE_FLAG in raw or "claude" in raw:
            chunks.append(raw)
    return "\n".join(chunks)


def r07_eval(
    *,
    inv_exit: int,
    ws: dict[str, Any],
    launch_host: dict[str, Any],
    launch_local: dict[str, Any],
    combined: str,
) -> dict[str, Any]:
    reasons: list[str] = []
    if extra_args_violation(combined):
        reasons.append("Claude extra-args allowlist / agent_session_operation_unknown")
    if "no_active_sender_terminal" in combined:
        reasons.append("no_active_sender_terminal")
    if inv_exit != 0:
        reasons.append(f"inventory exit {inv_exit}")
    if ws.get("exit") != 0:
        reasons.append(f"worker-start exit {ws.get('exit')}")
    if launch_host.get("exit") != 0:
        reasons.append(f"agent launch --host exit {launch_host.get('exit')}")
    if launch_local.get("exit") != 0:
        reasons.append(f"agent launch local exit {launch_local.get('exit')}")
    if OWNED_CLAUDE_FLAG not in combined:
        reasons.append("missing --append-system-prompt-file in process args")
    return {"pass": not reasons, "reasons": reasons}


def extract_term_handle(text: str) -> str | None:
    found = re.findall(r"term_[0-9a-f-]+", text or "")
    return found[0] if found else None


BOX_SSH_HOSTS = {
    DEFAULT_A: "hostb@10.77.0.3",
    DEFAULT_B: "hosta@10.77.0.2",
}
SEEDED_HOME_MARKER = ".orca-verify-s03"
LS_SENTINEL = "ORCA_S03_LS_DONE"
_LISTING_META = re.compile(
    r"^(handle|title|group|scope|cwd|worktree|tab|id|status|exit|ok)\s*:",
    re.I,
)


def listing_lines(text: str) -> list[str]:
    """Real `ls -A ~` names only. Drop terminal headers, prompts, echo, and the sentinel."""
    names: list[str] = []
    for raw in (text or "").splitlines():
        line = raw.strip().rstrip("/")
        if not line or line in (".", ".."):
            continue
        if line == LS_SENTINEL or line.startswith("EXIT_LS"):
            continue
        if line.startswith("ls -A") or "ls -A" in line or LS_SENTINEL in line:
            continue
        if _LISTING_META.match(line):
            continue
        if line.startswith("* ") or line.startswith("group "):
            continue
        if re.fullmatch(r"term_[0-9a-f-]+", line):
            continue
        if line.startswith("{") or line.startswith("["):
            continue
        if re.search(r"[@~].*[#$]\s*$", line) or (line.endswith("$") and ("@" in line or "~" in line)):
            continue
        names.append(line)
    return names


def pick_home_marker(listing: str) -> str | None:
    """A real `ls -A ~` entry. Never the magic word 'home' unless that name exists."""
    names = listing_lines(listing)
    for preferred in ("gitproj", ".orca", ".orca-remote"):
        if preferred in names:
            return preferred
    return names[0] if names else None


def _ssh_list_home(host: str) -> str:
    remote = BOX_SSH_HOSTS.get(host, "hostb@10.77.0.3")
    try:
        r = run([*ssh_base(), remote, "ls -A ~"], timeout=20)
        return r.get("out") or ""
    except OSError:
        return ""


def _wait_terminal_sentinel(host: str, handle: str, sentinel: str, timeout: float = 15.0) -> str:
    deadline = time.time() + timeout
    last = ""
    while time.time() < deadline:
        read = orca(["terminal", "read", "--host", host, "--terminal", handle], timeout=20)
        last = read.get("out") or ""
        if sentinel in last:
            return last
        time.sleep(0.4)
    return last


def _close_terminal(host: str, handle: str | None) -> None:
    if not handle:
        return
    try:
        orca(["terminal", "close", "--host", host, "--terminal", handle], timeout=30)
    except OSError:
        pass


def _desktop_list_home(host: str) -> str:
    handle = None
    try:
        create = orca(
            ["terminal", "create", "--host", host, "--title", "verify-s03-ls", "--json"],
            timeout=40,
        )
        handle = extract_term_handle(create.get("out") or "")
        if not handle:
            return ""
        orca(
            [
                "terminal",
                "send",
                "--host",
                host,
                "--terminal",
                handle,
                "--text",
                f"ls -A ~; echo {LS_SENTINEL}",
                "--enter",
            ],
            timeout=30,
        )
        return _wait_terminal_sentinel(host, handle, LS_SENTINEL)
    except OSError:
        return ""
    finally:
        _close_terminal(host, handle)


def list_target_home(host: str) -> str:
    """`ls -A ~` on the target. Box-rig prefers ssh; desktop waits for a sentinel then closes the tab."""
    forced = os.environ.get("ORCA_VERIFY_HOME_LISTING")
    if forced is not None:
        return forced
    if box_rig_available():
        listing = _ssh_list_home(host)
        if listing_lines(listing):
            return listing
    return _desktop_list_home(host)


def seed_home_marker(host: str, name: str = SEEDED_HOME_MARKER) -> str:
    cmd = f"touch ~/{name}"
    try:
        if box_rig_available():
            remote = BOX_SSH_HOSTS.get(host, "hostb@10.77.0.3")
            run([*ssh_base(), remote, cmd], timeout=20)
        else:
            create = orca(
                ["terminal", "create", "--host", host, "--title", "verify-s03-seed", "--json"],
                timeout=40,
            )
            handle = extract_term_handle(create.get("out") or "")
            if handle:
                orca(
                    [
                        "terminal",
                        "send",
                        "--host",
                        host,
                        "--terminal",
                        handle,
                        "--text",
                        cmd,
                        "--enter",
                    ],
                    timeout=30,
                )
                _close_terminal(host, handle)
    except OSError:
        pass
    return name


def home_marker_for_target(host: str) -> str:
    forced = os.environ.get("ORCA_VERIFY_HOME_MARKER", "").strip()
    if forced:
        return forced
    picked = pick_home_marker(list_target_home(host))
    if picked:
        return picked
    return seed_home_marker(host)


def workspace_from_inventory(parsed: dict[str, Any]) -> str | None:
    """Prefer the rig `work` folder, else the first inventory workspace path."""
    paths: list[str] = []
    for row in inventory_host_rows(parsed, ""):
        inv = row.get("inventory") if isinstance(row.get("inventory"), dict) else {}
        for folder in inv.get("folderWorkspaces") or []:
            if isinstance(folder, dict) and folder.get("path"):
                paths.append(str(folder["path"]))
        for project in inv.get("projects") or []:
            if not isinstance(project, dict):
                continue
            for key in ("parentPath", "path", "rootPath"):
                if project.get(key):
                    paths.append(str(project[key]))
        for repo in inv.get("repos") or []:
            if not isinstance(repo, dict):
                continue
            sel = str(repo.get("selector") or repo.get("path") or "")
            if sel.startswith("path:"):
                paths.append(sel[5:])
            elif sel.startswith("/"):
                paths.append(sel)
    for path in paths:
        if path.rstrip("/").endswith("/work") or os.path.basename(path.rstrip("/")) == "work":
            return path
    return paths[0] if paths else None


def parse_orcad_version(text: str) -> str | None:
    if not text:
        return None
    try:
        i = text.index("{")
        data = json.loads(text[i:])
    except Exception:
        data = None
    if isinstance(data, dict):
        for key in ("active", "artifactVersion", "version", "fullVersion"):
            value = data.get(key)
            if isinstance(value, str) and "0.1.0+" in value:
                m = re.search(r"0\.1\.0\+[0-9a-f]+", value)
                if m:
                    return m.group(0)
        nested = json.dumps(data)
        m = re.search(r"0\.1\.0\+[0-9a-f]+", nested)
        if m:
            return m.group(0)
    m = re.search(r"0\.1\.0\+[0-9a-f]+", text)
    return m.group(0) if m else None


def runtime_orcad_version() -> str | None:
    """Ask the live CLI, then cat orcad-active.json over the box-rig ssh path."""
    for args in (
        ["host", "inventory", "--json"],
        ["version"],
        ["doctor", "--json"],
    ):
        try:
            r = orca(args, timeout=20)
        except OSError:
            r = {"out": ""}
        found = parse_orcad_version(r.get("out") or "")
        if found:
            return found
    if not box_rig_available():
        return None
    try:
        ssh = ssh_base()
    except OSError:
        return None
    for host in ("hosta@10.77.0.2", "hostb@10.77.0.3"):
        try:
            r = run(
                [*ssh, host, "cat ~/.orca-remote/orcad-active.json 2>/dev/null || true"],
                timeout=15,
            )
        except OSError:
            continue
        found = parse_orcad_version(r.get("out") or "")
        if found:
            return found
    return None


def from_flags(handle: str | None) -> list[str]:
    return ["--from", handle] if handle else []


def ensure_caller_terminal(
    title: str = "verify-orca-caller",
    workspace: str | None = None,
) -> str | None:
    """Desktop-driven worker-start needs a live Orca terminal as the caller.

    Create one (or reuse ORCA_TERMINAL_HANDLE) before driving S01/S03/S05.
    Prefer an inventory workspace (rig ~/work) over $HOME, which is not an Orca workspace.
    """
    existing = os.environ.get("ORCA_TERMINAL_HANDLE")
    if existing:
        return existing
    tries: list[list[str]] = []
    wt = os.environ.get("ORCA_VERIFY_WORKTREE", "").strip()
    if wt:
        tries.append(["terminal", "create", "--worktree", wt, "--title", title, "--json"])
    env_ws = os.environ.get("ORCA_VERIFY_WORKSPACE", "").strip() or workspace
    if env_ws:
        selector = env_ws if env_ws.startswith("path:") else f"path:{env_ws}"
        tries.append(["terminal", "create", "--worktree", selector, "--title", title, "--json"])
    tries.append(["terminal", "create", "--title", title, "--json"])
    tries.append(
        ["terminal", "create", "--worktree", f"path:{os.getcwd()}", "--title", title, "--json"]
    )
    for args in tries:
        r = orca(args, timeout=60)
        handle = extract_term_handle(r["out"])
        if handle:
            os.environ["ORCA_TERMINAL_HANDLE"] = handle
            return handle
    return None


def claude_after_inventory(ev: Path, host_a: str) -> dict[str, Any]:
    """R07: after a host list has been served, Claude worker-start and agent launch must not hit the extras allowlist."""
    caller = ensure_caller_terminal("verify-r07-caller")
    inv = orca(["host", "inventory", "--json"], timeout=40)
    steps = [inv]
    ws = orca(
        [
            "orchestration",
            "worker-start",
            "--host",
            host_a,
            "--agent",
            "claude",
            "--spec",
            "Run hostname and report its exact output in worker_done. Do nothing else.",
            *from_flags(caller),
        ],
        timeout=90,
    )
    steps.append(ws)
    launch_host = orca(
        ["agent", "launch", "--host", host_a, "--agent", "claude", "--prompt", "hostname"],
        timeout=90,
    )
    steps.append(launch_host)
    launch_local = orca(["agent", "launch", "--agent", "claude", "--prompt", "hostname"], timeout=90)
    steps.append(launch_local)
    time.sleep(2)
    ps = process_args_probe()
    combined = "\n".join(s["out"] for s in steps) + "\n" + ps
    judged = r07_eval(
        inv_exit=inv["exit"],
        ws=ws,
        launch_host=launch_host,
        launch_local=launch_local,
        combined=combined,
    )
    (ev / "transcripts" / "r07-claude-after-inventory.log").parent.mkdir(parents=True, exist_ok=True)
    (ev / "transcripts" / "r07-claude-after-inventory.log").write_text(combined)
    return {
        "pass": judged["pass"],
        "reasons": judged["reasons"],
        "violated": extra_args_violation(combined),
        "inventory_exit": inv["exit"],
        "worker_start_exit": ws["exit"],
        "agent_launch_host_exit": launch_host["exit"],
        "agent_launch_local_exit": launch_local["exit"],
        "owned_flag": OWNED_CLAUDE_FLAG in combined,
        "evidence": [str(ev / "transcripts" / "r07-claude-after-inventory.log")],
        "out_tail": combined[-3000:],
        "cmds": [s["cmd"] for s in steps],
    }


def reverse_worker_start(ev: Path, host_a: str, host_b: str) -> dict[str, Any]:
    """R08 / S07: CLI on host_a starts a worker on host_b; tab must not be headless."""
    before, _ = terminals_on(host_b)
    create = orca(
        ["terminal", "create", "--host", host_a, "--title", "verify-reverse-s07", "--json"],
        timeout=60,
    )
    handle = (re.findall(r"term_[0-9a-f-]+", create["out"]) or [""])[0]
    spec = "Run hostname and report its exact output in worker_done. Do nothing else."
    send_cmd = (
        f"orca orchestration worker-start --host {shlex.quote(host_b)} "
        f"--agent claude --spec {shlex.quote(spec)}"
    )
    send = (
        orca(
            ["terminal", "send", "--host", host_a, "--terminal", handle, "--text", send_cmd, "--enter"],
            timeout=60,
        )
        if handle
        else {"cmd": "skip", "exit": 1, "secs": 0, "out": create["out"]}
    )
    time.sleep(8)
    after, list_txt = terminals_on(host_b)
    listed = desktop_listed_workspaces(jparse(inventory().get("out") or "") or {})
    tabs = visible_new_tabs(before, after, listed)
    combined = "\n".join(x["out"] for x in (create, send)) + "\n" + list_txt
    (ev / "transcripts" / "r08-reverse-worker-start.log").parent.mkdir(parents=True, exist_ok=True)
    (ev / "transcripts" / "r08-reverse-worker-start.log").write_text(combined)
    headless = [t for t in tabs if str(t.get("group") or "").startswith(HEADLESS_PREFIX)]
    visible = [t for t in tabs if t.get("visible")]
    ok = bool(visible) and not headless and not extra_args_violation(combined)
    return {
        "pass": ok,
        "source_handle": handle,
        "new_tabs": tabs,
        "headless": headless,
        "visible": visible,
        "create_exit": create["exit"],
        "send_exit": send["exit"],
        "evidence": [str(ev / "transcripts" / "r08-reverse-worker-start.log")],
        "out_tail": combined[-3000:],
        "cmds": [create["cmd"], send["cmd"], f"orca terminal list --host {host_b}"],
    }


def run_scripted(
    skill_dir: Path,
    root: Path,
    ev: Path,
    sid: str,
    spec: dict[str, Any],
    facts: dict[str, str],
) -> dict[str, Any]:
    harness = skill_dir / "harness" / "run_scenario.py"
    scenarios = skill_dir / "scripts" / "scenarios.json"
    out = ev / "transcripts" / f"live-{sid}"
    out.parent.mkdir(parents=True, exist_ok=True)
    args = [
        sys.executable,
        str(harness),
        "--scenario",
        sid,
        "--scenarios-file",
        str(scenarios),
        "--agent",
        "scripted",
        "--round",
        "verify",
        "--env-name",
        "live",
        "--out",
        str(out),
        "--keep-target-tabs",
        "--keep-source-tab",
    ]
    for k, v in facts.items():
        args.extend(["--fact", f"{k}={v}"])
    wt = os.environ.get("ORCA_VERIFY_WORKTREE", "").strip()
    if wt:
        args.extend(["--worktree", wt])
    env = os.environ.copy()
    bin_path = orca_bin()
    if bin_path:
        env["ORCA_BIN"] = bin_path
    r = run(args, cwd=root, timeout=480, env=env)
    payload = {}
    json_path = Path(str(out) + ".json")
    try:
        json_exists = json_path.exists()
    except OSError:
        json_exists = False
    if json_exists:
        try:
            payload = json.loads(json_path.read_text())
        except (OSError, json.JSONDecodeError):
            payload = {}
    return overlay_from_harness(
        payload,
        spec,
        r,
        evidence=[str(json_path), str(out) + ".md"],
        extra_out=r["out"] + json.dumps(payload),
    )


def overlay_from_harness(
    payload: dict[str, Any],
    spec: dict[str, Any],
    r: dict[str, Any],
    *,
    evidence: list[str],
    extra_out: str = "",
    via: str | None = None,
) -> dict[str, Any]:
    """Map harness JSON onto verify-orca. S08 unknown_host + no tab follows harness bar.zero_wrong_host."""
    bar = payload.get("bar") or {}
    visible_ok = True if not spec.get("expect_tab") else bar.get("visible_tab") is True
    passed = bool(payload.get("pass")) and visible_ok
    reasons = list(payload.get("fail_reasons") or [])
    if spec.get("expect_tab") and not visible_ok:
        reasons.append("target tab group is missing or starts with headless-terminals:")
    if extra_args_violation(extra_out + json.dumps(payload)):
        passed = False
        reasons.append("Claude extra-args allowlist / agent_session_operation_unknown")
    metrics = payload.get("metrics") or {}
    zero_wrong = bar.get("zero_wrong_host")
    if zero_wrong is None:
        zero_wrong = not metrics.get("wrong_host_errors")
    wrong_host = [] if zero_wrong else (metrics.get("wrong_host_errors") or [])
    result = {
        "pass": passed,
        "payload": payload,
        "runner": r,
        "reasons": reasons,
        "orca_cmds": metrics.get("orca_invocations") or len(payload.get("commands") or []),
        "bar": bar,
        "evidence": evidence,
        "ssh": metrics.get("ssh_used") or [],
        "wrong_host": wrong_host,
        "final": payload.get("final_answer") or "",
        "wall_s": payload.get("wall_s") or r.get("secs") or 0,
    }
    if via:
        result["via"] = via
    return result


def remote_orca_script(commands: list[str]) -> str:
    """Login-shell PATH plus the well-known absolute CLI. Bare `orca` over ssh is often 127."""
    prelude = (
        'export PATH="$HOME/.orca/cli/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"; '
        'if [ -n "${ORCA_BIN:-}" ] && [ -x "$ORCA_BIN" ]; then BIN="$ORCA_BIN"; '
        'elif [ -x "$HOME/.orca/cli/bin/orca" ]; then BIN="$HOME/.orca/cli/bin/orca"; '
        'elif command -v orca >/dev/null 2>&1; then BIN="$(command -v orca)"; '
        'else BIN=orca; fi; '
    )
    body = "; ".join(f'"$BIN" {cmd}' for cmd in commands)
    return prelude + body


def box_r07_remote_script(workspace: str | None = None) -> str:
    """Run R07 from an Orca workspace (~/work), not $HOME. Skip --from when create fails."""
    ws = workspace or os.environ.get("ORCA_VERIFY_WORKSPACE") or "$HOME/work"
    return (
        remote_orca_script([])
        + f'cd "{ws}" 2>/dev/null || cd "$HOME/work" || cd "$HOME"; '
        'CALLER=$("$BIN" terminal create --title verify-r07-caller --json); '
        'HANDLE=$(printf %s "$CALLER" | grep -oE "term_[0-9a-f-]+" | head -1); '
        'export ORCA_TERMINAL_HANDLE="$HANDLE"; '
        'echo "CALLER=$HANDLE"; '
        'if [ -n "$HANDLE" ]; then FROM="--from $HANDLE"; else FROM=""; fi; '
        '"$BIN" host inventory --json; echo EXIT_INV:$?; '
        '"$BIN" orchestration worker-start --agent claude --spec hostname $FROM --json; echo EXIT_WS:$?; '
        '"$BIN" agent launch --agent claude --prompt hostname --json; echo EXIT_LOCAL:$?; '
        '"$BIN" agent launch --host ubuntu-server-local --agent claude --prompt hostname --json; '
        'echo EXIT_HOST:$?; '
        'sleep 2; ps -ww -eo args=; '
        'for c in /proc/[0-9]*/cmdline; do tr "\\0" " " < "$c" 2>/dev/null; echo; done '
        '| grep -F -- --append-system-prompt-file || true'
    )


def ssh_base() -> list[str]:
    key = BOX_ROOT / "keys/id_ed25519"
    return [
        "ssh",
        "-i",
        str(key),
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
        "-o",
        "LogLevel=ERROR",
    ]


def box_drive(
    skill_dir: Path,
    ev: Path,
    wanted: list[str],
    specs: dict[str, Any],
) -> dict[str, dict[str, Any]] | None:
    if not box_rig_available():
        return None
    harness = skill_dir / "harness" / "run_scenario.py"
    scenarios = skill_dir / "scripts" / "scenarios.json"
    ssh = ssh_base()
    for host in ("hosta@10.77.0.2", "hostb@10.77.0.3"):
        run([*ssh, host, "mkdir -p ~/cook-harness"], timeout=30)
        for src, dest in ((harness, "run_scenario.py"), (scenarios, "scenarios.json")):
            body = src.read_bytes()
            p = subprocess.run(
                [*ssh, host, f"cat > ~/cook-harness/{dest}"],
                input=body,
                timeout=30,
                capture_output=True,
            )
            if p.returncode != 0:
                return None
    results: dict[str, dict[str, Any]] = {}
    for sid in wanted:
        if sid == "S07" or sid == "R08":
            src = "hostb@10.77.0.3"
            wt = "path:$HOME/work"
            facts = "target_hostname=hostA-dockhand"
        else:
            src = "hosta@10.77.0.2"
            wt = "path:$HOME/work"
            marker = home_marker_for_target(DEFAULT_A)
            facts = f"target_hostname=hostB-ubuntu --fact target_home_marker={shlex.quote(marker)}"
        remote_out = f"/tmp/verify-{sid}"
        cmd = (
            f"cd ~/cook-harness && python3 run_scenario.py --scenario {sid} --agent scripted "
            f"--worktree {wt} --round verify --env-name rig --fact {facts} "
            f"--fact target_agent=claude --fact stub=1 --out {remote_out}"
        )
        if sid in ("R07", "R08", "R09", "R10", "R11", "R12", "R13", "R14", "R15"):
            continue
        r = run([*ssh, src, cmd], timeout=480)
        pull = run([*ssh, src, f"cat {remote_out}.json"], timeout=30)
        payload = {}
        try:
            payload = json.loads(pull["out"])
        except Exception:
            payload = {}
        (ev / "transcripts" / f"box-{sid}.json").parent.mkdir(parents=True, exist_ok=True)
        (ev / "transcripts" / f"box-{sid}.json").write_text(json.dumps(payload, indent=2, default=str) + "\n")
        spec = specs.get(sid) or {}
        results[sid] = overlay_from_harness(
            payload,
            spec,
            r,
            evidence=[str(ev / "transcripts" / f"box-{sid}.json")],
            extra_out=r["out"] + json.dumps(payload),
            via="box-rig",
        )
    if "R07" in wanted:
        r = run(
            [*ssh, "hosta@10.77.0.2", "bash", "-lc", box_r07_remote_script()],
            timeout=180,
        )
        (ev / "transcripts" / "box-R07.log").write_text(r["out"])
        def _exit_marker(name: str) -> int:
            found = re.findall(rf"EXIT_{name}:(\d+)", r["out"])
            return int(found[-1]) if found else (r["exit"] if name == "HOST" else 1)

        judged = r07_eval(
            inv_exit=_exit_marker("INV"),
            ws={"exit": _exit_marker("WS")},
            launch_host={"exit": _exit_marker("HOST")},
            launch_local={"exit": _exit_marker("LOCAL")},
            combined=r["out"],
        )
        results["R07"] = {
            "pass": judged["pass"],
            "reasons": judged["reasons"],
            "orca_cmds": 4,
            "bar": {},
            "evidence": [str(ev / "transcripts" / "box-R07.log")],
            "ssh": [],
            "wrong_host": [],
            "final": r["out"][-3000:],
            "wall_s": r["secs"],
            "via": "box-rig",
        }
    if "R08" in wanted:
        s07 = results.get("S07")
        if s07:
            results["R08"] = {**s07, "via": "box-rig-s07"}
        else:
            results["R08"] = no_live_result("R08", "box rig did not run reverse S07")
    if "R09" in wanted:
        results["R09"] = r09_from_results(results, specs, via="box-rig")
    if any(sid in wanted for sid in R08_SIDS):
        results.update(run_r08_script(R08_LIVE, ev, wanted, "box-rig-r08"))
    return results


def hidden_expect_tab_ids(
    results: dict[str, dict[str, Any]], specs: dict[str, Any]
) -> list[str]:
    hidden: list[str] = []
    for sid, spec in specs.items():
        if not spec.get("expect_tab"):
            continue
        row = results.get(sid)
        if not row:
            continue
        bar = row.get("bar") or {}
        if bar.get("visible_tab") is not True:
            hidden.append(sid)
    return hidden


def r09_from_results(
    results: dict[str, dict[str, Any]], specs: dict[str, Any], *, via: str
) -> dict[str, Any]:
    hidden = hidden_expect_tab_ids(results, specs)
    return {
        "pass": not hidden,
        "reasons": [f"{sid} tab is hidden/headless" for sid in hidden],
        "orca_cmds": 0,
        "bar": {"visible_tab": not hidden},
        "evidence": [
            "expect_tab scenarios: "
            + ", ".join(sid for sid, spec in specs.items() if spec.get("expect_tab"))
        ],
        "ssh": [],
        "wrong_host": [],
        "final": "",
        "wall_s": 0,
        "via": via,
    }


R08_SIDS = ("R10", "R11", "R12", "R13", "R14", "R15")
R08_LIVE = Path(__file__).resolve().parent.parent / "harness" / "live" / "r08_live.py"
R08_DESKTOP = Path(__file__).resolve().parent.parent / "harness" / "live" / "r08_desktop.py"


def ingest_r08_payload(payload: dict[str, Any], ev: Path, via: str) -> dict[str, dict[str, Any]]:
    res = payload.get("results") or {}
    out: dict[str, dict[str, Any]] = {}
    evidence = str(ev / "transcripts" / "r08" / "r08-live.json")
    for sid in R08_SIDS:
        keys = [k for k in res if k == sid or str(k).startswith(sid)]
        if not keys:
            out[sid] = no_live_result(sid, f"{via} did not run {sid}")
            continue
        failed = [k for k in keys if not (res[k] or {}).get("pass")]
        details = [f"{k}: {(res[k] or {}).get('detail')}" for k in keys]
        out[sid] = {
            "pass": not failed,
            "reasons": [f"{k}: {(res[k] or {}).get('detail')}" for k in failed],
            "orca_cmds": len(keys),
            "bar": {},
            "evidence": [evidence],
            "ssh": [],
            "wrong_host": [],
            "final": "\n".join(details)[-3000:],
            "wall_s": 0,
            "via": via,
            "detail": {k: res[k] for k in keys},
        }
    return out


def run_r08_script(script: Path, ev: Path, wanted: list[str], via: str) -> dict[str, dict[str, Any]]:
    ids = [sid for sid in R08_SIDS if sid in wanted]
    if not ids:
        return {}
    out_dir = ev / "transcripts" / "r08"
    out_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    bin_path = orca_bin()
    if bin_path:
        env["ORCA_BIN"] = bin_path
    r = run([sys.executable, str(script), str(out_dir), *ids], timeout=900, env=env)
    payload: dict[str, Any] = {}
    for path in sorted(out_dir.glob("r08-live*.json")):
        try:
            payload = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
    (out_dir / "r08-runner.log").write_text(r.get("out") or "")
    if not payload:
        return {sid: no_live_result(sid, f"{via} produced no r08-live.json: {(r.get('out') or '')[-400:]}") for sid in ids}
    return ingest_r08_payload(payload, ev, via)


def no_live_result(sid: str, reason: str) -> dict[str, Any]:
    return {
        "pass": False,
        "reasons": [reason],
        "orca_cmds": 0,
        "bar": {},
        "evidence": [],
        "ssh": [],
        "wrong_host": [],
        "final": "",
        "wall_s": 0,
        "via": "refused-false-green",
    }


def drive(
    skill_dir: Path,
    root: Path,
    ev: Path,
    wanted: list[str],
    specs: dict[str, Any],
    start_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run live CLI scenarios. Returns {mode, inventory, results}."""
    inv = inventory()
    host_a, host_b = host_names()
    mode = "none"
    results: dict[str, dict[str, Any]] = {}
    start_info = start_info or {}

    if inv["ok"]:
        mode = "desktop-cli"
        ws = workspace_from_inventory(jparse(inv.get("out") or "") or {})
        ensure_caller_terminal("verify-orca-desktop-caller", workspace=ws)
        # S01–S06/S08 via scripted CLI; S07/R08 reverse from host_a → host_b.
        for sid in wanted:
            spec = specs.get(sid) or {}
            if sid == "R07":
                r07 = claude_after_inventory(ev, host_a)
                results[sid] = {
                    "pass": r07["pass"],
                    "reasons": (
                        []
                        if r07["pass"]
                        else (r07.get("reasons") or ["Claude launch after inventory failed"])
                    ),
                    "orca_cmds": len(r07["cmds"]),
                    "bar": {"visible_tab": None},
                    "evidence": r07["evidence"],
                    "ssh": [],
                    "wrong_host": [],
                    "final": r07["out_tail"],
                    "wall_s": 0,
                    "via": "desktop-cli",
                    "detail": r07,
                }
                continue
            if sid in ("S07", "R08"):
                rev = reverse_worker_start(ev, host_a, host_b)
                reasons = []
                if not rev["pass"]:
                    if rev["headless"]:
                        reasons.append("reverse worker-start landed in headless-terminals:")
                    if not rev["visible"]:
                        reasons.append("reverse worker-start created no visible desktop tab")
                    if extra_args_violation(rev["out_tail"]):
                        reasons.append("Claude extra-args allowlist / agent_session_operation_unknown")
                    if not reasons:
                        reasons.append("reverse worker-start failed")
                results[sid] = {
                    "pass": rev["pass"],
                    "reasons": reasons,
                    "orca_cmds": len(rev["cmds"]),
                    "bar": {"visible_tab": bool(rev["visible"])},
                    "evidence": rev["evidence"],
                    "ssh": [],
                    "wrong_host": [],
                    "final": rev["out_tail"],
                    "wall_s": 0,
                    "via": "desktop-cli-reverse",
                    "detail": rev,
                }
                continue
            if not sid.startswith("S"):
                continue
            sid_facts = scripted_facts(spec, inv)
            ran = run_scripted(skill_dir, root, ev, sid, spec, sid_facts)
            ran["via"] = "desktop-cli"
            results[sid] = ran
        if "R09" in wanted:
            results["R09"] = r09_from_results(results, specs, via="desktop-cli")
        if any(sid in wanted for sid in R08_SIDS):
            script = R08_LIVE if box_rig_available() else R08_DESKTOP
            via = "box-rig-r08" if box_rig_available() else "desktop-cli-r08"
            results.update(run_r08_script(script, ev, wanted, via))
        return {"mode": mode, "inventory": inv, "results": results, "start": start_info}

    boxed = box_drive(skill_dir, ev, wanted, specs)
    if boxed is not None:
        mode = "box-rig"
        # R07/R08 still need a live Claude-after-inventory / reverse check on a host.
        if "R07" in wanted or "R08" in wanted or "S07" in wanted:
            # Reverse S07 is already how the box runs S07 (from hostb).
            pass
        return {"mode": mode, "inventory": inv, "results": boxed, "start": start_info}

    reason = (
        "no live two-host desktop; refusing to false-green. "
        "Start the built Orca app with two connected hosts (dockhand + ubuntu-server-local), "
        "set ORCA_VERIFY_LIVE=1, or provide ORCA_VERIFY_START_CMD / the cook box rig."
    )
    if live_wanted():
        reason = "ORCA_VERIFY_LIVE=1 but `orca host inventory --json` did not list both hosts. " + reason
    for sid in wanted:
        if sid.startswith("S") or sid in ("R07", "R08") or sid in R08_SIDS:
            results[sid] = no_live_result(sid, reason)
    return {"mode": "none", "inventory": inv, "results": results, "start": start_info, "reason": reason}
