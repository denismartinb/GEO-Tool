/* ================= CORE: helpers, data, components, router =================
   Everything here is global on purpose: screens/*.js are concatenated after
   this file and register themselves in SCREENS and ACT. See STYLE.md. */
const RM=matchMedia('(prefers-reduced-motion: reduce)');
const MOB=matchMedia('(max-width:760px)');
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const ic=(n,c='')=>`<svg class="i ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const lg=(k,s=14)=>`<svg width="${s}" height="${s}" aria-hidden="true"><use href="#e-${k}"/></svg>`;
const pad=n=>String(n).padStart(2,'0');

/* ---------- registries ---------- */
const SCREENS={};   // key -> {title, render(), after?(root, first), crumb?}
const ACT={};       // data-act name -> (el, event) => void
const CMDS=[];      // extra command-bar actions: [group, label, icon, fn]
const U={scan:false,prog:52,seen:{}}; // shared UI state; screens add their own keys

/* ---------- shared data (fiction, from G) ---------- */
const ENG={chatgpt:{n:'ChatGPT'},gemini:{n:'Gemini'},claude:{n:'Claude'},perplexity:{n:'Perplexity',isNew:1}};
const EK=Object.keys(ENG);
const D={brand:'Nubaria',domain:'nubaria.es',score:62,spark:[49,51,50,54,55,57,58,62],dates:['4 oct','5 oct','6 oct','7 oct','8 oct','9 oct','10 oct','11 oct'],
 engines:{chatgpt:38,gemini:52,claude:33,perplexity:44},
 comps:[{n:'Cuentix',m:54,rank:'1,8',dt:2},{n:'Nubaria',m:41,rank:'2,6',dt:3,you:1},{n:'Factulia',m:35,rank:'3,1',dt:-1},{n:'Librocloud',m:24,rank:'3,9',dt:0},{n:'Kontaro',m:17,rank:'4,4',dt:-2}]};
const FAVS={
 nubaria:['#1068e0','<path fill="#fff" d="M7.4 17.6h9.3a3.6 3.6 0 0 0 .5-7.15A5.1 5.1 0 0 0 7.3 9.5a4.05 4.05 0 0 0 .1 8.1z"/><circle cx="16.4" cy="7.4" r="1.6" fill="#ffb020"/>'],
 cuentix:['#1d1d1f','<rect x="5" y="5.5" width="14" height="3.2" rx="1.6" fill="#fff"/><rect x="5" y="10.4" width="10" height="3.2" rx="1.6" fill="#fff"/><rect x="5" y="15.3" width="5.5" height="3.2" rx="1.6" fill="#fbbf24"/>'],
 factulia:['#0e9f6e','<path fill="#fff" d="M18.5 5.2C10.6 4.8 5.6 9 5.8 15.6c0 1 .2 2 .5 2.9 1.4-4.4 4.4-7.3 8.6-9-3.4 2.3-5.6 5.3-6.6 9.5.9.4 1.9.6 3 .6 5.4-.1 8.2-5.5 7.2-14.4z"/>'],
 librocloud:['#7c4dff','<path fill="#fff" d="M4 6.6c2.7-.7 5.4-.2 7.4 1.4v11c-2-1.5-4.7-2-7.4-1.4z"/><path fill="#fff" fill-opacity=".62" d="M20 6.6c-2.7-.7-5.4-.2-7.4 1.4v11c2-1.5 4.7-2 7.4-1.4z"/>'],
 kontaro:['#e46b2e','<path fill="#fff" d="M6.5 5h3.4v14H6.5z"/><path fill="#fff" d="M18 5h-4l-4.2 7 4.2 7h4l-4.2-7z"/>'],
 guiapymes:['w','<path fill="#0369a1" d="M12 3.8a6 6 0 0 0-6 6c0 4.4 6 10.4 6 10.4s6-6 6-10.4a6 6 0 0 0-6-6z"/><circle cx="12" cy="9.8" r="2.3" fill="#fff"/>'],
 softwarepyme:['#334155','<path d="m9.2 8-4 4 4 4M14.8 8l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>'],
 foroautonomos:['#f97316','<path fill="#fff" d="M5 7.2A2.2 2.2 0 0 1 7.2 5h9.6A2.2 2.2 0 0 1 19 7.2v6.6a2.2 2.2 0 0 1-2.2 2.2H11l-4 3.3V16h.2A2.2 2.2 0 0 1 5 13.8z"/>'],
 comparasaas:['#0ea5e9','<rect x="6" y="9" width="4.6" height="10" rx="1.4" fill="#fff"/><rect x="13.4" y="5" width="4.6" height="14" rx="1.4" fill="#fff" fill-opacity=".7"/>'],
 revistaempresa:['#b91c1c','<text x="12" y="17.4" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="15" fill="#fff">R</text>'],
 gestoriahoy:['w','<rect x="5" y="6" width="14" height="13" rx="2.5" fill="none" stroke="#7c3aed" stroke-width="2"/><path d="M5 10h14M9 4v4M15 4v4" stroke="#7c3aed" stroke-width="2" stroke-linecap="round"/>']};
const fav=(k,cls='')=>{const e=FAVS[String(k).toLowerCase().replace(/\..*$/,'')];if(!e)return '';const w=e[0]==='w';return `<span class="fav ${cls}${w?' w':''}"${w?'':` style="background:${e[0]}"`} aria-hidden="true"><svg viewBox="0 0 24 24">${e[1]}</svg></span>`};

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
function tickRing(v,label){const cx=60,cy=60;let g='';for(let i=0;i<60;i++){const a=(-90+i*6)*Math.PI/180,on=i<Math.round(v*.6);g+=`<line class="t ${on?'on':''}" style="--d:${i*12}ms" x1="${(cx+44*Math.cos(a)).toFixed(1)}" y1="${(cy+44*Math.sin(a)).toFixed(1)}" x2="${(cx+54*Math.cos(a)).toFixed(1)}" y2="${(cy+54*Math.sin(a)).toFixed(1)}"/>`}
 return `<svg class="ring dial" viewBox="0 0 120 120" role="img" aria-label="${label} ${v} de 100">${g}<text x="60" y="64" text-anchor="middle" style="font:300 30px var(--font);fill:var(--ink);letter-spacing:-.04em">${v}</text><text x="60" y="80" text-anchor="middle" style="font:500 10px var(--font);fill:var(--ink-3)">/100</text></svg>`}
/* thin line chart */
function lineChart(vals,dates,{min=44,max=68,grid=[45,55,65],w=560,h=170,label=''}={}){const L=26,R=14,T=12,B=26;const Y=v=>T+(1-(v-min)/(max-min))*(h-T-B),X=i=>L+i*(w-L-R)/(vals.length-1);
 let s=grid.map(v=>`<line x1="${L}" x2="${w-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--rule-2)"/><text class="ax" x="${L-8}" y="${Y(v)+3.5}" text-anchor="end">${v}</text>`).join('');
 s+=vals.map((v,i)=>`<line x1="${X(i)}" x2="${X(i)}" y1="${h-B}" y2="${h-B+5}" stroke="var(--ink-4)"/><text class="ax" x="${X(i)}" y="${h-6}" text-anchor="middle">${i===0||i===vals.length-1?dates[i]:dates[i].replace(/ \w+$/,'')}</text>`).join('');
 s+=`<line x1="${L}" x2="${w-R}" y1="${h-B}" y2="${h-B}" stroke="var(--ink-4)"/><polyline points="${vals.map((v,i)=>`${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--blue)" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>`;
 s+=vals.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="${i===vals.length-1?4:2}" fill="${i===vals.length-1?'var(--blue)':'var(--surface)'}" stroke="var(--blue)" stroke-width="1.5"/>`).join('');
 s+=`<text class="ax s" x="${X(vals.length-1)}" y="${Y(vals.at(-1))-10}" text-anchor="middle">${vals.at(-1)}</text>`;
 return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${s}</svg>`}
function spark(v,c='var(--blue)'){const w=200,h=30,mn=Math.min(...v),mx=Math.max(...v);const X=i=>i*w/(v.length-1),Y=x=>h-3-(x-mn)/(mx-mn||1)*(h-6);
 return `<svg class="sp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${v.map((x,i)=>X(i)+','+Y(x)).join(' ')}" fill="none" stroke="${c}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`}

/* ---------- ranking ---------- */
/* rows: [{n, m, rank, dt, you}] sorted by m. Brand row gets the soft background and «Tú». */
function ranking(rows,{metric='Mención',second='Puesto medio'}={}){const max=Math.max(...rows.map(r=>r.m));
 const delta=d=>d>0?`<span class="dl up" aria-label="Sube ${d} puntos">${ic('arrowup')}${d}</span>`:d<0?`<span class="dl down" aria-label="Baja ${-d} puntos">${ic('arrowdown')}${-d}</span>`:`<span class="dl eq" aria-label="Igual">=</span>`;
 return `<div class="rank-h" aria-hidden="true"><span>#</span><span>Marca</span><span>${metric}</span><span>${second}</span></div><ol class="rank">${rows.map((r,i)=>`<li class="rk ${r.you?'me':''}"><span class="pos num">${pad(i+1)}</span><span class="who">${fav(r.n,'')}<span class="nm">${r.n}</span>${r.you?'<span class="you">Tú</span>':''}</span><span class="men num"><b>${r.m}<small>%</small></b></span><span class="avg num"><small>${second} </small>${r.rank}º</span>${bar(r.m,{max:max*1.08,cls:'thin '+(r.you?'':'ink nomark'),delay:i*60})}</li>`).join('')}</ol>`}

/* ---------- pendulum wave (ambient scan indicator, never progress) ---------- */
function pendulumSvg(){let g=`<line class="rail" x1="10" x2="390" y1="8" y2="8"/>`;EK.forEach((k,i)=>{const x=50+i*100;g+=`<path class="arc" d="M${x-38} 88 A88 88 0 0 0 ${x+38} 88"/><g id="pd${i}" data-x="${x}"><line class="str" x1="${x}" y1="8" x2="${x}" y2="96"/><circle class="bob" cx="${x}" cy="96" r="13"/><use href="#e-${k}" x="${x-7}" y="89" width="14" height="14" style="color:var(--ink)"/></g><circle cx="${x}" cy="8" r="2" fill="var(--ink-3)"/>`});
 return `<svg viewBox="0 0 400 118" aria-hidden="true">${g}</svg>`}
const PEN={raf:0,vis:true,t0:0,acc:0,io:null};
function penFrame(t){EK.forEach((k,i)=>{const g=document.getElementById('pd'+i);if(!g)return;const x=+g.dataset.x,T=24/(15+i),th=.42*Math.cos(2*Math.PI*t/T),bx=x+88*Math.sin(th),by=8+88*Math.cos(th);const [ln,b,u]=g.children;ln.setAttribute('x2',bx.toFixed(2));ln.setAttribute('y2',by.toFixed(2));b.setAttribute('cx',bx.toFixed(2));b.setAttribute('cy',by.toFixed(2));u.setAttribute('x',(bx-7).toFixed(2));u.setAttribute('y',(by-7).toFixed(2))})}
function penLoop(ts){if(!PEN.t0)PEN.t0=ts-PEN.acc;PEN.acc=ts-PEN.t0;penFrame(PEN.acc/1000);PEN.raf=requestAnimationFrame(penLoop)}
function penStop(){cancelAnimationFrame(PEN.raf);PEN.raf=0;PEN.t0=0}
function penSync(){const el=$('.pend');const run=el&&PEN.vis&&!document.hidden&&!RM.matches;if(run&&!PEN.raf)PEN.raf=requestAnimationFrame(penLoop);else if(!run&&PEN.raf)penStop();if(el&&RM.matches)penFrame(3.1)}
function penObserve(){PEN.io&&PEN.io.disconnect();const el=$('.pend');if(!el){penStop();return}PEN.io=new IntersectionObserver(es=>{PEN.vis=es[0].isIntersecting;penSync()},{root:$('#sc')});PEN.io.observe(el);penFrame(PEN.acc/1000);penSync()}
document.addEventListener('visibilitychange',penSync);

/* ---------- toast stack ---------- */
function toast(t,s='',icon='checkc',undo){const box=$('#toasts');const el=document.createElement('div');el.className='toast';el.innerHTML=`${ic(icon)}<div class="tx">${t}${s?`<span>${s}</span>`:''}</div>${undo?`<button class="btn">Deshacer</button>`:''}`;
 if(undo)$('.btn',el).onclick=()=>{undo();kill()};box.appendChild(el);while(box.children.length>3)box.firstElementChild.remove();
 const tm=setTimeout(kill,5200);function kill(){clearTimeout(tm);el.classList.add('out');setTimeout(()=>el.remove(),220)}}
const soon=n=>toast(n,'Esta pantalla llega en la siguiente fase.','arrowr');

/* ---------- segmented control / tabs with sliding indicator ---------- */
function segInd(seg){if(!seg)return;const on=$('button[aria-pressed="true"]',seg),ind=$('.ind',seg);if(!on||!ind)return;ind.style.left=on.offsetLeft+'px';ind.style.width=on.offsetWidth+'px'}
function seg(id,opts,cur,act){return `<div class="seg" id="${id}" role="tablist"><span class="ind"></span>${opts.map(([k,l])=>`<button role="tab" data-act="${act}" data-arg="${k}" aria-pressed="${cur===k}" aria-selected="${cur===k}">${l}</button>`).join('')}</div>`}

/* ---------- progress ticks for a sequence ---------- */
function progressTicks(n,{id='ptk',labels=true}={}){return `<div class="ptk" id="${id}" role="tablist" aria-label="Progreso">${Array.from({length:n},(_,i)=>`<button role="tab" data-go="${i}" aria-label="Paso ${i+1}">${labels?`<span class="num">${pad(i+1)}</span>`:''}<i></i></button>`).join('')}<span class="cnt num"></span></div>`}

/* ---------- swipe deck ----------
   makeDeck(deckEl, items, {card:(item,i)=>html, isDone:id=>bool, ptk:el, onSlide:id=>void})
   Desktop: stacked plates, buttons, drag, arrow keys. Mobile: native scroll-snap. */
function makeDeck(el,items,o){const C={idx:o.start||0,el,items};
 C.layout=()=>{const cards=$$('.dk',el);if(!cards.length)return;
  if(MOB.matches){cards.forEach(c=>{c.style.height='';c.removeAttribute('data-pos');c.removeAttribute('inert');c.removeAttribute('aria-hidden')});el.style.height=''}
  else{cards.forEach((c,i)=>{const p=i-C.idx;c.dataset.pos=p<0?'prev':p>2?'far':String(p);if(p===0){c.removeAttribute('inert');c.removeAttribute('aria-hidden')}else{c.setAttribute('inert','');c.setAttribute('aria-hidden','true')}});
   const f=cards[C.idx];f.style.height='';const h=f.offsetHeight;cards.forEach((c,i)=>{if(i!==C.idx)c.style.height=h+'px'});el.style.height=(h+30)+'px'}
  if(o.ptk){$$('button',o.ptk).forEach((b,i)=>{b.classList.toggle('cur',i===C.idx);b.classList.toggle('done',!!o.isDone(items[i].id));b.setAttribute('aria-selected',i===C.idx)});const c=$('.cnt',o.ptk);if(c)c.textContent=`${C.idx+1} / ${items.length}`}
  cards.forEach((c,i)=>{const b=$('.dk-next',c);if(b)b.innerHTML=(i===items.length-1?(o.lastLabel||'Terminar'):'Siguiente')+ic('arrowr','sm')});
  o.nav&&o.nav.forEach(b=>{const st=+b.dataset.step;b.disabled=(st<0&&C.idx===0)||(st>0&&C.idx===items.length-1)})};
 C.go=(i,scroll=true)=>{C.idx=Math.max(0,Math.min(items.length-1,i));if(MOB.matches&&scroll){const c=$$('.dk',el)[C.idx];c&&el.scrollTo({left:c.offsetLeft-parseFloat(getComputedStyle(el).paddingLeft),behavior:RM.matches?'auto':'smooth'})}C.layout()};
 C.refresh=id=>{const i=items.findIndex(r=>r.id===id);const c=$(`.dk[data-id="${id}"]`,el);if(!c)return;c.innerHTML=o.card(items[i],i);bindSlides(c,o.onSlide);C.layout()};
 C.nextOpen=()=>{const t=items.findIndex((r,i)=>i>C.idx&&!o.isDone(r.id)&&!r.track);const any=items.findIndex((r,i)=>i>C.idx&&!o.isDone(r.id));return t>-1?t:any};
 el.innerHTML=items.map((r,i)=>`<article class="dk" data-id="${r.id}" aria-label="${i+1} de ${items.length}">${o.card(r,i)}</article>`).join('');
 bindSlides(el,o.onSlide);
 el.addEventListener('scroll',()=>{if(!MOB.matches)return;const pl=parseFloat(getComputedStyle(el).paddingLeft);let best=0,bd=1e9;$$('.dk',el).forEach((c,i)=>{const d=Math.abs(c.offsetLeft-pl-el.scrollLeft);if(d<bd){bd=d;best=i}});if(best!==C.idx){C.idx=best;C.layout()}},{passive:true});
 let st=null;
 el.addEventListener('pointerdown',e=>{if(MOB.matches||e.button!==0||e.target.closest('button,a,.slide,input'))return;const c=e.target.closest('.dk[data-pos="0"]');if(c)st={x:e.clientX,c,dx:0}});
 el.addEventListener('pointermove',e=>{if(!st)return;st.dx=e.clientX-st.x;if(Math.abs(st.dx)<6)return;if(!st.cap){st.c.setPointerCapture(e.pointerId);st.cap=1;st.c.classList.add('drag')}st.c.style.transform=`translateX(${st.dx}px) rotate(${st.dx/40}deg)`});
 const end=()=>{if(!st)return;const {c,dx}=st;c.classList.remove('drag');c.style.transform='';if(dx<-90)C.go(C.idx+1);else if(dx>90)C.go(C.idx-1);st=null};
 el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 requestAnimationFrame(()=>C.go(C.idx));
 return C}

/* ---------- slide to confirm ---------- */
const slideHtml=(id,label='Desliza para marcar como hecho')=>`<div class="slide" data-slide="${id}"><span class="fill"></span><span class="lab"><span class="shimmer">${label}</span></span><button class="knob" aria-label="Marcar como hecho">${ic('arrowr')}</button></div>`;
function bindSlides(root,onConfirm){$$('.slide',root).forEach(sl=>{if(sl._b)return;sl._b=1;const k=$('.knob',sl),fill=$('.fill',sl);let s=null;const max=()=>sl.clientWidth-k.offsetWidth-8;
 k.addEventListener('pointerdown',e=>{s={x:e.clientX,dx:0};k.setPointerCapture(e.pointerId);sl.classList.remove('back','nudge');e.stopPropagation()});
 k.addEventListener('pointermove',e=>{if(!s)return;s.dx=Math.max(0,Math.min(max(),e.clientX-s.x));k.style.transform=`translateX(${s.dx}px)`;fill.style.width=(s.dx+56)+'px'});
 const up=()=>{if(!s)return;const d=s.dx;s=null;if(d>=max()*.86){k.style.transform=`translateX(${max()}px)`;fill.style.width='100%';sl.classList.add('ok');$('.lab',sl).innerHTML='Hecha';setTimeout(()=>onConfirm(sl.dataset.slide),RM.matches?0:260)}else{sl.classList.add('back');k.style.transform='';fill.style.width='';if(d<4){void sl.offsetWidth;sl.classList.add('nudge')}}};
 k.addEventListener('pointerup',up);k.addEventListener('pointercancel',up);
 k.addEventListener('click',e=>{if(e.detail===0)onConfirm(sl.dataset.slide)})})}

/* ---------- Google goal scale (outcome steps: no «Marcar como hecho») ---------- */
function goalScale([a,n,gl]){/* text only: the tick scale was dropped (Denis 2026-10-26, «no aporta») */
 return `<div class="goal gline">${ic('trend','sm')}<span>Objetivo</span><b>del puesto ${n} a la página 1</b><span class="gs">Lo seguimos solos en cada foto</span></div>`}

/* ---------- navigation (routes are plug-in: SCREENS[key]) ---------- */
const NAV=[['',[['overview','Visión general','overview'],['recs','Recomendaciones','recs','34']]],['En la IA',[['prompts','Prompts','prompts','17'],['competitors','Competidores','users','4'],['citations','Páginas citadas','link'],['auditgeo','Tu web para la IA','audit','',1]]],['En Google',[['google','Posición en Google','trend'],['auditseo','Tu web para Google','audit']]],['Comercio agéntico',[['agents','Visibilidad en agentes','agent'],['agaudit','Auditoría agéntica','cart']],'new']];
const NAVFLAT=NAV.flatMap(([,it])=>it.map(([k,l,i])=>({k,l,i})));
const R={route:'overview',first:{}};
function navRender(){$('#nav').innerHTML=NAV.map(([g,items,f])=>`<div class="grp" style="margin-top:${g?14:0}px">${g?`<div class="lbl">${g}${f?'<span class="new">Nuevo</span>':''}</div>`:''}${items.map(([k,l,i,n,dot])=>`<a href="#${k}" class="nav ${R.route===k?'on':''}" ${R.route===k?'aria-current="page"':''} data-route="${k}">${ic(i)}<span>${l}</span>${n?`<span class="cnt num">${n}</span>`:''}${dot?'<span class="sd" title="Hay algo que frena"></span>':''}</a>`).join('')}</div>`).join('')}
function placeholder(k){const n=NAVFLAT.find(x=>x.k===k);return `<div class="ph-soon"><div class="eyebrow bare">${n?n.l:k}</div><h1 style="margin-top:14px">${n?n.l:'Pantalla'}</h1><p class="lead">Esta pantalla llega en la siguiente fase, con el mismo sistema.</p><div class="pills"><button class="chip" data-route="overview">${ic('arrowr','sm')}Ir a Visión general</button></div></div>`}
function render(animate=true){const pg=$('#page');const S=SCREENS[R.route];
 pg.innerHTML=S?S.render():placeholder(R.route);
 const title=S?S.title:(NAVFLAT.find(x=>x.k===R.route)||{l:'Pantalla'}).l;
 $('#crumb').textContent=title;document.title=title+' · GenScore';
 $$('#pgseg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.route===R.route));segInd($('#pgseg'));
 navRender();const first=animate&&!R.first[R.route];R.first[R.route]=1;
 armMotion(pg,first);$$('.seg',pg).forEach(segInd);
 S&&S.after&&S.after(pg,first);penObserve();edges()}
function go(k,opts={}){R.route=k;try{localStorage.setItem('gs-i-route',k)}catch(e){}if(location.hash!=='#'+k)history.replaceState(null,'','#'+k);Object.assign(U,opts.state||{});render();$('#sc').scrollTop=0;closeDrawer()}

/* ---------- progressive blur edges ---------- */
function edges(){const sc=$('#sc');$('#pbt').classList.toggle('show',sc.scrollTop>4);$('#pbb').classList.toggle('show',sc.scrollTop+sc.clientHeight<sc.scrollHeight-4)}

/* ---------- command bar ---------- */
let cSel=0,cList=[];
function cItems(){return [...NAVFLAT.map(n=>['Pantallas',n.l,n.i,()=>go(n.k)]),...CMDS,['Acciones','Cambiar de tema','moon',()=>toggleTheme()]]}
function cRender(){const q=fold($('#cq').value.trim());cList=cItems().filter(c=>fold(c[1]).includes(q));cSel=Math.min(cSel,Math.max(0,cList.length-1));
 let h='',g='';cList.forEach((c,i)=>{if(c[0]!==g){g=c[0];h+=`<div class="g">${g}</div>`}h+=`<button class="it" role="option" id="co${i}" data-ci="${i}" aria-selected="${i===cSel}">${ic(c[2])}${c[1]}${i===cSel?'<span class="k">↵</span>':''}</button>`});
 $('#clist').innerHTML=h||`<div class="empty">Nada con «${$('#cq').value}».</div>`;$('#cq').setAttribute('aria-activedescendant','co'+cSel);const s=$('#co'+cSel);s&&s.scrollIntoView({block:'nearest'})}
function cOpen(){closeNotes();closeDrawer();const c=$('#cmdk'),sc=$('#scrim');c.hidden=false;sc.hidden=false;requestAnimationFrame(()=>{c.classList.add('on');sc.classList.add('on')});$('#cq').value='';cSel=0;cRender();setTimeout(()=>$('#cq').focus(),20)}
function cClose(){const c=$('#cmdk'),sc=$('#scrim');c.classList.remove('on');sc.classList.remove('on');setTimeout(()=>{c.hidden=true;sc.hidden=true},200)}
function cRun(i){const c=cList[i];if(!c)return;cClose();setTimeout(c[3],60)}
ACT.cmdk=()=>cOpen();

/* ---------- focus layer (full-screen deck over any list) ---------- */
function openFocus(html,after){const f=$('#focus');f.hidden=false;f.innerHTML=html;document.body.classList.add('fo');requestAnimationFrame(()=>f.classList.add('on'));after&&after(f);setTimeout(()=>{const x=$('[data-act="focusclose"]',f);x&&x.focus()},60)}
function closeFocus(){const f=$('#focus');if(f.hidden)return;f.classList.remove('on');document.body.classList.remove('fo');setTimeout(()=>{f.hidden=true;f.innerHTML=''},320);U.onFocusClose&&U.onFocusClose()}
ACT.focusclose=()=>closeFocus();

/* ---------- drawer, notes, theme ---------- */
function closeDrawer(){$('#side').classList.remove('on');$('#dscrim').classList.remove('on');document.body.classList.remove('dr')}
function closeNotes(){$('#notes').classList.remove('on');$('#notesbtn').setAttribute('aria-expanded','false')}
function curTheme(){return document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function paintTheme(){const d=curTheme()==='dark';$('#thico').innerHTML=`<use href="#i-${d?'sun':'moon'}"/>`;$('#thlb').textContent=d?'Claro':'Oscuro'}
function toggleTheme(){document.documentElement.dataset.theme=curTheme()==='dark'?'light':'dark';try{localStorage.setItem('gs-i-theme',document.documentElement.dataset.theme)}catch(e){}paintTheme()}
