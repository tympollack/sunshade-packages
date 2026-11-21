import React from 'react';
import type { ReputationTier, TrustTier } from '../types';

export interface TrustBadgeProps {
  score?: number;
  tier?: ReputationTier;
  status?: TrustTier;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  'data-testid'?: string;
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({
  score,
  tier,
  status,
  showLabel = false,
  size = 'sm',
  className = '',
  onClick,
  'data-testid': testId = 'trust-badge',
}) => {
  const hasScore = typeof score === 'number' && !isNaN(score);

  // Determine status and tier from score if not provided
  const effectiveStatus: TrustTier | 'unknown' = status
    ? status
    : hasScore
      ? score! >= 85
        ? 'trusted'
        : score! >= 60
          ? 'warning'
          : 'danger'
      : 'unknown';

  // Visual Tokens
  const colorMap = {
    trusted: {
      bg: 'rgba(16, 185, 129, 0.1)',
      border: 'rgba(16, 185, 129, 0.3)',
      text: '#10B981', // Emerald
    },
    warning: {
      bg: 'rgba(245, 158, 11, 0.1)',
      border: 'rgba(245, 158, 11, 0.3)',
      text: '#F59E0B', // Amber
    },
    danger: {
      bg: 'rgba(239, 68, 68, 0.1)',
      border: 'rgba(239, 68, 68, 0.3)',
      text: '#EF4444', // Crimson
    },
    unknown: {
      bg: 'rgba(100, 116, 139, 0.1)',
      border: 'rgba(100, 116, 139, 0.3)',
      text: '#64748B', // Muted Slate
    },
  };

  const currentTheme = colorMap[effectiveStatus];

  const sizeDimensions = {
    sm: { icon: 12, fontSize: '0.7rem', padding: '1px 5px', gap: '3px' },
    md: { icon: 14, fontSize: '0.8rem', padding: '2px 8px', gap: '4px' },
    lg: { icon: 18, fontSize: '0.9rem', padding: '4px 10px', gap: '6px' },
  };

  const dim = sizeDimensions[size];

  const labelText = hasScore
    ? `${score}/100`
    : tier || 'Unverified';

  return (
    <span
      data-testid={testId}
      data-status={effectiveStatus}
      role="img"
      aria-label={`Trust Score: ${hasScore ? `${score} out of 100` : 'Unverified'}`}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: dim.gap,
        padding: dim.padding,
        fontSize: dim.fontSize,
        lineHeight: 1,
        borderRadius: '9999px',
        backgroundColor: currentTheme.bg,
        border: `1px solid ${currentTheme.border}`,
        color: currentTheme.text,
        fontWeight: 600,
        verticalAlign: 'middle',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      className={className}
    >
      {/* Inline SVG Shield Icon */}
      <svg
        width={dim.icon}
        height={dim.icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke={currentTheme.text}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        {effectiveStatus === 'trusted' && <path d="m9 12 2 2 4-4" />}
        {effectiveStatus === 'warning' && <path d="M12 8v4M12 16h.01" />}
        {effectiveStatus === 'danger' && <path d="m15 9-6 6M9 9l6 6" />}
      </svg>
      {showLabel && <span>{labelText}</span>}
      {!showLabel && hasScore && <span>{score}</span>}
    </span>
  );
};
