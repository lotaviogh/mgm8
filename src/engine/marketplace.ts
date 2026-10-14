import type { MarginResult, MarketplaceInput, ShippingTable } from "./types";

const frac = (percent: number) => percent / 100;

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/** Índice da faixa de preço da tabela (limite inferior inclusivo). */
export function priceBandIndex(table: ShippingTable, price: number): number {
  let idx = 0;
  for (let i = 0; i < table.priceBandStarts.length; i++) {
    if (price >= table.priceBandStarts[i]) idx = i;
  }
  return idx;
}

export function priceBandLabel(table: ShippingTable, idx: number): string {
  const lo = table.priceBandStarts[idx];
  const next = table.priceBandStarts[idx + 1];
  if (next === undefined) return `a partir de ${brl(lo)}`;
  return `${brl(lo)} a ${brl(next - 0.01)}`;
}

/** Linha de peso da tabela (limite superior inclusivo). */
export function weightRowIndex(table: ShippingTable, weightKg: number): number {
  const idx = table.rows.findIndex((r) => weightKg <= r.maxKg);
  return idx === -1 ? table.rows.length - 1 : idx;
}

export function lookupMlCost(
  table: ShippingTable,
  weightKg: number,
  price: number,
): { value: number; band: string } {
  const bandIdx = priceBandIndex(table, price);
  const row = table.rows[weightRowIndex(table, weightKg)];
  return { value: row.costs[bandIdx], band: priceBandLabel(table, bandIdx) };
}

export function mlUnitCost(
  m: MarketplaceInput,
  table: ShippingTable | undefined,
  price: number,
): { value: number; band: string } {
  if (m.shippingMode === "manual" || !table) {
    return { value: m.manualShippingCostBrl, band: "valor informado" };
  }
  return lookupMlCost(table, m.weightKg, price);
}

/** Soma dos custos percentuais sobre o preço (comissão, imposto, ads, perdas), em fração. */
export function percentFeesOnPrice(m: MarketplaceInput): number {
  return (
    frac(m.commissionPct) + frac(m.saleTaxPct) + frac(m.adsPct) + frac(m.lossPct)
  );
}

export function computeMargin(
  m: MarketplaceInput,
  landedUnit: number,
  table: ShippingTable | undefined,
  priceOverride?: number,
): MarginResult {
  const price = priceOverride ?? m.price;
  const ml = mlUnitCost(m, table, price);
  const commission = price * frac(m.commissionPct);
  const saleTax = price * frac(m.saleTaxPct);
  const ads = price * frac(m.adsPct);
  const loss = price * frac(m.lossPct);
  const profit =
    price -
    commission -
    ml.value -
    saleTax -
    ads -
    loss -
    m.packagingBrl -
    m.otherUnitCostBrl -
    m.fulfillmentUnitCostBrl -
    landedUnit;
  return {
    price,
    commission,
    mlUnitCost: ml.value,
    mlUnitCostBand: ml.band,
    saleTax,
    ads,
    loss,
    packaging: m.packagingBrl,
    otherUnitCost: m.otherUnitCostBrl,
    fulfillment: m.fulfillmentUnitCostBrl,
    landedUnit,
    profit,
    marginPct: price > 0 ? profit / price : 0,
    markupPct: landedUnit > 0 ? profit / landedUnit : 0,
  };
}
