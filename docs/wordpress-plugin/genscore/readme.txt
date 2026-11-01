=== GenScore: AI visibility, llms.txt and AI bots ===
Contributors: genscore
Tags: llms.txt, robots.txt, ai, seo, chatgpt
Requires at least: 6.2
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Check whether ChatGPT, Gemini, Claude and Perplexity can read your site, publish your llms.txt, control AI bots in robots.txt and review basic SEO.

== Description ==

GenScore reviews your home page from inside wp-admin and gives it an SEO + AI score, split into three lanes:

* **GEO**: can ChatGPT, Gemini, Claude and Perplexity read and quote your site? Which AI bots does your robots.txt let in? Do you publish an llms.txt?
* **SEO**: title, description, canonical, headings, language, structured data, plus WordPress settings (search engine visibility, sitemap, HTTPS, permalinks) and a list of pages, posts and products missing a description or image alt text.
* **Agents**: can a shopping agent understand what you sell, its price and how to buy it?

Each lane lists what to fix first, with the points it adds and, where it applies, the exact snippet to paste.

It also lets you:

* **Allow or block AI bots** (OpenAI, Anthropic, Perplexity and Google-Extended), search bots and training bots separately. GenScore only adds its own group to the robots.txt WordPress serves. It never touches the `*` group, Googlebot or Bingbot, and it never writes a file.
* **Publish /llms.txt**, generated from your pages, products and posts with their own excerpts. You can edit it. If Yoast SEO, Rank Math or All in One SEO already publish one, or a physical llms.txt exists, GenScore leaves it alone.

The review runs in your browser, on your own site. Nothing is sent anywhere.

= Full analysis with a GenScore account =

The plugin works on its own and is free. A GenScore account at genscore.es adds what only repeated questions to the AI engines can measure: how often each engine names your brand, which of your pages they cite, which competitors appear before you, Search Console data, and audits of your whole domain. Accounts start with a 7-day Pro trial, no card required.

== External services ==

This plugin does not connect to any external service. It contains links to genscore.es (sign-up, log-in, the free checker and pricing) that open only when you click them. Those links carry UTM parameters (`utm_source=wordpress`) and, on sign-up, your site's domain, so the new account starts with it. GenScore terms: https://www.genscore.es/terminos. Privacy policy: https://www.genscore.es/privacidad.

== Installation ==

1. Upload the `genscore` folder to `/wp-content/plugins/`, or install it from Plugins > Add New.
2. Activate it.
3. Open **GenScore** in the admin menu. The review starts on its own.

== Frequently Asked Questions ==

= Does blocking training bots remove me from AI answers? =

No. ChatGPT, Claude and Perplexity answer with web search using their search bots. Training bots only decide whether your pages can be used to train future models. GenScore lets you set each one separately.

= My site has a robots.txt file in its root folder. =

The web server serves that file before WordPress, so the switches cannot change it. GenScore tells you and shows the lines to copy into it.

= Does it work with Yoast SEO, Rank Math, SEOPress or All in One SEO? =

Yes. It reads their meta descriptions and sitemaps, and it does not publish an llms.txt when one of them already does.

= Does the review slow down my site? =

No. It runs only when you open the GenScore screen, in your browser.

== Screenshots ==

1. Summary: the SEO + AI score and what to fix first.
2. GEO: which engines can read your home page, AI bot switches and llms.txt.
3. SEO: home page checks, WordPress settings and pages to review.
4. Agents: what a shopping agent can read.

== Changelog ==

= 1.0.0 =
* First release.

== Credits ==

Bundled fonts: Figtree (SIL Open Font License 1.1) and JetBrains Mono (SIL Open Font License 1.1).
