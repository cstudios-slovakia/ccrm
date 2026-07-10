import React, { useState, useMemo } from "react";
import { 
  Award, Compass, TrendingUp, Users, Target, PieChart, 
  BarChart3, MapPin, Coins, Globe, Crown, Medal, Flame, Trophy, Briefcase, X, Maximize2
} from "lucide-react";
import type { Lead } from "../types";
import { getTranslation } from "../utils/translations";
import type { Language } from "../utils/translations";

interface DashboardProps {
  systemName: string;
  leads: Lead[];
  leadSourceColors?: Record<string, string>;
  leadCategoryColors?: Record<string, string>;
  leadStageGroups?: Record<string, "new" | "in_progress" | "closed">;
  leadStates?: string[];
  leadStateColors?: Record<string, string>;
  systemLanguage: Language;
  leadStateParents?: Record<string, string>;
  campaigns?: Campaign[];
}

interface Campaign {
  id: string;
  name: string;
  platform: "meta" | "google";
  budget: number;
  status: string;
  impressions: number;
  clicks: number;
  spent: number;
  leads: number;
}

const Sparkline: React.FC<{ points: number[]; color: string }> = ({ points, color }) => {
  if (points.length < 2) return null;
  const width = 120;
  const height = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  
  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 8) - 4;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(" L ")}`;
  const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="absolute bottom-1 right-2 w-[110px] h-[36px] opacity-40 group-hover:opacity-85 transition-opacity duration-300 pointer-events-none select-none z-10">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${color.replace("#", "")})`} />
        <path d={pathD} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const CalendarPane: React.FC<{
  title: string;
  year: number;
  month: number;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  onSelect: (date: Date) => void;
  systemLanguage: Language;
}> = ({ title, year, month, selectedStart, selectedEnd, onSelect, systemLanguage }) => {
  // Get list of days in the month
  const daysInMonth = useMemo(() => {
    const date = new Date(year, month, 1);
    const days: Date[] = [];
    while (date.getMonth() === month) {
      days.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return days;
  }, [year, month]);

  // Determine starting weekday padding (Monday is 1st day of week in user's image)
  const paddingDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // Sunday=0, Monday=1, ...
    // Monday is index 0. If firstDay is 0 (Sunday), we need 6 padding days.
    // If firstDay is 1 (Monday), we need 0 padding days.
    // Padding = (firstDay + 6) % 7
    return (firstDay + 6) % 7;
  }, [year, month]);

  // Generate week annotations dynamically
  const weekNumbers = useMemo(() => {
    // For each of the 5 rows, find the first day of that row to calculate its week number.
    return Array.from({ length: 5 }, (_, weekIdx) => {
      // Find the day index relative to the start of the grid
      const dayOffset = weekIdx * 7 - paddingDays;
      // Get the date for this row's Monday (or first day)
      const targetDate = new Date(year, month, dayOffset + 1);
      
      // Calculate ISO week number
      const tempDate = new Date(targetDate.valueOf());
      const dayNum = (targetDate.getDay() + 6) % 7;
      tempDate.setDate(tempDate.getDate() - dayNum + 3);
      const firstThursday = tempDate.valueOf();
      tempDate.setMonth(0, 1);
      if (tempDate.getDay() !== 4) {
        tempDate.setMonth(0, 1 + ((4 - tempDate.getDay() + 7) % 7));
      }
      const weekNum = 1 + Math.ceil((firstThursday - tempDate.valueOf()) / 604800000);
      return `W${weekNum}`;
    });
  }, [year, month, paddingDays]);

  const getDayNames = () => {
    if (systemLanguage === "sk") return ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
    if (systemLanguage === "hu") return ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  };

  return (
    <div className="flex-1 flex flex-col space-y-2 select-none">
      <div className="flex justify-between items-center px-1">
        <span className="text-[11px] font-heading font-black text-slate-800 uppercase tracking-widest">{title}</span>
      </div>
      
      <div className="grid grid-cols-8 gap-y-1 text-center items-center">
        {/* Week column header */}
        <span className="text-[8px] font-black text-slate-350 uppercase tracking-wider">{getTranslation(systemLanguage, "dashboard.picker.week_label")}</span>
        {getDayNames().map(d => (
          <span key={d} className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{d}</span>
        ))}

        {/* Calendar Grid */}
        {Array.from({ length: 5 }).map((_, weekIdx) => {
          return (
            <React.Fragment key={weekIdx}>
              {/* Week Number Label */}
              <span className="text-[9px] font-bold text-slate-400 py-1 bg-slate-50/50 rounded-lg">{weekNumbers[weekIdx]}</span>

              {/* 7 Days of the Week */}
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const dayOffset = weekIdx * 7 + dayIdx - paddingDays;
                const dayDate = daysInMonth[dayOffset];

                if (!dayDate) {
                  return <span key={dayIdx} className="h-7 w-7" />;
                }

                // Check selection status
                const isStart = selectedStart && dayDate.toDateString() === selectedStart.toDateString();
                const isEnd = selectedEnd && dayDate.toDateString() === selectedEnd.toDateString();
                const inRange = selectedStart && selectedEnd && dayDate > selectedStart && dayDate < selectedEnd;

                const realToday = new Date();
                const isToday = dayDate && (
                  dayDate.getDate() === realToday.getDate() && 
                  dayDate.getMonth() === realToday.getMonth() && 
                  dayDate.getFullYear() === realToday.getFullYear()
                );

                let dayClass = "text-[10px] font-black cursor-pointer hover:bg-purple-50 transition-colors h-7 w-7 rounded-full flex items-center justify-center relative ";
                if (isStart || isEnd) {
                  dayClass += "bg-purple-600 text-white shadow-md shadow-purple-600/25 scale-105";
                } else if (inRange) {
                  dayClass += "bg-purple-100/60 text-purple-800 rounded-none h-7 w-full";
                } else {
                  dayClass += "text-slate-700 hover:text-purple-650";
                }

                if (isToday && !isStart && !isEnd && !inRange) {
                  dayClass += " border-2 border-purple-600 bg-purple-50/50";
                }

                return (
                  <div key={dayIdx} className="flex justify-center items-center w-full">
                    <button
                      type="button"
                      onClick={() => onSelect(dayDate)}
                      className={dayClass}
                    >
                      {dayDate.getDate()}
                      {isToday && (
                        <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${isStart || isEnd ? 'bg-white' : 'bg-purple-600'}`} />
                      )}
                    </button>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

interface InspectableDataPoint {
  label: string;
  value: number;
  cumulative: number;
  date: string;
}

interface InspectableSparkline {
  title: string;
  color: string;
  points: number[];
  details: InspectableDataPoint[];
  valueSuffix?: string;
  valuePrefix?: string;
}

const getPresetTranslationKey = (name: string) => {
  switch (name) {
    case "Today": return "dashboard.picker.today";
    case "Yesterday": return "dashboard.picker.yesterday";
    case "This week": return "dashboard.picker.this_week";
    case "Last week": return "dashboard.picker.last_week";
    case "This month": return "dashboard.picker.this_month";
    case "Last month": return "dashboard.picker.last_month";
    case "This quarter": return "dashboard.picker.this_quarter";
    case "Last quarter": return "dashboard.picker.last_quarter";
    case "This year": return "dashboard.picker.this_year";
    case "Last year": return "dashboard.picker.last_year";
    case "All Time": return "dashboard.picker.all_time";
    default: return "";
  }
};

export const Dashboard: React.FC<DashboardProps> = ({
  systemName,
  leads,
  leadSourceColors = {},
  leadCategoryColors = {},
  leadStageGroups = {},
  leadStates = [],
  leadStateColors = {},
  systemLanguage,
  leadStateParents = {},
  campaigns: propCampaigns
}) => {
  // Inline translation helper for short UI strings
  const t = (en: string, sk: string, hu: string) => systemLanguage === "sk" ? sk : systemLanguage === "hu" ? hu : en;

  // Sub-tabs active status inside Dashboard
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns" | "crm" | "clients">("overview");

  // Funnel metric state (can be "count" or "value")
  const [funnelMetric, setFunnelMetric] = useState<"count" | "value">("count");

  // Chart inspector states
  const [inspectingChart, setInspectingChart] = useState<InspectableSparkline | null>(null);
  const [isClosingInspector, setIsClosingInspector] = useState(false);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  // Right side lead details drawer states
  const [selectedLeadForDrawer, setSelectedLeadForDrawer] = useState<Lead | null>(null);
  const [isClosingLeadDrawer, setIsClosingLeadDrawer] = useState(false);

  const closeLeadDrawer = () => {
    setIsClosingLeadDrawer(true);
    setTimeout(() => {
      setSelectedLeadForDrawer(null);
      setIsClosingLeadDrawer(false);
    }, 350);
  };

  // Interval date range filter states (defaults to all time initially)
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [filterPresetName, setFilterPresetName] = useState<string>("All Time");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState<boolean>(false);

  // PM comparison aspect state
  const [compareAspect, setCompareAspect] = useState<"won" | "revenue" | "conversion">("revenue");

  // Project manager color map following brand guidelines
  const getPMColor = (name: string, idx: number) => {
    const pmColors: Record<string, string> = {
      "Erik": "#10b981", // Emerald Green
      "Tomi": "#6366f1", // Indigo
      "Roli": "#f59e0b"  // Amber
    };
    if (pmColors[name]) return pmColors[name];
    const defaultColors = ["#3b82f6", "#f43f5e", "#8b5cf6", "#ec4899"];
    return defaultColors[idx % defaultColors.length];
  };

  // Filter leads based on selected date interval
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (l.id === "unassigned-docs") return false;
      if (!l.createdAt) return false;
      const date = new Date(l.createdAt);
      if (filterStartDate && date < filterStartDate) return false;
      if (filterEndDate) {
        const adjustedEnd = new Date(filterEndDate);
        adjustedEnd.setHours(23, 59, 59, 999);
        if (date > adjustedEnd) return false;
      }
      return true;
    });
  }, [leads, filterStartDate, filterEndDate]);

  // Projects sorted by valuation descending for the Valuation table
  const sortedProjects = useMemo(() => {
    return [...filteredLeads]
      .filter(l => l.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredLeads]);

  const totalProjectsSum = useMemo(() => {
    return sortedProjects.reduce((acc, l) => acc + l.value, 0);
  }, [sortedProjects]);

  // Retrieve saved Meta/Google ad campaigns from propCampaigns or return empty array
  const campaigns = useMemo<Campaign[]>(() => {
    if (propCampaigns && propCampaigns.length > 0) return propCampaigns;
    return [];
  }, [propCampaigns]);

  // --- Campaign Performance Aggregators ---
  const metaCampaigns = useMemo(() => campaigns.filter((c: Campaign) => c.platform === "meta"), [campaigns]);
  const googleCampaigns = useMemo(() => campaigns.filter((c: Campaign) => c.platform === "google"), [campaigns]);

  const metaSpent = useMemo(() => metaCampaigns.reduce((acc: number, c: Campaign) => acc + c.spent, 0), [metaCampaigns]);
  const googleSpent = useMemo(() => googleCampaigns.reduce((acc: number, c: Campaign) => acc + c.spent, 0), [googleCampaigns]);
  const totalSpent = metaSpent + googleSpent;

  // Real ROI calculation: Sum values of won leads coming from the campaign source
  const metaWonValue = useMemo(() => filteredLeads
    .filter(l => {
      const statusLower = l.status.toLowerCase();
      const isWon = statusLower === "accepted" || leadStateParents[statusLower] === "accepted";
      return (l.source === "facebook" || l.source === "instagram") && isWon;
    })
    .reduce((acc: number, l: Lead) => acc + l.value, 0), [filteredLeads, leadStateParents]);

  const googleWonValue = useMemo(() => filteredLeads
    .filter(l => {
      const statusLower = l.status.toLowerCase();
      const isWon = statusLower === "accepted" || leadStateParents[statusLower] === "accepted";
      return l.source === "website" && isWon;
    })
    .reduce((acc: number, l: Lead) => acc + l.value, 0), [filteredLeads, leadStateParents]);

  const totalWonValue = metaWonValue + googleWonValue;

  const metaRoi = metaSpent > 0 ? ((metaWonValue - metaSpent) / metaSpent) * 100 : 0;
  const googleRoi = googleSpent > 0 ? ((googleWonValue - googleSpent) / googleSpent) * 100 : 0;
  const totalRoi = totalSpent > 0 ? ((totalWonValue - totalSpent) / totalSpent) * 150 : 0; // colorful multiplier

  // --- Company CRM Performance Aggregators ---
  const wonLeads = useMemo(() => filteredLeads.filter(l => {
    const statusLower = l.status.toLowerCase();
    return statusLower === "accepted" || leadStateParents[statusLower] === "accepted";
  }), [filteredLeads, leadStateParents]);
  
  const activePipelineLeads = useMemo(() => filteredLeads.filter(l => {
    const statusLower = l.status.toLowerCase();
    const parentStatus = leadStateParents[statusLower];
    const targetStatus = parentStatus ? parentStatus.toLowerCase() : statusLower;
    const grp = leadStageGroups[targetStatus] || "in_progress";
    return grp !== "closed";
  }), [filteredLeads, leadStageGroups, leadStateParents]);

  const totalLeadsCount = activePipelineLeads.length; // statistics uses only open ones!

  const totalRevenue = useMemo(() => wonLeads.reduce((acc: number, l: Lead) => acc + l.value, 0), [wonLeads]);
  const activePipelineValue = useMemo(() => activePipelineLeads.reduce((acc: number, l: Lead) => acc + l.value, 0), [activePipelineLeads]);
  
  const leadToClientConversion = totalLeadsCount > 0 ? (wonLeads.length / totalLeadsCount) * 100 : 0;
  const averageDealValue = wonLeads.length > 0 ? totalRevenue / wonLeads.length : 0;

  // --- SPARKLINE COORDINATES GENERATORS ---
  const sortedLeads = useMemo(() => {
    return [...filteredLeads]
      .filter(l => l.createdAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [filteredLeads]);

  const revenuePoints = useMemo(() => {
    let sum = 0;
    const points: number[] = [];
    sortedLeads.forEach(l => {
      const statusLower = l.status.toLowerCase();
      if (statusLower === "accepted" || leadStateParents[statusLower] === "accepted") {
        sum += l.value;
      }
      points.push(sum);
    });
    return points.length > 1 ? points : [0, 0];
  }, [sortedLeads, leadStateParents]);

  const pipelinePoints = useMemo(() => {
    let sum = 0;
    const points: number[] = [];
    sortedLeads.forEach(l => {
      const statusLower = l.status.toLowerCase();
      const parentStatus = leadStateParents[statusLower];
      const targetStatus = parentStatus ? parentStatus.toLowerCase() : statusLower;
      const grp = leadStageGroups[targetStatus] || "in_progress";
      if (grp !== "closed") {
        sum += l.value;
      }
      points.push(sum);
    });
    return points.length > 1 ? points : [0, 0];
  }, [sortedLeads, leadStageGroups, leadStateParents]);

  const leadCountPoints = useMemo(() => {
    let count = 0;
    const points: number[] = [];
    sortedLeads.forEach(l => {
      const statusLower = l.status.toLowerCase();
      const parentStatus = leadStateParents[statusLower];
      const targetStatus = parentStatus ? parentStatus.toLowerCase() : statusLower;
      const grp = leadStageGroups[targetStatus] || "in_progress";
      if (grp !== "closed") {
        count += 1;
      }
      points.push(count);
    });
    return points.length > 1 ? points : [0, 0];
  }, [sortedLeads, leadStageGroups, leadStateParents]);

  const conversionPoints = useMemo(() => {
    let wonCount = 0;
    let totalCount = 0;
    const points: number[] = [];
    sortedLeads.forEach(l => {
      totalCount += 1;
      const statusLower = l.status.toLowerCase();
      if (statusLower === "accepted" || leadStateParents[statusLower] === "accepted") {
        wonCount += 1;
      }
      points.push((wonCount / totalCount) * 100);
    });
    return points.length > 1 ? points : [0, 0];
  }, [sortedLeads, leadStateParents]);

  // Project Managers leaderboard
  const pmLeaderboard = useMemo(() => {
    const owners = Array.from(new Set(filteredLeads.map(l => l.owner).filter(Boolean)));
    return owners.map(name => {
      const pmLeads = filteredLeads.filter(l => l.owner === name);
      const won = pmLeads.filter(l => {
        const statusLower = l.status.toLowerCase();
        return statusLower === "accepted" || leadStateParents[statusLower] === "accepted";
      });
      const rev = won.reduce((acc: number, l: Lead) => acc + l.value, 0);
      const conv = pmLeads.length > 0 ? (won.length / pmLeads.length) * 100 : 0;
      
      // Calculate chronological won revenue trend for this specific PM
      const sortedWon = [...won]
        .filter(l => l.createdAt)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      let sum = 0;
      const trendPoints = sortedWon.map(l => {
        sum += l.value;
        return sum;
      });

      return {
        name,
        leadsCount: pmLeads.length,
        wonCount: won.length,
        revenue: rev,
        conversionRate: conv,
        trendPoints: trendPoints.length > 1 ? trendPoints : [0, rev]
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [filteredLeads, leadStateParents]);

  // PM chronological progression lines racing over the interval
  const pmRacingChartData = useMemo(() => {
    const dates = filteredLeads.map(l => l.createdAt ? new Date(l.createdAt).getTime() : 0).filter(Boolean);
    const startMs = filterStartDate ? filterStartDate.getTime() : (dates.length > 0 ? Math.min(...dates) : new Date().setDate(new Date().getDate() - 30));
    const endMs = filterEndDate ? filterEndDate.getTime() : (dates.length > 0 ? Math.max(...dates) : new Date().getTime());
    const rangeMs = endMs - startMs || 1;

    const series = pmLeaderboard.map((pm, pmIdx) => {
      const pmLeads = filteredLeads.filter(l => l.owner === pm.name);
      const sortedPmLeads = [...pmLeads]
        .filter(l => l.createdAt)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let cumulativeRevenue = 0;
      let cumulativeWon = 0;
      let totalProcessed = 0;

      const dataPoints: { xRatio: number; revenue: number; won: number; conversion: number; leadName: string }[] = [
        { xRatio: 0, revenue: 0, won: 0, conversion: 0, leadName: "Interval Start" }
      ];

      sortedPmLeads.forEach(l => {
        const leadTime = new Date(l.createdAt).getTime();
        const xRatio = Math.max(0, Math.min(1, (leadTime - startMs) / rangeMs));
        
        totalProcessed += 1;
        const statusLower = l.status.toLowerCase();
        if (statusLower === "accepted" || leadStateParents[statusLower] === "accepted") {
          cumulativeRevenue += l.value;
          cumulativeWon += 1;
        }

        const currentConversion = totalProcessed > 0 ? (cumulativeWon / totalProcessed) * 100 : 0;
        dataPoints.push({
          xRatio,
          revenue: cumulativeRevenue,
          won: cumulativeWon,
          conversion: Number(currentConversion.toFixed(1)),
          leadName: l.name
        });
      });

      if (dataPoints.length > 1) {
        const last = dataPoints[dataPoints.length - 1];
        dataPoints.push({
          ...last,
          xRatio: 1,
          leadName: "Interval End"
        });
      } else {
        dataPoints.push({
          xRatio: 1,
          revenue: 0,
          won: 0,
          conversion: 0,
          leadName: "Interval End"
        });
      }

      return {
        name: pm.name,
        color: getPMColor(pm.name, pmIdx),
        dataPoints
      };
    });

    return { startMs, endMs, series };
  }, [filteredLeads, pmLeaderboard, filterStartDate, filterEndDate, leadStateParents]);

  // Monthly revenue, lead counts, and client averages trends
  const monthlyTrends = useMemo(() => {
    const monthsMap: Record<string, { revenue: number; clientCount: number; leadCount: number }> = {};
    
    filteredLeads.forEach(l => {
      if (!l.createdAt) return;
      const monthKey = l.createdAt.substring(0, 7); // "2026-05"
      if (!monthsMap[monthKey]) {
        monthsMap[monthKey] = { revenue: 0, clientCount: 0, leadCount: 0 };
      }
      monthsMap[monthKey].leadCount += 1;
      const statusLower = l.status.toLowerCase();
      if (statusLower === "accepted" || leadStateParents[statusLower] === "accepted") {
        monthsMap[monthKey].revenue += l.value;
        monthsMap[monthKey].clientCount += 1;
      }
    });

    return Object.keys(monthsMap).sort().map(key => {
      const data = monthsMap[key];
      const revPerClient = data.clientCount > 0 ? data.revenue / data.clientCount : 0;
      const date = new Date(key + "-01");
      const label = date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      return {
        label,
        revenue: data.revenue,
        totalClients: data.clientCount,
        revPerClient,
        leadCount: data.leadCount
      };
    });
  }, [filteredLeads, leadStateParents]);

  // --- Client Demographics & Funnel Aggregators ---
  const clientTypes = useMemo(() => {
    const counts = { business: 0, person: 0, partner: 0 };
    filteredLeads.forEach(l => {
      if (counts[l.clientType] !== undefined) {
        counts[l.clientType] += 1;
      }
    });
    return counts;
  }, [filteredLeads]);

  // Interactive dynamic Pie chart computations for Client Types
  const clientTypeChartData = useMemo(() => {
    const total = (clientTypes.business || 0) + (clientTypes.person || 0) + (clientTypes.partner || 0);
    if (total === 0) {
      return { total: 0, segments: [] };
    }
    
    const segments = [
      { label: t("Business Entities (B2B)", "Firemní klienti (B2B)", "Céges ügyfelek (B2B)"), count: clientTypes.business, color: "#2563eb", strokeColor: "stroke-blue-600", fillColor: "fill-blue-600", textClass: "text-blue-650 font-bold", rawColor: "blue" },
      { label: t("Retail / Persons (B2C)", "Drobní klienti (B2C)", "Lakossági ügyfelek (B2C)"), count: clientTypes.person, color: "#10b981", strokeColor: "stroke-emerald-600", fillColor: "fill-emerald-600", textClass: "text-emerald-650 font-bold", rawColor: "emerald" },
      { label: t("Partner Accounts", "Partnerské účty", "Partnerfiókok"), count: clientTypes.partner, color: "#d97706", strokeColor: "stroke-amber-600", fillColor: "fill-amber-600", textClass: "text-amber-650 font-bold", rawColor: "amber" }
    ];

    let currentOffset = 0;
    const segmentsWithMath = segments.map(seg => {
      const percentage = (seg.count / total) * 100;
      const strokeDasharray = `${percentage} ${100 - percentage}`;
      const strokeDashoffset = (100 - currentOffset + 25) % 100;
      currentOffset += percentage;
      return {
        ...seg,
        percentage,
        strokeDasharray,
        strokeDashoffset
      };
    });

    return { total, segments: segmentsWithMath };
  }, [clientTypes, systemLanguage]);

  const cityDistribution = useMemo(() => {
    const cities: Record<string, number> = {};
    filteredLeads.forEach(l => {
      if (l.city) {
        cities[l.city] = (cities[l.city] || 0) + 1;
      }
    });
    return Object.entries(cities).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [filteredLeads]);

  const handleInspectChart = (type: "revenue" | "pipeline" | "leads" | "conversion" | "pm", pmName?: string) => {
    let title = "";
    let color = "";
    let valuePrefix = "";
    let valueSuffix = "";
    let details: InspectableDataPoint[] = [];

    if (type === "revenue") {
      title = t("Total Revenue Chronological Trend", "Chronologický vývoj celkových tržieb", "Teljes bevétel kronologikus trendje");
      color = "#10b981";
      valuePrefix = "$";
      let sum = 0;
      details = sortedLeads
        .filter(l => {
          const statusLower = l.status.toLowerCase();
          return statusLower === "accepted" || leadStateParents[statusLower] === "accepted";
        })
        .map(l => {
          sum += l.value;
          return {
            label: l.name,
            value: l.value,
            cumulative: sum,
            date: l.createdAt ? l.createdAt.substring(0, 16).replace("T", " ") : "N/A"
          };
        });
    } else if (type === "pipeline") {
      title = t("Active Pipeline Chronological Trend", "Chronologický vývoj aktívneho pipeline", "Aktív pipeline kronologikus trendje");
      color = "#6366f1";
      valuePrefix = "$";
      let sum = 0;
      details = sortedLeads
        .filter(l => {
          const statusLower = l.status.toLowerCase();
          const parent = leadStateParents[statusLower];
          const isClosed = statusLower === "accepted" || statusLower === "rejected" || parent === "accepted" || parent === "rejected";
          return !isClosed;
        })
        .map(l => {
          sum += l.value;
          return {
            label: l.name,
            value: l.value,
            cumulative: sum,
            date: l.createdAt ? l.createdAt.substring(0, 16).replace("T", " ") : "N/A"
          };
        });
    } else if (type === "leads") {
      title = t("Lead Growth Chronological Trend", "Chronologický vývoj rastu záujemcov", "Érdeklődők növekedésének kronologikus trendje");
      color = "#3b82f6";
      valueSuffix = t(" leads", " záujemcov", " érdeklődő");
      let count = 0;
      details = sortedLeads.map(l => {
        count += 1;
        return {
          label: l.name,
          value: 1,
          cumulative: count,
          date: l.createdAt ? l.createdAt.substring(0, 16).replace("T", " ") : "N/A"
        };
      });
    } else if (type === "conversion") {
      title = t("Lead-to-Client Conversion Rolling Rate", "Priebežná miera konverzie záujemca → klient", "Érdeklődő–ügyfél konverziós ráta");
      color = "#f43f5e";
      valueSuffix = "%";
      let wonCount = 0;
      let totalCount = 0;
      details = sortedLeads.map(l => {
        totalCount += 1;
        const statusLower = l.status.toLowerCase();
        const isWon = statusLower === "accepted" || leadStateParents[statusLower] === "accepted";
        if (isWon) {
          wonCount += 1;
        }
        return {
          label: `${l.name} (${isWon ? t("Won", "Vyhraný", "Megnyert") : t("Registered", "Registrovaný", "Regisztrált")})`,
          value: isWon ? 100 : 0,
          cumulative: Number(((wonCount / totalCount) * 100).toFixed(1)),
          date: l.createdAt ? l.createdAt.substring(0, 16).replace("T", " ") : "N/A"
        };
      });
    } else if (type === "pm" && pmName) {
      title = `${pmName} - ${t("Sales Performance Trend", "Vývoj predajnej výkonnosti", "Értékesítési teljesítmény trendje")}`;
      color = "#f59e0b";
      valuePrefix = "$";
      let sum = 0;
      details = sortedLeads
        .filter(l => {
          const statusLower = l.status.toLowerCase();
          const isWon = statusLower === "accepted" || leadStateParents[statusLower] === "accepted";
          return l.owner === pmName && isWon;
        })
        .map(l => {
          sum += l.value;
          return {
            label: l.name,
            value: l.value,
            cumulative: sum,
            date: l.createdAt ? l.createdAt.substring(0, 16).replace("T", " ") : "N/A"
          };
        });
    }

    const points = details.map(d => d.cumulative);
    setInspectingChart({
      title,
      color,
      points: points.length > 1 ? points : [0, ...points],
      details,
      valuePrefix,
      valueSuffix
    });
    setIsClosingInspector(false);
  };

  const closeInspector = () => {
    setIsClosingInspector(true);
    setTimeout(() => {
      setInspectingChart(null);
      setIsClosingInspector(false);
      setHoveredPointIdx(null);
    }, 350);
  };

  const handleCalendarSelect = (date: Date) => {
    if (!filterStartDate || (filterStartDate && filterEndDate)) {
      setFilterStartDate(date);
      setFilterEndDate(null);
      setFilterPresetName("Custom Range");
    } else if (filterStartDate && !filterEndDate) {
      if (date < filterStartDate) {
        setFilterStartDate(date);
      } else {
        setFilterEndDate(date);
      }
      setFilterPresetName("Custom Range");
    }
  };

  return (
    <div className="space-y-8 select-none animate-fade-in text-slate-800 relative">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-col">
          <h2 className="text-2xl font-heading font-extrabold text-slate-900 tracking-tight flex items-center gap-2 uppercase">
            <BarChart3 className="h-6 w-6 text-indigo-600" /> {getTranslation(systemLanguage, "header.title.dashboard")}
          </h2>
          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider mt-1">
            {systemName} &bull; {getTranslation(systemLanguage, "dashboard.subtitle")}
          </p>
        </div>

        {/* Date Interval Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-slate-205 hover:border-purple-500 rounded-2xl text-[10px] font-heading font-black text-slate-800 uppercase tracking-wider transition-all shadow-sm cursor-pointer select-none"
          >
            <Compass className="h-4 w-4 text-purple-600 animate-spin-slow" />
            {getTranslation(systemLanguage, "dashboard.analyze_interval")} <span className="text-purple-650 font-black">{getTranslation(systemLanguage, getPresetTranslationKey(filterPresetName) as any) || (filterPresetName === "Custom Range" ? t("Custom Range", "Vlastný rozsah", "Egyéni tartomány") : filterPresetName)}</span>
            {filterStartDate && (
              <span className="text-slate-400 font-bold ml-1">
                ({filterStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {filterEndDate ? ` - ${filterEndDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : t(" - Ongoing", " - Prebieha", " - Folyamatban")}
              </span>
            )}
          </button>

          {isDatePickerOpen && (
            <div className="absolute top-12 right-0 bg-white border-2 border-slate-100 shadow-2xl rounded-[32px] p-6 flex flex-col md:flex-row gap-6 z-[999] animate-in fade-in slide-in-from-top-4 duration-200 w-full md:w-[840px]">
              
              {/* Left sidebar: Preset quick intervals */}
              <div className="w-full md:w-[260px] border-r border-slate-100 pr-4 flex flex-col space-y-1.5 justify-start text-left shrink-0">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-1">{getTranslation(systemLanguage, "dashboard.quick_intervals")}</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { name: "Today", getRange: () => { const d = new Date(); return { start: d, end: d }; } },
                    { name: "Yesterday", getRange: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { start: d, end: d }; } },
                    { name: "This week", getRange: () => {
                        const start = new Date();
                        const day = start.getDay();
                        const diff = day === 0 ? -6 : 1 - day;
                        start.setDate(start.getDate() + diff);
                        const end = new Date();
                        return { start, end };
                      }
                    },
                    { name: "Last week", getRange: () => {
                        const start = new Date();
                        const day = start.getDay();
                        const diff = (day === 0 ? -6 : 1 - day) - 7;
                        start.setDate(start.getDate() + diff);
                        const end = new Date(start);
                        end.setDate(end.getDate() + 6);
                        return { start, end };
                      }
                    },
                    { name: "This month", getRange: () => {
                        const start = new Date();
                        start.setDate(1);
                        const end = new Date();
                        return { start, end };
                      }
                    },
                    { name: "Last month", getRange: () => {
                        const start = new Date();
                        start.setMonth(start.getMonth() - 1);
                        start.setDate(1);
                        const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
                        return { start, end };
                      }
                    },
                    { name: "This quarter", getRange: () => {
                        const start = new Date();
                        const currentMonth = start.getMonth();
                        const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
                        start.setMonth(quarterStartMonth);
                        start.setDate(1);
                        const end = new Date();
                        return { start, end };
                      }
                    },
                    { name: "Last quarter", getRange: () => {
                        const start = new Date();
                        const currentMonth = start.getMonth();
                        const lastQuarterStartMonth = (Math.floor(currentMonth / 3) - 1) * 3;
                        start.setMonth(lastQuarterStartMonth);
                        start.setDate(1);
                        const end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
                        return { start, end };
                      }
                    },
                    { name: "This year", getRange: () => {
                        const start = new Date(new Date().getFullYear(), 0, 1);
                        const end = new Date();
                        return { start, end };
                      }
                    },
                    { name: "Last year", getRange: () => {
                        const start = new Date(new Date().getFullYear() - 1, 0, 1);
                        const end = new Date(new Date().getFullYear() - 1, 11, 31);
                        return { start, end };
                      }
                    },
                    { name: "All Time", getRange: () => ({ start: null, end: null }), fullWidth: true }
                  ].map(preset => {
                    const isSelected = filterPresetName === preset.name;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => {
                          const { start, end } = preset.getRange();
                          setFilterStartDate(start);
                          setFilterEndDate(end);
                          setFilterPresetName(preset.name);
                          setIsDatePickerOpen(false);
                        }}
                        className={`text-left px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                          preset.fullWidth ? "col-span-2 text-center" : ""
                        } ${
                          isSelected 
                            ? "bg-purple-50 text-purple-700 border-purple-200" 
                            : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent"
                        }`}
                      >
                        {getTranslation(systemLanguage, getPresetTranslationKey(preset.name) as any)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right side: Dual calendars */}
              <div className="flex-1 flex flex-col space-y-4">
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Calendar 1: Current Month */}
                   <CalendarPane 
                    title={(() => {
                      const d = new Date();
                      return d.toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { month: "long", year: "numeric" });
                    })()}
                    year={new Date().getFullYear()}
                    month={new Date().getMonth()}
                    selectedStart={filterStartDate}
                    selectedEnd={filterEndDate}
                    onSelect={(date) => handleCalendarSelect(date)}
                    systemLanguage={systemLanguage}
                  />
                  {/* Calendar 2: Next Month */}
                  <CalendarPane 
                    title={(() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + 1);
                      return d.toLocaleDateString(systemLanguage === "sk" ? "sk-SK" : systemLanguage === "hu" ? "hu-HU" : "en-US", { month: "long", year: "numeric" });
                    })()}
                    year={(() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + 1);
                      return d.getFullYear();
                    })()}
                    month={(() => {
                      const d = new Date();
                      d.setMonth(d.getMonth() + 1);
                      return d.getMonth();
                    })()}
                    selectedStart={filterStartDate}
                    selectedEnd={filterEndDate}
                    onSelect={(date) => handleCalendarSelect(date)}
                    systemLanguage={systemLanguage}
                  />
                </div>

                {/* Actions bottom block */}
                <div className="flex justify-between items-center border-t border-slate-100 pt-4 text-[10px] font-bold text-slate-400">
                  <span>{getTranslation(systemLanguage, "dashboard.picker.info")}</span>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => {
                        setFilterStartDate(null);
                        setFilterEndDate(null);
                        setFilterPresetName("All Time");
                        setIsDatePickerOpen(false);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-black uppercase tracking-wider transition-colors cursor-pointer border border-slate-200"
                    >
                      {getTranslation(systemLanguage, "dashboard.picker.reset")}
                    </button>
                    <button 
                      type="button"
                      onClick={() => setIsDatePickerOpen(false)}
                      className="px-3.5 py-1.5 bg-purple-650 hover:bg-purple-700 text-white rounded-xl font-black uppercase tracking-wider transition-colors cursor-pointer shadow-md shadow-purple-600/10"
                    >
                      {getTranslation(systemLanguage, "dashboard.picker.apply")}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Navigation sub-tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 w-full max-w-[900px] gap-1 shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
            activeTab === "overview"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-700 font-black"
              : "text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/50"
          }`}
        >
          <Award className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "dashboard.tab_overview")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("campaigns")}
          className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
            activeTab === "campaigns"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-700 font-black"
              : "text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/50"
          }`}
        >
          <Target className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "dashboard.tab_campaigns")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("crm")}
          className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
            activeTab === "crm"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-700 font-black"
              : "text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/50"
          }`}
        >
          <TrendingUp className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "dashboard.tab_crm")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("clients")}
          className={`flex-1 py-3 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all text-center flex items-center justify-center gap-1.5 ${
            activeTab === "clients"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20 border border-indigo-700 font-black"
              : "text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200/50"
          }`}
        >
          <Users className="h-3.5 w-3.5" /> {getTranslation(systemLanguage, "dashboard.tab_clients")}
        </button>
      </div>

      {/* --- TAB 1: EXECUTIVE OVERVIEW --- */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Key Metric cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-bottom duration-300">
            <div 
              onClick={() => handleInspectChart("revenue")}
              className="glass-panel p-5 rounded-3xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 shadow-md shadow-emerald-500/5 flex items-center gap-4 hover:scale-[1.03] active:scale-[0.98] cursor-pointer transition-all duration-200 relative overflow-hidden group"
            >
              <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center text-xl shadow-lg shadow-emerald-500/20 animate-pulse relative z-20">
                <Coins className="h-6 w-6" />
              </div>
              <div className="flex flex-col relative z-20">
                <span className="text-[10px] text-emerald-700 font-extrabold uppercase tracking-wider">{getTranslation(systemLanguage, "dashboard.kpi.revenue")}</span>
                <span className="text-2xl font-black tracking-tight text-slate-900">${totalRevenue.toLocaleString()}</span>
                <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 mt-0.5">
                  {t("Won Deals Only", "Iba uzavreté obchody", "Csak megnyert üzletek")}
                </span>
              </div>
              <Sparkline points={revenuePoints} color="#10b981" />
            </div>

            <div 
              onClick={() => handleInspectChart("pipeline")}
              className="glass-panel p-5 rounded-3xl border-2 border-indigo-400 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 shadow-md shadow-indigo-500/5 flex items-center gap-4 hover:scale-[1.03] active:scale-[0.98] cursor-pointer transition-all duration-200 relative overflow-hidden group"
            >
              <div className="h-12 w-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20 relative z-20">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div className="flex flex-col relative z-20">
                <span className="text-[10px] text-indigo-700 font-extrabold uppercase tracking-wider">{t("Active Pipeline", "Aktívny pipeline", "Aktív pipeline")}</span>
                <span className="text-2xl font-black tracking-tight text-slate-900">${activePipelineValue.toLocaleString()}</span>
                <span className="text-[9px] text-indigo-600 font-bold flex items-center gap-0.5 mt-0.5">
                  {activePipelineLeads.length} {t("Ongoing Deals", "Prebiehajúce obchody", "Folyamatban lévő üzletek")}
                </span>
              </div>
              <Sparkline points={pipelinePoints} color="#6366f1" />
            </div>

            <div 
              onClick={() => handleInspectChart("leads")}
              className="glass-panel p-5 rounded-3xl border-2 border-blue-400 bg-gradient-to-br from-blue-500/10 to-cyan-500/5 shadow-md shadow-blue-500/5 flex items-center gap-4 hover:scale-[1.03] active:scale-[0.98] cursor-pointer transition-all duration-200 relative overflow-hidden group"
            >
              <div className="h-12 w-12 rounded-2xl bg-blue-500 text-white flex items-center justify-center text-xl shadow-lg shadow-blue-500/20 relative z-20">
                <Users className="h-6 w-6" />
              </div>
              <div className="flex flex-col relative z-20">
                <span className="text-[10px] text-blue-700 font-extrabold uppercase tracking-wider">{getTranslation(systemLanguage, "dashboard.kpi.leads")}</span>
                <span className="text-2xl font-black tracking-tight text-slate-900">{totalLeadsCount}</span>
                <span className="text-[9px] text-blue-600 font-bold flex items-center gap-0.5 mt-0.5">
                  {t("CRM Registered Slabs", "Záznamy v CRM", "CRM-ben regisztrált tételek")}
                </span>
              </div>
              <Sparkline points={leadCountPoints} color="#3b82f6" />
            </div>

            <div 
              onClick={() => handleInspectChart("conversion")}
              className="glass-panel p-5 rounded-3xl border-2 border-rose-450 bg-gradient-to-br from-rose-500/10 to-pink-500/5 shadow-md shadow-rose-500/5 flex items-center gap-4 hover:scale-[1.03] active:scale-[0.98] cursor-pointer transition-all duration-200 relative overflow-hidden group"
            >
              <div className="h-12 w-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center text-xl shadow-lg shadow-rose-500/20 relative z-20">
                <Target className="h-6 w-6" />
              </div>
              <div className="flex flex-col relative z-20">
                <span className="text-[10px] text-rose-700 font-extrabold uppercase tracking-wider">{getTranslation(systemLanguage, "dashboard.kpi.conversion")}</span>
                <span className="text-2xl font-black tracking-tight text-slate-900">{leadToClientConversion.toFixed(1)}%</span>
                <span className="text-[9px] text-rose-600 font-bold flex items-center gap-0.5 mt-0.5">
                  {t("Leads", "Záujemcovia", "Érdeklődők")} &rarr; {t("Won Clients", "Získaní klienti", "Megnyert ügyfelek")}
                </span>
              </div>
              <Sparkline points={conversionPoints} color="#f43f5e" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Playful Pipeline Funnel Graph */}
            <div className="lg:col-span-7 glass-panel p-6 rounded-[32px] border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/20 to-purple-50/20 shadow-xl space-y-6 flex flex-col justify-between hover:scale-[1.01] transition-transform duration-300">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-indigo-100 pb-3">
                <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-indigo-650 animate-pulse" /> {t("Pipeline Funnel Graph", "Graf predajného lievika", "Értékesítési tölcsér grafikon")}
                </h3>
                
                <div className="flex items-center gap-2">
                  <div className="flex bg-slate-200/60 p-0.5 rounded-xl border border-slate-300/40 gap-0.5 select-none shrink-0">
                    <button
                      type="button"
                      onClick={() => setFunnelMetric("count")}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        funnelMetric === "count"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                      }`}
                    >
                      {t("Count", "Počet", "Darab")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFunnelMetric("value")}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        funnelMetric === "value"
                          ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                          : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                      }`}
                    >
                      {t("Value ($)", "Hodnota ($)", "Érték ($)")}
                    </button>
                  </div>
                  <span className="text-[9px] font-black text-indigo-600 bg-indigo-100/60 px-2.5 py-1.5 rounded-xl border border-indigo-200 uppercase tracking-wider shrink-0">
                    {t("Flow Analytics", "Analýza toku", "Folyamatelemzés")}
                  </span>
                </div>
              </div>
              
              {/* Horizontal Funnel Diagram utilizing SVG polygons */}
              <div className="space-y-6 pt-2 w-full">
                {(() => {
                  const openStates = leadStates.filter(s => {
                    const isSubstate = !!leadStateParents[s.toLowerCase()];
                    if (isSubstate) return false;
                    const grp = leadStageGroups[s.toLowerCase()] || "in_progress";
                    return grp === "new" || grp === "in_progress";
                  });

                  if (openStates.length === 0) {
                    return (
                      <div className="h-44 flex items-center justify-center text-xs font-black text-slate-400 uppercase tracking-widest">
                        {t("No active pipeline stages defined", "Nie sú definované žiadne aktívne fázy pipeline", "Nincsenek aktív pipeline szakaszok meghatározva")}
                      </div>
                    );
                  }

                  const stageData = openStates.map(s => {
                    const count = filteredLeads.filter(l => l.status.toLowerCase() === s.toLowerCase() || leadStateParents[l.status.toLowerCase()] === s.toLowerCase()).length;
                    const value = filteredLeads.filter(l => l.status.toLowerCase() === s.toLowerCase() || leadStateParents[l.status.toLowerCase()] === s.toLowerCase()).reduce((sum, l) => sum + l.value, 0);
                    const metricVal = funnelMetric === "count" ? count : value;
                    const color = leadStateColors[s.toLowerCase()] || "#6366f1";
                    return { name: s, count, value, metricVal, color };
                  });

                  const totalMetricSum = stageData.reduce((acc, s) => acc + s.metricVal, 0);

                  // Calculate viewBox parameters
                  const N = stageData.length;
                  const viewBoxWidth = Math.max(600, N * 95);
                  const viewBoxHeight = 200;
                  const leftBound = 10;
                  const rightBound = viewBoxWidth - 10;
                  const totalAvailable = rightBound - leftBound;
                  const gap = 6;
                  const totalGaps = (N - 1) * gap;
                  const distributableWidth = totalAvailable - totalGaps;
                  const minSegmentWidth = 70;
                  const totalMinWidths = N * minSegmentWidth;
                  const remainingWidth = Math.max(0, distributableWidth - totalMinWidths);

                  // Funnel Heights
                  const maxH = 180;
                  const minH = 45;

                  // Render and coordinate arrays
                  let currentX = leftBound;
                  const renderedSegments: React.ReactNode[] = [];
                  const maxMetricVal = Math.max(...stageData.map(s => s.metricVal));

                  stageData.forEach((stage, idx) => {
                    const w = totalMetricSum > 0 
                      ? minSegmentWidth + (stage.metricVal / totalMetricSum) * remainingWidth
                      : distributableWidth / N;

                    const X_start = currentX;
                    const X_end = X_start + w;
                    currentX = X_end + gap;

                    // Proportional height calculations for continuous flow
                    const getStageHeight = (val: number) => {
                      return maxMetricVal > 0 
                        ? minH + (val / maxMetricVal) * (maxH - minH)
                        : 120;
                    };

                    const H_left = getStageHeight(stage.metricVal);
                    const H_right = idx < N - 1 
                      ? getStageHeight(stageData[idx + 1].metricVal) 
                      : Math.max(minH, H_left * 0.7);

                    const TopY_start = 100 - H_left / 2;
                    const BottomY_start = 100 + H_left / 2;
                    const TopY_end = 100 - H_right / 2;
                    const BottomY_end = 100 + H_right / 2;

                    const pointsStr = `${X_start},${TopY_start} ${X_end},${TopY_end} ${X_end},${BottomY_end} ${X_start},${BottomY_start}`;

                    const X_mid = X_start + w / 2;
                    const H_mid = (H_left + H_right) / 2;

                    const isTall = H_mid >= 85;
                    const nameY = isTall ? 92 : 95;
                    const valY = isTall ? 112 : 110;
                    
                    const displayPercent = totalMetricSum > 0 ? (stage.metricVal / totalMetricSum) * 100 : 0;

                    renderedSegments.push(
                      <g 
                        key={stage.name} 
                        className="cursor-pointer transition-all duration-300 hover:opacity-90 active:scale-[0.99]"
                      >
                        <title>{`${stage.name.toUpperCase()} - ${t("Count", "Počet", "Darab")}: ${stage.count} - ${t("Value", "Hodnota", "Érték")}: $${stage.value.toLocaleString()}`}</title>
                        <polygon 
                          points={pointsStr} 
                          fill={stage.color}
                          className="transition-all duration-300 drop-shadow-md hover:drop-shadow-lg" 
                        />
                        {/* Stage Name */}
                        <text 
                          x={X_mid} 
                          y={nameY} 
                          textAnchor="middle" 
                          fill="#ffffff" 
                          className="text-[9px] font-black tracking-wider uppercase select-none"
                          style={{ fill: "#ffffff", fontWeight: 900 }}
                        >
                          {stage.name.length > 10 ? `${stage.name.substring(0, 9)}...` : stage.name}
                        </text>
                        {/* Primary Metric Value */}
                        <text 
                          x={X_mid} 
                          y={valY} 
                          textAnchor="middle" 
                          fill="#ffffff" 
                          className="text-[12px] font-black select-none"
                          style={{ fill: "#ffffff", fontWeight: 900 }}
                        >
                          {funnelMetric === "count" ? stage.count : `$${stage.value.toLocaleString()}`}
                        </text>
                        {/* Percentage */}
                        {isTall && (
                          <text 
                            x={X_mid} 
                            y={130} 
                            textAnchor="middle" 
                            fill="#ffffff" 
                            opacity="0.8" 
                            className="text-[8px] font-bold tracking-wider select-none"
                          >
                            {displayPercent.toFixed(0)}%
                          </text>
                        )}
                      </g>
                    );
                  });

                  return (
                    <>
                      <div className="w-full overflow-x-auto scrollbar-none">
                        <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="w-full min-w-[500px] h-auto drop-shadow-xl select-none" style={{ overflow: "visible" }}>
                          {renderedSegments}
                        </svg>
                      </div>

                      {/* Swatches Legend matching reference visual layout */}
                      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 pt-4 border-t border-slate-100 select-none">
                        {stageData.map(stage => {
                          const displayPercent = totalMetricSum > 0 ? (stage.metricVal / totalMetricSum) * 100 : 0;
                          return (
                            <div key={stage.name} className="flex items-center gap-2">
                              <span className="h-3.5 w-3.5 rounded-full border border-white shadow-sm" style={{ backgroundColor: stage.color }} />
                              <span className="text-[10px] font-black uppercase text-slate-600 tracking-wider">
                                {stage.name}: <strong className="text-slate-800">{funnelMetric === "count" ? `${stage.count} ${t("leads", "záujemcov", "érdeklődő")}` : `$${stage.value.toLocaleString()}`}</strong> ({displayPercent.toFixed(1)}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Top performing channels */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
              <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="h-4 w-4 text-emerald-600" /> {t("Top Sales Channels ROI", "ROI najlepších predajných kanálov", "Legjobb értékesítési csatornák ROI")}
              </h3>

              <div className="space-y-4 pt-2">
                {[
                  { name: "Meta Campaigns (FB/IG)", spent: metaSpent, won: metaWonValue, roi: metaRoi, badge: "bg-blue-50 text-blue-700 border-blue-200" },
                  { name: "Google Campaigns (Search/Web)", spent: googleSpent, won: googleWonValue, roi: googleRoi, badge: "bg-amber-50 text-amber-700 border-amber-200" }
                ].map(channel => (
                  <div key={channel.name} className="p-3.5 rounded-2xl border border-slate-100 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800">{channel.name}</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${channel.badge}`}>
                        ROI: {channel.roi.toFixed(0)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-500">
                      <div>{t("Spent", "Minuté", "Elköltött")}: <strong className="text-slate-800">${channel.spent.toLocaleString()}</strong></div>
                      <div>{t("Sales Value", "Hodnota predaja", "Értékesítési érték")}: <strong className="text-slate-800">${channel.won.toLocaleString()}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Projects Valuation Leaderboard Table */}
          <div className="glass-panel p-6 rounded-[32px] border border-slate-100 bg-white shadow-sm space-y-4 hover:scale-[1.005] transition-transform duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-col">
                <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4 text-indigo-600 animate-pulse" /> {t("Projects Valuation Leaderboard", "Rebríček hodnoty projektov", "Projektek értékelési ranglistája")}
                </h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                  {t("Active business ventures sorted by deal size & share of portfolio worth inside selected date window", "Aktívne obchodné príležitosti zoradené podľa veľkosti obchodu a podielu na hodnote portfólia vo vybranom časovom období", "Aktív üzleti lehetőségek az üzlet mérete és a portfólió értékéből való részesedés szerint rendezve a kiválasztott időszakban")}
                </p>
              </div>
              
              <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl px-4 py-2 flex items-center gap-2.5 shrink-0 select-none">
                <span className="text-[9px] font-black uppercase text-indigo-700 tracking-wider">{t("Total Portfolio Valuation", "Celková hodnota portfólia", "Teljes portfólió értéke")}:</span>
                <span className="text-sm font-black text-indigo-900">${totalProjectsSum.toLocaleString()}</span>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto border border-slate-100 rounded-2xl bg-slate-50/20 select-none">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white">
                    <th className="sticky top-0 bg-white z-10 px-4 py-3.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border-b-2 border-slate-100">{t("Rank", "Poradie", "Helyezés")}</th>
                    <th className="sticky top-0 bg-white z-10 px-4 py-3.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border-b-2 border-slate-100">{t("Project / Client Name", "Názov projektu / klienta", "Projekt / ügyfél neve")}</th>
                    <th className="sticky top-0 bg-white z-10 px-4 py-3.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border-b-2 border-slate-100">{t("Location", "Lokalita", "Helyszín")}</th>
                    <th className="sticky top-0 bg-white z-10 px-4 py-3.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border-b-2 border-slate-100">{t("State", "Stav", "Állapot")}</th>
                    <th className="sticky top-0 bg-white z-10 px-4 py-3.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border-b-2 border-slate-100">{t("Project Owner", "Vlastník projektu", "Projekt felelőse")}</th>
                    <th className="sticky top-0 bg-white z-10 px-4 py-3.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border-b-2 border-slate-100 text-right">{t("Value", "Hodnota", "Érték")}</th>
                    <th className="sticky top-0 bg-white z-10 px-4 py-3.5 text-[9px] font-black uppercase tracking-wider text-indigo-700 border-b-2 border-slate-100 text-right">{t("Share Of Total", "Podiel z celku", "Részesedés az összesből")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                        {t("No projects found within the active interval", "V aktívnom období neboli nájdené žiadne projekty", "Nincsenek projektek a kiválasztott időszakban")}
                      </td>
                    </tr>
                  ) : (
                    sortedProjects.map((p, idx) => {
                      const sharePercent = totalProjectsSum > 0 ? (p.value / totalProjectsSum) * 100 : 0;
                      return (
                        <tr 
                          key={p.id}
                          onClick={() => {
                            setSelectedLeadForDrawer(p);
                            setIsClosingLeadDrawer(false);
                          }}
                          className="hover:bg-slate-50/80 transition-all border-b border-slate-100/50 group cursor-pointer active:scale-[0.99]"
                        >
                          <td className="px-4 py-3 text-xs font-black text-slate-400 group-hover:text-indigo-600 transition-colors">
                            #{idx + 1}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-xs font-black text-slate-800">{p.name}</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[8px] text-slate-400 font-extrabold uppercase tracking-wider">{t("source", "zdroj", "forrás")}:</span>
                                <span 
                                  className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border select-none leading-none"
                                  style={{
                                    backgroundColor: `${leadSourceColors[p.source.toLowerCase()] || "#10b981"}15`,
                                    color: leadSourceColors[p.source.toLowerCase()] || "#10b981",
                                    borderColor: `${leadSourceColors[p.source.toLowerCase()] || "#10b981"}35`
                                  }}
                                >
                                  {p.source}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[10px] font-bold text-slate-500">{p.city}</td>
                          <td className="px-4 py-3">
                            {(() => {
                              const sName = p.status.toLowerCase();
                              const parentName = leadStateParents[sName];
                              if (parentName) {
                                const parentColor = leadStateColors[parentName.toLowerCase()] || "#6366f1";
                                const subColor = leadStateColors[sName] || "#38bdf8";
                                return (
                                  <span 
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider select-none text-white leading-none"
                                    style={{
                                      background: `linear-gradient(135deg, ${parentColor}, ${subColor})`
                                    }}
                                  >
                                    {parentName.toUpperCase()} &gt; {p.status.toUpperCase()}
                                  </span>
                                );
                              } else {
                                const mainColor = leadStateColors[sName] || "#6366f1";
                                return (
                                  <span 
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider select-none text-white leading-none"
                                    style={{
                                      backgroundColor: mainColor
                                    }}
                                  >
                                    {p.status.toUpperCase()}
                                  </span>
                                );
                              }
                            })()}
                          </td>
                          <td className="px-4 py-3 text-[10px] font-black text-slate-600">{p.owner}</td>
                          <td className="px-4 py-3 text-xs font-black text-slate-900 text-right">${p.value.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-[10px] font-black text-indigo-700">{sharePercent.toFixed(1)}%</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: CAMPAIGN PERFORMANCES --- */}
      {activeTab === "campaigns" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Platform-Wide Totals */}
          <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
            <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-indigo-600" /> {t("Platform-Wide Campaign Summaries", "Súhrn kampaní naprieč platformami", "Platformokon átívelő kampányösszesítés")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Total Campaign Spent", "Celkové výdavky na kampane", "Teljes kampányköltés")}</span>
                <span className="text-lg font-black text-slate-800 block mt-1">${totalSpent.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Won Leads Value", "Hodnota získaných záujemcov", "Megnyert érdeklődők értéke")}</span>
                <span className="text-lg font-black text-slate-800 block mt-1">${totalWonValue.toLocaleString()}</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Total Platform ROI", "Celkové ROI platformy", "Teljes platform ROI")}</span>
                <span className={`text-lg font-black block mt-1 ${totalRoi >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {totalRoi.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Top Platform Totals Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Meta Total */}
            <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-blue-50/15 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-600" />
                  <div className="flex flex-col">
                    <h3 className="text-xs font-heading font-black text-slate-800 uppercase tracking-wider">{t("Meta Ads Platform", "Reklamná platforma Meta", "Meta hirdetési platform")}</h3>
                    <span className="text-[9px] text-slate-400 font-semibold uppercase">{t("Facebook & Instagram Feeds", "Feedy Facebook & Instagram", "Facebook és Instagram hírfolyamok")}</span>
                  </div>
                </div>
                <span className="text-xs font-black text-blue-700 bg-blue-100/60 px-3 py-1 rounded-full uppercase tracking-wider border border-blue-200">
                  ROI: {metaRoi.toFixed(0)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-white rounded-2xl border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Total Spent", "Celkové výdavky", "Összes költés")}</span>
                  <span className="text-base font-black text-slate-800 block mt-1">${metaSpent.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("CRM Won Value", "Získaná hodnota v CRM", "CRM megnyert érték")}</span>
                  <span className="text-base font-black text-slate-800 block mt-1">${metaWonValue.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Cost per Lead", "Cena za záujemcu", "Költség érdeklődőnként")}</span>
                  <span className="text-base font-black text-emerald-600 block mt-1">
                    ${(metaSpent / (leads.filter(l => (l.source === "facebook" || l.source === "instagram")).length || 1)).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            {/* Google Total */}
            <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-amber-50/15 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-amber-500 animate-pulse" />
                  <div className="flex flex-col">
                    <h3 className="text-xs font-heading font-black text-slate-800 uppercase tracking-wider">{t("Google Ads Platform", "Reklamná platforma Google", "Google hirdetési platform")}</h3>
                    <span className="text-[9px] text-slate-400 font-semibold uppercase">{t("Search & Display Campaigns", "Kampane vo vyhľadávaní a obsahovej sieti", "Keresési és display kampányok")}</span>
                  </div>
                </div>
                <span className="text-xs font-black text-amber-700 bg-amber-100/60 px-3 py-1 rounded-full uppercase tracking-wider border border-amber-200">
                  ROI: {googleRoi.toFixed(0)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-white rounded-2xl border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Total Spent", "Celkové výdavky", "Összes költés")}</span>
                  <span className="text-base font-black text-slate-800 block mt-1">${googleSpent.toFixed(2)}</span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("CRM Won Value", "Získaná hodnota v CRM", "CRM megnyert érték")}</span>
                  <span className="text-base font-black text-slate-800 block mt-1">${googleWonValue.toLocaleString()}</span>
                </div>
                <div className="p-3 bg-white rounded-2xl border border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Cost per Lead", "Cena za záujemcu", "Költség érdeklődőnként")}</span>
                  <span className="text-base font-black text-emerald-600 block mt-1">
                    ${(googleSpent / (leads.filter(l => l.source === "website").length || 1)).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown to each Meta and Google campaign (Always Separate) */}
          <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-6">
            <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-indigo-600" /> {t("Separate Campaign performance Breakdown", "Samostatný rozpis výkonnosti kampaní", "Külön kampányteljesítmény-bontás")}
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Meta Columns */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-blue-700 tracking-wider flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-blue-600" /> {t("Meta Ads Campaign Breakdown", "Rozpis kampaní Meta Ads", "Meta Ads kampánybontás")}
                </h4>
                
                <div className="space-y-3">
                  {metaCampaigns.map((c: Campaign) => {
                    const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00";
                    return (
                      <div key={c.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-2 relative group hover:shadow-md transition-all duration-200">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-bold text-slate-800 leading-tight pr-4">{c.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${
                            c.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-250" : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[10px] font-semibold text-slate-500 pt-2 border-t border-slate-100">
                          <div>{t("Spent", "Minuté", "Elköltött")}: <strong className="text-slate-800 block mt-0.5">${c.spent}</strong></div>
                          <div>{t("Clicks", "Kliknutia", "Kattintások")}: <strong className="text-slate-800 block mt-0.5">{c.clicks}</strong></div>
                          <div>CTR: <strong className="text-indigo-600 block mt-0.5">{ctr}%</strong></div>
                          <div>{t("Leads", "Záujemcovia", "Érdeklődők")}: <strong className="text-emerald-600 block mt-0.5">{c.leads}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Google Columns */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-amber-700 tracking-wider flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-amber-500" /> {t("Google Ads Campaign Breakdown", "Rozpis kampaní Google Ads", "Google Ads kampánybontás")}
                </h4>
                
                <div className="space-y-3">
                  {googleCampaigns.map((c: Campaign) => {
                    const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(2) : "0.00";
                    return (
                      <div key={c.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-2 relative group hover:shadow-md transition-all duration-200">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-bold text-slate-800 leading-tight pr-4">{c.name}</span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${
                            c.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-250" : "bg-slate-100 text-slate-500 border-slate-200"
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[10px] font-semibold text-slate-500 pt-2 border-t border-slate-100">
                          <div>{t("Spent", "Minuté", "Elköltött")}: <strong className="text-slate-800 block mt-0.5">${c.spent}</strong></div>
                          <div>{t("Clicks", "Kliknutia", "Kattintások")}: <strong className="text-slate-800 block mt-0.5">{c.clicks}</strong></div>
                          <div>CTR: <strong className="text-indigo-600 block mt-0.5">{ctr}%</strong></div>
                          <div>{t("Leads", "Záujemcovia", "Érdeklődők")}: <strong className="text-emerald-600 block mt-0.5">{c.leads}</strong></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: CRM COMPANY PERFORMANCE & PM LEADERBOARD --- */}
      {activeTab === "crm" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Company Core KPI Summaries */}
          <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
            <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-indigo-600" /> {t("CRM Company Key Performance Indicators", "Kľúčové ukazovatele výkonnosti firmy v CRM", "A vállalat kulcsfontosságú teljesítménymutatói a CRM-ben")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-center">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Average Deal Value", "Priemerná hodnota obchodu", "Átlagos üzletérték")}</span>
                <span className="text-lg font-black text-slate-800 block mt-1">${averageDealValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">{t("Active Deals in Funnel", "Aktívne obchody v lieviku", "Aktív üzletek a tölcsérben")}</span>
                <span className="text-lg font-black text-indigo-650 block mt-1">{activePipelineLeads.length}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* PM Leaderboard */}
            <div className="lg:col-span-5 glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
              <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="h-4 w-4 text-amber-500" /> {t("Project Managers Toplist", "Rebríček projektových manažérov", "Projektmenedzserek ranglistája")}
              </h3>

              <div className="space-y-3 pt-2">
                {pmLeaderboard.map((pm, idx) => {
                  const maxRevenue = Math.max(...pmLeaderboard.map(p => p.revenue), 1);
                  const revenuePercentage = (pm.revenue / maxRevenue) * 100;
                  
                  // Rank styling configurations
                  let badgeBg = "bg-slate-100 text-slate-500 border-slate-200";
                  let cardHover = "hover:border-slate-355 hover:shadow-md hover:shadow-slate-100/50";
                  let rankTitle = t("Contender", "Vyzývateľ", "Kihívó");
                  let icon = <Award className="h-3.5 w-3.5 text-slate-400" />;
                  let sparklineColor = "#6366f1"; // indigo
                  
                  if (idx === 0) {
                    badgeBg = "bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 text-white border-amber-350 shadow-md shadow-amber-500/25";
                    cardHover = "hover:border-amber-300 hover:shadow-lg hover:shadow-amber-500/5";
                    rankTitle = t("Elite Champion", "Elitný šampión", "Elit bajnok");
                    icon = <Crown className="h-3.5 w-3.5 text-white animate-bounce duration-1000" />;
                    sparklineColor = "#f59e0b"; // gold/amber
                  } else if (idx === 1) {
                    badgeBg = "bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 text-white border-slate-250 shadow-md shadow-slate-500/15";
                    cardHover = "hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5";
                    rankTitle = t("Super Challenger", "Super vyzývateľ", "Szuper kihívó");
                    icon = <Medal className="h-3.5 w-3.5 text-white" />;
                    sparklineColor = "#6366f1"; // indigo/silver
                  } else if (idx === 2) {
                    badgeBg = "bg-gradient-to-br from-orange-400 via-amber-600 to-orange-600 text-white border-orange-350 shadow-md shadow-orange-500/15";
                    cardHover = "hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/5";
                    rankTitle = t("Rising Star", "Vychádzajúca hviezda", "Feltörekvő csillag");
                    icon = <Trophy className="h-3.5 w-3.5 text-white" />;
                    sparklineColor = "#f97316"; // orange/bronze
                  }

                  // Streaks / Status tag triggers (No Emojis!)
                  const isHighConversion = pm.conversionRate >= 20;

                  return (
                    <div 
                      key={pm.name} 
                      onClick={() => handleInspectChart("pm", pm.name)}
                      className={`flex flex-col p-4 bg-slate-50/50 border border-slate-100 rounded-2xl transition-all relative overflow-hidden group hover:scale-[1.02] active:scale-[0.98] cursor-pointer shadow-sm ${cardHover}`}
                    >
                      {/* Top Row: Rank & Name + Status Badge & Sparkline/Revenue */}
                      <div className="flex items-center justify-between relative z-20">
                        <div className="flex items-center gap-3">
                          {/* Gamified physical round badge */}
                          <div className={`h-9 w-9 rounded-full font-heading font-black text-[11px] flex items-center justify-center border relative shrink-0 ${badgeBg}`}>
                            {icon}
                            {/* Level floating tag */}
                            <span className="absolute -bottom-1 -right-1.5 px-1 bg-slate-800 text-white text-[7px] font-black rounded-full uppercase tracking-wider scale-90 border border-white">
                              {t("Lvl", "Úr.", "Szint")} {pm.wonCount + 1}
                            </span>
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-slate-800">{pm.name}</span>
                              <span className={`text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider border select-none ${
                                idx === 0 ? "bg-amber-500/10 text-amber-700 border-amber-200" :
                                idx === 1 ? "bg-indigo-50/15 text-indigo-700 border-indigo-200/50" :
                                "bg-orange-50 text-orange-700 border-orange-200"
                              }`}>
                                {rankTitle}
                              </span>
                            </div>
                            <span className="text-[9px] text-slate-400 font-semibold">{pm.wonCount} {t("won of", "vyhraných z", "megnyerve ebből")} {pm.leadsCount} {t("deals", "obchodov", "üzlet")}</span>
                          </div>
                        </div>

                        {/* Revenue & Conversion Rate stats */}
                        <div className="flex items-center gap-4">
                          {/* Sparkline chart */}
                          <div className="opacity-80 group-hover:opacity-100 transition-opacity">
                            <Sparkline points={pm.trendPoints} color={sparklineColor} />
                          </div>
                          
                          <div className="flex flex-col items-end shrink-0">
                            <span className="text-xs font-black text-slate-900">${pm.revenue.toLocaleString()}</span>
                            <div className="flex items-center gap-1 text-[9px] font-bold">
                              {isHighConversion && <Flame className="h-3 w-3 text-orange-500 animate-pulse" />}
                              <span className={isHighConversion ? "text-orange-650" : "text-emerald-600"}>
                                {pm.conversionRate.toFixed(0)}% {t("conversion", "konverzia", "konverzió")}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Row: XP Progress Bar comparing to #1 */}
                      <div className="mt-3 flex items-center justify-between gap-3 relative z-20">
                        {/* XP bar label */}
                        <span className="text-[7px] font-black uppercase tracking-widest text-slate-450 shrink-0">
                          {idx === 0 ? t("Champion Level Max", "Maximálna úroveň šampióna", "Bajnoki szint max") : `${Math.round(revenuePercentage)}% ${t("of Top Score", "z najlepšieho skóre", "a legjobb pontszámból")}`}
                        </span>
                        {/* Interactive progress bar */}
                        <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden relative border border-slate-200/30">
                          <div 
                            className={`h-full rounded-full transition-all duration-700 ${
                              idx === 0 ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" :
                              idx === 1 ? "bg-gradient-to-r from-slate-400 to-indigo-500" :
                              "bg-gradient-to-r from-orange-400 to-orange-500"
                            }`}
                            style={{ width: `${revenuePercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PM Comparison Graph */}
            <div className="lg:col-span-7 glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-purple-650" /> {t("PM Comparison Race", "Pretek porovnania PM", "PM összehasonlító verseny")}
                </h3>
                
                {/* Selector Toggles */}
                <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 w-fit gap-1 text-[8px] uppercase tracking-wider font-black font-heading shrink-0 select-none">
                  <button 
                    type="button" 
                    onClick={() => setCompareAspect("revenue")}
                    className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${compareAspect === "revenue" ? "bg-purple-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 bg-white"}`}
                  >
                    {t("Revenue", "Tržby", "Bevétel")}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setCompareAspect("won")}
                    className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${compareAspect === "won" ? "bg-purple-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 bg-white"}`}
                  >
                    {t("Won Deals", "Uzavreté obchody", "Megnyert üzletek")}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setCompareAspect("conversion")}
                    className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer ${compareAspect === "conversion" ? "bg-purple-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800 bg-white"}`}
                  >
                    {t("Conversion", "Konverzia", "Konverzió")}
                  </button>
                </div>
              </div>

              {/* Shared Racing Plotline Chart */}
              <div className="relative bg-slate-50 border border-slate-100 rounded-3xl p-4 flex flex-col items-center justify-center min-h-[260px]">
                {(() => {
                  const width = 500;
                  const height = 200;
                  const paddingX = 40;
                  const paddingY = 24;

                  // Find maximum Y value across all data points
                  const allPoints: number[] = [];
                  pmRacingChartData.series.forEach(s => {
                    s.dataPoints.forEach(p => {
                      if (compareAspect === "revenue") allPoints.push(p.revenue);
                      else if (compareAspect === "won") allPoints.push(p.won);
                      else allPoints.push(p.conversion);
                    });
                  });
                  const maxVal = Math.max(...allPoints, 1);

                  return (
                    <div className="w-full">
                      <svg width="100%" height="200" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                        {/* Horizontal Gridlines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                          const y = paddingY + ratio * (height - paddingY * 2);
                          const gridVal = maxVal - ratio * maxVal;
                          return (
                            <g key={ratio} className="opacity-30">
                              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                              <text x={5} y={y + 3} fill="#64748b" fontSize="8" fontWeight="bold">
                                {compareAspect === "revenue" ? "$" : ""}
                                {Math.round(gridVal).toLocaleString()}
                                {compareAspect === "conversion" ? "%" : ""}
                              </text>
                            </g>
                          );
                        })}

                        {/* Draw racing lines */}
                        {pmRacingChartData.series.map((s) => {
                          const coords = s.dataPoints.map(p => {
                            const val = compareAspect === "revenue" ? p.revenue : compareAspect === "won" ? p.won : p.conversion;
                            const x = paddingX + p.xRatio * (width - paddingX * 2);
                            const y = height - paddingY - (val / maxVal) * (height - paddingY * 2);
                            return `${x},${y}`;
                          });

                          const pathD = `M ${coords.join(" L ")}`;
                          const lastPoint = s.dataPoints[s.dataPoints.length - 1];
                          const lastVal = compareAspect === "revenue" ? lastPoint.revenue : compareAspect === "won" ? lastPoint.won : lastPoint.conversion;
                          const lastX = paddingX + lastPoint.xRatio * (width - paddingX * 2);
                          const lastY = height - paddingY - (lastVal / maxVal) * (height - paddingY * 2);

                          return (
                            <g key={s.name}>
                              {/* Glowing path underlay */}
                              <path 
                                d={pathD} 
                                stroke={s.color} 
                                strokeWidth="6" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                fill="none" 
                                className="opacity-15 blur-sm" 
                              />
                              {/* Main solid path */}
                              <path 
                                d={pathD} 
                                stroke={s.color} 
                                strokeWidth="3" 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                fill="none" 
                                className="transition-all duration-300" 
                              />
                              {/* Pulsing racing head indicator */}
                              <circle 
                                cx={lastX} 
                                cy={lastY} 
                                r="5.5" 
                                fill="#ffffff" 
                                stroke={s.color} 
                                strokeWidth="3" 
                                className="animate-pulse" 
                              />
                            </g>
                          );
                        })}
                      </svg>

                      {/* Racing Legend with final values */}
                      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-1.5 mt-2 border-t border-slate-100 pt-3 select-none">
                        {pmLeaderboard.map((pm) => {
                          const series = pmRacingChartData.series.find(s => s.name === pm.name);
                          const color = series ? series.color : "#cbd5e1";
                          let finalLabel = "";
                          if (compareAspect === "revenue") finalLabel = `$${pm.revenue.toLocaleString()}`;
                          else if (compareAspect === "won") finalLabel = `${pm.wonCount} ${t("won", "vyhraných", "megnyert")}`;
                          else finalLabel = `${pm.conversionRate.toFixed(0)}%`;

                          return (
                            <div key={pm.name} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-650">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <span>{pm.name}: <strong className="text-slate-800">{finalLabel}</strong></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Performance Trends (Full Width) */}
          <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-6 w-full">
            <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-indigo-600" /> {getTranslation(systemLanguage, "dashboard.charts.mom_trend")}
            </h3>

            {monthlyTrends.length > 0 ? (
              <div className="space-y-4 pt-2">
                {monthlyTrends.map(trend => (
                  <div key={trend.label} className="p-4 bg-slate-55/30 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-800">{trend.label}</span>
                      <span className="text-[9px] text-slate-400 font-semibold">{t("CRM Activity Node Period", "Obdobie aktivity v CRM", "CRM aktivitási időszak")}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center sm:text-right">
                      <div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{t("Revenue", "Tržby", "Bevétel")}</span>
                        <strong className="text-xs font-black text-slate-800 block mt-0.5">${trend.revenue.toLocaleString()}</strong>
                      </div>
                      <div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{t("Clients", "Klienti", "Ügyfelek")}</span>
                        <strong className="text-xs font-black text-indigo-600 block mt-0.5">{trend.totalClients}</strong>
                      </div>
                      <div>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{t("Rev/Client", "Tržby/klient", "Bevétel/ügyfél")}</span>
                        <strong className="text-xs font-black text-emerald-600 block mt-0.5">${trend.revPerClient.toFixed(0)}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                <span>{t("No monthly records found in CRM sandbox. Seeding cleanup records will regenerate trends.", "V CRM sandboxe sa nenašli žiadne mesačné záznamy. Vyčistenie a opätovné naplnenie záznamov obnoví trendy.", "Nem találhatók havi rekordok a CRM sandboxban. A rekordok feltöltése után újragenerálódnak a trendek.")}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 4: CLIENT STATISTICS & GEOGRAPHIES --- */}
      {activeTab === "clients" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Client type ratio */}
            <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
              <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <PieChart className="h-4 w-4 text-indigo-600" /> {t("Client Type Distribution", "Rozdelenie typov klientov", "Ügyféltípusok megoszlása")}
              </h3>

              <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
                {/* SVG Donut/Pie Chart */}
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 42 42">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="4.5" />
                    {clientTypeChartData.segments.map((seg, idx) => (
                      seg.count > 0 && (
                        <circle
                          key={idx}
                          cx="21"
                          cy="21"
                          r="15.915"
                          fill="transparent"
                          stroke={seg.color}
                          strokeWidth="4.5"
                          strokeDasharray={seg.strokeDasharray}
                          strokeDashoffset={seg.strokeDashoffset}
                          className="transition-all duration-300 hover:stroke-[5.5] cursor-pointer"
                        />
                      )
                    ))}
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-black text-slate-800 leading-none">{clientTypeChartData.total}</span>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{t("Clients", "Klienti", "Ügyfelek")}</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex-1 space-y-2.5 w-full">
                  {clientTypeChartData.segments.map((seg, idx) => {
                    return (
                      <div key={idx} className="flex flex-col gap-0.5">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-700">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                            {seg.label}
                          </span>
                          <span className="text-slate-900">{seg.count} ({seg.percentage.toFixed(0)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* City Demographics */}
            <div className="glass-panel p-6 rounded-3xl border border-white/60 bg-white shadow-sm space-y-4">
              <h3 className="text-xs font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-emerald-600" /> {t("Top Client Locations", "Najčastejšie lokality klientov", "Top ügyfélhelyszínek")}
              </h3>

              <div className="space-y-3 pt-2">
                {cityDistribution.map(([city, count]) => {
                  const percent = totalLeadsCount > 0 ? (count / totalLeadsCount) * 100 : 0;
                  return (
                    <div key={city} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                          {city}
                        </span>
                        <span>{count}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Interactive Trend Chart Inspector Modal */}
      {inspectingChart && (
        <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 z-[9999] transition-all duration-300 ${
          isClosingInspector ? "opacity-0 scale-95" : "opacity-100 scale-100 animate-in fade-in zoom-in-95 duration-200"
        }`}>
          {/* Main Modal Container */}
          <div 
            className="w-full max-w-[850px] bg-white rounded-[32px] border-2 border-slate-100 shadow-2xl p-6 sm:p-8 flex flex-col space-y-6 overflow-hidden max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="flex flex-col">
                <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full animate-ping shrink-0" style={{ backgroundColor: inspectingChart.color }} />
                  {inspectingChart.title}
                </h3>
                <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">
                  {t("Chronological progression & value analysis log", "Záznam chronologického vývoja a analýzy hodnoty", "Kronologikus folyamat és értékelemzési napló")}
                </span>
              </div>
              <button 
                type="button"
                onClick={closeInspector}
                className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto pr-1">
              
              {/* Detailed SVG Chart (lg:col-span-7) */}
              <div className="lg:col-span-7 flex flex-col space-y-4">
                <div className="relative bg-slate-50 border border-slate-100 rounded-3xl p-4 flex items-center justify-center min-h-[260px]">
                  {/* SVG detailed curve */}
                  {(() => {
                    const width = 500;
                    const height = 200;
                    const padding = 24;
                    const points = inspectingChart.points;
                    const min = Math.min(...points);
                    const max = Math.max(...points);
                    const range = max - min || 1;

                    const coords = points.map((p, idx) => {
                      const x = padding + (idx / (points.length - 1 || 1)) * (width - padding * 2);
                      const y = height - padding - ((p - min) / range) * (height - padding * 2);
                      return { x, y, val: p, originalIdx: idx };
                    });

                    const pathD = `M ${coords.map(c => `${c.x},${c.y}`).join(" L ")}`;
                    const areaD = `${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`;

                    return (
                      <svg width="100%" height="220" viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
                        {/* Horizontal Gridlines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                          const y = padding + ratio * (height - padding * 2);
                          const gridVal = max - ratio * range;
                          return (
                            <g key={ratio} className="opacity-30">
                              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
                              <text x={5} y={y + 3} fill="#64748b" fontSize="8" fontWeight="bold">
                                {inspectingChart.valuePrefix}
                                {Math.round(gridVal).toLocaleString()}
                                {inspectingChart.valueSuffix}
                              </text>
                            </g>
                          );
                        })}

                        {/* Gradient Area under curve */}
                        <defs>
                          <linearGradient id="detailGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={inspectingChart.color} stopOpacity="0.3" />
                            <stop offset="100%" stopColor={inspectingChart.color} stopOpacity="0.02" />
                          </linearGradient>
                        </defs>
                        <path d={areaD} fill="url(#detailGrad)" className="transition-all duration-300" />
                        <path d={pathD} stroke={inspectingChart.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />

                        {/* Chart Interactive Points */}
                        {coords.map((c, idx) => {
                          const isHovered = hoveredPointIdx === c.originalIdx;
                          return (
                            <g key={idx} className="cursor-pointer">
                              <circle
                                cx={c.x}
                                cy={c.y}
                                r={isHovered ? 7 : 4.5}
                                fill={isHovered ? "#ffffff" : inspectingChart.color}
                                stroke={inspectingChart.color}
                                strokeWidth={isHovered ? 3 : 1.5}
                                className="transition-all duration-200"
                                onMouseEnter={() => setHoveredPointIdx(c.originalIdx)}
                                onMouseLeave={() => setHoveredPointIdx(null)}
                              />
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>

                {/* Point details display */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 min-h-[70px] flex items-center justify-center text-center">
                  {hoveredPointIdx !== null && inspectingChart.details[hoveredPointIdx] ? (
                    (() => {
                      const pt = inspectingChart.details[hoveredPointIdx];
                      return (
                        <div className="flex flex-col animate-in fade-in slide-in-from-bottom duration-150">
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">{t("Selected Data Node", "Vybraný dátový bod", "Kiválasztott adatpont")}</span>
                          <span className="text-xs font-black text-slate-800 mt-0.5">{pt.label}</span>
                          <div className="flex items-center justify-center gap-3 mt-1 text-[11px] font-bold">
                            <span className="text-slate-500">{t("Date", "Dátum", "Dátum")}: <strong className="text-slate-700">{pt.date}</strong></span>
                            <span className="text-slate-500">{t("Change", "Zmena", "Változás")}: <strong className="text-slate-700">+{inspectingChart.valuePrefix}{pt.value.toLocaleString()}{inspectingChart.valueSuffix}</strong></span>
                            <span className="text-slate-500">{t("Value", "Hodnota", "Érték")}: <strong style={{ color: inspectingChart.color }}>{inspectingChart.valuePrefix}{pt.cumulative.toLocaleString()}{inspectingChart.valueSuffix}</strong></span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider animate-pulse">
                      {t("Hover over any node on the plotline above to inspect granular values", "Prejdite myšou na ktorýkoľvek bod krivky vyššie pre zobrazenie podrobných hodnôt", "Vigye az egeret a fenti görbe bármely pontjára a részletes értékek megtekintéséhez")}
                    </div>
                  )}
                </div>
              </div>

              {/* Chronological Values Log (lg:col-span-5) */}
              <div className="lg:col-span-5 flex flex-col space-y-3 overflow-hidden max-h-[350px]">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                  {t("Chronological Progression Log", "Záznam chronologického vývoja", "Kronologikus folyamatnapló")}
                </h4>
                <div className="overflow-y-auto space-y-2 pr-1 flex-1">
                  {inspectingChart.details.map((pt, idx) => (
                    <div 
                      key={idx} 
                      onMouseEnter={() => setHoveredPointIdx(idx)}
                      onMouseLeave={() => setHoveredPointIdx(null)}
                      className={`p-3 rounded-xl border transition-all text-left flex justify-between items-center ${
                        hoveredPointIdx === idx 
                          ? "bg-slate-50 border-slate-200 translate-x-1 shadow-sm" 
                          : "bg-white border-slate-100"
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[11px] font-bold text-slate-800 truncate leading-snug">{pt.label}</span>
                        <span className="text-[8px] text-slate-400 font-bold mt-0.5">{pt.date}</span>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <strong className="text-xs font-black text-slate-800">
                          {inspectingChart.valuePrefix}
                          {pt.cumulative.toLocaleString()}
                          {inspectingChart.valueSuffix}
                        </strong>
                        <span className="text-[8px] text-slate-450 font-bold">
                          +{inspectingChart.valuePrefix}{pt.value.toLocaleString()}{inspectingChart.valueSuffix}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Lead details right slideout drawer */}
      {selectedLeadForDrawer && (
        <div className="fixed inset-0 z-[9998] flex justify-end">
          {/* Backdrop overlay */}
          <div 
            onClick={closeLeadDrawer}
            className={`absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 ${
              isClosingLeadDrawer ? "opacity-0 animate-fade-out" : "opacity-100 animate-fade-in"
            }`}
          />
          
          {/* Slideout panel content */}
          <div 
            className={`relative h-screen w-full sm:w-[520px] bg-white border-l border-slate-100 shadow-2xl flex flex-col justify-between p-6 z-[9999] transition-transform duration-300 ${
              isClosingLeadDrawer ? "animate-slide-out-right" : "animate-slide-in-right"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-indigo-500 text-white flex items-center justify-center font-heading font-black text-sm border-2 border-indigo-700 shadow-md">
                  {selectedLeadForDrawer.name.substring(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <h3 className="text-sm font-heading font-black text-slate-900 uppercase tracking-tight">{t("Project Details", "Detaily projektu", "Projekt részletei")}</h3>
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest mt-0.5">{t("ID", "ID", "Azonosító")}: {selectedLeadForDrawer.id}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    // Navigate to dedicated fullscreen view via SPA hash routing
                    window.location.hash = "lead-" + selectedLeadForDrawer.id;
                  }}
                  className="h-8.5 px-3 rounded-xl border border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-55 text-indigo-750 flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 text-[9px] font-black uppercase tracking-wider"
                  title={t("Open in Dedicated Full Screen View", "Otvoriť v samostatnom zobrazení na celú obrazovku", "Megnyitás külön teljes képernyős nézetben")}
                >
                  <Maximize2 className="h-3.5 w-3.5" /> {t("Full Screen", "Celá obrazovka", "Teljes képernyő")}
                </button>
                
                <button 
                  onClick={closeLeadDrawer}
                  className="h-8.5 w-8.5 rounded-xl border border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-all active:scale-90 shadow-sm"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Scrollable details area */}
            <div className="flex-1 overflow-y-auto py-6 space-y-6 scrollbar-thin pr-1 text-left">
              {/* Financial metrics header card */}
              <div className="p-5 bg-gradient-to-br from-indigo-500 to-purple-650 rounded-3xl text-white shadow-lg space-y-2.5 relative overflow-hidden shrink-0">
                {/* Background glow decoration */}
                <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                <span className="text-[9px] font-black text-indigo-100 uppercase tracking-widest block">{t("Estimated Deal Worth", "Odhadovaná hodnota obchodu", "Becsült üzletérték")}</span>
                <span className="text-3xl font-black block leading-none">${selectedLeadForDrawer.value.toLocaleString()}</span>
                
                <div className="flex items-center gap-2 border-t border-white/20 pt-2.5 mt-1 text-[10px] font-bold text-indigo-150">
                  <Compass className="h-3.5 w-3.5" />
                  <span>{t("Channel", "Kanál", "Csatorna")}: </span>
                  <span 
                    className="px-2 py-0.5 rounded text-[9px] font-black uppercase border tracking-wider select-none font-bold"
                    style={{
                      backgroundColor: `${leadSourceColors[selectedLeadForDrawer.source.toLowerCase()] || "#10b981"}25`,
                      color: leadSourceColors[selectedLeadForDrawer.source.toLowerCase()] || "#10b981",
                      borderColor: `${leadSourceColors[selectedLeadForDrawer.source.toLowerCase()] || "#10b981"}45`
                    }}
                  >
                    {selectedLeadForDrawer.source}
                  </span>
                </div>
              </div>

              {/* Basic Lead Parameters */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">{t("Basic Lead Data", "Základné údaje o záujemcovi", "Alapvető érdeklődői adatok")}</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Status */}
                  <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{t("Pipeline Stage", "Fáza pipeline", "Pipeline szakasz")}</span>
                    {(() => {
                      const sName = selectedLeadForDrawer.status.toLowerCase();
                      const parentName = leadStateParents[sName];
                      if (parentName) {
                        const parentColor = leadStateColors[parentName.toLowerCase()] || "#6366f1";
                        const subColor = leadStateColors[sName] || "#38bdf8";
                        return (
                          <span 
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider select-none text-white leading-none mt-1"
                            style={{
                              background: `linear-gradient(135deg, ${parentColor}, ${subColor})`
                            }}
                          >
                            {parentName.toUpperCase()} &gt; {selectedLeadForDrawer.status.toUpperCase()}
                          </span>
                        );
                      } else {
                        const mainColor = leadStateColors[sName] || "#6366f1";
                        return (
                          <span 
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider select-none text-white leading-none mt-1"
                            style={{
                              backgroundColor: mainColor
                            }}
                          >
                            {selectedLeadForDrawer.status.toUpperCase()}
                          </span>
                        );
                      }
                    })()}
                  </div>

                  {/* Owner */}
                  <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{t("Project Manager", "Projektový manažér", "Projektmenedzser")}</span>
                    <span className="text-xs font-black text-slate-800 block mt-1">{selectedLeadForDrawer.owner}</span>
                  </div>

                  {/* City */}
                  <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{t("City Location", "Mesto", "Város")}</span>
                    <span className="text-xs font-black text-slate-800 block mt-1">{selectedLeadForDrawer.city}</span>
                  </div>

                  {/* Registered Date */}
                  <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl space-y-1">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider block">{t("System Inflow Date", "Dátum zaevidovania", "Rendszerbe kerülés dátuma")}</span>
                    <span className="text-xs font-black text-slate-800 block mt-1">{(selectedLeadForDrawer.createdAt || "").slice(0, 10)}</span>
                  </div>
                </div>
              </div>

              {/* Interested Categories list */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">{getTranslation(systemLanguage, "profile.interested_categories")}</h4>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedLeadForDrawer.categories && selectedLeadForDrawer.categories.length > 0 ? (
                    selectedLeadForDrawer.categories.map((cat) => {
                      const color = leadCategoryColors[cat] || "#6366f1";
                      return (
                        <span 
                          key={cat} 
                          className="px-2.5 py-1 rounded-lg text-[9px] font-black border uppercase tracking-wider transition-all"
                          style={{
                            backgroundColor: `${color}15`,
                            color: color,
                            borderColor: `${color}35`
                          }}
                        >
                          {cat}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-slate-400 font-bold italic uppercase tracking-wider">
                      {t("No interested categories selected", "Neboli vybrané žiadne kategórie záujmu", "Nincs kiválasztott érdeklődési kategória")}
                    </span>
                  )}
                </div>
              </div>

              {/* Client Profile details */}
              <div className="space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">{t("Client Credentials", "Údaje o klientovi", "Ügyfél adatai")}</h4>
                
                <div className="space-y-3 bg-slate-50/50 border border-slate-150/40 p-4.5 rounded-2xl text-[11px] font-semibold text-slate-550">
                  <div className="flex justify-between items-center py-1">
                    <span>{t("Legal Client Type", "Právny typ klienta", "Jogi ügyféltípus")}:</span>
                    <span className="font-black text-slate-800 uppercase tracking-wider text-[9px]">{selectedLeadForDrawer.clientType}</span>
                  </div>
                  {selectedLeadForDrawer.phone && (
                    <div className="flex justify-between items-center py-1 border-t border-slate-100">
                      <span>{t("Phone Line", "Telefón", "Telefonszám")}:</span>
                      <strong className="text-slate-800 font-black">{selectedLeadForDrawer.phone}</strong>
                    </div>
                  )}
                  {selectedLeadForDrawer.email && (
                    <div className="flex justify-between items-center py-1 border-t border-slate-100">
                      <span>{t("E-mail Inbox", "E-mailová schránka", "E-mail postafiók")}:</span>
                      <strong className="text-slate-800 font-black select-all">{selectedLeadForDrawer.email}</strong>
                    </div>
                  )}
                  {selectedLeadForDrawer.address && (
                    <div className="flex flex-col gap-1 py-1 border-t border-slate-100 text-left">
                      <span>{t("Mailing Address", "Korešpondenčná adresa", "Levelezési cím")}:</span>
                      <strong className="text-slate-800 font-bold leading-normal mt-0.5">
                        {selectedLeadForDrawer.address.street}, {selectedLeadForDrawer.address.postalCode} {selectedLeadForDrawer.address.city}, {selectedLeadForDrawer.address.country}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline Activity Logs */}
              {selectedLeadForDrawer.timeline && selectedLeadForDrawer.timeline.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">{getTranslation(systemLanguage, "timeline.activity")}</h4>
                  
                  <div className="relative border-l-2 border-slate-100 pl-5.5 ml-2.5 space-y-5 text-[11px] font-semibold text-slate-500">
                    {selectedLeadForDrawer.timeline.map((event) => {
                      let eventColor = "text-indigo-650 bg-indigo-50 border-indigo-150";
                      if (event.type === "phone") eventColor = "text-blue-600 bg-blue-50 border-blue-100";
                      else if (event.type === "email") eventColor = "text-emerald-600 bg-emerald-50 border-emerald-100";
                      else if (event.type === "offer") eventColor = "text-purple-650 bg-purple-50 border-purple-100";
                      else if (event.type === "appointment") eventColor = "text-amber-600 bg-amber-50 border-amber-100";

                      return (
                        <div key={event.id} className="relative group text-left">
                          {/* Timeline bullet dot */}
                          <span className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-indigo-600 ring-4 ring-indigo-50 shrink-0" />
                          
                          <div className="flex justify-between items-center text-[9px] font-black text-slate-400">
                            <span className="uppercase tracking-widest">{event.timestamp}</span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border tracking-wider ${eventColor}`}>
                              {getTranslation(systemLanguage, `timeline.badge.${event.type}`)}
                            </span>
                          </div>
                          
                          <div className="mt-1 bg-slate-50/40 hover:bg-slate-50 border border-slate-100 rounded-xl p-3 transition-colors">
                            <h5 className="font-black text-slate-800 leading-snug">{event.title}</h5>
                            <p className="text-slate-450 leading-relaxed mt-1 text-[10px] font-semibold">{event.content}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons footer */}
            <div className="pt-4 border-t border-slate-100 flex gap-3 shrink-0">
              <button 
                onClick={closeLeadDrawer}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 text-slate-600 rounded-xl text-xs font-black uppercase tracking-wider transition-colors cursor-pointer border border-slate-200 text-center"
              >
                {t("Close View", "Zavrieť", "Bezárás")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
