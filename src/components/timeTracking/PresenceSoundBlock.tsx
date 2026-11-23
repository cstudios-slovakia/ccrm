import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { SettingsCard } from "./SettingsCard";
import { Switch } from "../ui/Switch";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { PRESENCE_SOUND_IDS, playPresenceSound, unlockPresenceAudio, type PresenceSoundId } from "../../utils/presenceSound.ts";

/** Settings → Time tracking, personal block: the presence chime's volume, mute and sound (TT2 D8.3, C18). */
export function PresenceSoundBlock() {
  const tt = useTimeTracking();
  const { t, presenceSound } = tt;
  // The slider follows the finger locally and saves on release, so a drag is one request.
  const [volume, setVolume] = useState(presenceSound.volume);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setVolume(presenceSound.volume);
  }, [presenceSound.volume]);

  const names: Record<PresenceSoundId, string> = {
    chimeA: t("Chime", "Zvonkohra", "Csengő"),
    chimeB: t("Marimba", "Marimba", "Marimba"),
    chimeC: t("Bell", "Zvon", "Harang"),
  };
  const preview = (id: PresenceSoundId) => {
    unlockPresenceAudio();
    playPresenceSound(id, volume);
  };
  const commitVolume = () => {
    dragging.current = false;
    if (volume !== presenceSound.volume) void tt.savePresenceSound({ ...presenceSound, volume });
  };

  return (
    <SettingsCard
      title={t("Presence sound", "Zvuk kontroly prítomnosti", "Jelenlét-ellenőrzés hangja")}
      titleTestId="tt-presence-sound"
      description={t(
        "Plays in one tab while the question is open. The notification and the dialog always appear; only the sound is yours to turn off.",
        "Hrá v jednej karte, kým je otázka otvorená. Oznámenie a dialóg sa zobrazia vždy; vypnúť môžete len zvuk.",
        "Egy lapon szól, amíg a kérdés nyitva van. Az értesítés és a párbeszédablak mindig megjelenik; csak a hangot kapcsolhatja ki.",
      )}
    >
      <label className="flex cursor-pointer items-center gap-3 text-ui text-gray-800">
        <Switch checked={presenceSound.muted} onChange={(muted) => void tt.savePresenceSound({ ...presenceSound, muted })} label={t("Mute", "Stlmiť", "Némítás")} testId="tt-presence-sound-mute" />
        {t("Mute", "Stlmiť", "Némítás")}
      </label>
      <label className="grid gap-1 ws-sm:max-w-72">
        <span className="type-label text-gray-600">{t("Volume", "Hlasitosť", "Hangerő")} · {Math.round(volume * 100)} %</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          disabled={presenceSound.muted}
          onPointerDown={() => { dragging.current = true; }}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          onPointerUp={commitVolume}
          onKeyUp={commitVolume}
          onBlur={commitVolume}
          className="h-2 w-full cursor-pointer accent-[var(--entity-accent-solid)] transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-entity-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="tt-presence-sound-volume"
        />
      </label>
      <fieldset className="grid gap-2" disabled={presenceSound.muted}>
        {PRESENCE_SOUND_IDS.map((id) => (
          <div key={id} className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-3 text-ui text-gray-800">
              <input type="radio" name="tt-presence-sound-pick" checked={presenceSound.sound === id} onChange={() => void tt.savePresenceSound({ ...presenceSound, sound: id })} className="size-4 accent-[var(--entity-accent-solid)]" data-testid={`tt-presence-sound-${id}`} />
              {names[id]}
            </label>
            <button
              type="button"
              onClick={() => preview(id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-ui text-gray-700 transition-all duration-150 hover:bg-gray-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-entity-ring focus-visible:ring-offset-2 disabled:opacity-50"
              data-testid={`tt-presence-sound-preview-${id}`}
            >
              <Play className="size-3.5" aria-hidden />
              {t("Preview", "Prehrať", "Lejátszás")}
            </button>
          </div>
        ))}
      </fieldset>
    </SettingsCard>
  );
}
