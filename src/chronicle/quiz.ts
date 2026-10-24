/**
 * Mill Chronicle quiz pool: two questions per history note. Every correct
 * answer is stated in its note's article, so a player who has read the note
 * can answer it. See docs/CHRONICLE.md, section 14.
 */
import type { QuizQuestion } from './types';

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
];
