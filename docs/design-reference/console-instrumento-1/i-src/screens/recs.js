/* ================= SCREEN: Recomendaciones =================
   Plan of the week as a deck (focus mode), «Más adelante» at real scale:
   lever pills, search, source filters, groups of 3 + «Ver N más», compact
   rows, and «Abrir en foco» for any filtered set. */
Object.assign(U,{recIdx:0,done:{},gen:{},qs:{},ltab:'pend',q:'',f:'all',lever:null,row:null,inl:null,more:{},deck:null,fdeck:null});
const ALLRECS=[...PLAN,...LATER];
const recById=id=>ALLRECS.find(r=>r.id===id);
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* highlight the search in already-built html, skipping tags and entities */
function markHtml(html,q){if(!q)return html;const fq=fold(q);
 return html.split(/(<[^>]+>|&[a-z]+;)/).map(p=>{if(!p||p[0]==='<'||(p[0]==='&'&&p.endsWith(';')))return p;const f=fold(p);let out='',i=0,j;while((j=f.indexOf(fq,i))>-1){out+=p.slice(i,j)+'<mark>'+p.slice(j,j+fq.length)+'</mark>';i=j+fq.length}return out+p.slice(i)}).join('')}

/* ---------- filtering ---------- */
const matchQ=(x,q)=>!q||fold([x.do,x.why,x.kind].join(' ').replace(/&lt;|&gt;/g,'')).includes(fold(q));
const matchF=(x,f)=>f==='all'||x.src===f;
function filtered({lever=U.lever,q=U.q,f=U.f}={}){return LATER.filter(x=>!U.done[x.id]&&(lever==null||x.lever===lever)&&matchQ(x,q)&&matchF(x,f))}
const impLabel=x=>x.pt?'+'+x.pt+' pt':x.imp;
const sumPt=list=>list.reduce((a,x)=>a+(x.pt||0),0);

/* ---------- shared card (deck and focus) ---------- */
function genBlock(r){const g=U.gen[r.id];
 if(g==='…')return `<div class="think" role="status"><span class="dots"><i></i><i></i><i></i></span><span class="shimmer">Generando…</span></div>`;
 if(g!==1)return '';
 return `<div class="gen"><div class="gh">${ic('sparkles','sm')}${r.genT||r.gen.replace(/^Generar /,'').replace(/^./,c=>c.toUpperCase())}<span style="color:var(--ink-3);font-weight:400">Listo para copiar</span><button class="btn sm line" data-act="copy">${ic('copy','sm')}Copiar</button></div><ol><li>Responde la pregunta en la primera frase, sin introducciones.</li><li>Pon los datos en una tabla o una lista que se pueda citar.</li><li>Enlázala desde una página que ya tenga tráfico.</li></ol><p>Plantilla generada por IA: revísala y adáptala a tu web antes de publicarla.</p></div>`}
function actionsFor(r,{compact=false}={}){const sm=compact?' sm':'';const done=U.done[r.id];
 if(done)return `<div class="donebar">${ic('checkc')}${done}<button class="btn sm ghost" data-act="undo" data-arg="${r.id}">${ic('undo','sm')}Deshacer</button></div>`;
 const gen=r.gen?`<button class="btn line${sm}" data-act="gen" data-arg="${r.id}" ${U.gen[r.id]?'disabled':''}>${ic('sparkles','sm')}${r.gen}</button>`:'';
 const later=`<button class="btn ghost${sm}" data-act="notnow" data-arg="${r.id}">Ahora no</button>`;
 switch(r.type){
  case 'google':return `<button class="btn ink${sm}" data-route="google">Ver en Posición en Google</button>${later}`;
  case 'gaction':return `<button class="btn ink${sm}" data-route="google">Ver en Posición en Google</button>${markBtn(r,compact)}`;
  case 'watch':return `<button class="btn ink${sm}" data-act="watch" data-arg="${r.id}">${ic('eye','sm')}Vigilar prompt</button>${later}`;
  case 'comp':return `<button class="btn ink${sm}" data-act="addcomp" data-arg="${r.id}">${ic('plus','sm')}Añadir ${r.name} a competidores</button>`;
  case 'agent':return `<button class="btn ink${sm}" data-route="agaudit">Ver la auditoría agéntica</button>`;
  case 'third':return gen+markBtn(r,compact);
  default:return gen+markBtn(r,compact)}}
/* compact rows confirm inline; deck cards use slide to confirm */
function markBtn(r,compact){if(!compact)return '';return U.inl===r.id?`<span class="inl">¿Marcarla como hecha?<button class="btn ink" data-act="ldone" data-arg="${r.id}">Sí</button><button class="btn ghost" data-act="inl" data-arg="">No</button></span>`:`<button class="btn sm ghost" data-act="inl" data-arg="${r.id}">${ic('check','sm')}Marcar como hecho</button>`}
/* the user can mark what they do themselves, outreach included (they send the email);
   Google ranking goals are outcomes they cannot execute, so those never get it */
const canSlide=r=>(r.type==='gen'||r.type==='gaction'||r.type==='third')&&!U.done[r.id];
function hintFor(r){if(U.done[r.id])return r.type==='google'?'':`<p class="hint2">${r.type==='third'?'Verás si te incluyen en tu próximo escaneo.':'Lo verás en tu próximo escaneo.'}</p>`;
 if(r.type==='google')return '<p class="hint2">No hace falta marcarla: GenScore sigue el puesto cada semana.</p>';
 if(r.type==='third')return '<p class="hint2">Verás si te incluyen en tu próximo escaneo.</p>';return ''}
function card(r,i){const op=U.qs[r.id];
 const acts=canSlide(r)?`<div class="dk-act">${slideHtml(r.id)}${r.gen?`<button class="btn line" data-act="gen" data-arg="${r.id}" ${U.gen[r.id]?'disabled':''}>${ic('sparkles','sm')}${r.gen}</button>`:''}${r.type==='gaction'?`<button class="btn ghost" data-route="google">Ver en Posición en Google</button>`:''}<button class="btn ghost dk-next" data-act="dknext">Siguiente${ic('arrowr','sm')}</button></div>`:`<div class="dk-act">${actionsFor(r)}<button class="btn ghost dk-next" data-act="dknext">Siguiente${ic('arrowr','sm')}</button></div>`;
 const qs=r.qs||(r.n?Array.from({length:r.n},(_,k)=>['Programa de facturación para autónomos','Software de facturación con Verifactu','Alternativas a Cuentix para pymes','Mejor programa de facturación online','Facturación electrónica para pymes'][k%5]):null);
 return `<div class="in">
  <div class="dk-top"><span class="dk-ix num" aria-hidden="true">${pad(i+1)}</span><div class="dk-ch">${srcChip(r.src)}<span class="k">${r.kind}</span>${r.quick?'<span class="badge b-blue">Victoria rápida</span>':''}${r.third?'<span class="badge b-line">Depende de terceros</span>':''}</div>
   <div class="dk-imp">${r.pt?`<div class="v num">+${r.pt}<small>pt</small></div><div class="t">Puntuación GEO</div>`:`<div class="w">${r.imp}</div>`}</div></div>
  <div class="do-k">Haz esto</div>
  <h3 class="do">${hiPath(r.do)}</h3>
  <p class="why">${r.why}</p>
  ${r.track?goalScale(r.track):''}
  ${qs&&r.e?`<div class="seen ${op?'open':''}"><button data-act="qs" data-arg="${r.id}" aria-expanded="${!!op}"><span>Visto en ${qs.length} ${qs.length===1?'pregunta':'preguntas'}</span><span class="e" aria-label="Motores: ${engNames(r.e)}">${r.e.map(k=>lg(k,14)).join('')}</span>${ic('chevd','sm')}</button>${op?`<ul>${qs.map(q=>`<li>${q}</li>`).join('')}</ul>`:''}</div>`:''}
  ${genBlock(r)}
  ${acts}${hintFor(r)}
 </div>`}

/* ---------- compact list ---------- */
function lrow(x){const op=U.row===x.id;
 return `<div class="lrow ${op?'open':''}"><button data-act="row" data-arg="${x.id}" aria-expanded="${op}"><span class="tt"><span class="ch lq">${pvSrc(x.src)}${x.third?'<span class="tx">Depende de terceros</span>':''}${x.quick?'<span class="tx">Victoria rápida</span>':''}<span class="im-m num">· ${impLabel(x)}</span></span><b>${markHtml(hiPath(x.do),U.q)}</b><span class="w">${markHtml(x.why,U.q)}</span></span><span class="im num ${x.pt?'':'lo'}">${impLabel(x)}</span>${ic('chevd','sm')}</button>
  ${op?`<div class="ex">${x.saw?`<div class="lbl">Lo que vimos</div><p>${x.saw}</p>`:''}${x.e?`<p class="eng-l">${x.e.map(k=>lg(k,13)).join('')}Visto en ${x.n} ${x.n===1?'pregunta':'preguntas'} de ${engNames(x.e)}</p>`:''}${x.track?goalScale(x.track):''}${genBlock(x)}<div class="acts">${actionsFor(x,{compact:true})}</div>${hintFor(x)}</div>`:''}</div>`}
const GROUP_SHOW=3;
function groupHtml(g,items){const all=U.more[g.k]||U.lever===g.k||U.q||items.length<=GROUP_SHOW+1;const shown=all?items:items.slice(0,GROUP_SHOW);const pt=sumPt(items);
 return `<section class="grp" aria-label="${g.l}"><div class="grp-h"><h3>${g.l}</h3><span class="ct num">${items.length} ${items.length===1?'acción':'acciones'}</span><span class="im num ${pt?'':'q'}">${pt?'Hasta +'+pt+' pt':items[0].imp}</span>${U.lever===g.k?'':`<button class="btn sm line" data-act="focusgrp" data-arg="${g.k}">${ic('focus','sm')}Abrir en foco</button>`}</div>
  ${U.lever===g.k?'':`<p class="grp-d">${g.d}</p>`}${shown.map(lrow).join('')}
  ${items.length>GROUP_SHOW+1&&!U.q&&U.lever!==g.k?`<button class="more" data-act="more" data-arg="${g.k}" aria-expanded="${!!U.more[g.k]}">${U.more[g.k]?'Ver menos':`Ver ${items.length-GROUP_SHOW} más`}${ic('chevd','sm')}</button>`:''}</section>`}
function laterList(){if(U.ltab==='res'){const mine=ALLRECS.filter(r=>U.done[r.id]);
  return `${mine.map(r=>`<div class="hist">${ic('checkc')}<div class="b"><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="badge b-blue">${U.done[r.id].replace(/\.$/,'')}</span><span class="badge b-line">${r.kind}</span></div><h4>${hiPath(r.do)}</h4><p>Hoy.</p></div><button class="btn sm ghost" data-act="undo" data-arg="${r.id}">${ic('undo','sm')}Deshacer</button></div>`).join('')}${RES.map(([a,k,t,v,url])=>`<div class="hist">${ic('checkc')}<div class="b"><div style="display:flex;gap:6px;flex-wrap:wrap"><span class="badge ${url||a==='Resuelta sola'?'b-pos':'b-blue'}">${a}</span><span class="badge b-line">${k}</span></div><h4>${url?`<s>${t}</s>`:t}</h4><p>${v}${url?` <span class="mono">${url}</span>`:''}</p></div></div>`).join('')}`}
 const list=filtered();
 if(!list.length)return `<div class="empty-s">Nada con estos filtros.<div style="margin-top:12px"><button class="btn sm line" data-act="clearf">Quitar filtros</button></div></div>`;
 return LEVERS.filter(g=>U.lever==null||g.k===U.lever).map(g=>{const it=list.filter(x=>x.lever===g.k);return it.length?groupHtml(g,it):''}).join('')}
function chipsHtml(){const base=filtered({f:'all'});const c={all:base.length,ia:base.filter(x=>x.src==='ia').length,google:base.filter(x=>x.src==='google').length,agent:base.filter(x=>x.src==='agent').length};
 return [['all','Todas'],['ia','IA'],['google','Google'],['agent','Agentes']].map(([k,l])=>`<button class="stab" data-act="fsrc" data-arg="${k}" aria-pressed="${U.f===k}" ${c[k]||k==='all'?'':'disabled'}>${l}<span class="c num">${c[k]}</span></button>`).join('')}
/* palancas: a quiet text index beside the list (desktop) and a native select (mobile), never pills */
function pillsHtml(){const all=filtered({lever:null});
 const opt=(k,l,n,pt)=>`<button class="lix" data-act="lever" data-arg="${k}" aria-pressed="${(U.lever||'')===k}" ${n||!k?'':'disabled'}><span class="nm">${l}</span>${pt?`<span class="p num">+${pt}</span>`:''}<span class="c num">${n}</span></button>`;
 return `<nav class="lidx" aria-label="Palancas"><div class="lidx-h">Palancas</div>${opt('','Todas',all.length,0)}${LEVERS.map(g=>{const it=filtered({lever:g.k});return opt(g.k,g.l,it.length,sumPt(it))}).join('')}<p class="lidx-f">Los puntos son lo máximo que puede sumar cada palanca.</p></nav>
 <label class="lsel"><span>Palanca</span><select id="lsel" aria-label="Palanca"><option value="">Todas (${all.length})</option>${LEVERS.map(g=>{const n=filtered({lever:g.k}).length;return `<option value="${g.k}" ${U.lever===g.k?'selected':''} ${n?'':'disabled'}>${g.l} (${n})</option>`}).join('')}</select>${ic('chevd','sm')}</label>`}
function rerenderLater(){const b=$('#laterb');if(!b)return;
 const pend=$('#lfilters');if(pend)pend.hidden=U.ltab!=='pend';const lg_=$('#lgrid');if(lg_)lg_.classList.toggle('one',U.ltab!=='pend');
 if(U.ltab==='pend'){$('#fchips').innerHTML=chipsHtml();$('#levers').innerHTML=pillsHtml();const n=filtered().length;$('#lcount').textContent=n;$('#focusall').disabled=!n}
 b.innerHTML=laterList();$('#ltot').textContent=LATER.filter(x=>!U.done[x.id]).length}

/* ---------- screen ---------- */
SCREENS.recs={title:'Recomendaciones',render(){const open=ALLRECS.filter(r=>!U.done[r.id]).length;
 return `<div class="eyebrow bare">Recomendaciones · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span><span class="badge b-line" style="letter-spacing:0;text-transform:none">${open} acciones</span></div>
 <h1 style="margin-top:14px">Recomendaciones</h1><p class="lead">Cuatro para esta semana. El resto, ordenado por palanca.</p>
 <div class="alert" role="region" aria-label="Bloqueo">${ic('warn')}<div class="tx"><b>Perplexity no puede leer tu web.</b> Tu robots.txt lo bloquea.</div><button class="btn warm sm" data-route="audit">Arreglarlo</button></div>
 <div class="pillars">${[['Presencia',41],['Prominencia',66],['Cuota de voz',34],['Autoridad',18]].map(([l,v],i)=>`<div><div class="l">${l}</div><b class="num">${roll(v)}</b>${bar(v,{cls:'thin '+(v<25?'warm':''),delay:i*80})}</div>`).join('')}</div>
 <button class="wins" data-act="wins">${ic('checkc','sm')}3 resueltas hace poco${ic('arrowr','sm')}</button>
 <div class="focus-h"><h2>Tu plan de esta semana. <b>Hasta +14 pt</b></h2><div class="ctl"><span style="font-size:12.5px;color:var(--ink-3)">← →</span><button class="navb" data-step="-1" aria-label="Acción anterior">${ic('chevl')}</button><button class="navb" data-step="1" aria-label="Acción siguiente">${ic('chevr')}</button></div></div>
 ${progressTicks(PLAN.length)}
 <div class="deck" id="deck" aria-roledescription="mazo" aria-label="Plan de la semana"></div>
 <div class="later-top" id="later"><h2>Más adelante<small class="num" id="ltot">${LATER.filter(x=>!U.done[x.id]).length}</small></h2>${seg('ltabs',[['pend','Pendientes'],['res','Resueltas']],U.ltab,'ltab')}</div>
 <div id="lfilters" ${U.ltab==='pend'?'':'hidden'}>
  <div class="toolbar"><label class="search">${ic('search','sm')}<input id="rq" type="search" placeholder="Busca una acción, una página o un rival" value="${esc(U.q)}" aria-label="Buscar en Más adelante"></label>
   <div class="stabs" id="fchips" role="group" aria-label="Fuente">${chipsHtml()}</div>
   <button class="btn sm line" id="focusall" data-act="focusall">${ic('focus','sm')}<span>Recorrer <span class="num" id="lcount">${filtered().length}</span> en foco</span></button></div></div>
 <div class="lgrid ${U.ltab==='pend'?'':'one'}" id="lgrid"><aside id="levers">${pillsHtml()}</aside><div id="laterb">${laterList()}</div></div>`},
 after(root){U.deck=makeDeck($('#deck',root),PLAN,{card,isDone:id=>!!U.done[id],ptk:$('#ptk',root),nav:$$('.focus-h [data-step]',root),onSlide:confirmDone,start:U.recIdx||0,lastLabel:'Ver el resto'});
  const q=$('#rq',root);q.addEventListener('input',()=>{U.q=q.value;U.row=null;rerenderLater()})}};

/* ---------- actions ---------- */
function eachDeck(fn){[U.deck,U.fdeck].forEach(d=>d&&fn(d))}
function refreshEverywhere(id){eachDeck(d=>d.items.some(r=>r.id===id)&&d.refresh(id));if(LATER.some(x=>x.id===id))rerenderLater()}
function setDone(id,msg){U.done[id]=msg;U.inl=null;if(U.row===id)U.row=null;refreshEverywhere(id);
 toast(msg,msg==='Marcada como hecha.'?(recById(id).type==='third'?'Verás si te incluyen en tu próximo escaneo.':'Lo verás en tu próximo escaneo.'):'','checkc',()=>{delete U.done[id];refreshEverywhere(id)})}
function confirmDone(id){setDone(id,'Marcada como hecha.');const d=U.fdeck&&U.fdeck.items.some(r=>r.id===id)?U.fdeck:U.deck;if(!d)return;const t=d.nextOpen();if(t>-1)setTimeout(()=>d.go(t),RM.matches?0:700)}
ACT.gen=el=>{const id=el.dataset.arg;U.gen[id]='…';refreshEverywhere(id);setTimeout(()=>{U.gen[id]=1;refreshEverywhere(id);toast('Propuesta generada.','La tienes en la tarjeta.','sparkles')},RM.matches?300:1700)};
ACT.copy=()=>toast('Copiado.','','copy');
ACT.undo=el=>{const id=el.dataset.arg;delete U.done[id];refreshEverywhere(id);if(U.ltab==='res')rerenderLater()};
ACT.qs=el=>{const id=el.dataset.arg;U.qs[id]=!U.qs[id];refreshEverywhere(id);const b=$(`.dk[data-id="${id}"] [data-act="qs"]`,$('#focus').hidden?document:$('#focus'));b&&b.focus()};
ACT.notnow=el=>{const id=el.dataset.arg;setDone(id,'La dejamos para más adelante.');const d=U.fdeck||U.deck;d&&d.items.some(r=>r.id===id)&&d.go(d.idx+1)};
ACT.watch=el=>setDone(el.dataset.arg,'Prompt vigilado.');
ACT.addcomp=el=>{const r=recById(el.dataset.arg);setDone(r.id,`${r.name} añadida a tus competidores.`)};
ACT.ldone=el=>setDone(el.dataset.arg,'Marcada como hecha.');
ACT.inl=el=>{U.inl=el.dataset.arg||null;rerenderLater();const b=U.inl&&$(`.inl .btn.ink`);b&&b.focus()};
ACT.row=el=>{const id=el.dataset.arg;U.row=U.row===id?null:id;U.inl=null;rerenderLater();const b=$(`[data-act="row"][data-arg="${id}"]`);b&&b.focus({preventScroll:true})};
ACT.more=el=>{const k=el.dataset.arg;U.more[k]=!U.more[k];rerenderLater();const b=$(`[data-act="more"][data-arg="${k}"]`);b&&b.focus({preventScroll:true})};
ACT.fsrc=el=>{U.f=el.dataset.arg;U.row=null;rerenderLater()};
ACT.lever=el=>{const k=el.dataset.arg||null;U.lever=U.lever===k?null:k;U.row=null;rerenderLater();const b=$(`.lix[data-arg="${k||''}"]`);b&&b.focus({preventScroll:true})};
document.addEventListener('change',e=>{if(e.target&&e.target.id==='lsel'){U.lever=e.target.value||null;U.row=null;rerenderLater();const s=$('#lsel');s&&s.focus()}});
ACT.clearf=()=>{U.q='';U.f='all';U.lever=null;const q=$('#rq');if(q)q.value='';rerenderLater()};
ACT.ltab=el=>{U.ltab=el.dataset.arg;$$('#ltabs button').forEach(b=>{const on=b.dataset.arg===U.ltab;b.setAttribute('aria-pressed',on);b.setAttribute('aria-selected',on)});segInd($('#ltabs'));rerenderLater()};
ACT.wins=()=>{ACT.ltab({dataset:{arg:'res'}});$('#later').scrollIntoView({block:'start',behavior:RM.matches?'auto':'smooth'})};

/* ---------- focus over any filtered list ---------- */
function focusOn(items,title){if(!items.length)return;
 openFocus(`<div class="fh"><button class="navb" data-act="focusclose" aria-label="Salir del modo foco">${ic('x')}</button><div class="tt"><span>Modo foco</span><b>${title}</b></div><div class="ctl"><button class="navb" data-step="-1" aria-label="Anterior">${ic('chevl')}</button><button class="navb" data-step="1" aria-label="Siguiente">${ic('chevr')}</button></div></div>
  <div class="fb"><div>${progressTicks(items.length,{id:'fptk',labels:false})}<div class="deck" id="fdeck" aria-roledescription="mazo" aria-label="${title}"></div></div></div>`,
  f=>{U.fdeck=makeDeck($('#fdeck',f),items,{card,isDone:id=>!!U.done[id],ptk:$('#fptk',f),nav:$$('.fh [data-step]',f),onSlide:confirmDone,lastLabel:'Terminar'})})}
U.onFocusClose=()=>{U.fdeck=null;if(R.route==='recs'){rerenderLater();U.deck&&U.deck.layout()}};
ACT.focusgrp=el=>{const g=LEVERS.find(x=>x.k===el.dataset.arg);focusOn(filtered({lever:g.k}),g.l)};
ACT.focusall=()=>{const l=filtered();focusOn(l,U.lever?LEVERS.find(x=>x.k===U.lever).l:(U.q||U.f!=='all'?'Más adelante · filtradas':'Más adelante'))};
CMDS.push(['Acciones','Recorrer «Más adelante» en foco','focus',()=>{go('recs');setTimeout(()=>ACT.focusall(),80)}]);

/* «Siguiente» at the bottom right of each plan card; on the last one it leaves the deck */
ACT.dknext=el=>{const inF=!!el.closest('#fdeck'),d=inF?U.fdeck:U.deck;if(!d)return;
 if(d.idx<d.items.length-1){d.go(d.idx+1);return}
 if(inF)closeFocus();else{const l=$('#later');l&&l.scrollIntoView({block:'start',behavior:RM.matches?'auto':'smooth'})}};
