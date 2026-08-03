# Variabilidad del GEO Score — diagnóstico e informe de fases (agosto 2026)

**Origen:** el fundador ejecutó dos escaneos consecutivos del proyecto de
prueba "Mozilla" (`mozilla.org`) sin cambiar nada y el GEO Score se movió
**44 puntos** (30 → 74). *"No nos podemos permitir esta variabilidad."*

**Estado:** Fase 0 implementada (ADR 0024). **Fase −1 implementada**
(ADR 0025, migración `0025` aprobada por el fundador el 2026-08-02 junto con
la derivación automática de alias). Fases 1–3 pendientes.

---

## 1 · Reproducción exacta

El proyecto tiene **1 prompt escaneado en 3 motores = 3 respuestas de IA**.
(La cabecera decía "3 de 3 prompts" porque `total_results` cuenta filas
prompt × motor y la copy las llamaba prompts — corregido en la Fase 0.)

La tasa de mención pasó de 1/3 a 3/3. Reproducido contra el
`computeRunScoresFromResults` real:

```
mentions=0/3   visibility=0       GEO=0
mentions=1/3   visibility=33.33   GEO=24.52
mentions=2/3   visibility=66.67   GEO=48.33
mentions=3/3   visibility=100     GEO=71.67

1/3 -> 3/3 = +47,15 pt   (el fundador vio +44)
```

**Los 44 puntos quedan explicados en su totalidad.** No hubo bug de cálculo,
ni corrupción de datos, ni deploy que lo causara.

### Sensibilidad por plan — una sola respuesta de IA

```
Mozilla (1 prompt x 3 motores)   n=  3   23,81 pt
Free    (10 prompts x 1 motor)   n= 10    7,12 pt
Starter (25 prompts x 3 motores) n= 75    0,96 pt
Pro     (100 prompts x 3)        n=300    0,24 pt
```

Un cliente Starter real no ve este fenómeno. El proyecto de prueba estaba en
la muestra más pequeña que el producto permite, y el producto la presentaba
con la misma autoridad que una de 300.

### Amplificación

```
visibility +66,67 pp  ->  GEO +47,15 pt   ->  ratio de transferencia 0,71x
```

`presence` pesa 0.40, pero `prominence` penaliza los prompts sin mención con
la posición N+1 y el numerador de `standing` es el recuento de menciones de
marca: tres de los cuatro componentes se mueven juntos. Es el doble conteo
del hallazgo 4 de la auditoría de julio; ADR 0015 solo corrigió `standing`.

### Discontinuidades de escala (misma realidad, score distinto)

```
motores=gemini+openai+claude   GEO=71,67  inputs=presence,prominence,standing,authority
motores=claude                 GEO=84,31  inputs=presence,prominence,standing
una fila con extraction_version antigua
                               GEO=72,73  inputs=presence,authority
```

Un job de prompt se da por bueno "si al menos un motor produce resultado"
(`lib/scan/executor.ts`), así que un fallo transitorio de proveedor reescala
la medición entera sin avisar.

---

## 2 · La causa raíz real: identidad de marca

La varianza estadística es real, pero **no es lo que provocó el +44**.

Las tres respuestas del escaneo bueno recomiendan **Firefox**. "Mozilla"
aparece en cada una de ellas una o dos veces, siempre como atribución de la
empresa madre en una frase subordinada:

```
[ChatGPT] 1 línea: "Descarga Firefox 45, la última actualización del navegador de Mozilla"
          (5 líneas hablan de Firefox SIN nombrar a Mozilla)
[Gemini ] 2 líneas: "Firefox Focus: Desarrollado por Mozilla..." / "Mozilla Firefox: ..."
[Claude ] 1 línea: "...desarrollado por Mozilla, una organización sin ánimo de lucro."
          (2 líneas hablan de Firefox SIN nombrar a Mozilla)
```

`verifyMention` (ADR 0021) exige que el `display_name_found` que devuelve el
extractor *nombre de forma plausible* la cadena de marca trackeada.
`namesPlausiblyMatch("Firefox", "Mozilla")` es **false**. Ejecutado contra el
verificador real:

```
la IA escribe "Mozilla Firefox"      -> brand_mentioned = TRUE
la IA escribe "Firefox"              -> brand_mentioned = FALSE
la IA escribe "Mozilla"              -> brand_mentioned = TRUE
la IA escribe "Firefox de Mozilla"   -> brand_mentioned = TRUE
```

Contrafactual sobre las tres respuestas reales, quitando solo la atribución a
la empresa madre y dejando intacta toda la recomendación de Firefox:

```
[ChatGPT] -> NO MENCIONADA
[Gemini ] -> NO MENCIONADA
[Claude ] -> NO MENCIONADA
```

**El 74 sería un 0**, con las tres IAs recomendando Firefox igual de bien.

Dos agravantes:

1. En ChatGPT, la única línea con "Mozilla" es un **titular de página traído
   por el grounding** ("Descarga Firefox 45…"), no prosa del modelo. Su texto
   propio sobre Firefox nunca dice Mozilla. Queda por verificar si esos
   titulares forman parte de `raw_response_text`; si lo hacen, se están
   contando menciones que el modelo no hizo.
2. En Claude, `display_name_found: "Mozilla Firefox"` daría **NO** — Claude
   nunca escribió esas dos palabras juntas. La redacción del extractor decide
   el resultado.

Esto no es exclusivo de Mozilla: afecta a toda marca cuyo producto sea más
conocido que la empresa (Inditex/Zara, Meta/Instagram, Alphabet/Google,
Mahou/San Miguel).

### Causas secundarias, reales pero no responsables de este caso

- **Grounding no determinista.** `temperature: 0` está fijado en los tres
  proveedores (ADR 0009 addendum), pero **temperature no controla la
  recuperación**: Gemini busca en Google Search y OpenAI usa `web_search` en
  cada llamada.
- **Modelo flotante.** `DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"` es un
  alias, justo lo que ADR 0002 prohíbe ("never a floating alias"). ADR 0009
  lo reintrodujo. Verificable a posteriori: `scan_prompt_results.model`
  guarda el `modelVersion` real devuelto por la API.

---

## 3 · Plan de fases

| Fase | Contenido | Riesgo | Estado |
|---|---|---|---|
| **0** | Honestidad: suelo de muestra, guarda de comparabilidad, margen de Wilson, unidades | Bajo | **Implementada** (ADR 0024) |
| **−1** | Identidad de marca: alias por proyecto (derivados automáticamente y verificados contra evidencia), snapshot por escaneo | Medio · **migración** | **Implementada** (ADR 0025) |
| −1b | Dedupe de entidades de la misma marca en posición/SoV + revisión de la lista de competidores (forks de Firefox) | Bajo | Pendiente |
| **−1c** | **UI de alias**: verlos, añadirlos y quitarlos a mano, y decir en «Evidencias de mención» qué nombre casó. Hoy los alias mueven el score y solo se pueden inspeccionar por SQL — el riesgo asumido en ADR 0025 está **sin mitigar** hasta que exista | Bajo | **Pendiente (hueco conocido)** |
| **1** | Metodología v3: `prominence` condicionada a mención, encogimiento bayesiano, recalibrar bandas | Medio · cambia el significado | Pendiente |
| **2** | Muestreo: repeticiones por prompt en planes de pago | Coste por escaneo | Decisión de producto |
| **3** | Candado: spec normativa, golden set congelado, tests de propiedad, gate de CI | Bajo | Pendiente |

La Fase 0 va primero por ser la única sin migración ni cambio de significado.
La Fase −1 es el P0 real: un número **equivocado** es peor que uno inestable.

### Fase −1 — migración pendiente de aprobación explícita

`CLAUDE.md` prohíbe migraciones de esquema sin aprobación explícita del
fundador. La forma propuesta, para aprobar o rechazar como unidad:

```sql
-- supabase/migrations/00XX_project_brand_aliases.sql
alter table public.projects
  add column brand_aliases text[] not null default '{}';

comment on column public.projects.brand_aliases is
  'Nombres alternativos que cuentan como mención de la marca (productos, marcas
   comerciales, variantes). Ej: Mozilla -> {Firefox, Firefox Focus, Thunderbird}.
   Consumido por verifyMention (lib/scan/extraction.ts, ADR 0021).';
```

- **Sin RLS nueva.** Columna sobre `projects`, que ya está protegida por su
  política existente de `owner_user_id`. No hay tabla nueva ni policy nueva.
- **Sin backfill.** `default '{}'` mantiene el comportamiento actual para
  todo proyecto existente hasta que su dueño (o la sugerencia del onboarding)
  la rellene.
- **Snapshot por escaneo.** `scan_prompt_results` ya guarda `brand_snapshot`;
  la Fase −1 debe decidir si los alias también se snapshotean por run para
  que un cambio de alias no reescriba retroactivamente la historia. **Esta
  decisión está abierta y debe cerrarse en el Task Intake de la Fase −1**,
  no aquí.

Trabajo de código que acompaña a la migración:

1. `namesPlausiblyMatch` comprueba contra `[brand, ...brand_aliases]`.
2. Deduplicar entidades de la misma marca en `computeBrandPosition` y en la
   cuota de voz — hoy Gemini sitúa "Firefox Focus" en el puesto 3 y "Mozilla
   Firefox" en el 4, es decir, **la marca compite consigo misma** y hunde su
   propia `prominence`.
3. Sugerencia de alias en el onboarding a partir del perfil de negocio ya
   extraído (ADR 0020/0022), siempre editable — nunca alias inventados y
   fijados sin que el usuario los vea.
4. Revisar la lista de competidores del proyecto: LibreWolf, Waterfox y Zen
   son *forks de Firefox*; que computen como competidores en la cuota de voz
   es discutible y es decisión de `geo-strategy`.

---

## 4 · Qué NO resuelve la Fase 0

Conviene dejarlo escrito para que nadie lea el ADR 0024 como "arreglado":

- La Fase 0 **habría ocultado** el +44 del fundador, pero por el motivo
  equivocado (n=3 < 10), no por detectar que la medición estaba mal.
- Con una muestra grande y un alias mal resuelto, el producto seguiría
  publicando con toda confianza un número equivocado. Eso solo lo arregla la
  Fase −1.
- La inestabilidad de fondo solo baja de verdad con más muestra (Fase 2);
  ninguna fórmula estabiliza un score de 3 respuestas.
