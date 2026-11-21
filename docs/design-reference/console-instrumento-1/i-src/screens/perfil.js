/* ================= SCREEN: Tu perfil (builder C) =================
   Plan · Cuenta · Notificaciones. Plan opens by default. The plan card is the
   highlight of the page without a dark block: light card, blue edge, big
   light numerals. The «Cambiar de plan» modal lives here too (ACT.cPlan). */
Object.assign(U,{cTab:'plan',cSw:{drop:true,week:true,first:true,tips:false},cPwd:false});
const PF_PLANS=[
 {id:'starter',n:'Starter',old:'29 €',price:'20 €',tag:'Empieza a monitorizar',m:['1','~25','3','Semanal']},
 {id:'pro',n:'Pro',old:'99 €',price:'69 €',tag:'El bucle de acción completo',m:['5','~100','4','Diario'],rec:1},
 {id:'agency',n:'Agencia',price:'A medida',tag:'Escala multi-cliente',m:['A medida','~300','4','Diario'],sales:1}];
const PF_INCL=['5 dominios · ~100 prompts','4 motores: ChatGPT, Gemini, Claude y Perplexity','Escaneo diario','Nuevos motores incluidos sin coste extra','Recomendaciones y generador de soluciones','Comercio agéntico'];
const pfRow=(l,d,ctrl,cls='')=>`<div class="pf-row ${cls}"><div class="l"><b>${l}</b>${d?`<span>${d}</span>`:''}</div><div class="c">${ctrl}</div></div>`;
const pfUse=(l,v,max,unit='')=>`<div class="pf-use"><div class="h"><span>${l}</span><b class="num">${v}<small>/${max}${unit}</small></b></div>${bar(v,{max,cls:'thin'+(v>=max?' ink':''),label:`${l}: ${v} de ${max}`})}${v>=max?'<span class="full">Completo</span>':''}</div>`;

function pfPlanTab(){const ro=U.cRO;
 const trial=`<div class="pf-trial"><div class="h"><span>Te quedan <b class="num">4 días</b> de tu prueba de 7</span></div><div class="pf-days" role="img" aria-label="Día 3 de 7">${Array.from({length:7},(_,i)=>`<i class="${i<3?'on':''}"><span class="num">${i+1}</span></i>`).join('')}</div></div>`;
 return `<section class="pf-plan ${ro?'ro':''}" aria-label="Tu plan">
  <div class="pf-pl">
   <div class="pf-ey"><span>Tu plan · facturación mensual</span>${ro?'<span class="badge b-warm">Solo lectura</span>':'<span class="badge b-blue">En prueba</span>'}</div>
   <div class="pf-name">${ro?'Sin plan':'Pro'}</div><p class="pf-tag">${ro?'Ves tus datos, sin escaneos nuevos.':'El bucle de acción completo.'}</p>
   ${ro?'':`<div class="pf-price"><b class="num">${roll(69)}<small>€</small></b><span class="per">/mes</span><s class="num">99 €</s></div><p class="pf-fp">Precio fundador, <b>para siempre</b>.</p>${trial}`}
   <div class="pf-acts">${ro?'<button class="btn blue" data-act="cPlan">Elegir plan</button>':'<button class="btn blue" data-act="cPlan" data-arg="pro">Contratar ahora</button><button class="btn line" data-act="cPlan">Cambiar de plan</button>'}<button class="btn ghost" data-act="cStripe">${ic('c-card','sm')}Facturas y pago</button></div>
  </div>
  <div class="pf-pr"><div class="eyebrow bare">${ro?'Lo que tenías en Pro':'Incluido'}</div><ul>${PF_INCL.map(x=>`<li>${ic('check','sm')}${x}</li>`).join('')}</ul></div>
 </section>
 <section class="sec"><div class="eyebrow">Uso de este ciclo</div>
  <div class="pf-uses">${pfUse('Prompts monitorizados',17,100)}${pfUse('Dominios',5,5)}${pfUse('Palabras en Google',12,50)}</div></section>
 <section class="sec"><div class="eyebrow">Más opciones</div><div class="pf-list">
  ${pfRow('¿Gestionas varios clientes?','El plan Agencia, a medida.',`<button class="btn sm line" data-act="cPlan">Comparar planes${ic('arrowr','sm')}</button>`)}
  ${pfRow('Programa de afiliados','Gana el 30 % de cada Pro que traigas, durante 12 meses.',`<button class="btn sm line" data-act="xoAffil">Ver cómo funciona</button>`)}
  ${ro?'':pfRow('Cancelar suscripción','Se gestiona en el portal seguro de pago.',`<button class="btn sm ghost" data-act="cStripe">Cancelar suscripción</button>`)}
 </div></section>`}
function pfAccountTab(){return `<div class="grid2 pf-acc">
 <section><div class="eyebrow">Datos personales</div><div class="pf-form">
  <div class="pf-f2"><label class="pf-fld"><span>Nombre</span><input class="pf-in" value="${XO.name}"></label><label class="pf-fld"><span>Email</span><input class="pf-in" type="email" value="${XO.email}"></label></div>
  <label class="pf-fld"><span>Cargo <em>(opcional)</em></span><input class="pf-in" placeholder="Por ejemplo, Marketing"></label>
  <div class="pf-end"><button class="btn ink sm" data-act="cSave">Guardar</button></div></div>
  <div class="eyebrow" style="margin-top:36px">Acceso</div><div class="pf-list">
  ${pfRow('Contraseña','Cambiada hace 3 meses.',U.cPwd?'':`<button class="btn sm line" data-act="cPwd">Cambiar</button>`)}
  ${U.cPwd?`<div class="pf-form pf-pwd"><label class="pf-fld"><span>Contraseña actual</span><input class="pf-in" type="password" value="••••••••"></label><label class="pf-fld"><span>Nueva contraseña</span><input class="pf-in" type="password" placeholder="Al menos 8 caracteres"></label><label class="pf-fld"><span>Repite la nueva</span><input class="pf-in" type="password"></label><div class="pf-end"><button class="btn ghost sm" data-act="cPwd">Cancelar</button><button class="btn ink sm" data-act="cPwdOk">Guardar contraseña</button></div></div>`:''}
  ${pfRow('Verificación en dos pasos','Con una app de autenticación.',`<span class="badge b-pos">${ic('check')}Activa</span>`)}</div></section>
 <section><div class="eyebrow">Datos de facturación</div><div class="pf-form">
  <label class="pf-fld"><span>Empresa o razón social</span><input class="pf-in" value="Nubaria Software S.L."></label>
  <label class="pf-fld"><span>NIF/CIF</span><input class="pf-in mono" value="B12345678"></label>
  <p class="pf-hint">Aparecen en tus facturas.</p>
  <div class="pf-end"><button class="btn ink sm" data-act="cSave">Guardar</button></div></div>
  <div class="eyebrow pf-dz" style="margin-top:36px">Zona de peligro</div><div class="pf-list">
  ${pfRow('Eliminar cuenta','Borra tu cuenta, tus dominios y todo su historial. Es irreversible.',`<button class="btn sm line pf-danger" data-act="cDelAcc">Eliminar cuenta</button>`)}</div></section>
</div>`}
function pfNotifTab(){const sw=(k,t)=>`<button class="pf-sw" role="switch" aria-checked="${U.cSw[k]}" aria-label="${t}" data-act="cSw" data-arg="${k}"><i></i></button>`;
 return `<section><div class="eyebrow">Correos</div><div class="pf-list pf-mails">
 ${[['drop','Caída de puntuación','Si bajas 10 puntos o más.'],['week','Resumen semanal','Los lunes.'],['first','Primer escaneo listo','Una sola vez por dominio.'],['tips','Consejos y ofertas','De vez en cuando.']].map(([k,t,d])=>pfRow(t,d,sw(k,t))).join('')}
 ${pfRow('Tu cuenta y facturación','Siempre activos: pagos, seguridad y cambios de plan.',`<button class="pf-sw" role="switch" aria-checked="true" disabled aria-label="Tu cuenta y facturación, siempre activos"><i></i></button>`,'fixed')}
 </div><p class="pf-hint" style="margin-top:14px">${ic('bell','sm')}En la consola, la campana te enseña como mucho un aviso de cada tipo.</p></section>`}
const PF_TABS=[['plan','Plan'],['cuenta','Cuenta'],['notif','Notificaciones']];
const pfBody=()=>U.cTab==='cuenta'?pfAccountTab():U.cTab==='notif'?pfNotifTab():pfPlanTab();

SCREENS.perfil={title:'Tu perfil',render(){const ro=U.cRO;
 return `<div class="sc-perfil">
 <header class="pf-head">
  <div class="pf-av"><button class="pf-avb" data-act="cPhotoMenu" aria-haspopup="dialog" aria-label="Cambiar foto de perfil">${xoAv(88)}<span class="pf-cam">${ic('c-camera','sm')}</span></button><input type="file" id="pf-file" accept="image/*" hidden></div>
  <div class="pf-id"><div class="eyebrow bare">Tu perfil</div><h1>${XO.name}</h1><p class="mono">${XO.email}</p>
   <div class="pills" style="margin-top:12px">${ro?'<span class="badge b-warm">Sin plan · solo lectura</span>':`<span class="badge b-blue">${xoPlanLabel()}</span>`}</div></div>
  <a class="btn ghost sm pf-out" href="#login" data-route="login">${ic('c-logout','sm')}Cerrar sesión</a>
 </header>
 <div class="pf-tabs">${seg('pf-seg',PF_TABS,U.cTab,'cTab')}</div>
 <div class="pf-panel" id="pf-panel" role="tabpanel">${pfBody()}</div>
 </div>`}};
ACT.cTab=el=>{const k=el.dataset.arg;if(U.cTab===k)return;U.cTab=k;const s=$('#pf-seg');$$('button',s).forEach(b=>{const on=b.dataset.arg===k;b.setAttribute('aria-pressed',on);b.setAttribute('aria-selected',on)});segInd(s);
 const p=$('#pf-panel');p.innerHTML=pfBody();p.classList.remove('in');void p.offsetWidth;p.classList.add('in');armMotion(p,true)};
const pfRe=()=>{const p=$('#pf-panel');if(p){p.innerHTML=pfBody();armMotion(p,false)}};
ACT.cSw=el=>{const k=el.dataset.arg;U.cSw[k]=!U.cSw[k];el.setAttribute('aria-checked',U.cSw[k]);toast('Preferencia guardada.','','checkc',()=>{U.cSw[k]=!U.cSw[k];pfRe()})};
ACT.cSave=el=>{el.textContent='Guardando…';setTimeout(()=>{el.textContent='Guardar';toast('Cambios guardados.')},500)};
ACT.cPwd=()=>{U.cPwd=!U.cPwd;pfRe()};
ACT.cPwdOk=()=>{U.cPwd=false;pfRe();toast('Contraseña actualizada.','','c-lock')};
ACT.cStripe=()=>toast('Portal de pago','En el producto se abre el portal seguro de Stripe.','c-card');
ACT.cDelAcc=()=>xoDlg(`<div class="xo-dh">${xoX()}<div class="eyebrow bare" style="color:var(--warm)">Zona de peligro</div><h2>Eliminar tu cuenta</h2><p>Se borran tu cuenta, tus 5 dominios, sus escaneos, prompts, competidores, recomendaciones y soluciones generadas. No se puede deshacer.</p></div>
 <div class="xo-db"><label class="pf-chk"><input type="checkbox" id="pf-dk">Entiendo que esta acción no se puede deshacer.</label></div>
 <div class="xo-df"><button class="btn ghost" data-act="xoClose">Cancelar</button><button class="btn warm" data-act="cDelAccOk">Eliminar cuenta definitivamente</button></div>`,{cls:'xo-narrow',label:'Eliminar cuenta'});
ACT.cDelAccOk=el=>{const c=$('#pf-dk');if(!c.checked){c.focus();$('.pf-chk').classList.add('bad');return}el.textContent='Eliminando…';setTimeout(()=>{U.cAuth='deleted';go('login')},600)};
ACT.cPhotoMenu=el=>xoPop(el,`<div class="xo-menu"><button class="xo-mi" data-act="cPhotoPick">${ic('c-upload')}<span>Subir foto</span></button>${U.cPhoto?`<button class="xo-mi" data-act="cPhotoDel">${ic('c-trash')}<span>Quitar foto</span></button>`:''}</div>`,{w:220,align:'start',label:'Foto de perfil'});
ACT.cPhotoPick=()=>{xoClose();const i=$('#pf-file');if(!i)return;i.value='';i.onchange=()=>{const f=i.files&&i.files[0];if(!f)return;if(!/^image\//.test(f.type)){toast('Ese archivo no es una imagen.','','warn');return}
 const rd=new FileReader();rd.onload=()=>{U.cPhoto=rd.result;xoPaintShell();render(false);toast('Foto actualizada.')};rd.readAsDataURL(f)};i.click()};
ACT.cPhotoDel=()=>{xoClose();const old=U.cPhoto;U.cPhoto=null;xoPaintShell();render(false);toast('Foto quitada.','','checkc',()=>{U.cPhoto=old;xoPaintShell();render(false)})};

/* ---------- Cambiar de plan (modal with a sticky cart) ---------- */
ACT.cPlan=el=>{U.cCp={step:'plans',sel:el&&el.dataset&&el.dataset.arg||null};pfDrawPlan(true)};
function pfDrawPlan(first){const c=U.cCp;let b='',f='',h='';
 if(c.step==='plans'){h=`<div class="eyebrow bare">Cambiar de plan</div><h2>Elige cómo sigues</h2><p>Precio fundador para las primeras suscripciones, para siempre.</p>`;
  b=`<div class="pm-grid" role="radiogroup" aria-label="Planes">${PF_PLANS.map(p=>{const on=c.sel===p.id;const tag=p.sales?'div':'button';
   return `<${tag} class="pm-c ${on?'on':''} ${p.rec?'rec':''}" ${p.sales?'':`role="radio" aria-checked="${on}" data-act="cPsel" data-arg="${p.id}"`}>
   <div class="pm-top"><b class="pm-n">${p.n}</b>${p.rec?'<span class="badge b-blue">Recomendado</span>':''}${p.sales?'':`<span class="pm-r" aria-hidden="true">${on?ic('check','sm'):''}</span>`}</div>
   ${p.id==='pro'&&!U.cRO?'<span class="pm-cur">Tu plan ahora · prueba</span>':''}
   <div class="pm-pr">${p.sales?`<b class="pm-ms">${p.price}</b>`:`<b class="num">${p.price}</b><span>/mes</span><s class="num">${p.old}</s>`}</div><p class="pm-t">${p.tag}</p>
   <dl class="pm-m">${['Dominios','Prompts','Motores de IA','Escaneo'].map((l,i)=>`<div><dt>${l}</dt><dd class="num">${p.m[i]}${i===2&&p.id!=='starter'?' <span class="new">Perplexity</span>':''}</dd></div>`).join('')}</dl>
   ${p.sales?`<button class="btn line sm pm-sales" data-act="cSales">Hablar con ventas${ic('arrowr','sm')}</button>`:''}</${tag}>`}).join('')}</div>`;
  const sp=PF_PLANS.find(x=>x.id===c.sel);
  f=`<div class="pm-sum" aria-live="polite">${sp?`<span>${sp.id==='pro'&&!U.cRO?'Pasas de la prueba a':'Tu nuevo plan'}</span><b>${sp.n} · <span class="num">${sp.price}</span>/mes <s class="num">${sp.old}</s></b>`:'<span>Ningún plan elegido</span><b class="mut">Elige un plan para continuar</b>'}</div>
  <div class="pm-btns"><button class="btn ghost" data-act="xoClose">Cancelar</button><button class="btn ink" data-act="cPnext" ${sp?'':'disabled aria-disabled="true"'}>Continuar</button></div>`}
 else if(c.step==='checkout'){const p=PF_PLANS.find(x=>x.id===c.sel);h=`<div class="eyebrow bare">Cambiar de plan</div><h2>Revisa el cambio</h2><p>Vas a completar el pago en Stripe.</p>`;
  b=`<div class="pm-chk"><div><span class="xo-lbl">Ahora</span><b>${U.cRO?'Sin plan':'Pro · prueba'}</b><span>${U.cRO?'Solo lectura':'4 días restantes'}</span></div><span class="ar">${ic('arrowr')}</span><div class="nw"><span class="xo-lbl">Nuevo</span><b>${p.n}</b><span><b class="num pm-big">${p.price}</b>/mes, para siempre</span></div></div><p class="xo-note">Precio fundador mientras mantengas tu suscripción.</p>`;
  f=`<span class="pm-sum"><span>${ic('c-lock','sm')} Pago seguro con Stripe</span></span><div class="pm-btns"><button class="btn ghost" data-act="cPback">Atrás</button><button class="btn ink" data-act="cPpay">${ic('c-lock','sm')}Ir a pagar</button></div>`}
 else{const p=PF_PLANS.find(x=>x.id===c.sel);h=`<div class="eyebrow bare">Cambio confirmado</div><h2>Ya estás en ${p.n}</h2><p>Tu plan se está activando. Tarda unos segundos.</p>`;b=`<div class="pm-done">${ticks(40,40,{cls:'lit'})}</div>`;f=`<span></span><div class="pm-btns"><button class="btn ink" data-act="xoClose">Entendido</button></div>`}
 const html=`<div class="xo-dh">${xoX()}${h}</div><div class="xo-db pm-b">${b}</div><div class="pm-cart">${f}</div>`;
 if(first)xoDlg(html,{cls:'pm-dlg',label:'Cambiar de plan'});else xoRedraw(html)}
ACT.cPsel=el=>{U.cCp.sel=el.dataset.arg;pfDrawPlan()};
ACT.cPnext=()=>{if(!U.cCp.sel)return;U.cCp.step='checkout';pfDrawPlan()};
ACT.cPback=()=>{U.cCp.step='plans';pfDrawPlan()};
ACT.cPpay=el=>{el.textContent='Abriendo Stripe…';el.disabled=true;setTimeout(()=>{U.cCp.step='done';if(U.cRO&&U.cCp.sel){xoSetRO(false)}U.cPlan=U.cCp.sel;U.cPaid=true;xoPaintShell();pfDrawPlan();if(R.route==='perfil')render(false)},700)};
ACT.cSales=()=>toast('Hablar con ventas','Se abre tu correo con ventas@genscore.es.','c-mail');
