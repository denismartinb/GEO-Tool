/* ================= SCREEN: Competidores =================
   Ranking (core ranking()), share of voice with every number labelled,
   evolution of the average position per brand, «Competidores sugeridos»
   (Seguir / Siguiendo, Deshacer, «Buscar más»), presence per engine,
   ground per topic and prompt gap. Uses pshOpen / aFav from prompts.js. */
const CP_X={Cuentix:{d:'cuentix.com',sov:31,cite:12,heat:[58,61,29,55]},Nubaria:{d:'nubaria.es',sov:24,cite:9,heat:[38,52,33,44]},Factulia:{d:'factulia.es',sov:21,cite:7,heat:[31,42,36,30]},Librocloud:{d:'librocloud.io',sov:14,cite:4,heat:[22,27,19,26]},Kontaro:{d:'kontaro.es',sov:10,cite:2,heat:[12,20,15,18]}};
const CP_EVO={dates:['23 ago','30 ago','6 sep','13 sep','20 sep','27 sep','4 oct','11 oct'],s:[
 ['Cuentix',[2.0,1.9,1.9,1.8,1.9,1.8,1.7,1.8]],['Nubaria',[3.4,3.3,3.2,3.0,2.9,2.8,2.7,2.6]],['Factulia',[2.8,2.9,3.0,3.0,3.1,3.0,3.2,3.1]],['Librocloud',[3.6,3.7,3.8,3.9,3.8,3.9,4.0,3.9]],['Kontaro',[4.6,4.5,4.5,4.4,4.5,4.4,4.3,4.4]]]};
/* line styles: brand in blue, rivals in ink shades told apart by dash and direct labels */
const CP_STY={Nubaria:['var(--blue)','',2.25],Cuentix:['var(--ink)','',1.5],Factulia:['var(--ink-3)','5 4',1.5],Librocloud:['var(--ink-3)','',1.5],Kontaro:['var(--ink-4)','2 4',1.5]};
const CP_SUG=[['Cobralia','cobralia.es','Nombrada en 6 respuestas'],['Albarano','albarano.com','Nombrada en 4 respuestas'],['Fakturo','fakturo.io','Nombrada en 4 respuestas'],['Tiquetia','tiquetia.es','Nombrada en 3 respuestas'],['Numerax','numerax.com','Nombrada en 2 respuestas']];
const CP_SUG2=[['Contalio','contalio.es','Nombrada en 2 respuestas'],['Pagaflow','pagaflow.com','Nombrada en 1 respuesta'],['Gestiva','gestiva.io','Nombrada en 1 respuesta']];
const CP_GAPS={'Ausente':[['¿Qué software de facturación usan las gestorías?',['Cuentix','Librocloud'],['chatgpt','gemini','claude']],['Cuentix vs Factulia: ¿cuál es mejor?',['Cuentix','Factulia'],['chatgpt','gemini','claude','perplexity']],['Programa de facturación con control de stock para pymes',['Cuentix'],['gemini','perplexity']],['Comparativa de programas de facturación online',['Cuentix','Factulia','Librocloud'],['chatgpt','gemini']]],
 'Por detrás':[['¿Qué app de facturas recomiendas para una pyme de 10 empleados?',['Cuentix'],['chatgpt','claude']],['Alternativas a Cuentix para pymes',['Factulia'],['chatgpt']]],
 'Por delante':[['¿Cuál es el mejor programa de facturación para autónomos en España?',['Cuentix'],['gemini','perplexity']],['¿Qué es Verifactu y qué programa lo cumple?',['Factulia'],['gemini']]],
 'En exclusiva':[['App gratuita para hacer facturas siendo autónomo',[],['gemini']]],
 'Sin nadie':[['¿Hay programas de facturación sin cuota mensual?',[],[]]]};
const CP_GAPD={'Ausente':'Responden con tus rivales y sin ti.','Por detrás':'Sales, pero detrás de un rival.','Por delante':'Sales por delante de tus rivales.','En exclusiva':'Sólo sales tú.','Sin nadie':'No sale ninguna marca.'};
const CP_TERR=[['Autónomos',60,'Cuentix',48],['Facturación electrónica y Verifactu',50,'Factulia',50],['Software de facturación',43,'Cuentix',58],['Comparativas',33,'Cuentix',67],['Precios',20,'Factulia',40]];
Object.assign(U,{cpOff:{},cpFol:{},cpMore:0,cpLoad:0,cpGap:'Ausente',cpAl:['Nubaria Facturación','Nubaria App'],cpAlAsk:null,cpUn:null,cpGone:{}});

const cpComps=()=>D.comps.filter(c=>!U.cpGone[c.n]);
const fmtD=v=>String(v).replace('.',',');

/* ---------- evolution chart: average position, 1º at the top ---------- */
function cpEvoSvg(){const m=MOB.matches,W=m?380:760,H=m?260:300,L=m?26:34,Rr=m?92:112,T=14,B=30,X=i=>L+i*(W-L-Rr)/7,Y=v=>T+(v-1)/(5-1)*(H-T-B);
 let g=[1,2,3,4,5].map(v=>`<line x1="${L}" x2="${W-Rr+8}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--rule-2)"/><text class="ax" x="${L-10}" y="${Y(v)+3.5}" text-anchor="end">${v}º</text>`).join('');
 g+=CP_EVO.dates.map((d,i)=>`<line x1="${X(i)}" x2="${X(i)}" y1="${H-B}" y2="${H-B+5}" stroke="var(--ink-4)"/>${m&&i%2?'':`<text class="ax" x="${X(i)}" y="${H-8}" text-anchor="middle">${d}</text>`}`).join('')+`<line x1="${L}" x2="${W-Rr+8}" y1="${H-B}" y2="${H-B}" stroke="var(--ink-4)"/>`;
 const on=CP_EVO.s.filter(([n])=>!U.cpOff[n]);
 /* end labels, nudged apart so they never collide */
 const lab=on.map(([n,v])=>({n,v:v.at(-1),y:Y(v.at(-1))})).sort((a,b)=>a.y-b.y);for(let i=1;i<lab.length;i++)if(lab[i].y-lab[i-1].y<16)lab[i].y=lab[i-1].y+16;
 on.slice().sort((a,b)=>(a[0]==='Nubaria')-(b[0]==='Nubaria')).forEach(([n,v])=>{const [c,da,w]=CP_STY[n];const pts=v.map((y,i)=>`${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');const me=n==='Nubaria';
  g+=`<polyline class="cp-ln" points="${pts}" fill="none" stroke="${c}" stroke-width="${w}" ${da?`stroke-dasharray="${da}"`:''} stroke-linejoin="round" stroke-linecap="round"/>`;
  g+=me?v.map((y,i)=>`<circle cx="${X(i)}" cy="${Y(y)}" r="${i===7?4:2.5}" fill="${i===7?c:'var(--surface)'}" stroke="${c}" stroke-width="1.5"/>`).join(''):`<circle cx="${X(7)}" cy="${Y(v.at(-1))}" r="2.5" fill="${c}"/>`});
 lab.forEach(l=>{const me=l.n==='Nubaria';g+=`<text class="cp-el ${me?'me':''}" x="${X(7)+12}" y="${l.y+4}">${l.n} <tspan class="v">${fmtD(l.v)}º</tspan></text>`});
 const sum=on.map(([n,v])=>`${n} del ${fmtD(v[0])}º al ${fmtD(v.at(-1))}º`).join('; ');
 return `<svg class="cp-evo" viewBox="0 0 ${W} ${H}" role="img" aria-label="Puesto medio en los últimos 8 escaneos: ${sum}">${g}</svg>`}

/* ---------- suggested competitors ---------- */
function cpSugHtml(){const list=U.cpMore?CP_SUG.concat(CP_SUG2):CP_SUG;
 return `<div class="cp-sug-l">${list.map(([n,d,why],i)=>{const on=!!U.cpFol[d];return `<div class="cp-sr ${i>=CP_SUG.length?'rise':''}" style="--k:${i-CP_SUG.length}">${aFav(n)}<span class="t"><b>${n}</b><span><span class="mono">${d}</span> · ${why}</span></span><button class="cp-fb ${on?'on':''}" data-act="cpfol" data-arg="${d}" aria-pressed="${on}" aria-label="${on?'Siguiendo a':'Seguir a'} ${n}">${on?ic('check','sm')+'Siguiendo':ic('plus','sm')+'Seguir'}</button></div>`}).join('')}
  ${U.cpLoad?`<div class="cp-sr cp-load" role="status"><span class="dots"><i></i><i></i><i></i></span><span class="shimmer">Buscando marcas parecidas…</span></div>`:''}</div>
  <div class="cp-sf">${U.cpMore?'<span>No hay más sugerencias por ahora.</span>':`<button class="btn sm line" data-act="cpmore" ${U.cpLoad?'disabled':''}>${ic('search','sm')}Buscar más</button>`}<span class="cp-sn num">${Object.keys(U.cpFol).length?`Sigues ${cpComps().length-1+Object.keys(U.cpFol).length} competidores`:''}</span></div>`}
function cpSugPaint(){const b=$('#cp-sug');if(b)b.innerHTML=cpSugHtml()}

/* ---------- one ranking: mentions and citations side by side (Denis 2026-10-26) ---------- */
function cxRank(cs){const mx=Math.max(...cs.map(c=>c.m)),cx=Math.max(...cs.map(c=>CP_X[c.n].cite));
 return `<div class="cx-h" aria-hidden="true"><span>#</span><span>Marca</span><span>Menciones</span><span>Citas</span><span>Puesto medio</span></div><ol class="cx-l">${cs.map((c,i)=>{const x=CP_X[c.n];return `<li class="cx-r ${c.you?'me':''}">
  <span class="pos num">${pad(i+1)}</span><span class="who">${aFav(c.n)}<span><b>${c.n}</b>${c.you?'<span class="you">Tú</span>':''}<span class="mono">${x.d}</span></span></span>
  <span class="mt"><i>Menciones</i><b class="num">${c.m}<small>%</small></b>${bar(c.m,{max:mx*1.08,cls:'thin '+(c.you?'':'ink nomark'),delay:i*60})}</span>
  <span class="mt"><i>Citas</i><b class="num">${x.cite}<small>%</small></b>${bar(x.cite,{max:cx*1.08,cls:'thin nomark '+(c.you?'':'ink'),delay:i*60+40})}</span>
  <span class="avg num"><i>Puesto medio</i>${fmtD(c.rank)}º</span></li>`}).join('')}</ol>`}
/* presence per engine as a heat map: the darker, the more present */
function cxHeat(cs){return `<div class="cx-hm" role="table" aria-label="Porcentaje de respuestas de cada motor que nombran a cada marca"><div class="cx-hr h" role="row"><span role="columnheader"></span>${EK.map(k=>`<span role="columnheader">${lg(k,14)}<em>${ENG[k].n}</em></span>`).join('')}</div>
 ${cs.map(c=>`<div class="cx-hr ${c.you?'me':''}" role="row"><span role="cell" class="n">${aFav(c.n,'xs')}<span>${c.n}</span></span>${CP_X[c.n].heat.map((v,i)=>{const t=Math.round(8+v/65*72);return `<span role="cell" class="cx-c ${t>46?'on-dk':''}" style="--t:${t}%" aria-label="${ENG[EK[i]].n}: ${v}%"><b class="num">${v}</b></span>`}).join('')}</div>`).join('')}
 <div class="cx-scale" aria-hidden="true"><span>0%</span><i></i><span>65%</span></div></div>`}

/* ---------- share of voice: every number carries its label ---------- */
function cpSov(){const cs=cpComps();const tot=cs.reduce((a,c)=>a+CP_X[c.n].sov,0);
 const seg=cs.map((c,i)=>{const x=CP_X[c.n];const w=x.sov/tot*100;return `<div class="cp-sg ${c.you?'me':''}" style="flex:${x.sov}"><i style="--bd:${i*80}ms"></i><span class="cp-sgl"><b class="num">${x.sov}%</b><span>${c.n}</span></span></div>`}).join('');
 return `<div class="cp-stack" role="img" aria-label="Cuota de voz: ${cs.map(c=>c.n+' '+CP_X[c.n].sov+'%').join(', ')}">${seg}</div>
 <div class="cp-sovt"><div class="cp-sh" aria-hidden="true"><span>Marca</span><span>Mención</span><span>Citas</span><span>Cuota de voz</span><span>vs. escaneo anterior</span></div>
 ${cs.map(c=>{const x=CP_X[c.n];return `<div class="cp-sr2 ${c.you?'me':''}"><span class="who">${aFav(c.n)}<span><b>${c.n}</b>${c.you?'<span class="you">Tú</span>':''}<span class="mono">${x.d}</span></span></span>
  <span class="st"><i>Mención</i><b class="num">${c.m}<small>%</small></b></span><span class="st"><i>Citas</i><b class="num">${x.cite}<small>%</small></b></span><span class="st k"><i>Cuota de voz</i><b class="num">${x.sov}<small>%</small></b></span>
  <span class="st d"><i>vs. anterior</i><b class="num ${c.dt>0?'up':c.dt<0?'down':''}">${c.dt>0?'+'+c.dt+' pt':c.dt<0?'−'+(-c.dt)+' pt':'Igual'}</b></span></div>`}).join('')}</div>
 <p class="cp-note">Mención: respuestas que nombran la marca. Citas: respuestas que citan su web. Cuota de voz: su parte de todas las menciones de estas cinco marcas.</p>`}

SCREENS.competitors={title:'Competidores',render(){const cs=cpComps();
 return `<div class="sc-comp">
 <div class="eyebrow bare">Competidores · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span><span class="badge b-line" style="letter-spacing:0;text-transform:none">${cs.length-1} competidores</span></div>
 <div class="pr-hd"><h1>Competidores</h1><button class="btn line sm hd-d" data-act="cpmanage">${ic('users','sm')}Gestionar competidores</button></div>
 <p class="lead"><b>Cuentix</b> es tu rival más fuerte: la nombran en el 54% de las respuestas y a ti en el 41%. Le ganas en <b>Claude</b>.</p>
 <div class="pills hd-m"><button class="btn line sm" data-act="cpmanage">${ic('users','sm')}Gestionar competidores</button></div>

 <section class="sec"><div class="card cx-rank"><div class="card-h"><h3>Ranking</h3><span class="see num" style="cursor:default">Ordenado por menciones</span></div>
  <div class="card-b">${cxRank(cs)}
   <p class="cp-note">Menciones: respuestas que nombran la marca. Citas: respuestas que enlazan su web como fuente.</p>
   <p class="cp-al">${ic('shield','sm')}<span>También cuenta como Nubaria: ${U.cpAl.length?U.cpAl.map(a=>`<b>${esc(a)}</b>`).join(', '):'ningún alias'}.</span><button class="btn sm ghost" data-act="cpalias">Gestionar alias</button></p></div></div></section>

 <section class="sec"><div class="eyebrow">Evolución del puesto medio</div>
  <div class="card"><div class="card-b">
   <div class="cp-tg" role="group" aria-label="Marcas en el gráfico">${CP_EVO.s.map(([n])=>`<button class="fchip" data-act="cpevo" data-arg="${n}" aria-pressed="${!U.cpOff[n]}"><i class="cp-sw" style="border-top:2px ${CP_STY[n][1]?'dashed':'solid'} ${CP_STY[n][0]}"></i>${n}</button>`).join('')}</div>
   <div class="cp-evw" id="cp-evo">${cpEvoSvg()}</div>
   <p class="cp-note">Puesto medio en el que la IA nombra a cada marca cuando la nombra. Más arriba es mejor. Últimos 8 escaneos.</p></div></div></section>

 <section class="sec grid2 cx-two">
  <div class="card"><div class="card-h"><h3>Presencia por motor</h3></div><div class="card-b">${cxHeat(cs)}
   <p class="cp-note">Porcentaje de respuestas de cada motor que nombran a la marca. Cuanto más oscura la celda, más presencia.</p></div></div>
  <div class="card"><div class="card-h"><h3>Terreno por tema</h3></div><div class="card-b cp-terr">
   ${CP_TERR.map(([t,a,r,b],i)=>`<div class="cp-tr"><div class="h"><b>${t}</b><span class="cx-lead ${a>b?'pos':a<b?'warm':''}">${a>b?'Lideras tú':a<b?'Lidera '+r:'Empate'}</span></div>
    <div class="l"><span>Tú</span>${bar(a,{cls:'thin',delay:i*60})}<b class="num">${a}%</b></div><div class="l"><span>${r}</span>${bar(b,{cls:'thin ink nomark',delay:i*60})}<b class="num o">${b}%</b></div></div>`).join('')}
   <p class="cp-note">Porcentaje de respuestas del tema que nombran a cada marca, frente al rival que más sale en él.</p></div></div>
 </section>

 <section class="sec"><div class="eyebrow">Brecha de prompts</div>
  <div class="fchips cp-gh" id="cp-gseg" role="group" aria-label="Brecha">${Object.keys(CP_GAPS).map(k=>`<button class="fchip" data-act="cpgap" data-arg="${k}" aria-pressed="${U.cpGap===k}">${k}<span class="c num">${CP_GAPS[k].length}</span></button>`).join('')}</div>
  <div id="cp-gap">${cpGapHtml()}</div></section>

 <section class="sec"><div class="card cp-sug cx-sug"><div class="card-h"><h3>Competidores sugeridos</h3></div>
  <div class="card-b"><p class="cp-sp">Marcas que la IA nombra junto a ti y que no sigues. Revísalas antes de seguirlas.</p><div id="cp-sug">${cpSugHtml()}</div></div></div></section>
 </div>`},
 after(root,first){return;const st=null;if(!first||RM.matches){$$('.cp-sg>i',st).forEach(i=>i.style.transition='none');st.classList.add('on');requestAnimationFrame(()=>$$('.cp-sg>i',st).forEach(i=>i.style.transition=''))}else requestAnimationFrame(()=>requestAnimationFrame(()=>st.classList.add('on')))}};

function cpGapHtml(){return `<p class="cp-gd">${CP_GAPD[U.cpGap]}</p>${CP_GAPS[U.cpGap].map(([p,cs,es])=>`<button class="cp-gr" data-act="cpgapp" data-arg="${esc(p)}"><span class="pt">${p}</span><span class="cs">${cs.length?cs.map(x=>`<span class="cp-cb">${aFav(x,'xs')}${x}</span>`).join(''):'<span class="o">Ninguna marca de tu lista</span>'}</span><span class="e" aria-label="${es.length?'Motores: '+engNames(es):'Ningún motor'}">${es.map(k=>lg(k,13)).join('')}</span>${ic('chevr','sm')}</button>`).join('')}`}

ACT.cpfol=el=>{const d=el.dataset.arg;const s=[...CP_SUG,...CP_SUG2].find(x=>x[1]===d);if(U.cpFol[d]){delete U.cpFol[d];cpSugPaint();return}
 U.cpFol[d]=1;cpSugPaint();toast(`Sigues a ${s[0]}.`,'La mediremos en tu próximo escaneo.','users',()=>{delete U.cpFol[d];cpSugPaint()});const b=$(`[data-act="cpfol"][data-arg="${d}"]`);b&&b.focus()};
ACT.cpmore=()=>{U.cpLoad=1;cpSugPaint();setTimeout(()=>{U.cpLoad=0;U.cpMore=1;cpSugPaint()},RM.matches?200:1100)};
ACT.cpevo=el=>{const n=el.dataset.arg;const left=CP_EVO.s.filter(([x])=>!U.cpOff[x]).length;if(!U.cpOff[n]&&left<=1)return;U.cpOff[n]=!U.cpOff[n];el.setAttribute('aria-pressed',!U.cpOff[n]);$('#cp-evo').innerHTML=cpEvoSvg()};
ACT.cpgap=el=>{U.cpGap=el.dataset.arg;$$('#cp-gseg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.arg===U.cpGap));$('#cp-gap').innerHTML=cpGapHtml()};
ACT.cpgapp=el=>{const t=el.dataset.arg.replace(/&amp;/g,'&');const p=prAll().find(x=>x.t===t);go('prompts');if(p)setTimeout(()=>ACT.prompt({dataset:{arg:p.id}}),60)};

/* ---------- manage competitors and aliases (side sheet) ---------- */
function cpManageHtml(){const cs=cpComps().filter(c=>!c.you);
 return pshHead('Gestionar competidores')+`<div class="psh-b"><p class="ap-sub">Añade, edita o deja de seguir competidores. Los cambios se miden en tu próximo escaneo.</p>
  <label class="ap-lbl" for="cp-nn">Añadir competidor</label><div class="ap-in cp-add"><input id="cp-nn" class="ap-input" placeholder="Nombre" data-autofocus><input id="cp-nd" class="ap-input" placeholder="Dominio"><button class="btn ink sm" data-act="cpadd">Añadir</button></div>
  <div class="ap-rev">${cs.map(c=>`<div class="cp-mr">${aFav(c.n)}<span class="t"><b>${c.n}</b><span class="mono">${CP_X[c.n].d}</span></span>${U.cpUn===c.n?`<span class="inl">¿Dejar de seguirla?<button class="btn ink" data-act="cpunok" data-arg="${c.n}">Sí</button><button class="btn ghost" data-act="cpun" data-arg="">No</button></span>`:`<button class="btn sm ghost" data-act="cpun" data-arg="${c.n}">Dejar de seguir</button>`}</div>`).join('')}</div>
  <div class="eyebrow" style="margin-top:30px">Alias de Nubaria</div>
  <p class="ap-sub" style="margin-top:8px">Si la IA nombra un producto tuyo sin nombrar a la empresa, esa respuesta sólo cuenta si añades ese nombre como alias.</p>
  <div class="ap-in" style="margin-top:12px"><input id="cp-al" class="ap-input" placeholder="p. ej. el nombre de un producto de Nubaria"><button class="btn line sm" data-act="cpaladd">Añadir</button></div>
  <div class="ap-rev">${U.cpAl.map((a,i)=>`<div class="cp-mr"><span class="t"><b>${esc(a)}</b></span>${U.cpAlAsk===i?`<span class="inl">¿Quitarlo?<button class="btn ink" data-act="cpaldel" data-arg="${i}">Sí</button><button class="btn ghost" data-act="cpalask" data-arg="-1">No</button></span>`:`<button class="navb sm" data-act="cpalask" data-arg="${i}" aria-label="Quitar ${esc(a)}">${ic('x','sm')}</button>`}</div>`).join('')||'<p class="ap-sub" style="padding:12px 0">Todavía no hay ningún alias. Sólo cuenta una respuesta que nombre literalmente Nubaria.</p>'}</div></div>`}
function cpManage(first,focusSel){first?pshOpen(cpManageHtml(),{label:'Gestionar competidores',onClose:()=>{U.cpUn=null;U.cpAlAsk=null;if(R.route==='competitors')render(false)}}):pshPaint(cpManageHtml());if(focusSel){const f=$(focusSel,PSH.el);f&&f.focus()}}
ACT.cpmanage=()=>{if(R.route!=='competitors')go('competitors');cpManage(true)};
ACT.cpalias=()=>{cpManage(true);setTimeout(()=>{const a=$('#cp-al',PSH.el);a&&(a.scrollIntoView({block:'center'}),a.focus())},80)};
ACT.cpun=el=>{U.cpUn=el.dataset.arg||null;cpManage(false,U.cpUn?`[data-act="cpunok"]`:null)};
ACT.cpunok=el=>{const n=el.dataset.arg;U.cpGone[n]=1;U.cpUn=null;cpManage(false);toast(`Has dejado de seguir a ${n}.`,'','checkc',()=>{delete U.cpGone[n];if(PSH.el&&!PSH.el.hidden)cpManage(false);if(R.route==='competitors')render(false)})};
ACT.cpadd=()=>{const n=$('#cp-nn').value.trim();if(!n){$('#cp-nn').focus();return}cpManage(false);toast(`${esc(n)} añadida a tus competidores.`,'La mediremos en tu próximo escaneo.','users')};
ACT.cpaladd=()=>{const v=$('#cp-al').value.trim();if(v){U.cpAl.push(v);toast('Alias añadido.',esc(v),'checkc')}cpManage(false,'#cp-al')};
ACT.cpalask=el=>{const i=+el.dataset.arg;U.cpAlAsk=i<0?null:i;cpManage(false)};
ACT.cpaldel=el=>{U.cpAl.splice(+el.dataset.arg,1);U.cpAlAsk=null;cpManage(false)};
CMDS.push(['Acciones','Buscar más competidores sugeridos','users',()=>{go('competitors');setTimeout(()=>{ACT.cpmore();const c=$('.cp-sug');c&&c.scrollIntoView({block:'center'})},80)}],['Acciones','Gestionar competidores','users',()=>ACT.cpmanage()]);
