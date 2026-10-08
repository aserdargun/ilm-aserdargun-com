import type { LocalizedText } from '../types/catalog';

/**
 * The teaching layer.
 *
 * A stage already says what to do (`objective`) and where to start (`prompt`).
 * What it never said is the thing worth taking away, so every stage also carries
 * a lesson:
 *
 * - `principle` — the transferable idea, stated in one sentence.
 * - `misconception` — the tempting belief this stage is built to punish. Naming
 *   the trap is what turns a solved puzzle into a changed mind; without it the
 *   player walks away with a score rather than a correction.
 * - `firstMove` — one concrete action that is not the answer, so an unsolved
 *   board is never a blank page.
 * - `hints` — three escalating nudges. These replaced the old generic
 *   "Look here / Try this next", which said the same thing at all 28 stages.
 *
 * Content lives here rather than inside `stages.ts` for one reason: `stages.ts`
 * is mechanics, and a stage should be impossible to complete without a lesson
 * (see `tests/lessons.test.ts`) but easy to read without one.
 *
 * Text is bilingual data, like the application catalog: both languages are
 * written, neither is derived from the other.
 */

export interface StageLesson {
  /** The transferable idea, in one sentence. */
  principle: LocalizedText;
  /** The wrong mental model this stage exists to punish. */
  misconception: LocalizedText;
  /** A first action that is not the answer. */
  firstMove: LocalizedText;
  /** Three escalating nudges, weakest first. */
  hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

const L = (
  tr: { principle: string; misconception: string; firstMove: string; hints: [string, string, string] },
  en: { principle: string; misconception: string; firstMove: string; hints: [string, string, string] },
): StageLesson => ({
  principle: { tr: tr.principle, en: en.principle },
  misconception: { tr: tr.misconception, en: en.misconception },
  firstMove: { tr: tr.firstMove, en: en.firstMove },
  hints: [
    { tr: tr.hints[0], en: en.hints[0] },
    { tr: tr.hints[1], en: en.hints[1] },
    { tr: tr.hints[2], en: en.hints[2] },
  ],
});

/** Keyed by stage id. `tests/lessons.test.ts` fails on any stage without one. */
export const LESSONS: Readonly<Record<string, StageLesson>> = {
  // ===== Region 0 — hub / opening =====================================
  'r0-opening': L(
    {
      principle:
        'Bir bağlantı, iki ucu birbirine tanıtmakla başlar. Ne taşındığı ise ayrı bir sorudur.',
      misconception:
        'Kanal karanlık olduğu için su oraya ulaşamıyordu. Ulaşamıyordu çünkü iki uç birbirini hiç tanımıyordu.',
      firstMove: 'Kaynak kanalına dokun ve bırak; sonra karanlık kanala dokunmayı dene.',
      hints: [
        'İki ucun da adı var. Biri diğerini tanımıyor.',
        'Bir ucu önce seç, sonra diğerine dokun.',
        'Kanal yalnızca iki ucu birbirine bağladığında akar.',
      ],
    },
    {
      principle:
        'A connection begins by introducing two ends to each other. What travels along it is a separate question.',
      misconception:
        'The water could not arrive because the channel was dark. It could not arrive because the two ends had never met.',
      firstMove: 'Touch the source channel and let go, then try touching the dark channel.',
      hints: [
        'Both ends are named. Neither knows the other exists.',
        'Choose one end first, then touch the other.',
        'The channel only carries once the two ends know each other.',
      ],
    },
  ),

  // ===== Region I — Cartographer's Terrace ============================
  'r1-scout-match': L(
    {
      principle:
        'İki şey yalnızca aynı türden oldukları için birbirine bağlanır. Benzerlik değil, uyumluluk.',
      misconception:
        'Üç keşifçi de aynı işi yapıyor gibi görünüyor. Biri taş taşıyor, biri konuşma, biri su.',
      firstMove: 'Önce hatlara bak: her hattın yanındaki parantez, o hattın ne taşıyabildiğini söylüyor.',
      hints: [
        'Her hattın kabul ettiği tek bir tür var.',
        'En açık eşleşmeyi bul; gerisi kendiliğinden yerine oturur.',
        'Hattın yanındaki türü oku ve aynı türdeki keşifciyi ona bağla.',
      ],
    },
    {
      principle:
        'Two things connect because they are the same kind, not because they resemble each other.',
      misconception:
        'All three scouts look like they do the same work. One carries stone, one carries speech, one carries water.',
      firstMove: 'Start with the routes: the bracketed note beside each one says what it can carry.',
      hints: [
        'Every route accepts exactly one kind.',
        'Find the most obvious match first; the rest fall into place.',
        'Read the kind beside the route and wire it to the scout of the same kind.',
      ],
    },
  ),

  'r1-equivalent-bridges': L(
    {
      principle:
        'Farklı yazımlar aynı davranışı gösterebilir. Karşılaştırılan şey yazım değil, sıra ve etkidir.',
      misconception:
        'İki farklı yazım, iki farklı program demek değildir; çoğu kez aynı programın iki anlatımıdır.',
      firstMove: 'Her adımın ne ürettiğine bak. Bir adım ancak ihtiyacı olan şey gerçekleştiğinde çalışır.',
      hints: [
        'Sırayı tahmin etme; adımın ihtiyaçlarını oku.',
        'Hiçbir şeye ihtiyaç duymayan adım ilk olmak zorunda.',
        'Her adımın ihtiyaç listesi, kendinden önceki bir adımın ürettiği şeye bakıyor.',
      ],
    },
    {
      principle:
        'Different spellings can produce the same behaviour. What is compared is the order and the effect, not the notation.',
      misconception:
        'Two spellings do not make two programs. Most of the time they are two tellings of the same one.',
      firstMove: 'Look at what each step produces. A step runs only once what it requires has actually happened.',
      hints: [
        'Do not guess the order. Read what each step requires.',
        'The step that requires nothing has to come first.',
        'Each requirement list points at something an earlier step produces.',
      ],
    },
  ),

  // ===== Region II — Flow Foundry =====================================
  'r2-loom-distribution': L(
    {
      principle:
        'Toplam iş sabitse bitişi en ağır kol belirler. Bir kolu boşta bırakmak da, o kolu doldurmak kadar bir karardır.',
      misconception:
        'Her işi en geniş kola koymak işi bitirir. Bitmez. Tezgâh en yavaş kol bitene kadar bekler.',
      firstMove: 'Önce hangi kolun en çok iş taşıdığını bul, sonra ona ne vereceğini düşün.',
      hints: [
        'Tezgâh, en yavaş kol bitene kadar bekler.',
        'Bir işin dayanabileceği yük, o kolun o andaki yükü kadardır.',
        'En ağır yükü en az yüklü kola aktar; aradaki fark bitişi belirler.',
      ],
    },
    {
      principle:
        'When the work is fixed, the heaviest lane sets the finish. Leaving a lane idle is a decision too, not a free choice.',
      misconception:
        'Putting everything on the widest lane finishes the job. It does not. The loom waits for the slowest arm.',
      firstMove: 'Find the lane carrying the most work first, then decide what it should be given.',
      hints: [
        'The loom waits for its slowest arm.',
        'How much extra a job can take is measured against that lane’s current load.',
        'Move the heaviest load to the least loaded lane; the gap sets the finish.',
      ],
    },
  ),

  'r2-chamber-routing': L(
    {
      principle:
        'Doğru türdeki odaya göndermek ile en büyük odaya göndermek farklı kararlardır.',
      misconception:
        'Küçük bir isteği büyük bir odaya vermek onu hızlandırmaz; yalnızca odayı meşgul eder.',
      firstMove: 'İki odanın da türünü ve yuvasını karşılaştır; sende olan işin türüyle başla.',
      hints: [
        'Bir işin türü, onu kabul edebilecek odayı belirler.',
        'Bir yuvası olan odaya iki iş koyamazsın.',
        'Büyük oda ayırt edici değil; yalnızca yuvası çok.',
      ],
    },
    {
      principle:
        'Sending work to the right kind of room and sending it to the biggest room are different decisions.',
      misconception:
        'Sending a small request to a large chamber does not speed it up. It only occupies the chamber.',
      firstMove: 'Compare both chambers’ kind and slot count, then start from the kind of work in front of you.',
      hints: [
        'The kind of the work decides which chamber can accept it.',
        'You cannot put two jobs into a chamber that has one slot.',
        'The large chamber is not special. It only has more slots.',
      ],
    },
  ),

  'r2-caravan-schedule': L(
    {
      principle:
        'Sıra, bir şeyin ne zaman hazır olduğudur. Gecikme çoğu kez yanlış işi önce yapmaktan gelir.',
      misconception:
        'En hızlı görünen adımı öne almak karavanı hızlandırmaz; onun önünde bekletir.',
      firstMove: 'En uzun aşamayı bul ve ona en çok alan bırakan ilk adımı sor.',
      hints: [
        'Hazırlanmadan hiçbir şey çıkamaz.',
        'Rezervasyon, ön dolumdan sonra gelmek zorunda.',
        'İlk adım, diğerlerinin hepsini bekleyebileceği tek adımdır.',
      ],
    },
    {
      principle:
        'Order is when something becomes available. Latency usually comes from doing the wrong thing first.',
      misconception:
        'Moving the quickest-looking step to the front does not speed the caravan up. It makes the caravan wait for it.',
      firstMove: 'Find the longest stage, then look for the step that has to come before it.',
      hints: [
        'Nothing can leave before it is prepared.',
        'The reservation must come after the prefill.',
        'Only the first step is one that every other step can wait behind.',
      ],
    },
  ),

  // ===== Region III — City of Memory and Council ======================
  'r3-task-sequence': L(
    {
      principle:
        'Katman sırası bir tercih değil, bir bağımlılıktır. Yanlış katman gürültüyle değil, yanlış oda ısınmış olarak hata bildirir.',
      misconception:
        'Altıncı katman çalışmadı sanılır. Oysa altıncı bitmeden ona bir şey söylenmişti.',
      firstMove: 'Hiçbir şeye bağlı olmayan adımdan başla; diziyi oradan kur.',
      hints: [
        'Her adım bir üsttekinin ürettiğini bekler.',
        'Tek ihtiyacı olan adım en sona kalmalı.',
        'Sıralamayı baştan sona oku ve her adımın ihtiyacının gerçekten sağlandığını denetle.',
      ],
    },
    {
      principle:
        'Layer order is a dependency, not a preference. A wrong layer does not fail loudly; it arrives with the wrong room already warm.',
      misconception:
        'It looks like the sixth layer failed. It had simply been told something before the sixth finished.',
      firstMove: 'Start from the step that requires nothing and build the sequence from there.',
      hints: [
        'Every step waits for something an earlier step produced.',
        'The step with a single requirement has to come last.',
        'Read the order end to end and check that each requirement has genuinely been met.',
      ],
    },
  ),

  'r3-junction-choice': L(
    {
      principle:
        'Karar vermek ile kararın doğru olduğunu göstermek ayrı işler. İkincisi için karardan sonra bir denetim gerekir.',
      misconception:
        'Doğru kararı vermek, doğru yaptığınızı gösterir. Göstermez; neyin kıpırdadığına bakmadan hiçbir şey kanıtlanmamıştır.',
      firstMove: 'Seçmeden önce sor: bu karar tam olarak hangi mekanizmayı kıpırdıracak?',
      hints: [
        'En hızlı seçenek, en doğru seçenek değildir.',
        'Kararın sonrasında hangi mekanizmanın kıpırdadığına bakman gerekiyor.',
        'Dört seçenekten hangisi, kanıt gelene kadar hiçbir şeyi değiştirmeyen tek olanı?',
      ],
    },
    {
      principle:
        'Making a decision and showing the decision was right are separate acts. The second one needs verification afterwards.',
      misconception:
        'Choosing well proves you did well. It does not. Until you look at what actually moved, nothing is proven.',
      firstMove: 'Before choosing, ask: which mechanism exactly will this move?',
      hints: [
        'The fastest option is not the most correct one.',
        'After the decision you still have to look at which mechanism responded.',
        'Of the four options, which is the only one that changes nothing until evidence arrives?',
      ],
    },
  ),

  'r3-worker-supervision': L(
    {
      principle:
        'Bir çalışanı durdurmak onu anlamak değildir. Ama gözetimsiz bırakmak da, gözetmek kadar bir karardır.',
      misconception:
        'Duraklattığım için anladığımı düşünmek. Duraklatmak yalnızca etkisini geçici olarak kaldırır.',
      firstMove: 'Önce incele. Duraklatmadan önce ne olduğunu okumadıysan, duraklatman bir tesadüftür.',
      hints: [
        'Üç eylemin sırası tesadüfi değil.',
        'Duraklatmadan önce incelersen, sonraki iki adımın ne anlama geldiğini önceden bilirsin.',
        'İncele, duraklat, görev değiştir, sonra bilinçli olarak sürdür.',
      ],
    },
    {
      principle:
        'Stopping a worker is not understanding it. Leaving it unsupervised is also a decision, and it is a real one.',
      misconception:
        'Believing that stopping it means you understood it. Stopping only suspends the effect.',
      firstMove: 'Inspect first. If you never read what it was doing, stopping it was an accident.',
      hints: [
        'The order of the three actions is not arbitrary.',
        'Inspecting before you stop tells you what the next two steps will mean.',
        'Inspect, pause, retask, then resume deliberately.',
      ],
    },
  ),

  'r3-council-chamber': L(
    {
      principle:
        'Çoğunluk bir kanıttır; doğruluk kanıt değildir. Oy ile varsayım farklı şeylerdir.',
      misconception:
        'Dört koltuğun da aynı şeyi varsayması, o varsayımın doğru olduğunu göstermez.',
      firstMove: 'Koltuğun ne oy verdiğine değil, neyi doğru kabul ettiğine bak.',
      hints: [
        'Oy ile varsayım farklı şeyler.',
        'Arınmayan tek bir varsayım var ve hepsi onu tekrarlıyor.',
        'Çelişen şey koltuğun oyu değil, varsayımıydı.',
      ],
    },
    {
      principle:
        'A majority is evidence. Correctness is not evidence. A vote and an assumption are different things.',
      misconception:
        'Four seats assuming the same thing does not make that assumption true.',
      firstMove: 'Look at what each seat takes for granted rather than what it voted.',
      hints: [
        'A vote and an assumption are not the same claim.',
        'There is exactly one assumption that never clears, and every seat repeats it.',
        'What is contradicted is the assumption, not the vote.',
      ],
    },
  ),

  'r3-context-lantern': L(
    {
      principle:
        'Bağlam bir kısıttır. Yer kazanmak, hepsini sığdırmaktan değil, doğru olanı seçmekten geçer.',
      misconception:
        'Feneri doldurmak isteyen, içine eski ya da yanlış kayıt koyar. Fener doludur ama işe yaramaz.',
      firstMove: 'Kayıtları tek tek oku ve her birinin fenerde ne kadar yer tuttuğunu hesapla.',
      hints: [
        'Her kayıt bir yer değil, bir yer ve etiketleri kadar yer tutuyor.',
        'Eski kayıt düzeltilmeden fenerde sayılmaz.',
        'Feneri tam olarak doldur; bir etiket fazlası, bir kayıt dışarıda kalır.',
      ],
    },
    {
      principle:
        'Context is a constraint. Space is won by choosing what belongs, not by fitting in everything.',
      misconception:
        'Wanting the lantern full is how an outdated or false record gets packed in. Full and useless at the same time.',
      firstMove: 'Read the records one at a time and work out how much room each one takes.',
      hints: [
        'A record costs one slot plus room for its tags.',
        'A stale record does not count as usable until it has been corrected.',
        'Fill the lantern exactly. One extra tag pushes a record outside.',
      ],
    },
  ),

  'r3-permission-seals': L(
    {
      principle:
        'Yetki, mühürün mekanizmaya değil, mekanizmanın mühür kabul etmesine bağlıdır.',
      misconception:
        'Her mühür her kapıya uyar. Uyumsuz yere takarsan kapı açılmaz ve mühür de yanlış yere harcanmış olur.',
      firstMove: 'Mühürlerin türünü, hedeflerin kabul ettiği türü yan yana koy.',
      hints: [
        'Bir hedef hiçbir şey kabul etmiyor; oraya hiçbir şey bağlanmaz.',
        'Her mührün bir hedefi var, her hedefün bir mührü.',
        'Üç mührü üç hedefe dağıttıktan sonra onarımın üç koşuda da tuttuğunu doğrula.',
      ],
    },
    {
      principle:
        'Permission follows the mechanism’s acceptance of the seal, not the seal’s desire to be used.',
      misconception:
        'Every seal fits every door. Use the wrong one and the door stays shut while the seal is spent.',
      firstMove: 'Put the kinds of the seals next to the kinds the targets accept.',
      hints: [
        'One target accepts nothing, and nothing may be wired to it.',
        'Each seal has a target and each target has a seal.',
        'After distributing all three, confirm the repair holds across all three trials.',
      ],
    },
  ),

  // ===== Region IV — Adaptation Workshop and Cloud Harbor ============
  'r4-example-patterns': L(
    {
      principle:
        'Örnek çeşitliliği öğrenmenin kapsamını belirler. Aynı örneği tekrarlamak hiçbir şey öğretmez.',
      misconception:
        'Üç benzer örnek, iki farklı örnekten daha çok şey öğretir. Hatta tam olarak bir örnek kadar öğretir.',
      firstMove: 'Yuvaya üç şey koyacaksın; üçünün neye göre farklılaştığını bul.',
      hints: [
        'Farklı olmayan iki örnek, bir örnektir.',
        'Geniş bir örnek, dar bir örneğin üstüne konduğunda ne olur?',
        'İkisi dar ve birbirine benzer, biri geniş: üçünü de koy.',
      ],
    },
    {
      principle:
        'The variety of examples sets how far the learning reaches. Repeating one example teaches nothing new.',
      misconception:
        'Three similar examples teach more than two different ones. They teach exactly as much as one.',
      firstMove: 'Three things go in the cradle. Work out what makes the three of them different.',
      hints: [
        'Two examples that do not differ are one example.',
        'What happens when the broad example lands on top of the narrow ones?',
        'Two narrow and similar, one broad. Put all three in.',
      ],
    },
  ),

  'r4-module-fit': L(
    {
      principle:
        'En pahalı seçenek her iş için doğru değildir. Esneklik bir maliyettir ve maliyeti ödeyecek bir iş gerekir.',
      misconception:
        'Güçlü modülü kullanmak her zaman daha iyidir. Değildir; yalnızca aceleyen iş için daha iyidir.',
      firstMove: 'Hangi işin gecikmeyi kaldıramayacağını bul. O iş güçlü modülü hak eder.',
      hints: [
        'Hafif modülün gecikmesi, işler çoğaldıkça birikir.',
        'Ağır işi hafif modüle koyarsan beklediğin süreyi alırsın.',
        'Hafif iş hafif modüle, ağır ve aceleyen iş güçlü modüle.',
      ],
    },
    {
      principle:
        'The most expensive option is not right for every job. Flexibility is a cost, and something has to need it.',
      misconception:
        'Using the stronger module is always better. It is only better for work that cannot wait.',
      firstMove: 'Find the job that cannot tolerate a delay. That one earns the strong module.',
      hints: [
        'The light module’s delay accumulates as work piles up.',
        'Put the heavy job on the light module and you will feel the wait you predicted.',
        'Light job to the light module; heavy, hurried job to the strong one.',
      ],
    },
  ),

  'r4-route-choice': L(
    {
      principle:
        'Doğru yer en ucuz yer değil, kısıtına uyan yerdir. Her işin kendi kısıtı vardır.',
      misconception:
        'Her şeyi göğe göndermek daha iyi. Değil: kısıtı olan bir iş için gökyüzü her zaman yanlış seçimdir.',
      firstMove: 'Her yük için sor: bekleyebilir mi? Bekleyemeyen iş için olmayan zaman hiçbir seçenekte yoktur.',
      hints: [
        'Sabrı az olan yükler yalnızca en kısa yola konabilir.',
        'Yer ucuz ve anında; gökyüzü geniş ama taşıma maliyetli.',
        'Özel işi yere, sıradan yükü gökyüzüne, kalanı araya.',
      ],
    },
    {
      principle:
        'The right place is not the cheapest place. It is the place that fits the constraint. Every workload has its own.',
      misconception:
        'Sending everything to the sky is better. It is not: for a constrained job the sky is always the wrong answer.',
      firstMove: 'For each payload ask whether it can wait. For the ones that cannot, time is the one thing no route can supply.',
      hints: [
        'Payloads with no patience only fit the shortest route.',
        'Local is cheap and immediate; the sky is roomy but pays a transport delay.',
        'Private work local, bulk work to the sky, the rest in between.',
      ],
    },
  ),

  // ===== Region V — Collective Gardens =================================
  'r5-trail-routing': L(
    {
      principle:
        'Yerel kural değişince daha önce öğrenilmiş çözüm de geçersizleşir. Topluluk yeniden öğrenmek zorundadır.',
      misconception:
        'Eski yol en güçlü izi taşıdığı için kullanılmaya devam eder. Oysa artık kullanılabilir değil.',
      firstMove: 'Yolu kapattığında geriye neyin kaldığını sor; sonra yeni bir iz kur.',
      hints: [
        'En güçlü iz, kapanmış olan yoldadır.',
        'Yeni iz kurmak eskisinin yerini almaz; ikisi birden yürür.',
        'İşi ikinci bir taraça dağıt; iki taraç da eşit yükü taşımalı.',
      ],
    },
    {
      principle:
        'When the local rule changes, a solution learned under the old rule stops being valid. The colony has to learn again.',
      misconception:
        'The old route still carries the strongest scent, so the colony keeps using it. It can no longer use it at all.',
      firstMove: 'Ask what is left once the route is closed, then lay a new trail.',
      hints: [
        'The strongest scent is on the route that is now closed.',
        'Laying a new trail does not replace the old one. Both run at once.',
        'Spread the load to a second terrace so both carry an equal share.',
      ],
    },
  ),

  'r5-dance-floor': L(
    {
      principle:
        'Paylaşım kısa bir gecikmeyi öder ve daha çok kaynak geri getirir. Hesap bunu kapatır.',
      misconception:
        'Dans alanını açmak zaman kaybıdır, o yüzden kapalı kalmalıdır. Kapalıyken kaynak bulma yavaşlar.',
      firstMove: 'Açık ve kapalı halin topladığı kaynağı karşılaştır; gecikme bedelini de gör.',
      hints: [
        'Açık halde kol işleri sırayla taşır; kapalı halde her kol kendi başına arar.',
        'Gecikme bir kez ödenir, kazanç her iş için alınır.',
        'Her iki birimlik yükü paylaşımlı yere koy.',
      ],
    },
    {
      principle:
        'Sharing pays a short delay and returns more resource. The arithmetic works out.',
      misconception:
        'Opening the floor costs time, so it should stay shut. Shut, the colony finds food more slowly.',
      firstMove: 'Compare what the colony gathers open against shut, and see the cost of the delay too.',
      hints: [
        'Open, the lanes carry jobs in sequence. Shut, every lane searches alone.',
        'The delay is paid once. The gain is collected on every job.',
        'Put both two-unit loads on the shared lane.',
      ],
    },
  ),

  // ===== Region VI — Observer's Mirrors ================================
  'r6-lens-layers': L(
    {
      principle:
        'Her mercek bir şeyi gösterir ve başka bir şeyi gizler. Hiçbiri tümünü göstermez.',
      misconception:
        'Göremedim diye orada bir şey yok. Bazen orada vardır; sadece bu mercek göstermiyor.',
      firstMove: 'Bir hücreyi seç, sonra merceği değiştir ve aynı hücrede neyin değiştiğine bak.',
      hints: [
        'Karanlık hücreler, gözlenmemiş olmak zorunda değildir.',
        'Bir mercekle gördüğünü başka bir mercekle doğrula.',
        'Her hücreyi gördüğünü ya da varsaydığını açıkça işaretle.',
      ],
    },
    {
      principle:
        'Every lens shows something and hides something else. None of them shows everything.',
      misconception:
        'Not being able to see it does not mean it is not there. Sometimes it is, and this lens simply cannot show it.',
      firstMove: 'Pick one cell, change the lens, and watch what changes in that same cell.',
      hints: [
        'A dark cell does not have to be an unobserved one.',
        'Confirm what one lens showed you with a different lens.',
        'Mark every cell as either seen or assumed, and say which.',
      ],
    },
  ),

  'r6-passage-model': L(
    {
      principle:
        'Görmediğin yeri doldurmak model kurmaktır. Modelin nerede gördüğünün bittiğini bilmek modelin kendisidir.',
      misconception:
        'Doldurduğun hücreler de ölçülmüş gibi davranıyor. Oysa onlar bir varsayım, olmuş bitmiş bir gerçek gibi sunuluyor.',
      firstMove: 'Göremediğin hücreleri işaretle; tahminlerini gözlem gibi sunmak zorunda değilsin.',
      hints: [
        'Varsaydığın her hücre, doğrulanmamış bir iddiadır.',
        'Bir hücreyi gerçekten gözledin mi, yoksa yerini doldurdun mu?',
        'Ölçtüğün hücreleri ve varsaydığın hücreleri ayrı tut.',
      ],
    },
    {
      principle:
        'Filling in what you did not see is how you build a model. Knowing where your seeing stopped is the model itself.',
      misconception:
        'The cells you filled in behave as if they were measured. They are guesses, presented as finished facts.',
      firstMove: 'Mark the cells you could not see. Nothing obliges you to present a guess as an observation.',
      hints: [
        'Every assumed cell is an unverified claim.',
        'Did you actually observe that cell, or did you fill it in?',
        'Keep the measured cells and the assumed cells apart.',
      ],
    },
  ),

  'r6-counterfactual': L(
    {
      principle:
        'Önizleme bir tahmindir. Değerini, ne kadar yanıldığını ölçtüğünde kazanır.',
      misconception:
        'Tahminim doğru çıktı, önizleme de doğruymuş. İkisi farklı iddialar ve birbirini doğrulamaz.',
      firstMove: 'İki dalın tahminini yan yana koy ve aradaki farkı önce sen hesapla.',
      hints: [
        'İki dal arasındaki fark, birinin diğerinden ne kadar iyi olduğunu gösterir.',
        'Önizleme ile gerçek arasındaki farkı saklama; o fark öğrenmenin maliyetidir.',
        'Hangisini deneyeceksin? Sonra tahminini gerçekle karşılaştır.',
      ],
    },
    {
      principle:
        'A preview is a guess. It becomes worth something only once you measure how wrong it was.',
      misconception:
        'My guess was right, so the preview was right. They are two separate claims and neither verifies the other.',
      firstMove: 'Put the two predictions side by side and work out the gap yourself first.',
      hints: [
        'The gap between the two branches is how much better one is than the other.',
        'Do not hide the difference between the preview and what happened. That gap is the cost of learning.',
        'Which one will you try? Then compare the prediction with the real result.',
      ],
    },
  ),

  // ===== Region VII — Valley of Living Machines ========================
  'r7-water-model': L(
    {
      principle:
        'Suyun modelini kurmak, gördüğünden emin olmak değildir. Emin olmadığın yerleri işaretlemektir.',
      misconception:
        'Modelim gördüğümden çok daha emin. O fazla eminlik ölçülmüş bir şey değil.',
      firstMove: 'Modelindeki hücreleri tek tek sor: bunu gerçekten gördüm mü?',
      hints: [
        'Model, gözleminin üstüne kurulan bir varsayımdır.',
        'Bir hücreyi doğrulamadan modeline kesinlikle yazma.',
        'Gördüğün hücreyi işaretle ve kalanını varsayım olarak bırak.',
      ],
    },
    {
      principle:
        'Building a model of the water is not being certain of what you saw. It is marking where you are not certain.',
      misconception:
        'My model is far more certain than I am. That extra certainty was never measured.',
      firstMove: 'Ask about each cell in your model one at a time: did I actually see this?',
      hints: [
        'A model is an assumption built on top of an observation.',
        'Do not write a cell into the model as certain before you have verified it.',
        'Mark the cells you saw; leave the rest marked as assumed.',
      ],
    },
  ),

  'r7-pump-diagnosis': L(
    {
      principle:
        'En gürültülü sinyal arıza değildir. Teşhis, okumaları açıklayan en az aday sayısına indirgidir.',
      misconception:
        'En çok dedikodusu yapılan yerde arıza oradadır. Genellikle arıza, en çok konuşan yerin başka bir yerindedir.',
      firstMove: 'Bir sensör koy ve okumanın hangi adayları dışladığını izle.',
      hints: [
        'Her sensör en az bir adayı eler.',
        'Üç sensörün en az bir arızayı açıkça dışladığını görmelisin.',
        'Aday tam olarak bir taneye düşene kadar okumaya devam et.',
      ],
    },
    {
      principle:
        'The loudest signal is not the fault. A diagnosis is a search for the fewest candidates that still explain every reading.',
      misconception:
        'The noisiest place is the fault. More often the fault sits somewhere the noise is not coming from.',
      firstMove: 'Place one sensor and watch which candidates the reading eliminates.',
      hints: [
        'Every sensor eliminates at least one candidate.',
        'Three sensors should visibly rule out at least one fault.',
        'Keep reading until exactly one candidate is left.',
      ],
    },
  ),

  'r7-two-options': L(
    {
      principle:
        'İki seçeneği karşılaştırmak ile birini seçmek ayrı işler. Farkı ölçmeden verilen karar yalnızca bir tahmindir.',
      misconception:
        'Onayladığım seçenek doğru olduğu için farkı ölçmem gerekmez. Fark tam da ölçülmesi gereken şeydir.',
      firstMove: 'İki tahmini yan yana koy ve onaylamadan önce aradaki farkı hesapla.',
      hints: [
        'Kararlı seçenek yavaştır, ani seçenek hızlıdır. İkisi de bir maliyet taşır.',
        'Ölçtüğün fark, tahmininin ne kadar güvenilir olduğunu anlatır.',
        'Birini onayla, sonra tahmin ettiğin ile gerçekleşeni karşılaştır.',
      ],
    },
    {
      principle:
        'Comparing two options and choosing one are separate acts. A decision made without measuring the gap is only a guess.',
      misconception:
        'Since I approved the right option, I do not need to measure the gap. The gap is precisely what needs measuring.',
      firstMove: 'Put the two predictions side by side and compute the gap before approving anything.',
      hints: [
        'The steady option is slow and the surging one is fast. Both carry a cost.',
        'The difference you measure is a statement about how much you can trust your prediction.',
        'Approve one, then compare what you predicted with what happened.',
      ],
    },
  ),

  'r7-helper-design': L(
    {
      principle:
        'Algı, enerji ve karar ayrı katmanlardır. Üçü birleşmeden hiçbir şey hedefe ulaşamaz.',
      misconception:
        'Kol güçlü olduğu için ulaşır. Ulaşamaz; son adım iki şeyi birden beklediği için hiçbir zaman açılmaz.',
      firstMove: 'Hangi adım birden fazla şey bekliyor? O adım en sona kalmak zorunda.',
      hints: [
        'İki girdisi olan adım, ikisini de bekler.',
        'Güç ile karar birbirinin yerine geçemez; ikisi de gerekir.',
        'Önce algı, sonra hem güç hem karar, en son ulaşma.',
      ],
    },
    {
      principle:
        'Perception, power and decision are separate layers. Until all three combine, nothing reaches the target.',
      misconception:
        'The arm will reach because it is strong. It will not, because the last joint waits on two things at once.',
      firstMove: 'Find the step that waits on more than one thing. That step has to come last.',
      hints: [
        'A step with two inputs waits for both of them.',
        'Power and decision cannot substitute for each other. Both are required.',
        'Perception first, then power and decision together, then the reach.',
      ],
    },
  ),

  // ===== Cross-region puzzles =========================================
  'cross-x1': L(
    {
      principle:
        'Bir arıza tek bir yerde değildir. İzini sürmek için önce nerede olmadığını bilmen gerekir.',
      misconception:
        'Sızıntıyı gördüğüm yerde arıza oradadır. Genellikle gördüğün yer, arızanın olduğu değildir.',
      firstMove: 'Sızıntıyı ortaya çıkar; taşımadan önce ne olduğunu gör.',
      hints: [
        'Dar yolun kabul ettiği yük, geniş yolun kabul ettiğinden azdır.',
        'Parçayı taşımadan önce sızıntıyı görmen gerekiyor.',
        'Her iki parçayı da dar yoldan geçir; geniş olanı kullanma.',
      ],
    },
    {
      principle:
        'A fault is not in one place. To trace it you first have to know where it is not.',
      misconception:
        'The fault is where I saw the leak. More often the leak marks a place the fault is not.',
      firstMove: 'Reveal the leak before you carry anything; know what you are dealing with first.',
      hints: [
        'The narrow route carries less than the wide one does.',
        'You have to reveal the leak before the material moves.',
        'Take both parts through the narrow route. Do not use the wide one.',
      ],
    },
  ),

  'cross-x2': L(
    {
      principle:
        'Bayat bir kayıt üzerine kurulan karar, dünyanın güncel hali hakkında bilgi taşımaz.',
      misconception:
        'Kayıt geçmişte doğruydu, öyleyse şimdi de doğrudur. Doğruymuş olması bugün geçerli olduğu anlamına gelmez.',
      firstMove: 'Karar vermeden önce kaydın tazeliğini denetle.',
      hints: [
        'Kayıt dünyadan önce yazılmış olabilir.',
        'Şimdi ile bekle arasındaki fark, senin tahmininle gerçeğin arasındaki farktır.',
        'Kanıt gelene kadar hiçbir şeyi değiştirmeyen seçeneği seç.',
      ],
    },
    {
      principle:
        'A decision built on a stale record carries no information about the world as it is now.',
      misconception:
        'The record was true once, so it is true now. Having been true is not the same as being current.',
      firstMove: 'Audit the record for freshness before you decide anything.',
      hints: [
        'The record may have been written before the world changed.',
        'The gap between acting now and waiting is the gap between your prediction and the truth.',
        'Choose the option that changes nothing until the evidence arrives.',
      ],
    },
  ),

  'cross-x3': L(
    {
      principle:
        'Doğru yoldaki bir sinyal, zamanında gelmiyorsa geç sayılır. Doğruluk ve zaman iki ayrı ölçüttür.',
      misconception:
        'Sinyal doğru yolda olduğu için başardı. Geç kaldığı için başaramadı.',
      firstMove: 'Sıralamanın hangi adımı beklemeyi gerektirdiğini bul.',
      hints: [
        'Akış, yerleştirme yapılmadan sinyal üretemez.',
        'Sinyal en son adımdır ama sırada tek başına değil, hazır bir zincirin sonudur.',
        'Akış, sonra yerleştirme, sonra sinyal: tam olarak bu sıra.',
      ],
    },
    {
      principle:
        'A signal on the right route that arrives late has still failed. Correctness and timing are two separate measures.',
      misconception:
        'The signal was on the right route, so it counted. It arrived late, so it did not.',
      firstMove: 'Find which step in the order is waiting for something.',
      hints: [
        'No signal exists before the work has been placed.',
        'The signal is the last step, but in the order it is the end of a prepared chain, not a start.',
        'Flow, then place, then signal: exactly that order.',
      ],
    },
  ),

  // ===== Finale =======================================================
  'finale-synthesis-tree': L(
    {
      principle:
        'Belirti ile arıza farklı yerlerdedir. En çok bağıran şey, en çok konuşan şey değildir.',
      misconception:
        'En büyük ses arızayı gösterir. Genellikle arıza, kendini göstermekten çok daha sessizdir.',
      firstMove: 'Deneyi seç. Gürültüye güvenerek hiçbir şey öğrenemezsin.',
      hints: [
        'Ölçmeden onaylanan karar yalnızca bir temennidir.',
        'İki olasılıktan birini test etmeden seçemezsin.',
        'Tahmin ettiğin ile ölçtüğün arasındaki farkı saklama.',
      ],
    },
    {
      principle:
        'The symptom and the fault live in different places. The loudest thing is not the truest thing.',
      misconception:
        'The biggest noise points at the fault. More often the fault is far quieter than its symptom.',
      firstMove: 'Choose to run the test. Trusting the noise teaches you nothing.',
      hints: [
        'A decision approved without a measurement is only a hope.',
        'You cannot choose between two candidates without testing one.',
        'Do not hide the difference between what you predicted and what you measured.',
      ],
    },
  ),
};

/** Returns undefined for an unknown stage; the panel degrades to no lesson. */
export function lessonFor(stageId: string): StageLesson | undefined {
  return LESSONS[stageId];
}

/** Tier `n` (1-based) of a stage's escalating hints, or undefined if unavailable.
 *  Tiers are clamped into range so a stale save asking for tier 0 or 9 still
 *  gets the weakest or strongest real hint instead of nothing. */
export function hintFor(stageId: string, tier: number): StageLesson['hints'][number] | undefined {
  const lesson = LESSONS[stageId];
  if (!lesson) return undefined;
  const clamped = Math.max(1, Math.min(lesson.hints.length, Math.round(tier)));
  return lesson.hints[clamped - 1];
}