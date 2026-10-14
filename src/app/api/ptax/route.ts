import { NextResponse } from "next/server";

/**
 * Cotação PTAX do dólar (Banco Central, API Olinda), do último dia útil disponível.
 * Roda no servidor para evitar problema de CORS no navegador.
 * A cotação usada no despacho é a da data de registro da DI: trate este valor como ponto de partida.
 */
const BASE = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia";

function mmddyyyy(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getUTCFullYear()}`;
}

export async function GET() {
  // Hoje no fuso de Brasília (UTC-3), sem depender do fuso do servidor.
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  for (let back = 0; back < 8; back++) {
    const day = new Date(brt.getTime() - back * 24 * 60 * 60 * 1000);
    const url = `${BASE}(dataCotacao=@dataCotacao)?@dataCotacao='${mmddyyyy(day)}'&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`;
    try {
      const res = await fetch(url, { next: { revalidate: 1800 } });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        value?: { cotacaoCompra: number; cotacaoVenda: number; dataHoraCotacao: string }[];
      };
      const rows = json.value ?? [];
      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        return NextResponse.json({
          venda: last.cotacaoVenda,
          compra: last.cotacaoCompra,
          dataHora: last.dataHoraCotacao,
          fonte: "Banco Central do Brasil, PTAX (API Olinda)",
        });
      }
    } catch {
      return NextResponse.json(
        { erro: "Não foi possível consultar o Banco Central agora. Digite o câmbio manualmente." },
        { status: 502 },
      );
    }
  }
  return NextResponse.json(
    { erro: "O Banco Central não devolveu cotação nos últimos 8 dias. Digite o câmbio manualmente." },
    { status: 404 },
  );
}
