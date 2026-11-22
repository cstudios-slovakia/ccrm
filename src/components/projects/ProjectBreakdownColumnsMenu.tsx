import React from "react";
import { ListViewMenu, type ListViewSort } from "../common/ListViewMenu";
import {
  moveBreakdownColumn,
  type BreakdownColumnConfig,
  type BreakdownSortKey,
} from "../../utils/projectBreakdown";

interface ProjectBreakdownColumnsMenuProps {
  t: (en: string, sk: string, hu: string) => string;
  sort: ListViewSort<BreakdownSortKey>;
  onSortChange: (next: ListViewSort<BreakdownSortKey>) => void;
  columns: BreakdownColumnConfig[];
  onColumnsChange: (next: BreakdownColumnConfig[]) => void;
  columnLabel: (col: BreakdownColumnConfig) => string;
  onReset: () => void;
}

export const ProjectBreakdownColumnsMenu: React.FC<ProjectBreakdownColumnsMenuProps> = ({
  t,
  sort,
  onSortChange,
  columns,
  onColumnsChange,
  columnLabel,
  onReset,
}) => {
  const sortOptions: { value: BreakdownSortKey; label: string }[] = [
    { value: "value", label: t("Total Value", "Celková hodnota", "Teljes érték") },
    { value: "name", label: t("Client / Project Name", "Názov klienta / projektu", "Ügyfél / Projekt neve") },
    { value: "invoicable", label: t("Remaining Invoiceable", "Zostáva vyfakturovať", "Számlázható") },
    { value: "stillToBePaid", label: t("Yet to be Paid", "Zostáva uhradiť", "Még fizetendő") },
    { value: "timeWorked", label: t("Time Worked", "Odpracovaný čas", "Ledolgozott idő") },
    { value: "laborCost", label: t("Labor Cost", "Náklady práce", "Bérköltség") },
    { value: "margin", label: t("Gross Margin", "Hrubá marža", "Bruttó árrés") },
    { value: "effectiveRate", label: t("Effective Hourly Rate", "Efektívna sadzba", "Effektív óradíj") },
    { value: "tasksOpen", label: t("Open Tasks", "Otvorené úlohy", "Nyitott feladatok") },
    { value: "tasksReopened", label: t("Reopened Tasks", "Znovu otvorené úlohy", "Újranyitott feladatok") },
    { value: "tasksWait", label: t("Task Queue Wait", "Čakanie úloh", "Feladat várakozás") },
    { value: "ticketsOpen", label: t("Open Tickets", "Otvorené tikety", "Nyitott jegyek") },
    { value: "ticketsWait", label: t("Ticket Queue Wait", "Čakanie tiketov", "Jegy várakozás") },
  ];

  return (
    <ListViewMenu<BreakdownSortKey, BreakdownColumnConfig>
      t={t}
      sort={sort}
      sortOptions={sortOptions}
      onSortChange={onSortChange}
      columns={columns}
      onColumnsChange={onColumnsChange}
      columnLabel={columnLabel}
      lockedColumnKey="entity"
      lockedTitle={t(
        "The Client / Project / Employee hierarchy always leads the row.",
        "Hierarchia Klient / Projekt / Zamestnanec je vždy prvá v riadku.",
        "Az Ügyfél / Projekt / Alkalmazott hierarchia mindig a sor élén áll.",
      )}
      moveColumn={moveBreakdownColumn}
      canEditColumns={true}
      columnsScope={t(
        "Your personal breakdown layout — saved across devices.",
        "Váš osobný rozpad stĺpcov — uložený pre všetky zariadenia.",
        "Személyes bontási elrendezés — minden eszközön mentve.",
      )}
      onReset={onReset}
    />
  );
};
