// ==UserScript==
// @name         X/Twitter 评论缩进
// @namespace    xti.local
// @version      2.2.2
// @description  在 x.com 推文详情页按回复关系给评论逐级缩进并绘制彩色层级竖线。通过捕获 X 加载评论的接口数据（in_reply_to 关系）得到精确回复树，悬停评论可高亮整条回复链。控制台以 [XTI] 输出调试日志；油猴菜单提供“诊断”和“重新捕获”。
// @author       ZCode
// @match        https://x.com/*
// @match        https://twitter.com/*
// @exclude      https://x.com/i/flow/*
// @inject-into  page
// @noframes
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ================= 可调参数 =================
  const INDENT = 22;            // 每一级回复缩进的像素数
  const MAX_INDENT_DEPTH = 9;   // 缩进封顶层级（防止层级过深在窄屏上挤出屏幕）
  // 各层级的竖线颜色（第 1 层用第 1 个颜色，依此类推，超出后用最后一个颜色）
  const COLORS = ['#1d9bf0', '#00ba7c', '#ffd400', '#7856ff', '#ff7a00'];
  const CHAIN_COLOR = '#f4212e'; // 悬停高亮回复链时竖线的颜色
  const DEBUG_KEY = 'xti_debug'; // 默认关闭日志；设为 '1' 后刷新可开启 [XTI] 日志
  // X 网页端公开的匿名 bearer token（仅用于重放页面自己发过的请求）
  const BEARER = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8F81MUoq7LS1J6tN';
  // ============================================

  const VER = '2.2.2';
  // 默认不输出 [XTI] 日志；需要排查时在控制台执行 localStorage.setItem('xti_debug','1') 后刷新，
  // 或直接点油猴菜单“XTI 诊断”查看状态。
  function debugOn() { try { return localStorage.getItem(DEBUG_KEY) === '1'; } catch (e) { return false; } }
  function log(...a) { if (debugOn()) console.log('[XTI]', ...a); }

  // 清理旧版本遗留的开关状态（v2.2 起不再有开关，装了脚本就生效）
  try { localStorage.removeItem('xti_enabled'); } catch (e) { /* 忽略 */ }

  // ---------- 诊断统计 ----------
  const stat = {
    hookInstalled: '未安装',
    fetchCalls: 0,      // 经过 hook 的 fetch 调用总数（0 说明 hook 没真正挂在页面世界）
    xhrCalls: 0,        // 经过 hook 的 XHR 调用总数
    apiHits: 0,         // 拦截到的接口响应次数
    ingestCalls: 0,
    lastIngestAdded: 0,
    autoReplayDone: false,
    lastProcess: '-',
    graphqlUrls: [],    // 最近看到的 graphql 请求 URL（诊断用）
  };

  // ---------- 回复树缓存（来自 API 数据，tweetId 全局唯一，跨对话保留） ----------
  const parentById = new Map(); // tweetId -> 父推文 tweetId（顶层推文不存）
  const knownIds = new Set();   // 已确认身份的推文 id（含顶层推文）
  const depthCache = new Map(); // tweetId -> 深度（ingest 更新树后清空重算）

  // ---------- 启发式兜底缓存（页面 DOM 顺序推断，仅当前对话有效） ----------
  const depthById = new Map();      // tweetId -> 深度（启发式结果）
  const latestByHandle = new Map(); // handle -> 最近一条该作者的 tweetId
  let currentConv = null;           // 当前对话根推文 id，换页时清启发式缓存

  const cellById = new Map();       // tweetId -> 当前 DOM 里的 cell（悬停高亮用，每次重算重建）
  const applied = new WeakMap();    // cell -> 上次写入的 "id|depth" 签名，避免重复写 DOM 引发无限 mutation

  // ================= 1. 捕获 X 的评论数据 =================
  // X 加载对话用的是 GraphQL 接口，响应 JSON 中每条推文都带
  // in_reply_to_status_id_str，即精确的回复关系。

  function isApiUrl(url) {
    return /graphql\/[A-Za-z0-9_-]+\/(TweetDetail|Conversation[\w]*)/.test(url);
  }

  function ingest(json) {
    stat.ingestCalls++;
    let added = 0;
    (function walk(node) {
      if (Array.isArray(node)) { for (const x of node) walk(x); return; }
      if (!node || typeof node !== 'object') return;
      const id = (typeof node.rest_id === 'string' && /^\d+$/.test(node.rest_id)) ? node.rest_id
        : (typeof node.id_str === 'string' && /^\d+$/.test(node.id_str)) ? node.id_str : null;
      // 含 in_reply_to_status_id_str 键（值可为 null）的对象视为推文
      if (id && !knownIds.has(id)) {
        const leg = node.legacy || node;
        if (leg.in_reply_to_status_id_str !== undefined) {
          knownIds.add(id);
          const pid = leg.in_reply_to_status_id_str;
          if (pid && pid !== id) parentById.set(id, pid);
          added++;
        }
      }
      for (const k in node) walk(node[k]);
    })(json);
    stat.lastIngestAdded = added;
    if (added) {
      depthCache.clear();
      log(`捕获评论数据 +${added} 条（树累计 ${knownIds.size} 条推文 / ${parentById.size} 条边）`);
      schedule();
    }
  }

  function csrfToken() {
    const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  // CustomEvent 数据通道（外部喂数据 / 本地测试 mock 用）
  document.addEventListener('xti-graph-data', (ev) => {
    try { ingest(JSON.parse(ev.detail)); } catch (_){ /* 忽略 */ }
  });

  function recordGraphqlUrl(url) {
    const u = url.split('?')[0];
    if (stat.graphqlUrls.length > 40) stat.graphqlUrls.shift();
    if (!stat.graphqlUrls.includes(u)) stat.graphqlUrls.push(u);
  }

  function installHook() {
    // 本脚本通过 @inject-into page 注入页面主世界，直接替换 window.fetch /
    // XMLHttpRequest 原型即可；若脚本管理器把注入降级到沙箱世界，日志会显示
    // fetchCalls=0，据此可定位。
    try {
      const orig = window.fetch;
      if (typeof orig !== 'function') throw new Error('fetch 不可用');
      window.fetch = function (...args) {
        stat.fetchCalls++;
        let url = '';
        try {
          url = (typeof args[0] === 'string') ? args[0] : (args[0] && args[0].url) || '';
          if (url.includes('/graphql/')) recordGraphqlUrl(url);
        } catch (e) { /* 不影响原请求 */ }
        const p = orig.apply(this, args);
        if (url.includes('/graphql/')) {
          // 所有 graphql 响应都入库：首页时间线等接口的推文也带 in_reply_to
          // 关系，只认详情页接口会导致首次进首页时回复树为空、不显示缩进
          stat.apiHits++;
          log('拦截接口请求:', url.slice(0, 140));
          Promise.resolve(p).then(res => {
            try { res.clone().json().then(j => ingest(j)).catch(e => log('响应解析失败', e)); } catch (e) { /* 忽略 */ }
          }).catch(() => { /* 网络错误 */ });
        }
        return p;
      };
      stat.hookInstalled = 'fetch直赋';
    } catch (e) {
      log('fetch hook 失败:', String(e).slice(0, 80));
    }

    // XHR hook（防止 X 改用 XHR 请求）
    try {
      const xhrOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this.__xtiUrl = String(url || '');
        if (this.__xtiUrl.includes('/graphql/')) recordGraphqlUrl(this.__xtiUrl);
        return xhrOpen.call(this, method, url, ...rest);
      };
      const xhrSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function (...args) {
        if (this.__xtiUrl && this.__xtiUrl.includes('/graphql/')) {
          // 同 fetch：所有 graphql 响应都入库
          stat.apiHits++;
          stat.xhrCalls++;
          log('拦截XHR请求:', this.__xtiUrl.slice(0, 140));
          this.addEventListener('load', () => {
            try {
              const ct = (this.getResponseHeader('content-type') || '');
              if (ct.includes('json')) ingest(JSON.parse(this.responseText));
            } catch (e) { /* 忽略非 JSON */ }
          });
        }
        return xhrSend.apply(this, args);
      };
      stat.hookInstalled += '+XHR';
    } catch (e) {
      log('XHR hook 失败:', String(e).slice(0, 80));
    }
    log('hook 安装完成（' + stat.hookInstalled + '）。若始终没有“拦截接口请求”日志且诊断里 fetchCalls=0，说明脚本没有运行在页面世界。');
  }

  // ---------- 兜底：从 performance 记录里找到 X 发过的接口请求，原样重放 ----------
  function graphqlEntries() {
    try {
      return performance.getEntriesByType('resource').map(e => e.name)
        .filter(u => u.includes('/i/api/graphql/') && u.includes('variables='));
    } catch (e) { return []; }
  }
  function replayOne(url, tag) {
    log(tag, '重放:', url.slice(0, 140));
    return fetch(url, {
      credentials: 'include',
      headers: { 'authorization': BEARER, 'x-csrf-token': csrfToken() },
    }).then(r => {
      log(tag, 'HTTP', r.status);
      return r.ok ? r.json() : null;
    }).then(j => {
      if (j) { const b = knownIds.size; ingest(j); log(tag, '新增', knownIds.size - b, '条推文'); return knownIds.size - b; }
      return 0;
    }).catch(e => { log(tag, '失败:', String(e).slice(0, 120)); return 0; });
  }
  // 自动兜底：树为空时，优先重放已知名的接口；没有就用最近几条 graphql 请求逐个试
  async function autoReplay(force) {
    if (!force && (stat.autoReplayDone || knownIds.size)) return;
    if (force) stat.autoReplayDone = false;
    const urls = graphqlEntries();
    log((force ? '强制重捕获' : '自动兜底') + ': performance 里找到', urls.length, '条 graphql 请求');
    if (!urls.length) { log('没有可重放的请求，请先滚动加载几次评论再试'); return; }
    const known = urls.filter(u => isApiUrl(u));
    const list = (known.length ? known : urls.slice(-3)).slice(-(force ? 10 : 3));
    if (!force) stat.autoReplayDone = true;
    for (const u of list) {
      const got = await replayOne(u, force ? '重捕获' : '自动兜底');
      if (got > 0) break;
    }
  }
  // 菜单：输出诊断信息
  function diagnostics() {
    console.log('[XTI] ===== 诊断 ' + VER + ' =====');
    console.log('[XTI] URL:', location.href);
    console.log('[XTI] hook:', stat.hookInstalled, '| fetch调用', stat.fetchCalls, '| XHR调用', stat.xhrCalls, '| 接口拦截', stat.apiHits, '| ingest调用', stat.ingestCalls, '| 最近新增', stat.lastIngestAdded);
    console.log('[XTI] 回复树: 已知推文', knownIds.size, '| 父边', parentById.size, '| 深度缓存', depthCache.size);
    console.log('[XTI] 自动兜底已执行:', stat.autoReplayDone);
    console.log('[XTI] 最近 process:', stat.lastProcess);
    const cells = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
    const arts = document.querySelectorAll('article[data-testid="tweet"]');
    const padded = [...cells].filter(c => c.style.paddingLeft).length;
    console.log('[XTI] 页面: cell', cells.length, '| article', arts.length, '| 已缩进', padded, '| 首个cell的id:', cells[0] && cells[0].dataset ? cells[0].dataset.xtiId : '(无)');
    console.log('[XTI] performance 里共', graphqlEntries().length, '条可重放请求');
    if (stat.graphqlUrls.length) {
      console.log('[XTI] 本次会话看到的 graphql 接口名:');
      for (const u of stat.graphqlUrls) console.log('[XTI]   -', u.replace('https://x.com/i/api/graphql/', ''));
    } else {
      console.log('[XTI] 本次会话没有看到任何 graphql 请求经过 hook（fetchCalls=' + stat.fetchCalls + '）。若 fetchCalls=0，说明脚本没有运行在页面世界。');
    }
  }

  // ================= 2. DOM 侧：识别 cell 并应用缩进 =================

  function extract(cell) {
    const article = cell.querySelector('article[data-testid="tweet"]');
    if (!article) return null; // “显示更多回复”、广告、插入模块等没有 article

    // 头部第一个 /handle/status/id 链接即本条推文（正文引用卡片的链接排在其后）
    let handle = null, id = null;
    for (const a of article.querySelectorAll('a[href]')) {
      const m = (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
      if (m) { handle = m[1]; id = m[2]; break; }
    }
    if (!id) return null;

    // 旧版 X 的 “Replying to @a and @b” 提示（新版已移除，保留兼容）：最后一个 @ 是直接回复对象
    let isReply = false, parentHandle = null;
    const sc = article.querySelector('[data-testid="socialContext"]');
    if (sc) {
      const tags = [...sc.textContent.matchAll(/@([A-Za-z0-9_]{1,15})/g)].map(x => x[1]);
      if (tags.length) { isReply = true; parentHandle = tags[tags.length - 1].toLowerCase(); }
    }
    return { id, handle: handle.toLowerCase(), parentHandle, isReply };
  }

  // API 树里的精确深度
  function treeDepth(id) {
    if (depthCache.has(id)) return depthCache.get(id);
    const seen = new Set();
    let d = 0, cur = id;
    while (parentById.has(cur) && !seen.has(cur) && d < 40) {
      seen.add(cur);
      cur = parentById.get(cur);
      d++;
    }
    depthCache.set(id, d);
    return d;
  }

  function applyDepth(cell, depth, id) {
    const sig = id + '|' + depth;
    if (applied.get(cell) === sig) return; // 没变化就不写 DOM，避免触发 MutationObserver 死循环
    applied.set(cell, sig);
    cell.dataset.xtiId = id || '';
    if (depth > 0) {
      const d = Math.min(depth, MAX_INDENT_DEPTH);
      cell.style.paddingLeft = INDENT * d + 'px';
      cell.style.borderLeft = '3px solid ' + COLORS[Math.min(depth - 1, COLORS.length - 1)];
    } else {
      cell.style.paddingLeft = '';
      cell.style.borderLeft = '';
    }
  }

  function process() {
    const cells = document.querySelectorAll('div[data-testid="cellInnerDiv"]');
    if (!cells.length) return;

    // 换了对话就清空启发式缓存（API 树按 tweetId 全局唯一，不用清）
    const m = location.pathname.match(/^\/[^/]+\/status\/(\d+)/);
    const conv = m ? m[1] : null;
    if (conv !== currentConv) {
      if (currentConv !== null) log('切换对话:', conv);
      currentConv = conv;
      depthById.clear(); latestByHandle.clear();
    }
    cellById.clear();

    let prevDepth = 0, tweets = 0, treeHit = 0, indented = 0;
    for (const cell of cells) {
      const info = extract(cell);
      if (!info) { applyDepth(cell, 0, ''); continue; }
      tweets++;
      cellById.set(info.id, cell);

      let depth = 0;
      if (knownIds.has(info.id)) {
        // 精确：来自 API 回复树
        treeHit++;
        depth = treeDepth(info.id);
      } else if (info.isReply) {
        // 兜底：旧版 socialContext 提示（新版 X 已无此元素）
        const pid = latestByHandle.get(info.parentHandle);
        depth = (pid != null && depthById.has(pid)) ? depthById.get(pid) + 1 : prevDepth + 1;
      }
      depthById.set(info.id, depth);
      if (info.handle) latestByHandle.set(info.handle, info.id);
      prevDepth = depth;
      if (depth > 0) indented++;
      applyDepth(cell, depth, info.id);
    }
    const s = `cell=${cells.length} 推文=${tweets} 树命中=${treeHit}/${knownIds.size} 缩进=${indented}`;
    if (s !== stat.lastProcess) {
      stat.lastProcess = s;
      log('process:', s, '|', location.pathname.slice(0, 60));
    }
  }

  // ================= 3. 悬停高亮整条回复链 =================
  let hoverCell = null;
  let chainCells = [];
  function clearChain() {
    for (const c of chainCells) c.classList.remove('xti-hit');
    chainCells = [];
  }
  function updateChain(cell) {
    clearChain();
    hoverCell = cell;
    if (!cell) return;
    let id = cell.dataset.xtiId, guard = 0;
    const seen = new Set();
    while (id && !seen.has(id) && guard++ < 20) {
      seen.add(id);
      const c = cellById.get(id);
      if (c) { c.classList.add('xti-hit'); chainCells.push(c); }
      id = parentById.get(id) || null;
    }
  }
  function cellFromEvent(e) {
    const t = e.target;
    return (t instanceof Element) ? t.closest('div[data-testid="cellInnerDiv"]') : null;
  }
  document.addEventListener('mouseover', (e) => {
    const cell = cellFromEvent(e);
    if (cell !== hoverCell) updateChain(cell);
  });
  document.addEventListener('mouseout', (e) => {
    const t = e.relatedTarget;
    const to = (t instanceof Element) ? t.closest('div[data-testid="cellInnerDiv"]') : null;
    if (to !== hoverCell) updateChain(null);
  });

  // ================= 4. 样式 / 观察器 / 菜单 =================
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    [data-testid="cellInnerDiv"].xti-hit {
      background-color: rgba(29,155,240,.07) !important;
      border-left-color: ${CHAIN_COLOR} !important;
    }`;
  (document.head || document.documentElement).appendChild(styleEl);

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('XTI 诊断（控制台输出状态）', diagnostics);
    GM_registerMenuCommand('XTI 重新捕获评论数据', () => autoReplay(true));
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; process(); autoReplay(false); });
  }
  const mo = new MutationObserver(schedule);
  function start() {
    if (!document.body) return false;
    mo.observe(document.body, { childList: true, subtree: true });
    schedule();
    // 数据没拦到时，稍后再试一次自动兜底
    setTimeout(() => autoReplay(false), 5000);
    setTimeout(() => autoReplay(false), 15000);
    return true;
  }
  if (!start()) document.addEventListener('DOMContentLoaded', start);

  installHook();
  log(`v${VER} 启动（无开关，装了即生效）| ${location.href.slice(0, 80)}`);
})();
