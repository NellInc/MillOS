/**
 * Screenshot bridge between DOM buttons and the R3F canvas.
 *
 * The WebGL context is created with `preserveDrawingBuffer: false`, so a
 * `canvas.toDataURL()` from a click handler reads an already-cleared buffer and
 * silently returns a blank frame. Two paths read the pixels back while they are
 * still valid:
 *
 * - SYNCHRONOUS (`registerSceneCapture`). The renderer re-renders the scene with
 *   a plain `gl.render` and reads it back in the same tick. Correct on the low
 *   tier, where the canvas is the final image.
 * - COMPOSER (`requestScenePng`). While the post-processing composer is mounted
 *   it forces `gl.toneMapping` to NoToneMapping and owns the frame, so a plain
 *   `gl.render` writes linear HDR with no tone curve, AO, bloom or grade - not
 *   what is on screen. Instead a reader mounted beside the composer calls
 *   `fulfilComposerCapture` from a `useFrame` that runs after the composer's
 *   render, in the same animation frame, while the drawing buffer is intact.
 */
export type SceneCapture = () => string | null;

let capture: SceneCapture | null = null;

export function registerSceneCapture(fn: SceneCapture | null): void {
  capture = fn;
}

/** Returns a PNG data URL of the current frame, or null when no renderer is mounted. */
export function captureScenePng(): string | null {
  try {
    return capture?.() ?? null;
  } catch {
    return null;
  }
}

type PendingCapture = (dataUrl: string | null) => void;

/** A hidden tab or a lost context delivers no frame; fail rather than hang the button. */
const COMPOSER_CAPTURE_TIMEOUT_MS = 1000;

let composerCaptureAvailable = false;
const pendingComposerCaptures = new Set<PendingCapture>();

function settleComposerCaptures(dataUrl: string | null): void {
  [...pendingComposerCaptures].forEach((settle) => settle(dataUrl));
}

/**
 * Called by the composer-side reader on mount (true) and unmount (false). A
 * request still waiting when the composer goes away falls back to the
 * synchronous path, which is correct again once the composer is gone.
 */
export function setComposerCaptureAvailable(available: boolean): void {
  composerCaptureAvailable = available;
  if (!available && pendingComposerCaptures.size > 0) {
    settleComposerCaptures(captureScenePng());
  }
}

/**
 * Called every frame by the composer-side reader, after the composer renders.
 * Free when nothing is waiting: the readback happens only for a request.
 */
export function fulfilComposerCapture(canvas: HTMLCanvasElement): void {
  if (pendingComposerCaptures.size === 0) return;
  let dataUrl: string | null;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    dataUrl = null;
  }
  settleComposerCaptures(dataUrl);
}

/**
 * PNG data URL of the frame as displayed, including post-processing when the
 * composer is mounted. Resolves null when no frame can be captured.
 */
export function requestScenePng(): Promise<string | null> {
  if (!composerCaptureAvailable) return Promise.resolve(captureScenePng());
  return new Promise((resolve) => {
    const settle: PendingCapture = (dataUrl) => {
      window.clearTimeout(timer);
      pendingComposerCaptures.delete(settle);
      resolve(dataUrl);
    };
    const timer = window.setTimeout(() => settle(null), COMPOSER_CAPTURE_TIMEOUT_MS);
    pendingComposerCaptures.add(settle);
  });
}

function triggerDownload(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Saves the frame as displayed. Resolves false when no frame could be captured. */
export async function saveScenePng(filename: string): Promise<boolean> {
  const dataUrl = await requestScenePng();
  if (!dataUrl) return false;
  triggerDownload(dataUrl, filename);
  return true;
}
