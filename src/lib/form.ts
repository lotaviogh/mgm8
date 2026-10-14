import { mlShippingVerde202603 } from "@/data/ml-shipping-verde-2026-03";
import { PARAMS } from "@/data/params";
import {
  calculate,
  validateInputs,
  type CalculationResult,
  type ImportInput,
  type MarketplaceInput,
  type Modal,
  type ParamMeta,
  type ShippingTable,
} from "@/engine";
import { parseNum } from "./format";

export type Regime = "simples" | "presumido" | "real";
export type Fulfillment = "coleta" | "full";
export type FullSize = "pequeno" | "medio" | "grande" | "extragrande";

/** Porte do produto no Full e a tarifa diária de armazenagem padrão de cada um. */
export const FULL_SIZES: { id: FullSize; label: string; param: ParamMeta }[] = [
  { id: "pequeno", label: "Pequeno (até 12 × 15 × 25 cm)", param: PARAMS.fullStorageSmall },
  { id: "medio", label: "Médio (até 28 × 36 × 51 cm)", param: PARAMS.fullStorageMedium },
  { id: "grande", label: "Grande (até 60 × 60 × 70 cm)", param: PARAMS.fullStorageLarge },
  { id: "extragrande", label: "Extragrande (acima disso)", param: PARAMS.fullStorageXLarge },
];

/** Estado do formulário: tudo como texto, para aceitar vírgula e campo vazio durante a digitação. */
export interface Form {
  name: string;
  fobUnitUsd: string;
  quantity: string;
  weightKg: string;
  modal: Modal;
  freightIntlTotalUsd: string;
  insurancePct: string;
  fxCustoms: string;
  fxSpreadPct: string;
  iofCambioPct: string;
  bankFeeBrl: string;
  iiPct: string;
  ipiPct: string;
  pisImportPct: string;
  cofinsImportPct: string;
  cofinsAdicionalPct: string;
  icmsPct: string;
  afrmmPct: string;
  siscomexBrl: string;
  customsExpensesBrl: string;
  otherImportExpensesBrl: string;
  regime: Regime;
  price: string;
  commissionPct: string;
  shippingMode: "tabela" | "manual";
  manualShippingCostBrl: string;
  fulfillment: Fulfillment;
  fullSize: FullSize;
  fullStorageRatePerDayBrl: string;
  fullDaysInStock: string;
  fullInboundPerUnitBrl: string;
  fullOtherPerUnitBrl: string;
  saleTaxPct: string;
  adsPct: string;
  lossPct: string;
  packagingBrl: string;
  otherUnitCostBrl: string;
  targetMarginPct: string;
}

const s = (n: number) => String(n).replace(".", ",");

/** Cenário de exemplo. Os valores vindos de PARAMS têm fonte; os demais são ilustrativos. */
export const EXAMPLE_FORM: Form = {
  name: "Organizador dobrável (exemplo)",
  fobUnitUsd: "3,00",
  quantity: "1000",
  weightKg: "0,4",
  modal: "maritimo",
  freightIntlTotalUsd: "600",
  insurancePct: "0",
  fxCustoms: "5,50",
  fxSpreadPct: "0,5",
  iofCambioPct: s(PARAMS.iofCambioPct.value),
  bankFeeBrl: "0",
  iiPct: "20",
  ipiPct: "10",
  pisImportPct: s(PARAMS.pisImportPct.value),
  cofinsImportPct: s(PARAMS.cofinsImportPct.value),
  cofinsAdicionalPct: "0",
  icmsPct: s(PARAMS.icmsImportPct.value),
  afrmmPct: s(PARAMS.afrmmPct.value),
  siscomexBrl: s(PARAMS.siscomexBrl.value),
  customsExpensesBrl: "500",
  otherImportExpensesBrl: "1200",
  regime: "simples",
  price: "129,90",
  commissionPct: s(PARAMS.commissionPct.value),
  shippingMode: "tabela",
  manualShippingCostBrl: "0",
  fulfillment: "coleta",
  fullSize: "medio",
  fullStorageRatePerDayBrl: s(PARAMS.fullStorageMedium.value),
  fullDaysInStock: "30",
  fullInboundPerUnitBrl: "0",
  fullOtherPerUnitBrl: "0",
  saleTaxPct: "6",
  adsPct: "5",
  lossPct: "2",
  packagingBrl: "1,50",
  otherUnitCostBrl: "0",
  targetMarginPct: "20",
};

export function toImportInput(f: Form): ImportInput {
  const fxCustoms = parseNum(f.fxCustoms);
  return {
    fobUnitUsd: parseNum(f.fobUnitUsd),
    quantity: parseNum(f.quantity),
    freightIntlTotalUsd: parseNum(f.freightIntlTotalUsd),
    insurancePct: parseNum(f.insurancePct),
    modal: f.modal,
    fxCustoms,
    fxPayment: fxCustoms * (1 + parseNum(f.fxSpreadPct) / 100),
    iofCambioPct: parseNum(f.iofCambioPct),
    bankFeeBrl: parseNum(f.bankFeeBrl),
    iiPct: parseNum(f.iiPct),
    ipiPct: parseNum(f.ipiPct),
    pisImportPct: parseNum(f.pisImportPct),
    cofinsImportPct: parseNum(f.cofinsImportPct),
    cofinsAdicionalPct: parseNum(f.cofinsAdicionalPct),
    icmsPct: parseNum(f.icmsPct),
    afrmmPct: parseNum(f.afrmmPct),
    siscomexBrl: parseNum(f.siscomexBrl),
    customsExpensesBrl: parseNum(f.customsExpensesBrl),
    otherImportExpensesBrl: parseNum(f.otherImportExpensesBrl),
    recoverIcms: f.regime !== "simples",
    recoverPisCofins: f.regime === "real",
  };
}

/**
 * Custo do Full por unidade: armazenagem (tarifa diária × dias em estoque) + abastecimento do centro
 * + outras tarifas. Em coleta é zero. Campo inválido vira NaN e a validação acusa.
 */
export function fullUnitCost(f: Form): number {
  if (f.fulfillment !== "full") return 0;
  return (
    parseNum(f.fullStorageRatePerDayBrl) * parseNum(f.fullDaysInStock) +
    parseNum(f.fullInboundPerUnitBrl) +
    parseNum(f.fullOtherPerUnitBrl)
  );
}

export function toMarketplaceInput(f: Form): MarketplaceInput {
  return {
    price: parseNum(f.price),
    commissionPct: parseNum(f.commissionPct),
    shippingMode: f.shippingMode,
    weightKg: parseNum(f.weightKg),
    manualShippingCostBrl: parseNum(f.manualShippingCostBrl),
    saleTaxPct: parseNum(f.saleTaxPct),
    adsPct: parseNum(f.adsPct),
    lossPct: parseNum(f.lossPct),
    packagingBrl: parseNum(f.packagingBrl),
    otherUnitCostBrl: parseNum(f.otherUnitCostBrl),
    fulfillmentUnitCostBrl: fullUnitCost(f),
  };
}

export interface Computed {
  errors: string[];
  imp: ImportInput;
  mkt: MarketplaceInput;
  targetMarginPct: number;
  table: ShippingTable | undefined;
  result: CalculationResult | null;
}

export function computeAll(f: Form): Computed {
  const imp = toImportInput(f);
  const mkt = toMarketplaceInput(f);
  const targetMarginPct = parseNum(f.targetMarginPct);
  const table = f.shippingMode === "tabela" ? mlShippingVerde202603 : undefined;
  const errors = validateInputs(imp, mkt, targetMarginPct);
  return {
    errors,
    imp,
    mkt,
    targetMarginPct,
    table,
    result: errors.length ? null : calculate(imp, mkt, table, targetMarginPct),
  };
}

export interface Scenario {
  id: string;
  savedAt: string;
  form: Form;
}

const KEY = "calculadora-margem:cenarios:v1";

export function loadScenarios(): Scenario[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Scenario[]) : [];
    if (!Array.isArray(parsed)) return [];
    // Cenários salvos por versões anteriores não têm os campos novos: completa com o padrão.
    return parsed.map((sc) => ({ ...sc, form: { ...EXAMPLE_FORM, ...sc.form } }));
  } catch {
    return [];
  }
}

export function saveScenarios(list: Scenario[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
