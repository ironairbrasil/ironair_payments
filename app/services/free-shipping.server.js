export const FREE_SHIPPING_TITLE = "Frete Grátis Brasil";

const CEP_STATE_RANGES = [
  { state: "SP", start: 1000000, end: 19999999 },
  { state: "RJ", start: 20000000, end: 28999999 },
  { state: "ES", start: 29000000, end: 29999999 },
  { state: "MG", start: 30000000, end: 39999999 },
  { state: "BA", start: 40000000, end: 48999999 },
  { state: "SE", start: 49000000, end: 49999999 },
  { state: "PE", start: 50000000, end: 56999999 },
  { state: "AL", start: 57000000, end: 57999999 },
  { state: "PB", start: 58000000, end: 58999999 },
  { state: "RN", start: 59000000, end: 59999999 },
  { state: "CE", start: 60000000, end: 63999999 },
  { state: "PI", start: 64000000, end: 64999999 },
  { state: "MA", start: 65000000, end: 65999999 },
  { state: "PA", start: 66000000, end: 68899999 },
  { state: "AP", start: 68900000, end: 68999999 },
  { state: "AM", start: 69000000, end: 69299999 },
  { state: "RR", start: 69300000, end: 69399999 },
  { state: "AM", start: 69400000, end: 69899999 },
  { state: "AC", start: 69900000, end: 69999999 },
  { state: "DF", start: 70000000, end: 72799999 },
  { state: "GO", start: 72800000, end: 72999999 },
  { state: "DF", start: 73000000, end: 73699999 },
  { state: "GO", start: 73700000, end: 76799999 },
  { state: "TO", start: 77000000, end: 77999999 },
  { state: "MT", start: 78000000, end: 78899999 },
  { state: "RO", start: 78900000, end: 78999999 },
  { state: "MS", start: 79000000, end: 79999999 },
  { state: "PR", start: 80000000, end: 87999999 },
  { state: "SC", start: 88000000, end: 89999999 },
  { state: "RS", start: 90000000, end: 99999999 },
];

export function onlyCepDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function getStateFromCep(value) {
  const cep = onlyCepDigits(value);

  if (cep.length !== 8) {
    return null;
  }

  const cepNumber = Number(cep);
  const range = CEP_STATE_RANGES.find(
    ({ start, end }) => cepNumber >= start && cepNumber <= end,
  );

  return range?.state || null;
}

export function isBrazilState(state) {
  const normalizedState = String(state || "").trim().toUpperCase();

  return CEP_STATE_RANGES.some(({ state: rangeState }) => rangeState === normalizedState);
}

export function isBrazilCep(value) {
  return Boolean(getStateFromCep(value));
}

export function applyFreeShippingToOption(option, { destinationCep, state } = {}) {
  const normalizedState = String(state || getStateFromCep(destinationCep) || "")
    .trim()
    .toUpperCase();
  const freeShippingState = normalizedState;
  const shouldApplyFreeShipping = isBrazilState(freeShippingState);
  const originalPrice = Number(option?.originalPrice ?? option?.price ?? 0);

  if (!shouldApplyFreeShipping) {
    return {
      ...option,
      price: Number(option?.price || 0),
      originalPrice,
      isFreeShipping: false,
    };
  }

  return {
    ...option,
    price: 0,
    originalPrice,
    isFreeShipping: true,
    freeShippingState,
    promotionLabel: FREE_SHIPPING_TITLE,
    title: FREE_SHIPPING_TITLE,
  };
}

export function applyFreeShippingToOptions(options, context = {}) {
  return (Array.isArray(options) ? options : []).map((option) =>
    applyFreeShippingToOption(option, context),
  );
}
