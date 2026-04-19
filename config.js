export const PROFESSIONS = [
  { id:'programador', name:'Programador(a)', salary:320, description:'Ganhos altos, mas o estresse é infinito.', powerBoost: 8, defenseBoost: 3 },
  { id:'cozinheiro', name:'Cozinheiro(a)', salary:240, description:'Faça doces bons o suficiente pra mim.', powerBoost: 4, defenseBoost: 4 },
  { id:'seguranca', name:'Segurança Particular', salary:280, description:'Tente ser 1% do que eu sou protegendo.', powerBoost: 5, defenseBoost: 8 },
  { id:'investigador', name:'Investigador(a)', salary:260, description:'Procure problemas onde ninguém mais vê.', powerBoost: 6, defenseBoost: 5 },
  { id:'engenheiro', name:'Engenheiro(a)', salary:300, description:'Construa coisas que eu não vá destruir.', powerBoost: 7, defenseBoost: 6 },
  { id:'cacador', name:'Caçador(a) de Recompensa', salary:290, description:'Para quem gosta de perigo e grana fácil.', powerBoost: 9, defenseBoost: 4 },
  { id:'empresario', name:'Empresário(a)', salary:330, description:'Comande os outros enquanto lucra alto.', powerBoost: 6, defenseBoost: 6 }
]

export const STORE = {
  itens: [
    { id:1, name:'Colete de Couro', price:700, defense:5, description:'Proteção leve para o torso. (+5% Defesa)' },
    { id:2, name:'Luvas de Trabalho', price:450, boost:0.05, description:'Protege as mãos. (+5% de bônus no .work)' },
    { id:3, name:'Poção de HP Pequena', price:550, hpRestore:0.2, description:'Curativo rápido. (Recupera 20% da vida)' },
    { id:4, name:'Curativo Rápido', price:450, hpRestore:0.15, description:'Estanca sangramentos simples em batalhas.' },
    { id:5, name:'Corda de Nylon', price:620, exploreBoost:0.10, description:'Facilita a descida em masmorras ou cavernas.' },
    { id:6, name:'Vassoura de Palha', price:350, boost:0.02, description:'Aumenta ganhos em trabalhos braçais. (+2%)' },
    { id:7, name:'Armadura de Ferro', price:3200, defense:10, description:'Resistência sólida contra golpes. (+10% Defesa)' },
    { id:8, name:'Escudo de Bronze', price:2500, defense:8, description:'Chance de bloquear ataques físicos. (+8%)' },
    { id:9, name:'Picareta de Ferro', price:3800, power:10, mineBoost:0.10, description:'Melhora a extração de minérios. (+10% no .minerar)' },
    { id:10, name:'Machado de Aço', price:3800, power:14, workBoost:0.10, description:'Corta madeira com mais facilidade. (+10% no trabalho)' },
    { id:11, name:'Rede de Caça', price:2900, huntBoost:0.15, description:'Aumenta a chance de capturar animais. (+15% no .cacar)' },
    { id:12, name:'Antídoto Geral', price:1800, special:'antidoto', description:'Remove qualquer efeito de veneno do corpo.' },
    { id:13, name:'Manto de Fluxo', price:8000, agilityBoost:0.10, description:'Tecido leve que ajuda a desviar. (+10% Agilidade)' },
    { id:14, name:'Enxada de Prata', price:6800, plantBoost:0.15, description:'Melhora o rendimento da horta. (+15% no .plantar)' },
    { id:15, name:'Suco de Mochi', price:6200, energyRestore:0.5, description:'O lanche favorito do Gojo. (Recupera 50% de Energia)' },
    { id:16, name:'Kit Investigação', price:9500, exploreBoost:0.20, description:'Aumenta sucesso em buscas. (+20% em .explorar)' },
    { id:17, name:'Vara de Pesca Pro', price:7600, huntBoost:0.20, description:'Fisga peixes raros com mais facilidade. (+20%)' },
    { id:18, name:'Bota de Mercenário', price:11500, escapeBoost:0.15, description:'Melhora a velocidade de fuga. (+15% Escape)' },
    { id:19, name:'Cota de Malha Real', price:22000, defense:15, description:'Proteção de cavaleiro. (+15% Defesa total)' },
    { id:20, name:'Armadura de Placas', price:31000, defense:25, description:'Quase impenetrável. (+25% Defesa total)' },
    { id:21, name:'Maleta Executiva', price:36000, salarioBoost:0.20, description:'Aumenta o prestígio e o salário. (+20% no .salario)' },
    { id:22, name:'Notebook Gamer', price:27000, workBoost:0.20, description:'Aumenta a eficiência em código. (+20% no trabalho)' },
    { id:23, name:'Picareta de Diamante', price:49000, power:30, mineBoost:0.35, description:'Extrai joias lendárias. (+35% no .minerar)' },
    { id:24, name:'Poção de HP Grande', price:17500, hpRestore:1, description:'Regeneração total. (Cura 100% da vida)' },
    { id:25, name:'Manto do Vazio', price:135000, special:'invisible', escapeBoost:0.20, description:'Difícil de ser tocado. (+20% de Esquiva real)' },
    { id:26, name:'Escudo de Obsidiana', price:165000, defense:20, special:'immuneFire', description:'Proteção extrema. (Torna você imune a fogo)' },
    { id:27, name:'Traje de Sombra', price:225000, special:'invisible', escapeBoost:0.20, description:'Fica invisível por 3 turnos (Escapa de lutas)' },
    { id:28, name:'Amuleto de Vida', price:360000, special:'revive', description:'Uma segunda chance. (Renasce 1x se morrer)' },
    { id:29, name:'Frasco Adrenalina', price:99000, special:'adrenalina', description:'Impulso de poder. (Dobra o seu Dano por 3 rodadas)' },
    { id:30, name:'Elixir de Satoru', price:899999, special:'maxstatus', description:'Poder absoluto. (Todos os Status no Máximo por 1h)' }
  ],
  util: [
    { id:1, name:'Poção', price:200, boost:0.05 },
    { id:2, name:'Laptop', price:600, boost:0.10 },
    { id:3, name:'Ferramentas Pro', price:750, boost:0.12 },
    { id:4, name:'Uniforme Premium', price:500, boost:0.08 },
    { id:5, name:'Mochila Tática', price:300, boost:0.06 },
    { id:6, name:'Cofre Portátil', price:400, boost:0.07 },
    { id:7, name:'Câmera Ação', price:450, boost:0.07 },
    { id:8, name:'Droninho', price:900, boost:0.15 },
    { id:9, name:'Kit Energia', price:350, boost:0.06 },
    { id:10, name:'Relógio Smart', price:500, boost:0.08 }
  ],
  decor: [
    { id:1, name:'Quadro Neon', price:200, boost:0.01 },
    { id:2, name:'Planta Exótica', price:150, boost:0.01 },
    { id:3, name:'Cadeira Gamer', price:700, boost:0.02 },
    { id:4, name:'Mesa Assinatura', price:650, boost:0.02 },
    { id:5, name:'Luminária RGB', price:220, boost:0.01 },
    { id:6, name:'Cortinas Chiques', price:180, boost:0.01 },
    { id:7, name:'Tapete Macio', price:160, boost:0.01 },
    { id:8, name:'Estante Minimal', price:350, boost:0.015 },
    { id:9, name:'Som Ambiente', price:500, boost:0.02 },
    { id:10, name:'Poltrona Estilo', price:800, boost:0.025 }
  ],
  casa: [
    { id:1, name:'Quitinete', price:5000, boost:0.05 },
    { id:2, name:'Casa Simples', price:10000, boost:0.08 },
    { id:3, name:'Casa Média', price:20000, boost:0.1 },
    { id:4, name:'Cobertura', price:50000, boost:0.15 },
    { id:5, name:'Mansão', price:100000, boost:0.2 },
    { id:6, name:'Sítio', price:45000, boost:0.12 },
    { id:7, name:'Loft Urbano', price:25000, boost:0.1 },
    { id:8, name:'Duplex', price:40000, boost:0.12 },
    { id:9, name:'Triplex', price:70000, boost:0.16 },
    { id:10, name:'Ilha Privada', price:500000, boost:0.3 }
  ],
  armas: [
    { id:1, name:'Adaga Enferrujada', price:700, power:5 },
    { id:2, name:'Espada Curta', price:1400, power:12 },
    { id:3, name:'Machado de Batalha', price:2500, power:22 },
    { id:4, name:'Arco Rústico', price:2200, power:18 },
    { id:5, name:'Espada Longa', price:4000, power:28 },
    { id:6, name:'Lança de Caça', price:3500, power:24 },
    { id:7, name:'Cimitarra', price:4800, power:32 },
    { id:8, name:'Sabre Brilhante', price:6500, power:40 },
    { id:9, name:'Katana Sombria', price:9000, power:55 },
    { id:10, name:'Martelo do Herói', price:12000, power:70 }
  ],
  armaduras: [
    { id:1, name:'Couraça Ligeira', price:1000, defense:5 },
    { id:2, name:'Manto de Caça', price:1800, defense:10 },
    { id:3, name:'Colete de Aço', price:3200, defense:18 },
    { id:4, name:'Escudo Rústico', price:2600, defense:15 },
    { id:5, name:'Armadura de Couro', price:4200, defense:24 },
    { id:6, name:'Armadura de Placas', price:6500, defense:32 },
    { id:7, name:'Cota de Malha', price:7000, defense:34 },
    { id:8, name:'Peitoral Encantado', price:9800, defense:45 },
    { id:9, name:'Couraça de Dragão', price:15000, defense:60 },
    { id:10, name:'Armamento Divino', price:22000, defense:80 }
  ],
  materiais: [
    { id:1, name:'Pedra Bruta', price:80 },
    { id:2, name:'Erva Mística', price:120 },
    { id:3, name:'Pele de Animal', price:160 },
    { id:4, name:'Minério Raro', price:300 },
    { id:5, name:'Semente Selvagem', price:90 },
    { id:6, name:'Ouro Antigo', price:450 },
    { id:7, name:'Cristal Arcano', price:550 },
    { id:8, name:'Prata Bruta', price:220 }
  ]
}

export const PLANTS = [
  { id:'tomate', name:'Tomate', cost:50, sellPrice:120, time:3*60*1000 },
  { id:'cenoura', name:'Cenoura', cost:60, sellPrice:150, time:4*60*1000 },
  { id:'melancia', name:'Melancia', cost:80, sellPrice:200, time:5*60*1000 },
  { id:'abobora', name:'Abóbora', cost:100, sellPrice:280, time:7*60*1000 }
]
