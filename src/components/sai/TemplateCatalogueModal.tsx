import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  ArrowRight, 
  Tag, 
  Database,
  Compass
} from 'lucide-react';
import { 
  USE_CASE_TEMPLATES, 
  TEMPLATE_CATEGORIES, 
  type UseCaseTemplate 
} from './useCasesCatalogue';

interface TemplateCatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: UseCaseTemplate) => void;
  systemLanguage?: string;
}

export const TemplateCatalogueModal: React.FC<TemplateCatalogueModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  systemLanguage = 'sk'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const t = (en: string, sk: string, hu: string) =>
    systemLanguage === 'sk' ? sk : systemLanguage === 'hu' ? hu : en;
  const isSk = systemLanguage === 'sk';

  const filteredTemplates = useMemo(() => {
    return USE_CASE_TEMPLATES.filter(tmpl => {
      const matchCategory = selectedCategory === 'all' || tmpl.category === selectedCategory;
      const matchTag = !selectedTag || tmpl.tags.includes(selectedTag);
      
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        tmpl.name.toLowerCase().includes(q) ||
        tmpl.nameSk.toLowerCase().includes(q) ||
        tmpl.description.toLowerCase().includes(q) ||
        tmpl.hypothesis.toLowerCase().includes(q) ||
        tmpl.hypothesisSk.toLowerCase().includes(q) ||
        tmpl.tags.some(t => t.toLowerCase().includes(q));

      return matchCategory && matchTag && matchSearch;
    });
  }, [searchQuery, selectedCategory, selectedTag]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    USE_CASE_TEMPLATES.forEach(t => t.tags.forEach(tag => set.add(tag)));
    return Array.from(set);
  }, []);

  if (!isOpen) return null;

  const getCategoryColor = (cat: UseCaseTemplate['category']) => {
    switch (cat) {
      case 'strategy':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'gtm_pricing':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'customers_competitors':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'crisis_policy':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'forecasting':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-6xl max-h-[92vh] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {t('Strategic Template & Scenario Catalogue', 'Katalóg strategických šablón & scenárov', 'Stratégiai sablon- és forgatókönyv-katalógus')}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                  MiroFish (105)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'Choose from 105 verified predictive simulation templates for market entry, pricing, competitors, and customers. Selecting one will auto-fill the rehearsal setup.',
                  'Vyberte si zo 105 overených prediktívnych šablón trhu, cenotvorby, konkurentov a zákazníkov. Kliknutím sa okamžite vyplnia polia simulácie.',
                  'Válasszon 105 ellenőrzött prediktív piaci szimulációs sablon közül. Kiválasztásával azonnal kitölti a szimuláció konfigurációját.'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-white space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t(
                  'Search templates by title, hypothesis, objections...',
                  'Hľadať šablónu podľa názvu, hypotézy, námietok...',
                  'Keresés 105 sablon, hipotézis vagy címke között...'
                )}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100 bg-slate-50/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Result Counter */}
            <div className="text-xs text-slate-500 font-medium">
              <span>
                {t('Showing', 'Nájdených', 'Találat:')} <strong>{filteredTemplates.length}</strong> {t('of 105 templates', 'z 105 šablón', '/ 105 sablon')}
              </span>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {TEMPLATE_CATEGORIES.map(cat => {
              const active = selectedCategory === cat.id;
              const label = systemLanguage === 'sk' ? cat.labelSk : systemLanguage === 'hu' ? cat.labelHu : cat.labelEn;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setSelectedTag(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                    active
                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Secondary Tag Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {t('Tags:', 'Filtre:', 'Címkék:')}
            </span>
            {allTags.map(tag => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(active ? null : tag)}
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition cursor-pointer border ${
                    active
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  #{tag}
                </button>
              );
            })}
            {selectedTag && (
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className="text-[11px] text-purple-600 hover:underline font-semibold ml-2"
              >
                {t('Clear tag', 'Zrušiť filter', 'Címke törlése')}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Templates Grid */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/40">
          {filteredTemplates.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                {t('No templates match your search criteria', 'Žiadna šablóna nezodpovedá hľadaniu', 'Nincs a keresési feltételeknek megfelelő sablon')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedTag(null);
                }}
                className="px-4 py-2 rounded-xl bg-purple-50 text-purple-700 text-xs font-bold hover:bg-purple-100 transition"
              >
                {t('Reset filters', 'Resetovať filtre', 'Szűrők visszaállítása')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map(tmpl => {
                const title = systemLanguage === 'hu' ? (tmpl.nameHu || tmpl.name) : isSk ? tmpl.nameSk : tmpl.name;
                const desc = systemLanguage === 'hu' ? (tmpl.descriptionHu || tmpl.description) : isSk ? (tmpl.descriptionSk || tmpl.description) : tmpl.description;
                const hyp = systemLanguage === 'hu' ? (tmpl.hypothesisHu || tmpl.hypothesis) : isSk ? tmpl.hypothesisSk : tmpl.hypothesis;

                return (
                  <div
                    key={tmpl.id}
                    data-testid="template-catalogue-card"
                    data-template-id={tmpl.id}
                    onClick={() => onSelectTemplate(tmpl)}
                    className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-purple-500 hover:shadow-lg transition-all duration-200 flex flex-col justify-between group cursor-pointer text-left"
                  >
                    <div className="space-y-2.5">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${getCategoryColor(tmpl.category)}`}>
                          {tmpl.tags[0] || tmpl.category}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          MiroFish
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-purple-700 transition leading-snug">
                        {title}
                      </h3>

                      {/* Description */}
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {desc}
                      </p>

                      {/* Hypothesis preview */}
                      <div className="p-2.5 rounded-xl bg-purple-50/60 border border-purple-100/80 text-[11px] text-purple-900/90 leading-snug line-clamp-2 italic">
                        &ldquo;{hyp}&rdquo;
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="pt-3.5 mt-3 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400">
                        <Database className="w-3 h-3 text-slate-400" />
                        <span>{tmpl.recommendedSources.length} {t('CRM sources', 'CRM zdrojov', 'CRM adatforrás')}</span>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-bold text-purple-600 group-hover:text-purple-700 transition">
                        <span>{t('Use Template', 'Použiť šablónu', 'Sablon használata')}</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
          <span>
            {t(
              'Curated from MiroFish Use Cases connected with real CRM leads & client context.',
              'Šablóny z MiroFish Use Cases s prepojením na reálne CRM leady & klientov.',
              'A MiroFish esettanulmányaiból származó sablonok valós CRM leadekkel és ügyfélkontextussal összekötve.'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition cursor-pointer"
          >
            {t('Close', 'Zavrieť', 'Bezárás')}
          </button>
        </div>
      </div>
    </div>
  );
};
