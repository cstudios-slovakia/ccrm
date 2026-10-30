import { useCallback, useEffect, useState } from "react";
import type {
  ChatCrmEntity,
  ChatCrmLinks,
  CrmEntitiesResponse,
  CrmLinkSetRequest,
} from "../api/contract.ts";
import { type WaaiClient, WaaiApiError } from "../api/waaiClient.ts";

export interface UseChatCrmLinksOptions {
  client: WaaiClient;
  conversationId: string;
  initialLinks?: ChatCrmLinks;
  active?: boolean;
}

export interface UseChatCrmLinksReturn {
  crmLinks: ChatCrmLinks;
  loading: boolean;
  searching: boolean;
  saving: boolean;
  error: string | null;
  searchResults: ChatCrmEntity[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  loadLinks: () => Promise<void>;
  searchEntities: (query: string) => Promise<ChatCrmEntity[]>;
  linkEntity: (entity: ChatCrmEntity) => Promise<void>;
  unlinkEntity: (entity: ChatCrmEntity) => Promise<void>;
}

const DEFAULT_LINKS: ChatCrmLinks = {
  supported: false,
  links: [],
  ambiguous: null,
};

export function useChatCrmLinks({
  client,
  conversationId,
  initialLinks,
  active = true,
}: UseChatCrmLinksOptions): UseChatCrmLinksReturn {
  const [crmLinks, setCrmLinks] = useState<ChatCrmLinks>(initialLinks ?? DEFAULT_LINKS);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatCrmEntity[]>([]);

  useEffect(() => {
    if (initialLinks) {
      setCrmLinks(initialLinks);
    }
  }, [initialLinks]);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.get<ChatCrmLinks>(
        `/conversations/${encodeURIComponent(conversationId)}/crm-links`,
      );
      setCrmLinks(res);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof WaaiApiError ? err.message : "Failed to load CRM links");
    } finally {
      setLoading(false);
    }
  }, [client, conversationId]);

  useEffect(() => {
    if (active && !initialLinks) {
      void loadLinks();
    }
  }, [active, initialLinks, loadLinks]);

  const searchEntities = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setSearchResults([]);
        return [];
      }
      setSearching(true);
      setError(null);
      try {
        const res = await client.get<CrmEntitiesResponse>("/crm/entities", {
          query: {
            conversation_id: conversationId,
            q: trimmed,
          },
        });
        const entities = res.entities ?? [];
        setSearchResults(entities);
        return entities;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return [];
        setError(err instanceof WaaiApiError ? err.message : "Failed to search CRM entities");
        setSearchResults([]);
        return [];
      } finally {
        setSearching(false);
      }
    },
    [client, conversationId],
  );

  const linkEntity = useCallback(
    async (entity: ChatCrmEntity) => {
      setSaving(true);
      setError(null);
      try {
        const body: CrmLinkSetRequest = {
          entity_type: entity.entity_type,
          crm_id: entity.crm_id,
          linked: true,
        };
        const updated = await client.put<ChatCrmLinks>(
          `/conversations/${encodeURIComponent(conversationId)}/crm-links`,
          body,
        );
        setCrmLinks(updated);
        setSearchQuery("");
        setSearchResults([]);
      } catch (err) {
        setError(err instanceof WaaiApiError ? err.message : "Failed to link CRM entity");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [client, conversationId],
  );

  const unlinkEntity = useCallback(
    async (entity: ChatCrmEntity) => {
      setSaving(true);
      setError(null);
      try {
        const body: CrmLinkSetRequest = {
          entity_type: entity.entity_type,
          crm_id: entity.crm_id,
          linked: false,
        };
        const updated = await client.put<ChatCrmLinks>(
          `/conversations/${encodeURIComponent(conversationId)}/crm-links`,
          body,
        );
        setCrmLinks(updated);
      } catch (err) {
        setError(err instanceof WaaiApiError ? err.message : "Failed to unlink CRM entity");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [client, conversationId],
  );

  return {
    crmLinks,
    loading,
    searching,
    saving,
    error,
    searchResults,
    searchQuery,
    setSearchQuery,
    loadLinks,
    searchEntities,
    linkEntity,
    unlinkEntity,
  };
}
