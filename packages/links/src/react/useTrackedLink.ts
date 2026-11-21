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
  const [isLoading, setIsLoading] = useState<boolean>(
    Boolean((enabled || autoResolveTrust) && destinationUrl)
  );
  const [isShortened, setIsShortened] = useState<boolean>(false);
  const [trustScore, setTrustScore] = useState<number | undefined>(undefined);
  const [trustReport, setTrustReport] = useState<TrustScoreReport | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const activeRequestIdRef = useRef<number>(0);

  const executeTrackedLink = useCallback(async () => {
    if (!destinationUrl) {
      setHref('');
      setIsLoading(false);
      setIsShortened(false);
      setError(null);
      return;
    }

    if (!enabled && !autoResolveTrust) {
      setHref(sanitizeUrl(destinationUrl));
      setIsLoading(false);
      setIsShortened(false);
      setError(null);
      return;
    }

    const currentRequestId = ++activeRequestIdRef.current;
    setIsLoading(true);
    setError(null);

    // 1. Run shortening if enabled
    const shortPromise = enabled
      ? client.shortenUrl({
          destination: destinationUrl,
          channel,
          campaign,
          tenantId,
        })
      : Promise.resolve(null);

    // 2. Run trust resolution if requested
    const trustPromise = autoResolveTrust
      ? client.resolveTrustScore(destinationUrl)
      : Promise.resolve(null);

    const [shortResultSettled, trustResultSettled] = await Promise.allSettled([
      shortPromise,
      trustPromise,
    ]);

    if (!isMountedRef.current || currentRequestId !== activeRequestIdRef.current) {
      return;
    }

    let finalHref = sanitizedDestination;
    let finalIsShortened = false;
    let finalTrustScore: number | undefined = undefined;
    let finalTrustReport: TrustScoreReport | undefined = undefined;
    let caughtError: Error | null = null;

    // Handle shortener outcome
    if (shortResultSettled.status === 'fulfilled' && shortResultSettled.value) {
      finalHref = shortResultSettled.value.shortUrl;
      finalIsShortened = shortResultSettled.value.shortUrl !== sanitizedDestination;
      if (typeof shortResultSettled.value.trustScore === 'number') {
        finalTrustScore = shortResultSettled.value.trustScore;
      }
    } else if (shortResultSettled.status === 'rejected') {
      finalHref = sanitizedDestination;
      finalIsShortened = false;
      caughtError =
        shortResultSettled.reason instanceof Error
          ? shortResultSettled.reason
          : new Error(String(shortResultSettled.reason));
    }

    // Handle trust resolution outcome independently
    if (trustResultSettled.status === 'fulfilled' && trustResultSettled.value) {
      finalTrustReport = trustResultSettled.value;
      if (finalTrustScore === undefined) {
        finalTrustScore = trustResultSettled.value.score;
      }
    } else if (trustResultSettled.status === 'rejected' && !caughtError) {
      caughtError =
        trustResultSettled.reason instanceof Error
          ? trustResultSettled.reason
          : new Error(String(trustResultSettled.reason));
    }

    setHref(finalHref);
    setIsShortened(finalIsShortened);
    setTrustScore(finalTrustScore);
    if (finalTrustReport) {
      setTrustReport(finalTrustReport);
    }
    setError(caughtError);
    setIsLoading(false);
  }, [
    destinationUrl,
    enabled,
    channel,
    campaign,
    tenantId,
    autoResolveTrust,
    client,
    sanitizedDestination,
  ]);

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
