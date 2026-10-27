/* ================= SCREEN: Primer escaneo (builder C) =================
   Full-screen mission. The counter is the honest part: answers read, per
   engine and in total, like the core scan counter. The pendulums (one per
   engine) are ambient, never progress: core's penObserve stops them off
   screen and with the tab hidden, and reduced motion freezes them. The
   phase names come from the counter, not from a clock. */
let msTimer=null;
const MS_PH=[
 ['En la rampa','Preparando tu primer escaneo','Tú no tienes que hacer nada.'],
 ['Ignición','Motores encendidos','{n} a la vez. Sí, se puede.'],
 ['Ascenso','Preguntando a cada motor','Puedes cerrar esta pestaña. Esto no se cae.'],
 ['En órbita','Leyendo las respuestas','Leemos menciones, puestos y citas.'],
 ['Cerrando la misión','Casi está','Calculando tu Puntuación GEO.']];
function msState(){if(!U.cMs)U.cMs={total:136,engs:4,dom:'nubaria.es',got:0};const m=U.cMs;if(!m.per)m.per=Array(m.engs).fill(0);return m}
const msKeys=m=>EK.slice(0,m.engs);
function msPhase(m){if(m.done)return 5;if(m.got>=m.total)return 4;if(m.got===0)return 0;const f=m.got/m.total;return f<.08?1:f<.5?2:3}
function msPend(keys){const W=keys.length*100;let g=`<line class="rail" x1="10" x2="${W-10}" y1="8" y2="8"/>`;keys.forEach((k,i)=>{const x=50+i*100;g+=`<path class="arc" d="M${x-38} 88 A88 88 0 0 0 ${x+38} 88"/><g id="pd${i}" data-x="${x}"><line class="str" x1="${x}" y1="8" x2="${x}" y2="96"/><circle class="bob" cx="${x}" cy="96" r="13"/><use href="#e-${k}" x="${x-7}" y="89" width="14" height="14" style="color:var(--ink)"/></g><circle cx="${x}" cy="8" r="2" fill="var(--ink-3)"/>`});
 return `<svg viewBox="0 0 ${W} 118" aria-hidden="true">${g}</svg>`}
SCREENS.mission={title:'Primer escaneo',render(){const m=msState(),keys=msKeys(m),ph=msPhase(m),per=m.total/m.engs;
 const P=MS_PH[Math.min(ph,4)];const nW=m.engs===4?'Los cuatro':'Los tres';
 return `<div class="sc-full sc-mission" aria-live="polite">
 <header class="ms-top"><span class="wz-brand ms-brand"><svg aria-hidden="true"><use href="#e-gs"/></svg>GenScore</span><span class="ms-dom">${ic('checkc','sm')}<span class="mono">${m.dom}</span> dado de alta</span><span style="flex:1"></span><a class="btn ghost sm" href="#overview" data-route="overview">Salir${ic('arrowr','sm')}</a></header>
 <div class="ms-body">
  <div class="ms-ey"><span class="pulse"></span><span id="ms-ph">${ph===5?'Misión cumplida':P[0]}</span></div>
  <div class="ms-n" id="ms-n">${roll(m.got)}<span class="of num">de ${m.total}</span></div>
  <div class="ms-u">respuestas leídas</div>
  ${ticks(68,Math.floor(m.got/m.total*68),{id:'ms-tk',cls:'ms-tk'})}
  <p class="ms-s" id="ms-s">${ph===5?'Tu primer escaneo está listo.':ph>=4?`<span class="shimmer">${P[2]}</span>`:P[2].replace('{n}',nW)}</p>
  <div class="card pend ms-pend">${msPend(keys)}<div class="ms-pl" style="grid-template-columns:repeat(${m.engs},1fr)">${keys.map((k,i)=>`<span><b>${ENG[k].n}</b><span class="num" id="ms-e${i}">${m.per[i]} de ${per}</span>${k==='perplexity'?'<span class="new">Nuevo</span>':''}</span>`).join('')}</div></div>
  <ol class="ms-beats" aria-label="Fases">${MS_PH.map((x,i)=>`<li class="${i<ph?'done':i===ph?'on':''}"><i></i>${x[0]}</li>`).join('')}</ol>
  <div class="ms-end" id="ms-end" ${ph===5?'':'hidden'}><a class="btn blue" href="#overview" data-route="overview">Ver tus resultados${ic('arrowr','sm')}</a></div>
  <p class="ms-note">Un escaneo de verdad tarda unos minutos. Puedes cerrar la pestaña: seguimos solos y te avisamos por correo.</p>
 </div></div>`},
 after(){clearInterval(msTimer);const m=msState();if(m.done)return;msTimer=setInterval(msTick,RM.matches?400:1100)}};
function msTick(){if(R.route!=='mission'){clearInterval(msTimer);msTimer=null;return}if(document.hidden)return;
 const m=msState(),keys=msKeys(m),per=m.total/m.engs;const prev=msPhase(m);
 if(m.got>=m.total){if(!m.fin){m.fin=1;return}m.done=1;clearInterval(msTimer);msTimer=null;render(false);return}
 if(m.wait===undefined){m.wait=2;}if(m.wait>0){m.wait--;return}
 let add=1+Math.floor(Math.random()*4);while(add-->0&&m.got<m.total){const open=m.per.map((v,i)=>v<per?i:-1).filter(i=>i>-1);const i=open[Math.floor(Math.random()*open.length)];m.per[i]++;m.got++}
 const n=$('#ms-n .roll');if(n)setRoll(n,m.got);keys.forEach((k,i)=>{const e=$('#ms-e'+i);if(e)e.textContent=`${m.per[i]} de ${per}`});
 const tk=$('#ms-tk');if(tk)$$('i',tk).forEach((x,i)=>x.classList.toggle('on',i<Math.floor(m.got/m.total*68)));
 const ph=msPhase(m);if(ph!==prev){const P=MS_PH[ph];$('#ms-ph').textContent=P[0];$('#ms-s').innerHTML=ph>=4?`<span class="shimmer">${P[2]}</span>`:P[2].replace('{n}',m.engs===4?'Los cuatro':'Los tres');$$('.ms-beats li').forEach((l,i)=>{l.className=i<ph?'done':i===ph?'on':''})}}
