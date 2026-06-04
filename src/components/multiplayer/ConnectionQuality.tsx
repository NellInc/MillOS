/**
 * ConnectionQuality - Visual indicator for network connection quality
 *
 * Shows signal bars and latency information for multiplayer connections.
 */

import React from 'react';
import { Signal, SignalLow, SignalMedium, SignalHigh, Wifi, WifiOff } from 'lucide-react';
import { useMultiplayerStore } from '../../stores/multiplayerStore';

interface ConnectionQualityProps {
  showLatency?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Get connection quality level based on latency
 */
function getQualityLevel(latencyMs: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (latencyMs < 30) return 'excellent';
  if (latencyMs < 60) return 'good';
  if (latencyMs < 100) return 'fair';
  return 'poor';
}

/**
 * Get color based on quality level
 */
function getQualityColor(quality: 'excellent' | 'good' | 'fair' | 'poor'): string {
  switch (quality) {
    case 'excellent':
      return 'text-green-400';
    case 'good':
      return 'text-green-500';
    case 'fair':
      return 'text-yellow-400';
    case 'poor':
      return 'text-red-400';
  }
}

/**
 * Get icon based on quality level
 */
function getQualityIcon(
  quality: 'excellent' | 'good' | 'fair' | 'poor',
  size: string
): React.ReactNode {
  const className = `${size} ${getQualityColor(quality)}`;

  switch (quality) {
    case 'excellent':
      return <SignalHigh className={className} />;
    case 'good':
      return <SignalMedium className={className} />;
    case 'fair':
      return <SignalLow className={className} />;
    case 'poor':
      return <Signal className={className} />;
  }
}

export const ConnectionQuality: React.FC<ConnectionQualityProps> = ({
  showLatency = true,
  size = 'md',
}) => {
  const connectionState = useMultiplayerStore((s) => s.connectionState);
  const averageLatency = useMultiplayerStore((s) => s.averageLatencyMs);
  const peerCount = useMultiplayerStore((s) => s.peers.size);

  const sizeClass = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-sm' : 'text-xs';

  if (connectionState !== 'connected') {
    return (
      <div className="flex items-center gap-1">
        <WifiOff className={`${sizeClass} text-slate-500`} />
        {showLatency && <span className={`${textSize} text-slate-500`}>Offline</span>}
      </div>
    );
  }

  // If no peers yet, show connecting indicator
  if (peerCount === 0 && averageLatency === 0) {
    return (
      <div className="flex items-center gap-1">
        <Wifi className={`${sizeClass} text-yellow-400 animate-pulse`} />
        {showLatency && <span className={`${textSize} text-yellow-400`}>Waiting for players</span>}
      </div>
    );
  }

  const quality = getQualityLevel(averageLatency);

  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`Connection ${quality}, ${averageLatency}ms`}
    >
      {getQualityIcon(quality, sizeClass)}
      {showLatency && (
        <span className={`${textSize} ${getQualityColor(quality)} font-mono`}>
          {averageLatency}ms
        </span>
      )}
    </div>
  );
};

ConnectionQuality.displayName = 'ConnectionQuality';

/**
 * Mini version for header display
 */
export const ConnectionQualityMini: React.FC = () => {
  const connectionState = useMultiplayerStore((s) => s.connectionState);
  const isHost = useMultiplayerStore((s) => s.isHost);
  const peerCount = useMultiplayerStore((s) => s._remotePlayersArray.length);

  if (connectionState !== 'connected') {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 bg-slate-800/80 rounded-full px-2 py-1">
      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <span className="text-[10px] text-slate-300">
        {isHost ? 'Hosting' : 'Connected'} ({peerCount + 1})
      </span>
    </div>
  );
};

ConnectionQualityMini.displayName = 'ConnectionQualityMini';
