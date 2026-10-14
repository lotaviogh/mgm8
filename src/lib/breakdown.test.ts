import { describe, expect, it } from "vitest";
import { EXAMPLE_FORM, computeAll, type Form } from "./form";
import { unitCosts } from "./breakdown";

function check(form: Form) {
  const c = computeAll(form);
  expect(c.errors).toEqual([]);
  const r = c.result!;
  const u = unitCosts(r.landed, r.margin, c.imp.quantity);
  // A importação inteira bate com o custo nacionalizado por unidade.
  expect(u.goods + u.taxes + u.expenses).toBeCloseTo(r.landed.unitBrl, 9);
  // Os sete custos mais o lucro fecham o preço de venda.
  const sum = u.goods + u.taxes + u.expenses + u.marketplace + u.saleTax + u.fulfillment + u.other + r.margin.profit;
  expect(sum).toBeCloseTo(r.margin.price, 9);
}

describe("unitCosts", () => {
  it("fecha com o preço no cenário de exemplo (Simples Nacional, marítimo)", () => {
    check(EXAMPLE_FORM);
  });

  it("fecha com créditos de lucro real, frete aéreo e custo do ML informado à mão", () => {
    check({
      ...EXAMPLE_FORM,
      regime: "real",
      modal: "aereo",
      shippingMode: "manual",
      manualShippingCostBrl: "21,90",
      insurancePct: "0,5",
      cofinsAdicionalPct: "0,6",
    });
  });

  it("fecha com o Full: armazenagem por dia, abastecimento e outras tarifas", () => {
    const form: Form = {
      ...EXAMPLE_FORM,
      fulfillment: "full",
      fullStorageRatePerDayBrl: "0,015",
      fullDaysInStock: "45",
      fullInboundPerUnitBrl: "0,80",
      fullOtherPerUnitBrl: "0,25",
    };
    check(form);
    const c = computeAll(form);
    // 0,015 × 45 + 0,80 + 0,25 = 1,725
    expect(c.mkt.fulfillmentUnitCostBrl).toBeCloseTo(1.725, 10);
    expect(c.result!.margin.fulfillment).toBeCloseTo(1.725, 10);
  });

  it("em coleta os campos do Full não interferem, nem inválidos", () => {
    const c = computeAll({ ...EXAMPLE_FORM, fulfillment: "coleta", fullDaysInStock: "abc" });
    expect(c.errors).toEqual([]);
    expect(c.mkt.fulfillmentUnitCostBrl).toBe(0);
  });

  it("no Full, campo vazio é acusado na validação", () => {
    const c = computeAll({ ...EXAMPLE_FORM, fulfillment: "full", fullDaysInStock: "" });
    expect(c.errors.join(" ")).toContain("Full");
  });

  it("o cenário de exemplo não tem erros de validação", () => {
    expect(computeAll(EXAMPLE_FORM).errors).toEqual([]);
  });
});
