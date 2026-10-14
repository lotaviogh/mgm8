import { fmtUsd, parseNum } from "./format";
import { EXAMPLE_FORM, computeAll, type Form } from "./form";

/**
 * Contrato entre a calculadora e o Caçador de fornecedores.
 *
 * - Um briefing é o produto montado na calculadora (o formulário inteiro): preço-alvo, meta de margem,
 *   impostos, frete, logística. Dele sai o teto de FOB.
 * - Cada cotação de fornecedor é um registro normalizado (SupplierQuote). Qualquer fonte futura (busca web,
 *   API oficial, e-mail, planilha) só precisa produzir esse registro; o cálculo é sempre o mesmo motor.
 * - Campo que a fonte não trouxe fica vazio. Nada é inferido.
 */

export type Stage =
  | "descoberto"
  | "contatado"
  | "cotado"
  | "amostra"
  | "aprovado"
  | "pedido"
  | "descartado";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "descoberto", label: "Descoberto" },
  { id: "contatado", label: "Contatado" },
  { id: "cotado", label: "Cotado" },
  { id: "amostra", label: "Amostra" },
  { id: "aprovado", label: "Aprovado" },
  { id: "pedido", label: "Pedido feito" },
  { id: "descartado", label: "Descartado" },
];

export interface SupplierQuote {
  id: string;
  supplier: string;
  /** Link da página, conversa ou documento de onde veio a cotação */
  evidenceUrl: string;
  /** Preço FOB por unidade, US$ */
  fobUnitUsd: string;
  /** Quantidade a que esse preço se refere (MOQ ou lote cotado) */
  moq: string;
  /** Frete internacional do lote, US$. Vazio = proporcional ao frete do briefing */
  freightIntlTotalUsd: string;
  leadTimeDays: string;
  notes: string;
  stage: Stage;
}

export interface Brief {
  id: string;
  createdAt: string;
  form: Form;
  quotes: SupplierQuote[];
}

export interface CacadorStore {
  v: 1;
  briefs: Brief[];
}

export const MAX_BRIEFS = 12;
export const MAX_QUOTES = 50;

const STORE_KEY = "calculadora-margem:cacador:v1";
const HANDOFF_KEY = "calculadora-margem:handoff:v1";

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function emptyQuote(): SupplierQuote {
  return {
    id: newId(),
    supplier: "",
    evidenceUrl: "",
    fobUnitUsd: "",
    moq: "",
    freightIntlTotalUsd: "",
    leadTimeDays: "",
    notes: "",
    stage: "descoberto",
  };
}

// ---------- armazenamento local ----------

/** Completa formulários salvos por versões anteriores com os campos que faltam. */
export function migrateForm(raw: Partial<Form> | undefined): Form {
  return { ...EXAMPLE_FORM, ...(raw ?? {}) };
}

export function loadStore(): CacadorStore {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { v: 1, briefs: [] };
    const parsed = JSON.parse(raw) as CacadorStore;
    if (!parsed || !Array.isArray(parsed.briefs)) return { v: 1, briefs: [] };
    return {
      v: 1,
      briefs: parsed.briefs.map((b) => ({
        ...b,
        form: migrateForm(b.form),
        quotes: Array.isArray(b.quotes) ? b.quotes : [],
      })),
    };
  } catch {
    return { v: 1, briefs: [] };
  }
}

export function saveStore(store: CacadorStore): boolean {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** Cria um briefing a partir do formulário da calculadora. */
export function createBrief(
  form: Form,
  quotes: SupplierQuote[] = [],
): { ok: true; id: string } | { ok: false; reason: string } {
  const store = loadStore();
  if (store.briefs.length >= MAX_BRIEFS) {
    return { ok: false, reason: `Limite de ${MAX_BRIEFS} buscas no Caçador. Remova uma para criar outra.` };
  }
  const brief: Brief = { id: newId(), createdAt: new Date().toISOString(), form, quotes };
  const saved = saveStore({ v: 1, briefs: [...store.briefs, brief] });
  if (!saved) {
    return { ok: false, reason: "O navegador bloqueou o armazenamento local: não deu para criar a busca." };
  }
  return { ok: true, id: brief.id };
}

/** Passa um formulário do Caçador de volta para a calculadora. */
export function setHandoff(form: Form): boolean {
  try {
    window.localStorage.setItem(HANDOFF_KEY, JSON.stringify(form));
    return true;
  } catch {
    return false;
  }
}

export function takeHandoff(): Form | null {
  try {
    const raw = window.localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(HANDOFF_KEY);
    const parsed = JSON.parse(raw) as Partial<Form>;
    return parsed && typeof parsed === "object" ? migrateForm(parsed) : null;
  } catch {
    return null;
  }
}

/** Cotações fictícias, marcadas como exemplo, para ver o Caçador funcionando sem digitar nada. */
export function exampleQuotes(): SupplierQuote[] {
  const q = (over: Partial<SupplierQuote>): SupplierQuote => ({ ...emptyQuote(), ...over });
  return [
    q({ supplier: "Fornecedor A (exemplo)", fobUnitUsd: "2,70", moq: "1000", leadTimeDays: "25", stage: "cotado", notes: "Cotação de exemplo" }),
    q({ supplier: "Fornecedor B (exemplo)", fobUnitUsd: "4,30", moq: "1000", leadTimeDays: "30", stage: "contatado", notes: "Cotação de exemplo" }),
    q({ supplier: "Fornecedor C (exemplo)", fobUnitUsd: "7,20", moq: "1000", leadTimeDays: "35", stage: "cotado", notes: "Cotação de exemplo" }),
    q({ supplier: "Fornecedor D (exemplo)", fobUnitUsd: "3,10", moq: "300", leadTimeDays: "20", stage: "amostra", notes: "MOQ baixo, cotação de exemplo" }),
    q({ supplier: "Fornecedor E (exemplo)", stage: "descoberto", notes: "Ainda sem cotação" }),
  ];
}

// ---------- avaliação de uma cotação ----------

export type QuoteStatus = "ok" | "warn" | "loss" | "incompleto";

export interface QuoteEval {
  status: QuoteStatus;
  /** Leitura em uma frase, pronta para a tela */
  message: string;
  fob: number;
  moq: number;
  marginPct: number | null;
  profitUnit: number | null;
  landedUnit: number | null;
  /** FOB máximo que fecha a meta no lote desta cotação */
  maxFobUsd: number | null;
  /** FOB da cotação menos o teto; positivo = acima do teto */
  gapUsd: number | null;
  freightSource: "informado" | "proporcional";
}

const numText = (n: number) => String(Number(n.toFixed(6))).replace(".", ",");

/** Formulário da calculadora com os dados da cotação no lugar do FOB, da quantidade e do frete. */
export function formForQuote(brief: Form, q: SupplierQuote): { form: Form; freightSource: "informado" | "proporcional" } {
  const informed = q.freightIntlTotalUsd.trim() !== "";
  let freight = q.freightIntlTotalUsd;
  if (!informed) {
    const briefQty = parseNum(brief.quantity);
    const briefFreight = parseNum(brief.freightIntlTotalUsd);
    const moq = parseNum(q.moq);
    freight =
      briefQty > 0 && Number.isFinite(briefFreight) && Number.isFinite(moq)
        ? numText((briefFreight / briefQty) * moq)
        : brief.freightIntlTotalUsd;
  }
  return {
    form: { ...brief, fobUnitUsd: q.fobUnitUsd, quantity: q.moq, freightIntlTotalUsd: freight },
    freightSource: informed ? "informado" : "proporcional",
  };
}

/**
 * Avalia a cotação com o mesmo motor da calculadora, no preço de venda e na meta do briefing.
 * Custos por lote (Siscomex, despesas aduaneiras, outras despesas) ficam como no briefing, e o frete
 * é proporcional ao do briefing, a menos que a cotação traga o seu.
 */
export function evaluateQuote(brief: Form, q: SupplierQuote): QuoteEval {
  const fob = parseNum(q.fobUnitUsd);
  const moq = parseNum(q.moq);
  const { form, freightSource } = formForQuote(brief, q);
  const blank: QuoteEval = {
    status: "incompleto",
    message: "",
    fob,
    moq,
    marginPct: null,
    profitUnit: null,
    landedUnit: null,
    maxFobUsd: null,
    gapUsd: null,
    freightSource,
  };
  if (!Number.isFinite(fob) || !Number.isFinite(moq)) {
    return { ...blank, message: "Faltam o FOB ou a quantidade: não dá para calcular." };
  }
  const c = computeAll(form);
  if (c.errors.length || !c.result) {
    return { ...blank, message: c.errors[0] ?? "Dados inválidos." };
  }
  const r = c.result;
  const target = c.targetMarginPct / 100;
  const max = r.maxFobAtTarget.feasible ? r.maxFobAtTarget.maxFobUnitUsd : null;
  const gap = max === null ? null : fob - max;
  const ok = r.margin.marginPct >= target - 1e-9;
  const status: QuoteStatus = ok ? "ok" : r.margin.profit < 0 ? "loss" : "warn";

  let message: string;
  if (ok) {
    message = "Dentro do teto";
  } else if (max === null) {
    message = "Neste lote a conta não fecha a meta nem com FOB zero";
  } else if (status === "loss") {
    const be = r.maxFobAtBreakEven.feasible ? r.maxFobAtBreakEven.maxFobUnitUsd : null;
    message =
      be === null
        ? `Prejuízo. Para a meta, negociar até ${fmtUsd(max)}`
        : `Prejuízo. Empata em ${fmtUsd(be)}; para a meta, negociar até ${fmtUsd(max)}`;
  } else {
    message = `Acima do teto: negociar até ${fmtUsd(max)}`;
  }

  return {
    status,
    message,
    fob,
    moq,
    marginPct: r.margin.marginPct,
    profitUnit: r.margin.profit,
    landedUnit: r.landed.unitBrl,
    maxFobUsd: max,
    gapUsd: gap,
    freightSource,
  };
}

/** Ordem de leitura: melhores margens primeiro; incompletos depois; descartados por último. */
export function rankQuotes<T extends { quote: SupplierQuote; ev: QuoteEval }>(items: T[]): T[] {
  const bucket = (x: T) => (x.quote.stage === "descartado" ? 2 : x.ev.status === "incompleto" ? 1 : 0);
  return [...items].sort((a, b) => {
    const d = bucket(a) - bucket(b);
    if (d !== 0) return d;
    return (b.ev.marginPct ?? -Infinity) - (a.ev.marginPct ?? -Infinity);
  });
}

// ---------- colar de planilha ----------

/**
 * Colunas: fornecedor, link, FOB, quantidade, frete (opcional), prazo em dias (opcional), observações.
 * Separador: tabulação (colar do Excel ou do Sheets) ou ponto e vírgula. A primeira linha é ignorada
 * se for cabeçalho (FOB não numérico). Linhas sem fornecedor ou com FOB ilegível são puladas; FOB vazio
 * entra como cotação incompleta.
 */
export function parseQuotesText(text: string): { quotes: SupplierQuote[]; skipped: number } {
  const quotes: SupplierQuote[] = [];
  let skipped = 0;
  // Não usa trim(): as tabulações do fim da linha são células vazias coladas do Excel.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^ +| +$/g, ""))
    .filter((l) => l.replace(/[\t; ]/g, "") !== "");
  lines.forEach((line, idx) => {
    const delim = line.includes("\t") ? "\t" : line.includes(";") ? ";" : null;
    if (!delim) {
      skipped += 1;
      return;
    }
    const [supplier = "", link = "", fob = "", moq = "", freight = "", lead = "", notes = ""] = line
      .split(delim)
      .map((c) => c.trim());
    // FOB vazio = fornecedor descoberto que ainda não cotou: entra como incompleto.
    // FOB preenchido e não numérico = cabeçalho (primeira linha) ou lixo (pulada).
    if (fob !== "" && !Number.isFinite(parseNum(fob))) {
      if (idx !== 0) skipped += 1;
      return;
    }
    if (!supplier) {
      skipped += 1;
      return;
    }
    quotes.push({
      ...emptyQuote(),
      supplier,
      evidenceUrl: link,
      fobUnitUsd: fob,
      moq,
      freightIntlTotalUsd: freight,
      leadTimeDays: lead,
      notes,
    });
  });
  return { quotes, skipped };
}

/** Só links http(s) viram link clicável; qualquer outro texto aparece como texto. */
export const isHttpUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim());

// ---------- rascunho de RFQ (em inglês; nada é enviado) ----------

export function buildRfq(opts: {
  product: string;
  supplier: string;
  quantity: number | null;
  targetFobUsd: number | null;
}): { subject: string; body: string } {
  const product = opts.product.trim() || "[product]";
  const qty = opts.quantity !== null && Number.isFinite(opts.quantity) ? String(opts.quantity) : "[quantity]";
  const greeting = opts.supplier.trim() ? `Hello ${opts.supplier.trim()} team,` : "Hello,";
  const lines = [
    greeting,
    "",
    `We are an importer based in Brazil and we are looking for: ${product}.`,
    "",
    `Could you please send us a quotation for ${qty} units, including:`,
    "1. FOB unit price (please state the port), with price breaks for higher volumes",
    "2. Minimum order quantity and the specifications you can supply (sizes, colors, materials)",
    "3. Production lead time and estimated shipping lead time to Brazil",
    "4. Carton size, units per carton and gross weight per carton",
    "5. Product certifications and material declarations you can provide",
    "6. Sample price and sample shipping cost",
    "7. Payment terms",
  ];
  if (opts.targetFobUsd !== null && Number.isFinite(opts.targetFobUsd)) {
    lines.push("", `Our target price is around USD ${opts.targetFobUsd.toFixed(2)} per unit, FOB.`);
  }
  lines.push("", "Thank you, and we look forward to your reply.", "", "Best regards,", "[Your name]", "[Company]");
  return { subject: `Quotation request: ${product}, ${qty} units`, body: lines.join("\n") };
}
