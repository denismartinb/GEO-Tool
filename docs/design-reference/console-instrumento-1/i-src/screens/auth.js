/* ================= SCREENS: entry (login, signup, forgot, MFA) · builder C =================
   The GenScore lockup, then the form, over a quiet animated background.
   Two steps: email, then password. Full screen: the shell hides itself
   with :has(). */
/* Bruma, chosen by Denis 2026-10-27 over nine alternatives: the flowing
   hairlines of Síntesis 4's sign-in, barely there behind the form. The
   effect is ambient: it never claims a measurement and reacts only to the
   form. Typing makes the lines flow a touch faster; opening the account
   tints them blue. It stands still under prefers-reduced-motion, and the
   loop stops when its canvas leaves the page. */
const AU_N=72;
const AUFX={en:0,st:0};
const auLock=()=>`<div class="au-lock"><svg viewBox="0 0 285 292" aria-hidden="true"><use href="#e-gs"/></svg><span>GenScore</span></div>`;
const auCss=(n,d)=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||d;
function auHex(c){const m=c.match(/^#([0-9a-f]{6})$/i);if(!m)return [120,130,150];const n=parseInt(m[1],16);return [n>>16&255,n>>8&255,n&255]}
const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
function auCanvas(cv,draw){const ctx=cv.getContext('2d');let w=0,h=0,dpr=1,t0=performance.now(),k=0,col={};
 const size=()=>{const r=cv.getBoundingClientRect();dpr=Math.min(2,devicePixelRatio||1);w=r.width;h=r.height;cv.width=w*dpr;cv.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0)};
 const pal=()=>{col={ink:auHex(auCss('--ink','#0b1220')),blue:auHex(auCss('--blue','#2563eb'))}};size();pal();
 const frame=now=>{if(!cv.isConnected)return;const r=cv.getBoundingClientRect();if(Math.abs(r.width-w)>1||Math.abs(r.height-h)>1)size();if(++k%40===0)pal();
  ctx.clearRect(0,0,w,h);draw(ctx,w,h,now-t0,col);AUFX.en*=.965;if(!RM.matches)requestAnimationFrame(frame)};
 requestAnimationFrame(frame)}
function auMist(sc){const cv=$('.au-cv',sc);let ph=0,last=0,tint=0;
 auCanvas(cv,(c,w,h,t,col)=>{const dt=last?Math.min(50,t-last):16;last=t;ph+=dt*.00034*(1+AUFX.en*2.5);tint+=((AUFX.st===2?1:0)-tint)*.04;
  const n=13,amp=Math.min(h,w*1.2),step=8;
  for(let i=0;i<n;i++){const k=i/n;c.beginPath();
   for(let x=0;x<=w+step;x+=step){const u=x/w,y=h*.5+Math.sin(u*3.1+ph+k*2.4)*amp*.15*(1-k*.4)+Math.cos(u*6.6-ph*.7+k*5)*amp*.035+(k-.5)*h*.78;x===0?c.moveTo(x,y):c.lineTo(x,y)}
   const a=(.05+k*.15)*(1+AUFX.en*.6),base=col.ink.map((v,j)=>Math.round(v+(col.blue[j]-v)*Math.max(tint,.18))),g=c.createLinearGradient(0,0,w,0);
   g.addColorStop(0,rgba(base,a*.35));g.addColorStop(.5,rgba(base,a));g.addColorStop(1,rgba(base,a*.45));
   c.strokeStyle=g;c.lineWidth=.6+k*1.05;c.stroke()}})}
/* the form's state: 0 email, 1 email accepted, 2 account opened */
function auSetRing(lit,done){const st=done?2:lit>0?1:0,sc=$('.sc-auth');if(st>AUFX.st)AUFX.en=1;AUFX.st=st;if(sc)sc.dataset.st=st}
const auShell=(inner,{dots=0,cls=''}={})=>`<div class="sc-full sc-auth ${cls}"><canvas class="au-cv" aria-hidden="true"></canvas><div class="au-col">${auLock()}${inner}</div></div>`;
const auHead=(t,s)=>`<h1 class="au-t">${t}</h1><p class="au-s">${s}</p>`;
const auEye=`<button type="button" class="au-eye" data-act="cEye" aria-label="Mostrar contraseña" aria-pressed="false">${ic('eye','sm')}</button>`;
const auFld=(id,label,input,extra='')=>`<div class="au-fld"><div class="au-fh"><label for="${id}">${label}</label>${extra}</div><div class="au-iw">${input}</div><div class="au-err" aria-live="polite"></div></div>`;
function auForm({id,cta2,done,pw='Contraseña',forgot=false,newpw=false}){
 return `<form class="au-f" data-step="1" data-cta2="${cta2}" data-done="${done}" novalidate>
  ${auFld(id+'-em','Email',`<input class="au-in au-em" id="${id}-em" type="email" inputmode="email" autocomplete="username" placeholder="nombre@empresa.com" value="${XO.email}"><button type="button" class="au-chg" data-act="cAuChg">Cambiar</button>`)}
  <div class="au-rv"><div>${auFld(id+'-pw',pw,`<input class="au-in au-pw" id="${id}-pw" type="password" autocomplete="${newpw?'new-password':'current-password'}" placeholder="${newpw?'Al menos 8 caracteres':'Tu contraseña'}" tabindex="-1">${auEye}`,forgot?`<a href="#forgot" data-act="cForgot">¿Olvidaste tu contraseña?</a>`:'')}</div></div>
  <button type="submit" class="au-btn au-p"><span class="au-spin" aria-hidden="true"></span><span class="lbl">Continuar</span></button>
 </form>`}
const auGoogle=()=>`<div class="au-or"><span>o</span></div><button type="button" class="au-btn au-g" data-act="cAuGoogle"><span class="au-spin" aria-hidden="true"></span><svg width="18" height="18" aria-hidden="true"><use href="#e-google"/></svg><span class="lbl">Continuar con Google</span></button>`;
const auLegal=x=>`<p class="au-legal">Al continuar, aceptas los <a href="#login">Términos</a> y la <a href="#login">Política de privacidad</a>.${x||''}</p>`;
const auOtp=(vals,label)=>`<div class="au-otp" role="group" aria-label="${label}">${vals.map((d,i)=>`<input inputmode="numeric" maxlength="1" aria-label="Dígito ${i+1}" value="${d}">`).join('')}</div>`;

SCREENS.login={title:'Iniciar sesión',render(){const del=U.cAuth==='deleted';U.cAuth=null;
 return auShell(`${auHead('Hola de nuevo.','Tu visibilidad en la IA, donde la dejaste.')}
 ${del?`<div class="au-note">${ic('checkc','sm')}Tu cuenta se ha eliminado correctamente.</div>`:''}
 ${auForm({id:'li',cta2:'Iniciar sesión',done:'login',forgot:true})}${auGoogle()}
 <p class="au-alt">¿No tienes cuenta? <a href="#signup" data-route="signup">Regístrate</a></p>${auLegal()}`,{dots:1})},after:auAfter};
SCREENS.signup={title:'Crear cuenta',render(){
 if(U.cAuth==='confirm')return auShell(`${auHead('Confirma tu email','Te hemos enviado un enlace a <b>'+XO.email+'</b>. Ábrelo para activar tu cuenta.')}
  <button class="au-btn au-p" data-act="cConfirmed"><span class="lbl">Ya lo he confirmado</span></button>
  <p class="au-alt">¿No te ha llegado? Revisa el spam o <a href="#signup" data-act="cResendLink">reenvíalo</a>.</p>`,{cls:'lit-half'});
 return auShell(`${auHead('Crea tu cuenta','7 días de Pro gratis, sin tarjeta.')}
 ${auForm({id:'su',cta2:'Crear cuenta',done:'signup',pw:'Elige una contraseña',newpw:true})}${auGoogle()}
 <p class="au-alt">¿Ya tienes cuenta? <a href="#login" data-route="login">Inicia sesión</a></p>${auLegal(' Te escribiremos sobre tu cuenta y con consejos; puedes darte de baja cuando quieras.')}`,{dots:1})},after:auAfter};
SCREENS.forgot={title:'Recuperar contraseña',render(){const s=U.cFg||'email';
 const steps=`<div class="au-dots three" aria-label="Paso ${['email','code','new','done'].indexOf(s)+1} de 3">${['email','code','new'].map((k,i)=>`<i class="${['email','code','new','done'].indexOf(s)>=i?'on':''}"></i>`).join('')}</div>`;
 if(s==='code')return auShell(`${auHead('Revisa tu correo','Te hemos enviado un código de 6 dígitos a <b>'+XO.email+'</b>.')}${auOtp([4,8,2,9,1,''],'Código de 6 dígitos')}
  <button class="au-btn au-p" data-act="cFg" data-arg="new"><span class="lbl">Verificar código</span></button><p class="au-alt"><a href="#forgot" data-act="cResend">Reenviar código</a></p>${steps}`);
 if(s==='new')return auShell(`${auHead('Crea una contraseña nueva','Una que no hayas usado antes.')}<div class="au-f">
  ${auFld('np1','Nueva contraseña',`<input id="np1" class="au-in" type="password" value="Nubaria2026" data-act-input="pw">${auEye}`)}
  <div class="au-str">${bar(75,{cls:'thin',label:'Seguridad: buena'})}<span>Buena</span></div>
  <ul class="au-chk">${[['Al menos 8 caracteres',1],['Mayúsculas y minúsculas',1],['Un número',1],['Un símbolo (!@#$…)',0]].map(([t,ok])=>`<li class="${ok?'ok':''}">${ic(ok?'checkc':'c-dot','sm')}${t}</li>`).join('')}</ul>
  ${auFld('np2','Repite la contraseña',`<input id="np2" class="au-in" type="password" value="Nubaria2026">`)}
  <button class="au-btn au-p" data-act="cFg" data-arg="done"><span class="lbl">Guardar contraseña</span></button></div>${steps}`);
 if(s==='done')return auShell(`${auHead('Contraseña actualizada','Ya puedes entrar con ella.')}<a class="au-btn au-p" href="#login" data-route="login"><span class="lbl">Iniciar sesión</span></a>`,{cls:'lit-full'});
 return auShell(`${auHead('Recupera tu contraseña','Te enviamos un código a tu email.')}
  <form class="au-f au-fg" novalidate>${auFld('fe','Email',`<input id="fe" class="au-in au-em" type="email" value="${XO.email}" placeholder="nombre@empresa.com">`)}
  <button type="submit" class="au-btn au-p"><span class="au-spin" aria-hidden="true"></span><span class="lbl">Enviar código</span></button></form>
  <p class="au-alt"><a href="#login" data-route="login">Volver a iniciar sesión</a></p>${steps}`)},after:auAfter};
SCREENS.mfa={title:'Verificación',render(){return auShell(`${auHead('Verifica tu identidad','El código de 6 dígitos de tu app de autenticación.')}${auOtp(['','','','','',''],'Código de verificación')}
 <button class="au-btn au-p" data-act="cMfa"><span class="au-spin" aria-hidden="true"></span><span class="lbl">Verificar</span></button>
 <p class="au-alt"><a href="#login" data-route="login">Usar otra cuenta</a></p>`,{cls:'lit-half'})},after:auAfter};

const AU_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const auErr=(fld,msg)=>{fld.classList.toggle('bad',!!msg);$('.au-err',fld).textContent=msg||''};
const auBtn=(b,st,label)=>{b.classList.remove('loading','ok');b.disabled=!!st;if(st)b.classList.add(st);if(label)$('.lbl',b).textContent=label};
const auDelay=ms=>RM.matches?Math.min(ms,150):ms;
function auStep(f,n,focus=true){f.dataset.step=n;const em=$('.au-em',f),pw=$('.au-pw',f),b=$('.au-p',f);$$('.au-dots i').forEach((d,i)=>d.classList.toggle('on',i<n));
 if(n===2){em.readOnly=true;pw.tabIndex=0;auBtn(b,null,f.dataset.cta2);auSetRing(AU_N/2);if(focus)setTimeout(()=>pw.focus({preventScroll:true}),auDelay(260))}
 else{em.readOnly=false;pw.tabIndex=-1;pw.value='';auErr(pw.closest('.au-fld'),'');auBtn(b,null,'Continuar');auSetRing(0);if(focus)em.focus()}}
function auSubmit(f){const em=$('.au-em',f),pw=$('.au-pw',f),b=$('.au-p',f);if(b.classList.contains('ok'))return;
 const v=em.value.trim(),e=!v?'Escribe tu email.':!AU_EMAIL.test(v)?'Revisa el email: parece incompleto.':'';auErr(em.closest('.au-fld'),e);if(e){em.focus();return}
 if(f.classList.contains('au-fg')){auBtn(b,'loading','Enviando…');setTimeout(()=>{U.cFg='code';render(false)},auDelay(500));return}
 if(f.dataset.step!=='2'){auBtn(b,'loading','Comprobando…');setTimeout(()=>auStep(f,2),auDelay(600));return}
 if(!pw.value){auErr(pw.closest('.au-fld'),'Escribe tu contraseña.');pw.focus();return}
 if(f.dataset.done==='signup'&&pw.value.length<8){auErr(pw.closest('.au-fld'),'Usa al menos 8 caracteres.');pw.focus();return}
 const su=f.dataset.done==='signup';auBtn(b,'loading',su?'Creando tu cuenta…':'Entrando…');
 setTimeout(()=>{auBtn(b,'ok',su?'Cuenta creada':'Sesión iniciada');auSetRing(AU_N,true);setTimeout(()=>{if(su){U.cAuth='confirm';render(false)}else go('overview')},auDelay(700))},auDelay(1000))}
function auAfter(root){const f=$('form.au-f',root);if(f)f.addEventListener('submit',e=>{e.preventDefault();auSubmit(f)});
 const sc=$('.sc-auth',root);if(sc){const lit=sc.classList.contains('lit-full')?AU_N:sc.classList.contains('lit-half')?AU_N/2:0;
  AUFX.st=0;AUFX.en=0;auMist(sc);
  requestAnimationFrame(()=>auSetRing(lit,lit===AU_N))}
 if(f)$$('.au-in',f).forEach(i=>i.addEventListener('input',()=>{AUFX.en=Math.min(1,AUFX.en+.25)}))
 $$('.au-em',root).forEach(i=>i.addEventListener('input',()=>{const fl=i.closest('.au-fld');if(fl.classList.contains('bad'))auErr(fl,'')}));
 const o=$$('.au-otp input',root);o.forEach((x,i)=>{x.addEventListener('input',()=>{x.value=x.value.replace(/\D/g,'').slice(-1);if(x.value&&o[i+1])o[i+1].focus()});x.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!x.value&&o[i-1])o[i-1].focus()})});
 const first=o.find(x=>!x.value);first&&setTimeout(()=>first.focus({preventScroll:true}),200)}
ACT.cAuChg=el=>auStep(el.closest('form'),1);
ACT.cEye=el=>{const on=el.getAttribute('aria-pressed')!=='true';el.setAttribute('aria-pressed',on);el.setAttribute('aria-label',on?'Ocultar contraseña':'Mostrar contraseña');const i=el.parentElement.querySelector('input');i.type=on?'text':'password';i.focus()};
ACT.cAuGoogle=el=>{auBtn(el,'loading','Conectando con Google…');setTimeout(()=>go('overview'),auDelay(900))};
ACT.cForgot=()=>{U.cFg='email';go('forgot')};
ACT.cFg=el=>{U.cFg=el.dataset.arg;render(false)};
ACT.cResend=()=>toast('Código reenviado.','Revisa tu bandeja de entrada.','c-mail');
ACT.cResendLink=()=>toast('Enlace reenviado.','Revisa tu bandeja de entrada.','c-mail');
ACT.cConfirmed=()=>{U.cAuth=null;U.cWz={step:1,first:true};go('newdomain')};
ACT.cMfa=el=>{const o=$$('.au-otp input');if(o.some(x=>!x.value)){toast('Faltan dígitos.','Escribe los 6 dígitos del código.','warn');(o.find(x=>!x.value)||o[0]).focus();return}auBtn(el,'loading','Verificando…');setTimeout(()=>{auSetRing(AU_N,true);setTimeout(()=>go('overview'),auDelay(500))},auDelay(700))};
