/* ================= DATA: recommendations (fiction) =================
   34 actions: 4 in the plan of the week + 30 in «Más adelante», 8 levers.
   type: gen (IA, can be marked), third (outreach: depends on third parties but
         the user sends the email, so it CAN be marked; verified next scan),
         google (outcome, followed by GenScore: no marking), gaction (Google
         task the user does: can be marked), watch, comp, agent. */
const PLAN=[
 {id:'r1',src:'ia',type:'gen',kind:'Contenido comparativo',do:'Crea /nubaria-vs-cuentix con una tabla que compare precio, Verifactu y número de usuarios.',why:'Cuentix sale en tus preguntas comparativas y tú no.',pt:6,e:['chatgpt','gemini','claude'],gen:'Generar comparativa',genT:'Comparativa Nubaria vs Cuentix',qs:['Alternativas a Cuentix para pymes','Cuentix vs Factulia: ¿cuál es mejor?','Comparativa de programas de facturación online','Software de facturación barato para pymes']},
 {id:'g1',src:'google',type:'google',kind:'Reforzar una página',do:'Refuerza /autonomos para «programa facturación autónomos».',why:'La ven 6.240 veces al mes y estás a 2 puestos de la página 1.',track:[15,12,10],imp:'Impacto medio'},
 {id:'r2',src:'ia',type:'gen',kind:'Respuesta directa',do:'Añade 5 preguntas y respuestas cortas sobre Verifactu al final de /facturacion-electronica.',why:'La IA cita la FAQ de Factulia porque la tuya no responde directo.',pt:5,quick:1,e:['chatgpt','gemini','claude','perplexity'],gen:'Generar FAQ',genT:'FAQ sobre Verifactu para /facturacion-electronica',qs:['¿Qué software de facturación cumple con Verifactu?','¿Qué es Verifactu y qué programa lo cumple?','Software de factura electrónica para pymes homologado']},
 {id:'r3',src:'ia',type:'third',kind:'Autoridad en terceros',do:'Escribe a guiapymes.es y softwarepyme.net para que incluyan a Nubaria en sus comparativas.',why:'Sus comparativas salen como fuente y no te nombran.',pt:3,third:1,e:['chatgpt','gemini','perplexity'],gen:'Generar plan de contacto',genT:'Plan de contacto',qs:['Comparativa de programas de facturación online','Software de facturación barato para pymes']}];

const LEVERS=[
 {k:'comp',l:'Contenido comparativo',d:'Páginas que comparan Nubaria con quien ya sale en las respuestas.',items:[
  {id:'c1',src:'ia',type:'gen',do:'Crea /nubaria-vs-factulia con una tabla de precio, Verifactu y soporte.',why:'Factulia sale en 5 preguntas comparativas y tú no.',pt:4,e:['chatgpt','claude'],n:5,gen:'Generar comparativa'},
  {id:'c2',src:'ia',type:'gen',do:'Crea /alternativas-a-cuentix con tus diferencias en tres líneas.',why:'La IA responde a «alternativas a Cuentix» sin nombrarte.',pt:3,e:['chatgpt','gemini'],n:3,gen:'Generar página'},
  {id:'c3',src:'ia',type:'gen',do:'Crea /mejor-programa-facturacion-autonomos con criterios claros y una tabla.',why:'En las preguntas de «mejor programa» la IA nombra a tres rivales.',pt:3,e:['gemini','claude','perplexity'],n:4,gen:'Generar página'},
  {id:'c4',src:'ia',type:'gen',do:'Pon fecha de actualización y una tabla en /comparativas/librocloud.',why:'La IA cita tu página, pero toma los datos de Librocloud.',pt:2,e:['perplexity'],n:2,gen:'Generar tabla'}]},
 {k:'direct',l:'Respuesta directa',d:'Responde en las primeras líneas a las preguntas que ya te hacen.',items:[
  {id:'tp',src:'ia',type:'gen',do:'Responde en las primeras frases de /precios las 3 preguntas sobre precios.',why:'La IA nombra a Cuentix y a Factulia en ese tema, y a ti no.',pt:3,e:['chatgpt','gemini','claude'],n:3,gen:'Generar entradilla',saw:'En las 3 preguntas sobre precios la IA nombra a Cuentix y a Factulia, y cita sus páginas de precios. A ti no te nombra.'},
  {id:'d2',src:'ia',type:'gen',do:'Di en la primera frase de /verifactu qué es y desde cuándo es obligatorio.',why:'Gemini cita a Factulia para definirlo.',pt:2,quick:1,e:['gemini'],n:2,gen:'Generar entradilla'},
  {id:'d3',src:'ia',type:'gen',do:'Pon en /autonomos para quién es y cuánto cuesta en las dos primeras líneas.',why:'La IA no sabe decir a quién va dirigido tu plan de autónomos.',pt:2,e:['chatgpt','claude'],n:2,gen:'Generar entradilla'},
  {id:'d4',src:'ia',type:'gen',do:'Lista en /integraciones con qué bancos conecta Nubaria.',why:'Te preguntan por bancos y la IA responde con Cuentix.',pt:1,e:['chatgpt'],n:1,gen:'Generar lista'},
  {id:'d5',src:'ia',type:'gen',do:'Responde en /facturacion-electronica si hace falta certificado digital.',why:'Es una duda frecuente y tu página no la contesta.',pt:1,quick:1,e:['claude','perplexity'],n:2,gen:'Generar respuesta'}]},
 {k:'third',l:'Autoridad en terceros',d:'Webs que la IA cita y que no te nombran. El resultado depende de ellas.',items:[
  {id:'a1',src:'ia',type:'third',do:'Pide a foroautonomos.es que añada Nubaria a su hilo de programas de facturación.',why:'Perplexity cita ese hilo en 3 respuestas.',pt:2,e:['perplexity'],n:3,gen:'Generar mensaje'},
  {id:'a2',src:'ia',type:'third',do:'Escribe a comparasaas.es para entrar en su comparativa de facturación.',why:'ChatGPT y Gemini la citan como fuente.',pt:2,e:['chatgpt','gemini'],n:2,gen:'Generar mensaje'},
  {id:'a3',src:'ia',type:'third',do:'Propón a revistaempresa.es un artículo con datos de Verifactu en pymes.',why:'Es la fuente que más cita Claude sobre Verifactu.',pt:1,e:['claude'],n:2,gen:'Generar propuesta'},
  {id:'a4',src:'ia',type:'third',do:'Pide a gestoriahoy.es una reseña de Nubaria para gestorías.',why:'Aparece en las preguntas de gestorías y no te nombra.',pt:1,e:['gemini'],n:1,gen:'Generar mensaje'}]},
 {k:'brand',l:'Ficha de marca',d:'Que la IA tenga una descripción clara y consistente de Nubaria.',items:[
  {id:'fm',src:'ia',type:'gen',do:'Crea /sobre-nubaria con qué haces, para quién y desde cuándo.',why:'Claude y Gemini describen a Nubaria de forma distinta.',pt:2,e:['gemini','claude'],n:4,gen:'Generar ficha de marca'},
  {id:'f2',src:'ia',type:'gen',do:'Usa la misma descripción de Nubaria en tu portada, /sobre-nubaria y tus perfiles.',why:'Hoy hay tres descripciones distintas.',pt:1,e:['chatgpt'],n:2,gen:'Generar descripción'},
  {id:'f3',src:'ia',type:'gen',do:'Añade el año de fundación y la sede a /contacto.',why:'Gemini da un año de fundación que tu web no confirma.',pt:1,quick:1,e:['gemini'],n:1,gen:'Generar texto'}]},
 {k:'tech',l:'Técnico',d:'Lo que impide que la IA o Google lean bien tu web.',items:[
  {id:'t1',src:'ia',type:'gen',do:'Pega el bloque JSON-LD de organización en tu portada.',why:'Tu portada no dice en datos estructurados quién eres.',pt:3,gen:'Generar checklist'},
  {id:'t2',src:'ia',type:'gen',do:'Sube /llms.txt con tus 6 páginas clave.',why:'Los asistentes no tienen un índice corto de tu web.',pt:2,quick:1,gen:'Generar llms.txt'},
  {id:'t3',src:'ia',type:'gen',do:'Haz que /precios enseñe los planes sin depender de JavaScript.',why:'Los rastreadores de IA ven la tabla vacía.',pt:2,gen:'Generar checklist'},
  {id:'t4',src:'google',type:'gaction',do:'Deja un solo &lt;h1&gt; en 4 páginas.',why:'Google no sabe cuál es el título principal.',imp:'Impacto bajo'}]},
 {k:'google',l:'Con tus datos de Google',d:'Lo que Search Console dice hoy de tus páginas.',items:[
  {id:'g2',src:'google',type:'gaction',do:'Reescribe el título de /plantillas para que diga qué ofreces.',why:'La ven 7.910 veces y entra el 0,3%. En tu web lo normal en ese puesto es 1,2%.',imp:'Impacto medio'},
  {id:'g4',src:'google',type:'google',do:'Refuerza /verifactu para «software verifactu».',why:'La ven 3.180 veces al mes y estás en el puesto 14.',track:[18,14,10],imp:'Impacto medio'},
  {id:'g5',src:'google',type:'google',do:'Refuerza /plantillas/factura para «plantilla factura autónomo».',why:'Subió 3 puestos sin tocarla. Está cerca de la página 1.',track:[16,13,10],imp:'Impacto bajo'},
  {id:'g3',src:'google',type:'watch',do:'Añade «qué es verifactu» a tus prompts.',why:'Ya te encuentran en Google con esa pregunta (puesto 6,8).',imp:'Impacto bajo',prompt:'qué es verifactu'},
  {id:'g6',src:'google',type:'gaction',do:'Reescribe la descripción de /precios con el precio desde y la prueba.',why:'Google enseña un texto cortado.',imp:'Impacto bajo'}]},
 {k:'agent',l:'Comercio agéntico',d:'Lo que frena a un agente que quiere comprar.',items:[
  {id:'ag1',src:'agent',type:'agent',do:'Publica tu política de cancelación y reembolso y enlázala desde /precios.',why:'Un agente no encuentra tus condiciones y no puede explicar la compra.',imp:'Impacto medio'},
  {id:'ag2',src:'agent',type:'agent',do:'Marca tus planes con precio y moneda en datos de producto.',why:'Un agente lee «desde 9» sin saber en qué moneda.',imp:'Impacto medio'},
  {id:'ag3',src:'agent',type:'agent',do:'Deja que un agente llegue al alta sin pasar por un formulario de contacto.',why:'El botón de alta abre un formulario que un agente no rellena.',imp:'Impacto bajo'}]},
 {k:'follow',l:'Seguimiento',d:'Vigila a quien ya aparece en tus respuestas.',items:[
  {id:'kc',src:'ia',type:'comp',do:'Añade Kontaro a tus competidores.',why:'La IA la nombra en 4 consultas y no la sigues.',imp:'Impacto bajo',name:'Kontaro'},
  {id:'w2',src:'ia',type:'watch',do:'Añade «programa de facturación con TPV» a tus prompts.',why:'Gemini nombra a Kontaro con esa pregunta.',imp:'Impacto bajo',prompt:'programa de facturación con TPV'}]}];
LEVERS.forEach(g=>g.items.forEach(x=>{x.lever=g.k;x.kind=g.l;if(x.type==='third')x.third=1}));
const LATER=LEVERS.flatMap(g=>g.items);
const RES=[['Ya lo tienes','Contenido comparativo','Publica una página comparativa Nubaria vs Factulia','Ya tienes una comparativa con este competidor:','nubaria.es/comparativas/factulia'],['Resuelta sola','Respuesta directa','Publica una página de precios con una tabla clara','Confirmado el 4 oct.'],['Hecha','Técnico','Permite el acceso a GPTBot en robots.txt','Marcada el 2 oct.']];
