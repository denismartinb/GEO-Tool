/* ================= SCREEN: Auditoría agéntica =================
   What an agent sees on the page where you sell. Checks per component, each
   with its fix (and code when there is some to paste). The ring card is hidden
   on mobile (Denis). «Elegir otra página» re-runs the check: 5 a day. */
const AA_TONE={ok:'Bien',warn:'Mejorable',bad:'Falla'};
function aaRow(k,[tn,t,fix,file,code],j){const id=k+':'+j,op=U.aa.open===id&&tn!=='ok';
 if(tn==='ok')return `<div class="aa-row ok"><span class="h"><span class="sd ok"></span><span class="l">${t}</span><span class="okl">${ic('checkc','sm')}Bien</span></span></div>`;
 return `<div class="aa-row ${op?'open':''}"><button class="h" data-act="aaRow" data-arg="${id}" aria-expanded="${op}"><span class="sd ${tn}"></span><span class="l">${t}<small>${AA_TONE[tn]}</small></span>${code?'<span class="badge b-blue">Con código</span>':'<span></span>'}${ic('chevd','sm')}</button>
 ${op?`<div class="b"><div class="lbl">Cómo arreglarlo</div><p>${bEsc(fix)}</p>${code?bCode(file,code)+'<p class="hint">Sustituye «el texto entre comillas» por tu texto antes de publicarlo.</p>':''}</div>`:''}</div>`}
function aaGroups(){const f=U.aa.f;if(f==='interop')return aaInterop(true);
 return (f==='all'?AGX.comps:AGX.comps.filter(x=>x.k===f)).map((x,i)=>`<div class="card aa-grp"><div class="card-h"><h3>${x.n}</h3><span class="sc num"><b>${x.p}</b>/${x.w}</span></div><div class="card-b">${bar(x.p,{max:x.w,cls:'thin '+(x.p/x.w<.5?'warm':''),delay:i*60,label:`${x.n}: ${x.p} de ${x.w}`})}<p class="pp">${x.purpose}</p>${AGX_CHK[x.k].map((c,j)=>aaRow(x.k,c,j)).join('')}</div></div>`).join('')}
function aaInterop(main){return `<div class="card aa-io"><div class="card-h"><h3>Protocolos publicados</h3><span class="sc num"><b>${AGX.interop.found}</b> de ${AGX.interop.total}</span></div><div class="card-b">${main?'<p class="pp">Vías para que un agente se conecte directo a tu tienda, sin tener que leer tu web. Va fuera de la nota de Visibilidad agéntica.</p>':''}${AGX.interop.items.map(([n,ok])=>`<div class="li"><span>${n}</span>${ok?`<span class="okl">${ic('checkc','sm')}Publicado</span>`:`<span class="no">${ic('minus','sm')}No publicado</span>`}</div>`).join('')}</div></div>`}

SCREENS.agaudit={title:'Auditoría agéntica',render(){const st=U.aa.st,f=U.aa.f;
 const head=`<div class="eyebrow bare">Comercio agéntico · <span class="mono" style="letter-spacing:0;text-transform:none">nubaria.es</span></div><h1 style="margin-top:14px">Auditoría agéntica</h1><p class="lead">Lo que ve un agente cuando entra en tu web para comprar.${st==='ok'?' Lo primero: <a href="#agaudit" data-act="aaGo" data-arg="trust:0">no vemos tu política de cancelación o reembolso</a>.':''}</p>`;
 const proto=bProto('aaState',[['ok','Revisada'],['searching','Buscando'],['starter','Plan Starter']],st);
 if(st==='starter')return `<div class="sc-aa">${head}${agxUpsell('La auditoría agéntica')}${proto}</div>`;
 if(st==='searching')return `<div class="sc-aa">${head}<div class="card aa-search" role="status">${bAmbient(ic('cart'))}<p><b>Buscando qué vendes en tu web</b></p><p class="s">Tarda unos segundos. Al terminar, la pantalla se rellena sola.</p></div>${proto}</div>`;
 const chips=[['all','Todas',''],...AGX.comps.map(x=>[x.k,x.n,`${x.p}/${x.w}`]),['interop','Interoperabilidad',`${AGX.interop.found} de ${AGX.interop.total}`]];
 return `<div class="sc-aa">${head}
 <section class="aa-top">
  <div class="card aa-page"><div class="card-b"><div class="k">Página revisada</div>
   <div class="pr">${fav('nubaria','lg')}<div class="t"><b>Nubaria · página de precios</b><span class="mono">nubaria.es/precios</span></div><span class="badge b-line">${AGX.kind}</span><button class="btn sm line" data-act="aaPick" aria-expanded="${U.aa.pick}">Elegir otra página</button></div>
   ${U.aa.pick?`<div class="pick"><label for="aa-u">Dirección de una página donde vendas algo</label><div class="row"><input id="aa-u" class="mono" value="https://nubaria.es/precios"><button class="btn sm ink" data-act="aaPickOk" ${U.aa.left?'':'disabled'}>Revisar esta página</button><button class="btn sm ghost" data-act="aaPick">Cancelar</button></div><p>${U.aa.left?`Te quedan ${U.aa.left} cambios hoy.`:'Has usado las revisiones de hoy. Mañana tendrás otras 5.'}</p></div>`:''}
   <p class="nt">Elegida automáticamente de tu web. Stock, identificadores y envío no aplican a un software, así que no cuentan.</p></div></div>
  <a class="card aa-mini" href="#agents" data-route="agents"><span><span class="k">Visibilidad agéntica</span><span class="v num"><b>${roll(AGX.score)}</b><small>de 100</small></span><span class="agh-sc" role="img" aria-label="${AGX.score} de 100; ${AGX.to} si arreglas 2 cosas"><i class="f" style="width:${AGX.score}%"></i><i class="g" style="left:${AGX.score}%;width:${AGX.to-AGX.score}%"></i><span class="mk" style="left:${AGX.score}%"></span></span><span class="s">Si arreglas 2 cosas, subes a <b class="num">${AGX.to}</b>.</span></span>${ic('chevr','sm')}</a>
 </section>
 <div class="fchips aa-chips bsc" role="group" aria-label="Filtrar por componente">${chips.map(([k,l,v])=>`<button class="fchip" data-act="aaF" data-arg="${k}" aria-pressed="${f===k}">${l}${v?`<span class="c num">${v}</span>`:''}</button>`).join('')}</div>
 <div class="aa-grid"><div class="stk">${aaGroups()}</div>
  <div class="stk">
   <div class="card aa-side"><div class="card-h"><h3>Asistentes según tu robots.txt</h3></div><div class="card-b">${EK.map(k=>`<div class="li ${k==='perplexity'?'no':''}"><span class="e">${lg(k,14)}${ENG[k].n}</span>${k==='perplexity'?`<span class="ko">${ic('x','sm')}Bloqueado</span>`:`<span class="okl">${ic('checkc','sm')}Permitido</span>`}</div>`).join('')}</div></div>
   <div class="card aa-side"><div class="card-h"><h3>Visitas automáticas</h3></div><div class="card-b"><div class="li"><span>Protección anti-bots</span><span class="okl">${ic('checkc','sm')}Sin reto</span></div></div></div>
   ${f==='interop'?'':aaInterop(false)}
  </div></div>
 ${proto}</div>`},
 after(root,first){bLight(root,first);bAmbObserve(root)}};

function aaSearch(){U.aa.st='searching';bRe();clearTimeout(U.aa._t);U.aa._t=setTimeout(()=>{if(U.aa.st!=='searching')return;U.aa.st='ok';if(R.route==='agaudit')bRe();toast('Página revisada.','Ya ves lo que ve un agente.','checkc')},2400)}
ACT.aaState=el=>{const s=el.dataset.arg;if(s==='searching')return aaSearch();U.aa.st=s;bRe()};
ACT.aaF=el=>{U.aa.f=el.dataset.arg;bRe()};
ACT.aaRow=el=>{const id=el.dataset.arg;U.aa.open=U.aa.open===id?null:id;bRe()};
ACT.aaGo=el=>{U.aa.f='all';U.aa.open=el.dataset.arg;bRe();setTimeout(()=>{const sc=$('#sc'),e=$('.aa-row.open');if(sc&&e)sc.scrollTo({top:e.getBoundingClientRect().top-sc.getBoundingClientRect().top+sc.scrollTop-100,behavior:RM.matches?'auto':'smooth'})},40)};
ACT.aaPick=()=>{U.aa.pick=!U.aa.pick;bRe();if(U.aa.pick)setTimeout(()=>{const i=$('#aa-u');i&&i.focus()},30)};
ACT.aaPickOk=()=>{U.aa.left=Math.max(0,U.aa.left-1);U.aa.pick=false;aaSearch()};
