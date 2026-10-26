/**
 * Reshape i2-review / i3-review units: even mix from six book-units per Review number.
 * Keeps existing *-review audio when student+reply still match; otherwise uses book audio paths.
 */
import fs from "fs";
import path from "path";

const qaPath = path.join(process.cwd(), "data/day6-qa.json");
const qa = JSON.parse(fs.readFileSync(qaPath, "utf8"));

const UNIT_MAP = { 1: [1, 2], 2: [3, 4], 3: [5, 6], 4: [7, 8] };

function level(code) {
  return qa.levels.find((l) => l.level === code);
}

function unitPairs(book, unitNum) {
  const lv = level(book);
  if (!lv) return null;
  const u = lv.units.find((x) => x.unit === unitNum);
  return u ? u.pairs : null;
}

function spreadIndices(pairCount, need) {
  if (need <= 0) return [];
  if (need >= pairCount) return [...Array(pairCount).keys()];
  const out = [];
  for (let i = 0; i < need; i++) out.push(Math.min(pairCount - 1, Math.floor((i * pairCount) / need)));
  return out;
}

function bookUnitForStudent(student, books, unitNums) {
  for (const b of books) {
    for (const u of unitNums) {
      const pairs = unitPairs(b, u);
      if (!pairs) continue;
      if (pairs.some((p) => p.student === student)) return { b, u };
    }
  }
  return null;
}

function reshapeReview(reviewLevel, books, perBookUnit) {
  const oldLv = level(reviewLevel);
  if (!oldLv) throw new Error("missing level " + reviewLevel);

  const newUnits = [];
  for (let ru = 1; ru <= 4; ru++) {
    const bookUnits = UNIT_MAP[ru];
    const oldUnit = oldLv.units.find((u) => u.unit === ru);
    const oldPool = (oldUnit.pairs || []).slice();
    const usedOld = new Set();
    const newPairs = [];

    for (const u of bookUnits) {
      for (const b of books) {
        let pairs = unitPairs(b, u);
        let fromUnit = u;
        if (!pairs && reviewLevel === "i3-review" && b === "i3c" && u === 8) {
          pairs = unitPairs("i3c", 7);
          fromUnit = 7;
        }
        if (!pairs) {
          console.warn(`skip missing ${b} u${u} in ${reviewLevel} RU${ru}`);
          continue;
        }
        const picks = spreadIndices(pairs.length, perBookUnit);
        for (const idx of picks) {
          const bookPair = pairs[idx];
          let chosen =
            oldPool.find(
              (p) =>
                !usedOld.has(p) &&
                p.student === bookPair.student &&
                p.reply === bookPair.reply
            ) ||
            oldPool.find(
              (p) =>
                !usedOld.has(p) &&
                p.student === bookPair.student &&
                bookUnitForStudent(p.student, [b], [fromUnit])
            );

          if (chosen) usedOld.add(chosen);

          const keepReviewAudio =
            chosen &&
            chosen.audio &&
            chosen.audio.includes("-review/") &&
            chosen.student === bookPair.student;

          newPairs.push({
            student: bookPair.student,
            reply: bookPair.reply,
            audio: keepReviewAudio ? chosen.audio : bookPair.audio,
          });
        }
      }
    }

    newUnits.push({
      unit: ru,
      title: oldUnit.title,
      pairs: newPairs,
    });
    console.log(
      `${reviewLevel} RU${ru}: ${newPairs.length} lines, review audio kept: ${
        newPairs.filter((p) => p.audio.includes("-review/")).length
      }`
    );
  }
  return newUnits;
}

const i2 = reshapeReview("i2-review", ["i2a", "i2b", "i2c"], 3);
const i3 = reshapeReview("i3-review", ["i3a", "i3b", "i3c"], 2);

for (const lv of qa.levels) {
  if (lv.level === "i2-review") lv.units = i2;
  if (lv.level === "i3-review") lv.units = i3;
}

let pairCount = 0;
qa.levels.forEach((lv) =>
  lv.units.forEach((u) => {
    pairCount += u.pairs.length;
  })
);
qa.pairCount = pairCount;

fs.writeFileSync(qaPath, JSON.stringify(qa, null, 2) + "\n");
console.log("pairCount", pairCount);
