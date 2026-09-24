#!/usr/bin/env python3
"""Bake the extra Day 6 voices. Does not remake Texan woman or Mr Jay age 35.

Listen (student line):
  grandpa  = Grandpa Walt
  american = Morgan Freeman, labeled American man
Reply:
  jay15 = Leo, the teenager voice (Mr Jay age 15). Not Confident Young Man.
  jay7  = Little Boy American (Mr Jay age 7)

Free Fish model only. Files land in audio/voices/<id>/<same relative path>.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "day6-qa.json"
AUDIO = ROOT / "audio"
LOG_DIR = ROOT / "logs"
PROGRESS = LOG_DIR / "extra_voices_progress.json"
FISH_TTS = Path.home() / ".hermes" / "scripts" / "fish_tts.py"

VOICES = {
    "grandpa": "86d2e997840443a1832c999ee71468b2",
    "american": "3ad4d432023c47ee9e6c7805b973630a",
    "jay15": "a60e9fc6e78c4bdca656702c6d27ba08",
    "jay7": "342663389ddb40bba1e4f5961774efd6",
}
LISTEN = {"grandpa", "american"}
REPLY = {"jay15", "jay7"}
MIN_BYTES = 8000
ATTEMPTS = 4
WORKERS = 4
EMOTION_RE = re.compile(r"^\[([^\]]+)\]\s*")

os.environ.pop("FISH_ALLOW_PAID", None)


def log(msg: str) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with (LOG_DIR / "extra_voices.log").open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def strip_emotion(text: str) -> str:
    return EMOTION_RE.sub("", text or "").strip()


def emotion_of(text: str) -> str | None:
    match = EMOTION_RE.match(text or "")
    return match.group(1) if match else None


def tagged(emotion: str, spoken: str) -> str:
    spoken = strip_emotion(spoken)
    tag = emotion.strip() if emotion and emotion.strip() else "warm, kind"
    return f"[{tag}] {spoken}"


def pad2(n: int) -> str:
    return f"{int(n):02d}"


def good_mp3(path: Path) -> bool:
    if not path.exists() or path.stat().st_size <= MIN_BYTES:
        return False
    head = path.read_bytes()[:12]
    if head[:3] == b"ID3":
        return True
    return len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0


def jobs() -> list[tuple[str, str, str]]:
    """Return (voice_id, fish_text, relative dest under voices/<id>/)."""
    qa = json.loads(DATA.read_text(encoding="utf-8"))
    student: dict[str, tuple[str, str]] = {}
    teacher: dict[str, tuple[str, str]] = {}
    student_emo: dict[str, Counter] = defaultdict(Counter)
    for level in qa.get("levels") or []:
        lid = level["level"]
        for unit in level.get("units") or []:
            uid = int(unit["unit"])
            for i, pair in enumerate(unit.get("pairs") or [], 1):
                say = (pair.get("student") or pair.get("say") or "").strip()
                reply = (pair.get("reply") or "").strip()
                if say and say not in student:
                    student_emo[say][emotion_of(say) or emotion_of(reply) or "warm, kind"] += 1
                    student[say] = ("", f"say/{lid}/u{pad2(uid)}/{pad2(i)}.mp3")
                if reply and reply not in teacher:
                    fish = reply if emotion_of(reply) else tagged("happy", reply)
                    rel = pair.get("audio") or f"{lid}/u{pad2(uid)}/{pad2(i)}.mp3"
                    teacher[reply] = (fish, rel)
    out = []
    for say, (_unused, rel) in student.items():
        emo = student_emo[say].most_common(1)[0][0]
        fish = say if emotion_of(say) else tagged(emo, say)
        for voice in sorted(LISTEN):
            out.append((voice, fish, rel))
    for _reply, (fish, rel) in teacher.items():
        for voice in sorted(REPLY):
            out.append((voice, fish, rel))
    return out


def load_progress() -> dict:
    if PROGRESS.exists():
        try:
            return json.loads(PROGRESS.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_progress(progress: dict) -> None:
    PROGRESS.parent.mkdir(parents=True, exist_ok=True)
    tmp = PROGRESS.with_suffix(".tmp")
    tmp.write_text(json.dumps(progress, ensure_ascii=False), encoding="utf-8")
    tmp.replace(PROGRESS)


def bake_one(voice: str, text: str, rel: str, force: bool = False) -> str:
    dest = AUDIO / "voices" / voice / rel
    if good_mp3(dest) and not force:
        return "skip"
    dest.parent.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.pop("FISH_ALLOW_PAID", None)
    last = ""
    with tempfile.TemporaryDirectory(prefix="day6-voice-") as tmp:
        inp = Path(tmp) / "in.txt"
        out = Path(tmp) / "out.mp3"
        inp.write_text(text, encoding="utf-8")
        for attempt in range(1, ATTEMPTS + 1):
            if out.exists():
                out.unlink()
            proc = subprocess.run(
                [sys.executable, str(FISH_TTS), "--input", str(inp), "--output", str(out), "--voice", VOICES[voice]],
                capture_output=True,
                text=True,
                env=env,
            )
            err = ((proc.stderr or "") + (proc.stdout or "")).strip()
            last = err or f"exit {proc.returncode}"
            if proc.returncode == 0 and good_mp3(out):
                shutil.copyfile(out, dest)
                return "ok"
            paid = proc.returncode in (2, 3) or "wants money" in err.lower() or "402" in err
            if paid:
                return "paid:" + last[:180]
            if attempt < ATTEMPTS:
                time.sleep(4 * attempt)
                continue
            return "fail:" + last[:180]
    return "fail:" + last[:180]


def main() -> int:
    force = "--force" in sys.argv
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    pending = [job for job in jobs() if only is None or job[0] == only]
    if "--dry-run" in sys.argv:
        from collections import Counter as C
        print(dict(C(v for v, _t, _r in pending)))
        print("jobs", len(pending))
        return 0
    progress = load_progress()
    todo = []
    for voice, text, rel in pending:
        key = f"{voice}|{rel}"
        dest = AUDIO / "voices" / voice / rel
        if progress.get(key) == "ok" and good_mp3(dest) and not force:
            continue
        todo.append((key, voice, text, rel, force))
    log(f"todo {len(todo)} of {len(pending)}")
    if not todo:
        log("nothing to bake")
        return 0
    ok = fail = paid = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(bake_one, voice, text, rel, force): key for key, voice, text, rel, force in todo}
        for fut in as_completed(futures):
            key = futures[fut]
            result = fut.result()
            progress[key] = "ok" if result in ("ok", "skip") else result
            if result in ("ok", "skip"):
                ok += 1
            elif result.startswith("paid"):
                paid += 1
                log("PAID STOP " + result)
                save_progress(progress)
                return 3
            else:
                fail += 1
                log("FAIL " + key + " " + result)
            if (ok + fail) % 25 == 0:
                save_progress(progress)
                log(f"progress ok={ok} fail={fail} left={len(todo) - ok - fail}")
    save_progress(progress)
    log(f"done ok={ok} fail={fail} paid={paid}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
