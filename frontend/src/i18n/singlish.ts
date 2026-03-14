/**
 * Singlish — partial override of English.
 * Only override strings that benefit from Singlish flavor.
 * Everything else falls back to English.
 */
import type { Translations } from './en';
import type { DeepPartial } from './index';

const singlish: DeepPartial<Translations> = {
  common: {
    back: 'Back',
    cancel: 'Cancel lah',
    done: 'Done!',
    tryAgain: 'Try Again',
    loading: 'Loading...',
    start: 'Start',
    stop: 'Stop',
  },

  assessment: {
    title: 'Physical Assessment',
    subtitle: 'Do full check or pick what you want lah.',
    comprehensive: 'Full Check',
    individual: 'Pick Your Tests',
    greatJob: 'Steady lah!',
    testComplete: '{test} Done!',
    getReadyFor: 'Get ready ah',
    startNextTest: 'Next One',
    analyzingNote: 'Wait a bit ah, about 30 seconds',
    cameraPermission: 'Cannot access camera leh. Please allow permission.',
    somethingWrong: 'Something wrong leh. Try again?',
    posePerfect: 'Wah, perfect posture!',
    poseStraighter: 'Try stand straighter a bit',
    poseHoldSteady: 'Hold steady ah...',
    poseRepsGreat: 'Shiok — {count} reps done!',
    poseRepsKeepGoing: '{count} rep(s) — keep going lah!',
    poseChairEncourage: 'Stand up sit down — you can one!',
    poseWalkEncourage: 'Keep walking, steady!',
    defaultRec1: 'Continue daily movement, take your time.',
    defaultRec2: 'Practice balance near a wall, safer that way.',
    defaultRec3: 'Take short walks when you feel up for it.',
  },

  exercises: {
    title: "Today's Routine",
    completed: 'Done!',
    iFeelPain: 'I Feel Pain',
    painTitle: 'Rest First',
    painDesc: 'Stop the exercise and rest. If still pain, better see doctor. Safety first lah!',
    painUnderstand: 'OK, I Understand',
    painEmergency: 'Call 995 (Emergency)',
  },

  activity: {
    title: 'Your Progress',
    good: 'Steady!',
    fair: 'Not bad',
    needsWork: 'Can improve',
    great: 'Shiok!',
    keepMoving: 'Keep going lah',
    noData: 'No data yet',
    startCheck: 'Do Today\'s Check',
  },

  help: {
    title: 'Need Help?',
    subtitle: 'We here to help you',
    quickHelp: 'Quick Help',
    quickHelpDesc: 'If you feel giddy or not steady, sit down and rest first. Ask family to stay nearby.',
    voiceTipsDesc: 'Press the mic button and just talk: "Start check", "Show exercises", or "Go home".',
    localSupportDesc: 'Go nearby Active Ageing Centre for exercises and community support.',
  },

  caregiver: {
    title: 'Caregiver Summary',
    subtitle: 'Quick snapshot for family',
    careNotesDesc: 'Remind them drink water, keep walkway clear, and do gentle exercise daily.',
  },

  report: {
    scoreImproved: 'Your score improved from last week! Steady lah!',
    scoreDipped: 'Score drop a bit. Practice more can improve.',
    scoreExcellent: 'Wah, excellent mobility! Keep it up!',
    exerciseGreat: 'Consistent exercise this week! Shiok!',
    exerciseGood: 'Good routine. Try one more day lah!',
    exerciseMore: 'Try do exercises on more days this week.',
    stepsGreat: 'Good step count! Very active today!',
  },

  chat: {
    thinking: 'SilverGait thinking...',
    cantConnect: 'Cannot connect now lah. Use the buttons below can already!',
    couldNotHear: 'Cannot hear leh. Try again!',
    typePlaceholder: 'Type something...',
    qpCheck: 'Check my strength lah',
    qpExercises: 'Show me exercises',
    qpProgress: 'How am I doing?',
    qpUnsteady: 'I feel not steady today',
    qpWhatToDo: 'What I should do today?',
  },

  voice: {
    notAvailableNow: 'Voice not working now leh.',
    noAudio: 'Cannot hear anything. Try again?',
    micPermission: 'Cannot use microphone. Please allow permission.',
  },

  pose: {
    stepIntoView: 'Step into view so I can see you',
    gettingThere: 'Getting there — move closer a bit',
    almostPerfect: 'Almost — just a bit closer',
    lookingGreat: 'Steady! Ready when you are',
  },
};

export default singlish;
