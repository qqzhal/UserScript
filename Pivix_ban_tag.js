// ==UserScript==
// @name         Pixiv 小说标签屏蔽
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  在 Pixiv 小说列表/搜索结果/标签页中，按配置面板中设置的标签隐藏对应作品（保留占位）
// @author       Codex
// @match        https://www.pixiv.net/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const STORE_KEY = 'pivix_banned_novel_tags';
    const KEEP_SPACE_KEY = 'pivix_ban_tag_keep_space';
    const NOVEL_LINK_SELECTOR =
        'a[href*="novel/show.php"], a[href*="/novel/series/"]';
    // 标签链接 + 小说类别链接（BL/百合/其他等显示在卡片标签区，但 href 是 /genre/novel/...）
    const TAG_LINK_SELECTOR =
        'a[data-gtm-label], a[href*="/tags/"], a[href*="/genre/novel/"]';

    /* ==================== 存储 ==================== */

    function loadTags() {
        try {
            if (typeof GM_getValue === 'function') {
                const v = GM_getValue(STORE_KEY, []);
                if (Array.isArray(v)) {
                    return v.map(String).filter((s) => s.trim() !== '');
                }
            }
        } catch (e) {
            /* 忽略 */
        }
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                const v = JSON.parse(raw);
                if (Array.isArray(v)) {
                    return v.map(String).filter((s) => s.trim() !== '');
                }
            }
        } catch (e) {
            /* 忽略 */
        }
        return [];
    }

    function saveTags(tags) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(STORE_KEY, tags);
            }
        } catch (e) {
            /* 忽略 */
        }
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(tags));
        } catch (e) {
            /* 忽略 */
        }
    }

    let bannedTags = loadTags();
    let bannedSet = new Set(bannedTags.map(normalizeTag));

    // 屏蔽后是否保留占位（true = visibility:hidden 保留空位，false = display:none 彻底移除）
    let keepSpace = loadKeepSpace();

    function loadKeepSpace() {
        try {
            if (typeof GM_getValue === 'function') {
                const v = GM_getValue(KEEP_SPACE_KEY, null);
                if (v !== null && v !== undefined) return !!v;
            }
        } catch (e) {
            /* 忽略 */
        }
        try {
            const raw = localStorage.getItem(KEEP_SPACE_KEY);
            if (raw !== null && raw !== '') return raw === 'true';
        } catch (e) {
            /* 忽略 */
        }
        return true; // 默认保留占位
    }

    function saveKeepSpace(value) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(KEEP_SPACE_KEY, value);
            }
        } catch (e) {
            /* 忽略 */
        }
        try {
            localStorage.setItem(KEEP_SPACE_KEY, String(value));
        } catch (e) {
            /* 忽略 */
        }
    }

    function rebuildBannedSet() {
        bannedSet = new Set(bannedTags.map(normalizeTag));
    }

    /* ==================== 工具 ==================== */

    // 规范化标签：全角转半角、去掉 #、空白、统一小写
    function normalizeTag(s) {
        return String(s || '')
            .normalize('NFKC')
            .trim()
            .replace(/^#+/, '')
            .replace(/[\s\u3000]+/g, '')
            .toLowerCase();
    }

    // 收集一个标签链接的所有候选名称，避免因译名/显示形式不同而漏匹配。
    // 例如标签 BL 在中文界面可能显示为 "BL(ボーイズラブ)"，
    // 而 data-gtm-label 与 href 中分别是原始标签名。
    function collectTagCandidates(a) {
        const candidates = new Set();

        const label = a.getAttribute && a.getAttribute('data-gtm-label');
        if (label) candidates.add(normalizeTag(label));

        const text = a.textContent;
        if (text) {
            candidates.add(normalizeTag(text));
            // 去掉括号注释后再试一次："BL(ボーイズラブ)" -> "BL"
            const stripped = text.replace(/[（(][^）)]*[）)]/g, '');
            if (stripped && stripped !== text) candidates.add(normalizeTag(stripped));
        }

        const href = a.getAttribute && a.getAttribute('href');
        if (href) {
            // 优先匹配标签链接 /tags/xxx/novels，其次类别链接 /genre/novel/xxx
            const mm =
                href.match(/\/tags\/([^/?#]+?)(?:\/|$)/) ||
                href.match(/\/genre\/novel\/([^/?#]+?)(?:\/|$)/);
            if (mm) {
                try {
                    candidates.add(normalizeTag(decodeURIComponent(mm[1])));
                } catch (e) {
                    candidates.add(normalizeTag(mm[1]));
                }
            }
        }

        return candidates;
    }

    /* ==================== 页面判断 ==================== */

    function isRelevantPage() {
        const path = location.pathname;
        // 小说详情页不处理
        if (path === '/novel.php' || path === '/novel/show.php') return false;
        // 小说相关列表：收藏 /novel/bookmark.php、排行 /novel/ranking.php、
        // 关注 /novel/mypixiv.php、系列 /novel/series/... 等
        if (/^\/novel\//.test(path)) return true;
        // 搜索结果（小说类型）：/search?type=novel 或旧版 /search.php?type=novel
        if (path.includes('/search')) {
            const sp = new URLSearchParams(location.search);
            if (sp.get('type') === 'novel') return true;
        }
        // 小说标签页：/tags/xxx/novels
        if (/^\/tags\/.+?\/novels/.test(path)) return true;
        return false;
    }

    /* ==================== 卡片查找 ==================== */

    function countNovelLinks(el) {
        return el.querySelectorAll(NOVEL_LINK_SELECTOR).length;
    }

    // 从标签链接向上定位作品卡片。
    // 首选新版页面的 data-ga4 卡片标识；其他页面用启发式兜底。
    function findNovelCard(startEl) {
        const ga4Card = startEl.closest('[data-ga4-label="thumbnail"]');
        if (ga4Card) return ga4Card;

        let el = startEl;
        let divFallback = null;
        for (let depth = 0; el && depth < 8; depth++) {
            el = el.parentElement;
            if (!el) break;
            const t = el.tagName;
            if (t === 'LI' || t === 'SECTION' || t === 'ARTICLE' || t === 'TR') {
                const n = countNovelLinks(el);
                if (n >= 1 && n <= 3) return el;
            } else if (t === 'DIV') {
                const n = countNovelLinks(el);
                if (n >= 1 && n <= 3) divFallback = el;
            }
            if (t === 'BODY' || t === 'MAIN') break;
        }
        return divFallback;
    }

    /* ==================== 屏蔽逻辑 ==================== */

    const state = { hiddenCount: 0 };

    // 检查一个元素内是否含有被屏蔽的标签
    function elementHasBannedTag(el) {
        const links = el.querySelectorAll(TAG_LINK_SELECTOR);
        for (const a of links) {
            for (const c of collectTagCandidates(a)) {
                if (bannedSet.has(c)) return true;
            }
        }
        return false;
    }

    function hideCard(card) {
        if (!card || card.getAttribute('data-pbt-hidden')) return;
        card.setAttribute('data-pbt-hidden', '1');
        if (keepSpace) {
            // 保留网格占位，让用户知道原处有内容被屏蔽
            card.style.visibility = 'hidden';
        } else {
            // 彻底移除，不占位
            card.style.display = 'none';
        }
        state.hiddenCount++;
        if (ui) updateStats();
    }

    function restoreHidden() {
        document.querySelectorAll('[data-pbt-hidden]').forEach((el) => {
            el.style.visibility = '';
            el.style.display = '';
            el.removeAttribute('data-pbt-hidden');
        });
        state.hiddenCount = 0;
    }

    function scan() {
        if (!isRelevantPage()) return;

        // 1) 新版页面：直接扫描 data-ga4 作品卡片
        document.querySelectorAll('[data-ga4-label="thumbnail"]').forEach((card) => {
            const eid = card.getAttribute('data-ga4-entity-id') || '';
            if (eid && !eid.startsWith('novel/')) return; // 只处理小说卡片
            if (elementHasBannedTag(card)) hideCard(card);
        });

        // 2) 兜底：从标签链接向上找卡片（老版页面/其他列表）
        document.querySelectorAll(TAG_LINK_SELECTOR).forEach((a) => {
            let hit = false;
            for (const c of collectTagCandidates(a)) {
                if (bannedSet.has(c)) {
                    hit = true;
                    break;
                }
            }
            if (hit) {
                const card = findNovelCard(a);
                if (card) hideCard(card);
            }
        });

        if (ui) updateStats();
    }

    // 添加/删除标签后重新应用：先恢复，再按新集合屏蔽
    function reapply() {
        restoreHidden();
        scan();
        if (ui) renderList();
    }

    /* ==================== DOM 观察 ==================== */

    let scanTimer = null;

    function watchDOM() {
        if (!document.body) return;
        const observer = new MutationObserver(() => {
            if (!isRelevantPage()) return;
            clearTimeout(scanTimer);
            scanTimer = setTimeout(() => {
                scanTimer = null;
                scan();
            }, 200);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function watchURL() {
        const orig = history.pushState;
        history.pushState = function (...args) {
            const r = orig.apply(this, args);
            setTimeout(onUrlChanged, 0);
            return r;
        };
        window.addEventListener('popstate', onUrlChanged);
        // 兜底：轮询检测地址变化（Pixiv 部分页面整页跳转）
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                onUrlChanged();
            }
        }, 1000);
    }

    function onUrlChanged() {
        if (!isRelevantPage()) return;
        restoreHidden();
        scan();
    }

    /* ==================== 配置面板 UI ==================== */

    const CSS = `
        #pbt-host {
            position: fixed;
            right: 20px;
            bottom: 120px;
            z-index: 2147483647;
            font-family: -apple-system, "Segoe UI", "Hiragino Sans",
                "Noto Sans SC", "Microsoft YaHei", sans-serif;
            line-height: 1.5;
        }
        #pbt-fab {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            background: #fff;
            font-size: 20px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.15s ease;
        }
        #pbt-fab:hover { transform: scale(1.08); }
        #pbt-panel {
            position: absolute;
            right: 0;
            bottom: 54px;
            width: 300px;
            max-height: 70vh;
            overflow-y: auto;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.25);
            padding: 14px 16px;
            box-sizing: border-box;
            display: none;
            color: #222;
            font-size: 13px;
        }
        #pbt-panel.open { display: block; }
        .pbt-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 4px;
        }
        .pbt-head h2 { margin: 0; font-size: 16px; }
        #pbt-close {
            border: none;
            background: none;
            cursor: pointer;
            font-size: 20px;
            color: #999;
            line-height: 1;
            padding: 2px 6px;
            border-radius: 6px;
        }
        #pbt-close:hover { color: #333; background: #f0f0f0; }
        #pbt-desc { margin: 0 0 12px; font-size: 12px; color: #888; }
        .pbt-option {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 12px;
            padding: 8px 10px;
            background: #fafafa;
            border-radius: 8px;
            font-size: 13px;
        }
        .pbt-option-text { display: flex; flex-direction: column; gap: 2px; }
        .pbt-option-title { color: #333; }
        .pbt-option-desc { font-size: 11px; color: #999; }
        .pbt-toggle { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
        .pbt-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
        .pbt-slider {
            position: absolute;
            inset: 0;
            background: #ccc;
            border-radius: 999px;
            cursor: pointer;
            transition: background 0.15s ease;
        }
        .pbt-slider::before {
            content: '';
            position: absolute;
            width: 16px;
            height: 16px;
            left: 2px;
            top: 2px;
            background: #fff;
            border-radius: 50%;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            transition: transform 0.15s ease;
        }
        .pbt-toggle input:checked + .pbt-slider { background: #0096fa; }
        .pbt-toggle input:checked + .pbt-slider::before { transform: translateX(16px); }
        .pbt-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
        #pbt-input {
            flex: 1;
            min-width: 0;
            padding: 7px 10px;
            border: 1px solid #ccc;
            border-radius: 8px;
            font-size: 13px;
            outline: none;
            box-sizing: border-box;
        }
        #pbt-input:focus { border-color: #0096fa; }
        #pbt-add {
            padding: 7px 14px;
            border: none;
            border-radius: 8px;
            background: #0096fa;
            color: #fff;
            font-size: 13px;
            cursor: pointer;
            white-space: nowrap;
        }
        #pbt-add:hover { background: #007ed8; }
        #pbt-list {
            list-style: none;
            margin: 0 0 12px;
            padding: 0;
            max-height: 260px;
            overflow-y: auto;
        }
        #pbt-list li {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 6px 10px;
            margin-bottom: 6px;
            background: #f2f8ff;
            border: 1px solid #d6ebff;
            border-radius: 8px;
            font-size: 13px;
            word-break: break-all;
        }
        #pbt-list .pbt-empty {
            justify-content: center;
            background: #fafafa;
            border-color: #eee;
            color: #aaa;
        }
        .pbt-tag-name { flex: 1; }
        .pbt-del {
            border: none;
            background: none;
            color: #999;
            cursor: pointer;
            font-size: 15px;
            line-height: 1;
            padding: 0 4px;
            border-radius: 4px;
        }
        .pbt-del:hover { color: #e5494d; background: #ffecec; }
        #pbt-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: #888;
        }
        #pbt-clear {
            border: none;
            background: none;
            color: #e5494d;
            cursor: pointer;
            font-size: 12px;
            padding: 0;
        }
        #pbt-clear:hover { text-decoration: underline; }
    `;

    let ui = null;

    function createUI() {
        if (document.getElementById('pbt-host')) return;
        const host = document.createElement('div');
        host.id = 'pbt-host';
        host.innerHTML = `
            <style>${CSS}</style>
            <button id="pbt-fab" title="小说标签屏蔽设置">🛡️</button>
            <div id="pbt-panel">
                <div class="pbt-head">
                    <h2>小说标签屏蔽</h2>
                    <button id="pbt-close" title="关闭">×</button>
                </div>
                <p id="pbt-desc">添加要屏蔽的小说标签，列表/搜索结果中将隐藏对应作品。</p>
                <div class="pbt-option">
                    <span class="pbt-option-text">
                        <span class="pbt-option-title">屏蔽后保留占位</span>
                        <span class="pbt-option-desc">关闭后作品彻底移除，不占网格位置</span>
                    </span>
                    <label class="pbt-toggle">
                        <input type="checkbox" id="pbt-keep-space" />
                        <span class="pbt-slider"></span>
                    </label>
                </div>
                <div class="pbt-input-row">
                    <input id="pbt-input" type="text" placeholder="输入标签，如：gay 或 BL" />
                    <button id="pbt-add">添加</button>
                </div>
                <ul id="pbt-list"></ul>
                <div id="pbt-footer">
                    <span id="pbt-stats"></span>
                    <button id="pbt-clear">清空全部</button>
                </div>
            </div>
        `;
        document.body.appendChild(host);

        ui = {
            panel: host.querySelector('#pbt-panel'),
            input: host.querySelector('#pbt-input'),
            list: host.querySelector('#pbt-list'),
            stats: host.querySelector('#pbt-stats'),
            fab: host.querySelector('#pbt-fab'),
            keepSpace: host.querySelector('#pbt-keep-space'),
        };

        ui.fab.addEventListener('click', () => togglePanel());
        host.querySelector('#pbt-close').addEventListener('click', () => togglePanel(false));
        host.querySelector('#pbt-add').addEventListener('click', addTag);
        host.querySelector('#pbt-clear').addEventListener('click', clearAll);
        ui.keepSpace.checked = keepSpace;
        ui.keepSpace.addEventListener('change', () => {
            keepSpace = ui.keepSpace.checked;
            saveKeepSpace(keepSpace);
            reapply(); // 恢复旧的隐藏并重新按新方式应用
        });
        ui.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addTag();
        });

        renderList();
    }

    function togglePanel(force) {
        const open = force === undefined ? !ui.panel.classList.contains('open') : force;
        ui.panel.classList.toggle('open', open);
        if (open) ui.input.focus();
    }

    function addTag() {
        const raw = ui.input.value.trim();
        const norm = normalizeTag(raw);
        if (!norm) return;
        if (!bannedTags.some((t) => normalizeTag(t) === norm)) {
            bannedTags.push(raw);
            saveTags(bannedTags);
            rebuildBannedSet();
        }
        ui.input.value = '';
        reapply();
    }

    function removeTag(index) {
        if (index < 0 || index >= bannedTags.length) return;
        bannedTags.splice(index, 1);
        saveTags(bannedTags);
        rebuildBannedSet();
        reapply();
    }

    function clearAll() {
        if (bannedTags.length === 0) return;
        if (!window.confirm('确定清空全部屏蔽标签？')) return;
        bannedTags = [];
        saveTags(bannedTags);
        rebuildBannedSet();
        reapply();
    }

    function updateStats() {
        if (!ui) return;
        ui.stats.textContent =
            `共 ${bannedTags.length} 个屏蔽标签 · 本次已隐藏 ${state.hiddenCount} 个作品`;
    }

    function renderList() {
        if (!ui) return;
        ui.list.innerHTML = '';
        if (bannedTags.length === 0) {
            const li = document.createElement('li');
            li.className = 'pbt-empty';
            li.textContent = '尚未添加屏蔽标签';
            ui.list.appendChild(li);
        } else {
            bannedTags.forEach((tag, idx) => {
                const li = document.createElement('li');
                const span = document.createElement('span');
                span.className = 'pbt-tag-name';
                span.textContent = tag;
                const del = document.createElement('button');
                del.className = 'pbt-del';
                del.textContent = '✕';
                del.title = '删除该标签';
                del.addEventListener('click', () => removeTag(idx));
                li.appendChild(span);
                li.appendChild(del);
                ui.list.appendChild(li);
            });
        }
        updateStats();
    }

    /* ==================== 启动 ==================== */

    function start() {
        createUI();
        scan();
        watchDOM();
        watchURL();
        if (typeof GM_registerMenuCommand === 'function') {
            try {
                GM_registerMenuCommand('打开小说标签屏蔽面板', () => {
                    createUI();
                    togglePanel(true);
                });
            } catch (e) {
                /* 忽略 */
            }
        }
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener('DOMContentLoaded', start);
    }
})();
