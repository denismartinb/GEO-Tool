/* ================= BOOT: delegation, wiring, first render ================= */
const COMPONENTS=['Esfera de marcas','Barra fina con marcador','Ranking','Bloque profundo','Pasos numerados','Contador rodante','Marcas de progreso','Péndulos de escaneo','Barra de comandos ⌘K','Desenfoque progresivo','Mazo deslizable','Modo foco','Deslizar para confirmar','Escala de objetivo de Google','Acordeón de pastillas','Buscador y filtros por fuente','Grupos con «Ver N más»','Pestañas con indicador','Confirmación en línea','Pila de avisos'];
const NOTES=[
 'Fase 1 sobre «Instrumento»: misma limpieza, mismo primer bloque (esfera con los cuatro motores) y mismos indicadores clave.',
 'Fuera las rayitas fuera de la esfera: el desglose y los componentes agénticos usan una barra fina continua con un marcador al final. Las marcas quedan para la esfera, los motores y algún acento.',
 'Competidores es un ranking: puesto grande, logo y nombre, la mención como cifra protagonista con su flecha de cambio, barra fina y puesto medio. Tu fila lleva fondo suave y «Tú».',
 'El plan de esta semana rompe un poco la calma: bloque azul profundo, «Hasta +14 pt» con contador rodante y las cuatro acciones como pasos numerados.',
 'Recomendaciones a escala real: 34 acciones. Las cuatro del plan siguen en el mazo; las 30 de «Más adelante» se agrupan por palanca, con buscador, filtro por fuente (IA, Google, Agentes), tres filas por grupo y «Ver N más».',
 '«Abrir en foco» recorre cualquier grupo o lista filtrada de una en una, a pantalla completa. En móvil, deslizamiento nativo.',
 'Lo que depende de terceros y los objetivos de Google no se marcan como hechos: se siguen solos en el próximo escaneo.',
 'Sistema modular en i-src: cada pantalla se registra en SCREENS y las que aún no existen se enchufan con un aviso. Guía en i-src/STYLE.md.'];

function activeDeck(){return !$('#focus').hidden?U.fdeck:(R.route==='recs'?U.deck:null)}

document.addEventListener('click',e=>{const t=e.target;let el;
 if((el=t.closest('[data-route]'))){e.preventDefault();const st={};if(el.dataset.idx!=null)st.recIdx=+el.dataset.idx;if(!$('#focus').hidden)closeFocus();go(el.dataset.route,{state:st});return}
 if((el=t.closest('[data-act]'))){const f=ACT[el.dataset.act];if(f){e.preventDefault();f(el,e)}return}
 if((el=t.closest('.ptk [data-go]'))){const d=activeDeck();d&&d.go(+el.dataset.go);return}
 if((el=t.closest('[data-step]'))){const d=activeDeck();d&&d.go(d.idx+ +el.dataset.step);return}
 if((el=t.closest('[data-ci]'))){cRun(+el.dataset.ci);return}
 if(!t.closest('#notes,#notesbtn'))closeNotes()});
document.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#cmdk').hidden?cOpen():cClose();return}
 if(e.key==='Escape'){if(!$('#cmdk').hidden){cClose();return}if(!$('#focus').hidden){closeFocus();return}closeNotes();closeDrawer();return}
 if($('#cmdk').hidden&&!e.target.closest('input,textarea')&&(e.key==='ArrowRight'||e.key==='ArrowLeft')){const d=activeDeck();d&&d.go(d.idx+(e.key==='ArrowRight'?1:-1))}});

$('#cq').addEventListener('input',()=>{cSel=0;cRender()});
$('#cq').addEventListener('keydown',e=>{const n=Math.max(1,cList.length);if(e.key==='ArrowDown'){cSel=(cSel+1)%n;cRender();e.preventDefault()}else if(e.key==='ArrowUp'){cSel=(cSel-1+n)%n;cRender();e.preventDefault()}else if(e.key==='Enter')cRun(cSel)});
$('#scrim').addEventListener('click',cClose);

$('#notes').innerHTML=`<button class="x" id="nx" aria-label="Cerrar notas">${ic('x')}</button><div class="eyebrow bare">Fase 1 · Instrumento</div><h2 style="margin-top:6px">Lo que cambia</h2><ul>${NOTES.map(n=>`<li>${n}</li>`).join('')}</ul><div class="eyebrow" style="margin-top:18px">Componentes del sistema</div><div class="cl">${COMPONENTS.map(c=>`<span class="chip" style="height:26px;font-size:12px">${c}</span>`).join('')}</div>`;
$('#notesbtn').onclick=()=>{const on=!$('#notes').classList.contains('on');$('#notes').classList.toggle('on',on);$('#notesbtn').setAttribute('aria-expanded',on)};
$('#nx').onclick=closeNotes;
$('#comps').innerHTML='<b>Sistema:</b> '+COMPONENTS.slice(0,6).join(' · ')+' · …';
$('#pfav').outerHTML=fav('nubaria');

$('#hb').onclick=()=>{$('#side').classList.add('on');$('#dscrim').classList.add('on');document.body.classList.add('dr')};
$('#dscrim').onclick=closeDrawer;

try{const t=localStorage.getItem('gs-i-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}
paintTheme();$('#thbtn').onclick=toggleTheme;
$('#scanbtn').onclick=()=>{if(R.route!=='overview')go('overview');setScan(!U.scan)};
CMDS.push(['Acciones','Simular un escaneo','scan',()=>{if(R.route!=='overview')go('overview');setScan(true)}],['Acciones','Descargar informe','download',()=>ACT.report()]);

$('#sc').addEventListener('scroll',edges,{passive:true});
addEventListener('resize',()=>{segInd($('#pgseg'));$$('#page .seg').forEach(segInd);eachDeck(d=>d.layout());edges()});
MOB.addEventListener('change',()=>{closeFocus();render(false)});
addEventListener('hashchange',()=>{const k=location.hash.slice(1);if(k&&k!==R.route)go(k)});
document.fonts&&document.fonts.ready.then(()=>{segInd($('#pgseg'));$$('#page .seg').forEach(segInd);eachDeck(d=>d.layout())});

(()=>{let k=location.hash.slice(1);if(!k){try{k=localStorage.getItem('gs-i-route')||''}catch(e){}}if(k&&(SCREENS[k]||NAVFLAT.some(n=>n.k===k)))R.route=k;render()})();
