// ==UserScript==
// @name         B站弹幕广告跳过助手
// @version      1.6.3
// @description  基于弹幕提示自动跳过片头/广告/赞助段落 — 纯本地解析，无AI依赖，防日期混淆，支持重复验证，页面广告段检测
// @author       Reasonix
// @license      MIT
// @match        *://*.bilibili.com/video/*
// @match        *://bilibili.com/video/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @noframes
// @namespace https://greasyfork.org/users/714468
// ==/UserScript==

(function () {
'use strict';

/* 版本号 */
const SCRIPT_VERSION = '1.6.3';
const SCRIPT_BUILD = 4;

/* ===================================================================
   CONFIG
   =================================================================== */
const CONFIG = {
    // 跳转触发
    decisionWindow: 1500,            // 默认倒计时窗口（ms），用户可在面板中自定义
    targetOffset: 0.5,              // 跳转偏移（秒），略过目标点让体验自然

    // 频率/聚类
    CLUSTER_WINDOW: 3,              // 相近时间验证窗口（秒）：±N秒内有其他弹幕指向相近时间才算有效
    CLUSTER_MIN_COUNT: 2,           // 至少N条独立弹幕确认才触发
    DEDUP_WINDOW: 2,               // 去重窗口（秒）：±N秒内的目标合并为一个
    FREQUENCY_WINDOW: 10,           // 频率统计窗口（秒）
    FREQUENCY_MIN_COUNT: 2,         // 频率统计最少重复次数

    // 冷却
    COOLDOWN_BEFORE: 5,             // 触发点前N秒不识别
    COOLDOWN_AFTER: 30,             // 跳转后N秒不识别
    SEEK_BACK_THRESHOLD: 2,         // 用户回退超过N秒视为重置

    // 范围
    MIN_JUMP_TIME: 5,               // 最小跳转目标（秒），忽略 0:00~0:05 的无意义跳转
    MIN_JUMP_DURATION: 5,           // 最小跳转距离（秒），低于此值不跳（防时间噪声抖动）
    MAX_JUMP_TIME: 1800,            // 最大跳转目标（秒），30分钟以上的忽略
    MAX_TARGET_RATIO: 0.67,         // 跳转目标不超过视频总长的2/3，防短视频跳过头

    // API
    API_READ_DELAY: 1000,           // 页面加载后延迟读取弹幕
    API_RETRY_DELAY: 5000,          // 失败重试间隔

    // 过滤
    MAX_DANMAKU_LENGTH: 24,         // 弹幕超过此长度跳过。社区常见重复格式（如 "343工程      343工程"）约22字
    MAX_GAP_SECONDS: 180,           // 弹幕与目标时间最大间隔（秒），超过3分钟的跳转不合理

    // 缓存
    CACHE_TTL: 7 * 24 * 3600 * 1000, // 视频记忆有效期 7 天
    CACHE_MAX_ENTRIES: 50,           // localStorage 最多保留的视频缓存数

    // 页面广告段检测
    AD_SCAN_INTERVAL: 3000,         // 扫描简介/章节的间隔（ms）
    AD_SKIP_OFFSET: 0.5,            // 跳过广告段结束位置时的偏移（秒）
    MISSED_TRIGGER_LEAD: 10,        // 错过弹幕触发点后，接近目标前N秒才开始兜底倒计时
};

/* ===================================================================
   关键词列表
   =================================================================== */
// 广告跳过相关 — 出现这些词的弹幕更可能指向跳转点
const SKIP_KEYWORDS = [
    '指路', '空降', '正片', '跳过', '片头', '前方高能', '高能预警',
    '工程', '点位', '开幕', '起点', '进度条', '直达', '传送',
    '跳转', '开幕雷击', '高能', '正题', '进入正题', '广告结束',
    'OP结束', '片头结束', '前情提要结束', '直接看', '从这里开始',
    '快进', '跳过OP', '跳过广告', '正片开始', '导航', '引导', '直奔',
    '空降到', '定位', '快进到', '拖到', '拉到', '切到', '跳转到',
    '砍到', '速通', '省流', '划重点',
    '跳伞', '空降兵',
];

// 日期/生日相关 — 出现这些词的弹幕应被排除
const DATE_KEYWORDS = [
    '生日', '周年', '纪念日', '节日', '毕业', '入学',
    '国庆', '春节', '元旦', '中秋', '端午', '清明', '重阳', '七夕',
    '圣诞', '情人节', '愚人节', '劳动节', '儿童节', '建军节', '教师节',
    '妇女节', '青年节', '万圣', '感恩节', '除夕', '元宵', '腊八',
    '处女座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座',
    '白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '天秤座',
    '快乐', '加油', '打卡', '签到', '来了',
];

// 非时间语境单位 — 数字后面跟这些词的弹幕不是跳转提示
const NON_TIME_UNITS = [
    '块钱', '毛钱', '元钱', '块钱的', '一条', '一个',
    '块', '元', '条', '个', '匹', '只', '台', '辆', '次', '遍',
    '张', '本', '首', '层', '楼', '级', '米', '公里', '斤', '公斤', '吨', '升',
    '马力', '瓦', '赫兹', '像素', '万人', '万人了',
    '口径', '毫米',        // "100毫米口径" → 炮口径，不是时间编码
    '万', '千', '百', '折', '码', '岁', '周年',
    '亿',              // "100亿" → 数量，不是时间编码
    '刀', '美刀', '美元', '欧元', '英镑', '日元', '卢布',
    '不多',            // "300不多" → 数量描述，不是时间编码
];

// 感谢/赞赏关键词 — 出现在目标时间附近说明此处是正片起点
// ⚠ 只保留明确表达感谢/确认的词，去掉"开始""没错"等通用日常用语防误判
const GRATITUDE_KEYWORDS = [
    '感谢', '谢谢', '多谢', '投币', '关注',
    '谢谢指路', '感谢指路', '感谢空降', '辛苦了', '帮大忙',
    '二刷', '重温',
    '合影', '欢迎回来', '成功着陆', '安全着陆',
];

// 页面广告报告关键词 — 视频简介含这些词 + 时间区间 → 标记为广告段
const AD_REPORT_KEYWORDS = [
    '广告', '赞助', '推广', '合作', '恰饭', '商单', '商务', '广子',
    'ad', 'sponsored', 'promotion',
    '片头广告', '中插广告', '贴片广告', '植入',
];

/* ===================================================================
   日期/生日过滤
   =================================================================== */
function isValidMonthDay(month, day) {
    if (month < 1 || month > 12) return false;
    if (day < 1) return false;
    const maxDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return day <= maxDays[month - 1];
}

function isDateLike(text) {
    // 1. 日期关键词直接排除
    if (DATE_KEYWORDS.some(kw => text.includes(kw))) return true;

    // 2. 日期格式：YYYY年MM月DD日 / MM月DD日 / YYYY-MM-DD / MM-DD
    //    但验证月/日是否真实存在，虚假日期（如 11月49日）不视为日期
    const fullDateMatch = text.match(/\d{4}\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (fullDateMatch) {
        const m = parseInt(fullDateMatch[1]), d = parseInt(fullDateMatch[2]);
        if (isValidMonthDay(m, d)) return true;
    }
    const shortDateMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (shortDateMatch) {
        const m = parseInt(shortDateMatch[1]), d = parseInt(shortDateMatch[2]);
        if (isValidMonthDay(m, d)) return true;
        // 月份日数值都合理但为虚假日期（如 11月49日），不作为日期过滤
    }
    if (/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/.test(text)) return true;

    // 2b. "6日21日3：09" 格式 — 日期间隔无"月"，含时间时滤为日期
    if (/\d{1,2}\s*日\s*\d{1,2}\s*日/.test(text)) return true;

    // 3. 纯4位数年份：1900-2100
    const yearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
        const year = parseInt(yearMatch[1]);
        if (year >= 1900 && year <= 2100) return true;
    }

    // 4. 含"月"/"日"/"年"但不含时间分隔符（: / 分 / 秒）
    //    但如果是"数字月数字日"格式，验证月份日数是否真实存在
    const hasDateUnit = /[月日年]/.test(text);
    const hasTimeUnit = /[分秒]|[:：]/.test(text);
    if (hasDateUnit && !hasTimeUnit) {
        // 对于"数字月数字日"格式，排除虚假日期（如 11月49日编码 11:49）
        const dateMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
        if (dateMatch) {
            const m = parseInt(dateMatch[1]), d = parseInt(dateMatch[2]);
            if (!isValidMonthDay(m, d)) return false; // 虚假日期 → 不作为日期过滤
        }
        return true;
    }

    // 5. 纯中文数字 + 年/月/日
    if (/[一二三四五六七八九十百千零两]+[年月日]/.test(text)) return true;

    return false;
}

function hasSkipKeyword(text) {
    return SKIP_KEYWORDS.some(kw => text.includes(kw));
}

/* ===================================================================
   时间上下文判断
   =================================================================== */
function hasTimeContext(text) {
    // 有时间分隔符（半角: / 全角：），且前后有数字才视为时间上下文
    if (/\d[:：]\d/.test(text)) return true;
    // 有时间单位
    if (/[分秒]/.test(text)) return true;
    // 有跳过关键词（工程/点位等）
    if (SKIP_KEYWORDS.some(kw => text.includes(kw))) return true;
    // 有时间编码后缀（如 "1259计划" / "438工程" → 数字为时间引用）
    if (/(?:工程|计划|点位|坐标|公路|道路|侠|巷|冠军|选手|国道|魔道|高地|高速)/.test(text)) return true;
    // 方向动词+数字：“去1052躲避”“到320集合”“前往438”等→跳转指令
    if (/(?:去|到|前往|去往|进)\s*\d{3,4}/.test(text)) return true;
    // 日期伪装标记："11月49日" 等虚假日期→编码时间
    if (/\d{1,2}\s*月\s*\d{1,2}\s*日/.test(text)) return true;
    return false;
}

function hasNonTimeContext(text) {
    return NON_TIME_UNITS.some(unit => text.includes(unit));
}

function lowerBound(arr, value) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < value) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function upperBound(arr, value) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] <= value) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * 构建弹幕时间索引和文本解析缓存。
 * 弹幕文本会在多条互证路径中被重复解析，这里每个文本只解析一次；
 * 同时用时间数组支持二分查找，避免每次统计都遍历全部弹幕。
 */
function createDanmakuIndex(allDanmakus) {
    const danmakus = allDanmakus.slice().sort((a, b) => a.danmakuTime - b.danmakuTime);
    const times = danmakus.map(d => d.danmakuTime);
    const parseCache = new Map();
    const metaMap = new WeakMap();

    function parseCached(text) {
        if (parseCache.has(text)) return parseCache.get(text);
        const value = parseTimeSimple(text);
        parseCache.set(text, value);
        return value;
    }

    function meta(dm) {
        let item = metaMap.get(dm);
        if (item) return item;
        const text = dm.content || '';
        item = {
            text,
            parsed: parseCached(text),
            hasSkip: hasSkipKeyword(text),
            hasTimeContext: hasTimeContext(text),
            hasNonTimeContext: hasNonTimeContext(text),
            gratitude: GRATITUDE_KEYWORDS.some(kw => text.includes(kw)),
            isDate: isDateLike(text),
            dotFormat: /\d\.\d{2}/.test(text),
            colonFormat: /\d[:：]\d/.test(text),
            hasChinese: /[\u4e00-\u9fff]/.test(text),
        };
        metaMap.set(dm, item);
        return item;
    }

    const forwardTargets = [];
    const potentialSkips = [];
    for (const dm of danmakus) {
        const m = meta(dm);
        if (m.parsed !== null && m.parsed > dm.danmakuTime) {
            forwardTargets.push({ dm, targetTime: m.parsed });
            if (m.hasSkip || m.hasTimeContext) {
                potentialSkips.push({ dm, targetTime: m.parsed });
            }
        }
    }
    forwardTargets.sort((a, b) => a.targetTime - b.targetTime || a.dm.danmakuTime - b.dm.danmakuTime);
    potentialSkips.sort((a, b) => a.targetTime - b.targetTime || a.dm.danmakuTime - b.dm.danmakuTime);

    return {
        danmakus,
        times,
        meta,
        forwardTargets,
        forwardTargetTimes: forwardTargets.map(item => item.targetTime),
        potentialSkips,
        potentialSkipTimes: potentialSkips.map(item => item.targetTime),
    };
}

/**
 * 检查目标时间附近是否有感谢类弹幕（反向验证跳转点正确性）
 * @returns {number} 匹配的弹幕数量
 */
function countGratitudeDanmaku(targetTime, allDanmakus, windowSec = 3, index = null) {
    if (index) {
        let count = 0;
        const lo = lowerBound(index.times, targetTime - windowSec);
        const hi = upperBound(index.times, targetTime + windowSec);
        for (let i = lo; i < hi; i++) {
            if (index.meta(index.danmakus[i]).gratitude) count++;
        }
        return count;
    }

    let count = 0;
    for (const dm of allDanmakus) {
        if (dm.danmakuTime >= targetTime - windowSec &&
            dm.danmakuTime <= targetTime + windowSec) {
            if (GRATITUDE_KEYWORDS.some(kw => dm.content.includes(kw))) {
                count++;
            }
        }
    }
    return count;
}

/**
 * 统计目标时间附近的感谢弹幕，且要求出现时间在跳转触发弹幕之后
 * @param {number} triggerDT - 跳转触发弹幕的出现时间（秒）
 * @param {number} targetDT - 跳转目标时间（秒）
 * @param {Array} dms - 全部弹幕
 * @param {number} ws - 检测窗口（秒）
 * @returns {number} 时序正确的感谢弹幕数量
 */
function countGratitudeAfterTrigger(triggerDT, targetDT, dms, ws = 3, index = null) {
    if (index) {
        let c = 0;
        const lo = lowerBound(index.times, targetDT - ws);
        const hi = upperBound(index.times, targetDT + ws);
        for (let i = lo; i < hi; i++) {
            const dm = index.danmakus[i];
            if (dm.danmakuTime <= triggerDT) continue;
            if (index.meta(dm).gratitude) c++;
        }
        return c;
    }

    let c = 0;
    for (const d of dms) {
        if (d.danmakuTime <= triggerDT) continue; // 必须出现在跳转弹幕之后
        if (d.danmakuTime >= targetDT - ws && d.danmakuTime <= targetDT + ws) {
            if (GRATITUDE_KEYWORDS.some(kw => d.content.includes(kw))) c++;
        }
    }
    return c;
}

/** 获取目标时间附近的具体感谢弹幕列表（用于面板显示） */
function findGratitudeDanmaku(targetTime, allDanmakus, windowSec = 3, index = null) {
    if (index) {
        const list = [];
        const lo = lowerBound(index.times, targetTime - windowSec);
        const hi = upperBound(index.times, targetTime + windowSec);
        for (let i = lo; i < hi; i++) {
            const dm = index.danmakus[i];
            if (!index.meta(dm).gratitude) continue;
            list.push({ time: dm.danmakuTime, text: dm.content.substring(0, 40) });
        }
        return list;
    }

    const list = [];
    for (const dm of allDanmakus) {
        if (dm.danmakuTime >= targetTime - windowSec &&
            dm.danmakuTime <= targetTime + windowSec) {
            if (GRATITUDE_KEYWORDS.some(kw => dm.content.includes(kw))) {
                list.push({ time: dm.danmakuTime, text: dm.content.substring(0, 40) });
            }
        }
    }
    return list;
}

/**
 * 统计目标时间附近那些感谢弹幕是否引用了跳转弹幕的触发时间
 * 原理：跳转弹幕 @2:00 "304工程"→3:04，后方感谢弹幕 "谢谢2:00" 中的 2:00
 * 解析出 2:00，与 triggerDanmakuTime 相近 → 真正的互证
 * @param {number} targetTime - 跳转目标时间（秒）
 * @param {number} triggerDanmakuTime - 跳转弹幕的出现时间（秒）
 * @param {Array} allDanmakus - 全部弹幕
 * @param {number} windowSec - 检测窗口（默认 ±3s）
 * @returns {number} 时间互证的感谢弹幕数量
 */
function countTimeConfirmedGratitude(targetTime, triggerDanmakuTime, allDanmakus, windowSec = 3, index = null) {
    if (index) {
        let count = 0;
        const lo = lowerBound(index.times, targetTime - windowSec);
        const hi = upperBound(index.times, targetTime + windowSec);
        for (let i = lo; i < hi; i++) {
            const dm = index.danmakus[i];
            const m = index.meta(dm);
            if (!m.gratitude || m.parsed === null) continue;
            if (Math.abs(m.parsed - triggerDanmakuTime) <= CONFIG.CLUSTER_WINDOW) count++;
        }
        return count;
    }

    let count = 0;
    for (const dm of allDanmakus) {
        if (dm.danmakuTime >= targetTime - windowSec &&
            dm.danmakuTime <= targetTime + windowSec) {
            // 必须是感谢类弹幕
            if (!GRATITUDE_KEYWORDS.some(kw => dm.content.includes(kw))) continue;
            // 提取感谢弹幕自身包含的时间引用
            const refTime = parseTimeSimple(dm.content);
            if (refTime === null) continue;
            // 时间引用与跳转弹幕的触发时间相近 → 确认是正确的跳转
            if (Math.abs(refTime - triggerDanmakuTime) <= CONFIG.CLUSTER_WINDOW) {
                count++;
            }
        }
    }
    return count;
}

/**
 * 统计目标时间附近任何包含同时间引用的弹幕数量（无关键词限制）
 * 例：跳转弹幕 @2:00 "上车502"→5:02，目标附近弹幕 @5:01 "502道路通常"
 * 解析出 5:02，与 targetTime 相近 → 互证（无论是否含感谢词）
 * @param {number} targetTime - 跳转目标时间（秒）
 * @param {Array} allDanmakus - 全部弹幕
 * @param {number} windowSec - 检测窗口（默认 ±3s）
 * @returns {number} 引用相同时间的弹幕数量
 */
function countTimeReferencingDanmaku(targetTime, allDanmakus, windowSec = 3, index = null) {
    if (index) {
        let count = 0;
        const lo = lowerBound(index.times, targetTime - windowSec);
        const hi = upperBound(index.times, targetTime + windowSec);
        for (let i = lo; i < hi; i++) {
            const dm = index.danmakus[i];
            const m = index.meta(dm);
            if (m.parsed === null) continue;
            if (Math.abs(m.parsed - targetTime) <= CONFIG.CLUSTER_WINDOW) count++;
        }
        return count;
    }

    let count = 0;
    for (const dm of allDanmakus) {
        if (dm.danmakuTime >= targetTime - windowSec &&
            dm.danmakuTime <= targetTime + windowSec) {
            const refTime = parseTimeSimple(dm.content);
            if (refTime === null) continue;
            // 时间引用与 targetTime 相近 → 前后呼应
            if (Math.abs(refTime - targetTime) <= CONFIG.CLUSTER_WINDOW) {
                count++;
            }
        }
    }
    return count;
}

/**
 * 从感谢弹幕中反向发现遗漏的跳转点
 * 原理：目标位置有人发"谢谢318工程"，但前方没有精确指向3:18的跳过弹幕
 * 此时在全部弹幕中搜索指向相近时间（±3s）的跳过弹幕，补建跳转点
 */
function discoverFromGratitude(allDanmakus, existingTriggers, currentTime, index = null) {
    // 构建已覆盖的目标时间集合（±2s）
    const covered = new Set();
    for (const t of existingTriggers) {
        for (let offset = -2; offset <= 2; offset++) {
            covered.add(Math.round(t.targetTime) + offset);
        }
    }

    // 收集未覆盖的感谢弹幕时间引用
    const gratitudeRefs = [];
    const sourceDanmakus = index ? index.danmakus : allDanmakus;

    for (const dm of sourceDanmakus) {
        if (dm.danmakuTime <= currentTime) continue;
        if (index) {
            if (!index.meta(dm).gratitude) continue;
        } else if (!GRATITUDE_KEYWORDS.some(kw => dm.content.includes(kw))) continue;

        const refTime = index ? index.meta(dm).parsed : parseTimeSimple(dm.content);
        if (refTime === null) continue;
        if (refTime < CONFIG.MIN_JUMP_TIME || refTime > CONFIG.MAX_JUMP_TIME) continue;
        if (covered.has(Math.round(refTime))) continue;

        gratitudeRefs.push({ refTime, danmakuTime: dm.danmakuTime, content: dm.content });
    }

    if (gratitudeRefs.length === 0) return [];

    const discovered = [];

    for (const ref of gratitudeRefs) {
        // 搜索指向相近时间（±CLUSTER_WINDOW）的跳过弹幕，必须在感谢弹幕之前出现
        const nearbySkips = [];
        if (index) {
            const lo = lowerBound(index.potentialSkipTimes, ref.refTime - CONFIG.CLUSTER_WINDOW);
            const hi = upperBound(index.potentialSkipTimes, ref.refTime + CONFIG.CLUSTER_WINDOW);
            for (let k = lo; k < hi; k++) {
                const item = index.potentialSkips[k];
                const dm = item.dm;
                if (dm.danmakuTime >= ref.danmakuTime) continue;
                nearbySkips.push({
                    danmakuTime: dm.danmakuTime,
                    targetTime: item.targetTime,
                    content: dm.content,
                    hasKeyword: index.meta(dm).hasSkip,
                });
            }
        } else {
            for (const dm of allDanmakus) {
                if (dm.danmakuTime >= ref.danmakuTime) continue;
                const t = parseTimeSimple(dm.content);
                if (t === null) continue;
                // 往回跳转（目标时间 ≤ 弹幕出现时间）→ 一定是错的，忽略
                if (t <= dm.danmakuTime) continue;
                if (Math.abs(t - ref.refTime) > CONFIG.CLUSTER_WINDOW) continue;
                // 必须有时钟上下文或跳过关键词
                if (!hasSkipKeyword(dm.content) && !hasTimeContext(dm.content)) continue;

                nearbySkips.push({
                    danmakuTime: dm.danmakuTime,
                    targetTime: t,
                    content: dm.content,
                    hasKeyword: hasSkipKeyword(dm.content),
                });
            }
        }

        if (nearbySkips.length === 0) continue;

        // 聚类相近目标时间，取确认数最多的
        const clusters = clusterSimilarTimes(nearbySkips, CONFIG.CLUSTER_WINDOW);
        const best = clusters.reduce((a, b) =>
            a.members.length >= b.members.length ? a : b
        );

        if (best && best.members.length >= 1) {
            const earliest = best.members.reduce((a, b) =>
                a.danmakuTime < b.danmakuTime ? a : b
            );

            const trigger = {
                targetTime: best.targetTime,
                triggerDanmakuTime: earliest.danmakuTime,
                matchedContent: earliest.content,
                memberCount: best.members.length,
                gratitudeCount: 1,
                source: 'gratitude',
            };

            // 去重检查
            const dup = [...existingTriggers, ...discovered].some(t =>
                Math.abs(t.targetTime - trigger.targetTime) <= CONFIG.DEDUP_WINDOW
            );
            if (!dup) {
                discovered.push(trigger);
                for (let o = -2; o <= 2; o++) covered.add(Math.round(trigger.targetTime) + o);
            }
        }
    }

    return discovered;
}

/**
 * 直接从确认弹幕聚类发现跳转点（不依赖触发弹幕是否被解析）
 * 原理：如果某个时间位置聚集了多条感谢/好评弹幕，即使没有解析出触发弹幕，
 * 也能推断该位置是跳转目标。再反向搜索前方是否有指向相近时间的弹幕。
 */
function discoverFromConfirmationClusters(allDanmakus, currentTime, existingTriggers, index = null) {
    // 构建已覆盖集合
    const covered = new Set();
    for (const t of existingTriggers) {
        for (let o = -2; o <= 2; o++) covered.add(Math.round(t.targetTime) + o);
    }

    // 将确认弹幕（感谢/好评关键词）按时间桶归类（1秒粒度）
    // 只取那些不含可解析时间引用的纯确认弹幕
    const buckets = new Map();
    const sourceDanmakus = index ? index.danmakus : allDanmakus;

    for (const dm of sourceDanmakus) {
        if (dm.danmakuTime <= currentTime) continue;
        const isConfirm = index ? index.meta(dm).gratitude : GRATITUDE_KEYWORDS.some(kw => dm.content.includes(kw));
        if (!isConfirm) continue;
        const parsed = index ? index.meta(dm).parsed : parseTimeSimple(dm.content);
        if (parsed !== null) continue; // 含时间引用的由 discoverFromGratitude 处理

        const bucket = Math.round(dm.danmakuTime);
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket).push({ time: dm.danmakuTime, text: dm.content.substring(0, 30) });
    }

    if (buckets.size === 0) return [];

    const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
    const result = [];

    // 滑动窗口：连续3秒内 ≥3 条确认弹幕 → 候选点
    for (let i = 0; i < sorted.length; i++) {
        let total = 0;
        let allSamples = [];
        for (let j = i; j < sorted.length && sorted[j][0] - sorted[i][0] <= 3; j++) {
            total += sorted[j][1].length;
            allSamples.push(...sorted[j][1]);
        }
        if (total < 20) continue;

        const candidateTime = sorted[i][0]; // 窗口起点作为候选时间
        if (candidateTime < CONFIG.MIN_JUMP_TIME || candidateTime > CONFIG.MAX_JUMP_TIME) continue;
        if (covered.has(candidateTime)) continue;

        // 反向搜索前方弹幕中指向相近时间的触发弹幕
        const searchStart = Math.max(0, candidateTime - CONFIG.MAX_GAP_SECONDS);
        const searchEnd = candidateTime - CONFIG.MIN_JUMP_DURATION;
        let bestTrigger = null;

        if (index) {
            const lo = lowerBound(index.forwardTargetTimes, candidateTime - CONFIG.CLUSTER_WINDOW);
            const hi = upperBound(index.forwardTargetTimes, candidateTime + CONFIG.CLUSTER_WINDOW);
            for (let k = lo; k < hi; k++) {
                const item = index.forwardTargets[k];
                const dm = item.dm;
                if (dm.danmakuTime < searchStart || dm.danmakuTime > searchEnd) continue;
                const isBetter = !bestTrigger ||
                    Math.abs(item.targetTime - candidateTime) < Math.abs(bestTrigger.targetTime - candidateTime);
                if (isBetter) {
                    bestTrigger = {
                        danmakuTime: dm.danmakuTime,
                        content: dm.content,
                        targetTime: item.targetTime,
                    };
                }
            }
        } else {
            for (const dm of allDanmakus) {
                if (dm.danmakuTime < searchStart || dm.danmakuTime > searchEnd) continue;
                const refTime = parseTimeSimple(dm.content);
                if (refTime === null) continue;
                if (refTime <= dm.danmakuTime) continue; // 不能往回跳
                if (Math.abs(refTime - candidateTime) <= CONFIG.CLUSTER_WINDOW) {
                    const isBetter = !bestTrigger ||
                        Math.abs(refTime - candidateTime) < Math.abs(bestTrigger.targetTime - candidateTime);
                    if (isBetter) {
                        bestTrigger = {
                            danmakuTime: dm.danmakuTime,
                            content: dm.content,
                            targetTime: refTime,
                        };
                    }
                }
            }
        }

        // 必须找到反向匹配的源指路弹幕，否则不创建触发点
        if (!bestTrigger) continue;

        const trigger = {
            targetTime: candidateTime,
            triggerDanmakuTime: bestTrigger.danmakuTime,
            matchedContent: bestTrigger.content,
            memberCount: total,
            gratitudeCount: total,
            gratitudeDetails: allSamples.slice(0, 3),
            sourceLabel: '聚类验证',
            source: 'confirmation-only',
        };

        // 去重
        const dup = [...existingTriggers, ...result].some(t =>
            Math.abs(t.targetTime - trigger.targetTime) <= CONFIG.DEDUP_WINDOW
        );
        if (!dup) {
            result.push(trigger);
            for (let o = -2; o <= 2; o++) covered.add(candidateTime + o);
        }
    }

    return result;
}

/* ===================================================================
   时间解析（增强版）
   返回 null 或秒数（number）
   =================================================================== */

/**
 * 中文数字转为阿拉伯数字（如 "两"→2、"四十七"→47、"四百三十八"→438）
 * 同时将 "X分Y" 格式补全为 "X分Y秒"
 */
function normalizeChineseNumerals(text) {
    const map = { '零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000 };
    const cnChars = new Set('零一两二三四五六七八九十百千');
    let result = '';
    let i = 0;
    while (i < text.length) {
        if (cnChars.has(text[i])) {
            let start = i;
            while (i < text.length && cnChars.has(text[i])) i++;
            const cnNumStr = text.substring(start, i);
            const arabic = chineseNumberToArabic(cnNumStr);
            result += arabic !== null ? arabic : cnNumStr;
        } else {
            result += text[i];
            i++;
        }
    }
    // 补全 "X分Y" 为 "X分Y秒"（如 "2分47"→"2分47秒"）
    result = result.replace(/(\d+)\s*分\s*(\d+)(?!\s*秒)/g, '$1分$2秒');
    return result;
}

/** 中文数字序列 → 阿拉伯数字，如 "四百三十八" → 438 */
function chineseNumberToArabic(cn) {
    const val = { '零':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000 };
    // 特殊单字
    if (cn.length === 1 && cn !== '零') {
        const v = val[cn];
        return v !== undefined && v < 10 ? v : null;
    }
    let total = 0, cur = 0;
    for (const ch of cn) {
        const v = val[ch];
        if (v === undefined) return null;
        if (v >= 10) {
            if (cur === 0) cur = 1;
            total += cur * v;
            cur = 0;
        } else {
            cur = v;
        }
    }
    total += cur;
    return total > 0 ? total : null;
}

function parseTimeSimple(text) {
    // 0. 中文数字转阿拉伯（如 "两分四十七"→"2分47秒"、"四百三十八工程"→"438工程"）
    text = normalizeChineseNumerals(text);

    // 1. 标准冒号格式 3:45 / 03:45 / 1:23:45 / 3：45（中文冒号）
    const colonMatch = text.match(/(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?(?![\.\d])/);
    if (colonMatch) {
        if (colonMatch[3] !== undefined) {
            const h = parseInt(colonMatch[1]), m = parseInt(colonMatch[2]), s = parseInt(colonMatch[3]);
            if (h >= 0 && h < 24 && m < 60 && s < 60) return h * 3600 + m * 60 + s;
        } else {
            let m = parseInt(colonMatch[1]), s = parseInt(colonMatch[2]);
            if (s >= 60) { m += Math.floor(s / 60); s %= 60; }
            if (m >= 0 && m < 60 && s < 60) return m * 60 + s;
        }
    }

    // 2. 全角冒号 3∶21
    const fullColonMatch = text.match(/(\d{1,2})∶(\d{1,2})(?::|∶(\d{1,2}))?/);
    if (fullColonMatch) {
        if (fullColonMatch[3] !== undefined) {
            const h = parseInt(fullColonMatch[1]), m = parseInt(fullColonMatch[2]), s = parseInt(fullColonMatch[3]);
            if (h >= 0 && h < 24 && m < 60 && s < 60) return h * 3600 + m * 60 + s;
        } else {
            let m = parseInt(fullColonMatch[1]), s = parseInt(fullColonMatch[2]);
            if (s >= 60) { m += Math.floor(s / 60); s %= 60; }
            if (m >= 0 && m < 60 && s < 60) return m * 60 + s;
        }
    }

    // 2b. 句点分隔 5.40 / 1.23.45（社区常用写法，与冒号同义）
    //    ⚠ 秒位/分钟位必须 ≥2 位数，避免将小数（如 1.5立方）误判为时间
    const dotMatch = text.match(/(\d{1,2})\.(\d{2})(?:\.(\d{2}))?(?![\d:])/);
    if (dotMatch) {
        // ⚠ 含中文标点的句点文本（如 "5.17预测未来？"）不视为时间编码
        if (/[，。！？、：；""（）《》「」]/.test(text)) return null;
        // ⚠ "倍"/"倍速"紧跟其后 → 是播放速度（如 "1.25倍速"），不是时间编码
        const afterMatch = text.substring(dotMatch.index + dotMatch[0].length, dotMatch.index + dotMatch[0].length + 4);
        if (/倍/.test(afterMatch)) return null;
        if (dotMatch[3] !== undefined) {
            const h = parseInt(dotMatch[1]), m = parseInt(dotMatch[2]), s = parseInt(dotMatch[3]);
            if (h >= 0 && h < 24 && m < 60 && s < 60) return h * 3600 + m * 60 + s;
        } else {
            let m = parseInt(dotMatch[1]), s = parseInt(dotMatch[2]);
            if (s >= 60) return null; // 秒位 ≥60 是小数（如 0.99），不是时间
            if (m >= 0 && m < 60 && s < 60) return m * 60 + s;
        }
    }

    // 3. 中文格式：3分45秒 / 三分四十五秒 / 3份18秒（"份"是"分"的常见输入法错别字）
    const chineseMatch = text.match(/(\d{1,2})\s*[分份]\s*(\d{1,2})\s*秒/);
    if (chineseMatch) {
        const m = parseInt(chineseMatch[1]), s = parseInt(chineseMatch[2]);
        if (m < 60 && s < 60) return m * 60 + s;
    }

    // 3b. 虚假日期格式：11月49日 → 11:49 / 4月20日 → 4:20
    //     仅当该日期不存在时解析为时间（如 11月49日），真实日期不走此规则
    const fakeDateMatch = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (fakeDateMatch) {
        const m = parseInt(fakeDateMatch[1]), d = parseInt(fakeDateMatch[2]);
        // 真实日期不放行
        if (!isValidMonthDay(m, d)) {
            let minutes = m, seconds = d;
            if (seconds >= 60) { minutes += Math.floor(seconds / 60); seconds %= 60; }
            if (minutes >= 0 && minutes < 60 && seconds < 60) {
                const totalSec = minutes * 60 + seconds;
                if (totalSec >= CONFIG.MIN_JUMP_TIME && totalSec <= CONFIG.MAX_JUMP_TIME) {
                    return totalSec;
                }
            }
        }
    }

    // 4. 纯秒格式已禁用——"X秒"在弹幕中几乎都是时长描述（"愣了30秒"），不是视频时间位置。
    //    跳转目标使用冒号/纯数字/编码后缀等格式即可覆盖所有真实场景。
    //
    // const chineseOnlySec = text.match(/(\d{1,3})\s*秒/);
    // if (chineseOnlySec) {
    //     const s = parseInt(chineseOnlySec[1]);
    //     if (s >= 60) return null;
    //     if (s >= CONFIG.MIN_JUMP_TIME && s <= CONFIG.MAX_JUMP_TIME) return s;
    // }

    // 5. 编码格式：438工程/1259计划/500号/1259侠 → 4:38 / 12:59 / 5:00 / 12:59
    //    ⚠ 仅匹配已知时间编码后缀（避免 "250的"/"555甲"/"486昴" 等误触发）
    const engMatch = text.match(/(\d{3,4})(?=[\s]*(?:工程|计划|点位|坐标|公路|道路|号|路|线|侠|巷|国道|魔道|高地|高速))/);
    if (engMatch) {
        let num = parseInt(engMatch[1]);
        let m = Math.floor(num / 100), s = num % 100;
        if (s >= 60) return null;
        if (m >= 0 && m < 60 && s < 60) return m * 60 + s;
    }

    // 6. 纯数字（3-4位）：345 → 3:45 / 320 → 3:20
    //    【严格模式】必须有时间上下文才解析，避免 "500马力" / "300块钱" 误触发
    //    但短文本（≤10字）含3-4位数字且无非时间语境，靠下游聚类验证把关
    //    字母开头后接数字（如 R144、A320）不是时间编码
    if (/^[A-Za-z]+\s*\d{3,4}/.test(text)) return null;
    const pureNumMatch = text.match(/(?<!\d)(\d{3,4})(?!\d)/);
    if (pureNumMatch) {
        let num = parseInt(pureNumMatch[1]);
        // 排除年份
        if (num >= 1900 && num <= 2100) return null;
        // 短文本（≤10字）含3-4位数字→需要时间上下文或跳过关键词
        // 例外：纯数字无其他字符的弹幕（如"153"）大概率是时间编码，放行交聚类验证
        // "真有人买310嗷"(10字) 无时间上下文→不是时间编码
        // "Ow也132了"(含中文) 无跳过关键词→不是跳转指令
        if (text.length <= 10) {
            if (!hasTimeContext(text) && !hasSkipKeyword(text)) return null;
            if (hasNonTimeContext(text)) return null;
            // "3分200没了"：分在数字前是时长描述，不是时间编码
            if (/^[^，。！？]*[分秒]/.test(text)) {
                const numIdx = text.indexOf(pureNumMatch[1]);
                const hasTimeUnitBefore = numIdx > 0 && /[分秒]/.test(text.substring(0, numIdx));
                if (hasTimeUnitBefore) return null;
            }
        } else {
            // 长文本必须有时间上下文
            if (!hasTimeContext(text)) return null;
            // 长文本中，3-4位数字必须邻近时间上下文才有意义
            // "原价1000...砍到八千"中1000在远处，"砍到"不在1000旁
            if (text.length > 12) {
                const numStart = text.indexOf(pureNumMatch[1]);
                const numEnd = numStart + pureNumMatch[1].length;
                const nearby = text.substring(Math.max(0, numStart - 8), Math.min(text.length, numEnd + 8));
                if (!hasTimeContext(nearby)) return null;
            }
            if (hasNonTimeContext(text) && !hasSkipKeyword(text)) return null;
        }
        let m = Math.floor(num / 100), s = num % 100;
        if (s >= 60) return null; // 秒数不可能 ≥60（"361"→s=61→不是时间编码）
        // 数字后紧跟"分"或"秒"（如 "500分"、"300秒"）是分数/时长，不是时间编码
        const numEndPos = pureNumMatch.index + pureNumMatch[1].length;
        const afterChar = text[numEndPos];
        if (afterChar === '分' || afterChar === '秒') return null;
        if (m < 60 && m * 60 + s >= CONFIG.MIN_JUMP_TIME) {
            return m * 60 + s;
        }
    }

    return null;
}

/* ===================================================================
   相近时间聚类验证
   在 ±CLUSTER_WINDOW 秒内搜索是否有其他弹幕指向相近时间
   =================================================================== */
function clusterSimilarTimes(candidates, windowSec = CONFIG.CLUSTER_WINDOW) {
    // candidates: [{ danmakuTime, targetTime, content, hasKeyword }]
    if (candidates.length === 0) return [];

    const clusters = []; // [{ targetTime, members: [] }]
    const used = new Set();

    for (let i = 0; i < candidates.length; i++) {
        if (used.has(i)) continue;
        const cur = candidates[i];
        const cluster = { targetTime: cur.targetTime, members: [cur] };
        used.add(i);

        for (let j = i + 1; j < candidates.length; j++) {
            if (used.has(j)) continue;
            const other = candidates[j];
            if (Math.abs(other.targetTime - cur.targetTime) <= windowSec) {
                cluster.members.push(other);
                used.add(j);
            }
        }

        clusters.push(cluster);
    }

    return clusters;
}

/* ===================================================================
   去重：每个聚类取提醒最密集位置（弹幕时间中位数）作为触发点
   =================================================================== */
function deduplicateClusters(clusters, windowSec = CONFIG.DEDUP_WINDOW) {
    if (clusters.length === 0) return [];

    // 先对聚类按平均目标时间排序
    clusters.sort((a, b) => a.targetTime - b.targetTime);

    const merged = [];
    let current = { ...clusters[0] };

    for (let i = 1; i < clusters.length; i++) {
        const next = clusters[i];
        if (Math.abs(next.targetTime - current.targetTime) <= windowSec) {
            // 合并：取更大的聚类，目标时间取加权平均
            const allMembers = [...current.members, ...next.members];
            const avgTime = Math.round(
                allMembers.reduce((sum, m) => sum + m.targetTime, 0) / allMembers.length
            );
            current = { targetTime: avgTime, members: allMembers, sourceLabel: current.sourceLabel || next.sourceLabel };
        } else {
            merged.push(current);
            current = { ...next };
        }
    }
    merged.push(current);

    // 每个聚类取弹幕出现时间最密集的位置（中位数附近）作为触发点
    return merged.map(cluster => {
        const times = cluster.members.map(m => m.danmakuTime).sort((a, b) => a - b);
        const centerTime = times[Math.floor(times.length / 2)];
        const representative = cluster.members.reduce((best, m) =>
            Math.abs(m.danmakuTime - centerTime) < Math.abs(best.danmakuTime - centerTime) ? m : best
        );
        return {
            targetTime: cluster.targetTime,
            triggerDanmakuTime: representative.danmakuTime,
            matchedContent: representative.content,
            memberCount: cluster.members.length,
            allContents: cluster.members.map(m => m.content),
            sourceLabel: cluster.sourceLabel || '',  // 透传来源标记
        };
    });
}

/* ===================================================================
   频率统计（作为补充验证）
   =================================================================== */
function findBestTimeByFrequency(candidates, timeWindow = CONFIG.FREQUENCY_WINDOW, minCount = CONFIG.FREQUENCY_MIN_COUNT) {
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.danmakuTime - b.danmakuTime);

    let bestTarget = null, bestCount = 0;

    for (let i = 0; i < candidates.length; i++) {
        const cur = candidates[i];
        let count = 1;
        for (let j = i - 1; j >= 0 && candidates[j].danmakuTime >= cur.danmakuTime - timeWindow; j--) {
            if (candidates[j].targetTime === cur.targetTime) count++;
        }
        for (let j = i + 1; j < candidates.length && candidates[j].danmakuTime <= cur.danmakuTime + timeWindow; j++) {
            if (candidates[j].targetTime === cur.targetTime) count++;
        }
        if (count > bestCount) {
            bestCount = count;
            bestTarget = cur;
        }
    }

    if (bestCount >= minCount && bestTarget) {
        return {
            targetTime: bestTarget.targetTime,
            triggerDanmakuTime: bestTarget.danmakuTime,
            matchedContent: bestTarget.content,
            count: bestCount,
        };
    }
    return null;
}

/* ===================================================================
   冷却管理器
   =================================================================== */
class CooldownManager {
    constructor() {
        this.cooldowns = []; // [{ triggerTime, targetTime, cooldownUntil, lastVideoTime }]
    }

    /**
     * 检查是否在冷却期内
     * @param {number} triggerTime - 弹幕触发时间（秒）
     * @param {number} currentVideoTime - 当前视频时间（秒）
     * @returns {boolean} true = 冷却中，不应触发
     */
    isInCooldown(triggerTime, currentVideoTime) {
        this._cleanExpired(currentVideoTime);

        for (const cd of this.cooldowns) {
            // 检查触发时间是否在某个冷却区间内
            if (triggerTime >= cd.cooldownStart && triggerTime <= cd.cooldownEnd) {
                // 检查用户是否回退了（seek back）
                if (this._hasSeekedBack(cd, currentVideoTime)) {
                    // 用户回退 → 清除该冷却 → 允许重新触发
                    this._removeCooldown(cd);
                    return false;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * 记录一次跳转，进入冷却期
     * @param {number} triggerTime - 弹幕出现时间
     * @param {number} targetTime - 跳转目标时间
     * @param {number} currentVideoTime - 当前视频时间
     */
    recordJump(triggerTime, targetTime, currentVideoTime) {
        this.cooldowns.push({
            cooldownStart: triggerTime - CONFIG.COOLDOWN_BEFORE,
            cooldownEnd: targetTime + CONFIG.COOLDOWN_AFTER,
            triggerTime: triggerTime,
            targetTime: targetTime,
            lastVideoTime: targetTime, // 跳转后的时间
        });
    }

    _hasSeekedBack(cd, currentVideoTime) {
        // 如果当前时间比冷却区间结束时间早超过阈值 → 用户回退了
        return currentVideoTime < cd.cooldownStart - CONFIG.SEEK_BACK_THRESHOLD;
    }

    _cleanExpired(currentVideoTime) {
        // 清理已经完全过去的冷却区间（当前时间已远超冷却结束）
        this.cooldowns = this.cooldowns.filter(cd => {
            const expired = currentVideoTime > cd.cooldownEnd + 60; // 过期1分钟后清理
            return !expired;
        });
    }

    _removeCooldown(cd) {
        const idx = this.cooldowns.indexOf(cd);
        if (idx !== -1) this.cooldowns.splice(idx, 1);
    }

    reset() {
        this.cooldowns = [];
    }
}

/* ===================================================================
   B站API弹幕获取
   =================================================================== */
class BiliApiFetcher {
    constructor() {
        this.baseURL = 'https://api.bilibili.com';
        this.danmakuURL = 'https://comment.bilibili.com';
    }

    extractBvid() {
        // 优先取页面全局状态，避免 AntiBV 等脚本把地址栏 BV 改成 av 后无法提取
        try {
            const st = window.__INITIAL_STATE__;
            if (st && st.videoData && typeof st.videoData.bvid === 'string' &&
                /^BV[a-zA-Z0-9]+$/.test(st.videoData.bvid)) {
                return st.videoData.bvid;
            }
        } catch (e) { /* ignore */ }
        const url = window.location.href;
        const match = url.match(/\/video\/(BV[a-zA-Z0-9]+)/);
        if (match) return match[1];
        // AntiBV 会把 bvid 存进 history.state（URL 显示为 av）
        try {
            const hs = history.state;
            if (hs && typeof hs.bvid === 'string' && /^BV[a-zA-Z0-9]+$/.test(hs.bvid)) {
                return hs.bvid;
            }
        } catch (e) { /* ignore */ }
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('bvid');
    }

    /** 提取 av 号（AntiBV 将地址栏显示为 av 时使用） */
    extractAid() {
        try {
            const st = window.__INITIAL_STATE__;
            const aid = Number(st && st.videoData && st.videoData.aid);
            if (aid > 0) return aid;
        } catch (e) { /* ignore */ }
        const match = window.location.pathname.match(/\/(av\d+)(?:\/|$)/i);
        if (match) return parseInt(match[1].slice(2), 10);
        try {
            const hs = history.state;
            const aid2 = Number(hs && hs.aid);
            if (aid2 > 0) return aid2;
        } catch (e) { /* ignore */ }
        return null;
    }

    /** 从页面全局状态直接取当前分P的 cid，完全绕过 BV/AV 提取 */
    extractCidFromPage() {
        try {
            const st = window.__INITIAL_STATE__;
            const cid = Number(st && st.videoData && st.videoData.cid);
            if (cid > 0) return cid;
            const playinfo = window.__playinfo__;
            const cid2 = Number(playinfo && playinfo.data && playinfo.data.cid);
            if (cid2 > 0) return cid2;
        } catch (e) { /* ignore */ }
        return null;
    }

    async getCid(bvid, aid) {
        const idParam = bvid ? `bvid=${encodeURIComponent(bvid)}` : `aid=${aid}`;
        const url = `${this.baseURL}/x/player/pagelist?${idParam}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (resp) {
                    if (resp.status !== 200) {
                        reject(new Error(`HTTP ${resp.status}`));
                        return;
                    }
                    try {
                        const data = JSON.parse(resp.responseText);
                        if (data.code === 0 && data.data && data.data.length > 0) {
                            resolve({ cid: data.data[0].cid, title: data.data[0].part || '视频' });
                        } else {
                            reject(new Error(`API错误: ${data.message || 'code ' + data.code}`));
                        }
                    } catch (e) {
                        reject(new Error('解析API响应失败'));
                    }
                },
                onerror: () => reject(new Error('网络请求失败')),
            });
        });
    }

    async getDanmakuXml(cid) {
        const url = `${this.danmakuURL}/${cid}.xml`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (resp) {
                    if (resp.status === 200) resolve(resp.responseText);
                    else reject(new Error(`HTTP ${resp.status}`));
                },
                onerror: () => reject(new Error('弹幕请求失败')),
            });
        });
    }

    /** 请求分段弹幕 seg.so（protobuf 二进制） */
    async getDanmakuSeg(cid, segmentIndex) {
        const url = `https://api.bilibili.com/x/v2/dm/list/seg.so?type=1&oid=${cid}&segment_index=${segmentIndex}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                onload: function (resp) {
                    if (resp.response instanceof ArrayBuffer) resolve(resp.response);
                    else reject(new Error('seg.so 响应非二进制'));
                },
                onerror: () => resolve(null), // 分段不存在时返回 null
            });
        });
    }

    parseDanmakuXml(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        if (xmlDoc.querySelector('parsererror')) throw new Error('XML解析失败');
        const dElements = xmlDoc.getElementsByTagName('d');
        const danmakus = [];
        for (let i = 0; i < dElements.length; i++) {
            const d = dElements[i];
            const pAttr = d.getAttribute('p');
            if (!pAttr) continue;
            const parts = pAttr.split(',');
            if (parts.length < 1) continue;
            const danmakuTime = parseFloat(parts[0]);
            if (isNaN(danmakuTime)) continue;
            const content = d.textContent ? d.textContent.trim() : '';
            if (!content) continue;
            danmakus.push({ danmakuTime, content });
        }
        danmakus.sort((a, b) => a.danmakuTime - b.danmakuTime);
        return danmakus;
    }

    /** 解析 seg.so protobuf → [{danmakuTime, content}]，字段顺序无关 */
    parseSegProtobuf(buffer) {
        if (!buffer || buffer.byteLength < 4) return [];
        const bytes = new Uint8Array(buffer);
        const decoder = new TextDecoder('utf-8');
        let offset = 0;
        const danmakus = [];

        function readVarint() {
            let result = 0, shift = 0;
            while (offset < bytes.length) {
                const b = bytes[offset++];
                result |= (b & 0x7f) << shift;
                shift += 7;
                if (!(b & 0x80)) return result;
            }
            return result;
        }

        function skipField(wireType) {
            if (wireType === 0) readVarint();
            else if (wireType === 2) { const len = readVarint(); offset += len; }
            else { offset += 4; }
        }

        function readString(len) {
            const strBytes = bytes.slice(offset, offset + len);
            offset += len;
            return decoder.decode(strBytes);
        }

        while (offset < bytes.length) {
            if (offset >= bytes.length) break;
            const tagVarint = readVarint();
            const fieldNumber = tagVarint >> 3;
            const wireType = tagVarint & 7;
            // 最外层：field 1 = repeated DanmakuElem (wire_type 2)
            if (fieldNumber === 1 && wireType === 2) {
                const outerLen = readVarint();
                const outerEnd = offset + outerLen;
                // 收集字段到临时 map，解析完再提取（防字段乱序）
                const fields = {};
                while (offset < outerEnd) {
                    if (offset >= outerEnd) break;
                    const innerTag = readVarint();
                    const innerFn = innerTag >> 3;
                    const innerWt = innerTag & 7;
                    if (innerWt === 0) {
                        const val = readVarint();
                        fields[innerFn] = val;
                    } else if (innerWt === 2) {
                        const strLen = readVarint();
                        fields[innerFn] = readString(strLen);
                    } else {
                        skipField(innerWt);
                    }
                }
                if (fields[2] > 0 && fields[7]) {
                    danmakus.push({
                        danmakuTime: fields[2] / 1000,
                        content: fields[7].trim()
                    });
                }
            } else {
                skipField(wireType);
            }
        }
        return danmakus;
    }

    /** 获取完整弹幕（XML + 所有分段）去重合并 */
    async fetchAllDanmakus() {
        let cid = this.extractCidFromPage();
        if (!cid) {
            const bvid = this.extractBvid();
            const aid = this.extractAid();
            if (!bvid && !aid) throw new Error('无法获取BV号/cid');
            const videoInfo = await this.getCid(bvid, aid);
            cid = videoInfo.cid;
        }

        // 同时请求 XML 和最多 6 个分段 (segment 1~6)
        const promises = [this.getDanmakuXml(cid)];
        for (let seg = 1; seg <= 6; seg++) {
            promises.push(
                this.getDanmakuSeg(cid, seg).then(buf => this.parseSegProtobuf(buf)).catch(() => [])
            );
        }

        const results = await Promise.all(promises);
        const xmlDanmakus = this.parseDanmakuXml(results[0]);
        let allDanmakus = [...xmlDanmakus];

        // 合并分段弹幕，去重（按 time+content 四舍五入去重）
        const seen = new Set(allDanmakus.map(d => `${Math.round(d.danmakuTime * 10)}_${d.content}`));
        for (let i = 1; i < results.length; i++) {
            for (const dm of results[i]) {
                const key = `${Math.round(dm.danmakuTime * 10)}_${dm.content}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    allDanmakus.push(dm);
                }
            }
        }

        allDanmakus.sort((a, b) => a.danmakuTime - b.danmakuTime);
        return allDanmakus;
    }
}

/* ===================================================================
   工具函数
   =================================================================== */
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    if (seconds >= 3600) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 格式化跳过时长为中文显示（如 "50秒"、"1分30秒"） */
function formatDuration(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0秒';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m === 0) return `${s}秒`;
    if (s === 0) return `${m}分`;
    return `${m}分${s}秒`;
}

/** 来源标记 → 直观显示文字 */
function labelToDisplay(label) {
    const map = {
        '聚类验证': '👥 多人指路',
        '前后呼应': '👥 多人指路',
        '感恩互证': '🙏 感谢确认',
        '词级互证': '🙏 感谢确认',
        '频率统计': '📊 多次出现',
        '关键词':   '🔑 有关键词',
        '页面广告': '📢 页面广告',
    };
    return map[label] || label;
}

function getAdaptiveFontSize(video) {
    if (!video) return '24px';
    const rect = video.getBoundingClientRect();
    const fontSize = Math.min(48, Math.max(20, Math.floor(rect.width / 40)));
    return `${fontSize}px`;
}

function getVideoContainer() {
    return document.querySelector('.bpx-player-video-area') || document.body;
}

/** 优先取播放器内的主 video，避免误抓到页面其他隐藏 video */
function getPrimaryVideo() {
    const selectors = ['.bpx-player-container video', '.bpx-player-video-wrap video', 'video'];
    for (const selector of selectors) {
        const v = document.querySelector(selector);
        if (v) return v;
    }
    return null;
}

/**
 * 解析简介中的时间区间如 "3:00-5:30" / "00:00-02:00 广告"
 * @param {string} text
 * @returns {null|{start:number,end:number}}
 */
function parseAdSegmentTime(text) {
    // 匹配 3:00-5:30 / 00:00-02:00 / 1:23-4:56 等
    const rangeMatch = text.match(/(\d{1,2}):(\d{2})\s*[-～至到]\s*(\d{1,2}):(\d{2})/);
    if (!rangeMatch) return null;
    let sm = parseInt(rangeMatch[1]), ss = parseInt(rangeMatch[2]);
    let em = parseInt(rangeMatch[3]), es = parseInt(rangeMatch[4]);
    if (ss >= 60 || es >= 60) return null;
    const start = sm * 60 + ss;
    const end = em * 60 + es;
    if (end <= start || start < 0) return null;
    return { start, end };
}

/**
 * 扫描页面 DOM 发现广告段落（简介/章节中的广告时间区间）
 * 检查视频简介和进度条章节标记
 */
function scanPageForAdSegments() {
    if (!currentVideo || adSegmentsScanned) return;
    const newSegments = [];

    // ① 扫描视频简介容器
    const descEls = document.querySelectorAll(
        '.video-desc, #v_desc, .desc-info, .basic-desc-info, ' +
        '.video-info-container .desc, .video-data .desc, ' +
        '[class*="desc"]'
    );
    for (const el of descEls) {
        const text = el.textContent || '';
        if (!text || text.length > 5000) continue;
        // 检查是否包含广告关键词
        const hasAdKeyword = AD_REPORT_KEYWORDS.some(kw => text.includes(kw));
        if (!hasAdKeyword) continue;
        // 逐行搜索时间区间
        for (const line of text.split('\n')) {
            const range = parseAdSegmentTime(line);
            if (!range) continue;
            const matchedKw = AD_REPORT_KEYWORDS.find(kw => line.includes(kw));
            newSegments.push({
                startTime: range.start,
                endTime: range.end,
                text: (matchedKw || '广告') + (line.substring(0, 30)),
            });
        }
    }

    // ② 扫描进度条上的章节标记
    //    B站章节DOM常见形式：.chapter-point / .cue-point / SVG title / data属性
    const chapterEls = document.querySelectorAll(
        '.video-point, .chapter-point, .cue-point, ' +
        '.bpx-player-chapter-point, .bpx-player-auxiliary-point, ' +
        '[class*="chapter-point"], [class*="cue-point"], ' +
        '.bpx-player-video-progress [class*="point"], ' +
        '.bpx-player-video-progress svg title, ' +
        '[data-title], [data-text]'
    );
    for (const el of chapterEls) {
        const title = el.getAttribute('title') || el.getAttribute('data-title') || el.getAttribute('data-text') || el.textContent || '';
        const hasAdKeyword = AD_REPORT_KEYWORDS.some(kw => title.includes(kw));
        if (!hasAdKeyword) continue;
        // 尝试从 data属性 / style百分比 / href 获取时间
        let start = 0, end = 0;
        const dataStart = parseFloat(el.getAttribute('data-start') || el.getAttribute('data-time'));
        const dataEnd = parseFloat(el.getAttribute('data-end'));
        if (!isNaN(dataStart) && currentVideo && currentVideo.duration) {
            start = dataStart;
            end = !isNaN(dataEnd) ? dataEnd : start + 10;
        } else {
            const left = parseFloat(el.style.left) || 0;
            const width = parseFloat(el.style.width) || 1;
            if (left > 0 && currentVideo && currentVideo.duration) {
                start = (left / 100) * currentVideo.duration;
                end = ((left + width) / 100) * currentVideo.duration;
            }
        }
        if (end > start && start >= 0 && currentVideo) {
            const matchedKw = AD_REPORT_KEYWORDS.find(kw => title.includes(kw)) || '广告';
            newSegments.push({ startTime: start, endTime: end, text: matchedKw + '章节' });
        }
    }

    // 去重合并
    for (const seg of newSegments) {
        const key = `${Math.round(seg.startTime)}-${Math.round(seg.endTime)}`;
        const dup = adSegments.some(s =>
            Math.abs(s.startTime - seg.startTime) <= 2 &&
            Math.abs(s.endTime - seg.endTime) <= 2
        );
        if (!dup) {
            adSegments.push(seg);
        }
    }

    adSegmentsScanned = true;
    if (newSegments.length > 0) {
        adSegments.sort((a, b) => a.startTime - b.startTime);
        if (isExpanded) updateLogUI();
    }
}

/** 检测当前时间是否在某个广告段内，是则跳过 */
function checkAdSegments() {
    if (!currentVideo || !isEnabled || videoJumpCompleted) return;
    const now = currentVideo.currentTime;
    for (const seg of adSegments) {
        if (now >= seg.startTime && now < seg.endTime) {
            const key = `${Math.round(seg.startTime)}-${Math.round(seg.endTime)}`;
            if (skippedAdRanges.has(key)) continue;
            skippedAdRanges.add(key);
            const jumpTo = seg.endTime + CONFIG.AD_SKIP_OFFSET;
            console.log(`[跳转] ✅ 广告段 ${formatTime(seg.startTime)} → ${formatTime(seg.endTime)}`);
            currentVideo.currentTime = jumpTo;
            videoJumpCompleted = true;
            pendingTriggers = [];
            currentTarget = null;
            decisionTimeLeft = 0;
            decisionStartTime = 0;
            decisionTotalWait = 0;
            if (activeToast) { activeToast.remove(); activeToast = null; }
            updateIconBadge();

            // 记录日志
            recentTriggers.unshift({
                targetTime: seg.endTime,
                triggerTime: seg.startTime,
                content: `🚀 页面广告段: ${seg.text.substring(0, 20)}`,
                gratitudeCount: 0,
                timeConfirmedCount: 0,
                timeRefCount: 0,
                sourceLabel: '页面广告',
                timestamp: Date.now(),
                isAdSegment: true,
            });
            if (recentTriggers.length > 10) recentTriggers.pop();
            if (isExpanded) updateLogUI();
            return; // 每次只跳一个
        }
    }
}

/* ===================================================================
   缓存管理
   =================================================================== */
function saveCachedTriggers(bvid, triggers) {
    if (!bvid) return;
    const cache = {
        version: 29,
        timestamp: Date.now(),
        triggers: triggers,
        adSegments: adSegments.length > 0 ? adSegments : undefined,
    };
    localStorage.setItem(`dm_skip_cache_${bvid}`, JSON.stringify(cache));
}

function loadCachedTriggers(bvid) {
    if (!bvid) return null;
    const raw = localStorage.getItem(`dm_skip_cache_${bvid}`);
    if (!raw) return null;
    try {
        const cache = JSON.parse(raw);
        if (cache.version >= 29 && cache.triggers && Array.isArray(cache.triggers)) {
            if (Date.now() - cache.timestamp < CONFIG.CACHE_TTL) {
                // 恢复缓存的广告段
                if (cache.adSegments && Array.isArray(cache.adSegments)) {
                    adSegments = cache.adSegments;
                    adSegmentsScanned = true;
                }
                return cache.triggers;
            }
        }
    } catch (e) { /* ignore corrupt cache */ }
    return null;
}

function clearCachedTriggers(bvid) {
    if (bvid) localStorage.removeItem(`dm_skip_cache_${bvid}`);
    adSegments = [];
    skippedAdRanges = new Set();
    adSegmentsScanned = false;
    if (previewToast) { previewToast.remove(); previewToast = null; }
}

/** 清理过期的 localStorage 缓存条目，限制总条数 */
function cleanExpiredCache() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('dm_skip_cache_')) keys.push(k);
    }
    // 按过期优先排序（过期在前），然后按 bvid 字母序稳定排序
    const now = Date.now();
    keys.sort((a, b) => {
        try {
            const ca = JSON.parse(localStorage.getItem(a));
            const cb = JSON.parse(localStorage.getItem(b));
            const expiredA = !ca || !ca.timestamp || now - ca.timestamp >= CONFIG.CACHE_TTL;
            const expiredB = !cb || !cb.timestamp || now - cb.timestamp >= CONFIG.CACHE_TTL;
            if (expiredA !== expiredB) return expiredA ? -1 : 1;
            return a.localeCompare(b);
        } catch (e) { return a.localeCompare(b); }
    });
    // 删除过期条目 + 超出限制的旧条目
    let removed = 0;
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        let shouldRemove = false;
        try {
            const c = JSON.parse(localStorage.getItem(k));
            if (!c || !c.timestamp || now - c.timestamp >= CONFIG.CACHE_TTL) shouldRemove = true;
        } catch (e) { shouldRemove = true; }
        const overcrowded = keys.length - removed > CONFIG.CACHE_MAX_ENTRIES;
        if (shouldRemove || overcrowded) {
            localStorage.removeItem(k);
            removed++;
        }
    }
}

/* ===================================================================
   全局状态
   =================================================================== */
/** 用户自定义倒计时时长只接受 500ms~5000ms，脏数据一律回退默认值 */
function normalizeDecisionWindow(raw) {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return CONFIG.decisionWindow;
    return Math.min(5000, Math.max(500, n));
}

let isEnabled = localStorage.getItem('dm_skip_enabled') !== 'false';
let toastPos = localStorage.getItem('dm_skip_toast_pos') || 'center';
let toastOpacity = parseFloat(localStorage.getItem('dm_skip_toast_opacity') || '0.5');
let iconSide = localStorage.getItem('dm_skip_icon_side') || 'right';
let iconTop = localStorage.getItem('dm_skip_icon_top') || '50%';

/**
 * 面板固定使用 top + right 定位。
 * 水平方向锁死为 right:0，只保留并清洗历史 top，防止旧坐标把面板顶到左侧或屏幕外。
 */
function loadPanelSavedPos() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem('dm_skip_panel_pos'));
    } catch (e) {
        saved = null;
    }
    if (!saved || typeof saved !== 'object') saved = {};

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1080;
    let top = parseFloat(saved.top);

    if (isNaN(top) || top < 0 || top > Math.max(0, viewportHeight - 120)) top = 100;

    return { top: top + 'px', right: '0' };
}

let panelSavedPos = loadPanelSavedPos();

let currentVideo = null;           // <video> 元素
let pendingTriggers = [];          // 待触发跳转任务队列
let videoJumpCompleted = false;   // 每个视频最多只跳一次（弹幕 + 页面广告段合计）
let currentTarget = null;          // 正在倒计时的目标
let decisionTimeLeft = 0;         // 倒计时剩余（ms）
let decisionStartTime = 0;       // 倒计时开始时的 Date.now() 时间戳（精确计时用）
let decisionTotalWait = 0;       // 本次倒计时的总时长（ms），创建时固定，防止播放跨过触发点后突变
let activeToast = null;           // Toast DOM 元素
let cooldownManager = new CooldownManager();
let isApiLoaded = false;
let apiDanmakus = [];
let recentTriggers = [];          // 最近触发的记录（用于日志）
let analysisDone = false;        // 弹幕分析是否已完成
let fetchGeneration = 0;         // 代际计数器，防止SPA切换时竞态条件（旧请求数据污染新视频）

// 页面广告段检测
let adSegments = [];             // [{ startTime, endTime, text }] 从简介/章节发现的广告段
let skippedAdRanges = new Set(); // 已跳过的广告段 key: "start-end"
let adSegmentsScanned = false;   // 是否已完成首次扫描
let previewToast = null;         // 透明度预览弹窗
let userDecisionWindow = normalizeDecisionWindow(localStorage.getItem('dm_skip_decision_window') || String(CONFIG.decisionWindow)); // 用户自定义倒计时时长（ms）
try {
    if (String(userDecisionWindow) !== localStorage.getItem('dm_skip_decision_window')) {
        localStorage.setItem('dm_skip_decision_window', String(userDecisionWindow));
    }
} catch (e) { /* ignore */ }
let dismissedTriggers = new Set(); // 用户忽略过的跳转 key: "targetTime_triggerTime"，刷新后仍记忆
let blockerWarned = false;       // 同一视频内只提示一次“有待触发但未倒计时”的原因
let lastBlockerKey = '';         // 面板阻塞原因去重，避免每 200ms 重绘 DOM
// 从 localStorage 加载已忽略的跳转记录（上限200条）
try {
    const saved = localStorage.getItem('dm_skip_dismissed');
    if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
            // 只加载前200条，防止过期数据堆积撑爆 localStorage
            const limited = arr.slice(-200);
            limited.forEach(k => dismissedTriggers.add(k));
            if (arr.length > 200) {
                // 同步回写清理后的列表
                localStorage.setItem('dm_skip_dismissed', JSON.stringify([...dismissedTriggers]));
            }
        }
    }
} catch (e) { /* ignore */ }

/** 确保 dismissedTriggers 不超过200条（保留最新200条） */
function trimDismissedTriggers() {
    if (dismissedTriggers.size <= 200) return;
    const arr = [...dismissedTriggers];
    const trimmed = arr.slice(-200);
    dismissedTriggers = new Set(trimmed);
    try { localStorage.setItem('dm_skip_dismissed', JSON.stringify(trimmed)); } catch (e) { /* ignore */ }
}

// UI 元素
let floatingIcon = null;
let expandedPanel = null;
let isExpanded = false;
let isHovering = false;
let isDraggingIcon = false;
let hasMoved = false;
let iconBadge = null;            // 浮动按钮上的红点消息提示
let badgeMode = localStorage.getItem('dm_skip_badge_mode') || 'number'; // 红点模式: dot/数字/none
let uiLayerMode = localStorage.getItem('dm_skip_layer_mode') || 'below'; // 相对视频层级: below/above

/* ===================================================================
   层级管理
   =================================================================== */
const UI_Z_INDEX = {
    below: { floating: 10, panel: 2147483647 },
    above: { floating: 2147483640, panel: 2147483647 },
};

function uiZIndex(kind) {
    const layer = uiLayerMode === 'above' ? 'above' : 'below';
    return UI_Z_INDEX[layer][kind];
}

function applyUiLayer() {
    if (floatingIcon) floatingIcon.style.zIndex = uiZIndex('floating');
    if (expandedPanel) expandedPanel.style.zIndex = uiZIndex('panel');
}

/* ===================================================================
   Toast 提示
   =================================================================== */
function createToast(text) {
    const stage = getVideoContainer();
    const toast = document.createElement('div');
    const posMap = {
        'top-left': 'top:20px;left:20px;transform:none;',
        'top-right': 'top:20px;right:20px;transform:none;',
        'bottom-left': 'bottom:20px;left:20px;transform:none;',
        'bottom-right': 'bottom:20px;right:20px;transform:none;',
        'center': 'top:50%;left:50%;transform:translate(-50%,-50%);',
    };
    toast.style.cssText = `position:absolute;${posMap[toastPos] || posMap['center']};background:rgba(0,0,0,${toastOpacity});color:rgba(255,255,255,${toastOpacity});padding:16px 32px;border-radius:12px;z-index:2147483647;font-size:${getAdaptiveFontSize(currentVideo)};font-weight:bold;pointer-events:none;backdrop-filter:blur(8px);white-space:nowrap;text-shadow:0 2px 4px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,${toastOpacity * 0.5});transition:opacity 0.2s;`;
    toast.innerText = text;
    stage.appendChild(toast);
    return toast;
}

function updateToastStyle() {
    if (!activeToast) return;
    const posMap = {
        'top-left': 'top:20px;left:20px;transform:none;',
        'top-right': 'top:20px;right:20px;transform:none;',
        'bottom-left': 'bottom:20px;left:20px;transform:none;',
        'bottom-right': 'bottom:20px;right:20px;transform:none;',
        'center': 'top:50%;left:50%;transform:translate(-50%,-50%);',
    };
    const baseStyle = activeToast.style.cssText
        .replace(/top:[^;]+;|left:[^;]+;|right:[^;]+;|bottom:[^;]+;|transform:[^;]+;/g, '');
    activeToast.style.cssText = baseStyle + (posMap[toastPos] || posMap['center']);
    activeToast.style.backgroundColor = `rgba(0,0,0,${toastOpacity})`;
    activeToast.style.color = `rgba(255,255,255,${toastOpacity})`;
    activeToast.style.fontSize = getAdaptiveFontSize(currentVideo);
}

/* ===================================================================
   核心：弹幕处理流水线
   =================================================================== */
/* 跳转点评分：优先参考弹幕数量，其次感谢/时间互证/时间呼应 */
function scoreTrigger(t) {
    return (t.memberCount || 0) * 100
         + (t.gratitudeCount || 0) * 10
         + (t.timeConfirmedCount || 0) * 2
         + (t.timeRefCount || 0);
}

/** 每视频只保留一个提醒最密集的跳转点 */
function keepBestTrigger(triggers) {
    if (!triggers || triggers.length === 0) return [];
    return [...triggers].sort((a, b) => scoreTrigger(b) - scoreTrigger(a)).slice(0, 1);
}

function processDanmakus(allDanmakus, currentTime) {
    const index = createDanmakuIndex(allDanmakus);

    // Step 1: 过滤日期/生日弹幕
    const nonDateDanmakus = allDanmakus.filter(dm => !index.meta(dm).isDate);

    // Step 2: 解析时间
    const candidates = [];
    for (const dm of nonDateDanmakus) {
        const m = index.meta(dm);
        const targetTime = m.parsed;
        if (targetTime === null) continue;
        // 弹幕出现在开头前5秒 → 屏蔽（通常是互动聊天不是跳转指令）
        if (dm.danmakuTime < 5) continue;
        if (targetTime < CONFIG.MIN_JUMP_TIME || targetTime > CONFIG.MAX_JUMP_TIME) continue;

        // 目标时间超过视频总时长 → 不可能，忽略
        if (currentVideo && currentVideo.duration && !isNaN(currentVideo.duration) &&
            targetTime > currentVideo.duration - 1) continue;

        // 跳转目标超过视频2/3位置 → 不合理（短视频跳太远，剩余内容不够看）
        if (currentVideo && currentVideo.duration && !isNaN(currentVideo.duration) && currentVideo.duration > 0 &&
            targetTime > currentVideo.duration * CONFIG.MAX_TARGET_RATIO) continue;

        // 目标已过 → 不需要跳转。不按弹幕出现时间过滤——用户可能已经 seek 过弹幕发送点但目标未到
        if (targetTime <= Math.max(dm.danmakuTime, currentTime, currentVideo ? currentVideo.currentTime : 0)) continue;

        const hasKeyword = m.hasSkip;

        // 纯数字弹幕（无中文字/跳过关键词/非句点格式）必须有感谢弹幕佐证
        // "111" 纯数字不是跳转指令，但 "111感谢" 附近有感谢即可放行
        // 同时检查原始秒位 ≥60 的不予通过（"666"→s=66→不是有效时间编码）
        const isDotFormat = m.dotFormat;
        const isPureNumeric = !m.hasChinese && !hasKeyword && !isDotFormat;
        if (isPureNumeric) {
            let evidenceMet = false;
            let isHighConfidence = false;
            const pureMatch4 = dm.content.match(/(?<!\d)(\d{4})(?!\d)/);
            if (pureMatch4) {
                const rawNum = parseInt(pureMatch4[1]);
                const rawS4 = rawNum % 100;
                if (rawS4 < 60) isHighConfidence = true; // 4位数字+s<60→高置信度
            }
            // 检查目标附近的感谢弹幕是否出现在弹幕触发时间之后（正确的时序：先有跳转指令，后有感谢）
            // 检查整分钟数字（如 100→1:00, 200→2:00），此类数字常被用于聊天/计数，需要更严格验证
            const isRoundMinute = targetTime % 60 === 0;
            if (isHighConfidence) {
                // 4位数字+s<60（如 "408"→4:08）：需 ≥1 条出现在跳转后的感谢
                const hc = countGratitudeAfterTrigger(dm.danmakuTime, targetTime, allDanmakus, 5, index) >= 1;
                if (hc) evidenceMet = true;
            } else {
                const gAfter = countGratitudeAfterTrigger(dm.danmakuTime, targetTime, allDanmakus, 5, index);
                const rCount = countTimeReferencingDanmaku(targetTime, allDanmakus, 5, index);
                if (isRoundMinute) {
                    // 整分钟数字需要 ≥2 条触发后的感谢 或（≥1 感谢+≥2 时间引用）
                    if (gAfter >= 2 || (gAfter >= 1 && rCount >= 2)) evidenceMet = true;
                } else {
                    // 3位纯数字、句点格式（如 "1.28"）等无中文文本：需 ≥2 感谢 或（≥1 感谢+≥1 时间引用）
                    if (gAfter >= 2 || (gAfter >= 1 && rCount >= 1)) evidenceMet = true;
                }
            }
            if (!evidenceMet) continue;
        }

        // 冒号格式（如 "8:10哈哈"）无跳过关键词 → 可能是时间注释而非跳转指令
        // 需要目标附近的感谢弹幕也引用相关时间（时间互证）
        if (!hasKeyword && m.colonFormat) {
            const mc = countTimeConfirmedGratitude(targetTime, dm.danmakuTime, allDanmakus, 5, index);
            if (mc < 1) continue;
        }

        // 句点格式（如 "7.05"、"2.30玩的"）无跳过关键词 → 需要目标附近有时间引用弹幕确认
        if (!hasKeyword && isDotFormat) {
            if (countTimeReferencingDanmaku(targetTime, allDanmakus, 5, index) < 1) {
                continue;
            }
        }

        // 非时间语境（价格/数量等）且无跳过关键词 → 不是跳转提示
        // 即使有感谢弹幕也需检查——"160块" 不是跳转指令
        if (m.hasNonTimeContext && !hasKeyword) continue;

        // 弹幕过长 → 不可能是跳转提示（跳转弹幕通常很简短）
        if (dm.content.length > CONFIG.MAX_DANMAKU_LENGTH) continue;

        // 跳转距离太小 → 不值得跳（时间噪声）
        if (targetTime - dm.danmakuTime < CONFIG.MIN_JUMP_DURATION) continue;

        // 弹幕与目标时间相隔太远 → 不是跳转提示
        // @0:03 "跳伞17:20" → 17分钟间距，这是时间注释不是跳转指令
        // 即使目标有感谢弹幕也需检查
        if (targetTime - dm.danmakuTime > CONFIG.MAX_GAP_SECONDS) continue;

        candidates.push({
            danmakuTime: dm.danmakuTime,
            targetTime: targetTime,
            content: dm.content,
            hasKeyword: hasKeyword,
        });
    }

    if (candidates.length === 0) return [];

    // Step 3: 相近时间聚类验证（±3s 内有 ≥2 条弹幕确认）
    const clusters = clusterSimilarTimes(candidates, CONFIG.CLUSTER_WINDOW);
    let validClusters = clusters.filter(c => c.members.length >= CONFIG.CLUSTER_MIN_COUNT);
    // 标记聚类验证来源
    for (const c of validClusters) {
        if (!c.sourceLabel) c.sourceLabel = '聚类验证';
    }

    // Step 3b: 不足2条弹幕的聚类，检测是否有时间互证的弹幕确认
    // ① 感谢弹幕引用触发时间（如 @5:01 "谢谢2:00指路" → 确认 @2:00 的跳转）
    // ② 任意弹幕引用目标时间（如 @5:01 "502道路通常" → 确认 5:02 目标）
    for (const c of clusters) {
        if (c.members.length >= CONFIG.CLUSTER_MIN_COUNT) continue; // 已有效
        if (validClusters.some(v => Math.abs(v.targetTime - c.targetTime) <= CONFIG.DEDUP_WINDOW)) continue; // 已覆盖
        // ① 检查是否有成员的触发时间被目标附近的感谢弹幕引用
        const mutualCount = c.members.reduce((sum, m) =>
            sum + countTimeConfirmedGratitude(c.targetTime, m.danmakuTime, allDanmakus, 5, index), 0
        );
        if (mutualCount >= 1) {
            c.mutualConfirmed = true;
            c.sourceLabel = '感恩互证';
            validClusters.push(c);
            continue;
        }
        // ② 检查目标附近是否有任意弹幕引用相同目标时间（无关键词限制）
        const refCount = countTimeReferencingDanmaku(c.targetTime, allDanmakus, 5, index);
        if (refCount >= 1) {
            c.mutualConfirmed = true;
            c.sourceLabel = '聚类验证';
            validClusters.push(c);
        }
    }

    // Step 4: 降级检查链 — 若聚类都不足，依次尝试降级手段
    let finalClusters;
    if (validClusters.length > 0) {
        finalClusters = validClusters;
    } else {
        // 降级①：频率统计找出重复最多的目标
        const freqResult = findBestTimeByFrequency(candidates, CONFIG.FREQUENCY_WINDOW, CONFIG.FREQUENCY_MIN_COUNT);
        if (freqResult) {
            finalClusters = [{
                targetTime: freqResult.targetTime,
                members: candidates.filter(c => c.targetTime === freqResult.targetTime),
                sourceLabel: '频率统计',
            }];
        } else {
            // 降级②：单条跳过弹幕 + 目标附近有同时间引用的感谢弹幕（感恩时间互证）
            const timeConfirmed = [];
            for (const c of candidates) {
                const mc = countTimeConfirmedGratitude(c.targetTime, c.danmakuTime, allDanmakus, 5, index);
                if (mc >= 1 && c.hasKeyword) {
                    timeConfirmed.push({ candidate: c, mutualCount: mc });
                }
            }
            if (timeConfirmed.length > 0) {
                finalClusters = timeConfirmed.map(tc => ({
                    targetTime: tc.candidate.targetTime,
                    members: [tc.candidate],
                    mutualConfirmed: true,
                    sourceLabel: '感恩互证',
                }));
            } else {
                // 降级③：单条跳过弹幕 + 目标附近有同时间引用的任意弹幕（前后呼应互证）
                // 例：@2:00 "上车502"→5:02，附近 @5:01 "502道路通常"→5:02
                const timeReferenced = [];
                for (const c of candidates) {
                    const rc = countTimeReferencingDanmaku(c.targetTime, allDanmakus, 5, index);
                    if (rc >= 1) {
                        timeReferenced.push({ candidate: c, refCount: rc });
                    }
                }
                if (timeReferenced.length > 0) {
                    finalClusters = timeReferenced.map(tr => ({
                        targetTime: tr.candidate.targetTime,
                        members: [tr.candidate],
                        sourceLabel: '聚类验证',
                    }));
                } else {
                    // 降级④：含跳过关键词的孤立候选
                    const keywordCandidates = candidates.filter(c => c.hasKeyword);
                    if (keywordCandidates.length > 0) {
                        finalClusters = keywordCandidates.map(c => ({
                            targetTime: c.targetTime,
                            members: [c],
                            sourceLabel: '关键词',
                        }));
                    } else {
                        // 降级⑤：单条弹幕 + 目标附近有任何感谢弹幕（词级互证）
                        const simpleMutual = [];
                        for (const c of candidates) {
                            const gc = countGratitudeDanmaku(c.targetTime, allDanmakus, 5, index);
                            if (gc >= 1) {
                                simpleMutual.push(c);
                            }
                        }
                        if (simpleMutual.length > 0) {
                            finalClusters = simpleMutual.map(c => ({
                                targetTime: c.targetTime,
                                members: [c],
                                sourceLabel: '感恩互证',
                            }));
                        } else {
                            return [];
                        }
                    }
                }
            }
        }
    }

    // Step 5: 去重
    const triggers = deduplicateClusters(finalClusters, CONFIG.DEDUP_WINDOW);

    // Step 6: 反向验证 — 目标时间附近有弹幕确认真实
    for (const t of triggers) {
        const gratitudeCount = countGratitudeDanmaku(t.targetTime, allDanmakus, 5, index);
        t.gratitudeCount = gratitudeCount;
        const gratitudeDetails = findGratitudeDanmaku(t.targetTime, allDanmakus, 5, index);
        t.gratitudeDetails = gratitudeDetails;
        const mutualCount = countTimeConfirmedGratitude(t.targetTime, t.triggerDanmakuTime, allDanmakus, 5, index);
        t.timeConfirmedCount = mutualCount;
        const refCount = countTimeReferencingDanmaku(t.targetTime, allDanmakus, 5, index);
        t.timeRefCount = refCount;
    }

    // Step 7: 反向发现 — 感谢弹幕提到的时间若未被覆盖，搜索相近跳过弹幕补建
    const supplementary = discoverFromGratitude(allDanmakus, triggers, currentTime, index);
    for (const t of supplementary) {
        triggers.push(t);
    }

    // Step 8: 确认弹幕聚类发现 — 不依赖触发弹幕解析，直接由目标位置的多条确认弹幕反推跳转点
    const confirmationTriggers = discoverFromConfirmationClusters(allDanmakus, currentTime, triggers, index);
    for (const t of confirmationTriggers) {
        triggers.push(t);
    }

    // Step 9: 每视频只保留一个“提醒最密集”的跳转点
    return keepBestTrigger(triggers);
}

/* ===================================================================
   核心：加载与分析
   =================================================================== */
async function loadAndAnalyze() {
    if (!currentVideo) return;
    const myGen = ++fetchGeneration; // 代际标记：每次调用递增
    if (isApiLoaded) return;

    const fetcher = new BiliApiFetcher();
    const bvid = fetcher.extractBvid();

    try {
        apiDanmakus = await fetcher.fetchAllDanmakus();
        // 代际检查：如果在此请求期间有新的 loadAndAnalyze() 调用，丢弃旧结果
        if (myGen !== fetchGeneration) {
            return;
        }
        isApiLoaded = true;

        // 尝试缓存
        let triggers = null;
        if (bvid) {
            triggers = loadCachedTriggers(bvid);
        }

        // 缓存未命中 → 实时分析
        if (!triggers) {
            triggers = processDanmakus(apiDanmakus, currentVideo.currentTime);
        }
        // 每视频只保留一个提醒最密集的跳转点（旧缓存也统一收敛）
        triggers = keepBestTrigger(triggers);
        if (bvid && triggers.length > 0) {
            saveCachedTriggers(bvid, triggers);
        }

        // 生成待触发队列（仅保留未来的弹幕）
        addToPendingQueue(triggers);
        analysisDone = true;

        if (isExpanded) updateLogUI();
    } catch (error) {
        // 重试
        setTimeout(() => {
            if (!isApiLoaded && currentVideo) loadAndAnalyze();
        }, CONFIG.API_RETRY_DELAY);
    }
}

function addToPendingQueue(triggers) {
    triggers = keepBestTrigger(triggers);
    const now = currentVideo ? currentVideo.currentTime : 0;

    for (const t of triggers) {
        // 触发点已过不直接丢弃：错过弹幕时刻后，接近目标时仍会兜底触发（见 checkAndTrigger）

        // 跳过用户之前手动忽略的跳转（刷新后仍记忆）
        const dismissKey = `${Math.round(t.targetTime)}_${Math.round(t.triggerDanmakuTime)}`;
        if (dismissedTriggers.has(dismissKey)) continue;

        // 跳过超过视频总时长的跳转（duration 可能在分析后才就绪）
        if (currentVideo && currentVideo.duration && !isNaN(currentVideo.duration) &&
            t.targetTime >= currentVideo.duration) continue;

        // 跳过目标超过视频2/3位置的跳转（短视频跳过头不合理）
        if (currentVideo && currentVideo.duration && !isNaN(currentVideo.duration) && currentVideo.duration > 0 &&
            t.targetTime > currentVideo.duration * CONFIG.MAX_TARGET_RATIO) continue;

        // 跳过目标时间已经过去的触发点（例如用户 seek 到后面了）
        if (t.targetTime <= now) {
            continue;
        }

        // 兜底：往回跳转（目标时间 ≤ 弹幕出现时间）→ 一定是错的，忽略
        if (t.targetTime <= t.triggerDanmakuTime) {
            continue;
        }

        // 检查冷却
        if (cooldownManager.isInCooldown(t.triggerDanmakuTime, now)) {
            continue;
        }

        pendingTriggers.push({
            targetTime: t.targetTime,
            triggerTime: t.triggerDanmakuTime,
            matchedContent: t.matchedContent,
            memberCount: t.memberCount,
            allContents: t.allContents || [],
            gratitudeCount: t.gratitudeCount || 0,
            gratitudeDetails: t.gratitudeDetails || [],
            timeConfirmedCount: t.timeConfirmedCount || 0,
            timeRefCount: t.timeRefCount || 0,
            sourceLabel: t.sourceLabel || '',
        });
    }

    // 按触发时间排序
    pendingTriggers.sort((a, b) => a.triggerTime - b.triggerTime);

    // 去重（同目标时间的只保留一个）
    const seen = new Set();
    pendingTriggers = pendingTriggers.filter(t => {
        const key = `${Math.round(t.targetTime)}_${Math.round(t.triggerTime)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // 区间重叠去重：两条跳转的时间区间 [triggerTime, targetTime] 有交集时，
    // 视为同一次跳转意图（先跳的会覆盖后跳的目标），只保留支持数据更多的一方。
    // 证据评分：memberCount（参与弹幕数）优先，其次感谢数。
    // 如 @9:01 "1020工程"→10:20 与 @9:04 "1015工程"→10:15 完全重叠 → 只保留一个
    if (pendingTriggers.length >= 2) {
        const sorted = [...pendingTriggers].sort((a, b) => a.triggerTime - b.triggerTime);
        const merged = [];
        for (const cur of sorted) {
            let absorbed = false;
            for (let i = 0; i < merged.length; i++) {
                const prev = merged[i];
                // 区间有交集（严格小于，防止首尾相接的连续跳转被误合并）
                if (!(cur.triggerTime < prev.targetTime && prev.triggerTime < cur.targetTime)) continue;
                const curScore = (cur.memberCount || 0) * 100 + (cur.gratitudeCount || 0);
                const prevScore = (prev.memberCount || 0) * 100 + (prev.gratitudeCount || 0);
                if (curScore > prevScore) {
                    merged[i] = cur;
                }
                absorbed = true;
                break;
            }
            if (!absorbed) merged.push(cur);
        }
        if (merged.length < pendingTriggers.length) {
            pendingTriggers = merged;
        }
    }

    updateIconBadge();
}

/** 用户手动忽略一个待触发跳转 */
function dismissPendingTrigger(key) {
    const idx = pendingTriggers.findIndex(t => `${Math.round(t.targetTime)}_${Math.round(t.triggerTime)}` === key);
    if (idx === -1) return;
    pendingTriggers.splice(idx, 1);
    // 存入已忽略记录，刷新后不重现
    dismissedTriggers.add(key);
    trimDismissedTriggers(); // 超上限时自动裁剪
    try { localStorage.setItem('dm_skip_dismissed', JSON.stringify([...dismissedTriggers])); } catch (e) { /* ignore */ }
    updateIconBadge();
    if (isExpanded) updateLogUI();
}

/** 清空所有待触发跳转 */
function clearPendingTriggers() {
    if (pendingTriggers.length === 0) return;
    // 将所有待触发标记为已忽略，刷新后不重现
    for (const t of pendingTriggers) {
        const key = `${Math.round(t.targetTime)}_${Math.round(t.triggerTime)}`;
        dismissedTriggers.add(key);
    }
    trimDismissedTriggers(); // 超上限时自动裁剪
    try { localStorage.setItem('dm_skip_dismissed', JSON.stringify([...dismissedTriggers])); } catch (e) { /* ignore */ }
    pendingTriggers = [];
    updateIconBadge();
    if (currentTarget) {
        currentTarget = null;
        decisionTimeLeft = 0;
        decisionStartTime = 0;
        decisionTotalWait = 0;
        if (activeToast) { activeToast.remove(); activeToast = null; }
    }
    if (isExpanded) updateLogUI();
}

/* ===================================================================
   核心：检测与触发
   =================================================================== */
/** 返回当前阻止“待触发 → 倒计时”的原因，空串表示没有阻塞 */
function getTriggerBlockerReason() {
    if (!currentVideo) return '未找到视频元素';
    if (!isEnabled) return '自动跳转开关已关闭，打开后才会进入倒计时';
    if (currentVideo.paused) return '视频暂停中，恢复播放后会自动倒计时';
    if (videoJumpCompleted) return '本视频已经跳转过一次，不再重复跳转';
    return '';
}

/** 阻塞原因变化时才刷新面板，避免高频重绘 */
function refreshBlockerHint() {
    if (!isExpanded || !expandedPanel) return;
    const key = `${!!currentVideo}|${isEnabled}|${currentVideo ? currentVideo.paused : ''}|${videoJumpCompleted}`;
    if (key !== lastBlockerKey) {
        lastBlockerKey = key;
        updateLogUI();
    }
}

function checkAndTrigger() {
    if (!currentVideo || !isEnabled || currentVideo.paused || videoJumpCompleted) {
        if (pendingTriggers.length > 0 && !blockerWarned) {
            blockerWarned = true;
            console.warn('[跳过] 检测到待触发任务，但未进入倒计时：',
                getTriggerBlockerReason() || '未知原因',
                { isEnabled, paused: currentVideo && currentVideo.paused, videoJumpCompleted, pending: pendingTriggers.length });
        }
        refreshBlockerHint();
        return;
    }
    blockerWarned = false;
    const now = currentVideo.currentTime;

    let idx = 0;
    while (idx < pendingTriggers.length) {
        const task = pendingTriggers[idx];
        const missedTrigger = task.triggerTime <= now - 0.5;
        const nearMissedTarget = now >= task.targetTime - CONFIG.MISSED_TRIGGER_LEAD;

        // 未错过的任务：弹幕还没到出现时间，队列按触发时间排序，后面更不会到
        if (!missedTrigger && task.triggerTime > now + 0.2) break;
        // 已错过的任务：离目标还远，先保留，等接近目标再兜底倒计时
        if (missedTrigger && !nearMissedTarget) { idx++; continue; }

        // 弹幕出现了，检查冷却
        pendingTriggers.splice(idx, 1);
        updateIconBadge();

        if (cooldownManager.isInCooldown(task.triggerTime, now)) {
            continue;
        }

        // 目标时间超过视频总时长 → 忽略
        if (currentVideo && currentVideo.duration && !isNaN(currentVideo.duration) &&
            task.targetTime >= currentVideo.duration) {
            continue;
        }

        // 目标时间已过，用户已手动跳过此段
        if (task.targetTime <= now) {
            continue;
        }

        // 创建倒计时
        if (!currentTarget) {
            currentTarget = task;
            // 用户 seek 进入触发区间（触发时间已过）→ 短倒计时，不等待
            const isSeekTrigger = task.triggerTime <= now - 0.5;
            decisionTotalWait = isSeekTrigger ? 600 : userDecisionWindow;
            decisionTimeLeft = decisionTotalWait;
            decisionStartTime = Date.now(); // 记录倒计时起点，精确计时
            if (!activeToast) {
                activeToast = createToast(`⏰ 即将跳转`);
            }

            if (isExpanded) updateLogUI();
        }
    }
}

function runJumpCycle() {
    // 每视频最多一次跳转：已跳过后取消残留倒计时
    if (videoJumpCompleted) {
        currentTarget = null;
        decisionTimeLeft = 0;
        decisionStartTime = 0;
        decisionTotalWait = 0;
        if (activeToast) { activeToast.remove(); activeToast = null; }
        return;
    }
    if (!currentVideo || !isEnabled || (!currentTarget && decisionTimeLeft <= 0)) {
        // 视频暂停或未启用时，清除残留 Toast
        if (activeToast && (!currentVideo || !isEnabled || currentVideo.paused)) {
            if (!currentTarget) { // 没有活跃目标时直接清除
                activeToast.remove();
                activeToast = null;
            } else if (currentVideo && currentVideo.paused) {
                // 暂停时隐藏 Toast（用户恢复播放后再显示）
                activeToast.style.display = 'none';
            } else if (activeToast.style.display === 'none') {
                activeToast.style.display = '';
            }
        }
        return;
    }

    // 暂停时显示隐藏的 Toast
    if (activeToast && activeToast.style.display === 'none') {
        activeToast.style.display = '';
    }

    // 每次循环检查 currentTarget 是否仍然有效
    // 用户可能 seek 到目标时间之后导致 currentTarget 过期
    if (currentTarget && currentTarget.targetTime <= currentVideo.currentTime) {
        currentTarget = null;
        decisionTimeLeft = 0;
        decisionStartTime = 0;
        decisionTotalWait = 0;
        if (activeToast) { activeToast.remove(); activeToast = null; }
        return;
    }

    // 基于 Date.now() 计算实际经过时间（防浏览器后台标签页节流导致倒计时偏慢）
    const elapsed = Date.now() - decisionStartTime;
    decisionTimeLeft = Math.max(0, decisionTotalWait - elapsed);

    if ((decisionTimeLeft <= 0 || Number.isNaN(decisionTimeLeft)) && currentTarget) {
        // 执行跳转
        const jumpTime = currentTarget.targetTime + CONFIG.targetOffset;
        const beforeJump = currentVideo.currentTime;

        try {
            currentVideo.currentTime = jumpTime;
        } catch (e) {
            /* 静默，避免失败时控制台刷屏 */
        }

        // 记录冷却
        cooldownManager.recordJump(
            currentTarget.triggerTime,
            currentTarget.targetTime,
            jumpTime
        );

        // 记录日志
        recentTriggers.unshift({
            targetTime: currentTarget.targetTime,
            triggerTime: currentTarget.triggerTime,
            content: currentTarget.matchedContent,
            allContents: currentTarget.allContents || [],
            gratitudeCount: currentTarget.gratitudeCount || 0,
            gratitudeDetails: currentTarget.gratitudeDetails || [],
            timeConfirmedCount: currentTarget.timeConfirmedCount || 0,
            timeRefCount: currentTarget.timeRefCount || 0,
            sourceLabel: currentTarget.sourceLabel || '',
            timestamp: Date.now(),
        });
        if (recentTriggers.length > 10) recentTriggers.pop();

        console.log(`[跳转] ✅ ${formatTime(beforeJump)} → ${formatTime(jumpTime)}`);
        videoJumpCompleted = true;

        // 清理本次跳转相关的待触发队列（在冷却窗口内的）
        pendingTriggers = pendingTriggers.filter(t => {
            const inCooldown = cooldownManager.isInCooldown(t.triggerTime, jumpTime);
            return !inCooldown;
        });
        updateIconBadge();

        decisionTimeLeft = 0;
        decisionStartTime = 0;
        decisionTotalWait = 0;
        currentTarget = null;

        if (activeToast) {
            activeToast.remove();
            activeToast = null;
        }

        if (isExpanded) updateLogUI();
    } else if (activeToast && currentTarget) {
        const secs = Math.ceil(decisionTimeLeft / 1000);
        activeToast.innerText = secs >= 1
            ? `⏰ 跳转至 ${formatTime(currentTarget.targetTime)} · ${secs}s`
            : `⏰ 跳转至 ${formatTime(currentTarget.targetTime)}`;
        activeToast.style.fontSize = getAdaptiveFontSize(currentVideo);
    }
}

/* ===================================================================
   日志 UI
   =================================================================== */
function updateLogUI() {
    if (!expandedPanel) return;

    const list = expandedPanel.querySelector('#dm-log-list');
    if (!list) return;

    let html = '';

    // 弹幕加载状态
    html += `<div style="font-size:10px;margin-bottom:8px;padding:4px 8px;background:#1e2a1e;border-radius:6px;display:flex;justify-content:space-between;">
        <span>📡 ${isApiLoaded ? apiDanmakus.length + ' 条弹幕' : '加载中...'}</span>
        <span>📏 本地解析</span>
    </div>`;

    // 当前倒计时
    if (currentTarget) {
        html += `<div style="margin-bottom:12px;padding:10px;background:#1e3a5f;border-radius:8px;border-left:3px solid #ffaa44;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="font-size:14px;">⏰</span>
                <span style="font-weight:bold;color:#ffaa44;font-size:14px;">即将跳转至 ${formatTime(currentTarget.targetTime)} <span style="font-size:11px;color:#ff8844;font-weight:normal;">(跳过${formatDuration(currentTarget.targetTime - currentTarget.triggerTime)})</span></span>
            </div>
            <div style="font-size:11px;color:#ccc;">💬 @${formatTime(currentTarget.triggerTime)} "${currentTarget.matchedContent.substring(0, 50)}"</div>
            <div style="font-size:10px;color:#aaa;margin-top:4px;">⏱️ 倒计时 ${Math.ceil(decisionTimeLeft / 1000)}秒 | ${currentTarget.memberCount}条弹幕确认${currentTarget.gratitudeCount > 0 ? ` | ✅ ${currentTarget.gratitudeCount}感谢` : ''}${currentTarget.timeConfirmedCount > 0 ? ` | 🔄 ${currentTarget.timeConfirmedCount}⏱互证` : ''}${currentTarget.timeRefCount > 0 ? ` | 📍 ${currentTarget.timeRefCount}呼应` : ''}${currentTarget.sourceLabel ? ` | ${labelToDisplay(currentTarget.sourceLabel)}` : ''}</div>
        </div>`;
    }

    // 待触发队列
    if (pendingTriggers.length > 0) {
        const blockerReason = getTriggerBlockerReason();
        html += `<div style="margin-bottom:12px;padding:8px;background:#0f1012;border-radius:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-size:10px;color:#aaa;">⏰ 待触发 (${pendingTriggers.length}个)</div>
                <span class="dm-clear-pending-btn" style="font-size:10px;color:#e74c3c;cursor:pointer;padding:2px 6px;border-radius:4px;border:1px solid #e74c3c;">🗑️ 全部忽略</span>
            </div>
            ${blockerReason ? `<div style="font-size:10px;color:#ffaa44;margin-bottom:6px;padding:4px 6px;background:#2a2110;border-radius:4px;">⛔ ${blockerReason}</div>` : ''}
            ${pendingTriggers.slice(0, 8).map(t => {
                const key = `${Math.round(t.targetTime)}_${Math.round(t.triggerTime)}`;
                return `<div>
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#ffaa44;margin-bottom:2px;">
                        <span>🎯 ${formatTime(t.targetTime)} ← @${formatTime(t.triggerTime)} <span style="color:#ff8844;">跳过${formatDuration(t.targetTime - t.triggerTime)}</span> "${t.matchedContent.substring(0, 28)}"${t.gratitudeCount > 0 ? ` ✅` : ''}${t.timeConfirmedCount > 0 ? ` 🔄` : ''}${t.timeRefCount > 0 ? ` 📍` : ''}${t.sourceLabel ? ` ${labelToDisplay(t.sourceLabel)}` : ''}</span>
                        <span style="font-size:14px;color:#888;cursor:pointer;padding:0 4px;flex-shrink:0;" class="dm-dismiss-trigger" data-key="${key}">✕</span>
                    </div>
                    ${t.gratitudeDetails && t.gratitudeDetails.length > 0 ? t.gratitudeDetails.slice(0, 2).map(g => `<div style="font-size:9px;color:#666;margin-left:16px;margin-bottom:2px;">🙏 @${formatTime(g.time)} "${g.text.substring(0, 22)}"</div>`).join('') : ''}
                    ${t.allContents && t.allContents.length > 1 ? `<div style="font-size:9px;color:#555;margin-left:16px;margin-bottom:2px;">👥 参与弹幕：${t.allContents.slice(0, 3).map(c => `"${c.substring(0, 18)}"`).join('、')}${t.allContents.length > 3 ? `…(+${t.allContents.length - 3})` : ''}</div>` : ''}
                </div>`;
            }).join('')}
            ${pendingTriggers.length > 8 ? `<div style="font-size:10px;color:#999;">... 还有 ${pendingTriggers.length - 8} 个</div>` : ''}
        </div>`;
    }

    // 最近跳转
    if (recentTriggers.length > 0) {
        const lastTrigger = recentTriggers[0];
        html += `<div style="margin-bottom:12px;padding:8px;background:#0f1012;border-radius:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <div style="font-size:10px;color:#aaa;">📜 最近跳转</div>
                <span class="dm-jump-back-btn" data-time="${lastTrigger.triggerTime}" style="font-size:10px;color:#ffaa44;cursor:pointer;padding:1px 6px;border-radius:4px;border:1px solid #ffaa44;opacity:0.7;" title="返回跳转前位置">↩ ${formatTime(lastTrigger.triggerTime)}</span>
            </div>
            ${recentTriggers.slice(0, 5).map(t => `
                <div style="font-size:11px;color:#4caf50;margin-bottom:2px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#4caf50;margin-bottom:2px;">
                        <span>${t.isAdSegment ? '🚀' : '✅'} ${formatTime(t.targetTime)} ← @${formatTime(t.triggerTime)} <span style="color:#ff8844;">跳过${formatDuration(t.targetTime - t.triggerTime)}</span> "${t.content.substring(0, 30)}"${t.gratitudeCount > 0 ? ` 🎉` : ''}${t.timeConfirmedCount > 0 ? ` 🔄` : ''}${t.timeRefCount > 0 ? ` 📍` : ''}${t.isAdSegment ? '' : t.sourceLabel ? ` ${labelToDisplay(t.sourceLabel)}` : ''}</span>
                    </div>
                    ${t.gratitudeDetails && t.gratitudeDetails.length > 0 ? t.gratitudeDetails.slice(0, 2).map(g => `<div style="font-size:9px;color:#666;margin-left:16px;margin-bottom:2px;">🙏 @${formatTime(g.time)} "${g.text.substring(0, 22)}"</div>`).join('') : ''}
                    ${t.allContents && t.allContents.length > 1 ? `<div style="font-size:9px;color:#555;margin-left:16px;margin-bottom:2px;">👥 参与弹幕：${t.allContents.slice(0, 3).map(c => `"${c.substring(0, 18)}"`).join('、')}${t.allContents.length > 3 ? `…(+${t.allContents.length - 3})` : ''}</div>` : ''}
                </div>
            `).join('')}
        </div>`;
    }

    // 页面广告段
    if (adSegments.length > 0) {
        html += `<div style="margin-bottom:12px;padding:8px;background:#0f1012;border-radius:6px;">
            <div style="font-size:10px;color:#aaa;margin-bottom:6px;">📢 页面广告段 (${adSegments.length}个)</div>
            ${adSegments.slice(0, 5).map(s => {
                const skipped = skippedAdRanges.has(`${Math.round(s.startTime)}-${Math.round(s.endTime)}`);
                return `<div style="font-size:11px;color:${skipped ? '#4caf50' : '#ffaa44'};margin-bottom:2px;">
                    🚀 ${formatTime(s.startTime)}→${formatTime(s.endTime)} ${skipped ? '✅已跳过' : ''} "${s.text.substring(0, 25)}"
                </div>`;
            }).join('')}
        </div>`;
    }

    if (!currentTarget && pendingTriggers.length === 0 && recentTriggers.length === 0) {
        if (analysisDone) {
            html += '<div style="color:#aaa;text-align:center;margin-top:20px;padding:20px;font-size:12px;">✅ 分析完成<br><span style="color:#999;">未发现可靠跳转点</span></div>';
        } else {
            html += '<div style="color:#999;text-align:center;margin-top:20px;padding:20px;">⏳ 等待弹幕分析...</div>';
        }
    }

    list.innerHTML = html;
    updateIconBadge();
}

/* ===================================================================
   浮动图标 + 控制面板
   =================================================================== */
function setIconSide(side) {
    iconSide = side;
    localStorage.setItem('dm_skip_icon_side', side);
    updateIconPosition();
}

function setIconTop(top) {
    iconTop = top;
    localStorage.setItem('dm_skip_icon_top', top);
    updateIconPosition();
}

function updateIconPosition() {
    if (!floatingIcon) return;
    floatingIcon.style.top = iconTop;
    if (iconSide === 'right') {
        floatingIcon.style.left = 'auto';
        floatingIcon.style.right = '-22px';
    } else {
        floatingIcon.style.right = 'auto';
        floatingIcon.style.left = '-22px';
    }
}

/** 更新浮动按钮上的红点消息提示 */
function updateIconBadge() {
    if (!iconBadge) return;
    const count = pendingTriggers.length;
    if (count === 0 || badgeMode === 'none') {
        iconBadge.style.display = 'none';
        return;
    }
    iconBadge.style.display = 'flex';
    // 红点模式：不显示数字
    if (badgeMode === 'dot') {
        iconBadge.innerText = '';
    } else {
        iconBadge.innerText = count > 99 ? '99+' : String(count);
    }
    // 统一位置：贴住可见区域的 emoji 角落
    // 图标在右侧时可见部分是左半边→红点在左侧可见区域; 图标在左侧时红点在右侧可见区域
    const pos = iconSide === 'right' ? 'left:4px;right:auto;' : 'right:4px;left:auto;';
    const size = badgeMode === 'dot' ? 'min-width:10px;height:10px;padding:0;' : 'min-width:14px;height:14px;padding:0 3px;';
    iconBadge.style.cssText = `position:absolute;top:7px;${pos}${size}background:#e74c3c;color:white;font-size:10px;font-weight:bold;border-radius:7px;display:flex;align-items:center;justify-content:center;z-index:1;pointer-events:none;box-shadow:0 1px 3px rgba(0,0,0,0.3);`;
}

function initUI() {
    // 浮动图标
    floatingIcon = document.createElement('div');
    floatingIcon.innerText = '🎯';
    floatingIcon.title = `B站弹幕广告跳过助手 v${SCRIPT_VERSION} (b${SCRIPT_BUILD})`;
    floatingIcon.style.cssText = `position:fixed;width:44px;height:44px;font-size:28px;display:flex;align-items:center;justify-content:center;cursor:grab;z-index:${uiZIndex('floating')};user-select:none;pointer-events:auto;transition:right 0.2s ease, left 0.2s ease;transform:translateY(-50%);`;
    floatingIcon.style.top = iconTop;
    if (iconSide === 'right') {
        floatingIcon.style.right = '-22px';
        floatingIcon.style.left = 'auto';
    } else {
        floatingIcon.style.left = '-22px';
        floatingIcon.style.right = 'auto';
    }

    floatingIcon.onmouseenter = () => {
        isHovering = true;
        if (iconSide === 'right') floatingIcon.style.right = '0';
        else floatingIcon.style.left = '0';
    };
    floatingIcon.onmouseleave = () => {
        isHovering = false;
        if (!isExpanded) {
            if (iconSide === 'right') floatingIcon.style.right = '-22px';
            else floatingIcon.style.left = '-22px';
        }
    };

    // 红点消息提示
    iconBadge = document.createElement('div');
    iconBadge.style.cssText = 'position:absolute;z-index:1;display:none;pointer-events:none;';
    floatingIcon.appendChild(iconBadge);
    updateIconBadge();

    const openExpandedPanel = () => {
        isExpanded = true;
        expandedPanel.style.left = 'auto';
        expandedPanel.style.bottom = 'auto';
        expandedPanel.style.top = panelSavedPos.top || '100px';
        expandedPanel.style.right = '0';
        expandedPanel.style.visibility = 'visible';
        expandedPanel.style.opacity = '1';
        expandedPanel.style.pointerEvents = 'auto';
        expandedPanel.style.display = 'flex';
        floatingIcon.style.display = 'none';
        updateLogUI();
    };

    floatingIcon.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        isDraggingIcon = true;
        hasMoved = false;
        const dragStartY = e.clientY;
        const currentTop = parseFloat(floatingIcon.style.top);
        const iconStartTop = isNaN(currentTop) ? window.innerHeight * 0.5 : currentTop;
        floatingIcon.style.cursor = 'grabbing';

        const onMouseMove = (moveEvent) => {
            if (!isDraggingIcon) return;
            moveEvent.preventDefault();
            let deltaY = moveEvent.clientY - dragStartY;
            let newTop = iconStartTop + deltaY;
            newTop = Math.min(window.innerHeight - 20, Math.max(20, newTop));
            if (Math.abs(deltaY) > 5) hasMoved = true;
            floatingIcon.style.top = newTop + 'px';
        };
        const onMouseUp = () => {
            const shouldOpen = isDraggingIcon && !hasMoved;
            isDraggingIcon = false;
            floatingIcon.style.cursor = 'grab';
            if (hasMoved) setIconTop(floatingIcon.style.top);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            if (shouldOpen) {
                hasMoved = true;
                openExpandedPanel();
            }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    floatingIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hasMoved) { hasMoved = false; return; }
        openExpandedPanel();
    });

    floatingIcon.ondragstart = (e) => {
        e.preventDefault();
        return false;
    };

    // 展开面板
    expandedPanel = document.createElement('div');
    const panelPos = `top:${panelSavedPos.top || '100px'};right:0;`;
    expandedPanel.style.cssText = `position:fixed;width:360px;max-height:80vh;background:#18191c;border:1px solid #333;border-radius:16px;display:none;flex-direction:column;color:#eee;${panelPos}z-index:${uiZIndex('panel')};font-family:sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.4);`;
    expandedPanel.innerHTML = `
        <div id="dm-panel-header" style="padding:12px 16px;background:#23252a;display:flex;justify-content:space-between;align-items:center;cursor:move;border-radius:16px 16px 0 0;">
            <span style="color:#ffaa44;font-weight:500;">🎯 弹幕广告跳过 <span style="font-size:10px;color:#888;">v${SCRIPT_VERSION} (b${SCRIPT_BUILD})</span></span>
            <span id="dm-close-btn" style="cursor:pointer;font-size:20px;color:#aaa;">×</span>
        </div>
        <div style="padding:12px 16px;border-bottom:1px solid #2c2e33;">
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                <input type="checkbox" id="dm-sw-enabled" ${isEnabled ? 'checked' : ''}>
                <span>🔘 自动跳转</span>
            </label>
            <button id="dm-clear-cache-btn" style="background:#f44336;border:none;padding:8px;border-radius:8px;color:white;cursor:pointer;width:100%;margin-bottom:10px;">🗑️ 清除当前视频记忆</button>
            <div style="display:flex;gap:10px;margin-bottom:6px;">
                <div style="flex:1;">
                    <div style="font-size:11px;color:#aaa;margin-bottom:4px;">🎯 浮动按钮位置</div>
                    <select id="dm-side-sel" style="width:100%;background:#2c2e33;border:1px solid #444;padding:6px;border-radius:6px;color:#eee;">
                        <option value="right" ${iconSide === 'right' ? 'selected' : ''}>🟢 贴右侧边缘（鼠标靠右时弹出）</option>
                        <option value="left" ${iconSide === 'left' ? 'selected' : ''}>🟢 贴左侧边缘（鼠标靠左时弹出）</option>
                    </select>
                </div>
                <div style="flex:1;">
                    <div style="font-size:11px;color:#aaa;margin-bottom:4px;">📢 提示弹窗位置</div>
                    <select id="dm-pos-sel" style="width:100%;background:#2c2e33;border:1px solid #444;padding:6px;border-radius:6px;color:#eee;">
                        <option value="center" ${toastPos === 'center' ? 'selected' : ''}>⏺ 画面正中央</option>
                        <option value="top-left" ${toastPos === 'top-left' ? 'selected' : ''}>↖ 左上角</option>
                        <option value="top-right" ${toastPos === 'top-right' ? 'selected' : ''}>↗ 右上角</option>
                        <option value="bottom-left" ${toastPos === 'bottom-left' ? 'selected' : ''}>↙ 左下角</option>
                        <option value="bottom-right" ${toastPos === 'bottom-right' ? 'selected' : ''}>↘ 右下角</option>
                    </select>
                </div>
            </div>
            <div style="margin-top:4px;">
                <input type="range" id="dm-op-range" min="0" max="1" step="0.01" value="${toastOpacity}" style="width:100%;">
                <div style="font-size:10px;color:#aaa;">📢 提示弹窗透明度：<span id="dm-opacity-value">${Math.round(toastOpacity * 100)}</span>%<span style="color:#666;margin-left:8px;">← 拖动滑块在视频上预览效果</span></div>
            </div>
            <div style="margin-top:4px;">
                <input type="range" id="dm-time-range" min="0.5" max="5" step="0.5" value="${userDecisionWindow / 1000}" style="width:100%;">
                <div style="font-size:10px;color:#aaa;">⏰ 倒计时时长：<span id="dm-time-value">${userDecisionWindow / 1000}</span>秒<span style="color:#666;margin-left:8px;">← 触发跳转前的等待时间</span></div>
            </div>
            <div style="margin-top:8px;">
                <div style="font-size:11px;color:#aaa;margin-bottom:4px;">🔢 图标红点模式</div>
                <select id="dm-badge-mode" style="width:100%;background:#2c2e33;border:1px solid #444;padding:6px;border-radius:6px;color:#eee;">
                    <option value="number" ${badgeMode === 'number' ? 'selected' : ''}>🔢 数字提示（显示待触发数量）</option>
                    <option value="dot" ${badgeMode === 'dot' ? 'selected' : ''}>🔴 红点提示（仅显示小红点）</option>
                    <option value="none" ${badgeMode === 'none' ? 'selected' : ''}>🚫 不提示</option>
                </select>
            </div>
            <div style="margin-top:8px;">
                <div style="font-size:11px;color:#aaa;margin-bottom:4px;">🪜 相对视频层级</div>
                <select id="dm-layer-sel" style="width:100%;background:#2c2e33;border:1px solid #444;padding:6px;border-radius:6px;color:#eee;">
                    <option value="below" ${uiLayerMode === 'below' ? 'selected' : ''}>⬇ 下层（悬浮按钮不遮挡控件，面板打开时置顶）</option>
                    <option value="above" ${uiLayerMode === 'above' ? 'selected' : ''}>⬆ 上层（z-index 最高，显示在视频控件之上）</option>
                </select>
                <div style="font-size:10px;color:#666;margin-top:4px;">主要影响悬浮按钮层级，面板打开后会置顶，避免被播放器盖住</div>
            </div>
        </div>
        <div id="dm-log-list" style="flex:1;overflow:auto;padding:10px;background:#0c0d0e;min-height:80px;font-size:12px;">
            <div style="color:#999;text-align:center;padding:20px;">⏳ 等待弹幕分析...</div>
        </div>
        <div style="padding:8px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #2c2e33;letter-spacing:1px;font-weight:500;">
            人人为我 🎯 我为人人
        </div>`;

    document.body.append(floatingIcon, expandedPanel);
    applyUiLayer();

    // 事件绑定
    expandedPanel.querySelector('#dm-close-btn').onclick = () => {
        isExpanded = false;
        expandedPanel.style.display = 'none';
        floatingIcon.style.display = 'flex';
        if (!isHovering) {
            if (iconSide === 'right') floatingIcon.style.right = '-22px';
            else floatingIcon.style.left = '-22px';
        }
    };

    // 面板拖拽
    const header = expandedPanel.querySelector('#dm-panel-header');
    let panelDragging = false, panelStartY;
    header.onmousedown = (e) => {
        if (e.target === header || e.target.parentElement === header) {
            panelDragging = true;
            const rect = expandedPanel.getBoundingClientRect();
            panelStartY = e.clientY - rect.top;
            document.onmousemove = (ev) => {
                if (panelDragging) {
                    let newTop = ev.clientY - panelStartY;
                    newTop = Math.min(window.innerHeight - expandedPanel.offsetHeight, Math.max(0, newTop));
                    expandedPanel.style.top = newTop + 'px';
                }
            };
            document.onmouseup = () => {
                panelDragging = false;
                document.onmousemove = null;
                const rect = expandedPanel.getBoundingClientRect();
                panelSavedPos = { top: rect.top + 'px', right: '0' };
                localStorage.setItem('dm_skip_panel_pos', JSON.stringify(panelSavedPos));
            };
        }
    };

    // 开关
    expandedPanel.querySelector('#dm-sw-enabled').onchange = (e) => {
        isEnabled = e.target.checked;
        localStorage.setItem('dm_skip_enabled', isEnabled);
        if (!isEnabled) {
            currentTarget = null;
            decisionTimeLeft = 0;
            decisionStartTime = 0;
            decisionTotalWait = 0;
            if (activeToast) { activeToast.remove(); activeToast = null; }
            if (previewToast) { previewToast.remove(); previewToast = null; }
        }
    };

    // 清除缓存
    expandedPanel.querySelector('#dm-clear-cache-btn').onclick = () => {
        const fetcher = new BiliApiFetcher();
        const bvid = fetcher.extractBvid();
        if (bvid) {
            clearCachedTriggers(bvid);
            cooldownManager.reset();
            pendingTriggers = [];
            currentTarget = null;
            decisionTimeLeft = 0;
            decisionStartTime = 0;
            decisionTotalWait = 0;
            if (activeToast) { activeToast.remove(); activeToast = null; }
            recentTriggers = [];
            if (isApiLoaded && currentVideo) {
                const triggers = processDanmakus(apiDanmakus, currentVideo.currentTime);
                if (triggers.length > 0) saveCachedTriggers(bvid, triggers);
                addToPendingQueue(triggers);
                analysisDone = true;
            }
            if (isExpanded) updateLogUI();
        }
    };

    // 图标侧边
    expandedPanel.querySelector('#dm-side-sel').onchange = (e) => setIconSide(e.target.value);

    // Toast位置
    expandedPanel.querySelector('#dm-pos-sel').onchange = (e) => {
        toastPos = e.target.value;
        localStorage.setItem('dm_skip_toast_pos', toastPos);
        updateToastStyle();
    };

    // 透明度
    const opacityRange = expandedPanel.querySelector('#dm-op-range');
    const opacityValue = expandedPanel.querySelector('#dm-opacity-value');

    function updateLiveOpacity(val) {
        toastOpacity = parseFloat(val);
        localStorage.setItem('dm_skip_toast_opacity', toastOpacity);
        opacityValue.textContent = Math.round(toastOpacity * 100);
        if (activeToast) {
            updateToastStyle();
        } else if (previewToast) {
            previewToast.style.background = `rgba(0,0,0,${toastOpacity})`;
            previewToast.style.color = `rgba(255,255,255,${toastOpacity})`;
            previewToast.style.borderColor = `rgba(255,255,255,${toastOpacity * 0.5})`;
        }
    }

    opacityRange.addEventListener('input', (e) => updateLiveOpacity(e.target.value));

    let isDraggingOpacity = false;
    opacityRange.addEventListener('mousedown', () => {
        isDraggingOpacity = true;
        // 若没有正在显示的弹幕，在视频上创建一个预览弹幕
        if (!activeToast && currentVideo && !previewToast) {
            previewToast = createToast('⏰ 透明度预览 · 跳转至 0:00');
        }
    });

    function stopOpacityPreview() {
        isDraggingOpacity = false;
        if (previewToast) {
            previewToast.remove();
            previewToast = null;
        }
    }

    document.addEventListener('mouseup', () => { if (isDraggingOpacity) stopOpacityPreview(); });
    document.addEventListener('touchend', () => { if (isDraggingOpacity) stopOpacityPreview(); });

    // 倒计时时长
    const timeRange = expandedPanel.querySelector('#dm-time-range');
    const timeValue = expandedPanel.querySelector('#dm-time-value');
    timeRange.addEventListener('input', (e) => {
        const sec = parseFloat(e.target.value);
        const ms = normalizeDecisionWindow(Math.round(sec * 1000));
        userDecisionWindow = ms;
        localStorage.setItem('dm_skip_decision_window', ms);
        timeValue.textContent = (ms / 1000).toFixed(1);
    });

    // 图标红点模式
    expandedPanel.querySelector('#dm-badge-mode').onchange = (e) => {
        badgeMode = e.target.value;
        localStorage.setItem('dm_skip_badge_mode', badgeMode);
        updateIconBadge();
    };

    // 相对视频层级
    expandedPanel.querySelector('#dm-layer-sel').onchange = (e) => {
        uiLayerMode = e.target.value;
        localStorage.setItem('dm_skip_layer_mode', uiLayerMode);
        applyUiLayer();
    };

    // 待触发队列升降级事件委托
    expandedPanel.addEventListener('click', (e) => {
        const dismissBtn = e.target.closest('.dm-dismiss-trigger');
        if (dismissBtn) {
            const key = dismissBtn.getAttribute('data-key');
            if (key) dismissPendingTrigger(key);
            return;
        }
        const clearBtn = e.target.closest('.dm-clear-pending-btn');
        if (clearBtn) { clearPendingTriggers(); return; }
        const backBtn = e.target.closest('.dm-jump-back-btn');
        if (backBtn) {
            const targetTime = parseFloat(backBtn.getAttribute('data-time'));
            if (!isNaN(targetTime) && currentVideo) {
                currentTarget = null;
                decisionTimeLeft = 0;
                decisionStartTime = 0;
                decisionTotalWait = 0;
                if (activeToast) { activeToast.remove(); activeToast = null; }
                currentVideo.currentTime = targetTime;
            }
        }
    });
}

/* ===================================================================
   视频切换监听
   =================================================================== */

/** 重置与视频切换相关的所有状态 */
function resetVideoState() {
    isApiLoaded = false;
    analysisDone = false;
    apiDanmakus = [];
    pendingTriggers = [];
    videoJumpCompleted = false;
    blockerWarned = false;
    lastBlockerKey = '';
    currentTarget = null;
    decisionTimeLeft = 0;
    decisionStartTime = 0;
    decisionTotalWait = 0;
    if (activeToast) { activeToast.remove(); activeToast = null; }
    cooldownManager.reset();
    recentTriggers = [];
    adSegments = [];
    skippedAdRanges = new Set();
    adSegmentsScanned = false;
    if (previewToast) { previewToast.remove(); previewToast = null; }
}

function setupVideoWatcher() {
    let lastUrl = window.location.href;

    setInterval(() => {
        // 检测视频元素
        const video = getPrimaryVideo();
        if (video && video !== currentVideo) {
            currentVideo = video;
            resetVideoState();
            setTimeout(() => loadAndAnalyze(), CONFIG.API_READ_DELAY);

            // 用户手动 seek 时清理过期跳转
            video.addEventListener('seeked', function onSeek() {
                if (!currentVideo || !isEnabled) return;
                const now = currentVideo.currentTime;
                pendingTriggers = pendingTriggers.filter(t => t.targetTime > now + 0.2);
                if (currentTarget && (currentTarget.triggerTime <= now || currentTarget.targetTime <= now)) {
                    currentTarget = null;
                    decisionTimeLeft = 0;
                    decisionStartTime = 0;
                    decisionTotalWait = 0;
                    if (activeToast) { activeToast.remove(); activeToast = null; }
                    if (isExpanded) updateLogUI();
                }
                if (!adSegmentsScanned) scanPageForAdSegments();
                checkAdSegments();
            });
        }

        // 检测URL变化（B站SPA切换视频）
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            resetVideoState();
            if (currentVideo) {
                setTimeout(() => loadAndAnalyze(), CONFIG.API_READ_DELAY);
            }
        }

        // 定期扫描页面广告段（简介/章节）
        if (!adSegmentsScanned) {
            scanPageForAdSegments();
        }
    }, 1000);
}

/* ===================================================================
   启动
   =================================================================== */
function start() {
    cleanExpiredCache();
    initUI();
    setupVideoWatcher();

    // 核心循环
    setInterval(runJumpCycle, 100);
    setInterval(() => {
        if (currentVideo && isApiLoaded && isEnabled) checkAndTrigger();
        // 页面广告段检测
        if (currentVideo && isEnabled) checkAdSegments();
    }, 200);

    // 响应窗口尺寸变化
    window.addEventListener('resize', () => {
        if (activeToast) activeToast.style.fontSize = getAdaptiveFontSize(currentVideo);
    });

    // 初始加载
    setTimeout(() => {
        const video = getPrimaryVideo();
        if (video) {
            currentVideo = video;
            loadAndAnalyze();
        }
    }, CONFIG.API_READ_DELAY);

}

// 等待DOM就绪
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}

})();
