"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { mlShippingVerde202603 } from "@/data/ml-shipping-verde-2026-03";
import { PARAMS } from "@/data/params";
import { sensitivityGrid, type ParamMeta, type ParamStatus, type PriceSolution } from "@/engine";
import { unitCosts } from "@/lib/breakdown";
import { createBrief, takeHandoff } from "@/lib/cacador";
import { fmtBrl, fmtPct, fmtUsd, parseNum } from "@/lib/format";
import {
  EXAMPLE_FORM,
  FULL_SIZES,
  computeAll,
  loadScenarios,
  saveScenarios,
  type Form,
  type Fulfillment,
  type FullSize,
  type Regime,
  type Scenario,
} from "@/lib/form";
import { Field, SelectField, type FieldProps } from "./Field";
import { StackBar, type StackSegment } from "./StackBar";

/** Chaves do formulário que guardam texto livre (exclui modal, regime e modo do frete). */
type TextKey = { [K in keyof Form]: string extends Form[K] ? K : never }[keyof Form];

const PRICE_FACTORS = [0.9, 0.95, 1, 1.05, 1.1];
const FX_FACTORS = [0.9, 0.95, 1, 1.05, 1.1];
const MAX_SCENARIOS = 8;

const fmtFx = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const fmtSigned = (factor: number) =>
  factor === 1 ? "hoje" : `${factor > 1 ? "+" : "−"}${Math.abs(Math.round((factor - 1) * 100))}%`;

function priceText(s: PriceSolution): string {
  return s.feasible && s.price !== null ? fmtBrl(s.price) : "Sem solução";
}

function cellClass(margin: number, target: number, base: boolean): string {
  const tone = margin < 0 ? "cell-loss" : margin < target ? "cell-warn" : "cell-ok";
  return base ? `${tone} cell-base` : tone;
}

type PtaxState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ok"; msg: string }
  | { state: "erro"; msg: string };

export default function Calculator() {
  const [form, setForm] = useState<Form>(EXAMPLE_FORM);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [saveMsg, setSaveMsg] = useState("");
  const [ptax, setPtax] = useState<PtaxState>({ state: "idle" });
  const [briefMsg, setBriefMsg] = useState("");
  const router = useRouter();

  useEffect(() => {
    setScenarios(loadScenarios());
    // Briefing que voltou do Caçador para ser editado.
    const handoff = takeHandoff();
    if (handoff) setForm(handoff);
  }, []);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const computed = useMemo(() => computeAll(form), [form]);
  const { errors, imp, mkt, targetMarginPct, table, result } = computed;
  const target = targetMarginPct / 100;

  const grid = useMemo(
    () => (result ? sensitivityGrid(imp, mkt, table, PRICE_FACTORS, FX_FACTORS) : null),
    [result, imp, mkt, table],
  );

  const scenarioRows = useMemo(
    () => scenarios.map((s) => ({ s, c: computeAll(s.form) })),
    [scenarios],
  );

  /** Marca "a confirmar" só enquanto o valor digitado é o padrão não verificado. */
  const flag = (key: TextKey, p: ParamMeta): ParamStatus | undefined =>
    p.status === "a_confirmar" && parseNum(form[key]) === p.value ? "a_confirmar" : undefined;

  const field = (
    key: TextKey,
    label: string,
    opts: Omit<FieldProps, "id" | "label" | "value" | "onChange"> = {},
  ) => (
    <Field id={key} label={label} value={form[key]} onChange={(v) => set(key, v)} {...opts} />
  );

  const pending: string[] = [];
  if (flag("iofCambioPct", PARAMS.iofCambioPct)) pending.push(PARAMS.iofCambioPct.label);
  if (flag("icmsPct", PARAMS.icmsImportPct)) pending.push(PARAMS.icmsImportPct.label);
  if (flag("siscomexBrl", PARAMS.siscomexBrl)) pending.push(PARAMS.siscomexBrl.label);
  if (flag("commissionPct", PARAMS.commissionPct)) pending.push(PARAMS.commissionPct.label);
  if (form.shippingMode === "tabela") pending.push("Tabela de custos por unidade do Mercado Livre");
  const fullSizeParam = FULL_SIZES.find((x) => x.id === form.fullSize)!.param;
  if (form.fulfillment === "full" && flag("fullStorageRatePerDayBrl", fullSizeParam)) {
    pending.push("Armazenagem no Full");
  }

  async function fetchPtax() {
    setPtax({ state: "loading" });
    try {
      const res = await fetch("/api/ptax", { cache: "no-store" });
      const data = (await res.json()) as {
        venda?: number;
        dataHora?: string;
        erro?: string;
      };
      if (!res.ok || data.erro || typeof data.venda !== "number") {
        throw new Error(data.erro ?? "O Banco Central não respondeu. Digite o câmbio manualmente.");
      }
      set("fxCustoms", data.venda.toFixed(4).replace(".", ","));
      const [y, m, d] = (data.dataHora ?? "").slice(0, 10).split("-");
      const day = y && m && d ? ` de ${d}/${m}/${y}` : "";
      setPtax({
        state: "ok",
        msg: `PTAX de venda${day}: R$ ${data.venda.toFixed(4).replace(".", ",")}. O despacho usa a taxa da data de registro: confira com o despachante.`,
      });
    } catch (e) {
      setPtax({
        state: "erro",
        msg: e instanceof Error ? e.message : "Não foi possível buscar a cotação. Digite o câmbio manualmente.",
      });
    }
  }

  function saveCurrent() {
    if (scenarios.length >= MAX_SCENARIOS) {
      setSaveMsg(`Limite de ${MAX_SCENARIOS} cenários. Remova um para salvar outro.`);
      return;
    }
    const next: Scenario[] = [
      ...scenarios,
      {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        savedAt: new Date().toISOString(),
        form,
      },
    ];
    setScenarios(next);
    setSaveMsg(
      saveScenarios(next)
        ? "Cenário salvo neste navegador."
        : "O navegador bloqueou o armazenamento local: o cenário aparece aqui, mas some ao fechar a página.",
    );
  }

  function sendToCacador() {
    const r = createBrief(form);
    if (r.ok) router.push("/cacador");
    else setBriefMsg(r.reason);
  }

  function removeScenario(id: string) {
    const next = scenarios.filter((s) => s.id !== id);
    setScenarios(next);
    saveScenarios(next);
    setSaveMsg("Cenário removido.");
  }

  // ---------- derivados do resultado ----------
  const view = result
    ? (() => {
        const u = unitCosts(result.landed, result.margin, imp.quantity);
        const m = result.margin;
        const state: "ok" | "warn" | "loss" =
          m.profit < 0 ? "loss" : m.marginPct >= target ? "ok" : "warn";
        const stateText =
          state === "ok"
            ? `Fecha a meta de ${fmtPct(target, 0)}`
            : state === "warn"
              ? `Lucra, mas abaixo da meta de ${fmtPct(target, 0)}`
              : "Vende com prejuízo";
        const segments: StackSegment[] = [
          { key: "goods", label: "Mercadoria, frete e câmbio", value: u.goods, color: "var(--imp-1)" },
          {
            key: "taxes",
            label: "Tributos da importação, líquidos de créditos",
            value: u.taxes,
            color: "var(--imp-2)",
          },
          { key: "expenses", label: "Despesas de importação", value: u.expenses, color: "var(--imp-3)" },
          {
            key: "marketplace",
            label: "Mercado Livre: comissão e tarifa por unidade",
            value: u.marketplace,
            color: "var(--sale-1)",
          },
          { key: "saleTax", label: "Imposto sobre a venda", value: u.saleTax, color: "var(--sale-2)" },
          ...(form.fulfillment === "full"
            ? [
                {
                  key: "fulfillment",
                  label: "Full: armazenagem, abastecimento e tarifas",
                  value: u.fulfillment,
                  color: "var(--sale-4)",
                },
              ]
            : []),
          {
            key: "other",
            label: "Ads, perdas, embalagem e outros",
            value: u.other,
            color: "var(--sale-3)",
          },
        ];
        const l = result.landed;
        const composition: [string, number][] = (
          [
            ["Pagamento ao exterior (mercadoria, frete e seguro)", l.paymentBrl],
            ["IOF de câmbio", l.iofBrl],
            ["Tarifas bancárias", l.bankFeeBrl],
            ["Imposto de Importação", l.ii],
            ["IPI", l.ipi],
            ["PIS-Importação", l.pis],
            ["COFINS-Importação", l.cofins],
            ["AFRMM", l.afrmm],
            ["Taxa Siscomex", l.siscomex],
            ["Despesas aduaneiras", l.customsExpenses],
            ["ICMS da importação", l.icms],
            ["Outras despesas de importação", l.otherExpenses],
            ["Crédito de ICMS", -l.icmsCredit],
            ["Crédito de PIS e COFINS", -l.pisCofinsCredit],
          ] as [string, number][]
        ).filter(([, v]) => v !== 0);
        return { m, state, stateText, segments, composition };
      })()
    : null;

  const maxFob = result?.maxFobAtTarget;
  const maxFobBreakEven = result?.maxFobAtBreakEven;

  return (
    <main className="app">
      <header className="head">
        <h1>Calculadora de margem</h1>
        <p>
          Quanto custa trazer o produto até o estoque, quanto sobra depois do Mercado Livre e até quanto
          o fornecedor pode cobrar para fechar a sua meta.
        </p>
        <div className="head-actions">
          <button type="button" className="btn-quiet" onClick={() => setForm(EXAMPLE_FORM)}>
            Voltar ao exemplo
          </button>
        </div>
      </header>

      <div className="cols">
        <div>
          <section className="form-block" aria-labelledby="sec-produto">
            <h2 className="section-title" id="sec-produto">
              Produto e lote
            </h2>
            {field("name", "Nome do produto", { wide: true, inputMode: "text" })}
            {field("fobUnitUsd", "Preço no fornecedor (FOB)", { unit: "US$/un" })}
            {field("quantity", "Unidades no lote", { unit: "un", inputMode: "numeric" })}
            {field("weightKg", "Peso para o frete do Mercado Livre", {
              unit: "kg",
              hint: "O maior entre o peso real e o cubado (comprimento × largura × altura em cm ÷ 6.000; o divisor está a confirmar).",
            })}
          </section>

          <section className="form-block" aria-labelledby="sec-frete">
            <h2 className="section-title" id="sec-frete">
              Frete e câmbio
            </h2>
            <SelectField
              id="modal"
              label="Modal"
              value={form.modal}
              onChange={(v) => set("modal", v)}
              options={[
                { value: "maritimo", label: "Marítimo" },
                { value: "aereo", label: "Aéreo" },
                { value: "courier", label: "Courier" },
              ]}
            />
            {field("freightIntlTotalUsd", "Frete internacional do lote", {
              unit: "US$",
              hint: "Valor do lote inteiro. Deixe zero se o preço do fornecedor já inclui o frete (CIF).",
            })}
            {field("insurancePct", "Seguro internacional", { unit: "% do FOB" })}
            {field("fxCustoms", "Dólar para o valor aduaneiro", { unit: "R$/US$" })}
            <div className="row">
              <div>
                <button type="button" className="btn" onClick={fetchPtax} disabled={ptax.state === "loading"}>
                  {ptax.state === "loading" ? "Buscando…" : "Buscar PTAX de hoje"}
                </button>
              </div>
              <div />
              <p
                className={ptax.state === "erro" ? "note note-error" : "note"}
                role="status"
                style={{ gridColumn: "1 / -1", margin: 0 }}
              >
                {ptax.state === "ok" || ptax.state === "erro" ? ptax.msg : null}
              </p>
            </div>
            {field("fxSpreadPct", "Spread do banco sobre o dólar pago", {
              unit: "%",
              hint: "Quanto a mais por dólar o banco cobra na hora de pagar o fornecedor.",
            })}
            {field("iofCambioPct", "IOF de câmbio", {
              unit: "%",
              status: flag("iofCambioPct", PARAMS.iofCambioPct),
            })}
            {field("bankFeeBrl", "Tarifas bancárias da remessa", { unit: "R$" })}
          </section>

          <section className="form-block" aria-labelledby="sec-tributos">
            <h2 className="section-title" id="sec-tributos">
              Tributos da importação
            </h2>
            <SelectField<Regime>
              id="regime"
              label="Regime tributário do importador"
              value={form.regime}
              onChange={(v) => set("regime", v)}
              hint="Define quais créditos você recupera: nenhum no Simples, ICMS no presumido, ICMS e PIS/COFINS no real."
              options={[
                { value: "simples", label: "Simples Nacional" },
                { value: "presumido", label: "Lucro presumido" },
                { value: "real", label: "Lucro real" },
              ]}
            />
            {field("iiPct", "Imposto de Importação (II)", {
              unit: "%",
              hint: "Alíquota da TEC para a NCM do produto.",
            })}
            {field("ipiPct", "IPI", {
              unit: "%",
              hint: "Alíquota da TIPI para a NCM. Nesta versão o IPI entra no custo e não é recuperado.",
            })}
            {field("pisImportPct", "PIS-Importação", { unit: "%" })}
            {field("cofinsImportPct", "COFINS-Importação", { unit: "%" })}
            {field("cofinsAdicionalPct", "Adicional de COFINS-Importação", {
              unit: "p.p.",
              hint: "0,6 ponto percentual em alguns casos. Deixe zero se não se aplica.",
            })}
            {field("icmsPct", "ICMS da importação", {
              unit: "%",
              hint: "Alíquota do estado do importador.",
              status: flag("icmsPct", PARAMS.icmsImportPct),
            })}
            {form.modal === "maritimo"
              ? field("afrmmPct", "AFRMM", { unit: "% do frete" })
              : null}
            {field("siscomexBrl", "Taxa Siscomex", {
              unit: "R$",
              status: flag("siscomexBrl", PARAMS.siscomexBrl),
            })}
            {field("customsExpensesBrl", "Despesas aduaneiras do lote", {
              unit: "R$",
              hint: "Capatazia, armazenagem no porto. Entram na base do ICMS.",
            })}
            {field("otherImportExpensesBrl", "Outras despesas de importação do lote", {
              unit: "R$",
              hint: "Despachante, transporte até o seu estoque. Não entram na base do ICMS.",
            })}
          </section>

          <section className="form-block" aria-labelledby="sec-venda">
            <h2 className="section-title" id="sec-venda">
              Venda no Mercado Livre
            </h2>
            {field("price", "Preço de venda", { unit: "R$" })}
            {field("commissionPct", "Comissão do anúncio", {
              unit: "%",
              hint: "Percentual da sua categoria e tipo de anúncio.",
              status: flag("commissionPct", PARAMS.commissionPct),
            })}
            <div className="row">
              <span className="row-label" id="shipping-mode-label">
                Custo por unidade do Mercado Livre
                {form.shippingMode === "tabela" ? <span className="needs-check">a confirmar</span> : null}
                <span className="row-hint">
                  Tarifa que o ML cobra por peso e faixa de preço, no lugar do antigo custo fixo.
                </span>
              </span>
              <div className="segmented" role="group" aria-labelledby="shipping-mode-label">
                <button
                  type="button"
                  aria-pressed={form.shippingMode === "tabela"}
                  onClick={() => set("shippingMode", "tabela")}
                >
                  Tabela do ML
                </button>
                <button
                  type="button"
                  aria-pressed={form.shippingMode === "manual"}
                  onClick={() => set("shippingMode", "manual")}
                >
                  Informar valor
                </button>
              </div>
            </div>
            {form.shippingMode === "manual" ? (
              field("manualShippingCostBrl", "Custo do ML por unidade", { unit: "R$" })
            ) : (
              <p className="note">
                {view
                  ? `Neste preço e peso o ML cobra ${fmtBrl(view.m.mlUnitCost)} por unidade (faixa de ${view.m.mlUnitCostBand}). `
                  : null}
                A tabela é a de reputação verde, MercadoLíder ou sem reputação, vigente desde 02/03/2026. Outras
                reputações têm valores diferentes: use “Informar valor”.
              </p>
            )}
            <SelectField<Fulfillment>
              id="fulfillment"
              label="Como o pedido sai do estoque"
              value={form.fulfillment}
              onChange={(v) => set("fulfillment", v)}
              hint="Coleta: o estoque fica com você. Full: o estoque fica no centro de distribuição do Mercado Livre, que armazena e entrega."
              options={[
                { value: "coleta", label: "Coleta (estoque com você)" },
                { value: "full", label: "Full (estoque no ML)" },
              ]}
            />
            {form.fulfillment === "full" ? (
              <>
                <SelectField<FullSize>
                  id="fullSize"
                  label="Porte do produto no Full"
                  value={form.fullSize}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      fullSize: v,
                      fullStorageRatePerDayBrl: String(FULL_SIZES.find((x) => x.id === v)!.param.value).replace(
                        ".",
                        ",",
                      ),
                    }))
                  }
                  options={FULL_SIZES.map((x) => ({ value: x.id, label: x.label }))}
                />
                {field("fullStorageRatePerDayBrl", "Armazenagem por unidade por dia", {
                  unit: "R$/dia",
                  hint: "Já vem preenchida pelo porte. As fontes divergem entre si: confira no painel do Full.",
                  status: flag("fullStorageRatePerDayBrl", fullSizeParam),
                })}
                {field("fullDaysInStock", "Dias médios em estoque no Full", {
                  unit: "dias",
                  inputMode: "numeric",
                  hint: "Da chegada ao centro até a venda: depende do seu giro, é premissa sua. Se houver período gratuito, reduza os dias.",
                })}
                {field("fullInboundPerUnitBrl", "Levar o estoque ao centro do Full", {
                  unit: "R$/un",
                  hint: "Frete ou coleta do seu estoque até o centro, rateado por unidade.",
                })}
                {field("fullOtherPerUnitBrl", "Retirada, estoque parado e outras tarifas", {
                  unit: "R$/un",
                  hint: "Não encontrei valores confirmados para estas tarifas. Consulte o painel do Full e preencha.",
                })}
                <p className="note">
                  {view ? `Custo do Full nesta conta: ${fmtBrl(view.m.fulfillment)} por unidade. ` : null}
                  O custo por unidade do Mercado Livre acima usa a mesma tabela da coleta: uma fonte de 2023 diz
                  que o ML cobra o frete do Full como o dos demais Mercado Envios desde 2022, mas não achei
                  confirmação para 2026.
                </p>
              </>
            ) : null}
            {field("saleTaxPct", "Imposto sobre a venda", {
              unit: "%",
              hint: "Por exemplo, a alíquota efetiva do Simples sobre o faturamento.",
            })}
            {field("adsPct", "Publicidade (Mercado Ads)", { unit: "% do preço" })}
            {field("lossPct", "Perdas, devoluções e reembolsos", { unit: "% do preço" })}
            {field("packagingBrl", "Embalagem", { unit: "R$/un" })}
            {field("otherUnitCostBrl", "Outros custos por unidade", { unit: "R$/un" })}
          </section>

          <section className="form-block" aria-labelledby="sec-meta">
            <h2 className="section-title" id="sec-meta">
              Meta
            </h2>
            {field("targetMarginPct", "Margem líquida desejada", {
              unit: "% do preço",
              hint: "Lucro depois de todos os custos acima, dividido pelo preço de venda.",
            })}
          </section>
        </div>

        <div className="results-wrap">
          <div className="results" aria-live="polite">
            {errors.length > 0 ? (
              <div className="problems" role="alert">
                <strong>Ajuste estes campos para calcular:</strong>
                <ul>
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result && view ? (
              <>
                <section aria-labelledby="sec-resultado">
                  <h2 className="sr-only" id="sec-resultado">
                    Resultado
                  </h2>
                  <div className="verdict" data-state={view.state}>
                    <div className="verdict-bar" />
                    <div>
                      <div className="verdict-big">{fmtPct(view.m.marginPct)}</div>
                      <div className="verdict-state">{view.stateText}</div>
                      <p className="verdict-detail">
                        {view.m.profit < 0 ? "Prejuízo" : "Lucro"} de {fmtBrl(Math.abs(view.m.profit))} por
                        unidade, {fmtBrl(Math.abs(view.m.profit) * imp.quantity)} no lote de{" "}
                        {imp.quantity.toLocaleString("pt-BR")} unidades. Custo nacionalizado de{" "}
                        {fmtBrl(result.landed.unitBrl)} por unidade; o lucro equivale a{" "}
                        {fmtPct(view.m.markupPct, 0)} desse custo.
                      </p>
                    </div>
                  </div>
                  <StackBar price={view.m.price} segments={view.segments} profit={view.m.profit} />
                  {pending.length > 0 ? (
                    <p className="note">
                      Depende de premissas ainda não confirmadas: {pending.join(", ")}. Elas estão marcadas no
                      formulário e explicadas em “Premissas e fontes”.
                    </p>
                  ) : null}
                </section>

                <section aria-labelledby="sec-decisoes">
                  <h2 className="section-title" id="sec-decisoes">
                    O que fazer com esse número
                  </h2>
                  {maxFob ? (
                    <p className="lead">
                      {maxFob.feasible && maxFob.maxFobUnitUsd !== null ? (
                        <>
                          Para vender a {fmtBrl(mkt.price)} e ficar com {fmtPct(target, 0)} de margem, o
                          fornecedor precisa cobrar até <strong>{fmtUsd(maxFob.maxFobUnitUsd)}</strong> por
                          unidade (FOB).{" "}
                          {imp.fobUnitUsd > maxFob.maxFobUnitUsd
                            ? `A conta usa ${fmtUsd(imp.fobUnitUsd)}: faltam ${fmtUsd(imp.fobUnitUsd - maxFob.maxFobUnitUsd)} por unidade para negociar.`
                            : `A conta usa ${fmtUsd(imp.fobUnitUsd)}: há ${fmtUsd(maxFob.maxFobUnitUsd - imp.fobUnitUsd)} por unidade de folga.`}
                        </>
                      ) : (
                        (maxFob.reason ??
                        "Nem com preço zero no fornecedor a conta fecha a esse preço de venda e a essa meta.")
                      )}
                    </p>
                  ) : null}
                  <ul className="decisions">
                    <li>
                      <span>
                        Preço mínimo de venda para não perder
                        {result.breakEvenPrice.reason ? (
                          <span className="row-hint">{result.breakEvenPrice.reason}</span>
                        ) : null}
                      </span>
                      <strong>{priceText(result.breakEvenPrice)}</strong>
                    </li>
                    <li>
                      <span>
                        Preço de venda para a meta de {fmtPct(target, 0)}
                        {result.targetPrice.atBandEdge ? (
                          <span className="row-hint">
                            Fica no início de uma faixa de custo do ML: abaixo disso a tarifa por unidade muda.
                          </span>
                        ) : null}
                        {result.targetPrice.reason ? (
                          <span className="row-hint">{result.targetPrice.reason}</span>
                        ) : null}
                      </span>
                      <strong>{priceText(result.targetPrice)}</strong>
                    </li>
                    <li>
                      <span>
                        FOB máximo para a meta, ao preço de {fmtBrl(mkt.price)}
                      </span>
                      <strong>
                        {maxFob?.feasible && maxFob.maxFobUnitUsd !== null
                          ? fmtUsd(maxFob.maxFobUnitUsd)
                          : "Sem solução"}
                      </strong>
                    </li>
                    <li>
                      <span>FOB máximo para empatar, ao mesmo preço</span>
                      <strong>
                        {maxFobBreakEven?.feasible && maxFobBreakEven.maxFobUnitUsd !== null
                          ? fmtUsd(maxFobBreakEven.maxFobUnitUsd)
                          : "Sem solução"}
                      </strong>
                    </li>
                  </ul>
                  <div className="actions-row">
                    <button
                      type="button"
                      className="btn"
                      onClick={sendToCacador}
                      disabled={!(maxFob?.feasible && maxFob.maxFobUnitUsd !== null)}
                    >
                      Enviar ao Caçador de fornecedores
                    </button>
                    <span className="status-line" role="status">
                      {briefMsg}
                    </span>
                  </div>
                  <p className="note">
                    Leva este produto, o preço de venda e o teto de FOB para o Caçador, onde cada cotação de
                    fornecedor é avaliada com estes mesmos números.
                  </p>
                </section>

              </>
            ) : null}

          </div>
        </div>
      </div>

      <div className="analysis">
        {result && view ? (
          <>
                {grid ? (
                  <section aria-labelledby="sec-sens">
                    <h2 className="section-title" id="sec-sens">
                      E se o preço ou o dólar mudarem?
                    </h2>
                    <div className="scroll-x">
                      <table className="table">
                        <caption className="sr-only">
                          Margem líquida por preço de venda (linhas) e dólar (colunas)
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Preço \ dólar</th>
                            {FX_FACTORS.map((ff) => (
                              <th scope="col" key={ff}>
                                R$ {fmtFx(imp.fxCustoms * ff)}
                                <span className="sub">{fmtSigned(ff)}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {PRICE_FACTORS.map((pf, ri) => (
                            <tr key={pf}>
                              <th scope="row">
                                {fmtBrl(mkt.price * pf)}
                                <span className="sub">{fmtSigned(pf)}</span>
                              </th>
                              {grid[ri].map((margin, ci) => (
                                <td
                                  key={FX_FACTORS[ci]}
                                  className={cellClass(margin, target, pf === 1 && FX_FACTORS[ci] === 1)}
                                >
                                  {fmtPct(margin)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="note">
                      Margem líquida. O dólar do valor aduaneiro e o do pagamento variam juntos. Em cada linha o
                      custo por unidade do ML acompanha a faixa de preço. Azul: atinge a meta. Amarelo: lucra,
                      abaixo da meta. Vermelho: prejuízo.
                    </p>
                  </section>
                ) : null}

                <section aria-labelledby="sec-custo">
                  <h2 className="section-title" id="sec-custo">
                    De onde vem o custo nacionalizado
                  </h2>
                  <div className="scroll-x">
                    <table className="table">
                      <thead>
                        <tr>
                          <th scope="col">Item</th>
                          <th scope="col">Lote</th>
                          <th scope="col">Unidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.composition.map(([label, value]) => (
                          <tr key={label}>
                            <td>{label}</td>
                            <td>{fmtBrl(value)}</td>
                            <td>{fmtBrl(value / imp.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>Custo nacionalizado</td>
                          <td>{fmtBrl(result.landed.totalBrl)}</td>
                          <td>{fmtBrl(result.landed.unitBrl)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="note">
                    Valor aduaneiro, base de II, PIS e COFINS: {fmtBrl(result.landed.customsValueBrl)}. Base do ICMS
                    (calculado por dentro): {fmtBrl(result.landed.icmsBase)}.
                  </p>
                </section>
          </>
        ) : null}
            <section className="wide" aria-labelledby="sec-cenarios">
              <h2 className="section-title" id="sec-cenarios">
                Cenários para comparar
              </h2>
              <p className="note" style={{ marginTop: 10 }}>
                Salve variações do mesmo produto (outro fornecedor, outro lote, outro preço) e compare lado a lado.
                Ficam guardados só neste navegador.
              </p>
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={saveCurrent} disabled={errors.length > 0}>
                  Salvar cenário atual
                </button>
                <span className="status-line" role="status">
                  {saveMsg}
                </span>
              </div>
              {scenarioRows.length > 0 ? (
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Cenário</th>
                        <th scope="col">Preço</th>
                        <th scope="col">Custo nac.</th>
                        <th scope="col">Margem</th>
                        <th scope="col">FOB máx.</th>
                        <th scope="col">
                          <span className="sr-only">Ações</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenarioRows.map(({ s, c }) => {
                        const r = c.result;
                        const fob = r?.maxFobAtTarget;
                        return (
                          <tr key={s.id}>
                            <td>{s.form.name.trim() || "Sem nome"}</td>
                            <td>{r ? fmtBrl(r.margin.price) : "—"}</td>
                            <td>{r ? fmtBrl(r.landed.unitBrl) : "—"}</td>
                            <td>{r ? fmtPct(r.margin.marginPct) : "—"}</td>
                            <td>
                              {fob?.feasible && fob.maxFobUnitUsd !== null ? fmtUsd(fob.maxFobUnitUsd) : "—"}
                            </td>
                            <td>
                              <button type="button" className="btn-quiet" onClick={() => setForm(s.form)}>
                                Abrir
                              </button>
                              <button type="button" className="btn-quiet" onClick={() => removeScenario(s.id)}>
                                Remover
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
      </div>

      <section className="form-block" aria-labelledby="sec-premissas" style={{ marginTop: 56 }}>
        <h2 className="section-title" id="sec-premissas">
          Premissas e fontes
        </h2>
        <p className="note">
          Os valores padrão abaixo vêm das fontes citadas, consultadas em 13/10/2026. “Verificado” quer dizer
          conferido em texto normativo; “a confirmar” quer dizer fonte secundária ou premissa de mercado.
        </p>
        <dl className="sources">
          {Object.values(PARAMS).map((p) => (
            <div key={p.label}>
              <dt>
                {p.label}: {String(p.value).replace(".", ",")} {p.unit}
                {p.status === "a_confirmar" ? <span className="needs-check">a confirmar</span> : null}
              </dt>
              <dd>
                {p.source}. {p.note}
              </dd>
            </div>
          ))}
          <div>
            <dt>
              {mlShippingVerde202603.label}
              {mlShippingVerde202603.status === "a_confirmar" ? (
                <span className="needs-check">a confirmar</span>
              ) : null}
            </dt>
            <dd>
              {mlShippingVerde202603.source} (referência: {mlShippingVerde202603.asOf}).{" "}
              {mlShippingVerde202603.note}
            </dd>
          </div>
        </dl>

        <h3 className="sub-title">Premissa de modelagem sobre Full e coleta</h3>
        <p className="note">
          Nesta versão a tabela de custo por unidade do Mercado Livre é a mesma em coleta e em Full, e o Full soma
          armazenagem (tarifa diária × dias em estoque), abastecimento do centro e outras tarifas. A estrutura de
          cobrança do Full vem de blogs de mercado; as páginas oficiais do ML não puderam ser lidas, e nenhuma fonte
          trouxe valores de retirada, de estoque parado nem período gratuito de armazenagem.
          <span className="needs-check">a confirmar</span>
        </p>

        <h3 className="sub-title">O que esta versão cobre</h3>
        <ul className="plain-list">
          <li>Importação formal (despacho comum, em nome de uma empresa com CNPJ), um produto por lote.</li>
          <li>Fora do cálculo: Remessa Conforme, drawback, ex-tarifário e regimes especiais.</li>
          <li>O IPI entra no custo e não gera crédito, o que é conservador. Créditos de PIS e COFINS no lucro real são uma simplificação do modelo, não uma apuração fiscal.</li>
          <li>A tabela de tarifas do Mercado Livre cobre só reputação verde, MercadoLíder ou sem reputação.</li>
        </ul>
        <p className="note">
          Ferramenta de estimativa, não aconselhamento tributário. Valide alíquotas por NCM e a apuração com
          seu despachante ou contador antes de fechar um pedido.
        </p>
      </section>
    </main>
  );
}
