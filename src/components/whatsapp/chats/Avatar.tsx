import { useState } from "react";
import { Users } from "lucide-react";
import type { WaaiClient } from "../api/waaiClient.ts";
import { initialsFor } from "../lib/messageText.ts";

const SIZES = {
  sm: "size-8 type-meta",
  md: "size-11 type-label",
} as const;

/** A round picture of a chat or a person, or their initials (or a group glyph) when there is none. */
export const Avatar = ({
  client,
  src,
  name,
  group = false,
  size = "md",
}: {
  client: WaaiClient;
  src: string | null;
  name: string;
  group?: boolean;
  size?: keyof typeof SIZES;
}) => {
  const [failed, setFailed] = useState<string | null>(null);
  const box = `${SIZES[size]} shrink-0 rounded-full`;
  if (src && failed !== src) {
    return (
      <img
        src={client.mediaUrl(src)}
        alt=""
        loading="lazy"
        className={`${box} bg-slate-100 object-cover`}
        onError={() => setFailed(src)}
      />
    );
  }
  return (
    <span className={`${box} inline-flex items-center justify-center bg-green-100 font-semibold text-green-700`} aria-hidden>
      {group ? <Users className="size-1/2" /> : initialsFor(name)}
    </span>
  );
};
