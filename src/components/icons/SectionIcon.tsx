import { sectionVisual } from "../../utils/sectionVisuals";

/**
 * The section's own icon, in its group colour, at the shared stroke weight.
 * Pass `color` only when the icon sits on a solid chip (usually white).
 */
export function SectionIcon({
  id,
  className,
  color,
}: {
  id: string;
  className?: string;
  color?: string;
}) {
  const visual = sectionVisual(id);
  if (!visual) return null;
  const Icon = visual.icon;
  const tint = color ?? visual.color;
  return <Icon className={className} style={{ color: tint }} />;
}
