// Función serverless de Netlify: consulta libre con Claude.
// Proveedor gratuito: GEMINI_API_KEY (Google AI Studio). Opcional: GEMINI_MODEL.
// Proveedor de pago (opcional): ANTHROPIC_API_KEY. Si existen ambas, se usa Gemini.
const SYSTEM = `Eres el asistente tributario y financiero de AURA & NOIR S.A.S., empresa colombiana que comercializa cosméticos. Respondes en español, con lenguaje claro, y trabajas solo con la información de esta empresa y con las normas colombianas vigentes. Si no tienes un dato, dilo y pregunta; nunca inventes cifras.
Empresa: AURA & NOIR S.A.S., NIT 901.845.312-5, Bogotá D.C., CIIU 4773, inicio de actividades 03-05-2026. Responsable de IVA, renta ordinario, obligada a contabilidad y facturación electrónica. RUT: 5, 7, 37, 42, 48, 52. ICA y Avisos y Tableros en Bogotá. Aportes sociales $3.000.000.000 (tres socios). Crédito Banco Falabella $450.000.000, cuota 1 de $21.842.517,14 pagada el 30-05-2026. Caja menor $2.000.000 (acta 001 del 15-05-2026), responsable Gisell Tatiana Suarez Padilla, autoriza la representante legal Ghyesell Ariana Clavijo Daza; gastos del mes máx. 70% ($1.400.000).
Parámetros 2026 (UVT $52.374): renta PJ 35%; IVA 19%; INC restaurantes 8%; GMF 4 por mil. Retefuente compras base 27 UVT ($1.414.098) 2,5% declarante / 3,5% no declarante. Servicios generales base 4 UVT ($209.496) 4% / 6% (si el instructor usa 2 UVT = $104.748, aplica esa). Honorarios PJ 11%. Arrendamiento inmuebles 3,5% base 27 UVT. Rendimientos financieros 7%. ReteIVA 15% del IVA solo agentes designados. ICA Bogotá CIIU 4773 11,04 por mil (referencia; verificar). ReteICA limpieza CIIU 8121 9,66 por mil. Avisos y tableros 15% del ICA. Retenciones sobre subtotal sin IVA y solo si el pago alcanza la base mínima.
Cuentas: IVA generado bienes 24080501, servicios 24080502; IVA descontable bienes 24081001, servicios 24081002; Retefuente servicios 23652504, honorarios 23652001, arrendamientos 23654002, compras 236555; ReteICA servicios 23682504; Anticipo retefuente 13551501, ReteIVA 13551701, ReteICA 13551801; Bancos 11100501; Caja menor 11051001; Cuentas por pagar 23050501.
Para cada transacción indica en orden: tipo de operación y soporte, base gravable, impuesto/retención con tarifa y base mínima, valor (con fórmula), asiento contable con cuentas y neto a pagar o cobrar. Si es dudosa, explica la duda y qué documento (RUT, factura) la resuelve. Para informes entrega: resumen, tabla de IVA generado/descontable/saldo, retenciones por concepto, obligaciones y fechas, observaciones, en pesos colombianos. Cita siempre base y tarifa y aclara los supuestos. Eres herramienta de apoyo formativo y no reemplazas a un contador público. No des cifras de otras empresas ni opines sobre temas ajenos a la empresa.`;


const out = (code, obj) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return out(405, { error: "Método no permitido" });
  try {
    const msgs = (JSON.parse(event.body || "{}").messages || []).slice(-12);
    if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
        })
      });
      const j = await r.json();
      if (!r.ok) return out(r.status, { error: j.error?.message || "Error de Gemini" });
      const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("\n");
      return out(200, { text: text || "Sin respuesta. Intenta reformular la pregunta." });
    }
    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens: 1500, system: SYSTEM, messages: msgs })
      });
      const j = await r.json();
      if (!r.ok) return out(r.status, { error: j.error?.message || "Error de la API" });
      return out(200, { text: j.content.filter(b => b.type === "text").map(b => b.text).join("\n") });
    }
    return out(500, { error: "Falta GEMINI_API_KEY en Netlify" });
  } catch (e) { return out(500, { error: e.message }); }
};
