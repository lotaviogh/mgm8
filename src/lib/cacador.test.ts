import { describe, expect, it } from "vitest";
import {
  buildRfq,
  emptyQuote,
  evaluateQuote,
  exampleQuotes,
  formForQuote,
  isHttpUrl,
  parseQuotesText,
  rankQuotes,
  type SupplierQuote,
} from "./cacador";
import { EXAMPLE_FORM, computeAll } from "./form";

const brief = EXAMPLE_FORM; // FOB 3, 1000 un, frete US$ 600, preço R$ 129,90, meta 20%
const teto = computeAll(brief).result!.maxFobAtTarget.maxFobUnitUsd!;

const quote = (over: Partial<SupplierQuote>): SupplierQuote => ({
  ...emptyQuote(),
  supplier: "Fábrica A",
  fobUnitUsd: "3,00",
  moq: "1000",
  ...over,
});

describe("evaluateQuote", () => {
  it("com o FOB e o lote do briefing, reproduz a margem da calculadora", () => {
    const ev = evaluateQuote(brief, quote({}));
    const base = computeAll(brief).result!;
    expect(ev.marginPct).toBeCloseTo(base.margin.marginPct, 12);
    expect(ev.landedUnit).toBeCloseTo(base.landed.unitBrl, 10);
    expect(ev.status).toBe("ok");
    expect(ev.freightSource).toBe("proporcional");
  });

  it("no teto de FOB a margem é exatamente a meta e a cotação ainda passa", () => {
    const ev = evaluateQuote(brief, quote({ fobUnitUsd: String(teto).replace(".", ",") }));
    expect(ev.marginPct!).toBeCloseTo(0.2, 9);
    expect(ev.status).toBe("ok");
    expect(ev.gapUsd!).toBeCloseTo(0, 9);
  });

  it("acima do teto, manda negociar até o teto e a diferença bate", () => {
    const ev = evaluateQuote(brief, quote({ fobUnitUsd: "4,50" }));
    expect(ev.status).toBe("warn");
    expect(ev.maxFobUsd!).toBeCloseTo(teto, 9);
    expect(ev.gapUsd!).toBeCloseTo(4.5 - teto, 9);
    expect(ev.message).toContain("negociar até");
  });

  it("FOB muito alto dá prejuízo e informa o preço de empate", () => {
    const ev = evaluateQuote(brief, quote({ fobUnitUsd: "9" }));
    expect(ev.status).toBe("loss");
    expect(ev.message).toContain("Empata em");
  });

  it("lote menor dilui pior os custos fixos e baixa o teto", () => {
    const pequeno = evaluateQuote(brief, quote({ moq: "300" }));
    expect(pequeno.maxFobUsd!).toBeLessThan(teto);
  });

  it("frete proporcional ao do briefing; frete informado vale mais, inclusive zero", () => {
    const prop = formForQuote(brief, quote({ moq: "500" }));
    expect(prop.form.freightIntlTotalUsd).toBe("300");
    expect(prop.freightSource).toBe("proporcional");
    const zero = evaluateQuote(brief, quote({ freightIntlTotalUsd: "0" }));
    const normal = evaluateQuote(brief, quote({}));
    expect(zero.freightSource).toBe("informado");
    expect(zero.marginPct!).toBeGreaterThan(normal.marginPct!);
  });

  it("sem FOB ou sem quantidade fica incompleto, sem chutar valor", () => {
    expect(evaluateQuote(brief, quote({ fobUnitUsd: "" })).status).toBe("incompleto");
    const ev = evaluateQuote(brief, quote({ moq: "" }));
    expect(ev.status).toBe("incompleto");
    expect(ev.marginPct).toBeNull();
  });

  it("considera os custos do Full do briefing", () => {
    const comFull = { ...brief, fulfillment: "full" as const, fullDaysInStock: "60" };
    const a = evaluateQuote(brief, quote({}));
    const b = evaluateQuote(comFull, quote({}));
    expect(b.marginPct!).toBeLessThan(a.marginPct!);
  });
});

describe("rankQuotes", () => {
  it("ordena por margem, deixa incompletos e descartados no fim", () => {
    const mk = (id: string, over: Partial<SupplierQuote>) => {
      const q = quote({ id, supplier: id, ...over });
      return { quote: q, ev: evaluateQuote(brief, q) };
    };
    const ranked = rankQuotes([
      mk("caro", { fobUnitUsd: "4,50" }),
      mk("descartado", { fobUnitUsd: "1", stage: "descartado" }),
      mk("incompleto", { fobUnitUsd: "" }),
      mk("barato", { fobUnitUsd: "2" }),
    ]);
    expect(ranked.map((x) => x.quote.supplier)).toEqual(["barato", "caro", "incompleto", "descartado"]);
  });
});

describe("parseQuotesText", () => {
  it("lê tabulação com cabeçalho, frete e prazo opcionais", () => {
    const text = [
      "Fornecedor\tLink\tFOB\tQtd\tFrete\tPrazo\tObs",
      "Fábrica A\thttps://exemplo.com/a\t2,80\t1000\t\t25\tamostra grátis",
      "Fábrica B\t\t3,10\t500\t350\t30\t",
    ].join("\n");
    const { quotes, skipped } = parseQuotesText(text);
    expect(skipped).toBe(0);
    expect(quotes).toHaveLength(2);
    expect(quotes[0]).toMatchObject({ supplier: "Fábrica A", fobUnitUsd: "2,80", moq: "1000", leadTimeDays: "25" });
    expect(quotes[1]).toMatchObject({ supplier: "Fábrica B", freightIntlTotalUsd: "350", evidenceUrl: "" });
  });

  it("fornecedor sem preço entra como incompleto, não é pulado", () => {
    const { quotes, skipped } = parseQuotesText("Fábrica E\thttps://exemplo.com/e\t\t\t\t\t");
    expect(skipped).toBe(0);
    expect(quotes).toHaveLength(1);
    expect(evaluateQuote(brief, quotes[0]).status).toBe("incompleto");
  });

  it("células vazias no fim da linha, como vêm do Excel, não fazem a linha sumir", () => {
    const { quotes, skipped } = parseQuotesText("Fábrica F\t\t\t\t\t\t\n\t\t\t\n");
    expect(skipped).toBe(0);
    expect(quotes.map((q) => q.supplier)).toEqual(["Fábrica F"]);
  });

  it("aceita ponto e vírgula e pula linhas inválidas", () => {
    const { quotes, skipped } = parseQuotesText("Fábrica C;;3,5;800\nsem separador\n;link;4;100\nFábrica D;;abc;10");
    expect(quotes.map((q) => q.supplier)).toEqual(["Fábrica C"]);
    expect(skipped).toBe(3);
  });
});

describe("exampleQuotes", () => {
  it("cobre dentro do teto, acima do teto, prejuízo, lote pequeno e incompleto", () => {
    const status = exampleQuotes().map((q) => evaluateQuote(brief, q).status);
    expect(status).toEqual(["ok", "warn", "loss", "ok", "incompleto"]);
    expect(exampleQuotes().every((q) => q.supplier.includes("(exemplo)"))).toBe(true);
  });
});

describe("links e RFQ", () => {
  it("só http e https viram link", () => {
    expect(isHttpUrl("https://alibaba.com/x")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("conversa por e-mail")).toBe(false);
  });

  it("o RFQ só cita o preço-alvo quando pedido", () => {
    const sem = buildRfq({ product: "Foldable organizer", supplier: "Fábrica A", quantity: 1000, targetFobUsd: null });
    const com = buildRfq({ product: "Foldable organizer", supplier: "Fábrica A", quantity: 1000, targetFobUsd: 3.456 });
    expect(sem.body).not.toContain("target price");
    expect(com.body).toContain("USD 3.46");
    expect(com.subject).toContain("1000 units");
    expect(sem.body.startsWith("Hello Fábrica A team,")).toBe(true);
  });
});
