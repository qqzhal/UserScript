# -*- coding: utf-8 -*-
"""html2png - HTML 转高清 PNG 截图核心模块

命令行用法:
  py -3 html2png.py 页面1.html 页面2.html        # 全页截图, 1920宽, 2倍高清
  py -3 html2png.py 页面.html -w 1440 --scale 1  # 指定宽度/关闭高清
  py -3 html2png.py *.html --viewport            # 只截首屏
  py -3 html2png.py 页面.html --keep-motion      # 保留入场动画(默认跳过)
"""
import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

# 分段滚动到底再回顶: 触发懒加载图片与滚动显示元素
SCROLL_JS = """
    async () => {
        await new Promise((resolve) => {
            const limit = () => Math.max(document.body.scrollHeight,
                                         document.documentElement.scrollHeight);
            const step = Math.max(400, Math.round(window.innerHeight * 0.6));
            let total = 0;
            const timer = setInterval(() => {
                window.scrollBy(0, step);
                total += step;
                if (total >= limit()) {
                    clearInterval(timer);
                    window.scrollTo(0, 0);
                    resolve();
                }
            }, 120);
        });
    }
"""


def convert_file(page, src, width=1920, scale=2, full_page=True,
                 reduce_motion=True, timeout=60):
    """转换单个 HTML。page: 已打开的 playwright Page。返回输出路径。"""
    src, out = Path(src), Path(src).with_suffix(".png")
    page.set_viewport_size({"width": width, "height": 900})
    # 模拟"减少动态效果", 支持该约定的页面会跳过入场动画直接显示全部内容
    if reduce_motion:
        page.emulate_media(reduced_motion="reduce")
    page.goto(src.as_uri(), timeout=timeout * 1000, wait_until="networkidle")
    page.evaluate("document.fonts.ready")
    page.evaluate(SCROLL_JS)
    page.wait_for_timeout(1000)
    page.screenshot(path=str(out), full_page=full_page)
    return out


def convert_files(files, width=1920, scale=2, full_page=True,
                  reduce_motion=True, timeout=60, progress=None):
    """批量转换。progress: 可选回调 progress(kind, message), kind 为 'log'/'done'。
    返回 (成功数, 失败数)。"""
    def emit(kind, msg):
        if progress:
            progress(kind, msg)

    ok = fail = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        page = browser.new_page(viewport={"width": width, "height": 900},
                                device_scale_factor=scale)
        for f in files:
            src = Path(f)
            emit("log", f"转换: {src.name}")
            try:
                out = convert_file(page, src, width, scale, full_page,
                                   reduce_motion, timeout)
                emit("log", f"  OK -> {out.name} ({out.stat().st_size / 1024:.0f} KB)")
                ok += 1
            except Exception as e:
                emit("log", f"  失败: {e}")
                fail += 1
        browser.close()
    emit("done", f"完成: 成功 {ok} 个, 失败 {fail} 个")
    return ok, fail


def main():
    ap = argparse.ArgumentParser(description="HTML 转高清 PNG 截图")
    ap.add_argument("html", nargs="+", help="HTML 文件路径(可多个)")
    ap.add_argument("-w", "--width", type=int, default=1920, help="视口宽度 (默认1920)")
    ap.add_argument("--scale", type=float, default=2, help="缩放倍数 (默认2=高清)")
    ap.add_argument("--viewport", action="store_true", help="只截首屏视口而非全页")
    ap.add_argument("--keep-motion", action="store_true",
                    help="保留入场动画 (默认模拟 reduced-motion 跳过)")
    ap.add_argument("--timeout", type=int, default=60, help="加载超时秒数 (默认60)")
    args = ap.parse_args()

    missing = [f for f in args.html if not Path(f).exists()]
    if missing:
        sys.exit("文件不存在: " + ", ".join(missing))

    convert_files(args.html, width=args.width, scale=args.scale,
                  full_page=not args.viewport,
                  reduce_motion=not args.keep_motion,
                  timeout=args.timeout,
                  progress=lambda kind, msg: print(msg))


if __name__ == "__main__":
    main()
