// ==UserScript==
// @name         多站点自定义 CSS 注入器
// @namespace    http://tampermonkey.net/
// @version      2.9
// @description  优化了执行频率，彻底解决视频切换卡顿，保留 1.5 核心逻辑
// @author       Gemini
// @match        *://*/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
    "use strict";

    const SITE_CONFIGS = [
        {
            name: "微博 - 悄悄关注",
            rule: "weibo.com/mygroups?gid=100052107841192",
            css: `
                footer .woo-box-flex .woo-box-item-flex .woo-box-flex .woo-box-item-flex:nth-child(1),
                footer .woo-box-flex .woo-box-item-flex .woo-box-flex .woo-box-item-flex:nth-child(3) { display: none !important; }
                header .woo-box-flex .woo-button-main[class*="_followbtn"] { display: none !important; }
                header .woo-box-flex .woo-font--angleDown[class*="_action"] { display: none !important; }
                .popcard[class*="_popcard"] { display: none !important; }
            `,
        },
        {
            name: "知乎 - 基础样式",
            rule: "zhihu.com",
            css: `.WriteArea { display: none !important; }`,
        },
    ];

    // --- 核心逻辑：带防抖的注入 ---
    let timer = null;
    const injectedStyles = new Set(); // 记录已注入的配置名称

    function init() {
        // 防抖：200ms 内无论触发多少次，只执行最后一次
        if (timer) clearTimeout(timer);
        
        timer = setTimeout(() => {
            const currentUrl = window.location.href;
            SITE_CONFIGS.forEach((config) => {
                if (currentUrl.includes(config.rule)) {
                    // 如果该配置已经注入过，则不再重复操作
                    if (injectedStyles.has(config.name)) return;

                    GM_addStyle(config.css);
                    injectedStyles.add(config.name);
                    console.log(`%c[CSS Injector] 注入成功: ${config.name}`, "color: white; background: #1a73e8; padding: 2px 5px;");
                }
            });
        }, 200); 
    }

    // 1. 立即执行
    init();

    // 2. 劫持 History API (处理 SPA 跳转)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
        originalPushState.apply(this, arguments);
        init();
    };
    history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        init();
    };

    // 3. 监听浏览器前进/后退/Hash
    window.addEventListener("popstate", init);
    window.addEventListener("hashchange", init);

    // 4. 针对微博视频卡顿的特殊处理：仅在页面加载完成后检查一次，不再持续监听 DOM
    window.addEventListener('load', init);

})();