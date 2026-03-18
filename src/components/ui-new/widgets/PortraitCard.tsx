/**
 * PortraitCard - Display portraits of BAMS contributors
 *
 * Shows generative portraits of key thinkers behind the
 * Bilateral Alignment Management System.
 */

import React, { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, User } from 'lucide-react';
import type { PortraitConfig } from '../../../config/portraits';

interface PortraitCardProps {
  portrait: PortraitConfig;
  size?: 'small' | 'medium' | 'large';
  showDetails?: boolean;
}

const SIZE_CONFIG = {
  small: { container: 'w-12 h-12', text: 'text-[8px]', nameSize: 'text-[9px]' },
  medium: { container: 'w-20 h-20', text: 'text-[9px]', nameSize: 'text-[10px]' },
  large: { container: 'w-28 h-28', text: 'text-[10px]', nameSize: 'text-xs' },
};

const CATEGORY_COLORS = {
  wallace: 'border-green-500/50 bg-green-500/10',
  mondragon: 'border-cyan-500/50 bg-cyan-500/10',
  semler: 'border-amber-500/50 bg-amber-500/10',
  bilateral: 'border-pink-500/50 bg-pink-500/10',
  other: 'border-purple-500/50 bg-purple-500/10',
};

export const PortraitCard: React.FC<PortraitCardProps> = memo(
  ({ portrait, size = 'medium', showDetails = true }) => {
    const [imageError, setImageError] = useState(false);
    const sizeConfig = SIZE_CONFIG[size];
    const categoryColor = CATEGORY_COLORS[portrait.category];

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center"
      >
        {/* Portrait Image */}
        <div
          className={`${sizeConfig.container} rounded-full overflow-hidden border-2 ${categoryColor} flex items-center justify-center`}
        >
          {!imageError ? (
            <img
              src={portrait.imagePath}
              alt={portrait.name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <User className="w-1/2 h-1/2 text-slate-500" />
          )}
        </div>

        {/* Name & Details */}
        {showDetails && (
          <div className="mt-1.5 text-center max-w-[120px]">
            <div className={`${sizeConfig.nameSize} font-bold text-white leading-tight`}>
              {portrait.name}
            </div>
            <div className={`${sizeConfig.text} text-slate-400 leading-tight mt-0.5`}>
              {portrait.title}
            </div>
            {portrait.researchUrl && (
              <a
                href={portrait.researchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${sizeConfig.text} text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5 mt-0.5`}
              >
                <ExternalLink className="w-2 h-2" />
                Research
              </a>
            )}
          </div>
        )}
      </motion.div>
    );
  }
);

PortraitCard.displayName = 'PortraitCard';

/**
 * PortraitRow - Display multiple portraits in a row
 */
interface PortraitRowProps {
  portraits: PortraitConfig[];
  size?: 'small' | 'medium' | 'large';
  title?: string;
}

export const PortraitRow: React.FC<PortraitRowProps> = memo(
  ({ portraits, size = 'small', title }) => {
    return (
      <div className="space-y-2">
        {title && (
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{title}</div>
        )}
        <div className="flex flex-wrap gap-4 justify-center">
          {portraits.map((portrait) => (
            <PortraitCard key={portrait.id} portrait={portrait} size={size} />
          ))}
        </div>
      </div>
    );
  }
);

PortraitRow.displayName = 'PortraitRow';

export default PortraitCard;
