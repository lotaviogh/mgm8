# Calculadora de margem

Ferramenta web para estimar o custo nacionalizado de produtos importados (importação formal, com CNPJ) e a margem líquida na venda pelo Mercado Livre. Faz também o cálculo reverso: dado o preço de venda e a margem desejada, devolve o preço máximo que o fornecedor pode cobrar (FOB). Esse número alimenta o Caçador de fornecedores, que está na mesma aplicação (`/cacador`).

## Como rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 50 testes (motor de cálculo, decomposição do preço e contrato do Caçador)
npm run typecheck
npm run build && npm start
```

Precisa de Node 20 ou superior.

## Publicar na Vercel

1. Suba a pasta para um repositório no GitHub.
2. Na Vercel, "Add New Project", escolha o repositório e aceite os padrões (Next.js é detectado sozinho).
3. Não há variáveis de ambiente nesta versão.

A rota `/api/ptax` consulta o Banco Central pelo servidor, então a Vercel precisa de saída para a internet (padrão).

## Opções que mudam a conta

Estas escolhas são seletores na tela, não perguntas: trocar uma recalcula tudo na hora.

| Opção | Valores | Efeito |
|---|---|---|
| Regime tributário | Simples, lucro presumido, lucro real | Define os créditos: nenhum no Simples; ICMS no presumido; ICMS e PIS/COFINS no real |
| Modal | Marítimo, aéreo, courier | AFRMM só no marítimo |
| Como o pedido sai do estoque | Coleta (estoque com você), Full (estoque no ML) | Full soma armazenagem, abastecimento do centro e outras tarifas ao custo por unidade |
| Custo por unidade do ML | Tabela do ML, valor informado | Tabela por peso e faixa de preço, ou o valor que você digitar |

## Caçador de fornecedores

Rota `/cacador`. Fluxo:

1. Na calculadora, "Enviar ao Caçador de fornecedores" cria um **briefing** com o produto inteiro, o preço de venda e a meta. Dele sai o **teto de FOB**.
2. No Caçador você registra **cotações** (uma a uma ou coladas de uma planilha). Cada cotação passa pelo mesmo motor, com o FOB e a quantidade dela: sai custo nacionalizado, margem, leitura ("dentro do teto", "acima do teto: negociar até US$ x", "prejuízo") e o teto para o lote daquela cotação.
3. As cotações são ordenadas por margem. Cada uma tem uma etapa (descoberto, contatado, cotado, amostra, aprovado, pedido feito, descartado).
4. "RFQ" gera um rascunho em inglês para copiar. Nada é enviado.
5. "Abrir na calculadora" devolve o briefing para edição.

**Contrato** (`src/lib/cacador.ts`): qualquer fonte futura de fornecedores (busca na web, API oficial, e-mail, planilha) só precisa produzir um `SupplierQuote`: fornecedor, link de origem, FOB, quantidade, frete (opcional), prazo (opcional), observações. Campo que a fonte não trouxe fica vazio e a cotação aparece como "incompleta"; nada é inferido. Cotação sem link mostra "Sem link de origem".

**Premissas da avaliação de uma cotação:** os custos por lote (Siscomex, despesas aduaneiras, outras despesas) ficam como no briefing; o frete internacional é proporcional ao do briefing, a menos que a cotação informe o seu. Por isso lote menor tem teto de FOB menor.

**O que ainda não existe:** a busca automática de fornecedores. Ela depende de acesso a fontes (Alibaba, 1688) que ainda não foi resolvido; o Caçador funciona hoje com cotações registradas à mão ou coladas.

## Como a conta funciona

**Custo nacionalizado** (`src/engine/landed.ts`)

- Valor aduaneiro = FOB + frete internacional + seguro, ao dólar aduaneiro.
- II = valor aduaneiro × alíquota. IPI = (valor aduaneiro + II) × alíquota.
- PIS e COFINS-Importação sobre o valor aduaneiro (mais o adicional de 0,6 p.p. quando se aplica).
- AFRMM = 8% do frete marítimo, só no modal marítimo.
- ICMS por dentro: base = (valor aduaneiro + II + IPI + PIS + COFINS + AFRMM + Siscomex + despesas aduaneiras) ÷ (1 − alíquota).
- IOF de câmbio e spread do banco incidem sobre o pagamento ao exterior, ao dólar de pagamento.
- Créditos conforme o regime: Simples não recupera nada; lucro presumido recupera o ICMS; lucro real recupera ICMS e PIS/COFINS.

**Margem** (`src/engine/marketplace.ts`): preço − comissão − tarifa por unidade do ML (tabela por peso e faixa de preço) − imposto sobre a venda − Ads − perdas − embalagem − outros − custo nacionalizado. Margem = lucro ÷ preço.

**Reverso** (`src/engine/solvers.ts`): o custo nacionalizado é linear no FOB, então o FOB máximo sai exato com duas avaliações. O preço para a meta percorre cada faixa da tabela do ML, porque a tarifa por unidade dá saltos (por exemplo, em R$ 79).

## O que está verificado e o que está "a confirmar"

Cada parâmetro em `src/data/params.ts` tem fonte, data e status. A tela marca em amarelo "a confirmar" os valores padrão que não foram conferidos.

| Parâmetro | Valor padrão | Status |
|---|---|---|
| PIS-Importação | 2,1% | verificado (Lei 10.865/2004, art. 8º) |
| COFINS-Importação | 9,65% | verificado (Lei 10.865/2004, art. 8º) |
| AFRMM | 8% do frete marítimo | verificado (IN RFB 2.102/2022; Decreto 8.257/2014) |
| Taxa Siscomex | R$ 154,23 | a confirmar (fonte secundária; a IN 1.833/2018 traz valores mais antigos) |
| IOF de câmbio | 0,38% | a confirmar (inciso aplicável ao pagamento de importação não localizado) |
| ICMS da importação | 18% | a confirmar (premissa para São Paulo) |
| Comissão do ML | 16% | a confirmar (faixas de fontes secundárias; use a da sua categoria) |
| Tabela de tarifas por unidade do ML | vigência 02/03/2026 | a confirmar (reproduzida pela Ferax; a página oficial bloqueia leitura automática) |
| Armazenagem no Full (por unidade por dia) | pequeno R$ 0,007; médio R$ 0,015; grande R$ 0,050; extragrande R$ 0,107 | a confirmar (AnyMarket, 25/09/2026, que cita o ML sem reproduzir a página; uma tabela de 2023 da Wistor traz outros valores e outras classes) |
| Divisor de peso cubado | 6.000 | a confirmar |

Alíquotas de II e IPI não têm padrão: dependem da NCM e precisam ser digitadas.

## Limites da versão 1

- Só importação formal por despacho comum. **Remessa Conforme ficou de fora**: as fontes de 2026 que li divergem sobre as regras vigentes.
- Um produto por lote; despesas do lote são rateadas por unidade.
- IPI entra no custo e não gera crédito (conservador). O crédito de PIS/COFINS no lucro real é uma simplificação do modelo, não uma apuração fiscal.
- A tabela do ML cobre reputação verde, MercadoLíder e sem reputação. Para outras, use "Informar valor".
- Não modela drawback, ex-tarifário nem regimes especiais.
- **Full:** a estrutura de cobrança (armazenagem, abastecimento do centro, retirada, estoque parado) vem de blogs de mercado; as páginas oficiais do ML bloqueiam leitura automática. Nenhuma fonte trouxe valores de retirada, de estoque parado nem período gratuito de armazenagem: esses campos ficam para você preencher. Os dias em estoque são premissa sua.
- **Mesma tabela para Full e coleta:** o custo por unidade do ML usa a mesma tabela nas duas modalidades. Uma fonte de 2023 diz que o ML cobra o frete do Full como o dos demais Mercado Envios desde 2022; não achei confirmação para 2026.
- Flex e agências não são opções: use "Informar valor" no custo do ML.
- A cotação PTAX (botão "Buscar PTAX de hoje") não foi testada contra o Banco Central real: o ambiente de desenvolvimento não alcançava o serviço. O caminho de erro foi testado e pede o câmbio manual.
- Cenários, briefings e cotações ficam no `localStorage` do navegador: não são compartilhados entre pessoas nem entre aparelhos.

É uma estimativa, não aconselhamento tributário. Valide alíquotas e apuração com despachante ou contador.

## Estrutura

```
src/engine/       cálculo puro, sem React (testado em engine.test.ts)
src/data/         parâmetros com fonte e tabela de tarifas do ML
src/lib/          formatação, estado do formulário, cenários, decomposição do preço, contrato do Caçador
src/components/   interface (Calculator, Cacador, Nav, Field, StackBar)
src/app/          páginas (/ e /cacador), layout, estilos e a rota /api/ptax
```

## Próximos passos sugeridos

1. Supabase (como no Hera): login, cenários compartilhados e versionamento dos parâmetros com data de vigência. Vale fazer junto com o item 3, porque o Caçador precisa do compartilhamento para a equipe.
2. Consulta de alíquotas por NCM, para II, IPI e PIS/COFINS não serem digitados.
3. Armazenar briefings e cotações no Supabase com login, para a equipe compartilhar (hoje ficam no navegador de cada pessoa).
4. Adaptadores de fonte para o Caçador (busca na web, APIs oficiais quando houver acesso), todos produzindo `SupplierQuote`.
5. Outras tabelas do ML (reputações) e outros marketplaces.
