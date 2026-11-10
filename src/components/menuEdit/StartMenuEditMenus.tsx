import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  EyeOff,
  Home,
  LayoutDashboard,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Trash,
  Check,
} from "lucide-react";
import type { NavMenuItem } from "../StartMenu";
import type { StartMenuGroup } from "../../utils/startMenuLayout";
import { Kbd } from "./primitives";
import { MenuDivider, MenuItem, MenuPopover, MenuRadioItem, MenuSubToggle } from "./MenuPopover";
import type { MenuEditStrings } from "./menuEditStrings";

/** The floating menus of the Start menu edit dialog (see ItemMenu / GroupDelete artboards). */

export type EditGroup = StartMenuGroup & { items: NavMenuItem[] };

/** Icon + label of a module inside a menu row (the module keeps its own colour). */
const ModuleLabel: React.FC<{ item: NavMenuItem }> = ({ item }) => {
  const Icon = item.icon;
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <Icon className="size-4 shrink-0" style={{ color: item.color }} />
      <span className="truncate">{item.label}</span>
    </span>
  );
};

interface ItemMenuProps {
  anchor: HTMLElement;
  strings: MenuEditStrings;
  item: NavMenuItem;
  groups: EditGroup[];
  currentGroupId: string;
  index: number;
  count: number;
  pinned: boolean;
  canPin: boolean;
  onClose: () => void;
  onSetDefault: () => void;
  onTogglePin: () => void;
  onMoveToGroup: (groupId: string) => void;
  onMove: (direction: -1 | 1) => void;
  onHide: () => void;
}

export const ItemMenu: React.FC<ItemMenuProps> = ({
  anchor,
  strings,
  item,
  groups,
  currentGroupId,
  index,
  count,
  pinned,
  canPin,
  onClose,
  onSetDefault,
  onTogglePin,
  onMoveToGroup,
  onMove,
  onHide,
}) => {
  const [moveOpen, setMoveOpen] = useState(false);
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <MenuPopover anchor={anchor} onClose={onClose} ariaLabel={strings.itemActions(item.label)}>
      <MenuItem icon={Home} label={strings.setAsStart} onClick={run(onSetDefault)} />
      {canPin && (
        <MenuItem
          icon={pinned ? PinOff : Pin}
          label={pinned ? strings.unpinFromSidebar : strings.pinToSidebar}
          onClick={run(onTogglePin)}
        />
      )}
      <MenuDivider />
      <MenuSubToggle
        icon={ArrowRightLeft}
        label={strings.moveToGroup}
        expanded={moveOpen}
        onClick={() => setMoveOpen((v) => !v)}
      />
      {moveOpen &&
        groups.map((g) => (
          <MenuRadioItem
            key={g.id}
            label={g.name}
            checked={g.id === currentGroupId}
            onClick={run(() => onMoveToGroup(g.id))}
          />
        ))}
      <MenuDivider />
      <MenuItem
        icon={ArrowUp}
        label={strings.moveUp}
        trailing={<Kbd>{strings.kbdUp}</Kbd>}
        disabled={index <= 0}
        onClick={run(() => onMove(-1))}
      />
      <MenuItem
        icon={ArrowDown}
        label={strings.moveDown}
        trailing={<Kbd>{strings.kbdDown}</Kbd>}
        disabled={index >= count - 1}
        onClick={run(() => onMove(1))}
      />
      <MenuDivider />
      <MenuItem icon={EyeOff} label={strings.hideModule} hint={strings.hideModuleHint} onClick={run(onHide)} />
    </MenuPopover>
  );
};

interface GroupMenuProps {
  anchor: HTMLElement;
  strings: MenuEditStrings;
  group: EditGroup;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onClose: () => void;
  onRename: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

export const GroupMenu: React.FC<GroupMenuProps> = ({
  anchor,
  strings,
  group,
  isFirst,
  isLast,
  canDelete,
  onClose,
  onRename,
  onMove,
  onDelete,
}) => {
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <MenuPopover anchor={anchor} onClose={onClose} ariaLabel={strings.groupOptions(group.name)} widthClass="w-60">
      <MenuItem icon={Pencil} label={strings.rename} onClick={run(onRename)} />
      <MenuItem icon={ArrowLeft} label={strings.moveLeft} disabled={isFirst} onClick={run(() => onMove(-1))} />
      <MenuItem icon={ArrowRight} label={strings.moveRight} disabled={isLast} onClick={run(() => onMove(1))} />
      <MenuDivider />
      <MenuItem icon={Trash} label={strings.deleteGroupEllipsis} danger disabled={!canDelete} onClick={run(onDelete)} />
    </MenuPopover>
  );
};

interface HeaderMenuProps {
  anchor: HTMLElement;
  strings: MenuEditStrings;
  onClose: () => void;
  onCreateDashboard?: () => void;
  onRestoreDefaults: () => void;
}

export const HeaderMenu: React.FC<HeaderMenuProps> = ({ anchor, strings, onClose, onCreateDashboard, onRestoreDefaults }) => (
  <MenuPopover anchor={anchor} onClose={onClose} ariaLabel={strings.moreOptions} align="end" widthClass="w-64">
    {onCreateDashboard && (
      <>
        <MenuItem
          icon={LayoutDashboard}
          label={strings.createCustomDashboard}
          onClick={() => {
            onClose();
            onCreateDashboard();
          }}
        />
        <MenuDivider />
      </>
    )}
    <MenuItem
      icon={RotateCcw}
      label={strings.restoreDefaults}
      onClick={() => {
        onClose();
        onRestoreDefaults();
      }}
    />
  </MenuPopover>
);

interface StartScreenMenuProps {
  anchor: HTMLElement;
  strings: MenuEditStrings;
  modules: NavMenuItem[];
  currentId: string;
  onClose: () => void;
  onPick: (id: string) => void;
}

export const StartScreenMenu: React.FC<StartScreenMenuProps> = ({ anchor, strings, modules, currentId, onClose, onPick }) => (
  <MenuPopover
    anchor={anchor}
    onClose={onClose}
    ariaLabel={strings.startScreen}
    widthClass="w-54"
    className="max-h-[min(26rem,70vh)] overflow-y-auto scrollbar-thin"
  >
    {modules.map((m) => (
      <MenuItem
        key={m.id}
        label={<ModuleLabel item={m} />}
        role="menuitemradio"
        aria-checked={m.id === currentId}
        trailing={m.id === currentId ? <Check className="size-4 shrink-0 text-indigo-600" aria-hidden="true" /> : undefined}
        onClick={() => {
          onClose();
          onPick(m.id);
        }}
      />
    ))}
  </MenuPopover>
);

interface AddModulePopoverProps {
  anchor: HTMLElement;
  strings: MenuEditStrings;
  group: EditGroup;
  groups: EditGroup[];
  hidden: NavMenuItem[];
  withDashboard: boolean;
  onClose: () => void;
  onAdd: (itemId: string) => void;
  onCreateDashboard?: () => void;
}

/** "+ Pridať modul": the modules not in this group, each with where it is now. */
export const AddModulePopover: React.FC<AddModulePopoverProps> = ({
  anchor,
  strings,
  group,
  groups,
  hidden,
  withDashboard,
  onClose,
  onAdd,
  onCreateDashboard,
}) => {
  const [query, setQuery] = useState("");
  const candidates = useMemo(() => {
    const list: { item: NavMenuItem; where: string }[] = [];
    groups.forEach((g) => {
      if (g.id === group.id) return;
      g.items.forEach((item) => list.push({ item, where: g.name }));
    });
    hidden.forEach((item) => list.push({ item, where: strings.hiddenModules }));
    const q = query.trim().toLowerCase();
    return q
      ? list.filter(({ item }) => item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q))
      : list;
  }, [groups, hidden, group.id, query, strings.hiddenModules]);

  return (
    <MenuPopover
      anchor={anchor}
      onClose={onClose}
      ariaLabel={strings.addModuleToGroup(group.name)}
      autoFocus={false}
      className="gap-1"
    >
      <label className="flex items-center gap-2 h-9 px-3 mb-0.5 rounded-xl border border-slate-200 bg-white text-slate-400 transition-[border-color,box-shadow] duration-150 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20">
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Home" || e.key === "End") e.stopPropagation();
          }}
          placeholder={strings.searchModule}
          aria-label={strings.searchModule}
          className="border-0 outline-none flex-1 min-w-0 text-ui text-slate-800 placeholder:text-slate-400 bg-transparent"
        />
      </label>
      <div className="flex flex-col gap-px max-h-72 overflow-y-auto scrollbar-thin">
        {candidates.map(({ item, where }) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                onAdd(item.id);
              }}
              className="w-full flex items-center gap-3 min-h-11 pl-3 pr-1.5 py-1.5 rounded-xl text-left cursor-pointer transition-colors duration-100 outline-none hover:bg-slate-50 focus-visible:bg-slate-50 group/pick"
            >
              <Icon className="size-4 shrink-0" style={{ color: item.color }} />
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-ui font-medium text-slate-800 truncate">{item.label}</span>
                <span className="text-caption text-slate-500 truncate">{where}</span>
              </span>
              <span className="size-7 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-indigo-600 shrink-0 transition-transform duration-150 group-hover/pick:scale-105">
                <Plus className="size-4" aria-hidden="true" />
              </span>
            </button>
          );
        })}
        {candidates.length === 0 && (
          <p className="m-0 px-3 py-4 text-center text-caption text-slate-500">
            {query.trim() ? strings.noModulesFound : strings.allModulesAdded}
          </p>
        )}
      </div>
      {withDashboard && onCreateDashboard && (
        <>
          <MenuDivider />
          <MenuItem
            icon={LayoutDashboard}
            label={strings.createCustomDashboard}
            onClick={() => {
              onClose();
              onCreateDashboard();
            }}
          />
        </>
      )}
    </MenuPopover>
  );
};
