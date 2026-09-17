# Day 6 Talk — STATUS

**App:** MRJ Day 6 Talk (classroom Q → student speak → Jay reply)  
**Repo:** `mrjkorea/day6-talk`  
**Built:** 2026-09-18 (KST)  
**Source APK:** `/workspace/MRJ-Day6-Talk-0.3.2.apk` (verified two-voice lock — see `/workspace/day6-0.3.2-VERIFY.md`)  
**Live:** https://mrjkorea.github.io/day6-talk/

## Counts

| | |
|---|---|
| Books / levels | **12** |
| Units | **83** |
| Items (Q/A pairs) | **693** |
| Audio mp3 total | **1283** |
| Student (Dolly) say mp3 | **590** |
| Teacher (Jay) reply mp3 | **693** |

### Per book

| id | label | units | pairs |
|---|---|---|---|
| ba | BASIC A | 8 | 72 |
| ba-review | Basic Review ABC | 4 | 48 |
| bb | BASIC B | 8 | 66 |
| bc | BASIC C | 8 | 70 |
| i2-review | INT 2 Review | 4 | 72 |
| i2a | INT 2A | 8 | 48 |
| i2b | INT 2B | 8 | 54 |
| i2c | INT 2C | 8 | 48 |
| i3-review | INT 3 Review | 4 | 48 |
| i3a | INT 3A | 8 | 67 |
| i3b | INT 3B | 8 | 53 |
| i3c | INT 3C | 7 | 47 |

## How extracted from APK

```text
unzip MRJ-Day6-Talk-0.3.2.apk 'assets/public/*'
```

| APK path | Web path | Role |
|---|---|---|
| `assets/public/data/day6-qa.json` | `data/day6-qa.json` | Canonical pairs (`student` / `reply` / `audio`) |
| `assets/public/audio/index.json` | `data/audio-index.json` | `studentFiles` + `teacherFiles` maps (100% resolve for 693 pairs) |
| `assets/public/audio/say/**/*.mp3` | `audio/say/...` | Dolly student line (hear-before-speak) |
| `assets/public/audio/{book}/uXX/NN.mp3` | `audio/...` | Jay teacher canned replies |

Two-voice lock (APK verify): studentVoice Dolly ≠ teacherVoice Jay; say vs reply mp3 hashes differ.

## Classroom flow (web)

1. One turn at a time: show line → student speaks (Web Speech API) → hear canned Jay reply mp3  
2. Max **5** STT attempts, then skip  
3. End → Results / Write-this:  
   - **Success** = question + reply heard  
   - **Missed** = question only (never auto-reveal canned reply)  
   - Optional **Teacher mic**: say the missed student line to unlock reply playback  
4. Scoring: normalize + max(char Levenshtein, word overlap); length-aware pass thresholds aligned with APK (`≤3→72`, `≤5→80`, `≤10→78`, else `75`)

## Deploy

- Static HTML/JS/CSS + mp3  
- GitHub Pages from `main` / root  
- Zero CloudAgent; local box + `gh` only  
