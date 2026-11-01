import { useCallback, useEffect, useRef, useState } from 'react';
import { getDefaultClient, LinksClient } from '../client';
import { sanitizeUrl } from '../sanitizer';
import type { TrustScoreReport } from '../types';

export interface UseTrackedLinkOptions {
  channel?: string;
  campaign?: string;
  tenantId?: string;
  enabled?: boolean;
  client?: LinksClient;
  autoResolveTrust?: boolean;
}

export interface UseTrackedLinkResult {
  href: string;
  isLoading: boolean;
  isShortened: boolean;
  trustScore?: number;
  trustReport?: TrustScoreReport;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useTrackedLink(
  destinationUrl: string,
  options: UseTrackedLinkOptions = {}
): UseTrackedLinkResult {
  const {
    channel,
    campaign,
    tenantId,
    enabled = true,
    client: customClient,
    autoResolveTrust = false,
  } = options;

  const client = customClient || getDefaultClient();
  const sanitizedDestination = sanitizeUrl(destinationUrl);

  const [href, setHref] = useState<string>(sanitizedDestination);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(enabled && sanitizedDestination));
  const [isShortened, setIsShortened] = useState<boolean>(false);
  const [trustScore, setTrustScore] = useState<number | undefined>(undefined);
  const [trustReport, setTrustReport] = useState<TrustScoreReport | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const activeRequestIdRef = useRef<number>(0);

  const executeTrackedLink = useCallback(async () => {
    if (!enabled || !destinationUrl) {
      setHref(sanitizeUrl(destinationUrl));
      setIsLoading(false);
      setIsShortened(false);
      setError(null);
      return;
    }

    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const shortLinkPromise = client.shortenUrl({
        destination: destinationUrl,
        channel,
        campaign,
        tenantId,
      });

      const trustPromise = autoResolveTrust
        ? client.resolveTrustScore(destinationUrl)
        : Promise.resolve(undefined);

      const [shortResult, resolvedTrust] = await Promise.all([
        shortLinkPromise,
        trustPromise,
      ]);

      if (isMountedRef.current && currentRequestId === activeRequestIdRef.current) {
        setHref(shortResult.shortUrl);
        setIsShortened(shortResult.shortUrl !== sanitizedDestination);
        setTrustScore(shortResult.trustScore ?? resolvedTrust?.score);
        if (resolvedTrust) {
          setTrustReport(resolvedTrust);
        }
        setIsLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current && currentRequestId === activeRequestIdRef.current) {
        // Fallback gracefully to sanitized destination on failure
        setHref(sanitizedDestination);
        setIsShortened(false);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      }
    }
  }, [destinationUrl, enabled, channel, campaign, tenantId, autoResolveTrust, client, sanitizedDestination]);

  useEffect(() => {
    isMountedRef.current = true;
    executeTrackedLink();

    return () => {
      isMountedRef.current = false;
      activeRequestIdRef.current++;
    };
  }, [executeTrackedLink]);

  return {
    href,
    isLoading,
    isShortened,
    trustScore,
    trustReport,
    error,
    refetch: executeTrackedLink,
  };
}
