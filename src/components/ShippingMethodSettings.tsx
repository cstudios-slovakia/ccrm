import React, { useMemo, useState } from "react";
import { SectionCard } from "./settings/SectionCard";
import {
  Truck,
  Plus,
  Trash2,
  RotateCcw,
  GripVertical,
  Package,
  Store,
  Send,
  ChevronUp,
  ChevronDown,
  Check
} from "lucide-react";
import type { CompanyBillingSettings } from "../types";
import type { Language } from "../utils/translations";
import { cn } from "../utils/cn";
import {
  DEFAULT_SHIPPING_METHODS,
  getAvailableShippingMethods
} from "../utils/shipping";

interface ShippingMethodSettingsProps {
  companyBillingSettings?: CompanyBillingSettings | null;
  setCompanyBillingSettings?: React.Dispatch<
    React.SetStateAction<CompanyBillingSettings | null>
  >;
  userLanguage: Language;
  canEdit: boolean;
}

const POPULAR_SUGGESTIONS = [
  "DPD Kuriér",
  "Packeta / Zásielkovňa",
  "GLS Expres",
  "SPS Kuriér",
  "Slovenská pošta",
  "Osobný odber",
  "DHL Express",
  "Kuriér na adresu"
] as const;

export const ShippingMethodSettings: React.FC<ShippingMethodSettingsProps> = ({
  companyBillingSettings,
  setCompanyBillingSettings,
  userLanguage,
  canEdit
}) => {
  const t = (en: string, sk: string, hu: string) =>
    userLanguage === "sk" ? sk : userLanguage === "hu" ? hu : en;

  const toast = (msg: string, type: "info" | "error" = "info") =>
    (window as unknown as { showToast?: (m: string, t?: string) => void }).showToast?.(
      msg,
      type
    );

  const activeMethods = useMemo(
    () => getAvailableShippingMethods(companyBillingSettings),
    [companyBillingSettings?.shippingMethods]
  );

  const [newMethodInput, setNewMethodInput] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveMethods = (next: string[]) => {
    if (!setCompanyBillingSettings) return;
    setCompanyBillingSettings(prev => ({
      ...(prev || {
        companyName: "",
        companySubtitle: "",
        companyLogoUrl: "",
        street: "",
        city: "",
        postalCode: "",
        country: "",
        companyId: "",
        taxId: "",
        vatId: "",
        email: "",
        phone: "",
        phoneSecondary: "",
        website: "",
        iban: "",
        swift: "",
        bankName: "",
        defaultPaymentDueDays: 14,
        defaultVatRate: 23,
        vatRates: [23, 19, 10, 5, 0],
        defaultWarrantyText: "",
        defaultDurationText: "",
        defaultStartDateText: "",
        defaultNextSteps: "",
        defaultSocialProof: "",
        defaultUspCards: []
      }),
      shippingMethods: next
    }));
  };

  const handleAdd = (nameToAdd?: string) => {
    if (!canEdit) return;
    const target = (nameToAdd !== undefined ? nameToAdd : newMethodInput).trim();
    if (!target) return;

    if (activeMethods.some(m => m.toLowerCase() === target.toLowerCase())) {
      toast(
        t(
          "This shipping method is already in the list.",
          "Tento spôsob dopravy už existuje v zozname.",
          "Ez a szállítási mód már szerepel a listában."
        ),
        "error"
      );
      return;
    }

    const next = [...activeMethods, target];
    saveMethods(next);
    if (nameToAdd === undefined) {
      setNewMethodInput("");
    }
    toast(
      t(
        `Added shipping method: "${target}"`,
        `Pridaný spôsob dopravy: "${target}"`,
        `Hozzáadva: "${target}"`
      )
    );
  };

  const handleRemove = (methodToRemove: string) => {
    if (!canEdit) return;
    if (activeMethods.length <= 1) {
      toast(
        t(
          "At least one shipping method must remain.",
          "Aspoň jeden spôsob dopravy musí zostať.",
          "Legalább egy szállítási módnak maradnia kell."
        ),
        "error"
      );
      return;
    }

    const next = activeMethods.filter(m => m !== methodToRemove);
    saveMethods(next);
    toast(
      t(
        `Removed shipping method: "${methodToRemove}"`,
        `Odstránený spôsob dopravy: "${methodToRemove}"`,
        `Eltávolítva: "${methodToRemove}"`
      )
    );
  };

  const handleMove = (index: number, direction: -1 | 1) => {
    if (!canEdit) return;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeMethods.length) return;

    const next = [...activeMethods];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    saveMethods(next);
  };

  const handleDrop = (targetIdx: number) => {
    if (!canEdit || draggedIndex === null || draggedIndex === targetIdx) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const next = [...activeMethods];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(targetIdx, 0, moved);
    saveMethods(next);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleReset = () => {
    if (!canEdit) return;
    const confirmMsg = t(
      "Reset shipping methods to the default list?",
      "Obnoviť spôsoby dopravy na predvolený zoznam?",
      "Visszaállítja a szállítási módokat az alapértelmezettre?"
    );
    if (!window.confirm(confirmMsg)) return;

    saveMethods([...DEFAULT_SHIPPING_METHODS]);
    toast(
      t(
        "Shipping methods reset to defaults.",
        "Spôsoby dopravy boli obnovené na predvolené.",
        "Szállítási módok visszaállítva az alapértelmezettre."
      )
    );
  };

  const getMethodIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("osobný") || lower.includes("odber") || lower.includes("pickup") || lower.includes("személyes")) {
      return <Store className="size-4 text-amber-600 shrink-0" />;
    }
    if (lower.includes("packeta") || lower.includes("zásielkovňa") || lower.includes("zasielkovna") || lower.includes("box")) {
      return <Package className="size-4 text-rose-600 shrink-0" />;
    }
    if (lower.includes("posta") || lower.includes("pošta")) {
      return <Send className="size-4 text-emerald-600 shrink-0" />;
    }
    return <Truck className="size-4 text-blue-600 shrink-0" />;
  };

  return (
    <SectionCard
      title={t(
                  "Shipping Carriers & Methods",
                  "Spôsoby dopravy a kuriéri",
                  "Szállítási módok és futárszolgálatok"
                )}
      description={activeMethods.length}
      action={<div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-micro font-bold text-slate-600">{activeMethods.length}</span>
            {canEdit && (
<button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-ui font-medium transition-all shadow-2xs cursor-pointer self-start ws-sm:self-auto"
            title={t(
              "Reset to default carriers",
              "Obnoviť na predvolených prepravcov",
              "Alapértelmezett beállítások visszaállítása"
            )}
          >
            <RotateCcw className="size-3.5 text-slate-400" />
            <span>
              {t("Reset to defaults", "Obnoviť predvolené", "Alapértelmezett")}
            </span>
          </button>
            )}
          </div>}
    >
      {/* Reorderable Methods List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="type-overline text-slate-500 block">
            {t(
              "Active Shipping Methods (In Display Order)",
              "Aktívne spôsoby dopravy (podľa poradia zobrazenia)",
              "Aktív szállítási módok (megjelenési sorrendben)"
            )}
          </label>
          <span className="text-micro text-slate-400 hidden ws-sm:inline">
            {t(
              "Drag or use arrows to change ordering in order view",
              "Poradie určuje zobrazenie tlačidiel v objednávkach",
              "A sorrend határozza meg a megjelenést a rendelésekben"
            )}
          </span>
        </div>

        <div className="space-y-2">
          {activeMethods.map((method, index) => {
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;

            return (
              <div
                key={method}
                draggable={canEdit}
                onDragStart={() => setDraggedIndex(index)}
                onDragOver={e => {
                  e.preventDefault();
                  if (canEdit && dragOverIndex !== index) {
                    setDragOverIndex(index);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverIndex === index) {
                    setDragOverIndex(null);
                  }
                }}
                onDrop={e => {
                  e.preventDefault();
                  handleDrop(index);
                }}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-2xl border transition-all bg-white",
                  isDragging && "opacity-40 border-dashed border-blue-400",
                  isDragOver && "border-blue-500 ring-2 ring-blue-100",
                  !isDragging && !isDragOver && "border-slate-200 hover:border-slate-300 shadow-2xs"
                )}
              >
                {/* Left side: Grip, Index, Icon, Name */}
                <div className="flex items-center gap-3 min-w-0">
                  {canEdit && (
                    <div
                      className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-0.5 transition-colors"
                      title={t("Drag to reorder", "Ťahaním zmeňte poradie", "Húzással módosíthatja a sorrendet")}
                    >
                      <GripVertical className="size-4" />
                    </div>
                  )}

                  <span className="w-6 text-center font-mono text-micro font-bold text-slate-400 select-none">
                    #{index + 1}
                  </span>

                  <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    {getMethodIcon(method)}
                  </div>

                  <span className="text-ui font-semibold text-slate-800 truncate">
                    {method}
                  </span>
                </div>

                {/* Right side: Reorder arrows & Delete button */}
                <div className="flex items-center gap-1 shrink-0">
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleMove(index, -1)}
                        disabled={index === 0}
                        className={cn(
                          "p-1.5 rounded-lg border border-transparent transition-all",
                          index === 0
                            ? "text-slate-200 cursor-not-allowed"
                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 hover:border-slate-200 cursor-pointer"
                        )}
                        title={t("Move up", "Posunúť nahor", "Mozgatás fel")}
                      >
                        <ChevronUp className="size-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMove(index, 1)}
                        disabled={index === activeMethods.length - 1}
                        className={cn(
                          "p-1.5 rounded-lg border border-transparent transition-all",
                          index === activeMethods.length - 1
                            ? "text-slate-200 cursor-not-allowed"
                            : "text-slate-400 hover:text-slate-700 hover:bg-slate-100 hover:border-slate-200 cursor-pointer"
                        )}
                        title={t("Move down", "Posunúť nadol", "Mozgatás le")}
                      >
                        <ChevronDown className="size-4" />
                      </button>

                      {activeMethods.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemove(method)}
                          className="p-1.5 rounded-lg border border-transparent text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all cursor-pointer ml-1"
                          title={t(
                            `Remove "${method}"`,
                            `Odstrániť "${method}"`,
                            `Eltávolítás: "${method}"`
                          )}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Custom Shipping Method */}
      {canEdit && (
        <div className="pt-4 border-t border-slate-200/70 space-y-3">
          <div>
            <label className="type-overline text-slate-500 block mb-1.5">
              {t(
                "Add Custom Shipping Method",
                "Pridať nový spôsob dopravy",
                "Új szállítási mód hozzáadása"
              )}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newMethodInput}
                onChange={e => setNewMethodInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
                placeholder={t(
                  "e.g. SPS Kuriér, Osobný odber Košice, DHL Express...",
                  "napr. SPS Kuriér, Osobný odber Košice, DHL Express...",
                  "pl. DPD Futár, Személyes átvétel..."
                )}
                className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-ui text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => handleAdd()}
                disabled={!newMethodInput.trim()}
                className={cn(
                  "px-4 py-2.5 rounded-xl text-ui font-semibold inline-flex items-center gap-1.5 transition-all shadow-2xs",
                  newMethodInput.trim()
                    ? "bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                    : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <Plus className="size-4" />
                <span>{t("Add", "Pridať", "Hozzáadás")}</span>
              </button>
            </div>
          </div>

          {/* Quick Suggestions / Popular Carriers */}
          <div className="space-y-1.5 pt-2">
            <span className="type-overline text-slate-400 block">
              {t(
                "Popular Carriers & Suggestions (click to add):",
                "Odporúčaní prepravcovia (kliknutím pridáte):",
                "Gyakori futárszolgálatok (kattintson a hozzáadáshoz):"
              )}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_SUGGESTIONS.map(suggestion => {
                const isAlreadyAdded = activeMethods.some(
                  m => m.toLowerCase() === suggestion.toLowerCase()
                );
                return (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={isAlreadyAdded}
                    onClick={() => handleAdd(suggestion)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-micro font-medium border transition-all",
                      isAlreadyAdded
                        ? "bg-slate-50 border-slate-200 text-slate-400 cursor-default"
                        : "bg-white border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 cursor-pointer shadow-2xs"
                    )}
                  >
                    {isAlreadyAdded ? (
                      <Check className="size-3 text-emerald-500" />
                    ) : (
                      <Plus className="size-3 text-slate-400" />
                    )}
                    <span>{suggestion}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
};
