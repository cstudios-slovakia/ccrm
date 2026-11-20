import { Users } from "lucide-react";
import { CustomSelect } from "../ui/CustomSelect";
import { useTimeTracking } from "../../hooks/useTimeTracking";
import { useViewingAs } from "./ViewingAsContext";

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Me / Whole team / one person, as an avatar button in the toolbar row (the same dropdown opens). */
export function ViewingAsSelect({ users }: { users: { id?: string; name: string }[] }) {
  const { t, viewer, userId } = useTimeTracking();
  const viewing = useViewingAs();
  if (!viewer.canTeam) return null;
  const value = viewing.mode === "team" ? "team" : viewing.mode === "user" && viewing.userId ? viewing.userId : "me";
  const people = users
    .filter((u): u is { id: string; name: string } => !!u.id)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string | null | undefined) => people.find((u) => u.id === id)?.name ?? "";
  const shownName = value === "me" ? nameOf(userId) : value === "team" ? "" : nameOf(value);
  const avatar = (
    <>
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-micro font-bold text-indigo-800" aria-hidden>
        {value === "team" ? <Users className="size-3.5" /> : initialsOf(shownName) || "·"}
      </span>
      <span className="font-medium text-slate-500">{t("Viewing as", "Zobraziť ako", "Megtekintés mint")}</span>
    </>
  );
  return (
    <div className="flex items-center" data-testid="viewing-as">
      <CustomSelect
        unstyled
        fitLabel
        align="right"
        className="h-10 gap-2 rounded-2xl border border-slate-200 bg-white py-1 pl-1.5 pr-3 text-ui font-semibold text-slate-700 hover:bg-slate-50 [&>span]:gap-2"
        icon={avatar}
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
