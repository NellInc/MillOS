/**
 * Asset URLs that the startup world loads through a Suspense loader hook.
 *
 * This module must stay a leaf (no imports). App.tsx imports it, through
 * utils/startupAssetPreload.ts, at module scope so the downloads start
 * before the scene chunk evaluates; anything imported here would be pulled
 * into the initial bundle and evaluated first. The owning components
 * re-export these, so their importers are unchanged.
 */

export const HERITAGE_ART = {
  dino: `${import.meta.env.BASE_URL}textures/signage/dead-dino.webp`,
  wheat: `${import.meta.env.BASE_URL}textures/signage/wheat-sheaf.webp`,
} as const;

/** Complete raster prints retain painted lettering, illustration and paper together.
 * Working if each fitted print stays in the old seat, loads through useTexture,
 * and its actual colour texture also drives the existing dimmed emission.
 */
export const HERITAGE_PRINT_ART = {
  flour: `${import.meta.env.BASE_URL}textures/signage/flour-painted-v1.webp`,
  dino: `${import.meta.env.BASE_URL}textures/signage/dino-painted-v3.webp`,
  route: `${import.meta.env.BASE_URL}textures/signage/route-painted-v1.webp`,
  bakery: `${import.meta.env.BASE_URL}textures/signage/bakery-painted-v1.webp`,
  butcher: `${import.meta.env.BASE_URL}textures/signage/butcher-painted-v1.webp`,
  grocer: `${import.meta.env.BASE_URL}textures/signage/grocer-painted-v1.webp`,
} as const;

/** Each world business owns its name, symbol and application field.
 * Working if each name keeps its distinct raster identity on the existing sign seat.
 */
export const BUSINESS_BRANDS = {
  dino: {
    name: 'DEAD DINO',
    field: '#143c36',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-dead-dino-v3.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-dead-dino-fascia-v3.webp`,
    pylon: `${import.meta.env.BASE_URL}textures/signage/brand-dead-dino-pylon-v3.webp`,
  },
  bakery: {
    name: 'Riverside Bakers',
    field: '#2d2530',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-riverside-bakers-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-riverside-bakers-fascia-v1.webp`,
  },
  butcher: {
    name: 'Fieldgate Butchers',
    field: '#183b30',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-fieldgate-butchers-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-fieldgate-butchers-fascia-v1.webp`,
  },
  grocer: {
    name: 'Canalside Provisions',
    field: '#1c354b',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-canalside-provisions-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-canalside-provisions-fascia-v1.webp`,
  },
  mill: {
    name: 'MillOS',
    field: '#173c45',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-millos-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-millos-v1.webp`,
  },
  flourExpress: {
    name: 'FLOUR EXPRESS',
    field: '#703828',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-flour-express-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-flour-express-v1.webp`,
  },
  workshop: {
    name: 'Mill Workshop',
    field: '#173c45',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-workshop-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-workshop-v1.webp`,
  },
  cafe: {
    name: 'Pondside Café',
    field: '#f4e5c6',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-cafe-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-cafe-v1.webp`,
  },
  electrical: {
    name: 'Electrical',
    field: '#173c45',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-electrical-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-electrical-v1.webp`,
  },
  security: {
    name: 'Security',
    field: '#173c45',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-security-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-security-v1.webp`,
  },
  grainCo: {
    name: 'GRAIN CO',
    field: '#183d35',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-grain-co-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-grain-co-v1.webp`,
  },
  inn: {
    name: 'Flour & Barrel',
    field: '#143c2b',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-inn-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-inn-fascia-v1.webp`,
  },
  blacksmith: {
    name: 'Blacksmith',
    field: '#25343c',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-blacksmith-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-blacksmith-v1.webp`,
  },
  school: {
    name: 'Village School',
    field: '#263f55',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-school-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-school-v1.webp`,
  },
  townHall: {
    name: 'Town Hall',
    field: '#173c45',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-town-hall-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-town-hall-v1.webp`,
  },
  greengrocer: {
    name: 'Greengrocer',
    field: '#285136',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-market-greengrocer-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-market-greengrocer-v1.webp`,
  },
  cheesemonger: {
    name: 'Cheesemonger',
    field: '#1d344d',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-market-cheesemonger-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-market-cheesemonger-v1.webp`,
  },
  breadRolls: {
    name: 'Bread & Rolls',
    field: '#602b32',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-market-bread-rolls-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-market-bread-rolls-v1.webp`,
  },
  harvest: {
    name: 'Farm Harvest',
    field: '#c99031',
    primary: `${import.meta.env.BASE_URL}textures/signage/brand-market-harvest-v1.webp`,
    fascia: `${import.meta.env.BASE_URL}textures/signage/brand-market-harvest-v1.webp`,
  },
} as const;

export const STATION_RETAIL_ART = `${import.meta.env.BASE_URL}textures/signage/station-retail-raster-v1.webp`;
export const STATION_SOUVENIR_ART = `${import.meta.env.BASE_URL}textures/signage/dead-dino-shop-kit-v1.webp`;

/** The two anonymous worker bodies (models/WorkerModel.tsx). */
export const WORKER_ASSET_PATHS = {
  masculine: `${import.meta.env.BASE_URL}models/worker/worker-masculine.glb`,
  feminine: `${import.meta.env.BASE_URL}models/worker/worker-feminine.glb`,
} as const;
