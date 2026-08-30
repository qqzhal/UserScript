# -*- coding: utf-8 -*-
"""html2png GUI - HTML 批量转高清 PNG 截图工具 (调用 html2png 核心模块)"""
import queue
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

from html2png import convert_files

APP_TITLE = "HTML 转高清截图工具"

class App:
    def __init__(self, root):
        self.root = root
        root.title(APP_TITLE)
        root.geometry("780x560")
        self.files = []
        self.q = queue.Queue()
        self.running = False
        self._build_ui()
        self.root.after(100, self._poll_log)

    def _build_ui(self):
        top = ttk.Frame(self.root, padding=8)
        top.pack(fill="x")
        ttk.Button(top, text="添加 HTML", command=self.add_files).pack(side="left")
        ttk.Button(top, text="移除选中", command=self.remove_selected).pack(side="left", padx=6)
        ttk.Button(top, text="清空列表", command=self.clear_all).pack(side="left")

        mid = ttk.Frame(self.root, padding=(8, 0))
        mid.pack(fill="both", expand=True)
        self.listbox = tk.Listbox(mid, selectmode="extended", activestyle="dotbox")
        sb = ttk.Scrollbar(mid, orient="vertical", command=self.listbox.yview)
        self.listbox.config(yscrollcommand=sb.set)
        self.listbox.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        opt = ttk.Frame(self.root, padding=8)
        opt.pack(fill="x")
        ttk.Label(opt, text="视口宽度:").pack(side="left")
        self.width_var = tk.StringVar(value="1920")
        w = ttk.Combobox(opt, textvariable=self.width_var, width=8, state="readonly",
                         values=["1280", "1366", "1440", "1600", "1920", "2560"])
        w.pack(side="left", padx=(4, 16))
        self.hidpi = tk.BooleanVar(value=True)
        ttk.Checkbutton(opt, text="2倍高清", variable=self.hidpi).pack(side="left")
        self.viewport_only = tk.BooleanVar(value=False)
        ttk.Checkbutton(opt, text="仅截首屏", variable=self.viewport_only).pack(side="left", padx=16)
        self.reduce_motion = tk.BooleanVar(value=True)
        ttk.Checkbutton(opt, text="跳过入场动画", variable=self.reduce_motion).pack(side="left", padx=16)

        act = ttk.Frame(self.root, padding=(8, 0))
        act.pack(fill="x")
        self.btn = ttk.Button(act, text="开始转换", command=self.start_convert)
        self.btn.pack(side="left")

        logf = ttk.LabelFrame(self.root, text="日志", padding=4)
        logf.pack(fill="both", expand=True, padx=8, pady=8)
        self.log = scrolledtext.ScrolledText(logf, height=10, state="disabled")
        self.log.pack(fill="both", expand=True)

        self.status = ttk.Label(self.root, text="就绪", anchor="w", padding=(8, 2))
        self.status.pack(fill="x")

    # ---------- 列表操作 ----------
    def add_files(self):
        paths = filedialog.askopenfilenames(
            title="选择 HTML 文件",
            filetypes=[("HTML 文件", "*.html *.htm"), ("所有文件", "*.*")])
        added = 0
        for p in paths:
            if p not in self.files:
                self.files.append(p)
                self.listbox.insert("end", p)
                added += 1
        self._set_status(f"已添加 {added} 个文件，共 {len(self.files)} 个")

    def remove_selected(self):
        for i in reversed(self.listbox.curselection()):
            self.listbox.delete(i)
            self.files.pop(i)
        self._set_status(f"剩余 {len(self.files)} 个文件")

    def clear_all(self):
        self.files.clear()
        self.listbox.delete(0, "end")
        self._set_status("已清空")

    # ---------- 转换 ----------
    def start_convert(self):
        if self.running:
            return
        if not self.files:
            messagebox.showwarning(APP_TITLE, "请先添加 HTML 文件")
            return
        try:
            width = int(self.width_var.get())
        except ValueError:
            messagebox.showerror(APP_TITLE, "宽度必须是数字")
            return
        self.running = True
        self.btn.config(state="disabled")
        self._log(f"开始转换 {len(self.files)} 个文件 ...")
        scale = 2 if self.hidpi.get() else 1
        full = not self.viewport_only.get()
        reduce_motion = self.reduce_motion.get()
        q = self.q
        threading.Thread(
            target=convert_files,
            kwargs=dict(files=list(self.files), width=width, scale=scale,
                        full_page=full, reduce_motion=reduce_motion,
                        progress=lambda kind, msg: q.put((kind, msg))),
            daemon=True).start()

    # ---------- 日志 ----------
    def _log(self, msg):
        self.log.config(state="normal")
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.log.config(state="disabled")

    def _poll_log(self):
        try:
            while True:
                kind, msg = self.q.get_nowait()
                self._log(msg)
                if kind == "done":
                    self._set_status(msg)
                    self.running = False
                    self.btn.config(state="normal")
                    messagebox.showinfo(APP_TITLE, msg)
        except queue.Empty:
            pass
        self.root.after(100, self._poll_log)

    def _set_status(self, text):
        self.status.config(text=text)

if __name__ == "__main__":
    root = tk.Tk()
    try:
        style = ttk.Style()
        if "vista" in style.theme_names():
            style.theme_use("vista")
    except Exception:
        pass
    App(root)
    root.mainloop()
