// Minimal WebAudio synthesizer for critter sounds
// Avoids loading assets, keeps performance high.

// Extend Window type for webkit-prefixed AudioContext
interface WebkitWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

const ctx =
  typeof window !== 'undefined'
    ? new (window.AudioContext || (window as WebkitWindow).webkitAudioContext!)()
    : null;

type CritterType =
  | 'cat'
  | 'dog'
  | 'duck'
  | 'frog'
  | 'chicken'
  | 'pig'
  | 'cow'
  | 'horse'
  | 'sheep'
  | 'crow'
  | 'bird'
  | 'bell';

export const playCritterSound = (type: CritterType) => {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  // Default volume (can be clamped)
  const vol = 0.1;

  switch (type) {
    case 'cat': // Meow: High pitch falling to low
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.4);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.1);
      gain.gain.linearRampToValueAtTime(0, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
      break;

    case 'duck': // Quack: Sawtooth, fast vibrato or just short burst
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.linearRampToValueAtTime(300, t + 0.15);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
      break;

    case 'frog': // Ribbit: Low square wave, short
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.linearRampToValueAtTime(100, t + 0.1);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.02);
      gain.gain.linearRampToValueAtTime(0, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);

      // Double ribbit
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'square';
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.setValueAtTime(150, t + 0.15);
      osc2.frequency.linearRampToValueAtTime(100, t + 0.25);
      gain2.gain.setValueAtTime(0, t + 0.15);
      gain2.gain.linearRampToValueAtTime(vol, t + 0.17);
      gain2.gain.linearRampToValueAtTime(0, t + 0.25);
      osc2.start(t + 0.15);
      osc2.stop(t + 0.25);
      break;

    case 'chicken': // Cluck: Short sine burst
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
      break;

    case 'pig': // Oink: Low sawtooth, snort
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.linearRampToValueAtTime(80, t + 0.2);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
      break;

    case 'cow': // Moo: Long low triangle
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.linearRampToValueAtTime(120, t + 1.0);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.2);
      gain.gain.linearRampToValueAtTime(0, t + 1.0);
      osc.start(t);
      osc.stop(t + 1.0);
      break;

    case 'sheep': // Baa: Tremolo square/saw
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, t);
      // Simple tremolo via gain modulation would be better but this is simple:
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.6);
      break;

    case 'horse': // Neigh: High pitch wobble
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.linearRampToValueAtTime(400, t + 0.5);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.1);
      gain.gain.linearRampToValueAtTime(0, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.5);
      break;

    case 'crow': // Caw: Noisy (approximated with dissonant oscillators)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(500, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.1);
      gain.gain.linearRampToValueAtTime(0, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
      break;

    case 'dog': // Woof
      osc.type = 'square';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.15);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
      break;

    case 'bird': // Tweet: High sine chirp
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1500, t);
      osc.frequency.linearRampToValueAtTime(2000, t + 0.1);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.05);
      gain.gain.linearRampToValueAtTime(0, t + 0.2);
      osc.start(t);
      osc.stop(t + 0.2);
      break;

    case 'bell': // School bell: Deep Church Bell
      // Fundamental (Deep A3)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220.0, t); // A3 (Much deeper)
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol * 1.2, t + 0.02); // Slightly louder attack
      gain.gain.exponentialRampToValueAtTime(0.001, t + 4.0); // Very long resonant decay
      osc.start(t);
      osc.stop(t + 4.0);

      // Overtone 1: The "clang" (Minor 3rd up + high inharmonics)
      const oscBell2 = ctx.createOscillator();
      const gainBell2 = ctx.createGain();
      oscBell2.connect(gainBell2);
      gainBell2.connect(ctx.destination);
      oscBell2.type = 'sine';
      oscBell2.frequency.setValueAtTime(220.0 * 1.2, t); // Minor 3rdish dissonance
      gainBell2.gain.setValueAtTime(0, t);
      gainBell2.gain.linearRampToValueAtTime(vol * 0.6, t + 0.05);
      gainBell2.gain.exponentialRampToValueAtTime(0.001, t + 2.5); // Longer metallic ring
      oscBell2.start(t);
      oscBell2.stop(t + 2.5);

      // Overtone 2: High shimmer
      const oscBell3 = ctx.createOscillator();
      const gainBell3 = ctx.createGain();
      oscBell3.connect(gainBell3);
      gainBell3.connect(ctx.destination);
      oscBell3.type = 'sine';
      oscBell3.frequency.setValueAtTime(220.0 * 2.6, t);
      gainBell3.gain.setValueAtTime(0, t);
      gainBell3.gain.linearRampToValueAtTime(vol * 0.3, t + 0.01); // Fast attack
      gainBell3.gain.exponentialRampToValueAtTime(0.001, t + 1.0); // Shorter high ring
      oscBell3.start(t);
      oscBell3.stop(t + 1.0);
      break;

    default:
      osc.disconnect();
      gain.disconnect();
      break;
  }
};
