import type { ImportInput, LandedBreakdown } from "./types";

const frac = (percent: number) => percent / 100;

/**
 * Custo nacionalizado de uma importação formal (despacho comum, CNPJ importador).
 *
 * Base legal usada:
 * - Valor aduaneiro = FOB + frete internacional + seguro (CIF), convertido ao câmbio aduaneiro.
 * - II = valor aduaneiro × alíquota. IPI = (valor aduaneiro + II) × alíquota.
 * - PIS e COFINS-Importação incidem sobre o valor aduaneiro (Lei 10.865/2004, art. 7º).
 * - ICMS calculado "por dentro": a base inclui o próprio ICMS, e também II, IPI, PIS, COFINS,
 *   AFRMM, taxa Siscomex e demais despesas aduaneiras.
 * - AFRMM incide sobre o frete marítimo, só no modal marítimo.
 *
 * Simplificações da v1 (conservadoras): o IPI entra no custo e não é recuperado; um único
 * produto por lote (despesas rateadas por unidade); não modela drawback, ex-tarifário nem
 * regimes especiais. Valide as alíquotas por NCM com um despachante.
 */
export function computeLanded(input: ImportInput): LandedBreakdown {
  const q = input.quantity;
  const fobTotalUsd = input.fobUnitUsd * q;
  const insuranceUsd = fobTotalUsd * frac(input.insurancePct);
  const freightUsd = input.freightIntlTotalUsd;
  const paymentUsd = fobTotalUsd + freightUsd + insuranceUsd;

  const paymentBrl = paymentUsd * input.fxPayment;
  const iofBrl = paymentBrl * frac(input.iofCambioPct);
  const bankFeeBrl = input.bankFeeBrl;

  const customsValueBrl = paymentUsd * input.fxCustoms;
  const ii = customsValueBrl * frac(input.iiPct);
  const ipi = (customsValueBrl + ii) * frac(input.ipiPct);
  const pis = customsValueBrl * frac(input.pisImportPct);
  const cofins = customsValueBrl * frac(input.cofinsImportPct + input.cofinsAdicionalPct);
  const afrmm =
    input.modal === "maritimo" ? freightUsd * input.fxCustoms * frac(input.afrmmPct) : 0;
  const siscomex = input.siscomexBrl;
  const customsExpenses = input.customsExpensesBrl;

  const icmsRate = frac(input.icmsPct);
  const preIcms =
    customsValueBrl + ii + ipi + pis + cofins + afrmm + siscomex + customsExpenses;
  const icmsBase = preIcms / (1 - icmsRate);
  const icms = icmsBase * icmsRate;

  const otherExpenses = input.otherImportExpensesBrl;

  const icmsCredit = input.recoverIcms ? icms : 0;
  // Crédito de PIS/COFINS-Importação: alíquotas padrão sobre (base + IPI que integra o custo).
  // O adicional de COFINS não gera crédito.
  const pisCofinsCredit = input.recoverPisCofins
    ? (customsValueBrl + ipi) * frac(input.pisImportPct + input.cofinsImportPct)
    : 0;

  const totalBrl =
    paymentBrl +
    iofBrl +
    bankFeeBrl +
    ii +
    ipi +
    pis +
    cofins +
    afrmm +
    siscomex +
    customsExpenses +
    icms +
    otherExpenses -
    icmsCredit -
    pisCofinsCredit;

  return {
    paymentBrl,
    iofBrl,
    bankFeeBrl,
    customsValueBrl,
    ii,
    ipi,
    pis,
    cofins,
    afrmm,
    siscomex,
    customsExpenses,
    icmsBase,
    icms,
    otherExpenses,
    icmsCredit,
    pisCofinsCredit,
    totalBrl,
    unitBrl: totalBrl / q,
  };
}

/** Custo nacionalizado por unidade como função do FOB unitário (é linear no FOB). */
export function landedUnitAtFob(input: ImportInput, fobUnitUsd: number): number {
  return computeLanded({ ...input, fobUnitUsd }).unitBrl;
}
