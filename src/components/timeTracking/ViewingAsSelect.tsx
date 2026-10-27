import { CustomSelect } from "../ui/CustomSelect";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useViewingAs } from "./ViewingAsContext";

/** Me / Whole team / one person. Sits to the right of the time-tracking tabs. */
export function ViewingAsSelect({ users }: { users: { id?: string; name: string }[] }) {
  const { t, viewer } = useTimeTracking();
  const viewing = useViewingAs();
  if (!viewer.canTeam) return null;
  const value = viewing.mode === "team" ? "team" : viewing.mode === "user" && viewing.userId ? viewing.userId : "me";
  const people = users
    .filter((u): u is { id: string; name: string } => !!u.id)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="flex items-center gap-2" data-testid="viewing-as">
      <span className="text-ui text-slate-600">{t("Viewing as", "Zobraziť ako", "Megtekintés mint")}</span>
      <CustomSelect
        size="sm"
        fitLabel
        value={value}
        onChange={(next) => {
          if (next === "me") viewing.setMode("me");
          else if (next === "team") viewing.setMode("team");
          else {
            viewing.setUserId(next);
            viewing.setMode("user");
          }
        }}
        options={[
          { value: "me", label: t("Me", "Ja", "Én") },
          { value: "team", label: t("Whole team", "Celý tím", "Teljes csapat") },
          ...people.map((u) => ({ value: u.id, label: u.name })),
        ]}
      />
    </div>
  );
}
