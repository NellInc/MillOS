/**
 * The school bell's voice: a synthesised bronze strike.
 *
 * A cast bell does not ring a harmonic series. Its tuned partials are the hum
 * (an octave below the strike note), the prime, a minor-third tierce, a quint
 * and the nominal an octave above the prime, each decaying at its own rate:
 * the high partials die within a couple of seconds and the hum carries on long
 * after. Hum and prime are each a slightly detuned pair, which gives the slow
 * beat ("warble") of a real casting that is never perfectly round. A short
 * band-passed noise burst is the clapper's strike.
 *
 * It plays on audioManager's shared context into its master gain, as
 * critterAudio does, so the master volume, mute and hidden-tab silence all
 * apply. Muted, it creates no nodes at all. Distance is the caller's: the
 * level falls off as an inverse distance past `SCHOOL_BELL_REF_DISTANCE`, with
 * a floor so that a bell the player has just clicked from the far orbit camera
 * is still heard, quietly.
 */
import { audioManager } from '../utils/audioManager';

/** Strike note (the prime), Hz: E4, a small school bell's voice. */
export const SCHOOL_BELL_PRIME_HZ = 330;

export interface BellPartial {
  name: string;
  /** Frequency as a multiple of the prime. */
  ratio: number;
  /** Peak level relative to the strike. */
  gain: number;
  /** Seconds from the strike to -80 dB. */
  decay: number;
  /** Detune of the beating pair, as a fraction of the frequency; 0 for one oscillator. */
  beat: number;
}

export const SCHOOL_BELL_PARTIALS: readonly BellPartial[] = [
  { name: 'hum', ratio: 0.5, gain: 0.3, decay: 7.5, beat: 0.0022 },
  { name: 'prime', ratio: 1, gain: 0.24, decay: 5, beat: 0.0014 },
  { name: 'tierce', ratio: 1.2, gain: 0.28, decay: 3.6, beat: 0 },
  { name: 'quint', ratio: 1.5, gain: 0.1, decay: 2.6, beat: 0 },
  { name: 'nominal', ratio: 2, gain: 0.22, decay: 2.2, beat: 0 },
  { name: 'superquint', ratio: 3.01, gain: 0.07, decay: 1.2, beat: 0 },
  { name: 'octave nominal', ratio: 4.03, gain: 0.04, decay: 0.8, beat: 0 },
];

/** Full level inside this distance, m. */
export const SCHOOL_BELL_REF_DISTANCE = 14;
/** Overall level at or inside the reference distance. */
export const SCHOOL_BELL_LEVEL = 0.14;
/** The farthest listener still hears this fraction of the full level. */
export const SCHOOL_BELL_LEVEL_FLOOR = 0.15;

/** Level for a listener `distance` metres from the bell. */
export function schoolBellLevel(distance: number): number {
  const d = Number.isFinite(distance) ? Math.max(0, distance) : SCHOOL_BELL_REF_DISTANCE;
  const rolloff = SCHOOL_BELL_REF_DISTANCE / Math.max(SCHOOL_BELL_REF_DISTANCE, d);
  return SCHOOL_BELL_LEVEL * Math.max(SCHOOL_BELL_LEVEL_FLOOR, rolloff);
}

const SILENT = 0.0001;

/**
 * Strike the bell once. `pan` is -1 (left) to 1 (right) from the listener.
 * Returns false, creating nothing, when muted or before audio exists.
 */
export function playSchoolBell({ distance, pan = 0 }: { distance: number; pan?: number }): boolean {
  if (audioManager.muted) return false;
  // Every caller is a click or key activation, so this gesture may resume audio.
  void audioManager.resume().catch(() => undefined);
  const ctx = audioManager.getAudioContext();
  const out = audioManager.getAnalyzerMasterGain();
  if (!ctx || !out) return false;

  const t = ctx.currentTime + 0.005;
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(schoolBellLevel(distance), t);
  const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
  if (panner) {
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0)), t);
    bus.connect(panner);
    panner.connect(out);
  } else {
    bus.connect(out);
  }

  let last: AudioScheduledSourceNode | null = null;
  let lastEnd = 0;
  for (const partial of SCHOOL_BELL_PARTIALS) {
    const frequency = SCHOOL_BELL_PRIME_HZ * partial.ratio;
    const detunes = partial.beat > 0 ? [-partial.beat / 2, partial.beat / 2] : [0];
    for (const detune of detunes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency * (1 + detune), t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(partial.gain / detunes.length, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(SILENT, t + partial.decay);
      osc.connect(gain);
      gain.connect(bus);
      const end = t + partial.decay + 0.05;
      osc.start(t);
      osc.stop(end);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      if (end > lastEnd) {
        lastEnd = end;
        last = osc;
      }
    }
  }

  // The clapper's strike: 25 ms of noise through a band around the nominal.
  const samples = Math.max(1, Math.floor(ctx.sampleRate * 0.025));
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  const strike = ctx.createBufferSource();
  const band = ctx.createBiquadFilter();
  const strikeGain = ctx.createGain();
  strike.buffer = buffer;
  band.type = 'bandpass';
  band.frequency.setValueAtTime(SCHOOL_BELL_PRIME_HZ * 4, t);
  band.Q.setValueAtTime(1.2, t);
  strikeGain.gain.setValueAtTime(0.35, t);
  strike.connect(band);
  band.connect(strikeGain);
  strikeGain.connect(bus);
  strike.start(t);
  strike.onended = () => {
    strike.disconnect();
    band.disconnect();
    strikeGain.disconnect();
  };

  if (last) {
    const previous = last.onended;
    last.onended = (event) => {
      if (typeof previous === 'function') previous.call(last!, event);
      bus.disconnect();
      panner?.disconnect();
    };
  }
  return true;
}
