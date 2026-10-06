# Simulaê

Simulados no estilo Enem **gerados e corrigidos por IA**. O estudante escolhe o formato e o tema da redação. A IA monta a prova inteira em segundo plano (questões de múltipla escolha + proposta de redação com textos motivadores) e verifica cada questão com um revisor independente. Depois o estudante faz a prova no site, com cronômetro, cartão-resposta e folha de redação. Ao final, a IA corrige tudo e entrega **um único relatório `.md`** com notas estimadas, redação corrigida por competência, correção comentada, diagnóstico e plano de estudos.

> **Aviso:** o Simulaê é um simulado **não oficial**, sem vínculo com o Inep ou o MEC, e não usa marca nem logo do Enem. As notas são **estimativas**: a objetiva vem de uma TRI aproximada e a da redação foi dada por IA.

---

## Instalação

Requisitos: **Node.js 20+**.

```bash
npm install
npm start
```

Abra <http://localhost:3000>. Sem chave configurada, o site sobe em **modo demonstração** (IA simulada, com aviso visível na interface): dá para percorrer o fluxo inteiro sem custo.

## Configuração (`.env`)

Copie `.env.example` para `.env` e ajuste. O exemplo já vem com a **configuração econômica** (Haiku na validação, Sonnet na correção); a de máxima qualidade está comentada logo abaixo. Os padrões do código, usados quando a variável não está no `.env`, são:

| Variável | Padrão | Para que serve |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Chave da API da Anthropic. Sem ela, o site roda em modo mock. |
| `AI_PROVIDER` | automático | `anthropic` ou `mock`. Vazio = `anthropic` se houver chave, senão `mock`. |
| `MODEL_GERACAO` | `claude-sonnet-5-5` | Proposta de redação e questões. |
| `MODEL_VALIDACAO` | `claude-sonnet-5-5` | Resolução independente de cada questão. |
| `MODEL_AVALIACAO` | `claude-opus-5-5` | Corretores de redação, parecer, comentários e diagnóstico. |
| `AI_CONCURRENCY` | `4` | Máximo de chamadas simultâneas à IA (limite global). |
| `PORT` | `3000` | Porta HTTP. |
| `DATA_DIR` | `./data` | Onde ficam as provas (uma pasta por prova, em JSON). |
| `ACCESS_CODE` | — | Se definido, o site pede esse código antes de liberar o uso. |
| `MAX_PROVAS_POR_DIA` | `6` | Provas que cada visitante pode criar em 24 h. |
| `MOCK_DELAY_MS` | `15` | Atraso artificial das respostas simuladas. |

### Trocar de modelo

Basta mudar `MODEL_GERACAO`, `MODEL_VALIDACAO` e `MODEL_AVALIACAO` no `.env` e reiniciar. A camada de IA ([server/ai.js](server/ai.js)) se adapta ao modelo:

- O JSON vem sempre por **tool use**. Nos modelos que aceitam, a ferramenta é forçada (`tool_choice: {type: 'tool'}`). **Claude Sonnet 5.5, Opus 5.5 e Fable 5.1 não aceitam `tool_choice` forçado (respondem 400)**; nesses, o Simulaê usa `tool_choice: auto` com uma instrução explícita para chamar a ferramenta, e cada resposta passa pelos validadores. Se outro modelo recusar o modo forçado, a camada percebe o 400 e passa para `auto` sozinha.
- Nos modelos 5.x, é enviado o parâmetro `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): se o modelo recusar uma solicitação por política, a API tenta outro modelo na mesma chamada. Se a conta não tiver esse beta, a camada desliga o recurso e segue.
- Não se envia `temperature` nem `thinking`: os modelos atuais rejeitam esses parâmetros ou já usam raciocínio adaptativo por padrão.
- As chamadas usam streaming (evita timeouts em respostas longas). `max_tokens` dobra automaticamente quando a resposta é truncada (teto de 32.000).

Para baratear, dá para usar um modelo menor na validação, por exemplo `MODEL_VALIDACAO=claude-haiku-4-5`, aceitando uma verificação um pouco menos rigorosa.

## Como funciona

```
Criar prova → [IA: proposta de redação + questões + resolução independente] → Prova pronta
→ Iniciar (timer no servidor) → responder → finalizar (ou o tempo acaba)
→ [IA: nota objetiva (TRI), comentários dos erros, 2–3 corretores de redação, parecer, diagnóstico]
→ Relatório .md (na tela + "Baixar .md")
```

**Geração** ([server/generate.js](server/generate.js))
1. **Proposta de redação.** A IA transforma o assunto em um tema no formato Enem e escreve 3 ou 4 textos motivadores originais, sem estatísticas inventadas e sem falas atribuídas a pessoas reais. O texto da proposta é fixo, montado no código.
2. **Plano determinístico** (sem IA, com semente = id da prova): disciplinas pelos pesos do Enem, assuntos sem repetição, dificuldade 30/45/25 e **letra do gabarito balanceada** (~20% cada), indicada à IA para evitar viés para C/D.
3. **Questões em lotes de 5**, em paralelo. Cada questão é **resolvida por uma segunda chamada que não vê o gabarito**. Se a resolução divergir do gabarito ou apontar problema, a questão é regenerada (até 3 vezes). Se a divergência persistir, ela entra como **anulada**: não conta na nota e é sinalizada no relatório, como faz o Inep.
4. Tudo é salvo a cada questão pronta. Se o servidor cair, a geração continua de onde parou ao subir de novo.

**Prova.** O cronômetro é do servidor: recarregar a página não reinicia nada, e reabrir em outra aba ou aparelho continua do ponto salvo. O autosave roda a cada ~1,5 s, ao trocar de questão e com `sendBeacon` ao fechar a aba. Quando o tempo acaba, o servidor entrega a prova sozinho, mesmo com o navegador fechado (agendador a cada 10 s).

**Avaliação** ([server/evaluate.js](server/evaluate.js)). Os passos são persistidos e retomáveis:
1. **Objetiva.** Estimativa TRI ([server/tri.js](server/tri.js)): modelo de 3 parâmetros por dificuldade com EAP, calibrado para que 100% ≈ 800, ~60% coerente ≈ 590 e chute ≈ 375. Errar fáceis e acertar difíceis pesa diferente.
2. **Comentários** personalizados para cada questão errada ou em branco, em lotes de 6.
3. **Redação.** Dois corretores independentes com a rubrica oficial. Há discrepância quando a diferença passa de 100 pontos no total ou de 80 em alguma competência; aí entra o **3º corretor**, e a nota final é a média com o corretor mais próximo. Texto em branco ou com até 7 linhas recebe nota 0 sem chamar a IA.
4. **Parecer** consolidado, **diagnóstico** e **plano de estudos**. Depois, o relatório é montado.

## Custos (com IA real)

Número aproximado de chamadas numa prova **Dia 1** (90 questões + redação):

| Etapa | Chamadas |
|---|---|
| Proposta de redação | 1 |
| Questões (lotes de 5) | ~18 |
| Resoluções independentes | ~90 (+ regenerações, em geral 5–15%) |
| Comentários dos erros (lotes de 6) | até ~15 |
| Corretores de redação | 2–3 |
| Parecer + diagnóstico | 2 |

Na ordem de **US$ 4–10 por prova completa** com os modelos padrão (Sonnet 5.5 na geração e na validação, Opus 5.5 na avaliação). O valor varia com o tamanho das respostas e com o raciocínio adaptativo dos modelos, então meça na sua conta. A geração de um Dia 1 completo leva alguns minutos.

## Testes

```bash
npm test                 # unitários + provedor Anthropic contra API falsa + end-to-end (modo mock)
npm run test:browser     # navegador (Playwright + Chromium/Chrome/Edge já instalado)
npm run test:real        # prova pequena com a IA REAL (precisa de ANTHROPIC_API_KEY; custa centavos)
```

- `test/unit.js`: faixas de calibração da TRI, contagem de linhas, plano (pesos, dificuldade, gabarito balanceado), regras da redação (média, 3º corretor, banca), validadores.
- `test/anthropic-fake.js`: o caminho real do SDK contra um servidor local que imita a API de Mensagens (SSE). Cobre o `tool_choice` por modelo, `fallbacks`, retry com feedback de validação, `max_tokens`, 429/529 com backoff e 401/404 permanentes.
- `test/smoke.js`: sobe o servidor numa porta livre com dados temporários e percorre Dia 1, Dia 2 e uma prova personalizada. Verifica que o gabarito não vaza, autosave e validação, relatório completo (90 linhas de gabarito), redação curta e em branco, discrepância forçada, autofinalização pelo agendador, retomada após derrubar o servidor no meio da geração e da avaliação, isolamento entre visitantes, limite diário e código de acesso.
- `test/browser.js`: criar → gerar → iniciar → responder (teclado e clique) → riscar/marcar → redação → finalizar → relatório. Exige zero erros de console, KaTeX renderizado e `<script>` injetado na redação sem efeito, e salva capturas desktop e 390 px em `test/screenshots/`. Procura o navegador em `CHROMIUM_PATH`, `/opt/pw-browsers/chromium`, Chrome ou Edge; não roda `playwright install`.

### Testar uma prova pequena com a chave real

```bash
# Linux/macOS
ANTHROPIC_API_KEY=sk-ant-... npm run test:real
# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-..."; npm run test:real
```

Cria uma prova com 1 questão de Linguagens, 2 de Matemática e redação. O script acompanha a geração, responde, escreve uma redação, finaliza e salva o relatório em `relatorio-teste-real.md`. Também dá para testar pela interface: com a chave no `.env`, rode `npm start` e crie uma prova **Personalizada** com poucas questões.

## Hospedagem

É um processo Node único, sem banco de dados e sem dependências nativas:

- `npm install --omit=dev && npm start` (ou `node server/index.js`) atrás de um proxy HTTPS (Nginx, Caddy, Fly.io, Render, Railway…).
- **Monte um volume persistente para `DATA_DIR`**: é onde ficam as provas e o controle de limites.
- Rode **uma instância só**: o controle de jobs e o agendador ficam em memória, com estado em arquivos locais.
- Defina `ACCESS_CODE` se não quiser o site aberto, e ajuste `MAX_PROVAS_POR_DIA`.
- O desligamento por `SIGINT`/`SIGTERM` é limpo, e a escrita atômica (`.tmp` + rename) nunca deixa JSON corrompido. Geração e avaliação interrompidas são retomadas na próxima subida.

## Limitações

- **Sem imagens ou figuras.** Gráficos e tabelas vêm como tabela markdown ou descrição em texto.
- **A TRI é aproximada.** Itens gerados não têm parâmetros calibrados com respondentes reais, e a nota não equivale à oficial.
- **A nota da redação dada por IA é uma estimativa**, mesmo com dois ou três corretores e a rubrica oficial.
- **Questões geradas podem conter erros** apesar da resolução independente. Itens que não passam na verificação são anulados, mas a verificação não é infalível.
- O visitante é identificado por cookie (`sid`). Limpar os cookies "perde" o acesso às provas antigas. Não há contas.

## Estrutura

```
server/  index.js (Express e rotas) · config.js · store.js (JSON atômico) · util.js · taxonomy.js
         ai.js (anthropic | mock) · mock.js · prompts.js (prompts, schemas, validadores)
         generate.js · evaluate.js · tri.js · report.js · jobs.js (segundo plano, retomada, agendador)
public/  index.html · styles.css · app.js · exam.js · report.js · ui.js · rich.js · api.js
         vendor/ (marked, DOMPurify, KaTeX + fontes woff2, sem CDN)
test/    unit.js · anthropic-fake.js · smoke.js · browser.js · real.js
data/    criado em runtime (fora do git)
```

Segurança: o gabarito e as explicações nunca saem do servidor antes do relatório. Todo markdown (questões, relatório, redação do aluno) passa por `marked` → `DOMPurify`, e a matemática é renderizada pelo KaTeX depois da sanitização. Os ids passam por regex estrita, o dono da prova é verificado em todas as rotas, os cookies são `HttpOnly`/`SameSite=Lax` e o CSP é restritivo (`script-src 'self'`).
