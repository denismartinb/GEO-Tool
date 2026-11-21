/* EXT-REACH-1 (log §436): when the panel asks for a rating in the Chrome Web
   Store. Once, after real use on three different days. Neutral: it never asks
   first whether the person likes it, so happy and unhappy users get the same
   ask, and it offers nothing in return (store policy). Pure, so node can test it. */
(function (root) {
  "use strict";
  const RATE_MIN_DAYS = 3;
  const STORE_REVIEWS_URL =
    "https://chromewebstore.google.com/detail/genscore-auditor%C3%ADa-seo-y/nmbkkbgfklgfdibpjemjcdcapikollmo/reviews";

  /* Local calendar day, so a late-night session is not two days. */
  function dayKey(ms) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /* Days with a review, newest last, kept short: only the count matters. */
  function noteUseDay(days, ms) {
    const list = Array.isArray(days) ? days.filter((d) => typeof d === "string") : [];
    const today = dayKey(ms);
    if (list.includes(today)) return list;
    return list.concat(today).slice(-RATE_MIN_DAYS);
  }

  /* `answered`: anything stored once the card was answered («rated» or «later»). */
  function shouldAskRating(days, answered) {
    if (answered) return false;
    return Array.isArray(days) && new Set(days).size >= RATE_MIN_DAYS;
  }

  const api = { RATE_MIN_DAYS, STORE_REVIEWS_URL, dayKey, noteUseDay, shouldAskRating };
  root.GS_RATE = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
