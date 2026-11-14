// Copy of src/chronicle/rng.ts hashing, to check pacing.py's port.
function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const c = (s, st, i) => mulberry32(hashString(`${s >>> 0}:${st}:${i}`))();
console.log(c(1000, 'event', 1), c(1234, 'forecast-issue', 7), c(999999, 'event', 62));
