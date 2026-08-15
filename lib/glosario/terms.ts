/**
 * Single source of truth for /glosario entries (GROWTH-2 Fase 2.4, capa D).
 * First slice: 15 terms. Sorted alphabetically on the page, not in this
 * array, so new entries can be appended at the end without reordering.
 *
 * GROWTH-2 Fase 2.6b: each term also gets its own page at
 * `/glosario/<slug>` instead of living only as an anchor on the index —
 * `seo-geo-research` found this is the pattern behind the one glossary in
 * the sector that actually drives search traffic (Ahrefs: one URL, one
 * full entry, per term). `definition` stays short for the index card;
 * `longDefinition` (150–300 words, per docs/content-strategy.md §4.1) and
 * `relatedLinks` (≥3 contextual internal links, per §4.3) are new and only
 * render on the term's own page.
 */
export type GlossaryTerm = {
  slug: string;
  term: string;
  definition: string;
  longDefinition: string;
  relatedLinks: { href: string; label: string }[];
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    slug: "geo",
    term: "GEO (Generative Engine Optimization)",
    definition:
      "Optimizar el contenido y la presencia de una marca para aparecer en las respuestas de motores generativos (ChatGPT, Gemini, Claude, AI Overviews), no solo en los resultados de búsqueda tradicionales. A diferencia del SEO, no se mide en clics ni posiciones en una lista — se mide en si el modelo te menciona, te cita, y con qué prominencia.",
    longDefinition:
      "GEO (Generative Engine Optimization) es la disciplina de optimizar el contenido y la presencia de una marca para que los motores generativos de IA — ChatGPT, Gemini, Claude, Perplexity, los AI Overviews de Google — la mencionen y la recomienden al responder preguntas de su categoría.\n\nLa diferencia con el SEO tradicional no es de grado, es de naturaleza. Un buscador clásico devuelve una lista de páginas y el usuario decide cuál abrir; el éxito se mide en posición y clics. Un motor generativo construye una respuesta propia combinando varias fuentes, y a menudo el usuario nunca visita ninguna web — la decisión ya está tomada dentro de la respuesta. Por eso el GEO no se mide con un ranking, sino con señales como si la marca aparece mencionada, en qué posición dentro de la respuesta, con qué competidores comparte hueco y si la IA cita alguna fuente real como respaldo.\n\nUn buen SEO sigue siendo relevante para el GEO — los modelos generativos también priorizan fuentes con autoridad y contenido bien estructurado — pero no es suficiente por sí solo: una marca puede posicionar de forma excelente en Google y seguir siendo invisible en la respuesta de una IA.",
    relatedLinks: [
      { href: "/geo", label: "Guía visual: qué es el GEO y cómo se mide" },
      { href: "/blog/que-es-geo-generative-engine-optimization", label: "Artículo: GEO vs SEO en profundidad" },
      { href: "/glosario/geo-score", label: "Glosario: qué es el GEO Score" },
      { href: "/docs/metodologia/geo-score", label: "Documentación: metodología del GEO Score" }
    ]
  },
  {
    slug: "aeo",
    term: "AEO (Answer Engine Optimization)",
    definition:
      "Término hermano de GEO, centrado en optimizar contenido para motores que devuelven una respuesta directa en vez de una lista de enlaces — fragmentos destacados, asistentes de voz, AI Overviews. En la práctica, GEO y AEO comparten casi todas las mismas prácticas.",
    longDefinition:
      "AEO (Answer Engine Optimization) es el término hermano de GEO: en vez de centrarse en motores generativos conversacionales, pone el foco en cualquier sistema que devuelva una respuesta directa en lugar de una lista de enlaces — fragmentos destacados de Google, asistentes de voz, los propios AI Overviews.\n\nEn la práctica, la frontera entre GEO y AEO es más terminológica que operativa: ambos persiguen que una fuente sea considerada lo bastante clara, bien estructurada y autorizada como para que un sistema la use al construir su respuesta, en vez de limitarse a enlazarla. Las prácticas que sirven a uno — respuestas directas en los primeros párrafos, datos estructurados, encabezados formulados como preguntas reales — sirven casi siempre al otro.\n\nAlgunos equipos de marketing usan AEO quando hablan específicamente de buscadores (fragmentos destacados, la caja de respuesta de Google) y reservan GEO para motores conversacionales de IA generativa. Otros los usan como sinónimos. Ninguna de las dos convenciones está mal — lo que importa es la intención detrás de la consulta del usuario, no qué etiqueta lleve el sistema que responde.",
    relatedLinks: [
      { href: "/glosario/geo", label: "Glosario: qué es el GEO" },
      { href: "/glosario/fragmento-destacado", label: "Glosario: fragmento destacado" },
      { href: "/glosario/ai-overviews", label: "Glosario: AI Overviews" }
    ]
  },
  {
    slug: "geo-score",
    term: "GEO Score",
    definition:
      "La métrica de GenScore (0-100) que resume cómo aparece una marca en respuestas de IA: si la mencionan, con qué protagonismo, cómo sale frente a su competencia, si hay una fuente real detrás y si su web puede ser citada.",
    longDefinition:
      "El GEO Score es la métrica compuesta que usa GenScore para resumir, en un único número de 0 a 100, cómo aparece una marca en las respuestas de motores generativos de IA.\n\nResume varias señales que no significan lo mismo por separado: si la IA menciona la marca —lo primero, porque sin mención no hay nada que interpretar—, en qué posición aparece dentro de la respuesta, qué parte de la atención se lleva frente a sus competidores, si el motor cita alguna página del dominio como fuente, y si la web está preparada para que un motor la lea y la extraiga.\n\nUn único escaneo no basta para que el número sea fiable: el GEO Score gana confianza cuantos más resultados reales se hayan extraído de los motores de IA, y GenScore solo lo marca como \"confianza alta\" a partir de un volumen mínimo de resultados completamente procesados. Con pocos datos, el número existe pero se etiqueta como poco fiable en vez de presentarse como definitivo.\n\nNo es una cifra estática: cambia con cada escaneo, porque las respuestas de los motores generativos cambian con el tiempo, con el propio contenido de la marca y con lo que hacen sus competidores.",
    relatedLinks: [
      { href: "/docs/metodologia/geo-score", label: "Documentación: qué mira el GEO Score" },
      { href: "/blog/que-es-el-geo-score", label: "Artículo: qué es el GEO Score y qué mide" },
      { href: "/glosario/cuota-de-voz-en-ia", label: "Glosario: cuota de voz en IA" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" }
    ]
  },
  {
    slug: "cuota-de-voz-en-ia",
    term: "Cuota de voz en IA (Share of Voice)",
    definition:
      "De toda la atención que un motor generativo reparte entre las marcas que menciona para un prompt, qué porcentaje es tuyo frente a tus competidores. Si ni tu marca ni ningún competidor rastreado aparece mencionado, no hay voz que repartir — la cuota se descarta en vez de asumir un valor por defecto.",
    longDefinition:
      "La cuota de voz en IA (share of voice) mide, de toda la atención que un motor generativo reparte entre las marcas que menciona al responder un prompt, qué porcentaje corresponde a la tuya frente a tus competidores directos.\n\nEs una métrica relativa, no absoluta: no basta con saber que una marca aparece mencionada, hace falta saber cuánto espacio ocupa esa mención frente al de la competencia rastreada en la misma respuesta. Una marca puede tener presencia alta (aparece casi siempre) y aun así una cuota de voz baja, si cada vez que aparece lo hace junto a varios competidores que se llevan la mayor parte del protagonismo.\n\nUn matiz importante en cómo se calcula de verdad: si en una respuesta concreta ni la marca ni ninguno de sus competidores rastreados aparece mencionado, no existe una \"voz\" que repartir para ese prompt — ese caso se descarta del cálculo en vez de contarse como un cero, que inflaría artificialmente la impresión de mala cuota de voz cuando en realidad el motor ni siquiera habló de la categoría.\n\nEs la señal que más directamente conecta el GEO con la competencia real: no responde a \"¿aparezco?\" sino a \"¿aparezco tanto como merezco frente a quien compito?\".",
    relatedLinks: [
      { href: "/docs/metodologia/geo-score", label: "Documentación: cómo entra la cuota de voz en el GEO Score" },
      { href: "/glosario/geo-score", label: "Glosario: qué es el GEO Score" },
      { href: "/comparativas/genscore-vs-otterly", label: "Comparativa: GenScore frente a Otterly" },
      { href: "/blog/como-elegir-competidores-analisis-geo", label: "Artículo: cómo elegir competidores para un análisis GEO" }
    ]
  },
  {
    slug: "llms-txt",
    term: "llms.txt",
    definition:
      "Fichero en la raíz de un dominio (`/llms.txt`) que resume el sitio en lenguaje natural pensado para que un modelo lo consuma con facilidad al hacer grounding — el equivalente a robots.txt, pero dirigido a agentes de IA en vez de a rastreadores de búsqueda.",
    longDefinition:
      "llms.txt es un fichero de texto en la raíz de un dominio (`/llms.txt`) que resume el sitio en lenguaje natural, pensado en teoría para que un modelo de IA lo consuma con facilidad al hacer grounding — el equivalente a robots.txt, pero dirigido a agentes de IA en vez de a rastreadores de búsqueda.\n\nConviene ser honesto sobre su utilidad real, en vez de presentarlo como una palanca de citación probada: no hay evidencia pública verificable de que tener un llms.txt mejore la tasa de citación en respuestas de IA, y Google ha confirmado públicamente (a través de Gary Illyes) que no lo usa ni tiene previsto soportarlo. Es, hoy, un estándar propuesto por parte de la comunidad, sin adopción confirmada por ninguno de los motores generativos principales.\n\nGenscore lo trata como lo que es: un fichero opcional y de bajo coste que no hace daño tenerlo, pero que no sustituye a lo que sí tiene evidencia de importar — contenido claro, bien estructurado, con datos estructurados reales (`Article`, `FAQPage`, `DefinedTerm`) y autoridad de dominio genuina. Ningún rastreador de IA confirma leerlo todavía de forma consistente, así que no debería tratarse como prioritario frente a esas otras señales.",
    relatedLinks: [
      { href: "/glosario/grounding", label: "Glosario: qué es el grounding" },
      { href: "/glosario/rag", label: "Glosario: qué es RAG" },
      { href: "/glosario/datos-estructurados", label: "Glosario: datos estructurados" }
    ]
  },
  {
    slug: "grounding",
    term: "Grounding",
    definition:
      "Cuando un motor generativo respalda su respuesta con una búsqueda o una fuente real en vez de responder solo de memoria de su entrenamiento. Una respuesta \"grounded\" suele venir acompañada de citas o enlaces verificables.",
    longDefinition:
      "El grounding ocurre cuando un motor generativo respalda su respuesta con una búsqueda o una fuente real en el momento de responder, en vez de contestar solo con lo que recuerda de su entrenamiento.\n\nLa diferencia importa mucho para el GEO. Una respuesta sin grounding depende enteramente de qué aprendió el modelo durante el entrenamiento — una marca nueva, o un dato reciente, simplemente no puede aparecer, por muy bien optimizado que esté su sitio hoy. Una respuesta con grounding, en cambio, consulta información actual en el momento de responder, así que el contenido que publicas ahora sí puede influir en una respuesta de mañana.\n\nUna respuesta grounded suele venir acompañada de citas o enlaces verificables hacia las fuentes que el modelo consultó — es la vía principal por la que una marca puede ser citada explícitamente, más allá de ser solo mencionada de memoria. Por eso el grounding es el mecanismo detrás de casi toda la oportunidad real del GEO: sin él, no hay ninguna fuente nueva que optimizar para que un modelo la use, solo el conocimiento congelado de su entrenamiento.\n\nEl mecanismo técnico habitual detrás del grounding es RAG (Retrieval-Augmented Generation): el modelo recupera documentos externos antes de generar la respuesta.",
    relatedLinks: [
      { href: "/glosario/rag", label: "Glosario: qué es RAG" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" },
      { href: "/glosario/ai-overviews", label: "Glosario: AI Overviews" }
    ]
  },
  {
    slug: "ai-overviews",
    term: "AI Overviews",
    definition:
      "El resumen generado por IA que Google muestra encima de los resultados de búsqueda tradicionales para ciertas consultas, combinando información de varias fuentes en una sola respuesta.",
    longDefinition:
      "AI Overviews es el resumen generado por IA que Google muestra encima de los resultados de búsqueda tradicionales para ciertas consultas, combinando información de varias fuentes en una sola respuesta redactada, en vez de — o además de — la lista habitual de diez enlaces azules.\n\nPara una marca, aparecer citada dentro de un AI Overview cambia el comportamiento del usuario de forma parecida a lo que ocurre con un motor conversacional: parte de la respuesta ya está servida antes de que el usuario tenga que hacer clic en ningún resultado. A diferencia de un ranking clásico, no hay una única posición que optimizar — lo que importa es si el contenido de la marca es lo bastante claro y bien estructurado como para que el sistema lo use como una de sus fuentes.\n\nAI Overviews es, en la práctica, el punto donde el SEO tradicional y el GEO se solapan más: sigue viviendo dentro de Google, pero funciona con la misma lógica de síntesis y grounding que un motor conversacional. Por eso las mismas prácticas — respuestas directas en los primeros párrafos, encabezados formulados como preguntas reales, datos estructurados — sirven tanto para mejorar la presencia en AI Overviews como en ChatGPT, Gemini o Claude.",
    relatedLinks: [
      { href: "/glosario/fragmento-destacado", label: "Glosario: fragmento destacado" },
      { href: "/glosario/grounding", label: "Glosario: qué es el grounding" },
      { href: "/glosario/geo", label: "Glosario: qué es el GEO" }
    ]
  },
  {
    slug: "prompt-tracking",
    term: "Prompt tracking",
    definition:
      "Monitorizar de forma repetida (diaria, semanal) cómo responde un motor generativo a un conjunto fijo de preguntas reales de tu categoría, para ver si la presencia o la posición de una marca cambia con el tiempo — el equivalente en GEO al rank tracking de palabras clave en SEO.",
    longDefinition:
      "El prompt tracking consiste en monitorizar de forma repetida — diaria o semanal, según el plan — cómo responde un motor generativo a un conjunto fijo de preguntas reales de una categoría, para ver si la presencia o la posición de una marca cambia con el tiempo. Es el equivalente en GEO al rank tracking de palabras clave en SEO clásico.\n\nUna prueba aislada (\"le pregunto una vez a ChatGPT y miro si aparezco\") no representa la realidad, por dos motivos: las respuestas de un motor generativo pueden variar de una ejecución a otra, y cada cliente potencial pregunta con palabras distintas para el mismo problema — \"mejor CRM para una pyme\", \"software para gestionar clientes\", \"alternativa a Salesforce\" hablan del mismo problema pero pueden producir respuestas distintas.\n\nPor eso el prompt tracking no analiza una consulta suelta, sino un conjunto de prompts pensado para representar cómo pregunta de verdad el cliente objetivo de una marca, y repite ese mismo conjunto en cada escaneo para poder comparar evolución real en vez de una fotografía única. En GenScore, ese conjunto de prompts es la base sobre la que se calculan todas las demás métricas del GEO Score — sin un buen conjunto de prompts, ninguna de las señales posteriores es fiable.",
    relatedLinks: [
      { href: "/docs/empezar/primer-escaneo", label: "Documentación: cómo se lanza tu primer escaneo" },
      { href: "/blog/como-elegir-prompts-monitorizar-marca-ia", label: "Artículo: cómo elegir los prompts correctos" },
      { href: "/glosario/geo-score", label: "Glosario: qué es el GEO Score" }
    ]
  },
  {
    slug: "rag",
    term: "RAG (Retrieval-Augmented Generation)",
    definition:
      "Arquitectura en la que un modelo generativo recupera documentos externos (una búsqueda, una base de datos) antes de generar su respuesta, en vez de depender solo de lo aprendido durante el entrenamiento. Es el mecanismo técnico detrás del grounding.",
    longDefinition:
      "RAG (Retrieval-Augmented Generation) es la arquitectura en la que un modelo generativo recupera documentos externos — una búsqueda web, una base de datos, un índice propio — antes de generar su respuesta, en vez de depender únicamente de lo que aprendió durante su entrenamiento. Es el mecanismo técnico detrás de lo que en GEO se llama grounding.\n\nLa distinción práctica es simple pero decisiva: sin RAG, un modelo solo puede hablar de lo que existía y era relevante en el momento en que se entrenó — una marca lanzada después, o un cambio reciente en el mercado, no puede aparecer en su respuesta por ningún medio. Con RAG, el modelo primero busca información actual y construye la respuesta apoyándose en lo que encuentra, así que el contenido que una marca publica hoy sí tiene una vía real para influir en una respuesta futura.\n\nEsta es la razón por la que el GEO tiene sentido como disciplina activa y no solo como medición pasiva: si un motor generativo usa RAG para responder una categoría, publicar contenido claro, bien estructurado y con autoridad real aumenta las probabilidades de ser una de las fuentes que ese proceso de recuperación encuentra y usa. Sin RAG de por medio, no hay ningún contenido nuevo que optimizar — solo el conocimiento ya congelado del entrenamiento del modelo.",
    relatedLinks: [
      { href: "/glosario/grounding", label: "Glosario: qué es el grounding" },
      { href: "/glosario/llms-txt", label: "Glosario: qué es llms.txt" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" }
    ]
  },
  {
    slug: "datos-estructurados",
    term: "Datos estructurados (Schema.org)",
    definition:
      "Marcado JSON-LD o microdata en una página que describe explícitamente su contenido (artículo, producto, pregunta frecuente, término de un glosario) para que buscadores y modelos lo interpreten sin ambigüedad, en vez de tener que inferirlo del texto visible.",
    longDefinition:
      "Los datos estructurados son marcado JSON-LD o microdata añadido a una página para describir explícitamente su contenido — que es un artículo, con qué fecha se publicó; que es una pregunta frecuente, con su respuesta; que es un término de un glosario, con su definición — en vez de dejar que un buscador o un modelo tenga que inferirlo del texto visible.\n\nSu valor para el GEO es que reducen la ambigüedad exactamente en el punto donde más falta hace: un motor generativo que construye una respuesta a partir de varias fuentes tiene que decidir rápido qué es cada fragmento de texto que encuentra. Un bloque marcado como `Article` con su título, fecha y descripción, o un término marcado como `DefinedTerm` dentro de un `DefinedTermSet`, es más fácil de citar con precisión que el mismo contenido sin ese contexto explícito.\n\nEsto no sustituye a tener contenido bueno — un buen marcado sobre un texto vago no lo hace más citable — pero sí es la forma más directa de eliminar la interpretación errónea como motivo por el que un contenido de calidad no llega a usarse. GenScore usa `Article`, `BreadcrumbList`, `DefinedTermSet`/`DefinedTerm` e `ItemList` según el tipo de página, siempre reflejando el contenido real, nunca datos inventados para parecer más completo de lo que es.",
    relatedLinks: [
      { href: "/glosario/llms-txt", label: "Glosario: llms.txt (y por qué no sustituye a esto)" },
      { href: "/glosario/url-canonica", label: "Glosario: URL canónica" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" }
    ]
  },
  {
    slug: "url-canonica",
    term: "URL canónica",
    definition:
      "La URL que un sitio declara como versión \"oficial\" de una página, mediante la etiqueta `<link rel=\"canonical\">`, para evitar que buscadores traten copias o variantes con parámetros como contenido duplicado.",
    longDefinition:
      "La URL canónica es la dirección que un sitio declara como versión \"oficial\" de una página, mediante la etiqueta `<link rel=\"canonical\">` en su `<head>`. Su función es evitar que un buscador trate variantes de la misma página — con parámetros de tracking, con o sin barra final, servida por http y por https — como si fueran contenido duplicado independiente, repartiendo entre ellas la autoridad que debería concentrarse en una sola URL.\n\nPara el GEO, la canónica cumple un papel adicional al puramente técnico de SEO: cuando un motor generativo cita una fuente, la URL que expone en la cita debería ser exactamente la canónica, no una variante con parámetros. Una cita hacia la URL equivocada — aunque apunte al mismo contenido — diluye la señal de autoridad hacia el dominio y puede incluso llevar a un usuario a una versión de la página sin el contexto completo.\n\nCada página pública de GenScore declara su propia canónica absoluta (con `https://www.genscore.es` completo, sin barra final), y el sitemap solo lista esa versión — no hay ninguna URL alternativa compitiendo por la misma canónica. Es una de las piezas más baratas de implementar de todo el marcado técnico y, a la vez, una de las que más previene canibalización accidental entre variantes de una misma página.",
    relatedLinks: [
      { href: "/glosario/datos-estructurados", label: "Glosario: datos estructurados" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" },
      { href: "/glosario/eeat", label: "Glosario: E-E-A-T" }
    ]
  },
  {
    slug: "citacion-en-ia",
    term: "Citación (en respuestas de IA)",
    definition:
      "Cuando la respuesta de un motor generativo enlaza o menciona explícitamente una fuente como respaldo de lo que afirma. Que una marca aparezca mencionada no garantiza que también sea citada — son señales distintas.",
    longDefinition:
      "Una citación ocurre cuando la respuesta de un motor generativo enlaza o menciona explícitamente una fuente concreta como respaldo de lo que afirma — no basta con que la marca aparezca nombrada en el texto de la respuesta, tiene que señalarse como el origen de la información.\n\nEsta distinción es una de las más importantes del GEO y una de las que más se confunde con la presencia general. Una marca puede aparecer mencionada muchas veces en respuestas de IA (\"Tu marca es una opción popular para esto\") sin que ninguna de esas menciones venga acompañada de una cita real hacia su web como fuente. Y al revés: cuando sí hay citación, suele ser la señal más fuerte de autoridad, porque implica que el motor generativo consideró el contenido de esa página lo bastante fiable y relevante como para respaldar en él una afirmación concreta, no solo para nombrar la marca de pasada.\n\nPara que una página sea citable hace falta más que buen SEO: contenido claro y verificable, estructurado de forma que un modelo pueda extraer un dato o una afirmación concreta sin ambigüedad, y una fuente que el motor pueda encontrar durante su proceso de grounding. En GenScore, la cuota de citas —qué parte de las URLs que la IA usa como fuente pertenecen al dominio de la marca— es lo que alimenta la señal de autoridad dentro del GEO Score.",
    relatedLinks: [
      { href: "/docs/metodologia/geo-score", label: "Documentación: metodología del GEO Score" },
      { href: "/glosario/grounding", label: "Glosario: qué es el grounding" },
      { href: "/glosario/analisis-de-sentimiento", label: "Glosario: análisis de sentimiento" },
      { href: "/docs/informes/overview", label: "Documentación: el informe de Visión general" }
    ]
  },
  {
    slug: "analisis-de-sentimiento",
    term: "Análisis de sentimiento",
    definition:
      "Clasificar si una mención de marca en una respuesta de IA es positiva, neutra o negativa, más allá de si aparece o no. Una marca puede tener alta presencia y sentimiento negativo a la vez — son ejes distintos.",
    longDefinition:
      "El análisis de sentimiento clasifica si una mención de marca dentro de una respuesta de IA es positiva, neutra o negativa — un eje completamente distinto de si la marca aparece o no, o con qué frecuencia.\n\nEs fácil asumir que más presencia siempre es mejor, pero eso ignora el contenido real de la mención. Una marca puede aparecer citada con mucha frecuencia y, aun así, tener un sentimiento predominantemente negativo si el motor generativo la menciona junto a quejas conocidas, comparaciones desfavorables frente a la competencia, o advertencias sobre limitaciones reales del producto. Presencia alta y sentimiento negativo a la vez es, de hecho, una de las combinaciones más urgentes de detectar — indica que la marca sí está en la conversación, pero perdiendo la decisión del usuario dentro de ella.\n\nPara que esta señal sea útil no basta con una etiqueta genérica de \"positivo/negativo\": lo que de verdad ayuda a actuar es la evidencia concreta detrás de cada mención negativa — qué prompt la generó, qué dijo exactamente el motor, y si el motivo es corregible (un dato desactualizado, una comparación injusta) o refleja un problema real del producto que ninguna estrategia de contenido puede maquillar.",
    relatedLinks: [
      { href: "/docs/informes/overview", label: "Documentación: el informe de Visión general" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" },
      { href: "/glosario/cuota-de-voz-en-ia", label: "Glosario: cuota de voz en IA" }
    ]
  },
  {
    slug: "eeat",
    term: "E-E-A-T",
    definition:
      "Experience, Expertise, Authoritativeness, Trustworthiness — el marco de Google para evaluar la calidad y credibilidad de un contenido. GEO hereda buena parte de este criterio porque los motores generativos también tienden a priorizar fuentes con autoridad real y verificable.",
    longDefinition:
      "E-E-A-T son las siglas de Experience, Expertise, Authoritativeness y Trustworthiness — el marco que usa Google para evaluar la calidad y credibilidad de un contenido: si quien lo escribe tiene experiencia real con el tema, conocimiento demostrable, si la fuente es reconocida como autoridad en su campo, y si el contenido en su conjunto es fiable y verificable.\n\nEl GEO hereda buena parte de este criterio, aunque no exista todavía un marco equivalente formalmente publicado por los proveedores de modelos generativos: la evidencia disponible apunta a que los motores generativos también tienden a priorizar como fuentes contenido con autoridad de dominio real y señales de credibilidad verificables, no solo texto bien optimizado técnicamente. Una página puede tener un marcado perfecto y una estructura impecable y aun así no ser citada si el dominio no ha demostrado autoridad real sobre el tema.\n\nEn la práctica, esto significa que no hay atajo puramente técnico para el GEO: contenido escrito por quien de verdad conoce el problema, con ejemplos y matices reales, respaldado por un dominio con trayectoria demostrable, tiene más probabilidades de ser considerado una fuente fiable por un motor generativo que contenido genérico optimizado solo de cara al marcado o a la densidad de palabras clave.",
    relatedLinks: [
      { href: "/glosario/url-canonica", label: "Glosario: URL canónica" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" },
      { href: "/glosario/datos-estructurados", label: "Glosario: datos estructurados" }
    ]
  },
  {
    slug: "fragmento-destacado",
    term: "Fragmento destacado (Featured snippet)",
    definition:
      "El bloque de respuesta directa que Google extrae de una página y muestra encima de los resultados orgánicos para ciertas búsquedas, sin que el usuario tenga que hacer clic.",
    longDefinition:
      "Un fragmento destacado (featured snippet) es el bloque de respuesta directa que Google extrae de una página y muestra encima de los resultados orgánicos tradicionales para ciertas búsquedas — normalmente un párrafo corto, una lista o una tabla — sin que el usuario tenga que hacer clic en ningún resultado para obtener la respuesta.\n\nEs, en cierto sentido, el precursor de la lógica que después llevaron mucho más lejos los AI Overviews y los motores conversacionales: la idea de que el buscador puede resolver directamente la intención del usuario en vez de limitarse a apuntarle hacia una página que lo haga. Por eso las prácticas que ayudan a ganar un fragmento destacado — responder la pregunta de forma directa y concisa en los primeros párrafos, usar el encabezado exacto de la pregunta real del usuario, estructurar listas y tablas con claridad — son casi las mismas que ayudan a que un motor generativo use ese mismo contenido como fuente de su respuesta.\n\nLa diferencia clave frente al GEO puro es que el fragmento destacado sigue enlazando explícitamente a la página de origen de forma visible y con un clic disponible, mientras que una mención en un motor conversacional puede resolver la necesidad del usuario sin ofrecer ningún enlace en absoluto.",
    relatedLinks: [
      { href: "/glosario/ai-overviews", label: "Glosario: AI Overviews" },
      { href: "/glosario/aeo", label: "Glosario: AEO (Answer Engine Optimization)" },
      { href: "/glosario/geo", label: "Glosario: qué es el GEO" }
    ]
  },
  {
    slug: "tasa-de-mencion",
    term: "Tasa de mención (Mention Rate)",
    definition:
      "El porcentaje de respuestas de un motor generativo en las que aparece nombrada una marca, sobre el total de respuestas evaluadas. Es la señal más básica de visibilidad en IA: sin mención, ninguna otra métrica tiene sentido.",
    longDefinition:
      "La tasa de mención es el porcentaje de respuestas de un motor generativo en las que aparece nombrada una marca, sobre el total de respuestas evaluadas para un conjunto de prompts. Es la primera pregunta de cualquier análisis de visibilidad en IA — sin mención no hay nada más que interpretar — y por eso suele ser también la más citada y la peor calculada.\n\nEl error más común es contarla sobre prompts en vez de sobre respuestas. Un mismo prompt lanzado a tres motores generativos produce tres respuestas distintas, que pueden nombrar marcas distintas; tratarlas como una sola observación reduce a un tercio la información real disponible y hace que el porcentaje resultante no signifique lo que parece significar.\n\nEl segundo error es dar por buena una mención porque el propio modelo afirma haberla incluido, en vez de comprobarla contra el texto literal de la respuesta — la distinción que separa una mención de una mención verificada. Y el tercero es leer la tasa de mención sola: dice si una marca está en la conversación, pero no en qué posición aparece cuando lo hace, ni si esa mención está respaldada por una fuente real. Esas dos preguntas las responden la prominencia y la citación, respectivamente.",
    relatedLinks: [
      { href: "/glosario/prominencia", label: "Glosario: prominencia (posición cuando se menciona)" },
      { href: "/glosario/mencion-verificada", label: "Glosario: mención verificada" },
      { href: "/glosario/citacion-en-ia", label: "Glosario: citación en IA" },
      { href: "/blog/metricas-geo-que-medir", label: "Artículo: métricas GEO, qué medir y qué no" }
    ]
  },
  {
    slug: "prominencia",
    term: "Prominencia (posición cuando se menciona)",
    definition:
      "El puesto en el que aparece una marca dentro de una respuesta de IA, calculado solo sobre las respuestas donde la marca fue mencionada — nunca promediando también las respuestas donde no apareció.",
    longDefinition:
      "La prominencia mide el puesto en el que aparece una marca dentro de una respuesta de IA — si se nombra primero, con protagonismo, o al final, casi de pasada — calculado únicamente sobre las respuestas donde esa marca fue mencionada.\n\nEsa última condición no es un detalle técnico, es la que separa una medición útil de una engañosa. Una forma habitual de calcularla en el sector consiste en tratar cada respuesta donde la marca no aparece como si fuera un \"último puesto\" y promediarlo junto con las posiciones reales. El resultado ordena las marcas por frecuencia de aparición, no por posición — una marca que aparece pocas veces pero siempre la primera puede acabar por debajo de otra que aparece mucho pero casi siempre de pasada, simplemente porque arrastra menos \"últimos puestos\" ficticios.\n\nLa forma correcta es la contraria: medir el puesto solo sobre las respuestas donde la marca sí apareció, y leer ese número siempre junto a la tasa de mención — la otra mitad de la historia. Un puesto excelente sobre una sola mención no dice mucho; un puesto excelente sostenido sobre muchas menciones sí. Las dos cifras juntas cuentan lo que ninguna de las dos cuenta por separado: con qué frecuencia y con qué protagonismo aparece una marca cuando lo hace.",
    relatedLinks: [
      { href: "/glosario/tasa-de-mencion", label: "Glosario: tasa de mención" },
      { href: "/glosario/cuota-de-voz-en-ia", label: "Glosario: cuota de voz en IA" },
      { href: "/blog/metricas-geo-que-medir", label: "Artículo: métricas GEO, qué medir y qué no" }
    ]
  },
  {
    slug: "mencion-verificada",
    term: "Mención verificada",
    definition:
      "Una mención de marca confirmada contra el texto real de la respuesta de un motor generativo, en vez de aceptada porque el propio modelo afirma haberla incluido — dos cosas que no siempre coinciden.",
    longDefinition:
      "Una mención verificada es una mención de marca que se ha confirmado contra el texto literal de la respuesta de un motor generativo, en vez de darse por buena porque el propio modelo, al que se le pregunta después si mencionó una marca, responde que sí. Son dos comprobaciones distintas, y no siempre coinciden.\n\nPedirle a un modelo que describa su propia respuesta es pedirle una segunda generación de texto, con su propio margen de error — puede afirmar que mencionó una marca que en realidad no aparece en ningún sitio del texto original, o al revés, pasar por alto una mención real. La única forma fiable de saberlo es leer la respuesta tal cual se generó y buscar en ella, no preguntarle al modelo por su propio trabajo.\n\nHay un segundo matiz que la verificación tiene que resolver: reconocer cómo llama la gente de verdad a una marca. Si una empresa es conocida internamente como \"Mozilla\" pero el motor generativo recomienda \"Firefox\" — su producto más conocido —, una verificación ingenua que solo busque la palabra \"Mozilla\" cuenta esa respuesta como una no-mención, cuando en realidad la marca sí apareció, bajo el nombre por el que la reconoce el público. Verificar bien exige contemplar esos alias reales, no solo el nombre legal de la empresa.",
    relatedLinks: [
      { href: "/glosario/tasa-de-mencion", label: "Glosario: tasa de mención" },
      { href: "/glosario/grounding", label: "Glosario: qué es el grounding" },
      { href: "/blog/como-saber-si-tu-marca-aparece-en-chatgpt", label: "Artículo: cómo saber si tu marca aparece en ChatGPT, Gemini y Claude" }
    ]
  },
  {
    slug: "variabilidad-respuestas-ia",
    term: "Variabilidad de las respuestas de IA",
    definition:
      "El hecho de que dos consultas idénticas a un motor generativo pueden producir respuestas distintas, porque muchos motores buscan información en tiempo real y no son deterministas. Afecta directamente a cualquier medición de visibilidad en IA.",
    longDefinition:
      "La variabilidad de las respuestas de IA es el hecho de que la misma pregunta, hecha dos veces al mismo motor generativo, puede producir respuestas distintas — mencionar marcas distintas, en orden distinto, citando fuentes distintas — sin que nada haya cambiado del lado de quien pregunta.\n\nLa causa principal es que muchos motores generativos buscan información en la web en el momento de responder, en vez de limitarse a lo que aprendieron durante su entrenamiento. Eso significa que dos ejecuciones idénticas pueden encontrar literalmente un internet distinto: un resultado de búsqueda que cambió de posición, una página que se actualizó entre medias, una fuente que apareció o desapareció del índice. A eso se suma que el propio proceso de generación de texto tiene un componente no determinista.\n\nLa consecuencia práctica es que una sola observación —una captura, una pregunta suelta hecha una vez— no es una medición fiable de nada: es una fotografía de una tirada concreta, con su propio margen de error. Leer cualquier cifra de visibilidad en IA con seriedad exige mirar la tendencia a lo largo de varias mediciones comparables entre sí, no el resultado de una sola consulta — el mismo motivo por el que una encuesta con una persona no sirve para nada y una con mil sí empieza a decir algo real.",
    relatedLinks: [
      { href: "/glosario/prompt-tracking", label: "Glosario: prompt tracking" },
      { href: "/glosario/grounding", label: "Glosario: qué es el grounding" },
      { href: "/blog/metricas-geo-que-medir", label: "Artículo: métricas GEO, qué medir y qué no" }
    ]
  },
  {
    slug: "llmo",
    term: "LLMO (Large Language Model Optimization)",
    definition:
      "Término alternativo a GEO, centrado explícitamente en optimizar contenido para que los propios modelos de lenguaje —no solo los buscadores construidos sobre ellos— lo encuentren, lo entiendan y lo citen al responder.",
    longDefinition:
      "LLMO (Large Language Model Optimization) es un término alternativo a GEO que pone el énfasis explícitamente en el modelo de lenguaje en sí — que un contenido esté escrito y estructurado de forma que un modelo pueda leerlo, entenderlo y citarlo al construir una respuesta — más que en la categoría más amplia de \"motores generativos\" que engloba GEO.\n\nEn la práctica, la frontera entre GEO, AEO y LLMO es más terminológica que operativa: los tres persiguen el mismo objetivo — ser una fuente que un sistema automatizado use al responder, en vez de limitarse a enlazarla — y comparten casi todas las mismas prácticas: respuestas directas y verificables, estructura clara, datos con procedencia. No existe un consenso único en el sector sobre cuál de los tres términos es \"el correcto\"; distintos equipos de marketing y distintas herramientas usan uno u otro según de dónde vengan, sin que eso cambie el trabajo real que hay que hacer.\n\nQuien busca \"LLMO\" suele estar buscando exactamente lo mismo que quien busca \"GEO\": cómo hacer que ChatGPT, Gemini o Claude lo mencionen y lo citen. La etiqueta importa menos que entender que se trata de optimizar para un lector que no es una persona haciendo clic en un enlace, sino un modelo que decide, en el momento de responder, qué fuentes usar y cuáles ignorar.",
    relatedLinks: [
      { href: "/glosario/geo", label: "Glosario: qué es el GEO" },
      { href: "/glosario/aeo", label: "Glosario: AEO (Answer Engine Optimization)" },
      { href: "/blog/que-es-geo-generative-engine-optimization", label: "Artículo: qué es el GEO y en qué se diferencia del SEO" }
    ]
  }
];
