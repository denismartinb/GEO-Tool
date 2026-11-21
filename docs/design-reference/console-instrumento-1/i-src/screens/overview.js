/* ================= SCREEN: Visión general =================
   Registers SCREENS.overview. Uses PLAN from recs-data.js (loaded before
   render runs, so order of concatenation does not matter). */
const DESG=[['Presencia','Cuánto te nombra la IA.',41],['Prominencia','En qué puesto sales.',66],['Cuota de voz','Tú frente a tus rivales.',34],['Autoridad','Cuánto cita tu web.',18],['Diagnóstico técnico','Salud técnica de tu web.',78]];
const AGC=[['Descubrimiento',21,30],['Comprensión',24,30],['Confianza',9,20],['Compra',12,20]];

/* decorative tick arc for the deep block (an accent: ticks are allowed here) */
function arcDeco(){let g='';for(let i=0;i<=54;i++){const a=(135+i*5)*Math.PI/180,r0=i%9===0?136:146;g+=`<line x1="${(170+r0*Math.cos(a)).toFixed(1)}" y1="${(170+r0*Math.sin(a)).toFixed(1)}" x2="${(170+158*Math.cos(a)).toFixed(1)}" y2="${(170+158*Math.sin(a)).toFixed(1)}"/>`}return `<svg class="arc" viewBox="0 0 340 340" aria-hidden="true">${g}</svg>`}

/* ---------- scan simulation: the counter is the honest part ---------- */
let scanTimer=null;
function scanTick(){if(document.hidden||!U.scan)return;
 if(U.prog>=136){clearInterval(scanTimer);scanTimer=null;const s=$('#scan-s');if(s)s.innerHTML='<span class="shimmer">Calculando tu Puntuación GEO</span>';setTimeout(()=>{if(!U.scan)return;setScan(false);toast('Escaneo completado.','Tus cifras ya son las del 26 oct.','checkc')},1600);return}
 U.prog=Math.min(136,U.prog+1+Math.floor(Math.random()*3));setRoll($('#scan-n .roll'),U.prog);const tk=$('#scan-tk');if(tk)$$('i',tk).forEach((x,i)=>x.classList.toggle('on',i<Math.floor(U.prog/2)))}
function setScan(on){U.scan=on;const b=$('#scanbtn');b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);$('#scanlb').textContent=on?'Escaneo en curso':'Simular escaneo';if(on)U.prog=52;clearInterval(scanTimer);scanTimer=null;if(on)scanTimer=setInterval(scanTick,900);if(R.route==='overview')render(false)}

/* plan of the week: option 1 «Hoja» (Denis 2026-10-26) */
function pvSrc(s){return `<span class="pv-src ${s}">${s==='google'?'Google':s==='agent'?'Agentes':'IA'}</span>`}
function pvPts(r){return r.pt?`<span class="pv-pt num">+${r.pt} pt</span>`:`<span class="pv-pt q">${r.imp}</span>`}
function planBlock(done){const n=PLAN.length;
 const prog=`<div class="pv-prog" aria-label="${done} de ${n} hechas">${PLAN.map(r=>`<i class="${U.done[r.id]?'on':''}"></i>`).join('')}<span class="num">${done} de ${n} hechas</span></div>`;
 const cta=`<button class="btn line" data-route="recs">Ver recomendaciones${ic('arrowr','sm')}</button>`;
 const row=(r,i)=>`<li><a href="#recs" data-route="recs" data-idx="${i}"><span class="pv-n num">${pad(i+1)}</span><span class="pv-t">${hiPath(r.do)}<span class="pv-m">${pvSrc(r.src)}</span></span>${pvPts(r)}</a></li>`;
 const body=`<div class="pv pv1"><div class="pv-l"><div class="pv-ey">Tu plan de esta semana</div><div class="pv-big num">+${roll(14)}<small>pt</small></div><p class="pv-s">Lo que puede subir tu Puntuación GEO si haces estas cuatro acciones.</p>${prog}${cta}</div><ol class="pv-list">${PLAN.map(row).join('')}</ol></div>`;
 return `<section class="sec" aria-label="Tu plan de esta semana">${body}</section>`}

ACT.report=()=>toast('Informe listo.','Escaneo del 11 de octubre de 2026.','download');

SCREENS.overview={title:'Visión general',render(){const sc=U.scan;
 const done=PLAN.filter(r=>U.done[r.id]).length;
 return `<div class="eyebrow bare">Visión general · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span></div>
 <div class="pr-hd"><h1>Buenas tardes, Lucía.</h1><button class="btn line sm hd-d" data-act="report">${ic('download','sm')}Descargar informe</button></div>
 <p class="lead">Apareces en el <a href="#prompts" data-route="prompts">41%</a> de las respuestas. <a href="#competitors" data-route="competitors">Cuentix</a> te supera con un 54%. Tienes <a href="#recs" data-route="recs">4 acciones</a> para esta semana.</p>
 <div class="pills hd-m"><button class="btn line sm" data-act="report">${ic('download','sm')}Descargar informe</button></div>
 ${sc?`<section class="card scan" aria-label="Escaneo en curso">
  <div class="pend">${pendulumSvg()}<div class="pend-l">${EK.map(k=>`<span>${ENG[k].n}</span>`).join('')}</div></div>
  <div class="scan-r"><div class="k"><span class="pulse"></span>Escaneo en curso</div>
   <div class="n" id="scan-n">${roll(U.prog)}<small>de 136 respuestas leídas</small></div>
   ${ticks(68,Math.floor(U.prog/2),{id:'scan-tk'})}
   <div class="s" id="scan-s">Puedes salir. Seguimos solos.</div></div>
 </section>`:''}
 <div class="alert" role="region" aria-label="Prioridad 1">${ic('warn')}<div class="tx"><b>Perplexity no puede leer tu web.</b> Tu robots.txt lo bloquea.</div><button class="btn warm sm" data-route="auditgeo">Arreglarlo${ic('arrowr','sm')}</button></div>

 <section class="sec" aria-label="Puntuación GEO"><div class="card agh agh-a ov-h">
  <span class="agh-tab">${ic('trend','sm')}Puntuación GEO</span>
  <div class="l"><svg class="agh-trace" viewBox="0 0 400 300" aria-hidden="true" preserveAspectRatio="none"><path d="M-10 250 C 80 240, 120 120, 210 130 S 330 40, 420 30"/><path d="M-10 280 C 90 270, 140 170, 230 175 S 340 90, 420 80"/></svg>
   <div class="big num">${roll(D.score)}<small>de 100</small></div>
   <div class="agh-sc" role="img" aria-label="${D.score} de 100, banda Emergente; Competitivo empieza en 70"><i class="f" style="width:${D.score}%"></i><i class="g" style="left:${D.score}%;width:${70-D.score}%"></i><i class="bd" style="left:40%"></i><i class="bd" style="left:70%"></i><span class="mk" style="left:${D.score}%"></span><span class="gl num" style="left:70%">70</span></div>
   <div class="ov-bands" aria-hidden="true"><span style="width:40%">Inicial</span><span class="on" style="width:30%">Emergente</span><span style="width:30%">Competitivo</span></div>
   <h2>La IA ya te nombra. Ahora falta que te elija antes que a Cuentix.</h2>
   <button class="btn line" data-route="recs">Ver recomendaciones${ic('arrowr','sm')}</button></div>
  <div class="r"><div class="rh ev"><b>Evolución</b></div>
   <div class="evo">${lineChart(D.spark,D.dates,{label:'Puntuación GEO en los últimos 8 escaneos, de 49 a 62'})}</div>
   <div class="rh sub"><b>Te nombran por motor</b><span>Último escaneo</span></div>
   ${EK.map(k=>`<a class="er" href="#prompts" data-route="prompts"><span class="t">${lg(k,16)}<b>${ENG[k].n}</b>${ENG[k].isNew?'<span class="new">Nuevo</span>':''}</span><span class="bb" aria-hidden="true"><i style="width:${D.engines[k]}%"></i></span><span class="m num">${roll(D.engines[k])}<small>%</small></span>${ic('chevr','sm')}</a>`).join('')}
  </div></div></section>

 <section class="sec"><div class="eyebrow">Indicadores clave</div>
  <div class="kpis">
   <div class="kpi"><div class="l">Tasa de mención</div><div class="v"><b>${roll(41)}</b><span class="u">%</span><span class="badge b-pos">${ic('arrowup')}+5 pt</span></div>${spark([31,33,32,35,36,36,36,41])}</div>
   <div class="kpi"><div class="l">Cuota de citas</div><div class="v"><b>${roll(18)}</b><span class="u">%</span><span class="badge b-warm">Bajo</span></div>${spark([14,15,15,16,17,16,18,18])}</div>
   <div class="kpi"><div class="l">Presión competitiva</div><div class="v"><b>${roll(58)}</b><span class="u">%</span><span class="badge b-line">Alta</span></div>${spark([66,64,63,62,61,60,59,58],'var(--ink-3)')}</div>
   <div class="kpi"><div class="l">Sentimiento de marca</div><div class="v"><b style="font-size:30px">Positivo</b></div><div class="sent" aria-label="72% positivo, 21% neutral, 7% negativo"><i style="width:72%;background:var(--pos)"></i><i style="width:21%;background:var(--tick-off)"></i><i style="width:7%;background:var(--warm)"></i></div><div class="lg num"><span>72%</span><span>21%</span><span>7%</span></div></div>
  </div></section>

 ${planBlock(done)}

 <section class="sec grid57">
  <div class="card"><div class="card-h"><h3>Desglose del GEO Score</h3><span class="see num" style="cursor:default">62/100</span></div>
   <div class="card-b" style="padding-top:2px">${DESG.map(([l,h,v],i)=>`<div class="brk"><div class="n">${l}<span>${h}</span></div><div class="v num">${v}<small>/100</small></div>${bar(v,{cls:v<25?'warm':'',delay:i*80,label:`${l}: ${v} de 100`})}</div>`).join('')}</div></div>
  <div class="card"><div class="card-h"><h3>Competidores</h3><a class="see" href="#competitors" data-route="competitors">Ver todo${ic('chevr','sm')}</a></div>
   <div class="card-b" style="padding-top:10px">${ranking(D.comps)}</div></div>
 </section>

 <section class="sec grid2 ov-pair">
  <div class="card"><div class="card-h"><h3>Comercio agéntico</h3><span class="new">Nuevo</span><a class="see" href="#agents" data-route="agents">Ver todo${ic('chevr','sm')}</a></div>
   <div class="card-b"><div class="ag">${tickRing(66,'Visibilidad agéntica')}<div><p style="font-size:15px;font-weight:550;letter-spacing:-.01em">Los agentes ya te encuentran. Ahora falta que confíen en tu web.</p>
    <div class="rows" style="margin-top:10px">${AGC.map(([n,p,w],i)=>`<div><span>${n}</span>${bar(p,{max:w,cls:'thin '+(p/w<.5?'warm':''),delay:i*80})}<b class="num">${p}<small>/${w}</small></b></div>`).join('')}</div></div></div>
    <div class="fx-w"><div class="fx-k">Recomendaciones</div><a class="fixln" href="#agaudit" data-route="agaudit"><span class="sd"></span>No vemos tu política de cancelación o reembolso${ic('chevr','sm')}</a></div>
    </div></div>
  <div class="card"><div class="card-h"><h3>Auditoría SEO y Google</h3><a class="see" href="#google" data-route="google">Posición en Google${ic('chevr','sm')}</a></div>
   <div class="card-b"><div class="seo3 two">
    <div><div class="k">Salud SEO</div><div class="bv num">81<small>/100</small></div><div class="trio"><span><b class="num">0</b>Críticos</span><span><b class="num">2</b>Avisos</span><span><b class="num">3</b>Mejoras</span></div></div>
    <div><div class="k">${lg('google',13)}Google · 28 días</div><div class="bv num">1.284<small> clics</small></div><div class="trio"><span><b class="num">14,2</b>Puesto medio</span><span><b class="num">5</b>En página 2</span></div></div>
   </div>
   <div class="fx-w"><div class="fx-k">Recomendaciones</div><a class="fixln" href="#auditseo" data-route="auditseo"><span class="sd" style="background:var(--ink-4)"></span>Un solo &lt;h1&gt; por página<span style="color:var(--ink-3);margin-left:6px">4 páginas</span>${ic('chevr','sm')}</a></div>
   </div></div>
 </section>`}};
