import { fmtBrl, fmtPct } from "@/lib/format";

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  /** Cor de fundo (variável CSS) */
  color: string;
}

interface StackBarProps {
  price: number;
  segments: StackSegment[];
  profit: number;
}

/**
 * Barra empilhada como uma pilha de contêineres: cada segmento é um custo do preço de venda.
 * Cinza-azulado = importação, cinza = venda no marketplace, azul = o que sobra.
 * Se o lucro é negativo, a barra passa do preço (marcador preto) e o excedente fica vermelho.
 */
export function StackBar({ price, segments, profit }: StackBarProps) {
  const costs = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  const total = Math.max(price, costs) || 1;
  const pct = (v: number) => `${(Math.max(v, 0) / total) * 100}%`;
  const loss = profit < 0;

  return (
    <div>
      <div
        className="stack"
        role="img"
        aria-label={
          loss
            ? `Os custos somam ${fmtBrl(costs)}, acima do preço de ${fmtBrl(price)}: prejuízo de ${fmtBrl(-profit)} por unidade.`
            : `Do preço de ${fmtBrl(price)}, sobram ${fmtBrl(profit)} de lucro por unidade.`
        }
      >
        {segments.map((s) => (
          <div key={s.key} className="seg" style={{ width: pct(s.value), backgroundColor: s.color }} />
        ))}
        {!loss && profit > 0 ? <div className="seg seg-profit" style={{ width: pct(profit) }} /> : null}
        {loss ? (
          <>
            <div className="stack-edge" style={{ left: pct(price) }} />
          </>
        ) : null}
      </div>
      <ul className="legend">
        {segments.map((s) => (
          <li key={s.key}>
            <span className="chip" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="num">{fmtBrl(s.value)}</span>
            <span className="num dim">{fmtPct(s.value / price)}</span>
          </li>
        ))}
        <li>
          <span className="chip" style={{ background: loss ? "var(--flag-red)" : "var(--flag-blue)" }} />
          <strong>{loss ? "Prejuízo" : "Lucro"}</strong>
          <strong className="num">{fmtBrl(profit)}</strong>
          <strong className="num">{fmtPct(profit / price)}</strong>
        </li>
      </ul>
    </div>
  );
}
