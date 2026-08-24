function findFirstValue(data, keys) {
  if (!data || typeof data !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = findFirstValue(item, keys);
        if (found) return found;
      }
    } else if (value && typeof value === "object") {
      const found = findFirstValue(value, keys);
      if (found) return found;
    }
  }

  return null;
}

export function normalizeCorreiosResponse(data) {
  return {
    raw: data,
    prePostageId: findFirstValue(data, [
      "idPrePostagem",
      "idPrepostagem",
      "codigoPrePostagem",
      "numeroPrePostagem",
      "id",
    ]),
    receiptId: findFirstValue(data, [
      "idRecibo",
      "idProcessamento",
      "numeroRecibo",
      "recibo",
    ]),
    trackingCode: findFirstValue(data, [
      "codigoObjeto",
      "codObjeto",
      "numeroObjeto",
      "codigoRastreio",
      "codigoRastreamento",
      "objeto",
    ]),
    status: findFirstValue(data, [
      "descStatusAtual",
      "statusAtual",
      "statusPrePostagem",
      "situacao",
      "descricaoStatus",
      "status",
    ]),
    labelUrl: findFirstValue(data, [
      "urlRotulo",
      "urlEtiqueta",
      "linkRotulo",
      "linkEtiqueta",
      "labelUrl",
      "url",
    ]),
    labelBase64: findFirstValue(data, [
      "rotuloBase64",
      "etiquetaBase64",
      "labelBase64",
      "arquivoBase64",
      "pdfBase64",
      "base64",
    ]),
  };
}

export function mergeCorreiosResults(...results) {
  const validResults = results.filter(Boolean);

  return {
    success: true,
    raw: validResults.map((result) => result.raw),
    prePostageId:
      validResults.find((result) => result.prePostageId)?.prePostageId || null,
    receiptId:
      validResults.find((result) => result.receiptId)?.receiptId || null,
    trackingCode:
      validResults.find((result) => result.trackingCode)?.trackingCode || null,
    status: validResults.find((result) => result.status)?.status || null,
    labelUrl: validResults.find((result) => result.labelUrl)?.labelUrl || null,
    labelBase64:
      validResults.find((result) => result.labelBase64)?.labelBase64 || null,
  };
}
