import {
  formatGlbFileSize,
  resolveGlbStoreClassification,
  sanitizeAccentHex,
  type GlbAssetKind,
  type GlbAssetRecord,
  type GlbEquipSlot,
  type GlbRarity,
} from '../../shop/GlbAssetTypes';
import {
  arrayBufferToBase64,
  validateAndParseGlbArrayBuffer,
  type ClientGlbValidationResult,
} from '../../shop/GlbClientValidator';
import { glbModelCache } from '../../shop/GlbModelCache';
import { glbStoreClient } from '../../shop/GlbStoreClient';
import { GlbInteractivePreview } from '../components/GlbInteractivePreview';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COSMETIC_SLOTS: ReadonlyArray<{ value: GlbEquipSlot; label: string }> = [
  { value: 'backpack', label: 'Backpack (Equipment)' },
  { value: 'helmet', label: 'Helmet (Armor / Head)' },
  { value: 'armor', label: 'Armor Vest (Armor)' },
  { value: 'accessory', label: 'Accessory (Clothing)' },
  { value: 'glider', label: 'Glider (Equipment)' },
  { value: 'weapon', label: 'Weapon Model (Weapons)' },
  { value: 'gloo-wall', label: 'Gloo Wall Skin (Gloo Walls)' },
];

const RARITY_OPTIONS: readonly GlbRarity[] = ['Common', 'Rare', 'Epic', 'Legendary'];

export interface GlbImportPanelCallbacks {
  onCatalogChanged: () => Promise<void>;
}

export class GlbImportPanel {
  readonly element: HTMLElement;
  private readonly preview3D: GlbInteractivePreview;

  private devAssets: GlbAssetRecord[] = [];
  private loadingAssets = false;
  private submitting = false;
  private editingAssetId: string | null = null;
  private confirmDeleteAssetId: string | null = null;

  private pendingFileName = '';
  private pendingGlbBase64: string | null = null;
  private pendingValidation: Extract<ClientGlbValidationResult, { ok: true }> | null = null;
  private pendingPreviewDataUrl: string | null = null;
  private clearExistingPreviewOnSave = false;

  private readonly fileInputEl: HTMLInputElement;
  private readonly previewFileInputEl: HTMLInputElement;
  private readonly dropzoneEl: HTMLElement;
  private readonly validationBoxEl: HTMLElement;
  private readonly formTitleEl: HTMLElement;
  private readonly nameInputEl: HTMLInputElement;
  private readonly descInputEl: HTMLTextAreaElement;
  private readonly assetTypeSelectEl: HTMLSelectElement;
  private readonly equipSlotWrapEl: HTMLElement;
  private readonly equipSlotSelectEl: HTMLSelectElement;
  private readonly categoryHintEl: HTMLElement;
  private readonly raritySelectEl: HTMLSelectElement;
  private readonly priceInputEl: HTMLInputElement;
  private readonly scaleInputEl: HTMLInputElement;
  private readonly accentInputEl: HTMLInputElement;
  private readonly previewThumbImgEl: HTMLImageElement;
  private readonly previewThumbEmptyEl: HTMLElement;
  private readonly captureThumbBtnEl: HTMLButtonElement;
  private readonly clearThumbBtnEl: HTMLButtonElement;
  private readonly submitDraftBtnEl: HTMLButtonElement;
  private readonly submitPublishBtnEl: HTMLButtonElement;
  private readonly cancelEditBtnEl: HTMLButtonElement;
  private readonly feedbackEl: HTMLElement;
  private readonly assetsListEl: HTMLElement;
  private readonly assetsCountEl: HTMLElement;
  private readonly refreshBtnEl: HTMLButtonElement;

  constructor(private readonly callbacks: GlbImportPanelCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'w-full h-full min-h-0 flex flex-col lg:flex-row gap-3 sm:gap-4 pb-4';

    this.element.innerHTML = `
      <!-- Left Column: Importer & Metadata Form -->
      <section class="w-full lg:w-[440px] xl:w-[470px] shrink-0 nexus-panel rounded-lg p-3.5 sm:p-4 flex flex-col gap-3 min-h-0 lg:nexus-scroll lg:overflow-y-auto">
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div>
            <div class="text-[10px] font-black tracking-[0.2em] uppercase text-amber-300">DEVELOPER STUDIO</div>
            <h2 data-role="form-title" class="text-sm sm:text-base font-black tracking-wide uppercase text-white">
              GLB IMPORT — NEW 3D ASSET
            </h2>
          </div>
          <button
            type="button"
            data-action="cancel-edit"
            class="hidden nexus-btn-secondary px-2.5 py-1.5 rounded text-[11px] font-bold uppercase"
          >New Import</button>
        </div>

        <!-- Dropzone / File Picker -->
        <div
          data-role="glb-dropzone"
          class="rounded-md border-2 border-dashed border-sky-500/45 bg-slate-900/75 hover:border-sky-400 transition-colors p-3 flex flex-col items-center justify-center text-center gap-1.5 cursor-pointer"
        >
          <input data-role="glb-file-input" type="file" accept=".glb,model/gltf-binary" class="hidden" />
          <div class="text-xs font-extrabold uppercase tracking-wider text-sky-200">
            Select or Drop .GLB File
          </div>
          <div class="text-[11px] text-slate-400">
            Binary glTF 2.0 · Embedded textures/materials · Max 15 MB
          </div>
        </div>

        <!-- Validation Specs -->
        <div data-role="validation-box" class="hidden rounded-md border border-slate-800 bg-slate-950/85 p-2.5 text-[11px] flex flex-col gap-1.5"></div>

        <!-- Live 3D Viewport -->
        <div data-role="preview-mount" class="w-full"></div>

        <!-- Preview Thumbnail Controls -->
        <div class="flex items-center gap-2.5 bg-slate-900/80 border border-slate-800 rounded-md p-2">
          <div class="w-16 h-12 rounded bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
            <img data-role="thumb-img" src="" alt="Preview" class="hidden w-full h-full object-contain" />
            <span data-role="thumb-empty" class="text-[10px] text-slate-500 font-bold uppercase">No Img</span>
          </div>
          <div class="flex flex-wrap items-center gap-1.5 flex-1">
            <button
              type="button"
              data-action="capture-thumb"
              class="nexus-btn-secondary px-2.5 py-1.5 rounded text-[11px] font-bold uppercase border-sky-400/50 text-sky-200"
            >Capture 3D Thumb</button>
            <label class="nexus-btn-secondary px-2.5 py-1.5 rounded text-[11px] font-bold uppercase cursor-pointer">
              Upload Img
              <input data-role="preview-file-input" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" />
            </label>
            <button
              type="button"
              data-action="clear-thumb"
              class="hidden px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold uppercase text-slate-300 hover:border-rose-400"
            >Clear</button>
          </div>
        </div>

        <!-- Store Listing Metadata -->
        <div class="grid grid-cols-1 gap-2.5">
          <label class="flex flex-col gap-1">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Asset Name</span>
            <input
              data-role="input-name"
              type="text"
              maxlength="64"
              placeholder="e.g. Cyber Vanguard Operator"
              class="w-full rounded bg-slate-950 border border-slate-700 focus:border-sky-400 outline-none px-2.5 py-2 text-xs text-white"
            />
          </label>

          <label class="flex flex-col gap-1">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Description</span>
            <textarea
              data-role="input-desc"
              rows="2"
              maxlength="320"
              placeholder="Describe character model, skin, or 3D cosmetic..."
              class="w-full rounded bg-slate-950 border border-slate-700 focus:border-sky-400 outline-none px-2.5 py-2 text-xs text-white resize-none"
            ></textarea>
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Asset Type</span>
              <select
                data-role="select-type"
                class="w-full rounded bg-slate-950 border border-slate-700 focus:border-sky-400 outline-none px-2 py-2 text-xs text-white"
              >
                <option value="character">Character Model</option>
                <option value="skin">Character Skin / Outfit</option>
                <option value="cosmetic">3D Cosmetic Asset</option>
              </select>
            </label>

            <label data-role="slot-wrap" class="flex flex-col gap-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Cosmetic Slot</span>
              <select
                data-role="select-slot"
                class="w-full rounded bg-slate-950 border border-slate-700 focus:border-sky-400 outline-none px-2 py-2 text-xs text-white"
              >
                ${COSMETIC_SLOTS.map((s) => `<option value="${s.value}">${escapeHtml(s.label)}</option>`).join('')}
              </select>
            </label>
          </div>

          <div data-role="category-hint" class="text-[11px] font-semibold text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded px-2.5 py-1.5"></div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Rarity</span>
              <select
                data-role="select-rarity"
                class="w-full rounded bg-slate-950 border border-slate-700 px-2 py-2 text-xs text-white"
              >
                ${RARITY_OPTIONS.map((r) => `<option value="${r}">${r}</option>`).join('')}
              </select>
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Price (NX)</span>
              <input
                data-role="input-price"
                type="number"
                min="0"
                max="1000000"
                step="50"
                value="1200"
                class="w-full rounded bg-slate-950 border border-slate-700 px-2 py-2 text-xs text-white tabular-nums"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Scale</span>
              <input
                data-role="input-scale"
                type="number"
                min="0.2"
                max="3"
                step="0.05"
                value="1"
                class="w-full rounded bg-slate-950 border border-slate-700 px-2 py-2 text-xs text-white tabular-nums"
              />
            </label>

            <label class="flex flex-col gap-1">
              <span class="text-[11px] font-bold uppercase tracking-wider text-slate-300">Accent</span>
              <input
                data-role="input-accent"
                type="color"
                value="#38bdf8"
                class="w-full h-[34px] rounded bg-slate-950 border border-slate-700 p-0.5 cursor-pointer"
              />
            </label>
          </div>
        </div>

        <div data-role="feedback-box" class="hidden rounded-md px-3 py-2 text-xs font-semibold border"></div>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            data-action="submit-draft"
            class="nexus-btn-secondary py-2.5 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[42px]"
          >Save Draft</button>
          <button
            type="button"
            data-action="submit-publish"
            class="nexus-btn-primary py-2.5 px-3 rounded-md text-xs font-black tracking-wider uppercase min-h-[42px]"
          >Import & Publish</button>
        </div>
      </section>

      <!-- Right Column: Developer GLB Asset Catalog Management -->
      <section class="flex-1 min-w-0 nexus-panel rounded-lg p-3.5 sm:p-4 flex flex-col gap-3 min-h-0">
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800 shrink-0">
          <div class="flex items-center gap-2">
            <h3 class="text-sm sm:text-base font-black uppercase tracking-wider text-white">
              MANAGED GLB ASSETS
            </h3>
            <span data-role="assets-count" class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[11px] font-bold text-sky-300 tabular-nums">0</span>
          </div>
          <button
            type="button"
            data-action="refresh-assets"
            class="nexus-btn-secondary px-3 py-1.5 rounded text-xs font-bold uppercase"
          >Refresh</button>
        </div>

        <div data-role="assets-list" class="flex-1 min-h-0 nexus-scroll overflow-y-auto grid grid-cols-1 xl:grid-cols-2 gap-2.5 content-start pr-1"></div>
      </section>
    `;

    this.preview3D = new GlbInteractivePreview({ heightClass: 'aspect-[16/10]' });
    this.element.querySelector('[data-role="preview-mount"]')!.appendChild(this.preview3D.element);

    this.fileInputEl = this.element.querySelector('[data-role="glb-file-input"]')!;
    this.previewFileInputEl = this.element.querySelector('[data-role="preview-file-input"]')!;
    this.dropzoneEl = this.element.querySelector('[data-role="glb-dropzone"]')!;
    this.validationBoxEl = this.element.querySelector('[data-role="validation-box"]')!;
    this.formTitleEl = this.element.querySelector('[data-role="form-title"]')!;
    this.nameInputEl = this.element.querySelector('[data-role="input-name"]')!;
    this.descInputEl = this.element.querySelector('[data-role="input-desc"]')!;
    this.assetTypeSelectEl = this.element.querySelector('[data-role="select-type"]')!;
    this.equipSlotWrapEl = this.element.querySelector('[data-role="slot-wrap"]')!;
    this.equipSlotSelectEl = this.element.querySelector('[data-role="select-slot"]')!;
    this.categoryHintEl = this.element.querySelector('[data-role="category-hint"]')!;
    this.raritySelectEl = this.element.querySelector('[data-role="select-rarity"]')!;
    this.priceInputEl = this.element.querySelector('[data-role="input-price"]')!;
    this.scaleInputEl = this.element.querySelector('[data-role="input-scale"]')!;
    this.accentInputEl = this.element.querySelector('[data-role="input-accent"]')!;
    this.previewThumbImgEl = this.element.querySelector('[data-role="thumb-img"]')!;
    this.previewThumbEmptyEl = this.element.querySelector('[data-role="thumb-empty"]')!;
    this.captureThumbBtnEl = this.element.querySelector('[data-action="capture-thumb"]')!;
    this.clearThumbBtnEl = this.element.querySelector('[data-action="clear-thumb"]')!;
    this.submitDraftBtnEl = this.element.querySelector('[data-action="submit-draft"]')!;
    this.submitPublishBtnEl = this.element.querySelector('[data-action="submit-publish"]')!;
    this.cancelEditBtnEl = this.element.querySelector('[data-action="cancel-edit"]')!;
    this.feedbackEl = this.element.querySelector('[data-role="feedback-box"]')!;
    this.assetsListEl = this.element.querySelector('[data-role="assets-list"]')!;
    this.assetsCountEl = this.element.querySelector('[data-role="assets-count"]')!;
    this.refreshBtnEl = this.element.querySelector('[data-action="refresh-assets"]')!;

    this.bindEvents();
    this.syncClassificationHint();
    this.syncThumbPreview();
  }

  private bindEvents(): void {
    this.dropzoneEl.addEventListener('click', () => {
      if (this.submitting) return;
      this.fileInputEl.click();
    });
    this.dropzoneEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropzoneEl.classList.add('border-sky-300', 'bg-sky-500/10');
    });
    this.dropzoneEl.addEventListener('dragleave', () => {
      this.dropzoneEl.classList.remove('border-sky-300', 'bg-sky-500/10');
    });
    this.dropzoneEl.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropzoneEl.classList.remove('border-sky-300', 'bg-sky-500/10');
      const file = e.dataTransfer?.files?.[0];
      if (file) void this.handleGlbFileSelected(file);
    });
    this.fileInputEl.addEventListener('change', () => {
      const file = this.fileInputEl.files?.[0];
      if (file) void this.handleGlbFileSelected(file);
      this.fileInputEl.value = '';
    });

    this.previewFileInputEl.addEventListener('change', () => {
      const file = this.previewFileInputEl.files?.[0];
      if (file) void this.handlePreviewImageFile(file);
      this.previewFileInputEl.value = '';
    });

    this.captureThumbBtnEl.addEventListener('click', () => {
      const dataUrl = this.preview3D.captureThumbnailDataUrl(384, 288);
      if (!dataUrl) {
        this.setFeedback(false, 'Load a GLB asset in the 3D viewport before capturing a thumbnail.');
        return;
      }
      this.pendingPreviewDataUrl = dataUrl;
      this.clearExistingPreviewOnSave = false;
      this.syncThumbPreview();
      this.setFeedback(true, 'Captured 3D preview thumbnail.');
    });

    this.clearThumbBtnEl.addEventListener('click', () => {
      this.pendingPreviewDataUrl = null;
      this.clearExistingPreviewOnSave = true;
      this.syncThumbPreview();
    });

    this.assetTypeSelectEl.addEventListener('change', () => {
      this.syncClassificationHint();
      this.reloadLocalPreviewPlacement();
    });
    this.equipSlotSelectEl.addEventListener('change', () => {
      this.syncClassificationHint();
      this.reloadLocalPreviewPlacement();
    });
    this.scaleInputEl.addEventListener('change', () => {
      this.reloadLocalPreviewPlacement();
    });

    this.cancelEditBtnEl.addEventListener('click', () => {
      this.resetFormToNewImport();
    });

    this.submitDraftBtnEl.addEventListener('click', () => {
      void this.handleSubmit(false);
    });
    this.submitPublishBtnEl.addEventListener('click', () => {
      void this.handleSubmit(true);
    });
    this.refreshBtnEl.addEventListener('click', () => {
      void this.loadDeveloperAssets();
    });
  }

  private getSelectedClassification() {
    const assetType = this.assetTypeSelectEl.value as GlbAssetKind;
    const requestedSlot = this.equipSlotSelectEl.value as GlbEquipSlot;
    return resolveGlbStoreClassification(assetType, requestedSlot);
  }

  private syncClassificationHint(): void {
    const cls = this.getSelectedClassification();
    const isCosmetic = cls.assetType === 'cosmetic';
    this.equipSlotWrapEl.classList.toggle('opacity-45', !isCosmetic);
    this.equipSlotSelectEl.disabled = !isCosmetic;
    this.categoryHintEl.textContent = `Store Category: ${cls.category.toUpperCase()} (${cls.subCategory}) · Equip Slot: ${cls.equipSlot}`;
  }

  private reloadLocalPreviewPlacement(): void {
    const cls = this.getSelectedClassification();
    const scale = Math.max(0.2, Math.min(3, Number(this.scaleInputEl.value) || 1));
    if (this.pendingValidation?.ok) {
      this.preview3D.setLocalScene(
        this.pendingValidation.gltf.scene,
        this.pendingValidation.gltf.animations,
        cls.equipSlot,
        scale,
      );
    } else if (this.editingAssetId) {
      const existing = this.devAssets.find((a) => a.id === this.editingAssetId);
      if (existing) {
        void this.preview3D.loadFromUrl(existing.modelUrl, cls.equipSlot, scale);
      }
    }
  }

  private syncThumbPreview(): void {
    if (this.pendingPreviewDataUrl) {
      this.previewThumbImgEl.src = this.pendingPreviewDataUrl;
      this.previewThumbImgEl.classList.remove('hidden');
      this.previewThumbEmptyEl.classList.add('hidden');
      this.clearThumbBtnEl.classList.remove('hidden');
    } else {
      this.previewThumbImgEl.src = '';
      this.previewThumbImgEl.classList.add('hidden');
      this.previewThumbEmptyEl.classList.remove('hidden');
      this.clearThumbBtnEl.classList.add('hidden');
    }
  }

  private setFeedback(ok: boolean, text: string): void {
    this.feedbackEl.classList.remove(
      'hidden',
      'bg-emerald-500/15',
      'border-emerald-400/50',
      'text-emerald-200',
      'bg-rose-500/15',
      'border-rose-400/50',
      'text-rose-200',
    );
    if (ok) {
      this.feedbackEl.classList.add('bg-emerald-500/15', 'border-emerald-400/50', 'text-emerald-200');
    } else {
      this.feedbackEl.classList.add('bg-rose-500/15', 'border-rose-400/50', 'text-rose-200');
    }
    this.feedbackEl.textContent = text;
  }

  private clearFeedback(): void {
    this.feedbackEl.classList.add('hidden');
    this.feedbackEl.textContent = '';
  }

  private async handleGlbFileSelected(file: File): Promise<void> {
    this.clearFeedback();
    if (!file.name.toLowerCase().endsWith('.glb')) {
      this.setFeedback(false, 'Only binary .glb files are supported.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const validation = await validateAndParseGlbArrayBuffer(buffer);
      if (!validation.ok) {
        this.pendingValidation = null;
        this.pendingGlbBase64 = null;
        this.validationBoxEl.classList.remove('hidden');
        this.validationBoxEl.innerHTML = `<div class="font-bold text-rose-300">Validation Failed: ${escapeHtml(validation.error || 'Invalid GLB file.')}</div>`;
        this.setFeedback(false, validation.error || 'GLB validation failed.');
        return;
      }

      if (this.editingAssetId) {
        this.editingAssetId = null;
        this.formTitleEl.textContent = 'GLB IMPORT — NEW 3D ASSET';
        this.cancelEditBtnEl.classList.add('hidden');
        this.submitDraftBtnEl.textContent = 'Save Draft';
        this.submitPublishBtnEl.textContent = 'Import & Publish';
      }

      this.pendingFileName = file.name;
      this.pendingValidation = validation;
      this.pendingGlbBase64 = arrayBufferToBase64(buffer);
      this.clearExistingPreviewOnSave = false;

      if (!this.nameInputEl.value.trim()) {
        const baseName = file.name.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim();
        this.nameInputEl.value = baseName.slice(0, 64);
      }

      const cls = this.getSelectedClassification();
      const scale = Math.max(0.2, Math.min(3, Number(this.scaleInputEl.value) || 1));
      this.preview3D.setLocalScene(
        validation.gltf.scene,
        validation.gltf.animations,
        cls.equipSlot,
        scale,
      );
      if (!this.pendingPreviewDataUrl) {
        this.pendingPreviewDataUrl = this.preview3D.captureThumbnailDataUrl(384, 288);
        this.syncThumbPreview();
      }

      this.renderValidationSummary(validation, file.name);
      this.setFeedback(true, `Validated ${file.name} (${formatGlbFileSize(buffer.byteLength)}). Ready to import.`);
    } catch (err) {
      this.setFeedback(false, err instanceof Error ? err.message : 'Unable to read GLB file.');
    }
  }

  private renderValidationSummary(
    validation: Extract<ClientGlbValidationResult, { ok: true }>,
    fileName: string,
  ): void {
    const s = validation.specs;
    const warningsHtml =
      s.warnings.length > 0
        ? `<div class="text-amber-300 text-[10px] leading-snug">${s.warnings.map((w: string) => `• ${escapeHtml(w)}`).join('<br/>')}</div>`
        : '<div class="text-emerald-300 text-[10px] font-bold">All compatibility & texture checks passed.</div>';

    this.validationBoxEl.classList.remove('hidden');
    this.validationBoxEl.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="font-black text-emerald-300 truncate">${escapeHtml(fileName)}</span>
        <span class="text-slate-400 tabular-nums shrink-0">${escapeHtml(formatGlbFileSize(s.fileSizeBytes))}</span>
      </div>
      <div class="grid grid-cols-3 gap-1.5 text-[10px] text-slate-300 tabular-nums">
        <div class="bg-slate-900 rounded px-1.5 py-1">Meshes: <strong class="text-white">${s.meshCount}</strong></div>
        <div class="bg-slate-900 rounded px-1.5 py-1">Tris: <strong class="text-white">${s.triangleCount.toLocaleString()}</strong></div>
        <div class="bg-slate-900 rounded px-1.5 py-1">Mats/Tex: <strong class="text-white">${s.materialCount}/${s.textureCount}</strong></div>
      </div>
      <div class="text-[10px] text-slate-400">
        Rig: <strong class="text-slate-200">${s.hasRig ? `${s.boneCount} bones` : 'Static'}</strong> · Animations: <strong class="text-slate-200">${s.animationCount}</strong>
      </div>
      ${warningsHtml}
    `;
  }

  private async handlePreviewImageFile(file: File): Promise<void> {
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      this.setFeedback(false, 'Preview image must be PNG, JPEG, or WebP.');
      return;
    }
    if (file.size > 750 * 1024) {
      this.setFeedback(false, 'Preview image must be 750 KB or smaller.');
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
    this.pendingPreviewDataUrl = dataUrl;
    this.clearExistingPreviewOnSave = false;
    this.syncThumbPreview();
  }

  private async handleSubmit(publishImmediately: boolean): Promise<void> {
    if (this.submitting) return;
    this.clearFeedback();

    const name = this.nameInputEl.value.trim();
    if (!name) {
      this.setFeedback(false, 'Enter an asset name before saving.');
      return;
    }
    const description = this.descInputEl.value.trim();
    const cls = this.getSelectedClassification();
    const rarity = this.raritySelectEl.value as GlbRarity;
    const priceCredits = Math.max(0, Math.floor(Number(this.priceInputEl.value) || 0));
    const scaleMultiplier = Math.max(0.2, Math.min(3, Number(this.scaleInputEl.value) || 1));
    const accentHex = sanitizeAccentHex(this.accentInputEl.value, '#38bdf8');

    this.submitting = true;
    this.submitDraftBtnEl.disabled = true;
    this.submitPublishBtnEl.disabled = true;

    try {
      if (this.editingAssetId) {
        const updated = await glbStoreClient.updateAsset(this.editingAssetId, {
          name,
          description,
          assetType: cls.assetType,
          equipSlot: cls.equipSlot,
          rarity,
          priceCredits,
          scaleMultiplier,
          accentHex,
          previewImageDataUrl: this.pendingPreviewDataUrl,
          clearPreviewImage: this.clearExistingPreviewOnSave,
        });
        if (publishImmediately && updated.status !== 'published') {
          await glbStoreClient.setPublished(updated.id, true);
        }
        glbStoreClient.invalidatePreviewCache(updated.previewUrl);
        this.setFeedback(true, `Updated "${updated.name}".`);
        this.resetFormToNewImport(false);
      } else {
        if (!this.pendingGlbBase64) {
          this.setFeedback(false, 'Select and validate a .glb file first.');
          return;
        }
        const created = await glbStoreClient.importAsset({
          glbBase64: this.pendingGlbBase64,
          originalFileName: this.pendingFileName,
          name,
          description,
          assetType: cls.assetType,
          equipSlot: cls.equipSlot,
          rarity,
          priceCredits,
          scaleMultiplier,
          accentHex,
          previewImageDataUrl: this.pendingPreviewDataUrl,
          publishImmediately,
        });
        this.setFeedback(
          true,
          publishImmediately
            ? `Imported and published "${created.name}" to the Store.`
            : `Imported "${created.name}" as Draft.`,
        );
        this.resetFormToNewImport(false);
      }
      await this.loadDeveloperAssets();
      await this.callbacks.onCatalogChanged();
    } catch (err) {
      this.setFeedback(false, err instanceof Error ? err.message : 'Server rejected GLB operation.');
    } finally {
      this.submitting = false;
      this.submitDraftBtnEl.disabled = false;
      this.submitPublishBtnEl.disabled = false;
    }
  }

  private resetFormToNewImport(clearMsg = true): void {
    this.editingAssetId = null;
    this.pendingFileName = '';
    this.pendingGlbBase64 = null;
    this.pendingValidation = null;
    this.pendingPreviewDataUrl = null;
    this.clearExistingPreviewOnSave = false;
    this.nameInputEl.value = '';
    this.descInputEl.value = '';
    this.priceInputEl.value = '1200';
    this.scaleInputEl.value = '1';
    this.accentInputEl.value = '#38bdf8';
    this.validationBoxEl.classList.add('hidden');
    this.validationBoxEl.innerHTML = '';
    this.formTitleEl.textContent = 'GLB IMPORT — NEW 3D ASSET';
    this.cancelEditBtnEl.classList.add('hidden');
    this.submitDraftBtnEl.textContent = 'Save Draft';
    this.submitPublishBtnEl.textContent = 'Import & Publish';
    this.syncClassificationHint();
    this.syncThumbPreview();
    if (clearMsg) {
      this.clearFeedback();
    }
  }

  private startEditingAsset(asset: GlbAssetRecord): void {
    this.editingAssetId = asset.id;
    this.pendingGlbBase64 = null;
    this.pendingValidation = null;
    this.pendingPreviewDataUrl = null;
    this.clearExistingPreviewOnSave = false;
    this.confirmDeleteAssetId = null;

    this.formTitleEl.textContent = `EDIT GLB ASSET — ${asset.name}`;
    this.cancelEditBtnEl.classList.remove('hidden');
    this.submitDraftBtnEl.textContent = 'Save Changes';
    this.submitPublishBtnEl.textContent =
      asset.status === 'published' ? 'Save Changes' : 'Save & Publish';

    this.nameInputEl.value = asset.name;
    this.descInputEl.value = asset.description;
    this.assetTypeSelectEl.value = asset.assetType;
    if (asset.assetType === 'cosmetic') {
      this.equipSlotSelectEl.value = asset.equipSlot;
    }
    this.raritySelectEl.value = asset.rarity;
    this.priceInputEl.value = String(asset.priceCredits);
    this.scaleInputEl.value = String(asset.scaleMultiplier);
    this.accentInputEl.value = sanitizeAccentHex(asset.accentHex, '#38bdf8');
    this.syncClassificationHint();

    this.validationBoxEl.classList.remove('hidden');
    this.validationBoxEl.innerHTML = `
      <div class="flex items-center justify-between text-[10px] text-slate-300">
        <span class="font-bold text-sky-300 truncate">${escapeHtml(asset.originalFileName)}</span>
        <span class="tabular-nums">${escapeHtml(formatGlbFileSize(asset.specs.fileSizeBytes))} · ${asset.specs.triangleCount.toLocaleString()} tris</span>
      </div>
    `;

    if (asset.previewUrl) {
      void glbStoreClient.resolvePreviewObjectUrl(asset.previewUrl).then((objUrl) => {
        if (this.editingAssetId === asset.id && objUrl && !this.pendingPreviewDataUrl) {
          this.previewThumbImgEl.src = objUrl;
          this.previewThumbImgEl.classList.remove('hidden');
          this.previewThumbEmptyEl.classList.add('hidden');
          this.clearThumbBtnEl.classList.remove('hidden');
        }
      });
    } else {
      this.syncThumbPreview();
    }

    void this.preview3D.loadFromUrl(asset.modelUrl, asset.equipSlot, asset.scaleMultiplier);
    this.setFeedback(true, `Editing "${asset.name}". Update details and save.`);
  }

  async open(): Promise<void> {
    await this.loadDeveloperAssets();
  }

  async loadDeveloperAssets(): Promise<void> {
    if (this.loadingAssets) return;
    this.loadingAssets = true;
    this.refreshBtnEl.disabled = true;
    try {
      this.devAssets = await glbStoreClient.fetchDevAssets();
      this.renderAssetsList();
    } catch (err) {
      this.assetsListEl.innerHTML = `
        <div class="col-span-full rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200 font-semibold">
          ${escapeHtml(err instanceof Error ? err.message : 'Unable to load developer GLB assets.')}
        </div>
      `;
    } finally {
      this.loadingAssets = false;
      this.refreshBtnEl.disabled = false;
    }
  }

  private renderAssetsList(): void {
    this.assetsCountEl.textContent = String(this.devAssets.length);
    this.assetsListEl.innerHTML = '';

    if (this.devAssets.length === 0) {
      this.assetsListEl.innerHTML = `
        <div class="col-span-full rounded-md border border-slate-800 bg-slate-900/60 p-6 text-center text-xs text-slate-400">
          No GLB assets imported yet. Drop a .glb file on the left to import a character, skin, or 3D cosmetic.
        </div>
      `;
      return;
    }

    for (const asset of this.devAssets) {
      const card = document.createElement('article');
      const isPublished = asset.status === 'published';
      const isEditing = this.editingAssetId === asset.id;
      const isConfirmingDelete = this.confirmDeleteAssetId === asset.id;
      card.className = `rounded-lg border p-3 flex flex-col gap-2.5 bg-slate-900/85 ${
        isEditing ? 'border-sky-400' : 'border-slate-800'
      }`;

      card.innerHTML = `
        <div class="flex items-start gap-2.5">
          <div class="w-16 h-14 rounded bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center shrink-0">
            <img data-asset-thumb src="" alt="" class="hidden w-full h-full object-contain" />
            <span data-asset-nothumb class="text-[10px] font-bold text-slate-500 uppercase">GLB</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <span class="px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                isPublished
                  ? 'bg-emerald-500/20 border border-emerald-400/60 text-emerald-200'
                  : 'bg-amber-500/20 border border-amber-400/60 text-amber-200'
              }">${isPublished ? 'Published' : 'Draft'}</span>
              <span class="text-xs font-black text-amber-300 tabular-nums">${asset.priceCredits.toLocaleString()} NX</span>
            </div>
            <h4 class="text-xs sm:text-sm font-black text-white truncate mt-1">${escapeHtml(asset.name)}</h4>
            <div class="text-[10px] text-slate-400 truncate">
              ${escapeHtml(asset.rarity)} · ${escapeHtml(asset.category)} / ${escapeHtml(asset.equipSlot)} · ${asset.specs.triangleCount.toLocaleString()} tris
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/90">
          <button
            type="button"
            data-act="toggle-publish"
            class="${
              isPublished
                ? 'nexus-btn-secondary border-amber-400/50 text-amber-200'
                : 'nexus-btn-primary'
            } px-2.5 py-1.5 rounded text-[11px] font-bold uppercase"
          >${isPublished ? 'Unpublish' : 'Publish'}</button>
          <button
            type="button"
            data-act="edit"
            class="nexus-btn-secondary px-2.5 py-1.5 rounded text-[11px] font-bold uppercase border-sky-400/50 text-sky-200"
          >Edit</button>
          ${
            isConfirmingDelete
              ? `<button
                   type="button"
                   data-act="confirm-delete"
                   class="px-2.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-black uppercase"
                 >Confirm Delete</button>
                 <button
                   type="button"
                   data-act="cancel-delete"
                   class="nexus-btn-secondary px-2 py-1.5 rounded text-[11px] font-bold uppercase"
                 >Cancel</button>`
              : `<button
                   type="button"
                   data-act="delete"
                   class="px-2.5 py-1.5 rounded bg-slate-950 border border-rose-500/40 hover:border-rose-400 text-rose-300 text-[11px] font-bold uppercase ml-auto"
                 >Delete</button>`
          }
        </div>
      `;

      if (asset.previewUrl) {
        const imgEl = card.querySelector<HTMLImageElement>('[data-asset-thumb]');
        const emptyEl = card.querySelector<HTMLElement>('[data-asset-nothumb]');
        void glbStoreClient.resolvePreviewObjectUrl(asset.previewUrl).then((objUrl) => {
          if (imgEl && objUrl) {
            imgEl.src = objUrl;
            imgEl.classList.remove('hidden');
            emptyEl?.classList.add('hidden');
          }
        });
      }

      card.querySelector('[data-act="toggle-publish"]')?.addEventListener('click', async () => {
        try {
          const updated = await glbStoreClient.setPublished(asset.id, !isPublished);
          this.setFeedback(
            true,
            updated.status === 'published'
              ? `Published "${updated.name}" to the player store.`
              : `Unpublished "${updated.name}".`,
          );
          await this.loadDeveloperAssets();
          await this.callbacks.onCatalogChanged();
        } catch (err) {
          this.setFeedback(false, err instanceof Error ? err.message : 'Failed to change publish status.');
        }
      });

      card.querySelector('[data-act="edit"]')?.addEventListener('click', () => {
        this.startEditingAsset(asset);
        this.renderAssetsList();
      });

      card.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
        this.confirmDeleteAssetId = asset.id;
        this.renderAssetsList();
      });

      card.querySelector('[data-act="cancel-delete"]')?.addEventListener('click', () => {
        this.confirmDeleteAssetId = null;
        this.renderAssetsList();
      });

      card.querySelector('[data-act="confirm-delete"]')?.addEventListener('click', async () => {
        try {
          await glbStoreClient.deleteAsset(asset.id);
          glbStoreClient.invalidatePreviewCache(asset.previewUrl);
          glbModelCache.evict(asset.modelUrl);
          if (this.editingAssetId === asset.id) {
            this.resetFormToNewImport(false);
          }
          this.confirmDeleteAssetId = null;
          this.setFeedback(true, `Deleted "${asset.name}".`);
          await this.loadDeveloperAssets();
          await this.callbacks.onCatalogChanged();
        } catch (err) {
          this.setFeedback(false, err instanceof Error ? err.message : 'Failed to delete GLB asset.');
        }
      });

      this.assetsListEl.appendChild(card);
    }
  }

  dispose(): void {
    this.preview3D.dispose();
  }
}
