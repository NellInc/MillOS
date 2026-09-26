export const TOUR_CAMERA_PRESETS = [1, 4, 2] as const;

export const getTourCameraPreset = (step: number | null): number | null => {
  if (step === null || !Number.isInteger(step) || step < 0 || step >= TOUR_CAMERA_PRESETS.length) {
    return null;
  }
  return TOUR_CAMERA_PRESETS[step];
};
