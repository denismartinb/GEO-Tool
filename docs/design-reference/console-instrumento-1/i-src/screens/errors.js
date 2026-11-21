/* ================= SCREENS: 404 and error (builder C) =================
   Both live inside the shell so the menu is still a way out. The visual is
   an instrument with nothing to read: an empty tick ring. */
function erRing(label,warm){let g='';for(let i=0;i<60;i++){const a=(-90+i*6)*Math.PI/180,mj=i%5===0;g+=`<line class="${warm&&i<9?'w':''}" x1="${(80+(mj?60:64)*Math.cos(a)).toFixed(1)}" y1="${(80+(mj?60:64)*Math.sin(a)).toFixed(1)}" x2="${(80+72*Math.cos(a)).toFixed(1)}" y2="${(80+72*Math.sin(a)).toFixed(1)}"/>`}
 return `<div class="er-ring" aria-hidden="true"><svg viewBox="0 0 160 160">${g}</svg><span class="num">${label}</span></div>`}
SCREENS.notfound={title:'Página no encontrada',render(){return `<div class="sc-err">${erRing('404')}
 <div class="eyebrow bare">Error 404</div><h1>Esta pantalla no existe</h1>
 <p class="lead">El enlace apunta a un dominio, un escaneo o una sección que ya no está disponible.</p>
 <div class="pills" style="justify-content:center"><button class="btn line" data-act="erDomains">Ver mis dominios</button><a class="btn ink" href="#overview" data-route="overview">Ir a Visión general${ic('arrowr','sm')}</a></div></div>`}};
SCREENS.error={title:'Algo ha ido mal',render(){return `<div class="sc-err">${erRing('!',true)}
 <div class="eyebrow bare">Error</div><h1>Algo ha ido mal</h1>
 <p class="lead">No hemos podido cargar esta página. Tus datos están a salvo. Prueba otra vez; si sigue fallando, escríbenos y cita esta referencia.</p>
 <p class="er-ref">Referencia <span class="mono">GS-7F3A-21</span></p>
 <div class="pills" style="justify-content:center"><button class="btn ink" data-act="erRetry">${ic('c-refresh','sm')}Reintentar</button><button class="btn line" data-act="erSupport">${ic('c-mail','sm')}Escribir a soporte</button></div></div>`}};
ACT.erDomains=el=>ACT.xoDomains(el);
ACT.erRetry=el=>{el.disabled=true;el.innerHTML='<span class="au-spin" style="display:block"></span>Reintentando…';setTimeout(()=>go('overview'),RM.matches?100:900)};
ACT.erSupport=()=>toast('Se abre tu correo.','soporte@genscore.es, con la referencia GS-7F3A-21.','c-mail');
