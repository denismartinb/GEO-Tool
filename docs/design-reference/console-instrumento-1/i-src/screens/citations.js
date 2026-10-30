/* ================= SCREEN: Páginas citadas =================
   One citations visual in 4 groups (Tuyas, Terceros que te nombran,
   Competidores, Otros terceros), the honesty footnote, «Fuentes
   alcanzables» grouped by domain and the table of pages with search and tabs.
   «Te nombran» is a fact about the ANSWER, never about the page
   (.claude/rules/citations.md). Uses aFav from prompts.js. */
const CT_ORIG=[['Tuyas',4,'var(--blue)','Páginas de nubaria.es.','Tuyas'],['Terceros que te nombran',14,'var(--blue-soft)','Webs ajenas citadas en respuestas que te nombran.','Terceros'],['Competidores',17,'var(--ink-2)','Páginas de Cuentix, Factulia y otros rivales.','Competidores'],['Otros terceros',65,'var(--tick-off)','Webs ajenas en respuestas que no te nombran.','Terceros']];
/* reachable sources: cited by the AI in answers that do not name you. Encyclopedias and rival sites are left out. */
const CT_REACH=[['guiapymes.es',18,['chatgpt','gemini','perplexity'],'Cuentix',3],['softwarepyme.net',12,['gemini','perplexity'],'Factulia',3],['foroautonomos.es',11,['chatgpt','perplexity'],'Cuentix',2],['comparasaas.es',8,['gemini'],'Cuentix'],['blogdelautonomo.es',7,['perplexity'],''],['revistaempresa.es',6,['chatgpt','gemini'],'Factulia'],['gestoriahoy.es',6,['gemini'],'Librocloud'],['emprendedores.info',5,['perplexity'],''],['facturasfaciles.org',4,['gemini'],'Cuentix'],['pymesdigitales.es',4,['chatgpt'],''],['tecnopyme.com',3,['perplexity'],'Kontaro'],['ayudaautonomos.net',3,['gemini'],''],['contables.es',2,['chatgpt'],'']];
const CT_Q=['¿Qué app de facturas recomiendas para una pyme de 10 empleados?','Comparativa de programas de facturación online','Software de facturación barato para pymes','¿Qué software de facturación usan las gestorías?'];
const CT_PAGES=[['guiapymes.es/mejores-programas-facturacion','Los 10 mejores programas de facturación para pymes','Comparador',22],['cuentix.com/precios','Precios de Cuentix','Competidor',19],['nubaria.es/facturacion-electronica','Facturación electrónica y Verifactu · Nubaria','Tuya',14],['es.wikipedia.org/wiki/Factura_electrónica','Factura electrónica · Wikipedia','Enciclopedia',12],['foroautonomos.es/hilo/que-programa-usais','¿Qué programa de facturación usáis?','Comunidad',11],['factulia.es/verifactu','Verifactu: todo lo que necesitas saber','Competidor',10],['softwarepyme.net/comparativa-2026','Comparativa de software de facturación 2026','Comparador',9],['nubaria.es/precios','Precios · Nubaria','Tuya',7],['revistaempresa.es/verifactu-pymes','Verifactu: lo que cambia para las pymes','Medio',6],['librocloud.io/gestorias','Librocloud para gestorías','Competidor',5],['comparasaas.es/facturacion','Comparativa de programas de facturación','Comparador',5],['nubaria.es/autonomos','Facturación para autónomos · Nubaria','Tuya',4],['gestoriahoy.es/herramientas','Herramientas para gestorías','Medio',4],['kontaro.es/tpv','Kontaro TPV y facturación','Competidor',3],['blogdelautonomo.es/facturar-gratis','Cómo facturar gratis siendo autónomo','Medio',3],['nubaria.es/comparativas/factulia','Nubaria frente a Factulia','Tuya',2]];
const CT_TABS=[['Todas',128],['Tuyas',6],['Competidores',22],['Terceros',100]];
Object.assign(U,{ctTab:'Todas',ctQ:'',ctOpen:null,ctMore:0});

const ctType=t=>t==='Tuya'?'Tuyas':t==='Competidor'?'Competidores':'Terceros';
function ctRows(){const q=fold(U.ctQ);return CT_PAGES.filter(p=>(U.ctTab==='Todas'||ctType(p[2])===U.ctTab)&&(!q||fold(p[0]+' '+p[1]).includes(q)))}
function ctTable(){const rows=ctRows();const max=CT_PAGES[0][3];const tot=CT_TABS.find(t=>t[0]===U.ctTab)[1];
 return `<div class="ct-cnt num">${rows.length?`Las ${rows.length} más citadas de ${tot} páginas`:''}</div><div class="ct-tb" role="table" aria-label="Páginas citadas"><div class="ct-tr h" role="row"><span role="columnheader">Página citada</span><span role="columnheader">Tipo</span><span role="columnheader">Citas</span></div>
 ${rows.map(([u,t,ty,n],i)=>`<div class="ct-tr" role="row"><span role="cell" class="pg">${aFav(u)}<span><b>${U.ctQ&&typeof markHtml==='function'?markHtml(esc(t),U.ctQ):esc(t)}</b><span class="mono">${u}</span></span></span><span role="cell"><span class="badge ${ty==='Tuya'?'b-blue':ty==='Competidor'?'b-line ct-cb':'b-line'}">${ty}</span></span><span role="cell" class="n">${bar(n,{max,cls:'thin nomark '+(ty==='Tuya'?'':'ink'),delay:i*30})}<b class="num">${n}</b></span></div>`).join('')||`<div class="empty-s">No hay páginas con estos filtros.<div style="margin-top:12px"><button class="btn sm line" data-act="ctclear">Quitar filtros</button></div></div>`}</div>`}
function ctPaintTable(){const b=$('#ct-tbl');if(b){b.innerHTML=ctTable();armMotion(b,false)}}

function ctReach(){const SHOW=5;const list=U.ctMore?CT_REACH:CT_REACH.slice(0,SHOW);const max=CT_REACH[0][1];
 return list.map(([d,n,es,co,pg],i)=>{const op=U.ctOpen===d;return `<div class="ct-rr ${op?'open':''}"><button data-act="ctreach" data-arg="${d}" aria-expanded="${op}">${aFav(d)}<span class="t"><b>${d}</b><span class="num">${n} citas · ${pg||1} ${pg>1?'páginas':'página'} · ${es.length} ${es.length>1?'motores':'motor'}</span></span><span class="e" aria-label="La citan ${engNames(es)}">${es.map(k=>lg(k,13)).join('')}</span>${bar(n,{max,cls:'thin ink nomark',delay:i*50})}${ic('chevd','sm')}</button>
  ${op?`<div class="ct-rx"><div class="lbl">Preguntas donde la citan sin nombrarte</div><ul>${CT_Q.slice(0,Math.min(4,Math.max(2,pg||2))).map(q=>`<li>${q}</li>`).join('')}</ul>${co?`<p class="ct-co">${ic('warn','sm')}Citada en una respuesta donde también apareció ${co} (sin verificar en la página).</p>`:''}<div class="acts">${d==='guiapymes.es'||d==='softwarepyme.net'?`<button class="btn sm ink" data-route="recs" data-idx="3">Ver la recomendación${ic('arrowr','sm')}</button>`:''}<button class="btn sm line" data-act="ctfilter" data-arg="${d}">${ic('search','sm')}Ver sus páginas</button></div></div>`:''}</div>`}).join('')+
 (CT_REACH.length>SHOW?`<button class="more" data-act="ctmore" aria-expanded="${!!U.ctMore}">${U.ctMore?'Ver menos':`Ver ${CT_REACH.length-SHOW} más`}${ic('chevd','sm')}</button>`:'')}
function ctPaintReach(){const b=$('#ct-reach');if(b){b.innerHTML=ctReach();armMotion(b,false)}}

SCREENS.citations={title:'Páginas citadas',render(){
 return `<div class="sc-cit">
 <div class="eyebrow bare">Páginas citadas · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span></div>
 <h1 style="margin-top:14px">Páginas citadas</h1>
 <p class="lead">Las webs que la IA usa como fuente. El 4% de las citas son tuyas y hay <a href="#citations" data-act="ctjump" data-arg="reach">13 webs alcanzables</a> que no te nombran.</p>
 <div class="pills"><a class="chip" href="#audit" data-route="audit">${ic('audit','sm')}¿Tus páginas se pueden citar?</a></div>

 <section class="sec"><div class="kpis ct-k">
  <div class="kpi"><div class="l">Respuestas con cita</div><div class="v"><b>${roll(64)}</b><span class="u">%</span></div><p class="ct-kc">De las respuestas del último escaneo citan al menos una página.</p></div>
  <div class="kpi"><div class="l">Citas totales</div><div class="v"><b>${roll(212)}</b></div><p class="ct-kc">A 128 páginas distintas.</p></div>
  <div class="kpi"><div class="l">Citas a tu web</div><div class="v"><b>${roll(9)}</b><span class="badge b-warm">4%</span></div><p class="ct-kc">A páginas de nubaria.es.</p></div>
 </div></section>

 <section class="sec"><div class="eyebrow">De dónde salen las citas</div>
  <div class="card ct-or"><div class="ct-ol"><h3 class="ct-dh">Páginas citadas por la IA en tus prompts</h3>${ctDonut()}</div>
   <div class="ct-orr">${CT_ORIG.map(([l,v,c,d,tab])=>`<button class="ct-og" data-act="ctorig" data-arg="${tab}" data-g="${l}" title="Ver estas páginas en la lista"><i style="background:${c}"></i><span class="t"><b>${l}</b><span>${d}</span></span><b class="num p">${v}<small>%</small></b>${ic('chevr','sm')}</button>`).join('')}
   <p class="ct-fn">${ic('shield','sm')}«Te nombran» sale de la respuesta de la IA, no de la página: no leemos el contenido de las páginas citadas.</p></div></div></section>

 <section class="sec" id="ct-reach-s"><div class="eyebrow">Fuentes alcanzables</div>
  <div class="ct-rh"><h2>13 webs que la IA cita y no te nombran</h2><p>Agrupadas por web. Las respuestas donde aparecen no te nombran: escribirles es la vía más directa para entrar.</p></div>
  <div class="ct-rl" id="ct-reach">${ctReach()}</div></section>

 <section class="sec" id="ct-pages"><div class="eyebrow">Todas las páginas</div>
  <div class="toolbar ct-tool">${seg('ct-seg',CT_TABS.map(([t,n])=>[t,`${t} <span class="num">${n}</span>`]),U.ctTab,'cttab')}
   <label class="search">${ic('search','sm')}<input id="ct-q" type="search" placeholder="Busca una página o un dominio" value="${esc(U.ctQ)}" aria-label="Buscar página o dominio"></label></div>
  <div id="ct-tbl">${ctTable()}</div></section>
 </div>`},
 after(root,first){const q=$('#ct-q',root);q.addEventListener('input',()=>{U.ctQ=q.value;ctPaintTable()});
  const dn=$('.ct-dn',root);const on=()=>dn.classList.add('on');if(!first||RM.matches){dn.classList.add('now');on()}else requestAnimationFrame(()=>requestAnimationFrame(on));
  $$('.ct-ds,.ct-og',root).forEach(e=>{const g=e.dataset.g;e.addEventListener('mouseenter',()=>ctHi(g));e.addEventListener('mouseleave',()=>ctHi(null));e.addEventListener('focus',()=>ctHi(g));e.addEventListener('blur',()=>ctHi(null))});
  $$('.ct-ds',root).forEach(e=>e.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();e.dispatchEvent(new MouseEvent('click',{bubbles:true}))}}))}};

function ctSetTab(t){U.ctTab=t;$$('#ct-seg button').forEach(b=>{const on=b.dataset.arg===t;b.setAttribute('aria-pressed',on);b.setAttribute('aria-selected',on)});segInd($('#ct-seg'));ctPaintTable()}
const ctScroll=id=>{const e=$('#'+id);e&&e.scrollIntoView({block:'start',behavior:RM.matches?'auto':'smooth'})};
ACT.cttab=el=>ctSetTab(el.dataset.arg);
function ctDonut(){const R=78,C=2*Math.PI*R,G=4;let a=0;
 const segs=CT_ORIG.map(([l,v,c,d,tab],i)=>{const len=C*v/100;const seg=`<circle class="ct-ds" cx="100" cy="100" r="${R}" style="--c:${c};--len:${Math.max(len-G,1).toFixed(1)};--C:${C.toFixed(1)};--off:${(-a).toFixed(1)};--bd:${i*110}ms" data-g="${l}" data-v="${v}" data-act="ctorig" data-arg="${tab}" tabindex="0" role="button" aria-label="${l}: ${v}% de las páginas citadas. Ver sus páginas"/>`;a+=len;return seg}).join('');
 return `<div class="ct-dn"><svg viewBox="0 0 200 200" aria-hidden="false"><circle cx="100" cy="100" r="${R}" class="ct-dt"/>${segs}</svg>
  <div class="ct-dc" aria-live="polite"><div class="v num" id="ct-dv">${roll(128)}</div><p id="ct-dl">páginas distintas</p></div></div>`}
function ctHi(g){const v=g?CT_ORIG.find(o=>o[0]===g):null;
 $$('.ct-ds').forEach(e=>e.classList.toggle('dim',!!g&&e.dataset.g!==g));$$('.ct-og').forEach(e=>e.classList.toggle('dim',!!g&&e.dataset.g!==g));
 const dv=$('#ct-dv'),dl=$('#ct-dl');if(!dv)return;
 if(v){dv.innerHTML=`${v[1]}<small>%</small>`;dl.textContent=`${v[0]} · unas ${Math.round(128*v[1]/100)} páginas`}else{dv.textContent='128';dl.textContent='páginas distintas'}}
ACT.ctorig=el=>{ctSetTab(el.dataset.arg);ctScroll('ct-pages')};
ACT.ctreach=el=>{const d=el.dataset.arg;U.ctOpen=U.ctOpen===d?null:d;ctPaintReach();const b=$(`[data-act="ctreach"][data-arg="${d}"]`);b&&b.focus({preventScroll:true})};
ACT.ctmore=()=>{U.ctMore=!U.ctMore;ctPaintReach();const b=$('[data-act="ctmore"]');b&&b.focus({preventScroll:true})};
ACT.ctfilter=el=>{const d=el.dataset.arg;U.ctQ=d;const q=$('#ct-q');if(q)q.value=d;ctSetTab('Todas');ctScroll('ct-pages')};
ACT.ctclear=()=>{U.ctQ='';const q=$('#ct-q');if(q)q.value='';ctSetTab('Todas')};
ACT.ctjump=el=>ctScroll(el.dataset.arg==='reach'?'ct-reach-s':'ct-pages');
