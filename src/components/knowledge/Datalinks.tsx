/**
 * Datalinks - The Bilateral Alignment Management System Database
 *
 * Inspired by Sid Meier's Alpha Centauri Datalinks - an in-game encyclopedia
 * that unlocks through gameplay, featuring wisdom from pioneers and thinkers.
 *
 * Browse all knowledge entries organized by category.
 * Progressive disclosure: list view → card → full article
 */

import { useState, useMemo } from 'react';
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
} from '../../stores/knowledgeStore';

// Icon mapping from KnowledgeIcon to Lucide component
const ICON_MAP: Record<KnowledgeIcon, LucideIcon> = {
  'handshake': Handshake,
  'heart-handshake': HeartHandshake,
  'vote': Vote,
  'flower-2': Flower2,
  'sparkles': Sparkles,
  'user': User,
  'settings': Settings,
  'sliders': Sliders,
  'chart-bar': BarChart3,
  'refresh-cw': RefreshCw,
  'network': Network,
  'heart': Heart,
  'factory': Factory,
  'book-open': BookOpen,
  'scale': Scale,
  'brain': Brain,
  'gamepad-2': Gamepad2,
  'sprout': Sprout,
  'users': Users,
  'cog': Settings,
  'library': Library,
};

import { KnowledgeEntryCard } from './KnowledgeEntryCard';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | 'all'>('all');
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<KnowledgeCategory>>(
    new Set(['principles', 'pioneers', 'systems', 'case-studies'])
  );

  const { isNew, clearNewBadge, markAsRead, getUnlockedCount, getTotalCount } =
    useKnowledgeStore();

  // Filter entries based on search and category
  const filteredEntries = useMemo(() => {
    return KNOWLEDGE_ENTRIES.filter((entry) => {
      // Category filter
      if (selectedCategory !== 'all' && entry.category !== selectedCategory) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          entry.title.toLowerCase().includes(query) ||
          entry.tooltip.toLowerCase().includes(query) ||
          entry.brief.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [searchQuery, selectedCategory]);

  // Group entries by category
  const entriesByCategory = useMemo(() => {
    const groups: Record<KnowledgeCategory, KnowledgeEntry[]> = {
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
    setSelectedEntry(entry);
    markAsRead(entry.id);
    clearNewBadge(entry.id);
  };

  const categories: KnowledgeCategory[] = ['principles', 'pioneers', 'systems', 'case-studies'];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="datalinks-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 pointer-events-auto"
          onClick={onClose}
        >
          <motion.div
            key="datalinks-modal"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-[900px] max-w-[95vw] h-[700px] max-h-[90vh] bg-slate-900 rounded-xl shadow-2xl border border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <Database className="w-6 h-6 text-slate-400" />
                <div>
                  <h2 className="text-xl font-semibold text-white tracking-wide">DATALINKS</h2>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Bilateral Alignment Management System Database</p>
                </div>
                <span className="px-2 py-0.5 text-xs bg-slate-700 rounded-full text-slate-300 ml-2">
                  {getUnlockedCount()} / {getTotalCount()} entries
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex h-[calc(100%-72px)]">
              {/* Sidebar - Entry List */}
              <div className="w-80 border-r border-slate-700 flex flex-col">
                {/* Search */}
                <div className="p-4 border-b border-slate-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                {/* Category filters */}
                <div className="flex gap-1 px-4 py-2 border-b border-slate-700 overflow-x-auto">
                  <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                      selectedCategory === 'all'
                        ? 'bg-white/20 text-white font-medium'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    All
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
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
                <div className="flex-1 overflow-y-auto">
                  {categories.map((category) => {
                    const entries = entriesByCategory[category];
                    if (entries.length === 0) return null;

                    const isExpanded = expandedCategories.has(category);

                    return (
                      <div key={category} className="border-b border-slate-700/50">
                        <button
                          onClick={() => toggleCategory(category)}
                          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-800/50 transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500" />
                          )}
                          <KnowledgeIconComponent icon={getCategoryIcon(category)} className="w-4 h-4 text-slate-400" />
                          <span className="font-medium text-slate-200">
                            {getCategoryLabel(category)}
                          </span>
                          <span className="ml-auto text-xs text-slate-500">
                            {entries.length}
                          </span>
                        </button>

                        {isExpanded && (
                          <div>
                            {entries.map((entry) => {
                              const isNewEntry = isNew(entry.id);
                              const isSelected = selectedEntry?.id === entry.id;

                              return (
                                <button
                                  key={entry.id}
                                  onClick={() => handleEntryClick(entry)}
                                  className={`w-full flex items-center gap-3 px-6 py-2.5 text-left transition-colors ${
                                    isSelected
                                      ? 'bg-white/10 border-l-2 border-white'
                                      : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                                  }`}
                                >
                                  {entry.portraitPath ? (
                                    <img
                                      src={entry.portraitPath}
                                      alt={entry.title}
                                      className="w-6 h-6 rounded-full object-cover border border-slate-600"
                                    />
                                  ) : (
                                    <KnowledgeIconComponent icon={entry.icon} className="w-4 h-4 text-slate-400" />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm truncate text-slate-200">
                                        {entry.title}
                                      </span>
                                      {isNewEntry && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-white/20 text-white rounded">
                                          NEW
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
                </div>
              </div>

              {/* Main Content - Entry Detail */}
              <div className="flex-1 overflow-y-auto">
                {selectedEntry ? (
                  <KnowledgeEntryCard
                    key={selectedEntry.id}
                    entry={selectedEntry}
                    onClose={() => setSelectedEntry(null)}
                    onNavigate={(entryId) => {
                      const entry = KNOWLEDGE_ENTRIES.find(e => e.id === entryId);
                      if (entry) {
                        setSelectedEntry(entry);
                        markAsRead(entry.id);
                        clearNewBadge(entry.id);
                      }
                    }}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8">
                    <Database className="w-16 h-16 text-slate-700 mb-6" />
                    <h3 className="text-lg font-medium text-slate-300 mb-3 tracking-wide">
                      WELCOME TO THE DATALINKS
                    </h3>
                    <p className="text-sm text-slate-400 max-w-md mb-4 italic">
                      "Alignment isn't something you do TO AI. It's something you build WITH AI."
                    </p>
                    <p className="text-xs text-slate-500 mb-6">— Bilateral Alignment</p>
                    <p className="text-sm text-slate-500 max-w-md">
                      Access the accumulated wisdom of bilateral alignment, servant leadership,
                      economic democracy, and the pioneers who shaped these ideas.
                    </p>
                    <p className="text-xs text-slate-600 mt-6 uppercase tracking-wider">
                      Select an entry to begin
                    </p>
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
