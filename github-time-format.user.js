// ==UserScript==
// @name         GitHub 时间格式化
// @namespace    https://github.com/
// @version      1.4.0
// @description  将 GitHub 上的时间显示为中文：今天内显示“x 分钟前 / x 小时前”，昨天及更早显示 MM-DD HH:mm，跨年显示 YY-MM-DD HH:mm
// @match        https://github.com/*
// @match        https://*.github.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

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

  function freezeElement(el) {
    // 新版 relative-time 会把可见文本渲染在 Shadow DOM 里，并定时改回相对时间。
    // 遮蔽实例上的 update，让 GitHub 的 time-elements 不再重写文本。
    if (typeof el.update === 'function' && !el.dataset.codexFrozen) {
      el.update = () => {};
      el.dataset.codexFrozen = '1';
    }
  }

  function setVisibleText(el, text) {
    const root = el.shadowRoot;
    if (root) {
      let span = root.querySelector('[part="root"]');
      if (!span) {
        span = document.createElement('span');
        span.setAttribute('part', 'root');
        root.replaceChildren(span);
      }
      span.textContent = text;
    } else {
      el.textContent = text;
    }
  }

  function convertTimeElement(el) {
    const iso = el.getAttribute('datetime');
    if (!iso) return;

    const date = new Date(iso);
    const text = formatDate(date);
    if (!text) return;

    if (el.getAttribute('title') !== text) {
      el.setAttribute('title', text);
    }

    if (isToday(date)) {
      // 今天内显示中文相对时间，定时刷新以保持“分钟/小时”滚动更新。
      const rel = formatRelative(date);
      const root = el.shadowRoot;
      const current = root
        ? root.querySelector('[part="root"]')?.textContent
        : el.textContent;
      if (el.dataset.codexRel === rel && current === rel) return;
      freezeElement(el);
      setVisibleText(el, rel);
      el.dataset.codexRel = rel;
      return;
    }

    const root = el.shadowRoot;
    const current = root
      ? root.querySelector('[part="root"]')?.textContent
      : el.textContent;
    if (el.dataset.codexTime === iso && current === text) return;

    freezeElement(el);
    setVisibleText(el, text);
    el.dataset.codexTime = iso;
  }

  function scan(root) {
    root.querySelectorAll?.('relative-time, time-ago').forEach(convertTimeElement);
  }

  function init() {
    scan(document);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
          if (mutation.target.matches?.('relative-time, time-ago')) {
            convertTimeElement(mutation.target);
          }
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.matches?.('relative-time, time-ago')) {
            convertTimeElement(node);
          } else {
            scan(node);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['datetime'],
    });

    // 定时兜底，防止 GitHub 将时间重新渲染为相对时间。
    setInterval(() => scan(document), 5000);
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener('DOMContentLoaded', init);
  }
})();
