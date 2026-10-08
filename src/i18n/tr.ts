import type { Translations } from './en';

/**
 * Türkçe, oyunun birinci dilidir. Metinler İngilizceden birebir çevrilmiş
 * değildir; oyuncunun ekranda okuyacağı gibi doğal bir dille yazılmıştır.
 *
 * `Translations` tipi sayesinde eksik bir anahtar derleme hatası verir.
 */
export const tr: Translations = {
  // ---- Marka ----------------------------------------------------------
  'brand.name': 'ILMEK',
  'brand.descriptor': 'Yeniden Örülen Dünya',
  'brand.tagline': 'Her bağlantı dünyaya yeniden hayat verir.',

  // ---- Menüler --------------------------------------------------------
  'menu.newGame': 'Yeni Oyun',
  'menu.continue': 'Devam Et',
  'menu.settings': 'Ayarlar',
  'menu.journal': 'Günlük',
  'menu.credits': 'Emekler',
  'menu.back': 'Geri',
  'menu.language': 'Dil',
  'menu.resume': 'Sürdür',
  'menu.paused': 'Duraklatıldı',
  'menu.confirmReset': 'Bu bulmaca sıfırlansın mı?',
  'menu.confirmResetBody': 'Onardığın bölgelerdeki ilerlemen korunur.',
  'menu.confirmNewGame': 'Baştan başlansın mı?',
  'menu.confirmNewGameBody': 'Kayıtlı yolculuğun silinir.',
  'menu.cancel': 'Vazgeç',
  'menu.confirm': 'Onayla',
  'menu.close': 'Kapat',

  // ---- Tanıtım --------------------------------------------------------
  'onboard.move': 'Hareket',
  'onboard.moveBody': 'W A S D ya da yön tuşları. Dokunmatik ekranda çubuğu kullan.',
  'onboard.look': 'Bak',
  'onboard.lookBody': 'Kamerayı döndürmek için sahnenin herhangi bir yerini sürükle.',
  'onboard.interact': 'Etkileşim',
  'onboard.interactBody': 'İşaret çıktığında E tuşuna bas. Dokunmatik ekranda eylem düğmesine dokun.',
  'onboard.jump': 'Sıçra',
  'onboard.jumpBody': 'Boşluk tuşuna bas.',
  'onboard.tool': 'Aleti değiştir',
  'onboard.toolBody': 'Sopa kiplerini sırayla değiştirmek için Q tuşuna bas.',
  'onboard.done': 'Başla',

  // ---- Başlık bilgileri ------------------------------------------------
  'hud.objective': 'Amaç',
  'hud.tool': 'Sopa',
  'hud.journal': 'Günlük',
  'hud.pause': 'Duraklat',
  'hud.hint': 'İpucu',
  'hud.dismissHint': 'İpucunu kapat',
  'hud.regionRestored': 'Bölge onarıldı',
  'hud.progress': 'Onarılan bağlantılar',
  'hud.mobility': 'Hareket',

  // ---- Araçlar --------------------------------------------------------
  'tool.connect.name': 'Bağla',
  'tool.connect.desc': 'Uyumlu iki düğümü birleştir; akış aralarından geçebilsin.',
  'tool.reveal.name': 'Ortaya Çıkar',
  'tool.reveal.desc': 'Bu yerde saklananı görünür kıl.',
  'tool.preview.name': 'Önizle',
  'tool.preview.desc': 'Bir eylemin ne yapacağını, uygulamadan önce gör.',
  'tool.decide.name': 'Karar Ver',
  'tool.decide.desc': 'Önerilen eylemi uygula, ertele ya da reddet.',
  'tool.locked': 'Henüz anlaşılmadı',

  // ---- Etkileşim ------------------------------------------------------
  'prompt.interact': 'E',
  'prompt.tooFar': 'Yaklaş',
  'prompt.blocked': 'Aranızda bir engel var',
  'prompt.incompatible': 'Bu ikisi birbirine ait değil',
  'prompt.connected': 'Bağlandı',
  'prompt.targeting': 'Hedefleniyor',
  'prompt.selectSecond': 'İkinci bir nokta seç',

  // ---- Bulmaca sözlüğü ------------------------------------------------
  'puzzle.reset': 'Bulmacayı sıfırla',
  'puzzle.solved': 'Onarıldı',
  'puzzle.working': 'Üzerinde çalışılıyor',
  'puzzle.apply': 'Uygula',
  'puzzle.defer': 'Ertele',
  'puzzle.reject': 'Reddet',
  'puzzle.previewBranch': 'Bunu önizle',
  'puzzle.commit': 'Kesinleştir',
  'puzzle.capacity': 'Kapasite',
  'puzzle.load': 'Yük',
  'puzzle.cost': 'Maliyet',
  'puzzle.latency': 'Gecikme',
  'puzzle.makespan': 'Darboğaz',
  'puzzle.selected': 'Seçili',
  'puzzle.empty': 'Seçim yok',
  'puzzle.confirmApprove': 'Bu eylemi onayla',

  // ---- Mercekler ------------------------------------------------------
  'lens.edge': 'Kenar',
  'lens.depth': 'Derinlik',
  'lens.motion': 'Hareket',
  'lens.accuracy': 'Doğruluk',
  'lens.unresolved': 'Çözülemeyen',
  'lens.observeTwice': 'Karşılaştırmak için bir kez daha gözlemle',
  'lens.lowLight': 'Burada derinlik okunamıyor, ışık yetersiz',
  'cell.observed': 'Görüldü',
  'cell.assumed': 'Varsayıldı',
  'cell.classify':
    'Her hücre için, bir aletin onu gerçekten görebildiğini mi yoksa yalnızca varsaydığını mı işaretle.',
  'pdt.sensors': 'Sensörler',
  'pdt.place': 'Sensör yerleştir',
  'pdt.remaining': 'Hâlâ olası arızalar',

  // ---- Kanıt ----------------------------------------------------------
  'evidence.fresh': 'Güncel',
  'evidence.stale': 'Eski',
  'evidence.incorrect': 'Yanlış',
  'evidence.crowdedOut': 'Yer kalmadığı için geride kaldı',
  'evidence.correctIt': 'Bu kaydı düzelt',
  'evidence.pack': 'Fenerin içine koy',
  'evidence.unpack': 'Çıkar',

  // ---- Tahmin ---------------------------------------------------------
  'predict.model': 'Model',
  'predict.prediction': 'Tahmin',
  'predict.actual': 'Gerçekte olan',
  'predict.error': 'Fark',
  'predict.approve': 'Onayla',
  'predict.assumption': 'Varsayım',
  'predict.contradicted': 'Kanıtlar çürütüyor',

  // ---- Meclis ---------------------------------------------------------
  'council.proceed': 'Devam et',
  'council.abstain': 'Hüküm verme',
  'council.block': 'Durdur',
  'council.converged': 'Meclis anlaştı',
  'council.notConverged': 'Meclis bölündü',
  'council.agreementNotTruth':
    'Uzlaşı, uzlaşı olarak bildirilir; asla doğruluk olarak değil.',

  // ---- Bulmaca sistemleri, oyuncuya adıyla ---------------------------
  'system.connection': 'Bağlantı',
  'system.placement': 'Sıralama',
  'system.allocation': 'Dağıtım',
  'system.perception': 'Algı',
  'system.evidence': 'Kanıt',
  'system.prediction': 'Tahmin',

  // ---- İpuçları (üç kademe) ------------------------------------------
  'hint.1': 'Buraya bak.',
  'hint.2': 'Bu ikisi şöyle ilişkili.',
  'hint.3': 'Sırada bunu dene.',
  'hint.why': 'Neden',

  // ---- Öğretim katmanı ------------------------------------------------
  'lesson.title': 'Başlamadan önce',
  'lesson.principle': 'Fikir',
  'lesson.trap': 'Tuzak',
  'lesson.firstMove': 'Nereden başla',
  'lesson.show': 'Göster',
  'lesson.hide': 'Gizle',
  'lesson.showLesson': 'Dersi göster',
  'lesson.hideLesson': 'Dersi gizle',
  'lesson.counterpart': 'Gerçek dünyadaki karşılığı',

  // ---- Sonuç değerlendirmesi ------------------------------------------
  'debrief.title': 'Az önce öğrendiğin',
  'debrief.principle': 'Uyguladığın fikir',
  'debrief.trap': 'Bu sahnenin cezalandırdığı hata',
  'debrief.counterpart': 'Bunun gerçekteki karşılığı',
  'debrief.fault': 'Gerçekte olan arıza',
  'debrief.continue': 'Devam et',

  // ---- Dağıtım okumaları ------------------------------------------------
  'allocation.balance': 'Kollar eşit değil',
  'allocation.balanceOk': 'Hiçbir kol diğerinden fazla taşımıyor',
  'allocation.finish': 'Bitiş',
  'allocation.makespan': 'Darboğaz',

  // ---- Kıvılcım (yan yoldaş) -----------------------------------------
  'spark.intro': 'Sen son Örgücüsün. Ben Kıvılcım. Yani kıvılcım.',
  'spark.introEn': 'Sen son Örgücüsün. Ben Kıvılcım. Bunun kayıtlarda geçmesini isterim.',
  'spark.uncertain': 'Henüz bilmiyorum. Bunu açıkça söylemeyi tercih ederim.',
  'spark.wrong': 'Yanılmışım. Olabilir. Yanılmak benim öğrenme biçimim.',
  'spark.observe': 'İki kez izle. Hareket etmeyen şeyler gözden kaçar.',
  'spark.consensus': 'Herkes anlaştı. Bu, doğru olmakla aynı şey değil.',
  'spark.route': 'Onların izlediği yolu izle. Tahmin etmekten kolay.',
  'spark.reset': 'Sıfırla. Onardığın hiçbir şey geri alınmaz.',
  'spark.solved': 'Oldu. Bunun neyi değiştirdiğine bak.',

  // ---- Günlük ---------------------------------------------------------
  'journal.title': 'Günlük',
  'journal.entry': 'Kayıt',
  'journal.locked': 'Henüz keşfedilmedi',
  'journal.discovered': 'Keşfedildi',
  'journal.concept': 'Kavram',
  'journal.inWorld': 'Dünyada',
  'journal.openSource': 'Kaynak uygulamayı aç',
  'journal.sourceWarning': 'Yeni sekmede açılır',
  'journal.empty': 'Henüz bir şey kaydedilmedi.',
  'journal.filterAll': 'Tümü',
  'journal.lockedCount': 'Kalan',

  // ---- Ayarlar --------------------------------------------------------
  'settings.title': 'Ayarlar',
  'settings.audio': 'Ses',
  'settings.master': 'Ana ses düzeyi',
  'settings.music': 'Dünya müziği',
  'settings.muted': 'Tüm sesleri kapat',
  'settings.graphics': 'Grafikler',
  'settings.quality': 'Kalite',
  'settings.qualityLow': 'Düşük',
  'settings.qualityMedium': 'Orta',
  'settings.qualityHigh': 'Yüksek',
  'settings.pixelRatio': 'Çözünürlük',
  'settings.motion': 'Azaltılmış hareket',
  'settings.motionDesc': 'Kamera sürüklenmesini ve büyük geçişleri kaldırır.',
  'settings.language': 'Dil',
  'settings.data': 'İlerleme',
  'settings.exportSave': 'Kaydı dışa aktar',
  'settings.importSave': 'Kaydı içe aktar',
  'settings.eraseSave': 'İlerlemeyi sil',

  // ---- Erişilebilirlik ------------------------------------------------
  'a11y.jumpToContent': 'Oyna geç',
  'a11y.closeDialog': 'Kapat',
  'a11y.langSwitch': 'Dili değiştir',
  'a11y.objectiveRegion': 'Güncel amaç',

  // ---- Final ----------------------------------------------------------
  'ending.title': 'Sentez Ağacı',
  'ending.body':
    'Tel tel, dünya kendi kendine konuşmayı hatırladı. Su kanalını buldu. Meclis ikinci bir görüş buldu. Vadi, kendine iki kez söylenmeden pompaladı.',
  'ending.credits': 'Emekler',
  'ending.creditsBody':
    'ILMEK — Yeniden Örülen Dünya. Her bölge, Aserdargun tarafından yapılan herkese açık bir uygulamanın oynanabilir bir uyarlamasıdır.',
  'ending.keepExploring': 'Keşfetmeye devam et',
  'ending.restored': 'Onarılan bölgeler',

  // ---- Hatalar --------------------------------------------------------
  'error.webgl.title': 'Bu tarayıcı 3B dünyayı başlatamıyor',
  'error.webgl.body':
    'ILMEK için WebGL gerekiyor. Güncel bir Chrome, Edge, Firefox ya da Safari dene ve donanım hızlandırmanın açık olduğundan emin ol.',
  'error.save.corrupt': 'Kayıtlı yolculuk okunamadı, bu yüzden yenisi başlatıldı.',
  'error.save.version': 'Kayıt farklı bir sürümde yazıldığı için yüklenmedi.',
  'error.importFailed': 'Bu dosya bir ILMEK kaydı değil.',
  'error.generic': 'Bir şeyler ters gitti. Bulmaca sıfırlandı.',
};