// ==UserScript==
// @name         多站点时间格式化
// @namespace    https://github.com/
// @version      1.7.0
// @description  将 GitHub、Gitee、X (Twitter)、Reddit、Stack Overflow、Instagram 等站点上的时间显示为中文：今天内显示“x 分钟前 / x 小时前”，昨天及更早显示 MM-DD HH:mm，跨年显示 YY-MM-DD HH:mm
// @match        *://*.github.com/*
// @match        *://*.reddit.com/*
// @match        *://*.stackoverflow.com/*
// @match        *://*.instagram.com/*
// @match        *://*.gitee.com/*
// @match        *://*.x.com/*
// @match        *://*.twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // 新增站点时在这里追加一条规则：
  // - hosts：站点域名，支持 “*.example.com” 同时匹配裸域 example.com 和任意子域
  // - selector：要替换的时间元素 CSS 选择器
  // - freeze / setText：按需覆盖元素冻结和文本写入方式
  const SITE_RULES = [
    {
      name: 'GitHub',
      hosts: ['*.github.com'],
      selector: 'relative-time, time-ago',
      freeze(el) {
        // 新版 relative-time 会把可见文本渲染在 Shadow DOM 里，并定时改回相对时间。
        // 遮蔽实例上的 update，让 GitHub 的 time-elements 不再重写文本。
        if (typeof el.update === 'function' && !el.dataset.codexFrozen) {
          el.update = () => {};
          el.dataset.codexFrozen = '1';
        }
      },
      setText(el, text) {
        setShadowRootText(el, text);
      },
    },
    {
      name: 'Gitee',
      hosts: ['*.gitee.com'],
      // Gitee 的时间是 <span class="timeago" datetime="2024-08-07 23:20" title="2024-08-07 23:20:09 +0800">2年前</span>
      selector: '.timeago, time[datetime], time.timeago, time[title]',
      getDateTime(el) {
        const raw =
          el.dataset.codexIso ||
          el.getAttribute('datetime') ||
          el.getAttribute('title') ||
          el.getAttribute('data-original-title');
        if (!raw) return null;
        // 带时区的标准 ISO（如 2024-08-07T23:20:08+08:00）原样交给 new Date 解析。
        if (
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) &&
          /(Z|[+-]\d{2}:?\d{2})$/.test(raw)
        ) {
          return raw;
        }
        const m = raw.match(
          /(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/
        );
        if (!m) return null;
        // Gitee 的 “2024-08-07 23:20” 等非 ISO 写法补全为标准格式（无时区按本地时区）；
        // 纯日期按本地零点处理，避免被当作 UTC 而偏移一天。
        return `${m[1]}T${m[2] || '00:00'}:${m[3] || '00'}`;
      },
      setText: setElementText,
    },
    {
      name: 'Reddit',
      hosts: ['*.reddit.com'],
      selector: 'time[datetime]',
      // Reddit 的时间元素由 Lit 渲染，只更新文本节点以保留注释标记。
      setText: setElementText,
    },
    {
      name: 'Stack Overflow',
      hosts: ['*.stackoverflow.com'],
      selector:
        'time[itemprop="dateCreated"], time.s-user-card--time, .relativetime, .relative-time, .relativetime-clean, a[href="?lastactivity"]',
      getDateTime(el) {
        // 空 time 元素通常是隐藏的 microdata，跳过，避免给不可见节点补上文本。
        if (!el.textContent.trim()) return null;
        const raw =
          el.dataset.codexIso ||
          el.getAttribute('datetime') ||
          el.getAttribute('title');
        if (!raw) return null;
        // title 可能是 “2026-07-12 01:00:11Z, License: CC BY-SA 4.0”，只取开头的 ISO 部分。
        const iso = raw.match(
          /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/
        );
        // Stack Overflow 的 datetime 可能是 “2012-06-27 13:51:36Z”，转成标准 ISO 便于解析。
        return (iso ? iso[1] : raw).replace(' ', 'T');
      },
      setText: setElementText,
    },
    {
      name: 'Instagram',
      hosts: ['*.instagram.com'],
      selector: 'time[datetime]',
      getDateTime(el) {
        // Instagram 的 time 元素带 title（如 “2026年8月20日”），
        // 若无标准 datetime 则尝试从 title 解析完整时间。
        const raw = el.getAttribute('datetime');
        if (raw) return raw;
        const title = el.getAttribute('title');
        if (!title) return null;
        // 尝试解析常见格式，若失败交给 new Date 兜底。
        return title;
      },
      setText: setElementText,
    },
    {
      name: 'X (Twitter)',
      hosts: ['*.x.com', '*.twitter.com'],
      // X 的时间是 <time datetime="2026-08-25T14:43:04.000Z">8月25日</time>，标准 ISO，默认流程即可。
      selector: 'time[datetime]',
      setText: setElementText,
    },
  ];

  const pad = (n) => String(n).padStart(2, '0');

  function formatDate(date) {
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    if (date.getFullYear() === new Date().getFullYear()) {
      return `${m}-${d} ${h}:${min}`;
    }
    const y = pad(date.getFullYear() % 100);
    return `${y}-${m}-${d} ${h}:${min}`;
  }

  function isToday(date) {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  function formatRelative(date) {
    const diffMs = Date.now() - date.getTime();
    const absSec = Math.abs(Math.floor(diffMs / 1000));
    const suffix = diffMs >= 0 ? '前' : '后';
    if (absSec < 60) {
      return diffMs >= 0 ? '刚刚' : '马上';
    }
    const min = Math.floor(absSec / 60);
    if (min < 60) {
      return `${min} 分钟${suffix}`;
    }
    return `${Math.floor(min / 60)} 小时${suffix}`;
  }

  function setElementText(el, text) {
    const textNode = [...el.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE
    );
    if (textNode) {
      textNode.nodeValue = text;
    } else {
      el.textContent = text;
    }
  }

  function setShadowRootText(el, text) {
    const root = el.shadowRoot;
    if (!root) return false;
    let span = root.querySelector('[part="root"]');
    if (!span) {
      span = document.createElement('span');
      span.setAttribute('part', 'root');
      root.replaceChildren(span);
    }
    span.textContent = text;
    return true;
  }

  function getCurrentText(el) {
    if (el.shadowRoot) {
      return el.shadowRoot.querySelector('[part="root"]')?.textContent || '';
    }
    return el.textContent;
  }

  function convertTimeElement(el, rule) {
    const iso = rule.getDateTime
      ? rule.getDateTime(el)
      : el.getAttribute('datetime');
    if (!iso) return;

    const date = new Date(iso);
    const text = formatDate(date);
    if (!text) return;

    // 缓存原始时间，供 getDateTime 从 title 取值的规则二次解析使用。
    el.dataset.codexIso = iso;

    if (el.getAttribute('title') !== text) {
      el.setAttribute('title', text);
    }

    if (isToday(date)) {
      // 今天内显示中文相对时间，定时刷新以保持“分钟/小时”滚动更新。
      const rel = formatRelative(date);
      if (el.dataset.codexRel === rel && getCurrentText(el) === rel) return;
      rule.freeze?.(el);
      if (rule.setText) {
        rule.setText(el, rel);
      } else if (!setShadowRootText(el, rel)) {
        el.textContent = rel;
      }
      el.dataset.codexRel = rel;
      return;
    }

    if (el.dataset.codexTime === iso && getCurrentText(el) === text) return;
    rule.freeze?.(el);
    if (rule.setText) {
      rule.setText(el, text);
    } else if (!setShadowRootText(el, text)) {
      el.textContent = text;
    }
    el.dataset.codexTime = iso;
  }

  function hostMatches(pattern, host) {
    const normalized = host.toLowerCase();
    if (pattern === normalized) return true;
    if (pattern.startsWith('*.')) {
      // *.x.com 同时匹配裸域 x.com 和任意子域（与 @match 通配符行为一致）。
      const base = pattern.slice(2);
      return normalized === base || normalized.endsWith('.' + base);
    }
    return false;
  }

  function getRuleForHost(host) {
    return SITE_RULES.find((rule) =>
      rule.hosts.some((pattern) => hostMatches(pattern, host))
    );
  }

  function scan(root, rule) {
    root.querySelectorAll?.(rule.selector).forEach((el) => {
      convertTimeElement(el, rule);
    });
  }

  function init() {
    const rule = getRuleForHost(location.hostname);
    if (!rule) return;

    scan(document, rule);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (mutation.target.matches?.(rule.selector)) {
            convertTimeElement(mutation.target, rule);
          }
          continue;
        }
        if (mutation.type === 'characterData') {
          const el = mutation.target.parentElement;
          if (el && el.matches?.(rule.selector)) {
            convertTimeElement(el, rule);
          }
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.(rule.selector)) {
            convertTimeElement(node, rule);
          } else {
            scan(node, rule);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['datetime'],
      characterData: true,
    });

    // 定时兜底，防止站点脚本将时间重新渲染为相对时间。
    setInterval(() => scan(document, rule), 5000);
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }
})();
