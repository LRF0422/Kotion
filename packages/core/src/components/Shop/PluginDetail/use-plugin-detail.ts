import { APIS, event, PLUGIN_CHANGED, useApi } from "@kn/common";
import { useCallback, useEffect, useRef, useState } from "react";
import { PluginRecord } from "../plugin-model";

export type PluginDetailStatus = "loading" | "ready" | "not-found" | "error";

interface PluginDetailState {
  status: PluginDetailStatus;
  plugin?: PluginRecord;
  error?: unknown;
  refreshing: boolean;
}

export const usePluginDetail = (pluginId?: string) => {
  const requestSequence = useRef(0);
  const [state, setState] = useState<PluginDetailState>({
    status: "loading",
    refreshing: false,
  });

  const load = useCallback(
    async (background = false) => {
      const sequence = ++requestSequence.current;

      if (!pluginId) {
        setState({ status: "not-found", refreshing: false });
        return;
      }

      if (background) {
        setState((current) => ({ ...current, refreshing: true }));
      } else {
        setState({ status: "loading", refreshing: false });
      }

      try {
        const response = await useApi(APIS.GET_PLUGIN, { id: pluginId });
        if (sequence !== requestSequence.current) return;

        const plugin = response.data as PluginRecord | undefined;
        if (!plugin?.id) {
          setState({ status: "not-found", refreshing: false });
          return;
        }

        setState({ status: "ready", plugin, refreshing: false });
      } catch (error) {
        if (sequence !== requestSequence.current) return;
        if (background) {
          setState((current) => ({ ...current, refreshing: false, error }));
        } else {
          setState({ status: "error", error, refreshing: false });
        }
      }
    },
    [pluginId],
  );

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const handlePluginChange = () => void load(true);
    event.on(PLUGIN_CHANGED, handlePluginChange);
    return () => {
      event.off(PLUGIN_CHANGED, handlePluginChange);
    };
  }, [load]);

  return {
    ...state,
    retry: () => load(false),
    refresh: () => load(true),
  };
};
