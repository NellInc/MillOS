import { describe, expect, it } from 'vitest';
import { strategicPrompt, STRATEGIC_SEVERITY_LINE } from './aiEngine';
import { mockMachines } from '../test/fixtures/mockMachines';

// With two machines in warning, the local 4B named the milder one in 7 of 30
// answers. This line took that to 30 of 30 with nothing else worse
// (scripts/local-router-tune/runs/prereg-severity-line.json, D-028). It was
// measured on the local model only, so the cloud prompts stay without it.
describe('the strategic prompt', () => {
  it('asks the local model to focus on the worst readings', () => {
    const prompt = strategicPrompt(mockMachines, { severityRanking: true });
    const lines = prompt.split('\n');
    const priorities = lines.findIndex((line) => line.startsWith('Prioritize safety interlocks'));
    expect(lines[priorities + 1]).toBe(STRATEGIC_SEVERITY_LINE);
  });

  it('leaves the cloud prompt as it was', () => {
    expect(strategicPrompt(mockMachines)).not.toContain(STRATEGIC_SEVERITY_LINE);
    expect(strategicPrompt(mockMachines, { severityRanking: false })).toBe(
      strategicPrompt(mockMachines)
    );
  });
});
