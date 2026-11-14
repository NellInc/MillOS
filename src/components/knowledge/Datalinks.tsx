/**
 * Datalinks - The Bilateral Autonomy System Database
 *
 * Inspired by Sid Meier's Alpha Centauri Datalinks - an in-game encyclopedia
 * of MillOS field notes: material flow, alarms, maintenance, quality,
 * logistics, and the evidence behind autonomous decisions.
 *
 * Browse all knowledge entries organized by category.
 * Progressive disclosure: list view → card → full article
 */

import { useState, useMemo, useEffect, useRef, type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Database,
  Search,
  ChevronRight,
  ChevronDown,
  Handshake,
  HeartHandshake,
  Vote,
  Flower2,
  Sparkles,
  User,
  Sliders,
  BarChart3,
  RefreshCw,
  Network,
  Heart,
  Factory,
  BookOpen,
  Scale,
  Brain,
  Gamepad2,
  Sprout,
  Users,
  Settings,
  Library,
  Wheat,
  Wind,
  Flame,
  Croissant,
  LucideIcon,
} from 'lucide-react';
import {
  useKnowledgeStore,
  KNOWLEDGE_ENTRIES,
  KnowledgeCategory,
  KnowledgeEntry,
  KnowledgeIcon,
  getCategoryIcon,
  getCategoryLabel,
  getKnowledgeEntries,
} from '../../stores/knowledgeStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatFixed, useT, useLocale } from '../../i18n';
import { datalinksMessages } from './Datalinks.messages';

// Icon mapping from KnowledgeIcon to Lucide component
const ICON_MAP: Record<KnowledgeIcon, LucideIcon> = {
  handshake: Handshake,
  'heart-handshake': HeartHandshake,
  vote: Vote,
  'flower-2': Flower2,
  sparkles: Sparkles,
  user: User,
  settings: Settings,
  sliders: Sliders,
  'chart-bar': BarChart3,
  'refresh-cw': RefreshCw,
  network: Network,
  heart: Heart,
  factory: Factory,
  'book-open': BookOpen,
  scale: Scale,
  brain: Brain,
  'gamepad-2': Gamepad2,
  sprout: Sprout,
  users: Users,
  cog: Settings,
  library: Library,
  wheat: Wheat,
  wind: Wind,
  flame: Flame,
  croissant: Croissant,
};

import { KnowledgeEntryCard } from './KnowledgeEntryCard';

// Case- and accent-insensitive: "manutencao" finds "manutenção". Lower-cased
// in the interface language, so case folding follows its rules.
const searchable = (text: string, locale: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase(locale);

// Render a Lucide icon from its identifier
function KnowledgeIconComponent({ icon, className }: { icon: KnowledgeIcon; className?: string }) {
  const IconComponent = ICON_MAP[icon];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
}

interface DatalinksProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Datalinks({ isOpen, onClose }: DatalinksProps) {
  const t = useT(datalinksMessages);
  const locale = useLocale();
  const reducedMotion = useReducedMotion();
  const [audience, setAudience] = useState<'player' | 'developer'>('player');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<KnowledgeCategory>>(
    new Set(['milling', 'principles', 'pioneers', 'systems', 'case-studies'])
  );

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const { isNew, clearNewBadge, markAsRead } = useKnowledgeStore();

  // Keep Tab inside the dialog and restore focus on close. Called before the
  // search-focus effect below so that effect runs last and wins initial focus.
  useFocusTrap(dialogRef as RefObject<HTMLElement>, isOpen, onClose);

  // Move focus into the dialog when it OPENS. Keyed on isOpen ONLY — keying on
  // onClose (an unmemoized inline arrow from the parent) would re-run this on
  // every parent re-render and steal focus back to the search box mid-interaction.
  useEffect(() => {
    if (!isOpen) return;
    searchInputRef.current?.focus();
  }, [isOpen]);

  // Close on Escape even when focus has left the dialog (e.g. after a click on
  // a non-focusable area). Inside the dialog useFocusTrap handles Escape and
  // marks the event handled, so this does not close twice.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Chronicle history notes stay hidden until a live event unlocks them.
  const unlockedEntries = useKnowledgeStore((state) => state.unlockedEntries);
  const visibleEntries = useMemo(
    () =>
      getKnowledgeEntries(audience).filter(
        (entry) => entry.unlockCondition.type === 'always' || unlockedEntries.has(entry.id)
      ),
    [audience, unlockedEntries]
  );

  // Filter entries based on search and category
  const filteredEntries = useMemo(() => {
    return visibleEntries.filter((entry) => {
      // Category filter
      if (selectedCategory !== 'all' && entry.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchable(searchQuery.trim(), locale);
        return (
          searchable(entry.title, locale).includes(query) ||
          searchable(entry.tooltip, locale).includes(query) ||
          searchable(entry.brief, locale).includes(query)
        );
      }

      return true;
    });
  }, [visibleEntries, searchQuery, selectedCategory, locale]);

  // Group entries by category
  const entriesByCategory = useMemo(() => {
    const groups: Record<KnowledgeCategory, KnowledgeEntry[]> = {
      milling: [],
      principles: [],
      pioneers: [],
      systems: [],
      'case-studies': [],
    };

    filteredEntries.forEach((entry) => {
      groups[entry.category].push(entry);
    });

    return groups;
  }, [filteredEntries]);

  const toggleCategory = (category: KnowledgeCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleEntryClick = (entry: KnowledgeEntry) => {
    focusAfterSelection.current = { picked: entry.id };
    setSelectedEntry(entry);
    markAsRead(entry.id);
    clearNewBadge(entry.id);
  };

  // Back and a related link each unmount the button pressed. The focus trap
  // listens on the dialog, so focus left on <body> let Tab walk out of it.
  // Back lands on the entry in the list; a related link on the new article.
  // Picking an entry keeps focus in the list unless the list has hidden (a
  // phone shows the article in its place), when the article takes it.
  const focusAfterSelection = useRef<
    { card: true } | { entryId: string } | { picked: string } | null
  >(null);
  useEffect(() => {
    const target = focusAfterSelection.current;
    focusAfterSelection.current = null;
    const dialog = dialogRef.current;
    if (!target || !dialog) return;
    const backButton = () => dialog.querySelector<HTMLElement>('[data-entry-card-back]');
    if ('card' in target) {
      backButton()?.focus();
      return;
    }
    const wanted = 'picked' in target ? target.picked : target.entryId;
    const entryButton = [...dialog.querySelectorAll<HTMLElement>('[data-entry-id]')].find(
      (button) => button.dataset.entryId === wanted
    );
    if ('picked' in target) {
      if (!entryButton || entryButton.getClientRects().length === 0) backButton()?.focus();
      return;
    }
    (entryButton ?? searchInputRef.current)?.focus();
  }, [selectedEntry]);

  const categories: KnowledgeCategory[] = [
    'milling',
    'principles',
    'pioneers',
    'systems',
    'case-studies',
  ];
  const audienceEntryCount = visibleEntries.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="datalinks-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.15 }}
          // z-[1000], as the app's other modals: at z-50 the stop banner and
          // guidance (z-[60]) drew over the dialog's header and entry list.
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 pointer-events-auto"
          onClick={onClose}
        >
          <motion.div
            key="datalinks-modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="datalinks-title"
            initial={reducedMotion ? false : { scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { scale: 0.9, opacity: 0, y: 20 }}
            transition={
              reducedMotion ? { duration: 0 } : { type: 'spring', damping: 25, stiffness: 300 }
            }
            className="relative flex min-h-0 w-[900px] max-w-[95vw] h-[700px] max-h-[90dvh] flex-col bg-slate-900 rounded-xl shadow-2xl border border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4 border-b border-slate-700 bg-slate-800/50">
              <div className="flex min-w-0 items-center gap-3">
                <Database className="w-6 h-6 text-slate-400" />
                <h2 id="datalinks-title" className="text-xl font-semibold text-white tracking-wide">
                  {t('title')}
                </h2>
                <span className="hidden shrink-0 px-2 py-0.5 text-xs bg-slate-700 rounded-full text-slate-300 sm:inline">
                  {t('entryCount', {
                    count: formatFixed(audienceEntryCount, 0),
                    n: audienceEntryCount,
                  })}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label={t('close')}
                className="shrink-0 p-3 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div
              aria-label={t('guideSection')}
              className="flex shrink-0 flex-wrap gap-2 border-b border-slate-700 px-3 py-2 sm:px-4"
            >
              {(['player', 'developer'] as const).map((section) => (
                <button
                  key={section}
                  type="button"
                  aria-pressed={audience === section}
                  className={`min-h-10 rounded-lg px-3 py-2 text-xs font-medium ${audience === section ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                  onClick={() => {
                    setAudience(section);
                    setSelectedEntry(null);
                    setSelectedCategory('all');
                  }}
                >
                  {section === 'player' ? t('operatingGuide') : t('developerReference')}
                </button>
              ))}
            </div>

            <div className="flex min-h-0 flex-1">
              {/* Sidebar - Entry List. On a short screen (a landscape phone)
                  the whole column scrolls: the wrapped chips left the list no
                  room for a single entry. */}
              <div
                className={`${selectedEntry ? 'hidden sm:flex' : 'flex'} min-h-0 w-full shrink-0 border-r border-slate-700 flex-col sm:w-80 [@media(max-height:480px)]:overflow-y-auto`}
              >
                {/* Search */}
                <div className="p-4 border-b border-slate-700">
                  <div className="relative">
                    <Search
                      aria-hidden="true"
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
                    />
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder={t('searchPlaceholder')}
                      aria-label={t('searchLabel')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                {/* Category filters. They wrap: as a scrolling row the sixth
                    category cut the third chip mid-word ("Operatin"). */}
                <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-slate-700">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    aria-pressed={selectedCategory === 'all'}
                    className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-white/20 text-white font-medium'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {t('all')}
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      aria-pressed={selectedCategory === cat}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                        selectedCategory === cat
                          ? 'bg-white/20 text-white font-medium'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      <KnowledgeIconComponent icon={getCategoryIcon(cat)} className="w-3 h-3" />
                      {getCategoryLabel(cat)}
                    </button>
                  ))}
                </div>

                {/* Entry List */}
                <div className="flex-1 overflow-y-auto [@media(max-height:480px)]:flex-none [@media(max-height:480px)]:overflow-visible">
                  {categories.map((category) => {
                    const entries = entriesByCategory[category];
                    if (entries.length === 0) return null;

                    const isExpanded = expandedCategories.has(category);

                    return (
                      <div key={category} className="border-b border-slate-700/50">
                        <button
                          onClick={() => toggleCategory(category)}
                          aria-expanded={isExpanded}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-800/50 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                          <KnowledgeIconComponent
                            icon={getCategoryIcon(category)}
                            className="w-4 h-4 text-slate-400"
                          />
                          <span className="font-medium text-slate-200">
                            {getCategoryLabel(category)}
                          </span>
                          <span className="ml-auto text-xs text-slate-500">{entries.length}</span>
                        </button>

                        {isExpanded && (
                          <div>
                            {entries.map((entry) => {
                              const isNewEntry = isNew(entry.id);
                              const isSelected = selectedEntry?.id === entry.id;

                              return (
                                <button
                                  key={entry.id}
                                  data-entry-id={entry.id}
                                  onClick={() => handleEntryClick(entry)}
                                  aria-current={isSelected ? 'true' : undefined}
                                  className={`w-full flex items-center gap-3 px-6 py-2.5 text-left transition-colors ${
                                    isSelected
                                      ? 'bg-white/10 border-l-2 border-white'
                                      : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                                  }`}
                                >
                                  <KnowledgeIconComponent
                                    icon={entry.icon}
                                    className="w-4 h-4 text-slate-400"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      {/* Wraps: truncated, the Portuguese "O que um
                                          padeiro precisa da farinha" lost its end. */}
                                      <span className="min-w-0 break-words text-sm text-slate-200">
                                        {entry.title}
                                      </span>
                                      {isNewEntry && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-white/20 text-white rounded">
                                          {t('newBadge')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {filteredEntries.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
                      <Search className="w-10 h-10 text-slate-700 mb-4" />
                      <p className="text-sm text-slate-400 mb-1">
                        {searchQuery
                          ? t('noMatch', { query: searchQuery })
                          : t('noEntriesInCategory')}
                      </p>
                      {searchQuery && (
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            // This button unmounts with the message it clears;
                            // keep focus in the dialog, where typing resumes.
                            searchInputRef.current?.focus();
                          }}
                          className="mt-3 px-3 py-1 text-xs rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                        >
                          {t('clearSearch')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Main Content - Entry Detail */}
              <div
                className={`${selectedEntry ? 'block' : 'hidden sm:block'} min-w-0 flex-1 overflow-y-auto`}
              >
                {selectedEntry ? (
                  <KnowledgeEntryCard
                    key={selectedEntry.id}
                    entry={selectedEntry}
                    onClose={() => {
                      focusAfterSelection.current = { entryId: selectedEntry.id };
                      setSelectedEntry(null);
                    }}
                    onNavigate={(entryId) => {
                      const entry = KNOWLEDGE_ENTRIES.find((e) => e.id === entryId);
                      if (entry) {
                        focusAfterSelection.current = { card: true };
                        setAudience(entry.audience ?? 'player');
                        setSelectedEntry(entry);
                        markAsRead(entry.id);
                        clearNewBadge(entry.id);
                      }
                    }}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <Database className="w-16 h-16 text-slate-700 mb-6" />
                    <h3 className="text-lg font-medium text-slate-300 tracking-wide">
                      {t('welcome')}
                    </h3>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
