import * as THREE from 'three';

export interface GoldSaucerTextures {
  goldSaucerSign: THREE.CanvasTexture;
  mascotFace: THREE.CanvasTexture;
  wondermentSign: THREE.CanvasTexture;
  ghostSign: THREE.CanvasTexture;
  speedSign: THREE.CanvasTexture;
  battleSign: THREE.CanvasTexture;
  chocoboSign: THREE.CanvasTexture;
  showdownScreen: THREE.CanvasTexture;
  medallionParkCentral: THREE.CanvasTexture;
  medallionChocobo: THREE.CanvasTexture;
  medallionGhost: THREE.CanvasTexture;
  medallionBattle: THREE.CanvasTexture;
  medallionGoldSaucer: THREE.CanvasTexture;
  busBody: THREE.CanvasTexture;
  balloonStripe: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function finalizeTex(canvas: HTMLCanvasElement, owned: THREE.Texture[]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  owned.push(tex);
  return tex;
}

function buildGoldSaucerSign(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  ctx.clearRect(0, 0, 1024, 512);

  // Dark violet/magenta backing shield
  const bg = ctx.createLinearGradient(0, 40, 0, 480);
  bg.addColorStop(0, '#4a044e');
  bg.addColorStop(0.5, '#701a75');
  bg.addColorStop(1, '#2e1065');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(36, 36, 952, 440, 48);
  ctx.fill();

  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ff66e5';
  ctx.shadowColor = '#ff22cc';
  ctx.shadowBlur = 24;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // "WELCOME TO THE"
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 54px Inter, Impact, sans-serif';
  ctx.fillStyle = '#ffd1f7';
  ctx.shadowColor = '#ff44cc';
  ctx.shadowBlur = 16;
  ctx.fillText('WELCOME TO THE', 512, 118);

  // "GOLD"
  ctx.font = '900 132px Inter, Impact, sans-serif';
  const goldGrad = ctx.createLinearGradient(0, 175, 0, 290);
  goldGrad.addColorStop(0, '#ffffff');
  goldGrad.addColorStop(0.45, '#ffd7f8');
  goldGrad.addColorStop(1, '#ff77e9');
  ctx.fillStyle = goldGrad;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#6b0f6b';
  ctx.strokeText('GOLD', 512, 232);
  ctx.fillText('GOLD', 512, 232);

  // "SAUCER"
  ctx.font = '900 138px Inter, Impact, sans-serif';
  ctx.strokeText('SAUCER', 512, 370);
  ctx.fillText('SAUCER', 512, 370);
  ctx.shadowBlur = 0;

  return finalizeTex(c, owned);
}

function buildMascotFace(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  // Soft luminous pastel-white & pink gradient face
  const grad = ctx.createRadialGradient(256, 220, 40, 256, 256, 280);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.7, '#ffe6f7');
  grad.addColorStop(1, '#f5b8e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Rosy cheeks
  ctx.fillStyle = 'rgba(255, 110, 190, 0.48)';
  ctx.beginPath();
  ctx.ellipse(115, 295, 42, 26, 0, 0, Math.PI * 2);
  ctx.ellipse(397, 295, 42, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cute large dark oval eyes with white shine
  for (const ex of [168, 344]) {
    ctx.fillStyle = '#1e1035';
    ctx.beginPath();
    ctx.ellipse(ex, 225, 34, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex - 10, 206, 11, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cheerful cat/moogle smile + tiny fangs
  ctx.strokeStyle = '#3b0764';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(256, 280, 74, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = '#ff66b2';
  ctx.beginPath();
  ctx.ellipse(256, 258, 22, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  return finalizeTex(c, owned);
}

function buildWondermentSign(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 384);
  ctx.clearRect(0, 0, 1024, 384);

  // Dark translucent marquee strip
  ctx.fillStyle = 'rgba(18, 14, 44, 0.92)';
  ctx.beginPath();
  ctx.roundRect(40, 120, 944, 210, 32);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // Twinkling gold stars
  ctx.fillStyle = '#fde047';
  for (const [sx, sy] of [
    [130, 178],
    [894, 178],
    [220, 292],
    [804, 292],
  ]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 84px Inter, Impact, sans-serif';
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('WONDERMENT', 512, 205);

  ctx.font = '800 44px Inter, sans-serif';
  ctx.shadowColor = '#fbbf24';
  ctx.fillStyle = '#fde047';
  ctx.fillText('★  SQUARE  ★', 512, 282);
  ctx.shadowBlur = 0;

  return finalizeTex(c, owned);
}

function buildGhostSign(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 384);
  ctx.clearRect(0, 0, 1024, 384);

  ctx.fillStyle = 'rgba(19, 8, 42, 0.92)';
  ctx.beginPath();
  ctx.roundRect(30, 60, 964, 260, 30);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#a855f7';
  ctx.stroke();

  // Neon slime-green dripping underline
  ctx.fillStyle = '#4ade80';
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 22;
  ctx.fillRect(90, 268, 844, 16);
  for (let x = 130; x <= 880; x += 85) {
    ctx.beginPath();
    ctx.roundRect(x, 276, 16, 26 + ((x * 7) % 24), 8);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 94px Inter, Impact, sans-serif';
  ctx.fillStyle = '#4ade80';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#4c1d95';
  ctx.strokeText('GHOST SQUARE', 512, 195);
  ctx.fillText('GHOST SQUARE', 512, 195);
  ctx.shadowBlur = 0;

  return finalizeTex(c, owned);
}

function buildSpeedSign(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 384);
  ctx.clearRect(0, 0, 1024, 384);

  const grad = ctx.createLinearGradient(60, 0, 964, 0);
  grad.addColorStop(0, '#082f49');
  grad.addColorStop(0.5, '#0c4a6e');
  grad.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(44, 86, 936, 212, 34);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#38bdf8';
  ctx.shadowColor = '#0ea5e9';
  ctx.shadowBlur = 22;
  ctx.stroke();

  // Speed wing chevrons on left
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.moveTo(92, 148);
  ctx.lineTo(156, 192);
  ctx.lineTo(92, 236);
  ctx.lineTo(118, 192);
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 900 92px Inter, Impact, sans-serif';
  ctx.fillStyle = '#e0f2fe';
  ctx.fillText('SPEED SQUARE', 540, 196);
  ctx.shadowBlur = 0;

  return finalizeTex(c, owned);
}

function buildBattleSign(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 384);
  ctx.clearRect(0, 0, 1024, 384);

  const grad = ctx.createLinearGradient(0, 70, 0, 310);
  grad.addColorStop(0, '#450a0a');
  grad.addColorStop(0.5, '#7f1d1d');
  grad.addColorStop(1, '#290707');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(44, 86, 936, 212, 28);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#fb923c';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 24;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 94px Inter, Impact, sans-serif';
  const txtGrad = ctx.createLinearGradient(0, 130, 0, 250);
  txtGrad.addColorStop(0, '#fef08a');
  txtGrad.addColorStop(0.5, '#fb923c');
  txtGrad.addColorStop(1, '#ef4444');
  ctx.fillStyle = txtGrad;
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#1c0a0a';
  ctx.strokeText('BATTLE SQUARE', 512, 196);
  ctx.fillText('BATTLE SQUARE', 512, 196);
  ctx.shadowBlur = 0;

  return finalizeTex(c, owned);
}

function buildChocoboSign(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 448);
  ctx.clearRect(0, 0, 1024, 448);

  ctx.fillStyle = 'rgba(42, 10, 48, 0.92)';
  ctx.beginPath();
  ctx.roundRect(40, 56, 944, 336, 40);
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#f472b6';
  ctx.shadowColor = '#ec4899';
  ctx.shadowBlur = 24;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 900 104px Inter, Impact, sans-serif';
  ctx.fillStyle = '#f472b6';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#4a044e';
  ctx.strokeText('CHOCOBO', 512, 170);
  ctx.fillText('CHOCOBO', 512, 170);

  ctx.font = '900 84px Inter, Impact, sans-serif';
  ctx.shadowColor = '#fbbf24';
  ctx.fillStyle = '#fde047';
  ctx.strokeText('SQUARE', 512, 294);
  ctx.fillText('SQUARE', 512, 294);
  ctx.shadowBlur = 0;

  return finalizeTex(c, owned);
}

function buildShowdownScreen(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 320);
  const bg = ctx.createLinearGradient(0, 0, 512, 320);
  bg.addColorStop(0, '#1e1b4b');
  bg.addColorStop(0.5, '#6d28d9');
  bg.addColorStop(1, '#be185d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 320);

  // Diagonal dynamic stripes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  for (let i = -200; i < 650; i += 48) {
    ctx.beginPath();
    ctx.moveTo(i, 320);
    ctx.lineTo(i + 24, 320);
    ctx.lineTo(i + 150, 0);
    ctx.lineTo(i + 126, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 300);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 32px Inter, sans-serif';
  ctx.fillStyle = '#a5f3fc';
  ctx.fillText('MUSCLEHEAD COLOSSEUM', 256, 92);

  ctx.font = 'italic 900 68px Inter, Impact, sans-serif';
  const g = ctx.createLinearGradient(0, 130, 0, 220);
  g.addColorStop(0, '#fef08a');
  g.addColorStop(0.5, '#fb923c');
  g.addColorStop(1, '#f43f5e');
  ctx.fillStyle = g;
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 18;
  ctx.fillText('SHOWDOWN', 256, 178);
  ctx.shadowBlur = 0;

  ctx.font = '800 22px Inter, sans-serif';
  ctx.fillStyle = '#fde68a';
  ctx.fillText('★ LIVE ARENA EVENT ★', 256, 252);

  return finalizeTex(c, owned);
}

function buildFloorMedallion(
  line1: string,
  line2: string,
  accentHex: string,
  owned: THREE.Texture[],
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512);
  ctx.clearRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(18, 18, 28, 0.72)';
  ctx.beginPath();
  ctx.arc(256, 256, 232, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 14;
  ctx.strokeStyle = '#fff5e6';
  ctx.beginPath();
  ctx.arc(256, 256, 222, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.strokeStyle = accentHex;
  ctx.beginPath();
  ctx.arc(256, 256, 198, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px Inter, sans-serif';
  ctx.fillText(line1, 256, line2 ? 226 : 256);
  if (line2) {
    ctx.fillStyle = accentHex;
    ctx.font = '800 46px Inter, sans-serif';
    ctx.fillText(line2, 256, 290);
  }

  return finalizeTex(c, owned);
}

function buildBusBodyTexture(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);
  // Mustard yellow body + cream upper belt
  ctx.fillStyle = '#e5b84b';
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#f5ead6';
  ctx.fillRect(0, 0, 512, 118);
  ctx.fillStyle = '#b45309';
  ctx.fillRect(0, 116, 512, 14);

  // Warm illuminated passenger windows
  for (let x = 24; x < 480; x += 68) {
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.roundRect(x, 22, 54, 78, 8);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.roundRect(x + 4, 26, 46, 70, 6);
    ctx.fill();
  }

  return finalizeTex(c, owned);
}

function buildBalloonStripeTexture(owned: THREE.Texture[]): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 256);
  const cols = ['#8c4a3e', '#d48c70', '#b86852', '#f2baa0'];
  const stripeW = 512 / 12;
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = cols[i % cols.length];
    ctx.fillRect(i * stripeW, 0, stripeW + 1, 256);
  }
  const tex = finalizeTex(c, owned);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createGoldSaucerTextures(): GoldSaucerTextures {
  const owned: THREE.Texture[] = [];
  const goldSaucerSign = buildGoldSaucerSign(owned);
  const mascotFace = buildMascotFace(owned);
  const wondermentSign = buildWondermentSign(owned);
  const ghostSign = buildGhostSign(owned);
  const speedSign = buildSpeedSign(owned);
  const battleSign = buildBattleSign(owned);
  const chocoboSign = buildChocoboSign(owned);
  const showdownScreen = buildShowdownScreen(owned);
  const medallionParkCentral = buildFloorMedallion('Park', 'Central', '#fde68a', owned);
  const medallionChocobo = buildFloorMedallion('Chocobo', 'Square', '#f472b6', owned);
  const medallionGhost = buildFloorMedallion('Ghost', 'Square', '#a855f7', owned);
  const medallionBattle = buildFloorMedallion('Battle', 'Square', '#fb923c', owned);
  const medallionGoldSaucer = buildFloorMedallion('GOLD', 'SAUCER', '#ff66e5', owned);
  const busBody = buildBusBodyTexture(owned);
  const balloonStripe = buildBalloonStripeTexture(owned);

  return {
    goldSaucerSign,
    mascotFace,
    wondermentSign,
    ghostSign,
    speedSign,
    battleSign,
    chocoboSign,
    showdownScreen,
    medallionParkCentral,
    medallionChocobo,
    medallionGhost,
    medallionBattle,
    medallionGoldSaucer,
    busBody,
    balloonStripe,
    dispose: () => {
      for (const t of owned) t.dispose();
      owned.length = 0;
    },
  };
}
