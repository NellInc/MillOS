/**
 * Mill Chronicle history notes. Each note joins Datalinks under World and
 * Process Lineage, locked until one of its triggers fires (see
 * docs/CHRONICLE.md, section 14). Dates, names and figures were checked
 * against museum, archive, academic and encyclopaedia sources; where sources
 * disagree the prose says "about" or names a decade rather than a year.
 */
import type { HistoryNote } from './types';
import { translate } from '../i18n';
import { historyMessages } from './history.messages';

export const HISTORY_NOTES: HistoryNote[] = [
  {
    id: 'history-first-grain',
    title: 'The First Grain',
    brief:
      'Before Egypt had kings, Nile valley farmers grew emmer and barley and ground them by hand on saddle querns.',
    article: `## Emmer, Barley and the Quern\n\nBefore Egypt had kings, farmers in the Nile valley were already growing two cereals: emmer, a hulled wheat, and barley. Bread and beer made from them became the staples of the Egyptian diet. At Predynastic Hierakonpolis, residue in large brewing vats points to malted, crushed emmer with a smaller share of barley.\n\nEmmer was awkward grain. Its chaff clings to the kernel, so it was moistened and pounded, dried, winnowed and sieved before it could be ground at all. Grinding was done on a saddle quern: a flat lower stone on which a smaller handstone was rubbed back and forth over the grain. It was slow, kneeling work, and grit from the stones found its way into the bread and wore down the teeth of the people who ate it.\n\nYour charter is signed. Every receiving lot, roll stand and sifter in this mill descends from that stone and that handstone. The job has not changed: part the flour from the husk, cleanly and in quantity.`,
    triggers: ['charter_signed'],
    relatedEntries: [
      'history-grinding-statues',
      'history-old-kingdom-bakeries',
      'history-long-view',
    ],
  },
  {
    id: 'history-grinding-statues',
    title: 'The Grinders in Stone',
    brief:
      'Old Kingdom tombs held small limestone figures of servants grinding grain, so that the dead would never go without bread.',
    article: `## Servants for Eternity\n\nIn the Old Kingdom, wealthy Egyptians had small statues of servants placed in their tombs. The figures knelt at querns, kneaded dough, tended ovens and strained beer. Their purpose was practical: they were to take care of food production for the dead in the hereafter, so that the tomb owner would never go hungry.\n\nGrinding grain is one of the commonest scenes. The Metropolitan Museum of Art holds a painted limestone figure, Servant Grinding Grain, from the second half of the Fifth Dynasty, probably from the Giza area. She works at a saddle quern, the same back-and-forth motion that the first Nile farmers had used.\n\nNo carving records her name. The statues stand for the labour that every great state of the age rested on: long hours of grinding, by women and men, to turn grain into flour one handful at a time.\n\nThe Great Programme is over. Whatever medal it earned, the tonnage on your dispatch record would have taken a kneeling grinder far longer than a lifetime. The rolls do that work now; the figures in the tombs are a reminder of who did it first.`,
    triggers: ['trial_outro:great_programme'],
    relatedEntries: ['history-first-grain', 'history-old-kingdom-bakeries'],
  },
  {
    id: 'history-old-kingdom-bakeries',
    title: 'Bread for the Pyramid Builders',
    brief:
      'South of the Sphinx, archaeologists found the bakeries that fed the workforce of Giza’s pyramid age.',
    article: `## The Wall of the Crow\n\nAbout 400 metres south of the Sphinx lies a settlement known by the Arabic name Heit el-Ghurab, the Wall of the Crow, after a massive stone wall at its northern edge. Excavated since the late 1980s by Ancient Egypt Research Associates under Mark Lehner, it is dated to the reigns of Khafre and Menkaure, in the Fourth Dynasty. It housed and fed people working on the pyramid complexes.\n\nBakeries turned up in the team’s 1991 dig, and more have been identified since, many of them large, industrial-style buildings. Bread was baked in conical pottery moulds called bedja: the moulds were heated, filled with dough, and set in shallow troughs in the floor with hot embers around them. In some deposits, bread-mould fragments make up most of the pottery.\n\nFeeding a workforce on that scale meant milling, baking and delivery planned like any other part of the works.\n\nThe Great Programme is two shifts away. Nine shifts, twenty thousand kilograms, and not a sack below standard. Like the bakers of Giza, you are being asked for volume without letting quality slide.`,
    triggers: ['trial_intro:great_programme'],
    relatedEntries: ['history-grinding-statues', 'history-first-grain'],
  },
  {
    id: 'history-nilometer',
    title: 'Reading the River',
    brief:
      'Egypt’s nilometers measured the height of the Nile flood, which forecast the harvest and set the tax.',
    article: `## The Nilometer\n\nEgypt’s harvest depended on the yearly flood of the Nile. Too low, and fields went unwatered; too high, and villages and dykes were swept away. To read what was coming, Egyptians built nilometers: gauges calibrated in cubits, built as a marked column, a stairway descending to the river, or a deep well fed by a culvert.\n\nThe stairway nilometer on Elephantine island at Aswan is the best known. For much of Egyptian history Elephantine marked the southern border, so it was the first place the rising flood could be measured. On Roda island in Cairo, a nilometer built in AD 861 still stands.\n\nThe readings had a second use. Because the height of the flood predicted the size of the harvest, it was used to set the tax that farmers would owe. A forecast was also a budget, and a low flood meant a lean year.\n\nYour forecasts and crop years work the same way. A forecast names a hazard, a chance and a shift; a dry year shows in the lots at receiving. Like a nilometer reading, either is only worth something if you act on it before the shortfall arrives.`,
    triggers: ['first_forecast', 'crop:dry'],
    relatedEntries: ['history-nomarchs', 'history-grain-moisture'],
  },
  {
    id: 'history-nomarchs',
    title: 'The Governors of the Nomes',
    brief:
      'In the late Old Kingdom, provincial governors made their offices hereditary and power drifted away from the king.',
    article: `## Nomes and Nomarchs\n\nAncient Egypt was divided into provinces that the Greeks later called nomes; the official in charge of one is usually called a nomarch, though many scholars now prefer the plainer word governor. A governor ran his province on the king’s behalf.\n\nToward the end of the Old Kingdom the balance shifted. Governorships became hereditary, so families held them generation after generation, built their tombs in their own provinces rather than near the king, raised their own forces and fought local rivals. After the very long reign of Pepi II in the Sixth Dynasty, the central state broke into competing regional powers, the era historians call the First Intermediate Period.\n\nHistorians now tend to see the period as one of change rather than simple collapse. But the authority the provinces gained was not easily taken back.\n\nYou have delegated authority to the AI partner. Unlike a nomarch’s office, yours stays bounded: every initiative is logged with its reason, and a reversible one can be undone.`,
    triggers: ['delegation'],
    relatedEntries: ['history-nilometer', 'history-grinding-statues'],
  },
  {
    id: 'history-domesday-mills',
    title: 'The Mills of Domesday',
    brief:
      'William the Conqueror’s great survey of 1086 counted thousands of mills across England.',
    article: `## A Kingdom Counted\n\nTwenty years after the Norman Conquest, William the Conqueror ordered a survey of the land he ruled. Its results, completed in 1086 and later called Domesday Book, recorded who held each manor and what it was worth, down to its meadows, woodland, fisheries and mills.\n\nThe mills are everywhere. Historians’ counts run from about 5,600 to more than 6,000, and even the lower figure is thought to undercount because the survey is incomplete. Almost all were water-powered grain mills: windmills had not yet reached England, and some sites may have used animals. Each was entered with its value, because a mill was income for whoever held it.\n\nDomesday was not a history. It was an assessment, made so that the king knew what each holding owed.\n\nYou have just closed your first shift report. It is your own small Domesday: what came in, what went out, what each line earned and what it cost. Read it the same way, as the record your next decisions rest on.`,
    triggers: ['first_shift_report'],
    relatedEntries: ['history-watermills', 'history-windmills', 'history-tide-mills'],
  },
  {
    id: 'history-watermills',
    title: 'Wheels in the Water',
    brief:
      'A Roman engineer described the geared water mill, and near Arles sixteen wheels ground grain on a single hillside.',
    article: `## Vitruvius and Barbegal\n\nThe Roman architect and engineer Vitruvius, writing late in the first century BC, gave the first technical description of a water mill. A vertical wheel turned on a horizontal axle, driven by the stream flowing beneath it. On the axle, a toothed drum-wheel meshed with a larger horizontal toothed wheel, which turned the millstone. Water mills were among the first sources of power that did not depend on the muscle of people or animals.\n\nAt Barbegal, near Arles in southern France, Roman engineers took the idea to industrial scale. An aqueduct fed sixteen water wheels arranged in two parallel rows of eight, stepping down a steep hillside, each driving its own mill. The complex dates from the second century AD and is often called the first attempt in Europe at a machine complex on an industrial scale.\n\nWater gave mills their power for nearly two thousand years. It was also their oldest hazard: a river in spate could carry away wheel, race and building.\n\nSevere rain is falling on the site. The same water that once drove the stones now threatens the yard, the receiving bay and the deliveries on the road.`,
    triggers: ['incident:severe_rain'],
    relatedEntries: ['history-domesday-mills', 'history-tide-mills', 'history-windmills'],
  },
  {
    id: 'history-windmills',
    title: 'The Post Mill',
    brief:
      'England’s first windmills, recorded from the 1180s, were post mills whose whole body turned to face the wind.',
    article: `## Turning to the Wind\n\nWindmills reached England about a century after Domesday. Written records begin in the 1180s; one of the earliest, from 1185, concerns a mill at Weedley in Yorkshire. These first mills were post mills.\n\nA post mill balances its whole body, holding the sails, the gearing and the millstones, on a single great upright post. Wind in north-western Europe changes direction often, so the miller had to turn the entire mill to face it, pushing on a long tailpole that reached down to the ground. Early posts were sunk into earth mounds; later mills stood on a timber trestle, often sheltered inside a roundhouse at the base.\n\nThe post mill freed milling from the riverbank. A mill could stand on any exposed rise, wherever there was grain to grind and wind to grind it.\n\nYou have installed a wind turbine. The mill’s oldest trade-off has not changed: wind is free, but it comes when it chooses, and the plant must be ready to take it and to carry on without it.`,
    triggers: ['improvement:wind-turbine'],
    relatedEntries: ['history-watermills', 'history-domesday-mills', 'history-millwrights'],
  },
  {
    id: 'history-millwrights',
    title: 'The Millwrights',
    brief:
      'Millwrights built wheels, gears and shafts by hand, and from their trade came the first engineers.',
    article: `## Engineers Before the Word\n\nFor centuries, the millwright was the person who designed and built a mill entire: the water wheel or sails, the gearing, the shafts and the stones. Millwrighting is often called the forerunner of modern mechanical engineering, and two of Britain’s great eighteenth-century engineers came out of it.\n\nJames Brindley was apprenticed to a millwright at seventeen and made his name repairing and improving machinery. The Duke of Bridgewater then hired him to carry coal from his mines at Worsley to Manchester. The Bridgewater Canal, opened in 1761, made Brindley one of the leading canal engineers of his day.\n\nJohn Smeaton built scale models of water wheels and windmills and measured how well they worked. His paper on the subject won the Royal Society’s Copley Medal in 1759. He later took the title civil engineer, to set civilian consultants apart from military engineers, and is often called the father of civil engineering.\n\nYou have hired a contractor. Their traits are their record: what they save, what they risk and how quickly they finish. Choose them the way a mill owner chose a millwright.`,
    triggers: ['contractor_hired'],
    relatedEntries: ['history-oliver-evans', 'history-windmills', 'history-watermills'],
  },
  {
    id: 'history-oliver-evans',
    title: 'The Mill That Ran Itself',
    brief:
      'In 1780s Delaware, Oliver Evans built a flour mill in which grain moved from intake to barrel with almost no hands.',
    article: `## Oliver Evans\n\nIn the 1780s Oliver Evans set out to remove the heaviest work from his brothers’ mill on Red Clay Creek, Delaware. Bucket elevators lifted grain to the top of the building. Screw conveyors carried it along. A machine he called the hopper boy, a slowly revolving rake, spread the warm meal from the stones so it could cool and dry before sifting, a job once done with shovels. Water power drove the whole sequence, and grain moved from process to process without being carried.\n\nIn 1790 Evans received the third patent granted under the new United States patent law. In 1795 he published The Young Mill-Wright and Miller’s Guide, which explained his system and the practice of milling in detail. It went through fifteen editions by 1860 and became the standard manual for American millers.\n\nAutomation did not abolish the miller; it changed the job from lifting to supervising, setting and repairing.\n\nYour mill is now a district mill. The conveyors, elevators and transfers it runs on all trace back to Evans’s continuous flow.`,
    triggers: ['era:district'],
    relatedEntries: ['history-grain-elevator', 'history-millwrights', 'history-albion-mills'],
  },
  {
    id: 'history-albion-mills',
    title: 'The Albion Mills Fire',
    brief: 'London’s great steam-powered flour mill, the wonder of its day, burned down in 1791.',
    article: `## Steam on the Thames\n\nThe Albion Mills stood at the Southwark end of Blackfriars Bridge in London. Matthew Boulton planned them from 1783, John Rennie designed the milling machinery, and Boulton and Watt steam engines drove twenty pairs of millstones. Completed in 1786, they were the first steam-powered commercial flour mill in Britain, and were hailed as an industrial wonder of the time.\n\nEarly on the morning of 2 March 1791, fire broke out. Within about two hours the building was gutted. The cause was never officially established. Many suspected arson by rival millers or mill workers who feared the competition. The burned shell stood on the riverbank for years before it was pulled down.\n\nThe fire showed what concentration meant: when one great mill burned, all of its output vanished at once.\n\nThere is a fire in the extraction ducting. The fail-safe has stopped production and the forklifts. Nobody is in danger. Suppress it, clean the ducts, and then ask what let it start.`,
    triggers: ['fire'],
    relatedEntries: ['history-washburn-a', 'history-oliver-evans', 'history-mill-electrification'],
  },
  {
    id: 'history-roller-milling',
    title: 'The Budapest Rollers',
    brief:
      'In the 1870s, Budapest engineers replaced millstones with chilled cast-iron rollers and changed milling worldwide.',
    article: `## High Milling in Hungary\n\nIn the nineteenth century Budapest became one of the great milling cities of the world. Hungarian millers practised high milling: instead of grinding wheat to flour in one pass, they broke it gradually, sifting and regrinding again and again to draw out the whitest flour.\n\nRollers suited that method better than stones. Friedrich Wegmann’s roller mill used porcelain rolls, which were fragile. The Ganz works in Buda, already known for chill-cast iron, produced rolls of chilled cast iron instead: hard, wear-resistant and grooved to crack the grain. Under András Mechwart, who led Ganz after its founder died in 1867, the company bought Wegmann’s patent, refined the design and sold roller mills around the world through the 1870s and after.\n\nOver the following decades, roller mills came to replace millstones in large commercial mills across Europe and North America.\n\nYour mill is now a regional mill. Its roller stands are the heirs of the Budapest rolls: the same gradual reduction, the same pairs of iron cylinders, run with a precision Mechwart could only aim at.`,
    triggers: ['era:regional'],
    relatedEntries: ['history-plansifter', 'history-washburn-a', 'history-oliver-evans'],
  },
  {
    id: 'history-plansifter',
    title: 'The Plansifter',
    brief:
      'Carl Haggenmacher, a Budapest miller, patented the plansifter in the late 1880s: stacked sieves swinging in a flat circle.',
    article: `## Sieves in a Stack\n\nGradual reduction made a new problem. Every pass through the rollers had to be sifted, and the bolting machines of the day, rotating cylinders covered in cloth, were bulky and hungry for power.\n\nCarl Haggenmacher, born in Winterthur, Switzerland, in 1835, worked as a miller in Budapest and patented a series of milling inventions. The most important was the plansifter, for which he filed his original patent in 1887. Instead of a rotating reel, it stacked flat sieves one above another in a box and moved them in a horizontal plane, so the stock travelled across each sieve and the fine material dropped through to the next.\n\nThe plansifter did the same work in less room and with less power, and its descendants remain the usual sifting machines in flour mills today.\n\nYou have installed a plansifter retrofit. The plansifters on your upper floor are Haggenmacher’s design, refined over more than a century: stacked sieves, a gyrating motion, and a separation that decides the quality of every sack below.`,
    triggers: ['improvement:sifter-retrofit'],
    relatedEntries: ['history-roller-milling', 'history-washburn-a'],
  },
  {
    id: 'history-washburn-a',
    title: 'The Washburn A Explosion',
    brief:
      'On 2 May 1878, flour dust exploded inside the Washburn A Mill in Minneapolis, killing eighteen workers.',
    article: `## Dust Is Fuel\n\nThe Washburn A Mill opened in 1874 on the Minneapolis riverfront and was among the largest flour mills in the United States. On the evening of 2 May 1878, shortly after the night crew arrived, a series of explosions destroyed it. All fourteen men inside were killed, and the fire spread to the neighbouring Diamond and Humboldt mills, killing four more. Eighteen workers died.\n\nAt the inquest the mill’s manager blamed rapidly burning flour dust, and two University of Minnesota professors later confirmed it in experiments. Their conclusion was that two millstones running dry had struck a spark that ignited dust in the air.\n\nThe disaster changed the industry. Washburn’s rebuilt A Mill, open by 1880, had new ventilation to stop dust collecting, and devices that came to be called dust collectors spread to other mills. The ruins of the rebuilt mill now house the Mill City Museum.\n\nYour dust filter pressure is rising. That alarm exists because of 1878. A blocked filter is not a nuisance; it is dust that should be in a bag and is in the air instead.`,
    triggers: ['incident:dust_filter_pressure'],
    relatedEntries: ['history-albion-mills', 'history-roller-milling', 'history-plansifter'],
  },
  {
    id: 'history-grain-elevator',
    title: 'The First Grain Elevator',
    brief:
      'In 1842 Joseph Dart and Robert Dunbar built a steam-powered grain elevator in Buffalo, New York.',
    article: `## Grain Without Sacks\n\nIn the early nineteenth century, grain arriving at Buffalo on Great Lakes ships was carried off in barrels and sacks, by hand. A merchant, Joseph Dart, and an engineer, Robert Dunbar, set out to mechanise the transfer.\n\nTaking Oliver Evans’s bucket elevators as their model, they built a steam-powered elevator in 1842. Its marine leg, a bucket conveyor lowered into a ship’s hold, scooped loose grain out of the hull and lifted it to the top of a tower, from which it could be weighed, stored and loaded onward. Construction began in 1842 and the elevator went into service in 1843.\n\nIt worked so well that others copied it along the waterfront. By the late 1840s Buffalo had ten elevators. Within about fifteen years it had become one of the largest grain ports in the world, and bulk handling replaced the sack.\n\nYou have received your first delivery. The intake pit, the elevator and the silo it fills are Dart and Dunbar’s idea: grain kept loose, kept moving, and weighed on the way in.`,
    triggers: ['first_receiving'],
    relatedEntries: ['history-oliver-evans', 'history-grain-moisture'],
  },
  {
    id: 'history-falling-number',
    title: 'The Falling Number',
    brief:
      'A Swedish test from the late 1950s times a falling stirrer to detect sprout damage in grain.',
    article: `## Timing a Fall\n\nWhen rain falls on ripe wheat, kernels can begin to sprout in the ear. Sprouting produces large amounts of alpha-amylase, an enzyme that breaks down starch. Flour from sprouted grain makes sticky dough and poor bread, and even a few badly sprouted kernels can affect a whole lot.\n\nAt the end of the 1950s, Sven Hagberg and Harald Perten of the Swedish Institute for the Crafts and Industries developed a simple test. Ground grain and water are heated in a tube and stirred, then a stirrer is dropped through the slurry. The time it takes to reach the bottom, in seconds, is the falling number. More enzyme means a thinner slurry, a faster fall and a lower number.\n\nA low falling number warns of sprout damage. The method became an international standard and is still used in grain trading and flour mills worldwide.\n\nThe falling number is one of your laboratory’s QC readings, measured on the lots under test. Watch it whenever the weather has been wet at harvest, and first of all in a sprouted crop year: it tells you about damage you cannot see by looking at the grain.`,
    triggers: ['first_qc_test', 'crop:sprouted'],
    relatedEntries: ['history-grain-moisture', 'history-wet-harvest-1879'],
  },
  {
    id: 'history-grain-moisture',
    title: 'Keeping Grain Dry',
    brief:
      'Grain stores safely only when dry, and millers add water back on purpose just before milling.',
    article: `## Moisture in Store and at the Rolls\n\nGrain is alive, and damp grain stays busy. Above roughly 14 to 14.5 per cent moisture, wheat in store risks heating, mould and mites. UK guidance notes that mould growth and mite breeding stop when the air around the grain is below 65 per cent relative humidity, which dry grain kept cool will hold. Cooler grain is safer at the same moisture, so stores aim to dry and chill a harvest quickly.\n\nYet millers then add water back on purpose. Before milling, wheat is conditioned, or tempered: dampened and rested so the bran toughens and the inner endosperm softens. Tough bran separates cleanly from the endosperm instead of breaking up into the flour.\n\nSo moisture is controlled twice: kept low for storage, then raised to a precise level for the rolls.\n\nThis is a wet crop year. Lots are coming in damper than usual, and unconditioned wet grain will cost you quality. Conditioning or a dryer removes the penalty.`,
    triggers: ['crop:wet'],
    relatedEntries: ['history-grain-drying', 'history-falling-number', 'history-wet-harvest-1879'],
  },
  {
    id: 'history-grain-drying',
    title: 'Drying by Machine',
    brief:
      'The combine harvester removed the weeks grain once spent drying in the field, so it had to be dried by machine.',
    article: `## From Stook to Dryer\n\nFor most of history, cut grain dried in the field. Sheaves were stood together in stooks, with the heads off the ground, and left for days or weeks before carting and threshing. A wet summer could leave them sprouting where they stood.\n\nThe combine harvester reaps and threshes in a single pass, so there is no drying interval at all. Grain goes straight into the tank, often wetter than it can safely be stored. Combining in damp climates therefore needed mechanical drying. In 1928 Roland Dudley bought one of the first combine harvesters in the UK for his estate at Linkenholt in Hampshire, and found it harvested faster than grain could be dried. He designed a dryer, built by E. R. and F. Turner of Ipswich around 1929, that is among the earliest mechanised grain dryers in Britain. Drying on an industrial scale became routine after the Second World War.\n\nThe wet harvest is behind you. In the real world, machines like Dudley’s are why a wet summer now means a drying bill rather than a lost crop.`,
    triggers: ['trial_outro:wet_harvest'],
    relatedEntries: ['history-grain-moisture', 'history-wet-harvest-1879'],
  },
  {
    id: 'history-wet-harvest-1879',
    title: 'The Wet Summer of 1879',
    brief:
      'In 1879 rain ruined the British harvest, while cheap American wheat kept prices low and deepened a long farming depression.',
    article: `## A Ruined Harvest\n\nThe late 1870s brought a run of poor harvests to Britain, and 1879 was the worst of them. One account describes rain beginning in early spring and persisting until late September. Barley failed on heavy soils, and wheat turned black and shrank in the ear.\n\nA bad harvest would once have meant high prices to soften the blow. Not in 1879. The American prairies had been opened to the plough, and cheap steamships carried their wheat across the Atlantic. Imports filled the gap, prices stayed low, and British farmers lost both their crop and the price that might have compensated for it.\n\nThe wet years hid the deeper cause for a time. The great depression of British agriculture, usually dated from 1873 to 1896, was driven by falling grain prices, and the land never returned to its old profits.\n\nYour Wet Harvest trial is two shifts away. Damp lots, quality to protect, and six thousand kilograms to dispatch. The question is the one 1879 asked: what do you do with a crop the weather has already damaged?`,
    triggers: ['trial_intro:wet_harvest'],
    relatedEntries: ['history-grain-drying', 'history-corn-laws', 'history-grain-moisture'],
  },
  {
    id: 'history-assize-of-bread',
    title: 'The Assize of Bread and Ale',
    brief:
      'A thirteenth-century English law fixed the price of a loaf and made its weight rise and fall with the price of wheat.',
    article: `## Weighing the Loaf\n\nThe Assize of Bread and Ale was a thirteenth-century English law, and it regulated the price, weight and quality of the bread and ale sold in towns and villages. It is often called the first English law to regulate the production and sale of food.\n\nIts method was unusual. The price of a farthing loaf stayed the same, and its weight changed instead: when wheat grew dearer, the loaf grew lighter, and when wheat was cheap, the customer got more bread for the coin. Local courts enforced it, fining bakers and brewers who gave short measure. Bakers who feared a light loaf are thought to have added an extra one to a dozen, which is the likely origin of the phrase "a baker’s dozen".\n\nThe law lasted for centuries. It was amended by the Bread Acts of 1822 and 1836 and finally repealed in 1863.\n\nYour Inspection trial is two shifts away. Three clean closes in a row: passed QC tests, no quality failures, nothing serious left open. Medieval bakers faced the court-leet; you face the laboratory and the record.`,
    triggers: ['trial_intro:inspection'],
    relatedEntries: ['history-sale-of-food-act', 'history-corn-laws'],
  },
  {
    id: 'history-sale-of-food-act',
    title: 'Alum and the Public Analyst',
    brief:
      'Victorian bakers whitened bread with alum, and the Sale of Food and Drugs Act 1875 put public analysts on the case.',
    article: `## Proving What Is in the Loaf\n\nIn Victorian Britain, adulterated food was common. Bakers added alum to bread to make it look whiter. Alum was not itself a poison, but it hindered digestion. The physician Arthur Hill Hassall, the leading reformer in the field, found alum in much of the bread he examined in the 1850s.\n\nEarlier Adulteration of Food Acts had proved weak. The Sale of Food and Drugs Act 1875 replaced them. It required local authorities to appoint analysts with the knowledge and skill to examine food and drugs sold in their districts, and allowed inspectors to obtain samples and submit them for analysis. Selling food mixed with ingredients that made it injurious to health became an offence.\n\nThe 1875 Act set the pattern for British food law for decades: an independent analyst, a sample and a certificate in place of a customer’s word.\n\nYour Inspection trial is over. The test you just passed, or failed, is the descendant of that system.`,
    triggers: ['trial_outro:inspection'],
    relatedEntries: ['history-assize-of-bread', 'history-falling-number'],
  },
  {
    id: 'history-chorleywood',
    title: 'The Chorleywood Process',
    brief:
      'In 1961 British researchers found a way to make bread fast from lower-protein wheat, and changed what millers had to supply.',
    article: `## Mixing Instead of Waiting\n\nTraditional bread needs time. The dough is left for hours so fermentation can develop the gluten that holds the gas. In 1961, researchers at the British Baking Industries Research Association in Chorleywood found a shortcut: a few minutes of intense, high-speed mechanical mixing, with more yeast, a little fat and an oxidising improver, now usually vitamin C.\n\nThe Chorleywood bread process cut production time dramatically, and it had a second effect that mattered to millers. Long fermentation loses some of the gluten’s strength; mechanical development does not lose as much, so bakers could make acceptable bread from lower-protein wheat. At the time few British wheats were strong enough for good bread, and the alternative was costly imported North American grain. Chorleywood let millers put more home-grown wheat in the grist.\n\nIt spread fast. By 2009 about 80 per cent of the bread made in the United Kingdom used it.\n\nThe Bakers' Rush is two shifts away: twelve thousand kilograms in six shifts. Industrial bakers want consistent flour, delivered on time and in volume.`,
    triggers: ['trial_intro:bakers_rush'],
    relatedEntries: ['history-bread-rationing', 'history-falling-number'],
  },
  {
    id: 'history-bread-rationing',
    title: 'Bread on the Ration',
    brief:
      'Bread was never rationed in Britain during the Second World War, but it was rationed from 1946 to 1948.',
    article: `## Rationed in Peacetime\n\nThroughout the Second World War, bread in Britain stayed off the ration. The government judged that rationing it would damage morale, and stretched supplies instead: white flour was banned, and flour was milled to an 85 per cent extraction rate as the National Flour, keeping more of each grain in the loaf.\n\nPeace made things worse. With world wheat supplies short, food needed for occupied Europe and Britain’s finances strained, Clement Attlee’s Labour government introduced bread rationing on 21 July 1946, about a year after the war ended. Bread and flour stayed on the ration for two years, until July 1948.\n\nRationing is a mill’s demand turned upside down: instead of meeting every order, the question becomes how to share too little fairly.\n\nThe Bakers' Rush is over. However it went, you were asked to supply more, not less. That is the better problem to have.`,
    triggers: ['trial_outro:bakers_rush'],
    relatedEntries: ['history-chorleywood', 'history-three-day-week'],
  },
  {
    id: 'history-three-day-week',
    title: 'The Three-Day Week',
    brief:
      'In early 1974, coal shortages forced British businesses onto three days of electricity a week.',
    article: `## Power by the Day\n\nIn the winter of 1973 to 1974, industrial action by coal miners and railway workers severely restricted coal supplies to Britain’s power stations. Edward Heath’s Conservative government responded by rationing electricity.\n\nFrom 1 January 1974, commercial users were limited to three specified consecutive days of electricity each week, and could not work longer hours on those days. Essential services such as hospitals were exempt, and television broadcasting closed early in the evening. Factories and mills had to plan their production around the days they could run, cutting output and lengthening every order.\n\nThe restrictions were lifted on 7 March 1974, after a general election had changed the government.\n\nGrid Winter is two shifts away: eight thousand kilograms to dispatch, at no more than 0.08 in energy cost per kilogram. You will not be cut to three days, but every kilowatt-hour now has a price that shows. Run the heavy loads when they earn their keep.`,
    triggers: ['trial_intro:grid_winter'],
    relatedEntries: [
      'history-tide-mills',
      'history-mill-electrification',
      'history-bread-rationing',
    ],
  },
  {
    id: 'history-tide-mills',
    title: 'The Tide Mill',
    brief: 'Tide mills stored the sea in a pond at high water and milled with it on the ebb.',
    article: `## Energy in a Pond\n\nA tide mill works like a battery filled by the moon. A dam with a sluice closes off a tidal inlet. As the tide comes in, water fills the mill pond through a one-way gate, which shuts as the tide begins to fall. When the tide outside is low enough, the miller releases the stored water through the wheel and grinds until the pond runs down.\n\nThe hours were set by the tides, not the clock, so the miller’s working day moved with them. In exchange, the power was predictable months ahead, in a way that wind and rain never were.\n\nWoodbridge Tide Mill in Suffolk shows how long the idea lasted. The first record of a tide mill on the site dates from 1170. The mill worked commercially until 1957, when it closed as the last commercially operating tide mill in Britain. It has since been restored and opened to the public, and its original seven-acre pond is now a marina.\n\nGrid Winter is over. The lesson of the tide mill still stands: energy that can be stored can be spent when it is cheapest to use.`,
    triggers: ['trial_outro:grid_winter'],
    relatedEntries: ['history-three-day-week', 'history-watermills', 'history-domesday-mills'],
  },
  {
    id: 'history-rochdale',
    title: 'The Rochdale Pioneers',
    brief:
      'In 1844 a group of Rochdale workers opened a co-operative shop whose rules became the model for co-operatives worldwide.',
    article: `## Toad Lane, 1844\n\nThe Rochdale Society of Equitable Pioneers was founded in 1844 by working people in the Lancashire mill town of Rochdale, many of them weavers. On 21 December 1844 they opened a shop at 31 Toad Lane, with a meagre stock of butter, sugar, flour and oatmeal. Tradition counts twenty-eight founders, though the society’s own minutes never give that figure.\n\nOther co-operatives had come before and failed. The Pioneers became known for honest, unadulterated goods, and they were among the first to return surplus to members as a dividend in proportion to what each had bought.\n\nThe rules they set out became known as the Rochdale Principles. The International Co-operative Alliance adopted them in 1937 and revised them in 1966 and 1995, when they became the seven co-operative principles used today, beginning with voluntary and open membership and including one member, one vote. The Toad Lane shop is now the Rochdale Pioneers Museum.\n\nYour mill is now a cooperative mill. Its fund is built from reinvested contribution, the same idea in a different trade.`,
    triggers: ['era:cooperative'],
    relatedEntries: ['history-mondragon', 'history-long-view'],
  },
  {
    id: 'history-mondragon',
    title: 'Mondragon',
    brief:
      'From a single workshop founded in 1956, the Basque town of Mondragón grew a federation of worker co-operatives.',
    article: `## A Federation of Co-operatives\n\nOn 14 April 1956, in the Basque town of Mondragón, the priest José María Arizmendiarrieta blessed the foundation stone of a small manufacturing company called Ulgor. Its name was built from the surnames of its five founders, young engineers and technicians who had trained at the technical school he had set up. Its first bylaws as a co-operative were approved in 1959.\n\nThat same year Arizmendiarrieta helped found a co-operative bank, Caja Laboral Popular. With its own source of credit, the movement could start and support new co-operatives rather than wait for outside investors. Workshops, a school and the bank grew into a family of co-operatives that today forms the Mondragon Corporation, a federation of worker co-operatives and one of the largest business groups in Spain.\n\nFederation let each co-operative stay self-governing while sharing finance, research and training with the rest.\n\nYour mill is now a federated cooperative. Like Mondragon, it keeps its own decisions and shares a larger strength.`,
    triggers: ['era:federated'],
    relatedEntries: ['history-rochdale', 'history-long-view'],
  },
  {
    id: 'history-mill-electrification',
    title: 'From Shafts to Wires',
    brief:
      'Mills once drove every machine from one engine through shafts and belts; electricity changed that in the early twentieth century.',
    article: `## The Line Shaft\n\nFor most of the industrial age a mill had one source of power: a water wheel, a turbine or a steam engine. It turned a line shaft, a long rotating bar hung from the ceiling, and leather or cotton belts ran from pulleys on the shaft down to each machine. Stop the engine and the whole mill stopped. Layout followed the shaft, the system was noisy and dangerous, and its bearings needed constant lubrication.\n\nBetween about 1880 and 1930, factories moved from shaft-and-belt drive to electric motors. At first a single large motor often simply replaced the engine and still turned the old line shafts. Later, separate motors drove groups of machines and then individual machines, so each could start, stop and be repaired on its own.\n\nElectric drive made mills cleaner and more flexible, and it tied them to the grid. A flicker in the supply now reached every machine at once.\n\nThe supply is sagging. Motors slow, roll stands lose speed, and output falls until the voltage recovers. A power sag is the line shaft’s old single point of failure, moved outside the building.`,
    triggers: ['incident:power_sag'],
    relatedEntries: ['history-scada', 'history-three-day-week', 'history-albion-mills'],
  },
  {
    id: 'history-scada',
    title: 'Supervisory Control',
    brief:
      'SCADA systems let operators supervise distant plant from one room; local controllers did the controlling.',
    article: `## Why "Supervisory"\n\nSCADA stands for supervisory control and data acquisition. Systems of this kind grew up in electricity networks, pipelines and water works, where equipment was spread over miles and somebody had to watch it from one place.\n\nEarly links were slow and unreliable. In water and wastewater systems of the 1960s and 1970s, the connection between the control room and a remote station was considered too tenuous for real control from the centre. So the control stayed local, in remote terminal units and later programmable logic controllers, and the central room supervised: it gathered readings, displayed them, often on a large mimic panel, and sent occasional commands. That division survives. Local controllers keep the process safe on their own; the supervisory layer sees the whole and decides.\n\nThe control network is degraded. Your SCADA view may be stale or incomplete, but the machines’ local controls are still running. Trust the field readings, treat the screen with caution, and restore the link before making large changes.`,
    triggers: ['incident:control_network_degraded'],
    relatedEntries: ['history-mill-electrification', 'history-washburn-a'],
  },
  {
    id: 'history-flour-sacks',
    title: 'Dresses from Flour Sacks',
    brief:
      'In the 1930s American millers printed their cotton sacks with patterns, knowing families would sew them into clothes.',
    article: `## The Sack as Fabric\n\nFlour, feed and sugar were once sold in cotton sacks. On American farms in the 1920s and through the Great Depression, families reused the cloth for dresses, shirts, aprons, curtains and toys. Bag makers noticed, and instead of fighting the practice they encouraged it: they printed sacks with colours and patterns that women would want to sew, so that a customer choosing flour might choose it for the fabric.\n\nBy the 1930s companies treated the sacks as part of their marketing. In 1933 the Textile Bag Manufacturers Association published a booklet, Sewing with Cotton Bags, and by the late 1930s most companies used water-soluble ink or paper labels so the brand name washed out. The National Museum of American History holds a feed-sack dress made for a 1959 Cotton Bag Sewing Contest.\n\nAfter the Second World War, cheaper paper sacks replaced cloth, and most feed-sack production had ended by the early 1960s.\n\nThere is a packaging shortage. When sacks run short, packing stops, however much flour is ready. Packaging is part of the product.`,
    triggers: ['incident:packaging_shortage'],
    relatedEntries: ['history-sale-of-food-act'],
  },
  {
    id: 'history-ergot',
    title: 'Ergot and St Anthony’s Fire',
    brief:
      'A fungus on rye caused medieval epidemics of St Anthony’s fire, and cleaning grain is still the defence.',
    article: `## The Poison in the Ear\n\nErgot is a fungus, Claviceps purpurea, that infects rye and other cereals. In place of some kernels it grows hard, dark purple to black bodies, and these contain alkaloids that are poisonous when eaten. Long exposure causes ergotism. In one form it brings convulsions; in the other, blood supply to the limbs fails and they turn gangrenous.\n\nIn medieval Europe, where the poor ate much rye bread, ergotism came in epidemics. The gangrenous form was called holy fire or St Anthony’s fire, a name usually linked to the monks of the Order of St Anthony, who devoted themselves to treating sufferers. Its cause was not understood for centuries.\n\nThe defence is clean grain. Because many ergot bodies are about the size and shape of a kernel, sieves miss a share of them; gravity tables, which sort by density, and colour sorters work better. Even so, badly infected lots are best kept out of the mill altogether.\n\nA supplier lot is contaminated. Hold it, trace where it went, and do not let it reach the rolls.`,
    triggers: ['incident:supplier_contamination'],
    relatedEntries: ['history-grain-moisture', 'history-sale-of-food-act'],
  },
  {
    id: 'history-corn-laws',
    title: 'The Corn Laws',
    brief:
      'From 1815 to 1846 British law kept out foreign grain to hold prices up, until Robert Peel repealed it.',
    article: `## Protecting the Price of Bread\n\nIn British English, corn means all cereal grains. After the Napoleonic Wars, Parliament passed the Importation Act 1815, which barred foreign corn until the price of domestic wheat reached 80 shillings a quarter. Landowners kept their high prices; working families paid more for bread.\n\nThe law was eased with a sliding scale of duties in 1828, but opposition grew. The Anti-Corn Law League, founded in 1838 and led by figures such as Richard Cobden and John Bright, campaigned across the country for free trade in grain. When blight ruined the Irish potato crop in 1845 and famine followed, the case for cheap imported food became urgent.\n\nIn 1846 the Conservative prime minister Sir Robert Peel carried repeal through Parliament with Whig support, against most of his own party, which split over it. Britain moved toward free trade, and over the following decades cheap imported grain became the norm.\n\nThis is a bountiful crop year. Plenty is welcome, but it lowers the price of grain for everyone at once. Prices, like harvests, are made in more places than your own fields.`,
    triggers: ['crop:bountiful'],
    relatedEntries: ['history-wet-harvest-1879', 'history-assize-of-bread'],
  },
  {
    id: 'history-long-view',
    title: 'The Long View',
    brief:
      'From the saddle quern to the federated co-operative mill: what has changed in milling, and what has not.',
    article: `## What Changes and What Does Not\n\nThe story began on the floor of a Nile valley house, with a saddle quern and a handstone. Since then nearly everything about milling has changed. Water wheels took over from arms, as Vitruvius described; the Domesday commissioners counted thousands of mills; Oliver Evans set grain moving through a mill without hands; the Budapest rolls replaced the stones; steam and then electricity replaced the river. Ownership changed too, from mills valued as a lord’s income in Domesday, to the co-operatives of Rochdale and Mondragon owned by the people they serve.\n\nSome things have not changed at all. Grain must be kept dry and clean. Dust is always fuel. A loaf must be the weight it claims to be and contain only what it should. And a mill is only as good as the trust of the people who buy from it.\n\nYour chronicle is complete. The mill runs on, and the record you kept is now part of its history. What you chose to keep the same mattered as much as what you changed.`,
    triggers: ['chronicle_end'],
    relatedEntries: ['history-first-grain', 'history-rochdale', 'history-mondragon'],
  },
];

function localizeHistoryNote(note: HistoryNote): HistoryNote {
  const messages = historyMessages(note);
  return {
    ...note,
    title: translate(messages, 'title'),
    brief: translate(messages, 'brief'),
    article: translate(messages, 'article'),
    triggers: [...note.triggers],
    relatedEntries: [...note.relatedEntries],
  };
}

/** Localized copy, resolved when read; persisted and engine IDs stay canonical. */
export function getHistoryNotes(): HistoryNote[] {
  return HISTORY_NOTES.map(localizeHistoryNote);
}

/** Resolve one Datalinks note without rebuilding the whole authored corpus. */
export function getHistoryNote(id: string): HistoryNote | undefined {
  const note = HISTORY_NOTES.find((entry) => entry.id === id);
  return note ? localizeHistoryNote(note) : undefined;
}
