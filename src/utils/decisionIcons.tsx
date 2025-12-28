/**
 * Shared Decision Icon and Color Utilities
 *
 * Consolidates duplicate getTypeIcon, getStatusIcon, getTypeColor, and getPriorityBadge
 * functions that were scattered across multiple components.
 */

import React from 'react';
import {
  CheckCircle,
  Clock,
  AlertTriangle,
  Zap,
  Wrench,
  Users,
  Target,
  Shield,
  Bot,
  Activity,
} from 'lucide-react';
import type { AIDecision } from '../types';

type DecisionType = AIDecision['type'];
type DecisionStatus = AIDecision['status'];
type DecisionPriority = AIDecision['priority'];

// Icon size variants
type IconSize = 'xs' | 'sm' | 'md' | 'lg';
const iconSizeClasses: Record<IconSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

/**
 * Get icon for AI decision type
 */
export function getDecisionTypeIcon(
  type: DecisionType | string,
  size: IconSize = 'sm'
): React.ReactNode {
  const sizeClass = iconSizeClasses[size];
  switch (type) {
    case 'assignment':
      return <Users className={`${sizeClass} text-green-400`} />;
    case 'optimization':
      return <Zap className={`${sizeClass} text-cyan-400`} />;
    case 'prediction':
      return <Target className={`${sizeClass} text-purple-400`} />;
    case 'maintenance':
      return <Wrench className={`${sizeClass} text-amber-400`} />;
    case 'safety':
      return <Shield className={`${sizeClass} text-red-400`} />;
    default:
      return <Bot className={`${sizeClass} text-slate-400`} />;
  }
}

/**
 * Get icon for AI decision status
 */
export function getDecisionStatusIcon(
  status: DecisionStatus | string,
  size: IconSize = 'sm'
): React.ReactNode {
  const sizeClass = iconSizeClasses[size];
  switch (status) {
    case 'completed':
      return <CheckCircle className={`${sizeClass} text-green-400`} />;
    case 'in_progress':
      return <Activity className={`${sizeClass} text-blue-400 animate-pulse`} />;
    case 'pending':
      return <Clock className={`${sizeClass} text-yellow-400`} />;
    case 'superseded':
      return <AlertTriangle className={`${sizeClass} text-slate-400`} />;
    default:
      return <Clock className={`${sizeClass} text-slate-400`} />;
  }
}

/**
 * Get gradient color class for AI decision type
 */
export function getDecisionTypeColor(type: DecisionType | string): string {
  switch (type) {
    case 'assignment':
      return 'from-blue-500 to-blue-600';
    case 'optimization':
      return 'from-green-500 to-green-600';
    case 'prediction':
      return 'from-purple-500 to-purple-600';
    case 'maintenance':
      return 'from-yellow-500 to-yellow-600';
    case 'safety':
      return 'from-red-500 to-red-600';
    default:
      return 'from-gray-500 to-gray-600';
  }
}

/**
 * Get badge classes for AI decision priority
 */
export function getDecisionPriorityBadge(priority: DecisionPriority): string {
  const colors: Record<DecisionPriority, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  };
  return colors[priority] || colors.medium;
}

/**
 * Get text color class for AI decision type
 */
export function getDecisionTypeTextColor(type: DecisionType | string): string {
  switch (type) {
    case 'assignment':
      return 'text-blue-400';
    case 'optimization':
      return 'text-green-400';
    case 'prediction':
      return 'text-purple-400';
    case 'maintenance':
      return 'text-yellow-400';
    case 'safety':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}
