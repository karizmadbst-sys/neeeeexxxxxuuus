import type { AudioSettings, Subsystem } from '../core/Types';
import type { EmoteStyle } from '../emotes/EmoteCatalog';
import type { WeaponSoundSpec } from '../weapons/IWeaponSystem';
import { DanceMusicSynth } from './DanceMusicSynth';

export class AudioManager implements Subsystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private loopNoiseBuffer: AudioBuffer | null = null;
  private airborneWindSource: AudioBufferSourceNode | null = null;
  private airborneWindFilter: BiquadFilterNode | null = null;
  private airborneWindGain: GainNode | null = null;
  private airplaneDroneOsc: OscillatorNode | null = null;
  private airplaneDroneGain: GainNode | null = null;
  private ziplineNoiseSource: AudioBufferSourceNode | null = null;
  private ziplineFilter: BiquadFilterNode | null = null;
  private ziplineGain: GainNode | null = null;
  private lastDistantShotMs = 0;
  private settings: AudioSettings;

  // Lobby-only background music state
  private musicGain: GainNode | null = null;
  private lobbyMusicBuffer: AudioBuffer | null = null;
  private lobbyMusicLoadPromise: Promise<AudioBuffer | null> | null = null;
  private activeMusicSource: AudioBufferSourceNode | null = null;
  private activeMusicFadeGain: GainNode | null = null;
  private lobbyMusicDesired = false;
  private gestureListenersBound = false;
  private isDisposed = false;

  // 10-second procedural dance music synth (routed independently of lobby BGM)
  private danceGain: GainNode | null = null;
  private danceSynth: DanceMusicSynth | null = null;
  private danceActive = false;
  private danceGeneration = 0;
  private danceSafetyTimer = 0;

  private readonly onGestureUnlockBound = () => {
    this.unlock();
  };

  constructor(initialSettings: AudioSettings) {
    this.settings = { ...initialSettings };
  }

  private getTargetMusicGain(): number {
    if (this.settings.musicMuted || this.settings.muted) return 0;
    const v = Math.max(0, Math.min(1, this.settings.musicVolume ?? 0.65));
    return v * 0.85;
  }

  applySettings(settings: AudioSettings): void {
    this.settings = { ...settings };
    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.masterGain) {
        const target = settings.muted ? 0 : settings.masterVolume;
        this.masterGain.gain.setTargetAtTime(target, now, 0.02);
      }
      if (this.musicGain) {
        this.musicGain.gain.setTargetAtTime(this.getTargetMusicGain(), now, 0.02);
      }
    }
  }

  unlock(): void {
    if (this.isDisposed) return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.settings.muted ? 0 : this.settings.masterVolume;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.getTargetMusicGain();
      this.musicGain.connect(this.masterGain);

      this.danceGain = this.ctx.createGain();
      this.danceGain.gain.value = 1.0;
      this.danceGain.connect(this.masterGain);

      this.noiseBuffer = this.buildNoiseBuffer(this.ctx, 0.35);
      this.loopNoiseBuffer = this.buildNoiseBuffer(this.ctx, 1.8);

      if (!this.danceSynth) {
        this.danceSynth = new DanceMusicSynth(this.ctx, this.danceGain, this.noiseBuffer);
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx
        .resume()
        .then(() => {
          if (!this.isDisposed && this.ctx?.state === 'running') {
            this.unbindGestureUnlockListeners();
            if (this.lobbyMusicDesired && !this.danceActive) {
              this.tryStartLobbyMusicNode();
            }
          }
        })
        .catch(() => {});
    } else if (this.ctx.state === 'running') {
      this.unbindGestureUnlockListeners();
      if (this.lobbyMusicDesired && !this.activeMusicSource && !this.danceActive) {
        this.tryStartLobbyMusicNode();
      }
    }
  }

  private bindGestureUnlockListeners(): void {
    if (this.gestureListenersBound || typeof window === 'undefined') return;
    this.gestureListenersBound = true;
    window.addEventListener('pointerdown', this.onGestureUnlockBound, { capture: true, passive: true });
    window.addEventListener('keydown', this.onGestureUnlockBound, { capture: true, passive: true });
    window.addEventListener('touchstart', this.onGestureUnlockBound, { capture: true, passive: true });
  }

  private unbindGestureUnlockListeners(): void {
    if (!this.gestureListenersBound || typeof window === 'undefined') return;
    this.gestureListenersBound = false;
    window.removeEventListener('pointerdown', this.onGestureUnlockBound, true);
    window.removeEventListener('keydown', this.onGestureUnlockBound, true);
    window.removeEventListener('touchstart', this.onGestureUnlockBound, true);
  }

  private resolveAudioUrl(filename: string): string {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}audio/${filename}`;
  }

  private pickLobbyAudioUrls(): string[] {
    if (typeof document !== 'undefined') {
      const probe = document.createElement('audio');
      const canOgg = probe.canPlayType('audio/ogg; codecs="vorbis"');
      if (canOgg === 'probably' || canOgg === 'maybe') {
        return [this.resolveAudioUrl('lobby-theme.ogg'), this.resolveAudioUrl('lobby-theme.mp3')];
      }
    }
    return [this.resolveAudioUrl('lobby-theme.mp3'), this.resolveAudioUrl('lobby-theme.ogg')];
  }

  private trimMp3Padding(ctx: AudioContext, buf: AudioBuffer): AudioBuffer {
    const ch0 = buf.getChannelData(0);
    const len = buf.length;
    const threshold = 0.0008;
    let start = 0;
    const maxLead = Math.min(2400, Math.floor(len * 0.05));
    while (start < maxLead && Math.abs(ch0[start]) < threshold) {
      start++;
    }
    let end = len;
    const minEnd = Math.max(start + 1, len - Math.min(2800, Math.floor(len * 0.05)));
    while (end > minEnd && Math.abs(ch0[end - 1]) < threshold) {
      end--;
    }
    const trimmedLen = end - start;
    if (trimmedLen <= 4410 || (start === 0 && end === len)) {
      return buf;
    }
    const out = ctx.createBuffer(buf.numberOfChannels, trimmedLen, buf.sampleRate);
    const fadeLen = Math.min(128, Math.floor(trimmedLen * 0.01));
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c);
      const dst = out.getChannelData(c);
      dst.set(src.subarray(start, end));
      for (let i = 0; i < fadeLen; i++) {
        const w = i / fadeLen;
        dst[i] *= w;
        dst[trimmedLen - 1 - i] *= w;
      }
    }
    return out;
  }

  preloadLobbyMusic(): Promise<AudioBuffer | null> {
    if (this.isDisposed) return Promise.resolve(null);
    if (this.lobbyMusicBuffer) return Promise.resolve(this.lobbyMusicBuffer);
    if (this.lobbyMusicLoadPromise) return this.lobbyMusicLoadPromise;

    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);

    this.lobbyMusicLoadPromise = (async () => {
      const urls = this.pickLobbyAudioUrls();
      for (const url of urls) {
        if (this.isDisposed) return null;
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const arrayBuf = await res.arrayBuffer();
          if (this.isDisposed || !this.ctx) return null;
          let decoded = await this.ctx.decodeAudioData(arrayBuf);
          if (url.endsWith('.mp3')) {
            decoded = this.trimMp3Padding(this.ctx, decoded);
          }
          this.lobbyMusicBuffer = decoded;
          if (this.lobbyMusicDesired && this.ctx.state === 'running') {
            this.tryStartLobbyMusicNode();
          }
          return decoded;
        } catch {
          // Try next codec fallback
        }
      }
      return null;
    })();

    return this.lobbyMusicLoadPromise;
  }

  private tryStartLobbyMusicNode(): void {
    if (
      this.isDisposed ||
      !this.lobbyMusicDesired ||
      this.danceActive ||
      !this.ctx ||
      !this.musicGain ||
      this.ctx.state !== 'running' ||
      !this.lobbyMusicBuffer ||
      this.activeMusicSource
    ) {
      return;
    }

    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.lobbyMusicBuffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = this.lobbyMusicBuffer.duration;

    const fadeGain = this.ctx.createGain();
    fadeGain.gain.setValueAtTime(0.0001, now);
    fadeGain.gain.linearRampToValueAtTime(1.0, now + 0.18);

    source.connect(fadeGain);
    fadeGain.connect(this.musicGain);

    source.onended = () => {
      try {
        source.disconnect();
        fadeGain.disconnect();
      } catch {
        // Ignore
      }
      if (this.activeMusicSource === source) {
        this.activeMusicSource = null;
        this.activeMusicFadeGain = null;
      }
    };

    source.start(now);
    this.activeMusicSource = source;
    this.activeMusicFadeGain = fadeGain;
  }

  startLobbyMusic(): void {
    if (this.isDisposed) return;
    this.lobbyMusicDesired = true;
    this.unlock();

    if (!this.ctx || this.ctx.state !== 'running') {
      this.bindGestureUnlockListeners();
    }

    if (this.lobbyMusicBuffer) {
      this.tryStartLobbyMusicNode();
    } else {
      void this.preloadLobbyMusic();
    }
  }

  stopLobbyMusic(): void {
    this.lobbyMusicDesired = false;
    this.unbindGestureUnlockListeners();
    this.stopActiveLobbyMusicNode();
  }

  private stopActiveLobbyMusicNode(): void {
    const source = this.activeMusicSource;
    const fadeGain = this.activeMusicFadeGain;
    this.activeMusicSource = null;
    this.activeMusicFadeGain = null;

    if (!source) return;

    if (this.ctx && fadeGain && this.ctx.state === 'running') {
      const now = this.ctx.currentTime;
      try {
        fadeGain.gain.cancelScheduledValues(now);
        fadeGain.gain.setValueAtTime(Math.max(0.0001, fadeGain.gain.value), now);
        fadeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
        source.stop(now + 0.055);
      } catch {
        try {
          source.stop();
          source.disconnect();
          fadeGain.disconnect();
        } catch {
          // Ignore
        }
      }
    } else {
      try {
        source.stop();
        source.disconnect();
        fadeGain?.disconnect();
      } catch {
        // Ignore
      }
    }
  }

  private buildNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private ensureAirborneLoopNodes(): void {
    if (!this.ctx || !this.masterGain || !this.loopNoiseBuffer) return;
    if (!this.airborneWindSource) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.loopNoiseBuffer;
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 320;
      filter.Q.value = 0.7;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start();

      this.airborneWindSource = src;
      this.airborneWindFilter = filter;
      this.airborneWindGain = gain;
    }
    if (!this.airplaneDroneOsc) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 62;

      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 180;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      osc.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(this.masterGain);
      osc.start();

      this.airplaneDroneOsc = osc;
      this.airplaneDroneGain = gain;
    }
  }

  setAirborneAudio(
    phase: 'inactive' | 'airplane' | 'freefall' | 'parachute' | 'landed',
    speedRatio = 0,
  ): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (phase === 'inactive' || phase === 'landed' || this.settings.muted) {
      if (this.airborneWindGain) {
        this.airborneWindGain.gain.setTargetAtTime(0, now, 0.08);
      }
      if (this.airplaneDroneGain) {
        this.airplaneDroneGain.gain.setTargetAtTime(0, now, 0.08);
      }
      return;
    }

    this.ensureAirborneLoopNodes();
    if (!this.airborneWindGain || !this.airborneWindFilter || !this.airplaneDroneGain || !this.airplaneDroneOsc) {
      return;
    }

    if (phase === 'airplane') {
      this.airplaneDroneOsc.frequency.setTargetAtTime(64, now, 0.15);
      this.airplaneDroneGain.gain.setTargetAtTime(0.085, now, 0.18);
      this.airborneWindFilter.frequency.setTargetAtTime(240, now, 0.15);
      this.airborneWindGain.gain.setTargetAtTime(0.03, now, 0.18);
    } else if (phase === 'freefall') {
      const s = Math.max(0, Math.min(1, speedRatio));
      this.airplaneDroneGain.gain.setTargetAtTime(0, now, 0.2);
      this.airborneWindFilter.frequency.setTargetAtTime(280 + s * 680, now, 0.08);
      this.airborneWindGain.gain.setTargetAtTime(0.065 + s * 0.12, now, 0.08);
    } else if (phase === 'parachute') {
      this.airplaneDroneGain.gain.setTargetAtTime(0, now, 0.1);
      this.airborneWindFilter.frequency.setTargetAtTime(260, now, 0.12);
      this.airborneWindGain.gain.setTargetAtTime(0.032, now, 0.12);
    }
  }

  playAirplaneJump(): void {
    this.playTone(320, 140, 0.24, 'sawtooth', 0.16);
    this.playTone(180, 95, 0.28, 'triangle', 0.14, 0.04);
  }

  playParachuteDeploy(): void {
    this.playTone(150, 520, 0.18, 'triangle', 0.18);
    this.playTone(260, 110, 0.24, 'sine', 0.14, 0.06);
  }

  playLandingThud(): void {
    this.playTone(130, 48, 0.16, 'triangle', 0.18);
  }

  private ensureZiplineLoopNodes(): void {
    if (!this.ctx || !this.masterGain || !this.loopNoiseBuffer) return;
    if (!this.ziplineNoiseSource) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.loopNoiseBuffer;
      src.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1480;
      filter.Q.value = 2.6;

      const gain = this.ctx.createGain();
      gain.gain.value = 0;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start();

      this.ziplineNoiseSource = src;
      this.ziplineFilter = filter;
      this.ziplineGain = gain;
    }
  }

  setZiplineSliding(active: boolean, speedMps = 16.5): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (!active || this.settings.muted) {
      if (this.ziplineGain) {
        this.ziplineGain.gain.setTargetAtTime(0, now, 0.05);
      }
      return;
    }
    this.ensureZiplineLoopNodes();
    if (!this.ziplineFilter || !this.ziplineGain) return;
    const speedFactor = Math.max(0.7, Math.min(1.4, speedMps / 16.5));
    this.ziplineFilter.frequency.setTargetAtTime(1250 * speedFactor, now, 0.06);
    this.ziplineGain.gain.setTargetAtTime(0.085, now, 0.05);
  }

  playZiplineAttach(): void {
    this.playTone(360, 760, 0.09, 'triangle', 0.15);
    this.playTone(980, 1420, 0.07, 'sine', 0.11, 0.03);
  }

  playZiplineDetach(): void {
    this.playTone(640, 260, 0.1, 'triangle', 0.13);
  }

  playClick(): void {
    this.playTone(540, 680, 0.045, 'triangle', 0.14);
  }

  playBack(): void {
    this.playTone(420, 260, 0.06, 'sine', 0.12);
  }

  playDeploy(): void {
    this.playTone(220, 660, 0.18, 'sawtooth', 0.15);
    this.playTone(440, 880, 0.22, 'triangle', 0.12, 0.05);
  }

  playVictory(): void {
    this.playTone(523.25, 659.25, 0.14, 'triangle', 0.16, 0);
    this.playTone(659.25, 783.99, 0.16, 'triangle', 0.16, 0.11);
    this.playTone(783.99, 1046.5, 0.34, 'sine', 0.18, 0.22);
  }

  playEliminated(): void {
    this.playTone(330, 220, 0.18, 'sawtooth', 0.13, 0);
    this.playTone(220, 130, 0.28, 'triangle', 0.14, 0.14);
  }

  playPickup(): void {
    this.playTone(420, 740, 0.07, 'triangle', 0.14);
    this.playTone(680, 960, 0.08, 'sine', 0.12, 0.045);
  }

  playEmptyMag(): void {
    this.playTone(980, 420, 0.032, 'square', 0.11);
  }

  playReload(stage: 'start' | 'finish'): void {
    if (stage === 'start') {
      this.playReloadStage('mag_out');
    } else {
      this.playReloadStage('rack');
    }
  }

  playReloadStage(
    stage: 'mag_out' | 'mag_in' | 'rack' | 'shell_in' | 'break_open' | 'break_close',
  ): void {
    switch (stage) {
      case 'mag_out':
        this.playTone(360, 175, 0.065, 'triangle', 0.14);
        this.playTone(540, 390, 0.04, 'square', 0.07, 0.035);
        break;
      case 'mag_in':
        this.playTone(290, 520, 0.055, 'triangle', 0.15);
        this.playTone(680, 520, 0.04, 'square', 0.08, 0.03);
        break;
      case 'shell_in':
        this.playTone(420, 620, 0.045, 'triangle', 0.13);
        this.playTone(460, 660, 0.045, 'triangle', 0.13, 0.12);
        break;
      case 'break_open':
        this.playTone(560, 280, 0.075, 'triangle', 0.15);
        this.playTone(920, 620, 0.045, 'square', 0.075, 0.04);
        break;
      case 'break_close':
        this.playTone(210, 420, 0.06, 'triangle', 0.16);
        this.playTone(520, 740, 0.045, 'square', 0.09, 0.035);
        break;
      case 'rack':
        this.playTone(480, 740, 0.055, 'triangle', 0.15);
        this.playTone(810, 980, 0.05, 'square', 0.095, 0.045);
        break;
    }
  }

  playZoneWarning(): void {
    this.playTone(680, 520, 0.11, 'triangle', 0.13, 0);
    this.playTone(880, 660, 0.12, 'sine', 0.11, 0.12);
  }

  playHitmarker(isHeadshot: boolean): void {
    if (isHeadshot) {
      this.playTone(1380, 1760, 0.065, 'triangle', 0.16);
      this.playTone(920, 1280, 0.055, 'sine', 0.12, 0.02);
    } else {
      this.playTone(720, 520, 0.04, 'triangle', 0.11);
    }
  }

  playBoltAction(): void {
    this.playTone(460, 640, 0.045, 'triangle', 0.12);
    this.playTone(340, 210, 0.06, 'square', 0.075, 0.14);
    this.playTone(580, 790, 0.045, 'triangle', 0.11, 0.28);
  }

  playMeleeSwing(kind: 'fists' | 'knife' | 'bat' = 'fists'): void {
    if (this.settings.muted || this.settings.masterVolume <= 0.001) return;
    this.unlock();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (kind === 'knife') {
      this.playTone(780, 320, 0.075, 'triangle', 0.11);
    } else if (kind === 'bat') {
      this.playTone(190, 72, 0.13, 'triangle', 0.15);
    } else {
      this.playTone(230, 95, 0.095, 'sine', 0.12);
    }
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(kind === 'knife' ? 2100 : kind === 'bat' ? 680 : 980, now);
      filter.frequency.exponentialRampToValueAtTime(
        kind === 'knife' ? 880 : kind === 'bat' ? 220 : 340,
        now + 0.11,
      );
      filter.Q.setValueAtTime(kind === 'knife' ? 1.6 : 1.0, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(kind === 'bat' ? 0.16 : 0.13, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'bat' ? 0.14 : 0.105));
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.15);
    }
  }

  playMeleeHit(kind: 'fists' | 'knife' | 'bat', isHeadshot: boolean): void {
    if (this.settings.muted || this.settings.masterVolume <= 0.001) return;
    this.unlock();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (kind === 'knife') {
      this.playTone(isHeadshot ? 1480 : 980, 420, 0.075, 'sawtooth', 0.15);
      this.playTone(240, 80, 0.08, 'triangle', 0.16);
    } else if (kind === 'bat') {
      this.playTone(isHeadshot ? 260 : 195, 58, 0.15, 'triangle', 0.28);
      this.playTone(620, 280, 0.07, 'square', isHeadshot ? 0.14 : 0.09);
    } else {
      this.playTone(isHeadshot ? 175 : 140, 42, 0.12, 'triangle', isHeadshot ? 0.26 : 0.22);
      if (isHeadshot) {
        this.playTone(620, 290, 0.075, 'sawtooth', 0.13);
      }
    }
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = kind === 'knife' ? 'bandpass' : 'lowpass';
      filter.frequency.setValueAtTime(
        kind === 'knife' ? 2400 : isHeadshot ? 1850 : 1200,
        now,
      );
      filter.frequency.exponentialRampToValueAtTime(kind === 'knife' ? 750 : 180, now + 0.095);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(isHeadshot ? 0.24 : 0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.105);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.115);
    }
  }

  playPunchSwing(): void {
    this.playMeleeSwing('fists');
  }

  playPunchHit(isHeadshot: boolean): void {
    this.playMeleeHit('fists', isHeadshot);
  }

  playVault(): void {
    this.playTone(190, 290, 0.11, 'triangle', 0.13);
    this.playTone(130, 82, 0.12, 'sine', 0.11, 0.09);
  }

  playGlassBreak(): void {
    if (this.settings.muted || this.settings.masterVolume <= 0.001) return;
    this.unlock();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.playTone(2150, 1240, 0.08, 'triangle', 0.09);
    this.playTone(2860, 1520, 0.075, 'sine', 0.08, 0.035);
    this.playTone(1780, 920, 0.09, 'triangle', 0.07, 0.07);
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1800, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.2);
    }
  }

  playSit(): void {
    this.playTone(220, 130, 0.085, 'sine', 0.11);
    this.playTone(160, 95, 0.07, 'triangle', 0.09, 0.03);
  }

  playStand(): void {
    this.playTone(145, 250, 0.08, 'sine', 0.11);
  }

  playHealStart(kind: 'bandage' | 'medkit' | 'shield' | 'syringe' | 'drink'): void {
    if (kind === 'shield') {
      this.playTone(420, 740, 0.14, 'sine', 0.09);
      this.playTone(620, 980, 0.12, 'triangle', 0.06, 0.04);
    } else if (kind === 'drink') {
      this.playTone(660, 920, 0.07, 'triangle', 0.08);
      this.playTone(480, 320, 0.09, 'sine', 0.06, 0.05);
    } else {
      this.playTone(300, 480, 0.11, 'sine', 0.08);
      this.playTone(420, 560, 0.09, 'triangle', 0.05, 0.05);
    }
  }

  playHealTick(): void {
    this.playTone(440, 520, 0.055, 'sine', 0.045);
  }

  playHealComplete(): void {
    this.playTone(523.25, 659.25, 0.11, 'sine', 0.1);
    this.playTone(659.25, 783.99, 0.14, 'triangle', 0.09, 0.06);
  }

  playHealInterrupt(): void {
    this.playTone(320, 150, 0.12, 'sawtooth', 0.08);
    this.playTone(210, 110, 0.1, 'triangle', 0.07, 0.04);
  }

  playDistantGunshot(sound: WeaponSoundSpec): void {
    const nowMs = performance.now();
    if (nowMs - this.lastDistantShotMs < 45) return;
    this.lastDistantShotMs = nowMs;
    this.playGunshot(sound);
  }

  playGunshot(sound: WeaponSoundSpec): void {
    if (this.settings.muted || this.settings.masterVolume <= 0.001) return;
    this.unlock();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;

    // Low mechanical body punch
    const osc = this.ctx.createOscillator();
    const punchGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(sound.pitchHz, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(25, sound.endPitchHz), now + sound.decaySec);

    punchGain.gain.setValueAtTime(sound.punchGain, now);
    punchGain.gain.exponentialRampToValueAtTime(0.0001, now + sound.decaySec);

    osc.connect(punchGain);
    punchGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + sound.decaySec + 0.02);

    // Filtered muzzle crack noise burst
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(sound.noiseHz, now);
      filter.Q.setValueAtTime(0.9, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(sound.punchGain * 0.95, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + sound.decaySec * 1.15);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + sound.decaySec * 1.2 + 0.02);

      // Extra acoustic signature tails by weapon category/sound ID
      if (sound.id === 'sfx_vss') {
        // Soft suppressed subsonic thump
        const suppOsc = this.ctx.createOscillator();
        const suppGain = this.ctx.createGain();
        suppOsc.type = 'triangle';
        suppOsc.frequency.setValueAtTime(145, now);
        suppOsc.frequency.exponentialRampToValueAtTime(52, now + 0.055);
        suppGain.gain.setValueAtTime(0.11, now);
        suppGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        suppOsc.connect(suppGain);
        suppGain.connect(this.masterGain);
        suppOsc.start(now);
        suppOsc.stop(now + 0.065);
      } else if (
        sound.id === 'sfx_awm' ||
        sound.id === 'sfx_m24' ||
        sound.id === 'sfx_kar98k' ||
        sound.id === 'sfx_svd' ||
        sound.id === 'sfx_dragunov'
      ) {
        // Supersonic sniper crack tail
        const isHeavy = sound.id === 'sfx_awm' || sound.id === 'sfx_m24';
        const tailNoise = this.ctx.createBufferSource();
        tailNoise.buffer = this.noiseBuffer;
        const tailFilter = this.ctx.createBiquadFilter();
        tailFilter.type = 'lowpass';
        tailFilter.frequency.setValueAtTime(isHeavy ? 1450 : 1220, now + 0.04);
        tailFilter.frequency.exponentialRampToValueAtTime(220, now + (isHeavy ? 0.34 : 0.25));

        const tailGain = this.ctx.createGain();
        tailGain.gain.setValueAtTime(0.0001, now);
        tailGain.gain.linearRampToValueAtTime(isHeavy ? 0.24 : 0.18, now + 0.045);
        tailGain.gain.exponentialRampToValueAtTime(0.0001, now + (isHeavy ? 0.35 : 0.26));

        tailNoise.connect(tailFilter);
        tailFilter.connect(tailGain);
        tailGain.connect(this.masterGain);
        tailNoise.start(now);
        tailNoise.stop(now + 0.36);
      } else if (sound.id === 'sfx_m249' || sound.id === 'sfx_m60' || sound.id === 'sfx_dp28') {
        // Crisp belt/bolt mechanical clack layered onto heavy LMG report
        const mechOsc = this.ctx.createOscillator();
        const mechGain = this.ctx.createGain();
        mechOsc.type = 'square';
        mechOsc.frequency.setValueAtTime(sound.id === 'sfx_dp28' ? 740 : 920, now + 0.01);
        mechOsc.frequency.exponentialRampToValueAtTime(260, now + 0.045);
        mechGain.gain.setValueAtTime(0.055, now + 0.01);
        mechGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        mechOsc.connect(mechGain);
        mechGain.connect(this.masterGain);
        mechOsc.start(now + 0.01);
        mechOsc.stop(now + 0.055);
      } else if (sound.id === 'sfx_m1917' || sound.id === 'sfx_double_barrel' || sound.id === 'sfx_spas12') {
        // Heavy low-end boom tail for revolver & combat shotguns
        const boomNoise = this.ctx.createBufferSource();
        boomNoise.buffer = this.noiseBuffer;
        const boomFilter = this.ctx.createBiquadFilter();
        boomFilter.type = 'lowpass';
        boomFilter.frequency.setValueAtTime(980, now + 0.02);
        boomFilter.frequency.exponentialRampToValueAtTime(160, now + 0.22);
        const boomGain = this.ctx.createGain();
        boomGain.gain.setValueAtTime(0.18, now + 0.015);
        boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);
        boomNoise.connect(boomFilter);
        boomFilter.connect(boomGain);
        boomGain.connect(this.masterGain);
        boomNoise.start(now);
        boomNoise.stop(now + 0.24);
      }
    }
  }

  private playTone(
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (this.settings.muted || this.settings.masterVolume <= 0.001) return;
    this.unlock();
    if (!this.ctx || !this.masterGain || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playEmoteStart(style: EmoteStyle = 'cool'): void {
    switch (style) {
      case 'victory':
        this.playTone(440, 554.37, 0.11, 'triangle', 0.12, 0);
        this.playTone(554.37, 659.25, 0.12, 'triangle', 0.12, 0.08);
        this.playTone(659.25, 880, 0.18, 'sine', 0.13, 0.16);
        break;
      case 'funny':
        this.playTone(392, 587.33, 0.09, 'square', 0.06, 0);
        this.playTone(523.25, 349.23, 0.11, 'triangle', 0.09, 0.08);
        break;
      case 'trending':
        this.playTone(330, 493.88, 0.1, 'triangle', 0.1, 0);
        this.playTone(493.88, 659.25, 0.14, 'sine', 0.12, 0.07);
        break;
      default:
        this.playTone(369.99, 554.37, 0.1, 'sine', 0.11, 0);
        this.playTone(554.37, 739.99, 0.15, 'triangle', 0.11, 0.07);
        break;
    }
  }

  playEmoteStop(): void {
    this.playTone(480, 290, 0.09, 'sine', 0.07, 0);
  }

  private computeSpatialGain(distanceMeters = 0, maxDistance = 54): number {
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 3.5) return 1;
    if (distanceMeters >= maxDistance) return 0;
    const norm = (distanceMeters - 3.5) / (maxDistance - 3.5);
    return Math.max(0, Math.pow(1 - norm, 1.65));
  }

  private playFilteredNoiseBurst(
    startOffset: number,
    duration: number,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    gainPeak: number,
  ): void {
    if (this.settings.muted || this.settings.masterVolume <= 0.001 || gainPeak <= 0.002) return;
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;
    const now = ctx.currentTime + startOffset;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = duration > 0.3;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, now);
    filter.frequency.setValueAtTime(Math.max(40, freqStart), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(
      gainPeak,
      now + Math.min(0.018, duration * 0.25),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  playGlooDeploy(distanceMeters = 0): void {
    const atten = this.computeSpatialGain(distanceMeters, 54);
    if (atten <= 0.02) return;

    // 1. Cryo canister release & rapid frost expansion hiss (0.00s -> 0.24s)
    this.playTone(320, 118, 0.09, 'triangle', 0.14 * atten, 0);
    this.playFilteredNoiseBurst(0.0, 0.26, 'bandpass', 1400, 5600, 2.2, 0.24 * atten);

    // 2. Crystalline freezing sweep synchronized to wall rising (0.03s -> 0.30s)
    this.playTone(980, 2460, 0.19, 'sine', 0.11 * atten, 0.03);
    this.playTone(1480, 3180, 0.21, 'triangle', 0.08 * atten, 0.055);
    this.playTone(2120, 3920, 0.18, 'sine', 0.065 * atten, 0.095);

    // 3. Staggered crisp ice-crack transients as panels crystallize & lock upright (0.10s, 0.17s, 0.24s)
    this.playFilteredNoiseBurst(0.1, 0.055, 'highpass', 3600, 6800, 3.2, 0.22 * atten);
    this.playTone(2840, 1120, 0.045, 'triangle', 0.1 * atten, 0.105);

    this.playFilteredNoiseBurst(0.175, 0.06, 'bandpass', 4200, 2200, 4.0, 0.24 * atten);
    this.playTone(3420, 1480, 0.05, 'triangle', 0.095 * atten, 0.18);

    this.playFilteredNoiseBurst(0.245, 0.065, 'highpass', 3100, 5800, 2.8, 0.2 * atten);

    // 4. Deep frozen ground-lock thud (0.26s -> 0.36s)
    this.playTone(145, 58, 0.14, 'sine', 0.2 * atten, 0.23);
    this.playTone(520, 260, 0.09, 'triangle', 0.08 * atten, 0.24);
  }

  playGlooHit(distanceMeters = 0): void {
    const atten = this.computeSpatialGain(distanceMeters, 48);
    if (atten <= 0.02) return;

    // Crisp bullet-on-ice chip crack + glassy chime + solid ice thud
    this.playFilteredNoiseBurst(0, 0.055, 'bandpass', 4400, 2100, 3.6, 0.22 * atten);
    this.playTone(2380, 960, 0.065, 'triangle', 0.11 * atten, 0);
    this.playTone(3240, 1840, 0.055, 'sine', 0.08 * atten, 0.012);
    this.playTone(220, 95, 0.06, 'sine', 0.11 * atten, 0);
  }

  playGlooShatter(distanceMeters = 0): void {
    const atten = this.computeSpatialGain(distanceMeters, 58);
    if (atten <= 0.02) return;

    // Heavy fracture snap + collapsing sub-bass + cascading tumbling crystal shards
    this.playFilteredNoiseBurst(0, 0.14, 'highpass', 2400, 6200, 1.8, 0.3 * atten);
    this.playTone(190, 52, 0.22, 'sine', 0.2 * atten, 0);
    this.playTone(1680, 420, 0.16, 'triangle', 0.15 * atten, 0);

    const shardFreqs = [3420, 2760, 4120, 2240, 3680, 2940];
    for (let i = 0; i < shardFreqs.length; i++) {
      const delay = 0.03 + i * 0.038;
      const f = shardFreqs[i];
      this.playTone(f, f * 0.56, 0.085, i % 2 === 0 ? 'sine' : 'triangle', (0.095 - i * 0.01) * atten, delay);
    }
    this.playFilteredNoiseBurst(0.08, 0.24, 'bandpass', 3800, 1900, 2.5, 0.18 * atten);
  }

  playKillConfirmed(isHeadshot = false): void {
    if (isHeadshot) {
      this.playTone(587.33, 880, 0.09, 'triangle', 0.16, 0);
      this.playTone(880, 1174.66, 0.12, 'sine', 0.17, 0.055);
      this.playTone(1174.66, 1567.98, 0.18, 'sine', 0.15, 0.11);
    } else {
      this.playTone(440, 659.25, 0.09, 'triangle', 0.14, 0);
      this.playTone(659.25, 987.77, 0.16, 'sine', 0.15, 0.06);
    }
  }

  playDanceMusic(emoteId: string, durationSec = 10, onEnded?: () => void): void {
    if (this.isDisposed) return;

    // Guarantee only one dance music track ever plays at a time
    this.stopDanceMusicInternal(false, false);

    this.danceActive = true;
    const gen = ++this.danceGeneration;

    // Duck/pause lobby BGM node cleanly while keeping lobbyMusicDesired intact
    this.stopActiveLobbyMusicNode();
    this.unlock();

    const startPlayback = () => {
      if (this.isDisposed || !this.danceActive || this.danceGeneration !== gen) return;
      if (!this.ctx || !this.danceGain) return;
      if (!this.danceSynth) {
        this.danceSynth = new DanceMusicSynth(this.ctx, this.danceGain, this.noiseBuffer);
      }
      this.danceSynth.play(emoteId, durationSec, () => {
        if (this.danceGeneration !== gen) return;
        this.stopDanceMusicInternal(false, true);
        onEnded?.();
      });
    };

    if (this.ctx) {
      if (this.ctx.state === 'running') {
        startPlayback();
      } else {
        void this.ctx
          .resume()
          .then(() => {
            startPlayback();
          })
          .catch(() => {});
      }
    }

    this.danceSafetyTimer = window.setTimeout(() => {
      if (this.danceGeneration !== gen || !this.danceActive) return;
      this.stopDanceMusicInternal(false, true);
      onEnded?.();
    }, Math.max(100, (durationSec + 0.15) * 1000));
  }

  stopDanceMusic(playStopCue = false): void {
    this.stopDanceMusicInternal(playStopCue, true);
  }

  private stopDanceMusicInternal(playStopCue: boolean, restoreLobbyBgm: boolean): void {
    const wasActive = this.danceActive;
    this.danceGeneration++;
    this.danceActive = false;

    if (this.danceSafetyTimer) {
      clearTimeout(this.danceSafetyTimer);
      this.danceSafetyTimer = 0;
    }

    this.danceSynth?.stop();

    if (playStopCue && wasActive) {
      this.playEmoteStop();
    }

    if (
      restoreLobbyBgm &&
      this.lobbyMusicDesired &&
      !this.isDisposed &&
      this.ctx?.state === 'running'
    ) {
      this.tryStartLobbyMusicNode();
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.stopDanceMusicInternal(false, false);
    this.danceSynth?.dispose();
    this.danceSynth = null;
    this.stopLobbyMusic();
    this.lobbyMusicBuffer = null;
    this.lobbyMusicLoadPromise = null;

    try {
      this.airborneWindSource?.stop();
    } catch {
      // Ignore
    }
    try {
      this.airplaneDroneOsc?.stop();
    } catch {
      // Ignore
    }
    try {
      this.ziplineNoiseSource?.stop();
    } catch {
      // Ignore
    }
    this.airborneWindSource = null;
    this.airborneWindFilter = null;
    this.airborneWindGain = null;
    this.airplaneDroneOsc = null;
    this.airplaneDroneGain = null;
    this.ziplineNoiseSource = null;
    this.ziplineFilter = null;
    this.ziplineGain = null;
    this.loopNoiseBuffer = null;
    this.musicGain = null;
    this.danceGain = null;

    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
      this.noiseBuffer = null;
    }
  }
}
