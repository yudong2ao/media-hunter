// ==UserScript==
// @name         MediaHunter 媒体猎手 (V8.1.9 TS优先版)
// @namespace    http://tampermonkey.net/
// @version      8.1.9
// @description  Strict rules for ghost resources. Intercept native payload. Extreme performance optimization with chunking and LRU cache.
// @author       yudong2ao & Gemini
// @match        *://*/*
// @grant        GM_setClipboard
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

    // 【性能优化 2】限制容量的拦截池，防止 SPA 无限滚动导致内存溢出
    const INTERCEPTED_TEXTS = new Map();
    const MAX_INTERCEPT_CACHE = 20;

    let PAGE_SESSION_ID = Date.now();
    let PAGE_START_TIME = window.performance ? window.performance.now() : 0;
    let DOM_CACHE = new WeakMap();
    const GLOBAL_EXTRACTED_TEXT_URLS = new Set();
    const IS_TOP = window === window.top;
    let isRenderPending = false;
    let shadowRoot = null;

    let domScanTimer = null;
    let domScanCount = 0;
    const MAX_DOM_SCANS = 60;

    const REGEX_IGNORE_URLS = /\.(ts|jpg|jpeg|png|gif|webp|bmp|css|js|woff|woff2|ttf|svg)(\?|$)|(\/segment\/)/i;
    const REGEX_STREAM_INF = /#EXT-X-STREAM-INF/;
    const REGEX_BW = /BANDWIDTH=(\d+)/;
    const REGEX_RES = /RESOLUTION=(\d+)x(\d+)/;

    const YTDLP_SUPPORTED_SITES = [
        'youtube.com', 'youtu.be', 'bilibili.com', 'acfun.cn', 'twitter.com',
        'x.com', 'twitch.tv', 'tiktok.com', 'vimeo.com', 'instagram.com', 'pornhub.com'
    ];

    const ICONS = {
        logo: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" fill="#FFFFFF" d="M13.3335 12.0032L11.5235 12.0032C13.4553 10.2995 13.9023 7.45977 12.5735 5.25325C11.2447 3.04659 8.52308 2.10259 6.11349 3.01325C3.70403 3.92391 2.29083 6.41938 2.75349 8.95324C3.21629 11.4872 5.42762 13.3332 8.00348 13.3332L13.3335 13.3332L13.3335 14.6632L8.00348 14.6632C4.3215 14.6632 1.3335 11.6852 1.3335 8.00324C1.3335 4.32125 4.3215 1.33325 8.00348 1.33325C11.6855 1.33325 14.6635 4.32125 14.6635 8.00324C14.6635 9.44604 14.2008 10.8503 13.3335 12.0032ZM7.99648 4.00005C8.73286 4.00005 9.33648 4.59367 9.33648 5.33005C9.33648 6.06642 8.73286 6.67004 7.99648 6.67004C7.26011 6.67004 6.66649 6.06642 6.66649 5.33005C6.66649 4.59367 7.26011 4.00005 7.99648 4.00005ZM6.66999 7.99674C6.66999 8.73312 6.06637 9.33674 5.32999 9.33674C4.59361 9.33674 3.99999 8.73312 3.99999 7.99674C3.99999 7.26036 4.59361 6.66674 5.32999 6.66674C6.06637 6.66674 6.66999 7.26036 6.66999 7.99674ZM10.6635 6.66674C11.3999 6.66674 12.0035 7.26036 12.0035 7.99674C12.0035 8.73312 11.3999 9.33674 10.6635 9.33674C9.9271 9.33674 9.33348 8.73312 9.33348 7.99674C9.33348 7.26036 9.9271 6.66674 10.6635 6.66674ZM7.99648 9.33324C8.73286 9.33324 9.33648 9.92686 9.33648 10.6632C9.33648 11.3996 8.73286 12.0032 7.99648 12.0032C7.26011 12.0032 6.66649 11.3996 6.66649 10.6632C6.66649 9.92686 7.26011 9.33324 7.99648 9.33324Z"/></svg>`,
        video: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" fill="#383838" d="M14.6632 8.00329C14.6632 4.32129 11.6852 1.3333 8.00319 1.3333C4.32119 1.3333 1.33319 4.32129 1.33319 8.00329C1.33319 11.6853 4.32119 14.6633 8.00319 14.6633C11.6852 14.6633 14.6632 11.6853 14.6632 8.00329ZM7.99679 13.3367C10.9423 13.3367 13.3368 10.9422 13.3368 7.99669C13.3368 5.0512 10.9423 2.6667 7.99679 2.6667C5.0513 2.6667 2.66679 5.0512 2.66679 7.99669C2.66679 10.9422 5.0513 13.3367 7.99679 13.3367ZM7.07679 10.3851C6.99508 10.4393 6.89326 10.4513 6.80679 10.4051C6.72035 10.3589 6.66679 10.2631 6.66679 10.1651L6.66679 5.83509C6.66679 5.73683 6.72008 5.6414 6.80679 5.59509C6.89345 5.54884 6.99504 5.55056 7.07679 5.60509L10.3368 7.77509C10.4111 7.82456 10.4568 7.90584 10.4568 7.99509C10.4568 8.0843 10.4111 8.17562 10.3368 8.22509L7.07679 10.3851Z"/></svg>`,
        audio: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill-rule="evenodd" fill="#383838" d="M11.3567 13.91C12.5226 13.5978 13.3367 12.5369 13.3367 11.33L13.3367 2L4.66672 2L4.66672 9.02001C3.62159 8.41655 2.3002 8.59671 1.44672 9.45001C0.593361 10.3034 0.423402 11.6248 1.02672 12.67C1.63003 13.7153 2.861 14.2221 4.02672 13.91C5.19257 13.5978 5.99672 12.5369 5.99672 11.33L5.99672 3.33L11.9967 3.33L11.9967 9.02001C10.9515 8.41655 9.63021 8.59671 8.77673 9.45001C7.92324 10.3034 7.75341 11.6248 8.35673 12.67C8.96004 13.7153 10.1909 14.2221 11.3567 13.91ZM4.67002 11.33C4.67002 10.5936 4.06639 10 3.33002 10C2.59365 10 2.00002 10.5936 2.00002 11.33C2.00002 12.0664 2.59365 12.67 3.33002 12.67C4.06639 12.67 4.67002 12.0664 4.67002 11.33ZM10.6633 10C11.3997 10 12.0033 10.5936 12.0033 11.33C12.0033 12.0664 11.3997 12.67 10.6633 12.67C9.92696 12.67 9.33333 12.0664 9.33333 11.33C9.33333 10.5936 9.92696 10 10.6633 10Z"/></svg>`,
        close: `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="11.11260986328125" height="11" viewBox="0 0 11.11260986328125 11" fill="none"><path stroke="rgba(255, 255, 255, 1)" stroke-width="0.9166666666666659" d="M8.74076 2.25909L5.49987 5.5L2.25897 8.74091"/><path stroke="rgba(255, 255, 255, 1)" stroke-width="0.9166666666666659" d="M2.25897 2.25909L5.49987 5.5L8.74076 8.74091"/></svg>`
    };

    const STYLES = `
        #mh-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; position: relative; width: 0; height: 0; }
        #mh-root * { box-sizing: border-box !important; }
        #mh-float-btn { position: absolute; bottom: 0; right: 0; display: flex; align-items: center; justify-content: center; width: 88px; height: 27px; opacity: 1; background: rgba(45, 33, 183, 1); color: white; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 10px rgba(45, 33, 183, 0.3); transition: transform 0.2s; user-select: none; text-decoration: none !important; }
        #mh-float-btn:hover { transform: translateY(-2px); }
        .mh-logo-icon { display: flex; align-items: center; justify-content: center; margin-right: 4px !important; width: 14px !important; height: 14px !important; }
        #mh-float-btn span { font-size: 12px !important; font-weight: 500 !important; letter-spacing: 0.5px !important; line-height: 1 !important; color: #fff !important; margin: 0 !important; padding: 0 !important; }
        #mh-popup { position: absolute; bottom: 0; right: 0; width: 296px; max-height: 253px; background: rgba(255, 255, 255, 1); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); display: none; flex-direction: column; overflow: hidden; }
        #mh-header { background: rgba(45, 33, 183, 1); height: 36px; padding: 0 12px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
        #mh-header h3 { margin: 0 !important; padding: 0 !important; width: 136.38px; height: 18px; font-size: 13px !important; font-weight: 400 !important; letter-spacing: 0px !important; line-height: 17.84px !important; color: rgba(255, 255, 255, 1) !important; text-align: left !important; vertical-align: middle !important; white-space: nowrap !important; }
        #mh-close-btn { display: flex; align-items: center; justify-content: center; cursor: pointer; width: 16px !important; height: 16px !important; opacity: 0.8 !important; }
        #mh-close-btn:hover { opacity: 1 !important; }
        #mh-content { max-height: 219px; overflow-x: hidden; overflow-y: auto; padding: 10px; }
        #mh-content::-webkit-scrollbar { width: 4px; }
        #mh-content::-webkit-scrollbar-thumb { background: #d1d1d1; border-radius: 2px; }
        .mh-card { width: 100%; height: 61px; margin-bottom: 8px; opacity: 1; border-radius: 6px; background: rgba(248, 249, 250, 1); display: flex; flex-direction: column; }
        .mh-card:last-child { margin-bottom: 0; }
        .mh-card-top { width: 100%; height: 26px; border-radius: 6px 6px 0px 0px; background: rgba(236, 238, 242, 1); display: flex; align-items: center; padding: 0 10px; }
        .mh-card-icon { display: flex; align-items: center; justify-content: center; margin: 0 6px 0 0 !important; flex-shrink: 0 !important; width: 14px !important; height: 14px !important; }
        .mh-card-title { font-size: 12px !important; color: #000 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; line-height: 1.5 !important; margin: 0 !important; padding: 0 !important; font-weight: normal !important; }
        .mh-card-bottom { display: flex; justify-content: space-between; align-items: center; height: 35px; padding: 0 10px; }
        .mh-info-group { display: flex; gap: 8px; align-items: center; margin: 0 !important; padding: 0 !important; }
        .mh-tag-dur { width: 51px !important; height: 20px !important; opacity: 1 !important; background: rgba(128, 128, 128, 1) !important; color: white !important; border-radius: 4px !important; font-size: 11px !important; font-variant-numeric: tabular-nums !important; display: flex !important; justify-content: center !important; align-items: center !important; line-height: 1 !important; padding: 0 !important; margin: 0 !important; font-weight: normal !important; }
        .mh-tag-live { background: #e03131 !important; }
        .mh-tag-txt { font-size: 12px !important; color: #000 !important; font-variant-numeric: tabular-nums !important; line-height: 1 !important; margin: 0 !important; padding: 0 !important; font-weight: normal !important; }
        .mh-actions { display: flex; gap: 6px; margin: 0 !important; padding: 0 !important; }
        .mh-btn { outline: none !important; box-shadow: none !important; width: 36px !important; height: 20px !important; border: none !important; border-radius: 4px !important; font-size: 11px !important; cursor: pointer !important; display: flex !important; justify-content: center !important; align-items: center !important; padding: 0 !important; margin: 0 !important; font-family: inherit !important; font-weight: 500 !important; transition: all 0.2s ease !important; line-height: 1 !important; }
        .mh-btn:focus, .mh-btn:active { outline: none !important; box-shadow: none !important; }
        .mh-btn-copy { background: #e9ecef !important; color: #495057 !important; }
        .mh-btn-copy:hover { background: #dee2e6 !important; }
        .mh-btn-ytdlp { background: rgba(45, 33, 183, 0.8) !important; color: white !important; }
        .mh-btn-ytdlp:hover { filter: brightness(1.2) !important; }
    `;

    const EXT_MAP = new Map([
        ["mp4", true], ["mp3", true], ["webm", true], ["ogg", true], ["m4a", true],
        ["wav", true], ["m3u8", true], ["flv", true], ["aac", true],
        ["mkv", true], ["avi", true], ["mov", true], ["flac", true], ["mka", true], ["m4s", true]
    ]);

    const MIME_MAP = new Map([
        ["audio/*", true], ["video/*", true],
        ["application/vnd.apple.mpegurl", true], ["application/x-mpegurl", true],
        ["application/dash+xml", true]
    ]);

    class BitReader {
        constructor(buffer) {
            this.data = new Uint8Array(buffer);
            this.pos = 0;
            this.bitPos = 0;
            this.length = this.data.length;
        }
        readBit() {
            if (this.pos >= this.length) return 0;

            if (this.bitPos === 0 && this.pos >= 2 &&
                this.data[this.pos] === 0x03 &&
                this.data[this.pos - 1] === 0x00 &&
                this.data[this.pos - 2] === 0x00) {
                this.pos++;
                if (this.pos >= this.length) return 0;
            }

            const bit = (this.data[this.pos] >> (7 - this.bitPos)) & 1;
            this.bitPos++;
            if (this.bitPos === 8) {
                this.bitPos = 0;
                this.pos++;
            }
            return bit;
        }
        readBits(n) { let val = 0; for (let i = 0; i < n; i++) val = (val << 1) | this.readBit(); return val; }
        readUEG() {
            let zeroBits = -1;
            for (let b = 0; !b; zeroBits++) b = this.readBit();
            return (1 << zeroBits) - 1 + this.readBits(zeroBits);
        }
    }

    function extractResolutionFromTS(arrayBuffer) {
        const data = new Uint8Array(arrayBuffer);
        let spsStart = -1, spsEnd = -1;
        for (let i = 0; i < data.length - 4; i++) {
            if (data[i] === 0x00 && data[i+1] === 0x00 && data[i+2] === 0x01 && (data[i+3] & 0x1F) === 7) {
                spsStart = i + 3;
                for (let j = spsStart + 1; j < data.length - 3; j++) {
                    if (data[j] === 0x00 && data[j+1] === 0x00 && (data[j+2] === 0x01 || (data[j+2] === 0x00 && data[j+3] === 0x01))) {
                        spsEnd = j; break;
                    }
                }
                if (spsEnd === -1) spsEnd = Math.min(spsStart + 100, data.length);
                break;
            }
        }
        if (spsStart !== -1) {
            try {
                const br = new BitReader(data.slice(spsStart, spsEnd));
                br.readBits(8);
                const profile_idc = br.readBits(8);
                br.readBits(16);
                br.readUEG();
                if ([100, 110, 122, 244, 44, 83, 86, 118, 128].includes(profile_idc)) {
                    const chroma_format_idc = br.readUEG();
                    if (chroma_format_idc === 3) br.readBit();
                    br.readUEG(); br.readUEG(); br.readBit();
                    if (br.readBit()) return null;
                }
                br.readUEG();
                const pic_order_cnt_type = br.readUEG();
                if (pic_order_cnt_type === 0) br.readUEG();
                else if (pic_order_cnt_type === 1) return null;
                br.readUEG(); br.readBit();
                const pic_width_in_mbs_minus1 = br.readUEG();
                const pic_height_in_map_units_minus1 = br.readUEG();
                const frame_mbs_only_flag = br.readBit();
                if (!frame_mbs_only_flag) br.readBit();
                br.readBit();
                const frame_cropping_flag = br.readBit();
                let crop_l = 0, crop_r = 0, crop_t = 0, crop_b = 0;
                if (frame_cropping_flag) {
                    crop_l = br.readUEG(); crop_r = br.readUEG(); crop_t = br.readUEG(); crop_b = br.readUEG();
                    if (crop_l > 50 || crop_r > 50 || crop_t > 50 || crop_b > 50) return null;
                }
                let width = (pic_width_in_mbs_minus1 + 1) * 16;
                let height = (2 - frame_mbs_only_flag) * (pic_height_in_map_units_minus1 + 1) * 16;
                if (frame_cropping_flag) {
                    width -= (crop_l + crop_r) * 2;
                    height -= (crop_t + crop_b) * 2 * (2 - frame_mbs_only_flag);
                }
                return { width, height };
            } catch(e) { return null; }
        }
        return null;
    }

    async function fetchFirstTs(m3u8Url, text) {
        const lines = text.split('\n');
        let tsUri = null;
        for (let line of lines) {
            line = line.trim();
            if (line && !line.startsWith('#')) { tsUri = new URL(line, m3u8Url).href; break; }
        }
        if (!tsUri) return null;
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET', url: tsUri, responseType: 'arraybuffer',
                headers: {
                    'Range': 'bytes=0-65535',
                    "Referer": window.location.href,
                    "Origin": window.location.origin
                },
                timeout: 5000,
                onload: res => resolve(res.status >= 200 && res.status < 300 ? res.response : null),
                onerror: () => resolve(null), ontimeout: () => resolve(null)
            });
        });
    }

    function isKnownYtDlpSite() {
        const hostname = window.location.hostname;
        return YTDLP_SUPPORTED_SITES.some(site => hostname === site || hostname.endsWith('.' + site));
    }

    function formatDuration(seconds) {
        if (seconds === Infinity || !seconds || isNaN(seconds) || seconds <= 0) return "--:--";
        const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60);
        const pad = (n) => n.toString().padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }

    function getResolution(width, height) {
        if (!width || !height) return "";
        return `${width}x${height}`;
    }

    function guessResolutionFromUrl(url) {
        if (!url) return "";

        const regexWxH = /(?:-|_|\/|@|=|\?)(\d{3,4})[xX](\d{3,4})(?:\/|_|-|\?|&|\.|$)/gi;
        const matchWxH = [...url.matchAll(regexWxH)];
        if (matchWxH.length > 0) {
            const lastMatch = matchWxH[matchWxH.length - 1];
            return `${lastMatch[1]}x${lastMatch[2]}`;
        }

        const regexRes = /(?:-|_|\/|@)(144|240|250|360|480|540|720|1080|1440|2160|4320)p?(?:\/|_|-|\?|&|\.|$)/gi;
        const matches = [...url.matchAll(regexRes)];
        if (matches.length > 0) {
            const m = matches[matches.length - 1];
            const res = parseInt(m[1]);
            if (res === 4320) return "8K";
            if (res === 2160) return "4K";
            if (res === 1440) return "2K";
            return `${res}P`;
        }

        const regex8K = /(?:-|_|\/|@)(8k)(?:\/|_|-|\?|&|\.|$)/i;
        const regex4K = /(?:-|_|\/|@)(4k)(?:\/|_|-|\?|&|\.|$)/i;
        const regex2K = /(?:-|_|\/|@)(2k)(?:\/|_|-|\?|&|\.|$)/i;
        if (regex8K.test(url)) return "8K";
        if (regex4K.test(url)) return "4K";
        if (regex2K.test(url)) return "2K";

        return "";
    }

    function requestText(url) {
        return new Promise((resolve, reject) => {
            if (INTERCEPTED_TEXTS.has(url)) {
                resolve(INTERCEPTED_TEXTS.get(url));
                return;
            }
            GM_xmlhttpRequest({
                method: "GET", url: url, timeout: 8000,
                headers: {
                    "Referer": window.location.href,
                    "Origin": window.location.origin
                },
                onload: (res) => (res.status >= 200 && res.status < 300) ? resolve(res.responseText) : reject(`HTTP Error`),
                onerror: (err) => reject(err), ontimeout: () => reject("Timeout")
            });
        });
    }

    function detectFormat(url, contentType) {
        try {
            const urlObj = new URL(url, document.baseURI);
            const path = urlObj.pathname.toLowerCase();
            const params = urlObj.search.toLowerCase();

            const parts = path.split('.');
            let ext = parts.length > 1 ? parts.pop().split('?')[0] : null;

            if (!EXT_MAP.has(ext)) {
                const paramMatch = params.match(/\.([a-z0-9]+)(?:[&#]|$)/);
                if (paramMatch && EXT_MAP.has(paramMatch[1])) {
                    ext = paramMatch[1];
                }
            }

            if (EXT_MAP.has(ext)) {
                let type = null;
                if (contentType) {
                    const cleanType = contentType.split(';')[0].trim().toLowerCase();
                    if (MIME_MAP.has(cleanType) || MIME_MAP.has(`${cleanType.split('/')[0]}/*`)) {
                        type = cleanType;
                    }
                }
                return { type: type, ext: ext };
            }

            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'css', 'js', 'woff', 'woff2', 'ttf', 'svg'].includes(ext)) return null;

            if (params.includes('m3u8') || params.includes('playlist.m3u') || path.includes('/hls/')) {
                return { type: 'application/vnd.apple.mpegurl', ext: 'm3u8' };
            }

            if (contentType) {
                const type = contentType.split(';')[0].trim().toLowerCase();
                if (type.startsWith('image/') || type.startsWith('text/') || type.startsWith('font/')) return null;
                if (MIME_MAP.has(type) || MIME_MAP.has(`${type.split('/')[0]}/*`)) return { type: type, ext: null };
            }
        } catch(e) {}
        return null;
    }

    function getMediaType(format, url) {
        if (format.type && format.type.includes('audio')) return 'audio';
        if (format.type && format.type.includes('video')) return 'video';
        if (url && (/-1-302\d{2}\.m4s/i.test(url) || /audio/i.test(url))) return 'audio';
        if (format.ext) return ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'mka'].includes(format.ext) ? 'audio' : 'video';
        return 'video';
    }

    function probeMediaMetadata(url, type) {
        return new Promise((resolve) => {
            const media = document.createElement(type === 'video' ? 'video' : 'audio');
            media.preload = 'metadata'; media.muted = true;
            const cleanup = (result) => { media.removeAttribute('src'); media.load(); media.remove(); resolve(result); };

            const timeout = setTimeout(() => cleanup(null), 12000);

            media.onloadedmetadata = () => {
                clearTimeout(timeout);
                cleanup({ duration: isNaN(media.duration) ? 0 : media.duration, width: media.videoWidth || 0, height: media.videoHeight || 0 });
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
            let isMaster = false;

            for (let i = 0; i < lines.length; i++) {
                if (REGEX_STREAM_INF.test(lines[i])) {
                    isMaster = true;
                    const bwMatch = lines[i].match(REGEX_BW);
                    const resMatch = lines[i].match(REGEX_RES);
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
                        }
                    }
                }
            }

            if (isMaster && bestVariant) return await parseM3u8(bestVariant.url, visited, bestVariant) || bestVariant;

            const regexDuration = /#EXTINF:\s*([\d\.]+)/g;
            let match, hasSegments = false;
            while ((match = regexDuration.exec(text)) !== null) { hasSegments = true; duration += parseFloat(match[1]); }

            if (!hasSegments && !isMaster) return inheritedMeta;

            // 【核心修复】：移除原有的 if (!inheritedMeta.width && !inheritedMeta.height) 限制
            // 永远将 TS 切片真实解析作为第一优先级，无条件覆盖可能的虚假 M3U8 文本标签
            const tsBuffer = await fetchFirstTs(url, text);
            if (tsBuffer) {
                const res = extractResolutionFromTS(tsBuffer);
                if (res && res.width && res.height) {
                    inheritedMeta.width = res.width;
                    inheritedMeta.height = res.height;
                }
            }

            return {
                duration: duration,
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
        if (!media.id) media.id = Math.random().toString(36).substr(2, 9);
        if (!media.title) media.title = document.title || "未知媒体资源";

        const existingIndex = STATE.mediaList.findIndex(m => m.url === media.url);

        const checkShouldDrop = (m) => {
            if (m.isPageUrl) return false;

            const hasDuration = m.duration && m.duration > 0;

            if (m.type === 'audio') {
                return !hasDuration;
            } else {
                const hasResolution = m.resolution && m.resolution.trim() !== '';

                if (!hasDuration && !hasResolution) {
                    return true;
                }

                const isStream = ['m3u8', 'm4s', 'ts', 'flv'].includes(m.ext);
                if (!isStream && (!hasDuration || m.duration <= 10)) {
                    return true;
                }

                return false;
            }
        };

        if (existingIndex !== -1) {
            const existing = STATE.mediaList[existingIndex];

            if (existing.isPageUrl && !media.isPageUrl) {
                return;
            }

            let needsUpdate = false;

            if (!existing.duration && media.duration) needsUpdate = true;
            if (!existing.resolution && media.resolution) needsUpdate = true;
            if (existing.resGuessed && !media.resGuessed && media.resolution) needsUpdate = true;
            if (existing.ext === 'mp4' && media.ext && media.ext !== 'mp4') needsUpdate = true;

            if (needsUpdate) {
                if (checkShouldDrop(media)) {
                    STATE.mediaList.splice(existingIndex, 1);
                    scheduleRender();
                    return;
                }
                STATE.mediaList[existingIndex] = { ...existing, ...media, id: existing.id, _copyUntil: existing._copyUntil, _dlUntil: existing._dlUntil, _copyText: existing._copyText };
                if (!media.resGuessed) STATE.mediaList[existingIndex].resGuessed = false;
                scheduleRender();
            }
            return;
        }

        STATE.sniffedUrls.add(media.url);

        if (checkShouldDrop(media)) return;

        STATE.mediaList.push(media);
        showButton();
        scheduleRender();
    }

    function extractUrlsFromTextAsync(text, sourceSessionId = PAGE_SESSION_ID, needsUnescape = true) {
        if (!text || typeof text !== 'string' || text.length > 5000000) return;
        if (sourceSessionId !== PAGE_SESSION_ID) return;

        const schedule = window.requestIdleCallback || window.setTimeout;
        schedule(() => {
            if (sourceSessionId !== PAGE_SESSION_ID) return;

            const cleanText = needsUnescape ? text.replace(/\\\//g, '/') : text;
            const regexUrl = /https?:\/\/[^"'\s<>\{\}\[\]\\]+\.(?:m3u8|mp4|flv|m4a|m4s)(?:\?[^"'\s<>\{\}\[\]\\]*)?/gi;
            let match;
            while ((match = regexUrl.exec(cleanText)) !== null) {
                let cleanUrl = match[0].replace(/&amp;/gi, '&');
                cleanUrl = cleanUrl.replace(/\\u0026/gi, '&');

                if (!GLOBAL_EXTRACTED_TEXT_URLS.has(cleanUrl)) {
                    GLOBAL_EXTRACTED_TEXT_URLS.add(cleanUrl);
                    if (!STATE.sniffedUrls.has(cleanUrl)) {
                        checkNetworkResource(cleanUrl, null, sourceSessionId);
                    }
                }
            }
        }, { timeout: 2000 });
    }

    function syncDomRes(activeRes, activeWidth, activeHeight, activeDuration) {
        if (!activeRes) return;
        let videos = STATE.mediaList.filter(m => m.type === 'video' && !m.isPageUrl);

        if (videos.length === 1) {
            let m = videos[0];
            if (m.duration > 0 && activeDuration > 0 && Math.abs(m.duration - activeDuration) <= 5) {
                if (!m.resolution || m.resGuessed) {
                    m.resolution = activeRes;
                    m.resGuessed = false;
                    scheduleRender();
                }
            }
        }
    }

    function scanDOM() {
        const currentSession = PAGE_SESSION_ID;

        if (IS_TOP && document.title) {
            let titleUpdated = false;
            STATE.mediaList.forEach(m => {
                if (m.title !== document.title) {
                    m.title = document.title;
                    titleUpdated = true;
                }
            });
            if (titleUpdated) scheduleRender();
        }

        let activeVideoEl = null;
        let maxArea = 0;

        let mediaElements = [
            ...document.getElementsByTagName('video'),
            ...document.getElementsByTagName('audio'),
            ...document.getElementsByTagName('source')
        ];

        mediaElements.forEach(el => {
            if (el.tagName === 'VIDEO' && el.videoWidth && el.videoHeight) {
                let area = el.videoWidth * el.videoHeight;
                if (area > maxArea) {
                    maxArea = area;
                    activeVideoEl = el;
                }
            }

            let src = el.src || el.currentSrc || el.getAttribute('src');
            if (!src || src.startsWith('blob:')) return;
            try { src = new URL(src, document.baseURI).href; } catch(e) { return; }

            if (DOM_CACHE.get(el) === src) return;
            DOM_CACHE.set(el, src);

            let format = detectFormat(src);
            const isVideo = el.tagName === 'VIDEO' || (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'VIDEO');
            const targetEl = el.tagName === 'SOURCE' ? el.parentElement : el;

            const submitMediaItem = (finalExt) => {
                const createMediaItem = () => {
                    let resGuessed = false;
                    let res = (isVideo && targetEl && targetEl.videoWidth) ? getResolution(targetEl.videoWidth, targetEl.videoHeight) : '';

                    if (!res) {
                        res = guessResolutionFromUrl(src);
                        if (res) resGuessed = true;
                    }

                    return {
                        url: src, type: isVideo ? 'video' : 'audio', ext: finalExt || (isVideo ? 'mp4' : 'mp3'),
                        duration: (targetEl && targetEl.duration) || 0,
                        width: targetEl ? (targetEl.videoWidth || 0) : 0,
                        height: targetEl ? (targetEl.videoHeight || 0) : 0,
                        resolution: res,
                        resGuessed: resGuessed
                    };
                };

                if (targetEl && targetEl.readyState >= 1) {
                    if (PAGE_SESSION_ID === currentSession) handleMediaFound(createMediaItem());
                } else if (targetEl) {
                    targetEl.addEventListener('loadedmetadata', () => {
                        if (PAGE_SESSION_ID === currentSession) handleMediaFound(createMediaItem());
                    }, { once: true });
                }
            };

            if (!format) {
                if (isVideo || el.tagName === 'AUDIO') {
                    GM_xmlhttpRequest({
                        method: 'HEAD',
                        url: src,
                        timeout: 3000,
                        onload: (res) => {
                            let ext = isVideo ? 'mp4' : 'mp3';
                            const ct = res.responseHeaders && res.responseHeaders.match(/content-type:\s*([^\s;\r\n]+)/i);
                            if (ct && ct[1]) {
                                const detected = detectFormat(src, ct[1]);
                                if (detected && detected.ext) ext = detected.ext;
                            }
                            submitMediaItem(ext);
                        },
                        onerror: () => submitMediaItem(isVideo ? 'mp4' : 'mp3'),
                        ontimeout: () => submitMediaItem(isVideo ? 'mp4' : 'mp3')
                    });
                }
            } else {
                submitMediaItem(format.ext);
            }
        });

        if (activeVideoEl) {
            let activeRes = getResolution(activeVideoEl.videoWidth, activeVideoEl.videoHeight);
            let activeWidth = activeVideoEl.videoWidth;
            let activeHeight = activeVideoEl.videoHeight;
            let activeDuration = activeVideoEl.duration || 0;

            if (IS_TOP) {
                syncDomRes(activeRes, activeWidth, activeHeight, activeDuration);
            } else {
                window.top.postMessage({ type: 'MH_SYNC_DOM_RES', resolution: activeRes, width: activeWidth, height: activeHeight, duration: activeDuration }, '*');
            }
        }
    }

    function startDOMScanner() {
        if (domScanTimer) clearInterval(domScanTimer);
        domScanCount = 0;
        domScanTimer = setInterval(() => {
            scanDOM();
            domScanCount++;
            if (domScanCount >= MAX_DOM_SCANS) {
                clearInterval(domScanTimer);
                domScanTimer = null;
            }
        }, 2000);
    }

    function setupNetworkSniffing() {
        const originalFetch = window.fetch;
        window.fetch = async function (input, init) {
            const reqSession = PAGE_SESSION_ID;
            const url = (typeof input === 'string') ? input : (input instanceof Request ? input.url : '');

            try {
                const response = await originalFetch.apply(this, arguments);
                const clone = response.clone();
                const contentType = clone.headers ? clone.headers.get('content-type') : '';

                const contentLength = clone.headers ? clone.headers.get('content-length') : null;
                if (contentLength && parseInt(contentLength, 10) > 3 * 1024 * 1024) {
                    checkNetworkResource(url, contentType, reqSession);
                    return response;
                }

                const isM3u8 = url.includes('.m3u8') || (contentType && (contentType.includes('mpegurl') || contentType.includes('application/x-mpegurl')));
                const isTextOrJson = contentType && (contentType.includes('json') || contentType.includes('text'));

                if (isM3u8 || isTextOrJson) {
                    clone.text().then(text => {
                        if (isM3u8) {
                            if (INTERCEPTED_TEXTS.size >= MAX_INTERCEPT_CACHE) {
                                INTERCEPTED_TEXTS.delete(INTERCEPTED_TEXTS.keys().next().value); // 删除最旧的
                            }
                            INTERCEPTED_TEXTS.set(url, text);
                        }
                        checkNetworkResource(url, contentType, reqSession);
                        // Fetch 是通常会混淆 URL 的 Json，启用转义替换
                        extractUrlsFromTextAsync(text, reqSession, true);
                    }).catch(()=>{
                        checkNetworkResource(url, contentType, reqSession);
                    });
                } else {
                    checkNetworkResource(url, contentType, reqSession);
                }

                return response;
            } catch (e) { throw e; }
        };

        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (method, url) {
            this._url = url;
            this._reqSession = PAGE_SESSION_ID;
            return originalXHROpen.apply(this, arguments);
        };
        XMLHttpRequest.prototype.send = function (body) {
            this.addEventListener('readystatechange', function () {
                if (this.readyState === 4) {
                    const contentType = this.getResponseHeader('content-type') || '';
                    const url = this.responseURL || this._url;

                    try {
                        const contentLength = this.getResponseHeader('content-length');
                        if (contentLength && parseInt(contentLength, 10) > 3 * 1024 * 1024) {
                            checkNetworkResource(url, contentType, this._reqSession);
                            return;
                        }

                        const isM3u8 = url.includes('.m3u8') || (contentType && (contentType.includes('mpegurl') || contentType.includes('application/x-mpegurl')));
                        const isTextOrJson = contentType && (contentType.includes('json') || contentType.includes('text'));

                        if (isM3u8 || isTextOrJson) {
                            if (this.responseType === '' || this.responseType === 'text') {
                                if (this.responseText) {
                                    if (isM3u8) {
                                        if (INTERCEPTED_TEXTS.size >= MAX_INTERCEPT_CACHE) {
                                            INTERCEPTED_TEXTS.delete(INTERCEPTED_TEXTS.keys().next().value);
                                        }
                                        INTERCEPTED_TEXTS.set(url, this.responseText);
                                    }
                                    checkNetworkResource(url, contentType, this._reqSession);
                                    extractUrlsFromTextAsync(this.responseText, this._reqSession, true);
                                } else {
                                    checkNetworkResource(url, contentType, this._reqSession);
                                }
                            } else if (this.responseType === 'json' && this.response) {
                                checkNetworkResource(url, contentType, this._reqSession);
                                extractUrlsFromTextAsync(JSON.stringify(this.response), this._reqSession, true);
                            } else {
                                checkNetworkResource(url, contentType, this._reqSession);
                            }
                        } else {
                            checkNetworkResource(url, contentType, this._reqSession);
                        }
                    } catch(e) {
                        checkNetworkResource(url, contentType, this._reqSession);
                    }
                }
            });
            return originalXHRSend.apply(this, arguments);
        };

        if (window.PerformanceObserver) {
            try {
                const observer = new PerformanceObserver((list) => {
                    const currentSession = PAGE_SESSION_ID;
                    list.getEntries().forEach(entry => {
                        if (entry.startTime < PAGE_START_TIME) return;

                        if (entry.entryType === 'resource') {
                            checkNetworkResource(entry.name, null, currentSession);
                        }
                    });
                });
                try {
                    observer.observe({ type: 'resource', buffered: true });
                } catch (e) {
                    observer.observe({ entryTypes: ['resource'] });
                }
            } catch (e) {
                console.warn("MediaHunter: PerformanceObserver init failed", e);
            }
        }

        if (window.performance && window.performance.getEntriesByType) {
            window.performance.getEntriesByType('resource').forEach(entry => {
                checkNetworkResource(entry.name, null, PAGE_SESSION_ID);
            });
        }
    }

    setupNetworkSniffing();

    function scheduleDurationRetry(mediaItem, sessionId) {
        [2000, 5000, 9000].forEach(delay => {
            setTimeout(async () => {
                if (PAGE_SESSION_ID !== sessionId) return;

                const existing = STATE.mediaList.find(m => m.url === mediaItem.url);
                if (existing && existing.duration > 0) return;

                let newDuration = 0;
                let newRes = existing ? existing.resolution : mediaItem.resolution;
                let resGuessed = existing ? existing.resGuessed : mediaItem.resGuessed;

                if (mediaItem.ext === 'm3u8') {
                    const metadata = await parseM3u8(mediaItem.url);
                    if (metadata) {
                        if (metadata.duration > 0) newDuration = metadata.duration;
                        if (metadata.resolution && (!newRes || resGuessed)) {
                            newRes = metadata.resolution;
                            resGuessed = false;
                        }
                    }
                } else {
                    const meta = await probeMediaMetadata(mediaItem.url, mediaItem.type);
                    if (meta) {
                        if (meta.duration > 0) newDuration = meta.duration;
                        if (meta.width && meta.height && (!newRes || resGuessed)) {
                            newRes = getResolution(meta.width, meta.height);
                            resGuessed = false;
                        }
                    }
                }

                if (PAGE_SESSION_ID === sessionId && newDuration > 0) {
                    const updatedMedia = existing
                        ? { ...existing, duration: newDuration, resolution: newRes, resGuessed: resGuessed }
                        : { ...mediaItem, duration: newDuration, resolution: newRes, resGuessed: resGuessed };
                    handleMediaFound(updatedMedia);
                }
            }, delay);
        });
    }

    async function checkNetworkResource(url, contentType, sourceSessionId = PAGE_SESSION_ID) {
        if (!url) return;
        if (sourceSessionId !== PAGE_SESSION_ID) return;

        const lowerUrl = url.toLowerCase();
        if (REGEX_IGNORE_URLS.test(lowerUrl)) return;

        const isKnown = STATE.sniffedUrls.has(url);
        const format = detectFormat(url, contentType);
        if (!format) return;

        const mediaItem = {
            url: url, type: getMediaType(format, url), ext: format.ext || (format.type ? format.type.split('/')[1] : 'unknown'),
            duration: 0, width: 0, height: 0, resolution: '', resGuessed: false
        };

        if (isKnown && mediaItem.ext !== 'm3u8') return;

        const reqSessionId = sourceSessionId;

        if (mediaItem.ext === 'm3u8') {
            const metadata = await parseM3u8(url);
            if (PAGE_SESSION_ID !== reqSessionId) return;
            if (metadata) {
                mediaItem.duration = metadata.duration;
                mediaItem.width = metadata.width;
                mediaItem.height = metadata.height;
                mediaItem.resolution = metadata.resolution;
                mediaItem.resGuessed = false;
            }
        } else if (!isKnown) {
            let meta = await probeMediaMetadata(url, mediaItem.type);

            if (PAGE_SESSION_ID !== reqSessionId) return;
            if (meta) {
                mediaItem.duration = meta.duration;
                mediaItem.width = meta.width;
                mediaItem.height = meta.height;
                mediaItem.resolution = getResolution(meta.width, meta.height);
                mediaItem.resGuessed = false;
            }
        }

        if (!mediaItem.resolution) {
            mediaItem.resolution = guessResolutionFromUrl(url);
            if (mediaItem.resolution) mediaItem.resGuessed = true;
        }

        if (PAGE_SESSION_ID === reqSessionId) {
            handleMediaFound(mediaItem);

            if (!mediaItem.duration && !mediaItem.isPageUrl) {
                scheduleDurationRetry(mediaItem, reqSessionId);
            }
        }
    }

    function initUI() {
        if (!IS_TOP) return;

        const host = document.createElement('div');
        host.id = 'mh-shadow-host';
        host.style.cssText = 'all: initial; position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; width: 0; height: 0; overflow: visible; pointer-events: none;';
        document.body.appendChild(host);

        shadowRoot = host.attachShadow({ mode: 'open' });

        const style = document.createElement('style');
        style.textContent = STYLES;
        shadowRoot.appendChild(style);

        const root = document.createElement('div');
        root.id = 'mh-root';
        root.style.pointerEvents = 'auto';
        root.style.display = 'none';

        const btn = document.createElement('div');
        btn.id = 'mh-float-btn';
        btn.innerHTML = `<div class="mh-logo-icon">${ICONS.logo}</div><span>媒体猎手</span>`;
        btn.onclick = togglePopup;
        root.appendChild(btn);

        const popup = document.createElement('div');
        popup.id = 'mh-popup';
        popup.innerHTML = `
            <div id="mh-header"><h3>MediaHunter 媒体猎手</h3><div id="mh-close-btn">${ICONS.close}</div></div>
            <div id="mh-content"></div>
        `;
        root.appendChild(popup);
        popup.querySelector('#mh-close-btn').onclick = togglePopup;

        shadowRoot.appendChild(root);

        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'MH_ADD_MEDIA') {
                addMedia(event.data.media);
            } else if (event.data && event.data.type === 'MH_SYNC_DOM_RES') {
                syncDomRes(event.data.resolution, event.data.width, event.data.height, event.data.duration);
            }
        });
    }

    function showButton() {
        if (!IS_TOP || STATE.hasButtonShown) return;
        const root = shadowRoot ? shadowRoot.getElementById('mh-root') : null;
        if (root) { root.style.display = 'block'; STATE.hasButtonShown = true; }
    }

    function togglePopup() {
        const btn = shadowRoot.getElementById('mh-float-btn');
        const popup = shadowRoot.getElementById('mh-popup');
        STATE.isPopupOpen = !STATE.isPopupOpen;
        btn.style.display = STATE.isPopupOpen ? 'none' : 'flex';
        popup.style.display = STATE.isPopupOpen ? 'flex' : 'none';
        if (STATE.isPopupOpen) scheduleRender();
    }

    function scheduleRender() {
        if (!STATE.isPopupOpen || isRenderPending) return;
        isRenderPending = true;
        window.requestAnimationFrame(() => {
            renderCards();
            isRenderPending = false;
        });
    }

    function renderCards() {
        const container = shadowRoot ? shadowRoot.getElementById('mh-content') : null;
        if (!container) return;

        let displayList = STATE.mediaList;
        const sniffedList = displayList.filter(m => !m.isPageUrl);

        if (sniffedList.length > 1) {
            displayList = displayList.filter(m => {
                if (m.isPageUrl) return true;
                if (m.type === 'audio') return true;
                if (!m.resolution) return false;

                let w = m.width || 0;
                let h = m.height || 0;

                if (h === 0 && m.resolution) {
                    const matchP = m.resolution.match(/(\d{3,4})P/i);
                    if (matchP) h = parseInt(matchP[1]);
                    else {
                        const matchX = m.resolution.match(/(\d+)x(\d+)/i);
                        if (matchX) {
                            w = parseInt(matchX[1]);
                            h = parseInt(matchX[2]);
                        }
                    }
                }

                if (m.resolution.toUpperCase() === '8K') h = 4320;
                if (m.resolution.toUpperCase() === '4K') h = 2160;
                if (m.resolution.toUpperCase() === '2K') h = 1440;

                if (w > 0 && w < 360) return false;
                if (h > 0 && h < 360) return false;

                return true;
            });
        }

        const pageList = [];
        const m3u8List = [];
        const normalList = [];

        displayList.forEach(media => {
            if (media.isPageUrl) {
                pageList.push(media);
            } else if (media.ext === 'm3u8') {
                m3u8List.push(media);
            } else {
                normalList.push(media);
            }
        });

        const sortedList = [...pageList, ...m3u8List, ...normalList];
        const fragment = document.createDocumentFragment();

        sortedList.forEach(media => {
            const card = document.createElement('div');
            card.className = media.isPageUrl ? 'mh-card mh-card-page' : 'mh-card';
            const icon = media.type === 'video' ? ICONS.video : ICONS.audio;

            let durationStr = !media.isPageUrl ? formatDuration(media.duration) : '--:--';
            let durationHtml = `<span class="mh-tag-dur">${durationStr}</span>`;

            let resHtml = `<span class="mh-tag-txt">${media.resolution || '--'}</span>`;
            let extHtml = `<span class="mh-tag-txt">.${media.ext.toUpperCase()}</span>`;

            let currentCopyText = "复制";
            if (media._copyUntil && Date.now() < media._copyUntil) {
                currentCopyText = media._copyText || "成功";
            }
            let currentDlText = "下载";
            if (media._dlUntil && Date.now() < media._dlUntil) {
                currentDlText = "成功";
            }

            card.innerHTML = `
                <div class="mh-card-top">
                    <div class="mh-card-icon">${icon}</div>
                    <div class="mh-card-title" title="${media.title}">${media.title}</div>
                </div>
                <div class="mh-card-bottom">
                    <div class="mh-info-group">${durationHtml}${resHtml}${extHtml}</div>
                    <div class="mh-actions">
                        <button class="mh-btn mh-btn-copy" id="mh-copy-${media.id}" title="单击复制直链，按住 Alt + 单击复制 yt-dlp 命令">${currentCopyText}</button>
                        <button class="mh-btn mh-btn-ytdlp" id="mh-dl-${media.id}">${currentDlText}</button>
                    </div>
                </div>
            `;

            let downloadExt = "%(ext)s";
            if (media.ext === 'm4s') {
                downloadExt = media.type === 'audio' ? 'm4a' : 'mp4';
            }

            const btnCopy = card.querySelector(`#mh-copy-${media.id}`);
            btnCopy.onclick = (e) => {
                const isAlt = e.altKey;
                if (isAlt) {
                    let targetUrl = media.url;
                    let safeTitle = (media.title || "未命名媒体").replace(/[\r\n"'|&<>*:?/\\]/g, ' ').trim();
                    const currentUrl = window.location.href;
                    const currentOrigin = window.location.origin;

                    const asciiTargetUrl = targetUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                    const asciiCurrentUrl = currentUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));

                    const cmdArgs = `"${asciiTargetUrl}" --referer "${asciiCurrentUrl}" --add-header "Origin: ${currentOrigin}" -o "D:\\00暂存\\02媒体猎手\\${safeTitle}_%(id)s.${downloadExt}"`;

                    GM_setClipboard(`yt-dlp ${cmdArgs}`);
                    media._copyText = "Copied";
                    window.getSelection().removeAllRanges();
                } else {
                    GM_setClipboard(media.url);
                    media._copyText = "成功";
                }

                media._copyUntil = Date.now() + 2000;
                btnCopy.innerText = media._copyText;

                if (media._copyTimer) clearTimeout(media._copyTimer);
                media._copyTimer = setTimeout(() => {
                    const btn = shadowRoot.getElementById(`mh-copy-${media.id}`);
                    if (btn) btn.innerText = "复制";
                }, 2000);
            };

            const btnDl = card.querySelector(`#mh-dl-${media.id}`);
            btnDl.onclick = (e) => {
                let targetUrl = media.url;
                let safeTitle = (media.title || "未命名媒体").replace(/[\r\n"'|&<>*:?/\\]/g, ' ').trim();
                const currentUrl = window.location.href;
                const currentOrigin = window.location.origin;

                const asciiTargetUrl = targetUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                const asciiCurrentUrl = currentUrl.replace(/[^\x00-\x7F]/g, c => encodeURIComponent(c));
                const protocolTargetUrl = asciiTargetUrl.replace(/%/g, '%25');
                const protocolCurrentUrl = asciiCurrentUrl.replace(/%/g, '%25');

                const cmdArgs = `"${protocolTargetUrl}" --referer "${protocolCurrentUrl}" --add-header "Origin: ${currentOrigin}" -o "D:\\00暂存\\02媒体猎手\\${safeTitle}_%(id)s.${downloadExt}"`;
                const protocolUrl = `ytdlp:${cmdArgs}`;

                const a = document.createElement('a');
                a.href = protocolUrl;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => document.body.removeChild(a), 1500);

                media._dlUntil = Date.now() + 2000;
                btnDl.innerText = "成功";

                if (media._dlTimer) clearTimeout(media._dlTimer);
                media._dlTimer = setTimeout(() => {
                    const btn = shadowRoot.getElementById(`mh-dl-${media.id}`);
                    if (btn) btn.innerText = "下载";
                }, 2000);
            };

            fragment.appendChild(card);
        });

        container.innerHTML = '';
        container.appendChild(fragment);
    }

    const runTextExtractors = (sessionId) => {
        [1500, 3500, 6000].forEach(delay => {
            setTimeout(() => {
                if (PAGE_SESSION_ID !== sessionId) return;

                const scripts = document.getElementsByTagName('script');
                for (let i = 0; i < scripts.length; i++) {
                    if (scripts[i].textContent && scripts[i].textContent.length < 500000) {
                        extractUrlsFromTextAsync(scripts[i].textContent, sessionId, true);
                    }
                }

                if (document.body && document.body.innerHTML) {
                    const bodyHtml = document.body.innerHTML;
                    if (bodyHtml.length < 3 * 1024 * 1024) {
                        extractUrlsFromTextAsync(bodyHtml, sessionId, false);
                    }
                }
            }, delay);
        });
    };

    function setupSPAHandling() {
        let lastUrl = window.location.href;

        const handleUrlChange = () => {
            if (window.location.href !== lastUrl) {
                lastUrl = window.location.href;

                if (STATE.isPopupOpen) {
                    STATE.isPopupOpen = false;
                    if (shadowRoot) {
                        const btn = shadowRoot.getElementById('mh-float-btn');
                        const popup = shadowRoot.getElementById('mh-popup');
                        if (btn) btn.style.display = 'flex';
                        if (popup) popup.style.display = 'none';
                    }
                }

                PAGE_SESSION_ID = Date.now();
                PAGE_START_TIME = window.performance ? window.performance.now() : 0;
                STATE.mediaList = [];
                STATE.sniffedUrls.clear();
                INTERCEPTED_TEXTS.clear();

                if (IS_TOP && isKnownYtDlpSite()) {
                    addMedia({
                        url: window.location.href, type: 'video', ext: 'PAGE', duration: 0, width: 0, height: 0,
                        resolution: '原生支持', title: `${document.title || window.location.hostname}`, isPageUrl: true
                    });
                }

                runTextExtractors(PAGE_SESSION_ID);
                startDOMScanner();
                scheduleRender();
            }
        };

        const originalPushState = history.pushState;
        history.pushState = function() {
            const ret = originalPushState.apply(this, arguments);
            handleUrlChange();
            return ret;
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = function() {
            const ret = originalReplaceState.apply(this, arguments);
            handleUrlChange();
            return ret;
        };

        window.addEventListener('popstate', handleUrlChange);
    }

    function init() {
        setupSPAHandling();
        runTextExtractors(PAGE_SESSION_ID);
        startDOMScanner();

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