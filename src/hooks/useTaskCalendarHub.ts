import { useCallback, useEffect, useState } from "react";
import type { CustomCalendar, CustomCalendarEvent } from "../types";
import { useUserPref } from "../utils/userPrefs";
import {
  deleteCustomCalendar,
  deleteCustomCalendarEvent,
  fetchCustomCalendars,
  saveCustomCalendar,
  saveCustomCalendarEvent,
} from "../utils/customCalendarsApi";

export function useTaskCalendarHub(enabled: boolean) {
  const [activeLens, setActiveLens] = useUserPref("taskCalendarActiveLens");
  const [favorites, setFavorites] = useUserPref("taskCalendarFavorites");
  const [expanded, setExpanded] = useUserPref("taskCalendarExpanded");

  const [customCalendars, setCustomCalendars] = useState<CustomCalendar[]>([]);
  const [customEvents, setCustomEvents] = useState<CustomCalendarEvent[]>([]);
  const [calendarModal, setCalendarModal] = useState<{ open: boolean; calendar?: CustomCalendar | null }>({ open: false });
  const [eventModal, setEventModal] = useState<{
    open: boolean;
    calendar?: CustomCalendar;
    event?: CustomCalendarEvent | null;
    initialDate?: string;
  }>({ open: false });

  const reloadCustom = useCallback(async () => {
    try {
      const res = await fetchCustomCalendars();
      setCustomCalendars(res.calendars);
      setCustomEvents(res.events);
    } catch {
      // Offline / permission-limited callers degrade gracefully.
    }
  }, []);

  useEffect(() => {
    if (enabled) reloadCustom();
  }, [enabled, reloadCustom]);

  const toggleFavorite = useCallback(
    (lensId: string) => {
      if (lensId === "tasks") return;
      const exists = favorites.includes(lensId);
      setFavorites(exists ? favorites.filter((id) => id !== lensId) : [...favorites, lensId]);
    },
    [favorites, setFavorites]
  );

  const handleSaveCalendar = useCallback(
    async (data: { id?: string; name: string; color: string; description: string; pinToBar: boolean }) => {
      const saved = await saveCustomCalendar({
        id: data.id,
        name: data.name,
        color: data.color,
        description: data.description || null,
      });
      setCustomCalendars((prev) => {
        const idx = prev.findIndex((c) => c.id === saved.id);
        return idx >= 0 ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
      });
      const lensId = `custom:${saved.id}`;
      if (!data.id && data.pinToBar && !favorites.includes(lensId)) {
        setFavorites([...favorites, lensId]);
      }
      setActiveLens(lensId);
    },
    [favorites, setFavorites, setActiveLens]
  );

  const handleDeleteCalendar = useCallback(
    async (id: string) => {
      await deleteCustomCalendar(id);
      setCustomCalendars((prev) => prev.filter((c) => c.id !== id));
      setCustomEvents((prev) => prev.filter((e) => e.calendarId !== id));
      const lensId = `custom:${id}`;
      if (favorites.includes(lensId)) setFavorites(favorites.filter((f) => f !== lensId));
      if (activeLens === lensId) setActiveLens("tasks");
    },
    [favorites, setFavorites, activeLens, setActiveLens]
  );

  const handleSaveEvent = useCallback(
    async (data: Parameters<typeof saveCustomCalendarEvent>[0]) => {
      const saved = await saveCustomCalendarEvent(data);
      setCustomEvents((prev) => {
        const idx = prev.findIndex((e) => e.id === saved.id);
        return idx >= 0 ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
      });
    },
    []
  );

  const handleDeleteEvent = useCallback(async (id: string) => {
    await deleteCustomCalendarEvent(id);
    setCustomEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return {
    activeLens,
    setActiveLens,
    favorites,
    toggleFavorite,
    expanded,
    toggleExpanded: () => setExpanded(!expanded),
    customCalendars,
    customEvents,
    calendarModal,
    setCalendarModal,
    eventModal,
    setEventModal,
    handleSaveCalendar,
    handleDeleteCalendar,
    handleSaveEvent,
    handleDeleteEvent,
  };
}
