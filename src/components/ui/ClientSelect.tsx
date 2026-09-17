import React from "react";
import { UserPlus } from "lucide-react";
import type { Lead } from "../../types";
import { CustomSelect } from "./CustomSelect";
import { useQuickAddClient, type QuickAddKind } from "./QuickAddClient";
import { getStoredLanguage } from "../../utils/translations";

/**
 * The one lead / client picker of the app.
 *
 * Every screen used to grow its own searchable client dropdown, so the same
 * choice looked different in the project card, the task drawer and the invoice
 * wizard. They all come through here now: one panel, one search box, and the
 * "add new" button beside it that creates the record without leaving the form.
 */

const ADD_LABEL = {
  en: "Add a new lead / client",
  sk: "Pridať nový lead / klienta",
  hu: "Új lead / ügyfél hozzáadása",
} as const;

interface ClientSelectProps {
  leads: Lead[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Adds a leading option with an empty value — "no client", "all clients", … */
  noneLabel?: React.ReactNode;
  /** Ids left out of the list (the record being edited, ones already picked). */
  excludeIds?: string[];
  /** Appends the city to the name. On by default — the register is full of namesakes. */
  showCity?: boolean;
  /** Overrides the option label entirely. */
  renderLabel?: (lead: Lead) => string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  panelClassName?: string;
  icon?: React.ReactNode;
  /** What the add-new button creates by default. */
  addKind?: QuickAddKind;
  /** Off where creating makes no sense — list filters, mostly. */
  allowAdd?: boolean;
  /** Runs in place of plain selection once a record has just been created. */
  onCreated?: (lead: Lead) => void;
  searchPlaceholder?: string;
}

/** Everything the search box should match on, not just what the row shows. */
const searchTextFor = (lead: Lead, label: string): string =>
  [label, lead.name, lead.city, lead.phone, lead.email, lead.companyId, lead.contactPerson]
    .filter(Boolean)
    .join(" ");

export const ClientSelect: React.FC<ClientSelectProps> = ({
  leads,
  value,
  onChange,
  placeholder,
  noneLabel,
  excludeIds,
  showCity = true,
  renderLabel,
  disabled = false,
  size = "md",
  className = "",
  panelClassName = "",
  icon,
  addKind = "client",
  allowAdd = true,
  onCreated,
  searchPlaceholder,
}) => {
  const quickAdd = useQuickAddClient();
  const addLabel = ADD_LABEL[getStoredLanguage()];

  const excluded = excludeIds && excludeIds.length ? new Set(excludeIds) : null;
  const options = leads
    .filter(l => !excluded || !excluded.has(l.id))
    .map(l => {
      const label = renderLabel ? renderLabel(l) : showCity && l.city ? `${l.name} (${l.city})` : l.name;
      return { value: l.id, label, searchText: searchTextFor(l, label) };
    });

  return (
    <CustomSelect
      searchable
      searchPlaceholder={searchPlaceholder}
      value={value}
      onChange={onChange}
      disabled={disabled}
      size={size}
      icon={icon}
      className={className}
      panelClassName={panelClassName}
      placeholder={placeholder}
      options={noneLabel !== undefined ? [{ value: "", label: noneLabel }, ...options] : options}
      addNewLabel={addLabel}
      addNewIcon={<UserPlus className="h-4 w-4" />}
      onAddNew={
        allowAdd && quickAdd.enabled && !disabled
          ? () =>
              quickAdd.open(lead => {
                onChange(lead.id);
                onCreated?.(lead);
              }, addKind)
          : undefined
      }
    />
  );
};

export default ClientSelect;
