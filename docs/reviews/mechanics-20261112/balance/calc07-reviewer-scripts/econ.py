# Arithmetic model of part one's economy; tables copied from src/chronicle/plans.ts
PLANS = [  # id, era_order, requires, planKH, install, shifts, upkeep
    ("moisture-meters", 0, [], 8, 110, 2, 3),
    ("spare-parts-store", 0, [], 8, 100, 2, 3),
    ("drainage-works", 0, [], 10, 130, 2, 3),
    ("members-library", 0, [], 6, 70, 1, 2),
    ("grain-dryer", 1, ["moisture-meters"], 18, 240, 3, 7),
    ("vibration-monitoring", 1, ["spare-parts-store"], 16, 200, 3, 5),
    ("aspiration-upgrade", 1, [], 16, 210, 3, 5),
    ("standby-generator", 2, [], 24, 300, 3, 9),
    ("blending-bins", 2, ["grain-dryer"], 22, 230, 3, 6),
    ("sifter-retrofit", 2, ["aspiration-upgrade"], 26, 290, 4, 7),
    ("haulage-agreement", 2, [], 20, 150, 2, 6),
    ("wind-turbine", 3, [], 32, 400, 4, 6),
    ("roll-regrinding-shop", 3, ["vibration-monitoring"], 30, 340, 4, 9),
    ("heat-recovery", 3, [], 28, 280, 3, 5),
    ("federated-purchasing", 4, [], 40, 280, 3, 3),
    ("solar-canopy", 4, ["wind-turbine"], 40, 460, 4, 4),
]
ERAS = [(0, 0, 0, 0), (3, 40, 0, 0.05), (6, 90, 1, 0), (9, 160, 2, 0), (12, 240, 3, 0.05)]
TRIAL_END = {15: "wet", 24: "insp", 35: "rush", 43: "grid", 59: "gp"}
print("tree know-how", sum(p[3] for p in PLANS), "tree install fund", sum(p[4] for p in PLANS),
      "all upkeep", 6 + sum(p[6] for p in PLANS))


def run(label, ship_every, net, revenue, kh_ship, kh_idle, qc=1, notes=0.6, speed=0.8):
    fund = 300 - 60
    kh = earned = 0.0
    era = 0
    installed, planned = [], []
    installing = None
    trials = 0
    log = []
    for s in range(1, 64):
        ships = s % ship_every == 0
        share = 0.25 + sum(e[3] for e in ERAS[1:era + 1])
        fund += round((net if ships else 0) * share * 0.18) + (round(revenue * 0.0072) if ships else 0)
        g = (kh_ship if ships else kh_idle) + qc + notes + (1 if "members-library" in installed else 0)
        kh += g
        earned += g
        up = 6 + sum(p[6] for p in PLANS if p[0] in installed)
        if "federated-purchasing" in installed:
            up = round(up * 0.85)
        fund -= up
        if installing and s >= installing[1]:
            installed.append(installing[0])
            installing = None
        if s in TRIAL_END:
            trials += 1
            earned += 8
            kh += 8
        while era < 4:
            n, k, t, _ = ERAS[era + 1]
            if len(installed) >= n and earned >= k and trials >= t:
                era += 1
                log.append((s, "era", era))
            else:
                break
        for p in sorted(PLANS, key=lambda p: p[3]):
            if p[0] in planned or p[1] > era or not all(r in planned for r in p[2]):
                continue
            if kh >= p[3]:
                kh -= p[3]
                planned.append(p[0])
        if not installing:
            for p in sorted(PLANS, key=lambda p: p[4]):
                if p[0] in planned and p[0] not in installed and all(r in installed for r in p[2]) and fund - p[4] >= 3 * up:
                    fund -= p[4]
                    installing = (p[0], s + max(1, round(p[5] * speed)))
                    log.append((s, "start", p[0], round(fund)))
                    break
    print(label, "| end fund", round(fund), "installed", len(installed), "era", era,
          "earned KH", round(earned), "unspent KH", round(kh), "upkeep/shift at end", up)
    print("   eras at shift", [(x[0], x[2]) for x in log if x[1] == "era"])
    print("   installs started", [(x[0], x[2]) for x in log if x[1] == "start"])


run("A doc tuning: truck every 2nd close, net 2200", 2, 2200, 4000, 6, 0)
run("A, no notes or QC tests", 2, 2200, 4000, 6, 0, qc=0, notes=0)
run("B programmes accepted: 11.5 t a close, net 8000", 1, 8000, 9900, 6, 0)
