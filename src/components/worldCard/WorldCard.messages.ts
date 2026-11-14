import { defineMessages } from '../../i18n';

/**
 * The card a resident answers E (or the phone's context button) with, and the
 * reading at the top of a silo ladder. A resident is a role, never a name, and
 * the card holds no number about them (D-008, D-058).
 */
export const worldCardMessages = defineMessages({
  en: {
    nowDoing: 'Now',
    agreedAdjustments: 'Agreed adjustments',
    agreedWith: 'Agreed with',
    // Roles, by roster id (simulation/communityLife.ts COMMUNITY_ROSTER).
    roleMillOperatorWest: 'Roller mill operator',
    roleMillOperatorEast: 'Roller mill operator',
    roleMillEngineer: 'Maintenance engineer',
    roleMillQuality: 'Quality technician',
    roleMillPacker: 'Packing operator',
    roleMillSupervisor: 'Shift supervisor',
    roleVillageBaker: 'Village baker',
    roleVillageShopkeeper: 'Village shopkeeper',
    roleVillageGardener: 'Allotment gardener',
    roleVillageNeighbour: 'Village resident',
    roleVillageCourier: 'Village courier',
    roleVillageCyclist: 'Cyclist',
    rolePassenger: 'Bus passenger',
    roleForkliftOperator: 'Forklift operator, {tag}',
    roleQualityBench: 'Quality technician',
    rolePackingQuiet: 'Packing operator',
    roleHallClerk: 'Town hall clerk',
    roleHallOfficer: 'Town hall officer',
    roleResident: 'Resident',
    // The silo-top reading.
    siloContents: 'In the silo',
    siloEmpty: 'Empty',
    siloAmount: '{kg} kg of {capacity} kg',
    wheat_grain: 'Wheat',
    corn_grain: 'Corn',
  },
  'pt-BR': {
    nowDoing: 'Agora',
    agreedAdjustments: 'Ajustes combinados',
    agreedWith: 'Combinado com',
    roleMillOperatorWest: 'Operação do moinho de rolos',
    roleMillOperatorEast: 'Operação do moinho de rolos',
    roleMillEngineer: 'Engenharia de manutenção',
    roleMillQuality: 'Controle de qualidade',
    roleMillPacker: 'Operação da linha de ensaque',
    roleMillSupervisor: 'Supervisão do turno',
    roleVillageBaker: 'Padaria da vila',
    roleVillageShopkeeper: 'Loja da vila',
    roleVillageGardener: 'Horta comunitária',
    roleVillageNeighbour: 'Vizinhança da vila',
    roleVillageCourier: 'Entregas da vila',
    roleVillageCyclist: 'Ciclista',
    rolePassenger: 'Passageiros do ônibus',
    roleForkliftOperator: 'Operação da empilhadeira, {tag}',
    roleQualityBench: 'Controle de qualidade',
    rolePackingQuiet: 'Operação da linha de ensaque',
    roleHallClerk: 'Secretaria da prefeitura',
    roleHallOfficer: 'Atendimento da prefeitura',
    roleResident: 'Vizinhança',
    siloContents: 'No silo',
    siloEmpty: 'Vazio',
    siloAmount: '{kg} kg de {capacity} kg',
    wheat_grain: 'Trigo',
    corn_grain: 'Milho',
  },
});
