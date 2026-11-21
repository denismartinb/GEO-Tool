/* Helpers taken as-is from the Instrumento console prototype (js/core.js):
   rolling counter, bars, dial, toasts, segmented control, slide to confirm. */
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const MOB=matchMedia('(max-width:760px)');
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const ic=(n,c='')=>`<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const lg=(k,s=14)=>`<svg width="${s}" height="${s}" aria-hidden="true"><use href="#e-${k}"/></svg>`;
const pad=n=>String(n).padStart(2,'0');
const ENG={chatgpt:{n:'ChatGPT'},gemini:{n:'Gemini'},claude:{n:'Claude'},perplexity:{n:'Perplexity',isNew:1}};
const EK=Object.keys(ENG);
/* ---------- text helpers ---------- */
const hiPath=t=>t.replace(/(^|[\s«(])(\/[a-z0-9][a-z0-9\-\/.]*[a-z0-9])/g,'$1<code class="p">$2</code>');
const engNames=e=>{const n=e.map(k=>ENG[k].n);return n.length>1?n.slice(0,-1).join(', ')+' y '+n.at(-1):n[0]};
const fold=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
/* Source chip. Every recommendation carries exactly one: IA, Google or Agentes. */
function srcChip(s){return s==='google'?`<span class="src">${lg('google',11)}Google</span>`:s==='agent'?`<span class="src ag">${ic('cart')}Agentes</span>`:`<span class="src ia">${ic('sparkles')}IA</span>`}
/* ---------- rolling counter ---------- */
function roll(v,cls=''){return `<span class="roll num ${cls}" aria-label="${v}">${String(v).split('').map(ch=>/\d/.test(ch)?`<span class="col" aria-hidden="true"><span data-d="${ch}">${'0123456789'.split('').map(d=>`<i>${d}</i>`).join('')}</span></span>`:`<span class="st" aria-hidden="true">${ch}</span>`).join('')}</span>`}
function setRoll(el,v){if(!el)return;const t=document.createElement('span');t.innerHTML=roll(v);const n=t.firstElementChild;n.className=el.className;const old=$$('.col>span',el).map(s=>+s.dataset.d);el.replaceWith(n);
 $$('.col>span',n).forEach((s,k)=>{s.style.transition='none';s.style.transform=`translateY(-${old[k]??0}em)`;void s.offsetHeight;s.style.transition=RM.matches?'none':'';s.style.transform=`translateY(-${s.dataset.d}em)`});return n}
/* ---------- ticks (dial + accents only) ---------- */
function ticks(n,on,{cls='',id=''}={}){let h='';for(let i=0;i<n;i++)h+=`<i class="${i<on?'on':''}" style="--td:${i*14}ms"></i>`;return `<div class="tk ${cls}" ${id?`id="${id}"`:''} aria-hidden="true">${h}</div>`}

/* ---------- thin bar with end marker ---------- */
function bar(v,{max=100,cls='',color='',delay=0,label=''}={}){const w=Math.max(0,Math.min(100,v/max*100));return `<div class="tb ${cls}" style="--w:${w}%;--bd:${delay}ms${color?`;--c:${color}`:''}" ${label?`role="img" aria-label="${label}"`:'aria-hidden="true"'}><i></i><b></b></div>`}
/* Arms rolls, ticks and bars inside root. animate=false paints the final frame at once. */
function armMotion(root,animate){const now=!animate||RM.matches;
 $$('.roll',root).forEach(r=>$$('.col>span',r).forEach((s,k)=>{const d=+s.dataset.d;if(now){s.style.transition='none';s.style.transform=`translateY(-${d}em)`;return}
  s.style.transition='none';s.style.transform='translateY(0)';s.style.setProperty('--rd',(k*60)+'ms');void s.offsetHeight;s.style.transition='';requestAnimationFrame(()=>requestAnimationFrame(()=>{s.style.transform=`translateY(-${d}em)`}))}));
 const lit=$$('.tk,.dial,.tb',root);
 if(now){lit.forEach(e=>{e.classList.add('lit');e.style.transition='none';$$('*',e).forEach(x=>x.style.transition='none')});requestAnimationFrame(()=>lit.forEach(e=>{e.style.transition='';$$('*',e).forEach(x=>x.style.transition='')}))}
 else requestAnimationFrame(()=>requestAnimationFrame(()=>lit.forEach(e=>e.classList.add('lit'))))}
/* ---------- dial (101 ticks, 270 degrees) ---------- */
function dial(score,{bands=[40,70]}={}){const cx=150,cy=150;let g='';
 for(let i=0;i<=100;i++){const a=(135+i*2.7)*Math.PI/180,mj=i%10===0,zone=bands.includes(i)||i===0||i===100;const r1=140,r0=zone?118:mj?124:129;
  g+=`<line class="t ${i<=score?'on':''} ${mj?'mj':''}" style="--d:${i*9}ms" x1="${(cx+r0*Math.cos(a)).toFixed(2)}" y1="${(cy+r0*Math.sin(a)).toFixed(2)}" x2="${(cx+r1*Math.cos(a)).toFixed(2)}" y2="${(cy+r1*Math.sin(a)).toFixed(2)}"/>`}
 [0,...bands,100].forEach(v=>{const a=(135+v*2.7)*Math.PI/180,r=104;g+=`<text class="lbl" x="${(cx+r*Math.cos(a)).toFixed(1)}" y="${(cy+r*Math.sin(a)+3.5).toFixed(1)}" text-anchor="middle">${v}</text>`});
 const a=(135+score*2.7)*Math.PI/180;g+=`<line class="needle" x1="${(cx+112*Math.cos(a)).toFixed(1)}" y1="${(cy+112*Math.sin(a)).toFixed(1)}" x2="${(cx+148*Math.cos(a)).toFixed(1)}" y2="${(cy+148*Math.sin(a)).toFixed(1)}"/>`;
 return `<svg class="dial" viewBox="0 0 300 300" role="img" aria-label="Puntuación GEO ${score} de 100">${g}</svg>`}
/* small tick ring (accent): e.g. agentic score */
/* ---------- toast stack ---------- */
function toast(t,s='',icon='checkc',undo){const box=$('#toasts');const el=document.createElement('div');el.className='toast';el.innerHTML=`${ic(icon)}<div class="tx">${t}${s?`<span>${s}</span>`:''}</div>${undo?`<button class="btn">Deshacer</button>`:''}`;
 if(undo)$('.btn',el).onclick=()=>{undo();kill()};box.appendChild(el);while(box.children.length>3)box.firstElementChild.remove();
 const tm=setTimeout(kill,5200);function kill(){clearTimeout(tm);el.classList.add('out');setTimeout(()=>el.remove(),220)}}
/* ---------- segmented control / tabs with sliding indicator ---------- */
function segInd(seg){if(!seg)return;const on=$('button[aria-pressed="true"]',seg),ind=$('.ind',seg);if(!on||!ind)return;ind.style.left=on.offsetLeft+'px';ind.style.width=on.offsetWidth+'px'}
function seg(id,opts,cur,act){return `<div class="seg" id="${id}" role="tablist"><span class="ind"></span>${opts.map(([k,l])=>`<button role="tab" data-act="${act}" data-arg="${k}" aria-pressed="${cur===k}" aria-selected="${cur===k}">${l}</button>`).join('')}</div>`}

/* ---------- progress ticks for a sequence ---------- */
function progressTicks(n,{id='ptk',labels=true}={}){return `<div class="ptk" id="${id}" role="tablist" aria-label="Progreso">${Array.from({length:n},(_,i)=>`<button role="tab" data-go="${i}" aria-label="Paso ${i+1}">${labels?`<span class="num">${pad(i+1)}</span>`:''}<i></i></button>`).join('')}<span class="cnt num"></span></div>`}
/* ---------- slide to confirm ---------- */
const slideHtml=(id,label='Desliza para marcar como hecho')=>`<div class="slide" data-slide="${id}"><span class="fill"></span><span class="lab"><span class="shimmer">${label}</span></span><button class="knob" aria-label="Marcar como hecho">${ic('arrowr')}</button></div>`;
function bindSlides(root,onConfirm){$$('.slide',root).forEach(sl=>{if(sl._b)return;sl._b=1;const k=$('.knob',sl),fill=$('.fill',sl);let s=null;const max=()=>sl.clientWidth-k.offsetWidth-8;
 k.addEventListener('pointerdown',e=>{s={x:e.clientX,dx:0};k.setPointerCapture(e.pointerId);sl.classList.remove('back','nudge');e.stopPropagation()});
 k.addEventListener('pointermove',e=>{if(!s)return;s.dx=Math.max(0,Math.min(max(),e.clientX-s.x));k.style.transform=`translateX(${s.dx}px)`;fill.style.width=(s.dx+56)+'px'});
 const up=()=>{if(!s)return;const d=s.dx;s=null;if(d>=max()*.86){k.style.transform=`translateX(${max()}px)`;fill.style.width='100%';sl.classList.add('ok');$('.lab',sl).innerHTML='Hecha';setTimeout(()=>onConfirm(sl.dataset.slide),RM.matches?0:260)}else{sl.classList.add('back');k.style.transform='';fill.style.width='';if(d<4){void sl.offsetWidth;sl.classList.add('nudge')}}};
 k.addEventListener('pointerup',up);k.addEventListener('pointercancel',up);
 k.addEventListener('click',e=>{if(e.detail===0)onConfirm(sl.dataset.slide)})})}
function curTheme(){return document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
