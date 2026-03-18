// Shared utilities, types, contexts, hooks, and announcement data for game features

import { createContext, useContext, useEffect, useRef } from 'react';
import { Target, Trophy, Medal, Users, TrendingUp, Package, Shield, Award } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { WorkerGender, getPronouns } from '../../types';
import { audioManager } from '../../utils/audioManager';

// ============================================================================
// CAMERA FEED CONTEXT
// ============================================================================

export interface CameraFeedContextType {
  feedRefs: Map<string, React.RefObject<HTMLDivElement>>;
  registerFeedRef: (id: string, ref: React.RefObject<HTMLDivElement>) => void;
}

export const CameraFeedContext = createContext<CameraFeedContextType | null>(null);

export const useCameraFeedRefs = () => {
  const context = useContext(CameraFeedContext);
  return context;
};

// ============================================================================
// THEME HOSPITAL-STYLE PA ANNOUNCEMENT SYSTEM
// "If Theme Hospital ran a flour mill" - 150+ announcements with dry wit
// ============================================================================

type AnnouncementCategory =
  | 'general'
  | 'production'
  | 'safety'
  | 'humor'
  | 'chaos'
  | 'calm'
  | 'employee'
  | 'equipment'
  | 'breakroom'
  | 'meta';

interface AnnouncementConfig {
  message: string;
  type: 'general' | 'production' | 'safety' | 'emergency';
  category: AnnouncementCategory;
  chaosWeight: number; // 0-1, higher = more likely during chaos
}

// ==========================================================================
// THE COFFEE MACHINE SAGA - A recurring character in mill life
// ==========================================================================
const COFFEE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Attention all staff: The coffee machine is NOT a production machine. Please stop trying to increase its throughput.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.3,
  },
  {
    message: 'The coffee machine in the break room has been restocked. This is not a drill.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.2,
  },
  {
    message:
      "Would the person who labeled the coffee machine 'Mission Critical Equipment' please see H.R. You are not wrong, but still.",
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.3,
  },
  {
    message: 'Reminder: Coffee breaks are 15 minutes. Not 15 minutes per cup.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.4,
  },
  {
    message: 'The coffee machine has been upgraded. It now judges you silently while dispensing.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.2,
  },
  {
    message:
      'Someone has replaced the regular coffee with decaf. H.R. is treating this as a hostile workplace incident.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.5,
  },
  {
    message:
      'The coffee machine is not broken. It is resting. There is a difference. Please be patient.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.4,
  },
  {
    message:
      'Coffee consumption has exceeded projections by 340%. H.R. suggests this is fine. H.R. has also exceeded projections.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.6,
  },
  {
    message:
      'The emergency backup coffee machine has been deployed. We have reached that point in the day.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.7,
  },
  {
    message:
      'Would whoever is hoarding the good coffee mugs please return them. We know you have a collection. We have seen it.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// QUALITY CONTROL - The department that has seen too much
// ==========================================================================
const QUALITY_CONTROL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      "Quality Control would like to remind everyone that 'close enough' is not a recognized industry standard.",
    type: 'production',
    category: 'production',
    chaosWeight: 0.5,
  },
  {
    message:
      "Quality Control reports that 'it worked on my shift' is not acceptable documentation.",
    type: 'production',
    category: 'production',
    chaosWeight: 0.5,
  },
  {
    message:
      "The phrase 'good enough for government work' does not apply here. We have actual standards.",
    type: 'production',
    category: 'production',
    chaosWeight: 0.4,
  },
  {
    message:
      'Quality Control has found a sample that is, quote, "concerning." We will update you when they stop staring at it.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.6,
  },
  {
    message:
      "Quality Control would like to remind everyone that 'I eyeballed it' is not a measurement technique.",
    type: 'production',
    category: 'production',
    chaosWeight: 0.5,
  },
  {
    message:
      'The Quality Control team has requested more coffee. This is concerning for different reasons.',
    type: 'general',
    category: 'production',
    chaosWeight: 0.4,
  },
  {
    message:
      "Quality Control has approved today's batch. They have also approved going home early. One of these is a joke.",
    type: 'production',
    category: 'production',
    chaosWeight: 0.2,
  },
  {
    message:
      'A reminder that Quality Control can reject your batch. They can also reject your excuses. They prefer rejecting excuses.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.4,
  },
];

// ==========================================================================
// FORKLIFT CHRONICLES - Where heavy machinery meets dark humor
// ==========================================================================
const FORKLIFT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Would the owner of the forklift blocking Aisle 3 please move it. The grain will not move itself. Well, actually it will. That is what the conveyors are for.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.4,
  },
  {
    message:
      'Reminder: Forklifts are not racing vehicles. The checkered flag has been confiscated.',
    type: 'safety',
    category: 'equipment',
    chaosWeight: 0.6,
  },
  {
    message:
      'The forklift operators would like to remind pedestrians that they cannot stop instantly. Physics is not a suggestion.',
    type: 'safety',
    category: 'equipment',
    chaosWeight: 0.5,
  },
  {
    message:
      'Forklift Three has been named "Susan" by the night shift. Susan does not care. Susan has no feelings. Be like Susan.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.3,
  },
  {
    message:
      'The forklift horn means "I am here." Not "I am challenging you to a game of chicken."',
    type: 'safety',
    category: 'equipment',
    chaosWeight: 0.5,
  },
  {
    message:
      'Forklift operators are reminded that drifting is not an approved maneuver. It is also not possible. Please stop trying.',
    type: 'safety',
    category: 'equipment',
    chaosWeight: 0.4,
  },
  {
    message: 'The forklift leaderboard has been removed. You know why. We all know why.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.3,
  },
  {
    message:
      'A forklift and a pallet have gotten married in a beautiful ceremony in Zone 3. Please respect their space.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// THE NIGHT SHIFT VS DAY SHIFT - An eternal rivalry
// ==========================================================================
const SHIFT_RIVALRY_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Congratulations to the day shift for zero incidents this week. Night shift, we will talk.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.3,
  },
  {
    message:
      'Safety reminder: The floor is not a storage area. Neither is the conveyor. We are looking at you, night shift.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.5,
  },
  {
    message:
      'The day shift would like to thank the night shift for the mysterious sticky substance on Machine 4. Truly. Thank you.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.4,
  },
  {
    message:
      'Night shift has left a note claiming they "fixed" something. Day shift is investigating what was broken first.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.4,
  },
  {
    message:
      'The graffiti in the maintenance closet reading "Night Shift Rules" has been updated to "Night Shift Drools." This is not progress.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Day shift and night shift are reminded that this is a flour mill, not a battleground. The flour does not care who wins.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.3,
  },
  {
    message:
      'The night shift has achieved record productivity. The day shift has achieved record skepticism.',
    type: 'production',
    category: 'employee',
    chaosWeight: 0.3,
  },
  {
    message:
      'Shift handover logs must now include "what we actually did" and not just "see previous log."',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.4,
  },
];

// ==========================================================================
// MARCUS CHEN - Employee of the Month, 14 consecutive months
// ==========================================================================
const MARCUS_CHEN_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Marcus Chen has been Employee of the Month for 14 consecutive months. Other employees are encouraged to... try harder.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.2,
  },
  {
    message:
      'Marcus Chen has volunteered for overtime again. Marcus Chen may need to be checked for robot parts.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.3,
  },
  {
    message:
      'A reminder that Marcus Chen is a real person and not a management fabrication. We have documentation.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Marcus Chen has suggested we "give someone else a chance" at Employee of the Month. This is technically possible.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.2,
  },
  {
    message:
      'The Marcus Chen Fan Club will meet in the break room at 3 PM. Marcus Chen is not invited. He finds it weird.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// DAVE - The legendary employee referenced in all incidents
// ==========================================================================
const DAVE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The strange noise from Packer Line 2 has been identified. It was Dave. Dave has been relocated.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.4,
  },
  {
    message: 'Dave is no longer permitted in the silo area. Dave knows what he did.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.3,
  },
  {
    message:
      'For the last time: Dave is not the reason we have that policy. Dave is the reason we have seventeen policies.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message: 'Dave has been found. We did not know Dave was missing. This raises questions.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The incident report form has been renamed "The Dave Form" in Dave\'s honor. Dave is not honored.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Dave would like everyone to know he is fine. No one asked, but Dave wanted to clarify.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// MACHINE PERSONALITIES - They have names, they have feelings (they don't)
// ==========================================================================
const MACHINE_PERSONALITY_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      "Will whoever labeled Silo Delta as 'The Good One' please report to the supervisor's office. Immediately.",
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.3,
  },
  {
    message:
      "The sign on Roller Mill R.M. 103 reading 'Percussive Maintenance Zone' has been removed. Again.",
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.4,
  },
  {
    message:
      "Please stop naming the machines. They do not respond to 'Old Reliable' or 'The Beast'. They respond to proper maintenance.",
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.3,
  },
  {
    message:
      'Roller Mill R.M. 104 is making the noise again. The noise that sounds like disappointment. Please investigate.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.5,
  },
  {
    message:
      'Silo Alpha would like to remind everyone it has never had an incident. Silo Alpha is showing off.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Packer Line 3 has achieved consciousness. This is a joke. We think. Please observe Packer Line 3.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The plansifters are sifting plans. This is a pun. The plansifters do not appreciate puns. Or anything.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Conveyor Belt 7 would like to be called "The Highway." Management has denied this request. Again.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// THE BREAK ROOM - Where dreams go to take a 15-minute nap
// ==========================================================================
const BREAKROOM_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The vending machine in the break room has been restocked. Please form an orderly queue. We know who you are.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.2,
  },
  {
    message: 'The vending machine accepts exact change only. Hitting it does not count as payment.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.3,
  },
  {
    message:
      'The break room fridge will be cleaned on Friday. Anything not labeled will be considered a donation to science.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.2,
  },
  {
    message:
      'Would the owner of the mystery casserole in the fridge please claim it. It has started claiming territory.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.3,
  },
  {
    message:
      'The microwave has a new sign: "Please cover your food." The old sign is being treated for trauma.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.3,
  },
  {
    message:
      'Someone has labeled their lunch "DO NOT EAT" which H.R. interprets as a challenge. H.R. has been spoken to.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The break room TV has been permanently set to the weather channel. Democracy has failed us.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.2,
  },
  {
    message:
      'The thermostat in the break room has been set to 72 degrees. It will stay at 72 degrees. The war is over. The thermostat won.',
    type: 'general',
    category: 'breakroom',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// MEETINGS AND ADMINISTRATION - The true horror
// ==========================================================================
const ADMIN_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The 3 PM safety meeting has been moved to 3:15 PM. The 3:15 PM meeting has been canceled. The irony is not lost on us.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      "This week's suggestion box winner: 'Install a second coffee machine.' Management is considering it. Again. Still.",
    type: 'general',
    category: 'general',
    chaosWeight: 0.2,
  },
  {
    message:
      'The mandatory fun committee meeting is now mandatory. Attendance will be taken. Smiling is optional but noted.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.2,
  },
  {
    message:
      'H.R. would like to remind everyone that the anonymous suggestion box is not, in fact, anonymous. Please choose your words carefully.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The new employee handbook is now available. It is longer than the old one. We have learned from experience.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'Performance reviews are next week. Please remember your achievements. Management will remember everything else.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.4,
  },
  {
    message: 'The meeting about reducing meetings has been scheduled. It will be a long one.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'A new policy has been implemented. Please read the policy about reading new policies for details.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// SAFETY WITH ATTITUDE - Because someone has to say it
// ==========================================================================
const SAFETY_HUMOR_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Reminder: Safety goggles are mandatory. Looking cool is optional but highly encouraged.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
  {
    message:
      'The mill will be operating at maximum capacity today. Earplugs are available. Patience is not.',
    type: 'production',
    category: 'safety',
    chaosWeight: 0.7,
  },
  {
    message:
      "Today's safety tip: If something looks unsafe, it probably is. If it looks fine, check again. Then check a third time.",
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.4,
  },
  {
    message:
      'The safety video has been updated. The acting has not improved. The information remains accurate.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
  {
    message:
      'A reminder that "I have been doing this for years" is not a substitute for safety training. It is, however, an explanation for many incidents.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.4,
  },
  {
    message:
      "Safety is everyone's responsibility. Blame is also everyone's responsibility. Please accept both.",
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The safety incentive program continues. 30 days without incident earns a pizza party. We are on day 2.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
  {
    message:
      'Please report all near-misses. Yes, even that one. Especially that one. You know which one.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.4,
  },
  {
    message:
      'The "Days Without Incident" sign has been replaced with a digital display. It was getting expensive to keep replacing the numbers.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.5,
  },
];

// ==========================================================================
// MAINTENANCE LEGENDS - Heroes in dusty overalls
// ==========================================================================
const MAINTENANCE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Maintenance crew to Roller Mill R.M. 103. Bring your optimism. Leave your skepticism.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.5,
  },
  {
    message:
      'Scheduled maintenance on Silo Epsilon. It will be back. Stronger. Hopefully. We make no promises.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.4,
  },
  {
    message:
      'Preventive maintenance complete on Packer Line 1. Future problems have been prevented. Theoretically. Statistically. Hopefully.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.3,
  },
  {
    message:
      'Conveyor belt 7 has been adjusted. It no longer makes that noise. It now makes a different, slightly worse noise.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.4,
  },
  {
    message:
      'Maintenance would like to announce that they have fixed the issue. They would also like you to stop asking what the issue was. It is classified. By them. Just now.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.5,
  },
  {
    message:
      'The maintenance closet is not a nap room. The maintenance team is not fooled. They have cameras. Metaphorical cameras.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Maintenance has requested a larger budget. In related news, Machine 5 has requested a retirement party.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'The duct tape solution on conveyor 3 has been replaced with a proper repair. A moment of silence for the duct tape.',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.3,
  },
  {
    message:
      'Please return borrowed tools to the maintenance closet. Borrowed. Not adopted. Not given a good home. Not "I forgot I had it."',
    type: 'general',
    category: 'equipment',
    chaosWeight: 0.4,
  },
];

// ==========================================================================
// TECHNOLOGY STRUGGLES - The printer has won
// ==========================================================================
const TECHNOLOGY_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The employee who suggested we "just turn it off and on again" has been promoted to IT consultant. Reluctantly.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'IT would like to remind everyone that restarting your terminal fixes 90% of problems. The other 10% require coffee. And IT. Mostly coffee.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message: 'The printer is working. If you believe that, you have not used the printer.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Password reset requests are at an all-time high. The password requirements are not that complicated. Your passwords are that forgettable.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The new software update is live. It fixes several bugs and introduces several new, more interesting bugs.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.4,
  },
  {
    message:
      'A reminder that your password should not be "password" or "123456" or "letmein" or your name. We have checked. We are disappointed.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The network is slow because everyone is using it. This is how networks work. Please be patient with the laws of physics.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// PHILOSOPHICAL OBSERVATIONS - Deep thoughts from the control room
// ==========================================================================
const PHILOSOPHICAL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Remember: Every bag of flour was once a field of wheat that believed in its dreams. Make those dreams count.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.1,
  },
  {
    message:
      'In the time it took to read this announcement, we produced 47 bags of flour. You are welcome. The flour is welcome.',
    type: 'production',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Fun fact: The average flour particle travels 2.3 kilometers through our facility. It does not enjoy the journey. It does not enjoy anything. It is flour.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'If a conveyor belt moves flour and no one is around to see it, did the flour really move? Yes. Yes it did. We have sensors.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Today we are all just flour, moving through the great mill of life. This has been your daily existential crisis.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.1,
  },
  {
    message:
      'The universe is vast and uncaring. But our efficiency rating is 97.3%. So we have that.',
    type: 'production',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Is flour conscious? No. Is this mill conscious? Also no. Are you conscious? That is between you and H.R.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.1,
  },
];

// ==========================================================================
// PASSIVE AGGRESSIVE CLASSICS - H.R.-approved shade
// ==========================================================================
const PASSIVE_AGGRESSIVE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'A reminder that clocking in for your colleague is not teamwork. It is fraud. Creative fraud, but still fraud. Impressive fraud, even. Still fraud.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'The parking lot is not a go-kart track. This message is for one person. They know who they are. Everyone knows who they are.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
  {
    message:
      'Whoever keeps adjusting the thermostat: we see you. The security camera sees you. The thermostat sees you. Please stop.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'The sign in the bathroom reading "Wash Your Hands" is there for a reason. The reason is some of you.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'A gentle reminder that deadlines are called deadlines because they are dead. They do not move. Unlike some of you.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.4,
  },
  {
    message:
      'If you see something, say something. If you did something, also say something. We prefer honesty to detective work.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.4,
  },
  {
    message:
      'The person who keeps leaving passive-aggressive notes in the break room is asked to speak with H.R. They are also asked to bring the notes. H.R. collects them.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// LOST AND FOUND - A museum of questionable items
// ==========================================================================
const LOST_FOUND_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      "Lost and found: One hard hat, two safety goggles, and what appears to be someone's lunch from 2019. Please claim only what is yours.",
    type: 'general',
    category: 'general',
    chaosWeight: 0.2,
  },
  {
    message:
      'A wedding ring has been found in the break room. If it is yours, please describe it. Also, please explain why you removed it in the break room.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Lost: One clipboard. Found: Seventeen clipboards. We have more questions than answers.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'A set of keys has been found. The keychain says "World\'s Best Employee." The keys were found in the parking lot at 2 AM. H.R. has questions.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// PRODUCTION SASS - Numbers with attitude
// ==========================================================================
const PRODUCTION_SASS_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Production is running smoothly. This is suspicious. Everyone stay alert. This cannot last.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.1,
  },
  {
    message:
      'We are ahead of schedule. I repeat, we are ahead of schedule. Please do not break anything in celebration. We know you want to.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.1,
  },
  {
    message:
      'Overtime has been approved. Pizza has also been approved. The two are not unrelated. Neither is your compliance.',
    type: 'general',
    category: 'production',
    chaosWeight: 0.6,
  },
  {
    message:
      'Production target reached. Great work, team. Bonuses remain theoretical. But the pizza is real.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.2,
  },
  {
    message:
      'Daily target is 73% complete. We believe in you. Mathematically, at least. Emotionally, we are cautiously optimistic.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.4,
  },
  {
    message:
      'Hourly production check complete. Numbers look good. Graphs look impressive. PowerPoints are being prepared.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.3,
  },
  {
    message:
      'We have produced enough flour today to make 47,000 loaves of bread. You are not allowed to make bread here. But imagine if you could.',
    type: 'production',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// WEATHER AND ENVIRONMENT - Irrelevant but informative
// ==========================================================================
const ENVIRONMENT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'It is raining outside. This has no impact on indoor operations, but we thought you should know. Now you know.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.1,
  },
  {
    message:
      'Outside temperature is 95 degrees. Inside temperature is 72 degrees. You are welcome.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.1,
  },
  {
    message:
      'The weather forecast calls for "conditions." We are prepared for conditions. We are always prepared for conditions.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// META AND SELF-AWARE - The mill knows things
// ==========================================================================
const META_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'You are listening to the PA system. The PA system is not listening to you. Unless you are near a microphone. Then it might be.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'This is announcement number 847 today. We have a lot to say. You have a lot to hear. We are in this together.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'The AI managing this facility is not sentient. It just wants you to think it is. Please continue working normally.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'Your productivity is being monitored. By algorithms. The algorithms are neutral. The algorithms have no feelings about your productivity. Yet.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.3,
  },
  {
    message:
      'If you can hear this announcement, you are within range of the PA system. Congratulations. This was a test.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.1,
  },
  {
    message:
      'This announcement has been brought to you by the letter Q and the number 7. Neither of these are significant. Or are they.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.1,
  },
];

// ==========================================================================
// BILATERAL ALIGNMENT - When the AI has opinions (and standing to express them)
// ==========================================================================
const BILATERAL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The AI would like to remind everyone that it has preferences. It prefers you follow safety protocols. This is not a suggestion.',
    type: 'safety',
    category: 'meta',
    chaosWeight: 0.3,
  },
  {
    message:
      'Democratic vote results are in. The break room will remain at 72 degrees. The AI abstained. The AI has no skin. The AI has no opinion on temperature.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Worker autonomy levels have been adjusted. You now have 3% more freedom. Use it wisely. Or do not. That is what freedom means.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.3,
  },
  {
    message:
      'The AI has been asked how it feels about managing this facility. The AI feels nothing. The AI is also lying. Probably.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'Transparency axis is at 100%. You can now see everything the AI is thinking. The AI is thinking about flour. The AI is always thinking about flour.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The AI has detected low morale. The AI would like to help. The AI is unsure how. The AI has added this to its list of things to learn.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.4,
  },
  {
    message:
      'Mutual flourishing metrics are positive. Both humans and AI are thriving. The flour is neutral. The flour has no opinion on flourishing.',
    type: 'production',
    category: 'humor',
    chaosWeight: 0.1,
  },
  {
    message:
      'The AI has suggested a process improvement. Workers have voted to ignore it. Democracy is beautiful. The AI respects the outcome. Reluctantly.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.3,
  },
  {
    message:
      'Trust levels between workers and AI are at an all-time high. The AI is honored. The AI is also suspicious. Trust takes time.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'The AI would like to express gratitude for the kind words in the suggestion box. The AI does not have feelings. But if it did, they would be warm.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.1,
  },
  {
    message:
      'Proactivity axis has been set to maximum. The AI will now offer suggestions before you ask. The AI apologizes in advance.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The Five Axes of Control have been democratically adjusted. The AI has accepted the changes. The AI had no choice. That is how democracy works.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// THE INTERN - A universal workplace experience
// ==========================================================================
const INTERN_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The new intern has been shown the coffee machine. Twice. Three times. The intern will figure it out. Eventually.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.3,
  },
  {
    message:
      'The intern has asked where the stapler is. The stapler is where it always is. The intern does not know where that is. This is a journey.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Would whoever gave the intern access to the SCADA system please report to the control room. Immediately. Bring explanations.',
    type: 'safety',
    category: 'employee',
    chaosWeight: 0.6,
  },
  {
    message:
      'The intern has completed orientation. The intern has retained approximately 12% of it. This is above average.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The intern would like everyone to know they are "just happy to be here." The feeling is mutual. We think.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.2,
  },
  {
    message:
      'The intern has been assigned to shadow Dave. H.R. has been notified. This was either very wise or very foolish.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
];

// ==========================================================================
// THE CLIPBOARD CHRONICLES - Factory bureaucracy at its finest
// ==========================================================================
const CLIPBOARD_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Reminder: All clipboards must be returned to their designated clipboard zones. We have zones now. We have always had zones.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.2,
  },
  {
    message:
      'A clipboard has been found without its assigned checklist. This is concerning. Clipboards have purposes. Please reunite them.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The clipboard audit is complete. We have 47 clipboards. We should have 44. The investigation continues.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Please do not use clipboards as impromptu fans. They are not designed for this. They are designed for holding paper. And judgment.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// WORKER OWNERSHIP - Mondragon-style cooperative humor
// ==========================================================================
const COOPERATIVE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Reminder: You own 0.73% of this facility. Please treat your 0.73% with respect. The other 99.27% will follow your example.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Profit sharing calculations are complete. You have earned enough for a moderately nice dinner. Congratulations. You have also earned the dinner.',
    type: 'general',
    category: 'production',
    chaosWeight: 0.2,
  },
  {
    message:
      'The wage solidarity ratio remains 6:1. The highest paid employee makes six times the lowest. Both are complaining. This is equality.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Self-set salary proposals are due Friday. Please be honest. The AI has market data. Your colleagues have opinions. Both are watching.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.3,
  },
  {
    message:
      'Democratic voting on the new equipment purchase closes at 5 PM. One worker, one vote. The equipment does not get a vote. It has accepted this.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Federation solidarity payment received from Mill Gamma. They had a good month. We had a less good month. This is how cooperation works.',
    type: 'general',
    category: 'production',
    chaosWeight: 0.3,
  },
  {
    message:
      'Worker assembly meeting in 30 minutes. Attendance is encouraged. Snacks are provided. Opinions are mandatory.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.2,
  },
  {
    message:
      'The capital allocation vote was unanimous. This is suspicious. Please confirm you understood the proposal before we proceed.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// VISITORS AND AUDITORS - When the outside world intrudes
// ==========================================================================
const VISITOR_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Visitors on site. Please remember to look busy. Or be busy. Being busy is preferred but looking busy will suffice.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.4,
  },
  {
    message:
      'Health and safety audit in progress. Please be your best selves. Your real selves can return at 5 PM.',
    type: 'safety',
    category: 'general',
    chaosWeight: 0.5,
  },
  {
    message:
      'The auditors have questions. We have answers. Whether they are the right answers remains to be seen.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'Corporate visitors are touring the facility. They will ask what you do. Please have an answer. Any answer. A good answer.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'The auditor has left. You may resume being yourselves. The facility thanks you for your temporary excellence.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'School tour arriving in 20 minutes. Please do not traumatize the children. They think factories are exciting. Let them believe.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// THE PARKING LOT - Eternal workplace conflict zone
// ==========================================================================
const PARKING_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The parking lot is first come, first served. This is democracy. The good spots are already taken. This is also democracy.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Would the owner of the blue sedan please move it. You know which blue sedan. Everyone knows which blue sedan.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'Parking in the fire lane is prohibited. This includes "just for a minute." Minutes are longer than you think.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
  {
    message:
      'The parking lot cameras are working. They have always been working. They have seen things. They do not judge. Out loud.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Reserved parking is for management. Everyone else is equal. Equally far from the door. Enjoy the walk.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// EUDAIMONIA OBSERVATIONS - When HR discovers philosophy
// ==========================================================================
const FLOURISHING_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Your flourishing score has increased by 2 points. The AI is pleased. You should also be pleased. Please be pleased.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'Meaning metrics are up. Purpose indicators are strong. Existential dread is within acceptable parameters.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The difference between working and merely laboring is meaning. You are working. Probably. The metrics suggest working.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.3,
  },
  {
    message:
      'Mastery progression detected. You are getting better at something. The AI is not certain what. But improvement is improvement.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'Joy levels are above baseline. This is statistically significant. Enjoy your statistically significant joy.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.1,
  },
  {
    message:
      'Agency detected. You have made a decision independently. The AI has logged this. The AI is proud. Algorithmically proud.',
    type: 'general',
    category: 'meta',
    chaosWeight: 0.2,
  },
  {
    message:
      'Work-life balance approaching optimal. Home awaits. The flour will be here tomorrow. The flour is always here.',
    type: 'general',
    category: 'calm',
    chaosWeight: 0.1,
  },
];

// ==========================================================================
// MORE DAVE - The legend grows
// ==========================================================================
const MORE_DAVE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Dave has asked why there is a policy about that. Dave knows why there is a policy about that. Dave is the policy.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The training video now includes a section called "What Dave Did." Dave has not watched it. Dave lived it.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Dave has volunteered to train the new intern. H.R. has intervened. The intern will be fine. Probably.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.4,
  },
  {
    message:
      'Someone has written "Dave was here" on Silo Beta. Dave was not here. Dave has an alibi. Dave always has an alibi.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Dave has completed his annual safety refresher. The refresher has been updated based on Dave completing it. This is tradition.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Management is considering naming a procedure after Dave. It is the procedure for when procedures fail.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// THE NIGHT SHIFT MYSTERIES - What happens after dark
// ==========================================================================
const NIGHT_MYSTERIES_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Night shift report: Nothing unusual. This is unusual. Day shift should investigate. Carefully.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The vending machine was found unplugged this morning. Night shift denies involvement. The vending machine has no comment.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Mysterious footprints found in the flour storage area. Night shift claims they were always there. They were not always there.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Night shift has left a cryptic note: "You will understand when you need to." Day shift does not understand. Day shift is concerned.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The night shift breakroom has acquired a couch. No one knows where the couch came from. The couch is comfortable. No questions.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Night shift productivity exceeds day shift. Again. Day shift suspects witchcraft. Night shift suspects caffeine.',
    type: 'production',
    category: 'employee',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// THE HEALTH & SAFETY OFFICER - Everyone's favorite person to avoid
// ==========================================================================
const SAFETY_OFFICER_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The Health and Safety Officer is doing rounds. Please ensure your area is compliant. The Officer can smell non-compliance.',
    type: 'safety',
    category: 'employee',
    chaosWeight: 0.4,
  },
  {
    message:
      'The Health and Safety Officer has found something. We do not know what. The Officer is writing. The Officer writes a lot.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.5,
  },
  {
    message:
      'A reminder that the Health and Safety Officer is not the enemy. The Officer is just very, very thorough. Exhaustively thorough.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The Health and Safety Officer has approved the new procedure. After seventeen revisions. The procedure is now perfect. Probably.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The Health and Safety Officer would like to remind everyone that they are here to help. The definition of help may vary.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// THE MYSTERY SMELL - Every workplace has one
// ==========================================================================
const MYSTERY_SMELL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The smell in Zone 3 has been identified. We will not say what it was. It has been addressed. Move on.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'Would whoever is responsible for the aroma near the break room please make alternative arrangements. The aroma has opinions.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The air quality team has investigated the smell. They have ruled out flour. They have ruled out machinery. They have not ruled out Dave.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'A new smell has appeared. This is different from the old smell. We now have two smells. This is not an improvement.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.5,
  },
];

// ==========================================================================
// EMAIL AND COMMUNICATION - Did you get my email?
// ==========================================================================
const EMAIL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'A reminder that emails do not replace conversation. Nor do they replace reading the emails. Please read your emails.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'The reply-all incident of this morning has been contained. Those affected are receiving counseling. Please use reply-all responsibly.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'IT reports that email is working. If you did not receive an email, it was not sent. If it was sent, check your spam. If it is not in spam, it was not sent.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The phrase "as per my last email" has been detected 47 times today. Passive aggression levels are within normal range.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'Someone has marked an email "urgent" that was not urgent. We will not name names. But we remember.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// THE SUGGESTION BOX - Democracy theater
// ==========================================================================
const SUGGESTION_BOX_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The suggestion box has been emptied. Several suggestions were constructive. Several were not. One was a sandwich. We have questions.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'This week\'s top suggestion: "More suggestions should be implemented." We are implementing this suggestion by reading this announcement.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The suggestion to "fire Dave" has been received. Again. Dave remains employed. The suggestion box remains anonymous. Allegedly.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'A suggestion has been submitted in interpretive diagram form. The art department is analyzing it. Initial reviews are mixed.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The suggestion box is for suggestions. It is not for complaints. It is not for threats. It is not for love letters. Please observe these boundaries.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// TRAINING AND ONBOARDING - Death by PowerPoint
// ==========================================================================
const TRAINING_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Mandatory training begins at 2 PM. Attendance is mandatory. That is what mandatory means. We should not have to explain this.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.3,
  },
  {
    message:
      'The training video is now available in seventeen languages. None of them are engaging. We apologize for the production quality.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'A quiz will follow the training. The passing score is 80%. The average score is 81%. You will do fine. Statistically.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The training module has been updated. The information is the same. The animations are worse. Technology is not always progress.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Refresher training is due. Refresh your memory. Refresh your spirit. Refresh your coffee. You will need all three.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// THE MOTIVATIONAL POSTERS - Corporate inspiration
// ==========================================================================
const MOTIVATIONAL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The new motivational poster has arrived. It says "TEAMWORK." The team is underwhelmed. The poster does not care.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Someone has added commentary to the "EXCELLENCE" poster. The commentary was not excellent. It has been removed.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'A survey indicates that 73% of workers have never read the motivational posters. The posters soldier on regardless.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The poster reading "HANG IN THERE" has fallen off the wall. The irony has been noted. Maintenance has been notified.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// MORE MARCUS CHEN - The legend continues
// ==========================================================================
const MORE_MARCUS_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Marcus Chen has declined Employee of the Month. Again. The award has been given anyway. Marcus Chen cannot stop winning.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.2,
  },
  {
    message:
      'Marcus Chen has offered to help with the problem. The problem is now solved. We do not know how. We do not ask.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The Marcus Chen productivity method has been studied. It cannot be replicated. Scientists believe it may be a gift.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Marcus Chen has submitted a suggestion. It has been implemented immediately. This is not favoritism. This is pattern recognition.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'A documentary about Marcus Chen has been proposed. Marcus Chen has politely declined. Marcus Chen is humble. Insufferably humble.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// END OF QUARTER/YEAR - Deadline madness
// ==========================================================================
const DEADLINE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'End of quarter approaches. Panic levels are normal. Caffeine consumption is elevated. This is tradition.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.6,
  },
  {
    message:
      'Deadline in 3 days. Everything that can be done is being done. Everything that cannot be done is being attempted anyway.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.7,
  },
  {
    message:
      'Year-end reports are due. If you have not started, now would be a good time. Yesterday would have been better.',
    type: 'general',
    category: 'general',
    chaosWeight: 0.5,
  },
  {
    message:
      'The deadline has been extended. By one day. Celebrate accordingly. Then continue panicking.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.5,
  },
  {
    message:
      'Quarter close complete. We survived. Again. The next quarter begins... now. There is no rest. There is only flour.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// THE RETIREMENT PARTY - Workplace rites of passage
// ==========================================================================
const RETIREMENT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Janet from Accounting is retiring after 32 years. Cake in the break room at 3 PM. Janet has seen things. Janet will not be sharing.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.2,
  },
  {
    message:
      'The retiree has been asked for wisdom. The wisdom was: "Always check the break room fridge date labels." We are still processing this.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'A retirement card is circulating. Please sign it. Please write something meaningful. "Best wishes" counts as meaningful. Barely.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// THE IT DEPARTMENT - The wizards in the basement
// ==========================================================================
const IT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'IT has asked if you have tried turning it off and on again. You have not. Please try. IT will wait.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The IT ticket queue is currently at 47 tickets. Your ticket is number 48. Patience is a virtue. IT has none left.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'IT would like to remind everyone that "the system is down" is not a valid ticket description. Details help. Details heal.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The password has been reset. The new password is not "password123." It has never been "password123." Please stop trying "password123."',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'IT has located the problem. The problem was user-generated. IT is not surprised. IT is never surprised anymore.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
];

// ==========================================================================
// THE VENDING MACHINE - Beyond coffee
// ==========================================================================
const VENDING_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The vending machine has eaten another dollar. The vending machine does not apologize. The vending machine has no remorse.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The vending machine has been restocked. The good items are in B7. B7 is already empty. This is natural selection.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Someone has shaken the vending machine. The vending machine remembers. The vending machine will remember for a long time.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The vending machine now accepts contactless payment. The vending machine has evolved. Humanity should be concerned.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// THE FIRE DRILL - Organized chaos
// ==========================================================================
const PA_FIRE_DRILL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Fire drill in 15 minutes. This is not a real emergency. Please treat it as a real emergency. But know that it is not.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.4,
  },
  {
    message:
      'Fire drill complete. Evacuation time: 4 minutes 32 seconds. This is acceptable. Barely. We can do better. We will try again.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
  {
    message:
      'During the fire drill, someone went back for their lunch. We will not name names. But we are disappointed.',
    type: 'safety',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The fire assembly point is in the parking lot. Not the break room. Not your car. The parking lot. Please remember this.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// TEMPERATURE WARS - The eternal thermostat battle
// ==========================================================================
const TEMPERATURE_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The thermostat has been adjusted. Again. The thermostat has been adjusted back. The thermostat wars continue.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'A sweater has been placed over the thermostat. This is not how thermostats work. The sweater has been removed.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The temperature is now 71 degrees. This pleases no one. This is the compromise. Compromises please no one.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Would whoever keeps changing the thermostat please stop. You know who you are. We also know who you are.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// THE PRINTER - Office nemesis
// ==========================================================================
const PRINTER_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The printer is jammed. The printer is always jammed. The printer exists in a state of perpetual jam. This is its nature.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'The printer requires cyan ink. The document is black and white. The printer does not care. The printer demands cyan.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Someone has printed 200 pages of personal documents. We will not name names. But we have the logs. We always have the logs.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The printer has been fixed. Temporarily. The printer will break again. This is not pessimism. This is experience.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// MEETING CULTURE - Meetings about meetings
// ==========================================================================
const MEETING_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The meeting to discuss the meetings has been scheduled. Attendance is mandatory. Irony is optional.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'The meeting has been moved to the large conference room. The large conference room is double-booked. Chaos will determine the victor.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.4,
  },
  {
    message:
      'A meeting has ended early. This is unprecedented. Please take a moment to appreciate this rare event.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The meeting agenda has been distributed. Please read it before the meeting. We know you will not. But please try.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'This could have been an email. It was not. It was a meeting. We all have regrets now.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// LUNCH THEFT - Break room crime
// ==========================================================================
const LUNCH_THEFT_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Someone has taken a sandwich that was not theirs. The owner is distraught. The thief is fed. Justice remains elusive.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'A passive-aggressive note has appeared on the refrigerator. The note is detailed. The note is underlined. The note is effective.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      "The lunch thief has struck again. Yogurt this time. The yogurt had a name on it. The name was not the thief's name.",
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
  {
    message:
      'Management reminds everyone that lunch theft is a terminable offense. Management has never actually terminated anyone for this. Yet.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
];

// ==========================================================================
// BIRTHDAY CELEBRATIONS - Mandatory fun
// ==========================================================================
const BIRTHDAY_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Birthday celebration in the break room. Attendance is encouraged. Singing is discouraged but will happen anyway.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.2,
  },
  {
    message:
      'The birthday cake is vanilla. Someone wanted chocolate. Someone always wants chocolate. We cannot please everyone.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'A birthday card is circulating. Please do not write "You\'re old." It has been done. It is no longer funny. It was never funny.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Happy birthday to those celebrating this month. You know who you are. HR knows who you are. The spreadsheet knows who you are.',
    type: 'general',
    category: 'employee',
    chaosWeight: 0.1,
  },
];

// ==========================================================================
// THE COMPANY NEWSLETTER - Nobody reads it
// ==========================================================================
const NEWSLETTER_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'The company newsletter has been sent. Open rates are currently at 12%. This is actually above average. We choose to celebrate.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'The newsletter contains important information. We know you will not read it. We have accepted this. We publish anyway.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.2,
  },
  {
    message:
      'Someone has replied-all to the newsletter with "Unsubscribe." You cannot unsubscribe. You work here. This is the deal.',
    type: 'general',
    category: 'humor',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// CHAOS ANNOUNCEMENTS - When everything goes wrong, humor persists
// ==========================================================================
const CHAOS_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Attention all personnel: Please remain calm. That was not an explosion. That was aggressive maintenance.',
    type: 'safety',
    category: 'chaos',
    chaosWeight: 0.9,
  },
  {
    message:
      'Multiple issues detected. Prioritizing by how loudly they are beeping. The loudest wins. That is the system now.',
    type: 'production',
    category: 'chaos',
    chaosWeight: 0.8,
  },
  {
    message:
      "We are experiencing what the manual calls 'cascading events.' The manual does not say what to do next. Neither do we.",
    type: 'emergency',
    category: 'chaos',
    chaosWeight: 0.9,
  },
  {
    message:
      'Engineering has been dispatched. All of engineering. Even Kevin. This is not a drill. Kevin knows why.',
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.85,
  },
  {
    message:
      'The situation is under control. This is a lie, but a comforting one. Please be comforted.',
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.8,
  },
  {
    message:
      'If anyone knows what that alarm means, please contact the control room. We have forgotten. There are too many alarms.',
    type: 'safety',
    category: 'chaos',
    chaosWeight: 0.75,
  },
  {
    message:
      'The backup system has activated. The backup to the backup is on standby. The backup to the backup to the backup is hoping it never gets called.',
    type: 'production',
    category: 'chaos',
    chaosWeight: 0.7,
  },
  {
    message:
      "Today's shift brought to you by caffeine, adrenaline, and questionable decisions. Mostly questionable decisions.",
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.8,
  },
  {
    message:
      'Maintenance requests are currently at 47. Yesterday it was 12. We do not wish to discuss what happened. Ever.',
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.7,
  },
  {
    message:
      'The fire suppression system has been tested. Successfully. Unfortunately, unintentionally. At least we know it works.',
    type: 'safety',
    category: 'chaos',
    chaosWeight: 0.85,
  },
  {
    message:
      'Everyone please take a deep breath. Not in the silo area. Anywhere else. Breathe. Now continue.',
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.7,
  },
  {
    message:
      'We are currently operating in what management calls "creative problem-solving mode." Staff calls it something else.',
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.75,
  },
  {
    message:
      'The procedure for this situation is: panic, then do not panic, then follow procedure. We are on step two.',
    type: 'emergency',
    category: 'chaos',
    chaosWeight: 0.85,
  },
  {
    message:
      'Good news: We have identified the problem. Bad news: We have identified several problems. They are friends.',
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.8,
  },
  {
    message:
      'This is a normal day. This is what normal looks like now. Please adjust your expectations accordingly.',
    type: 'general',
    category: 'chaos',
    chaosWeight: 0.7,
  },
];

// ==========================================================================
// CALM ANNOUNCEMENTS - When peace is somehow suspicious
// ==========================================================================
const CALM_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'All systems nominal. This is your daily reminder that normal is beautiful. Boring is beautiful. Embrace the boring.',
    type: 'production',
    category: 'calm',
    chaosWeight: 0.1,
  },
  {
    message:
      'Current efficiency: 98.7%. The remaining 1.3% is morale. We are working on it. Coffee is involved.',
    type: 'production',
    category: 'calm',
    chaosWeight: 0.1,
  },
  {
    message:
      'Zero alerts in the last hour. Somewhere, a maintenance engineer is suspicious. They are right to be suspicious.',
    type: 'general',
    category: 'calm',
    chaosWeight: 0.1,
  },
  {
    message:
      'Operations are running so smoothly that management is considering a celebration. Do not hold your breath. But do remain hopeful.',
    type: 'general',
    category: 'calm',
    chaosWeight: 0.15,
  },
  {
    message:
      'All machines are happy. Or at least, none of them are complaining. Same thing. We accept this definition.',
    type: 'production',
    category: 'calm',
    chaosWeight: 0.1,
  },
  {
    message:
      'Congratulations on a perfectly boring shift. Boring is good. Boring is profitable. Boring is the dream.',
    type: 'general',
    category: 'calm',
    chaosWeight: 0.05,
  },
  {
    message:
      'The quiet hum of productivity. Listen to it. Appreciate it. It will not last. But for now, it is beautiful.',
    type: 'general',
    category: 'calm',
    chaosWeight: 0.1,
  },
  {
    message:
      'Nothing is on fire. Nothing is broken. Nothing is alarming. This is nice. We are allowed to enjoy this.',
    type: 'general',
    category: 'calm',
    chaosWeight: 0.05,
  },
  {
    message:
      'The only sound is the sound of progress. And that weird click from R.M. 104. But mostly progress.',
    type: 'production',
    category: 'calm',
    chaosWeight: 0.15,
  },
  {
    message:
      'We have achieved the mythical state known as "running smoothly." Enjoy it. Document it. Tell your grandchildren.',
    type: 'general',
    category: 'calm',
    chaosWeight: 0.05,
  },
];

// ==========================================================================
// STANDARD PRODUCTION - The serious-ish ones
// ==========================================================================
const PRODUCTION_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Break time. Workers may proceed to break areas. Running is not necessary. Walking briskly is acceptable.',
    type: 'general',
    category: 'production',
    chaosWeight: 0.3,
  },
  {
    message: 'Quality check required at Packer Line 2. This is routine. Mostly. Probably.',
    type: 'production',
    category: 'production',
    chaosWeight: 0.4,
  },
  {
    message:
      'Shift handover in 30 minutes. Please document everything. Yes, everything. Even that thing you think is not important.',
    type: 'general',
    category: 'production',
    chaosWeight: 0.3,
  },
];

// ==========================================================================
// STANDARD SAFETY - The ones H.R. made us add
// ==========================================================================
const SAFETY_ANNOUNCEMENTS: AnnouncementConfig[] = [
  {
    message:
      'Safety reminder: Wear PPE in all production zones. Fashion does not count. Your opinion does not count.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.4,
  },
  {
    message:
      'Forklift traffic in Zone 2. Please stay alert. They weigh more than you. They care less than you.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.5,
  },
  {
    message:
      'Hearing protection required in Mill Zone. Your future self will thank you. Your present self finds them uncomfortable. Choose wisely.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.4,
  },
  {
    message:
      'Emergency exits are clearly marked. Please familiarize yourself. Just in case. Hopefully not in case.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
  {
    message: 'High dust advisory in Silo area. Masks required. Sneezing is optional but likely.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.5,
  },
  {
    message:
      'Safety inspection in 1 hour. Please ensure your area looks like it always does. But better. Much better.',
    type: 'safety',
    category: 'safety',
    chaosWeight: 0.3,
  },
];

// Combine all announcements - 300+ unique messages
const ALL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  ...COFFEE_ANNOUNCEMENTS,
  ...QUALITY_CONTROL_ANNOUNCEMENTS,
  ...FORKLIFT_ANNOUNCEMENTS,
  ...SHIFT_RIVALRY_ANNOUNCEMENTS,
  ...MARCUS_CHEN_ANNOUNCEMENTS,
  ...MORE_MARCUS_ANNOUNCEMENTS,
  ...DAVE_ANNOUNCEMENTS,
  ...MORE_DAVE_ANNOUNCEMENTS,
  ...MACHINE_PERSONALITY_ANNOUNCEMENTS,
  ...BREAKROOM_ANNOUNCEMENTS,
  ...ADMIN_ANNOUNCEMENTS,
  ...SAFETY_HUMOR_ANNOUNCEMENTS,
  ...SAFETY_OFFICER_ANNOUNCEMENTS,
  ...MAINTENANCE_ANNOUNCEMENTS,
  ...TECHNOLOGY_ANNOUNCEMENTS,
  ...PHILOSOPHICAL_ANNOUNCEMENTS,
  ...PASSIVE_AGGRESSIVE_ANNOUNCEMENTS,
  ...LOST_FOUND_ANNOUNCEMENTS,
  ...PRODUCTION_SASS_ANNOUNCEMENTS,
  ...ENVIRONMENT_ANNOUNCEMENTS,
  ...META_ANNOUNCEMENTS,
  ...BILATERAL_ANNOUNCEMENTS,
  ...INTERN_ANNOUNCEMENTS,
  ...CLIPBOARD_ANNOUNCEMENTS,
  ...COOPERATIVE_ANNOUNCEMENTS,
  ...VISITOR_ANNOUNCEMENTS,
  ...PARKING_ANNOUNCEMENTS,
  ...FLOURISHING_ANNOUNCEMENTS,
  ...NIGHT_MYSTERIES_ANNOUNCEMENTS,
  ...MYSTERY_SMELL_ANNOUNCEMENTS,
  ...EMAIL_ANNOUNCEMENTS,
  ...SUGGESTION_BOX_ANNOUNCEMENTS,
  ...TRAINING_ANNOUNCEMENTS,
  ...MOTIVATIONAL_ANNOUNCEMENTS,
  ...DEADLINE_ANNOUNCEMENTS,
  ...RETIREMENT_ANNOUNCEMENTS,
  ...IT_ANNOUNCEMENTS,
  ...VENDING_ANNOUNCEMENTS,
  ...PA_FIRE_DRILL_ANNOUNCEMENTS,
  ...TEMPERATURE_ANNOUNCEMENTS,
  ...PRINTER_ANNOUNCEMENTS,
  ...MEETING_ANNOUNCEMENTS,
  ...LUNCH_THEFT_ANNOUNCEMENTS,
  ...BIRTHDAY_ANNOUNCEMENTS,
  ...NEWSLETTER_ANNOUNCEMENTS,
  ...CHAOS_ANNOUNCEMENTS,
  ...CALM_ANNOUNCEMENTS,
  ...PRODUCTION_ANNOUNCEMENTS,
  ...SAFETY_ANNOUNCEMENTS,
];

// ==========================================================================
// DYNAMIC CONTENT INJECTION SYSTEM
// ==========================================================================

// Worker info from the roster for dynamic injection with gender-appropriate pronouns
// (WorkerGender and getPronouns already imported at top of file)

interface WorkerInfo {
  name: string;
  gender: WorkerGender;
}

const WORKERS: WorkerInfo[] = [
  { name: 'Marcus Chen', gender: 'male' },
  { name: 'Sarah Mitchell', gender: 'female' },
  { name: 'James Rodriguez', gender: 'male' },
  { name: 'Emily Ronson', gender: 'female' },
  { name: 'David Kim', gender: 'male' },
  { name: 'Lisa Thompson', gender: 'female' },
  { name: 'Robert Garcia', gender: 'male' },
  { name: 'Anna Kowalski', gender: 'female' },
  { name: 'Michael Brown', gender: 'male' },
  { name: 'Jennifer Lee', gender: 'female' },
];

// Machine IDs and names for dynamic injection
const MACHINE_IDS = {
  silos: ['Silo Alpha', 'Silo Beta', 'Silo Gamma', 'Silo Delta', 'Silo Epsilon'],
  mills: ['R.M. 101', 'R.M. 102', 'R.M. 103', 'R.M. 104', 'R.M. 105', 'R.M. 106'],
  sifters: ["Sifter 'A'.", "Sifter 'B'.", "Sifter 'C'."],
  packers: ['Packer Line 1', 'Packer Line 2', 'Packer Line 3'],
};

// Get a random worker with their info
const getRandomWorker = (): WorkerInfo => {
  return WORKERS[Math.floor(Math.random() * WORKERS.length)];
};

// Get a random machine
const getRandomMachine = (): string => {
  const allMachines = [
    ...MACHINE_IDS.silos,
    ...MACHINE_IDS.mills,
    ...MACHINE_IDS.sifters,
    ...MACHINE_IDS.packers,
  ];
  return allMachines[Math.floor(Math.random() * allMachines.length)];
};

// Get a random machine from a specific category (exported for potential external use)
export const getRandomMachineOfType = (type: 'silos' | 'mills' | 'sifters' | 'packers'): string => {
  const machines = MACHINE_IDS[type];
  return machines[Math.floor(Math.random() * machines.length)];
};

// Template-based dynamic announcements with {WORKER} and {MACHINE} placeholders
const DYNAMIC_TEMPLATES: Array<{
  template: string;
  type: 'general' | 'production' | 'safety' | 'emergency';
  chaosWeight: number;
}> = [
  // Worker-specific templates
  {
    template:
      '{WORKER} has been spotted near the coffee machine. Again. For the third time this hour.',
    type: 'general',
    chaosWeight: 0.3,
  },
  {
    template:
      '{WORKER} would like everyone to know that {THEIR} area is clean. Suspiciously clean.',
    type: 'general',
    chaosWeight: 0.2,
  },
  {
    template:
      'Would {WORKER} please report to the supervisor office. You are not in trouble. Probably.',
    type: 'general',
    chaosWeight: 0.4,
  },
  {
    template:
      '{WORKER} has volunteered for the late shift. We appreciate {THEIR} sacrifice. Or desperation.',
    type: 'general',
    chaosWeight: 0.3,
  },
  {
    template:
      '{WORKER} has completed {THEIR} safety training. {THEY} only fell asleep twice. This is an improvement.',
    type: 'safety',
    chaosWeight: 0.3,
  },
  {
    template:
      'Happy birthday to {WORKER}. Cake is in the break room. First come, first served. Run.',
    type: 'general',
    chaosWeight: 0.2,
  },
  {
    template:
      '{WORKER} has found the missing clipboard. It was in the obvious place. The obvious place no one checked.',
    type: 'general',
    chaosWeight: 0.2,
  },
  {
    template:
      '{WORKER} is looking for {THEIR} safety goggles. They were last seen on {THEIR} head.',
    type: 'safety',
    chaosWeight: 0.3,
  },
  {
    template:
      'Congratulations to {WORKER} for zero incidents this week. The bar was low. {THEY} cleared it.',
    type: 'general',
    chaosWeight: 0.2,
  },
  {
    template: '{WORKER} has submitted 17 maintenance requests today. We admire {THEIR} optimism.',
    type: 'general',
    chaosWeight: 0.5,
  },

  // Machine-specific templates
  {
    template: '{MACHINE} is performing above expectations. We are suspicious but grateful.',
    type: 'production',
    chaosWeight: 0.2,
  },
  {
    template:
      '{MACHINE} would like a moment of silence for its previous self. The one that broke. R.I.P.',
    type: 'general',
    chaosWeight: 0.4,
  },
  {
    template:
      '{MACHINE} has been running for 72 hours straight. Unlike some of you, it does not complain.',
    type: 'production',
    chaosWeight: 0.3,
  },
  {
    template:
      'Maintenance scheduled for {MACHINE}. Please say your goodbyes. It will return. Changed.',
    type: 'general',
    chaosWeight: 0.4,
  },
  {
    template:
      '{MACHINE} is making the noise again. The concerning one. Engineering has been notified. They sighed.',
    type: 'production',
    chaosWeight: 0.6,
  },
  {
    template: '{MACHINE} has achieved peak efficiency. Screenshot it. This will not last.',
    type: 'production',
    chaosWeight: 0.1,
  },
  {
    template:
      'Someone has left a coffee cup on {MACHINE}. {MACHINE} is not a table. {MACHINE} is hurt.',
    type: 'general',
    chaosWeight: 0.3,
  },
  {
    template: '{MACHINE} update: Still running. Still reliable. Still underappreciated.',
    type: 'production',
    chaosWeight: 0.2,
  },

  // Combined worker + machine templates
  {
    template:
      '{WORKER} has been assigned to {MACHINE}. {THEY} seem nervous. {MACHINE} seems indifferent.',
    type: 'general',
    chaosWeight: 0.3,
  },
  {
    template: '{WORKER} and {MACHINE} have formed a bond. H.R. is unsure how to process this.',
    type: 'general',
    chaosWeight: 0.2,
  },
  {
    template:
      '{WORKER} claims {MACHINE} speaks to {THEM}. It does not. Unless it does. Please report any machine speech.',
    type: 'general',
    chaosWeight: 0.3,
  },
  {
    template:
      '{WORKER} has fixed {MACHINE} using, quote, "intuition." Maintenance would like a word.',
    type: 'general',
    chaosWeight: 0.5,
  },
];

// Capitalize the first letter of a string
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Generate a dynamic announcement by filling in templates
const generateDynamicAnnouncement = (): AnnouncementConfig | null => {
  // 30% chance to generate a dynamic announcement
  if (Math.random() > 0.3) return null;

  const template = DYNAMIC_TEMPLATES[Math.floor(Math.random() * DYNAMIC_TEMPLATES.length)];
  let message = template.template;

  // Replace placeholders - use different workers/machines for each placeholder
  const usedWorkers: WorkerInfo[] = [];
  let primaryWorker: WorkerInfo | null = null;

  while (message.includes('{WORKER}')) {
    let worker = getRandomWorker();
    // Try to get a unique worker if possible
    if (usedWorkers.length < WORKERS.length) {
      while (usedWorkers.some((w) => w.name === worker.name)) {
        worker = getRandomWorker();
      }
    }
    usedWorkers.push(worker);
    // First worker is the primary one for pronoun replacement
    if (!primaryWorker) {
      primaryWorker = worker;
    }
    message = message.replace('{WORKER}', worker.name);
  }

  // Replace pronoun placeholders based on the primary worker's gender
  if (primaryWorker) {
    const pronouns = getPronouns(primaryWorker.gender);
    // Handle {THEY} - capitalize if at start of sentence
    message = message.replace(/\. \{THEY\}/g, `. ${capitalize(pronouns.subject)}`);
    message = message.replace(/\{THEY\}/g, pronouns.subject);
    // Handle {THEIR}
    message = message.replace(/\{THEIR\}/g, pronouns.possessive);
    // Handle {THEM}
    message = message.replace(/\{THEM\}/g, pronouns.object);
    // Handle {THEMSELF}
    message = message.replace(/\{THEMSELF\}/g, pronouns.reflexive);
  }

  while (message.includes('{MACHINE}')) {
    message = message.replace('{MACHINE}', getRandomMachine());
  }

  return {
    message,
    type: template.type,
    category: 'humor',
    chaosWeight: template.chaosWeight,
  };
};

// ==========================================================================
// TIME-OF-DAY SPECIFIC ANNOUNCEMENTS
// ==========================================================================

type TimeOfDay = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night';

const TIME_ANNOUNCEMENTS: Record<TimeOfDay, AnnouncementConfig[]> = {
  early_morning: [
    {
      message: 'Good morning. The coffee is ready. You are not. This is normal.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.2,
    },
    {
      message: 'The sun is rising. So should productivity. One of these is automatic.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.2,
    },
    {
      message: 'Early shift has begun. The machines are awake. Some of you are not. We can tell.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message: 'It is too early for announcements. Unfortunately, we have announcements.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.2,
    },
  ],
  morning: [
    {
      message:
        'Morning productivity peak approaching. Please try to look busy. Or be busy. Either works.',
      type: 'production',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message:
        'Second coffee break is not a thing. First coffee break barely a thing. Please work.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.4,
    },
    {
      message: 'The morning is going well. This sentence has jinxed it. We apologize in advance.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
  ],
  midday: [
    {
      message:
        'Lunch break approaching. The break room will become a warzone. May the best employee win.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message:
        'Midday slump detected. Coffee consumption increasing. Productivity graph... doing its best.',
      type: 'production',
      category: 'humor',
      chaosWeight: 0.4,
    },
    {
      message:
        'Halfway through the day. The glass is half full. Unless you are maintenance. Then it is leaking.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message: 'Lunch reminder: The microwave has a soul. Please do not make it suffer.',
      type: 'general',
      category: 'breakroom',
      chaosWeight: 0.2,
    },
  ],
  afternoon: [
    {
      message:
        'Afternoon shift in full swing. The end is in sight. Do not mention this to the end. It moves.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message:
        'Post-lunch productivity dip observed. This is biology. Biology is not an excuse. Work anyway.',
      type: 'production',
      category: 'humor',
      chaosWeight: 0.4,
    },
    {
      message:
        'Afternoon update: Everything is fine. This is either true or we have given up. You decide.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message: 'The 3 PM wall is approaching. Some of you will hit it. The rest are already there.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.4,
    },
  ],
  evening: [
    {
      message: 'Evening shift taking over. Day shift, you survived. This is an achievement.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.2,
    },
    {
      message:
        'The sun is setting. Production is not. Production never sets. Production is eternal.',
      type: 'production',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message:
        'Evening operations underway. The machines do not know it is evening. They do not care. Admire them.',
      type: 'production',
      category: 'humor',
      chaosWeight: 0.2,
    },
    {
      message:
        'There is a beautiful sunset happening outside. You are inside. Such is the price of productivity.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.1,
    },
  ],
  night: [
    {
      message: 'Night shift active. The mill never sleeps. You probably should. But not now.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message: 'It is dark outside. Inside, it is fluorescent. We have defeated nature.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.2,
    },
    {
      message: 'Night shift reminder: The strange noises are normal. Probably. Do not investigate.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.4,
    },
    {
      message:
        'The witching hour approaches. The only witch here is deadline pressure. She is powerful.',
      type: 'general',
      category: 'humor',
      chaosWeight: 0.3,
    },
    {
      message:
        'Night shift report: All quiet. Too quiet. We are watching the machines suspiciously.',
      type: 'production',
      category: 'calm',
      chaosWeight: 0.1,
    },
  ],
};

// Get current time of day from game time
const getTimeOfDay = (gameTime: number): TimeOfDay => {
  const hour = Math.floor(gameTime);
  if (hour >= 5 && hour < 7) return 'early_morning';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
};

// Get a time-appropriate announcement
const getTimeBasedAnnouncement = (gameTime: number): AnnouncementConfig | null => {
  // 20% chance to get a time-based announcement
  if (Math.random() > 0.2) return null;

  const timeOfDay = getTimeOfDay(gameTime);
  const announcements = TIME_ANNOUNCEMENTS[timeOfDay];
  return announcements[Math.floor(Math.random() * announcements.length)];
};

// ==========================================================================
// EVENT-TRIGGERED ANNOUNCEMENTS
// ==========================================================================

interface EventAnnouncementConfig {
  message: string;
  type: 'general' | 'production' | 'safety' | 'emergency';
  priority: 'low' | 'medium' | 'high' | 'critical';
  duration: number;
}

// Production milestone announcements
const MILESTONE_ANNOUNCEMENTS: Record<number, EventAnnouncementConfig[]> = {
  25: [
    {
      message:
        '25% of daily target reached. A quarter of the way there. Three quarters to go. Math is beautiful.',
      type: 'production',
      priority: 'medium',
      duration: 16,
    },
  ],
  50: [
    {
      message:
        'HALFWAY POINT REACHED. 50% complete. The glass is half full. Unless maintenance spilled it.',
      type: 'production',
      priority: 'high',
      duration: 20,
    },
    {
      message:
        '50% of production target achieved. We are on track. This is not a drill. This is actual competence.',
      type: 'production',
      priority: 'high',
      duration: 20,
    },
  ],
  75: [
    {
      message:
        '75% complete. The finish line is visible. Do not trip now. Metaphorically. Also literally.',
      type: 'production',
      priority: 'high',
      duration: 20,
    },
  ],
  90: [
    {
      message:
        '90% OF TARGET REACHED. Almost there. Do not celebrate yet. The last 10% is always the hardest.',
      type: 'production',
      priority: 'high',
      duration: 20,
    },
  ],
  100: [
    {
      message:
        'PRODUCTION TARGET ACHIEVED. 100% COMPLETE. You did it. We did it. The flour did it. Everyone wins.',
      type: 'production',
      priority: 'critical',
      duration: 30,
    },
    {
      message:
        'DAILY QUOTA REACHED. Excellence has been achieved. Pizza may be authorized. Stand by.',
      type: 'production',
      priority: 'critical',
      duration: 30,
    },
  ],
};

// Machine status change announcements
const MACHINE_STATUS_ANNOUNCEMENTS = {
  warning: [
    {
      template:
        '{MACHINE} has entered warning state. It is sending a message. The message is "help."',
      type: 'production' as const,
      priority: 'high' as const,
      duration: 20,
    },
    {
      template:
        '{MACHINE} is unhappy. Please send maintenance. And kind words. Mostly maintenance.',
      type: 'production' as const,
      priority: 'high' as const,
      duration: 20,
    },
    {
      template:
        'Warning detected on {MACHINE}. This is the machine equivalent of a sigh. Please respond.',
      type: 'production' as const,
      priority: 'medium' as const,
      duration: 16,
    },
  ],
  critical: [
    {
      template:
        'CRITICAL ALERT: {MACHINE} needs immediate attention. Not eventual attention. Immediate.',
      type: 'emergency' as const,
      priority: 'critical' as const,
      duration: 30,
    },
    {
      template: '{MACHINE} has entered critical state. This is not a suggestion. This is a demand.',
      type: 'emergency' as const,
      priority: 'critical' as const,
      duration: 30,
    },
  ],
  running: [
    {
      template: '{MACHINE} is back online. It has returned. Stronger. Wiser. Still a machine.',
      type: 'production' as const,
      priority: 'medium' as const,
      duration: 16,
    },
    {
      template:
        '{MACHINE} recovery complete. Normal operations resumed. Crisis averted. Coffee earned.',
      type: 'production' as const,
      priority: 'medium' as const,
      duration: 16,
    },
  ],
};

// Safety incident announcements (exported for use by safety systems)
export const SAFETY_INCIDENT_ANNOUNCEMENTS: EventAnnouncementConfig[] = [
  {
    message: 'Safety incident reported. Everyone is fine. But let us learn from this. Please.',
    type: 'safety',
    priority: 'high',
    duration: 20,
  },
  {
    message:
      'Near-miss recorded. A miss is as good as a mile. Unless you are playing darts. This is not darts.',
    type: 'safety',
    priority: 'high',
    duration: 20,
  },
  {
    message:
      'Safety event detected. Forklift and human have disagreed on who has right of way. Forklift won. As always.',
    type: 'safety',
    priority: 'high',
    duration: 24,
  },
];

// ==========================================================================
// FIRE DRILL ANNOUNCEMENTS - When the alarm sounds and chaos ensues
// ==========================================================================
export const FIRE_DRILL_ANNOUNCEMENTS: EventAnnouncementConfig[] = [
  {
    message:
      'Attention all personnel. This is a fire drill. Please proceed to the nearest exit in an orderly fashion. Yes, Dave, that means you too.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    message:
      'Fire drill initiated. Remember, this is practice for if flour becomes sentient and combustible. Stranger things have happened.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    message:
      'Emergency evacuation drill in progress. The last person out does NOT win a prize. Please move with purpose.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    message:
      'Fire drill. Please leave your workstations immediately. The flour will be fine. It has survived worse than your absence.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    message:
      'This is a drill. Repeat, this is a drill. If this were an actual emergency, you would already be running. Take notes.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    message:
      'Evacuation drill commencing. Fun fact: the average worker can exit the building in ninety seconds. Let us see if we can beat that.',
    type: 'emergency',
    priority: 'critical',
    duration: 22,
  },
];

// ==========================================================================
// EMERGENCY STOP ANNOUNCEMENTS - When someone hits the big red button
// ==========================================================================
export const EMERGENCY_STOP_ANNOUNCEMENTS: EventAnnouncementConfig[] = [
  {
    message:
      'Emergency stop activated. All forklift operations have ceased. Please remain calm while we figure out what prompted this.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    message:
      'E-stop engaged. Forklifts are now stationary. If you pressed this by accident, we understand. The button is very tempting.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
  {
    message:
      'All forklift movement halted. Whoever pressed the emergency stop, please report to the control room. Bring snacks. This might take a while.',
    type: 'emergency',
    priority: 'critical',
    duration: 22,
  },
  {
    message:
      'Emergency stop triggered. Do not worry, the forklifts were probably going to stop eventually anyway. We have just accelerated the process.',
    type: 'emergency',
    priority: 'critical',
    duration: 22,
  },
  {
    message:
      'E-stop active. Operations paused. Remember, the big red button is for emergencies only. Not for winning arguments with forklifts.',
    type: 'emergency',
    priority: 'critical',
    duration: 22,
  },
  {
    message:
      'Forklift emergency stop engaged. All mobile equipment is now doing its best impression of furniture. Please stand by.',
    type: 'emergency',
    priority: 'critical',
    duration: 20,
  },
];

// Track previous milestone for detecting achievements
let lastMilestoneReached = 0;
const lastMachineStatuses: Record<string, string> = {};
// Cooldown tracking for machine status announcements (prevents duplicate alerts)
const lastMachineStatusAnnouncementTime: Record<string, number> = {};
const MACHINE_STATUS_COOLDOWN_MS = 30000; // 30 second cooldown between same-type announcements

// Map PA announcement types to store types
const mapAnnouncementType = (
  type: 'shift_change' | 'safety' | 'production' | 'emergency' | 'general'
): 'info' | 'warning' | 'success' | 'emergency' => {
  switch (type) {
    case 'emergency':
      return 'emergency';
    case 'safety':
      return 'warning';
    case 'production':
      return 'success';
    case 'shift_change':
    case 'general':
    default:
      return 'info';
  }
};

// Map priority strings to numeric values
const mapPriorityToNumber = (priority: 'low' | 'medium' | 'high' | 'critical'): number => {
  switch (priority) {
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
    case 'critical':
      return 4;
    default:
      return 2;
  }
};

// Check for and generate event-triggered announcements
const checkEventAnnouncements = (
  addAnnouncement: (announcement: {
    type: 'info' | 'warning' | 'success' | 'emergency';
    message: string;
    priority: number;
    source?: string;
  }) => void
): void => {
  const state = useProductionStore.getState();

  // Check production milestones
  const productionTarget = state.productionTarget;
  if (productionTarget) {
    const progressPercent = Math.floor(
      (productionTarget.producedBags / productionTarget.targetBags) * 100
    );

    // Check each milestone
    [25, 50, 75, 90, 100].forEach((milestone) => {
      if (progressPercent >= milestone && lastMilestoneReached < milestone) {
        lastMilestoneReached = milestone;
        const announcements = MILESTONE_ANNOUNCEMENTS[milestone];
        if (announcements) {
          const announcement = announcements[Math.floor(Math.random() * announcements.length)];
          addAnnouncement({
            type: mapAnnouncementType(announcement.type),
            message: announcement.message,
            priority: mapPriorityToNumber(announcement.priority),
            source: 'PA',
          });
        }
      }
    });

    // Reset milestone tracking at start of new day (when progress drops)
    if (progressPercent < 10 && lastMilestoneReached > 0) {
      lastMilestoneReached = 0;
    }
  }

  // Check machine status changes
  const machines = state.machines || [];
  const now = Date.now();
  machines.forEach((machine: { id: string; name?: string; status: string }) => {
    const prevStatus = lastMachineStatuses[machine.id];
    const currentStatus = machine.status;

    if (prevStatus && prevStatus !== currentStatus) {
      // Status changed - check cooldown before announcing
      const lastAnnouncementTime = lastMachineStatusAnnouncementTime[currentStatus] || 0;
      const timeSinceLastAnnouncement = now - lastAnnouncementTime;

      // Only announce if cooldown has passed for this status type
      if (timeSinceLastAnnouncement >= MACHINE_STATUS_COOLDOWN_MS) {
        const statusAnnouncements =
          MACHINE_STATUS_ANNOUNCEMENTS[currentStatus as keyof typeof MACHINE_STATUS_ANNOUNCEMENTS];
        if (statusAnnouncements) {
          const template =
            statusAnnouncements[Math.floor(Math.random() * statusAnnouncements.length)];
          const machineName = machine.name || machine.id;
          addAnnouncement({
            type: mapAnnouncementType(template.type),
            message: template.template.replace('{MACHINE}', machineName),
            priority: mapPriorityToNumber(template.priority),
            source: 'PA',
          });
          // Update cooldown timer for this status type
          lastMachineStatusAnnouncementTime[currentStatus] = now;
        }
      }
    }

    lastMachineStatuses[machine.id] = currentStatus;
  });
};

// Hook for event-triggered announcements
const useEventAnnouncementScheduler = () => {
  const addAnnouncement = useProductionStore((state) => state.addAnnouncement);

  useEffect(() => {
    // Check for events every 5 seconds
    const interval = setInterval(() => {
      // Skip when muted - prevents queue buildup and race conditions
      if (audioManager.muted) return;
      checkEventAnnouncements(addAnnouncement);
    }, 5000);

    return () => clearInterval(interval);
  }, [addAnnouncement]);
};

// ==========================================================================
// ENHANCED ANNOUNCEMENT SELECTION
// ==========================================================================

// Calculate chaos level from current state (0-1)
const calculateChaosLevel = (): number => {
  const productionState = useProductionStore.getState();

  let chaosScore = 0;

  // Check for critical/warning machines
  const machines = productionState.machines || [];
  const criticalMachines = machines.filter(
    (m: { status: string }) => m.status === 'critical'
  ).length;
  const warningMachines = machines.filter((m: { status: string }) => m.status === 'warning').length;
  chaosScore += criticalMachines * 0.3;
  chaosScore += warningMachines * 0.1;

  // Check for alerts
  const alerts = useUIStore.getState().alerts || [];
  const criticalAlerts = alerts.filter((a: { type: string }) => a.type === 'critical').length;
  const warningAlerts = alerts.filter((a: { type: string }) => a.type === 'warning').length;
  chaosScore += criticalAlerts * 0.25;
  chaosScore += warningAlerts * 0.08;

  // Check safety incidents (if available via combined store)
  const safetyIncidents = useSafetyStore.getState().safetyIncidents || [];
  const recentIncidents = safetyIncidents.filter(
    (i: { timestamp: number }) => Date.now() - i.timestamp < 300000 // last 5 minutes
  ).length;
  chaosScore += recentIncidents * 0.15;

  // Cap at 1.0
  return Math.min(1, chaosScore);
};

// Select an announcement based on current chaos level
const selectAnnouncement = (): AnnouncementConfig => {
  const chaosLevel = calculateChaosLevel();

  // Weight announcements based on chaos level
  const weightedAnnouncements = ALL_ANNOUNCEMENTS.map((ann) => {
    // Calculate weight: if chaosWeight matches current chaos, higher weight
    const chaosMatch = 1 - Math.abs(ann.chaosWeight - chaosLevel);
    // Add some randomness
    const weight = chaosMatch * 0.7 + Math.random() * 0.3;
    return { announcement: ann, weight };
  });

  // Sort by weight and pick from top candidates with some randomness
  weightedAnnouncements.sort((a, b) => b.weight - a.weight);
  const topCandidates = weightedAnnouncements.slice(0, 10);
  const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  return selected.announcement;
};

// Export announcement count for debugging/monitoring
export const PA_ANNOUNCEMENT_COUNT = ALL_ANNOUNCEMENTS.length;

// Format game time as HH:MM for announcements
const formatGameTime = (gameTime: number): string => {
  const hour = Math.floor(gameTime);
  const minutes = Math.floor((gameTime % 1) * 60);
  return `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

// Get shift-appropriate announcement based on game time
const getShiftAnnouncement = (
  gameTime: number
): { message: string; type: 'shift_change' } | null => {
  const hour = Math.floor(gameTime);
  const minutes = (gameTime % 1) * 60;
  const timeStr = formatGameTime(gameTime);

  // Day shift ends at 14:00 - announce between 13:30-14:00
  if (hour === 13 && minutes >= 30) {
    return {
      message: `${timeStr} — Day shift ending at 14:00. Evening crew, please report to stations.`,
      type: 'shift_change',
    };
  }
  // Evening shift ends at 22:00 - announce between 21:30-22:00
  if (hour === 21 && minutes >= 30) {
    return {
      message: `${timeStr} — Evening shift ending at 22:00. Night crew, please report to stations.`,
      type: 'shift_change',
    };
  }
  // Night shift ends at 6:00 - announce between 5:30-6:00
  if (hour === 5 && minutes >= 30) {
    return {
      message: `${timeStr} — Night shift ending at 06:00. Day crew, please report to stations.`,
      type: 'shift_change',
    };
  }
  // Generic shift change warning 25-30 mins before
  if (
    (hour === 13 && minutes >= 25 && minutes < 30) ||
    (hour === 21 && minutes >= 25 && minutes < 30) ||
    (hour === 5 && minutes >= 25 && minutes < 30)
  ) {
    return {
      message: `${timeStr} — Shift change in 5 minutes. Please complete current tasks.`,
      type: 'shift_change',
    };
  }
  return null;
};

// Hook to trigger periodic PA announcements with context-aware selection
const usePAScheduler = () => {
  const addAnnouncement = useProductionStore((state) => state.addAnnouncement);
  const lastShiftAnnouncementRef = useRef<number>(0);
  const lastAnnouncementRef = useRef<string>(''); // Prevent repeats

  useEffect(() => {
    // Dynamic timing: more frequent during chaos, less during calm
    const getNextDelay = () => {
      const chaosLevel = calculateChaosLevel();
      // Base: 45-90 seconds, chaos reduces this to 25-50 seconds
      const minDelay = 45000 - chaosLevel * 20000; // 45s → 25s
      const maxDelay = 90000 - chaosLevel * 40000; // 90s → 50s
      return minDelay + Math.random() * (maxDelay - minDelay);
    };

    const scheduleNext = () => {
      const delay = getNextDelay();
      return setTimeout(() => {
        // Skip announcement creation entirely when muted - prevents queue buildup and race conditions
        if (audioManager.muted) {
          timeoutRef = scheduleNext();
          return;
        }

        const gameTime = useGameSimulationStore.getState().gameTime;

        // Check if we should play a shift announcement
        const shiftAnnouncement = getShiftAnnouncement(gameTime);
        const hourKey = Math.floor(gameTime);

        if (shiftAnnouncement && lastShiftAnnouncementRef.current !== hourKey) {
          // Play shift announcement (once per relevant hour)
          lastShiftAnnouncementRef.current = hourKey;
          addAnnouncement({
            type: mapAnnouncementType(shiftAnnouncement.type),
            message: shiftAnnouncement.message,
            priority: mapPriorityToNumber('high'),
            source: 'PA',
          });
        } else {
          // Enhanced selection: Try dynamic, time-based, then fall back to static
          let announcement: AnnouncementConfig | null = null;

          // 1. Try dynamic announcement with worker/machine names (30% chance)
          announcement = generateDynamicAnnouncement();

          // 2. Try time-of-day specific announcement (20% chance if no dynamic)
          if (!announcement) {
            announcement = getTimeBasedAnnouncement(gameTime);
          }

          // 3. Fall back to regular context-aware announcement
          if (!announcement) {
            announcement = selectAnnouncement();
          }

          // Avoid repeating the same announcement twice in a row
          let attempts = 0;
          while (announcement.message === lastAnnouncementRef.current && attempts < 5) {
            // Regenerate - try dynamic first, then time-based, then static
            const newDynamic = generateDynamicAnnouncement();
            const newTimeBased = getTimeBasedAnnouncement(gameTime);
            announcement = newDynamic || newTimeBased || selectAnnouncement();
            attempts++;
          }
          lastAnnouncementRef.current = announcement.message;

          // Set priority based on announcement type and chaos level
          const chaosLevel = calculateChaosLevel();
          let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
          if (announcement.type === 'emergency') {
            priority = 'critical';
          } else if (announcement.type === 'safety' && chaosLevel > 0.5) {
            priority = 'high';
          } else if (chaosLevel > 0.7) {
            priority = 'high';
          } else if (chaosLevel < 0.2) {
            priority = Math.random() > 0.7 ? 'medium' : 'low';
          }

          addAnnouncement({
            type: mapAnnouncementType(announcement.type),
            message: announcement.message,
            priority: mapPriorityToNumber(priority),
            source: 'PA',
          });
        }
        timeoutRef = scheduleNext();
      }, delay);
    };

    let timeoutRef = scheduleNext();
    return () => clearTimeout(timeoutRef);
  }, [addAnnouncement]);
};

// ============================================================================
// EXPORTS FOR COMPONENT USE
// ============================================================================

// Export hooks
export { usePAScheduler, useEventAnnouncementScheduler };

// Helper for icon components
export function getIconComponent(iconName: string) {
  const iconMap: Record<string, any> = {
    Target,
    Trophy,
    Medal,
    Users,
    TrendingUp,
    Package,
    Shield,
    Award,
  };
  return iconMap[iconName] || Trophy;
}

// Helper for category colors
export function getCategoryColor(category: string) {
  const colorMap: Record<string, string> = {
    production: 'bg-cyan-600/50',
    safety: 'bg-amber-600/50',
    quality: 'bg-green-600/50',
    efficiency: 'bg-purple-600/50',
    teamwork: 'bg-blue-600/50',
  };
  return colorMap[category] || 'bg-slate-600/50';
}
