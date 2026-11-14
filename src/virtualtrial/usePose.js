import { useState, useCallback, useRef } from 'react';

// On-device body/pose detection via MediaPipe Tasks Vision, loaded from the CDN
// at RUNTIME (no npm dependency, no bundle bloat). Everything is graceful: if
// the model can't load (offline, unsupported browser, blocked CDN) the hook
// reports a soft failure and the try-on flow still works — you just don't get
// the landmark overlay. This is genuine pose estimation, not a mock.

const VERSION = '0.10.14';
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export function usePose() {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | detecting | done | unavailable
  const [landmarks, setLandmarks] = useState(null);
  const landmarkerRef = useRef(null);

  const ensureLoaded = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    setStatus('loading');
    // Variable URL + @vite-ignore so Vite leaves this as a native runtime import.
    const url = BUNDLE;
    const vision = await import(/* @vite-ignore */ url);
    const { FilesetResolver, PoseLandmarker } = vision;
    const fileset = await FilesetResolver.forVisionTasks(WASM);
    const lm = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL },
      runningMode: 'IMAGE',
      numPoses: 1,
    });
    landmarkerRef.current = lm;
    return lm;
  }, []);

  // Detect on a loaded <img>/<canvas> element. Returns normalized landmarks
  // ([{x,y,visibility}...]) or null. Never throws to the caller.
  const detect = useCallback(async (imageEl) => {
    try {
      const lm = await ensureLoaded();
      setStatus('detecting');
      const res = lm.detect(imageEl);
      const pts = res?.landmarks?.[0] || null;
      setLandmarks(pts);
      setStatus(pts ? 'done' : 'ready');
      return pts;
    } catch (err) {
      console.warn('[virtual-trial] pose model unavailable:', err?.message || err);
      setStatus('unavailable');
      setLandmarks(null);
      return null;
    }
  }, [ensureLoaded]);

  const reset = useCallback(() => { setLandmarks(null); setStatus('idle'); }, []);

  return { status, landmarks, detect, reset };
}

// Draw landmark dots + a simple skeleton onto a canvas sized to the image.
// Decorative confirmation that the body was detected; harmless if landmarks null.
export function drawPose(canvas, landmarks, width, height) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;
  // MediaPipe pose connections (subset for a clean silhouette).
  const C = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[0,11],[0,12]];
  ctx.strokeStyle = 'rgba(224,176,74,0.9)';
  ctx.lineWidth = 2;
  for (const [a, b] of C) {
    const pa = landmarks[a]; const pb = landmarks[b];
    if (!pa || !pb) continue;
    ctx.beginPath();
    ctx.moveTo(pa.x * width, pa.y * height);
    ctx.lineTo(pb.x * width, pb.y * height);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(245,232,199,0.95)';
  for (const p of landmarks) {
    if (p.visibility != null && p.visibility < 0.4) continue;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}
