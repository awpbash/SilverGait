import { useEffect, useRef, type RefObject } from 'react';
import type { PoseLandmarks } from '../hooks/usePoseDetection';

interface PoseOverlayProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  pose: PoseLandmarks | null;
  confidence: number;
  isActive: boolean;
}

// MoveNet keypoint connections (skeleton structure)
const POSE_CONNECTIONS = [
  [5, 6],   // left_shoulder - right_shoulder
  [5, 7],   // left_shoulder - left_elbow
  [7, 9],   // left_elbow - left_wrist
  [6, 8],   // right_shoulder - right_elbow
  [8, 10],  // right_elbow - right_wrist
  [5, 11],  // left_shoulder - left_hip
  [6, 12],  // right_shoulder - right_hip
  [11, 12], // left_hip - right_hip
  [11, 13], // left_hip - left_knee
  [13, 15], // left_knee - left_ankle
  [12, 14], // right_hip - right_knee
  [14, 16], // right_knee - right_ankle
];

/**
 * Compute the scale and offset to map video-native coordinates
 * to the container's display coordinates, matching object-fit: cover.
 */
function getCoverTransform(
  videoW: number, videoH: number,
  containerW: number, containerH: number
) {
  const videoAspect = videoW / videoH;
  const containerAspect = containerW / containerH;

  let scale: number;
  let offsetX: number;
  let offsetY: number;

  if (containerAspect > videoAspect) {
    // Container is wider → video scaled to fill width, top/bottom cropped
    scale = containerW / videoW;
    offsetX = 0;
    offsetY = (containerH - videoH * scale) / 2;
  } else {
    // Container is taller → video scaled to fill height, sides cropped
    scale = containerH / videoH;
    offsetX = (containerW - videoW * scale) / 2;
    offsetY = 0;
  }

  return { scale, offsetX, offsetY };
}

export function PoseOverlay({ videoRef, pose, confidence, isActive }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Resize canvas to match container display dimensions
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

  // Draw skeleton
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !isActive) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (pose && pose.keypoints && pose.keypoints.length > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;

      // No native dimensions yet — skip drawing
      if (!vw || !vh) return;

      const { scale, offsetX, offsetY } = getCoverTransform(
        vw, vh, canvas.width, canvas.height
      );

      // Helper to map a keypoint from video coords → canvas coords
      const mapX = (x: number) => x * scale + offsetX;
      const mapY = (y: number) => y * scale + offsetY;

      // Colors based on confidence
      let keypointColor = '#00FF00';
      let connectionColor = 'rgba(0, 255, 0, 0.8)';

      if (confidence < 0.4) {
        keypointColor = '#FF0000';
        connectionColor = 'rgba(255, 0, 0, 0.8)';
      } else if (confidence < 0.7) {
        keypointColor = '#FFFF00';
        connectionColor = 'rgba(255, 255, 0, 0.8)';
      }

      // Draw connections
      ctx.strokeStyle = connectionColor;
      ctx.lineWidth = 3;

      POSE_CONNECTIONS.forEach(([i, j]) => {
        const kp1 = pose.keypoints[i];
        const kp2 = pose.keypoints[j];

        if (kp1 && kp2 && kp1.score && kp2.score && kp1.score > 0.3 && kp2.score > 0.3) {
          ctx.beginPath();
          ctx.moveTo(mapX(kp1.x), mapY(kp1.y));
          ctx.lineTo(mapX(kp2.x), mapY(kp2.y));
          ctx.stroke();
        }
      });

      // Draw keypoints
      pose.keypoints.forEach((kp) => {
        if (kp.score && kp.score > 0.3) {
          ctx.beginPath();
          ctx.arc(mapX(kp.x), mapY(kp.y), 5, 0, 2 * Math.PI);
          ctx.fillStyle = keypointColor;
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
  }, [pose, confidence, isActive, videoRef]);

  if (!isActive) return null;

  return (
    <>
      <canvas ref={canvasRef} className="pose-overlay" />
      {pose && pose.keypoints && pose.keypoints.length > 0 ? (
        <div className="pose-feedback">
          {confidence >= 0.7 && '✓ Tracking you'}
          {confidence >= 0.4 && confidence < 0.7 && '⚠ Partial view'}
          {confidence > 0 && confidence < 0.4 && '⚠ Please step into frame'}
        </div>
      ) : (
        <div className="pose-feedback">Looking for you...</div>
      )}
    </>
  );
}
