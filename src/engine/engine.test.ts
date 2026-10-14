import { describe, expect, it } from "vitest";
import { mlShippingVerde202603 as table } from "@/data/ml-shipping-verde-2026-03";
import {
  calculate,
  computeLanded,
  computeMargin,
  landedUnitAtFob,
  lookupMlCost,
  sensitivityGrid,
  solveMaxFob,
  solvePrice,
  validateInputs,
  type ImportInput,
  type MarketplaceInput,
} from "./index";

const base: ImportInput = {
  fobUnitUsd: 3,
  quantity: 1000,
  freightIntlTotalUsd: 600,
  insurancePct: 0,
  modal: "maritimo",
  fxCustoms: 5.5,
  fxPayment: 5.5,
  iofCambioPct: 0.38,
  bankFeeBrl: 0,
  iiPct: 20,
  ipiPct: 10,
  pisImportPct: 2.1,
  cofinsImportPct: 9.65,
  cofinsAdicionalPct: 0,
  icmsPct: 18,
  afrmmPct: 8,
  siscomexBrl: 154.23,
  customsExpensesBrl: 500,
  otherImportExpensesBrl: 1200,
  recoverIcms: false,
  recoverPisCofins: false,
};

const mkt: MarketplaceInput = {
  price: 129.9,
  commissionPct: 16,
  shippingMode: "tabela",
  weightKg: 0.4,
  manualShippingCostBrl: 0,
  saleTaxPct: 6,
  adsPct: 5,
  lossPct: 2,
  packagingBrl: 1.5,
  otherUnitCostBrl: 0,
  fulfillmentUnitCostBrl: 0,
};

describe("custo nacionalizado (cálculo feito à mão)", () => {
  // FOB 3.000 + frete 600 = US$ 3.600 × 5,50 = R$ 19.800 (valor aduaneiro)
  // II 3.960 | IPI (19.800+3.960)×10% = 2.376 | PIS 415,80 | COFINS 1.910,70
  // AFRMM 600×5,5×8% = 264 | Siscomex 154,23 | despesas aduaneiras 500
  // ICMS por dentro: base = 29.380,73 / 0,82 = 35.830,1585 → ICMS 6.449,4285
  // IOF 0,38% × 19.800 = 75,24 | outras despesas 1.200
  const r = computeLanded(base);

  it("calcula cada componente", () => {
    expect(r.customsValueBrl).toBeCloseTo(19800, 6);
    expect(r.ii).toBeCloseTo(3960, 6);
    expect(r.ipi).toBeCloseTo(2376, 6);
    expect(r.pis).toBeCloseTo(415.8, 6);
    expect(r.cofins).toBeCloseTo(1910.7, 6);
    expect(r.afrmm).toBeCloseTo(264, 6);
    expect(r.iofBrl).toBeCloseTo(75.24, 6);
    expect(r.icmsBase).toBeCloseTo(35830.1585, 3);
    expect(r.icms).toBeCloseTo(6449.4285, 3);
  });

  it("soma o total e o custo unitário", () => {
    expect(r.totalBrl).toBeCloseTo(37105.3985, 3);
    expect(r.unitBrl).toBeCloseTo(37.1054, 3);
  });

  it("ICMS por dentro: o imposto é a alíquota da base que já o inclui", () => {
    expect(r.icms / r.icmsBase).toBeCloseTo(0.18, 10);
    expect(r.icmsBase - r.icms).toBeCloseTo(29380.73, 6);
  });

  it("AFRMM só existe no modal marítimo", () => {
    expect(computeLanded({ ...base, modal: "aereo" }).afrmm).toBe(0);
    expect(computeLanded({ ...base, modal: "courier" }).afrmm).toBe(0);
  });

  it("créditos reduzem o total pelo valor creditado", () => {
    const withIcms = computeLanded({ ...base, recoverIcms: true });
    expect(r.totalBrl - withIcms.totalBrl).toBeCloseTo(r.icms, 6);
    const withPisCofins = computeLanded({ ...base, recoverPisCofins: true });
    expect(r.totalBrl - withPisCofins.totalBrl).toBeCloseTo((19800 + 2376) * 0.1175, 6);
  });

  it("câmbio de pagamento mais caro que o aduaneiro encarece só a parte paga", () => {
    const worse = computeLanded({ ...base, fxPayment: 5.6 });
    expect(worse.customsValueBrl).toBeCloseTo(r.customsValueBrl, 9);
    expect(worse.ii).toBeCloseTo(r.ii, 9);
    expect(worse.paymentBrl).toBeGreaterThan(r.paymentBrl);
  });

  it("o custo unitário é linear no FOB", () => {
    const l0 = landedUnitAtFob(base, 0);
    const l1 = landedUnitAtFob(base, 1);
    const l2 = landedUnitAtFob(base, 2);
    expect(l2 - l1).toBeCloseTo(l1 - l0, 9);
  });
});

describe("tabela de custos do Mercado Livre", () => {
  it("confere linhas de controle contra a fonte", () => {
    expect(table.rows[0].costs).toEqual([5.65, 6.55, 7.75, 12.35, 14.35, 16.45, 18.45, 20.95]);
    expect(table.rows[7].costs[3]).toBe(18.45); // 4 a 5 kg, R$ 79 a 99,99
    expect(table.rows[table.rows.length - 1].costs[7]).toBe(261.95); // mais de 150 kg
    expect(table.rows).toHaveLength(29);
  });

  it("o custo nunca diminui com mais peso nem com preço maior (pega erro de digitação)", () => {
    for (let r = 0; r < table.rows.length; r++) {
      const costs = table.rows[r].costs;
      for (let c = 1; c < costs.length; c++) expect(costs[c]).toBeGreaterThanOrEqual(costs[c - 1]);
      if (r > 0) {
        for (let c = 0; c < costs.length; c++) {
          expect(costs[c]).toBeGreaterThanOrEqual(table.rows[r - 1].costs[c]);
        }
      }
    }
  });

  it("fronteiras: peso é inclusivo no limite superior, preço no inferior", () => {
    expect(lookupMlCost(table, 0.3, 50).value).toBe(7.75); // até 0,3 kg
    expect(lookupMlCost(table, 0.31, 50).value).toBe(7.85); // de 0,3 a 0,5 kg
    expect(lookupMlCost(table, 0.3, 78.99).value).toBe(7.75);
    expect(lookupMlCost(table, 0.3, 79).value).toBe(12.35); // R$ 79 já é outra faixa
    expect(lookupMlCost(table, 500, 300).value).toBe(261.95);
  });
});

describe("margem no marketplace (cálculo feito à mão)", () => {
  // preço 129,90 está na faixa R$ 120 a 149,99; peso 0,4 kg → linha "de 0,3 a 0,5": R$ 17,65
  const landed = computeLanded(base).unitBrl;
  const r = computeMargin(mkt, landed, table);

  it("aplica a faixa certa da tabela", () => {
    expect(r.mlUnitCost).toBe(17.65);
  });

  it("calcula lucro e margem", () => {
    // 129,90 − 20,784 − 17,65 − 7,794 − 6,495 − 2,598 − 1,50 − 37,1054 = 35,9736
    expect(r.profit).toBeCloseTo(35.9736, 3);
    expect(r.marginPct).toBeCloseTo(0.27693, 4);
  });
});

describe("preço mínimo", () => {
  const landed = computeLanded(base).unitBrl;

  it("o preço de equilíbrio dá lucro >= 0 e um centavo a menos dá prejuízo", () => {
    const s = solvePrice(mkt, landed, table, 0);
    expect(s.feasible).toBe(true);
    const at = computeMargin(mkt, landed, table, s.price!);
    const below = computeMargin(mkt, landed, table, s.price! - 0.01);
    expect(at.profit).toBeGreaterThanOrEqual(-1e-6);
    expect(below.profit).toBeLessThan(0);
  });

  it("o preço para a margem-alvo entrega a margem pedida", () => {
    const s = solvePrice(mkt, landed, table, 0.2);
    expect(s.feasible).toBe(true);
    const at = computeMargin(mkt, landed, table, s.price!);
    expect(at.marginPct).toBeGreaterThanOrEqual(0.2 - 1e-6);
    if (!s.atBandEdge) {
      const below = computeMargin(mkt, landed, table, s.price! - 0.01);
      expect(below.marginPct).toBeLessThan(0.2);
    }
  });

  it("trata o salto de tabela em R$ 79: o preço pode ficar no limite da faixa", () => {
    // Custo baixo e peso alto fazem a equação cair abaixo de R$ 79 na faixa seguinte
    const heavy = { ...mkt, weightKg: 4.5 };
    const s = solvePrice(heavy, 20, table, 0);
    expect(s.feasible).toBe(true);
    const at = computeMargin(heavy, 20, table, s.price!);
    expect(at.profit).toBeGreaterThanOrEqual(-1e-6);
  });

  it("recusa margem impossível", () => {
    const s = solvePrice({ ...mkt, commissionPct: 60, saleTaxPct: 30 }, landed, table, 0.2);
    expect(s.feasible).toBe(false);
    expect(s.reason).toBeTruthy();
  });

  it("modo manual usa o custo informado", () => {
    const manual = { ...mkt, shippingMode: "manual" as const, manualShippingCostBrl: 20 };
    const s = solvePrice(manual, landed, undefined, 0);
    const at = computeMargin(manual, landed, undefined, s.price!);
    expect(at.profit).toBeGreaterThanOrEqual(-1e-6);
    expect(computeMargin(manual, landed, undefined, s.price! - 0.01).profit).toBeLessThan(0);
  });
});

describe("FOB máximo (cálculo reverso)", () => {
  it("ao usar o FOB máximo, a margem é exatamente a pedida", () => {
    for (const target of [0, 0.1, 0.25]) {
      const s = solveMaxFob(base, mkt, table, mkt.price, target);
      expect(s.feasible).toBe(true);
      const landed = landedUnitAtFob(base, s.maxFobUnitUsd!);
      const m = computeMargin(mkt, landed, table);
      expect(m.marginPct).toBeCloseTo(target, 9);
    }
  });

  it("funciona com créditos e modal aéreo", () => {
    const i = { ...base, modal: "aereo" as const, recoverIcms: true, recoverPisCofins: true };
    const s = solveMaxFob(i, mkt, table, mkt.price, 0.15);
    expect(s.feasible).toBe(true);
    const m = computeMargin(mkt, landedUnitAtFob(i, s.maxFobUnitUsd!), table);
    expect(m.marginPct).toBeCloseTo(0.15, 9);
  });

  it("avisa quando nem FOB zero fecha a conta", () => {
    // Preço 30, margem 35%: 30 × (1 − 0,29 − 0,35) = 10,80, menos R$ 6,65 do ML (faixa R$ 19 a 48,99,
    // linha de 0,3 a 0,5 kg) e R$ 1,50 de embalagem, sobram R$ 2,65 para o custo. Só o frete, os
    // tributos sobre ele e as despesas fixas do lote já custam cerca de R$ 8,12 por unidade com FOB zero.
    const s = solveMaxFob(base, { ...mkt, price: 30 }, table, 30, 0.35);
    expect(s.feasible).toBe(false);
    expect(s.allowedLandedUnitBrl).toBeCloseTo(2.65, 6);
    expect(s.reason).toBeTruthy();
  });
});

describe("calculate e sensibilidade", () => {
  it("agrega os resultados de forma consistente", () => {
    const res = calculate(base, mkt, table, 20);
    expect(res.margin.profit).toBeCloseTo(35.9736, 3);
    expect(res.breakEvenPrice.price!).toBeLessThan(mkt.price);
    expect(res.maxFobAtBreakEven.maxFobUnitUsd!).toBeGreaterThan(res.maxFobAtTarget.maxFobUnitUsd!);
    expect(res.maxFobAtBreakEven.maxFobUnitUsd!).toBeGreaterThan(base.fobUnitUsd);
  });

  it("a grade no ponto central reproduz a margem base; dólar mais caro reduz a margem", () => {
    const grid = sensitivityGrid(base, mkt, table, [0.9, 1, 1.1], [0.9, 1, 1.1]);
    const center = computeMargin(mkt, computeLanded(base).unitBrl, table).marginPct;
    expect(grid[1][1]).toBeCloseTo(center, 12);
    expect(grid[1][2]).toBeLessThan(grid[1][1]);
    expect(grid[2][1]).toBeGreaterThan(grid[0][1]);
  });
});

describe("validação de entradas", () => {
  it("aceita o cenário base", () => {
    expect(validateInputs(base, mkt, 20)).toEqual([]);
  });

  it("rejeita valores inválidos com mensagens em português", () => {
    const errs = validateInputs({ ...base, quantity: 0, fxCustoms: -1, icmsPct: 100 }, { ...mkt, price: 0 }, 150);
    expect(errs.length).toBeGreaterThanOrEqual(5);
    expect(errs.join(" ")).toContain("quantidade");
  });
});

describe("custos do Full por unidade", () => {
  const full: MarketplaceInput = { ...mkt, fulfillmentUnitCostBrl: 2.4 };
  const landed = computeLanded(base).unitBrl;

  it("reduzem o lucro exatamente pelo valor informado", () => {
    const sem = computeMargin(mkt, landed, table);
    const com = computeMargin(full, landed, table);
    expect(sem.profit - com.profit).toBeCloseTo(2.4, 10);
    expect(com.fulfillment).toBe(2.4);
  });

  it("o preço para a meta continua entregando a meta com custos do Full", () => {
    const sol = solvePrice(full, landed, table, 0.2);
    expect(sol.feasible).toBe(true);
    const m = computeMargin(full, landed, table, sol.price!);
    expect(m.marginPct).toBeGreaterThanOrEqual(0.2 - 1e-9);
    // um centavo a menos já não fecha, a menos que o preço esteja na borda de uma faixa de custo do ML
    if (!sol.atBandEdge) {
      expect(computeMargin(full, landed, table, sol.price! - 0.01).marginPct).toBeLessThan(0.2);
    }
  });

  it("o FOB máximo com custos do Full entrega exatamente a margem pedida", () => {
    const sol = solveMaxFob(base, full, table, full.price, 0.2);
    expect(sol.feasible).toBe(true);
    const l = landedUnitAtFob(base, sol.maxFobUnitUsd!);
    expect(computeMargin(full, l, table).marginPct).toBeCloseTo(0.2, 10);
  });

  it("o FOB máximo cai com os custos do Full", () => {
    const sem = solveMaxFob(base, mkt, table, mkt.price, 0.2).maxFobUnitUsd!;
    const com = solveMaxFob(base, full, table, full.price, 0.2).maxFobUnitUsd!;
    expect(com).toBeLessThan(sem);
  });

  it("recusa custo do Full negativo", () => {
    const errs = validateInputs(base, { ...mkt, fulfillmentUnitCostBrl: -1 }, 20);
    expect(errs.join(" ")).toContain("Full");
  });
});
