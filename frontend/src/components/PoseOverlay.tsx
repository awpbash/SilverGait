import { useEffect, useRef, useState, memo, type RefObject } from 'react';
import type { PoseLandmarks } from '../hooks/usePoseDetection';
import { useT } from '../i18n';
import type { Translations } from '../i18n/en';

interface PoseOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  poseRef: RefObject<PoseLandmarks | null>;
  confidenceRef: RefObject<number>;
  isActive: boolean;
  showOverlay?: boolean;
}

// MoveNet keypoint connections — body segments for thick "energy limb" rendering
const POSE_CONNECTIONS: [number, number][] = [
  [5, 6],   // shoulders
  [5, 7],   // left upper arm
  [7, 9],   // left forearm
  [6, 8],   // right upper arm
  [8, 10],  // right forearm
  [5, 11],  // left torso
  [6, 12],  // right torso
  [11, 12], // hips
  [11, 13], // left thigh
  [13, 15], // left shin
  [12, 14], // right thigh
  [14, 16], // right shin
];

// Torso fill polygon (shoulders + hips)
const TORSO_INDICES = [5, 6, 12, 11];

function getCoverTransform(
  videoW: number, videoH: number,
  containerW: number, containerH: number
) {
  const videoAspect = videoW / videoH;
  const containerAspect = containerW / containerH;
  let scale: number, offsetX: number, offsetY: number;
  if (containerAspect > videoAspect) {
    scale = containerW / videoW;
    offsetX = 0;
    offsetY = (containerH - videoH * scale) / 2;
  } else {
    scale = containerH / videoH;
    offsetX = (containerW - videoW * scale) / 2;
    offsetY = 0;
  }
  return { scale, offsetX, offsetY };
}

function confidenceTier(value: number): number {
  if (value >= 0.7) return 2;
  if (value >= 0.4) return 1;
  return 0;
}

function feedbackForTier(tier: number, hasPose: boolean, pose: Translations['pose']): string {
  if (!hasPose) return pose.stepIntoView;
  if (tier === 2) return pose.lookingGreat;
  if (tier === 1) return pose.almostPerfect;
  return pose.gettingThere;
}

// Warm color palette — no traffic-light red/green
const PALETTES = {
  good:   { limb: 'rgba(255, 183, 77, 0.85)',  glow: 'rgba(255, 183, 77, 0.5)',  torso: 'rgba(255, 183, 77, 0.12)' },
  medium: { limb: 'rgba(129, 212, 250, 0.8)',   glow: 'rgba(129, 212, 250, 0.45)', torso: 'rgba(129, 212, 250, 0.1)' },
  low:    { limb: 'rgba(179, 157, 219, 0.75)',  glow: 'rgba(179, 157, 219, 0.4)',  torso: 'rgba(179, 157, 219, 0.08)' },
};

export const PoseOverlay = memo(function PoseOverlay({
  videoRef,
  poseRef,
  confidenceRef,
  isActive,
  showOverlay = true,
}: PoseOverlayProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feedbackText, setFeedbackText] = useState(t.pose.stepIntoView);
  const lastTierRef = useRef(-1);
  const showOverlayRef = useRef(showOverlay);
  showOverlayRef.current = showOverlay;

  // EMA-smoothed keypoints to eliminate jitter (lower alpha = smoother)
  const smoothedRef = useRef<{ x: number; y: number; score: number }[]>([]);
  const SMOOTH_ALPHA = 0.15;
  const DEADZONE = 1.5; // px — ignore sub-pixel jitter

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;
    const container = canvas.parentElement;
    if (!container) return;

    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(container);
    return () => observer.disconnect();
  }, [isActive]);

  // rAF draw loop — warm "energy body" style
  useEffect(() => {
    if (!isActive) return;
    let rafId: number;
    let breathPhase = 0;

    const draw = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;

      if (canvas && video) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          const pose = poseRef.current;
          const conf = confidenceRef.current;

          // Only draw skeleton if overlay is toggled on
          if (showOverlayRef.current && pose && pose.keypoints && pose.keypoints.length > 0) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;

            if (vw && vh) {
              const { scale, offsetX, offsetY } = getCoverTransform(
                vw, vh, canvas.width, canvas.height
              );

              // Apply EMA smoothing to eliminate jitter
              const raw = pose.keypoints;
              if (smoothedRef.current.length !== raw.length) {
                smoothedRef.current = raw.map(kp => ({ x: kp.x, y: kp.y, score: kp.score || 0 }));
              } else {
                for (let i = 0; i < raw.length; i++) {
                  const s = smoothedRef.current[i];
                  const r = raw[i];
                  if ((r.score || 0) > 0.3) {
                    // Map to canvas coords for deadzone check
                    const rawCX = r.x * scale + offsetX;
                    const rawCY = r.y * scale + offsetY;
                    const curCX = s.x * scale + offsetX;
                    const curCY = s.y * scale + offsetY;
                    const dist = Math.hypot(rawCX - curCX, rawCY - curCY);
                    // Only update if movement exceeds deadzone
                    if (dist > DEADZONE) {
                      s.x += SMOOTH_ALPHA * (r.x - s.x);
                      s.y += SMOOTH_ALPHA * (r.y - s.y);
                    }
                  }
                  s.score = r.score || 0;
                }
              }
              const kps = smoothedRef.current;

              const mapX = (x: number) => x * scale + offsetX;
              const mapY = (y: number) => y * scale + offsetY;

              // Pick warm palette based on confidence
              const palette = conf >= 0.7 ? PALETTES.good : conf >= 0.4 ? PALETTES.medium : PALETTES.low;

              // Breathing glow effect (subtle pulse)
              breathPhase += 0.03;
              const breathScale = 1 + Math.sin(breathPhase) * 0.15;
              const baseShadow = 22 * breathScale;

              // Draw filled torso shape (subtle body silhouette)
              const torsoKps = TORSO_INDICES.map(i => kps[i]);
              if (torsoKps.every(kp => kp && kp.score > 0.3)) {
                ctx.beginPath();
                ctx.moveTo(mapX(torsoKps[0].x), mapY(torsoKps[0].y));
                for (let i = 1; i < torsoKps.length; i++) {
                  ctx.lineTo(mapX(torsoKps[i].x), mapY(torsoKps[i].y));
                }
                ctx.closePath();
                ctx.fillStyle = palette.torso;
                ctx.fill();
              }

              // Draw thick glowing limb connections (energy body style)
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';

              POSE_CONNECTIONS.forEach(([i, j]) => {
                const kp1 = kps[i];
                const kp2 = kps[j];

                if (kp1 && kp2 && kp1.score > 0.3 && kp2.score > 0.3) {
                  // Outer glow pass
                  ctx.shadowBlur = baseShadow;
                  ctx.shadowColor = palette.glow;
                  ctx.strokeStyle = palette.limb;
                  ctx.lineWidth = 14;
                  ctx.beginPath();
                  ctx.moveTo(mapX(kp1.x), mapY(kp1.y));
                  ctx.lineTo(mapX(kp2.x), mapY(kp2.y));
                  ctx.stroke();

                  // Inner bright core
                  ctx.shadowBlur = 0;
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
                  ctx.lineWidth = 4;
                  ctx.beginPath();
                  ctx.moveTo(mapX(kp1.x), mapY(kp1.y));
                  ctx.lineTo(mapX(kp2.x), mapY(kp2.y));
                  ctx.stroke();
                }
              });

              // Joint nodes — subtle pulsing circles at key joints only (no face dots)
              const JOINT_INDICES = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
              JOINT_INDICES.forEach((idx) => {
                const kp = kps[idx];
                if (kp && kp.score > 0.3) {
                  const r = 5 * breathScale;
                  ctx.shadowBlur = baseShadow * 0.6;
                  ctx.shadowColor = palette.glow;
                  ctx.beginPath();
                  ctx.arc(mapX(kp.x), mapY(kp.y), r, 0, 2 * Math.PI);
                  ctx.fillStyle = palette.limb;
                  ctx.fill();
                  ctx.shadowBlur = 0;
                }
              });

              ctx.shadowBlur = 0;
            }
          }

          // Update feedback text only on tier change
          const hasPose = !!(pose && pose.keypoints && pose.keypoints.length > 0);
          const tier = hasPose ? confidenceTier(conf) : -1;
          if (tier !== lastTierRef.current) {
            lastTierRef.current = tier;
            setFeedbackText(feedbackForTier(tier, hasPose, t.pose));
          }
        }
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, videoRef, poseRef, confidenceRef, t.pose]);

  if (!isActive) return null;

  return (
    <>
      <canvas ref={canvasRef} className="pose-overlay" />
      <div className={`pose-feedback tier-${lastTierRef.current === 2 ? 'good' : lastTierRef.current === 1 ? 'medium' : 'low'}`}>
        {feedbackText}
      </div>
    </>
  );
});
