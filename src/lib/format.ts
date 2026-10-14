const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const usdFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

export const fmtBrl = (v: number) => (Number.isFinite(v) ? brlFmt.format(v) : "—");
export const fmtUsd = (v: number) => (Number.isFinite(v) ? usdFmt.format(v) : "—");

/** Recebe fração (0,277) e devolve "27,7%". */
export const fmtPct = (fraction: number, digits = 1) =>
  Number.isFinite(fraction)
    ? `${(fraction * 100).toLocaleString("pt-BR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}%`
    : "—";

/**
 * Lê número digitado em formato brasileiro ou simples.
 * "1.234,56" → 1234.56 | "3,5" → 3.5 | "3.5" → 3.5 | "1.000" → 1000 | "" → NaN
 */
export function parseNum(raw: string): number {
  const s = raw.trim().replace(/\s/g, "");
  if (s === "") return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}
