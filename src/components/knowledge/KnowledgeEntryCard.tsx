/**
 * KnowledgeEntryCard - Full entry display with progressive disclosure
 *
 * Shows: icon, title, quote, brief, full article
 * Links to related entries and "See in Action" UI elements
 */

import {
  Quote,
  Link2,
  ArrowLeft,
  Handshake,
  HeartHandshake,
  Vote,
  Flower2,
  Sparkles,
  User,
  Settings,
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
  Library,
  LucideIcon,
} from 'lucide-react';
import {
  KnowledgeEntry,
  KnowledgeIcon,
  getCategoryLabel,
  useKnowledgeStore,
} from '../../stores/knowledgeStore';

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
};

// Render a Lucide icon from its identifier
function KnowledgeIconComponent({ icon, className }: { icon: KnowledgeIcon; className?: string }) {
  const IconComponent = ICON_MAP[icon];
  if (!IconComponent) return null;
  return <IconComponent className={className} />;
}

interface KnowledgeEntryCardProps {
  entry: KnowledgeEntry;
  onClose: () => void;
  onNavigate?: (entryId: string) => void;
}

export function KnowledgeEntryCard({ entry, onClose, onNavigate }: KnowledgeEntryCardProps) {
  const { getEntry } = useKnowledgeStore();

  // Convert markdown-like formatting to JSX
  const formatArticle = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableRows: string[][] = [];
    // Buffer for consecutive list items so each run gets a proper <ul>/<ol> parent
    let listType: 'ul' | 'ol' | null = null;
    let listItems: React.ReactNode[] = [];

    // Wrap any buffered list items in their list parent before emitting other content
    const flushList = (keyHint: string | number) => {
      if (listType === null || listItems.length === 0) {
        listType = null;
        listItems = [];
        return;
      }
      if (listType === 'ol') {
        elements.push(
          <ol key={`list-${keyHint}`} className="list-decimal ml-8 mb-3 space-y-1">
            {listItems}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`list-${keyHint}`} className="list-disc ml-8 mb-3 space-y-1">
            {listItems}
          </ul>
        );
      }
      listType = null;
      listItems = [];
    };

    lines.forEach((line, index) => {
      // Headers
      if (line.startsWith('**') && line.endsWith('**') && !line.includes('|')) {
        flushList(index);
        elements.push(
          <h4 key={index} className="text-amber-400 font-semibold mt-4 mb-2">
            {line.replace(/\*\*/g, '')}
          </h4>
        );
        return;
      }

      // Table handling
      if (line.includes('|') && line.trim().startsWith('|')) {
        flushList(index);
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        const cells = line
          .split('|')
          .filter((c) => c.trim())
          .map((c) => c.trim());
        if (!cells.every((c) => c.match(/^[-:]+$/))) {
          tableRows.push(cells);
        }
        return;
      } else if (inTable) {
        // End of table
        elements.push(
          <div key={`table-${index}`} className="my-4 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-700">
                  {tableRows[0]?.map((cell, i) => (
                    <th key={i} className="text-left py-2 px-3 text-slate-300 font-medium">
                      {cell.replace(/\*\*/g, '')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-slate-700/50">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-2 px-3 text-slate-400">
                        {cell.replace(/\*\*/g, '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
        tableRows = [];
      }

      // List items
      if (line.trim().startsWith('- ')) {
        // Switch list parent if the run type changes
        if (listType !== 'ul') flushList(index);
        listType = 'ul';
        listItems.push(
          <li key={index} className="text-slate-300 mb-1">
            {formatInlineText(line.replace(/^-\s*/, ''))}
          </li>
        );
        return;
      }

      // Numbered list items
      const numberedMatch = line.trim().match(/^(\d+)\.\s+/);
      if (numberedMatch) {
        // Switch list parent if the run type changes
        if (listType !== 'ol') flushList(index);
        listType = 'ol';
        listItems.push(
          <li key={index} className="text-slate-300 mb-1">
            {formatInlineText(line.replace(/^\d+\.\s*/, ''))}
          </li>
        );
        return;
      }

      // Empty lines
      if (line.trim() === '') {
        flushList(index);
        elements.push(<div key={index} className="h-2" />);
        return;
      }

      // Regular paragraphs
      flushList(index);
      elements.push(
        <p key={index} className="text-slate-300 mb-3 leading-relaxed">
          {formatInlineText(line)}
        </p>
      );
    });

    // Flush any list still open at the end of the article
    flushList('end');

    return elements;
  };

  // Format inline text (bold, etc)
  const formatInlineText = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="text-white font-medium">
            {part.replace(/\*\*/g, '')}
          </strong>
        );
      }
      return part;
    });
  };

  const relatedEntries = entry.relatedEntries
    .map((id) => getEntry(id))
    .filter((e): e is KnowledgeEntry => e !== undefined);

  return (
    <div className="h-full">
      {/* Article Header */}
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 px-6 py-4">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to list
        </button>
        <div className="flex items-start gap-4">
          {entry.portraitPath ? (
            <img
              src={entry.portraitPath}
              alt={entry.title}
              className="w-16 h-16 rounded-full object-cover border-2 border-amber-500/50"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <KnowledgeIconComponent icon={entry.icon} className="w-10 h-10 text-amber-400" />
          )}
          <div>
            <span className="text-xs text-amber-500 uppercase tracking-wide">
              {getCategoryLabel(entry.category)}
            </span>
            <h3 className="text-2xl font-bold text-white">{entry.title}</h3>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Quote */}
        {entry.quote && (
          <div className="mb-6 pl-4 border-l-2 border-amber-500/50">
            <Quote className="w-5 h-5 text-amber-500/50 mb-2" />
            <p className="text-lg text-slate-200 italic mb-1">"{entry.quote.text}"</p>
            <p className="text-sm text-slate-500">— {entry.quote.author}</p>
          </div>
        )}

        {/* Brief / Summary */}
        <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <h4 className="text-xs text-slate-500 uppercase tracking-wide mb-2">In Brief</h4>
          <p className="text-slate-300 leading-relaxed">{entry.brief}</p>
        </div>

        {/* Full Article */}
        <div className="prose prose-invert prose-slate max-w-none">
          {formatArticle(entry.article)}
        </div>

        {/* Related Entries */}
        {relatedEntries.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-700">
            <h4 className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-3">
              <Link2 className="w-4 h-4" />
              Related Topics
            </h4>
            <div className="flex flex-wrap gap-2">
              {relatedEntries.map((related) => (
                <button
                  key={related.id}
                  onClick={() => onNavigate?.(related.id)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:border-amber-500/50"
                >
                  <KnowledgeIconComponent icon={related.icon} className="w-4 h-4" />
                  <span>{related.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
