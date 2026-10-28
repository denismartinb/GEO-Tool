/* ================= SCREEN: Visibilidad en agentes =================
   The score hero is this screen's one .deep block. Pro, Agencia and trial only. */
function agxHead(){return `<div class="eyebrow bare">Comercio agéntico · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span></div>
 <h1 style="margin-top:14px">Visibilidad en agentes</h1>
 <p class="lead">Si un agente de IA puede encontrarte, entrar, entender lo que vendes, fiarse y llegar a comprar.</p>`}
function agxPath(){const nodes=[['search','Te encuentra','Te nombran en el 42% de las preguntas de compra','neu'],...AGX.comps.map(x=>[x.ico,x.step,x.line,x.tone])];const stop=nodes.findIndex(n=>n[3]==='bad');
 return `<ol class="agx-path" style="--stop:${stop}">${nodes.map(([i,t,l,tn],j)=>`<li class="${tn} ${j===stop?'stop':''} ${j>stop?'after':''}"><span class="c">${ic(i)}</span><span class="n num">${pad(j+1)}</span><b>${t}</b><small>${l}</small>${j===stop?'<span class="tag">Aquí se frena</span>':''}</li>`).join('')}</ol>`}
function agxComps(){return `<div class="agx-comps">${AGX.comps.map((x,i)=>`<a class="cr" href="#agaudit" data-act="agxComp" data-arg="${x.k}"><span class="t"><b>${x.n}</b><span>${x.purpose}</span></span><span class="v num"><b>${roll(x.p)}</b><small>/${x.w}</small></span>${bar(x.p,{max:x.w,cls:x.p/x.w<.5?'warm':'',delay:i*80,label:`${x.n}: ${x.p} de ${x.w}`})}<span class="f"><i class="${x.tone}"></i>${x.line}</span>${ic('chevr','sm')}</a>`).join('')}
 <a class="cr io" href="#agaudit" data-act="agxComp" data-arg="interop"><span class="t"><b>Interoperabilidad</b><span>Canal directo para agentes. Va fuera de la nota.</span></span><span class="v num"><b>1</b><small> de 4</small></span><span class="dots" aria-label="1 de 4 protocolos publicados">${AGX.interop.items.map(([n,ok])=>`<i class="${ok?'on':''}" title="${n}"></i>`).join('')}</span><span class="f"><i class="warn"></i>Te falta: Catálogo por MCP, Perfil UCP y Tarjeta de agente A2A</span>${ic('chevr','sm')}</a></div>`}
function agxPurchase(){const max=60;return `<div class="card agx-pq"><div class="card-h"><h3>Preguntas de compra</h3><a class="see" href="#prompts" data-route="prompts">Ver prompts${ic('chevr','sm')}</a></div>
 <div class="card-b"><div class="hh" aria-hidden="true"><span>Motor</span><span>Te nombra</span><span>Cita tu web</span><span>Manda a un marketplace</span></div>
 ${EK.map((k,i)=>{const d=AGX_PQ[k];const cell=(v,c)=>v==null?`<span class="m na">No busca en la web</span>`:`<span class="m"><b class="num">${v}<small>%</small></b>${bar(v,{max,cls:'thin nomark '+c,delay:i*60})}</span>`;
  return `<div class="er"><span class="e">${lg(k,16)}<b>${ENG[k].n}</b>${ENG[k].isNew?'<span class="new">Nuevo</span>':''}</span>${cell(d[0],'')}${cell(d[1],'ink')}${cell(d[2],'warm')}</div>`}).join('')}
 <div class="qs">${['¿Cuánto cuesta un programa de facturación online?','Software de facturación barato para pymes','¿Qué app de facturas recomiendas para una pyme de 10 empleados?'].map(q=>`<span>${ic('cart','sm')}${q}</span>`).join('')}</div>
 </div></div>`}
function agxFirst(){return `<div class="card agx-first"><div class="card-h"><h3>Qué hacer primero</h3></div><div class="card-b"><ol>${AGX_STEPS.map(([k,t],i)=>{const d=U.ag.steps[i],c=AGX.comps.find(x=>x.k===k);return `<li class="${d?'done':''}"><span class="n num">${d?ic('check','sm'):i+1}</span><div><div class="ch">${srcChip('agent')}<span>${c.n}</span></div><b>${hiPath(t)}</b>
  ${d?`<div class="dn">Marcada como hecha. Lo comprobamos en la próxima revisión.<button class="btn sm ghost" data-act="agxUndo" data-arg="${i}">${ic('undo','sm')}Deshacer</button></div>`:U.ag.inl===String(i)?`<span class="inl">¿Marcarla como hecha?<button class="btn ink" data-act="agxDone" data-arg="${i}">Sí</button><button class="btn ghost" data-act="agxInl" data-arg="">No</button></span>`:`<button class="btn sm ghost" data-act="agxInl" data-arg="${i}">${ic('check','sm')}Marcar como hecho</button>`}</div></li>`}).join('')}</ol>
 <a class="more" href="#agaudit" data-route="agaudit">Ver todas las comprobaciones${ic('arrowr','sm')}</a></div></div>`}

/* ---------- hero: «Cuadro claro» (Denis 2026-10-27). Bands and the PageSpeed-
   style shapes (triangle, square, circle) people already know. ---------- */
const aghSt=x=>{const r=x.p/x.w;return r>=.75?['ok','Bien']:r>=.5?['mid','Mejorable']:['bad','Se frena']};
const aghPct=x=>Math.round(x.p/x.w*100);
const aghBand=v=>v>=75?['ok','Bien']:v>=50?['mid','Mejorable']:['bad','Se frena'];
const AGH_SHAPE='<i class="sh" aria-hidden="true"></i>';
const AGH_H='Los agentes ya te encuentran. Ahora falta que confíen en tu web.';

/* ---------- the cluster: a car-style instrument cluster on the page's own
   surface (Denis asked for more wow, then a lighter version of it).
   On arrival it does an ignition check: every warning light flashes once,
   the big needle sweeps to 100 and settles on the score, then the four
   small dials follow. It plays once per arrival, never in a loop, and has no replay control; with
   reduced motion everything sits in its final state. ---------- */
const CK_SW=270,CK_A0=135;
const ckPt=(cx,cy,r,f)=>{const t=(CK_A0+CK_SW*f)*Math.PI/180;return [cx+r*Math.cos(t),cy+r*Math.sin(t)]};
const ckArc=(cx,cy,r,f0,f1)=>{const [x0,y0]=ckPt(cx,cy,r,f0),[x1,y1]=ckPt(cx,cy,r,f1);return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(f1-f0)*CK_SW>180?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`};
const ckDeg=v=>(CK_A0+CK_SW*v/100).toFixed(1)+'deg';
function ckMain(v,to){const c=160,r=118,full=ckArc(c,c,r,0,1);
 const ticks=Array.from({length:51},(_,i)=>{const f=i/50,mj=i%5===0,[x0,y0]=ckPt(c,c,r+14,f),[x1,y1]=ckPt(c,c,r+(mj?26:20),f);return `<line class="${mj?'mj':''} ${i<=v/2?'on':''}" style="--k:${i}" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`}).join('');
 const lab=[0,20,40,60,80,100].map(n=>{const [x,y]=ckPt(c,c,r+42,n/100);return `<text x="${x.toFixed(1)}" y="${(y+4).toFixed(1)}" text-anchor="middle">${n}</text>`}).join('');
 const zone=(a,b,cl)=>`<path class="z ${cl}" d="${ckArc(c,c,r+8,a/100,b/100)}"/>`;
 const [tx,ty]=ckPt(c,c,r+8,to/100),[lx,ly]=ckPt(c,c,r-30,to/100);
 return `<div class="ck-main"><span class="ck-sweep" aria-hidden="true"></span><svg viewBox="0 0 320 300" aria-hidden="true">
  <defs><linearGradient id="ckg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3d7bff"/><stop offset="1" stop-color="#7fd8ff"/></linearGradient>
  <filter id="ckb" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs>
  <g class="tk">${ticks}</g>${lab}
  ${zone(0,49.4,'bad')}${zone(50.6,74.4,'mid')}${zone(75.6,100,'ok')}
  <path class="trk" d="${full}"/>
  <path class="val gl" d="${full}" pathLength="100" filter="url(#ckb)"/>
  <path class="val" d="${full}" pathLength="100"/>
  <g class="tgt"><circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="4"/><text x="${lx.toFixed(1)}" y="${(ly+4).toFixed(1)}" text-anchor="middle">${to}</text></g>
  <g class="ndl"><line x1="${c}" y1="${c}" x2="${c+r-16}" y2="${c}"/><circle class="tip" cx="${c+r-16}" cy="${c}" r="3.5"/></g>
  <circle class="hub" cx="${c}" cy="${c}" r="11"/><circle class="hub2" cx="${c}" cy="${c}" r="4"/></svg>
  <div class="rd"><b class="num">${v}</b><small>de 100</small><span>Visibilidad agéntica</span></div></div>`}
function ckSmall(x,i){const pc=aghPct(x),[cl,w]=aghSt(x),c=60,r=44,full=ckArc(c,c,r,0,1);
 const ticks=Array.from({length:11},(_,k)=>{const [x0,y0]=ckPt(c,c,r+7,k/10),[x1,y1]=ckPt(c,c,r+12,k/10);return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`}).join('');
 return `<a class="ck-sm ${cl}" href="#agaudit" data-act="agxComp" data-arg="${x.k}" style="--v:${pc};--av:${ckDeg(pc)};--d:${(1.5+i*.14).toFixed(2)}s" aria-label="${x.n}: ${pc} de 100, ${w}">
  <span class="dl"><svg viewBox="0 0 120 112" aria-hidden="true"><g class="tk">${ticks}</g><path class="trk" d="${full}"/><path class="val" d="${full}" pathLength="100"/>
  <g class="ndl"><line x1="${c}" y1="${c}" x2="${c+r-8}" y2="${c}"/></g><circle class="hub" cx="${c}" cy="${c}" r="5"/></svg>
  <span class="in"><b class="num">${pc}</b></span></span>
  <b class="nm">${x.n}</b><span class="st">${AGH_SHAPE}${w}</span></a>`}
function ckLights(){const L=[...AGX.comps.map(x=>{const [cl]=aghSt(x),bad=(AGX_CHK[x.k]||[]).find(c=>c[0]!=='ok');return {k:x.k,ico:x.ico,cl,t:x.n,s:bad?bad[1]:'Todo bien'}}),{k:'interop',ico:'plug',cl:'mid',t:'Interoperabilidad',s:'Conexión directa de agentes a tu tienda'}];
 return `<div class="ck-lights" role="list" aria-label="Testigos">${L.map((l,i)=>`<a role="listitem" class="lt ${l.cl}" href="#agaudit" data-act="agxComp" data-arg="${l.k}" style="--i:${i}"><span class="bulb">${ic(l.ico)}</span><span class="tx"><b>${l.t}</b><small>${l.s}</small></span></a>`).join('')}</div>`}
function ckBlock(){const S=AGX.score,T=AGX.to,[sc]=aghBand(S),c=AGX.comps;
 return `<section class="sec" aria-label="Visibilidad agéntica"><div class="card ck blit ck-lt" style="--v:${S};--av:${ckDeg(S)};--a0:${ckDeg(0)};--a100:${ckDeg(100)};--avlo:${ckDeg(S-5)}">
  <span class="agh-tab">${ic('agent','sm')}Visibilidad agéntica</span>
  <div class="ck-clu"><div class="ck-side">${ckSmall(c[0],0)}${ckSmall(c[1],1)}</div>${ckMain(S,T)}<div class="ck-side">${ckSmall(c[2],2)}${ckSmall(c[3],3)}</div></div>
  ${ckLights()}
  <div class="ck-ft"><div><h2>${AGH_H}</h2></div><button class="btn ck-btn" data-route="agaudit">Ver la auditoría${ic('arrowr','sm')}</button></div>
 </div></section>`}
function ckIgnite(root,play){const el=$('.ck',root);if(!el)return;if(!play||RM.matches){el.classList.add('done');return}
 el.classList.remove('go','done');void el.offsetWidth;el.classList.add('go')}

SCREENS.agents={title:'Visibilidad en agentes',render(){const st=U.ag.st;
 const proto=bProto('agxState',[['ok','Con tienda'],['none','No vende nada'],['starter','Plan Starter']],st);
 if(st==='starter')return `<div class="sc-ag">${agxHead()}${agxUpsell('Visibilidad en agentes')}${proto}</div>`;
 if(st==='none')return `<div class="sc-ag">${agxHead()}<div class="card agx-none"><div class="card-b"><span class="ic">${ic('cart')}</span><h2>No hemos encontrado qué vendes en tu web</h2><p>Buscamos en tu catálogo, tu sitemap y tu portada. Lo volvemos a buscar en cada visita.</p><button class="btn line" data-route="agaudit">Elegir una página${ic('arrowr','sm')}</button></div></div>${proto}</div>`;
 return `<div class="sc-ag">${agxHead()}
 ${ckBlock()}
 <section class="sec agx-g75">${agxPurchase()}${agxFirst()}</section>
 ${proto}</div>`},
 after(root,first){bLight(root,first);ckIgnite(root,first||U.ag.ckPlay);U.ag.ckPlay=0}};

ACT.agxState=el=>{U.ag.st=el.dataset.arg;bRe()};
ACT.agxComp=el=>{U.aa.f=el.dataset.arg;U.aa.st='ok';const c=AGX_CHK[el.dataset.arg];U.aa.open=c?el.dataset.arg+':0':null;go('agaudit')};
ACT.agxInl=el=>{U.ag.inl=el.dataset.arg||null;bRe()};
ACT.agxDone=el=>{const i=el.dataset.arg;U.ag.steps[i]=1;U.ag.inl=null;bRe();toast('Marcada como hecha.','Lo comprobamos en la próxima revisión.','checkc',()=>{delete U.ag.steps[i];if(R.route==='agents')bRe()})};
ACT.agxUndo=el=>{delete U.ag.steps[el.dataset.arg];bRe()};
CMDS.push(['Comercio agéntico','Ver Visibilidad en agentes en Starter','agent',()=>{U.ag.st='starter';go('agents')}]);
