/* ================= OVERLAYS (builder C) =================
   Cross-cutting layer: popovers, dialogs, bottom sheets on mobile, and the
   shell hooks (bell, domain switcher, avatar, «¿Cómo funciona?»). No core
   edits: triggers already rendered by 1-body.html get a data-act here.
   Everything global is prefixed xo / XO so the merge cannot collide. */

/* ---------- extra icons (prefixed c-) ---------- */
const XO_ICONS={
 'c-camera':'<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
 'c-logout':'<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
 'c-user':'<circle cx="12" cy="8" r="4"/><path d="M4.5 20c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
 'c-help':'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>',
 'c-book':'<path d="M4 18.5V5.5A2 2 0 0 1 6 3.5h13v14H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13"/>',
 'c-video':'<rect x="3" y="6.5" width="12.5" height="11" rx="2"/><path d="M15.5 10.5 21 7.5v9l-5.5-3"/>',
 'c-hand':'<path d="M2.5 11.5 6.5 7.5l4 2 3-2 7.5 5-3 3"/><path d="M10.5 9.5l-3 3a1.5 1.5 0 0 0 2 2.2l2.2-1.2 4.8 3.5M7.5 16l2 2M10.5 15l2 2"/>',
 'c-clock':'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 'c-lock':'<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
 'c-card':'<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
 'c-ext':'<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
 'c-trash':'<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
 'c-pencil':'<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
 'c-mail':'<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
 'c-cal':'<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
 'c-rocket':'<path d="M12 3c3 2 4.5 5.5 4 10l-2 3h-4l-2-3c-.5-4.5 1-8 4-10z"/><circle cx="12" cy="9.5" r="1.6"/><path d="M8 13l-3 3 3 1M16 13l3 3-3 1M10.5 19.5 12 21l1.5-1.5"/>',
 'c-refresh':'<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>',
 'c-more':'<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
 'c-globe':'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 2.5 14.5 0 17M12 3.5c-2.5 2.5-2.5 14.5 0 17"/>',
 'c-layers':'<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
 'c-upload':'<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
 'c-target':'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
 'c-change':'<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
 'c-key':'<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
 'c-dot':'<circle cx="12" cy="12" r="2.5"/>'};
$('svg defs').insertAdjacentHTML('beforeend',Object.entries(XO_ICONS).map(([k,v])=>`<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join(''));

/* ---------- shared fiction for account and domains ---------- */
const XO={email:'lucia@nubaria.es',name:'Lucía Ortega',
 domains:[
  {n:'Nubaria',d:'nubaria.es',s:62,band:'Emergente',st:'ok',t:'Escaneado hoy',cur:1},
  {n:'Tienda Verde',d:'tiendaverde.es',s:48,band:'Emergente',st:'run',t:'Escaneando · 48 de 136',c:'#0e9f6e'},
  {n:'Clínica Sol',d:'clinicasol.es',s:71,band:'Competitivo',st:'ok',t:'Escaneado ayer',c:'#e46b2e'},
  {n:'Hostal Brisa',d:'hostalbrisa.es',s:39,band:'Inicial',st:'err',t:'El último escaneo falló',c:'#0369a1'},
  {n:'Ruta Norte',d:'rutanorte.es',s:null,band:'',st:'fresh',t:'Primer escaneo pendiente',c:'#7c4dff'}]};
Object.assign(U,{cRO:false,cBellSeen:false,cBellEmpty:false,cPlan:'pro',cPhoto:null});
const xoInit=(n,c)=>`<span class="xo-lt" style="background:${c}" aria-hidden="true">${n[0]}</span>`;
const xoFav=x=>x.c?xoInit(x.n,x.c):fav(x.n);
const xoAv=(s=32)=>U.cPhoto?`<span class="av xo-avimg" style="width:${s}px;height:${s}px;background-image:url(${U.cPhoto})" aria-hidden="true"></span>`:`<span class="av" style="width:${s}px;height:${s}px;font-size:${Math.round(s*.36)}px" aria-hidden="true">LO</span>`;
const xoPlanLabel=()=>U.cRO?'Sin plan · solo lectura':U.cPlan==='starter'?'Starter':U.cPlan==='agency'?'Agencia':U.cPaid?'Pro':'Pro · prueba';

/* ---------- layer: popover, dialog, sheet ---------- */
const xoLayer=document.createElement('div');xoLayer.id='xo-layer';document.body.appendChild(xoLayer);
let xoRet=null;
function xoClose(){if(!xoLayer.firstChild)return;const w=xoLayer.firstElementChild;w.classList.remove('on');U.cOnClose&&U.cOnClose();U.cOnClose=null;
 setTimeout(()=>{if(w.parentNode&&!w.classList.contains('on'))w.remove()},RM.matches?0:200);const r=xoRet;xoRet=null;r&&r.focus&&r.focus({preventScroll:true})}
function xoMount(html,label){xoLayer.innerHTML='';const w=document.createElement('div');w.className='xo-w';w.innerHTML=html;xoLayer.appendChild(w);
 requestAnimationFrame(()=>w.classList.add('on'));setTimeout(()=>{const f=$('[autofocus]',w)||$('.xo-box',w);if(f){if(!f.hasAttribute('tabindex')&&!f.matches('input,button,a'))f.setAttribute('tabindex','-1');f.focus({preventScroll:true})}},40);return w}
/* popover anchored to el; on phones it becomes a bottom sheet */
function xoPop(anchor,html,{w=340,align='end',label='Menú'}={}){xoRet=anchor;
 if(MOB.matches)return xoMount(`<div class="xo-scrim" data-act="xoClose"></div><div class="xo-box xo-sheet" role="dialog" aria-modal="true" aria-label="${label}"><span class="xo-grab" aria-hidden="true"></span>${html}</div>`,label);
 const a=anchor.getBoundingClientRect(),W=Math.min(w,innerWidth-24);let left=align==='end'?a.right-W:a.left;left=Math.max(12,Math.min(left,innerWidth-W-12));
 const el=xoMount(`<div class="xo-click" data-act="xoClose"></div><div class="xo-box xo-pop" role="dialog" aria-label="${label}" style="left:${left}px;top:${a.bottom+8}px;width:${W}px">${html}</div>`,label);
 const p=$('.xo-pop',el);const h=p.offsetHeight;if(a.bottom+8+h>innerHeight-12)p.style.top=Math.max(12,a.top-h-8)+'px';return el}
/* centered dialog; full width on phones */
function xoDlg(html,{cls='',label='Diálogo'}={}){xoRet=document.activeElement;
 return xoMount(`<div class="xo-scrim" data-act="xoClose"></div><div class="xo-box xo-dlg ${cls}" role="dialog" aria-modal="true" aria-label="${label}">${html}</div>`,label)}
const xoX=(l='Cerrar')=>`<button class="xo-x" data-act="xoClose" aria-label="${l}">${ic('x')}</button>`;
ACT.xoClose=()=>xoClose();
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&xoLayer.firstChild){e.stopPropagation();xoClose()}},true);
document.addEventListener('click',e=>{if(e.target.closest('#xo-layer [data-route]'))xoClose()},true);
/* route changes close the layer (go is a function declaration in this IIFE) */
const _xoGo=go;go=function(k,o){if(xoLayer.firstChild)xoClose();return _xoGo(k,o)};
/* routes that are not in NAV and have no screen get the 404 instead of the «llega en la siguiente fase» placeholder */
const _xoPh=placeholder;placeholder=k=>NAVFLAT.some(n=>n.k===k)?_xoPh(k):(SCREENS.notfound?SCREENS.notfound.render():_xoPh(k));

/* ---------- notifications: at most one per lane ---------- */
function xoLanes(){return [
 U.cRO?{lane:'Tu cuenta',ic:'c-lock',tone:'warm',t:'Tu cuenta está en solo lectura',p:'Tus datos siguen aquí. Elige un plan para volver a escanear.',cta:['Elegir plan','cPlan']}
  :{lane:'Tu cuenta',ic:'c-clock',tone:'warm',t:'Te quedan 4 días de Pro',p:'Después tu cuenta pasa a solo lectura y deja de escanear. Con precio fundador, Pro se queda en 69 € al mes para siempre.',cta:['Ver planes','cPlan']},
 {lane:'Tu siguiente paso',ic:'c-target',tone:'blue',t:'Publica una página comparativa Nubaria vs Cuentix',p:'La primera de tus acciones prioritarias en Recomendaciones. Puede sumar +6 pt a tu Puntuación GEO.',route:['Ver la acción','recs']},
 {lane:'Algo ha cambiado',ic:'users',tone:'ink',t:'Marca emergente en tus respuestas',p:'La IA menciona a Kontaro en 4 consultas y no la monitorizas.',time:'hace 2 h',route:['Ver competidores','competitors']}]}
function xoBellHtml(){const L=xoLanes();
 return `<div class="xo-h"><b>Notificaciones</b><button class="xo-lk" data-act="xoBellEmpty">${U.cBellEmpty?'Ver con avisos':'Ver vacío'}</button></div>
 ${U.cBellEmpty?`<div class="xo-empty">${ic('checkc')}<b>Estás al día.</b><span>Te avisaremos cuando haya algo que hacer.</span></div>`:
 `<ol class="xo-lanes">${L.map(n=>`<li class="xo-ln ${n.tone}"><div class="k"><span class="d"></span>${n.lane}${n.time?`<span class="tm">${n.time}</span>`:''}</div><b>${n.t}</b><p>${n.p}</p>${n.cta?`<button class="btn sm line" data-act="${n.cta[1]}">${n.cta[0]}</button>`:`<a class="xo-go" href="#${n.route[1]}" data-route="${n.route[1]}">${n.route[0]}${ic('arrowr','sm')}</a>`}</li>`).join('')}</ol>`}
 <div class="xo-f"><span>Como mucho un aviso de cada tipo.</span><button class="xo-lk" data-act="cNotifSettings">Correos${ic('chevr','sm')}</button></div>`}
ACT.xoBell=el=>{U.cBellSeen=true;xoPaintShell();xoPop(el,xoBellHtml(),{w:380,label:'Notificaciones'})};
ACT.xoBellEmpty=()=>{U.cBellEmpty=!U.cBellEmpty;const p=$('#xo-layer .xo-box');if(p)p.innerHTML=(MOB.matches?'<span class="xo-grab" aria-hidden="true"></span>':'')+xoBellHtml()};
ACT.cNotifSettings=()=>{U.cTab='notif';go('perfil')};

/* ---------- domain switcher ---------- */
function xoDomHtml(){const D5=XO.domains;
 const stl=x=>`<span class="xo-st ${x.st}">${x.st==='run'?'<span class="pl"></span>':'<span class="dt"></span>'}${x.t}</span>`;
 return `<div class="xo-h"><b>Tus dominios</b><span class="num xo-cap">${D5.length} de 5</span></div>
 <ul class="xo-doms">${D5.map(x=>`<li><button class="xo-dom ${x.cur?'cur':''}" data-act="xoPick" data-arg="${x.d}" ${x.cur?'aria-current="true"':''}>${xoFav(x)}<span class="t"><b>${x.n}</b><span class="mono">${x.d}</span>${stl(x)}</span><span class="sc">${x.s==null?'<span class="na">Sin datos</span>':`<b class="num">${x.s}</b><span>${x.band}</span>`}</span></button></li>`).join('')}</ul>
 <div class="xo-full">${ic('plus','sm')}<span><b>Has usado los 5 dominios de tu plan.</b> Para añadir otro, retira uno o cambia de plan.</span><button class="btn sm line" data-act="cPlan">Cambiar de plan</button></div>`}
ACT.xoDomains=el=>xoPop(el,xoDomHtml(),{w:380,align:'start',label:'Cambiar de dominio'});
ACT.xoPick=el=>{const d=el.dataset.arg;const x=XO.domains.find(y=>y.d===d);xoClose();if(x.cur){go('overview');return}
 toast(`Dominio activo: ${x.n}`,x.st==='err'?'Su último escaneo falló. Lo reintentamos solos.':x.st==='fresh'?'Su primer escaneo empieza en unos minutos.':'Abrimos su Visión general.','c-globe')};

/* ---------- «¿Cómo funciona?», account, affiliates, demo ---------- */
const xoHelpHtml=()=>`<div class="xo-h"><b>¿Cómo funciona?</b></div><div class="xo-menu">
 <button class="xo-mi" data-act="cTour">${ic('c-rocket')}<span>Ver el tour<small>Nueve pasos por la consola</small></span><span class="k">2 min</span></button>
 <button class="xo-mi" data-act="xoDemo">${ic('c-video')}<span>Hablar con nosotros<small>Videollamada con el equipo</small></span><span class="k">20 min</span></button>
 <button class="xo-mi" data-act="xoManuals">${ic('c-book')}<span>Manuales y estudios<small>Guías y estudios de GenScore</small></span>${ic('c-ext','sm')}</button></div>`;
ACT.xoHelp=el=>xoPop(el,xoHelpHtml(),{w:320,align:MOB.matches?'end':'start',label:'¿Cómo funciona?'});
ACT.xoManuals=()=>{xoClose();toast('Manuales y estudios','Se abren en una pestaña nueva.','c-ext')};
const xoAccHtml=()=>`<div class="xo-who">${xoAv(40)}<span><b>${XO.name}</b><span>${XO.email}</span><span class="xo-pl">${xoPlanLabel()}</span></span></div><div class="xo-menu">
 <a class="xo-mi" href="#perfil" data-route="perfil">${ic('c-user')}<span>Tu perfil</span></a>
 <button class="xo-mi" data-act="cNotifSettings">${ic('bell')}<span>Notificaciones</span></button>
 <button class="xo-mi" data-act="xoHelpFrom">${ic('c-help')}<span>¿Cómo funciona?</span></button>
 <div class="xo-sep"></div>
 <button class="xo-mi" data-act="xoAffil">${ic('c-hand')}<span>Programa de afiliados</span><span class="k">30 %</span></button>
 <div class="xo-sep"></div>
 <a class="xo-mi" href="#login" data-route="login">${ic('c-logout')}<span>Cerrar sesión</span></a></div>`;
ACT.xoAccount=el=>xoPop(el,xoAccHtml(),{w:280,label:'Tu cuenta'});
ACT.xoHelpFrom=()=>{const a=$('.top .av')||$('.mtop .av');xoPop(a,xoHelpHtml(),{w:320,label:'¿Cómo funciona?'})};
ACT.xoAffil=()=>xoDlg(`<div class="xo-dh">${xoX()}<div class="eyebrow bare">Programa de afiliados</div><h2>Gana el <span class="xo-big num">30 %</span> de cada Pro que traigas.</h2><p>Durante 12 meses, sobre lo que pague en Pro.</p></div>
 <ol class="steps xo-steps"><li><a><span class="n num">01</span><span class="t">Te damos un enlace propio.</span></a></li><li><a><span class="n num">02</span><span class="t">Quien se registra con él queda ligado a ti.</span></a></li><li><a><span class="n num">03</span><span class="t">Cobras el 30 % de lo que pague en Pro, cada mes, durante un año.</span></a></li></ol>
 <div class="xo-df"><button class="btn ghost" data-act="xoClose">Ahora no</button><button class="btn ink" data-act="xoAffilGo">Ver el programa${ic('c-ext','sm')}</button></div>`,{label:'Programa de afiliados',cls:'xo-narrow'});
ACT.xoAffilGo=()=>{xoClose();toast('Programa de afiliados','Se abre en una pestaña nueva.','c-ext')};
const XO_DAYS=[['lun','27'],['mar','28'],['mié','29'],['jue','30'],['vie','31']],XO_SLOTS=['18:00','18:20','18:40','19:00','19:20','19:40','20:00','20:20','20:40'];
function xoDemoHtml(){return `<div class="xo-dh">${xoX()}<div class="eyebrow bare">Hablar con nosotros</div><h2>Una videollamada de 20 minutos</h2><p>Revisamos tus datos contigo. De lunes a viernes, de 18:00 a 21:00.</p></div>
 <div class="xo-db"><div class="xo-lbl">Octubre</div><div class="xo-days" role="radiogroup" aria-label="Día">${XO_DAYS.map(([w,d],i)=>`<button role="radio" aria-checked="${U.cDd===i}" class="${U.cDd===i?'on':''}" data-act="xoDay" data-arg="${i}"><span>${w}</span><b class="num">${d}</b></button>`).join('')}</div>
 <div class="xo-lbl" style="margin-top:18px">Hora (Madrid)</div><div class="xo-slots" role="radiogroup" aria-label="Hora">${XO_SLOTS.map(h=>`<button role="radio" aria-checked="${U.cDs===h}" class="num ${U.cDs===h?'on':''}" data-act="xoSlot" data-arg="${h}">${h}</button>`).join('')}</div>
 <p class="xo-note">Es una solicitud: te confirmamos el hueco por correo en ${XO.email}.</p></div>
 <div class="xo-df"><button class="btn ghost" data-act="xoClose">Cancelar</button><button class="btn ink" data-act="xoDemoOk">Pedir videollamada</button></div>`}
ACT.xoDemo=()=>{U.cDd=U.cDd??1;U.cDs=U.cDs??'18:40';xoDlg(xoDemoHtml(),{label:'Hablar con nosotros',cls:'xo-narrow'})};
const xoRedraw=html=>{const b=$('#xo-layer .xo-box');if(b)b.innerHTML=html};
ACT.xoDay=el=>{U.cDd=+el.dataset.arg;xoRedraw(xoDemoHtml())};
ACT.xoSlot=el=>{U.cDs=el.dataset.arg;xoRedraw(xoDemoHtml())};
ACT.xoDemoOk=el=>{el.textContent='Enviando…';el.disabled=true;setTimeout(()=>{xoClose();toast('Solicitud enviada.',`${XO_DAYS[U.cDd][0]} ${XO_DAYS[U.cDd][1]} oct, ${U.cDs}. Te la confirmamos por correo.`,'c-cal')},500)};

/* ---------- read-only band (trial ended) ---------- */
const xoBand=document.createElement('div');xoBand.className='xo-ro';xoBand.setAttribute('role','status');
xoBand.innerHTML=`${ic('c-clock')}<span class="tx"><b>Tu prueba de Pro ha terminado.</b> Tus datos siguen aquí, pero no se hacen escaneos nuevos hasta que elijas un plan.</span><button class="btn sm ink" data-act="cPlan">Elegir plan</button>`;
$('#sc').insertBefore(xoBand,$('#page'));
function xoSetRO(on){U.cRO=on;xoPaintShell();if(SCREENS[R.route])render(false)}

/* ---------- shell hooks ---------- */
function xoPaintShell(){
 document.body.classList.toggle('xo-isro',U.cRO);
 const ft=$('.side .foot div>span');if(ft)ft.textContent=xoPlanLabel();
 $$('.ibox .c,.mtop .bell .num').forEach(c=>c.classList.toggle('xo-seen',U.cBellSeen));
 $$('.ibox,.mtop .bell').forEach(b=>b.setAttribute('aria-label',U.cBellSeen?'Notificaciones':'Notificaciones, 3 sin leer'));
 $$('.top .av,.mtop .av').forEach(a=>{a.classList.toggle('xo-avimg',!!U.cPhoto);a.style.backgroundImage=U.cPhoto?`url(${U.cPhoto})`:'';a.textContent=U.cPhoto?'':'LO'});
 const fa=$('.side .foot .av');if(fa){fa.classList.toggle('xo-avimg',!!U.cPhoto);fa.style.backgroundImage=U.cPhoto?`url(${U.cPhoto})`:'';fa.textContent=U.cPhoto?'':'LO'}}
(()=>{const set=(sel,act,extra={})=>$$(sel).forEach(el=>{el.dataset.act=act;Object.entries(extra).forEach(([k,v])=>el.setAttribute(k,v))});
 set('.side .proj','xoDomains',{'aria-haspopup':'dialog'});
 set('.mtop .pj','xoDomains',{'aria-haspopup':'dialog','aria-label':'Nubaria. Cambiar de dominio'});
 set('.top .ibox,.mtop .bell','xoBell',{'aria-haspopup':'dialog'});
 set('.top .av,.mtop .av','xoAccount',{role:'button',tabindex:'0','aria-haspopup':'dialog','aria-label':'Tu cuenta'});
 const foot=$('.side .foot');const bot=document.createElement('div');bot.className='xo-bot';foot.before(bot);bot.append(foot);bot.insertAdjacentHTML('beforeend',`<button class="xo-help" data-act="xoHelp" aria-haspopup="dialog" aria-label="¿Cómo funciona?" title="¿Cómo funciona?">${ic('c-help')}</button>`);
 foot.setAttribute('role','button');foot.tabIndex=0;foot.dataset.act='xoAccount';foot.setAttribute('aria-label','Tu cuenta');foot.classList.add('xo-foot');
 document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches&&e.target.matches('[role="button"][data-act]')){e.preventDefault();e.target.click()}});
 /* prototype-only: a menu with every state this builder adds */
 $('#thbtn').insertAdjacentHTML('beforebegin',`<button class="pb-btn" id="xo-states" data-act="xoStates" title="Estados de cuenta y entrada">${ic('c-layers','sm')}<span class="lb">Estados</span></button>`);
 xoPaintShell()})();

const XO_STATES=[
 ['Acceso',[['Login','login'],['Crear cuenta','signup'],['Confirma tu email',()=>{U.cAuth='confirm';go('signup')}],['Recuperar contraseña',()=>{U.cFg='email';go('forgot')}],['Código de 6 dígitos',()=>{U.cFg='code';go('forgot')}],['Contraseña nueva',()=>{U.cFg='new';go('forgot')}],['Verificación MFA','mfa']]],
 ['Entrada',[['Nuevo dominio · Pro',()=>{U.cPlan='pro';U.cWz={step:1};go('newdomain')}],['Nuevo dominio · Starter',()=>{U.cPlan='starter';U.cWz={step:1};go('newdomain')}],['Primer escaneo',()=>{U.cMs=null;go('mission')}]]],
 ['Tu perfil',[['Plan',()=>{U.cTab='plan';go('perfil')}],['Cuenta',()=>{U.cTab='cuenta';go('perfil')}],['Notificaciones',()=>{U.cTab='notif';go('perfil')}],['Cambiar de plan',()=>{go('perfil');setTimeout(()=>ACT.cPlan(),60)}]]],
 ['Transversal',[['Notificaciones',()=>ACT.xoBell(xoTrig('.top .ibox','.mtop .bell'))],['Notificaciones vacías',()=>{U.cBellEmpty=true;ACT.xoBell(xoTrig('.top .ibox','.mtop .bell'))}],['Selector de dominios',()=>ACT.xoDomains(xoTrig('.side .proj','.mtop .pj'))],['¿Cómo funciona?',()=>ACT.xoHelp(xoTrig('.xo-help','.mtop .av'))],['Menú de cuenta',()=>ACT.xoAccount(xoTrig('.top .av','.mtop .av'))],['Tour',()=>ACT.cTour()],['Videollamada',()=>ACT.xoDemo()],['Programa de afiliados',()=>ACT.xoAffil()],['Error 404','notfound'],['Algo ha ido mal','error'],
  ['Solo lectura · activar',()=>{xoSetRO(true);go('perfil')}],['Solo lectura · quitar',()=>xoSetRO(false)]]]];
const xoTrig=(d,m)=>MOB.matches?$(m):$(d);
ACT.xoStates=el=>xoPop(el,`<div class="xo-h"><b>Estados · builder C</b></div><div class="xo-stl">${XO_STATES.map(([g,it],gi)=>`<div class="xo-lbl">${g}</div>${it.map(([l],ii)=>`<button class="xo-mi sm" data-act="xoState" data-arg="${gi}:${ii}"><span>${l}</span></button>`).join('')}`).join('')}</div>`,{w:300,label:'Estados del prototipo'});
ACT.xoState=el=>{const [g,i]=el.dataset.arg.split(':').map(Number);const f=XO_STATES[g][1][i][1];xoClose();setTimeout(()=>typeof f==='string'?go(f):f(),RM.matches?0:220)};
CMDS.push(['Cuenta','Tu perfil','c-user',()=>go('perfil')],['Cuenta','Cambiar de plan','c-card',()=>ACT.cPlan()],['Cuenta','Ver el tour','c-rocket',()=>ACT.cTour()],['Cuenta','Hablar con nosotros','c-video',()=>ACT.xoDemo()],['Cuenta','Programa de afiliados','c-hand',()=>ACT.xoAffil()],['Cuenta','Añadir dominio','plus',()=>{U.cWz={step:1};go('newdomain')}],['Cuenta','Cerrar sesión','c-logout',()=>go('login')]);
