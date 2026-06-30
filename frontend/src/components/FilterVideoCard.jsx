import { useEffect, useState } from "react";
import Icon from "./Icon";
import Spinner from "./Spinner";

/**
 * Inline YouTube card that surfaces up to 4 review videos matching the
 * shopper's current filters. Hidden when no filters are active so an
 * unfiltered list stays clean.
 *
 * Props:
 *   videos        - array of { videoId, title, thumbnail, channel }
 *   activeVideoId - optional externally-controlled active id
 *   onSelect      - optional callback when user picks a different video
 *   loading       - shows a spinner placeholder while fetching
 *   activeCount   - number of filters applied; card is hidden if 0
 */
export default function FilterVideoCard({
  videos,
  activeVideoId,
  onSelect,
  loading,
  activeCount,
}) {
  const list = Array.isArray(videos) ? videos : [];
  const [localId, setLocalId] = useState(list[0]?.videoId || null);
  const [autoplay, setAutoplay] = useState(false);

  // Prefer parent-controlled active id when provided; otherwise fall back
  // to local state so the card works whether or not the parent tracks it.
  const activeId = activeVideoId || localId;
  const setActiveId = (id) => {
    if (onSelect) onSelect(id);
    setLocalId(id);
  };

  // Keep selection valid if the result list changes (e.g. new filter).
  useEffect(() => {
    if (!list.length) {
      if (localId) setLocalId(null);
      return;
    }
    const stillThere = list.some((v) => v.videoId === activeId);
    if (!stillThere) {
      const next = list[0].videoId;
      setLocalId(next);
      if (onSelect) onSelect(next);
      setAutoplay(false);
    }
  }, [list, activeId, localId, onSelect]);

  if (!activeCount) return null;

  const active = list.find((v) => v.videoId === activeId) || list[0] || null;

  return (
    <div className="card overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="play_circle" className="text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-label-md text-ink truncate">
              Watch reviews for your filters
            </div>
            <div className="text-label-sm text-ink-muted truncate">
              {list.length
                ? `${list.length} suggestion${list.length === 1 ? "" : "s"} from YouTube based on ${activeCount} active filter${activeCount === 1 ? "" : "s"}`
                : `Picked from YouTube based on ${activeCount} active filter${activeCount === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>
        {active && !autoplay && (
          <button
            onClick={() => setAutoplay(true)}
            className="btn-outline !py-1 !px-3 text-label-md"
          >
            Play
          </button>
        )}
      </div>

      <div className="aspect-video bg-ink">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center text-ink-on-primary text-label-md">
            <Spinner />
          </div>
        ) : active ? (
          <iframe
            key={active.videoId}
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${active.videoId}?autoplay=${autoplay ? 1 : 0}`}
            title={active.title || "Filtered review video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-on-primary text-label-md px-6 text-center">
            No review video matched those filters yet — try adjusting price or
            brand.
          </div>
        )}
      </div>

      {list.length > 1 && (
        <div className="px-3 py-3 border-t border-surface-border bg-surface-muted/40">
          <div className="flex gap-3 overflow-x-auto no-scrollbar">
            {list.map((v) => {
              const isActive = v.videoId === activeId;
              return (
                <button
                  key={v.videoId}
                  type="button"
                  onClick={() => {
                    setActiveId(v.videoId);
                    setAutoplay(true);
                  }}
                  className={`group min-w-[200px] max-w-[200px] text-left rounded-lg overflow-hidden border transition-all ${
                    isActive
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-surface-border hover:border-primary/60"
                  } bg-surface-white`}
                >
                  <div className="relative aspect-video bg-ink">
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <span
                        className={`material-symbols-outlined text-surface-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity ${
                          isActive ? "!opacity-100" : ""
                        }`}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        play_circle
                      </span>
                    </div>
                    {isActive && (
                      <span className="absolute top-1 left-1 bg-primary text-ink-on-primary text-label-sm font-label-sm px-1.5 py-0.5 rounded">
                        Playing
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-label-md font-bold text-on-surface line-clamp-2">
                      {v.title}
                    </p>
                    <p className="text-label-sm text-on-surface-variant truncate">
                      {v.channel || v.channelName}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}