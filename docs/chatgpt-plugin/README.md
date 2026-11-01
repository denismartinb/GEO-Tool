# GenScore en el directorio de ChatGPT

Paquete y pasos para publicar el conector MCP de GenScore en ChatGPT
(MCP-CHATGPT-SUBMIT-1, `docs/brand/design-decisions-log.md` §429).

- Servidor: `https://www.genscore.es/api/mcp/chatgpt` (sin precios, planes ni
  prueba, por las normas de OpenAI).
- Autenticación: mixta. Sin cuenta funcionan `revisar_pagina`, `buscar_guias`
  y `que_es_genscore`; las demás piden conectar la cuenta (OAuth de Supabase,
  registro dinámico de clientes, scopes `openid` y `email`).
- Paquete: `package/` (`plugin.json`, `mcp.json`, `assets/`). Se comprime con
  los ficheros en la raíz del ZIP: `cd package && zip -r ../genscore-chatgpt.zip .`

## Antes de empezar

1. **Organización verificada en OpenAI** (platform.openai.com, Settings,
   Organization, Verification). Individual o empresa; el nombre que salga es
   el que firma la ficha.
2. **Cuenta de revisión limpia.** soporte@genscore.es sólo debe tener el
   dominio genscore.es, con un escaneo terminado. Cualquier otro dominio se
   retira antes de enviar: los revisores ven todo lo de esa cuenta.
3. **Mergear el PR** que añade la verificación de dominio y el inicio de sesión
   por herramienta para ChatGPT.

## Pasos en el portal

1. Plugins, **Upload new or existing plugin**, elegir la identidad verificada y
   subir `genscore-chatgpt.zip`.
2. Esperar a **Metadata & Skills**. Si sale algún aviso, «Copy issues» y
   pasármelo. Si el aviso es sobre `extensions` dentro de `mcp.json`, se sube la
   versión sin ese bloque y la autenticación se elige en el paso 4.
3. **Domain verification**: el portal da un token. Ponerlo en Vercel como
   `OPENAI_APPS_CHALLENGE_TOKEN` (Production), relanzar el deploy y comprobar
   que `https://www.genscore.es/.well-known/openai-apps-challenge` enseña sólo
   el token. Pulsar **Verify Domain**.
4. **MCPs, Connect**: URL `https://www.genscore.es/api/mcp/chatgpt`,
   autenticación **Mixed** (pública y OAuth), cliente por registro dinámico
   (DCR), sin client secret, sin cabeceras. Iniciar sesión con
   soporte@genscore.es cuando lo pida y aprobar en la pantalla de consentimiento
   de GenScore. Esperar al escaneo de herramientas: tienen que salir las diez.
5. **Review information, Review details**:
   - Credenciales: soporte@genscore.es y su contraseña (nunca en el ZIP).
     Login URL `https://www.genscore.es/login`. Sin verificación en dos pasos.
   - Instrucciones para el revisor: ver el bloque de abajo.
   - Vídeo: enlace a la grabación de los ocho casos (abajo).
6. **Submit for review** y aceptar las declaraciones. La respuesta llega por
   correo. Cuando la aprueben, **Publish plugin**.

### Instrucciones para el revisor (pegar en inglés)

```
1. The account tools ask to connect GenScore the first time they are used. Sign in with the test account in this form (paid plan, no two-step verification, sample domain genscore.es with real scan data) and approve access on the GenScore consent screen.
2. Public tools work without signing in: revisar_pagina (review any public page), buscar_guias (search GenScore's guides), que_es_genscore.
3. All tools are read-only. Answers are in Spanish because GenScore is a Spanish product; prompts can be written in English or Spanish.
4. revisar_pagina fetches the page live, so it can take up to about 20 seconds.
```

### Vídeo

Una grabación de pantalla de ChatGPT, con la cuenta de prueba, haciendo los
cinco casos positivos y los tres negativos de `plugin.json`, en orden. Sin
datos de clientes reales ni contraseñas a la vista (cortar el momento de
escribir la contraseña). Subirla donde el revisor pueda abrirla sin pedir
acceso (YouTube oculto, Loom o un enlace público de Drive).

## Capturas de la ficha

Opcionales. Si se ponen, que sean del chat real: tras conectar la app en modo
desarrollador, capturar `revisar_pagina` sobre genscore.es y `ver_dominio`.
Se añaden a `package/assets/` y a `interface.screenshots`, y se vuelve a subir
el ZIP.

## Al cambiar algo después

- Una herramienta nueva o un cambio de descripción: OpenAI vuelve a escanear el
  servidor cada día. Una herramienta nueva no se ve en ChatGPT hasta que la
  aprueban.
- Un cambio de ficha, logo o casos: subir un ZIP nuevo con `version` subida.
