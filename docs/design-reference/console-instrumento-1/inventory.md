I did not create /tmp/claude-0/.../scratchpad/inventory.md. My agent mode is strictly read-only and forbids creating files anywhere, /tmp and scratchpad included. The full inventory is below, so you or the parent can save it as written. Everything was checked against HEAD 76087a0. Copy is verbatim from code; `{x}` marks an interpolated value.

**Where the code differs from your brief:**
- **Recommendations tabs.** There are no "Activas / Más adelante / Resueltas" tabs. The screen has a section called «Tu plan de esta semana», then a section header «Más adelante», then a segmented filter with «Pendientes» · «Técnico» · «Resueltas». The last two only appear when they have content.
- **Escaneos list.** It no longer exists. `/runs` redirects to `/debug`, an internal screen with no menu entry. Only the run detail page `/runs/[runId]` remains.
- **Settings.** Profile, notifications, billing, organization and team are no longer separate screens. They are all permanent redirects to one page, `/dashboard/settings`, which has the anchors `#cuenta`, `#plan` and `#avisos`. There is no team screen. "Organización" became a fold. There is no "Plan y facturación" heading in the UI (the phrase only appears in pricing FAQ copy); the section is called «Plan».
- **No toast system.** Feedback is shown as inline `.feedback` banners, inline `ActionAnnouncement` text, or window.confirm.

---

# GenScore console: screen and state inventory

## 0. Global conventions
- **Sticky page header (`.ov-sticky-header`)** appears on every project screen:
  - Left: a kicker with the screen name, then the project name (15px/750), a mono badge with the domain, and sometimes a `meta-pill` `{country}/{language}`.
  - Right: the scan-state pill.
  - It is hidden while the first-scan mission takeover is on screen.
- **Scan-state pill (`ScanStatePill`):**
  - «Escaneando…» or «Analizando…»: accent badge with a running dot, while a scan runs.
  - «Auditando…»: while the web audit runs.
  - «Escaneado {12 oct 2026}»: green badge once a scan has finished.
- **Section label pattern:** `.ov2-sec-lbl` / `.cm2-sec-lbl`, a small uppercase label with an optional right-hand link «Ver todo».
- **First-scan mission takeover (`FirstScanTakeover` → `ScanMissionRocket`):**
  - Replaces the whole content of Overview, Prompts, Competitors, Recommendations, Citations and Web audit while the project's first scan runs (active run and no completed run).
  - The page gets class `mrk-fill` and the sticky header is hidden.
- **Read-only (trial ended, planId "free"):** no dedicated screen. It shows up as:
  - the top band «Tu prueba de Pro ha terminado…»;
  - the bell lane «Tu cuenta»;
  - the settings pill «Sin plan · solo lectura»;
  - the scan button error;
  - the wizard being blocked.
- **`EmptyState` component:** a dashed card (border #dde0e7, bg #fbfbfd) with a bold title and a description line.
- **Generic route states:**
  - `app/dashboard/error.tsx`: «Algo ha ido mal» / «No hemos podido cargar esta página. Puedes reintentarlo; si el problema persiste, contacta con soporte.» / button «Reintentar».
  - `not-found.tsx`: kicker «Error 404», title «Esta pantalla no existe», body «El enlace que has seguido apunta a un dominio, un escaneo o una sección que ya no…», buttons «Ver mis dominios» and «Ir al último dominio».
  - `loading.tsx` per route: skeletons, e.g. the Overview skeleton is a header, a 140px circle, 3 bars and 4 stat blocks.

---

## 1. Auth (brief)
All auth pages use `.auth-bg` > `.auth-card` with the BrandLogo. Fonts: Bricolage for titles, Figtree for body.

- **/login**
  - h1 «Bienvenido de nuevo»; sub «Accede a tu panel y sigue mejorando tu visibilidad en IA.»
  - If `?deleted=1`: success «Tu cuenta se ha eliminado correctamente.»
  - Fields: «Email de trabajo» (placeholder «nombre@empresa.com») and «Contraseña» (PassField).
  - Button «Iniciar sesión»; divider «o continúa con»; «Continuar con Google».
  - «¿No tienes cuenta? Regístrate»; footnote «Al continuar, aceptas nuestros Términos y la Política de privacidad.»
- **/signup**
  - h1 «Crea tu cuenta»; sub «7 días de prueba gratis de Pro, sin tarjeta.»
  - Fields: «Email de trabajo», «Contraseña», «Repite la contraseña».
  - Button «Crear cuenta gratis»; divider «o regístrate con»; «Continuar con Google».
  - «¿Ya tienes cuenta? Inicia sesión»; terms text «Al continuar, aceptas los Términos y la Política de privacidad. Te enviaremos emails sobre tu cuenta y…».
- **/signup/confirm**
  - h1 «Confirma tu email»; «Te hemos enviado un enlace de confirmación por email. Ábrelo para activar tu cuenta.»
  - «…vuelve a registrarte.»; «¿Ya confirmaste? Inicia sesión».
- **/forgot-password** has four steps:
  1. «¿Olvidaste tu contraseña?», «Introduce el email asociado a tu cuenta y te enviaremos un código para…», field «Email de trabajo», button «Enviar código de recuperación» (pending «Enviando…»), link «Inicia sesión».
  2. «Revisa tu correo»: 6 digit boxes (aria «Dígito n»), «Verificar código» (pending «Verificando…»), «Reenviar código».
  3. «Crea una contraseña nueva» / «Elige una contraseña segura que no hayas usado antes.»
     - Fields «Nueva contraseña» and «Repite la contraseña».
     - Checklist «Al menos 8 caracteres», «Mayúsculas y minúsculas», «Un número», «Un símbolo (!@#$…)».
     - Strength labels «Débil / Insuficiente / Buena / Fuerte».
     - Errors «Las contraseñas no coinciden» and «Tu contraseña debe cumplir al menos 3 de los 4 requisitos.»
     - Button «Restablecer contraseña» (pending «Guardando…»).
  4. «Contraseña actualizada»: «Tu contraseña se ha restablecido correctamente. Ya puedes iniciar sesión…», button «Iniciar sesión».
- **/mfa/challenge**
  - «Verifica tu identidad» / «Introduce el código de 6 dígitos de tu app de autenticación.»
  - Field «Código de 6 dígitos» (placeholder 000000); button «Verificar».
- **/mfa/enroll** (admin only)
  - «Activa el doble factor», a QR image, «2. Código de 6 dígitos», button «Verificar y activar».
  - Two error texts about a half-configured MFA or TOTP not being enabled.

---

## 2. Console shell (`app/dashboard/layout.tsx`)
Order of layers, top to bottom:
1. `DomainOverageGate`: a blocking modal, only when the account is over its domain cap (§14).
2. `TourProvider`: the product tour popup, which opens automatically on first access.
3. `Sidebar`.
4. `.dash-main`, containing:
   - `ConsoleHeader` (holds `WorkspaceTopbar` plus the actions);
   - `DataMaturityBanner` (the top band);
   - `main.dash-content`, which is the scroll container.

### Sidebar (`components/sidebar.tsx`, `aside.sb`)
- **Brand row:** BrandLogo plus subtitle «Espacio de visibilidad en IA». On mobile it also has a close button (aria «Cerrar menú», icon x).
- **Project/domain switcher (`.proj-switch`):**
  - Shows the favicon (falls back to the initial letter), the project name, the domain, and an arrow.
  - title «Cambiar de dominio»; links to /dashboard/domains.
  - No project: `.proj-empty` with «Sin dominio todavía», «Crea tu primer dominio para empezar a escanear.» and the link «Crear dominio» → /dashboard/projects/new.
  - Which project is shown: the one in the URL, then `?active=` on /domains, then the cookie `geo_active_project`, then the first project.
- **Menu (NAV-SIMPLIFY-1), 4 blocks (group label → items):**

  | Block | Items (icon) | Count badge |
  |---|---|---|
  | **Posicionamiento en la IA** | «Visión general» (overview) | — |
  | | «Prompts» (prompts) | prompt count |
  | | «Competidores» (competitors) | competitor count |
  | | «Páginas citadas» (cite) | — |
  | **Posicionamiento global** | «Auditoría técnica» (search) → /web-audit | — |
  | | «Posición en Google» (trendUp) → /search-console | — |
  | **Actuar** | «Recomendaciones» (recs) | recommendation count |
  | **Aprender** | «Manuales y estudios» (fileText) → /blog (public) | — |

  - There is no «Dominios» item (the switcher is the entry point) and no «Escaneos» item.
  - Item states: `active` (aria-current page) and `disabled` (span, used when there is no project). The `nav-count` badge only shows when the count is above 0.
- **Footer (`.sb-foot`):**
  - Button «¿Cómo funciona?» (icon info), which opens the tour. On the mobile drawer it collapses to just the icon.
  - User chip linking to /dashboard/settings: avatar initials, email, and the plan badge `.sb-plan-badge` (crown icon + plan name). The badge is not shown for "free".
  - Icon-only sign-out button (aria/title «Cerrar sesión», icon logOut).

### Mobile drawer
- Opened from the burger `.hdr-burger` (aria «Abrir menú de navegación», icon menu2, 22px).
- When open, the shell gets class `mobnav-open` and a scrim `.mob-scrim` appears. Escape or the scrim closes it; picking a nav item closes it.
- Drawer width is `--drawer-w` 288px. NAV-DRAWER-FIT-1: the whole menu fits on an iPhone, and the footer is a single row.
- The mobile header shows a centered BrandLogo (20px).

### Header (`ConsoleHeader` + `WorkspaceTopbar`)
- The header is flat (no background or border) while the page is at the top. Once `.dash-content` scrolls past 2px it becomes translucent glass (`is-scrolled`). Height is 52px.
- Desktop shows only:
  - a spacer;
  - the live scan status of the current project: `.scan-status` dot plus «Pendiente / En curso / Completado / Con errores / Cancelado»;
  - the notification bell;
  - an outline button with the settings icon and the label «Cerrar sesión».

### Top band / trial banners (`DataMaturityBanner`, `.dmb-band`)
- **free (trial ended), cannot be dismissed:** «Tu prueba de Pro ha terminado. **Tus datos siguen aquí**, pero no se hacen escaneos nuevos hasta que elijas un plan.» with CTA «Elegir plan» → /dashboard/settings?openPlan=pro#plan.
- **history (hidden by default; it only shows once the local switch in /debug is set to "0"):** «**Tu histórico se está construyendo.** Las tendencias y la comparativa con tus competidores ganan fiabilidad con cada escaneo.»
  - On the right, a meter: «Escaneo {n} de {target}» with segment bars and «~{eta} {cadenceUnit}».
- **Trial running:** shown in the bell («Tu cuenta») and as a banner in Settings › Plan (§13). There is no global band for it.
- There is no plan chip in the header. The plan appears in the sidebar user chip and in the Settings head pill.

---

## 3. Notifications
### Bell (`components/notification-bell.tsx`)
- Button `.header-bell` (aria «Notificaciones», icon bell).
- Red dot `.notif-dot` when there are unread alerts, or on the last trial day until the panel is opened.
- **Panel `.notif-panel`:**
  - Head «Notificaciones».
  - Up to 3 items, one per lane. Each item: tone icon, lane label (small caps), title, optional target line (domain), description, optional CTA.
  - Foot link «Ver historial» → /dashboard/notifications.
  - Empty: «Estás al día. Te avisaremos cuando haya algo que hacer.»

**Lane «Tu cuenta»** (computed, not stored; href /dashboard/settings?openPlan=pro#plan):

| Case | Tone / icon | Title | Body | CTA |
|---|---|---|---|---|
| Trial, last day (counts toward the dot) | neg / alertCircle | «Último día de tu prueba de Pro» | «Cuando acabe, tu Puntuación GEO deja de actualizarse.» + founder line | «Mantener Pro» (urgent style) |
| Trial | warm / clock | «Te quedan {n} días de Pro» | «Después tu cuenta pasa a solo lectura y deja de escanear.» | «Ver planes» |
| Read-only | warm / clock | «Tu puntuación lleva {n} días sin actualizarse» or «Tu cuenta está en solo lectura» | «La IA cambia sus respuestas y lo que ves es de tu último escaneo. Activa Pro para volver a medir.» or «Activa un plan para escanear tu web.» | «Activar Pro» |

- Founder line: « Con precio fundador, Pro se queda en {price} € al mes para siempre.»

**Lane «Tu siguiente paso»** (blue / target icon; never lights the dot):
- Title: the title of the first action in the plan. Target: the domain.
- Body: «La primera de tus acciones prioritarias en Recomendaciones.» + « Puede sumar +{x} pt a tu Puntuación GEO.»
- Links to /recommendations.

**Lane «Algo ha cambiado»** (stored alerts, one at most, by priority order ai_bot_blocked > page_unreachable > emerging_competitor > surfacing_dropped; older than 14 days are dropped):
- «{Agente} no puede acceder a tu web» / «Tu robots.txt lo bloquea. Mientras siga así no puedes aparecer en sus respuestas.»
- «Una página tuya ha dejado de responder» or «{n} páginas tuyas han dejado de responder» / «En la auditoría anterior se analizó correctamente y ahora no. …»
- «Marca emergente en tus respuestas» / «La IA menciona a {competidor} en {n} consultas y no la monitorizas.»
- «La IA ha dejado de citar tus páginas» / «Tienes contenido sobre {n} temas que la IA ya no cita. «{tema}» y {n} más.»
- Each item shows a relative time: «ahora / hace {n} min / hace {n} h / hace {n} d».
- Other stored types (scan completed, scan failed, gap pending, gap resolved, llms.txt or sitemap gone, trial) are still rendered by `render.ts` but filtered out of the bell. Examples: «Escaneo completado» / «Escaneo actualizado: Puntuación GEO {n} · {n} acciones nuevas y {n} brechas cerradas.»; «Escaneo fallido»; «Brecha cerrada»; «Tu llms.txt ha desaparecido»; «Auditoría SEO completada» / «Diagnóstico técnico {n}/100.»

### /dashboard/notifications (`NotificationsPageClient`)
- Card `.notif-page-card` with h1 «Notificaciones».
- Tabs «Todas» and «No leídas» (count badge, «50+» when capped).
- Rows grouped by day label «Hoy / Ayer / 12 de julio». Each row: icon, title with unread dot and time, target, description.
- Empty states:
  - Unread tab: check icon, «Estás al día», «No te queda nada por leer. Las nuevas aparecerán aquí y en la campana.»
  - All tab: bell icon, «Sin notificaciones todavía», «Te avisaremos cuando haya algo que hacer o algo cambie en tu visibilidad.»
- Opening the page marks everything as read.

---

## 4. Visión general: /dashboard/projects/[projectId]
**Sticky header:**
- Kicker «Visión general», project name, domain badge, `{country}/{language}` pill.
- Right side (`ScanReportControl`):
  - From 900px: a ghost button «Descargar informe» (download icon) → /informe/{id} in a new tab.
  - The «Escaneado {fecha}» pill. Below 900px the pill becomes a button that opens a bottom sheet dialog: «Escaneo del {fecha larga}», «El informe recoge los datos de este escaneo en un PDF listo para compartir.», «Descargar informe» (primary), «Cerrar».
  - During a scan it shows the running pill instead.

**Feedback banners above the content** (from `?error=` / `?success=` query params):
- Errors, for example: «Ya hay un escaneo en curso o pendiente para este dominio.»; «Tu prueba de Pro ha terminado y tu cuenta está en solo lectura. Elige un plan para volver a escanear.»; «Añade al menos un prompt activo antes de escanear.»
- Success, for example: «Dominio creado. Tu primer escaneo se está ejecutando — sigue el progreso aquí.»; «Escaneo completado. Los resultados ya están disponibles en esta visión general.»
- Last run failed (warn): «El último escaneo no se pudo completar. Se muestran los últimos resultados completados.» or «…Vuelve a intentarlo con el botón de arriba.»
- No prompts (warn): «Añade al menos un prompt activo antes de escanear. Añadir prompts».

**Data state (`.ov2-scope`), in visual order:**

0. **Prioridad 1 strip `.ov2-prio`** (only when there is a citation blocker): «!» icon, kicker «Prioridad 1 · tu web», blocker title, detail plus « Y hay {n} frenos más.», URL path plus « y {n} más», primary button «Ver cómo arreglarlo» → web-audit.

1. **Insight banner `.ov2-insight`** (sparkles icon). Base sentence: «GenScore detectó que **{marca}** aparece en **{n} de {N} respuestas de IA** ({x}% ±m).» Then one of these variants:
   - «Tu rival más visible, **X**, te saca ventaja: {r}% de presencia frente a tu {x}%.»
   - «Tu mayor freno son las citas: ninguna de las fuentes que usa la IA es tuya todavía.»
   - «No sigues a ningún competidor, así que todavía no hay con quién compararte.»
   - «La IA no nombró ni a tu marca ni a tus competidores en estas respuestas.»
   - «Empatas en presencia con **X**, tu competidor más visible.»
   - «Vas por delante de tus competidores en este escaneo, pero con tan pocas respuestas todavía no es concluyente.»
   - «Hoy mantienes la **mayor visibilidad** frente a tus competidores.»
   - Optional ending: « GenScore ha priorizado **{n} acciones de alta prioridad** para mejorar tu presencia en las respuestas de IA.»

2. **Hero (2 columns on desktop):**
   - **Gauge card**, label «Puntuación GEO»:
     - 96px gauge.
     - Band badge «Franja «competitivo»» (≥70, pos) / «Franja «emergente»» (≥40, accent) / «Franja «inicial»» (warn). Always shown.
     - Delta «+N pt» (only when the sample is sufficient).
     - Sparkline with caption «Últimos {n} escaneos». When the sample is insufficient, the nudge «Con {n} respuestas de IA más verás franja y evolución. Añade prompts o motores.» shows instead.
   - **«Indicadores clave»** KPI carousel:
     - «Tasa de mención» {x}% + delta; hint «{n} de {N} respuestas de IA · margen ±m pt (95%).»
     - «Cuota de Citas» {x}%, quality badge «Muy alto / Alto / Medio / Bajo / Muy bajo», or «Sin datos».
     - «Presión competitiva» {x}%, band «Crítica / Alta / Media / Baja».
     - «Sentimiento de marca» «Positivo / …», with a 3-colour bar and «{p}% · {n} resp.». Hidden when the sample is insufficient.
     - Each KPI has a tooltip. Delta «— sin cambio» when flat.
     - From 1200px the card «Posicionamiento por motores de IA» can move into this grid.

3. **Score row:**
   - **«Desglose del GEO Score {n}/100»**, a card with 5 rows. Each row: tone icon, label, hint, bar, «{n}/100».
     - «Presencia» (eye) «Menciones de tu marca en las respuestas de IA.»
     - «Prominencia» (crown) «Puesto medio de tu marca cuando la IA la menciona.»
     - «Cuota de voz» (resonance) «Tus menciones frente a las de tus competidores.»
     - «Autoridad» (shield) «Citas de la IA a páginas de tu propio dominio.»
     - «Diagnóstico técnico» (bolt) «Salud técnica de tu web para motores de IA.»
     - Dropped row: dashed bar, «No disponible», plus a reason (for example «Tu marca no apareció en ninguna respuesta de este escaneo.»).
     - Legacy run: «Este escaneo es anterior a que la salud técnica entrara en el GEO Score. Se incluirá en tu próximo escaneo.»
     - Partial engine coverage adds a warn banner.
   - **Side column:**
     - «Posicionamiento por motores de IA»: one bar per engine with glyph, label and % (ChatGPT #10a37f, Gemini #4285f4, Claude #d97757, Perplexity #20808d). Empty: «Aparecerá aquí después de completar un escaneo.»
     - **«Auditoría SEO» + «Ver todo»** (`SeoAuditCard`):
       - Meta «Revisada el {fecha} · {n} páginas»; «Salud SEO {n}/100».
       - Three severity tiles: {n} «Crítico/Críticos», «Aviso/Avisos», «Mejora/Mejoras».
       - «Velocidad en móvil: **LCP 2,1 s**, buena/mejorable/lenta».
       - «Lo primero que arreglar»: up to N issue links (check label, scope, «+x pt», chevron).
       - Clean state: «Sin problemas de SEO» / «Las {n} páginas revisadas pasan todas las comprobaciones SEO.»
     - **Google half (`GscOverviewHalf`)**, inside the SEO card:
       - Head «Google · últimos 28 días» / «Search Console».
       - Not connected: «Conecta tu Search Console para ver tus clics, tu puesto en Google y las búsquedas en las que sales en la página 2.» + «Conectar Search Console».
       - Reconnect: «La conexión con Search Console se ha perdido. Vuelve a conectar para ver tus clics y tu puesto en Google.» + «Volver a conectar».
       - Data: mini KPIs «Clics» {n} ±% and «Puesto medio» {x} ▲/▼, then the link row «{n} búsquedas en la página 2 de Google. Son las más fáciles de subir a la primera. Verlas →».
       - Hidden while loading or when there is no data.

4. **«Panorámica competitiva» + «Ver todo»:**
   - Chart card: «Tu puesto medio cuando apareces», big value «{rank} / {total}» or «No apareciste en este escaneo»; «Top 5 posiciones» vertical bars, with the brand bar highlighted.
   - Empty: «Sin datos de competidores» / «Añade competidores para ver cómo se compara tu visibilidad en IA.» + «Añadir competidores →».
   - Nobody named: «Ninguna marca apareció en este escaneo» / «La IA no nombró a {marca} ni a ninguno de tus {n} competidores en {N} respuestas. Puede pasar en un dominio nuevo o con prompts muy genéricos.» + «Revisar mis prompts →».

5. **Table «Último escaneo»** (columns «Último escaneo» | «Mención» | «Puesto medio»):
   - Each row: favicon, name, tag «Tú», tag «pocas menciones», mention bar with %, rank «{n}º».
   - A gap row of 3 dots when the brand is outside the top 5.
   - The «Puesto medio» column disappears entirely when there is no position data.

6. **Rail «Oportunidades» + «Ver todo →»** (`.ov2-opps`):
   - Hero «+{n}» «Puntos potenciales» (or a count with «Recomendación/Recomendaciones»).
   - Heading «{n} acciones de alta prioridad» or «Acciones priorizadas para ti».
   - Sub: «Techo optimista si resuelves estas acciones — tu próximo escaneo lo confirma.», «Ejecútalas para recuperar visibilidad frente a {X}.» or «Ordenadas por impacto en tu visibilidad en las respuestas de IA.»
   - List: dot (green = quick), title, chip «rápida», «+n pt» or «Impacto alto/medio/bajo».
   - Link «Ver todas las recomendaciones →».

**Non-data states:**
- **A. First scan:** FirstScanTakeover (§12).
- **A'. Later scan with no data:** `ScanInProgress` card with spinner:
  - «Escaneo de visibilidad en curso» / «Esto suele tardar un par de minutos. Puedes salir de esta página — seguiremos trabajando.»
  - or «Analizando las respuestas» / «Ya tenemos lo que han contestado los motores; ahora extraemos de cada respuesta las menciones, las posiciones y las citas. …»
  - Progress bar plus mono line «Preparando el escaneo…», «{p}% · consultando motores · {n} de {N}» or «{p}% · analizando respuestas · {n} de {N}».
- **B. Ready to launch:** centred card, overview icon, «Lanza tu primer escaneo de visibilidad en IA», «Analiza cómo aparece **{marca}** en los motores de IA con tus **{n} prompts** activos.», button «Lanzar escaneo» (pending «Lanzando…»), caption «Primer escaneo · {n} prompts · Gemini, Claude y ChatGPT».
  - Button errors: «No se pudo lanzar el escaneo. Inténtalo de nuevo.»; read-only «Tu prueba de Pro ha terminado. Elige un plan para volver a escanear.»; «Ya hay un escaneo en curso para este dominio.»
- **C. No prompts:** «Configura tus primeros prompts» / «Añade entre 5 y 10 preguntas de alta intención que tus potenciales clientes hacen a la IA. Son la base de tu análisis de visibilidad.» + outline button «Ir a Prompts».
- **Rescan with existing data:** the data stays visible and the header pill shows the running state (via a poller).

---

## 5. Prompts: /prompts
**Header:** kicker «Prompts», name, domain, country/lang; right side ScanStatePill.

**Banners:**
- Success: «Se ha añadido 1 prompt nuevo.» or «Se han añadido {n} prompts nuevos.» + «Se ha lanzado un escaneo restringido a estos prompts nuevos.»
- Competitor filter strip (`?competitor=`): «Mostrando solo prompts donde aparece **X** en el último escaneo.» + «Quitar filtro».

**Data layout (`PromptsClient`, `.pr2-scope`):**
1. Insight: «GenScore monitoriza **{n} prompts** en **{t} temas**. Tu marca aparece en **{a} de {b}** ({p}%) escaneados. Fuerte en «X» ({p}%), floja en «Y» ({p}%).» (no scans yet: «Aún no hay resultados de escaneo para estos prompts.»)
2. Toolbar: search «Buscar prompt…» plus the «Añadir prompts» button. From 1200px both move into the list header.
3. Rail card «Visibilidad del conjunto» {p}%: green/red split bar; legend «{n} con visibilidad» / «{n} sin visibilidad».
4. List:
   - **With topics:** header «Temas» + search + add. Topic rows: 46px gauge, chevron, topic name, «{n} prompts», sentiment badge or «Sin sentimiento», and on the right «{n} menciones». Expanding a topic shows indented prompt rows.
   - **Without topics:** dashed note «Tus prompts no tienen temas asignados todavía. Cuando GenScore genere temas automáticamente, aparecerán agrupados aquí.» + header «Prompts».
   - **Prompt row:** text; badge «Marca mencionada» (green) or «Marca no mencionada» (red); sentiment «Positivo / Neutral / Negativo / Mixto» or «Sin sentimiento» (outline); «{n} competidores · {citations label}»; engine chips with gaps.
   - Search with no match: «Ningún prompt coincide con «q».» or «Ningún tema o prompt coincide con «q».»

**Page states:**
- No active prompts: «No hay prompts activos» / «Añade tus primeros prompts para empezar a analizar la visibilidad de tu marca.» + add button.
- No completed run: «Todavía no hay resultados» / «Los resultados aparecerán después de lanzar el primer escaneo con Gemini.» / «Ir a visión general para lanzar el escaneo →».
- No results: «Sin resultados disponibles» / «El escaneo está completado pero no hay respuestas disponibles.» / «Volver a visión general →».
- With a filter: «{X} no aparece mencionado en el último escaneo» / «Quita el filtro para ver todos los prompts del último escaneo.» / «Quitar filtro →».
- Add button disabled: tooltip «Espera a que termine el escaneo en curso.» or «Has alcanzado el límite de prompts monitorizados de tu plan actual. Sube de plan para añadir más.»
- First scan: mission takeover.

**Modal «Añadir prompts»** (wide modal card, 2 steps):
- **Step 1, pick a method:**
  - «Generación automática»: «La IA genera 5 prompts nuevos relevantes para tu marca.»
  - «Basado en keywords»: «Indica palabras clave y la IA genera 5 prompts a partir de ellas.»
  - «Manual»: «Escribe tus propios prompts; la IA les asigna tema y los escanea.»
- **Step 2:** back arrow, method title.
  - Auto: «La IA genera 5 prompts nuevos relevantes para tu marca, sin repetir los que ya tienes activos.», chips «5 prompts nuevos» and «Todos tus motores de IA».
  - Keywords: «Palabras clave», placeholder «p. ej. precios, alternativas, integración», «Añadir», removable chips.
  - Manual: «Nuevo prompt», placeholder «Escribe el prompt completo…», «Añadir».
  - Footer: «Atrás» and the CTA «Generar prompts» or «+ Añadir {n} prompt(s)».

**Prompt drawer (`components/prompts/prompt-drawer.tsx`, right side panel):**
- **Head:** category tag, prompt text, delete button, close «×» (aria «Cerrar»). The scrim has aria «Cerrar panel».
- **Tabs «Resumen» | «Respuestas».**
- **Resumen tab:**
  - Two signal cards:
    - «La IA menciona tu marca» or «…no menciona…», hint «Te nombra y, además, usa tu web como fuente.» / «Te nombra en la respuesta, aunque sin citar tu web.» / «Ninguna respuesta a esta pregunta nombra tu marca.»
    - «La IA cita tu web» or «La IA no cita tu web» (InfoTip), hint «Al menos una fuente usada es tuya.» / «La IA responde sin citar tu web ni tu contenido.»
  - «Por motor» («Cada motor respondió {n} veces en este escaneo»): one row per engine with mention line, sentiment badge and own-citation badge.
  - «Ranking de marcas», column «Aparición en motores»: summary, rows «Nombrada en {n} de {N} respuestas.», expander «Ver {n} marcas más sin mención».
  - «Evidencias de mención de {marca}»: per engine, badge «vía alias «X»», quotes «[Marca] «…»». Fallback: «Mención verificada, pero este motor no dejó una cita textual recuperable. La respuesta completa está en «Respuestas», con el nombre resaltado.»
  - «Fuentes usadas» (InfoTip) «Sin repetir, por motor»: list per engine, «Respondió sin buscar en la web.», «Ver {n} fuentes más de {Motor}».
- **Respuestas tab:**
  - Engine segmented control (aria «Motor») and chips «Respuesta 1…n».
  - Meta row: engine, «Te nombra» or «No te nombra», sentiment, «Cita tu web», «{n} fuentes» or «Sin fuentes».
  - Formatted response body with the brand highlighted. Fallback: «El texto de esta respuesta no se guardó.»
- **Delete prompt modal:** «Borrar prompt» / «Vas a desactivar este prompt de forma **permanente**. Dejará de incluirse en los próximos…» / «Cancelar» / «Borrar prompt» (pending «Borrando…»).

---

## 6. Competidores: /competitors
**Header:** kicker «Competidores», name, badge «{n} competidores», ScanStatePill.

**Content, in order:**
1. **Insight `.cm2-insight`** (users icon):
   - No data: «Sin datos de competencia todavía. **Lanza el primer escaneo** para ver cómo aparece tu marca frente a la competencia.»
   - With data: «**{marca}** aparece en **{x}% de las respuestas** analizadas ({n} prompts × {m} motores…). Tu competidor más fuerte es **X**, con **{s}% de cuota de voz** y te desplaza en **{a} de {N} prompts** del último escaneo. Su punto débil es **{Motor}** ({r}% frente a tu {r2}%).» or «Lideras con {s}% de cuota de voz.»
2. **«Identidad de marca»** with the «Gestionar alias» button. Card text:
   - With aliases: «Además de **{marca}**, una respuesta de IA también cuenta como mención de tu marca cuando nombra: **a, b**.»
   - Without: «Hoy solo cuenta como mención una respuesta que nombre literalmente **{marca}**. Si la IA recomienda un producto tuyo sin nombrar a la empresa —por ejemplo "Firefox" en vez de "Mozilla"—, esa respuesta no se cuenta a menos que añadas ese nombre como alias.»
   - **Modal «Gestionar alias de marca»:** intro about Mozilla/Firefox; «Añadir alias» with placeholder «p. ej. el nombre de un producto de {marca}», «Añadir» (pending «Añadiendo…»); rows with a remove icon, «¿Seguro?», «Sí, quitar», «Cancelar». Empty: «Todavía no hay ningún alias. Mientras tanto, solo cuenta como mención una respuesta que nombre…»
3. **No competitors:** label «Panorámica competitiva», card «No hay competidores configurados» / «Usa "Gestionar" arriba para añadir el primer competidor y ver el análisis comparativo de cuota de voz en IA.»
4. **Competitors but no scans:** «Panorámica competitiva · cuota de voz en IA», card «Sin datos de competencia todavía» / «Las menciones y la cuota de voz de tus competidores aparecerán aquí tras completar el primer escaneo real con Gemini.» + «Lanzar escaneo desde visión general».
5. **«Competidores sugeridos»** (shown when there is no competitive data):
   - Intro «Marcas que compiten de verdad con la tuya, según a qué se dedica tu negocio. Revísalas antes de seguir a una.»
   - Loading skeleton «Buscando competidores…»; rows with button «Seguir» (pending «Añadiendo…»).
   - Empty «Ya sigues a todos los competidores que hemos encontrado para tu negocio.»; foot button «Buscar más» (pending «Buscando…»).
6. **With data:**
   - **«Cuota de voz en IA» + «Gestionar»** (podium list):
     - Each row: rank number, favicon, name (brand gets the tag «Tú»), domain, «{x}% Mención», «{y}% Cita», SoV bar with «{s}%», delta «▲/▼ {n} pt(s)».
     - Clicking a competitor row (title «Ver prompts donde aparece X») opens Prompts filtered to it.
     - None mentioned: «Ningún competidor fue mencionado en los escaneos analizados» / «Revisa si los prompts son suficientemente comparativos o ajusta la lista de competidores con "Gestionar".»
     - **Modal «Gestionar competidores»** («Añade, edita o deja de seguir competidores.»): «Añadir competidor» with placeholders «Nombre (p. ej. Leroy Merlin)» and «Dominio (p. ej. leroymerlin.es)», «Añadir»; per row «Editar», «Guardar», «Cancelar», unfollow with «¿Seguro?» and «Sí, dejar de seguir»; inactive rows have «Volver a seguir»; empty «Ningún competidor activo todavía.»
   - **«Evolución del puesto medio de cada marca»** (chart with series toggles), or «Puesto medio cuando aparece cada marca» (list only). Table columns «Último escaneo | Mención | Puesto medio», ordinal «{n}º», tag «pocas menciones».
   - **«Brecha de prompts» {n} prompts:**
     - Category groups «Ausente / Por detrás / Por delante / En exclusiva / Sin nadie».
     - Rows: prompt text, red competitor chips, engine chips.
     - Empty lines, for example «Ningún prompt del último escaneo te deja fuera mientras un rival aparece.»
   - **«Presencia por motor · tasa de mención»:** heatmap table with header «Marca» plus engine names. Cells shade h0 to h5; the brand row comes first. Tooltip «{n} de {N} respuestas».
   - **«Terreno por tema»** (up to 8 rows): topic, «Lideras tú / Lidera X / Empate», two bars, gap value; legend «Tu marca» / «Competidor».
- First scan: mission takeover.

---

## 7. Recomendaciones: /recommendations
**Header:** kicker «Recomendaciones», name, badge «{n} acciones», ScanStatePill.

**Page states:**
- No recommendations: «Todavía no hay recomendaciones» / «Aparecerán en cuanto termine tu primer escaneo.» or, if the last run failed, «El último escaneo falló» / «No hay ningún escaneo completado del que sacar acciones. Revisa el dominio y vuelve a lanzarlo.» Button «Volver a visión general».
- Nothing to fix: «Nada que corregir ahora mismo» / «Este escaneo no ha encontrado ningún hueco accionable. Vuelve tras el próximo.»
- Last run failed but older data exists (warn strip): «El último escaneo falló. Estas recomendaciones son del anterior.»
- First scan: mission takeover.

**Layout (`.rec2-scope`, a narrow centred column), in order:**
1. **Citation blocker cards `.rec2-blocker`** (alert icon): title, detail, «Ver cómo arreglarlo», up to 3 URLs plus «y {n} más».
2. **Pillars `.rec2-pillars`**: 4 tiles «Presencia», «Prominencia», «Cuota de voz», «Autoridad», each with an InfoTip, a value and a bar. Tooltips:
   - «En cuántas de tus consultas te nombra la IA. Si no te nombra, no te pueden elegir.»
   - «Cuando te nombra, si lo hace pronto o al final. Salir primero pesa mucho más que salir.»
   - «Cuánto espacio ocupas tú frente a tus competidores en el total de menciones.»
   - «Con qué frecuencia la IA usa tu web como fuente y te cita, en vez de citar a otros.»
3. **Pills «Mejora IA» | «Mejora Google»** (tablist aria «Tipo de mejora»). Only shown once Google cards have actually arrived; otherwise only the AI content renders.
4. **AI content:**
   - Wins strip (green, full-width button): «1 recomendación resuelta recientemente» or «{n} recomendaciones resueltas recientemente» →, which opens the «Resueltas» filter.
   - **«Tu plan de esta semana. Hasta +{x} puntos»**: up to 3 priority cards, each numbered 1–3 and highlighted (`.rec2-priority`).
   - **Section header «Más adelante»** with a ghost button «Descargar informe» → /informe/{id}.
   - **Segmented filter `.seg`:** «Pendientes» | «Técnico» (only if there are technical recommendations) | «Resueltas» (only if there is history).
   - **«Pendientes»:** accordions grouped by type. Each accordion header: chevron, type label, «+{n} pt», count. Inside: shared description, a shared «Haz esto.» step, and short cards.
   - **«Técnico»:** a flat list of cards.
   - **«Resueltas»:** history cards. Each one: check icon, badge «Resuelta automáticamente» or «Marcada como hecha», type badge, struck-through title, date, a verdict line (for example «El escaneo del {fecha} ya no la encontró.»), and «Deshacer» (pending «Deshaciendo…»).
   - **Empty states:**
     - «Nada más por ahora» / «Empieza por tu plan de esta semana.»
     - «Nada que corregir ahora mismo» / «Lo que ya has resuelto está en la pestaña "Resueltas".» + «Ver Resueltas →», or «Vuelve tras tu próximo escaneo.»
     - «Nada con este filtro» / «Vuelve a "Pendientes" para verlo todo.»
     - «Todavía no hay nada resuelto» / «Aquí aparecerá lo que un escaneo confirme como resuelto y lo que marques como hecho.»

**Short recommendation card (RECS-SHORT-CARD-1):**
- **Collapsed:**
  - Chip row: rank number (plan only), kind label, «Prioridad alta», «Victoria rápida» (bolt), «Abierta {n} escaneos», «La marcaste como hecha el {fecha}» (clock), control chip «Depende de terceros» (globe) or «Aquí en GenScore» (robot). Own-site actions («En tu web») get no chip.
  - Title; step line «→ **Haz esto.** {primer paso}»; reach line with engine glyphs and «Visto …».
  - Right side: «+{x} pt» plus a caption, or «Impacto alto/medio/bajo».
  - Toggle button «Ver cómo» / «Ocultar».
- **Expanded (`.rec2-why`):**
  - Box **«Lo que vimos»** with chip «Dato sólido / Dato medio / Dato escaso», the description, and a note.
  - Box **«Por qué funciona»** with an advice chip «Lo controlas tú» («Es un cambio en tu web y no depende de nadie más.»), «Lo haces aquí» («Se hace desde GenScore, sin tocar tu web.»), «Depende de terceros» («El resultado depende de que otra web te incluya.») or «Con límite» («En una pregunta de definición lo realista es que te citen, no que te nombren.»).
  - Optional web-audit overlay box «Auditoría de tu web»: «Sí tienes una página sobre este tema», «No encontramos contenido tuyo sobre este tema», «Sólo encontramos tu portada» or «Sólo encontramos foros o comunidad», each followed by «**Qué hacer:** …».
  - «La pregunta» / «Las preguntas» with engine glyphs and competitors/domains.
  - «Evidencia»: «Temas recurrentes:», «Competidores:», «Dominios:», «Páginas citadas:», «Supuestos:».
  - **Actions:**
    - Primary generate button. Label by recommendation type: «Generar comparativa», «Generar FAQ», «Generar bloque citable», «Generar ficha de marca», «Generar brief de contenido», «Generar entradilla», «Generar contranarrativa», «Generar actualización», «Generar checklist», «Generar plan de contacto», «Generar plan de alta», «Generar respuesta», «Generar pitch», «Generar informe»; fallback «Generar propuesta con IA».
    - Generate pending «Generando…»; once done, the badge «Propuesta generada».
    - Ghost button «Marcar como hecho» (pending «Actualizando…»), with the note «La verás reflejada en tu próximo escaneo.»
    - Inline messages «Propuesta generada.» and «Marcada como hecha.»
  - **«Plan de acción»** panel (sparkles): readiness badge «Listo para copiar» or a gaps label, title, summary, steps, «Ejemplo», «Copiar» / «Copiado», footnote «Plantilla generada por IA — revísala y adáptala a tu web antes de publicarla.»
  - «Acción sugerida» box.

**Google view, «Con tus datos de Google»** («De tu Search Console, últimos 28 días. Se actualizan solas cuando cambian tus datos.»):
- A row of cards in `.grec-list` with a 3-card skeleton while loading. Every card has the tag «Datos de Google» plus a kind tag:
  - «Subir a la página 1»: h4 «Sube «q» a la primera página de Google»; evidence «Estás en el puesto {x} con {página} y la ven {n} en 28 días. Es tu búsqueda con más impresiones en la página 2.»; «**Primer paso:** responde a «q» en las primeras líneas de … y enlázala desde …»; buttons «Ver en Posición en Google» and «Marcar como hecho».
  - «Título y descripción»: h4 «Mejora el título de {página}: la ven {n} y entra el {ctr}»; evidence «Sales en el puesto {x} para «q». Tus otras búsquedas en los … entran alrededor del {ctr}.»; «**Primer paso:** reescribe el título y la descripción de … para que digan qué ofreces y por qué entrar.»; same two buttons.
  - «Google + IA»: h4 «Vigila en la IA «q»»; evidence «La gente ya te encuentra en Google con esa pregunta (puesto {x}), pero todavía no sabes si los motores de IA te nombran cuando se la hacen.»; buttons «Vigilar prompt» (done state «Prompt vigilado» → Prompts) and «Ahora no».
- Handled card: «Marcada como hecha.» or «La dejamos para más adelante.» + «La próxima vez que entres verás otra en su lugar.» + «Deshacer».

---

## 8. Páginas citadas: /citations
**Header:** kicker «Páginas citadas», name, domain, ScanStatePill.

**States:**
- No run: «Todavía no hay datos de citas» / «Las páginas que cita la IA al responder tus prompts aparecerán aquí después de completar el primer escaneo con Gemini.» + «Volver a visión general →».
- No sources: «Este escaneo respondió sin citar fuentes» / «No es un fallo: una IA no siempre busca en la web para responder. Cuando contesta desde lo que ya sabe (sin consultar el buscador), no hay ninguna URL que citar. Vuelve a comprobarlo tras el próximo escaneo.»
- First scan: mission takeover.

**Data:**
1. **KPI strip (3):** «Respuestas con cita» {x}% (blue, InfoTip), «Citas totales» {n}, «Citas propias» {n}.
2. **Zero-own notice** (info): «Ninguna de las {n} citas apunta a {marca}. Los **{k} dominios** de «Fuentes alcanzables» son terceros que la IA ya cita y donde todavía no apareces — es por donde se empieza.» or «Revisa en **Auditoría SEO** si tus páginas son accesibles y citables para los motores de IA.»
3. **Distribution row (2 columns, collapses to 1):**
   - Impact bar with segments «Páginas de {marca}», «Terceros que te mencionan», «Terceros que mencionan a un competidor tuyo», «Terceros que mencionan otra marca», «Páginas de un competidor», «Terceros que no mencionan ninguna marca» (each with a tooltip).
   - Donut «Qué tipo de fuente te cita»: «Tuyas / Competidores / Comunidad / Diccionario o enciclopedia / Comparador / Medio / Otras webs» with %.
4. **Rail «Fuentes alcanzables · subconjunto»:**
   - Title «{n} dominios de terceros que la IA ya cita y no te mencionan».
   - Expandable domain rows; pagination «Anterior» / «Siguiente» (5 per page).
   - Empty «Sin fuentes alcanzables pendientes» / «Ninguna fuente de terceros te deja fuera todavía.»
5. **Main list «Todas las fuentes · lista completa»:**
   - Title «{n} páginas citadas en los prompts escaneados», hint «De más a menos citada».
   - Search «Buscar página o dominio…»; tabs «Todas {n}», «Tuyas {n}», «Competidores {n}», «Terceros {n}». A tab with 0 is disabled (title «Ninguna página en esta categoría»).
   - Filter count «{n} de {N} páginas».
   - List head «Página citada | Citas». Rows: favicon, title or URL, type badge «Tuya / Competidor / {source type}», count.
   - Expanded row: «Citada al responder estos prompts» (or «Sin prompts asociados.»).
   - Empty «No hay páginas con estos filtros.»

---

## 9. Auditoría técnica: /web-audit (?bloque=geo|seo)
**Header:** kicker «Auditoría técnica», name, domain. Right side «Última revisión: {fecha}» (compact «Revisada {fecha}»).

**States:**
- No completed scan: «Todavía no hay ningún escaneo completado» / «Revisamos tu web automáticamente después de cada escaneo. Lanza el primero desde la visión general.» + primary «Ir a la visión general».
- Audit running with no snapshot yet: `ReentryMission` takeover. Rail «16 comprobaciones técnicas»; eyebrow «Reentrada»; title «Revisando tu web»; sub «Tarda unos minutos. Puedes irte: seguimos aunque cierres esta pestaña.»; joke «Lo caro del viaje es volver entero.»
- No snapshot: «Todavía no hemos revisado tu web» / «La revisión técnica corre sola después de cada escaneo. Vuelve en unos minutos.»
- Drive notice: «La auditoría no ha podido continuar».
- First scan: mission takeover.

**Data (`.sa-screen`):**
1. **Block switch `.sa-blk` (2 link cards):**
   - «Auditoría GEO», «¿Te puede citar la IA?», «Nota GEO {n}/100».
   - «Auditoría SEO», «¿Te encuentra Google?», «Salud SEO {n}/100».
   - Meta per card: «Sin problemas» or «{n} críticos · {n} problemas».
2. **Total line:** «Tu Puntuación GEO usa la **Salud técnica ({n}/100)**: los checks GEO y los SEO de siempre. Las comprobaciones nuevas y la velocidad sólo cuentan en la Salud SEO.» + «±n pt desde la revisión anterior».
3. **Potential banner:** «Si arreglas los {n} problemas que puntúan», «{from} → {to}», pill «calculado», caption «Nota GEO» or «Salud SEO», and a note:
   - GEO: «Lo que la IA necesita para poder citarte. Que acabe citándote depende también del contenido, que trabajas en Recomendaciones.»
   - SEO: «Lo que Google necesita para encontrar tu web, entenderla y enseñarla rápido.»
4. **Tabs «Problemas» · «Correcto» · «Páginas»** (aria «Secciones del bloque»).
5. **Main column:**
   - GEO block only, **«Cobertura de tu contenido»** (badge «Comprobación pendiente»):
     - «Tema a tema: si tu web publica una página sobre cada uno de tus prompts, y si la IA la cita al responder.»
     - Tiles «Contenido» and «Implementado» (caption «Palanca rápida: {n} temas aún sin citar»).
     - Locked tile «No está en tu plan» + «Ver planes».
     - Paused: «Comprobación pausada por cambio de plan» + «Ver planes».
     - Empty: «Todavía no hemos comprobado tu contenido. Se comprueba sola después de los escaneos.»
     - Fold «Evolución e historial»: «Evolución entre comprobaciones» (lines «Cobertura de temas» and «Tasa de implementación»), «Historial de comprobaciones» («Una entrada por escaneo comprobado (las 8 más recientes como máximo).»).
   - SEO block only, **«Optimización de tu página Home»** (badge «Nuevo»):
     - Device toggle «Móvil» / «Escritorio»; vitals «Carga del contenido principal», «Respuesta al tocar» / «Respuesta al hacer clic», «Estabilidad visual»; ratings «Bueno / Mejorable / Lento».
     - Data source: «Datos de usuarios reales de Chrome…» or «Medición de laboratorio: …».
     - Empty: «Google no respondió en esta revisión. Lo volveremos a intentar en la próxima.»
   - **«Problemas»** tab, «Primero lo que más te frena»:
     - Issue rows: severity dot, label (e.g. «Datos estructurados», «Un solo <h1> por página», «Intro respuesta-primero», «Acceso de bots de IA», «llms.txt», «sitemap.xml», «Velocidad en móvil», «HTTPS y redirecciones»…), points or «sin puntos», badge «Solución disponible».
     - Expanded issue: «Por qué importa», «Cómo arreglarlo», «Páginas afectadas» / «Bots bloqueados», plus copyable fix blocks («Copiar» / «Copiado», «Descargar», «Sustituye «x» por tu texto antes de publicarlo.»).
     - Empty: «Ningún problema en este bloque en la última revisión.»
   - **«Correcto»** tab: «Lo que ya está bien» / «Cumple en todo lo que revisamos». Empty «Todavía no hay ninguna comprobación de este bloque que cumplan todas tus páginas.» GEO also shows «Temas que la IA ya cita».
   - **«Páginas»** tab: «Páginas revisadas», «{Nota GEO | Salud SEO} de cada página · toca una para ver qué mejorar».
     - Page rows: score, freshness label «Actualizada / Empieza a desactualizarse / Desactualizada / Sin fecha detectada», «Sin medir», «Tiempo de respuesta: {n} ms · Tamaño HTML: {n} KB», skipped reasons «Descartada: …».
     - Note for old audits «Esta revisión es anterior al 13 jul 2026…».
6. **Side column:**
   - Scope note: «**Esto es lo que vemos desde fuera.** Revisamos las páginas clave de tu web: la portada, las que hemos verificado y las que cita la IA. No rastreamos la web entera.»
   - GEO: **«Acceso de bots de IA»** card. Rows per bot, e.g. «OpenAI (ChatGPT)», «OpenAI (búsqueda)», «Google (Gemini)», «Perplexity», «Anthropic (Claude)», «Anthropic (legado)», «Microsoft (Copilot/Bing)», each with badge «Permitido» or «Bloqueado». Then «llms.txt» and «sitemap.xml» with «Encontrado / No encontrado / Sin comprobar / No es un sitemap / Índice de sitemaps».
   - SEO: **«Cómo se calcula tu Salud SEO»** with groups «Comprobaciones de siempre / Nuevas / Sin puntos».

---

## 10. Posición en Google: /search-console
**Header:** kicker «Posición en Google», name, domain. When ready, the right side shows a live chip «Search Console conectado · últimos 28 días» (compact «Últimos 28 días»).

**Intro:** «En qué puesto sales en Google, para qué búsquedas y qué hacer para subir.»

**Outcome banner (`?gsc=`):**
- «Search Console conectado. Ya ves tus datos reales de Google.»
- «Search Console desconectado. Hemos borrado el acceso de GenScore.»
- Warn texts: «No se conectó: en Google se canceló el permiso…», «Esa propiedad no corresponde a este dominio.», among others.

**States:**
- Not configured: «Muy pronto podrás conectar tu Search Console» / «Estamos terminando de activar la conexión con Google. Mientras tanto, la Auditoría SEO ya revisa tu web.»
- **Connect (`.gsc-lock` / `.gsc-cbox`):**
  - «Conecta tu Search Console» / «Es la herramienta gratuita de Google para tu web. Con ella te enseñamos:»
  - 3 bullets:
    - «En qué puesto sales para cada búsqueda y cómo evoluciona en el tiempo.»
    - «Las búsquedas en las que sales en las primeras páginas con las keywords más relevantes. Oportunidad de posicionarlas mejor.»
    - «Qué páginas tiene Google indexadas y cuáles no. Importante para complementar lo que los motores de IA ven de tu marca.»
  - Google button «Conectar con Google».
  - Fine print «Sólo lectura: no cambiamos nada de tu cuenta. Google te enseñará un aviso de app en revisión; es normal mientras verifica GenScore. ¿Tu web aún no está en Search Console? Cómo darla de alta.»
- Reconnect: the same box with «Vuelve a conectar tu Search Console» plus a permission or revoked lead.
- Pick property: «¿Qué propiedad de Search Console usamos?» + «Usar esta propiedad». If none match: «La cuenta que has conectado no tiene ninguna web verificada en Search Console.» or «…tiene otras webs verificadas, pero ninguna es este dominio.» + «Conectar otra cuenta».
- Error: «Google no ha respondido esta vez» + a quota or generic sentence.
- Empty: «Google todavía no tiene datos de tu web» / «En los últimos 28 días tu web no ha salido en ninguna búsqueda de Google, o la propiedad es muy reciente. Search Console tarda unos días en empezar a contar.»
- **Loading (`gsc-loading`):** illustrated skeleton with tag «tu web», «**Obteniendo tus datos de Google Search Console…**», «Tus búsquedas, tu puesto y tus páginas de los últimos 28 días.»

**Data, in order:**
1. **«Tu posición en Google»** («Últimos 28 días»):
   - «Puesto medio» {x}, «En los 28 días anteriores estabas en el {x}.» (or «Sin periodo anterior para comparar.»), «Es la media de todas las veces que te buscan entre las veces que apareces.»
   - «Dónde salen tus búsquedas»: tier bars.
   - «Evolución del puesto medio», «Mejor arriba ↑».
2. **KPIs:** «Clics» and «Impresiones», each «±% vs 28 días antes» or «sin periodo anterior»; «Páginas indexadas» «{n} fuera / Todas dentro de las revisadas».
3. **Two charts:**
   - «Clics e impresiones», legend «Clics (eje izquierdo)» / «Impresiones (eje derecho)».
   - «Búsquedas por página de Google», «Cada punto es una búsqueda», bands «Página 1 / Página 2 / Página 3», axes «Puesto en Google →» and «Impresiones». Note «Las búsquedas de la franja azul están en la página 2 (puestos 11 a 20)…» or «Ahora mismo no tienes búsquedas en la página 2 de Google.»
4. **«Las búsquedas que te traen visitas»** («Datos con 2–3 días de retraso, como en Search Console»):
   - Filter pills «Todas» · «Página 1» · «Página 2 (puestos 11–20)».
   - Columns «Búsqueda | Puesto | Clics | Impresiones | CTR | Página que sale»; flag «Página 2»; movement «nueva».
5. **«Tus páginas en Google»** («Las que más visitas traen»): columns «Página | Puesto medio | Clics | Impresiones | Búsquedas | Auditoría SEO» («Sin auditar / Correcta / …»).
6. **Grid:**
   - «Te ven, pero no entran» («Muchas impresiones, pocos clics»).
   - «Preguntas que te hacen en Google» («Búsquedas con forma de pregunta», buttons «Vigilar prompt» / «Prompt vigilado»).
7. **Grid:**
   - «Móvil y ordenador» («Puesto medio por dispositivo»).
   - «Dos páginas compiten por la misma búsqueda» («Canibalización»).
8. **Footer:** «Propiedad: {x} · Desconectar» (confirm «¿Desconectar Search Console de este dominio? Dejarás de ver tu posición en Google.», pending «Desconectando…»).

---

## 11. Escaneos
- **/runs** redirects to **/debug**. Internal screen, not in the menu, header tag «Interno · No enlazada desde el menú · pantalla de operación».
  - Section «Controles» / «Qué trabajo automático gasta IA en este dominio». Switches: «Escaneo automático diario», «Cobertura por IA tras cada escaneo», «Auditoría técnica tras cada escaneo», «Suelo de muestreo en escaneos», engine switches «Motor: Gemini / Claude / OpenAI / Perplexity», «Ocultar los avisos de la banda superior», and «Eliminar este dominio» («Borra el dominio y todo su historial. No se puede deshacer.»).
  - Section «Historial de escaneos»: table «Fecha | Estado | Lanzamientos | Auditoría | GEO Score | Δ Score».
  - Empty: «Todavía no hay escaneos» + «Lanzar escaneo», «Revisar prompts», «Revisar competidores».
- **/runs/[runId]** (legacy-styled cards): kicker «Escaneos», h1 «Detalle del escaneo», «Volver al dominio».
  - Cards «Resumen del escaneo» (button «Ejecutar este escaneo»), «Resultados por prompt», «Puntuaciones», «Evidencia de extracción», «Recomendaciones».
  - Each card has an EmptyState, e.g. «Todavía no hay resultados».

---

## 12. Dominios, onboarding wizard and first-scan mission
### /dashboard/domains
- Head: kicker «Espacio de trabajo», h1 «Dominios», count «{n} activos». Right-side state pill: «Escaneando {dominio}», «Analizando …», «{n} dominios en curso», «Auditando {dominio}» or «{n} auditorías en curso».
- **Hero card (selected domain), a link to its overview:**
  - Trash button opening the delete modal.
  - 56px favicon, name, «domain · country · language», clock «Último escaneo: hoy, 10:42 / ayer, … / 3 oct», «Escaneo en curso» or «Sin escaneos todavía».
  - Flags «En progreso» or «Auditando».
  - Semi gauge 140px labelled «Puntuación GEO» (or «—»). Copy: «El análisis GEO evalúa tu dominio en visibilidad generativa y presencia de marca.» or «Todavía no hay puntuación: en cuanto termine el primer escaneo, aquí verás cómo te nombran las IA.»
  - CTA «Ver visión general →».
- **Grid of the other domains:** each card has a favicon, name, domain, score, delta, and a chip «Escaneando / Auditando», a fresh chip (hoy/ayer) or a stale chip (date). Clicking a card selects it (`?active=`); it does not open the project.
- **Add tile:** «+», «Añadir dominio», «Se escanea desde el primer día».
- **Empty:** globe icon, «Todavía no tienes ningún dominio» / «Añade el primero y empezamos a medir cómo te nombran las IA. Se escanea desde el primer día, sin que tengas que lanzarlo tú.» + «Añadir dominio».
- **Delete modal:** «Eliminar dominio» / «Vas a eliminar **{dominio}** de forma **permanente e irreversible**. Se borrarán también todos sus datos asociados: escaneos, prompts, competidores, recomendaciones y soluciones generadas. Esta acción no se puede deshacer.» / «Cancelar» / «Eliminar definitivamente» (pending «Eliminando…»).

### /dashboard/projects/new (`onboarding-wizard.tsx`)
- Kicker «Nuevo dominio»; stepper «Dominio · Competidores · Prompts».
- **Right panel «Resumen del lanzamiento»** on every step: rows «Dominio», «Idioma» («· detectado»), «Motores», «Competidores», «Prompts» (each «Pendiente» until known); «{n} respuestas estimadas en el primer escaneo» or «El total de respuestas aparecerá aquí cuando elijas tus prompts.»
- **Step 1, domain:**
  - h1 «Añade un dominio»; sub «Lo leemos, te proponemos competidores y prompts, y lanzamos el primer escaneo en los motores de tu plan.»
  - Field «Dominio» (placeholder «introduce tu dominio»), country select (title «País de análisis»: España, México, Argentina, Colombia, Estados Unidos, Reino Unido, Alemania, Francia, Italia, Portugal, Brasil), «Continuar».
  - Hints «Escribe solo el dominio, sin https:// ni rutas. Ejemplo: miempresa.com», error «Introduce un dominio válido, p. ej. miempresa.com», «Elige el país cuyo mercado quieres analizar.», engines row «Motores».
  - Loading: h1 «Leyendo {dominio}», «Buscamos con quién compites y qué te preguntarían de verdad en un chat de IA. Unos 15 segundos — no cierres ni recargues esta pestaña.», animated checklist «Leyendo el contenido de {dominio}» → «Buscando competidores relevantes» → «Generando prompts de monitorización con IA», «No cierres ni recargues esta pestaña.»
  - Limit or read-only error: «Tu prueba de Pro ha terminado. Elige un plan en Ajustes para añadir dominios y volver a escanear.» or «Has alcanzado el límite de dominios de tu plan actual. Sube de plan para añadir más.»
- **Step 2, competitors:**
  - «← Volver al dominio»; h1 «Tus competidores»; «Analizamos **{dominio}** e identificamos tus principales competidores para monitorizar cómo te comparas en las respuestas de IA. Si algo no encaja, edítalo o elimínalo.»
  - Label «{n} competidores (máximo {max})». Rows: favicon, name (or «Sin nombre»), edit and remove icons; edit mode with placeholders «Nombre» and «dominio.com».
  - «Añadir competidor», «Podrás cambiarlos cuando quieras.», «Atrás», «Continuar a prompts».
  - Fallback notice: «No hemos podido sugerir competidores automáticamente para este dominio. Añádelos a mano — el escaneo funciona igual y podrás cambiarlos cuando quieras.»
- **Step 3, prompts:**
  - h1 «Revisa tus prompts»; «Cada prompt se lanza a todos los motores de tu plan. Quita los que no te representen — recomendamos al menos **{n}** para obtener mejores datos.» (or «Tu plan cubre hasta {n} — con {Plan} monitorizas {m}.»)
  - Prompts grouped by category; rows editable (placeholder «Ej. ¿Cuáles son las mejores herramientas para…?», «Prompt vacío»).
  - «Generar {n} más» (pending «Generando…»), «Añadir prompt», «Atrás», primary «Crear dominio y escanear».
  - Creating state: label «Lanzando», checklist «Guardando tu dominio y configuración» → «Creando tus prompts y competidores» → «Lanzando tu primer escaneo», button «Creando…».
- Wizard errors: «Revisa los datos del dominio e inténtalo de nuevo.», «No se pudo crear el dominio. Inténtalo de nuevo.», «Ya tienes este dominio activo para ese país e idioma.»

### First-scan mission (`scan-mission-rocket.tsx`)
- Full-bleed `section.mrk-full`. It turns to a night palette for the «En órbita» and «Cerrando la misión» beats.
- **Rail** (fixed for the whole mission): «✓ **{dominio}** dado de alta» on the left; «{n} prompts · {n} pasadas · {n} motores · {N} respuestas» on the right.
- **Canvas:** SVG rocket scene on the left; on the right a copy column with eyebrow, huge title, unit, subtitle and joke.

| Beat | Eyebrow | Title | Unit | Subtitle | Joke |
|---|---|---|---|---|---|
| rampa | «En la rampa» | «Preparando tu primer escaneo» | — | «Un momento — estamos colocando la cola de trabajo.» | «Tú no tienes que hacer nada.» |
| ignicion | «Ignición» | «Motores encendidos» | — | «Gemini, Claude y ChatGPT, preguntados a la vez.» | «Los tres a la vez. Sí, se puede.» |
| ascenso | «Ascenso» | «{n} de {N}» | «lanzamientos» | «Puedes irte tranquilo: seguimos trabajando aunque cierres esta pestaña.» | «Esto no se cae.» |
| orbita (night) | «En órbita» | «{n} de {N}» or «Abriendo la carga» | «respuestas leídas» | «Extraemos de cada respuesta las menciones, las posiciones y las citas.» | «Traerlas era la mitad del viaje.» |
| entrega (night) | «Cerrando la misión» | «Casi está» | — | «Estamos calculando tu puntuación GEO.» | — |

- No score is shown at the end; the page refreshes once the run finishes.

---

## 13. Ajustes: /dashboard/settings
- Head: kicker «Espacio de trabajo», h1 «Ajustes». Pill «Plan {Nombre}» or «Sin plan · solo lectura», plus « · {n} días de prueba».
- **Two columns:**
  - Left: sticky index `nav.set-idx` (aria «Secciones de ajustes») with entries «Cuenta» (name or email), «Plan» (plan label, with the struck-through founder price when applicable), «Notificaciones» («{n} activos»).
  - Right: the sections below.
- **«Cuenta» (#cuenta):**
  - Identity row: avatar initials, full name (or «Tu cuenta»), email.
  - Fields «Nombre», «Apellidos», «Email» (locked, «Es tu identificador de acceso.»).
  - Fold «Datos de facturación»: «Empresa o Razón social», «NIF/CIF». The company fold «Datos de empresa» (Opcional: Nombre, Sitio web, Sector) exists but is not rendered.
  - «Guardar» (pending «Guardando…»); feedback «Cambios guardados.»
  - Row «Contraseña» + «Cambiar»: fields «Contraseña actual», «Nueva contraseña», «Confirmar nueva contraseña»; «Guardar contraseña» / «Cancelar»; errors «La nueva contraseña debe tener al menos 8 caracteres.» and «Las contraseñas no coinciden.»; success «Contraseña actualizada.»
- **«Plan» (#plan, admin only):**
  - Checkout banners: «Pago completado. Tu plan se está activando — esto debería tardar solo unos segundos.» or «No se ha completado el pago. Tu plan no ha cambiado.»
  - Trial banner (warn, clock): «Estás probando **Pro** gratis — te quedan **{n} días**. Cuando termine, tu cuenta pasará a solo lectura si no contratas antes.» + «Contratar ahora».
  - Over-capacity banner: «Tienes **{n}** dominios activos y tu plan {P} permite **{c}**. Elige cuáles mantener activos.» + «Elegir dominios».
  - **«Tu plan»** / «Facturación mensual»:
    - Status badge «Activo», «Solo lectura: sin escaneos nuevos» or «Cancelada — activa hasta el {fecha}».
    - Card: plan name + «Plan actual», price «{p} €/mes» (promo shows the old price struck through and the new one), tagline, «Precio fundador **para siempre**, mientras mantengas tu suscripción.» or «Precio fundador si contratas ahora: {x} €/mes **para siempre**, mientras queden plazas. Precio normal: {p} €/mes.», highlights checklist.
    - Buttons «Elegir plan» / «Cambiar de plan», «Facturas y pago», «Cancelar suscripción» (pending «Abriendo…»).
    - Cancelled: «Tu suscripción está cancelada. Mantienes acceso a {P} hasta el {fecha}; después tu cuenta pasará a solo lectura. ¿Cambiaste de idea? Puedes reactivarla en el portal de Stripe.» + «Reactivar suscripción».
  - **«Uso de este ciclo»:** «Prompts monitorizados» {n}/{cap} and «Dominios» {n}/{cap}; warning «Cerca del límite del plan».
  - Agency upsell card: «¿Gestionas varios clientes? El plan Agencia es para ti» / «Dominios y prompts a medida (~300 de referencia), los mismos motores de IA que Pro, onboarding acompañado. Precio a medida — hablamos contigo y lo ajustamos a tu cartera.» + «Comparar planes →» (/precios).
- **«Notificaciones» (#avisos):** 4 toggles plus one fixed row.
  - «Caída de puntuación» — «Cuando tu puntuación baja 10 puntos o más en dos escaneos».
  - «Resumen semanal» — «Los lunes, la evolución de cada dominio».
  - «Primer escaneo listo» — «Una vez, cuando termina tu primer escaneo».
  - «Consejos, novedades y ofertas» — «Cómo sacarle partido a GenScore y promociones».
  - Fixed row: «Tu cuenta y facturación» — «Seguridad, pagos y cambios de plan. Siempre activos.» (switch on and disabled).
- **Foot:** «Eliminar cuenta» / «Esta acción es irreversible. Se borrará el historial y todos los datos asociados a tu cuenta.» + button «Eliminar cuenta». Modal «Eliminar cuenta», «Esta acción es irreversible. Se eliminarán tu cuenta, todos tus proyectos, escaneos,…», «Cancelar», «Eliminar cuenta definitivamente» (pending «Eliminando…»).

### «Cambiar de plan» modal (`change-plan-modal.tsx`, `.cp-modal`)
- **Step "plans":**
  - Title «Cambiar de plan». Sub «Revisa qué cambia antes de confirmar» or «Vas a completar el pago en Stripe». Close button (aria «Cerrar»).
  - Radio group of plan cards. Each card: flag «Plan actual» or «✦ Recomendado», name, price, tagline, meter chips «Dominios», «Prompts monitorizados ~n», «Motores de IA», «Frecuencia de escaneo».

| Plan | Price | Tagline | Meter | Highlights |
|---|---|---|---|---|
| **Sin plan** | «Solo lectura» | «Ves tus datos, sin escaneos nuevos» | 1 / 10 / 1 / «Sin escaneos» | — |
| **Starter** | 29 €; founder 20 € (shown as 29 € struck through, 20 €/mes) | «Empieza a monitorizar» | 1 / 25 / 3 / «Semanal» | «1 dominio · ~25 prompts», «3 motores de IA (Gemini, Claude y ChatGPT)», «Escaneo semanal + evolución», «Bucle de acción básico», «Credibilidad de medición visible» |
| **Pro** (recommended) | 99 €; founder 69 € | «El bucle de acción completo» | 5 / 100 / 4 / «Diario» | «5 dominios · ~100 prompts», «4 motores de IA (ChatGPT, Gemini, Claude y Perplexity) · escaneo diario», «Nuevos motores incluidos sin coste extra cuando se publiquen», «Bucle de acción completo», «Generador de soluciones (FAQ, schema, briefs)» |
| **Agencia** | «Plan a medida» | «Escala multi-cliente» | «A medida» / 300 / 4 / «Diario» | Not selectable: a sales block with «Hablar con ventas →» (mailto) |

  - Note for paid-to-paid changes: «Cambiar entre X y Y se gestiona en el portal seguro de Stripe, donde también puedes cancelar o ver tus facturas.»
  - Foot note «Selecciona un plan distinto al actual.», «Se gestiona en el portal seguro de Stripe.», «Se abre el pago seguro de Stripe.» or «Se aplica de inmediato al confirmar.»; buttons «Cancelar» and «Continuar» / «Ir al portal de Stripe» (pending «Abriendo portal…»).
- **Step "checkout":** «Actual» (current plan) → «Nuevo» (price «/mes · para siempre»), «Atrás», «Ir a pagar» (pending «Abriendo Stripe…»).
- **Step "downgrade":** «Bajada de plan», Actual → Nuevo, «Dominios a retirar» checklist («Los dominios que elijas dejan de monitorizarse y salen de tu espacio de trabajo. …»), «Efectivo **de inmediato**», «Atrás», «Confirmar cambio» (pending «Guardando…»).
- **Step "overage":** title «Ajusta tus dominios activos» / «Elige qué dominios mantener activos», «Tienes **n** dominios activos y tu plan **P** permite …», list, «Confirmar retirada».
- **Step "done":** «Cambio confirmado» / «Todo listo», h3 «Ya estás en {Plan}» or «Dominios actualizados», «Entendido».

---

## 14. Overlays, gates and shared components
- **Product tour (`product-tour.tsx`, via TourProvider):**
  - Opens automatically on first access; reopen it from the sidebar «¿Cómo funciona?». Modal variant.
  - Close button «✕» (aria «Cerrar el tour»); eyebrow «Tour de bienvenida»; title «Aprende cómo funciona».
  - Rotating subtitle across 8 steps:
    1. «Escribe tu dominio y GenScore te propondrá **a quién vigilar y qué prompts lanzar**. No hay que configurar nada más.»
    2. «Todos tus prompts se analizan en **Gemini, Claude y ChatGPT**. …»
    3. «Tu **GEO Score** mide la capacidad de tu web y tu marca para aparecer de forma optimizada en los motores de IA.»
    4. «Tu dominio **se escanea continuamente** …»
    5. «El algoritmo de GenScore encontrará **acciones concretas** …»
    6. «GenScore se encarga también de **generarte una solución** …»
    7. «Además GenScore **auditará técnicamente tu web** …»
    8. «El siguiente escaneo detectará las mejoras aplicadas … **Recalculará tu puntuación** …»
  - Animated mini-app stage with a fake sidebar (labels «Analizar», «Actuar»; items Visión general, Prompts, Competidores, Auditoría SEO, Recomendaciones) and scenes: «Nuevo dominio», «Respuestas recogidas», «Visión general», «Evolución de tu GEO Score», «Recomendaciones», «Añade un FAQ a /precios» / «FAQ generado · listo para pegar» / «Copiar HTML», «Auditoría SEO», «Franja «medio»», «2 ajustes nuevos». A fake cursor and ripple animate through them.
  - Footer: step dots (aria «Paso n de 8»), link «¿Qué es el GEO?» (/geo), «← Atrás», «Siguiente →», and on the last step «Ir a mi panel».
- **Domain overage gate (`domain-overage-gate.tsx`):** blocking, with no close, no Escape and no click-outside. Rendered above everything, including the sidebar, on every dashboard page.
  1. «Tu plan no cubre todos tus dominios» / «Tienes **n** dominios activos y tu plan **P** permite **c**. Antes de seguir, elige cómo quieres continuar.» Two options: «Retirar dominios» («Elige cuáles conservar. Los demás se eliminan de forma permanente.») and «Subir de plan» («Sube a un plan con más capacidad y conserva tus n dominios tal cual.»).
  2. «Elige qué dominios retirar», list, «El siguiente paso pide confirmar — nada se borra todavía.», «Atrás», «Continuar».
  3. «Vas a eliminar n dominios» / «Esta acción es **permanente** — no se puede deshacer.» / «Se borra todo lo asociado a cada uno» (per item: «{dominio} — escaneos, prompts, competidores, recomendaciones y soluciones generadas») / checkbox «Entiendo que esta acción no se puede deshacer.» / «Prefiero subir de plan en su lugar» / «Atrás» / «Eliminar definitivamente».
  4. Done: «Dominios actualizados» + «Entendido».
  5. Upgrade path: «Sube de plan», plan radios, «Hablar con ventas», «Se abre el pago seguro de Stripe», «Atrás», «Continuar».
- **Read-only / trial expired:** the top band (§2), bell lane, settings pill and plan badge, scan-button error, wizard block, and feedback `read_only`. Data screens stay fully viewable.
- **Confirmation dialogs:** delete domain (§12), delete prompt (§5), delete account (§13), unfollow competitor or remove alias (inline «¿Seguro?»), disconnect GSC (window.confirm), overage gate.
- **Toasts / alerts:** there is no toast library. Feedback uses:
  - `p.feedback` (error, success or warn-styled) at the top of a page;
  - `ActionAnnouncement` inline after an action («Propuesta generada.», «Marcada como hecha.», «Restaurada.»);
  - `field-err` under buttons;
  - `GscOutcome` banners;
  - dashed `.section-empty` / `EmptyState` boxes for empty states.

---

## 15. Current design tokens
- **Fonts** (next/font, `app/layout.tsx`):
  - Hanken Grotesk → `--font-sans` (default UI).
  - Bricolage Grotesque 700/800 → `--font-display` (titles, Overview).
  - Figtree 400/500/600 → `--font-body` (body inside `.ov2-scope`, `.set-scope`, `.onb2-scope` and auth).
  - JetBrains Mono → `--font-mono` / `--mono` (domains, numbers).
- **Base tokens (`:root`, `app/globals.css`):**
  - Surfaces and lines: `--canvas #f6f7f9`, `--surface #fff`, `--surface-2 #fbfbfd`, `--surface-sunk #f6f7f9`, `--line #e8eaef`, `--line-soft #eef0f4`, `--line-strong #c8ccd6`.
  - Ink: `--ink #0f1729`, `--ink-2 #475067`, `--ink-3 #6b7385`, `--ink-4 #98a0b0`.
  - Accent: `--accent #4f46e5`, `--accent-soft #eef2ff`.
  - Status: `--pos #15915a`, `--warn #c47e12`, `--warn-soft #fdf3e2`, `--warn-ink #9a6312`.
  - Radii `--r-sm 8 / md 10 / lg 14 / xl 18`; shadows `--sh-1`, `--sh-2`, `--sh-pop`.
  - Layout: `--sidebar-w 248px`, `--header-h 52px`, `--page-max-w 1320px`, `--page-pad-x 34px`, `--drawer-w 288px`.
- **Brand v3 tokens (BRAND-5):**
  - `--brand-ink #0b1426`, `--brand-ink-2 #3b4759`, `--brand-ink-3 #5b6b82`, `--brand-ink-4 #98a2b3`.
  - `--brand-blue #2563eb`, `--brand-blue-2 #4f7bff`, `--brand-blue-soft rgba(37,99,235,.10)`, `--brand-cyan #09c5d6`.
  - `--brand-warm #ffb020` (logo dot only; banned from UI).
  - `--brand-canvas #f7f8fb`, `--brand-canvas-dark #081223`, `--brand-surface-dark #0f1c33`, `--brand-line #e7eaf0`.
  - `--brand-pos #15915a` / soft `#e7f6ee`, `--brand-neg #d23b48` / soft `#fdecee`.
  - `--brand-shadow-card`.
  - Inside `.ov2-scope`, `.set-scope` and `.onb2-scope` (and other redesigned scopes), `--ink*`, `--line*` and `--accent` are remapped to the brand tokens, so the accent becomes blue #2563eb.
- **Engine colours:** ChatGPT #10a37f, Gemini #4285f4, Claude #d97757, Perplexity #20808d.
- `app/console.css` holds console-only selectors and loads after `globals.css`. It adds no new brand variables.

---

**Key files:**
- `/home/claude/GEO-Tool/app/dashboard/layout.tsx`
- `/home/claude/GEO-Tool/components/{sidebar,workspace-topbar,console-header,mobile-shell,notification-bell,notifications-page-client,data-maturity-banner,scan-mission-rocket,scan-in-progress,onboarding-wizard,product-tour}.tsx`
- `/home/claude/GEO-Tool/lib/notifications/{render,account-notice,next-step,lanes}.ts`
- `/home/claude/GEO-Tool/app/dashboard/projects/[projectId]/{page,scan-report-control}.tsx` and `/_components/{seo-audit-card,gsc-overview-half}.tsx`
- `/home/claude/GEO-Tool/app/dashboard/projects/[projectId]/{prompts,competitors,recommendations,citations,web-audit,search-console,debug,runs}/`
- `/home/claude/GEO-Tool/components/prompts/prompt-drawer.tsx`
- `/home/claude/GEO-Tool/app/dashboard/domains/page.tsx`
- `/home/claude/GEO-Tool/app/dashboard/settings/page.tsx`
- `/home/claude/GEO-Tool/components/settings/*`
- `/home/claude/GEO-Tool/components/billing/{plan-billing-section,change-plan-modal,domain-overage-gate}.tsx`
- `/home/claude/GEO-Tool/app/pricing/plans-data.ts`
- `/home/claude/GEO-Tool/lib/onboarding/tour-steps.ts`
- `/home/claude/GEO-Tool/app/globals.css`
- `/home/claude/GEO-Tool/app/console.css`
- `/home/claude/GEO-Tool/app/layout.tsx`