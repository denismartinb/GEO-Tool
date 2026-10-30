# App de Android (TWA) · ANDROID-TWA-1

La app es la propia web móvil de genscore.es abierta en Chrome a pantalla completa
(Trusted Web Activity). No hay un segundo frontal: cada despliegue de Vercel
actualiza la app sin pasar por Google Play. Decisión y reglas en
`docs/brand/design-decisions-log.md` §381.

## Regla de Google Play: la app no vende

Dentro de la app no hay precios, ni «Cambiar de plan», ni checkout de Stripe, ni
texto que mande a pagar fuera. Se puede registrar quien quiera (la prueba de Pro
de 7 días no pide tarjeta) y quien ya paga entra con su cuenta. Contratar se hace
en genscore.es, fuera de la app, con los correos de fin de prueba.

Lo hace la web sola cuando detecta la app: `start_url` lleva `?source=twa`, el
middleware guarda la cookie `gs_app` y, mientras exista, solo sirve consola,
acceso y lo legal (`lib/app-mode.ts`). Para probarlo en un navegador normal:
`https://www.genscore.es/dashboard?source=twa`; para salir, `?source=web`.

## Construirla (una vez, en el ordenador de Denis)

Requisitos: Node 18+, JDK 17 y el SDK de Android (Bubblewrap los descarga la
primera vez).

```bash
npm i -g @bubblewrap/cli
cd twa
bubblewrap init --manifest=https://www.genscore.es/manifest.webmanifest   # o usa twa-manifest.json
bubblewrap build        # genera app-release-bundle.aab y app-release-signed.apk
```

`twa-manifest.json` de esta carpeta ya trae paquete (`es.genscore.app`), URL de
arranque, iconos y colores. La clave de firma (`genscore-upload.keystore`) se
crea en `bubblewrap init`; **no se sube al repositorio** (guárdala y haz copia:
sin ella no se puede actualizar la app).

## Verificar el dominio (Digital Asset Links)

Para que Chrome no enseñe la barra de direcciones, `genscore.es` tiene que
declarar la huella de la clave de firma:

1. `bubblewrap fingerprint` (o Play Console → Integridad de la app → Firma de la
   app → huella SHA-256 del certificado de **firma de app**).
2. En Vercel, variable `ANDROID_SHA256_CERT_FINGERPRINTS` con las huellas
   separadas por comas (la de subida y la de Play App Signing).
3. Comprobar `https://www.genscore.es/.well-known/assetlinks.json`.

## Publicar

1. Cuenta de Play Console (25 $, pago único).
2. Subir `app-release-bundle.aab` a una prueba interna y luego a producción.
3. Ficha: nombre «GenScore», icono 512, capturas de móvil (las de la barra
   flotante) y la URL de privacidad `https://www.genscore.es/privacidad`.
4. Formulario de «Contenido de la app»: la app **no ofrece compras ni
   suscripciones dentro de la app** (cuentas creadas, sin cobro).

Las condiciones de Google cambian: revisa la política de pagos el día de enviarla.
