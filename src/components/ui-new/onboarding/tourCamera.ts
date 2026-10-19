// Silos, Milling, Packing: the order the grain travels. Silos -> Packing first
// flew the camera through Silo Alpha and the east parapet (tourCamera.test).
export const TOUR_CAMERA_PRESETS = [1, 2, 4] as const;

export const getTourCameraPreset = (step: number | null): number | null => {
  if (step === null || !Number.isInteger(step) || step < 0 || step >= TOUR_CAMERA_PRESETS.length) {
    return null;
  }
  return TOUR_CAMERA_PRESETS[step];
};
