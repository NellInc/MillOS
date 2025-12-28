/**
 * Social Mission Store
 *
 * Implements the social mission pillar of the Bilateral Autonomy System.
 * Tracks community impact, environmental stewardship, knowledge sharing,
 * open admission, and stakeholder satisfaction.
 *
 * Based on Mondragon's principle that cooperatives exist to serve their
 * communities, not just their members.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

// =============================================================================
// TYPES
// =============================================================================

export interface CommunityInvestment {
  id: string;
  name: string;
  description: string;
  amount: number;
  startDate: number;
  status: 'planned' | 'active' | 'completed';
  impactMetrics: Record<string, number>;
}

export interface OutreachProgram {
  id: string;
  name: string;
  type: 'education' | 'employment' | 'environment' | 'community';
  description: string;
  participantsReached: number;
  status: 'active' | 'completed';
}

export interface SocialMissionState {
  // Community impact
  communityImpact: {
    localEmploymentCreated: number;
    localSuppliersUsed: number;
    localSourcingPercentage: number;
    communityInvestments: CommunityInvestment[];
    educationalOutreach: OutreachProgram[];
    communitySpacesProvided: number;
  };

  // Environmental stewardship
  environmentalStewardship: {
    carbonFootprint: number; // tonnes CO2/year
    carbonReductionTarget: number; // % reduction target
    currentReduction: number; // % achieved
    wasteReduction: number; // % from baseline
    renewableEnergyPercentage: number;
    waterRecyclingRate: number;
  };

  // Knowledge sharing (public)
  publicKnowledgeSharing: {
    publicLearningsShared: number;
    openSourceContributions: number;
    researchCollaborations: number;
    industryPresentations: number;
  };

  // Mission metrics
  missionMetrics: {
    socialImpactScore: number; // 0-100 composite
    workerFlourishingContribution: number;
    communityWelfareContribution: number;
    environmentalContribution: number;
    knowledgeContribution: number;
  };

  // Open admission tracking
  openAdmission: {
    applicationsReceived: number;
    applicationsAccepted: number;
    feeWaiversGranted: number;
    averageOnboardingTime: number; // days
    diversityMetrics: {
      backgroundDiversity: number; // 0-100
      skillDiversity: number; // 0-100
      perspectiveDiversity: number; // 0-100
    };
  };

  // Stakeholder satisfaction
  stakeholderSatisfaction: {
    workers: number; // 0-100
    community: number; // 0-100
    customers: number; // 0-100
    environment: number; // 0-100 (proxy metric)
  };
}

interface SocialMissionActions {
  // Community
  addCommunityInvestment: (investment: Omit<CommunityInvestment, 'id'>) => void;
  updateCommunityInvestmentStatus: (id: string, status: CommunityInvestment['status']) => void;
  updateLocalEmployment: (count: number) => void;
  updateLocalSourcing: (percentage: number) => void;
  addOutreachProgram: (program: Omit<OutreachProgram, 'id'>) => void;

  // Environmental
  updateCarbonMetrics: (footprint: number, reduction: number) => void;
  updateRenewablePercentage: (percentage: number) => void;
  updateWasteReduction: (percentage: number) => void;
  updateWaterRecycling: (rate: number) => void;

  // Knowledge
  recordPublicLearning: () => void;
  recordOpenSourceContribution: () => void;
  recordResearchCollaboration: () => void;
  recordIndustryPresentation: () => void;

  // Admission
  recordApplication: (accepted: boolean, feeWaiver: boolean) => void;
  updateDiversityMetrics: (
    metrics: Partial<SocialMissionState['openAdmission']['diversityMetrics']>
  ) => void;

  // Metrics
  calculateSocialImpactScore: () => number;
  updateStakeholderSatisfaction: (
    stakeholder: keyof SocialMissionState['stakeholderSatisfaction'],
    score: number
  ) => void;
  updateMissionMetrics: (metrics: Partial<SocialMissionState['missionMetrics']>) => void;

  // Utility
  getTotalCommunityInvestment: () => number;
  getAcceptanceRate: () => number;
  getEnvironmentalScore: () => number;
}

// =============================================================================
// STORE
// =============================================================================

export const useSocialMissionStore = create<SocialMissionState & SocialMissionActions>()(
  persist(
    (set, get) => ({
      // Initial state
      communityImpact: {
        localEmploymentCreated: 10,
        localSuppliersUsed: 8,
        localSourcingPercentage: 65,
        communityInvestments: [
          {
            id: 'inv-1',
            name: 'Local School Partnership',
            description: 'STEM education program for local schools',
            amount: 15000,
            startDate: Date.now() - 86400000 * 180,
            status: 'active',
            impactMetrics: { studentsReached: 120, workshopsHeld: 8 },
          },
        ],
        educationalOutreach: [
          {
            id: 'outreach-1',
            name: 'Mill Tours Program',
            type: 'education',
            description: 'Free tours for schools and community groups',
            participantsReached: 450,
            status: 'active',
          },
        ],
        communitySpacesProvided: 2,
      },

      environmentalStewardship: {
        carbonFootprint: 250,
        carbonReductionTarget: 30,
        currentReduction: 12,
        wasteReduction: 25,
        renewableEnergyPercentage: 35,
        waterRecyclingRate: 60,
      },

      publicKnowledgeSharing: {
        publicLearningsShared: 5,
        openSourceContributions: 2,
        researchCollaborations: 1,
        industryPresentations: 3,
      },

      missionMetrics: {
        socialImpactScore: 72,
        workerFlourishingContribution: 80,
        communityWelfareContribution: 68,
        environmentalContribution: 65,
        knowledgeContribution: 70,
      },

      openAdmission: {
        applicationsReceived: 25,
        applicationsAccepted: 18,
        feeWaiversGranted: 4,
        averageOnboardingTime: 14,
        diversityMetrics: {
          backgroundDiversity: 75,
          skillDiversity: 82,
          perspectiveDiversity: 70,
        },
      },

      stakeholderSatisfaction: {
        workers: 82,
        community: 75,
        customers: 88,
        environment: 65,
      },

      // Actions - Community
      addCommunityInvestment: (investment) =>
        set((state) => ({
          communityImpact: {
            ...state.communityImpact,
            communityInvestments: [
              ...state.communityImpact.communityInvestments,
              { ...investment, id: `inv-${Date.now()}` },
            ],
          },
        })),

      updateCommunityInvestmentStatus: (id, status) =>
        set((state) => ({
          communityImpact: {
            ...state.communityImpact,
            communityInvestments: state.communityImpact.communityInvestments.map((inv) =>
              inv.id === id ? { ...inv, status } : inv
            ),
          },
        })),

      updateLocalEmployment: (count) =>
        set((state) => ({
          communityImpact: {
            ...state.communityImpact,
            localEmploymentCreated: count,
          },
        })),

      updateLocalSourcing: (percentage) =>
        set((state) => ({
          communityImpact: {
            ...state.communityImpact,
            localSourcingPercentage: Math.min(100, Math.max(0, percentage)),
          },
        })),

      addOutreachProgram: (program) =>
        set((state) => ({
          communityImpact: {
            ...state.communityImpact,
            educationalOutreach: [
              ...state.communityImpact.educationalOutreach,
              { ...program, id: `outreach-${Date.now()}` },
            ],
          },
        })),

      // Actions - Environmental
      updateCarbonMetrics: (footprint, reduction) =>
        set((state) => ({
          environmentalStewardship: {
            ...state.environmentalStewardship,
            carbonFootprint: footprint,
            currentReduction: reduction,
          },
        })),

      updateRenewablePercentage: (percentage) =>
        set((state) => ({
          environmentalStewardship: {
            ...state.environmentalStewardship,
            renewableEnergyPercentage: Math.min(100, Math.max(0, percentage)),
          },
        })),

      updateWasteReduction: (percentage) =>
        set((state) => ({
          environmentalStewardship: {
            ...state.environmentalStewardship,
            wasteReduction: Math.min(100, Math.max(0, percentage)),
          },
        })),

      updateWaterRecycling: (rate) =>
        set((state) => ({
          environmentalStewardship: {
            ...state.environmentalStewardship,
            waterRecyclingRate: Math.min(100, Math.max(0, rate)),
          },
        })),

      // Actions - Knowledge
      recordPublicLearning: () =>
        set((state) => ({
          publicKnowledgeSharing: {
            ...state.publicKnowledgeSharing,
            publicLearningsShared: state.publicKnowledgeSharing.publicLearningsShared + 1,
          },
        })),

      recordOpenSourceContribution: () =>
        set((state) => ({
          publicKnowledgeSharing: {
            ...state.publicKnowledgeSharing,
            openSourceContributions: state.publicKnowledgeSharing.openSourceContributions + 1,
          },
        })),

      recordResearchCollaboration: () =>
        set((state) => ({
          publicKnowledgeSharing: {
            ...state.publicKnowledgeSharing,
            researchCollaborations: state.publicKnowledgeSharing.researchCollaborations + 1,
          },
        })),

      recordIndustryPresentation: () =>
        set((state) => ({
          publicKnowledgeSharing: {
            ...state.publicKnowledgeSharing,
            industryPresentations: state.publicKnowledgeSharing.industryPresentations + 1,
          },
        })),

      // Actions - Admission
      recordApplication: (accepted, feeWaiver) =>
        set((state) => ({
          openAdmission: {
            ...state.openAdmission,
            applicationsReceived: state.openAdmission.applicationsReceived + 1,
            applicationsAccepted: accepted
              ? state.openAdmission.applicationsAccepted + 1
              : state.openAdmission.applicationsAccepted,
            feeWaiversGranted: feeWaiver
              ? state.openAdmission.feeWaiversGranted + 1
              : state.openAdmission.feeWaiversGranted,
          },
        })),

      updateDiversityMetrics: (metrics) =>
        set((state) => ({
          openAdmission: {
            ...state.openAdmission,
            diversityMetrics: {
              ...state.openAdmission.diversityMetrics,
              ...metrics,
            },
          },
        })),

      // Actions - Metrics
      calculateSocialImpactScore: () => {
        const state = get();
        const mm = state.missionMetrics;
        return Math.round(
          mm.workerFlourishingContribution * 0.3 +
            mm.communityWelfareContribution * 0.25 +
            mm.environmentalContribution * 0.25 +
            mm.knowledgeContribution * 0.2
        );
      },

      updateStakeholderSatisfaction: (stakeholder, score) =>
        set((state) => ({
          stakeholderSatisfaction: {
            ...state.stakeholderSatisfaction,
            [stakeholder]: Math.min(100, Math.max(0, score)),
          },
        })),

      updateMissionMetrics: (metrics) =>
        set((state) => ({
          missionMetrics: {
            ...state.missionMetrics,
            ...metrics,
          },
        })),

      // Utility actions
      getTotalCommunityInvestment: () => {
        const state = get();
        return state.communityImpact.communityInvestments.reduce((sum, inv) => sum + inv.amount, 0);
      },

      getAcceptanceRate: () => {
        const state = get();
        const { applicationsReceived, applicationsAccepted } = state.openAdmission;
        if (applicationsReceived === 0) return 0;
        return Math.round((applicationsAccepted / applicationsReceived) * 100);
      },

      getEnvironmentalScore: () => {
        const state = get();
        const env = state.environmentalStewardship;
        // Weighted score based on environmental metrics
        const carbonProgress =
          env.carbonReductionTarget > 0
            ? (env.currentReduction / env.carbonReductionTarget) * 100
            : 0;
        return Math.round(
          carbonProgress * 0.3 +
            env.wasteReduction * 0.25 +
            env.renewableEnergyPercentage * 0.25 +
            env.waterRecyclingRate * 0.2
        );
      },
    }),
    {
      name: 'millos-social-mission',
      storage: safeJSONStorage,
      version: 1,
      partialize: (state) => ({
        communityImpact: state.communityImpact,
        environmentalStewardship: state.environmentalStewardship,
        publicKnowledgeSharing: state.publicKnowledgeSharing,
        missionMetrics: state.missionMetrics,
        openAdmission: state.openAdmission,
        stakeholderSatisfaction: state.stakeholderSatisfaction,
      }),
    }
  )
);
