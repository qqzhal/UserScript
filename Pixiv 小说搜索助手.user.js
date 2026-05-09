// ==UserScript==
// @name         Pixiv 小说搜索助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  支持标签页自动转搜索页，按顺序拼接参数，带记忆功能。
// @author       Assistant
// @match        https://www.pixiv.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
    "use strict";

    const ranges = {
        unlimited: { name: "不限", tlt: "", tgt: "" },
        micro: { name: "微型 (<4999)", tlt: "0", tgt: "4999" },
        short: { name: "短篇 (5000-19999)", tlt: "5000", tgt: "19999" },
        medium: { name: "中篇 (20000-79999)", tlt: "20000", tgt: "79999" },
        long: { name: "长篇 (>80000)", tlt: "80000", tgt: "" },
    };

    let currentConfig = GM_getValue("pixiv_novel_range", "medium");
    let isSearchMode = GM_getValue("pixiv_search_mode", false);

    function checkAndRedirect() {
        const currentUrl = window.location.href;
        const isTagPage = /\/tags\/(.*)\/novels/.test(currentUrl);
        const isSearchPage =
            currentUrl.includes("/search") && currentUrl.includes("type=novel");

        if (isTagPage || isSearchPage) {
            const url = new URL(currentUrl);
            const target = ranges[currentConfig];

            const currentTlt = url.searchParams.get("tlt") || "";
            const currentTgt = url.searchParams.get("tgt") || "";
            const currentLang = url.searchParams.get("work_lang") || "";
            let currentPage = url.searchParams.get("p") || "1";

            // 判定是否需要改变：参数不符 OR (是标签页且开启了搜索模式)
            let needsChange = false;
            if (
                currentTlt !== target.tlt ||
                currentTgt !== target.tgt ||
                currentLang !== "zh-cn"
            ) {
                needsChange = true;
                currentPage = "1";
            }
            if (isTagPage && isSearchMode) {
                needsChange = true;
            }

            if (needsChange) {
                const newParams = new URLSearchParams();
                let finalPath = url.pathname;

                // 1. 处理搜索模式转换
                if (isSearchMode || isSearchPage) {
                    finalPath = "/search";
                    // 提取关键字
                    let keyword = url.searchParams.get("q");
                    if (!keyword && isTagPage) {
                        const match =
                            url.pathname.match(/\/tags\/(.*)\/novels/);
                        keyword = match ? decodeURIComponent(match[1]) : "";
                    }

                    if (currentPage !== "1") newParams.set("p", currentPage);
                    newParams.set("q", keyword);
                    newParams.set("s_mode", "tag");// tag_tc tag
                    newParams.set("type", "novel");
                } else {
                    // 标签页模式
                    if (currentPage !== "1") newParams.set("p", currentPage);
                }

                // 2. 拼接通用参数
                if (target.tlt) newParams.set("tlt", target.tlt);
                if (target.tgt) newParams.set("tgt", target.tgt);
                newParams.set("work_lang", "zh-cn");

                const newSearch = newParams.toString();
                const finalUrl =
                    url.origin + finalPath + (newSearch ? "?" + newSearch : "");

                if (finalUrl !== currentUrl) {
                    window.location.replace(finalUrl);
                }
            }
        }
    }

    function createUI() {
        if (document.getElementById("pixiv-range-selector")) return;

        const container = document.createElement("div");
        container.id = "pixiv-range-selector";
        container.style = `
            position: fixed; bottom: 20px; left: 20px; z-index: 9999;
            background: #fff; border: 1px solid #ddd; padding: 6px 12px;
            border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            font-size: 16px; display: flex; align-items: center; gap: 10px;
            opacity: 0; transition: opacity 0.3s ease; cursor: default;
        `;

        container.onmouseenter = () => (container.style.opacity = "1");
        container.onmouseleave = () => (container.style.opacity = "0");

        // 字数下拉列表
        const rangePart = document.createElement("div");
        rangePart.style = "display: flex; align-items: center; gap: 5px;";
        rangePart.innerHTML = '<span style="color:#666">字数:</span>';
        const select = document.createElement("select");
        select.style =
            "border: none; background: transparent; cursor: pointer; font-weight: bold; outline: none; font-size: 16px;";
        Object.keys(ranges).forEach((key) => {
            const opt = document.createElement("option");
            opt.value = key;
            opt.innerText = ranges[key].name;
            if (key === currentConfig) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e) => {
            currentConfig = e.target.value;
            GM_setValue("pixiv_novel_range", currentConfig);
            checkAndRedirect();
        };
        rangePart.appendChild(select);

        // 搜索模式开关
        const searchPart = document.createElement("label");
        searchPart.style =
            "display: flex; align-items: center; gap: 4px; cursor: pointer; border-left: 1px solid #eee; padding-left: 10px;";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isSearchMode;
        checkbox.onchange = (e) => {
            isSearchMode = e.target.checked;
            GM_setValue("pixiv_search_mode", isSearchMode);
            checkAndRedirect();
        };
        const searchLabel = document.createElement("span");
        searchLabel.innerText = "跳转搜索";
        searchLabel.style = "font-size: 14px; color: #666;";

        searchPart.appendChild(checkbox);
        searchPart.appendChild(searchLabel);

        container.appendChild(rangePart);
        container.appendChild(searchPart);
        document.body.appendChild(container);
    }

    checkAndRedirect();
    createUI();

    const originalPushState = history.pushState;
    history.pushState = function () {
        originalPushState.apply(this, arguments);
        setTimeout(() => {
            checkAndRedirect();
        }, 150);
    };

    window.addEventListener("popstate", checkAndRedirect);
})();
