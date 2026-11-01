import React from 'react';
import { LinksClient } from '../client';
import { sanitizeUrl } from '../sanitizer';
import { TrustBadge } from './TrustBadge';
import { useTrackedLink } from './useTrackedLink';

export interface SafeAnchorProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: React.ReactNode;
  showBadge?: boolean;
  telemetry?: boolean;
  trustScore?: number;
  resolveTrust?: boolean;
  badgeSize?: 'sm' | 'md' | 'lg';
  channel?: string;
  campaign?: string;
  tenantId?: string;
  client?: LinksClient;
}

export const SafeAnchor: React.FC<SafeAnchorProps> = ({
  href,
  children,
  showBadge = true,
  telemetry = false,
  trustScore: explicitTrustScore,
  resolveTrust = false,
  badgeSize = 'sm',
  channel,
  campaign,
  tenantId,
  client,
  target,
  rel,
  className = '',
  style,
  ...rest
}) => {
  const isExternal =
    typeof href === 'string' &&
    (href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('//'));

  // Tracked link hook handles shortening (when telemetry is true)
  // AND handles trust resolution (when resolveTrust is true)
  const tracked = useTrackedLink(href, {
    enabled: telemetry && isExternal,
    autoResolveTrust: resolveTrust && isExternal && explicitTrustScore === undefined,
    channel,
    campaign,
    tenantId,
    client,
  });

  const finalHref = telemetry ? tracked.href : sanitizeUrl(href);
  const effectiveScore = explicitTrustScore ?? tracked.trustScore;

  const finalTarget = target ?? (isExternal ? '_blank' : undefined);
  const finalRel =
    rel ?? (isExternal && finalTarget === '_blank' ? 'noopener noreferrer' : undefined);

  return (
    <a
      href={finalHref}
      target={finalTarget}
      rel={finalRel}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        textDecoration: 'none',
        ...style,
      }}
      {...rest}
    >
      <span>{children}</span>
      {showBadge && isExternal && (
        <TrustBadge
          score={effectiveScore}
          size={badgeSize}
          showLabel={false}
        />
      )}
    </a>
  );
};
