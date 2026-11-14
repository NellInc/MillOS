import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * D14 (D-012): no hints, subtitles, captions, disclaimers or explanatory
 * title tooltips. Two source-level ratchets over src/components keep the
 * sweep from growing back:
 *
 * 1. A component catalogue key named like helper text (…Hint, …Help,
 *    …Subtitle, …Caption, …Tagline, …Footnote, …Disclaimer, …Blurb, …Intro,
 *    …Note, …Explanation, …Tip, …Description, …Body) fails unless it is
 *    listed below with the reason it is not helper text.
 * 2. A DOM `title=` attribute (on a lowercase JSX tag) fails when its file
 *    has more than the count listed below (none, if unlisted); each listed one
 *    names its own control or shows a truncated value in full.
 *
 * What it cannot see: helper text under an innocent key name, copy
 * hard-coded in a component, a title whose value changes from a label to an
 * explanation, catalogues outside src/components, and src/components/chronicle,
 * which another lane owns and is left out here.
 */

const ROOT = 'src/components';
const SKIP = [/\/chronicle\//];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

const files = walk(ROOT).filter((path) => !SKIP.some((pattern) => pattern.test(path)));

const HELPER_KEY =
  /^ {4}([A-Za-z0-9_]+(?:Hint|Help|Subtitle|Caption|Tagline|Footnote|Disclaimer|Blurb|Intro|Note|Explanation|Tip|Description|Body))\??:/gm;

/** file:key -> why it is not helper text */
const ALLOWED_KEYS: Record<string, string> = {
  'AISettingsModal.messages.ts:costNote': 'billing: what a paid call can cost',
  'AISettingsModal.messages.ts:keyMemoryNote': 'key security: where the key goes',
  'AISettingsModal.messages.ts:hybridExplanation': 'effect, on the LLM-only confirm step',
  'AISettingsModal.messages.ts:llmOnlyExplanation': 'effect, on the LLM-only confirm step',
  'SCADAPanel.messages.ts:scadaDisabledBody': 'state: telemetry is off',
  'SCADAPanel.messages.ts:controlNote': "the note input's own label",
  'SCADAPanel.messages.ts:trendTableCaption': 'sr-only table caption',
  'SCADAPanel.messages.ts:faultSensorFailDescription': 'effect of the inject button',
  'SCADAPanel.messages.ts:faultSpikeDescription': 'effect of the inject button',
  'SCADAPanel.messages.ts:faultDriftDescription': 'effect of the inject button',
  'SCADAPanel.messages.ts:faultStuckDescription': 'effect of the inject button',
  'SCADAPanel.messages.ts:faultNoiseDescription': 'effect of the inject button',
  'SCADAPanel.messages.ts:proxyNote': 'precondition: these connections fail without it',
  'GameInterface.messages.ts:introKeyboardHint': 'the only pointer to the shortcut sheet',
  'OnboardingGuide.messages.ts:cameraHelp': 'content of a disclosure the player opens',
  'PlayableShift.messages.ts:switchChallengeHint': 'refusal: why the select is held',
  'PlayableShift.messages.ts:switchReviewHint': 'refusal: why the select is held',
  'PlayableShift.messages.ts:switchHandoffHint': 'refusal: why the select is held',
  'PlayableShift.messages.ts:acceptNextHint': 'refusal, shown on an inert press',
  'SafetyPanel.messages.ts:acknowledgementNote': 'readout: the note an operator recorded',
  'CostEstimationOverlay.messages.ts:chatgptNote': 'billing',
  'CostEstimationOverlay.messages.ts:pricingNote': 'billing',
  'EmergencyStopButton.messages.ts:incidentDescription': 'the incident record text',
  'JevAdvisoryPanel.messages.ts:apiKeyHelp': 'key security: where the key is kept',
  'JevAdvisoryPanel.messages.ts:sendNote': 'billing: what is sent and charged',
  'PredictiveMaintenancePanel.messages.ts:underRepairHint': 'refusal: why service is held',
  'PredictiveMaintenancePanel.messages.ts:facilityStopHint': 'refusal: why service is held',
  'PredictiveMaintenancePanel.messages.ts:partsUnavailableHint': 'refusal: why service is held',
  'PredictiveMaintenancePanel.messages.ts:belowMinimumHint': 'refusal: why service is held',
  'WorkplaceImprovementPanel.messages.ts:originNote': 'readout: origin closing cash',
  'WorkplaceLab.messages.ts:operationalExplanation': 'content of the opened "why" disclosure',
  'WorkplaceLab.messages.ts:resumeAfterReloadNote': 'state: what paused the shift',
  'WorkplaceLab.messages.ts:resumeAfterSafetyNote': 'state: what paused the shift',
  'WorkplaceLab.messages.ts:resumeAfterObjectionNote': 'state: what paused the shift',
  'WorkplaceReplay.messages.ts:activeNote': 'state: the agreement is active',
  'MachineInspector.messages.ts:trendCaption': "the chart's own label (figcaption)",
};

/** file -> DOM title attributes it may carry, and why */
const ALLOWED_TITLES: Record<string, [count: number, reason: string]> = {
  'SCADAPanel.tsx': [2, 'icon buttons; the title is the aria-label'],
  'game/AchievementsPanel.tsx': [3, 'names what Reset, Confirm and Cancel act on'],
  'ui-new/MillOSMusicPlayer.tsx': [10, 'icon buttons and truncated track names'],
  'ui-new/dock/Dock.tsx': [2, 'the dock label (Dock.test pins it)'],
  'ui-new/hud/StatusHUD.tsx': [4, 'icon buttons; the title is the label'],
  'ui-new/panels/BuildCacheDiagnostics.tsx': [1, 'a truncated value in full'],
  'ui-new/panels/OverviewPanel.tsx': [6, 'icon buttons; the title is the label'],
  'ui/ActionPlanTimeline.tsx': [2, 'icon buttons; the title is the label'],
  'ui/IncidentHistoryPanel.tsx': [1, 'a truncated description in full'],
  'ui/TimelinePlayback.tsx': [1, 'icon button; the title is the label'],
  'ui/ZoneCustomizationPanel.tsx': [2, 'icon buttons; the title is the label'],
};

const relative = (path: string) => path.slice(ROOT.length + 1);

describe('component copy carries no helper text (D14)', () => {
  it('names no catalogue key like a hint unless it is listed with a reason', () => {
    const unlisted: string[] = [];
    for (const path of files.filter((file) => file.endsWith('.messages.ts'))) {
      const source = readFileSync(path, 'utf8');
      const english = source.split("'pt-BR'")[0];
      const name = path.split('/').pop()!;
      for (const match of english.matchAll(HELPER_KEY)) {
        if (!ALLOWED_KEYS[`${name}:${match[1]}`]) unlisted.push(`${relative(path)}: ${match[1]}`);
      }
    }
    expect(unlisted).toEqual([]);
  });

  it('puts a title tooltip only where it names the control or shows a value', () => {
    const counts: Record<string, number> = {};
    for (const path of files.filter((file) => file.endsWith('.tsx') && !file.includes('.test.'))) {
      const source = readFileSync(path, 'utf8');
      let count = 0;
      for (const match of source.matchAll(/\btitle=/g)) {
        const tags = [...source.slice(0, match.index).matchAll(/<([A-Za-z][\w.]*)/g)];
        const tag = tags.at(-1)?.[1];
        if (tag && tag[0] === tag[0].toLowerCase()) count++;
      }
      if (count > 0) counts[relative(path)] = count;
    }
    // A ratchet: a listed file may lose titles, never gain them.
    const over = Object.entries(counts)
      .filter(([file, count]) => count > (ALLOWED_TITLES[file]?.[0] ?? 0))
      .map(([file, count]) => `${file}: ${count} (allowed ${ALLOWED_TITLES[file]?.[0] ?? 0})`);
    expect(over).toEqual([]);
  });
});
