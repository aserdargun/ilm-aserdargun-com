import type { Lang, LocalizedText, RegionId } from '../types/catalog';

export interface RegionDef {
  id: RegionId;
  /** Stable id used in save data. */
  slug: string;
  index: number;
  name: LocalizedText;
  subtitle: LocalizedText;
  /** Each region needs its own landmark. */
  landmark: LocalizedText;
  /** Material emphasis, per the art direction. */
  material: LocalizedText;
  /** Ambient motion identity. */
  ambience: LocalizedText;
  /** Sound identity (drives which audio layer joins on restoration). */
  soundIdentity: LocalizedText;
  /** Visible restoration effect. */
  restorationEffect: LocalizedText;
  /** Palette anchors used by the renderer. */
  palette: {
    stone: string;
    accent: string;
    water: string;
    copper: string;
  };
  /** World-space anchor the region geometry is built around. */
  anchor: [number, number, number];
  /** Approximate radius of the playable disc, in world units. */
  radius: number;
}

/**
 * Region anchors are laid out on a ring around the central hub so that the
 * restored world reads as a woven network rather than a menu of levels.
 */
export const REGIONS: RegionDef[] = [
  {
    id: 'hub',
    slug: 'hub',
    index: 0,
    name: { tr: 'Örgü Meydanı', en: 'The Weaving Ground' },
    subtitle: {
      tr: 'Sentez Ağacı',
      en: 'The Synthesis Tree',
    },
    landmark: {
      tr: 'Yaşayan ahşap, bakır devre ve yarım kalmış bir tezgâhın karışımı devasa bir ağaç.',
      en: 'An enormous tree of living wood, copper circuitry and an unfinished loom.',
    },
    material: {
      tr: 'Soluk seramik, yosunlu bakır, koyu metal',
      en: 'Pale ceramic, mossy copper, dark metal',
    },
    ambience: {
      tr: 'Ağacın tellerinde yavaşça dolaşan ışık, kumaşların salınımı',
      en: 'Light drifting along the tree threads, woven cloth breathing in the wind',
    },
    soundIdentity: {
      tr: 'Tek bir sürekli tel sesi',
      en: 'A single sustained thread tone',
    },
    restorationEffect: {
      tr: 'Her bölge onarıldıkça dal boyunca ışık yayılır',
      en: 'Light spreads along a branch for each region restored',
    },
    palette: {
      stone: '#a89277',
      accent: '#4fd6d0',
      water: '#3fb6c8',
      copper: '#c07a44',
    },
    anchor: [0, 0, 0],
    radius: 34,
  },
  {
    id: 'cartographers-terrace',
    slug: 'cartographers-terrace',
    index: 1,
    name: { tr: 'Haritacının Terası', en: "The Cartographer's Terrace" },
    subtitle: {
      tr: 'Yön bulma ve eşdeğer anlatımlar',
      en: 'Wayfinding and equivalent expression',
    },
    landmark: {
      tr: 'Devasa, oyulmuş bir dünya haritası; taş masalar terasın kenarına dizilmiş.',
      en: 'A vast carved world map; stone desks line the terrace edge.',
    },
    material: {
      tr: 'Rüzgârın aşındırdığı taş, açık keramik',
      en: 'Wind-carved stone, pale ceramic',
    },
    ambience: {
      tr: 'Yavaş dönen keşif makineleri, asılı harita parçaları',
      en: 'Slow-turning scout machines, suspended map fragments',
    },
    soundIdentity: {
      tr: 'Rüzgâr ve ahşap kıtırtısı',
      en: 'Wind and wooden ratchets',
    },
    restorationEffect: {
      tr: 'Harita üzerindeki rotalar ışık olarak çizilir',
      en: 'Routes draw themselves as light across the map',
    },
    palette: {
      stone: '#b5a184',
      accent: '#7fd0c4',
      water: '#49b0bd',
      copper: '#bd7a45',
    },
    anchor: [-132, 0, -96],
    radius: 40,
  },
  {
    id: 'flow-foundry',
    slug: 'flow-foundry',
    index: 2,
    name: { tr: 'Akış Dökümhanesi', en: 'The Flow Foundry' },
    subtitle: {
      tr: 'Paralellik ve sıralama',
      en: 'Parallelism and scheduling',
    },
    landmark: {
      tr: 'Dev bir tezgâh: her kolu kendi işindeki bir işi dokuyan çok kollu bir makine.',
      en: 'A giant loom: many-armed, each arm weaving its own job.',
    },
    material: {
      tr: 'Koyu metal, yarı saydam cam, turkuaz su kanalları',
      en: 'Dark metal, translucent glass, turquoise channels',
    },
    ambience: {
      tr: 'İplik huzları, kolların çıkış ritimleri',
      en: 'Thread shuttles, the rhythm of arms releasing work',
    },
    soundIdentity: {
      tr: 'Düzenli tezgâh vuruşları',
      en: 'Regular loom strikes',
    },
    restorationEffect: {
      tr: 'Su kanalları dolar, tezgâh kolları eşzamanlı çalışır',
      en: 'Channels fill with water and the loom arms run in time',
    },
    palette: {
      stone: '#948977',
      accent: '#3fd0d8',
      water: '#37c3d6',
      copper: '#c9803f',
    },
    anchor: [0, 0, -156],
    radius: 42,
  },
  {
    id: 'memory-council-city',
    slug: 'memory-council-city',
    index: 3,
    name: { tr: 'Hafıza ve Meclis Şehri', en: 'The City of Memory and Council' },
    subtitle: {
      tr: 'Kanıt, karar ve güven',
      en: 'Evidence, decisions and trust',
    },
    landmark: {
      tr: 'Meclis binasının kubbesi; etrafında arşiv kuleleri ve çalışma tezgâhları.',
      en: 'The dome of the council hall, ringed by archive towers and workbenches.',
    },
    material: {
      tr: 'Soluk seramik, bakır, cam arşiv kasaları',
      en: 'Pale ceramic, copper, glazed archive cases',
    },
    ambience: {
      tr: 'Sırayla dönen danışma halkaları, yükselen alıntı ışıkları',
      en: 'Council rings turning in turn, citation light rising',
    },
    soundIdentity: {
      tr: 'Çok kanallı tartışma, sonra tek ses',
      en: 'Many-voiced debate resolving into one voice',
    },
    restorationEffect: {
      tr: 'Arşiv kasaları yanar, meclis ışığı kararlı bir halka olur',
      en: 'Archive cases ignite and the council ring steadies',
    },
    palette: {
      stone: '#ab9d84',
      accent: '#e08a6a',
      water: '#48b0b8',
      copper: '#c47a45',
    },
    anchor: [138, 0, -84],
    radius: 46,
  },
  {
    id: 'adaptation-cloud-harbor',
    slug: 'adaptation-cloud-harbor',
    index: 4,
    name: { tr: 'Uyarlama Atölyesi ve Bulut Limanı', en: 'The Adaptation Workshop and Cloud Harbor' },
    subtitle: {
      tr: 'Veri, kaynak ve yer seçimi',
      en: 'Data, resources and placement',
    },
    landmark: {
      tr: 'Ustaların oyduğu bir atölye ve göğe uzanan bir liman iskeleti.',
      en: 'A craftsman workshop joined to a harbour frame rising into the sky.',
    },
    material: {
      tr: 'Bakır varak, tezgâh ahşabı, sisli cam',
      en: 'Copper sheet, bench timber, misted glass',
    },
    ambience: {
      tr: 'Kaldırılan iş yükleri, limanda asılı yükler',
      en: 'Workloads lifting off, payloads hanging at the harbour',
    },
    soundIdentity: {
      tr: 'Çekiç, vinç ve uzaktan gelen uğultu',
      en: 'Hammer, winch and distant hum',
    },
    restorationEffect: {
      tr: 'Liman ışıkları yanar, iş yükleri yükselen bir yol çizer',
      en: 'Harbour lights ignite and workloads trace a rising route',
    },
    palette: {
      stone: '#a2907a',
      accent: '#63d6c0',
      water: '#3fb0c6',
      copper: '#cc8044',
    },
    anchor: [150, 0, 84],
    radius: 44,
  },
  {
    id: 'collective-gardens',
    slug: 'collective-gardens',
    index: 5,
    name: { tr: 'Kolektif Bahçeler', en: 'The Collective Gardens' },
    subtitle: {
      tr: 'Yerel kurallardan bütün davranışa',
      en: 'From local rules to collective behaviour',
    },
    landmark: {
      tr: 'Basamaklı mekanik bahçeler ve birbirine bağlanan taraçlar.',
      en: 'Terraced mechanical gardens and interconnecting trellises.',
    },
    material: {
      tr: 'Yosunlu türbinler, açık seramik saksılar, bakır borular',
      en: 'Mossy turbines, open ceramic pots, copper pipes',
    },
    ambience: {
      tr: 'Yavaşça dönen sürüler, açıp kapanan mekanik çiçekler',
      en: 'Slow-turning swarms, mechanical flowers opening',
    },
    soundIdentity: {
      tr: 'Yumuşak uğultu ve karınca adımları',
      en: 'Soft humming and ant-footfall',
    },
    restorationEffect: {
      tr: 'Sürüler bir yol bulur, çiçekler açılır',
      en: 'Swarms find a route and the flowers open',
    },
    palette: {
      stone: '#9e9679',
      accent: '#8fd46a',
      water: '#4bbfae',
      copper: '#bf7a48',
    },
    anchor: [0, 0, 152],
    radius: 42,
  },
  {
    id: 'observers-mirrors',
    slug: 'observers-mirrors',
    index: 6,
    name: { tr: "Gözlemcinin Aynaları", en: "The Observer's Mirrors" },
    subtitle: {
      tr: 'Algı sınırları ve karşı-olgusal deney',
      en: 'Perception limits and counterfactual trials',
    },
    landmark: {
      tr: 'Dev aynalar ve bunların önünde oyulmuş bir test sahnesi.',
      en: 'Great mirrors facing an engraved test scene.',
    },
    material: {
      tr: 'Yarı saydam cam, gümüş-gri metal, açık taş',
      en: 'Translucent glass, silver-grey metal, pale stone',
    },
    ambience: {
      tr: 'Yüzeylerde kayan ışık, yavaşça dönen mercekler',
      en: 'Light sliding across surfaces, lenses turning slowly',
    },
    soundIdentity: {
      tr: 'Cam tonu ve alçak bir geri bildirim uğultusu',
      en: 'Glass tones over a low feedback hum',
    },
    restorationEffect: {
      tr: 'Aynalar netleşir ve sahne katmanları görünür olur',
      en: 'The mirrors clarify and the scene reveals its layers',
    },
    palette: {
      stone: '#aca798',
      accent: '#9fb8e8',
      water: '#59b3c0',
      copper: '#b58155',
    },
    anchor: [-146, 0, 92],
    radius: 40,
  },
  {
    id: 'valley-living-machines',
    slug: 'valley-living-machines',
    index: 7,
    name: { tr: 'Yaşayan Makineler Vadisi', en: 'The Valley of Living Machines' },
    subtitle: {
      tr: 'Ölçüm, karar ve hareket',
      en: 'Measurement, decision and motion',
    },
    landmark: {
      tr: 'Uçurumun dibine oyulmuş bir pompa atölyesi ve yarı açık bir mekanik vadi.',
      en: 'A pump workshop cut into the cliff above a half-open mechanical valley.',
    },
    material: {
      tr: 'Bakır borular, koyu metal, su yosunu',
      en: 'Copper pipe, dark metal, water moss',
    },
    ambience: {
      tr: 'Damla çarpıntıları, hareket eden eklemler',
      en: 'Drip impacts and moving joints',
    },
    soundIdentity: {
      tr: 'Yavaş pompa atımı ve metal eklemler',
      en: 'A slow pump beat and metal joints',
    },
    restorationEffect: {
      tr: 'Pompa çalışır, su yükselir, eklemler hareket eder',
      en: 'The pump runs, water rises and the joints move',
    },
    palette: {
      stone: '#8b8172',
      accent: '#6fd2b0',
      water: '#3fb9c9',
      copper: '#c17c45',
    },
    anchor: [-104, 0, 168],
    radius: 44,
  },
];

export const REGION_BY_ID: Record<RegionId, RegionDef> = REGIONS.reduce(
  (acc, region) => {
    acc[region.id] = region;
    return acc;
  },
  {} as Record<RegionId, RegionDef>,
);

export function isRegionId(value: unknown): value is RegionId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(REGION_BY_ID, value);
}

/** Region completion order used by the progression system. */
export const REGION_ORDER: RegionId[] = REGIONS.filter((r) => r.id !== 'hub')
  .sort((a, b) => a.index - b.index)
  .map((r) => r.id);

export function localized(text: Record<Lang, string>, lang: Lang): string {
  return text[lang];
}