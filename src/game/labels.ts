import type { Lang, LocalizedText } from '../types/catalog';

/**
 * Display names for every id the player can see.
 *
 * The puzzle systems are written in stable ids and numbers on purpose — a stage
 * is solved by matching `arm-2` to `warp-c`, never by matching prose — but those
 * ids are not something to put in front of a player. This module is the single
 * place where an id becomes a name.
 *
 * Keeping the dictionary separate from `stages.ts` is what lets the interface
 * improve without touching gameplay: no evaluator, solver or test contract
 * moves when a label changes. `lookup` falls back to the raw id, so a missing
 * entry degrades to the old behaviour instead of breaking the panel.
 */

const l = (tr: string, en: string): LocalizedText => ({ tr, en });

export const LABELS: Readonly<Record<string, LocalizedText>> = {
  // ---- Kinds: what a line can carry ---------------------------------
  energy: l('enerji', 'energy'),
  information: l('bilgi', 'information'),
  resource: l('kaynak', 'resource'),
  none: l('hiçbir şey kabul etmez', 'accepts nothing'),

  // ---- Hub opening ---------------------------------------------------
  src: l('Kaynak kanal', 'Source channel'),
  dst: l('Karanlık kanal', 'Dark channel'),

  // ---- Cartographer's Terrace ---------------------------------------
  's-stone': l('Taş keşifci', 'Stone scout'),
  's-voice': l('Ses keşifci', 'Voice scout'),
  's-water': l('Su keşifci', 'Water scout'),
  'r-lift': l('Kaldırma hattı', 'Lift line'),
  'r-signal': l('Sinyal hattı', 'Signal line'),
  'r-canal': l('Kanal hattı', 'Canal line'),

  'st-1': l('Yatak', 'Bed'),
  'st-2': l('Kemer', 'Arch'),
  'st-3': l('Köprü', 'Deck'),
  bed: l('yatar', 'beds'),
  arch: l('kemer koyar', 'raises the arch'),
  deck: l('köprüyü döşer', 'lays the deck'),

  // ---- Flow Foundry --------------------------------------------------
  'arm-1': l('Birinci kol', 'First arm'),
  'arm-2': l('İkinci kol', 'Second arm'),
  'arm-3': l('Üçüncü kol', 'Third arm'),
  'warp-a': l('İplik A', 'Warp A'),
  'warp-b': l('İplik B', 'Warp B'),
  'warp-c': l('İplik C', 'Warp C'),
  'warp-d': l('İplik D', 'Warp D'),

  'hall-a': l('Büyük oda', 'Large hall'),
  'hall-b': l('Küçük oda', 'Small hall'),
  'req-1': l('Kısa talep', 'Short request'),
  'req-2': l('Kısa talep', 'Short request'),
  'req-3': l('Uzun talep', 'Long request'),

  'cv-1': l('Ön dolum', 'Prefill'),
  'cv-2': l('Rezervasyon', 'Reservation'),
  'cv-3': l('Çözümleme', 'Decode'),
  'cv-4': l('Teslim', 'Delivery'),
  prefill: l('ön doldurur', 'prefills'),
  reserve: l('yer ayırır', 'reserves'),
  decode: l('çözer', 'decodes'),
  deliver: l('teslim eder', 'delivers'),

  // ---- City of Memory and Council -----------------------------------
  'wk-1': l('Açılış', 'Opening'),
  'wk-2': l('Toplama', 'Gathering'),
  'wk-3': l('Çağrı', 'Call'),
  'wk-4': l('Denetim', 'Check'),
  opened: l('açar', 'opens'),
  gathered: l('toplar', 'gathers'),
  called: l('çağırır', 'calls'),
  checked: l('denetler', 'checks'),

  proceed: l('İlerle', 'Proceed'),
  evidence: l('Kanıt iste', 'Ask for evidence'),
  wait: l('Bekle', 'Wait'),
  stop: l('Dur', 'Stop'),
  gate: l('kapı', 'the gate'),
  lamp: l('lamba', 'the lamp'),

  paused: l('Duraklatıldı', 'Paused'),
  retasked: l('Görevi değişti', 'Retasked'),
  resumed: l('Sürdürüldü', 'Resumed'),

  'seat-1': l('Birinci koltuk', 'First seat'),
  'seat-2': l('İkinci koltuk', 'Second seat'),
  'seat-3': l('Üçüncü koltuk', 'Third seat'),
  'seat-4': l('Dördüncü koltuk', 'Fourth seat'),
  'giriş-açık': l('Giriş açık', 'The inlet is clear'),

  k1: l('Pompa kaydı', 'Pump record'),
  k2: l('Rota kaydı', 'Route record'),
  k3: l('Eski rota kaydı', 'Old route record'),
  k4: l('Söylenti', 'Rumour'),
  k5: l('Gürültü kaydı', 'Noise record'),
  pump: l('pompa', 'pump'),
  route: l('rota', 'route'),
  old: l('eski', 'outdated'),
  rumour: l('söylenti', 'rumour'),
  noise: l('gürültü', 'noise'),

  'seal-read': l('Okuma mührü', 'Read seal'),
  'seal-valve': l('Vana mührü', 'Valve seal'),
  'seal-flow': l('Akış mührü', 'Flow seal'),
  // `pump`, `route` and `canal` are shared by a record tag and a mechanism on
  // purpose — the same word names the same thing in both readings.
  archive: l('Arşiv', 'Archive'),
  canal: l('Kanal', 'Canal'),
  trap: l('Tuzağa açılan kapı', 'Door that opens a trap'),

  // ---- Adaptation Workshop and Cloud Harbor --------------------------
  cradle: l('Yuva', 'Cradle'),
  'ex-narrow-a': l('Dar örnek', 'Narrow example'),
  'ex-narrow-b': l('Dar örnek', 'Narrow example'),
  'ex-broad': l('Geniş örnek', 'Broad example'),

  'mod-light': l('Hafif modül', 'Light module'),
  'mod-heavy': l('Güçlü modül', 'Strong module'),
  'job-gentle': l('Hafif iş', 'Gentle job'),
  'job-heavy': l('Ağır iş', 'Heavy job'),

  'lane-local': l('Yer yolu', 'Local lane'),
  'lane-sky': l('Gökyüzü yolu', 'Sky lane'),
  'lane-mixed': l('Ara yol', 'Mixed lane'),
  'job-private': l('Gizli iş', 'Private job'),
  'job-small': l('Küçük yük', 'Small payload'),
  'job-bulk': l('Toplu yük', 'Bulk payload'),

  // ---- Collective Gardens --------------------------------------------
  'terrace-a': l('Birinci taraç', 'First terrace'),
  'terrace-b': l('İkinci taraç', 'Second terrace'),
  'load-1': l('Birinci yük', 'First load'),
  'load-2': l('İkinci yük', 'Second load'),

  'floor-open': l('Açık alan', 'Open floor'),
  'floor-shut': l('Kapalı alan', 'Shut floor'),
  'nectar-1': l('Bal öbeği', 'Nectar load'),
  'nectar-2': l('Bal öbeği', 'Nectar load'),

  // ---- Observer's Mirrors --------------------------------------------
  left: l('sol dal', 'the left branch'),
  right: l('sağ dal', 'the right branch'),

  // ---- Valley of Living Machines -------------------------------------
  'blocked-inlet': l('Tıkanmış giriş', 'Blocked inlet'),
  cavitation: l('Kavitasyon', 'Cavitation'),
  steady: l('kararlı', 'steady'),
  surge: l('ani', 'surging'),

  'jt-sense': l('Algılama', 'Sensing'),
  'jt-power': l('Güç', 'Power'),
  'jt-decide': l('Karar', 'Decision'),
  'jt-reach': l('Ulaşma', 'Reach'),
  sense: l('algılar', 'senses'),
  power: l('güç sağlar', 'supplies power'),
  decide: l('karar verir', 'decides'),
  reach: l('ulaşır', 'reaches'),

  // ---- Cross-region ---------------------------------------------------
  narrow: l('Dar yol', 'Narrow way'),
  'seal-part': l('Birinci parça', 'First part'),
  'seal-part-2': l('İkinci parça', 'Second part'),
  'act-now': l('şimdi', 'act now'),
  'act-wait': l('bekle', 'wait'),

  'sx-flow': l('Akış', 'Flow'),
  'sx-place': l('Yerleştirme', 'Placement'),
  'sx-signal': l('Sinyal', 'Signal'),
  flowed: l('akıtır', 'flows'),
  placed: l('yerleştirir', 'places'),
  signalled: l('sinyaller', 'signals'),

  'trust-noise': l('gürültüye güven', 'trust the noise'),
  'run-test': l('deneyi yap', 'run the test'),
};

/** Localised name for an id, falling back to the id itself. */
export function lookup(id: string, lang: Lang): string {
  return LABELS[id]?.[lang] ?? id;
}

/**
 * Sensors are numbered rather than named, so they read the same in both
 * languages. The id still encodes the symptom index the solver depends on.
 */
export function sensorLabel(id: string, lang: Lang): string {
  const index = Number(id.replace('sensor-', ''));
  if (!Number.isFinite(index)) return lookup(id, lang);
  return lang === 'tr' ? `${index + 1}. sensör` : `Sensor ${index + 1}`;
}

/** Grid cells carry a coordinate, not a word. */
export function cellLabel(index: number, lang: Lang): string {
  return lang === 'tr' ? `Hücre ${index + 1}` : `Cell ${index + 1}`;
}

/** True when the dictionary can name this id. */
export function hasLabel(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(LABELS, id);
}