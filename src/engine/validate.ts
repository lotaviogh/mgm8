import type { ImportInput, MarketplaceInput } from "./types";

/** Retorna mensagens de erro em português; lista vazia = entradas válidas. */
export function validateInputs(i: ImportInput, m: MarketplaceInput, targetMarginPct: number): string[] {
  const errors: string[] = [];
  const positive = (v: number, label: string) => {
    if (!Number.isFinite(v) || v <= 0) errors.push(`${label} deve ser maior que zero.`);
  };
  const nonNegative = (v: number, label: string) => {
    if (!Number.isFinite(v) || v < 0) errors.push(`${label} não pode ser negativo.`);
  };
  const percent = (v: number, label: string, max = 100) => {
    if (!Number.isFinite(v) || v < 0 || v >= max) errors.push(`${label} deve estar entre 0 e ${max}%.`);
  };

  positive(i.quantity, "A quantidade do lote");
  if (Number.isFinite(i.quantity) && i.quantity > 0 && !Number.isInteger(i.quantity)) {
    errors.push("A quantidade do lote deve ser um número inteiro.");
  }
  nonNegative(i.fobUnitUsd, "O FOB unitário");
  nonNegative(i.freightIntlTotalUsd, "O frete internacional");
  positive(i.fxCustoms, "O câmbio aduaneiro");
  positive(i.fxPayment, "O câmbio de pagamento");
  percent(i.insurancePct, "O seguro");
  percent(i.iofCambioPct, "O IOF de câmbio");
  percent(i.iiPct, "O Imposto de Importação", 1000);
  percent(i.ipiPct, "O IPI", 1000);
  percent(i.pisImportPct, "O PIS-Importação");
  percent(i.cofinsImportPct, "A COFINS-Importação");
  percent(i.cofinsAdicionalPct, "O adicional de COFINS");
  percent(i.icmsPct, "O ICMS");
  percent(i.afrmmPct, "O AFRMM");
  nonNegative(i.siscomexBrl, "A taxa Siscomex");
  nonNegative(i.customsExpensesBrl, "As despesas aduaneiras");
  nonNegative(i.otherImportExpensesBrl, "As outras despesas de importação");
  nonNegative(i.bankFeeBrl, "A tarifa bancária");

  positive(m.price, "O preço de venda");
  percent(m.commissionPct, "A comissão");
  percent(m.saleTaxPct, "O imposto sobre a venda");
  percent(m.adsPct, "O percentual de publicidade");
  percent(m.lossPct, "O percentual de perdas");
  nonNegative(m.packagingBrl, "A embalagem");
  nonNegative(m.otherUnitCostBrl, "Os outros custos por unidade");
  if (!Number.isFinite(m.fulfillmentUnitCostBrl) || m.fulfillmentUnitCostBrl < 0) {
    errors.push("Confira os custos do Full: os campos não podem ficar vazios nem negativos.");
  }
  if (m.shippingMode === "tabela") positive(m.weightKg, "O peso faturável");
  else nonNegative(m.manualShippingCostBrl, "O custo do Mercado Livre informado");

  if (!Number.isFinite(targetMarginPct) || targetMarginPct < 0 || targetMarginPct >= 100) {
    errors.push("A margem-alvo deve estar entre 0 e 100%.");
  }
  return errors;
}
