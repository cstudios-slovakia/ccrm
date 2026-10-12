import React, { useMemo, useState } from "react";
import {
  CreditCard,
  Plus,
  Trash2,
  RotateCcw,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Check,
  Landmark,
  Banknote,
  Truck,
  Coins
} from "lucide-react";
import type { CompanyBillingSettings } from "../types";
import type { Language } from "../utils/translations";
import { cn } from "../utils/cn";
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_STANDARD_PAYMENT_METHOD,
  getAvailablePaymentMethods,
  getDefaultPaymentMethod
} from "../utils/payment";

interface PaymentMethodSettingsProps {
  companyBillingSettings?: CompanyBillingSettings | null;
  setCompanyBillingSettings?: React.Dispatch<
    React.SetStateAction<CompanyBillingSettings | null>
  >;
  userLanguage: Language;
  canEdit: boolean;
}

const POPULAR_SUGGESTIONS = [
  "Prevod na účet",
  "Dobierka",
  "Platobná karta",
  "Hotovosť",
  "PayPal",
  "Apple Pay / Google Pay",
  "Faktúra so splatnosťou"
] as const;

export const PaymentMethodSettings: React.FC<PaymentMethodSettingsProps> = ({
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
    () => getAvailablePaymentMethods(companyBillingSettings),
    [companyBillingSettings?.paymentMethods]
  );

  const currentDefault = useMemo(
    () => getDefaultPaymentMethod(companyBillingSettings),
    [companyBillingSettings?.defaultPaymentMethod, companyBillingSettings?.paymentMethods]
  );

  const [newMethodInput, setNewMethodInput] = useState("");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const saveSettings = (nextMethods: string[], nextDefault?: string) => {
    if (!setCompanyBillingSettings) return;
    const finalDefault =
      nextDefault !== undefined
        ? nextDefault
        : nextMethods.includes(currentDefault)
        ? currentDefault
        : nextMethods[0] || DEFAULT_STANDARD_PAYMENT_METHOD;

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
      paymentMethods: nextMethods,
      defaultPaymentMethod: finalDefault
    }));
  };

  const handleAdd = (nameToAdd?: string) => {
    if (!canEdit) return;
    const target = (nameToAdd !== undefined ? nameToAdd : newMethodInput).trim();
    if (!target) return;

    if (activeMethods.some(m => m.toLowerCase() === target.toLowerCase())) {
      toast(
        t(
          "This payment method already exists in the list.",
          "Tento spôsob platby už existuje v zozname.",
          "Ez a fizetési mód már szerepel a listában."
        ),
        "error"
      );
      return;
    }

    const next = [...activeMethods, target];
    saveSettings(next);
    if (nameToAdd === undefined) {
      setNewMethodInput("");
    }
    toast(
      t(
        `Added payment method: "${target}"`,
        `Pridaný spôsob platby: "${target}"`,
        `Hozzáadva: "${target}"`
      )
    );
  };

  const handleRemove = (methodToRemove: string) => {
    if (!canEdit) return;
    if (activeMethods.length <= 1) {
      toast(
        t(
          "At least one payment method must remain.",
          "Aspoň jeden spôsob platby musí zostať.",
          "Legalább egy fizetési módnak maradnia kell."
        ),
        "error"
      );
      return;
    }

    const next = activeMethods.filter(m => m !== methodToRemove);
    let nextDef = currentDefault;
    if (nextDef === methodToRemove) {
      nextDef = next.includes(DEFAULT_STANDARD_PAYMENT_METHOD)
        ? DEFAULT_STANDARD_PAYMENT_METHOD
        : next[0];
    }
    saveSettings(next, nextDef);
    toast(
      t(
        `Removed payment method: "${methodToRemove}"`,
        `Odstránený spôsob platby: "${methodToRemove}"`,
        `Eltávolítva: "${methodToRemove}"`
      )
    );
  };

  const handleSetDefault = (method: string) => {
    if (!canEdit) return;
    saveSettings(activeMethods, method);
    toast(
      t(
        `Default payment method set to "${method}"`,
        `Predvolený spôsob platby nastavený na "${method}"`,
        `Alapértelmezett fizetési mód beállítva: "${method}"`
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
    saveSettings(next);
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
    saveSettings(next);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleReset = () => {
    if (!canEdit) return;
    const confirmMsg = t(
      "Reset payment methods to the default list?",
      "Obnoviť spôsoby platby na predvolený zoznam?",
      "Visszaállítja a fizetési módokat az alapértelmezettre?"
    );
    if (!window.confirm(confirmMsg)) return;

    saveSettings([...DEFAULT_PAYMENT_METHODS], DEFAULT_STANDARD_PAYMENT_METHOD);
    toast(
      t(
        "Payment methods reset to defaults.",
        "Spôsoby platby boli obnovené na predvolené.",
        "Fizetési módok visszaállítva az alapértelmezettre."
      )
    );
  };

  const getMethodIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("karta") || lower.includes("card") || lower.includes("pay")) {
      return <CreditCard className="size-4 text-indigo-600 shrink-0" />;
    }
    if (lower.includes("prevod") || lower.includes("wire") || lower.includes("účet") || lower.includes("bank")) {
      return <Landmark className="size-4 text-emerald-600 shrink-0" />;
    }
    if (lower.includes("hotovosť") || lower.includes("cash") || lower.includes("készpénz")) {
      return <Banknote className="size-4 text-amber-600 shrink-0" />;
    }
    if (lower.includes("dobierka") || lower.includes("cod") || lower.includes("utánvét")) {
      return <Truck className="size-4 text-blue-600 shrink-0" />;
    }
    return <Coins className="size-4 text-purple-600 shrink-0" />;
  };

  return (
    <div className="glass-panel p-6 rounded-3xl space-y-6 border border-white/60 bg-white/95 shadow-glass text-left">
      {/* Header */}
      <div className="flex flex-col ws-sm:flex-row ws-sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200/60 text-indigo-600">
            <CreditCard className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-body font-heading font-bold text-slate-900">
                {t("Payment Methods", "Spôsoby platby", "Fizetési módok")}
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono text-micro font-bold border border-slate-200">
                {activeMethods.length}
              </span>
            </div>
            <p className="type-overline text-slate-400 mt-0.5">
              {t(
                "Configure payment methods available when processing orders and select default for new orders",
                "Nastavte spôsoby platby pre objednávky a zvoľte predvolenú možnosť",
                "Állítsa be a rendeléseknél elérhető fizetési módokat és az alapértelmezett opciót"
              )}
            </p>
          </div>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-ui font-medium transition-all shadow-2xs cursor-pointer self-start ws-sm:self-auto"
            title={t(
              "Reset to default payment methods",
              "Obnoviť na predvolené spôsoby platby",
              "Alapértelmezett fizetési módok visszaállítása"
            )}
          >
            <RotateCcw className="size-3.5 text-slate-400" />
            <span>
              {t("Reset to defaults", "Obnoviť predvolené", "Alapértelmezett")}
            </span>
          </button>
        )}
      </div>

      {/* Reorderable Methods List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="type-overline text-slate-500 block">
            {t(
              "Active Payment Methods (In Display Order)",
              "Aktívne spôsoby platby (podľa poradia zobrazenia)",
              "Aktív fizetési módok (megjelenési sorrendben)"
            )}
          </label>
          <span className="text-micro text-slate-400 hidden ws-sm:inline">
            {t(
              "Drag or use arrows to change ordering in order view",
              "Poradie určuje zobrazenie možností v objednávkach",
              "A sorrend határozza meg a megjelenést a rendelésekben"
            )}
          </span>
        </div>

        <div className="space-y-2">
          {activeMethods.map((method, index) => {
            const isDefault = currentDefault === method;
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
                  isDragging && "opacity-40 border-dashed border-indigo-400",
                  isDragOver && "border-indigo-500 ring-2 ring-indigo-100",
                  !isDragging && !isDragOver && "border-slate-200 hover:border-slate-300 shadow-2xs"
                )}
              >
                {/* Left side: Grip, Index, Icon, Name, Default Badge */}
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

                  {isDefault ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-micro font-bold tracking-wide uppercase">
                      <Check className="size-3" />
                      {t("Default", "Predvolená", "Alapértelmezett")}
                    </span>
                  ) : (
                    canEdit && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(method)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-micro font-medium text-slate-400 hover:text-indigo-600 transition-all cursor-pointer px-1.5 py-0.5 rounded hover:bg-indigo-50/60"
                        title={t("Set as default for new orders", "Nastaviť ako predvolenú pre nové objednávky", "Beállítás alapértelmezettként")}
                      >
                        {t("Set default", "Zvoliť", "Kiválaszt")}
                      </button>
                    )
                  )}
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

      {/* Add Custom Payment Method */}
      {canEdit && (
        <div className="pt-4 border-t border-slate-200/70 space-y-3">
          <div>
            <label className="type-overline text-slate-500 block mb-1.5">
              {t(
                "Add Custom Payment Method",
                "Pridať nový spôsob platby",
                "Új fizetési mód hozzáadása"
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
                  "e.g. PayPal, Apple Pay, Faktúra so splatnosťou...",
                  "napr. PayPal, Apple Pay, Faktúra so splatnosťou...",
                  "pl. PayPal, Apple Pay, Átutalás 14 nap..."
                )}
                className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-ui text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-none transition-all placeholder:text-slate-400"
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

          {/* Quick Suggestions / Popular Payment Methods */}
          <div className="space-y-1.5 pt-2">
            <span className="type-overline text-slate-400 block">
              {t(
                "Popular Payment Methods (click to add):",
                "Časté spôsoby platby (kliknutím pridáte):",
                "Gyakori fizetési módok (kattintson a hozzáadáshoz):"
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
                        : "bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 cursor-pointer shadow-2xs"
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
    </div>
  );
};
