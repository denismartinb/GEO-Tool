# Plugin de WordPress de GenScore (WP-PLUGIN-1)

Canal de captación propuesto por Denis el 2026-11-01: un plugin gratuito para
el directorio de WordPress.org que revisa la web desde wp-admin y lleva a la
prueba de 7 días de Pro. Histórico: `docs/brand/design-decisions-log.md` §418.

- Task Intake: https://claude.ai/artifact/NxpYX8di54nDqV79sHoiLe
- UX aprobada (Resumen · GEO · SEO · Agentes, claro, estilo de la extensión):
  https://claude.ai/artifact/SWiUHkL5RrD7crtzQx1Zi6

## Qué hay aquí

| Ruta | Qué es |
|---|---|
| `genscore/` | El plugin tal cual se sube (zip de esta carpeta). |
| `genscore/includes/robots.php` | Reglas de bots de IA sobre el robots.txt de WordPress. Pura, con tests. |
| `genscore/includes/llms.php` | Genera y sirve `/llms.txt` si nadie más lo hace. |
| `genscore/includes/site.php` | Hechos del sitio (plugin SEO, sitemap, HTTPS…) y páginas que revisar. |
| `genscore/includes/admin.php` | Pantalla, tres acciones AJAX y widget del escritorio. |
| `genscore/assets/vendor/` | `collect.js` y `score.js` de la extensión, **copiados byte a byte**. |
| `tests/robots-test.php` | Tests en PHP plano; los corre `tests/wordpress-plugin.test.ts`. |

## Fase 1 (esta)

Plugin autónomo. No llama a genscore.es: sólo enlaces con UTM
(`utm_source=wordpress`). «Analizar dominio» abre `/signup?dominio=<web>`, y el
alta guarda ese dominio para el asistente igual que el hero de la portada.

## Fase 2 (sin aprobar)

Token por sitio y `/api/wp/project` para pintar en wp-admin las cifras de la
cuenta (citas, competidores, Search Console). Toca auth, esquema y service
role: necesita su propio Task Intake.

## Cómo probarlo en local

WordPress con SQLite y `php -S`; detalle en §418. Para empaquetar:
`cd docs/wordpress-plugin && zip -r genscore.zip genscore`.

## Publicar en WordPress.org (lo hace Denis, con su aprobación)

1. Cuenta de WordPress.org a nombre de GenScore (no personal); su usuario va en
   `Contributors:` de `readme.txt` (hoy `genscore`).
2. Pasar Plugin Check (plugin oficial) en un WordPress de prueba.
3. Subir el zip en https://wordpress.org/plugins/developers/add/ y esperar la
   revisión (días o semanas). Después, SVN con capturas en `assets/`.
