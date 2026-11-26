/**
 * Original Lobby Soundtrack Composer & DSP Renderer: "NEXUS PROTOCOL"
 * Tempo: 124 BPM | Key: D Minor | Length: 32 Bars (~61.94s seamless loop)
 *
 * Synthesizes multi-layered electronic gaming instruments from scratch in
 * 44.1 kHz 32-bit stereo float, applies ping-pong delay, algorithmic hall
 * reverb, seamless loop-tail folding, and mastering soft-limiting.
 */

import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 44100;
const BPM = 124;
const BEAT_SEC = 60 / BPM;
const SIXTEENTH_SEC = BEAT_SEC / 4;
const BAR_SEC = BEAT_SEC * 4;
const LOOP_BARS = 32;
const TAIL_BARS = 2;
const LOOP_SAMPLES = Math.round(LOOP_BARS * BAR_SEC * SAMPLE_RATE);
const RENDER_SAMPLES = Math.round((LOOP_BARS + TAIL_BARS) * BAR_SEC * SAMPLE_RATE);

// Ensure exact loop length aligns with 44.1kHz sample grid
const EXACT_LOOP_SEC = LOOP_SAMPLES / SAMPLE_RATE;

// Deterministic PRNG for consistent crisp percussion & textures
let rngState = 0x9e3779b9;
function rand(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 0xffffffff;
}
function randSigned(): number {
  return rand() * 2 - 1;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// PolyBLEP anti-aliasing correction for saw/pulse waveforms
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function sawOsc(phase: number, dt: number): number {
  let y = 2 * phase - 1;
  y -= polyBlep(phase, dt);
  return y;
}

function pulseOsc(phase: number, dt: number, width = 0.5): number {
  let y = phase < width ? 1 : -1;
  y += polyBlep(phase, dt);
  y -= polyBlep((phase + 1 - width) % 1, dt);
  return y;
}

function triOsc(phase: number): number {
  return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
}

// 2-pole Chamberlin State-Variable Filter
class SVF {
  private low = 0;
  private band = 0;
  process(input: number, cutoffHz: number, resonance: number): { low: number; band: number; high: number } {
    const clampedCutoff = Math.max(25, Math.min(SAMPLE_RATE * 0.42, cutoffHz));
    const f = 2 * Math.sin((Math.PI * clampedCutoff) / SAMPLE_RATE);
    const q = Math.max(0.12, Math.min(1.8, 1 / Math.max(0.55, resonance)));
    const high = input - this.low - q * this.band;
    this.band += f * high;
    this.low += f * this.band;
    return { low: this.low, band: this.band, high };
  }
}

function addStereo(
  bufL: Float32Array,
  bufR: Float32Array,
  idx: number,
  sampleL: number,
  sampleR: number,
): void {
  if (idx < 0 || idx >= bufL.length) return;
  bufL[idx] += sampleL;
  bufR[idx] += sampleR;
}

function panGains(pan: number): [number, number] {
  const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

// ---------- Buffers ----------
const dryL = new Float32Array(RENDER_SAMPLES);
const dryR = new Float32Array(RENDER_SAMPLES);
const delaySendL = new Float32Array(RENDER_SAMPLES);
const delaySendR = new Float32Array(RENDER_SAMPLES);
const reverbSendL = new Float32Array(RENDER_SAMPLES);
const reverbSendR = new Float32Array(RENDER_SAMPLES);
// Non-sidechained drum bus (keeps kick & snare punchy)
const drumL = new Float32Array(RENDER_SAMPLES);
const drumR = new Float32Array(RENDER_SAMPLES);

// Track kick trigger times for clean sidechain ducking on bass/chords/pad
const kickTimesSec: number[] = [];

// ---------- Drum Synthesizers ----------
function triggerKick(startSec: number, gain = 0.92): void {
  kickTimesSec.push(startSec);
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round(0.36 * SAMPLE_RATE);
  let phase = 0;
  let clickPhase = 0;
  const clickFilter = new SVF();

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    // Fast exponential pitch drop from 148 Hz -> 44 Hz
    const freq = 44 + 104 * Math.exp(-t / 0.032) + 220 * Math.exp(-t / 0.004);
    phase = (phase + freq / SAMPLE_RATE) % 1;
    const bodyEnv = Math.exp(-t / 0.115) * (1 - Math.exp(-t / 0.0012));
    const sub = Math.sin(2 * Math.PI * phase) * bodyEnv;

    // Punchy beater click
    clickPhase = (clickPhase + (1950 * Math.exp(-t / 0.007) + 180) / SAMPLE_RATE) % 1;
    const clickEnv = Math.exp(-t / 0.009);
    const clickNoise = clickFilter.process(randSigned(), 2400, 1.1).band;
    const click = (Math.sin(2 * Math.PI * clickPhase) * 0.45 + clickNoise * 0.4) * clickEnv;

    const out = Math.tanh((sub * 1.18 + click * 0.42) * 1.15) * gain;
    addStereo(drumL, drumR, startIdx + i, out, out);
  }
}

function triggerSnare(startSec: number, gain = 0.64, tight = false): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const dur = tight ? 0.14 : 0.27;
  const len = Math.round(dur * SAMPLE_RATE);
  let bodyPhase = 0;
  const noiseHp = new SVF();
  const noiseBp = new SVF();

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const bodyFreq = 188 * Math.exp(-t / 0.028) + 112;
    bodyPhase = (bodyPhase + bodyFreq / SAMPLE_RATE) % 1;
    const bodyEnv = Math.exp(-t / (tight ? 0.045 : 0.068));
    const body = (Math.sin(2 * Math.PI * bodyPhase) + triOsc(bodyPhase) * 0.35) * bodyEnv;

    // Layered clap micro-bursts in the first 28ms
    const clapBurst =
      t < 0.032
        ? 0.65 + 0.55 * Math.pow(Math.sin(Math.PI * ((t % 0.0105) / 0.0105)), 2)
        : 1.0;
    const noiseEnv = Math.exp(-t / (tight ? 0.055 : 0.125)) * clapBurst;
    const nL = randSigned();
    const nR = randSigned();
    const crispL = noiseHp.process(nL, 1250, 0.9).high;
    const crispR = noiseBp.process(nR, 2600, 1.0).band * 1.2 + crispL * 0.5;

    const sampleL = (body * 0.52 + crispL * noiseEnv * 0.58) * gain;
    const sampleR = (body * 0.52 + crispR * noiseEnv * 0.58) * gain;
    addStereo(drumL, drumR, startIdx + i, sampleL, sampleR);
    addStereo(reverbSendL, reverbSendR, startIdx + i, sampleL * 0.24, sampleR * 0.24);
  }
}

function triggerHat(startSec: number, open: boolean, gain = 0.28, pan = 0.15): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const dur = open ? 0.24 : 0.055;
  const len = Math.round(dur * SAMPLE_RATE);
  const hpL = new SVF();
  const hpR = new SVF();
  const [pL, pR] = panGains(pan);
  const ratios = [295, 412, 543, 687, 811, 1024];
  const phases = new Float64Array(ratios.length);

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t / (open ? 0.09 : 0.016)) * (1 - Math.exp(-t / 0.0008));
    let metal = 0;
    for (let k = 0; k < ratios.length; k++) {
      phases[k] = (phases[k] + ratios[k] / SAMPLE_RATE) % 1;
      metal += phases[k] < 0.5 ? 1 : -1;
    }
    metal /= ratios.length;
    const rawL = metal * 0.45 + randSigned() * 0.85;
    const rawR = metal * 0.45 + randSigned() * 0.85;
    const fL = hpL.process(rawL, open ? 6200 : 7400, 1.1).high * env * gain;
    const fR = hpR.process(rawR, open ? 6200 : 7400, 1.1).high * env * gain;
    addStereo(drumL, drumR, startIdx + i, fL * pL, fR * pR);
    if (open) {
      addStereo(reverbSendL, reverbSendR, startIdx + i, fL * pL * 0.18, fR * pR * 0.18);
    }
  }
}

function triggerImpactAndCrash(startSec: number, gain = 0.42): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round(2.4 * SAMPLE_RATE);
  const svfL = new SVF();
  const svfR = new SVF();
  let subPhase = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    // Sub boom drop
    const subFreq = 32 + 54 * Math.exp(-t / 0.28);
    subPhase = (subPhase + subFreq / SAMPLE_RATE) % 1;
    const subEnv = Math.exp(-t / 0.55) * (1 - Math.exp(-t / 0.005));
    const sub = Math.sin(2 * Math.PI * subPhase) * subEnv * 0.55;

    // Wide stereo shimmer crash
    const crashEnv = Math.exp(-t / 0.72) * (1 - Math.exp(-t / 0.004));
    const cutoff = 5200 * Math.exp(-t / 1.1) + 1200;
    const cL = svfL.process(randSigned(), cutoff, 0.85).high * crashEnv * 0.42;
    const cR = svfR.process(randSigned(), cutoff, 0.85).high * crashEnv * 0.42;

    addStereo(drumL, drumR, startIdx + i, (sub + cL) * gain, (sub + cR) * gain);
    addStereo(reverbSendL, reverbSendR, startIdx + i, cL * gain * 0.45, cR * gain * 0.45);
  }
}

function triggerRiser(startSec: number, durationSec: number, gain = 0.36): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round(durationSec * SAMPLE_RATE);
  const svfL = new SVF();
  const svfR = new SVF();
  let pitchPhase = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const p = t / durationSec;
    const env = Math.pow(p, 1.8) * (1 - Math.exp(-(durationSec - t) / 0.015));
    const cutoff = 260 * Math.pow(20, p);
    const nL = svfL.process(randSigned(), cutoff, 1.55).band * 1.4;
    const nR = svfR.process(randSigned(), cutoff * 1.04, 1.55).band * 1.4;

    const synthFreq = midiToFreq(45 + p * 24);
    const dt = synthFreq / SAMPLE_RATE;
    pitchPhase = (pitchPhase + dt) % 1;
    const pitchTone = sawOsc(pitchPhase, dt) * 0.25 * Math.pow(p, 2.2);

    const outL = (nL + pitchTone) * env * gain;
    const outR = (nR + pitchTone) * env * gain;
    addStereo(dryL, dryR, startIdx + i, outL, outR);
    addStereo(reverbSendL, reverbSendR, startIdx + i, outL * 0.45, outR * 0.45);
  }
}

// ---------- Melodic & Harmonic Synthesizers ----------
function triggerBassNote(
  startSec: number,
  durSec: number,
  midi: number,
  gain = 0.42,
  gritCutoff = 850,
): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round((durSec + 0.04) * SAMPLE_RATE);
  const baseFreq = midiToFreq(midi);
  let subPhase = 0;
  let sawPhaseA = rand();
  let sawPhaseB = rand();
  const filter = new SVF();

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env =
      (1 - Math.exp(-t / 0.004)) *
      (t < durSec ? 0.55 + 0.45 * Math.exp(-t / 0.14) : Math.exp(-(t - durSec) / 0.02));

    const dtSub = baseFreq / SAMPLE_RATE;
    subPhase = (subPhase + dtSub) % 1;
    const sub = Math.sin(2 * Math.PI * subPhase);

    const dtA = (baseFreq * 2 * 0.9965) / SAMPLE_RATE;
    const dtB = (baseFreq * 2 * 1.0035) / SAMPLE_RATE;
    sawPhaseA = (sawPhaseA + dtA) % 1;
    sawPhaseB = (sawPhaseB + dtB) % 1;
    const rawMid = (sawOsc(sawPhaseA, dtA) + sawOsc(sawPhaseB, dtB)) * 0.5;
    const cutoff = 160 + gritCutoff * Math.exp(-t / 0.085);
    const mid = filter.process(rawMid, cutoff, 1.35).low;

    const sample = (sub * 0.68 + mid * 0.48) * env * gain;
    addStereo(dryL, dryR, startIdx + i, sample, sample);
  }
}

function triggerSupersawChord(
  startSec: number,
  durSec: number,
  midis: number[],
  gain = 0.24,
  cutoffPeak = 2400,
): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const releaseSec = 0.18;
  const len = Math.round((durSec + releaseSec) * SAMPLE_RATE);
  const detunes = [-0.011, -0.005, 0, 0.0055, 0.0115];
  const pans = [-0.72, -0.35, 0, 0.35, 0.72];

  const svfL = new SVF();
  const svfR = new SVF();
  const hpL = new SVF();
  const hpR = new SVF();

  const phases: number[][] = midis.map(() => detunes.map(() => rand()));

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const attack = 1 - Math.exp(-t / 0.025);
    const sustain = t < durSec ? 1 : Math.exp(-(t - durSec) / 0.065);
    const env = attack * sustain;

    let accL = 0;
    let accR = 0;
    for (let m = 0; m < midis.length; m++) {
      const f = midiToFreq(midis[m]);
      for (let d = 0; d < detunes.length; d++) {
        const dt = (f * (1 + detunes[d])) / SAMPLE_RATE;
        phases[m][d] = (phases[m][d] + dt) % 1;
        const osc = sawOsc(phases[m][d], dt);
        const [pL, pR] = panGains(pans[d]);
        accL += osc * pL;
        accR += osc * pR;
      }
    }
    const norm = 1 / (midis.length * detunes.length * 0.55);
    const cutoff = 420 + (cutoffPeak - 420) * (1 - Math.exp(-t / 0.08)) * sustain;
    let outL = svfL.process(accL * norm, cutoff, 0.95).low;
    let outR = svfR.process(accR * norm, cutoff, 0.95).low;
    outL = hpL.process(outL, 185, 0.7).high * env * gain;
    outR = hpR.process(outR, 185, 0.7).high * env * gain;

    addStereo(dryL, dryR, startIdx + i, outL, outR);
    addStereo(reverbSendL, reverbSendR, startIdx + i, outL * 0.32, outR * 0.32);
  }
}

function triggerPluckArp(
  startSec: number,
  durSec: number,
  midi: number,
  cutoffHz: number,
  pan: number,
  gain = 0.22,
): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round((durSec + 0.14) * SAMPLE_RATE);
  const freq = midiToFreq(midi);
  let p1 = 0;
  let p2 = 0.25;
  const svf = new SVF();
  const [gL, gR] = panGains(pan);

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = (1 - Math.exp(-t / 0.0025)) * Math.exp(-t / 0.125);
    const dt1 = freq / SAMPLE_RATE;
    const dt2 = (freq * 1.004) / SAMPLE_RATE;
    p1 = (p1 + dt1) % 1;
    p2 = (p2 + dt2) % 1;
    const raw = sawOsc(p1, dt1) * 0.62 + pulseOsc(p2, dt2, 0.32) * 0.38;
    const dynCut = 260 + cutoffHz * Math.exp(-t / 0.095);
    const filtered = svf.process(raw, dynCut, 1.3).low * env * gain;

    addStereo(dryL, dryR, startIdx + i, filtered * gL, filtered * gR);
    addStereo(delaySendL, delaySendR, startIdx + i, filtered * gL * 0.42, filtered * gR * 0.42);
    addStereo(reverbSendL, reverbSendR, startIdx + i, filtered * gL * 0.22, filtered * gR * 0.22);
  }
}

function triggerHeroicLead(
  startSec: number,
  durSec: number,
  midi: number,
  gain = 0.26,
  glideFromMidi?: number,
): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const releaseSec = 0.22;
  const len = Math.round((durSec + releaseSec) * SAMPLE_RATE);
  const targetFreq = midiToFreq(midi);
  const startFreq = glideFromMidi !== undefined ? midiToFreq(glideFromMidi) : targetFreq;
  const svfL = new SVF();
  const svfR = new SVF();
  let p1 = 0;
  let p2 = 0.33;
  let p3 = 0.67;
  let pOct = 0.15;

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const glide = startFreq + (targetFreq - startFreq) * (1 - Math.exp(-t / 0.028));
    const vibDepth = t > 0.12 ? Math.min(1, (t - 0.12) / 0.18) * 0.0048 : 0;
    const freq = glide * (1 + vibDepth * Math.sin(2 * Math.PI * 5.6 * t));

    const dt1 = (freq * 0.9955) / SAMPLE_RATE;
    const dt2 = (freq * 1.0045) / SAMPLE_RATE;
    const dt3 = freq / SAMPLE_RATE;
    const dtOct = (freq * 2) / SAMPLE_RATE;

    p1 = (p1 + dt1) % 1;
    p2 = (p2 + dt2) % 1;
    p3 = (p3 + dt3) % 1;
    pOct = (pOct + dtOct) % 1;

    const oscL =
      sawOsc(p1, dt1) * 0.48 +
      sawOsc(p2, dt2) * 0.34 +
      pulseOsc(p3, dt3, 0.38) * 0.32 +
      sawOsc(pOct, dtOct) * 0.18;
    const oscR =
      sawOsc(p2, dt2) * 0.48 +
      sawOsc(p1, dt1) * 0.34 +
      pulseOsc(p3, dt3, 0.38) * 0.32 +
      sawOsc(pOct, dtOct) * 0.18;

    const attack = 1 - Math.exp(-t / 0.012);
    const sustain = t < durSec ? 0.82 + 0.18 * Math.exp(-t / 0.25) : Math.exp(-(t - durSec) / 0.075);
    const env = attack * sustain;
    const cut = 1800 + 2800 * Math.exp(-t / 0.16);

    const outL = svfL.process(oscL, cut, 1.1).low * env * gain;
    const outR = svfR.process(oscR, cut, 1.1).low * env * gain;

    addStereo(dryL, dryR, startIdx + i, outL, outR);
    addStereo(delaySendL, delaySendR, startIdx + i, outL * 0.35, outR * 0.35);
    addStereo(reverbSendL, reverbSendR, startIdx + i, outL * 0.36, outR * 0.36);
  }
}

function triggerCrystalBell(startSec: number, durSec: number, midi: number, pan: number, gain = 0.18): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round((durSec + 0.55) * SAMPLE_RATE);
  const freq = midiToFreq(midi);
  const [gL, gR] = panGains(pan);
  let pCar = 0;
  let pMod = 0;

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.38);
    const modIndex = 2.1 * Math.exp(-t / 0.14);
    pMod = (pMod + (freq * 3.0) / SAMPLE_RATE) % 1;
    pCar = (pCar + freq / SAMPLE_RATE) % 1;
    const fm = Math.sin(2 * Math.PI * pCar + modIndex * Math.sin(2 * Math.PI * pMod));
    const shimmer = Math.sin(2 * Math.PI * ((pCar * 2) % 1)) * 0.22;
    const sample = (fm * 0.8 + shimmer) * env * gain;

    addStereo(dryL, dryR, startIdx + i, sample * gL, sample * gR);
    addStereo(delaySendL, delaySendR, startIdx + i, sample * gL * 0.55, sample * gR * 0.55);
    addStereo(reverbSendL, reverbSendR, startIdx + i, sample * gL * 0.45, sample * gR * 0.45);
  }
}

function triggerPad(startSec: number, durSec: number, midis: number[], gain = 0.13): void {
  const startIdx = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round((durSec + 0.45) * SAMPLE_RATE);
  const svfL = new SVF();
  const svfR = new SVF();
  const hpL = new SVF();
  const hpR = new SVF();
  const dets = [-0.008, 0, 0.0085];
  const phases = midis.map(() => dets.map(() => rand()));

  for (let i = 0; i < len; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.35);
    const rel = t < durSec ? 1 : Math.exp(-(t - durSec) / 0.22);
    const env = attack * rel;
    let sL = 0;
    let sR = 0;
    for (let m = 0; m < midis.length; m++) {
      const f = midiToFreq(midis[m]);
      for (let d = 0; d < dets.length; d++) {
        const dt = (f * (1 + dets[d])) / SAMPLE_RATE;
        phases[m][d] = (phases[m][d] + dt) % 1;
        const v = sawOsc(phases[m][d], dt);
        sL += v * (d === 0 ? 0.9 : d === 1 ? 0.7 : 0.4);
        sR += v * (d === 2 ? 0.9 : d === 1 ? 0.7 : 0.4);
      }
    }
    const norm = 1 / (midis.length * 2.2);
    const cut = 850 + 480 * Math.sin(2 * Math.PI * 0.18 * t);
    const outL = hpL.process(svfL.process(sL * norm, cut, 0.75).low, 210, 0.7).high * env * gain;
    const outR = hpR.process(svfR.process(sR * norm, cut, 0.75).low, 210, 0.7).high * env * gain;
    addStereo(dryL, dryR, startIdx + i, outL, outR);
    addStereo(reverbSendL, reverbSendR, startIdx + i, outL * 0.48, outR * 0.48);
  }
}

// ---------- Musical Arrangement ("NEXUS PROTOCOL" - 32 Bars @ 124 BPM, D Minor) ----------
interface BarHarmony {
  bassMidi: number;
  chordMidis: number[];
  arpMidis: number[];
}

// D Minor harmonic palette
const CHORD_DM9: BarHarmony = {
  bassMidi: 38, // D2
  chordMidis: [50, 57, 60, 64, 69], // D3 A3 C4 E4 A4
  arpMidis: [62, 69, 72, 76, 74, 69, 64, 69],
};
const CHORD_BBMAJ7: BarHarmony = {
  bassMidi: 34, // Bb1
  chordMidis: [46, 53, 57, 62, 65], // Bb2 F3 A3 D4 F4
  arpMidis: [58, 65, 69, 74, 70, 65, 62, 65],
};
const CHORD_GM9: BarHarmony = {
  bassMidi: 43, // G2
  chordMidis: [55, 58, 62, 69], // G3 Bb3 D4 A4
  arpMidis: [67, 70, 74, 81, 79, 74, 70, 74],
};
const CHORD_C6: BarHarmony = {
  bassMidi: 36, // C2
  chordMidis: [48, 55, 60, 64, 69], // C3 G3 C4 E4 A4
  arpMidis: [60, 67, 72, 76, 79, 76, 72, 67],
};
const CHORD_F: BarHarmony = {
  bassMidi: 41, // F2
  chordMidis: [53, 57, 60, 65, 69], // F3 A3 C4 F4 A4
  arpMidis: [65, 69, 72, 77, 81, 77, 72, 69],
};
const CHORD_AM: BarHarmony = {
  bassMidi: 45, // A2
  chordMidis: [52, 57, 60, 64, 69], // E3 A3 C4 E4 A4
  arpMidis: [64, 69, 72, 76, 81, 76, 72, 69],
};
const CHORD_A7: BarHarmony = {
  bassMidi: 33, // A1
  chordMidis: [45, 52, 57, 61, 67], // A2 E3 A3 C#4 G4
  arpMidis: [61, 64, 69, 73, 76, 73, 69, 64],
};

// 32-bar progression
const PROGRESSION: BarHarmony[] = [
  // Section A1 (Bars 1-4): Atmospheric Tactical Intro
  CHORD_DM9, CHORD_BBMAJ7, CHORD_GM9, CHORD_A7,
  // Section A2 (Bars 5-8): Driving Groove Entry
  CHORD_DM9, CHORD_BBMAJ7, CHORD_GM9, CHORD_A7,
  // Section B (Bars 9-16): Main Anthem Drop 1
  CHORD_DM9, CHORD_BBMAJ7, CHORD_C6, CHORD_AM,
  CHORD_DM9, CHORD_BBMAJ7, CHORD_GM9, CHORD_A7,
  // Section C (Bars 17-24): Breakdown & Build
  CHORD_BBMAJ7, CHORD_C6, CHORD_DM9, CHORD_F,
  CHORD_BBMAJ7, CHORD_GM9, CHORD_A7, CHORD_A7,
  // Section D (Bars 25-32): Climax Anthem Drop 2
  CHORD_DM9, CHORD_F, CHORD_C6, CHORD_BBMAJ7,
  CHORD_DM9, CHORD_C6, CHORD_BBMAJ7, CHORD_A7,
];

// Schedule Pads (one per bar)
for (let bar = 0; bar < LOOP_BARS; bar++) {
  const h = PROGRESSION[bar];
  const barStart = bar * BAR_SEC;
  const padGain = bar >= 16 && bar < 24 ? 0.14 : 0.095;
  triggerPad(barStart, BAR_SEC * 0.96, h.chordMidis.slice(0, 4), padGain);
}

// Schedule Drums & Percussion across all 32 bars
for (let bar = 0; bar < LOOP_BARS; bar++) {
  const barStart = bar * BAR_SEC;
  const isIntro = bar < 4;
  const isBreakdown = bar >= 16 && bar < 20;
  const isBuild = bar >= 20 && bar < 24;
  const isDrop = (bar >= 8 && bar < 16) || bar >= 24;

  // Impacts on major section transitions
  if (bar === 4 || bar === 8 || bar === 24) {
    triggerImpactAndCrash(barStart, bar === 8 || bar === 24 ? 0.46 : 0.32);
  }
  if (bar === 16) {
    triggerImpactAndCrash(barStart, 0.26);
  }

  // Risers leading into Drop 1 (Bar 7-8) and Drop 2 (Bar 21-24)
  if (bar === 6) {
    triggerRiser(barStart, BAR_SEC * 2, 0.28);
  }
  if (bar === 20) {
    triggerRiser(barStart, BAR_SEC * 4, 0.4);
  }

  for (let step = 0; step < 16; step++) {
    const t = barStart + step * SIXTEENTH_SEC;

    // Kick Pattern
    if (!isIntro && !isBreakdown && !isBuild) {
      if (step % 4 === 0) {
        triggerKick(t, isDrop ? 0.94 : 0.84);
      } else if (isDrop && (bar % 2 === 1) && step === 14) {
        // Energetic syncopated kick pickup every 2nd bar in drops
        triggerKick(t, 0.72);
      }
    } else if (isBuild) {
      // Half-time pulse kick in build Bars 21-22, 4-on-floor muted in 23
      if (bar < 22 && step % 4 === 0) {
        triggerKick(t, 0.64);
      } else if (bar === 22 && step % 4 === 0) {
        triggerKick(t, 0.72);
      }
    }

    // Snare / Clap Pattern
    if (!isIntro && !isBreakdown && !isBuild) {
      if (step === 4 || step === 12) {
        triggerSnare(t, isDrop ? 0.64 : 0.52, false);
      }
      // Subtle ghost snares & fills on phrase endings
      if (bar % 4 === 3 && (step === 14 || step === 15)) {
        triggerSnare(t, step === 14 ? 0.34 : 0.44, true);
      }
      if (bar === 7 && step >= 12) {
        triggerSnare(t, 0.35 + (step - 12) * 0.1, true);
      }
    } else if (isBuild) {
      // Classic escalating build snare roll
      if (bar === 20 && step % 4 === 2) {
        triggerSnare(t, 0.32, true);
      } else if (bar === 21 && step % 2 === 0) {
        triggerSnare(t, 0.34 + (step / 16) * 0.12, true);
      } else if (bar === 22) {
        triggerSnare(t, 0.36 + (step / 16) * 0.16, true);
      } else if (bar === 23) {
        if (step < 12) {
          triggerSnare(t, 0.46 + (step / 16) * 0.18, true);
          triggerSnare(t + SIXTEENTH_SEC * 0.5, 0.34 + (step / 16) * 0.16, true);
        } else if (step === 12) {
          // Dramatic 1-beat pause before Drop 2!
          triggerSnare(t, 0.62, false);
        }
      }
    }

    // Hi-Hats
    if (isIntro) {
      if (step % 2 === 0) {
        triggerHat(t, false, 0.14 + (bar / 4) * 0.08, step % 4 === 0 ? -0.22 : 0.22);
      }
    } else if (!isBreakdown && !isBuild) {
      if (step % 4 === 2) {
        triggerHat(t, true, isDrop ? 0.28 : 0.21, 0.24);
      } else {
        const accent = step % 2 === 0 ? 0.24 : 0.14;
        triggerHat(t, false, accent, step % 4 === 0 ? -0.2 : 0.18);
      }
    }
  }
}

// Schedule Driving Bassline (16th-note tactical octave pulse)
for (let bar = 0; bar < LOOP_BARS; bar++) {
  const h = PROGRESSION[bar];
  const barStart = bar * BAR_SEC;
  const isIntro = bar < 4;
  const isBreakdown = bar >= 16 && bar < 20;
  const isBuild = bar >= 20 && bar < 24;

  if (isIntro) {
    // Sustained deep sub bass in intro
    triggerBassNote(barStart, BAR_SEC * 0.92, h.bassMidi, 0.32, 260);
    continue;
  }
  if (isBreakdown) {
    triggerBassNote(barStart, BAR_SEC * 0.94, h.bassMidi, 0.34, 340);
    continue;
  }
  if (isBuild) {
    for (let beat = 0; beat < 4; beat++) {
      triggerBassNote(barStart + beat * BEAT_SEC, BEAT_SEC * 0.78, h.bassMidi, 0.32, 420 + (bar - 20) * 140);
    }
    continue;
  }

  // Rolling modern electronic 16th-note groove bass: x . x x | x . x x ...
  const bassMask = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1];
  const octMask  = [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1];
  const cutoff = bar >= 24 ? 1050 : bar >= 8 ? 880 : 620;
  for (let step = 0; step < 16; step++) {
    if (!bassMask[step]) continue;
    const t = barStart + step * SIXTEENTH_SEC;
    const midi = h.bassMidi + (octMask[step] ? 12 : 0);
    triggerBassNote(t, SIXTEENTH_SEC * 0.86, midi, 0.38, cutoff);
  }
}

// Schedule Supersaw Chords (rhythmically stabbed in Drops & Groove)
for (let bar = 0; bar < LOOP_BARS; bar++) {
  const h = PROGRESSION[bar];
  const barStart = bar * BAR_SEC;
  if (bar < 4) continue; // Kept clean for intro build
  if (bar >= 16 && bar < 20) continue; // Pad carries breakdown

  if (bar >= 20 && bar < 24) {
    // Rising chord filter swells in build
    const open = 900 + (bar - 20) * 520;
    triggerSupersawChord(barStart, BAR_SEC * 0.9, h.chordMidis, 0.16, open);
    continue;
  }

  // Anthem stab rhythm: Beat 1 (dotted quarter), Beat 2.5 (dotted quarter), Beat 4 (quarter)
  const isDrop = (bar >= 8 && bar < 16) || bar >= 24;
  const g = isDrop ? 0.22 : 0.15;
  const cut = isDrop ? 2700 : 1750;
  triggerSupersawChord(barStart, SIXTEENTH_SEC * 5.2, h.chordMidis, g, cut);
  triggerSupersawChord(barStart + SIXTEENTH_SEC * 6, SIXTEENTH_SEC * 5.2, h.chordMidis, g * 0.92, cut);
  triggerSupersawChord(barStart + SIXTEENTH_SEC * 12, SIXTEENTH_SEC * 3.4, h.chordMidis, g * 0.96, cut);
}

// Schedule 16th-note Cyber Pluck Arpeggio (throughout, filter opens dynamically)
for (let bar = 0; bar < LOOP_BARS; bar++) {
  const h = PROGRESSION[bar];
  const barStart = bar * BAR_SEC;
  const isBreakdown = bar >= 16 && bar < 20;
  const isBuild = bar >= 20 && bar < 24;

  for (let step = 0; step < 16; step++) {
    // Slight breathing pause right before Drop 2
    if (bar === 23 && step >= 12) continue;

    const t = barStart + step * SIXTEENTH_SEC;
    const note = h.arpMidis[step % h.arpMidis.length];
    let cutoff = 1600;
    let gain = 0.16;

    if (bar < 4) {
      cutoff = 520 + (bar * 16 + step) * 18;
      gain = 0.11 + bar * 0.015;
    } else if (bar < 8) {
      cutoff = 1350;
      gain = 0.15;
    } else if (isBreakdown) {
      if (step % 2 !== 0) continue; // Half-speed dreamy arp in breakdown
      cutoff = 1200;
      gain = 0.15;
    } else if (isBuild) {
      cutoff = 1100 + (bar - 20) * 420;
      gain = 0.15;
    } else if (bar >= 24) {
      cutoff = 2400;
      gain = 0.175;
    }

    const pan = Math.sin((step / 16) * Math.PI * 2) * 0.45;
    triggerPluckArp(t, SIXTEENTH_SEC * 0.72, note, cutoff, pan, gain);
  }
}

// ---------- Memorable Melodies ----------
interface MelodyEvent {
  barOffset: number; // 0-based within phrase
  step: number;      // 0..15 (16th note)
  durSteps: number;
  midi: number;
  glide?: boolean;
}

// Hook Motif in Groove Section (Bars 5-8)
const GROOVE_MOTIF: MelodyEvent[] = [
  // Bar 0 (Bar 5)
  { barOffset: 0, step: 0, durSteps: 3, midi: 62 },  // D4
  { barOffset: 0, step: 3, durSteps: 3, midi: 69 },  // A4
  { barOffset: 0, step: 6, durSteps: 2, midi: 67 },  // G4
  { barOffset: 0, step: 8, durSteps: 4, midi: 65 },  // F4
  // Bar 1 (Bar 6)
  { barOffset: 1, step: 0, durSteps: 3, midi: 62 },  // D4
  { barOffset: 1, step: 3, durSteps: 3, midi: 65 },  // F4
  { barOffset: 1, step: 6, durSteps: 2, midi: 64 },  // E4
  { barOffset: 1, step: 8, durSteps: 4, midi: 62 },  // D4
  // Bar 2 (Bar 7)
  { barOffset: 2, step: 0, durSteps: 3, midi: 67 },  // G4
  { barOffset: 2, step: 3, durSteps: 3, midi: 70 },  // Bb4
  { barOffset: 2, step: 6, durSteps: 2, midi: 69 },  // A4
  { barOffset: 2, step: 8, durSteps: 4, midi: 67 },  // G4
  // Bar 3 (Bar 8)
  { barOffset: 3, step: 0, durSteps: 6, midi: 69 },  // A4
  { barOffset: 3, step: 6, durSteps: 4, midi: 67 },  // G4
  { barOffset: 3, step: 10, durSteps: 4, midi: 64 }, // E4
];

for (let i = 0; i < GROOVE_MOTIF.length; i++) {
  const ev = GROOVE_MOTIF[i];
  const t = (4 + ev.barOffset) * BAR_SEC + ev.step * SIXTEENTH_SEC;
  triggerCrystalBell(t, ev.durSteps * SIXTEENTH_SEC, ev.midi + 12, -0.15, 0.16);
  triggerPluckArp(t, ev.durSteps * SIXTEENTH_SEC, ev.midi, 1800, 0.12, 0.13);
}

// Main Anthemic 8-Bar Lead Melody (Used in Drop 1 Bars 9-16 and Elevated in Drop 2 Bars 25-32)
const ANTHEM_MELODY: MelodyEvent[] = [
  // Phrase 1 (Bars 0-3)
  { barOffset: 0, step: 0, durSteps: 3, midi: 74 },  // D5
  { barOffset: 0, step: 3, durSteps: 3, midi: 77 },  // F5
  { barOffset: 0, step: 6, durSteps: 2, midi: 81 },  // A5
  { barOffset: 0, step: 8, durSteps: 4, midi: 79, glide: true }, // G5
  { barOffset: 0, step: 12, durSteps: 4, midi: 77 }, // F5

  { barOffset: 1, step: 0, durSteps: 3, midi: 74 },  // D5
  { barOffset: 1, step: 3, durSteps: 3, midi: 77 },  // F5
  { barOffset: 1, step: 6, durSteps: 4, midi: 82 },  // Bb5
  { barOffset: 1, step: 10, durSteps: 6, midi: 81, glide: true }, // A5

  { barOffset: 2, step: 0, durSteps: 3, midi: 79 },  // G5
  { barOffset: 2, step: 3, durSteps: 3, midi: 76 },  // E5
  { barOffset: 2, step: 6, durSteps: 2, midi: 72 },  // C5
  { barOffset: 2, step: 8, durSteps: 4, midi: 74 },  // D5
  { barOffset: 2, step: 12, durSteps: 4, midi: 76 }, // E5

  { barOffset: 3, step: 0, durSteps: 10, midi: 76 }, // E5
  { barOffset: 3, step: 10, durSteps: 3, midi: 74 }, // D5
  { barOffset: 3, step: 13, durSteps: 3, midi: 72 }, // C5

  // Phrase 2 (Bars 4-7) - Higher Climax Answer!
  { barOffset: 4, step: 0, durSteps: 3, midi: 74 },  // D5
  { barOffset: 4, step: 3, durSteps: 3, midi: 77 },  // F5
  { barOffset: 4, step: 6, durSteps: 2, midi: 81 },  // A5
  { barOffset: 4, step: 8, durSteps: 4, midi: 86, glide: true }, // D6!
  { barOffset: 4, step: 12, durSteps: 4, midi: 84 }, // C6

  { barOffset: 5, step: 0, durSteps: 3, midi: 82 },  // Bb5
  { barOffset: 5, step: 3, durSteps: 3, midi: 81 },  // A5
  { barOffset: 5, step: 6, durSteps: 4, midi: 79 },  // G5
  { barOffset: 5, step: 10, durSteps: 6, midi: 77 }, // F5

  { barOffset: 6, step: 0, durSteps: 3, midi: 79 },  // G5
  { barOffset: 6, step: 3, durSteps: 3, midi: 77 },  // F5
  { barOffset: 6, step: 6, durSteps: 2, midi: 74 },  // D5
  { barOffset: 6, step: 8, durSteps: 4, midi: 79 },  // G5
  { barOffset: 6, step: 12, durSteps: 4, midi: 81 }, // A5

  { barOffset: 7, step: 0, durSteps: 8, midi: 81 },  // A5
  { barOffset: 7, step: 8, durSteps: 4, midi: 79 },  // G5
  { barOffset: 7, step: 12, durSteps: 4, midi: 76 }, // E5 -> resolves back to D5!
];

function scheduleLeadPhrase(startBar: number, gain: number, liftLastTwoBars: boolean): void {
  for (let i = 0; i < ANTHEM_MELODY.length; i++) {
    const ev = ANTHEM_MELODY[i];
    const t = (startBar + ev.barOffset) * BAR_SEC + ev.step * SIXTEENTH_SEC;
    const prevMidi = ev.glide && i > 0 ? ANTHEM_MELODY[i - 1].midi : undefined;
    const midi = liftLastTwoBars && ev.barOffset >= 6 && i === ANTHEM_MELODY.length - 1 ? 73 : ev.midi; // C#5 leading tone into D5!
    triggerHeroicLead(t, ev.durSteps * SIXTEENTH_SEC * 0.92, midi, gain, prevMidi);
  }
}

scheduleLeadPhrase(8, 0.23, false);
scheduleLeadPhrase(24, 0.255, true);

// Breakdown Crystal Bell Counter-Melody (Bars 17-20)
const BREAKDOWN_BELLS: MelodyEvent[] = [
  { barOffset: 0, step: 0, durSteps: 6, midi: 74 },  // D5
  { barOffset: 0, step: 6, durSteps: 6, midi: 77 },  // F5
  { barOffset: 0, step: 12, durSteps: 4, midi: 81 }, // A5
  { barOffset: 1, step: 0, durSteps: 8, midi: 79 },  // G5
  { barOffset: 1, step: 8, durSteps: 8, midi: 76 },  // E5
  { barOffset: 2, step: 0, durSteps: 6, midi: 74 },  // D5
  { barOffset: 2, step: 6, durSteps: 6, midi: 81 },  // A5
  { barOffset: 2, step: 12, durSteps: 4, midi: 84 }, // C6
  { barOffset: 3, step: 0, durSteps: 10, midi: 81 }, // A5
  { barOffset: 3, step: 10, durSteps: 6, midi: 77 }, // F5
];
for (let i = 0; i < BREAKDOWN_BELLS.length; i++) {
  const ev = BREAKDOWN_BELLS[i];
  const t = (16 + ev.barOffset) * BAR_SEC + ev.step * SIXTEENTH_SEC;
  triggerCrystalBell(t, ev.durSteps * SIXTEENTH_SEC, ev.midi, i % 2 === 0 ? -0.25 : 0.25, 0.2);
}

// ---------- Apply Smooth Sidechain Envelope to Dry Synth/Bass Bus ----------
kickTimesSec.sort((a, b) => a - b);
let kickCursor = 0;
for (let i = 0; i < RENDER_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  while (kickCursor + 1 < kickTimesSec.length && kickTimesSec[kickCursor + 1] <= t) {
    kickCursor++;
  }
  const dtKick = kickTimesSec.length > 0 && kickTimesSec[kickCursor] <= t ? t - kickTimesSec[kickCursor] : 999;
  let duck = 1.0;
  if (dtKick >= 0 && dtKick < 0.22) {
    // 5ms attack duck to 0.34, smooth 110ms recovery back to 1.0
    const dip = dtKick < 0.006 ? 1 - (dtKick / 0.006) * 0.62 : 0.38 + 0.62 * (1 - Math.exp(-(dtKick - 0.006) / 0.068));
    duck = dip;
  }
  dryL[i] *= duck;
  dryR[i] *= duck;
}

// ---------- Stereo Ping-Pong Delay ----------
const delaySamplesL = Math.round(SIXTEENTH_SEC * 3 * SAMPLE_RATE); // Dotted 8th
const delaySamplesR = Math.round(SIXTEENTH_SEC * 3 * SAMPLE_RATE);
const delBufL = new Float32Array(delaySamplesL);
const delBufR = new Float32Array(delaySamplesR);
let delIdxL = 0;
let delIdxR = 0;
const delLpL = new SVF();
const delLpR = new SVF();

const wetDelayL = new Float32Array(RENDER_SAMPLES);
const wetDelayR = new Float32Array(RENDER_SAMPLES);

for (let i = 0; i < RENDER_SAMPLES; i++) {
  const tapL = delBufL[delIdxL];
  const tapR = delBufR[delIdxR];

  const filtL = delLpL.process(tapL, 3400, 0.7).low;
  const filtR = delLpR.process(tapR, 3400, 0.7).low;

  // Cross-feedback ping-pong
  delBufL[delIdxL] = delaySendL[i] + filtR * 0.38;
  delBufR[delIdxR] = delaySendR[i] * 0.4 + filtL * 0.38;

  wetDelayL[i] = filtL;
  wetDelayR[i] = filtR;

  delIdxL = (delIdxL + 1) % delaySamplesL;
  delIdxR = (delIdxR + 1) % delaySamplesR;
}

// ---------- Algorithmic Stereo Hall Reverb (8-Comb + Allpass Network) ----------
const combDelaysL = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116];
const combDelaysR = combDelaysL.map((d) => d + 23);
const combsL = combDelaysL.map((d) => ({ buf: new Float32Array(d), idx: 0, lp: 0 }));
const combsR = combDelaysR.map((d) => ({ buf: new Float32Array(d), idx: 0, lp: 0 }));
const allpassDelays = [225, 556, 441, 341];
const apL = allpassDelays.map((d) => ({ buf: new Float32Array(d), idx: 0 }));
const apR = allpassDelays.map((d) => ({ buf: new Float32Array(d + 17), idx: 0 }));

const wetRevL = new Float32Array(RENDER_SAMPLES);
const wetRevR = new Float32Array(RENDER_SAMPLES);
const revFeedback = 0.805;
const revDamp = 0.32;

for (let i = 0; i < RENDER_SAMPLES; i++) {
  const inL = reverbSendL[i] + wetDelayL[i] * 0.25;
  const inR = reverbSendR[i] + wetDelayR[i] * 0.25;

  let outL = 0;
  let outR = 0;
  for (let c = 0; c < combsL.length; c++) {
    const cL = combsL[c];
    const yL = cL.buf[cL.idx];
    cL.lp = yL * (1 - revDamp) + cL.lp * revDamp;
    cL.buf[cL.idx] = inL + cL.lp * revFeedback;
    cL.idx = (cL.idx + 1) % cL.buf.length;
    outL += yL;

    const cR = combsR[c];
    const yR = cR.buf[cR.idx];
    cR.lp = yR * (1 - revDamp) + cR.lp * revDamp;
    cR.buf[cR.idx] = inR + cR.lp * revFeedback;
    cR.idx = (cR.idx + 1) % cR.buf.length;
    outR += yR;
  }

  outL *= 0.125;
  outR *= 0.125;

  for (let a = 0; a < apL.length; a++) {
    const aObjL = apL[a];
    const bufValL = aObjL.buf[aObjL.idx];
    const nextL = outL + bufValL * 0.5;
    aObjL.buf[aObjL.idx] = nextL;
    outL = bufValL - nextL * 0.5;
    aObjL.idx = (aObjL.idx + 1) % aObjL.buf.length;

    const aObjR = apR[a];
    const bufValR = aObjR.buf[aObjR.idx];
    const nextR = outR + bufValR * 0.5;
    aObjR.buf[aObjR.idx] = nextR;
    outR = bufValR - nextR * 0.5;
    aObjR.idx = (aObjR.idx + 1) % aObjR.buf.length;
  }

  wetRevL[i] = outL;
  wetRevR[i] = outR;
}

// ---------- Mix Bus & Wrap-Around Seamless Loop Tail Folding ----------
const mixL = new Float32Array(LOOP_SAMPLES);
const mixR = new Float32Array(LOOP_SAMPLES);

for (let i = 0; i < RENDER_SAMPLES; i++) {
  const sL = dryL[i] + drumL[i] + wetDelayL[i] * 0.58 + wetRevL[i] * 0.52;
  const sR = dryR[i] + drumR[i] + wetDelayR[i] * 0.58 + wetRevR[i] * 0.52;
  const target = i % LOOP_SAMPLES;
  mixL[target] += sL;
  mixR[target] += sR;
}

// Tiny 3ms cross-seam smoothing at sample 0 to guarantee zero sample discontinuity
const seamBlend = Math.round(0.003 * SAMPLE_RATE);
for (let i = 0; i < seamBlend; i++) {
  const w = i / seamBlend;
  const endIdx = LOOP_SAMPLES - seamBlend + i;
  const avgL = mixL[endIdx] * (1 - w) + mixL[i] * w;
  const avgR = mixR[endIdx] * (1 - w) + mixR[i] * w;
  mixL[i] = mixL[i] * 0.5 + avgL * 0.5;
  mixR[i] = mixR[i] * 0.5 + avgR * 0.5;
}

// ---------- Mastering Bus Soft-Saturation & Peak Normalization (-1.0 dBFS) ----------
let peak = 0;
let sumSq = 0;
for (let i = 0; i < LOOP_SAMPLES; i++) {
  // Subtle analog tape-style glue saturation
  mixL[i] = Math.tanh(mixL[i] * 1.18);
  mixR[i] = Math.tanh(mixR[i] * 1.18);
  const absL = Math.abs(mixL[i]);
  const absR = Math.abs(mixR[i]);
  if (absL > peak) peak = absL;
  if (absR > peak) peak = absR;
  sumSq += mixL[i] * mixL[i] + mixR[i] * mixR[i];
}

const targetPeak = 0.89125; // -1.0 dBFS headroom
const normGain = peak > 0 ? targetPeak / peak : 1;
for (let i = 0; i < LOOP_SAMPLES; i++) {
  mixL[i] *= normGain;
  mixR[i] *= normGain;
}

const rmsDb = 20 * Math.log10(Math.sqrt(sumSq / (LOOP_SAMPLES * 2)) * normGain);

// ---------- Export 16-bit Stereo PCM WAV ----------
const outWavPath = path.resolve(import.meta.dirname, '../.tmp_lobby_theme.wav');
const dataBytes = LOOP_SAMPLES * 4; // 2 channels * 2 bytes
const wavBuffer = Buffer.alloc(44 + dataBytes);

wavBuffer.write('RIFF', 0);
wavBuffer.writeUInt32LE(36 + dataBytes, 4);
wavBuffer.write('WAVE', 8);
wavBuffer.write('fmt ', 12);
wavBuffer.writeUInt32LE(16, 16); // PCM chunk size
wavBuffer.writeUInt16LE(1, 20);  // PCM format
wavBuffer.writeUInt16LE(2, 22);  // Stereo
wavBuffer.writeUInt32LE(SAMPLE_RATE, 24);
wavBuffer.writeUInt32LE(SAMPLE_RATE * 4, 28); // Byte rate
wavBuffer.writeUInt16LE(4, 32);  // Block align
wavBuffer.writeUInt16LE(16, 34); // Bits per sample
wavBuffer.write('data', 36);
wavBuffer.writeUInt32LE(dataBytes, 40);

// TPDF Dithering to 16-bit PCM
let offset = 44;
for (let i = 0; i < LOOP_SAMPLES; i++) {
  const ditherL = (rand() - rand()) / 32768;
  const ditherR = (rand() - rand()) / 32768;
  const intL = Math.max(-32768, Math.min(32767, Math.round((mixL[i] + ditherL) * 32767)));
  const intR = Math.max(-32768, Math.min(32767, Math.round((mixR[i] + ditherR) * 32767)));
  wavBuffer.writeInt16LE(intL, offset);
  wavBuffer.writeInt16LE(intR, offset + 2);
  offset += 4;
}

fs.writeFileSync(outWavPath, wavBuffer);
console.log(
  `Rendered "NEXUS PROTOCOL" (${EXACT_LOOP_SEC.toFixed(3)}s, ${LOOP_SAMPLES} samples, RMS: ${rmsDb.toFixed(2)} dBFS) -> ${outWavPath}`,
);
