// W4: the wilderness Build catalogue (data only). It describes what the player
// can eventually construct; it creates nothing. Placing, delivering, working
// and the functions of finished buildings are rules in sim/wild-build.ts.
//
// Each definition has a stable id, a category, its materials (the sum of its
// stages' materials), prerequisites (finished buildings, tools carried, and
// whether this milestone implements it), a footprint (whole metres, door on
// the +z side before rotation), placement rules, construction stages (each
// with the materials it needs delivered and the swings of work it takes), the
// tool the work needs, the function after completion, its collision boxes
// and the model references the renderer uses.
//
// Early buildings (W4, implemented): lean-to, campfire, workbench, log store;
// the storage shed is unlocked by the workbench and a hammer. W6 (content v7)
// adds the clay smelter, built from mined clay, sand and gravel, which smelts
// ore with coal into ingots. Later buildings are listed with what they need
// and stay locked: they need iron nails, hinges or hoops (smithed at a forge,
// which is not built yet), cut stone or mortar (no stone cutting or lime yet),
// or a later milestone. The forge itself needs a workshop, and the workshop
// needs iron nails: that chain is not available yet, so both stay locked.

/** Materials and items the catalogue names. The first group exists in W4; the rest arrive later. */
export const MATERIAL_LABEL: Record<string, string> = {
  log: 'log', branch: 'branch', cord: 'cord', fiber: 'plant fibre', stone: 'stone', plank: 'plank', chest: 'wooden chest',
  iron_nails: 'iron nails', cut_stone: 'cut stone', clay: 'clay', mortar: 'mortar', iron_ingot: 'iron ingot', iron_hinge: 'iron hinge', iron_hoop: 'iron hoop',
  sand: 'sand', gravel: 'gravel', coal: 'coal', iron_ore: 'iron ore', copper_ore: 'copper ore', copper_ingot: 'copper ingot',
};
/** Materials that cannot be obtained yet, and why (whatever the world's content). */
export const FUTURE_MATERIALS: Record<string, string> = {
  iron_nails: 'nails are smithed at a forge, which is not built yet', cut_stone: 'stone cutting arrives later', mortar: 'lime and mortar arrive later',
  iron_hinge: 'hinges are smithed at a forge, which is not built yet', iron_hoop: 'hoops are smithed at a forge, which is not built yet',
};
/** W6: materials a world obtains from wilderness content v7 (mining and smelting); before, they are not obtainable. */
export const V7_MATERIALS: readonly string[] = ['clay', 'sand', 'gravel', 'coal', 'iron_ore', 'copper_ore', 'iron_ingot', 'copper_ingot'];
/** Why a material cannot be obtained in a world of this wilderness content (null: it can). */
export function materialUnavailable(k: string, content: number): string | null {
  if (FUTURE_MATERIALS[k]) return FUTURE_MATERIALS[k];
  if (V7_MATERIALS.includes(k) && content < 7) return 'mining arrives with wilderness content v7 (W6)';
  return null;
}

export const BUILD_CATEGORIES = ['shelter', 'fire', 'crafting', 'storage', 'housing', 'industry', 'farm', 'water', 'boundary', 'crossing'] as const;
export type BuildCategory = (typeof BUILD_CATEGORIES)[number];
export const CATEGORY_LABEL: Record<BuildCategory, string> = {
  shelter: 'Shelter', fire: 'Fire', crafting: 'Crafting', storage: 'Storage', housing: 'Housing', industry: 'Industry',
  farm: 'Farm', water: 'Water', boundary: 'Fences and gates', crossing: 'Crossings',
};

/** The tool construction work needs (`hands`: none). */
export type WorkTool = 'hands' | 'stone_axe' | 'hammer';

export interface ConstructionStage {
  id: 'foundation' | 'frame' | 'roof' | 'top' | 'ring' | 'stack';
  label: string;
  /** Materials delivered before this stage's work can start (cumulative with the stages before). */
  materials: Record<string, number>;
  /** Work swings the stage takes. */
  work: number;
}

/** What a finished building does in the simulation. */
export type BuildingFunction =
  | { kind: 'shelter'; respawn: true; summary: string }
  | { kind: 'fire'; fuel: Record<string, number>; cookFuel: number; summary: string }
  | { kind: 'station'; station: 'workbench'; summary: string }
  | { kind: 'storage'; capacity: number; summary: string }
  /** W6: smelts ore with coal into ingots over time (SMELT_RECIPES). */
  | { kind: 'smelter'; summary: string }
  | { kind: 'planned'; summary: string };

/**
 * W6 (content v7): what the clay smelter makes. Inputs (ore and the coal that
 * fuels and reduces it) are taken from the bag's free items when a batch
 * starts; the ingots come out at the smelter's door after `ticks` world ticks
 * (2 s each). One batch at a time.
 */
export interface SmeltRecipe { id: string; label: string; input: Record<string, number>; fuel: string; output: Record<string, number>; ticks: number }
export const SMELT_RECIPES: readonly SmeltRecipe[] = [
  { id: 'iron_ingot', label: 'Iron ingot (bloom)', input: { coal: 2, iron_ore: 2 }, fuel: 'coal', output: { iron_ingot: 1 }, ticks: 45 },
  { id: 'copper_ingot', label: 'Copper ingot', input: { coal: 1, copper_ore: 2 }, fuel: 'coal', output: { copper_ingot: 1 }, ticks: 30 },
];
export const smeltRecipe = (id: string): SmeltRecipe | undefined => SMELT_RECIPES.find((r) => r.id === id);

/** Collision box (metres, footprint-local before rotation: x along w, z along d, door at +z). */
export interface SolidBox { x0: number; z0: number; x1: number; z1: number; h: number }

export interface BuildingDef {
  id: string;
  label: string;
  category: BuildCategory;
  /** Early (W4) or later. */
  tier: 'early' | 'later';
  /** Implemented in this milestone (placeable once the prerequisites exist). */
  implemented: boolean;
  /** W6: the wilderness content a world needs before it can place this (older worlds see it locked until upgraded). */
  minContent?: number;
  /** Milestone a later building is expected with (locked reason). */
  milestone?: string;
  materials: Record<string, number>;
  prerequisites: { buildings: string[]; tools: string[] };
  footprint: { w: number; d: number };
  placement: {
    /** Highest ground step (m) the footprint may span. */
    maxStep: number;
    /** Needs dry ground (a bridge would not). */
    dry: boolean;
    /** Gap (m) kept to other buildings and sites. */
    gap: number;
  };
  stages: ConstructionStage[];
  tool: WorkTool;
  /** Total work swings (sum of the stages). */
  work: number;
  function: BuildingFunction;
  solids: SolidBox[];
  model: { id: string; stages: string[]; asset: string };
  description: string;
}

const sum = (stages: ConstructionStage[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of stages) for (const [k, n] of Object.entries(s.materials)) out[k] = (out[k] ?? 0) + n;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
};

type DefInput = Omit<BuildingDef, 'materials' | 'work' | 'model'> & { model?: Partial<BuildingDef['model']> };
function def(d: DefInput): BuildingDef {
  return {
    ...d, materials: sum(d.stages), work: d.stages.reduce((a, s) => a + s.work, 0),
    model: { id: d.model?.id ?? d.id, stages: d.model?.stages ?? d.stages.map((s) => `${d.id}:${s.id}`), asset: d.model?.asset ?? `render/wild-buildings.ts#${d.id}` },
  };
}
const st = (id: ConstructionStage['id'], label: string, work: number, materials: Record<string, number>): ConstructionStage => ({ id, label, work, materials });
const PLACE = { maxStep: 1, dry: true, gap: 1 } as const;
const later = (summary: string): BuildingFunction => ({ kind: 'planned', summary });

/** The catalogue, in menu order. */
export const BUILD_CATALOGUE: readonly BuildingDef[] = [
  // ---- early (W4) ----
  def({
    id: 'lean_to', label: 'Lean-to shelter', category: 'shelter', tier: 'early', implemented: true,
    prerequisites: { buildings: [], tools: [] }, footprint: { w: 3, d: 2 }, placement: { ...PLACE },
    stages: [
      st('foundation', 'Ground frame', 2, { branch: 2 }),
      st('frame', 'Ridge and posts', 4, { log: 2 }),
      st('roof', 'Branch roof, lashed', 4, { branch: 4, cord: 2 }),
    ],
    tool: 'hands',
    function: { kind: 'shelter', respawn: true, summary: 'A shelter you can claim: your home and respawn point (Home returns here; after drowning you wake here).' },
    solids: [{ x0: 0, z0: 0, x1: 3, z1: 0.45, h: 1.9 }],
    description: 'Two logs as a ridge, branches leaned against it and lashed with cord.',
  }),
  def({
    id: 'campfire', label: 'Campfire', category: 'fire', tier: 'early', implemented: true,
    prerequisites: { buildings: [], tools: [] }, footprint: { w: 2, d: 2 }, placement: { ...PLACE },
    stages: [
      st('ring', 'Stone ring', 2, { stone: 6 }),
      st('stack', 'Kindling stack', 2, { branch: 3 }),
    ],
    tool: 'hands',
    function: { kind: 'fire', fuel: { branch: 30, log: 150 }, cookFuel: 4,
      summary: 'Burns branches (1 min) or logs (5 min) of fuel; while lit it cooks mushrooms (more food).' },
    solids: [],
    description: 'A ring of stones with a stack of kindling.',
  }),
  def({
    id: 'workbench', label: 'Workbench', category: 'crafting', tier: 'early', implemented: true,
    prerequisites: { buildings: [], tools: [] }, footprint: { w: 2, d: 1 }, placement: { ...PLACE },
    stages: [
      st('foundation', 'Stone footings', 2, { stone: 2 }),
      st('frame', 'Log legs', 3, { log: 2 }),
      st('top', 'Split-log top', 3, { log: 1 }),
    ],
    tool: 'stone_axe',
    function: { kind: 'station', station: 'workbench', summary: 'A crafting station: planks from logs, a stone pickaxe, a hammer, a stone knife (for butchering), a wooden chest and (W8) a bow, arrows and blunt arrows (craft within reach).' },
    solids: [{ x0: 0, z0: 0, x1: 2, z1: 1, h: 0.9 }],
    description: 'A heavy split-log bench on stone footings.',
  }),
  def({
    id: 'log_store', label: 'Log store', category: 'storage', tier: 'early', implemented: true,
    prerequisites: { buildings: [], tools: [] }, footprint: { w: 2, d: 2 }, placement: { ...PLACE },
    stages: [
      st('foundation', 'Stone bearers', 1, { stone: 2 }),
      st('frame', 'Log cradle', 3, { log: 2 }),
      st('roof', 'Branch cover', 2, { branch: 4 }),
    ],
    tool: 'stone_axe',
    function: { kind: 'storage', capacity: 120, summary: 'Basic storage: holds 120 weight of items (13 logs); logs put in are delivered.' },
    solids: [{ x0: 0, z0: 0, x1: 2, z1: 1.3, h: 1.3 }],
    description: 'A covered log cradle on stone bearers.',
  }),
  // ---- later: unlocked by the workbench and a hammer ----
  def({
    id: 'storage_shed', label: 'Storage shed', category: 'storage', tier: 'later', implemented: true,
    prerequisites: { buildings: ['workbench'], tools: ['hammer'] }, footprint: { w: 3, d: 3 }, placement: { ...PLACE },
    stages: [
      st('foundation', 'Stone footings', 2, { stone: 4 }),
      st('frame', 'Log frame', 4, { log: 2 }),
      st('roof', 'Plank walls and roof', 6, { plank: 6, chest: 1 }),
    ],
    tool: 'hammer',
    function: { kind: 'storage', capacity: 300, summary: 'A plank shed with a chest: holds 300 weight of items.' },
    solids: [{ x0: 0, z0: 0, x1: 3, z1: 3, h: 2.4 }],
    description: 'A plank shed on stone footings with a chest inside.',
  }),
  // ---- W6 (content v7): the primitive smelter, from mined clay, sand and gravel ----
  def({
    id: 'smelter', label: 'Clay smelter', category: 'industry', tier: 'early', implemented: true, minContent: 7,
    prerequisites: { buildings: [], tools: [] }, footprint: { w: 2, d: 2 }, placement: { ...PLACE },
    stages: [
      st('foundation', 'Stone and gravel hearth', 3, { gravel: 4, stone: 6 }),
      st('frame', 'Clay and sand shaft', 4, { clay: 8, sand: 4 }),
      st('top', 'Clay dome and tuyere', 3, { branch: 2, clay: 2 }),
    ],
    tool: 'hands',
    function: { kind: 'smelter',
      summary: 'Smelts ore with coal: 2 iron ore + 2 coal make 1 iron ingot (90 s); 2 copper ore + 1 coal make 1 copper ingot (60 s). One batch at a time; the ingots come out at its door.' },
    solids: [{ x0: 0.35, z0: 0.35, x1: 1.65, z1: 1.65, h: 1.8 }],
    description: 'A bloomery: a clay and sand shaft on a stone and gravel hearth.',
  }),
  // ---- later (locked: smithed iron parts, cut stone, or later milestones) ----
  def({
    id: 'cabin', label: 'Cabin', category: 'housing', tier: 'later', implemented: false, milestone: 'needs smithed iron nails',
    prerequisites: { buildings: ['workbench'], tools: ['hammer'] }, footprint: { w: 5, d: 4 }, placement: { ...PLACE },
    stages: [st('foundation', 'Stone footing', 6, { stone: 10 }), st('frame', 'Log walls', 12, { log: 16 }), st('roof', 'Plank roof', 8, { plank: 10, iron_nails: 8 })],
    tool: 'hammer', function: later('A one-room log home (later: sleeping, a hearth).'), solids: [{ x0: 0, z0: 0, x1: 5, z1: 4, h: 3 }],
    description: 'A one-room log cabin.',
  }),
  def({
    id: 'timber_house', label: 'Timber house', category: 'housing', tier: 'later', implemented: false, milestone: 'needs smithed iron nails',
    prerequisites: { buildings: ['workshop'], tools: ['hammer'] }, footprint: { w: 6, d: 5 }, placement: { ...PLACE },
    stages: [st('foundation', 'Stone footing', 8, { stone: 12 }), st('frame', 'Timber frame', 14, { log: 10, plank: 12 }), st('roof', 'Plank roof', 10, { plank: 18, iron_nails: 16 })],
    tool: 'hammer', function: later('A framed timber house (later: rooms, storage, a family).'), solids: [{ x0: 0, z0: 0, x1: 6, z1: 5, h: 4 }],
    description: 'A framed house of sawn timber.',
  }),
  def({
    id: 'stone_house', label: 'Stone house', category: 'housing', tier: 'later', implemented: false, milestone: 'needs cut stone, mortar and nails',
    prerequisites: { buildings: ['workshop'], tools: ['stone_pickaxe', 'hammer'] }, footprint: { w: 6, d: 5 }, placement: { ...PLACE },
    stages: [st('foundation', 'Footing', 8, { stone: 16 }), st('frame', 'Stone walls', 20, { cut_stone: 40, mortar: 10 }), st('roof', 'Roof', 10, { plank: 12, iron_nails: 10 })],
    tool: 'hammer', function: later('A lasting stone house; needs much stone (later).'), solids: [{ x0: 0, z0: 0, x1: 6, z1: 5, h: 4 }],
    description: 'Walls of cut stone and mortar.',
  }),
  def({
    id: 'workshop', label: 'Workshop', category: 'crafting', tier: 'later', implemented: false, milestone: 'needs smithed iron nails; nails need a forge, and the forge needs a workshop',
    prerequisites: { buildings: ['workbench'], tools: ['hammer'] }, footprint: { w: 5, d: 4 }, placement: { ...PLACE },
    stages: [st('foundation', 'Footing', 4, { stone: 6 }), st('frame', 'Frame', 8, { log: 8 }), st('roof', 'Walls and roof', 8, { plank: 16, iron_nails: 6 })],
    tool: 'hammer', function: later('A roofed crafting station (later: carpentry, tools).'), solids: [{ x0: 0, z0: 0, x1: 5, z1: 4, h: 3 }],
    description: 'A roofed workshop.',
  }),
  def({
    id: 'forge', label: 'Forge', category: 'industry', tier: 'later', implemented: false, milestone: 'needs a workshop and cut stone',
    prerequisites: { buildings: ['workshop'], tools: ['stone_pickaxe'] }, footprint: { w: 3, d: 3 }, placement: { ...PLACE },
    stages: [st('foundation', 'Hearth base', 6, { cut_stone: 20 }), st('frame', 'Clay hearth', 8, { clay: 10 }), st('top', 'Anvil', 4, { iron_ingot: 2 })],
    tool: 'hammer', function: later('Smithing (nails, hinges, hoops, tools) on an anvil; smelting itself is done in the clay smelter (W6).'), solids: [{ x0: 0, z0: 0, x1: 3, z1: 3, h: 1.6 }],
    description: 'A clay hearth and an anvil.',
  }),
  def({
    id: 'barn', label: 'Barn', category: 'farm', tier: 'later', implemented: false, milestone: 'needs smithed iron nails',
    prerequisites: { buildings: ['workshop'], tools: ['hammer'] }, footprint: { w: 7, d: 5 }, placement: { ...PLACE },
    stages: [st('foundation', 'Footing', 8, { stone: 8 }), st('frame', 'Frame', 14, { log: 12 }), st('roof', 'Plank roof', 12, { plank: 24, iron_nails: 12 })],
    tool: 'hammer', function: later('Stores harvests and shelters animals (later: farming, W7 animals).'), solids: [{ x0: 0, z0: 0, x1: 7, z1: 5, h: 4.5 }],
    description: 'A large plank barn.',
  }),
  def({
    id: 'farm_plot', label: 'Fenced farm plot', category: 'farm', tier: 'later', implemented: false, milestone: 'farming',
    prerequisites: { buildings: ['workbench'], tools: ['hammer'] }, footprint: { w: 4, d: 4 }, placement: { ...PLACE },
    stages: [st('foundation', 'Dug beds', 4, { branch: 4 }), st('frame', 'Edging', 4, { plank: 4, iron_nails: 2 })],
    tool: 'hands', function: later('Grows crops (later: seeds and farming).'), solids: [],
    description: 'Raised beds with plank edging.',
  }),
  def({
    id: 'water_well', label: 'Well', category: 'water', tier: 'later', implemented: false, milestone: 'needs cut stone',
    prerequisites: { buildings: [], tools: ['stone_pickaxe'] }, footprint: { w: 2, d: 2 }, placement: { ...PLACE },
    stages: [st('foundation', 'Shaft', 10, { stone: 8 }), st('frame', 'Lining', 8, { cut_stone: 16 }), st('roof', 'Winch', 4, { log: 2, cord: 4 })],
    tool: 'hammer', function: later('Fresh water (later: thirst and cooking).'), solids: [{ x0: 0, z0: 0, x1: 2, z1: 2, h: 1 }],
    description: 'A stone-lined well with a winch.',
  }),
  def({
    id: 'rain_barrel', label: 'Water barrel', category: 'water', tier: 'later', implemented: false, milestone: 'needs smithed iron hoops',
    prerequisites: { buildings: ['workbench'], tools: ['hammer'] }, footprint: { w: 1, d: 1 }, placement: { ...PLACE },
    stages: [st('frame', 'Staves', 4, { plank: 6 }), st('top', 'Hoops', 2, { iron_hoop: 2 })],
    tool: 'hammer', function: later('Stores water (later).'), solids: [{ x0: 0, z0: 0, x1: 1, z1: 1, h: 1 }],
    description: 'A hooped plank barrel.',
  }),
  def({
    id: 'fence', label: 'Fence', category: 'boundary', tier: 'later', implemented: false, milestone: 'needs smithed iron nails',
    prerequisites: { buildings: ['workbench'], tools: ['hammer'] }, footprint: { w: 4, d: 1 }, placement: { ...PLACE },
    stages: [st('frame', 'Posts and rails', 3, { log: 1, plank: 2, iron_nails: 2 })],
    tool: 'hammer', function: later('Blocks animals (W5 navigation, W7 animals).'), solids: [{ x0: 0, z0: 0.4, x1: 4, z1: 0.6, h: 1.1 }],
    description: 'A post-and-rail fence section.',
  }),
  def({
    id: 'gate', label: 'Gate', category: 'boundary', tier: 'later', implemented: false, milestone: 'needs smithed iron hinges',
    prerequisites: { buildings: ['workbench'], tools: ['hammer'] }, footprint: { w: 2, d: 1 }, placement: { ...PLACE },
    stages: [st('frame', 'Gate leaf', 3, { plank: 3, iron_hinge: 2 })],
    tool: 'hammer', function: later('Opens and closes a fence (W5).'), solids: [],
    description: 'A hinged plank gate.',
  }),
  def({
    id: 'bridge', label: 'Bridge', category: 'crossing', tier: 'later', implemented: false, milestone: 'needs a workshop and iron nails',
    prerequisites: { buildings: ['workshop'], tools: ['hammer'] }, footprint: { w: 3, d: 8 }, placement: { maxStep: 4, dry: false, gap: 1 },
    stages: [st('foundation', 'Piers', 8, { log: 8 }), st('frame', 'Deck', 10, { plank: 12, iron_nails: 8 })],
    tool: 'hammer', function: later('Crosses a stream (W5 world routes).'), solids: [],
    description: 'A log-pier plank bridge over a stream.',
  }),
];

export const buildingDef = (id: string): BuildingDef | undefined => BUILD_CATALOGUE.find((d) => d.id === id);
export const BUILDING_IDS: readonly string[] = BUILD_CATALOGUE.map((d) => d.id);
export const isBuildingId = (v: unknown): v is string => typeof v === 'string' && BUILDING_IDS.includes(v);
