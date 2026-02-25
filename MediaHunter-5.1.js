// ==UserScript==
// @name         MediaHunter 媒体猎手 (增加排序)
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  Capture video and audio resources. Enhanced parsing. Strictly conform to yt-dlp command line arguments. UI strictly matches the new design mockup. Fix protocol decode issue. Add short media filtering. Filter image pseudo-segments. Added DOM-to-Network Resolution Sync. Hide media without duration. Added CSS Shield. Performance Optimized. Sort .m3u8 to the top.
// @author       yudong2ao
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const STATE = {
        mediaList: [],
        isPopupOpen: false,
        hasButtonShown: false,
        sniffedUrls: new Set()
    };

    const DOM_CACHE = new WeakMap();

    const IS_TOP = window === window.top;

    const YTDLP_SUPPORTED_SITES = [
        'youtube.com', 'youtu.be', 'bilibili.com', 'acfun.cn', 'twitter.com',
        'x.com', 'twitch.tv', 'tiktok.com', 'vimeo.com', 'instagram.com'
    ];

    const ICONS = {
        logo: "data:image/webp;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAAXNSR0IArs4c6QAAAARzQklUCAgICHwIZIgAAAK4SURBVGiB7VnRcdswDAU7gUbQCN6gygTpBtUGXkGdwJcJMoLTCdwN0g3kDewNXj5I9WQIFABKqnMXvztf7NB4eCABkKKJHnjgayOsRQSgJqJnItoRUZ1eVRo+E9E1vf4Q0e8Qwnkt38UAUAHoALzDj3cAhxT43YRfCoRzXBJXpXteR3y7knCOHkC7tfhOmckTgD2ABkCNuFJVet+ksaMyAd0WwisArzPCXSmQAmrTrEs4ePgsDg+52VrqCPlVfV1LvOSgB9Cs4oD+rYi0Gt1S4h8Z8bVB0JDrPWL6WWykINolAXBCq3hJSKntBSVpCjl1ZgUku6NgN+BosG8Eu84rXpoJEwnmW+TFyMEnz7cKmHad3mHLAy8JoBImopO++y3D0bDPv6wBENHfmbE3C0EI4UpEL+zf303eU/oUL18m/QBDETMeaRV0e8Qdcgy18DJBDG30kt6bxY94TkzL3mLEu8jECAV9vsQe8ew0hr47C1E3gvOe5weMKeKxB7Bj3zlZAuAPJ5x0aZ8322Naj3o3BCscbZxBbZNee20810bHBLwDXTUbBWZ7wfcEUgDcASdZ2uc99v7Jw7SId2z8UxWxtAJn9vlmB0zXIU8UZ2u4KnkjoifLVYnTnu++phXgvVdvXVOORfvEiEfdk3LObyrfUkzMvjjFGA/vWDvdksS9oHM4XrRPjHj4kcZ8Il50Hhdm7YbHoaFntq0nAPN53ODYHYAwgYC3hjIkjcFuLoXUwximNQgAB5f4RCStQq/NBNZ/qFft5gh5IXmEuJ4HZgJvi8SPiHMXW7OCPhWQvxft7q3NBMR6yN2P9inV/s/9/hJk0mnA5Hr93npFIN6XSsW2CTQ9xT/yIeb/T4o/5m2GEMKsxkW/UqY02VO8CLMdtJzYNIAxUjANxTN8TfFpavhbDC2ABx746vgAk2JZgG5dojEAAAAASUVORK5CYII=",
        video: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHBhdGggICBmaWxsLXJ1bGU9ImV2ZW5vZGQiICBmaWxsPSIjMzgzODM4IiAgZD0iTTE0LjY2MzIgOC4wMDMyOUMxNC42NjMyIDQuMzIxMjkgMTEuNjg1MiAxLjMzMzMgOC4wMDMxOSAxLjMzMzNDNC4zMjExOSAxLjMzMzMgMS4zMzMxOSA0LjMyMTI5IDEuMzMzMTkgOC4wMDMyOUMxLjMzMzE5IDExLjY4NTMgNC4zMjExOSAxNC42NjMzIDguMDAzMTkgMTQuNjYzM0MxMS42ODUyIDE0LjY2MzMgMTQuNjYzMiAxMS42ODUzIDE0LjY2MzIgOC4wMDMyOVpNNy45OTY3OSAxMy4zMzY3QzEwLjk0MjMgMTMuMzM2NyAxMy4zMzY4IDEwLjk0MjIgMTMuMzM2OCA3Ljk5NjY5QzEzLjMzNjggNS4wNTEyIDEwLjk0MjMgMi42NjY3IDcuOTk2NzkgMi42NjY3QzUuMDUxMyAyLjY2NjcgMi42NjY3OSA1LjA1MTIgMi42NjY3OSA3Ljk5NjY5QzIuNjY2NzkgMTAuOTQyMiA1LjA1MTMgMTMuMzM2NyA3Ljk5Njc5IDEzLjMzNjdaTTcuMDc2NzkgMTAuMzg1MkM2Ljk5NTA4IDEwLjQzOTQgNi44OTMyNiAxMC40NTE0IDYuODA2NzkgMTAuNDA1MkM2LjcyMDM1IDEwLjM1OSA2LjY2Njc5IDEwLjI2MzIgNi42NjY3OSAxMC4xNjUyTDYuNjY2NzkgNS44MzUxOUM2LjY2Njc5IDUuNzM2OTMgNi43MjAwOCA1LjY0MTUgNi44MDY3OSA1LjU5NTE5QzYuODkzNDUgNS41NDg5NCA2Ljk5NTA0IDUuNTUwNjYgNy4wNzY3OSA1LjYwNTE5TDEwLjMzNjggNy43NzUxOUMxMC40MTExIDcuODI0NjYgMTAuNDU2OCA3LjkwNTk0IDEwLjQ1NjggNy45OTUxOUMxMC40NTY4IDguMDg0NCAxMC40MTExIDguMTc1NzIgMTAuMzM2OCA4LjIyNTE5TDcuMDc2NzkgMTAuMzg1MloiPjwvcGF0aD48L3N2Zz4=",
        audio: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSI+PHBhdGggICBmaWxsLXJ1bGU9ImV2ZW5vZGQiICBmaWxsPSIjMzgzODM4IiAgZD0iTTExLjM1NjcgMTMuOTFDMTIuNTIyNiAxMy41OTc4IDEzLjMzNjcgMTIuNTM2OSAxMy4zMzY3IDExLjMzTDEzLjMzNjcgMkw0LjY2NjcyIDJMNC42NjY3MiA5LjAyMDAxQzMuNjIxNTkgOC40MTY1NSAyLjMwMDIgOC41OTY3MSAxLjQ0NjcyIDkuNDUwMDFDMC41OTMzNjEgMTAuMzAzNCAwLjQyMzQwMiAxMS42MjQ4IDEuMDI2NzIgMTIuNjdDMS42MzAwMyAxMy43MTUzIDIuODYxIDE0LjIyMjEgNC4wMjY3MiAxMy45MUM1LjE5MjU3IDEzLjU5NzggNS45OTY3MiAxMi41MzY5IDUuOTk2NzIgMTEuMzNMNS45OTY3MiAzLjMzTDExLjk5NjcgMy4zM0wxMS45OTY3IDkuMDIwMDFDMTAuOTUxNSA4LjQxNjU1IDkuNjMwMjEgOC41OTY3MSA4Ljc3NjczIDkuNDUwMDFDNy45MjMyNCAxMC4zMDM0IDcuNzUzNDEgMTEuNjI0OCA4LjM1NjczIDEyLjY3QzguOTYwMDQgMTMuNzE1MyAxMC4xOTA5IDE0LjIyMjEgMTEuMzU2NyAxMy45MVpNNC42NzAwMiAxMS4zM0M0LjY3MDAyIDEwLjU5MzYgNC4wNjYzOSAxMCAzLjMzMDAyIDEwQzIuNTkzNjUgMTAgMi4wMDAwMiAxMC41OTM2IDIuMDAwMDIgMTEuMzNDMi4wMDAwMiAxMi4wNjY0IDIuNTkzNjUgMTIuNjcgMy4zMzAwMiAxMi42N0M0LjA2NjM5IDEyLjY3IDQuNjcwMDIgMTIuMDY2NCA0LjY3MDAyIDExLjMzWk0xMC42NjMzIDEwQzExLjM5OTcgMTAgMTIuMDAzMyAxMC41OTM2IDEyLjAwMzMgMTEuMzNDMTIuMDAzMyAxMi4wNjY0IDExLjM5OTcgMTIuNjcgMTAuNjYzMyAxMi42N0M5LjkyNjk2IDEyLjY3IDkuMzMzMzMgMTIuMDY2NCA5LjMzMzMzIDExLjMzQzkuMzMzMzMgMTAuNTkzNiA5LjkyNjk2IDEwIDEwLjY2MzMgMTBaIj48L3BhdGg+PC9zdmc+",
        close: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB3aWR0aD0iMTEuMTEyNjA5ODYzMjgxMjUiIGhlaWdodD0iMTEiIHZpZXdCb3g9IjAgMCAxMS4xMTI2MDk4NjMyODEyNSAxMSIgZmlsbD0ibm9uZSI+PHBhdGggICAgc3Ryb2tlPSJyZ2JhKDI1NSwgMjU1LCAyNTUsIDEpIiBzdHJva2Utd2lkdGg9IjAuOTE2NjY2NjY2NjY2NjY1OSIgICAgZD0iTTguNzQwNzYgMi4yNTkwOUw1LjQ5OTg3IDUuNUwyLjI1ODk3IDguNzQwOTEiPjwvcGF0aD48cGF0aCAgICBzdHJva2U9InJnYmEoMjU1LCAyNTUsIDI1NSwgMSkiIHN0cm9rZS13aWR0aD0iMC45MTY2NjY2NjY2NjY2NjU5IiAgICBkPSJNMi4yNTg5NyAyLjI1OTA5TDUuNDk5ODcgNS41TDguNzQwNzYgOC43NDA5MSI+PC9wYXRoPjwvc3ZnPg=="
    };

    const STYLES = `
        #mh-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; z-index: 2147483647; position: fixed; bottom: 20px; right: 20px; }
        #mh-root * { box-sizing: border-box !important; }
        #mh-root img { position: static !important; top: auto !important; left: auto !important; right: auto !important; bottom: auto !important; transform: none !important; margin: 0 !important; padding: 0 !important; display: block !important; max-width: none !important; max-height: none !important; min-width: 0 !important; min-height: 0 !important; border: none !important; background: transparent !important; box-shadow: none !important; border-radius: 0 !important; opacity: 1 !important; }
        #mh-float-btn { display: flex; align-items: center; justify-content: center; width: 88px; height: 27px; opacity: 1; background: rgba(45, 33, 183, 1); color: white; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 10px rgba(45, 33, 183, 0.3); transition: transform 0.2s; user-select: none; text-decoration: none !important; }
        #mh-float-btn:hover { transform: translateY(-2px); }
        #mh-float-btn img { width: 14px !important; height: 14px !important; margin: 0 4px 0 0 !important; }
        #mh-float-btn span { font-size: 12px !important; font-weight: 500 !important; letter-spacing: 0.5px !important; line-height: 1 !important; color: #fff !important; margin: 0 !important; padding: 0 !important; }
        #mh-popup { position: absolute; bottom: 0; right: 0; width: 296px; max-height: 253px; background: rgba(255, 255, 255, 1); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); display: none; flex-direction: column; overflow: hidden; }
        #mh-header { background: rgba(45, 33, 183, 1); height: 36px; padding: 0 12px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
        #mh-header h3 { margin: 0 !important; padding: 0 !important; width: 136.38px; height: 18px; font-size: 13px !important; font-weight: 400 !important; letter-spacing: 0px !important; line-height: 17.84px !important; color: rgba(255, 255, 255, 1) !important; text-align: left !important; vertical-align: middle !important; white-space: nowrap !important; }
        #mh-close-btn { cursor: pointer; width: 11px !important; height: 11px !important; opacity: 0.8 !important; }
        #mh-close-btn:hover { opacity: 1 !important; }
        #mh-content { max-height: 219px; overflow-x: hidden; overflow-y: auto; padding: 10px; }
        #mh-content::-webkit-scrollbar { width: 4px; }
        #mh-content::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 2px; }
        .mh-card { width: 100%; height: 61px; margin-bottom: 8px; opacity: 1; border-radius: 6px; background: rgba(248, 249, 250, 1); display: flex; flex-direction: column; }
        .mh-card:last-child { margin-bottom: 0; }
        .mh-card-top { width: 100%; height: 26px; border-radius: 6px 6px 0px 0px; background: rgba(236, 238, 242, 1); display: flex; align-items: center; padding: 0 10px; }
        .mh-card-icon { width: 14px !important; height: 14px !important; margin: 0 6px 0 0 !important; flex-shrink: 0 !important; }
        .mh-card-title { font-size: 12px !important; color: #000 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; line-height: 1 !important; margin: 0 !important; padding: 0 !important; font-weight: normal !important; }
        .mh-card-bottom { display: flex; justify-content: space-between; align-items: center; height: 35px; padding: 0 10px; }
        .mh-info-group { display: flex; gap: 8px; align-items: center; margin: 0 !important; padding: 0 !important; }
        .mh-tag-dur { width: 51px !important; height: 20px !important; opacity: 1 !important; background: rgba(128, 128, 128, 1) !important; color: white !important; border-radius: 4px !important; font-size: 11px !important; font-variant-numeric: tabular-nums !important; display: flex !important; justify-content: center !important; align-items: center !important; line-height: 1 !important; padding: 0 !important; margin: 0 !important; }
        .mh-tag-live { background: #e03131 !important; }
        .mh-tag-txt { font-size: 12px !important; color: #000 !important; font-variant-numeric: tabular-nums !important; line-height: 1 !important; margin: 0 !important; padding: 0 !important; }
        .mh-actions { display: flex; gap: 6px; margin: 0 !important; padding: 0 !important; }
        .mh-btn { width: 36px !important; height: 20px !important; border: none !important; border-radius: 4px !important; font-size: 11px !important; cursor: pointer !important; display: flex !important; justify-content: center !important; align-items: center !important; padding: 0 !important; margin: 0 !important; font-family: inherit !important; font-weight: 500 !important; transition: all 0.2s ease !important; line-height: 1 !important; }
        .mh-btn-copy { background: #e9ecef !important; color: #495057 !important; }
        .mh-btn-copy:hover { background: #dee2e6 !important; }
        .mh-btn-ytdlp { background: rgba(45, 33, 183, 0.8) !important; color: white !important; }
        .mh-btn-ytdlp:hover { filter: brightness(1.2) !important; }
    `;

    const EXT_MAP = new Map([
        ["mp4", true], ["mp3", true], ["webm", true], ["ogg", true], ["m4a", true],
        ["wav", true], ["m3u8", true], ["flv", true], ["aac", true],
        ["mkv", true], ["avi", true], ["mov", true], ["flac", true], ["mka", true]
    ]);

    const MIME_MAP = new Map([
        ["audio/*", true], ["video/*", true],
        ["application/vnd.apple.mpegurl", true], ["application/x-mpegurl", true],
        ["application/dash+xml", true],
        ["video/x-matroska", true], ["video/x-msvideo", true], ["video/quicktime", true],
        ["audio/flac", true], ["audio/x-matroska", true]
    ]);

    function isKnownYtDlpSite() {
        const hostname = window.location.hostname;
        return YTDLP_SUPPORTED_SITES.some(site => hostname.includes(site));
    }

    function formatDuration(seconds) {
        if (seconds === Infinity) return "直播流";
        if (!seconds || isNaN(seconds) || seconds <= 0) return "";
        const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
        const pad = (n) => n.toString().padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }

    function getResolution(width, height) {
        if (!width || !height) return "";
        const min = Math.min(width, height);
        if (min >= 2160) return "4K"; if (min >= 1440) return "2K";
        if (min >= 1080) return "1080P"; if (min >= 720) return "720P";
        if (min >= 480) return "480P"; if (min >= 360) return "360P";
        if (min >= 250) return "250P"; if (min >= 240) return "240P";
        return `${width}x${height}`;
    }

    function guessResolutionFromUrl(url) {
        if (!url) return "";
        const match = url.match(/(?:-|_|\/|@)(\d{3,4})p?(?:\/|_|-|\?|&|\.|$)/i);
        if (match) {
            const res = parseInt(match[1]);
            if ([240, 250, 360, 480, 720, 1080, 1440, 2160].includes(res)) {
                if (res === 2160) return "4K"; if (res === 1440) return "2K";
                return `${res}P`;
            }
        }
        if (/(?:-|_|\/|@)(4k)(?:\/|_|-|\?|&|\.|$)/i.test(url)) return "4K";
        if (/(?:-|_|\/|@)(2k)(?:\/|_|-|\?|&|\.|$)/i.test(url)) return "2K";
        return "";
    }

    function requestText(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url: url, timeout: 8000,
                onload: (res) => (res.status >= 200 && res.status < 300) ? resolve(res.responseText) : reject(`HTTP Error: ${res.status}`),
                onerror: (err) => reject(err),
                ontimeout: () => reject("Timeout")
            });
        });
    }

    function detectFormat(url, contentType) {
        try {
            const urlObj = new URL(url, document.baseURI);
            const path = urlObj.pathname.toLowerCase(), params = urlObj.search.toLowerCase();
            const parts = path.split('.');

            if (parts.length > 1) {
                const ext = parts.pop().split('?')[0];
                if (EXT_MAP.has(ext)) return { type: null, ext: ext };
                if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'svg'].includes(ext)) return null;
            }

            if (params.includes('m3u8') || params.includes('playlist.m3u') || path.includes('/hls/')) {
                return { type: 'application/vnd.apple.mpegurl', ext: 'm3u8' };
            }

            if (contentType) {
                const type = contentType.split(';')[0].trim().toLowerCase();
                if (type.startsWith('image/')) return null;
                if (MIME_MAP.has(type) || MIME_MAP.has(`${type.split('/')[0]}/*`)) return { type: type, ext: null };
            }
        } catch(e) {}
        return null;
    }

    function getMediaType(format) {
        if (format.ext) return ['mp3', 'm4a', 'wav', 'ogg', 'aac', 'flac', 'mka'].includes(format.ext) ? 'audio' : 'video';
        return (format.type && format.type.includes('audio')) ? 'audio' : 'video';
    }

    function probeMediaMetadata(url, type) {
        return new Promise((resolve) => {
            const media = document.createElement(type === 'video' ? 'video' : 'audio');
            media.preload = 'metadata'; media.muted = true;
            const cleanup = (result) => {
                media.removeAttribute('src'); media.load(); media.remove();
                resolve(result);
            };
            const timeout = setTimeout(() => cleanup(null), 5000);
            media.onloadedmetadata = () => {
                clearTimeout(timeout);
                cleanup({
                    duration: isNaN(media.duration) ? 0 : media.duration,
                    width: media.videoWidth || 0, height: media.videoHeight || 0
                });
            };
            media.onerror = () => { clearTimeout(timeout); cleanup(null); };
            media.src = url;
        });
    }

    async function parseM3u8(url, visited = new Set(), inheritedMeta = { width: 0, height: 0 }) {
        if (visited.has(url)) return null;
        visited.add(url);
        try {
            const text = await requestText(url);
            let duration = 0, bestVariant = null, maxBandwidth = 0;
            const lines = text.split('\n').map(l => l.trim());
            let isMaster = false, isLive = !text.includes('#EXT-X-ENDLIST');

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    isMaster = true;
                    const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/), resMatch = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
                    const bandwidth = bwMatch ? parseInt(bwMatch[1]) : 0;
                    let urlLine = "";
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j] && !lines[j].startsWith("#")) { urlLine = lines[j]; break; }
                    }
                    if (urlLine && bandwidth > maxBandwidth) {
                        maxBandwidth = bandwidth;
                        bestVariant = {
                            url: new URL(urlLine, url).href,
                            width: resMatch ? parseInt(resMatch[1]) : inheritedMeta.width,
                            height: resMatch ? parseInt(resMatch[2]) : inheritedMeta.height
                        };
                    }
                }
            }

            if (isMaster && bestVariant) return await parseM3u8(bestVariant.url, visited, bestVariant) || bestVariant;

            const regex = /#EXTINF:\s*([\d\.]+)/g;
            let match, hasSegments = false;
            while ((match = regex.exec(text)) !== null) { hasSegments = true; duration += parseFloat(match[1]); }

            if (!hasSegments && !isMaster) return inheritedMeta;

            return {
                duration: isLive ? Infinity : duration,
                width: inheritedMeta.width, height: inheritedMeta.height,
                resolution: getResolution(inheritedMeta.width, inheritedMeta.height)
            };
        } catch (e) { return inheritedMeta; }
    }

    function handleMediaFound(media) {
        if (IS_TOP) addMedia(media);
        else {
            delete media.title;
            window.top.postMessage({ type: 'MH_ADD_MEDIA', media: media }, '*');
        }
    }

    function addMedia(media) {
        if (!media.title) media.title = document.title || "未知媒体资源";
        const existingIndex = STATE.mediaList.findIndex(m => m.url === media.url);

        if (existingIndex !== -1) {
            const existing = STATE.mediaList[existingIndex];
            if ((!existing.duration && media.duration) || (!existing.resolution && media.resolution)) {
                if (!media.isPageUrl && (!media.duration || media.duration <= 3)) {
                    STATE.mediaList.splice(existingIndex, 1);
                    if (STATE.isPopupOpen) renderCards();
                    return;
                }
                STATE.mediaList[existingIndex] = { ...existing, ...media };
                if (STATE.isPopupOpen) renderCards();
            }
            return;
        }

        STATE.sniffedUrls.add(media.url);

        if (!media.isPageUrl && (!media.duration || media.duration <= 3)) return;

        STATE.mediaList.push(media);
        showButton();
        if (STATE.isPopupOpen) renderCards();
    }

    function extractUrlsFromTextAsync(text) {
        if (!text || typeof text !== 'string' || text.length > 5000000) return;

        const schedule = window.requestIdleCallback || window.setTimeout;
        schedule(() => {
            const regex = /https?:\/\/[^"'\s<>\{\}\[\]\\]+\.(?:m3u8|mp4|flv|m4a)(?:\?[^"'\s<>\{\}\[\]\\]*)?/gi;
            let match;
            while ((match = regex.exec(text)) !== null) {
                let extractedUrl = match[0];
                if (!STATE.sniffedUrls.has(extractedUrl)) {
                    checkNetworkResource(extractedUrl, null);
                }
            }
        }, { timeout: 2000 });
    }

    function isTextualContentType(contentType) {
        if (!contentType) return false;
        const type = contentType.toLowerCase();
        return type.includes('text/') || type.includes('application/json') || type.includes('application/javascript');
    }

    function scanDOM() {
        let maxArea = 0;
        let activeVideoRes = '';

        document.querySelectorAll('video, audio, source').forEach(el => {
            if (el.tagName === 'VIDEO' && el.videoWidth && el.videoHeight) {
                const area = el.videoWidth * el.videoHeight;
                if (area > maxArea) {
                    maxArea = area;
                    activeVideoRes = getResolution(el.videoWidth, el.videoHeight);
                }
            }

            let src = el.src || el.currentSrc || el.getAttribute('src');
            if (!src || src.startsWith('blob:')) return;
            try { src = new URL(src, document.baseURI).href; } catch(e) { return; }

            if (DOM_CACHE.get(el) === src) return;
            DOM_CACHE.set(el, src);

            const format = detectFormat(src);
            if (!format) return;

            const isVideo = el.tagName === 'VIDEO' || (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'VIDEO');
            const targetEl = el.tagName === 'SOURCE' ? el.parentElement : el;

            const createMediaItem = () => {
                let isGuessed = false;
                let res = (isVideo && targetEl && targetEl.videoWidth) ? getResolution(targetEl.videoWidth, targetEl.videoHeight) : '';
                if (!res) {
                    res = guessResolutionFromUrl(src);
                    if (res) isGuessed = true;
                }

                return {
                    url: src, type: isVideo ? 'video' : 'audio', ext: format.ext || (isVideo ? 'mp4' : 'mp3'),
                    duration: (targetEl && targetEl.duration === Infinity) ? Infinity : ((targetEl && targetEl.duration) || 0),
                    width: targetEl ? (targetEl.videoWidth || 0) : 0,
                    height: targetEl ? (targetEl.videoHeight || 0) : 0,
                    resolution: res,
                    isUrlGuessed: isGuessed
                };
            };

            if (targetEl && targetEl.readyState >= 1) {
                handleMediaFound(createMediaItem());
            } else if (targetEl) {
                targetEl.addEventListener('loadedmetadata', () => handleMediaFound(createMediaItem()), { once: true });
            }
        });

        if (activeVideoRes) {
            let updated = false;
            STATE.mediaList.forEach(media => {
                if (media.type === 'video') {
                    if (!media.resolution || media.isUrlGuessed || media.isDomSynced) {
                        if (media.resolution !== activeVideoRes) {
                            media.resolution = activeVideoRes;
                            media.isDomSynced = true;
                            media.isUrlGuessed = false;
                            updated = true;
                        }
                    }
                }
            });
            if (updated && STATE.isPopupOpen) renderCards();
        }
    }

    function setupNetworkSniffing() {
        const originalFetch = window.fetch;
        window.fetch = async function (input, init) {
            const url = (typeof input === 'string') ? input : (input instanceof Request ? input.url : '');
            checkNetworkResource(url, null);

            try {
                const response = await originalFetch.apply(this, arguments);
                const clone = response.clone();
                const cType = clone.headers ? clone.headers.get('content-type') : null;
                checkNetworkResource(url, cType);

                if (isTextualContentType(cType)) {
                    clone.text().then(text => extractUrlsFromTextAsync(text)).catch(()=>{});
                }
                return response;
            } catch (e) { throw e; }
        };

        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this._url = url;
            checkNetworkResource(url, null);
            return originalXHROpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (body) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4) {
                    const cType = this.getResponseHeader('content-type');
                    checkNetworkResource(this.responseURL || this._url, cType);
                    try {
                        if ((this.responseType === '' || this.responseType === 'text') && isTextualContentType(cType)) {
                            extractUrlsFromTextAsync(this.responseText);
                        }
                    } catch(e) {}
                }
            });
            return originalXHRSend.apply(this, arguments);
        };
    }

    async function checkNetworkResource(url, contentType) {
        if (!url) return;
        const lowerUrl = url.toLowerCase();

        if (lowerUrl.includes('.ts') || lowerUrl.includes('.m4s') || lowerUrl.includes('/segment/') ||
            lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) return;

        const isKnown = STATE.sniffedUrls.has(url);
        const format = detectFormat(url, contentType);
        if (!format) return;

        const mediaItem = {
            url: url, type: getMediaType(format), ext: format.ext || (format.type ? format.type.split('/')[1] : 'unknown'),
            duration: 0, width: 0, height: 0, resolution: '', isUrlGuessed: false
        };

        if (isKnown && mediaItem.ext !== 'm3u8') return;

        if (mediaItem.ext === 'm3u8') {
            const metadata = await parseM3u8(url);
            if (metadata) {
                mediaItem.duration = metadata.duration; mediaItem.width = metadata.width;
                mediaItem.height = metadata.height; mediaItem.resolution = metadata.resolution;
            }
        } else if (!isKnown) {
            const meta = await probeMediaMetadata(url, mediaItem.type);
            if (meta) {
                mediaItem.duration = meta.duration; mediaItem.width = meta.width;
                mediaItem.height = meta.height; mediaItem.resolution = getResolution(meta.width, meta.height);
            }
        }

        if (!mediaItem.resolution) {
            mediaItem.resolution = guessResolutionFromUrl(url);
            if (mediaItem.resolution) mediaItem.isUrlGuessed = true;
        }

        handleMediaFound(mediaItem);
    }

    function initUI() {
        if (!IS_TOP) return;
        const style = document.createElement('style'); style.textContent = STYLES; document.head.appendChild(style);
        const root = document.createElement('div'); root.id = 'mh-root'; root.style.display = 'none'; document.body.appendChild(root);
        const btn = document.createElement('div'); btn.id = 'mh-float-btn';
        btn.innerHTML = `<img src="${ICONS.logo}"><span>媒体猎手</span>`;
        btn.onclick = togglePopup; root.appendChild(btn);

        const popup = document.createElement('div'); popup.id = 'mh-popup';
        popup.innerHTML = `
            <div id="mh-header"><h3>MediaHunter 媒体猎手</h3><img id="mh-close-btn" src="${ICONS.close}"></div>
            <div id="mh-content"></div>
        `;
        root.appendChild(popup); popup.querySelector('#mh-close-btn').onclick = togglePopup;

        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'MH_ADD_MEDIA') addMedia(event.data.media);
        });
    }

    function showButton() {
        if (!IS_TOP || STATE.hasButtonShown) return;
        const root = document.getElementById('mh-root');
        if (root) { root.style.display = 'block'; STATE.hasButtonShown = true; }
    }

    function togglePopup() {
        const btn = document.getElementById('mh-float-btn'), popup = document.getElementById('mh-popup');
        STATE.isPopupOpen = !STATE.isPopupOpen;
        btn.style.display = STATE.isPopupOpen ? 'none' : 'flex';
        popup.style.display = STATE.isPopupOpen ? 'flex' : 'none';
        if (STATE.isPopupOpen) renderCards();
    }

    function renderCards() {
        const container = document.getElementById('mh-content');
        if (!container) return;
        container.innerHTML = '';

        // 🌟 4.5 核心升级：增加强制 M3U8 置顶规则排序
        const sortedList = [...STATE.mediaList].reverse().sort((a, b) => {
            const aIsM3u8 = a.ext === 'm3u8';
            const bIsM3u8 = b.ext === 'm3u8';
            if (aIsM3u8 && !bIsM3u8) return -1;
            if (!aIsM3u8 && bIsM3u8) return 1;
            return 0; // 其他类型维持相对的反转入栈顺序
        });

        sortedList.forEach(media => {
            const card = document.createElement('div');
            card.className = media.isPageUrl ? 'mh-card mh-card-page' : 'mh-card';
            const icon = media.type === 'video' ? ICONS.video : ICONS.audio;

            let durationStr = !media.isPageUrl ? formatDuration(media.duration) : '';
            let durationHtml = durationStr === "直播流" ? `<span class="mh-tag-dur mh-tag-live">直播</span>` : (durationStr ? `<span class="mh-tag-dur">${durationStr}</span>` : `<span class="mh-tag-dur">--:--</span>`);
            let resHtml = `<span class="mh-tag-txt">${media.resolution || '--'}</span>`;
            let extHtml = `<span class="mh-tag-txt">.${media.ext.toUpperCase()}</span>`;

            card.innerHTML = `
                <div class="mh-card-top">
                    <img class="mh-card-icon" src="${icon}">
                    <div class="mh-card-title" title="${media.title}">${media.title}</div>
                </div>
                <div class="mh-card-bottom">
                    <div class="mh-info-group">${durationHtml}${resHtml}${extHtml}</div>
                    <div class="mh-actions">
                        <button class="mh-btn mh-btn-copy" title="单击复制直链，双击复制yt-dlp命令">复制</button>
                        <button class="mh-btn mh-btn-ytdlp">下载</button>
                    </div>
                </div>
            `;

            const btnCopy = card.querySelector('.mh-btn-copy');
            let clickTimer = null;

            btnCopy.onclick = (e) => {
                clearTimeout(clickTimer);
                clickTimer = setTimeout(() => {
                    GM_setClipboard(media.url);
                    e.target.innerText = "成功";
                    setTimeout(() => e.target.innerText = "复制", 2000);
                }, 250);
            };

            btnCopy.ondblclick = (e) => {
                clearTimeout(clickTimer);

                let targetUrl = (isKnownYtDlpSite() || media.isPageUrl) ? window.location.href : media.url;
                let safeTitle = media.title.replace(/[\r\n"'|&<>*:?/\\]/g, ' ').trim() || "未命名媒体";
                const currentUrl = window.location.href;

                const asciiTargetUrl = targetUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                const asciiCurrentUrl = currentUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));

                // 保留了此前要求的 D:\00暂存\02媒体猎手 目录和 referer 配置
                const cmdArgs = `"${asciiTargetUrl}" --referer "${asciiCurrentUrl}" -o "D:\\00暂存\\02媒体猎手\\${safeTitle}_%(id)s.%(ext)s"`;

                GM_setClipboard(`yt-dlp ${cmdArgs}`);
                e.target.innerText = "Copied";
                setTimeout(() => e.target.innerText = "复制", 2000);
                window.getSelection().removeAllRanges();
            };

            card.querySelector('.mh-btn-ytdlp').onclick = (e) => {
                let targetUrl = (isKnownYtDlpSite() || media.isPageUrl) ? window.location.href : media.url;
                let safeTitle = media.title.replace(/[\r\n"'|&<>*:?/\\]/g, ' ').trim() || "未命名媒体";
                const currentUrl = window.location.href;

                const asciiTargetUrl = targetUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                const asciiCurrentUrl = currentUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));

                const protocolTargetUrl = asciiTargetUrl.replace(/%/g, '%25');
                const protocolCurrentUrl = asciiCurrentUrl.replace(/%/g, '%25');

                const cmdArgs = `"${protocolTargetUrl}" --referer "${protocolCurrentUrl}" -o "D:\\00暂存\\02媒体猎手\\${safeTitle}_%(id)s.%(ext)s"`;

                const protocolUrl = `ytdlp:${cmdArgs}`;

                const a = document.createElement('a');
                a.href = protocolUrl;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => document.body.removeChild(a), 1500);

                const originalText = e.target.innerText;
                e.target.innerText = "成功";
                setTimeout(() => e.target.innerText = originalText, 2000);
            };

            container.appendChild(card);
        });
    }

    function init() {
        setupNetworkSniffing();

        setTimeout(() => {
            extractUrlsFromTextAsync(document.documentElement.innerHTML);
        }, 1500);

        setInterval(scanDOM, 2000);

        if (IS_TOP) {
            initUI();
            if (isKnownYtDlpSite()) {
                addMedia({
                    url: window.location.href, type: 'video', ext: 'PAGE', duration: 0, width: 0, height: 0,
                    resolution: '原生支持', title: `${document.title || window.location.hostname}`, isPageUrl: true
                });
                showButton();
            }
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();