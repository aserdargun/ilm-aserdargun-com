import type { RegionId, ToolMode } from '../types/catalog';
import type { LocalizedText } from '../types/catalog';
import type { Vec3 } from '../systems/types';

/**
 * Stage definitions.
 *
 * Thirty-three applications are expressed through twenty-eight stages built on
 * six reusable systems. Some applications deliberately share a stage — they are
 * one idea seen from two directions — but every application still has its own
 * observable effect on the world.
 */

export type StageSystem =
  | 'connection'
  | 'placement'
  | 'allocation'
  | 'perception'
  | 'evidence'
  | 'prediction';

/** Serializable player interaction state for any stage. */
export interface StageRuntimeState {
  /** slot id -> placed item ids, shared by connection/placement/allocation. */
  assignments: Record<string, string[]>;
  /** Item currently held, if any. */
  held: string | null;
  /** perception stages */
  lens?: string;
  observations?: number;
  /** evidence stages */
  packed?: string[];
  corrected?: string[];
  /** prediction / decision stages */
  chosen?: string | null;
  approved?: boolean;
  /** whether the player committed this stage's action */
  committed?: boolean;
}

export function emptyStageState(): StageRuntimeState {
  return { assignments: {}, held: null };
}

export interface StageItem {
  id: string;
  /** Kind drives compatibility (connection), lane matching (allocation) and
   *  requirement symbols (placement). */
  kind: string;
  label: LocalizedText;
  /** Where the item starts. For grab puzzles this is its origin slot. */
  at: string;
  /** In-world position of the object the player can walk up to. */
  position: Vec3;
}

export interface StageSlot {
  id: string;
  /** Slot kind constrains what may be placed here. */
  accepts: string;
  label: LocalizedText;
  position: Vec3;
}

export interface StageDefinition {
  id: string;
  region: RegionId;
  system: StageSystem;
  /** Application codes represented by this stage. */
  appCodes: string[];
  /** Tool the player needs to work this stage. */
  requiredTool: ToolMode;
  title: LocalizedText;
  objective: LocalizedText;
  /** Short contextual prompt shown when the player approaches. */
  prompt: LocalizedText;
  items?: StageItem[];
  slots?: StageSlot[];
  /** Local offset from the region anchor where the console stands. */
  offset: [number, number, number];
  /** Dialogue line from Spark when the stage opens. */
  sparkLine: LocalizedText;
  /** Systems-specific payload, read by the stage's evaluator. */
  data?: Record<string, unknown>;
}

const t = (tr: string, en: string): LocalizedText => ({ tr, en });
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const STAGES: StageDefinition[] = [
  // ===== Region 0 — hub / opening =====================================
  {
    id: 'r0-opening',
    region: 'hub',
    system: 'connection',
    appCodes: [],
    requiredTool: 'connect',
    title: t('Kırık Kanal', 'The Broken Channel'),
    objective: t(
      'Karanlık kanalı ışığa bağla.',
      'Reconnect the dark channel to the light.',
    ),
    prompt: t('Bağlamak için iki ucu seç', 'Choose both ends to link them'),
    offset: [0, 0, 11],
    sparkLine: t(
      'Bak, su bir yere gidiyor ama buraya gelmiyor.',
      'Look — the water is going somewhere, but it is not coming here.',
    ),
    items: [
      {
        id: 'src',
        kind: 'resource',
        label: t('Kaynak kanal', 'Source channel'),
        at: 'src',
        position: v(2, 1.2, -2),
      },
      {
        id: 'dst',
        kind: 'resource',
        label: t('Karanlık kanal', 'Dark channel'),
        at: 'dst',
        position: v(-2, 1.2, 2),
      },
    ],
    slots: [
      {
        id: 'src',
        accepts: 'resource',
        label: t('Kaynak', 'Source'),
        position: v(2, 0, -2),
      },
      {
        id: 'dst',
        accepts: 'resource',
        label: t('Karanlık kanal', 'Dark channel'),
        position: v(-2, 0, 2),
      },
    ],
    data: {
      links: [['src', 'dst']],
      kind: 'resource',
      unlockRegion: 'cartographers-terrace',
    },
  },

  // ===== Region I — Cartographer's Terrace ============================
  {
    id: 'r1-scout-match',
    region: 'cartographers-terrace',
    system: 'connection',
    appCodes: ['AIA'],
    requiredTool: 'connect',
    title: t('Keşifçiler', 'The Scouts'),
    objective: t(
      'Her keşifçiyi onun taşıyabildiği hatta bağla.',
      'Match each scout to the kind of line it can power.',
    ),
    prompt: t('Bir keşifçi seç, sonra bir hat seç', 'Pick a scout, then a line'),
    offset: [-14, 0, 6],
    sparkLine: t(
      'Üçü de farklı iş yapıyor. Yanlış hatta bağlarsan hiçbir şey olmaz.',
      'All three do different work. Wire one to the wrong line and nothing happens.',
    ),
    data: {
      scouts: [
        { id: 's-stone', kind: 'energy' },
        { id: 's-voice', kind: 'information' },
        { id: 's-water', kind: 'resource' },
      ],
      routes: [
        { id: 'r-lift', accepts: 'energy' },
        { id: 'r-signal', accepts: 'information' },
        { id: 'r-canal', accepts: 'resource' },
      ],
      solution: [
        ['s-stone', 'r-lift'],
        ['s-voice', 'r-signal'],
        ['s-water', 'r-canal'],
      ],
    },
  },
  {
    id: 'r1-equivalent-bridges',
    region: 'cartographers-terrace',
    system: 'placement',
    appCodes: ['POL'],
    requiredTool: 'reveal',
    title: t('Aynı Köprü, İki Anlatım', 'One Bridge, Two Tellings'),
    objective: t(
      'Aynı davranışı iki farklı sırayla kur.',
      'Build the same behaviour in two different orders.',
    ),
    prompt: t('Taşları sırayla diz', 'Set the stones in order'),
    offset: [12, 0, 10],
    sparkLine: t(
      'Anlatım değişiyor ama yaptığı iş değişmiyor.',
      'The telling changes. The work does not.',
    ),
    data: {
      steps: [
        { id: 'st-1', effect: 'bed', requires: [] },
        { id: 'st-2', effect: 'arch', requires: ['bed'] },
        { id: 'st-3', effect: 'deck', requires: ['arch'] },
      ],
      variants: ['bed>arch>deck', 'bed>arch>deck'],
      goalSignature: 'bed>arch>deck',
    },
  },

  // ===== Region II — Flow Foundry =====================================
  {
    id: 'r2-loom-distribution',
    region: 'flow-foundry',
    system: 'allocation',
    appCodes: ['GPU', 'GEX'],
    requiredTool: 'connect',
    title: t('Çok Kollu Tezgâh', 'The Many-Armed Loom'),
    objective: t(
      'İşi kol kapasitelerine göre dağıt; sapmaya izin verme.',
      'Spread the work across arm capacities without letting them diverge.',
    ),
    prompt: t('Bir işi bir kola ata', 'Assign a job to an arm'),
    offset: [-16, 0, -10],
    sparkLine: t(
      'Dört kol da eşit değil. Daha çok işi daha geniş kola koy.',
      'The arms are not equal. Give more work to the wider arm.',
    ),
    data: {
      lanes: [
        { id: 'arm-1', kind: 'energy', capacity: 2, latency: 1, costPerUnit: 1 },
        { id: 'arm-2', kind: 'energy', capacity: 3, latency: 1, costPerUnit: 1 },
        { id: 'arm-3', kind: 'energy', capacity: 1, latency: 2, costPerUnit: 1 },
      ],
      work: [
        { id: 'warp-a', kind: 'energy', size: 2, tolerance: 8 },
        { id: 'warp-b', kind: 'energy', size: 2, tolerance: 8 },
        { id: 'warp-c', kind: 'energy', size: 1, tolerance: 8 },
        { id: 'warp-d', kind: 'energy', size: 1, tolerance: 8 },
      ],
      // GEX: a synchronised weave also needs every arm used at least once.
      requireEveryLaneUsed: true,
    },
  },
  {
    id: 'r2-chamber-routing',
    region: 'flow-foundry',
    system: 'allocation',
    appCodes: ['LLM'],
    requiredTool: 'connect',
    title: t('İşleme Odaları', 'The Processing Chambers'),
    objective: t(
      'Gelen talepleri kapasitelerine göre odalara dağıt.',
      'Route incoming requests to the chambers that can hold them.',
    ),
    prompt: t('Bir talebi bir odaya yönlendir', 'Route a request to a chamber'),
    offset: [4, 0, -18],
    sparkLine: t(
      'Küçük bir isteği büyük bir odaya göndermek yardım etmiyor.',
      'Sending a small request to a huge chamber does not help.',
    ),
    data: {
      lanes: [
        { id: 'hall-a', kind: 'information', capacity: 3, latency: 1, costPerUnit: 1 },
        { id: 'hall-b', kind: 'information', capacity: 1, latency: 1, costPerUnit: 1 },
      ],
      work: [
        { id: 'req-1', kind: 'information', size: 1, tolerance: 5 },
        { id: 'req-2', kind: 'information', size: 1, tolerance: 5 },
        { id: 'req-3', kind: 'information', size: 2, tolerance: 5 },
      ],
    },
  },
  {
    id: 'r2-caravan-schedule',
    region: 'flow-foundry',
    system: 'placement',
    appCodes: ['TFL'],
    requiredTool: 'preview',
    title: t('Işıklı Karavanlar', 'The Luminous Caravans'),
    objective: t(
      'Dar geçitten geçirmek için karavanları doğru sıraya koy.',
      'Order the caravans so they clear the narrow channel.',
    ),
    prompt: t('Karavan sırasını değiştir', 'Reorder the caravans'),
    offset: [18, 0, 4],
    sparkLine: t(
      'Önce en ağırı geçir. Kapı bir kez daha açılmasın.',
      'Send the heaviest first, so the gate opens once.',
    ),
    data: {
      steps: [
        { id: 'cv-1', effect: 'prefill', requires: [] },
        { id: 'cv-2', effect: 'reserve', requires: ['prefill'] },
        { id: 'cv-3', effect: 'decode', requires: ['reserve'] },
        { id: 'cv-4', effect: 'deliver', requires: ['decode'] },
      ],
      goalSignature: 'prefill>reserve>decode>deliver',
    },
  },

  // ===== Region III — City of Memory and Council ======================
  {
    id: 'r3-task-sequence',
    region: 'memory-council-city',
    system: 'placement',
    appCodes: ['HNS', 'ARL'],
    requiredTool: 'connect',
    title: t('Çalışma Sırası', 'The Work Sequence'),
    objective: t(
      'Duran adımı bul ve diziyi düzelt.',
      'Find the step that stalled and repair the sequence.',
    ),
    prompt: t('Çalışma tezgâhını düzenle', 'Rearrange the workbench'),
    offset: [-20, 0, 4],
    sparkLine: t(
      'Durduğu yer bana nerede olduğunu söylüyor.',
      'Where it stopped tells me where it was.',
    ),
    data: {
      steps: [
        { id: 'wk-1', effect: 'opened', requires: [] },
        { id: 'wk-2', effect: 'gathered', requires: ['opened'] },
        { id: 'wk-3', effect: 'called', requires: ['gathered'] },
        { id: 'wk-4', effect: 'checked', requires: ['called'] },
      ],
      goalSignature: 'opened>gathered>called>checked',
    },
  },
  {
    id: 'r3-junction-choice',
    region: 'memory-council-city',
    system: 'prediction',
    appCodes: ['DPL', 'CUL'],
    requiredTool: 'decide',
    title: t('Değişen Kavşak', 'The Changing Junction'),
    objective: t(
      'İleri git, kanıt iste, bekle ya da dur — sonra gerçekten olanı denetle.',
      'Proceed, request evidence, wait or stop — then verify what actually moved.',
    ),
    prompt: t('Bir karar seç ve sonucunu denetle', 'Choose a decision and verify the outcome'),
    offset: [-4, 0, 18],
    sparkLine: t(
      'Acele etmek bazen doğru cevap, bazen de yalnızca hızlı bir cevap.',
      'Hurrying is sometimes the right answer and sometimes just a fast one.',
    ),
    data: {
      options: [
        { id: 'proceed', outcome: 40 },
        { id: 'evidence', outcome: 70 },
        { id: 'wait', outcome: 85 },
        { id: 'stop', outcome: 30 },
      ],
      correct: 'wait',
      // CUL: the player must confirm the mechanism they intended is the one
      // that responded, not merely that the action ran.
      verifyTarget: 'gate',
      decoyTarget: 'lamp',
    },
  },
  {
    id: 'r3-worker-supervision',
    region: 'memory-council-city',
    system: 'evidence',
    appCodes: ['AOS'],
    requiredTool: 'decide',
    title: t('Gözetim Masası', 'The Supervision Desk'),
    objective: t(
      'Çalışanı incele, duraklat, görevini değiştir, sonra bilinçli olarak sürdür.',
      'Inspect the worker, pause it, retask it, then resume it deliberately.',
    ),
    prompt: t('Duraklat, görev değiştir, sürdür', 'Pause, retask, resume'),
    offset: [12, 0, 14],
    sparkLine: t(
      'Bir şeyi durdurmak, onu anlamak değil. Ama bazen gereklidir.',
      'Stopping something is not the same as understanding it. Sometimes it is needed anyway.',
    ),
    data: {
      requiredStates: ['paused', 'retasked', 'resumed'],
    },
  },
  {
    id: 'r3-council-chamber',
    region: 'memory-council-city',
    system: 'evidence',
    appCodes: ['AGR'],
    requiredTool: 'decide',
    title: t('Meclis Odası', 'The Council Chamber'),
    objective: t(
      'Gerekçeleri karşılaştır; çoğunluğun paylaştığı yanlış varsayımı bul.',
      'Compare the reasons and find the assumption the majority shares wrongly.',
    ),
    prompt: t('Koltuğun gerekçesini oku', 'Read what each seat is assuming'),
    offset: [24, 0, -6],
    sparkLine: t(
      'Herkes aynı şeyi söylüyor. Aynı şeyi doğru da söylüyor olabilirler.',
      'Everyone is saying the same thing. That does not make it true.',
    ),
    data: {
      seats: [
        { id: 'seat-1', vote: 'proceed', assumes: 'giriş-açık' },
        { id: 'seat-2', vote: 'proceed', assumes: 'giriş-açık' },
        { id: 'seat-3', vote: 'proceed', assumes: 'giriş-açık' },
        { id: 'seat-4', vote: 'abstain', assumes: 'giriş-açık' },
      ],
      contradicted: ['giriş-açık'],
    },
  },
  {
    id: 'r3-context-lantern',
    region: 'memory-council-city',
    system: 'evidence',
    appCodes: ['CTX', 'MEM'],
    requiredTool: 'decide',
    title: t('Kanıt Feneri', 'The Evidence Lantern'),
    objective: t(
      'Yararlı kanıtı fenerine koy, eski kaydı düzelt.',
      'Pack the useful evidence and correct the outdated record.',
    ),
    prompt: t('Kaydı fenerine koy ya da düzelt', 'Pack the record or correct it'),
    offset: [6, 0, 26],
    sparkLine: t(
      'Bu kayıt eskiydi. Eskiden doğruydu.',
      'This record is old. It used to be true.',
    ),
    data: {
      capacity: 3,
      requiredTags: ['pump', 'route'],
      records: [
        { id: 'k1', fresh: true, correct: true, tags: ['pump'] },
        { id: 'k2', fresh: true, correct: true, tags: ['route'] },
        { id: 'k3', fresh: false, correct: true, tags: ['route', 'old'] },
        { id: 'k4', fresh: true, correct: false, tags: ['rumour'] },
        { id: 'k5', fresh: true, correct: true, tags: ['noise'] },
      ],
      // MEM: k3 must be corrected before it counts as clean.
      correctable: ['k3'],
    },
  },
  {
    id: 'r3-permission-seals',
    region: 'memory-council-city',
    system: 'connection',
    appCodes: ['SEC', 'EVL'],
    requiredTool: 'decide',
    title: t('Mühürler', 'The Seals'),
    objective: t(
      'Mühürleri doğru mekanizmalara dağıt, sonra birkaç koşulda sına.',
      'Place the seals on the right mechanisms, then test under several conditions.',
    ),
    prompt: t('Bir mührü bir mekanizmaya tak', 'Attach a seal to a mechanism'),
    offset: [-14, 0, -16],
    sparkLine: t(
      'Bir arşiv mesajı, komut olmak için yazılmamıştı.',
      'An archive message was never written to become a command.',
    ),
    data: {
      seals: [
        { id: 'seal-read', kind: 'information' },
        { id: 'seal-valve', kind: 'energy' },
        { id: 'seal-flow', kind: 'resource' },
      ],
      targets: [
        { id: 'archive', accepts: 'information' },
        { id: 'pump', accepts: 'energy' },
        { id: 'canal', accepts: 'resource' },
        { id: 'trap', accepts: 'none' },
      ],
      // EVL: the repair must hold across all three trials.
      trials: 3,
    },
  },

  // ===== Region IV — Adaptation Workshop and Cloud Harbor =============
  {
    id: 'r4-example-patterns',
    region: 'adaptation-cloud-harbor',
    system: 'allocation',
    appCodes: ['USL'],
    requiredTool: 'connect',
    title: t('Örnek Seçimi', 'Choosing the Examples'),
    objective: t(
      'Yardımcıya çeşitli örnekler ver, benzer olmayan işte dene.',
      'Give the helper varied examples, then test it on an unfamiliar job.',
    ),
    prompt: t('Bir örneği yuvaya koy', 'Place an example in the cradle'),
    offset: [-14, 0, 12],
    sparkLine: t(
      'Hepsi aynı şeyi göstermiş. Hiçbiri yeni bir şey öğretmemiş.',
      'It only ever showed the same thing. It never learned anything new.',
    ),
    data: {
      lanes: [
        { id: 'cradle', kind: 'information', capacity: 3, latency: 1, costPerUnit: 1 },
      ],
      work: [
        { id: 'ex-narrow-a', kind: 'information', size: 1, tolerance: 9 },
        { id: 'ex-narrow-b', kind: 'information', size: 1, tolerance: 9 },
        { id: 'ex-broad', kind: 'information', size: 1, tolerance: 9 },
      ],
      requireEveryLaneUsed: false,
    },
  },
  {
    id: 'r4-module-fit',
    region: 'adaptation-cloud-harbor',
    system: 'allocation',
    appCodes: ['ADP'],
    requiredTool: 'connect',
    title: t('Uyarlama Modülleri', 'The Adaptation Modules'),
    objective: t(
      'Esneklik ile maliyet arasında bir denge kur.',
      'Balance flexibility against cost when choosing a module.',
    ),
    prompt: t('Bir işi bir moda ata', 'Assign a job to a module'),
    offset: [10, 0, 16],
    sparkLine: t(
      'En pahalı modül her iş için doğru değildir.',
      'The most expensive module is not the right answer every time.',
    ),
    data: {
      lanes: [
        { id: 'mod-light', kind: 'energy', capacity: 2, latency: 3, costPerUnit: 1 },
        { id: 'mod-heavy', kind: 'energy', capacity: 1, latency: 1, costPerUnit: 4 },
      ],
      work: [
        { id: 'job-gentle', kind: 'energy', size: 1, tolerance: 6 },
        { id: 'job-heavy', kind: 'energy', size: 2, tolerance: 6 },
      ],
    },
  },
  {
    id: 'r4-route-choice',
    region: 'adaptation-cloud-harbor',
    system: 'allocation',
    appCodes: ['LCL', 'CLD', 'DCL'],
    requiredTool: 'preview',
    title: t('Yer mi, Uzak mı?', 'Local, Distant, or Both'),
    objective: t(
      'Her işi kısıtına göre bir rotaya oturt.',
      'Route each workload according to its own constraints.',
    ),
    prompt: t('Her yükü bir limite uygun rotaya koy', 'Place each payload on a route that can hold it'),
    offset: [-6, 0, -14],
    sparkLine: t(
      'Her şeyi göğe göndermek her şeyi çözmüyor.',
      'Sending everything to the sky does not solve everything.',
    ),
    data: {
      // Local compute is cheap and immediate but small; the sky workshops are
      // roomy but pay a transport delay. There is no free choice here.
      lanes: [
        { id: 'lane-local', kind: 'information', capacity: 2, latency: 1, costPerUnit: 1 },
        { id: 'lane-sky', kind: 'information', capacity: 2, latency: 4, costPerUnit: 3 },
        { id: 'lane-mixed', kind: 'information', capacity: 1, latency: 2, costPerUnit: 2 },
      ],
      work: [
        { id: 'job-private', kind: 'information', size: 1, tolerance: 3 },
        { id: 'job-small', kind: 'information', size: 1, tolerance: 8 },
        { id: 'job-bulk', kind: 'information', size: 2, tolerance: 8 },
      ],
      requireEveryLaneUsed: true,
    },
  },

  // ===== Region V — Collective Gardens =================================
  {
    id: 'r5-trail-routing',
    region: 'collective-gardens',
    system: 'allocation',
    appCodes: ['SWI', 'ANT'],
    requiredTool: 'connect',
    title: t('Koku İzleri', 'The Scent Trails'),
    objective: t(
      'Yerel kuralları değiştir, izleri kur, sonra yolu kapat ve yeniden kur.',
      'Change the local rule, lay a trail, then block the route and lay a new one.',
    ),
    prompt: t('Karıncayı bir taraça yönlendir', 'Guide an ant to a terrace'),
    offset: [-16, 0, -8],
    sparkLine: t(
      'Eski yol hâlâ en güçlü izi taşıyor. Ama artık oradan geçemezler.',
      'The old route still carries the strongest scent. They cannot use it any more.',
    ),
    data: {
      lanes: [
        { id: 'terrace-a', kind: 'resource', capacity: 2, latency: 1, costPerUnit: 1 },
        { id: 'terrace-b', kind: 'resource', capacity: 2, latency: 1, costPerUnit: 1 },
      ],
      work: [
        { id: 'load-1', kind: 'resource', size: 1, tolerance: 8 },
        { id: 'load-2', kind: 'resource', size: 1, tolerance: 8 },
      ],
      // SWI: the colony adapts when the established route is cut.
      reseed: true,
    },
  },
  {
    id: 'r5-dance-floor',
    region: 'collective-gardens',
    system: 'allocation',
    appCodes: ['BEE'],
    requiredTool: 'connect',
    title: t('Dans Alanı', 'The Dance Floor'),
    objective: t(
      'Paylaşımı aç ve kapat; toplanan kaynağı karşılaştır.',
      'Turn sharing on and off and compare what the colony gathers.',
    ),
    prompt: t('Dans alanını aç ya da kapat', 'Open or close the dance floor'),
    offset: [14, 0, -12],
    sparkLine: t(
      'Dans eden bir arı, diğerlerinin bulduğunu da bulmuş oluyor.',
      'One dancing bee hands the others what it found.',
    ),
    data: {
      lanes: [
        { id: 'floor-open', kind: 'resource', capacity: 3, latency: 2, costPerUnit: 1 },
        { id: 'floor-shut', kind: 'resource', capacity: 3, latency: 0, costPerUnit: 1 },
      ],
      work: [
        { id: 'nectar-1', kind: 'resource', size: 2, tolerance: 6 },
        { id: 'nectar-2', kind: 'resource', size: 2, tolerance: 6 },
      ],
      // Opening the floor costs a short delay but beats solo discovery.
      prefersShared: true,
    },
  },

  // ===== Region VI — Observer's Mirrors ================================
  {
    id: 'r6-lens-layers',
    region: 'observers-mirrors',
    system: 'perception',
    appCodes: ['VIS', 'CVL'],
    requiredTool: 'reveal',
    title: t('Mercek Katmanları', 'The Lens Layers'),
    objective: t(
      'Aynı sahneyi kenar, derinlik ve hareket mercekleriyle incele.',
      'Read the same scene through edge, depth and motion lenses.',
    ),
    prompt: t('Bir mercek seç ve gözlemle', 'Choose a lens and observe'),
    offset: [-12, 0, -14],
    sparkLine: t(
      'Bir mercek her şeyi göstermez. Hiçbiri göstermez.',
      'No lens shows everything. None of them show nothing.',
    ),
    data: {
      gridWidth: 4,
      gridHeight: 4,
      budget: 16,
      reliableLight: 0.4,
      // CVL: the answer key is known, so misreads are detectable.
      hasAnswerKey: true,
    },
  },
  {
    id: 'r6-passage-model',
    region: 'observers-mirrors',
    system: 'prediction',
    appCodes: ['WFM'],
    requiredTool: 'preview',
    title: t('Geçidin Modeli', 'A Model of the Passage'),
    objective: t(
      'Gördüğünle tahmin et, görmediğin yeri işaretle.',
      'Predict from what you saw and mark what you did not.',
    ),
    prompt: t('Bir hücreyi işaretle', 'Mark a cell'),
    offset: [8, 0, -16],
    sparkLine: t(
      'Görmediğim yerleri tahmin ettim. Modelim onları biliyormuş gibi.',
      'I predicted the parts I never saw. My model acted as if it knew.',
    ),
    data: { gridWidth: 4, gridHeight: 4, markAssumed: true },
  },
  {
    id: 'r6-counterfactual',
    region: 'observers-mirrors',
    system: 'prediction',
    appCodes: ['WML'],
    requiredTool: 'preview',
    title: t('İki Yol', 'Two Paths'),
    objective: t(
      'Aynı başlangıçtan iki eylemi önizle, birini dene, sonucu tahminle karşılaştır.',
      'Preview two actions from one start, try one, compare it with the preview.',
    ),
    prompt: t('Bir dalı önizle ve birini dene', 'Preview a branch and try one'),
    offset: [20, 0, 4],
    sparkLine: t(
      'Önizleme yanılabilir. Asıl olan, ne kadar yanıldığını bilmek.',
      'A preview can be wrong. Knowing how wrong matters more.',
    ),
    data: {
      branches: [
        { id: 'left', label: 'sol', predicted: 60 },
        { id: 'right', label: 'sağ', predicted: 90 },
      ],
      actual: 90,
    },
  },

  // ===== Region VII — Valley of Living Machines ========================
  {
    id: 'r7-water-model',
    region: 'valley-living-machines',
    system: 'prediction',
    appCodes: ['ITL'],
    requiredTool: 'preview',
    title: t('Vadinin Suyu', "The Valley's Water"),
    objective: t(
      'Suyun küçük bir modelini kur; gözlemi varsayımdan ayır.',
      'Build a small model of the water and separate observation from assumption.',
    ),
    prompt: t('Modelindeki bir hücreyi doğrula', 'Validate a cell in your model'),
    offset: [-18, 0, 2],
    sparkLine: t(
      'Modelim gördüğümden çok daha emin.',
      'My model is far more certain than I am.',
    ),
    data: { gridWidth: 3, gridHeight: 3, markAssumed: true },
  },
  {
    id: 'r7-pump-diagnosis',
    region: 'valley-living-machines',
    system: 'prediction',
    appCodes: ['PDT'],
    requiredTool: 'decide',
    title: t('Pompa Teşhisi', 'The Pump Diagnosis'),
    objective: t(
      'Sensörleri yerleştir, adayları daralt, sonra gerçek arızayı söyle.',
      'Place sensors, narrow the candidates, then name the real fault.',
    ),
    prompt: t('Bir sensör yerleştir', 'Place a sensor'),
    offset: [-2, 0, 16],
    sparkLine: t(
      'En gürültülü sinyal her zaman arıza değildir.',
      'The loudest signal is not always the fault.',
    ),
    data: {
      sensors: 3,
      trueFault: 'blocked-inlet',
    },
  },
  {
    id: 'r7-two-options',
    region: 'valley-living-machines',
    system: 'prediction',
    appCodes: ['DTR'],
    requiredTool: 'decide',
    title: t('İki Pompalama Seçeneği', 'Two Pumping Options'),
    objective: t(
      'Modelde iki seçeneği karşılaştır, birini onayla, farkı ölç.',
      'Compare two options in the model, approve one, measure the difference.',
    ),
    prompt: t('Bir seçeneği onayla', 'Approve one option'),
    offset: [12, 0, 18],
    sparkLine: t(
      'Tahmin ettim, sonra gerçeği gördüm. Aradaki farkı saklamıyorum.',
      'I predicted, then I saw. I am not hiding the difference.',
    ),
    data: {
      options: [
        { id: 'steady', label: 'kararlı', predicted: 70 },
        { id: 'surge', label: 'ani', predicted: 95 },
      ],
      actual: 88,
    },
  },
  {
    id: 'r7-helper-design',
    region: 'valley-living-machines',
    system: 'placement',
    appCodes: ['ENG', 'HEX'],
    requiredTool: 'connect',
    title: t('Yardımcı Tasarımı', 'Designing the Helper'),
    objective: t(
      'Algıyı, enerjiyi ve kararı birleştir; eklemlerini ulaşamadığın bağlantıya ayarla.',
      'Combine perception, energy and decision; tune the joints to reach the connection.',
    ),
    prompt: t('Eklem sırasını ayarla', 'Set the joint sequence'),
    offset: [-8, 0, -18],
    sparkLine: t(
      'Ulaşamıyor çünkü kolu yanlış yere bükülmüş.',
      'It cannot reach, because the arm is bent the wrong way.',
    ),
    data: {
      steps: [
        { id: 'jt-sense', effect: 'sense', requires: [] },
        { id: 'jt-power', effect: 'power', requires: ['sense'] },
        { id: 'jt-decide', effect: 'decide', requires: ['sense'] },
        { id: 'jt-reach', effect: 'reach', requires: ['power', 'decide'] },
      ],
      goalSignature: 'sense>power>decide>reach',
    },
  },

  // ===== Cross-region puzzles =========================================
  {
    id: 'cross-x1',
    region: 'hub',
    system: 'allocation',
    appCodes: ['VIS', 'ANT', 'PDT'],
    requiredTool: 'reveal',
    title: t('Sızıntıdan Pompa', 'From Leak to Pump'),
    objective: t(
      'Sızıntıyı görünür kıl, malzemeyi dar yoldan taşı, pompayı onar.',
      'Reveal the leak, carry the material through the narrow way, restore the pump.',
    ),
    prompt: t('Sızıntıyı ortaya çıkar', 'Reveal the leak'),
    offset: [-22, 0, 18],
    sparkLine: t(
      'Üç ayrı bölge, tek bir arıza.',
      'Three regions, one fault.',
    ),
    data: {
      lanes: [
        { id: 'narrow', kind: 'resource', capacity: 2, latency: 1, costPerUnit: 1 },
      ],
      work: [
        { id: 'seal-part', kind: 'resource', size: 1, tolerance: 6 },
        { id: 'seal-part-2', kind: 'resource', size: 1, tolerance: 6 },
      ],
      requiresRevealFirst: true,
    },
  },
  {
    id: 'cross-x2',
    region: 'hub',
    system: 'prediction',
    appCodes: ['MEM', 'WML', 'DPL'],
    requiredTool: 'decide',
    title: t('Eski Kayıt', 'The Outdated Record'),
    objective: t(
      'Bayat bilgiyi yakala, iki seçeneği karşılaştır, kanıt gelene kadar bekle.',
      'Catch the stale record, compare the alternatives, wait for the evidence.',
    ),
    prompt: t('Kaydın tazeliğini denetle', 'Audit the record for freshness'),
    offset: [18, 0, 20],
    sparkLine: t(
      'Bu kayıt dünyadan önce yazılmış.',
      'This record was written before the world changed.',
    ),
    data: {
      branches: [
        { id: 'act-now', label: 'şimdi', predicted: 40 },
        { id: 'act-wait', label: 'bekle', predicted: 90 },
      ],
      actual: 90,
      correct: 'act-wait',
      requiresFreshnessCheck: true,
    },
  },
  {
    id: 'cross-x3',
    region: 'hub',
    system: 'placement',
    appCodes: ['TFL', 'DCL', 'HEX'],
    requiredTool: 'preview',
    title: t('Zamanında Sinyal', 'The Timely Signal'),
    objective: t(
      'Akışı iyileştir, işi doğru yere koy, sinyalin zamanında ulaşmasını sağla.',
      'Improve the flow, place the work, and get the signal there on time.',
    ),
    prompt: t('Sıralamayı tamamla', 'Finish the ordering'),
    offset: [4, 0, 30],
    sparkLine: t(
      'Sinyal doğru yolda, ama geç kaldı.',
      'The signal is on the right route. It is simply late.',
    ),
    data: {
      steps: [
        { id: 'sx-flow', effect: 'flowed', requires: [] },
        { id: 'sx-place', effect: 'placed', requires: ['flowed'] },
        { id: 'sx-signal', effect: 'signalled', requires: ['placed'] },
      ],
      goalSignature: 'flowed>placed>signalled',
    },
  },

  // ===== Finale =======================================================
  {
    id: 'finale-synthesis-tree',
    region: 'hub',
    system: 'prediction',
    appCodes: [],
    requiredTool: 'decide',
    title: t('Sentez Ağacı', 'The Synthesis Tree'),
    objective: t(
      'Görünen belirti arızanın kendisi değildir. Ölç, düzelt ve onayla.',
      'The visible symptom is not the fault. Measure, correct, and approve.',
    ),
    prompt: t('Son eylemi onayla', 'Approve the final action'),
    offset: [0, 0, 6],
    sparkLine: t(
      'En çok bağıran şey, en çok konuşan şey değil.',
      'The loudest thing is not the truest thing.',
    ),
    data: {
      trueFault: 'cavitation',
      decoySymptom: 1,
      causeSymptom: 2,
      branches: [
        { id: 'trust-noise', label: 'gürültüye-güven', predicted: 30 },
        { id: 'run-test', label: 'deneyi-yap', predicted: 88 },
      ],
      actual: 88,
      correct: 'run-test',
    },
  },
];

export const STAGE_BY_ID: Record<string, StageDefinition> = STAGES.reduce(
  (acc, stage) => {
    acc[stage.id] = stage;
    return acc;
  },
  {} as Record<string, StageDefinition>,
);

export const ALL_STAGE_IDS: string[] = STAGES.map((s) => s.id);

/** Stage ids that belong to a region, used by progression and the hub tree. */
export function stagesForRegion(region: RegionId): StageDefinition[] {
  return STAGES.filter((s) => s.region === region);
}

/** Every application code the game claims to represent, derived from stages. */
export function representedCodes(): string[] {
  return [...new Set(STAGES.flatMap((s) => s.appCodes))].sort();
}