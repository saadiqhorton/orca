#!/usr/bin/env python3
"""Round 08 REAL live checks R10-R15 + Saadiq-shape repro on the box rig (no source greps).
Caller = an Orca terminal on hostA ~/work (in hostA's "dockhand group"); target hostB has ~/clawd in its own
"dockhand group" (same name, different id). Every check drives the real orca CLI and asserts on receipts/state."""
import json, re, subprocess, sys, time, shlex, os
RIG = "/workspace/xhost-real-test"
SSH = ["ssh", "-i", f"{RIG}/keys/id_ed25519", "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "LogLevel=ERROR"]
HOSTS = {"A": "hosta@10.77.0.2", "B": "hostb@10.77.0.3"}
OUT = sys.argv[1] if len(sys.argv) > 1 else "/workspace/orca-cook/harness/results/r08/live"
ONLY = set(sys.argv[2:])
os.makedirs(OUT, exist_ok=True)
LOG = []
SECTION = [None]
def sh(host, cmd, timeout=150):
    t = time.time()
    p = subprocess.run(SSH + [HOSTS[host], f"export PATH=$HOME/bin:$PATH; cd ~/work; {cmd}"], capture_output=True, text=True, timeout=timeout)
    r = {"host": host, "cmd": cmd, "exit": p.returncode, "secs": round(time.time() - t, 1), "out": p.stdout + p.stderr, "section": SECTION[0]}
    LOG.append(dict(r, out=r["out"][-6000:])); return r
def desk(args, timeout=150):
    env = dict(os.environ, HOME=f"{RIG}/desktop-home")
    t = time.time()
    p = subprocess.run([f"{RIG}/app/resources/bin/orca-ide"] + args, capture_output=True, text=True, timeout=timeout, env=env)
    r = {"host": "desktop", "cmd": "orca " + " ".join(shlex.quote(a) for a in args), "exit": p.returncode, "secs": round(time.time() - t, 1), "out": (p.stdout + p.stderr)[-6000:], "section": SECTION[0]}
    LOG.append(r); return r
def cdp(js):
    p = subprocess.run(["node", f"{RIG}/tools/cdp-eval.mjs", js], capture_output=True, text=True, timeout=200)
    return p.stdout
def j(r):
    try: return json.JSONDecoder().raw_decode(r["out"][r["out"].index("{"):])[0]
    except Exception: return {}
def orca(host, args, coord=None):
    pre = f"ORCA_TERMINAL_HANDLE={coord} " if coord else ""
    return sh(host, pre + "~/.orca/cli/bin/orca " + args)
def coordinator(host, wt):
    r = orca(host, f"terminal create --worktree {wt} --title r08-coord --json")
    return (re.findall(r"term_[0-9a-f-]+", r["out"]) or [None])[0]
def close(host, h):
    if h: orca(host, f"terminal close --terminal {h}")
def inv():
    return j(orca("A", "host inventory --json")).get("result", {}).get("hosts", [])
def hostinv(name):
    for h in inv():
        if h.get("name") == name: return h.get("inventory") or {}
    return {}
RES = {}
def rec(cid, ok, detail):
    RES[cid] = {"pass": bool(ok), "detail": detail}; print(("PASS " if ok else "FAIL ") + cid + " | " + detail, flush=True)
def want(x):
    ok = not ONLY or x in ONLY
    if ok:
        SECTION[0] = x
    return ok

GB = '"group:\\"dockhand group\\""'   # --worktree 'group:"dockhand group"'
CLAWD = "/home/hostb/clawd"
coordA = coordinator("A", "path:/home/hosta/work")
coordB = coordinator("B", "path:/home/hostb/work")  # hostB ~/work is NOT in a group -> scratch path
print("coordinators", coordA, coordB, flush=True)

if want("R10"):
    r = orca("A", f"terminal create --host ubuntu-server-local --worktree {GB} --json", coordA)
    wt = (j(r).get("result") or {}).get("terminal", {}).get("worktreeId", "") or r["out"]
    rec("R10a terminal create group:", r["exit"] == 0 and CLAWD in wt, f"exit={r['exit']} worktree={wt[-60:]}")
    close("B", (re.findall(r"term_[0-9a-f-]+", r["out"]) or [None])[0])
    r = orca("A", f"agent launch --host ubuntu-server-local --worktree {GB} --agent claude --prompt 'RUN: hostname' --json", coordA)
    d = j(r).get("result") or {}
    rec("R10b agent launch group:", r["exit"] == 0 and CLAWD in str(d.get("worktreeId")) and (d.get("sessionPlacement") or {}).get("source") == "named",
        f"exit={r['exit']} wt={d.get('worktreeId')} placement={d.get('sessionPlacement')}")
    close("B", (d.get("outcome") or {}).get("handle"))
    r = orca("A", f"agent launch --host ubuntu-server-local --group 'dockhand group' --agent claude --prompt 'RUN: hostname' --json", coordA)
    d = j(r).get("result") or {}
    rec("R10c agent launch --group", r["exit"] == 0 and CLAWD in str(d.get("worktreeId")), f"exit={r['exit']} wt={d.get('worktreeId')} out={r['out'][-200:] if r['exit'] else ''}")
    close("B", (d.get("outcome") or {}).get("handle"))
    r = orca("A", f"orchestration worker-start --host ubuntu-server-local --worktree {GB} --agent claude --spec 'echo R10D_OK' --json", coordA)
    d = j(r).get("result") or {}
    rec("R10d worker-start group:", r["exit"] == 0 and d.get("state") == "ready", f"exit={r['exit']} state={d.get('state')} lastError={d.get('lastError')}")
    if d.get("dispatchId"): orca("A", f"orchestration worker-stop --host ubuntu-server-local --dispatch {d['dispatchId']}", coordA)
    # ambiguity: put hostB ~/work into hostB's "dockhand group" too -> must refuse listing both candidates, then restore
    BENV = "98258173-4624-4d40-90a0-3b3217dfc4e6"; BG = "4285d002-11ad-4cfd-9a9b-572e7828e668"
    cdp(f"window.api.runtimeEnvironments.call({{selector:'{BENV}',method:'projectGroup.moveProject',params:{{repo:'path:/home/hostb/work',groupId:'{BG}'}}}}).then(r=>r.ok)")
    time.sleep(2)
    r = orca("A", f"terminal create --host ubuntu-server-local --worktree {GB} --json", coordA)
    rec("R10e ambiguous group lists candidates", r["exit"] != 0 and "/home/hostb/work" in r["out"] and CLAWD in r["out"], f"exit={r['exit']} out={r['out'][-300:]}")
    close("B", (re.findall(r"term_[0-9a-f-]+", r["out"]) or [None])[0])
    r = orca("A", "agent launch --host ubuntu-server-local --agent claude --prompt 'RUN: echo amb' --json", coordA)
    rec("R10f ambiguous same-group refuses (selector_ambiguous), no silent pick", r["exit"] != 0 and "mbiguous" in r["out"], f"exit={r['exit']} out={r['out'][-300:]}")
    close("B", (re.findall(r"term_[0-9a-f-]+", r["out"]) or [None])[0])
    cdp(f"window.api.runtimeEnvironments.call({{selector:'{BENV}',method:'projectGroup.moveProject',params:{{repo:'path:/home/hostb/work',groupId:null}}}}).then(r=>r.ok)")
    time.sleep(2)

if want("R11"):
    r = orca("A", "agent launch --host ubuntu-server-local --agent claude --prompt 'RUN: echo R11A_OK' --json", coordA)
    d = j(r).get("result") or {}
    sp = d.get("sessionPlacement") or {}
    listed = CLAWD in {x.get("path") for x in hostinv("ubuntu-server-local").get("repos", [])}
    rec("R11a agent launch same-group", r["exit"] == 0 and sp.get("source") == "same-group" and CLAWD in str(d.get("worktreeId")) and listed,
        f"exit={r['exit']} placement={sp} wt={d.get('worktreeId')} desktop_lists_clawd={listed}")
    close("B", (d.get("outcome") or {}).get("handle"))
    r = orca("A", "orchestration worker-start --host ubuntu-server-local --agent claude --spec 'echo R11B_OK' --json", coordA)
    d = j(r).get("result") or {}
    rec("R11b worker-start same-group", r["exit"] == 0 and d.get("state") == "ready", f"exit={r['exit']} state={d.get('state')} lastError={d.get('lastError')}")
    if d.get("dispatchId"): orca("A", f"orchestration worker-stop --host ubuntu-server-local --dispatch {d['dispatchId']}", coordA)
    r = orca("B", "agent launch --host dockhand --agent claude --prompt 'RUN: echo R11C_OK' --json", coordB)
    d = j(r).get("result") or {}
    sp = d.get("sessionPlacement") or {}
    rec("R11c ungrouped caller -> scratch", r["exit"] == 0 and sp.get("source") == "scratch" and str(d.get("worktreeId")).startswith("folder:"),
        f"exit={r['exit']} placement={sp} wt={d.get('worktreeId')}")
    close("A", (d.get("outcome") or {}).get("handle"))

def scratch_ids(host_label, src="B", coord=None):
    ids = []
    for i in range(2):
        r = orca(src, f"terminal create --host {host_label} --json", coord)
        t = (j(r).get("result") or {}).get("terminal", {})
        ids.append(t.get("worktreeId")); close("A" if host_label == "dockhand" else "B", t.get("handle"))
    return ids

if want("R12"):
    # ungrouped caller (hostB ~/work) -> scratch on dockhand (hostA)
    ids = scratch_ids("dockhand", "B", coordB)
    fw = [f for f in hostinv("dockhand").get("folderWorkspaces", []) if f.get("path") == "/home/hosta/orca-orchestration"]
    rec("R12a two scratch launches same folder id", ids[0] and ids[0] == ids[1] and ids[0].startswith("folder:"), f"ids={ids}")
    rec("R12b scratch listed in folderWorkspaces", len(fw) == 1 and fw[0].get("selector") == ids[0], f"folderWorkspaces={fw}")
    r = orca("B", f"terminal create --host dockhand --worktree {ids[0]} --json", coordB)
    t = (j(r).get("result") or {}).get("terminal", {})
    rec("R12c folder:<id> resolves", r["exit"] == 0 and t.get("worktreeId") == ids[0], f"exit={r['exit']} wt={t.get('worktreeId')} {r['out'][-150:] if r['exit'] else ''}")
    close("A", t.get("handle"))
    # catalog sync 1: SSH reconnect of dockhand target from the desktop; 2: desktop renderer reload
    print(cdp("window.api.ssh.disconnect({targetId:'ssh-1794854688721-ief2hx'}).then(()=>new Promise(r=>setTimeout(r,3000))).then(()=>window.api.ssh.connect({targetId:'ssh-1794854688721-ief2hx'})).then(r=>r.status)"), flush=True)
    time.sleep(8)
    print(cdp("location.reload(),'reloaded'"), flush=True); time.sleep(20)
    ids2 = scratch_ids("dockhand", "B", coordB)
    fw2 = [f for f in hostinv("dockhand").get("folderWorkspaces", []) if f.get("path") == "/home/hosta/orca-orchestration"]
    rec("R12d same folder id after reconnect+reload catalog sync", ids2[0] == ids[0] == ids2[1] and len(fw2) == 1, f"before={ids[0]} after={ids2} fw={len(fw2)}")

if want("R13"):
    # worker on hostB scratch from ungrouped caller hostB? use hostA->hostB explicit scratch folder selector
    fwB = [f for f in hostinv("ubuntu-server-local").get("folderWorkspaces", []) if f.get("path") == "/home/hostb/orca-orchestration"]
    sel = fwB[0]["selector"] if fwB else "folder:missing"
    r = orca("A", f"orchestration worker-start --host ubuntu-server-local --worktree {sel} --agent claude --spec 'echo R13_RUNNING' --json", coordA)
    d = j(r).get("result") or {}
    disp = d.get("dispatchId")
    rec("R13a worker-start in scratch", r["exit"] == 0 and d.get("state") == "ready", f"exit={r['exit']} state={d.get('state')} err={d.get('lastError')}")
    time.sleep(5)
    # remove the folder workspace row on hostB the way the UI does (desktop -> env RPC), leaving the PTY alive
    B_ENV = os.environ.get("B_ENV", "98258173-4624-4d40-90a0-3b3217dfc4e6")
    fid = sel.split(":", 1)[1]
    print(cdp(f"window.api.runtimeEnvironments.call({{selector:'{B_ENV}',method:'folderWorkspace.delete',params:{{folderWorkspaceId:'{fid}',id:'{fid}'}}}}).then(r=>JSON.stringify(r).slice(0,300))"), flush=True)
    time.sleep(3)
    r = orca("A", f"orchestration worker-stop --host ubuntu-server-local --dispatch {disp}", coordA)
    rs = orca("A", f"orchestration worker-show --host ubuntu-server-local --dispatch {disp}", coordA)
    terms = orca("A", "terminal list --host ubuntu-server-local --json")
    alive = "R13_RUNNING" in terms["out"]
    st = (re.findall(r"state=(\w+)", rs["out"]) or ["?"])[0]
    rec("R13b stop after folder row removed settles (not stop_unknown)", r["exit"] == 0 and st in ("stopped", "succeeded", "failed", "abandoned") and "stop_unknown" not in rs["out"] and not alive,
        f"stop_exit={r['exit']} state={st} stop_out={r['out'][-250:]} pty_alive={alive}")
    # restore scratch for later checks
    orca("A", "terminal create --host ubuntu-server-local --worktree " + sel + " --json", coordA)

if want("R14"):
    r = orca("A", "agent launch --host ubuntu-server-local --agent codex --model gpt-6.2-luna --prompt 'RUN: echo hi' --json", coordA)
    rec("R14a agent launch bad model gpt-6.2-luna exits non-zero", r["exit"] != 0 and "working" not in r["out"].lower(), f"exit={r['exit']} out={r['out'][-250:]}")
    r = orca("A", "orchestration worker-start --host ubuntu-server-local --agent codex --model gpt-6.2-luna --worktree path:/home/hostb/work --spec 'echo hi' --json", coordA)
    d = j(r).get("result") or {}
    disp = d.get("dispatchId")
    time.sleep(6)
    st = orca("A", f"orchestration worker-show --host ubuntu-server-local --dispatch {disp}", coordA)["out"] if disp else ""
    rec("R14b worker-start bad model gpt-6.2-luna exits non-zero, never working", r["exit"] != 0 and "state=working" not in st and d.get("state") != "ready",
        f"exit={r['exit']} state={d.get('state')} err={d.get('lastError') or r['out'][-200:]} show={st[:200]}")
    if disp: orca("A", f"orchestration worker-stop --host ubuntu-server-local --dispatch {disp}", coordA)
    sh("B", "echo 0.154.0 > ~/.stub-codex-version")
    r = orca("A", "agent launch --host ubuntu-server-local --agent codex --model gpt-6-luna --worktree path:/home/hostb/work --prompt 'RUN: echo hi' --json", coordA)
    rec("R14c old codex 0.154 + gpt-6-luna refused non-zero", r["exit"] != 0 and "0.156.0" in r["out"], f"exit={r['exit']} out={r['out'][-250:]}")
    h = (re.findall(r"term_[0-9a-f-]+", r["out"]) or [None])[0]; close("B", h)
    r = orca("A", "orchestration worker-start --host ubuntu-server-local --agent codex --model gpt-6-luna --worktree path:/home/hostb/work --spec 'echo hi' --json", coordA)
    d = j(r).get("result") or {}
    rec("R14d old codex 0.154 + gpt-6-luna worker-start refused", r["exit"] != 0 and d.get("state") != "ready", f"exit={r['exit']} state={d.get('state')} err={d.get('lastError') or r['out'][-200:]}")
    if d.get("dispatchId"): orca("A", f"orchestration worker-stop --host ubuntu-server-local --dispatch {d['dispatchId']}", coordA)
    sh("B", "rm -f ~/.stub-codex-version; echo gpt-5.4 > ~/.stub-reject-models")
    r = orca("A", "agent launch --host ubuntu-server-local --agent codex --model gpt-5.4 --worktree path:/home/hostb/work --prompt 'RUN: echo hi' --json", coordA)
    d = j(r).get("result") or {}
    rec("R14e first-turn model_not_found (API-side) -> blocked, non-zero", r["exit"] != 0 and "agent_turn_failed" in r["out"], f"exit={r['exit']} prompt={d.get('prompt')}")
    close("B", (d.get("outcome") or {}).get("handle"))
    sh("B", "rm -f ~/.stub-reject-models")

if want("R14") or want("R14T"):
    sh("B", "echo gpt-5.4 > ~/.stub-reject-models")
    for delay in (2, 5):
        sh("B", f"echo {delay} > ~/.stub-400-delay")
        r = orca("A", "agent launch --host ubuntu-server-local --agent codex --model gpt-5.4 --worktree path:/home/hostb/work --prompt 'RUN: echo hi' --json", coordA)
        d = j(r).get("result") or {}
        rec(f"R14T agent launch banner->{delay}s->400 => exit 5 agent_turn_failed", r["exit"] == 5 and "agent_turn_failed" in r["out"], f"exit={r['exit']} secs={r['secs']} out={r['out'][-300:]}")
        close("B", (d.get("outcome") or {}).get("handle") or (re.findall(r"term_[0-9a-f-]+", r["out"]) or [None])[0])
        r = orca("A", "orchestration worker-start --host ubuntu-server-local --agent codex --model gpt-5.4 --worktree path:/home/hostb/work --spec 'echo R14T' --json", coordA)
        d = j(r).get("result") or {}
        disp = d.get("dispatchId") or (re.findall(r"ctx_[0-9a-f]+", r["out"]) or [None])[0]
        time.sleep(delay + 3)
        st = orca("A", f"orchestration worker-show --host ubuntu-server-local --dispatch {disp}", coordA)["out"] if disp else ""
        rec(f"R14T worker-start banner->{delay}s->400 => non-zero, not ready", r["exit"] != 0 and d.get("state") != "ready", f"exit={r['exit']} secs={r['secs']} state={d.get('state')} out={r['out'][-300:]} show={st[:250]}")
        home = orca("A", f"orchestration worker-show --dispatch {disp}", coordA)["out"] if disp else ""
        rec(f"R14T caller record after {delay}s 400 is failed agent_turn_failed", r["exit"] != 0 and "state=failed" in home and "agent_turn_failed" in home,
            f"exit={r['exit']} home={home[:300]} remote={st[:200]}")
        if disp: orca("A", f"orchestration worker-stop --host ubuntu-server-local --dispatch {disp}", coordA)
    sh("B", "echo 0.154.0 > ~/.stub-codex-version; echo 2 > ~/.stub-400-delay")
    r = orca("A", "agent launch --host ubuntu-server-local --agent codex --model gpt-6-luna --worktree path:/home/hostb/work --prompt 'RUN: echo hi' --json", coordA)
    rec("R14T agent launch gpt-6-luna on codex 0.154 refused by version gate (not a launched tab)", r["exit"] != 0 and "0.156.0" in r["out"] and "agent_turn_failed" not in r["out"], f"exit={r['exit']} secs={r['secs']} out={r['out'][-300:]}")
    h = (re.findall(r"term_[0-9a-f-]+", r["out"]) or [None])[0]; close("B", h)
    sh("B", "rm -f ~/.stub-codex-version ~/.stub-reject-models ~/.stub-400-delay")

if want("R15"):
    r = desk(["host", "list"])
    print(r["out"][-1500:], flush=True)
    for name in ("dockhand", "10.77.0.2", "ubuntu-server-local"):
        r = desk(["terminal", "create", "--host", name, "--json"])
        t = (j(r).get("result") or {}).get("terminal", {})
        rec(f"R15 desktop --host {name} resolves (no Ambiguous)", r["exit"] == 0 and "mbiguous" not in r["out"], f"exit={r['exit']} wt={t.get('worktreeId')} out={r['out'][-200:] if r['exit'] else ''}")
        if t.get("handle"): desk(["terminal", "close", "--host", name, "--terminal", t["handle"]])

close("A", coordA); close("B", coordB)
json.dump({"results": RES, "log": LOG}, open(f"{OUT}/r08-live.json", "w"), indent=1)
print(json.dumps({k: v["pass"] for k, v in RES.items()}))
