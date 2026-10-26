import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/** Keep in sync with parseDeepLinkUnit in js/app.js */
function parseDeepLinkUnit(raw, qa) {
  const slug = String(raw || "").toLowerCase().trim().replace(/\s+/g, "");
  if (!slug || !qa) return null;

  const review = slug.match(
    /^(?:(?:basic|ba)[_-]?(?:abc[_-]?)?review|ba[_-]?review|i2[_-]?review|int2[_-]?review|i3[_-]?review|int3[_-]?review)[_-]?u?0*(\d+)$/
  );
  if (review) {
    let level;
    if (/^(?:basic|ba)/.test(slug)) level = "ba-review";
    else if (/^i2|^int2/.test(slug)) level = "i2-review";
    else level = "i3-review";
    const lv = qa.levels.find((l) => l.level === level);
    const u = lv && lv.units.find((x) => +x.unit === +review[1]);
    return u ? { level, unit: u.unit, title: u.title } : null;
  }

  const m = slug.match(/^(basic_([abc])|int([23])([abc]))_u0*(\d+)$/);
  if (!m) return null;
  const code = m[2] ? "b" + m[2] : "i" + m[3] + m[4];
  const lv = qa.levels.find((l) => l.level === code);
  const u = lv && lv.units.find((x) => +x.unit === +m[5]);
  return u ? { level: code, unit: u.unit, title: u.title } : null;
}

const qa = JSON.parse(readFileSync(new URL("../data/day6-qa.json", import.meta.url), "utf8"));

const reviewCases = [
  ["ba_review_u1", "ba-review", 1],
  ["ba-review-u01", "ba-review", 1],
  ["basic_review_u4", "ba-review", 4],
  ["basic_abc_review_u2", "ba-review", 2],
  ["i2_review_u3", "i2-review", 3],
  ["int2_review_u1", "i2-review", 1],
  ["i2-review-u4", "i2-review", 4],
  ["i3_review_u2", "i3-review", 2],
  ["int3_review_u4", "i3-review", 4],
  ["i3-review-u01", "i3-review", 1],
];

for (const [slug, level, unit] of reviewCases) {
  test(`review deep link ${slug}`, () => {
    const hit = parseDeepLinkUnit(slug, qa);
    assert.ok(hit, slug);
    assert.equal(hit.level, level);
    assert.equal(hit.unit, unit);
  });
}

test("book deep link still works", () => {
  const hit = parseDeepLinkUnit("basic_a_u03", qa);
  assert.equal(hit.level, "ba");
  assert.equal(hit.unit, 3);
});

test("unknown review unit returns null", () => {
  assert.equal(parseDeepLinkUnit("ba_review_u9", qa), null);
});
