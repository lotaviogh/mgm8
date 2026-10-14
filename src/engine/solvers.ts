import { landedUnitAtFob } from "./landed";
import { mlUnitCost, percentFeesOnPrice, priceBandIndex, weightRowIndex } from "./marketplace";
import type {
  ImportInput,
  MarketplaceInput,
  MaxFobSolution,
  PriceSolution,
  ShippingTable,
} from "./types";

const ceilCents = (v: number) => Math.ceil(v * 100 - 1e-9) / 100;

/**
 * Menor preço de venda que entrega a margem líquida-alvo (fração; 0 = ponto de equilíbrio).
 *
 * Com a tabela do ML o custo por unidade salta entre faixas de preço, então o lucro é
 * descontínuo no preço. Em cada faixa, o preço mínimo é max(limite inferior, preço da equação);
 * a primeira faixa (de baixo para cima) em que esse valor cabe dentro da faixa é a resposta.
 */
export function solvePrice(
  m: MarketplaceInput,
  landedUnit: number,
  table: ShippingTable | undefined,
  targetMargin: number,
): PriceSolution {
  const k = 1 - percentFeesOnPrice(m) - targetMargin;
  if (k <= 0) {
    return {
      feasible: false,
      price: null,
      atBandEdge: false,
      reason:
        "Comissão, impostos, ads, perdas e a margem-alvo somam 100% ou mais do preço: não existe preço que feche.",
    };
  }
  const fixed = m.packagingBrl + m.otherUnitCostBrl + m.fulfillmentUnitCostBrl + landedUnit;

  if (m.shippingMode === "manual" || !table) {
    return {
      feasible: true,
      price: ceilCents((fixed + m.manualShippingCostBrl) / k),
      atBandEdge: false,
    };
  }

  const row = table.rows[weightRowIndex(table, m.weightKg)];
  const starts = table.priceBandStarts;
  for (let i = 0; i < starts.length; i++) {
    const lo = starts[i];
    const hi = i + 1 < starts.length ? starts[i + 1] : Infinity;
    const needed = (fixed + row.costs[i]) / k;
    const candidate = ceilCents(Math.max(lo, needed));
    if (candidate < hi) {
      return { feasible: true, price: candidate, atBandEdge: needed < lo };
    }
  }
  return { feasible: false, price: null, atBandEdge: false, reason: "Sem solução na tabela." };
}

/**
 * FOB unitário máximo (US$) para o preço de venda dado e a margem-alvo.
 * O custo nacionalizado é linear no FOB, então a inversão é exata: duas avaliações bastam.
 */
export function solveMaxFob(
  i: ImportInput,
  m: MarketplaceInput,
  table: ShippingTable | undefined,
  price: number,
  targetMargin: number,
): MaxFobSolution {
  const ml = mlUnitCost(m, table, price);
  const allowedLanded =
    price * (1 - percentFeesOnPrice(m) - targetMargin) -
    ml.value -
    m.packagingBrl -
    m.otherUnitCostBrl -
    m.fulfillmentUnitCostBrl;

  const atZero = landedUnitAtFob(i, 0);
  const slope = landedUnitAtFob(i, 1) - atZero;

  if (!(slope > 0)) {
    return {
      feasible: false,
      maxFobUnitUsd: null,
      allowedLandedUnitBrl: allowedLanded,
      reason: "Não foi possível inverter o custo: confira câmbio e quantidade.",
    };
  }
  if (allowedLanded < atZero) {
    return {
      feasible: false,
      maxFobUnitUsd: null,
      allowedLandedUnitBrl: allowedLanded,
      reason:
        "Mesmo com FOB zero, os custos fixos da importação, o frete e as taxas do marketplace já consomem a margem nesse preço.",
    };
  }
  return {
    feasible: true,
    maxFobUnitUsd: (allowedLanded - atZero) / slope,
    allowedLandedUnitBrl: allowedLanded,
  };
}

export { priceBandIndex };
