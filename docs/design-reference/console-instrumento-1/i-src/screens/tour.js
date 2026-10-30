/* ================= OVERLAY: Tour «Aprende cómo funciona» (builder C) =================
   G's nine steps in the Instrumento look. One clock per step (TT.p, 0 → 1):
   every moving part reads --p or is set from p in tt(). All steps measure the
   same: the stage has a fixed height and the captions share one grid cell.
   Only the first step plays on open; the rest play when the person asks.
   Figures are illustrative: they show the mechanism, they promise nothing. */
const TOUR_C=[
 ['Nuevo dominio','Escribe tu dominio y GenScore te propondrá <b>a quién vigilar y qué prompts lanzar</b>. No hay que configurar nada más.'],
 ['Cuatro motores','Preguntamos tus prompts a <b>ChatGPT, Gemini y Claude</b>, y en Pro también a <b>Perplexity</b>. Guardamos cada respuesta.'],
 ['Visión general','Tu <b>Puntuación GEO</b> resume cuánto y cómo aparece tu marca en las respuestas de la IA.'],
 ['Recomendaciones','GenScore te dice <b>qué hacer, en qué página y por qué</b>, ordenado por impacto.'],
 ['Solución generada','También te <b>prepara la solución</b>, lista para copiar y publicar en tu web.'],
 ['Posición en Google','Sigue <b>tus palabras en Google</b>: el puesto de cada una y qué hacer para subir. Con Search Console, también tus clics.'],
 ['Comercio agéntico','En Pro ves si <b>un agente de IA puede comprarte</b>: si te encuentra, entra, entiende lo que vendes, se fía y llega a pagar.'],
 ['Auditoría técnica','GenScore <b>revisa tu web</b> para que la IA y Google puedan leerla y citarla.'],
 ['Cada escaneo recalcula','Cuando aplicas cambios, el siguiente escaneo los detecta y <b>recalcula tu puntuación</b>.']];
const TT={i:0,p:1,raf:0,t0:0,dur:1600,clicked:false};
const ttEase=x=>1-Math.pow(1-x,3);
function ttMiniDial(n){let g='';for(let i=0;i<=50;i++){const a=(135+i*5.4)*Math.PI/180;g+=`<line data-v="${i*2}" x1="${(60+44*Math.cos(a)).toFixed(1)}" y1="${(60+44*Math.sin(a)).toFixed(1)}" x2="${(60+(i%5?52:55)*Math.cos(a)).toFixed(1)}" y2="${(60+(i%5?52:55)*Math.sin(a)).toFixed(1)}"/>`}
 return `<div class="tt-dial"><svg viewBox="0 0 120 120" data-to="${n}">${g}</svg><b class="num" data-tn="0:${n}">${n}</b></div>`}
function ttStage(i){let m='';
 if(i===0)m=`<div class="tt-k">Nuevo dominio</div><div class="tt-in mono"><span data-tw="nubaria.es"></span><span class="caret"></span></div><div class="tt-row tt-late"><span class="chip">4 competidores</span><span class="chip">17 prompts</span><span class="chip">${EK.length} motores</span></div>`;
 else if(i===1)m=`<div class="tt-k">Mención por motor</div>${EK.map((k,j)=>`<div class="tt-eng"><span>${lg(k,14)}${ENG[k].n}${k==='perplexity'?'<span class="new">Nuevo</span>':''}</span><div class="tt-bar" style="--w:${[62,74,55,66][j]}%"><i></i></div><b class="num" data-tn="0:${[62,74,55,66][j]}">0</b></div>`).join('')}`;
 else if(i===2)m=`<div class="tt-split">${ttMiniDial(48)}<div><div class="tt-k">Puntuación GEO</div><p class="tt-p">Presencia, prominencia, cuota de voz, autoridad y salud técnica, en una cifra de 0 a 100.</p></div></div>`;
 else if(i===3)m=`<div class="tt-row">${srcChip('ia')}<span class="tt-small">Respuesta directa</span><b class="tt-imp num tt-late">+5 pt</b></div><div class="tt-k" style="margin-top:14px;color:var(--blue)">Haz esto</div><div class="tt-do">Añade una FAQ sobre Verifactu a <code class="p">/facturacion-electronica</code>.</div><div class="tt-small tt-late" style="margin-top:8px">Visto en 3 preguntas ⌄</div>`;
 else if(i===4)m=`<div class="tt-row"><span class="tt-k">FAQ generada</span><span class="btn sm line" style="margin-left:auto;pointer-events:none">${ic('copy','sm')}Copiar</span></div><pre class="tt-code"><span data-tw="&lt;section class=&quot;faq&quot;&gt;\n  &lt;h2&gt;Preguntas frecuentes&lt;/h2&gt;\n  &lt;h3&gt;¿Nubaria cumple Verifactu?&lt;/h3&gt;\n  &lt;p&gt;Sí. Desde enero de 2026…&lt;/p&gt;"></span></pre>`;
 else if(i===5)m=`<div class="tt-split"><div><div class="tt-k">${lg('google',12)} Puesto medio</div><b class="tt-big num" data-tn="16.8:14.2">16,8</b><div class="tt-small">9 palabras en la página 1</div></div><div class="tt-lad"><span>Página 1</span><span>Página 2</span><span>Página 3</span><i class="tt-mk"></i></div></div>`;
 else if(i===6)m=`<div class="tt-split"><div class="tt-ring">${tickRing(66,'Visibilidad agéntica')}</div><div style="flex:1;min-width:0">${[['Descubrimiento',21,30],['Comprensión',24,30],['Confianza',9,20],['Compra',12,20]].map(([n,v,w])=>`<div class="tt-ag"><span>${n}</span><b class="num">${v}/${w}</b><div class="tt-bar ${v/w<.5?'warm':''}" style="--w:${v/w*100}%"><i></i></div></div>`).join('')}</div></div>`;
 else if(i===7)m=`<div class="tt-k">Auditoría técnica</div><div class="tt-split" style="margin-top:10px"><b class="tt-big num" data-tn="0:81">81</b><div class="tt-row tt-late"><span class="badge b-line">Salud SEO</span><span class="badge b-warm">2 avisos</span></div></div><div class="tt-bar" style="--w:81%;margin-top:16px"><i></i></div>`;
 else m=`<div class="tt-split"><div><div class="tt-k">Puntuación GEO</div><b class="tt-big xl num" data-tn="48:71">48</b><span class="tt-small">/100</span></div><div class="tt-late"><span class="badge b-pos">${ic('check')}2 cambios detectados</span><div class="tt-small" style="margin-top:8px">Ejemplo ilustrativo</div></div></div>`;
 return `<div class="tt-stage" style="--p:${TT.p}"><div class="tt-side" aria-hidden="true">${['overview','recs','prompts','trend','agent','audit'].map((k,j)=>`<span class="${[0,2,0,1,1,3,4,5,0][i]===j?'on':''}">${ic(k)}</span>`).join('')}</div><div class="tt-main"><div class="tt-card">${m}</div></div></div>`}
function ttFrame(p){const st=$('.tt-stage');if(!st)return;st.style.setProperty('--p',p.toFixed(3));
 $$('[data-tw]',st).forEach(el=>{const t=el.dataset.tw.replace(/\\n/g,'\n');el.textContent=t.slice(0,Math.round(t.length*Math.min(1,p*1.5)))});
 $$('[data-tn]',st).forEach(el=>{const [a,b]=el.dataset.tn.split(':').map(Number);const e=ttEase(Math.min(1,Math.max(0,(p-.15)/.85)));const v=a+(b-a)*e;el.textContent=String(b%1?v.toFixed(1):Math.round(v)).replace('.',',')});
 $$('svg[data-to]',st).forEach(s=>{const to=+s.dataset.to*ttEase(p);$$('line',s).forEach(l=>l.classList.toggle('on',+l.dataset.v<=to))});
 $$('.ring',st).forEach(s=>{const ls=$$('line',s),n=Math.round(66*.6*ttEase(p));ls.forEach((l,k)=>l.classList.toggle('on',k<n))})}
function ttTick(now){if(!$('.tt-stage')){TT.raf=0;return}TT.p=RM.matches?1:Math.min(1,(now-TT.t0)/TT.dur);ttFrame(TT.p);TT.raf=TT.p<1&&!document.hidden?requestAnimationFrame(ttTick):0;if(document.hidden)TT.p=1,ttFrame(1)}
function ttPlay(){cancelAnimationFrame(TT.raf);TT.p=RM.matches?1:0;ttFrame(TT.p);if(RM.matches)return;TT.t0=performance.now();TT.raf=requestAnimationFrame(ttTick)}
function ttHtml(){const i=TT.i,last=TOUR_C.length-1;
 return `<div class="xo-dh tt-h">${xoX('Cerrar el tour')}<div class="eyebrow bare">Aprende cómo funciona · <span class="num">${pad(i+1)} de ${pad(TOUR_C.length)}</span></div><h2>${TOUR_C[i][0]}</h2></div>
 <div class="tt-b">${ttStage(i)}<div class="tt-subs" aria-live="polite">${TOUR_C.map((x,k)=>`<p class="${k===i?'on':''}" ${k===i?'':'aria-hidden="true"'}>${x[1]}</p>`).join('')}</div></div>
 <div class="tt-f"><div class="tt-dots" role="tablist" aria-label="Pasos del tour">${TOUR_C.map((_,k)=>`<button role="tab" aria-selected="${k===i}" class="${k===i?'on':''} ${k<i?'done':''}" aria-label="Paso ${k+1} de ${TOUR_C.length}" data-act="ttGo" data-arg="${k}"><i></i></button>`).join('')}</div>
 <button class="btn ghost" data-act="ttPrev" ${i===0?'disabled':''}>${ic('chevl','sm')}Atrás</button>${i===last?`<button class="btn ink" data-act="xoClose">Ir a mi panel</button>`:`<button class="btn ink ${TT.clicked?'':'tt-nudge'}" data-act="ttNext">Siguiente${ic('arrowr','sm')}</button>`}</div>`}
function ttDraw(open){if(open){xoDlg(ttHtml(),{cls:'tt-dlg',label:'Tour de bienvenida'});U.cOnClose=()=>{cancelAnimationFrame(TT.raf);TT.raf=0}}else xoRedraw(ttHtml());ttPlay()}
ACT.cTour=()=>{TT.i=0;ttDraw(true)};
ACT.ttNext=()=>{TT.clicked=true;TT.i=Math.min(TOUR_C.length-1,TT.i+1);ttDraw()};
ACT.ttPrev=()=>{TT.i=Math.max(0,TT.i-1);ttDraw()};
ACT.ttGo=el=>{TT.clicked=true;TT.i=+el.dataset.arg;ttDraw()};
document.addEventListener('keydown',e=>{if(!$('.tt-dlg'))return;if(e.key==='ArrowRight'&&TT.i<TOUR_C.length-1){e.stopPropagation();ACT.ttNext()}else if(e.key==='ArrowLeft'&&TT.i>0){e.stopPropagation();ACT.ttPrev()}},true);
