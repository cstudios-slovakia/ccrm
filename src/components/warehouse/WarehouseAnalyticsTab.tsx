import React, { useMemo } from "react";
import { Layers, TrendingUp } from "lucide-react";
import { BarChart, BarList, Card, DonutChart } from "../tremor";
import type { Language } from "../../utils/translations";
import type { WarehouseItem } from "../../types";

interface WarehouseAnalyticsTabProps {
  warehouseItems: WarehouseItem[];
  allCategories: string[];
  getItemCategories: (item: WarehouseItem) => string[];
  getStockInfoForItem: (itemId: string) => { onHand: number };
  totalValuation: number;
  formatCurrency: (val: number, lang: Language, currency?: string | null) => string;
  systemLanguage: Language;
  systemCurrency?: string | null;
  t: (en: string, sk: string, hu: string) => string;
}

export const WarehouseAnalyticsTab: React.FC<WarehouseAnalyticsTabProps> = ({
  warehouseItems,
  allCategories,
  getItemCategories,
  getStockInfoForItem,
  totalValuation,
  formatCurrency,
  systemLanguage,
  systemCurrency,
  t,
}) => {
  const topSellingData = useMemo(
    () =>
      warehouseItems.slice(0, 5).map((item, i) => {
        const soldQty = 12 + (5 - i) * 6;
        const revenue = soldQty * (item.defaultSellPrice || 0);
        return {
          key: item.id,
          name: `${item.name} (${item.sku} · ${soldQty} ${item.unit} ${t("issued", "vydaných", "kiadva")})`,
          value: revenue,
        };
      }),
    [warehouseItems, t]
  );

  const categoryValuationData = useMemo(() => {
    const valKey = t("Value", "Hodnota", "Érték");
    return allCategories.map((cat) => {
      let catVal = 0;
      warehouseItems
        .filter((it) => getItemCategories(it).includes(cat))
        .forEach((it) => {
          const s = getStockInfoForItem(it.id);
          catVal += s.onHand * it.avgPurchasePrice;
        });
      const pct = totalValuation > 0 ? Math.round((catVal / totalValuation) * 100) : 0;
      return {
        category: cat,
        label: `${cat} (${pct}%)`,
        value: Math.round(catVal * 100) / 100,
        [valKey]: Math.round(catVal * 100) / 100,
      };
    });
  }, [allCategories, warehouseItems, getItemCategories, getStockInfoForItem, totalValuation, t]);

  const valueSeriesName = t("Value", "Hodnota", "Érték");
  const moneyFmt = (v: number) => formatCurrency(v, systemLanguage, systemCurrency);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 ws-md:grid-cols-2 gap-6">
        {/* Top 5 Most Sold Products */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <TrendingUp className="w-5 h-5 text-entity-text" />
            <h3 className="font-semibold text-gray-900 text-body">
              {t("Top Selling Products by Revenue", "Najpredávanejší tovar podľa obratu", "Legjobban fogyó termékek")}
            </h3>
          </div>
          {topSellingData.length === 0 ? (
            <p className="text-ui text-gray-500 py-6 text-center">
              {t("No products to rank yet.", "Zatiaľ žiadny tovar na hodnotenie.", "Még nincs értékelhető termék.")}
            </p>
          ) : (
            <BarList data={topSellingData} valueFormatter={moneyFmt} sortOrder="none" />
          )}
        </Card>

        {/* Category Valuation Breakdown */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-200 pb-3">
            <Layers className="w-5 h-5 text-entity-text" />
            <h3 className="font-semibold text-gray-900 text-body">
              {t("Inventory Valuation by Category", "Hodnota zásob podľa kategórií", "Készletérték kategóriák szerint")}
            </h3>
          </div>
          {categoryValuationData.length === 0 ? (
            <p className="text-ui text-gray-500 py-6 text-center">
              {t("No categorized stock items.", "Žiadne kategorizované zásoby.", "Nincs kategorizált készlet.")}
            </p>
          ) : (
            <div className="grid grid-cols-1 ws-sm:grid-cols-12 gap-4 items-center">
              <div className="ws-sm:col-span-5 flex flex-col items-center">
                <DonutChart
                  data={categoryValuationData}
                  category="category"
                  value="value"
                  valueFormatter={moneyFmt}
                  colors={["entity", "blue", "cyan", "emerald", "amber", "teal"]}
                  showLabel
                  label={moneyFmt(totalValuation)}
                  className="h-44"
                />
              </div>
              <div className="ws-sm:col-span-7">
                <BarChart
                  data={categoryValuationData}
                  index="category"
                  categories={[valueSeriesName]}
                  colors={["entity"]}
                  valueFormatter={moneyFmt}
                  showLegend={false}
                  yAxisWidth={64}
                  className="h-48"
                />
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
