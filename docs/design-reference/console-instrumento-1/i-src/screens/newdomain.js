/* ================= SCREEN: Nuevo dominio (builder C) =================
   Domain → competitors suggested by the system → prompts suggested by the
   system → launch. Engines are the plan's real ones: 4 on Pro (Perplexity
   with «Nuevo»), 3 on Starter. Full screen, own top bar. */
const WZ_COMPS=[['Cuentix','cuentix.com'],['Factulia','factulia.es'],['Librocloud','librocloud.io'],['Kontaro','kontaro.es']];
const WZ_MORE=[['Cobralia','cobralia.es','#0f766e'],['Albarano','albarano.com','#9333ea'],['Fakturo','fakturo.io','#b45309']];
const WZ_TOPICS=[
 ['Software de facturación',['¿Qué app de facturas recomiendas para una pyme de 10 empleados?','¿Cuál es el software de facturación más fácil de usar?','Programa de facturación con control de stock para pymes','¿Qué software de facturación usan las gestorías?']],
 ['Facturación electrónica y Verifactu',['¿Qué software de facturación cumple con Verifactu?','¿Cómo emitir facturas electrónicas obligatorias en 2026?','¿Qué es Verifactu y qué programa lo cumple?','Software de factura electrónica para pymes homologado']],
 ['Autónomos',['¿Cuál es el mejor programa de facturación para autónomos en España?','App gratuita para hacer facturas siendo autónomo','¿Cómo llevar la contabilidad de un autónomo con una app?']],
 ['Comparativas',['Alternativas a Cuentix para pymes','Cuentix vs Factulia: ¿cuál es mejor?','Comparativa de programas de facturación online']],
 ['Precios',['¿Cuánto cuesta un programa de facturación online?','Software de facturación barato para pymes','¿Hay programas de facturación sin cuota mensual?']]];
const WZ_STEPS=['Dominio','Competidores','Prompts','Lanzar'];
const wzEngs=()=>U.cPlan==='starter'?['chatgpt','gemini','claude']:EK;
function wzState(){if(!U.cWz||!U.cWz.comps){const p={};WZ_TOPICS.forEach(([,ps],t)=>ps.forEach((_,i)=>p[t+':'+i]=true));U.cWz=Object.assign({step:1,dom:'nubaria.es',country:'España',comps:WZ_COMPS.map(c=>({n:c[0],d:c[1],sug:1})),more:WZ_MORE.slice(),prompts:p,extra:[]},U.cWz||{})}return U.cWz}
const wzCount=w=>Object.values(w.prompts).filter(Boolean).length+w.extra.length;
const wzEngRow=()=>`<div class="wz-engs">${wzEngs().map(k=>`<span class="wz-eng">${lg(k,15)}${ENG[k].n}${k==='perplexity'?'<span class="new">Nuevo</span>':''}</span>`).join('')}${U.cPlan==='starter'?`<span class="wz-lock">${ic('c-lock','sm')}Perplexity, en Pro y Agencia</span>`:''}</div>`;

const wzLoad=(items,L)=>`<ol class="wz-load" aria-live="polite">${items.map((t,i)=>{const d=i<L-1,on=i===L-1;return `<li class="${d?'done':on?'on':''}">${d?ic('checkc'):on?'<span class="wz-sp" aria-hidden="true"></span>':ic('c-dot')}<span class="${on?'shimmer':''}">${t}</span></li>`}).join('')}</ol>`;
function wzMain(w){const s=w.step;
 if(w.loading)return `<div class="eyebrow bare">Paso 1 de 4</div><h1>Leyendo <span class="mono wz-dm">${w.dom}</span></h1><p class="lead">Unos 15 segundos. Te proponemos rivales y prompts con lo que encontremos.</p>
  ${wzLoad(['Leyendo el contenido de tu web','Buscando competidores relevantes','Proponiendo prompts de monitorización'],w.loading)}`;
 if(s===1)return `<div class="eyebrow bare">Paso 1 de 4</div><h1>${w.first?'Añade tu primer dominio':'Añade un dominio'}</h1><p class="lead">Te proponemos rivales y prompts, y lanzamos el primer escaneo.</p>
  <div class="wz-f1"><label class="wz-fld wz-grow"><span>Dominio</span><input id="wz-dom" class="wz-in mono" value="${w.dom}" placeholder="miempresa.com" autocomplete="off" spellcheck="false"><em id="wz-derr">Escribe solo el dominio, sin https:// ni rutas.</em></label>
  <label class="wz-fld"><span>País de análisis</span><select id="wz-cty" class="wz-in">${['España','México','Argentina','Colombia','Chile','Portugal'].map(c=>`<option ${c===w.country?'selected':''}>${c}</option>`).join('')}</select><em>El mercado que quieres analizar.</em></label></div>
  <div class="wz-sub"><div class="xo-lbl">Motores de tu plan · ${U.cPlan==='starter'?'Starter':'Pro'}</div>${wzEngRow()}</div>`;
 if(s===2)return `<div class="eyebrow bare">Paso 2 de 4</div><h1>Tus competidores</h1><p class="lead">Los hemos encontrado en tu web y en tu sector. Quita los que no encajen.</p>
  <div class="wz-lh"><span><b class="num">${w.comps.length}</b> de 5 como máximo</span><span>Podrás cambiarlos cuando quieras.</span></div>
  <ul class="wz-list">${w.comps.map((c,i)=>`<li>${c.c?xoInit(c.n,c.c):fav(c.n)||xoInit(c.n,'#475569')}<span class="t"><b>${c.n}</b><span class="mono">${c.d}</span></span>${c.sug?'<span class="wz-sug">Sugerido</span>':''}<button class="wz-ib" data-act="cWzDel" data-arg="${i}" aria-label="Quitar ${c.n}">${ic('x','sm')}</button></li>`).join('')}</ul>
  ${w.more.length?`<div class="wz-more"><div class="xo-lbl">También aparecen en tu sector</div><div class="wz-chips">${w.more.map((c,i)=>`<button class="chip" data-act="cWzAdd" data-arg="${i}" ${w.comps.length>=5?'disabled':''}>${ic('plus','sm')}${c[0]}</button>`).join('')}</div>${w.comps.length>=5?'<p class="wz-hint">Has llegado a 5. Quita uno para añadir otro.</p>':''}</div>`:''}`;
 if(s===3){const n=wzCount(w);let gi=0;
  return `<div class="eyebrow bare">Paso 3 de 4</div><h1>Tus prompts</h1><p class="lead">Las preguntas que tus clientes hacen a la IA. Desmarca las que no te representen; mejor 15 o más.</p>
  <div class="wz-lh"><span><b class="num">${n}</b> elegidos</span><span>${U.cPlan==='starter'?'Hasta ~25 en Starter':'Hasta ~100 en Pro'}</span></div>
  ${WZ_TOPICS.map(([t,ps],ti)=>`<div class="wz-topic"><div class="wz-th">${t}<span class="num">${ps.filter((_,i)=>w.prompts[ti+':'+i]).length}/${ps.length}</span></div><ul class="wz-ps">${ps.map((p,i)=>{const k=ti+':'+i,on=w.prompts[k];return `<li><label class="${on?'':'off'}"><input type="checkbox" ${on?'checked':''} data-wzp="${k}"><span>${p}</span></label></li>`}).join('')}</ul></div>`).join('')}
  ${w.extra.length?`<div class="wz-topic"><div class="wz-th">Tuyos<span class="num">${w.extra.length}</span></div><ul class="wz-ps">${w.extra.map((p,i)=>`<li><label><input type="checkbox" checked data-wzx="${i}"><span>${p.replace(/</g,'&lt;')}</span></label></li>`).join('')}</ul></div>`:''}
  <form class="wz-add" id="wz-add"><input class="wz-in" id="wz-np" placeholder="Escribe un prompt propio" aria-label="Nuevo prompt"><button class="btn line sm" type="submit">${ic('plus','sm')}Añadir</button></form>`}
 const n=wzCount(w),e=wzEngs().length;
 return `<div class="eyebrow bare">Paso 4 de 4</div><h1>Todo listo para tu primer escaneo</h1><p class="lead">Preguntamos tus prompts a cada motor y leemos menciones, puestos y citas.</p>
  <div class="wz-sum4"><div><span>Prompts</span><b class="num">${n}</b></div><div><span>Motores</span><b class="num">${e}</b></div><div><span>Competidores</span><b class="num">${w.comps.length}</b></div><div class="hi"><span>Respuestas que leeremos</span><b class="num">${n*e*2}</b></div></div>
  <div class="wz-sub"><div class="xo-lbl">Motores</div>${wzEngRow()}</div>
  <p class="wz-hint">${U.cPlan==='starter'?'Después, un escaneo nuevo cada semana.':'Después, un escaneo nuevo cada día durante tu prueba.'} Unos minutos; puedes cerrar la pestaña.</p>
  ${w.creating?wzLoad(['Guardando tu dominio y configuración','Creando tus prompts y competidores','Lanzando tu primer escaneo'],w.creating):''}`}
function wzFoot(w){const s=w.step;if(w.loading)return '';
 const back=s>1?`<button class="btn ghost" data-act="cWzGo" data-arg="${s-1}" ${w.creating?'disabled':''}>${ic('chevl','sm')}Atrás</button>`:'<span></span>';
 const nx=s===1?`<button class="btn ink" data-act="cWz1">Continuar${ic('arrowr','sm')}</button>`:s===2?`<button class="btn ink" data-act="cWzGo" data-arg="3" ${w.comps.length?'':'disabled'}>Continuar a prompts${ic('arrowr','sm')}</button>`:s===3?`<button class="btn ink" data-act="cWzGo" data-arg="4" ${wzCount(w)?'':'disabled'}>Revisar y lanzar${ic('arrowr','sm')}</button>`:`<button class="btn blue" data-act="cWzLaunch" ${w.creating?'disabled':''}>${w.creating?'Creando…':ic('c-rocket','sm')+'Crear dominio y escanear'}</button>`;
 return `<div class="wz-foot">${back}${nx}</div>`}
SCREENS.newdomain={title:'Nuevo dominio',render(){const w=wzState(),s=w.loading?1:w.step;
 const steps=`<ol class="wz-steps" aria-label="Pasos">${WZ_STEPS.map((l,i)=>`<li class="${i+1<s?'done':i+1===s?'cur':''}" ${i+1===s?'aria-current="step"':''}><i></i><span><span class="num">${pad(i+1)}</span>${l}</span></li>`).join('')}</ol>`;
 const side=`<aside class="wz-side" aria-label="Resumen del lanzamiento"><div class="xo-lbl">Resumen</div><dl>
  <div><dt>Dominio</dt><dd class="mono">${s>1||w.loading?w.dom:'Pendiente'}</dd></div><div><dt>País</dt><dd>${s>1?w.country:'Pendiente'}</dd></div>
  <div><dt>Motores</dt><dd>${wzEngs().length} · ${engNames(wzEngs())}</dd></div><div><dt>Competidores</dt><dd>${s>2?w.comps.length:'Pendiente'}</dd></div><div><dt>Prompts</dt><dd>${s>2?wzCount(w):'Pendiente'}</dd></div></dl>
  <div class="wz-est">${s>3?`<b class="num">${wzCount(w)*wzEngs().length*2}</b><span>respuestas en el primer escaneo</span>`:'<span>El total de respuestas sale aquí cuando elijas tus prompts.</span>'}</div></aside>`;
 return `<div class="sc-full sc-newdomain"><header class="wz-top"><span class="wz-brand"><svg aria-hidden="true"><use href="#e-gs"/></svg>GenScore</span><span class="wz-k">Nuevo dominio</span><span style="flex:1"></span>${w.first?'':`<button class="xo-x wz-x" data-act="cWzExit" aria-label="Salir del asistente">${ic('x')}</button>`}</header>
 <div class="wz-wrap">${steps}<div class="wz-grid"><div class="wz-main">${wzMain(w)}${wzFoot(w)}</div>${side}</div></div></div>`},
 after(root){const w=wzState();
  const d=$('#wz-dom',root);if(d){d.addEventListener('input',()=>{w.dom=d.value.trim();d.closest('.wz-fld').classList.remove('bad')});d.addEventListener('keydown',e=>{if(e.key==='Enter')ACT.cWz1()})}
  const c=$('#wz-cty',root);if(c)c.addEventListener('change',()=>w.country=c.value);
  $$('[data-wzp]',root).forEach(x=>x.addEventListener('change',()=>{w.prompts[x.dataset.wzp]=x.checked;wzRe()}));
  $$('[data-wzx]',root).forEach(x=>x.addEventListener('change',()=>{if(!x.checked){w.extra.splice(+x.dataset.wzx,1);wzRe()}}));
  const f=$('#wz-add',root);if(f)f.addEventListener('submit',e=>{e.preventDefault();const v=$('#wz-np').value.trim();if(!v)return;w.extra.push(v);wzRe();setTimeout(()=>$('#wz-np')&&$('#wz-np').focus(),0)})}};
function wzRe(){const sc=$('#sc'),t=sc.scrollTop;render(false);sc.scrollTop=t}
const WZ_DOM=/^(?!https?:)(?!.*\/)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
ACT.cWz1=()=>{const w=wzState();const d=$('#wz-dom');if(d)w.dom=d.value.trim().toLowerCase();
 if(!WZ_DOM.test(w.dom)){const f=d&&d.closest('.wz-fld');if(f){f.classList.add('bad');$('#wz-derr').textContent=w.dom?'Eso no parece un dominio. Ejemplo: miempresa.com':'Escribe tu dominio.'};d&&d.focus();return}
 const t=RM.matches?150:800;w.loading=1;render(false);setTimeout(()=>{w.loading=2;R.route==='newdomain'&&render(false)},t);setTimeout(()=>{w.loading=3;R.route==='newdomain'&&render(false)},t*2);setTimeout(()=>{w.loading=0;w.step=2;R.route==='newdomain'&&render(false)},t*3)};
ACT.cWzGo=el=>{const w=wzState();w.step=+el.dataset.arg;render(false);$('#sc').scrollTop=0};
ACT.cWzDel=el=>{const w=wzState();const [c]=w.comps.splice(+el.dataset.arg,1);wzRe();toast(`${c.n} quitado.`,'','checkc',()=>{w.comps.push(c);wzRe()})};
ACT.cWzAdd=el=>{const w=wzState();if(w.comps.length>=5)return;const [m]=w.more.splice(+el.dataset.arg,1);w.comps.push({n:m[0],d:m[1],c:m[2]});wzRe()};
ACT.cWzExit=()=>go('overview');
ACT.cWzLaunch=()=>{const w=wzState();const t=RM.matches?150:550;w.creating=1;render(false);const ok=()=>R.route==='newdomain';setTimeout(()=>{w.creating=2;ok()&&render(false)},t);setTimeout(()=>{w.creating=3;ok()&&render(false)},t*2);
 setTimeout(()=>{if(!ok())return;const n=wzCount(w),e=wzEngs();U.cMs={total:n*e.length*2,engs:e.length,dom:w.dom,got:0};U.cWz=null;go('mission')},t*3)};
