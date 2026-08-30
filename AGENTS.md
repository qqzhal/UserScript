【基础设定】全程使用中文进行对话和思考。
【工具规则】当需要访问外部网址时，如果默认连接失败，请使用代理地址 http://127.0.0.1:10808 重试。
【设计稿流程】出 UI 设计稿/落地页时优先用 stitch MCP：
0. 开始设计前先建议并使用 ui-ux-pro-max skill（search.py 查设计系统/落地页结构/表单UX等），把结论结合用户已确认的主题约束转译成 stitch 生成prompt；skill推荐与用户明确要求冲突时以用户为准（如已定亮色蓝主题则不采纳其暗色方案）。
1. create_project 后取 projects/<id> 中的数字作项目id。
2. generate_screen_from_text 生成（多页逐屏生成），响应内已含状态与下载链接，COMPLETE 即可下载；改稿用 edit_screens，会生成新屏幕（旧屏保留），存入 v<N+1> 新目录；用户说"出v2/v3"按其版本号建目录，改哪说哪（指定某屏只传该屏id，说全部屏幕才全改）。
3. 每屏用响应内链接同批下载到 stitch-designs/<项目id>-v<N>/：
   - screenshot.downloadUrl 末尾加 =s0 才是原图（否则仅约512px缩略图），存为 01-页面名.png
   - htmlCode.downloadUrl 存为同名 .html（临时签名链接会过期，须与PNG同批下；纯图片屏无此链接则跳过）
   - 链接缺失用 get_screen 按屏幕id直查补拿，勿依赖 list_screens（索引延迟且改稿后只返回旧屏；仅多页汇总时用它并按id核对）
4. 每屏下载后记下屏幕id（响应输出可能截断，id在screens[0].id），并在该v目录维护 屏幕清单.md：记录 屏幕id↔页面名↔是否现行版，改稿产生新id后同步更新；跨会话/多屏项目靠它区分新旧版本。
5. 对话中用 Markdown 绝对路径展示 PNG；要改则按第2条继续 edit_screens 出新版。
6. 客户定稿（用户说"定稿/final"）：把定稿v目录的 PNG+HTML 复制到 stitch-designs/<项目id>-final/，生成 index.html 预览页串起所有页面（本地可直接打开浏览），供打包发客户；正式交付用已存 HTML（Tailwind CDN 版，上线时编译为独立CSS）。
