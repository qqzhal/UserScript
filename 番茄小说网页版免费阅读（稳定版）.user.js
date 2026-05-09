// ==UserScript==
// @name              番茄小说网页版免费阅读（稳定版）
// @namespace         https://github.com/SmashPhoenix272
// @version           1.2.3
// @description       番茄小说免费网页阅读（更换API + 修复缺字 + 解除复制限制+下载）
// @license           MIT License
// @match             https://fanqienovel.com/*
// @icon              https://www.google.com/s2/favicons?sz=64&domain=fanqienovel.com
// @grant             GM_xmlhttpRequest
// @require           https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @downloadURL https://update.greasyfork.org/scripts/559080/%E7%95%AA%E8%8C%84%E5%B0%8F%E8%AF%B4%E7%BD%91%E9%A1%B5%E7%89%88%E5%85%8D%E8%B4%B9%E9%98%85%E8%AF%BB%EF%BC%88%E7%A8%B3%E5%AE%9A%E7%89%88%EF%BC%89.user.js
// @updateURL https://update.greasyfork.org/scripts/559080/%E7%95%AA%E8%8C%84%E5%B0%8F%E8%AF%B4%E7%BD%91%E9%A1%B5%E7%89%88%E5%85%8D%E8%B4%B9%E9%98%85%E8%AF%BB%EF%BC%88%E7%A8%B3%E5%AE%9A%E7%89%88%EF%BC%89.meta.js
// ==/UserScript==
/* global saveAs */

// ======================
//   API CLIENT
// ======================
class FqClient {
    async getContentKeys(itemId) {
        return this._apiRequest(itemId);
    }

    async _apiRequest(itemId) {
        const url = `https://tt.sjmyzq.cn/api/raw_full?item_id=${itemId}`;

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url,
                onload: (res) => {
                    try {
                        resolve(JSON.parse(res.responseText));
                    } catch (e) {
                        reject(e);
                    }
                },
                onerror: () => reject("API error"),
                timeout: 10000
            });
        });
    }
}

// ======================
// HELPERS
// ======================
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function processChapterContent(content) {
    return content
        .replace(/<\/p>/g, '\n')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .split('\n')
        .filter(l => l.trim())
        .map(l => "　　" + l.trim())
        .join('\n\n');
}

// ======================
// MAIN
// ======================
let currentProcessId = 0; // 全局任务锁，确保只有最新的任务在执行

(function () {
    'use strict';
    const client = new FqClient(); // 创建一个FqClient实例，供所有页面处理函数使用
    const path = location.href.match(/\/([^/]+)\/\d/)?.[1];

    // 页面初始化时，根据当前URL路径调用相应的处理函数
    if (path === "reader") {
        handleReaderPage(client);
    } else if (path === "page") {
        handleBookPage(client);
    }

    // ======================
    // 自动监听章节切换 (针对阅读页)
    // ======================
    let oldHref = location.href;

    // 封装检测URL变化并处理阅读页的逻辑
    const checkUrlAndHandleReaderPage = () => {
        if (location.href !== oldHref) {
            console.log(`[番茄助手] 监听到 URL 变化: ${oldHref} -> ${location.href}`);
            oldHref = location.href;
            if (location.href.includes("/reader/")) {
                handleReaderPage(client); // 调用阅读页处理函数
            }
        }
    };

    // 1. 劫持 History API (pushState 和 replaceState) 以捕获 SPA 内部导航
    const originalPushState = history.pushState;
    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        checkUrlAndHandleReaderPage();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        checkUrlAndHandleReaderPage();
    };

    // 2. 监听 popstate 事件，处理浏览器前进/后退操作
    window.addEventListener("popstate", checkUrlAndHandleReaderPage);
    // 注意：移除了对 document.documentElement 的 MutationObserver，
    // 避免在 React 渲染周期内强行干预 DOM 导致 removeChild 崩溃。
})();

// ======================
// READER PAGE
// ======================
async function handleReaderPage(client) {
    const processId = ++currentProcessId; // 记录当前任务 ID
    console.log("[番茄助手] 检测到页面切换，开始准备注入内容...");
    const chapterId = location.href.match(/\/(\d+)/)?.[1];
    console.log("[番茄助手] 目标章节 ID:", chapterId);
    if (!chapterId) return;

    await sleep(200); // 给 React 路由切换留一点“冷静期”

    let cdiv = null;
    // 采用无刷新轮询策略：最多尝试 5 次（总计约 2.5 秒），等待 React 渲染容器
    for (let i = 0; i < 5; i++) {
        cdiv = document.querySelector('.muye-reader-content');
        if (!cdiv) {
            const html0 = document.getElementById("html_0");
            cdiv = html0?.children[2] || html0?.children[0];
        }

        // 如果在等待过程中 URL 变了，或者有新的任务启动，立即终止旧任务
        if (processId !== currentProcessId) {
            console.log("[番茄助手] 检测到新任务，终止旧注入任务");
            return;
        }

        if (cdiv) break;
        console.warn(`[番茄助手] 正在等待容器渲染... 尝试第 ${i + 1} 次`);
        await sleep(500);
    }

    if (!cdiv) {
        console.error("[番茄助手] 5 次尝试后仍未找到容器，强制刷新页面以重置状态...");
        location.reload();
        return;
    }

    try {
        console.log("[番茄助手] 正在从 API 获取章节数据...");
        const res = await client.getContentKeys(chapterId);
        if (!res?.data?.content) {
            console.error("[番茄助手] API 返回数据异常或为空", res);
            return;
        }

        // 注入前最后一次检查，确保容器依然在文档中
        if (!document.contains(cdiv)) {
            console.warn("[番茄助手] 容器已失效，尝试重新进入流程...");
            return handleReaderPage(client);
        }

        console.log("[番茄助手] 数据获取成功，开始清洗并注入内容...");
        const content = res.data.content
            .replace(/<h1[^>]*>.*?<\/h1>/, '')
            .match(/<p[^>]*>.*?<\/p>/g)
            ?.map(p => {
                const t = p.replace(/<[^>]*>/g, '').trim();
                return `<p style="text-indent:2em;margin:12px 0;">${t}</p>`;
            })
            .join('') || '';

        if (processId !== currentProcessId) return; // 再次检查任务锁

        // 先清空，再注入，并保留原有的样式控制
        cdiv.innerHTML = ""; 

        cdiv.innerHTML = `<div style="padding:20px 0;">${content}</div>`;

        // ===== 解除复制限制（安全版）=====
        cdiv.classList.remove('noselect');
        cdiv.oncopy = null;
        cdiv.onselectstart = null;
        cdiv.oncontextmenu = null;

        if (!document.getElementById('fq-helper-style')) {
            const style = document.createElement('style');
            style.id = 'fq-helper-style';
            style.textContent = `
                .muye-reader-content,
                .muye-reader-content * {
                    user-select: text !important;
                    -webkit-user-select: text !important;
                }
                /* 使用 CSS 隐藏付费提示和引导层，而不是 remove() 它们 */
                /* 物理删除会导致 React 报错：The node to be removed is not a child of this node */
                .muye-to-fanqie, 
                .pay-page,
                .reader-muye-to-fanqie { 
                    display: none !important; 
                }
                /* 修复因付费限制导致的页面无法滚动 */
                .pay-page-html {
                    overflow: auto !important;
                }
            `;
            document.head.appendChild(style);
        }

        console.log("[番茄助手] 章节内容更新成功！");
    } catch (e) {
        console.error("[番茄助手] handleReaderPage 执行异常:", e);
    }
}

// ======================
// BOOK PAGE（下载）
// ======================
async function handleBookPage(client) {
    const infoName =
        document.querySelector("#app .info-name h1")?.innerText || "Novel";

    const books = [...document.getElementsByClassName("chapter-item")];
    let content = `Using Modified API Download\n\n书名：${infoName}\n`;

    await sleep(1200);

    // 查找新版“下载番茄小说APP”按钮
    const downloadBtn = document.querySelector("button.download-btn");
    if (!downloadBtn) {
        console.warn("未找到下载按钮，请检查页面元素");
        return;
    }

    // 修改按钮文字
    const span = downloadBtn.querySelector("span");
    if (span) {
        span.innerText = "下载小说TXT";
    } else {
        downloadBtn.innerText = "下载小说TXT";
    }

    // 绑定下载事件
    downloadBtn.onclick = async (e) => {
        e.preventDefault();

        for (const li of books) {
            const a = li.querySelector("a");
            const id = a?.href.match(/\/(\d+)/)?.[1];
            if (!id) continue;

            try {
                const res = await client.getContentKeys(id);
                if (!res?.data?.content) continue;

                const title = res.data.title || a.innerText.trim();
                const txt = processChapterContent(res.data.content);
                content += `\n\n${title}\n${txt}`;
                a.style.background = "#D2F9D1";
            } catch {
                a.style.background = "pink";
            }
        }

        saveAs(
            new Blob([content], { type: "text/plain;charset=UTF-8" }),
            infoName + ".txt"
        );
    };
}
