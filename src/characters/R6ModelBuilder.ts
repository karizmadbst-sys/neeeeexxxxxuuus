import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  DEFAULT_R6_CUSTOMIZATION,
  getEyeOption,
  getGlassesOption,
  getHairColorOption,
  getHairStyleOption,
  getHatOption,
  getMaskOption,
  getMouthOption,
  getPantsOption,
  getShoesOption,
  getSkinOption,
  getTopOption,
  normalizeR6Customization,
  type R6Customization,
  type R6GlassesId,
  type R6HairStyleId,
  type R6HatId,
  type R6MaskId,
} from '../player/R6CustomizationData';
import { createR6Skeleton, type R6RigBones } from './R6AnimationClips';
import { getR6CharacterPreset, type R6CharacterPreset } from './R6CharacterCatalog';
import {
  measureHeadFitProfile,
  type HeadFitProfile,
} from './HelmetFittingSystem';
import {
  getR6FaceTexture,
  getR6PantsTexture,
  getR6TopFrontTexture,
} from './R6TextureGenerator';

export interface R6AppearanceOptions {
  wearingHelmet?: boolean;
}

export interface BuiltR6Character {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: R6RigBones;
  preset: R6CharacterPreset;
  customization: R6Customization;
  meshes: THREE.Mesh[];
  getHeadFitProfile: () => HeadFitProfile;
  updateAppearance: (
    preset: R6CharacterPreset,
    customization: Partial<R6Customization>,
    accentOverrideHex?: string,
    visorOverrideHex?: string,
    options?: R6AppearanceOptions,
  ) => void;
  dispose: () => void;
}

const GEO_CACHE = new Map<string, THREE.BufferGeometry>();

function cachedRoundedBox(
  w: number,
  h: number,
  d: number,
  segments = 2,
  radius = 0.022,
): THREE.BufferGeometry {
  const key = `rbox:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${segments}:${radius.toFixed(4)}`;
  let g = GEO_CACHE.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, radius);
    GEO_CACHE.set(key, g);
  }
  return g;
}

function cachedCylinder(
  rt: number,
  rb: number,
  h: number,
  radial = 12,
): THREE.BufferGeometry {
  const key = `cyl:${rt.toFixed(4)}:${rb.toFixed(4)}:${h.toFixed(4)}:${radial}`;
  let g = GEO_CACHE.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, radial);
    GEO_CACHE.set(key, g);
  }
  return g;
}

function cachedSphere(r: number, wSeg = 10, hSeg = 8): THREE.BufferGeometry {
  const key = `sph:${r.toFixed(4)}:${wSeg}:${hSeg}`;
  let g = GEO_CACHE.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, wSeg, hSeg);
    GEO_CACHE.set(key, g);
  }
  return g;
}

function cachedPlane(w: number, h: number): THREE.BufferGeometry {
  const key = `pln:${w.toFixed(4)}:${h.toFixed(4)}`;
  let g = GEO_CACHE.get(key);
  if (!g) {
    g = new THREE.PlaneGeometry(w, h);
    GEO_CACHE.set(key, g);
  }
  return g;
}

function makeMat(
  color: string,
  roughness = 0.65,
  metalness = 0.06,
  extra?: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    ...extra,
  });
}

function addPart(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  meshes: THREE.Mesh[],
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) {
    m.rotation.set(rx, ry, rz);
  }
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  meshes.push(m);
  return m;
}

/**
 * Builds a complete modular, articulated Roblox-inspired R6 character (~1.75m height,
 * standing feet flush at y = 0.000, facing +Z).
 */
export function buildR6CharacterModel(
  presetOrId?: R6CharacterPreset | string,
  initialCustomization?: Partial<R6Customization>,
  accentHexOverride?: string,
  visorHexOverride?: string,
): BuiltR6Character {
  let activePreset: R6CharacterPreset =
    typeof presetOrId === 'string'
      ? getR6CharacterPreset(presetOrId)
      : presetOrId ?? getR6CharacterPreset(undefined);

  let activeCustom: R6Customization = normalizeR6Customization({
    ...DEFAULT_R6_CUSTOMIZATION,
    ...activePreset.appearance,
    ...initialCustomization,
  });

  const rig = createR6Skeleton(activePreset.widthScale);
  const root = new THREE.Group();
  root.name = `r6-${activePreset.id}`;
  root.add(rig.bones.Hips);

  const meshes: THREE.Mesh[] = [];
  const ownedMaterials: THREE.Material[] = [];
  const trackMat = <T extends THREE.Material>(m: T): T => {
    ownedMaterials.push(m);
    return m;
  };

  // Core shared dynamic materials updated cleanly when customization changes
  const skinMat = trackMat(makeMat('#f1c39a', 0.56, 0.02));
  const skinShadeMat = trackMat(makeMat('#d29a6f', 0.62, 0.02));
  const faceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.52,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const topBaseMat = trackMat(makeMat('#334155', 0.72, 0.05));
  const topSecondaryMat = trackMat(makeMat('#475569', 0.74, 0.05));
  const topAccentMat = trackMat(makeMat('#f97316', 0.58, 0.12));
  const topFrontPanelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.68,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const pantsBaseMat = trackMat(makeMat('#272b33', 0.78, 0.04));
  const pantsShadeMat = trackMat(makeMat('#1d2027', 0.8, 0.04));
  const pantsPanelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.76,
      metalness: 0.03,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const beltMat = trackMat(makeMat('#17191f', 0.55, 0.18));
  const buckleMat = trackMat(makeMat('#cbd5e1', 0.32, 0.75));

  const shoePrimaryMat = trackMat(makeMat('#f8fafc', 0.55, 0.08));
  const shoeAccentMat = trackMat(makeMat('#ef4444', 0.48, 0.12));
  const shoeSoleMat = trackMat(makeMat('#e2e8f0', 0.78, 0.02));

  const hairMat = trackMat(makeMat('#3b281d', 0.64, 0.06));
  const hairHighlightMat = trackMat(makeMat('#523a2c', 0.56, 0.08));

  const hatPrimaryMat = trackMat(makeMat('#1e293b', 0.68, 0.08));
  const hatAccentMat = trackMat(makeMat('#f97316', 0.52, 0.16));

  const glassesFrameMat = trackMat(makeMat('#0f172a', 0.34, 0.55));
  const glassesLensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#020617',
      emissive: '#38bdf8',
      emissiveIntensity: 0.25,
      roughness: 0.16,
      metalness: 0.65,
      transparent: true,
      opacity: 0.86,
    }),
  );

  const maskMat = trackMat(makeMat('#1e293b', 0.74, 0.05));
  const maskTrimMat = trackMat(makeMat('#38bdf8', 0.42, 0.35));

  // =====================================================================
  // 1. HEAD (Roblox R6 Classic Beveled Cube + Stud + Face CanvasTexture)
  // =====================================================================
  const headCenterY = 0.175;
  addPart(
    rig.bones.Neck,
    cachedCylinder(0.085, 0.095, 0.09, 10),
    skinShadeMat,
    0,
    0.025,
    0,
    meshes,
  );
  const craniumMesh = addPart(
    rig.bones.Head,
    cachedRoundedBox(0.40, 0.39, 0.40, 2, 0.036),
    skinMat,
    0,
    headCenterY,
    0,
    meshes,
  );
  craniumMesh.userData.r6Part = 'head_cranium';
  // Signature R6 crown stud (subtle flush stud on top)
  const studMesh = addPart(
    rig.bones.Head,
    cachedCylinder(0.065, 0.065, 0.024, 14),
    skinShadeMat,
    0,
    0.376,
    0,
    meshes,
  );
  studMesh.userData.r6Part = 'head_stud';
  // Crisp R6 front face plane
  const faceMesh = addPart(
    rig.bones.Head,
    cachedPlane(0.35, 0.34),
    faceMat,
    0,
    headCenterY,
    0.2015,
    meshes,
  );
  faceMesh.userData.r6Part = 'head_face';

  // =====================================================================
  // 2. TORSO (Chest + Spine + Hips — Seamless R6 Rectangular Block)
  // =====================================================================
  // Chest upper half (0.62w x 0.36h x 0.33d) + subtle tapered inner spine core
  addPart(
    rig.bones.Chest,
    cachedRoundedBox(0.62, 0.355, 0.33, 2, 0.026),
    topBaseMat,
    0,
    0.08,
    0,
    meshes,
  );
  addPart(
    rig.bones.Chest,
    cachedPlane(0.56, 0.31),
    topFrontPanelMat,
    0,
    0.08,
    0.1665,
    meshes,
  );
  addPart(
    rig.bones.Chest,
    cachedPlane(0.56, 0.31),
    topFrontPanelMat,
    0,
    0.08,
    -0.1665,
    meshes,
    0,
    Math.PI,
    0,
  );

  // Lower torso / Spine block
  addPart(
    rig.bones.Spine,
    cachedRoundedBox(0.61, 0.35, 0.325, 2, 0.024),
    topBaseMat,
    0,
    -0.015,
    0,
    meshes,
  );
  addPart(
    rig.bones.Spine,
    cachedPlane(0.55, 0.28),
    topFrontPanelMat,
    0,
    -0.015,
    0.164,
    meshes,
  );
  // Pelvis / Belt core on Hips (prevents any waist seam when bending/twisting)
  addPart(
    rig.bones.Hips,
    cachedRoundedBox(0.615, 0.145, 0.335, 2, 0.02),
    pantsBaseMat,
    0,
    0.035,
    0,
    meshes,
  );
  addPart(
    rig.bones.Hips,
    cachedRoundedBox(0.635, 0.065, 0.352, 1, 0.012),
    beltMat,
    0,
    0.105,
    0,
    meshes,
  );
  addPart(
    rig.bones.Hips,
    cachedRoundedBox(0.11, 0.072, 0.035, 1, 0.008),
    buckleMat,
    0,
    0.105,
    0.168,
    meshes,
  );

  // Garment torso overlays (hoodie hood/pocket, jacket lapels/collar, puffer ribs)
  const hoodieDetailGroup = new THREE.Group();
  rig.bones.Chest.add(hoodieDetailGroup);
  addPart(
    hoodieDetailGroup,
    cachedRoundedBox(0.42, 0.14, 0.24, 2, 0.03),
    topSecondaryMat,
    0,
    0.25,
    -0.155,
    meshes,
    -0.28,
    0,
    0,
  );
  addPart(
    hoodieDetailGroup,
    cachedRoundedBox(0.022, 0.17, 0.022, 1, 0.006),
    topAccentMat,
    -0.075,
    0.11,
    0.178,
    meshes,
  );
  addPart(
    hoodieDetailGroup,
    cachedRoundedBox(0.022, 0.17, 0.022, 1, 0.006),
    topAccentMat,
    0.075,
    0.11,
    0.178,
    meshes,
  );
  const hoodiePocketMesh = addPart(
    rig.bones.Spine,
    cachedRoundedBox(0.42, 0.165, 0.042, 2, 0.015),
    topSecondaryMat,
    0,
    -0.06,
    0.166,
    meshes,
  );

  const jacketDetailGroup = new THREE.Group();
  rig.bones.Chest.add(jacketDetailGroup);
  // Collar & front lapels
  addPart(
    jacketDetailGroup,
    cachedRoundedBox(0.34, 0.075, 0.28, 2, 0.018),
    topSecondaryMat,
    0,
    0.255,
    -0.01,
    meshes,
  );
  addPart(
    jacketDetailGroup,
    cachedRoundedBox(0.13, 0.34, 0.032, 1, 0.01),
    topSecondaryMat,
    -0.21,
    0.075,
    0.162,
    meshes,
  );
  addPart(
    jacketDetailGroup,
    cachedRoundedBox(0.13, 0.34, 0.032, 1, 0.01),
    topSecondaryMat,
    0.21,
    0.075,
    0.162,
    meshes,
  );
  addPart(
    jacketDetailGroup,
    cachedRoundedBox(0.045, 0.34, 0.022, 1, 0.006),
    topAccentMat,
    0,
    0.075,
    0.17,
    meshes,
  );

  const pufferDetailGroup = new THREE.Group();
  rig.bones.Chest.add(pufferDetailGroup);
  for (let row = 0; row < 3; row++) {
    addPart(
      pufferDetailGroup,
      cachedRoundedBox(0.645, 0.105, 0.365, 2, 0.028),
      topBaseMat,
      0,
      -0.03 + row * 0.11,
      0,
      meshes,
    );
  }
  addPart(
    pufferDetailGroup,
    cachedRoundedBox(0.36, 0.09, 0.30, 2, 0.022),
    topAccentMat,
    0,
    0.265,
    -0.01,
    meshes,
  );

  // =====================================================================
  // 3. ARMS (R6 Classic Separate Block Arms — Bare vs Long Sleeve toggles)
  // =====================================================================
  const longSleeveParts: THREE.Mesh[] = [];
  const shortSleeveParts: THREE.Mesh[] = [];
  const bareForearmParts: THREE.Mesh[] = [];

  for (const side of ['left', 'right'] as const) {
    const upperBone = side === 'left' ? rig.bones.LeftUpperArm : rig.bones.RightUpperArm;
    const foreBone = side === 'left' ? rig.bones.LeftForearm : rig.bones.RightForearm;
    const handBone = side === 'left' ? rig.bones.LeftHand : rig.bones.RightHand;

    // Shoulder ball cap for airtight overhead rotation
    addPart(upperBone, cachedSphere(0.132, 10, 8), topBaseMat, 0, -0.01, 0, meshes);

    // Full-length upper arm block (for hoodies, jackets, varsity)
    longSleeveParts.push(
      addPart(
        upperBone,
        cachedRoundedBox(0.29, 0.35, 0.29, 2, 0.025),
        topBaseMat,
        0,
        -0.17,
        0,
        meshes,
      ),
    );
    // Short sleeve + bare lower bicep (for T-shirt)
    shortSleeveParts.push(
      addPart(
        upperBone,
        cachedRoundedBox(0.302, 0.22, 0.302, 2, 0.024),
        topBaseMat,
        0,
        -0.105,
        0,
        meshes,
      ),
      addPart(
        upperBone,
        cachedRoundedBox(0.265, 0.145, 0.265, 2, 0.022),
        skinMat,
        0,
        -0.275,
        0,
        meshes,
      ),
    );

    // Long-sleeve forearm + wrist cuff
    longSleeveParts.push(
      addPart(foreBone, cachedSphere(0.125, 10, 8), topBaseMat, 0, 0, 0, meshes),
      addPart(
        foreBone,
        cachedRoundedBox(0.282, 0.285, 0.282, 2, 0.024),
        topSecondaryMat,
        0,
        -0.135,
        0,
        meshes,
      ),
      addPart(
        foreBone,
        cachedRoundedBox(0.295, 0.055, 0.295, 1, 0.012),
        topAccentMat,
        0,
        -0.245,
        0,
        meshes,
      ),
    );

    // Bare-skin forearm (for T-shirt)
    bareForearmParts.push(
      addPart(foreBone, cachedSphere(0.122, 10, 8), skinMat, 0, 0, 0, meshes),
      addPart(
        foreBone,
        cachedRoundedBox(0.262, 0.285, 0.262, 2, 0.024),
        skinMat,
        0,
        -0.135,
        0,
        meshes,
      ),
    );

    // Classic R6 block Hand + wrist joint cap
    addPart(handBone, cachedSphere(0.105, 8, 8), skinShadeMat, 0, 0.015, 0, meshes);
    addPart(
      handBone,
      cachedRoundedBox(0.255, 0.14, 0.255, 2, 0.028),
      skinMat,
      0,
      -0.025,
      0,
      meshes,
    );
  }

  // =====================================================================
  // 4. LEGS & MODERN SHOES (R6 Separate Block Legs + Outsole at y = 0)
  // =====================================================================
  const cargoPocketMeshes: THREE.Mesh[] = [];
  const highTopCuffMeshes: THREE.Mesh[] = [];

  for (const side of ['left', 'right'] as const) {
    const thighBone = side === 'left' ? rig.bones.LeftThigh : rig.bones.RightThigh;
    const shinBone = side === 'left' ? rig.bones.LeftShin : rig.bones.RightShin;
    const footBone = side === 'left' ? rig.bones.LeftFoot : rig.bones.RightFoot;
    const outerSign = side === 'left' ? 1 : -1;

    // Hip joint sphere inside pelvis
    addPart(thighBone, cachedSphere(0.138, 10, 8), pantsBaseMat, 0, 0, 0, meshes);

    // Thigh block
    addPart(
      thighBone,
      cachedRoundedBox(0.295, 0.365, 0.305, 2, 0.024),
      pantsBaseMat,
      0,
      -0.17,
      0,
      meshes,
    );
    addPart(
      thighBone,
      cachedPlane(0.255, 0.32),
      pantsPanelMat,
      0,
      -0.17,
      0.154,
      meshes,
    );

    // Optional 3D cargo pockets on outer thigh
    const pocketBody = addPart(
      thighBone,
      cachedRoundedBox(0.052, 0.165, 0.175, 2, 0.012),
      pantsShadeMat,
      outerSign * 0.16,
      -0.19,
      0.01,
      meshes,
    );
    const pocketFlap = addPart(
      thighBone,
      cachedRoundedBox(0.058, 0.042, 0.184, 1, 0.008),
      topAccentMat,
      outerSign * 0.163,
      -0.105,
      0.01,
      meshes,
    );
    cargoPocketMeshes.push(pocketBody, pocketFlap);

    // Knee joint sphere & Shin block (bottom stops at -0.192, clears 75deg stair-step knees above sole)
    addPart(shinBone, cachedSphere(0.124, 10, 8), pantsBaseMat, 0, 0, 0, meshes);
    addPart(
      shinBone,
      cachedRoundedBox(0.278, 0.198, 0.262, 2, 0.022),
      pantsBaseMat,
      0,
      -0.091,
      0,
      meshes,
    );
    addPart(
      shinBone,
      cachedRoundedBox(0.288, 0.04, 0.270, 1, 0.012),
      pantsShadeMat,
      0,
      -0.172,
      0,
      meshes,
    );

    // Shoe on *Foot bone (local y = -0.120 touches floor y = 0.000)
    // Outsole: height 0.042 centered at y = -0.099 => bottom strictly at -0.120
    addPart(
      footBone,
      cachedRoundedBox(0.295, 0.042, 0.372, 2, 0.01),
      shoeSoleMat,
      0,
      -0.099,
      0.028,
      meshes,
    );
    // Upper shoe body (reaches +0.030 so pant hem at -0.192/-0.22=+0.028 seats seamlessly)
    addPart(
      footBone,
      cachedRoundedBox(0.285, 0.110, 0.348, 2, 0.018),
      shoePrimaryMat,
      0,
      -0.025,
      0.02,
      meshes,
    );
    // Toe cap & side accent stripe
    addPart(
      footBone,
      cachedRoundedBox(0.276, 0.068, 0.09, 2, 0.016),
      shoeAccentMat,
      0,
      -0.044,
      0.162,
      meshes,
    );
    addPart(
      footBone,
      cachedRoundedBox(0.292, 0.032, 0.21, 1, 0.008),
      shoeAccentMat,
      0,
      -0.036,
      0.015,
      meshes,
    );
    // Lace tongue patch
    addPart(
      footBone,
      cachedRoundedBox(0.145, 0.03, 0.14, 1, 0.008),
      shoeSoleMat,
      0,
      0.02,
      0.08,
      meshes,
      0.24,
      0,
      0,
    );
    // Optional high-top / combat boot ankle cuff
    highTopCuffMeshes.push(
      addPart(
        footBone,
        cachedRoundedBox(0.292, 0.088, 0.305, 2, 0.016),
        shoePrimaryMat,
        0,
        0.042,
        0,
        meshes,
      ),
    );
  }

  // =====================================================================
  // 5. 3D HAIRSTYLES (Split Crown Volume vs Sides/Back so Hats Never Clip)
  // =====================================================================
  const hairCrownGroup = new THREE.Group();
  const hairSidesGroup = new THREE.Group();
  rig.bones.Head.add(hairCrownGroup, hairSidesGroup);

  const hairCrownStyles: Record<R6HairStyleId, THREE.Group> = {
    bald: new THREE.Group(),
    swept_undercut: new THREE.Group(),
    spiky_crest: new THREE.Group(),
    curtains_part: new THREE.Group(),
    fluffy_messy: new THREE.Group(),
    buzz_fade: new THREE.Group(),
    high_ponytail: new THREE.Group(),
    asym_bob: new THREE.Group(),
    wavy_shoulder: new THREE.Group(),
    mohawk_tactical: new THREE.Group(),
    slick_back: new THREE.Group(),
    twin_buns: new THREE.Group(),
    side_braid: new THREE.Group(),
    curly_crop: new THREE.Group(),
    wolf_cut: new THREE.Group(),
    low_ponytail: new THREE.Group(),
  };
  const hairSideStyles: Record<R6HairStyleId, THREE.Group> = {
    bald: new THREE.Group(),
    swept_undercut: new THREE.Group(),
    spiky_crest: new THREE.Group(),
    curtains_part: new THREE.Group(),
    fluffy_messy: new THREE.Group(),
    buzz_fade: new THREE.Group(),
    high_ponytail: new THREE.Group(),
    asym_bob: new THREE.Group(),
    wavy_shoulder: new THREE.Group(),
    mohawk_tactical: new THREE.Group(),
    slick_back: new THREE.Group(),
    twin_buns: new THREE.Group(),
    side_braid: new THREE.Group(),
    curly_crop: new THREE.Group(),
    wolf_cut: new THREE.Group(),
    low_ponytail: new THREE.Group(),
  };

  for (const id of Object.keys(hairCrownStyles) as R6HairStyleId[]) {
    hairCrownGroup.add(hairCrownStyles[id]);
    hairSidesGroup.add(hairSideStyles[id]);
  }

  // Helper to add cap shell
  const addSkullCap = (g: THREE.Group, h = 0.075, y = 0.365) => {
    addPart(g, cachedRoundedBox(0.425, h, 0.425, 2, 0.025), hairMat, 0, y, -0.006, meshes);
  };
  const addBackHair = (g: THREE.Group, h = 0.30, y = 0.21, z = -0.195) => {
    addPart(g, cachedRoundedBox(0.415, h, 0.065, 2, 0.02), hairMat, 0, y, z, meshes);
  };
  const addSideburns = (g: THREE.Group, h = 0.19, y = 0.23) => {
    addPart(g, cachedRoundedBox(0.055, h, 0.16, 1, 0.015), hairMat, -0.20, y, -0.05, meshes);
    addPart(g, cachedRoundedBox(0.055, h, 0.16, 1, 0.015), hairMat, 0.20, y, -0.05, meshes);
  };

  // swept_undercut
  addSkullCap(hairCrownStyles.swept_undercut, 0.085, 0.37);
  addPart(
    hairCrownStyles.swept_undercut,
    cachedRoundedBox(0.36, 0.085, 0.38, 2, 0.025),
    hairHighlightMat,
    -0.025,
    0.425,
    0.035,
    meshes,
    -0.08,
    0.08,
    -0.12,
  );
  addPart(
    hairCrownStyles.swept_undercut,
    cachedRoundedBox(0.24, 0.065, 0.12, 2, 0.02),
    hairMat,
    -0.07,
    0.355,
    0.205,
    meshes,
    0.18,
    0,
    -0.16,
  );
  addBackHair(hairSideStyles.swept_undercut, 0.22, 0.25);
  addSideburns(hairSideStyles.swept_undercut, 0.14, 0.26);

  // spiky_crest
  addSkullCap(hairCrownStyles.spiky_crest, 0.075, 0.365);
  const spikeSpecs: Array<[number, number, number, number, number, number]> = [
    [0, 0.455, 0.08, 0.24, -0.24, 0],
    [0, 0.465, -0.03, -0.14, -0.12, 0],
    [-0.10, 0.435, 0.04, 0.18, -0.18, 0.26],
    [0.10, 0.435, 0.04, 0.18, -0.18, -0.26],
    [0, 0.43, -0.13, -0.38, 0, 0],
  ];
  for (const [sx, sy, sz, rx, ry, rz] of spikeSpecs) {
    addPart(
      hairCrownStyles.spiky_crest,
      cachedRoundedBox(0.11, 0.13, 0.13, 2, 0.028),
      sx === 0 ? hairHighlightMat : hairMat,
      sx,
      sy,
      sz,
      meshes,
      rx,
      ry,
      rz,
    );
  }
  addBackHair(hairSideStyles.spiky_crest, 0.24, 0.24);
  addSideburns(hairSideStyles.spiky_crest, 0.15, 0.25);

  // curtains_part
  addSkullCap(hairCrownStyles.curtains_part, 0.08, 0.37);
  addPart(
    hairCrownStyles.curtains_part,
    cachedRoundedBox(0.18, 0.13, 0.15, 2, 0.028),
    hairMat,
    -0.12,
    0.34,
    0.165,
    meshes,
    0.12,
    0.18,
    0.25,
  );
  addPart(
    hairCrownStyles.curtains_part,
    cachedRoundedBox(0.18, 0.13, 0.15, 2, 0.028),
    hairHighlightMat,
    0.12,
    0.34,
    0.165,
    meshes,
    0.12,
    -0.18,
    -0.25,
  );
  addBackHair(hairSideStyles.curtains_part, 0.26, 0.23);
  addSideburns(hairSideStyles.curtains_part, 0.20, 0.23);

  // fluffy_messy
  addSkullCap(hairCrownStyles.fluffy_messy, 0.095, 0.375);
  const fluffPositions: Array<[number, number, number]> = [
    [-0.12, 0.41, 0.11],
    [0.11, 0.415, 0.10],
    [0, 0.43, 0.01],
    [-0.14, 0.39, -0.08],
    [0.14, 0.39, -0.08],
    [-0.08, 0.365, 0.185],
    [0.08, 0.36, 0.185],
  ];
  for (let i = 0; i < fluffPositions.length; i++) {
    const [fx, fy, fz] = fluffPositions[i];
    addPart(
      hairCrownStyles.fluffy_messy,
      cachedRoundedBox(0.155, 0.095, 0.155, 2, 0.038),
      i % 2 === 0 ? hairMat : hairHighlightMat,
      fx,
      fy,
      fz,
      meshes,
      0.1 * (i % 3),
      0.2 * i,
      0,
    );
  }
  addBackHair(hairSideStyles.fluffy_messy, 0.27, 0.225);
  addSideburns(hairSideStyles.fluffy_messy, 0.19, 0.24);

  // buzz_fade
  addPart(
    hairCrownStyles.buzz_fade,
    cachedRoundedBox(0.415, 0.055, 0.415, 2, 0.02),
    hairMat,
    0,
    0.358,
    -0.004,
    meshes,
  );
  addBackHair(hairSideStyles.buzz_fade, 0.16, 0.28);

  // high_ponytail
  addSkullCap(hairCrownStyles.high_ponytail, 0.075, 0.365);
  const highPonytailTailGroup = new THREE.Group();
  hairSideStyles.high_ponytail.add(highPonytailTailGroup);
  addPart(
    highPonytailTailGroup,
    cachedCylinder(0.055, 0.055, 0.04, 10),
    topAccentMat,
    0,
    0.32,
    -0.22,
    meshes,
    Math.PI / 2,
    0,
    0,
  );
  addPart(
    highPonytailTailGroup,
    cachedRoundedBox(0.13, 0.34, 0.13, 2, 0.036),
    hairMat,
    0,
    0.16,
    -0.27,
    meshes,
    -0.22,
    0,
    0,
  );
  addPart(
    highPonytailTailGroup,
    cachedRoundedBox(0.10, 0.18, 0.10, 2, 0.028),
    hairHighlightMat,
    0,
    0.01,
    -0.31,
    meshes,
    -0.12,
    0,
    0,
  );
  addBackHair(hairSideStyles.high_ponytail, 0.26, 0.24);
  addSideburns(hairSideStyles.high_ponytail, 0.16, 0.25);

  // asym_bob
  addSkullCap(hairCrownStyles.asym_bob, 0.08, 0.37);
  addPart(
    hairCrownStyles.asym_bob,
    cachedRoundedBox(0.28, 0.09, 0.12, 2, 0.025),
    hairHighlightMat,
    0.05,
    0.355,
    0.195,
    meshes,
    0.12,
    0,
    -0.2,
  );
  addPart(
    hairSideStyles.asym_bob,
    cachedRoundedBox(0.07, 0.31, 0.36, 2, 0.022),
    hairMat,
    -0.21,
    0.19,
    -0.01,
    meshes,
  );
  addPart(
    hairSideStyles.asym_bob,
    cachedRoundedBox(0.07, 0.26, 0.34, 2, 0.022),
    hairMat,
    0.21,
    0.215,
    -0.02,
    meshes,
  );
  addBackHair(hairSideStyles.asym_bob, 0.32, 0.20);

  // wavy_shoulder
  addSkullCap(hairCrownStyles.wavy_shoulder, 0.08, 0.37);
  addPart(
    hairSideStyles.wavy_shoulder,
    cachedRoundedBox(0.45, 0.42, 0.10, 2, 0.028),
    hairMat,
    0,
    0.13,
    -0.20,
    meshes,
  );
  addPart(
    hairSideStyles.wavy_shoulder,
    cachedRoundedBox(0.08, 0.37, 0.22, 2, 0.025),
    hairHighlightMat,
    -0.215,
    0.155,
    -0.07,
    meshes,
  );
  addPart(
    hairSideStyles.wavy_shoulder,
    cachedRoundedBox(0.08, 0.37, 0.22, 2, 0.025),
    hairHighlightMat,
    0.215,
    0.155,
    -0.07,
    meshes,
  );

  // mohawk_tactical (bold center ridge + tapered shaved sides)
  addPart(hairCrownStyles.mohawk_tactical, cachedRoundedBox(0.13, 0.14, 0.42, 2, 0.028), hairHighlightMat, 0, 0.43, -0.01, meshes, -0.06, 0, 0);
  addPart(hairCrownStyles.mohawk_tactical, cachedRoundedBox(0.10, 0.09, 0.16, 2, 0.02), hairMat, 0, 0.48, 0.11, meshes, 0.22, 0, 0);
  addPart(hairSideStyles.mohawk_tactical, cachedRoundedBox(0.12, 0.26, 0.08, 2, 0.02), hairMat, 0, 0.27, -0.20, meshes);

  // slick_back (swept-back pompadour ridge & sleek sides)
  addSkullCap(hairCrownStyles.slick_back, 0.085, 0.37);
  addPart(hairCrownStyles.slick_back, cachedRoundedBox(0.37, 0.10, 0.40, 2, 0.032), hairHighlightMat, 0, 0.425, 0.01, meshes, -0.14, 0, 0);
  addBackHair(hairSideStyles.slick_back, 0.23, 0.24);
  addSideburns(hairSideStyles.slick_back, 0.14, 0.25);

  // twin_buns (crown base + dual space buns on top/upper sides — tuck under hats & helmets!)
  addSkullCap(hairCrownStyles.twin_buns, 0.08, 0.368);
  addPart(hairCrownStyles.twin_buns, cachedRoundedBox(0.24, 0.065, 0.11, 2, 0.02), hairMat, 0, 0.35, 0.20, meshes, 0.15, 0, 0);
  addPart(hairCrownStyles.twin_buns, cachedCylinder(0.088, 0.088, 0.10, 12), hairHighlightMat, -0.21, 0.38, -0.05, meshes, 0, 0, 0.32);
  addPart(hairCrownStyles.twin_buns, cachedCylinder(0.088, 0.088, 0.10, 12), hairHighlightMat, 0.21, 0.38, -0.05, meshes, 0, 0, -0.32);
  addBackHair(hairSideStyles.twin_buns, 0.24, 0.24);
  addSideburns(hairSideStyles.twin_buns, 0.16, 0.25);

  // side_braid (sleek crown + long woven braid draped over left shoulder)
  addSkullCap(hairCrownStyles.side_braid, 0.08, 0.368);
  addPart(hairCrownStyles.side_braid, cachedRoundedBox(0.28, 0.075, 0.12, 2, 0.022), hairHighlightMat, 0.06, 0.35, 0.19, meshes, 0.14, 0, -0.18);
  addBackHair(hairSideStyles.side_braid, 0.28, 0.22);
  addSideburns(hairSideStyles.side_braid, 0.18, 0.24);
  addPart(hairSideStyles.side_braid, cachedRoundedBox(0.095, 0.18, 0.095, 2, 0.032), hairMat, 0.20, 0.14, 0.08, meshes, 0.12, 0, -0.14);
  addPart(hairSideStyles.side_braid, cachedRoundedBox(0.085, 0.18, 0.085, 2, 0.03), hairHighlightMat, 0.21, 0.01, 0.12, meshes, 0.1, 0, -0.08);
  addPart(hairSideStyles.side_braid, cachedCylinder(0.045, 0.045, 0.03, 10), topAccentMat, 0.215, -0.06, 0.13, meshes);

  // curly_crop (tight sculpted coils across crown and sides)
  addSkullCap(hairCrownStyles.curly_crop, 0.095, 0.378);
  const coilSpecs: Array<[number, number, number]> = [
    [-0.14, 0.425, 0.12],
    [0.14, 0.425, 0.12],
    [0, 0.44, 0.14],
    [-0.15, 0.415, -0.06],
    [0.15, 0.415, -0.06],
    [0, 0.445, -0.04],
    [-0.08, 0.41, -0.16],
    [0.08, 0.41, -0.16],
  ];
  for (let i = 0; i < coilSpecs.length; i++) {
    const [cx, cy, cz] = coilSpecs[i];
    addPart(hairCrownStyles.curly_crop, cachedSphere(0.082, 10, 8), i % 2 === 0 ? hairMat : hairHighlightMat, cx, cy, cz, meshes);
  }
  addBackHair(hairSideStyles.curly_crop, 0.25, 0.235);
  addSideburns(hairSideStyles.curly_crop, 0.17, 0.245);

  // wolf_cut (shaggy layered crown bangs + flared feathered back wings)
  addSkullCap(hairCrownStyles.wolf_cut, 0.09, 0.372);
  addPart(hairCrownStyles.wolf_cut, cachedRoundedBox(0.20, 0.11, 0.12, 2, 0.022), hairMat, -0.11, 0.35, 0.18, meshes, 0.14, 0.14, 0.20);
  addPart(hairCrownStyles.wolf_cut, cachedRoundedBox(0.20, 0.11, 0.12, 2, 0.022), hairHighlightMat, 0.11, 0.35, 0.18, meshes, 0.14, -0.14, -0.20);
  addPart(hairSideStyles.wolf_cut, cachedRoundedBox(0.46, 0.34, 0.09, 2, 0.024), hairMat, 0, 0.17, -0.20, meshes, -0.10, 0, 0);
  addPart(hairSideStyles.wolf_cut, cachedRoundedBox(0.08, 0.30, 0.20, 2, 0.022), hairHighlightMat, -0.22, 0.18, -0.05, meshes, 0, 0, -0.12);
  addPart(hairSideStyles.wolf_cut, cachedRoundedBox(0.08, 0.30, 0.20, 2, 0.022), hairHighlightMat, 0.22, 0.18, -0.05, meshes, 0, 0, 0.12);

  // low_ponytail (sleek parted top + low tied tail at nape of neck)
  addSkullCap(hairCrownStyles.low_ponytail, 0.08, 0.368);
  addBackHair(hairSideStyles.low_ponytail, 0.26, 0.235);
  addSideburns(hairSideStyles.low_ponytail, 0.17, 0.245);
  addPart(hairSideStyles.low_ponytail, cachedCylinder(0.052, 0.052, 0.035, 10), topAccentMat, 0, 0.14, -0.22, meshes, Math.PI / 2, 0, 0);
  addPart(hairSideStyles.low_ponytail, cachedRoundedBox(0.14, 0.28, 0.12, 2, 0.034), hairHighlightMat, 0, 0.01, -0.25, meshes, -0.12, 0, 0);

  // =====================================================================
  // 6. HATS, GLASSES & MASKS (Calibrated cleanly to 0.40 R6 Head)
  // =====================================================================
  const hatGroups: Record<R6HatId, THREE.Group> = {
    none: new THREE.Group(),
    baseball_cap: new THREE.Group(),
    backwards_cap: new THREE.Group(),
    beanie: new THREE.Group(),
    bucket_hat: new THREE.Group(),
    tactical_cap: new THREE.Group(),
  };
  for (const g of Object.values(hatGroups)) {
    rig.bones.Head.add(g);
  }

  // baseball_cap (brim +Z)
  addPart(
    hatGroups.baseball_cap,
    cachedRoundedBox(0.435, 0.145, 0.435, 2, 0.036),
    hatPrimaryMat,
    0,
    0.345,
    0,
    meshes,
  );
  addPart(
    hatGroups.baseball_cap,
    cachedRoundedBox(0.41, 0.034, 0.22, 2, 0.014),
    hatAccentMat,
    0,
    0.295,
    0.265,
    meshes,
    0.09,
    0,
    0,
  );
  addPart(
    hatGroups.baseball_cap,
    cachedRoundedBox(0.11, 0.065, 0.02, 1, 0.005),
    hatAccentMat,
    0,
    0.345,
    0.222,
    meshes,
  );

  // backwards_cap (brim -Z)
  addPart(
    hatGroups.backwards_cap,
    cachedRoundedBox(0.435, 0.145, 0.435, 2, 0.036),
    hatPrimaryMat,
    0,
    0.345,
    0,
    meshes,
  );
  addPart(
    hatGroups.backwards_cap,
    cachedRoundedBox(0.41, 0.034, 0.22, 2, 0.014),
    hatAccentMat,
    0,
    0.295,
    -0.265,
    meshes,
    -0.09,
    0,
    0,
  );

  // beanie
  addPart(
    hatGroups.beanie,
    cachedRoundedBox(0.445, 0.095, 0.445, 2, 0.028),
    hatAccentMat,
    0,
    0.315,
    0,
    meshes,
  );
  addPart(
    hatGroups.beanie,
    cachedRoundedBox(0.425, 0.155, 0.425, 2, 0.055),
    hatPrimaryMat,
    0,
    0.385,
    -0.01,
    meshes,
  );

  // bucket_hat
  addPart(
    hatGroups.bucket_hat,
    cachedCylinder(0.24, 0.265, 0.135, 16),
    hatPrimaryMat,
    0,
    0.365,
    0,
    meshes,
  );
  addPart(
    hatGroups.bucket_hat,
    cachedCylinder(0.27, 0.345, 0.052, 18),
    hatAccentMat,
    0,
    0.295,
    0,
    meshes,
  );

  // tactical_cap
  addPart(
    hatGroups.tactical_cap,
    cachedRoundedBox(0.438, 0.148, 0.438, 2, 0.03),
    hatPrimaryMat,
    0,
    0.348,
    0,
    meshes,
  );
  addPart(
    hatGroups.tactical_cap,
    cachedRoundedBox(0.405, 0.032, 0.23, 2, 0.012),
    hatPrimaryMat,
    0,
    0.295,
    0.265,
    meshes,
    0.08,
    0,
    0,
  );
  addPart(
    hatGroups.tactical_cap,
    cachedRoundedBox(0.14, 0.06, 0.022, 1, 0.005),
    hatAccentMat,
    0,
    0.352,
    0.223,
    meshes,
  );

  // Glasses
  const glassesGroups: Record<R6GlassesId, THREE.Group> = {
    none: new THREE.Group(),
    wayfarers: new THREE.Group(),
    aviators: new THREE.Group(),
    cyber_visor: new THREE.Group(),
    round_frames: new THREE.Group(),
  };
  for (const g of Object.values(glassesGroups)) {
    rig.bones.Head.add(g);
  }

  // wayfarers
  addPart(glassesGroups.wayfarers, cachedRoundedBox(0.36, 0.024, 0.025, 1, 0.006), glassesFrameMat, 0, 0.228, 0.214, meshes);
  addPart(glassesGroups.wayfarers, cachedRoundedBox(0.135, 0.085, 0.022, 1, 0.008), glassesLensMat, -0.095, 0.195, 0.212, meshes);
  addPart(glassesGroups.wayfarers, cachedRoundedBox(0.135, 0.085, 0.022, 1, 0.008), glassesLensMat, 0.095, 0.195, 0.212, meshes);
  addPart(glassesGroups.wayfarers, cachedRoundedBox(0.022, 0.024, 0.24, 1, 0.004), glassesFrameMat, -0.205, 0.215, 0.09, meshes);
  addPart(glassesGroups.wayfarers, cachedRoundedBox(0.022, 0.024, 0.24, 1, 0.004), glassesFrameMat, 0.205, 0.215, 0.09, meshes);

  // aviators
  addPart(glassesGroups.aviators, cachedRoundedBox(0.34, 0.016, 0.02, 1, 0.004), glassesFrameMat, 0, 0.23, 0.214, meshes);
  addPart(glassesGroups.aviators, cachedRoundedBox(0.145, 0.095, 0.022, 2, 0.024), glassesLensMat, -0.095, 0.188, 0.212, meshes);
  addPart(glassesGroups.aviators, cachedRoundedBox(0.145, 0.095, 0.022, 2, 0.024), glassesLensMat, 0.095, 0.188, 0.212, meshes);
  addPart(glassesGroups.aviators, cachedRoundedBox(0.018, 0.018, 0.24, 1, 0.004), glassesFrameMat, -0.204, 0.215, 0.09, meshes);
  addPart(glassesGroups.aviators, cachedRoundedBox(0.018, 0.018, 0.24, 1, 0.004), glassesFrameMat, 0.204, 0.215, 0.09, meshes);

  // cyber_visor
  addPart(glassesGroups.cyber_visor, cachedRoundedBox(0.425, 0.105, 0.045, 2, 0.014), glassesLensMat, 0, 0.205, 0.205, meshes);
  addPart(glassesGroups.cyber_visor, cachedRoundedBox(0.435, 0.025, 0.22, 1, 0.006), glassesFrameMat, 0, 0.22, 0.125, meshes);

  // round_frames
  addPart(glassesGroups.round_frames, cachedCylinder(0.062, 0.062, 0.02, 14), glassesFrameMat, -0.092, 0.195, 0.212, meshes, Math.PI / 2, 0, 0);
  addPart(glassesGroups.round_frames, cachedCylinder(0.062, 0.062, 0.02, 14), glassesFrameMat, 0.092, 0.195, 0.212, meshes, Math.PI / 2, 0, 0);
  addPart(glassesGroups.round_frames, cachedCylinder(0.05, 0.05, 0.024, 14), glassesLensMat, -0.092, 0.195, 0.214, meshes, Math.PI / 2, 0, 0);
  addPart(glassesGroups.round_frames, cachedCylinder(0.05, 0.05, 0.024, 14), glassesLensMat, 0.092, 0.195, 0.214, meshes, Math.PI / 2, 0, 0);
  addPart(glassesGroups.round_frames, cachedRoundedBox(0.08, 0.018, 0.02, 1, 0.004), glassesFrameMat, 0, 0.205, 0.213, meshes);

  // Masks
  const maskGroups: Record<R6MaskId, THREE.Group> = {
    none: new THREE.Group(),
    cloth_mask: new THREE.Group(),
    respirator: new THREE.Group(),
    gaiter_scarf: new THREE.Group(),
  };
  for (const g of Object.values(maskGroups)) {
    rig.bones.Head.add(g);
  }

  // cloth_mask
  addPart(maskGroups.cloth_mask, cachedRoundedBox(0.418, 0.155, 0.16, 2, 0.02), maskMat, 0, 0.068, 0.145, meshes);
  addPart(maskGroups.cloth_mask, cachedRoundedBox(0.18, 0.025, 0.02, 1, 0.006), maskTrimMat, 0, 0.075, 0.228, meshes);

  // respirator
  addPart(maskGroups.respirator, cachedRoundedBox(0.422, 0.165, 0.19, 2, 0.022), maskMat, 0, 0.068, 0.135, meshes);
  addPart(maskGroups.respirator, cachedCylinder(0.055, 0.06, 0.055, 10), maskTrimMat, -0.105, 0.065, 0.232, meshes, Math.PI / 2, 0, 0);
  addPart(maskGroups.respirator, cachedCylinder(0.055, 0.06, 0.055, 10), maskTrimMat, 0.105, 0.065, 0.232, meshes, Math.PI / 2, 0, 0);

  // gaiter_scarf
  addPart(maskGroups.gaiter_scarf, cachedRoundedBox(0.43, 0.175, 0.43, 2, 0.028), maskMat, 0, 0.06, 0, meshes);
  addPart(maskGroups.gaiter_scarf, cachedRoundedBox(0.435, 0.032, 0.435, 1, 0.01), maskTrimMat, 0, 0.125, 0, meshes);

  // Tag hair, hat, glasses, and mask meshes for adaptive head introspection & helmet tucking
  const tagSubtree = (rootObj: THREE.Object3D, part: string, isHairOrHat: boolean): void => {
    rootObj.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.userData.r6Part = part;
        if (isHairOrHat) obj.userData.isHairOrHat = true;
      }
    });
  };
  tagSubtree(hairCrownGroup, 'hair_crown', true);
  tagSubtree(hairSidesGroup, 'hair_side', true);
  for (const g of Object.values(hatGroups)) tagSubtree(g, 'hat', true);
  for (const g of Object.values(glassesGroups)) tagSubtree(g, 'glasses', false);
  for (const g of Object.values(maskGroups)) tagSubtree(g, 'mask', false);

  let lastWearingHelmet = false;

  // =====================================================================
  // 7. APPEARANCE APPLICATOR
  // =====================================================================
  const applyAppearance = (
    preset: R6CharacterPreset,
    rawCustom: Partial<R6Customization>,
    accentOverrideHex?: string,
    visorOverrideHex?: string,
    options?: R6AppearanceOptions,
  ): void => {
    activePreset = preset;
    activeCustom = normalizeR6Customization({
      ...activeCustom,
      ...rawCustom,
    });
    if (options?.wearingHelmet !== undefined) {
      lastWearingHelmet = Boolean(options.wearingHelmet);
    }
    const wearingHelmet = lastWearingHelmet;

    const accentHex = accentOverrideHex ?? preset.accentHex;
    const visorHex = visorOverrideHex ?? preset.visorHex;

    const skinOpt = getSkinOption(activeCustom.skinId);
    const eyeOpt = getEyeOption(activeCustom.eyesId);
    const mouthOpt = getMouthOption(activeCustom.mouthId);
    const hairStyleOpt = getHairStyleOption(activeCustom.hairStyleId);
    const hairColorOpt = getHairColorOption(activeCustom.hairColorId);
    const topOpt = getTopOption(activeCustom.topId);
    const pantsOpt = getPantsOption(activeCustom.pantsId);
    const shoesOpt = getShoesOption(activeCustom.shoesId);
    const hatOpt = getHatOption(activeCustom.hatId);
    const glassesOpt = getGlassesOption(activeCustom.glassesId);
    const maskOpt = getMaskOption(activeCustom.maskId);

    // Skin + Face CanvasTexture
    skinMat.color.set(skinOpt.skinBaseHex);
    skinShadeMat.color.set(skinOpt.skinShadeHex);
    faceMat.map = getR6FaceTexture({
      skinBaseHex: skinOpt.skinBaseHex,
      skinShadeHex: skinOpt.skinShadeHex,
      eyesId: eyeOpt.id,
      eyeHex: eyeOpt.id === 'cyber_glow' ? visorHex : (activePreset.irisHex ?? eyeOpt.eyeHex),
      mouthId: mouthOpt.id,
      faceMarkId: activeCustom.faceMarkId,
      hairColorHex: hairColorOpt.hairBaseHex,
      gender: preset.gender,
    });
    faceMat.needsUpdate = true;

    // Modern Top garment colors & silhouette toggles
    const isSyncTop = topOpt.id === 'operator_sync';
    const topPrimaryHex = isSyncTop ? accentHex : topOpt.primaryHex;
    const topSecondaryHex = isSyncTop ? '#1e293b' : topOpt.secondaryHex;
    const topAccentHex = isSyncTop ? visorHex : topOpt.accentHex;

    topBaseMat.color.set(topPrimaryHex);
    topSecondaryMat.color.set(topSecondaryHex);
    topAccentMat.color.set(topAccentHex);
    topFrontPanelMat.map = getR6TopFrontTexture(
      topOpt.garmentType,
      topPrimaryHex,
      topSecondaryHex,
      topAccentHex,
      topOpt.innerHex,
      topOpt.patternVariant ?? 'standard',
    );
    topFrontPanelMat.needsUpdate = true;

    hoodieDetailGroup.visible = topOpt.garmentType === 'hoodie';
    hoodiePocketMesh.visible = topOpt.garmentType === 'hoodie';
    jacketDetailGroup.visible =
      topOpt.garmentType === 'bomber' ||
      topOpt.garmentType === 'jacket' ||
      topOpt.garmentType === 'varsity' ||
      topOpt.garmentType === 'parka';
    pufferDetailGroup.visible = topOpt.garmentType === 'puffer';

    const showShortSleeves = topOpt.garmentType === 'tshirt';
    for (const m of longSleeveParts) m.visible = !showShortSleeves;
    for (const m of shortSleeveParts) m.visible = showShortSleeves;
    for (const m of bareForearmParts) m.visible = showShortSleeves;

    // Pants & 3D Cargo pockets
    pantsBaseMat.color.set(pantsOpt.baseHex);
    pantsShadeMat.color.set(pantsOpt.shadeHex);
    pantsPanelMat.map = getR6PantsTexture(
      pantsOpt.garmentType,
      pantsOpt.baseHex,
      pantsOpt.shadeHex,
      pantsOpt.accentHex,
    );
    pantsPanelMat.needsUpdate = true;
    const showCargoPockets = pantsOpt.garmentType === 'cargo';
    for (const m of cargoPocketMeshes) m.visible = showCargoPockets;

    // Shoes & High-top/Boot collars
    shoePrimaryMat.color.set(shoesOpt.upperHex);
    shoeAccentMat.color.set(shoesOpt.accentHex);
    shoeSoleMat.color.set(shoesOpt.soleHex);
    const showHighCollar = shoesOpt.styleType === 'hightop' || shoesOpt.styleType === 'boot';
    for (const m of highTopCuffMeshes) m.visible = showHighCollar;

    // Hairstyles (auto-tuck crown volume & upper buns under hats and helmets to eliminate clipping!)
    hairMat.color.set(hairColorOpt.hairBaseHex);
    hairHighlightMat.color.set(hairColorOpt.hairHighlightHex);
    const wearingHat = hatOpt.id !== 'none';
    const hideCrownHair = wearingHat || wearingHelmet;
    for (const id of Object.keys(hairCrownStyles) as R6HairStyleId[]) {
      const match = id === hairStyleOpt.id;
      hairCrownStyles[id].visible = match && !hideCrownHair;
      hairSideStyles[id].visible = match;
    }

    if (wearingHelmet) {
      // Tuck upper side/back hair & sideburns smoothly inside helmet shell while keeping lower hair flowing naturally
      hairSidesGroup.scale.set(0.89, 0.72, 0.89);
      hairSidesGroup.position.set(0, -0.015, 0);
      highPonytailTailGroup.position.set(0, -0.14, 0.01);
      highPonytailTailGroup.scale.set(0.92, 0.84, 0.92);
    } else {
      hairSidesGroup.scale.set(1, 1, 1);
      hairSidesGroup.position.set(0, 0, 0);
      highPonytailTailGroup.position.set(0, 0, 0);
      highPonytailTailGroup.scale.set(1, 1, 1);
    }

    // Hats (suppressed while wearing an arena ballistic helmet so brims/beanies never clip through armor)
    hatPrimaryMat.color.set(hatOpt.swatchHex);
    hatAccentMat.color.set(
      hatOpt.id === 'tactical_cap' ? accentHex : hatOpt.accentHex,
    );
    for (const id of Object.keys(hatGroups) as R6HatId[]) {
      hatGroups[id].visible = !wearingHelmet && id === hatOpt.id;
    }

    // Glasses
    glassesFrameMat.color.set(glassesOpt.swatchHex);
    const lensHex = glassesOpt.id === 'cyber_visor' ? visorHex : glassesOpt.accentHex;
    glassesLensMat.color.set(
      glassesOpt.id === 'round_frames' ? '#cbd5e1' : lensHex,
    );
    glassesLensMat.emissive.set(
      glassesOpt.id === 'cyber_visor' ? visorHex : '#0f172a',
    );
    glassesLensMat.emissiveIntensity = glassesOpt.id === 'cyber_visor' ? 0.85 : 0.14;
    glassesLensMat.opacity = glassesOpt.id === 'round_frames' ? 0.34 : 0.86;
    for (const id of Object.keys(glassesGroups) as R6GlassesId[]) {
      glassesGroups[id].visible = id === glassesOpt.id;
    }

    // Masks
    maskMat.color.set(maskOpt.swatchHex);
    maskTrimMat.color.set(
      maskOpt.id === 'respirator' ? visorHex : maskOpt.accentHex,
    );
    for (const id of Object.keys(maskGroups) as R6MaskId[]) {
      maskGroups[id].visible = id === maskOpt.id;
    }

    root.scale.setScalar(preset.heightScale);
  };

  applyAppearance(activePreset, activeCustom, accentHexOverride, visorHexOverride);

  const getHeadFitProfile = (): HeadFitProfile => measureHeadFitProfile(rig.bones.Head);

  const dispose = (): void => {
    for (const m of ownedMaterials) {
      m.dispose();
    }
    ownedMaterials.length = 0;
  };

  return {
    root,
    skeleton: rig.skeleton,
    bones: rig.bones,
    preset: activePreset,
    customization: activeCustom,
    meshes,
    getHeadFitProfile,
    updateAppearance: applyAppearance,
    dispose,
  };
}

export async function downloadR6CharacterGlb(
  modelId: string,
  customization?: Partial<R6Customization>,
): Promise<void> {
  const preset = getR6CharacterPreset(modelId);
  const built = buildR6CharacterModel(preset, customization);
  built.root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      built.root,
      (res) => resolve(res as ArrayBuffer),
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true },
    );
  });
  built.dispose();

  const blob = new Blob([buffer], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${preset.id}-r6.glb`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
