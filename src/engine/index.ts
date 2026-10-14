import { computeLanded } from "./landed";
import { computeMargin } from "./marketplace";
import { solveMaxFob, solvePrice } from "./solvers";
import type {
  ImportInput,
  LandedBreakdown,
  MarginResult,
  MarketplaceInput,
  MaxFobSolution,
  PriceSolution,
  ShippingTable,
} from "./types";

export * from "./types";
export * from "./landed";
export * from "./marketplace";
export * from "./solvers";
export * from "./validate";

export interface CalculationResult {
  landed: LandedBreakdown;
  margin: MarginResult;
  breakEvenPrice: PriceSolution;
  targetPrice: PriceSolution;
  maxFobAtTarget: MaxFobSolution;
  maxFobAtBreakEven: MaxFobSolution;
}

export function calculate(
  i: ImportInput,
  m: MarketplaceInput,
  table: ShippingTable | undefined,
  targetMarginPct: number,
): CalculationResult {
  const landed = computeLanded(i);
  const margin = computeMargin(m, landed.unitBrl, table);
  const target = targetMarginPct / 100;
  return {
    landed,
    margin,
    breakEvenPrice: solvePrice(m, landed.unitBrl, table, 0),
    targetPrice: solvePrice(m, landed.unitBrl, table, target),
    maxFobAtTarget: solveMaxFob(i, m, table, m.price, target),
    maxFobAtBreakEven: solveMaxFob(i, m, table, m.price, 0),
  };
}

/** Margem líquida (fração) para combinações de variação de preço e de câmbio. */
export function sensitivityGrid(
  i: ImportInput,
  m: MarketplaceInput,
  table: ShippingTable | undefined,
  priceFactors: number[],
  fxFactors: number[],
): number[][] {
  return priceFactors.map((pf) =>
    fxFactors.map((ff) => {
      const landed = computeLanded({
        ...i,
        fxCustoms: i.fxCustoms * ff,
        fxPayment: i.fxPayment * ff,
      });
      return computeMargin(m, landed.unitBrl, table, m.price * pf).marginPct;
    }),
  );
}
