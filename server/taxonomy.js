// Áreas, disciplinas, assuntos e temas aleatórios.

export const AREAS = {
  LC: 'Linguagens, Códigos e suas Tecnologias',
  CH: 'Ciências Humanas e suas Tecnologias',
  CN: 'Ciências da Natureza e suas Tecnologias',
  MT: 'Matemática e suas Tecnologias',
};

export const AREAS_CURTAS = { LC: 'Linguagens', CH: 'Humanas', CN: 'Natureza', MT: 'Matemática' };
export const ORDEM_AREAS = ['LC', 'CH', 'CN', 'MT'];

export const LINGUA_ESTRANGEIRA = 'Língua Estrangeira';
export const LINGUAS = { ingles: 'Inglês', espanhol: 'Espanhol' };

/** Pesos para 45 questões (LC sem a língua estrangeira, que é tratada à parte). */
export const PESOS = {
  LC: {
    'Língua Portuguesa': 18,
    Literatura: 9,
    Artes: 4,
    'Educação Física': 4,
    'Tecnologias da Informação e Comunicação': 5,
  },
  CH: { História: 15, Geografia: 15, Filosofia: 8, Sociologia: 7 },
  CN: { Física: 15, Química: 15, Biologia: 15 },
  MT: { Matemática: 45 },
};

export const ASSUNTOS = {
  'Língua Portuguesa': [
    'interpretação de texto', 'inferência e pressupostos', 'gêneros textuais', 'tipologia textual',
    'funções da linguagem', 'variação linguística', 'preconceito linguístico', 'coesão referencial',
    'coesão sequencial e conectivos', 'coerência textual', 'figuras de linguagem', 'intertextualidade',
    'paráfrase e paródia', 'argumentação e estratégias persuasivas', 'textos publicitários',
    'charge e humor', 'tirinhas e linguagem verbo-visual descrita', 'norma-padrão e adequação',
    'regência e concordância em contexto', 'pontuação e efeitos de sentido', 'vozes do discurso e citação',
    'modalização e marcas de opinião', 'polissemia e ambiguidade', 'neologismos e formação de palavras',
    'linguagem jornalística', 'textos de divulgação científica', 'crônica', 'artigo de opinião',
    'linguagem jurídica e institucional', 'oralidade e escrita',
  ],
  Literatura: [
    'Quinhentismo e literatura de informação', 'Barroco', 'Arcadismo', 'Romantismo (poesia)',
    'Romantismo (prosa indianista e urbana)', 'Realismo (Machado de Assis)', 'Naturalismo',
    'Parnasianismo', 'Simbolismo', 'Pré-Modernismo', 'Semana de Arte Moderna de 1922',
    'Modernismo – primeira geração', 'Modernismo – geração de 30 (romance regionalista)',
    'Modernismo – poesia de 30 (Drummond, Cecília, Vinicius)', 'Geração de 45 e Clarice Lispector',
    'Guimarães Rosa e o regionalismo universal', 'Poesia concreta', 'Literatura marginal e periférica',
    'Literatura contemporânea brasileira', 'Literatura africana de língua portuguesa',
    'Literatura indígena contemporânea', 'Literatura de cordel', 'Teatro brasileiro',
    'Crônica literária', 'Literatura e escravidão (Castro Alves, Maria Firmina dos Reis)',
    'Literatura afro-brasileira contemporânea', 'Gêneros literários', 'Recursos poéticos e versificação',
  ],
  Artes: [
    'arte rupestre e pré-história', 'arte barroca mineira (Aleijadinho)', 'Missão Artística Francesa',
    'arte moderna brasileira (Tarsila, Anita Malfatti, Di Cavalcanti)', 'vanguardas europeias',
    'arte contemporânea e instalações', 'performance e arte conceitual', 'arte urbana e grafite',
    'música popular brasileira', 'samba e choro', 'Tropicália', 'bossa nova', 'rap e hip-hop no Brasil',
    'cultura popular e folguedos', 'patrimônio material e imaterial', 'arte indígena', 'arte afro-brasileira',
    'teatro e dança contemporânea', 'cinema brasileiro', 'fotografia e linguagem visual', 'design e arquitetura modernista',
  ],
  'Educação Física': [
    'corpo e esporte', 'esporte e mídia', 'práticas corporais e saúde', 'atividade física e qualidade de vida',
    'padrões de beleza e corpo', 'doping e ética no esporte', 'lutas e artes marciais', 'capoeira',
    'danças populares', 'jogos e brincadeiras tradicionais', 'esportes de aventura', 'paradesporto e inclusão',
    'sedentarismo e tecnologia', 'ginástica e condicionamento', 'futebol e identidade nacional',
    'esporte e gênero', 'lazer e direito à cidade',
  ],
  'Tecnologias da Informação e Comunicação': [
    'cultura digital', 'redes sociais e comunicação', 'desinformação e fake news', 'algoritmos e bolhas de filtro',
    'privacidade e dados pessoais', 'inteligência artificial e linguagem', 'memes e linguagem da internet',
    'hipertexto e leitura não linear', 'jornalismo digital', 'inclusão e exclusão digital', 'ciberativismo',
    'segurança da informação', 'games e narrativas interativas', 'emojis e comunicação multimodal',
    'publicidade digital e influenciadores',
  ],
  História: [
    'Antiguidade clássica (Grécia e Roma)', 'Idade Média e feudalismo', 'Renascimento e Reforma',
    'Expansão marítima europeia', 'Brasil Colônia – economia açucareira', 'Brasil Colônia – mineração',
    'escravidão e resistência negra (quilombos)', 'povos indígenas e colonização', 'Iluminismo',
    'Revolução Francesa', 'Revolução Industrial', 'independência do Brasil', 'Primeiro Reinado e Regências',
    'Segundo Reinado', 'abolição e pós-abolição', 'Proclamação e República Velha', 'revoltas na Primeira República',
    'Era Vargas', 'República Democrática (1946–1964)', 'Ditadura Militar', 'redemocratização e Constituição de 1988',
    'Primeira Guerra Mundial', 'Revolução Russa', 'crise de 1929', 'totalitarismos', 'Segunda Guerra Mundial',
    'Guerra Fria', 'descolonização da África e da Ásia', 'América Latina no século XX', 'imperialismo e neocolonialismo',
    'movimentos operários', 'história das mulheres e direitos', 'patrimônio e memória',
  ],
  Geografia: [
    'cartografia e escalas', 'fusos horários', 'projeções cartográficas', 'clima e fenômenos atmosféricos',
    'biomas brasileiros', 'domínios morfoclimáticos', 'relevo e solos', 'hidrografia e bacias brasileiras',
    'urbanização brasileira', 'problemas urbanos e segregação socioespacial', 'mobilidade urbana',
    'agropecuária e agronegócio', 'questão agrária e conflitos no campo', 'industrialização brasileira',
    'fontes de energia e matriz energética', 'questão ambiental e mudanças climáticas', 'recursos hídricos',
    'geopolítica contemporânea', 'globalização e redes', 'blocos econômicos', 'migrações internacionais',
    'população e transição demográfica', 'regionalização do Brasil', 'desmatamento na Amazônia',
    'geografia da fome e segurança alimentar', 'transportes e logística',
  ],
  Filosofia: [
    'pré-socráticos', 'Sócrates e o método socrático', 'Platão e a teoria das ideias', 'Aristóteles e a ética das virtudes',
    'helenismo (estoicismo e epicurismo)', 'filosofia medieval (Agostinho e Tomás de Aquino)', 'Maquiavel',
    'contratualistas (Hobbes, Locke, Rousseau)', 'racionalismo de Descartes', 'empirismo (Hume)', 'Kant e o imperativo categórico',
    'Hegel e a dialética', 'Nietzsche', 'existencialismo (Sartre e Beauvoir)', 'Escola de Frankfurt e indústria cultural',
    'Hannah Arendt e a banalidade do mal', 'Foucault e o poder disciplinar', 'ética e moral', 'bioética',
    'utilitarismo', 'filosofia da ciência', 'estética e filosofia da arte',
  ],
  Sociologia: [
    'Durkheim e o fato social', 'Weber e a ação social', 'Marx e as classes sociais', 'cultura e identidade',
    'etnocentrismo e relativismo cultural', 'desigualdade social', 'racismo estrutural', 'questões de gênero',
    'movimentos sociais', 'cidadania e direitos', 'Estado e poder', 'democracia e participação política',
    'trabalho e precarização', 'uberização do trabalho', 'indústria cultural e consumo', 'violência urbana',
    'juventude e sociedade', 'religião e sociedade', 'Bauman e a modernidade líquida', 'sociedade em rede',
    'mobilidade social', 'estratificação social',
  ],
  Física: [
    'cinemática – movimento uniforme', 'cinemática – movimento uniformemente variado', 'lançamento de projéteis',
    'leis de Newton', 'atrito e plano inclinado', 'movimento circular', 'trabalho e potência',
    'energia mecânica e conservação', 'quantidade de movimento e colisões', 'gravitação universal',
    'hidrostática – pressão e empuxo', 'termometria e dilatação', 'calorimetria', 'termodinâmica e máquinas térmicas',
    'óptica geométrica – espelhos', 'óptica geométrica – lentes e visão', 'ondulatória', 'acústica',
    'eletrostática', 'corrente elétrica e resistores', 'circuitos elétricos e consumo de energia', 'potência elétrica',
    'magnetismo', 'indução eletromagnética e geradores', 'física moderna e efeito fotoelétrico', 'radioatividade',
  ],
  Química: [
    'modelos atômicos', 'tabela periódica', 'ligações químicas', 'polaridade e forças intermoleculares',
    'funções inorgânicas', 'reações químicas e balanceamento', 'estequiometria', 'soluções e concentração',
    'diluição e mistura de soluções', 'propriedades coligativas', 'termoquímica', 'cinética química',
    'equilíbrio químico', 'pH e equilíbrio iônico', 'eletroquímica – pilhas', 'eletrólise',
    'radioatividade e meia-vida', 'química orgânica – funções', 'isomeria', 'reações orgânicas',
    'polímeros', 'química ambiental', 'separação de misturas', 'combustíveis e energia', 'química dos alimentos',
  ],
  Biologia: [
    'citologia – membrana e transporte', 'citologia – organelas', 'metabolismo energético (respiração e fermentação)',
    'fotossíntese', 'divisão celular', 'genética mendeliana', 'heredogramas e herança ligada ao sexo',
    'DNA, RNA e síntese proteica', 'biotecnologia e engenharia genética', 'evolução e seleção natural',
    'ecologia – cadeias e teias alimentares', 'ecologia – relações ecológicas', 'ciclos biogeoquímicos',
    'sucessão ecológica', 'impactos ambientais', 'fisiologia humana – digestão', 'fisiologia humana – circulação',
    'fisiologia humana – sistema imunológico e vacinas', 'sistema endócrino', 'sistema nervoso',
    'microbiologia – vírus e bactérias', 'parasitoses e saúde pública', 'botânica', 'zoologia',
    'reprodução humana e métodos contraceptivos', 'biomas e biodiversidade',
  ],
  Matemática: [
    'razão e proporção', 'porcentagem', 'regra de três simples e composta', 'escalas',
    'grandezas e unidades de medida', 'geometria plana – áreas', 'geometria plana – perímetros e semelhança',
    'teorema de Pitágoras', 'geometria espacial – volumes de prismas e cilindros', 'geometria espacial – cones e esferas',
    'planificação e vistas de sólidos', 'estatística – média, mediana e moda', 'estatística – desvio e dispersão',
    'leitura de gráficos e tabelas', 'probabilidade', 'análise combinatória', 'função afim', 'função quadrática',
    'função exponencial', 'logaritmos e função logarítmica', 'progressão aritmética', 'progressão geométrica',
    'geometria analítica – retas', 'geometria analítica – circunferência', 'trigonometria no triângulo retângulo',
    'funções trigonométricas e fenômenos periódicos', 'matemática financeira – juros simples',
    'matemática financeira – juros compostos', 'equações e sistemas lineares', 'inequações e otimização',
    'números e operações – frações e decimais', 'notação científica', 'divisibilidade, MMC e MDC', 'matrizes',
  ],
  [LINGUA_ESTRANGEIRA]: [
    'compreensão global do texto', 'identificação da finalidade do texto', 'inferência de sentido',
    'vocabulário em contexto', 'aspectos culturais', 'ironia e humor', 'posicionamento do autor',
    'informação específica', 'relação entre texto e público-alvo', 'efeito de sentido de expressões',
  ],
};

export const GENEROS_LE = [
  'notícia', 'letra de canção', 'anúncio', 'tirinha (descrita em texto)', 'post de rede social',
  'e-mail/carta', 'poema curto', 'artigo de divulgação científica', 'aviso/placa', 'entrevista',
];

export const DIFICULDADE_PROP = { facil: 0.3, medio: 0.45, dificil: 0.25 };
export const DIFICULDADE_NOME = { facil: 'Fácil', medio: 'Média', dificil: 'Difícil' };

export const TEMAS_ALEATORIOS = [
  'saúde mental dos jovens e redes sociais', 'desinformação e fake news', 'regulamentação das apostas on-line',
  'inteligência artificial e o futuro do trabalho', 'uberização e precarização do trabalho',
  'inclusão de pessoas neurodivergentes', 'mobilidade urbana nas grandes cidades',
  'mudanças climáticas e eventos extremos', 'segurança alimentar e combate à fome', 'envelhecimento populacional',
  'violência nas escolas', 'invisibilidade de grupos sociais', 'acesso à cultura nas periferias', 'desigualdade digital',
  'privacidade de dados pessoais', 'valorização dos povos indígenas', 'herança africana na cultura brasileira',
  'trabalho de cuidado realizado por mulheres', 'evasão escolar no ensino médio', 'população em situação de rua',
  'combate ao racismo estrutural', 'acessibilidade para pessoas com deficiência', 'doação de órgãos e sangue',
  'cyberbullying entre adolescentes', 'consumo consciente e obsolescência programada', 'descarte de lixo eletrônico',
  'preservação da Amazônia', 'crise hídrica e uso da água', 'leitura e formação de leitores',
  'violência contra a mulher', 'trabalho infantil', 'vacinação e hesitação vacinal', 'sedentarismo e obesidade infantil',
  'imigração e refugiados no Brasil', 'gravidez na adolescência', 'insegurança no trânsito', 'superendividamento das famílias',
  'manipulação do comportamento do usuário pelo controle de dados', 'estigma associado às doenças mentais',
  'democratização do acesso ao cinema', 'formação educacional de surdos', 'intolerância religiosa',
  'caminhos para combater a pobreza menstrual', 'valorização de comunidades e povos tradicionais',
  'desafios da educação a distância', 'excesso de telas na infância', 'turismo predatório e patrimônio',
  'acesso à saúde em regiões remotas', 'poluição plástica dos oceanos', 'cultura do cancelamento nas redes',
  'participação política dos jovens', 'tráfico de animais silvestres',
];

export function temasAleatorios(n, rand = Math.random) {
  const pool = TEMAS_ALEATORIOS.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
