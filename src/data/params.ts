import type { ParamMeta } from "@/engine/types";

/**
 * Parâmetros padrão com proveniência. Cada valor tem fonte, data de referência e status.
 * "verificado" = confirmado em texto normativo ou fonte primária durante a pesquisa (13/10/2026).
 * "a_confirmar" = vem de fonte secundária, é premissa de mercado ou pode ter mudado: conferir antes de decidir.
 * Nenhum valor aqui é aconselhamento tributário: valide com despachante ou contador.
 */
export const PARAMS = {
  pisImportPct: {
    value: 2.1,
    unit: "%",
    label: "PIS-Importação",
    status: "verificado",
    source: "Lei 10.865/2004 art. 8º, com redação da Lei 13.137/2015 (bens em geral)",
    asOf: "2026-10-13",
    note: "Bens antes com alíquota zero ou isenção passaram a pagar 10% da alíquota padrão desde 01/04/2026 (LC 224/2025, IN RFB 2.305/2026), segundo o Guia Tributário. Ajuste por NCM.",
  },
  cofinsImportPct: {
    value: 9.65,
    unit: "%",
    label: "COFINS-Importação",
    status: "verificado",
    source: "Lei 10.865/2004 art. 8º, com redação da Lei 13.137/2015 (bens em geral)",
    asOf: "2026-10-13",
    note: "Há adicional de 0,6 ponto percentual em alguns casos (art. 8º §§ 21 e 21-A); use o campo de adicional.",
  },
  afrmmPct: {
    value: 8,
    unit: "% do frete marítimo",
    label: "AFRMM (longo curso)",
    status: "verificado",
    source: "IN RFB 2.102/2022 art. 4º, I; Decreto 8.257/2014 art. 6º, I, com redação do Decreto 12.555/2025",
    asOf: "2026-10-13",
    note: "Uma página de software ainda cita 25%, valor anterior revogado.",
  },
  siscomexBrl: {
    value: 154.23,
    unit: "R$ por declaração com 1 adição",
    label: "Taxa Siscomex",
    status: "a_confirmar",
    source: "Fazcomex: R$ 115,67 por DI/DUIMP + R$ 38,56 pela 1ª adição, valores desde jun/2021",
    asOf: "2026-10-13",
    note: "A IN RFB 1.833/2018 traz R$ 185,00 + R$ 29,50 por adição, valores anteriores. Mais adições custam menos por adição. Confirmar com o despachante.",
  },
  iofCambioPct: {
    value: 0.38,
    unit: "%",
    label: "IOF câmbio no pagamento",
    status: "a_confirmar",
    source: "Alíquota geral de 0,38% citada para operações de câmbio; Decreto 12.466/2025 reorganizou alíquotas",
    asOf: "2026-10-13",
    note: "Não consegui confirmar o inciso aplicável a pagamento de importação. Confirmar com a casa de câmbio ou o banco.",
  },
  icmsImportPct: {
    value: 18,
    unit: "%",
    label: "ICMS da importação",
    status: "a_confirmar",
    source: "Premissa para São Paulo, não verificada nesta pesquisa",
    asOf: "2026-10-13",
    note: "Depende do estado do importador e do produto. O ICMS é calculado por dentro: base = (valor aduaneiro + II + IPI + PIS + COFINS + AFRMM + Siscomex + despesas aduaneiras) / (1 − alíquota).",
  },
  commissionPct: {
    value: 16,
    unit: "%",
    label: "Comissão do anúncio no Mercado Livre",
    status: "a_confirmar",
    source: "Faixas de fontes secundárias: Clássico 10% a 14%, Premium 15% a 19%, conforme a categoria",
    asOf: "2026-10-13",
    note: "Use o percentual exato da sua categoria no Simulador de Custos do Mercado Livre.",
  },
  fullStorageSmall: {
    value: 0.007,
    unit: "R$ por unidade por dia",
    label: "Armazenagem no Full, porte pequeno",
    status: "a_confirmar",
    source: "AnyMarket, artigo de 25/09/2026, que cita a página oficial do Mercado Livre sem reproduzi-la",
    asOf: "2026-10-13",
    note: "Porte pequeno: até 12 × 15 × 25 cm e 18 kg. Uma tabela de 2023 (Wistor) traz outros valores e outras classes por volume (R$ 0,003 pequeno, R$ 0,008 médio, R$ 0,083 grande). As fontes divergem e a página oficial não pôde ser lida: confira no painel do Full.",
  },
  fullStorageMedium: {
    value: 0.015,
    unit: "R$ por unidade por dia",
    label: "Armazenagem no Full, porte médio",
    status: "a_confirmar",
    source: "AnyMarket, artigo de 25/09/2026, que cita a página oficial do Mercado Livre sem reproduzi-la",
    asOf: "2026-10-13",
    note: "Porte médio: até 28 × 36 × 51 cm e 18 kg. Uma fonte de março de 2026 (XP, via AnyMarket) fala em reajuste de +7,6% na armazenagem de médios e grandes e +5% na retirada.",
  },
  fullStorageLarge: {
    value: 0.05,
    unit: "R$ por unidade por dia",
    label: "Armazenagem no Full, porte grande",
    status: "a_confirmar",
    source: "AnyMarket, artigo de 25/09/2026, que cita a página oficial do Mercado Livre sem reproduzi-la",
    asOf: "2026-10-13",
    note: "Porte grande: até 60 × 60 × 70 cm e 18 kg.",
  },
  fullStorageXLarge: {
    value: 0.107,
    unit: "R$ por unidade por dia",
    label: "Armazenagem no Full, porte extragrande",
    status: "a_confirmar",
    source: "AnyMarket, artigo de 25/09/2026, que cita a página oficial do Mercado Livre sem reproduzi-la",
    asOf: "2026-10-13",
    note: "Acima do porte grande.",
  },
  cubageDivisor: {
    value: 6000,
    unit: "cm³/kg",
    label: "Divisor de peso cubado",
    status: "a_confirmar",
    source: "Divisor usual do transporte rodoviário e courier; o do Mercado Livre não foi confirmado",
    asOf: "2026-10-13",
    note: "O ML cobra pelo maior entre peso real e cubado (fonte secundária).",
  },
} satisfies Record<string, ParamMeta>;

export type ParamKey = keyof typeof PARAMS;
