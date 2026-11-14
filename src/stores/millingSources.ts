/**
 * Where the milling facts in Datalinks and in the cutaway lessons come from.
 *
 * Every source here was fetched and its text read on the date given (the page
 * itself, or the PDF's extracted text), not a search summary. A number in the
 * copy is the source's number, with its unit and its hedge. A fact with no
 * source here was left out of the copy.
 *
 * Cutaway lesson lines that only describe the drawing in front of the player
 * (which part moves, where the stream goes) are checked against
 * `components/machines/machineInspectionGeometry.ts`, not against a source.
 */

export interface MillingSource {
  title: string;
  publisher: string;
  url: string;
  /** ISO date the text was fetched and read. */
  fetched: string;
}

export const MILLING_SOURCES = {
  ukfmProcess: {
    title: 'The milling process',
    publisher: 'UK Flour Millers',
    url: 'https://www.ukflourmillers.org/themillingprocess',
    fetched: '2026-11-13',
  },
  ukfmIntake: {
    title: 'Wheat testing at mill intake',
    publisher: 'UK Flour Millers',
    url: 'https://www.ukflourmillers.org/flour-milling/the-milling-process/wheat-testing-at-mill-intake',
    fetched: '2026-11-13',
  },
  ukfmFlour: {
    title: 'Flour',
    publisher: 'UK Flour Millers',
    url: 'https://www.ukflourmillers.org/flour-milling/flour',
    fetched: '2026-11-13',
  },
  wmcMethods: {
    title:
      'Wheat and Flour Testing Methods: A Guide to Understanding Wheat and Flour Quality (2004), incl. "How Wheat is Milled", courtesy of the Wheat Foods Council',
    publisher: 'Wheat Marketing Center, via U.S. Wheat Associates',
    url: 'https://uswheat.org/wwb_resources/wheat-and-flour-testing-methods-book',
    fetched: '2026-11-13',
  },
  ksuMiddlings: {
    title: 'Wheat Middlings: Composition, Feeding Value, and Storage Guidelines, MF-2353 (1998)',
    publisher: 'Kansas State University Agricultural Experiment Station and Cooperative Extension',
    url: 'https://bookstore.ksre.ksu.edu/download/wheat-middlings-composition-feeding-value-and-storage-guidelines_MF2353',
    fetched: '2026-11-13',
  },
  asbeRoller: {
    title: 'Roller Milling (BAKERpedia)',
    publisher: 'American Society of Baking',
    url: 'https://asbe.org/article/roller-milling/',
    fetched: '2026-11-13',
  },
  satakePatent: {
    title: 'US 5,678,777, Flour milling machine (Satake Corporation, 1997)',
    publisher: 'United States Patent and Trademark Office, via Google Patents',
    url: 'https://patents.google.com/patent/US5678777A/en',
    fetched: '2026-11-13',
  },
  scanlonDexter1986: {
    title:
      'Scanlon and Dexter, Effect of Smooth Roll Grinding Conditions on Reduction of Hard Red Spring Wheat Farina, Cereal Chem. 63(5):431-435 (1986)',
    publisher:
      'American Association of Cereal Chemists; Canadian Grain Commission, Grain Research Laboratory',
    url: 'https://www.cerealsgrains.org/publications/cc/backissues/1986/Documents/Chem63_431.pdf',
    fetched: '2026-11-13',
  },
  hseDust: {
    title: 'Preventing dust explosions in the food industry',
    publisher: 'Health and Safety Executive',
    url: 'https://www.hse.gov.uk/food/safety-hazards/dustexplosion.htm',
    fetched: '2026-11-13',
  },
  csbDust: {
    title: 'Combustible Dust Hazard Study, Report No. 2006-H-1 (November 2006)',
    publisher: 'U.S. Chemical Safety and Hazard Investigation Board',
    url: 'https://www.csb.gov/assets/1/20/dust_final_report_website_11-17-06.pdf',
    fetched: '2026-11-13',
  },
  defraHens: {
    title: 'Code of practice for the welfare of laying hens and pullets',
    publisher: 'Department for Environment, Food and Rural Affairs (gov.uk)',
    url: 'https://www.gov.uk/government/publications/poultry-on-farm-welfare/poultry-welfare-recommendations',
    fetched: '2026-11-13',
  },
} satisfies Record<string, MillingSource>;

export type MillingSourceId = keyof typeof MILLING_SOURCES;

/** One source and the claims in the copy it supports, quoted or paraphrased closely. */
export interface SourcedClaims {
  id: MillingSourceId;
  supports: string[];
}

/** The sources each milling Datalinks entry was written from. */
export const MILLING_ENTRY_SOURCES: Record<string, SourcedClaims[]> = {
  'milling-cleaning-tempering': [
    {
      id: 'wmcMethods',
      supports: [
        'Magnetic separator: iron or steel articles are removed',
        'Separator: reciprocating screens remove stones, sticks and other coarse or fine materials; aspirator: air currents remove lighter impurities',
        'Disc separator: barley, oats, cockle and other foreign materials are removed; scourer: beaters scour off impurities',
        'Tempering: water toughens outer bran coats for easier separation, softening or mellowing endosperm',
        'Soft wheats require less water and less time than hard wheats',
      ],
    },
    {
      id: 'ksuMiddlings',
      supports: [
        'Tempering adds water to the cleaned wheat to increase its moisture content to approximately 15%',
        'The grain is allowed to stand for 2 to 24 hours so the moisture can penetrate the kernel',
        'Conditioning toughens the bran so larger flakes can be removed during the breaking step',
      ],
    },
    {
      id: 'ukfmProcess',
      supports: ['Before it enters the mill floor, wheat is cleaned and then conditioned'],
    },
  ],
  'milling-break-reduction': [
    {
      id: 'ksuMiddlings',
      supports: [
        'The grain is crushed gradually through the shearing action of pairs of breaker rolls; the objective is to separate the branny portion from the endosperm',
        'Grist from each pair is sifted; the coarsest particles go to successive breaker rolls; the finest are sifted off as flour',
        'Each successive pair has finer corrugations and closer distances between the rolls',
        'Purified middlings pass through paired smooth reduction rolls, each finer; flour is sifted out after each reduction',
      ],
    },
    {
      id: 'wmcMethods',
      supports: [
        'First break: corrugated rolls break wheat into coarse particles',
        'Reducing rolls: smooth rolls reduce middlings into flour',
      ],
    },
    {
      id: 'satakePatent',
      supports: [
        'Peripheral speed ratio of the high-speed to the low-speed roll is typically 1.5 through 3.0 to 1 for break rolls and 1.1 through 1.5 to 1 for smooth rolls',
        'Break rolls operate optimally at a peripheral speed ratio of 2.5:1 (the cutaway rolls)',
      ],
    },
    {
      id: 'scanlonDexter1986',
      supports: [
        'Roll differential is the ratio of fast roll velocity to slow roll velocity',
        'On smooth reduction rolls, increasing the differential increased flour starch damage, water absorption and milling energy and worsened flour ash and colour',
      ],
    },
    {
      id: 'ukfmProcess',
      supports: [
        'Opening the grain, rather than pulverising it, gives better access to the endosperm',
        'Some particles pass through just one break roll and one reduction roll; those closer to the bran and germ pass through several',
      ],
    },
  ],
  'milling-purifiers': [
    {
      id: 'ksuMiddlings',
      supports: [
        'Middlings are rebolted (sifted) and aspirated in a middlings purifier to remove small, light bran particles',
        'The purified middlings pass through smooth reduction rolls',
      ],
    },
    {
      id: 'wmcMethods',
      supports: [
        'Purifier: air currents and sieves separate bran and classify particles (or middlings)',
        'Ash is primarily concentrated in the bran; ash in flour imparts a darker colour',
      ],
    },
    {
      id: 'asbeRoller',
      supports: [
        'The sizing system separates small bran pieces attached to large endosperm pieces by particle size and specific gravity; sifters and purifiers are involved',
        'The endosperm pieces are known as middlings',
      ],
    },
  ],
  'milling-extraction-ash': [
    {
      id: 'ksuMiddlings',
      supports: [
        'During the wheat milling process about 70 to 75% of the grain becomes flour; the remaining 25 to 30% is by-products largely for livestock',
      ],
    },
    {
      id: 'asbeRoller',
      supports: [
        'The goal is to extract the maximum endosperm while minimizing ash content (bran and germ contamination)',
      ],
    },
    {
      id: 'wmcMethods',
      supports: [
        'Ash: the sample is heated at 585°C until its weight is stable, usually overnight; the residue is the minerals, concentrated in the bran',
        'Examples: wheat ash of 1.58% or flour ash of 0.52%, usually expressed on a 14% moisture basis',
        'Ash content indirectly reveals bran contamination; ash darkens finished products; white specialty flours call for low ash, whole wheat flour has high ash',
      ],
    },
    {
      id: 'ukfmProcess',
      supports: [
        'Very white flours come from the early streams only, brown flours use most streams, wholemeal blends all streams back together',
      ],
    },
  ],
  'milling-baker-needs': [
    {
      id: 'ukfmFlour',
      supports: [
        'Bread flour needs high protein for gluten formation; gluten stabilises the bubbles and helps the loaf stay risen',
        'Cakes and biscuits need flour with less gluten',
      ],
    },
    {
      id: 'wmcMethods',
      supports: [
        'Higher protein content usually requires more water and a longer mixing time',
        'Falling number: a flour-water slurry heated in a boiling water bath; the time for the stirrer to drop is the value, in seconds',
        'A high falling number (for example, above 300 seconds) indicates minimal enzyme activity and sound wheat or flour; a low one (for example, below 250 seconds) indicates substantial enzyme activity and sprout damage',
        'Too much enzyme activity gives sticky dough and poor texture; if the falling number is too low the enzymes cannot be removed',
        'Farinograph absorption: the water needed to centre the curve on the 500 BU line, expressed as a percentage',
        'Weak gluten flour has a lower water absorption and shorter stability time than strong gluten flour',
      ],
    },
    {
      id: 'ukfmIntake',
      supports: ['UK mills test protein, the Hagberg Falling Number and moisture at intake'],
    },
  ],
  'milling-dust-explosions': [
    {
      id: 'hseDust',
      supports: [
        'Flour is an example of an explosible dust in the food industries',
        'A combustible dust suspended in air at the correct concentration and contained when ignited gives a violent explosion; uncontained, a fireball',
        'Ignition energies may be as low as the static discharge when taking off a synthetic fibre jumper',
        'Seal joints and leakage points to prevent escape and accumulation of dust',
        'Clean with a fully earthed, centralised piped vacuum system; avoid sweeping brushes and compressed air',
        'Surface temperatures should be controlled to a maximum of 200°C',
        'Fit silos and bins with explosion relief vented to an unoccupied place of safety; equip bucket elevators with explosion relief',
        'Electrically bond and earth all metalwork of powder handling systems, including delivery tankers',
      ],
    },
    {
      id: 'csbDust',
      supports: [
        'A dust explosion needs fuel, ignition, oxygen, dispersion and confinement (the dust explosion pentagon)',
        'A secondary explosion occurs when accumulated dust is lofted and ignited by a primary explosion; a weak primary explosion may cause very powerful secondary explosions',
        'Key finding 4: secondary dust explosions, due to inadequate housekeeping and excessive dust accumulations, caused much of the damage and casualties in recent catastrophic incidents',
        'The NFPA warns that more than 1/32 of an inch of dust over 5 percent of a room surface area presents a significant explosion hazard',
        "OSHA's 1987 Grain Handling Facilities Standard applies to flour mills and effectively reduced the number and severity of grain dust explosions",
      ],
    },
  ],
};

/** The sources for the real-world facts in each cutaway lesson. */
export const LESSON_SOURCES: Record<
  'mill' | 'sifter' | 'packer' | 'silo' | 'henhouse',
  SourcedClaims[]
> = {
  mill: [
    {
      id: 'wmcMethods',
      supports: ['Corrugated rolls break the wheat; smooth rolls reduce middlings into flour'],
    },
    {
      id: 'ksuMiddlings',
      supports: [
        'Breaker rolls shear the grain; each successive pair has finer corrugations and a closer gap',
      ],
    },
    {
      id: 'satakePatent',
      supports: [
        'Break rolls typically run at a speed ratio of 1.5 through 3.0 to 1, optimally 2.5:1; smooth rolls 1.1 through 1.5 to 1',
      ],
    },
  ],
  sifter: [
    {
      id: 'wmcMethods',
      supports: ['Broken wheat is sifted through successive screens of increasing fineness'],
    },
    {
      id: 'ksuMiddlings',
      supports: [
        'The coarsest particles are transferred to successive breaker rolls; the finest are sifted off as flour',
      ],
    },
  ],
  // The packer lesson describes only its drawn hopper, gate and spout.
  packer: [],
  silo: [
    {
      id: 'wmcMethods',
      supports: ['Stored wheat goes through cleaning and tempering before the first break'],
    },
  ],
  henhouse: [
    {
      id: 'defraHens',
      supports: [
        'A nest is a separate space for egg laying',
        'Perches should allow all hens to roost at the same time',
      ],
    },
  ],
};

/**
 * The cutaway's rolls are fluted, so they are a break pair: the fast roll turns
 * 2.5 times as fast as the slow one, the ratio US 5,678,777 names as optimal
 * for break rolls within its typical 1.5 to 3.0 to 1. Smooth reduction rolls
 * run at 1.1 to 1.5 to 1 in the same source.
 */
export const BREAK_ROLL_DIFFERENTIAL = 2.5;
export const BREAK_ROLL_DIFFERENTIAL_RANGE = [1.5, 3] as const;
export const REDUCTION_ROLL_DIFFERENTIAL_RANGE = [1.1, 1.5] as const;
