import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  Trophy,
  Medal,
  Users,
  TrendingUp,
  Package,
  Shield,
  Award,
  Volume2,
  Map,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Star,
  Image,
  Download,
  History,
  Clock,
  Moon,
  RotateCcw,
  Heart,
} from 'lucide-react';
import { useHistoricalPlaybackStore } from '../stores/historicalPlaybackStore';
import { useProductionStore } from '../stores/productionStore';
import { useUIStore } from '../stores/uiStore';
import { useSafetyStore } from '../stores/safetyStore';

import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { positionRegistry, type EntityPosition } from '../utils/positionRegistry';
import { audioManager } from '../utils/audioManager';
import { useMobileDetection } from '../hooks/useMobileDetection';

// Context to share camera feed container refs between DOM and Canvas
interface CameraFeedContextType {
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

// Combine all announcements - 150+ unique messages
const ALL_ANNOUNCEMENTS: AnnouncementConfig[] = [
  ...COFFEE_ANNOUNCEMENTS,
  ...QUALITY_CONTROL_ANNOUNCEMENTS,
  ...FORKLIFT_ANNOUNCEMENTS,
  ...SHIFT_RIVALRY_ANNOUNCEMENTS,
  ...MARCUS_CHEN_ANNOUNCEMENTS,
  ...DAVE_ANNOUNCEMENTS,
  ...MACHINE_PERSONALITY_ANNOUNCEMENTS,
  ...BREAKROOM_ANNOUNCEMENTS,
  ...ADMIN_ANNOUNCEMENTS,
  ...SAFETY_HUMOR_ANNOUNCEMENTS,
  ...MAINTENANCE_ANNOUNCEMENTS,
  ...TECHNOLOGY_ANNOUNCEMENTS,
  ...PHILOSOPHICAL_ANNOUNCEMENTS,
  ...PASSIVE_AGGRESSIVE_ANNOUNCEMENTS,
  ...LOST_FOUND_ANNOUNCEMENTS,
  ...PRODUCTION_SASS_ANNOUNCEMENTS,
  ...ENVIRONMENT_ANNOUNCEMENTS,
  ...META_ANNOUNCEMENTS,
  ...CHAOS_ANNOUNCEMENTS,
  ...CALM_ANNOUNCEMENTS,
  ...PRODUCTION_ANNOUNCEMENTS,
  ...SAFETY_ANNOUNCEMENTS,
];

// ==========================================================================
// DYNAMIC CONTENT INJECTION SYSTEM
// ==========================================================================

// Worker info from the roster for dynamic injection with gender-appropriate pronouns
import { WorkerGender, getPronouns } from '../types';

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
  sifters: ['Sifter A', 'Sifter B', 'Sifter C'],
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
      '{WORKER} claims {MACHINE} speaks to them. It does not. Unless it does. Please report any machine speech.',
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

// Check for and generate event-triggered announcements
const checkEventAnnouncements = (
  addAnnouncement: (announcement: {
    type: 'shift_change' | 'safety' | 'production' | 'emergency' | 'general';
    message: string;
    duration: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
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
            type: announcement.type,
            message: announcement.message,
            duration: announcement.duration,
            priority: announcement.priority,
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
            type: template.type,
            message: template.template.replace('{MACHINE}', machineName),
            duration: template.duration,
            priority: template.priority,
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
        const gameTime = useGameSimulationStore.getState().gameTime;

        // Check if we should play a shift announcement
        const shiftAnnouncement = getShiftAnnouncement(gameTime);
        const hourKey = Math.floor(gameTime);

        if (shiftAnnouncement && lastShiftAnnouncementRef.current !== hourKey) {
          // Play shift announcement (once per relevant hour)
          lastShiftAnnouncementRef.current = hourKey;
          addAnnouncement({
            type: shiftAnnouncement.type,
            message: shiftAnnouncement.message,
            duration: 16,
            priority: 'high',
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
            type: announcement.type,
            message: announcement.message,
            duration: announcement.type === 'emergency' ? 24 : 16,
            priority,
          });
        }
        timeoutRef = scheduleNext();
      }, delay);
    };

    let timeoutRef = scheduleNext();
    return () => clearTimeout(timeoutRef);
  }, [addAnnouncement]);
};

// PA System Announcements Component
export const PAAnnouncementSystem: React.FC = () => {
  const announcements = useProductionStore((state) => state.announcements);
  const dismissAnnouncement = useProductionStore((state) => state.dismissAnnouncement);
  const clearOldAnnouncements = useProductionStore((state) => state.clearOldAnnouncements);
  const { isMobile } = useMobileDetection();

  // Track last spoken announcement to avoid repeats
  const lastSpokenRef = useRef<string>('');
  const lastSpeakTimeRef = useRef<number>(0);

  // Suppress PA announcements for first 10 seconds to let speech synthesis initialize
  const [isStartupSuppressed, setIsStartupSuppressed] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStartupSuppressed(false);
    }, 10000); // 10 second startup suppression
    return () => clearTimeout(timer);
  }, []);

  // Schedule periodic announcements
  usePAScheduler();

  // Schedule event-triggered announcements (milestones, machine status changes)
  useEventAnnouncementScheduler();

  // Auto-clear old announcements
  useEffect(() => {
    const interval = setInterval(clearOldAnnouncements, 1000);
    return () => clearInterval(interval);
  }, [clearOldAnnouncements]);

  // TTS: Speak new announcements
  useEffect(() => {
    // Skip during startup suppression period
    if (isStartupSuppressed) return;
    if (announcements.length === 0) return;

    const latestAnnouncement = announcements[0];
    const now = Date.now();

    // Speak if this is a new announcement and we have a cooldown (10s between TTS)
    if (
      latestAnnouncement.message !== lastSpokenRef.current &&
      now - lastSpeakTimeRef.current > 10000 &&
      !audioManager.isSpeaking()
    ) {
      lastSpokenRef.current = latestAnnouncement.message;
      lastSpeakTimeRef.current = now;
      audioManager.speakAnnouncement(latestAnnouncement.message);
    }
  }, [announcements, isStartupSuppressed]);

  // Suppress display during startup period to let speech synthesis initialize
  if (isStartupSuppressed) return null;
  if (announcements.length === 0) return null;

  // Mobile: Show compact ticker instead of large cards
  if (isMobile) {
    const latestAnnouncement = announcements[0];
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[60] pointer-events-auto"
        style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={latestAnnouncement.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-2 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-700/50 px-3 py-1.5 flex items-center gap-2"
            onClick={() => dismissAnnouncement(latestAnnouncement.id)}
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
            <div className="flex-1 min-w-0 overflow-hidden">
              <motion.p
                initial={{ x: '100%' }}
                animate={{ x: '-100%' }}
                transition={{ duration: 12, ease: 'linear', repeat: Infinity }}
                className="text-xs text-slate-200 whitespace-nowrap"
              >
                {latestAnnouncement.message}
              </motion.p>
            </div>
            <span className="text-[8px] text-slate-500 uppercase tracking-wider flex-shrink-0">
              PA
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  const getPriorityStyles = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-600/95 border-red-400 text-white animate-pulse';
      case 'high':
        return 'bg-amber-600/95 border-amber-400 text-white';
      case 'medium':
        return 'bg-blue-600/95 border-blue-400 text-white';
      default:
        return 'bg-slate-800/95 border-slate-600 text-white';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'shift_change':
        return <Clock className="w-5 h-5" />;
      case 'safety':
        return <Shield className="w-5 h-5" />;
      case 'emergency':
        return <AlertTriangle className="w-5 h-5" />;
      case 'production':
        return <Package className="w-5 h-5" />;
      default:
        return <Volume2 className="w-5 h-5" />;
    }
  };

  // AI Voice styling is warm/cyan with heart, PA is sardonic/blue-slate with speaker
  const getVoiceStyles = (voice?: 'pa' | 'ai', priority?: string) => {
    if (voice === 'ai') {
      // AI Voice: warm, genuine - cyan/green gradient
      return 'bg-gradient-to-r from-cyan-700/95 to-emerald-700/95 border-cyan-400 text-white';
    }
    // PA Voice (default): sardonic observer - blue-slate
    return getPriorityStyles(priority || 'medium');
  };

  const getVoiceIcon = (voice?: 'pa' | 'ai', type?: string) => {
    if (voice === 'ai') {
      // AI: heart icon (warm/genuine)
      return <Heart className="w-5 h-5 text-pink-300" />;
    }
    // PA: type-based icon (observational)
    return getTypeIcon(type || 'general');
  };

  const getVoiceLabel = (voice?: 'pa' | 'ai') => {
    return voice === 'ai' ? 'MillOS-AI' : 'PA System';
  };

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] space-y-2 pointer-events-auto max-w-[90vw]">
      <AnimatePresence>
        {announcements.slice(0, 3).map((announcement: any) => (
          <motion.div
            key={announcement.id}
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`flex items-start gap-3.5 px-5 py-4 rounded-xl border-2 backdrop-blur-xl shadow-2xl w-full max-w-lg ${getVoiceStyles(announcement.voice, announcement.priority)}`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {getVoiceIcon(announcement.voice, announcement.type)}
            </div>
            <div className="flex-1 min-w-0 text-left space-y-2">
              <p className="font-medium text-[15px] leading-relaxed text-balance hyphens-auto">
                {announcement.message}
              </p>
              <div className="flex items-center gap-2.5 opacity-50">
                <div className="h-[1px] bg-current flex-1 opacity-70" />
                <p className="text-[9px] uppercase tracking-[0.2em] font-semibold whitespace-nowrap">
                  {getVoiceLabel(announcement.voice)}
                </p>
              </div>
            </div>
            <button
              onClick={() => dismissAnnouncement(announcement.id)}
              className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Daily Production Targets Widget
export const ProductionTargetsWidget: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const productionTarget = useProductionStore((state) => state.productionTarget);
  const totalBagsProduced = useProductionStore((state) => state.totalBagsProduced);

  const progress = productionTarget
    ? (productionTarget.producedBags / productionTarget.targetBags) * 100
    : 0;
  const isComplete = progress >= 100;
  const isOnTrack = progress >= 50; // Simplified check

  // Play victory fanfare when quota reaches 100%
  useEffect(() => {
    if (!productionTarget) return;
    if (isComplete) {
      audioManager.playVictoryFanfare();
    } else {
      // Reset the flag when quota drops below 100% (e.g., new day)
      audioManager.resetQuotaFlag();
    }
  }, [isComplete, productionTarget]);

  if (!productionTarget) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Target className={`w-5 h-5 ${isComplete ? 'text-green-400' : 'text-cyan-400'}`} />
          <span className="text-white font-medium text-sm">Daily Target</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${isComplete ? 'text-green-400' : 'text-cyan-400'}`}>
            {progress.toFixed(0)}%
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Progress bar always visible */}
      <div className="px-3 pb-2">
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress)}%` }}
            transition={{ duration: 0.5 }}
            className={`h-full rounded-full ${isComplete ? 'bg-green-500' : isOnTrack ? 'bg-cyan-500' : 'bg-amber-500'}`}
          />
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-slate-800 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Bags Produced</span>
                <span className="text-white font-mono">
                  {productionTarget.producedBags.toLocaleString()} /{' '}
                  {productionTarget.targetBags.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Total Ever</span>
                <span className="text-cyan-400 font-mono">
                  {totalBagsProduced.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Status</span>
                <span
                  className={`font-medium ${isComplete ? 'text-green-400' : isOnTrack ? 'text-cyan-400' : 'text-amber-400'}`}
                >
                  {isComplete ? 'Completed!' : isOnTrack ? 'On Track' : 'Behind Schedule'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Achievements Panel
export const AchievementsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const achievements = useProductionStore((state) => state.achievements);
  const resetAchievements = useProductionStore((state) => state.resetAchievements);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'safety':
        return 'text-green-400 bg-green-500/20';
      case 'production':
        return 'text-blue-400 bg-blue-500/20';
      case 'quality':
        return 'text-purple-400 bg-purple-500/20';
      case 'teamwork':
        return 'text-amber-400 bg-amber-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Shield':
        return Shield;
      case 'Package':
        return Package;
      case 'Award':
        return Award;
      case 'Users':
        return Users;
      case 'TrendingUp':
        return TrendingUp;
      case 'Moon':
        return Moon;
      case 'Siren':
        return AlertTriangle; // Using AlertTriangle as Siren fallback
      case 'Boxes':
        return Package; // Using Package as Boxes fallback
      default:
        return Trophy;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      className="fixed top-20 right-4 w-80 bg-slate-900/98 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl z-50 flex flex-col max-h-[70vh] pointer-events-auto overflow-hidden"
    >
      {/* Header - draggable area */}
      <div className="flex items-center justify-between p-3 border-b border-slate-800 cursor-move">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <h2 className="text-base font-bold text-white">Achievements</h2>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Achievement list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {achievements.map((achievement: any) => {
          const IconComponent = getIconComponent(achievement.icon);
          const isUnlocked = !!achievement.unlockedAt;
          const progress =
            achievement.progress ?? (achievement.currentValue / achievement.requirement) * 100;

          return (
            <div
              key={achievement.id}
              className={`p-3 rounded-xl border ${isUnlocked ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-slate-700 bg-slate-800/50'}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(achievement.category)}`}
                >
                  <IconComponent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium text-sm">{achievement.name}</h3>
                    {isUnlocked && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">{achievement.description}</p>

                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-slate-500">Progress</span>
                      <span className="text-slate-400">
                        {achievement.currentValue} / {achievement.requirement}
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isUnlocked ? 'bg-yellow-500' : 'bg-cyan-500'}`}
                        style={{ width: `${Math.min(100, progress)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer with reset button */}
      <div className="p-2 border-t border-slate-800 flex justify-end">
        <button
          onClick={resetAchievements}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
          title="Reset all achievements"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>
    </motion.div>
  );
};

// Worker Leaderboard Panel
export const WorkerLeaderboard: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const workerLeaderboard = useProductionStore((state) => state.workerLeaderboard);
  const workers = useProductionStore((state) => state.workers);
  const updateWorkerScore = useProductionStore((state) => state.updateWorkerScore);

  // Derive leaderboard from actual workers in the store
  useEffect(() => {
    if (workers.length > 0) {
      // Calculate scores based on worker data: experience, current task, and role
      workers.forEach((worker) => {
        // Base score from experience (years * 100)
        const experienceScore = (worker.experience || 1) * 100;

        // Bonus for currently working (not on break)
        const activityBonus =
          worker.status === 'working' ? 150 : worker.status === 'responding' ? 100 : 0;

        // Role-based multiplier
        const roleMultiplier: Record<string, number> = {
          Supervisor: 1.3,
          Engineer: 1.2,
          'Safety Officer': 1.15,
          'Quality Control': 1.1,
          Maintenance: 1.05,
          Operator: 1.0,
        };
        const multiplier = roleMultiplier[worker.role] || 1.0;

        // Calculate total score
        const totalScore = Math.round((experienceScore + activityBonus) * multiplier);

        // Estimate tasks completed based on experience and current activity
        const tasksCompleted = Math.round(
          (worker.experience || 1) * 8 + (worker.status === 'working' ? 5 : 0)
        );

        updateWorkerScore(worker.id, worker.name, totalScore, tasksCompleted);
      });
    } else if (workerLeaderboard.length === 0) {
      // Fallback only if no workers exist in store at all
      const fallbackWorkers = [
        { id: 'w1', name: 'Marcus Chen', score: 850, tasks: 32 },
        { id: 'w2', name: 'Sarah Mitchell', score: 780, tasks: 28 },
        { id: 'w3', name: 'James Rodriguez', score: 720, tasks: 25 },
      ];
      fallbackWorkers.forEach((w) => updateWorkerScore(w.id, w.name, w.score, w.tasks));
    }
  }, [workers, updateWorkerScore, workerLeaderboard.length]);

  const getRankStyle = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 2:
        return 'bg-slate-400/20 text-slate-300 border-slate-400/50';
      case 3:
        return 'bg-amber-600/20 text-amber-500 border-amber-600/50';
      default:
        return 'bg-slate-800/50 text-slate-400 border-slate-700';
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank <= 3) {
      return (
        <Medal
          className={`w-4 h-4 ${rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : 'text-amber-500'}`}
        />
      );
    }
    return <span className="text-xs font-mono">{rank}</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      className="fixed top-24 right-4 w-80 bg-slate-900/98 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl z-50 flex flex-col max-h-[60vh] pointer-events-auto"
    >
      {/* Header - draggable area */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800 cursor-move">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white">Leaderboard</h2>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Leaderboard list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {workerLeaderboard.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">No leaderboard data yet</div>
        ) : (
          workerLeaderboard.map((worker, index) => (
            <div
              key={worker.workerId}
              className={`flex items-center gap-3 p-2 rounded-lg border ${getRankStyle(index + 1)}`}
            >
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                {getRankIcon(index + 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{worker.name}</div>
                <div className="text-[10px] text-slate-500">{worker.tasksCompleted} tasks</div>
              </div>
              <div className="text-right">
                <div className="text-cyan-400 font-mono font-bold text-sm">{worker.score}</div>
                <div className="text-[10px] text-slate-500">pts</div>
              </div>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
};

// Mini-Map Component
export const MiniMap: React.FC = () => {
  const { showMiniMap, setShowMiniMap } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
    }))
  );
  const [positions, setPositions] = useState<{
    workers: EntityPosition[];
    forklifts: EntityPosition[];
  }>({ workers: [], forklifts: [] });

  useEffect(() => {
    if (!showMiniMap) return;

    // PERFORMANCE FIX: Reduced from 100ms (10Hz) to 500ms (2Hz)
    // 10Hz was excessive for a mini map - 2Hz is sufficient
    const interval = setInterval(() => {
      setPositions({
        workers: positionRegistry.getAllWorkers(),
        forklifts: positionRegistry.getAllForklifts(),
      });
    }, 500);

    return () => clearInterval(interval);
  }, [showMiniMap]);

  if (!showMiniMap) return null;

  const mapScale = 3; // Pixels per meter
  const mapWidth = 180;
  const mapHeight = 140;
  const offsetX = mapWidth / 2;
  const offsetZ = mapHeight / 2;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      drag
      dragMomentum={false}
      dragElastic={0}
      className="fixed bottom-4 right-4 z-[100] pointer-events-auto cursor-move"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center gap-2">
            <Map className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-white">GPS Tracking</span>
          </div>
          <button
            onClick={() => setShowMiniMap(false)}
            className="w-5 h-5 rounded flex items-center justify-center hover:bg-slate-700 transition-colors"
          >
            <X className="w-3 h-3 text-slate-400" />
          </button>
        </div>

        {/* Map area */}
        <div className="relative bg-slate-950" style={{ width: mapWidth, height: mapHeight }}>
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-20">
            {[0, 1, 2, 3].map((i) => (
              <React.Fragment key={i}>
                <div
                  className="absolute w-px bg-slate-600"
                  style={{ left: `${(i + 1) * 25}%`, top: 0, bottom: 0 }}
                />
                <div
                  className="absolute h-px bg-slate-600"
                  style={{ top: `${(i + 1) * 25}%`, left: 0, right: 0 }}
                />
              </React.Fragment>
            ))}
          </div>

          {/* Zone indicators */}
          <div className="absolute left-2 top-2 text-[8px] text-slate-500">Silos</div>
          <div className="absolute left-2 top-1/4 text-[8px] text-slate-500">Mills</div>
          <div className="absolute left-2 bottom-1/4 text-[8px] text-slate-500">Sifters</div>
          <div className="absolute left-2 bottom-2 text-[8px] text-slate-500">Packers</div>

          {/* Workers */}
          {positions.workers.map((worker) => (
            <div
              key={worker.id}
              className="absolute w-2 h-2 rounded-full bg-green-500 border border-green-300"
              style={{
                left: offsetX + (worker.x * mapScale) / 2,
                top: offsetZ - (worker.z * mapScale) / 2,
                transform: 'translate(-50%, -50%)',
              }}
              title={worker.id}
            />
          ))}

          {/* Forklifts */}
          {positions.forklifts.map((forklift) => (
            <div
              key={forklift.id}
              className="absolute"
              style={{
                left: offsetX + (forklift.x * mapScale) / 2,
                top: offsetZ - (forklift.z * mapScale) / 2,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-3 h-3 bg-amber-500 rounded-sm border border-amber-300" />
              {/* Direction indicator */}
              {forklift.dirX !== undefined && forklift.dirZ !== undefined && (
                <div
                  className="absolute w-0.5 h-2 bg-amber-300"
                  style={{
                    left: '50%',
                    top: '50%',
                    transformOrigin: 'center top',
                    transform: `translateX(-50%) rotate(${Math.atan2(forklift.dirX, -forklift.dirZ) * (180 / Math.PI)}deg)`,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 px-3 py-1.5 border-t border-slate-800 bg-slate-800/30">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-[9px] text-slate-400">Workers</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-amber-500 rounded-sm" />
            <span className="text-[9px] text-slate-400">Forklifts</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// Screenshot/Export Button Component
export const ScreenshotButton: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);

  const handleScreenshot = async () => {
    setIsExporting(true);

    try {
      // Find the canvas element
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        console.error('No canvas found');
        return;
      }

      // Create a link and download
      const link = document.createElement('a');
      link.download = `millos-screenshot-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Screenshot failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportReport = () => {
    const store = useProductionStore.getState();
    const safetyStore = useSafetyStore.getState();

    const report = {
      timestamp: new Date().toISOString(),
      metrics: store.metrics,
      safetyMetrics: safetyStore.safetyMetrics,
      productionTarget: store.productionTarget,
      totalBagsProduced: store.totalBagsProduced,
      achievements: store.achievements.filter((a) => a.unlockedAt),
      safetyIncidents: safetyStore.safetyIncidents.slice(0, 20),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `millos-report-${new Date().toISOString().split('T')[0]}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  return (
    <div className="flex gap-1">
      <button
        onClick={handleScreenshot}
        disabled={isExporting}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors disabled:opacity-50"
        title="Take Screenshot"
      >
        <Image className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Screenshot</span>
      </button>
      <button
        onClick={handleExportReport}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
        title="Export Report"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Export</span>
      </button>
    </div>
  );
};

// Incident Replay Controls - optimized with shallow selector to prevent re-render cascades
export const IncidentReplayControls: React.FC = () => {
  const {
    replayMode,
    replayFrames,
    currentReplayIndex,
    setReplayMode,
    setReplayIndex,
    clearReplayFrames,
  } = useProductionStore(
    useShallow((state) => ({
      replayMode: state.replayMode,
      replayFrames: state.replayFrames,
      currentReplayIndex: state.currentReplayIndex,
      setReplayMode: state.setReplayMode,
      setReplayIndex: state.setReplayIndex,
      clearReplayFrames: state.clearReplayFrames,
    }))
  );

  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying || !replayMode) return;

    const interval = setInterval(() => {
      setReplayIndex((currentReplayIndex + 1) % replayFrames.length);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, replayMode, currentReplayIndex, replayFrames.length, setReplayIndex]);

  // Memoized handlers to prevent re-renders
  const handleSkipBack = useCallback(() => {
    setReplayIndex(Math.max(0, currentReplayIndex - 10));
  }, [setReplayIndex, currentReplayIndex]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSkipForward = useCallback(() => {
    setReplayIndex(Math.min(replayFrames.length - 1, currentReplayIndex + 10));
  }, [setReplayIndex, replayFrames.length, currentReplayIndex]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setReplayIndex(parseInt(e.target.value));
    },
    [setReplayIndex]
  );

  const handleExitReplay = useCallback(() => {
    setReplayMode(false);
    clearReplayFrames();
  }, [setReplayMode, clearReplayFrames]);

  if (!replayMode) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-xl border border-red-500/30 px-4 py-3 shadow-2xl">
        <div className="flex items-center gap-4">
          {/* Label */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 font-medium text-sm">Replay Mode</span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkipBack}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={handleTogglePlay}
              className="w-10 h-10 rounded-lg bg-red-600 hover:bg-red-500 text-white flex items-center justify-center"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={handleSkipForward}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Timeline */}
          <div className="flex-1 min-w-[150px]">
            <label htmlFor="replay-timeline" className="sr-only">
              Replay timeline
            </label>
            <input
              id="replay-timeline"
              type="range"
              min={0}
              max={replayFrames.length - 1}
              value={currentReplayIndex}
              onChange={handleSliderChange}
              aria-label="Incident replay timeline"
              aria-valuemin={0}
              aria-valuemax={replayFrames.length - 1}
              aria-valuenow={currentReplayIndex}
              aria-valuetext={`Frame ${currentReplayIndex + 1} of ${replayFrames.length}`}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>Frame {currentReplayIndex + 1}</span>
              <span>{replayFrames.length} total</span>
            </div>
          </div>

          {/* Exit button */}
          <button
            onClick={handleExitReplay}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"
          >
            Exit Replay
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// Quick Actions Bar for Gamification - optimized with shallow selector
export const GamificationBar: React.FC = () => {
  const [showAchievements, setShowAchievements] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const { showMiniMap, setShowMiniMap, showGamificationBar, setShowGamificationBar } = useUIStore(
    useShallow((state) => ({
      showMiniMap: state.showMiniMap,
      setShowMiniMap: state.setShowMiniMap,
      showGamificationBar: state.showGamificationBar,
      setShowGamificationBar: state.setShowGamificationBar,
    }))
  );
  const achievements = useProductionStore((state) => state.achievements);

  const unlockedCount = achievements.filter((a) => a.unlockedAt).length;

  // Memoized handlers to prevent re-renders
  const handleHideBar = useCallback(() => setShowGamificationBar(false), [setShowGamificationBar]);
  const handleToggleAchievements = useCallback(() => setShowAchievements((prev) => !prev), []);
  const handleToggleLeaderboard = useCallback(() => setShowLeaderboard((prev) => !prev), []);
  const handleToggleMiniMap = useCallback(
    () => setShowMiniMap(!showMiniMap),
    [setShowMiniMap, showMiniMap]
  );

  // Return null when bar is hidden - the Zap button is now in CollapsibleLegend
  if (!showGamificationBar) {
    return null;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        drag
        dragMomentum={false}
        dragElastic={0}
        className="fixed right-4 top-1/2 -translate-y-1/2 z-30 pointer-events-auto cursor-move"
      >
        <div className="flex flex-col gap-2 bg-slate-900/90 backdrop-blur-xl rounded-xl border border-slate-700/50 p-2">
          {/* Close button */}
          <button
            onClick={handleHideBar}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white"
            title="Close Quick Actions"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="border-t border-slate-700 my-1" />
          {/* Achievements */}
          <button
            onClick={handleToggleAchievements}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative ${
              showAchievements
                ? 'bg-yellow-600 text-white'
                : 'bg-slate-800 text-yellow-400 hover:bg-slate-700'
            }`}
            title="Achievements"
          >
            <Trophy className="w-5 h-5" />
            {unlockedCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {unlockedCount}
              </span>
            )}
          </button>

          {/* Leaderboard */}
          <button
            onClick={handleToggleLeaderboard}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              showLeaderboard
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-cyan-400 hover:bg-slate-700'
            }`}
            title="Leaderboard"
          >
            <TrendingUp className="w-5 h-5" />
          </button>

          {/* Replay/History - Moved here from 'R' key */}
          <button
            onClick={() => {
              const playbackStore = useHistoricalPlaybackStore.getState();
              if (playbackStore.isReplaying) {
                playbackStore.exitReplayMode();
              } else {
                playbackStore.enterReplayMode();
              }
            }}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              useHistoricalPlaybackStore.getState().isReplaying
                ? 'bg-red-600 text-white'
                : 'bg-slate-800 text-red-400 hover:bg-slate-700'
            }`}
            title="Replay History"
          >
            <History className="w-5 h-5" />
          </button>

          {/* Mini-map toggle */}
          <button
            onClick={handleToggleMiniMap}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              showMiniMap
                ? 'bg-green-600 text-white'
                : 'bg-slate-800 text-green-400 hover:bg-slate-700'
            }`}
            title="GPS Map"
          >
            <Map className="w-5 h-5" />
          </button>

          {/* Screenshot/Export */}
          <div className="pt-2 border-t border-slate-700">
            <ScreenshotButton />
          </div>
        </div>
      </motion.div>

      {/* Panels */}
      <AnimatePresence>
        {showAchievements && <AchievementsPanel onClose={() => setShowAchievements(false)} />}
        {showLeaderboard && <WorkerLeaderboard onClose={() => setShowLeaderboard(false)} />}
      </AnimatePresence>
    </>
  );
};
