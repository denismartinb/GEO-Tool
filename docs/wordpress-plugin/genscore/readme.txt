=== GenScore: visibilidad en IA, llms.txt y bots de IA ===
Contributors: genscore
Tags: llms.txt, robots.txt, ai, seo, chatgpt
Requires at least: 6.2
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.4.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Check whether ChatGPT, Gemini, Claude and Perplexity can read your site, publish your llms.txt, control AI bots in robots.txt and review basic SEO.

== Description ==

GenScore reviews your site from inside wp-admin (the home page and your most important pages, products and posts) and gives it an SEO + AI score, split into three lanes:

* **GEO**: can ChatGPT, Gemini, Claude and Perplexity read and quote your site? Which AI bots does your robots.txt let in? Do you publish an llms.txt?
* **SEO**: title, description, canonical, headings, language, structured data, plus WordPress settings (search engine visibility, sitemap, HTTPS, permalinks) and a list of pages, posts and products missing a description or image alt text.
* **Agents**: can a shopping agent understand what you sell, its price and how to buy it?

Each lane lists what to fix first, with the points it adds and, where it applies, the exact snippet to paste.

It also lets you:

* **Fix it in one click.** For structured data (JSON-LD), descriptions, titles, canonical URLs, a visible update date and, with WooCommerce, product data and your returns policy, GenScore proposes the fix for each page from data WordPress already has (title, excerpt, permalink, last edit, price, stock). You pick the pages, review and edit each proposal, confirm, and it is published on those pages. Descriptions, titles and canonicals go to your SEO plugin's own fields when you use Yoast SEO, Rank Math or SEOPress. Post content is never rewritten, and every publish can be undone.

* **Allow or block AI bots** (OpenAI, Anthropic, Perplexity and Google-Extended), search bots and training bots separately. GenScore only adds its own group to the robots.txt WordPress serves. It never touches the `*` group, Googlebot or Bingbot, and it never writes a file.
* **Publish /llms.txt**, generated from your pages, products and posts with their own excerpts. You can edit it. If Yoast SEO, Rank Math or All in One SEO already publish one, or a physical llms.txt exists, GenScore leaves it alone.

The review runs in your browser, on your own site, and the scores are stored in your own WordPress. Nothing is sent anywhere.

= Full analysis with a GenScore account =

The plugin works on its own and is free. A GenScore account at genscore.es adds what only repeated questions to the AI engines can measure: how often each engine names your brand, which of your pages they cite, which competitors appear before you, Search Console data, and audits of your whole domain. Accounts start with a 7-day Pro trial, no card required.

== External services ==

The plugin works without any external service. Only if an administrator presses «Conectar con GenScore» does it connect to GenScore (https://www.genscore.es), to show the figures of that GenScore account for this domain:

* What is sent and when: when you connect, the site registers itself with GenScore's sign-in server (Supabase Auth, operated for GenScore) with the site's name and return address, and you approve the access on genscore.es. After that, while the site stays connected and an administrator opens the GenScore screen, the site's server asks GenScore for this domain's figures (at most once every 10 minutes) sending the access token and the site's domain. Nothing about your visitors is ever sent.
* What is stored: the access and refresh tokens, in your site's database, read only by the server. «Desconectar» deletes them, and you can also remove the access from GenScore (Ajustes, Apps conectadas).
* GenScore terms: https://www.genscore.es/terminos. Privacy policy: https://www.genscore.es/privacidad. Supabase privacy policy: https://supabase.com/privacy.

The plugin also contains links to genscore.es (sign-up, log-in, the free checker and pricing) that open only when you click them. Those links carry UTM parameters (`utm_source=wordpress`) and, on sign-up, your site's domain, so the new account starts with it.

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

= Does it write anything in my pages? =

Only what you accept in «Arreglar», after a confirmation. It is stored as page data (post meta), never in the post content: the editor shows a «Publicado por GenScore» box, and «Deshacer» puts back what was there. Uninstalling the plugin removes GenScore's own fields; what it wrote in your SEO plugin's fields stays, as your description or title.

= Does it use AI to write the proposals? =

No. Every proposal is built from your own WordPress data, with no external service.

= Does the review slow down my site? =

No. It runs only when you open the GenScore screen, in your browser, reading your important pages one after another (two at a time). The scores are stored in your site, so the next time only pages that changed are read again.

= What does connecting my GenScore account add? =

The figures of your account for this domain, the same ones the GenScore Chrome extension shows: your Puntuación GEO, how often each engine names you, your competitors, the SEO health of the whole domain, Search Console, the agent score and your next actions. It only reads: nothing in your account changes from WordPress.

== Screenshots ==

1. Summary: the SEO + AI score and what to fix first.
2. GEO: which engines can read your home page, AI bot switches and llms.txt.
3. SEO: home page checks, WordPress settings and pages to review.
4. Agents: what a shopping agent can read.

== Changelog ==

= 1.4.1 =
* New one-click fixes in the page sheet, undoable: alt text for images without it (from the media library or the page title, never a file name), noindex and blocked snippets (with Yoast, Rank Math or SEOPress), a specifications table from WooCommerce attributes, weight and dimensions, and a cancellation policy linked to the page that explains it.
* Site-wide fixes in their own window, undoable: the WordPress sitemap at /sitemap.xml, the mobile viewport when the theme lacks it, and who is behind the site (Organization or LocalBusiness) from WordPress and WooCommerce data you review.
* «Añadir dato» publishes a checkable fact with its source and date on the page a recommendation names.
* «Copiar tabla y abrir» copies the comparison table (the rival's cells always pending) and opens the page in the editor.
* When WordPress fixes something in another screen (HTTPS, payments, search visibility, your SEO plugin), the recommendation takes you there.

= 1.4.0 =
* «Publica tu comparativa con…» creates a draft page with a table: your column is filled from WooCommerce (price from, shipping, returns, rating) and the rival's cells say «[Pendiente: dato, enlace y fecha]». The editor warns while any is left.
* A recommendation about criticism creates a draft page with one heading per thing the AI repeats about you.
* «Responde esta pregunta» on a page you already have offers «Añadir preguntas»: you answer the questions and they appear at the end of that page (and as FAQPage data when no SEO plugin prints schema).
* New one-click fixes, reviewed in the page sheet and undoable: at least two <h2> (from your bold lines or headings you write), a single <h1>, Open Graph tags, hreflang, shipping details (cost from your WooCommerce zones, delivery days you write once), rating from real reviews, and the product barcode (GTIN) with check-digit validation.
* Open Graph is not offered when an SEO plugin already prints it, nor hreflang with WPML, Polylang or TranslatePress.
* The page content is never edited: every fix is served through filters and can be undone.

= 1.3.0 =
* With the account connected, GenScore's recommendations also appear in the GEO, SEO and Agentes tabs, each next to its tab.
* A recommendation that WordPress can fix offers «Arreglar», which opens the one-click fix sheet with the audit's pages already ticked. Bots and llms.txt take you to their switch.
* A plan step that asks for a new page offers «Crear borrador»: a draft post with the questions as headings. It is never published by the plugin.
* «Arregla primero» is now «Recomendaciones técnicas», so it is not mistaken for GenScore's recommendations.
* The agentic card in the Agentes tab is called «Auditoría agéntica».

= 1.2.1 =
* The domain's agentic gauge is called «Auditoría agéntica», so it is not mistaken for the page's Agentes row.
* Every audit in «Recomendaciones de GenScore» shows where it would get to if fixed (also the GEO audit).
* Page scores in the list carry the % sign, like the widget.

= 1.2.0 =
* The page review is now «Optimización técnica»: a bar with a state (Optimizada, Mejorable, Se frena), never a dial, so it is not read as the Puntuación GEO.
* The Puntuación GEO is the only dial. Without an account it shows as not measured, with a way to measure it.
* With an account, «Recomendaciones de GenScore» brings the console's plan and the top issues of its GEO, SEO and agentic audits.
* Actions name the competitor and show the question.
* «Fecha de actualización visible» shows the page's date when the theme prints it.
* robots.txt and llms.txt are asked a second time after a timeout or a server error before being reported missing.

= 1.1.3 =
* «Respuesta al principio» on the shop now counts in classic themes such as Storefront: it is printed before the products, not inside the products header.
* A review that was running when you saved robots.txt or llms.txt no longer stores scores read before the change.
* After «Guardar robots.txt», the switches stay where you left them while the pages are read again.
* «Fecha»: the shop says «No aplica» when it does not need a date, and pages that have one show it.

= 1.1.2 =
* «Salud SEO» in «Tu dominio» is the SEO audit's score, the same as in GenScore's console.
* The agent score and the GEO Score use the console's bands (Bien, Mejorable, Falla; Inicial, Emergente, Competitivo).
* Right after a scan, while its audit is still running, the figures refresh on their own every minute, and «Actualizar» reads them again at any time.

= 1.1.1 =
* After connecting, the message only says you can see your figures when this domain is in your GenScore account; otherwise it asks you to add it.
* GenScore's permission screen now reads «Conectar WordPress (your-site) con GenScore», without repeating the brand.

= 1.1.0 =
* «Conectar con GenScore»: with a GenScore account, «Tu dominio» shows your account's figures for this domain (Puntuación GEO, engines, competitors, SEO health, Search Console, agent score and next actions), the same ones as the Chrome extension. Read-only, approved on genscore.es, and «Desconectar» removes the access.

= 1.0.7 =
* «Arreglar» in one click: structured data, description, title, canonical URL, visible update date, product data and returns policy. GenScore proposes the fix for each page, you review and edit it, confirm, and it is published on the pages you chose. Every publish can be undone.
* The shop page gets a live product list (price and stock always current), and «Responde en las primeras líneas» can be fixed too: a short answer paragraph under the title, taken from the excerpt or description, or written by you.
* Product price and stock in the structured data always come from WooCommerce when the page is served. With Yoast, Rank Math or AIOSEO active, GenScore does not add a second page graph.
* «Ir a llms.txt» and «Ir a bots» take you to the card that already does that fix.
* The editor shows a «Publicado por GenScore» box on pages with published fixes.

= 1.0.6 =
* «Quién puede leer» shows Meta AI and Muse too, outside the note, and the bots card warns when robots.txt blocks Meta's search.
* Saving the bots or llms.txt, or changing «visible to search engines», reviews every page again instead of keeping old scores. Scores from an earlier version are read again once after updating.
* A page that sells nothing no longer repeats its shop page's fixes: «Devoluciones» shows once, and Agentes counts the pages that sell.
* The home page no longer gets the product price, stock or name fixes.
* Cart, checkout, my account and the privacy policy show «–» in the GenScore column instead of «Revisar».
* «+1 punto», not «+1 puntos».

= 1.0.5 =
* Bots de IA: two new switches for Meta, the search behind Meta AI and its shopping agent Muse (meta-webindexer) and model training (meta-externalagent).
* A line explains that agents buying for someone do not read robots.txt when they visit: your anti-bot protection decides.

= 1.0.4 =
* GenScore now reviews your site by itself: the home page, the pages in your menus, your best-selling products and your latest posts. The note is your site's, and each fix says how many pages it affects and which ones.
* «Tus páginas»: every page reviewed, worst first, with a link to open its detail or edit it.
* New «GenScore» column in the lists of pages, posts and products. When you publish or update something, only that page is reviewed again.
* The page picker of 1.0.3 is gone: there is nothing to choose.

= 1.0.3 =
* Review any published page, post or product, not only the home page: pick it at the top of the screen, or use «Revisar con GenScore» in the lists of pages, posts and products.
* llms.txt: after «Volver al generado» or «Guardar», the box shows the current generated text straight away (new posts included).
* robots.txt: while the whole site is closed for everyone, allowing a bot another plugin had blocked no longer opens the site to it. The screen says why.
* llms.txt: descriptions taken from the content no longer glue a heading to the paragraph before it.

= 1.0.2 =
* llms.txt: the text is only saved when you edit it, so a title with an emoji or a post published meanwhile no longer freezes a copy. «Volver al generado» goes back to the generated text.
* robots.txt: closing the whole site for everyone (for example, in maintenance) also closes it to the AI bots you had turned on.
* Agents: prices shown the Spanish way (149,90 €).
* Nonce checks Plugin Check can see in every handler.

= 1.0.1 =
* robots.txt: turning a bot back on gives back the original file. GenScore only writes a group when it changes something.
* llms.txt: saving the generated text without changes no longer stores a frozen copy.
* llms.txt: leaves out the WooCommerce cart, checkout and account pages, and the privacy policy description while it is still WordPress's template.
* Agents: with WooCommerce, reviews a product page instead of the shop window.
* Nonce checked in each AJAX handler.

= 1.0.0 =
* First release.

== Credits ==

Bundled fonts: Figtree (SIL Open Font License 1.1) and JetBrains Mono (SIL Open Font License 1.1).
