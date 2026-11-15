import { describe, expect, it, vi } from 'vitest';
import type { AgentOperatorRuntime, AgentRuntimeApi } from '../contracts/commandContracts';
import {
  bindAgentRuntime,
  getInstalledAgentRuntime,
  getOperatorRuntime,
  peekOperatorRuntime,
} from './operatorRuntime';

const runtime = (label: string) => ({
  handle: { version: 2, label } as unknown as AgentRuntimeApi,
  operator: { version: 2, label } as unknown as AgentOperatorRuntime,
});

describe('the module-scoped agent runtime binding', () => {
  it('reads as not installed until the installer says so', () => {
    const target = {};
    const bound = bindAgentRuntime(target, () => runtime('first'));
    expect(peekOperatorRuntime(target)).toBeNull();
    expect(() => getOperatorRuntime(target)).toThrow('MillOS agent runtime v2 is not installed.');
    bound.setInstalled(true);
    expect(getOperatorRuntime(target)).toMatchObject({ label: 'first' });
    expect(getInstalledAgentRuntime(target)).toBe(bound.handle);
    bound.setInstalled(false);
    expect(peekOperatorRuntime(target)).toBeNull();
  });

  // A development hot update re-evaluates the installer while this leaf stays
  // loaded. The second bind must hand back the first runtime, not throw and
  // not swap: grants, ledger and open previews live in the first composition.
  it('keeps the first runtime when the same window is bound again', () => {
    const target = {};
    const first = bindAgentRuntime(target, () => runtime('first'));
    const composeAgain = vi.fn(() => runtime('second'));
    const second = bindAgentRuntime(target, composeAgain);
    expect(composeAgain).not.toHaveBeenCalled();
    expect(second.handle).toBe(first.handle);
    second.setInstalled(true);
    expect(getOperatorRuntime(target)).toMatchObject({ label: 'first' });
  });

  it('binds each window to its own runtime', () => {
    const one = {};
    const two = {};
    bindAgentRuntime(one, () => runtime('one')).setInstalled(true);
    bindAgentRuntime(two, () => runtime('two')).setInstalled(true);
    expect(getOperatorRuntime(one)).toMatchObject({ label: 'one' });
    expect(getOperatorRuntime(two)).toMatchObject({ label: 'two' });
  });
});
