import * as THREE from 'three';

// Shared, texture-free tool materials. Their lifetime is the application.
export const SHARED_WORKER_MATERIALS = {
  // Face features
  eyeWhite: new THREE.MeshStandardMaterial({ color: '#fefefe', roughness: 0.2 }),
  iris: new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.3 }),
  pupil: new THREE.MeshStandardMaterial({ color: '#0a0a0a' }),
  lips: new THREE.MeshStandardMaterial({ color: '#a0524a', roughness: 0.7 }),

  // Generic colors
  black: new THREE.MeshStandardMaterial({ color: '#0a0a0a' }),
  darkGray: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3 }),
  mediumGray: new THREE.MeshStandardMaterial({ color: '#333333' }),
  white: new THREE.MeshStandardMaterial({ color: '#ffffff' }),
  offWhite: new THREE.MeshStandardMaterial({ color: '#e5e5e5', roughness: 0.7 }),
  reflective: new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    emissive: '#ffffff',
    emissiveIntensity: 0.22,
    metalness: 0.3,
    roughness: 0.2,
  }),
  boot: new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.78 }),
  glove: new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.62 }),
  safetyLens: new THREE.MeshStandardMaterial({
    color: '#c9edff',
    transparent: true,
    opacity: 0.48,
    roughness: 0.08,
    metalness: 0.05,
    depthWrite: false,
  }),
  sampleGlass: new THREE.MeshStandardMaterial({
    color: '#dbeafe',
    transparent: true,
    opacity: 0.62,
    roughness: 0.12,
    depthWrite: false,
  }),
  sampleCap: new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.55 }),
  badgeWhite: new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.45 }),

  // Metallic
  chrome: new THREE.MeshStandardMaterial({
    color: '#c0c0c0',
    metalness: 0.8,
    roughness: 0.2,
  }),
  chromeShiny: new THREE.MeshStandardMaterial({
    color: '#c0c0c0',
    metalness: 0.9,
    roughness: 0.3,
  }),

  // Safety equipment
  vestOrange: new THREE.MeshStandardMaterial({
    color: '#f97316',
    emissive: '#7c2d12',
    emissiveIntensity: 0.035,
    roughness: 0.6,
  }),
  safetyGreen: new THREE.MeshStandardMaterial({
    color: '#22c55e',
    emissive: '#22c55e',
    emissiveIntensity: 0.5,
  }),
  safetyGreenBright: new THREE.MeshStandardMaterial({
    color: '#22c55e',
    emissive: '#22c55e',
    emissiveIntensity: 2,
  }),

  // Equipment
  screenBlue: new THREE.MeshStandardMaterial({
    color: '#1e40af',
    emissive: '#1e40af',
    emissiveIntensity: 0.3,
  }),
  clipboardBrown: new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.7 }),
  lensBlue: new THREE.MeshStandardMaterial({
    color: '#a0d8ef',
    transparent: true,
    opacity: 0.4,
  }),
  handleRed: new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.8 }),
};

// Fixed fittings have application lifetime, like the existing tool materials.
// Colour variants and rigs remain private to each person. Working if removing
// one worker leaves the other workers' glasses, badges and banding intact.
export const SHARED_WORKER_ACCESSORY_MATERIALS = {
  glasses: new THREE.MeshPhysicalMaterial({
    color: '#c6e6f5',
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  }),
  dark: new THREE.MeshStandardMaterial({
    color: '#20272d',
    roughness: 0.7,
    metalness: 0.08,
  }),
  badge: new THREE.MeshStandardMaterial({
    color: '#f4f7f8',
    roughness: 0.48,
    metalness: 0.02,
  }),
  // Retroreflective banding. The read comes from a very tight sheen lobe plus
  // an elevated environment contribution, not from an emissive cheat: at
  // 0.10 this stays below the 1.0 linear threshold that only behaves inside
  // the composer, so it looks the same on the 'low' tier where none exists.
  reflective: new THREE.MeshPhysicalMaterial({
    color: '#f2f7ea',
    emissive: '#cfe0d4',
    emissiveIntensity: 0.1,
    roughness: 0.26,
    metalness: 0,
    sheen: 1,
    sheenColor: new THREE.Color('#ffffff'),
    sheenRoughness: 0.12,
    envMapIntensity: 2.4,
  }),
};
