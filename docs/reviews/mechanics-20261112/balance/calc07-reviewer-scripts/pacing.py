# Re-implements src/chronicle/rng.ts (FNV-1a + mulberry32) to count part one's
# decision beats per close: event draws (engine.ts drawEvent gate, EVENT_CHANCE 0.55)
# and forecast issues (issueForecast, 0.3 when none pending, leads from forecasts.ts).
M = 0xFFFFFFFF


def to_i32(x):
    x &= M
    return x - (1 << 32) if x & 0x80000000 else x


def imul(a, b):
    return to_i32((a & M) * (b & M))


def fnv(text):
    h = 0x811C9DC5
    for ch in text:
        h ^= ord(ch)
        h = imul(h, 0x01000193) & M
    return h & M


def chance(seed, stream, index):
    a = fnv(f"{seed}:{stream}:{index}")
    a = (a + 0x6D2B79F5) & M
    t = a
    t = imul(t ^ (t >> 15), t | 1)
    t = to_i32(t ^ to_i32(t + imul((t & M) ^ ((t & M) >> 7), (t & M) | 61)))
    return (((t & M) ^ ((t & M) >> 14)) & M) / 4294967296


KINDS = ["severe_rain", "power_sag", "dust_filter_pressure", "delayed_truck"]
LEAD = {"severe_rain": 2, "power_sag": 2, "dust_filter_pressure": 1, "delayed_truck": 2}

longest = []
events_total = forecasts_total = 0
quiet_closes = 0
N = 2000
for seed in range(1000, 1000 + N):
    due = None
    run = best = 0
    for shift in range(1, 63):
        beat = False
        if due is not None and due <= shift:
            due = None  # resolves this close (a beat, but no decision)
        if due is None and chance(seed, "forecast-issue", shift) < 0.3:
            r = chance(seed, "forecast-kind", shift)
            kind = KINDS[min(3, int(r * 4))]
            if shift + LEAD[kind] < 63:
                due = shift + LEAD[kind]
                forecasts_total += 1
                beat = True
        if chance(seed, "event", shift) < 0.55:
            events_total += 1
            beat = True
        if beat:
            run = 0
        else:
            run += 1
            quiet_closes += 1
            best = max(best, run)
    longest.append(best)
longest.sort()
print("seeds", N)
print("mean drawn-event gates passed per chronicle", events_total / N)
print("mean forecasts issued per chronicle", forecasts_total / N)
print("mean closes with neither", quiet_closes / N, "of 62")
print("longest quiet run: median", longest[N // 2], "p90", longest[int(N * 0.9)], "max", longest[-1])
