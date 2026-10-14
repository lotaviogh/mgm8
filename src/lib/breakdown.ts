import type { LandedBreakdown, MarginResult } from "@/engine";

/** Onde vai cada real do preço de venda, por unidade. A soma dos sete itens mais o lucro é o preço. */
export interface UnitCosts {
  /** Mercadoria, frete, seguro, câmbio, IOF e tarifas bancárias */
  goods: number;
  /** Tributos da importação, já descontados os créditos do regime */
  taxes: number;
  /** Despesas aduaneiras e outras despesas de importação */
  expenses: number;
  /** Comissão do anúncio mais o custo por unidade do Mercado Livre */
  marketplace: number;
  saleTax: number;
  /** Armazenagem, abastecimento e outras tarifas do Full */
  fulfillment: number;
  /** Ads, perdas, embalagem e outros custos por unidade */
  other: number;
}

export function unitCosts(l: LandedBreakdown, m: MarginResult, quantity: number): UnitCosts {
  const q = quantity;
  return {
    goods: (l.paymentBrl + l.iofBrl + l.bankFeeBrl) / q,
    taxes:
      (l.ii + l.ipi + l.pis + l.cofins + l.afrmm + l.siscomex + l.icms - l.icmsCredit - l.pisCofinsCredit) / q,
    expenses: (l.customsExpenses + l.otherExpenses) / q,
    marketplace: m.commission + m.mlUnitCost,
    saleTax: m.saleTax,
    fulfillment: m.fulfillment,
    other: m.ads + m.loss + m.packaging + m.otherUnitCost,
  };
}
