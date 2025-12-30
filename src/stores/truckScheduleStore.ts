/**
 * Truck Schedule Store - Truck Arrival/Departure Management
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface TruckScheduleState {
  receiving: {
    truckDocked: boolean;
    nextArrivalMinutes: number;
    lastDeparture: Date | null;
  };
  shipping: {
    truckDocked: boolean;
    nextArrivalMinutes: number;
    lastDeparture: Date | null;
  };
}

export interface TruckScheduleStore {
  truckSchedule: TruckScheduleState;
  setTruckDocked: (dock: 'receiving' | 'shipping', docked: boolean) => void;
  updateNextArrival: (dock: 'receiving' | 'shipping', minutes: number) => void;
  recordTruckDeparture: (dock: 'receiving' | 'shipping') => void;
  isAnyTruckDocked: () => boolean;
  getTimeUntilNextArrival: (dock: 'receiving' | 'shipping') => number;
  tickArrivals: (deltaMinutes: number) => void;
}

const initialTruckSchedule: TruckScheduleState = {
  receiving: {
    truckDocked: false,
    nextArrivalMinutes: 15,
    lastDeparture: null,
  },
  shipping: {
    truckDocked: false,
    nextArrivalMinutes: 20,
    lastDeparture: null,
  },
};

export const useTruckScheduleStore = create<TruckScheduleStore>()(
  subscribeWithSelector((set, get) => ({
    truckSchedule: initialTruckSchedule,

    setTruckDocked: (dock, docked) =>
      set((state) => ({
        truckSchedule: {
          ...state.truckSchedule,
          [dock]: {
            ...state.truckSchedule[dock],
            truckDocked: docked,
          },
        },
      })),

    updateNextArrival: (dock, minutes) =>
      set((state) => ({
        truckSchedule: {
          ...state.truckSchedule,
          [dock]: {
            ...state.truckSchedule[dock],
            nextArrivalMinutes: minutes,
          },
        },
      })),

    recordTruckDeparture: (dock) =>
      set((state) => ({
        truckSchedule: {
          ...state.truckSchedule,
          [dock]: {
            ...state.truckSchedule[dock],
            truckDocked: false,
            lastDeparture: new Date(),
            nextArrivalMinutes: 10 + Math.random() * 20, // 10-30 minutes
          },
        },
      })),

    isAnyTruckDocked: () => {
      const { truckSchedule } = get();
      return truckSchedule.receiving.truckDocked || truckSchedule.shipping.truckDocked;
    },

    getTimeUntilNextArrival: (dock) => get().truckSchedule[dock].nextArrivalMinutes,

    tickArrivals: (deltaMinutes: number) =>
      set((state) => {
        const newReceiving = { ...state.truckSchedule.receiving };
        const newShipping = { ...state.truckSchedule.shipping };

        // Tick down arrival timers
        if (!newReceiving.truckDocked) {
          newReceiving.nextArrivalMinutes = Math.max(
            0,
            newReceiving.nextArrivalMinutes - deltaMinutes
          );
          if (newReceiving.nextArrivalMinutes <= 0) {
            newReceiving.truckDocked = true;
          }
        }

        if (!newShipping.truckDocked) {
          newShipping.nextArrivalMinutes = Math.max(
            0,
            newShipping.nextArrivalMinutes - deltaMinutes
          );
          if (newShipping.nextArrivalMinutes <= 0) {
            newShipping.truckDocked = true;
          }
        }

        return {
          truckSchedule: {
            receiving: newReceiving,
            shipping: newShipping,
          },
        };
      }),
  }))
);
