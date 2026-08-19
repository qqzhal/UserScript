// ==UserScript==
// @name         Bilibili 本地弹幕（美化版）
// @name:en      Bilibili Local Danmaku (Beautified)
// @namespace    https://github.com/YourName/bilibili-local-danmaku
// @version      1.0.0
// @description  全新毛玻璃界面：手动加载 XML 弹幕、录播姬特殊弹幕（SC/礼物/舰长/ID）显示、手动精调偏移、弹幕搜索定点对齐、密度图与进度条预览。
// @description:en Beautified UI: load local XML danmaku, live-recording special danmaku (SC/Gift/Guard), fine-tuning, search-based alignment, density graph & progress preview.
// @author       Codex
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/bangumi/*
// @icon         https://www.bilibili.com/favicon.ico
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @license      MIT
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[本地弹幕] 美化版 v1.1.0 已启动', 'color:#fb7299;font-weight:bold;');

    // ==================== 状态与常量 ====================
    let danmakuList = [];
    let videoElement = null;
    let videoWrap = null;
    let danmakuOverlay = null;
    let densityCanvas = null;
    let progressContainer = null;
    let danmakuTooltip = null;
    let lastHoverTime = -1;

    let nextDanmakuIndex = 0;

    let danmakuCache = new Map();
    const MERGE_DURATION = 30.0;
    // 轨道占用表：行号 -> 当前占用该轨道的弹幕数
    const trackOccupancy = new Map();

    const MAX_SCALE = 2.5;
    const MAX_PREVIEW_LINES = 10;
    const PREVIEW_WINDOW_SECONDS = 1.0;
    // 弹幕滚动时长（秒）：合并弹幕按条数对数加成，跑得更慢、停留更久，可自行微调
    const DM_SCROLL_DURATION = 8.0;
    const DM_MERGE_DURATION_BONUS = 6.0;

    const DM_OFFSET_KEY = 'ldx-offset';
    const OFFSET_MEMORY_LIMIT = 5.0; // 偏移记忆阈值（秒）：绝对值在此范围内才跨视频沿用，超过则加载时重置为 0，可自行微调
    let savedOffsetInit = parseFloat(localStorage.getItem(DM_OFFSET_KEY));
    let fineTuneOffset = (!isNaN(savedOffsetInit) && Math.abs(savedOffsetInit) < OFFSET_MEMORY_LIMIT) ? savedOffsetInit : 0.0;
    let globalTimeOffset = fineTuneOffset;

    // ==================== 历史弹幕文件（最近 5 个，同文件去重） ====================
    const FILE_HISTORY_KEY = 'ldx-file-history';
    const FILE_HISTORY_MAX = 5;
    const FILE_HISTORY_MAX_SIZE = 1000 * 1024; // 单文件内容超过此大小（约 1000 KB）不记录，避免撑爆 localStorage，可自行微调
    let historyMenu = null;
    let historyBtn = null;

    // 优先使用油猴脚本自有的存储空间（GM_setValue），不占用网站 localStorage
    function historySave(list) {
        const json = JSON.stringify(list);
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(FILE_HISTORY_KEY, json);
                return;
            }
        } catch (e) {}
        try { localStorage.setItem(FILE_HISTORY_KEY, json); } catch (e) {}
    }

    function historyLoad() {
        let list = [];
        try {
            if (typeof GM_getValue === 'function') {
                const v = GM_getValue(FILE_HISTORY_KEY, '');
                if (v) list = JSON.parse(v);
            }
        } catch (e) {}
        if (list.length) return list;
        // 迁移旧版存于网站 localStorage 的历史记录
        try {
            const old = JSON.parse(localStorage.getItem(FILE_HISTORY_KEY) || '[]');
            if (old.length) {
                localStorage.removeItem(FILE_HISTORY_KEY);
                historySave(old);
                return old;
            }
        } catch (e) {}
        return [];
    }

    let fileHistory = historyLoad();
    let currentHistoryName = null; // 当前加载的文件名，用于同步配对偏移
    let historySaveTimer = null;

    // 调节偏移后延迟保存历史（避免滑块拖动时频繁序列化大文件内容）
    function scheduleHistorySave() {
        clearTimeout(historySaveTimer);
        historySaveTimer = setTimeout(() => {
            saveHistoryWithFallback();
        }, 500);
    }

    // 清洗录播姬文件名：录制-271628-20260804-195010-589-矿世奇才.xml -> 20260804-195010-矿世奇才.xml
    function cleanFileName(name) {
        let cleaned = name.replace(/^录制-\d+-/, '');
        cleaned = cleaned.replace(/^(\d{8}-\d{6})-\d+-/, '$1-');
        return cleaned;
    }

    // 返回 true 表示写入成功；localStorage 超限时返回 false 供调用方降级
    function saveHistoryWithFallback() {
        const json = JSON.stringify(fileHistory);
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(FILE_HISTORY_KEY, json);
                return true; // GM 存储空间大，通常静默成功
            }
        } catch (e) {}
        try {
            localStorage.setItem(FILE_HISTORY_KEY, json);
            return true;
        } catch (e) {
            return false;
        }
    }

    function addToHistory(fileName, content, offset) {
        if (!fileName || content.length > FILE_HISTORY_MAX_SIZE) return;
        fileHistory = fileHistory.filter(h => h.name !== fileName);
        fileHistory.unshift({
            name: fileName,
            display: cleanFileName(fileName),
            content: content,
            time: Date.now(),
            offset: offset
        });
        if (fileHistory.length > FILE_HISTORY_MAX) fileHistory.length = FILE_HISTORY_MAX;
        if (!saveHistoryWithFallback()) {
            // localStorage 空间不足：从最旧的一条开始丢弃
            while (fileHistory.length > 1) {
                fileHistory.pop();
                if (saveHistoryWithFallback()) break;
            }
        }
        updateHistoryMenu();
    }

    function updateHistoryMenu() {
        if (!historyMenu) return;
        historyMenu.innerHTML = '';
        if (!fileHistory.length) {
            historyMenu.innerHTML = '<div class="ldx-history-item ldx-history-empty">暂无历史文件</div>';
            return;
        }
        fileHistory.forEach(h => {
            const item = document.createElement('div');
            item.className = 'ldx-history-item';
            item.textContent = h.display || h.name;
            item.title = h.name;
            item.addEventListener('click', () => {
                historyMenu.classList.remove('open');
                loadXmlFromData(h.name, h.content, h.offset);
            });
            historyMenu.appendChild(item);
        });
    }

    const MIN_FT_OFFSET = -60.0;
    const MAX_FT_OFFSET = 60.0;

    // 直播弹幕显示开关（带记忆）
    const LIVE_CFG_KEY = 'ldx-live-cfg';
    let cfgShowSender = false; // 显示发送者ID
    let cfgShowSC = true;      // 显示 SuperChat
    let cfgShowGift = false;   // 显示礼物
    let cfgShowGuard = true;   // 显示舰长
    let cfgUserFormat = 1;     // 用户名显示格式：1=弹幕(用户名) 2=用户名:弹幕 3=弹幕-用户名 4=弹幕[用户名]
    try {
        const savedCfg = JSON.parse(localStorage.getItem(LIVE_CFG_KEY) || '{}');
        if (typeof savedCfg.sender === 'boolean') cfgShowSender = savedCfg.sender;
        if (typeof savedCfg.sc === 'boolean') cfgShowSC = savedCfg.sc;
        if (typeof savedCfg.gift === 'boolean') cfgShowGift = savedCfg.gift;
        if (typeof savedCfg.guard === 'boolean') cfgShowGuard = savedCfg.guard;
        const uf = Number(savedCfg.userFormat);
        if (uf >= 1 && uf <= 4) cfgUserFormat = uf;
    } catch (e) {}
    function saveLiveCfg() {
        localStorage.setItem(LIVE_CFG_KEY, JSON.stringify({
            sender: cfgShowSender, sc: cfgShowSC, gift: cfgShowGift, guard: cfgShowGuard,
            userFormat: cfgUserFormat
        }));
    }

    const DM_FONT_SIZE_KEY = 'local-dm-font-size';
    const DM_MIN_FONT_SIZE = 12;
    const DM_MAX_FONT_SIZE = 60;
    let cfgDmFontSize = parseInt(localStorage.getItem(DM_FONT_SIZE_KEY)) || 20;

    // 弹幕字体颜色
    const DM_COLOR_KEY = 'ldx-dm-color';
    let cfgDmColor = localStorage.getItem(DM_COLOR_KEY) || '#FFFFFF';
    const DM_COLOR_PRESETS = ['#FFFFFF', '#FFD400', '#FF69B4', '#00E5FF', '#7CFC00' , '#B388FF', '#FF5252', '#448AFF', '#00AEEC'];

    function applyDmFontSize() {
        if (danmakuOverlay) {
            danmakuOverlay.style.fontSize = cfgDmFontSize + 'px';
        }
    }

    // UI 引用
    let offsetSlider = null;
    let offsetInput = null;
    let globalOffsetDisplay = null;
    let statusBadge = null;
    let loadBtn = null;

    // [v1.11.0] CRC32 算法（用于解析录播姬弹幕 ID 哈希）
    const CRC32_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        CRC32_TABLE[i] = c;
    }
    function crc32(str) {
        let crc = -1;
        for (let i = 0; i < str.length; i++) {
            crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ str.charCodeAt(i)) & 0xFF];
        }
        return (crc ^ -1) >>> 0;
    }

    // ==================== 繁体转简体（内嵌 OpenCC 常用字表） ====================
    const T2S_MAP_STR = "丟丢並并亂乱亙亘亞亚佇伫佈布佔占併并來来侖仑侶侣侷局俁俣係系俔伣俠侠俥伡俬私倀伥倆俩倈俫倉仓個个們们倖幸倫伦偉伟側侧偵侦偽伪傑杰傖伧傘伞備备傢家傭佣傯偬傳传傴伛債债傷伤傾倾僂偻僅仅僉佥僑侨僕仆僞伪僥侥僨偾僱雇價价儀仪儁俊儂侬億亿儈侩儉俭儎傤儐傧儔俦儕侪儘尽償偿優优儲储儷俪儺傩儻傥儼俨兇凶兌兑兒儿兗兖內内兩两冊册冑胄冪幂凈净凍冻凜凛凱凯別别刪删剄刭則则剋克剎刹剗刬剛刚剝剥剮剐剴剀創创剷铲劃划劄札劇剧劉刘劊刽劌刿劍剑劑剂勁劲動动務务勛勋勝胜勞劳勢势勩勚勱劢勳勋勵励勸劝勻匀匭匦匯汇匱匮區区協协卹恤卻却卽即厙厍厠厕厤历厭厌厲厉厴厣參参叄叁叢丛吒咤吳吴吶呐呂吕咼呙員员唄呗唸念問问啓启啞哑啟启啢唡喚唤喪丧喫吃喬乔單单喲哟嗆呛嗇啬嗊唝嗎吗嗚呜嗩唢嗶哔嘆叹嘍喽嘓啯嘔呕嘖啧嘗尝嘜唛嘩哗嘮唠嘯啸嘰叽嘵哓嘸呒嘽啴噁恶噓嘘噝咝噠哒噥哝噦哕噯嗳噲哙噴喷噸吨噹当嚀咛嚇吓嚌哜嚐尝嚕噜嚙啮嚥咽嚦呖嚨咙嚮向嚲亸嚳喾嚴严嚶嘤囀啭囁嗫囂嚣囅冁囈呓囉啰囌苏囑嘱囪囱圇囵國国圍围園园圓圆圖图團团垻坝埡垭埰采執执堅坚堊垩堖垴堝埚堯尧報报場场塊块塋茔塏垲塒埘塗涂塚冢塢坞塤埙塵尘塹堑墊垫墜坠墮堕墰坛墳坟墶垯墻墙墾垦壇坛壋垱壎埙壓压壘垒壙圹壚垆壜坛壞坏壟垄壠垅壢坜壩坝壪塆壯壮壺壶壼壸壽寿夠够夢梦夥伙夾夹奐奂奧奥奩奁奪夺奬奖奮奋奼姹妝妆姍姗姦奸娛娱婁娄婦妇婭娅媧娲媯妫媼媪媽妈嫋袅嫗妪嫵妩嫺娴嫻娴嫿婳嬀妫嬃媭嬈娆嬋婵嬌娇嬙嫱嬡嫒嬤嬷嬪嫔嬰婴嬸婶孃娘孌娈孫孙學学孿孪宮宫寀采寢寝實实寧宁審审寫写寬宽寵宠寶宝將将專专尋寻對对導导尷尴屆届屍尸屓屃屜屉屢屡層层屨屦屬属岡冈峯峰峴岘島岛峽峡崍崃崑昆崗岗崙仑崢峥崬岽嵐岚嵗岁嶁嵝嶄崭嶇岖嶔嵚嶗崂嶠峤嶢峣嶧峄嶨峃嶮崄嶸嵘嶺岭嶼屿嶽岳巋岿巒峦巔巅巖岩巰巯巹卺帥帅師师帳帐帶带幀帧幃帏幗帼幘帻幟帜幣币幫帮幬帱幷并幹干幾几庫库廁厕廂厢廄厩廈厦廎庼廕荫廚厨廝厮廟庙廠厂廡庑廢废廣广廩廪廬庐廳厅弒弑弔吊弳弪張张強强彆别彈弹彌弥彎弯彔录彙汇彠彟彥彦彫雕彲彨彿佛後后徑径從从徠徕復复徵征徹彻恆恒恥耻悅悦悞悮悵怅悶闷悽凄惡恶惱恼惲恽惻恻愛爱愜惬愨悫愴怆愷恺愾忾慄栗態态慍愠慘惨慚惭慟恸慣惯慤悫慪怄慫怂慮虑慳悭慶庆慼戚慾欲憂忧憊惫憐怜憑凭憒愦憖慭憚惮憤愤憫悯憮怃憲宪憶忆懇恳應应懌怿懍懔懞蒙懟怼懣懑懨恹懲惩懶懒懷怀懸悬懺忏懼惧懾慑戀恋戇戆戔戋戧戗戩戬戰战戱戯戲戏戶户扞捍拋抛拚拼挩捝挱挲挾挟捨舍捫扪捱挨捲卷掃扫掄抡掗挜掙挣掛挂採采揀拣揚扬換换揮挥揯搄損损搖摇搗捣搧扇搵揾搶抢摑掴摜掼摟搂摯挚摳抠摶抟摺折摻掺撈捞撏挦撐撑撓挠撟挢撣掸撥拨撫抚撲扑撳揿撻挞撾挝撿捡擁拥擄掳擇择擊击擋挡擔担據据擠挤擡抬擣捣擬拟擯摈擰拧擱搁擲掷擴扩擷撷擺摆擻擞擼撸擾扰攄摅攆撵攏拢攔拦攖撄攙搀攛撺攜携攝摄攢攒攣挛攤摊攪搅攬揽敎教敓敚敗败敘叙敵敌數数斂敛斃毙斆敩斕斓斬斩斷断於于旂旗旣既昇升時时晉晋晝昼暈晕暉晖暘旸暢畅暫暂曄晔曆历曇昙曉晓曏向曖暧曠旷曨昽曬晒書书會会朧胧朮术東东枴拐柵栅柺拐査查桿杆梔栀梘枧條条梟枭梲棁棄弃棊棋棖枨棗枣棟栋棧栈棲栖棶梾椏桠楊杨楓枫楨桢業业極极榘矩榦干榪杩榮荣榲榅榿桤構构槍枪槓杠槤梿槧椠槨椁槮椮槳桨槶椢槼椝樁桩樂乐樅枞樑梁樓楼標标樞枢樣样樧榝樳桪樸朴樹树樺桦樿椫橈桡橋桥機机橢椭橫横檁檩檉柽檔档檜桧檟槚檢检檣樯檮梼檯台檳槟檸柠檻槛櫃柜櫓橹櫚榈櫛栉櫝椟櫞橼櫟栎櫥橱櫧槠櫨栌櫪枥櫫橥櫬榇櫱蘖櫳栊櫸榉櫻樱欄栏欅榉權权欏椤欒栾欖榄欞棂欽钦歎叹歐欧歟欤歡欢歲岁歷历歸归歿殁殘残殞殒殤殇殫殚殭僵殮殓殯殡殲歼殺杀殻壳殼壳毀毁毆殴毿毵氂牦氈毡氌氇氣气氫氢氬氩氳氲氾泛汎泛汙污決决沒没沖冲況况泝溯洩泄洶汹浹浃涇泾涗涚涼凉淒凄淚泪淥渌淨净淩凌淪沦淵渊淶涞淺浅渙涣減减渢沨渦涡測测渾浑湊凑湞浈湧涌湯汤溈沩準准溝沟溫温溮浉溳涢溼湿滄沧滅灭滌涤滎荥滙汇滬沪滯滞滲渗滷卤滸浒滻浐滾滚滿满漁渔漊溇漚沤漢汉漣涟漬渍漲涨漵溆漸渐漿浆潁颍潑泼潔洁潙沩潛潜潤润潯浔潰溃潷滗潿涠澀涩澆浇澇涝澐沄澗涧澠渑澤泽澦滪澩泶澮浍澱淀濁浊濃浓濕湿濘泞濚溁濛蒙濜浕濟济濤涛濫滥濰潍濱滨濺溅濼泺濾滤瀂澛瀅滢瀆渎瀉泻瀋沈瀏浏瀕濒瀘泸瀝沥瀟潇瀠潆瀦潴瀧泷瀨濑瀰弥瀲潋瀾澜灃沣灄滠灑洒灕漓灘滩灝灏灣湾灤滦灧滟灩滟災灾為为烏乌烴烃無无煉炼煒炜煙烟煢茕煥焕煩烦煬炀熅煴熒荧熗炝熱热熲颎熾炽燁烨燈灯燉炖燒烧燙烫燜焖營营燦灿燬毁燭烛燴烩燻熏燼烬燾焘爍烁爐炉爛烂爭争爲为爺爷爾尔牀床牆墙牘牍牴抵牽牵犖荦犛牦犢犊犧牺狀状狹狭狽狈猙狰猶犹猻狲獁犸獃呆獄狱獅狮獎奖獨独獪狯獫猃獮狝獰狞獲获獵猎獷犷獸兽獺獭獻献獼猕玀猡現现琱雕琺珐琿珲瑋玮瑒玚瑣琐瑤瑶瑩莹瑪玛瑲玱璉琏璡琎璣玑璦瑷璫珰環环璵玙璸瑸璽玺璿璇瓊琼瓏珑瓔璎瓚瓒甌瓯甕瓮產产産产畝亩畢毕畫画異异畵画當当疇畴疊叠痙痉痠酸痾疴瘂痖瘋疯瘍疡瘓痪瘞瘗瘡疮瘧疟瘮瘆瘲疭瘺瘘瘻瘘療疗癆痨癇痫癉瘅癒愈癘疠癟瘪癡痴癢痒癤疖癥症癧疬癩癞癬癣癭瘿癮瘾癰痈癱瘫癲癫發发皁皂皚皑皰疱皸皲皺皱盃杯盜盗盞盏盡尽監监盤盘盧卢盪荡眞真眥眦眾众睏困睜睁睞睐瞘眍瞞瞒瞶瞆瞼睑矇蒙矓眬矚瞩矯矫硃朱硜硁硤硖硨砗硯砚碕埼碩硕碭砀碸砜確确碼码磑硙磚砖磠硵磣碜磧碛磯矶磽硗礄硚礎础礙碍礦矿礪砺礫砾礬矾礱砻祕秘祿禄禍祸禎祯禕祎禡祃禦御禪禅禮礼禰祢禱祷禿秃秈籼稅税稈秆稜棱稟禀種种稱称穀谷穌稣積积穎颖穠秾穡穑穢秽穩稳穫获穭穞窩窝窪洼窮穷窯窑窵窎窶窭窺窥竄窜竅窍竇窦竈灶竊窃竪竖競竞筆笔筍笋筧笕箇个箋笺箏筝箚札節节範范築筑篋箧篔筼篠筿篤笃篩筛篳筚簀箦簍篓簑蓑簞箪簡简簣篑簫箫簹筜簽签簾帘籃篮籌筹籙箓籛篯籜箨籟籁籠笼籤签籩笾籪簖籬篱籮箩籲吁粵粤糉粽糝糁糞粪糧粮糰团糲粝糴籴糶粜糹纟糾纠紀纪紂纣約约紅红紆纡紇纥紈纨紉纫紋纹納纳紐纽紓纾純纯紕纰紖纼紗纱紘纮紙纸級级紛纷紜纭紝纴紡纺紮扎細细紱绂紲绁紳绅紵纻紹绍紺绀紼绋紿绐絀绌終终絃弦組组絆绊絎绗結结絕绝絛绦絝绔絞绞絡络絢绚給给絨绒絰绖統统絲丝絳绛絶绝絹绢綁绑綃绡綆绠綈绨綉绣綌绤綏绥綑捆經经綜综綞缍綠绿綢绸綣绻綫线綬绶維维綯绹綰绾綱纲網网綳绷綴缀綵彩綸纶綹绺綺绮綻绽綽绰綾绫綿绵緄绲緇缁緊紧緋绯緑绿緒绪緓绬緔绱緗缃緘缄緙缂線线緝缉緞缎締缔緡缗緣缘緦缌編编緩缓緬缅緯纬緱缑緲缈練练緶缏緹缇緻致緼缊縈萦縉缙縊缢縋缒縐绉縑缣縕缊縗缞縛缚縝缜縞缟縟缛縣县縧绦縫缝縭缡縮缩縱纵縲缧縴纤縵缦縶絷縷缕縹缥總总績绩繃绷繅缫繆缪繒缯織织繕缮繚缭繞绕繡绣繢缋繩绳繪绘繫系繭茧繮缰繯缳繰缲繳缴繹绎繼继繽缤繾缱纇颣纈缬纊纩續续纍累纏缠纓缨纔才纖纤纘缵纜缆缽钵罈坛罌罂罎坛罰罚罵骂罷罢羅罗羆罴羈羁羋芈羣群羥羟羨羡義义羶膻習习翫玩翬翚翹翘翽翙耬耧耮耢聖圣聞闻聯联聰聪聲声聳耸聵聩聶聂職职聹聍聽听聾聋肅肃脅胁脈脉脛胫脣唇脩修脫脱脹胀腎肾腖胨腡脶腦脑腫肿腳脚腸肠膃腽膕腘膚肤膠胶膩腻膽胆膾脍膿脓臉脸臍脐臏膑臘腊臚胪臟脏臠脔臢臜臥卧臨临臺台與与興兴舉举舊旧舖铺舘馆艙舱艤舣艦舰艫舻艱艰艷艳芻刍苧苎茲兹荊荆莊庄莖茎莢荚莧苋華华菴庵菸烟萇苌萊莱萬万萴荝萵莴葉叶葒荭葤荮葦苇葯药葷荤蒐搜蒓莼蒔莳蒕蒀蒞莅蒼苍蓀荪蓆席蓋盖蓮莲蓯苁蓴莼蓽荜蔔卜蔘参蔞蒌蔣蒋蔥葱蔦茑蔭荫蕁荨蕆蒇蕎荞蕒荬蕓芸蕕莸蕘荛蕢蒉蕩荡蕪芜蕭萧蕷蓣薀蕰薈荟薊蓟薌芗薑姜薔蔷薘荙薟莶薦荐薩萨薴苧薹苔薺荠藍蓝藎荩藝艺藥药藪薮藴蕴藶苈藹蔼藺蔺蘀萚蘄蕲蘆芦蘇苏蘊蕴蘋苹蘚藓蘞蔹蘢茏蘭兰蘺蓠蘿萝虆蔂處处虛虚虜虏號号虧亏虯虬蛺蛱蛻蜕蜆蚬蝕蚀蝟猬蝦虾蝨虱蝸蜗螄蛳螞蚂螢萤螻蝼螿螀蟄蛰蟈蝈蟎螨蟣虮蟬蝉蟯蛲蟲虫蟶蛏蟻蚁蠁蚃蠅蝇蠆虿蠍蝎蠐蛴蠑蝾蠔蚝蠟蜡蠣蛎蠨蟏蠱蛊蠶蚕蠻蛮衆众衊蔑術术衕同衚胡衛卫衝冲袞衮袷夹裊袅裏里補补裝装裡里製制複复褌裈褘袆褲裤褳裢褸褛褻亵襇裥襉裥襏袯襖袄襝裣襠裆襤褴襪袜襬摆襯衬襲袭襴襕覈核見见覎觃規规覓觅視视覘觇覡觋覥觍覦觎親亲覬觊覯觏覲觐覷觑覺觉覽览覿觌觀观觴觞觶觯觸触訁讠訂订訃讣計计訊讯訌讧討讨訐讦訒讱訓训訕讪訖讫託托記记訛讹訝讶訟讼訣诀訥讷訩讻訪访設设許许訴诉訶诃診诊註注証证詁诂詆诋詎讵詐诈詒诒詔诏評评詖诐詗诇詘诎詛诅詞词詠咏詡诩詢询詣诣試试詩诗詫诧詬诟詭诡詮诠詰诘話话該该詳详詵诜詼诙詿诖誄诔誅诛誆诓誇夸誌志認认誑诳誒诶誕诞誘诱誚诮語语誠诚誡诫誣诬誤误誥诰誦诵誨诲說说説说誰谁課课誶谇誹诽誼谊誾訚調调諂谄諄谆談谈諉诿請请諍诤諏诹諑诼諒谅論论諗谂諛谀諜谍諝谞諞谝諡谥諢诨諤谔諦谛諧谐諫谏諭谕諮咨諱讳諳谙諶谌諷讽諸诸諺谚諼谖諾诺謀谋謁谒謂谓謄誊謅诌謊谎謎谜謐谧謔谑謖谡謗谤謙谦謚谥講讲謝谢謠谣謡谣謨谟謫谪謬谬謭谫謳讴謹谨謾谩譁哗證证譎谲譏讥譖谮識识譙谯譚谭譜谱譟噪譫谵譭毁譯译議议譴谴護护譸诪譽誉譾谫讀读讅谉變变讋詟讎雠讒谗讓让讕谰讖谶讚赞讜谠讞谳谿溪豈岂豎竖豐丰豔艳豬猪豶豮貍狸貓猫貝贝貞贞貟贠負负財财貢贡貧贫貨货販贩貪贪貫贯責责貯贮貰贳貲赀貳贰貴贵貶贬買买貸贷貺贶費费貼贴貽贻貿贸賀贺賁贲賂赂賃赁賄贿賅赅資资賈贾賊贼賑赈賒赊賓宾賕赇賙赒賚赉賜赐賞赏賠赔賡赓賢贤賣卖賤贱賦赋賧赕質质賫赍賬账賭赌賴赖賵赗賺赚賻赙購购賽赛賾赜贄贽贅赘贇赟贈赠贊赞贋赝贍赡贏赢贐赆贓赃贔赑贖赎贗赝贛赣贜赃赬赪趕赶趙赵趨趋趲趱跡迹踐践踰逾踴踊蹌跄蹕跸蹟迹蹠跖蹣蹒蹤踪蹺跷躂跶躉趸躊踌躋跻躍跃躑踯躒跞躓踬躕蹰躚跹躡蹑躥蹿躦躜躪躏軀躯車车軋轧軌轨軍军軑轪軒轩軔轫軛轭軟软軤轷軫轸軲轱軸轴軹轵軺轺軻轲軼轶軾轼較较輅辂輇辁輈辀載载輊轾輒辄輓挽輔辅輕轻輛辆輜辎輝辉輞辋輟辍輥辊輦辇輩辈輪轮輬辌輯辑輳辏輸输輻辐輼辒輾辗輿舆轀辒轂毂轄辖轅辕轆辘轉转轍辙轎轿轔辚轟轰轡辔轢轹轤轳辦办辭辞辮辫辯辩農农迴回逕径這这連连週周進进遊游運运過过達达違违遙遥遜逊遞递遠远遡溯適适遲迟遶绕遷迁選选遺遗遼辽邁迈還还邇迩邊边邏逻邐逦郟郏郵邮鄆郓鄉乡鄒邹鄔邬鄖郧鄧邓鄭郑鄰邻鄲郸鄴邺鄶郐鄺邝酇酂酈郦醃腌醖酝醜丑醞酝醟蒏醣糖醫医醬酱醱酦釀酿釁衅釃酾釅酽釋释釐厘釒钅釓钆釔钇釕钌釗钊釘钉釙钋針针釣钓釤钐釦扣釧钏釩钒釵钗釷钍釹钕釺钎鈀钯鈁钫鈃钘鈄钭鈅钥鈈钚鈉钠鈍钝鈎钩鈐钤鈑钣鈒钑鈔钞鈕钮鈞钧鈡钟鈣钙鈥钬鈦钛鈧钪鈮铌鈰铈鈳钶鈴铃鈷钴鈸钹鈹铍鈺钰鈽钸鈾铀鈿钿鉀钾鉅巨鉆钻鉈铊鉉铉鉋铇鉍铋鉑铂鉕钷鉗钳鉚铆鉛铅鉞钺鉢钵鉤钩鉦钲鉬钼鉭钽鉳锫鉶铏鉸铰鉺铒鉻铬鉿铪銀银銃铳銅铜銍铚銑铣銓铨銖铢銘铭銚铫銛铦銜衔銠铑銣铷銥铱銦铟銨铵銩铥銪铕銫铯銬铐銱铞銳锐銷销銹锈銻锑銼锉鋁铝鋃锒鋅锌鋇钡鋌铤鋏铗鋒锋鋙铻鋝锊鋟锓鋣铘鋤锄鋥锃鋦锔鋨锇鋩铓鋪铺鋭锐鋮铖鋯锆鋰锂鋱铽鋶锍鋸锯鋼钢錁锞錄录錆锖錇锫錈锩錏铔錐锥錒锕錕锟錘锤錙锱錚铮錛锛錟锬錠锭錡锜錢钱錦锦錨锚錩锠錫锡錮锢錯错録录錳锰錶表錸铼錼镎鍀锝鍁锨鍃锪鍅钫鍆钔鍇锴鍈锳鍊炼鍋锅鍍镀鍔锷鍘铡鍚钖鍛锻鍠锽鍤锸鍥锲鍩锘鍬锹鍰锾鍵键鍶锶鍺锗鍼针鍾钟鎂镁鎄锿鎇镅鎊镑鎌镰鎔镕鎖锁鎘镉鎚锤鎛镈鎡镃鎢钨鎣蓥鎦镏鎧铠鎩铩鎪锼鎬镐鎭镇鎮镇鎰镒鎲镋鎳镍鎵镓鎶鿔鎸镌鎿镎鏃镞鏇旋鏈链鏌镆鏍镙鏐镠鏑镝鏗铿鏘锵鏜镗鏝镘鏞镛鏟铲鏡镜鏢镖鏤镂鏨錾鏰镚鏵铧鏷镤鏹镪鏽锈鐃铙鐋铴鐐镣鐒铹鐓镦鐔镡鐘钟鐙镫鐝镢鐠镨鐦锎鐧锏鐨镄鐫镌鐮镰鐲镯鐳镭鐵铁鐶镮鐸铎鐺铛鐿镱鑄铸鑊镬鑌镔鑑鉴鑒鉴鑔镲鑕锧鑞镴鑠铄鑣镳鑥镥鑭镧鑰钥鑱镵鑲镶鑷镊鑹镩鑼锣鑽钻鑾銮鑿凿钁镢钂镋長长門门閂闩閃闪閆闫閈闬閉闭開开閌闶閎闳閏闰閑闲閒闲間间閔闵閘闸閡阂閣阁閤合閥阀閨闺閩闽閫阃閬阆閭闾閱阅閲阅閶阊閹阉閻阎閼阏閽阍閾阈閿阌闃阒闆板闇暗闈闱闊阔闋阕闌阑闍阇闐阗闒阘闓闿闔阖闕阙闖闯關关闞阚闠阓闡阐闢辟闤阛闥闼陘陉陝陕陞升陣阵陰阴陳陈陸陆陽阳隉陧隊队階阶隕陨際际隨随險险隯陦隱隐隴陇隸隶隻只雋隽雖虽雙双雛雏雜杂雞鸡離离難难雲云電电霑沾霢霡霧雾霽霁靂雳靄霭靆叇靈灵靉叆靚靓靜静靝靔靦腼靨靥鞏巩鞝绱鞦秋鞽鞒韁缰韃鞑韆千韉鞯韋韦韌韧韍韨韓韩韙韪韜韬韝鞲韞韫韻韵響响頁页頂顶頃顷項项順顺頇顸須须頊顼頌颂頎颀頏颃預预頑顽頒颁頓顿頗颇領领頜颌頡颉頤颐頦颏頭头頮颒頰颊頲颋頴颕頷颔頸颈頹颓頻频頽颓顆颗題题額额顎颚顏颜顒颙顓颛顔颜願愿顙颡顛颠類类顢颟顥颢顧顾顫颤顬颥顯显顰颦顱颅顳颞顴颧風风颭飐颮飑颯飒颱台颳刮颶飓颸飔颺飏颻飖颼飕飀飗飄飘飆飙飈飚飛飞飠饣飢饥飣饤飥饦飩饨飪饪飫饫飭饬飯饭飱飧飲饮飴饴飼饲飽饱飾饰飿饳餃饺餄饸餅饼餈糍餉饷養养餌饵餎饹餏饻餑饽餒馁餓饿餕馂餖饾餘余餚肴餛馄餜馃餞饯餡馅館馆餬糊餱糇餳饧餵喂餶馉餷馇餺馎餼饩餾馏餿馊饁馌饃馍饅馒饈馐饉馑饊馓饋馈饌馔饑饥饒饶饗飨饜餍饞馋饢馕馬马馭驭馮冯馱驮馳驰馴驯馹驲駁驳駐驻駑驽駒驹駔驵駕驾駘骀駙驸駛驶駝驼駟驷駡骂駢骈駭骇駰骃駱骆駸骎駿骏騁骋騂骍騅骓騌骔騍骒騎骑騏骐騖骛騙骗騤骙騫骞騭骘騮骝騰腾騶驺騷骚騸骟騾骡驀蓦驁骜驂骖驃骠驄骢驅驱驊骅驌骕驍骁驏骣驕骄驗验驚惊驛驿驟骤驢驴驤骧驥骥驦骦驪骊驫骉骯肮髏髅髒脏體体髕髌髖髋髮发鬆松鬍胡鬚须鬢鬓鬥斗鬧闹鬨哄鬩阋鬮阄鬱郁鬹鬶魎魉魘魇魚鱼魛鱽魢鱾魨鲀魯鲁魴鲂魷鱿魺鲄鮁鲅鮃鲆鮊鲌鮋鲉鮍鲏鮎鲇鮐鲐鮑鲍鮒鲋鮓鲊鮚鲒鮜鲘鮝鲞鮞鲕鮦鲖鮪鲔鮫鲛鮭鲑鮮鲜鮳鲓鮶鲪鮺鲝鯀鲧鯁鲠鯇鲩鯉鲤鯊鲨鯒鲬鯔鲻鯕鲯鯖鲭鯗鲞鯛鲷鯝鲴鯡鲱鯢鲵鯤鲲鯧鲳鯨鲸鯪鲮鯫鲰鯰鲶鯴鲺鯷鳀鯽鲫鯿鳊鰁鳈鰂鲗鰃鳂鰈鲽鰉鳇鰍鳅鰏鲾鰐鳄鰒鳆鰓鳃鰛鳁鰜鳒鰟鳑鰠鳋鰣鲥鰥鳏鰨鳎鰩鳐鰭鳍鰮鳁鰱鲢鰲鳌鰳鳓鰵鳘鰷鲦鰹鲣鰺鲹鰻鳗鰼鳛鰾鳔鱂鳉鱅鳙鱈鳕鱉鳖鱒鳟鱔鳝鱖鳜鱗鳞鱘鲟鱝鲼鱟鲎鱠鲙鱣鳣鱤鳡鱧鳢鱨鲿鱭鲚鱯鳠鱷鳄鱸鲈鱺鲡鳥鸟鳧凫鳩鸠鳬凫鳲鸤鳳凤鳴鸣鳶鸢鴆鸩鴇鸨鴉鸦鴒鸰鴕鸵鴛鸳鴝鸲鴞鸮鴟鸱鴣鸪鴦鸯鴨鸭鴯鸸鴰鸹鴴鸻鴻鸿鴿鸽鵂鸺鵃鸼鵐鹀鵑鹃鵒鹆鵓鹁鵜鹈鵝鹅鵠鹄鵡鹉鵪鹌鵬鹏鵮鹐鵯鹎鵰雕鵲鹊鵷鹓鵾鹍鶇鸫鶉鹑鶊鹒鶓鹋鶖鹙鶘鹕鶚鹗鶡鹖鶥鹛鶩鹜鶬鸧鶯莺鶲鹟鶴鹤鶹鹠鶺鹡鶻鹘鶼鹣鶿鹚鷀鹚鷁鹢鷂鹞鷄鸡鷊鹝鷓鹧鷖鹥鷗鸥鷙鸷鷚鹨鷥鸶鷦鹪鷫鹔鷯鹩鷲鹫鷳鹇鷴鹇鷸鹬鷹鹰鷺鹭鷽鸴鸇鹯鸌鹱鸏鹲鸕鸬鸘鹴鸚鹦鸛鹳鸝鹂鸞鸾鹵卤鹹咸鹺鹾鹼碱鹽盐麗丽麥麦麩麸麪面麫面麯曲麴曲麵面麼么麽么黃黄黌黉點点黨党黲黪黴霉黶黡黷黩黽黾黿鼋鼂鼌鼉鼍鼕冬鼴鼹齊齐齋斋齎赍齏齑齒齿齔龀齕龁齗龂齙龅齜龇齟龃齠龆齡龄齣出齦龈齧啮齪龊齬龉齲龋齶腭齷龌龍龙龎厐龐庞龔龚龕龛龜龟鿓鿒";
    const T2S_KEY = 'ldx-t2s';
    let cfgT2S = localStorage.getItem(T2S_KEY) === 'true';
    let t2sMap = null;
    function getT2SMap() {
        if (!t2sMap) {
            t2sMap = new Map();
            for (let i = 0; i < T2S_MAP_STR.length; i += 2) {
                t2sMap.set(T2S_MAP_STR[i], T2S_MAP_STR[i + 1]);
            }
        }
        return t2sMap;
    }
    function toSimplified(text) {
        const map = getT2SMap();
        let out = '';
        for (const ch of text) {
            out += map.get(ch) || ch;
        }
        return out;
    }

    // ==================== 样式（全新美化版） ====================
    GM_addStyle(`
        /* ---------- 主容器 ---------- */
        #ldx-container {
            position: fixed;
            top: 70px;
            left: -320px;
            width: 320px;
            z-index: 10;
            transition: left 0.38s cubic-bezier(0.25, 0.8, 0.3, 1);
            font-family: "HarmonyOS Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
            color: #e8eaf0;
            user-select: none;
        }
        #ldx-container.ldx-open { left: 0; }

        /* ---------- 折叠标签 ---------- */
        #ldx-toggle {
            position: absolute;
            right: -26px;
            top: 18px;
            width: 26px;
            height: 74px;
            background: linear-gradient(180deg, #fb7299 0%, #e35d7f 100%);
            color: #fff;
            border-radius: 0 13px 13px 0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 2px;
            writing-mode: vertical-rl;
            text-orientation: upright;
            box-shadow: 3px 3px 14px rgba(251, 114, 153, 0.45);
            transition: background 0.25s, transform 0.25s, box-shadow 0.25s;
            z-index: 5;
        }
        #ldx-toggle:hover {
            background: linear-gradient(180deg, #ff86a6, #ef6a8b);
            transform: scale(1.06);
            box-shadow: 4px 4px 18px rgba(251, 114, 153, 0.6);
        }
        #ldx-toggle:active { transform: scale(0.97); }

        /* ---------- 主面板 ---------- */
        #ldx-panel {
            width: 320px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            max-height: calc(100vh - 170px);
            background: linear-gradient(160deg, rgba(28, 30, 40, 0.93), rgba(14, 16, 24, 0.95));
            -webkit-backdrop-filter: blur(16px) saturate(150%);
            backdrop-filter: blur(16px) saturate(150%);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 14px;
            box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.35);
            padding: 14px;
        }
        #ldx-scroll {
            overflow-y: auto;
            overflow-x: hidden;
            margin-right: -4px;
            padding-right: 4px;
        }
        #ldx-scroll::-webkit-scrollbar { width: 5px; }
        #ldx-scroll::-webkit-scrollbar-track { background: transparent; }
        #ldx-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.14); border-radius: 3px; }
        #ldx-scroll::-webkit-scrollbar-thumb:hover { background: rgba(251, 114, 153, 0.55); }

        /* ---------- 标题栏 ---------- */
        .ldx-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 2px 2px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
            flex-shrink: 0;
        }
        .ldx-logo {
            width: 32px;
            height: 32px;
            border-radius: 10px;
            flex-shrink: 0;
            background: linear-gradient(135deg, #fb7299, #00aeec);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            color: #fff;
            font-weight: 700;
            box-shadow: 0 4px 14px rgba(251, 114, 153, 0.45);
        }
        .ldx-title { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; line-height: 1.2; }
        .ldx-sub { font-size: 10.5px; color: #8a8fa3; margin-top: 2px; }
        .ldx-status {
            margin-left: auto;
            flex-shrink: 0;
            font-size: 11px;
            font-weight: 600;
            color: #8a8fa3;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.09);
            padding: 3px 9px;
            border-radius: 999px;
            white-space: nowrap;
            transition: all 0.3s;
        }
        .ldx-status.ldx-loaded {
            color: #7be3a2;
            border-color: rgba(123, 227, 162, 0.35);
            background: rgba(46, 160, 91, 0.18);
        }
        .ldx-history-wrap {
            position: relative;
            margin-left: 6px;
            flex-shrink: 0;
        }
        .ldx-history-btn {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.09);
            color: #9aa0b5;
            font-size: 11px;
            font-weight: 600;
            font-family: inherit;
            padding: 3px 9px;
            border-radius: 999px;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.2s;
        }
        .ldx-history-btn:hover {
            color: #fff;
            background: rgba(251, 114, 153, 0.2);
            border-color: rgba(251, 114, 153, 0.45);
        }
        .ldx-history-menu {
            position: absolute;
            right: 0;
            top: calc(100% + 6px);
            width: 260px;
            background: linear-gradient(160deg, rgba(30, 32, 42, 0.97), rgba(16, 18, 26, 0.98));
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
            display: none;
            z-index: 30;
            overflow: hidden;
        }
        .ldx-history-menu.open { display: block; }
        .ldx-history-item {
            padding: 8px 11px;
            font-size: 12px;
            color: #cdd1e0;
            cursor: pointer;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            transition: background 0.15s;
        }
        .ldx-history-item:last-child { border-bottom: none; }
        .ldx-history-item:hover { background: rgba(251, 114, 153, 0.16); color: #fff; }
        .ldx-history-item.ldx-history-empty {
            cursor: default;
            color: #8a8fa3;
            text-align: center;
        }
        .ldx-history-item.ldx-history-empty:hover { background: none; color: #8a8fa3; }

        /* ---------- 分区卡片 ---------- */
        .ldx-section {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 10px 11px;
            margin-top: 10px;
            flex-shrink: 0;
        }
        .ldx-section-title {
            display: flex;
            align-items: center;
            gap: 7px;
            font-size: 12.5px;
            font-weight: 700;
            color: #c9cde0;
            margin-bottom: 9px;
            letter-spacing: 0.3px;
        }
        .ldx-ico {
            width: 20px;
            height: 20px;
            border-radius: 7px;
            flex-shrink: 0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 10.5px;
            background: rgba(251, 114, 153, 0.16);
            color: #fb7299;
        }

        /* ---------- 按钮 ---------- */
        .ldx-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            color: #fff;
            border-radius: 9px;
            padding: 8px 12px;
            background: linear-gradient(135deg, #fb7299, #ec5e86);
            box-shadow: 0 3px 10px rgba(251, 114, 153, 0.3);
            transition: transform 0.15s, box-shadow 0.2s, filter 0.2s, background 0.2s;
            white-space: nowrap;
        }
        .ldx-btn:hover { filter: brightness(1.08); }
        .ldx-btn:active { transform: scale(0.96); }
        .ldx-btn-wide { width: 100%; box-sizing: border-box; }
        .ldx-btn-ghost {
            background: rgba(255, 255, 255, 0.08);
            box-shadow: none;
            color: #dfe2ec;
        }
        .ldx-btn-ghost:hover { background: rgba(255, 255, 255, 0.14); filter: none; }
        .ldx-btn-green {
            background: linear-gradient(135deg, #35c08a, #23a877);
            box-shadow: 0 3px 10px rgba(53, 192, 138, 0.3);
        }
        /* ---------- 开关 ---------- */
        .ldx-switch {
            position: relative;
            display: inline-block;
            width: 38px;
            height: 22px;
            flex-shrink: 0;
        }
        .ldx-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .ldx-track {
            position: absolute;
            inset: 0;
            border-radius: 999px;
            background: #3b3e48;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.35);
            transition: background 0.25s, box-shadow 0.25s;
            cursor: pointer;
        }
        .ldx-track::after {
            content: "";
            position: absolute;
            left: 3px;
            top: 3px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
            transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.3, 1);
        }
        .ldx-switch input:checked + .ldx-track {
            background: linear-gradient(135deg, #fb7299, #00aeec);
        }
        .ldx-switch input:checked + .ldx-track::after { transform: translateX(16px); }
        .ldx-switch-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 5px 0;
            font-size: 12.5px;
            color: #c6cad8;
        }
        .ldx-switch-row + .ldx-switch-row { border-top: 1px dashed rgba(255, 255, 255, 0.06); }

        /* ---------- 输入框 ---------- */
        .ldx-input {
            background: rgba(0, 0, 0, 0.28);
            color: #eef;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 8px;
            padding: 6px 10px;
            font-size: 13px;
            outline: none;
            width: 100%;
            box-sizing: border-box;
            transition: border-color 0.2s, box-shadow 0.2s;
        }
        .ldx-input:focus {
            border-color: #fb7299;
            box-shadow: 0 0 0 3px rgba(251, 114, 153, 0.18);
        }
        .ldx-input::placeholder { color: #5d6377; }
        select.ldx-input {
            cursor: pointer;
            padding-top: 5px;
            padding-bottom: 5px;
            appearance: auto;
        }
        select.ldx-input option {
            background: #1c1e28;
            color: #e8eaf0;
        }
        .ldx-input-row { display: flex; gap: 6px; align-items: center; }
        .ldx-field { margin-bottom: 8px; }
        .ldx-field:last-child { margin-bottom: 0; }
        .ldx-field .ldx-label {
            display: block;
            font-size: 11px;
            color: #8a8fa3;
            margin-bottom: 4px;
        }

        /* ---------- 滑块 ---------- */
        .ldx-range {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 5px;
            border-radius: 3px;
            background: linear-gradient(90deg, rgba(251, 114, 153, 0.45), rgba(0, 174, 236, 0.45));
            outline: none;
            margin: 8px 0;
            cursor: pointer;
        }
        /* 偏移滑块默认隐藏（功能保留，调节仍生效），想恢复显示时删除下面这一行即可 */
        #ldx-offset-slider { display: none; }
        .ldx-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #fff;
            border: none;
            cursor: pointer;
            box-shadow: 0 0 0 3px #fb7299, 0 2px 6px rgba(0, 0, 0, 0.4);
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .ldx-range::-webkit-slider-thumb:hover {
            transform: scale(1.15);
            box-shadow: 0 0 0 4px #fb7299, 0 2px 8px rgba(0, 0, 0, 0.5);
        }
        .ldx-range::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #fff;
            border: none;
            box-shadow: 0 0 0 3px #fb7299;
            cursor: pointer;
        }

        /* ---------- 显示行 / 快捷按钮 ---------- */
        .ldx-display-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(0, 0, 0, 0.25);
            border-radius: 9px;
            padding: 6px 11px;
            margin-bottom: 6px;
            font-size: 12.5px;
        }
        .ldx-display-row .ldx-label { color: #8a8fa3; }
        .ldx-value {
            font-weight: 700;
            font-size: 14px;
            font-family: Consolas, "JetBrains Mono", monospace;
            transition: color 0.3s;
        }
        #ldx-offset-value.ldx-offset-zero { color: #7be3a2; }
        #ldx-offset-value.ldx-offset-pos { color: #ffc24b; }
        #ldx-offset-value.ldx-offset-neg { color: #ff6b81; }
        .ldx-chip-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 6px;
            margin-top: 6px;
        }
        .ldx-chip {
            background: rgba(255, 255, 255, 0.07);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #cdd1e0;
            border-radius: 8px;
            padding: 5px 0;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.18s;
        }
        .ldx-chip:hover {
            background: rgba(251, 114, 153, 0.18);
            border-color: rgba(251, 114, 153, 0.45);
            color: #fff;
        }
        .ldx-chip:active { transform: scale(0.94); }

        /* ---------- 搜索 ---------- */
        .ldx-search-row { display: flex; gap: 6px; }
        .ldx-search-results {
            max-height: 130px;
            overflow-y: auto;
            margin-top: 7px;
            border-radius: 9px;
            background: rgba(0, 0, 0, 0.22);
            border: 1px solid rgba(255, 255, 255, 0.07);
            display: none;
        }
        .ldx-search-results::-webkit-scrollbar { width: 4px; }
        .ldx-search-results::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 2px; }
        .ldx-search-item {
            padding: 5px 10px;
            font-size: 12px;
            color: #cdd1e0;
            cursor: pointer;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: background 0.15s;
        }
        .ldx-search-item:last-child { border-bottom: none; }
        .ldx-search-item:hover { background: rgba(251, 114, 153, 0.16); color: #fff; }
        .ldx-search-time {
            color: #8a8fa3;
            margin-right: 8px;
            font-family: Consolas, monospace;
            font-size: 11px;
        }
        .ldx-search-user {
            color: #fb7299;
            margin-right: 6px;
            font-size: 11px;
        }

        /* ---------- 字号 ---------- */
        .ldx-stepper {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .ldx-step-btn {
            width: 30px;
            height: 30px;
            border-radius: 8px;
            background: rgba(251, 114, 153, 0.14);
            color: #fb7299;
            font-size: 17px;
            font-weight: 700;
            border: 1px solid rgba(251, 114, 153, 0.25);
            cursor: pointer;
            transition: all 0.15s;
        }
        .ldx-step-btn:hover { background: rgba(251, 114, 153, 0.32); color: #fff; }
        .ldx-step-btn:active { transform: scale(0.92); }
        .ldx-font-value {
            min-width: 26px;
            text-align: center;
            font-size: 15px;
            font-weight: 700;
            color: #fff;
            font-family: Consolas, monospace;
        }
        .ldx-btn.ldx-on {
            background: linear-gradient(135deg, #35c08a, #23a877);
            box-shadow: 0 3px 10px rgba(53, 192, 138, 0.35);
            color: #fff;
        }
        .ldx-btn.ldx-on:hover { filter: brightness(1.08); }

        /* ---------- 弹幕颜色 ---------- */
        .ldx-color-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            display: inline-block;
            background: #fff;
            border: 1px solid rgba(255, 255, 255, 0.35);
            flex-shrink: 0;
        }
        .ldx-color-palette {
            display: none;
            flex-wrap: wrap;
            gap: 7px;
            margin-top: 9px;
            padding-top: 9px;
            border-top: 1px dashed rgba(255, 255, 255, 0.08);
        }
        .ldx-color-palette.open { display: flex; }
        .ldx-color-opt {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 2px solid rgba(255, 255, 255, 0.25);
            cursor: pointer;
            padding: 0;
            transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
        }
        .ldx-color-opt:hover { transform: scale(1.18); }
        .ldx-color-opt.active {
            border-color: #fb7299;
            box-shadow: 0 0 0 2px rgba(251, 114, 153, 0.45);
        }

        /* ---------- 链接 ---------- */
        .ldx-link-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .ldx-link {
            font-size: 11.5px;
            color: #9aa0b5;
            text-decoration: none;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            padding: 4px 11px;
            border-radius: 999px;
            transition: all 0.2s;
        }
        .ldx-link:hover {
            color: #fff;
            background: rgba(251, 114, 153, 0.2);
            border-color: rgba(251, 114, 153, 0.45);
            transform: translateY(-1px);
        }

        /* ---------- 简单模式 ---------- */
        #ldx-container.ldx-simple .ldx-section:not(.ldx-keep) { display: none; }

        /* ---------- 弹幕渲染 ---------- */
        #ldx-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 90%;
            overflow: hidden;
            pointer-events: none;
            z-index: 1;
            color: white;
            font-family: SimHei, "Microsoft YaHei", Arial, sans-serif;
            font-weight: bold;
            text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
        }
        .ldx-dm {
            position: absolute;
            white-space: nowrap;
            line-height: 1;
            will-change: transform, opacity;
            --ldx-scale: 1.0;
            transform-origin: left center;
            z-index: 1;
            animation: ldx-scroll ${DM_SCROLL_DURATION}s linear;
        }
        .ldx-dm.dm-type-sc {
            color: #ffe066;
            text-shadow: 1px 1px 0 #b06600, -1px -1px 0 #b06600;
            border: 1px solid #ffe066;
            background: rgba(255, 165, 0, 0.3);
            border-radius: 4px;
            padding: 0 4px;
        }
        .ldx-dm.dm-type-gift {
            color: #ffb6c1;
            font-size: 0.9em;
        }
        .ldx-dm.dm-type-guard {
            color: #87cefa;
            font-size: 0.9em;
            border: 1px solid #87cefa;
            border-radius: 4px;
            padding: 0 2px;
        }
        @keyframes ldx-scroll {
            from { transform: translateX(100vw) scale(var(--ldx-scale)); opacity: 1; }
            to { transform: translateX(-100%) scale(var(--ldx-scale)); opacity: 1; }
        }

        /* ---------- 密度图 / 预览 ---------- */
        #ldx-density-canvas {
            position: absolute;
            left: 0;
            width: 100%;
            height: 30px;
            bottom: 100%;
            pointer-events: none;
            z-index: 10;
        }
        #ldx-tooltip {
            position: absolute;
            display: none;
            background: rgba(16, 18, 26, 0.92);
            color: #e8eaf0;
            border-radius: 10px;
            padding: 8px 12px;
            font-size: 12.5px;
            line-height: 1.7;
            max-width: 320px;
            z-index: 9999;
            pointer-events: none;
            bottom: 42px;
            border: 1px solid rgba(251, 114, 153, 0.35);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
            -webkit-backdrop-filter: blur(8px);
            backdrop-filter: blur(8px);
        }
        #ldx-tooltip div {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `);

    // ==================== 工具函数 ====================
    function formatTime(seconds, showDecimals = true) {
        if (isNaN(seconds) || seconds < 0) {
            return "0:00";
        }
        const hours = Math.floor(seconds / 3600);
        seconds %= 3600;
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;

        let timeStr = "";
        if (hours > 0) {
            timeStr += `${hours}:${minutes.toString().padStart(2, '0')}:`;
        } else {
            timeStr += `${minutes}:`;
        }

        if (showDecimals) {
            timeStr += `${Math.floor(secs).toString().padStart(2, '0')}.${Math.floor((secs % 1) * 10)}`;
        } else {
            timeStr += `${Math.floor(secs).toString().padStart(2, '0')}`;
        }
        return timeStr;
    }

    // ==================== 弹幕加载与解析 ====================
    function loadXmlFromData(fileName, content, pairedOffset) {
        // 历史文件：直接应用配对偏移；手动文件：走全局偏移记忆判断（>= 阈值重置为 0，< 阈值沿用）
        let loadOffset = 0.0;
        if (typeof pairedOffset === 'number' && !isNaN(pairedOffset)) {
            loadOffset = pairedOffset;
        } else {
            const savedOffset = parseFloat(localStorage.getItem(DM_OFFSET_KEY));
            loadOffset = (!isNaN(savedOffset) && Math.abs(savedOffset) < OFFSET_MEMORY_LIMIT) ? savedOffset : 0.0;
        }
        fineTuneOffset = loadOffset;
        globalTimeOffset = loadOffset;
        localStorage.setItem(DM_OFFSET_KEY, String(loadOffset));
        updateGlobalOffsetDisplay();
        if (offsetSlider) offsetSlider.value = loadOffset;
        if (offsetInput) offsetInput.value = loadOffset.toFixed(1);

        if (statusBadge) {
            statusBadge.textContent = '解析中...';
            statusBadge.classList.remove('ldx-loaded');
        }

        currentHistoryName = fileName;
        parseXMLDanmaku(content);
        addToHistory(fileName, content, loadOffset);
    }

    function loadFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            loadXmlFromData(file.name, e.target.result);
        };
        reader.readAsText(file, 'UTF-8');
    }

    function parseXMLDanmaku(xmlStr) {
        danmakuList = [];
        nextDanmakuIndex = 0;
        danmakuCache.clear();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

        // 1. 建立 Hash -> 真名 对照表
        const hashToUserMap = new Map();
        const safeJSONParse = (str) => { try { return JSON.parse(str); } catch (e) { return null; } };
        const registerUser = (uid, name) => {
            if (!uid || !name || uid === 0) return;
            const crc = crc32(uid.toString()).toString(16).toLowerCase();
            hashToUserMap.set(crc, name);
        };

        for (let item of xmlDoc.getElementsByTagName('gift')) {
            const rawData = safeJSONParse(item.getAttribute('raw'));
            if (rawData?.sender_uinfo?.uid && rawData?.sender_uinfo?.name) {
                registerUser(rawData.sender_uinfo.uid, rawData.sender_uinfo.name);
            }
        }
        for (let item of xmlDoc.getElementsByTagName('sc')) {
            const rawData = safeJSONParse(item.getAttribute('raw'));
            if (rawData?.user_info?.uid && rawData?.user_info?.uname) {
                registerUser(rawData.user_info.uid, rawData.user_info.uname);
            }
        }
        for (let item of xmlDoc.getElementsByTagName('guard')) {
            const rawData = safeJSONParse(item.getAttribute('raw'));
            if (rawData?.uid && rawData?.username) {
                registerUser(rawData.uid, rawData.username);
            }
        }

        // 2. 解析普通弹幕
        for (let item of xmlDoc.getElementsByTagName('d')) {
            try {
                const p = item.getAttribute('p').split(',');
                const time = parseFloat(p[0]);
                const text = item.textContent;
                let user = item.getAttribute('user') || "";

                const rawStr = item.getAttribute('raw');
                let hash = "";
                if (rawStr) {
                    const rawData = safeJSONParse(rawStr);
                    if (Array.isArray(rawData) && Array.isArray(rawData[0])) {
                        const info = rawData[0];
                        if (info.length > 7 && typeof info[7] === 'string') {
                            hash = info[7].toLowerCase();
                        }
                    }
                }

                if (hash && hashToUserMap.has(hash)) {
                    user = hashToUserMap.get(hash);
                } else if (hash) {
                    user += ` (ID:${hash})`;
                }

                if (!isNaN(time) && text) {
                    danmakuList.push({ time, text, type: 'danmaku', user, shown: false });
                }
            } catch (e) {}
        }

        // 3. 特殊弹幕：SC / Gift / Guard
        for (let item of xmlDoc.getElementsByTagName('sc')) {
            try {
                const time = parseFloat(item.getAttribute('ts'));
                const rawData = safeJSONParse(item.getAttribute('raw'));
                const user = rawData?.user_info?.uname || item.getAttribute('user') || "未知";
                const price = item.getAttribute('price') || "0";
                const text = item.textContent;
                if (!isNaN(time)) danmakuList.push({ time, text, type: 'sc', user, price, shown: false });
            } catch (e) {}
        }
        for (let item of xmlDoc.getElementsByTagName('gift')) {
            try {
                const time = parseFloat(item.getAttribute('ts'));
                const rawData = safeJSONParse(item.getAttribute('raw'));
                const user = rawData?.sender_uinfo?.name || item.getAttribute('user') || "未知";
                const giftName = item.getAttribute('giftname') || "礼物";
                const count = item.getAttribute('giftcount') || "1";
                if (!isNaN(time)) danmakuList.push({ time, text: `投喂了 ${giftName} x ${count}`, type: 'gift', user, count, shown: false });
            } catch (e) {}
        }
        for (let item of xmlDoc.getElementsByTagName('guard')) {
            try {
                const time = parseFloat(item.getAttribute('ts'));
                const rawData = safeJSONParse(item.getAttribute('raw'));
                const user = rawData?.username || item.getAttribute('user') || "未知";
                const level = item.getAttribute('level');
                const levelName = level === "1" ? "总督" : (level === "2" ? "提督" : "舰长");
                if (!isNaN(time)) danmakuList.push({ time, text: `成为了 ${levelName}`, type: 'guard', user, shown: false });
            } catch (e) {}
        }

        danmakuList.sort((a, b) => a.time - b.time);

        if (loadBtn) {
            loadBtn.textContent = '🔄 重新加载弹幕';
        }
        if (statusBadge) {
            statusBadge.textContent = danmakuList.length + ' 条';
            statusBadge.classList.add('ldx-loaded');
        }
        console.log(`[本地弹幕] 已加载 ${danmakuList.length} 条弹幕`);

        redrawDensityGraph();
        if (videoElement && videoElement.src) { onVideoLoaded(); }
    }

    // ==================== 偏移逻辑 ====================
    function updateFineTuneOffset(newFineTune, source = '') {
        if (!videoElement) return;

        if (source === 'slider') {
            newFineTune = Math.max(MIN_FT_OFFSET, Math.min(MAX_FT_OFFSET, newFineTune));
        }
        newFineTune = Math.round(newFineTune * 10) / 10;
        if (isNaN(newFineTune)) { newFineTune = 0.0; }

        fineTuneOffset = newFineTune;
        globalTimeOffset = fineTuneOffset;
        localStorage.setItem(DM_OFFSET_KEY, String(newFineTune));
        // 同步当前文件在历史记录中的配对偏移
        if (currentHistoryName) {
            const historyEntry = fileHistory.find(h => h.name === currentHistoryName);
            if (historyEntry) {
                historyEntry.offset = fineTuneOffset;
                scheduleHistorySave();
            }
        }

        updateGlobalOffsetDisplay();

        if (source !== 'slider' && offsetSlider) {
            offsetSlider.value = Math.max(MIN_FT_OFFSET, Math.min(MAX_FT_OFFSET, newFineTune));
        }
        if (source !== 'input' && offsetInput) {
            offsetInput.value = newFineTune.toFixed(1);
        }

        redrawDensityGraph();
        triggerFullDanmakuReset(videoElement.currentTime);
    }

    function updateGlobalOffsetDisplay() {
        if (!globalOffsetDisplay) return;
        globalOffsetDisplay.textContent = globalTimeOffset.toFixed(1) + 's';
        globalOffsetDisplay.classList.remove('ldx-offset-zero', 'ldx-offset-pos', 'ldx-offset-neg');
        if (globalTimeOffset > 0.05) {
            globalOffsetDisplay.classList.add('ldx-offset-pos');
        } else if (globalTimeOffset < -0.05) {
            globalOffsetDisplay.classList.add('ldx-offset-neg');
        } else {
            globalOffsetDisplay.classList.add('ldx-offset-zero');
        }
    }

    function triggerFullDanmakuReset(currentTime) {
        if (!danmakuList.length) return;
        if (danmakuOverlay) { danmakuOverlay.innerHTML = ''; }
        danmakuCache.clear();
        trackOccupancy.clear();
        const targetTime = currentTime - globalTimeOffset;
        const firstIndex = binarySearchDanmakuIndex(targetTime);
        nextDanmakuIndex = (firstIndex === -1) ? danmakuList.length : firstIndex;
        for (let i = 0; i < danmakuList.length; i++) {
            danmakuList[i].shown = (i < nextDanmakuIndex);
        }
    }

    // ==================== 播放器监听 ====================
    let lastBoundVideoElement = null;
    function addVideoListeners() {
        if (!videoElement) return;
        if (videoElement === lastBoundVideoElement) return;
        lastBoundVideoElement = videoElement;

        videoElement.addEventListener('loadedmetadata', onVideoLoaded);

        videoElement.addEventListener('timeupdate', () => {
            if (!videoElement.isConnected) {
                const newVideo = document.querySelector('video');
                if (newVideo && newVideo !== videoElement) {
                    videoElement = newVideo;
                    addVideoListeners();
                    if (videoElement.readyState >= 1 && danmakuList.length > 0) {
                        onVideoLoaded();
                    }
                }
                return;
            }

            if (!videoWrap || !videoWrap.isConnected) {
                videoWrap = document.querySelector('.bpx-player-video-wrap');
            }

            const overlayEl = document.getElementById('ldx-overlay');
            if (!overlayEl) {
                if (videoWrap && videoWrap.isConnected) {
                    danmakuOverlay = document.createElement('div');
                    danmakuOverlay.id = 'ldx-overlay';
                    danmakuOverlay.style.fontSize = cfgDmFontSize + 'px';
                    videoWrap.appendChild(danmakuOverlay);
                    if (danmakuList.length > 0) {
                        triggerFullDanmakuReset(videoElement.currentTime);
                    }
                }
                return;
            } else if (!overlayEl.isConnected) {
                if (videoWrap && videoWrap.isConnected) {
                    videoWrap.appendChild(overlayEl);
                    danmakuOverlay = overlayEl;
                }
                return;
            } else {
                danmakuOverlay = overlayEl;
            }

            if (videoElement.paused || danmakuList.length === 0 || nextDanmakuIndex >= danmakuList.length) {
                return;
            }
            const currentTime = videoElement.currentTime;
            while (nextDanmakuIndex < danmakuList.length) {
                const dm = danmakuList[nextDanmakuIndex];
                const virtualDmTime = dm.time + globalTimeOffset;
                if (virtualDmTime >= currentTime && virtualDmTime < currentTime + 2.0) {
                    if (!dm.shown) {
                        dm.shown = true;
                        processDanmaku(dm, virtualDmTime);
                    }
                } else if (virtualDmTime < currentTime) {
                    dm.shown = true;
                } else {
                    break;
                }
                nextDanmakuIndex++;
            }
        });

        videoElement.addEventListener('seeked', () => {
            triggerFullDanmakuReset(videoElement.currentTime);
        });

        videoElement.addEventListener('play', () => {
            if (!videoElement.isConnected) {
                const newVideo = document.querySelector('video');
                if (newVideo && newVideo !== videoElement) {
                    videoElement = newVideo;
                    addVideoListeners();
                    if (videoElement.readyState >= 1 && danmakuList.length > 0) {
                        onVideoLoaded();
                    }
                }
                return;
            }
            if (!videoWrap || !videoWrap.isConnected) {
                videoWrap = document.querySelector('.bpx-player-video-wrap');
            }
            const existingOverlay = document.getElementById('ldx-overlay');
            if (!existingOverlay) {
                if (videoWrap && videoWrap.isConnected) {
                    danmakuOverlay = document.createElement('div');
                    danmakuOverlay.id = 'ldx-overlay';
                    danmakuOverlay.style.fontSize = cfgDmFontSize + 'px';
                    videoWrap.appendChild(danmakuOverlay);
                }
            } else if (!existingOverlay.isConnected) {
                if (videoWrap && videoWrap.isConnected) {
                    videoWrap.appendChild(existingOverlay);
                }
                danmakuOverlay = existingOverlay;
            } else {
                danmakuOverlay = existingOverlay;
            }
            if (danmakuList.length > 0) {
                triggerFullDanmakuReset(videoElement.currentTime);
            }
        });
    }

    // ==================== 视频加载 ====================
    function onVideoLoaded() {
        if (!videoElement) return;

        if (isNaN(videoElement.duration) || videoElement.duration <= 0 || !videoElement.src) {
            setTimeout(onVideoLoaded, 100);
            return;
        }

        if (danmakuList.length > 0) {
            redrawDensityGraph();
            triggerFullDanmakuReset(videoElement.currentTime);
        }
    }

    // ==================== 弹幕渲染 ====================
    function processDanmaku(dm, virtualDmTime) {
        if (!videoElement) return;

        if (dm.type === 'sc' && !cfgShowSC) return;
        if (dm.type === 'gift' && !cfgShowGift) return;
        if (dm.type === 'guard' && !cfgShowGuard) return;

        let displayText = dm.text;

        // 舰长/提督/总督弹幕：无论显示用户开关是否开启，都追加 (用户名)，不参与通用格式选择
        if (dm.type === 'guard' && dm.user) {
            displayText = `${displayText}(${dm.user})`;
        } else if (dm.type === 'sc' && dm.user){
        	displayText = `${displayText}(${dm.user})`;
        } else if (cfgShowSender && dm.user) {
            switch (cfgUserFormat) {
                case 2:
                    displayText = `${dm.user}: ${displayText}`;
                    break;
                case 3:
                    displayText = `${displayText}-${dm.user}`;
                    break;
                case 4:
                    displayText = `${displayText}[${dm.user}]`;
                    break;
                default:
                    displayText = `${displayText}(${dm.user})`;
                    break;
            }
        }

        switch (dm.type) {
            case 'sc':
                displayText = `[👻SC ￥${dm.price}] ${displayText}`;
                break;
            case 'gift':
                displayText = `[🎁礼物] ${displayText}`;
                break;
            case 'guard':
                displayText = `[🚀舰长] ${displayText}`;
                break;
        }

        // 繁体转简体（开关开启时）
        if (cfgT2S) {
            displayText = toSimplified(displayText);
        }

        if (dm.type === 'danmaku') {
            const cacheEntry = danmakuCache.get(displayText);
            const now = virtualDmTime;
            if (cacheEntry && (now - cacheEntry.lastTime < MERGE_DURATION)) {
                cacheEntry.count++;
                cacheEntry.lastTime = now;
                const el = cacheEntry.element;
                el.textContent = displayText + ` (x${cacheEntry.count})`;
                let scale = 1.0 + Math.log10(1.2 * cacheEntry.count);
                scale = Math.min(scale, MAX_SCALE);
                el.style.setProperty('--ldx-scale', scale);
                // 合并条数越多，动画越长，弹幕在屏幕上停留越久
                const extraDuration = Math.log10(1 * cacheEntry.count) * DM_MERGE_DURATION_BONUS;
                el.style.animationDuration = (DM_SCROLL_DURATION + extraDuration) + 's';
                el.style.zIndex = 10 + cacheEntry.count;
                el.style.textShadow = '1px 1px 3px black, 0 0 3px black';
                return;
            }
        }

        const el = showDanmaku(displayText, dm.type);
        if (!el) return;

        if (dm.type === 'danmaku') {
            danmakuCache.set(displayText, {
                count: 1,
                element: el,
                lastTime: virtualDmTime
            });
        }

        el.addEventListener('animationend', () => {
            if (dm.type === 'danmaku') {
                const currentEntry = danmakuCache.get(displayText);
                if (currentEntry && currentEntry.element === el) {
                    danmakuCache.delete(displayText);
                }
            }
            el.remove();
        });
    }

    function showDanmaku(text, type) {
        if (!danmakuOverlay) return null;
        if (!danmakuOverlay.isConnected) {
            const currentWrap = document.querySelector('.bpx-player-video-wrap');
            if (currentWrap) {
                currentWrap.appendChild(danmakuOverlay);
                videoWrap = currentWrap;
            } else {
                return null;
            }
        }
        const dm = document.createElement('span');
        dm.className = 'ldx-dm';

        if (type && type !== 'danmaku') {
            dm.classList.add(`dm-type-${type}`);
        }

        dm.textContent = text;
        // 普通弹幕应用自定义颜色，SC/礼物/舰长保留类型识别色
        if (!type || type === 'danmaku') {
            dm.style.color = cfgDmColor;
        }

        // 轨道分配：顶部留白避免贴顶，优先随机选一条空闲轨道，全部被占用时才选占用最少的轨道
        const trackHeight = cfgDmFontSize + 4;
        const topPad = Math.min(12, Math.round(trackHeight * 0.25));
        const usableHeight = danmakuOverlay.clientHeight - topPad;
        const trackCount = Math.max(1, Math.floor((usableHeight / trackHeight) - 1));
        const freeRows = [];
        for (let i = 0; i < trackCount; i++) {
            if (!trackOccupancy.get(i)) freeRows.push(i);
        }
        let row;
        if (freeRows.length > 0) {
            row = freeRows[Math.floor(Math.random() * freeRows.length)];
        } else {
            let bestCount = Infinity;
            for (let i = 0; i < trackCount; i++) {
                const c = trackOccupancy.get(i) || 0;
                if (c < bestCount) {
                    bestCount = c;
                    row = i;
                }
            }
        }
        dm.dataset.track = String(row);
        trackOccupancy.set(row, (trackOccupancy.get(row) || 0) + 1);
        dm.style.top = (topPad + row * trackHeight) + 'px';
        dm.style.zIndex = 1;

        if (type === 'sc') dm.style.zIndex = 50;

        // 弹幕动画结束后释放轨道
        dm.addEventListener('animationend', () => {
            const t = parseInt(dm.dataset.track, 10);
            if (!isNaN(t) && trackOccupancy.has(t)) {
                const c = trackOccupancy.get(t) - 1;
                if (c <= 0) trackOccupancy.delete(t);
                else trackOccupancy.set(t, c);
            }
        });

        danmakuOverlay.appendChild(dm);
        return dm;
    }

    // ==================== 密度图 / 进度条预览 ====================
    function redrawDensityGraph() {
        if (!densityCanvas || !videoElement) {
            if (densityCanvas) {
                const ctx = densityCanvas.getContext('2d');
                ctx.clearRect(0, 0, densityCanvas.width, densityCanvas.height);
            }
            return;
        }
        const duration = videoElement.duration;
        if (isNaN(duration) || duration <= 0) {
            if (densityCanvas) {
                const ctx = densityCanvas.getContext('2d');
                ctx.clearRect(0, 0, densityCanvas.width, densityCanvas.height);
            }
            return;
        }
        const ctx = densityCanvas.getContext('2d');
        const width = densityCanvas.width;
        const height = densityCanvas.height;
        ctx.clearRect(0, 0, width, height);
        if (danmakuList.length === 0) return;

        const buckets = new Array(width).fill(0);

        for (const dm of danmakuList) {
            if (dm.type !== 'danmaku') continue;
            const virtualTime = dm.time + globalTimeOffset;
            if (virtualTime < 0 || virtualTime > duration) continue;
            const timeRatio = virtualTime / duration;
            const bucketIndex = Math.floor(timeRatio * width);
            if (bucketIndex >= 0 && bucketIndex < width) {
                buckets[bucketIndex]++;
            }
        }

        const maxRawDensity = Math.max(20, ...buckets);
        const maxSqrtDensity = Math.sqrt(maxRawDensity);
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, 'rgba(0, 174, 236, 0.25)');
        gradient.addColorStop(1, 'rgba(251, 114, 153, 0.95)');
        ctx.fillStyle = gradient;
        for (let i = 0; i < width; i++) {
            const density = buckets[i];
            if (density === 0) continue;
            const sqrtDensity = Math.sqrt(density);
            const relativeHeight = sqrtDensity / maxSqrtDensity;
            const barHeight = Math.max(2, relativeHeight * height);
            ctx.fillRect(i, height - barHeight, 1, barHeight);
        }
    }

    function handleProgressHover(event) {
        if (!danmakuList.length || !videoElement || !videoElement.duration || !progressContainer || !danmakuTooltip) {
            return;
        }
        const rect = progressContainer.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const hoverRatio = Math.max(0, Math.min(1, mouseX / rect.width));
        const hoverTime = hoverRatio * videoElement.duration;

        const targetDmTime = hoverTime - globalTimeOffset;
        if (Math.abs(hoverTime - lastHoverTime) < 0.1) {
            positionAndShowTooltip(mouseX);
            return;
        }
        lastHoverTime = hoverTime;
        const startIndex = binarySearchDanmakuIndex(targetDmTime);
        if (startIndex === -1) {
            danmakuTooltip.innerHTML = '无弹幕';
            positionAndShowTooltip(mouseX);
            return;
        }
        const candidates = [];
        const counts = new Map();
        for (let i = startIndex; i < danmakuList.length; i++) {
            const dm = danmakuList[i];
            const virtualDmTime = dm.time + globalTimeOffset;
            if (virtualDmTime < hoverTime) continue;
            if (virtualDmTime > hoverTime + PREVIEW_WINDOW_SECONDS) {
                break;
            }
            candidates.push(dm);
            counts.set(dm.text, (counts.get(dm.text) || 0) + 1);
        }
        if (candidates.length === 0) {
            danmakuTooltip.innerHTML = '无弹幕';
            positionAndShowTooltip(mouseX);
            return;
        }
        const sortedDanmaku = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        let html = '';
        for (let i = 0; i < sortedDanmaku.length && i < MAX_PREVIEW_LINES; i++) {
            const [text, count] = sortedDanmaku[i];
            const div = document.createElement('div');
            div.textContent = text + (count > 1 ? ` (x${count})` : '');
            html += div.outerHTML;
        }
        if (sortedDanmaku.length > MAX_PREVIEW_LINES) {
            html += `<div>... (及其他 ${sortedDanmaku.length - MAX_PREVIEW_LINES} 条)</div>`;
        }
        danmakuTooltip.innerHTML = html;
        positionAndShowTooltip(mouseX);
    }

    function positionAndShowTooltip(mouseX) {
        if (!danmakuTooltip) return;
        const tooltipWidth = danmakuTooltip.offsetWidth;
        let left = mouseX - (tooltipWidth / 2);
        if (left < 0) {
            left = 0;
        }
        if (progressContainer && left + tooltipWidth > progressContainer.clientWidth) {
            left = progressContainer.clientWidth - tooltipWidth;
        }
        danmakuTooltip.style.left = left + 'px';
        danmakuTooltip.style.display = 'block';
    }

    function hideProgressHover() {
        if (danmakuTooltip) {
            danmakuTooltip.style.display = 'none';
        }
        lastHoverTime = -1;
    }

    function binarySearchDanmakuIndex(targetTime) {
        let low = 0;
        let high = danmakuList.length - 1;
        let result = -1;
        while (low <= high) {
            let mid = Math.floor((low + high) / 2);
            if (danmakuList[mid].time >= targetTime) {
                result = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        if (result === -1) {
            return -1;
        }
        return Math.max(0, result - 1);
    }

    // ==================== UI 构建（全新美化版） ====================
    function waitForPlayer() {
        videoElement = document.querySelector('video');
        videoWrap = document.querySelector('.bpx-player-video-wrap');
        progressContainer = document.querySelector('.bpx-player-progress-wrap');
        if (videoElement && videoWrap && progressContainer) {
            setupApp();
        } else {
            setTimeout(waitForPlayer, 1000);
        }
    }

    function setupApp() {
        if (!document.getElementById('ldx-overlay')) {
            danmakuOverlay = document.createElement('div');
            danmakuOverlay.id = 'ldx-overlay';
            danmakuOverlay.style.fontSize = cfgDmFontSize + 'px';
            videoWrap.appendChild(danmakuOverlay);
        }

        let mainContainer = document.getElementById('ldx-container');
        if (!mainContainer) {
            mainContainer = document.createElement('div');
            mainContainer.id = 'ldx-container';
            document.body.appendChild(mainContainer);

            mainContainer.innerHTML = `
                <div id="ldx-toggle" title="展开 / 收起">弹</div>
                <div id="ldx-panel">
                    <div class="ldx-header" id="ldx-header">
                        <div class="ldx-logo">弹</div>
                        <div>
                            <div class="ldx-title">本地弹幕</div>
                        <div class="ldx-sub">本地弹幕工具</div>
                        </div>
                        <div class="ldx-status" id="ldx-status">未加载</div>
                        <div class="ldx-history-wrap">
                            <button id="ldx-history-btn" class="ldx-history-btn" title="最近使用的弹幕文件">历史文件</button>
                            <div id="ldx-history-menu" class="ldx-history-menu"></div>
                        </div>
                    </div>
                    <div id="ldx-scroll">
                        <div class="ldx-section ldx-keep">
                            <button id="ldx-load-btn" class="ldx-btn ldx-btn-wide">📁 加载本地弹幕</button>
                            <input type="file" id="ldx-file-input" accept=".xml" hidden>
                        </div>

                        <div class="ldx-section" id="ldx-search-panel">
                            <div class="ldx-section-title"><span class="ldx-ico">🔍</span><span class="ldx-title-text">搜索弹幕 · 定点对齐</span></div>
                            <div class="ldx-search-row">
                                <input type="text" id="ldx-search-input" class="ldx-input" placeholder="输入弹幕内容搜索...">
                                <button id="ldx-search-btn" class="ldx-btn ldx-btn-green">搜索</button>
                            </div>
                            <div id="ldx-search-results" class="ldx-search-results"></div>
                        </div>

                        <div class="ldx-section" id="ldx-offset-controls">
                            <div class="ldx-section-title" id="ldx-offset-title"><span class="ldx-ico">🎚</span><span class="ldx-title-text">精调偏移</span></div>
                            <div class="ldx-display-row">
                                <span class="ldx-label">总偏移</span>
                                <span class="ldx-value ldx-offset-zero" id="ldx-offset-value">0.0s</span>
                            </div>
                            <input type="range" id="ldx-offset-slider" class="ldx-range" min="${MIN_FT_OFFSET}" max="${MAX_FT_OFFSET}" step="0.1" value="${fineTuneOffset}">
                            <div class="ldx-input-row">
                                <input type="number" id="ldx-offset-input" class="ldx-input" step="0.1" value="${fineTuneOffset.toFixed(1)}">
                                <button id="ldx-offset-reset" class="ldx-btn ldx-btn-ghost">重置</button>
                            </div>
                            <div class="ldx-chip-grid">
                                <button class="ldx-chip" id="ldx-offset-m5">-5s</button>
                                <button class="ldx-chip" id="ldx-offset-p5">+5s</button>
                                <button class="ldx-chip" id="ldx-offset-m05">-0.5s</button>
                                <button class="ldx-chip" id="ldx-offset-p05">+0.5s</button>
                            </div>
                        </div>

                        <div class="ldx-section" id="ldx-live-controls">
                            <div class="ldx-section-title"><span class="ldx-ico">📺</span><span class="ldx-title-text">直播录播设置</span></div>
                            <div class="ldx-switch-row">
                                <span>显示 SuperChat</span>
                                <label class="ldx-switch"><input type="checkbox" id="ldx-show-sc"><span class="ldx-track"></span></label>
                            </div>
                            <div class="ldx-switch-row">
                                <span>显示 用户名</span>
                                <label class="ldx-switch"><input type="checkbox" id="ldx-show-sender"><span class="ldx-track"></span></label>
                            </div>
                            <div class="ldx-switch-row">
                                <span>显示 礼物</span>
                                <label class="ldx-switch"><input type="checkbox" id="ldx-show-gift"><span class="ldx-track"></span></label>
                            </div>
                            <div class="ldx-switch-row">
                                <span>显示 舰长</span>
                                <label class="ldx-switch"><input type="checkbox" id="ldx-show-guard"><span class="ldx-track"></span></label>
                            </div>
                            <div class="ldx-field" id="ldx-user-format-field">
                                <label class="ldx-label">用户名显示格式</label>
                                <select id="ldx-user-format" class="ldx-input">
                                    <option value="1">弹幕(用户名)</option>
                                    <option value="2">用户名:弹幕</option>
                                    <option value="3">弹幕-用户名</option>
                                    <option value="4">弹幕[用户名]</option>
                                </select>
                            </div>
                        </div>

                        <div class="ldx-section ldx-keep">
                            <div class="ldx-section-title"><span class="ldx-ico">Aa</span><span class="ldx-title-text">弹幕字号</span></div>
                            <div class="ldx-stepper">
                                <button id="ldx-font-minus" class="ldx-step-btn">−</button>
                                <span class="ldx-font-value" id="ldx-font-value">${cfgDmFontSize}</span>
                                <button id="ldx-font-plus" class="ldx-step-btn">+</button>
                                <button id="ldx-color-btn" class="ldx-btn ldx-btn-ghost"><span class="ldx-color-dot" id="ldx-color-dot"></span>颜色</button>
                                <button id="ldx-t2s-btn" class="ldx-btn ldx-btn-ghost">繁→简</button>
                                <button id="ldx-font-mode" class="ldx-btn ldx-btn-ghost">简单</button>
                            </div>
                            <div class="ldx-color-palette" id="ldx-color-palette"></div>
                        </div>

                        <div class="ldx-section">
                            <div class="ldx-section-title"><span class="ldx-ico">🌐</span><span class="ldx-title-text">快捷入口</span></div>
                            <div class="ldx-link-row">
                                <a class="ldx-link" href="https://danmubox.github.io/search" target="_blank" rel="noopener">弹幕盒子</a>
                                <a class="ldx-link" href="https://ani.gamer.com.tw" target="_blank" rel="noopener">巴哈姆特</a>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // ---------- 折叠 / 展开 ----------
            const toggleTab = document.getElementById('ldx-toggle');
            toggleTab.addEventListener('click', () => {
                const open = mainContainer.classList.toggle('ldx-open');
                toggleTab.textContent = open ? '收' : '弹';
            });

            // ---------- 引用 ----------
            loadBtn = document.getElementById('ldx-load-btn');
            statusBadge = document.getElementById('ldx-status');
            historyBtn = document.getElementById('ldx-history-btn');
            historyMenu = document.getElementById('ldx-history-menu');
            const fileInput = document.getElementById('ldx-file-input');
            const searchInput = document.getElementById('ldx-search-input');
            const searchBtn = document.getElementById('ldx-search-btn');
            const searchResults = document.getElementById('ldx-search-results');

            // ---------- 历史文件 ----------
            historyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                historyMenu.classList.toggle('open');
                updateHistoryMenu();
            });
            document.addEventListener('click', () => {
                if (historyMenu) historyMenu.classList.remove('open');
            });
            updateHistoryMenu();

            // ---------- 加载 ----------
            fileInput.onchange = (e) => loadFile(e.target.files[0]);
            loadBtn.onclick = () => fileInput.click();

            // ---------- 搜索 ----------
            function performDanmakuSearch() {
                const query = searchInput.value.trim();
                searchResults.innerHTML = '';
                if (!query) {
                    searchResults.style.display = 'none';
                    return;
                }
                if (danmakuList.length === 0) {
                    searchResults.style.display = 'block';
                    searchResults.innerHTML = '<div class="ldx-search-item" style="cursor:default">暂无弹幕数据</div>';
                    return;
                }
                // 同时匹配弹幕文本与用户名
                const matches = danmakuList.filter(d => {
                    if (!d.text) return false;
                    if (d.text.includes(query)) return true;
                    return !!(d.user && d.user.includes(query));
                });
                if (matches.length === 0) {
                    searchResults.style.display = 'block';
                    searchResults.innerHTML = '<div class="ldx-search-item" style="cursor:default">未找到匹配弹幕</div>';
                    return;
                }
                searchResults.style.display = 'block';
                matches.slice(0, 50).forEach(dm => {
                    const div = document.createElement('div');
                    div.className = 'ldx-search-item';
                    div.innerHTML = `<span class="ldx-search-time">[${formatTime(dm.time)}]</span>${dm.user ? `<span class="ldx-search-user">${dm.user}</span>` : ''}${dm.text}`;
                    div.addEventListener('click', () => {
                        if (videoElement) {
                            videoElement.currentTime = dm.time + globalTimeOffset;
                            triggerFullDanmakuReset(videoElement.currentTime);
                            if (videoElement.paused) videoElement.play();
                        }
                        searchResults.style.display = 'none';
                        setTimeout(() => { searchResults.style.display = 'block'; }, 300);
                    });
                    searchResults.appendChild(div);
                });
            }
            searchBtn.addEventListener('click', performDanmakuSearch);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') performDanmakuSearch();
            });

            // ---------- 直播设置 ----------
            const showSc = document.getElementById('ldx-show-sc');
            const showSender = document.getElementById('ldx-show-sender');
            const showGift = document.getElementById('ldx-show-gift');
            const showGuard = document.getElementById('ldx-show-guard');
            const userFormatSelect = document.getElementById('ldx-user-format');
            const userFormatField = document.getElementById('ldx-user-format-field');
            showSc.checked = cfgShowSC;
            showSender.checked = cfgShowSender;
            showGift.checked = cfgShowGift;
            showGuard.checked = cfgShowGuard;
            userFormatSelect.value = String(cfgUserFormat);
            function updateUserFormatVisibility() {
                userFormatField.style.display = cfgShowSender ? '' : 'none';
            }
            updateUserFormatVisibility();
            showSc.addEventListener('change', (e) => { cfgShowSC = e.target.checked; saveLiveCfg(); triggerFullDanmakuReset(videoElement.currentTime); });
            showSender.addEventListener('change', (e) => { cfgShowSender = e.target.checked; saveLiveCfg(); updateUserFormatVisibility(); triggerFullDanmakuReset(videoElement.currentTime); });
            showGift.addEventListener('change', (e) => { cfgShowGift = e.target.checked; saveLiveCfg(); triggerFullDanmakuReset(videoElement.currentTime); });
            showGuard.addEventListener('change', (e) => { cfgShowGuard = e.target.checked; saveLiveCfg(); triggerFullDanmakuReset(videoElement.currentTime); });
            userFormatSelect.addEventListener('change', (e) => {
                cfgUserFormat = parseInt(e.target.value, 10) || 1;
                saveLiveCfg();
                triggerFullDanmakuReset(videoElement.currentTime);
            });

            // ---------- 偏移 ----------
            offsetSlider = document.getElementById('ldx-offset-slider');
            offsetInput = document.getElementById('ldx-offset-input');
            globalOffsetDisplay = document.getElementById('ldx-offset-value');
            offsetSlider.value = fineTuneOffset;
            offsetInput.value = fineTuneOffset.toFixed(1);
            updateGlobalOffsetDisplay();
            offsetSlider.addEventListener('input', (e) => {
                updateFineTuneOffset(parseFloat(e.target.value), 'slider');
            });
            offsetInput.addEventListener('change', (e) => {
                updateFineTuneOffset(parseFloat(e.target.value), 'input');
            });
            document.getElementById('ldx-offset-reset').addEventListener('click', () => updateFineTuneOffset(0.0));
            document.getElementById('ldx-offset-m5').addEventListener('click', () => updateFineTuneOffset(fineTuneOffset - 5.0));
            document.getElementById('ldx-offset-p5').addEventListener('click', () => updateFineTuneOffset(fineTuneOffset + 5.0));
            document.getElementById('ldx-offset-m05').addEventListener('click', () => updateFineTuneOffset(fineTuneOffset - 0.5));
            document.getElementById('ldx-offset-p05').addEventListener('click', () => updateFineTuneOffset(fineTuneOffset + 0.5));

            // ---------- 字号 ----------
            const fontMinusBtn = document.getElementById('ldx-font-minus');
            const fontPlusBtn = document.getElementById('ldx-font-plus');
            const fontValueSpan = document.getElementById('ldx-font-value');
            fontMinusBtn.addEventListener('click', () => {
                const newSize = Math.max(DM_MIN_FONT_SIZE, cfgDmFontSize - 2);
                cfgDmFontSize = newSize;
                localStorage.setItem(DM_FONT_SIZE_KEY, String(newSize));
                fontValueSpan.textContent = newSize;
                applyDmFontSize();
            });
            fontPlusBtn.addEventListener('click', () => {
                const newSize = Math.min(DM_MAX_FONT_SIZE, cfgDmFontSize + 2);
                cfgDmFontSize = newSize;
                localStorage.setItem(DM_FONT_SIZE_KEY, String(newSize));
                fontValueSpan.textContent = newSize;
                applyDmFontSize();
            });
            // ---------- 弹幕颜色 ----------
            const colorBtn = document.getElementById('ldx-color-btn');
            const colorPalette = document.getElementById('ldx-color-palette');
            const colorDot = document.getElementById('ldx-color-dot');
            DM_COLOR_PRESETS.forEach(color => {
                const opt = document.createElement('button');
                opt.className = 'ldx-color-opt';
                opt.dataset.color = color;
                opt.style.background = color;
                opt.title = color;
                opt.classList.toggle('active', color.toUpperCase() === cfgDmColor.toUpperCase());
                opt.addEventListener('click', () => {
                    cfgDmColor = color;
                    localStorage.setItem(DM_COLOR_KEY, cfgDmColor);
                    colorDot.style.background = cfgDmColor;
                    colorPalette.classList.remove('open');
                    colorPalette.querySelectorAll('.ldx-color-opt').forEach(o => o.classList.toggle('active', o === opt));
                    triggerFullDanmakuReset(videoElement.currentTime);
                });
                colorPalette.appendChild(opt);
            });
            colorDot.style.background = cfgDmColor;
            colorBtn.addEventListener('click', () => colorPalette.classList.toggle('open'));

            // ---------- 繁体转简体开关 ----------
            const t2sBtn = document.getElementById('ldx-t2s-btn');
            function updateT2SBtn() {
                t2sBtn.classList.toggle('ldx-on', cfgT2S);
            }
            updateT2SBtn();
            t2sBtn.addEventListener('click', () => {
                cfgT2S = !cfgT2S;
                localStorage.setItem(T2S_KEY, cfgT2S ? 'true' : 'false');
                updateT2SBtn();
                triggerFullDanmakuReset(videoElement.currentTime);
            });

            // ---------- 简单模式 ----------
            const fontModeBtn = document.getElementById('ldx-font-mode');
            const MODE_KEY = 'local-dm-simple-mode';
            let isSimpleMode = localStorage.getItem(MODE_KEY) === 'true';
            function applySimpleMode() {
                const container = document.getElementById('ldx-container');
                if (container) {
                    container.classList.toggle('ldx-simple', isSimpleMode);
                }
                fontModeBtn.textContent = isSimpleMode ? '默认' : '简单';
                fontModeBtn.style.background = isSimpleMode ? 'linear-gradient(135deg,#f5a623,#e08e00)' : '';
            }
            fontModeBtn.addEventListener('click', () => {
                isSimpleMode = !isSimpleMode;
                localStorage.setItem(MODE_KEY, isSimpleMode ? 'true' : 'false');
                applySimpleMode();
            });
            applySimpleMode();
            applyDmFontSize();
        }

        // 密度图 Canvas
        if (!document.getElementById('ldx-density-canvas') && progressContainer) {
            densityCanvas = document.createElement('canvas');
            densityCanvas.id = 'ldx-density-canvas';
            const rect = progressContainer.getBoundingClientRect();
            densityCanvas.width = rect.width;
            densityCanvas.height = 30;
            progressContainer.appendChild(densityCanvas);
            const resizeObserver = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const rect = entry.contentRect;
                    densityCanvas.width = rect.width;
                    densityCanvas.height = 30;
                    redrawDensityGraph();
                }
            });
            resizeObserver.observe(progressContainer);
        }

        // 弹幕预览提示框
        if (!document.getElementById('ldx-tooltip') && videoWrap) {
            danmakuTooltip = document.createElement('div');
            danmakuTooltip.id = 'ldx-tooltip';
            videoWrap.appendChild(danmakuTooltip);
        }

        // 进度条鼠标事件
        if (progressContainer) {
            progressContainer.addEventListener('mousemove', handleProgressHover);
            progressContainer.addEventListener('mouseleave', hideProgressHover);
        }

        addVideoListeners();
    }

    // 启动脚本
    waitForPlayer();

})();
