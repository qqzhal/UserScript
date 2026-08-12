// ==UserScript==
// @name         MissAV 字幕悬浮球助手
// @name:zh-CN   MissAV 字幕悬浮球助手
// @namespace    https://greasyfork.org/scripts/missav-subtitle-ball
// @version      1.4.0
// @description  Add subtitle loading, appearance controls, online search, hotkeys, and a draggable floating-ball panel for MissAV and Jable. Added subtitle viewer auto-scroll feature.
// @description:zh-CN 为 MissAV 与 Jable 提供本地字幕加载、字幕样式调节、在线字幕搜索、快捷键控制与可拖拽字幕悬浮球面板，字幕预览窗口支持跟随播放进度滚动。
// @author       时光Alex
// @match        *://missav123.com/*
// @match        *://missav.ws/*
// @match        *://missav.ai/*
// @match        *://missav.com/*
// @match        *://missav.live/*
// @match        *://jable.tv/*
// @match        *://hanime1.me/*
// @match        *://www.jable.tv/*
// @match        *://highporn.net/*
// @match        *://www.tnaflix.com/*
// @noframes
// @grant        GM.xmlHttpRequest
// @grant        GM.openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @inject-into  content
// @connect      api-shoulei-ssl.xunlei.com
// @connect      xunlei.com
// @connect      geilijiasu.com
// @connect      v.geilijiasu.com
// @license      MIT
// @run-at       document-end
// @downloadURL https://update.greasyfork.org/scripts/568678/MissAV%20%E5%AD%97%E5%B9%95%E6%82%AC%E6%B5%AE%E7%90%83%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/568678/MissAV%20%E5%AD%97%E5%B9%95%E6%82%AC%E6%B5%AE%E7%90%83%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const PLAYER_STATE_EVENT = 'missav-player-state';
    const PLAYER_STATE_ATTR = 'data-missav-player-state';
    const PLAYER_BRIDGE_ID = 'missav-player-bridge';
    const FLOATING_BUTTON_POSITION_KEY = 'missavFloatingButtonPosition';
    const FLOATING_UI_GAP = 8;
    const VIDEO_QUERY_SELECTORS = [
        'video#player',
        '.plyr video',
        '.video-js video',
        '.jwplayer video',
        'video'
    ];
    const VIDEO_CONTAINER_SELECTORS = [
        '.plyr__video-wrapper',
        '.player-container',
        '#player-container',
        '.video-js',
        '.jwplayer',
        '.jw-wrapper',
        '.video-img-box',
        '.video-player'
    ];
    const VIDEO_ANCESTOR_SELECTORS = [
        ...VIDEO_CONTAINER_SELECTORS,
        '.plyr',
        '.player',
        '[class*="video-player"]',
        '[class*="player"]'
    ];
    

    // --- Styles ---
    addStyle(`
        .custom-control-panel {
            position: fixed;
            left: 12px;
            bottom: 78px;
            background: linear-gradient(135deg, rgba(30, 30, 40, 0.95), rgba(40, 40, 55, 0.95));
            color: white;
            padding: 10px 12px;
            z-index: 9999;
            border-radius: 10px;
            width: min(292px, calc(100vw - 24px));
            max-height: min(420px, calc(100vh - 120px));
            overflow-y: auto;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            transition: all 0.3s ease;
            display: none;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px 10px;
            align-items: end;
        }
        .custom-control-panel label {
            margin-right: 0;
            display: block;
            min-width: 0;
            text-align: left;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 500;
            font-size: 11px;
            line-height: 1.2;
        }
        .custom-control-panel input[type="number"],
        .custom-control-panel input[type="text"],
        .custom-control-panel input[type="color"] {
            width: 100%;
            margin-right: 0;
            color: white;
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(100, 150, 255, 0.3);
            border-radius: 6px;
            padding: 4px 6px;
            box-sizing: border-box;
            transition: all 0.2s ease;
            font-size: 12px;
            height: 30px;
        }
        .custom-control-panel input[type="number"]:focus,
        .custom-control-panel input[type="text"]:focus,
        .custom-control-panel input[type="color"]:focus {
            outline: none;
            border-color: rgba(100, 150, 255, 0.6);
            background: rgba(255, 255, 255, 0.18);
            box-shadow: 0 0 8px rgba(100, 150, 255, 0.3);
        }
        .custom-control-panel input[type="color"] {
            padding: 2px;
            min-width: 56px;
            cursor: pointer;
        }
        .custom-control-panel input[data-key-name="subtitleOffset"],
        .custom-control-panel input[data-key-name="subtitlePosition"] {
             width: 100%;
        }
        .custom-control-panel button {
            background: linear-gradient(135deg, #4a90e2, #357abd);
            border: none;
            color: white;
            padding: 7px 8px;
            border-radius: 6px;
            cursor: pointer;
            margin: 0;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s ease;
            box-shadow: 0 2px 8px rgba(58, 123, 200, 0.3);
            white-space: nowrap;
            min-height: 30px;
        }
        .custom-control-panel button:hover {
            background: linear-gradient(135deg, #5aa0f2, #4589cd);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(58, 123, 200, 0.4);
        }
        .custom-control-panel button:active {
            transform: translateY(0);
            box-shadow: 0 1px 4px rgba(58, 123, 200, 0.3);
        }
        .custom-control-panel .input-group {
            margin-bottom: 0;
            display: grid;
            grid-template-columns: minmax(0, 1fr) 56px;
            align-items: center;
            gap: 6px;
            min-width: 0;
        }
        .custom-control-panel .button-group {
            grid-column: 1 / -1;
            margin-top: 2px;
            border-top: 1px solid rgba(255, 255, 255, 0.15);
            padding-top: 8px;
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
        }
        .custom-subtitle {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            color: white;
            font-size: 26px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.8);
            background: rgba(0,0,0,0.4);
            padding: 5px 10px;
            border-radius: 5px;
            max-width: 85%;
            text-align: center;
            transition: opacity 0.3s, bottom 0.2s ease-out;
            z-index: 2147483647 !important;
            pointer-events: none;
        }
        .subtitle-list {
            position: fixed;
            left: 12px;
            bottom: 140px;
            background: linear-gradient(135deg, rgba(30, 30, 40, 0.95), rgba(40, 40, 55, 0.95));
            color: white;
            max-height: min(320px, calc(100vh - 180px));
            width: min(280px, calc(100vw - 24px));
            overflow-y: auto;
            padding: 10px;
            border-radius: 10px;
            z-index: 10001;
            border: 1px solid rgba(100, 150, 255, 0.3);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(10px);
        }
        .subtitle-item {
            padding: 7px 8px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 11px;
            border-radius: 6px;
            margin-bottom: 4px;
            transition: all 0.2s ease;
        }
        .subtitle-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        .subtitle-item:hover {
            background: rgba(100, 150, 255, 0.25);
            transform: translateX(4px);
            border-color: rgba(100, 150, 255, 0.3);
        }
        .show-controls-button {
            position: fixed;
            left: 14px;
            bottom: 16px;
            background: linear-gradient(135deg, #4a90e2, #357abd);
            color: white;
            width: 52px;
            height: 52px;
            padding: 0;
            border: none;
            border-radius: 999px;
            cursor: pointer;
            z-index: 9998;
            font-size: 11px;
            font-weight: 500;
            box-shadow: 0 4px 16px rgba(58, 123, 200, 0.4);
            transition: all 0.3s ease;
            backdrop-filter: blur(5px);
            display: flex;
            align-items: center;
            justify-content: center;
            user-select: none;
            -webkit-user-select: none;
            touch-action: none;
            cursor: grab;
        }
        .show-controls-button:hover {
            background: linear-gradient(135deg, #5aa0f2, #4589cd);
            transform: translateY(-2px) scale(1.02);
            box-shadow: 0 6px 20px rgba(58, 123, 200, 0.5);
        }
        .show-controls-button.dragging {
            transition: none;
            transform: none;
            cursor: grabbing;
        }
        .custom-control-panel button.full-width {
            grid-column: 1 / -1;
        }
        .subtitle-content-viewer {
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, rgba(30, 30, 40, 0.98), rgba(40, 40, 55, 0.98));
            color: white;
            width: min(500px, calc(100vw - 40px));
            height: min(600px, calc(100vh - 100px));
            padding: 15px;
            border-radius: 12px;
            z-index: 20000;
            border: 1px solid rgba(100, 150, 255, 0.4);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(20px);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .subtitle-content-viewer .viewer-drag-handle {
            cursor: move;
            touch-action: none;
            padding-bottom: 10px;
            margin-bottom: 10px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            font-weight: bold;
            flex-shrink: 0;
            user-select: none;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .subtitle-content-viewer .viewer-content {
            flex: 1;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }
        /* 字幕列表样式 */
        .subtitle-viewer-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        .subtitle-viewer-item {
            padding: 6px 8px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            font-size: 12px;
            line-height: 1.4;
            transition: background 0.1s ease;
        }
        .subtitle-viewer-item.current {
            background: rgba(74, 144, 226, 0.4);
            border-left: 3px solid #4a90e2;
        }
        .subtitle-viewer-time {
            color: #aaa;
            font-size: 14px;
            margin-right: 10px;
            font-family: monospace;
        }
        .subtitle-viewer-text {
            display: inline;
        }
        .close-viewer {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: white;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
            margin-left: 8px;
        }
        .close-viewer:hover {
            background: rgba(255, 0, 0, 0.4);
        }
        .follow-toggle {
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: white;
            padding: 4px 10px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 11px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
        }
        .follow-toggle.active {
            background: #4a90e2;
            color: white;
        }
        .follow-toggle:hover {
            background: rgba(74, 144, 226, 0.7);
        }
        @media (max-width: 640px) {
            .custom-control-panel {
                left: 10px;
                width: auto;
                max-height: calc(100vh - 108px);
                bottom: 74px;
            }
            .subtitle-list {
                left: 10px;
                width: auto;
            }
            .show-controls-button {
                left: 12px;
                bottom: 14px;
            }
        }
    `);

    // --- Global Variables ---
    let accelerationRate = parseFloat(localStorage.getItem('missavAccelerationRate')) || 3;
    let skipTime = parseFloat(localStorage.getItem('missavSkipTime')) || 5;
    let subtitleOffset = parseFloat(localStorage.getItem('missavSubtitleOffset')) || 0;
    let subtitleVerticalPositionPercent = parseFloat(localStorage.getItem('missavSubtitlePosition')) || 15;
    let subtitleFontSize = parseFloat(localStorage.getItem('missavSubtitleSize')) || 26;
    let subtitleColor = normalizeHexColor(localStorage.getItem('missavSubtitleColor')) || '#ffffff';
    let isAccelerating = false;
    let floatingButtonPosition = null;
    let floatingButtonDragState = null;
    let suppressFloatingButtonClick = false;
    let videoElement = null;
    let playerMonitorInterval = null;
    let hasShownPlayerReadyToast = false;
    let playerBridgeState = {
        currentTime: 0,
        paused: true,
        ended: false,
        seeking: false,
        reason: ''
    };
    let isBridgeActive = false;
    let subtitles = [];
    let originalSubtitleText = '';
    let shortcutKeys = {
        accelerate: localStorage.getItem('missavAccelerateKey') || 'z',
        forward: localStorage.getItem('missavForwardKey') || 'x',
        backward: localStorage.getItem('missavBackwardKey') || 'c'
    };

    // 字幕预览窗口跟随滚动相关
    let subtitleViewerElement = null;
    let isFollowScrollEnabled = false;
    let lastActiveIndex = -1;
    let timeUpdateHandler = null;

    // --- UI Elements ---
    let controlPanel;
    let subtitleElement;
    let videoContainer;
    let subtitleList = null;
    let showControlsButton = null;

    // --- Functions ---

    function addStyle(css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function normalizeHexColor(value) {
        if (typeof value !== 'string') return null;

        const normalized = value.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/i.test(normalized)) {
            return normalized;
        }

        if (/^#[0-9a-f]{3}$/i.test(normalized)) {
            return `#${normalized.slice(1).split('').map((char) => char + char).join('')}`;
        }

        return null;
    }

    function getViewportMargin() {
        return window.innerWidth <= 640 ? 10 : 12;
    }

    function loadFloatingButtonPosition() {
        try {
            const raw = localStorage.getItem(FLOATING_BUTTON_POSITION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!Number.isFinite(parsed?.left) || !Number.isFinite(parsed?.top)) {
                return null;
            }
            return { left: parsed.left, top: parsed.top };
        } catch (error) {
            console.warn('Missav Script: Failed to load floating button position.', error);
            return null;
        }
    }

    function saveFloatingButtonPosition() {
        if (!floatingButtonPosition) return;

        try {
            localStorage.setItem(FLOATING_BUTTON_POSITION_KEY, JSON.stringify(floatingButtonPosition));
        } catch (error) {
            console.warn('Missav Script: Failed to save floating button position.', error);
        }
    }

    function clampFloatingButtonPosition(position) {
        const margin = getViewportMargin();
        const buttonWidth = showControlsButton?.offsetWidth || 52;
        const buttonHeight = showControlsButton?.offsetHeight || 52;

        return {
            left: clamp(position.left, margin, Math.max(margin, window.innerWidth - buttonWidth - margin)),
            top: clamp(position.top, margin, Math.max(margin, window.innerHeight - buttonHeight - margin))
        };
    }

    function getDefaultFloatingButtonPosition() {
        const margin = getViewportMargin();
        const buttonHeight = showControlsButton?.offsetHeight || 52;
        return clampFloatingButtonPosition({
            left: margin + 2,
            top: window.innerHeight - buttonHeight - 16
        });
    }

    function applyFloatingButtonPosition() {
        if (!showControlsButton) return;

        if (!floatingButtonPosition) {
            floatingButtonPosition = loadFloatingButtonPosition() || getDefaultFloatingButtonPosition();
        }

        floatingButtonPosition = clampFloatingButtonPosition(floatingButtonPosition);
        showControlsButton.style.left = `${floatingButtonPosition.left}px`;
        showControlsButton.style.top = `${floatingButtonPosition.top}px`;
        showControlsButton.style.right = 'auto';
        showControlsButton.style.bottom = 'auto';
    }

    function getBallAnchorRect() {
        if (!showControlsButton) return null;
        applyFloatingButtonPosition();

        if (showControlsButton.style.display !== 'none') {
            const rect = showControlsButton.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return rect;
            }
        }

        const buttonWidth = showControlsButton.offsetWidth || 52;
        const buttonHeight = showControlsButton.offsetHeight || 52;
        const position = floatingButtonPosition || getDefaultFloatingButtonPosition();

        return {
            left: position.left,
            top: position.top,
            right: position.left + buttonWidth,
            bottom: position.top + buttonHeight,
            width: buttonWidth,
            height: buttonHeight
        };
    }

    function positionControlPanel() {
        if (!controlPanel || controlPanel.style.display === 'none') return;

        const anchorRect = getBallAnchorRect();
        if (!anchorRect) return;

        const margin = getViewportMargin();
        const gap = FLOATING_UI_GAP;
        const panelWidth = Math.min(controlPanel.offsetWidth || 292, Math.max(220, window.innerWidth - margin * 2));
        controlPanel.style.width = `${panelWidth}px`;
        controlPanel.style.maxHeight = `${Math.max(200, window.innerHeight - margin * 2)}px`;

        const panelHeight = Math.min(controlPanel.scrollHeight, window.innerHeight - margin * 2);
        const alignRight = anchorRect.left > window.innerWidth / 2;
        const preferredLeft = alignRight ? anchorRect.right - panelWidth : anchorRect.left;
        const left = clamp(preferredLeft, margin, Math.max(margin, window.innerWidth - panelWidth - margin));

        const spaceAbove = anchorRect.top - margin - gap;
        const spaceBelow = window.innerHeight - anchorRect.bottom - margin - gap;
        const shouldOpenAbove = spaceAbove >= panelHeight || spaceAbove >= spaceBelow;
        const preferredTop = shouldOpenAbove
            ? anchorRect.top - panelHeight - gap
            : anchorRect.bottom + gap;
        const top = clamp(preferredTop, margin, Math.max(margin, window.innerHeight - panelHeight - margin));

        controlPanel.style.left = `${left}px`;
        controlPanel.style.top = `${top}px`;
        controlPanel.style.right = 'auto';
        controlPanel.style.bottom = 'auto';
    }

    function cleanupFloatingButtonDrag() {
        document.removeEventListener('pointermove', handleFloatingButtonPointerMove);
        document.removeEventListener('pointerup', handleFloatingButtonPointerUp);
        document.removeEventListener('pointercancel', handleFloatingButtonPointerUp);
    }

    function handleFloatingButtonPointerMove(event) {
        if (!floatingButtonDragState) return;

        const deltaX = event.clientX - floatingButtonDragState.startX;
        const deltaY = event.clientY - floatingButtonDragState.startY;
        if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
            suppressFloatingButtonClick = true;
        }

        floatingButtonPosition = clampFloatingButtonPosition({
            left: floatingButtonDragState.originLeft + deltaX,
            top: floatingButtonDragState.originTop + deltaY
        });

        applyFloatingButtonPosition();
        positionControlPanel();
        positionSubtitleList();
    }

    function handleFloatingButtonPointerUp(event) {
        if (showControlsButton?.classList.contains('dragging')) {
            showControlsButton.classList.remove('dragging');
        }

        if (showControlsButton && floatingButtonDragState && event.pointerId !== undefined && showControlsButton.hasPointerCapture?.(event.pointerId)) {
            showControlsButton.releasePointerCapture(event.pointerId);
        }

        cleanupFloatingButtonDrag();

        if (floatingButtonDragState && suppressFloatingButtonClick) {
            saveFloatingButtonPosition();
        }

        floatingButtonDragState = null;
    }

    function handleFloatingButtonPointerDown(event) {
        if (event.button !== undefined && event.button !== 0) return;
        if (!showControlsButton) return;

        applyFloatingButtonPosition();
        const rect = showControlsButton.getBoundingClientRect();
        floatingButtonDragState = {
            startX: event.clientX,
            startY: event.clientY,
            originLeft: rect.left,
            originTop: rect.top
        };
        suppressFloatingButtonClick = false;
        showControlsButton.classList.add('dragging');

        if (event.pointerId !== undefined) {
            showControlsButton.setPointerCapture?.(event.pointerId);
        }

        document.addEventListener('pointermove', handleFloatingButtonPointerMove);
        document.addEventListener('pointerup', handleFloatingButtonPointerUp);
        document.addEventListener('pointercancel', handleFloatingButtonPointerUp);
    }

    function handleFloatingButtonClick(event) {
        if (suppressFloatingButtonClick) {
            suppressFloatingButtonClick = false;
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        showControlPanel();
    }

    function handleViewportChange() {
        applyFloatingButtonPosition();
        positionControlPanel();
        positionSubtitleList();
    }

    function openInNewTab(url) {
        try {
            if (typeof GM !== 'undefined' && typeof GM.openInTab === 'function') {
                return GM.openInTab(url, false);
            }
            if (typeof GM_openInTab === 'function') {
                return GM_openInTab(url, { active: true, insert: true });
            }
        } catch (error) {
            console.warn('Missav Script: GM.openInTab failed, falling back to window.open.', error);
        }

        return window.open(url, '_blank', 'noopener');
    }

    function gmRequest(details) {
        return new Promise((resolve, reject) => {
            const timeoutSeconds = details.timeout ? Math.ceil(details.timeout / 1000) : 0;
            const request = {
                ...details,
                onload: (response) => resolve(response),
                onerror: (error) => reject(error instanceof Error ? error : new Error('网络错误或请求被阻止')),
                ontimeout: () => reject(new Error(`请求超时${timeoutSeconds ? ` (${timeoutSeconds}秒)` : ''}`))
            };

            try {
                if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
                    GM.xmlHttpRequest(request);
                    return;
                }

                if (typeof GM_xmlhttpRequest === 'function') {
                    GM_xmlhttpRequest(request);
                    return;
                }
            } catch (error) {
                reject(error);
                return;
            }

            reject(new Error('当前脚本管理器不支持 GM.xmlHttpRequest'));
        });
    }

    function parseJsonResponse(response) {
        if (response?.response && typeof response.response === 'object') {
            return response.response;
        }

        if (typeof response?.responseText === 'string' && response.responseText.trim()) {
            return JSON.parse(response.responseText);
        }

        throw new Error('无法解析服务器响应 (JSON)');
    }

    function getResponseText(response) {
        if (typeof response?.responseText === 'string') {
            return response.responseText;
        }

        if (typeof response?.response === 'string') {
            return response.response;
        }

        return '';
    }

    function findPageVideo(root = document) {
        for (const selector of VIDEO_QUERY_SELECTORS) {
            const candidate = root.querySelector(selector);
            if (candidate instanceof HTMLVideoElement) {
                return candidate;
            }
        }

        const fallbackVideo = root.querySelector('video');
        return fallbackVideo instanceof HTMLVideoElement ? fallbackVideo : null;
    }

    function findVideoContainer(video = null) {
        const currentVideo = video || findVideoElement() || findPageVideo();

        if (currentVideo) {
            // 针对 hanime1.me (Plyr) 的特殊处理，优先挂载到最外层容器防止裁剪
            if (location.hostname.includes('hanime1.me')) {
                // 优先寻找 Plyr 的包装容器
                const plyrContainer = currentVideo.closest('.plyr') || currentVideo.closest('.plyr--video');
                if (plyrContainer) return plyrContainer;
            }

            for (const selector of VIDEO_ANCESTOR_SELECTORS) {
                const candidate = currentVideo.closest(selector);
                if (candidate && candidate !== document.body && candidate !== document.documentElement) {
                    return candidate;
                }
            }

            if (currentVideo.parentElement) {
                return currentVideo.parentElement;
            }
        }

        for (const selector of VIDEO_CONTAINER_SELECTORS) {
            const candidate = document.querySelector(selector);
            if (candidate) {
                return candidate;
            }
        }

        return null;
    }

    function scoreVideoElement(video) {
        if (!video) return -Infinity;

        const rect = video.getBoundingClientRect();
        const style = getComputedStyle(video);
        const isVisible = style.display !== 'none'
            && style.visibility !== 'hidden'
            && parseFloat(style.opacity || '1') !== 0
            && rect.width >= 160
            && rect.height >= 90;
        const hasSource = Boolean(video.currentSrc || video.src);
        const isLikelyPlayer = video.id === 'player'
            || video.closest('.plyr')
            || video.closest('.player')
            || video.closest('.video-js')
            || video.closest('.jwplayer')
            || video.closest('[class*="video-player"]');
        const isPlaying = !video.paused && !video.ended;

        return (isLikelyPlayer ? 1_000_000 : 0)
            + (isVisible ? 100_000 : 0)
            + (isPlaying ? 10_000 : 0)
            + (hasSource ? 1_000 : 0)
            + Math.round(rect.width * rect.height);
    }

    function injectPlayerBridge() {
        if (document.getElementById(PLAYER_BRIDGE_ID)) return;

        const bridgeScript = document.createElement('script');
        bridgeScript.id = PLAYER_BRIDGE_ID;
        bridgeScript.textContent = `
            (() => {
                const EVENT_NAME = ${JSON.stringify(PLAYER_STATE_EVENT)};
                const STATE_ATTR = ${JSON.stringify(PLAYER_STATE_ATTR)};
                const VIDEO_SELECTORS = ${JSON.stringify(VIDEO_QUERY_SELECTORS)};
                if (window.__MISSAV_PLAYER_BRIDGE__) return;
                window.__MISSAV_PLAYER_BRIDGE__ = true;

                let boundPlayer = null;
                let media = null;
                let rafId = null;
                let rvfcId = null;

                const mediaEvents = ['play', 'playing', 'pause', 'seeking', 'seeked', 'waiting', 'ended', 'loadedmetadata', 'ratechange'];
                const findMediaElement = () => {
                    for (const selector of VIDEO_SELECTORS) {
                        const candidate = document.querySelector(selector);
                        if (candidate instanceof HTMLVideoElement) {
                            return candidate;
                        }
                    }
                    return document.querySelector('video');
                };

                const emit = (reason) => {
                    const currentTime = media && typeof media.currentTime === 'number'
                        ? media.currentTime
                        : boundPlayer && typeof boundPlayer.currentTime === 'number'
                            ? boundPlayer.currentTime
                            : 0;

                    const root = document.documentElement;
                    if (root) {
                        root.setAttribute(STATE_ATTR, JSON.stringify({
                            currentTime,
                            paused: media ? !!media.paused : !(boundPlayer && !boundPlayer.paused),
                            ended: media ? !!media.ended : false,
                            seeking: media ? !!media.seeking : false,
                            reason
                        }));
                    }

                    document.dispatchEvent(new CustomEvent(EVENT_NAME));
                };

                const stopLoop = () => {
                    if (media && typeof media.cancelVideoFrameCallback === 'function' && rvfcId !== null) {
                        try { media.cancelVideoFrameCallback(rvfcId); } catch (error) {}
                    }
                    if (rafId !== null) {
                        cancelAnimationFrame(rafId);
                    }
                    rafId = null;
                    rvfcId = null;
                };

                const frameStep = () => {
                    emit('frame');
                    startLoop();
                };

                const startLoop = () => {
                    stopLoop();
                    if (!media || media.paused || media.ended || document.visibilityState === 'hidden') {
                        return;
                    }

                    if (typeof media.requestVideoFrameCallback === 'function') {
                        rvfcId = media.requestVideoFrameCallback(() => frameStep());
                    } else {
                        rafId = requestAnimationFrame(frameStep);
                    }
                };

                const onMediaEvent = (event) => {
                    emit(event.type);
                    if (event.type === 'pause' || event.type === 'waiting' || event.type === 'ended') {
                        stopLoop();
                        return;
                    }
                    startLoop();
                };

                const cleanupMedia = () => {
                    stopLoop();
                    if (media) {
                        mediaEvents.forEach((eventName) => media.removeEventListener(eventName, onMediaEvent));
                    }
                };

                const bindMedia = (nextMedia, player = null) => {
                    if (!nextMedia) return false;

                    if (boundPlayer === player && media === nextMedia && nextMedia.isConnected) {
                        return true;
                    }

                    cleanupMedia();
                    boundPlayer = player;
                    media = nextMedia;
                    mediaEvents.forEach((eventName) => media.addEventListener(eventName, onMediaEvent, { passive: true }));
                    emit('bind');
                    startLoop();
                    return true;
                };

                const bindPlayer = (player) => {
                    if (!player) return false;
                    const nextMedia = player.media || findMediaElement();
                    return bindMedia(nextMedia, player);
                };

                const getPlayerCandidates = () => {
                    const candidates = [];
                    if (window.player) candidates.push(window.player);
                    if (window.plyr) candidates.push(window.plyr);
                    if (typeof window.videojs === 'function' && typeof window.videojs.getPlayers === 'function') {
                        candidates.push(...Object.values(window.videojs.getPlayers()));
                    }
                    return candidates.filter(Boolean);
                };

                document.addEventListener('visibilitychange', () => {
                    emit('visibilitychange');
                    if (document.visibilityState === 'hidden') {
                        stopLoop();
                    } else {
                        startLoop();
                    }
                });

                setInterval(() => {
                    for (const candidate of getPlayerCandidates()) {
                        if (bindPlayer(candidate)) {
                            return;
                        }
                    }

                    if (bindMedia(findMediaElement())) {
                        return;
                    }

                    if (media && media.isConnected) {
                        emit('poll');
                    }
                }, 1000);
            })();
        `;

        (document.documentElement || document.head || document.body).appendChild(bridgeScript);
        bridgeScript.remove();
    }

    function handlePlayerStateEvent() {
        const detailText = document.documentElement?.getAttribute(PLAYER_STATE_ATTR);
        if (!detailText) return;

        let detail;
        try {
            detail = JSON.parse(detailText);
        } catch (error) {
            console.warn('Missav Script: Failed to parse bridged player state.', error);
            return;
        }

        playerBridgeState = {
            currentTime: Number.isFinite(detail.currentTime) ? detail.currentTime : 0,
            paused: Boolean(detail.paused),
            ended: Boolean(detail.ended),
            seeking: Boolean(detail.seeking),
            reason: typeof detail.reason === 'string' ? detail.reason : '',
            lastUpdate: Date.now()
        };
        isBridgeActive = true;

        // frame 事件每帧触发，只在绑定/轮询事件或视频丢失时重新查找播放器
        if (detail.reason === 'bind' || detail.reason === 'poll'
            || !videoElement || !videoElement.isConnected) {
            const currentVideo = findVideoElement();
            if (currentVideo) {
                bindVideoElement(currentVideo);
            }
        }

        updateSubtitle();
        // 更新预览窗口的高亮和滚动
        if (subtitleViewerElement && isFollowScrollEnabled) {
            updateSubtitleViewerHighlight();
        }
    }

    function setupPlayerBridge() {
        document.removeEventListener(PLAYER_STATE_EVENT, handlePlayerStateEvent);
        document.addEventListener(PLAYER_STATE_EVENT, handlePlayerStateEvent);
        injectPlayerBridge();
    }

    function setSubtitleText(text) {
        if (!subtitleElement) return;

        const normalizedText = typeof text === 'string' ? text : '';
        if (subtitleElement.textContent !== normalizedText) {
            subtitleElement.textContent = normalizedText;
        }
        subtitleElement.style.display = normalizedText ? 'block' : 'none';
    }

    function positionSubtitleList() {
        if (!subtitleList) return;

        const margin = getViewportMargin();
        const gap = FLOATING_UI_GAP;
        const panelVisible = controlPanel && controlPanel.style.display !== 'none';
        const anchorRect = panelVisible
            ? controlPanel.getBoundingClientRect()
            : getBallAnchorRect();

        if (!anchorRect) return;

        subtitleList.style.width = `${Math.min(280, Math.max(220, window.innerWidth - margin * 2))}px`;
        const listWidth = subtitleList.offsetWidth || 280;
        const maxHeight = Math.max(160, window.innerHeight - margin * 2);
        subtitleList.style.maxHeight = `${maxHeight}px`;
        const listHeight = Math.min(subtitleList.scrollHeight, maxHeight);

        let left = anchorRect.left;
        let top = anchorRect.top - listHeight - gap;

        if (panelVisible && window.innerWidth > 640) {
            const spaceRight = window.innerWidth - anchorRect.right - margin;
            const spaceLeft = anchorRect.left - margin;

            if (spaceRight >= listWidth + gap) {
                left = anchorRect.right + gap;
                top = anchorRect.top;
            } else if (spaceLeft >= listWidth + gap) {
                left = anchorRect.left - listWidth - gap;
                top = anchorRect.top;
            }
        }

        left = clamp(left, margin, Math.max(margin, window.innerWidth - listWidth - margin));
        top = clamp(top, margin, Math.max(margin, window.innerHeight - listHeight - margin));

        subtitleList.style.left = `${left}px`;
        subtitleList.style.top = `${top}px`;
        subtitleList.style.right = 'auto';
        subtitleList.style.bottom = 'auto';
    }

    function clearSubtitleTrack() {
        setSubtitleText('');
    }

    function findVideoElement() {
        const videos = Array.from(document.querySelectorAll('video'));
        if (videos.length === 0) return null;

        return videos
            .sort((left, right) => scoreVideoElement(right) - scoreVideoElement(left))[0] || null;
    }

    function handleVideoTimeUpdate() {
        requestAnimationFrame(updateSubtitle);
    }

    function bindVideoElement(video) {
        if (!video) return false;

        if (videoElement && videoElement !== video) {
            videoElement.removeEventListener('timeupdate', handleVideoTimeUpdate);
            videoElement.removeEventListener('seeking', handleVideoTimeUpdate);
            videoElement.removeEventListener('seeked', handleVideoTimeUpdate);
            videoElement.removeEventListener('loadedmetadata', handleVideoTimeUpdate);
            // 移除时间更新监听器（用于预览窗口）
            if (timeUpdateHandler) {
                videoElement.removeEventListener('timeupdate', timeUpdateHandler);
            }
        }

        if (videoElement === video) {
            return true;
        }

        videoElement = video;
        videoElement.addEventListener('timeupdate', handleVideoTimeUpdate);
        videoElement.addEventListener('seeking', handleVideoTimeUpdate);
        videoElement.addEventListener('seeked', handleVideoTimeUpdate);
        videoElement.addEventListener('loadedmetadata', handleVideoTimeUpdate);

        // 为预览窗口跟随滚动添加监听
        if (timeUpdateHandler) {
            videoElement.addEventListener('timeupdate', timeUpdateHandler);
        }

        console.log('Missav Script: HTML5 video element bound.', videoElement);
        requestAnimationFrame(updateSubtitle);

        if (!hasShownPlayerReadyToast) {
            hasShownPlayerReadyToast = true;
            showToast('播放器初始化完成', 1500);
        }

        return true;
    }

    function updateSubtitlePositionStyle(positionPercent) {
        if (subtitleElement && typeof positionPercent === 'number') {
            const clampedPosition = Math.max(0, Math.min(90, positionPercent));
            subtitleElement.style.bottom = `${clampedPosition}%`;
        }
    }

    function updateSubtitleAppearanceStyle() {
        if (!subtitleElement) return;

        const clampedFontSize = clamp(
            Number.isFinite(subtitleFontSize) ? subtitleFontSize : 26,
            12,
            72
        );
        const normalizedColor = normalizeHexColor(subtitleColor) || '#ffffff';

        subtitleFontSize = clampedFontSize;
        subtitleColor = normalizedColor;
        subtitleElement.style.fontSize = `${clampedFontSize}px`;
        subtitleElement.style.color = normalizedColor;
    }

    function createControlPanel() {
        if (document.querySelector('.custom-control-panel')) return;

        controlPanel = document.createElement('div');
        controlPanel.className = 'custom-control-panel';

        const createInputGroup = (labelText, inputType, value, onInputHandler, keyName, options = {}) => {
            const group = document.createElement('div');
            group.className = 'input-group';
            const label = document.createElement('label');
            label.textContent = labelText;
            const input = document.createElement('input');
            input.type = inputType;
            input.value = value;
            input.setAttribute('data-key-name', keyName);
            if (inputType === 'number') {
                input.min = options.min ?? '';
                input.max = options.max ?? '';
                input.step = options.step ?? 'any';
            }
            if (inputType === 'color') {
                input.value = normalizeHexColor(value) || '#ffffff';
            }
            input.oninput = onInputHandler;
            group.append(label, input);
            return group;
        };

        controlPanel.append(
            createInputGroup('加速键', 'text', shortcutKeys.accelerate, (e) => {
                shortcutKeys.accelerate = e.target.value.toLowerCase();
            }, 'accelerate'),
            createInputGroup('快进键', 'text', shortcutKeys.forward, (e) => {
                shortcutKeys.forward = e.target.value.toLowerCase();
            }, 'forward'),
            createInputGroup('倒退键', 'text', shortcutKeys.backward, (e) => {
                shortcutKeys.backward = e.target.value.toLowerCase();
            }, 'backward')
        );

        controlPanel.append(
            createInputGroup('加速倍率', 'number', accelerationRate, (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) accelerationRate = val;
            }, 'accelerationRate', { min: 0.1, step: 0.1 }),
            createInputGroup('步进秒数', 'number', skipTime, (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val > 0) skipTime = val;
            }, 'skipTime', { min: 0.1, step: 0.1 }),
            createInputGroup('字幕偏移', 'number', subtitleOffset, async (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                    subtitleOffset = val;
                    if (originalSubtitleText) {
                        try {
                            subtitles = await parseSRT(originalSubtitleText);
                            clearSubtitleTrack();
                            updateSubtitle();
                            refreshSubtitleViewer();
                        } catch (error) {
                            showToast(`应用字幕偏移失败: ${error.message}`);
                        }
                    }
                }
            }, 'subtitleOffset', { step: 0.1 }),
            createInputGroup('字幕位置', 'number', subtitleVerticalPositionPercent, (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                    subtitleVerticalPositionPercent = val;
                    updateSubtitlePositionStyle(subtitleVerticalPositionPercent);
                }
            }, 'subtitlePosition', { min: 0, max: 90, step: 1 }),
            createInputGroup('字幕大小', 'number', subtitleFontSize, (e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                    subtitleFontSize = clamp(val, 12, 72);
                    updateSubtitleAppearanceStyle();
                }
            }, 'subtitleSize', { min: 12, max: 72, step: 1 }),
            createInputGroup('字幕颜色', 'color', subtitleColor, (e) => {
                const nextColor = normalizeHexColor(e.target.value);
                if (nextColor) {
                    subtitleColor = nextColor;
                    updateSubtitleAppearanceStyle();
                }
            }, 'subtitleColor')
        );

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-group';

        const subtitleInput = document.createElement('input');
        subtitleInput.type = 'file';
        subtitleInput.accept = '.srt';
        subtitleInput.style.display = 'none';
        subtitleInput.onchange = handleLocalSubtitleFile;

        const createButton = (text, onClickHandler) => {
            const button = document.createElement('button');
            button.textContent = text;
            button.onclick = onClickHandler;
            return button;
        };

        buttonContainer.append(
            createButton('本地字幕', () => subtitleInput.click()),
            createButton('站点搜索', searchSubtitleOnline1),
            createButton('在线搜索', searchSubtitleOnline2),
            createButton('清空字幕', clearSubtitles),
            createButton('保存设置', saveSettings),
            createButton('查看字幕', () => viewSubtitleContent())
        );

        const hideButton = createButton('收起面板', hideControlPanel);
        hideButton.className = 'full-width';
        buttonContainer.appendChild(hideButton);
        buttonContainer.appendChild(subtitleInput);

        controlPanel.appendChild(buttonContainer);
        document.body.appendChild(controlPanel);
    }

    function createShowControlsButton() {
        if (showControlsButton) return;

        showControlsButton = document.createElement('button');
        showControlsButton.className = 'show-controls-button';
        showControlsButton.textContent = '字幕';
        showControlsButton.style.display = 'flex';
        showControlsButton.addEventListener('pointerdown', handleFloatingButtonPointerDown);
        showControlsButton.addEventListener('click', handleFloatingButtonClick);
        document.body.appendChild(showControlsButton);
        applyFloatingButtonPosition();
    }

    function hideControlPanel() {
        if (controlPanel) controlPanel.style.display = 'none';
        if (showControlsButton) showControlsButton.style.display = 'flex';
        if (subtitleList) subtitleList.style.display = 'none';
    }

    function showControlPanel() {
        if (controlPanel) controlPanel.style.display = 'grid';
        positionControlPanel();
        if (showControlsButton) showControlsButton.style.display = 'none';
        if (subtitleList) {
            subtitleList.style.display = 'block';
            positionSubtitleList();
        }
    }

    function setupSubtitleDisplay() {
        subtitleElement = document.createElement('div');
        subtitleElement.className = 'custom-subtitle';
        subtitleElement.style.display = 'none';
        updateSubtitlePositionStyle(subtitleVerticalPositionPercent);
        updateSubtitleAppearanceStyle();

        const waitForContainer = setInterval(() => {
            videoContainer = findVideoContainer();

            if (videoContainer) {
                clearInterval(waitForContainer);
                if (getComputedStyle(videoContainer).position === 'static') {
                     videoContainer.style.position = 'relative';
                }
                videoContainer.appendChild(subtitleElement);
            } else {
                console.warn("Missav Script: Video container not found yet.");
            }
        }, 500);

        setTimeout(() => {
            if (!videoContainer) {
                clearInterval(waitForContainer);
                console.error("Missav Script: Failed to find video container after 10 seconds.");
            }
        }, 10000);
    }

    async function handleLocalSubtitleFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        event.target.value = null;

        try {
            const text = await file.text();
            originalSubtitleText = text;
            subtitles = await parseSRT(text);
            clearSubtitleTrack();
            updateSubtitle();
            refreshSubtitleViewer();
            if (subtitleList) closeSubtitleList();
            showToast('本地字幕加载成功');
            viewSubtitleContent();// 加载完成后自动打开预览窗口
        } catch (error) {
            console.error("Subtitle load error:", error);
            showToast(`本地字幕加载失败: ${error.message}`);
            clearSubtitles();
        }
    }

    async function parseSRT(text) {
        return new Promise((resolve) => {
            // 更加稳健的正则表达式解析逻辑，处理不规范的换行和格式
            const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
            
            // 匹配格式: [序号\n] 时间 --> 时间 \n 内容
            const blockRegex = /(?:\d+\n)?(\d{2}:\d{2}:\d{2}[,.]\d{3}) --> (\d{2}:\d{2}:\d{2}[,.]\d{3})\n([\s\S]*?)(?=\n+(?:\d+\n)?\d{2}:\d{2}:\d{2}[,.]\d{3} -->|$)/g;
            
            const subs = [];
            let match;
            while ((match = blockRegex.exec(normalizedText)) !== null) {
                const start = parseTime(match[1]) + subtitleOffset;
                const end = parseTime(match[2]) + subtitleOffset;
                let textContent = match[3].trim();

                // 移除标签内容
                textContent = textContent
                    .replace(/<[^>]+>/g, '')
                    .replace(/\{[^}]+\}/g, '')
                    .trim();

                if (!isNaN(start) && !isNaN(end) && textContent) {
                    subs.push({ start, end, text: textContent });
                }
            }
            // 按开始时间排序，保证字幕查找可以使用二分
            subs.sort((a, b) => a.start - b.start || a.end - b.end);
            console.log(`Missav Script: Parsed ${subs.length} subtitle blocks.`);
            resolve(subs);
        });
    }

    function parseTime(timeStr) {
        try {
            const [hms, msPart] = timeStr.split(/[,.]/);
            const ms = msPart ? parseInt(msPart.padEnd(3, '0').slice(0, 3), 10) : 0;
            const [h, m, s] = hms.split(':');
            const hours = parseInt(h, 10) || 0;
            const minutes = parseInt(m, 10) || 0;
            const seconds = parseInt(s, 10) || 0;

            if (isNaN(hours) || isNaN(minutes) || isNaN(seconds) || isNaN(ms)) {
                throw new Error("Invalid time component");
            }
            return (hours * 3600) + (minutes * 60) + seconds + (ms / 1000);
        } catch (e) {
            console.error("Failed to parse time string:", timeStr, e);
            return NaN;
        }
    }

    function findSubtitleIndexAt(time) {
        const count = subtitles.length;
        if (count === 0 || !Number.isFinite(time)) return -1;

        // 二分查找最后一个 start <= time 且 end >= time 的字幕
        let low = 0;
        let high = count - 1;
        let result = -1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (subtitles[mid].start <= time) {
                if (subtitles[mid].end >= time) {
                    result = mid;
                }
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return result;
    }

    function updateSubtitle() {
        if (!subtitleElement) return;

        if (!subtitles || subtitles.length === 0) {
            setSubtitleText('');
            return;
        }

        try {
            // 如果桥接数据长时间未更新，强制回退到原生 currentTime
            const currentTime = isBridgeActive && (Date.now() - (playerBridgeState.lastUpdate || 0) < 2000)
                ? playerBridgeState.currentTime
                : (videoElement ? videoElement.currentTime : NaN);

            if (!Number.isFinite(currentTime)) {
                setSubtitleText('');
                return;
            }
            const currentIndex = findSubtitleIndexAt(currentTime);
            setSubtitleText(currentIndex >= 0 ? subtitles[currentIndex].text : '');
        } catch (e) {
            console.error("Error updating subtitle:", e);
        }
    }

    function initPlayer() {
        let attempts = 0;

        if (playerMonitorInterval) {
            clearInterval(playerMonitorInterval);
            playerMonitorInterval = null;
        }

        const checkPlayerInterval = setInterval(() => {
            attempts += 1;
            const currentVideo = findVideoElement();

            if (currentVideo && bindVideoElement(currentVideo)) {
                clearInterval(checkPlayerInterval);
                playerMonitorInterval = setInterval(() => {
                    const refreshedVideo = findVideoElement();
                    if (!refreshedVideo) return;

                    if (!videoElement || !videoElement.isConnected || refreshedVideo !== videoElement) {
                        bindVideoElement(refreshedVideo);
                    }
                }, 1000);
                return;
            }

            if (attempts >= 30) {
                clearInterval(checkPlayerInterval);
                console.error('Missav Script: Failed to find HTML5 video after 15 seconds.');
            }
        }, 500);
    }

    function setupShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.closest && e.target.closest('.custom-control-panel input')) {
                return;
            }
            if (!videoElement || typeof videoElement.currentTime !== 'number') return;

            const key = e.key.toLowerCase();

            try {
                if (key === shortcutKeys.accelerate && !isAccelerating) {
                    videoElement.playbackRate = accelerationRate;
                    isAccelerating = true;
                } else if (key === shortcutKeys.forward) {
                    videoElement.currentTime += skipTime;
                } else if (key === shortcutKeys.backward) {
                    videoElement.currentTime = Math.max(0, videoElement.currentTime - skipTime);
                }
            } catch (err) {
                console.error("Shortcut error:", err);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key.toLowerCase() === shortcutKeys.accelerate && isAccelerating) {
                if (videoElement) {
                    try { videoElement.playbackRate = 1; } catch(err) { console.error("Error resetting speed:", err); }
                }
                isAccelerating = false;
            }
        });
    }

    function searchSubtitleDomainRule(vid){
        let videoID = vid || ""
        // 需要手动输入搜索关键字的域名列表
        const manualInputDomains = [
            'hanime1.me',
            'tnaflix.com'
        ];
        // 循环判断是否匹配任一域名
        const needManualInput = manualInputDomains.some(domain => 
            location.hostname.includes(domain)
        );
        if (needManualInput) {
            const defaultVal = videoID || "";
            const input = prompt("请输入要搜索的关键字 (Subtitlecat):", defaultVal);
            if (input === null) return;
            videoID = input.trim();
        }
        return videoID;
    }

    function searchSubtitleOnline1() {
        let videoID = getCurrentVideoID();
        videoID = searchSubtitleDomainRule(videoID);

        if (!videoID) {
            showToast('无法获取当前视频番号');
            return;
        }
        const searchUrl = `https://subtitlecat.com/index.php?search=${encodeURIComponent(videoID)}`;
        openInNewTab(searchUrl);
        showToast(`正在打开 Subtitlecat 搜索: ${videoID}`);
    }

    async function searchSubtitleOnline2() {
        let videoID = getCurrentVideoID();
        videoID = searchSubtitleDomainRule(videoID);

        if (!videoID) {
            showToast('无法获取当前视频番号');
            return;
        }

        showToast(`(在线搜索) 正在搜索字幕: ${videoID}...`);
        closeSubtitleList();

        try {
            const apiUrl = `https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=${encodeURIComponent(videoID)}`;
            const data = await fetchSubtitleAPI(apiUrl);

            if (data?.code === 0 && data.data?.length > 0) {
                const relevantSubs = data.data.filter(item =>
                    item.url && item.url.toLowerCase().includes('.srt')
                );
                if (relevantSubs.length > 0) {
                    showSubtitleList(relevantSubs);
                } else {
                    showToast(`(在线搜索) 未找到 ${videoID} 的SRT字幕`);
                }
            } else {
                showToast(`(在线搜索) 未找到 ${videoID} 的匹配字幕 ${data?.code ? `(Code: ${data.code})` : ''}`);
            }
        } catch (error) {
            console.error("Subtitle search error (Source 2):", error);
            showToast(`(在线搜索) 字幕搜索出错: ${error.message}`);
        }
    }

    function fetchSubtitleAPI(url) {
        return gmRequest({
            method: 'GET',
            url,
            headers: {
                Accept: 'application/json, text/plain, */*',
                'Cache-Control': 'no-cache'
            },
            responseType: 'json',
            timeout: 15000
        }).then((response) => {
            if (response.status < 200 || response.status >= 300) {
                throw new Error(`服务器错误 ${response.status}`);
            }
            return parseJsonResponse(response);
        });
    }

    function showSubtitleList(items) {
        closeSubtitleList();

        subtitleList = document.createElement('div');
        subtitleList.className = 'subtitle-list';

        const title = document.createElement('div');
        title.textContent = '选择在线字幕:';
        title.style.cssText = 'color:#ccc; margin-bottom:8px; font-weight: bold;';
        subtitleList.appendChild(title);

        if (items.length === 0) {
            const noSubs = document.createElement('div');
            noSubs.textContent = '未找到相关字幕。';
            noSubs.style.padding = '5px';
            subtitleList.appendChild(noSubs);
        } else {
            items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'subtitle-item';
                div.textContent = `${item.name}${item.extra_name ? ` (${item.extra_name})` : ''}`;
                div.title = `点击加载: ${item.name}`;
                div.onclick = (e) => {
                    e.stopPropagation();
                    loadRemoteSubtitle(item.url);
                };
                subtitleList.appendChild(div);
            });
        }

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭列表';
        closeBtn.style.cssText = 'margin-top: 10px; padding: 4px 6px; font-size: 11px; background: #555; border: none; color: white; border-radius: 3px; cursor: pointer; display: block; margin-left: auto; margin-right: auto;';
        closeBtn.onclick = closeSubtitleList;
        subtitleList.appendChild(closeBtn);

        document.body.appendChild(subtitleList);
        positionSubtitleList();

        setTimeout(() => {
            document.addEventListener('click', handleClickOutsideList, true);
        }, 0);
    }

    function handleClickOutsideList(event) {
        if (subtitleList
            && !subtitleList.contains(event.target)
            && !event.target.closest('.custom-control-panel button')
            && !event.target.closest('.show-controls-button')) {
            closeSubtitleList();
        }
    }

    function closeSubtitleList() {
        if (subtitleList) {
            subtitleList.remove();
            subtitleList = null;
        }
        document.removeEventListener('click', handleClickOutsideList, true);
    }

    async function loadRemoteSubtitle(url) {
        showToast('正在加载在线字幕...');
        closeSubtitleList();

        try {
            const response = await gmRequest({
                method: 'GET',
                url,
                headers: {
                    Accept: 'text/plain,*/*'
                },
                responseType: 'text',
                timeout: 20000
            });

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`下载失败 (HTTP ${response.status})`);
            }

            const srtContent = getResponseText(response);
            if (!srtContent.trim()) {
                throw new Error('字幕内容为空');
            }

            originalSubtitleText = srtContent;
            subtitles = await parseSRT(srtContent);
            clearSubtitleTrack();
            updateSubtitle();
            refreshSubtitleViewer();
            showToast('在线字幕加载成功');
            viewSubtitleContent();// 加载完成后自动打开预览窗口
        } catch (error) {
            console.error("Error loading remote subtitle:", error);
            showToast(`在线字幕加载失败: ${error.message}`);
            clearSubtitles();
        }
    }

    function clearSubtitles() {
        subtitles = [];
        originalSubtitleText = '';
        clearSubtitleTrack();
        setSubtitleText('');
        refreshSubtitleViewer();
        showToast('字幕已清除', 1500);
    }

    // 构建预览窗口的字幕列表HTML
    function buildSubtitleViewerContent() {
        if (!subtitleViewerElement) return null;
        const contentDiv = subtitleViewerElement.querySelector('.viewer-content');
        if (!contentDiv) return null;

        if (!subtitles || subtitles.length === 0) {
            contentDiv.innerHTML = '<div style="color:#aaa; padding: 20px; text-align:center;">暂无字幕内容</div>';
            subtitleViewerElement._subtitleItems = [];
            return null;
        }

        const ul = document.createElement('ul');
        ul.className = 'subtitle-viewer-list';
        subtitles.forEach((sub, idx) => {
            const li = document.createElement('li');
            li.className = 'subtitle-viewer-item';
            li.setAttribute('data-subtitle-index', idx);
            const startTimeStr = formatTime(sub.start);
            const endTimeStr = formatTime(sub.end);
            const timeSpan = document.createElement('span');
            timeSpan.className = 'subtitle-viewer-time';
            timeSpan.textContent = `[${startTimeStr} → ${endTimeStr}] `;
            const textSpan = document.createElement('span');
            textSpan.className = 'subtitle-viewer-text';
            textSpan.textContent = sub.text;
            li.appendChild(timeSpan);
            li.appendChild(textSpan);

            // 添加点击事件监听器，点击后跳转到字幕的起始时间
            li.onclick = (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                if (videoElement && Number.isFinite(sub.start)) {
                    videoElement.currentTime = sub.start;
                    // 如果视频处于暂停状态，尝试播放
                    if (videoElement.paused) {
                        videoElement.play().catch(err => console.error("Missav Script: Error playing video after subtitle jump:", err));
                    }
                    showToast(`跳转到字幕开始时间: ${formatTime(sub.start)}`, 2000);
                }
            };
            ul.appendChild(li);
        });
        contentDiv.innerHTML = '';
        contentDiv.appendChild(ul);
        subtitleViewerElement._subtitleItems = Array.from(ul.children);
        return ul;
    }

    function formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        if (hrs > 0) {
            return `${hrs.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`;
        }
        return `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`;
    }

    // 更新预览窗口高亮并滚动到当前字幕（如果用户未手动向下越过当前字幕）
    function updateSubtitleViewerHighlight() {
        if (!subtitleViewerElement || !isFollowScrollEnabled) return;

        const currentTime = isBridgeActive
            ? playerBridgeState.currentTime
            : (videoElement ? videoElement.currentTime : NaN);
        if (!Number.isFinite(currentTime)) return;

        const activeIndex = findSubtitleIndexAt(currentTime);
        if (activeIndex === lastActiveIndex) return;

        const items = subtitleViewerElement._subtitleItems || [];
        if (items[lastActiveIndex]) {
            items[lastActiveIndex].classList.remove('current');
        }
        if (items[activeIndex]) {
            items[activeIndex].classList.add('current');
        }
        lastActiveIndex = activeIndex;

        // 只有当前激活字幕变化时才处理滚动
        if (activeIndex !== -1) {
            const activeItem = items[activeIndex];
            if (activeItem) {
                const scrollContainer = subtitleViewerElement.querySelector('.viewer-content');
                if (scrollContainer) {
                    const containerRect = scrollContainer.getBoundingClientRect();
                    const itemRect = activeItem.getBoundingClientRect();
                    // 如果当前字幕已经完全位于滚动容器可视区域的上方（用户已滚过去），则不再自动向上滚动
                    if (itemRect.bottom < containerRect.top) {
                        return;
                    }
                }
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    // 预览窗口跟随滚动的开关切换
    function toggleFollowScroll() {
        isFollowScrollEnabled = !isFollowScrollEnabled;
        const toggleBtn = subtitleViewerElement?.querySelector('.follow-toggle');
        if (toggleBtn) {
            if (isFollowScrollEnabled) {
                toggleBtn.classList.add('active');
                toggleBtn.textContent = '✓ 跟随滚动';
                // 开启时立即定位一次
                updateSubtitleViewerHighlight();
            } else {
                toggleBtn.classList.remove('active');
                toggleBtn.textContent = '跟随滚动';
            }
        }
        localStorage.setItem('missavSubtitleFollowScroll', isFollowScrollEnabled ? '1' : '0');
    }

    // 创建或刷新字幕内容预览窗口
    function viewSubtitleContent() {
        if (!originalSubtitleText && (!subtitles || subtitles.length === 0)) {
            showToast('当前未加载任何字幕');
            return;
        }

        // 如果已存在，直接激活
        if (subtitleViewerElement && document.body.contains(subtitleViewerElement)) {
            subtitleViewerElement.focus();
            return;
        }

        // 读取之前跟随滚动设置
        const savedFollow = localStorage.getItem('missavSubtitleFollowScroll');
        isFollowScrollEnabled = savedFollow === '1';

        const existing = document.querySelector('.subtitle-content-viewer');
        if (existing) existing.remove();

        const viewer = document.createElement('div');
        viewer.className = 'subtitle-content-viewer';
        subtitleViewerElement = viewer;

        const savedPos = localStorage.getItem('missavSubtitleViewerPosition');
        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                viewer.style.transform = 'none';
                viewer.style.margin = '0';
                viewer.style.left = pos.left;
                viewer.style.top = pos.top;
            } catch (e) {
                console.warn('Failed to restore viewer position', e);
            }
        }

        // 头部区域：拖拽栏 + 关闭按钮 + 跟随滚动开关
        const dragHandle = document.createElement('div');
        dragHandle.className = 'viewer-drag-handle';
        const dragText = document.createElement('span');
        dragText.textContent = '字幕内容预览 (按住此栏拖动)';
        const controlsWrapper = document.createElement('div');
        controlsWrapper.style.display = 'flex';
        controlsWrapper.style.gap = '8px';
        controlsWrapper.style.alignItems = 'center';

        const followBtn = document.createElement('button');
        followBtn.className = 'follow-toggle';
        followBtn.textContent = isFollowScrollEnabled ? '✓ 跟随滚动' : '跟随滚动';
        if (isFollowScrollEnabled) followBtn.classList.add('active');
        followBtn.onclick = (e) => {
            e.stopPropagation();
            toggleFollowScroll();
        };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'close-viewer';
        closeBtn.textContent = '关闭';
        closeBtn.onclick = () => {
            viewer.remove();
            subtitleViewerElement = null;
            // 移除时间监听
            if (timeUpdateHandler && videoElement) {
                videoElement.removeEventListener('timeupdate', timeUpdateHandler);
                timeUpdateHandler = null;
            }
        };

        controlsWrapper.appendChild(followBtn);
        controlsWrapper.appendChild(closeBtn);
        dragHandle.appendChild(dragText);
        dragHandle.appendChild(controlsWrapper);

        const content = document.createElement('div');
        content.className = 'viewer-content';

        viewer.appendChild(dragHandle);
        viewer.appendChild(content);
        document.body.appendChild(viewer);

        // 构建内容列表
        buildSubtitleViewerContent();

        // 实现拖拽逻辑
        let isDragging = false;
        let startX, startY, initialRect;

        dragHandle.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target === followBtn || e.target === closeBtn || followBtn.contains(e.target) || closeBtn.contains(e.target)) {
                return;
            }
            isDragging = true;
            initialRect = viewer.getBoundingClientRect();
            viewer.style.transform = 'none';
            viewer.style.left = `${initialRect.left}px`;
            viewer.style.top = `${initialRect.top}px`;
            viewer.style.margin = '0';
            startX = e.clientX - initialRect.left;
            startY = e.clientY - initialRect.top;
            dragHandle.setPointerCapture?.(e.pointerId);

            const onPointerMove = (me) => {
                if (!isDragging) return;
                viewer.style.left = `${me.clientX - startX}px`;
                viewer.style.top = `${me.clientY - startY}px`;
            };
            const onPointerUp = () => {
                isDragging = false;
                localStorage.setItem('missavSubtitleViewerPosition', JSON.stringify({
                    left: viewer.style.left,
                    top: viewer.style.top
                }));
                dragHandle.removeEventListener('pointermove', onPointerMove);
                dragHandle.removeEventListener('pointerup', onPointerUp);
                dragHandle.removeEventListener('pointercancel', onPointerUp);
            };
            dragHandle.addEventListener('pointermove', onPointerMove);
            dragHandle.addEventListener('pointerup', onPointerUp);
            dragHandle.addEventListener('pointercancel', onPointerUp);
        });

        // 设置时间更新监听，用于更新高亮和滚动
        if (timeUpdateHandler) {
            if (videoElement) videoElement.removeEventListener('timeupdate', timeUpdateHandler);
        }
        timeUpdateHandler = () => {
            if (subtitleViewerElement && isFollowScrollEnabled) {
                requestAnimationFrame(updateSubtitleViewerHighlight);
            }
        };
        // 后续绑定视频时 bindVideoElement 会自动挂载该监听，无需轮询等待
        if (videoElement) {
            videoElement.addEventListener('timeupdate', timeUpdateHandler);
        }

        // 首次高亮
        if (isFollowScrollEnabled) {
            updateSubtitleViewerHighlight();
        }
    }

    function refreshSubtitleViewer() {
        if (subtitleViewerElement && document.body.contains(subtitleViewerElement)) {
            buildSubtitleViewerContent();
            lastActiveIndex = -1;
            if (isFollowScrollEnabled) {
                updateSubtitleViewerHighlight();
            }
        }
    }

    function getCurrentVideoID() {
        try {
            // 优先检查 URL 参数 (针对 hanime1.me 等使用 ?v=ID 的站点)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('v')) {
                return urlParams.get('v');
            }

            const path = window.location.pathname;
            const segments = path.split('/').filter(s => s.length > 0);

            if (segments.length === 0) return '';

            const lastSegment = segments[segments.length - 1];
            let idMatch = lastSegment.match(/^([a-zA-Z]{2,6})[-_]?(\d{2,5})/i);
            if (idMatch) return `${idMatch[1].toUpperCase()}-${idMatch[2]}`;

            if (segments.length >= 2) {
                const secondLastSegment = segments[segments.length - 2];
                idMatch = secondLastSegment.match(/^([a-zA-Z]{2,6})[-_]?(\d{2,5})/i);
                if (idMatch) return `${idMatch[1].toUpperCase()}-${idMatch[2]}`;
            }

            idMatch = path.match(/([a-zA-Z]{2,6})[-_]?(\d{2,5})/i);
            if (idMatch) return `${idMatch[1].toUpperCase()}-${idMatch[2]}`;

            if(lastSegment.includes('-') && lastSegment.length > 3) return lastSegment.toUpperCase();

            console.warn("Could not determine Video ID from path:", path);
            return '';
        } catch (error) {
            console.error("Error getting Video ID:", error);
            return '';
        }
    }

    function saveSettings() {
        try {
            subtitleFontSize = clamp(
                Number.isFinite(subtitleFontSize) ? subtitleFontSize : 26,
                12,
                72
            );
            subtitleColor = normalizeHexColor(subtitleColor) || '#ffffff';
            localStorage.setItem('missavAccelerationRate', accelerationRate);
            localStorage.setItem('missavSkipTime', skipTime);
            localStorage.setItem('missavSubtitleOffset', subtitleOffset);
            localStorage.setItem('missavSubtitlePosition', subtitleVerticalPositionPercent);
            localStorage.setItem('missavSubtitleSize', subtitleFontSize);
            localStorage.setItem('missavSubtitleColor', subtitleColor);
            localStorage.setItem('missavAccelerateKey', shortcutKeys.accelerate);
            localStorage.setItem('missavForwardKey', shortcutKeys.forward);
            localStorage.setItem('missavBackwardKey', shortcutKeys.backward);
            showToast('设置已保存');
        } catch (e) {
            console.error("Error saving settings:", e);
            showToast('保存设置失败');
        }
    }

    function showToast(message, duration = 3000) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.75);
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            z-index: 10002;
            font-size: 14px;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
            max-width: 300px;
            text-align: center;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '1'; }, 50);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
        }, duration);
    }

    function initializeScript() {
        console.log("Missav Script: Initializing with subtitle viewer follow-scroll support...");
        setupSubtitleDisplay();
        createControlPanel();
        createShowControlsButton();
        hideControlPanel();
        window.addEventListener('resize', handleViewportChange);
        setupPlayerBridge();
        setupShortcuts();
        initPlayer();
        console.log("Missav Script: Initialization complete.");
    }

    let initStarted = false;
    const observer = new MutationObserver((mutationsList, obs) => {
        const playerElement = findVideoElement();
        if (playerElement && !initStarted) {
            console.log("Missav Script: Player element detected, running main script.");
            initStarted = true;
            obs.disconnect();
            initializeScript();
        }
    });

    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });

    let fallbackChecks = 0;
    const fallbackInterval = setInterval(() => {
        if (initStarted) {
            clearInterval(fallbackInterval);
            return;
        }
        fallbackChecks += 1;
        if (findVideoElement()) {
            clearInterval(fallbackInterval);
            console.log("Missav Script: Fallback check found a player, running main script.");
            initStarted = true;
            observer.disconnect();
            initializeScript();
        } else if (fallbackChecks >= 6) {
            // 页面仍无视频时保持静默，等待 MutationObserver 捕获后续插入的播放器
            clearInterval(fallbackInterval);
        }
    }, 5000);

})();
