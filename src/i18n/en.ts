/**
 * English is the structural source of truth. Typing `tr` as `typeof en` makes a
 * missing or misspelled Turkish key a *compile* error rather than a runtime
 * blank in the middle of the game.
 *
 * Turkish is the default language for a first visit, but that is a runtime
 * concern handled in `index.ts` — nothing here depends on it.
 */
export const en = {
  // ---- Brand ----------------------------------------------------------
  'brand.name': 'ILMEK',
  'brand.descriptor': 'A World Rewoven',
  'brand.tagline': 'Every connection brings the world to life.',

  // ---- Menus ----------------------------------------------------------
  'menu.newGame': 'New Game',
  'menu.continue': 'Continue',
  'menu.settings': 'Settings',
  'menu.journal': 'Journal',
  'menu.credits': 'Credits',
  'menu.back': 'Back',
  'menu.language': 'Language',
  'menu.resume': 'Resume',
  'menu.paused': 'Paused',
  'menu.confirmReset': 'Reset this puzzle?',
  'menu.confirmResetBody': 'Your progress in the restored regions is kept.',
  'menu.confirmNewGame': 'Start over from the beginning?',
  'menu.confirmNewGameBody': 'This removes your saved journey.',
  'menu.cancel': 'Cancel',
  'menu.confirm': 'Confirm',
  'menu.close': 'Close',

  // ---- Onboarding -----------------------------------------------------
  'onboard.move': 'Move',
  'onboard.moveBody': 'Walk by dragging the bottom-left stick.',
  'onboard.look': 'Look',
  'onboard.lookBody': 'Turn the camera with the bottom-right stick.',
  'onboard.sprint': 'Sprint',
  'onboard.sprintBody': 'Hold to run.',
  'onboard.interact': 'Interact',
  'onboard.interactBody': 'Press E when a prompt appears. On a touchscreen, tap the action button.',
  'onboard.jump': 'Jump',
  'onboard.jumpBody': 'Press Space.',
  'onboard.tool': 'Switch tool',
  'onboard.toolBody': 'Press Q to cycle the staff modes.',
  'onboard.home': 'Go home',
  'onboard.homeBody': 'Tap the home button to return to the hub dais.',
  'onboard.homeShort': 'Home',
  'onboard.done': 'Begin',

  // ---- HUD ------------------------------------------------------------
  'hud.objective': 'Objective',
  'hud.tool': 'Staff',
  'hud.journal': 'Journal',
  'hud.pause': 'Pause',
  'hud.hint': 'Hint',
  'hud.dismissHint': 'Dismiss hint',
  'hud.regionRestored': 'Region restored',
  'hud.progress': 'Connections restored',
  'hud.mobility': 'Movement',

  // ---- Tools ----------------------------------------------------------
  'tool.connect.name': 'Connect',
  'tool.connect.desc': 'Join two compatible nodes so a flow can pass between them.',
  'tool.reveal.name': 'Reveal',
  'tool.reveal.desc': 'Expose what is hidden in this place.',
  'tool.preview.name': 'Preview',
  'tool.preview.desc': 'See what an action would do, without committing to it.',
  'tool.decide.name': 'Decide',
  'tool.decide.desc': 'Apply, defer or refuse the proposed action.',
  'tool.locked': 'Not yet understood',

  // ---- Interaction ----------------------------------------------------
  'prompt.interact': 'E',
  'prompt.tooFar': 'Move closer',
  'prompt.blocked': 'Something is in the way',
  'prompt.incompatible': 'These two do not belong together',
  'prompt.connected': 'Connected',
  'prompt.targeting': 'Targeting',
  'prompt.selectSecond': 'Choose a second point',

  // ---- Puzzle system vocabulary --------------------------------------
  'puzzle.reset': 'Reset puzzle',
  'puzzle.solved': 'Restored',
  'puzzle.working': 'Working on it',
  'puzzle.apply': 'Apply',
  'puzzle.defer': 'Defer',
  'puzzle.reject': 'Reject',
  'puzzle.previewBranch': 'Preview this',
  'puzzle.commit': 'Commit',
  'puzzle.capacity': 'Capacity',
  'puzzle.load': 'Load',
  'puzzle.cost': 'Cost',
  'puzzle.latency': 'Delay',
  'puzzle.makespan': 'Bottleneck',
  'puzzle.selected': 'Selected',
  'puzzle.empty': 'Nothing selected',
  'puzzle.confirmApprove': 'Approve this action',

  // ---- Lenses ---------------------------------------------------------
  'lens.edge': 'Edge',
  'lens.depth': 'Depth',
  'lens.motion': 'Motion',
  'lens.accuracy': 'Accuracy',
  'lens.unresolved': 'Unresolved',
  'lens.observeTwice': 'Observe again to compare',
  'lens.lowLight': 'Too dark to read depth here',
  'cell.observed': 'Seen',
  'cell.assumed': 'Assumed',
  'cell.classify': 'For each cell, mark whether an instrument can truly see it, or only assume it.',
  'pdt.sensors': 'Sensors',
  'pdt.place': 'Place a sensor',
  'pdt.remaining': 'Faults still possible',

  // ---- Evidence -------------------------------------------------------
  'evidence.fresh': 'Current',
  'evidence.stale': 'Outdated',
  'evidence.incorrect': 'Wrong',
  'evidence.crowdedOut': 'Left behind for lack of room',
  'evidence.correctIt': 'Correct this record',
  'evidence.pack': 'Pack into the lantern',
  'evidence.unpack': 'Take out',

  // ---- Prediction -----------------------------------------------------
  'predict.model': 'Model',
  'predict.prediction': 'Prediction',
  'predict.actual': 'What happened',
  'predict.error': 'Difference',
  'predict.approve': 'Approve',
  'predict.assumption': 'Assumption',
  'predict.contradicted': 'Contradicted by evidence',

  // ---- Council --------------------------------------------------------
  'council.proceed': 'Proceed',
  'council.abstain': 'Withhold judgement',
  'council.block': 'Stop',
  'council.converged': 'The council agrees',
  'council.notConverged': 'The council is split',
  'council.agreementNotTruth': 'Agreement is reported as agreement, never as correctness.',

  // ---- Puzzle systems, named for the player --------------------------
  'system.connection': 'Connection',
  'system.placement': 'Sequence',
  'system.allocation': 'Allocation',
  'system.perception': 'Perception',
  'system.evidence': 'Evidence',
  'system.prediction': 'Prediction',

  // ---- Hints (three tiers) -------------------------------------------
  'hint.1': 'Look here.',
  'hint.2': 'This is how these two relate.',
  'hint.3': 'Try this next.',
  'hint.why': 'Why',

  // ---- Teaching layer -------------------------------------------------
  'lesson.title': 'Before you start',
  'lesson.principle': 'The idea',
  'lesson.trap': 'The trap',
  'lesson.firstMove': 'Where to start',
  'lesson.show': 'Show',
  'lesson.hide': 'Hide',
  'lesson.showLesson': 'Show the lesson',
  'lesson.hideLesson': 'Hide the lesson',
  'lesson.counterpart': 'Real-world counterpart',

  // ---- Debrief, shown once a stage is restored -----------------------
  'debrief.title': 'What you just learned',
  'debrief.principle': 'The idea you applied',
  'debrief.trap': 'The mistake this stage punishes',
  'debrief.counterpart': 'Where this lives for real',
  'debrief.fault': 'The fault that was actually there',
  'debrief.continue': 'Continue',

  // ---- Allocation readouts -------------------------------------------
  'allocation.balance': 'Lanes are uneven',
  'allocation.balanceOk': 'No lane carries more than another',
  'allocation.finish': 'Finishes at',
  'allocation.makespan': 'Bottleneck',

  // ---- Spark (companion) --------------------------------------------
  'spark.intro': 'You are the last Weaver. I am Kıvılcım. That means spark.',
  'spark.introEn': 'You are the last Weaver. I am Spark. I would like that to be on the record.',
  'spark.uncertain': 'I do not know yet. I want to be honest about that.',
  'spark.wrong': 'I was wrong. That is allowed. Being wrong is how I learn.',
  'spark.observe': 'Watch it twice. Things that do not move are easy to miss.',
  'spark.consensus': 'Everyone agreed. That is not the same as being right.',
  'spark.route': 'Follow the route they take. It is easier than guessing.',
  'spark.reset': 'Reset it. Nothing you have already restored comes undone.',
  'spark.solved': 'It worked. Look at what that changed.',

  // ---- Journal --------------------------------------------------------
  'journal.title': 'Journal',
  'journal.entry': 'Entry',
  'journal.locked': 'Not yet discovered',
  'journal.discovered': 'Discovered',
  'journal.concept': 'Concept',
  'journal.inWorld': 'In the world',
  'journal.openSource': 'Open source application',
  'journal.sourceWarning': 'Opens in a new tab',
  'journal.empty': 'Nothing recorded yet.',
  'journal.filterAll': 'All',
  'journal.lockedCount': 'Remaining',

  // ---- Settings -------------------------------------------------------
  'settings.title': 'Settings',
  'settings.audio': 'Sound',
  'settings.master': 'Master volume',
  'settings.music': 'World music',
  'settings.muted': 'Mute all sound',
  'settings.graphics': 'Graphics',
  'settings.quality': 'Quality',
  'settings.qualityLow': 'Low',
  'settings.qualityMedium': 'Medium',
  'settings.qualityHigh': 'High',
  'settings.pixelRatio': 'Resolution',
  'settings.motion': 'Reduced motion',
  'settings.motionDesc': 'Removes camera drift and large animated transitions.',
  'settings.language': 'Language',
  'settings.data': 'Progress',
  'settings.exportSave': 'Export save',
  'settings.importSave': 'Import save',
  'settings.eraseSave': 'Erase progress',

  // ---- Accessibility --------------------------------------------------
  'a11y.jumpToContent': 'Skip to game',
  'a11y.closeDialog': 'Close',
  'a11y.langSwitch': 'Switch language',
  'a11y.objectiveRegion': 'Current objective',

  // ---- Ending ---------------------------------------------------------
  'ending.title': 'The Synthesis Tree',
  'ending.body':
    'Thread by thread, the world remembers how to speak to itself. The water finds the canal. The council finds a second opinion. The valley pumps without being told twice.',
  'ending.credits': 'Credits',
  'ending.creditsBody':
    'ILMEK — A World Rewoven. Every region is a playable adaptation of a public application by Aserdargun.',
  'ending.keepExploring': 'Keep exploring',
  'ending.restored': 'Regions restored',

  // ---- Errors ---------------------------------------------------------
  'error.webgl.title': 'This browser cannot start the 3D world',
  'error.webgl.body':
    'ILMEK needs WebGL. Try a recent version of Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is enabled.',
  'error.save.corrupt': 'The saved journey could not be read, so a fresh one was started.',
  'error.save.version': 'The save was written by a different version and was not loaded.',
  'error.importFailed': 'That file is not an ILMEK save.',
  'error.generic': 'Something went wrong. The puzzle was reset.',
} as const;

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;