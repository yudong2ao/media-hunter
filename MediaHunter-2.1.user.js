// ==UserScript==
// @name         MediaHunter (媒体猎手)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  【增强版】通过拦截网络请求与JS原生方法，深度嗅探并捕获网页中的视频和音频资源，提供真实的媒体地址复制功能。
// @author       Gemini
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- Base64 编码的图标 ---
    const ICONS = {
        main: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSIyMyA3IDQgNyA0IDE3IDIzIDE3IDIzIDciPjwvcG9seWdvbj48cG9seWdvbiBwb2ludHM9IjMgNyAxIDggMyA5IDMgNyI+PC9wb2x5Z29uPjxjaXJjbGUgY3g9IjE5IiBjeT0iMTIiIHI9IjEiPjwvY2lyY2xlPjxjaXJjbGUgY3g9IjE0IiBjeT0iMTIiIHI9IjEiPjwvY2lyY2xlPjxjaXJjbGUgY3g9IjkiIGN5PSIxMiIgcj0iMSI+PC9jaXJjbGU+PC9zdmc+',
        video: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWNsYXBwZXItYm9hcmQiPjxwYXRoIGQ9Ik00IDRiMTZoMTZ2MTZINGEyIDIgMCAwIDEtMi0yVjZhMiAyIDAgMCAxIDItMnoiLz48cGF0aCBkPSJtOCAxMiAxLjg4IDEuODgiLz48cGF0aCBkPSJtMTIgOCAxLjg4IDEuODgiLz48cGF0aCBkPSJtMTIgMTYgMS44OC0xLjg4Ii8+PHBhdGggZD0ibTE2IDEyLTEuODgtMS44OCIvPjwvc3ZnPg==',
        audio: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLW11c2ljIj48cGF0aCBkPSJNMTEgMTkgYTIgMiAwIDEgMCAwLTQgMiAyIDAgMCAwIDAgNHoiLz48cGF0aCBkPSJNMTMgMTloMy45QTIuNSAyLjUgMCAwIDAgMTkgMTYuNVY0TDEzIDZWNnoiLz48L3N2Zz4=',
        close: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGxpbmUgeDE9IjE4IiB5MT0iNiIgeDI9IjYiIHkyPSIxOCI+PC9saW5lPjxsaW5lIHgxPSI2IiB5MT0iNiIgeDI9IjE4IiB5MT0iMTgiPjwvbGluZT48L3N2Zz4='
    };

    // --- 全局媒体资源存储 ---
    const mediaMap = new Map();

    // --- 核心工具函数 ---
    const formatTime = (seconds) => {
        if (isNaN(seconds) || seconds === Infinity || seconds <= 0) {
            return '直播或未知';
        }
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
    };

    const getFormat = (url) => {
        try {
            const path = new URL(url).pathname;
            let extension = path.split('.').pop().toLowerCase();
            if (extension.includes('m3u8')) return '.M3U8';
            if (extension.includes('mpd')) return '.MPD';
            if (extension && extension.length <= 5) {
                 return `.${extension.toUpperCase()}`;
            }
        } catch (e) {}
        if (url.includes('.m3u8')) return '.M3U8';
        if (url.includes('.mpd')) return '.MPD';
        if (url.includes('.mp4')) return '.MP4';
        if (url.includes('.flv')) return '.FLV';
        if (url.includes('.mp3')) return '.MP3';
        return '未知格式';
    };

    const getResolution = (height) => (height > 0 ? `${height}P` : '');

    // --- M3U8 解析器 ---
    const parseM3U8Info = (text) => {
        let totalDuration = 0;
        let maxHeight = 0;
        const durationRegex = /#EXTINF:([\d.]+)/g;
        const resolutionRegex = /RESOLUTION=(\d+)x(\d+)/g;
        let match;

        while ((match = durationRegex.exec(text)) !== null) {
            totalDuration += parseFloat(match[1]);
        }
        while ((match = resolutionRegex.exec(text)) !== null) {
            const height = parseInt(match[2], 10);
            if (height > maxHeight) {
                maxHeight = height;
            }
        }
        return { duration: totalDuration, height: maxHeight };
    };

    // --- 媒体资源处理 ---
    const addMediaResource = (mediaInfo) => {
        // 使用原始URL作为唯一标识符
        if (!mediaInfo.url || mediaMap.has(mediaInfo.url)) {
            return;
        }

        const defaults = {
            type: 'video',
            title: document.title || '无标题媒体',
            duration: 0,
            height: 0,
            format: getFormat(mediaInfo.url)
        };

        const finalMedia = { ...defaults, ...mediaInfo };
        mediaMap.set(finalMedia.url, finalMedia);
        updateUI();
    };


    // --- UI 创建和管理 ---
    const createUI = () => {
        if (document.getElementById('media-hunter-container')) return;
        const container = document.createElement('div');
        container.id = 'media-hunter-container';
        container.innerHTML = `
            <div id="mh-trigger-button" class="mh-hidden">
                <img src="${ICONS.main}" alt="icon"/>
                <span>媒体猎手</span>
            </div>
            <div id="mh-popup" class="mh-hidden">
                <div id="mh-header">
                    <span id="mh-title">MediaHunter 媒体猎手</span>
                    <img id="mh-close-btn" src="${ICONS.close}" alt="close"/>
                </div>
                <div id="mh-content"></div>
            </div>
        `;
        document.body.appendChild(container);

        const triggerButton = document.getElementById('mh-trigger-button');
        const popup = document.getElementById('mh-popup');
        const closeBtn = document.getElementById('mh-close-btn');
        const contentArea = document.getElementById('mh-content');

        triggerButton.addEventListener('click', () => {
            triggerButton.classList.add('mh-hidden');
            popup.classList.remove('mh-hidden');
        });

        closeBtn.addEventListener('click', () => {
            popup.classList.add('mh-hidden');
            if (mediaMap.size > 0) {
                 triggerButton.classList.remove('mh-hidden');
            }
        });

        contentArea.addEventListener('click', (e) => {
            const target = e.target.closest('.mh-btn-copy');
            if (target) {
                GM_setClipboard(target.dataset.url, 'text');
                target.textContent = '已复制!';
                setTimeout(() => { target.textContent = '复制'; }, 1500);
            }
             const downloadTarget = e.target.closest('.mh-btn-download');
            if (downloadTarget) {
                console.log('下载功能待实现，URL:', downloadTarget.dataset.url);
            }
        });
    };

    const updateUI = () => {
        const mediaList = Array.from(mediaMap.values());
        // 1. 过滤和去重：只保留分辨率最高的
        const mediaGroup = new Map();
        mediaList.forEach(media => {
            const baseUrl = media.url.split('?')[0].replace(/\.[^/.]+$/, "");
            const existing = mediaGroup.get(baseUrl);
            if (!existing || (media.height > 0 && media.height > existing.height)) {
                mediaGroup.set(baseUrl, media);
            } else if (!existing) {
                mediaGroup.set(baseUrl, media);
            }
        });

        const processedMedia = Array.from(mediaGroup.values());
        const triggerButton = document.getElementById('mh-trigger-button');
        const contentArea = document.getElementById('mh-content');
        if (!triggerButton || !contentArea) return;

        if (processedMedia.length > 0 && document.getElementById('mh-popup').classList.contains('mh-hidden')) {
            triggerButton.classList.remove('mh-hidden');
        } else if (processedMedia.length === 0) {
            triggerButton.classList.add('mh-hidden');
        }

        contentArea.innerHTML = processedMedia.map(media => {
            const isVideo = media.type === 'video';
            const resolutionText = isVideo ? `<span class="mh-tag">${getResolution(media.height)}</span>` : '';

            return `
                <div class="mh-card">
                    <div class="mh-card-top">
                        <img class="mh-media-icon" src="${isVideo ? ICONS.video : ICONS.audio}" alt="media-type"/>
                        <span class="mh-media-name">${media.title}</span>
                    </div>
                    <div class="mh-card-bottom">
                        <div class="mh-tags">
                            <span class="mh-tag">${formatTime(media.duration)}</span>
                            ${resolutionText}
                            <span class="mh-tag">${media.format}</span>
                        </div>
                        <div class="mh-actions">
                            <button class="mh-btn mh-btn-copy" data-url="${media.url}">复制</button>
                            <button class="mh-btn mh-btn-download" data-url="${media.url}">下载</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    };

    // --- 响应处理和内容嗅探 ---
    const processResponse = (url, responseText) => {
        if (!responseText || typeof responseText !== 'string' || !url) return;
        const format = getFormat(url);

        // M3U8/MPD 处理
        if (responseText.includes('#EXTM3U') || format === '.M3U8' || format === '.MPD') {
            const { duration, height } = parseM3U8Info(responseText);
            addMediaResource({ url, duration, height, format, title: document.title || url.slice(0, 50) });
        }
        // 可直接播放的媒体
        else if (['.MP4', '.MP3', '.FLV'].includes(format)) {
            addMediaResource({ url, format, type: format === '.MP3' ? 'audio' : 'video' });
        }
    };

    const findMediaInObject = (data) => {
        if (!data || typeof data !== 'object') return;
        const visited = new WeakSet();

        function traverse(obj) {
            if (!obj || typeof obj !== 'object' || visited.has(obj)) return;
            visited.add(obj);

            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    if (typeof value === 'string' && value.startsWith('http')) {
                        const format = getFormat(value);
                         if (['.MP4', '.M3U8', '.MPD', '.FLV', '.MP3'].includes(format)) {
                             addMediaResource({ url: value, format, type: format === '.MP3' ? 'audio' : 'video'});
                        }
                    } else if (typeof value === 'object') {
                        traverse(value);
                    }
                }
            }
        }
        traverse(data);
    };


    // --- 拦截器/钩子 ---
    const installHooks = () => {
        // 拦截 JSON.parse
        const originalJsonParse = JSON.parse;
        JSON.parse = function(...args) {
            const result = originalJsonParse.apply(this, args);
            findMediaInObject(result);
            return result;
        };

        // 拦截 Fetch
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0] instanceof Request ? args[0].url : args[0];
            return originalFetch.apply(this, args).then(response => {
                if (response.ok) {
                    const clonedResponse = response.clone();
                    clonedResponse.text().then(text => processResponse(clonedResponse.url || url, text));
                }
                return response;
            });
        };

        // 拦截 XMLHttpRequest
        const originalXhrOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(...args) {
            this.addEventListener('load', () => {
                if (this.readyState === 4 && (this.status >= 200 && this.status < 300)) {
                    processResponse(this.responseURL, this.responseText);
                }
            });
            return originalXhrOpen.apply(this, args);
        };
    };

    // --- 传统媒体扫描 (作为补充) ---
    const scanDomForMedia = () => {
        document.querySelectorAll('video, audio').forEach(el => {
            if (el.src && !el.src.startsWith('blob:') && el.duration > 1) {
                const update = () => {
                    const info = {
                        url: el.src,
                        type: el.tagName.toLowerCase(),
                        title: document.title,
                        duration: el.duration,
                        height: el.videoHeight || 0,
                    };
                    addMediaResource(info);
                };

                if (el.readyState >= 1) {
                    update();
                } else {
                    el.addEventListener('loadedmetadata', update, { once: true });
                }
            }
        });
    };


    // --- 初始化 ---
    function main() {
        installHooks(); // 优先安装钩子
        // DOM加载完成后再执行UI和DOM扫描
        const initOnReady = () => {
             addStyles();
             createUI();
             scanDomForMedia();
             // 启动DOM变动观察器
             const observer = new MutationObserver(scanDomForMedia);
             observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initOnReady);
        } else {
            initOnReady();
        }
    }

    const addStyles = () => {
        GM_addStyle(`
            #media-hunter-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 2147483647; /* Ensure it's on top */
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            .mh-hidden { display: none !important; }
            #mh-trigger-button {
                display: flex; align-items: center; gap: 8px; padding: 10px 15px; background-color: #007BFF;
                color: white; border: none; border-radius: 8px; cursor: pointer;
                box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: transform 0.2s;
            }
            #mh-trigger-button:hover { transform: scale(1.05); }
            #mh-trigger-button img { width: 24px; height: 24px; }
            #mh-popup {
                width: 360px; background-color: #f9f9f9; border-radius: 8px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden;
            }
            #mh-header {
                display: flex; justify-content: space-between; align-items: center; padding: 12px 15px;
                background-color: #007BFF; color: white; font-weight: bold;
            }
            #mh-title { font-size: 16px; }
            #mh-close-btn { width: 20px; height: 20px; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; }
            #mh-close-btn:hover { opacity: 1; }
            #mh-content {
                padding: 8px; overflow-y: auto;
                max-height: calc((70px + 8px) * 5); /* 5 cards height */
            }
            .mh-card {
                background-color: #ffffff; border-radius: 6px; margin-bottom: 8px; padding: 12px;
                border: 1px solid #e0e0e0; display: flex; flex-direction: column; gap: 10px;
            }
            .mh-card-top { display: flex; align-items: center; gap: 10px; }
            .mh-media-icon { width: 20px; height: 20px; flex-shrink: 0; color: #555; }
            .mh-media-name {
                font-size: 14px; font-weight: 500; color: #333;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .mh-card-bottom { display: flex; justify-content: space-between; align-items: center; }
            .mh-tags { display: flex; gap: 6px; flex-wrap: wrap; }
            .mh-tag {
                background-color: #eee; color: #333; padding: 3px 8px;
                border-radius: 4px; font-size: 12px;
            }
            .mh-actions { display: flex; gap: 8px; }
            .mh-btn {
                padding: 5px 12px; font-size: 13px; border: 1px solid #ccc;
                border-radius: 4px; background-color: #f0f0f0; cursor: pointer; transition: background-color 0.2s;
            }
            .mh-btn:hover { background-color: #e0e0e0; }
            .mh-btn-copy { border-color: #007BFF; color: #007BFF; }
            .mh-btn-copy:hover { background-color: #e6f2ff; }
        `);
    };

    main();
})();