"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fmtBrl, fmtPct, fmtUsd, parseNum } from "@/lib/format";
import { EXAMPLE_FORM, computeAll } from "@/lib/form";
import {
  MAX_QUOTES,
  STAGES,
  buildRfq,
  createBrief,
  emptyQuote,
  evaluateQuote,
  exampleQuotes,
  isHttpUrl,
  loadStore,
  parseQuotesText,
  rankQuotes,
  saveStore,
  setHandoff,
  type Brief,
  type CacadorStore,
  type Stage,
  type SupplierQuote,
} from "@/lib/cacador";
import { Field } from "./Field";

const SITUATION_LABEL = { ok: "Dentro do teto", warn: "Acima do teto", loss: "Prejuízo", incompleto: "Incompleto" } as const;

/** O que a mensagem acrescenta ao rótulo da situação, sem repeti-lo. */
function readingDetail(status: keyof typeof SITUATION_LABEL, message: string): string {
  const label = SITUATION_LABEL[status];
  if (!message.startsWith(label)) return message;
  const rest = message.slice(label.length).replace(/^[:.]\s*/, "");
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}

export default function Cacador() {
  const router = useRouter();
  const [store, setStore] = useState<CacadorStore>({ v: 1, briefs: [] });
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SupplierQuote>(() => emptyQuote());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [rfqFor, setRfqFor] = useState<{ quoteId: string | null } | null>(null);
  const [rfqProduct, setRfqProduct] = useState("");
  const [rfqTarget, setRfqTarget] = useState(false);

  useEffect(() => {
    const s = loadStore();
    setStore(s);
    setActiveId(s.briefs.length ? s.briefs[s.briefs.length - 1].id : null);
    setLoaded(true);
  }, []);

  const active: Brief | null = store.briefs.find((b) => b.id === activeId) ?? null;
  const brief = useMemo(() => (active ? computeAll(active.form) : null), [active]);

  const ranked = useMemo(
    () =>
      active
        ? rankQuotes(active.quotes.map((quote) => ({ quote, ev: evaluateQuote(active.form, quote) })))
        : [],
    [active],
  );
  const inside = ranked.filter((x) => x.ev.status === "ok" && x.quote.stage !== "descartado").length;

  function commit(next: CacadorStore, message = "") {
    setStore(next);
    setMsg(
      saveStore(next)
        ? message
        : "O navegador bloqueou o armazenamento local: as alterações somem ao fechar a página.",
    );
  }

  function updateActive(fn: (b: Brief) => Brief, message?: string) {
    commit({ ...store, briefs: store.briefs.map((b) => (b.id === activeId ? fn(b) : b)) }, message);
  }

  function removeBrief(id: string) {
    const briefs = store.briefs.filter((b) => b.id !== id);
    commit({ ...store, briefs }, "Busca removida.");
    setActiveId(briefs.length ? briefs[briefs.length - 1].id : null);
    setConfirm(null);
    setRfqFor(null);
  }

  function submitQuote() {
    if (!active) return;
    if (!draft.supplier.trim()) {
      setMsg("Informe o nome do fornecedor.");
      return;
    }
    if (editingId) {
      updateActive(
        (b) => ({
          ...b,
          quotes: b.quotes.map((q) => (q.id === editingId ? { ...draft, id: editingId, stage: q.stage } : q)),
        }),
        "Cotação atualizada.",
      );
    } else {
      if (active.quotes.length >= MAX_QUOTES) {
        setMsg(`Limite de ${MAX_QUOTES} cotações por busca.`);
        return;
      }
      updateActive((b) => ({ ...b, quotes: [...b.quotes, draft] }), "Cotação adicionada.");
    }
    setDraft(emptyQuote());
    setEditingId(null);
  }

  function editQuote(q: SupplierQuote) {
    setDraft(q);
    setEditingId(q.id);
    document.getElementById("sec-nova")?.scrollIntoView({ block: "start" });
  }

  function importPaste() {
    if (!active) return;
    const { quotes, skipped } = parseQuotesText(paste);
    const room = Math.max(MAX_QUOTES - active.quotes.length, 0);
    const take = quotes.slice(0, room);
    const parts = [`${take.length} ${take.length === 1 ? "cotação importada" : "cotações importadas"}`];
    if (skipped) parts.push(`${skipped} ${skipped === 1 ? "linha pulada" : "linhas puladas"}`);
    if (quotes.length > take.length) parts.push(`limite de ${MAX_QUOTES} cotações por busca`);
    if (take.length) updateActive((b) => ({ ...b, quotes: [...b.quotes, ...take] }), `${parts.join("; ")}.`);
    else setMsg(`${parts.join("; ")}.`);
    setPaste("");
  }

  function setStage(id: string, stage: Stage) {
    updateActive((b) => ({ ...b, quotes: b.quotes.map((q) => (q.id === id ? { ...q, stage } : q)) }));
  }

  function removeQuote(id: string) {
    updateActive((b) => ({ ...b, quotes: b.quotes.filter((q) => q.id !== id) }), "Cotação removida.");
    setConfirm(null);
    if (rfqFor?.quoteId === id) setRfqFor(null);
  }

  function loadExample() {
    const r = createBrief(EXAMPLE_FORM, exampleQuotes());
    if (!r.ok) {
      setMsg(r.reason);
      return;
    }
    const s = loadStore();
    setStore(s);
    setActiveId(r.id);
  }

  function openInCalculator() {
    if (!active) return;
    if (setHandoff(active.form)) router.push("/");
    else setMsg("O navegador bloqueou o armazenamento local: não deu para levar o briefing à calculadora.");
  }

  function openRfq(quoteId: string | null) {
    setRfqFor({ quoteId });
    setRfqProduct(active?.form.name ?? "");
  }

  async function copyRfq(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg("RFQ copiado.");
    } catch {
      setMsg("Não deu para copiar automaticamente: selecione o texto e copie.");
    }
  }

  // ---------- RFQ ----------
  let rfq: { subject: string; body: string } | null = null;
  if (active && rfqFor) {
    const q = rfqFor.quoteId ? active.quotes.find((x) => x.id === rfqFor.quoteId) : undefined;
    const ev = q ? ranked.find((x) => x.quote.id === q.id)?.ev : undefined;
    const ceiling = ev?.maxFobUsd ?? (brief?.result?.maxFobAtTarget.maxFobUnitUsd ?? null);
    const qty = parseNum(q?.moq || active.form.quantity);
    rfq = buildRfq({
      product: rfqProduct,
      supplier: q?.supplier ?? "",
      quantity: Number.isFinite(qty) ? qty : null,
      targetFobUsd: rfqTarget ? ceiling : null,
    });
  }
  const rfqText = rfq ? `Subject: ${rfq.subject}\n\n${rfq.body}` : "";

  const ceilingBrief = brief?.result?.maxFobAtTarget;

  return (
    <main className="app">
      <header className="head">
        <h1>Caçador de fornecedores</h1>
        <p>
          O briefing vem da calculadora e traz o teto de FOB. Cada cotação passa pelo mesmo cálculo, no seu
          preço e na sua meta, para você falar só com quem fecha a conta.
        </p>
      </header>

      {!loaded ? null : store.briefs.length === 0 ? (
        <section className="empty" aria-labelledby="sec-vazio">
          <h2 className="section-title" id="sec-vazio">
            Nenhuma busca ainda
          </h2>
          <p className="lead">
            Monte o produto na calculadora, confira o teto de FOB e use “Enviar ao Caçador”. A busca aparece aqui e
            você registra as cotações dos fornecedores.
          </p>
          <div className="actions-row">
            <Link className="btn" href="/">
              Abrir a calculadora
            </Link>
            <button type="button" className="btn" onClick={loadExample}>
              Carregar um exemplo
            </button>
          </div>
          <p className="note">
            O exemplo cria uma busca com cinco fornecedores fictícios, todos marcados “(exemplo)”, para você ver o
            ranking e as leituras. Dá para remover a busca depois.
          </p>
          <p className="status-line status-block" role="status" style={{ marginLeft: 0 }}>
            {msg}
          </p>
        </section>
      ) : (
        <div className="cac-cols">
          <aside aria-labelledby="sec-buscas">
            <h2 className="section-title" id="sec-buscas">
              Buscas
            </h2>
            <ul className="brief-list">
              {store.briefs.map((b) => {
                const c = computeAll(b.form);
                const m = c.result?.maxFobAtTarget;
                return (
                  <li key={b.id}>
                    <button
                      type="button"
                      aria-current={b.id === activeId ? "true" : undefined}
                      onClick={() => {
                        setActiveId(b.id);
                        setRfqFor(null);
                        setEditingId(null);
                        setDraft(emptyQuote());
                        setConfirm(null);
                      }}
                    >
                      {b.form.name.trim() || "Sem nome"}
                      <span className="sub">
                        {m?.feasible && m.maxFobUnitUsd !== null ? `Teto ${fmtUsd(m.maxFobUnitUsd)}` : "Sem teto"},{" "}
                        {b.quotes.length} {b.quotes.length === 1 ? "cotação" : "cotações"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p style={{ marginTop: 12 }}>
              <Link className="btn-quiet" href="/" style={{ paddingLeft: 0 }}>
                Nova busca pela calculadora
              </Link>
            </p>
          </aside>

          {active && brief ? (
            <div className="cac-main">
              <section aria-labelledby="sec-briefing">
                <h2 className="section-title" id="sec-briefing">
                  Briefing: {active.form.name.trim() || "Sem nome"}
                </h2>
                {brief.errors.length > 0 ? (
                  <div className="problems" role="alert" style={{ marginTop: 14 }}>
                    <strong>O briefing tem campos inválidos.</strong> Abra na calculadora para corrigir:{" "}
                    {brief.errors[0]}
                  </div>
                ) : (
                  <dl className="facts">
                    <div>
                      <dt>Teto de FOB para a meta</dt>
                      <dd className="strong">
                        {ceilingBrief?.feasible && ceilingBrief.maxFobUnitUsd !== null
                          ? fmtUsd(ceilingBrief.maxFobUnitUsd)
                          : "Sem solução"}
                      </dd>
                    </div>
                    <div>
                      <dt>Preço de venda</dt>
                      <dd>{fmtBrl(brief.mkt.price)}</dd>
                    </div>
                    <div>
                      <dt>Margem desejada</dt>
                      <dd>{fmtPct(brief.targetMarginPct / 100, 0)}</dd>
                    </div>
                    <div>
                      <dt>Lote do briefing</dt>
                      <dd>{brief.imp.quantity.toLocaleString("pt-BR")} un</dd>
                    </div>
                    <div>
                      <dt>FOB na conta do briefing</dt>
                      <dd>{fmtUsd(brief.imp.fobUnitUsd)}</dd>
                    </div>
                    <div>
                      <dt>Logística</dt>
                      <dd>
                        {active.form.fulfillment === "full" ? "Full" : "Coleta"}, modal {active.form.modal}
                      </dd>
                    </div>
                  </dl>
                )}
                <p className="note">
                  Para cada cotação, os custos por lote (Siscomex, despesas aduaneiras e outras) ficam como no
                  briefing e o frete internacional é proporcional ao do briefing, a menos que você informe o da
                  cotação. Lote menor dilui pior os custos fixos, então o teto muda com a quantidade.
                </p>
                <div className="actions-row">
                  <button type="button" className="btn" onClick={openInCalculator}>
                    Abrir na calculadora
                  </button>
                  <button type="button" className="btn" onClick={() => openRfq(null)}>
                    Rascunho de RFQ do briefing
                  </button>
                  {confirm === active.id ? (
                    <>
                      <button type="button" className="btn" onClick={() => removeBrief(active.id)}>
                        Confirmar remoção da busca
                      </button>
                      <button type="button" className="btn-quiet" onClick={() => setConfirm(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-quiet" onClick={() => setConfirm(active.id)}>
                      Remover busca
                    </button>
                  )}
                </div>
              </section>

              <section aria-labelledby="sec-cotacoes">
                <h2 className="section-title" id="sec-cotacoes">
                  Cotações
                </h2>
                {ranked.length === 0 ? (
                  <p className="lead">
                    Nenhuma cotação nesta busca. Registre a primeira abaixo ou cole várias de uma planilha.
                  </p>
                ) : (
                  <>
                    <p className="lead">
                      {inside} de {ranked.length} {ranked.length === 1 ? "cotação está" : "cotações estão"} dentro do
                      teto. Ordem: maior margem primeiro; incompletas e descartadas no fim.
                    </p>
                    <div className="scroll-x">
                      <table className="table quotes">
                        <thead>
                          <tr>
                            <th scope="col">Fornecedor</th>
                            <th scope="col">FOB</th>
                            <th scope="col">Qtd</th>
                            <th scope="col">Custo nac.</th>
                            <th scope="col">Margem</th>
                            <th scope="col">Leitura</th>
                            <th scope="col">Etapa</th>
                            <th scope="col">
                              <span className="sr-only">Ações</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.map(({ quote, ev }) => (
                            <tr key={quote.id} className={quote.stage === "descartado" ? "row-muted" : undefined}>
                              <td>
                                {quote.supplier}
                                {isHttpUrl(quote.evidenceUrl) ? (
                                  <a className="sub" href={quote.evidenceUrl.trim()} target="_blank" rel="noopener noreferrer">
                                    Ver origem
                                  </a>
                                ) : quote.evidenceUrl.trim() ? (
                                  <span className="sub">Origem: {quote.evidenceUrl}</span>
                                ) : (
                                  <span className="sub">Sem link de origem</span>
                                )}
                                {quote.leadTimeDays.trim() ? (
                                  <span className="sub">Prazo: {quote.leadTimeDays} dias</span>
                                ) : null}
                                {quote.notes.trim() ? <span className="sub">{quote.notes}</span> : null}
                              </td>
                              <td>{Number.isFinite(ev.fob) ? fmtUsd(ev.fob) : "—"}</td>
                              <td>{Number.isFinite(ev.moq) ? ev.moq.toLocaleString("pt-BR") : "—"}</td>
                              <td>{ev.landedUnit !== null ? fmtBrl(ev.landedUnit) : "—"}</td>
                              <td>{ev.marginPct !== null ? fmtPct(ev.marginPct) : "—"}</td>
                              <td className="reading" data-state={ev.status}>
                                <strong>{SITUATION_LABEL[ev.status]}</strong>
                                {readingDetail(ev.status, ev.message) ? (
                                  <span className="sub">{readingDetail(ev.status, ev.message)}</span>
                                ) : null}
                                {ev.status === "ok" && ev.maxFobUsd !== null ? (
                                  <span className="sub">Teto neste lote: {fmtUsd(ev.maxFobUsd)}</span>
                                ) : null}
                                {ev.status !== "incompleto" && ev.freightSource === "proporcional" ? (
                                  <span className="sub">Frete proporcional ao do briefing</span>
                                ) : null}
                              </td>
                              <td>
                                <select
                                  className="select select-small"
                                  aria-label={`Etapa de ${quote.supplier}`}
                                  value={quote.stage}
                                  onChange={(e) => setStage(quote.id, e.target.value as Stage)}
                                >
                                  {STAGES.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="row-actions">
                                <button type="button" className="btn-quiet" onClick={() => openRfq(quote.id)}>
                                  RFQ
                                </button>
                                <button type="button" className="btn-quiet" onClick={() => editQuote(quote)}>
                                  Editar
                                </button>
                                {confirm === quote.id ? (
                                  <>
                                    <button type="button" className="btn-quiet" onClick={() => removeQuote(quote.id)}>
                                      Confirmar
                                    </button>
                                    <button type="button" className="btn-quiet" onClick={() => setConfirm(null)}>
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" className="btn-quiet" onClick={() => setConfirm(quote.id)}>
                                    Remover
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <p className="status-line status-block" role="status">
                  {msg}
                </p>
              </section>

              {rfqFor && rfq ? (
                <section aria-labelledby="sec-rfq">
                  <h2 className="section-title" id="sec-rfq">
                    Rascunho de RFQ
                  </h2>
                  <p className="note" style={{ marginTop: 10 }}>
                    Texto modelo em inglês, sem envio automático: copie, revise e envie por você. O nome do produto
                    vem do briefing; troque por uma descrição em inglês.
                  </p>
                  <div className="form-block" style={{ marginBottom: 0 }}>
                    <div className="row">
                      <label className="row-label" htmlFor="rfq-product">
                        Produto no texto
                      </label>
                      <div className="ctl" style={{ gridColumn: "1 / -1" }}>
                        <input
                          id="rfq-product"
                          className="input input-wide"
                          value={rfqProduct}
                          onChange={(e) => setRfqProduct(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className="row">
                      <label className="row-label" htmlFor="rfq-target">
                        Incluir o teto de FOB como preço-alvo
                        <span className="row-hint">
                          O teto é o limite da sua conta. Considere pedir um valor abaixo dele.
                        </span>
                      </label>
                      <div className="ctl">
                        <input
                          id="rfq-target"
                          type="checkbox"
                          checked={rfqTarget}
                          onChange={(e) => setRfqTarget(e.target.checked)}
                        />
                      </div>
                    </div>
                  </div>
                  <label className="sr-only" htmlFor="rfq-text">
                    Texto do RFQ
                  </label>
                  <textarea
                    id="rfq-text"
                    className="textarea"
                    readOnly
                    rows={16}
                    value={rfqText}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="actions-row">
                    <button type="button" className="btn" onClick={() => copyRfq(rfqText)}>
                      Copiar RFQ
                    </button>
                    <button type="button" className="btn-quiet" onClick={() => setRfqFor(null)}>
                      Fechar
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="form-block" aria-labelledby="sec-nova-title" id="sec-nova">
                <h2 className="section-title" id="sec-nova-title">
                  {editingId ? "Editar cotação" : "Registrar cotação"}
                </h2>
                <Field
                  id="q-supplier"
                  label="Fornecedor"
                  value={draft.supplier}
                  onChange={(v) => setDraft({ ...draft, supplier: v })}
                  wide
                  inputMode="text"
                />
                <Field
                  id="q-url"
                  label="Link de origem"
                  value={draft.evidenceUrl}
                  onChange={(v) => setDraft({ ...draft, evidenceUrl: v })}
                  wide
                  inputMode="text"
                  hint="Página do produto, conversa ou documento de onde veio o preço. Sem link, a linha fica marcada como sem origem."
                />
                <Field
                  id="q-fob"
                  label="Preço FOB"
                  value={draft.fobUnitUsd}
                  onChange={(v) => setDraft({ ...draft, fobUnitUsd: v })}
                  unit="US$/un"
                />
                <Field
                  id="q-moq"
                  label="Quantidade deste preço"
                  value={draft.moq}
                  onChange={(v) => setDraft({ ...draft, moq: v })}
                  unit="un"
                  inputMode="numeric"
                  hint="O MOQ ou o lote a que esse preço se refere."
                />
                <Field
                  id="q-freight"
                  label="Frete internacional do lote"
                  value={draft.freightIntlTotalUsd}
                  onChange={(v) => setDraft({ ...draft, freightIntlTotalUsd: v })}
                  unit="US$"
                  hint="Opcional. Vazio: proporcional ao frete do briefing."
                />
                <Field
                  id="q-lead"
                  label="Prazo de produção"
                  value={draft.leadTimeDays}
                  onChange={(v) => setDraft({ ...draft, leadTimeDays: v })}
                  unit="dias"
                  inputMode="numeric"
                  hint="Opcional. Deixe vazio se o fornecedor não informou."
                />
                <Field
                  id="q-notes"
                  label="Observações"
                  value={draft.notes}
                  onChange={(v) => setDraft({ ...draft, notes: v })}
                  wide
                  inputMode="text"
                />
                <div className="actions-row">
                  <button type="button" className="btn" onClick={submitQuote}>
                    {editingId ? "Salvar alterações" : "Adicionar cotação"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(emptyQuote());
                      }}
                    >
                      Cancelar edição
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="form-block" aria-labelledby="sec-colar">
                <h2 className="section-title" id="sec-colar">
                  Colar várias cotações
                </h2>
                <p className="note" style={{ marginTop: 10 }}>
                  Uma cotação por linha, com as colunas: fornecedor, link, FOB, quantidade, frete (opcional), prazo
                  em dias (opcional), observações. Separe por tabulação (cole direto do Excel ou do Sheets) ou por
                  ponto e vírgula. Cabeçalho na primeira linha é ignorado. Fornecedor sem FOB entra como incompleto, para você completar depois.
                </p>
                <label className="sr-only" htmlFor="paste">
                  Cotações para importar
                </label>
                <textarea
                  id="paste"
                  className="textarea"
                  rows={5}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Fábrica A;https://…;2,80;1000;;25;amostra grátis"
                />
                <div className="actions-row">
                  <button type="button" className="btn" onClick={importPaste} disabled={!paste.trim()}>
                    Importar cotações
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
