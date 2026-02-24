// ==UserScript==
// @name         MediaHunter 媒体猎手 (解析增强+yt-dlp严格传参版)
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  Capture video and audio resources. Enhanced parsing. Strictly conform to yt-dlp command line arguments format for URLProtocol passing.
// @author       MediaHunterV2
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

    const IS_TOP = window === window.top;

    // yt-dlp 原生支持良好的知名站点域名列表 (可按需自行添加)
    const YTDLP_SUPPORTED_SITES = [
        'youtube.com', 'youtu.be',
        'bilibili.com',
        'twitter.com', 'x.com',
        'twitch.tv',
        'tiktok.com',
        'vimeo.com',
        'instagram.com',
        'weibo.com'
    ];

    const ICONS = {
        logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSI1IDMgMTkgMTIgNSAyMSA1IDMiPjwvcG9seWdvbj48L3N2Zz4=",
        video: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDA3YmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiByeD0iMi4xOCIgcnk9IjIuMTgiPjwvcmVjdD48bGluZSB4MT0iNyIgeTE9IjIiIHgyPSI3IiB5Mj0iMjIiPjwvbGluZT48bGluZSB4MT0iMTciIHkxPSIyIiB4Mj0iMTciIHkyPSIyMiI+PC9saW5lPjxsaW5lIHgxPSIyIiB5MT0iMTIiIHgyPSIyMiIgeTI9IjEyIj48L2xpbmU+PHBvbHlnb24gcG9pbnRzPSIyIDcgNyA3IDcgMTcgMiAxNyAyIDciPjwvcG9seWdvbj48cG9seWdvbiBwb2ludHM9IjE3IDcgMjIgNyAyMiAxNyAxNyAxNyAxNyA3Ij48L3BvbHlnb24+PC9zdmc+",
        audio: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDA3YmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTkgMThWNWw5LTJ2MTNsLTIgMXYtOGwtNSAxIi8+PGNpcmNsZSBjeD0iNiIgY3k9IjE5IiByPSIzIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxOSIgcj0iMyIvPjwvc3ZnPg==",
        close: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGxpbmUgeDE9IjE4IiB5MT0iNiIgeDI9IjYiIHkyPSIxOCI+PC9saW5lPjxsaW5lIHgxPSI2IiB5MT0iNiIgeDI9IjE4IiB5Mj0iMTgiPjwvbGluZT48L3N2Zz4="
    };

    const STYLES = `
        #mh-root { font-family: 'Segoe UI', sans-serif; z-index: 2147483647; position: fixed; bottom: 20px; right: 20px; }
        #mh-float-btn { display: flex; align-items: center; background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 10px 16px; border-radius: 50px; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 123, 255, 0.4); transition: transform 0.2s; user-select: none; }
        #mh-float-btn:hover { transform: translateY(-2px); }
        #mh-float-btn img { width: 20px; height: 20px; margin-right: 8px; }
        #mh-float-btn span { font-size: 14px; font-weight: 600; }
        #mh-popup { position: absolute; bottom: 0; right: 0; width: 340px; background: #f8f9fa; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); display: none; flex-direction: column; border: 1px solid #e9ecef; }
        #mh-header { background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
        #mh-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
        #mh-close-btn { cursor: pointer; width: 20px; height: 20px; opacity: 0.8; }
        #mh-close-btn:hover { opacity: 1; }
        #mh-content { max-height: 350px; overflow-y: auto; padding: 10px; }
        #mh-content::-webkit-scrollbar { width: 6px; }
        #mh-content::-webkit-scrollbar-thumb { background: #cbd5e0; border-radius: 3px; }
        .mh-card { background: white; border-radius: 8px; padding: 12px; margin-bottom: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); border: 1px solid #f1f3f5; }
        .mh-card-page { border: 1px solid #007bff; background: #f8fbff; }
        .mh-card-top { display: flex; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #f1f3f5; padding-bottom: 8px; }
        .mh-card-icon { width: 24px; height: 24px; margin-right: 10px; flex-shrink: 0; }
        .mh-card-title { font-size: 13px; font-weight: 600; color: #343a40; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mh-card-bottom { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #6c757d; }
        .mh-info-group { display: flex; gap: 6px; flex-wrap: wrap; max-width: 55%; }
        .mh-tag { background: #e9ecef; padding: 2px 6px; border-radius: 4px; }
        .mh-tag-live { background: #ffe3e3; color: #e03131; font-weight: bold; }
        .mh-actions { display: flex; gap: 6px; }
        .mh-btn { border: none; padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; font-weight: 500; }
        .mh-btn-copy { background: #e7f5ff; color: #007bff; }
        .mh-btn-copy:hover { background: #d0ebff; }
        .mh-btn-ytdlp { background: #e3f2fd; color: #0d47a1; }
        .mh-btn-ytdlp:hover { background: #bbdefb; }
    `;

    const EXT_MAP = new Map([
        ["mp4", true], ["mp3", true], ["webm", true], ["ogg", true], ["m4a", true],
        ["wav", true], ["m3u8", true], ["flv", true], ["aac", true]
    ]);
    const MIME_MAP = new Map([
        ["audio/*", true], ["video/*", true],
        ["application/vnd.apple.mpegurl", true], ["application/x-mpegurl", true],
        ["application/dash+xml", true]
    ]);

    // --- Utilities ---
    function isKnownYtDlpSite() {
        const hostname = window.location.hostname;
        return YTDLP_SUPPORTED_SITES.some(site => hostname.includes(site));
    }

    function formatDuration(seconds) {
        if (seconds === Infinity) return "直播流";
        if (!seconds || isNaN(seconds) || seconds <= 0) return "未知时长";
        const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
        const pad = (n) => n.toString().padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }

    function getResolution(width, height) {
        if (!width || !height) return "";
        const min = Math.min(width, height);
        if (min >= 2160) return "4K"; if (min >= 1440) return "2K";
        if (min >= 1080) return "1080P"; if (min >= 720) return "720P";
        if (min >= 480) return "480P"; return `${width}x${height}`;
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
                const ext = parts.pop();
                if (EXT_MAP.has(ext)) return { type: null, ext: ext };
            }
            if (params.includes('m3u8') || params.includes('playlist.m3u') || path.includes('/hls/')) {
                return { type: 'application/vnd.apple.mpegurl', ext: 'm3u8' };
            }
            if (contentType) {
                const type = contentType.split(';')[0].trim().toLowerCase();
                if (MIME_MAP.has(type) || MIME_MAP.has(`${type.split('/')[0]}/*`)) return { type: type, ext: null };
            }
        } catch(e) {}
        return null;
    }

    function getMediaType(format) {
        if (format.ext) return ['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(format.ext) ? 'audio' : 'video';
        return (format.type && format.type.includes('audio')) ? 'audio' : 'video';
    }

    function probeMediaMetadata(url, type) {
        return new Promise((resolve) => {
            const media = document.createElement(type === 'video' ? 'video' : 'audio');
            media.preload = 'metadata';
            media.muted = true;

            const timeout = setTimeout(() => {
                media.removeAttribute('src'); media.load();
                resolve(null);
            }, 5000);

            media.onloadedmetadata = () => {
                clearTimeout(timeout);
                resolve({
                    duration: (isNaN(media.duration) || media.duration === Infinity) ? 0 : media.duration,
                    width: media.videoWidth || 0,
                    height: media.videoHeight || 0
                });
                media.removeAttribute('src'); media.load();
            };

            media.onerror = () => {
                clearTimeout(timeout);
                resolve(null);
            };

            media.src = url;
        });
    }

    async function parseM3u8(url, visited = new Set(), inheritedMeta = { width: 0, height: 0 }) {
        if (visited.has(url)) return null;
        visited.add(url);

        try {
            const text = await requestText(url);
            let duration = 0;
            let bestVariant = null, maxBandwidth = 0;
            const lines = text.split('\n').map(l => l.trim());

            let isMaster = false;
            let isLive = !text.includes('#EXT-X-ENDLIST');

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
                    isMaster = true;
                    const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                    const resMatch = lines[i].match(/RESOLUTION=(\d+)x(\d+)/);
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

            if (isMaster && bestVariant) {
                const subMeta = await parseM3u8(bestVariant.url, visited, bestVariant);
                return subMeta || bestVariant;
            }

            const regex = /#EXTINF:\s*([\d\.]+)/g;
            let match;
            let hasSegments = false;
            while ((match = regex.exec(text)) !== null) {
                hasSegments = true;
                duration += parseFloat(match[1]);
            }

            if (!hasSegments && !isMaster) return inheritedMeta;

            return {
                duration: isLive ? Infinity : duration,
                width: inheritedMeta.width,
                height: inheritedMeta.height,
                resolution: getResolution(inheritedMeta.width, inheritedMeta.height)
            };
        } catch (e) { return inheritedMeta; }
    }

    // --- Core Data Handlers ---
    function handleMediaFound(media) {
        if (IS_TOP) addMedia(media);
        else {
            delete media.title;
            window.top.postMessage({ type: 'MH_ADD_MEDIA', media: media }, '*');
        }
    }

    function addMedia(media) {
        if (!media.title) {
            media.title = document.title || "未知媒体资源";
        }

        const existingIndex = STATE.mediaList.findIndex(m => m.url === media.url);
        if (existingIndex !== -1) {
            const existing = STATE.mediaList[existingIndex];
            if ((!existing.duration && media.duration) || (!existing.resolution && media.resolution)) {
                STATE.mediaList[existingIndex] = { ...existing, ...media };
                if (STATE.isPopupOpen) renderCards();
            }
            return;
        }

        STATE.sniffedUrls.add(media.url);
        STATE.mediaList.push(media);
        showButton();
        if (STATE.isPopupOpen) renderCards();
    }

    function scanDOM() {
        const elements = document.querySelectorAll('video, audio, source');
        elements.forEach(el => {
            let src = el.src || el.currentSrc || el.getAttribute('src');
            if (!src || src.startsWith('blob:')) return;
            try { src = new URL(src, document.baseURI).href; } catch(e) { return; }

            const format = detectFormat(src);
            if (!format) return;

            const isVideo = el.tagName === 'VIDEO' || (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'VIDEO');
            const mediaItem = {
                url: src, type: isVideo ? 'video' : 'audio', ext: format.ext || (isVideo ? 'mp4' : 'mp3'),
                duration: el.duration === Infinity ? Infinity : (el.duration || 0),
                width: el.videoWidth || 0, height: el.videoHeight || 0,
                resolution: isVideo ? getResolution(el.videoWidth, el.videoHeight) : ''
            };

            if (el.readyState >= 1) handleMediaFound(mediaItem);
            else el.addEventListener('loadedmetadata', () => handleMediaFound(mediaItem), { once: true });
        });
    }

    function setupNetworkSniffing() {
        const originalFetch = window.fetch;
        window.fetch = async function (input, init) {
            const url = (typeof input === 'string') ? input : (input instanceof Request ? input.url : '');
            const response = await originalFetch.apply(this, arguments);
            const clone = response.clone();
            clone.headers && checkNetworkResource(url, clone.headers.get('content-type'));
            return response;
        };

        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this._url = url; return originalXHROpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (body) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4) checkNetworkResource(this.responseURL || this._url, this.getResponseHeader('content-type'));
            });
            return originalXHRSend.apply(this, arguments);
        };
    }

    async function checkNetworkResource(url, contentType) {
        if (!url) return;
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.includes('.ts') || lowerUrl.includes('.m4s') || lowerUrl.includes('/segment/')) return;

        const isKnown = STATE.sniffedUrls.has(url);

        const format = detectFormat(url, contentType);
        if (!format) return;

        const mediaItem = {
            url: url, type: getMediaType(format), ext: format.ext || (format.type ? format.type.split('/')[1] : 'unknown'),
            duration: 0, width: 0, height: 0, resolution: ''
        };

        if (isKnown && mediaItem.ext !== 'm3u8') return;

        if (mediaItem.ext === 'm3u8') {
            const metadata = await parseM3u8(url);
            if (metadata) {
                mediaItem.duration = metadata.duration;
                mediaItem.width = metadata.width;
                mediaItem.height = metadata.height;
                mediaItem.resolution = metadata.resolution;
            }
        } else if (!isKnown) {
            const meta = await probeMediaMetadata(url, mediaItem.type);
            if (meta) {
                mediaItem.duration = meta.duration;
                mediaItem.width = meta.width;
                mediaItem.height = meta.height;
                mediaItem.resolution = getResolution(meta.width, meta.height);
            }
        }

        handleMediaFound(mediaItem);
    }

    // --- UI Rendering ---
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

        [...STATE.mediaList].reverse().forEach(media => {
            const card = document.createElement('div');
            card.className = media.isPageUrl ? 'mh-card mh-card-page' : 'mh-card';
            const icon = media.type === 'video' ? ICONS.video : ICONS.audio;

            let infoTags = '';

            if (!media.isPageUrl) {
                const durationStr = formatDuration(media.duration);
                if (durationStr === "直播流") {
                    infoTags += `<span class="mh-tag mh-tag-live">● 直播</span>`;
                } else if (media.duration > 0) {
                    infoTags += `<span class="mh-tag">${durationStr}</span>`;
                }
            }

            if (media.resolution) infoTags += `<span class="mh-tag">${media.resolution}</span>`;
            infoTags += `<span class="mh-tag">${media.ext.toUpperCase()}</span>`;

            card.innerHTML = `
                <div class="mh-card-top"><img class="mh-card-icon" src="${icon}"><div class="mh-card-title" title="${media.title}">${media.title}</div></div>
                <div class="mh-card-bottom">
                    <div class="mh-info-group">${infoTags}</div>
                    <div class="mh-actions">
                        <button class="mh-btn mh-btn-copy">复制链接</button>
                        <button class="mh-btn mh-btn-ytdlp" title="发送至 yt-dlp">yt-dlp</button>
                    </div>
                </div>
            `;

            card.querySelector('.mh-btn-copy').onclick = (e) => {
                GM_setClipboard(media.url);
                e.target.innerText = "已复制!";
                setTimeout(() => e.target.innerText = "复制链接", 2000);
            };

            card.querySelector('.mh-btn-ytdlp').onclick = (e) => {
                // 1. 获取目标 URL
                let targetUrl = (isKnownYtDlpSite() || media.isPageUrl) ? window.location.href : media.url;

                // 2. 清理文件名，过滤掉所有可能导致 Windows 文件系统报错或破坏命令行的非法字符
                let safeTitle = media.title.replace(/[\r\n"'|&<>*:?/\\]/g, ' ').trim() || "未命名媒体";

                // 3. 【核心修正】完全按照 yt-dlp 原生参数规范生成命令行字符串
                // 格式为: "网址" -o "保存路径\文件标题_%(id)s.%(ext)s"
                // yt-dlp 的 %(id)s 和 %(ext)s 可以让它自动处理后缀和防重名
                const cmdArgs = `"${targetUrl}" -o "D:\\00暂存\\02媒体猎手\\${safeTitle}_%(id)s.%(ext)s"`;

                // 4. 拼接协议唤起格式。这里只用 `ytdlp:` ，不加 `//`，彻底防止浏览器吞噬双斜杠
                const protocolUrl = `ytdlp:${cmdArgs}`;

                // 5. 创建隐藏 iframe 唤醒本地协议
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = protocolUrl;
                document.body.appendChild(iframe);

                // 6. 唤醒后清理 DOM
                setTimeout(() => document.body.removeChild(iframe), 1500);

                // 7. UI 反馈
                const originalText = e.target.innerText;
                e.target.innerText = "已调用!";
                setTimeout(() => e.target.innerText = originalText, 2000);
            };

            container.appendChild(card);
        });
    }

    function init() {
        setupNetworkSniffing();
        setInterval(scanDOM, 2000);
        if (IS_TOP) {
            initUI();

            if (isKnownYtDlpSite()) {
                addMedia({
                    url: window.location.href,
                    type: 'video',
                    ext: 'PAGE',
                    duration: 0,
                    width: 0,
                    height: 0,
                    resolution: '原生支持',
                    title: `�  ${document.title || window.location.hostname}`,
                    isPageUrl: true
                });
                showButton();
            }
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();