import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FEATURE_FLAGS, HUMAN_PRESENCE_POLICY } from './featureFlags';
import {
  APPROVED_PERSONNEL,
  forbiddenPersonnelPath,
  forbiddenPersonnelRuntime,
  validatePersonnelManifest,
  validateCommunitySource,
  validateCommunityBuild,
} from '../../scripts/validate-uncrewed-build.mjs';

const source = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8');
const manifest = () => JSON.parse(source('public/models/asset-manifest.json'));

describe('inhabited-world and autonomous-vehicle contract', () => {
  it('enables anonymous personnel while retaining explicit exclusions', () => {
    expect(Object.isFrozen(HUMAN_PRESENCE_POLICY)).toBe(true);
    expect(HUMAN_PRESENCE_POLICY).toEqual({
      personnelModels: true,
      vehicleOperators: false,
      remoteAvatars: false,
      humanVoiceAudio: false,
      workforceUI: false,
    });
    expect(FEATURE_FLAGS).not.toHaveProperty('WORKER_DIALOGUE_ENABLED');
  });

  it('imports and mounts authored people and community details in the live scene', () => {
    expect(
      validateCommunitySource({
        policy: source('src/config/featureFlags.ts'),
        scene: source('src/components/MillScene.tsx'),
        community: source('src/components/CommunityLife.tsx'),
      })
    ).toEqual([]);
  });

  it('ships exactly the approved locally licensed CC0 personnel bodies', () => {
    expect(validatePersonnelManifest(manifest())).toEqual([]);
    expect(readdirSync(resolve(process.cwd(), 'public/models/worker')).sort()).toEqual([
      'LICENSE-QUATERNIUS.txt',
      'worker-feminine.glb',
      'worker-masculine.glb',
    ]);
    expect(source('public/models/worker/LICENSE-QUATERNIUS.txt')).toMatch(/CC0|public domain/i);
    for (const asset of APPROVED_PERSONNEL) {
      const bytes = readFileSync(resolve(process.cwd(), 'public/models', asset.file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(forbiddenPersonnelPath(`models/${asset.file}`)).toBe(false);
    }
  });

  it('rejects missing bodies, weaker licences and unapproved personnel without rejecting animal clip aliases', () => {
    const original = manifest();
    const missing = structuredClone(original);
    missing.assets = missing.assets.filter(({ id }: { id: string }) => id !== 'worker-masculine');
    expect(validatePersonnelManifest(missing)).toContain(
      'missing or invalid approved CC0 personnel: worker-masculine'
    );
    const relicensed = structuredClone(original);
    relicensed.assets.find(({ id }: { id: string }) => id === 'worker-feminine').license =
      'unknown';
    expect(validatePersonnelManifest(relicensed).length).toBeGreaterThan(0);
    const injected = structuredClone(original);
    injected.assets.push({
      id: 'guest-avatar',
      file: 'extras/person.glb',
      role: 'animated-character',
    });
    expect(validatePersonnelManifest(injected)).toContain(
      'unapproved personnel asset: guest-avatar'
    );
    for (const path of [
      'models/worker/extra.glb',
      'models/worker/worker-masculine.glb.bak',
      'models/remote-avatar.glb',
      'assets/workers/voice.mp3',
      'portraits/person.png',
      'textures/worker_normal.ktx2',
    ]) {
      expect(forbiddenPersonnelPath(path), path).toBe(true);
    }
    expect(forbiddenPersonnelPath('models/farm/duck.glb')).toBe(false);
  });

  it('fails positive source requirements when personnel are disabled, unmounted or missing their scene root', () => {
    const valid = {
      policy:
        'personnelModels:true, vehicleOperators:false, remoteAvatars:false, humanVoiceAudio:false, workforceUI:false',
      scene: 'import { CommunityLife } from "./CommunityLife"; <CommunityLife />',
      community:
        'COMMUNITY_ROSTER.map(() => <WorkerModel />); <group name="world-personnel"/><group name="world-community-details"/>',
    };
    expect(validateCommunitySource(valid)).toEqual([]);
    expect(
      validateCommunitySource({
        ...valid,
        policy: valid.policy.replace('personnelModels:true', 'personnelModels:false'),
      })
    ).toContain('personnelModels must be enabled');
    expect(validateCommunitySource({ ...valid, scene: '' })).toContain(
      'MillScene must import and mount CommunityLife'
    );
    expect(validateCommunitySource({ ...valid, community: '' }).length).toBeGreaterThan(0);
  });

  it('retains canaries for forbidden voices, remote avatars, portraits and vehicle crews', () => {
    for (const content of [
      'speechSynthesis.speak()',
      'startWorkerVoices()',
      'startRadioChatter()',
      '<RemotePlayerAvatar />',
      '<SeatedVehicleOperator />',
      'portraitPath: "/portraits/person.png"',
      '<WorkforcePanel />',
    ]) {
      expect(forbiddenPersonnelRuntime(content).length, content).toBeGreaterThan(0);
    }
    expect(
      forbiddenPersonnelRuntime('<WorkerModel appearance={appearance} motion={motion} />')
    ).toEqual([]);
  });

  it('keeps vehicles autonomous and does not revive retired voice or workforce UI layers', () => {
    const paths = [
      'src/components/models/ForkliftModel.tsx',
      'src/components/truckbay/OptimizedTruckBay.tsx',
      'src/components/TruckBay.tsx',
      'src/App.tsx',
      'src/components/ui-new/GameInterface.tsx',
      'src/components/ui-new/dock/Dock.tsx',
      'src/components/ui-new/panels/OverviewPanel.tsx',
      'src/components/ui-new/sidebar/ContextSidebar.tsx',
      'src/components/ui-new/sidebar/panelPreloader.ts',
      'src/components/mobile/MobilePanel.tsx',
      'src/components/ui-new/panels/SettingsPanel.tsx',
      'src/utils/audioManager.ts',
      'src/hooks/useAudioState.ts',
      'src/components/game/PAAnnouncementSystem.tsx',
    ];
    for (const path of paths) expect(forbiddenPersonnelRuntime(source(path)), path).toEqual([]);
    const ui = paths.map(source).join('\n');
    expect(ui).not.toMatch(
      /createInitialWorkers|selectedWorker|case 'workforce'|label="Workforce"|WorkerLeaderboard|FlourishingDashboard|VotingPanel|AIWelfarePanel|setTtsEnabled/
    );
  });

  it('keeps real-person portraits and the obsolete worker texture pipeline absent', () => {
    const prohibitedPaths = [
      'public/assets/workers',
      'public/portraits',
      'public/textures/compressed/worker_color.ktx2',
      'public/textures/compressed/worker_normal.ktx2',
      'public/textures/compressed/worker_roughness.ktx2',
      'public/textures/machines/256/worker_color.jpg',
      'public/textures/machines/512/worker_color.jpg',
      'src/components/ui-new/widgets/PortraitCard.tsx',
      'src/config/portraits.ts',
    ];
    expect(prohibitedPaths.filter((path) => existsSync(resolve(process.cwd(), path)))).toEqual([]);
    for (const path of [
      'src/stores/knowledgeStore.ts',
      'src/components/knowledge/Datalinks.tsx',
      'src/components/knowledge/KnowledgeEntryCard.tsx',
    ]) {
      expect(source(path)).not.toMatch(/portraitPath|[/\\]portraits[/\\]|<img\b/i);
    }
  });
});

it('the delivery gate fails when approved personnel are absent or modified in served bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'millos-community-gate-'));
  try {
    for (const directory of [
      'src/config',
      'src/components',
      'public/models/worker',
      'dist/models/worker',
      'dist/assets',
    ]) {
      await mkdir(join(root, directory), { recursive: true });
    }
    await writeFile(
      join(root, 'src/config/featureFlags.ts'),
      'personnelModels:true,vehicleOperators:false,remoteAvatars:false,humanVoiceAudio:false,workforceUI:false'
    );
    await writeFile(
      join(root, 'src/components/MillScene.tsx'),
      'import { CommunityLife } from "./CommunityLife"; <CommunityLife />'
    );
    await writeFile(
      join(root, 'src/components/CommunityLife.tsx'),
      'COMMUNITY_ROSTER.map(() => <WorkerModel />); "world-personnel"; "world-community-details";'
    );
    await writeFile(
      join(root, 'dist/assets/community.js'),
      '"world-personnel"; "world-community-details"; "worker-masculine.glb"; "worker-feminine.glb";'
    );
    const definitions = {
      assets: APPROVED_PERSONNEL.map(({ id, file }: { id: string; file: string }) => ({
        id,
        file,
        license: 'CC0-1.0',
        role: 'animated-personnel-character',
      })),
    };
    for (const directory of ['public', 'dist']) {
      await writeFile(
        join(root, directory, 'models/asset-manifest.json'),
        JSON.stringify(definitions)
      );
      await copyFile(
        resolve('public/models/worker/LICENSE-QUATERNIUS.txt'),
        join(root, directory, 'models/worker/LICENSE-QUATERNIUS.txt')
      );
      for (const asset of APPROVED_PERSONNEL)
        await copyFile(
          resolve('public/models', asset.file),
          join(root, directory, 'models', asset.file)
        );
    }
    await expect(validateCommunityBuild(root)).resolves.toContain(
      'Inhabited-world contract passed'
    );
    await rm(join(root, 'dist/models/worker/worker-masculine.glb'));
    await expect(validateCommunityBuild(root)).rejects.toThrow(
      'dist personnel delivery incomplete'
    );
    await writeFile(join(root, 'dist/models/worker/worker-masculine.glb'), 'replacement');
    await expect(validateCommunityBuild(root)).rejects.toThrow('dist unapproved personnel bytes');
    await copyFile(
      resolve('public/models/worker/worker-masculine.glb'),
      join(root, 'dist/models/worker/worker-masculine.glb')
    );
    await writeFile(
      join(root, 'dist/assets/community.js'),
      '"worker-masculine.glb"; "worker-feminine.glb";'
    );
    await expect(validateCommunityBuild(root)).rejects.toThrow(
      'compiled community missing: world-personnel'
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
