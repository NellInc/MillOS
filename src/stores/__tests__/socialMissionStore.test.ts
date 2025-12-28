import { describe, it, expect, beforeEach } from 'vitest';
import { useSocialMissionStore } from '../socialMissionStore';

describe('socialMissionStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSocialMissionStore.setState({
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
    });
  });

  describe('initial state', () => {
    it('should have initial community impact metrics', () => {
      const state = useSocialMissionStore.getState();
      expect(state.communityImpact.localEmploymentCreated).toBe(10);
      expect(state.communityImpact.localSourcingPercentage).toBe(65);
    });

    it('should have initial environmental metrics', () => {
      const state = useSocialMissionStore.getState();
      expect(state.environmentalStewardship.carbonFootprint).toBe(250);
      expect(state.environmentalStewardship.carbonReductionTarget).toBe(30);
    });

    it('should have initial stakeholder satisfaction', () => {
      const state = useSocialMissionStore.getState();
      expect(state.stakeholderSatisfaction.workers).toBe(82);
      expect(state.stakeholderSatisfaction.customers).toBe(88);
    });

    it('should have initial community investments', () => {
      const state = useSocialMissionStore.getState();
      expect(state.communityImpact.communityInvestments).toHaveLength(1);
      expect(state.communityImpact.communityInvestments[0].name).toBe('Local School Partnership');
    });
  });

  describe('community impact metrics', () => {
    it('should add community investment', () => {
      const state = useSocialMissionStore.getState();
      state.addCommunityInvestment({
        name: 'Food Bank Partnership',
        description: 'Monthly grain donation to local food bank',
        amount: 5000,
        startDate: Date.now(),
        status: 'planned',
        impactMetrics: { mealsProvided: 0 },
      });

      const newState = useSocialMissionStore.getState();
      expect(newState.communityImpact.communityInvestments).toHaveLength(2);
      expect(newState.communityImpact.communityInvestments[1].name).toBe('Food Bank Partnership');
    });

    it('should update community investment status', () => {
      const state = useSocialMissionStore.getState();
      state.updateCommunityInvestmentStatus('inv-1', 'completed');

      const newState = useSocialMissionStore.getState();
      expect(newState.communityImpact.communityInvestments[0].status).toBe('completed');
    });

    it('should update local employment count', () => {
      const state = useSocialMissionStore.getState();
      state.updateLocalEmployment(15);

      const newState = useSocialMissionStore.getState();
      expect(newState.communityImpact.localEmploymentCreated).toBe(15);
    });

    it('should update local sourcing percentage with clamping', () => {
      const state = useSocialMissionStore.getState();
      state.updateLocalSourcing(80);

      let newState = useSocialMissionStore.getState();
      expect(newState.communityImpact.localSourcingPercentage).toBe(80);

      // Test upper bound clamping
      state.updateLocalSourcing(150);
      newState = useSocialMissionStore.getState();
      expect(newState.communityImpact.localSourcingPercentage).toBe(100);

      // Test lower bound clamping
      state.updateLocalSourcing(-10);
      newState = useSocialMissionStore.getState();
      expect(newState.communityImpact.localSourcingPercentage).toBe(0);
    });

    it('should add outreach program', () => {
      const state = useSocialMissionStore.getState();
      state.addOutreachProgram({
        name: 'Job Training Initiative',
        type: 'employment',
        description: 'Skills training for unemployed community members',
        participantsReached: 0,
        status: 'active',
      });

      const newState = useSocialMissionStore.getState();
      expect(newState.communityImpact.educationalOutreach).toHaveLength(2);
    });
  });

  describe('environmental stewardship tracking', () => {
    it('should update carbon metrics', () => {
      const state = useSocialMissionStore.getState();
      state.updateCarbonMetrics(200, 20);

      const newState = useSocialMissionStore.getState();
      expect(newState.environmentalStewardship.carbonFootprint).toBe(200);
      expect(newState.environmentalStewardship.currentReduction).toBe(20);
    });

    it('should update renewable percentage with clamping', () => {
      const state = useSocialMissionStore.getState();
      state.updateRenewablePercentage(50);

      let newState = useSocialMissionStore.getState();
      expect(newState.environmentalStewardship.renewableEnergyPercentage).toBe(50);

      // Test upper bound clamping
      state.updateRenewablePercentage(120);
      newState = useSocialMissionStore.getState();
      expect(newState.environmentalStewardship.renewableEnergyPercentage).toBe(100);

      // Test lower bound clamping
      state.updateRenewablePercentage(-15);
      newState = useSocialMissionStore.getState();
      expect(newState.environmentalStewardship.renewableEnergyPercentage).toBe(0);

      // Test boundary values
      state.updateRenewablePercentage(0);
      expect(
        useSocialMissionStore.getState().environmentalStewardship.renewableEnergyPercentage
      ).toBe(0);

      state.updateRenewablePercentage(100);
      expect(
        useSocialMissionStore.getState().environmentalStewardship.renewableEnergyPercentage
      ).toBe(100);
    });

    it('should update waste reduction', () => {
      const state = useSocialMissionStore.getState();
      state.updateWasteReduction(40);

      const newState = useSocialMissionStore.getState();
      expect(newState.environmentalStewardship.wasteReduction).toBe(40);
    });

    it('should clamp waste reduction to 0-100', () => {
      const state = useSocialMissionStore.getState();

      // Test upper bound clamping
      state.updateWasteReduction(150);
      expect(useSocialMissionStore.getState().environmentalStewardship.wasteReduction).toBe(100);

      // Test lower bound clamping
      state.updateWasteReduction(-20);
      expect(useSocialMissionStore.getState().environmentalStewardship.wasteReduction).toBe(0);

      // Test boundary values
      state.updateWasteReduction(0);
      expect(useSocialMissionStore.getState().environmentalStewardship.wasteReduction).toBe(0);

      state.updateWasteReduction(100);
      expect(useSocialMissionStore.getState().environmentalStewardship.wasteReduction).toBe(100);
    });

    it('should update water recycling rate', () => {
      const state = useSocialMissionStore.getState();
      state.updateWaterRecycling(75);

      const newState = useSocialMissionStore.getState();
      expect(newState.environmentalStewardship.waterRecyclingRate).toBe(75);
    });

    it('should clamp water recycling rate to 0-100', () => {
      const state = useSocialMissionStore.getState();

      // Test upper bound clamping
      state.updateWaterRecycling(120);
      expect(useSocialMissionStore.getState().environmentalStewardship.waterRecyclingRate).toBe(
        100
      );

      // Test lower bound clamping
      state.updateWaterRecycling(-5);
      expect(useSocialMissionStore.getState().environmentalStewardship.waterRecyclingRate).toBe(0);

      // Test boundary values
      state.updateWaterRecycling(0);
      expect(useSocialMissionStore.getState().environmentalStewardship.waterRecyclingRate).toBe(0);

      state.updateWaterRecycling(100);
      expect(useSocialMissionStore.getState().environmentalStewardship.waterRecyclingRate).toBe(
        100
      );
    });

    it('should calculate environmental score', () => {
      const state = useSocialMissionStore.getState();
      const score = state.getEnvironmentalScore();

      // carbonProgress = (12/30)*100 = 40
      // score = 40*0.3 + 25*0.25 + 35*0.25 + 60*0.2
      // = 12 + 6.25 + 8.75 + 12 = 39
      expect(score).toBe(39);
    });

    it('should handle zero carbon reduction target', () => {
      useSocialMissionStore.setState((state) => ({
        environmentalStewardship: {
          ...state.environmentalStewardship,
          carbonReductionTarget: 0,
        },
      }));

      const state = useSocialMissionStore.getState();
      const score = state.getEnvironmentalScore();
      // carbonProgress = 0
      // score = 0*0.3 + 25*0.25 + 35*0.25 + 60*0.2
      // = 0 + 6.25 + 8.75 + 12 = 27
      expect(score).toBe(27);
    });
  });

  describe('stakeholder satisfaction calculations', () => {
    it('should update stakeholder satisfaction', () => {
      const state = useSocialMissionStore.getState();
      state.updateStakeholderSatisfaction('workers', 90);

      const newState = useSocialMissionStore.getState();
      expect(newState.stakeholderSatisfaction.workers).toBe(90);
    });

    it('should clamp stakeholder satisfaction to 0-100', () => {
      const state = useSocialMissionStore.getState();
      state.updateStakeholderSatisfaction('community', 150);

      let newState = useSocialMissionStore.getState();
      expect(newState.stakeholderSatisfaction.community).toBe(100);

      state.updateStakeholderSatisfaction('community', -20);
      newState = useSocialMissionStore.getState();
      expect(newState.stakeholderSatisfaction.community).toBe(0);
    });

    it('should update all stakeholder types', () => {
      const state = useSocialMissionStore.getState();
      state.updateStakeholderSatisfaction('workers', 85);
      state.updateStakeholderSatisfaction('community', 80);
      state.updateStakeholderSatisfaction('customers', 92);
      state.updateStakeholderSatisfaction('environment', 70);

      const newState = useSocialMissionStore.getState();
      expect(newState.stakeholderSatisfaction.workers).toBe(85);
      expect(newState.stakeholderSatisfaction.community).toBe(80);
      expect(newState.stakeholderSatisfaction.customers).toBe(92);
      expect(newState.stakeholderSatisfaction.environment).toBe(70);
    });
  });

  describe('mission score calculation', () => {
    it('should calculate social impact score from components', () => {
      const state = useSocialMissionStore.getState();
      const score = state.calculateSocialImpactScore();

      // workerFlourishing: 80 * 0.3 = 24
      // communityWelfare: 68 * 0.25 = 17
      // environmental: 65 * 0.25 = 16.25
      // knowledge: 70 * 0.2 = 14
      // Total: 24 + 17 + 16.25 + 14 = 71.25 -> 71
      expect(score).toBe(71);
    });

    it('should update mission metrics', () => {
      const state = useSocialMissionStore.getState();
      state.updateMissionMetrics({
        workerFlourishingContribution: 90,
        environmentalContribution: 75,
      });

      const newState = useSocialMissionStore.getState();
      expect(newState.missionMetrics.workerFlourishingContribution).toBe(90);
      expect(newState.missionMetrics.environmentalContribution).toBe(75);
      // Unchanged values should remain
      expect(newState.missionMetrics.communityWelfareContribution).toBe(68);
    });
  });

  describe('knowledge sharing', () => {
    it('should record public learning', () => {
      const state = useSocialMissionStore.getState();
      state.recordPublicLearning();

      const newState = useSocialMissionStore.getState();
      expect(newState.publicKnowledgeSharing.publicLearningsShared).toBe(6);
    });

    it('should record open source contribution', () => {
      const state = useSocialMissionStore.getState();
      state.recordOpenSourceContribution();

      const newState = useSocialMissionStore.getState();
      expect(newState.publicKnowledgeSharing.openSourceContributions).toBe(3);
    });

    it('should record research collaboration', () => {
      const state = useSocialMissionStore.getState();
      state.recordResearchCollaboration();

      const newState = useSocialMissionStore.getState();
      expect(newState.publicKnowledgeSharing.researchCollaborations).toBe(2);
    });

    it('should record industry presentation', () => {
      const state = useSocialMissionStore.getState();
      state.recordIndustryPresentation();

      const newState = useSocialMissionStore.getState();
      expect(newState.publicKnowledgeSharing.industryPresentations).toBe(4);
    });
  });

  describe('open admission tracking', () => {
    it('should record accepted application', () => {
      const state = useSocialMissionStore.getState();
      state.recordApplication(true, false);

      const newState = useSocialMissionStore.getState();
      expect(newState.openAdmission.applicationsReceived).toBe(26);
      expect(newState.openAdmission.applicationsAccepted).toBe(19);
      expect(newState.openAdmission.feeWaiversGranted).toBe(4);
    });

    it('should record rejected application', () => {
      const state = useSocialMissionStore.getState();
      state.recordApplication(false, false);

      const newState = useSocialMissionStore.getState();
      expect(newState.openAdmission.applicationsReceived).toBe(26);
      expect(newState.openAdmission.applicationsAccepted).toBe(18);
    });

    it('should record application with fee waiver', () => {
      const state = useSocialMissionStore.getState();
      state.recordApplication(true, true);

      const newState = useSocialMissionStore.getState();
      expect(newState.openAdmission.applicationsAccepted).toBe(19);
      expect(newState.openAdmission.feeWaiversGranted).toBe(5);
    });

    it('should update diversity metrics', () => {
      const state = useSocialMissionStore.getState();
      state.updateDiversityMetrics({
        backgroundDiversity: 85,
        perspectiveDiversity: 80,
      });

      const newState = useSocialMissionStore.getState();
      expect(newState.openAdmission.diversityMetrics.backgroundDiversity).toBe(85);
      expect(newState.openAdmission.diversityMetrics.perspectiveDiversity).toBe(80);
      // Unchanged should remain
      expect(newState.openAdmission.diversityMetrics.skillDiversity).toBe(82);
    });

    it('should calculate acceptance rate', () => {
      const state = useSocialMissionStore.getState();
      const rate = state.getAcceptanceRate();
      // 18/25 = 0.72 -> 72%
      expect(rate).toBe(72);
    });

    it('should handle zero applications gracefully', () => {
      useSocialMissionStore.setState((state) => ({
        openAdmission: {
          ...state.openAdmission,
          applicationsReceived: 0,
          applicationsAccepted: 0,
        },
      }));

      const state = useSocialMissionStore.getState();
      const rate = state.getAcceptanceRate();
      expect(rate).toBe(0);
    });
  });

  describe('utility selectors', () => {
    it('should get total community investment', () => {
      const state = useSocialMissionStore.getState();
      const total = state.getTotalCommunityInvestment();
      expect(total).toBe(15000);
    });

    it('should sum multiple community investments', () => {
      useSocialMissionStore.setState((state) => ({
        communityImpact: {
          ...state.communityImpact,
          communityInvestments: [
            {
              id: 'inv-1',
              name: 'Investment A',
              description: 'Test',
              amount: 10000,
              startDate: Date.now(),
              status: 'active',
              impactMetrics: {},
            },
            {
              id: 'inv-2',
              name: 'Investment B',
              description: 'Test',
              amount: 5000,
              startDate: Date.now(),
              status: 'active',
              impactMetrics: {},
            },
            {
              id: 'inv-3',
              name: 'Investment C',
              description: 'Test',
              amount: 7500,
              startDate: Date.now(),
              status: 'completed',
              impactMetrics: {},
            },
          ],
        },
      }));

      const state = useSocialMissionStore.getState();
      const total = state.getTotalCommunityInvestment();
      expect(total).toBe(22500);
    });
  });
});
