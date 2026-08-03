import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCorreiosResults,
  normalizeCorreiosResponse,
} from "../app/services/correios-response.server.js";

test("normalizes identifiers from a nested Correios response", () => {
  const result = normalizeCorreiosResponse({
    idRecibo: "REC-123",
    resultado: {
      idPrePostagem: "PR1234567890123456789012",
      numeroObjeto: "AA123456789BR",
      statusPrePostagem: "PRE_POSTADO",
    },
  });

  assert.equal(result.receiptId, "REC-123");
  assert.equal(result.prePostageId, "PR1234567890123456789012");
  assert.equal(result.trackingCode, "AA123456789BR");
  assert.equal(result.status, "PRE_POSTADO");
});

test("prefers explicit pre-postage identifiers over a generic id", () => {
  const result = normalizeCorreiosResponse({
    id: "generic-id",
    idPrePostagem: "prepost-id",
  });

  assert.equal(result.prePostageId, "prepost-id");
});

test("merges creation and label responses without losing identifiers", () => {
  const creation = normalizeCorreiosResponse({
    idPrePostagem: "prepost-id",
    idRecibo: "receipt-id",
  });
  const label = normalizeCorreiosResponse({
    codigoObjeto: "AA123456789BR",
    pdfBase64: "JVBERi0xLjQ=",
  });
  const result = mergeCorreiosResults(creation, label);

  assert.equal(result.prePostageId, "prepost-id");
  assert.equal(result.receiptId, "receipt-id");
  assert.equal(result.trackingCode, "AA123456789BR");
  assert.equal(result.labelBase64, "JVBERi0xLjQ=");
});
