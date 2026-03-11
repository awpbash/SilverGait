/**
 * AssessmentResultView — Score display, breakdown, recommendations, and graphs.
 * Extracted from AssessmentPage.
 */

import { useState } from 'react';
import { AppHeader, ScoreRing, MovementGraph } from './index';
import { tpl } from '../i18n';
import type { Translations } from '../i18n/en';
import type { AssessmentResult } from '../types';
import type { MetricsTimeSeries } from '../hooks/usePoseMetrics';
import type { PoseMetricsSummary } from '../utils/poseMetrics';
import { computeTotalScore, computeMaxScore, ALL_TEST_IDS, type AssessmentTestId } from '../hooks/useAssessmentFlow';

interface AssessmentResultViewProps {
  t: Translations;
  assessment: AssessmentResult;
  history: AssessmentResult[];
  testTimeSeries: Partial<Record<AssessmentTestId, MetricsTimeSeries>>;
  testMetrics?: Partial<Record<AssessmentTestId, PoseMetricsSummary>>;
  showDetails: boolean;
  onSetShowDetails: (fn: (v: boolean) => boolean) => void;
  onReset: () => void;
  onNavigateExercises: () => void;
}

export function AssessmentResultView({
  t,
  assessment,
  history,
  testTimeSeries,
  testMetrics,
  showDetails,
  onSetShowDetails,
  onReset,
  onNavigateExercises,
}: AssessmentResultViewProps) {
  const totalScore = computeTotalScore(assessment);
  const maxScore = computeMaxScore(assessment);
  const breakdown = assessment.sppb_breakdown;
  const balanceScore = breakdown?.balance_score ?? Math.round(assessment.score / 3);
  const gaitScore = breakdown?.gait_score ?? Math.round(assessment.score / 3);
  const chairScore = breakdown?.chair_stand_score ?? Math.round(assessment.score / 3);
  const completedTests = assessment.completed_tests ?? ALL_TEST_IDS;
  const isPartial = completedTests.length < ALL_TEST_IDS.length;
  const showBalance = completedTests.includes('balance');
  const showGait = completedTests.includes('gait');
  const showChair = completedTests.includes('chair_stand');

  const previous = history?.[1];
  const previousTotal = previous ? computeTotalScore(previous) : null;
  const delta = previousTotal !== null ? totalScore - previousTotal : null;

  const ratio = maxScore > 0 ? totalScore / maxScore : 0;
  const scoreLabel = ratio >= 0.75 ? t.activity.good : ratio >= 0.5 ? t.activity.fair : t.activity.needsWork;
  const resultEncouragement =
    ratio >= 0.75
      ? t.assessment.greatJob + ' ' + t.assessment.defaultRec1
      : ratio >= 0.5
      ? t.assessment.defaultRec1 + ' ' + t.assessment.defaultRec2
      : t.assessment.defaultRec3 + ' ' + t.assessment.defaultRec2;
  const showDoctorNote = ratio < 0.5;

  const testEmoji = (score: number) =>
    score >= 4 ? t.assessment.badgeExcellent : score >= 3 ? t.assessment.badgeGood : score >= 2 ? t.assessment.badgeFair : t.assessment.badgePractice;

  const testCards: { id: AssessmentTestId; label: string; score: number }[] = [];
  if (showBalance) testCards.push({ id: 'balance', label: t.activity.balance, score: balanceScore });
  if (showGait) testCards.push({ id: 'gait', label: t.activity.gait, score: gaitScore });
  if (showChair) testCards.push({ id: 'chair_stand', label: t.activity.chair, score: chairScore });

  const hasGraphs = Object.keys(testTimeSeries).length > 0;
  const hasMetrics = testMetrics && Object.keys(testMetrics).length > 0;
  const [showClinical, setShowClinical] = useState(false);

  return (
    <div className="page result-page">
      <AppHeader />

      {/* Hero section */}
      <div className="result-hero">
        <p className="result-greeting">{t.assessment.complete}</p>
        {isPartial && (
          <p className="result-partial">
            {tpl(t.assessment.testsOf, { completed: completedTests.length, total: ALL_TEST_IDS.length })}
          </p>
        )}

        <div className="result-score-ring">
          <ScoreRing score={totalScore} maxScore={maxScore} size="lg" label={scoreLabel} />
        </div>

        {delta !== null && (
          <div className={`result-trend ${delta >= 0 ? 'up' : 'down'}`}>
            <svg viewBox="0 0 20 20" width="14" height="14">
              {delta >= 0
                ? <path d="M10 4l5 6h-3v6h-4v-6H5l5-6z" fill="currentColor" />
                : <path d="M10 16l-5-6h3V4h4v6h3l-5 6z" fill="currentColor" />
              }
            </svg>
            {tpl(t.activity.deltaFrom, { delta: `${delta >= 0 ? '+' : ''}${delta}` })}
          </div>
        )}

        <p className="result-encouragement">{resultEncouragement}</p>

        {showDoctorNote && (
          <div className="result-doctor-note">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--danger)">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <span>{t.assessment.talkToDoctor}</span>
          </div>
        )}

        {assessment.low_confidence_warning && (
          <div className="result-confidence-warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--warning)">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
            <span>{assessment.low_confidence_warning}</span>
          </div>
        )}
      </div>

      {/* Test breakdown cards */}
      <div className="result-tests">
        {testCards.map(({ id, label, score }) => (
          <div key={id} className="result-test-card">
            <div className="result-test-info">
              <span className="result-test-name">{label}</span>
              <span className={`result-test-badge ${score >= 3 ? 'good' : score >= 2 ? 'fair' : 'low'}`}>
                {testEmoji(score)}
              </span>
            </div>
            <ScoreRing score={score} maxScore={4} size="sm" />
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {assessment.recommendations.length > 0 && (
        <div className="result-recs">
          <h3>{t.assessment.focusOn}</h3>
          {assessment.recommendations.slice(0, 3).map((rec) => (
            <div key={rec} className="result-rec-item">
              <span className="result-rec-dot" />
              <span>{rec}</span>
            </div>
          ))}
        </div>
      )}

      {/* Movement Detail Toggle */}
      {hasGraphs && (
        <button
          type="button"
          className="result-detail-toggle"
          onClick={() => onSetShowDetails((prev) => !prev)}
        >
          <span>{showDetails ? t.assessment.hideMovement : t.assessment.showMovement}</span>
          <svg viewBox="0 0 20 20" width="16" height="16" style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M5 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {showDetails && (
        <div className="result-graphs">
          {assessment.issues.length > 0 && (
            <div className="result-issue-tags">
              {assessment.issues.map((issue) => (
                <span key={issue} className="result-issue-tag">{issue.replace(/_/g, ' ')}</span>
              ))}
            </div>
          )}

          {showChair && testTimeSeries.chair_stand && (
            <div className="result-graph-section">
              <h4>{t.assessment.graphChairStand}</h4>
              <MovementGraph time={testTimeSeries.chair_stand.time} values={testTimeSeries.chair_stand.hipY} title={t.assessment.graphBodyPosition} yLabel={t.assessment.graphPosition} color="#FFB74D" invertY />
              <MovementGraph time={testTimeSeries.chair_stand.time} values={testTimeSeries.chair_stand.kneeAngle} title={t.assessment.graphKneeAngle} yLabel={t.assessment.graphDegrees} color="#4FC3F7" />
            </div>
          )}

          {showBalance && testTimeSeries.balance && (
            <div className="result-graph-section">
              <h4>{t.assessment.graphBalance}</h4>
              <MovementGraph time={testTimeSeries.balance.time} values={testTimeSeries.balance.hipX} title={t.assessment.graphLateralSway} yLabel={t.assessment.graphPosition} color="#81C784" />
              <MovementGraph time={testTimeSeries.balance.time} values={testTimeSeries.balance.trunkLean} title={t.assessment.graphTrunkLean} yLabel={t.assessment.graphDegrees} color="#FFB74D" />
            </div>
          )}

          {showGait && testTimeSeries.gait && (
            <div className="result-graph-section">
              <h4>{t.assessment.graphWalking}</h4>
              <MovementGraph time={testTimeSeries.gait.time} values={testTimeSeries.gait.hipX} title={t.assessment.graphHorizontal} yLabel={t.assessment.graphPosition} color="#4FC3F7" />
              <MovementGraph time={testTimeSeries.gait.time} values={testTimeSeries.gait.kneeAngle} title={t.assessment.graphKneeAngle} yLabel={t.assessment.graphDegrees} color="#FFB74D" />
            </div>
          )}
        </div>
      )}

      {/* Clinical Details — hidden by default, for medical professionals */}
      {hasMetrics && (
        <>
          <button
            type="button"
            className="result-detail-toggle clinical-toggle"
            onClick={() => setShowClinical((prev) => !prev)}
          >
            <span>{showClinical ? t.assessment.hideClinical : t.assessment.showClinical}</span>
            <svg viewBox="0 0 20 20" width="16" height="16" style={{ transform: showClinical ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M5 7l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>

          {showClinical && (
            <div className="clinical-details">
              <p className="clinical-disclaimer">{t.assessment.clinicalDisclaimer}</p>

              {showBalance && testMetrics?.balance && (
                <div className="clinical-section">
                  <h4>{t.assessment.balance} — {t.assessment.clinicalPostural}</h4>
                  <ClinicalTable rows={[
                    [t.assessment.clinicalSwayRMS, testMetrics.balance.swayRMS, 'px'],
                    [t.assessment.clinicalSwayML, testMetrics.balance.swayML, 'px'],
                    [t.assessment.clinicalSwayAP, testMetrics.balance.swayAP, 'px'],
                    [t.assessment.clinicalSwayVelocity, testMetrics.balance.swayVelocity, 'px/frame'],
                    [t.assessment.clinicalSwayArea, testMetrics.balance.swayArea, 'px\u00B2'],
                    [t.assessment.clinicalTrunkLean, testMetrics.balance.trunkLean.avg, '\u00B0'],
                    [t.assessment.clinicalTrunkLeanMax, testMetrics.balance.trunkLean.max, '\u00B0'],
                    [t.assessment.clinicalTrunkVar, testMetrics.balance.trunkLeanVariability, '\u00B0'],
                    [t.assessment.clinicalStanceWidth, testMetrics.balance.stanceWidth.avg, 'px'],
                  ]} />
                </div>
              )}

              {showGait && testMetrics?.gait && (
                <div className="clinical-section">
                  <h4>{t.assessment.gait} — {t.assessment.clinicalMobility}</h4>
                  <ClinicalTable rows={[
                    [t.assessment.clinicalGaitSpeed, testMetrics.gait.estimatedGaitSpeed, 'px/s'],
                    [t.assessment.clinicalStepCount, testMetrics.gait.stepCount, ''],
                    [t.assessment.clinicalCadence, testMetrics.gait.cadence, 'steps/min'],
                    [t.assessment.clinicalStepSymmetry, testMetrics.gait.stepSymmetryIndex, '%'],
                    [t.assessment.clinicalRhythmVar, testMetrics.gait.gaitRhythmVariability, '% CV'],
                    [t.assessment.clinicalDoubleSupport, Math.round(testMetrics.gait.doubleSupportRatio * 100), '%'],
                    [t.assessment.clinicalArmSymmetry, Math.round(testMetrics.gait.armSwing.symmetry * 100), '%'],
                    [t.assessment.clinicalTrunkLean, testMetrics.gait.trunkLean.avg, '\u00B0'],
                  ]} />
                </div>
              )}

              {showChair && testMetrics?.chair_stand && (
                <div className="clinical-section">
                  <h4>{t.assessment.chairStand} — {t.assessment.clinicalStrength}</h4>
                  <ClinicalTable rows={[
                    [t.assessment.clinicalRepCount, testMetrics.chair_stand.refinedRepCount, ''],
                    [t.assessment.clinicalAvgRepTime, testMetrics.chair_stand.avgRepTime > 0 ? (testMetrics.chair_stand.avgRepTime / 1000).toFixed(1) : '—', 's'],
                    [t.assessment.clinicalRepConsistency, testMetrics.chair_stand.repConsistency, '% CV'],
                    [t.assessment.clinicalPeakTrunkLean, testMetrics.chair_stand.peakTrunkLeanDuringRise, '\u00B0'],
                    [t.assessment.clinicalTransitionSpeed, testMetrics.chair_stand.transitionSpeed, '\u00B0/frame'],
                    [t.assessment.clinicalKneeRange, testMetrics.chair_stand.kneeAngle.range, '\u00B0'],
                  ]} />
                </div>
              )}

              <p className="clinical-footnote">{t.assessment.clinicalFootnote}</p>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      <div className="result-actions">
        <button type="button" className="btn-primary" onClick={onNavigateExercises}>
          {t.activity.viewExercises}
        </button>
        <button type="button" className="btn-secondary" onClick={onReset}>
          {t.assessment.startAnother}
        </button>
      </div>
    </div>
  );
}

/** Simple metric table for clinical section */
function ClinicalTable({ rows }: { rows: [string, number | string, string][] }) {
  return (
    <table className="clinical-table">
      <tbody>
        {rows.map(([label, value, unit]) => (
          <tr key={label}>
            <td className="clinical-label">{label}</td>
            <td className="clinical-value">{value}{unit ? <span className="clinical-unit"> {unit}</span> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
