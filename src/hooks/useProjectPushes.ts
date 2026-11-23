import { useEffect, useState } from "react";
import { fetchProjectPushes, type ProjectPush } from "../utils/projectPushesApi";

const NONE: readonly ProjectPush[] = [];

/**
 * One project's GitHub pushes for its timeline, newest first. Fetched when `enabled` turns on (the
 * timeline of a paired project is shown) and again each time it does; no polling. While loading, and
 * after a failure, `pushes` is what was loaded for the same project before (or empty): the timeline's
 * own events never wait for it. A response for an earlier project is ignored.
 */
export const useProjectPushes = (projectId: string, enabled: boolean): { pushes: readonly ProjectPush[]; failed: boolean } => {
  const [state, setState] = useState<{ projectId: string; pushes: readonly ProjectPush[]; failed: boolean }>({ projectId, pushes: NONE, failed: false });

  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    setState((prev) => (prev.projectId === projectId ? { ...prev, failed: false } : { projectId, pushes: NONE, failed: false }));
    fetchProjectPushes(projectId)
      .then((pushes) => {
        if (!stale) setState({ projectId, pushes, failed: false });
      })
      .catch(() => {
        if (!stale) setState((prev) => ({ projectId, pushes: prev.projectId === projectId ? prev.pushes : NONE, failed: true }));
      });
    return () => {
      stale = true;
    };
  }, [projectId, enabled]);

  return state.projectId === projectId ? state : { pushes: NONE, failed: false };
};
