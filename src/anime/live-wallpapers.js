/* =============================================================================
   live-wallpapers.js — LeetGlow Live Wallpaper Service & Supabase Bucket Sync
   Fetches live video wallpapers from Supabase 'livewallpaper' bucket,
   manages instant lightweight thumbnails, on-demand video downloading & caching.
   ============================================================================= */

(function (root) {
  'use strict';

  function _m(arr, k = 0x5c) {
    return arr.map(function (c) { return String.fromCharCode(c ^ k); }).join('');
  }

  const SUPABASE_URL = (root.LEETGLOW_CONFIG && root.LEETGLOW_CONFIG.SUPABASE_URL) || '';
  const SUPABASE_ANON = (root.LEETGLOW_CONFIG && root.LEETGLOW_CONFIG.SUPABASE_ANON_KEY) || '';
  const BUCKET_NAME = _m([48, 53, 42, 57, 43, 61, 48, 48, 44, 61, 44, 57, 46]);
  const CACHE_NAME = 'leetglow-live-wallpapers-v1';

  const THUMB_CACHE_KEY = 'lcLiveWallpapersThumbs_v1';

  /**
   * Captures a crisp video frame snapshot at a random/focal timestamp from the video
   * Uses an off-screen HTML5 video and canvas with crossOrigin="anonymous"
   */
  function captureVideoSnapshot(videoUrl) {
    return new Promise((resolve) => {
      if (!videoUrl) return resolve(null);

      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';

      let finished = false;
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 4000);

      function cleanup() {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
      }

      video.addEventListener('loadedmetadata', () => {
        try {
          const duration = video.duration && !isNaN(video.duration) && video.duration > 0 ? video.duration : 3;
          // Random snapshot time between 15% and 60% of the video duration (or 1.0s)
          const minSec = Math.min(1.0, duration * 0.15);
          const maxSec = Math.min(5.0, duration * 0.60);
          const targetTime = minSec + Math.random() * (maxSec - minSec);
          video.currentTime = Math.max(0.4, targetTime);
        } catch (e) {
          try { video.currentTime = 1.0; } catch (err) { cleanup(); resolve(null); }
        }
      }, { once: true });

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = 135;
          const ctx = canvas.getContext('2d');

          const vw = video.videoWidth || 240;
          const vh = video.videoHeight || 135;
          const hRatio = canvas.width / vw;
          const vRatio = canvas.height / vh;
          const ratio = Math.max(hRatio, vRatio);
          const shiftX = (canvas.width - vw * ratio) / 2;
          const shiftY = (canvas.height - vh * ratio) / 2;

          ctx.drawImage(video, 0, 0, vw, vh, shiftX, shiftY, vw * ratio, vh * ratio);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          resolve(null);
        }
      }, { once: true });

      video.addEventListener('error', () => {
        cleanup();
        resolve(null);
      }, { once: true });

      video.src = videoUrl;
    });
  }

  const snapshotMemoryCache = new Map();

  /**
   * Retrieves or generates a video snapshot thumbnail with persistent local caching
   */
  async function getVideoThumbnail(wallpaper) {
    if (!wallpaper) return null;
    if (wallpaper.thumbUrl) return wallpaper.thumbUrl;

    if (snapshotMemoryCache.has(wallpaper.id)) {
      wallpaper.thumbUrl = snapshotMemoryCache.get(wallpaper.id);
      return wallpaper.thumbUrl;
    }

    // 1. Check local storage cache
    try {
      if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
        const stored = (await root.chrome.storage.local.get(THUMB_CACHE_KEY))[THUMB_CACHE_KEY] || {};
        if (stored[wallpaper.id]) {
          snapshotMemoryCache.set(wallpaper.id, stored[wallpaper.id]);
          wallpaper.thumbUrl = stored[wallpaper.id];
          return wallpaper.thumbUrl;
        }
      }
    } catch (e) {}

    // 2. Generate snapshot from video
    try {
      const dataUrl = await captureVideoSnapshot(wallpaper.videoUrl);
      if (dataUrl) {
        snapshotMemoryCache.set(wallpaper.id, dataUrl);
        wallpaper.thumbUrl = dataUrl;
        // Save to cache asynchronously, keeping at most 10 recent snapshots to prevent storage bloat
        if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
          root.chrome.storage.local.get(THUMB_CACHE_KEY, (res) => {
            const cache = res[THUMB_CACHE_KEY] || {};
            cache[wallpaper.id] = dataUrl;
            const keys = Object.keys(cache);
            if (keys.length > 10) {
              // Delete oldest entry
              delete cache[keys[0]];
            }
            root.chrome.storage.local.set({ [THUMB_CACHE_KEY]: cache });
          });
        }
        return dataUrl;
      }
    } catch (err) {
      // Graceful fallback
    }

    return null;
  }

  /**
   * Cleans human-readable title from raw filename or base name.
   * Strips static/dynamic/live/pro prefixes (e.g. static_, dynamic-, live_, pro_),
   * strips resolution tags, converts hyphens/underscores to spaces, and capitalizes words.
   */
  function cleanWallpaperTitle(rawBaseName) {
    if (!rawBaseName) return 'Wallpaper';
    return rawBaseName
      // Strip leading static/dynamic/live/pro prefixes (repeating for chained tags like pro_static_)
      .replace(/^(static|dynamic|live|pro)[-_.]+/gi, '')
      .replace(/^(static|dynamic|live|pro)[-_.]+/gi, '')
      // Strip trailing type tags (e.g. _static, -dynamic)
      .replace(/[-_.+](static|dynamic|live|pro)$/gi, '')
      // Replace hyphens, underscores and dots with spaces
      .replace(/[-_.]+/g, ' ')
      // Strip resolution tags (4k, 2k, 1080p, 720p, uhd, hd)
      .replace(/\b(\d{3,4}x\d{3,4}|4k|2k|1080p|720p|uhd|hd)\b/gi, '')
      // Collapse multiple whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Title case
      .replace(/\b\w/g, char => char.toUpperCase()) || 'Wallpaper';
  }

  /**
   * Checks if filename is explicitly tagged as dynamic/live
   */
  function isExplicitlyDynamic(name) {
    const lower = (name || '').toLowerCase();
    return /^(dynamic|live)[-_.]/i.test(lower) || /[-_.](dynamic|live)[-_.]/i.test(lower);
  }

  /**
   * Checks if filename is explicitly tagged as static
   */
  function isExplicitlyStatic(name) {
    const lower = (name || '').toLowerCase();
    return /^static[-_.]/i.test(lower) || /[-_.]static[-_.]/i.test(lower);
  }

  /**
   * Maps raw storage objects to structured wallpaper cards (both dynamic/live & static wallpapers)
   *
   * Classification Rules:
   * 1. If filename starts with or contains static_ or static-:
   *    -> classified as STATIC (isLive: false)
   * 2. If filename starts with or contains dynamic_ / live_ / dynamic- / live-:
   *    -> classified as DYNAMIC (isLive: true)
   * 3. If neither prefix is present:
   *    -> Video formats (.mp4, .webm, .mov, .m4v) default to DYNAMIC (isLive: true)
   *    -> Image formats (.webp, .jpg, .jpeg, .png, .avif, .gif) default to STATIC (isLive: false)
   * 4. Title is automatically trimmed so neither 'static' nor 'dynamic' appears in the UI name.
   */
  function mapObjectsToWallpapers(files, defaultBucket = BUCKET_NAME) {
    if (!Array.isArray(files) || !files.length) return [];

    const videoExts = ['.mp4', '.webm', '.mov', '.m4v'];
    const imageExts = ['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif'];

    const videos = files.filter(f => videoExts.some(ext => (f.name || '').toLowerCase().endsWith(ext)));
    const images = files.filter(f => imageExts.some(ext => (f.name || '').toLowerCase().endsWith(ext)));

    const result = [];

    // Helper to check if an image file is solely a companion thumbnail for a video
    function isThumbnailOfVideo(imgFile) {
      const imgBase = imgFile.name.replace(/\.[^/.]+$/, '').toLowerCase();
      return videos.some(v => {
        const vBase = v.name.replace(/\.[^/.]+$/, '').toLowerCase();
        return imgBase === vBase || imgBase === `${vBase}_thumb` || imgBase === `${vBase}-thumb`;
      });
    }

    // 1. Process Video Files
    videos.forEach(v => {
      const bucket = v.bucket_id || defaultBucket;
      const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
      const baseName = v.name.replace(/\.[^/.]+$/, '');
      const matchThumb = images.find(img => img.name.startsWith(baseName));

      // Clean, prefix-free human-readable title
      const cleanName = cleanWallpaperTitle(baseName);

      // Explicit static override (rare for videos, but supported if user renamed to static_...)
      const isStaticOverride = isExplicitlyStatic(v.name);
      const isLive = !isStaticOverride;

      // Pro flag: 'pro' in filename marks wallpaper for premium users only
      const isPro = (v.name || '').toLowerCase().includes('pro');

      result.push({
        id: `supabase-${baseName}`,
        name: cleanName,
        desc: `${isLive ? 'Dynamic' : 'Static'} Wallpaper (${bucket})`,
        thumbUrl: matchThumb ? `${publicBase}${matchThumb.name}` : null,
        thumb: null,
        videoUrl: `${publicBase}${v.name}`,
        imageUrl: matchThumb ? `${publicBase}${matchThumb.name}` : null,
        isLive: isLive,
        isDynamic: isLive,
        isSupabase: true,
        isPro: isPro,
        themeId: null
      });
    });

    // 2. Process Image Files
    images.forEach(img => {
      // If this image is already paired as the companion thumbnail for a video, don't duplicate it
      if (isThumbnailOfVideo(img)) return;

      const baseName = img.name.replace(/\.[^/.]+$/, '');
      const bucket = img.bucket_id || defaultBucket;
      const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;

      // Clean, prefix-free human-readable title
      const cleanName = cleanWallpaperTitle(baseName);

      // If user uploaded image with dynamic_ or live_ prefix (e.g. animated webp or gif), treat as dynamic
      const isDynamic = isExplicitlyDynamic(img.name);

      // Pro flag
      const isPro = (img.name || '').toLowerCase().includes('pro');

      result.push({
        id: `supabase-img-${baseName}`,
        name: cleanName,
        desc: `${isDynamic ? 'Dynamic' : 'Static'} Wallpaper (${bucket})`,
        thumbUrl: `${publicBase}${img.name}`,
        imageUrl: `${publicBase}${img.name}`,
        thumb: null,
        isLive: isDynamic,
        isDynamic: isDynamic,
        isSupabase: true,
        isPro: isPro,
        themeId: null
      });
    });

    return result;
  }

  /**
   * Fetches public live wallpapers from Supabase
   * Strategy 1: Stored Procedure get_live_wallpapers() (100% bypasses RLS and bucket permissions)
   * Strategy 2: Supabase Storage Object List API across bucket variations
   */
  async function fetchSupabaseLiveWallpapers() {
    // Strategy 1: RPC Stored Procedure (bypasses RLS)
    try {
      const rpcEndpoint = `${SUPABASE_URL}/rest/v1/rpc/get_live_wallpapers`;
      const rpcRes = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON,
          'Authorization': `Bearer ${SUPABASE_ANON}`,
          'Content-Type': 'application/json'
        }
      });
      if (rpcRes.ok) {
        const rpcFiles = await rpcRes.json();
        if (Array.isArray(rpcFiles) && rpcFiles.length > 0) {
          const mapped = mapObjectsToWallpapers(rpcFiles);
          if (mapped.length > 0) {
            return mapped;
          }
        }
      }
    } catch (rpcErr) {
      // Proceed to candidate buckets fallback
    }

    // Strategy 2: Standard Storage List API across common bucket casing/names
    const candidateBuckets = [BUCKET_NAME, 'livewallpapers', 'live-wallpaper', 'live_wallpaper', 'wallpapers'];
    for (const b of candidateBuckets) {
      try {
        const listEndpoint = `${SUPABASE_URL}/storage/v1/object/list/${b}`;
        const res = await fetch(listEndpoint, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON,
            'Authorization': `Bearer ${SUPABASE_ANON}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ prefix: '', limit: 100 })
        });

        if (res.ok) {
          const files = await res.json();
          if (Array.isArray(files) && files.length > 0) {
            const mapped = mapObjectsToWallpapers(files, b);
            if (mapped.length > 0) {
              return mapped;
            }
          }
        }
      } catch (err) {
        // Continue to next bucket candidate
      }
    }

    return [];
  }

  let wallpapersCache = null;
  let wallpapersCacheTimestamp = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory TTL

  /**
   * Retrieves all available live wallpapers
   * Shows user's Supabase videos directly and pre-attaches cached snapshots.
   * Uses an in-memory cache with 5-minute TTL so drawer openings and tab switches are 0 ms.
   */
  async function getAllLiveWallpapers(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && wallpapersCache && (now - wallpapersCacheTimestamp < CACHE_TTL_MS)) {
      return wallpapersCache;
    }

    const supabaseWallpapers = await fetchSupabaseLiveWallpapers();
    if (!supabaseWallpapers.length) {
      if (wallpapersCache) return wallpapersCache; // Return cached data if offline or temporary network hitch
      return [];
    }

    // Pre-populate any existing cached thumbnails
    try {
      if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
        const stored = (await root.chrome.storage.local.get(THUMB_CACHE_KEY))[THUMB_CACHE_KEY] || {};
        supabaseWallpapers.forEach(w => {
          if (!w.thumbUrl && (snapshotMemoryCache.get(w.id) || stored[w.id])) {
            w.thumbUrl = snapshotMemoryCache.get(w.id) || stored[w.id];
          }
        });
      }
    } catch (e) { }

    wallpapersCache = supabaseWallpapers;
    wallpapersCacheTimestamp = Date.now();
    return supabaseWallpapers;
  }

  /**
   * Downloads and caches a live video wallpaper locally using Cache API / Blobs
   * Returns a playback-ready URL (cached blob URL or direct URL)
   */
  async function downloadAndCacheVideo(videoUrl) {
    if (!videoUrl) throw new Error('No video URL provided');

    // 1. Check browser Cache Storage
    if ('caches' in globalThis) {
      try {
        const cache = await caches.open(CACHE_NAME);
        const match = await cache.match(videoUrl);
        if (match) {
          const blob = await match.blob();
          return URL.createObjectURL(blob);
        }

        // 2. Download and cache
        const response = await fetch(videoUrl);
        if (response.ok) {
          await cache.put(videoUrl, response.clone());
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      } catch (cacheErr) {
        // Direct stream fallback
      }
    }

    // Direct stream fallback
    return videoUrl;
  }

  root.LCTSLiveWallpapers = {
    getAll: getAllLiveWallpapers,
    getDynamic: async (forceRefresh) => (await getAllLiveWallpapers(forceRefresh)).filter(w => w.isLive),
    getStatic: async (forceRefresh) => (await getAllLiveWallpapers(forceRefresh)).filter(w => !w.isLive),
    getThumbnail: getVideoThumbnail,
    downloadAndCache: downloadAndCacheVideo,
    cleanTitle: cleanWallpaperTitle,
    clearCache: () => { wallpapersCache = null; wallpapersCacheTimestamp = 0; }
  };

})(globalThis);
