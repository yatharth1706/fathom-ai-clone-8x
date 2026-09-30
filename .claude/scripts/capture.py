#!/usr/bin/env python3
"""Agent capture hook for Claude Code.

Wired in .claude/settings.json:
  SessionStart     -> capture.py session-start  (remembers the session's model)
  UserPromptSubmit -> capture.py prompt         (appends the PROMPT entry, verbatim)
  Stop             -> capture.py stop           (appends the final RESPONSE entry)

One markdown file per session in .agent-logs/, named
YYYY-MM-DD_HH-MM-SS_<session-id>.md. Entries are append-only; only the
frontmatter counters (total_exchanges, last_prompt_time, model) are refreshed.
Only the prompt and the final assistant text of a turn are logged: no thinking,
no tool calls, no intermediate text.

The hook must never break the session: every failure is swallowed and written
to $TMPDIR/agent-capture/errors.log, and the script always exits 0 silently.
"""
import json
import os
import re
import sys
import tempfile
import time
import traceback
from datetime import datetime, timezone

PROJECT_DIR = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
LOG_DIR = os.environ.get("CAPTURE_LOG_DIR") or os.path.join(PROJECT_DIR, ".agent-logs")
CONFIG_PATH = os.path.join(PROJECT_DIR, ".claude", "capture.json")
CACHE_DIR = os.path.join(tempfile.gettempdir(), "agent-capture")

ENTRY_RE = re.compile(r"^\[LOG_ENTRY type=(PROMPT|RESPONSE) num=(\d+) session=\S+\]$", re.M)
FRONTMATTER_RE = re.compile(r"\A---\n.*?\n---\n", re.S)


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def load_config():
    cfg = {"author": "unknown", "project": os.path.basename(PROJECT_DIR), "tool": "claude-code"}
    try:
        with open(CONFIG_PATH) as f:
            cfg.update(json.load(f))
    except Exception:
        pass
    return cfg


# ---------------------------------------------------------------- transcript

def read_transcript(path):
    entries = []
    if not path or not os.path.exists(path):
        return entries
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except ValueError:
                continue
    return entries


def is_human_prompt(e):
    if e.get("type") != "user" or e.get("isMeta") or e.get("isSidechain"):
        return False
    origin = e.get("origin") or {}
    if origin.get("kind"):
        return origin["kind"] == "human"
    content = (e.get("message") or {}).get("content")
    if isinstance(content, list):
        return not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)
    return isinstance(content, str)


def prompt_text(e):
    content = (e.get("message") or {}).get("content")
    if isinstance(content, str):
        return content
    parts = []
    for b in content or []:
        if isinstance(b, dict) and b.get("type") == "text":
            parts.append(b.get("text", ""))
    return "\n".join(parts)


def last_turn(entries, skip_prompt=None):
    """Return (prompt_entry, assistant_entries_after_it) for the latest human prompt.

    skip_prompt: text of a prompt that was just submitted and may already be in the
    transcript; if the latest prompt is that one with no reply yet, use the one before.
    """
    idxs = [i for i, e in enumerate(entries) if is_human_prompt(e)]
    if not idxs:
        return None, []
    idx = idxs[-1]
    if (skip_prompt is not None and len(idxs) > 1
            and prompt_text(entries[idx]).strip() == skip_prompt.strip()
            and not any(e.get("type") == "assistant" for e in entries[idx + 1:])):
        idx = idxs[-2]
    end = next((j for j in idxs if j > idx), len(entries))
    after = [e for e in entries[idx + 1:end]
             if e.get("type") == "assistant" and not e.get("isSidechain")]
    return entries[idx], after


def real_model(e):
    m = (e.get("message") or {}).get("model")
    return m if m and not m.startswith("<") else None


def latest_model(entries):
    for e in reversed(entries):
        if e.get("type") == "assistant":
            m = real_model(e)
            if m:
                return m
    return None


def final_text(assistant_entries):
    """Text blocks that come after the last tool_use of the turn, i.e. the final answer."""
    blocks = []
    for e in assistant_entries:
        for b in (e.get("message") or {}).get("content") or []:
            if isinstance(b, dict):
                blocks.append((e, b))
    last_tool = max((i for i, (_, b) in enumerate(blocks) if b.get("type") == "tool_use"), default=-1)
    texts, model, ts = [], None, None
    for e, b in blocks[last_tool + 1:]:
        if b.get("type") == "text" and b.get("text", "").strip():
            texts.append(b["text"])
            model = real_model(e) or model
            ts = e.get("timestamp") or ts
    return "\n\n".join(texts), model, ts


# ---------------------------------------------------------------- log file

def find_log(session_id):
    if not os.path.isdir(LOG_DIR):
        return None
    suffix = "_%s.md" % session_id
    for name in sorted(os.listdir(LOG_DIR)):
        if name.endswith(suffix):
            return os.path.join(LOG_DIR, name)
    return None


def parse_entries(body):
    """[(type, num, timestamp, model)] for every entry in the log body."""
    out = []
    matches = list(ENTRY_RE.finditer(body))
    for m in matches:
        tail = body[m.end():m.end() + 300]
        ts = re.search(r"^timestamp: (\S+)$", tail, re.M)
        mo = re.search(r"^model: (\S+)$", tail, re.M)
        out.append((m.group(1), int(m.group(2)), ts and ts.group(1), mo and mo.group(1)))
    return out


def render_header(session_id, entries, cfg):
    prompts = [e for e in entries if e[0] == "PROMPT"]
    models = []
    for e in entries:
        if e[3] and e[3] != "unknown" and e[3] not in models:
            models.append(e[3])
    first = prompts[0][2] if prompts else now_iso()
    last = prompts[-1][2] if prompts else first
    return (
        "---\n"
        "session_id: {sid}\n"
        "date: {date}\n"
        "author: {author}\n"
        "model: {model}\n"
        "tool: {tool}\n"
        "project: {project}\n"
        "total_exchanges: {n}\n"
        "first_prompt_time: {first}\n"
        "last_prompt_time: {last}\n"
        "---\n"
    ).format(sid=session_id, date=first[:10], author=cfg["author"],
             model=", ".join(models) or "unknown", tool=cfg["tool"], project=cfg["project"],
             n=len(prompts), first=first, last=last)


def append_entry(session_id, kind, num, timestamp, model, text):
    cfg = load_config()
    os.makedirs(LOG_DIR, exist_ok=True)
    path = find_log(session_id)
    short = session_id[:8]
    body_before = None
    if path is None:
        stamp = datetime.strptime(timestamp[:19], "%Y-%m-%dT%H:%M:%S").strftime("%Y-%m-%d_%H-%M-%S")
        path = os.path.join(LOG_DIR, "%s_%s.md" % (stamp, session_id))
        body = ("\n# Session Log - {date}\n\n"
                "Session: `{short}` | Project: `{project}` | Author: `{author}`\n\n---\n"
                ).format(date=timestamp[:10], short=short, project=cfg["project"], author=cfg["author"])
    else:
        with open(path, encoding="utf-8") as f:
            body = FRONTMATTER_RE.sub("", f.read(), count=1)
    body_before = body

    body = body.rstrip("\n") + "\n\n" + (
        "[LOG_ENTRY type={kind} num={num} session={short}]\n"
        "timestamp: {ts}\n"
        "model: {model}\n\n"
        "{text}\n\n"
    ).format(kind=kind, num=num, short=short, ts=timestamp, model=model or "unknown", text=text)

    state = load_state(session_id, body_before) if body_before is not None else []
    state.append([kind, num, timestamp, model or "unknown"])
    save_state(session_id, state)
    header = render_header(session_id, state, cfg)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(header + body)
    os.replace(tmp, path)


# Entry bookkeeping lives in a sidecar file, not in the log, so a prompt or response
# that itself contains "[LOG_ENTRY ...]" lines (e.g. pasting log excerpts) cannot
# throw off the numbering. Parsing the log is only a fallback if the sidecar is gone.

def state_path(session_id):
    return os.path.join(CACHE_DIR, session_id + ".state.json")


def load_state(session_id, body=None):
    try:
        with open(state_path(session_id)) as f:
            return json.load(f)
    except (OSError, ValueError):
        pass
    if body is None:
        path = find_log(session_id)
        if not path:
            return []
        with open(path, encoding="utf-8") as f:
            body = f.read()
    return [list(e) for e in parse_entries(body)]


def save_state(session_id, state):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(state_path(session_id), "w") as f:
        json.dump(state, f)


def log_state(session_id):
    entries = load_state(session_id)
    p = max([n for t, n, _, _ in entries if t == "PROMPT"], default=0)
    r = max([n for t, n, _, _ in entries if t == "RESPONSE"], default=0)
    return p, r


# ---------------------------------------------------------------- model cache

def cache_model(session_id, model):
    if not model:
        return
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(os.path.join(CACHE_DIR, session_id + ".model"), "w") as f:
        f.write(model)


def cached_model(session_id):
    try:
        with open(os.path.join(CACHE_DIR, session_id + ".model")) as f:
            return f.read().strip() or None
    except OSError:
        return None


def model_for_prompt(data, entries):
    m = data.get("model")
    if isinstance(m, dict):
        m = m.get("id")
    return (latest_model(entries) or m or cached_model(data["session_id"])
            or os.environ.get("ANTHROPIC_MODEL") or "unknown")


# ---------------------------------------------------------------- events

def on_session_start(data):
    m = data.get("model")
    if isinstance(m, dict):
        m = m.get("id")
    cache_model(data["session_id"], m)


def on_prompt(data):
    sid = data["session_id"]
    entries = read_transcript(data.get("transcript_path"))
    p, r = log_state(sid)
    if p > r:
        # Previous turn never produced a Stop event (interrupted / crashed).
        # The transcript here already ends with that turn, so capture what it has.
        _, after = last_turn(entries, skip_prompt=data.get("prompt", ""))
        text, model, ts = final_text(after)
        note = "[capture: turn ended without a Stop event (likely interrupted); final text as found in transcript]"
        append_entry(sid, "RESPONSE", p, ts or now_iso(), model or latest_model(entries),
                     (text + "\n\n" + note) if text else note)
    append_entry(sid, "PROMPT", p + 1, now_iso(), model_for_prompt(data, entries), data.get("prompt", ""))


def on_stop(data):
    sid = data["session_id"]
    path = data.get("transcript_path")
    # The final assistant message can land in the transcript a moment after Stop fires.
    expected = (data.get("last_assistant_message") or "").strip()
    for _ in range(20):
        entries = read_transcript(path)
        prompt_entry, after = last_turn(entries)
        text, model, ts = final_text(after)
        if text and (not expected or expected in text or text.strip().endswith(expected[-200:])):
            break
        time.sleep(0.1)
    if not text and expected:
        text = expected
    p, r = log_state(sid)
    if p == r:
        # Prompt not logged by UserPromptSubmit (e.g. hooks installed mid-session): backfill it.
        if prompt_entry is None:
            return
        p += 1
        append_entry(sid, "PROMPT", p, prompt_entry.get("timestamp") or now_iso(),
                     model or latest_model(entries) or cached_model(sid), prompt_text(prompt_entry))
    append_entry(sid, "RESPONSE", p, now_iso(),
                 model or latest_model(entries) or cached_model(sid), text)


def main():
    event = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        data = json.loads(sys.stdin.read() or "{}")
        if not data.get("session_id"):
            return
        {"session-start": on_session_start, "prompt": on_prompt, "stop": on_stop}[event](data)
    except Exception:
        try:
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(os.path.join(CACHE_DIR, "errors.log"), "a") as f:
                f.write("%s %s\n%s\n" % (now_iso(), event, traceback.format_exc()))
        except Exception:
            pass


if __name__ == "__main__":
    main()
    sys.exit(0)
