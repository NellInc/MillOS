/**
 * Portrait Configuration for BAMS Educational Content
 *
 * Lists all people referenced in the Bilateral Alignment Management System
 * educational materials who need generative portraits.
 *
 * Portrait images should be placed in: public/portraits/
 * Format: WebP, 256x256px recommended
 */

export interface PortraitConfig {
  id: string;
  name: string;
  title: string;
  affiliation: string;
  contribution: string;
  category: 'wallace' | 'mondragon' | 'semler' | 'bilateral' | 'other';
  imagePath: string;
  researchUrl?: string;
}

export const PORTRAITS: PortraitConfig[] = [
  // WALLACE STABILITY
  {
    id: 'rodrick-wallace',
    name: 'Prof. Dr. Rodrick Wallace',
    title: 'Research Scientist',
    affiliation: 'New York State Psychiatric Institute / Columbia University',
    contribution:
      'Rate Distortion Control Theory - mathematical foundations for cognitive system stability (ατ < 0.368)',
    category: 'wallace',
    imagePath: '/portraits/rodrick-wallace.webp',
    researchUrl: 'https://www.researchgate.net/profile/Rodrick-Wallace',
  },

  // MONDRAGON PRINCIPLES
  {
    id: 'jose-maria-arizmendiarrieta',
    name: 'Fr. José María Arizmendiarrieta',
    title: 'Founder',
    affiliation: 'Mondragon Cooperative Corporation',
    contribution:
      'Founded Mondragon in 1956. Established cooperative principles: worker ownership, democratic governance, wage solidarity.',
    category: 'mondragon',
    imagePath: '/portraits/jose-maria-arizmendiarrieta.webp',
  },

  // SEMLER PRACTICES
  {
    id: 'ricardo-semler',
    name: 'Ricardo Semler',
    title: 'CEO & Author',
    affiliation: 'Semco Partners',
    contribution:
      'Pioneered radical workplace democracy at Semco. Self-set salaries, worker-elected managers, radical transparency.',
    category: 'semler',
    imagePath: '/portraits/ricardo-semler.webp',
  },

  // BUURTZORG / SELF-MANAGING TEAMS
  {
    id: 'jos-de-blok',
    name: 'Jos de Blok',
    title: 'Founder & CEO',
    affiliation: 'Buurtzorg',
    contribution:
      'Created Buurtzorg self-managing nursing teams model. 15,000+ nurses in teams of 12 with no managers. Proof that flat structures scale.',
    category: 'semler',
    imagePath: '/portraits/jos-de-blok.webp',
  },

  // SERVANT LEADERSHIP
  {
    id: 'robert-greenleaf',
    name: 'Robert K. Greenleaf',
    title: 'Founder of Modern Servant Leadership',
    affiliation: 'AT&T (former) / Greenleaf Center',
    contribution:
      'Developed servant leadership philosophy. Leaders serve first, lead second. Influenced BAMS AI-as-servant model.',
    category: 'bilateral',
    imagePath: '/portraits/robert-greenleaf.webp',
  },

  // ADDITIONAL THINKERS
  {
    id: 'aristotle',
    name: 'Aristotle',
    title: 'Philosopher',
    affiliation: 'Ancient Greece',
    contribution:
      'Eudaimonia (flourishing) framework. Virtue ethics. Character through practice. Foundation for flourishing dimensions.',
    category: 'other',
    imagePath: '/portraits/aristotle.webp',
  },

  // QUALITY MANAGEMENT
  {
    id: 'w-edwards-deming',
    name: 'W. Edwards Deming',
    title: 'Statistician & Management Consultant',
    affiliation: 'NYU Stern School of Business',
    contribution:
      'System of Profound Knowledge. 14 Points for Management. PDCA cycle. Transformed Japanese manufacturing quality. "A bad system will beat a good person every time."',
    category: 'other',
    imagePath: '/portraits/w-edwards-deming.webp',
    researchUrl: 'https://deming.org/',
  },

  // COMMONS GOVERNANCE
  {
    id: 'elinor-ostrom',
    name: 'Elinor Ostrom',
    title: 'Nobel Laureate in Economics (2009)',
    affiliation: 'Indiana University',
    contribution:
      'Governing the Commons. Proved communities can self-manage shared resources without privatization or state control. 8 design principles for sustainable commons.',
    category: 'other',
    imagePath: '/portraits/elinor-ostrom.webp',
    researchUrl: 'https://en.wikipedia.org/wiki/Elinor_Ostrom',
  },
];

/**
 * Get portrait by ID
 */
export function getPortrait(id: string): PortraitConfig | undefined {
  return PORTRAITS.find((p) => p.id === id);
}

/**
 * Get portraits by category
 */
export function getPortraitsByCategory(
  category: PortraitConfig['category']
): PortraitConfig[] {
  return PORTRAITS.filter((p) => p.category === category);
}

/**
 * Portrait sources (all from Wikimedia Commons):
 *
 * - Rodrick Wallace: https://commons.wikimedia.org/wiki/File:Rodrick_Wallace.jpg
 * - José María Arizmendiarrieta: https://commons.wikimedia.org/wiki/File:Jose_Maria_Arizmendiarrieta.jpg
 * - Jos de Blok: https://commons.wikimedia.org/wiki/File:Jos_de_blok-1508879511.jpg
 * - Aristotle: https://en.wikipedia.org/wiki/File:Aristotle_Altemps_Inv8575.jpg
 * - W. Edwards Deming: https://commons.wikimedia.org/wiki/File:W._Edwards_Deming.jpg (FDA, public domain)
 * - Elinor Ostrom: https://commons.wikimedia.org/wiki/File:Nobel_Prize_2009-Press_Conference_KVA-30.jpg (CC BY-SA)
 *
 * NOT AVAILABLE on Wikimedia (no free images):
 * - Ricardo Semler
 * - Robert K. Greenleaf
 */
