import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Star, Award, Target } from 'lucide-react';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useShallow } from 'zustand/react/shallow';
import { ConfettiBurst } from './ConfettiBurst';
import { audioManager } from '../utils/audioManager';

// Production milestone thresholds
const MILESTONES = [100, 500, 1000, 5000, 10000, 25000, 50000, 100000];

export const CelebrationSystem: React.FC = () => {
  const [activeConfetti, setActiveConfetti] = useState<
    Array<{ id: string; position: [number, number, number] }>
  >([]);
  const [milestoneDisplay, setMilestoneDisplay] = useState<{
    value: number;
    show: boolean;
  } | null>(null);

  const { celebrations, triggerCelebration, clearCelebration } = useGameSimulationStore();
  const { totalBagsProduced, productionTarget, addAnnouncement } = useProductionStore(
    useShallow((state) => ({
      totalBagsProduced: state.totalBagsProduced,
      productionTarget: state.productionTarget,
      addAnnouncement: state.addAnnouncement,
    }))
  );
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const playCelebrationSound = useCallback((type: 'milestone' | 'safety' | 'target') => {
    if (type === 'milestone') {
      audioManager.playAISuccess();
      return;
    }
    if (type === 'safety') {
      audioManager.playShiftBell();
      return;
    }
    audioManager.playVictoryFanfare();
  }, []);

  // Track previous values to detect changes
  const [prevBagsProduced, setPrevBagsProduced] = useState(0);
  const [prevDaysSinceIncident, setPrevDaysSinceIncident] = useState(0);

  // Check for production milestones
  useEffect(() => {
    if (totalBagsProduced <= prevBagsProduced) {
      setPrevBagsProduced(totalBagsProduced);
      return;
    }

    // Check if we crossed any milestone
    const crossedMilestone = MILESTONES.find(
      (milestone) =>
        totalBagsProduced >= milestone &&
        prevBagsProduced < milestone &&
        milestone > celebrations.lastMilestone
    );

    if (crossedMilestone) {
      // Trigger celebration
      triggerCelebration('milestone', {
        value: crossedMilestone,
        message: `${crossedMilestone.toLocaleString()} BAGS!`,
      });

      // Show milestone display
      setMilestoneDisplay({ value: crossedMilestone, show: true });

      // Play celebration sound
      playCelebrationSound('milestone');

      // Spawn confetti at packer area
      const confettiId = `confetti-${Date.now()}`;
      setActiveConfetti((prev) => [
        ...prev,
        { id: confettiId, position: [0, 8, 20] }, // Packer zone
      ]);

      // PA announcement
      const messages = [
        `Congratulations team! ${crossedMilestone.toLocaleString()} bags and counting!`,
        `Production milestone reached: ${crossedMilestone.toLocaleString()} bags! Outstanding work!`,
        `${crossedMilestone.toLocaleString()} bags produced! The team is on fire!`,
        `Milestone alert: ${crossedMilestone.toLocaleString()} bags! Excellent performance!`,
      ];
      addAnnouncement({
        type: 'success',
        message: messages[Math.floor(Math.random() * messages.length)],
        priority: 3,
      });

      // Hide milestone display after animation
      setTimeout(() => {
        setMilestoneDisplay((prev) => (prev?.value === crossedMilestone ? null : prev));
        clearCelebration();
      }, 4000);
    }

    setPrevBagsProduced(totalBagsProduced);
  }, [
    totalBagsProduced,
    prevBagsProduced,
    celebrations.lastMilestone,
    triggerCelebration,
    clearCelebration,
    addAnnouncement,
    playCelebrationSound,
  ]);

  // Check for zero-incident milestones
  useEffect(() => {
    const daysSinceIncident = safetyMetrics.daysSinceIncident;

    // Trigger celebration at certain thresholds: 7, 30, 100, 365 days
    const safetyMilestones = [7, 30, 100, 365];
    const crossedSafetyMilestone = safetyMilestones.find(
      (milestone) => daysSinceIncident >= milestone && prevDaysSinceIncident < milestone
    );

    if (crossedSafetyMilestone) {
      triggerCelebration('zero_incident', {
        value: crossedSafetyMilestone,
        message: `${crossedSafetyMilestone} days incident-free!`,
      });

      // Play celebration sound
      playCelebrationSound('safety');

      // Spawn confetti
      const confettiId = `confetti-${Date.now()}`;
      setActiveConfetti((prev) => [...prev, { id: confettiId, position: [0, 5, 0] }]);

      // PA announcement
      const messages = [
        `${crossedSafetyMilestone} days without incident! Great job everyone!`,
        `Safety milestone: ${crossedSafetyMilestone} incident-free days! Keep it up!`,
        `Celebrating ${crossedSafetyMilestone} days of zero incidents. Outstanding safety record!`,
      ];
      addAnnouncement({
        type: 'success',
        message: messages[Math.floor(Math.random() * messages.length)],
        priority: 3,
      });

      setTimeout(() => clearCelebration(), 4000);
    }

    setPrevDaysSinceIncident(daysSinceIncident);
  }, [
    safetyMetrics.daysSinceIncident,
    prevDaysSinceIncident,
    triggerCelebration,
    clearCelebration,
    addAnnouncement,
    playCelebrationSound,
  ]);

  // ========================================
  // ACHIEVEMENT PROGRESS TRACKING
  // ========================================
  const {
    updateAchievementProgress,
    unlockAchievement,
    achievements,
    metrics,
    workerSatisfaction,
  } = useProductionStore(
    useShallow((state) => ({
      updateAchievementProgress: state.updateAchievementProgress,
      unlockAchievement: state.unlockAchievement,
      achievements: state.achievements,
      metrics: state.metrics,
      workerSatisfaction: state.workerSatisfaction,
    }))
  );
  const { currentShift, emergencyActive } = useGameSimulationStore(
    useShallow((state) => ({
      currentShift: state.currentShift,
      emergencyActive: state.emergencyActive,
    }))
  );

  // Refs to track sustained performance (persists between renders)
  const qualityStreakRef = React.useRef(0);
  const efficiencyStreakRef = React.useRef(0);
  const prevShiftRef = React.useRef(currentShift);
  const hadEmergencyRef = React.useRef(false);

  // Track achievement progress based on game state
  useEffect(() => {
    const interval = setInterval(() => {
      // Achievement-specific dry humor announcements (with clear prefix)
      const achievementMessages: Record<string, string[]> = {
        'bags-1k': [
          'ACHIEVEMENT UNLOCKED: Getting Started! A thousand bags. Only 999,000 more until we can call ourselves "prolific."',
          'ACHIEVEMENT UNLOCKED: Getting Started! The machines barely noticed. Neither did management. But here is a badge anyway.',
          'ACHIEVEMENT UNLOCKED: Getting Started! Yes, we set the bar low on purpose. You are welcome.',
          'ACHIEVEMENT UNLOCKED: Getting Started! At this rate, we will fill the warehouse by... eventually.',
        ],
        'bags-10k': [
          'ACHIEVEMENT UNLOCKED: Production Pro! Ten thousand bags. The warehouse is starting to look like a bag convention.',
          'ACHIEVEMENT UNLOCKED: Production Pro! Our packing machines are now questioning their life choices.',
          'ACHIEVEMENT UNLOCKED: Production Pro! That is a lot of flour. Like, a concerning amount.',
        ],
        'safety-5': [
          'ACHIEVEMENT UNLOCKED: Safety First! Five whole days without anyone tripping over their own shoelaces. Remarkable.',
          'ACHIEVEMENT UNLOCKED: Safety First! The safety inspector is crying tears of joy. Or disbelief. Hard to tell.',
          'ACHIEVEMENT UNLOCKED: Safety First! We have officially gone a work week without disaster.',
        ],
        'efficiency-sustained': [
          'ACHIEVEMENT UNLOCKED: Steady Runner! Ten minutes of 90% uptime. The machines are impressed with themselves.',
          'ACHIEVEMENT UNLOCKED: Steady Runner! Consistent performance for a whole 10 minutes. A new record around here.',
          'ACHIEVEMENT UNLOCKED: Steady Runner! The equipment decided to take its job seriously. Temporarily.',
        ],
        'quality-streak': [
          'ACHIEVEMENT UNLOCKED: Quality Streak! Five minutes of 95% quality. Our flour is officially "pretty good."',
          'ACHIEVEMENT UNLOCKED: Quality Streak! The lab is proud. The bar was low, but we cleared it with enthusiasm.',
          'ACHIEVEMENT UNLOCKED: Quality Streak! Consistent quality for 5 whole minutes. Customer complaints at an all-time low.',
        ],
        'team-player': [
          'ACHIEVEMENT UNLOCKED: Team Player! Ten whole conversations. HR is thrilled. The introverts are exhausted.',
          'ACHIEVEMENT UNLOCKED: Team Player! Workers talked to each other instead of the machines. Progress.',
          'ACHIEVEMENT UNLOCKED: Team Player! Proof that our staff can communicate without email. Barely.',
        ],
        'night-owl': [
          'ACHIEVEMENT UNLOCKED: Night Owl! Survived a night shift. Coffee sales have spiked accordingly.',
          'ACHIEVEMENT UNLOCKED: Night Owl! The graveyard shift is complete. The ghosts say hello.',
          'ACHIEVEMENT UNLOCKED: Night Owl! Working while sensible people sleep. Management approves.',
        ],
        'first-emergency': [
          'ACHIEVEMENT UNLOCKED: Crisis Manager! Handled your first emergency. The panic was entirely professional.',
          'ACHIEVEMENT UNLOCKED: Crisis Manager! When everything went wrong, you were there. Mostly.',
          'ACHIEVEMENT UNLOCKED: Crisis Manager! Emergency survived. Stress levels returning to merely "high."',
        ],
      };

      const announceUnlock = (achievementId: string, fallbackName: string) => {
        const messages = achievementMessages[achievementId] || [
          `ACHIEVEMENT UNLOCKED: ${fallbackName}! Congratulations, we suppose.`,
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];
        addAnnouncement({
          type: 'success',
          message,
          priority: 3,
        });
        playCelebrationSound('milestone');
      };

      // 1. "Getting Started" - bags produced (ID: bags-1k)
      const bagsAchievement = achievements.find((a) => a.id === 'bags-1k');
      if (bagsAchievement && !bagsAchievement.unlockedAt) {
        updateAchievementProgress('bags-1k', totalBagsProduced);
        if (totalBagsProduced >= bagsAchievement.target) {
          unlockAchievement('bags-1k');
          announceUnlock('bags-1k', 'Getting Started');
        }
      }

      // 2. "Production Pro" - 10,000 bags (ID: bags-10k)
      const bags10kAchievement = achievements.find((a) => a.id === 'bags-10k');
      if (bags10kAchievement && !bags10kAchievement.unlockedAt) {
        updateAchievementProgress('bags-10k', totalBagsProduced);
        if (totalBagsProduced >= bags10kAchievement.target) {
          unlockAchievement('bags-10k');
          announceUnlock('bags-10k', 'Production Pro');
        }
      }

      // 3. "Safety First" - days without incident (ID: safety-5)
      const safetyAchievement = achievements.find((a) => a.id === 'safety-5');
      if (safetyAchievement && !safetyAchievement.unlockedAt) {
        updateAchievementProgress('safety-5', safetyMetrics.daysSinceIncident);
        if (safetyMetrics.daysSinceIncident >= safetyAchievement.target) {
          unlockAchievement('safety-5');
          announceUnlock('safety-5', 'Safety First');
        }
      }

      // 4. "Steady Runner" - sustained 90% uptime (ID: efficiency-sustained)
      const efficiencyAchievement = achievements.find((a) => a.id === 'efficiency-sustained');
      if (efficiencyAchievement && !efficiencyAchievement.unlockedAt) {
        if (metrics.uptime >= 90) {
          efficiencyStreakRef.current += 1;
        } else {
          efficiencyStreakRef.current = 0; // Reset if drops below
        }
        updateAchievementProgress('efficiency-sustained', efficiencyStreakRef.current);
        if (efficiencyStreakRef.current >= efficiencyAchievement.target) {
          unlockAchievement('efficiency-sustained');
          announceUnlock('efficiency-sustained', 'Steady Runner');
        }
      }

      // 5. "Quality Streak" - sustained 95% quality (ID: quality-streak)
      const qualityAchievement = achievements.find((a) => a.id === 'quality-streak');
      if (qualityAchievement && !qualityAchievement.unlockedAt) {
        if (metrics.quality >= 95) {
          qualityStreakRef.current += 1;
        } else {
          qualityStreakRef.current = 0; // Reset if drops below
        }
        updateAchievementProgress('quality-streak', qualityStreakRef.current);
        if (qualityStreakRef.current >= qualityAchievement.target) {
          unlockAchievement('quality-streak');
          announceUnlock('quality-streak', 'Quality Streak');
        }
      }

      // 6. "Team Player" - worker collaborations (ID: team-player)
      const teamAchievement = achievements.find((a) => a.id === 'team-player');
      if (teamAchievement && !teamAchievement.unlockedAt) {
        updateAchievementProgress('team-player', workerSatisfaction.conversationCount);
        if (workerSatisfaction.conversationCount >= teamAchievement.target) {
          unlockAchievement('team-player');
          announceUnlock('team-player', 'Team Player');
        }
      }

      // 7. "Night Owl" - complete a night shift (ID: night-owl)
      const nightAchievement = achievements.find((a) => a.id === 'night-owl');
      if (nightAchievement && !nightAchievement.unlockedAt) {
        // Detect shift change from night to morning
        if (prevShiftRef.current === 'night' && currentShift === 'morning') {
          updateAchievementProgress('night-owl', 1);
          unlockAchievement('night-owl');
          announceUnlock('night-owl', 'Night Owl');
        }
        prevShiftRef.current = currentShift;
      }

      // 8. "Crisis Manager" - handle first emergency (ID: first-emergency)
      const crisisAchievement = achievements.find((a) => a.id === 'first-emergency');
      if (crisisAchievement && !crisisAchievement.unlockedAt) {
        // Track if emergency started
        if (emergencyActive) {
          hadEmergencyRef.current = true;
        }
        // Unlock when emergency ends
        if (hadEmergencyRef.current && !emergencyActive) {
          updateAchievementProgress('first-emergency', 1);
          unlockAchievement('first-emergency');
          announceUnlock('first-emergency', 'Crisis Manager');
          hadEmergencyRef.current = false;
        }
      }
    }, 60000); // Check every 60 seconds (1 minute) for sustained metrics

    return () => clearInterval(interval);
  }, [
    totalBagsProduced,
    safetyMetrics.daysSinceIncident,
    metrics.uptime,
    metrics.quality,
    workerSatisfaction.conversationCount,
    currentShift,
    emergencyActive,
    achievements,
    updateAchievementProgress,
    unlockAchievement,
    addAnnouncement,
    playCelebrationSound,
  ]);

  // Check for daily target completion
  useEffect(() => {
    if (!productionTarget) return;

    if (productionTarget.status === 'completed' && productionTarget.producedBags > 0) {
      const wasJustCompleted =
        productionTarget.producedBags >= productionTarget.targetBags &&
        productionTarget.producedBags - 1 < productionTarget.targetBags;

      if (wasJustCompleted) {
        triggerCelebration('target_met', {
          message: 'Daily target achieved!',
        });

        // Play celebration sound
        playCelebrationSound('target');

        // Spawn confetti
        const confettiId = `confetti-${Date.now()}`;
        setActiveConfetti((prev) => [...prev, { id: confettiId, position: [0, 6, 0] }]);

        // PA announcement
        addAnnouncement({
          type: 'success',
          message: 'Daily production target achieved! Fantastic work team!',
          priority: 3,
        });

        setTimeout(() => clearCelebration(), 4000);
      }
    }
  }, [
    productionTarget,
    triggerCelebration,
    clearCelebration,
    addAnnouncement,
    playCelebrationSound,
  ]);

  // Remove confetti after animation
  const handleConfettiComplete = useCallback((id: string) => {
    setActiveConfetti((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Get milestone icon and color
  const getMilestoneIcon = () => {
    if (!milestoneDisplay) return null;

    const { value } = milestoneDisplay;
    if (value >= 10000) return { Icon: Trophy, color: 'text-yellow-400' };
    if (value >= 1000) return { Icon: Star, color: 'text-cyan-400' };
    if (value >= 500) return { Icon: Award, color: 'text-orange-400' };
    return { Icon: Target, color: 'text-green-400' };
  };

  const iconData = getMilestoneIcon();

  return (
    <>
      {/* 3D Confetti Bursts */}
      {activeConfetti.map((confetti) => (
        <ConfettiBurst
          key={confetti.id}
          position={confetti.position}
          count={150}
          duration={3.5}
          onComplete={() => handleConfettiComplete(confetti.id)}
        />
      ))}

      {/* Milestone Display Overlay */}
      <AnimatePresence>
        {milestoneDisplay?.show && iconData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.5, y: -50 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
          >
            <div className="relative">
              {/* Glow effect */}
              <motion.div
                className="absolute inset-0 bg-yellow-400/30 blur-3xl"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />

              {/* Main content */}
              <div className="relative bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-xl rounded-3xl border-4 border-yellow-400/50 shadow-2xl p-12">
                <motion.div
                  className="text-center"
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <motion.div
                    initial={{ rotate: -180, scale: 0 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="mb-4"
                  >
                    <iconData.Icon className={`w-24 h-24 mx-auto ${iconData.color}`} />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <h2 className="text-6xl font-black text-white mb-4">
                      {milestoneDisplay.value.toLocaleString()}
                    </h2>
                    <p className="text-3xl font-bold text-yellow-400 mb-2">BAGS!</p>
                    <p className="text-xl text-slate-300">Production Milestone</p>
                  </motion.div>
                </motion.div>

                {/* Particle effects around border */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-3 h-3 bg-yellow-400 rounded-full"
                    style={{
                      top: '50%',
                      left: '50%',
                    }}
                    animate={{
                      x: [0, Math.cos((i / 8) * Math.PI * 2) * 200],
                      y: [0, Math.sin((i / 8) * Math.PI * 2) * 200],
                      opacity: [1, 0],
                      scale: [1, 0.5],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
