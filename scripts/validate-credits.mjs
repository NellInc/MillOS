#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDirectory = path.join(root, 'public');
const manifestPath = path.join(root, 'music-credits.json');
const modelCreditsPath = path.join(root, 'model-credits.json');
const modelManifestPath = path.join(publicDirectory, 'models', 'asset-manifest.json');
const creditsPath = path.join(publicDirectory, 'MUSIC_CREDITS.txt');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const modelCredits = JSON.parse(fs.readFileSync(modelCreditsPath, 'utf8'));
const modelManifest = JSON.parse(fs.readFileSync(modelManifestPath, 'utf8'));
const failures = [];

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.tracks)) {
  failures.push('music-credits.json must use schemaVersion 1 and contain a tracks array.');
}
if (manifest.licenseUrl !== 'https://creativecommons.org/licenses/by/4.0/') {
  failures.push('The music licence URL must identify CC BY 4.0.');
}

const validRoles = new Set([null, 'playlist', 'victory-fanfare']);
const uniqueFields = ['id', 'file', 'isrc'];
for (const field of uniqueFields) {
  const values = manifest.tracks.map((track) => track[field]);
  if (values.some((value) => typeof value !== 'string' || value.length === 0)) {
    failures.push(`Every music track must have a non-empty ${field}.`);
  }
  if (new Set(values).size !== values.length) {
    failures.push(`Music track ${field} values must be unique.`);
  }
}

for (const track of manifest.tracks) {
  if (!track.title || !track.artist) {
    failures.push(`${track.file ?? 'Unknown track'} is missing a title or artist.`);
  }
  if (!/^US[A-Z0-9]{10}$/.test(track.isrc ?? '')) {
    failures.push(`${track.file ?? 'Unknown track'} has an invalid ISRC.`);
  }
  if (!validRoles.has(track.currentRole)) {
    failures.push(`${track.file ?? 'Unknown track'} has an invalid currentRole.`);
  }
}

const publicAudio = fs
  .readdirSync(publicDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
  .map((entry) => entry.name)
  .sort();
const creditedAudio = manifest.tracks.map((track) => track.file).sort();
const uncredited = publicAudio.filter((file) => !creditedAudio.includes(file));
const missing = creditedAudio.filter((file) => !publicAudio.includes(file));
if (uncredited.length > 0) failures.push(`Uncredited MP3 files: ${uncredited.join(', ')}`);
if (missing.length > 0)
  failures.push(`Credited MP3 files missing from public: ${missing.join(', ')}`);

const playlist = manifest.tracks.filter((track) => track.currentRole === 'playlist');
const fanfares = manifest.tracks.filter((track) => track.currentRole === 'victory-fanfare');
if (playlist.length === 0) failures.push('At least one current playlist track is required.');
if (fanfares.length !== 1) failures.push('Exactly one current victory fanfare is required.');

if (!fs.existsSync(creditsPath)) {
  failures.push('public/MUSIC_CREDITS.txt is missing.');
} else {
  const credits = fs.readFileSync(creditsPath, 'utf8');
  if (!credits.includes(manifest.licenseUrl)) {
    failures.push('MUSIC_CREDITS.txt does not contain the canonical licence URL.');
  }
  for (const track of manifest.tracks) {
    if (!credits.includes(track.title) || !credits.includes(track.isrc)) {
      failures.push(`MUSIC_CREDITS.txt is missing ${track.title} or its ISRC.`);
    }
  }
}

const deliveredModelCredits = modelManifest.assets.map(({ id, source, license, attribution }) => ({
  id,
  source,
  license,
  attribution,
}));
if (JSON.stringify(modelCredits.assets) !== JSON.stringify(deliveredModelCredits)) {
  failures.push('model-credits.json must exactly match the delivered asset manifest credits.');
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Credits passed: ${manifest.tracks.length} music files, ${playlist.length} playlist tracks, ${fanfares.length} fanfare, ${modelCredits.assets.length} model credits.`
  );
}
