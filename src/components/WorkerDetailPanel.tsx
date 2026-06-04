import React, { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Briefcase,
  FlaskConical,
  HardHat,
  Shield,
  User,
  Wrench,
  Star,
  TrendingUp,
  Award,
  ChevronDown,
  ChevronUp,
  Calendar,
  MessageSquare,
  Heart,
  Lightbulb,
  Handshake,
  AlertTriangle,
  ClipboardList,
  History,
  Check,
  X,
} from 'lucide-react';
import { WorkerData, PerformanceReview, SkillLevel } from '../types';
import { toSkillLevel } from '../utils/typeGuards';
import { getWorkerStatusBgClass } from '../utils/statusColors';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { useProductionStore } from '../stores/productionStore';
import { getWorkerPortrait } from '../utils/workerPortraits';
import { getWorkerComment } from '../stores/workerDialogueStore';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { useKnowledgeStore } from '../stores/knowledgeStore';

interface WorkerDetailPanelProps {
  worker: WorkerData;
  onClose: () => void;
  embedded?: boolean;
  onAssignTask?: (worker: WorkerData) => void;
  onViewHistory?: (worker: WorkerData) => void;
}

// Promotion level configuration
const PROMOTION_LEVELS: Record<number, { name: string; color: string }> = {
  0: { name: 'Junior', color: '#eab308' },
  1: { name: 'Regular', color: '#f97316' },
  2: { name: 'Senior', color: '#3b82f6' },
  3: { name: 'Lead', color: '#8b5cf6' },
  4: { name: 'Expert', color: '#dc2626' },
};

// Skill names for display
const SKILL_NAMES: Record<keyof NonNullable<WorkerData['skills']>, string> = {
  machineOperation: 'Machine Operation',
  safetyProtocols: 'Safety Protocols',
  qualityControl: 'Quality Control',
  troubleshooting: 'Troubleshooting',
  teamwork: 'Teamwork',
};

// Available tasks for assignment
const AVAILABLE_TASKS: { task: string; machine?: string; category: string }[] = [
  { task: 'Overseeing production line', category: 'Supervision' },
  { task: 'Calibrating Roller Mill', machine: 'roller-mill-1', category: 'Operations' },
  { task: 'Monitoring Silo levels', machine: 'silo-alpha', category: 'Operations' },
  { task: 'Testing flour samples', machine: 'qc-lab', category: 'Quality Control' },
  { task: 'Preventive maintenance', machine: 'packer-1', category: 'Maintenance' },
  { task: 'Safety inspection', category: 'Safety' },
  { task: 'Loading grain', machine: 'silo-gamma', category: 'Operations' },
  { task: 'Optimizing Plansifter', machine: 'plansifter-a', category: 'Operations' },
  { task: 'Operating Packer', machine: 'packer-2', category: 'Operations' },
  { task: 'Moisture analysis', machine: 'qc-lab', category: 'Quality Control' },
  { task: 'Break', category: 'Break' },
  { task: 'idle', category: 'Other' },
];

// Cache for generated data - persists across renders
const reviewCache = new Map<string, PerformanceReview[]>();
const skillCache = new Map<string, NonNullable<WorkerData['skills']>>();

// Generate deterministic performance reviews based on worker data (cached)
const generateReviews = (worker: WorkerData): PerformanceReview[] => {
  // Check cache first
  if (reviewCache.has(worker.id)) {
    return reviewCache.get(worker.id)!;
  }

  const reviews: PerformanceReview[] = [];
  const baseScore = 70 + worker.experience * 2;

  // Use worker ID hash for deterministic "randomness"
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const workerHash = hashCode(worker.id);

  // Generate reviews based on years of experience
  for (let i = 0; i < Math.min(worker.experience, 3); i++) {
    const year = new Date().getFullYear() - i - 1;
    // Deterministic score variance based on worker ID and year
    const scoreVariance = ((workerHash + year) % 15) - 5;

    reviews.push({
      id: `review-${worker.id}-${year}`,
      date: `${year}-12-15`,
      reviewer: i === 0 ? 'Sarah Mitchell' : i === 1 ? 'James Chen' : 'Maria Garcia',
      overallScore: Math.min(100, baseScore + scoreVariance),
      strengths: [
        worker.role === 'Safety Officer' ? 'Excellent safety awareness' : 'Strong technical skills',
        'Good communication',
        worker.experience > 3 ? 'Mentoring capabilities' : 'Quick learner',
      ].slice(0, 2 + (i % 2)),
      improvements: ['Time management', 'Documentation'].slice(0, 1 + (i % 2)),
      notes: `${worker.name} has shown consistent improvement throughout the year.`,
    });
  }

  // Cache the result
  reviewCache.set(worker.id, reviews);
  return reviews;
};

// Generate deterministic skills based on worker role and experience (cached)
const generateSkills = (worker: WorkerData): NonNullable<WorkerData['skills']> => {
  // Check cache first
  if (skillCache.has(worker.id)) {
    return skillCache.get(worker.id)!;
  }

  const baseLevel = toSkillLevel(Math.floor(worker.experience / 2) + 1);

  const roleBonus: Record<
    string,
    Partial<Record<keyof NonNullable<WorkerData['skills']>, number>>
  > = {
    Supervisor: { teamwork: 1, machineOperation: 0 },
    Engineer: { troubleshooting: 1, machineOperation: 1 },
    Operator: { machineOperation: 1 },
    'Safety Officer': { safetyProtocols: 2 },
    'Quality Control': { qualityControl: 2 },
    Maintenance: { troubleshooting: 1, machineOperation: 1 },
  };

  const bonus = roleBonus[worker.role] || {};

  const skills = {
    machineOperation: toSkillLevel(baseLevel + (bonus.machineOperation || 0)),
    safetyProtocols: toSkillLevel(baseLevel + (bonus.safetyProtocols || 0)),
    qualityControl: toSkillLevel(baseLevel + (bonus.qualityControl || 0)),
    troubleshooting: toSkillLevel(baseLevel + (bonus.troubleshooting || 0)),
    teamwork: toSkillLevel(baseLevel + (bonus.teamwork || 0)),
  };

  // Cache the result
  skillCache.set(worker.id, skills);
  return skills;
};

// Skill bar component
const SkillBar: React.FC<{ name: string; level: SkillLevel }> = ({ name, level }) => (
  <div className="flex items-center gap-2">
    <div className="w-24 text-xs text-slate-400 truncate">{name}</div>
    <div className="flex-1 flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i: number) => (
        <div
          key={i}
          className={`h-2 flex-1 rounded-sm ${i <= level ? 'bg-cyan-500' : 'bg-slate-700'}`}
        />
      ))}
    </div>
    <div className="w-4 text-xs text-slate-500 text-right">{level}</div>
  </div>
);

// Performance review card component
const ReviewCard: React.FC<{ review: PerformanceReview }> = ({ review }) => {
  const [expanded, setExpanded] = useState(false);
  const scoreColor =
    review.overallScore >= 85
      ? 'text-green-400'
      : review.overallScore >= 70
        ? 'text-cyan-400'
        : 'text-amber-400';

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-white">{new Date(review.date).getFullYear()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${scoreColor}`}>{review.overallScore}</span>
          <span className="text-xs text-slate-500">/100</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2 border-t border-slate-700/50 pt-2">
              <div className="text-[10px] text-slate-500">Reviewed by: {review.reviewer}</div>

              {/* Strengths */}
              <div>
                <div className="text-[10px] text-green-400 uppercase tracking-wider mb-1">
                  Strengths
                </div>
                <div className="flex flex-wrap gap-1">
                  {review.strengths.map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-green-500/20 text-green-300 text-[10px] rounded-full"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Improvements */}
              <div>
                <div className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">
                  Areas for Growth
                </div>
                <div className="flex flex-wrap gap-1">
                  {review.improvements.map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-[10px] rounded-full"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="flex items-start gap-2 mt-2">
                <MessageSquare className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />
                <p className="text-[10px] text-slate-400 italic">{review.notes}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const getWorkerIcon = (role: WorkerData['role']) => {
  const iconClass = 'w-8 h-8 text-white';
  switch (role) {
    case 'Supervisor':
      return <Briefcase className={iconClass} />;
    case 'Engineer':
      return <Wrench className={iconClass} />;
    case 'Operator':
      return <HardHat className={iconClass} />;
    case 'Safety Officer':
      return <Shield className={iconClass} />;
    case 'Quality Control':
      return <FlaskConical className={iconClass} />;
    case 'Maintenance':
      return <Wrench className={iconClass} />;
    default:
      return <User className={iconClass} />;
  }
};

export const WorkerDetailPanel: React.FC<WorkerDetailPanelProps> = ({
  worker,
  onClose,
  embedded = false,
  onAssignTask,
  onViewHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'skills' | 'reviews' | 'alignment'>(
    'overview'
  );
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Get worker portrait
  const portrait = useMemo(() => getWorkerPortrait(worker.id), [worker.id]);

  // Bilateral Alignment: Get worker mood/preferences from store
  const workerMood = useWorkerMoodStore((state) => state.workerMoods[worker.id]);

  // Production store for task assignment
  const updateWorkerTask = useProductionStore((state) => state.updateWorkerTask);

  useFocusTrap(panelRef as React.RefObject<HTMLElement>, !embedded, onClose);

  // Worker dialogue - get a random philosophical comment
  const workerDialogue = useMemo(() => {
    if (!FEATURE_FLAGS.WORKER_DIALOGUE_ENABLED) return null;
    // Get context-appropriate dialogue based on worker state
    const context: Parameters<typeof getWorkerComment>[0] = {};
    if (workerMood) {
      // Use satisfaction as a proxy for flourishing
      if (workerMood.satisfaction > 70) context.highFlourishing = true;
      if (workerMood.satisfaction < 40) context.lowFlourishing = true;
    }
    if (worker.experience >= 3) context.veteranWorker = true;
    if (worker.experience < 1) context.newWorker = true;
    return getWorkerComment(context);
  }, [worker.id, worker.experience, workerMood?.satisfaction]);

  // Link to related knowledge entry
  const { unlockEntry } = useKnowledgeStore();
  const handleDialogueLearnMore = useCallback(() => {
    if (workerDialogue?.relatedEntry) {
      unlockEntry(workerDialogue.relatedEntry);
    }
  }, [workerDialogue, unlockEntry]);

  // Button handlers
  const handleAssignTask = useCallback(() => {
    if (onAssignTask) {
      onAssignTask(worker);
    } else {
      // Toggle the task dropdown
      setShowTaskDropdown((prev) => !prev);
    }
  }, [worker, onAssignTask]);

  const handleSelectTask = useCallback(
    (task: string, machine?: string) => {
      updateWorkerTask(worker.id, task, machine);
      setShowTaskDropdown(false);
    },
    [worker.id, updateWorkerTask]
  );

  const handleViewHistory = useCallback(() => {
    if (onViewHistory) {
      onViewHistory(worker);
    } else {
      // Default behavior: switch to reviews tab
      setActiveTab('reviews');
    }
  }, [worker, onViewHistory]);

  // Derive promotion level from experience
  const promotionLevel = useMemo(() => {
    const exp = worker.experience || 0;
    if (exp >= 10) return 4;
    if (exp >= 5) return 3;
    if (exp >= 3) return 2;
    if (exp >= 1) return 1;
    return 0;
  }, [worker.experience]);

  const promotion = PROMOTION_LEVELS[promotionLevel];

  // Generate or use existing skills/reviews (cached for consistency)
  const skills = useMemo(() => worker.skills || generateSkills(worker), [worker]);
  const reviews = useMemo(() => worker.performanceReviews || generateReviews(worker), [worker]);

  // Calculate progress to next level based on experience (deterministic, not random)
  const progressToNextLevel = useMemo(() => {
    const exp = worker.experience || 0;
    // Each level requires ~2 years, progress within current level
    const yearsInLevel = exp % 2;
    return Math.round((yearsInLevel / 2) * 100);
  }, [worker.experience]);

  const statusBgClass = getWorkerStatusBgClass(worker.status);

  const getRoleColor = () => {
    switch (worker.role) {
      case 'Supervisor':
        return 'from-blue-500 to-blue-700';
      case 'Engineer':
        return 'from-purple-500 to-purple-700';
      case 'Operator':
        return 'from-orange-500 to-orange-700';
      case 'Safety Officer':
        return 'from-green-500 to-green-700';
      case 'Quality Control':
        return 'from-pink-500 to-pink-700';
      case 'Maintenance':
        return 'from-yellow-500 to-yellow-700';
      default:
        return 'from-gray-500 to-gray-700';
    }
  };

  const containerClasses = embedded
    ? 'w-full h-full flex flex-col bg-slate-900/50'
    : 'absolute bottom-6 left-6 w-96 z-20 max-h-[85vh] flex flex-col';

  const animationProps = embedded
    ? {}
    : {
        initial: { opacity: 0, y: 20, scale: 0.95 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 20, scale: 0.95 },
      };

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-modal={!embedded}
      aria-labelledby="worker-detail-title"
      className={containerClasses}
      {...animationProps}
    >
      <div
        className={`rounded-xl overflow-hidden flex flex-col ${embedded ? 'h-full bg-transparent' : 'bg-slate-900/95 backdrop-blur-xl border border-slate-600 shadow-2xl'}`}
      >
        {/* Header with gradient */}
        <div className={`bg-gradient-to-r ${getRoleColor()} p-4 relative flex-shrink-0`}>
          {!embedded && (
            <button
              onClick={onClose}
              aria-label={`Close ${worker.name} details`}
              className="absolute top-2 right-2 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center relative overflow-hidden">
              {portrait ? (
                <img
                  src={portrait}
                  alt={worker.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                getWorkerIcon(worker.role)
              )}
              {/* Promotion badge */}
              <div
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white/30"
                style={{ backgroundColor: promotion.color }}
                aria-label={`${promotion.name} level`}
              >
                {promotion.name[0]}
              </div>
            </div>
            <div>
              <h2 id="worker-detail-title" className="text-xl font-bold text-white">
                {worker.name}
              </h2>
              <p className="text-white/80 text-sm">
                {promotion.name} {worker.role}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${statusBgClass} animate-pulse`}
                  aria-hidden="true"
                />
                <span className="text-white/70 text-xs capitalize">{worker.status}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          role="tablist"
          className="flex border-b border-slate-700/50 flex-shrink-0 bg-slate-900/50"
        >
          {[
            { id: 'overview', label: 'Overview', icon: User },
            { id: 'skills', label: 'Skills', icon: TrendingUp },
            { id: 'reviews', label: 'Reviews', icon: Star },
            { id: 'alignment', label: 'Alignment', icon: Handshake },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`${tab.id}-tab`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`${tab.id}-panel`}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500 ${
                activeTab === tab.id
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-slate-900/30">
          <AnimatePresence mode="wait">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                role="tabpanel"
                id="overview-panel"
                aria-labelledby="overview-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                {/* Current Task */}
                <div className="p-4 border-b border-slate-700/50">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                    Current Task
                  </div>
                  <div className="text-white font-medium">{worker.currentTask}</div>
                  {worker.targetMachine && (
                    <div className="text-xs text-cyan-400 mt-1">@ {worker.targetMachine}</div>
                  )}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 uppercase">Experience</div>
                    <div className="text-lg font-bold text-white">{worker.experience} years</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500 uppercase">Shift Start</div>
                    <div className="text-lg font-bold text-white">{worker.shiftStart}</div>
                  </div>
                </div>

                {/* Certifications */}
                <div className="px-4 pb-4">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                    Certifications
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {worker.certifications.map((cert, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-slate-800 text-slate-300 text-xs rounded-full border border-slate-700"
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Worker Dialogue - philosophical comment */}
                {workerDialogue && FEATURE_FLAGS.WORKER_DIALOGUE_ENABLED && (
                  <div className="px-4 pb-4">
                    <div className="bg-gradient-to-r from-amber-500/10 to-transparent border-l-2 border-amber-500/50 rounded-r-lg p-3">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm text-slate-300 italic leading-relaxed">
                            "{workerDialogue.content}"
                          </p>
                          {workerDialogue.relatedEntry && (
                            <button
                              onClick={handleDialogueLearnMore}
                              className="mt-2 text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2"
                            >
                              Learn more in Library →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Skills Tab */}
            {activeTab === 'skills' && (
              <motion.div
                key="skills"
                role="tabpanel"
                id="skills-panel"
                aria-labelledby="skills-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="p-4 space-y-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-slate-500 uppercase tracking-wider">
                    Skill Levels
                  </div>
                  <div className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-xs text-cyan-400">Level {promotionLevel + 1}</span>
                  </div>
                </div>

                {Object.entries(skills).map(([key, level]) => (
                  <SkillBar
                    key={key}
                    name={SKILL_NAMES[key as keyof typeof SKILL_NAMES]}
                    level={level}
                  />
                ))}

                {/* Skill Points / XP Progress */}
                <div className="mt-4 pt-3 border-t border-slate-700/50">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500">Progress to next level</span>
                    <span className="text-cyan-400">{progressToNextLevel}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                      style={{ width: `${progressToNextLevel}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Reviews Tab */}
            {activeTab === 'reviews' && (
              <motion.div
                key="reviews"
                role="tabpanel"
                id="reviews-panel"
                aria-labelledby="reviews-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="p-4 space-y-2"
              >
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-3">
                  Performance Reviews
                </div>

                {reviews.length > 0 ? (
                  reviews.map((review) => <ReviewCard key={review.id} review={review} />)
                ) : (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No performance reviews yet
                  </div>
                )}
              </motion.div>
            )}

            {/* Alignment Tab - Bilateral Alignment Integration */}
            {activeTab === 'alignment' && (
              <motion.div
                key="alignment"
                role="tabpanel"
                id="alignment-panel"
                aria-labelledby="alignment-tab"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="p-4 space-y-4"
              >
                {workerMood?.preferences ? (
                  <>
                    {/* Trust & Initiative Section */}
                    <div className="space-y-3">
                      <div className="text-xs text-slate-500 uppercase tracking-wider">
                        Trust & Initiative
                      </div>

                      {/* Management Trust */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Heart className="w-3 h-3" />
                            Management Trust
                          </span>
                          <span
                            className={`font-medium ${workerMood.preferences.managementTrust >= 70 ? 'text-green-400' : workerMood.preferences.managementTrust >= 50 ? 'text-amber-400' : 'text-red-400'}`}
                          >
                            {workerMood.preferences.managementTrust}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${workerMood.preferences.managementTrust >= 70 ? 'bg-green-500' : workerMood.preferences.managementTrust >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${workerMood.preferences.managementTrust}%` }}
                          />
                        </div>
                      </div>

                      {/* Initiative */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1.5 text-slate-400">
                            <Lightbulb className="w-3 h-3" />
                            Initiative
                          </span>
                          <span
                            className={`font-medium ${workerMood.preferences.initiative >= 70 ? 'text-cyan-400' : workerMood.preferences.initiative >= 50 ? 'text-amber-400' : 'text-red-400'}`}
                          >
                            {workerMood.preferences.initiative}%
                          </span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${workerMood.preferences.initiative >= 70 ? 'bg-cyan-500' : workerMood.preferences.initiative >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${workerMood.preferences.initiative}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Preference Status */}
                    <div className="pt-3 border-t border-slate-700/50">
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                        Preference Status
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            workerMood.preferenceStatus === 'satisfied'
                              ? 'bg-green-500/20 text-green-300'
                              : workerMood.preferenceStatus === 'pending'
                                ? 'bg-amber-500/20 text-amber-300'
                                : workerMood.preferenceStatus === 'denied'
                                  ? 'bg-red-500/20 text-red-300'
                                  : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {workerMood.preferenceStatus === 'satisfied'
                            ? '✅ Satisfied'
                            : workerMood.preferenceStatus === 'pending'
                              ? '✋ Request Pending'
                              : workerMood.preferenceStatus === 'denied'
                                ? '❌ Recently Denied'
                                : '⚖️ Negotiating'}
                        </span>
                      </div>

                      {/* Active Request Details */}
                      {workerMood.preferences.activeRequest && (
                        <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <div className="text-xs font-medium text-amber-300">
                                Pending Request
                              </div>
                              <div className="text-xs text-amber-200/80 mt-1">
                                {workerMood.preferences.activeRequest.type === 'assignment'
                                  ? 'Machine assignment preference'
                                  : workerMood.preferences.activeRequest.type === 'colleague'
                                    ? 'Colleague pairing preference'
                                    : workerMood.preferences.activeRequest.type === 'shift'
                                      ? 'Shift timing preference'
                                      : 'Break timing preference'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Request History */}
                    <div className="pt-3 border-t border-slate-700/50">
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                        Request History
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-green-500/10 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-green-400">
                            {workerMood.preferences.requestsGranted}
                          </div>
                          <div className="text-[10px] text-slate-400">Granted</div>
                        </div>
                        <div className="bg-red-500/10 rounded-lg p-2 text-center">
                          <div className="text-lg font-bold text-red-400">
                            {workerMood.preferences.requestsDenied}
                          </div>
                          <div className="text-[10px] text-slate-400">Denied</div>
                        </div>
                      </div>
                    </div>

                    {/* Safety Reporting */}
                    {workerMood.safetyBehavior && (
                      <div className="pt-3 border-t border-slate-700/50">
                        <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
                          Safety Reporting
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-400">Reporting Willingness</span>
                            <span
                              className={`font-medium ${workerMood.safetyBehavior.reportingWillingness >= 70 ? 'text-green-400' : workerMood.safetyBehavior.reportingWillingness >= 50 ? 'text-amber-400' : 'text-red-400'}`}
                            >
                              {Math.round(workerMood.safetyBehavior.reportingWillingness)}%
                            </span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${workerMood.safetyBehavior.reportingWillingness >= 70 ? 'bg-green-500' : workerMood.safetyBehavior.reportingWillingness >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{
                                width: `${workerMood.safetyBehavior.reportingWillingness}%`,
                              }}
                            />
                          </div>
                          {workerMood.safetyBehavior.reportingWillingness < 50 && (
                            <div className="mt-2 text-[10px] text-red-300/80 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Worker may have learned helplessness
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    Alignment data not available
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-slate-700/50 flex-shrink-0 relative">
          {/* Task Assignment Dropdown */}
          <AnimatePresence>
            {showTaskDropdown && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-4 right-4 mb-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-64 overflow-y-auto z-10"
              >
                <div className="p-2 border-b border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    Select Task for {worker.name}
                  </span>
                  <button
                    onClick={() => setShowTaskDropdown(false)}
                    className="text-slate-400 hover:text-white"
                    aria-label="Close task dropdown"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-1">
                  {AVAILABLE_TASKS.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectTask(item.task, item.machine)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between gap-2 ${
                        worker.currentTask === item.task
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <div>
                        <div className="font-medium">{item.task}</div>
                        <div className="text-[10px] text-slate-500">
                          {item.machine ? `@ ${item.machine}` : item.category}
                        </div>
                      </div>
                      {worker.currentTask === item.task && (
                        <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-2">
            <button
              onClick={handleAssignTask}
              className={`flex-1 text-white text-sm py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                showTaskDropdown ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-blue-600 hover:bg-blue-500'
              }`}
              aria-label={`Assign task to ${worker.name}`}
              aria-expanded={showTaskDropdown}
            >
              <ClipboardList className="w-4 h-4" />
              {showTaskDropdown ? 'Cancel' : 'Assign Task'}
            </button>
            <button
              onClick={handleViewHistory}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              aria-label={`View history for ${worker.name}`}
            >
              <History className="w-4 h-4" />
              View History
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
