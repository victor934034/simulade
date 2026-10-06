// IA simulada, determinística, para demonstração e testes. Tudo em português.
// - Questões com 5 alternativas e gabarito no gabaritoAlvo (Matemática com conta de verdade).
// - Resolvedor acerta, mas erra de propósito em ~5% (exercita a regeneração).
// - Corretores com notas variadas; discrepância ocasional (e forçada se a redação contiver
//   o marcador [[DISCREPANTE]]) para exercitar o 3º corretor.
import { hashStr, rng, pick, shuffle } from './util.js';
import { LINGUAS } from './taxonomy.js';

const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const NOTAS = [0, 40, 80, 120, 160, 200];

export function mockRespond(kind, input, tentativa = 1) {
  switch (kind) {
    case 'proposta': return proposta(input);
    case 'questoes': return questoes(input, tentativa);
    case 'resolucao': return resolucao(input);
    case 'comentarios': return comentarios(input);
    case 'corretor': return corretor(input);
    case 'parecer': return parecer(input);
    case 'diagnostico': return diagnostico(input);
    default: throw new Error(`mock: kind desconhecido ${kind}`);
  }
}

// ───────────── Proposta ─────────────
function proposta({ semente }) {
  const s = String(semente || 'tema').trim().replace(/\.$/, '');
  const r = rng(`prop:${s}`);
  const forma = pick(['Desafios para', 'Caminhos para'], r);
  const baixo = s.charAt(0).toLowerCase() + s.slice(1);
  const tema = forma === 'Desafios para'
    ? `Desafios para enfrentar ${baixo}${/brasil/i.test(baixo) ? '' : ' no Brasil'}`
    : `Caminhos para lidar com ${baixo}${/brasil/i.test(baixo) ? '' : ' na sociedade brasileira'}`;
  return {
    tema,
    eixo: pick(['Sociedade e cidadania', 'Tecnologia e sociedade', 'Saúde e bem-estar', 'Meio ambiente', 'Educação e cultura'], r),
    textos: [
      { tipo: 'expositivo', fonte: 'Texto elaborado para este simulado', texto: `O debate sobre ${baixo} ganhou espaço no país nos últimos anos. Especialistas apontam que o problema atinge de forma desigual diferentes grupos sociais, sobretudo os que têm menos acesso a serviços públicos de qualidade. Ainda que existam iniciativas pontuais, faltam políticas contínuas e integradas capazes de enfrentar as causas estruturais da questão.` },
      { tipo: 'jornalístico', fonte: 'Texto elaborado para este simulado', texto: `Em diversas cidades brasileiras, organizações comunitárias têm promovido rodas de conversa e campanhas de conscientização sobre ${baixo}. Segundo participantes, a troca de experiências ajuda a romper o silêncio e a aproximar a população dos órgãos responsáveis, embora muitas dessas ações dependam de voluntários e de recursos escassos.` },
      { tipo: 'dado qualitativo', fonte: 'Texto elaborado para este simulado', texto: `Levantamentos recentes indicam que uma parcela crescente da população reconhece ${baixo} como um problema relevante, mas poucos sabem a quem recorrer. Pesquisadores destacam que a falta de informação e a desigualdade regional dificultam respostas eficazes e ampliam os efeitos negativos sobre os mais vulneráveis.` },
      { tipo: 'opinião', fonte: 'Texto elaborado para este simulado', texto: `Não basta tratar ${baixo} como responsabilidade exclusiva do indivíduo. Escola, família, poder público e meios de comunicação precisam atuar em conjunto, com metas claras e participação social. Sem esse esforço coletivo, as soluções continuarão restritas a quem já tem mais oportunidades.` },
    ],
  };
}

// ───────────── Questões ─────────────
function questoes({ specs, area, lingua, tema, evitar }, tentativa) {
  return { questoes: specs.map((s) => questao(s, area, lingua, tema, `${tentativa}:${evitar || ''}`)) };
}

function alternativasNumericas(correto, passo, letraAlvo, fmt) {
  const k = LETRAS.indexOf(letraAlvo);
  let base = correto - k * passo;
  if (base <= 0) passo = Math.max(1, Math.floor(correto / (k + 1)) || 1), base = correto - k * passo;
  return LETRAS.map((l, i) => ({ letra: l, texto: fmt(correto + (i - k) * passo) }));
}

const brl = (v) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

function questaoMatematica(s, r) {
  const tipo = Math.floor(r() * 4);
  if (tipo === 0) {
    const preco = (Math.floor(r() * 40) + 10) * 10;
    const p = pick([10, 15, 20, 25, 30, 40], r);
    const correto = preco * (1 - p / 100);
    return {
      textoBase: `Uma loja anunciou uma promoção em que todos os produtos de uma seção recebem desconto percentual sobre o preço de etiqueta. O preço final é dado por\n\n$$P_f = P \\cdot \\left(1 - \\frac{p}{100}\\right)$$\n\nem que $P$ é o preço de etiqueta e $p$ é o percentual de desconto. Um cliente escolheu um produto cuja etiqueta indica ${brl(preco)}, e o desconto da seção é de ${p}%.`,
      enunciado: 'Qual é o valor, em reais, que esse cliente pagará pelo produto?',
      alternativas: alternativasNumericas(correto, preco * 0.05, s.gabaritoAlvo, brl),
      explicacao: `Aplicando a fórmula: $P_f = ${preco} \\cdot (1 - ${p}/100) = ${correto}$, ou seja, ${brl(correto)}. Os distratores resultam de aplicar o desconto de forma incorreta (somar em vez de subtrair, ou usar percentual errado).`,
    };
  }
  if (tipo === 1) {
    const a = Math.floor(r() * 8) + 3, b = Math.floor(r() * 8) + 4;
    const area = a * b;
    return {
      textoBase: `Um terreno retangular tem ${a} m de largura e ${b} m de comprimento. O proprietário deseja cobri-lo inteiramente com grama, vendida por metro quadrado. A área de um retângulo é dada por $A = \\ell \\cdot c$, em que $\\ell$ é a largura e $c$ é o comprimento.`,
      enunciado: 'Quantos metros quadrados de grama serão necessários para cobrir todo o terreno?',
      alternativas: alternativasNumericas(area, Math.max(2, Math.round(area / 8)), s.gabaritoAlvo, (v) => `$${v}$ m²`),
      explicacao: `A área é $${a} \\times ${b} = ${area}$ m². Os distratores confundem área com perímetro ou erram a multiplicação.`,
    };
  }
  if (tipo === 2) {
    const v = [Math.floor(r() * 5) + 4, Math.floor(r() * 5) + 6, Math.floor(r() * 5) + 8, Math.floor(r() * 5) + 5];
    const soma = v.reduce((x, y) => x + y, 0);
    const media = soma / 4;
    const fmt = (x) => `$${String(Number(x.toFixed(2))).replace('.', '{,}')}$`;
    return {
      textoBase: `Um estudante registrou as notas obtidas em quatro simulados ao longo do semestre:\n\n| Simulado | 1 | 2 | 3 | 4 |\n|---|---|---|---|---|\n| Nota | ${v.join(' | ')} |\n\nA média aritmética é calculada por $\\bar{x} = \\frac{x_1 + x_2 + x_3 + x_4}{4}$.`,
      enunciado: 'Qual é a média aritmética das notas desse estudante?',
      alternativas: alternativasNumericas(media, 0.5, s.gabaritoAlvo, fmt),
      explicacao: `Soma: ${v.join(' + ')} = ${soma}. Média: $${soma}/4 = ${media}$. Os distratores dividem pelo número errado de termos ou somam incorretamente.`,
    };
  }
  const km = (Math.floor(r() * 9) + 2) * 2;
  const escala = pick([50000, 100000, 200000], r);
  const cm = (km * 100000) / escala;
  return {
    textoBase: `Em um mapa rodoviário, a escala indicada é 1 : ${escala.toLocaleString('pt-BR')}, o que significa que 1 cm no mapa corresponde a ${escala.toLocaleString('pt-BR')} cm na realidade. Um motorista quer estimar a distância entre duas cidades ligadas por uma estrada retilínea de ${km} km.`,
    enunciado: 'Qual é a distância, em centímetros, entre essas duas cidades no mapa?',
    alternativas: alternativasNumericas(cm, Math.max(1, cm / 4), s.gabaritoAlvo, (x) => `$${String(Number(x.toFixed(2))).replace('.', '{,}')}$ cm`),
    explicacao: `${km} km = ${km * 100000} cm; dividindo pela escala: $${km * 100000} / ${escala} = ${cm}$ cm. Os distratores erram a conversão de unidades.`,
  };
}

const TEXTO_LE = {
  ingles: [
    'Many cities around the world are rethinking how people move. Bike lanes, safer sidewalks and better public transport are no longer seen as luxuries, but as basic tools to improve health and reduce pollution. "We designed streets for cars for too long," says a local urban planner in a recent interview.',
    'Teenagers today spend several hours a day online. While social media can help them stay connected with friends, experts warn that endless scrolling may affect sleep and concentration. Schools are now creating digital wellbeing programs to help students build healthier habits.',
  ],
  espanhol: [
    'En muchas ciudades latinoamericanas, los mercados populares siguen siendo espacios de encuentro y de memoria. Allí se venden frutas, tejidos y comidas típicas, pero también se comparten historias. Para los vecinos, el mercado es mucho más que un lugar de compras: es parte de su identidad.',
    'Cada vez más jóvenes buscan informarse por redes sociales. Sin embargo, especialistas recuerdan que no toda la información que circula es confiable. Verificar la fuente, comparar noticias y desconfiar de títulos exagerados son hábitos fundamentales para no difundir noticias falsas.',
  ],
};

function questaoGeral(s, r, lingua, tema) {
  const ctx = s.tematica && tema ? ` O tema "${tema}" serve de pano de fundo para a discussão.` : '';
  if (lingua) {
    const txt = pick(TEXTO_LE[lingua] || TEXTO_LE.ingles, r);
    const corretas = ['apresentar mudanças de hábito motivadas por preocupações coletivas', 'destacar a importância de atitudes críticas e conscientes', 'valorizar práticas que fortalecem vínculos sociais'];
    const erradas = ['defender a proibição total das tecnologias digitais', 'criticar a atuação de especialistas e pesquisadores', 'descrever um fenômeno restrito a um único país', 'propor a substituição imediata de serviços públicos', 'ironizar o comportamento dos jovens contemporâneos', 'relatar um acontecimento histórico já superado'];
    return montarAlternativas(s, r, {
      textoBase: `${txt}\n\n*(${pick(['notícia', 'post de rede social', 'artigo de divulgação'], r)} — texto em ${LINGUAS[lingua]})*`,
      enunciado: `Ao abordar o assunto "${s.assunto}", o texto tem como principal objetivo`,
      correta: pick(corretas, r),
      erradas: shuffle(erradas, r).slice(0, 4),
      explicacao: 'O texto apresenta o fenômeno como questão coletiva e aponta atitudes conscientes; as demais alternativas extrapolam ou contradizem o que é dito.',
    });
  }
  const corretas = [
    `relaciona ${s.assunto} a transformações sociais e culturais do contexto apresentado`,
    `evidencia que ${s.assunto} depende da articulação entre fatores históricos e sociais`,
    `mostra que a compreensão de ${s.assunto} exige análise crítica das informações do texto`,
  ];
  const erradas = [
    `nega qualquer relação entre ${s.assunto} e o contexto social`,
    'restringe a questão a escolhas individuais isoladas',
    'atribui o fenômeno exclusivamente a fatores naturais',
    'trata o tema como algo superado e sem relevância atual',
    'defende que apenas especialistas podem opinar sobre o assunto',
    'reduz o problema a uma questão de gosto pessoal',
  ];
  return montarAlternativas(s, r, {
    textoBase: `No estudo de ${s.disciplina}, o tema "${s.assunto}" costuma ser analisado a partir de diferentes perspectivas. Pesquisadores destacam que fenômenos desse tipo não podem ser compreendidos isoladamente, pois envolvem relações entre sociedade, cultura, economia e ambiente.${ctx}\n\nAssim, a leitura atenta de fontes diversas e a comparação entre pontos de vista são essenciais para construir interpretações bem fundamentadas, evitando generalizações apressadas.`,
    enunciado: `Com base no texto e nos conhecimentos sobre ${s.assunto}, conclui-se que a abordagem apresentada`,
    correta: pick(corretas, r),
    erradas: shuffle(erradas, r).slice(0, 4),
    explicacao: `A alternativa correta sintetiza a ideia central do texto: ${s.assunto} precisa ser analisado em relação ao contexto. As demais isolam o fenômeno, o naturalizam ou o desqualificam, contrariando o texto.`,
  });
}

function montarAlternativas(s, r, { textoBase, enunciado, correta, erradas, explicacao }) {
  const k = LETRAS.indexOf(s.gabaritoAlvo);
  const textos = erradas.slice();
  textos.splice(k, 0, correta);
  return { textoBase, enunciado, alternativas: LETRAS.map((l, i) => ({ letra: l, texto: textos[i] })), explicacao };
}

function questao(s, area, lingua, tema, salt) {
  const r = rng(`q:${s.n}:${s.disciplina}:${s.assunto}:${s.gabaritoAlvo}:${salt}`);
  const base = area === 'MT' || (area === 'CN' && s.disciplina === 'Física' && r() < 0.3) ? questaoMatematica(s, r) : questaoGeral(s, r, lingua, tema);
  return {
    n: s.n,
    textoBase: base.textoBase,
    fonte: 'Texto elaborado para este simulado',
    enunciado: base.enunciado,
    alternativas: base.alternativas,
    gabarito: s.gabaritoAlvo,
    explicacao: base.explicacao,
    habilidade: `Analisar situações envolvendo ${s.assunto}.`,
  };
}

// ───────────── Resolução ─────────────
function resolucao({ questao: q, gabaritoMock }) {
  const h = hashStr(`res:${q.id}:${q.enunciado}:${q.textoBase}:${q.alternativas.map((a) => a.texto).join('|')}`);
  const erra = h % 20 === 0; // ~5%
  const alternativa = erra ? LETRAS[(LETRAS.indexOf(gabaritoMock) + 1 + (h % 4)) % 5] : gabaritoMock;
  return {
    resolucao: `Lendo o texto-base e o comando, identifica-se que a alternativa ${alternativa} atende ao que é pedido.`,
    alternativa,
    problema: false,
    motivo: erra ? 'Resolução independente divergiu do gabarito.' : '',
  };
}

// ───────────── Comentários ─────────────
function comentarios({ itens }) {
  return {
    comentarios: itens.map((it) => ({
      qid: it.qid,
      porQueAtrai: it.marcada
        ? `A alternativa ${it.marcada} atrai porque usa termos do texto-base, mas generaliza ou distorce a ideia central.`
        : 'Em branco: provavelmente faltou tempo ou segurança para relacionar o texto ao conceito cobrado.',
      conceitoChave: `Domínio de ${it.assunto} aplicado ao contexto apresentado.`,
      dica: 'Releia o comando, elimine alternativas que extrapolam o texto e confira se a escolhida responde exatamente ao que foi pedido.',
    })),
  };
}

// ───────────── Corretor ─────────────
function corretor({ redacao, papel }) {
  const forcar = /\[\[DISCREPANTE\]\]/.test(redacao);
  const h = hashStr(redacao);
  const r = rng(`cor:${h}:${papel}`);
  let notas;
  if (forcar) {
    notas = papel === 1 ? [200, 200, 200, 200, 200] : papel === 2 ? [80, 80, 80, 80, 80] : [200, 200, 200, 160, 160];
  } else {
    const nivel = 2 + (h % 3); // 2..4 → 80..160
    notas = [0, 1, 2, 3, 4].map(() => NOTAS[Math.max(1, Math.min(5, nivel + (r() < 0.3 ? 1 : r() < 0.3 ? -1 : 0)))]);
    // discrepância ocasional natural (~1 em 7 redações)
    if (h % 7 === 0 && papel === 2) notas = notas.map((n) => Math.max(40, n - 120));
  }
  const trecho = (redacao.replace(/\[\[DISCREPANTE\]\]/g, '').trim().split(/(?<=[.!?])\s+/)[0] || redacao).slice(0, 120);
  const ids = ['C1', 'C2', 'C3', 'C4', 'C5'];
  const nome = { C1: 'norma-padrão', C2: 'tipo textual e tema', C3: 'organização dos argumentos', C4: 'coesão', C5: 'proposta de intervenção' };
  const els = ['agente', 'acao', 'meio', 'finalidade', 'detalhamento'];
  const qtdEls = Math.max(0, Math.min(5, notas[4] / 40));
  return {
    anulacao: { anulada: false, motivo: '' },
    competencias: ids.map((id, i) => ({
      id,
      nota: notas[i],
      justificativa: `Corretor ${papel}: desempenho ${notas[i] >= 160 ? 'bom' : notas[i] >= 120 ? 'mediano' : 'insuficiente'} em ${nome[id]}, conforme a rubrica.`,
      evidencias: [trecho],
    })),
    desvios: [
      { trecho, tipo: 'pontuação', correcao: `${trecho.replace(/,/g, '')} (revisar vírgulas)`, competencia: 'C1' },
      { trecho: 'Além disso', tipo: 'coesão', correcao: 'Variar conectivos: "Ademais", "Outrossim", "Nesse sentido"', competencia: 'C4' },
    ],
    pontosFortes: ['Tese apresentada logo na introdução.', 'Texto organizado em parágrafos.'],
    pontosAFortalecer: ['Aprofundar o repertório sociocultural.', 'Detalhar melhor a proposta de intervenção.'],
    intervencao: Object.fromEntries(els.map((k, i) => [k, { presente: i < qtdEls, trecho: i < qtdEls ? trecho.slice(0, 60) : '' }])),
    repertorio: { descricao: 'Referência genérica a dados e instituições.', legitimado: true, pertinente: true, produtivo: notas[1] >= 160, comentario: 'Repertório pertinente, mas pouco explorado.' },
    direitosHumanos: { respeitados: true, comentario: '' },
  };
}

// ───────────── Parecer ─────────────
function parecer({ notasFinais, tema }) {
  const total = notasFinais.reduce((s, c) => s + c.nota, 0);
  return {
    resumo: `A redação obteve ${total} pontos. O texto demonstra compreensão do tema "${tema}" e estrutura dissertativo-argumentativa reconhecível, mas pode avançar no aprofundamento dos argumentos, na diversidade de recursos coesivos e no detalhamento da proposta de intervenção.`,
    porCompetencia: notasFinais.map((c) => ({
      id: c.id,
      comentario: `Nota ${c.nota}: ${c.nota >= 160 ? 'bom domínio, com poucos ajustes necessários' : c.nota >= 120 ? 'domínio mediano, com pontos claros de melhoria' : 'domínio ainda insuficiente nesta competência'}.`,
      comoSubir: {
        C1: 'Revise concordância, regência e pontuação; releia o texto em voz alta procurando desvios.',
        C2: 'Use repertório legitimado (lei, conceito, obra) e explique como ele sustenta a tese.',
        C3: 'Planeje: tese clara, dois argumentos desenvolvidos com causa e consequência e conclusão que retome a tese.',
        C4: 'Varie conectivos entre e dentro dos parágrafos e evite repetir palavras.',
        C5: 'Inclua agente, ação, meio, finalidade e detalhamento, ligados à discussão.',
      }[c.id],
    })),
    desviosPrincipais: [{ trecho: 'Além disso', correcao: 'Ademais / Outrossim', explicacao: 'Repetição do mesmo conectivo empobrece a coesão.' }],
    exemploPropostaIntervencao: 'O Ministério da Educação, em parceria com as secretarias estaduais, deve criar programas permanentes de conscientização nas escolas, por meio de oficinas e materiais didáticos produzidos com especialistas, a fim de reduzir os impactos do problema — iniciativa que pode ser acompanhada por relatórios anuais públicos.',
    planoDeTreino: ['Escrever uma redação por semana com tempo cronometrado.', 'Montar um banco de repertórios por eixo temático.', 'Reescrever a conclusão com os 5 elementos da intervenção.'],
  };
}

// ───────────── Diagnóstico ─────────────
function diagnostico({ erros }) {
  const cont = {};
  for (const e of erros || []) cont[e.disciplina] = (cont[e.disciplina] || 0) + 1;
  const top = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return {
    resumo: `O desempenho mostra base razoável, com ${erros?.length || 0} questões erradas ou em branco. Os erros se concentram em ${top.map(([d]) => d).join(', ') || 'poucas disciplinas'}, o que indica onde o estudo rende mais pontos.`,
    pontosFortes: ['Boa leitura de enunciados contextualizados.', 'Regularidade nas questões fáceis.'],
    prioridades: (top.length ? top : [['Revisão geral', 0]]).map(([d, n]) => ({
      assunto: d,
      motivo: `${n} erro(s) nesta disciplina.`,
      comoEstudar: 'Revisar a teoria em resumos, resolver 20 questões comentadas e refazer os itens errados após uma semana.',
    })),
    planoDeEstudo: [
      { titulo: 'Semana 1 — Fundamentos', acoes: ['Revisar os assuntos prioritários.', 'Resolver 10 questões fáceis por dia.'] },
      { titulo: 'Semana 2 — Aplicação', acoes: ['Questões médias cronometradas.', 'Uma redação completa.'] },
      { titulo: 'Semana 3 — Simulado', acoes: ['Novo simulado completo.', 'Comparar desempenho e ajustar o plano.'] },
    ],
  };
}
