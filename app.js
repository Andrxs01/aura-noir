"use strict";
const UVT = 52374;
const $ = s => document.querySelector(s);
const fmt = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Math.round(n));
const pct = n => (n*100).toFixed(n*100%1?2:1).replace(".",",")+"%";
const parse = s => Number(String(s).replace(/[^\d]/g,"")) || 0;
const IVA = .19, INC = .08, GMF = .004, ICA = .01104, ICA_RET_LIMP = .00966, AVISOS = .15;
const FONDO = 2000000, TOPE_CAJA = 1400000;

// Configuración por tipo de operación. "s" = cuenta supuesta (no está en el PUC del proyecto).
const T = {
  compra:{n:"Compra de bienes",soporte:"Factura electrónica de venta del proveedor (y documento soporte si el proveedor no está obligado a facturar).",base:27*UVT,bu:"27 UVT",rD:.025,rN:.035,ret:["236555","Retefuente compras"],deb:["143505","Mercancías no fabricadas por la empresa (supuesto)"],iva:["24081001","IVA descontable bienes"]},
  servicio:{n:"Servicio general",soporte:"Factura electrónica o documento soporte en adquisiciones a no obligados a facturar.",base:4*UVT,bu:"4 UVT",rD:.04,rN:.06,ret:["23652504","Retefuente servicios"],deb:["513595","Gasto por servicios (supuesto)"],iva:["24081002","IVA descontable servicios"]},
  limpieza:{n:"Servicio de limpieza",soporte:"Factura electrónica del prestador; su RUT confirma CIIU 8121 y si es declarante.",base:4*UVT,bu:"4 UVT",rD:.04,rN:.06,ret:["23652504","Retefuente servicios"],deb:["513595","Gasto por servicios (supuesto)"],iva:["24081002","IVA descontable servicios"],reteica:true},
  honorarios:{n:"Honorarios",soporte:"Cuenta de cobro o factura electrónica; RUT del tercero.",base:0,bu:"sin base mínima (supuesto)",rD:.11,rN:.11,ret:["23652001","Retefuente honorarios"],deb:["511025","Honorarios (supuesto)"],iva:["24081002","IVA descontable servicios"]},
  arriendo:{n:"Arrendamiento de inmueble",soporte:"Contrato de arrendamiento y factura o cuenta de cobro del arrendador.",base:27*UVT,bu:"27 UVT",rD:.035,rN:.035,ret:["23654002","Retefuente arrendamientos"],deb:["512010","Arrendamientos (supuesto)"],iva:["24081002","IVA descontable servicios"]},
  restaurante:{n:"Consumo en restaurante",soporte:"Factura electrónica o tiquete POS con discriminación del impuesto al consumo.",base:0,rD:0,rN:0,ret:null,deb:["519595","Gastos diversos – incluye INC 8% (supuesto)"],iva:null},
  venta:{n:"Venta de cosméticos",soporte:"Factura electrónica de venta emitida por AURA & NOIR (resolución DIAN vigente).",base:27*UVT,bu:"27 UVT",rD:.025,rN:.025,ret:null,deb:null,iva:["24080501","IVA generado bienes"]},
  rendimientos:{n:"Rendimientos financieros",soporte:"Certificado de rendimientos y retención del banco.",base:0,bu:"sin base mínima",rD:.07,rN:.07,ret:["13551501","Anticipo retefuente"],deb:null,iva:null}
};
const PAGO = {cxp:["23050501","Cuentas por pagar"],banco:["11100501","Bancos"],caja:["11051001","Caja menor"]};

let ultimo = null;
const store = { get:()=>{try{return JSON.parse(localStorage.getItem("an_tx")||"[]")}catch(e){return[]}}, set:v=>{try{localStorage.setItem("an_tx",JSON.stringify(v))}catch(e){}} };

function calc(i){
  const c = T[i.tipo], r = {i, c, notas:[], dudas:[], sup:[], ret:[], asiento:[]};
  const m = i.monto;
  r.base = m;
  // Impuesto
  r.impuesto = 0; r.impNombre = null;
  if(i.tipo==="restaurante"){ r.impuesto = m*INC; r.impNombre="Impuesto nacional al consumo 8%"; r.sup.push("El INC se carga al gasto: no genera IVA descontable. Se asume que el restaurante es responsable del INC."); r.dudas.push("¿La factura discrimina INC 8% o IVA? La factura/RUT del restaurante lo define; si cobra IVA, usa la opción de servicio general."); }
  else if(i.iva && c.iva){ r.impuesto = m*IVA; r.impNombre = (i.tipo==="venta"?"IVA generado":"IVA descontable")+" 19%"; }
  // Retenciones
  if(i.tipo==="venta"){
    if(i.cliRet){
      const ap = m>=c.base ? m*c.rD : 0;
      r.ret.push({nom:"Retefuente que nos practican (anticipo)",acct:["13551501","Anticipo retefuente"],base:c.base,bu:"27 UVT",tar:c.rD,val:ap,aplica:m>=c.base,form:`${fmt(m)} × ${pct(c.rD)}`});
      const ri = r.impuesto*.15;
      r.ret.push({nom:"ReteIVA que nos practican (anticipo)",acct:["13551701","Anticipo ReteIVA"],base:0,bu:"sin base mínima (supuesto)",tar:.15,val:ri,aplica:r.impuesto>0,form:`${fmt(r.impuesto)} × 15%`});
      r.sup.push("Se usa la tarifa de compras (2,5%) y 27 UVT para la retefuente del cliente. ReteICA del cliente no se calcula: depende de su actividad y ciudad; pídele el certificado.");
    }
  } else if(i.tipo==="rendimientos"){
    r.ret.push({nom:"Retefuente sobre rendimientos (anticipo)",acct:c.ret,base:0,bu:c.bu,tar:.07,val:m*.07,aplica:true,form:`${fmt(m)} × 7%`});
  } else if(c.ret){
    let tar = i.decl==="si"?c.rD:c.rN;
    if(i.tipo==="honorarios"){ tar=.11; if(i.pj==="pn"){ r.dudas.push("Honorarios a persona natural: la tarifa puede variar según sus ingresos y el contrato. El RUT y la cuenta de cobro lo resuelven; se aplicó 11% como supuesto."); } }
    if(i.tipo==="arriendo") r.sup.push("El arrendamiento de inmuebles se trata sin IVA por defecto; marca la casilla solo si la factura lo discrimina.");
    const ap = m>=c.base;
    r.ret.push({nom:c.ret[1],acct:c.ret,base:c.base,bu:c.bu,tar,val:ap?m*tar:0,aplica:ap,form:ap?`${fmt(m)} × ${pct(tar)}`:`Subtotal ${fmt(m)} < base ${fmt(c.base)}: no aplica`});
    if(["compra","servicio","limpieza"].includes(i.tipo)) r.dudas.push(`La tarifa (${pct(c.rD)} declarante / ${pct(c.rN)} no declarante) depende de si el tercero declara renta. El RUT o la declaración lo confirma.`);
    if(c.reteica){
      const ap2 = m>=4*UVT;
      r.ret.push({nom:"ReteICA servicios de limpieza",acct:["23682504","ReteICA servicios"],base:4*UVT,bu:"4 UVT (supuesto: verificar en Bogotá)",tar:ICA_RET_LIMP,val:ap2?m*ICA_RET_LIMP:0,aplica:ap2,form:ap2?`${fmt(m)} × 9,66 por mil`:"No alcanza la base"});
    }
  }
  r.totRet = r.ret.reduce((a,x)=>a+x.val,0);
  // Neto
  if(i.tipo==="venta"){ r.neto = m + r.impuesto - r.totRet; r.netoLbl="Valor neto a cobrar"; }
  else if(i.tipo==="rendimientos"){ r.neto = m - r.totRet; r.netoLbl="Valor neto a cobrar (abono en banco)"; }
  else { r.neto = m + r.impuesto - r.totRet; r.netoLbl="Valor neto a pagar"; }
  // Asiento
  const A = r.asiento;
  if(i.tipo==="venta"){
    r.ret.forEach(x=>{ if(x.val) A.push([...x.acct,x.val,0]); });
    const cob = i.pago==="banco"?["11100501","Bancos"]:["130505","Clientes (supuesto)"];
    A.push([...cob,r.neto,0]);
    A.push(["413595","Ingresos por venta de cosméticos (supuesto)",0,m]);
    if(r.impuesto) A.push([...c.iva,0,r.impuesto]);
    r.notas.push("En ventas el cobro se registra en Bancos si es de contado; si es a crédito, en Clientes.");
  } else if(i.tipo==="rendimientos"){
    A.push(["11100501","Bancos",r.neto,0]);
    if(r.totRet) A.push([...c.ret,r.totRet,0]);
    A.push(["421005","Ingresos financieros – intereses (supuesto)",0,m]);
  } else {
    A.push([...c.deb,m + (i.tipo==="restaurante"?r.impuesto:0),0]);
    if(i.tipo!=="restaurante" && r.impuesto) A.push([...c.iva,r.impuesto,0]);
    r.ret.forEach(x=>{ if(x.val) A.push([...x.acct,0,x.val]); });
    A.push([...PAGO[i.pago],0,r.neto]);
    if(i.tipo==="restaurante") r.neto = m + r.impuesto;
  }
  r.debe = A.reduce((a,x)=>a+x[2],0); r.haber = A.reduce((a,x)=>a+x[3],0);
  if(i.tipo==="restaurante"){ r.netoLbl="Valor neto a pagar (subtotal + INC)"; }
  // Notas finales
  if(i.pago==="caja" && i.tipo!=="venta" && i.tipo!=="rendimientos"){
    r.notas.push(`Caja menor: fondo ${fmt(FONDO)}; los gastos del mes no deben pasar de ${fmt(TOPE_CAJA)} (70%). Esta operación equivale al ${(r.neto/TOPE_CAJA*100).toFixed(0)}% de ese tope.`);
    if(r.neto>TOPE_CAJA) r.dudas.push("Esta operación por sí sola supera el tope mensual de caja menor: pásala por Bancos o cuentas por pagar.");
  }
  if(i.pago==="banco" && i.tipo!=="venta") r.notas.push(`GMF informativo si el pago sale de la cuenta bancaria: ${fmt(r.neto)} × 4 por mil = ${fmt(r.neto*GMF)}.`);
  if(i.tipo!=="venta" && i.tipo!=="rendimientos") r.notas.push("ReteIVA (15% del IVA) no se calcula: solo aplica a agentes designados y no consta que AURA & NOIR lo sea.");
  return r;
}

function renderCalc(r){
  const {i,c}=r;
  let h=`<h3>1. Tipo de operación y soporte</h3><p><span class="tag">${c.n}</span> ${c.soporte}</p>`;
  h+=`<h3>2. Base gravable</h3><p>Subtotal sin IVA: <b>${fmt(r.base)}</b>${i.fecha?` · fecha ${i.fecha}`:""}</p>`;
  if(r.impNombre) h+=`<p>${r.impNombre}: ${fmt(r.base)} × ${i.tipo==="restaurante"?"8%":"19%"} = <b>${fmt(r.impuesto)}</b></p>`;
  h+=`<h3>3. Retenciones y 4. Valor calculado</h3>`;
  if(!r.ret.length) h+=`<p class="muted">No hay retención aplicable en esta operación con los parámetros de la empresa.</p>`;
  else h+=`<table><tr><th>Concepto</th><th>Base mínima</th><th class="n">Tarifa</th><th>Fórmula</th><th class="n">Valor</th></tr>`+r.ret.map(x=>`<tr><td>${x.nom}</td><td>${x.bu}${x.base?` (${fmt(x.base)})`:""}</td><td class="n">${x.tar===ICA_RET_LIMP?"9,66‰":pct(x.tar)}</td><td class="formula">${x.form}</td><td class="n">${fmt(x.val)}</td></tr>`).join("")+`</table>`;
  h+=`<h3>5. Asiento contable</h3><table><tr><th>Cuenta</th><th>Nombre</th><th class="n">Débito</th><th class="n">Crédito</th></tr>`+r.asiento.map(a=>`<tr><td>${a[0]}</td><td>${a[1]}</td><td class="n">${a[2]?fmt(a[2]):""}</td><td class="n">${a[3]?fmt(a[3]):""}</td></tr>`).join("")+`<tr class="tot"><td colspan="2">Sumas iguales</td><td class="n">${fmt(r.debe)}</td><td class="n">${fmt(r.haber)}</td></tr></table>`;
  h+=`<p>${r.netoLbl}</p><div class="big">${fmt(r.neto)}</div>`;
  r.notas.forEach(n=>h+=`<div class="ok">${n}</div>`);
  if(r.dudas.length){ h+=`<h3>Dudas y documento que las resuelve</h3>`; r.dudas.forEach(n=>h+=`<div class="warn">${n}</div>`); }
  if(r.sup.length){ h+=`<h3>Supuestos</h3>`; r.sup.forEach(n=>h+=`<div class="warn">${n}</div>`); }
  h+=`<p class="muted">Herramienta de apoyo formativo; no reemplaza a un contador público.</p>`;
  $("#out").innerHTML=h;
}

function ajustarForm(){
  const t=$("#tipo").value, c=T[t];
  $("#lDecl").style.display = ["compra","servicio","limpieza"].includes(t)?"block":"none";
  $("#lPj").style.display = t==="honorarios"?"block":"none";
  $("#lIva").style.display = ["restaurante","rendimientos"].includes(t)?"none":"flex";
  $("#iva").checked = t!=="arriendo";
  $("#lRet").style.display = t==="venta"?"flex":"none";
  $("#lPago").style.display = t==="rendimientos"?"none":"block";
  const p=$("#pago"); 
  if(t==="venta"){ p.innerHTML='<option value="cxc">A crédito (clientes)</option><option value="banco">De contado (Bancos)</option>'; }
  else p.innerHTML='<option value="cxp">A crédito (cuentas por pagar)</option><option value="banco">Bancos</option><option value="caja">Caja menor</option>';
}

// ---------- Informe ----------
function informe(){
  const mes=$("#mes").value; const tx=store.get().filter(x=>x.i.fecha.startsWith(mes));
  if(!tx.length){ $("#repOut").innerHTML=`<p class="muted">No hay transacciones guardadas en ${mes||"el periodo"}. Calcula operaciones en la pestaña <b>Transacción</b> y pulsa <b>Guardar en el informe</b>.</p>`; return; }
  let gen=0,desc=0,ventas=0,caja=0; const rets={}, ant={}, compras=[];
  tx.forEach(x=>{
    const t=x.i.tipo;
    if(t==="venta"){ gen+=x.impuesto; ventas+=x.base; x.ret.forEach(r=>{ant[r.nom]=(ant[r.nom]||0)+r.val;}); }
    else if(t==="rendimientos"){ x.ret.forEach(r=>{ant[r.nom]=(ant[r.nom]||0)+r.val;}); }
    else { if(t!=="restaurante") desc+=x.impuesto; x.ret.forEach(r=>{rets[r.nom]=(rets[r.nom]||0)+r.val;}); if(x.i.pago==="caja") caja+=x.neto; }
  });
  const saldo=gen-desc, tr=Object.values(rets).reduce((a,b)=>a+b,0);
  const ica=ventas*ICA, av=ica*AVISOS;
  let h=`<h3>(a) Resumen del periodo ${mes}</h3><table>
  <tr><td>Transacciones registradas</td><td class="n">${tx.length}</td></tr>
  <tr><td>Ventas (subtotal sin IVA)</td><td class="n">${fmt(ventas)}</td></tr>
  <tr><td>Retenciones practicadas a terceros</td><td class="n">${fmt(tr)}</td></tr>
  <tr><td>Gastos pagados con caja menor</td><td class="n">${fmt(caja)} de ${fmt(TOPE_CAJA)}</td></tr></table>`;
  h+=`<h3>(b) IVA</h3><table><tr><th>Concepto</th><th>Cuenta</th><th class="n">Valor</th></tr>
  <tr><td>IVA generado</td><td>24080501 / 24080502</td><td class="n">${fmt(gen)}</td></tr>
  <tr><td>IVA descontable</td><td>24081001 / 24081002</td><td class="n">${fmt(desc)}</td></tr>
  <tr class="tot"><td>${saldo>=0?"Saldo a pagar":"Saldo a favor"}</td><td></td><td class="n">${fmt(Math.abs(saldo))}</td></tr></table>`;
  h+=`<h3>(c) Retenciones practicadas por concepto</h3>`;
  h+= Object.keys(rets).length? `<table>`+Object.entries(rets).map(([k,v])=>`<tr><td>${k}</td><td class="n">${fmt(v)}</td></tr>`).join("")+`<tr class="tot"><td>Total a declarar y pagar</td><td class="n">${fmt(tr)}</td></tr></table>`:`<p class="muted">Sin retenciones practicadas.</p>`;
  if(Object.keys(ant).length) h+=`<p><b>Retenciones que nos practicaron (anticipos):</b></p><table>`+Object.entries(ant).map(([k,v])=>`<tr><td>${k}</td><td class="n">${fmt(v)}</td></tr>`).join("")+`</table>`;
  h+=`<h3>(d) Obligaciones y fechas</h3><table>
  <tr><td>Retención en la fuente (formulario 350)</td><td>Mensual</td></tr>
  <tr><td>IVA (formulario 300)</td><td>Periodicidad por ingresos del año anterior: <b>confirmar</b> (bimestral o cuatrimestral)</td></tr>
  <tr><td>ICA y Avisos y Tableros (RIT Bogotá)</td><td>Según calendario distrital: <b>confirmar</b></td></tr>
  <tr><td>Renta personas jurídicas 35%</td><td>Anual, según calendario DIAN</td></tr>
  <tr><td>Facturación electrónica y contabilidad</td><td>Permanente</td></tr></table>
  <p class="muted">No se inventan fechas: ubícalas en el calendario tributario DIAN 2026 con el último dígito del NIT (2, sin dígito de verificación 5) y en el calendario de la Secretaría de Hacienda de Bogotá.</p>`;
  h+=`<h3>(e) Observaciones</h3>`;
  const ob=[];
  ob.push(`ICA estimado sobre ventas del periodo (referencia 11,04 por mil, verificar): ${fmt(ica)}; avisos y tableros 15% del ICA: ${fmt(av)}.`);
  if(caja>TOPE_CAJA) ob.push(`La caja menor superó el tope mensual del 70% (${fmt(TOPE_CAJA)}).`);
  if(saldo<0) ob.push("El IVA descontable supera al generado: queda saldo a favor para el siguiente periodo.");
  ob.push("Las cuentas de gasto, ingreso, inventario y clientes son supuestos: no están en el PUC del proyecto.");
  ob.push("Cifras construidas solo con las transacciones guardadas en este navegador.");
  h+=ob.map(o=>`<div class="ok">${o}</div>`).join("");
  $("#repOut").innerHTML=h;
}

function parametros(){
  const rows=[["UVT 2026",fmt(UVT)],["Renta personas jurídicas","35%"],["IVA general","19%"],["Impuesto al consumo restaurantes","8%"],["GMF","4 por mil"],
  ["Retefuente compras",`base 27 UVT (${fmt(27*UVT)}) · 2,5% declarante / 3,5% no declarante`],["Retefuente servicios",`base 4 UVT (${fmt(4*UVT)}) · 4% / 6%`],["Honorarios personas jurídicas","11%"],["Arrendamiento inmuebles",`3,5% · base 27 UVT`],["Rendimientos financieros","7%"],["ReteIVA","15% del IVA, solo agentes designados"],["ICA Bogotá CIIU 4773","11,04 por mil (referencia, verificar)"],["ReteICA limpieza CIIU 8121","9,66 por mil"],["Avisos y tableros","15% del ICA"],["Caja menor",`fondo ${fmt(FONDO)} · tope mensual ${fmt(TOPE_CAJA)}`]];
  $("#parOut").innerHTML=`<table>`+rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")+`</table>
  <p class="muted">Cuentas del PUC: IVA generado 24080501/24080502 · IVA descontable 24081001/24081002 · Retefuente servicios 23652504 · honorarios 23652001 · arrendamientos 23654002 · compras 236555 · ReteICA 23682504 · Anticipos 13551501/13551701/13551801 · Bancos 11100501 · Caja menor 11051001 · Cuentas por pagar 23050501.</p>`;
}

// ---------- Chat ----------
async function enviar(e){
  e.preventDefault(); const q=$("#q").value.trim(); if(!q) return; $("#q").value="";
  const log=$("#log"); const add=(t,c)=>{const d=document.createElement("div");d.className="msg "+c;d.textContent=t;log.appendChild(d);log.scrollTop=1e9;return d};
  add(q,"u"); hist.push({role:"user",content:q}); const w=add("…","a");
  try{
    const r=await fetch("/.netlify/functions/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:hist})});
    const j=await r.json(); if(!r.ok) throw new Error(j.error||r.status);
    w.textContent=j.text; hist.push({role:"assistant",content:j.text});
  }catch(err){ hist.pop(); w.textContent=localAnswer(q); }
}
const hist=[];


// ---------- Modo sin IA: responde con las reglas de la empresa ----------
function localAnswer(q){
  const t=q.toLowerCase(), nums=(q.match(/\d[\d.,]*/g)||[]).map(parse).filter(n=>n>=1000), monto=nums[0]||0;
  const tipos=[["limpieza","limpieza"],["honorario","honorarios"],["arrend","arriendo"],["restaurante","restaurante"],["rendimiento","rendimientos"],["vend","venta"],["venta","venta"],["servicio","servicio"],["compr","compra"]];
  const tp=tipos.find(x=>t.includes(x[0]));
  const cab="(Modo sin IA: respuesta calculada con las reglas de la empresa)\n\n";
  if(tp&&monto){
    const r=calc({tipo:tp[1],monto,fecha:"",decl:/no declarante|no es declarante/.test(t)?"no":"si",pj:/persona natural/.test(t)?"pn":"pj",iva:!/sin iva|no causa iva/.test(t)&&tp[1]!=="arriendo",cliRet:/retenedor|nos retiene|nos practica/.test(t),pago:/caja menor/.test(t)?"caja":/banco/.test(t)?"banco":(tp[1]==="venta"?"cxc":"cxp")});
    let s=cab+`${r.c.n} por ${fmt(monto)} (subtotal sin IVA)\nSoporte: ${r.c.soporte}\n`;
    if(r.impNombre) s+=`${r.impNombre}: ${fmt(r.impuesto)}\n`;
    r.ret.forEach(x=>s+=`${x.nom}: ${x.form} = ${fmt(x.val)} (base mínima: ${x.bu})\n`);
    if(!r.ret.length) s+="Retención: no aplica con los parámetros de la empresa.\n";
    s+=`${r.netoLbl}: ${fmt(r.neto)}\n\nAsiento:\n`+r.asiento.map(x=>`${x[0]} ${x[1]}  D: ${x[2]?fmt(x[2]):"-"}  C: ${x[3]?fmt(x[3]):"-"}`).join("\n");
    if(r.dudas.length) s+="\n\nDudas: "+r.dudas.join(" ");
    return s+"\n\nSupuesto: si el tercero no se indicó como \"no declarante\", se usó la tarifa de declarante. Para ver todo en tablas usa la pestaña Transacción.";
  }
  const faq=[
   [/caja menor/,`Caja menor: fondo ${fmt(FONDO)} (acta 001 del 15-05-2026). Responsable: Gisell Tatiana Suarez Padilla; autoriza la representante legal Ghyesell Ariana Clavijo Daza. Los gastos del mes no deben pasar de ${fmt(TOPE_CAJA)} (70%). Gasto: débito a la cuenta de gasto (y IVA descontable) / crédito 11051001 Caja menor. Reembolso: débito 11051001 / crédito Bancos 11100501.`],
   [/reteica|rete ica/,`ReteICA servicios de limpieza (CIIU 8121): 9,66 por mil sobre el subtotal sin IVA, cuenta 23682504. La base mínima en Bogotá debe verificarse (se usó 4 UVT como supuesto). El RUT del prestador confirma su CIIU.`],
   [/reteiva|rete iva/,"ReteIVA: 15% del IVA y solo lo practican agentes designados. No consta que AURA & NOIR lo sea, por eso no se calcula en pagos. Si un cliente agente nos retiene, se registra en 13551701 Anticipo ReteIVA."],
   [/gmf|4 por mil|4x1000/,`GMF: 4 por mil sobre los movimientos financieros. Ejemplo: sobre ${fmt(10000000)} son ${fmt(10000000*GMF)}.`],
   [/uvt/,`UVT 2026 = ${fmt(UVT)}. 27 UVT = ${fmt(27*UVT)} (base de compras y arriendos); 4 UVT = ${fmt(4*UVT)} (base de servicios).`],
   [/avisos|\bica\b/,"ICA Bogotá CIIU 4773: 11,04 por mil sobre ingresos (referencia; verificar). Avisos y tableros: 15% del ICA. Se declara en el RIT de la Secretaría de Hacienda de Bogotá."],
   [/renta/,"Impuesto de renta de personas jurídicas: 35% (régimen ordinario). La declaración es anual."],
   [/iva/,"IVA general: 19%. IVA generado: 24080501 (bienes) y 24080502 (servicios). IVA descontable: 24081001 y 24081002. El saldo es generado menos descontable."],
   [/declarante/,"El tercero declarante paga menor retención (compras 2,5% y servicios 4%). El no declarante, mayor (3,5% y 6%). Se confirma con su RUT."],
   [/anticipo/,"Los anticipos son retenciones que nos practican: retefuente 13551501, ReteIVA 13551701 y ReteICA 13551801. Se registran como activo y se descuentan al declarar."]
  ];
  const f=faq.find(x=>x[0].test(t)); if(f) return cab+f[1];
  return cab+"No tengo ese dato en las reglas de la empresa. Puedo calcular si me das el tipo y el valor. Ejemplo: \"compra de 3.000.000 a un no declarante\" o \"servicio de limpieza de 800.000\". También puedo explicar caja menor, ReteICA, ReteIVA, GMF, UVT, ICA, renta, IVA o anticipos.";
}

// ---------- Eventos ----------
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab,.panel").forEach(x=>x.classList.remove("on"));b.classList.add("on");$("#"+b.dataset.t).classList.add("on");});
$("#tipo").onchange=ajustarForm;
$("#monto").oninput=e=>{const v=parse(e.target.value); e.target.value=v?v.toLocaleString("es-CO"):"";};
$("#f").onsubmit=e=>{e.preventDefault();
  const i={tipo:$("#tipo").value,desc:$("#desc").value,monto:parse($("#monto").value),fecha:$("#fecha").value,decl:$("#decl").value,pj:$("#pj").value,iva:$("#iva").checked,cliRet:$("#cliRet").checked,pago:$("#pago").value};
  if(!i.monto){ $("#out").innerHTML='<div class="warn">Ingresa un subtotal sin IVA mayor que cero.</div>'; return; }
  ultimo=calc(i); renderCalc(ultimo); $("#guardar").disabled=false; };
$("#guardar").onclick=()=>{ if(!ultimo) return; const s=store.get(); s.push(ultimo); store.set(s); $("#guardar").disabled=true; $("#guardar").textContent="Guardado ✓"; setTimeout(()=>$("#guardar").textContent="Guardar en el informe",1500); };
$("#gen").onclick=informe; $("#imp").onclick=()=>window.print();
$("#borrar").onclick=()=>{ if(confirm("¿Borrar todas las transacciones guardadas?")){ store.set([]); informe(); } };
$("#cf").onsubmit=enviar;
const hoy=new Date().toISOString().slice(0,10); $("#fecha").value=hoy; $("#mes").value=hoy.slice(0,7);
ajustarForm(); parametros();
