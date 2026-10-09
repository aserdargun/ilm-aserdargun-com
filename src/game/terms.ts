import type { LocalizedText } from '../types/catalog';
import { APPLICATIONS } from '../catalog/applications';

/**
 * The vocabulary layer.
 *
 * `lessons.ts` teaches the *idea* behind a stage and `applications.ts`
 * describes the real application it adapts. Neither one names the words the
 * subject actually uses. A player who finishes the loom stage has understood
 * makespan and lane balance, but has never been told what a kernel launch or a
 * warp is — so the game teaches a concept while withholding the language that
 * makes the concept usable outside it.
 *
 * This module closes that gap: for each of the thirty-three applications, four
 * terms taken from that application's own field, each with a plain-language
 * definition and a line saying where the player has already met it in the
 * world. The definitions are the teachable part. "Occupancy" alone teaches
 * nothing; "how much of the machine you actually managed to keep busy" is the
 * same fact in a form the player can carry somewhere else.
 *
 * Two rules keep this honest:
 *
 * 1. A term must belong to the application it is filed under. Nothing here is
 *    invented to fill a row; `tests/terms.test.ts` fails on an empty or
 *    duplicated entry rather than on taste, and the field membership is
 *    checked by hand against the application's own published description.
 * 2. Turkish is written as Turkish, the same rule `lessons.ts` and `spark.ts`
 *    already follow. A term the Turkish literature spells differently carries
 *    that spelling; the loanword stays a loanword where Turkish actually keeps
 *    it (`kernel`, `warp`, `prefill`). The `term` itself is left in the field's
 *    own spelling because that is how a player will meet it in the source
 *    application — translating it would break the lookup, not enable it.
 */

export interface AppTerm {
  /** Canonical technical term, in the spelling the field uses. */
  term: string;
  /** What it means, stated without jargon. */
  meaning: LocalizedText;
  /** Where the player has already seen it in this world. */
  inWorld: LocalizedText;
}

const T = (term: string, tr: string, en: string, worldTr: string, worldEn: string): AppTerm => ({
  term,
  meaning: { tr, en },
  inWorld: { tr: worldTr, en: worldEn },
});

/** Keyed by application code. `tests/terms.test.ts` requires all 33. */
export const TERMS: Readonly<Record<string, readonly AppTerm[]>> = {
  // ===== Cartographer's Terrace =======================================
  AIA: [
    T(
      'benchmark',
      'Herkese aynı biçimde sorulan sabit bir soru; iki cevabın karşılaştırılabilmesinin nedeni budur.',
      'A fixed question everyone answers the same way, so two answers can be compared.',
      'Teras masalarının hepsi aynı soruyu soruyor.',
      'Every desk on the terrace asks the same question.',
    ),
    T(
      'evidence',
      'Bir iddianın üzerinde durduğu gözlem; iddianın kendisinden ayrı olarak saklanır.',
      'The observation a claim rests on, kept separate from the claim itself.',
      'Keşifcinin bulduğu ile terasın dediği ayrı yerde durur.',
      'What the scout found and what the terrace concluded are kept apart.',
    ),
    T(
      'coverage',
      'Bir alanın gerçekte ne kadarının bakıldığı.',
      'Which part of a space has actually been looked at.',
      'Haritada boyanmamış alanlar hâlâ sorulmamış sorulardır.',
      'The unpainted part of the map is the part nobody asked about yet.',
    ),
    T(
      'ecosystem',
      'Bir projenin çalışabilmesi için ihtiyaç duyduğu araçlar, lisanslar ve alışkanlıklar.',
      'The tools, licences and conventions a project needs to work at all.',
      'Tek bir keşifci, arkasındaki taraflar zincirinden anlam kazanır.',
      'One scout only means something against the chain of parties behind it.',
    ),
  ],

  POL: [
    T(
      'type system',
      'Hangi değerlerin birleştirilebileceğine ve birleşmenin ne anlama geldiğine karar veren kurallar.',
      'The rules that decide which values may be combined, and what the combination means.',
      'İki farklı yazım aynı geçidi tuttuğunda, tür sistemi ikisini birbirine uygun sayar.',
      'When two different spellings hold the same crossing, the type system counts them as compatible.',
    ),
    T(
      'memory model',
      'Bir verinin kime ait olduğuna ve ne zaman kaybolabileceğine dair kurallar.',
      'The rules about who owns a piece of data and when it is allowed to disappear.',
      'Adımın kendinden önceki bir adımın bıraktığı veriye bakması bu kurallara dayanır.',
      'A step reading what an earlier step left behind depends on these rules.',
    ),
    T(
      'paradigm',
      'Bir özelliğin değil, bir programı yazmanın bütün biçimi.',
      'A whole way of writing a program, not a single feature of one.',
      'İki köprü aynı işi yapar ama ikisi de birer bütün yöntemdir.',
      'Two bridges doing the same work are each a whole method, not a feature.',
    ),
    T(
      'concurrency',
      'Aynı anda yürüyen birden çok hesaplama ve bunların birlikte dokunabileceği alanların kuralları.',
      'Several computations in flight at once, and the rules for what they may touch together.',
      'Mekiğin aşamaları sırayla değil, birbirinin beklediği bir düzende koşar.',
      'The caravan stages run in an order where each waits on another.',
    ),
  ],

  // ===== Flow Foundry ==================================================
  GPU: [
    T(
      'kernel',
      'İşlemci için yazılmış, belirli bir işi yapmak üzere çağrılan tek bir program.',
      'One program written for the processor, launched to do a specific job.',
      'Tezgâhın bir kolu tek bir işi baştan sona kendi işi olarak dokur.',
      'One loom arm weaves one job from start to finish as its own work.',
    ),
    T(
      'occupancy',
      'Makinenin ne kadarını gerçekte meşgul tutabildiğin.',
      'How much of the machine you actually managed to keep busy.',
      'Boş yuva sayısı, o kolun ne kadarının boş kaldığını gösterir.',
      'The empty slots show how much of that arm stayed idle.',
    ),
    T(
      'coalesced access',
      'Yan yana duran işçilerin yan yana adres okuması; böylece tek bir taşıma birden çok işe yarar.',
      'Neighbouring lanes reading neighbouring addresses, so one fetch serves many.',
      'Mekiğler yan yana okuduğunda tek taşıma birden çok işe yarar.',
      'Shuttles reading side by side make one haul serve several jobs.',
    ),
    T(
      'makespan',
      'En yavaş işçinin bitirdiği süre; tüm işin süresi de budur.',
      'The time the slowest lane takes, which is the time the whole job takes.',
      'Tezgâh en yavaş kol bitene kadar bekler.',
      'The loom waits for its slowest arm.',
    ),
  ],

  GEX: [
    T(
      'warp',
      'Ne yapmayı seçerlerse seçsin birlikte iş çıkaran sabit işçi grubu.',
      'The fixed group of lanes that issues work together, whatever each lane decides to do.',
      'Birlikte çıkan mekiğler grubu, biri ayrılsa da birlikte çıkar.',
      'A group of shuttles leaves together even when one of them takes another path.',
    ),
    T(
      'launch',
      'Bir programı aygıta iş için çağırmak; bunun da kendine ait bir maliyeti vardır.',
      'The call that puts one kernel on the device; it has a cost of its own.',
      'Her yeni mekiğin kalkışı ayrı bir giriş ücretidir.',
      'Every new shuttle lifting off pays its own entry cost.',
    ),
    T(
      'tile',
      'Bir matrisin tek parça hâlinde ele alınan bölümü; böylece iş donanımın tercih ettiği ölçüye uyar.',
      'A block of a matrix handled as one unit so the work fits what the hardware prefers.',
      'Dokuma yüzeyi parçaya bölünerek tek elle taşınabilecek hâle gelir.',
      'The weave surface is broken into pieces small enough for one pass to carry.',
    ),
    T(
      'mask',
      'Bir gruptaki işçilerin bu turda hangisinin etkin, hangisinin bekletildiği.',
      'Which lanes in a group are active this cycle, and which are held back.',
      'Bir turda yalnızca işi olan mekiğler ilerler.',
      'Only the shuttles with work move in a given turn.',
    ),
  ],

  LLM: [
    T(
      'KV cache',
      'Dikkat durumu; her yeni adım için önceki her şeyin yeniden hesaplanmamasını sağlar.',
      'Kept attention state so each new token does not recompute everything before it.',
      'Oda, gelen her isteğin öncesini not eder; tekrar hesaplamaz.',
      'The chamber notes what came before each request instead of recomputing it.',
    ),
    T(
      'prefill',
      'Gelen istemin tamamının tek seferde işlendiği, ilk yanıttan önceki evre.',
      'The phase that processes the whole incoming prompt at once before the first answer.',
      'Mekiğin yüklenme turu: kapı, bütün yükü bir kez alır.',
      'The caravan’s loading turn: the gate takes the whole load at once.',
    ),
    T(
      'routing',
      'Bir isteği en büyük olana değil, biçimine uygun olan yere göndermek.',
      'Sending a request to the place built for its shape rather than the largest one.',
      'Küçük talep küçük odaya; büyük olan başka bir yere.',
      'A small request to a small chamber; the large one somewhere else.',
    ),
    T(
      'throughput',
      'Birim zamanda biten iş miktarı; tek bir işin ne kadar hızlı hissettirdiğiyle aynı şey değildir.',
      'How much work finished per unit of time, which is not the same as how fast one job felt.',
      'Tezgâhın bir turda kaç iş bitirdiği, tek bir işin hissiyle aynı şey değildir.',
      'How many jobs the loom finishes per round is not how fast one job felt.',
    ),
  ],

  TFL: [
    T(
      'time to first token',
      'Hiçbir şey gelmeden önce geçen bekleme süresi.',
      'How long the wait is before anything comes back at all.',
      'Mekiğin kapıdan ilk çıkışına kadar geçen sessizlik.',
      'The silence before the first shuttle comes through the gate.',
    ),
    T(
      'queueing',
      'Boş yer bekleyen istekler; burada geçen süre, hesaplama süresi değildir.',
      'Requests waiting for a free slot; time spent here is not compute time.',
      'Kapının önünde bekleyen sıra, iş süresi sayılmaz.',
      'Time spent waiting in line is not counted as working time.',
    ),
    T(
      'decode',
      'Yanıtı bir adım bir adım üretmek; her adım bir öncekine bağlıdır.',
      'Producing the answer one step at a time, each step depending on the one before.',
      'Her mekiğin çıkabilmesi için bir öncekinin çıkması gerekir.',
      'No shuttle may leave before the one ahead of it has left.',
    ),
    T(
      'batching',
      'Birlikte bir geçişe sığan işleri birleştirmek; bekleme karşılığında ortak maliyet alışverişi.',
      'Grouping work that can share a pass, which trades waiting for shared cost.',
      'Birlikte taşınan yük ucuzdur ama bir yuvayı bekletir.',
      'A shared haul is cheaper but makes one slot wait.',
    ),
  ],

  // ===== City of Memory and Council ====================================
  HNS: [
    T(
      'layer',
      'Üst üste binen sorumluluklardan biri; her biri altından gelen sinyali bekler.',
      'One responsibility stacked on another, each waiting for the one below it to signal.',
      'Yedi oda üst üste; her biri altındakinin sinyalini bekler.',
      'Seven rooms stacked; each waits for the signal from the one below.',
    ),
    T(
      'lifecycle',
      'Bir şeyin bulunabileceği durumlar ve bu durumlar arasında yasal olan geçişler.',
      'The states something may be in, and which moves between them are legal.',
      'Duraklat, görev değiştir, sürdür: başka bir sıra yasaktır.',
      'Pause, retask, resume — and no other order.',
    ),
    T(
      'observability',
      'Sonradan tahmin yürütmeden ne olduğunu söyleyebilmek.',
      'Being able to say what happened without having to guess afterwards.',
      'Sonradan okunabilen kayıt, tahminle geçmez.',
      'A record readable afterwards settles the question instead of a guess.',
    ),
    T(
      'governance',
      'Neyin, kimin tarafından yapılacağına karar vermek ve o kararın kaydını tutmak.',
      'Deciding what may be done, by whom, and keeping the record of that decision.',
      'Kimse kendi iznini kendi vermez.',
      'Nobody grants themselves their own permission.',
    ),
  ],

  ARL: [
    T(
      'trace',
      'Bir koşunun adım adım gerçekte ne yaptığının sıralı kaydı.',
      'The ordered record of what a run actually did, step by step.',
      'Tezgâhta her adımın nereye konduğu görülür.',
      'On the bench you can see where every step landed.',
    ),
    T(
      'replay',
      'Aynı kaydı yeniden koşturup aynı sonucu beklemek.',
      'Running the same trace again and expecting the same result.',
      'Aynı iş iki kez koşturulduğunda aynı yere varır.',
      'The same run twice ends in the same place.',
    ),
    T(
      'tool call',
      'Çalışandan dışarıya giden, geri dönüşü olan tek bir istek.',
      'A single request from the worker to the outside, with a result that comes back.',
      'Elden çıkan her istek bir dönüşle geri gelir.',
      'Every request that leaves a hand comes back with a return.',
    ),
    T(
      'sandbox',
      'Gerçeğe dokunmadan bir eylemin denendiği yer.',
      'A place where an action can be tried without touching what is real.',
      'Bütün eylemler atölyenin içinde kalır.',
      'Every action stays inside the workshop.',
    ),
  ],

  DPL: [
    T(
      'decision point',
      'Koşunun düz gitmek yerine dallanabileceği yer.',
      'A place where the run can branch instead of continuing straight.',
      'Kavşak: dört kapıdan biri seçilir.',
      'The junction: one of four doors is chosen.',
    ),
    T(
      'abstain',
      'Süreçten çıkmadan yanıt vermekten vazgeçmek.',
      'Declining to answer while still staying inside the process.',
      'Çekimser kalmak da bir karardır.',
      'Withholding judgement is itself a decision.',
    ),
    T(
      'approval',
      'Bir eylemin geçmesinden önce bir kişinin evet demesi ve bunun kaydının tutulması.',
      'A person saying yes before an action proceeds, and it being recorded.',
      'Onay, karardan sonra değil kararın parçası olarak geçer.',
      'Approval is part of the decision, not a step after it.',
    ),
    T(
      'reversibility',
      'Bir karar verildikten sonra geri alınmasının ne kadar ucuza geldiği.',
      'How cheaply a decision can be undone once it has been taken.',
      'Geri alınabilir olan, önce denenebilir.',
      'What can be undone is worth trying first.',
    ),
  ],

  CUL: [
    T(
      'grounding',
      'Bir talimatı, ekranda gerçekte gösterdiği yere eşlemek.',
      'Matching an instruction to the actual place on screen it refers to.',
      'Emin bir el, yanlış pencereyi de ustalıkla açabilir.',
      'A confident hand can still open the wrong window.',
    ),
    T(
      'targeting',
      'Hiçbir şey kıpırdamadan önce neyin kıpıracağını kesin olarak söylemek.',
      'Naming precisely what should move, before anything moves.',
      'Hedefi önce söylemek, sonra eli oynatmak.',
      'Name the target first, then move the hand.',
    ),
    T(
      'result checking',
      'Kıpırdayan şeyi, kıpırdaması amaçlanan şeyle karşılaştırmak.',
      'Comparing what moved with what was meant to move.',
      'El bildirdiği kapıyı açar; sen pencereyi sorarsın.',
      'The hand reports the door it opened, while you asked about the window.',
    ),
    T(
      'verification',
      'Bir eylemi yalnızca yapılmış olmaktan çıkarıp güvenilir kılan adım.',
      'The step that makes an action trustworthy instead of merely done.',
      'Koştuğunu görmek, doğru olduğunu görmek değildir.',
      'Seeing that it ran is not the same as seeing that it was right.',
    ),
  ],

  AOS: [
    T(
      'supervision',
      'Çalışan bir süreci, bozmadan müdahale edebilecek kadar yakından izlemek.',
      'Watching a running process closely enough to intervene without corrupting it.',
      'Duraklatıp görev değiştirmek, onu bozmadan müdahale etmektir.',
      'Pausing and retasking is intervening without corrupting.',
    ),
    T(
      'isolation',
      'Bir çalışanı ayırmak, böylece zararının dışarıya ulaşamamasını sağlamak.',
      'Separating a worker so its damage cannot reach anything outside it.',
      'İşçinin hatası atölyeyle sınırlı kalır.',
      'A worker’s failure stays inside the workshop.',
    ),
    T(
      'state',
      'Çalışanın şu anda bildiği şey; kendi kafasından başka bir yerde yazılı hâlde.',
      'What the worker knows right now, written somewhere other than its own head.',
      'Durum açık bir yerde durur; hafızada değil.',
      'State sits somewhere open rather than inside the worker.',
    ),
    T(
      'human control',
      'Döngüde bir kişinin, işi gerçekten durdurabilecek yetkiyle bulunması.',
      'Keeping a person in the loop with the actual authority to stop the work.',
      'Durduran kişi gerçekten durdurabilir.',
      'The person who stops it can actually stop it.',
    ),
  ],

  AGR: [
    T(
      'consensus',
      'Taraflar arasında varılan uzlaşı; doğruluğu hakkında hiçbir şey söylemez.',
      'Agreement reached between positions, which says nothing about whether they are right.',
      'Halka uzlaştığını bildirir, doğru olduğunu değil.',
      'The ring reports convergence, not correctness.',
    ),
    T(
      'divergence',
      'Tarafların ayrıldığı ve farkın görünür hâle geldiği an.',
      'The moment positions stop agreeing and the difference becomes visible.',
      'Karşı çıkan koltuğun bir kez daha çağrılması.',
      'The dissenting seat is invited back once.',
    ),
    T(
      'assumption',
      'Denetlenmeden doğru kabul edilen ve farkında olmadan paylaşılan şey.',
      'Something taken as true without being checked, and shared without being noticed.',
      'Yedi koltuğun ortak dediği, kimsenin açmadığı pencere.',
      'The window all seven described and none of them opened.',
    ),
    T(
      'independent answer',
      'Başkasının ne dediğini görmeden verilen yanıt; karşılaştırılmaya değer olan da budur.',
      'A reply given before seeing anyone else’s, which is the only kind worth comparing.',
      'İlk yanıtlar tek başına verilir; sonrası artık onları etkiler.',
      'The first answers are given alone; anything after them is influenced.',
    ),
  ],

  CTX: [
    T(
      'context window',
      'Bir sistemin aynı anda tutabildiği sabit miktar; sığmayan neyin dışarı itildiği.',
      'The fixed amount a system can hold at once, and what gets pushed out to fit.',
      'Fenerin karnı sabittir.',
      'The lantern’s belly is a fixed size.',
    ),
    T(
      'retrieval',
      'Bu soru için saklanan parçaların hangilerinin getirileceğine karar vermek.',
      'Choosing which stored pieces are worth bringing in for this question.',
      'Hangi kayıtların fenere gireceğine sen karar verirsin.',
      'You decide which records enter the lantern.',
    ),
    T(
      'citation',
      'Kaynağı iddia yanında taşımak, ki sonradan denetlenebilsin.',
      'Carrying the source along with the claim so it can be checked later.',
      'Alıntının kaynağı yanında taşınır.',
      'A citation travels with its source.',
    ),
    T(
      'relevance',
      'Bir parçanın sorulan soruyu yanıtlama derecesi; yalnızca konuyla ilgili olmak değil.',
      'How well a piece answers the question asked, as opposed to merely being on topic.',
      'Konuyla ilgili olmak, soruyu yanıtlamak demek değildir.',
      'Being on topic is not the same as answering the question.',
    ),
  ],

  MEM: [
    T(
      'freshness',
      'Bir kaydın dünyayı hâlâ bugünkü gibi tarif edip etmediği.',
      'Whether a record still describes the world as it is now.',
      'Kayıt kendinden emin olabilir ve yine de bayat olabilir.',
      'A record can be confident and still be outdated.',
    ),
    T(
      'versioning',
      'Hangi kaydın hangisinin yerine geçtiğini tutmak, ki eskisi güncel sanılmasın.',
      'Keeping which record replaced which, so the older one is not read as current.',
      'Eski kayıt yenisinin altında durur, yanında değil.',
      'An old record sits under its replacement, not beside it.',
    ),
    T(
      'expiry',
      'Kimse sormadan, bir kaydın ne zaman doğru olmaktan çıkacağına önceden karar vermek.',
      'Deciding in advance when a record stops being true without anyone asking.',
      'Süresi dolan kayıt kendiliğinden düşer.',
      'An expired record drops out on its own.',
    ),
    T(
      'supersession',
      'Bir kaydı değiştirirken, önce ne dediğinin tarihini korumak.',
      'Replacing a record while keeping the history of what it used to say.',
      'Düzeltmek silmek değildir; önceki hâli saklanır.',
      'Correcting is not deleting; the earlier version is kept.',
    ),
  ],

  SEC: [
    T(
      'least privilege',
      'Bir adıma gereken tam izin, fazlası olmadan vermek.',
      'Granting exactly the permission a step needs, and no more.',
      'Her mühür tek bir geçidi açar.',
      'Each seal opens a single passage.',
    ),
    T(
      'authorization',
      'Bir eylemden önce verilen izin; kim olduğunu kanıtlamaktan ayrı bir iş.',
      'Permission checked before an action, as distinct from proving who is asking.',
      'Mühür, kim olduğunu sormadan neye izin verdiğini sorar.',
      'A seal asks what is permitted, not who is asking.',
    ),
    T(
      'chain of trust',
      'Yalnızca en dar halkası kadar güçlü olan güven.',
      'Trust that is only ever as strong as its narrowest link.',
      'Yukarıda cömert bir izin, aşağıdaki dar mührün ötesinde hiçbir işe yaramaz.',
      'A generous grant upstream buys nothing past a narrow seal downstream.',
    ),
    T(
      'audit trail',
      'Sonradan okuyanın neye izin verilmiş olduğunu yeniden kurabileceği kayıt.',
      'A record kept so that a later reader can reconstruct what was allowed.',
      'Her geçiş kayda geçer.',
      'Every passage is recorded.',
    ),
  ],

  EVL: [
    T(
      'evaluation contract',
      'Bir düzeltmenin altında tutmak zorunda olduğu koşullar; sınanmadan önce yazılır.',
      'The conditions written down in advance that a fix has to hold under.',
      'Koşullar, sınanmadan önce yazılır.',
      'The conditions are written before the test, not after the failure.',
    ),
    T(
      'robustness',
      'Koşullar değiştiğinde de aynı davranışı korumak.',
      'Keeping the same behaviour when the conditions change.',
      'Tek koşulda tutan düzeltme sağlam değildir.',
      'A fix that holds for one condition has not been repaired.',
    ),
    T(
      'false confidence',
      'Önemli olan şey kötüleşirken iyileşen bir ölçüt.',
      'A metric that improves while the thing you care about gets worse.',
      'Skor yükselirken davranış bozulabilir.',
      'The score can rise while the behaviour breaks.',
    ),
    T(
      'condition coverage',
      'Onu bozabilecek durumların ne kadarının gerçekten denendiği.',
      'How many of the situations that could break it were actually tried.',
      'Adını koymadığın koşul, hatanın yaşadığı yerdir.',
      'The condition you failed to name is where the failure lives.',
    ),
  ],

  // ===== Adaptation Workshop and Cloud Harbor ==========================
  USL: [
    T(
      'LoRA',
      'Bütün modeli yeniden eğitmek yerine küçük bir ek ağırlık kümesi eğitmek.',
      'Training a small set of extra weights instead of retraining the whole model.',
      'Büyük bir makineyi yeniden kurmadan ona küçük bir ek takmak.',
      'Attaching a small part to a large machine instead of rebuilding it.',
    ),
    T(
      'adapter',
      'Eğitilmiş ek parça; ana modelin değişmeden kalması için ayrı tutulur.',
      'The trained extra piece, kept separate so the base model stays untouched.',
      'Ek parça ayrı durur; ana makine değişmez.',
      'The extra part sits separately and the base stays as it was.',
    ),
    T(
      'rank',
      'Küçük bir güncellemenin özgün davranışın ne kadarını değiştirmesine izin verildiği.',
      'How much of the original behaviour a small update is allowed to change.',
      'Dar bir yuva, az değişiklik demektir.',
      'A narrow cradle means a smaller change.',
    ),
    T(
      'generalisation',
      'Yardımcının hiç görmediği bir işi yine de yapabilmesi.',
      'Still working on an example the helper has never seen before.',
      'Hiç görmediği bir işi yapabilmek.',
      'Doing a job it has never been shown.',
    ),
  ],

  ADP: [
    T(
      'quantisation',
      'Ağırlıkları daha az bit ile saklamak; modelin yoksa sığmayacağı bir belleğe sığması için.',
      'Storing weights in fewer bits so a model fits into memory it would not otherwise need.',
      'Aynı yükü daha küçük bir kasada taşımak.',
      'Carrying the same load in a smaller crate.',
    ),
    T(
      'fine-tuning',
      'Var olan bir modeli daha dar bir iş üzerinde eğitmeyi sürdürmek.',
      'Continuing to train an existing model on a narrower task.',
      'Atölyede büyük makineye dar bir iş öğretmek.',
      'Teaching a large machine one narrow job in a workshop.',
    ),
    T(
      'parameter count',
      'Bir değişikliğin modelin ne kadarına dokunduğu.',
      'How much of the model a change actually touches.',
      'Her dişiyi değiştirmek başka bir bedeldir.',
      'Changing every gear costs something else entirely.',
    ),
    T(
      'capability vs cost',
      'Ek yeteneğin, taşınma maliyetine değip değmediği.',
      'Whether the extra capability is worth what it costs to carry.',
      'En pahalı modül her iş için doğru değildir.',
      'The most expensive module is not the right answer every time.',
    ),
  ],

  LCL: [
    T(
      'VRAM',
      'Grafik kartının üzerindeki bellek; yerel çalışmanın sert tavanıdır.',
      'The memory physically on the graphics card, which is the hard ceiling for local work.',
      'Kartın üstündeki yer, avlunun duvarıdır.',
      'The room on the card is the yard’s wall.',
    ),
    T(
      'offloading',
      'Tek bir aygıt tutamayacağında işin bir kısmını başka bir aygıta taşımak.',
      'Moving part of the work to another device when one device cannot hold it.',
      'Yük sığmıyorsa bir parçası başka yere gider.',
      'When the load does not fit, part of it goes elsewhere.',
    ),
    T(
      'latency',
      'Sonucun geri dönmesinden önceki gecikme.',
      'The delay before a result comes back.',
      'Yer yolu hızlıdır, gökyüzü yolu gecikmeli.',
      'The local lane is quick; the sky lane is delayed.',
    ),
    T(
      'privacy boundary',
      'Verinin kendi makinenden çıktığı sınır.',
      'The line past which the data leaves your own machine.',
      'Gizli iş, avludan hiç çıkmaz.',
      'A private job never leaves the yard.',
    ),
  ],

  CLD: [
    T(
      'unit price',
      'Tek birimin bedeli; çevresindeki sabit maliyet hakkında hiçbir şey söylemez.',
      'The cost of a single unit, which says nothing about the fixed cost around it.',
      'Birim ucuz olabilir, limanın açılması pahalı.',
      'A unit can be cheap while opening the harbour is not.',
    ),
    T(
      'fixed cost',
      'Ne kadar mal taşınırsa taşınır bir kez ödenen ücret.',
      'A charge paid once regardless of how much passes through.',
      'Giriş ücreti, yük ne olursa olsun bir kez ödenir.',
      'An entry fee is paid once whatever the load.',
    ),
    T(
      'egress',
      'Verinin sağlayıcıdan çıkmasının bedeli; hangi seçeneğin en ucuz göründüğünü değiştirir.',
      'The charge for data leaving a provider, which changes which option looks cheapest.',
      'Kasanın limandan çıkışı ayrıca ödenir.',
      'The crate leaving the harbour is charged separately.',
    ),
    T(
      'total cost',
      'Birim fiyatın üstüne her hazırlığın eklenmesi; karşılaştırılmaya değer tek sayı budur.',
      'The unit price plus every setup, which is the only number worth comparing.',
      'Biletlerin toplamı, seçtiğin her hazırlığın eklenmiş hâlidir.',
      'The total is every ticket plus every setup you chose to open.',
    ),
  ],

  DCL: [
    T(
      'deployment route',
      'İşi taşımanın seçilen yolu: yerel, uzak ya da karışık.',
      'The chosen way of carrying a workload: local, remote, or split.',
      'Yer mi, uzak mı, yoksa karışık mı.',
      'Local, distant, or a mixture.',
    ),
    T(
      'hard constraint',
      'Takas edilemeyecek gereklilik; bir tercihten ayrı olarak.',
      'A requirement that cannot be traded away, as opposed to a preference.',
      'Gizlilik bir tercih değil, bir sınırdır.',
      'Privacy is a limit, not a preference.',
    ),
    T(
      'capacity planning',
      'Yükü geldikten sonra değil, gelmeden önce nereye götürüleceğini seçmek.',
      'Choosing what to carry where before the load arrives, not after it does.',
      'Yük gelmeden yerini seçmek.',
      'Choosing where the freight goes before it arrives.',
    ),
    T(
      'conditional answer',
      'Hangi varsayıma bağlı olduğunu söyleyen bir öneri.',
      'A recommendation that states which assumption it depends on.',
      'Hangisinin doğru olduğu, neyi varsaydığına bağlıdır.',
      'Which one is right depends on what it assumed.',
    ),
  ],

  // ===== Collective Gardens ============================================
  SWI: [
    T(
      'stigmergy',
      'Haberleşerek değil, ortamda bırakılan izlerle uyum kurmak.',
      'Coordinating through changes left in the environment rather than through messages.',
      'Karıncalar haber göndermez; yola iz bırakır.',
      'Ants send no messages; they leave a mark in the path.',
    ),
    T(
      'local rule',
      'Her bireyin tek başına uygulayabileceği kadar basit bir kural.',
      'A rule simple enough that every individual can follow it alone.',
      'Kimse bütün bahçeyi görmez; herkes kendi kuralını bilir.',
      'Nobody sees the whole garden; each one knows only its own rule.',
    ),
    T(
      'emergence',
      'Hiçbir bireyin izlemediği ve hiçbirinin planlamadığı büyük ölçekli davranış.',
      'Large-scale behaviour that no individual is following and none of them planned.',
      'Bütün bahçenin biçimi, küçük kararların toplamından çıkar.',
      'The shape of the whole garden is the sum of the small decisions.',
    ),
    T(
      'evaporation',
      'İzlerin zamanla sönmesi, ki eski bir yol bir daha en güçlü yol olmasın.',
      'Marks fading over time so an old route stops being the strongest one.',
      'İz her saat biraz unutulur.',
      'A trail is a little more forgotten every hour.',
    ),
  ],

  ANT: [
    T(
      'pheromone',
      'Gücü, koloninin bir yolu hatırlamasını taşıyan kimyasal iz.',
      'A chemical mark whose strength carries the colony’s memory of a route.',
      'İzin, koloninin yolu hatırlamasının tek biçimidir.',
      'The trail is the only form the colony’s memory of a route takes.',
    ),
    T(
      'path integration',
      'Aynı yolu geri yürümek yerine, dönüş sayılarak eve dönmek.',
      'Returning home by counting the turns taken, rather than retracing the exact path.',
      'Dönen karınca yolu sayar, yolun kendisini değil.',
      'A returning forager counts the turns, not the path itself.',
    ),
    T(
      'reinforcement',
      'Bir yolu her kullanıldığında güçlendirmek, her kullanılmadığında zayıflatmak.',
      'Making a route stronger each time it is used, and weaker each time it is not.',
      'Yürünen yol güçlenir, yürünmeyen solar.',
      'A walked path strengthens; an unwalked one fades.',
    ),
    T(
      'stuck route',
      'Hiçbir yere çıkmayan en güçlü iz; koloninin onu yalnızca unutarak terk edebildiği durum.',
      'The strongest trail leading nowhere, which the colony can only leave by forgetting.',
      'En güçlü iz, kesildiğinde koloniyi durdurur.',
      'The strongest trail, once cut, stops the colony.',
    ),
  ],

  BEE: [
    T(
      'waggle dance',
      'Bunu izleyen arıların okuduğu, yönü ve mesafeyi kodlayan hareket.',
      'A movement that encodes a direction and a distance, read by the watching bees.',
      'Dans, bulduğu çiçeğin yerini başkalarına söyler.',
      'The dance tells the others where the flower is.',
    ),
    T(
      'recruitment',
      'Şimdi zaman kaybetmeyi ödeyerek sonra daha çok arı göndermek.',
      'Paying a delay now to send more bees later.',
      'Dans zaman kaybettirir ama yolculuğu kazandırır.',
      'Dancing costs time and buys the trip.',
    ),
    T(
      'information sharing',
      'Tek bir bireyin keşfinin bütün koloninin başlangıç noktası hâline gelmesi.',
      'One individual’s discovery becoming the whole colony’s starting point.',
      'Dans eden bir arı, diğerlerinin bulduğunu da bulmuş oluyor.',
      'One dancing bee hands the others what it found.',
    ),
    T(
      'division of labour',
      'Farklı arıların farklı işler yapmasıyla koloninin daha iyi olması.',
      'The colony doing better by having different bees do different things.',
      'Herkesin her işi yapmasından iyi olan, paylaşılmış iştir.',
      'Shared work beats every bee doing everything.',
    ),
  ],

  // ===== Observer's Mirrors ============================================
  VIS: [
    T(
      'convolution',
      'Bir görüntünün üzerinde kayan, her noktada küçük bir çevreyi okuyan filtre.',
      'A filter slid across an image, reading a small neighbourhood at every position.',
      'Kenar merceği her yerde küçük bir çevreye bakar.',
      'The edge lens reads a small neighbourhood at every position.',
    ),
    T(
      'receptive field',
      'Birimin görüntünün ne kadarını gerçekte görebildiği.',
      'How much of the image one unit actually gets to see.',
      'Merceğin erişimi, gördüğünü sandığından dardır.',
      'The lens reaches less than you assume it does.',
    ),
    T(
      'monocular depth cue',
      'Tek bir görüntüden bir şeyin uzakta olduğunu söyleyen ipucu.',
      'A hint from a single image that something is far away.',
      'Derinlik merceği az ışıkta bu ipuçlarını kaybeder.',
      'The depth lens loses these cues in poor light.',
    ),
    T(
      'occlusion',
      'Bir şeyin daha yakın bir nesnenin arkasında kalması, dolayısıyla hiç erişilememesi.',
      'Something being hidden behind a nearer object, and therefore simply unavailable.',
      'Bir formun arkasında kalan hücreler boş okunur.',
      'Cells behind a form read as empty.',
    ),
  ],

  CVL: [
    T(
      'answer key',
      'Doğru çıktının bilindiği referans; yanlış cevabı eksik cevaptan ayırmak için.',
      'The known correct output, used to tell a wrong answer from a missing one.',
      'İkinci aynanın arkasında cevap anahtarı vardır.',
      'Behind the second mirror there is an answer key.',
    ),
    T(
      'misread vs unresolved',
      'Yanlış bir şey bildirmek ile hiçbir şey bildirmemek ayrı iki hatadır.',
      'Reporting something false is a different failure from reporting nothing.',
      'Yanlış bildirmek ile hiç bildirmemek ayrı ayrı sayılır.',
      'Reporting a wrong cell and reporting none are counted separately.',
    ),
    T(
      'per-cell accuracy',
      'Resmi ortalamak yerine her konumu ayrı ayrı denetlemek.',
      'Checking every position separately rather than averaging the picture.',
      'Ortalama iyi görünebilir; hücre hüre ölçülür.',
      'An average can look fine while the cells are checked one by one.',
    ),
    T(
      'degradation curve',
      'Bir yöntemin yalnızca koşullar bozulduğunda değil, koşullar değiştikçe bozulduğunu izlemek.',
      'Watching a method get worse as conditions change, rather than only when they do.',
      'Hata rastgele değil, ışık kısa olduğu yerde durur.',
      'The failures are not random; they sit where the light runs short.',
    ),
  ],

  WFM: [
    T(
      'latent state',
      'Bütün dünyanın yerine geçen, sıkıştırılmış bir iç özet.',
      'A compact internal summary standing in for the whole world.',
      'Model, sahnenin tamamını değil bir özetini taşır.',
      'The model carries a summary, not the whole scene.',
    ),
    T(
      'world model',
      'Ne olduğuna göre dünyanın sırada ne yapacağını kestiren şey.',
      'Something that predicts what the world will do next, given what happened.',
      'Görülmeyen parçalar için bir haritadır.',
      'It is a map for the parts nobody looked at.',
    ),
    T(
      'assumed cell',
      'Bir ölçüm aletiyle okunmaktan çok modelin doldurduğu hücre.',
      'A cell filled in by the model rather than read by an instrument.',
      'Varsayılan hücre iki kat ağırlıkla plana girer.',
      'An assumed cell counts twice against the plan.',
    ),
    T(
      'model uncertainty',
      'Modelin ne kadarının hiç denetlemediği parçalara dayandığı.',
      'How much of the model rests on parts it never checked.',
      'Delikli harita, küçük ama emin haritadan çok daha belirsizdir.',
      'A map full of holes reports more uncertainty than a small sure one.',
    ),
  ],

  WML: [
    T(
      'counterfactual',
      'Seçilmeyen dalın ne olacağına dair, gözlenmek yerine tahmin edilen sonuç.',
      'The outcome of the branch that was not taken, estimated rather than observed.',
      'Reddettiğin yolun daha iyi olup olmadığını da soruyorsun.',
      'You also ask whether the road you declined was better.',
    ),
    T(
      'prediction',
      'Olaydan önce verilen sayı; böylece gerçekleşenle karşısına konabilir.',
      'A number offered before the event, so it can be held against what happened.',
      'Koşmadan önce yazılan sayı, koşmadan sonra sınanır.',
      'The number written before the run is tested after it.',
    ),
    T(
      'branch',
      'Ne olacağının, karşılaştırılabilmek için ayrı tutulan bir başka sürümü.',
      'A version of what happens, kept separate so two can be compared.',
      'İki dal yan yana açılır ve tahminleri karşılaştırılır.',
      'Two branches open side by side and their predictions are compared.',
    ),
    T(
      'error term',
      'Söylenen ile gerçekleşen arasındaki, işaretli fark.',
      'The signed gap between what was promised and what happened.',
      'Aradaki fark saklanmaz; ölçülür.',
      'The gap is not hidden; it is measured.',
    ),
  ],

  // ===== Valley of Living Machines =====================================
  ITL: [
    T(
      'digital twin',
      'Gerçek makineyle, bilinçli olarak aynı hâlde tutulan bir model.',
      'A maintained model of a machine, kept in step with the real one on purpose.',
      'Vadinin suyunun modeli, suyun kendisi değildir.',
      'The model of the valley’s water is not the water.',
    ),
    T(
      'model validation',
      'Modeli kendine karşı değil, ölçümlere karşı sınamak.',
      'Checking the model against measurements, rather than against itself.',
      'Model, okumaların çoğunda tutsa da kanıtlanmış sayılmaz.',
      'A model matching most readings is still not recorded as proven.',
    ),
    T(
      'system boundary',
      'Modelin neyi kapsayacağına ve neyi yok sayabileceğine karar vermek.',
      'Deciding what is inside the model and what it is allowed to ignore.',
      'Suyun neyi temsil ettiği önce yazılır.',
      'What the water stands for is written down first.',
    ),
    T(
      'residual',
      'Modelin açıklayamadığı şey; arıza genellikle oradadır.',
      'What the model fails to explain, which is usually where the fault is.',
      'Açıklanamayan fark, arızanın bulunduğu yerdir.',
      'The unexplained gap is where the fault is.',
    ),
  ],

  PDT: [
    T(
      'sensor placement',
      'Bir okumanın arızayı gerçekten daraltabilmesi için sensörü nereye koyacağını seçmek.',
      'Choosing where to put a sensor so a reading can actually narrow the fault.',
      'Sensörün yeri, okumasından daha önemlidir.',
      'Where the sensor goes matters more than what it reads.',
    ),
    T(
      'fault isolation',
      'Olası arızalar kümesini eleyerek tek bir arızaya indirmek.',
      'Reducing a set of possible faults to one by elimination.',
      'Her sensör en az bir adayı eler.',
      'Every sensor eliminates at least one candidate.',
    ),
    T(
      'cavitation',
      'Basınç çok düştüğünde oluşup çöken buhar kabarcıkları.',
      'Vapour bubbles forming and collapsing where the pressure drops too low.',
      'En çok duyulan arıza, çoğu zaman kavitasyondur.',
      'The most audible fault is often cavitation.',
    ),
    T(
      'correlated signal',
      'Başka biriyle birlikte hareket eden, ama ondan kaynaklanmayan bir okuma.',
      'A reading that moves with another without being caused by it.',
      'Sessiz bir conta, gürültülü bir vana ile birlikte görünebilir.',
      'A worn seal can move together with a noisy valve.',
    ),
  ],

  DTR: [
    T(
      'prediction vs outcome',
      'Peşinen yazılan sayının, geri gelen sayının yanında durması.',
      'The number written in advance beside the number that actually came back.',
      'İki sayı yan yana durur ve aralarındaki fark imzalanır.',
      'The two numbers sit side by side and the gap between them is signed.',
    ),
    T(
      'human-in-the-loop',
      'Eylem koşmadan önce bir kişinin onayının gerekli olması.',
      'A person whose approval is required before the action runs.',
      'Birinin evdem demesi, koşumun kendisinden önce gelir.',
      'Somebody’s yes comes before the run, not after it.',
    ),
    T(
      'alternative',
      'Seçilmeyen, atılmak yerine elde tutulan seçenek.',
      'The option that was not chosen, kept available rather than discarded.',
      'Oda diğer ayarın daha iyi olup olmayacağını gizlemez.',
      'The room never hides whether the other setting was better.',
    ),
    T(
      'experiment record',
      'Deneyin, tıpatıt yeniden oynatılabilecek kadar yazılmış hâli.',
      'The run written down well enough to be repeated exactly.',
      'Deney, aynı tohumla yeniden oynatılabilir.',
      'The experiment can be replayed from the same seed.',
    ),
  ],

  ENG: [
    T(
      'kinematic chain',
      'Her halkası bir öncekine bağlı olan bir eklem dizisi.',
      'A series of joints where each link depends on the one before it.',
      'Yardımcı bir biçim değil, bir zincirdir.',
      'The helper is a chain, not a shape.',
    ),
    T(
      'degrees of freedom',
      'Bir eklemin kaç bağımsız biçimde hareket edebileceği.',
      'How many independent ways a joint can move.',
      'Her eklem kendi hareketini ekler.',
      'Each joint adds its own motion.',
    ),
    T(
      'actuation',
      'Depolanan enerjiyi eklemde harekete dönüştürmek.',
      'Turning stored energy into a movement at a joint.',
      'Enerji olmadan eklem yalnızca bir parçadır.',
      'Without power a joint is only a part.',
    ),
    T(
      'reach envelope',
      'Bir zincirin gerçekte dokunabildiği bölge; göründüğünden çok daha küçüktür.',
      'The region a chain can actually touch, which is much smaller than it looks.',
      'Kolun bükülme yönü ulaşılacak noktayı belirler.',
      'How the arm is bent decides what it can reach.',
    ),
  ],

  HEX: [
    T(
      'joint',
      'Sınırları olan bir menteşe; sınırları, montajın mümkün olmasını sağlayan şeyin ta kendisidir.',
      'A pivot with limits, whose limits are what make the assembly possible at all.',
      'Eklemlerin her biri kendi sınırıyla birlikte gelir.',
      'Every joint arrives with its own limits.',
    ),
    T(
      'assembly order',
      'Parçaların kuruluş sırası; bir eklem hiçbir şeyin üzerine takılamaz.',
      'The sequence in which parts are built, since a joint cannot mount onto nothing.',
      'Üstündeki eklem, altındaki yokken kurulamaz.',
      'A joint cannot be built before the one it mounts onto.',
    ),
    T(
      'load path',
      'Ağırlığı gerçekte taşıyan zincir; genellikle en güçlü görünen değil.',
      'The chain that actually carries weight, usually not the one that looks strongest.',
      'Ağırlık, görünenden farklı bir yol üzerinden geçer.',
      'Weight travels a different path from the one that looks strongest.',
    ),
    T(
      'sensor placement',
      'Bir eklemin kendi konumunu algıladığı yer; nereye konacağı, ne kadar hassas yerleştirileceğini belirler.',
      'Where a joint senses its own position, which decides how precisely it can be placed.',
      'Eklem kendi konumunu ancak algıladığı yerde bilir.',
      'A joint knows its position only where it can sense it.',
    ),
  ],
};

/** Terms for one application code, or an empty list for an unknown code. */
export function termsFor(code: string): readonly AppTerm[] {
  return TERMS[code] ?? [];
}

/**
 * Every term in the game, with the application it belongs to.
 *
 * The journal uses this to build a browsable glossary across all thirty-three
 * applications, which is the one place a player can look up a word without
 * having just been handed it by a puzzle.
 */
export function allTerms(): { code: string; term: AppTerm }[] {
  const out: { code: string; term: AppTerm }[] = [];
  for (const entry of APPLICATIONS) {
    for (const term of TERMS[entry.code] ?? []) {
      out.push({ code: entry.code, term });
    }
  }
  return out;
}

/** Total number of terms across the catalog. */
export function termCount(): number {
  return allTerms().length;
}