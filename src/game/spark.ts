import type { Lang, LocalizedText, RegionId } from '../types/catalog';

/**
 * Spark's voice.
 *
 * The player spends the whole game walking past a small glowing companion who
 * says one line per stage. That is the entire character — and it was not enough,
 * because the lines that carried the actual argument of the game were never
 * reached:
 *
 * - `spark.wrong` (he admits being wrong), `spark.uncertain` (he admits not
 *   knowing), `spark.consensus` (agreement is not truth) and `spark.route`
 *   (follow what they do) were written in both languages and called from nowhere.
 * - Whole moments were silent: the moment a region comes back to life, the
 *   moment the player runs out of hints, the moment the last stage opens.
 *
 * This module is the fix, and it is data rather than logic for the same reason
 * `lessons.ts` is: a stage must be impossible to reach without its teaching, so
 * the teaching lives in one file the tests can check exhaustively.
 *
 * Two rules govern every line here, both learned the hard way from the existing
 * writing:
 *
 *  1. Spark never explains the puzzle. He states what he notices. The player
 *     still has to do the thinking — a line that hands over the answer teaches
 *     nothing and makes the debrief feel like a reward for reading the hint.
 *  2. Turkish is written as Turkish. `tests/lessons.test.ts` already fails on a
 *     Turkish lesson copied from the English, and the same rule applies here:
 *     a translation reads like a form, this reads like a person.
 *
 * Lines are grouped by *moment* rather than by language, because the moment is
 * what the store knows about when it wants to speak.
 */

export type SparkMoment =
  /** First contact, on the title screen and when a new journey begins. */
  | 'intro'
  /** The player entered a region they have never stood in before. */
  | 'regionArrival'
  /** Every stage of a region is done; that region is alive again. */
  | 'regionRestored'
  /** The stage opened and Spark offers what he has noticed. */
  | 'stageOpen'
  /** The player committed a move the stage rejected. */
  | 'wrongAttempt'
  /** The player used the last hint tier and the stage is still open. */
  | 'outOfHints'
  /** A stage was solved. */
  | 'solved'
  /** The player reset a puzzle. */
  | 'reset'
  /** The finale became reachable. */
  | 'finaleOpen'
  /** The ending screen. */
  | 'ending';

const l = (tr: string, en: string): LocalizedText => ({ tr, en });

/**
 * One or more lines per moment.
 *
 * A moment may carry several because some moments repeat — a player can enter
 * the same region, reset the same puzzle, or fail the same stage repeatedly, and
 * a character who says the identical sentence every time stops being a
 * character. `pick` walks them in order and wraps, so the second visit is not
 * the first visit's echo. Variants are ordered from most to least frequent in
 * real play, which is why the first one is the safest.
 */
export const SPARK: Readonly<Record<SparkMoment, readonly LocalizedText[]>> = {
  // ---- First contact -------------------------------------------------
  intro: [
    l(
      'Sen son Örgücüsün. Ben Kıvılcım. Yani kıvılcım.',
      'You are the last Weaver. I am Kıvılcım. That means spark.',
    ),
    l(
      'Ben Kıvılcım. Adımın sebebini sorma, açıklamasını da istemiyorum.',
      'I am Kıvılcım. Do not ask why I am named that. I have an answer and it is not a good one.',
    ),
  ],

  // ---- Regions -------------------------------------------------------
  regionArrival: [
    l(
      'Buraya daha önce hiç gelmemiştim. Sesin çıktığı yeri arıyordum.',
      'I had never been here before. I was following where the sound was coming from.',
    ),
    l(
      'Her bölgenin bir sesi var. Bu biraz önce susmuştu.',
      'Every region has a sound. This one had been quiet for a while.',
    ),
    l(
      'Bak, burası biraz önce karanlıktı. Gözümü kısarak da olsa farkı biliyorum.',
      'Look — this was dark not long ago. I know the difference even with my eyes narrowed.',
    ),
  ],

  regionRestored: [
    l(
      'Burası yeniden konuşuyor. Dikkat et, aynı cümleyi iki kez söylemiyor.',
      'This place is talking again. Notice that it is not repeating itself.',
    ),
    l(
      'Duyduğun ses, onun kendi sesi değil. Onu birbirine bağladıkça çıkıyor.',
      'That sound is not its own voice. It only shows up as we connect the pieces.',
    ),
    l(
      'Geri geldi. Kimse geri geldiğinde bunu yaptığını hatırlamıyor.',
      'It came back. Nothing ever remembers that it was the one who left.',
    ),
  ],

  // ---- Stages --------------------------------------------------------
  stageOpen: [
    l(
      'İki kez izle. Hareket etmeyen şeyler gözden kaçar.',
      'Watch it twice. Things that do not move are easy to miss.',
    ),
    l(
      'Onların izlediği yolu izle. Tahmin etmekten kolay.',
      'Follow the route they take. It is easier than guessing.',
    ),
    l(
      'Herkes anlaştı. Bu, doğru olmakla aynı şey değil.',
      'Everyone agreed. That is not the same as being right.',
    ),
    l(
      'Henüz bilmiyorum. Bunu açıkça söylemeyi tercih ederim.',
      'I do not know yet. I would rather say that plainly.',
    ),
  ],

  wrongAttempt: [
    l(
      'Yanılmışım. Olabilir. Yanılmak benim öğrenme biçimim.',
      'I was wrong. That is allowed. Being wrong is how I learn.',
    ),
    l(
      'Olmadı. En çok bağıran şey, en çok konuşan şey değil.',
      'It did not take. The loudest thing is not the truest thing.',
    ),
    l(
      'Olmadı. Sakin ol, hata bir cevaptan daha hızlı geliyor.',
      'No. Calm down — the mistake arrives faster than the answer does.',
    ),
    l(
      'Olmadı. Geri dönüp bakmak da ilerlemek sayılır.',
      'No. Turning back to look is still progress.',
    ),
  ],

  outOfHints: [
    l(
      'Söyleyeceklerimi söyledim. Bundan sonrası senin.',
      'I have said what I have to say. The rest is yours.',
    ),
    l(
      'İpucu bitti. Bu bir çıkmaz değil, sadece artık birlikte yapmıyoruz.',
      'Hints are gone. That is not a dead end — we are simply not doing it together any more.',
    ),
    l(
      'Daha fazla ipucum yok. Dürüst olmak, yardımcı olmaktan vazgeçmek değil.',
      'No more hints. Being honest is not the same as giving up on helping.',
    ),
  ],

  solved: [
    l('Oldu. Bak neyi değiştirdi.', 'It worked. Look at what that changed.'),
    l(
      'Tamam. Şimdi aynı yere bir daha bak — farkı görüyor musun?',
      'Good. Look at that spot again — do you see the difference now?',
    ),
    l(
      'Bağlandı. Ben anlamadan da burada olurdu, ama anlamak daha iyi.',
      'It is connected. I would have been here either way, but understanding it is better.',
    ),
  ],

  reset: [
    l(
      'Sıfırla. Onardığın hiçbir şey geri alınmaz.',
      'Reset it. Nothing you have already restored comes undone.',
    ),
    l(
      'Temiz bir başlangıç. Bu sefer daha çabuk bulursun.',
      'A clean start. This time you will find it faster.',
    ),
    l(
      'Sıfırla. Korkmak, yanlış yapmaktan daha pahalı.',
      'Reset it. Hesitating costs more than getting it wrong.',
    ),
  ],

  // ---- Endgame -------------------------------------------------------
  finaleOpen: [
    l(
      'Hepsi yerine oturdu. Şimdi asıl soru: gördüğün belirti, arızanın kendisi mi?',
      'Everything is in place. Now the real question: is the symptom you can see the fault itself?',
    ),
    l(
      'Son bulmaca. Burada ölçmek, görmekten daha değerli.',
      'The last one. Measuring is worth more than looking here.',
    ),
  ],

  ending: [
    l(
      'Kaydettim: son Örgücüydün. Dünya hatırladı. Ben de not aldım.',
      'On the record: you were the last Weaver. The world remembered. So did I.',
    ),
    l(
      'Bitti. Geriye sadece bağlı kalmış bir dünya kaldı.',
      'It is done. What is left is a world that stays connected.',
    ),
    l(
      'Buradan sonrası senin. Ben yalnızca baştan söyledim.',
      'From here it is yours. I only said it at the start.',
    ),
  ],
};

/**
 * Region-restored lines are per region rather than generic: the player restores
 * seven places, and hearing the same sentence seven times teaches them that the
 * restoration is one repeated event instead of seven different ones.
 */
export const REGION_RESTORED: Readonly<Record<RegionId, LocalizedText>> = {
  hub: l(
    'Ana dal. Bütün teller buradan geçiyordu.',
    'The main trunk. Every thread passed through here.',
  ),
  'cartographers-terrace': l(
    'Tera taşları artık yönü biliyor. Onlardan önce ben yönü biliyordum.',
    'The terrace stones know their bearing now. Before them, only I did.',
  ),
  'flow-foundry': l(
    'Kollar eşzamanlı çalışıyor. Boş yuvayı hâlâ sayıyorum.',
    'The arms are running in time. I am still counting the empty slots.',
  ),
  'memory-council-city': l(
    'Meclis oturdu. Aynı şeyi düşündüğünü sandıkları anı da kayda geçti.',
    'The council sat. The moment they assumed they agreed went into the record too.',
  ),
  'adaptation-cloud-harbor': l(
    'İş yükleri kalktı. Bir kısmı yukarı gitmek zorunda değil.',
    'The workloads lifted. Some of them no longer have to go up.',
  ),
  'collective-gardens': l(
    'Yolları değiştirdiler, kuralları değil. Farkı aramak gerekir.',
    'They changed their routes, not their rules. The difference is worth finding.',
  ),
  'observers-mirrors': l(
    'Aynalar netleşti. Görmediğim yerleri saymayı bırakıyorum.',
    'The mirrors clarified. I am done counting the parts I never saw.',
  ),
  'valley-living-machines': l(
    'Pompa çalışıyor ve kimse tekrar söylemek zorunda değil.',
    'The pump runs, and nobody has to say it twice any more.',
  ),
};

/**
 * A line for the moment, in the player's language.
 *
 * `visit` advances the rotation so a repeated moment says something new; it is
 * a plain counter rather than a random pick, because a character that repeats
 * itself at random reads as broken rather than as varied. Returning `undefined`
 * for an unknown moment keeps the caller honest instead of printing "undefined"
 * into the middle of the HUD.
 */
export function lineFor(moment: SparkMoment, lang: Lang, visit = 0): string | undefined {
  const lines = SPARK[moment];
  if (!lines || lines.length === 0) return undefined;
  const index = ((visit % lines.length) + lines.length) % lines.length;
  return lines[index][lang];
}

/** How many variants a moment has; the tests use it to require real rotation. */
export function variantCount(moment: SparkMoment): number {
  return SPARK[moment]?.length ?? 0;
}

/** Per-region restoration line, falling back to the generic moment. */
export function regionRestoredLine(region: RegionId, lang: Lang): string {
  return REGION_RESTORED[region]?.[lang] ?? lineFor('regionRestored', lang) ?? '';
}