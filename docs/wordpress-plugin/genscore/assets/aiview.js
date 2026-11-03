/*
 * «Lo que lee la IA» for one page (WP-PLUGIN-5, plugin 1.5.0).
 *
 * Runs inside the hidden same-origin frame the site review already opens.
 * It asks for the same page again without the session and without running
 * JavaScript (what ChatGPT, Claude and Perplexity receive) and compares it
 * with what the frame shows. `pct` is computed exactly like the extension's
 * readAiView (docs/chrome-extension/prueba/extension/extras.js); on top of
 * it, the plugin keeps a tally per kind of content (prices, headings,
 * buttons, text) so the screen can say WHAT is lost, never WHICH page.
 *
 * Nothing leaves the browser except the numbers stored in this site.
 */
(function () {
  "use strict";
  var PRICE = /(\d[\d.,]*\s?(€|eur|\$|£))|((€|\$|£)\s?\d)/i;
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function words(s) { return norm(s).match(/[\p{L}\p{N}]{3,}/gu) || []; }
  function digits(s) { return String(s || "").replace(/[^\d]/g, ""); }

  window.genscoreAiView = function () {
    var ctl = new AbortController();
    var tm = setTimeout(function () { ctl.abort(); }, 8000);
    return fetch(location.href, { credentials: "omit", cache: "no-store", redirect: "follow", signal: ctl.signal, headers: { accept: "text/html" } }).then(function (r) {
      clearTimeout(tm);
      if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return null;
      return r.text();
    }).then(function (html) {
      if (html == null) return { state: "error" };
      html = html.slice(0, 4e6);
      var doc = new DOMParser().parseFromString(html, "text/html");
      /* A price counts as delivered if it is in the text or in what bots read
         as data: JSON-LD and meta tags. Not in other scripts (a theme's
         preloaded store data is not something an engine reads). */
      var rawNums = new Set();
      var addNums = function (t) { (String(t || "").match(/\d[\d.,]*\d|\d/g) || []).forEach(function (n) { rawNums.add(digits(n)); }); };
      doc.querySelectorAll('script[type="application/ld+json"]').forEach(function (n) { addNums(n.textContent); });
      doc.querySelectorAll("meta[content]").forEach(function (n) { addNums(n.getAttribute("content")); });
      doc.querySelectorAll("script,style,template,svg").forEach(function (n) { n.remove(); });
      var raw = new Map();
      words(doc.body ? doc.body.textContent : "").forEach(function (w) { raw.set(w, (raw.get(w) || 0) + 1); });
      addNums(doc.body ? doc.body.textContent : "");

      var seen = words(document.body ? document.body.innerText : "");
      if (seen.length < 20) return { state: "few" };
      var left = new Map(raw), hits = 0;
      seen.forEach(function (w) { var n = left.get(w); if (n) { hits++; left.set(w, n - 1); } });
      var pct = Math.round((hits / seen.length) * 100);

      function visible(el) { if (!el.getClientRects().length) return false; var cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; }
      var BLOCK = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,td,th,summary,label,button";
      var BTN = "a.button,a.wp-element-button,a.wp-block-button__link,a.add_to_cart_button";
      var scope = document.querySelector("main,[role=main],article") || document.body;
      var leaves = Array.prototype.slice.call(scope.querySelectorAll(BLOCK + "," + BTN), 0, 1500).filter(function (el) {
        return !el.querySelector(BLOCK) && !el.closest("nav,header,footer,[aria-hidden=true]") && visible(el);
      });
      /* [units seen, units delivered] per kind: words for text, headings and
         buttons; one unit per price, delivered if its digits are in the HTML. */
      var k = { price: [0, 0], heading: [0, 0], button: [0, 0], text: [0, 0] };
      function priceUnit(text) {
        var nums = text.match(/\d[\d.,]*\d|\d/g) || [];
        if (!nums.length) return;
        k.price[0]++;
        if (nums.every(function (n) { return rawNums.has(digits(n)); })) k.price[1]++;
      }
      /* Prices often live in a <div> or <span> (block themes, WooCommerce
         blocks), not in a text block: the innermost element whose class says
         price is one unit. */
      var PRICED = '[class*="price"]';
      /* Other products shown on a page (related, upsells, cross-sells) carry
         their own prices, which no page puts in its own structured data: on a
         product page only the product's own price counts, and nowhere do
         those side lists count. */
      var SIDE = ".related,.upsells,.up-sells,.cross-sells,.wp-block-woocommerce-related-products";
      var single = !!document.querySelector("body.single-product,.single-product .summary,.wp-block-woocommerce-single-product");
      var LISTS = "ul.products,.wc-block-grid,.wc-block-product-template,.wp-block-woocommerce-product-collection,.wp-block-woocommerce-product-template";
      function sidePrice(el) { return !!(el.closest(SIDE) || (single && el.closest(LISTS))); }
      /* A sale shows the old price struck through and the new one in <ins>,
         plus screen-reader text: the price is the <ins>. */
      function priceText(el) {
        var ins = el.querySelector("ins");
        var t = ((ins || el).innerText || "").replace(/\s+/g, " ").trim();
        if (t.length < 60) return t;
        /* Painted sale text with no <ins> («El precio original era: 22,90 €.
           19,90 € El precio actual es: 19,90 €.»): the current price is the
           last amount. */
        var all = t.match(/\d[\d.,]*\s?(€|eur|\$|£)|(€|\$|£)\s?\d[\d.,]*/gi);
        return all ? all[all.length - 1] : t;
      }
      Array.prototype.slice.call(scope.querySelectorAll(PRICED), 0, 300).forEach(function (el) {
        if (el.querySelector(PRICED) || el.closest("nav,header,footer,[aria-hidden=true]") || sidePrice(el) || !visible(el)) return;
        var text = priceText(el);
        if (text && text.length < 60 && PRICE.test(text)) priceUnit(text);
      });
      leaves.forEach(function (el) {
        var text = (el.innerText || "").replace(/\s+/g, " ").trim();
        if (!text) return;
        var heading = /^H\d$/.test(el.tagName);
        var button = el.tagName === "BUTTON" || el.tagName === "A";
        if (!heading && !button && (el.closest(PRICED) || (PRICE.test(text) && text.length < 60))) {
          if (!el.querySelector(PRICED) && !el.closest(PRICED) && !sidePrice(el)) priceUnit(text);
          return;
        }
        var ws = words(text);
        if (!ws.length || (!heading && !button && ws.length < 2)) return;
        var got = ws.filter(function (w) { return raw.has(w); }).length;
        var t = heading ? k.heading : button ? k.button : k.text;
        t[0] += ws.length; t[1] += got;
      });
      return { state: "ok", pct: pct, words: seen.length, k: k };
    }, function () { clearTimeout(tm); return { state: "error" }; });
  };
})();
