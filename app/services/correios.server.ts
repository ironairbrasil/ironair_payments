import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
  applyFreeShippingToOptions,
  getStateFromCep,
  isBrazilState,
} from "./free-shipping.server";
import {
  mergeCorreiosResults,
  normalizeCorreiosResponse,
} from "./correios-response.server";

const CORREIOS_ENV_KEYS = [
  "CORREIOS_USER",
  "CORREIOS_ACCESS_CODE",
  "CORREIOS_QUOTE_ACCESS_CODE",
  "CORREIOS_POSTAGE_ACCESS_CODE",
  "CORREIOS_CONTRACT",
  "CORREIOS_POSTING_CARD",
  "CORREIOS_DR",
  "CORREIOS_ORIGIN_CEP",
  "CORREIOS_PAC_CODE",
  "CORREIOS_SEDEX_CODE",
  "CORREIOS_PREPOSTAGE_PATH",
  "CORREIOS_LABEL_PATH",
  "CORREIOS_SENDER_NAME",
  "CORREIOS_SENDER_EMAIL",
  "CORREIOS_SENDER_PHONE",
  "CORREIOS_SENDER_DOCUMENT",
  "CORREIOS_SENDER_STREET",
  "CORREIOS_SENDER_NUMBER",
  "CORREIOS_SENDER_COMPLEMENT",
  "CORREIOS_SENDER_NEIGHBORHOOD",
  "CORREIOS_SENDER_CITY",
  "CORREIOS_SENDER_STATE",
];

const FALLBACK_PACKAGE = {
  weightKg: 4,
  lengthCm: 40,
  widthCm: 30,
  heightCm: 35,
};
const CORREIOS_BASE_URL = "https://api.correios.com.br";
const TOKEN_REFRESH_SKEW_MS = 60_000;

type CorreiosConfig = {
  user: string;
  accessCode: string;
  contract: string;
  authNumber: string;
  tokenAuthPath: string;
  postingCard: string | null;
  dr: string | null;
  originCep: string;
};

type CorreiosTokenScope = "quote" | "postage";

type CorreiosTokenCache = {
  token: string;
  expiresAt: number;
};

type CorreiosPackage = {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type CorreiosQuoteItem = {
  description?: unknown;
  value?: unknown;
  quantity?: unknown;
  weight?: unknown;
  weightKg?: unknown;
  weightGrams?: unknown;
  grams?: unknown;
  length?: unknown;
  lengthCm?: unknown;
  width?: unknown;
  widthCm?: unknown;
  height?: unknown;
  heightCm?: unknown;
};

type CorreiosShippingOption = {
  carrier: "Correios";
  service: "PAC" | "SEDEX";
  serviceCode: string;
  price: number;
  originalPrice?: number;
  isFreeShipping?: boolean;
  freeShippingState?: string;
  promotionLabel?: string;
  title?: string;
  deadlineDays: number;
};

export type CorreiosQuoteResult = {
  success: true;
  options: CorreiosShippingOption[];
  destinationAddress: CorreiosCepAddress | null;
};

export type CorreiosCepAddress = {
  cep: string;
  uf: string;
  localidade: string;
  logradouro: string;
  bairro: string;
};

type CorreiosAddress = {
  postalCode: unknown;
  address1: unknown;
  number: unknown;
  complement?: unknown;
  neighborhood: unknown;
  city: unknown;
  provinceCode: unknown;
};

type CorreiosPerson = {
  name: unknown;
  cpfCnpj?: unknown;
  phone?: unknown;
  email?: unknown;
  address: CorreiosAddress;
};

type CorreiosPrePostageInput = {
  customer: CorreiosPerson;
  serviceCode: unknown;
  service?: unknown;
  items?: CorreiosQuoteItem[];
  nfe?: { accessKey: string | null; sent: boolean; reason: string | null };
};

export type CorreiosPrePostageResult = {
  success: true;
  raw: unknown;
  prePostageId: string | null;
  receiptId: string | null;
  trackingCode: string | null;
  status: string | null;
  labelUrl: string | null;
  labelBase64: string | null;
};

type CorreiosTrackingEvent = {
  date: string | null;
  description: string;
  detail: string | null;
  location: string | null;
};

export type CorreiosTrackingResult = {
  success: true;
  code: string;
  status: string | null;
  events: CorreiosTrackingEvent[];
  raw: unknown;
};

const tokenCaches: Record<CorreiosTokenScope, CorreiosTokenCache | null> = {
  quote: null,
  postage: null,
};
const tokenRequests: Record<
  CorreiosTokenScope,
  Promise<CorreiosTokenCache> | null
> = {
  quote: null,
  postage: null,
};

try {
  const localEnv = parseEnv(readFileSync(".env", "utf8"));

  for (const key of CORREIOS_ENV_KEYS) {
    if (!process.env[key] && localEnv[key]) {
      process.env[key] = localEnv[key];
    }
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
    throw error;
  }
}

function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function requireConfigValue(value: string | undefined, key: string) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    throw new Error(`${key} is not configured.`);
  }

  return normalizedValue;
}

function getCorreiosBaseConfig() {
  const contract = requireConfigValue(
    process.env.CORREIOS_CONTRACT,
    "CORREIOS_CONTRACT",
  );

  return {
    user: requireConfigValue(process.env.CORREIOS_USER, "CORREIOS_USER"),
    contract,
    dr: process.env.CORREIOS_DR ? String(process.env.CORREIOS_DR).trim() : null,
    originCep: normalizeCep(
      requireConfigValue(process.env.CORREIOS_ORIGIN_CEP, "CORREIOS_ORIGIN_CEP"),
    ),
  };
}

function getQuoteCorreiosConfig(): CorreiosConfig {
  const baseConfig = getCorreiosBaseConfig();

  return {
    ...baseConfig,
    accessCode: requireConfigValue(
      process.env.CORREIOS_QUOTE_ACCESS_CODE ||
        process.env.CORREIOS_ACCESS_CODE,
      "CORREIOS_QUOTE_ACCESS_CODE",
    ),
    authNumber: baseConfig.contract,
    tokenAuthPath: "/token/v1/autentica/contrato",
    postingCard: null,
  };
}

function getPostageCorreiosConfig(): CorreiosConfig {
  const baseConfig = getCorreiosBaseConfig();
  const postingCard = process.env.CORREIOS_POSTING_CARD
    ? String(process.env.CORREIOS_POSTING_CARD).trim()
    : null;

  return {
    ...baseConfig,
    accessCode: requireConfigValue(
      process.env.CORREIOS_POSTAGE_ACCESS_CODE ||
        process.env.CORREIOS_ACCESS_CODE,
      "CORREIOS_POSTAGE_ACCESS_CODE",
    ),
    authNumber: postingCard || baseConfig.contract,
    tokenAuthPath: postingCard
      ? "/token/v1/autentica/cartaopostagem"
      : "/token/v1/autentica/contrato",
    postingCard,
  };
}

function getServiceLabels() {
  return {
    [process.env.CORREIOS_PAC_CODE || "03298"]: "PAC",
    [process.env.CORREIOS_SEDEX_CODE || "03220"]: "SEDEX",
  } as Record<string, "PAC" | "SEDEX">;
}

function normalizeCep(value: unknown) {
  const cep = onlyDigits(value);

  if (cep.length !== 8) {
    throw new Error("Invalid CEP.");
  }

  return cep;
}

function normalizeTrackingCode(value: unknown) {
  const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!/^[A-Z]{2}\d{9}BR$/.test(code)) {
    throw new Error("Informe um código de rastreio válido dos Correios.");
  }

  return code;
}

function normalizeUf(value: unknown) {
  const uf = String(value || "").trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(uf)) {
    throw new Error("Invalid UF.");
  }

  return uf;
}

function normalizeCorreiosCepAddress(data: unknown): CorreiosCepAddress {
  const address =
    data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).itens)
      ? ((data as Record<string, unknown>).itens as unknown[])[0]
      : data;

  if (!address || typeof address !== "object") {
    throw new Error("CEP não encontrado nos Correios.");
  }

  const record = address as Record<string, unknown>;
  const cep = normalizeCep(record.cep);
  const uf = normalizeUf(record.uf);

  return {
    cep,
    uf,
    localidade: String(record.localidade || "").trim(),
    logradouro: String(record.logradouro || "").trim(),
    bairro: String(record.bairro || "").trim(),
  };
}

function requirePrePostageText(value: unknown, label: string) {
  const text = String(value || "").trim();

  if (!text) {
    throw new Error(`Pre-postage requires ${label}.`);
  }

  return text;
}

function parseFiniteNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().replace(",", ".");
  const number = Number(normalizedValue);

  return Number.isFinite(number) ? number : null;
}

function parsePositiveDimension(...values: unknown[]) {
  for (const value of values) {
    const number = parseFiniteNumber(value);

    if (number && number > 0) {
      return number;
    }
  }

  return null;
}

function parseWeightKg(item: CorreiosQuoteItem) {
  const explicitKg = parsePositiveDimension(item.weightKg);

  if (explicitKg) {
    return explicitKg;
  }

  const explicitGrams = parsePositiveDimension(
    item.weightGrams,
    item.grams,
  );

  if (explicitGrams) {
    return explicitGrams / 1000;
  }

  const genericWeight = parsePositiveDimension(item.weight);

  if (!genericWeight) {
    return null;
  }

  return genericWeight > 100 ? genericWeight / 1000 : genericWeight;
}

function normalizeQuantity(value: unknown) {
  const quantity = Number(value);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 1;
  }

  return Math.min(quantity, 99);
}

function normalizeItemPackage(item: CorreiosQuoteItem) {
  const weightKg = parseWeightKg(item) || FALLBACK_PACKAGE.weightKg;
  const lengthCm =
    parsePositiveDimension(item.lengthCm, item.length) ||
    FALLBACK_PACKAGE.lengthCm;
  const widthCm =
    parsePositiveDimension(item.widthCm, item.width) || FALLBACK_PACKAGE.widthCm;
  const heightCm =
    parsePositiveDimension(item.heightCm, item.height) ||
    FALLBACK_PACKAGE.heightCm;

  return {
    quantity: normalizeQuantity(item.quantity),
    weightKg,
    lengthCm,
    widthCm,
    heightCm,
  };
}

function getSenderAddress(config: CorreiosConfig) {
  return {
    name: process.env.CORREIOS_SENDER_NAME || "IRON AIR IMPORTADORA LTDA",
    cpfCnpj: process.env.CORREIOS_SENDER_DOCUMENT || process.env.CORREIOS_USER,
    email: process.env.CORREIOS_SENDER_EMAIL || "",
    phone: process.env.CORREIOS_SENDER_PHONE || "",
    address: {
      postalCode: config.originCep,
      address1: process.env.CORREIOS_SENDER_STREET || "Rua Sambeatiba",
      number: process.env.CORREIOS_SENDER_NUMBER || "168",
      complement: process.env.CORREIOS_SENDER_COMPLEMENT || "Casa b",
      neighborhood: process.env.CORREIOS_SENDER_NEIGHBORHOOD || "Cachoeirinha",
      city: process.env.CORREIOS_SENDER_CITY || "Belo Horizonte",
      provinceCode: process.env.CORREIOS_SENDER_STATE || "MG",
    },
  };
}

function buildPackage(items: CorreiosQuoteItem[]): CorreiosPackage {
  if (!Array.isArray(items) || !items.length) {
    throw new Error("Shipping quote requires at least one item.");
  }

  const itemPackages = items.map(normalizeItemPackage);
  const weightKg = itemPackages.reduce(
    (total, item) => total + item.weightKg * item.quantity,
    0,
  );
  const lengthCm = Math.max(...itemPackages.map((item) => item.lengthCm));
  const widthCm = Math.max(...itemPackages.map((item) => item.widthCm));
  const heightCm = itemPackages.reduce(
    (total, item) => total + item.heightCm * item.quantity,
    0,
  );

  const shippingPackage = {
    weightGrams: Math.ceil(weightKg * 1000),
    lengthCm: Math.ceil(lengthCm),
    widthCm: Math.ceil(widthCm),
    heightCm: Math.ceil(heightCm),
  };

  validatePackage(shippingPackage);

  return shippingPackage;
}

function validatePackage(shippingPackage: CorreiosPackage) {
  const values = [
    shippingPackage.weightGrams,
    shippingPackage.lengthCm,
    shippingPackage.widthCm,
    shippingPackage.heightCm,
  ];

  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Invalid shipping package weight or dimensions.");
  }

  if (shippingPackage.weightGrams > 30_000) {
    throw new Error("Shipping package is above Correios weight limit.");
  }
}

function basicAuth(config: CorreiosConfig) {
  return Buffer.from(`${config.user}:${config.accessCode}`).toString("base64");
}

function parseTokenExpiration(data: Record<string, unknown>) {
  const dateValue =
    data.expiraEm ||
    data.expiresAt ||
    data.expiration ||
    data.dataExpiracao ||
    data.validade;

  if (typeof dateValue === "string") {
    const timestamp = Date.parse(dateValue);

    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }

  const expiresIn = Number(data.expires_in || data.expiresIn);

  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    return Date.now() + expiresIn * 1000;
  }

  return Date.now() + 50 * 60 * 1000;
}

function extractToken(data: Record<string, unknown>) {
  const token = data.token || data.access_token || data.accessToken;

  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Correios token response did not include a token.");
  }

  return token;
}

async function readJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function formatCorreiosError(data: unknown): string {
  if (!data) {
    return "Correios service returned an empty error.";
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    const messages = [
      record.msg,
      record.message,
      record.mensagem,
      record.txErro,
      record.erro,
      record.detail,
      record.title,
    ].filter(Boolean);

    if (messages.length) {
      return messages.join("; ");
    }

    if (Array.isArray(record.msgs)) {
      return record.msgs.join("; ");
    }

    if (Array.isArray(record.errors)) {
      return record.errors
        .map((error) => formatCorreiosError(error))
        .join("; ");
    }

    try {
      return JSON.stringify(data);
    } catch {
      return "Correios service returned an error.";
    }
  }

  return "Correios service returned an error.";
}

async function requestCorreiosToken(
  scope: CorreiosTokenScope,
  config: CorreiosConfig,
  forceRefresh = false,
) {
  const tokenCache = tokenCaches[scope];
  const tokenRequest = tokenRequests[scope];

  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()
  ) {
    return tokenCache;
  }

  if (!forceRefresh && tokenRequest) {
    return tokenRequest;
  }

  tokenRequests[scope] = (async () => {
    const response = await fetch(
      `${CORREIOS_BASE_URL}${config.tokenAuthPath}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth(config)}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          numero: config.authNumber,
          ...(config.postingCard ? { contrato: config.contract } : {}),
          ...(config.dr ? { dr: Number(config.dr) } : {}),
        }),
      },
    );
    const data = await readJsonResponse(response);

    if (!response.ok || typeof data !== "object" || !data) {
      throw new Error(
        `Correios token ${scope} ${response.status}: ${formatCorreiosError(data)}`,
      );
    }

    const nextToken = {
      token: extractToken(data as Record<string, unknown>),
      expiresAt: parseTokenExpiration(data as Record<string, unknown>),
    };

    tokenCaches[scope] = nextToken;

    console.log("[correios] Token generated.", {
      scope,
      authPath: config.tokenAuthPath,
      expiresAt: new Date(nextToken.expiresAt).toISOString(),
    });

    return nextToken;
  })();

  try {
    return await tokenRequests[scope];
  } finally {
    tokenRequests[scope] = null;
  }
}

async function requestCorreios(
  scope: CorreiosTokenScope,
  config: CorreiosConfig,
  path: string,
  init: RequestInit,
  retry = true,
) {
  const token = await requestCorreiosToken(scope, config);
  const response = await fetch(`${CORREIOS_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await readJsonResponse(response);

  if (response.status === 401 && retry) {
    tokenCaches[scope] = null;

    await requestCorreiosToken(scope, config, true);

    return requestCorreios(scope, config, path, init, false);
  }

  if (!response.ok && response.status !== 206) {
    const errorMessage = formatCorreiosError(data);

    console.warn("[correios] API request failed.", {
      scope,
      path,
      status: response.status,
      error: errorMessage,
    });

    throw new Error(`Correios ${response.status}: ${errorMessage}`);
  }

  return data;
}

async function requestCorreiosDocument(
  config: CorreiosConfig,
  path: string,
  init: RequestInit,
  retry = true,
) {
  const token = await requestCorreiosToken("postage", config);
  const response = await fetch(`${CORREIOS_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.token}`,
      Accept: "application/pdf, application/json, text/plain",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (response.status === 401 && retry) {
    tokenCaches.postage = null;
    await requestCorreiosToken("postage", config, true);
    return requestCorreiosDocument(config, path, init, false);
  }

  const contentType = response.headers.get("content-type") || "";
  const isBinary =
    contentType.includes("application/pdf") ||
    contentType.includes("application/octet-stream");
  const data = isBinary
    ? Buffer.from(await response.arrayBuffer())
    : await readJsonResponse(response);

  if (!response.ok && response.status !== 206) {
    const errorData = Buffer.isBuffer(data)
      ? `binary response (${data.length} bytes)`
      : data;
    throw new Error(
      `Correios ${response.status}: ${formatCorreiosError(errorData)}`,
    );
  }

  return { data, contentType };
}

export async function getCorreiosAddressByCep(
  cep: unknown,
): Promise<CorreiosCepAddress> {
  const config = getQuoteCorreiosConfig();
  const normalizedCep = normalizeCep(cep);
  const data = await requestCorreios(
    "quote",
    config,
    `/cep/v2/enderecos/${normalizedCep}`,
    { method: "GET" },
  );
  const address = normalizeCorreiosCepAddress(data);

  if (address.cep !== normalizedCep) {
    throw new Error("CEP retornado pelos Correios não corresponde ao CEP informado.");
  }

  return address;
}

function buildPricePayload(
  config: CorreiosConfig,
  destinationCep: string,
  shippingPackage: CorreiosPackage,
) {
  return {
    idLote: "ironair-checkout",
    parametrosProduto: Object.entries(getServiceLabels()).map(
      ([serviceCode], index) => ({
        coProduto: serviceCode,
        nuRequisicao: String(index + 1).padStart(3, "0"),
        nuContrato: config.contract,
        ...(config.dr ? { nuDR: Number(config.dr) } : {}),
        cepOrigem: config.originCep,
        psObjeto: String(shippingPackage.weightGrams),
        tpObjeto: "2",
        comprimento: String(shippingPackage.lengthCm),
        largura: String(shippingPackage.widthCm),
        altura: String(shippingPackage.heightCm),
        cepDestino: destinationCep,
      }),
    ),
  };
}

function buildDeadlinePayload(config: CorreiosConfig, destinationCep: string) {
  return {
    idLote: "ironair-checkout",
    parametrosPrazo: Object.entries(getServiceLabels()).map(
      ([serviceCode], index) => ({
        coProduto: serviceCode,
        nuRequisicao: String(index + 1).padStart(3, "0"),
        cepOrigem: config.originCep,
        cepDestino: destinationCep,
      }),
    ),
  };
}

function buildCorreiosEndereco(address: CorreiosAddress) {
  return {
    cep: normalizeCep(address.postalCode),
    logradouro: requirePrePostageText(address.address1, "street"),
    numero: requirePrePostageText(address.number, "number"),
    complemento: String(address.complement || "").trim(),
    bairro: requirePrePostageText(address.neighborhood, "neighborhood"),
    cidade: requirePrePostageText(address.city, "city"),
    uf: normalizeUf(address.provinceCode),
  };
}

function buildCorreiosPessoa(person: CorreiosPerson) {
  const document = onlyDigits(person.cpfCnpj);
  const phone = onlyDigits(person.phone);
  const ddd = phone.length >= 10 ? phone.slice(0, 2) : "";
  const phoneNumber = ddd ? phone.slice(2) : phone;

  return {
    nome: requirePrePostageText(person.name, "name"),
    ...(document ? { cpfCnpj: document, documento: document } : {}),
    ...(phoneNumber
      ? {
          ...(ddd ? { dddCelular: ddd } : {}),
          celular: phoneNumber,
        }
      : {}),
    ...(person.email ? { email: String(person.email).trim().toLowerCase() } : {}),
    endereco: buildCorreiosEndereco(person.address),
  };
}

function buildPrePostagePayload(
  config: CorreiosConfig,
  input: CorreiosPrePostageInput,
  shippingPackage: CorreiosPackage,
) {
  const serviceCode = requirePrePostageText(input.serviceCode, "service code");
  const sender = getSenderAddress(config);
  const recipient = input.customer;
  const declarationItems = (input.items || []).map((item) => {
    const value = parsePositiveDimension(item.value);

    if (!value) {
      throw new Error("Pre-postage content declaration requires real paid order items.");
    }

    return {
      description: requirePrePostageText(item.description, "item description"),
      quantity: normalizeQuantity(item.quantity),
      value,
      weightGrams: Math.ceil(
        (parseWeightKg(item) || FALLBACK_PACKAGE.weightKg) * 1000,
      ),
    };
  });

  if (!declarationItems.length) {
    throw new Error("Pre-postage content declaration requires real paid order items.");
  }

  const nfeAccessKey = input.nfe?.sent ? input.nfe.accessKey : null;

  return {
    codigoServico: serviceCode,
    coProduto: serviceCode,
    numeroContrato: config.contract,
    nuContrato: config.contract,
    ...(config.postingCard
      ? {
          cartaoPostagem: config.postingCard,
          numeroCartaoPostagem: config.postingCard,
        }
      : {}),
    cepOrigem: config.originCep,
    cepDestino: normalizeCep(recipient.address.postalCode),
    remetente: buildCorreiosPessoa(sender),
    destinatario: buildCorreiosPessoa(recipient),
    pesoInformado: String(shippingPackage.weightGrams),
    pesoCubico: 0,
    codigoFormatoObjetoInformado: "2",
    comprimentoInformado: String(shippingPackage.lengthCm),
    larguraInformada: String(shippingPackage.widthCm),
    alturaInformada: String(shippingPackage.heightCm),
    tipoDocumento: nfeAccessKey ? "NFE" : "DC",
    ...(nfeAccessKey ? { chaveNFe: nfeAccessKey } : { emiteDCe: "S" }),
    precoPostagem: 0,
    modalidadePagamento: "2",
    logisticaReversa: "N",
    solicitarColeta: "N",
    cienteObjetoNaoProibido: "1",
    listaServicoAdicional: [],
    declaracaoConteudo: declarationItems.map((item) => ({
      descricao: item.description,
      quantidade: item.quantity,
      valor: item.value,
      pesoLiquidoGrama: item.weightGrams,
    })),
    itensDeclaracaoConteudo: declarationItems.map((item) => ({
      conteudo: item.description,
      quantidade: String(item.quantity),
      valor: item.value.toFixed(2),
    })),
    observacao: `Iron Air checkout - ${String(input.service || serviceCode).trim()}`,
  };
}

function normalizeArray(data: unknown) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const values = record.data || record.resultados || record.items;

    if (Array.isArray(values)) {
      return values;
    }
  }

  return [];
}

function parsePrice(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.replace(/[^\d,.-]/g, "").replace(",", ".");
  const price = Number(normalizedValue);

  return Number.isFinite(price) && price >= 0 ? price : null;
}

function getPriceFromResult(result: Record<string, unknown>) {
  return parsePrice(
    result.pcFinal ||
      result.precoFinal ||
      result.vlFinal ||
      result.valor ||
      result.preco,
  );
}

function getDeadlineFromResult(result: Record<string, unknown>) {
  const deadline = Number(result.prazoEntrega || result.prazo || result.days);

  return Number.isFinite(deadline) && deadline >= 0 ? deadline : null;
}

function hasCorreiosError(result: Record<string, unknown>) {
  return Boolean(result.txErro || result.erro || result.msgErro);
}

function mergeQuoteResults(priceData: unknown, deadlineData: unknown) {
  const prices = new Map<string, number>();
  const deadlines = new Map<string, number>();

  for (const item of normalizeArray(priceData)) {
    if (!item || typeof item !== "object") continue;

    const result = item as Record<string, unknown>;
    const serviceCode = String(result.coProduto || result.codigo || "");
    const price = getPriceFromResult(result);

    if (serviceCode && price !== null && !hasCorreiosError(result)) {
      prices.set(serviceCode, price);
    }
  }

  for (const item of normalizeArray(deadlineData)) {
    if (!item || typeof item !== "object") continue;

    const result = item as Record<string, unknown>;
    const serviceCode = String(result.coProduto || result.codigo || "");
    const deadline = getDeadlineFromResult(result);

    if (serviceCode && deadline !== null && !hasCorreiosError(result)) {
      deadlines.set(serviceCode, deadline);
    }
  }

  return Object.entries(getServiceLabels())
    .map(([serviceCode, service]) => {
      const price = prices.get(serviceCode);
      const deadlineDays = deadlines.get(serviceCode);

      if (price === undefined || deadlineDays === undefined) {
        return null;
      }

      return {
        carrier: "Correios" as const,
        service,
        serviceCode,
        price,
        deadlineDays,
      };
    })
    .filter((option): option is CorreiosShippingOption => Boolean(option));
}

export async function quoteCorreiosShipping(payload: {
  destinationCep: unknown;
  destinationState?: unknown;
  items: CorreiosQuoteItem[];
}): Promise<CorreiosQuoteResult> {
  const config = getQuoteCorreiosConfig();
  const destinationCep = normalizeCep(payload.destinationCep);
  const fallbackDestinationState = getStateFromCep(destinationCep);
  let destinationAddress: CorreiosCepAddress | null = null;

  try {
    destinationAddress = await getCorreiosAddressByCep(destinationCep);
  } catch (error) {
    if (!isBrazilState(fallbackDestinationState)) {
      throw error;
    }

    console.warn("[correios] CEP address lookup failed; using CEP range fallback.", {
      destinationCepPrefix: destinationCep.slice(0, 5),
      fallbackDestinationState,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const destinationState = destinationAddress?.uf || fallbackDestinationState || "";
  const requestedDestinationState = payload.destinationState
    ? normalizeUf(payload.destinationState)
    : "";

  if (
    destinationAddress &&
    requestedDestinationState &&
    requestedDestinationState !== destinationAddress.uf
  ) {
    throw new Error("O CEP informado não corresponde ao estado do endereço.");
  }

  const shippingPackage = buildPackage(payload.items);

  console.log("[correios] Quoting shipping.", {
    originCepPrefix: config.originCep.slice(0, 5),
    destinationCepPrefix: destinationCep.slice(0, 5),
    destinationState,
    weightGrams: shippingPackage.weightGrams,
    dimensions: {
      lengthCm: shippingPackage.lengthCm,
      widthCm: shippingPackage.widthCm,
      heightCm: shippingPackage.heightCm,
    },
  });

  const [priceData, deadlineData] = await Promise.all([
    requestCorreios(
      "quote",
      config,
      "/preco/v1/nacional",
      {
        method: "POST",
        body: JSON.stringify(
          buildPricePayload(config, destinationCep, shippingPackage),
        ),
      },
    ),
    requestCorreios(
      "quote",
      config,
      "/prazo/v1/nacional",
      {
        method: "POST",
        body: JSON.stringify(buildDeadlinePayload(config, destinationCep)),
      },
    ),
  ]);
  const options = applyFreeShippingToOptions(
    mergeQuoteResults(priceData, deadlineData),
    {
      destinationCep,
      state: destinationState,
    },
  ) as CorreiosShippingOption[];

  console.log("[correios] Shipping quote completed.", {
    optionCount: options.length,
    services: options.map((option) => option.service),
  });

  return {
    success: true,
    options,
    destinationAddress,
  };
}

function asTrackingText(value: unknown) {
  return String(value || "").trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function getTrackingLocation(event: Record<string, unknown>) {
  const unit = asRecord(event.unidade || event.unidadeDestino || event.local);
  const address = asRecord(unit.endereco || unit.address);
  const city = asTrackingText(address.cidade || address.city || unit.cidade);
  const state = asTrackingText(address.uf || address.state || unit.uf);

  return [city, state].filter(Boolean).join(" · ") || null;
}

function normalizeTrackingEvents(data: unknown): CorreiosTrackingEvent[] {
  const payload = asRecord(data);
  const objects = Array.isArray(payload.objetos) ? payload.objetos : [];
  const object = asRecord(objects[0] || payload.objeto || payload);
  const events = Array.isArray(object.eventos) ? object.eventos : [];

  return events.map((item) => {
    const event = asRecord(item);

    return {
      date: asTrackingText(
        event.dtHrCriado || event.dataHora || event.data || event.dataEvento,
      ),
      description:
        asTrackingText(event.descricao || event.status || event.nome) ||
        "Atualização de rastreio",
      detail: asTrackingText(event.detalhe || event.descricaoDetalhada),
      location: getTrackingLocation(event),
    };
  });
}

export async function trackCorreiosObject(
  trackingCode: unknown,
): Promise<CorreiosTrackingResult> {
  const code = normalizeTrackingCode(trackingCode);
  const config = getPostageCorreiosConfig();
  const data = await requestCorreios(
    "postage",
    config,
    `/srorastro/v1/objetos/${encodeURIComponent(code)}?resultado=T&lingua=pt-BR`,
    {
      method: "GET",
      headers: { "Accept-Language": "pt-BR" },
    },
  );
  const events = normalizeTrackingEvents(data);

  return {
    success: true,
    code,
    status: events[0]?.description || null,
    events,
    raw: data,
  };
}

export async function createPrePostage(
  input: CorreiosPrePostageInput,
): Promise<CorreiosPrePostageResult> {
  const config = getPostageCorreiosConfig();
  const shippingPackage = buildPackage(
    Array.isArray(input.items) && input.items.length ? input.items : [{}],
  );
  const payload = buildPrePostagePayload(config, input, shippingPackage);
  const path =
    process.env.CORREIOS_PREPOSTAGE_PATH || "/prepostagem/v1/prepostagens";

  console.log("[correios] Creating pre-postage.", {
    path,
    serviceCode: payload.codigoServico,
    originCepPrefix: config.originCep.slice(0, 5),
    destinationCepPrefix: payload.cepDestino.slice(0, 5),
    weightGrams: shippingPackage.weightGrams,
    dimensions: {
      lengthCm: shippingPackage.lengthCm,
      widthCm: shippingPackage.widthCm,
      heightCm: shippingPackage.heightCm,
    },
    declaration: payload.declaracaoConteudo.map((item) => ({
      product: item.descricao,
      quantity: item.quantidade,
      value: item.valor,
    })),
    declaredValue: payload.declaracaoConteudo.reduce(
      (total, item) => total + item.valor * item.quantidade,
      0,
    ),
    nfeSent: Boolean(input.nfe?.sent),
    nfeNotSentReason: input.nfe?.sent ? null : input.nfe?.reason,
  });

  const data = await requestCorreios("postage", config, path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const result = {
    success: true as const,
    ...normalizeCorreiosResponse(data),
  };

  console.log("[correios] Pre-postage completed.", {
    prePostageId: result.prePostageId,
    trackingCode: result.trackingCode,
    hasLabel: Boolean(result.labelUrl || result.labelBase64),
  });

  return result;
}

export async function getPrePostage(
  prePostageId: unknown,
): Promise<CorreiosPrePostageResult> {
  const config = getPostageCorreiosConfig();
  const id = requirePrePostageText(prePostageId, "pre-postage id");
  const path = `${process.env.CORREIOS_PREPOSTAGE_PATH || "/prepostagem/v1/prepostagens"}/${encodeURIComponent(id)}`;
  const data = await requestCorreios("postage", config, path, { method: "GET" });

  return {
    success: true,
    ...normalizeCorreiosResponse(data),
  };
}

export async function getPrePostageByTrackingCode(
  trackingCode: unknown,
): Promise<CorreiosPrePostageResult> {
  const config = getPostageCorreiosConfig();
  const code = normalizeTrackingCode(trackingCode);
  const basePath =
    process.env.CORREIOS_PREPOSTAGE_PATH || "/prepostagem/v1/prepostagens";
  const queryPath = basePath.replace("/v1/prepostagens", "/v2/prepostagens");
  const path = `${queryPath}?codigoObjeto=${encodeURIComponent(code)}&size=10`;
  const data = await requestCorreios("postage", config, path, { method: "GET" });
  const result = normalizeCorreiosResponse(data);

  if (result.trackingCode !== code) {
    throw new Error("Correios query did not return the requested tracking code.");
  }

  return { success: true, ...result };
}

export async function cancelPrePostage(
  prePostageId: unknown,
): Promise<CorreiosPrePostageResult> {
  const config = getPostageCorreiosConfig();
  const id = requirePrePostageText(prePostageId, "pre-postage id");
  const path = `${process.env.CORREIOS_PREPOSTAGE_PATH || "/prepostagem/v1/prepostagens"}/${encodeURIComponent(id)}`;
  const data = await requestCorreios("postage", config, path, { method: "DELETE" });

  return {
    success: true,
    ...normalizeCorreiosResponse(data),
  };
}

export async function generatePrePostageLabel(
  prePostageId: unknown,
  { type = "P" }: { type?: "P" | "R" } = {},
): Promise<CorreiosPrePostageResult> {
  const config = getPostageCorreiosConfig();
  const id = requirePrePostageText(prePostageId, "pre-postage id");
  const path =
    process.env.CORREIOS_LABEL_PATH ||
    "/prepostagem/v1/prepostagens/rotulo";
  const { data, contentType } = await requestCorreiosDocument(config, path, {
    method: "POST",
    body: JSON.stringify({
      idsPrePostagem: [id],
      tipoRotulo: type,
    }),
  });
  const normalized = Buffer.isBuffer(data)
    ? normalizeCorreiosResponse({
        idPrePostagem: id,
        labelBase64: data.toString("base64"),
      })
    : typeof data === "string"
      ? normalizeCorreiosResponse({
          idPrePostagem: id,
          ...(data.startsWith("http")
            ? { labelUrl: data }
            : { labelBase64: data }),
        })
      : normalizeCorreiosResponse(data);
  const result = mergeCorreiosResults(
    normalizeCorreiosResponse({ idPrePostagem: id }),
    normalized,
  ) as CorreiosPrePostageResult;

  console.log("[correios] Pre-postage label generated.", {
    prePostageId: id,
    contentType,
    receiptId: result.receiptId,
    trackingCode: result.trackingCode,
    hasLabel: Boolean(result.labelUrl || result.labelBase64),
  });

  return result;
}
