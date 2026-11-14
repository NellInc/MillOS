/**
 * Mill Chronicle quiz pool: two questions per history note. Every correct
 * answer is stated in its note's article, so a player who has read the note
 * can answer it. See docs/CHRONICLE.md, section 14.
 *
 * Questions from the player's own record come first (D19): what followed a
 * ruling they made, what a plan they installed changed, why a trial failed.
 * They are built at display from saved ids, so no copy is saved and both
 * languages read the same record. Every question's options are dealt in a
 * seeded order, and only a first attempt earns (engine `answerQuizQuestion`).
 */
import type { ImprovementDefinition, QuizQuestion, TrialDefinition, TrialProgress } from './types';
import type { ChronicleState } from './engine';
import { formatFixed, formatGrouped, translate } from '../i18n';
import { quizMessages, quizRecordMessages } from './quiz.messages';
import { chronicleStream } from './rng';
import { EVENT_DECK, getEventDeck } from './eventDeck';
import { getImprovements } from './plans';
import { getTrials, GRADE_POINTS } from './trials';
import { ENERGY_SCALE } from './measuredPlant';
import { trialsFor } from './schedule';
import { getForecasts } from './forecasts';
import { getCropYears } from './cropYears';
import { localizedDescribeModifier } from './describe';
import { legacyResults } from './legacyWording';

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // history-first-grain
  {
    id: 'q-first-grain-1',
    noteId: 'history-first-grain',
    prompt:
      'Which two cereals did farmers in the Nile valley grow for bread and beer before Egypt had kings?',
    options: ['Rye and oats', 'Emmer and barley', 'Spelt and millet', 'Maize and rice'],
    correctIndex: 1,
  },
  {
    id: 'q-first-grain-2',
    noteId: 'history-first-grain',
    prompt: 'How was grain ground on a saddle quern?',
    options: [
      'Between two round stones turned by a donkey',
      'By a water wheel beneath the floor',
      'In a tall wooden mortar with a pestle',
      'By rubbing a handstone back and forth over a flat lower stone',
    ],
    correctIndex: 3,
  },
  // history-grinding-statues
  {
    id: 'q-grinding-statues-1',
    noteId: 'history-grinding-statues',
    prompt: 'What is the Metropolitan Museum’s figure Servant Grinding Grain made of?',
    options: ['Painted limestone', 'Cedar wood', 'Bronze', 'Glazed faience'],
    correctIndex: 0,
  },
  {
    id: 'q-grinding-statues-2',
    noteId: 'history-grinding-statues',
    prompt: 'Why were servant figures placed in Old Kingdom tombs?',
    options: [
      'To guard the tomb against robbers',
      'To record the names of the tomb builders',
      'To take care of food production for the dead in the hereafter',
      'To mark the boundary of the owner’s estate',
    ],
    correctIndex: 2,
  },
  // history-old-kingdom-bakeries
  {
    id: 'q-old-kingdom-bakeries-1',
    noteId: 'history-old-kingdom-bakeries',
    prompt: 'What does the Arabic name Heit el-Ghurab mean?',
    options: ['City of Bread', 'House of the Miller', 'Wall of the Crow', 'Gate of the Sphinx'],
    correctIndex: 2,
  },
  {
    id: 'q-old-kingdom-bakeries-2',
    noteId: 'history-old-kingdom-bakeries',
    prompt: 'At the Giza workers’ settlement, what were bedja?',
    options: [
      'Conical pottery moulds for baking bread',
      'Overseers of the bakery workers',
      'Stone querns for grinding emmer',
      'Reed baskets for carrying grain',
    ],
    correctIndex: 0,
  },
  // history-nilometer
  {
    id: 'q-nilometer-1',
    noteId: 'history-nilometer',
    prompt: 'Besides forecasting the harvest, what was the height of the Nile flood used to set?',
    options: [
      'The date of the new year',
      'The tax farmers would owe',
      'The price of papyrus',
      'The size of the army',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-nilometer-2',
    noteId: 'history-nilometer',
    prompt: 'Why was the nilometer on Elephantine island especially important?',
    options: [
      'It was the only nilometer built of stone',
      'It stood beside the royal palace',
      'It measured the tides of the Mediterranean',
      'Elephantine marked the southern border, so the rising flood could be measured there first',
    ],
    correctIndex: 3,
  },
  // history-nomarchs
  {
    id: 'q-nomarchs-1',
    noteId: 'history-nomarchs',
    prompt: 'In ancient Egypt, what was a nome?',
    options: [
      'A royal tax collector',
      'A province',
      'A unit for measuring grain',
      'A temple granary',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-nomarchs-2',
    noteId: 'history-nomarchs',
    prompt: 'What happened to provincial governorships toward the end of the Old Kingdom?',
    options: [
      'They were abolished by Pepi II',
      'They were given to foreign mercenaries',
      'They became hereditary',
      'They were sold each year at auction',
    ],
    correctIndex: 2,
  },
  // history-domesday-mills
  {
    id: 'q-domesday-mills-1',
    noteId: 'history-domesday-mills',
    prompt: 'In what year was the Domesday survey completed?',
    options: ['1086', '1066', '1166', '1215'],
    correctIndex: 0,
  },
  {
    id: 'q-domesday-mills-2',
    noteId: 'history-domesday-mills',
    prompt: 'What powered almost all of the mills recorded in Domesday Book?',
    options: ['Wind', 'Steam', 'Water', 'Human treadmills'],
    correctIndex: 2,
  },
  // history-watermills
  {
    id: 'q-watermills-1',
    noteId: 'history-watermills',
    prompt: 'How many water wheels drove the Roman mill complex at Barbegal, near Arles?',
    options: ['Four', 'Eight', 'Twelve', 'Sixteen'],
    correctIndex: 3,
  },
  {
    id: 'q-watermills-2',
    noteId: 'history-watermills',
    prompt: 'In Vitruvius’s water mill, how did the wheel’s power reach the millstone?',
    options: [
      'Through a leather belt and pulley',
      'Through a toothed drum-wheel meshing with a larger horizontal toothed wheel',
      'Through a chain of buckets',
      'The millstone was fixed directly to the wheel',
    ],
    correctIndex: 1,
  },
  // history-windmills
  {
    id: 'q-windmills-1',
    noteId: 'history-windmills',
    prompt: 'What does a post mill balance its whole body on?',
    options: [
      'A stone tower',
      'A floating raft',
      'A single great upright post',
      'Four iron wheels on a track',
    ],
    correctIndex: 2,
  },
  {
    id: 'q-windmills-2',
    noteId: 'history-windmills',
    prompt: 'How did the miller turn a post mill to face the wind?',
    options: [
      'By pushing on a long tailpole',
      'With a team of oxen',
      'With a small steam engine',
      'It never moved; only the sails turned',
    ],
    correctIndex: 0,
  },
  // history-millwrights
  {
    id: 'q-millwrights-1',
    noteId: 'history-millwrights',
    prompt: 'Which canal, opened in 1761, made James Brindley’s name?',
    options: [
      'The Grand Union Canal',
      'The Bridgewater Canal',
      'The Caledonian Canal',
      'The Kennet and Avon Canal',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-millwrights-2',
    noteId: 'history-millwrights',
    prompt:
      'What title did John Smeaton adopt to set civilian consultants apart from military engineers?',
    options: ['Master millwright', 'Mechanical philosopher', 'Surveyor general', 'Civil engineer'],
    correctIndex: 3,
  },
  // history-oliver-evans
  {
    id: 'q-oliver-evans-1',
    noteId: 'history-oliver-evans',
    prompt: 'What did Oliver Evans’s hopper boy do?',
    options: [
      'Weighed sacks at the mill door',
      'Spread warm meal so it could cool and dry before sifting',
      'Lifted grain out of river barges',
      'Dressed the grooves of the millstones',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-oliver-evans-2',
    noteId: 'history-oliver-evans',
    prompt: 'What was the title of Oliver Evans’s 1795 book?',
    options: [
      'The Complete Miller',
      'The Art of Grinding',
      'The Young Mill-Wright and Miller’s Guide',
      'Principles of Mechanism',
    ],
    correctIndex: 2,
  },
  // history-albion-mills
  {
    id: 'q-albion-mills-1',
    noteId: 'history-albion-mills',
    prompt: 'What drove the millstones of the Albion Mills in London?',
    options: [
      'Boulton and Watt steam engines',
      'A tidal wheel on the Thames',
      'Windmill sails on the roof',
      'Horses walking a treadmill',
    ],
    correctIndex: 0,
  },
  {
    id: 'q-albion-mills-2',
    noteId: 'history-albion-mills',
    prompt: 'In what year did fire gut the Albion Mills?',
    options: ['1786', '1791', '1809', '1815'],
    correctIndex: 1,
  },
  // history-roller-milling
  {
    id: 'q-roller-milling-1',
    noteId: 'history-roller-milling',
    prompt: 'In which city did Hungarian high milling and the Ganz rollers make their name?',
    options: ['Vienna', 'Budapest', 'Prague', 'Minneapolis'],
    correctIndex: 1,
  },
  {
    id: 'q-roller-milling-2',
    noteId: 'history-roller-milling',
    prompt: 'What did the Ganz works make its rolls from, in place of Wegmann’s porcelain?',
    options: ['Granite', 'Hardwood', 'Chilled cast iron', 'Glass'],
    correctIndex: 2,
  },
  // history-plansifter
  {
    id: 'q-plansifter-1',
    noteId: 'history-plansifter',
    prompt: 'Which Budapest miller patented the plansifter?',
    options: ['Carl Haggenmacher', 'András Mechwart', 'Friedrich Wegmann', 'Oliver Evans'],
    correctIndex: 0,
  },
  {
    id: 'q-plansifter-2',
    noteId: 'history-plansifter',
    prompt: 'How does a plansifter move its stack of flat sieves?',
    options: [
      'It rotates them like a drum',
      'It shakes them straight up and down',
      'It tilts them down a slope',
      'It moves them in a horizontal plane',
    ],
    correctIndex: 3,
  },
  // history-washburn-a
  {
    id: 'q-washburn-a-1',
    noteId: 'history-washburn-a',
    prompt: 'What exploded inside the Washburn A Mill on 2 May 1878?',
    options: ['A steam boiler', 'Gas lighting', 'Stored gunpowder', 'Flour dust'],
    correctIndex: 3,
  },
  {
    id: 'q-washburn-a-2',
    noteId: 'history-washburn-a',
    prompt: 'Which devices spread to other mills after the Washburn A disaster?',
    options: ['Sprinkler systems', 'Lightning rods', 'Dust collectors', 'Fire escapes'],
    correctIndex: 2,
  },
  // history-grain-elevator
  {
    id: 'q-grain-elevator-1',
    noteId: 'history-grain-elevator',
    prompt:
      'In which city did Joseph Dart and Robert Dunbar build their steam-powered grain elevator?',
    options: ['Chicago', 'Buffalo', 'Montreal', 'New York City'],
    correctIndex: 1,
  },
  {
    id: 'q-grain-elevator-2',
    noteId: 'history-grain-elevator',
    prompt: 'What was the elevator’s marine leg?',
    options: [
      'A bucket conveyor lowered into a ship’s hold to lift out loose grain',
      'A pier for rolling barrels ashore',
      'A crane for lifting sacks',
      'A floating storage barge',
    ],
    correctIndex: 0,
  },
  // history-falling-number
  {
    id: 'q-falling-number-1',
    noteId: 'history-falling-number',
    prompt: 'What does a low falling number warn of?',
    options: ['Too little protein', 'Insect damage', 'Excess bran', 'Sprout damage'],
    correctIndex: 3,
  },
  {
    id: 'q-falling-number-2',
    noteId: 'history-falling-number',
    prompt: 'Which starch-degrading enzyme does sprouting grain produce in large amounts?',
    options: ['Alpha-amylase', 'Lipase', 'Catalase', 'Pepsin'],
    correctIndex: 0,
  },
  // history-grain-moisture
  {
    id: 'q-grain-moisture-1',
    noteId: 'history-grain-moisture',
    prompt: 'What does conditioning, or tempering, do to wheat before milling?',
    options: [
      'Dries it so it cannot go mouldy',
      'Toughens the bran and softens the endosperm',
      'Bleaches the flour white',
      'Kills weevils with heat',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-grain-moisture-2',
    noteId: 'history-grain-moisture',
    prompt: 'What does wheat stored too damp risk?',
    options: [
      'Rusting the silo',
      'Freezing solid',
      'Heating, mould and mites',
      'Losing its colour to sunlight',
    ],
    correctIndex: 2,
  },
  // history-grain-drying
  {
    id: 'q-grain-drying-1',
    noteId: 'history-grain-drying',
    prompt: 'Why did the combine harvester make mechanical grain drying necessary?',
    options: [
      'It wets the grain as it cuts',
      'It reaps and threshes in one pass, leaving no time for grain to dry in the field',
      'It can only work in the rain',
      'It harvests unripe grain on purpose',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-grain-drying-2',
    noteId: 'history-grain-drying',
    prompt: 'Before combines, what were stooks?',
    options: [
      'Grain bins on a farm',
      'Wooden threshing floors',
      'Coal-fired drying kilns',
      'Sheaves stood together to dry in the field',
    ],
    correctIndex: 3,
  },
  // history-wet-harvest-1879
  {
    id: 'q-wet-harvest-1879-1',
    noteId: 'history-wet-harvest-1879',
    prompt: 'Why did grain prices stay low despite the ruined British harvest of 1879?',
    options: [
      'The government fixed them by law',
      'Cheap American wheat, carried by steamship, filled the gap',
      'People stopped eating bread',
      'Stored grain from earlier years was released',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-wet-harvest-1879-2',
    noteId: 'history-wet-harvest-1879',
    prompt: 'How is the great depression of British agriculture usually dated?',
    options: ['1815 to 1846', '1846 to 1860', '1873 to 1896', '1914 to 1918'],
    correctIndex: 2,
  },
  // history-assize-of-bread
  {
    id: 'q-assize-of-bread-1',
    noteId: 'history-assize-of-bread',
    prompt:
      'Under the Assize of Bread and Ale, what happened to a farthing loaf when wheat grew dearer?',
    options: [
      'Its price rose',
      'It grew lighter',
      'It had to be made with barley',
      'It was banned from sale',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-assize-of-bread-2',
    noteId: 'history-assize-of-bread',
    prompt: 'Which phrase probably comes from bakers guarding against selling a light loaf?',
    options: ['Upper crust', 'Bread and butter', 'Breadwinner', 'A baker’s dozen'],
    correctIndex: 3,
  },
  // history-sale-of-food-act
  {
    id: 'q-sale-of-food-act-1',
    noteId: 'history-sale-of-food-act',
    prompt: 'Why did Victorian bakers add alum to bread?',
    options: [
      'To make it rise faster',
      'To make it look whiter',
      'To stop it going stale',
      'To sweeten it',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-sale-of-food-act-2',
    noteId: 'history-sale-of-food-act',
    prompt:
      'Under the Sale of Food and Drugs Act 1875, who examined the samples inspectors obtained?',
    options: [
      'Analysts appointed by local authorities',
      'Local magistrates',
      'Members of Parliament',
      'The bakers’ guild',
    ],
    correctIndex: 0,
  },
  // history-chorleywood
  {
    id: 'q-chorleywood-1',
    noteId: 'history-chorleywood',
    prompt: 'What replaced hours of fermentation in the Chorleywood bread process?',
    options: [
      'Freezing the dough overnight',
      'Baking at a much higher temperature',
      'A few minutes of intense, high-speed mechanical mixing',
      'A sourdough starter',
    ],
    correctIndex: 2,
  },
  {
    id: 'q-chorleywood-2',
    noteId: 'history-chorleywood',
    prompt: 'Which wheat did the Chorleywood process let millers use more of?',
    options: [
      'Lower-protein, home-grown British wheat',
      'Durum wheat from Italy',
      'Emmer wheat',
      'Only imported Canadian hard wheat',
    ],
    correctIndex: 0,
  },
  // history-bread-rationing
  {
    id: 'q-bread-rationing-1',
    noteId: 'history-bread-rationing',
    prompt: 'Was bread rationed in Britain during the Second World War?',
    options: [
      'Yes, from 1940',
      'Only in London',
      'Only for children',
      'No; it was rationed only after the war',
    ],
    correctIndex: 3,
  },
  {
    id: 'q-bread-rationing-2',
    noteId: 'history-bread-rationing',
    prompt: 'In which year did bread rationing begin in Britain?',
    options: ['1939', '1940', '1946', '1948'],
    correctIndex: 2,
  },
  // history-three-day-week
  {
    id: 'q-three-day-week-1',
    noteId: 'history-three-day-week',
    prompt:
      'From 1 January 1974, commercial users were limited to how many consecutive days of electricity a week?',
    options: ['Two', 'Three', 'Four', 'Five'],
    correctIndex: 1,
  },
  {
    id: 'q-three-day-week-2',
    noteId: 'history-three-day-week',
    prompt: 'What restricted coal supplies to Britain’s power stations in 1973 and 1974?',
    options: [
      'A ban on coal imports',
      'Flooding in the coalfields',
      'A fire at a national grid control centre',
      'Industrial action by coal miners and railway workers',
    ],
    correctIndex: 3,
  },
  // history-tide-mills
  {
    id: 'q-tide-mills-1',
    noteId: 'history-tide-mills',
    prompt: 'When does a tide mill grind?',
    options: [
      'As the tide comes in',
      'Only at high water',
      'When the tide outside is low enough to release the stored water through the wheel',
      'Only during storms',
    ],
    correctIndex: 2,
  },
  {
    id: 'q-tide-mills-2',
    noteId: 'history-tide-mills',
    prompt: 'What happened to Woodbridge Tide Mill in 1957?',
    options: [
      'It was first built',
      'It closed as the last commercially operating tide mill in Britain',
      'It burned down',
      'It was converted to steam power',
    ],
    correctIndex: 1,
  },
  // history-rochdale
  {
    id: 'q-rochdale-1',
    noteId: 'history-rochdale',
    prompt: 'On which Rochdale street did the Pioneers open their shop in December 1844?',
    options: ['Toad Lane', 'Market Street', 'Mill Row', 'Church Street'],
    correctIndex: 0,
  },
  {
    id: 'q-rochdale-2',
    noteId: 'history-rochdale',
    prompt: 'How did the Rochdale Pioneers return surplus to their members?',
    options: [
      'In equal shares to every member',
      'To the founders only',
      'As a dividend in proportion to what each member had bought',
      'By lowering the price of shares',
    ],
    correctIndex: 2,
  },
  // history-mondragon
  {
    id: 'q-mondragon-1',
    noteId: 'history-mondragon',
    prompt:
      'What was the name of the company whose foundation stone was blessed in Mondragón in 1956?',
    options: ['Eroski', 'Ulgor', 'Orona', 'Irizar'],
    correctIndex: 1,
  },
  {
    id: 'q-mondragon-2',
    noteId: 'history-mondragon',
    prompt: 'What did José María Arizmendiarrieta help found in 1959?',
    options: [
      'A university in Madrid',
      'A national newspaper',
      'A trade union federation',
      'A co-operative bank, Caja Laboral Popular',
    ],
    correctIndex: 3,
  },
  // history-mill-electrification
  {
    id: 'q-mill-electrification-1',
    noteId: 'history-mill-electrification',
    prompt: 'What did a line shaft do in a mill?',
    options: [
      'Carried grain between floors',
      'Carried power from one engine to every machine through belts and pulleys',
      'Drained water from the wheel pit',
      'Held up the mill roof',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-mill-electrification-2',
    noteId: 'history-mill-electrification',
    prompt: 'In early electrification, what did a single large electric motor often do?',
    options: [
      'Lit the mill at night',
      'Drove only the sifters',
      'Charged storage batteries',
      'Replaced the engine and still turned the old line shafts',
    ],
    correctIndex: 3,
  },
  // history-scada
  {
    id: 'q-scada-1',
    noteId: 'history-scada',
    prompt: 'What does SCADA stand for?',
    options: [
      'Supervisory control and data acquisition',
      'System control and data analysis',
      'Safety control and dust alarm',
      'Supervised computer automated dispatch',
    ],
    correctIndex: 0,
  },
  {
    id: 'q-scada-2',
    noteId: 'history-scada',
    prompt: 'In early SCADA systems, where did direct control of the process stay?',
    options: [
      'In the central control room',
      'With local devices such as remote terminal units',
      'With the electricity supplier',
      'With a single plant manager',
    ],
    correctIndex: 1,
  },
  // history-flour-sacks
  {
    id: 'q-flour-sacks-1',
    noteId: 'history-flour-sacks',
    prompt: 'Why did American bag makers print cotton sacks with colourful patterns?',
    options: [
      'To show the flour’s grade',
      'To meet a government labelling rule',
      'To hide stains from the flour',
      'So families would want to sew them into clothes, and choose that product',
    ],
    correctIndex: 3,
  },
  {
    id: 'q-flour-sacks-2',
    noteId: 'history-flour-sacks',
    prompt: 'What replaced cloth sacks after the Second World War?',
    options: ['Plastic tubs', 'Wooden barrels', 'Paper sacks', 'Tin cans'],
    correctIndex: 2,
  },
  // history-ergot
  {
    id: 'q-ergot-1',
    noteId: 'history-ergot',
    prompt: 'Eating which grain is most associated with epidemics of ergotism in medieval Europe?',
    options: ['Rice', 'Rye', 'Maize', 'Millet'],
    correctIndex: 1,
  },
  {
    id: 'q-ergot-2',
    noteId: 'history-ergot',
    prompt: 'What was the gangrenous form of ergotism called in the Middle Ages?',
    options: ['St Anthony’s fire', 'St Elmo’s fire', 'The sweating sickness', 'The king’s evil'],
    correctIndex: 0,
  },
  // history-corn-laws
  {
    id: 'q-corn-laws-1',
    noteId: 'history-corn-laws',
    prompt:
      'Under the Importation Act 1815, foreign corn was barred until domestic wheat reached what price?',
    options: [
      '40 shillings a quarter',
      '60 shillings a quarter',
      '80 shillings a quarter',
      '100 shillings a quarter',
    ],
    correctIndex: 2,
  },
  {
    id: 'q-corn-laws-2',
    noteId: 'history-corn-laws',
    prompt: 'Which prime minister carried the repeal of the Corn Laws in 1846?',
    options: ['William Pitt', 'Benjamin Disraeli', 'William Gladstone', 'Sir Robert Peel'],
    correctIndex: 3,
  },
  // history-long-view
  {
    id: 'q-long-view-1',
    noteId: 'history-long-view',
    prompt: 'In the closing essay, which tool begins the story of milling?',
    options: ['The saddle quern', 'The post mill', 'The roller mill', 'The water wheel'],
    correctIndex: 0,
  },
  {
    id: 'q-long-view-2',
    noteId: 'history-long-view',
    prompt: 'Which of these does the closing essay say has not changed?',
    options: [
      'Mills are owned by lords',
      'Grain must be kept dry and clean',
      'Millstones are the best way to grind',
      'Rivers are the only source of power',
    ],
    correctIndex: 1,
  },
  // history-ogas
  {
    id: 'q-ogas-1',
    noteId: 'history-ogas',
    prompt: 'Who proposed the Soviet nationwide planning network that became OGAS?',
    options: ['Stafford Beer', 'Viktor Glushkov', 'Martin Weitzman', 'Fernando Flores'],
    correctIndex: 1,
  },
  {
    id: 'q-ogas-2',
    noteId: 'history-ogas',
    prompt: 'What became of OGAS?',
    options: [
      'It was built in full and ran until 1991',
      'It was handed to the military and used for air defence',
      'It was scaled down, and each ministry built its own separate computer systems',
      'It was sold abroad to pay for grain imports',
    ],
    correctIndex: 2,
  },
  // history-cybersyn
  {
    id: 'q-cybersyn-1',
    noteId: 'history-cybersyn',
    prompt: 'How did Cybersyn’s network carry messages between enterprises and Santiago?',
    options: ['By radio', 'By telex', 'By courier', 'By punched cards sent by post'],
    correctIndex: 1,
  },
  {
    id: 'q-cybersyn-2',
    noteId: 'history-cybersyn',
    prompt: 'When a factory’s figure went out of range, what happened first?',
    options: [
      'The president was told at once',
      'The factory was closed until it was inspected',
      'The enterprise had a set time to deal with it before the warning went higher',
      'Nothing, until the end of the month',
    ],
    correctIndex: 2,
  },
  // history-ratchet
  {
    id: 'q-ratchet-1',
    noteId: 'history-ratchet',
    prompt: 'Under planning "from the achieved level", how was next period’s target set?',
    options: [
      'By a vote of the workforce',
      'From world market prices',
      'From what had been achieved in the last period, plus an increment for growth',
      'From the factory’s original design capacity',
    ],
    correctIndex: 2,
  },
  {
    id: 'q-ratchet-2',
    noteId: 'history-ratchet',
    prompt: 'Which economist analysed the "ratchet principle" in 1980?',
    options: ['Martin Weitzman', 'Stafford Beer', 'Viktor Glushkov', 'Joseph Berliner'],
    correctIndex: 0,
  },
  // history-assembly
  {
    id: 'q-assembly-1',
    noteId: 'history-assembly',
    prompt:
      'Under the second co-operative principle, how do members of a primary co-operative vote?',
    options: [
      'In proportion to the capital each has put in',
      'One member, one vote',
      'Only elected representatives vote',
      'By length of membership',
    ],
    correctIndex: 1,
  },
  {
    id: 'q-assembly-2',
    noteId: 'history-assembly',
    prompt: 'Why are a co-operative’s indivisible reserves not shared out among its members?',
    options: [
      'They are owed to the government as tax',
      'They belong to the bank that lent them',
      'They were built by many generations of members and belong to the co-operative as a whole',
      'They are paid to the founders’ heirs',
    ],
    correctIndex: 2,
  },
];

/** Localized questions with canonical order and answer indices. */
export function getQuizQuestions(): QuizQuestion[] {
  return QUIZ_QUESTIONS.map((question) => {
    const messages = quizMessages(question);
    return {
      ...question,
      prompt: translate(messages, 'prompt'),
      options: [
        translate(messages, 'option0'),
        translate(messages, 'option1'),
        translate(messages, 'option2'),
        translate(messages, 'option3'),
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Questions from the record (D19)
// ---------------------------------------------------------------------------

/** A question as the Notes tab deals it: from a note or from the record. */
export interface ShownQuizQuestion {
  id: string;
  /** The history note it tests, or null for a record question. */
  noteId: string | null;
  prompt: string;
  options: string[];
  correctIndex: number;
}

const recordCopy = (
  key: keyof typeof quizRecordMessages.en,
  params?: Record<string, string | number>
): string => translate(quizRecordMessages, key, params);

/** A question built from options with the right one first; the deal shuffles it. */
function recordQuestion(
  id: string,
  prompt: string,
  right: string,
  wrong: string[]
): ShownQuizQuestion | null {
  const options = [right, ...wrong.filter((option) => option && option !== right)];
  return right && options.length >= 2
    ? { id, noteId: null, prompt, options, correctIndex: 0 }
    : null;
}

/** What a plan changes, in the words its plan card uses. */
function planChange(plan: ImprovementDefinition): string {
  const parts = localizedDescribeModifier(plan.effect);
  for (const [kind, relief] of Object.entries(plan.forecastRelief ?? {}))
    parts.push(
      recordCopy('planForecast', {
        forecast: getForecasts()[kind as keyof ReturnType<typeof getForecasts>].title,
        relief: formatGrouped(Math.round((relief ?? 0) * 100)),
      })
    );
  for (const kind of plan.cropRelief ?? []) {
    const crop = getCropYears()[kind];
    parts.push(
      crop.treatedPenalty > 0
        ? recordCopy('planCropPartial', {
            crop: crop.label.toLowerCase(),
            value: formatGrouped(crop.treatedPenalty),
          })
        : recordCopy('planCropNone', { crop: crop.label.toLowerCase() })
    );
  }
  if (plan.knowHowPerShift)
    parts.push(recordCopy('planKnowHow', { value: formatGrouped(plan.knowHowPerShift) }));
  return parts.join(', ');
}

type TrialCause = 'trialQuality' | 'trialTonnage' | 'trialEnergy' | 'trialGrade';
const TRIAL_CAUSES: TrialCause[] = ['trialQuality', 'trialTonnage', 'trialEnergy', 'trialGrade'];

/** Why a dispatch trial failed, read from its progress against its goal, never its text. */
function trialCauses(definition: TrialDefinition, progress: TrialProgress): TrialCause[] {
  const goal = definition.goal;
  if (goal.kind !== 'dispatch') return [];
  const causes: TrialCause[] = [];
  if (goal.noQualityFailure && progress.qualityFailureKg > 0) causes.push('trialQuality');
  if (Math.round(progress.dispatchedKg) < goal.kg) causes.push('trialTonnage');
  if (
    goal.maxEnergyPerKg !== undefined &&
    progress.dispatchedKg > 0 &&
    Math.round((progress.energyCost / progress.dispatchedKg) * ENERGY_SCALE) / ENERGY_SCALE >
      goal.maxEnergyPerKg
  )
    causes.push('trialEnergy');
  const graded = progress.gradedShifts ?? progress.shiftsUsed;
  if (
    goal.minAverageGrade !== undefined &&
    graded > 0 &&
    progress.gradePoints / graded < GRADE_POINTS[goal.minAverageGrade]
  )
    causes.push('trialGrade');
  return causes;
}

type EventChoice = (typeof EVENT_DECK)[number]['choices'][number];

/**
 * A choice whose effect depends on the record (variants) or hands cases on
 * (resolveChain, delegates) has no single answer to "what followed".
 */
const plainChoice = (choice: EventChoice): boolean =>
  !choice.variants?.length && !choice.effect.resolveChain?.length && !choice.delegates;

/**
 * Questions about the player's own record, in the language shown now. Ids carry
 * the charter seed, so a later charter's record never shares a first attempt.
 */
export function recordQuizQuestions(state: ChronicleState): ShownQuizQuestion[] {
  if (state.status === 'unsigned' || !state.charter) return [];
  const seed = state.charter.seed;
  const questions: ShownQuizQuestion[] = [];
  const add = (question: ShownQuizQuestion | null) => {
    if (question && !questions.some((q) => q.id === question.id)) questions.push(question);
  };

  // What followed a ruling the player made (not the partner's, not a lapse).
  const deck = getEventDeck();
  for (const record of state.eventHistory) {
    if (record.actor !== 'player') continue;
    const canonical = EVENT_DECK.find((event) => event.id === record.eventId);
    const event = deck.find((candidate) => candidate.id === record.eventId);
    const chosen = canonical?.choices.find((choice) => choice.id === record.choiceId);
    if (!canonical || !event || !chosen || !plainChoice(chosen)) continue;
    const shown = (id: string) => event.choices.find((choice) => choice.id === id);
    // An answer whose effect changed is graded on what its save records it
    // did (review 2, finding 5); with no notice to say which, it is not asked.
    let right = shown(chosen.id)?.effect.result ?? '';
    const legacy = legacyResults(record.eventId, chosen.id);
    if (legacy.length) {
      const saved = state.notices.find(
        (notice) =>
          notice.shift === record.shift && notice.title === `${canonical.title}: ${chosen.label}`
      );
      const old = saved && legacy.find((entry) => saved.body.startsWith(entry.raw));
      if (old) right = old.local;
      else if (!saved?.body.startsWith(chosen.effect.result)) continue;
    }
    add(
      recordQuestion(
        `r:${seed}:event:${record.eventId}:${record.shift}`,
        recordCopy('eventPrompt', {
          shift: formatFixed(record.shift, 0),
          event: event.title,
          choice: shown(chosen.id)?.label ?? '',
        }),
        right,
        canonical.choices
          .filter((choice) => choice.id !== chosen.id && plainChoice(choice))
          .map((choice) => shown(choice.id)?.effect.result ?? '')
      )
    );
  }

  // What a plan the player installed changed.
  const plans = getImprovements();
  for (const progress of state.improvements) {
    if (progress.phase !== 'installed' || progress.initiatedBy !== 'player') continue;
    const plan = plans.find((candidate) => candidate.id === progress.id);
    if (!plan) continue;
    const right = planChange(plan);
    const draw = chronicleStream(seed, `quiz-plan:${plan.id}`, 0);
    const wrong = [
      ...new Set(
        plans
          .filter((other) => other.id !== plan.id)
          .map((other) => ({ text: planChange(other), key: draw() }))
          .sort((a, b) => a.key - b.key)
          .map((entry) => entry.text)
          .filter((text) => text && text !== right)
      ),
    ].slice(0, 3);
    add(
      recordQuestion(
        `r:${seed}:plan:${plan.id}`,
        recordCopy('planPrompt', { plan: plan.label }),
        right,
        wrong
      )
    );
  }

  // Why a trial failed, when its progress says why, read against this
  // charter's own trials: a short chronicle's goals are not the full one's.
  const trials = getTrials(trialsFor(state.charter));
  for (const progress of state.trials) {
    if (progress.phase !== 'failed') continue;
    const trial = trials.find((candidate) => candidate.id === progress.id);
    const causes = trial ? trialCauses(trial, progress) : [];
    if (!trial || causes.length === 0) continue;
    add(
      recordQuestion(
        `r:${seed}:trial:${trial.id}`,
        recordCopy('trialPrompt', { trial: trial.title }),
        recordCopy(causes[0]),
        TRIAL_CAUSES.filter((cause) => !causes.includes(cause)).map((cause) => recordCopy(cause))
      )
    );
  }
  return questions;
}

/** Every question the quiz can deal now: the record's, then the unlocked notes'. */
export function quizPool(state: ChronicleState): ShownQuizQuestion[] {
  return [
    ...recordQuizQuestions(state),
    ...getQuizQuestions()
      .filter((question) => state.unlockedNotes.includes(question.noteId))
      .map((question) => ({ ...question, options: [...question.options] })),
  ];
}

/**
 * The question with its options in a seeded order: stable for a seed, different
 * across seeds. The order permutes indices, so every language deals the same.
 */
export function presentQuizQuestion<
  Q extends { id: string; options: readonly string[]; correctIndex: number },
>(
  question: Q,
  seed: number
): Omit<Q, 'options' | 'correctIndex'> & {
  options: string[];
  correctIndex: number;
} {
  const draw = chronicleStream(seed, `quiz-options:${question.id}`, 0);
  const order = question.options
    .map((_, index) => ({ index, key: draw() }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.index);
  return {
    ...question,
    options: order.map((index) => question.options[index]),
    correctIndex: order.indexOf(question.correctIndex),
  };
}

/**
 * Up to ten question ids for a round: questions not yet attempted before those
 * that have been, and within each the record's before the notes', so the notes
 * fill a round the record is too thin for. The order within each is seeded by
 * the round and the attempts made so far, so a reload does not deal it again.
 */
export function dealQuizRound(state: ChronicleState, round: number, size = 10): string[] {
  const attempted = new Set([...state.quizAnswered, ...(state.quizAttempted ?? [])]);
  const next = chronicleStream(
    state.charter?.seed ?? 1,
    `quiz:${attempted.size}:${state.sequence}`,
    round
  );
  const rank = (question: ShownQuizQuestion) =>
    (attempted.has(question.id) ? 2 : 0) + (question.noteId === null ? 0 : 1);
  return quizPool(state)
    .map((question) => ({ question, rank: rank(question), key: next() }))
    .sort((a, b) => a.rank - b.rank || a.key - b.key)
    .slice(0, size)
    .map((entry) => entry.question.id);
}
