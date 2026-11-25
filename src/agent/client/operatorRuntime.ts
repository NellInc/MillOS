import type { AgentOperatorRuntime, AgentRuntimeApi } from '../contracts/commandContracts';

/**
 * The trusted, module-scoped side of the agent plane.
 *
 * `window.__MILLOS_AGENT__` is a handle any script on the page can call or
 * replace (the property is configurable so a re-install can redefine it). It
 * cannot approve, and the interface never reads it. The interface reads the
 * runtime from here: references bound once per window by the installer, in
 * module scope, where a page script that replaces the window property does not
 * reach.
 *
 * This leaf imports types only, so the client modules and the cockpit can use
 * it without pulling the handlers and stores into their import graph.
 */
interface AgentRuntimeBinding {
  handle: AgentRuntimeApi;
  /** Module-private agent handle that can exercise trusted internal grants (on-device operator). */
  internalHandle: AgentRuntimeApi;
  operator: AgentOperatorRuntime;
  installed: boolean;
}

const bindings = new WeakMap<object, AgentRuntimeBinding>();

const NOT_INSTALLED = 'MillOS agent runtime v2 is not installed.';

/**
 * Bind one window's composed runtime, composing it only if none is bound yet.
 * Set once: a later call for the same window gets the first runtime back and
 * its `compose` never runs, so nothing can swap in a different runtime. It
 * returns instead of throwing because a development hot update re-evaluates
 * the installer while this leaf stays loaded: the installer must then find
 * the runtime it built before, with its grants, ledger and open previews.
 * Returns the bound handle and the switch that marks the runtime installed.
 */
export function bindAgentRuntime(
  target: object,
  compose: () => {
    handle: AgentRuntimeApi;
    internalHandle?: AgentRuntimeApi;
    operator: AgentOperatorRuntime;
  }
): { handle: AgentRuntimeApi; setInstalled: (installed: boolean) => void } {
  let entry = bindings.get(target);
  if (!entry) {
    const composed = compose();
    entry = {
      handle: composed.handle,
      internalHandle: composed.internalHandle ?? composed.handle,
      operator: composed.operator,
      installed: false,
    };
    bindings.set(target, entry);
  }
  const bound = entry;
  return {
    handle: bound.handle,
    setInstalled: (installed) => {
      bound.installed = installed;
    },
  };
}

function binding(target: object | undefined): AgentRuntimeBinding | null {
  if (!target) return null;
  const found = bindings.get(target);
  return found?.installed ? found : null;
}

/**
 * The operator-side runtime: the person at the controls approving in the
 * interface. Throws when no runtime is installed on the window.
 */
export function getOperatorRuntime(
  target: object | undefined = globalThis.window
): AgentOperatorRuntime {
  const found = binding(target);
  if (!found) throw new Error(NOT_INSTALLED);
  return found.operator;
}

/** The operator-side runtime, or null while none is installed (a render can wait). */
export function peekOperatorRuntime(
  target: object | undefined = globalThis.window
): AgentOperatorRuntime | null {
  return binding(target)?.operator ?? null;
}

/**
 * The composed handle as the installer built it, read from module scope rather
 * than from the window property. It has no way to approve.
 */
export function getInstalledAgentRuntime(
  target: object | undefined = globalThis.window
): AgentRuntimeApi {
  const found = binding(target);
  if (!found) throw new Error(NOT_INSTALLED);
  return found.internalHandle;
}
