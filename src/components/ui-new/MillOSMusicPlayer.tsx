import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ListMusic,
  Music2,
  Pause,
  Play,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import { formatMusicTime } from '../../audio/millosSoundtrackCatalog';
import {
  findActiveMillosLyricWord,
  getMillosSoundtrackLyrics,
  type MillosTimedLyricLine,
} from '../../audio/millosSoundtrackLyrics';
import { useMusicPlayerState } from '../../hooks/useAudioState';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export const MillOSMusicPlayer: React.FC<{
  distractionFree?: boolean;
  sidebarVisible?: boolean;
}> = ({ distractionFree = false, sidebarVisible = false }) => {
  const player = useMusicPlayerState();
  const [expanded, setExpanded] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  const lyricsButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const cancelPendingFocus = useCallback(() => {
    if (pendingFocus.current !== null) cancelAnimationFrame(pendingFocus.current);
    pendingFocus.current = null;
  }, []);
  const queueFocus = useCallback(
    (target: React.RefObject<HTMLButtonElement | null>) => {
      cancelPendingFocus();
      pendingFocus.current = requestAnimationFrame(() => {
        pendingFocus.current = null;
        target.current?.focus();
      });
    },
    [cancelPendingFocus]
  );
  useEffect(() => cancelPendingFocus, [cancelPendingFocus]);
  const lyricsAvailable = player.currentTrack.station === 'original';
  const closeLyrics = useCallback(() => {
    setLyricsOpen(false);
    queueFocus(lyricsButtonRef);
  }, [queueFocus]);
  const setPlayerExpanded = (next: boolean) => {
    setExpanded(next);
    if (!next) setLyricsOpen(false);
    queueFocus(next ? collapseButtonRef : expandButtonRef);
  };

  useEffect(() => {
    // Switching to Legacy from inside the dialog disables the lyrics button, so
    // focus goes to the player's own control instead of falling to <body>.
    if (!lyricsAvailable && lyricsOpen) {
      setLyricsOpen(false);
      queueFocus(collapseButtonRef);
    }
  }, [lyricsAvailable, lyricsOpen, queueFocus]);

  useEffect(() => {
    if (lyricsOpen) cancelPendingFocus();
  }, [lyricsOpen, cancelPendingFocus]);

  useEffect(() => {
    if (!distractionFree) return;
    cancelPendingFocus();
    setExpanded(false);
    // Do not restore focus to music when a safety panel or the tour owns it.
    setLyricsOpen(false);
  }, [distractionFree, cancelPendingFocus]);

  if (!expanded || distractionFree) {
    return (
      <section
        aria-label="Music player"
        style={
          {
            '--millos-view-width': sidebarVisible
              ? 'calc(100vw - var(--millos-sidebar-width, min(24rem, 42vw)))'
              : '100vw',
          } as React.CSSProperties
        }
        className="pointer-events-auto fixed bottom-32 left-[calc(var(--millos-view-width)/2)] z-40 flex w-[min(320px,calc(var(--millos-view-width)-2rem))] -translate-x-1/2 items-center gap-2 rounded-md border border-cyan-100/15 bg-[#071722]/95 px-2 py-1 shadow-lg min-[1536px]:bottom-6 min-[1536px]:left-6 min-[1536px]:translate-x-0 [&_button]:min-h-[44px] [&_button]:min-w-[44px]"
      >
        <Music2 className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[12px] font-medium text-white"
            title={player.currentTrack.name}
          >
            {player.currentTrack.name}
          </p>
          <p className="text-[12px] text-slate-400">
            {player.playing ? 'Now playing' : 'Soundtrack'}
          </p>
        </div>
        <PlayerButton
          label={player.playing ? 'Pause music' : 'Play music'}
          onClick={player.togglePlayback}
        >
          {player.playing ? (
            <Pause size={18} aria-hidden="true" />
          ) : (
            <Play size={18} aria-hidden="true" />
          )}
        </PlayerButton>
        {!distractionFree && (
          <PlayerButton
            label="Expand music player"
            onClick={() => setPlayerExpanded(true)}
            buttonRef={expandButtonRef}
            expanded={false}
          >
            <ChevronUp size={18} aria-hidden="true" />
          </PlayerButton>
        )}
      </section>
    );
  }

  return (
    <>
      <section
        aria-label="Music player"
        className="pointer-events-auto fixed bottom-32 left-1/2 z-40 flex w-[min(46rem,calc(100vw-1rem))] -translate-x-1/2 items-center gap-2 rounded-lg border border-cyan-100/15 bg-[#071722]/95 p-2 pb-11 shadow-2xl backdrop-blur-xl sm:gap-3 sm:p-2.5 sm:pb-11"
      >
        {player.currentTrack.artwork ? (
          <img
            src={player.currentTrack.artwork}
            alt=""
            className="hidden h-12 w-12 shrink-0 rounded-xl object-cover sm:block"
          />
        ) : (
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-300 sm:flex">
            <Music2 size={20} aria-hidden="true" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-white sm:text-sm" aria-live="polite">
              {player.currentTrack.name}
            </p>
            <span className="hidden shrink-0 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200 sm:inline">
              {player.currentTrack.station === 'original' ? 'Original' : 'Legacy'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Below sm the station select leaves the artist one letter wide, so hide it. */}
            <p className="hidden min-w-0 flex-1 truncate text-[10px] text-slate-400 sm:block">
              {player.currentTrack.artist}
            </p>
            <select
              value={player.station}
              onChange={(event) => player.setStation(event.target.value as 'original' | 'legacy')}
              aria-label="Music collection"
              className="min-w-0 max-w-full rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5 text-[9px] text-slate-300 sm:max-w-none"
            >
              <option value="original">Original soundtrack</option>
              <option value="legacy">Legacy music</option>
            </select>
          </div>
          <div className="absolute bottom-0 left-3 right-3 flex h-11 items-center gap-2">
            <span className="hidden w-9 text-right font-mono text-[9px] text-slate-400 sm:inline">
              {formatMusicTime(player.positionSeconds)}
            </span>
            <input
              type="range"
              min={0}
              max={Math.max(player.durationSeconds, 1)}
              step={1}
              value={Math.min(player.positionSeconds, Math.max(player.durationSeconds, 1))}
              onChange={(event) => player.seek(Number(event.target.value))}
              aria-label="Song position"
              aria-valuetext={`${formatMusicTime(player.positionSeconds)} of ${formatMusicTime(player.durationSeconds)}`}
              className="h-11 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-transparent accent-cyan-400"
            />
            <span className="hidden w-9 font-mono text-[9px] text-slate-400 sm:inline">
              {formatMusicTime(player.durationSeconds)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <PlayerButton label="Previous song" onClick={player.prevTrack}>
            <SkipBack size={17} aria-hidden="true" />
          </PlayerButton>
          <PlayerButton
            label={player.playing ? 'Pause music' : 'Play music'}
            onClick={player.togglePlayback}
            prominent
          >
            {player.playing ? (
              <Pause size={18} fill="currentColor" aria-hidden="true" />
            ) : (
              <Play size={18} fill="currentColor" aria-hidden="true" />
            )}
          </PlayerButton>
          <PlayerButton label="Next song" onClick={player.nextTrack}>
            <SkipForward size={17} aria-hidden="true" />
          </PlayerButton>
          <button
            type="button"
            onClick={() => player.setShuffle(!player.shuffle)}
            aria-label="Shuffle songs"
            aria-pressed={player.shuffle}
            title={player.shuffle ? 'Shuffle on' : 'Shuffle off'}
            className={`hidden min-h-10 min-w-10 items-center justify-center rounded-xl transition-colors sm:flex ${
              player.shuffle
                ? 'bg-cyan-400/15 text-cyan-300'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Shuffle size={17} aria-hidden="true" />
          </button>
          <button
            ref={lyricsButtonRef}
            type="button"
            onClick={() => setLyricsOpen(true)}
            disabled={!lyricsAvailable}
            aria-haspopup="dialog"
            title={
              lyricsAvailable
                ? 'Open synchronized lyrics'
                : 'Lyrics are available for the original soundtrack'
            }
            aria-label="Open synchronized lyrics"
            className="ml-0.5 flex min-h-10 min-w-10 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ListMusic size={18} aria-hidden="true" />
          </button>
          <PlayerButton
            label="Collapse music player"
            onClick={() => setPlayerExpanded(false)}
            buttonRef={collapseButtonRef}
            expanded
          >
            <ChevronDown size={18} aria-hidden="true" />
          </PlayerButton>
        </div>
      </section>

      {lyricsOpen && <LyricsDialog onClose={closeLyrics} />}
    </>
  );
};

const PlayerButton: React.FC<{
  label: string;
  onClick: () => void;
  prominent?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
  expanded?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, prominent = false, buttonRef, expanded, children }) => (
  <button
    ref={buttonRef}
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-expanded={expanded}
    title={label}
    className={`flex min-h-10 min-w-10 items-center justify-center rounded-xl transition-colors ${
      prominent
        ? 'bg-cyan-400 text-cyan-950 hover:bg-cyan-300'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`}
  >
    {children}
  </button>
);

// Memoised so the 10 Hz progress ticks re-render only the lines whose active
// word changed, not every line and word span in the song.
const LyricLine = React.memo<{
  line: MillosTimedLyricLine;
  lineIndex: number;
  /** Index of the highlighted word in this line, or -1 when the line is inactive. */
  activeWordIndex: number;
  onSeek: (positionSeconds: number) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}>(({ line, lineIndex, activeWordIndex, onSeek, buttonRef }) => {
  const isActiveLine = activeWordIndex >= 0;
  const firstTimedWord = line.words.find((word) => word.startSeconds !== null);
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        if (firstTimedWord?.startSeconds !== null && firstTimedWord?.startSeconds !== undefined) {
          onSeek(firstTimedWord.startSeconds);
        }
      }}
      className={`block w-full rounded-xl px-3 py-2 text-left text-xl font-semibold leading-relaxed transition-colors sm:text-2xl ${
        isActiveLine
          ? 'bg-cyan-400/10 text-white'
          : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
      }`}
    >
      {line.words.map((word, wordIndex) => (
        <React.Fragment key={`${lineIndex}-${wordIndex}`}>
          <span className={wordIndex === activeWordIndex ? 'text-cyan-300' : undefined}>
            {word.text}
          </span>{' '}
        </React.Fragment>
      ))}
    </button>
  );
});
LyricLine.displayName = 'LyricLine';

const LyricsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const player = useMusicPlayerState();
  const reducedMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLButtonElement>(null);
  const sheet = getMillosSoundtrackLyrics(player.currentTrack.trackNumber ?? 1);
  const activeWord = useMemo(
    () => findActiveMillosLyricWord(sheet, player.positionSeconds),
    [player.positionSeconds, sheet]
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled])'
        )
      );
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const activeLine = activeLineRef.current;
    if (activeLine && typeof activeLine.scrollIntoView === 'function') {
      activeLine.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [activeWord?.lineIndex, reducedMotion]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="millos-lyrics-title"
        className="flex h-[min(52rem,calc(100dvh-1.5rem))] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-white/10 p-3 sm:p-4">
          {player.currentTrack.artwork && (
            <img
              src={player.currentTrack.artwork}
              alt=""
              className="h-14 w-14 rounded-xl object-cover sm:h-16 sm:w-16"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Songs of the Living Mill
            </p>
            <h2
              id="millos-lyrics-title"
              className="truncate text-lg font-bold text-white sm:text-xl"
            >
              {sheet.title}
            </h2>
            <p className="text-[10px] text-slate-400">
              Word timing is locally machine aligned and awaits human synchronization review.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lyrics"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="border-b border-white/10 p-3 md:overflow-y-auto md:border-b-0 md:border-r">
            <label
              htmlFor="millos-station"
              className="mb-1 block text-[10px] uppercase tracking-wider text-slate-400"
            >
              Collection
            </label>
            <select
              id="millos-station"
              value={player.station}
              onChange={(event) => player.setStation(event.target.value as 'original' | 'legacy')}
              className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-white"
            >
              <option value="original">Original soundtrack</option>
              <option value="legacy">Legacy music</option>
            </select>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                Play order
              </span>
              <button
                type="button"
                onClick={() => player.setShuffle(!player.shuffle)}
                aria-pressed={player.shuffle}
                className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-medium ${
                  player.shuffle ? 'bg-cyan-400 text-cyan-950' : 'bg-slate-800 text-white'
                }`}
              >
                <Shuffle size={14} aria-hidden="true" />
                Shuffle
              </button>
            </div>
            <div
              role="group"
              className="mt-3 hidden space-y-1 md:block"
              aria-label="Original soundtrack songs"
            >
              {player.availableTracks.map((track, index) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => player.selectTrack(index)}
                  aria-current={index === player.trackIndex ? 'true' : undefined}
                  className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs ${
                    index === player.trackIndex
                      ? 'bg-cyan-400/15 text-cyan-100'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  <span className="w-5 shrink-0 font-mono text-[10px] text-slate-500">
                    {String(track.trackNumber ?? index + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{track.name}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="select-text overflow-y-auto px-4 py-8 sm:px-10 sm:py-12" aria-live="off">
            {sheet.lines.map((line, lineIndex) => {
              if (line.kind === 'blank') return <div key={`blank-${lineIndex}`} className="h-5" />;
              if (line.kind === 'section') {
                return (
                  <p
                    key={`section-${lineIndex}`}
                    className="mb-3 mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-400/70"
                  >
                    {line.text.replace(/^\[|\]$/g, '')}
                  </p>
                );
              }
              const isActiveLine = activeWord?.lineIndex === lineIndex;
              return (
                <LyricLine
                  key={`lyric-${lineIndex}`}
                  line={line}
                  lineIndex={lineIndex}
                  activeWordIndex={isActiveLine ? activeWord.wordIndex : -1}
                  onSeek={player.seek}
                  buttonRef={isActiveLine ? activeLineRef : undefined}
                />
              );
            })}
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 p-3 sm:flex-nowrap sm:px-5">
          <PlayerButton label="Previous song" onClick={player.prevTrack}>
            <SkipBack size={17} aria-hidden="true" />
          </PlayerButton>
          <PlayerButton
            label={player.playing ? 'Pause music' : 'Play music'}
            onClick={player.togglePlayback}
            prominent
          >
            {player.playing ? (
              <Pause size={18} aria-hidden="true" />
            ) : (
              <Play size={18} aria-hidden="true" />
            )}
          </PlayerButton>
          <PlayerButton label="Next song" onClick={player.nextTrack}>
            <SkipForward size={17} aria-hidden="true" />
          </PlayerButton>
          <span className="ml-2 font-mono text-[10px] text-slate-400">
            {formatMusicTime(player.positionSeconds)} / {formatMusicTime(player.durationSeconds)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(player.durationSeconds, 1)}
            step={1}
            value={Math.min(player.positionSeconds, Math.max(player.durationSeconds, 1))}
            onChange={(event) => player.seek(Number(event.target.value))}
            aria-label="Song position"
            aria-valuetext={`${formatMusicTime(player.positionSeconds)} of ${formatMusicTime(player.durationSeconds)}`}
            className="h-11 min-w-0 flex-1 basis-full cursor-pointer appearance-none rounded-full bg-transparent accent-cyan-400 sm:basis-auto"
          />
        </footer>
      </div>
    </div>
  );
};
