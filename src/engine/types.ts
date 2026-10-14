export type ParamStatus = "verificado" | "a_confirmar";

export interface ParamMeta {
  value: number;
  unit: string;
  label: string;
  status: ParamStatus;
  source: string;
  asOf: string;
  note?: string;
}

export type Modal = "maritimo" | "aereo" | "courier";

export interface ImportInput {
  /** Preço FOB unitário em US$ */
  fobUnitUsd: number;
  /** Unidades do lote */
  quantity: number;
  /** Frete internacional do lote inteiro, em US$ (0 se o preço já for CIF) */
  freightIntlTotalUsd: number;
  /** Seguro internacional, % sobre o FOB do lote */
  insurancePct: number;
  modal: Modal;
  /** R$/US$ usado no valor aduaneiro */
  fxCustoms: number;
  /** R$/US$ efetivamente pago ao fornecedor (com spread do banco) */
  fxPayment: number;
  /** IOF de câmbio sobre o pagamento, % */
  iofCambioPct: number;
  /** Tarifas bancárias por remessa, R$ */
  bankFeeBrl: number;
  /** Imposto de Importação, % (TEC, por NCM) */
  iiPct: number;
  /** IPI, % (TIPI, por NCM) */
  ipiPct: number;
  pisImportPct: number;
  cofinsImportPct: number;
  /** Adicional de COFINS-Importação, pontos percentuais (0 se não se aplica) */
  cofinsAdicionalPct: number;
  /** ICMS da importação, % (estado do importador) */
  icmsPct: number;
  /** AFRMM sobre o frete marítimo, % (só modal marítimo) */
  afrmmPct: number;
  /** Taxa Siscomex por declaração, R$ */
  siscomexBrl: number;
  /** Despesas aduaneiras que entram na base do ICMS (capatazia, armazenagem), R$ por lote */
  customsExpensesBrl: number;
  /** Outras despesas de importação fora da base do ICMS (despachante, transporte até o estoque), R$ por lote */
  otherImportExpensesBrl: number;
  /** Recupera o ICMS da importação como crédito (regimes não-Simples) */
  recoverIcms: boolean;
  /** Recupera PIS/COFINS-Importação como crédito (regime não-cumulativo) */
  recoverPisCofins: boolean;
}

export interface LandedBreakdown {
  /** Pagamento ao exterior (FOB + frete + seguro) em R$ ao câmbio de pagamento */
  paymentBrl: number;
  iofBrl: number;
  bankFeeBrl: number;
  customsValueBrl: number;
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  afrmm: number;
  siscomex: number;
  customsExpenses: number;
  icmsBase: number;
  icms: number;
  otherExpenses: number;
  icmsCredit: number;
  pisCofinsCredit: number;
  /** Custo total do lote, líquido de créditos */
  totalBrl: number;
  /** Custo nacionalizado por unidade, líquido de créditos */
  unitBrl: number;
}

export interface ShippingTable {
  id: string;
  label: string;
  status: ParamStatus;
  source: string;
  asOf: string;
  note: string;
  /** Limite inferior de cada faixa de preço (R$); a última faixa vai até o infinito */
  priceBandStarts: number[];
  /** Limite superior (inclusivo) do peso em kg de cada linha; Infinity na última */
  rows: { maxKg: number; costs: number[] }[];
}

export interface MarketplaceInput {
  /** Preço de venda por unidade, R$ */
  price: number;
  /** Comissão do anúncio, % sobre o preço */
  commissionPct: number;
  shippingMode: "tabela" | "manual";
  /** Peso faturável (maior entre real e cubado), kg */
  weightKg: number;
  /** Custo ML por unidade informado manualmente, R$ (usado quando shippingMode = manual) */
  manualShippingCostBrl: number;
  /** Imposto sobre a venda (ex.: alíquota efetiva do Simples), % */
  saleTaxPct: number;
  /** Publicidade (Mercado Ads), % sobre o preço */
  adsPct: number;
  /** Perdas, devoluções e reembolsos, % sobre o preço */
  lossPct: number;
  packagingBrl: number;
  otherUnitCostBrl: number;
  /** Custos por unidade da modalidade Full (armazenagem, abastecimento, retirada), R$; 0 em coleta */
  fulfillmentUnitCostBrl: number;
}

export interface MarginResult {
  price: number;
  commission: number;
  mlUnitCost: number;
  mlUnitCostBand: string;
  saleTax: number;
  ads: number;
  loss: number;
  packaging: number;
  otherUnitCost: number;
  fulfillment: number;
  landedUnit: number;
  profit: number;
  /** Lucro / preço, em fração (0,12 = 12%) */
  marginPct: number;
  /** Lucro / custo nacionalizado, em fração */
  markupPct: number;
}

export interface PriceSolution {
  feasible: boolean;
  price: number | null;
  /** O preço ficou no limite inferior de uma faixa de custo do ML (salto de tabela) */
  atBandEdge: boolean;
  reason?: string;
}

export interface MaxFobSolution {
  feasible: boolean;
  maxFobUnitUsd: number | null;
  allowedLandedUnitBrl: number;
  reason?: string;
}
