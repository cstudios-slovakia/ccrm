import React from "react";
import {
  BarChart3,
  Brain,
  Briefcase,
  ClipboardList,
  Coins,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  Mail,
  MessageCircle,
  Package,
  PencilLine,
  Share2,
  Sparkles,
  TableProperties,
  Timer,
  Users,
  Workflow,
} from "lucide-react";
import { EmployeeTieIcon } from "../components/icons/EmployeeTieIcon";
import { FlockIcon } from "../components/icons/FlockIcon";
import {
  SECTION_PALETTE,
  type SectionGroupId,
  type SectionVisualId,
} from "./sectionPalette.ts";

/**
 * The section icon, stroke and chip that the sidebar, Start menu, module setup
 * and page headers all share. Colours and groups live in `sectionPalette.ts`.
 * Every icon is a 2px stroke, including the two custom ones.
 */

export const SECTION_ICON_STROKE = 2;

export type { SectionGroupId, SectionVisualId };

type IconType = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
  color?: string;
  size?: number;
}>;

export interface SectionVisual {
  id: SectionVisualId;
  group: SectionGroupId;
  icon: IconType;
  /** Solid icon colour. */
  color: string;
  /** Soft chip fill, the same hue at low opacity. */
  bg: string;
  /** Lucide (or custom) component name, so the glyph stays checkable. */
  glyph: string;
}

const stroke = (Icon: IconType): IconType => {
  const Wrapped: IconType = (props) =>
    React.createElement(Icon, { ...props, strokeWidth: props.strokeWidth ?? SECTION_ICON_STROKE });
  return Wrapped;
};

const chip = (hex: string) => `${hex}1f`;

const ICONS: Record<SectionVisualId, IconType> = {
  dashboard: LayoutDashboard,
  overview: BarChart3,
  tasks: ListTodo,
  meetings: PencilLine,
  "time-tracking": Timer,
  clients: Users,
  leads: TableProperties,
  employees: EmployeeTieIcon,
  projects: Briefcase,
  tickets: LifeBuoy,
  warehouse: Package,
  orders: ClipboardList,
  financial: Coins,
  invoices: FileText,
  rag_ai: Brain,
  automation: Workflow,
  sai: FlockIcon,
  email: Mail,
  social_media: Share2,
  whatsapp: MessageCircle,
  files: FolderOpen,
  updates: Sparkles,
};

const build = (id: SectionVisualId): SectionVisual => {
  const palette = SECTION_PALETTE[id];
  return {
    id,
    group: palette.group,
    icon: stroke(ICONS[id]),
    color: palette.color,
    bg: chip(palette.color),
    glyph: palette.glyph,
  };
};

export const SECTION_VISUALS: Record<SectionVisualId, SectionVisual> = {
  dashboard: build("dashboard"),
  overview: build("overview"),
  tasks: build("tasks"),
  meetings: build("meetings"),
  "time-tracking": build("time-tracking"),
  clients: build("clients"),
  leads: build("leads"),
  employees: build("employees"),
  projects: build("projects"),
  tickets: build("tickets"),
  warehouse: build("warehouse"),
  orders: build("orders"),
  financial: build("financial"),
  invoices: build("invoices"),
  rag_ai: build("rag_ai"),
  automation: build("automation"),
  sai: build("sai"),
  email: build("email"),
  social_media: build("social_media"),
  whatsapp: build("whatsapp"),
  files: build("files"),
  updates: build("updates"),
};

export const sectionVisual = (id: string): SectionVisual | undefined =>
  SECTION_VISUALS[id as SectionVisualId];

/** Replace a module row's icon and colours when it is a known section. */
export function applySectionVisual<T extends { id: string; icon?: IconType; color?: string; bgColor?: string }>(
  item: T
): T {
  const visualForItem = sectionVisual(item.id);
  if (!visualForItem) return item;
  return {
    ...item,
    icon: visualForItem.icon,
    color: visualForItem.color,
    bgColor: visualForItem.bg,
  };
}
