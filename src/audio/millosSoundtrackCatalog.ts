export interface MusicTrack {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly artist: string;
  readonly trackNumber?: number;
  readonly artwork?: string;
  readonly durationSeconds?: number;
  readonly sunoUrl?: string;
}

const asset = (path: string): string => `${import.meta.env.BASE_URL}${path}`;

export const MILLOS_ORIGINAL_SOUNDTRACK = [
  {
    id: 'millos_the_mill_wakes',
    name: 'The Mill Wakes',
    file: asset('audio/millos-originals/01-the-mill-wakes.mp3'),
    artist: 'Nell Watson',
    trackNumber: 1,
    artwork: asset('audio/millos-originals/artwork/01-the-mill-wakes.jpeg'),
    durationSeconds: 289.560979,
    sunoUrl: 'https://suno.com/song/d140bfb7-f462-43e7-8673-ad659a27fdf0',
  },
  {
    id: 'millos_grain_at_the_gate',
    name: 'Grain at the Gate',
    file: asset('audio/millos-originals/02-grain-at-the-gate.mp3'),
    artist: 'Nell Watson',
    trackNumber: 2,
    artwork: asset('audio/millos-originals/artwork/02-grain-at-the-gate.jpeg'),
    durationSeconds: 299.959979,
    sunoUrl: 'https://suno.com/song/261fb36b-54dc-49a3-aebc-3daf01b5c93f',
  },
  {
    id: 'millos_between_the_rolls',
    name: 'Between the Rolls',
    file: asset('audio/millos-originals/03-between-the-rolls.mp3'),
    artist: 'Nell Watson',
    trackNumber: 3,
    artwork: asset('audio/millos-originals/artwork/03-between-the-rolls.jpeg'),
    durationSeconds: 374.959979,
    sunoUrl: 'https://suno.com/song/53ef33f5-420a-4694-8d06-422c65964776',
  },
  {
    id: 'millos_the_sifters_sing',
    name: 'The Sifters Sing',
    file: asset('audio/millos-originals/04-the-sifters-sing.mp3'),
    artist: 'Nell Watson',
    trackNumber: 4,
    artwork: asset('audio/millos-originals/artwork/04-the-sifters-sing.jpeg'),
    durationSeconds: 316.079979,
    sunoUrl: 'https://suno.com/song/0b33cbf8-d6fd-4978-a7bc-64f0a05be03f',
  },
  {
    id: 'millos_forty_two_bags_a_minute',
    name: 'Forty-Two Bags a Minute',
    file: asset('audio/millos-originals/05-forty-two-bags-a-minute.mp3'),
    artist: 'Nell Watson',
    trackNumber: 5,
    artwork: asset('audio/millos-originals/artwork/05-forty-two-bags-a-minute.jpeg'),
    durationSeconds: 213.400167,
    sunoUrl: 'https://suno.com/song/2a4ba9da-a263-4ae4-bfa9-48945ea632d8',
  },
  {
    id: 'millos_safe_hands_clear_ways',
    name: 'Safe Hands, Clear Ways',
    file: asset('audio/millos-originals/06-safe-hands-clear-ways.mp3'),
    artist: 'Nell Watson',
    trackNumber: 6,
    artwork: asset('audio/millos-originals/artwork/06-safe-hands-clear-ways.jpeg'),
    durationSeconds: 262.799979,
    sunoUrl: 'https://suno.com/song/d27d7e18-debd-4e0b-8b7e-85d3fa50e39b',
  },
  {
    id: 'millos_every_grain_every_watt',
    name: 'Every Grain, Every Watt',
    file: asset('audio/millos-originals/07-every-grain-every-watt.mp3'),
    artist: 'Nell Watson',
    trackNumber: 7,
    artwork: asset('audio/millos-originals/artwork/07-every-grain-every-watt.jpeg'),
    durationSeconds: 269.959979,
    sunoUrl: 'https://suno.com/song/ebc76c4c-22a7-4eb2-b703-a0f92d8935e5e',
  },
  {
    id: 'millos_partner_in_the_control_room',
    name: 'Partner in the Control Room',
    file: asset('audio/millos-originals/08-partner-in-the-control-room.mp3'),
    artist: 'Nell Watson',
    trackNumber: 8,
    artwork: asset('audio/millos-originals/artwork/08-partner-in-the-control-room.jpeg'),
    durationSeconds: 232.120167,
    sunoUrl: 'https://suno.com/song/42f46ca5-69c0-44c6-be8d-b51538fa0da3',
  },
] as const satisfies readonly MusicTrack[];

export function formatMusicTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
}
