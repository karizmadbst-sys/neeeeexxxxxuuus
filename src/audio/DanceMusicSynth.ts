export interface DanceTrackPreset {
  id: string;
  bpm: number;
  bassWave: OscillatorType;
  leadWave: OscillatorType;
  chordWave: OscillatorType;
  kickFreq: number;
  hatOpenMod: number;
  /** 16-step pattern of MIDI notes (0 = rest) for bass */
  bassPattern: readonly number[];
  /** 16-step pattern of MIDI notes (0 = rest) for lead melody */
  leadPattern: readonly number[];
  /** Alternate 16-step lead for bars 2/4 */
  leadPatternB: readonly number[];
  /** 16-step drum accents: 1=kick, 2=snare/clap, 4=closedHat, 8=openHat (bitmask) */
  drumPattern: readonly number[];
  /** Optional 4-bar chord roots in MIDI */
  chordRoots: readonly number[];
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const DANCE_TRACK_PRESETS: Record<string, DanceTrackPreset> = {
  'dance-floss': {
    id: 'dance-floss',
    bpm: 122,
    bassWave: 'triangle',
    leadWave: 'square',
    chordWave: 'sine',
    kickFreq: 135,
    hatOpenMod: 1,
    // C minor bouncy synth-pop groove
    bassPattern: [36, 0, 48, 0, 39, 0, 48, 0, 41, 0, 43, 0, 39, 0, 43, 46],
    leadPattern: [72, 0, 75, 72, 79, 0, 75, 0, 77, 0, 75, 72, 74, 0, 72, 70],
    leadPatternB: [72, 75, 79, 0, 84, 0, 79, 75, 77, 75, 74, 72, 75, 0, 79, 0],
    drumPattern: [5, 0, 4, 0, 7, 0, 4, 8, 5, 0, 4, 4, 7, 0, 4, 8],
    chordRoots: [48, 51, 53, 55],
  },
  'dance-take-the-l': {
    id: 'dance-take-the-l',
    bpm: 112,
    bassWave: 'sawtooth',
    leadWave: 'sawtooth',
    chordWave: 'triangle',
    kickFreq: 120,
    hatOpenMod: 0,
    // F major cheeky brassy bounce
    bassPattern: [41, 0, 0, 41, 48, 0, 45, 0, 46, 0, 0, 46, 48, 0, 45, 43],
    leadPattern: [65, 0, 69, 72, 0, 77, 0, 74, 72, 0, 69, 65, 67, 0, 69, 0],
    leadPatternB: [77, 0, 76, 74, 72, 0, 69, 72, 74, 0, 72, 69, 65, 0, 0, 72],
    drumPattern: [5, 0, 4, 1, 7, 0, 4, 0, 5, 0, 5, 0, 7, 4, 4, 8],
    chordRoots: [53, 55, 58, 57],
  },
  'dance-orange-justice': {
    id: 'dance-orange-justice',
    bpm: 128,
    bassWave: 'sawtooth',
    leadWave: 'square',
    chordWave: 'sawtooth',
    kickFreq: 145,
    hatOpenMod: 1,
    // A minor driving electro-funk
    bassPattern: [33, 33, 45, 0, 36, 0, 48, 33, 38, 0, 50, 0, 40, 0, 43, 45],
    leadPattern: [69, 0, 72, 76, 0, 79, 76, 0, 74, 72, 69, 0, 72, 0, 76, 0],
    leadPatternB: [81, 0, 79, 76, 74, 0, 72, 74, 76, 0, 72, 69, 67, 69, 72, 76],
    drumPattern: [5, 4, 9, 4, 7, 4, 9, 4, 5, 4, 9, 4, 7, 4, 9, 6],
    chordRoots: [45, 48, 50, 52],
  },
  'dance-renegade': {
    id: 'dance-renegade',
    bpm: 140,
    bassWave: 'sine',
    leadWave: 'triangle',
    chordWave: 'sine',
    kickFreq: 112,
    hatOpenMod: 0,
    // G minor crisp 808 pop/trap isolations
    bassPattern: [31, 0, 0, 31, 0, 0, 34, 0, 36, 0, 0, 38, 0, 34, 31, 0],
    leadPattern: [79, 0, 74, 0, 77, 0, 74, 70, 72, 0, 74, 0, 79, 0, 77, 0],
    leadPatternB: [82, 0, 79, 77, 74, 0, 72, 74, 70, 0, 72, 74, 79, 77, 74, 0],
    drumPattern: [5, 4, 4, 5, 7, 4, 4, 4, 5, 4, 5, 4, 7, 4, 8, 4],
    chordRoots: [43, 46, 48, 50],
  },
  'dance-griddy': {
    id: 'dance-griddy',
    bpm: 96,
    bassWave: 'sine',
    leadWave: 'triangle',
    chordWave: 'triangle',
    kickFreq: 108,
    hatOpenMod: 0,
    // D minor swagger bounce
    bassPattern: [38, 0, 0, 38, 0, 41, 0, 45, 38, 0, 0, 36, 0, 41, 43, 0],
    leadPattern: [62, 0, 69, 0, 65, 67, 69, 0, 72, 0, 69, 65, 64, 0, 62, 0],
    leadPatternB: [74, 0, 72, 69, 65, 0, 69, 72, 74, 0, 69, 67, 65, 64, 62, 0],
    drumPattern: [5, 4, 4, 1, 7, 4, 4, 4, 5, 4, 1, 4, 7, 4, 5, 8],
    chordRoots: [50, 48, 46, 45],
  },
  'dance-gangnam-style': {
    id: 'dance-gangnam-style',
    bpm: 132,
    bassWave: 'sawtooth',
    leadWave: 'sawtooth',
    chordWave: 'square',
    kickFreq: 148,
    hatOpenMod: 1,
    // B minor festival galloping club beat
    bassPattern: [35, 47, 35, 47, 38, 50, 38, 50, 40, 52, 40, 52, 42, 54, 40, 50],
    leadPattern: [71, 71, 71, 74, 71, 0, 78, 0, 76, 74, 71, 0, 74, 0, 76, 0],
    leadPatternB: [83, 0, 81, 78, 76, 74, 71, 0, 74, 76, 78, 0, 81, 0, 78, 0],
    drumPattern: [5, 0, 9, 4, 7, 0, 9, 4, 5, 0, 9, 4, 7, 4, 9, 6],
    chordRoots: [47, 50, 52, 54],
  },
  'dance-macarena': {
    id: 'dance-macarena',
    bpm: 104,
    bassWave: 'triangle',
    leadWave: 'triangle',
    chordWave: 'triangle',
    kickFreq: 126,
    hatOpenMod: 1,
    // A major / F# minor Latin dance party groove
    bassPattern: [45, 0, 0, 40, 45, 0, 40, 0, 43, 0, 0, 38, 43, 0, 40, 0],
    leadPattern: [69, 69, 69, 0, 73, 76, 73, 0, 74, 73, 71, 69, 71, 0, 69, 0],
    leadPatternB: [76, 0, 74, 73, 71, 0, 69, 71, 73, 0, 74, 73, 71, 0, 69, 0],
    drumPattern: [5, 4, 9, 1, 7, 4, 9, 4, 5, 4, 9, 1, 7, 4, 9, 6],
    chordRoots: [57, 55, 54, 52],
  },
  'dance-electro-shuffle': {
    id: 'dance-electro-shuffle',
    bpm: 126,
    bassWave: 'sawtooth',
    leadWave: 'square',
    chordWave: 'sawtooth',
    kickFreq: 142,
    hatOpenMod: 1,
    // E minor future-house shuffle
    bassPattern: [40, 0, 52, 40, 43, 0, 55, 43, 45, 0, 57, 45, 47, 0, 50, 47],
    leadPattern: [76, 0, 79, 0, 83, 0, 79, 76, 74, 0, 76, 79, 74, 0, 71, 0],
    leadPatternB: [88, 0, 86, 83, 79, 0, 76, 79, 81, 0, 79, 76, 74, 76, 79, 0],
    drumPattern: [5, 4, 9, 4, 7, 4, 9, 4, 5, 4, 9, 4, 7, 4, 9, 8],
    chordRoots: [52, 55, 57, 59],
  },
};

export function hasDanceMusicPreset(emoteId: string): boolean {
  return Object.prototype.hasOwnProperty.call(DANCE_TRACK_PRESETS, emoteId);
}

export class DanceMusicSynth {
  private trackGain: GainNode | null = null;
  private schedulerId = 0;
  private activePreset: DanceTrackPreset | null = null;
  private endTime = 0;
  private nextStepTime = 0;
  private stepDuration = 0.12;
  private currentStep = 0;
  private isPlayingState = false;
  private onEndedCallback: (() => void) | null = null;
  private readonly activeStopables = new Set<{ stop: (when?: number) => void; disconnect: () => void }>();

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly noiseBuffer: AudioBuffer | null = null,
  ) {}

  isPlaying(): boolean {
    return this.isPlayingState;
  }

  play(emoteId: string, durationSec = 10, onEnded?: () => void): boolean {
    const preset = DANCE_TRACK_PRESETS[emoteId];
    if (!preset) return false;

    this.stop();

    const now = this.ctx.currentTime;
    const clampedDur = Math.max(0.5, durationSec);
    const trackGain = this.ctx.createGain();
    trackGain.gain.setValueAtTime(0.0001, now);
    trackGain.gain.linearRampToValueAtTime(0.82, now + 0.02);
    trackGain.gain.setValueAtTime(0.82, Math.max(now + 0.03, now + clampedDur - 0.14));
    trackGain.gain.linearRampToValueAtTime(0.0001, now + clampedDur);
    trackGain.connect(this.destination);

    this.trackGain = trackGain;
    this.activePreset = preset;
    this.endTime = now + clampedDur;
    this.stepDuration = 60 / preset.bpm / 4; // 16th-note grid
    this.nextStepTime = now + 0.005;
    this.currentStep = 0;
    this.isPlayingState = true;
    this.onEndedCallback = onEnded ?? null;

    this.scheduleAhead();
    this.schedulerId = window.setInterval(() => {
      this.scheduleAhead();
    }, 25);

    return true;
  }

  dispose(): void {
    this.stop();
  }

  stop(): void {
    if (this.schedulerId) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = 0;
    }
    this.isPlayingState = false;
    this.activePreset = null;
    this.onEndedCallback = null;

    const now = this.ctx.currentTime;
    if (this.trackGain) {
      const oldGain = this.trackGain;
      this.trackGain = null;
      try {
        oldGain.gain.cancelScheduledValues(now);
        oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), now);
        oldGain.gain.linearRampToValueAtTime(0.0001, now + 0.025);
      } catch {
        // Ignore
      }
      window.setTimeout(() => {
        try {
          oldGain.disconnect();
        } catch {
          // Ignore
        }
      }, 45);
    }

    for (const node of Array.from(this.activeStopables)) {
      try {
        node.stop(now + 0.025);
      } catch {
        try {
          node.disconnect();
        } catch {
          // Ignore
        }
      }
    }
    this.activeStopables.clear();
  }

  private scheduleAhead(): void {
    if (!this.isPlayingState || !this.activePreset || !this.trackGain) return;
    const now = this.ctx.currentTime;

    if (now >= this.endTime) {
      const cb = this.onEndedCallback;
      this.stop();
      cb?.();
      return;
    }

    const lookaheadUntil = Math.min(now + 0.14, this.endTime - 0.02);
    while (this.nextStepTime < lookaheadUntil) {
      this.scheduleStep(this.activePreset, this.currentStep, this.nextStepTime);
      this.nextStepTime += this.stepDuration;
      this.currentStep += 1;
    }
  }

  private registerStoppable(
    node: AudioScheduledSourceNode,
    cleanupDelayGain?: GainNode,
  ): void {
    this.activeStopables.add(node);
    node.onended = () => {
      this.activeStopables.delete(node);
      try {
        node.disconnect();
        cleanupDelayGain?.disconnect();
      } catch {
        // Ignore
      }
    };
  }

  private scheduleStep(preset: DanceTrackPreset, stepIndex: number, when: number): void {
    if (!this.trackGain) return;
    const step16 = stepIndex % 16;
    const barIndex = Math.floor(stepIndex / 16);
    const remainingSec = this.endTime - when;
    if (remainingSec <= 0.02) return;

    const drumMask = preset.drumPattern[step16] ?? 0;
    if (drumMask & 1) this.triggerKick(preset.kickFreq, when);
    if (drumMask & 2) this.triggerSnareClap(when);
    if (drumMask & 4) this.triggerHat(false, when);
    if (drumMask & 8) this.triggerHat(true, when);

    const bassMidi = preset.bassPattern[step16] ?? 0;
    if (bassMidi > 0) {
      const dur = Math.min(this.stepDuration * 1.4, remainingSec);
      this.triggerBass(midiToHz(bassMidi), preset.bassWave, dur, when);
    }

    // Chord stab on beat 1 and beat 3 (steps 0 and 8)
    if (step16 === 0 || step16 === 8) {
      const root = preset.chordRoots[barIndex % preset.chordRoots.length] ?? 48;
      const chordDur = Math.min(this.stepDuration * 3.2, remainingSec);
      this.triggerChord(root, preset.chordWave, chordDur, when);
    }

    const leadArr = barIndex % 2 === 1 ? preset.leadPatternB : preset.leadPattern;
    const leadMidi = leadArr[step16] ?? 0;
    if (leadMidi > 0) {
      const dur = Math.min(this.stepDuration * 1.25, remainingSec);
      this.triggerLead(midiToHz(leadMidi), preset.leadWave, dur, when);
    }
  }

  private triggerKick(startHz: number, when: number): void {
    if (!this.trackGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.09);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.42, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);

    osc.connect(gain);
    gain.connect(this.trackGain);
    this.registerStoppable(osc, gain);
    osc.start(when);
    osc.stop(when + 0.18);
  }

  private triggerSnareClap(when: number): void {
    if (!this.trackGain) return;
    // Snappy tone body
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(210, when);
    osc.frequency.exponentialRampToValueAtTime(110, when + 0.06);
    oscGain.gain.setValueAtTime(0.16, when);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    osc.connect(oscGain);
    oscGain.connect(this.trackGain);
    this.registerStoppable(osc, oscGain);
    osc.start(when);
    osc.stop(when + 0.09);

    // Filtered noise clap
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1850, when);
      filter.Q.setValueAtTime(0.9, when);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.24, when);
      nGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
      src.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.trackGain);
      this.registerStoppable(src, nGain);
      src.start(when);
      src.stop(when + 0.14);
    }
  }

  private triggerHat(open: boolean, when: number): void {
    if (!this.trackGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(open ? 6200 : 8200, when);
    const gain = this.ctx.createGain();
    const decay = open ? 0.11 : 0.036;
    gain.gain.setValueAtTime(open ? 0.1 : 0.065, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.trackGain);
    this.registerStoppable(src, gain);
    src.start(when);
    src.stop(when + decay + 0.015);
  }

  private triggerBass(hz: number, wave: OscillatorType, dur: number, when: number): void {
    if (!this.trackGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(hz, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, when);
    filter.frequency.exponentialRampToValueAtTime(190, when + dur);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.22, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.trackGain);
    this.registerStoppable(osc, gain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  private triggerChord(rootMidi: number, wave: OscillatorType, dur: number, when: number): void {
    if (!this.trackGain) return;
    const intervals = [0, 3, 7];
    for (let i = 0; i < intervals.length; i++) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(midiToHz(rootMidi + intervals[i]), when);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1450, when);

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.linearRampToValueAtTime(0.055, when + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.trackGain);
      this.registerStoppable(osc, gain);
      osc.start(when);
      osc.stop(when + dur + 0.02);
    }
  }

  private triggerLead(hz: number, wave: OscillatorType, dur: number, when: number): void {
    if (!this.trackGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = wave;
    osc.frequency.setValueAtTime(hz, when);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, when);
    filter.frequency.exponentialRampToValueAtTime(980, when + dur);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(0.145, when + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.trackGain);
    this.registerStoppable(osc, gain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }
}
