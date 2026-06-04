/**
 * AlertAcknowledgmentFlow Component
 *
 * Add acknowledgment buttons to alerts that clears them from strategic context.
 * Enhanced alert cards with dismiss functionality.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { X, Check, AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react';
import { useUIStore } from '../../stores';
import type { AlertData } from '../../types';

const getAlertIcon = (type: AlertData['type']) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="w-4 h-4 text-green-400" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    case 'critical':
      return <XCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Info className="w-4 h-4 text-blue-400" />;
  }
};

const getAlertStyles = (type: AlertData['type']) => {
  switch (type) {
    case 'success':
      return 'border-green-500/30 bg-green-900/20';
    case 'warning':
      return 'border-amber-500/30 bg-amber-900/20';
    case 'critical':
      return 'border-red-500/30 bg-red-900/20';
    default:
      return 'border-blue-500/30 bg-blue-900/20';
  }
};

interface AlertAcknowledgmentFlowProps {
  maxAlerts?: number;
}

export const AlertAcknowledgmentFlow: React.FC<AlertAcknowledgmentFlowProps> = ({
  maxAlerts = 5,
}) => {
  const alerts = useUIStore((state) => state.alerts);
  const dismissAlert = useUIStore((state) => state.dismissAlert);

  // Show only recent alerts
  const visibleAlerts = alerts.slice(-maxAlerts);

  if (visibleAlerts.length === 0) return null;

  const handleAcknowledge = (alertId: string) => {
    dismissAlert(alertId);
  };

  const handleAcknowledgeAll = () => {
    visibleAlerts.forEach((alert) => dismissAlert(alert.id));
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm"
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {/* Acknowledge All button */}
      {visibleAlerts.length > 1 && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleAcknowledgeAll}
          className="w-full py-1.5 px-3 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700/50 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/90 transition-colors flex items-center justify-center gap-2"
        >
          <Check className="w-3 h-3" />
          Acknowledge All ({visibleAlerts.length})
        </motion.button>
      )}

      {/* Alert cards */}
      {visibleAlerts.map((alert, index) => (
        <motion.div
          key={alert.id}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ delay: index * 0.05 }}
          role={alert.type === 'critical' ? 'alert' : 'status'}
          aria-live={alert.type === 'critical' ? 'assertive' : 'polite'}
          className={`rounded-lg border p-3 backdrop-blur-sm ${getAlertStyles(alert.type)}`}
        >
          <div className="flex items-start gap-2">
            {getAlertIcon(alert.type)}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium">{alert.title}</p>
              {alert.message && <p className="text-xs text-slate-400 mt-0.5">{alert.message}</p>}
            </div>
            <button
              onClick={() => handleAcknowledge(alert.id)}
              className="p-1 hover:bg-slate-700/50 rounded transition-colors flex-shrink-0"
              title="Acknowledge"
              aria-label={`Acknowledge alert: ${alert.title}`}
            >
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-white" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
