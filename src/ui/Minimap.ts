import { i18n } from '../i18n/I18nManager';
import type { MapConfig } from '../maps/MapData';
import type { MinimapSnapshot } from '../maps/MapManager';
import {
  getForestRiverCenterZ,
  getForestRiverHalfWidth,
  SNOW_LAKE_CENTER_X,
  SNOW_LAKE_CENTER_Z,
  SNOW_LAKE_RX,
  SNOW_LAKE_RZ,
} from '../maps/MapTerrain';

export class Minimap {
  readonly element: HTMLElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly titleEl: HTMLElement;
  private readonly zoneAlertEl: HTMLElement;

  private readonly backdropCanvas: HTMLCanvasElement;
  private readonly backdropCtx: CanvasRenderingContext2D;
  private cachedMapId: string | null = null;
  private expanded = false;
  private customAreaLabels: boolean | null = null;
  private lastTitleText = '';
  private lastZoneBadgeKey = '';
  private lastSnapshot: MinimapSnapshot | null = null;
  private unsubI18n: (() => void) | null = null;

  private readonly compactCorner: boolean;

  constructor(sizePx = 152, compactCorner = false) {
    this.compactCorner = compactCorner;
    this.element = document.createElement('div');
    if (compactCorner) {
      this.element.className =
        'relative rounded-sm p-[2px] bg-slate-950/80 border border-white/30 shadow-[0_2px_12px_rgba(0,0,0,0.6)] pointer-events-none select-none overflow-hidden';
      this.element.innerHTML = `
        <canvas class="block rounded-[2px]"></canvas>
        <div class="pointer-events-none absolute inset-x-0.5 bottom-0.5 flex items-center justify-between gap-1 px-1 py-0.5 rounded-[2px] bg-slate-950/78 text-[8px] font-black tracking-wider uppercase leading-none">
          <span data-role="map-title" class="text-slate-100 truncate">${i18n.translateMapName('desert')}</span>
          <span data-role="zone-alert" class="text-emerald-400 shrink-0">${i18n.t('minimap.safeZone')}</span>
        </div>
      `;
    } else {
      this.element.className =
        'nexus-panel rounded p-2 flex flex-col gap-1 pointer-events-none select-none';
      this.element.innerHTML = `
        <div class="flex items-center justify-between gap-2 text-[10px] font-extrabold tracking-widest uppercase">
          <span data-role="map-title" class="text-sky-400">${i18n.translateMapName('desert')}</span>
          <span data-role="zone-alert" class="text-emerald-400">${i18n.t('minimap.safeZone')}</span>
        </div>
        <canvas class="rounded border border-slate-700/80 block"></canvas>
      `;
    }

    this.titleEl = this.element.querySelector('[data-role="map-title"]')!;
    this.zoneAlertEl = this.element.querySelector('[data-role="zone-alert"]')!;
    this.canvas = this.element.querySelector('canvas')!;
    this.canvas.width = sizePx;
    this.canvas.height = sizePx;
    this.ctx = this.canvas.getContext('2d')!;

    this.backdropCanvas = document.createElement('canvas');
    this.backdropCanvas.width = sizePx;
    this.backdropCanvas.height = sizePx;
    this.backdropCtx = this.backdropCanvas.getContext('2d')!;

    this.unsubI18n = i18n.subscribe(() => {
      this.refreshLocale();
      if (this.lastSnapshot) {
        this.render(this.lastSnapshot);
      }
    });
  }

  refreshLocale(): void {
    this.cachedMapId = null;
    this.lastTitleText = '';
    this.lastZoneBadgeKey = '';
  }

  dispose(): void {
    this.unsubI18n?.();
    this.unsubI18n = null;
  }

  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    const expandedSize = typeof window !== 'undefined' && window.innerWidth >= 640 ? 276 : 228;
    const defaultSize = this.compactCorner
      ? (typeof window !== 'undefined' && window.innerWidth >= 640 ? 124 : 106)
      : 144;
    const size = expanded ? expandedSize : defaultSize;
    if (this.canvas.width !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
      this.backdropCanvas.width = size;
      this.backdropCanvas.height = size;
      this.cachedMapId = null;
    }
  }

  setCustomSize(sizePx: number, showAreaLabels?: boolean): void {
    if (showAreaLabels !== undefined) {
      this.customAreaLabels = showAreaLabels;
    }
    const size = Math.max(88, Math.round(sizePx));
    if (this.canvas.width !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
      this.backdropCanvas.width = size;
      this.backdropCanvas.height = size;
      this.cachedMapId = null;
    }
  }

  isExpanded(): boolean {
    return this.expanded;
  }

  private worldToMap(
    wx: number,
    wz: number,
    radius: number,
    size: number,
  ): [number, number] {
    const scale = (size * 0.45) / Math.max(1, radius);
    return [size * 0.5 + wx * scale, size * 0.5 + wz * scale];
  }

  private cacheMapBackdrop(config: MapConfig): void {
    const size = this.backdropCanvas.width;
    const ctx = this.backdropCtx;
    const r = config.radiusMeters;

    ctx.clearRect(0, 0, size, size);

    // Terrain base background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, size, size);

    // Playable terrain disc
    const [cx, cy] = this.worldToMap(0, 0, r, size);
    const playRadPx = size * 0.45;
    ctx.beginPath();
    ctx.arc(cx, cy, playRadPx, 0, Math.PI * 2);
    ctx.fillStyle = config.theme.groundAccentHex;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.stroke();

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const step = size / 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }

    const scale = (size * 0.45) / r;

    // Biome water / frozen lake features clipped to playable terrain disc
    if (!config.isWaitingArena && !config.isTrainingGround && (config.biome === 'forest' || config.biome === 'snow')) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, playRadPx, 0, Math.PI * 2);
      ctx.clip();

      if (config.biome === 'forest') {
        ctx.beginPath();
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
          const wx = -495 + (990 * i) / steps;
          const wz = getForestRiverCenterZ(wx);
          const [rx, ry] = this.worldToMap(wx, wz, r, size);
          if (i === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.strokeStyle = 'rgba(14, 116, 144, 0.88)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, getForestRiverHalfWidth(0) * 2.2 * scale);
        ctx.stroke();
      } else {
        const [lx, ly] = this.worldToMap(SNOW_LAKE_CENTER_X, SNOW_LAKE_CENTER_Z, r, size);
        ctx.beginPath();
        ctx.ellipse(lx, ly, SNOW_LAKE_RX * scale, SNOW_LAKE_RZ * scale, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(186, 230, 253, 0.72)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();
    }

    // Roads
    ctx.strokeStyle = config.theme.roadBorderHex;
    ctx.lineCap = 'round';
    for (const road of config.roads) {
      const [x1, y1] = this.worldToMap(road.startX, road.startZ, r, size);
      const [x2, y2] = this.worldToMap(road.endX, road.endZ, r, size);
      ctx.lineWidth = Math.max(1.8, road.width * scale);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Buildings
    for (const b of config.buildings) {
      const [bx, by] = this.worldToMap(b.x, b.z, r, size);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-b.rotationY);
      const bw = Math.max(2.6, b.width * scale);
      const bd = Math.max(2.6, b.depth * scale);
      ctx.fillStyle = b.style === 'military_base' ? '#fbbf24' : '#e2e8f0';
      ctx.fillRect(-bw * 0.5, -bd * 0.5, bw, bd);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(-bw * 0.5, -bd * 0.5, bw, bd);
      ctx.restore();
    }

    // Area names when expanded or full-map (crisp dark outline for readability)
    const showLabels = this.customAreaLabels ?? this.expanded;
    if (showLabels) {
      ctx.font = size >= 280 ? 'bold 10px Cairo, sans-serif' : 'bold 8px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size >= 280 ? 3.2 : 2.6;
      ctx.strokeStyle = 'rgba(7, 11, 20, 0.92)';
      ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
      for (const area of config.areas) {
        const [ax, ay] = this.worldToMap(area.x, area.z, r, size);
        const areaLabel = i18n.translateAreaName(area.name);
        ctx.strokeText(areaLabel, ax, ay);
        ctx.fillText(areaLabel, ax, ay);
      }
    }

    const arenaKey = config.isWaitingArena ? 'wait' : config.isTrainingGround ? 'train' : 'br';
    this.cachedMapId = `${config.id}:${arenaKey}:${size}:${i18n.getLanguage()}`;
  }

  render(snapshot: MinimapSnapshot): void {
    this.lastSnapshot = snapshot;
    const { config } = snapshot;
    const size = this.canvas.width;
    const arenaKey = config.isWaitingArena ? 'wait' : config.isTrainingGround ? 'train' : 'br';
    const cacheKey = `${config.id}:${arenaKey}:${size}:${i18n.getLanguage()}`;
    if (this.cachedMapId !== cacheKey) {
      this.cacheMapBackdrop(config);
    }

    const localizedTitle = i18n.translateMapName(
      config.isTrainingGround ? 'training_ground' : config.id,
    );
    if (this.lastTitleText !== localizedTitle) {
      this.lastTitleText = localizedTitle;
      this.titleEl.textContent = localizedTitle;
    }
    const badgeKey = config.isTrainingGround
      ? 'TRAINING'
      : snapshot.hideZoneOverlay
        ? 'STAGING'
        : snapshot.inDangerZone
          ? 'BLUE'
          : 'SAFE';
    if (this.lastZoneBadgeKey !== badgeKey) {
      this.lastZoneBadgeKey = badgeKey;
      if (badgeKey === 'TRAINING') {
        this.zoneAlertEl.textContent = i18n.t('minimap.training');
        this.zoneAlertEl.className = 'text-emerald-300';
      } else if (badgeKey === 'STAGING') {
        this.zoneAlertEl.textContent = i18n.t('minimap.staging');
        this.zoneAlertEl.className = 'text-sky-300';
      } else if (badgeKey === 'BLUE') {
        this.zoneAlertEl.textContent = i18n.t('minimap.blueZone');
        this.zoneAlertEl.className = 'text-sky-400';
      } else {
        this.zoneAlertEl.textContent = i18n.t('minimap.safeZone');
        this.zoneAlertEl.className = 'text-emerald-400';
      }
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.backdropCanvas, 0, 0);

    const r = config.radiusMeters;
    const scale = (size * 0.45) / Math.max(1, r);

    if (!snapshot.hideZoneOverlay) {
      // 1. Blue Zone Storm Overlay (translucent blue field outside current Safe Zone)
      const [sx, sy] = this.worldToMap(snapshot.safeCenterX, snapshot.safeCenterZ, r, size);
      const safeRadPx = snapshot.safeRadius * scale;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.arc(sx, sy, safeRadPx, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(37, 99, 235, 0.40)';
      ctx.fill('evenodd');
      ctx.restore();

      // 2. Current Safe Zone perimeter circle (high-contrast electric blue ring)
      ctx.beginPath();
      ctx.arc(sx, sy, safeRadPx, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(sx, sy, safeRadPx, 0, Math.PI * 2);
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.9;
      ctx.stroke();

      // 3. Next Safe Zone circle (dashed gold preview)
      if (snapshot.nextSafeRadius > 0) {
        const [nx, ny] = this.worldToMap(
          snapshot.nextSafeCenterX,
          snapshot.nextSafeCenterZ,
          r,
          size,
        );
        const nextRadPx = snapshot.nextSafeRadius * scale;
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(nx, ny, nextRadPx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.lineWidth = 2.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(nx, ny, nextRadPx, 0, Math.PI * 2);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Guidance line from player toward Safe Zone center when outside
        if (snapshot.inDangerZone) {
          const [pxGuide, pyGuide] = this.worldToMap(snapshot.playerX, snapshot.playerZ, r, size);
          ctx.beginPath();
          ctx.moveTo(pxGuide, pyGuide);
          ctx.lineTo(nx, ny);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
          ctx.lineWidth = 1.35;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 4. Future Teammate Markers
    for (let i = 0; i < snapshot.teammateMarkers.length; i++) {
      const m = snapshot.teammateMarkers[i];
      const [mx, my] = this.worldToMap(m.x, m.z, r, size);
      ctx.beginPath();
      ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 5. Future Enemy Markers (crimson pings)
    for (let i = 0; i < snapshot.enemyMarkers.length; i++) {
      const m = snapshot.enemyMarkers[i];
      const [ex, ey] = this.worldToMap(m.x, m.z, r, size);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
      ctx.restore();
    }

    // 5b. Airplane Flight Corridor & Live Plane Icon
    if (snapshot.flightOverlay) {
      const fl = snapshot.flightOverlay;
      const [fx1, fy1] = this.worldToMap(fl.startX, fl.startZ, r, size);
      const [fx2, fy2] = this.worldToMap(fl.endX, fl.endZ, r, size);

      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(fx1, fy1);
      ctx.lineTo(fx2, fy2);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(fx1, fy1, 2.2, 0, Math.PI * 2);
      ctx.arc(fx2, fy2, 2.2, 0, Math.PI * 2);
      ctx.fill();

      if (fl.showPlane) {
        const [ax, ay] = this.worldToMap(fl.planeX, fl.planeZ, r, size);
        ctx.translate(ax, ay);
        ctx.rotate(Math.PI - fl.planeHeadingRad);
        ctx.beginPath();
        ctx.moveTo(0, -6.5);
        ctx.lineTo(2, -1.5);
        ctx.lineTo(7, 1.5);
        ctx.lineTo(7, 3.2);
        ctx.lineTo(1.8, 1.5);
        ctx.lineTo(1.4, 5.2);
        ctx.lineTo(3.4, 6.8);
        ctx.lineTo(-3.4, 6.8);
        ctx.lineTo(-1.4, 5.2);
        ctx.lineTo(-1.8, 1.5);
        ctx.lineTo(-7, 3.2);
        ctx.lineTo(-7, 1.5);
        ctx.lineTo(-2, -1.5);
        ctx.closePath();
        ctx.fillStyle = '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Player Position & Direction Cone
    const [px, py] = this.worldToMap(snapshot.playerX, snapshot.playerZ, r, size);
    ctx.save();
    ctx.translate(px, py);
    // Camera forward in world (X, Z) is (-sin(yaw), -cos(yaw)); canvas Y+ is +Z
    ctx.rotate(-snapshot.playerDirectionRad);

    // Subtle field-of-view direction cone pointing toward -Y (world -Z when yaw=0)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-9, -18);
    ctx.lineTo(9, -18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
    ctx.fill();

    // Player directional chevron
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.8, 4.5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4.8, 4.5);
    ctx.closePath();
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}
