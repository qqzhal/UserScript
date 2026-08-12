// ==UserScript==
// @name         GitHub 时间格式化
// @namespace    https://github.com/
// @version      1.2.0
// @description  将 GitHub 上 Pull Request 和 Issue 的相对时间显示为 YY-MM-DD HH:mm 格式
// @match        https://github.com/*
// @match        https://*.github.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  function formatDate(iso) {
    const date = new Date(iso);
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

    const text = formatDate(iso);
    if (!text) return;

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
