import { useCallback, useEffect, useRef, useState } from "react";

const API = import.meta.env.VITE_API_URL || "https://video-carousel-backend-production.up.railway.app";
const PAGE_SIZE = 5;
const formatViews = (views) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(views);
const formatOnline = (value) => new Intl.NumberFormat("en").format(value);
const formatDuration = (value) => {
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return hours ? `${hours} hr ${minutes} min ${seconds} sec` : `${minutes} min ${seconds} sec`;
};
const formatDateLabel = (value) => {
  const year = value.slice(0, 4), month = value.slice(4, 6), day = value.slice(6, 8);
  return new Date(`${year}-${month}-${day}T00:00:00`).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
};
const ClockIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>;
const ViewsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
const ShareIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l5 5-5 5" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></svg>;

function VideoCard({ video }) {
  const [hovered, setHovered] = useState(false);
  const [shouldLoadPreview, setShouldLoadPreview] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef(null);
  const lastPointerType = useRef("mouse");
  const tappedOnce = useRef(false);
  const open = () => video.deeplink_url && window.open(video.deeplink_url, "_blank", "noopener,noreferrer");
  const share = async e => {
    e.stopPropagation();
    if (!video.deeplink_url) return;
    if (navigator.share) {
      try { await navigator.share({ title: video.video_name, url: video.deeplink_url }); } catch { /* user cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(video.deeplink_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  const start = () => { setPreviewReady(false); setHovered(true); setShouldLoadPreview(true); };
  const stop = () => { videoRef.current?.pause(); setHovered(false); setPreviewReady(false); };
  const duration = formatDuration(video.duration);
  useEffect(() => {
    if (hovered && videoRef.current) videoRef.current.play().catch(() => {});
  }, [hovered, shouldLoadPreview]);
  const showFirstFrame = () => {
    const player = videoRef.current;
    if (player?.requestVideoFrameCallback) player.requestVideoFrameCallback(() => setPreviewReady(true));
    else setTimeout(() => setPreviewReady(true), 80);
  };
  // Touchscreens don't hover, so the first tap previews instead of navigating
  // away immediately; a second tap opens it. Tracked with its own ref (not the
  // `hovered` state) because tapping a button also focuses it, and onFocus
  // already flips `hovered` before this click handler runs.
  const activate = () => {
    if (lastPointerType.current === "touch" && !tappedOnce.current) { tappedOnce.current = true; start(); return; }
    open();
  };
  return <article className="card" onMouseEnter={start} onMouseLeave={stop} onFocus={start} onBlur={stop}>
    <button className="media" onPointerDown={e => { lastPointerType.current = e.pointerType; }} onClick={activate} disabled={!video.deeplink_url} aria-label={`Preview or open ${video.video_name}`}>
      <img src={video.img_url} alt="" loading="lazy" />
      {shouldLoadPreview && <video ref={videoRef} className={hovered && previewReady ? "ready" : ""} src={video.preview_url} muted playsInline loop preload="auto" onPlaying={showFirstFrame} onWaiting={() => hovered && setPreviewReady(false)} onError={() => setPreviewReady(false)} />}
      {hovered && !previewReady && <span className="preview-loader"><i aria-hidden="true" /><b>Loading preview</b></span>}
      <span className="play">&#9654;</span>
    </button>
    <button className="share-btn" onClick={share} disabled={!video.deeplink_url} aria-label={`Share ${video.video_name}`}>
      <ShareIcon />
      {copied && <span className="copied-tag">Link copied</span>}
    </button>
    <div className="details"><p><span><ClockIcon />{duration}</span><span><ViewsIcon />{formatViews(video.views)} views</span></p></div>
  </article>;
}

function CarouselRow({ date, videos, total, onSeeAll }) {
  const rail = useRef(null);
  const scroll = direction => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * .8, behavior: "smooth" });
  const hasMore = total > videos.length;
  return <section className="carousel-row">
    <div className="row-head">
      <h2>{formatDateLabel(date)}</h2>
      {hasMore && <button className="see-all-link" onClick={() => onSeeAll(date)}>See all ({total})</button>}
    </div>
    <div className="carousel"><button className="nav prev" onClick={() => scroll(-1)} aria-label="Previous videos">&lsaquo;</button><div className="rail" ref={rail}>{videos.map(v => <VideoCard key={v.video_id} video={v} />)}{hasMore && <button className="see-all-card" onClick={() => onSeeAll(date)}><span>See all<br />{total} videos</span></button>}</div><button className="nav next" onClick={() => scroll(1)} aria-label="Next videos">&rsaquo;</button></div>
  </section>;
}

function useInfiniteScroll(onIntersect, enabled) {
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) onIntersect();
    }, { rootMargin: "400px" });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [enabled, onIntersect]);
  return sentinelRef;
}

export default function App() {
  const [carousels, setCarousels] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [online, setOnline] = useState(() => 5_000 + Math.floor(Math.random() * 401) - 200);
  const [expandedDate, setExpandedDate] = useState(null);
  const [expandedVideos, setExpandedVideos] = useState(null);
  const [expandedNextOffset, setExpandedNextOffset] = useState(null);
  const [expandedLoadingMore, setExpandedLoadingMore] = useState(false);
  const [expandedError, setExpandedError] = useState("");

  useEffect(() => {
    fetch(`${API}/api/carousels?limit=${PAGE_SIZE}`)
      .then(r => r.json())
      .then(x => { setCarousels(x.carousels); setNextBefore(x.next_before); })
      .catch(() => setError("The catalog is unavailable."));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setOnline(current => Math.max(4_600, Math.min(5_400, current + Math.floor(Math.random() * 241) - 120))), 120_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) { setSearchResults(null); setSearchError(""); return; }
    const handle = setTimeout(() => {
      fetch(`${API}/api/search?q=${encodeURIComponent(trimmed)}`)
        .then(r => r.json())
        .then(x => setSearchResults(x.videos))
        .catch(() => setSearchError("Search is unavailable."));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const loadMore = () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError("");
    fetch(`${API}/api/carousels?limit=${PAGE_SIZE}&before=${nextBefore}`)
      .then(r => r.json())
      .then(x => { setCarousels(current => [...current, ...x.carousels]); setNextBefore(x.next_before); })
      .catch(() => setLoadMoreError("Couldn't load more."))
      .finally(() => setLoadingMore(false));
  };

  const searching = query.trim().length > 0;

  const seeAll = date => {
    setExpandedDate(date);
    setExpandedVideos(null);
    setExpandedNextOffset(null);
    setExpandedError("");
    fetch(`${API}/api/videos?date=${date}&offset=0&limit=25`)
      .then(r => r.json())
      .then(x => { setExpandedVideos(x.videos); setExpandedNextOffset(x.next_offset); })
      .catch(() => setExpandedError("Couldn't load all videos for this date."));
  };
  const closeExpanded = () => { setExpandedDate(null); setExpandedVideos(null); setExpandedNextOffset(null); setExpandedError(""); };
  const loadMoreExpanded = useCallback(() => {
    if (expandedNextOffset == null || expandedLoadingMore) return;
    setExpandedLoadingMore(true);
    fetch(`${API}/api/videos?date=${expandedDate}&offset=${expandedNextOffset}&limit=25`)
      .then(r => r.json())
      .then(x => { setExpandedVideos(current => [...current, ...x.videos]); setExpandedNextOffset(x.next_offset); })
      .catch(() => setExpandedError("Couldn't load more videos."))
      .finally(() => setExpandedLoadingMore(false));
  }, [expandedDate, expandedNextOffset, expandedLoadingMore]);
  const expandedSentinel = useInfiniteScroll(loadMoreExpanded, expandedNextOffset != null);

  return <main><header><div><p className="eyebrow">VIDEO LIBRARY</p><h1>Tonight&apos;s picks</h1></div><div className="header-controls"><p className="online"><i />{formatOnline(online)} online</p><label>Search<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Video name or date" /></label></div></header>
    {error && <p className="error">{error}</p>}
    {expandedDate
      ? <>
          <button className="back-link" onClick={closeExpanded}>&lsaquo; Back to browsing</button>
          <h2>{formatDateLabel(expandedDate)} &mdash; all videos</h2>
          {expandedError
            ? <p className="error">{expandedError}</p>
            : expandedVideos === null
              ? null
              : <>
                  <section className="results-grid">{expandedVideos.map(v => <VideoCard key={v.video_id} video={v} />)}</section>
                  <div ref={expandedSentinel} className="scroll-sentinel">{expandedLoadingMore && "Loading more..."}</div>
                </>}
        </>
      : searching
        ? (searchError
            ? <p className="error">{searchError}</p>
            : searchResults === null
              ? null
              : searchResults.length === 0
                ? <p className="empty">No videos match &ldquo;{query.trim()}&rdquo;.</p>
                : <section className="results-grid">{searchResults.map(v => <VideoCard key={v.video_id} video={v} />)}</section>)
        : <>
            {carousels.map(c => <CarouselRow key={c.date} date={c.date} videos={c.videos} total={c.total} onSeeAll={seeAll} />)}
            {nextBefore && <div className="load-more"><button onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load more"}</button>{loadMoreError && <p className="error">{loadMoreError}</p>}</div>}
          </>}
  </main>;
}
