import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { QualityPreset } from '../core/Types';
import { clamp, damp } from '../utils/MathUtils';
import type { BiomeType } from './IMapSystem';

export const SKY_SUN_DIRECTION = new THREE.Vector3(28, 42, 22).normalize();

const SKY_DOME_RADIUS = 680;
const CLOUD_MAX_CLUSTERS = 24;
const CLOUD_WRAP_HALF_SPAN = 560;

const SNOW_MAX_PARTICLES = 480;
const DUST_MAX_PARTICLES = 260;

interface BiomeSkyPalette {
  zenith: string;
  midSky: string;
  horizon: string;
  groundBounce: string;
  sunColor: string;
  cloudLit: string;
  cloudShade: string;
  cloudCoverage: number;
  cloudOpacity: number;
}

const BIOME_PALETTES: Record<BiomeType, BiomeSkyPalette> = {
  desert: {
    zenith: '#1d6fd6',
    midSky: '#68b5f2',
    horizon: '#d7cab4',
    groundBounce: '#b89468',
    sunColor: '#fff3d4',
    cloudLit: '#fff9ef',
    cloudShade: '#d9cbb8',
    cloudCoverage: 0.36,
    cloudOpacity: 0.56,
  },
  forest: {
    zenith: '#1867d1',
    midSky: '#5bb2f6',
    horizon: '#c4e2f3',
    groundBounce: '#4c7351',
    sunColor: '#fff6de',
    cloudLit: '#ffffff',
    cloudShade: '#c0d3e8',
    cloudCoverage: 0.48,
    cloudOpacity: 0.64,
  },
  snow: {
    zenith: '#2c6bb8',
    midSky: '#7abae8',
    horizon: '#d1e3f2',
    groundBounce: '#93abc2',
    sunColor: '#f5f9ff',
    cloudLit: '#f8fbff',
    cloudShade: '#bacbd9',
    cloudCoverage: 0.54,
    cloudOpacity: 0.62,
  },
};

interface CloudClusterState {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  yaw: number;
  speedMul: number;
}

export class SkyAndWeatherSystem {
  readonly root = new THREE.Group();

  private readonly skyMesh: THREE.Mesh;
  private readonly skyMat: THREE.ShaderMaterial;

  private readonly cloudMesh: THREE.InstancedMesh;
  private readonly cloudMat: THREE.MeshBasicMaterial;
  private readonly cloudTex: THREE.CanvasTexture;
  private readonly clouds: CloudClusterState[] = [];
  private readonly cloudDummy = new THREE.Object3D();

  private readonly snowPoints: THREE.Points;
  private readonly snowMat: THREE.ShaderMaterial;

  private readonly dustPoints: THREE.Points;
  private readonly dustMat: THREE.ShaderMaterial;

  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

  private readonly cameraPos = new THREE.Vector3(0, 12, 0);
  private activeBiome: BiomeType = 'desert';
  private isWaitingArena = false;
  private qualityPreset: QualityPreset = 'medium';
  private isCompactDevice = false;
  private pixelRatio = 1;
  private cloudSyncAccum = 0;

  // Desert intermittent gust state machine
  private gustState: 'calm' | 'gust' = 'calm';
  private gustTimerSec = 9.0;
  private gustDurationSec = 9.5;
  private gustIntensity = 0;
  private gustPeak = 0.72;
  private gustDrift = 0;
  private gustSpeedMps = 8.5;
  private readonly gustWindDir = new THREE.Vector2(0.86, 0.51);

  constructor() {
    this.root.name = 'SkyAndWeatherSystem';

    // 1. Procedural Atmospheric Sky Dome (gradient sky + sun disc/scatter + soft high clouds)
    const skyGeo = new THREE.SphereGeometry(SKY_DOME_RADIUS, 28, 18);
    this.ownedGeometries.push(skyGeo);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: SKY_SUN_DIRECTION.clone() },
        uZenithColor: { value: new THREE.Color(BIOME_PALETTES.desert.zenith) },
        uMidSkyColor: { value: new THREE.Color(BIOME_PALETTES.desert.midSky) },
        uHorizonColor: { value: new THREE.Color(BIOME_PALETTES.desert.horizon) },
        uGroundColor: { value: new THREE.Color(BIOME_PALETTES.desert.groundBounce) },
        uSunColor: { value: new THREE.Color(BIOME_PALETTES.desert.sunColor) },
        uCloudLit: { value: new THREE.Color(BIOME_PALETTES.desert.cloudLit) },
        uCloudShade: { value: new THREE.Color(BIOME_PALETTES.desert.cloudShade) },
        uCloudCoverage: { value: BIOME_PALETTES.desert.cloudCoverage },
        uCloudDetail: { value: 1.0 },
        uIsNightLobby: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uZenithColor;
        uniform vec3 uMidSkyColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uGroundColor;
        uniform vec3 uSunColor;
        uniform vec3 uCloudLit;
        uniform vec3 uCloudShade;
        uniform float uCloudCoverage;
        uniform float uCloudDetail;
        uniform float uIsNightLobby;

        varying vec3 vWorldPos;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbmClouds(vec2 p) {
          float v = 0.0;
          v += 0.56 * noise2(p);
          p = p * 2.07 + vec2(11.3, 7.1);
          v += 0.29 * noise2(p);
          p = p * 2.13 + vec2(5.7, 19.4);
          v += 0.15 * noise2(p);
          return v;
        }

        void main() {
          vec3 refEye = vec3(cameraPosition.x, cameraPosition.y * 0.22, cameraPosition.z);
          vec3 dir = normalize(vWorldPos - refEye);
          float h = dir.y;

          // Natural daytime Rayleigh + horizon scatter gradient
          vec3 sky = uHorizonColor;
          if (h >= 0.0) {
            float lowerT = pow(smoothstep(0.0, 0.34, h), 0.72);
            float upperT = smoothstep(0.22, 0.94, h);
            sky = mix(uHorizonColor, uMidSkyColor, lowerT);
            sky = mix(sky, uZenithColor, upperT);
          } else {
            float belowT = smoothstep(0.0, -0.35, h);
            sky = mix(uHorizonColor, uGroundColor, belowT);
          }

          // Gold Saucer cosmic night dome with twinkling starfield & subtle magenta/violet nebula
          if (uIsNightLobby > 0.5) {
            if (h > 0.02) {
              vec2 starGrid = dir.xz / (h + 0.35) * 46.0;
              vec2 cell = floor(starGrid);
              vec2 local = fract(starGrid) - 0.5;
              float rnd = hash21(cell);
              if (rnd > 0.91) {
                vec2 offset = vec2(hash21(cell + 13.7), hash21(cell + 29.1)) - 0.5;
                float d = length(local - offset * 0.55);
                float twinkle = 0.65 + 0.35 * sin(uTime * (2.2 + rnd * 3.0) + rnd * 40.0);
                float star = smoothstep(0.11, 0.012, d) * twinkle * smoothstep(0.02, 0.22, h);
                vec3 starTint = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.82, 0.96), hash21(cell + 7.3));
                sky += starTint * star * 1.35;
              }
              float neb = fbmClouds(dir.xz * 1.45 + vec2(3.2, -1.8));
              vec3 nebulaCol = mix(vec3(0.18, 0.06, 0.32), vec3(0.42, 0.10, 0.36), neb);
              sky = mix(sky, nebulaCol, smoothstep(0.45, 0.85, neb) * 0.28 * smoothstep(0.05, 0.45, h));
            }
          } else {
            // Sun scatter halo & crisp solar disc
            float sunCos = max(dot(dir, uSunDir), 0.0);
            float aboveHorizon = smoothstep(-0.04, 0.08, h);
            float wideGlow = pow(sunCos, 5.0) * 0.18 + pow(sunCos, 36.0) * 0.32;
            float sunDisc = smoothstep(0.9986, 0.99935, sunCos) * 1.25;
            sky += uSunColor * (wideGlow + sunDisc) * aboveHorizon;

            // Feathery high-altitude cirrus/cumulus cloud wisps
            if (h > 0.015) {
              vec2 cloudUv = dir.xz / (h + 0.18);
              vec2 drift = vec2(uTime * 0.012, uTime * 0.005);
              float density;
              if (uCloudDetail < 0.5) {
                density = noise2(cloudUv * 0.95 + drift) * 0.9 + 0.08;
              } else {
                float c1 = fbmClouds(cloudUv * 0.85 + drift);
                float c2 = noise2(cloudUv * 2.2 - drift * 1.4);
                density = c1 * 0.78 + c2 * 0.22;
              }

              float edgeStart = 1.0 - uCloudCoverage;
              float cloudAlpha = smoothstep(edgeStart, edgeStart + 0.34, density);
              cloudAlpha *= smoothstep(0.015, 0.21, h) * 0.78;

              float sunHighlight = 0.48 + 0.52 * pow(sunCos, 3.0);
              vec3 cloudCol = mix(uCloudShade, uCloudLit, sunHighlight);
              sky = mix(sky, cloudCol, cloudAlpha);
            }
          }

          gl_FragColor = vec4(sky, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    this.ownedMaterials.push(this.skyMat);

    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.skyMesh.renderOrder = -100;
    this.skyMesh.frustumCulled = false;
    this.root.add(this.skyMesh);

    // 2. Soft 3D Drifting Cloud Puffs (1 InstancedMesh draw call, safely above airplane)
    this.cloudTex = this.createSoftCloudTexture();
    this.ownedTextures.push(this.cloudTex);

    const cloudGeo = this.createCloudClusterGeometry();
    this.ownedGeometries.push(cloudGeo);

    this.cloudMat = new THREE.MeshBasicMaterial({
      map: this.cloudTex,
      color: '#ffffff',
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    this.ownedMaterials.push(this.cloudMat);

    this.cloudMesh = new THREE.InstancedMesh(cloudGeo, this.cloudMat, CLOUD_MAX_CLUSTERS);
    this.cloudMesh.frustumCulled = false;
    this.cloudMesh.renderOrder = -60;
    this.cloudMesh.castShadow = false;
    this.cloudMesh.receiveShadow = false;
    this.root.add(this.cloudMesh);

    this.initClouds();

    // 3. Light Natural Snowfall System (Snow Map, 1 GPU Points draw call)
    const { geometry: snowGeo, material: snowMat } = this.createSnowSystem();
    this.ownedGeometries.push(snowGeo);
    this.ownedMaterials.push(snowMat);
    this.snowMat = snowMat;
    this.snowPoints = new THREE.Points(snowGeo, snowMat);
    this.snowPoints.frustumCulled = false;
    this.snowPoints.renderOrder = 15;
    this.snowPoints.visible = false;
    this.root.add(this.snowPoints);

    // 4. Intermittent Desert Dust & Sand Gust System (Desert Map, 1 GPU Points draw call)
    const { geometry: dustGeo, material: dustMat } = this.createDustSystem();
    this.ownedGeometries.push(dustGeo);
    this.ownedMaterials.push(dustMat);
    this.dustMat = dustMat;
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.dustPoints.frustumCulled = false;
    this.dustPoints.renderOrder = 14;
    this.dustPoints.visible = false;
    this.root.add(this.dustPoints);
  }

  private createSoftCloudTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    // Soft overlapping radial lobes for natural billowing cotton edges
    const lobes: Array<[number, number, number, number]> = [
      [64, 66, 56, 0.55],
      [42, 70, 38, 0.42],
      [88, 70, 38, 0.42],
      [54, 52, 34, 0.48],
      [78, 54, 32, 0.45],
    ];
    for (const [cx, cy, r, peakAlpha] of lobes) {
      const grad = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 255, 255, ${peakAlpha})`);
      grad.addColorStop(0.55, `rgba(250, 252, 255, ${peakAlpha * 0.48})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  private createCloudClusterGeometry(): THREE.BufferGeometry {
    const p1 = new THREE.PlaneGeometry(1, 0.62);
    p1.rotateX(-Math.PI * 0.5);

    const p2 = new THREE.PlaneGeometry(0.92, 0.48);
    p2.rotateX(-0.32);
    p2.translate(0, 0.05, 0);

    const p3 = new THREE.PlaneGeometry(0.86, 0.46);
    p3.rotateY(Math.PI * 0.5);
    p3.rotateZ(0.26);
    p3.translate(0.08, 0.04, -0.04);

    const merged = mergeGeometries([p1, p2, p3], false);
    p1.dispose();
    p2.dispose();
    p3.dispose();
    return merged ?? new THREE.PlaneGeometry(1, 0.62);
  }

  private initClouds(): void {
    // Deterministic seeded-style distribution around upper sky dome
    for (let i = 0; i < CLOUD_MAX_CLUSTERS; i++) {
      const t = i / CLOUD_MAX_CLUSTERS;
      const angle = t * Math.PI * 2 + (i % 3) * 0.45;
      const radius = 95 + ((i * 173) % 390);
      this.clouds.push({
        x: Math.cos(angle) * radius,
        y: 238 + ((i * 37) % 52),
        z: Math.sin(angle) * radius,
        scaleX: 78 + ((i * 29) % 58),
        scaleY: 22 + ((i * 13) % 16),
        scaleZ: 54 + ((i * 23) % 44),
        yaw: (i * 1.17) % (Math.PI * 2),
        speedMul: 0.72 + ((i * 19) % 10) * 0.06,
      });
    }
    this.syncCloudMatrices();
  }

  private syncCloudMatrices(): void {
    const activeCount = this.cloudMesh.count;
    for (let i = 0; i < activeCount; i++) {
      const c = this.clouds[i];
      this.cloudDummy.position.set(c.x, c.y, c.z);
      this.cloudDummy.rotation.set(0, c.yaw, 0);
      this.cloudDummy.scale.set(c.scaleX, c.scaleY, c.scaleZ);
      this.cloudDummy.updateMatrix();
      this.cloudMesh.setMatrixAt(i, this.cloudDummy.matrix);
    }
    this.cloudMesh.instanceMatrix.needsUpdate = true;
  }

  private createSnowSystem(): {
    geometry: THREE.BufferGeometry;
    material: THREE.ShaderMaterial;
  } {
    const positions = new Float32Array(SNOW_MAX_PARTICLES * 3);
    const seeds = new Float32Array(SNOW_MAX_PARTICLES * 3);

    for (let i = 0; i < SNOW_MAX_PARTICLES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

      seeds[i * 3] = Math.random(); // fall speed variance
      seeds[i * 3 + 1] = Math.random(); // flutter phase
      seeds[i * 3 + 2] = 0.65 + Math.random() * 0.75; // flake size multiplier
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uPixelRatio: { value: 1 },
        uOpacity: { value: 0.72 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime;
        uniform vec3 uCameraPos;
        uniform float uPixelRatio;

        varying float vAlpha;

        void main() {
          vec3 boxSize = vec3(40.0, 18.0, 40.0);
          vec3 p = position;

          // Gentle natural descent + light breeze flutter
          float fallSpeed = mix(1.25, 2.15, aSeed.x);
          float phase = aSeed.y * 6.2831853;
          p.y -= uTime * fallSpeed;
          p.x += sin(uTime * 1.15 + phase) * 0.62 + uTime * 0.58;
          p.z += cos(uTime * 0.92 + phase * 1.3) * 0.52 + uTime * 0.26;

          // Wrap smoothly inside camera-local 40x18x40 volume
          vec3 camCenter = vec3(uCameraPos.x, uCameraPos.y + 3.0, uCameraPos.z);
          vec3 worldPos = mod(p - camCenter + boxSize * 0.5, boxSize) - boxSize * 0.5 + camCenter;

          vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
          float dist = length(worldPos - uCameraPos);

          // Fade smoothly at box edges, close to camera lens, and high airplane altitude
          float edgeFade = 1.0 - smoothstep(13.5, 19.5, length(worldPos.xz - uCameraPos.xz));
          float nearFade = smoothstep(0.9, 2.4, dist);
          float altitudeFade = smoothstep(68.0, 38.0, uCameraPos.y);
          vAlpha = edgeFade * nearFade * altitudeFade * (0.55 + 0.45 * aSeed.x);

          float ptSize = (24.0 * aSeed.z * uPixelRatio) / max(1.0, -mvPos.z);
          gl_PointSize = clamp(ptSize, 2.4 * uPixelRatio, 10.0 * uPixelRatio);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vAlpha;

        void main() {
          if (vAlpha <= 0.01) discard;
          float d = length(gl_PointCoord - vec2(0.5));
          float soft = smoothstep(0.5, 0.12, d);
          if (soft <= 0.01) discard;
          gl_FragColor = vec4(0.95, 0.98, 1.0, soft * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    return { geometry, material };
  }

  private createDustSystem(): {
    geometry: THREE.BufferGeometry;
    material: THREE.ShaderMaterial;
  } {
    const positions = new Float32Array(DUST_MAX_PARTICLES * 3);
    const seeds = new Float32Array(DUST_MAX_PARTICLES * 3);

    for (let i = 0; i < DUST_MAX_PARTICLES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 46;
      positions[i * 3 + 1] = 0.2 + Math.random() * 8.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 46;

      seeds[i * 3] = Math.random(); // wind speed variance
      seeds[i * 3 + 1] = Math.random(); // swirl phase
      // 80% crisp sand grains, 20% soft diffused low-opacity dust wisps
      seeds[i * 3 + 2] = i % 5 === 0 ? 1.0 : 0.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
        uGustDrift: { value: 0 },
        uGustAlpha: { value: 0 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime;
        uniform vec3 uCameraPos;
        uniform vec2 uWindDir;
        uniform float uGustDrift;
        uniform float uGustAlpha;
        uniform float uPixelRatio;

        varying float vAlpha;
        varying float vIsWisp;

        void main() {
          vec3 boxSize = vec3(46.0, 10.5, 46.0);
          vec3 p = position;
          float phase = aSeed.y * 6.2831853;
          float speedMul = mix(0.75, 1.32, aSeed.x);

          // Drift smoothly along active gust wind direction with subtle upward swirl
          p.xz += uWindDir * (uGustDrift * speedMul);
          p.y += sin(uTime * 1.45 + phase) * 0.45 + cos(uTime * 0.8 + phase) * 0.25;

          vec3 camCenter = vec3(uCameraPos.x, max(2.2, uCameraPos.y + 0.5), uCameraPos.z);
          vec3 worldPos = mod(p - camCenter + boxSize * 0.5, boxSize) - boxSize * 0.5 + camCenter;

          vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
          float dist = length(worldPos - uCameraPos);

          // Travelling patchy gust wave so dust feels organic and keeps sightlines clear
          float gustBand = 0.45 + 0.55 * sin(dot(worldPos.xz, uWindDir) * 0.095 - uTime * 0.85 + phase * 0.2);
          float edgeFade = 1.0 - smoothstep(15.0, 22.5, length(worldPos.xz - uCameraPos.xz));
          float nearFade = smoothstep(1.1, 2.8, dist);
          float altitudeFade = smoothstep(62.0, 34.0, uCameraPos.y);

          vIsWisp = aSeed.z;
          float baseOpacity = mix(0.46, 0.085, vIsWisp);
          vAlpha = uGustAlpha * gustBand * edgeFade * nearFade * altitudeFade * baseOpacity;

          float baseScale = mix(19.0, 130.0, vIsWisp);
          float ptSize = (baseScale * uPixelRatio) / max(1.0, -mvPos.z);
          float minPx = mix(2.2, 12.0, vIsWisp) * uPixelRatio;
          float maxPx = mix(6.5, 36.0, vIsWisp) * uPixelRatio;
          gl_PointSize = clamp(ptSize, minPx, maxPx);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying float vIsWisp;

        void main() {
          if (vAlpha <= 0.004) discard;
          float d = length(gl_PointCoord - vec2(0.5));
          float falloff = mix(smoothstep(0.5, 0.14, d), smoothstep(0.5, 0.02, d), vIsWisp);
          if (falloff <= 0.005) discard;
          vec3 grainColor = vec3(0.94, 0.84, 0.67);
          vec3 wispColor = vec3(0.89, 0.77, 0.60);
          vec3 col = mix(grainColor, wispColor, vIsWisp);
          gl_FragColor = vec4(col, falloff * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    return { geometry, material };
  }

  configure(
    biome: BiomeType,
    quality: QualityPreset,
    isCompactDevice: boolean,
    pixelRatio = 1,
    isWaitingArena = false,
  ): void {
    this.activeBiome = biome;
    this.isWaitingArena = isWaitingArena;
    this.qualityPreset = quality;
    this.isCompactDevice = isCompactDevice;
    this.pixelRatio = clamp(pixelRatio, 1, 2);

    const p = BIOME_PALETTES[isWaitingArena ? 'forest' : biome];
    this.skyMat.uniforms.uIsNightLobby.value = isWaitingArena ? 1.0 : 0.0;
    this.skyMat.uniforms.uZenithColor.value.set(isWaitingArena ? '#060314' : p.zenith);
    this.skyMat.uniforms.uMidSkyColor.value.set(isWaitingArena ? '#120a2c' : p.midSky);
    this.skyMat.uniforms.uHorizonColor.value.set(isWaitingArena ? '#241240' : p.horizon);
    this.skyMat.uniforms.uGroundColor.value.set(isWaitingArena ? '#140a24' : p.groundBounce);
    this.skyMat.uniforms.uSunColor.value.set(p.sunColor);
    this.skyMat.uniforms.uCloudLit.value.set(p.cloudLit);
    this.skyMat.uniforms.uCloudShade.value.set(p.cloudShade);
    this.skyMat.uniforms.uCloudCoverage.value = isWaitingArena ? 0.0 : p.cloudCoverage;
    this.skyMat.uniforms.uCloudDetail.value = quality === 'low' ? 0.0 : 1.0;

    this.cloudMat.color.set(p.cloudLit);
    this.cloudMat.opacity = p.cloudOpacity;
    this.cloudMesh.visible = !isWaitingArena;

    const cloudCount =
      quality === 'low'
        ? isCompactDevice
          ? 8
          : 12
        : quality === 'medium'
          ? isCompactDevice
            ? 14
            : 18
          : isCompactDevice
            ? 18
            : CLOUD_MAX_CLUSTERS;
    this.cloudMesh.count = isWaitingArena ? 0 : cloudCount;
    this.cloudSyncAccum = 1; // force immediate matrix refresh on next update

    // Configure Snow particle draw budget (disabled in Waiting Arena)
    const snowCount =
      quality === 'low'
        ? isCompactDevice
          ? 120
          : 180
        : quality === 'medium'
          ? isCompactDevice
            ? 240
            : 360
          : isCompactDevice
            ? 340
            : SNOW_MAX_PARTICLES;
    this.snowPoints.geometry.setDrawRange(0, snowCount);
    this.snowMat.uniforms.uPixelRatio.value = this.pixelRatio;
    this.snowPoints.visible = !isWaitingArena && biome === 'snow';

    // Configure Desert dust particle draw budget (disabled in Waiting Arena)
    const dustCount =
      quality === 'low'
        ? isCompactDevice
          ? 70
          : 100
        : quality === 'medium'
          ? isCompactDevice
            ? 130
            : 200
          : isCompactDevice
            ? 180
            : DUST_MAX_PARTICLES;
    this.dustPoints.geometry.setDrawRange(0, dustCount);
    this.dustMat.uniforms.uPixelRatio.value = this.pixelRatio;

    if (isWaitingArena || biome !== 'desert') {
      this.gustState = 'calm';
      this.gustIntensity = 0;
      this.dustPoints.visible = false;
    } else if (this.gustState === 'calm' && this.gustTimerSec > 12) {
      this.gustTimerSec = 9.0;
    }
  }

  resetWeatherCycle(): void {
    this.gustState = 'calm';
    this.gustTimerSec = 7.5 + Math.random() * 4.5;
    this.gustDurationSec = 9.5;
    this.gustIntensity = 0;
    this.gustDrift = 0;
    this.dustPoints.visible = false;
  }

  syncCamera(camera: THREE.Camera): void {
    this.cameraPos.copy(camera.position);
    this.skyMesh.position.set(this.cameraPos.x, 0, this.cameraPos.z);
    this.snowMat.uniforms.uCameraPos.value.copy(this.cameraPos);
    this.dustMat.uniforms.uCameraPos.value.copy(this.cameraPos);
  }

  getFogDensityMultiplier(): number {
    return 1.0 + this.gustIntensity * 0.12;
  }

  update(deltaSeconds: number, elapsedSeconds: number): void {
    const dt = Math.min(deltaSeconds, 0.1);
    this.skyMat.uniforms.uTime.value = elapsedSeconds;
    this.snowMat.uniforms.uTime.value = elapsedSeconds;
    this.dustMat.uniforms.uTime.value = elapsedSeconds;

    // Gentle cloud drift across upper sky, synced at 5-10 Hz to avoid per-frame GPU buffer uploads
    this.cloudSyncAccum += dt;
    const syncInterval = this.qualityPreset === 'low' ? 0.2 : 0.1;
    if (this.cloudSyncAccum >= syncInterval) {
      const cloudDt = Math.min(this.cloudSyncAccum, 0.5);
      this.cloudSyncAccum = 0;
      const cloudCount = this.cloudMesh.count;
      const minX = this.cameraPos.x - CLOUD_WRAP_HALF_SPAN;
      const maxX = this.cameraPos.x + CLOUD_WRAP_HALF_SPAN;
      const minZ = this.cameraPos.z - CLOUD_WRAP_HALF_SPAN;
      const maxZ = this.cameraPos.z + CLOUD_WRAP_HALF_SPAN;
      const span = CLOUD_WRAP_HALF_SPAN * 2;
      for (let i = 0; i < cloudCount; i++) {
        const c = this.clouds[i];
        c.x += 2.6 * c.speedMul * cloudDt;
        c.z += 0.75 * c.speedMul * cloudDt;
        if (c.x > maxX) c.x -= span * Math.ceil((c.x - maxX) / span);
        else if (c.x < minX) c.x += span * Math.ceil((minX - c.x) / span);
        if (c.z > maxZ) c.z -= span * Math.ceil((c.z - maxZ) / span);
        else if (c.z < minZ) c.z += span * Math.ceil((minZ - c.z) / span);
      }
      this.syncCloudMatrices();
    }

    if (!this.isWaitingArena && this.activeBiome === 'desert') {
      this.updateDesertGusts(dt);
    }
  }

  private updateDesertGusts(dt: number): void {
    if (this.gustState === 'calm') {
      this.gustTimerSec -= dt;
      this.gustIntensity = damp(this.gustIntensity, 0, 3.0, dt);
      if (this.gustIntensity <= 0.005) {
        this.gustIntensity = 0;
        this.dustPoints.visible = false;
      }
      if (this.gustTimerSec <= 0) {
        // Start a gentle desert dust gust
        this.gustState = 'gust';
        this.gustDurationSec = 8.0 + Math.random() * 3.5;
        this.gustTimerSec = 0;
        this.gustPeak = 0.62 + Math.random() * 0.24;
        this.gustSpeedMps = 7.2 + Math.random() * 3.2;
        const angle = Math.random() * Math.PI * 2;
        this.gustWindDir.set(Math.cos(angle), Math.sin(angle));
        this.dustMat.uniforms.uWindDir.value.copy(this.gustWindDir);
        this.dustPoints.visible = true;
      }
      this.dustMat.uniforms.uGustAlpha.value = this.gustIntensity;
      return;
    }

    this.gustTimerSec += dt;
    this.gustDrift += this.gustSpeedMps * dt;
    this.dustMat.uniforms.uGustDrift.value = this.gustDrift;

    const fadeIn = clamp(this.gustTimerSec / 2.2, 0, 1);
    const fadeOut = clamp((this.gustDurationSec - this.gustTimerSec) / 2.8, 0, 1);
    const smoothIn = fadeIn * fadeIn * (3 - 2 * fadeIn);
    const smoothOut = fadeOut * fadeOut * (3 - 2 * fadeOut);
    this.gustIntensity = Math.min(smoothIn, smoothOut) * this.gustPeak;

    this.dustMat.uniforms.uGustAlpha.value = this.gustIntensity;
    this.dustPoints.visible = this.gustIntensity > 0.005;

    if (this.gustTimerSec >= this.gustDurationSec) {
      this.gustState = 'calm';
      this.gustTimerSec = 15.0 + Math.random() * 10.0;
      this.gustIntensity = 0;
      this.dustMat.uniforms.uGustAlpha.value = 0;
      this.dustPoints.visible = false;
    }
  }

  getDebugInfo(): { biome: BiomeType; quality: QualityPreset; compact: boolean; gustActive: boolean } {
    return {
      biome: this.activeBiome,
      quality: this.qualityPreset,
      compact: this.isCompactDevice,
      gustActive: this.gustState === 'gust',
    };
  }

  dispose(): void {
    for (const g of this.ownedGeometries) g.dispose();
    for (const m of this.ownedMaterials) m.dispose();
    for (const t of this.ownedTextures) t.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.ownedTextures.length = 0;
  }
}
