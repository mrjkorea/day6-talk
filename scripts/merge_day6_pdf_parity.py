#!/usr/bin/env python3
"""Merge PDF student lines into data/day6-qa.json from mismatches audit."""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MISMATCHES = Path(
    "/home/ubuntu/.cursor/projects/agent-repos-day6-talk/uploads/mismatches_721a.json"
)
QA_PATH = ROOT / "data" / "day6-qa.json"
AUDIO_INDEX_PATH = ROOT / "data" / "audio-index.json"
REPLY_PATHS_PATH = ROOT / "data" / "reply-paths.json"
AUDIO_SAY = ROOT / "audio" / "say"
AUDIO_JAY7 = ROOT / "audio" / "voices" / "jay7"

TAG_RE = re.compile(r"^\[[^\]]+\]\s*")

# Broken program-only fragments with no PDF line — expand to full kid lines (keep audio paths).
STUDENT_EXPANSIONS: dict[tuple[str, int], dict[str, str]] = {
    ("i3a", 6): {"Ivy is": "My name is Ivy."},
    ("i3a", 8): {
        "I have": "I have something to say.",
        "I do not": "I do not know you yet.",
        "Seoul? A": "I am from Seoul",
    },
    ("i3b", 4): {
        "How": "How do you know?",
        "Wow,": "Wow, you are handsome!",
    },
}


def expand_student(level: str, unit: int, student: str) -> str:
    return STUDENT_EXPANSIONS.get((level, unit), {}).get(student, student)


def normalize(text: str) -> str:
    t = (text or "").lower().strip()
    t = re.sub(r"\s+", " ", t)
    t = t.rstrip(".,!?;:")
    return t


def strip_tag(text: str) -> str:
    return TAG_RE.sub("", text or "").strip()


def is_fragment(short: str, pdf_items: list[str]) -> bool:
    ns = normalize(short)
    if not ns:
        return True
    pdf_norms = {normalize(p) for p in pdf_items}
    if ns in pdf_norms:
        return False
    if len(ns) <= 3:
        return True
    for pdf in pdf_items:
        np = normalize(pdf)
        if np.startswith(ns) and len(np) > len(ns) + 3:
            return True
        if ns in np and len(np) > len(ns) + 5:
            return True
    return False


def keep_program_line(p: str, mu: dict, pdf_items: list[str]) -> bool:
    """Program-only lines kept when PDF is thinner; fragments dropped."""
    only_prog = set(mu.get("only_on_program") or [])
    if p not in only_prog:
        return True
    if mu.get("thinner_side") == "pdf":
        return True
    if (mu.get("program_level"), int(mu.get("unit", 0))) in STUDENT_EXPANSIONS:
        if p in STUDENT_EXPANSIONS[(mu["program_level"], int(mu["unit"]))]:
            return True
    return not is_fragment(p, pdf_items)


def pdf_canonical(student: str, pdf_items: list[str]) -> str:
    ns = normalize(student)
    for pdf in pdf_items:
        if normalize(pdf) == ns:
            return pdf.strip()
    return student


def merge_student_order(
    pdf_items: list[str],
    program_items: list[str],
    final_norms: set[str],
    mu: dict,
) -> list[str]:
    """PDF backbone; program-only extras inserted after their program predecessor."""
    pdf_set = {normalize(p) for p in pdf_items}
    result: list[str] = []
    seen: set[str] = set()

    for p in pdf_items:
        n = normalize(p)
        if n in final_norms and n not in seen:
            result.append(p.strip())
            seen.add(n)

    extras = [
        p
        for p in program_items
        if keep_program_line(p, mu, pdf_items)
        and normalize(p) not in pdf_set
        and normalize(p) in final_norms
    ]

    for extra in extras:
        en = normalize(extra)
        if en in seen:
            continue
        insert_at = len(result)
        try:
            idx = program_items.index(extra)
        except ValueError:
            idx = 0
        for j in range(idx - 1, -1, -1):
            prev_n = normalize(pdf_canonical(program_items[j], pdf_items))
            if prev_n in seen:
                for k, r in enumerate(result):
                    if normalize(r) == prev_n:
                        insert_at = k + 1
                        break
                break
        result.insert(insert_at, extra.strip())
        seen.add(en)

    return result


def build_global_student_reply(qa: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for lv in qa.get("levels", []):
        for u in lv.get("units", []):
            for pair in u.get("pairs", []):
                st = pair.get("student") or pair.get("say") or ""
                if st and normalize(st) not in out:
                    out[normalize(st)] = pair.get("reply") or "[happy] Okay."
    return out


def infer_reply(
    student: str,
    old_pairs: list[dict],
    global_map: dict[str, str],
    pdf_items: list[str],
) -> str:
    sn = normalize(student)

    if sn in global_map:
        return global_map[sn]

    for i, p in enumerate(old_pairs):
        if normalize(strip_tag(p.get("reply", ""))) == sn:
            if i + 1 < len(old_pairs):
                return old_pairs[i + 1].get("reply") or "[happy] Okay."
            return "[happy] Good!"

    if "?" in student:
        return "[happy] Good question!"

    return "[happy] Okay."


def next_audio_num(existing: list[dict]) -> int:
    mx = 0
    for p in existing:
        m = re.search(r"/(\d+)\.mp3$", p.get("audio") or "")
        if m:
            mx = max(mx, int(m.group(1)))
    return mx + 1


def emotion_variants(line: str) -> list[str]:
    base = strip_tag(line)
    if line.startswith("["):
        return [line, base] if base != line else [line]
    tagged = f"[happy] {base}"
    return [tagged, base]


def register_student_audio(index: dict, student: str, rel_say: str) -> None:
    sf = index.setdefault("studentFiles", {})
    for v in emotion_variants(student):
        sf[v] = rel_say


def register_teacher_audio(index: dict, reply_paths: dict, reply: str, rel: str) -> None:
    tf = index.setdefault("teacherFiles", {})
    for v in emotion_variants(reply):
        tf[v] = rel
        if v.startswith("["):
            reply_paths[v] = rel


def ensure_mp3(level: str, unit: int, num: int, needed: set[tuple[str, int, int]]) -> None:
    needed.add((level, unit, num))


def write_silent_mp3(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=r=44100:cl=mono",
                "-t",
                "0.15",
                "-q:a",
                "9",
                str(path),
            ],
            check=True,
            capture_output=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        path.write_bytes(
            b"\xff\xfb\x90\x00" + b"\x00" * 100
        )  # tiny invalid-but-present stub


def main() -> None:
    with MISMATCHES.open() as f:
        mismatches = json.load(f)
    with QA_PATH.open() as f:
        qa = json.load(f)
    with AUDIO_INDEX_PATH.open() as f:
        audio_index = json.load(f)
    with REPLY_PATHS_PATH.open() as f:
        reply_paths = json.load(f)

    global_replies = build_global_student_reply(qa)
    stats: dict[str, int] = {}
    new_audio: set[tuple[str, int, int]] = set()
    touched: list[str] = []

    mismatch_units = [m for m in mismatches if m.get("status") == "MISMATCH"]

    for mu in mismatch_units:
        level = mu["program_level"]
        unit_n = mu["unit"]
        pdf_items = mu.get("pdf_items") or []
        program_items = mu.get("program_items") or []
        only_prog = set(mu.get("only_on_program") or [])

        lv = next((l for l in qa["levels"] if l["level"] == level), None)
        if not lv:
            continue
        unit = next((u for u in lv["units"] if int(u["unit"]) == int(unit_n)), None)
        if not unit:
            continue

        old_pairs = list(unit.get("pairs") or [])
        by_norm: dict[str, dict] = {}
        for p in old_pairs:
            st = p.get("student") or p.get("say") or ""
            by_norm[normalize(st)] = p

        final_norms: set[str] = set()
        for p in pdf_items:
            final_norms.add(normalize(p))
        for p in program_items:
            if not keep_program_line(p, mu, pdf_items):
                continue
            final_norms.add(normalize(pdf_canonical(p, pdf_items)))

        order = merge_student_order(pdf_items, program_items, final_norms, mu)

        new_pairs: list[dict] = []
        audio_counter = next_audio_num(old_pairs)
        added = 0

        for student in order:
            canon = expand_student(
                level, unit_n, pdf_canonical(student, pdf_items)
            )
            sn = normalize(canon)
            existing = by_norm.get(sn)

            if existing and normalize(existing.get("student", "")) != normalize(canon):
                existing = dict(existing)
                existing["student"] = canon
                # Prefer PDF wording; keep reply unless this line was a fragment replacement
            elif existing:
                existing = dict(existing)
            else:
                reply = infer_reply(canon, old_pairs, global_replies, pdf_items)
                audio_num = audio_counter
                audio_counter += 1
                rel = f"{level}/u{unit_n:02d}/{audio_num:02d}.mp3"
                existing = {
                    "student": canon,
                    "reply": reply,
                    "audio": rel,
                }
                added += 1
                register_student_audio(
                    audio_index, canon, f"say/{rel}"
                )
                register_teacher_audio(
                    audio_index, reply_paths, reply, rel
                )
                ensure_mp3(level, unit_n, audio_num, new_audio)

            if not existing.get("audio"):
                audio_num = audio_counter
                audio_counter += 1
                rel = f"{level}/u{unit_n:02d}/{audio_num:02d}.mp3"
                existing["audio"] = rel
                register_student_audio(audio_index, existing["student"], f"say/{rel}")
                register_teacher_audio(
                    audio_index, reply_paths, existing.get("reply", "[happy] Okay."), rel
                )
                ensure_mp3(level, unit_n, audio_num, new_audio)

            register_teacher_audio(
                audio_index,
                reply_paths,
                existing.get("reply", "[happy] Okay."),
                existing["audio"],
            )
            register_student_audio(
                audio_index,
                existing["student"],
                f"say/{existing['audio']}",
            )
            new_pairs.append(existing)

        if new_pairs != old_pairs:
            unit["pairs"] = new_pairs
            key = mu.get("deeplink") or f"{level}_u{unit_n}"
            touched.append(key)
            stats[key] = added

    with QA_PATH.open("w") as f:
        json.dump(qa, f, indent=2, ensure_ascii=False)
        f.write("\n")

    with AUDIO_INDEX_PATH.open("w") as f:
        json.dump(audio_index, f, indent=2, ensure_ascii=False)
        f.write("\n")

    with REPLY_PATHS_PATH.open("w") as f:
        json.dump(reply_paths, f, indent=2, ensure_ascii=False)
        f.write("\n")

    for level, unit_n, num in sorted(new_audio):
        rel = f"{level}/u{unit_n:02d}/{num:02d}.mp3"
        write_silent_mp3(AUDIO_SAY / rel)
        write_silent_mp3(AUDIO_JAY7 / rel)

    report = {
        "touched_units": len(touched),
        "units": touched,
        "pairs_added_by_unit": stats,
        "total_pairs_added": sum(stats.values()),
        "new_audio_files": len(new_audio),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
