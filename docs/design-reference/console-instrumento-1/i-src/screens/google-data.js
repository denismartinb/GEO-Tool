/* ================= DATA + BUILDER-B KIT (Posición en Google, Auditoría técnica, Comercio agéntico) =================
   Fiction only (Nubaria and rivals). The b* helpers below are candidates for core.js:
   bF1/bNf (Spanish number formatting), bRe (re-render keeping focus), bLight (one-shot
   «lit» on screen enter), bLine (thin line chart with inverted axis for Google positions),
   bAmbient/bAmbObserve (ambient wait, never progress, paused off-screen), bCode (code block),
   bSheet/bSheetClose (side sheet, bottom sheet on mobile), bProto (prototype state switch). */

/* ---------- formatting ---------- */
const bF1=v=>v==null?'':Number(v).toFixed(1).replace('.',',');
const bNf=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'.');
const bEsc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ---------- extra icons (sprite injected once; core sprite stays untouched) ---------- */
(()=>{const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('width','0');s.setAttribute('height','0');s.setAttribute('aria-hidden','true');s.style.position='absolute';
 s.innerHTML=`<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></symbol>
 <symbol id="i-phone" viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/></symbol>
 <symbol id="i-monitor" viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/></symbol>
 <symbol id="i-door" viewBox="0 0 24 24"><path d="M6 20V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v15M4 20h16"/><circle cx="14.5" cy="12.5" r=".9"/></symbol>
 <symbol id="i-minus" viewBox="0 0 24 24"><path d="M6 12h12"/></symbol>
 <symbol id="i-plug" viewBox="0 0 24 24"><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5"/></symbol>`;
 document.body.prepend(s)})();

/* ---------- re-render keeping keyboard focus on the same control ---------- */
function bRe(){const a=document.activeElement;const key=a&&a.dataset?[a.dataset.act,a.dataset.arg]:null;render(false);
 if(key&&key[0]){const t=$$(`#page [data-act="${key[0]}"]`).find(x=>(x.dataset.arg||'')===(key[1]||''));t&&t.focus({preventScroll:true})}}

/* ---------- one-shot «lit» for screen-specific motion (.blit) ---------- */
function bLight(root,first){const now=!first||RM.matches;const els=$$('.blit',root);
 if(now){els.forEach(e=>{e.style.transition='none';$$('*',e).forEach(x=>x.style.transition='none');e.classList.add('lit')});requestAnimationFrame(()=>els.forEach(e=>{e.style.transition='';$$('*',e).forEach(x=>x.style.transition='')}));return true}
 requestAnimationFrame(()=>requestAnimationFrame(()=>els.forEach(e=>e.classList.add('lit'))));return false}

/* ---------- count a decimal from a to b once (used by the ladder numeral) ---------- */
function bCount(el,a,b,ms=600){if(!el)return;if(RM.matches){el.textContent=bF1(b);return}const t0=performance.now();
 const step=t=>{const k=Math.min(1,(t-t0)/ms),e=1-Math.pow(1-k,3);el.textContent=bF1(a+(b-a)*e);if(k<1&&el.isConnected)requestAnimationFrame(step)};requestAnimationFrame(step)}

/* ---------- thin line chart. invert=true puts 1 at the top (Google positions) ---------- */
function bLine(vals,{min,max,invert=false,w=560,h=170,grid=[],xl=[],label='',fmt=bF1,dash=null,color='var(--blue)'}={}){
 const L=30,Rr=16,T=14,B=xl.length?24:10;const n=vals.length;
 const Y=v=>{const k=(v-min)/(max-min);return T+(invert?k:1-k)*(h-T-B)},X=i=>L+i*(w-L-Rr)/(n-1);
 let s=grid.map(v=>`<line x1="${L}" x2="${w-Rr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--rule-2)"/><text class="ax" x="${L-8}" y="${(Y(v)+3.5).toFixed(1)}" text-anchor="end">${fmt(v).replace(/,0$/,'')}</text>`).join('');
 xl.forEach(([i,t,a])=>{s+=`<text class="ax" x="${X(i).toFixed(1)}" y="${h-6}" text-anchor="${a||'middle'}">${t}</text>`});
 const pts=vals.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
 if(dash)s+=`<polyline points="${dash.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink-4)" stroke-width="1.4" stroke-dasharray="3 4"/>`;
 s+=`<polyline class="ln" points="${pts}" fill="none" stroke="${color}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>`;
 if(!dash){s+=vals.map((v,i)=>i===n-1?`<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4" fill="${color}"/>`:'').join('');
  s+=`<text class="ax s" x="${X(n-1).toFixed(1)}" y="${(Y(vals.at(-1))-10).toFixed(1)}" text-anchor="end">${fmt(vals.at(-1))}</text>`}
 return `<svg class="bline" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${s}</svg>`}

/* ---------- ambient wait: expanding rings, runs only while visible; never progress ---------- */
function bAmbient(center){return `<div class="bamb" aria-hidden="true"><i></i><i></i><i></i><span class="bamb-c">${center}</span></div>`}
let bAmbIO=null;
function bAmbObserve(root){bAmbIO&&bAmbIO.disconnect();const els=$$('.bamb',root);if(!els.length)return;
 bAmbIO=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('run',e.isIntersecting&&!document.hidden)),{root:$('#sc')});els.forEach(e=>bAmbIO.observe(e))}
document.addEventListener('visibilitychange',()=>$$('.bamb').forEach(e=>{if(document.hidden)e.classList.remove('run')}));

/* ---------- code block with copy (and download) ---------- */
function bCode(file,code,dl=false){return `<div class="bcode"><div class="bcode-h"><span class="mono">${file}</span><span style="flex:1"></span><button class="btn sm ghost" data-act="bCopy">${ic('copy','sm')}Copiar</button>${dl?`<button class="btn sm ghost" data-act="bDl">${ic('download','sm')}Descargar</button>`:''}</div><pre>${bEsc(code)}</pre></div>`}
ACT.bCopy=()=>toast('Copiado.','Pégalo en tu web tal cual.','copy');
ACT.bDl=()=>toast('Fichero preparado.','Listo para subir a tu web.','download');

/* ---------- side sheet (bottom sheet on mobile), mounted on body ---------- */
let bSheetRet=null;
function bSheet(html,label){let s=$('#bsheet');if(!s){s=document.createElement('div');s.id='bsheet';s.className='bsheet';s.setAttribute('role','dialog');s.setAttribute('aria-modal','true');s.hidden=true;const sc=document.createElement('div');sc.id='bsheet-scrim';sc.className='bsheet-scrim';sc.hidden=true;sc.onclick=bSheetClose;document.body.append(sc,s)}
 const wasOpen=!s.hidden;if(!wasOpen)bSheetRet=document.activeElement;const a=wasOpen&&document.activeElement&&document.activeElement.dataset?[document.activeElement.dataset.act,document.activeElement.dataset.arg]:null;const st=wasOpen?($('.bsheet-b',s)||{}).scrollTop:0;s.setAttribute('aria-label',label);s.innerHTML=html;s.hidden=false;$('#bsheet-scrim').hidden=false;
 armMotion(s,!wasOpen);if(wasOpen){const b=$('.bsheet-b',s);if(b)b.scrollTop=st;if(a&&a[0]){const t=$$(`[data-act="${a[0]}"]`,s).find(x=>(x.dataset.arg||'')===(a[1]||''));t&&t.focus({preventScroll:true})}}if(!wasOpen){requestAnimationFrame(()=>{s.classList.add('on');$('#bsheet-scrim').classList.add('on')});setTimeout(()=>{const x=$('[data-act="bSheetX"]',s);x&&x.focus()},60)}}
function bSheetClose(){const s=$('#bsheet');if(!s||s.hidden)return;s.classList.remove('on');$('#bsheet-scrim').classList.remove('on');setTimeout(()=>{s.hidden=true;$('#bsheet-scrim').hidden=true;s.innerHTML=''},RM.matches?0:320);bSheetRet&&bSheetRet.isConnected&&bSheetRet.focus();U.g&&(U.g.topic=null)}
ACT.bSheetX=()=>bSheetClose();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const s=$('#bsheet');if(s&&!s.hidden){e.stopImmediatePropagation();bSheetClose()}}},true);
/* sheet clicks live outside #page: same delegation as boot, scoped to the sheet */
document.addEventListener('click',e=>{const s=e.target.closest('#bsheet');if(!s)return;const el=e.target.closest('[data-act]');if(el&&ACT[el.dataset.act]){e.preventDefault();e.stopPropagation();ACT[el.dataset.act](el,e)}else{const r=e.target.closest('[data-route]');if(r){bSheetClose()}}},true);

/* checkboxes: boot's click delegation calls preventDefault, so they use data-chg + change */
document.addEventListener('change',e=>{const el=e.target.closest('[data-chg]');if(el&&ACT[el.dataset.chg])ACT[el.dataset.chg](el,e)});

/* ---------- prototype state switch (bottom of each screen) ---------- */
function bProto(act,states,cur){return `<div class="bproto" role="group" aria-label="Estados del prototipo"><span>Prototipo · ver estado</span>${states.map(([k,l])=>`<button class="fchip" data-act="${act}" data-arg="${k}" aria-pressed="${cur===k}">${l}</button>`).join('')}</div>`}

/* =================== Posición en Google: data =================== */
const GW={tracked:24,cap:50,p1:9,near:7,out:8,up:6,down:2,pos:14.2,prev:16.8,evo:[17.6,17.1,16.8,16.2,15.8,15.4,14.9,14.6,14.2]};
const GTODO=[
 {id:'t1',goal:[15,12,10],t:'Lleva «programa facturación autónomos» del puesto 12 a la página 1',d:'Responde a esa búsqueda en las primeras líneas de /autonomos y enlázala desde tu portada.',topic:'Autónomos'},
 {id:'t2',t:'Añade «gratis» al título de /plantillas',d:'Sales en el puesto 19 en «facturas online gratis». 7 de los 10 primeros llevan «gratis» en el título; el tuyo no.',topic:'Facturas y plantillas'},
 {id:'t3',t:'Responde en /facturacion-electronica lo que la gente pregunta en Google',d:'Una pregunta por encabezado, con la respuesta en la primera frase.',topic:'Facturación electrónica y Verifactu'}];
const GMOVED=[['verifactu software',11,8],['app facturas autónomo',9,6],['programa facturación autónomos',15,12],['facturas online gratis',16,19],['factura rectificativa',13,15]];
const GRIV=[['cuentix.com',14,6.2],['factulia.es',11,8.9],['nubaria.es',9,14.2,1],['librocloud.io',6,13.4]];
const GQS=[['programa facturación autónomos',12.4,86,6240,'/autonomos'],['verifactu software',8.1,214,5380,'/facturacion-electronica'],['facturas online gratis',18.7,22,7910,'/plantillas'],['crear factura pdf',5.3,342,4120,'/crear-factura'],['software facturación pymes',11.9,64,5760,'/'],['nubaria',1.0,402,1020,'/'],['qué es verifactu',6.8,118,3300,'/blog/que-es-verifactu'],['factura rectificativa',14.6,31,4480,'/blog/factura-rectificativa'],['plantilla factura autónomo',14.1,27,3900,'/plantillas'],['app facturas autónomo',6.2,96,2150,'/autonomos']];
const GLOW=[['facturas online gratis',18.7,.3,1.2],['software facturación pymes',11.9,1.1,2.4],['programa facturación autónomos',12.4,1.4,2.4]];
const GASK=[['qué es verifactu',6.8],['cómo hacer una factura siendo autónomo',13.4],['cuánto cuesta un programa de facturación',17.2]];
const GTOPICS=[
 {n:'Autónomos',pg:'/autonomos',kw:6,pos:9.8,prev:11.4,h:[13.2,12.8,12.1,12.4,11.7,11.4,10.6,9.8]},
 {n:'Facturación electrónica y Verifactu',pg:'/facturacion-electronica',kw:7,pos:7.4,prev:8.9,h:[10.1,9.6,9.9,9.2,8.8,8.9,8.1,7.4]},
 {n:'Facturas y plantillas',pg:'/plantillas',kw:5,pos:15.6,prev:14.1,h:[13.9,14.2,13.8,14.4,14.0,14.1,14.9,15.6]},
 {n:'Software para pymes',pg:'/',kw:4,pos:12.1,prev:12.6,h:[13.4,13.1,13.3,12.9,12.8,12.6,12.4,12.1]},
 {n:'Comparativas',pg:null,kw:2,pos:null,prev:null,h:[]}];
const GKW=[['programa facturación autónomos',12,15,'/autonomos'],['facturas autónomos',8,9,'/autonomos'],['app facturas autónomo',6,9,'/autonomos'],['cómo hacer una factura siendo autónomo',13,14,'/autonomos'],['factura simplificada autónomo',9,12,'/autonomos'],['modelo factura autónomo',null,null,null]];
const GTOP10=['cuentix.com','factulia.es','guiapymes.es','softwarepyme.net','librocloud.io','foroautonomos.es','comparasaas.com','nubaria.es','revistaempresa.es','gestoriahoy.es'];
const GDISC={
 seed:[['factura electrónica autónomo',2400,null],['programa facturas gratis',3600,null],['factura proforma',6600,null],['factura rectificativa',8100,null],['facturar sin ser autónomo',1900,null],['numeración de facturas',1300,null]],
 riv:[['alternativa a cuentix',880,null],['programa facturación con stock',1600,null],['facturación recurrente pymes',720,null],['software facturación gestoría',1300,null]],
 gsc:[['plantilla factura autónomo',3900,14],['factura rectificativa',8100,15],['libro de facturas emitidas',1100,17],['qué es una factura simplificada',2900,9]]};
