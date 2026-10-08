# Vista previa aislada (PREVIEW-LOCKDOWN-1): qué es y qué se comprobó

Rama `preview/contract-99-ui` (derivada de `feat/contract-99-local`, **no se fusiona**). Es una ayuda de revisión para ver el
precio de 99 € y los correos corregidos sin que nada pueda escribir en producción.

**Todo lo de este directorio es RENDER LOCAL del build de esta rama con `VERCEL_ENV=preview`, un falso Supabase («tripwire») y claves
ficticias. No es el despliegue de Vercel (no tengo acceso: la API de Vercel responde 403 y el proxy bloquea el host) y una imagen no
prueba interacción.**

## Las barreras (en el camino de la petición, antes de cualquier código de la aplicación)
1. **Denegado por defecto** (`lib/preview-lockdown.ts`, ejecutado al principio de `middleware.ts`): solo GET/HEAD sobre una lista cerrada de
   páginas públicas. Todo lo demás responde 403: API, acciones de servidor (siempre POST), consola, administración, registro, acceso,
   callback de auth, baja de correo, crons.
2. Una ruta bloqueada **no crea el cliente de Supabase**: el 403 se decide antes.
3. El matcher del middleware cubre **todas** las rutas (el de producción dejaba fuera `/api/gratis`, docs, comparativas…), sin exclusión por
   extensión (un segmento dinámico acabado en `.png` no se escapa).
4. Cabecera `Content-Security-Policy: connect-src 'self'; form-action 'self'`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`.
5. Con `VERCEL_ENV=production` el bloqueo se apaga (la rama no es para producción). Fuera de producción, incluidos local y tests, está activo.

## Pruebas locales (`capture.cjs`, `network-log.json`)
- Un falso Supabase escucha en `127.0.0.1:39999` y registra **cualquier** petición. Tras construir y servir la rama con esa URL, y tras la matriz
  de abajo y las capturas, **recibió 0 peticiones**.
- Permitido (200): `/`, `/pricing`, `/docs/planes-y-limites`, `/blog`, `/preview/index.html`, `/preview/emails/trial-d5.html`, `/robots.txt`, un PNG de marca.
- Bloqueado (403): `GET /api/me`, `/api/gratis/comprobar`, `/api/cron/weekly-scans`, `/api/webhooks/stripe`, `/dashboard`, `/dashboard/settings/billing`, `/admin`,
  `/login`, `/signup`, `/auth/callback?code=x`, `/baja`, `/debug`, `/api/algo/cualquiera.png`, `/docs/../api/me`, `/API/ME`; y **POST/PUT/PATCH/DELETE**
  sobre `/`, `/pricing`, `/api/gratis/comprobar`, `/api/webhooks/stripe`, `/signup`, `/dashboard/settings/billing` (incluido un POST con cabecera de acción de servidor).
  `//api/me` redirige (308) y el destino da 403.
- Navegador (Chromium): en `/pricing` 390/768/1280 y `/` 390/1280, **0 peticiones a hosts que no sean localhost**, 0 peticiones no-GET,
  `/api/me` y `/api/favicon` (solo GET) responden 403 (el icono de las marcas de la maqueta no carga: esperado). 0 px de desbordamiento horizontal del documento.
- Pulsar el CTA «Empezar gratis»/«Probar Pro» lleva a `/signup` → 403 con la página «Vista previa aislada» (`cta-click-1280.png`).

## Límites (sin esconderlos)
- **No he podido ver las variables del entorno Preview de Vercel**, ni los despliegues: la API de Vercel responde 403 («re-authenticate to this scope»).
  Por eso la barrera no depende de esas variables: no hay ruta de escritura servida, y no se asume que las claves sean de prueba.
- **No he podido abrir el despliegue real** (host bloqueado desde esta sesión): lo que se comprobó es el mismo código servido en local. Que Vercel aplique el
  middleware igual en el borde, y que `process.env.VERCEL_ENV` valga `preview` allí, **no está verificado**.
- Es un chivato de revisión, no un producto de seguridad: no protege si alguien promueve esta rama a producción (entonces el bloqueo se apaga a propósito).
  Las llamadas del servidor a Sentry (errores) no se bloquean. El acceso a la vista previa lo protege Vercel (inicio de sesión del equipo).
- No demuestra el checkout, el IVA real de Stripe, la prueba de 14 días ni dispositivos reales.
