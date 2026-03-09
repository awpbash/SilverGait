/**
 * Hokkien — partial override.
 * Mix of English and Hokkien romanization since written Hokkien is uncommon.
 * Falls back to English for most strings.
 */
import type { Translations } from './en';
import { DeepPartial } from './index';

const hokkien: DeepPartial<Translations> = {
  common: {
    done: 'Ho liau!',
    tryAgain: 'Try Again',
    start: 'Start',
  },

  nav: {
    home: 'Home',
    check: 'Check',
    exercise: 'Exercise',
    progress: 'Progress',
    more: 'More',
  },

  more: {
    title: 'More',
    weeklyReport: 'Weekly Report',
    weeklyReportDesc: 'See how you did this week',
    challenges: 'Challenges',
    challengesDesc: 'Fun goals with the community',
    caregiver: 'Caregiver',
    caregiverDesc: 'Share with family or doctor',
    helpSafety: 'Help & Safety',
    helpSafetyDesc: 'Tips, FAQ, and emergency',
  },

  assessment: {
    greatJob: 'Ho liau! Well done!',
    getReadyFor: 'Ready ah',
    analyzingNote: 'Wait a bit, about 30 seconds',
    posePerfect: 'Ho! Perfect posture!',
    poseHoldSteady: 'Tiām-tiām... hold steady',
    poseChairEncourage: 'Khiā khí-lâi chē lo̍h — lí ē-sái!',
    poseWalkEncourage: 'Keep walking, bān-bān-á lâi',
    defaultRec1: 'Every day do some movement, take your time.',
    defaultRec2: 'Practice balance near a wall, more safe.',
    defaultRec3: 'Walk short distance when you feel ok.',
  },

  exercises: {
    painTitle: 'Rest First',
    painDesc: 'Stop exercise and rest. If still pain, go see doctor. Safety first!',
    painUnderstand: 'Ok, I Understand',
  },

  activity: {
    good: 'Ho!',
    fair: 'Not bad',
    needsWork: 'Can improve',
    great: 'Ho ah!',
    keepMoving: 'Keep going',
  },

  help: {
    quickHelpDesc: 'If you feel giddy or not steady, sit down rest first. Ask family stay nearby.',
  },

  chat: {
    thinking: 'SilverGait leh siūⁿ...',
    readAloud: 'Read aloud',
    cantConnect: 'Cannot connect now. Use buttons below can already!',
    couldNotHear: 'Cannot hear. Try again!',
    typePlaceholder: 'Type a message...',
    checkStrength: 'Check My Strength',
    dailyExercises: 'Daily Exercises',
    howAmIDoing: 'How Am I Doing?',
    qpCheck: 'Check my strength',
    qpExercises: 'Show me exercises',
    qpProgress: 'How am I doing?',
    qpUnsteady: 'Today I feel not steady',
    qpWhatToDo: 'Today beh do siáⁿ-mih?',
  },

  pose: {
    stepIntoView: 'Walk into view so I can see you',
    lookingGreat: 'Ho! Ready when you are',
  },
};

export default hokkien;
