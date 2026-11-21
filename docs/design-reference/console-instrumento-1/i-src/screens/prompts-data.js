/* ================= DATA: prompts (fiction, from G) =================
   Each prompt: t text, m brand named (1/0), s sentiment of the mentions,
   nc competitors named in its answers, e engines that named the brand.
   nw = added in this session, not scanned yet. */
const PR_CAP=25; // Pro plan
const PR_TOPICS=[
 {n:'Software de facturación',v:43,sent:'Positivo',men:7,p:[
  {t:'¿Qué app de facturas recomiendas para una pyme de 10 empleados?',m:1,s:'Positivo',nc:3,e:['chatgpt','gemini','perplexity']},
  {t:'¿Cuál es el software de facturación más fácil de usar?',m:1,s:'Positivo',nc:2,e:['gemini','claude']},
  {t:'Programa de facturación con control de stock para pymes',m:0,s:'',nc:3,e:[]},
  {t:'¿Qué software de facturación usan las gestorías?',m:0,s:'',nc:4,e:[]}]},
 {n:'Facturación electrónica y Verifactu',v:50,sent:'Neutral',men:8,p:[
  {t:'¿Qué software de facturación cumple con Verifactu?',m:1,s:'Neutral',nc:3,e:['chatgpt','gemini','claude','perplexity']},
  {t:'¿Cómo emitir facturas electrónicas obligatorias en 2026?',m:0,s:'',nc:2,e:[]},
  {t:'¿Qué es Verifactu y qué programa lo cumple?',m:1,s:'Positivo',nc:3,e:['gemini','perplexity']},
  {t:'Software de factura electrónica para pymes homologado',m:0,s:'',nc:3,e:[]}]},
 {n:'Autónomos',v:60,sent:'Positivo',men:9,p:[
  {t:'¿Cuál es el mejor programa de facturación para autónomos en España?',m:1,s:'Positivo',nc:4,e:['chatgpt','gemini','perplexity']},
  {t:'App gratuita para hacer facturas siendo autónomo',m:1,s:'Mixto',nc:2,e:['gemini']},
  {t:'¿Cómo llevar la contabilidad de un autónomo con una app?',m:0,s:'',nc:2,e:[]}]},
 {n:'Comparativas',v:33,sent:'Neutral',men:5,p:[
  {t:'Alternativas a Cuentix para pymes',m:1,s:'Neutral',nc:4,e:['gemini','claude']},
  {t:'Cuentix vs Factulia: ¿cuál es mejor?',m:0,s:'',nc:2,e:[]},
  {t:'Comparativa de programas de facturación online',m:0,s:'',nc:4,e:[]}]},
 {n:'Precios',v:20,sent:'',men:2,p:[
  {t:'¿Cuánto cuesta un programa de facturación online?',m:0,s:'',nc:3,e:[]},
  {t:'Software de facturación barato para pymes',m:1,s:'Neutral',nc:3,e:['perplexity']},
  {t:'¿Hay programas de facturación sin cuota mensual?',m:0,s:'',nc:2,e:[]}]}];
PR_TOPICS.forEach((tp,ti)=>tp.p.forEach((p,pi)=>{p.id=`p${ti}-${pi}`;p.ti=ti}));

/* proposals for «Añadir prompts» (first pass and «Volver a generar») */
const PR_PROPS=[
 ['¿Qué programa de facturación tiene la mejor app para el móvil?','Software de facturación'],
 ['¿Cuánto cuesta Verifactu para un autónomo?','Facturación electrónica y Verifactu'],
 ['Programa de facturación con conexión a mi gestoría','Software de facturación'],
 ['¿Qué software de facturación es más barato que Cuentix?','Comparativas'],
 ['¿Puedo hacer facturas electrónicas gratis en 2026?','Facturación electrónica y Verifactu']];
const PR_PROPS2=[
 ['¿Qué programa de facturación conecta con mi banco?','Software de facturación'],
 ['Factulia o Nubaria para un autónomo que empieza','Comparativas'],
 ['¿Qué programa de facturación tiene plan gratuito para autónomos?','Precios'],
 ['¿Cómo enviar facturas con Verifactu desde el móvil?','Facturación electrónica y Verifactu'],
 ['Mejor software de facturación para tiendas pequeñas','Software de facturación'],
 ['¿Qué programa de facturación usan los autónomos en Madrid?','Autónomos']];

/* the one answer we show, per prompt and engine (fiction) */
const PR_SOURCES=[['nubaria.es/facturacion-electronica',['gemini','perplexity'],1],['guiapymes.es/mejores-programas-facturacion',['chatgpt','gemini','perplexity']],['cuentix.com/precios',['gemini','perplexity']],['softwarepyme.net/comparativa-2026',['chatgpt']]];
