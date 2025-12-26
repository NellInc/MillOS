// Audio manager for realistic factory sounds using Web Audio API
import { logger } from './logger';

// Use centralized audio logger
const audioLog = {
  info: (message: string, ...args: unknown[]) => {
    logger.audio.info(message, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    logger.audio.warn(message, ...args);
  },
  error: (message: string, error?: unknown, ...args: unknown[]) => {
    logger.audio.error(message, error, ...args);
  },
};

class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private lastHornTime: Map<string, number> = new Map();
  private lastBeepTime: Map<string, number> = new Map();
  private _muted: boolean = false;
  private _volume: number = 0.5;
  private listeners: Set<() => void> = new Set();
  private _initialized: boolean = false;
  private _isTabVisible: boolean = true; // Track tab visibility to pause audio when hidden

  // Pre-generated noise buffers to avoid blocking main thread during playback
  private cachedNoiseBuffers: {
    brown4s?: AudioBuffer; // 4-second brown noise for compressor
    pink4s?: AudioBuffer; // 4-second pink noise for PA speech
    white1s?: AudioBuffer; // 1-second white noise for various effects
  } = {};
  private noiseBuffersGenerated: boolean = false;

  get initialized(): boolean {
    return this._initialized;
  }

  // Ambient sound nodes
  private ambientNodes: {
    machineryHum?: { source: AudioBufferSourceNode; gain: GainNode };
    conveyorNoise?: { source: AudioBufferSourceNode; gain: GainNode };
    ventilation?: { source: AudioBufferSourceNode; gain: GainNode };
    grainFlow?: { source: AudioBufferSourceNode; gain: GainNode };
  } = {};

  // Machine-specific sound nodes
  private machineNodes: Map<string, { source: AudioBufferSourceNode; gain: GainNode; filter?: BiquadFilterNode; lfo?: OscillatorNode }> = new Map();

  // Forklift engine sounds
  private forkliftEngines: Map<
    string,
    { source: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode }
  > = new Map();
  private backgroundMuted = false;

  // Radio chatter state
  private radioChatterActive: boolean = false;
  private radioChatterInterval: NodeJS.Timeout | number | null = null;

  // Outdoor ambient sounds
  private outdoorNodes: {
    birds?: { source: AudioBufferSourceNode; gain: GainNode };
    wind?: { source: AudioBufferSourceNode; gain: GainNode };
    traffic?: { source: AudioBufferSourceNode; gain: GainNode };
    water?: { source: AudioBufferSourceNode; gain: GainNode };
    ducks?: { source: AudioBufferSourceNode; gain: GainNode };
    pigs?: { source: AudioBufferSourceNode; gain: GainNode };
    cows?: { source: AudioBufferSourceNode; gain: GainNode };
  } = {};

  // Camera position for spatial audio (updated externally)
  private cameraPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  // Sound source positions for spatial calculation
  private soundPositions: Map<string, { x: number; y: number; z: number }> = new Map();

  // Ambient sound spatial attenuation settings
  // Factory center and range for distance-based volume attenuation
  private readonly FACTORY_CENTER = { x: 0, y: 0, z: 0 };
  private readonly FACTORY_AMBIENT_MAX_DISTANCE = 100; // Units before full attenuation
  private readonly AMBIENT_BASE_VOLUMES = {
    machineryHum: 0.08,
    conveyorNoise: 0.03,
    ventilation: 0.015,
    grainFlow: 0.012,
  };

  // Background music
  private musicAudio: HTMLAudioElement | null = null;
  private _musicEnabled: boolean = true;
  private _musicVolume: number = 0.3;
  private _currentTrackIndex: number = 0;
  // Store bound event listener references to properly remove them on cleanup
  private musicEndedHandler: (() => void) | null = null;
  private musicErrorHandler: ((e: Event) => void) | null = null;

  // Available music tracks (shuffled on init, excludes victory fanfare)
  // Music by Kevin MacLeod (incompetech.com) - Licensed under CC BY 3.0/4.0
  // Jolly, upbeat working/driving music for factory vibes
  // Note: Using import.meta.env.BASE_URL for GitHub Pages subdirectory deployment
  private readonly allMusicTracks = [
    { id: 'the_builder', name: 'The Builder', file: `${import.meta.env.BASE_URL}The Builder.mp3` },
    { id: 'space_jazz', name: 'Space Jazz', file: `${import.meta.env.BASE_URL}Space Jazz.mp3` },
    {
      id: 'upbeat_forever',
      name: 'Upbeat Forever',
      file: `${import.meta.env.BASE_URL}Upbeat Forever.mp3`,
    },
    {
      id: 'fuzzball_parade',
      name: 'Fuzzball Parade',
      file: `${import.meta.env.BASE_URL}Fuzzball Parade.mp3`,
    },
    {
      id: 'i_got_a_stick',
      name: 'I Got a Stick',
      file: `${import.meta.env.BASE_URL}I Got a Stick Feat James Gavins.mp3`,
    },
    {
      id: 'boogie_party',
      name: 'Boogie Party',
      file: `${import.meta.env.BASE_URL}Boogie Party.mp3`,
    },
    {
      id: 'voxel_revolution',
      name: 'Voxel Revolution',
      file: `${import.meta.env.BASE_URL}Voxel Revolution.mp3`,
    },
    { id: 'newer_wave', name: 'Newer Wave', file: `${import.meta.env.BASE_URL}Newer Wave.mp3` },
    {
      id: 'neon_laser_horizon',
      name: 'Neon Laser Horizon',
      file: `${import.meta.env.BASE_URL}Neon Laser Horizon.mp3`,
    },
    {
      id: 'cloud_dancer',
      name: 'Cloud Dancer',
      file: `${import.meta.env.BASE_URL}Cloud Dancer.mp3`,
    },
  ];

  // Shuffled playlist (Fisher-Yates shuffle on init)
  private musicTracks: { id: string; name: string; file: string }[];

  // Victory fanfare - only played when quota hits 100%
  // Music by Kevin MacLeod (incompetech.com) - Licensed under CC BY 4.0
  private readonly victoryFanfare = {
    id: 'fanfare_for_space',
    name: 'Victory!',
    file: `${import.meta.env.BASE_URL}Fanfare for Space.mp3`,
  };
  private victoryAudio: HTMLAudioElement | null = null;
  private _quotaReached: boolean = false;

  // TTS (Text-to-Speech) for PA announcements
  private _ttsEnabled: boolean = true; // On by default
  private _ttsVoice: SpeechSynthesisVoice | null = null;
  private _ttsVoiceLoaded: boolean = false;

  // PA tannoy reverb/echo effect chain
  private paReverbChain: {
    inputGain: GainNode;
    delay1: DelayNode;
    delay2: DelayNode;
    feedback: GainNode;
    lowpass: BiquadFilterNode;
    highpass: BiquadFilterNode;
    wetGain: GainNode;
    dryGain: GainNode;
    output: GainNode;
  } | null = null;

  // Speech reverb simulation (plays during TTS to simulate voice bouncing in factory)
  private speechReverbNodes: {
    source: AudioBufferSourceNode;
    gain: GainNode;
  } | null = null;
  private speechReverbPulseInterval: NodeJS.Timeout | number | null = null;

  // PA announcement queue - prevents messages from cutting each other off
  private announcementQueue: string[] = [];
  private isAnnouncementPlaying: boolean = false;
  private announcementChimeTimeout: ReturnType<typeof setTimeout> | null = null;
  private announcementSafetyTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Load persisted settings from localStorage
    this.loadSettings();
    // Shuffle tracks on initialization using Fisher-Yates algorithm
    this.musicTracks = [...this.allMusicTracks];
    this.shufflePlaylist();
  }

  // LocalStorage key for audio settings persistence
  private readonly STORAGE_KEY = 'millos-audio';

  // Save audio settings to localStorage
  private saveSettings(): void {
    try {
      const settings = {
        muted: this._muted,
        volume: this._volume,
        musicEnabled: this._musicEnabled,
        musicVolume: this._musicVolume,
        ttsEnabled: this._ttsEnabled,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // Silently fail if localStorage is not available
    }
  }

  // Load audio settings from localStorage
  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        if (typeof settings.muted === 'boolean') this._muted = settings.muted;
        if (typeof settings.volume === 'number') this._volume = Math.max(0, Math.min(1, settings.volume));
        if (typeof settings.musicEnabled === 'boolean') this._musicEnabled = settings.musicEnabled;
        if (typeof settings.musicVolume === 'number') this._musicVolume = Math.max(0, Math.min(1, settings.musicVolume));
        if (typeof settings.ttsEnabled === 'boolean') this._ttsEnabled = settings.ttsEnabled;
      }
    } catch (e) {
      // Silently fail if localStorage is not available or data is corrupted
    }
  }

  private shufflePlaylist(): void {
    for (let i = this.musicTracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.musicTracks[i], this.musicTracks[j]] = [this.musicTracks[j], this.musicTracks[i]];
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
    this.updateMasterVolume();
    this.updateMusicVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    this.updateMasterVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  get musicEnabled(): boolean {
    return this._musicEnabled;
  }

  set musicEnabled(value: boolean) {
    this._musicEnabled = value;
    if (value) {
      this.startMusic();
    } else {
      this.stopMusic();
    }
    this.saveSettings();
    this.notifyListeners();
  }

  get musicVolume(): number {
    return this._musicVolume;
  }

  set musicVolume(value: number) {
    this._musicVolume = Math.max(0, Math.min(1, value));
    this.updateMusicVolume();
    this.saveSettings();
    this.notifyListeners();
  }

  get currentTrack(): { id: string; name: string; file: string } {
    return this.musicTracks[this._currentTrackIndex];
  }

  get trackCount(): number {
    return this.musicTracks.length;
  }

  get trackIndex(): number {
    return this._currentTrackIndex;
  }

  get isTabVisible(): boolean {
    return this._isTabVisible;
  }

  set isTabVisible(value: boolean) {
    this._isTabVisible = value;
    // When tab becomes hidden, we let intervals continue but skip playback
    // When tab becomes visible again, intervals will resume normal playback
  }

  nextTrack(): void {
    this._currentTrackIndex = this._currentTrackIndex + 1;
    // Reshuffle playlist when we've played all tracks
    if (this._currentTrackIndex >= this.musicTracks.length) {
      this._currentTrackIndex = 0;
      this.shufflePlaylist();
    }
    if (this._musicEnabled && this.musicAudio) {
      this.musicAudio.src = this.currentTrack.file;
      this.updateMusicVolume(); // Ensure mute state is respected after src change
      this.musicAudio.play().catch(() => { });
    }
    this.notifyListeners();
  }

  prevTrack(): void {
    this._currentTrackIndex =
      (this._currentTrackIndex - 1 + this.musicTracks.length) % this.musicTracks.length;
    if (this._musicEnabled && this.musicAudio) {
      this.musicAudio.src = this.currentTrack.file;
      this.updateMusicVolume(); // Ensure mute state is respected after src change
      this.musicAudio.play().catch(() => { });
    }
    this.notifyListeners();
  }

  // Play victory fanfare when daily quota reaches 100%
  // This interrupts current music briefly, then resumes
  playVictoryFanfare(): void {
    // Only play once per quota achievement (reset when quota drops below 100%)
    if (this._quotaReached) return;
    this._quotaReached = true;

    // Pause current music
    const wasPlaying = this.musicAudio && !this.musicAudio.paused;
    const currentTime = this.musicAudio?.currentTime || 0;
    if (wasPlaying && this.musicAudio) {
      this.musicAudio.pause();
    }

    // Play victory fanfare
    if (!this.victoryAudio) {
      this.victoryAudio = new Audio(this.victoryFanfare.file);
    }
    this.victoryAudio.volume = this._muted ? 0 : this._musicVolume * 1.2; // Slightly louder
    this.victoryAudio.currentTime = 0;

    // Resume music after fanfare ends
    this.victoryAudio.onended = () => {
      if (wasPlaying && this.musicAudio && this._musicEnabled) {
        this.musicAudio.currentTime = currentTime;
        this.musicAudio.play().catch(() => { });
      }
    };

    this.victoryAudio.play().catch((e) => {
      audioLog.warn('Victory fanfare playback failed', e);
      // Resume music if fanfare failed
      if (wasPlaying && this.musicAudio && this._musicEnabled) {
        this.musicAudio.play().catch(() => { });
      }
    });
  }

  // Reset quota flag when production drops below 100%
  resetQuotaFlag(): void {
    this._quotaReached = false;
  }

  get quotaReached(): boolean {
    return this._quotaReached;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  private getContext(): AudioContext | null {
    if (!this._initialized) {
      return null;
    }
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.updateMasterVolume();
      // Pre-generate noise buffers asynchronously to avoid blocking during playback
      this.preGenerateNoiseBuffers();
    }
    return this.audioContext;
  }

  // Pre-generate commonly used noise buffers to prevent main thread blocking
  // during sound playback (which causes music interruption)
  private preGenerateNoiseBuffers(): void {
    if (this.noiseBuffersGenerated || !this.audioContext) return;
    this.noiseBuffersGenerated = true;

    // Use requestIdleCallback or setTimeout to generate buffers without blocking
    const generateBuffers = () => {
      if (!this.audioContext) return;
      const sampleRate = this.audioContext.sampleRate;

      // Generate 4-second brown noise (for compressor)
      this.cachedNoiseBuffers.brown4s =
        this.generateNoiseBufferInternal(4, 'brown', sampleRate) ?? undefined;

      // Generate 4-second pink noise (for PA speech - covers 2-4s range)
      this.cachedNoiseBuffers.pink4s =
        this.generateNoiseBufferInternal(4, 'pink', sampleRate) ?? undefined;

      // Generate 1-second white noise (for various short effects)
      this.cachedNoiseBuffers.white1s =
        this.generateNoiseBufferInternal(1, 'white', sampleRate) ?? undefined;

      audioLog.info('Noise buffers pre-generated');
    };

    // Use requestIdleCallback if available, otherwise use setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(generateBuffers, { timeout: 2000 });
    } else {
      setTimeout(generateBuffers, 100);
    }
  }

  // Internal buffer generation (used by preGenerateNoiseBuffers)
  private generateNoiseBufferInternal(
    duration: number,
    type: 'white' | 'pink' | 'brown',
    sampleRate: number
  ): AudioBuffer | null {
    if (!this.audioContext) return null;
    const bufferSize = sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;

      if (type === 'white') {
        data[i] = white;
      } else if (type === 'pink') {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      } else {
        // brown
        data[i] = (b0 = (b0 + 0.02 * white) / 1.02) * 3.5;
      }
    }
    return buffer;
  }

  private getMasterGain(): GainNode | null {
    const ctx = this.getContext();
    if (!ctx) return null;
    return this.masterGain;
  }

  private updateMasterVolume(): void {
    if (this.masterGain) {
      const targetVolume = this._muted ? 0 : this._volume;
      this.masterGain.gain.setTargetAtTime(targetVolume, this.audioContext?.currentTime || 0, 0.1);
    }
  }

  // Get or create the PA tannoy reverb/echo effect chain
  // Creates a classic tannoy sound with heavy delay echo, bandpass filtering, and long reverb tail
  private getPAReverbChain(): typeof this.paReverbChain {
    const ctx = this.getContext();
    const masterGain = this.getMasterGain();
    if (!ctx || !masterGain) return null;

    if (!this.paReverbChain) {
      // Input gain for the effect chain
      const inputGain = ctx.createGain();
      inputGain.gain.value = 1.0;

      // Primary delay (short slapback echo - ~80ms for that "room" feel)
      const delay1 = ctx.createDelay(1.0);
      delay1.delayTime.value = 0.08;

      // Secondary delay (longer echo - ~200ms for hall reverb)
      const delay2 = ctx.createDelay(1.0);
      delay2.delayTime.value = 0.2;

      // Feedback gain for echo repeats - higher value = more repeating echoes
      const feedback = ctx.createGain();
      feedback.gain.value = 0.55; // Strong feedback for pronounced echo trail

      // Additional feedback path filter - each echo gets more muffled (realistic)
      const feedbackFilter = ctx.createBiquadFilter();
      feedbackFilter.type = 'lowpass';
      feedbackFilter.frequency.value = 2000; // Each repeat loses high frequencies
      feedbackFilter.Q.value = 0.5;

      // Lowpass filter - simulates speaker frequency response (cuts harsh highs)
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3200; // Tannoy speakers cut off around 3kHz
      lowpass.Q.value = 0.8;

      // Highpass filter - removes rumble, adds "tinny" PA quality
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 350; // Cuts low bass for that telephone quality
      highpass.Q.value = 0.8;

      // Wet (processed) gain - echo/reverb level
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.9; // Heavy reverb presence

      // Dry (original) gain - lower to let reverb dominate
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.5; // Reduced dry signal

      // Output gain
      const output = ctx.createGain();
      output.gain.value = 1.0;

      // Build the effect chain:
      // Input -> Highpass -> Lowpass -> (Dry path + Wet/delay path) -> Output

      // Dry path: input -> filters -> dryGain -> output
      inputGain.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(dryGain);
      dryGain.connect(output);

      // Wet path with echo: cascading delays with filtered feedback loop
      lowpass.connect(delay1);
      delay1.connect(delay2);
      delay2.connect(feedbackFilter);
      feedbackFilter.connect(feedback);
      feedback.connect(delay1); // Feedback loop creates repeating echoes
      delay1.connect(wetGain);
      delay2.connect(wetGain); // Both delays contribute to wet signal
      wetGain.connect(output);

      // Connect output to master
      output.connect(masterGain);

      this.paReverbChain = {
        inputGain,
        delay1,
        delay2,
        feedback,
        lowpass,
        highpass,
        wetGain,
        dryGain,
        output,
      };
    }

    return this.paReverbChain;
  }

  // Reduce audio load when tab is hidden (keep user volume intact)
  setBackgroundVisibility(hidden: boolean): void {
    // Update visibility state to control interval-based sounds
    this._isTabVisible = !hidden;

    const ctx = this.audioContext;
    const gain = this.masterGain;
    if (!ctx || !gain) return;

    if (hidden && !this.backgroundMuted) {
      this.backgroundMuted = true;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    } else if (!hidden && this.backgroundMuted) {
      this.backgroundMuted = false;
      this.updateMasterVolume();
      if (this._musicEnabled && this.musicAudio && this.musicAudio.paused) {
        this.musicAudio.play().catch(() => { });
      }
    }
  }

  private updateMusicVolume(): void {
    if (this.musicAudio) {
      // Music has its own independent volume control
      this.musicAudio.volume = this._muted ? 0 : this._musicVolume;
    }
  }

  startMusic(): void {
    if (!this._musicEnabled) return;

    if (!this.musicAudio) {
      this.musicAudio = new Audio(this.currentTrack.file);
      this.musicAudio.loop = false; // Don't loop single track - advance through playlist
      this.updateMusicVolume();

      // Auto-advance to next track when current ends
      // Store bound reference to allow proper cleanup and prevent memory leak
      this.musicEndedHandler = () => {
        this.nextTrack();
      };
      this.musicAudio.addEventListener('ended', this.musicEndedHandler);

      // Handle errors by advancing to next track (prevents silent music stops)
      this.musicErrorHandler = (e: Event) => {
        audioLog.warn('Music track failed to load, advancing to next track', e);
        this.nextTrack();
      };
      this.musicAudio.addEventListener('error', this.musicErrorHandler);
    } else if (this.musicAudio.src !== window.location.origin + this.currentTrack.file) {
      this.musicAudio.src = this.currentTrack.file;
    }

    // Always ensure volume respects mute state before playing
    this.updateMusicVolume();
    this.musicAudio.play().catch((e) => {
      audioLog.warn('Music playback failed (user interaction required)', e);
    });
  }

  stopMusic(): void {
    if (this.musicAudio) {
      // Remove event listeners to prevent memory leak
      if (this.musicEndedHandler) {
        this.musicAudio.removeEventListener('ended', this.musicEndedHandler);
        this.musicEndedHandler = null;
      }
      if (this.musicErrorHandler) {
        this.musicAudio.removeEventListener('error', this.musicErrorHandler);
        this.musicErrorHandler = null;
      }
      this.musicAudio.pause();
      this.musicAudio.currentTime = 0;
    }
  }

  private getEffectiveVolume(): number {
    return this._muted ? 0 : this._volume;
  }

  // Create noise buffer for various industrial sounds
  // Uses pre-generated cached buffers when available to avoid blocking main thread
  private createNoiseBuffer(
    duration: number,
    type: 'white' | 'pink' | 'brown' = 'white'
  ): AudioBuffer | null {
    const ctx = this.getContext();
    if (!ctx) return null;

    // Return cached buffers for common use cases to avoid main thread blocking
    // The cached buffers are longer than needed, which is fine - we just use a portion
    if (type === 'brown' && duration <= 4 && this.cachedNoiseBuffers.brown4s) {
      return this.cachedNoiseBuffers.brown4s;
    }
    if (type === 'pink' && duration <= 4 && this.cachedNoiseBuffers.pink4s) {
      return this.cachedNoiseBuffers.pink4s;
    }
    if (type === 'white' && duration <= 1 && this.cachedNoiseBuffers.white1s) {
      return this.cachedNoiseBuffers.white1s;
    }

    // Fall back to generating a new buffer for uncached sizes/types
    const sampleRate = ctx.sampleRate;
    return this.generateNoiseBufferInternal(duration, type, sampleRate);
  }

  // === FORKLIFT SOUNDS ===

  // Play a realistic industrial air horn
  playHorn(forkliftId: string) {
    if (this.getEffectiveVolume() === 0) return;

    const now = Date.now();
    const lastPlayed = this.lastHornTime.get(forkliftId) || 0;
    if (now - lastPlayed < 800) return;
    this.lastHornTime.set(forkliftId, now);

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Create multiple oscillators for a rich air horn sound
      const frequencies = [220, 277, 330]; // A3, C#4, E4 - creates a major chord
      const gains: GainNode[] = [];
      const oscillators: OscillatorNode[] = [];

      frequencies.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Use sawtooth for richer harmonics
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq * 0.98, currentTime);
        osc.frequency.linearRampToValueAtTime(freq, currentTime + 0.05);

        // Low-pass filter for warmer sound
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, currentTime);
        filter.Q.setValueAtTime(2, currentTime);

        // Envelope
        const vol = 0.12 / frequencies.length;
        gain.gain.setValueAtTime(0, currentTime);
        gain.gain.linearRampToValueAtTime(vol, currentTime + 0.02);
        gain.gain.setValueAtTime(vol, currentTime + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.4);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(currentTime);
        osc.stop(currentTime + 0.45);

        oscillators.push(osc);
        gains.push(gain);
      });

      // Add some noise for air release
      const noiseBuffer = this.createNoiseBuffer(0.5, 'pink');
      if (!noiseBuffer) return;
      const noiseSource = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();

      noiseSource.buffer = noiseBuffer;
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(400, currentTime);
      noiseFilter.Q.setValueAtTime(1, currentTime);

      noiseGain.gain.setValueAtTime(0, currentTime);
      noiseGain.gain.linearRampToValueAtTime(0.03, currentTime + 0.02);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.4);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);

      noiseSource.start(currentTime);
      noiseSource.stop(currentTime + 0.45);
    } catch (e) {
      audioLog.warn('Click sound playback failed', e);
    }
  }

  // Play realistic backup alarm (classic industrial beeper)
  playBackupBeep(forkliftId: string) {
    if (this.getEffectiveVolume() === 0) return;

    const now = Date.now();
    const lastPlayed = this.lastBeepTime.get(forkliftId) || 0;
    if (now - lastPlayed < 600) return;
    this.lastBeepTime.set(forkliftId, now);

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Classic backup alarm - alternating tones
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Two-tone alarm
      osc1.type = 'square';
      osc1.frequency.setValueAtTime(1200, currentTime);

      osc2.type = 'square';
      osc2.frequency.setValueAtTime(1000, currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, currentTime);

      // Pulsing envelope
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.06, currentTime + 0.01);
      gain.gain.setValueAtTime(0.06, currentTime + 0.15);
      gain.gain.linearRampToValueAtTime(0, currentTime + 0.2);
      gain.gain.setValueAtTime(0, currentTime + 0.25);
      gain.gain.linearRampToValueAtTime(0.06, currentTime + 0.26);
      gain.gain.setValueAtTime(0.06, currentTime + 0.4);
      gain.gain.linearRampToValueAtTime(0, currentTime + 0.45);

      const merger = ctx.createGain();
      osc1.connect(merger);
      osc2.connect(merger);
      merger.gain.setValueAtTime(0.5, currentTime);
      merger.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc1.start(currentTime);
      osc2.start(currentTime);
      osc1.stop(currentTime + 0.5);
      osc2.stop(currentTime + 0.5);
    } catch (e) {
      audioLog.warn('Backup beep sound failed', { forkliftId }, e);
    }
  }

  // === QC LAB SOUNDS ===

  private lastLabBeepTime = 0;

  // Play lab equipment beep (soft, subtle)
  playLabEquipmentBeep() {
    if (this.getEffectiveVolume() === 0) return;

    const now = Date.now();
    if (now - this.lastLabBeepTime < 5000) return; // 5 second cooldown
    this.lastLabBeepTime = now;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Short, high-pitched beep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, currentTime);

      // Very short, subtle beep
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.05, currentTime + 0.01);
      gain.gain.setValueAtTime(0.05, currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.2);
    } catch (e) {
      audioLog.warn('Lab beep sound failed', e);
    }
  }

  // === AMBIENT FACTORY SOUNDS ===

  // Start ambient factory soundscape
  startAmbientSounds() {
    if (this.ambientNodes.machineryHum) return; // Already running

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Machinery hum - low frequency drone
      {
        const buffer = this.createNoiseBuffer(4, 'brown');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        source.buffer = buffer;
        source.loop = true;

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(120, ctx.currentTime);
        filter.Q.setValueAtTime(5, ctx.currentTime);

        gain.gain.setValueAtTime(0.08, ctx.currentTime);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start();

        this.ambientNodes.machineryHum = { source, gain };
      }

      // Conveyor belt noise - rhythmic mechanical sound
      {
        const buffer = this.createNoiseBuffer(2, 'pink');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        source.buffer = buffer;
        source.loop = true;

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(300, ctx.currentTime);
        filter.Q.setValueAtTime(2, ctx.currentTime);

        gain.gain.setValueAtTime(0.03, ctx.currentTime);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start();

        this.ambientNodes.conveyorNoise = { source, gain };
      }

      // Ventilation/HVAC - whooshing air sound
      {
        const buffer = this.createNoiseBuffer(3, 'white');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        source.buffer = buffer;
        source.loop = true;

        filter.type = 'highpass';
        filter.frequency.setValueAtTime(500, ctx.currentTime);
        filter.Q.setValueAtTime(0.5, ctx.currentTime);

        gain.gain.setValueAtTime(0.015, ctx.currentTime);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start();

        this.ambientNodes.ventilation = { source, gain };
      }

      // Grain flow through pipes - continuous subtle trickling sound
      {
        const buffer = this.createNoiseBuffer(2, 'white');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        source.buffer = buffer;
        source.loop = true;

        // High-frequency for grain-like trickling
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2500, ctx.currentTime);
        filter.Q.setValueAtTime(3, ctx.currentTime);

        gain.gain.setValueAtTime(0.012, ctx.currentTime);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        source.start();

        this.ambientNodes.grainFlow = { source, gain };
      }
    } catch (e) {
      audioLog.warn('Ambient factory sounds initialization failed', e);
    }
  }

  stopAmbientSounds() {
    Object.values(this.ambientNodes).forEach((node) => {
      if (node) {
        try {
          node.source.stop();
        } catch (e) {
          audioLog.warn('Failed to stop ambient sound node', e);
        }
      }
    });
    this.ambientNodes = {};
  }

  // === MACHINE-SPECIFIC SOUNDS ===

  // Roller mill grinding sound
  playMillSound(machineId: string, rpm: number = 1400) {
    if (this.machineNodes.has(machineId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Grinding noise with harmonic content based on RPM
      const buffer = this.createNoiseBuffer(2, 'pink');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      source.buffer = buffer;
      source.loop = true;

      // Filter frequency based on RPM
      const filterFreq = 200 + rpm / 10;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      // LFO for grinding rhythm
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(rpm / 60, ctx.currentTime); // Convert RPM to Hz
      lfoGain.gain.setValueAtTime(0.02, ctx.currentTime);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.machineNodes.set(machineId, { source, gain, filter, lfo });
    } catch (e) {
      audioLog.warn('Mill sound initialization failed', { machineId }, e);
    }
  }

  stopMillSound(machineId: string) {
    const node = this.machineNodes.get(machineId);
    if (node) {
      try {
        node.source.stop();
      } catch (e) {
        audioLog.warn('Failed to stop mill sound', { machineId }, e);
      }
      this.machineNodes.delete(machineId);
    }
  }

  // Sifter shaking sound
  playSifterSound(machineId: string, rpm: number = 200) {
    if (this.machineNodes.has(machineId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      const buffer = this.createNoiseBuffer(2, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      // Higher frequency for sifting/shaking sound
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.Q.setValueAtTime(4, ctx.currentTime);

      // Modulate gain for rhythmic shaking
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime((rpm / 60) * 2, ctx.currentTime); // Double the shake rate
      lfoGain.gain.setValueAtTime(0.015, ctx.currentTime);

      gain.gain.setValueAtTime(0.025, ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.machineNodes.set(machineId, { source, gain, filter, lfo });
    } catch (e) {
      audioLog.warn('Sifter sound initialization failed', { machineId }, e);
    }
  }

  // Packer pneumatic/mechanical sound
  playPackerSound(machineId: string) {
    if (this.machineNodes.has(machineId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Pneumatic hiss and mechanical clicks
      const buffer = this.createNoiseBuffer(3, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2000, ctx.currentTime);
      filter.Q.setValueAtTime(1, ctx.currentTime);

      // Rhythmic pneumatic pulses (simulating packaging cycles)
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(1, ctx.currentTime); // 1 package per second
      lfoGain.gain.setValueAtTime(0.02, ctx.currentTime);

      gain.gain.setValueAtTime(0.01, ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.machineNodes.set(machineId, { source, gain, filter, lfo });
    } catch (e) {
      audioLog.warn('Packer sound initialization failed', { machineId }, e);
    }
  }

  stopMachineSound(machineId: string) {
    const node = this.machineNodes.get(machineId);
    if (node) {
      try {
        node.source.stop();
        // Also stop the LFO if present
        if (node.lfo) {
          try {
            node.lfo.stop();
          } catch {
            // LFO may already be stopped
          }
        }
      } catch (e) {
        audioLog.warn('Failed to stop machine sound', { machineId }, e);
      }
      this.machineNodes.delete(machineId);
    }
  }

  /**
   * Update the pitch/speed of a running machine sound based on RPM
   * This allows smooth transitions when machine speed changes without restarting the sound
   */
  updateMachinePitch(machineId: string, rpm: number) {
    const node = this.machineNodes.get(machineId);
    if (!node || !this.audioContext) return;

    const ctx = this.audioContext;
    const currentTime = ctx.currentTime;

    // Update filter frequency based on RPM (affects perceived pitch/tone)
    if (node.filter) {
      // For mills: filter frequency scales with RPM (200 + rpm/10)
      // For sifters: filter is fixed at 800Hz, so we don't adjust it
      // We use a general formula that works reasonably for both
      const filterFreq = 200 + rpm / 10;
      node.filter.frequency.setTargetAtTime(filterFreq, currentTime, 0.1);
    }

    // Update LFO frequency based on RPM (affects rhythmic modulation)
    if (node.lfo) {
      // Convert RPM to Hz for the grinding/shaking rhythm
      const lfoFreq = rpm / 60;
      node.lfo.frequency.setTargetAtTime(lfoFreq, currentTime, 0.1);
    }
  }

  // === ONE-SHOT SOUNDS ===

  // Play a mechanical clunk (for machine state changes)
  playClunk() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, currentTime + 0.1);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, currentTime);

      gain.gain.setValueAtTime(0.15, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.2);
    } catch (e) {
      audioLog.warn('Clunk sound playback failed', e);
    }
  }

  // Alert/warning sound
  playAlert() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Two-tone alert
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        const startTime = currentTime + i * 0.2;
        osc.frequency.setValueAtTime(880, startTime);
        osc.frequency.setValueAtTime(660, startTime + 0.1);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
        gain.gain.setValueAtTime(0.08, startTime + 0.15);
        gain.gain.linearRampToValueAtTime(0, startTime + 0.18);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
      }
    } catch (e) {
      audioLog.warn('Alert sound failed', e);
    }
  }

  // Grain pouring/flowing sound
  playGrainFlow(duration: number = 1) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const buffer = this.createNoiseBuffer(duration + 0.5, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Grainy, high-frequency sound
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3000, currentTime);
      filter.Q.setValueAtTime(2, currentTime);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.05, currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, currentTime + duration);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration + 0.3);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.5);
    } catch (e) {
      audioLog.warn('Alert sound playback failed', e);
    }
  }

  // === TRUCK SOUNDS ===

  // Truck engine idle/running sound
  private truckEngines: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();

  startTruckEngine(truckId: string, isMoving: boolean = false) {
    if (this.truckEngines.has(truckId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Deep rumbling engine sound
      const buffer = this.createNoiseBuffer(3, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      source.buffer = buffer;
      source.loop = true;

      // Low frequency for diesel engine rumble
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isMoving ? 150 : 80, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      // LFO for engine rhythm
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(isMoving ? 25 : 15, ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.01, ctx.currentTime);

      gain.gain.setValueAtTime(isMoving ? 0.04 : 0.025, ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.truckEngines.set(truckId, { source, gain });
    } catch (e) {
      audioLog.warn('Grain flow sound playback failed', e);
    }
  }

  updateTruckEngine(truckId: string, isMoving: boolean) {
    const engine = this.truckEngines.get(truckId);
    if (engine && this.audioContext) {
      const targetGain = isMoving ? 0.04 : 0.025;
      engine.gain.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.3);
    }
  }

  stopTruckEngine(truckId: string) {
    const engine = this.truckEngines.get(truckId);
    if (engine) {
      try {
        engine.source.stop();
      } catch (e) {
        audioLog.warn('Truck engine start failed', { truckId }, e);
      }
      this.truckEngines.delete(truckId);
    }
  }

  // Truck air brake release
  playAirBrake() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const buffer = this.createNoiseBuffer(0.8, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1500, currentTime);
      filter.frequency.exponentialRampToValueAtTime(500, currentTime + 0.5);

      gain.gain.setValueAtTime(0.08, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.6);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + 0.7);
    } catch (e) {
      audioLog.warn('Air brake sound failed', e);
    }
  }

  // Backup beeper for trucks reversing
  private backupBeepers: Map<
    string,
    { oscillator: OscillatorNode; gain: GainNode; interval: number | NodeJS.Timeout }
  > = new Map();

  startBackupBeeper(truckId: string) {
    if (this.backupBeepers.has(truckId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(1200, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);

      oscillator.connect(gain);
      gain.connect(masterGain);
      oscillator.start();

      // Beep pattern: on for 0.3s, off for 0.5s - only beep twice then stop
      let beepCount = 0;
      const maxBeeps = 2;
      let isOn = false;

      const interval = setInterval(
        () => {
          if (!this.audioContext) return;
          isOn = !isOn;
          gain.gain.setTargetAtTime(isOn ? 0.03 : 0, this.audioContext.currentTime, 0.01);

          // Count completed beeps (when turning off after being on)
          if (!isOn) {
            beepCount++;
            if (beepCount >= maxBeeps) {
              this.stopBackupBeeper(truckId);
            }
          }
        },
        isOn ? 300 : 500
      );

      this.backupBeepers.set(truckId, { oscillator, gain, interval });
    } catch (e) {
      audioLog.warn('Backup beeper start failed', e);
    }
  }

  stopBackupBeeper(truckId: string) {
    const beeper = this.backupBeepers.get(truckId);
    if (beeper) {
      try {
        clearInterval(beeper.interval as number);
        beeper.oscillator.stop();
      } catch (e) {
        audioLog.warn('Backup beeper stop failed', e);
      }
      this.backupBeepers.delete(truckId);
    }
  }

  // === FOOTSTEP SOUNDS ===

  private lastFootstepTime: Map<string, number> = new Map();

  playFootstep(workerId: string) {
    if (this.getEffectiveVolume() === 0) return;

    const now = Date.now();
    const lastPlayed = this.lastFootstepTime.get(workerId) || 0;
    if (now - lastPlayed < 280) return; // Limit footstep rate
    this.lastFootstepTime.set(workerId, now);

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Soft boot on concrete sound
      const buffer = this.createNoiseBuffer(0.15, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Random variation in pitch for natural feel
      const pitchVar = 0.8 + Math.random() * 0.4;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(200 * pitchVar, currentTime);
      filter.Q.setValueAtTime(2, currentTime);

      // Quick attack, fast decay
      const vol = 0.015 + Math.random() * 0.008;
      gain.gain.setValueAtTime(vol, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + 0.1);
    } catch (e) {
      audioLog.warn('Clunk sound playback failed', e);
    }
  }

  // === AI DECISION SOUNDS ===

  // AI critical decision alert sound
  playAICriticalAlert() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Triple ascending beep with urgency
      const notes = [440, 554, 698]; // A4, C#5, F5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
        gain.gain.setValueAtTime(0.08, startTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.11);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.15);
      });
    } catch (e) {
      audioLog.warn('AI critical alert sound failed', e);
    }
  }

  // AI decision notification sound (subtle)
  playAIDecision() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Soft double-blip like a computer thinking
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, currentTime);
      osc.frequency.setValueAtTime(1047, currentTime + 0.08);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.04, currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0.02, currentTime + 0.06);
      gain.gain.linearRampToValueAtTime(0.04, currentTime + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.18);
    } catch (e) {
      audioLog.warn('AI decision sound failed', e);
    }
  }

  // AI anomaly detection sound
  playAIAnomaly() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Warning-like wobble sound
      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, currentTime);

      // LFO for wobble effect
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(15, currentTime);
      lfoGain.gain.setValueAtTime(30, currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.06, currentTime + 0.05);
      gain.gain.setValueAtTime(0.06, currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.5);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      lfo.start(currentTime);
      osc.stop(currentTime + 0.55);
      lfo.stop(currentTime + 0.55);
    } catch (e) {
      audioLog.warn('AI anomaly sound failed', e);
    }
  }

  // AI success chime (for completed decisions)
  playAISuccess() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Pleasant ascending arpeggio
      const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.06;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.03, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } catch (e) {
      audioLog.warn('AI success sound failed', e);
    }
  }

  // === UI SOUNDS ===

  // Click sound for UI interactions
  playClick() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, currentTime + 0.05);

      gain.gain.setValueAtTime(0.08, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.06);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.08);
    } catch (e) {
      audioLog.warn('UI click sound failed', e);
    }
  }

  // Hover sound (subtle)
  playHover() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, currentTime);

      gain.gain.setValueAtTime(0.02, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.03);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.04);
    } catch (e) {
      audioLog.warn('Hover sound failed', e);
    }
  }

  // Panel open/close sound
  playPanelOpen() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, currentTime);
      osc.frequency.exponentialRampToValueAtTime(500, currentTime + 0.1);

      gain.gain.setValueAtTime(0.05, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.12);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.15);
    } catch (e) {
      audioLog.warn('Panel open sound failed', e);
    }
  }

  playPanelClose() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, currentTime + 0.1);

      gain.gain.setValueAtTime(0.05, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.12);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.15);
    } catch (e) {
      audioLog.warn('Panel close sound failed', e);
    }
  }

  // Resume audio context if suspended (needed for user interaction requirement)
  async resume() {
    // Mark as initialized - this allows getContext() to create the AudioContext
    this._initialized = true;
    console.log('[MillOS TTS] resume() called - initializing audio');

    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
      console.log('[MillOS TTS] AudioContext resumed');
    }

    // Initialize TTS during user gesture (required for mobile browsers)
    // Mobile browsers require speechSynthesis to be "primed" from a user interaction
    this.initTTSVoice();

    // iOS Safari workaround: "warm up" speech synthesis with a silent utterance
    // This ensures the first real announcement can play without gesture restrictions
    if ('speechSynthesis' in window) {
      console.log('[MillOS TTS] Priming speechSynthesis for mobile');

      // Cancel any stuck state (iOS Safari bug)
      window.speechSynthesis.cancel();

      // Prime with a near-silent short utterance (empty string doesn't work on all browsers)
      const primer = new SpeechSynthesisUtterance(' ');
      primer.volume = 0.01; // Near-silent but not zero (zero might be ignored)
      primer.rate = 10; // Fastest possible to minimize any audible output
      window.speechSynthesis.speak(primer);

      // Give iOS a moment to register the speak before canceling
      setTimeout(() => {
        window.speechSynthesis.cancel();
        console.log('[MillOS TTS] Primer cancelled, speechSynthesis should be unlocked');
      }, 100);
    }
  }

  // === SPATIAL AUDIO SUPPORT ===

  // Update camera position for spatial audio calculations
  updateCameraPosition(x: number, y: number, z: number) {
    this.cameraPosition = { x, y, z };
    // Update ambient factory sounds based on distance from factory
    this.updateAmbientSpatialVolumes();
  }

  // Update ambient factory sound volumes based on distance from factory center
  private updateAmbientSpatialVolumes() {
    if (!this.audioContext) return;

    // Calculate distance from factory center
    const dx = this.cameraPosition.x - this.FACTORY_CENTER.x;
    const dy = this.cameraPosition.y - this.FACTORY_CENTER.y;
    const dz = this.cameraPosition.z - this.FACTORY_CENTER.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Calculate attenuation factor (1.0 at center, 0.0 at max distance)
    // Use squared falloff for more natural sound attenuation
    const attenuation = Math.max(0, 1 - distance / this.FACTORY_AMBIENT_MAX_DISTANCE);
    const attenuationSquared = attenuation * attenuation;

    const currentTime = this.audioContext.currentTime;
    const rampTime = 0.3; // Smooth transition over 300ms

    // Apply attenuation to each ambient sound layer
    if (this.ambientNodes.machineryHum?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.machineryHum * attenuationSquared;
      this.ambientNodes.machineryHum.gain.gain.setTargetAtTime(targetVolume, currentTime, rampTime);
    }

    if (this.ambientNodes.conveyorNoise?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.conveyorNoise * attenuationSquared;
      this.ambientNodes.conveyorNoise.gain.gain.setTargetAtTime(targetVolume, currentTime, rampTime);
    }

    if (this.ambientNodes.ventilation?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.ventilation * attenuationSquared;
      this.ambientNodes.ventilation.gain.gain.setTargetAtTime(targetVolume, currentTime, rampTime);
    }

    if (this.ambientNodes.grainFlow?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.grainFlow * attenuationSquared;
      this.ambientNodes.grainFlow.gain.gain.setTargetAtTime(targetVolume, currentTime, rampTime);
    }
  }

  // Register a sound source position
  registerSoundPosition(id: string, x: number, y: number, z: number) {
    this.soundPositions.set(id, { x, y, z });
  }

  // Calculate volume attenuation based on distance from camera
  private calculateSpatialVolume(
    sourceId: string,
    baseVolume: number,
    maxDistance: number = 50
  ): number {
    const sourcePos = this.soundPositions.get(sourceId);
    if (!sourcePos) return baseVolume;

    const dx = sourcePos.x - this.cameraPosition.x;
    const dy = sourcePos.y - this.cameraPosition.y;
    const dz = sourcePos.z - this.cameraPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Inverse distance falloff with minimum
    const attenuation = Math.max(0, 1 - distance / maxDistance);
    return baseVolume * attenuation * attenuation; // Squared for more natural falloff
  }

  // Update machine sound volume based on camera distance
  updateMachineSpatialVolume(machineId: string) {
    const node = this.machineNodes.get(machineId);
    if (node && this.audioContext) {
      const spatialGain = this.calculateSpatialVolume(machineId, 0.04, 35);
      node.gain.gain.setTargetAtTime(spatialGain, this.audioContext.currentTime, 0.2);
    }
  }

  // === WORKER VOICE SOUNDS ===

  private workerVoiceActive: boolean = false;
  private workerVoiceInterval: NodeJS.Timeout | number | null = null;

  startWorkerVoices() {
    if (this.workerVoiceActive) return;
    this.workerVoiceActive = true;

    const playRandomVoice = () => {
      if (!this.workerVoiceActive || this.getEffectiveVolume() === 0) return;

      // Skip playback when tab hidden but keep scheduling to resume when visible
      if (this._isTabVisible) {
        const voiceType = Math.random();
        if (voiceType < 0.35) {
          this.playWorkerShout();
        } else if (voiceType < 0.6) {
          this.playWorkerWhistle();
        } else {
          this.playWorkerCall();
        }
      }

      // Schedule next voice (15-45 seconds)
      const nextDelay = 15000 + Math.random() * 30000;
      this.workerVoiceInterval = setTimeout(playRandomVoice, nextDelay);
    };

    // Start with a delay
    this.workerVoiceInterval = setTimeout(playRandomVoice, 10000 + Math.random() * 15000);
  }

  stopWorkerVoices() {
    this.workerVoiceActive = false;
    if (this.workerVoiceInterval) {
      clearTimeout(this.workerVoiceInterval);
      this.workerVoiceInterval = null;
    }
  }

  // Worker shout sound (like "Hey!" or "Clear!")
  private playWorkerShout() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Create a voice-like sound using formants
      const fundamentalFreq = 150 + Math.random() * 100; // Male voice range

      // Multiple oscillators for formant simulation
      const formants = [
        { freq: fundamentalFreq, gain: 0.3 },
        { freq: fundamentalFreq * 2, gain: 0.15 },
        { freq: 700 + Math.random() * 300, gain: 0.1 }, // First formant
        { freq: 1200 + Math.random() * 400, gain: 0.05 }, // Second formant
      ];

      const duration = 0.2 + Math.random() * 0.15;

      formants.forEach(({ freq, gain: formantGain }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, currentTime);
        // Pitch drop for natural speech
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, currentTime + duration);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, currentTime);

        gain.gain.setValueAtTime(0, currentTime);
        gain.gain.linearRampToValueAtTime(formantGain * 0.015, currentTime + 0.02);
        gain.gain.setValueAtTime(formantGain * 0.015, currentTime + duration * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(currentTime);
        osc.stop(currentTime + duration + 0.1);
      });
    } catch (e) {
      audioLog.warn('Failed to stop worker voices', e);
    }
  }

  // Worker whistle (attention-getting)
  private playWorkerWhistle() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Two-tone whistle
      osc.frequency.setValueAtTime(1200, currentTime);
      osc.frequency.setValueAtTime(1600, currentTime + 0.15);
      osc.frequency.setValueAtTime(1200, currentTime + 0.3);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.02, currentTime + 0.02);
      gain.gain.setValueAtTime(0.02, currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.5);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.55);
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // Worker call (muffled distant voice)
  private playWorkerCall() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Use noise filtered to sound like distant muffled speech
      const duration = 0.4 + Math.random() * 0.3;
      const buffer = this.createNoiseBuffer(duration + 0.2, 'pink');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Bandpass for voice-like quality
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400 + Math.random() * 200, currentTime);
      filter.Q.setValueAtTime(3, currentTime);

      // Syllable-like envelope
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.012, currentTime + 0.03);
      gain.gain.linearRampToValueAtTime(0.006, currentTime + duration * 0.3);
      gain.gain.linearRampToValueAtTime(0.012, currentTime + duration * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.1);
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // === TIME-OF-DAY AUDIO ===

  private currentTimeOfDay: 'day' | 'night' = 'day';
  private isDuskCricketTime: boolean = false;

  // Update ambient sounds based on game time (0-24)
  updateTimeOfDay(gameTime: number) {
    const isNight = gameTime < 6 || gameTime > 20;
    const newTimeOfDay = isNight ? 'night' : 'day';

    // Late dusk window for cricket chirps (19:30 to 21:00 only)
    const isDusk = gameTime >= 19.5 && gameTime <= 21;

    if (newTimeOfDay !== this.currentTimeOfDay) {
      this.currentTimeOfDay = newTimeOfDay;
      this.adjustAmbientForTimeOfDay();
    }

    // Crickets only during late dusk window
    if (isDusk !== this.isDuskCricketTime) {
      this.isDuskCricketTime = isDusk;
      if (isDusk) {
        this.startNightAmbient();
      } else {
        this.stopNightAmbient();
      }
    }
  }

  private adjustAmbientForTimeOfDay() {
    if (!this.audioContext) return;
    const currentTime = this.audioContext.currentTime;

    // Adjust outdoor sounds for day/night
    if (this.outdoorNodes.birds) {
      // Birds quieter at night (base volume is now 0.002)
      const birdVolume = this.currentTimeOfDay === 'night' ? 0.0005 : 0.002;
      this.outdoorNodes.birds.gain.gain.setTargetAtTime(birdVolume, currentTime, 2);
    }

    if (this.outdoorNodes.wind) {
      // Wind slightly louder at night (quieter environment makes it more noticeable)
      const windVolume = this.currentTimeOfDay === 'night' ? 0.018 : 0.012;
      this.outdoorNodes.wind.gain.gain.setTargetAtTime(windVolume, currentTime, 2);
    }

    if (this.outdoorNodes.traffic) {
      // Less traffic at night
      const trafficVolume = this.currentTimeOfDay === 'night' ? 0.008 : 0.015;
      this.outdoorNodes.traffic.gain.gain.setTargetAtTime(trafficVolume, currentTime, 2);
    }

    // Note: Cricket sounds are now handled separately by isDuskCricketTime logic
  }

  private nightAmbientInterval: NodeJS.Timeout | number | null = null;

  private startNightAmbient() {
    if (this.nightAmbientInterval) return;

    const playCrickets = () => {
      if (this.currentTimeOfDay !== 'night' || this.getEffectiveVolume() === 0) return;
      // Skip playback when tab hidden
      if (!this._isTabVisible) return;
      this.playCricketChirp();
    };

    // Cricket chirps every 15-30 seconds (sparse, occasional ambiance)
    this.nightAmbientInterval = setInterval(playCrickets, 15000 + Math.random() * 15000);
  }

  private stopNightAmbient() {
    if (this.nightAmbientInterval) {
      clearInterval(this.nightAmbientInterval);
      this.nightAmbientInterval = null;
    }
  }

  private playCricketChirp() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Cricket chirp is a rapid series of high-frequency pulses
      const chirpCount = 3 + Math.floor(Math.random() * 3);
      const baseFreq = 4000 + Math.random() * 1000;

      for (let i = 0; i < chirpCount; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.008, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.05);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.06);
      }
    } catch (e) {
      audioLog.warn('Time of day audio update failed', e);
    }
  }

  // === CONVEYOR SPATIAL AUDIO ===

  private conveyorNodes: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();

  startConveyorSound(conveyorId: string, x: number, y: number, z: number) {
    if (this.conveyorNodes.has(conveyorId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Continuous belt/roller sound
      const buffer = this.createNoiseBuffer(3, 'pink');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      // Mid-frequency mechanical sound
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(350, ctx.currentTime);
      filter.Q.setValueAtTime(2, ctx.currentTime);

      gain.gain.setValueAtTime(0.015, ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start();

      this.conveyorNodes.set(conveyorId, { source, gain });
      this.registerSoundPosition(conveyorId, x, y, z);
    } catch (e) {
      audioLog.warn('Conveyor sound start failed', { conveyorId }, e);
    }
  }

  updateConveyorSpatialVolume(conveyorId: string) {
    const node = this.conveyorNodes.get(conveyorId);
    if (node && this.audioContext) {
      const spatialGain = this.calculateSpatialVolume(conveyorId, 0.015, 30);
      node.gain.gain.setTargetAtTime(spatialGain, this.audioContext.currentTime, 0.2);
    }
  }

  stopConveyorSound(conveyorId: string) {
    const node = this.conveyorNodes.get(conveyorId);
    if (node) {
      try {
        node.source.stop();
      } catch (e) {
        audioLog.warn('Failed to stop conveyor sound', { conveyorId }, e);
      }
      this.conveyorNodes.delete(conveyorId);
    }
  }

  // === TRUCK ARRIVAL/DEPARTURE SOUNDS ===

  // Truck arrival fanfare (air brakes + horn)
  playTruckArrival() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Deep truck horn (two-tone)
      const hornFreqs = [180, 220];
      hornFreqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, currentTime);
        filter.Q.setValueAtTime(2, currentTime);

        gain.gain.setValueAtTime(0, currentTime);
        gain.gain.linearRampToValueAtTime(0.06, currentTime + 0.05);
        gain.gain.setValueAtTime(0.06, currentTime + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.6);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(currentTime);
        osc.stop(currentTime + 0.65);
      });

      // Air brake release after horn
      setTimeout(() => this.playAirBrake(), 700);
    } catch (e) {
      audioLog.warn('Air brake sound failed', e);
    }
  }

  // Truck departure sound (engine rev + release)
  playTruckDeparture() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Engine rev up
      const buffer = this.createNoiseBuffer(2, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      filter.type = 'lowpass';
      // Frequency ramps up as engine revs
      filter.frequency.setValueAtTime(80, currentTime);
      filter.frequency.linearRampToValueAtTime(200, currentTime + 0.8);
      filter.frequency.linearRampToValueAtTime(150, currentTime + 1.5);
      filter.Q.setValueAtTime(4, currentTime);

      gain.gain.setValueAtTime(0.02, currentTime);
      gain.gain.linearRampToValueAtTime(0.06, currentTime + 0.8);
      gain.gain.linearRampToValueAtTime(0.03, currentTime + 1.5);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 2);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + 2.1);
    } catch (e) {
      audioLog.warn('Truck departure sound failed', e);
    }
  }

  // Standalone truck horn blast (for departures or warnings)
  playTruckHorn(truckId: string, isLong: boolean = false) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const duration = isLong ? 1.2 : 0.5;

      // Two-tone air horn (classic semi-truck sound)
      const hornFreqs = [180, 220]; // Low and high tones
      hornFreqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        // Main tone
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, currentTime);

        // Slight detuning for richness
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq * 1.003, currentTime);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, currentTime);
        filter.Q.setValueAtTime(2, currentTime);

        // Envelope
        gain.gain.setValueAtTime(0, currentTime);
        gain.gain.linearRampToValueAtTime(0.08, currentTime + 0.03);
        gain.gain.setValueAtTime(0.08, currentTime + duration - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(currentTime);
        osc.stop(currentTime + duration + 0.1);
        osc2.start(currentTime);
        osc2.stop(currentTime + duration + 0.1);
      });

      audioLog.info('Truck horn played', { truckId, isLong });
    } catch (e) {
      audioLog.warn('Truck horn sound failed', { truckId }, e);
    }
  }

  // Jake brake (engine compression braking) - loud rattling exhaust sound
  playJakeBrake(truckId: string, duration: number = 2) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Create the distinctive jake brake rumble
      const buffer = this.createNoiseBuffer(duration + 0.5, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      source.buffer = buffer;

      // Low frequency with heavy modulation for the staccato effect
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(120, currentTime);
      filter.Q.setValueAtTime(8, currentTime);

      // LFO creates the rapid "brapping" sound
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(25, currentTime); // Rapid pulsing

      lfoGain.gain.setValueAtTime(0.03, currentTime);

      // Volume envelope
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.1, currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, currentTime + duration - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.1);
      lfo.start(currentTime);
      lfo.stop(currentTime + duration + 0.1);

      audioLog.info('Jake brake played', { truckId, duration });
    } catch (e) {
      audioLog.warn('Jake brake sound failed', { truckId }, e);
    }
  }

  // Tire squeal (during tight turns)
  playTireSqueal(vehicleId: string, intensity: number = 0.5) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const duration = 0.8 + intensity * 0.5;

      // High-pitched friction sound
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Screaming tire frequencies
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(800 + Math.random() * 200, currentTime);
      osc1.frequency.linearRampToValueAtTime(600 + Math.random() * 100, currentTime + duration);

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(1200 + Math.random() * 300, currentTime);
      osc2.frequency.linearRampToValueAtTime(900 + Math.random() * 150, currentTime + duration);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2000, currentTime);
      filter.Q.setValueAtTime(3, currentTime);

      // Volume envelope
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.04 * intensity, currentTime + 0.05);
      gain.gain.setValueAtTime(0.04 * intensity, currentTime + duration * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc1.start(currentTime);
      osc1.stop(currentTime + duration + 0.1);
      osc2.start(currentTime);
      osc2.stop(currentTime + duration + 0.1);
    } catch (e) {
      audioLog.warn('Tire squeal sound failed', { vehicleId }, e);
    }
  }

  // Diesel pump clicking at fuel island
  playDieselPumpClick() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Mechanical clicking sound of fuel pump meter
      const clickCount = 8 + Math.floor(Math.random() * 5);
      for (let i = 0; i < clickCount; i++) {
        const startTime = currentTime + i * 0.12 + Math.random() * 0.03;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1500 + Math.random() * 300, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.015, startTime + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.04);
      }

      // Add the fuel flow hiss
      const buffer = this.createNoiseBuffer(1.5, 'white');
      if (buffer) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        source.buffer = buffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(4000, currentTime);
        filter.Q.setValueAtTime(2, currentTime);

        gain.gain.setValueAtTime(0, currentTime);
        gain.gain.linearRampToValueAtTime(0.008, currentTime + 0.1);
        gain.gain.setValueAtTime(0.008, currentTime + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 1.5);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        source.start(currentTime);
        source.stop(currentTime + 1.6);
      }
    } catch (e) {
      audioLog.warn('Diesel pump click sound failed', e);
    }
  }

  // Glad hands air hiss when connecting/disconnecting
  playGladHandsHiss() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Air hiss sound - shorter than air brake release
      const buffer = this.createNoiseBuffer(0.8, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(3000, currentTime);
      filter.Q.setValueAtTime(1, currentTime);

      // Quick burst then fade
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.06, currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.02, currentTime + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.7);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + 0.8);

      // Metallic clunk when coupling
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      const oscFilter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, currentTime + 0.1);

      oscFilter.type = 'lowpass';
      oscFilter.frequency.setValueAtTime(300, currentTime);

      oscGain.gain.setValueAtTime(0.08, currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15);

      osc.connect(oscFilter);
      oscFilter.connect(oscGain);
      oscGain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.2);
    } catch (e) {
      audioLog.warn('Glad hands hiss sound failed', e);
    }
  }

  // Pallet jack warning beeps
  playPalletJackBeep() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Two quick beeps
      for (let i = 0; i < 2; i++) {
        const startTime = currentTime + i * 0.2;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(2800, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.03, startTime + 0.01);
        gain.gain.setValueAtTime(0.03, startTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.16);
      }
    } catch (e) {
      audioLog.warn('Pallet jack beep sound failed', e);
    }
  }

  // Scale ticket printer sound
  playScaleTicketPrinter() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Dot matrix printer sound - rapid clicking
      const clickCount = 15;
      for (let i = 0; i < clickCount; i++) {
        const startTime = currentTime + i * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(2000 + Math.random() * 500, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.02, startTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.05);
      }

      // Paper feed sound at the end
      setTimeout(
        () => {
          const buffer = this.createNoiseBuffer(0.3, 'white');
          if (!buffer) return;
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          source.buffer = buffer;
          filter.type = 'highpass';
          filter.frequency.setValueAtTime(3000, ctx.currentTime);

          gain.gain.setValueAtTime(0.015, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

          source.connect(filter);
          filter.connect(gain);
          gain.connect(masterGain);

          source.start(ctx.currentTime);
          source.stop(ctx.currentTime + 0.3);
        },
        clickCount * 80 + 100
      );

      audioLog.info('Scale ticket printer sound played');
    } catch (e) {
      audioLog.warn('Scale ticket printer sound failed', e);
    }
  }

  // === FORKLIFT ENGINE SOUNDS ===

  startForkliftEngine(forkliftId: string) {
    if (this.forkliftEngines.has(forkliftId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Deep rumbling diesel engine sound
      const buffer = this.createNoiseBuffer(4, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      source.buffer = buffer;
      source.loop = true;

      // Low frequency engine rumble
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, ctx.currentTime);
      filter.Q.setValueAtTime(4, ctx.currentTime);

      // LFO for engine idle rhythm (irregular idle)
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(8 + Math.random() * 2, ctx.currentTime);
      lfoGain.gain.setValueAtTime(0.008, ctx.currentTime);

      gain.gain.setValueAtTime(0.02, ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.forkliftEngines.set(forkliftId, { source, gain, lfo });
    } catch (e) {
      audioLog.warn('Forklift engine start failed', { forkliftId }, e);
    }
  }

  updateForkliftEngine(forkliftId: string, isMoving: boolean, isStopped: boolean) {
    const engine = this.forkliftEngines.get(forkliftId);
    if (engine && this.audioContext) {
      // Adjust volume based on movement state and spatial position
      let targetGain = isMoving ? 0.035 : 0.02;
      if (isStopped) targetGain = 0.025; // Slightly louder when stopped (safety horn was honked)

      // Apply spatial attenuation
      const spatialGain = this.calculateSpatialVolume(forkliftId, targetGain, 40);
      engine.gain.gain.setTargetAtTime(spatialGain, this.audioContext.currentTime, 0.3);

      // Adjust LFO frequency based on movement
      const targetFreq = isMoving ? 12 : 8;
      engine.lfo.frequency.setTargetAtTime(targetFreq, this.audioContext.currentTime, 0.5);
    }
  }

  stopForkliftEngine(forkliftId: string) {
    const engine = this.forkliftEngines.get(forkliftId);
    if (engine) {
      try {
        engine.source.stop();
        engine.lfo.stop();
      } catch (e) {
        audioLog.warn('Failed to stop forklift engine', { forkliftId }, e);
      }
      this.forkliftEngines.delete(forkliftId);
    }
  }

  // === RADIO CHATTER SOUNDS ===

  startRadioChatter() {
    if (this.radioChatterActive) return;
    this.radioChatterActive = true;

    // Play random radio sounds at random intervals
    const playRandomChatter = () => {
      if (!this.radioChatterActive || this.getEffectiveVolume() === 0) return;

      // Skip playback when tab hidden but keep scheduling to resume when visible
      if (this._isTabVisible) {
        const chatterType = Math.random();
        if (chatterType < 0.4) {
          this.playRadioStatic();
        } else if (chatterType < 0.7) {
          this.playRadioBeep();
        } else {
          this.playRadioSquelch();
        }
      }

      // Schedule next chatter (8-25 seconds)
      const nextDelay = 8000 + Math.random() * 17000;
      this.radioChatterInterval = setTimeout(playRandomChatter, nextDelay);
    };

    // Start with a delay
    this.radioChatterInterval = setTimeout(playRandomChatter, 5000 + Math.random() * 10000);
  }

  stopRadioChatter() {
    this.radioChatterActive = false;
    if (this.radioChatterInterval) {
      clearTimeout(this.radioChatterInterval);
      this.radioChatterInterval = null;
    }
  }

  // Radio static burst
  private playRadioStatic() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const duration = 0.3 + Math.random() * 0.4;
      const buffer = this.createNoiseBuffer(duration + 0.2, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Radio-like bandpass filter
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, currentTime);
      filter.Q.setValueAtTime(5, currentTime);

      // Quick fade in/out
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.015, currentTime + 0.02);
      gain.gain.setValueAtTime(0.015, currentTime + duration);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration + 0.1);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.2);
    } catch (e) {
      audioLog.warn('Failed to stop radio chatter', e);
    }
  }

  // Radio acknowledgment beep
  private playRadioBeep() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Double beep
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.025, startTime + 0.01);
        gain.gain.setValueAtTime(0.025, startTime + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.1);
      }
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // Radio squelch sound (click when releasing talk button)
  private playRadioSquelch() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Squelch is a brief burst of noise followed by silence
      const buffer = this.createNoiseBuffer(0.15, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      filter.type = 'highpass';
      filter.frequency.setValueAtTime(800, currentTime);
      filter.frequency.exponentialRampToValueAtTime(3000, currentTime + 0.08);

      gain.gain.setValueAtTime(0.02, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.1);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + 0.15);
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // === OUTDOOR AMBIENT SOUNDS ===

  startOutdoorAmbient() {
    if (this.outdoorNodes.birds) return; // Already running

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Bird sounds - gentle background birdsong (less rhythmic, more natural)
      {
        const buffer = this.createNoiseBuffer(6, 'white');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        source.buffer = buffer;
        source.loop = true;

        // Wider bandpass for softer, less piercing bird ambience
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2800, ctx.currentTime);
        filter.Q.setValueAtTime(3, ctx.currentTime); // Lower Q = less harsh

        // Very slow modulation for gentle warbling, not rhythmic chirping
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.3 + Math.random() * 0.2, ctx.currentTime); // 0.3-0.5Hz
        lfoGain.gain.setValueAtTime(0.002, ctx.currentTime); // Subtle modulation

        gain.gain.setValueAtTime(0.002, ctx.currentTime); // Quieter base volume

        source.connect(filter);
        filter.connect(gain);
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        gain.connect(masterGain);

        source.start();
        lfo.start();

        this.outdoorNodes.birds = { source, gain };
      }

      // Wind - gentle whooshing
      {
        const buffer = this.createNoiseBuffer(8, 'pink');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        source.buffer = buffer;
        source.loop = true;

        // Low-mid frequency for wind
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, ctx.currentTime);
        filter.Q.setValueAtTime(0.5, ctx.currentTime);

        // Slow modulation for gusting
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
        lfoGain.gain.setValueAtTime(0.008, ctx.currentTime);

        gain.gain.setValueAtTime(0.012, ctx.currentTime);

        source.connect(filter);
        filter.connect(gain);
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        gain.connect(masterGain);

        source.start();
        lfo.start();

        this.outdoorNodes.wind = { source, gain };
      }

      // Distant traffic - very low rumble
      {
        const buffer = this.createNoiseBuffer(5, 'brown');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        source.buffer = buffer;
        source.loop = true;

        // Very low frequency for distant traffic rumble
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(80, ctx.currentTime);
        filter.Q.setValueAtTime(2, ctx.currentTime);

        gain.gain.setValueAtTime(0.015, ctx.currentTime);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        source.start();

        this.outdoorNodes.traffic = { source, gain };
      }

      // Water/stream - gentle babbling brook
      {
        const buffer = this.createNoiseBuffer(6, 'white');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        source.buffer = buffer;
        source.loop = true;

        // Bandpass for water-like frequencies (1-3kHz range)
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, ctx.currentTime);
        filter.Q.setValueAtTime(1.5, ctx.currentTime);

        // Irregular modulation for natural water gurgling
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(2.5 + Math.random() * 1.5, ctx.currentTime);
        lfoGain.gain.setValueAtTime(0.003, ctx.currentTime);

        gain.gain.setValueAtTime(0.006, ctx.currentTime); // Quiet stream

        source.connect(filter);
        filter.connect(gain);
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        gain.connect(masterGain);

        source.start();
        lfo.start();

        this.outdoorNodes.water = { source, gain };
      }

      // Ducks - occasional quacking (higher pitched, rhythmic bursts)
      {
        const buffer = this.createNoiseBuffer(4, 'white');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        source.buffer = buffer;
        source.loop = true;

        // Nasal, honky quality - mid-high frequencies
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, ctx.currentTime);
        filter.Q.setValueAtTime(8, ctx.currentTime); // Narrow band for quack character

        // Quick modulation for quacking rhythm (~3-5 quacks per second feel)
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(0.4 + Math.random() * 0.3, ctx.currentTime); // Irregular timing
        lfoGain.gain.setValueAtTime(0.0015, ctx.currentTime);

        gain.gain.setValueAtTime(0.0008, ctx.currentTime); // Very quiet, background

        source.connect(filter);
        filter.connect(gain);
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        gain.connect(masterGain);

        source.start();
        lfo.start();

        this.outdoorNodes.ducks = { source, gain };
      }

      // Pigs - soft grunting (low frequency, rhythmic)
      {
        const buffer = this.createNoiseBuffer(5, 'brown');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        source.buffer = buffer;
        source.loop = true;

        // Low, throaty frequencies for grunting
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, ctx.currentTime);
        filter.Q.setValueAtTime(3, ctx.currentTime);

        // Slow, irregular modulation for natural grunt timing
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.8 + Math.random() * 0.4, ctx.currentTime);
        lfoGain.gain.setValueAtTime(0.002, ctx.currentTime);

        gain.gain.setValueAtTime(0.0012, ctx.currentTime); // Quiet background

        source.connect(filter);
        filter.connect(gain);
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        gain.connect(masterGain);

        source.start();
        lfo.start();

        this.outdoorNodes.pigs = { source, gain };
      }

      // Cows - distant mooing (very low, slow, resonant)
      {
        const buffer = this.createNoiseBuffer(8, 'brown');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();

        source.buffer = buffer;
        source.loop = true;

        // Very low, resonant moo frequency
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(150, ctx.currentTime);
        filter.Q.setValueAtTime(5, ctx.currentTime); // Resonant

        // Very slow modulation - occasional moo (once every few seconds)
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.15 + Math.random() * 0.1, ctx.currentTime);
        lfoGain.gain.setValueAtTime(0.001, ctx.currentTime);

        gain.gain.setValueAtTime(0.0008, ctx.currentTime); // Distant, quiet

        source.connect(filter);
        filter.connect(gain);
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        gain.connect(masterGain);

        source.start();
        lfo.start();

        this.outdoorNodes.cows = { source, gain };
      }
    } catch (e) {
      audioLog.warn('Outdoor ambient sound start failed', e);
    }
  }

  stopOutdoorAmbient() {
    Object.values(this.outdoorNodes).forEach((node) => {
      if (node) {
        try {
          node.source.stop();
        } catch (e) {
          audioLog.warn('Failed to stop outdoor ambient', e);
        }
      }
    });
    this.outdoorNodes = {};
  }

  // === TOWN HALL CLOCK CHIME ===

  // Town hall clock position (world coordinates) - at [-190, 12, 20]
  private readonly TOWN_HALL_CLOCK_POS = { x: -190, y: 12, z: 20 };
  private readonly CLOCK_CHIME_MAX_DISTANCE = 60; // Units before sound is inaudible
  private lastClockChimeHour = -1;

  /**
   * Play a soft, gentle clock bong for the town hall clock.
   * Distance-attenuated so it doesn't travel far.
   * @param hour - The game hour (0-23)
   * @param chimeCount - Number of bongs (1-12, automatically wraps for 24h clock)
   */
  playClockChime(hour: number, chimeCount?: number): void {
    if (this.getEffectiveVolume() === 0) return;

    // Prevent duplicate chimes for same hour
    const roundedHour = Math.floor(hour);
    if (roundedHour === this.lastClockChimeHour) return;
    this.lastClockChimeHour = roundedHour;

    // Calculate distance-based volume attenuation
    const dx = this.cameraPosition.x - this.TOWN_HALL_CLOCK_POS.x;
    const dy = this.cameraPosition.y - this.TOWN_HALL_CLOCK_POS.y;
    const dz = this.cameraPosition.z - this.TOWN_HALL_CLOCK_POS.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // If too far away, don't play at all
    if (distance > this.CLOCK_CHIME_MAX_DISTANCE) return;

    // Squared falloff for natural distance attenuation
    const attenuation = Math.pow(1 - distance / this.CLOCK_CHIME_MAX_DISTANCE, 2);
    const baseVolume = 0.15; // Soft, gentle volume
    const effectiveVolume = baseVolume * attenuation;

    if (effectiveVolume < 0.005) return; // Below audible threshold

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Number of bongs: 12-hour format (1-12)
      const bongs = chimeCount ?? ((roundedHour % 12) || 12);

      // Play each bong with slight delay between them
      for (let i = 0; i < bongs; i++) {
        const startTime = currentTime + i * 1.8; // 1.8 seconds between bongs

        // Deep, resonant church bell tone
        // Main fundamental (low, rich)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(174.6, startTime); // F3 - deep bell fundamental

        // Slight pitch bend down for realistic bell decay
        osc1.frequency.exponentialRampToValueAtTime(172, startTime + 2.5);

        gain1.gain.setValueAtTime(0, startTime);
        gain1.gain.linearRampToValueAtTime(effectiveVolume * 0.6, startTime + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 2.5);

        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(startTime);
        osc1.stop(startTime + 2.6);

        // First overtone (octave + fifth = ~3x fundamental)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(523, startTime); // C5

        gain2.gain.setValueAtTime(0, startTime);
        gain2.gain.linearRampToValueAtTime(effectiveVolume * 0.25, startTime + 0.01);
        gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);

        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(startTime);
        osc2.stop(startTime + 1.6);

        // Strike "thud" - gives initial attack character
        const noiseBuffer = this.createNoiseBuffer(0.1, 'brown');
        if (noiseBuffer) {
          const noiseSource = ctx.createBufferSource();
          const noiseGain = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          noiseSource.buffer = noiseBuffer;
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(300, startTime);

          noiseGain.gain.setValueAtTime(0, startTime);
          noiseGain.gain.linearRampToValueAtTime(effectiveVolume * 0.2, startTime + 0.005);
          noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

          noiseSource.connect(filter);
          filter.connect(noiseGain);
          noiseGain.connect(masterGain);

          noiseSource.start(startTime);
          noiseSource.stop(startTime + 0.2);
        }
      }
    } catch (e) {
      audioLog.warn('Clock chime playback failed', e);
    }
  }

  // Reset clock chime tracking (call when time is reset or jumped)
  resetClockChime(): void {
    this.lastClockChimeHour = -1;
  }

  // === SPEED ZONE SOUNDS ===

  private lastSpeedZoneTime: Map<string, number> = new Map();

  // Soft chime when entering speed zone
  playSpeedZoneEnter(forkliftId: string) {
    if (this.getEffectiveVolume() === 0) return;

    const now = Date.now();
    const lastPlayed = this.lastSpeedZoneTime.get(forkliftId) || 0;
    if (now - lastPlayed < 2000) return; // Debounce
    this.lastSpeedZoneTime.set(forkliftId, now);

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Two-note descending chime (like "slow down")
      const notes = [880, 660]; // A5 to E5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.06, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } catch (e) {
      audioLog.warn('Speed zone enter sound failed', { forkliftId }, e);
    }
  }

  // Ascending chime when exiting speed zone
  playSpeedZoneExit(forkliftId: string) {
    if (this.getEffectiveVolume() === 0) return;

    const now = Date.now();
    const lastPlayed = this.lastSpeedZoneTime.get(forkliftId) || 0;
    if (now - lastPlayed < 2000) return;
    this.lastSpeedZoneTime.set(forkliftId, now);

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Two-note ascending chime (like "all clear")
      const notes = [660, 880]; // E5 to A5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.1;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.05, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.2);
      });
    } catch (e) {
      audioLog.warn('Speed zone exit sound failed', { forkliftId }, e);
    }
  }

  // === EMERGENCY STOP SOUNDS ===

  private emergencyAlarmNode: { source: OscillatorNode; gain: GainNode } | null = null;
  private emergencyStopAlarmNode: {
    source: OscillatorNode;
    gain: GainNode;
    lfo: OscillatorNode;
  } | null = null;

  // Start loud emergency alarm
  startEmergencyAlarm() {
    if (this.emergencyAlarmNode) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      // Alternating two-tone siren
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, ctx.currentTime);

      // LFO for siren effect
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(2, ctx.currentTime); // 2 Hz alternation
      lfoGain.gain.setValueAtTime(200, ctx.currentTime); // Frequency deviation

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      lfo.start();

      this.emergencyAlarmNode = { source: osc, gain };
    } catch (e) {
      audioLog.warn('Emergency alarm start failed', e);
    }
  }

  stopEmergencyAlarm() {
    if (this.emergencyAlarmNode) {
      try {
        this.emergencyAlarmNode.source.stop();
      } catch (e) {
        audioLog.warn('Failed to stop emergency alarm', e);
      }
      this.emergencyAlarmNode = null;
    }
  }

  // One-shot emergency stop sound (for button press)
  playEmergencyStop() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Loud descending siren burst
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1200, currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, currentTime + 0.5);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, currentTime);

      gain.gain.setValueAtTime(0.15, currentTime);
      gain.gain.setValueAtTime(0.15, currentTime + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.65);
    } catch (e) {
      audioLog.warn('Emergency stop sound failed', e);
    }
  }

  // Start continuous emergency stop alarm (different from fire drill)
  // Fire drill: sawtooth 800Hz, 2Hz square LFO = alternating two-tone siren
  // Emergency stop: square 400Hz, 4Hz square LFO = rapid pulsing klaxon
  startEmergencyStopAlarm() {
    if (this.emergencyStopAlarmNode) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      // Harsh klaxon - square wave at lower pitch
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, ctx.currentTime);

      // Faster pulsing (4Hz vs fire drill's 2Hz)
      lfo.type = 'square';
      lfo.frequency.setValueAtTime(4, ctx.currentTime);
      lfoGain.gain.setValueAtTime(100, ctx.currentTime); // Frequency deviation

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start();
      lfo.start();

      this.emergencyStopAlarmNode = { source: osc, gain, lfo };
    } catch (e) {
      audioLog.warn('Emergency stop alarm start failed', e);
    }
  }

  stopEmergencyStopAlarm() {
    if (this.emergencyStopAlarmNode) {
      try {
        this.emergencyStopAlarmNode.source.stop();
        this.emergencyStopAlarmNode.lfo.stop();
      } catch (e) {
        audioLog.warn('Failed to stop emergency stop alarm', e);
      }
      this.emergencyStopAlarmNode = null;
    }
  }

  // === FORKLIFT-TO-FORKLIFT ACKNOWLEDGMENT ===

  // Quick double-honk for forklift acknowledgment
  playForkliftAcknowledge(forkliftId: string) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Two quick beeps
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.15;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, startTime); // A4

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.12);
      }
    } catch (e) {
      audioLog.warn('Forklift acknowledge sound failed', { forkliftId }, e);
    }
  }

  // === PA SYSTEM ANNOUNCEMENTS ===

  private paSystemActive: boolean = false;
  private paSystemInterval: NodeJS.Timeout | number | null = null;

  startPASystem() {
    if (this.paSystemActive) return;
    this.paSystemActive = true;

    const playRandomAnnouncement = () => {
      if (!this.paSystemActive || this.getEffectiveVolume() === 0) return;

      // Skip playback when tab hidden but keep scheduling to resume when visible
      if (this._isTabVisible) {
        // Only play ambient factory sounds (shift bells and PA tones)
        // The PA chime is reserved for speakAnnouncement() which plays chime + actual TTS text
        // Playing chime here without text causes confusing "ghost chimes"
        const announcementType = Math.random();
        if (announcementType < 0.5) {
          this.playShiftBell();
        } else {
          this.playPATone();
        }
      }

      // Schedule next announcement (60-180 seconds)
      const nextDelay = 60000 + Math.random() * 120000;
      this.paSystemInterval = setTimeout(playRandomAnnouncement, nextDelay);
    };

    this.paSystemInterval = setTimeout(playRandomAnnouncement, 30000 + Math.random() * 60000);
  }

  stopPASystem() {
    this.paSystemActive = false;
    if (this.paSystemInterval) {
      clearTimeout(this.paSystemInterval);
      this.paSystemInterval = null;
    }
  }

  private playPAChime() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const paReverb = this.getPAReverbChain();
      if (!ctx || !paReverb) return;
      const currentTime = ctx.currentTime;

      // Classic three-tone chime - routed through tannoy reverb for echo effect
      const notes = [523, 659, 784]; // C5, E5, G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.3;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.05, startTime + 0.02);
        gain.gain.setValueAtTime(0.05, startTime + 0.2);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

        osc.connect(gain);
        // Route through PA reverb chain for tannoy echo effect
        gain.connect(paReverb.inputGain);

        osc.start(startTime);
        osc.stop(startTime + 0.65);
      });

      // Follow with muffled speech-like sound
      setTimeout(() => this.playPASpeech(), 1200);
    } catch (e) {
      audioLog.warn('PA chime playback failed', e);
    }
  }

  private playPASpeech() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const paReverb = this.getPAReverbChain();
      if (!ctx || !paReverb) return;
      const currentTime = ctx.currentTime;

      const duration = 2 + Math.random() * 2;
      const buffer = this.createNoiseBuffer(duration + 0.5, 'pink');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(600, currentTime);
      filter.Q.setValueAtTime(2, currentTime);

      // Modulate to simulate speech rhythm
      gain.gain.setValueAtTime(0, currentTime);
      const syllables = Math.floor(duration * 3);
      for (let i = 0; i < syllables; i++) {
        const t = currentTime + (i / syllables) * duration;
        gain.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.006, t);
        gain.gain.linearRampToValueAtTime(0.004, t + 0.1);
      }
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      // Route through PA reverb chain for tannoy echo effect
      gain.connect(paReverb.inputGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.2);
    } catch (e) {
      audioLog.warn('PA speech playback failed', e);
    }
  }

  playShiftBell() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const paReverb = this.getPAReverbChain();
      if (!ctx || !paReverb) return;
      const currentTime = ctx.currentTime;

      for (let ring = 0; ring < 3; ring++) {
        const startTime = currentTime + ring * 0.8;
        const frequencies = [800, 1200, 1600, 2000];

        frequencies.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);

          const volume = 0.035 / (i + 1);
          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.7);

          osc.connect(gain);
          // Route through PA reverb chain for tannoy echo effect
          gain.connect(paReverb.inputGain);

          osc.start(startTime);
          osc.stop(startTime + 0.75);
        });
      }
    } catch (e) {
      audioLog.warn('Shift bell playback failed', e);
    }
  }

  private playPATone() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const paReverb = this.getPAReverbChain();
      if (!ctx || !paReverb) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, currentTime);
      osc.frequency.setValueAtTime(660, currentTime + 0.3);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.04, currentTime + 0.02);
      gain.gain.setValueAtTime(0.04, currentTime + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.8);

      osc.connect(gain);
      // Route through PA reverb chain for tannoy echo effect
      gain.connect(paReverb.inputGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.85);
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // === INDUSTRIAL AMBIENT SOUNDS ===

  // Compressor cycling state
  private compressorActive: boolean = false;
  private compressorInterval: NodeJS.Timeout | number | null = null;
  private compressorNodes: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  // Start industrial compressor cycling (kicks on/off periodically)
  startCompressorCycling() {
    if (this.compressorActive) return;
    this.compressorActive = true;

    const cycleCompressor = () => {
      if (!this.compressorActive || this.getEffectiveVolume() === 0) return;

      // Random on duration (8-20 seconds)
      const onDuration = 8000 + Math.random() * 12000;
      // Random off duration (15-45 seconds)
      const offDuration = 15000 + Math.random() * 30000;

      // Skip playback when tab hidden but keep scheduling to resume when visible
      if (this._isTabVisible) {
        this.startCompressorSound();

        setTimeout(() => {
          this.stopCompressorSound();
          if (this.compressorActive) {
            this.compressorInterval = setTimeout(cycleCompressor, offDuration);
          }
        }, onDuration);
      } else {
        // When tab hidden, just schedule next cycle without playing
        this.compressorInterval = setTimeout(cycleCompressor, offDuration);
      }
    };

    // Start first cycle after a random delay
    this.compressorInterval = setTimeout(cycleCompressor, 5000 + Math.random() * 10000);
  }

  stopCompressorCycling() {
    this.compressorActive = false;
    if (this.compressorInterval) {
      clearTimeout(this.compressorInterval);
      this.compressorInterval = null;
    }
    this.stopCompressorSound();
  }

  private startCompressorSound() {
    if (this.compressorNodes || this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Air compressor has a rhythmic pumping sound with motor hum
      const buffer = this.createNoiseBuffer(4, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();
      const bandpass = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      source.buffer = buffer;
      source.loop = true;

      // Low frequency motor rumble
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(200, currentTime);
      lowpass.Q.setValueAtTime(2, currentTime);

      // Add some mid-frequency pump character
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(120, currentTime);
      bandpass.Q.setValueAtTime(4, currentTime);

      // LFO for rhythmic pumping effect (compressor strokes)
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(3.5, currentTime); // About 210 pumps/min
      lfoGain.gain.setValueAtTime(0.015, currentTime);

      // Fade in when compressor starts
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.035, currentTime + 0.5);

      source.connect(lowpass);
      lowpass.connect(bandpass);
      bandpass.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.compressorNodes = { source, gain };

      // Play startup clunk
      this.playCompressorStartup();
    } catch (e) {
      audioLog.warn('Compressor startup sound failed', e);
    }
  }

  private stopCompressorSound() {
    if (this.compressorNodes) {
      try {
        const ctx = this.getContext();
        if (ctx) {
          // Fade out before stopping
          this.compressorNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
          setTimeout(() => {
            try {
              this.compressorNodes?.source.stop();
            } catch (e) {
              audioLog.warn('Failed to stop compressor cycling', e);
            }
            this.compressorNodes = null;
          }, 500);
        }
      } catch (e) {
        audioLog.warn('Audio playback failed', e);
      }
    }
  }

  // Compressor startup clunk sound
  private playCompressorStartup() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Heavy mechanical clunk
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, currentTime);
      osc.frequency.exponentialRampToValueAtTime(25, currentTime + 0.15);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, currentTime);

      gain.gain.setValueAtTime(0.12, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.3);
    } catch (e) {
      audioLog.warn('Compressor startup sound failed', e);
    }
  }

  // === RANDOM METAL CLANKS ===

  private metalClankActive: boolean = false;
  private metalClankInterval: NodeJS.Timeout | number | null = null;

  // Start random metal clanks from factory floor
  startMetalClanks() {
    if (this.metalClankActive) return;
    this.metalClankActive = true;

    const playRandomClank = () => {
      if (!this.metalClankActive || this.getEffectiveVolume() === 0) return;

      // Skip playback when tab hidden but keep scheduling to resume when visible
      if (this._isTabVisible) {
        const clankType = Math.random();
        if (clankType < 0.3) {
          this.playMetalClankHeavy();
        } else if (clankType < 0.6) {
          this.playMetalClankLight();
        } else if (clankType < 0.85) {
          this.playMetalPing();
        } else {
          this.playChainRattle();
        }
      }

      // Schedule next clank (10-40 seconds)
      const nextDelay = 10000 + Math.random() * 30000;
      this.metalClankInterval = setTimeout(playRandomClank, nextDelay);
    };

    // Start with a delay
    this.metalClankInterval = setTimeout(playRandomClank, 8000 + Math.random() * 12000);
  }

  stopMetalClanks() {
    this.metalClankActive = false;
    if (this.metalClankInterval) {
      clearTimeout(this.metalClankInterval);
      this.metalClankInterval = null;
    }
  }

  // Heavy metal clank (tool dropping, impact)
  private playMetalClankHeavy() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Multiple frequencies for rich metallic sound
      const frequencies = [80, 180, 340, 680];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.7, currentTime + 0.1);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(freq, currentTime);
        filter.Q.setValueAtTime(8, currentTime);

        const vol = 0.04 / (i + 1);
        gain.gain.setValueAtTime(vol, currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.15 + i * 0.05);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(currentTime);
        osc.stop(currentTime + 0.25);
      });

      // Add noise burst for impact
      const buffer = this.createNoiseBuffer(0.1, 'white');
      if (!buffer) return;
      const noiseSource = ctx.createBufferSource();
      const noiseGain = ctx.createGain();
      const noiseFilter = ctx.createBiquadFilter();

      noiseSource.buffer = buffer;
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(2000, currentTime);
      noiseFilter.Q.setValueAtTime(1, currentTime);

      noiseGain.gain.setValueAtTime(0.03, currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.05);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);

      noiseSource.start(currentTime);
      noiseSource.stop(currentTime + 0.1);
    } catch (e) {
      audioLog.warn('Failed to stop metal clanks', e);
    }
  }

  // Light metal clank (wrench, small tool)
  private playMetalClankLight() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const frequencies = [400, 800, 1600, 2400];
      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq + Math.random() * 50, currentTime);

        const vol = 0.025 / (i + 1);
        gain.gain.setValueAtTime(vol, currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08 + i * 0.02);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(currentTime);
        osc.stop(currentTime + 0.15);
      });
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // Metal ping (pipe, railing)
  private playMetalPing() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const baseFreq = 1000 + Math.random() * 500;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, currentTime);

      gain.gain.setValueAtTime(0.04, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.4);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.45);
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // Chain rattle
  private playChainRattle() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Series of quick metallic clicks
      const clickCount = 5 + Math.floor(Math.random() * 5);
      for (let i = 0; i < clickCount; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = currentTime + i * 0.04 + Math.random() * 0.02;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200 + Math.random() * 600, startTime);

        gain.gain.setValueAtTime(0.015, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.03);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.04);
      }
    } catch (e) {
      audioLog.warn('Audio playback failed', e);
    }
  }

  // === HYDRAULIC SOUNDS ===

  // Hydraulic lift sound for forklift operations
  playHydraulicLift(_forkliftId: string, duration: number = 1.5) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Hydraulic pump motor whine
      const buffer = this.createNoiseBuffer(duration + 0.5, 'pink');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();
      const highpass = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Filter to create hydraulic character
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(400, currentTime);
      lowpass.frequency.linearRampToValueAtTime(600, currentTime + duration * 0.3);
      lowpass.frequency.linearRampToValueAtTime(350, currentTime + duration);

      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(80, currentTime);

      // Envelope
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.025, currentTime + 0.1);
      gain.gain.setValueAtTime(0.025, currentTime + duration - 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.2);

      // Add hydraulic fluid whoosh
      this.playHydraulicFluid(duration);
    } catch (e) {
      audioLog.warn('Hydraulic fluid sound failed', e);
    }
  }

  // Hydraulic lower sound (slower, different character)
  playHydraulicLower(forkliftId: string, duration: number = 2) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Slower release sound with hiss
      const buffer = this.createNoiseBuffer(duration + 0.5, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Higher frequency hiss for release
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, currentTime);
      filter.frequency.exponentialRampToValueAtTime(300, currentTime + duration);
      filter.Q.setValueAtTime(2, currentTime);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.02, currentTime + 0.1);
      gain.gain.setValueAtTime(0.02, currentTime + duration * 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.2);
    } catch (e) {
      audioLog.warn('Hydraulic lower sound failed', { forkliftId }, e);
    }
  }

  // Hydraulic fluid movement sound
  private playHydraulicFluid(duration: number) {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const buffer = this.createNoiseBuffer(duration, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, currentTime);
      filter.Q.setValueAtTime(3, currentTime);

      gain.gain.setValueAtTime(0.015, currentTime);
      gain.gain.setValueAtTime(0.015, currentTime + duration * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.1);
    } catch (e) {
      audioLog.warn('Hydraulic fluid sound failed', e);
    }
  }

  // === WEATHER SOUNDS ===

  private weatherNodes: { rain?: { source: AudioBufferSourceNode; gain: GainNode } } = {};
  private isRaining: boolean = false;
  private thunderListeners: Set<() => void> = new Set();

  // Subscribe to thunder events for visual synchronization
  onThunder(callback: () => void): () => void {
    this.thunderListeners.add(callback);
    return () => this.thunderListeners.delete(callback);
  }

  private notifyThunderListeners(): void {
    this.thunderListeners.forEach((listener) => listener());
  }

  startRain() {
    if (this.weatherNodes.rain || this.getEffectiveVolume() === 0) return;
    this.isRaining = true;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      const buffer = this.createNoiseBuffer(4, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const highpass = ctx.createBiquadFilter();
      const lowpass = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(2000, ctx.currentTime);

      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(8000, ctx.currentTime);

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.03, ctx.currentTime + 2);

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(masterGain);

      source.start();
      this.weatherNodes.rain = { source, gain };
      this.scheduleThunder();
    } catch (e) {
      audioLog.warn('Rain sound start failed', e);
    }
  }

  stopRain() {
    this.isRaining = false;
    if (this.weatherNodes.rain) {
      try {
        const ctx = this.getContext();
        if (ctx) {
          this.weatherNodes.rain.gain.gain.setTargetAtTime(0, ctx.currentTime, 1);
          setTimeout(() => {
            try {
              this.weatherNodes.rain?.source.stop();
            } catch (e) {
              audioLog.warn('Failed to stop rain sound', e);
            }
            this.weatherNodes.rain = undefined;
          }, 3000);
        }
      } catch (e) {
        audioLog.warn('Rain fade-out failed', e);
      }
    }
  }

  private scheduleThunder() {
    if (!this.isRaining) return;
    const delay = 15000 + Math.random() * 45000;
    setTimeout(() => {
      if (this.isRaining) {
        this.playThunder();
        this.scheduleThunder();
      }
    }, delay);
  }

  private playThunder() {
    if (this.getEffectiveVolume() === 0 || !this.isRaining) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Notify listeners for visual sync (lightning flash)
      this.notifyThunderListeners();

      const duration = 2 + Math.random() * 3;
      const buffer = this.createNoiseBuffer(duration + 1, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, currentTime);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.08, currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.02, currentTime + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.5);
    } catch (e) {
      audioLog.warn('Thunder sound playback failed', e);
    }
  }

  // === PNEUMATIC/SPOUTING SOUNDS ===

  private spoutingNodes: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();

  startSpoutingSound(spoutId: string, x: number, y: number, z: number) {
    if (this.spoutingNodes.has(spoutId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      const buffer = this.createNoiseBuffer(3, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500, ctx.currentTime);
      filter.Q.setValueAtTime(1, ctx.currentTime);

      gain.gain.setValueAtTime(0.02, ctx.currentTime);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start();
      this.spoutingNodes.set(spoutId, { source, gain });
      this.registerSoundPosition(spoutId, x, y, z);
    } catch (e) {
      audioLog.warn('Spouting sound start failed', { spoutId }, e);
    }
  }

  updateSpoutingSpatialVolume(spoutId: string) {
    const node = this.spoutingNodes.get(spoutId);
    if (node && this.audioContext) {
      const spatialGain = this.calculateSpatialVolume(spoutId, 0.02, 25);
      node.gain.gain.setTargetAtTime(spatialGain, this.audioContext.currentTime, 0.2);
    }
  }

  stopSpoutingSound(spoutId: string) {
    const node = this.spoutingNodes.get(spoutId);
    if (node) {
      try {
        node.source.stop();
      } catch (e) {
        audioLog.warn('Failed to stop spouting sound', { spoutId }, e);
      }
      this.spoutingNodes.delete(spoutId);
    }
  }

  // === VENTILATION FAN SOUNDS ===

  private ventilationFanNodes: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  // Start ventilation fan ambient sound (continuous whooshing)
  startVentilationFanSound() {
    if (this.ventilationFanNodes || this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Whooshing fan sound - mix of noise frequencies
      const buffer = this.createNoiseBuffer(4, 'pink');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const lowpass = ctx.createBiquadFilter();
      const highpass = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      source.buffer = buffer;
      source.loop = true;

      // Band-limited fan whoosh
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(800, currentTime);
      lowpass.Q.setValueAtTime(1, currentTime);

      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(100, currentTime);

      // LFO for subtle blade rotation effect
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(2.5, currentTime); // Blade pass frequency
      lfoGain.gain.setValueAtTime(0.008, currentTime);

      // Fade in
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.025, currentTime + 1);

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.ventilationFanNodes = { source, gain };
    } catch (e) {
      audioLog.warn('Ventilation fan sound start failed', e);
    }
  }

  stopVentilationFanSound() {
    if (this.ventilationFanNodes) {
      try {
        const ctx = this.getContext();
        if (ctx) {
          this.ventilationFanNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
          setTimeout(() => {
            try {
              this.ventilationFanNodes?.source.stop();
            } catch (e) {
              audioLog.warn('Failed to stop ventilation fan source', e);
            }
            this.ventilationFanNodes = null;
          }, 1000);
        }
      } catch (e) {
        audioLog.warn('Ventilation fan fade-out failed', e);
      }
    }
  }

  // === POWER FLICKER SOUNDS ===

  private lastFlickerSoundTime: number = 0;

  // Electrical buzz/flicker sound during power fluctuation
  playPowerFlicker() {
    if (this.getEffectiveVolume() === 0) return;

    // Debounce
    const now = Date.now();
    if (now - this.lastFlickerSoundTime < 100) return;
    this.lastFlickerSoundTime = now;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Electrical buzz - multiple harmonics
      const duration = 0.1 + Math.random() * 0.2;

      // Base 60Hz hum
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(60, currentTime);
      gain1.gain.setValueAtTime(0.04, currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(currentTime);
      osc1.stop(currentTime + duration);

      // Higher harmonic for buzz character
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(120, currentTime);
      gain2.gain.setValueAtTime(0.02, currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, currentTime + duration * 0.8);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(currentTime);
      osc2.stop(currentTime + duration);

      // Crackling noise
      const buffer = this.createNoiseBuffer(duration, 'white');
      if (buffer) {
        const noiseSource = ctx.createBufferSource();
        const noiseGain = ctx.createGain();
        const noiseFilter = ctx.createBiquadFilter();

        noiseSource.buffer = buffer;

        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(2000, currentTime);

        noiseGain.gain.setValueAtTime(0.03, currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration * 0.5);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);

        noiseSource.start(currentTime);
        noiseSource.stop(currentTime + duration);
      }
    } catch (e) {
      audioLog.warn('Power flicker sound failed', e);
    }
  }

  // === WATER DRIP SOUNDS ===

  private lastDripSoundTime: number = 0;

  // Water drip hitting floor/puddle
  playWaterDrip() {
    if (this.getEffectiveVolume() === 0) return;

    // Debounce to prevent too many drip sounds
    const now = Date.now();
    if (now - this.lastDripSoundTime < 200) return;
    this.lastDripSoundTime = now;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // High-pitched plop sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Random pitch variation for natural feel
      const basePitch = 800 + Math.random() * 400;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(basePitch, currentTime);
      osc.frequency.exponentialRampToValueAtTime(basePitch * 0.3, currentTime + 0.15);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, currentTime);
      filter.Q.setValueAtTime(2, currentTime);

      // Quick attack, medium decay
      gain.gain.setValueAtTime(0.06, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.25);

      // Add subtle splash noise
      const buffer = this.createNoiseBuffer(0.1, 'white');
      if (buffer) {
        const noiseSource = ctx.createBufferSource();
        const noiseGain = ctx.createGain();
        const noiseFilter = ctx.createBiquadFilter();

        noiseSource.buffer = buffer;

        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(3000, currentTime);
        noiseFilter.Q.setValueAtTime(1, currentTime);

        noiseGain.gain.setValueAtTime(0.02, currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.08);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);

        noiseSource.start(currentTime);
        noiseSource.stop(currentTime + 0.1);
      }
    } catch (e) {
      audioLog.warn('Water drip sound failed', e);
    }
  }

  // === LOADING BAY DOOR SOUNDS ===

  playDoorOpen() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const duration = 2.5;
      const buffer = this.createNoiseBuffer(duration + 0.5, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, currentTime);
      filter.frequency.linearRampToValueAtTime(400, currentTime + duration);
      filter.Q.setValueAtTime(2, currentTime);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.04, currentTime + 0.1);
      gain.gain.setValueAtTime(0.04, currentTime + duration - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.2);

      setTimeout(() => this.playDoorClunk(), (duration - 0.2) * 1000);
    } catch (e) {
      audioLog.warn('Door clunk sound failed', e);
    }
  }

  playDoorClose() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const duration = 2.5;
      const buffer = this.createNoiseBuffer(duration + 0.5, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, currentTime);
      filter.frequency.linearRampToValueAtTime(150, currentTime + duration);
      filter.Q.setValueAtTime(2, currentTime);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.04, currentTime + 0.1);
      gain.gain.setValueAtTime(0.04, currentTime + duration - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.2);

      setTimeout(() => this.playDoorClunk(), (duration - 0.1) * 1000);
    } catch (e) {
      audioLog.warn('Door clunk sound failed', e);
    }
  }

  private playDoorClunk() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, currentTime + 0.2);

      gain.gain.setValueAtTime(0.08, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.3);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 0.35);
    } catch (e) {
      audioLog.warn('Door clunk sound failed', e);
    }
  }

  // === DOCK OPERATIONS SOUNDS ===

  // Stretch wrap machine buzzing sound
  private stretchWrapNode: { source: OscillatorNode; gain: GainNode } | null = null;

  startStretchWrapSound() {
    if (this.getEffectiveVolume() === 0 || this.stretchWrapNode) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(60, ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, ctx.currentTime);
      filter.Q.setValueAtTime(2, ctx.currentTime);

      gain.gain.setValueAtTime(0.02, ctx.currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start();
      this.stretchWrapNode = { source: osc, gain };
    } catch (e) {
      audioLog.warn('Stretch wrap sound failed', e);
    }
  }

  stopStretchWrapSound() {
    if (this.stretchWrapNode) {
      try {
        this.stretchWrapNode.source.stop();
      } catch (e) {
        // Already stopped
      }
      this.stretchWrapNode = null;
    }
  }

  // Dock leveler hydraulic whine
  playDockLevelerSound() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Hydraulic motor sound - rising whine
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80, currentTime);
      osc.frequency.linearRampToValueAtTime(150, currentTime + 1.5);
      osc.frequency.linearRampToValueAtTime(80, currentTime + 2);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, currentTime);

      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.04, currentTime + 0.1);
      gain.gain.setValueAtTime(0.04, currentTime + 1.8);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + 2.1);
    } catch (e) {
      audioLog.warn('Dock leveler sound failed', e);
    }
  }

  // Reefer (refrigeration) unit humming
  private reeferNodes: Map<
    string,
    { source: OscillatorNode; gain: GainNode; lfo: OscillatorNode }
  > = new Map();

  startReeferSound(reeferId: string) {
    if (this.getEffectiveVolume() === 0 || this.reeferNodes.has(reeferId)) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Main compressor drone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(50, currentTime);

      // LFO for slight pulsing
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(2, currentTime);
      lfoGain.gain.setValueAtTime(0.005, currentTime);

      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(150, currentTime);
      filter.Q.setValueAtTime(1, currentTime);

      gain.gain.setValueAtTime(0.025, currentTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);

      osc.start();
      lfo.start();

      this.reeferNodes.set(reeferId, { source: osc, gain, lfo });
    } catch (e) {
      audioLog.warn('Reefer sound failed', e);
    }
  }

  stopReeferSound(reeferId: string) {
    const node = this.reeferNodes.get(reeferId);
    if (node) {
      try {
        node.source.stop();
        node.lfo.stop();
      } catch (e) {
        // Already stopped
      }
      this.reeferNodes.delete(reeferId);
    }
  }

  // Radio dispatch chatter at guard shack
  playRadioDispatch() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

      // Static burst + voice-like modulation
      const duration = 1.5 + Math.random() * 1;

      // Static noise
      const buffer = this.createNoiseBuffer(duration, 'white');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const filter2 = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Bandpass for radio quality
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200, currentTime);
      filter.Q.setValueAtTime(5, currentTime);

      // Voice-like modulation with second filter
      filter2.type = 'lowpass';
      filter2.frequency.setValueAtTime(2500, currentTime);

      // Crackling envelope
      gain.gain.setValueAtTime(0, currentTime);
      gain.gain.linearRampToValueAtTime(0.02, currentTime + 0.05);

      // Random volume variations to simulate speech patterns
      const numVariations = Math.floor(duration * 4);
      for (let i = 0; i < numVariations; i++) {
        const t = currentTime + 0.1 + (i / numVariations) * (duration - 0.2);
        const vol = 0.01 + Math.random() * 0.015;
        gain.gain.linearRampToValueAtTime(vol, t);
      }

      gain.gain.linearRampToValueAtTime(0.02, currentTime + duration - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(filter2);
      filter2.connect(gain);
      gain.connect(masterGain);

      source.start(currentTime);
      source.stop(currentTime + duration);

      // Add squelch tail
      setTimeout(
        () => {
          this.playRadioSquelch();
        },
        duration * 1000 - 100
      );
    } catch (e) {
      audioLog.warn('Radio dispatch sound failed', e);
    }
  }

  // === TEXT-TO-SPEECH (TTS) FOR PA ANNOUNCEMENTS ===

  // TTS enabled getter/setter
  get ttsEnabled(): boolean {
    return this._ttsEnabled;
  }

  set ttsEnabled(value: boolean) {
    this._ttsEnabled = value;
    if (!value) {
      this.stopTTS();
    }
    this.saveSettings();
    this.notifyListeners();
  }

  // Initialize TTS voice - call after user interaction (browser requirement)
  private initTTSVoice(): void {
    if (this._ttsVoiceLoaded || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length === 0) return;

      // Debug: log available voices on mobile for troubleshooting
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        console.log(
          '[MillOS TTS] Available voices:',
          voices.map((v) => `${v.name} (${v.lang})`).join(', ')
        );
      }

      // Use British voices for PA announcements - prefer British, fall back to any English on mobile
      const preferredBritishVoices = [
        'Google UK English Female',
        'Google UK English Male',
        'Microsoft Hazel - English (United Kingdom)',
        'Microsoft George - English (United Kingdom)',
        'Daniel (United Kingdom)',
        'Kate',
        'Serena',
        'Daniel',
        // iOS-specific voice names
        'Karen', // Australian but close
        'Moira', // Irish
        'Fiona', // Scottish
      ];

      // First pass: exact preferred British voice matches
      for (const preferred of preferredBritishVoices) {
        const found = voices.find((v) => v.name === preferred || v.name.includes(preferred));
        if (found) {
          this._ttsVoice = found;
          audioLog.info(`TTS voice selected (British): ${found.name}`);
          console.log(`[MillOS TTS] Selected voice: ${found.name} (${found.lang})`);
          break;
        }
      }

      // Second pass: any voice with UK/British in name or en-GB locale
      if (!this._ttsVoice) {
        const britishVoice = voices.find(
          (v) =>
            v.lang === 'en-GB' ||
            v.lang === 'en_GB' ||
            v.name.toLowerCase().includes('uk') ||
            v.name.toLowerCase().includes('british') ||
            v.name.toLowerCase().includes('united kingdom')
        );
        if (britishVoice) {
          this._ttsVoice = britishVoice;
          audioLog.info(`TTS voice selected (British fallback): ${britishVoice.name}`);
          console.log(`[MillOS TTS] Selected voice (GB locale): ${britishVoice.name}`);
        }
      }

      // Third pass (mobile only): fall back to ANY English voice rather than silence
      if (!this._ttsVoice && isMobile) {
        const anyEnglishVoice = voices.find((v) => v.lang.startsWith('en'));
        if (anyEnglishVoice) {
          this._ttsVoice = anyEnglishVoice;
          audioLog.info(`TTS voice selected (mobile English fallback): ${anyEnglishVoice.name}`);
          console.log(`[MillOS TTS] Mobile fallback voice: ${anyEnglishVoice.name}`);
        }
      }

      if (!this._ttsVoice) {
        audioLog.warn('No suitable voice found - PA announcements will be silent');
        console.warn('[MillOS TTS] No suitable voice found!');
      }

      this._ttsVoiceLoaded = true;
    };

    // Chrome loads voices asynchronously
    if (window.speechSynthesis.getVoices().length) {
      loadVoices();
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;

      // iOS Safari fallback: onvoiceschanged may not fire reliably
      // Poll for voices a few times as a backup
      let attempts = 0;
      const pollVoices = () => {
        if (this._ttsVoiceLoaded || attempts >= 10) return;
        attempts++;
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          loadVoices();
        } else {
          setTimeout(pollVoices, 250);
        }
      };
      setTimeout(pollVoices, 100);
    }
  }

  // Speak a PA announcement using TTS with tannoy echo effect
  // Messages are queued so they don't cut each other off
  speakAnnouncement(text: string): void {
    console.log('[MillOS TTS] speakAnnouncement called:', text.substring(0, 50) + '...');

    if (!this._ttsEnabled) {
      console.log('[MillOS TTS] Blocked: TTS disabled');
      return;
    }
    if (this._muted) {
      console.log('[MillOS TTS] Blocked: audio muted');
      return;
    }
    if (!('speechSynthesis' in window)) {
      console.log('[MillOS TTS] Blocked: speechSynthesis not supported');
      return;
    }

    // Ensure voice is loaded
    if (!this._ttsVoiceLoaded) {
      console.log('[MillOS TTS] Voice not loaded, initializing...');
      this.initTTSVoice();
    }

    // Only speak if we have a voice selected
    if (!this._ttsVoice) {
      console.warn('[MillOS TTS] Blocked: no voice available');
      audioLog.warn('Blocking announcement - no voice available');
      return;
    }

    console.log('[MillOS TTS] Adding to queue, voice:', this._ttsVoice.name);

    // Add to queue
    this.announcementQueue.push(text);

    // If nothing is currently playing, start processing the queue
    if (!this.isAnnouncementPlaying) {
      this.processAnnouncementQueue();
    }
  }

  // Process the next announcement in the queue
  private processAnnouncementQueue(): void {
    console.log(
      '[MillOS TTS] processAnnouncementQueue called, queue length:',
      this.announcementQueue.length
    );

    // Check if queue is empty or conditions prevent playback
    if (
      this.announcementQueue.length === 0 ||
      !this._ttsEnabled ||
      this._muted ||
      !this._ttsVoice
    ) {
      this.isAnnouncementPlaying = false;
      console.log('[MillOS TTS] Queue processing stopped - empty or blocked');
      return;
    }

    this.isAnnouncementPlaying = true;
    const text = this.announcementQueue.shift()!;
    console.log('[MillOS TTS] Processing:', text.substring(0, 50) + '...');

    // Clear any existing safety timeout
    if (this.announcementSafetyTimeout) {
      clearTimeout(this.announcementSafetyTimeout);
      this.announcementSafetyTimeout = null;
    }

    // Safety timeout: if announcement doesn't complete within 30 seconds, force reset
    // This prevents the PA system from getting stuck when speechSynthesis callbacks fail
    this.announcementSafetyTimeout = setTimeout(() => {
      console.warn('[MillOS TTS] Safety timeout - forcing queue reset');
      this.stopSpeechReverb();
      this.isAnnouncementPlaying = false;
      // Cancel any stuck speech
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      // Continue processing queue
      this.processAnnouncementQueue();
    }, 30000);

    try {
      const utterance = new SpeechSynthesisUtterance(text);

      // Configure voice settings for PA-style delivery
      utterance.voice = this._ttsVoice;
      utterance.rate = 0.85; // Slightly slower for PA clarity
      utterance.pitch = 0.95; // Slightly lower for authoritative PA tone
      utterance.volume = this._volume * 0.75; // Slightly quieter to blend with reverb

      // Helper to clear safety timeout when speech completes normally
      const clearSafetyTimeout = () => {
        if (this.announcementSafetyTimeout) {
          clearTimeout(this.announcementSafetyTimeout);
          this.announcementSafetyTimeout = null;
        }
      };

      // When speech starts, begin continuous reverb simulation
      utterance.onstart = () => {
        console.log('[MillOS TTS] Speech started');
        this.startSpeechReverb();
      };

      // When speech ends, stop reverb, play reverberant echo tail, then process next in queue
      utterance.onend = () => {
        console.log('[MillOS TTS] Speech ended');
        clearSafetyTimeout();
        this.stopSpeechReverb();
        this.playPAReverbTail();
        // Wait for reverb tail to finish before next announcement (1.5s delay)
        setTimeout(() => {
          this.processAnnouncementQueue();
        }, 1500);
      };
      utterance.onerror = (e) => {
        // "interrupted" error often happens when cancelling speech (e.g. before new announcement)
        // This is usually expected behavior, so we log as info instead of error
        if (e.error === 'interrupted') {
          console.log('[MillOS TTS] Speech interrupted (expected behavior)');
        } else {
          console.error('[MillOS TTS] Speech error:', e.error, e);
          audioLog.warn('TTS error', e);
        }

        clearSafetyTimeout();
        this.stopSpeechReverb();

        // Even on error, continue processing queue after a short delay
        setTimeout(() => {
          this.processAnnouncementQueue();
        }, 500);
      };

      // Play PA chime first, then speak after delay
      console.log('[MillOS TTS] Playing chime, will speak in 1.2s');
      this.playPAChime();
      this.announcementChimeTimeout = setTimeout(() => {
        if (this._ttsEnabled && !this._muted) {
          // iOS Safari workaround: cancel any stuck state before speaking
          // This fixes a known bug where speechSynthesis can become unresponsive
          window.speechSynthesis.cancel();
          console.log('[MillOS TTS] Calling speechSynthesis.speak()');
          window.speechSynthesis.speak(utterance);
        } else {
          console.log('[MillOS TTS] Conditions changed, skipping speak');
          clearSafetyTimeout();
          // If conditions changed during chime, process next
          this.processAnnouncementQueue();
        }
      }, 1200); // Match existing PA chime timing
    } catch (e) {
      audioLog.warn('TTS playback failed', e);
      this.isAnnouncementPlaying = false;
      // Try next announcement
      setTimeout(() => {
        this.processAnnouncementQueue();
      }, 500);
    }
  }

  // Start continuous reverb simulation during TTS speech
  // This creates filtered noise routed through the PA reverb chain to simulate
  // voice bouncing around the factory space while speaking
  private startSpeechReverb(): void {
    if (this.getEffectiveVolume() === 0) return;
    this.stopSpeechReverb(); // Clean up any existing

    try {
      const ctx = this.getContext();
      const paReverb = this.getPAReverbChain();
      if (!ctx || !paReverb) return;

      // Create a long looping noise buffer for continuous reverb
      const duration = 4;
      const buffer = this.createNoiseBuffer(duration, 'pink');
      if (!buffer) return;

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const bandpass = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      // Bandpass filter to match speech frequencies (vowel formants ~300-3000Hz)
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 800;
      bandpass.Q.value = 0.8;

      // Subtle continuous reverb presence
      gain.gain.value = 0.015;

      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(paReverb.inputGain);

      source.start();

      this.speechReverbNodes = { source, gain };

      // Set up interval to pulse additional reverb bursts (simulates word echoes)
      this.speechReverbPulseInterval = setInterval(() => {
        this.pulseSpeechReverb();
      }, 400); // Pulse every ~400ms to sync roughly with speech cadence
    } catch (e) {
      audioLog.warn('Failed to start speech reverb', e);
    }
  }

  // Create a single reverb pulse during speech (simulates a word echoing)
  private pulseSpeechReverb(): void {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const paReverb = this.getPAReverbChain();
      if (!ctx || !paReverb) return;
      const currentTime = ctx.currentTime;

      // Short burst of filtered noise that decays quickly
      const duration = 0.3;
      const buffer = this.createNoiseBuffer(duration, 'pink');
      if (!buffer) return;

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const bandpass = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Match speech frequencies
      bandpass.type = 'bandpass';
      bandpass.frequency.value = 700 + Math.random() * 400; // Vary slightly for natural feel
      bandpass.Q.value = 1.0;

      // Quick attack, fast decay
      gain.gain.setValueAtTime(0.02, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(paReverb.inputGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.1);
    } catch (e) {
      // Ignore pulse errors
    }
  }

  // Stop the continuous speech reverb effect
  private stopSpeechReverb(): void {
    if (this.speechReverbPulseInterval) {
      clearInterval(this.speechReverbPulseInterval as NodeJS.Timeout);
      this.speechReverbPulseInterval = null;
    }

    if (this.speechReverbNodes) {
      try {
        const ctx = this.getContext();
        if (ctx) {
          const currentTime = ctx.currentTime;
          // Fade out over 200ms before stopping
          this.speechReverbNodes.gain.gain.setValueAtTime(
            this.speechReverbNodes.gain.gain.value,
            currentTime
          );
          this.speechReverbNodes.gain.gain.exponentialRampToValueAtTime(0.0001, currentTime + 0.2);
          this.speechReverbNodes.source.stop(currentTime + 0.25);
        } else {
          this.speechReverbNodes.source.stop();
        }
      } catch (e) {
        // Source may already be stopped
      }
      this.speechReverbNodes = null;
    }
  }

  // Play a reverberant tail after TTS announcements to simulate echo in the factory space
  private playPAReverbTail(): void {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const paReverb = this.getPAReverbChain();
      if (!ctx || !paReverb) return;
      const currentTime = ctx.currentTime;

      // Create a longer filtered noise burst that fades out like factory hall reverb
      const duration = 1.8;
      const buffer = this.createNoiseBuffer(duration, 'pink');
      if (!buffer) return;

      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;

      // Bandpass to match speech frequencies - slightly wider for more presence
      filter.type = 'bandpass';
      filter.frequency.value = 600;
      filter.Q.value = 1.2;

      // Longer decay for pronounced reverb tail effect
      gain.gain.setValueAtTime(0.025, currentTime);
      gain.gain.setValueAtTime(0.022, currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

      source.connect(filter);
      filter.connect(gain);
      // Route through PA reverb for cascading echo effect
      gain.connect(paReverb.inputGain);

      source.start(currentTime);
      source.stop(currentTime + duration + 0.5);
    } catch (e) {
      audioLog.warn('PA reverb tail failed', e);
    }
  }

  // Stop current TTS playback and clear announcement queue
  stopTTS(): void {
    this.stopSpeechReverb();
    // Clear the announcement queue
    this.announcementQueue = [];
    this.isAnnouncementPlaying = false;
    // Cancel any pending chime timeout
    if (this.announcementChimeTimeout) {
      clearTimeout(this.announcementChimeTimeout);
      this.announcementChimeTimeout = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  // Check if TTS is currently speaking
  isSpeaking(): boolean {
    return 'speechSynthesis' in window && window.speechSynthesis.speaking;
  }

  // Stop all sounds
  stopAll() {
    this.stopMusic();
    this.stopAmbientSounds();
    this.stopOutdoorAmbient();
    this.stopRadioChatter();
    this.stopWorkerVoices();
    this.stopNightAmbient();
    this.stopPASystem();
    this.stopRain();
    this.stopEmergencyAlarm();
    this.stopEmergencyStopAlarm();
    this.stopCompressorCycling();
    this.stopMetalClanks();
    this.stopVentilationFanSound();
    this.machineNodes.forEach((_node, id) => {
      this.stopMachineSound(id);
    });
    this.forkliftEngines.forEach((_engine, id) => {
      this.stopForkliftEngine(id);
    });
    this.forkliftEngines.clear();
    this.truckEngines.forEach((_engine, id) => {
      this.stopTruckEngine(id);
    });
    this.backupBeepers.forEach((_beeper, id) => {
      this.stopBackupBeeper(id);
    });
    this.conveyorNodes.forEach((_node, id) => {
      this.stopConveyorSound(id);
    });
    this.spoutingNodes.forEach((_node, id) => {
      this.stopSpoutingSound(id);
    });
    this.stopStretchWrapSound();
    this.reeferNodes.forEach((_node, id) => {
      this.stopReeferSound(id);
    });
  }
}

export const audioManager = new AudioManager();
