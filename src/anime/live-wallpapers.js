/* =============================================================================
   live-wallpapers.js — LeetGlow Live Wallpaper Service & Supabase Bucket Sync
   Fetches live video wallpapers from Supabase 'livewallpaper' bucket,
   manages instant lightweight thumbnails, on-demand video downloading & caching.
   ============================================================================= */

(function (root) {
  'use strict';

  const SUPABASE_URL = (root.LEETGLOW_CONFIG && root.LEETGLOW_CONFIG.SUPABASE_URL) || 'https://kxtdvzyftfhryvbpbohb.supabase.co';
  const SUPABASE_ANON = (root.LEETGLOW_CONFIG && root.LEETGLOW_CONFIG.SUPABASE_ANON_KEY) || 'sb_publishable_h76RupEa47M3tZw-CVS4qg_4PrFaM7v';
  const BUCKET_NAME = 'livewallpaper';
  const CACHE_NAME = 'leetglow-live-wallpapers-v1';

  const THUMB_CACHE_KEY = 'lcLiveWallpapersThumbs_v1';

  /**
   * Captures a crisp video frame snapshot at a random/focal timestamp from the video
   * Uses an off-screen HTML5 video and canvas with crossOrigin="anonymous"
   */
  function captureVideoSnapshot(videoUrl) {
    return new Promise((resolve, reject) => {
      if (!videoUrl) return reject(new Error('No video URL provided'));

      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';

      let finished = false;
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Video snapshot timeout'));
      }, 9000);

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
          video.currentTime = 1.0;
        }
      }, { once: true });

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 320;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');

          const vw = video.videoWidth || 320;
          const vh = video.videoHeight || 180;
          const hRatio = canvas.width / vw;
          const vRatio = canvas.height / vh;
          const ratio = Math.max(hRatio, vRatio);
          const shiftX = (canvas.width - vw * ratio) / 2;
          const shiftY = (canvas.height - vh * ratio) / 2;

          ctx.drawImage(video, 0, 0, vw, vh, shiftX, shiftY, vw * ratio, vh * ratio);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          reject(err);
        }
      }, { once: true });

      video.addEventListener('error', (err) => {
        cleanup();
        reject(err || new Error('Video loading error'));
      }, { once: true });

      video.src = videoUrl;
    });
  }

  /**
   * Retrieves or generates a video snapshot thumbnail with persistent local caching
   */
  async function getVideoThumbnail(wallpaper) {
    if (!wallpaper) return null;
    if (wallpaper.thumbUrl) return wallpaper.thumbUrl;

    // 1. Check local storage cache
    try {
      if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
        const stored = (await root.chrome.storage.local.get(THUMB_CACHE_KEY))[THUMB_CACHE_KEY] || {};
        if (stored[wallpaper.id]) {
          wallpaper.thumbUrl = stored[wallpaper.id];
          return wallpaper.thumbUrl;
        }
      }
    } catch (e) {}

    // 2. Generate snapshot from video
    try {
      const dataUrl = await captureVideoSnapshot(wallpaper.videoUrl);
      if (dataUrl) {
        wallpaper.thumbUrl = dataUrl;
        // Save to cache asynchronously
        if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
          root.chrome.storage.local.get(THUMB_CACHE_KEY, (res) => {
            const cache = res[THUMB_CACHE_KEY] || {};
            cache[wallpaper.id] = dataUrl;
            root.chrome.storage.local.set({ [THUMB_CACHE_KEY]: cache });
          });
        }
        return dataUrl;
      }
    } catch (err) {
      console.warn('[LeetGlow Live] Could not extract video snapshot:', err);
    }

    return null;
  }

  /**
   * Maps raw storage objects to structured wallpaper cards (both live videos & static images)
   * If a file name contains 'pro' (case-insensitive), it is marked as a PRO feature.
   */
  function mapObjectsToWallpapers(files, defaultBucket = BUCKET_NAME) {
    if (!Array.isArray(files) || !files.length) return [];

    const videoExts = ['.mp4', '.webm', '.mov', '.m4v'];
    const imageExts = ['.webp', '.jpg', '.jpeg', '.png', '.avif'];

    const videos = files.filter(f => videoExts.some(ext => (f.name || '').toLowerCase().endsWith(ext)));
    const images = files.filter(f => imageExts.some(ext => (f.name || '').toLowerCase().endsWith(ext)));

    const result = [];

    // 1. Process Video Wallpapers (Live Wallpapers)
    videos.forEach(v => {
      const bucket = v.bucket_id || defaultBucket;
      const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
      const baseName = v.name.replace(/\.[^/.]+$/, '');
      const matchThumb = images.find(img => img.name.startsWith(baseName));

      // Clean human-readable title
      const cleanName = baseName
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

      // If filename has 'pro' in it, treat it as a PRO wallpaper for premium users only
      const isPro = (v.name || '').toLowerCase().includes('pro');

      result.push({
        id: `supabase-${baseName}`,
        name: cleanName,
        desc: `Live Wallpaper (${bucket})`,
        thumbUrl: matchThumb ? `${publicBase}${matchThumb.name}` : null,
        thumb: null,
        videoUrl: `${publicBase}${v.name}`,
        isLive: true,
        isSupabase: true,
        isPro: isPro,
        themeId: 'neon-rain'
      });
    });

    // 2. Process Static Images (Static Wallpapers from Bucket)
    // Any image that is NOT merely a companion thumbnail for one of the videos is a static wallpaper
    images.forEach(img => {
      const baseName = img.name.replace(/\.[^/.]+$/, '');
      const isCompanionOfVideo = videos.some(v => v.name.replace(/\.[^/.]+$/, '') === baseName);
      if (isCompanionOfVideo) return; // Dedicated thumbnail for video

      const bucket = img.bucket_id || defaultBucket;
      const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/`;
      const cleanName = baseName
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

      // If filename has 'pro' in it, treat it as a PRO wallpaper for premium users only
      const isPro = (img.name || '').toLowerCase().includes('pro');

      result.push({
        id: `supabase-img-${baseName}`,
        name: cleanName,
        desc: `Static Wallpaper (${bucket})`,
        thumbUrl: `${publicBase}${img.name}`,
        imageUrl: `${publicBase}${img.name}`,
        thumb: null,
        isLive: false,
        isSupabase: true,
        isPro: isPro,
        themeId: 'neon-rain'
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
      console.warn('[LeetGlow Live] RPC check fallback:', rpcErr);
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

  /**
   * Retrieves all available live wallpapers
   * Shows user's Supabase videos directly and pre-attaches cached snapshots
   */
  async function getAllLiveWallpapers() {
    const supabaseWallpapers = await fetchSupabaseLiveWallpapers();
    if (!supabaseWallpapers.length) return [];

    // Pre-populate any existing cached thumbnails
    try {
      if (root.chrome && root.chrome.storage && root.chrome.storage.local) {
        const stored = (await root.chrome.storage.local.get(THUMB_CACHE_KEY))[THUMB_CACHE_KEY] || {};
        supabaseWallpapers.forEach(w => {
          if (!w.thumbUrl && stored[w.id]) {
            w.thumbUrl = stored[w.id];
          }
        });
      }
    } catch (e) {}

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
        console.warn('[LeetGlow Live] Cache API fallback to direct URL:', cacheErr);
      }
    }

    // Direct stream fallback
    return videoUrl;
  }

  root.LCTSLiveWallpapers = {
    getAll: getAllLiveWallpapers,
    getThumbnail: getVideoThumbnail,
    downloadAndCache: downloadAndCacheVideo
  };

})(globalThis);
