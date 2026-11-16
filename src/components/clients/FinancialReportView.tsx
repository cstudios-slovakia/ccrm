import React, { useMemo, useEffect, useRef } from "react";
import { chartTheme, useAppearance } from "../../utils/theme";
import { chartFonts, useViewSize } from "../../utils/viewSize";
import { Chart as BundledChart } from "../../utils/chartRuntime";

interface FinancialReportViewProps {
  summary: string;
  systemLanguage: string;
}

export const FinancialReportView: React.FC<FinancialReportViewProps> = ({ summary, systemLanguage }) => {
  // chart.js paints to a canvas, so its axis, grid and legend colours cannot
  // come from CSS — they are literals rebuilt whenever the appearance flips.
  const appearance = useAppearance();
  const { size: viewSize } = useViewSize();
  const chart = chartTheme(appearance);
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any>(null);

  // Parse the years, revenues, and profits from markdown table
  const parsedData = useMemo(() => {
    const lines = summary.split('\n');
    const years: string[] = [];
    const revenues: number[] = [];
    const profits: number[] = [];

    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 4) {
        const yearMatch = parts[1].match(/^\d{4}$/);
        if (yearMatch) {
          const year = parts[1];
          const cleanNum = (str: string) => {
            let cleaned = str.replace(/&euro;/g, '').replace(/[€\s]/g, '');
            if (/, \d{3}/.test(cleaned) || /,\d{3}/.test(cleaned)) {
              cleaned = cleaned.replace(/,/g, '');
            }
            return parseFloat(cleaned);
          };
          const revenue = cleanNum(parts[2]);
          const profit = cleanNum(parts[3]);

          if (!isNaN(revenue)) {
            years.push(year);
            revenues.push(revenue);
            profits.push(isNaN(profit) ? 0 : profit);
          }
        }
      }
    }
    return { years, revenues, profits };
  }, [summary]);

  useEffect(() => {
    if (!chartRef.current || parsedData.years.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;

    const ChartGlob: any = BundledChart;

    const fonts = chartFonts();
    chartInstanceRef.current = new ChartGlob(ctx, {
      type: 'line',
      data: {
        labels: parsedData.years,
        datasets: [
          {
            label: systemLanguage === 'sk' ? 'Celkové výnosy (€)' : systemLanguage === 'hu' ? 'Összes bevétel (€)' : 'Total Revenues (€)',
            data: parsedData.revenues,
            borderColor: 'rgb(79, 70, 229)',
            backgroundColor: 'rgba(79, 70, 229, 0.05)',
            borderWidth: 3,
            pointBackgroundColor: 'rgb(79, 70, 229)',
            pointRadius: 5,
            fill: true,
            tension: 0.3,
            order: 2,
          },
          {
            label: systemLanguage === 'sk' ? 'Výsledok hospodárenia (€)' : systemLanguage === 'hu' ? 'Nettó nyereség/veszteség (€)' : 'Net Profit/Loss (€)',
            data: parsedData.profits,
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            borderWidth: 3,
            pointBackgroundColor: 'rgb(16, 185, 129)',
            pointRadius: 5,
            fill: true,
            tension: 0.3,
            order: 1,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: {
                family: 'Google Sans, sans-serif',
                weight: 'bold',
                size: fonts.label
              },
              color: chart.label
            }
          },
          tooltip: {
            titleFont: {
              family: 'Google Sans, sans-serif',
              weight: 'bold'
            },
            bodyFont: {
              family: 'Google Sans, sans-serif'
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: chart.tick,
              font: {
                family: 'Google Sans, sans-serif',
                size: fonts.tick,
                weight: 'bold'
              },
              callback: (value: any) => '€' + value.toLocaleString()
            },
            grid: {
              color: chart.grid
            }
          },
          x: {
            ticks: {
              color: chart.tick,
              font: {
                family: 'Google Sans, sans-serif',
                size: fonts.tick,
                weight: 'bold'
              }
            },
            grid: {
              display: false
            }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [parsedData, systemLanguage, appearance, viewSize]);

  const renderBeautifulReport = (text: string) => {
    if (!text) return null;

    const cleanedText = text.replace(/```markdown\s*/g, '').replace(/```\s*/g, '');
    const lines = cleanedText.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];
    let tableRows: string[][] = [];

    const formatInlineMarkdown = (str: string) => {
      if (!str) return '';
      // Escape HTML first so any markup in AI/registry-sourced text is inert;
      // only our own ** / * markers are then turned into <strong>/<em>.
      const escaped = str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return escaped
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-black text-slate-900 font-extrabold">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic text-slate-700">$1</em>');
    };

    const flushList = (key: string) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${key}`} className="space-y-1 my-3 pl-5 list-disc text-slate-600 font-semibold leading-relaxed">
            {listItems.map((item, idx) => (
              <li key={idx} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item) }} />
            ))}
          </ul>
        );
        listItems = [];
      }
    };

    const flushTable = (key: string) => {
      if (tableRows.length > 0) {
        elements.push(
          <div key={`table-${key}`} className="overflow-x-auto my-4 rounded-xl border border-slate-200 shadow-sm bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-caption">
              <thead className="bg-slate-50">
                <tr>
                  {tableRows[0].map((cell, idx) => (
                    <th key={idx} className="px-4 py-2 text-left font-bold text-slate-700 uppercase tracking-wider" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(cell) }} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {tableRows.slice(1).map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-slate-50/50 transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className={`px-4 py-2 font-bold ${cellIdx === 0 ? 'text-slate-800 font-extrabold' : 'text-slate-600'}`} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(cell) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();

      const h1Match = line.match(/^#\s+(.*$)/);
      const h2Match = line.match(/^##\s+(.*$)/);
      const h3Match = line.match(/^###\s+(.*$)/);
      const listMatch = line.match(/^\s*[-\*]\s+(.*$)/);
      const isTableLine = line.startsWith('|');

      if (h1Match || h2Match || h3Match || listMatch || isTableLine === false) {
        flushList(String(i));
        flushTable(String(i));
      }

      if (h1Match) {
        elements.push(
          <h2 key={i} className="text-body font-bold text-slate-900 mt-6 mb-3 border-b border-slate-200 pb-1.5 flex items-center gap-1.5" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(h1Match[1]) }} />
        );
      } else if (h2Match) {
        elements.push(
          <h3 key={i} className="text-ui font-bold text-slate-800 mt-5 mb-2 flex items-center gap-1.5" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(h2Match[1]) }} />
        );
      } else if (h3Match) {
        elements.push(
          <h4 key={i} className="type-overline text-slate-600 mt-4 mb-1.5" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(h3Match[1]) }} />
        );
      } else if (listMatch) {
        listItems.push(formatInlineMarkdown(listMatch[1]));
      } else if (isTableLine) {
        const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        const isSeparator = cells.every(c => /^[-:]+$/.test(c));
        if (!isSeparator) {
          tableRows.push(cells);
        }
      } else if (line !== "") {
        elements.push(
          <p key={i} className="my-2.5 leading-relaxed text-slate-600 font-semibold" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(line) }} />
        );
      }
    }

    flushList("end");
    flushTable("end");

    return <div className="space-y-1 text-caption">{elements}</div>;
  };

  return (
    <div className="space-y-6">
      {parsedData.years.length > 0 && (
        <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h4 className="type-overline text-slate-500">
              {systemLanguage === 'sk' ? 'Graf vývoja hospodárenia' : systemLanguage === 'hu' ? 'Pénzügyi trend diagram' : 'Financial Trend Chart'}
            </h4>
          </div>
          <div className="h-48 relative w-full">
            <canvas ref={chartRef} />
          </div>
        </div>
      )}
      
      <div className="p-6 rounded-2xl bg-indigo-50/15 border-2 border-indigo-100/60 shadow-inner leading-relaxed text-ui">
        {renderBeautifulReport(summary)}
      </div>
    </div>
  );
};

