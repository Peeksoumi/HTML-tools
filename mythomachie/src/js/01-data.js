/* ===== Données du jeu (Mythomachie) ===== */
const T = 32;            // taille d'une case en pixels du monde
const POP_MAX = 100;
const FOI_MAX = 300;
const CARRY = 10;
const TEAM = ['#3f7fe8', '#e0443a', '#a35ee0', '#f2901e'];
const SKINS = ['#f0c9a4', '#d9a77c', '#b98257', '#8d5b3b'];
const RES_KEYS = ['food', 'wood', 'gold', 'foi'];
const RES_NAME = { food: 'Nourriture', wood: 'Bois', gold: 'Or', foi: 'Foi' };
/* Âges : on passe au suivant par une recherche à la Cité (age1, age2) ; un champ age sur une unité, un bâtiment,
   une recherche ou un pouvoir donne l'âge minimal pour y accéder. */
const AGES = [
  { name: 'Âge des Fondations', short: 'I' },
  { name: 'Âge des Cités', short: 'II' },
  { name: 'Âge des Prodiges', short: 'III' },
];

/* Unités. range et speed en cases, r et h en pixels */
const U = {
  villager: { name: 'Citoyen', plural: 'Citoyens', cls: 'vill', hp: 45, atk: 3, rate: 1.5, range: 0.2, speed: 1.75, sight: 6, armor: 0, pop: 1, cost: { food: 50 }, time: 10, r: 7, h: 22,
    desc: 'Récolte, construit et répare.' },
  hoplite: { name: 'Hoplite', plural: 'Hoplites', cls: 'inf', hp: 110, atk: 8, rate: 1.3, range: 0.25, speed: 1.65, sight: 6, armor: 2, pop: 1, cost: { food: 55, gold: 15 }, time: 12, r: 8, h: 24,
    desc: 'Fantassin à la lance. Redoutable contre la cavalerie.' },
  archer: { name: 'Archer', plural: 'Archers', cls: 'arch', hp: 60, atk: 6, rate: 1.6, range: 5.5, speed: 1.8, sight: 8, armor: 0, pop: 1, cost: { wood: 45, gold: 20 }, time: 12, r: 7, h: 22, proj: 'arrow',
    desc: 'Tire à distance. Efficace contre les fantassins.' },
  cavalier: { name: 'Cavalier', plural: 'Cavaliers', cls: 'cav', age: 1, hp: 150, atk: 9, rate: 1.5, range: 0.25, speed: 2.9, sight: 7, armor: 1, pop: 2, cost: { food: 80, gold: 40 }, time: 15, r: 10, h: 30,
    desc: 'Rapide. Efficace contre les archers et les citoyens.' },
  ram: { name: 'Bélier', plural: 'Béliers', cls: 'siege', age: 2, hp: 260, atk: 45, rate: 3, range: 0.25, speed: 1.05, sight: 4, armor: 3, pop: 2, cost: { wood: 150, gold: 40 }, time: 20, r: 11, h: 24, onlyB: true,
    desc: 'Engin de siège : n’attaque que les bâtiments, résiste aux flèches.' },
  cyclops: { name: 'Cyclope', plural: 'Cyclopes', cls: 'myth', hp: 480, atk: 28, rate: 2.2, range: 0.35, speed: 1.45, sight: 7, armor: 3, pop: 4, cost: { gold: 75, foi: 50 }, time: 25, r: 13, h: 44, splash: 1.2, bBonus: 2,
    desc: 'Géant forgeron de Zeus : frappe en zone et démolit les murs.' },
  valkyrie: { name: 'Valkyrie', plural: 'Valkyries', cls: 'myth', hp: 280, atk: 15, rate: 1.2, range: 0.25, speed: 3.1, sight: 8, armor: 2, pop: 3, cost: { gold: 60, foi: 40 }, time: 20, r: 10, h: 34, heal: { r: 3.5, hps: 4 },
    desc: 'Guerrière ailée d’Odin, très rapide : soigne les alliés proches.' },
  phoenix: { name: 'Phénix', plural: 'Phénix', cls: 'myth', hp: 230, atk: 16, rate: 2, range: 5, speed: 2.4, sight: 9, armor: 1, pop: 3, cost: { gold: 65, foi: 45 }, time: 22, r: 11, h: 44, fly: true, proj: 'fire', splash: 1.3,
    desc: 'Oiseau de feu de Râ : vole au-dessus de tout et crache des flammes.' },
  einherjar: { name: 'Einherjar', plural: 'Einherjar', cls: 'inf', hp: 120, atk: 11, rate: 1.3, range: 0.25, speed: 2, sight: 6, armor: 2, pop: 0, cost: {}, time: 1, r: 8, h: 24, summon: true,
    desc: 'Guerrier spectral du Valhalla, invoqué pour un temps.' },
};

/* Multiplicateurs de dégâts : attaquant -> cible */
const MULT = {
  vill:  { vill: 1, inf: 0.5, arch: 1, cav: 0.5, siege: 1, myth: 0.5, bld: 0.4 },
  inf:   { vill: 1.2, inf: 1, arch: 1.2, cav: 2.5, siege: 1.5, myth: 1, bld: 0.6 },
  arch:  { vill: 1.2, inf: 1.6, arch: 1, cav: 0.7, siege: 0.3, myth: 0.8, bld: 0.15 },
  cav:   { vill: 1.6, inf: 0.8, arch: 2, cav: 1, siege: 1.5, myth: 0.8, bld: 0.5 },
  siege: { vill: 0, inf: 0, arch: 0, cav: 0, siege: 0, myth: 0, bld: 1 },
  myth:  { vill: 1.2, inf: 1.1, arch: 1.1, cav: 1, siege: 1.5, myth: 1, bld: 1.2 },
  tower: { vill: 1, inf: 0.8, arch: 1, cav: 0.8, siege: 0.3, myth: 0.7, bld: 0 },
  god:   { vill: 1, inf: 1, arch: 1, cav: 1, siege: 1, myth: 1, bld: 0.5 },
};

/* Bâtiments. size en cases */
const B = {
  city: { name: 'Cité', f: true, size: 4, hp: 2200, cost: { wood: 300, gold: 150 }, time: 90, pop: 10, drop: true, trains: ['villager'], research: ['age1', 'age2', 'tools', 'tools2', 'walls'], sight: 9,
    shoot: { atk: 5, rate: 2, range: 6.5 }, desc: 'Cœur du peuple : forme les citoyens et reçoit toutes les ressources.' },
  house: { name: 'Maison', f: true, size: 2, hp: 350, cost: { wood: 40 }, time: 18, pop: 6, sight: 4, desc: '+6 de population.' },
  farm: { name: 'Ferme', f: true, size: 3, hp: 200, cost: { wood: 60 }, time: 15, walk: true, sight: 3, desc: 'Nourriture inépuisable, pour un citoyen à la fois.' },
  store: { name: 'Entrepôt', f: false, size: 2, hp: 450, cost: { wood: 80 }, time: 22, drop: true, sight: 5, desc: 'Dépôt de ressources à bâtir près des forêts et des mines.' },
  barracks: { name: 'Caserne', f: true, size: 3, hp: 900, cost: { wood: 150 }, time: 40, trains: ['hoplite', 'archer', 'cavalier', 'ram'], research: ['iron', 'shields', 'forge'], sight: 6,
    desc: 'Forme les soldats et les béliers.' },
  temple: { name: 'Temple', f: false, age: 1, size: 3, hp: 1000, cost: { wood: 120, gold: 100 }, time: 45, trains: ['$myth'], research: ['rites', 'blood'], foi: 0.45, sight: 6, max: 3,
    desc: 'Produit la Foi des pouvoirs divins et invoque la créature de votre dieu.' },
  tower: { name: 'Tour', f: true, age: 1, size: 2, hp: 750, cost: { wood: 100, gold: 50 }, time: 35, shoot: { atk: 8, rate: 1.6, range: 7 }, sight: 9,
    desc: 'Tire des flèches sur les ennemis à portée.' },
};
const BUILD_LIST = ['house', 'farm', 'store', 'barracks', 'temple', 'tower', 'city'];
/* Hauteur visuelle des bâtiments (pour les clics et les barres de vie) */
const BLD_H = { city: 74, house: 40, farm: 6, store: 34, barracks: 56, temple: 64, tower: 84 };

const R = {
  age1: { name: 'Âge des Cités', desc: 'Passer à l’âge II : Temple (Foi, créature, pouvoirs divins), Tour, Cavalier et quatre recherches.', cost: { food: 400, gold: 150 }, time: 45, icon: 'age1', ageUp: 1 },
  age2: { name: 'Âge des Prodiges', desc: 'Passer à l’âge III : Bélier, second pouvoir divin, Outils de fer, Forge divine et Sang divin.', cost: { food: 750, gold: 550 }, time: 60, icon: 'age2', ageUp: 2, age: 1 },
  tools: { name: 'Outils de bronze', desc: '+20 % de vitesse de récolte.', cost: { food: 150, wood: 100 }, time: 30, icon: 'tools' },
  tools2: { name: 'Outils de fer', desc: '+15 % de vitesse de récolte, en plus des outils de bronze.', cost: { food: 250, wood: 250 }, time: 40, icon: 'tools2', age: 2 },
  walls: { name: 'Remparts', desc: '+40 % de PV pour les bâtiments, +3 dégâts pour tours et cités.', cost: { wood: 150, gold: 150 }, time: 40, icon: 'walls', age: 1 },
  iron: { name: 'Armes de fer', desc: '+2 d’attaque pour les soldats et les créatures.', cost: { food: 150, gold: 150 }, time: 40, icon: 'iron', age: 1 },
  shields: { name: 'Boucliers de bronze', desc: '+2 d’armure pour les soldats.', cost: { wood: 150, gold: 150 }, time: 40, icon: 'shields', age: 1 },
  forge: { name: 'Forge divine', desc: 'Soldats et créatures : +2 d’attaque et +1 d’armure.', cost: { food: 250, gold: 350 }, time: 50, icon: 'forge', age: 2 },
  rites: { name: 'Rites sacrés', desc: '+60 % de Foi produite par les temples.', cost: { food: 100, gold: 150 }, time: 35, icon: 'rites', age: 1 },
  blood: { name: 'Sang divin', desc: 'Créatures : +30 % de PV et +20 % d’attaque.', cost: { gold: 150, foi: 30 }, time: 40, icon: 'blood', age: 2 },
};

const P = {
  zeus: { name: 'Zeus', realm: 'Olympe', people: 'Hellènes', style: 'greek', myth: 'cyclops', powers: ['bolt', 'aegis'], bonus: 'Soldats et créatures : +10 % d’attaque.' },
  odin: { name: 'Odin', realm: 'Asgard', people: 'Nordiques', style: 'norse', myth: 'valkyrie', powers: ['frost', 'einherjar'], bonus: 'Citoyens : +15 % de récolte et +20 % de PV.' },
  ra: { name: 'Râ', realm: 'Héliopolis', people: 'Égyptiens', style: 'egypt', myth: 'phoenix', powers: ['sun', 'blessing'], bonus: 'Temples : +30 % de Foi.' },
};
const PATRONS = ['zeus', 'odin', 'ra'];

const GP = {
  bolt: { name: 'Foudre', desc: 'Six éclairs frappent les ennemis de la zone (70 dégâts chacun).', cost: 50, cd: 40, r: 3, kind: 'hostile', color: '#bfe0ff' },
  aegis: { name: 'Égide', age: 2, desc: 'Vos unités de la zone subissent 60 % de dégâts en moins pendant 15 s.', cost: 35, cd: 45, r: 4, kind: 'friendly', color: '#ffd76a' },
  frost: { name: 'Fimbulvetr', desc: 'Gèle les ennemis de la zone pendant 6 s et leur inflige 25 dégâts.', cost: 55, cd: 50, r: 4, kind: 'hostile', color: '#9fe3ff' },
  einherjar: { name: 'Einherjar', age: 2, desc: 'Quatre guerriers spectraux combattent pour vous pendant 40 s.', cost: 45, cd: 55, r: 1.5, kind: 'summon', color: '#8ff0e0' },
  sun: { name: 'Soleil ardent', desc: 'La zone brûle pendant 8 s : 14 dégâts par seconde aux ennemis, bâtiments compris.', cost: 50, cd: 40, r: 3.5, kind: 'hostile', color: '#ffae42' },
  blessing: { name: 'Bénédiction', age: 2, desc: 'Soigne vos unités de la zone et augmente leur attaque de 30 % pendant 12 s.', cost: 40, cd: 45, r: 5, kind: 'friendly', color: '#c8ff7a' },
};

const DIFF = {
  easy: { name: 'Facile', gather: 0.85, think: 1.2, vill: 18, first: 480, interval: 240, wave: 5, waveGrow: 2, towers: 0, powerMin: 6, barracks: 1, counters: false, armyBase: 6, armyGrow: 4, milStart: 240 },
  normal: { name: 'Normal', gather: 1, think: 0.8, vill: 28, first: 330, interval: 180, wave: 8, waveGrow: 3, towers: 1, powerMin: 4, barracks: 2, counters: true, armyBase: 12, armyGrow: 6, milStart: 120 },
  hard: { name: 'Difficile', gather: 1.2, think: 0.6, vill: 36, first: 240, interval: 140, wave: 10, waveGrow: 4, towers: 2, powerMin: 3, barracks: 2, counters: true, armyBase: 99, armyGrow: 0, milStart: 90 },
};
const MAPS = { small: { name: 'Petite', size: 48 }, medium: { name: 'Moyenne', size: 64 }, large: { name: 'Grande', size: 80 } };
const STATE_TXT = { idle: 'Inactif', move: 'En marche', attack: 'Au combat', gather: 'Récolte', build: 'Construit' };
const RES_ENT_NAME = { gold: 'Mine d’or', berry: 'Buisson de baies' };
