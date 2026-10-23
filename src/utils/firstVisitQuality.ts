import { useGraphicsStore } from '../stores/graphicsStore';

/**
 * A first visit on a weak GPU used to start at Medium and wait about 30 s for
 * the loading cover's 30 FPS window before offering "Use low graphics". Start
 * such a device on Low instead. Only a first visit is touched: once
 * `millos-graphics` exists, the visitor's own (or adaptive) tier stands, and
 * adaptive quality may still climb back up when the frame rate allows.
 * Working if a software or integrated renderer, or a <=4 GB / <=4-core device,
 * opens on Low with no saved choice, and a returning visitor keeps theirs.
 */
export interface DeviceProbe {
  renderer?: string | null;
  deviceMemoryGb?: number;
  cores?: number;
}

const WEAK_RENDERER =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render|intel\(r\) (hd|uhd) graphics|intel (hd|uhd) graphics|mali-[gt]\d{2}\b|adreno \(tm\) [3-5]\d{2}\b|powervr/i;

export function isWeakDevice(probe: DeviceProbe): boolean {
  if (probe.renderer && WEAK_RENDERER.test(probe.renderer)) return true;
  if (Number.isFinite(probe.deviceMemoryGb) && probe.deviceMemoryGb! <= 4) return true;
  if (Number.isFinite(probe.cores) && probe.cores! <= 4) return true;
  return false;
}

function probeDevice(): DeviceProbe {
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  let renderer: string | null = null;
  try {
    const canvas = globalThis.document?.createElement('canvas');
    const gl = (canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')) as
      | WebGLRenderingContext
      | null
      | undefined;
    if (gl) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    renderer = null;
  }
  return { renderer, deviceMemoryGb: nav?.deviceMemory, cores: nav?.hardwareConcurrency };
}

export function applyFirstVisitQuality(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
  probe: () => DeviceProbe = probeDevice
): boolean {
  try {
    // Automation (capture scripts, e2e) sets its own tier; never second-guess it.
    if (!storage || storage.getItem('millos-graphics') !== null) return false;
    if (globalThis.navigator?.webdriver) return false;
  } catch {
    return false;
  }
  if (!isWeakDevice(probe())) return false;
  useGraphicsStore.getState().setGraphicsQuality('low', 'adaptive');
  return true;
}
