/* ================= SCREEN: Posición en Google =================
   Tabs Resumen · Temas · Descubrir palabras. The Top 20 is our weekly photo
   (no Search Console needed); Search Console adds what only Google knows.
   The client never sees which day the photo is taken. */
U.g={tab:'res',st:'ok',todo:{},inl:null,watch:{},adding:{},qf:'all',qs:{k:'imp',d:-1},topic:null,kwOpen:0,tsteps:{},newTopic:false,dsrc:'seed',used:2,pick:new Set([0,1]),searching:false,shown:{seed:1,riv:0,gsc:1},rivEdit:false,riv:{'cuentix.com':1,'factulia.es':1,'librocloud.io':1,'kontaro.es':0},disc:false,newWords:[]};

/* ---------- page ladder: 1 at the top; the marker climbs from the previous average ---------- */
function gLadder(prev,now){const Y=p=>((p-1)/29*100).toFixed(2);
 return `<div class="sc-g-lad blit" style="--from:${Y(prev)}%;--to:${Y(now)}%" role="img" aria-label="Puesto medio ${bF1(now)}, antes ${bF1(prev)}. Página 1 llega hasta el puesto 10.">
  <span class="band p1"><em>Página 1</em></span><span class="band p2"><em>Página 2</em></span><span class="band p3"><em>Página 3</em></span>
  <span class="rail"></span><span class="mk"><i></i><b class="num">${bF1(now)}</b></span>
  <span class="tick num" style="top:0">1</span><span class="tick num" style="top:${Y(10.5)}%">10</span><span class="tick num" style="top:${Y(20.5)}%">20</span><span class="tick num" style="top:100%">30</span></div>`}

/* small inverted sparkline for topics */
function gSpark(h){if(h.length<2)return `<span class="sc-g-nophoto">Analizando información</span>`;const w=96,ht=26,mn=Math.min(...h),mx=Math.max(...h);const X=i=>2+i*(w-4)/(h.length-1),Y=v=>3+(v-mn)/(mx-mn||1)*(ht-6);const up=h.at(-1)<h[0];
 return `<svg class="sc-g-spark" viewBox="0 0 ${w} ${ht}" aria-hidden="true"><polyline points="${h.map((v,i)=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' ')}" fill="none" stroke="${up?'var(--blue)':'var(--warm)'}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${X(h.length-1)}" cy="${Y(h.at(-1))}" r="2.6" fill="${up?'var(--blue)':'var(--warm)'}"/></svg>`}
const gDelta=(a,b)=>{const d=a-b;return d>0?`<span class="dl up" aria-label="Sube ${bF1(d).replace(/,0$/,'')} puestos">${ic('arrowup')}${bF1(d).replace(/,0$/,'')}</span>`:d<0?`<span class="dl down" aria-label="Baja ${bF1(-d).replace(/,0$/,'')} puestos">${ic('arrowdown')}${bF1(-d).replace(/,0$/,'')}</span>`:`<span class="dl eq">=</span>`};

/* ---------- Resumen ---------- */
function gHero(){const tot=GW.p1+GW.near+GW.out;
 return `<section class="card sc-g-hero" aria-label="Tu puesto en Google">
  <div class="lf"><div class="pm"><div class="k">Puesto medio</div><div class="big num" id="g-pos">${bF1(GW.pos)}</div>
    <div class="dd"><span class="badge b-pos">${ic('arrowup')}2,6 puestos</span></div><p class="was">Antes: <span class="num">${bF1(GW.prev)}</span>. Más arriba es mejor.</p></div>
   ${gLadder(GW.prev,GW.pos)}</div>
  <div class="rt"><div class="k">Tus palabras esta semana</div>
   <div class="wk3">${[['p1',GW.p1,'En la página 1'],['near',GW.near,'Primeras páginas'],['out',GW.out,'Fuera del Top 20']].map(([c,v,l])=>`<div><b class="num">${roll(v)}</b><span><i class="sw ${c}"></i>${l}</span></div>`).join('')}</div>
   <div class="split blit" role="img" aria-label="${GW.p1} en la página 1, ${GW.near} ya casi, ${GW.out} fuera del Top 20"><i class="p1" style="--w:${GW.p1/tot*100}%"></i><i class="near" style="--w:${GW.near/tot*100}%"></i><i class="out" style="--w:${GW.out/tot*100}%"></i></div>
   <div class="ud"><span class="up">${ic('arrowup')}<b class="num">${GW.up}</b> han subido</span><span class="down">${ic('arrowdown')}<b class="num">${GW.down}</b> han bajado</span><span class="cap num">${GW.tracked} de ${GW.cap} palabras</span></div>
   <div class="evo-h"><span class="k">Evolución del puesto medio</span><span class="k2">Últimas 9 fotos</span></div>
   <div class="gev">${bLine(GW.evo,{min:12,max:19,invert:true,w:560,h:150,grid:[13,15,17,19],xl:[[0,'Hace 8 semanas','start'],[8,'Última foto','end']],label:'Puesto medio en las últimas 9 fotos, de 17,6 a 14,2'})}</div></div>
 </section>`}

function gTodo(){const tasks=GTODO.filter(x=>!x.goal),done=tasks.filter(x=>U.g.todo[x.id]).length;
 return `<section class="sec" aria-label="Qué hacer esta semana"><div class="sc-g-todo soft">
  <div class="l"><div class="ey">${lg('google',13)}Qué hacer esta semana</div>
   <div class="big num">${roll(3)}<small>pasos</small></div><p class="s">para subir en Google. El objetivo de puesto lo seguimos solos en cada foto; las tareas las marcas tú.</p>
   <div class="meta"><span><b class="num">1</b>objetivo</span><span><b class="num">2</b>tareas</span><span><b class="num">${done} de 2</b>hechas</span></div></div>
  <ol class="r">${GTODO.map((x,i)=>{const d=U.g.todo[x.id];return `<li class="${d?'done':''}"><span class="n num">${pad(i+1)}</span><div class="b"><div class="ch">${srcChip('google')}<span>${x.topic}</span></div><b>${hiPath(x.t)}</b><p>${x.d.replace(/(\/[a-z\-]+)/g,'<code class="p">$1</code>')}</p>
   ${x.goal?goalScale(x.goal):d?`<div class="dn">${ic('checkc','sm')}Hecho. Lo verás en las próximas fotos.<button class="btn sm ghost" data-act="gTodoUndo" data-arg="${x.id}">${ic('undo','sm')}Deshacer</button></div>`:U.g.inl===x.id?`<span class="inl">¿Marcarla como hecha?<button class="btn onink" data-act="gTodoOk" data-arg="${x.id}">Sí</button><button class="btn ghost" data-act="gTodoInl" data-arg="">No</button></span>`:`<button class="btn sm ghostd" data-act="gTodoInl" data-arg="${x.id}">${ic('check','sm')}Marcar como hecho</button>`}</div></li>`}).join('')}</ol>
 </div></section>`}

function gMoved(){return `<div class="card"><div class="card-h"><h3>Lo que más se ha movido</h3><span class="see" style="cursor:default">Frente a la foto anterior</span></div><div class="card-b sc-g-mv">${GMOVED.map(([k,a,b])=>`<div class="r"><span class="q">${k}</span><span class="ab num"><s>${a}</s>${ic('arrowr','sm')}<b>${b}</b></span>${gDelta(a,b)}</div>`).join('')}</div></div>`}

function gRivals(){const list=GRIV.filter(r=>r[3]||U.g.riv[r[0]]);const max=Math.max(...list.map(r=>r[1]));
 return `<div class="card"><div class="card-h"><h3>Tus rivales en Google</h3><button class="see" data-act="gRivEdit" aria-expanded="${U.g.rivEdit}">${U.g.rivEdit?'Cerrar':'Cambiar rivales'}${ic(U.g.rivEdit?'x':'chevr','sm')}</button></div>
  ${U.g.rivEdit?`<div class="card-b sc-g-rivedit"><p>Te proponemos los competidores de tu proyecto que tienen web.</p>${Object.keys(U.g.riv).map(d=>`<label><input type="checkbox" data-chg="gRivPick" data-arg="${d}" ${U.g.riv[d]?'checked':''}>${fav(d,'xs')}<span class="mono">${d}</span></label>`).join('')}<button class="btn sm ink" data-act="gRivSave">Guardar rivales</button></div>`:''}
  <div class="card-b"><div class="sc-g-rh" aria-hidden="true"><span>Web</span><span>En el Top 10</span><span>Puesto medio</span></div>
  ${list.sort((a,b)=>b[1]-a[1]).map((r,i)=>`<div class="sc-g-rv ${r[3]?'me':''}"><span class="who">${fav(r[0],'')}<span class="mono">${r[0]}</span>${r[3]?'<span class="you">Tú</span>':''}</span><span class="t num"><b>${r[1]}</b><small>palabras</small></span><span class="pm num">${bF1(r[2])}</span>${bar(r[1],{max:max*1.1,cls:'thin '+(r[3]?'':'ink nomark'),delay:i*60})}</div>`).join('')}</div></div>`}

/* ---------- Search Console block ---------- */
function gDual(){const n=28,c=[],im=[];for(let i=0;i<n;i++){const we=i%7===5||i%7===6;c.push(38+12*Math.sin(i/3)+i*.6+(we?-14:0));im.push(1500+300*Math.sin(i/4+1)+i*22+(we?-420:0))}
 const W=560,H=180,L=34,Rr=44,T=12,B=24;const X=i=>L+i*(W-L-Rr)/(n-1),Yc=v=>T+(1-v/80)*(H-T-B),Yi=v=>T+(1-v/2600)*(H-T-B);
 let g=[0,40,80].map(v=>`<line x1="${L}" x2="${W-Rr}" y1="${Yc(v)}" y2="${Yc(v)}" stroke="var(--rule-2)"/><text class="ax" x="${L-8}" y="${Yc(v)+3.5}" text-anchor="end">${v}</text><text class="ax" x="${W-Rr+8}" y="${Yc(v)+3.5}">${bNf(Math.round(v/80*2600))}</text>`).join('');
 g+=[[0,'14 sep','start'],[n-1,'11 oct','end']].map(([i,t,a])=>`<text class="ax" x="${X(i)}" y="${H-6}" text-anchor="${a}">${t}</text>`).join('');
 g+=`<polyline points="${im.map((v,i)=>X(i).toFixed(1)+','+Yi(v).toFixed(1)).join(' ')}" fill="none" stroke="var(--ink-4)" stroke-width="1.4" stroke-dasharray="3 4"/><polyline points="${c.map((v,i)=>X(i).toFixed(1)+','+Yc(v).toFixed(1)).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="1.75" stroke-linejoin="round"/>`;
 return `<svg class="bline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Clics e impresiones diarios en los últimos 28 días">${g}</svg>`}
function gStrip(){const W=560,H=120,L=8,Rr=8;const X=p=>L+(p-1)/29*(W-L-Rr);const pts=[...GQS.map(q=>[q[1],q[3],1]),[3.2,900],[7.5,1400],[9.4,620],[14.8,2100],[16.2,1300],[13.1,3100],[19.5,880],[22.4,1700],[25.1,600],[27.8,420],[23.9,2400],[4.4,300],[15.5,420],[28.6,1100]];
 let s=`<rect x="${X(10.5)}" y="8" width="${X(20.5)-X(10.5)}" height="76" rx="6" fill="var(--blue-tint)"/>`;
 [[1,10.5,'Página 1'],[10.5,20.5,'Página 2'],[20.5,30,'Página 3 o más']].forEach(([a,b,t],k)=>{s+=`<text class="ax ${k===1?'s':''}" x="${(X(a)+X(b))/2}" y="${H-16}" text-anchor="middle">${t}</text>`});
 s+=`<line x1="${L}" x2="${W-Rr}" y1="84" y2="84" stroke="var(--ink-4)"/>`+[1,10,20,30].map(p=>`<text class="ax" x="${X(p)}" y="${H-2}" text-anchor="${p===1?'start':p===30?'end':'middle'}">${p}</text>`).join('');
 s+=pts.map(([p,v,k],i)=>`<circle cx="${X(p).toFixed(1)}" cy="${(46+((i*37)%30)-15).toFixed(1)}" r="${(2.5+Math.sqrt(v)/16).toFixed(1)}" fill="${p>10.5&&p<=20.5?'var(--blue)':'var(--ink-4)'}" fill-opacity="${k?.9:.5}"/>`).join('');
 return `<svg class="bline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tus búsquedas según su puesto: 38% en la página 1, 41% en la página 2 y 21% en la página 3 o más">${s}</svg>`}
function gTable(){const f=U.g.qf,{k,d}=U.g.qs;const idx={q:0,pos:1,clk:2,imp:3}[k];
 const rows=GQS.filter(q=>f==='all'||(f==='p1'?q[1]<=10:q[1]>10&&q[1]<=20)).sort((a,b)=>(k==='q'?a[0].localeCompare(b[0]):a[idx]-b[idx])*d);
 const th=(key,l,r)=>{const on=k===key;return `<th class="${r?'r':''} ${key==='q'?'stk':''}" aria-sort="${on?(d>0?'ascending':'descending'):'none'}"><button data-act="gSort" data-arg="${key}">${l}<span class="ar" aria-hidden="true">${on?(d>0?'↑':'↓'):'↕'}</span></button></th>`};
 return `<div class="card sc-g-q"><div class="card-h"><h3>Las búsquedas que te traen visitas</h3><div class="fchips">${[['all','Todas'],['p1','Página 1'],['p2','Página 2']].map(([x,l])=>`<button class="fchip" data-act="gQf" data-arg="${x}" aria-pressed="${f===x}">${l}</button>`).join('')}</div></div>
  <div class="card-b"><div class="tw" tabindex="0" role="region" aria-label="Tabla de búsquedas, se desliza en horizontal"><table><thead><tr>${th('q','Búsqueda')}${th('pos','Puesto',1)}${th('clk','Clics',1)}${th('imp','Impresiones',1)}<th>Página que sale</th></tr></thead>
  <tbody>${rows.map(q=>`<tr><td class="stk">${q[0]}${q[1]>10&&q[1]<=20?' <span class="badge b-blue">Página 2</span>':''}</td><td class="r num"><b>${bF1(q[1])}</b></td><td class="r num">${bNf(q[2])}</td><td class="r num">${bNf(q[3])}</td><td><code class="p">${q[4]}</code></td></tr>`).join('')}</tbody></table></div>
  <p class="foot">Las 50 búsquedas con más impresiones. Ordenar sólo cambia su orden.</p></div></div>`}
function gLow(){return `<div class="card"><div class="card-h"><h3>Te ven, pero no entran</h3></div><div class="card-b sc-g-low">${GLOW.map(([q,p,y,u],i)=>`<div class="r"><div class="q">${q}<span class="num">Puesto ${bF1(p)}</span></div>
  <div class="cmp"><span>Entra el <b class="num">${bF1(y)}%</b></span>${bar(y,{max:3,cls:'thin warm',delay:i*80})}<span>Lo habitual en tu web en ese tramo: <b class="num">${bF1(u)}%</b></span>${bar(u,{max:3,cls:'thin ink nomark',delay:i*80+40})}</div></div>`).join('')}
  <p class="foot">Comparado con el resto de tu web en el mismo tramo de puestos, nunca con una media del sector.</p></div></div>`}
function gAsk(){return `<div class="card"><div class="card-h"><h3>Preguntas que te hacen en Google</h3></div><div class="card-b sc-g-ask">${GASK.map(([q,p],i)=>{const w=U.g.watch[i],a=U.g.adding[i];return `<div class="r"><div class="q">${q}<span class="num">Puesto ${bF1(p)}</span></div>${a?`<span class="adding"><span class="shimmer">Añadiéndola a tus prompts…</span></span>`:w?`<button class="btn sm ghost okc" data-route="prompts">${ic('checkc','sm')}Prompt vigilado</button>`:`<button class="btn sm line" data-act="gWatch" data-arg="${i}">${ic('eye','sm')}Vigilar prompt</button>`}</div>`}).join('')}
  <p class="foot">Vigilarla la añade a tus prompts y la escanea en tus motores de IA.</p></div></div>`}

function gGsc(){const st=U.g.st;
 const head=`<div class="eyebrow sc-g-gh">${lg('google',12)}Google · últimos 28 días<span class="chip sm">${ic('lock','sm')}Search Console</span></div>`;
 if(st==='connect')return `<section class="sec">${head}<div class="card sc-g-connect"><div class="gi">${lg('google',30)}</div><div><h2>Añade lo que ve Google</h2><p>Conecta Search Console, la herramienta gratuita de Google para tu web. Con ella verás:</p>
  <ul><li>${ic('check','sm')}Cuánta gente hace clic en tu web desde Google y en qué búsquedas.</li><li>${ic('check','sm')}Las búsquedas en las que ya sales cerca de la página 1: las más fáciles de subir.</li><li>${ic('check','sm')}Qué páginas tiene Google indexadas y cuáles no.</li></ul>
  <button class="btn ink" data-act="gConnect">${lg('google',15)}Conectar con Google</button><p class="fine">${ic('lock','sm')}Sólo lectura: no cambiamos nada de tu cuenta.</p></div></div></section>`;
 if(st==='loading')return `<section class="sec">${head}<div class="card sc-g-load" role="status">${bAmbient(lg('google',22))}<p><b>Obteniendo tus datos de Google Search Console…</b></p><p class="s">Tus búsquedas, tu puesto y tus páginas de los últimos 28 días.</p></div></section>`;
 return `<section class="sec">${head}
  <div class="kpis sc-g-kpis">
   <div class="kpi"><div class="l">Clics</div><div class="v"><b>${roll('1.284')}</b><span class="badge b-pos">${ic('arrowup')}12%</span></div><p class="kc">Frente a los 28 días anteriores</p></div>
   <div class="kpi"><div class="l">Impresiones</div><div class="v"><b>${roll('48.910')}</b><span class="badge b-pos">${ic('arrowup')}23%</span></div><p class="kc">Frente a los 28 días anteriores</p></div>
   <div class="kpi"><div class="l">Indexación</div><div class="v"><b>${roll(11)}</b><span class="u">de 12</span><span class="badge b-warm">1 fuera</span></div><p class="kc">De las páginas que revisa la auditoría</p></div>
  </div>
  <div class="grid2" style="margin-top:16px">
   <div class="card"><div class="card-h"><h3>Clics e impresiones</h3><span class="sc-g-lg"><span><i class="c"></i>Clics</span><span><i class="im"></i>Impresiones</span></span></div><div class="card-b">${gDual()}</div></div>
   <div class="card"><div class="card-h"><h3>Búsquedas por página</h3></div><div class="card-b"><div class="sc-g-share">${[['38%','Página 1'],['41%','Página 2'],['21%','Página 3 o más']].map(([v,l],i)=>`<div class="${i===1?'on':''}"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>${gStrip()}<p class="foot">En azul, la página 2: las más fáciles de subir.</p></div></div>
  </div>
  <div style="margin-top:16px">${gTable()}</div>
  <div class="grid2" style="margin-top:16px">${gRivals()}${gAsk()}</div>
  <div class="sc-g-prop">${ic('lock','sm')}Propiedad <span class="mono">sc-domain:nubaria.es</span>${U.g.disc?`<span class="inl">¿Desconectar Search Console?<button class="btn ink" data-act="gDiscOk">Desconectar</button><button class="btn ghost" data-act="gDisc" data-arg="0">No</button></span>`:`<button class="lnk" data-act="gDisc" data-arg="1">Desconectar</button>`}</div>
 </section>`}

function gResumen(){const st=U.g.st;
 return `${st==='first'?`<div class="sc-g-first" role="status">${bAmbient(ic('eye','sm'))}<div><b>Guardado. Estamos tomando la primera foto de Google.</b><p>${(U.g.newWords.length?U.g.newWords:['factura electrónica autónomo','programa facturas gratis']).map(w=>`<span>${w} · <em>Analizando información</em></span>`).join('')}</p></div></div>`:''}
 ${gHero()}${gGsc()}${gTodo()}
 <section class="sec grid2">${gMoved()}${gLow()}</section>`}

/* ---------- Temas ---------- */
function gTemas(){return `<div class="sc-g-tbar"><span class="num">${GTOPICS.length} temas · ${GW.tracked} de ${GW.cap} palabras</span><button class="btn sm line" data-act="gNewTopic" aria-expanded="${U.g.newTopic}">${ic('plus','sm')}Tema nuevo</button></div>
 ${U.g.newTopic?`<div class="card sc-g-newt"><div class="card-b"><label for="gtn">Nombre del tema</label><input id="gtn" value="Contabilidad"><label for="gtk">Palabras del tema, una por línea</label><textarea id="gtk" rows="3">programa contabilidad pymes
contabilidad autónomos app</textarea><div class="a"><button class="btn sm ink" data-act="gNewTopicOk">Guardar y empezar</button><button class="btn sm ghost" data-act="gNewTopic">Cancelar</button></div></div></div>`:''}
 <div class="sc-g-topics">${GTOPICS.map((t,i)=>`<button class="tp" data-act="gTopic" data-arg="${i}"><span class="n"><b>${t.n}</b><span>${t.kw} palabras · ${t.pg?`<code class="p">${t.pg}</code>`:'Sin página en el Top 20'}</span></span><span class="sp">${gSpark(t.h)}</span><span class="pv num">${t.pos!=null?`<b>${bF1(t.pos)}</b><small>puesto medio</small>`:`<b class="na">·</b><small>sin foto</small>`}</span><span class="dt">${t.pos!=null?gDelta(t.prev,t.pos):''}</span>${ic('chevr','sm')}</button>`).join('')}</div>
 <p class="sc-g-note">Pulsa un tema para ver sus palabras, qué hacer y el Top 10 de Google.</p>`}
function gTopicHtml(i){const t=GTOPICS[i];const pg=t.pg||'/autonomos';const kws=i===0?GKW:GKW.slice(0,t.kw||2);const steps=[
 ['g',`Lleva «${kws[0][0]}» del puesto ${kws[0][1]||15} a la página 1`,`Responde a esa búsqueda en las primeras líneas de ${pg}.`,[kws[0][2]||15,kws[0][1]||14,10]],
 ['t',`Añade «autónomo» al título de ${pg}`,'4 de los 10 primeros lo llevan en el título; el tuyo no.'],
 ['t',`Responde en ${pg} lo que la gente pregunta en Google`,'Son las preguntas que Google enseña en este tema. Una por encabezado.']];
 return `<div class="bsheet-h"><div class="t"><span class="eyebrow bare">Tema</span><h2>${t.n}</h2></div><button class="x" data-act="bSheetX" aria-label="Cerrar">${ic('x')}</button></div>
 <div class="bsheet-b sc-g-sh">
  <div class="top"><div><b class="num">${t.pos!=null?bF1(t.pos):'·'}</b><span>puesto medio</span></div>${t.pos!=null?gDelta(t.prev,t.pos):''}${t.pg?`<code class="p">${t.pg}</code>`:''}</div>
  <h4>Puesto medio, 8 semanas<span>más arriba es mejor</span></h4>${t.h.length>1?bLine(t.h,{min:Math.floor(Math.min(...t.h))-1,max:Math.ceil(Math.max(...t.h))+1,invert:true,w:460,h:130,grid:[Math.floor(Math.min(...t.h)),Math.ceil(Math.max(...t.h))],xl:[[0,'Hace 8 semanas','start'],[t.h.length-1,'Última foto','end']],label:'Puesto medio del tema en 8 semanas'}):'<p class="s">La línea aparece en cuanto haya dos fotos.</p>'}
  <h4>Qué hacer</h4><ol class="sts">${steps.map(([k,a,b,tr],j)=>{const id=i+':'+j,d=U.g.tsteps[id];return `<li><span class="n num">${j+1}</span><div><b>${hiPath(a)}</b><p>${b}</p>${k==='g'?goalScale(tr):d?`<div class="dn">${ic('checkc','sm')}Hecho. Lo verás en las próximas fotos.<button class="btn sm ghost" data-act="gTStep" data-arg="${id}">${ic('undo','sm')}Deshacer</button></div>`:`<button class="btn sm line" data-act="gTStep" data-arg="${id}">${ic('check','sm')}Marcar como hecho</button>`}</div></li>`}).join('')}</ol>
  <h4>Palabras del tema<span>pulsa una para ver su Top 10</span></h4>
  <div class="kws">${kws.map(([k,p,pv,pgp],j)=>{const op=U.g.kwOpen===j;return `<div class="kw ${op?'open':''}"><button data-act="gKw" data-arg="${j}" aria-expanded="${op}"><span class="q">${k}${pgp?`<code class="p">${pgp}</code>`:''}</span><b class="num">${p??'<span class="ns">No sale</span>'}</b>${p&&pv?gDelta(pv,p):'<span></span>'}${ic('chevd','sm')}</button>
   ${op?`<ol class="t10">${GTOP10.map((d,n)=>`<li class="${d==='nubaria.es'?'me':''}"><span class="num">${n+1}</span>${fav(d,'xs')}<span class="mono">${d}</span>${d==='nubaria.es'?'<span class="you">Tú</span>':''}</li>`).join('')}</ol>`:''}</div>`}).join('')}</div>
  <h4>Preguntas que Google enseña</h4><ul class="pq">${['¿Cuánto cobra un autónomo por hacer una factura?','¿Qué programa usan los autónomos para facturar?','¿Es obligatorio Verifactu para autónomos?'].map(q=>`<li>${q}</li>`).join('')}</ul>
  <h4>Mapa de Google</h4><p class="s">En este tema Google no enseña mapa: no hace falta ficha de empresa.</p>
 </div>`}
function gOpenTopic(i){U.g.topic=i;bSheet(gTopicHtml(i),GTOPICS[i].n)}

/* ---------- Descubrir ---------- */
function gDesc(){const src=U.g.dsrc,left=5-U.g.used,out=left<=0&&src!=='gsc';const res=U.g.shown[src]?GDISC[src]:null;const pick=U.g.pick;const mx=res?Math.max(...res.map(r=>r[1])):1;
 const intro={seed:`<div class="sc-g-seed"><div class="search">${ic('search','sm')}<input id="g-seed" value="factura" aria-label="Palabra de partida"></div><button class="btn ink" data-act="gSearch" ${out||U.g.searching?'disabled':''}>${U.g.searching?'<span class="shimmer">Buscando…</span>':'Buscar ideas'}</button></div>`,
  riv:`<div class="sc-g-seed"><p>Palabras que traen visitas a <span class="mono">cuentix.com</span>, <span class="mono">factulia.es</span> y <span class="mono">librocloud.io</span> y en las que tú no sales.</p><button class="btn ink" data-act="gSearch" ${out||U.g.searching?'disabled':''}>${U.g.searching?'<span class="shimmer">Buscando…</span>':'Buscar en tus rivales'}</button></div>`,
  gsc:`<div class="sc-g-seed"><p>Búsquedas de tu Search Console en las que ya sales entre los puestos 4 y 20 y que todavía no vigilas. <b>No gastan búsquedas.</b></p></div>`}[src];
 return `<div class="sc-g-dtop bsc">${seg('g-dsrc',[['seed','A partir de una palabra'],['riv','Las de tus rivales'],['gsc','Search Console']],src,'gDsrc')}
  <div class="cnt" aria-label="Te quedan ${left} de 5 búsquedas hoy"><span class="dots" aria-hidden="true">${[0,1,2,3,4].map(k=>`<i class="${k<left?'on':''}"></i>`).join('')}</span><span class="num">Te quedan <b>${left} de 5</b> búsquedas hoy</span></div></div>
 <div class="card sc-g-disc"><div class="card-b">${intro}
  ${out?`<div class="sc-g-out">${ic('warn','sm')}Has usado las 5 búsquedas de hoy. Mañana tendrás otras 5.</div>`:''}
  ${res?`<div class="res"><div class="rh" aria-hidden="true"><span></span><span>Palabra</span><span>Búsquedas al mes</span></div>${res.map(([k,v,p],i)=>`<label class="rr ${pick.has(i)?'sel':''}"><input type="checkbox" data-chg="gPick" data-arg="${i}" ${pick.has(i)?'checked':''}><span class="q">${k}${p?`<span class="badge b-blue">Puesto ${p}</span>`:''}</span><span class="v num">${bNf(v)}</span>${bar(v,{max:mx*1.05,cls:'thin ink nomark',delay:i*40})}</label>`).join('')}</div>`:`<p class="sc-g-wait">Los resultados salen aquí.</p>`}
 </div>${res?`<div class="sc-g-dfoot"><span>Con cuánta gente las busca en España. Te quedan ${GW.cap-GW.tracked} palabras en tu plan.</span><button class="btn ink" data-act="gWatchWords" ${pick.size?'':'disabled'}>${ic('eye','sm')}Vigilar ${pick.size} ${pick.size===1?'palabra':'palabras'}</button></div>`:''}</div>`}

/* ---------- screen ---------- */
SCREENS.google={title:'Posición en Google',render(){const g=U.g;
 const body=g.tab==='temas'?gTemas():g.tab==='desc'?gDesc():gResumen();
 return `<div class="sc-g"><div class="eyebrow bare">Posición en Google · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span></div>
 <div class="pr-hd"><h1>Posición en Google</h1><div class="hd-d">${g.st==='connect'?`<button class="btn line sm" data-act="gConnect">${ic('plug','sm')}Conectar Search Console</button>`:`<span class="btn line sm gsc-on" aria-label="Search Console conectado">${lg('google',13)}Search Console conectado</span>`}</div></div>
 <p class="lead">Sales en el puesto medio <b class="num">14,2</b>, 2,6 puestos más arriba que en la foto anterior. <a href="#competitors" data-route="competitors">Cuentix</a> tiene 14 palabras en el Top 10; tú, 9.</p>
 <div class="pills hd-m">${g.st==='connect'?`<button class="btn line sm" data-act="gConnect">${ic('plug','sm')}Conectar Search Console</button>`:`<span class="btn line sm gsc-on" aria-label="Search Console conectado">${lg('google',13)}Search Console conectado</span>`}</div>
 <div class="sc-g-tabs tw">${seg('g-tab',[['res','Resumen'],['temas','Seguimiento de categorías'],['desc','Descubrir palabras']],g.tab,'gTab')}</div>
 ${body}
 ${bProto('gState',[['ok','Conectado'],['connect','Sin conectar'],['loading','Cargando'],['first','Primera foto']],g.st)}</div>`},
 after(root,first){bLight(root,first);bAmbObserve(root);
  const el=$('#g-pos',root);if(el&&first&&U.g.tab==='res')bCount(el,GW.prev,GW.pos)}};

ACT.gTab=el=>{U.g.tab=el.dataset.arg;bRe()};
ACT.gState=el=>{const s=el.dataset.arg;U.g.st=s;U.g.tab='res';bRe();if(s==='loading')gFinishLoad()};
function gFinishLoad(){clearTimeout(U.g._lt);U.g._lt=setTimeout(()=>{if(U.g.st!=='loading')return;U.g.st='ok';if(R.route==='google')bRe();toast('Search Console conectado.','Ya ves tus datos reales de Google.','checkc')},2400)}
ACT.gConnect=el=>{el.innerHTML='<span class="shimmer">Conectando…</span>';el.disabled=true;setTimeout(()=>{U.g.st='loading';bRe();gFinishLoad()},500)};
ACT.gDisc=el=>{U.g.disc=el.dataset.arg==='1';bRe()};
ACT.gDiscOk=()=>{U.g.disc=false;U.g.st='connect';bRe();toast('Search Console desconectado.','Hemos borrado el acceso de GenScore.','checkc')};
ACT.gTodoInl=el=>{U.g.inl=el.dataset.arg||null;bRe()};
ACT.gTodoOk=el=>{const id=el.dataset.arg;U.g.todo[id]=1;U.g.inl=null;bRe();toast('Hecho.','Lo verás en las próximas fotos.','checkc',()=>{delete U.g.todo[id];bRe()})};
ACT.gTodoUndo=el=>{delete U.g.todo[el.dataset.arg];bRe()};
ACT.gRivEdit=()=>{U.g.rivEdit=!U.g.rivEdit;bRe()};
ACT.gRivPick=el=>{U.g.riv[el.dataset.arg]=el.checked?1:0};
ACT.gRivSave=()=>{U.g.rivEdit=false;bRe();toast('Rivales guardados.','Los verás en la próxima foto.','checkc')};
ACT.gQf=el=>{U.g.qf=el.dataset.arg;bRe()};
ACT.gSort=el=>{const k=el.dataset.arg;U.g.qs=U.g.qs.k===k?{k,d:-U.g.qs.d}:{k,d:k==='q'||k==='pos'?1:-1};bRe()};
ACT.gWatch=el=>{const i=el.dataset.arg;U.g.adding[i]=1;bRe();setTimeout(()=>{delete U.g.adding[i];U.g.watch[i]=1;if(R.route==='google')bRe();toast('Prompt vigilado.','Se escaneará en todos tus motores de IA.','eye',()=>{delete U.g.watch[i];if(R.route==='google')bRe()})},700)};
ACT.gNewTopic=()=>{U.g.newTopic=!U.g.newTopic;bRe();if(U.g.newTopic)setTimeout(()=>{const i=$('#gtn');i&&i.focus()},30)};
ACT.gNewTopicOk=()=>{const n=($('#gtn')||{}).value||'Tema nuevo';GTOPICS.push({n:n.trim()||'Tema nuevo',pg:null,kw:2,pos:null,prev:null,h:[]});GW.tracked+=2;U.g.newTopic=false;bRe();toast('Guardado.','Estamos tomando la primera foto de Google.','checkc')};
ACT.gTopic=el=>gOpenTopic(+el.dataset.arg);
ACT.gKw=el=>{const j=+el.dataset.arg;U.g.kwOpen=U.g.kwOpen===j?-1:j;gOpenTopic(U.g.topic)};
ACT.gTStep=el=>{const id=el.dataset.arg;if(U.g.tsteps[id])delete U.g.tsteps[id];else{U.g.tsteps[id]=1;toast('Hecho.','Lo verás en las próximas fotos.','checkc')}gOpenTopic(U.g.topic)};
ACT.gDsrc=el=>{U.g.dsrc=el.dataset.arg;U.g.pick=new Set();bRe()};
ACT.gPick=el=>{const i=+el.dataset.arg;el.checked?U.g.pick.add(i):U.g.pick.delete(i);const b=$('[data-act="gWatchWords"]');const n=U.g.pick.size;if(b){b.disabled=!n;b.innerHTML=`${ic('eye','sm')}Vigilar ${n} ${n===1?'palabra':'palabras'}`}el.closest('.rr').classList.toggle('sel',el.checked)};
ACT.gSearch=()=>{if(U.g.used>=5)return;U.g.searching=true;bRe();setTimeout(()=>{U.g.searching=false;U.g.used=Math.min(5,U.g.used+1);U.g.shown[U.g.dsrc]=1;U.g.pick=new Set();if(R.route==='google')bRe()},800)};
ACT.gWatchWords=()=>{const res=GDISC[U.g.dsrc];const words=[...U.g.pick].map(i=>res[i][0]);GW.tracked+=words.length;U.g.newWords=words;U.g.pick=new Set();U.g.tab='res';U.g.st='first';bRe();$('#sc').scrollTop=0;toast('Guardado.','Estamos tomando la primera foto de Google.','eye')};
CMDS.push(['Posición en Google','Descubrir palabras','search',()=>{U.g.tab='desc';go('google')}],['Posición en Google','Ver Google sin conectar','plug',()=>{U.g.st='connect';U.g.tab='res';go('google')}]);
