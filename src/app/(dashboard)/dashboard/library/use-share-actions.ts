"use client";

import { useState, useTransition } from "react";

import {
  createOrFetchShareLinkAction,
  revokeShareLinkAction,
} from "@/server/actions/library";
import type { LibraryAsset } from "@/types/library";

type ShareDialogState = {
  loading: boolean;
  error: string | null;
  url: string | null;
  token: string | null;
  success: boolean;
  hasShareToken: boolean;
};

const initialState: ShareDialogState = {
  loading: false,
  error: null,
  url: null,
  token: null,
  success: false,
  hasShareToken: false,
};

function buildShareUrl(token: string | null) {
  if (!token) return null;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/share/${token}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/share/${token}`;
  }
  return `/share/${token}`;
}

export function useShareActions(
  items: LibraryAsset[],
  setItems: React.Dispatch<React.SetStateAction<LibraryAsset[]>>,
) {
  const [shareAsset, setShareAsset] = useState<LibraryAsset | null>(null);
  const [state, setState] = useState<ShareDialogState>(initialState);
  const [isPending, startTransition] = useTransition();

  const openShareForAsset = (asset: LibraryAsset) => {
    if (!asset.assetId) {
      return;
    }
    setShareAsset(asset);
    setState({
      loading: false,
      error: null,
      token: asset.shareToken,
      url: buildShareUrl(asset.shareToken),
      success: false,
      hasShareToken: Boolean(asset.shareToken),
    });
  };

  const closeShareDialog = () => {
    setShareAsset(null);
    setState(initialState);
  };

  const fetchShareLink = () => {
    if (!shareAsset?.assetId) return;
    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      success: false,
      hasShareToken: Boolean(shareAsset?.shareToken),
    }));

    startTransition(() => {
      createOrFetchShareLinkAction(shareAsset.assetId as string)
        .then((result) => {
          if (!result?.ok) {
            setState((prev) => ({
              ...prev,
              loading: false,
              error: result?.error ?? "Unable to generate share link.",
            }));
            return;
          }

          const url = buildShareUrl(result.shareToken ?? shareAsset.shareToken ?? null);
          setState({
            loading: false,
            error: null,
            url,
            token: result.shareToken ?? shareAsset.shareToken ?? null,
            success: true,
            hasShareToken: Boolean(result.shareToken ?? shareAsset.shareToken),
          });

          if (url && result.shareToken) {
            setItems((prev) =>
              prev.map((item) =>
                item.id === shareAsset.id
                  ? {
                      ...item,
                      shareToken: result.shareToken ?? item.shareToken,
                      shareCreatedAt: new Date().toISOString(),
                    }
                  : item,
              ),
            );
            setShareAsset((prev) =>
              prev
                ? {
                    ...prev,
                    shareToken: result.shareToken ?? prev.shareToken,
                    shareCreatedAt: new Date().toISOString(),
                  }
                : prev,
            );
          }
        })
        .catch(() => {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Unable to generate share link.",
            hasShareToken: Boolean(prev.token),
          }));
        });
    });
  };

  const revokeShareLink = () => {
    if (!shareAsset?.assetId) return;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      success: false,
      hasShareToken: Boolean(shareAsset?.shareToken),
    }));

    startTransition(() => {
      revokeShareLinkAction(shareAsset.assetId as string)
        .then((result) => {
          if (!result?.ok) {
            setState((prev) => ({
              ...prev,
              loading: false,
              error: result?.error ?? "Unable to revoke share link.",
            }));
            return;
          }

          setItems((prev) =>
            prev.map((item) =>
              item.id === shareAsset.id
                ? { ...item, shareToken: null, shareCreatedAt: null }
                : item,
            ),
          );
          setShareAsset((prev) =>
            prev ? { ...prev, shareToken: null, shareCreatedAt: null } : prev,
          );
          setState({
            loading: false,
            error: null,
            url: null,
            token: null,
            success: true,
            hasShareToken: false,
          });
        })
        .catch(() => {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Unable to revoke share link.",
            hasShareToken: Boolean(prev.token),
          }));
        });
    });
  };

  return {
    shareAsset,
    shareState: { ...state, loading: state.loading || isPending },
    openShareForAsset,
    closeShareDialog,
    fetchShareLink,
    revokeShareLink,
  };
}
