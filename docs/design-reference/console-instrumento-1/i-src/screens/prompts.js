/* ================= SCREEN: Prompts =================
   Tabs Temas (first) / Prompts, per-prompt side sheet (one row per engine,
   sources and answers one at a time) and «Añadir prompts» with its review
   step. Also defines two helpers used by competitors.js and citations.js:
   the side sheet (psh*) and aFav (favicon with monogram fallback).
   Both are candidates for core. */

/* ---------- side sheet (candidate for core) ----------
   Right panel on desktop, bottom sheet on mobile. One at a time. */
const PSH={el:null,scrim:null,back:null,onClose:null};
function pshEnsure(){if(PSH.el)return;const s=document.createElement('div');s.className='psh-scrim';s.addEventListener('click',pshClose);
 const a=document.createElement('aside');a.className='psh';a.setAttribute('role','dialog');a.setAttribute('aria-modal','true');a.hidden=true;
 document.body.append(s,a);PSH.el=a;PSH.scrim=s}
function pshOpen(html,{label='Detalle',after,onClose}={}){pshEnsure();const a=PSH.el;const was=!a.hidden;if(!was)PSH.back=document.activeElement;
 PSH.onClose=onClose||null;a.setAttribute('aria-label',label);a.innerHTML=html;a.hidden=false;PSH.scrim.style.display='block';document.body.classList.add('psh-on');
 requestAnimationFrame(()=>{a.classList.add('on');PSH.scrim.classList.add('on')});
 armMotion(a,!was);$$('.seg',a).forEach(segInd);after&&after(a);
 if(!was)setTimeout(()=>{const f=$('[data-autofocus]',a)||$('.psh-x',a);f&&f.focus()},40)}
/* repaint the open sheet in place, keeping its scroll */
function pshPaint(html,after){if(!PSH.el||PSH.el.hidden)return;const b=$('.psh-b',PSH.el),st=b?b.scrollTop:0;PSH.el.innerHTML=html;armMotion(PSH.el,false);$$('.seg',PSH.el).forEach(segInd);const nb=$('.psh-b',PSH.el);if(nb)nb.scrollTop=st;after&&after(PSH.el)}
function pshClose(){if(!PSH.el||PSH.el.hidden)return;const a=PSH.el;a.classList.remove('on');PSH.scrim.classList.remove('on');document.body.classList.remove('psh-on');
 setTimeout(()=>{a.hidden=true;a.innerHTML='';PSH.scrim.style.display=''},RM.matches?0:320);const f=PSH.onClose;PSH.onClose=null;f&&f();PSH.back&&PSH.back.focus&&PSH.back.focus({preventScroll:true})}
const pshHead=(title,{kicker='',extra=''}={})=>`<div class="psh-h"><div class="psh-top">${kicker}<span style="flex:1"></span>${extra}<button class="navb psh-x" data-act="pshclose" aria-label="Cerrar">${ic('x')}</button></div><h2>${title}</h2></div>`;
ACT.pshclose=()=>pshClose();
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&PSH.el&&!PSH.el.hidden&&$('#cmdk').hidden){e.stopImmediatePropagation();pshClose()}
 if(e.key==='Tab'&&PSH.el&&!PSH.el.hidden){const f=$$('button:not([disabled]),input,textarea,a[href]',PSH.el).filter(x=>x.offsetParent);if(!f.length)return;if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus()}}},true);
document.addEventListener('click',e=>{if(e.target.closest('.psh [data-route]'))pshClose()},true);

/* favicon with a quiet monogram when the brand has no drawn mark */
function aFav(k,cls=''){const f=fav(k,cls);if(f)return f;const s=String(k).replace(/^es\./,'');return `<span class="fav mono-f ${cls}" aria-hidden="true">${s[0].toUpperCase()}</span>`}

/* ---------- state ---------- */
Object.assign(U,{prTab:'temas',prQ:'',prF:'all',prOpen:Object.fromEntries(PR_TOPICS.map((t,i)=>[i,1])),prD:null,ap:null,prAdded:0});
const prAll=()=>PR_TOPICS.flatMap(t=>t.p);
const prById=id=>prAll().find(p=>p.id===id);
const prCount=()=>prAll().length;
const prNamed=()=>prAll().filter(p=>p.m).length;
const sentCls=s=>s==='Positivo'?'tpos':s==='Negativo'||s==='Mixto'?'twarm':'';
function prSyncNav(){const it=NAV[1][1].find(x=>x[0]==='prompts');if(it)it[3]=String(prCount())}

/* engines strip on a prompt row: the ones that named you are lit */
function prEngs(p){return `<span class="pr-e${p.e.length?'':' none'}" aria-label="${p.e.length?'Te nombra '+engNames(p.e):'Ningún motor te nombra'}">${EK.map(k=>`<span class="${p.e.includes(k)?'on':''}">${lg(k,14)}</span>`).join('')}</span>`}
function prRow(p,{topic=false}={}){const q=U.prQ;
 return `<button class="pr-row ${p.m?'yes':'no'}" data-act="prompt" data-arg="${p.id}">
  <span class="pr-st" aria-hidden="true">${p.nw?'<i class="pend"></i>':p.m?ic('check','sm'):'<i></i>'}</span>
  <span class="pr-t"><b>${q&&typeof markHtml==='function'?markHtml(esc(p.t),q):esc(p.t)}</b>
   <span class="pr-m">${topic?`<span>${PR_TOPICS[p.ti].n}</span>`:''}${p.nw?'<span class="pr-new">Se mide en tu próximo escaneo</span>':`<span class="${p.m?'tpos':''}">${p.m?'Te nombra':'No te nombra'}</span><span>${p.nc} ${p.nc===1?'competidor':'competidores'}</span>${p.m&&p.s?`<span>${p.s}</span>`:''}`}</span></span>
  ${p.nw?'<span></span>':prEngs(p)}${ic('chevr','sm')}</button>`}

/* topic = a concept; inside it, the real user questions that belong to it */
function pqRing(v){const r=17,c=2*Math.PI*r;return `<span class="pq-ring" aria-hidden="true"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="${r}" class="bg"/><circle cx="22" cy="22" r="${r}" class="fg ${v<25?'warm':''}" stroke-dasharray="${(c*v/100).toFixed(1)} ${c.toFixed(1)}"/></svg><b class="num">${v}</b></span>`}
function pqQ(p){const q=U.prQ;const cites=p.m&&p.e.some(k=>k!=='claude');
 return `<button class="pq-q ${p.m?'yes':'no'}" data-act="prompt" data-arg="${p.id}">
  <span class="pq-qt"><b>${q?markHtml(esc(p.t),q):esc(p.t)}</b>
   <span class="pq-qm">${p.nw?'<span class="pend">Se mide en tu próximo escaneo</span>':`<span class="st ${p.m?'ok':'ko'}">${p.m?'Te nombra':'No te nombra'}</span>${p.m&&p.s?`<span>${p.s}</span>`:''}<span>${p.nc} ${p.nc===1?'competidor':'competidores'}</span><span>${cites?'cita tu web':'no cita tu web'}</span>`}</span></span>
  ${p.nw?'<span></span>':prEngs(p)}${ic('chevr','sm')}</button>`}
function prTopics(){const q=fold(U.prQ);const list=PR_TOPICS.map((t,ti)=>({...t,ti,ps:t.p.filter(p=>!q||fold(p.t).includes(q)||fold(t.n).includes(q))})).filter(t=>t.ps.length);
 if(!list.length)return `<div class="empty-s">Ningún tema ni prompt con «${esc(U.prQ)}».</div>`;
 return list.map(t=>{const op=!!(U.prOpen[t.ti]||q);const named=t.p.filter(p=>p.m).length;
  return `<section class="pq-tp ${op?'open':''}"><button class="pq-th" data-act="prtopic" data-arg="${t.ti}" aria-expanded="${op}">
   <span class="pq-tn"><span class="pq-tk">Tema</span><b>${t.n}</b><span class="num">${t.p.length} preguntas · te nombran en ${named}</span></span>
   <span class="pq-sc"><b class="num">${t.v}<small>%</small></b>${bar(t.v,{cls:'thin',label:`${t.n}: visibilidad ${t.v}%`})}</span>
   <span class="pq-tr">${t.sent?`<span>${t.sent}</span>`:''}<span class="num">${t.men||0} menciones</span></span>${ic('chevd','sm')}</button>
   ${op?`<div class="pq-tb">${t.ps.map(pqQ).join('')}</div>`:''}</section>`}).join('')}
function prFlat(){const q=fold(U.prQ);let l=prAll().filter(p=>!q||fold(p.t).includes(q));const base=l;
 if(U.prF==='yes')l=l.filter(p=>p.m);else if(U.prF==='no')l=l.filter(p=>!p.m&&!p.nw);
 const c={all:base.length,yes:base.filter(p=>p.m).length,no:base.filter(p=>!p.m&&!p.nw).length};
 return `<div class="fchips pr-fc" role="group" aria-label="Filtro">${[['all','Todos'],['yes','Te nombran'],['no','No te nombran']].map(([k,lb])=>`<button class="fchip" data-act="prf" data-arg="${k}" aria-pressed="${U.prF===k}">${lb}<span class="c num">${c[k]}</span></button>`).join('')}</div>
 <div class="pr-flat">${l.length?l.map(p=>prRow(p,{topic:true})).join(''):`<div class="empty-s">Nada con estos filtros.</div>`}</div>`}
function prBody(){return U.prTab==='temas'?prTopics():prFlat()}
function prRefresh(){const b=$('#pr-body');if(b){b.innerHTML=prBody();armMotion(b,false)}}

SCREENS.prompts={title:'Prompts',render(){prSyncNav();const all=prCount(),pend=prAll().filter(p=>p.nw).length,n=all-pend,y=prNamed();const vis=41;
 return `<div class="sc-prompts">
 <div class="eyebrow bare">Prompts · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span></div>
 <div class="pr-hd"><h1>Prompts</h1><button class="btn ink sm" data-act="addprompts">${ic('plus','sm')}Añadir prompts</button></div>
 <p class="lead">Te nombran en ${y} de ${n} prompts. Fuerte en <a href="#prompts" data-act="prtopicgo" data-arg="2">Autónomos</a>, flojo en <a href="#prompts" data-act="prtopicgo" data-arg="4">Precios</a>.</p>

 <section class="pq-strip" aria-label="Visibilidad del conjunto y por motor">
  <div class="pq-all"><div class="pq-k">Visibilidad del conjunto</div><div class="pq-v num">${roll(vis)}<small>%</small></div>
   <div class="pq-sp"><div class="pr-split" role="img" aria-label="${y} prompts te nombran, ${n-y} no${pend?`, ${pend} por medir`:''}"><i style="flex:${y}"></i><i style="flex:${n-y}"></i>${pend?`<i class="p" style="flex:${pend}"></i>`:''}</div><span class="num">${y} prompts te nombran · ${n-y} no</span></div></div>
  ${EK.map((k,i)=>`<div class="pq-eng"><div class="pq-k">${lg(k,14)}${ENG[k].n}${ENG[k].isNew?'<span class="new">Nuevo</span>':''}</div><div class="pq-ev"><b class="num">${roll(D.engines[k])}<small>%</small></b>${bar(D.engines[k],{cls:'thin',delay:i*70,label:`${ENG[k].n}: te nombra en el ${D.engines[k]}% de sus respuestas`})}</div></div>`).join('')}
 </section>

 <div class="pr-bar">${seg('pr-seg',[['temas','Temas'],['prompts','Prompts']],U.prTab,'prtab')}
  <label class="search">${ic('search','sm')}<input id="pr-q" type="search" placeholder="Busca un prompt o un tema" value="${esc(U.prQ)}" aria-label="Buscar prompt"></label>
  <span class="pr-cap num">${all} de ${PR_CAP} prompts de tu plan</span></div>
 <div id="pr-body" role="tabpanel">${prBody()}</div>
 </div>`},
 after(root){const q=$('#pr-q',root);q.addEventListener('input',()=>{U.prQ=q.value;prRefresh()})}};

ACT.prtab=el=>{U.prTab=el.dataset.arg;$$('#pr-seg button').forEach(b=>{const on=b.dataset.arg===U.prTab;b.setAttribute('aria-pressed',on);b.setAttribute('aria-selected',on)});segInd($('#pr-seg'));prRefresh()};
ACT.prtopic=el=>{const i=+el.dataset.arg;U.prOpen[i]=!U.prOpen[i];prRefresh();const b=$(`[data-act="prtopic"][data-arg="${i}"]`);b&&b.focus({preventScroll:true})};
ACT.prtopicgo=el=>{const i=+el.dataset.arg;U.prOpen[i]=1;if(U.prTab!=='temas')ACT.prtab({dataset:{arg:'temas'}});else prRefresh();const b=$(`[data-act="prtopic"][data-arg="${i}"]`);b&&b.scrollIntoView({block:'start',behavior:RM.matches?'auto':'smooth'})};
ACT.prf=el=>{U.prF=el.dataset.arg;prRefresh()};

/* ---------- prompt detail sheet ---------- */
/* per engine, in this scan: 2 answers each. Named / cites derived from the prompt. */
function prEngStat(p,k){const named=p.e.includes(k)?(k==='gemini'?2:1):0;const cites=named&&k!=='claude'?1:0;return {named,cites,of:2}}
function prAnswer(p,k,a){const named=p.e.includes(k)&&(a===0||k==='gemini');
 return `<p>Para una pyme de unos 10 empleados en España conviene un programa de facturación online que ya cumpla con Verifactu y permita varios usuarios. Las opciones más citadas son:</p><ol><li><b>Cuentix</b>: muy completo, con contabilidad integrada; su precio sube con cada usuario.</li><li>${named?'<mark>Nubaria</mark>: facturación electrónica lista para Verifactu y un precio por usuario contenido. Buena opción si priorizas la sencillez.':'<b>Factulia</b>: interfaz sencilla y plantillas personalizables.'}</li><li><b>Librocloud</b>: orientado a gestorías, con conexión bancaria.</li></ol><p>Antes de elegir, revisa si necesitas control de stock o conexión con tu gestoría.</p>`}
function prSheetHtml(){const d=U.prD,p=prById(d.id);if(!p)return '';const t=PR_TOPICS[p.ti];
 const head=pshHead(esc(p.t),{kicker:`<span class="badge b-line">${t.n}</span>`,extra:U.prDel?`<span class="inl">¿Borrar este prompt?<button class="btn ink" data-act="prdelok">Sí, borrar</button><button class="btn ghost" data-act="prdel" data-arg="0">No</button></span>`:`<button class="btn sm ghost" data-act="prdel" data-arg="1">Borrar prompt</button>`});
 const tabs=`<div class="psh-tabs">${seg('prd-seg',[['res','Resumen'],['ans','Respuestas']],d.tab,'prdtab')}</div>`;
 if(p.nw)return head+`<div class="psh-b"><div class="empty-s" style="text-align:left;padding:8px 0">Lo añadiste hoy. Verás sus respuestas tras tu próximo escaneo.</div></div>`;
 let b='';
 if(d.tab==='res'){const tot=EK.reduce((a,k)=>a+prEngStat(p,k).named,0),cit=EK.reduce((a,k)=>a+prEngStat(p,k).cites,0);
  const rank=[['Cuentix',6],['Nubaria',tot,1],['Factulia',3],['Librocloud',2]].sort((a,b)=>b[1]-a[1]);
  b=`<div class="prd-sig"><div class="${p.m?'ok':''}"><div class="l">Te nombra en</div><div class="v num">${tot}<small> de 8 respuestas</small></div></div><div class="${cit?'ok':''}"><div class="l">Cita tu web en</div><div class="v num">${cit}<small> de 8 respuestas</small></div></div></div>
  <div class="prd-sec"><div class="eyebrow">Por motor</div>${EK.map(k=>{const s=prEngStat(p,k);return `<div class="prd-eng"><div class="h">${lg(k,16)}<b>${ENG[k].n}</b>${ENG[k].isNew?'<span class="new">Nuevo</span>':''}${s.named&&p.s?`<span class="pr-sent ${sentCls(p.s)}">${p.s}</span>`:''}</div>
   <div class="r"><span>Te nombra en <b class="num">${s.named} de ${s.of}</b> respuestas</span>${bar(s.named,{max:s.of,cls:'thin'+(s.named?'':' nomark'),label:`${ENG[k].n}: te nombra en ${s.named} de ${s.of}`})}</div>
   <div class="r"><span>${k==='claude'?'Respondió sin buscar en la web':`Cita tu web en <b class="num">${s.cites} de ${s.of}</b> respuestas`}</span>${k==='claude'?'<i></i>':bar(s.cites,{max:s.of,cls:'thin ink'+(s.cites?'':' nomark')})}</div></div>`}).join('')}</div>
  <div class="prd-sec"><div class="eyebrow">Marcas en estas respuestas</div>${rank.map(([n,v,you],i)=>`<div class="prd-rk ${you?'me':''}"><span class="num pos">${pad(i+1)}</span>${aFav(n)}<b>${n}</b>${you?'<span class="you">Tú</span>':''}<span class="num v">${v}<small> de 8</small></span>${bar(v,{max:8,cls:'thin'+(you?'':' ink nomark')})}</div>`).join('')}</div>
  ${p.m?`<div class="prd-sec"><div class="eyebrow">Lo que dicen de Nubaria</div>${p.e.slice(0,2).map(k=>`<blockquote class="prd-q"><span>${lg(k,13)}${ENG[k].n}</span>«…para una pyme de ese tamaño, <mark>Nubaria</mark> destaca por su facturación electrónica lista para Verifactu y un precio por usuario contenido…»</blockquote>`).join('')}</div>`:''}
  <div class="prd-sec"><div class="eyebrow">Fuentes usadas</div>${PR_SOURCES.filter(s=>!s[2]||p.m).map(([u,es,own])=>`<div class="prd-src">${aFav(u,'xs')}<span class="mono">${u}</span>${own?'<span class="badge b-blue">Tuya</span>':''}<span class="e" aria-label="La citan ${engNames(es)}">${es.map(k=>lg(k,12)).join('')}</span></div>`).join('')}<p class="prd-n">Cada fuente sale una vez, con los motores que la usaron. Claude respondió sin buscar en la web.</p></div>`}
 else{const k=d.eng,s=prEngStat(p,k),named=p.e.includes(k)&&(d.ans===0||k==='gemini');
  b=`<div class="prd-pick">${seg('prd-eng',EK.map(x=>[x,`${lg(x,13)}<span>${ENG[x].n}</span>`]),k,'prdeng')}</div>
  <div class="prd-ans-h"><span class="num">Respuesta ${d.ans+1} de ${s.of}</span><span class="${named?'tpos':''}">${named?'Te nombra':'No te nombra'}</span>${named&&k!=='claude'&&d.ans===0?'<span>Cita tu web</span>':''}<span>${k==='claude'?'Sin fuentes':'3 fuentes'}</span><span style="flex:1"></span><button class="navb" data-act="prdans" data-arg="-1" aria-label="Respuesta anterior" ${d.ans===0?'disabled':''}>${ic('chevl')}</button><button class="navb" data-act="prdans" data-arg="1" aria-label="Respuesta siguiente" ${d.ans===s.of-1?'disabled':''}>${ic('chevr')}</button></div>
  <div class="prd-ans">${prAnswer(p,k,d.ans)}</div>
  ${k==='claude'?'':`<div class="prd-sec"><div class="eyebrow">Fuentes de esta respuesta</div>${PR_SOURCES.slice(0,3).filter(x=>!x[2]||named).map(([u,,own])=>`<div class="prd-src">${aFav(u,'xs')}<span class="mono">${u}</span>${own?'<span class="badge b-blue">Tuya</span>':''}</div>`).join('')}</div>`}`}
 return head+tabs+`<div class="psh-b">${b}</div>`}
function prSheet(first){const h=prSheetHtml();first?pshOpen(h,{label:'Detalle del prompt',onClose:()=>{U.prD=null;U.prDel=0}}):pshPaint(h)}
ACT.prompt=el=>{U.prD={id:el.dataset.arg,tab:'res',eng:'chatgpt',ans:0};U.prDel=0;prSheet(true)};
ACT.prdtab=el=>{U.prD.tab=el.dataset.arg;prSheet();const b=$('.psh-b');if(b)b.scrollTop=0};
ACT.prdeng=el=>{U.prD.eng=el.dataset.arg;U.prD.ans=0;prSheet()};
ACT.prdans=el=>{U.prD.ans=Math.max(0,Math.min(1,U.prD.ans+ +el.dataset.arg));prSheet()};
ACT.prdel=el=>{U.prDel=el.dataset.arg==='1';prSheet()};
ACT.prdelok=()=>{const p=prById(U.prD.id);const t=PR_TOPICS[p.ti];const i=t.p.indexOf(p);t.p.splice(i,1);pshClose();render(false);
 toast('Prompt borrado.','Dejará de incluirse en los próximos escaneos.','checkc',()=>{t.p.splice(i,0,p);render(false)})};

/* ---------- «Añadir prompts» ---------- */
const AP_M=[['auto','sparkles','Generación automática','La IA propone 5 prompts nuevos para tu marca, sin repetir los que ya tienes.'],['kw','search','Basado en keywords','Escribe palabras clave y la IA propone 5 prompts a partir de ellas.'],['man','prompts','Manual','Escribe tus propios prompts. La IA les asigna tema.']];
const apFree=()=>PR_CAP-prCount();
const apSel=()=>U.ap.props.filter(x=>x.on&&!x.gone).length;
function apCap(add){const n=prCount(),w=n/PR_CAP*100,a=Math.min(add,apFree())/PR_CAP*100;
 return `<div class="ap-cap"><div class="l"><span>Tu plan Pro</span><b class="num">${n+add} de ${PR_CAP} prompts</b></div><div class="ap-capb" role="img" aria-label="${n} prompts activos, ${add} por añadir, tope ${PR_CAP}"><i style="width:${w}%"></i><i class="a" style="width:${a}%"></i></div>
  <div class="ap-capl num"><span><i></i>${n} activos</span>${add?`<span><i class="a"></i>${add} por añadir</span>`:''}<span>${Math.max(0,apFree()-add)} libres</span></div>${n+add>=PR_CAP?'<p class="ap-top">Has llegado al tope de tu plan.</p>':''}</div>`}
function apHtml(){const a=U.ap;const sub=['Elige cómo quieres crear los nuevos prompts.','Configura y genera tus nuevos prompts.','Desmarca los que no quieras y edita el texto si hace falta.'][a.step-1];
 const steps=`<div class="ap-steps" aria-label="Paso ${a.step} de 3">${['Método','Configurar','Revisar'].map((l,i)=>`<span class="${i+1<a.step?'done':i+1===a.step?'cur':''}"><i></i>${l}</span>`).join('')}</div>`;
 let b='',f='';
 if(a.step===1){b=`<p class="ap-sub">${sub}</p><div class="ap-ms">${AP_M.map(([k,i,t,d])=>`<button class="ap-m" data-act="apm" data-arg="${k}">${ic(i)}<span><b>${t}</b><span>${d}</span></span>${ic('arrowr','sm')}</button>`).join('')}</div>${apCap(0)}`}
 else if(a.step===2){const m=AP_M.find(x=>x[0]===a.m);
  b=`<button class="btn sm ghost ap-back" data-act="apstep" data-arg="1">${ic('chevl','sm')}${m[2]}</button><p class="ap-sub">${sub}</p>`+
  (a.m==='auto'?`<p class="ap-p">La IA propone 5 prompts nuevos, sin repetir los ${prCount()} que ya tienes, y los pregunta a tus cuatro motores.</p><div class="pills"><span class="chip">${ic('sparkles','sm')}5 prompts nuevos</span><span class="chip">${EK.map(k=>lg(k,12)).join('')}Tus cuatro motores</span></div>`:
   a.m==='kw'?`<label class="ap-lbl" for="ap-kw">Palabras clave</label><div class="ap-in"><input id="ap-kw" class="ap-input" placeholder="p. ej. precios, integraciones" data-autofocus><button class="btn line sm" data-act="apkw">Añadir</button></div><div class="pills">${a.kw.map((k,i)=>`<span class="chip">${esc(k)}<button data-act="apkwdel" data-arg="${i}" aria-label="Quitar ${esc(k)}" class="ap-cx">${ic('x','sm')}</button></span>`).join('')}</div>`:
   `<label class="ap-lbl" for="ap-man">Nuevo prompt</label><textarea id="ap-man" class="ap-input" rows="3" placeholder="Escribe el prompt completo" data-autofocus></textarea><button class="btn line sm" data-act="apmanadd" style="margin-top:10px" ${apFree()-a.man.length<=0?'disabled':''}>${ic('plus','sm')}Añadir a la lista</button>
    ${a.man.length?`<div class="ap-rev" style="margin-top:16px">${a.man.map((t,i)=>`<div class="ap-row on"><span class="ap-t">${esc(t)}</span><button class="navb sm" data-act="apmandel" data-arg="${i}" aria-label="Quitar prompt">${ic('x','sm')}</button></div>`).join('')}</div>`:''}`)+apCap(a.m==='man'?a.man.length:0);
  f=a.m==='man'?`<button class="btn ink" data-act="apaddman" ${a.man.length?'':'disabled'}>Añadir ${a.man.length||''} prompt${a.man.length===1?'':'s'}</button>`:`<button class="btn ink" data-act="apgo" ${a.busy?'disabled':''} ${a.m==='kw'&&!a.kw.length?'disabled':''}>${a.busy?'<span class="shimmer">Generando…</span>':ic('sparkles','sm')+'Generar prompts'}</button>`}
 else{const sel=apSel(),full=sel>=apFree();
  b=`<p class="ap-sub">${sub}</p>${apCap(sel)}${a.busy?`<div class="think" role="status"><span class="dots"><i></i><i></i><i></i></span><span class="shimmer">Generando otros prompts…</span></div>`:`<div class="ap-rev">${a.props.map((x,i)=>x.gone?'':a.edit===i?`<div class="ap-row ed"><input class="ap-input" value="${esc(x.t)}" data-ap="${i}" aria-label="Editar prompt" data-autofocus><button class="btn sm ink" data-act="apsave" data-arg="${i}">Guardar</button></div>`:
   `<div class="ap-row ${x.on?'on':''}"><label class="ap-ck"><input type="checkbox" ${x.on?'checked':''} ${!x.on&&full?'disabled':''} data-act="aptog" data-arg="${i}" aria-label="Añadir «${esc(x.t)}»"><span>${ic('check','sm')}</span></label><span class="ap-t">${esc(x.t)}<small>${x.tp}</small></span><button class="navb sm" data-act="apedit" data-arg="${i}" aria-label="Editar prompt">${ic('notes','sm')}</button><button class="navb sm" data-act="apdel" data-arg="${i}" aria-label="Quitar prompt">${ic('x','sm')}</button></div>`).join('')}</div>`}`;
  f=`<button class="btn ghost" data-act="apregen" ${a.busy?'disabled':''}>${ic('undo','sm')}Volver a generar</button><span style="flex:1"></span><button class="btn line" data-act="apstep" data-arg="2">Volver</button><button class="btn ink" data-act="apadd" ${sel&&!a.busy?'':'disabled'}>Añadir ${sel} prompt${sel===1?'':'s'}</button>`}
 return pshHead('Añadir prompts')+`<div class="psh-tabs">${steps}</div><div class="psh-b">${b}</div>${f?`<div class="psh-f">${f}</div>`:''}`}
function apPaint(first){first?pshOpen(apHtml(),{label:'Añadir prompts',onClose:()=>{U.ap=null}}):pshPaint(apHtml());
 const e=$('[data-ap]',PSH.el);if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}else if(!first){const af=$('[data-autofocus]',PSH.el);af&&af.focus()}}
ACT.addprompts=()=>{if(R.route!=='prompts')go('prompts');U.ap={step:1,m:null,kw:['Verifactu','precios'],man:[],props:[],edit:null,busy:0,gen:0};apPaint(true)};
ACT.apm=el=>{U.ap.m=el.dataset.arg;U.ap.step=2;apPaint()};
ACT.apstep=el=>{U.ap.step=+el.dataset.arg;U.ap.edit=null;apPaint()};
ACT.apkw=()=>{const v=$('#ap-kw').value.trim();if(v)U.ap.kw.push(v);apPaint()};
ACT.apkwdel=el=>{U.ap.kw.splice(+el.dataset.arg,1);apPaint()};
ACT.apmanadd=()=>{const v=$('#ap-man').value.trim();if(v&&apFree()-U.ap.man.length>0)U.ap.man.push(v);apPaint()};
ACT.apmandel=el=>{U.ap.man.splice(+el.dataset.arg,1);apPaint()};
ACT.apgo=()=>{U.ap.busy=1;apPaint();setTimeout(()=>{if(!U.ap)return;U.ap.busy=0;U.ap.step=3;U.ap.edit=null;U.ap.props=PR_PROPS.map(([t,tp],i)=>({t,tp,on:i!==4}));apPaint()},RM.matches?200:900)};
ACT.aptog=el=>{const x=U.ap.props[+el.dataset.arg];x.on=!x.on;apPaint();const n=$(`[data-act="aptog"][data-arg="${el.dataset.arg}"]`,PSH.el);n&&n.focus()};
ACT.apedit=el=>{U.ap.edit=+el.dataset.arg;apPaint()};
ACT.apsave=el=>{const i=+el.dataset.arg;const v=$(`[data-ap="${i}"]`,PSH.el).value.trim();if(v)U.ap.props[i].t=v;U.ap.edit=null;apPaint()};
ACT.apdel=el=>{U.ap.props[+el.dataset.arg].gone=1;if(U.ap.edit===+el.dataset.arg)U.ap.edit=null;apPaint()};
/* keeps the ticked ones, replaces discarded and unticked with fresh proposals */
ACT.apregen=()=>{U.ap.busy=1;apPaint();setTimeout(()=>{if(!U.ap)return;const keep=U.ap.props.filter(x=>x.on&&!x.gone);const used=new Set(U.ap.props.map(x=>x.t));const pool=[...PR_PROPS2,...PR_PROPS].filter(([t])=>!used.has(t));
 const fresh=pool.slice(0,Math.max(0,5-keep.length)).map(([t,tp])=>({t,tp,on:false}));U.ap.props=[...keep,...fresh];U.ap.busy=0;U.ap.edit=null;apPaint()},RM.matches?200:900)};
function apCommit(list){list.forEach(([t,tp])=>{const ti=Math.max(0,PR_TOPICS.findIndex(x=>x.n===tp));const tpc=PR_TOPICS[ti];const p={id:'pn'+(++U.prAdded),t,m:0,s:'',nc:0,e:[],nw:1,ti};tpc.p.push(p);U.prOpen[ti]=1});
 const n=list.length;pshClose();render(false);toast(`${n} prompt${n===1?' añadido':'s añadidos'}.`,'Los mediremos en tu próximo escaneo.','checkc')}
ACT.apadd=()=>apCommit(U.ap.props.filter(x=>x.on&&!x.gone).map(x=>[x.t,x.tp]));
ACT.apaddman=()=>apCommit(U.ap.man.map(t=>[t,'Software de facturación']));
document.addEventListener('keydown',e=>{if(e.key!=='Enter'||!e.target.closest||!e.target.closest('.psh'))return;const t=e.target;
 if(t.dataset.ap){e.preventDefault();ACT.apsave({dataset:{arg:t.dataset.ap}})}else if(t.id==='ap-kw'){e.preventDefault();ACT.apkw()}});
CMDS.push(['Acciones','Añadir prompts','plus',()=>ACT.addprompts()]);
