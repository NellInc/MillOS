import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ListMusic,
  MicVocal,
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
  type MillosSoundtrackLyrics,
  type MillosTimedLyricLine,
} from '../../audio/millosSoundtrackLyrics';
import { useMusicPlayerState } from '../../hooks/useAudioState';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useT } from '../../i18n';
import { millOSMusicPlayerMessages } from './MillOSMusicPlayer.messages';

const LIVE_LYRICS_STORAGE_KEY = 'millos-music-live-lyrics';

function readLiveLyricsPreference(): boolean {
  try {
    return localStorage.getItem(LIVE_LYRICS_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export const MillOSMusicPlayer: React.FC<{
  distractionFree?: boolean;
  /**
   * A tour or the delivery journey holds attention, so the live lyric line hides
   * as well. Narrower than `distractionFree`, which also covers safety, alerts
   * and an open sidebar; defaults to it.
   */
  attentionHeld?: boolean;
  sidebarVisible?: boolean;
}> = ({ distractionFree = false, attentionHeld = distractionFree, sidebarVisible = false }) => {
  const t = useT(millOSMusicPlayerMessages);
  const player = useMusicPlayerState();
  const [expanded, setExpanded] = useState(false);
  const playlistId = useId();
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [liveLyrics, setLiveLyricsState] = useState(readLiveLyricsPreference);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);
  // Whichever control opened the dialog: the playlist's lyrics button or the
  // mini player's live line.
  const lyricsReturnRef = useRef<HTMLButtonElement | null>(null);
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
  const openLyrics = (event: React.MouseEvent<HTMLButtonElement>) => {
    lyricsReturnRef.current = event.currentTarget;
    setLyricsOpen(true);
  };
  const closeLyrics = useCallback(() => {
    setLyricsOpen(false);
    queueFocus(lyricsReturnRef);
  }, [queueFocus]);
  const setLiveLyrics = (next: boolean) => {
    setLiveLyricsState(next);
    try {
      localStorage.setItem(LIVE_LYRICS_STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // Storage can be blocked; the toggle still works for this session.
    }
  };
  const setPlayerExpanded = (next: boolean) => {
    setExpanded(next);
    if (!next) setLyricsOpen(false);
    queueFocus(next ? collapseButtonRef : expandButtonRef);
  };

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

  const playlistVisible = expanded && !distractionFree;
  const liveLyricsVisible = liveLyrics && !attentionHeld;
  const lastVisibleTrack = player.availableTracks.length <= 1;

  return (
    <>
      <section
        aria-label={t('musicPlayer')}
        style={
          {
            '--millos-view-width': sidebarVisible
              ? 'calc(100vw - var(--millos-sidebar-width, min(24rem, 42vw)))'
              : '100vw',
          } as React.CSSProperties
        }
        onKeyDown={(event) => {
          if (event.key === 'Escape' && playlistVisible && !lyricsOpen) {
            event.preventDefault();
            event.stopPropagation();
            setPlayerExpanded(false);
          }
        }}
        className={`pointer-events-auto fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[calc(4rem+env(safe-area-inset-top))] ${playlistVisible ? 'z-[60]' : 'z-40'} w-[min(20rem,calc(var(--millos-view-width)-1.5rem))] rounded-lg border border-cyan-100/15 bg-[#071722]/95 shadow-lg backdrop-blur-md [&_button]:min-h-11`}
      >
        <div className="flex items-center gap-0.5 p-1">
          <button
            ref={playlistVisible ? collapseButtonRef : expandButtonRef}
            type="button"
            onClick={() => setPlayerExpanded(!playlistVisible)}
            disabled={distractionFree}
            aria-label={playlistVisible ? t('collapsePlaylist') : t('expandPlaylist')}
            aria-expanded={playlistVisible}
            aria-controls={playlistId}
            title={player.currentTrack.name}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:pointer-events-none"
          >
            <Music2 className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] leading-4 text-slate-400">
                {player.playing ? t('nowPlaying') : t('soundtrack')}
              </span>
              <span className="block truncate text-xs font-medium text-white" aria-live="polite">
                {player.currentTrack.name}
              </span>
            </span>
            {!distractionFree &&
              (playlistVisible ? (
                <ChevronUp size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronDown size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
              ))}
          </button>
          <button
            type="button"
            onClick={() => setLiveLyrics(!liveLyrics)}
            aria-label={t('showLyrics')}
            aria-pressed={liveLyrics}
            title={liveLyrics ? t('hideLyrics') : t('showLyrics')}
            className={`flex min-w-11 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
              liveLyrics
                ? 'bg-cyan-400/15 text-cyan-300'
                : 'text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <MicVocal size={17} aria-hidden="true" />
          </button>
          <PlayerButton
            label={player.playing ? t('pauseMusic') : t('playMusic')}
            onClick={player.togglePlayback}
          >
            {player.playing ? (
              <Pause size={17} aria-hidden="true" />
            ) : (
              <Play size={17} aria-hidden="true" />
            )}
          </PlayerButton>
          <PlayerButton label={t('nextSong')} onClick={player.nextTrack}>
            <SkipForward size={17} aria-hidden="true" />
          </PlayerButton>
        </div>

        {liveLyricsVisible && (
          <MiniLyricLine
            sheet={getMillosSoundtrackLyrics(player.currentTrack.trackNumber ?? 1)}
            positionSeconds={player.positionSeconds}
            onOpen={distractionFree ? undefined : openLyrics}
          />
        )}

        {playlistVisible && (
          <div
            id={playlistId}
            role="region"
            aria-label={t('playlist')}
            className="flex max-h-[min(25rem,calc(100dvh-14rem))] flex-col overflow-y-auto overscroll-contain border-t border-white/10 p-2"
          >
            <div className="shrink-0 [@media(max-height:500px)]:order-2">
              <p
                className="truncate px-1 text-[11px] text-slate-400"
                title={player.currentTrack.artist}
              >
                {player.currentTrack.artist}
              </p>
              <div className="flex items-center gap-2">
                <PlayerButton label={t('previousSong')} onClick={player.prevTrack}>
                  <SkipBack size={16} aria-hidden="true" />
                </PlayerButton>
                <input
                  type="range"
                  min={0}
                  max={Math.max(player.durationSeconds, 1)}
                  step={1}
                  value={Math.min(player.positionSeconds, Math.max(player.durationSeconds, 1))}
                  onChange={(event) => player.seek(Number(event.target.value))}
                  aria-label={t('songPosition')}
                  aria-valuetext={t('positionOfDuration', {
                    position: formatMusicTime(player.positionSeconds),
                    duration: formatMusicTime(player.durationSeconds),
                  })}
                  className="h-11 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-transparent accent-cyan-400"
                />
                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                  {formatMusicTime(player.positionSeconds)} /{' '}
                  {formatMusicTime(player.durationSeconds)}
                </span>
              </div>
              <div className="mb-2 flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => player.setShuffle(!player.shuffle)}
                  aria-label={t('shuffleSongs')}
                  aria-pressed={player.shuffle}
                  title={player.shuffle ? t('shuffleOn') : t('shuffleOff')}
                  className={`flex min-w-11 shrink-0 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                    player.shuffle
                      ? 'bg-cyan-400/15 text-cyan-300'
                      : 'text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Shuffle size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={openLyrics}
                  aria-haspopup="dialog"
                  title={t('openLyrics')}
                  aria-label={t('openLyrics')}
                  className="flex min-w-11 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  <ListMusic size={17} aria-hidden="true" />
                </button>
              </div>
            </div>
            <ol aria-label={t('songs')} className="shrink-0 space-y-0.5">
              {player.availableTracks.map((track, index) => (
                <li key={track.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => player.selectTrack(index)}
                    aria-current={index === player.trackIndex ? 'true' : undefined}
                    title={track.name}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                      index === player.trackIndex
                        ? 'bg-cyan-400/10 text-cyan-100'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="w-5 shrink-0 text-[10px] tabular-nums text-slate-400">
                      {String(track.trackNumber ?? index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{track.name}</span>
                    {track.durationSeconds !== undefined && (
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                        {formatMusicTime(track.durationSeconds)}
                      </span>
                    )}
                  </button>
                  <TrackVisibilityButton
                    label={`Hide ${track.name}`}
                    disabled={lastVisibleTrack}
                    onClick={() => player.setTrackHidden(track.id, true)}
                  >
                    <EyeOff size={14} aria-hidden="true" />
                  </TrackVisibilityButton>
                </li>
              ))}
            </ol>
            {player.hiddenTracks.length > 0 && (
              <ul
                aria-label={t('hiddenSongs')}
                className="mt-1 shrink-0 space-y-0.5 border-t border-white/10 pt-1"
              >
                {player.hiddenTracks.map((track) => (
                  <li key={track.id} className="flex items-center gap-0.5">
                    <span className="flex min-w-0 flex-1 items-center gap-2 px-2 text-xs text-slate-500 line-through">
                      <span className="w-5 shrink-0 text-[10px] tabular-nums">
                        {String(track.trackNumber ?? 0).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1 truncate" title={track.name}>
                        {track.name}
                      </span>
                    </span>
                    <TrackVisibilityButton
                      label={`Show ${track.name}`}
                      onClick={() => player.setTrackHidden(track.id, false)}
                    >
                      <Eye size={14} aria-hidden="true" />
                    </TrackVisibilityButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      {lyricsOpen && !distractionFree && <LyricsDialog onClose={closeLyrics} />}
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
    className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
      prominent
        ? 'bg-cyan-400 text-cyan-950 hover:bg-cyan-300'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`}
  >
    {children}
  </button>
);

const TrackVisibilityButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled = false, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className="flex min-w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-35"
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

/**
 * The sung line, word-highlighted in time. Between lines it shows the next one
 * dimmed, so the strip never sits empty through an intro or a break.
 */
const MiniLyricLine: React.FC<{
  sheet: MillosSoundtrackLyrics;
  positionSeconds: number;
  /** Absent while the full dialog cannot open; the line is then plain text. */
  onOpen?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}> = ({ sheet, positionSeconds, onOpen }) => {
  const t = useT(millOSMusicPlayerMessages);
  const shown = useMemo(() => {
    const active = findActiveMillosLyricWord(sheet, positionSeconds);
    if (active) return { lineIndex: active.lineIndex, wordIndex: active.wordIndex };
    const upcoming = sheet.lines.findIndex(
      (line) =>
        line.kind === 'lyric' &&
        line.words.some((word) => word.startSeconds !== null && word.startSeconds > positionSeconds)
    );
    return upcoming >= 0 ? { lineIndex: upcoming, wordIndex: -1 } : null;
  }, [positionSeconds, sheet]);
  const line = shown ? sheet.lines[shown.lineIndex] : null;
  const sung = shown !== null && shown.wordIndex >= 0;
  const text = (
    <span
      aria-hidden="true"
      className={`line-clamp-2 ${sung ? 'text-slate-200' : 'text-slate-500'}`}
    >
      {line?.words.map((word, wordIndex) => (
        <React.Fragment key={`${shown?.lineIndex}-${wordIndex}`}>
          <span className={wordIndex === shown?.wordIndex ? 'text-cyan-300' : undefined}>
            {word.text}
          </span>{' '}
        </React.Fragment>
      )) ?? ' '}
    </span>
  );
  const frame =
    'block min-h-11 w-full border-t border-white/10 px-3 py-1.5 text-left text-sm font-medium leading-snug';

  if (!onOpen) {
    return (
      <div data-testid="live-lyric" className={frame}>
        {text}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('openFullLyrics')}
      title={t('openFullLyrics')}
      data-testid="live-lyric"
      className={`${frame} hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300`}
    >
      {text}
    </button>
  );
};

const LyricsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT(millOSMusicPlayerMessages);
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
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeLyrics')}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="border-b border-white/10 p-3 md:overflow-y-auto md:border-b-0 md:border-r">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400">
                {t('playOrder')}
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
                {t('shuffle')}
              </button>
            </div>
            <div
              role="group"
              className="mt-3 hidden space-y-1 md:block"
              aria-label={t('originalSoundtrackSongs')}
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
          <PlayerButton label={t('previousSong')} onClick={player.prevTrack}>
            <SkipBack size={17} aria-hidden="true" />
          </PlayerButton>
          <PlayerButton
            label={player.playing ? t('pauseMusic') : t('playMusic')}
            onClick={player.togglePlayback}
            prominent
          >
            {player.playing ? (
              <Pause size={18} aria-hidden="true" />
            ) : (
              <Play size={18} aria-hidden="true" />
            )}
          </PlayerButton>
          <PlayerButton label={t('nextSong')} onClick={player.nextTrack}>
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
            aria-label={t('songPosition')}
            aria-valuetext={t('positionOfDuration', {
              position: formatMusicTime(player.positionSeconds),
              duration: formatMusicTime(player.durationSeconds),
            })}
            className="h-11 min-w-0 flex-1 basis-full cursor-pointer appearance-none rounded-full bg-transparent accent-cyan-400 sm:basis-auto"
          />
        </footer>
      </div>
    </div>
  );
};
