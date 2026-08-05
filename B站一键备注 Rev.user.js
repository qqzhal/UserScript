// ==UserScript==
// @name                B站一键备注 Rev
// @namespace           https://github.com/kaixinol/
// @version             2.8.2
// @author              Kaesinol
// @description         B站UP主一键备注 | B站一键备注 Rev 的重写版本
// @license             AGPL-3.0-or-later
// @icon                https://www.bilibili.com/favicon.ico
// @website             https://github.com/kaixinol/Bilibili-User-Memo
// @supportURL          https://github.com/kaixinol/Bilibili-User-Memo/issues
// @match               https://*.bilibili.com/*
// @exclude             https://*.hdslb.com/*
// @exclude             https://live.bilibili.com/*
// @exclude             https://www.bilibili.com/match/*
// @exclude             https://app.bilibili.com/*
// @require             https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js
// @require             https://cdn.jsdelivr.net/npm/opencc-js@1.3.1/dist/umd/full.js
// @require             https://cdn.jsdelivr.net/npm/query-selector-shadow-dom@1.0.1/dist/querySelectorShadowDom.js
// @connect             api.bilibili.com
// @grant               GM.xmlHttpRequest
// @grant               GM_addStyle
// @grant               GM_addValueChangeListener
// @grant               GM_getValue
// @grant               GM_registerMenuCommand
// @grant               GM_setValue
// @grant               unsafeWindow
// @run-at              document-body
// @contributionAmount  10￥
// @contributionURL     https://s2.loli.net/2025/08/04/1hjKA5qwXHS8Glu.webp
// @noframes
// @downloadURL https://update.greasyfork.org/scripts/565831/B%E7%AB%99%E4%B8%80%E9%94%AE%E5%A4%87%E6%B3%A8%20Rev.user.js
// @updateURL https://update.greasyfork.org/scripts/565831/B%E7%AB%99%E4%B8%80%E9%94%AE%E5%A4%87%E6%B3%A8%20Rev.meta.js
// ==/UserScript==

!(function (alpinejs, query_selector_shadow_dom, opencc_js) {
    "use strict";
    function storageHas(key, storage) {
        return null !== storage.getItem(key);
    }
    function storageGet(key, storage) {
        let value = storage.getItem(key);
        if (void 0 !== value) return JSON.parse(value);
    }
    function storageSet(key, value, storage) {
        storage.setItem(key, JSON.stringify(value));
    }
    function getGmValue(key, fallback) {
        return _GM_getValue(key, fallback);
    }
    function setGmValue(key, value) {
        _GM_setValue(key, value);
    }
    function showAlert(message) {
        window.alert(message);
    }
    function confirmDialog(message) {
        return window.confirm(message);
    }
    function promptText(message, defaultValue = "") {
        const result = window.prompt(message, defaultValue);
        return null === result ? null : result.trim() || null;
    }
    function querySelectorDeep$1(selector) {
        return (0, query_selector_shadow_dom.querySelectorDeep)(selector);
    }
    function querySelectorAllDeep$1(selector, root) {
        return (0, query_selector_shadow_dom.querySelectorAllDeep)(
            selector,
            root,
        );
    }
    function normalizeUid(value) {
        if (null == value) return null;
        const uid = String(value).trim();
        return uid.length > 0 ? uid : null;
    }
    function getOpusAuthorUid(el) {
        return (
            normalizeUid(window.__INITIAL_STATE__?.detail?.basic?.uid) ||
            normalizeUid(
                window.__INITIAL_STATE__?.detail?.modules?.find(
                    (module) => module.module_author,
                )?.module_author?.mid,
            ) ||
            normalizeUid(el?.$log?.click?.value?.mid)
        );
    }
    function getAttr(el, name) {
        return normalizeUid(el.getAttribute(name));
    }
    function getAttrFromQuery(root, selector, attribute) {
        const target = root.querySelector(selector);
        return target ? normalizeUid(target.getAttribute(attribute)) : null;
    }
    function parseUidFromDataId(value) {
        return value ? normalizeUid(value.split("_")[1]) : null;
    }
    function readPreferredText(node) {
        return (
            (node &&
                (node.dataset.biliOriginal?.trim() ||
                    node.textContent?.trim())) ||
            null
        );
    }
    function resolveRuleTextTarget(el, rule) {
        return rule.textSelector
            ? isDynamicMode(rule)
                ? (function (rule) {
                      return "trigger" in rule;
                  })(rule)
                    ? (function (el, rule, textSelector) {
                          if (el.matches(textSelector)) return el;
                          const childTextEl = el.querySelector(textSelector);
                          if (childTextEl) return childTextEl;
                          const directContainer = el.closest(
                              rule.trigger.watch,
                          );
                          if (directContainer)
                              return directContainer.querySelector(
                                  textSelector,
                              );
                          const watchTargets = querySelectorAllDeep$1(
                              rule.trigger.watch,
                          );
                          for (const target of watchTargets) {
                              const scope = target.shadowRoot || target;
                              if (scope.contains(el))
                                  return scope.querySelector(textSelector);
                          }
                          const first = watchTargets[0];
                          return first
                              ? (first.shadowRoot || first).querySelector(
                                    textSelector,
                                )
                              : null;
                      })(el, rule, rule.textSelector)
                    : null
                : (function (el, textSelector) {
                      return (
                          el.querySelector(textSelector) ||
                          (el.matches(textSelector) ? el : null)
                      );
                  })(el, rule.textSelector)
            : el;
    }
    function syncRenderedNodeState(
        el,
        user,
        originalName,
        displayMode,
        options = {},
    ) {
        const text = (function (user, fallbackName, displayMode) {
            const nickname = (user?.nickname || fallbackName || "").trim(),
                memo = (user?.memo || "").trim();
            if (!memo) return nickname;
            switch (displayMode) {
                case 0:
                default:
                    return nickname;
                case 1:
                    return `${memo}(${nickname})`;
                case 2:
                    return `${nickname}(${memo})`;
                case 3:
                    return memo;
            }
        })(user, originalName, displayMode);
        el.textContent !== text && (el.textContent = text);
        const shouldHighlight = Boolean(
            !options.isEditableWrapper &&
            user?.memo &&
            user.memo !== originalName &&
            text !== originalName,
        );
        el.classList.toggle("bili-memo-tag", shouldHighlight);
    }
    function syncElementMeta(el, meta) {
        el.dataset.biliUid !== meta.uid && (el.dataset.biliUid = meta.uid);
        el.dataset.biliOriginal !== meta.originalName &&
            (el.dataset.biliOriginal = meta.originalName);
    }
    function refreshTag(tag, user, displayMode) {
        syncRenderedNodeState(
            tag,
            user,
            tag.getAttribute("data-bili-original") || "",
            displayMode,
            { isEditableWrapper: tag.classList.contains("editable-textarea") },
        );
    }
    function delay(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }
    function nextFrame() {
        return new Promise((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }
    async function waitUntil(
        predicate,
        { intervalMs: intervalMs = 50, timeoutMs: timeoutMs } = {},
    ) {
        const startTime = Date.now();
        for (;;) {
            if (await predicate()) return !0;
            if (void 0 !== timeoutMs && Date.now() - startTime >= timeoutMs)
                return !1;
            await delay(intervalMs);
        }
    }
    function requestIdle(callback, timeout = 1e3) {
        const requestIdleCallback = window.requestIdleCallback;
        requestIdleCallback
            ? requestIdleCallback(callback, { timeout: timeout })
            : window.setTimeout(
                  () => callback({ timeRemaining: () => 16 }),
                  16,
              );
    }
    function isNoFaceAvatar(url) {
        return url.includes("noface.jpg");
    }
    function getUserAvatarFromDOM(userID) {
        !(function (depth = 3) {
            const frame = new Error().stack?.split("\n")?.[depth]?.trim();
            if (!frame) return "unknown";
            const nameMatch = frame.match(/at\s+(?:async\s+)?([^(]+)/),
                pathMatch =
                    (nameMatch && nameMatch[1].trim(),
                    frame.match(/\(([^)]+)\)/));
            (pathMatch ? pathMatch[1] : "")
                .replace(/^https?:\/\/[^/]+/, "")
                .replace(/\?.*$/, "")
                .replace(/:\d+(:\d+)?$/, "")
                .replace(/^\/?src\//, "")
                .replace(/\.[a-z0-9]+$/, "")
                .replace(/\//g, ".");
        })();
        const rules = [
            {
                selector: `#user-avatar[data-user-profile-id="${userID}"] bili-avatar source`,
                attr: "srcset",
            },
            {
                selector: `#user-avatar[data-user-profile-id="${userID}"] img`,
                attr: "src",
            },
            {
                selector: `a[href*="${userID}"] img.bili-avatar-img`,
                attr: "data-src",
            },
            { selector: ".bili-dyn-item__main source", attr: "srcset" },
            { selector: "div.avatar source", attr: "srcset" },
        ];
        for (const { selector: selector, attr: attr } of rules) {
            const el = querySelectorDeep$1(selector),
                val = el?.getAttribute(attr);
            if (val) return val;
        }
        return DEFAULT_AVATAR_URL;
    }
    function normalizeUserCollection(raw, options) {
        const users = new Map();
        (function (raw) {
            return Array.isArray(raw)
                ? raw
                : raw && "object" == typeof raw
                  ? Object.values(raw)
                  : [];
        })(raw).forEach((entry) => {
            const normalized = (function (
                raw,
                {
                    requireMemo: requireMemo = !1,
                    requireNickname: requireNickname = !1,
                    fallbackNicknameToId: fallbackNicknameToId = !1,
                } = {},
            ) {
                if (!raw || "object" != typeof raw) return null;
                const record = raw,
                    id = String(record.id ?? record.bid ?? "").trim();
                if (!id) return null;
                const memo = String(record.memo ?? "").trim();
                if (requireMemo && !memo) return null;
                let nickname = String(record.nickname ?? "").trim();
                !nickname && fallbackNicknameToId && (nickname = id);
                return requireNickname && !nickname
                    ? null
                    : {
                          id: id,
                          nickname: nickname,
                          avatar: String(
                              record.avatar ||
                                  "https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif",
                          ),
                          memo: memo,
                          isDeleted: !0 === record.isDeleted || void 0,
                      };
            })(entry, options);
            normalized && users.set(normalized.id, normalized);
        });
        return Array.from(users.values());
    }
    function normalizeDisplayMode(value) {
        return "number" == typeof value && value >= 0 && value <= 3 ? value : 2;
    }
    function normalizeUsers(raw) {
        return normalizeUserCollection(raw, {
            requireMemo: !0,
            fallbackNicknameToId: !0,
        });
    }
    function saveUsersToStorage(users) {
        setGmValue("biliUsers", users);
    }
    function usersEqual(a, b) {
        if (a.length !== b.length) return !1;
        for (let i = 0; i < a.length; i++)
            if (
                a[i].id !== b[i].id ||
                a[i].nickname !== b[i].nickname ||
                a[i].avatar !== b[i].avatar ||
                a[i].memo !== b[i].memo
            )
                return !1;
        return !0;
    }
    function isOwnedElement(element) {
        return Boolean(element?.closest(BILI_MEMO_OWNED_SELECTOR));
    }
    function markOwnedElement(element) {
        element.setAttribute("data-bili-memo-owned", "true");
        return element;
    }
    function isOwnedNode(node) {
        return (
            !!node &&
            (node instanceof Element
                ? isOwnedElement(node)
                : node instanceof ShadowRoot
                  ? isOwnedElement(node.host)
                  : isOwnedElement(node.parentElement))
        );
    }
    function hasExternalAddedNodes(mutations) {
        return mutations.some(
            (mutation) =>
                !isOwnedNode(mutation.target) &&
                Array.from(mutation.addedNodes).some(
                    (node) => !isOwnedNode(node),
                ),
        );
    }
    function hasExternalRemovedNodes(mutations) {
        return mutations.some(
            (mutation) =>
                !isOwnedNode(mutation.target) &&
                Array.from(mutation.removedNodes).some(
                    (node) => !isOwnedNode(node),
                ),
        );
    }
    function ensureMemoStyleSheets(root) {
        const sheets = root.adoptedStyleSheets,
            hasGlobal = sheets.includes(GLOBAL_STYLE_SHEET),
            hasCustom =
                !CUSTOM_MEMO_STYLE_SHEET ||
                sheets.includes(CUSTOM_MEMO_STYLE_SHEET);
        if (hasGlobal && hasCustom) return;
        const next = sheets.slice();
        hasGlobal || next.push(GLOBAL_STYLE_SHEET);
        !hasCustom &&
            CUSTOM_MEMO_STYLE_SHEET &&
            next.push(CUSTOM_MEMO_STYLE_SHEET);
        root.adoptedStyleSheets = next;
    }
    function ensureStylesForElement(target) {
        const root = target.getRootNode();
        (root instanceof ShadowRoot || root instanceof Document) &&
            ensureMemoStyleSheets(root);
    }
    function resolveWatchScope(target) {
        return target.shadowRoot || target;
    }
    function isNodeInsideScope(node, scope) {
        if (scope === document) return node.isConnected;
        let current = node;
        for (; current; ) {
            if (current === scope) return !0;
            current =
                current instanceof ShadowRoot
                    ? current.host
                    : current.parentNode;
        }
        return !1;
    }
    function shouldHandleDiscoveryMutations(mutations) {
        return {
            hasAddedNodes: hasExternalAddedNodes(mutations),
            hasRemovedNodes: hasExternalRemovedNodes(mutations),
        };
    }
    function applyCustomFontColor(color) {
        color
            ? document.documentElement.style.setProperty(
                  "--custom-font-color",
                  color,
              )
            : document.documentElement.style.removeProperty(
                  "--custom-font-color",
              );
    }
    function applyTheme(dark) {
        document.documentElement.classList.toggle(
            "memo-container-dark-theme",
            dark,
        );
    }
    function persistWithGmStorage(key, initialValue) {
        const persistFactory = alpinejs.default.$persist;
        return persistFactory
            ? persistFactory(initialValue).as(key).using(gmPersistStorage)
            : initialValue;
    }
    function getGlobalConfig(config$1) {
        return config$1
            ? {
                  lang: config$1?.lang ?? void 0,
                  message: config$1?.message,
                  abortEarly: config$1?.abortEarly ?? void 0,
                  abortPipeEarly: config$1?.abortPipeEarly ?? void 0,
              }
            : DEFAULT_CONFIG;
    }
    function _addIssue(context, label, dataset, config$1, other) {
        const input = other && "input" in other ? other.input : dataset.value,
            expected = other?.expected ?? context.expects ?? null,
            received =
                other?.received ??
                (function (input) {
                    const type = typeof input;
                    return "string" === type
                        ? `"${input}"`
                        : "number" === type ||
                            "bigint" === type ||
                            "boolean" === type
                          ? `${input}`
                          : "object" === type || "function" === type
                            ? ((input &&
                                  Object.getPrototypeOf(input)?.constructor
                                      ?.name) ??
                              "null")
                            : type;
                })(input),
            issue = {
                kind: context.kind,
                type: context.type,
                input: input,
                expected: expected,
                received: received,
                message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
                requirement: context.requirement,
                path: other?.path,
                issues: other?.issues,
                lang: config$1.lang,
                abortEarly: config$1.abortEarly,
                abortPipeEarly: config$1.abortPipeEarly,
            },
            isSchema = "schema" === context.kind,
            message$1 =
                other?.message ??
                context.message ??
                void 0 ??
                (isSchema ? void 0 : null) ??
                config$1.message ??
                void 0;
        void 0 !== message$1 &&
            (issue.message =
                "function" == typeof message$1 ? message$1(issue) : message$1);
        isSchema && (dataset.typed = !1);
        dataset.issues
            ? dataset.issues.push(issue)
            : (dataset.issues = [issue]);
    }
    function _getStandardProps(context) {
        let cached = _standardCache.get(context);
        if (!cached) {
            cached = {
                version: 1,
                vendor: "valibot",
                validate: (value$1) =>
                    context["~run"]({ value: value$1 }, getGlobalConfig()),
            };
            _standardCache.set(context, cached);
        }
        return cached;
    }
    function _isValidObjectKey(object$1, key) {
        return (
            Object.prototype.hasOwnProperty.call(object$1, key) &&
            "__proto__" !== key &&
            "prototype" !== key &&
            "constructor" !== key
        );
    }
    function _joinExpects(values$1, separator) {
        const list = [...new Set(values$1)];
        return list.length > 1
            ? `(${list.join(` ${separator} `)})`
            : (list[0] ?? "never");
    }
    function getFallback(schema, dataset, config$1) {
        return "function" == typeof schema.fallback
            ? schema.fallback(dataset, config$1)
            : schema.fallback;
    }
    function getDefault(schema, dataset, config$1) {
        return "function" == typeof schema.default
            ? schema.default(dataset, config$1)
            : schema.default;
    }
    function object(entries$1, message$1) {
        return {
            kind: "schema",
            type: "object",
            reference: object,
            expects: "Object",
            async: !1,
            entries: entries$1,
            message: message$1,
            get "~standard"() {
                return _getStandardProps(this);
            },
            "~run"(dataset, config$1) {
                const input = dataset.value;
                if (input && "object" == typeof input) {
                    dataset.typed = !0;
                    dataset.value = {};
                    for (const key in this.entries) {
                        const valueSchema = this.entries[key];
                        if (
                            key in input ||
                            (("exact_optional" === valueSchema.type ||
                                "optional" === valueSchema.type ||
                                "nullish" === valueSchema.type) &&
                                void 0 !== valueSchema.default)
                        ) {
                            const value$1 =
                                    key in input
                                        ? input[key]
                                        : getDefault(valueSchema),
                                valueDataset = valueSchema["~run"](
                                    { value: value$1 },
                                    config$1,
                                );
                            if (valueDataset.issues) {
                                const pathItem = {
                                    type: "object",
                                    origin: "value",
                                    input: input,
                                    key: key,
                                    value: value$1,
                                };
                                for (const issue of valueDataset.issues) {
                                    issue.path
                                        ? issue.path.unshift(pathItem)
                                        : (issue.path = [pathItem]);
                                    dataset.issues?.push(issue);
                                }
                                dataset.issues ||
                                    (dataset.issues = valueDataset.issues);
                                if (config$1.abortEarly) {
                                    dataset.typed = !1;
                                    break;
                                }
                            }
                            valueDataset.typed || (dataset.typed = !1);
                            dataset.value[key] = valueDataset.value;
                        } else if (void 0 !== valueSchema.fallback)
                            dataset.value[key] = getFallback(valueSchema);
                        else if (
                            "exact_optional" !== valueSchema.type &&
                            "optional" !== valueSchema.type &&
                            "nullish" !== valueSchema.type
                        ) {
                            _addIssue(this, "key", dataset, config$1, {
                                input: void 0,
                                expected: `"${key}"`,
                                path: [
                                    {
                                        type: "object",
                                        origin: "key",
                                        input: input,
                                        key: key,
                                        value: input[key],
                                    },
                                ],
                            });
                            if (config$1.abortEarly) break;
                        }
                    }
                } else _addIssue(this, "type", dataset, config$1);
                return dataset;
            },
        };
    }
    function optional(wrapped, default_) {
        return {
            kind: "schema",
            type: "optional",
            reference: optional,
            expects: `(${wrapped.expects} | undefined)`,
            async: !1,
            wrapped: wrapped,
            default: default_,
            get "~standard"() {
                return _getStandardProps(this);
            },
            "~run"(dataset, config$1) {
                if (void 0 === dataset.value) {
                    void 0 !== this.default &&
                        (dataset.value = getDefault(this, dataset, config$1));
                    if (void 0 === dataset.value) {
                        dataset.typed = !0;
                        return dataset;
                    }
                }
                return this.wrapped["~run"](dataset, config$1);
            },
        };
    }
    function string(message$1) {
        return {
            kind: "schema",
            type: "string",
            reference: string,
            expects: "string",
            async: !1,
            message: message$1,
            get "~standard"() {
                return _getStandardProps(this);
            },
            "~run"(dataset, config$1) {
                "string" == typeof dataset.value
                    ? (dataset.typed = !0)
                    : _addIssue(this, "type", dataset, config$1);
                return dataset;
            },
        };
    }
    function _subIssues(datasets) {
        let issues;
        if (datasets)
            for (const dataset of datasets)
                if (issues)
                    for (const issue of dataset.issues) issues.push(issue);
                else issues = dataset.issues;
        return issues;
    }
    function decode(body) {
        const form = new FormData();
        body.trim()
            .split("&")
            .forEach(function (bytes) {
                if (bytes) {
                    const split = bytes.split("="),
                        name = split.shift()?.replace(/\+/g, " "),
                        value = split.join("=").replace(/\+/g, " ");
                    form.append(
                        decodeURIComponent(name),
                        decodeURIComponent(value),
                    );
                }
            });
        return form;
    }
    async function GM_fetch(input, init) {
        const request = new Request(input, init);
        let data;
        init?.body && (data = await request.text());
        return await (function (request, init, data) {
            return new Promise((resolve, reject) => {
                if (request.signal && request.signal.aborted)
                    return reject(new DOMException("Aborted", "AbortError"));
                GM.xmlHttpRequest({
                    url: request.url,
                    method: gmXHRMethod(request.method.toUpperCase()),
                    headers: Object.fromEntries(
                        new Headers(init?.headers).entries(),
                    ),
                    data: data,
                    responseType: "blob",
                    onload(res) {
                        try {
                            resolve(
                                (function (req, res) {
                                    const headers = (function (h) {
                                        const s = h.trim();
                                        if (!s) return new Headers();
                                        const array = s
                                            .split("\r\n")
                                            .map((value) => {
                                                let s = value.split(":");
                                                return [
                                                    s[0].trim(),
                                                    s[1].trim(),
                                                ];
                                            });
                                        return new Headers(array);
                                    })(res.responseHeaders);
                                    return new ResImpl(
                                        "string" == typeof res.response
                                            ? new Blob([res.response], {
                                                  type:
                                                      headers.get(
                                                          "Content-Type",
                                                      ) || "text/plain",
                                              })
                                            : res.response,
                                        {
                                            statusCode: res.status,
                                            statusText: res.statusText,
                                            headers: headers,
                                            finalUrl: res.finalUrl,
                                            redirected:
                                                res.finalUrl === req.url,
                                        },
                                    );
                                })(request, res),
                            );
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onabort() {
                        reject(new DOMException("Aborted", "AbortError"));
                    },
                    ontimeout() {
                        reject(
                            new TypeError("Network request failed, timeout"),
                        );
                    },
                    onerror(err) {
                        reject(
                            new TypeError("Failed to fetch: " + err.finalUrl),
                        );
                    },
                });
            });
        })(request, init, data);
    }
    function gmXHRMethod(method) {
        if (httpMethods.includes(method)) return method;
        throw new Error(`unsupported http method ${method}`);
    }
    function pLimit(concurrency) {
        let rejectOnClear = !1;
        "object" == typeof concurrency &&
            ({ concurrency: concurrency, rejectOnClear: rejectOnClear = !1 } =
                concurrency);
        validateConcurrency(concurrency);
        if ("boolean" != typeof rejectOnClear)
            throw new TypeError("Expected `rejectOnClear` to be a boolean");
        const queue = new Queue();
        let activeCount = 0;
        const resumeNext = () => {
                if (activeCount < concurrency && queue.size > 0) {
                    activeCount++;
                    queue.dequeue().run();
                }
            },
            run = async (function_, resolve, arguments_) => {
                const result = (async () => function_(...arguments_))();
                resolve(result);
                try {
                    await result;
                } catch {}
                (() => {
                    activeCount--;
                    resumeNext();
                })();
            },
            generator = (function_, ...arguments_) =>
                new Promise((resolve, reject) => {
                    ((function_, resolve, reject, arguments_) => {
                        const queueItem = { reject: reject };
                        new Promise((internalResolve) => {
                            queueItem.run = internalResolve;
                            queue.enqueue(queueItem);
                        }).then(
                            run.bind(void 0, function_, resolve, arguments_),
                        );
                        activeCount < concurrency && resumeNext();
                    })(function_, resolve, reject, arguments_);
                });
        Object.defineProperties(generator, {
            activeCount: { get: () => activeCount },
            pendingCount: { get: () => queue.size },
            clearQueue: {
                value() {
                    if (!rejectOnClear) {
                        queue.clear();
                        return;
                    }
                    const abortError = AbortSignal.abort().reason;
                    for (; queue.size > 0; ) queue.dequeue().reject(abortError);
                },
            },
            concurrency: {
                get: () => concurrency,
                set(newConcurrency) {
                    validateConcurrency(newConcurrency);
                    concurrency = newConcurrency;
                    queueMicrotask(() => {
                        for (; activeCount < concurrency && queue.size > 0; )
                            resumeNext();
                    });
                },
            },
            map: {
                async value(iterable, function_) {
                    const promises = Array.from(iterable, (value, index) =>
                        this(function_, value, index),
                    );
                    return Promise.all(promises);
                },
            },
        });
        return generator;
    }
    function validateConcurrency(concurrency) {
        if (
            (!Number.isInteger(concurrency) &&
                concurrency !== Number.POSITIVE_INFINITY) ||
            !(concurrency > 0)
        )
            throw new TypeError(
                "Expected `concurrency` to be a number from 1 and up",
            );
    }
    function createConverter(from, to) {
        const cacheKey = `${from}->${to}`,
            cached = converterCache.get(cacheKey);
        if (void 0 !== cached) return cached;
        try {
            const converter = (0, opencc_js.Converter)({ from: from, to: to });
            converterCache.set(cacheKey, converter);
            return converter;
        } catch (error) {
            console.warn(
                `[Bilibili-User-Memo] 简繁搜索转换器初始化失败 (${from} -> ${to})`,
                error,
            );
            converterCache.set(cacheKey, null);
            return null;
        }
    }
    function convertWith(converter, text) {
        if (!converter || !text) return text;
        try {
            return converter(text);
        } catch {
            return text;
        }
    }
    function getSearchForms(value) {
        const raw = value.trim().toLowerCase(),
            cached = searchFormCache.get(raw);
        if (cached) return cached;
        const toSimplified = createConverter("tw", "cn"),
            toTraditional = createConverter("cn", "tw"),
            forms = {
                raw: raw,
                variants: Array.from(
                    new Set(
                        [
                            raw,
                            convertWith(toSimplified, raw),
                            convertWith(toTraditional, raw),
                        ].filter(Boolean),
                    ),
                ),
            };
        searchFormCache.set(raw, forms);
        return forms;
    }
    function matchesChineseSearch(value, queryForms, enableFuzzySearch = !1) {
        if (!queryForms.raw) return !0;
        const targetForms = getSearchForms(String(value || ""));
        return queryForms.variants.some(
            enableFuzzySearch
                ? (query) =>
                      targetForms.variants.some((target) =>
                          (function (query, target) {
                              return query && target
                                  ? !!(
                                        target.includes(query) ||
                                        isSubsequence(query, target) ||
                                        (query.length > target.length &&
                                            isSubsequence(target, query)) ||
                                        (function (query, target) {
                                            if (query.length > target.length)
                                                return !1;
                                            const targetChars = new Set(target);
                                            for (const ch of query)
                                                if (!targetChars.has(ch))
                                                    return !1;
                                            return !0;
                                        })(query, target)
                                    )
                                  : !query;
                          })(query, target),
                      )
                : (query) =>
                      targetForms.variants.some((target) =>
                          target.includes(query),
                      ),
        );
    }
    function isSubsequence(query, target) {
        let qi = 0;
        for (let ti = 0; ti < target.length && qi < query.length; ti++)
            target[ti] === query[qi] && qi++;
        return qi === query.length;
    }
    function getPanelPreloadAllCards() {
        return getGmValue("panelPreloadAllCards", !0);
    }
    function setPanelPreloadAllCards(value) {
        setGmValue("panelPreloadAllCards", value);
    }
    function isValidAvatarUrl(value) {
        try {
            const url = new URL(value);
            return ALLOWED_AVATAR_PROTOCOLS.has(url.protocol);
        } catch {
            return !1;
        }
    }
    function getUserListStore() {
        return alpinejs.default.store("userList");
    }
    function getPanelPrefsStore() {
        return alpinejs.default.store("panelPrefs");
    }
    function runOnNextTick(context, callback) {
        context.$nextTick?.(callback);
    }
    function getRef(context, key) {
        return context.$refs?.[key];
    }
    function useUserListStore() {
        return alpinejs.default.store("userList");
    }
    function loadDisabledPageScopes() {
        const raw = getGmValue("disabledPageScopes", []);
        if (!Array.isArray(raw)) return [];
        const seen = new Set(),
            patterns = [];
        raw.forEach((entry) => {
            if ("string" != typeof entry) return;
            const pattern = entry.trim();
            if (pattern && !seen.has(pattern)) {
                seen.add(pattern);
                patterns.push(pattern);
            }
        });
        return patterns;
    }
    function saveDisabledPageScopes(patterns) {
        setGmValue("disabledPageScopes", patterns);
    }
    var mod,
        target,
        __defProp = Object.defineProperty,
        __getOwnPropDesc = Object.getOwnPropertyDescriptor,
        __getOwnPropNames = Object.getOwnPropertyNames,
        __hasOwnProp = Object.prototype.hasOwnProperty;
    alpinejs =
        ((target =
            null != (mod = alpinejs)
                ? (0, Object.create)((0, Object.getPrototypeOf)(mod))
                : {}),
        ((to, from, except, desc) => {
            if ((from && "object" == typeof from) || "function" == typeof from)
                for (
                    var key,
                        keys = __getOwnPropNames(from),
                        i = 0,
                        n = keys.length;
                    i < n;
                    i++
                )
                    __hasOwnProp.call(to, (key = keys[i])) ||
                        void 0 === key ||
                        __defProp(to, key, {
                            get: ((k) => from[k]).bind(null, key),
                            enumerable:
                                !(desc = __getOwnPropDesc(from, key)) ||
                                desc.enumerable,
                        });
            return to;
        })(
            mod && mod.__esModule
                ? target
                : __defProp(target, "default", { value: mod, enumerable: !0 }),
            mod,
        ));
    var s = new Set(),
        _css = async (t) => {
            if (!s.has(t)) {
                s.add(t);
                ((c = t),
                    "function" == typeof GM_addStyle
                        ? GM_addStyle(c)
                        : (document.head || document.documentElement)
                              .appendChild(document.createElement("style"))
                              .append(c));
                var c;
            }
        },
        module_default = function (Alpine) {
            let persist = () => {
                let alias, storage;
                try {
                    storage = localStorage;
                } catch (e) {
                    console.error(e);
                    console.warn(
                        "Alpine: $persist is using temporary storage since localStorage is unavailable.",
                    );
                    let dummy = new Map();
                    storage = {
                        getItem: dummy.get.bind(dummy),
                        setItem: dummy.set.bind(dummy),
                    };
                }
                return Alpine.interceptor(
                    (initialValue, getter, setter, path, key) => {
                        let lookup = alias || `_x_${path}`,
                            initial = storageHas(lookup, storage)
                                ? storageGet(lookup, storage)
                                : initialValue;
                        setter(initial);
                        Alpine.effect(() => {
                            let value = getter();
                            storageSet(lookup, value, storage);
                            setter(value);
                        });
                        return initial;
                    },
                    (func) => {
                        ((func.as = (key) => {
                            alias = key;
                            return func;
                        }),
                            (func.using = (target) => {
                                storage = target;
                                return func;
                            }));
                    },
                );
            };
            Object.defineProperty(Alpine, "$persist", { get: () => persist() });
            Alpine.magic("persist", persist);
            Alpine.persist = (
                key,
                { get: get, set: set },
                storage = localStorage,
            ) => {
                set(
                    storageHas(key, storage) ? storageGet(key, storage) : get(),
                );
                Alpine.effect(() => {
                    let value = get();
                    storageSet(key, value, storage);
                    set(value);
                });
            };
        };
    _css(
        ".panel-container{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light;z-index:9999;background:var(--bg-main);border-top:2px solid var(--primary-color);height:46vh;transition:transform .3s cubic-bezier(.4,0,.2,1);position:fixed;bottom:0;left:0;right:0;box-shadow:0 -4px 12px #00000014}.panel-container.closed{transform:translateY(100%)}.panel-container.open{transform:translateY(0%)}.panel-inner{box-sizing:border-box;flex-direction:column;height:100%;padding:12px 20px;display:flex;position:relative}.panel-toggle-btn{cursor:context-menu;width:70px;height:34px;color:var(--text-inverse);background:var(--primary-color);-webkit-user-select:none;user-select:none;border:none;border-radius:8px 8px 0 0;justify-content:center;align-items:center;font-size:18px;transition:opacity .3s,background .2s,top .2s;display:flex;position:absolute;top:-34px;left:20px}.panel-toggle-btn:hover{background:var(--primary-color);opacity:1!important}.panel-mode-section{align-items:center;gap:18px;padding:8px 12px;font-size:16px;display:flex;position:relative}.panel-right-actions{align-items:center;gap:10px;margin-left:auto;display:flex}.panel-custom-css-section{background:var(--bg-sub);border:1px solid var(--border-main);width:min(560px,100vw - 32px);color:var(--text-main);border-radius:10px;padding:12px;box-shadow:0 12px 40px #00000040}.panel-custom-css-section:not([open]){display:none!important}.panel-custom-css-section[open]{flex-direction:column;gap:8px;display:flex}.panel-custom-css-section::backdrop{background:#00000059}.panel-custom-css-header{justify-content:space-between;align-items:center;gap:12px;display:flex}.panel-custom-css-title{color:var(--text-main);font-size:13px;font-weight:600}.panel-custom-css-close{width:28px;height:28px;color:var(--text-sub);cursor:pointer;background:0 0;border:none;border-radius:6px;font-size:22px;line-height:1}.panel-custom-css-close:hover{background:var(--bg-main);color:var(--text-main)}.panel-custom-css-input{resize:vertical;border:1px solid var(--border-main);background:var(--bg-main);width:100%;min-height:90px;color:var(--text-main);border-radius:8px;outline:none;padding:8px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;font-size:12px;transition:border-color .15s,box-shadow .15s}.panel-custom-css-input:focus{border-color:var(--primary-color);box-shadow:0 0 0 2px var(--primary-alpha)}.panel-custom-css-status{color:var(--text-inverse);background:var(--danger-color);border-radius:6px;padding:4px 8px;font-size:12px;line-height:1.4}.panel-custom-css-hint{color:var(--text-sub);font-size:12px;line-height:1.4}.panel-custom-color-setting{background:var(--bg-sub);border:1px solid var(--primary-color);color:var(--text-main);cursor:pointer;border-radius:10px;align-items:center;gap:8px;padding:4px 8px;font-size:13px;display:flex;position:relative}.color-preview{border:1px solid var(--border-main);cursor:pointer;background:var(--custom-font-color,var(--primary-color));border-radius:4px;width:20px;height:20px}.ghost-color-picker{opacity:0;cursor:pointer;border:none;width:100%;height:100%;margin:0;padding:0;position:absolute;inset:0;overflow:hidden}.panel-theme-toggle{cursor:pointer;color:var(--text-sub);border-radius:8px;justify-content:center;align-items:center;padding:6px;transition:all .2s;display:flex}.panel-theme-toggle:hover{color:var(--primary-color);background:var(--overlay);transform:rotate(20deg)}.memo-container-dark-theme .panel-theme-toggle:hover{background:var(--glass)}[x-cloak]{display:none!important}.panel-theme-toggle svg{stroke-width:2px;width:20px;height:20px}.panel-mode-label{color:var(--text-main);font-size:15px;font-weight:600}.panel-mode-option{color:var(--text-sub);cursor:pointer;align-items:center;gap:6px;font-size:14px;display:flex}.panel-control-bar{align-items:center;gap:12px;padding:12px 0;display:flex}.panel-btn{border:1px solid var(--primary-color);background:var(--bg-main);color:var(--primary-color);cursor:pointer;border-radius:20px;padding:6px 16px;font-size:13px;font-weight:500;transition:all .2s}.panel-btn:hover{background:var(--primary-color);color:var(--text-inverse)}.panel-btn:disabled,.panel-btn.btn-disabled{background-color:var(--border-main);color:var(--text-sub);cursor:not-allowed;opacity:.8;transform:none}.panel-btn.btn-active{background:var(--primary-color);color:var(--text-inverse)}.panel-icon-btn{border:1px solid var(--primary-color);background:var(--bg-main);color:var(--primary-color);cursor:pointer;border-radius:18px;align-items:center;gap:6px;padding:6px 10px;font-size:12px;transition:all .2s;display:inline-flex}.panel-icon-btn svg{width:16px;height:16px}.panel-icon-btn:hover{background:var(--primary-color);color:var(--text-inverse)}.panel-icon-btn:disabled{background-color:var(--border-main);color:var(--text-sub);cursor:not-allowed;opacity:.8;transform:none}.panel-icon-text{font-size:12px}.panel-title{color:var(--text-main);flex-grow:1;font-size:16px;font-weight:700}.panel-search-box{border:1px solid var(--primary-color);background:var(--bg-sub);border-radius:18px;align-items:center;width:180px;padding:6px 10px;transition:all .2s;display:flex}.panel-search-box:focus-within{border-color:var(--primary-color);background:var(--bg-main);box-shadow:0 0 0 2px var(--primary-alpha)}.panel-search-form{align-items:center;width:100%;margin:0;display:flex}.panel-search-input{width:100%;color:var(--text-main);background:0 0;border:none;outline:none;font-size:14px}.panel-fuzzy-search-toggle{color:var(--text-sub);cursor:pointer;-webkit-user-select:none;user-select:none;white-space:nowrap;align-items:center;gap:4px;font-size:12px;display:inline-flex}.panel-fuzzy-search-toggle input[type=checkbox]{accent-color:var(--primary-color);cursor:pointer;width:14px;height:14px}.panel-fuzzy-search-toggle:hover{color:var(--primary-color)}.memo-container-dark-theme .panel-fuzzy-search-toggle{color:var(--text-sub)}.memo-container-dark-theme .panel-fuzzy-search-toggle:hover{color:var(--primary-color)}.panel-users-container{scrollbar-width:thin;scrollbar-color:var(--border-main) transparent;flex:1;margin-top:10px;padding-right:8px;overflow-y:auto}.panel-users-container::-webkit-scrollbar{width:6px}.panel-users-container::-webkit-scrollbar-thumb{background:var(--border-main);border-radius:10px}.panel-users-container::-webkit-scrollbar-thumb:hover{background:var(--border-main)}.memo-container-dark-theme .panel-container{background:var(--bg-main);border-top-color:var(--primary-color);--lightningcss-light: ;--lightningcss-dark:initial;color-scheme:dark;box-shadow:0 -6px 16px #00000080}.memo-container-dark-theme .panel-toggle-btn{background:var(--primary-color);color:var(--text-inverse)}.memo-container-dark-theme .panel-mode-label{color:var(--text-main)}.memo-container-dark-theme .panel-mode-option{color:var(--text-sub)}.memo-container-dark-theme .panel-btn{color:var(--primary-color);border-color:var(--primary-color);background:0 0}.memo-container-dark-theme .panel-btn:hover{background:var(--primary-color);color:var(--text-main)}.memo-container-dark-theme .panel-icon-btn{color:var(--primary-color);border-color:var(--primary-color);background:0 0}.memo-container-dark-theme .panel-icon-btn:hover{background:var(--primary-color);color:var(--text-main)}.memo-container-dark-theme .panel-search-box{background:var(--bg-sub);border:2px solid var(--primary-color)}.memo-container-dark-theme .panel-search-input{color:var(--text-main)}.memo-container-dark-theme .panel-users-container::-webkit-scrollbar-thumb{background:var(--border-main)}.memo-container-dark-theme .panel-users-container{scrollbar-color:var(--border-main) transparent}.memo-container-dark-theme .panel-title{color:var(--text-inverse)}.loading-spinner{animation:2s linear infinite spin;display:inline-block}@keyframes spin{0%{transform:rotate(0)}to{transform:rotate(360deg)}}.add-user-dialog{z-index:10000;background:0 0;border:none;justify-content:center;align-items:center;width:100%;max-width:100%;height:100%;max-height:100%;margin:0;padding:0;display:flex;position:fixed;inset:0}.add-user-dialog:not([open]){display:none}.add-user-dialog-backdrop{background:#00000080;justify-content:center;align-items:center;display:flex;position:absolute;inset:0}.add-user-dialog-content{background:var(--bg-main);border-radius:12px;width:90%;max-width:400px;overflow:hidden;box-shadow:0 8px 32px #0003}.add-user-dialog-header{border-bottom:1px solid var(--border-main);justify-content:space-between;align-items:center;padding:16px 20px;display:flex}.add-user-dialog-header h3{color:var(--text-main);margin:0;font-size:16px}.add-user-dialog-close{color:var(--text-sub);cursor:pointer;background:0 0;border:none;border-radius:6px;justify-content:center;align-items:center;width:32px;height:32px;padding:0;font-size:24px;transition:background .2s,color .2s;display:flex}.add-user-dialog-close:hover{background:var(--bg-sub);color:var(--text-main)}.add-user-dialog-body{flex-direction:column;gap:16px;padding:20px;display:flex}.add-user-field{flex-direction:column;gap:6px;display:flex}.add-user-field label{color:var(--text-main);font-size:13px;font-weight:500}.add-user-field .required{color:var(--danger-color)}.add-user-field input{border:1px solid var(--border-main);background:var(--bg-sub);color:var(--text-main);border-radius:8px;outline:none;padding:10px 12px;font-size:14px;transition:border-color .2s,box-shadow .2s}.add-user-field input:focus{border-color:var(--primary-color);box-shadow:0 0 0 3px var(--primary-alpha)}.add-user-field input::placeholder{color:var(--text-sub);opacity:.7}.add-user-dialog-footer{border-top:1px solid var(--border-main);justify-content:flex-end;gap:10px;padding:16px 20px;display:flex}.panel-btn-secondary{color:var(--text-sub);border-color:var(--border-main);background:0 0}.panel-btn-secondary:hover{background:var(--bg-sub);color:var(--text-main)}.memo-container-dark-theme .add-user-dialog-content{background:var(--bg-main)}.memo-container-dark-theme .add-user-field input{background:var(--bg-sub);color:var(--text-main)}.memo-container-dark-theme .add-user-dialog-close:hover{background:var(--overlay)}",
    );
    _css(
        "*{box-sizing:border-box}button,input{font-family:inherit}:root{--primary-color:#fb7299;--primary-alpha:#fb729926;--link-color:#00aeec;--bg-main:#fff;--bg-sub:#f6f8fa;--text-main:#333;--text-sub:#666;--text-inverse:#fff;--border-main:#d1d1d1;--shadow-elevated:0 4px 12px #00000026;--shadow-dark:0 8px 24px #0006;--overlay:#00000026;--glass:#ffffff59;--focus-color:#0366d6;--focus-ring:#0366d633;--danger-color:#d73a49;--danger-alpha:#d73a491a;--memo-tag-color:var(--custom-font-color,black);--memo-textarea-color:var(--custom-font-color,black);--memo-textarea-bg:var(--glass);--memo-textarea-border-color:var(--overlay);--memo-input-color:initial}.memo-container-dark-theme{--bg-main:#18181b;--bg-sub:#202024;--border-main:#2f2f33;--text-main:#e5e7eb;--text-sub:#a1a1aa;--link-color:#7dd3fc;--memo-tag-color:var(--custom-font-color,white);--memo-textarea-color:var(--custom-font-color,white);--memo-textarea-bg:var(--overlay);--memo-textarea-border-color:var(--glass);--memo-input-color:var(--text-main)}",
    );
    _css(
        '.panel-users-list{grid-template-columns:repeat(3,1fr);gap:10px;width:100%;display:grid}.panel-empty-state{color:var(--text-sub);grid-column:1/-1;justify-content:center;align-items:center;padding:24px 12px;font-size:14px;display:flex}.panel-loading-state{min-height:120px;color:var(--text-sub);justify-content:center;align-items:center;font-size:14px;display:flex}.user-box{background:var(--bg-main);border:1px solid var(--border-main);width:100%;height:72px;box-shadow:var(--shadow-elevated);box-sizing:border-box;border-radius:8px;flex-wrap:nowrap;align-items:center;padding:0 12px;transition:all .2s;display:flex;position:relative}.user-box:hover{border-color:var(--primary-color);background:var(--primary-alpha)}.user-box.is-selected{border-color:var(--primary-color);box-shadow:0 0 0 2px var(--primary-alpha)}.user-box.multi-select{cursor:pointer}.user-select{cursor:pointer;flex-shrink:0;justify-content:center;align-items:center;width:18px;height:18px;margin-right:8px;display:inline-flex}.user-select input{opacity:0;pointer-events:none;position:absolute}.user-select-mark{border:1px solid var(--border-main);background:var(--bg-main);width:16px;height:16px;box-shadow:var(--shadow-elevated);border-radius:4px}.memo-container-dark-theme .user-select-mark{background:var(--bg-sub);border-color:var(--text-sub);box-shadow:var(--shadow-dark)}.user-select input:checked+.user-select-mark{border-color:var(--primary-color);background:var(--primary-color);box-shadow:0 0 0 2px var(--primary-alpha)}.user-select input:checked+.user-select-mark:after{content:"";border-bottom:2px solid #fff;border-left:2px solid #fff;width:8px;height:4px;display:block;transform:translate(3px,4px)rotate(-45deg)}.user-avatar-wrapper{border-radius:50%;flex-shrink:0;width:44px;height:44px;margin-right:10px;overflow:hidden}.user-avatar{object-fit:cover;width:100%;height:100%}.user-info-section{flex-direction:column;flex-shrink:0;width:85px;display:flex;position:relative}.user-nickname-section{flex-direction:column;flex:1.5;min-width:0;padding:0 8px;display:flex}.user-nickname-link{color:var(--link-color);white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:600;text-decoration:none;overflow:hidden}.user-nickname-link.is-deleted{color:var(--text-secondary);cursor:not-allowed;opacity:.7;text-decoration:line-through}.user-note-section{flex-direction:column;flex:1;align-items:flex-start;min-width:0;display:flex}.user-info-label{color:var(--text-main);margin-bottom:2px;font-size:12px}.user-id{white-space:nowrap;text-overflow:ellipsis;cursor:pointer;width:100%;font-family:monospace;font-size:12px;transition:background .2s;display:block;overflow:hidden}.user-id.can-expand:hover{z-index:100;background-color:var(--bg-main);width:fit-content;box-shadow:var(--shadow-elevated);border:10px solid #0000;border-radius:4px;margin:-10px;padding:2px 8px;position:absolute;overflow:visible}.user-note-input{width:100%;color:var(--custom-font-color,var(--primary-color));cursor:pointer;background:0 0;border:none;border-bottom:2px dashed #0000;outline:none;padding:0;font-size:13px;transition:all .2s}.user-note-input:hover{border-bottom-color:var(--primary-alpha)}.user-note-input.editing{cursor:text;background:var(--primary-alpha);border-bottom:2px solid var(--primary-color)}@media (width<=1200px){.panel-users-list{grid-template-columns:repeat(2,1fr)}}@media (width<=768px){.panel-users-list{grid-template-columns:1fr}.user-box{height:65px}}.memo-container-dark-theme .user-box{background:var(--bg-sub);border-color:var(--border-main);box-shadow:none}.memo-container-dark-theme .user-box:hover{background:var(--bg-sub);border-color:var(--primary-color)}.memo-container-dark-theme .user-nickname-link{color:var(--link-color)}.memo-container-dark-theme .user-info-label,.memo-container-dark-theme .user-id{color:var(--text-sub)}.memo-container-dark-theme .user-id.can-expand:hover{background-color:var(--bg-sub);color:var(--text-inverse);box-shadow:var(--shadow-dark)}.memo-container-dark-theme .user-note-input{color:var(--custom-font-color,var(--primary-color))}.memo-container-dark-theme .user-note-input.editing{background:var(--primary-alpha)}.memo-container-dark-theme .user-select input:checked+.user-select-mark{border-color:var(--primary-color);background:var(--primary-color);box-shadow:0 0 0 2px var(--primary-alpha)}.delete-btn{width:16px;height:16px;color:var(--primary-color);cursor:pointer;z-index:10;position:absolute;top:5px;right:5px}.delete-btn:hover{stroke:var(--danger-color)}',
    );
    var _GM_addValueChangeListener =
            "undefined" != typeof GM_addValueChangeListener
                ? GM_addValueChangeListener
                : void 0,
        _GM_getValue = "undefined" != typeof GM_getValue ? GM_getValue : void 0,
        _GM_registerMenuCommand =
            "undefined" != typeof GM_registerMenuCommand
                ? GM_registerMenuCommand
                : void 0,
        _GM_setValue = "undefined" != typeof GM_setValue ? GM_setValue : void 0,
        _unsafeWindow =
            "undefined" != typeof unsafeWindow ? unsafeWindow : void 0,
        RawRule = class {
            constructor(init) {
                Object.assign(this, init);
            }
            name;
            styleScope;
            aSelector;
            textSelector;
            trigger;
            markProcessed;
            matchByName;
            dynamicWatch;
            uidResolver;
            originalNameResolver;
            get injectMode() {
                return this.trigger ? 2 : 1;
            }
        },
        isStaticMode = (rule) => 1 === rule.injectMode,
        isDynamicMode = (rule) => 2 === rule.injectMode,
        PREFIX = "[Bili-User-Memo]",
        logger_info = (msg, ...args) => {
            console.log(
                `%c${PREFIX}%c`,
                "background: #9e9e9e; color: white; background: #2196F3; padding: 2px 4px; border-radius: 3px; font-weight: bold;",
                "",
                msg,
                ...args,
            );
        },
        logger_error = (msg, ...args) => {
            console.error(
                `%c${PREFIX}%c`,
                "background: #9e9e9e; color: white; background: #2196F3; padding: 2px 4px; border-radius: 3px; font-weight: bold;",
                "",
                msg,
                ...args,
            );
        },
        logger_warn = (msg, ...args) => {
            console.warn(
                `%c${PREFIX}%c`,
                "background: #9e9e9e; color: white; background: #2196F3; padding: 2px 4px; border-radius: 3px; font-weight: bold;",
                "",
                msg,
                ...args,
            );
        },
        DIRECT_UID_ATTRS = [
            "data-user-profile-id",
            "bilisponsor-userid",
            "data-oid",
        ],
        SPACE_UID_REGEX =
            /(?:space\.bilibili\.com|www\.bilibili\.com\/list)\/(\d+)/,
        UID_STRATEGIES = [
            function (el) {
                return (
                    parseUidFromDataId(getAttr(el, "data-id")) ||
                    (function (el, names) {
                        for (const name of names) {
                            const value = getAttr(el, name);
                            if (value) return value;
                        }
                        return null;
                    })(el, DIRECT_UID_ATTRS)
                );
            },
            function (el) {
                const root = el.closest("div.bili-dyn-item__main");
                return root
                    ? getAttrFromQuery(
                          root,
                          "[bilisponsor-userid]",
                          "bilisponsor-userid",
                      ) ||
                          getAttrFromQuery(
                              root.parentElement,
                              "[data-user-profile-id]",
                              "data-user-profile-id",
                          ) ||
                          parseUidFromDataId(
                              getAttrFromQuery(root, "[data-id]", "data-id"),
                          )
                    : null;
            },
            function (el) {
                const href = el.getAttribute("href") || location.href;
                return href
                    ? normalizeUid(href.match(SPACE_UID_REGEX)?.[1])
                    : null;
            },
        ],
        COMMON_REG = /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
        r = (rule) => new RawRule(rule),
        config = [
            {
                urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
                rule: r({
                    name: "视频页面",
                    styleScope: 2,
                    aSelector: ".up-name",
                }),
            },
            {
                urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
                rule: r({
                    name: "视频页面-Staff",
                    styleScope: 1,
                    aSelector: "a.staff-name",
                }),
            },
            {
                urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
                rule: r({
                    name: "视频页面-推荐",
                    styleScope: 1,
                    aSelector: ".upname a",
                    textSelector: "span.name",
                    trigger: { watch: ".rcmd-tab", interval: 1e3 },
                }),
            },
            {
                urlPattern: /^https:\/\/space\.bilibili\.com\/.*/,
                rule: r({
                    name: "空间",
                    styleScope: 2,
                    aSelector: ".nickname",
                }),
            },
            {
                urlPattern:
                    /^https:\/\/space\.bilibili\.com\/\d+\/relation\/(follow|fans)(?:[/?#].*)?$/,
                rule: r({
                    name: "空间关注/粉丝",
                    styleScope: 2,
                    aSelector: "a.relation-card-info__uname",
                    trigger: { watch: "main.space-main", interval: 1e3 },
                }),
            },
            {
                urlPattern:
                    /^https:\/\/space\.bilibili\.com\/\d+\/favlist\?(?=[^#]*\bfid=\d+\b)(?=[^#]*\bftype=create\b)[^#]*(?:#.*)?$/,
                rule: r({
                    name: "空间收藏夹",
                    styleScope: 1,
                    aSelector: ".bili-video-card__author",
                    textSelector: ".bili-video-card__text span[title]",
                    trigger: { watch: ".favlist-main", interval: 1e3 },
                }),
            },
            {
                urlPattern:
                    /^https:\/\/www\.bilibili\.com\/watchlater\/list(?:\?[^#]*)?(?:#.*)?$/,
                rule: r({
                    name: "稍后再看",
                    styleScope: 1,
                    aSelector: ".bili-video-card__author",
                    textSelector: ".bili-video-card__text span[title]",
                    trigger: { watch: "body", interval: 1e3 },
                }),
            },
            {
                urlPattern:
                    /^https:\/\/www\.bilibili\.com\/?(?:\?[^#]*)?(?:#.*)?$/,
                rule: r({
                    name: "首页",
                    styleScope: 1,
                    aSelector:
                        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
                    textSelector:
                        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
                    trigger: { watch: "#app", interval: 1e3 },
                }),
            },
            {
                urlPattern:
                    /^https:\/\/search\.bilibili\.com\/(?:all|video|bangumi|pgc|live|article|user)(?:\?[^#]*)?(?:#.*)?$/,
                rule: r({
                    name: "搜索",
                    styleScope: 1,
                    aSelector:
                        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name, a.flex_start.flex_inline",
                    textSelector:
                        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text, span.lh_xs",
                }),
            },
            {
                urlPattern:
                    /^https:\/\/www\.bilibili\.com\/v\/popular\/?(?:\?[^#]*)?(?:#.*)?$/,
                rule: r({
                    name: "热门",
                    styleScope: 1,
                    aSelector:
                        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
                    textSelector:
                        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
                    trigger: { watch: "#app", interval: 1e3 },
                }),
            },
            {
                urlPattern:
                    /^https:\/\/www\.bilibili\.com\/v\/[a-z]+\/?(?:\?[^#]*)?(?:#.*)?$/,
                rule: r({
                    name: "分区",
                    styleScope: 1,
                    aSelector:
                        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
                    textSelector:
                        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
                    trigger: { watch: "#app", interval: 1e3 },
                }),
            },
            {
                urlPattern:
                    /^https:\/\/www\.bilibili\.com\/c\/[a-z0-9_-]+\/?(?:\?[^#]*)?(?:#.*)?$/,
                rule: r({
                    name: "频道",
                    styleScope: 1,
                    aSelector:
                        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
                    textSelector:
                        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
                    trigger: { watch: "#app", interval: 1e3 },
                }),
            },
            {
                urlPattern: COMMON_REG,
                rule: r({
                    name: "评论区",
                    styleScope: 2,
                    aSelector: "#user-name a",
                    trigger: { watch: "div#contents", interval: 1e3 },
                    dynamicWatch: !0,
                }),
            },
            {
                urlPattern:
                    /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?whisper(?:\/|$)/,
                rule: r({
                    name: "私信-侧边栏",
                    styleScope: 1,
                    aSelector: 'div[data-id^="contact"]',
                    textSelector: 'div[class*="_SessionItem__Name"]',
                    trigger: {
                        watch: 'div[class^="_Sidebar_"]',
                        interval: 1e3,
                    },
                    uidResolver: (el) =>
                        el
                            .closest('[data-id^="contact_"]')
                            ?.getAttribute("data-id")
                            ?.split("_")?.[1] || null,
                }),
            },
            {
                urlPattern:
                    /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?whisper(?:\/|$)/,
                rule: r({
                    name: "私信-当前",
                    styleScope: 1,
                    textSelector: 'div[class^="_ContactName_"]',
                    trigger: {
                        watch: 'div[class^="_ChatHeader_"]',
                        interval: 1e3,
                    },
                    markProcessed: !1,
                    uidResolver: () =>
                        window.location.href.match(
                            /#\/whisper\/mid(\d+)/,
                        )?.[1] || null,
                    originalNameResolver: () => {
                        const uid =
                            window.location.href.match(
                                /#\/whisper\/mid(\d+)/,
                            )?.[1];
                        if (!uid) return null;
                        const sessionName = document.querySelector(
                            `[data-id="contact_${uid}"] div[class*="_SessionItem__Name"]`,
                        );
                        return (
                            sessionName?.dataset.biliOriginal?.trim() ||
                            sessionName?.textContent?.trim() ||
                            null
                        );
                    },
                }),
            },
            {
                urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic\/*/,
                rule: r({
                    name: "个人空间动态",
                    styleScope: 1,
                    aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
                    trigger: { watch: ".bili-dyn-list", interval: 1e3 },
                }),
            },
            {
                urlPattern:
                    /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?(?:reply|love|at)(?:\/|$)/,
                rule: r({
                    name: "回复/赞/AT",
                    styleScope: 1,
                    aSelector: "a.interaction-item__uname",
                    trigger: { watch: "div.message-content", interval: 1e3 },
                }),
            },
            {
                urlPattern: /^https:\/\/t\.bilibili\.com\/.*/,
                rule: r({
                    name: "动态页",
                    styleScope: 2,
                    textSelector: "span.bili-dyn-title__text",
                    trigger: {
                        watch: "div.bili-dyn-item__main",
                        interval: 1e3,
                    },
                    dynamicWatch: !0,
                    uidResolver: (el) =>
                        (function (el) {
                            return normalizeUid(el?.__vue__?.author?.mid);
                        })(el.parentElement),
                }),
            },
            {
                urlPattern: COMMON_REG,
                rule: r({
                    name: "最近-UP动态",
                    styleScope: 2,
                    aSelector: "div.user-name a",
                    trigger: {
                        watch: "div.header-content-panel",
                        interval: 1e3,
                    },
                }),
            },
            {
                urlPattern: COMMON_REG,
                rule: r({
                    name: "最近-收藏夹",
                    styleScope: 1,
                    aSelector: "span.header-fav-card__info--name",
                    textSelector: "span.header-fav-card__info--name span",
                    trigger: {
                        watch: "div.favorite-panel-popover",
                        interval: 1e3,
                    },
                }),
            },
            {
                urlPattern: COMMON_REG,
                rule: r({
                    name: "最近-历史",
                    styleScope: 2,
                    textSelector: "div.header-history-card__info--name span",
                    trigger: {
                        watch: "div.history-panel-popover",
                        interval: 1e3,
                    },
                    matchByName: !0,
                }),
            },
            {
                urlPattern: COMMON_REG,
                rule: r({
                    name: "最近-正在直播",
                    styleScope: 1,
                    aSelector: "a.up-item",
                    textSelector: "div.up-name",
                    trigger: { watch: "div.living-up-list", interval: 1e3 },
                    matchByName: !0,
                }),
            },
            {
                urlPattern: /^https:\/\/www\.bilibili\.com\/opus\/\d+/,
                rule: r({
                    name: "新版动态",
                    styleScope: 2,
                    aSelector: "div.opus-module-author__name",
                    uidResolver: async (el) => {
                        let rawUid = getOpusAuthorUid(el);
                        if (!rawUid) {
                            await waitUntil(
                                () => Boolean(getOpusAuthorUid(el)),
                                { intervalMs: 200, timeoutMs: 1e4 },
                            );
                            rawUid = getOpusAuthorUid(el);
                        }
                        return rawUid;
                    },
                }),
            },
            {
                urlPattern: /^https:\/\/t\.bilibili\.com\/\d+/,
                rule: r({
                    name: "动态-转发",
                    styleScope: 1,
                    aSelector: "span.dyn-orig-author__name",
                    uidResolver: (el) => el._profile.uid,
                }),
            },
            {
                urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic/,
                rule: r({
                    name: "用户空间动态-转发",
                    styleScope: 1,
                    aSelector: "span.dyn-orig-author__name",
                    trigger: { watch: "bili-dyn-content__orig", interval: 1e3 },
                    dynamicWatch: !0,
                    uidResolver: (el) => el._profile.uid,
                }),
            },
            {
                urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic/,
                rule: r({
                    name: "用户空间动态-点赞",
                    styleScope: 1,
                    aSelector: 'span[data-module="desc"]',
                    trigger: {
                        watch: "div.bili-dyn-interaction__item",
                        interval: 1e3,
                    },
                    dynamicWatch: !0,
                }),
            },
            {
                urlPattern:
                    /^https:\/\/search\.bilibili\.com\/(all|live|upuser）?.+)/,
                rule: r({
                    name: "搜索页面-UP主",
                    styleScope: 2,
                    aSelector: "a.user-name, a.p_relative, a.live-title",
                }),
            },
        ],
        DEFAULT_AVATAR_URL =
            "https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif",
        MATCH_BY_NAME_IGNORED_NAMES = new Set(["账号已注销"]),
        userStore = new (class {
            users = [];
            _displayMode = 2;
            listeners = new Set();
            constructor() {
                this.refreshData();
                this.listenToRemoteChanges();
            }
            refreshData() {
                const { raw: rawUsers, users: nextUsers } = (function () {
                        const raw = getGmValue("biliUsers", []);
                        return { raw: raw, users: normalizeUsers(raw) };
                    })(),
                    nextDisplayMode = normalizeDisplayMode(
                        getGmValue("displayMode", 2),
                    ),
                    usersChanged = !usersEqual(this.users, nextUsers),
                    modeChanged = this._displayMode !== nextDisplayMode;
                this.users = nextUsers;
                this._displayMode = nextDisplayMode;
                Array.isArray(rawUsers) &&
                    this.users.length !== rawUsers.length &&
                    saveUsersToStorage(this.users);
                (usersChanged || modeChanged) &&
                    this.emit({
                        type: "full",
                        users: this.getUsers(),
                        displayMode: this._displayMode,
                        reason: "refresh",
                    });
            }
            listenToRemoteChanges() {
                _GM_addValueChangeListener(
                    "biliUsers",
                    (_name, _oldValue, newValue, remote) => {
                        remote && this.applyRemoteUsers(newValue);
                    },
                );
                _GM_addValueChangeListener(
                    "displayMode",
                    (_name, _oldValue, newValue, remote) => {
                        remote && this.applyRemoteDisplayMode(newValue);
                    },
                );
            }
            applyRemoteUsers(rawUsers) {
                try {
                    const nextUsers = normalizeUsers(rawUsers),
                        diff = (function (previous, next) {
                            if (usersEqual(previous, next))
                                return {
                                    changedIds: [],
                                    hasContentChanges: !1,
                                    orderOnly: !1,
                                    rescanMatchByName: !1,
                                };
                            const previousMap = new Map(
                                    previous.map((user) => [user.id, user]),
                                ),
                                nextMap = new Map(
                                    next.map((user) => [user.id, user]),
                                ),
                                changedIds = new Set();
                            let hasContentChanges = !1,
                                rescanMatchByName = !1;
                            next.forEach((user) => {
                                const existing = previousMap.get(user.id);
                                if (existing) {
                                    if (
                                        (a = existing).id !== (b = user).id ||
                                        a.nickname !== b.nickname ||
                                        a.avatar !== b.avatar ||
                                        a.memo !== b.memo
                                    ) {
                                        var a, b;
                                        changedIds.add(user.id);
                                        hasContentChanges = !0;
                                        existing.nickname !== user.nickname &&
                                            (rescanMatchByName = !0);
                                    }
                                } else {
                                    changedIds.add(user.id);
                                    hasContentChanges = !0;
                                    rescanMatchByName = !0;
                                }
                            });
                            previous.forEach((user) => {
                                if (!nextMap.has(user.id)) {
                                    changedIds.add(user.id);
                                    hasContentChanges = !0;
                                }
                            });
                            return {
                                changedIds: Array.from(changedIds),
                                hasContentChanges: hasContentChanges,
                                orderOnly: !hasContentChanges,
                                rescanMatchByName: rescanMatchByName,
                            };
                        })(this.users, nextUsers);
                    if (!diff.hasContentChanges && !diff.orderOnly) return;
                    this.users = nextUsers;
                    if (diff.orderOnly) {
                        this.emitUsers("remote");
                        return;
                    }
                    this.emitUsers(
                        "remote",
                        diff.changedIds,
                        diff.rescanMatchByName,
                    );
                } catch (error) {
                    logger_error("同步外部数据失败", error);
                }
            }
            applyRemoteDisplayMode(rawMode) {
                const nextMode = normalizeDisplayMode(rawMode);
                if (nextMode !== this._displayMode) {
                    this._displayMode = nextMode;
                    this.emitDisplayMode("remote");
                }
            }
            get displayMode() {
                return this._displayMode;
            }
            getUsers() {
                return this.users.map((u) => ({ ...u }));
            }
            subscribe(listener) {
                this.listeners.add(listener);
                return () => this.listeners.delete(listener);
            }
            setDisplayMode(mode) {
                const nextMode = normalizeDisplayMode(mode);
                if (nextMode !== this._displayMode) {
                    this._displayMode = nextMode;
                    !(function (mode) {
                        setGmValue("displayMode", mode);
                    })(nextMode);
                    this.emitDisplayMode("update");
                }
            }
            ensureUser(uid, originalName) {
                return (
                    this.users.find((u) => u.id === uid) || {
                        id: uid,
                        nickname: originalName || uid,
                        avatar: DEFAULT_AVATAR_URL,
                        memo: "",
                    }
                );
            }
            findUserByName(name) {
                return (function (users, name) {
                    const trimmedName = name.trim();
                    if (!trimmedName) return { reason: "none" };
                    if (MATCH_BY_NAME_IGNORED_NAMES.has(trimmedName))
                        return { reason: "ignored" };
                    let matchedUser,
                        matchCount = 0;
                    users.forEach((user) => {
                        if (user.nickname === trimmedName) {
                            matchCount++;
                            1 === matchCount && (matchedUser = user);
                        }
                    });
                    return 0 === matchCount
                        ? { reason: "none" }
                        : matchCount > 1
                          ? { reason: "ambiguous" }
                          : { user: matchedUser, reason: "unique" };
                })(this.users, name).user;
            }
            getUserMemo(uid) {
                const user = this.users.find((u) => u.id === uid);
                if (!user) return null;
                const memo = String(user.memo ?? "").trim();
                return "" === memo ? null : memo;
            }
            updateUser(uid, updates, fallbackName = "") {
                if (!uid) return !1;
                const userIndex = this.findUserIndex(uid),
                    existing = -1 === userIndex ? null : this.users[userIndex],
                    nextMemo = this.resolveNextMemo(existing, updates);
                if (!existing)
                    return this.createUserIfNeeded(
                        uid,
                        updates,
                        fallbackName,
                        nextMemo,
                    );
                if (!nextMemo) return this.removeExistingUser(uid, userIndex);
                const nextNickname =
                        void 0 !== updates.nickname
                            ? updates.nickname.trim()
                            : existing.nickname,
                    nextAvatar =
                        void 0 !== updates.avatar
                            ? updates.avatar
                            : existing.avatar;
                if (
                    existing.memo === nextMemo &&
                    existing.nickname === nextNickname &&
                    existing.avatar === nextAvatar
                )
                    return !1;
                existing.memo = nextMemo;
                existing.nickname = nextNickname || uid;
                existing.avatar = nextAvatar;
                this.commitUsers("update", [uid]);
                logger_info(`📝 备注已更新 | UID:${uid} -> ${nextMemo}`);
                return !0;
            }
            updateUserMemo(uid, newMemo, fallbackName = "") {
                return this.updateUser(uid, { memo: newMemo }, fallbackName);
            }
            findUserIndex(uid) {
                return this.users.findIndex((u) => u.id === uid);
            }
            resolveNextMemo(existing, updates) {
                return void 0 !== updates.memo
                    ? updates.memo.trim()
                    : (existing?.memo || "").trim();
            }
            createUserIfNeeded(uid, updates, fallbackName, nextMemo) {
                if (!nextMemo) return !1;
                this.users.push({
                    id: uid,
                    nickname: (updates.nickname || fallbackName || uid).trim(),
                    avatar: updates.avatar ?? getUserAvatarFromDOM(uid),
                    memo: nextMemo,
                });
                this.commitUsers("update", [uid]);
                logger_info(`📝 备注已更新 | UID:${uid} -> ${nextMemo}`);
                return !0;
            }
            removeExistingUser(uid, userIndex) {
                this.users.splice(userIndex, 1);
                this.commitUsers("remove", [uid]);
                logger_info(`🗑️ 备注清空，已删除用户记录 | UID:${uid}`);
                return !0;
            }
            removeUser(uid) {
                if (!uid) return !1;
                const index = this.users.findIndex((u) => u.id === uid);
                if (-1 === index) return !1;
                this.users.splice(index, 1);
                this.commitUsers("remove", [uid]);
                return !0;
            }
            removeUsers(ids) {
                const idSet = new Set(ids.filter(Boolean));
                if (0 === idSet.size) return 0;
                const before = this.users.length;
                this.users = this.users.filter((u) => !idSet.has(u.id));
                const removed = before - this.users.length;
                removed > 0 && this.commitUsers("remove", Array.from(idSet));
                return removed;
            }
            upsertImportedUsers(importedUsers) {
                const normalized = normalizeUsers(importedUsers);
                if (0 === normalized.length) return { added: 0, updated: 0 };
                let added = 0,
                    updated = 0;
                const changedIds = [],
                    userMap = new Map(this.users.map((u) => [u.id, u]));
                normalized.forEach((incoming) => {
                    const existing = userMap.get(incoming.id);
                    if (!existing) {
                        this.users.push({ ...incoming });
                        userMap.set(
                            incoming.id,
                            this.users[this.users.length - 1],
                        );
                        added++;
                        changedIds.push(incoming.id);
                        return;
                    }
                    let finalAvatar = incoming.avatar;
                    isNoFaceAvatar(incoming.avatar) &&
                        !isNoFaceAvatar(existing.avatar) &&
                        (finalAvatar = existing.avatar);
                    if (
                        existing.nickname !== incoming.nickname ||
                        existing.avatar !== finalAvatar ||
                        existing.memo !== incoming.memo ||
                        existing.isDeleted !== incoming.isDeleted
                    ) {
                        existing.nickname = incoming.nickname;
                        existing.avatar = finalAvatar;
                        existing.memo = incoming.memo;
                        void 0 !== incoming.isDeleted &&
                            (existing.isDeleted = incoming.isDeleted);
                        updated++;
                        changedIds.push(incoming.id);
                    }
                });
                (added > 0 || updated > 0) &&
                    this.commitUsers("import", changedIds, !0);
                return { added: added, updated: updated };
            }
            updateUserProfiles(profiles) {
                if (0 === profiles.length) return 0;
                let updatedCount = 0;
                const changedIds = [],
                    userMap = new Map(this.users.map((u) => [u.id, u]));
                profiles.forEach((profile) => {
                    const target = userMap.get(profile.id);
                    if (!target) return;
                    let finalAvatar = profile.avatar;
                    isNoFaceAvatar(profile.avatar) &&
                        !isNoFaceAvatar(target.avatar) &&
                        (finalAvatar = target.avatar);
                    if (
                        target.nickname !== profile.nickname ||
                        target.avatar !== finalAvatar ||
                        target.isDeleted !== profile.isDeleted
                    ) {
                        target.nickname = profile.nickname || target.nickname;
                        target.avatar = finalAvatar;
                        void 0 !== profile.isDeleted &&
                            (target.isDeleted = profile.isDeleted);
                        updatedCount++;
                        changedIds.push(profile.id);
                    }
                });
                updatedCount > 0 && this.commitUsers("profile", changedIds);
                return updatedCount;
            }
            commitUsers(
                reason,
                changedIds = [],
                rescanMatchByName = "import" === reason,
            ) {
                saveUsersToStorage(this.users);
                this.emitUsers(reason, changedIds, rescanMatchByName);
            }
            emitUsers(reason, changedIds = [], rescanMatchByName = !1) {
                this.emit({
                    type: "users",
                    users: this.getUsers(),
                    reason: reason,
                    changedIds: changedIds,
                    rescanMatchByName: rescanMatchByName,
                });
            }
            emitDisplayMode(reason) {
                this.emit({
                    type: "displayMode",
                    displayMode: this._displayMode,
                    reason: reason,
                });
            }
            emit(change) {
                this.listeners.forEach((listener) => {
                    try {
                        listener(change);
                    } catch (error) {
                        logger_error("UserStore 监听器执行失败", error);
                    }
                });
            }
        })(),
        BILI_MEMO_OWNED_SELECTOR = "[data-bili-memo-owned]",
        GLOBAL_STYLE_SHEET = new CSSStyleSheet();
    GLOBAL_STYLE_SHEET.replaceSync(
        ".editable-textarea{font-size:var(--auto-detected-font-size,13px);width:fit-content;min-width:4ic;color:var(--memo-textarea-color);white-space:nowrap;background:var(--memo-textarea-bg);border:none;border-bottom:2px solid var(--memo-textarea-border-color);text-shadow:0 1px 2px var(--overlay);opacity:.85;text-align:center;border-radius:6px 6px 0 0;outline:none;margin-right:8px;padding:0 6px;transition:border-color .2s,background .2s,opacity .2s;display:inline-block}.editable-textarea,.bili-memo-tag,.bili-memo-input{box-sizing:border-box;height:max(21px,1em + 6px);min-height:max(21px,1em + 6px);line-height:max(19px,1em + 4px)}.editable-textarea:hover{opacity:1;background:color-mix(in srgb, var(--memo-textarea-bg), white 20%)}.bili-memo-tag{cursor:pointer;vertical-align:middle;color:var(--memo-tag-color);font-size:inherit;padding:0 6px;display:inline-block}.bili-memo-input{background:var(--bg-main);border:1px solid var(--primary-color);font-size:var(--auto-detected-font-size,13px);vertical-align:middle;color:var(--memo-input-color);border-radius:4px;outline:none;margin:0;padding:0 4px}",
    );
    var fn,
        CUSTOM_MEMO_STYLE_SHEET = null,
        fontSizeCache = new (class {
            cache = new Map();
            generateCacheKey(element, rule) {
                if (rule) {
                    const parts = [];
                    rule.aSelector && parts.push(`a:${rule.aSelector}`);
                    rule.textSelector && parts.push(`t:${rule.textSelector}`);
                    if (parts.length > 0) return parts.join("|");
                }
                const fallbackParts = [];
                element.id && fallbackParts.push(`id:${element.id}`);
                if (element.className && "string" == typeof element.className) {
                    const classes = element.className
                        .split(/\s+/)
                        .filter(Boolean)
                        .sort();
                    classes.length > 0 &&
                        fallbackParts.push(`class:${classes.join(".")}`);
                }
                return 0 === fallbackParts.length
                    ? ""
                    : fallbackParts.join(".");
            }
            getOrDetect(element, rule) {
                const cacheKey = this.generateCacheKey(element, rule);
                if (!cacheKey) return getComputedStyle(element).fontSize;
                const cached = this.cache.get(cacheKey);
                if (cached) return cached;
                const fontSize = getComputedStyle(element).fontSize;
                this.cache.set(cacheKey, fontSize);
                return fontSize;
            }
        })(),
        wrapperCache = new WeakMap(),
        DynamicRuleWatcher = class DynamicRuleWatcher {
            rule;
            onTrigger;
            static originalAttachShadow = Element.prototype.attachShadow;
            static attachShadowPatched = !1;
            static attachShadowListeners = new Set();
            legacyObserver = null;
            legacyPollTimer = null;
            legacyIdlePending = !1;
            discoveryObservers = new Map();
            instanceObservers = new Map();
            instanceIdlePending = new WeakSet();
            handleShadowAttached = (shadowRoot) => {
                this.observeDiscoveryScope(shadowRoot);
                this.scanAndAttachNewTargets();
            };
            constructor(rule, onTrigger) {
                this.rule = rule;
                this.onTrigger = onTrigger;
            }
            start() {
                this.rule.dynamicWatch
                    ? this.startGlobalWatch()
                    : this.tryAttachOrPollLegacy();
            }
            stop() {
                if (this.legacyPollTimer) {
                    clearInterval(this.legacyPollTimer);
                    this.legacyPollTimer = null;
                }
                if (this.legacyObserver) {
                    this.legacyObserver.disconnect();
                    this.legacyObserver = null;
                }
                this.legacyIdlePending = !1;
                this.unregisterAttachShadowListener();
                this.discoveryObservers.forEach((observer) =>
                    observer.disconnect(),
                );
                this.discoveryObservers.clear();
                this.instanceObservers.forEach(({ observer: observer }) =>
                    observer.disconnect(),
                );
                this.instanceObservers.clear();
            }
            startGlobalWatch() {
                this.registerAttachShadowListener();
                this.observeDiscoveryScope(document);
                this.scanAndAttachNewTargets();
            }
            static ensureAttachShadowPatched() {
                if (DynamicRuleWatcher.attachShadowPatched) return;
                const originalAttachShadow =
                    DynamicRuleWatcher.originalAttachShadow;
                Element.prototype.attachShadow = function (init) {
                    const shadowRoot = originalAttachShadow.call(this, init);
                    for (const listener of DynamicRuleWatcher.attachShadowListeners)
                        try {
                            listener(shadowRoot);
                        } catch (error) {}
                    return shadowRoot;
                };
                DynamicRuleWatcher.attachShadowPatched = !0;
            }
            registerAttachShadowListener() {
                DynamicRuleWatcher.ensureAttachShadowPatched();
                DynamicRuleWatcher.attachShadowListeners.add(
                    this.handleShadowAttached,
                );
            }
            unregisterAttachShadowListener() {
                DynamicRuleWatcher.attachShadowListeners.delete(
                    this.handleShadowAttached,
                );
            }
            observeDiscoveryScope(scope) {
                if (this.discoveryObservers.has(scope)) return;
                const observer = new MutationObserver((mutations) => {
                    const {
                        hasAddedNodes: hasAddedNodes,
                        hasRemovedNodes: hasRemovedNodes,
                    } = shouldHandleDiscoveryMutations(mutations);
                    if (hasAddedNodes) {
                        this.scanAndAttachNewTargets();
                        this.bridgeShadowMutationsToWatchScopes(scope);
                    }
                    if (hasRemovedNodes) {
                        this.cleanupDetachedTargets();
                        this.cleanupDetachedDiscoveryScopes();
                    }
                });
                observer.observe(scope, { childList: !0, subtree: !0 });
                this.discoveryObservers.set(scope, observer);
                this.discoverShadowScopes(scope);
            }
            discoverShadowScopes(scope) {
                scope
                    .querySelectorAll("*")
                    .forEach((element) => this.observeHostShadowScope(element));
            }
            observeHostShadowScope(element) {
                const shadowRoot = element.shadowRoot;
                shadowRoot && this.observeDiscoveryScope(shadowRoot);
            }
            scanAndAttachNewTargets() {
                const targets = querySelectorAllDeep$1(this.rule.trigger.watch);
                0 !== targets.length &&
                    targets.forEach((target) => {
                        const scope = resolveWatchScope(target),
                            keyNode = target,
                            current = this.instanceObservers.get(keyNode);
                        if (current) {
                            if (current.scope !== scope) {
                                current.observer.disconnect();
                                this.attachInstanceWatcher(keyNode, scope);
                            }
                        } else this.attachInstanceWatcher(keyNode, scope);
                    });
            }
            createScopeObserver(keyNode, scope) {
                const observer = new MutationObserver((mutations) => {
                    if (
                        shouldHandleDiscoveryMutations(mutations)
                            .hasAddedNodes &&
                        !this.instanceIdlePending.has(keyNode)
                    ) {
                        this.instanceIdlePending.add(keyNode);
                        this.onTrigger(this.rule, scope);
                        this.instanceIdlePending.delete(keyNode);
                    }
                });
                observer.observe(scope, { childList: !0, subtree: !0 });
                return observer;
            }
            bridgeShadowMutationsToWatchScopes(scope) {
                if (
                    scope instanceof ShadowRoot &&
                    0 !== this.instanceObservers.size
                )
                    for (const {
                        scope: watchScope,
                    } of this.instanceObservers.values())
                        (watchScope instanceof ShadowRoot &&
                            watchScope === scope) ||
                            (isNodeInsideScope(scope, watchScope) &&
                                this.onTrigger(this.rule, watchScope));
            }
            attachInstanceWatcher(keyNode, scope) {
                const observer = this.createScopeObserver(keyNode, scope);
                this.instanceObservers.set(keyNode, {
                    observer: observer,
                    scope: scope,
                });
                this.onTrigger(this.rule, scope);
            }
            cleanupDetachedTargets() {
                for (const [node, { observer: observer }] of this
                    .instanceObservers)
                    if (!node.isConnected) {
                        observer.disconnect();
                        this.instanceObservers.delete(node);
                    }
            }
            cleanupDetachedDiscoveryScopes() {
                for (const [scope, observer] of this.discoveryObservers)
                    if (scope !== document && !scope.isConnected) {
                        observer.disconnect();
                        this.discoveryObservers.delete(scope);
                    }
            }
            tryAttachOrPollLegacy() {
                this.attachLegacy() ||
                    this.legacyPollTimer ||
                    (this.legacyPollTimer = window.setInterval(() => {
                        if (this.attachLegacy()) {
                            this.legacyPollTimer &&
                                clearInterval(this.legacyPollTimer);
                            this.legacyPollTimer = null;
                        }
                    }, 2 * this.rule.trigger.interval));
            }
            attachLegacy() {
                const watchTarget = querySelectorDeep$1(
                    this.rule.trigger.watch,
                );
                if (!watchTarget) return !1;
                const scope = resolveWatchScope(watchTarget);
                this.legacyObserver = this.createIdleLegacyObserver(scope);
                this.onTrigger(this.rule, scope);
                return !0;
            }
            createIdleLegacyObserver(scope) {
                const scheduleTrigger = () => {
                        if (!this.legacyIdlePending) {
                            this.legacyIdlePending = !0;
                            requestIdle(() => {
                                this.legacyIdlePending = !1;
                                this.onTrigger(this.rule, scope);
                            }, this.rule.trigger.interval);
                        }
                    },
                    observer = new MutationObserver((mutations) => {
                        shouldHandleDiscoveryMutations(mutations)
                            .hasAddedNodes && scheduleTrigger();
                    });
                observer.observe(scope, { childList: !0, subtree: !0 });
                return observer;
            }
        },
        RemoteChangeBuffer = class {
            changedIds = new Set();
            rescanMatchByName = !1;
            needsFullRefresh = !1;
            displayModeChanged = !1;
            queue(change) {
                if ("displayMode" !== change.type) {
                    if ("users" === change.type) {
                        this.rescanMatchByName ||= Boolean(
                            change.rescanMatchByName,
                        );
                        change.changedIds && 0 !== change.changedIds.length
                            ? change.changedIds.forEach((id) => {
                                  id && this.changedIds.add(id);
                              })
                            : (this.needsFullRefresh = !0);
                    }
                } else this.displayModeChanged = !0;
            }
            consume() {
                if (
                    !this.needsFullRefresh &&
                    0 === this.changedIds.size &&
                    !this.rescanMatchByName &&
                    !this.displayModeChanged
                )
                    return null;
                const snapshot = {
                    changedIds: Array.from(this.changedIds),
                    needsFullRefresh: this.needsFullRefresh,
                    rescanMatchByName: this.rescanMatchByName,
                    displayModeChanged: this.displayModeChanged,
                };
                this.changedIds.clear();
                this.rescanMatchByName = !1;
                this.needsFullRefresh = !1;
                this.displayModeChanged = !1;
                return snapshot;
            }
        },
        RuleScanScheduler = class {
            processRule;
            isActive;
            staticRetryTimers = [];
            staticRetryToken = 0;
            ruleDebounceTimers = new Map();
            constructor(processRule, isActive) {
                this.processRule = processRule;
                this.isActive = isActive;
            }
            dispose() {
                this.clearStaticRuleRetries();
                for (const rule of this.ruleDebounceTimers.keys())
                    this.clearRuleDebounceTimers(rule);
            }
            scanRules(rules, scope, source = "scan rules", options = {}) {
                if (0 === rules.length) return;
                const queue = [...rules],
                    runChunk = (deadline) => {
                        (async () => {
                            let processedRules = 0;
                            for (
                                ;
                                queue.length > 0 &&
                                deadline.timeRemaining() > 1;
                            ) {
                                const rule = queue.shift();
                                if (rule) {
                                    await this.processRule(
                                        rule,
                                        scope,
                                        options,
                                    );
                                    processedRules += 1;
                                }
                            }
                            queue.length > 0 && requestIdle(runChunk);
                        })();
                    };
                requestIdle(runChunk);
            }
            scheduleStaticRuleRetries(staticRules, scope, options = {}) {
                this.clearStaticRuleRetries();
                if (0 === staticRules.length) return;
                const token = ++this.staticRetryToken;
                [350, 900].forEach((delay) => {
                    const timerId = window.setTimeout(() => {
                        this.isActive() &&
                            token === this.staticRetryToken &&
                            this.scanRules(
                                staticRules,
                                scope,
                                `static retry ${delay}ms`,
                                options,
                            );
                    }, delay);
                    this.staticRetryTimers.push(timerId);
                });
            }
            clearStaticRuleRetries() {
                this.staticRetryToken++;
                this.staticRetryTimers.forEach((timerId) =>
                    clearTimeout(timerId),
                );
                this.staticRetryTimers = [];
            }
            scheduleDynamicRuleScan(rule, delay, scope) {
                let scopeTimers = this.ruleDebounceTimers.get(rule);
                if (!scopeTimers) {
                    scopeTimers = new Map();
                    this.ruleDebounceTimers.set(rule, scopeTimers);
                }
                const existingTimer = scopeTimers.get(scope);
                existingTimer && clearTimeout(existingTimer);
                const timerId = window.setTimeout(() => {
                    const activeScopeTimers = this.ruleDebounceTimers.get(rule);
                    activeScopeTimers?.delete(scope);
                    activeScopeTimers &&
                        0 === activeScopeTimers.size &&
                        this.ruleDebounceTimers.delete(rule);
                    this.scanRules([rule], scope, "dynamic debounce");
                }, delay);
                scopeTimers.set(scope, timerId);
            }
            clearRuleDebounceTimers(rule) {
                const scopeTimers = this.ruleDebounceTimers.get(rule);
                if (scopeTimers) {
                    scopeTimers.forEach((timerId) => clearTimeout(timerId));
                    this.ruleDebounceTimers.delete(rule);
                }
            }
        },
        PageInjector = class {
            domReady = !1;
            lastUrl = "";
            pendingRemoteChanges = new RemoteChangeBuffer();
            scanScheduler = new RuleScanScheduler(
                (rule, scope, options) =>
                    this.scanAndInjectRule(rule, scope, options),
                () => this.domReady,
            );
            activeWatchers = new Map();
            constructor() {
                logger_info("🚀 PageInjector 正在启动...");
                userStore.subscribe((change) => this.handleStoreChange(change));
                document.addEventListener("visibilitychange", () =>
                    this.handleVisibilityChange(),
                );
                this.startUrlMonitor();
                this.onDomReady(async () => {
                    await this.waitForBiliEnvironment();
                    await delay(100);
                    this.domReady = !0;
                    this.handleUrlChange();
                });
            }
            refreshData() {
                userStore.refreshData();
                this.domReady && this.scanActiveRules(document);
            }
            handleStoreChange(change) {
                if (this.domReady)
                    if (this.shouldDeferRemoteChange(change))
                        this.queuePendingRemoteChange(change);
                    else if ("displayMode" !== change.type)
                        if ("users" !== change.type)
                            this.refreshRenderedNodes(
                                change.users,
                                change.displayMode,
                            );
                        else {
                            this.refreshRenderedNodes(
                                change.users,
                                userStore.displayMode,
                                change.changedIds,
                            );
                            change.rescanMatchByName &&
                                this.scanMatchByNameRules(document);
                        }
                    else
                        this.refreshRenderedNodes(
                            userStore.getUsers(),
                            change.displayMode,
                        );
            }
            shouldDeferRemoteChange(change) {
                return (
                    "remote" === change.reason &&
                    "visible" !== document.visibilityState
                );
            }
            queuePendingRemoteChange(change) {
                this.pendingRemoteChanges.queue(change);
            }
            handleVisibilityChange() {
                "visible" === document.visibilityState &&
                    this.domReady &&
                    this.flushPendingRemoteChanges();
            }
            flushPendingRemoteChanges() {
                const pendingState = this.pendingRemoteChanges.consume();
                if (!pendingState) return;
                const currentUrl = _unsafeWindow.location.href;
                if (currentUrl !== this.lastUrl) {
                    this.lastUrl = currentUrl;
                    this.handleUrlChange();
                }
                const users = userStore.getUsers(),
                    displayMode = userStore.displayMode,
                    changedIds = pendingState.changedIds;
                pendingState.needsFullRefresh || pendingState.displayModeChanged
                    ? this.refreshRenderedNodes(users, displayMode)
                    : changedIds.length > 0 &&
                      this.refreshRenderedNodes(users, displayMode, changedIds);
                pendingState.rescanMatchByName &&
                    this.scanMatchByNameRules(document);
            }
            refreshRenderedNodes(users, displayMode, changedIds) {
                !(function (users, displayMode, changedIds) {
                    if (changedIds && changedIds.length > 0) {
                        const uniqueIds = Array.from(
                                new Set(changedIds.filter(Boolean)),
                            ),
                            targetIdSet = new Set(uniqueIds),
                            userMap = new Map();
                        users.forEach((user) => {
                            targetIdSet.has(user.id) &&
                                userMap.set(user.id, user);
                        });
                        uniqueIds.forEach((uid) => {
                            const tags = querySelectorAllDeep$1(
                                `[data-bili-uid="${((value = uid), "undefined" != typeof CSS && "function" == typeof CSS.escape ? CSS.escape(value) : value.replace(/\\/g, "\\\\").replace(/"/g, '\\"'))}"]`,
                            );
                            var value;
                            const user = userMap.get(uid);
                            tags.forEach((tag) =>
                                refreshTag(tag, user, displayMode),
                            );
                        });
                        return;
                    }
                    const userMap = new Map(users.map((u) => [u.id, u]));
                    querySelectorAllDeep$1("[data-bili-uid]").forEach((tag) => {
                        const uid = tag.getAttribute("data-bili-uid");
                        uid && refreshTag(tag, userMap.get(uid), displayMode);
                    });
                })(users, displayMode, changedIds);
            }
            scanActiveRules(scope, options = {}) {
                const activeRules = [...this.activeWatchers.keys()];
                0 !== activeRules.length &&
                    this.scanScheduler.scanRules(
                        activeRules,
                        scope,
                        "refresh active rules",
                        options,
                    );
            }
            startUrlMonitor() {
                this.lastUrl = _unsafeWindow.location.href;
                window.setInterval(() => {
                    const currentUrl = _unsafeWindow.location.href;
                    if (currentUrl !== this.lastUrl) {
                        this.lastUrl = currentUrl;
                        this.handleUrlChange();
                    }
                }, 1e3);
            }
            handleUrlChange() {
                if (!this.domReady) return;
                const matchedRules = (function (
                        currentUrl = _unsafeWindow.location.href,
                    ) {
                        return config
                            .filter((entry) =>
                                entry.urlPattern.test(currentUrl),
                            )
                            .map((entry) => entry.rule);
                    })(),
                    groups = this.groupRulesByMode(matchedRules);
                this.applyStaticRules(groups.staticRules, document, {
                    includeProcessed: !0,
                });
                this.reconcileWatchers(groups.dynamicRules);
                this.scanActiveRules(document, { includeProcessed: !0 });
            }
            groupRulesByMode(rules) {
                return (function (rules) {
                    return rules.reduce(
                        (groups, rule) => {
                            isStaticMode(rule)
                                ? groups.staticRules.push(rule)
                                : isDynamicMode(rule) &&
                                  groups.dynamicRules.push(rule);
                            return groups;
                        },
                        { staticRules: [], dynamicRules: [] },
                    );
                })(rules);
            }
            applyStaticRules(staticRules, scope, options = {}) {
                if (0 !== staticRules.length) {
                    this.scanScheduler.scanRules(
                        staticRules,
                        scope,
                        "static initial scan",
                        options,
                    );
                    this.scanScheduler.scheduleStaticRuleRetries(
                        staticRules,
                        scope,
                        options,
                    );
                } else this.scanScheduler.clearStaticRuleRetries();
            }
            reconcileWatchers(nextRules) {
                for (const [rule, watcher] of this.activeWatchers)
                    if (!nextRules.includes(rule)) {
                        watcher.stop();
                        this.scanScheduler.clearRuleDebounceTimers(rule);
                        this.activeWatchers.delete(rule);
                    }
                nextRules.forEach((rule) => {
                    if (this.activeWatchers.has(rule)) return;
                    const watcher = new DynamicRuleWatcher(rule, (r, scope) => {
                        this.scanScheduler.scheduleDynamicRuleScan(
                            r,
                            r.trigger.interval,
                            scope,
                        );
                    });
                    this.activeWatchers.set(rule, watcher);
                    watcher.start();
                });
            }
            scanMatchByNameRules(scope) {
                const rules = (function (rules) {
                    return Array.from(rules).filter((rule) =>
                        Boolean(rule.matchByName),
                    );
                })(this.activeWatchers.keys());
                0 !== rules.length &&
                    this.scanScheduler.scanRules(
                        rules,
                        scope,
                        "matchByName rescan",
                    );
            }
            async scanAndInjectRule(rule, scope, options = {}) {
                const selector = (function (rule, options = {}) {
                    const baseSelector = rule.aSelector || rule.textSelector;
                    return baseSelector
                        ? options.includeProcessed
                            ? baseSelector
                            : `${baseSelector}:not([data-bili-processed])`
                        : null;
                })(rule, options);
                if (!selector) return;
                const elements =
                    scope instanceof ShadowRoot
                        ? querySelectorAllDeep$1(selector).filter((element) =>
                              isNodeInsideScope(element, scope),
                          )
                        : querySelectorAllDeep$1(selector, scope);
                !(function (rule, selector, count) {
                    0 !== count && isStaticMode(rule);
                })(rule, 0, elements.length);
                0 !== elements.length &&
                    elements.forEach((el) => {
                        this.applyRuleToElement(el, rule);
                    });
            }
            async applyRuleToElement(el, rule) {
                let applied = !1;
                try {
                    if (el.classList.contains("editable-textarea")) {
                        el.setAttribute("data-bili-processed", "true");
                        return;
                    }
                    const originalName =
                            rule.originalNameResolver?.(el, rule) ||
                            (function (el, rule) {
                                return (
                                    readPreferredText(
                                        resolveRuleTextTarget(el, rule),
                                    ) ||
                                    readPreferredText(el) ||
                                    ""
                                );
                            })(el, rule),
                        uid = await this.resolveElementUid(
                            el,
                            rule,
                            originalName,
                        );
                    if (!uid) return;
                    const user = userStore.ensureUser(uid, originalName);
                    ((url = location.href),
                    /:\/\/(?:www\.)?bilibili\.com\/list\/\d+/.test(url)) &&
                        (user.isDeleted = !0);
                    applied = await (async function (el, user, rule, meta) {
                        const displayMode = userStore.displayMode;
                        switch (rule.styleScope) {
                            case 1:
                                return (function (
                                    element,
                                    user,
                                    meta,
                                    displayMode,
                                ) {
                                    if (!element) return !1;
                                    ensureStylesForElement(element);
                                    syncRenderedNodeState(
                                        element,
                                        user,
                                        meta.originalName,
                                        displayMode,
                                    );
                                    syncElementMeta(element, meta);
                                    return !0;
                                })(
                                    resolveRuleTextTarget(el, rule),
                                    user,
                                    meta,
                                    displayMode,
                                );
                            case 2:
                                return (function (
                                    el,
                                    user,
                                    rule,
                                    meta,
                                    displayMode,
                                ) {
                                    let wrapper = wrapperCache.get(el);
                                    if (
                                        !wrapper &&
                                        el.nextElementSibling?.classList.contains(
                                            "editable-textarea",
                                        )
                                    ) {
                                        wrapper = el.nextElementSibling;
                                        wrapperCache.set(el, wrapper);
                                    }
                                    if (!wrapper) {
                                        wrapper = markOwnedElement(
                                            document.createElement("span"),
                                        );
                                        wrapper.classList.add(
                                            "editable-textarea",
                                        );
                                        wrapper.setAttribute(
                                            "data-bili-processed",
                                            "true",
                                        );
                                        wrapper.addEventListener(
                                            "click",
                                            (e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                const uid =
                                                    wrapper?.dataset.biliUid;
                                                if (!uid) return;
                                                const latestUser =
                                                    userStore.ensureUser(
                                                        uid,
                                                        wrapper?.dataset
                                                            .biliOriginal ||
                                                            meta.originalName,
                                                    );
                                                !(function (
                                                    targetElement,
                                                    user,
                                                ) {
                                                    function autoResize(input) {
                                                        input.style.width =
                                                            "0px";
                                                        input.style.width =
                                                            input.scrollWidth +
                                                            1 +
                                                            "px";
                                                    }
                                                    if (
                                                        !user ||
                                                        targetElement.querySelector(
                                                            "input.bili-memo-input",
                                                        )
                                                    )
                                                        return;
                                                    const originalName =
                                                            targetElement
                                                                .dataset
                                                                .biliOriginal ||
                                                            targetElement.textContent ||
                                                            "",
                                                        currentMemo =
                                                            user.memo ||
                                                            originalName,
                                                        input =
                                                            markOwnedElement(
                                                                document.createElement(
                                                                    "input",
                                                                ),
                                                            );
                                                    input.type = "text";
                                                    input.value = currentMemo;
                                                    input.className =
                                                        "bili-memo-input";
                                                    input.translate = !1;
                                                    input.maxLength = 24;
                                                    input.title =
                                                        "Enter 保存，Shift+Enter 保存当前昵称，Esc 取消";
                                                    const detectedFontSize =
                                                        targetElement.style.getPropertyValue(
                                                            "--auto-detected-font-size",
                                                        );
                                                    detectedFontSize &&
                                                        input.style.setProperty(
                                                            "--auto-detected-font-size",
                                                            detectedFontSize,
                                                        );
                                                    const parent =
                                                        targetElement.parentElement;
                                                    if (!parent) return;
                                                    targetElement.style.display =
                                                        "none";
                                                    parent.insertBefore(
                                                        input,
                                                        targetElement.nextSibling,
                                                    );
                                                    input.focus();
                                                    let exited = !1;
                                                    const saveAndExit = (
                                                        shouldSave,
                                                        forceSave = !1,
                                                    ) => {
                                                        if (exited) return;
                                                        exited = !0;
                                                        const newValue =
                                                            input.value.trim();
                                                        input.remove();
                                                        targetElement.style.display =
                                                            "";
                                                        if (
                                                            shouldSave &&
                                                            (forceSave ||
                                                                newValue !==
                                                                    currentMemo)
                                                        ) {
                                                            userStore.updateUserMemo(
                                                                user.id,
                                                                newValue,
                                                                originalName,
                                                            );
                                                            syncRenderedNodeState(
                                                                targetElement,
                                                                {
                                                                    ...user,
                                                                    memo: newValue,
                                                                },
                                                                originalName,
                                                                userStore.displayMode,
                                                                {
                                                                    isEditableWrapper:
                                                                        targetElement.classList.contains(
                                                                            "editable-textarea",
                                                                        ),
                                                                },
                                                            );
                                                        }
                                                    };
                                                    input.addEventListener(
                                                        "keydown",
                                                        (e) => {
                                                            if (!e.isComposing)
                                                                if (
                                                                    "Enter" ===
                                                                    e.key
                                                                ) {
                                                                    e.preventDefault();
                                                                    saveAndExit(
                                                                        !0,
                                                                        e.shiftKey,
                                                                    );
                                                                } else if (
                                                                    "Escape" ===
                                                                    e.key
                                                                ) {
                                                                    e.preventDefault();
                                                                    saveAndExit(
                                                                        !1,
                                                                    );
                                                                }
                                                        },
                                                    );
                                                    input.addEventListener(
                                                        "blur",
                                                        () => saveAndExit(!0),
                                                    );
                                                    input.addEventListener(
                                                        "click",
                                                        (e) =>
                                                            e.stopPropagation(),
                                                    );
                                                    input.addEventListener(
                                                        "input",
                                                        () => {
                                                            if (
                                                                input.value
                                                                    .length >=
                                                                input.maxLength
                                                            ) {
                                                                input.setCustomValidity(
                                                                    "已达到最大长度：24 字符",
                                                                );
                                                                input.reportValidity();
                                                            } else
                                                                input.setCustomValidity(
                                                                    "",
                                                                );
                                                            autoResize(input);
                                                        },
                                                    );
                                                    autoResize(input);
                                                })(wrapper, latestUser);
                                            },
                                        );
                                        el.style.display = "none";
                                        el.insertAdjacentElement(
                                            "afterend",
                                            wrapper,
                                        );
                                        wrapperCache.set(el, wrapper);
                                    }
                                    syncRenderedNodeState(
                                        wrapper,
                                        user,
                                        meta.originalName,
                                        displayMode,
                                        { isEditableWrapper: !0 },
                                    );
                                    const detectedSize =
                                        fontSizeCache.getOrDetect(el, rule);
                                    detectedSize &&
                                        wrapper.style.setProperty(
                                            "--auto-detected-font-size",
                                            detectedSize,
                                        );
                                    syncElementMeta(wrapper, meta);
                                    ensureStylesForElement(wrapper);
                                    return !0;
                                })(el, user, rule, meta, displayMode);
                            default:
                                logger_warn(
                                    `⚠️ 不支持的样式作用域: ${rule.styleScope}`,
                                );
                                return !1;
                        }
                    })(el, user, rule, {
                        uid: uid,
                        originalName: originalName,
                    });
                    applied &&
                        this.shouldMarkProcessed(rule) &&
                        el.setAttribute("data-bili-processed", "true");
                } finally {
                }
                var url;
            }
            async resolveElementUid(el, rule, originalName) {
                if (rule.uidResolver) {
                    const uid = await rule.uidResolver(el, rule);
                    if (uid) return uid;
                    logger_warn(
                        "[resolveElementUid] uidResolver returned empty",
                        {
                            ruleName: rule.name,
                            originalName: originalName,
                            textContent: el.textContent?.trim() || "",
                            element: el,
                        },
                    );
                }
                return (
                    (function (el, silent = !1) {
                        for (const strategy of UID_STRATEGIES) {
                            const uid = strategy(el);
                            if (uid) return uid;
                        }
                        silent || logger_warn("⚠️ 无法从元素中提取 UID:", el);
                        return null;
                    })(el, Boolean(rule.matchByName)) ||
                    (rule.matchByName &&
                        originalName &&
                        userStore.findUserByName(originalName)?.id) ||
                    null
                );
            }
            shouldMarkProcessed(rule) {
                return !isDynamicMode(rule) || !1 !== rule.markProcessed;
            }
            onDomReady(callback) {
                "complete" !== document.readyState &&
                "interactive" !== document.readyState
                    ? window.addEventListener(
                          "DOMContentLoaded",
                          () => callback(),
                          { once: !0 },
                      )
                    : callback();
            }
            async waitForBiliEnvironment() {
                (await waitUntil(() => Boolean(_unsafeWindow.__VUE__), {
                    timeoutMs: 5e3,
                })) ||
                    logger_warn(
                        "等待 Bilibili Vue 环境超时，继续初始化页面注入",
                    );
            }
        },
        pageInjector = null,
        gmPersistStorage = (function (prefix, emptyValue = "") {
            return {
                getItem: (storageKey) =>
                    getGmValue(`${prefix}${storageKey}`, emptyValue) || null,
                setItem(storageKey, value) {
                    setGmValue(`${prefix}${storageKey}`, value);
                },
                removeItem(storageKey) {
                    setGmValue(`${prefix}${storageKey}`, emptyValue);
                },
            };
        })("panelPrefs:"),
        DEFAULT_CONFIG = {
            lang: void 0,
            message: void 0,
            abortEarly: void 0,
            abortPipeEarly: void 0,
        },
        _standardCache = new WeakMap(),
        UID = string(),
        UserSchema = object({
            id: UID,
            nickname: string(),
            avatar: optional(string()),
            memo: string(),
        }),
        UserSchemaOld = object({
            bid: UID,
            nickname: string(),
            memo: string(),
            avatar: optional(string()),
            info: string(),
        }),
        CombinedSchema = (function union(options, message$1) {
            return {
                kind: "schema",
                type: "union",
                reference: union,
                expects: _joinExpects(
                    options.map((option) => option.expects),
                    "|",
                ),
                async: !1,
                options: options,
                message: message$1,
                get "~standard"() {
                    return _getStandardProps(this);
                },
                "~run"(dataset, config$1) {
                    let validDataset, typedDatasets, untypedDatasets;
                    for (const schema of this.options) {
                        const optionDataset = schema["~run"](
                            { value: dataset.value },
                            config$1,
                        );
                        if (optionDataset.typed) {
                            if (!optionDataset.issues) {
                                validDataset = optionDataset;
                                break;
                            }
                            typedDatasets
                                ? typedDatasets.push(optionDataset)
                                : (typedDatasets = [optionDataset]);
                        } else
                            untypedDatasets
                                ? untypedDatasets.push(optionDataset)
                                : (untypedDatasets = [optionDataset]);
                    }
                    if (validDataset) return validDataset;
                    if (typedDatasets) {
                        if (1 === typedDatasets.length) return typedDatasets[0];
                        _addIssue(this, "type", dataset, config$1, {
                            issues: _subIssues(typedDatasets),
                        });
                        dataset.typed = !0;
                    } else {
                        if (1 === untypedDatasets?.length)
                            return untypedDatasets[0];
                        _addIssue(this, "type", dataset, config$1, {
                            issues: _subIssues(untypedDatasets),
                        });
                    }
                    return dataset;
                },
            };
        })([
            (function array(item, message$1) {
                return {
                    kind: "schema",
                    type: "array",
                    reference: array,
                    expects: "Array",
                    async: !1,
                    item: item,
                    message: message$1,
                    get "~standard"() {
                        return _getStandardProps(this);
                    },
                    "~run"(dataset, config$1) {
                        const input = dataset.value;
                        if (Array.isArray(input)) {
                            dataset.typed = !0;
                            dataset.value = [];
                            for (let key = 0; key < input.length; key++) {
                                const value$1 = input[key],
                                    itemDataset = this.item["~run"](
                                        { value: value$1 },
                                        config$1,
                                    );
                                if (itemDataset.issues) {
                                    const pathItem = {
                                        type: "array",
                                        origin: "value",
                                        input: input,
                                        key: key,
                                        value: value$1,
                                    };
                                    for (const issue of itemDataset.issues) {
                                        issue.path
                                            ? issue.path.unshift(pathItem)
                                            : (issue.path = [pathItem]);
                                        dataset.issues?.push(issue);
                                    }
                                    dataset.issues ||
                                        (dataset.issues = itemDataset.issues);
                                    if (config$1.abortEarly) {
                                        dataset.typed = !1;
                                        break;
                                    }
                                }
                                itemDataset.typed || (dataset.typed = !1);
                                dataset.value.push(itemDataset.value);
                            }
                        } else _addIssue(this, "type", dataset, config$1);
                        return dataset;
                    },
                };
            })(UserSchema),
            (function record(key, value$1, message$1) {
                return {
                    kind: "schema",
                    type: "record",
                    reference: record,
                    expects: "Object",
                    async: !1,
                    key: key,
                    value: value$1,
                    message: message$1,
                    get "~standard"() {
                        return _getStandardProps(this);
                    },
                    "~run"(dataset, config$1) {
                        const input = dataset.value;
                        if (input && "object" == typeof input) {
                            dataset.typed = !0;
                            dataset.value = {};
                            for (const entryKey in input)
                                if (_isValidObjectKey(input, entryKey)) {
                                    const entryValue = input[entryKey],
                                        keyDataset = this.key["~run"](
                                            { value: entryKey },
                                            config$1,
                                        );
                                    if (keyDataset.issues) {
                                        const pathItem = {
                                            type: "object",
                                            origin: "key",
                                            input: input,
                                            key: entryKey,
                                            value: entryValue,
                                        };
                                        for (const issue of keyDataset.issues) {
                                            issue.path = [pathItem];
                                            dataset.issues?.push(issue);
                                        }
                                        dataset.issues ||
                                            (dataset.issues =
                                                keyDataset.issues);
                                        if (config$1.abortEarly) {
                                            dataset.typed = !1;
                                            break;
                                        }
                                    }
                                    const valueDataset = this.value["~run"](
                                        { value: entryValue },
                                        config$1,
                                    );
                                    if (valueDataset.issues) {
                                        const pathItem = {
                                            type: "object",
                                            origin: "value",
                                            input: input,
                                            key: entryKey,
                                            value: entryValue,
                                        };
                                        for (const issue of valueDataset.issues) {
                                            issue.path
                                                ? issue.path.unshift(pathItem)
                                                : (issue.path = [pathItem]);
                                            dataset.issues?.push(issue);
                                        }
                                        dataset.issues ||
                                            (dataset.issues =
                                                valueDataset.issues);
                                        if (config$1.abortEarly) {
                                            dataset.typed = !1;
                                            break;
                                        }
                                    }
                                    (keyDataset.typed && valueDataset.typed) ||
                                        (dataset.typed = !1);
                                    keyDataset.typed &&
                                        (dataset.value[keyDataset.value] =
                                            valueDataset.value);
                                }
                        } else _addIssue(this, "type", dataset, config$1);
                        return dataset;
                    },
                };
            })(UID, UserSchemaOld),
        ]),
        ResImpl = class ResImpl {
            constructor(body, init) {
                this.rawBody = body;
                this.init = init;
                this.body = body.stream();
                const {
                    headers: headers,
                    statusCode: statusCode,
                    statusText: statusText,
                    finalUrl: finalUrl,
                    redirected: redirected,
                } = init;
                this.headers = headers;
                this.status = statusCode;
                this.statusText = statusText;
                this.url = finalUrl;
                this.type = "basic";
                this.redirected = redirected;
                this._bodyUsed = !1;
            }
            get bodyUsed() {
                return this._bodyUsed;
            }
            get ok() {
                return this.status < 300;
            }
            arrayBuffer() {
                if (this.bodyUsed)
                    throw new TypeError(
                        "Failed to execute 'arrayBuffer' on 'Response': body stream already read",
                    );
                this._bodyUsed = !0;
                return this.rawBody.arrayBuffer();
            }
            blob() {
                if (this.bodyUsed)
                    throw new TypeError(
                        "Failed to execute 'blob' on 'Response': body stream already read",
                    );
                this._bodyUsed = !0;
                return Promise.resolve(
                    this.rawBody.slice(0, this.rawBody.size, this.rawBody.type),
                );
            }
            clone() {
                if (this.bodyUsed)
                    throw new TypeError(
                        "Failed to execute 'clone' on 'Response': body stream already read",
                    );
                return new ResImpl(this.rawBody, this.init);
            }
            formData() {
                if (this.bodyUsed)
                    throw new TypeError(
                        "Failed to execute 'formData' on 'Response': body stream already read",
                    );
                this._bodyUsed = !0;
                return this.rawBody.text().then(decode);
            }
            async json() {
                if (this.bodyUsed)
                    throw new TypeError(
                        "Failed to execute 'json' on 'Response': body stream already read",
                    );
                this._bodyUsed = !0;
                return JSON.parse(await this.rawBody.text());
            }
            text() {
                if (this.bodyUsed)
                    throw new TypeError(
                        "Failed to execute 'text' on 'Response': body stream already read",
                    );
                this._bodyUsed = !0;
                return this.rawBody.text();
            }
            async bytes() {
                if (this.bodyUsed)
                    throw new TypeError(
                        "Failed to execute 'bytes' on 'Response': body stream already read",
                    );
                this._bodyUsed = !0;
                return new Uint8Array(await this.rawBody.arrayBuffer());
            }
        },
        httpMethods = [
            "GET",
            "POST",
            "PUT",
            "DELETE",
            "PATCH",
            "HEAD",
            "TRACE",
            "OPTIONS",
            "CONNECT",
        ],
        Node = class {
            value;
            next;
            constructor(value) {
                this.value = value;
            }
        },
        Queue = class {
            #head;
            #tail;
            #size;
            constructor() {
                this.clear();
            }
            enqueue(value) {
                const node = new Node(value);
                if (this.#head) {
                    this.#tail.next = node;
                    this.#tail = node;
                } else {
                    this.#head = node;
                    this.#tail = node;
                }
                this.#size++;
            }
            dequeue() {
                const current = this.#head;
                if (current) {
                    this.#head = this.#head.next;
                    this.#size--;
                    this.#head || (this.#tail = void 0);
                    return current.value;
                }
            }
            peek() {
                if (this.#head) return this.#head.value;
            }
            clear() {
                this.#head = void 0;
                this.#tail = void 0;
                this.#size = 0;
            }
            get size() {
                return this.#size;
            }
            *[Symbol.iterator]() {
                let current = this.#head;
                for (; current; ) {
                    yield current.value;
                    current = current.next;
                }
            }
            *drain() {
                for (; this.#head; ) yield this.dequeue();
            }
        },
        limit = pLimit(4),
        MIXIN_KEY_ENC_TAB = [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43,
            5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16,
            24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59,
            6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
        ],
        getUserInfo = (function (
            fn,
            {
                ttlMs: ttlMs,
                getKey: getKey = (...args) => JSON.stringify(args),
            },
        ) {
            const cache = new Map();
            return async (...args) => {
                const cacheKey = getKey(...args),
                    cached = cache.get(cacheKey),
                    now = Date.now();
                if (cached && now - cached.timestamp < ttlMs)
                    return cached.value;
                const value = await fn(...args);
                cache.set(cacheKey, { value: value, timestamp: now });
                return value;
            };
        })(
            ((fn = async function (mid) {
                try {
                    const { img_key: img_key, sub_key: sub_key } =
                            await (async function () {
                                const cache = (function () {
                                    const cache = getGmValue(
                                        "bili_wbi_keys",
                                        null,
                                    );
                                    return cache
                                        ? Date.now() - cache.timestamp >= 36e5
                                            ? null
                                            : cache
                                        : null;
                                })();
                                if (cache)
                                    return {
                                        img_key: cache.img_key,
                                        sub_key: cache.sub_key,
                                    };
                                try {
                                    const {
                                            img_url: img_url,
                                            sub_url: sub_url,
                                        } = (
                                            await (
                                                await GM_fetch(
                                                    "https://api.bilibili.com/x/web-interface/nav",
                                                    {
                                                        headers: {
                                                            Referer:
                                                                "https://www.bilibili.com/",
                                                        },
                                                    },
                                                )
                                            ).json()
                                        ).data.wbi_img,
                                        keys = {
                                            img_key: img_url.slice(
                                                img_url.lastIndexOf("/") + 1,
                                                img_url.lastIndexOf("."),
                                            ),
                                            sub_key: sub_url.slice(
                                                sub_url.lastIndexOf("/") + 1,
                                                sub_url.lastIndexOf("."),
                                            ),
                                        };
                                    !(function (
                                        key,
                                        value,
                                        timestamp = Date.now(),
                                    ) {
                                        setGmValue(key, {
                                            ...value,
                                            timestamp: timestamp,
                                        });
                                    })("bili_wbi_keys", keys);
                                    return keys;
                                } catch (err) {
                                    logger_error(
                                        "Failed to fetch WBI keys",
                                        err,
                                    );
                                    throw new Error("WBI key 初始化失败");
                                }
                            })(),
                        response = await GM_fetch(
                            `https://api.bilibili.com/x/space/wbi/acc/info?${(function (
                                params,
                                img_key,
                                sub_key,
                            ) {
                                const mixin_key =
                                    ((orig = img_key + sub_key),
                                    MIXIN_KEY_ENC_TAB.map((n) => orig[n])
                                        .join("")
                                        .slice(0, 32));
                                var orig;
                                const curr_time = Math.round(Date.now() / 1e3),
                                    chr_filter = /[!'()*]/g,
                                    signedParams = {
                                        ...params,
                                        wts: curr_time,
                                    },
                                    query = Object.entries(signedParams)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([key, value]) => {
                                            const filteredValue = String(
                                                value,
                                            ).replace(chr_filter, "");
                                            return `${encodeURIComponent(key)}=${encodeURIComponent(filteredValue)}`;
                                        })
                                        .join("&");
                                return `${query}&w_rid=${((message) => {
                                    const buffer = new TextEncoder().encode(
                                            message,
                                        ),
                                        n = buffer.length,
                                        words = new Uint32Array(
                                            (1 + ((n + 8) >> 6)) << 4,
                                        );
                                    for (let i = 0; i < n; i++)
                                        words[i >> 2] |=
                                            buffer[i] << ((i % 4) * 8);
                                    words[n >> 2] |= 128 << ((n % 4) * 8);
                                    words[words.length - 2] = 8 * n;
                                    let [a, b, c, d] = [
                                        1732584193, 4023233417, 2562383102,
                                        271733878,
                                    ];
                                    const K = Uint32Array.from(
                                            { length: 64 },
                                            (_, i) =>
                                                (4294967296 *
                                                    Math.abs(
                                                        Math.sin(i + 1),
                                                    )) >>>
                                                0,
                                        ),
                                        S = [
                                            7, 12, 17, 22, 7, 12, 17, 22, 7, 12,
                                            17, 22, 7, 12, 17, 22, 5, 9, 14, 20,
                                            5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
                                            14, 20, 4, 11, 16, 23, 4, 11, 16,
                                            23, 4, 11, 16, 23, 4, 11, 16, 23, 6,
                                            10, 15, 21, 6, 10, 15, 21, 6, 10,
                                            15, 21, 6, 10, 15, 21,
                                        ],
                                        rotl = (x, n) =>
                                            (x << n) | (x >>> (32 - n));
                                    for (let i = 0; i < words.length; i += 16) {
                                        let [A, B, C, D] = [a, b, c, d];
                                        for (let j = 0; j < 64; j++) {
                                            let f, g;
                                            if (j < 16) {
                                                f = (B & C) | (~B & D);
                                                g = j;
                                            } else if (j < 32) {
                                                f = (D & B) | (~D & C);
                                                g = (5 * j + 1) % 16;
                                            } else if (j < 48) {
                                                f = B ^ C ^ D;
                                                g = (3 * j + 5) % 16;
                                            } else {
                                                f = C ^ (B | ~D);
                                                g = (7 * j) % 16;
                                            }
                                            const temp = D;
                                            D = C;
                                            C = B;
                                            B =
                                                (B +
                                                    rotl(
                                                        (A +
                                                            f +
                                                            K[j] +
                                                            words[i + g]) |
                                                            0,
                                                        S[j],
                                                    )) |
                                                0;
                                            A = temp;
                                        }
                                        a = (a + A) | 0;
                                        b = (b + B) | 0;
                                        c = (c + C) | 0;
                                        d = (d + D) | 0;
                                    }
                                    const outBuf = new ArrayBuffer(16),
                                        view = new DataView(outBuf);
                                    [a, b, c, d].forEach((val, i) =>
                                        view.setUint32(4 * i, val, !0),
                                    );
                                    return Array.from(new Uint8Array(outBuf))
                                        .map((b) =>
                                            b.toString(16).padStart(2, "0"),
                                        )
                                        .join("");
                                })(query + mixin_key)}`;
                            })(
                                {
                                    mid: mid,
                                    token: "",
                                    platform: "web",
                                    web_location: 1550101,
                                },
                                img_key,
                                sub_key,
                            )}`,
                            {
                                headers: {
                                    Referer: "https://space.bilibili.com/",
                                },
                            },
                        );
                    if (!response.ok)
                        throw new Error(
                            `HTTP error! status: ${response.status}`,
                        );
                    const res = await response.json();
                    if (0 !== res.code) {
                        if (-404 === res.code)
                            return {
                                nickname: "账号已注销",
                                avatar: DEFAULT_AVATAR_URL,
                                isDeleted: !0,
                            };
                        if ([-352, -412, -799].includes(res.code)) return null;
                    }
                    return {
                        nickname: res.data.name,
                        avatar: res.data.face + "@96w_96h_1c_1s.avif",
                    };
                } catch (error) {
                    logger_error("getUserInfo failed", error);
                    throw error;
                }
            }),
            (...args) =>
                limit(async () => {
                    await new Promise((resolve) =>
                        setTimeout(resolve, 300 + 500 * Math.random()),
                    );
                    return fn(...args);
                })),
            { ttlMs: 3e5 },
        ),
        searchFormCache = new Map(),
        converterCache = new Map(),
        biliFixAPIReady = (() => {
            let p = null;
            return () => {
                p ||
                    (p = new Promise((resolve) => {
                        const timer = setTimeout(() => {
                            logger_warn(
                                "biliFix:request-api: timeout, permanent failure set.",
                            );
                            resolve(null);
                        }, 200);
                        window.dispatchEvent(
                            new CustomEvent("biliFix:request-api", {
                                detail: (api) => {
                                    clearTimeout(timer);
                                    if (api && "annotateElements" in api) {
                                        logger_info(
                                            "biliFix:request-api: get BiliFixAPI successfully",
                                            api,
                                        );
                                        resolve(api);
                                    } else {
                                        logger_warn(
                                            "biliFix:request-api: get BiliFixAPI failed, not compatible api:",
                                            api,
                                            "required:",
                                            "annotateElements",
                                        );
                                        resolve(null);
                                    }
                                },
                            }),
                        );
                    }));
                return p;
            };
        })();
    window.addEventListener("biliMemo:request-api", (e) => {
        e.detail?.({ getUserMemo: (uid) => userStore.getUserMemo(uid) });
    });
    var ALLOWED_AVATAR_PROTOCOLS = new Set(["http:", "https:", "data:"]),
        DISPLAY_MODE_OPTIONS = [
            { value: 0, label: "昵称" },
            { value: 1, label: "备注(昵称)" },
            { value: 2, label: "昵称(备注)" },
            { value: 3, label: "备注" },
        ],
        panelBindingsRegistered = !1,
        panelComponentsRegistered = !1,
        processedUID = new WeakSet();
    (async () => {
        alpinejs.default.plugin(module_default);
        _unsafeWindow.Alpine = alpinejs.default;
        const currentScopePattern = (function (rawUrl = window.location.href) {
                const url = new URL(rawUrl),
                    firstPathSegment = url.pathname
                        .split("/")
                        .filter(Boolean)[0];
                return firstPathSegment
                    ? `${url.origin}/${firstPathSegment}/*`
                    : `${url.origin}/*`;
            })(),
            pageDisabled = (function (rawUrl = window.location.href) {
                const target = (function (rawUrl) {
                    const url = new URL(rawUrl);
                    return `${url.origin}${url.pathname}`;
                })(rawUrl);
                return loadDisabledPageScopes().some((pattern) =>
                    (function (pattern) {
                        if (pattern.endsWith("/*")) {
                            const base = pattern
                                .slice(0, -2)
                                .replace(/[.+?^${}()|[\]\\]/g, "\\$&");
                            return new RegExp(`^${base}(?:/.*)?$`);
                        }
                        const escaped = pattern
                            .split("*")
                            .map((chunk) =>
                                chunk.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
                            )
                            .join(".*");
                        return new RegExp(`^${escaped}$`);
                    })(pattern).test(target),
                );
            })();
        pageDisabled
            ? _GM_registerMenuCommand("✅在此页面启用", () => {
                  !(function (scopePattern) {
                      const patterns = loadDisabledPageScopes(),
                          next = patterns.filter(
                              (pattern) => pattern !== scopePattern,
                          );
                      next.length !== patterns.length &&
                          saveDisabledPageScopes(next);
                  })(currentScopePattern);
                  location.reload();
              })
            : _GM_registerMenuCommand("❌在此页面禁用", () => {
                  !(function (scopePattern) {
                      const patterns = loadDisabledPageScopes();
                      if (!patterns.includes(scopePattern)) {
                          patterns.push(scopePattern);
                          saveDisabledPageScopes(patterns);
                      }
                  })(currentScopePattern);
                  location.reload();
              });
        _GM_registerMenuCommand("❓帮助", () => {
            window.open(
                "https://github.com/kaixinol/Bilibili-User-Memo?tab=readme-ov-file#bilibili-%E7%94%A8%E6%88%B7%E5%A4%87%E6%B3%A8-ui-%E4%BD%BF%E7%94%A8%E8%AF%B4%E6%98%8E",
            );
        });
        _GM_registerMenuCommand("❤️给作者一杯咖啡☕", () => {
            window.open("https://s2.loli.net/2025/08/04/1hjKA5qwXHS8Glu.webp");
        });
        _GM_registerMenuCommand("🐛反馈", () => {
            window.open(
                "https://github.com/kaixinol/Bilibili-User-Memo/issues",
            );
        });
        _GM_registerMenuCommand(
            (getPanelPreloadAllCards() ? "✅" : "⬜") + "默认预注入全部卡片",
            () => {
                const next = !getPanelPreloadAllCards();
                setPanelPreloadAllCards(next);
                alpinejs.default.store("userList")?.setPreloadAllCards?.(next);
                showAlert(
                    next
                        ? "已开启默认预注入全部卡片。当前页面会尽量立即生效。"
                        : "已关闭默认预注入全部卡片。未打开面板前将延后加载列表。",
                );
            },
        );
        if (pageDisabled)
            console.info(
                `[Bilibili-User-Memo] 当前页面已禁用: ${currentScopePattern}`,
            );
        else {
            pageInjector || (pageInjector = new PageInjector());
            !(function () {
                if (document.getElementById("bili-memo-container")) return;
                !(function () {
                    if (alpinejs.default.store("userList")) return;
                    const preloadAllCards = getPanelPreloadAllCards(),
                        shouldPreloadImmediately = preloadAllCards,
                        store = {
                            isOpen: !1,
                            _usersMap: alpinejs.default.reactive(new Map()),
                            _usersList: alpinejs.default.reactive([]),
                            get users() {
                                return this._usersList;
                            },
                            getUserById(id) {
                                return this._usersMap.get(id);
                            },
                            syncUsersSnapshot(users) {
                                !(function (store, users) {
                                    const nextIds = new Set(
                                        users.map((user) => user.id),
                                    );
                                    for (const id of Array.from(
                                        store._usersMap.keys(),
                                    ))
                                        nextIds.has(id) ||
                                            store._usersMap.delete(id);
                                    const nextList = [];
                                    users.forEach((user) => {
                                        const existing = store._usersMap.get(
                                            user.id,
                                        );
                                        if (existing) {
                                            existing.nickname = user.nickname;
                                            existing.avatar = user.avatar;
                                            existing.memo = user.memo;
                                            nextList.push(existing);
                                            return;
                                        }
                                        const reactiveUser =
                                            alpinejs.default.reactive({
                                                ...user,
                                            });
                                        store._usersMap.set(
                                            reactiveUser.id,
                                            reactiveUser,
                                        );
                                        nextList.push(reactiveUser);
                                    });
                                    store._usersList.splice(
                                        0,
                                        store._usersList.length,
                                        ...nextList,
                                    );
                                    0 !== store.selectedIds.length &&
                                        (store.selectedIds =
                                            store.selectedIds.filter((id) =>
                                                nextIds.has(id),
                                            ));
                                })(this, users);
                            },
                            resetUsersSnapshot() {
                                this._usersMap.clear();
                                this._usersList.length = 0;
                            },
                            removeUser(userId) {
                                userStore.removeUser(userId);
                            },
                            isDark: getGmValue("isDark", !1),
                            fuzzySearchEnabled: getGmValue(
                                "panelFuzzySearch",
                                !1,
                            ),
                            preloadAllCards: preloadAllCards,
                            isUsersLoading: !1,
                            hasLoadedUsers: shouldPreloadImmediately,
                            isRefreshing: !1,
                            refreshCurrent: 0,
                            refreshTotal: 0,
                            displayMode: userStore.displayMode,
                            searchQuery: "",
                            isMultiSelect: !1,
                            selectedIds: [],
                            get filteredUsers() {
                                const query = this.searchQuery.trim();
                                if (!query) return this._usersList;
                                const queryForms = getSearchForms(query);
                                return queryForms.raw
                                    ? this._usersList.filter(
                                          (user) =>
                                              String(user.id || "").includes(
                                                  query,
                                              ) ||
                                              matchesChineseSearch(
                                                  user.nickname,
                                                  queryForms,
                                                  this.fuzzySearchEnabled,
                                              ) ||
                                              matchesChineseSearch(
                                                  user.memo,
                                                  queryForms,
                                                  this.fuzzySearchEnabled,
                                              ),
                                      )
                                    : this._usersList;
                            },
                            updateUser(id, updates) {
                                const before = this.getUserById(id);
                                before &&
                                    userStore.updateUser(
                                        id,
                                        updates,
                                        before.nickname || id,
                                    );
                            },
                            toggleMultiSelect() {
                                this.isMultiSelect = !this.isMultiSelect;
                                this.isMultiSelect || this.clearSelection();
                            },
                            clearSelection() {
                                this.selectedIds = [];
                            },
                            invertSelection(ids) {
                                if (0 === ids.length) return;
                                const current = new Set(this.selectedIds),
                                    next = new Set(current);
                                ids.forEach((id) => {
                                    next.has(id)
                                        ? next.delete(id)
                                        : next.add(id);
                                });
                                this.selectedIds = Array.from(next);
                            },
                            removeSelected() {
                                if (0 !== this.selectedIds.length) {
                                    userStore.removeUsers(this.selectedIds);
                                    this.clearSelection();
                                }
                            },
                            getRefreshTargets() {
                                return this.isMultiSelect
                                    ? this.selectedIds
                                          .map((id) => this._usersMap.get(id))
                                          .filter((user) => Boolean(user))
                                    : this._usersList;
                            },
                            setDisplayMode(mode) {
                                userStore.setDisplayMode(mode);
                            },
                            setFuzzySearchEnabled(next) {
                                const shouldEnable = Boolean(next);
                                if (shouldEnable !== this.fuzzySearchEnabled) {
                                    this.fuzzySearchEnabled = shouldEnable;
                                    setGmValue(
                                        "panelFuzzySearch",
                                        shouldEnable,
                                    );
                                }
                            },
                            setOpen(next) {
                                const shouldOpen = Boolean(next);
                                this.isOpen = shouldOpen;
                                shouldOpen && this.ensureUsersLoaded();
                            },
                            setPreloadAllCards(next) {
                                const shouldPreload = Boolean(next);
                                this.preloadAllCards = shouldPreload;
                                setPanelPreloadAllCards(shouldPreload);
                                if (shouldPreload) {
                                    if (this.hasLoadedUsers) return;
                                    this.syncUsersSnapshot(
                                        userStore.getUsers(),
                                    );
                                    this.hasLoadedUsers = !0;
                                    this.isUsersLoading = !1;
                                } else if (!this.isOpen) {
                                    this.resetUsersSnapshot();
                                    this.hasLoadedUsers = !1;
                                    this.isUsersLoading = !1;
                                }
                            },
                            async ensureUsersLoaded() {
                                if (this.hasLoadedUsers || this.isUsersLoading)
                                    return;
                                this.isUsersLoading = !0;
                                await (async function () {
                                    await (async function (
                                        frameCount = 0,
                                        idleTimeout = 1e3,
                                    ) {
                                        await (async function (count) {
                                            for (
                                                let index = 0;
                                                index < count;
                                                index += 1
                                            )
                                                await nextFrame();
                                        })(frameCount);
                                        await (function (timeout = 1e3) {
                                            return new Promise((resolve) => {
                                                const requestIdleCallback =
                                                    window.requestIdleCallback;
                                                requestIdleCallback
                                                    ? requestIdleCallback(
                                                          () => resolve(),
                                                          { timeout: timeout },
                                                      )
                                                    : window.setTimeout(
                                                          resolve,
                                                          0,
                                                      );
                                            });
                                        })(idleTimeout);
                                    })(5, 1e3);
                                })();
                                const latestUsers = userStore.getUsers();
                                this.syncUsersSnapshot(latestUsers);
                                this.hasLoadedUsers = !0;
                                this.isUsersLoading = !1;
                            },
                            async refreshData() {
                                const refreshTargets = this.getRefreshTargets();
                                if (
                                    !this.isRefreshing &&
                                    0 !== refreshTargets.length
                                ) {
                                    this.isRefreshing = !0;
                                    this.refreshCurrent = 0;
                                    this.refreshTotal = refreshTargets.length;
                                    try {
                                        const profiles = await (async function (
                                            users,
                                            onProgress,
                                        ) {
                                            const profiles = [],
                                                limit = pLimit(4);
                                            let aborted = !1;
                                            const tasks = users.map((user) =>
                                                limit(async () => {
                                                    try {
                                                        if (aborted) return;
                                                        const newData =
                                                            await getUserInfo(
                                                                String(user.id),
                                                            );
                                                        if (aborted) return;
                                                        if (!newData) {
                                                            aborted = !0;
                                                            return;
                                                        }
                                                        if (!newData.nickname)
                                                            return;
                                                        profiles.push({
                                                            id: user.id,
                                                            nickname:
                                                                newData.nickname,
                                                            avatar: newData.avatar,
                                                            isDeleted:
                                                                newData.isDeleted,
                                                        });
                                                    } catch (error) {
                                                        if (aborted) return;
                                                        logger_error(
                                                            `刷新用户 [${user.id}] 失败:`,
                                                            error,
                                                        );
                                                    } finally {
                                                        onProgress();
                                                    }
                                                }),
                                            );
                                            await Promise.allSettled(tasks);
                                            return profiles;
                                        })(refreshTargets, () => {
                                            this.refreshCurrent++;
                                        });
                                        userStore.updateUserProfiles(profiles);
                                    } finally {
                                        await delay(1e3);
                                        this.isRefreshing = !1;
                                    }
                                }
                            },
                            exportData() {
                                !(function (users) {
                                    const exportData = users.map((user) => {
                                            const data = {
                                                id: user.id,
                                                nickname: user.nickname,
                                                memo: user.memo || "",
                                            };
                                            user.avatar &&
                                                !isNoFaceAvatar(user.avatar) &&
                                                (data.avatar = user.avatar);
                                            !0 === user.isDeleted &&
                                                (data.isDeleted = !0);
                                            return data;
                                        }),
                                        jsonContent = JSON.stringify(
                                            exportData,
                                            null,
                                            2,
                                        ),
                                        blob = new Blob([jsonContent], {
                                            type: "application/json",
                                        }),
                                        url = URL.createObjectURL(blob),
                                        a = document.createElement("a");
                                    a.href = url;
                                    a.download = `bili-user-notes-${new Date().toISOString().split("T")[0]}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                })(this.users);
                                showAlert(
                                    `导出成功！\n已导出 ${this._usersList.length} 个用户的数据`,
                                );
                            },
                            async importData() {
                                const readResult = await (async function () {
                                    const file = await new Promise(
                                        (resolve) => {
                                            const input =
                                                document.createElement("input");
                                            let settled = !1;
                                            const finish = (file) => {
                                                if (!settled) {
                                                    settled = !0;
                                                    resolve(file);
                                                }
                                            };
                                            input.type = "file";
                                            input.accept = "application/json";
                                            input.onchange = () => {
                                                finish(
                                                    input.files?.[0] || null,
                                                );
                                            };
                                            input.oncancel = () => finish(null);
                                            input.click();
                                        },
                                    );
                                    if (!file) return { status: "cancelled" };
                                    try {
                                        const parsedData = JSON.parse(
                                                await file.text(),
                                            ),
                                            validation = (function (data) {
                                                const result = (function (
                                                    schema,
                                                    input,
                                                ) {
                                                    const dataset =
                                                        CombinedSchema["~run"](
                                                            { value: input },
                                                            getGlobalConfig(
                                                                void 0,
                                                            ),
                                                        );
                                                    return {
                                                        typed: dataset.typed,
                                                        success:
                                                            !dataset.issues,
                                                        output: dataset.value,
                                                        issues: dataset.issues,
                                                    };
                                                })(0, data);
                                                return result.success
                                                    ? { ok: !0 }
                                                    : {
                                                          ok: !1,
                                                          error: `格式不匹配: ${
                                                              ((issues =
                                                                  result.issues),
                                                              issues
                                                                  .slice(0, 2)
                                                                  .map(
                                                                      ({
                                                                          path: path,
                                                                          message:
                                                                              message,
                                                                      }) => {
                                                                          const pathStr =
                                                                              path
                                                                                  ?.map(
                                                                                      (
                                                                                          p,
                                                                                      ) =>
                                                                                          p.key,
                                                                                  )
                                                                                  .filter(
                                                                                      Boolean,
                                                                                  )
                                                                                  .join(
                                                                                      ".",
                                                                                  ) ||
                                                                              "";
                                                                          return pathStr
                                                                              ? `[${pathStr}] ${message}`
                                                                              : message;
                                                                      },
                                                                  )
                                                                  .join("; "))
                                                          }`,
                                                      };
                                                var issues;
                                            })(parsedData);
                                        if (!validation.ok)
                                            return {
                                                status: "error",
                                                message: `导入失败：${validation.error}`,
                                            };
                                        const importedUsers =
                                            normalizeUserCollection(
                                                parsedData,
                                                { requireNickname: !0 },
                                            );
                                        return 0 === importedUsers.length
                                            ? {
                                                  status: "error",
                                                  message:
                                                      "导入失败：没有有效的用户数据",
                                              }
                                            : {
                                                  status: "ok",
                                                  users: importedUsers,
                                              };
                                    } catch {
                                        return {
                                            status: "error",
                                            message:
                                                "导入失败：JSON 格式错误或数据解析失败",
                                        };
                                    }
                                })();
                                if ("cancelled" === readResult.status) return;
                                if ("error" === readResult.status) {
                                    showAlert(readResult.message);
                                    return;
                                }
                                const result = userStore.upsertImportedUsers(
                                    readResult.users,
                                );
                                showAlert(
                                    0 !== result.added || 0 !== result.updated
                                        ? `导入成功！\n新增：${result.added} 个用户\n更新：${result.updated} 个用户`
                                        : "导入完成，但没有可应用的变更",
                                );
                            },
                        };
                    alpinejs.default.store("userList", store);
                    const reactiveStore = alpinejs.default.store("userList");
                    shouldPreloadImmediately &&
                        reactiveStore.syncUsersSnapshot(userStore.getUsers());
                    const syncUsers = (users) => {
                        reactiveStore.hasLoadedUsers &&
                            reactiveStore.syncUsersSnapshot(users);
                    };
                    userStore.subscribe((change) => {
                        if ("displayMode" !== change.type)
                            if ("users" !== change.type) {
                                syncUsers(change.users);
                                reactiveStore.displayMode = change.displayMode;
                            } else syncUsers(change.users);
                        else reactiveStore.displayMode = change.displayMode;
                    });
                })();
                alpinejs.default.store("panelPrefs") ||
                    alpinejs.default.store(
                        "panelPrefs",
                        (function ({ getUserListStore: getUserListStore }) {
                            const initialOpenText = getGmValue(
                                    "btn_open_text",
                                    "UvU",
                                ),
                                initialCloseText = getGmValue(
                                    "btn_close_text",
                                    "UwU",
                                ),
                                initialDarkTheme = getGmValue("isDark", !1),
                                initialFontColor = getGmValue(
                                    "customFontColor",
                                    "",
                                ).trim(),
                                initialMemoCss = getGmValue(
                                    "customMemoCss",
                                    "",
                                );
                            return {
                                initialized: !1,
                                openText: persistWithGmStorage(
                                    "toggle.openText",
                                    initialOpenText,
                                ),
                                closeText: persistWithGmStorage(
                                    "toggle.closeText",
                                    initialCloseText,
                                ),
                                isDark: persistWithGmStorage(
                                    "theme.isDark",
                                    initialDarkTheme,
                                ),
                                customFontColor: persistWithGmStorage(
                                    "style.customFontColor",
                                    initialFontColor,
                                ),
                                customMemoCss: persistWithGmStorage(
                                    "style.customMemoCss",
                                    initialMemoCss,
                                ),
                                cssStatus: "",
                                showAdvancedCss: !1,
                                init() {
                                    if (this.initialized) return;
                                    this.initialized = !0;
                                    applyTheme(this.isDark);
                                    getUserListStore().isDark = this.isDark;
                                    const cssVarColor =
                                        document.documentElement.style
                                            .getPropertyValue(
                                                "--custom-font-color",
                                            )
                                            .trim();
                                    this.customFontColor =
                                        this.customFontColor || cssVarColor;
                                    applyCustomFontColor(this.customFontColor);
                                    this.applyMemoCss();
                                },
                                toggleTheme() {
                                    this.isDark = !this.isDark;
                                    getUserListStore().isDark = this.isDark;
                                    applyTheme(this.isDark);
                                },
                                editToggleText(isOpen) {
                                    const nextText = promptText(
                                        "修改文字:",
                                        isOpen ? this.openText : this.closeText,
                                    );
                                    nextText &&
                                        (isOpen
                                            ? (this.openText = nextText)
                                            : (this.closeText = nextText));
                                },
                                onCustomColorInput() {
                                    applyCustomFontColor(this.customFontColor);
                                },
                                clearCustomColor() {
                                    this.customFontColor = "";
                                    applyCustomFontColor("");
                                    showAlert("已取消自定义字体颜色");
                                },
                                closeAdvancedCss() {
                                    this.showAdvancedCss = !1;
                                },
                                applyMemoCss() {
                                    const nextCss = this.customMemoCss || "",
                                        result = (function (css) {
                                            const nextCss = css ?? "";
                                            if (
                                                !nextCss.trim() &&
                                                !CUSTOM_MEMO_STYLE_SHEET
                                            )
                                                return { ok: !0, ruleCount: 0 };
                                            try {
                                                CUSTOM_MEMO_STYLE_SHEET ||
                                                    (CUSTOM_MEMO_STYLE_SHEET =
                                                        new CSSStyleSheet());
                                                CUSTOM_MEMO_STYLE_SHEET.replaceSync(
                                                    nextCss,
                                                );
                                            } catch (error) {
                                                const message =
                                                    error instanceof Error
                                                        ? error.message
                                                        : `未知错误: ${String(error)}`;
                                                logger_warn(
                                                    "⚠️ 自定义备注 CSS 解析失败:",
                                                    error,
                                                );
                                                return {
                                                    ok: !1,
                                                    error: message,
                                                    ruleCount:
                                                        CUSTOM_MEMO_STYLE_SHEET
                                                            ?.cssRules.length ??
                                                        0,
                                                };
                                            }
                                            !(function () {
                                                const targets =
                                                    querySelectorAllDeep$1(
                                                        ".bili-memo-tag, .editable-textarea, .bili-memo-input",
                                                    );
                                                if (
                                                    !targets ||
                                                    0 === targets.length
                                                )
                                                    return;
                                                const roots = new Set();
                                                targets.forEach((el) => {
                                                    const root =
                                                        el.getRootNode();
                                                    (root instanceof
                                                        ShadowRoot ||
                                                        root instanceof
                                                            Document) &&
                                                        roots.add(root);
                                                });
                                                roots.forEach((root) =>
                                                    ensureMemoStyleSheets(root),
                                                );
                                            })();
                                            return {
                                                ok: !0,
                                                ruleCount:
                                                    CUSTOM_MEMO_STYLE_SHEET
                                                        .cssRules.length,
                                            };
                                        })(nextCss);
                                    this.cssStatus = (function (css, result) {
                                        const lintResult = (function (css) {
                                            const trimmedCss = css.trim();
                                            if (!trimmedCss) return null;
                                            let quote = null,
                                                escaped = !1,
                                                commentDepth = 0,
                                                braces = 0,
                                                parentheses = 0,
                                                brackets = 0;
                                            for (
                                                let index = 0;
                                                index < trimmedCss.length;
                                                index += 1
                                            ) {
                                                const current =
                                                        trimmedCss[index],
                                                    next =
                                                        trimmedCss[index + 1];
                                                if (commentDepth > 0) {
                                                    if (
                                                        "*" === current &&
                                                        "/" === next
                                                    ) {
                                                        commentDepth -= 1;
                                                        index += 1;
                                                    }
                                                } else if (quote) {
                                                    if (escaped) {
                                                        escaped = !1;
                                                        continue;
                                                    }
                                                    if ("\\" === current) {
                                                        escaped = !0;
                                                        continue;
                                                    }
                                                    current === quote &&
                                                        (quote = null);
                                                } else if (
                                                    "/" !== current ||
                                                    "*" !== next
                                                )
                                                    if (
                                                        "'" !== current &&
                                                        '"' !== current
                                                    ) {
                                                        "{" === current
                                                            ? (braces += 1)
                                                            : "}" === current
                                                              ? (braces -= 1)
                                                              : "(" === current
                                                                ? (parentheses += 1)
                                                                : ")" ===
                                                                    current
                                                                  ? (parentheses -= 1)
                                                                  : "[" ===
                                                                      current
                                                                    ? (brackets += 1)
                                                                    : "]" ===
                                                                          current &&
                                                                      (brackets -= 1);
                                                        if (braces < 0)
                                                            return "多余的 '}'";
                                                        if (parentheses < 0)
                                                            return "多余的 ')'";
                                                        if (brackets < 0)
                                                            return "多余的 ']'";
                                                    } else quote = current;
                                                else {
                                                    commentDepth += 1;
                                                    index += 1;
                                                }
                                            }
                                            return commentDepth > 0
                                                ? "注释未闭合"
                                                : quote
                                                  ? `字符串未闭合：${quote}`
                                                  : braces > 0
                                                    ? "缺少 '}'"
                                                    : parentheses > 0
                                                      ? "缺少 ')'"
                                                      : brackets > 0
                                                        ? "缺少 ']'"
                                                        : null;
                                        })(css);
                                        if (lintResult)
                                            return `CSS 语法警告：${lintResult}`;
                                        if (!result.ok)
                                            return `CSS 语法错误：${result.error || "无法解析"}`;
                                        const parsingWarning = (function (
                                            css,
                                            ruleCount,
                                        ) {
                                            if (!css.trim()) return null;
                                            if (0 !== (ruleCount || 0))
                                                return null;
                                            const strippedCss = css
                                                .replace(
                                                    /\/\*[\s\S]*?\*\//g,
                                                    "",
                                                )
                                                .replace(
                                                    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
                                                    "",
                                                );
                                            return /{/.test(strippedCss)
                                                ? "浏览器未解析出任何规则，可能语法错误被忽略"
                                                : null;
                                        })(css, result.ruleCount);
                                        return parsingWarning
                                            ? `CSS 解析警告：${parsingWarning}`
                                            : "";
                                    })(nextCss, result);
                                },
                            };
                        })({ getUserListStore: useUserListStore }),
                    );
                !(function () {
                    if (!panelComponentsRegistered) {
                        panelComponentsRegistered = !0;
                        !(function () {
                            if (!panelBindingsRegistered) {
                                panelBindingsRegistered = !0;
                                alpinejs.default.bind("panelImportBtn", () => ({
                                    type: "button",
                                    class: "panel-btn",
                                    title: "导入JSON文件，支持老格式",
                                    "@click": "userList.importData()",
                                }));
                                alpinejs.default.bind(
                                    "panelMultiSelectBtn",
                                    () => ({
                                        type: "button",
                                        title: "按Ctrl + A 全选 / 反选",
                                        ":class":
                                            "{ 'panel-btn': true, 'btn-active': userList.isMultiSelect }",
                                        "@click":
                                            "userList.toggleMultiSelect()",
                                    }),
                                );
                                alpinejs.default.bind(
                                    "panelRefreshBtn",
                                    () => ({
                                        type: "button",
                                        ":disabled":
                                            "userList.isRefreshing || (userList.isMultiSelect && userList.selectedIds.length === 0)",
                                        ":class":
                                            "{ 'panel-btn': true, 'btn-disabled': userList.isRefreshing || (userList.isMultiSelect && userList.selectedIds.length === 0) }",
                                        ":title":
                                            "userList.isRefreshing ? '正在同步 Bilibili 最新数据...' : (userList.isMultiSelect ? (userList.selectedIds.length === 0 ? '请选择要刷新的用户' : '刷新所选用户数据') : '刷新UP主名字和头像')",
                                        "@click": "userList.refreshData()",
                                    }),
                                );
                                alpinejs.default.bind("panelExportBtn", () => ({
                                    type: "button",
                                    class: "panel-btn",
                                    "@click": "userList.exportData()",
                                }));
                            }
                        })();
                        alpinejs.default.store("addUserDialog", {
                            isOpen: !1,
                            uid: "",
                            memo: "",
                            avatar: "",
                            isLoading: !1,
                            open() {
                                this.resetForm();
                                this.isOpen = !0;
                            },
                            close() {
                                this.isOpen = !1;
                            },
                            async submit() {
                                const uid = this.uid.trim(),
                                    memo = this.memo.trim();
                                if (!uid || !memo) return;
                                const avatar = this.avatar.trim();
                                if (!avatar || isValidAvatarUrl(avatar))
                                    if (
                                        userStore
                                            .getUsers()
                                            .find((u) => u.id === uid)
                                    )
                                        showAlert(`用户 UID:${uid} 已存在`);
                                    else {
                                        this.isLoading = !0;
                                        try {
                                            const userInfo =
                                                await getUserInfo(uid);
                                            if (
                                                !userInfo ||
                                                !userInfo.nickname
                                            ) {
                                                showAlert(
                                                    `无法获取 UID:${uid} 的用户信息`,
                                                );
                                                return;
                                            }
                                            userStore.upsertImportedUsers([
                                                {
                                                    id: uid,
                                                    nickname: userInfo.nickname,
                                                    avatar:
                                                        avatar ||
                                                        (userInfo.avatar ??
                                                            "https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif"),
                                                    memo: memo,
                                                    isDeleted:
                                                        userInfo.isDeleted,
                                                },
                                            ]);
                                            this.close();
                                            showAlert(
                                                `成功添加用户: ${userInfo.nickname}`,
                                            );
                                        } catch (error) {
                                            showAlert(`添加用户失败: ${error}`);
                                        } finally {
                                            this.isLoading = !1;
                                        }
                                    }
                                else
                                    showAlert(
                                        "请输入有效的 http(s) 或 data: 头像 URL",
                                    );
                            },
                            resetForm() {
                                this.uid = "";
                                this.memo = "";
                                this.avatar = "";
                                this.isLoading = !1;
                            },
                        });
                        alpinejs.default.data("panelShell", () => ({
                            init() {
                                getPanelPrefsStore().init();
                            },
                            get isOpen() {
                                return getUserListStore().isOpen;
                            },
                            set isOpen(next) {
                                getUserListStore().setOpen(next);
                            },
                            handleSelectAll(event) {
                                const userList = getUserListStore();
                                if (
                                    userList.isMultiSelect &&
                                    (event.ctrlKey || event.metaKey) &&
                                    "a" === event.key.toLowerCase()
                                ) {
                                    event.preventDefault();
                                    userList.invertSelection(
                                        userList.filteredUsers.map(
                                            (user) => user.id,
                                        ),
                                    );
                                }
                            },
                        }));
                        alpinejs.default.data("panelToggleBtn", () => ({
                            get prefs() {
                                return getPanelPrefsStore();
                            },
                            get isOpen() {
                                return getUserListStore().isOpen;
                            },
                            set isOpen(next) {
                                getUserListStore().setOpen(next);
                            },
                            get openText() {
                                return this.prefs.openText;
                            },
                            get closeText() {
                                return this.prefs.closeText;
                            },
                            togglePanel() {
                                this.isOpen = !this.isOpen;
                            },
                            editToggleText() {
                                this.prefs.editToggleText(this.isOpen);
                            },
                        }));
                        alpinejs.default.data("panelSettings", () => ({
                            displayModes: DISPLAY_MODE_OPTIONS,
                            get userList() {
                                return getUserListStore();
                            },
                            get prefs() {
                                return getPanelPrefsStore();
                            },
                            get displayModeProxy() {
                                return this.userList.displayMode;
                            },
                            set displayModeProxy(mode) {
                                this.userList.setDisplayMode(Number(mode));
                            },
                            get isDark() {
                                return this.prefs.isDark;
                            },
                            get customFontColor() {
                                return this.prefs.customFontColor;
                            },
                            set customFontColor(next) {
                                this.prefs.customFontColor = next;
                            },
                            get customMemoCss() {
                                return this.prefs.customMemoCss;
                            },
                            set customMemoCss(next) {
                                this.prefs.customMemoCss = next;
                            },
                            get cssStatus() {
                                return this.prefs.cssStatus;
                            },
                            get showAdvancedCss() {
                                return this.prefs.showAdvancedCss;
                            },
                            syncAdvancedCssDialog() {
                                const dialog = getRef(this, "memoCssDialog");
                                if (dialog)
                                    if (!this.showAdvancedCss || dialog.open)
                                        !this.showAdvancedCss &&
                                            dialog.open &&
                                            dialog.close();
                                    else {
                                        dialog.showModal();
                                        runOnNextTick(this, () => {
                                            getRef(
                                                this,
                                                "memoCssInput",
                                            )?.focus();
                                        });
                                    }
                            },
                            toggleTheme() {
                                this.prefs.toggleTheme();
                            },
                            onCustomColorInput() {
                                this.prefs.onCustomColorInput();
                            },
                            closeAdvancedCss() {
                                this.prefs.closeAdvancedCss();
                            },
                            handleColorSettingContextMenu(event) {
                                event.preventDefault();
                                this.prefs.showAdvancedCss =
                                    !this.prefs.showAdvancedCss;
                            },
                            handleColorSettingMouseDown(event) {
                                if (1 === event.button) {
                                    event.preventDefault();
                                    this.prefs.clearCustomColor();
                                }
                            },
                            applyMemoCss() {
                                this.prefs.applyMemoCss();
                            },
                        }));
                        alpinejs.default.data("panelActions", () => ({
                            draftSearchQuery: "",
                            get userList() {
                                return getUserListStore();
                            },
                            init() {
                                this.draftSearchQuery =
                                    this.userList.searchQuery;
                            },
                            commitSearch() {
                                this.applySearchQuery();
                            },
                            applySearchQuery() {
                                this.userList.searchQuery =
                                    this.draftSearchQuery.trim();
                            },
                            toggleFuzzySearch(event) {
                                this.userList.setFuzzySearchEnabled(
                                    event.target.checked,
                                );
                            },
                            confirmRemoveSelected() {
                                const count = this.userList.selectedIds.length;
                                0 !== count &&
                                    confirmDialog(
                                        `确定要删除所选 ${count} 个用户吗？`,
                                    ) &&
                                    this.userList.removeSelected();
                            },
                        }));
                        alpinejs.default.data("userCard", (userId) => ({
                            userId: userId,
                            get userList() {
                                return getUserListStore();
                            },
                            get currentUser() {
                                return this.userList.getUserById(this.userId);
                            },
                            get isSelected() {
                                return this.userList.selectedIds.includes(
                                    this.userId,
                                );
                            },
                            get isMultiSelect() {
                                return this.userList.isMultiSelect;
                            },
                            get selectedIds() {
                                return this.userList.selectedIds;
                            },
                            set selectedIds(next) {
                                this.userList.selectedIds = next;
                            },
                            toggleSelected() {
                                const next = new Set(this.userList.selectedIds);
                                next.has(this.userId)
                                    ? next.delete(this.userId)
                                    : next.add(this.userId);
                                this.userList.selectedIds = Array.from(next);
                            },
                            handleCardClick(event) {
                                if (!this.isMultiSelect) return;
                                const target = event.target;
                                if (target && !target.closest(".user-select")) {
                                    event.preventDefault();
                                    this.toggleSelected();
                                }
                            },
                            confirmRemove() {
                                confirmDialog("确定要删除吗？") &&
                                    this.userList.removeUser(this.userId);
                            },
                        }));
                        alpinejs.default.data("copyableUid", (uid) => ({
                            uid: uid,
                            copied: !1,
                            canExpand: !1,
                            get isMultiSelect() {
                                return getUserListStore().isMultiSelect;
                            },
                            init() {
                                this.refreshOverflow();
                            },
                            refreshOverflow() {
                                runOnNextTick(this, () => {
                                    const element = this.$el;
                                    element &&
                                        (this.canExpand =
                                            element.scrollWidth >
                                            element.clientWidth);
                                });
                            },
                            handleMouseEnter() {
                                this.refreshOverflow();
                            },
                            handleMouseLeave() {
                                this.canExpand = !1;
                            },
                            copy() {
                                if (!this.isMultiSelect) {
                                    navigator.clipboard.writeText(
                                        `UID:${this.uid}`,
                                    );
                                    this.copied = !0;
                                    window.setTimeout(() => {
                                        this.copied = !1;
                                    }, 500);
                                    this.refreshOverflow();
                                }
                            },
                            get displayText() {
                                return this.copied ? "✅ 已复制" : this.uid;
                            },
                        }));
                        alpinejs.default.data("avatarEditor", (userId) => ({
                            userId: userId,
                            get userList() {
                                return getUserListStore();
                            },
                            get currentUser() {
                                return this.userList.getUserById(this.userId);
                            },
                            get currentAvatar() {
                                return this.currentUser?.avatar || "";
                            },
                            get canEditAvatar() {
                                return isNoFaceAvatar(this.currentAvatar);
                            },
                            get avatarTitle() {
                                return this.canEditAvatar
                                    ? "右键修改头像"
                                    : this.currentUser?.nickname || this.userId;
                            },
                            editAvatar(event) {
                                if (
                                    this.userList.isMultiSelect ||
                                    !this.canEditAvatar
                                )
                                    return;
                                event.preventDefault();
                                const nextAvatar = promptText("请输入头像 URL");
                                nextAvatar &&
                                    (isValidAvatarUrl(nextAvatar)
                                        ? this.userList.updateUser(
                                              this.userId,
                                              { avatar: nextAvatar },
                                          )
                                        : showAlert(
                                              "请输入有效的 http(s) 或 data: 头像 URL",
                                          ));
                            },
                        }));
                        alpinejs.default.data(
                            "memoEditor",
                            (userId, initialMemo = "") => ({
                                userId: userId,
                                isEditing: !1,
                                memoDraft: String(initialMemo ?? ""),
                                get userList() {
                                    return getUserListStore();
                                },
                                get isMultiSelect() {
                                    return this.userList.isMultiSelect;
                                },
                                get currentMemo() {
                                    return (
                                        this.userList.getUserById(this.userId)
                                            ?.memo || ""
                                    );
                                },
                                syncDraft() {
                                    this.isEditing ||
                                        (this.memoDraft = this.currentMemo);
                                },
                                startEdit() {
                                    if (!this.isMultiSelect) {
                                        this.isEditing = !0;
                                        runOnNextTick(this, () => {
                                            getRef(this, "memoInput")?.focus();
                                        });
                                    }
                                },
                                commit() {
                                    this.isEditing = !1;
                                    const nextMemo =
                                        "string" == typeof this.memoDraft
                                            ? this.memoDraft
                                            : String(this.memoDraft ?? "");
                                    this.userList.updateUser(this.userId, {
                                        memo: nextMemo,
                                    });
                                },
                                cancel() {
                                    this.memoDraft = this.currentMemo;
                                    this.isEditing = !1;
                                },
                                blurInput() {
                                    getRef(this, "memoInput")?.blur();
                                },
                                handleInput(input) {
                                    if (input.value.length >= input.maxLength) {
                                        input.setCustomValidity(
                                            "已达到最大长度：24 字符",
                                        );
                                        input.reportValidity();
                                    } else input.setCustomValidity("");
                                },
                            }),
                        );
                        alpinejs.default.data(
                            "uidFixLink",
                            (uid, isDeleted) => ({
                                uid: uid,
                                isDeleted: isDeleted,
                                async init() {
                                    const el = this.$el;
                                    if (processedUID.has(el)) return;
                                    processedUID.add(el);
                                    const api = await biliFixAPIReady();
                                    api &&
                                        this.isDeleted &&
                                        api.annotateElements([el]);
                                },
                            }),
                        );
                    }
                })();
                const finalHtml =
                        '<div x-data="panelShell" x-init="init()" x-show="true" class="panel-container" :class="{ open: isOpen, closed: !isOpen }" @keydown.window="handleSelectAll($event)" x-cloak><div class="panel-inner" x-data="panelSettings"><button class="panel-toggle-btn" title="右键点击修改文本~" x-data="panelToggleBtn" @click="togglePanel()" @contextmenu.prevent="editToggleText()" x-text="isOpen ? openText : closeText" :style="isOpen ? \'opacity: 1;\' : \'opacity: 0.3;\'" ></button><div class="panel-mode-section"><div class="panel-mode-label">昵称显示模式：</div><template x-for="mode in displayModes" :key="mode.value"><div class="panel-mode-option"><input type="radio" name="memoMode" :value="mode.value" :id="`panel-memo-mode-${mode.value}`" x-model.number="displayModeProxy" /><label :for="`panel-memo-mode-${mode.value}`" x-text="mode.label"></label></div></template><div class="panel-right-actions"><label class="panel-custom-color-setting" @click="closeAdvancedCss()" @contextmenu="handleColorSettingContextMenu($event)" @mousedown="handleColorSettingMouseDown($event)" ><span class="setting-text" title="左键自定义颜色&#10;右键自定义样式&#10;中键清除自定义样式" >自定义备注颜色</span ><div class="color-preview" @click.stop="$refs.panelColorInput?.click()" ></div><input x-ref="panelColorInput" type="color" class="ghost-color-picker" x-model="customFontColor" @input.debounce.100ms="onCustomColorInput()" /></label></div><div class="panel-theme-toggle" @click="toggleTheme()"><svg x-show="!isDark" alt="sun" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></svg><svg x-show="isDark" alt="moon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" /></svg></div></div><div class="panel-control-bar" x-data="panelActions"><button x-bind="panelImportBtn">导入</button><button class="panel-btn" @click="$store.addUserDialog.open()" title="手动添加用户">添加</button><button x-bind="panelMultiSelectBtn"><span x-show="!userList.isMultiSelect">多选用户</span><span x-show="userList.isMultiSelect">退出多选</span></button><button class="panel-icon-btn" x-show="userList.isMultiSelect" x-transition.opacity.scale :disabled="userList.selectedIds.length === 0" @click="confirmRemoveSelected()" title="删除所选用户" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg><span class="panel-icon-text" x-show="userList.isMultiSelect" >已选 <span x-text="userList.selectedIds.length"></span ></span></button><div class="panel-title">备注列表</div><button x-bind="panelRefreshBtn"><span x-show="!userList.isRefreshing && (!userList.isMultiSelect || userList.selectedIds.length === 0)">⚡一键刷新数据</span><span x-show="!userList.isRefreshing && userList.isMultiSelect && userList.selectedIds.length > 0">⚡刷新所选</span><span x-show="userList.isRefreshing" class="refresh-content"><span class="loading-spinner">⏳</span> 正在刷新 (<span x-text="userList.refreshCurrent"></span>/<span x-text="userList.refreshTotal" ></span >) </span></button><search class="panel-search-box"><form class="panel-search-form" @submit.prevent="commitSearch()"><input id="searchInput" type="search" name="bilibili-user-memo-panel-search" autocomplete="on" placeholder="搜索昵称、备注或ID..." title="输入实时搜索，按 Enter 记录搜索历史" class="panel-search-input" x-model="draftSearchQuery" @input="if (!$el.value.trim()) userList.searchQuery = \'\'" @input.debounce.200ms="applySearchQuery()" /></form></search><label class="panel-fuzzy-search-toggle" title="模糊匹配：支持子序列/部分匹配"><input type="checkbox" :checked="userList.fuzzySearchEnabled" @change="toggleFuzzySearch($event)" /><span>模糊搜索</span></label><button x-bind="panelExportBtn">导出</button></div><dialog x-ref="memoCssDialog" class="panel-custom-css-section" x-effect="syncAdvancedCssDialog()" @close="closeAdvancedCss()" @click.self="closeAdvancedCss()" ><div class="panel-custom-css-header"><div class="panel-custom-css-title">自定义备注样式（CSS）</div><button type="button" class="panel-custom-css-close" @click="closeAdvancedCss()" aria-label="关闭自定义备注样式" > &times; </button></div><textarea x-ref="memoCssInput" class="panel-custom-css-input" x-model="customMemoCss" @input.debounce.700ms="applyMemoCss()" @blur="applyMemoCss()" placeholder="示例：&#10;.bili-memo-tag {&#10;&#32;&#32;font-style: italic;&#10;&#32;&#32;letter-spacing: 0.5px;&#10;}&#10;.editable-textarea {&#10;&#32;&#32;background: rgba(0,0,0,0.08);&#10;&#32;&#32;border-bottom: 2px solid currentColor;&#10;}" ></textarea><div class="panel-custom-css-status" x-show="cssStatus" x-transition.opacity role="status" aria-live="polite" x-text="cssStatus" ></div><div class="panel-custom-css-hint"> 这里支持完整 CSS 选择器。只影响备注相关元素时，建议用 .bili-memo-tag / .editable-textarea / .bili-memo-input </div></dialog><div class="panel-users-container"><div><div x-show="$store.userList.isOpen && $store.userList.isUsersLoading" class="panel-loading-state" > 加载中... </div><div x-show="$store.userList.hasLoadedUsers" class="panel-users-list" ><template x-for="user in $store.userList.filteredUsers" :key="user.id"> ${boxTemplate} </template><div x-show="$store.userList.filteredUsers.length === 0" class="panel-empty-state"> 没有找到用户 </div></div></div></div></div></div>\x3c!-- 添加用户对话框 --\x3e<dialog x-data class="add-user-dialog" :open="$store.addUserDialog.isOpen" x-effect="if ($store.addUserDialog.isOpen) $nextTick(() => $refs.addUserUid?.focus())" @keydown.escape.window="$store.addUserDialog.close()"><div class="add-user-dialog-backdrop" @click.self="$store.addUserDialog.close()"><div class="add-user-dialog-content"><div class="add-user-dialog-header"><h3>添加用户</h3><button type="button" class="add-user-dialog-close" @click="$store.addUserDialog.close()" > &times; </button></div><form class="add-user-dialog-form" @submit.prevent="$store.addUserDialog.submit()"><div class="add-user-dialog-body"><div class="add-user-field"><label for="add-user-uid">UID <span class="required">*</span></label><input id="add-user-uid" type="text" inputmode="numeric" pattern="[0-9]+" title="UID 只能包含数字" required x-ref="addUserUid" x-model.trim="$store.addUserDialog.uid" placeholder="请输入用户 UID" :disabled="$store.addUserDialog.isLoading" /></div><div class="add-user-field"><label for="add-user-memo">备注 <span class="required">*</span></label><input id="add-user-memo" type="text" pattern=".*\\S.*" title="请输入备注" required x-model.trim="$store.addUserDialog.memo" placeholder="请输入备注（必填）" :disabled="$store.addUserDialog.isLoading" /></div><div class="add-user-field"><label for="add-user-avatar">头像 URL（可选）</label><input id="add-user-avatar" type="text" x-model.trim="$store.addUserDialog.avatar" placeholder="留空将自动获取头像，支持 http(s) 或 data:" :disabled="$store.addUserDialog.isLoading" /></div></div><div class="add-user-dialog-footer"><button type="submit" class="panel-btn add-user-submit" :disabled="$store.addUserDialog.isLoading" ><span x-show="$store.addUserDialog.isLoading">添加中...</span><span x-show="!$store.addUserDialog.isLoading">添加</span></button><button type="button" class="panel-btn panel-btn-secondary" @click="$store.addUserDialog.close()" > 取消 </button></div></form></div></div></dialog>'
                            .replace("${appName}", "备注管理")
                            .replace(
                                "${boxTemplate}",
                                '<div class="user-box" x-data="userCard(user.id)" x-show="currentUser" :class="{ \'is-selected\': isSelected, \'multi-select\': isMultiSelect }" @click="handleCardClick($event)"><label class="user-select" x-show="isMultiSelect" @click.stop><input type="checkbox" :value="user.id" x-model="selectedIds" @click.stop /><span class="user-select-mark"></span></label><div class="user-avatar-wrapper" x-data="avatarEditor(user.id)" @contextmenu="editAvatar($event)" :title="avatarTitle" ><img :src="currentUser?.avatar || \'\'" class="user-avatar" :alt="currentUser?.nickname || user.id" loading="lazy" decoding="async" /></div><div class="user-info-section"><div class="user-info-label">BilibiliID</div><div class="user-id" x-data="copyableUid(user.id)" x-init="init()" x-text="displayText" @click="copy()" @mouseenter="handleMouseEnter()" @mouseleave="handleMouseLeave()" :class="{ \'copied-status\': copied, \'can-expand\': canExpand }" :title="copied ? \'\' : \'点击复制 ID\'" ></div></div><div class="user-nickname-section" :title="currentUser?.nickname || user.id"><div class="user-info-label">昵称</div><a :href="\'https://space.bilibili.com/\' + user.id" target="_blank" class="user-nickname-link" :class="{ \'is-deleted\': currentUser?.isDeleted }" x-text="currentUser?.nickname || user.id" x-data="uidFixLink(user.id, currentUser?.isDeleted)" x-init="init()" :title="currentUser?.isDeleted ? \'该用户已标注为已注销\' : (currentUser?.nickname || user.id)" ></a></div><div class="user-note-section" x-data="memoEditor(user.id, currentUser?.memo || \'\')" x-effect="syncDraft()"><div class="user-info-label">备注</div><input x-ref="memoInput" x-model="memoDraft" :readonly="!isEditing" :class="{ \'editing\': isEditing }" class="user-note-input" @click="startEdit()" @blur="commit()" @keydown.enter.prevent="blurInput()" @keydown.escape.prevent="cancel(); blurInput()" maxlength="24" @input="handleInput($el)" /></div><svg class="delete-btn" @click="confirmRemove()" x-show="!isMultiSelect" title="删除用户" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>',
                            ),
                    container = markOwnedElement(document.createElement("div"));
                container.id = "bili-memo-container";
                container.innerHTML = finalHtml;
                document.body.appendChild(container);
            })();
        }
    })();
})(Alpine, querySelectorShadowDom, OpenCC);
