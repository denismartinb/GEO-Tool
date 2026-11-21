/* node --test docs/chrome-extension/prueba/tests/ */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../extension/rate.js");

const day = (iso) => Date.parse(iso);

test("rating: never on the first or second day of use", () => {
  let days = R.noteUseDay([], day("2026-11-02T10:00:00"));
  days = R.noteUseDay(days, day("2026-11-02T22:00:00"));
  assert.equal(days.length, 1);
  assert.equal(R.shouldAskRating(days, null), false);
  days = R.noteUseDay(days, day("2026-11-03T09:00:00"));
  assert.equal(R.shouldAskRating(days, null), false);
});

test("rating: asks on the third different day, and never once answered", () => {
  let days = [];
  for (const d of ["2026-11-02T10:00:00", "2026-11-05T10:00:00", "2026-11-09T10:00:00"]) days = R.noteUseDay(days, day(d));
  assert.equal(R.shouldAskRating(days, null), true);
  assert.equal(R.shouldAskRating(days, "later"), false);
  assert.equal(R.shouldAskRating(days, "rated"), false);
});

test("rating: the list stays short and ignores junk", () => {
  let days = ["x", 3, null];
  for (let i = 1; i <= 6; i++) days = R.noteUseDay(days, day(`2026-11-0${i}T12:00:00`));
  assert.equal(days.length, R.RATE_MIN_DAYS);
  assert.ok(days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
});

test("rating: the link opens the reviews of the store listing", () => {
  assert.match(R.STORE_REVIEWS_URL, /^https:\/\/chromewebstore\.google\.com\/detail\/.+\/nmbkkbgfklgfdibpjemjcdcapikollmo\/reviews$/);
});
