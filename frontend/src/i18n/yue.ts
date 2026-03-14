/**
 * Cantonese — partial override.
 * Uses written Cantonese where natural, falls back to English otherwise.
 */
import type { Translations } from './en';
import type { DeepPartial } from './index';

const yue: DeepPartial<Translations> = {
  common: {
    back: '返回',
    cancel: '取消',
    done: '搞掂!',
    tryAgain: '再试下',
    loading: '载紧中...',
    save: '储存',
    start: '开始',
    stop: '停止',
    next: '下一个',
    previous: '上一个',
    skip: '跳过',
    close: '关闭',
  },

  nav: {
    home: '主页',
    check: '检查',
    exercise: '运动',
    progress: '进度',
    more: '更多',
  },

  more: {
    title: '更多',
    weeklyReport: '每周报告',
    weeklyReportDesc: '睇下呢个星期点',
    challenges: '挑战',
    challengesDesc: '同大家一齐玩',
    caregiver: '照顾者',
    caregiverDesc: '同屋企人或医生分享',
    helpSafety: '帮助同安全',
    helpSafetyDesc: '贴士、常见问题同紧急联系',
  },

  assessment: {
    title: '身体检查',
    subtitle: '做全面检查定系拣你想做嘅测试。',
    comprehensive: '全面检查',
    individual: '拣个别测试',
    viewLastResult: '睇上次结果',
    greatJob: '做得好!',
    testComplete: '{test} 搞掂!',
    getReadyFor: '准备好',
    startNextTest: '开始下一个',
    analyzingNote: '大概要30秒',
    balance: '平衡测试',
    balanceDesc: '企稳一阵',
    gait: '行路测试',
    gaitDesc: '用你平时嘅速度行',
    chairStand: '椅子起身',
    chairStandDesc: '企起身坐低5次',
    posePerfect: '姿势好靓!',
    poseHoldSteady: '企稳...',
    poseChairEncourage: '企起身坐低 — 你得嘅!',
    poseWalkEncourage: '继续行，慢慢嚟',
    defaultRec1: '每日做啲运动，自己嘅节奏嚟。',
    defaultRec2: '练习平衡嘅时候揸住墙。',
    defaultRec3: '得闲行下短路。',
  },

  exercises: {
    title: '今日嘅运动',
    progress: '进度',
    completed: '完成咗',
    howToDo: '点样做',
    startTimer: '开始计时',
    pauseTimer: '暂停',
    resumeTimer: '继续',
    markComplete: '标记完成',
    iFeelPain: '我觉得痛',
    painTitle: '休息下先',
    painDesc: '停低运动休息下。如果仲系痛，睇下医生。安全最紧要。',
    painUnderstand: '我明白',
    painEmergency: '打 995 (紧急)',
  },

  activity: {
    title: '你嘅进度',
    good: '好',
    fair: '唔错',
    needsWork: '可以进步',
    great: '好叻!',
    keepMoving: '继续郁',
    noData: '未有数据',
    startCheck: '做今日检查',
    viewExercises: '睇运动',
    weeklyReport: '每周报告',
  },

  help: {
    title: '需要帮手?',
    subtitle: '我哋喺度帮你',
    quickHelp: '快速帮助',
    quickHelpDesc: '如果觉得头晕或者企唔稳，坐低休息先。叫屋企人喺旁边。',
    emergency: '打 995 (紧急)',
    faq: '常见问题',
    backHome: '返主页',
  },

  chat: {
    thinking: 'SilverGait 谂紧...',
    readAloud: '读出嚟',
    cantConnect: '连唔到，用下面嘅按钮啦!',
    couldNotHear: '听唔到，再试下!',
    typePlaceholder: '输入讯息...',
    checkStrength: '检查体力',
    dailyExercises: '每日运动',
    howAmIDoing: '我嘅进度点?',
    qpCheck: '检查我嘅体力',
    qpExercises: '俾我睇运动',
    qpProgress: '我嘅进度点?',
    qpUnsteady: '我今日觉得唔稳',
    qpWhatToDo: '今日做乜好?',
  },

  report: {
    title: '每周报告',
    insights: '分析',
    shareReport: '分享报告',
    backProgress: '返进度页',
    noAssessments: '呢个星期未做检查。今日试下啦!',
  },

  goals: {
    title: '每周目标',
    subtitle: '设定适合你嘅目标。',
    saveGoals: '储存目标',
    resetDefaults: '重设',
  },

  voice: {
    recording: '录紧音...',
    processing: '处理紧...',
    pressToSpeak: '按住讲嘢',
  },

  pose: {
    stepIntoView: '行入镜头等我睇到你',
    gettingThere: '差唔多 — 行近啲',
    almostPerfect: '就嚟 — 再近少少',
    lookingGreat: '好好! 准备好未?',
  },
};

export default yue;
