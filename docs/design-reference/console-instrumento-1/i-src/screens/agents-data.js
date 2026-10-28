/* ================= DATA: Comercio agéntico =================
   «Visibilidad agéntica» 0–100 = Descubrimiento 30 + Comprensión 30 + Confianza 20 + Compra 20.
   Interoperabilidad goes apart as «N de 4». None of this moves the GEO Score. */
const AGX={score:66,to:79,kind:'Software',page:'/precios',
 comps:[
  {k:'discovery',n:'Descubrimiento',w:30,p:21,ico:'door',step:'Entra',purpose:'Que te encuentren y puedan entrar.',tone:'bad',line:'Tu robots.txt bloquea a Perplexity'},
  {k:'understanding',n:'Comprensión',w:30,p:24,ico:'eye',step:'Entiende',purpose:'Que entiendan lo que vendes.',tone:'warn',line:'El precio sólo aparece como texto'},
  {k:'trust',n:'Confianza',w:20,p:9,ico:'shield',step:'Se fía',purpose:'Que puedan fiarse y explicarlo.',tone:'bad',line:'No vemos tu política de cancelación o reembolso'},
  {k:'purchase',n:'Compra',w:20,p:12,ico:'cart',step:'Compra',purpose:'Que lleguen a comprar o reservar.',tone:'warn',line:'No vemos pagos rápidos'}],
 interop:{found:1,total:4,items:[['Feed de producto',1],['Catálogo por MCP',0],['Perfil UCP',0],['Tarjeta de agente A2A',0]]}};
const AGX_CHK={
 discovery:[['bad','Tu robots.txt bloquea a Perplexity','Deja pasar en robots.txt a los rastreadores de búsqueda y de usuario de cada asistente (OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot…), si quieres que puedan recomendarte y comprar.','robots.txt','User-agent: PerplexityBot\nAllow: /\n\nUser-agent: Perplexity-User\nAllow: /'],['ok','Tu web no pone retos a las visitas automáticas'],['ok','Publicas un sitemap']],
 understanding:[['warn','La página declara el producto pero no su oferta','Declara lo que vendes con datos estructurados (Product, SoftwareApplication, Service, Course o Event) con su Offer, en el HTML que sirve el servidor.','HTML','<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "SoftwareApplication",\n  "name": "Nubaria",\n  "applicationCategory": "BusinessApplication",\n  "offers": { "@type": "Offer", "price": "«precio»", "priceCurrency": "EUR" }\n}\n<\/script>'],['warn','El precio sólo aparece como texto','Declara price y priceCurrency en la Offer, con el periodo (al mes o al año) en su priceSpecification.','HTML','"priceSpecification": {\n  "@type": "UnitPriceSpecification",\n  "price": "«precio»",\n  "priceCurrency": "EUR",\n  "unitText": "MONTH"\n}'],['ok','La descripción se lee sin ejecutar JavaScript']],
 trust:[['bad','No vemos tu política de cancelación o reembolso','Enlaza tus condiciones de cancelación y reembolso desde la página, y decláralas con hasMerchantReturnPolicy si aplican.'],['warn','No vemos reseñas marcadas','Marca la valoración media con aggregateRating si tienes reseñas reales de lo que vendes.'],['ok','Enlazas aviso legal y contacto']],
 purchase:[['bad','No vemos pagos rápidos','Ofrece un pago rápido (Apple Pay, Google Pay, Shop Pay, PayPal) que un agente sepa completar.'],['ok','La página no pone captchas'],['ok','Cobras con Stripe']]};
const AGX_STEPS=[['trust','Enlaza tu política de cancelación y reembolso desde /precios'],['discovery','Deja pasar a PerplexityBot en tu robots.txt'],['purchase','Ofrece un pago rápido que un agente sepa completar']];
const AGX_PQ={chatgpt:[33,17,0],gemini:[50,33,17],claude:[33,null,0],perplexity:[50,33,0]};
U.ag={ckPlay:0,st:'ok',steps:{},inl:null};
U.aa={st:'ok',f:'all',open:'discovery:0',pick:false,left:5};

/* four-segment ring: one arc per component, sized by its weight, filled by its points */
function agxRing(size=200,{stroke=12,deep=false}={}){const r=size/2-stroke/2-2,c=size/2,C=2*Math.PI*r,gap=C*.014;let off=0;
 const segs=AGX.comps.map((x,i)=>{const L=C*x.w/100-gap,f=L*x.p/x.w;const warm=x.p/x.w<.5;
  const s=`<circle cx="${c}" cy="${c}" r="${r}" class="trk" stroke-width="${stroke}" stroke-dasharray="${L.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}"/><circle cx="${c}" cy="${c}" r="${r}" class="fil ${warm?'warm':''}" stroke-width="${stroke}" stroke-dasharray="${f.toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" style="--f:${f.toFixed(1)}px;--C:${C.toFixed(1)}px;--k:${i}"/>`;off+=L+gap;return s}).join('');
 return `<span class="agx-ring blit ${deep?"ondeep":""}" style="width:${size}px;height:${size}px" role="img" aria-label="Visibilidad agéntica ${AGX.score} de 100: ${AGX.comps.map(x=>`${x.n} ${x.p} de ${x.w}`).join(', ')}"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><g transform="rotate(-90 ${c} ${c})">${segs}</g></svg><span class="n"><b class="num">${roll(AGX.score)}</b><small>de 100</small></span></span>`}
function agxUpsell(t){return `<div class="card agx-up"><div class="card-b"><span class="ic">${ic('agent')}</span><div><h2>${t} está en Pro y Agencia</h2><p>Mira si la IA te nombra cuando alguien va a comprar, o si le manda a un marketplace, junto a lo que ve un agente en tu web.</p><button class="btn ink" data-act="agxPro">${ic('arrowup','sm')}Pasar a Pro</button></div></div></div>`}
ACT.agxPro=()=>toast('Prueba de Pro.','Te llevamos a elegir plan.','arrowr');
