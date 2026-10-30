/* ================= SCREEN: Auditoría técnica =================
   Two blocks: «Auditoría GEO» (¿te puede citar la IA?) and «Auditoría SEO»
   (¿te encuentra Google?). Each block has its score and a ghost arc up to what
   you reach if you fix what scores. Salud SEO never moves the GEO Score. */
const AU={geo:{t:'Auditoría GEO',q:'¿Te puede citar la IA?',lbl:'Nota GEO',v:72,icon:'sparkles',
 issues:[
 {id:'ds',sev:'crit',l:'Datos estructurados',pt:6,fix:1,scope:'8 páginas',why:'Los motores de IA usan los datos estructurados (schema.org) para entender quién eres, qué vendes y a qué precio. Sin ellos, tienen que adivinarlo leyendo el texto.',how:'Añade un bloque JSON-LD de tipo Organization en la portada y de tipo SoftwareApplication en tus páginas de producto.',file:'HTML',code:`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Nubaria",
  "url": "https://nubaria.es",
  "description": "«Describe aquí qué hace Nubaria»"
}
<\/script>`,pages:['/','/precios','/facturacion-electronica','/autonomos']},
 {id:'bots',sev:'crit',l:'Acceso de bots de IA',pt:5,fix:1,scope:'Perplexity bloqueado',why:'Si tu robots.txt bloquea a un motor de IA, ese motor no puede leer tu web ni citarte en sus respuestas.',how:'Permite el acceso a PerplexityBot en tu robots.txt.',file:'robots.txt',code:`User-agent: PerplexityBot
Allow: /`,bots:['Perplexity']},
 {id:'intro',sev:'warn',l:'Intro respuesta-primero',pt:4,scope:'5 páginas',why:'La IA prefiere páginas que responden en las primeras líneas. Si la respuesta llega tras tres párrafos de contexto, es menos probable que te cite.',how:'Empieza cada página clave con una frase que responda directamente a la pregunta que resuelve.',pages:['/autonomos','/precios','/blog/que-es-verifactu']},
 {id:'llms',sev:'imp',l:'llms.txt',pt:4,fix:1,scope:'No encontrado',why:'llms.txt es un índice en texto plano que ayuda a los modelos a encontrar tus páginas más importantes.',how:'Publica un fichero /llms.txt con tus páginas clave y una frase por cada una.',file:'llms.txt',code:`# Nubaria
> «Una frase sobre qué hace Nubaria»

## Páginas clave
- [Facturación electrónica](https://nubaria.es/facturacion-electronica)
- [Precios](https://nubaria.es/precios)`}],
 ok:['HTTPS y redirecciones','Contenido citable en la portada','Fecha de actualización visible','Página de contacto','Enlaces internos a tus páginas clave']},
seo:{t:'Auditoría SEO',q:'¿Te encuentra Google?',lbl:'Salud SEO',v:81,icon:'search',
 issues:[
 {id:'h1',sev:'warn',l:'Un solo <h1> por página',pt:3,scope:'4 páginas',why:'Varios encabezados principales confunden a Google sobre cuál es el tema de la página.',how:'Deja un único <h1> por página y convierte los demás en <h2>.',pages:['/','/precios','/autonomos','/plantillas']},
 {id:'tit',sev:'warn',l:'Títulos repetidos',pt:3,scope:'3 páginas',why:'Dos páginas con el mismo título compiten entre sí en Google.',how:'Escribe un título distinto para cada página que diga qué ofrece.',pages:['/plantillas','/crear-factura','/blog']},
 {id:'speed',sev:'imp',l:'Velocidad en móvil',pt:2,scope:'Portada · LCP 2,8 s',why:'Una carga lenta en móvil empeora la experiencia y puede restar posiciones.',how:'Reduce el peso de la imagen principal y difiere los scripts que no hacen falta al cargar.'},
 {id:'alt',sev:'imp',l:'Texto alternativo en imágenes',pt:2,scope:'11 imágenes',why:'El texto alternativo describe las imágenes a Google y a quien usa lector de pantalla.',how:'Añade un atributo alt descriptivo a cada imagen de contenido.'},
 {id:'sm',sev:'imp',l:'sitemap.xml',pt:2,fix:1,scope:'Índice de sitemaps',why:'Un sitemap actualizado ayuda a Google a descubrir tus páginas nuevas.',how:'Incluye tus páginas de producto en el sitemap y enlázalo desde robots.txt.',file:'robots.txt',code:`Sitemap: https://nubaria.es/sitemap.xml`}],
 ok:['Etiqueta title','Meta descripción','Indexable (sin noindex)','URL canónica','Viewport móvil','Googlebot permitido']}};
const AU_SEV={crit:'Crítico',warn:'Aviso',imp:'Mejora'};
const AU_PAGES=[['/',78,'Actualizada','420 ms','86 KB'],['/precios',71,'Actualizada','380 ms','64 KB'],['/facturacion-electronica',84,'Empieza a desactualizarse','510 ms','92 KB'],['/autonomos',66,'Desactualizada','460 ms','71 KB'],['/blog/que-es-verifactu',73,'Sin fecha detectada','350 ms','58 KB']];
const AU_BOTS=[['ChatGPT','chatgpt',1],['ChatGPT (búsqueda)','chatgpt',1],['Gemini','gemini',1],['Claude','claude',1],['Perplexity','perplexity',0]];
U.au={tab:'prob',open:'bots',dev:'m'};
const auGain=k=>AU[k].issues.reduce((a,x)=>a+x.pt,0);

/* score arc with ghost potential: 270 degrees, now in blue, ghost up to «to» */
function auArc(v,to,size=132){const r=size/2-8,c=size/2,C=2*Math.PI*r,span=.75*C;const a=span*v/100,g=span*(to-v)/100;
 return `<span class="sc-au-arc blit" style="width:${size}px;height:${size}px;--a:${a.toFixed(1)};--g:${g.toFixed(1)};--C:${C.toFixed(1)}"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><g transform="rotate(135 ${c} ${c})">
  <circle class="tr" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="${span.toFixed(1)} ${C.toFixed(1)}"/>
  <circle class="gh" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="0 ${C.toFixed(1)}" style="stroke-dashoffset:${(-a).toFixed(1)}"/>
  <circle class="now" cx="${c}" cy="${c}" r="${r}" stroke-dasharray="0 ${C.toFixed(1)}"/></g></svg>
  <span class="n"><b class="num">${roll(v)}</b><small>/100</small></span></span>`}

function auHero(k){const B=AU[k],gain=auGain(k),to=Math.min(100,B.v+gain),crit=B.issues.filter(x=>x.sev==='crit').length;
 return `<section class="card sc-au-hero" aria-label="${B.lbl}: ${B.v} de 100. Puedes llegar a ${to}.">
  ${auArc(B.v,to,104)}
  <div class="rt"><span class="lb">${B.lbl}</span><span class="mt num">${crit?`<b>${crit} ${crit===1?'crítico':'críticos'}</b> · `:''}${B.issues.length} problemas</span><span class="to">Puedes llegar a <b class="num">${to}</b></span></div>
  <button class="pot" data-act="auPot" data-arg="${k}">${ic('arrowup','sm')}<b class="num">+${gain} pt</b><span class="px"> si arreglas ${B.issues.length} problemas</span>${ic('chevr','sm')}</button>
 </section>`}

function auIssue(x){const op=U.au.open===x.id;
 return `<div class="sc-au-iss ${op?'open':''}"><button class="h" data-act="auIss" data-arg="${x.id}" aria-expanded="${op}"><span class="sd ${x.sev}" aria-hidden="true"></span><span class="l"><b>${bEsc(x.l)}</b><span>${AU_SEV[x.sev]} · ${x.scope}</span></span>${x.fix?'<span class="badge b-blue">Solución disponible</span>':'<span></span>'}<span class="pt num">+${x.pt} pt</span>${ic('chevd','sm')}</button>
 ${op?`<div class="b"><div class="two"><div><div class="lbl">Por qué importa</div><p>${x.why}</p></div><div><div class="lbl">Cómo arreglarlo</div><p>${bEsc(x.how)}</p></div></div>
  ${x.pages?`<div class="lbl mt">Páginas afectadas</div><div class="pg">${x.pages.map(p=>`<code class="p">${p}</code>`).join('')}</div>`:''}
  ${x.bots?`<div class="lbl mt">Bots bloqueados</div><div class="pg">${x.bots.map(p=>`<span class="badge b-warm">${lg(p.toLowerCase(),11)}${p}</span>`).join('')}</div>`:''}
  ${x.code?bCode(x.file,x.code,true)+'<p class="hint">Sustituye «el texto entre comillas» por tu texto antes de publicarlo.</p>':''}</div>`:''}</div>`}

function auCwv(){const m=U.au.dev==='m';const rows=m?[['Carga del contenido principal','LCP','2,8 s','Mejorable',.55],['Respuesta al tocar','INP','180 ms','Bueno',.2],['Estabilidad visual','CLS','0,04','Bueno',.12]]:[['Carga del contenido principal','LCP','1,6 s','Bueno',.24],['Respuesta al hacer clic','INP','90 ms','Bueno',.1],['Estabilidad visual','CLS','0,02','Bueno',.06]];
 return `<div class="card sc-au-cwv"><div class="card-h"><h3>Optimización de tu página Home</h3><span class="new">Nuevo</span><span style="margin-left:auto">${seg('au-dev',[['m','Móvil'],['d','Escritorio']],U.au.dev,'auDev')}</span></div>
 <div class="card-b"><div class="g3">${rows.map(([n,c,v,r,p])=>`<div class="cw"><div class="t"><span>${n}</span><span class="c">${c}</span></div><div class="v"><b class="num">${v}</b><span class="badge ${r==='Bueno'?'b-pos':'b-warm'}">${r}</span></div>
  <div class="zone" role="img" aria-label="${n}: ${v}, ${r}"><i class="ok"></i><i class="mid"></i><i class="bad"></i><span style="left:${p*100}%"></span></div><div class="zl"><span>Bueno</span><span>Mejorable</span><span>Lento</span></div></div>`).join('')}</div>
  <p class="hint">Datos de PageSpeed Insights sobre tu portada.</p></div></div>`}

const AU_NOTE={geo:'Lo que la IA necesita para poder citarte. Que acabe citándote depende también del contenido, que trabajas en Recomendaciones.',seo:'Lo que Google necesita para encontrar tu web, entenderla y enseñarla rápido.'};
const AU_TITLE={geo:'Tu web para la IA',seo:'Tu web para Google'};
function auPage(k){const B=AU[k],geo=k==='geo',tab=U.au.tab;if(!B.issues.some(x=>x.id===U.au.open))U.au.open=B.issues[0].id;
 const main=tab==='prob'?`${geo?'':auCwv()}<div class="card"><div class="card-h"><h3>Problemas</h3><span class="see" style="cursor:default">Ordenados por lo que suman</span></div><div class="card-b sc-au-list">${B.issues.map(auIssue).join('')}</div></div>`
  :tab==='ok'?`<div class="card"><div class="card-h"><h3>Lo que ya está bien</h3></div><div class="card-b sc-au-okl">${B.ok.map(p=>`<div>${ic('checkc','sm')}<span>${p}</span></div>`).join('')}</div></div>`
  :`<div class="card"><div class="card-h"><h3>Páginas revisadas</h3><span class="see" style="cursor:default">Puntos por página</span></div><div class="card-b sc-au-pages">${AU_PAGES.map(([u,s,f,t,kb],i)=>`<div class="r"><span class="u"><code class="p">${u}</code><span>Respuesta ${t} · HTML ${kb}</span></span><span class="badge ${f==='Actualizada'?'b-pos':f==='Desactualizada'?'b-warm':'b-line'}">${f}</span><span class="s num">${s}<small>/100</small></span>${bar(s,{cls:'thin '+(s<70?'warm':''),delay:i*60})}</div>`).join('')}</div></div>`;
 const side=geo?`<div class="card"><div class="card-h"><h3>Acceso de bots de IA</h3></div><div class="card-b sc-au-bots">${AU_BOTS.map(([n,l,ok])=>`<div class="${ok?'':'no'}"><span class="n">${lg(l,14)}${n}</span>${ok?`<span class="ok">${ic('checkc','sm')}Permitido</span>`:`<span class="ko">${ic('x','sm')}Bloqueado</span>`}</div>`).join('')}<div><span class="n mono">llms.txt</span><span class="wn">${ic('warn','sm')}No encontrado</span></div><div><span class="n mono">sitemap.xml</span><span class="ok">${ic('checkc','sm')}Encontrado</span></div></div></div>`:'';
 return `<div class="sc-au"><div class="eyebrow bare">Auditoría técnica · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span></div>
 <h1 style="margin-top:14px">${AU_TITLE[k]}</h1>
 <p class="lead">${AU_NOTE[k]}${geo?` Lo más urgente: <a href="#auditgeo" data-act="auGo" data-arg="bots">Perplexity no puede leerte</a>.`:''}</p>
 ${auHero(k)}
 <div class="sc-au-tabs">${seg('au-tab',[['prob',`Problemas · ${B.issues.length}`],['ok',`Correcto · ${B.ok.length}`],['pg','Páginas · 5']],tab,'auTab')}</div>
 <div class="${geo?'sc-au-grid':''}" style="margin-top:16px"><div class="stk">${main}</div>${geo?`<div class="stk">${side}</div>`:''}</div></div>`}
SCREENS.auditgeo={title:AU_TITLE.geo,render(){return auPage('geo')},after(root,first){bLight(root,first)}};
SCREENS.auditseo={title:AU_TITLE.seo,render(){return auPage('seo')},after(root,first){bLight(root,first)}};

ACT.auTab=el=>{U.au.tab=el.dataset.arg;bRe()};
ACT.auIss=el=>{const id=el.dataset.arg;U.au.open=U.au.open===id?null:id;bRe()};
ACT.auDev=el=>{U.au.dev=el.dataset.arg;bRe()};
function auScrollTo(sel){setTimeout(()=>{const sc=$('#sc'),e=$(sel);if(sc&&e)sc.scrollTo({top:e.getBoundingClientRect().top-sc.getBoundingClientRect().top+sc.scrollTop-90,behavior:RM.matches?'auto':'smooth'})},40)}
ACT.auPot=el=>{const k=el.dataset.arg;U.au.tab='prob';U.au.open=AU[k].issues[0].id;bRe();auScrollTo('.sc-au-list')};
ACT.auGo=el=>{U.au.tab='prob';U.au.open=el.dataset.arg;bRe();auScrollTo('.sc-au-iss.open')};
