import * as THREE from 'three';
import type {
  R6EyeStyleId,
  R6FaceMarkId,
  R6MouthStyleId,
  R6PantsGarmentType,
  R6TopGarmentType,
  R6TopPatternVariant,
} from '../player/R6CustomizationData';

const FACE_TEX_CACHE = new Map<string, THREE.CanvasTexture>();
const TOP_TEX_CACHE = new Map<string, THREE.CanvasTexture>();
const PANTS_TEX_CACHE = new Map<string, THREE.CanvasTexture>();

export interface R6FaceTextureParams {
  skinBaseHex: string;
  skinShadeHex: string;
  eyesId: R6EyeStyleId;
  eyeHex: string;
  mouthId: R6MouthStyleId;
  faceMarkId?: R6FaceMarkId;
  hairColorHex: string;
  gender: 'male' | 'female';
}

export function getR6FaceTexture(params: R6FaceTextureParams): THREE.CanvasTexture {
  const faceMarkId: R6FaceMarkId = params.faceMarkId ?? 'none';
  const key = `${params.skinBaseHex}|${params.eyesId}|${params.eyeHex}|${params.mouthId}|${faceMarkId}|${params.hairColorHex}|${params.gender}`;
  const existing = FACE_TEX_CACHE.get(key);
  if (existing) return existing;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base face skin with subtle warm cheek & jaw shading (matches R6 head material cleanly)
  ctx.fillStyle = params.skinBaseHex;
  ctx.fillRect(0, 0, size, size);

  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(255,255,255,0.06)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle nose/cheek blush
  ctx.fillStyle = params.gender === 'female' ? 'rgba(244, 114, 130, 0.14)' : 'rgba(220, 110, 90, 0.08)';
  ctx.beginPath();
  ctx.ellipse(size * 0.25, size * 0.56, 20, 11, 0, 0, Math.PI * 2);
  ctx.ellipse(size * 0.75, size * 0.56, 20, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  const leftEyeX = size * 0.34;
  const rightEyeX = size * 0.66;
  const eyeY = size * 0.44;

  // Eyebrows
  ctx.strokeStyle = params.hairColorHex;
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  if (params.eyesId === 'determined' || params.eyesId === 'sharp_hawk') {
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 24, eyeY - 35);
    ctx.lineTo(leftEyeX + 19, eyeY - 21);
    ctx.moveTo(rightEyeX + 24, eyeY - 35);
    ctx.lineTo(rightEyeX - 19, eyeY - 21);
    ctx.stroke();
  } else if (params.eyesId === 'squint_ace') {
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 22, eyeY - 26);
    ctx.lineTo(leftEyeX + 19, eyeY - 20);
    ctx.moveTo(rightEyeX + 22, eyeY - 26);
    ctx.lineTo(rightEyeX - 19, eyeY - 20);
    ctx.stroke();
  } else if (params.eyesId === 'gentle_round') {
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 20, eyeY - 29);
    ctx.quadraticCurveTo(leftEyeX, eyeY - 37, leftEyeX + 18, eyeY - 30);
    ctx.moveTo(rightEyeX - 18, eyeY - 30);
    ctx.quadraticCurveTo(rightEyeX, eyeY - 37, rightEyeX + 20, eyeY - 29);
    ctx.stroke();
  } else if (params.eyesId === 'wink') {
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 20, eyeY - 28);
    ctx.quadraticCurveTo(leftEyeX, eyeY - 34, leftEyeX + 20, eyeY - 26);
    ctx.moveTo(rightEyeX - 20, eyeY - 24);
    ctx.quadraticCurveTo(rightEyeX, eyeY - 32, rightEyeX + 20, eyeY - 26);
    ctx.stroke();
  } else if (params.eyesId !== 'cyber_glow') {
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 20, eyeY - 26);
    ctx.quadraticCurveTo(leftEyeX, eyeY - 32, leftEyeX + 20, eyeY - 27);
    ctx.moveTo(rightEyeX - 20, eyeY - 27);
    ctx.quadraticCurveTo(rightEyeX, eyeY - 32, rightEyeX + 20, eyeY - 26);
    ctx.stroke();
  }

  // Brow slash notch applied directly over left eyebrow
  if (faceMarkId === 'brow_slash') {
    ctx.strokeStyle = params.skinBaseHex;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(leftEyeX + 2, eyeY - 38);
    ctx.lineTo(leftEyeX - 5, eyeY - 19);
    ctx.stroke();
  }

  // Eyes
  const drawScleraEye = (cx: number, cy: number, rx: number, ry: number, irisColor: string, isLeft: boolean) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = irisColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, rx * 0.68, ry * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#090d14';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, rx * 0.38, ry * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();

    // Specular catchlight
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - rx * 0.28, cy - ry * 0.28, Math.max(3, rx * 0.22), 0, Math.PI * 2);
    ctx.fill();

    // Lash / upper lid accent
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = params.gender === 'female' ? 6 : 4;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    if (params.gender === 'female') {
      const tipX = isLeft ? cx - rx - 5 : cx + rx + 5;
      ctx.beginPath();
      ctx.moveTo(isLeft ? cx - rx + 1 : cx + rx - 1, cy - 3);
      ctx.lineTo(tipX, cy - 8);
      ctx.stroke();
    }
  };

  if (params.eyesId === 'classic_r6') {
    for (const cx of [leftEyeX, rightEyeX]) {
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.ellipse(cx, eyeY, 13, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 4, eyeY - 6, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (params.eyesId === 'determined') {
    drawScleraEye(leftEyeX, eyeY, 17, 15, params.eyeHex, true);
    drawScleraEye(rightEyeX, eyeY, 17, 15, params.eyeHex, false);
  } else if (params.eyesId === 'anime_bright') {
    drawScleraEye(leftEyeX, eyeY, 19, 22, params.eyeHex, true);
    drawScleraEye(rightEyeX, eyeY, 19, 22, params.eyeHex, false);
  } else if (params.eyesId === 'sharp_hawk') {
    for (const [cx, isLeft] of [
      [leftEyeX, true],
      [rightEyeX, false],
    ] as const) {
      drawScleraEye(cx, eyeY + 1, 18, 12, params.eyeHex, isLeft);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 19, isLeft ? eyeY - 8 : eyeY - 3);
      ctx.lineTo(cx + 19, isLeft ? eyeY - 3 : eyeY - 8);
      ctx.stroke();
    }
  } else if (params.eyesId === 'gentle_round') {
    drawScleraEye(leftEyeX, eyeY, 18, 20, params.eyeHex, true);
    drawScleraEye(rightEyeX, eyeY, 18, 20, params.eyeHex, false);
  } else if (params.eyesId === 'star_spark') {
    for (const [cx, isLeft] of [
      [leftEyeX, true],
      [rightEyeX, false],
    ] as const) {
      drawScleraEye(cx, eyeY, 19, 21, params.eyeHex, isLeft);
      // Four-point star highlight centered inside iris
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(cx, cyOffset(eyeY, -8));
      ctx.lineTo(cx + 3, eyeY + 1);
      ctx.lineTo(cx + 8, eyeY + 2);
      ctx.lineTo(cx + 3, eyeY + 4);
      ctx.lineTo(cx, cyOffset(eyeY, 11));
      ctx.lineTo(cx - 3, eyeY + 4);
      ctx.lineTo(cx - 8, eyeY + 2);
      ctx.lineTo(cx - 3, eyeY + 1);
      ctx.closePath();
      ctx.fill();
    }
  } else if (params.eyesId === 'squint_ace') {
    for (const [cx, isLeft] of [
      [leftEyeX, true],
      [rightEyeX, false],
    ] as const) {
      drawScleraEye(cx, eyeY + 2, 17, 9.5, params.eyeHex, isLeft);
      ctx.fillStyle = params.skinBaseHex;
      ctx.fillRect(cx - 21, eyeY - 14, 42, 11);
      ctx.fillRect(cx - 21, eyeY + 10, 42, 7);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(cx - 19, eyeY - 3);
      ctx.lineTo(cx + 19, eyeY - 3);
      ctx.stroke();
    }
  } else if (params.eyesId === 'wink') {
    drawScleraEye(leftEyeX, eyeY, 17, 19, params.eyeHex, true);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(rightEyeX - 18, eyeY + 2);
    ctx.quadraticCurveTo(rightEyeX, eyeY - 12, rightEyeX + 18, eyeY + 2);
    ctx.stroke();
  } else if (params.eyesId === 'chill_cool') {
    for (const [cx, isLeft] of [
      [leftEyeX, true],
      [rightEyeX, false],
    ] as const) {
      drawScleraEye(cx, eyeY + 3, 17, 13, params.eyeHex, isLeft);
      ctx.fillStyle = params.skinBaseHex;
      ctx.fillRect(cx - 21, eyeY - 16, 42, 14);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - 19, eyeY - 2);
      ctx.lineTo(cx + 19, eyeY - 2);
      ctx.stroke();
    }
  } else if (params.eyesId === 'cyber_glow') {
    for (const cx of [leftEyeX, rightEyeX]) {
      ctx.fillStyle = '#090d14';
      ctx.beginPath();
      ctx.roundRect(cx - 20, eyeY - 10, 40, 20, 6);
      ctx.fill();
      ctx.fillStyle = params.eyeHex || '#22d3ee';
      ctx.beginPath();
      ctx.roundRect(cx - 14, eyeY - 5, 28, 10, 4);
      ctx.fill();
      ctx.fillStyle = '#ecfeff';
      ctx.fillRect(cx - 8, eyeY - 2, 16, 3);
    }
  }

  // Facial Marks (before/under mouth or across cheeks/nose)
  if (faceMarkId === 'freckles') {
    ctx.fillStyle = 'rgba(146, 64, 14, 0.55)';
    const pts: Array<[number, number, number]> = [
      [leftEyeX - 8, size * 0.55, 2.3],
      [leftEyeX + 4, size * 0.57, 2.0],
      [leftEyeX - 2, size * 0.59, 2.2],
      [size * 0.47, size * 0.54, 1.9],
      [size * 0.53, size * 0.54, 1.9],
      [rightEyeX - 4, size * 0.57, 2.0],
      [rightEyeX + 8, size * 0.55, 2.3],
      [rightEyeX + 2, size * 0.59, 2.2],
    ];
    for (const [fx, fy, r] of pts) {
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (faceMarkId === 'beauty_mark') {
    ctx.fillStyle = '#1e1b18';
    ctx.beginPath();
    ctx.arc(rightEyeX + 12, eyeY + 25, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (faceMarkId === 'cheek_stripe') {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(leftEyeX - 15, eyeY + 21, 30, 8);
    ctx.fillRect(rightEyeX - 15, eyeY + 21, 30, 8);
  } else if (faceMarkId === 'bandage_nose') {
    ctx.save();
    ctx.translate(size * 0.5, size * 0.54);
    ctx.rotate(-0.14);
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-24, -8, 48, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-10, -6, 20, 12);
    ctx.restore();
  } else if (faceMarkId === 'scar_left') {
    ctx.strokeStyle = '#991b1b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 4, eyeY - 26);
    ctx.lineTo(leftEyeX + 8, eyeY + 34);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(254, 202, 202, 0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 2, eyeY - 25);
    ctx.lineTo(leftEyeX + 9, eyeY + 33);
    ctx.stroke();
  } else if (faceMarkId === 'scar_cross') {
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.43, size * 0.49);
    ctx.lineTo(size * 0.58, size * 0.58);
    ctx.stroke();
  } else if (faceMarkId === 'cyber_circuit') {
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.14, size * 0.57);
    ctx.lineTo(size * 0.25, size * 0.57);
    ctx.lineTo(size * 0.30, size * 0.64);
    ctx.moveTo(size * 0.86, size * 0.57);
    ctx.lineTo(size * 0.75, size * 0.57);
    ctx.lineTo(size * 0.70, size * 0.64);
    ctx.stroke();
    ctx.fillStyle = '#ecfeff';
    ctx.beginPath();
    ctx.arc(size * 0.30, size * 0.64, 3, 0, Math.PI * 2);
    ctx.arc(size * 0.70, size * 0.64, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (faceMarkId === 'whisker_paint') {
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.18, size * 0.56);
    ctx.lineTo(size * 0.28, size * 0.61);
    ctx.moveTo(size * 0.19, size * 0.63);
    ctx.lineTo(size * 0.29, size * 0.67);
    ctx.moveTo(size * 0.82, size * 0.56);
    ctx.lineTo(size * 0.72, size * 0.61);
    ctx.moveTo(size * 0.81, size * 0.63);
    ctx.lineTo(size * 0.71, size * 0.67);
    ctx.stroke();
  } else if (faceMarkId === 'stubble') {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.18)';
    ctx.beginPath();
    ctx.roundRect(size * 0.22, size * 0.65, size * 0.56, size * 0.32, 26);
    ctx.fill();
  } else if (faceMarkId === 'goatee') {
    ctx.fillStyle = params.hairColorHex;
    // Neat mustache arc + chin goatee patch
    ctx.beginPath();
    ctx.moveTo(size * 0.38, size * 0.66);
    ctx.quadraticCurveTo(size * 0.5, size * 0.61, size * 0.62, size * 0.66);
    ctx.quadraticCurveTo(size * 0.5, size * 0.66, size * 0.38, size * 0.66);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(size * 0.43, size * 0.78, size * 0.14, size * 0.15, 6);
    ctx.fill();
  }

  // Mouths
  const mouthY = size * 0.72;
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#111827';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (params.mouthId === 'classic_smile') {
    ctx.beginPath();
    ctx.arc(size * 0.5, mouthY - 8, 28, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  } else if (params.mouthId === 'warm_smile') {
    ctx.strokeStyle = '#331c1a';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.arc(size * 0.5, mouthY - 10, 30, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225, 29, 72, 0.28)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(size * 0.43, mouthY + 19);
    ctx.lineTo(size * 0.57, mouthY + 19);
    ctx.stroke();
  } else if (params.mouthId === 'confident_grin') {
    ctx.beginPath();
    ctx.moveTo(size * 0.37, mouthY - 4);
    ctx.quadraticCurveTo(size * 0.5, mouthY + 24, size * 0.63, mouthY - 4);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();
  } else if (params.mouthId === 'determined_grit') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(size * 0.38, mouthY - 6, size * 0.24, 15, 5);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size * 0.39, mouthY + 1);
    ctx.lineTo(size * 0.61, mouthY + 1);
    ctx.moveTo(size * 0.45, mouthY - 6);
    ctx.lineTo(size * 0.45, mouthY + 9);
    ctx.moveTo(size * 0.55, mouthY - 6);
    ctx.lineTo(size * 0.55, mouthY + 9);
    ctx.stroke();
  } else if (params.mouthId === 'smirk') {
    ctx.beginPath();
    ctx.moveTo(size * 0.4, mouthY + 3);
    ctx.quadraticCurveTo(size * 0.54, mouthY + 6, size * 0.62, mouthY - 9);
    ctx.stroke();
  } else if (params.mouthId === 'feline_smirk') {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(size * 0.38, mouthY - 2);
    ctx.quadraticCurveTo(size * 0.44, mouthY + 9, size * 0.50, mouthY + 1);
    ctx.quadraticCurveTo(size * 0.56, mouthY + 9, size * 0.62, mouthY - 2);
    ctx.stroke();
  } else if (params.mouthId === 'whistle_o') {
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(size * 0.5, mouthY + 3, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (params.mouthId === 'serious') {
    ctx.beginPath();
    ctx.moveTo(size * 0.4, mouthY);
    ctx.lineTo(size * 0.6, mouthY);
    ctx.stroke();
  } else if (params.mouthId === 'happy_open') {
    ctx.beginPath();
    ctx.moveTo(size * 0.37, mouthY - 6);
    ctx.lineTo(size * 0.63, mouthY - 6);
    ctx.quadraticCurveTo(size * 0.5, mouthY + 30, size * 0.37, mouthY - 6);
    ctx.closePath();
    ctx.fillStyle = '#991b1b';
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.ellipse(size * 0.5, mouthY + 10, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(size * 0.4, mouthY - 4, size * 0.2, 7);
  } else {
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(size * 0.43, mouthY + 1);
    ctx.quadraticCurveTo(size * 0.5, mouthY + 4, size * 0.57, mouthY + 1);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  FACE_TEX_CACHE.set(key, texture);
  return texture;
}

function cyOffset(y: number, delta: number): number {
  return y + delta;
}

export function getR6TopFrontTexture(
  garmentType: R6TopGarmentType,
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  innerHex: string,
  patternVariant: R6TopPatternVariant = 'standard',
): THREE.CanvasTexture {
  const key = `${garmentType}|${patternVariant}|${primaryHex}|${secondaryHex}|${accentHex}|${innerHex}`;
  const existing = TOP_TEX_CACHE.get(key);
  if (existing) return existing;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle fabric weave vertical shading
  const shade = ctx.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, 'rgba(255,255,255,0.06)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.14)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);

  if (garmentType === 'hoodie') {
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(0, size - 28, size, 28);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.moveTo(size * 0.22, size - 30);
    ctx.lineTo(size * 0.28, size - 88);
    ctx.lineTo(size * 0.72, size - 88);
    ctx.lineTo(size * 0.78, size - 30);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = accentHex;
    ctx.fillRect(size * 0.36, size * 0.32, size * 0.28, 10);
    ctx.fillStyle = innerHex;
    ctx.fillRect(size * 0.42, size * 0.39, size * 0.16, 5);
  } else if (garmentType === 'tshirt') {
    ctx.fillStyle = innerHex;
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.36, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accentHex;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.21);
    ctx.lineTo(size * 0.65, size * 0.46);
    ctx.lineTo(size * 0.35, size * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(size * 0.22, size * 0.59, size * 0.56, 8);
  } else if (garmentType === 'bomber' || garmentType === 'jacket' || garmentType === 'varsity') {
    ctx.fillStyle = innerHex;
    ctx.fillRect(size * 0.38, 0, size * 0.24, size - 20);
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(0, size - 24, size, 24);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, size - 15, size, 5);
    ctx.fillStyle = accentHex;
    ctx.fillRect(size * 0.36, 0, 6, size - 20);
    ctx.fillRect(size * 0.64 - 6, 0, 6, size - 20);
  } else if (garmentType === 'puffer') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 44; y < size - 20; y += 44) {
      ctx.fillRect(0, y, size, 6);
    }
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(size * 0.48, 0, 10, size);
    ctx.fillStyle = accentHex;
    ctx.fillRect(size * 0.62, 54, 30, 14);
  } else {
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(0, size * 0.52, size, size * 0.48);
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, size * 0.48, size, 12);
    ctx.fillStyle = innerHex;
    ctx.fillRect(size * 0.485, 0, 8, size);
  }

  // Additional pattern variant graphic overlays so every outfit stands out distinctly
  if (patternVariant === 'chevron') {
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(size * 0.14, size * 0.24);
    ctx.lineTo(size * 0.5, size * 0.42);
    ctx.lineTo(size * 0.86, size * 0.24);
    ctx.stroke();
  } else if (patternVariant === 'stripe') {
    ctx.fillStyle = accentHex;
    ctx.fillRect(0, size * 0.44, size, 12);
    ctx.fillStyle = innerHex;
    ctx.fillRect(0, size * 0.52, size, 5);
  } else if (patternVariant === 'crest') {
    ctx.fillStyle = accentHex;
    ctx.beginPath();
    ctx.roundRect(size * 0.66, size * 0.22, 34, 38, 6);
    ctx.fill();
    ctx.fillStyle = innerHex;
    ctx.fillRect(size * 0.71, size * 0.30, 10, 20);
  } else if (patternVariant === 'camo') {
    ctx.fillStyle = secondaryHex;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(size * 0.22, size * 0.28, 32, 18, 0.3, 0, Math.PI * 2);
    ctx.ellipse(size * 0.76, size * 0.66, 36, 20, -0.4, 0, Math.PI * 2);
    ctx.ellipse(size * 0.34, size * 0.74, 28, 16, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (patternVariant === 'grid') {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    for (let g = 32; g < size; g += 32) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, size);
      ctx.moveTo(0, g);
      ctx.lineTo(size, g);
      ctx.stroke();
    }
  } else if (patternVariant === 'split') {
    ctx.fillStyle = secondaryHex;
    ctx.fillRect(size * 0.5, 0, size * 0.5, size * 0.48);
  } else if (patternVariant === 'bolt') {
    ctx.fillStyle = accentHex;
    ctx.beginPath();
    ctx.moveTo(size * 0.56, size * 0.16);
    ctx.lineTo(size * 0.38, size * 0.45);
    ctx.lineTo(size * 0.50, size * 0.45);
    ctx.lineTo(size * 0.43, size * 0.72);
    ctx.lineTo(size * 0.64, size * 0.39);
    ctx.lineTo(size * 0.52, size * 0.39);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  TOP_TEX_CACHE.set(key, texture);
  return texture;
}

export function getR6PantsTexture(
  garmentType: R6PantsGarmentType,
  baseHex: string,
  shadeHex: string,
  accentHex: string,
): THREE.CanvasTexture {
  const key = `${garmentType}|${baseHex}|${shadeHex}|${accentHex}`;
  const existing = PANTS_TEX_CACHE.get(key);
  if (existing) return existing;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  if (garmentType === 'jeans') {
    // Denim wash subtle vertical streaks & gold side stitching
    ctx.fillStyle = shadeHex;
    ctx.fillRect(0, 0, 12, size);
    ctx.fillRect(size - 12, 0, 12, size);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(size * 0.25, size * 0.15, size * 0.5, size * 0.65);
    ctx.fillStyle = accentHex;
    ctx.fillRect(8, 0, 2, size);
    ctx.fillRect(size - 10, 0, 2, size);
  } else if (garmentType === 'joggers') {
    // Side athletic stripe
    ctx.fillStyle = accentHex;
    ctx.fillRect(size - 18, 0, 8, size);
    ctx.fillStyle = shadeHex;
    ctx.fillRect(0, size - 14, size, 14);
  } else if (garmentType === 'cargo') {
    // Knee seam & utility stitching
    ctx.fillStyle = shadeHex;
    ctx.fillRect(10, size * 0.45, size - 20, 6);
    ctx.fillStyle = accentHex;
    ctx.fillRect(14, size * 0.42, size - 28, 3);
  } else {
    ctx.fillStyle = shadeHex;
    ctx.fillRect(0, size - 10, size, 10);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  texture.needsUpdate = true;
  PANTS_TEX_CACHE.set(key, texture);
  return texture;
}
