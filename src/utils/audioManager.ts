// Audio manager for realistic factory sounds using Web Audio API
import { logger } from './logger';
import { landmarkLocalToWorld, SITE_LAYOUT } from '../constants/siteLayout';
import {
  MUSIC_STATIONS,
  type MusicStation,
  type MusicTrack,
} from '../audio/millosSoundtrackCatalog';

export type AmbientWeather = 'clear' | 'cloudy' | 'rain' | 'storm';

export interface OutdoorAmbientMix {
  birds: number;
  wind: number;
  traffic: number;
  water: number;
  ducks: number;
  pigs: number;
  cows: number;
}

interface CompressorAudioNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
  lowpass: BiquadFilterNode;
  bandpass: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

interface OutdoorLayerNodes {
  source: AudioBufferSourceNode;
  gain: GainNode;
  lfo?: OscillatorNode;
}

const proximity = (x: number, z: number, targetX: number, targetZ: number, range: number): number =>
  Math.max(0, 1 - Math.hypot(x - targetX, z - targetZ) / range);

const VILLAGE_POND_POSITION = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [20, 0, 25]);
const TOWN_HALL_CLOCK_POSITION = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [0, 12, 20]);

/** Pure spatial and weather mix, kept testable outside Web Audio. */
export function calculateOutdoorAmbientMix(
  camera: { x: number; z: number },
  timeOfDay: 'day' | 'night',
  weather: AmbientWeather
): OutdoorAmbientMix {
  const insideFactory = camera.x > -60 && camera.x < 60 && camera.z > -50 && camera.z < 50;
  const exterior = insideFactory ? 0.12 : 1;
  const weatherMix = {
    clear: { birds: 1, wind: 1, water: 1, animals: 1 },
    cloudy: { birds: 0.75, wind: 1.25, water: 1, animals: 0.85 },
    rain: { birds: 0.16, wind: 1.7, water: 1.35, animals: 0.25 },
    storm: { birds: 0, wind: 2.8, water: 1.75, animals: 0.08 },
  }[weather];
  const daylight = timeOfDay === 'day' ? 1 : 0.25;
  const waterProximity = Math.max(
    proximity(camera.x, camera.z, VILLAGE_POND_POSITION[0], VILLAGE_POND_POSITION[2], 70),
    proximity(camera.x, camera.z, -125, 105, 70),
    proximity(camera.x, camera.z, 120, 120, 80),
    proximity(camera.x, camera.z, 0, -145, 75)
  );
  const farmProximity = proximity(camera.x, camera.z, 75, 120, 75);
  const villagePondProximity = Math.max(
    proximity(camera.x, camera.z, VILLAGE_POND_POSITION[0], VILLAGE_POND_POSITION[2], 55),
    proximity(camera.x, camera.z, -125, 105, 45)
  );

  return {
    birds: 0.002 * exterior * daylight * weatherMix.birds,
    wind: 0.012 * exterior * (timeOfDay === 'night' ? 1.5 : 1) * weatherMix.wind,
    traffic: 0.015 * exterior * (timeOfDay === 'night' ? 0.53 : 1),
    water: 0.004 * exterior * waterProximity * weatherMix.water,
    ducks: 0.0008 * exterior * villagePondProximity * daylight * weatherMix.animals,
    pigs: 0.0012 * exterior * farmProximity * weatherMix.animals,
    cows: 0.0008 * exterior * farmProximity * weatherMix.animals,
  };
}

// Use centralized audio logger
const audioLog = {
  debug: (message: string, ...args: unknown[]) => {
    logger.audio.debug(message, ...args);
  },
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
  // Machinery bus under masterGain. The Settings "Machine Sounds" slider scales
  // it, with the 0.5 default at unity so the authored mix is unchanged.
  private machineBus: GainNode | null = null;
  private lastHornTime: Map<string, number> = new Map();
  private _muted: boolean = false;
  private _volume: number = 0.5;
  private listeners: Set<() => void> = new Set();
  private _initialized: boolean = false;
  private _isTabVisible: boolean = true; // Track tab visibility to pause audio when hidden

  // Pre-generated noise buffers to avoid blocking main thread during playback
  private cachedNoiseBuffers: {
    brown4s?: AudioBuffer; // 4-second brown noise for compressor
    pink4s?: AudioBuffer; // Reusable 4-second pink-noise bed
    white1s?: AudioBuffer; // 1-second white noise for various effects
  } = {};
  private noiseBuffersGenerated: boolean = false;
  // Loop-bed buffers of whole-second lengths, generated once per session so the
  // first-click burst of loop starts does not synthesise the same noise twice.
  private loopNoiseBuffers: Map<string, AudioBuffer> = new Map();

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
  private machineNodes: Map<
    string,
    {
      source: AudioBufferSourceNode;
      gain: GainNode;
      filter?: BiquadFilterNode;
      lfo?: OscillatorNode;
    }
  > = new Map();

  // Forklift engine sounds. `gain` carries the spatial level; `lfoDepth` is the
  // relative tremolo depth, so the idle rhythm scales with distance.
  private forkliftEngines: Map<
    string,
    {
      source: AudioBufferSourceNode;
      gain: GainNode;
      lfo: OscillatorNode;
      lfoDepth: GainNode;
      baseGain: number;
    }
  > = new Map();
  private backgroundMuted = false;

  // Outdoor ambient sounds
  private outdoorNodes: {
    birds?: OutdoorLayerNodes;
    wind?: OutdoorLayerNodes;
    traffic?: OutdoorLayerNodes;
    water?: OutdoorLayerNodes;
    ducks?: OutdoorLayerNodes;
    pigs?: OutdoorLayerNodes;
    cows?: OutdoorLayerNodes;
  } = {};
  private lastOutdoorTargets: Partial<OutdoorAmbientMix> = {};

  // Camera position for spatial audio (updated externally)
  private cameraPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };

  // Sound source positions for spatial calculation
  private soundPositions: Map<string, { x: number; y: number; z: number }> = new Map();

  // Ambient sound spatial attenuation settings
  // Factory center and range for distance-based volume attenuation
  private readonly FACTORY_CENTER = { x: 0, y: 0, z: 0 };
  private readonly FACTORY_AMBIENT_MAX_DISTANCE = 80; // Interior distance falloff
  private readonly AMBIENT_BASE_VOLUMES = {
    machineryHum: 0.08,
    conveyorNoise: 0.03,
    ventilation: 0.015,
    grainFlow: 0.012,
  };

  // Factory physical bounds
  private readonly FACTORY_BOUNDS = {
    minX: -60,
    maxX: 60,
    minZ: -50,
    maxZ: 50,
  };

  // Realistic acoustic physics constants
  private readonly ACOUSTICS = {
    // Wall transmission: how much sound passes through solid walls
    // Industrial walls typically block 20-30 dB = 90-99% reduction
    wallTransmission: 0.08, // 8% passes through solid wall

    // Dock openings let much more sound through (only partial obstruction)
    dockTransmission: 0.55, // 55% passes through open dock bay

    // Exponential decay rate outside (per unit distance)
    // Models inverse-square law: sound drops rapidly with distance
    exteriorDecayRate: 0.04, // ~50% reduction every 17 units

    // Near-wall behavior inside (sound escaping through walls)
    wallProximityZone: 10, // Units from wall where leakage starts
    nearWallMinimum: 0.88, // 12% reduction right at the wall

    // Dock zone detection (matches DOCK_OPENINGS in useCameraPositionStore)
    dockHalfWidth: 12, // Half-width of dock opening
    dockTransitionDepth: 20, // How far outside dock zone extends
  };

  // Background music
  private musicAudio: HTMLAudioElement | null = null;
  private _musicEnabled: boolean = true;
  private _musicVolume: number = 0.3;
  private _machineVolume: number = 0.5; // Separate volume for machine sounds
  private _currentTrackIndex: number = 0;
  private _musicStation: MusicStation = 'original';
  private _musicShuffle: boolean = false;
  // Stable media event handlers for the singleton audio element.
  private musicEndedHandler: (() => void) | null = null;
  private musicErrorHandler: ((e: Event) => void) | null = null;
  private musicProgressTimer: ReturnType<typeof setInterval> | null = null;
  // Set when the user pressed Pause, so a tab becoming visible again does not
  // restart music they deliberately stopped.
  private _userPausedMusic = false;
  // Consecutive track load failures; once every track has failed we stop
  // advancing instead of spinning through the playlist as fast as requests fail.
  private consecutiveMusicLoadFailures = 0;
  private mediaSessionConfigured = false;

  // Active station playlist. Original soundtrack order is authoritative unless shuffle is enabled.
  private musicTracks: MusicTrack[];

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

  constructor() {
    // Load persisted settings from localStorage
    this.loadSettings();
    this.musicTracks = [...MUSIC_STATIONS[this._musicStation]];
    if (this._musicShuffle) this.shufflePlaylist();
  }

  // LocalStorage key for audio settings persistence
  private readonly STORAGE_KEY = 'millos-audio';

  // Save audio settings to localStorage
  private saveSettings(): void {
    try {
      const settings = {
        version: 2,
        muted: this._muted,
        volume: this._volume,
        musicEnabled: this._musicEnabled,
        musicVolume: this._musicVolume,
        machineVolume: this._machineVolume,
        musicStation: this._musicStation,
        musicShuffle: this._musicShuffle,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage may not be available in some environments
    }
  }

  // Load audio settings from localStorage
  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        if (typeof settings.muted === 'boolean') this._muted = settings.muted;
        if (typeof settings.volume === 'number')
          this._volume = Math.max(0, Math.min(1, settings.volume));
        if (typeof settings.musicEnabled === 'boolean') this._musicEnabled = settings.musicEnabled;
        if (typeof settings.musicVolume === 'number')
          this._musicVolume = Math.max(0, Math.min(1, settings.musicVolume));
        if (typeof settings.machineVolume === 'number')
          this._machineVolume = Math.max(0, Math.min(1, settings.machineVolume));
        if (settings.musicStation === 'original' || settings.musicStation === 'legacy')
          this._musicStation = settings.musicStation;
        if (typeof settings.musicShuffle === 'boolean') this._musicShuffle = settings.musicShuffle;
      }
    } catch {
      // localStorage may not be available or data may be corrupted
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
    this.updateMachineVolumes();
    this.saveSettings();
    this.notifyListeners();
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    this.updateMasterVolume();
    this.updateMachineVolumes();
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

  get machineVolume(): number {
    return this._machineVolume;
  }

  set machineVolume(value: number) {
    this._machineVolume = Math.max(0, Math.min(1, value));
    this.updateMachineVolumes();
    this.saveSettings();
    this.notifyListeners();
  }

  // Update volume for all currently playing machine sounds
  // Note: Each machine type has a different base volume (0.06/0.05/0.045)
  // We use an average base of 0.05 for volume updates
  private updateMachineVolumes(): void {
    const effectiveVolume = this._muted ? 0 : this._machineVolume * 0.05;
    this.machineNodes.forEach((node) => {
      if (node.gain) {
        node.gain.gain.setTargetAtTime(effectiveVolume, this.audioContext?.currentTime ?? 0, 0.15);
      }
    });
    // Mute is already applied on masterGain, which the bus feeds.
    this.machineBus?.gain.setTargetAtTime(
      this._machineVolume * 2,
      this.audioContext?.currentTime ?? 0,
      0.15
    );
  }

  get currentTrack(): MusicTrack {
    return this.musicTracks[this._currentTrackIndex];
  }

  get trackCount(): number {
    return this.musicTracks.length;
  }

  get availableMusicTracks(): readonly MusicTrack[] {
    return this.musicTracks;
  }

  get trackIndex(): number {
    return this._currentTrackIndex;
  }

  get musicStation(): MusicStation {
    return this._musicStation;
  }

  set musicStation(value: MusicStation) {
    if (value === this._musicStation) return;
    const shouldResume = Boolean(this.musicAudio && !this.musicAudio.paused && this._musicEnabled);
    this._musicStation = value;
    this.musicTracks = [...MUSIC_STATIONS[value]];
    if (this._musicShuffle) this.shufflePlaylist();
    this._currentTrackIndex = 0;
    this.loadCurrentMusicTrack(shouldResume);
    this.saveSettings();
    this.notifyListeners();
  }

  get musicShuffle(): boolean {
    return this._musicShuffle;
  }

  set musicShuffle(value: boolean) {
    if (value === this._musicShuffle) return;
    const currentTrackId = this.currentTrack.id;
    this._musicShuffle = value;
    this.musicTracks = [...MUSIC_STATIONS[this._musicStation]];
    if (value) this.shufflePlaylist();
    const currentIndex = Math.max(
      0,
      this.musicTracks.findIndex((track) => track.id === currentTrackId)
    );
    if (value && currentIndex > 0) {
      // Lead the shuffled order with the song already playing, so the rest of
      // the album follows it instead of being skipped until the next wrap.
      [this.musicTracks[0], this.musicTracks[currentIndex]] = [
        this.musicTracks[currentIndex],
        this.musicTracks[0],
      ];
    }
    this._currentTrackIndex = value ? 0 : currentIndex;
    this.saveSettings();
    this.notifyListeners();
  }

  get musicPlaying(): boolean {
    return Boolean(this.musicAudio && !this.musicAudio.paused && !this.musicAudio.ended);
  }

  get musicPositionSeconds(): number {
    const position = this.musicAudio?.currentTime ?? 0;
    return Number.isFinite(position) ? position : 0;
  }

  get musicDurationSeconds(): number {
    const mediaDuration = this.musicAudio?.duration;
    if (Number.isFinite(mediaDuration) && mediaDuration && mediaDuration > 0) return mediaDuration;
    return this.currentTrack.durationSeconds ?? 0;
  }

  get isTabVisible(): boolean {
    return this._isTabVisible;
  }

  set isTabVisible(value: boolean) {
    this._isTabVisible = value;
    // When tab becomes hidden, we let intervals continue but skip playback
    // When tab becomes visible again, intervals will resume normal playback
  }

  nextTrack(autoplay = this.musicPlaying): void {
    const endedTrackId = this.currentTrack.id;
    this._currentTrackIndex += 1;
    if (this._currentTrackIndex >= this.musicTracks.length) {
      this._currentTrackIndex = 0;
      if (this._musicShuffle) {
        this.shufflePlaylist();
        // A fresh shuffle must not replay the song that just finished.
        const last = this.musicTracks.length - 1;
        if (last > 0 && this.musicTracks[0].id === endedTrackId) {
          [this.musicTracks[0], this.musicTracks[last]] = [
            this.musicTracks[last],
            this.musicTracks[0],
          ];
        }
      }
    }
    this.loadCurrentMusicTrack(autoplay && this._musicEnabled);
    this.notifyListeners();
  }

  prevTrack(autoplay = this.musicPlaying): void {
    this._currentTrackIndex =
      (this._currentTrackIndex - 1 + this.musicTracks.length) % this.musicTracks.length;
    this.loadCurrentMusicTrack(autoplay && this._musicEnabled);
    this.notifyListeners();
  }

  selectMusicTrack(index: number): void {
    if (!Number.isFinite(index)) return;
    const normalizedIndex = Math.max(0, Math.min(this.musicTracks.length - 1, Math.trunc(index)));
    if (normalizedIndex === this._currentTrackIndex) return;
    this._currentTrackIndex = normalizedIndex;
    this.loadCurrentMusicTrack(this._musicEnabled);
    this.notifyListeners();
  }

  seekMusic(positionSeconds: number): void {
    if (!this.musicAudio || !Number.isFinite(positionSeconds)) return;
    this.musicAudio.currentTime = Math.max(0, Math.min(this.musicDurationSeconds, positionSeconds));
    this.updateMediaSession();
    this.notifyListeners();
  }

  pauseMusic(): void {
    if (!this.musicPlaying) return;
    this._userPausedMusic = true;
    this.musicAudio?.pause();
    this.notifyListeners();
  }

  toggleMusicPlayback(): void {
    if (this.musicPlaying) {
      this.pauseMusic();
      return;
    }
    if (!this._musicEnabled) {
      this.musicEnabled = true;
      return;
    }
    this.startMusic();
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
      this.machineBus = this.audioContext.createGain();
      this.machineBus.gain.value = this._machineVolume * 2;
      this.machineBus.connect(this.masterGain);
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

      // Generate a reusable 4-second pink-noise bed
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

  // Output for factory machinery (beds, conveyors, spouts, compressor, clanks).
  private getMachineBus(): GainNode | null {
    const ctx = this.getContext();
    if (!ctx) return null;
    return this.machineBus;
  }

  // A context the browser suspended or interrupted after the first gesture
  // (iOS, audio-device change, long background) stays silent until resumed.
  private ensureRunning(): void {
    const ctx = this.audioContext;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
      void ctx.resume().catch(() => undefined);
    }
  }

  // Roof and walls muffle outdoor sources heard from inside the factory.
  private isCameraInsideFactory(): boolean {
    return this.getFactoryBoundaryInfo(this.cameraPosition.x, this.cameraPosition.z).isInside;
  }

  // Unity-gain tremolo stage: `depth` is relative (0-1), so whatever level the
  // following gain carries, the modulation scales with it instead of adding a
  // fixed amount that survives a mix target of zero.
  private createTremolo(
    ctx: AudioContext,
    lfo: OscillatorNode,
    depth: number
  ): { trem: GainNode; lfoDepth: GainNode } {
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = Math.min(1, depth);
    lfo.connect(lfoDepth);
    lfoDepth.connect(trem.gain);
    return { trem, lfoDepth };
  }

  // Start a looping noise bed at a random point so beds sharing one cached
  // buffer do not play sample-identical noise.
  private startLoopAtRandomOffset(source: AudioBufferSourceNode): void {
    source.start(0, Math.random() * (source.buffer?.duration ?? 0));
  }

  /**
   * Public accessor for audio context (for audio-reactive visualization)
   * Returns null if audio not yet initialized
   */
  getAudioContext(): AudioContext | null {
    return this.getContext();
  }

  /**
   * Public accessor for master gain node (for audio analyzer connection)
   * Returns null if audio not yet initialized
   */
  getAnalyzerMasterGain(): GainNode | null {
    return this.getMasterGain();
  }

  private updateMasterVolume(): void {
    if (this.masterGain) {
      // Keep hidden-tab silence intact: backgroundMuted overrides volume/mute changes
      const targetVolume = this.backgroundMuted || this._muted ? 0 : this._volume;
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

    if (!hidden) this.ensureRunning();

    if (hidden && !this.backgroundMuted) {
      this.backgroundMuted = true;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    } else if (!hidden && this.backgroundMuted) {
      this.backgroundMuted = false;
      this.updateMasterVolume();
      if (
        this._musicEnabled &&
        this.musicAudio &&
        this.musicAudio.paused &&
        !this._userPausedMusic
      ) {
        this.musicAudio.play().catch((e) => {
          audioLog.warn('Music resume on tab visibility failed', e);
        });
      }
    }
  }

  private updateMusicVolume(): void {
    if (this.musicAudio) {
      // Music has its own independent volume control. iOS ignores scripted
      // `volume` (it always reads 1) but honours `muted`, so mute uses both.
      this.musicAudio.muted = this._muted;
      this.musicAudio.volume = this._musicVolume;
    }
  }

  // Station and track the OS media controls were last given metadata for.
  private lastMediaSessionKey: string | null = null;

  private updateMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const artworkSize = this.currentTrack.trackNumber === 7 ? '360x360' : '1024x1024';
    const mediaSessionKey = `${this._musicStation}:${this.currentTrack.id}`;
    if (typeof MediaMetadata !== 'undefined' && mediaSessionKey !== this.lastMediaSessionKey) {
      this.lastMediaSessionKey = mediaSessionKey;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.currentTrack.name,
        artist: this.currentTrack.artist,
        album:
          this._musicStation === 'original' ? 'Songs of the Living Mill' : 'MillOS Legacy Music',
        artwork: this.currentTrack.artwork
          ? [{ src: this.currentTrack.artwork, sizes: artworkSize, type: 'image/jpeg' }]
          : [],
      });
    }
    navigator.mediaSession.playbackState = this.musicPlaying ? 'playing' : 'paused';
    if ('setPositionState' in navigator.mediaSession) {
      const duration = this.musicDurationSeconds;
      if (duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: this.musicAudio?.playbackRate ?? 1,
            position: Math.min(this.musicPositionSeconds, Math.max(0, duration - 0.001)),
          });
        } catch {
          // Metadata may arrive before the browser accepts a position state.
        }
      }
    }
  }

  private configureMediaSession(): void {
    if (
      this.mediaSessionConfigured ||
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator)
    ) {
      return;
    }
    const handlers: ReadonlyArray<readonly [MediaSessionAction, MediaSessionActionHandler]> = [
      [
        'play',
        () => {
          if (!this.musicPlaying) this.toggleMusicPlayback();
        },
      ],
      ['pause', () => this.pauseMusic()],
      ['nexttrack', () => this.nextTrack(true)],
      ['previoustrack', () => this.prevTrack(true)],
      ['seekto', (details) => this.seekMusic(details.seekTime ?? 0)],
    ];
    handlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers expose Media Session but omit individual actions.
      }
    });
    this.mediaSessionConfigured = true;
  }

  private syncMusicProgressTicker(): void {
    if (this.musicPlaying && !this.musicProgressTimer) {
      // UI progress only. The OS extrapolates Media Session position from
      // playbackRate, so it is refreshed on discrete media events instead.
      this.musicProgressTimer = setInterval(() => this.notifyListeners(), 100);
    } else if (!this.musicPlaying && this.musicProgressTimer) {
      clearInterval(this.musicProgressTimer);
      this.musicProgressTimer = null;
    }
    this.updateMediaSession();
    this.notifyListeners();
  }

  private configureMusicAudio(audio: HTMLAudioElement): void {
    audio.loop = false;
    this.musicEndedHandler = () => this.nextTrack(true);
    this.musicErrorHandler = (event: Event) => {
      this.consecutiveMusicLoadFailures += 1;
      if (this.consecutiveMusicLoadFailures >= this.musicTracks.length) {
        audioLog.warn('Every music track failed to load; leaving the player paused', event);
        this.syncMusicProgressTicker();
        return;
      }
      audioLog.warn('Music track failed to load, advancing to next track', event);
      this.nextTrack(true);
    };
    const stateHandler = () => this.syncMusicProgressTicker();
    audio.addEventListener('ended', this.musicEndedHandler);
    audio.addEventListener('error', this.musicErrorHandler);
    audio.addEventListener('canplay', () => {
      this.consecutiveMusicLoadFailures = 0;
    });
    for (const event of ['play', 'pause', 'seeked', 'loadedmetadata', 'durationchange']) {
      audio.addEventListener(event, stateHandler);
    }
    audio.addEventListener('timeupdate', () => this.notifyListeners());
    this.configureMediaSession();
  }

  private loadCurrentMusicTrack(autoplay: boolean): void {
    if (!this.musicAudio) {
      if (autoplay) this.startMusic();
      this.updateMediaSession();
      return;
    }
    this.musicAudio.src = this.currentTrack.file;
    this.musicAudio.currentTime = 0;
    this.updateMusicVolume();
    this.updateMediaSession();
    if (autoplay) {
      this.musicAudio.play().catch((error) => {
        audioLog.warn('Music playback failed (likely autoplay policy)', error);
      });
    }
  }

  startMusic(): void {
    if (!this._musicEnabled) return;
    this._userPausedMusic = false;

    if (!this.musicAudio) {
      this.musicAudio = new Audio(this.currentTrack.file);
      this.configureMusicAudio(this.musicAudio);
      this.updateMusicVolume();
    } else if (this.musicAudio.src !== new URL(this.currentTrack.file, window.location.href).href) {
      this.musicAudio.src = this.currentTrack.file;
    }

    // Always ensure volume respects mute state before playing
    this.updateMusicVolume();
    this.updateMediaSession();
    this.musicAudio.play().catch((e) => {
      audioLog.warn('Music playback failed (user interaction required)', e);
    });
  }

  stopMusic(): void {
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.currentTime = 0;
    }
    this.syncMusicProgressTicker();
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

    // Whole-second loop-bed lengths are generated once. One-shot and random
    // durations (thunder, hydraulics) stay uncached so the map cannot grow.
    const loopKey = Number.isInteger(duration) && duration <= 8 ? `${type}:${duration}` : null;
    if (loopKey) {
      const cached = this.loopNoiseBuffers.get(loopKey);
      if (cached) return cached;
    }

    // Fall back to generating a new buffer for uncached sizes/types
    const sampleRate = ctx.sampleRate;
    const buffer = this.generateNoiseBufferInternal(duration, type, sampleRate);
    if (loopKey && buffer) this.loopNoiseBuffers.set(loopKey, buffer);
    return buffer;
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
      audioLog.warn('Forklift horn playback failed', e);
    }
  }

  // === QC LAB SOUNDS ===

  // === AMBIENT FACTORY SOUNDS ===

  // Start ambient factory soundscape
  startAmbientSounds() {
    if (this.ambientNodes.machineryHum) return; // Already running

    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;

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
        gain.connect(machineBus);
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
        gain.connect(machineBus);
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
        gain.connect(machineBus);
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
        gain.connect(machineBus);
        source.start();

        this.ambientNodes.grainFlow = { source, gain };
      }

      // Apply wall and distance attenuation for the current camera now; the
      // tracker only reports again once the camera moves.
      this.updateAmbientSpatialVolumes();
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

  // Roller mill grinding sound - deep rumble with rhythmic mechanical churning
  playMillSound(machineId: string, rpm: number = 1400) {
    if (this.machineNodes.has(machineId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Brown noise for deep rumble base
      const buffer = this.createNoiseBuffer(2, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      // Low-pass filter with slight resonance for mechanical character
      const filterFreq = 100 + rpm / 20; // 100-170Hz range
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
      filter.Q.setValueAtTime(1.5, ctx.currentTime); // Resonance adds body

      // Subtle LFO for rhythmic swishing/churning (slow, gentle modulation)
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(rpm / 100, ctx.currentTime); // Slow rhythm
      lfoGain.gain.setValueAtTime(0.012, ctx.currentTime); // Subtle modulation

      // Volume scales with machine volume setting
      const effectiveVolume = 0.06 * this._machineVolume;
      gain.gain.setValueAtTime(effectiveVolume, ctx.currentTime);

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

  // Sifter sound - oscillating mechanical swoosh
  playSifterSound(machineId: string, rpm: number = 200) {
    if (this.machineNodes.has(machineId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Brown noise for consistent low rumble
      const buffer = this.createNoiseBuffer(2, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      // Low-pass with moderate resonance for swooshing character
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(140, ctx.currentTime);
      filter.Q.setValueAtTime(1.8, ctx.currentTime); // Adds swooshy character

      // LFO for rhythmic swooshing motion (sifters oscillate)
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(rpm / 40, ctx.currentTime); // Oscillation rate
      lfoGain.gain.setValueAtTime(0.015, ctx.currentTime);

      // Volume scales with machine volume setting
      const effectiveVolume = 0.05 * this._machineVolume;
      gain.gain.setValueAtTime(effectiveVolume, ctx.currentTime);

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

  // Packer sound - rhythmic mechanical thumping
  playPackerSound(machineId: string) {
    if (this.machineNodes.has(machineId)) return;
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;

      // Brown noise for deep mechanical base
      const buffer = this.createNoiseBuffer(3, 'brown');
      if (!buffer) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      source.buffer = buffer;
      source.loop = true;

      // Deep low-pass for heavy bass thump
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(70, ctx.currentTime); // Very low for deep bass
      filter.Q.setValueAtTime(2.5, ctx.currentTime); // Strong resonance for thump

      // Slow triangle wave LFO for spaced-out clunking
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'triangle';
      lfo.frequency.setValueAtTime(0.4, ctx.currentTime); // ~24 clunks/min - slow and deliberate
      lfoGain.gain.setValueAtTime(0.022, ctx.currentTime); // Slightly stronger modulation

      // Volume scales with machine volume setting
      const effectiveVolume = 0.045 * this._machineVolume;
      gain.gain.setValueAtTime(effectiveVolume, ctx.currentTime);

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

    // Update low-pass filter frequency based on RPM (subtle tonal shift)
    // Higher RPM = slightly higher cutoff = marginally brighter rumble
    if (node.filter) {
      const filterFreq = 80 + rpm / 25; // 80-136Hz range
      node.filter.frequency.setTargetAtTime(filterFreq, currentTime, 0.3);
    }
  }

  // === ONE-SHOT SOUNDS ===

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

  // === TRUCK SOUNDS ===

  // Truck engine idle/running sound
  private truckEngines: Map<
    string,
    {
      source: AudioBufferSourceNode;
      gain: GainNode;
      filter: BiquadFilterNode;
      lfo: OscillatorNode;
      lfoDepth: GainNode;
      baseGain: number;
    }
  > = new Map();
  // Reference distance for the inverse rolloff (full level inside it).
  private readonly TRUCK_ENGINE_REF_DISTANCE = 15;

  // Persistent loop: started even while muted, because masterGain already
  // silences it and callers ask only once. Unmuting then brings it back.
  startTruckEngine(truckId: string, isMoving: boolean = false) {
    if (this.truckEngines.has(truckId)) return;

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

      source.buffer = buffer;
      source.loop = true;

      // Low frequency for diesel engine rumble
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isMoving ? 150 : 80, ctx.currentTime);
      filter.Q.setValueAtTime(3, ctx.currentTime);

      // LFO for engine rhythm: a fixed 0.01 swing, expressed relative to the
      // base level so spatial attenuation scales the rhythm with the engine.
      const baseGain = isMoving ? 0.04 : 0.025;
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(isMoving ? 25 : 15, ctx.currentTime);
      const { trem, lfoDepth } = this.createTremolo(ctx, lfo, 0.01 / baseGain);

      gain.gain.setValueAtTime(
        this.calculateVehicleEngineVolume(truckId, baseGain, this.TRUCK_ENGINE_REF_DISTANCE),
        ctx.currentTime
      );

      source.connect(filter);
      filter.connect(trem);
      trem.connect(gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.truckEngines.set(truckId, { source, gain, filter, lfo, lfoDepth, baseGain });
    } catch (e) {
      audioLog.warn('Truck engine start failed', { truckId }, e);
    }
  }

  updateTruckEngine(truckId: string, isMoving: boolean) {
    const engine = this.truckEngines.get(truckId);
    if (engine && this.audioContext) {
      const now = this.audioContext.currentTime;
      engine.baseGain = isMoving ? 0.04 : 0.025;
      engine.lfoDepth.gain.setTargetAtTime(Math.min(1, 0.01 / engine.baseGain), now, 0.3);
      this.updateTruckSpatialVolume(truckId);
      engine.filter.frequency.setTargetAtTime(isMoving ? 150 : 80, now, 0.35);
      engine.lfo.frequency.setTargetAtTime(isMoving ? 25 : 15, now, 0.35);
    }
  }

  // Re-apply distance and wall attenuation after registerSoundPosition(truckId).
  updateTruckSpatialVolume(truckId: string) {
    const engine = this.truckEngines.get(truckId);
    if (engine && this.audioContext) {
      const spatialGain = this.calculateVehicleEngineVolume(
        truckId,
        engine.baseGain,
        this.TRUCK_ENGINE_REF_DISTANCE
      );
      engine.gain.gain.setTargetAtTime(spatialGain, this.audioContext.currentTime, 0.3);
    }
  }

  stopTruckEngine(truckId: string) {
    const engine = this.truckEngines.get(truckId);
    if (engine) {
      try {
        engine.source.stop();
        engine.lfo.stop();
      } catch (e) {
        audioLog.warn('Truck engine stop failed', { truckId }, e);
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
    { oscillator: OscillatorNode; gain: GainNode; interval: ReturnType<typeof setTimeout> }
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

      // Self-rescheduling so each phase picks its own length; a setInterval
      // evaluates the delay once and ran a flat 500/500 cadence.
      const step = () => {
        if (!this.audioContext || this.backupBeepers.get(truckId) !== record) return;
        isOn = !isOn;
        gain.gain.setTargetAtTime(isOn ? 0.03 : 0, this.audioContext.currentTime, 0.01);

        // Count completed beeps (when turning off after being on)
        if (!isOn) {
          beepCount++;
          if (beepCount >= maxBeeps) {
            this.stopBackupBeeper(truckId);
            return;
          }
        }
        record.interval = setTimeout(step, isOn ? 300 : 500);
      };

      const record = { oscillator, gain, interval: setTimeout(step, 500) };
      this.backupBeepers.set(truckId, record);
    } catch (e) {
      audioLog.warn('Backup beeper start failed', e);
    }
  }

  stopBackupBeeper(truckId: string) {
    const beeper = this.backupBeepers.get(truckId);
    if (beeper) {
      try {
        clearTimeout(beeper.interval);
        beeper.oscillator.stop();
      } catch (e) {
        audioLog.warn('Backup beeper stop failed', e);
      }
      this.backupBeepers.delete(truckId);
    }
  }

  // === AI DECISION SOUNDS ===

  // === UI SOUNDS ===

  // Click sound for UI interactions
  playClick() {
    // Always runs inside a user gesture, the one moment a resume is allowed.
    this.ensureRunning();
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

  // Panel open/close sound
  playPanelOpen() {
    this.ensureRunning();
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
    this.ensureRunning();
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
    const wasInitialized = this._initialized;
    this._initialized = true;
    if (!wasInitialized) {
      this.notifyListeners();
    }

    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  // === SPATIAL AUDIO SUPPORT ===

  // Update camera position for spatial audio calculations
  updateCameraPosition(x: number, y: number, z: number) {
    // Mutated in place: this runs on every tracked camera move.
    this.cameraPosition.x = x;
    this.cameraPosition.y = y;
    this.cameraPosition.z = z;
    // Update ambient factory sounds based on distance from factory
    this.updateAmbientSpatialVolumes();
    this.adjustAmbientForTimeOfDay();
  }

  /**
   * Calculate signed distance to factory boundary and detect dock proximity
   * Returns: { signedDistance, isInside, nearDock }
   * - signedDistance: negative = inside (distance to nearest wall), positive = outside
   * - nearDock: true if near an open dock bay (sound escapes more easily)
   */
  private getFactoryBoundaryInfo(
    x: number,
    z: number
  ): {
    signedDistance: number;
    isInside: boolean;
    nearDock: boolean;
  } {
    const { minX, maxX, minZ, maxZ } = this.FACTORY_BOUNDS;
    const { dockHalfWidth, dockTransitionDepth } = this.ACOUSTICS;

    // Calculate distance to each wall (positive = inside that boundary)
    const dxMin = x - minX; // Distance from left wall
    const dxMax = maxX - x; // Distance from right wall
    const dzMin = z - minZ; // Distance from back wall
    const dzMax = maxZ - z; // Distance from front wall

    const isInside = dxMin > 0 && dxMax > 0 && dzMin > 0 && dzMax > 0;

    // Check if near a dock opening (front z=50, back z=-50)
    const nearFrontDock =
      Math.abs(x) < dockHalfWidth && z > maxZ - 8 && z < maxZ + dockTransitionDepth;
    const nearBackDock =
      Math.abs(x) < dockHalfWidth && z < minZ + 8 && z > minZ - dockTransitionDepth;
    const nearDock = nearFrontDock || nearBackDock;

    if (isInside) {
      // Inside: return negative distance to nearest wall
      const distToNearestWall = Math.min(dxMin, dxMax, dzMin, dzMax);
      return { signedDistance: -distToNearestWall, isInside: true, nearDock };
    } else {
      // Outside: calculate Euclidean distance to factory boundary
      const outsideX = Math.max(0, -dxMin, -dxMax);
      const outsideZ = Math.max(0, -dzMin, -dzMax);
      const distance = Math.sqrt(outsideX * outsideX + outsideZ * outsideZ);
      return { signedDistance: distance, isInside: false, nearDock };
    }
  }

  /**
   * Calculate realistic wall attenuation factor based on acoustic physics
   * Models: wall transmission, dock openings, distance decay, near-wall leakage
   */
  private calculateWallAttenuation(x: number, z: number): number {
    const { signedDistance, isInside, nearDock } = this.getFactoryBoundaryInfo(x, z);
    const {
      wallTransmission,
      dockTransmission,
      exteriorDecayRate,
      wallProximityZone,
      nearWallMinimum,
    } = this.ACOUSTICS;

    if (isInside) {
      // Inside factory: full volume with slight reduction near walls (sound escaping)
      const distToWall = -signedDistance;
      if (distToWall < wallProximityZone) {
        // Smooth interpolation from nearWallMinimum at wall to 1.0 at zone edge
        const t = distToWall / wallProximityZone;
        // Use smooth step for natural transition
        const smoothT = t * t * (3 - 2 * t);
        return nearWallMinimum + (1 - nearWallMinimum) * smoothT;
      }
      return 1.0;
    } else {
      // Outside factory: sound must pass through walls/openings then decay with distance
      // Base transmission depends on proximity to dock openings
      const baseTransmission = nearDock ? dockTransmission : wallTransmission;

      // Exponential decay with distance from wall (models inverse-square spreading)
      const distanceDecay = Math.exp(-exteriorDecayRate * signedDistance);

      return baseTransmission * distanceDecay;
    }
  }

  // Update ambient factory sound volumes based on position and acoustics
  private updateAmbientSpatialVolumes() {
    if (!this.audioContext) return;

    const { x, y, z } = this.cameraPosition;

    // Calculate distance from factory center (for interior spatial variation)
    const dx = x - this.FACTORY_CENTER.x;
    const dy = y - this.FACTORY_CENTER.y;
    const dz = z - this.FACTORY_CENTER.z;
    const distanceFromCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Interior spatial variation (louder near center, quieter at edges)
    // Uses gentle falloff - sounds are distributed throughout factory
    const interiorFalloff = Math.max(
      0.3,
      1 - distanceFromCenter / this.FACTORY_AMBIENT_MAX_DISTANCE
    );

    // Wall/boundary attenuation (major effect when outside)
    const wallAttenuation = this.calculateWallAttenuation(x, z);

    // Combined factor
    const combinedFactor = interiorFalloff * wallAttenuation;

    const currentTime = this.audioContext.currentTime;
    const rampTime = 0.4; // Slightly longer ramp for smoother transitions

    // Apply to each ambient sound layer
    if (this.ambientNodes.machineryHum?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.machineryHum * combinedFactor;
      this.ambientNodes.machineryHum.gain.gain.setTargetAtTime(targetVolume, currentTime, rampTime);
    }

    if (this.ambientNodes.conveyorNoise?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.conveyorNoise * combinedFactor;
      this.ambientNodes.conveyorNoise.gain.gain.setTargetAtTime(
        targetVolume,
        currentTime,
        rampTime
      );
    }

    if (this.ambientNodes.ventilation?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.ventilation * combinedFactor;
      this.ambientNodes.ventilation.gain.gain.setTargetAtTime(targetVolume, currentTime, rampTime);
    }

    if (this.ambientNodes.grainFlow?.gain) {
      const targetVolume = this.AMBIENT_BASE_VOLUMES.grainFlow * combinedFactor;
      this.ambientNodes.grainFlow.gain.gain.setTargetAtTime(targetVolume, currentTime, rampTime);
    }
  }

  // Register a sound source position
  registerSoundPosition(id: string, x: number, y: number, z: number) {
    this.soundPositions.set(id, { x, y, z });
  }

  /**
   * Calculate volume for a point source based on distance and wall occlusion
   * Uses realistic acoustic physics for both distance falloff and wall attenuation
   */
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

    // Distance-based falloff (inverse square approximation)
    const distanceFactor = Math.max(0, 1 - distance / maxDistance);
    const distanceAttenuation = distanceFactor * distanceFactor;

    // Check if sound crosses factory boundary (source inside, camera outside)
    const cameraInfo = this.getFactoryBoundaryInfo(this.cameraPosition.x, this.cameraPosition.z);
    const sourceInfo = this.getFactoryBoundaryInfo(sourcePos.x, sourcePos.z);

    let wallFactor = 1.0;
    if (!cameraInfo.isInside && sourceInfo.isInside) {
      // Sound must pass through wall - use camera's wall attenuation
      wallFactor = this.calculateWallAttenuation(this.cameraPosition.x, this.cameraPosition.z);
    }

    return baseVolume * distanceAttenuation * wallFactor;
  }

  /**
   * Engine level for a moving vehicle: inverse-distance rolloff (Web Audio's
   * 'inverse' model, rolloff 1) plus the same wall occlusion as other sources.
   * The linear-to-zero falloff used for conveyors reaches silence at its max
   * distance, and the default overview camera sits ~150 m from the plant, so a
   * 40 m linear falloff would erase every engine there. Inverse rolloff keeps a
   * distant fleet faintly present (1/15 at 150 m for forklifts, before walls)
   * while a nearby one dominates. Indoor engines heard from outside still take
   * the full wall occlusion, as the factory hum does. Before any position is
   * registered this is the base level.
   */
  private calculateVehicleEngineVolume(
    sourceId: string,
    baseVolume: number,
    refDistance: number
  ): number {
    const sourcePos = this.soundPositions.get(sourceId);
    if (!sourcePos) return baseVolume;

    const dx = sourcePos.x - this.cameraPosition.x;
    const dy = sourcePos.y - this.cameraPosition.y;
    const dz = sourcePos.z - this.cameraPosition.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const distanceAttenuation = refDistance / (refDistance + Math.max(0, distance - refDistance));

    let wallFactor = 1.0;
    const cameraInfo = this.getFactoryBoundaryInfo(this.cameraPosition.x, this.cameraPosition.z);
    if (!cameraInfo.isInside && this.getFactoryBoundaryInfo(sourcePos.x, sourcePos.z).isInside) {
      wallFactor = this.calculateWallAttenuation(this.cameraPosition.x, this.cameraPosition.z);
    }

    return baseVolume * distanceAttenuation * wallFactor;
  }

  // Update machine sound volume based on camera distance
  updateMachineSpatialVolume(machineId: string) {
    const node = this.machineNodes.get(machineId);
    if (node && this.audioContext) {
      const spatialGain = this.calculateSpatialVolume(machineId, 0.04, 35);
      node.gain.gain.setTargetAtTime(spatialGain, this.audioContext.currentTime, 0.2);
    }
  }

  // === TIME-OF-DAY AUDIO ===

  private currentTimeOfDay: 'day' | 'night' = 'day';
  private isDuskCricketTime: boolean = false;
  private currentWeather: AmbientWeather = 'clear';

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

  updateWeather(weather: AmbientWeather): void {
    if (weather === this.currentWeather) return;
    this.currentWeather = weather;
    // Rain bed for rain and storm; thunder itself is gated to storms.
    if (weather === 'rain' || weather === 'storm') {
      this.startRain();
    } else {
      this.stopRain();
    }
    this.adjustAmbientForTimeOfDay();
  }

  private adjustAmbientForTimeOfDay() {
    if (!this.audioContext) return;
    const currentTime = this.audioContext.currentTime;
    const mix = calculateOutdoorAmbientMix(
      this.cameraPosition,
      this.currentTimeOfDay,
      this.currentWeather
    );
    (Object.keys(mix) as Array<keyof OutdoorAmbientMix>).forEach((key) => {
      const target = mix[key];
      if (Math.abs((this.lastOutdoorTargets[key] ?? -1) - target) < 0.00001) return;
      this.lastOutdoorTargets[key] = target;
      this.outdoorNodes[key]?.gain.gain.setTargetAtTime(target, currentTime, 0.8);
    });

    const rain = this.weatherNodes.rain;
    if (rain) {
      const rainTarget = this.getRainTarget();
      if (Math.abs(this.lastRainTarget - rainTarget) >= 0.00001) {
        this.lastRainTarget = rainTarget;
        rain.gain.gain.setTargetAtTime(rainTarget, currentTime, 0.8);
      }
    }
  }

  private nightAmbientInterval: NodeJS.Timeout | number | null = null;

  private startNightAmbient() {
    if (this.nightAmbientInterval) return;

    const playCrickets = () => {
      // The whole 19:30-21:00 window, not just its night-time second half.
      if (!this.isDuskCricketTime || this.getEffectiveVolume() === 0) return;
      // Crickets fall silent in rain, like the rest of the wildlife.
      if (this.currentWeather === 'rain' || this.currentWeather === 'storm') return;
      // Skip playback when tab hidden
      if (!this._isTabVisible) return;
      // Same interior occlusion as the outdoor ambient mix.
      this.playCricketChirp(this.isCameraInsideFactory() ? 0.12 : 1);
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

  private playCricketChirp(level = 1) {
    if (this.getEffectiveVolume() === 0) return;
    const peak = 0.008 * level;

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
        gain.gain.linearRampToValueAtTime(peak, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(peak / 8, startTime + 0.05);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(startTime);
        osc.stop(startTime + 0.06);
      }
    } catch (e) {
      audioLog.warn('Cricket chirp playback failed', e);
    }
  }

  // === CONVEYOR SPATIAL AUDIO ===

  private conveyorNodes: Map<string, { source: AudioBufferSourceNode; gain: GainNode }> = new Map();

  // Persistent loop: no mute guard, since masterGain silences it and unmuting
  // must bring it back without the caller asking again.
  startConveyorSound(conveyorId: string, x: number, y: number, z: number) {
    if (this.conveyorNodes.has(conveyorId)) return;

    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;

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
      gain.connect(machineBus);

      this.startLoopAtRandomOffset(source);

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
      audioLog.warn('Truck arrival sound failed', e);
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

  // === FORKLIFT ENGINE SOUNDS ===

  // Reference distance for the inverse rolloff (full level inside it).
  private readonly FORKLIFT_ENGINE_REF_DISTANCE = 10;

  // Persistent loop: no mute guard, since masterGain silences it and callers
  // ask only once. Unmuting then brings it back.
  startForkliftEngine(forkliftId: string) {
    if (this.forkliftEngines.has(forkliftId)) return;

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

      source.buffer = buffer;
      source.loop = true;

      // Low frequency engine rumble
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(100, ctx.currentTime);
      filter.Q.setValueAtTime(4, ctx.currentTime);

      // LFO for engine idle rhythm (irregular idle): a 0.008 swing, expressed
      // relative to the base level so distance scales the rhythm too.
      const baseGain = 0.02;
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(8 + Math.random() * 2, ctx.currentTime);
      const { trem, lfoDepth } = this.createTremolo(ctx, lfo, 0.008 / baseGain);

      gain.gain.setValueAtTime(
        this.calculateVehicleEngineVolume(forkliftId, baseGain, this.FORKLIFT_ENGINE_REF_DISTANCE),
        ctx.currentTime
      );

      source.connect(filter);
      filter.connect(trem);
      trem.connect(gain);
      gain.connect(masterGain);

      source.start();
      lfo.start();

      this.forkliftEngines.set(forkliftId, { source, gain, lfo, lfoDepth, baseGain });
    } catch (e) {
      audioLog.warn('Forklift engine start failed', { forkliftId }, e);
    }
  }

  updateForkliftEngine(forkliftId: string, isMoving: boolean, isStopped: boolean) {
    const engine = this.forkliftEngines.get(forkliftId);
    if (engine && this.audioContext) {
      const now = this.audioContext.currentTime;
      // Adjust volume based on movement state and spatial position
      let targetGain = isMoving ? 0.035 : 0.02;
      if (isStopped) targetGain = 0.025; // Slightly louder when stopped (safety horn was honked)
      engine.baseGain = targetGain;
      engine.lfoDepth.gain.setTargetAtTime(Math.min(1, 0.008 / targetGain), now, 0.3);

      // Apply spatial attenuation
      this.updateForkliftSpatialVolume(forkliftId);

      // Adjust LFO frequency based on movement
      const targetFreq = isMoving ? 12 : 8;
      engine.lfo.frequency.setTargetAtTime(targetFreq, now, 0.5);
    }
  }

  // Re-apply distance and wall attenuation after registerSoundPosition(forkliftId).
  updateForkliftSpatialVolume(forkliftId: string) {
    const engine = this.forkliftEngines.get(forkliftId);
    if (engine && this.audioContext) {
      const spatialGain = this.calculateVehicleEngineVolume(
        forkliftId,
        engine.baseGain,
        this.FORKLIFT_ENGINE_REF_DISTANCE
      );
      engine.gain.gain.setTargetAtTime(spatialGain, this.audioContext.currentTime, 0.3);
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

        source.buffer = buffer;
        source.loop = true;

        // Wider bandpass for softer, less piercing bird ambience
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2800, ctx.currentTime);
        filter.Q.setValueAtTime(3, ctx.currentTime); // Lower Q = less harsh

        // Very slow modulation for gentle warbling, not rhythmic chirping
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.3 + Math.random() * 0.2, ctx.currentTime); // 0.3-0.5Hz
        // Full-depth warble, scaled by the mix target
        const { trem } = this.createTremolo(ctx, lfo, 1);

        gain.gain.setValueAtTime(0.002, ctx.currentTime); // Quieter base volume

        source.connect(filter);
        filter.connect(trem);
        trem.connect(gain);
        gain.connect(masterGain);

        this.startLoopAtRandomOffset(source);
        lfo.start();

        this.outdoorNodes.birds = { source, gain, lfo };
      }

      // Wind - gentle whooshing
      {
        const buffer = this.createNoiseBuffer(8, 'pink');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();

        source.buffer = buffer;
        source.loop = true;

        // Low-mid frequency for wind
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, ctx.currentTime);
        filter.Q.setValueAtTime(0.5, ctx.currentTime);

        // Slow modulation for gusting
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
        // Gusting around the mix target
        const { trem } = this.createTremolo(ctx, lfo, 0.008 / 0.012);

        gain.gain.setValueAtTime(0.012, ctx.currentTime);

        source.connect(filter);
        filter.connect(trem);
        trem.connect(gain);
        gain.connect(masterGain);

        this.startLoopAtRandomOffset(source);
        lfo.start();

        this.outdoorNodes.wind = { source, gain, lfo };
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

        this.startLoopAtRandomOffset(source);

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

        source.buffer = buffer;
        source.loop = true;

        // Lowpass for softer water sound (less harsh high frequencies)
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, ctx.currentTime);
        filter.Q.setValueAtTime(0.5, ctx.currentTime);

        // Very slow, subtle modulation - avoids rhythmic "maraca" effect
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.15 + Math.random() * 0.1, ctx.currentTime); // Much slower
        // Gentle ripple around the mix target
        const { trem } = this.createTremolo(ctx, lfo, 0.001 / 0.004);

        gain.gain.setValueAtTime(0.004, ctx.currentTime); // Quieter stream

        source.connect(filter);
        filter.connect(trem);
        trem.connect(gain);
        gain.connect(masterGain);

        this.startLoopAtRandomOffset(source);
        lfo.start();

        this.outdoorNodes.water = { source, gain, lfo };
      }

      // Ducks - occasional quacking (higher pitched, rhythmic bursts)
      {
        const buffer = this.createNoiseBuffer(4, 'white');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();

        source.buffer = buffer;
        source.loop = true;

        // Nasal, honky quality - mid-high frequencies
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, ctx.currentTime);
        filter.Q.setValueAtTime(8, ctx.currentTime); // Narrow band for quack character

        // Quick modulation for quacking rhythm (~3-5 quacks per second feel)
        lfo.type = 'square';
        lfo.frequency.setValueAtTime(0.4 + Math.random() * 0.3, ctx.currentTime); // Irregular timing
        // On/off quack gating
        const { trem } = this.createTremolo(ctx, lfo, 1);

        gain.gain.setValueAtTime(0.0008, ctx.currentTime); // Very quiet, background

        source.connect(filter);
        filter.connect(trem);
        trem.connect(gain);
        gain.connect(masterGain);

        this.startLoopAtRandomOffset(source);
        lfo.start();

        this.outdoorNodes.ducks = { source, gain, lfo };
      }

      // Pigs - soft grunting (low frequency, rhythmic)
      {
        const buffer = this.createNoiseBuffer(5, 'brown');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();

        source.buffer = buffer;
        source.loop = true;

        // Low, throaty frequencies for grunting
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(250, ctx.currentTime);
        filter.Q.setValueAtTime(3, ctx.currentTime);

        // Slow, irregular modulation for natural grunt timing
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.8 + Math.random() * 0.4, ctx.currentTime);
        // Full-depth grunt rhythm
        const { trem } = this.createTremolo(ctx, lfo, 1);

        gain.gain.setValueAtTime(0.0012, ctx.currentTime); // Quiet background

        source.connect(filter);
        filter.connect(trem);
        trem.connect(gain);
        gain.connect(masterGain);

        this.startLoopAtRandomOffset(source);
        lfo.start();

        this.outdoorNodes.pigs = { source, gain, lfo };
      }

      // Cows - distant mooing (very low, slow, resonant)
      {
        const buffer = this.createNoiseBuffer(8, 'brown');
        if (!buffer) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();

        source.buffer = buffer;
        source.loop = true;

        // Very low, resonant moo frequency
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(150, ctx.currentTime);
        filter.Q.setValueAtTime(5, ctx.currentTime); // Resonant

        // Very slow modulation - occasional moo (once every few seconds)
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.15 + Math.random() * 0.1, ctx.currentTime);
        // Full-depth moo swell
        const { trem } = this.createTremolo(ctx, lfo, 1);

        gain.gain.setValueAtTime(0.0008, ctx.currentTime); // Distant, quiet

        source.connect(filter);
        filter.connect(trem);
        trem.connect(gain);
        gain.connect(masterGain);

        this.startLoopAtRandomOffset(source);
        lfo.start();

        this.outdoorNodes.cows = { source, gain, lfo };
      }

      // Apply camera, time and weather weighting after every layer exists.
      this.adjustAmbientForTimeOfDay();

      // Weather set before the first gesture had no context to start rain in.
      if (this.currentWeather === 'rain' || this.currentWeather === 'storm') this.startRain();
    } catch (e) {
      audioLog.warn('Outdoor ambient sound start failed', e);
    }
  }

  stopOutdoorAmbient() {
    Object.values(this.outdoorNodes).forEach((node) => {
      if (node) {
        try {
          node.source.stop();
          node.lfo?.stop();
        } catch (e) {
          audioLog.warn('Failed to stop outdoor ambient', e);
        }
      }
    });
    this.outdoorNodes = {};
    this.lastOutdoorTargets = {};
  }

  // === TOWN HALL CLOCK CHIME ===

  private readonly TOWN_HALL_CLOCK_POS = {
    x: TOWN_HALL_CLOCK_POSITION[0],
    y: TOWN_HALL_CLOCK_POSITION[1],
    z: TOWN_HALL_CLOCK_POSITION[2],
  };
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

      // Single dignified bong per hour (not the full hour count)
      const bongs = chimeCount ?? 1;

      // Play each bong with slight delay between them (if multiple)
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

  // === SPEED ZONE SOUNDS ===

  // === EMERGENCY STOP SOUNDS ===

  private emergencyStopAlarmNode: {
    source: OscillatorNode;
    gain: GainNode;
    lfo: OscillatorNode;
  } | null = null;

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
  // No mute guard: the klaxon must sound if the user unmutes during the stop.
  startEmergencyStopAlarm() {
    if (this.emergencyStopAlarmNode) return;

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

  // === PA SYSTEM ANNOUNCEMENTS ===

  private paSystemActive: boolean = false;
  private paSystemInterval: NodeJS.Timeout | number | null = null;

  startPASystem() {
    if (this.paSystemActive) return;
    this.paSystemActive = true;

    const playRandomAnnouncement = () => {
      if (!this.paSystemActive) return;

      // Skip playback while muted or hidden, but keep scheduling so a later
      // unmute or visibility change resumes the bells.
      if (this._isTabVisible && this.getEffectiveVolume() > 0) {
        // Automated cycle bells and signal tones communicate plant state without voices.
        const announcementType = Math.random();
        if (announcementType < 0.5) {
          this.playCycleBell();
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

  playCycleBell() {
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
      audioLog.warn('Cycle bell playback failed', e);
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
      audioLog.warn('PA tone playback failed', e);
    }
  }

  // === INDUSTRIAL AMBIENT SOUNDS ===

  // Compressor cycling state
  private compressorActive: boolean = false;
  private compressorInterval: NodeJS.Timeout | number | null = null;
  private compressorOnTimeout: NodeJS.Timeout | number | null = null;
  private compressorStopTimeout: NodeJS.Timeout | number | null = null;
  private compressorNodes: CompressorAudioNodes | null = null;

  // Start industrial compressor cycling (kicks on/off periodically)
  startCompressorCycling() {
    if (this.compressorActive) return;
    this.compressorActive = true;

    const cycleCompressor = () => {
      this.compressorInterval = null;
      if (!this.compressorActive) return;

      // Random on duration (8-20 seconds)
      const onDuration = 8000 + Math.random() * 12000;
      // Random off duration (15-45 seconds)
      const offDuration = 15000 + Math.random() * 30000;

      // Muting or hiding a tab skips this audible cycle. Keep the scheduler
      // alive so a later unmute or visibility change can recover naturally.
      if (this.getEffectiveVolume() > 0 && this._isTabVisible) {
        this.startCompressorSound();

        this.compressorOnTimeout = setTimeout(() => {
          this.compressorOnTimeout = null;
          this.stopCompressorSound();
          if (this.compressorActive) {
            this.compressorInterval = setTimeout(cycleCompressor, offDuration);
          }
        }, onDuration);
      } else {
        this.compressorInterval = setTimeout(cycleCompressor, offDuration);
      }
    };

    // Start first cycle after a random delay
    this.compressorInterval = setTimeout(cycleCompressor, 5000 + Math.random() * 10000);
  }

  stopCompressorCycling() {
    this.compressorActive = false;
    if (this.compressorInterval !== null) {
      clearTimeout(this.compressorInterval);
      this.compressorInterval = null;
    }
    if (this.compressorOnTimeout !== null) {
      clearTimeout(this.compressorOnTimeout);
      this.compressorOnTimeout = null;
    }
    this.stopCompressorSound();
  }

  private startCompressorSound() {
    if (this.compressorNodes || this.getEffectiveVolume() === 0) return;

    let nodes: CompressorAudioNodes | null = null;
    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;
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
      nodes = { source, gain, lowpass, bandpass, lfo, lfoGain };

      // Record the complete graph before configuring or starting it. Any Web
      // Audio operation below may throw after an indefinite source has begun.
      this.compressorNodes = nodes;

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
      gain.connect(machineBus);

      source.start();
      lfo.start();

      // Play startup clunk
      this.playCompressorStartup();
    } catch (e) {
      if (nodes) this.disposeCompressorNodes(nodes);
      audioLog.warn('Compressor startup sound failed', e);
    }
  }

  private disposeCompressorNodes(nodes: CompressorAudioNodes) {
    for (const scheduledNode of [nodes.source, nodes.lfo]) {
      try {
        scheduledNode.stop();
      } catch (e) {
        audioLog.warn('Failed to stop compressor node', e);
      }
    }

    for (const node of [
      nodes.source,
      nodes.lowpass,
      nodes.bandpass,
      nodes.gain,
      nodes.lfo,
      nodes.lfoGain,
    ]) {
      try {
        node.disconnect();
      } catch (e) {
        audioLog.warn('Failed to disconnect compressor node', e);
      }
    }

    if (this.compressorNodes === nodes) {
      this.compressorNodes = null;
    }
  }

  private stopCompressorSound() {
    const nodes = this.compressorNodes;
    if (nodes && this.compressorStopTimeout === null) {
      try {
        const ctx = this.getContext();
        if (ctx) {
          // Fade out before stopping
          nodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
          this.compressorStopTimeout = setTimeout(() => {
            this.compressorStopTimeout = null;
            this.disposeCompressorNodes(nodes);
          }, 500);
        } else {
          this.disposeCompressorNodes(nodes);
        }
      } catch (e) {
        audioLog.warn('Compressor fade-out failed', e);
        this.disposeCompressorNodes(nodes);
      }
    }
  }

  // Compressor startup clunk sound
  private playCompressorStartup() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;
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
      gain.connect(machineBus);

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
      if (!this.metalClankActive) return;

      // Skip playback while muted or hidden, but keep scheduling so a later
      // unmute or visibility change resumes the clanks.
      if (this._isTabVisible && this.getEffectiveVolume() > 0) {
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
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;
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
        gain.connect(machineBus);

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
      noiseGain.connect(machineBus);

      noiseSource.start(currentTime);
      noiseSource.stop(currentTime + 0.1);
    } catch (e) {
      audioLog.warn('Heavy metal clank playback failed', e);
    }
  }

  // Light metal clank (wrench, small tool)
  private playMetalClankLight() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;
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
        gain.connect(machineBus);

        osc.start(currentTime);
        osc.stop(currentTime + 0.15);
      });
    } catch (e) {
      audioLog.warn('Light metal clank playback failed', e);
    }
  }

  // Metal ping (pipe, railing)
  private playMetalPing() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;
      const currentTime = ctx.currentTime;

      const baseFreq = 1000 + Math.random() * 500;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, currentTime);

      gain.gain.setValueAtTime(0.04, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.4);

      osc.connect(gain);
      gain.connect(machineBus);

      osc.start(currentTime);
      osc.stop(currentTime + 0.45);
    } catch (e) {
      audioLog.warn('Metal ping playback failed', e);
    }
  }

  // Chain rattle
  private playChainRattle() {
    if (this.getEffectiveVolume() === 0) return;

    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;
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
        gain.connect(machineBus);

        osc.start(startTime);
        osc.stop(startTime + 0.04);
      }
    } catch (e) {
      audioLog.warn('Chain rattle playback failed', e);
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
      audioLog.warn('Hydraulic lift sound failed', e);
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
  private lastRainTarget = -1;
  private thunderTimeout: ReturnType<typeof setTimeout> | null = null;

  // Rain on the roof reaches the factory floor muffled.
  private getRainTarget(): number {
    return 0.03 * (this.isCameraInsideFactory() ? 0.25 : 1);
  }

  // Persistent loop: no mute guard, so unmuting mid-storm brings the rain back.
  startRain() {
    if (this.weatherNodes.rain) return;

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

      // Fade in towards the camera-dependent level; adjustAmbientForTimeOfDay
      // retargets the same param as the camera crosses the factory walls.
      this.lastRainTarget = this.getRainTarget();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.setTargetAtTime(this.lastRainTarget, ctx.currentTime, 0.8);

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(masterGain);

      this.startLoopAtRandomOffset(source);
      this.weatherNodes.rain = { source, gain };
      this.isRaining = true;
      this.scheduleThunder();
    } catch (e) {
      audioLog.warn('Rain sound start failed', e);
    }
  }

  stopRain() {
    this.isRaining = false;
    if (this.thunderTimeout !== null) {
      clearTimeout(this.thunderTimeout);
      this.thunderTimeout = null;
    }
    // Detach synchronously so a quick return to rain starts a fresh bed
    // instead of finding this one mid-fade, and the delayed stop below can
    // only ever reach the node it faded.
    const rain = this.weatherNodes.rain;
    this.weatherNodes.rain = undefined;
    this.lastRainTarget = -1;
    if (rain) {
      try {
        const ctx = this.getContext();
        if (ctx) {
          rain.gain.gain.setTargetAtTime(0, ctx.currentTime, 1);
          setTimeout(() => {
            try {
              rain.source.stop();
            } catch (e) {
              audioLog.warn('Failed to stop rain sound', e);
            }
          }, 3000);
        } else {
          rain.source.stop();
        }
      } catch (e) {
        audioLog.warn('Rain fade-out failed', e);
      }
    }
  }

  private scheduleThunder() {
    if (!this.isRaining || this.thunderTimeout !== null) return;
    const delay = 15000 + Math.random() * 45000;
    this.thunderTimeout = setTimeout(() => {
      this.thunderTimeout = null;
      if (this.isRaining) {
        this.playThunder();
        this.scheduleThunder();
      }
    }, delay);
  }

  private playThunder() {
    // Rain alone is steady; thunder belongs to storms.
    if (this.getEffectiveVolume() === 0 || !this.isRaining || this.currentWeather !== 'storm') {
      return;
    }

    try {
      const ctx = this.getContext();
      const masterGain = this.getMasterGain();
      if (!ctx || !masterGain) return;
      const currentTime = ctx.currentTime;

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

  // Persistent loop: no mute guard, for the same reason as startConveyorSound.
  startSpoutingSound(spoutId: string, x: number, y: number, z: number) {
    if (this.spoutingNodes.has(spoutId)) return;

    try {
      const ctx = this.getContext();
      const machineBus = this.getMachineBus();
      if (!ctx || !machineBus) return;

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
      gain.connect(machineBus);

      this.startLoopAtRandomOffset(source);
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

  // === POWER FLICKER SOUNDS ===

  // === WATER DRIP SOUNDS ===

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
      audioLog.warn('Door open sound failed', e);
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
      audioLog.warn('Door close sound failed', e);
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

  getDiagnostics(): {
    activeNodes: number;
    contextState: AudioContextState | 'not-created';
  } {
    const objectNodeCount =
      Object.values(this.ambientNodes).filter(Boolean).length +
      Object.values(this.outdoorNodes).filter(Boolean).length;
    const mappedNodeCount =
      this.machineNodes.size +
      this.forkliftEngines.size +
      this.truckEngines.size +
      this.backupBeepers.size +
      this.conveyorNodes.size +
      this.spoutingNodes.size;
    return {
      activeNodes: objectNodeCount + mappedNodeCount,
      contextState: this.audioContext?.state ?? 'not-created',
    };
  }

  // Stop all sounds
  stopAll() {
    this.stopMusic();
    this.stopAmbientSounds();
    this.stopOutdoorAmbient();
    this.stopNightAmbient();
    this.stopPASystem();
    this.stopRain();
    this.stopEmergencyStopAlarm();
    this.stopCompressorCycling();
    this.stopMetalClanks();
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
  }
}

export const audioManager = new AudioManager();
