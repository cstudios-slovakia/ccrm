import React from "react";
import type { Language } from "../../utils/translations";

/**
 * The 1-5 star priority control.
 *
 * Lifted out of LeadsDatagrid (where it was a local `renderStars`) when
 * projects gained a rating of their own: a lead and a project now wear the
 * literal same widget, so the two lists cannot drift into two different
 * pictures of the same idea.
 *
 * Stars are drawn as amber dots rather than star glyphs — the shape the leads
 * list has always used, dense enough to sit inside a table row without
 * stealing the row's attention.
 *
 * Read-only is the default: `onChange` is what makes it a control at all, so a
 * caller that cannot write (a read-only role, a closed card) simply leaves it
 * out and gets the same picture without the buttons.
 */
export interface StarRatingProps {
  /** 1-5, or 0 / undefined for "not rated" — an empty row of dots. */
  rating?: number;
  /** Omitted makes the whole control read-only. */
  onChange?: (rating: number) => void;
  userLanguage?: Language;
  /** Extra classes on the wrapper, e.g. `scale-90 origin-left` inside a dense row. */
  className?: string;
}

const HOW_MANY = [1, 2, 3, 4, 5];

export const StarRating: React.FC<StarRatingProps> = ({ rating = 0, onChange, userLanguage = "en", className = "" }) => {
  const rateLabel = userLanguage === "sk" ? "Hodnotiť" : userLanguage === "hu" ? "Értékelés" : "Rate";

  return (
    <div
      className={`flex items-center gap-1 select-none animate-fade-in ${className}`}
      /* The control lives inside rows and cards that navigate on click. Rating
         something is not "open it", so the click stops here. */
      onClick={(e) => e.stopPropagation()}
    >
      {HOW_MANY.map((star) => {
        const isFilled = star <= rating;
        return (
          <button
            key={star}
            type="button"
            onClick={() => onChange?.(star)}
            disabled={!onChange}
            className={`focus:outline-none transition-all duration-150 p-0.5 ${
              onChange ? "cursor-pointer hover:scale-130 active:scale-90" : "cursor-default"
            }`}
            aria-label={`${rateLabel} ${star}`}
          >
            <div
              className={`h-2 w-2 rounded-full transition-colors duration-150 ${
                isFilled ? "bg-amber-500 shadow-sm animate-pulse" : "bg-slate-200"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};
