/**
 * TruckScheduleWidget Component
 *
 * Displays countdown timers for next truck arrivals at shipping and receiving docks.
 * Compact UI widget showing dock status and ETA.
 */

import React from 'react';
import { Truck, Package, Clock, ArrowDown, ArrowUp } from 'lucide-react';
import { useProductionStore } from '../../stores/productionStore';

interface DockRowProps {
  type: 'shipping' | 'receiving';
  nextArrival: number;
  isDocked: boolean;
  status: 'arriving' | 'loading' | 'departing' | 'clear';
}

const formatTime = (seconds: number): string => {
  if (seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const DockRow: React.FC<DockRowProps> = ({ type, nextArrival, isDocked, status }) => {
  const isShipping = type === 'shipping';
  const label = isShipping ? 'Shipping' : 'Receiving';
  const Icon = isShipping ? ArrowUp : ArrowDown;

  // Status colors
  const getStatusColor = () => {
    if (isDocked) return 'text-red-400 bg-red-500/20';
    if (status === 'arriving' || nextArrival < 15) return 'text-amber-400 bg-amber-500/20';
    return 'text-emerald-400 bg-emerald-500/20';
  };

  const getStatusText = () => {
    if (isDocked) {
      if (status === 'loading') return 'LOADING';
      if (status === 'departing') return 'DEPARTING';
      return 'DOCKED';
    }
    if (status === 'arriving') return 'ARRIVING';
    return 'CLEAR';
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded ${getStatusColor()}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium text-gray-300">{label}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Status badge */}
        <span
          className={`
            text-xs font-semibold px-2 py-0.5 rounded
            ${isDocked ? 'bg-red-500/30 text-red-300' : 'bg-gray-700 text-gray-400'}
          `}
        >
          {getStatusText()}
        </span>

        {/* Countdown or truck icon */}
        {isDocked ? (
          <div className="flex items-center gap-1 text-red-400">
            <Truck className="w-4 h-4" />
          </div>
        ) : (
          <div className="flex items-center gap-1 text-gray-400 min-w-[50px] justify-end">
            <Clock className="w-3 h-3" />
            <span className={`text-sm font-mono ${nextArrival < 15 ? 'text-amber-400' : ''}`}>
              {formatTime(nextArrival)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const TruckScheduleWidget: React.FC = () => {
  const truckSchedule = useProductionStore((state) => state.truckSchedule);
  const dockStatus = useProductionStore((state) => state.dockStatus);

  return (
    <div className="bg-gray-800/90 backdrop-blur-sm rounded-lg border border-gray-700 p-3">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-700">
        <Package className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-gray-200">Truck Schedule</h3>
      </div>

      {/* Dock rows */}
      <div className="space-y-1">
        <DockRow
          type="shipping"
          nextArrival={truckSchedule.shipping.nextArrivalMinutes * 60}
          isDocked={truckSchedule.shipping.truckDocked}
          status={dockStatus.shipping.status}
        />
        <DockRow
          type="receiving"
          nextArrival={truckSchedule.receiving.nextArrivalMinutes * 60}
          isDocked={truckSchedule.receiving.truckDocked}
          status={dockStatus.receiving.status}
        />
      </div>
    </div>
  );
};

export default TruckScheduleWidget;
