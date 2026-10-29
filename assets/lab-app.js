const SAFETY_HANDBOOK_PDF_URL = window.DEFAULT_SAFETY_HANDBOOK_PDF_URL || '';

    function openSafetyHandbook() {
        toggleModal('safety-handbook-modal');
        refreshSafetyHandbookFrame();
    }

    function isPrepGuidePdf(meta) {
        if (!meta) return false;
        if (meta.mimeType === 'application/pdf') return true;
        return /\.pdf$/i.test(meta.fileName || meta.url || '');
    }

    function resolvePrepGuideMeta() {
        if (prepGuide?.url) {
            return {
                source: 'cloud',
                url: prepGuide.url,
                fileName: prepGuide.fileName || '實驗備課指引',
                mimeType: prepGuide.mimeType || '',
                isPdf: isPrepGuidePdf(prepGuide)
            };
        }
        return {
            source: 'default',
            url: PREP_GUIDE_DEFAULT_PATH,
            fileName: PREP_GUIDE_DEFAULT_NAME,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            isPdf: false
        };
    }

    async function fetchPrepGuideArrayBuffer(meta) {
        const url = meta?.url;
        if (!url) throw new Error('找不到備課指引檔案。');
        const res = await fetch(url);
        if (!res.ok) throw new Error('無法載入備課指引，請確認檔案已部署或聯絡管理員上傳。');
        return res.arrayBuffer();
    }

    async function renderPrepGuideViewer() {
        const loading = document.getElementById('prep-guide-loading');
        const frame = document.getElementById('prep-guide-frame');
        const htmlWrap = document.getElementById('prep-guide-html');
        const pdfjsHost = document.getElementById('prep-guide-pdfjs');
        const downloadBtn = document.getElementById('prep-guide-download-btn');
        if (!loading || !frame || !htmlWrap) return;

        loading.classList.remove('hidden');
        frame.classList.add('hidden');
        htmlWrap.classList.add('hidden');
        if (pdfjsHost) {
            pdfjsHost.classList.add('hidden');
            pdfjsHost.innerHTML = '';
        }
        frame.removeAttribute('src');
        htmlWrap.innerHTML = '';

        try {
            const meta = resolvePrepGuideMeta();
            const viewUrl = toViewableFileUrl(meta.url);
            if (downloadBtn) {
                downloadBtn.href = viewUrl || '#';
                downloadBtn.removeAttribute('download');
                downloadBtn.target = '_blank';
                downloadBtn.rel = 'noopener';
            }

            if (meta.isPdf) {
                if (preferPdfJsEmbed() && pdfjsHost) {
                    pdfjsHost.classList.remove('hidden');
                    await embedPdfInContainer(pdfjsHost, meta.url, meta.fileName);
                } else {
                    frame.src = viewUrl;
                    frame.classList.remove('hidden');
                }
            } else {
                if (typeof mammoth === 'undefined') {
                    throw new Error('Word 解析模組尚未載入，請重新整理頁面後再試。');
                }
                const arrayBuffer = await fetchPrepGuideArrayBuffer(meta);
                const result = await mammoth.convertToHtml({ arrayBuffer });
                htmlWrap.innerHTML = `<div class="prep-guide-body markdown-body p-6 md:p-8 max-w-4xl mx-auto">${result.value}</div>`;
                htmlWrap.classList.remove('hidden');
            }
        } catch (err) {
            htmlWrap.innerHTML = `<div class="p-6 text-center"><p class="text-red-600 font-semibold mb-2">無法載入備課指引</p><p class="text-sm text-stone-600">${escapeHtml(err.message || '未知錯誤')}</p></div>`;
            htmlWrap.classList.remove('hidden');
        } finally {
            loading.classList.add('hidden');
        }
    }

    async function openPrepGuide() {
        toggleModal('prep-guide-modal');
        await renderPrepGuideViewer();
    }

    function formatPrepGuideSize(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function renderPrepGuideManageInfo() {
        const infoEl = document.getElementById('pg-current-info');
        if (!infoEl) return;
        if (prepGuide?.url) {
            const typeLabel = isPrepGuidePdf(prepGuide) ? 'PDF' : 'Word';
            infoEl.innerHTML = `
                <p class="font-semibold text-stone-800 mb-1">目前使用雲端版本</p>
                <p class="text-xs"><span class="text-stone-500">檔案：</span>${escapeHtml(prepGuide.fileName || '備課指引')}</p>
                <p class="text-xs"><span class="text-stone-500">格式：</span>${typeLabel}</p>
                <p class="text-xs"><span class="text-stone-500">大小：</span>${formatPrepGuideSize(prepGuide.fileSize)}</p>
                <p class="text-xs"><span class="text-stone-500">更新：</span>${escapeHtml(prepGuide.uploadedAt || '—')}</p>
            `;
        } else {
            infoEl.innerHTML = `
                <p class="font-semibold text-stone-800 mb-1">目前使用內建預設指引</p>
                <p class="text-xs"><span class="text-stone-500">檔案：</span>${escapeHtml(PREP_GUIDE_DEFAULT_NAME)}</p>
                <p class="text-xs text-stone-500">管理員上傳新版本後，將取代內建版本並同步至所有裝置。</p>
            `;
        }
    }

    function openPrepGuideManageModal() {
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以管理實驗備課指引。', '🔒');
            return;
        }
        const form = document.getElementById('prep-guide-form');
        form?.reset();
        renderPrepGuideManageInfo();
        toggleModal('prep-guide-manage-modal');
    }

    async function persistPrepGuide() {
        SafeStorage.setItem('lab_prep_guide', JSON.stringify(prepGuide));
        const cloud = await ensureCloudSync();
        if (!cloud) return;
        try {
            await cloud.savePrepGuide(prepGuide);
        } catch (err) {
            console.error('Cloud sync failed (prep guide):', err);
            openInfoModal('⚠️ 雲端同步失敗', (err.message || '未知錯誤') + '。備課指引已儲存於本機，請稍後重試。', '☁️');
        }
    }

    window.applyCloudPrepGuide = function(data) {
        if (!data || typeof data !== 'object' || !data.url) return;
        prepGuide = data;
        SafeStorage.setItem('lab_prep_guide', JSON.stringify(prepGuide));
        renderPrepGuideManageInfo();
        const modal = document.getElementById('prep-guide-modal');
        if (modal && !modal.classList.contains('hidden')) {
            renderPrepGuideViewer();
        }
    };

    function openSafetyQuiz() {
        const frame = document.getElementById('safety-quiz-frame');
        const embed = document.getElementById('embedded-quiz-html');
        if (frame && embed) {
            if (frame._quizBlobUrl) {
                URL.revokeObjectURL(frame._quizBlobUrl);
                frame._quizBlobUrl = null;
            }
            const html = embed.value || '';
            try {
                const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                const blobUrl = URL.createObjectURL(blob);
                frame._quizBlobUrl = blobUrl;
                frame.removeAttribute('srcdoc');
                frame.src = blobUrl;
            } catch (err) {
                frame.srcdoc = html;
            }
        }
        toggleModal('safety-quiz-modal');
    }

    // ================= iOS / iPadOS Safari helpers =================
    function isAppleTouchDevice() {
        const ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function isCoarsePointerDevice() {
        try {
            return isAppleTouchDevice() || window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        } catch (e) {
            return isAppleTouchDevice();
        }
    }
    window.isCoarsePointerDevice = isCoarsePointerDevice;

    function preferPdfJsEmbed() {
        return isAppleTouchDevice();
    }

    function relaxIosFileAccepts() {
        if (!isAppleTouchDevice()) return;
        document.querySelectorAll('input[type="file"]').forEach(input => {
            const accept = input.getAttribute('accept') || '';
            if (!accept) return;
            const parts = [];
            if (/image|\.jpe?g|\.png|\.webp|\.gif/i.test(accept)) parts.push('image/*');
            if (/pdf/i.test(accept)) parts.push('application/pdf', '.pdf');
            if (/word|officedocument|msword|\.docx?/i.test(accept)) parts.push('.doc', '.docx');
            if (/powerpoint|presentation|\.pptx?/i.test(accept)) parts.push('.ppt', '.pptx');
            if (parts.length) input.setAttribute('accept', [...new Set(parts)].join(','));
        });
    }

    function ensurePdfJsWorker() {
        if (typeof pdfjsLib === 'undefined') return false;
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        return true;
    }

    function dataUrlToBlob(dataUrl) {
        const comma = dataUrl.indexOf(',');
        const header = comma >= 0 ? dataUrl.slice(0, comma) : 'data:application/octet-stream';
        const data = comma >= 0 ? dataUrl.slice(comma + 1) : '';
        const mime = (header.match(/data:([^;,]+)/) || [])[1] || 'application/octet-stream';
        if (!/;base64/i.test(header)) {
            return new Blob([decodeURIComponent(data)], { type: mime });
        }
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mime });
    }

    const _viewableUrlCache = new Map();
    function toViewableFileUrl(url) {
        if (!url) return '';
        if (url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('data:')) {
            if (_viewableUrlCache.has(url)) return _viewableUrlCache.get(url);
            try {
                const blobUrl = URL.createObjectURL(dataUrlToBlob(url));
                _viewableUrlCache.set(url, blobUrl);
                return blobUrl;
            } catch (e) {
                return url;
            }
        }
        return url;
    }

    async function tryShareBlob(blob, filename) {
        if (!blob || !navigator.share) return false;
        const name = filename || 'download';
        try {
            const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: name });
                return true;
            }
            await navigator.share({ title: name, text: name });
            return true;
        } catch (e) {
            return e && e.name === 'AbortError';
        }
    }

    async function tryShareFileUrl(url, filename) {
        if (!url || !navigator.share) return false;
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            return await tryShareBlob(blob, filename);
        } catch (e) {
            try {
                await navigator.share({ title: filename || '檔案', url: url.startsWith('http') ? url : undefined });
                return true;
            } catch (err) {
                return err && err.name === 'AbortError';
            }
        }
    }

    async function openOrDownloadFile(url, filename) {
        if (!url) return;
        const viewUrl = toViewableFileUrl(url);
        if (isAppleTouchDevice()) {
            const opened = window.open(viewUrl, '_blank');
            if (opened) return;
            if (await tryShareFileUrl(viewUrl, filename)) return;
            openInfoModal('📂 開啟檔案', '請允許彈出視窗，然後再試一次。iPhone / iPad 可在新分頁用 Safari 分享或儲存檔案。', '🍎');
            return;
        }
        const link = document.createElement('a');
        link.href = viewUrl;
        if (filename) link.download = filename;
        link.rel = 'noopener';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function embedPdfInContainer(container, url, fileName) {
        if (!container || !url) return;
        const viewUrl = toViewableFileUrl(url);
        const safeName = escapeHtml(fileName || 'document.pdf');
        const safeHref = viewUrl.replace(/"/g, '&quot;');
        const fallback = `<div class="text-center p-6 space-y-3 w-full">
            <p class="text-sm text-stone-600">此裝置無法在視窗內預覽 PDF，請改用 Safari 開啟。</p>
            <a href="${safeHref}" target="_blank" rel="noopener" class="inline-block bg-slate-800 text-white px-4 py-2.5 rounded-lg text-sm font-semibold">在 Safari 開啟 ${safeName}</a>
        </div>`;

        if (!preferPdfJsEmbed() || !ensurePdfJsWorker()) {
            container.innerHTML = `<iframe src="${safeHref}" class="w-full h-[min(70vh,640px)] rounded-lg border border-stone-200 bg-white" title="${safeName}"></iframe>
                <p class="text-center mt-2"><a href="${safeHref}" target="_blank" rel="noopener" class="text-xs font-semibold text-amber-700">若無法顯示，請在新分頁開啟</a></p>`;
            return;
        }

        container.innerHTML = `<div class="pdf-ios-toolbar">
                <div class="flex gap-2">
                    <button type="button" data-pdf-prev>‹ 上一頁</button>
                    <button type="button" data-pdf-next>下一頁 ›</button>
                </div>
                <span data-pdf-status class="text-xs text-stone-500 font-semibold">載入中…</span>
                <a href="${safeHref}" target="_blank" rel="noopener">在 Safari 開啟</a>
            </div>
            <div class="flex justify-center overflow-x-auto"><canvas class="pdf-ios-page"></canvas></div>`;

        try {
            const src = url.startsWith('data:')
                ? { data: new Uint8Array(await dataUrlToBlob(url).arrayBuffer()) }
                : { url: viewUrl, withCredentials: false };
            const pdf = await pdfjsLib.getDocument(src).promise;
            let pageNum = 1;
            const canvas = container.querySelector('canvas');
            const status = container.querySelector('[data-pdf-status]');
            const renderPage = async () => {
                const page = await pdf.getPage(pageNum);
                const unscaled = page.getViewport({ scale: 1 });
                const width = Math.max(280, (container.clientWidth || 320) - 8);
                const viewport = page.getViewport({ scale: Math.min(2, width / unscaled.width) });
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: ctx, viewport }).promise;
                if (status) status.textContent = `第 ${pageNum} / ${pdf.numPages} 頁`;
            };
            container.querySelector('[data-pdf-prev]').onclick = () => {
                if (pageNum > 1) { pageNum -= 1; renderPage(); }
            };
            container.querySelector('[data-pdf-next]').onclick = () => {
                if (pageNum < pdf.numPages) { pageNum += 1; renderPage(); }
            };
            await renderPage();
        } catch (err) {
            console.error('PDF preview failed:', err);
            container.innerHTML = fallback;
        }
    }
    window.embedPdfInContainer = embedPdfInContainer;
    window.openOrDownloadFile = openOrDownloadFile;

    // ================= 防禦性安全本地端儲存封裝 =================
    const SafeStorage = {
        _memoryDb: {},
        getItem(key) {
            try {
                return localStorage.getItem(key);
            } catch (e) {
                return this._memoryDb[key] || null;
            }
        },
        setItem(key, val) {
            try {
                localStorage.setItem(key, val);
            } catch (e) {
                this._memoryDb[key] = String(val);
            }
        },
        clear() {
            try {
                localStorage.clear();
            } catch (e) {
                this._memoryDb = {};
            }
        }
    };

    // ================= 初始化預設數據 =================
    const DEFAULT_RULES = [
        { id: 'r1', category: 'ppe', title: '護目鏡全程穿戴', desc: '在操作化學藥劑、使用加熱器或洗滌玻璃器皿時，必須全程佩戴標準安全護目鏡。' },
        { id: 'r2', category: 'ppe', title: '合身防護衣扣妥', desc: '實驗衣應合身，並扣好所有排扣，避免暴露袖口和衣角，最大化降低化學品接觸。' },
        { id: 'r3', category: 'ppe', title: '禁止鬆散飾品與長髮', desc: '長髮必須用橡皮筋紮緊，禁止穿戴懸垂吊飾。禁止穿著涼鞋或露趾鞋。' },
        { id: 'r4', category: 'behavior', title: '絕不嬉鬧追逐', desc: '嚴禁在實驗室內部、過道或走廊奔跑或進行惡作劇，禁止未經教師許可擅自進行測試。' },
        { id: 'r5', category: 'behavior', title: '嚴禁任何飲食', desc: '實驗室內嚴禁進食、飲水、咀嚼口香糖，不可將化學用玻璃器皿當做飲水杯。' },
        { id: 'r6', category: 'behavior', title: '全程有人值守', desc: '正處於加熱狀態下的熱源、沸騰液體或正在運行的反應設備，切勿無人看管。' },
        { id: 'r7', category: 'emergency', title: '發生溢漏立刻通報', desc: '遇到任何化學品潑濺在桌面或地板，請第一時間報告教師。請勿私自用碎布擦拭未知化學品。' },
        { id: 'r8', category: 'emergency', title: '緊急沖眼站洗滌', desc: '若有粉塵或化學藥劑不慎入眼，應撐開眼皮，在沖眼站連續沖洗生理食鹽水或清水 15 分鐘以上。' },
        { id: 'r9', category: 'emergency', title: '防火毯及時覆蓋', desc: '防火毯應掛在牆上最顯眼的位置。如遇衣服起火，應立即包裹身體以隔絕氧氣滅火。' }
    ];

    const DEFAULT_MISTAKES = [
        {
            id: 'm1',
            icon: '🩸',
            title: '手部握持玻璃管的位置過遠',
            desc: '在將玻璃導管、溫度計插入橡膠塞或乳膠管時，學生的手握持部位距離套管開口過遠，用力向前直推。',
            hazard: '不均勻的側向推力會使脆弱的玻璃管瞬間折斷。瞬間的慣性衝量會使斷裂之玻璃毛刺直接插入手掌或手指，造成皮肉深度割傷及出血。',
            correction: '1. 先用肥皂水或甘油潤滑玻璃管外壁。\n2. 用乾抹布包住手掌。\n3. 捏住距離插口僅 1-2 釐米處，配合輕柔的旋轉動作推入。'
        },
        {
            id: 'm2',
            icon: '👃',
            title: '直接湊近容器嗅聞蒸氣',
            desc: '將口鼻直接湊在產生蒸氣的試管、燒杯口，大力吸氣以辨識生成化學氣味。',
            hazard: '高濃度刺激性蒸氣（如濃氨水、氯氣等）會瞬間損害鼻腔、咽喉，導致氣管與肺部化學灼傷、劇烈咳嗽或窒息。',
            correction: '採用「扇聞法（Wafting）」：容器應置於距口鼻 15-20 釐米處，用手掌在容器口上方朝自己方向輕輕揮動扇風，使極少量的蒸氣飄入鼻腔進行判讀。'
        },
        {
            id: 'm3',
            icon: '💧',
            title: '將冷水倒入濃酸中稀釋',
            desc: '試圖通過在盛有濃硫酸的量筒或燒杯中加水來製備稀酸液。',
            hazard: '水和濃硫酸混合時會放出巨大熱量。少量冷水傾入大量濃硫酸中會瞬間沸騰、劇烈飛濺，把高度腐蝕性的濃酸噴濺到操作者面部。',
            correction: '請牢記「酸入水」原則（記法：AA 意即 Acid to Water）。把濃酸沿玻璃棒引流，緩慢、分批注入大量清水中，期間不斷攪拌散熱。'
        },
        {
            id: 'm4',
            icon: '🔥',
            title: '定點、定向對試管液體直接暴曬加熱',
            desc: '手拿試管夾保持在一個位置一動不動地高溫烘烤，試管開口方向恰好正對著自己或同學。',
            hazard: '區域液體受熱不均勻產生「暴沸」現象。試管內的液體會像子彈一樣帶著劇烈熱量與藥物瞬間從試管口向前方爆出。',
            correction: '加熱時試管傾斜約 45 度，且管口絕對不准對著任何人。試管應在燃燒火焰中輕微地前後晃動晃勻，保證受熱均衡。'
        }
    ];

    // 化學品名稱對照表（英文 / 中文 / 化學式）
    const CHEMICAL_LOOKUP = [
      { en: 'Sulphuric acid', zh: '濃硫酸', f: 'H₂SO₄' },
      { en: 'Hydrochloric acid', zh: '鹽酸', f: 'HCl' },
      { en: 'Sodium hydroxide', zh: '氫氧化鈉', f: 'NaOH' },
      { en: 'Potassium permanganate', zh: '高錳酸鉀', f: 'KMnO₄' },
      { en: 'Hydrogen peroxide', zh: '過氧化氫', f: 'H₂O₂' },
      { en: 'Ammonia solution', zh: '氨水', f: 'NH₄OH' },
      { en: 'Ethanol', zh: '乙醇', f: 'C₂H₅OH' },
      { en: 'Acetone', zh: '丙酮', f: 'C₃H₆O' },
      { en: 'Copper(II) sulfate', zh: '硫酸銅', f: 'CuSO₄' },
      { en: 'Iron(III) chloride', zh: '氯化鐵', f: 'FeCl₃' },
      { en: 'Sodium chloride', zh: '氯化鈉', f: 'NaCl' },
      { en: 'Calcium carbonate', zh: '碳酸鈣', f: 'CaCO₃' },
      { en: 'Sodium carbonate', zh: '碳酸鈉', f: 'Na₂CO₃' },
      { en: 'Potassium iodide', zh: '碘化鉀', f: 'KI' },
      { en: 'Lead(II) nitrate', zh: '硝酸鉛', f: 'Pb(NO₃)₂' },
      { en: 'Silver nitrate', zh: '硝酸銀', f: 'AgNO₃' },
      { en: 'Barium chloride', zh: '氯化鋇', f: 'BaCl₂' },
      { en: 'Potassium chloride', zh: '氯化鉀', f: 'KCl' },
      { en: 'Magnesium sulfate', zh: '硫酸鎂', f: 'MgSO₄' },
      { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      { en: 'Zinc sulfate', zh: '硫酸鋅', f: 'ZnSO₄' },
      { en: 'Manganese dioxide', zh: '二氧化錳', f: 'MnO₂' },
      { en: 'Sulfur', zh: '硫', f: 'S' },
      { en: 'Carbon', zh: '碳', f: 'C' },
      { en: 'Copper', zh: '銅', f: 'Cu' },
      { en: 'Iron', zh: '鐵', f: 'Fe' },
      { en: 'Zinc', zh: '鋅', f: 'Zn' },
      { en: 'Magnesium', zh: '鎂', f: 'Mg' },
      { en: 'Aluminum', zh: '鋁', f: 'Al' },
      { en: 'Lead', zh: '鉛', f: 'Pb' },
      { en: 'Tin', zh: '錫', f: 'Sn' },
      { en: 'Sodium thiosulfate', zh: '硫代硫酸鈉', f: 'Na₂S₂O₃' },
      { en: 'Potassium dichromate', zh: '重鉻酸鉀', f: 'K₂Cr₂O₇' },
      { en: 'Ammonium chloride', zh: '氯化銨', f: 'NH₄Cl' },
      { en: 'Barium hydroxide', zh: '氫氧化鋇', f: 'Ba(OH)₂' },
      { en: 'Calcium hydroxide', zh: '氫氧化鈣', f: 'Ca(OH)₂' },
      { en: 'Phosphoric acid', zh: '磷酸', f: 'H₃PO₄' },
      { en: 'Nitric acid', zh: '硝酸', f: 'HNO₃' },
      { en: 'Acetic acid', zh: '醋酸/乙酸', f: 'CH₃COOH' },
      { en: 'Oxalic acid', zh: '草酸', f: 'H₂C₂O₄' },
      { en: 'Sodium oxalate', zh: '草酸鈉', f: 'Na₂C₂O₄' },
      { en: 'Potassium nitrate', zh: '硝酸鉀', f: 'KNO₃' },
      { en: 'Ammonium nitrate', zh: '硝酸銨', f: 'NH₄NO₃' },
      { en: 'Sodium nitrate', zh: '硝酸鈉', f: 'NaNO₃' },
      { en: 'Urea', zh: '尿素', f: '(NH₂)₂CO' },
      { en: 'Glucose', zh: '葡萄糖', f: 'C₆H₁₂O₆' },
      { en: 'Sucrose', zh: '蔗糖', f: 'C₁₂H₂₂O₁₁' },
      { en: 'Starch', zh: '澱粉', f: '(C₆H₁₀O₅)n' },
      { en: 'Phenolphthalein', zh: '酚酞', f: 'C₂₀H₁₄O₄' },
      { en: 'Methyl orange', zh: '甲基橙', f: 'C₁₄H₁₄N₃NaO₃S' },
      { en: 'Litmus', zh: '石蕊', f: '(indicator)' },
      { en: 'Universal indicator', zh: '通用指示劑', f: '(mixture)' },
      { en: 'Bromothymol blue', zh: '溴百里酚藍', f: 'C₂₇H₂₈Br₂O₅S' },
      { en: 'Potassium ferrocyanide', zh: '亞鐵氰化鉀', f: 'K₄Fe(CN)₆' },
      { en: 'Potassium ferricyanide', zh: '鐵氰化鉀', f: 'K₃Fe(CN)₆' },
      { en: 'Ammonium iron(III) sulfate', zh: '硫酸鐵銨', f: 'NH₄Fe(SO₄)₂' },
      { en: 'Sodium sulfite', zh: '亞硫酸鈉', f: 'Na₂SO₃' },
      { en: 'Sodium bisulfite', zh: '亞硫酸氫鈉', f: 'NaHSO₃' },
      { en: 'Sodium metabisulfite', zh: '焦亞硫酸鈉', f: 'Na₂S₂O₅' },
      { en: 'Calcium chloride', zh: '氯化鈣', f: 'CaCl₂' },
      { en: 'Magnesium chloride', zh: '氯化鎂', f: 'MgCl₂' },
      { en: 'Aluminum chloride', zh: '氯化鋁', f: 'AlCl₃' },
      { en: 'Sodium phosphate', zh: '磷酸鈉', f: 'Na₃PO₄' },
      { en: 'Sodium hydrogen phosphate', zh: '磷酸氫二鈉', f: 'Na₂HPO₄' },
      { en: 'Sodium dihydrogen phosphate', zh: '磷酸二氫鈉', f: 'NaH₂PO₄' },
      { en: 'Potassium hydrogen phosphate', zh: '磷酸氫二鉀', f: 'K₂HPO₄' },
      { en: 'Potassium dihydrogen phosphate', zh: '磷酸二氫鉀', f: 'KH₂PO₄' },
      { en: 'Ammonium carbonate', zh: '碳酸銨', f: '(NH₄)₂CO₃' },
      { en: 'Ammonium sulfate', zh: '硫酸銨', f: '(NH₄)₂SO₄' },
      { en: 'Ammonium phosphate', zh: '磷酸銨', f: '(NH₄)₃PO₄' },
      { en: 'Calcium sulfate', zh: '硫酸鈣', f: 'CaSO₄' },
      { en: 'Barium sulfate', zh: '硫酸鋇', f: 'BaSO₄' },
      { en: 'Lead(II) acetate', zh: '醋酸鉛', f: 'Pb(CH₃COO)₂' },
      { en: 'Chromium(III) oxide', zh: '三氧化二鉻', f: 'Cr₂O₃' },
      { en: 'Chromium(VI) oxide', zh: '三氧化鉻', f: 'CrO₃' },
      { en: 'Potassium chromate', zh: '鉻酸鉀', f: 'K₂CrO₄' },
      { en: 'Cobalt(II) chloride', zh: '氯化鈷', f: 'CoCl₂' },
      { en: 'Nickel(II) sulfate', zh: '硫酸鎳', f: 'NiSO₄' },
      { en: 'Copper(II) oxide', zh: '氧化銅', f: 'CuO' },
      { en: 'Copper(II) carbonate', zh: '碳酸銅', f: 'CuCO₃' },
      { en: 'Iron(II) sulfate', zh: '硫酸亞鐵', f: 'FeSO₄' },
      { en: 'Iron(III) sulfate', zh: '硫酸鐵', f: 'Fe₂(SO₄)₃' },
      { en: 'Iron(III) oxide', zh: '三氧化二鐵', f: 'Fe₂O₃' },
      { en: 'Iron(II,III) oxide', zh: '四氧化三鐵', f: 'Fe₃O₄' },
      { en: 'Manganese(IV) oxide', zh: '二氧化錳', f: 'MnO₂' },
      { en: 'Silver chloride', zh: '氯化銀', f: 'AgCl' },
      { en: 'Silver bromide', zh: '溴化銀', f: 'AgBr' },
      { en: 'Silver iodide', zh: '碘化銀', f: 'AgI' },
      { en: 'Barium nitrate', zh: '硝酸鋇', f: 'Ba(NO₃)₂' },
      { en: 'Strontium chloride', zh: '氯化鍶', f: 'SrCl₂' },
      { en: 'Calcium oxide', zh: '氧化鈣', f: 'CaO' },
      { en: 'Magnesium oxide', zh: '氧化鎂', f: 'MgO' },
      { en: 'Aluminum oxide', zh: '氧化鋁', f: 'Al₂O₃' },
      { en: 'Silicon dioxide', zh: '二氧化矽', f: 'SiO₂' },
      { en: 'Carbon disulfide', zh: '二硫化碳', f: 'CS₂' },
      { en: 'Carbon tetrachloride', zh: '四氯化碳', f: 'CCl₄' },
      { en: 'Chloroform', zh: '氯仿', f: 'CHCl₃' },
      { en: 'Ether', zh: '乙醚', f: '(C₂H₅)₂O' },
      { en: 'Petroleum ether', zh: '石油醚', f: '(mixture)' },
      { en: 'Hexane', zh: '己烷', f: 'C₆H₁₄' },
      { en: 'Cyclohexane', zh: '環己烷', f: 'C₆H₁₂' },
      { en: 'Benzene', zh: '苯', f: 'C₆H₆' },
      { en: 'Toluene', zh: '甲苯', f: 'C₇H₈' },
      { en: 'Xylene', zh: '二甲苯', f: 'C₈H₁₀' },
      { en: 'Formaldehyde', zh: '甲醛', f: 'HCHO' },
      { en: 'Acetaldehyde', zh: '乙醛', f: 'CH₃CHO' },
      { en: 'Methyl ethyl ketone', zh: '丁酮', f: 'C₄H₈O' },
      { en: 'Ethyl acetate', zh: '乙酸乙酯', f: 'CH₃COOC₂H₅' },
      { en: 'Butyl acetate', zh: '乙酸丁酯', f: 'CH₃COOC₄H₉' },
      { en: 'Methanol', zh: '甲醇', f: 'CH₃OH' },
      { en: 'Isopropanol', zh: '異丙醇', f: 'C₃H₈O' },
      { en: 'Ethylene glycol', zh: '乙二醇', f: '(CH₂OH)₂' },
      { en: 'Glycerol', zh: '甘油', f: 'C₃H₈O₃' },
      { en: 'Chlorine water', zh: '氯水', f: 'Cl₂(aq)' },
      { en: 'Bromine water', zh: '溴水', f: 'Br₂(aq)' },
      { en: 'Iodine solution', zh: '碘溶液', f: 'I₂(aq)' },
      { en: 'Potassium iodide solution', zh: '碘化鉀溶液', f: 'KI(aq)' },
      { en: 'Silver nitrate solution', zh: '硝酸銀溶液', f: 'AgNO₃(aq)' },
      { en: 'Sodium hydroxide solution', zh: '氫氧化鈉溶液', f: 'NaOH(aq)' },
      { en: 'Hydrochloric acid solution', zh: '鹽酸溶液', f: 'HCl(aq)' },
      { en: 'Sulfuric acid solution', zh: '硫酸溶液', f: 'H₂SO₄(aq)' },
      { en: 'Nitric acid solution', zh: '硝酸溶液', f: 'HNO₃(aq)' },
      { en: 'Acetic acid solution', zh: '醋酸溶液', f: 'CH₃COOH(aq)' },
      { en: 'Limewater', zh: '石灰水', f: 'Ca(OH)₂(aq)' },
      { en: 'Barium hydroxide solution', zh: '氫氧化鋇溶液', f: 'Ba(OH)₂(aq)' },
      { en: 'Sodium carbonate solution', zh: '碳酸鈉溶液', f: 'Na₂CO₃(aq)' },
      { en: 'Sodium bicarbonate solution', zh: '碳酸氫鈉溶液', f: 'NaHCO₃(aq)' },
      { en: 'Sodium sulfate solution', zh: '硫酸鈉溶液', f: 'Na₂SO₄(aq)' },
      { en: 'Sodium sulfite solution', zh: '亞硫酸鈉溶液', f: 'Na₂SO₃(aq)' },
      { en: 'Sodium chloride solution', zh: '氯化鈉溶液', f: 'NaCl(aq)' },
      { en: 'Potassium chloride solution', zh: '氯化鉀溶液', f: 'KCl(aq)' },
      { en: 'Copper(II) sulfate solution', zh: '硫酸銅溶液', f: 'CuSO₄(aq)' },
      { en: 'Iron(III) chloride solution', zh: '氯化鐵溶液', f: 'FeCl₃(aq)' },
      { en: 'Zinc sulfate solution', zh: '硫酸鋅溶液', f: 'ZnSO₄(aq)' },
      { en: 'Barium chloride solution', zh: '氯化鋇溶液', f: 'BaCl₂(aq)' },
      { en: 'Calcium chloride solution', zh: '氯化鈣溶液', f: 'CaCl₂(aq)' },
      { en: 'Magnesium sulfate solution', zh: '硫酸鎂溶液', f: 'MgSO₄(aq)' },
      { en: 'Ammonium chloride solution', zh: '氯化銨溶液', f: 'NH₄Cl(aq)' },
      { en: 'Potassium nitrate solution', zh: '硝酸鉀溶液', f: 'KNO₃(aq)' },
      { en: 'Lead(II) nitrate solution', zh: '硝酸鉛溶液', f: 'Pb(NO₃)₂(aq)' },
      { en: 'Potassium chromate solution', zh: '鉻酸鉀溶液', f: 'K₂CrO₄(aq)' },
      { en: 'Potassium dichromate solution', zh: '重鉻酸鉀溶液', f: 'K₂Cr₂O₇(aq)' },
      { en: 'Potassium permanganate solution', zh: '高錳酸鉀溶液', f: 'KMnO₄(aq)' },
      { en: 'Hydrogen peroxide solution', zh: '過氧化氫溶液', f: 'H₂O₂(aq)' },
      { en: 'Phenolphthalein solution', zh: '酚酞溶液', f: 'C₂₀H₁₄O₄(aq)' },
      { en: 'Methyl orange solution', zh: '甲基橙溶液', f: 'C₁₄H₁₄N₃NaO₃S(aq)' },
      { en: 'Starch solution', zh: '澱粉溶液', f: '(C₆H₁₀O₅)n(aq)' },
      { en: 'Glucose solution', zh: '葡萄糖溶液', f: 'C₆H₁₂O₆(aq)' },
      { en: 'Sucrose solution', zh: '蔗糖溶液', f: 'C₁₂H₂₂O₁₁(aq)' },
      { en: 'Sodium thiosulfate solution', zh: '硫代硫酸鈉溶液', f: 'Na₂S₂O₃(aq)' },
      { en: 'Potassium ferrocyanide solution', zh: '亞鐵氰化鉀溶液', f: 'K₄Fe(CN)₆(aq)' },
      { en: 'Potassium ferricyanide solution', zh: '鐵氰化鉀溶液', f: 'K₃Fe(CN)₆(aq)' },
      { en: 'Ammonium iron(III) sulfate solution', zh: '硫酸鐵銨溶液', f: 'NH₄Fe(SO₄)₂(aq)' },
      { en: 'Cobalt(II) chloride solution', zh: '氯化鈷溶液', f: 'CoCl₂(aq)' },
      { en: 'Nickel(II) sulfate solution', zh: '硫酸鎳溶液', f: 'NiSO₄(aq)' },
      { en: 'Lead(IV) oxide', zh: '二氧化鉛', f: 'PbO₂' },
      { en: 'Sodium peroxide', zh: '過氧化鈉', f: 'Na₂O₂' },
      { en: 'Potassium superoxide', zh: '超氧化鉀', f: 'KO₂' },
      { en: 'Calcium carbide', zh: '碳化鈣', f: 'CaC₂' },
      { en: 'Sodium hydride', zh: '氫化鈉', f: 'NaH' },
      { en: 'Lithium aluminum hydride', zh: '氫化鋁鋰', f: 'LiAlH₄' },
      { en: 'Sodium borohydride', zh: '硼氫化鈉', f: 'NaBH₄' },
      { en: 'Potassium persulfate', zh: '過硫酸鉀', f: 'K₂S₂O₈' },
      { en: 'Ammonium persulfate', zh: '過硫酸銨', f: '(NH₄)₂S₂O₈' },
      { en: 'Benzoyl peroxide', zh: '過氧化苯甲酰', f: 'C₁₄H₁₀O₄' },
      { en: 'Potassium thiocyanate', zh: '硫氰酸鉀', f: 'KSCN' },
      { en: 'Iron(II) chloride', zh: '氯化亞鐵', f: 'FeCl₂' },
      { en: 'Copper(I) chloride', zh: '氯化亞銅', f: 'CuCl' },
      { en: 'Copper(II) chloride', zh: '氯化銅', f: 'CuCl₂' },
      { en: 'Tin(IV) chloride', zh: '四氯化錫', f: 'SnCl₄' },
      { en: 'Potassium bromide', zh: '溴化鉀', f: 'KBr' },
      { en: 'Sodium bromide', zh: '溴化鈉', f: 'NaBr' },
      { en: 'Aluminum sulfate', zh: '硫酸鋁', f: 'Al₂(SO₄)₃' },
      { en: 'Potassium aluminum sulfate', zh: '硫酸鋁鉀', f: 'KAl(SO₄)₂' },
      { en: 'Potassium sulfate', zh: '硫酸鉀', f: 'K₂SO₄' },
      { en: 'Sodium sulfate', zh: '硫酸鈉', f: 'Na₂SO₄' },
      { en: 'Manganese(II) sulfate', zh: '硫酸錳', f: 'MnSO₄' },
      { en: 'Strontium nitrate', zh: '硝酸鍶', f: 'Sr(NO₃)₂' },
      { en: 'Calcium nitrate', zh: '硝酸鈣', f: 'Ca(NO₃)₂' },
      { en: 'Lithium nitrate', zh: '硝酸鋰', f: 'LiNO₃' },
      { en: 'Ammonium dichromate', zh: '重鉻酸銨', f: '(NH₄)₂Cr₂O₇' },
      { en: 'Potassium chlorate', zh: '氯酸鉀', f: 'KClO₃' },
      { en: 'Lithium carbonate', zh: '碳酸鋰', f: 'Li₂CO₃' },
      { en: 'Potassium carbonate', zh: '碳酸鉀', f: 'K₂CO₃' },
      { en: 'Copper(II) hydroxide', zh: '氫氧化銅', f: 'Cu(OH)₂' },
      { en: 'Magnesium hydroxide', zh: '氫氧化鎂', f: 'Mg(OH)₂' },
      { en: 'Sodium acetate', zh: '乙酸鈉', f: 'CH₃COONa' },
      { en: 'Calcium acetate', zh: '乙酸鈣', f: 'Ca(CH₃COO)₂' },
      { en: 'Citric acid', zh: '檸檬酸', f: 'C₆H₈O₇' },
      { en: 'Trisodium citrate', zh: '檸檬酸三鈉', f: 'Na₃C₆H₅O₇' },
      { en: 'Boric acid', zh: '硼酸', f: 'H₃BO₃' },
      { en: 'Naphthalene', zh: '萘', f: 'C₁₀H₈' },
      { en: 'Methylene blue', zh: '亞甲藍', f: 'C₁₆H₁₈ClN₃S' },
      { en: 'Methyl violet', zh: '甲基紫', f: 'C₂₅H₃₀ClN₃' },
      { en: 'Eosin', zh: '曙紅', f: 'C₂₀H₈Br₄O₅' },
      { en: 'Fuchsine', zh: '品紅', f: 'C₂₀H₂₀ClN₃' },
      { en: 'Luminol', zh: '魯米諾', f: 'C₈H₇N₃O₂' },
      { en: 'Formic acid', zh: '甲酸', f: 'HCOOH' },
      { en: 'Butyric acid', zh: '丁酸', f: 'C₄H₈O₂' },
      { en: 'Oleic acid', zh: '油酸', f: 'C₁₈H₃₄O₂' },
      { en: 'Phenol', zh: '苯酚', f: 'C₆H₅OH' },
      { en: 'Silver sulfate', zh: '硫酸銀', f: 'Ag₂SO₄' },
      { en: 'Sodium silicate', zh: '硅酸鈉', f: 'Na₂SiO₃' },
      { en: 'Sodium tetraborate', zh: '四硼酸鈉', f: 'Na₂B₄O₇' },
      { en: 'Sodium molybdate', zh: '鉬酸鈉', f: 'Na₂MoO₄' },
      { en: 'Sodium nitrite', zh: '亞硝酸鈉', f: 'NaNO₂' },
      { en: 'Ammonium dihydrogen phosphate', zh: '磷酸二氫銨', f: 'NH₄H₂PO₄' },
      { en: 'Calcium dihydrogen phosphate', zh: '磷酸二氫鈣', f: 'Ca(H₂PO₄)₂' },
      { en: 'Copper(II) nitrate', zh: '硝酸銅', f: 'Cu(NO₃)₂' }
    ];
    
    const CHEM_ZH_ALIASES = {
      '稀硫酸': { en: 'Sulfuric acid solution', zh: '硫酸溶液', f: 'H₂SO₄(aq)' },
      '濃硫酸': { en: 'Sulphuric acid', zh: '濃硫酸', f: 'H₂SO₄' },
      '稀鹽酸': { en: 'Hydrochloric acid solution', zh: '鹽酸溶液', f: 'HCl(aq)' },
      '濃鹽酸': { en: 'Hydrochloric acid', zh: '鹽酸', f: 'HCl' },
      '稀硝酸': { en: 'Nitric acid solution', zh: '硝酸溶液', f: 'HNO₃(aq)' },
      '濃硝酸': { en: 'Nitric acid', zh: '硝酸', f: 'HNO₃' },
      '濃磷酸': { en: 'Phosphoric acid', zh: '磷酸', f: 'H₃PO₄' },
      '雙氧水': { en: 'Hydrogen peroxide', zh: '過氧化氫', f: 'H₂O₂' },
      '酒精': { en: 'Ethanol', zh: '乙醇', f: 'C₂H₅OH' },
      '丙三醇': { en: 'Glycerol', zh: '甘油', f: 'C₃H₈O₃' },
      '三氯甲烷': { en: 'Chloroform', zh: '氯仿', f: 'CHCl₃' },
      '四氯化碳': { en: 'Carbon tetrachloride', zh: '四氯化碳', f: 'CCl₄' },
      '正己烷': { en: 'Hexane', zh: '己烷', f: 'C₆H₁₄' },
      '乙酸乙酯': { en: 'Ethyl acetate', zh: '乙酸乙酯', f: 'CH₃COOC₂H₅' },
      '冰醋酸': { en: 'Acetic acid', zh: '醋酸', f: 'CH₃COOH' },
      '稀醋酸': { en: 'Acetic acid solution', zh: '醋酸溶液', f: 'CH₃COOH(aq)' },
      '碘液': { en: 'Iodine solution', zh: '碘溶液', f: 'I₂(aq)' },
      '稀碘液': { en: 'Iodine solution', zh: '碘溶液', f: 'I₂(aq)' },
      '澄清石灰水': { en: 'Limewater', zh: '石灰水', f: 'Ca(OH)₂(aq)' },
      '氧化鐵': { en: 'Iron(III) oxide', zh: '三氧化二鐵', f: 'Fe₂O₃' },
      '活性碳': { en: 'Carbon', zh: '碳', f: 'C' },
      '硫酸亞鐵銨': { en: 'Ammonium iron(III) sulfate', zh: '硫酸鐵銨', f: 'NH₄Fe(SO₄)₂' },
      '無水碳酸鈉': { en: 'Sodium carbonate', zh: '碳酸鈉', f: 'Na₂CO₃' },
      '無水硫酸鈉': { en: 'Sodium sulfate', zh: '硫酸鈉', f: 'Na₂SO₄' },
      '無水亞硫酸鈉': { en: 'Sodium sulfite', zh: '亞硫酸鈉', f: 'Na₂SO₃' },
      '無水乙酸鈉': { en: 'Sodium acetate', zh: '乙酸鈉', f: 'CH₃COONa' },
      '三水硝酸銅': { en: 'Copper(II) nitrate', zh: '硝酸銅', f: 'Cu(NO₃)₂' },
      '二氯乙烷': { en: '1,2-Dichloroethane', zh: '二氯乙烷', f: 'C₂H₄Cl₂' },
      '龍膽紫': { en: 'Methyl violet', zh: '甲基紫', f: 'C₂₅H₃₀ClN₃' },
      '次甲基藍': { en: 'Methylene blue', zh: '亞甲藍', f: 'C₁₆H₁₈ClN₃S' },
      '四溴螢光黃': { en: 'Eosin', zh: '曙紅', f: 'C₂₀H₈Br₄O₅' },
      '小蘇打': { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      '小苏打': { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      '蘇打': { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      '梳打': { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      '苏打粉': { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      'baking soda': { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      '食鹽': { en: 'Sodium chloride', zh: '氯化鈉', f: 'NaCl' },
      '食盐': { en: 'Sodium chloride', zh: '氯化鈉', f: 'NaCl' },
      '鹽': { en: 'Sodium chloride', zh: '氯化鈉', f: 'NaCl' },
      '燒鹼': { en: 'Sodium hydroxide', zh: '氫氧化鈉', f: 'NaOH' },
      '烧碱': { en: 'Sodium hydroxide', zh: '氫氧化鈉', f: 'NaOH' },
      '苛性鈉': { en: 'Sodium hydroxide', zh: '氫氧化鈉', f: 'NaOH' },
      '小蘇打粉': { en: 'Sodium bicarbonate', zh: '碳酸氫鈉', f: 'NaHCO₃' },
      '石灰': { en: 'Calcium oxide', zh: '氧化鈣', f: 'CaO' },
      '生石灰': { en: 'Calcium oxide', zh: '氧化鈣', f: 'CaO' },
      '熟石灰': { en: 'Calcium hydroxide', zh: '氫氧化鈣', f: 'Ca(OH)₂' },
      '電石': { en: 'Calcium carbide', zh: '碳化鈣', f: 'CaC₂' },
      '明礬': { en: 'Potassium aluminum sulfate', zh: '硫酸鋁鉀', f: 'KAl(SO₄)₂' },
      '石膏': { en: 'Calcium sulfate', zh: '硫酸鈣', f: 'CaSO₄' }
    };
    
    function normalizeChemKey(value) {
      return (value || '').toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[（）()]/g, '')
        .replace(/\./g, '')
        .replace(/conc/gi, '')
        .replace(/solution/gi, '')
        .replace(/sol/gi, '')
        .trim();
    }
    
    function buildChemLookupMaps() {
      const byEn = new Map();
      const byZh = new Map();
      const addZh = (zh, entry) => {
        if (!zh) return;
        zh.split(/[/／、]/).forEach(part => {
          const key = normalizeChemKey(part.trim());
          if (key) byZh.set(key, entry);
        });
      };
      CHEMICAL_LOOKUP.forEach(entry => {
        byEn.set(normalizeChemKey(entry.en), entry);
        addZh(entry.zh, entry);
      });
      Object.entries(CHEM_ZH_ALIASES).forEach(([alias, entry]) => addZh(alias, entry));
      return { byEn, byZh };
    }
    
    const CHEM_LOOKUP_MAPS = buildChemLookupMaps();
    
    function buildInventoryDisplayName(item) {
      const en = item.nameEn || '';
      const zh = item.nameZh || '';
      const formula = item.formula && item.formula !== '—' ? item.formula : '';
      const label = [en, zh].filter(Boolean).join(' ').trim();
      if (!label && item.name) return item.name;
      if (formula && !label.includes(formula)) return `${label} ${formula}`.trim();
      return label || item.name || '';
    }
    
    function getInventorySearchLabel(item) {
      return [item.nameEn, item.nameZh, item.formula, item.name, item.location, item.stockQuantity].filter(Boolean).join(' ').toLowerCase();
    }
    
    function enrichInventoryItem(item) {
      const rec = { ...item };
      if (!Array.isArray(rec.msds)) rec.msds = [];
      if (!Array.isArray(rec.photos)) rec.photos = [];
      rec.quantity = rec.quantity == null ? '' : String(rec.quantity);
      const stockRaw = rec.stockQuantity != null && rec.stockQuantity !== ''
          ? rec.stockQuantity
          : (rec.stockQty != null ? rec.stockQty : '');
      rec.stockQuantity = String(stockRaw).trim();
      delete rec.stockQty;
    
      if (rec.category === '物理儀器') {
        rec.nameEn = rec.nameEn || rec.name || '';
        rec.nameZh = rec.nameZh || rec.name || '';
        rec.formula = rec.formula || '—';
        rec.name = buildInventoryDisplayName(rec);
        return rec;
      }
    
      const rawName = rec.name || '';
      if (!rec.nameEn || !rec.nameZh || !rec.formula) {
        let matched = null;
        const aliasKeys = Object.keys(CHEM_ZH_ALIASES).sort((a, b) => b.length - a.length);
        for (const alias of aliasKeys) {
          if (rawName.includes(alias)) {
            matched = CHEM_ZH_ALIASES[alias];
            break;
          }
        }
    
        if (!matched) {
          const enMatch = rawName.match(/^([A-Za-z][A-Za-z0-9(),.\-\s%/]*?)(?=\s*[\u4e00-\u9fff]|$)/);
          if (enMatch) {
            const key = normalizeChemKey(enMatch[1]);
            matched = CHEM_LOOKUP_MAPS.byEn.get(key);
            if (!matched) {
              const simplified = key.replace(/\s+/g, '');
              for (const [enKey, entry] of CHEM_LOOKUP_MAPS.byEn.entries()) {
                if (enKey.replace(/\s+/g, '') === simplified || simplified.includes(enKey.replace(/\s+/g, '')) || enKey.replace(/\s+/g, '').includes(simplified)) {
                  matched = entry;
                  break;
                }
              }
            }
            if (!matched) rec.nameEn = enMatch[1].trim();
          }
        }
    
        if (!matched) {
          const zhSegments = rawName.match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9()（）·\-]*/g) || [];
          for (const segment of zhSegments.sort((a, b) => b.length - a.length)) {
            const hit = CHEM_LOOKUP_MAPS.byZh.get(normalizeChemKey(segment));
            if (hit) {
              matched = hit;
              break;
            }
          }
        }
    
        if (matched) {
          rec.nameEn = rec.nameEn || matched.en;
          rec.nameZh = rec.nameZh || matched.zh.split(/[/／]/)[0];
          rec.formula = rec.formula || matched.f;
        }
    
        if (!rec.nameZh) {
          const zhOnly = rawName.match(/[\u4e00-\u9fff][\u4e00-\u9fffA-Za-z0-9()（）·\-]*/);
          if (zhOnly) rec.nameZh = zhOnly[0];
        }
    
        if (!rec.formula) {
          const formulaMatch = rawName.match(/([A-Z][A-Za-z₀-₉⁰-⁹\d()（）\[\]ₙ\.]+(?:\(aq\))?)/);
          if (formulaMatch) rec.formula = formulaMatch[1];
        }
    
        rec.nameEn = rec.nameEn || (/[A-Za-z]/.test(rawName) ? rawName : '—');
        rec.nameZh = rec.nameZh || (/[\u4e00-\u9fff]/.test(rawName) ? rawName : '—');
        rec.formula = rec.formula || '—';
      }
    
      rec.name = buildInventoryDisplayName(rec);
      return rec;
    }
    // 619A 化學準備室 + 物理實驗室庫存（匯入自 20260710 用戶清單）
    const DEFAULT_INVENTORIES = [
        { id: 'inv_1', nameEn: 'Sulphuric acid', nameZh: '稀硫酸', formula: 'H₂SO₄', name: 'Sulphuric acid 稀硫酸 H₂SO₄', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 4', quantity: '1M', hazards: '腐蝕性' },
        { id: 'inv_2', nameEn: 'Phosphoric acid', nameZh: '磷酸', formula: 'H₃PO₄', name: 'Phosphoric acid 磷酸 H₃PO₄', category: '液體強酸強鹼', location: '619A 準備室 LC1 - LL 2', quantity: '(> 85%)', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_3', nameEn: 'Sodium chloride', nameZh: '氯化鈉', formula: 'NaCl', name: 'Sodium chloride 氯化鈉 NaCl', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_4', nameEn: 'Copper(I) chloride', nameZh: '氯化亞銅', formula: 'CuCl', name: 'Copper(I) chloride 氯化亞銅 CuCl', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 2', quantity: '—', hazards: '腐蝕性, 刺激性, 環境危害' },
        { id: 'inv_5', nameEn: 'Copper(II) chloride', nameZh: '氯化銅', formula: 'CuCl₂', name: 'Copper(II) chloride 氯化銅 CuCl₂', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_6', nameEn: 'Tin(IV) chloride', nameZh: '四氯化錫', formula: 'SnCl₄', name: 'Tin(IV) chloride 四氯化錫 SnCl₄', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_7', nameEn: 'Iron(III)Chloride', nameZh: '三氯化鐵', formula: 'FeCL3', name: 'Iron(III)Chloride 三氯化鐵 FeCL3', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_8', nameEn: 'aluminium chloride', nameZh: '三氯化鋁', formula: 'AlCl3', name: 'aluminium chloride 三氯化鋁 AlCl3', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 2', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_9', nameEn: 'Ammonium chloride', nameZh: '氯化銨', formula: 'NH₄Cl', name: 'Ammonium chloride 氯化銨 NH₄Cl', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_10', nameEn: 'Potassium iodide', nameZh: '碘化鉀', formula: 'KI', name: 'Potassium iodide 碘化鉀 KI', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 1', quantity: '—', hazards: '健康危害' },
        { id: 'inv_11', nameEn: 'Potassium bromide', nameZh: '溴化鉀', formula: 'KBr', name: 'Potassium bromide 溴化鉀 KBr', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 1', quantity: '—', hazards: '刺激性' },
        { id: 'inv_12', nameEn: 'Sodium bromide', nameZh: '溴化鈉', formula: 'NaBr', name: 'Sodium bromide 溴化鈉 NaBr', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 1', quantity: '—', hazards: '刺激性' },
        { id: 'inv_13', nameEn: 'Nitric acid', nameZh: '硝酸', formula: 'HNO₃', name: 'Nitric acid 硝酸 HNO₃', category: '液體強酸強鹼', location: '619A 準備室 LC1 - LL 2', quantity: '(65% - 68%)', hazards: '強氧化性, 有毒, 腐蝕性' },
        { id: 'inv_14', nameEn: 'Cobalt(II) chloride', nameZh: '氯化鈷', formula: 'CoCl₂', name: 'Cobalt(II) chloride 氯化鈷 CoCl₂', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 1', quantity: '—', hazards: '健康危害, 腐蝕性, 刺激性, 環境危害' },
        { id: 'inv_15', nameEn: 'Calcium acetate', nameZh: '乙酸鈣', formula: 'Ca(CH₃COO)₂', name: 'Calcium acetate 乙酸鈣 Ca(CH₃COO)₂', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_16', nameEn: 'Trisodium citrate', nameZh: '檸檬酸三鈉', formula: 'Na₃C₆H₅O₇', name: 'Trisodium citrate 檸檬酸三鈉 Na₃C₆H₅O₇', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_17', nameEn: 'Citric acid', nameZh: '檸檬酸', formula: 'C₆H₈O₇', name: 'Citric acid 檸檬酸 C₆H₈O₇', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_18', nameEn: 'Lithium nitrate', nameZh: '硝酸鋰', formula: 'LiNO₃', name: 'Lithium nitrate 硝酸鋰 LiNO₃', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 2', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_19', nameEn: 'Potassium nitrate', nameZh: '硝酸鉀', formula: 'KNO₃', name: 'Potassium nitrate 硝酸鉀 KNO₃', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '強氧化性' },
        { id: 'inv_20', nameEn: 'Sodium nitrate', nameZh: '硝酸鈉', formula: 'NaNO₃', name: 'Sodium nitrate 硝酸鈉 NaNO₃', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_21', nameEn: 'Barium nitrate', nameZh: '硝酸鋇', formula: 'Ba(NO₃)₂', name: 'Barium nitrate 硝酸鋇 Ba(NO₃)₂', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '強氧化性, 有毒' },
        { id: 'inv_22', nameEn: 'Calcium nitrate', nameZh: '硝酸鈣', formula: 'Ca(NO₃)₂', name: 'Calcium nitrate 硝酸鈣 Ca(NO₃)₂', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_23', nameEn: 'Lead(II) nitrate', nameZh: '硝酸鉛', formula: 'Pb(NO₃)₂', name: 'Lead(II) nitrate 硝酸鉛 Pb(NO₃)₂', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '健康危害, 腐蝕性, 刺激性, 環境危害' },
        { id: 'inv_24', nameEn: 'Copper', nameZh: '銅片', formula: 'Cu', name: 'Copper 銅片 Cu', category: '液體強酸強鹼', location: '619A 準備室 LC1 - LL 1', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_25', nameEn: 'Strontium nitrate', nameZh: '硝酸鍶', formula: 'Sr(NO₃)₂', name: 'Strontium nitrate 硝酸鍶 Sr(NO₃)₂', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '強氧化性, 健康危害, 腐蝕性, 環境危害' },
        { id: 'inv_26', nameEn: 'Silver nitrate', nameZh: '硝酸銀', formula: 'AgNO₃', name: 'Silver nitrate 硝酸銀 AgNO₃', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_27', nameEn: 'Ammonium nitrate', nameZh: '硝酸銨', formula: 'NH₄NO₃', name: 'Ammonium nitrate 硝酸銨 NH₄NO₃', category: '固體/鹽類', location: '619A 準備室 SC2 - UL 1', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_28', nameEn: 'Ammonium dichromate', nameZh: '重鉻酸銨', formula: '(NH₄)₂Cr₂O₇', name: 'Ammonium dichromate 重鉻酸銨 (NH₄)₂Cr₂O₇', category: '固體/鹽類', location: '619A 準備室 SC2 - LL 3', quantity: '—', hazards: '強氧化性, 劇毒, 健康危害, 腐蝕性, 環境危害' },
        { id: 'inv_29', nameEn: 'Potassium permanganate', nameZh: '高錳酸鉀', formula: 'KMnO₄', name: 'Potassium permanganate 高錳酸鉀 KMnO₄', category: '固體/鹽類', location: '619A 準備室 SC2 - LL 3', quantity: '—', hazards: '強氧化性, 健康危害, 腐蝕性, 刺激性, 環境危害' },
        { id: 'inv_30', nameEn: 'Potassium chlorate', nameZh: '氯酸鉀', formula: 'KClO₃', name: 'Potassium chlorate 氯酸鉀 KClO₃', category: '固體/鹽類', location: '619A 準備室 SC2 - LL 3', quantity: '—', hazards: '強氧化性, 有毒' },
        { id: 'inv_31', nameEn: 'Disodium Edetate', nameZh: '乙二胺四乙酸二鈉', formula: 'C10H14N2O8Na2', name: 'Disodium Edetate 乙二胺四乙酸二鈉 C10H14N2O8Na2', category: '固體/鹽類', location: '619A 準備室 SC2 - LL 2', quantity: '—', hazards: '健康危害, 刺激性' },
        { id: 'inv_32', nameEn: 'Potassium chromate', nameZh: '鉻酸鉀', formula: 'K₂CrO₄', name: 'Potassium chromate 鉻酸鉀 K₂CrO₄', category: '固體/鹽類', location: '619A 準備室 SC2 - LL 2', quantity: '—', hazards: '健康危害, 刺激性, 環境危害' },
        { id: 'inv_33', nameEn: 'Potassium dichromate', nameZh: '重鉻酸鉀', formula: 'K₂Cr₂O₇', name: 'Potassium dichromate 重鉻酸鉀 K₂Cr₂O₇', category: '固體/鹽類', location: '619A 準備室 SC2 - LL 1', quantity: '—', hazards: '強氧化性, 劇毒, 健康危害, 腐蝕性, 環境危害' },
        { id: 'inv_34', nameEn: 'Calcium carbonate', nameZh: '碳酸鈣', formula: 'CaCO₃', name: 'Calcium carbonate 碳酸鈣 CaCO₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_35', nameEn: 'Silver sulphate', nameZh: '硫酸銀', formula: 'Ag', name: 'Silver sulphate 硫酸銀 Ag', category: '液體強酸強鹼', location: '619A 準備室 LC1 - LL 1', quantity: '2% / 0.12M', hazards: '腐蝕性, 環境危害' },
        { id: 'inv_36', nameEn: 'Copper(II) carbonate', nameZh: '碳酸銅', formula: 'CuCO₃', name: 'Copper(II) carbonate 碳酸銅 CuCO₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_37', nameEn: 'Sodium bicarbonate', nameZh: '碳酸氫鈉', formula: 'NaHCO₃', name: 'Sodium bicarbonate 碳酸氫鈉 NaHCO₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_38', nameEn: 'Lithium carbonate', nameZh: '碳酸鋰', formula: 'Li₂CO₃', name: 'Lithium carbonate 碳酸鋰 Li₂CO₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_39', nameEn: 'Sodium carbonate', nameZh: '碳酸鈉', formula: 'Na₂CO₃', name: 'Sodium carbonate 碳酸鈉 Na₂CO₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_40', nameEn: 'Potassium carbonate', nameZh: '碳酸鉀', formula: 'K₂CO₃', name: 'Potassium carbonate 碳酸鉀 K₂CO₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_41', nameEn: 'Manganese(IV) oxide', nameZh: '二氧化錳', formula: 'MnO₂', name: 'Manganese(IV) oxide 二氧化錳 MnO₂', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 2', quantity: '—', hazards: '健康危害, 刺激性' },
        { id: 'inv_42', nameEn: 'Iron(III) oxide', nameZh: '三氧化二鐵', formula: 'Fe₂O₃', name: 'Iron(III) oxide 三氧化二鐵 Fe₂O₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_43', nameEn: 'Copper(II) oxide', nameZh: '氧化銅', formula: 'CuO', name: 'Copper(II) oxide 氧化銅 CuO', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_44', nameEn: 'Aluminium oxide', nameZh: '氧化鋁', formula: 'Al₂O₃', name: 'Aluminium oxide 氧化鋁 Al₂O₃', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_45', nameEn: 'Calcium oxide', nameZh: '氧化鈣', formula: 'CaO', name: 'Calcium oxide 氧化鈣 CaO', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_46', nameEn: 'Strontium nitrate', nameZh: '硝酸鍶', formula: 'Sr(NO₃)₂', name: 'Strontium nitrate 硝酸鍶 Sr(NO₃)₂', category: '液體強酸強鹼', location: '619A 準備室 LC1 - LL 1', quantity: '> 60%', hazards: '強氧化性, 刺激性' },
        { id: 'inv_47', nameEn: 'Soda Lime', nameZh: '鈉石灰', formula: '—', name: 'Soda Lime 鈉石灰', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 2', quantity: '—', hazards: '刺激性, 腐蝕性' },
        { id: 'inv_48', nameEn: 'Sodium molybdate', nameZh: '鉬酸鈉', formula: 'Na₂MoO₄', name: 'Sodium molybdate 鉬酸鈉 Na₂MoO₄', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_49', nameEn: 'Barium hydroxide', nameZh: '氫氧化鋇', formula: 'Ba(OH)₂', name: 'Barium hydroxide 氫氧化鋇 Ba(OH)₂', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 1', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_50', nameEn: 'Copper(II) hydroxide', nameZh: '氫氧化銅', formula: 'Cu(OH)₂', name: 'Copper(II) hydroxide 氫氧化銅 Cu(OH)₂', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 1', quantity: '—', hazards: '有毒, 腐蝕性, 環境危害' },
        { id: 'inv_51', nameEn: 'Magnesium hydroxide', nameZh: '氫氧化鎂', formula: 'Mg(OH)₂', name: 'Magnesium hydroxide 氫氧化鎂 Mg(OH)₂', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 1', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_52', nameEn: 'Calcium hydroxide', nameZh: '氫氧化鈣', formula: 'Ca(OH)₂', name: 'Calcium hydroxide 氫氧化鈣 Ca(OH)₂', category: '固體/鹽類', location: '619A 準備室 SC3 - UL 1', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_53', nameEn: 'Citric acid', nameZh: '檸檬酸', formula: 'C₆H₈O₇', name: 'Citric acid 檸檬酸 C₆H₈O₇', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_54', nameEn: 'Activated carbon', nameZh: '碳', formula: 'C', name: 'Activated carbon 碳', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 3', quantity: '—', hazards: '易燃性' },
        { id: 'inv_55', nameEn: 'Starch', nameZh: '澱粉', formula: '(C₆H₁₀O₅)n', name: 'Starch 澱粉 (C₆H₁₀O₅)n', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_56', nameEn: 'Sucrose', nameZh: '蔗糖', formula: 'C₁₂H₂₂O₁₁', name: 'Sucrose 蔗糖 C₁₂H₂₂O₁₁', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_57', nameEn: 'Barium nitrate', nameZh: '硝酸鋇', formula: 'Ba(NO₃)₂', name: 'Barium nitrate 硝酸鋇 Ba(NO₃)₂', category: '液體強酸強鹼', location: '619A 準備室 LC1 - LL 1', quantity: '> 20%', hazards: '強氧化性, 有毒' },
        { id: 'inv_58', nameEn: 'Glucose', nameZh: '葡萄糖', formula: 'C₆H₁₂O₆', name: 'Glucose 葡萄糖 C₆H₁₂O₆', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_59', nameEn: 'Sodium oxalate', nameZh: '草酸鈉', formula: 'Na₂C₂O₄', name: 'Sodium oxalate 草酸鈉 Na₂C₂O₄', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_60', nameEn: 'Oxalic acid', nameZh: '草酸', formula: 'H₂C₂O₄', name: 'Oxalic acid 草酸 H₂C₂O₄', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_61', nameEn: 'Sodium acetate', nameZh: '乙酸鈉', formula: 'CH₃COONa', name: 'Sodium acetate 乙酸鈉 CH₃COONa', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_62', nameEn: 'Calcium acetate', nameZh: '乙酸鈣', formula: 'Ca(CH₃COO)₂', name: 'Calcium acetate 乙酸鈣 Ca(CH₃COO)₂', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_63', nameEn: 'Trisodium citrate', nameZh: '檸檬酸三鈉', formula: 'Na₃C₆H₅O₇', name: 'Trisodium citrate 檸檬酸三鈉 Na₃C₆H₅O₇', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_64', nameEn: 'Boric acid', nameZh: '硼酸', formula: 'H₃BO₃', name: 'Boric acid 硼酸 H₃BO₃', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: '健康危害' },
        { id: 'inv_65', nameEn: 'Agar powder', nameZh: '琼脂粉', formula: '—', name: 'Agar powder 琼脂粉', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_66', nameEn: 'Magnesium sulphate', nameZh: '硫酸鎂', formula: 'MgSO₄(aq)', name: 'Magnesium sulphate 硫酸鎂 MgSO₄(aq)', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_67', nameEn: 'Naphthalene', nameZh: '萘', formula: 'C₁₀H₈', name: 'Naphthalene 萘 C₁₀H₈', category: '有機溶劑/易燃', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '易燃固體, 健康危害, 刺激性, 環境危害' },
        { id: 'inv_68', nameEn: 'Phenolphthalein', nameZh: '酚酞溶液', formula: 'C₂₀H₁₄O₄(aq)', name: 'Phenolphthalein 酚酞溶液 C₂₀H₁₄O₄(aq)', category: '化學藥品', location: '619A 準備室 LC2 - UL 4', quantity: '—', hazards: '健康危害, 刺激性' },
        { id: 'inv_69', nameEn: 'Polystyrene (PS)', nameZh: '聚苯乙烯', formula: '—', name: 'Polystyrene (PS) 聚苯乙烯', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '—' },
        { id: 'inv_70', nameEn: 'Polypropylene (PP)', nameZh: '聚丙烯', formula: '—', name: 'Polypropylene (PP) 聚丙烯', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '—' },
        { id: 'inv_71', nameEn: 'Polyvinyl Chloride (PVC)', nameZh: '聚氯乙烯', formula: '—', name: 'Polyvinyl Chloride (PVC) 聚氯乙烯', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '—' },
        { id: 'inv_72', nameEn: 'Urea', nameZh: '尿素', formula: '(NH₂)₂CO', name: 'Urea 尿素 (NH₂)₂CO', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_73', nameEn: '—', nameZh: '松香粉', formula: '—', name: '松香粉', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '—' },
        { id: 'inv_74', nameEn: '—', nameZh: '鞣酸', formula: '—', name: '鞣酸', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '—' },
        { id: 'inv_75', nameEn: '—', nameZh: '硬脂酸', formula: '—', name: '硬脂酸', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '—' },
        { id: 'inv_76', nameEn: 'Polyethylene Glycol (PEG)', nameZh: '聚乙二醇', formula: '—', name: 'Polyethylene Glycol (PEG) 聚乙二醇', category: '固體/鹽類', location: '619A 準備室 SC3 - LL 1', quantity: '—', hazards: '—' },
        { id: 'inv_77', nameEn: 'Potassium sulphate', nameZh: '硫酸鉀', formula: 'K₂SO₄', name: 'Potassium sulphate 硫酸鉀 K₂SO₄', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '無' },
        { id: 'inv_78', nameEn: 'Potassium sulphate', nameZh: '硫酸鉀', formula: 'K₂SO₄', name: 'Potassium sulphate 硫酸鉀 K₂SO₄', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '無' },
        { id: 'inv_79', nameEn: 'Litmus powder', nameZh: '石蕊', formula: '(indicator)', name: 'Litmus powder 石蕊 (indicator)', category: '化學藥品', location: '619A 準備室 LC2 - UL 4', quantity: '—', hazards: '無' },
        { id: 'inv_80', nameEn: 'Sodium carbonate', nameZh: '碳酸鈉', formula: 'Na₂CO₃', name: 'Sodium carbonate 碳酸鈉 Na₂CO₃', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_81', nameEn: 'Sodium sulphate', nameZh: '硫酸鈉', formula: 'Na₂SO₄', name: 'Sodium sulphate 硫酸鈉 Na₂SO₄', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '無' },
        { id: 'inv_82', nameEn: 'Potassium nitrate', nameZh: '硝酸鉀', formula: 'KNO₃', name: 'Potassium nitrate 硝酸鉀 KNO₃', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_83', nameEn: 'Copper(II) nitrate', nameZh: '硝酸銅', formula: 'Cu(NO₃)₂', name: 'Copper(II) nitrate 硝酸銅 Cu(NO₃)₂', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '強氧化性, 刺激性, 環境危害' },
        { id: 'inv_84', nameEn: 'Lead(II) nitrate', nameZh: '硝酸鉛', formula: 'Pb(NO₃)₂', name: 'Lead(II) nitrate 硝酸鉛 Pb(NO₃)₂', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_85', nameEn: 'Ammonium nitrate', nameZh: '硝酸銨', formula: 'NH₄NO₃', name: 'Ammonium nitrate 硝酸銨 NH₄NO₃', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_86', nameEn: 'Glucose', nameZh: '葡萄糖', formula: 'C₆H₁₂O₆', name: 'Glucose 葡萄糖 C₆H₁₂O₆', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '無' },
        { id: 'inv_87', nameEn: 'Eriochrome Black T', nameZh: '鉻黑T', formula: '—', name: 'Eriochrome Black T 鉻黑T', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '刺激性, 環境危害' },
        { id: 'inv_88', nameEn: 'Ferroin indicator solution', nameZh: '試亞鐵靈溶液', formula: '—', name: 'Ferroin indicator solution 試亞鐵靈溶液', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_89', nameEn: 'Ammonium dihydrogen phosphate', nameZh: '磷酸二氫銨', formula: 'NH₄H₂PO₄', name: 'Ammonium dihydrogen phosphate 磷酸二氫銨 NH₄H₂PO₄', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_90', nameEn: 'Eosin', nameZh: '曙紅', formula: 'C₂₀H₈Br₄O₅', name: 'Eosin 曙紅 C₂₀H₈Br₄O₅', category: '化學藥品', location: '619A 準備室 LC2 - UL 4', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_91', nameEn: 'Silver sulphate', nameZh: '硫酸銀', formula: 'Ag₂SO₄', name: 'Silver sulphate 硫酸銀 Ag₂SO₄', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_92', nameEn: 'Ammonium iron(III) sulphate', nameZh: '硫酸鐵銨', formula: 'NH₄Fe(SO₄)₂', name: 'Ammonium iron(III) sulphate 硫酸鐵銨 NH₄Fe(SO₄)₂', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_93', nameEn: 'EDTA', nameZh: '鈉鹽（乙二胺四乙酸）', formula: 'EDTA', name: 'EDTA 鈉鹽（乙二胺四乙酸）', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '健康危害, 刺激性' },
        { id: 'inv_94', nameEn: 'Potassium hydrogen phthalate (KHP)', nameZh: '鄰苯二甲酸氫鉀', formula: '—', name: 'Potassium hydrogen phthalate (KHP) 鄰苯二甲酸氫鉀', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_95', nameEn: 'Calcium dihydrogen phosphate', nameZh: '磷酸二氫鈣', formula: 'Ca(H₂PO₄)₂', name: 'Calcium dihydrogen phosphate 磷酸二氫鈣 Ca(H₂PO₄)₂', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_96', nameEn: 'Ammonium iron(III) citrate', nameZh: '檸檬酸鐵銨', formula: '—', name: 'Ammonium iron(III) citrate 檸檬酸鐵銨', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_97', nameEn: 'Sodium nitrite', nameZh: '亞硝酸鈉', formula: 'NaNO₂', name: 'Sodium nitrite 亞硝酸鈉 NaNO₂', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_98', nameEn: 'Sodium sulfite', nameZh: '亞硫酸鈉', formula: 'Na₂SO₃', name: 'Sodium sulfite 亞硫酸鈉 Na₂SO₃', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_99', nameEn: 'Sodium acetate', nameZh: '乙酸鈉', formula: 'CH₃COONa', name: 'Sodium acetate 乙酸鈉 CH₃COONa', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: '無' },
        { id: 'inv_100', nameEn: 'Methyl Cellulose (MC)', nameZh: '甲基纖維素', formula: '—', name: 'Methyl Cellulose (MC) 甲基纖維素', category: '化學藥品', location: '619A 準備室 DC - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_101', nameEn: 'Methylene blue', nameZh: '亞甲藍', formula: 'C₁₆H₁₈ClN₃S', name: 'Methylene blue 亞甲藍 C₁₆H₁₈ClN₃S', category: '化學藥品', location: '619A 準備室 LC2 - UL 4', quantity: '—', hazards: '刺激性' },
        { id: 'inv_102', nameEn: 'Calcium carbide', nameZh: '碳化鈣（電石）', formula: 'CaC₂', name: 'Calcium carbide 碳化鈣（電石） CaC₂', category: '化學藥品', location: '619A 準備室 DC - UL 1', quantity: '—', hazards: '遇水釋放易燃氣體, 腐蝕性, 刺激性' },
        { id: 'inv_103', nameEn: '—', nameZh: '藍色硅膠', formula: '—', name: '藍色硅膠', category: '化學藥品', location: '619A 準備室 DC - UL 1', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_104', nameEn: 'Zinc powder', nameZh: '鋅粉', formula: '—', name: 'Zinc powder 鋅粉', category: '化學藥品', location: '619A 準備室 DC - UL 1', quantity: '—', hazards: '環境危害' },
        { id: 'inv_105', nameEn: 'Zinc granular', nameZh: '鋅粒', formula: '—', name: 'Zinc granular 鋅粒', category: '化學藥品', location: '619A 準備室 DC - UL 1', quantity: '—', hazards: '環境危害' },
        { id: 'inv_106', nameEn: 'Magnesium metal turnings', nameZh: '鎂條', formula: 'Mg', name: 'Magnesium metal turnings 鎂條 Mg', category: '化學藥品', location: '619A 準備室 DC - UL 1', quantity: '—', hazards: '易燃固體' },
        { id: 'inv_107', nameEn: 'Sodium', nameZh: '金屬鈉', formula: '—', name: 'Sodium 金屬鈉', category: '化學藥品', location: '619A 準備室 DC - LL 3', quantity: '—', hazards: '遇水釋放易燃氣體, 腐蝕性' },
        { id: 'inv_108', nameEn: 'Potassium', nameZh: '金屬鉀', formula: '—', name: 'Potassium 金屬鉀', category: '化學藥品', location: '619A 準備室 DC - LL 3', quantity: '—', hazards: '遇水釋放易燃氣體, 腐蝕性' },
        { id: 'inv_109', nameEn: 'Iodine', nameZh: '碘粒', formula: '—', name: 'Iodine 碘粒', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '健康危害, 刺激性, 環境危害' },
        { id: 'inv_110', nameEn: 'aluminium chloride hexahydrate', nameZh: '六水合氯化鋁', formula: 'AlCl3.6H2O', name: 'aluminium chloride hexahydrate 六水合氯化鋁 AlCl3.6H2O', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '健康危害, 腐蝕性' },
        { id: 'inv_111', nameEn: 'Magnesium chloride', nameZh: '無水氯化鎂', formula: 'MgCl₂', name: 'Magnesium chloride 無水氯化鎂 MgCl₂', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '無' },
        { id: 'inv_112', nameEn: 'Hydrochloric acid', nameZh: '鹽酸溶液', formula: 'HCl(aq)', name: 'Hydrochloric acid 鹽酸溶液 HCl(aq)', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 4', quantity: '1M', hazards: '腐蝕性' },
        { id: 'inv_113', nameEn: 'Hydrochloric acid', nameZh: '鹽酸溶液', formula: 'HCl(aq)', name: 'Hydrochloric acid 鹽酸溶液 HCl(aq)', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 4', quantity: '37%', hazards: '腐蝕性' },
        { id: 'inv_114', nameEn: 'Methyl violet', nameZh: '甲基紫', formula: 'C₂₅H₃₀ClN₃', name: 'Methyl violet 甲基紫 C₂₅H₃₀ClN₃', category: '化學藥品', location: '619A 準備室 LC2 - UL 4', quantity: '—', hazards: '健康危害, 腐蝕性, 刺激性， 環境危害' },
        { id: 'inv_115', nameEn: 'Ammonium chloride', nameZh: '氯化銨', formula: 'NH₄Cl', name: 'Ammonium chloride 氯化銨 NH₄Cl', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '無' },
        { id: 'inv_116', nameEn: 'Potassium ferricyanide', nameZh: '鐵氰化鉀', formula: 'K₃Fe(CN)₆', name: 'Potassium ferricyanide 鐵氰化鉀 K₃Fe(CN)₆', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '刺激性， 環境危害' },
        { id: 'inv_117', nameEn: 'Calcium chloride', nameZh: '無水氯化鈣', formula: 'CaCl2', name: 'Calcium chloride 無水氯化鈣 CaCl2', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_118', nameEn: 'Phosphorus pentoxide', nameZh: '五氧化二磷', formula: 'P2O5', name: 'Phosphorus pentoxide 五氧化二磷 P2O5', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_119', nameEn: 'Sodium hydroxide', nameZh: '氫氧化鈉', formula: 'NaOH', name: 'Sodium hydroxide 氫氧化鈉 NaOH', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_120', nameEn: 'Calcium hydroxide', nameZh: '氫氧化鈣', formula: 'Ca(OH)₂', name: 'Calcium hydroxide 氫氧化鈣 Ca(OH)₂', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '無' },
        { id: 'inv_121', nameEn: 'Potassium hydroxide', nameZh: '氫氧化鉀', formula: 'KOH', name: 'Potassium hydroxide 氫氧化鉀 KOH', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_122', nameEn: 'Aluminium oxide 90 active neutral', nameZh: '中性氧化鋁', formula: 'Al2O3', name: 'Aluminium oxide 90 active neutral 中性氧化鋁 Al2O3', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_123', nameEn: 'Food grade Alum', nameZh: '食用明礬/硫酸鋁鉀', formula: 'Foodgrade', name: 'Food grade Alum 食用明礬/硫酸鋁鉀 Foodgrade', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_124', nameEn: 'Calcium oxide', nameZh: '氧化鈣', formula: 'CaO', name: 'Calcium oxide 氧化鈣 CaO', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_125', nameEn: 'Luminol', nameZh: '魯米諾', formula: 'C₈H₇N₃O₂', name: 'Luminol 魯米諾 C₈H₇N₃O₂', category: '化學藥品', location: '619A 準備室 LC2 - UL 4', quantity: '—', hazards: '刺激性' },
        { id: 'inv_126', nameEn: 'Ammonium carbonate', nameZh: '碳酸銨', formula: '(NH₄)₂CO₃', name: 'Ammonium carbonate 碳酸銨 (NH₄)₂CO₃', category: '化學藥品', location: '619A 準備室 DC - LL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_127', nameEn: 'Phosphorus (red)', nameZh: '紅磷', formula: '—', name: 'Phosphorus (red) 紅磷', category: '化學藥品', location: '619A 準備室 DC - LL 1', quantity: '—', hazards: '易燃' },
        { id: 'inv_128', nameEn: 'Camphor', nameZh: '合成樟腦', formula: '—', name: 'Camphor 合成樟腦', category: '化學藥品', location: '619A 準備室 DC - LL 1', quantity: '—', hazards: '易燃' },
        { id: 'inv_129', nameEn: '密立根油滴儀 (/; J2438)', nameZh: '密立根油滴儀 (/; J2438)', formula: '—', name: '密立根油滴儀 (/; J2438) 密立根油滴儀 (/; J2438)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_130', nameEn: '托盤天平', nameZh: '托盤天平', formula: '—', name: '托盤天平 托盤天平', category: '物理儀器', location: '物理實驗室', quantity: '（200g/0.2g）', hazards: '無' },
        { id: 'inv_131', nameEn: '立方體組', nameZh: '立方體組', formula: '—', name: '立方體組 立方體組', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_132', nameEn: '銅鐵鋁木', nameZh: '銅鐵鋁木', formula: '—', name: '銅鐵鋁木 銅鐵鋁木', category: '物理儀器', location: '物理實驗室', quantity: '200g砝碼', hazards: '無' },
        { id: 'inv_133', nameEn: '直流電壓錶（伏特計）', nameZh: '直流電壓錶（伏特計）', formula: '—', name: '直流電壓錶（伏特計） 直流電壓錶（伏特計）', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_134', nameEn: '可調內阻電池 (2373)', nameZh: '可調內阻電池 (2373)', formula: '—', name: '可調內阻電池 (2373) 可調內阻電池 (2373)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_135', nameEn: '小型電動機模型', nameZh: '小型電動機模型', formula: '—', name: '小型電動機模型 小型電動機模型', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_136', nameEn: 'Phenolphthalein solution', nameZh: '酚酞溶液', formula: 'C₂₀H₁₄O₄(aq)', name: 'Phenolphthalein solution 酚酞溶液 C₂₀H₁₄O₄(aq)', category: '化學藥品', location: '619A 準備室 LC2 - UL 3', quantity: '—', hazards: '劇毒, 環境危害' },
        { id: 'inv_137', nameEn: '萬用電錶（學生型） (J4011)', nameZh: '萬用電錶（學生型） (J4011)', formula: '—', name: '萬用電錶（學生型） (J4011) 萬用電錶（學生型） (J4011)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_138', nameEn: '陰極射線演示儀', nameZh: '陰極射線演示儀', formula: '—', name: '陰極射線演示儀 陰極射線演示儀', category: '物理儀器', location: '物理實驗室', quantity: '（磁偏轉）', hazards: '無' },
        { id: 'inv_139', nameEn: '電子感應圈(尖端放電)', nameZh: '電子感應圈(尖端放電)', formula: '—', name: '電子感應圈(尖端放電) 電子感應圈(尖端放電)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_140', nameEn: '多種氣體放電管', nameZh: '多種氣體放電管', formula: '—', name: '多種氣體放電管 多種氣體放電管', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_141', nameEn: '氫氦氮', nameZh: '氫氦氮', formula: '—', name: '氫氦氮 氫氦氮', category: '物理儀器', location: '物理實驗室', quantity: '(6種元素)', hazards: '無' },
        { id: 'inv_142', nameEn: '氬氪汞', nameZh: '氬氪汞', formula: '—', name: '氬氪汞 氬氪汞', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_143', nameEn: '逆變電源 (J1211)', nameZh: '逆變電源 (J1211)', formula: '—', name: '逆變電源 (J1211) 逆變電源 (J1211)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_144', nameEn: '高頻信號發生器 (J2463)', nameZh: '高頻信號發生器 (J2463)', formula: '—', name: '高頻信號發生器 (J2463) 高頻信號發生器 (J2463)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_145', nameEn: '高壓電安全絕緣手套', nameZh: '高壓電安全絕緣手套', formula: '—', name: '高壓電安全絕緣手套 高壓電安全絕緣手套', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_146', nameEn: '正負電荷檢驗器', nameZh: '正負電荷檢驗器', formula: '—', name: '正負電荷檢驗器 正負電荷檢驗器', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_147', nameEn: 'Litmus', nameZh: '石蕊', formula: '(indicator)', name: 'Litmus 石蕊 (indicator)', category: '化學藥品', location: '619A 準備室 LC2 - UL 3', quantity: '—', hazards: '無' },
        { id: 'inv_148', nameEn: '電子節拍器 (J0206)', nameZh: '電子節拍器 (J0206)', formula: '—', name: '電子節拍器 (J0206) 電子節拍器 (J0206)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_149', nameEn: '教學訊號發生器 (J2464)', nameZh: '教學訊號發生器 (J2464)', formula: '—', name: '教學訊號發生器 (J2464) 教學訊號發生器 (J2464)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_150', nameEn: '無線電波發送和接收儀', nameZh: '無線電波發送和接收儀', formula: '—', name: '無線電波發送和接收儀 無線電波發送和接收儀', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_151', nameEn: '數字掃描儀 (J2469)', nameZh: '數字掃描儀 (J2469)', formula: '—', name: '數字掃描儀 (J2469) 數字掃描儀 (J2469)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_152', nameEn: '萬用電錶 (J0411)', nameZh: '萬用電錶 (J0411)', formula: '—', name: '萬用電錶 (J0411) 萬用電錶 (J0411)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_153', nameEn: '交流毫安錶', nameZh: '交流毫安錶', formula: '—', name: '交流毫安錶 交流毫安錶', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_154', nameEn: '直流微安錶', nameZh: '直流微安錶', formula: '—', name: '直流微安錶 直流微安錶', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_155', nameEn: '直流毫安錶', nameZh: '直流毫安錶', formula: '—', name: '直流毫安錶 直流毫安錶', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_156', nameEn: '光電效應演示器 (須接電以放大)', nameZh: '光電效應演示器 (須接電以放大)', formula: '—', name: '光電效應演示器 (須接電以放大) 光電效應演示器 (須接電以放大)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_157', nameEn: '銅電化學當量實驗器', nameZh: '銅電化學當量實驗器', formula: '—', name: '銅電化學當量實驗器 銅電化學當量實驗器', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_158', nameEn: 'Fuchsine', nameZh: '品紅', formula: 'Basic', name: 'Fuchsine 品紅 Basic', category: '化學藥品', location: '619A 準備室 LC2 - UL 3', quantity: '—', hazards: '健康危害' },
        { id: 'inv_159', nameEn: '低頻信號發生器 (J2462)', nameZh: '低頻信號發生器 (J2462)', formula: '—', name: '低頻信號發生器 (J2462) 低頻信號發生器 (J2462)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_160', nameEn: '洛倫茲力演示器 (J2433)', nameZh: '洛倫茲力演示器 (J2433)', formula: '—', name: '洛倫茲力演示器 (J2433) 洛倫茲力演示器 (J2433)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_161', nameEn: '驗電器 (功能不全)', nameZh: '驗電器 (功能不全)', formula: '—', name: '驗電器 (功能不全) 驗電器 (功能不全)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_162', nameEn: '初中物理電學元件盒', nameZh: '初中物理電學元件盒', formula: '—', name: '初中物理電學元件盒 初中物理電學元件盒', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_163', nameEn: '晶體管特性演示儀 (24261)', nameZh: '晶體管特性演示儀 (24261)', formula: '—', name: '晶體管特性演示儀 (24261) 晶體管特性演示儀 (24261)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_164', nameEn: '蓋革計數器 (J2554)', nameZh: '蓋革計數器 (J2554)', formula: '—', name: '蓋革計數器 (J2554) 蓋革計數器 (J2554)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_165', nameEn: '可拆變壓器 (2423)', nameZh: '可拆變壓器 (2423)', formula: '—', name: '可拆變壓器 (2423) 可拆變壓器 (2423)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_166', nameEn: '電化學效應', nameZh: '電化學效應', formula: '—', name: '電化學效應 電化學效應', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_167', nameEn: '接觸型調壓器', nameZh: '接觸型調壓器', formula: '—', name: '接觸型調壓器 接觸型調壓器', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_168', nameEn: '學生電源 (1202)', nameZh: '學生電源 (1202)', formula: '—', name: '學生電源 (1202) 學生電源 (1202)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_169', nameEn: 'Sodium hydroxide solution', nameZh: '氫氧化鈉溶液', formula: 'NaOH(aq)', name: 'Sodium hydroxide solution 氫氧化鈉溶液 NaOH(aq)', category: '化學藥品', location: '619A 準備室 LC2 - UL 2', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_170', nameEn: '電火花打點計時器 (1207)', nameZh: '電火花打點計時器 (1207)', formula: '—', name: '電火花打點計時器 (1207) 電火花打點計時器 (1207)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_171', nameEn: '配套紙卷', nameZh: '配套紙卷', formula: '—', name: '配套紙卷 配套紙卷', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_172', nameEn: '學生天平', nameZh: '學生天平', formula: '—', name: '學生天平 學生天平', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_173', nameEn: '手搖發電機 (J2417,)', nameZh: '手搖發電機 (J2417,)', formula: '—', name: '手搖發電機 (J2417,) 手搖發電機 (J2417,)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_174', nameEn: '受迫共振實驗器 (22026; 共6個,P22C)', nameZh: '受迫共振實驗器 (22026; 共6個,P22C)', formula: '—', name: '受迫共振實驗器 (22026; 共6個,P22C) 受迫共振實驗器 (22026; 共6個,P22C)', category: '物理儀器', location: '物理實驗室 P22C', quantity: '1', hazards: '無' },
        { id: 'inv_175', nameEn: '螺旋測微器', nameZh: '螺旋測微器', formula: '—', name: '螺旋測微器 螺旋測微器', category: '物理儀器', location: '物理實驗室', quantity: '（25mm/0.01mm）', hazards: '無' },
        { id: 'inv_176', nameEn: '游標卡尺', nameZh: '游標卡尺', formula: '—', name: '游標卡尺 游標卡尺', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_177', nameEn: '三角尺', nameZh: '三角尺', formula: '—', name: '三角尺 三角尺', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_178', nameEn: '量角器', nameZh: '量角器', formula: '—', name: '量角器 量角器', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_179', nameEn: '微小壓強計', nameZh: '微小壓強計', formula: '—', name: '微小壓強計 微小壓強計', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_180', nameEn: 'Ammonia 25', nameZh: '氨水 25', formula: 'NH₄OH 25', name: 'Ammonia 25 氨水 25 NH₄OH 25', category: '化學藥品', location: '619A 準備室 LC2 - UL 2', quantity: '25%', hazards: '腐蝕性, 刺激性, 環境危害' },
        { id: 'inv_181', nameEn: '絲綢與玻璃棒', nameZh: '絲綢與玻璃棒', formula: '—', name: '絲綢與玻璃棒 絲綢與玻璃棒', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_182', nameEn: '毛皮與橡膠棒', nameZh: '毛皮與橡膠棒', formula: '—', name: '毛皮與橡膠棒 毛皮與橡膠棒', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_183', nameEn: '力矩平衡尺', nameZh: '力矩平衡尺', formula: '—', name: '力矩平衡尺 力矩平衡尺', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_184', nameEn: '鈎碼 (2106)', nameZh: '鈎碼 (2106)', formula: '—', name: '鈎碼 (2106) 鈎碼 (2106)', category: '物理儀器', location: '物理實驗室', quantity: '（50g）', hazards: '無' },
        { id: 'inv_185', nameEn: '天平砝碼', nameZh: '天平砝碼', formula: '—', name: '天平砝碼 天平砝碼', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_186', nameEn: '單擺球組 (J2206)', nameZh: '單擺球組 (J2206)', formula: '—', name: '單擺球組 (J2206) 單擺球組 (J2206)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_187', nameEn: '針筒', nameZh: '針筒', formula: '—', name: '針筒 針筒', category: '物理儀器', location: '物理實驗室', quantity: '100mL', hazards: '無' },
        { id: 'inv_188', nameEn: '放大鏡,光具座的凸透鏡', nameZh: '放大鏡,光具座的凸透鏡', formula: '—', name: '放大鏡,光具座的凸透鏡 放大鏡,光具座的凸透鏡', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_189', nameEn: '靜電實驗盒', nameZh: '靜電實驗盒', formula: '—', name: '靜電實驗盒 靜電實驗盒', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_190', nameEn: '筒式電阻箱 (J2362,部分存於P22-E3)', nameZh: '筒式電阻箱 (J2362,部分存於P22-E3)', formula: '—', name: '筒式電阻箱 (J2362,部分存於P22-E3) 筒式電阻箱 (J2362,部分存於P22-E3)', category: '物理儀器', location: '物理實驗室 P22-E3', quantity: '1', hazards: '無' },
        { id: 'inv_191', nameEn: '氫氧化鈉NaOH', nameZh: '氫氧化鈉NaOH', formula: 'NaOH', name: '氫氧化鈉NaOH 氫氧化鈉NaOH', category: '化學藥品', location: '619A 準備室 LC2 - UL 1', quantity: '1M', hazards: '腐蝕性' },
        { id: 'inv_192', nameEn: '光具座', nameZh: '光具座', formula: '—', name: '光具座 光具座', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_193', nameEn: '光具座實驗盒', nameZh: '光具座實驗盒', formula: '—', name: '光具座實驗盒 光具座實驗盒', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_194', nameEn: '電阻圈 (J2358)', nameZh: '電阻圈 (J2358)', formula: '—', name: '電阻圈 (J2358) 電阻圈 (J2358)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_195', nameEn: '光具座及配套實驗盒', nameZh: '光具座及配套實驗盒', formula: '—', name: '光具座及配套實驗盒 光具座及配套實驗盒', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_196', nameEn: '自感現象演示儀 (J2446)', nameZh: '自感現象演示儀 (J2446)', formula: '—', name: '自感現象演示儀 (J2446) 自感現象演示儀 (J2446)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_197', nameEn: '向心力實驗盒 (J2132)', nameZh: '向心力實驗盒 (J2132)', formula: '—', name: '向心力實驗盒 (J2132) 向心力實驗盒 (J2132)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_198', nameEn: '電磁振蕩演示器 (J2434)', nameZh: '電磁振蕩演示器 (J2434)', formula: '—', name: '電磁振蕩演示器 (J2434) 電磁振蕩演示器 (J2434)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_199', nameEn: '電磁打點器 (J0203)', nameZh: '電磁打點器 (J0203)', formula: '—', name: '電磁打點器 (J0203) 電磁打點器 (J0203)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_200', nameEn: '液體內部壓強計 (J2113)', nameZh: '液體內部壓強計 (J2113)', formula: '—', name: '液體內部壓強計 (J2113) 液體內部壓強計 (J2113)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_201', nameEn: '水輪機模型 (J2168)', nameZh: '水輪機模型 (J2168)', formula: '—', name: '水輪機模型 (J2168) 水輪機模型 (J2168)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_202', nameEn: 'Sodium hydroxide solution', nameZh: '氫氧化鈉溶液', formula: 'NaOH(aq)', name: 'Sodium hydroxide solution 氫氧化鈉溶液 NaOH(aq)', category: '化學藥品', location: '619A 準備室 LC2 - UL 1', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_203', nameEn: '家庭電路示教板', nameZh: '家庭電路示教板', formula: '—', name: '家庭電路示教板 家庭電路示教板', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_204', nameEn: '滑輪組 (還有大量無包裝的滑輪)', nameZh: '滑輪組 (還有大量無包裝的滑輪)', formula: '—', name: '滑輪組 (還有大量無包裝的滑輪) 滑輪組 (還有大量無包裝的滑輪)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_205', nameEn: '三棱鏡', nameZh: '三棱鏡', formula: '—', name: '三棱鏡 三棱鏡', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_206', nameEn: '壓力壓強實驗組 (J21021)', nameZh: '壓力壓強實驗組 (J21021)', formula: '—', name: '壓力壓強實驗組 (J21021) 壓力壓強實驗組 (J21021)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_207', nameEn: '液體對器壁壓強演示器 (J2141)', nameZh: '液體對器壁壓強演示器 (J2141)', formula: '—', name: '液體對器壁壓強演示器 (J2141) 液體對器壁壓強演示器 (J2141)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_208', nameEn: '圓盤測力計 (J2105)', nameZh: '圓盤測力計 (J2105)', formula: '—', name: '圓盤測力計 (J2105) 圓盤測力計 (J2105)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_209', nameEn: '電子雲模型演示儀 (30027)', nameZh: '電子雲模型演示儀 (30027)', formula: '—', name: '電子雲模型演示儀 (30027) 電子雲模型演示儀 (30027)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_210', nameEn: '紫外光演示儀 (20024)', nameZh: '紫外光演示儀 (20024)', formula: '—', name: '紫外光演示儀 (20024) 紫外光演示儀 (20024)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_211', nameEn: '碰撞實驗盒 (J2135)', nameZh: '碰撞實驗盒 (J2135)', formula: '—', name: '碰撞實驗盒 (J2135) 碰撞實驗盒 (J2135)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_212', nameEn: '電磁打點計時器 (1203)', nameZh: '電磁打點計時器 (1203)', formula: '—', name: '電磁打點計時器 (1203) 電磁打點計時器 (1203)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_213', nameEn: 'Ammonia solution', nameZh: '氨水', formula: 'NH₄OH', name: 'Ammonia solution 氨水 NH₄OH', category: '液體強酸強鹼', location: '619A 準備室 LC2 - UL 1', quantity: '稀釋濃度', hazards: '腐蝕性, 環境危害' },
        { id: 'inv_214', nameEn: '紅外線演示儀 (J2525)', nameZh: '紅外線演示儀 (J2525)', formula: '—', name: '紅外線演示儀 (J2525) 紅外線演示儀 (J2525)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_215', nameEn: '摩擦力演示彈簧稱', nameZh: '摩擦力演示彈簧稱', formula: '—', name: '摩擦力演示彈簧稱 摩擦力演示彈簧稱', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_216', nameEn: '初中力學實驗盒 (J2172)', nameZh: '初中力學實驗盒 (J2172)', formula: '—', name: '初中力學實驗盒 (J2172) 初中力學實驗盒 (J2172)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_217', nameEn: '高中線路實驗盒 (J2367,部分放於P24-E2)', nameZh: '高中線路實驗盒 (J2367,部分放於P24-E2)', formula: '—', name: '高中線路實驗盒 (J2367,部分放於P24-E2) 高中線路實驗盒 (J2367,部分放於P24-E2)', category: '物理儀器', location: '物理實驗室 P24-E2', quantity: '1', hazards: '無' },
        { id: 'inv_218', nameEn: '三線電子開關 (J2470)', nameZh: '三線電子開關 (J2470)', formula: '—', name: '三線電子開關 (J2470) 三線電子開關 (J2470)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_219', nameEn: '馬德堡半球（大）', nameZh: '馬德堡半球（大）', formula: '—', name: '馬德堡半球（大） 馬德堡半球（大）', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_220', nameEn: '空氣對流演示儀', nameZh: '空氣對流演示儀', formula: '—', name: '空氣對流演示儀 空氣對流演示儀', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_221', nameEn: '電話原理說明演示器 (J2429)', nameZh: '電話原理說明演示器 (J2429)', formula: '—', name: '電話原理說明演示器 (J2429) 電話原理說明演示器 (J2429)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_222', nameEn: '離心機械模型', nameZh: '離心機械模型', formula: '—', name: '離心機械模型 離心機械模型', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_223', nameEn: '學生信號源 (J2465)', nameZh: '學生信號源 (J2465)', formula: '—', name: '學生信號源 (J2465) 學生信號源 (J2465)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_224', nameEn: 'Sulfuric acid solution', nameZh: '硫酸溶液', formula: 'H₂SO₄(aq)', name: 'Sulfuric acid solution 硫酸溶液 H₂SO₄(aq)', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 3', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_225', nameEn: 'Ammonia solution', nameZh: '氨水', formula: 'NH₄OH', name: 'Ammonia solution 氨水 NH₄OH', category: '化學藥品', location: '619A 準備室 LC2 - UL 1', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_226', nameEn: '氣體定律演示器', nameZh: '氣體定律演示器', formula: '—', name: '氣體定律演示器 氣體定律演示器', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_227', nameEn: '縱波演示器', nameZh: '縱波演示器', formula: '—', name: '縱波演示器 縱波演示器', category: '物理儀器', location: '物理實驗室', quantity: '(鐵圈)', hazards: '無' },
        { id: 'inv_228', nameEn: '拔線電工夾', nameZh: '拔線電工夾', formula: '—', name: '拔線電工夾 拔線電工夾', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_229', nameEn: '電子測力計', nameZh: '電子測力計', formula: '—', name: '電子測力計 電子測力計', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_230', nameEn: '柴油機模型 (J2255)', nameZh: '柴油機模型 (J2255)', formula: '—', name: '柴油機模型 (J2255) 柴油機模型 (J2255)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_231', nameEn: '平拋運動演示儀 (2154)', nameZh: '平拋運動演示儀 (2154)', formula: '—', name: '平拋運動演示儀 (2154) 平拋運動演示儀 (2154)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_232', nameEn: '音叉', nameZh: '音叉', formula: '—', name: '音叉 音叉', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_233', nameEn: '望遠鏡', nameZh: '望遠鏡', formula: '—', name: '望遠鏡 望遠鏡', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_234', nameEn: '阿基米德原理演示器 (J2118)', nameZh: '阿基米德原理演示器 (J2118)', formula: '—', name: '阿基米德原理演示器 (J2118) 阿基米德原理演示器 (J2118)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_235', nameEn: '連通器 (J2140)', nameZh: '連通器 (J2140)', formula: '—', name: '連通器 (J2140) 連通器 (J2140)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_236', nameEn: 'Potassium thiocyanate', nameZh: '硫氰酸鉀', formula: 'KSCN', name: 'Potassium thiocyanate 硫氰酸鉀 KSCN', category: '化學藥品', location: '619A 準備室 LC2 - LL 1', quantity: '3.5M', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_237', nameEn: '空氣壓縮引火儀 (22203)', nameZh: '空氣壓縮引火儀 (22203)', formula: '—', name: '空氣壓縮引火儀 (22203) 空氣壓縮引火儀 (22203)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_238', nameEn: '空盒氣壓計', nameZh: '空盒氣壓計', formula: '—', name: '空盒氣壓計 空盒氣壓計', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_239', nameEn: '單相電子式電能表', nameZh: '單相電子式電能表', formula: '—', name: '單相電子式電能表 單相電子式電能表', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_240', nameEn: '收音機', nameZh: '收音機', formula: '—', name: '收音機 收音機', category: '物理儀器', location: '物理實驗室', quantity: 'KK-F62', hazards: '無' },
        { id: 'inv_241', nameEn: '馬德堡半球 (J2115)', nameZh: '馬德堡半球 (J2115)', formula: '—', name: '馬德堡半球 (J2115) 馬德堡半球 (J2115)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_242', nameEn: '慣性演示器 (J2148)', nameZh: '慣性演示器 (J2148)', formula: '—', name: '慣性演示器 (J2148) 慣性演示器 (J2148)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_243', nameEn: '機械秒錶', nameZh: '機械秒錶', formula: '—', name: '機械秒錶 機械秒錶', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_244', nameEn: '萬向輪', nameZh: '萬向輪', formula: '—', name: '萬向輪 萬向輪', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_245', nameEn: '塑料球,乒乓球,木球', nameZh: '塑料球,乒乓球,木球', formula: '—', name: '塑料球,乒乓球,木球 塑料球,乒乓球,木球', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_246', nameEn: '粉篩 (用於油酸分子直徑測量)', nameZh: '粉篩 (用於油酸分子直徑測量)', formula: '—', name: '粉篩 (用於油酸分子直徑測量) 粉篩 (用於油酸分子直徑測量)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_247', nameEn: 'Potassium thiocyanate', nameZh: '硫氰酸鉀', formula: 'KSCN', name: 'Potassium thiocyanate 硫氰酸鉀 KSCN', category: '化學藥品', location: '619A 準備室 LC2 - LL 1', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_248', nameEn: '爽身粉 (用於油酸分子直徑測量)', nameZh: '爽身粉 (用於油酸分子直徑測量)', formula: '—', name: '爽身粉 (用於油酸分子直徑測量) 爽身粉 (用於油酸分子直徑測量)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_249', nameEn: '水龍頭', nameZh: '水龍頭', formula: '—', name: '水龍頭 水龍頭', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_250', nameEn: '科學水火箭比賽用品', nameZh: '科學水火箭比賽用品', formula: '—', name: '科學水火箭比賽用品 科學水火箭比賽用品', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_251', nameEn: '串聯電路木板 (含燈泡和單刀開關)', nameZh: '串聯電路木板 (含燈泡和單刀開關)', formula: '—', name: '串聯電路木板 (含燈泡和單刀開關) 串聯電路木板 (含燈泡和單刀開關)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_252', nameEn: '圓柱體組', nameZh: '圓柱體組', formula: '—', name: '圓柱體組 圓柱體組', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_253', nameEn: '銅,鐵,鋁', nameZh: '銅,鐵,鋁', formula: '—', name: '銅,鐵,鋁 銅,鐵,鋁', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_254', nameEn: '鈎碼（10g） (J2106)', nameZh: '鈎碼（10g） (J2106)', formula: '—', name: '鈎碼（10g） (J2106) 鈎碼（10g） (J2106)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_255', nameEn: '溫度計（紅水，100℃）', nameZh: '溫度計（紅水，100℃）', formula: '—', name: '溫度計（紅水，100℃） 溫度計（紅水，100℃）', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_256', nameEn: '銅線線紮', nameZh: '銅線線紮', formula: '—', name: '銅線線紮 銅線線紮', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_257', nameEn: '幼線紮', nameZh: '幼線紮', formula: '—', name: '幼線紮 幼線紮', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_258', nameEn: 'Hydrogen peroxide 30', nameZh: '過氧化氫 / 雙氧水', formula: 'H₂O₂', name: 'Hydrogen peroxide 30 過氧化氫 / 雙氧水 H₂O₂', category: '化學藥品', location: '619A 準備室 LC3 - UL 4', quantity: '30%', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_259', nameEn: '吸管', nameZh: '吸管', formula: '—', name: '吸管 吸管', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_260', nameEn: '摩擦力演示器 (J2175)', nameZh: '摩擦力演示器 (J2175)', formula: '—', name: '摩擦力演示器 (J2175) 摩擦力演示器 (J2175)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_261', nameEn: '光的折射反射演示器', nameZh: '光的折射反射演示器', formula: '—', name: '光的折射反射演示器 光的折射反射演示器', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_262', nameEn: '三線光譜', nameZh: '三線光譜', formula: '—', name: '三線光譜 三線光譜', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_263', nameEn: '發波水槽 (盆式)', nameZh: '發波水槽 (盆式)', formula: '—', name: '發波水槽 (盆式) 發波水槽 (盆式)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_264', nameEn: '海綿百潔布 (用於演示壓強原理)', nameZh: '海綿百潔布 (用於演示壓強原理)', formula: '—', name: '海綿百潔布 (用於演示壓強原理) 海綿百潔布 (用於演示壓強原理)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_265', nameEn: '壓強演示枱模型 (用於演示壓強原理)', nameZh: '壓強演示枱模型 (用於演示壓強原理)', formula: '—', name: '壓強演示枱模型 (用於演示壓強原理) 壓強演示枱模型 (用於演示壓強原理)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_266', nameEn: '銅圈彈簧 (稍粗)', nameZh: '銅圈彈簧 (稍粗)', formula: '—', name: '銅圈彈簧 (稍粗) 銅圈彈簧 (稍粗)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_267', nameEn: '鈎碼（100g） (每盒5只)', nameZh: '鈎碼（100g） (每盒5只)', formula: '—', name: '鈎碼（100g） (每盒5只) 鈎碼（100g） (每盒5只)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_268', nameEn: '砝碼500g', nameZh: '砝碼500g', formula: '—', name: '砝碼500g 砝碼500g', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_269', nameEn: 'Hydrogen peroxide', nameZh: '過氧化氫', formula: 'H₂O₂', name: 'Hydrogen peroxide 過氧化氫 H₂O₂', category: '化學藥品', location: '619A 準備室 LC3 - UL 4', quantity: '3%', hazards: '無' },
        { id: 'inv_270', nameEn: '小車路軌', nameZh: '小車路軌', formula: '—', name: '小車路軌 小車路軌', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_271', nameEn: '波子一盒', nameZh: '波子一盒', formula: '—', name: '波子一盒 波子一盒', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_272', nameEn: '砝碼', nameZh: '砝碼', formula: '—', name: '砝碼 砝碼', category: '物理儀器', location: '物理實驗室', quantity: '100g,200g', hazards: '無' },
        { id: 'inv_273', nameEn: '電子比荷實驗儀 (/; J24065)', nameZh: '電子比荷實驗儀 (/; J24065)', formula: '—', name: '電子比荷實驗儀 (/; J24065) 電子比荷實驗儀 (/; J24065)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_274', nameEn: '可變電阻器', nameZh: '可變電阻器', formula: '—', name: '可變電阻器 可變電阻器', category: '物理儀器', location: '物理實驗室', quantity: '5Ω,3A', hazards: '無' },
        { id: 'inv_275', nameEn: '牛頓管 (/; J2153)', nameZh: '牛頓管 (/; J2153)', formula: '—', name: '牛頓管 (/; J2153) 牛頓管 (/; J2153)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_276', nameEn: '鋁管 (/; 用於楞次定則演示)', nameZh: '鋁管 (/; 用於楞次定則演示)', formula: '—', name: '鋁管 (/; 用於楞次定則演示) 鋁管 (/; 用於楞次定則演示)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_277', nameEn: '膠管 (/; 用於楞次定則演示)', nameZh: '膠管 (/; 用於楞次定則演示)', formula: '—', name: '膠管 (/; 用於楞次定則演示) 膠管 (/; 用於楞次定則演示)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_278', nameEn: '演示電池繼電器 (J2313)', nameZh: '演示電池繼電器 (J2313)', formula: '—', name: '演示電池繼電器 (J2313) 演示電池繼電器 (J2313)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_279', nameEn: '凸透鏡', nameZh: '凸透鏡', formula: '—', name: '凸透鏡 凸透鏡', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_280', nameEn: 'Potassium permanganate solution', nameZh: '高錳酸鉀溶液', formula: 'KMnO₄(aq)', name: 'Potassium permanganate solution 高錳酸鉀溶液 KMnO₄(aq)', category: '化學藥品', location: '619A 準備室 LC3 - UL 3', quantity: '—', hazards: '強氧化性, 刺激性' },
        { id: 'inv_281', nameEn: '凹透鏡', nameZh: '凹透鏡', formula: '—', name: '凹透鏡 凹透鏡', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_282', nameEn: '電磁鐵實驗組 (J2439)', nameZh: '電磁鐵實驗組 (J2439)', formula: '—', name: '電磁鐵實驗組 (J2439) 電磁鐵實驗組 (J2439)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_283', nameEn: '原付線圈 (小; J2410)', nameZh: '原付線圈 (小; J2410)', formula: '—', name: '原付線圈 (小; J2410) 原付線圈 (小; J2410)', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_284', nameEn: '玻璃磚', nameZh: '玻璃磚', formula: '—', name: '玻璃磚 玻璃磚', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_285', nameEn: '手持式分光鏡', nameZh: '手持式分光鏡', formula: '—', name: '手持式分光鏡 手持式分光鏡', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_286', nameEn: '木磚塊', nameZh: '木磚塊', formula: '—', name: '木磚塊 木磚塊', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_287', nameEn: '木板', nameZh: '木板', formula: '—', name: '木板 木板', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_288', nameEn: '單刀開關', nameZh: '單刀開關', formula: '—', name: '單刀開關 單刀開關', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_289', nameEn: '自由落體實驗儀', nameZh: '自由落體實驗儀', formula: '—', name: '自由落體實驗儀 自由落體實驗儀', category: '物理儀器', location: '物理實驗室', quantity: '1', hazards: '無' },
        { id: 'inv_290', nameEn: 'Iodine solution', nameZh: '碘溶液', formula: 'I₂(aq)', name: 'Iodine solution 碘溶液 I₂(aq)', category: '化學藥品', location: '619A 準備室 LC3 - UL 2', quantity: '0.1M', hazards: '健康危害， 刺激性' },
        { id: 'inv_291', nameEn: 'Calcium hydroxide/ Limewater', nameZh: '氫氧化鈣/ 石灰水', formula: 'Ca(OH)₂(aq)', name: 'Calcium hydroxide/ Limewater 氫氧化鈣/ 石灰水 Ca(OH)₂(aq)', category: '化學藥品', location: '619A 準備室 LC3 - UL 2', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_292', nameEn: 'Iodine solution', nameZh: '碘溶液', formula: 'I₂(aq)', name: 'Iodine solution 碘溶液 I₂(aq)', category: '化學藥品', location: '619A 準備室 LC3 - UL 1', quantity: '稀釋濃度', hazards: '無' },
        { id: 'inv_293', nameEn: 'Limewater', nameZh: '石灰水', formula: 'Ca(OH)₂(aq)', name: 'Limewater 石灰水 Ca(OH)₂(aq)', category: '化學藥品', location: '619A 準備室 LC3 - UL 1', quantity: '—', hazards: '無' },
        { id: 'inv_294', nameEn: 'Hydrochloric acid solution', nameZh: '鹽酸溶液', formula: 'HCl(aq)', name: 'Hydrochloric acid solution 鹽酸溶液 HCl(aq)', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 3', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_295', nameEn: 'Ethanol', nameZh: '乙醇', formula: 'C₂H₅OH', name: 'Ethanol 乙醇 C₂H₅OH', category: '化學藥品', location: '619A 準備室 LC3 - LL 2', quantity: '95% / 99%', hazards: '高度易燃, 刺激性' },
        { id: 'inv_296', nameEn: 'Ethanol', nameZh: '乙醇', formula: 'C₂H₅OH', name: 'Ethanol 乙醇 C₂H₅OH', category: '化學藥品', location: '619A 準備室 LC3 - LL 1', quantity: '75%/ 95% / 99%', hazards: '高度易燃, 刺激性' },
        { id: 'inv_297', nameEn: 'Methanol', nameZh: '甲醇', formula: 'CH₃OH', name: 'Methanol 甲醇 CH₃OH', category: '化學藥品', location: '619A 準備室 LC3 - LL 1', quantity: '—', hazards: '高度易燃, 劇毒, 健康危害' },
        { id: 'inv_298', nameEn: 'n-Butanol', nameZh: '正丁醇', formula: 'C4H9OH', name: 'n-Butanol 正丁醇 C4H9OH', category: '化學藥品', location: '619A 準備室 LC3 - LL 1', quantity: '—', hazards: '高度易燃, 劇毒, 刺激性' },
        { id: 'inv_299', nameEn: 'Amyl Alcohol', nameZh: '異戊醇', formula: 'C5H11OH', name: 'Amyl Alcohol 異戊醇 C5H11OH', category: '化學藥品', location: '619A 準備室 LC3 - LL 1', quantity: '—', hazards: '高度易燃, 腐蝕性, 刺激性' },
        { id: 'inv_300', nameEn: 'Acetone', nameZh: '丙酮', formula: 'C₃H₆O', name: 'Acetone 丙酮 C₃H₆O', category: '化學藥品', location: '619A 準備室 LC3 - LL 1', quantity: '—', hazards: '高度易燃, 刺激性' },
        { id: 'inv_301', nameEn: 'Glycerol', nameZh: '甘油', formula: 'C₃H₈O₃', name: 'Glycerol 甘油 C₃H₈O₃', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_302', nameEn: 'Diethyl ether', nameZh: '乙醚', formula: '(C₂H₅)₂O', name: 'Diethyl ether 乙醚 (C₂H₅)₂O', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 3', quantity: '—', hazards: '高度易燃, 刺激性' },
        { id: 'inv_303', nameEn: 'Ethyl acetate', nameZh: '乙酸乙酯', formula: 'CH₃COOC₂H₅', name: 'Ethyl acetate 乙酸乙酯 CH₃COOC₂H₅', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 3', quantity: '—', hazards: '易燃, 刺激性' },
        { id: 'inv_304', nameEn: 'Formaldehyde 36-38', nameZh: '甲醛 36-38', formula: 'HCHO', name: 'Formaldehyde 36-38 甲醛 36-38 HCHO', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 3', quantity: '—', hazards: '高度易燃, 有毒, 健康危害, 腐蝕性' },
        { id: 'inv_305', nameEn: 'Sulfuric acid solution', nameZh: '硫酸溶液', formula: 'H₂SO₄(aq)', name: 'Sulfuric acid solution 硫酸溶液 H₂SO₄(aq)', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 2', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_306', nameEn: 'Kerosene', nameZh: '煤油', formula: 'Kerosene', name: 'Kerosene 煤油', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 3', quantity: '—', hazards: '高度易燃, 健康危害, 刺激性' },
        { id: 'inv_307', nameEn: 'Castor oil', nameZh: '篦麻油', formula: 'Castor', name: 'Castor oil 篦麻油', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_308', nameEn: 'Paraffin Liquid', nameZh: '液體石蠟', formula: 'Paraffin', name: 'Paraffin Liquid 液體石蠟', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 2', quantity: '—', hazards: '健康危害' },
        { id: 'inv_309', nameEn: 'Hexane', nameZh: '己烷', formula: 'C₆H₁₄', name: 'Hexane 己烷 C₆H₁₄', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 2', quantity: '—', hazards: '高度易燃, 健康危害, 刺激性, 環境危害' },
        { id: 'inv_310', nameEn: 'Acetaldehyde', nameZh: '乙醛', formula: 'CH₃CHO', name: 'Acetaldehyde 乙醛 CH₃CHO', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 2', quantity: '—', hazards: '高度易燃, 健康危害, 刺激性' },
        { id: 'inv_311', nameEn: 'Xylene', nameZh: '二甲苯', formula: '—', name: 'Xylene 二甲苯', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 1', quantity: '—', hazards: '高度易燃, 健康危害, 刺激性' },
        { id: 'inv_312', nameEn: 'Petroleum ether', nameZh: '石油醚', formula: '(mixture)', name: 'Petroleum ether 石油醚 (mixture)', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 1', quantity: '—', hazards: '高度易燃, 健康危害, 刺激性, 環境危害' },
        { id: 'inv_313', nameEn: 'Chloroform', nameZh: '氯仿', formula: 'CHCl₃', name: 'Chloroform 氯仿 CHCl₃', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 1', quantity: '—', hazards: '劇毒, 健康危害' },
        { id: 'inv_314', nameEn: '1,2-Dichloroethane', nameZh: '二氯乙烷', formula: 'C₂H₄Cl₂', name: '1,2-Dichloroethane 二氯乙烷 C₂H₄Cl₂', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 1', quantity: '—', hazards: '高度易燃, 劇毒, 健康危害' },
        { id: 'inv_315', nameEn: 'Toluene', nameZh: '甲苯', formula: 'C6H5CH3', name: 'Toluene 甲苯 C6H5CH3', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 1', quantity: '—', hazards: '高度易燃, 健康危害, 刺激性' },
        { id: 'inv_316', nameEn: 'Hydrochloric acid solution', nameZh: '鹽酸溶液', formula: 'HCl(aq)', name: 'Hydrochloric acid solution 鹽酸溶液 HCl(aq)', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 2', quantity: '稀釋濃度', hazards: '腐蝕性' },
        { id: 'inv_317', nameEn: 'Benzene', nameZh: '苯', formula: 'C₆H₆', name: 'Benzene 苯 C₆H₆', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 1', quantity: '—', hazards: '高度易燃, 健康危害, 刺激性' },
        { id: 'inv_318', nameEn: 'LiquidsiliconrubberLSR', nameZh: '液體硅膠', formula: 'LiquidsiliconrubberLSR', name: 'LiquidsiliconrubberLSR 液體硅膠', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - UL 1', quantity: '—', hazards: '易燃, 刺激性' },
        { id: 'inv_319', nameEn: 'Rice vinegar/ 4-5% Acetic acid/', nameZh: '米醋', formula: 'Rice vinegar/ 4-5% acetic acid', name: 'Rice vinegar/ 4-5% Acetic acid/ 米醋', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_320', nameEn: 'Vinegar', nameZh: '白醋', formula: 'Vinegar', name: 'Vinegar 白醋', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_321', nameEn: 'Apple cider vinegar', nameZh: '蘋果醋', formula: 'Apple', name: 'Apple cider vinegar 蘋果醋', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_322', nameEn: 'Butyric acid', nameZh: '丁酸', formula: 'C₄H₈O₂', name: 'Butyric acid 丁酸 C₄H₈O₂', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 3', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_323', nameEn: 'Oleic acid', nameZh: '油酸', formula: 'C₁₈H₃₄O₂', name: 'Oleic acid 油酸 C₁₈H₃₄O₂', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_324', nameEn: 'Formic acid', nameZh: '甲酸', formula: 'HCOOH', name: 'Formic acid 甲酸 HCOOH', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 2', quantity: '—', hazards: '高度易燃, 有毒, 腐蝕性' },
        { id: 'inv_325', nameEn: 'Acetic acid', nameZh: '醋酸', formula: 'CH₃COOH', name: 'Acetic acid 醋酸 CH₃COOH', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 2', quantity: '—', hazards: '易燃, 腐蝕性' },
        { id: 'inv_326', nameEn: 'Acetic acid glacial', nameZh: '冰醋酸', formula: 'CH₃COOH', name: 'Acetic acid glacial 冰醋酸 CH₃COOH', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 2', quantity: '—', hazards: '易燃, 腐蝕性' },
        { id: 'inv_327', nameEn: 'Acetic acid solution', nameZh: '醋酸溶液', formula: 'CH₃COOH(aq)', name: 'Acetic acid solution 醋酸溶液 CH₃COOH(aq)', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 2', quantity: '—', hazards: '易燃, 刺激性' },
        { id: 'inv_328', nameEn: 'Sulphuric acid', nameZh: '濃硫酸', formula: 'H₂SO₄', name: 'Sulphuric acid 濃硫酸 H₂SO₄', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 1', quantity: '(約18M)', hazards: '腐蝕性' },
        { id: 'inv_329', nameEn: 'Acetic acid solution', nameZh: '醋酸溶液', formula: 'CH₃COOH(aq)', name: 'Acetic acid solution 醋酸溶液 CH₃COOH(aq)', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 2', quantity: '稀釋濃度', hazards: '易燃, 刺激性' },
        { id: 'inv_330', nameEn: 'Acetic acid', nameZh: '醋酸', formula: 'CH₃COOH', name: 'Acetic acid 醋酸 CH₃COOH', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 2', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_331', nameEn: 'Carbon tetrachloride', nameZh: '四氯化碳', formula: 'CCl₄', name: 'Carbon tetrachloride 四氯化碳 CCl₄', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 1', quantity: '—', hazards: '劇毒, 健康危害' },
        { id: 'inv_332', nameEn: 'Phenol', nameZh: '苯酚', formula: 'C₆H₅OH', name: 'Phenol 苯酚 C₆H₅OH', category: '有機溶劑/易燃', location: '619A 準備室 LC4 - LL 1', quantity: '—', hazards: '劇毒, 環境危害, 腐蝕性, 環境危害' },
        { id: 'inv_333', nameEn: 'Potassium ferricyanide (III)', nameZh: '鐵氰化鉀溶液', formula: 'K₃Fe(CN)₆(aq)', name: 'Potassium ferricyanide (III) 鐵氰化鉀溶液 K₃Fe(CN)₆(aq)', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: '刺激性, 環境危害' },
        { id: 'inv_334', nameEn: 'Sodium tetraborate', nameZh: '四硼酸鈉', formula: 'Na₂B₄O₇', name: 'Sodium tetraborate 四硼酸鈉 Na₂B₄O₇', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: '健康危害, 刺激性' },
        { id: 'inv_335', nameEn: 'Sodium silicate', nameZh: '硅酸鈉', formula: 'Na2O3Si', name: 'Sodium silicate 硅酸鈉 Na2O3Si', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_336', nameEn: 'Potassium dihydrogen phosphate', nameZh: '磷酸二氫鉀', formula: 'KH₂PO₄', name: 'Potassium dihydrogen phosphate 磷酸二氫鉀 KH₂PO₄', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_337', nameEn: 'Sodium phosphate', nameZh: '磷酸鈉', formula: 'NaH2PO4', name: 'Sodium phosphate 磷酸鈉 NaH2PO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_338', nameEn: 'Sodium hydrogen phosphate', nameZh: '磷酸氫二鈉', formula: 'Na2HPO4', name: 'Sodium hydrogen phosphate 磷酸氫二鈉 Na2HPO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_339', nameEn: 'Hydrochloric acid', nameZh: '鹽酸', formula: '—', name: 'Hydrochloric acid 鹽酸', category: '液體強酸強鹼', location: '619A 準備室 LC1 - UL 1', quantity: '(約10M)', hazards: '腐蝕性' },
        { id: 'inv_340', nameEn: 'Sodium dihydrogen phosphate', nameZh: '磷酸二氫鈉', formula: 'NaH2PO4', name: 'Sodium dihydrogen phosphate 磷酸二氫鈉 NaH2PO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_341', nameEn: 'Sodium thiosulphate', nameZh: '硫代硫酸鈉', formula: 'Na₂S₂O₃', name: 'Sodium thiosulphate 硫代硫酸鈉 Na₂S₂O₃', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 3', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_342', nameEn: 'Ammonium iron(III) sulphate', nameZh: '硫酸鐵銨', formula: '—', name: 'Ammonium iron(III) sulphate 硫酸鐵銨', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_343', nameEn: 'Ammonium sulphate', nameZh: '硫酸銨', formula: '(NH4)2SO2', name: 'Ammonium sulphate 硫酸銨 (NH4)2SO2', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_344', nameEn: 'Manganese(II) sulphate', nameZh: '硫酸錳', formula: 'MnSO4', name: 'Manganese(II) sulphate 硫酸錳 MnSO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 2', quantity: '—', hazards: '健康危害, 腐蝕性, 環境危害' },
        { id: 'inv_345', nameEn: 'Calcium sulphate', nameZh: '硫酸鈣', formula: 'CaSO4', name: 'Calcium sulphate 硫酸鈣 CaSO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 2', quantity: '—', hazards: 'N/AP' },
        { id: 'inv_346', nameEn: 'Zinc sulphate', nameZh: '硫酸鋅', formula: 'ZnSO4', name: 'Zinc sulphate 硫酸鋅 ZnSO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 2', quantity: '—', hazards: '腐蝕性, 刺激性, 環境危害' },
        { id: 'inv_347', nameEn: 'Potassium sulphate', nameZh: '硫酸鉀', formula: '—', name: 'Potassium sulphate 硫酸鉀', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_348', nameEn: 'Sodium sulphate', nameZh: '硫酸鈉', formula: '—', name: 'Sodium sulphate 硫酸鈉', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 2', quantity: '—', hazards: '刺激性' },
        { id: 'inv_349', nameEn: 'Iron(II) sulphate', nameZh: '硫酸亞鐵', formula: 'FeSO4', name: 'Iron(II) sulphate 硫酸亞鐵 FeSO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 1', quantity: '—', hazards: '刺激性' },
        { id: 'inv_350', nameEn: 'Nitric acid 100', nameZh: '硝酸溶液', formula: 'HNO3', name: 'Nitric acid 100 硝酸溶液 HNO3', category: '液體強酸強鹼', location: '619A 準備室 LC1 - LL 3', quantity: '稀釋濃度', hazards: '強氧化性, 毒性, 腐蝕性' },
        { id: 'inv_351', nameEn: 'Iron(III) sulphate', nameZh: '硫酸鐵', formula: '—', name: 'Iron(III) sulphate 硫酸鐵', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 1', quantity: '—', hazards: '刺激性, 腐蝕性' },
        { id: 'inv_352', nameEn: 'Magnesium sulphate', nameZh: '硫酸鎂', formula: '—', name: 'Magnesium sulphate 硫酸鎂', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 1', quantity: '—', hazards: '刺激性' },
        { id: 'inv_353', nameEn: 'Copper(II) sulphate', nameZh: '硫酸銅', formula: 'CuSO4', name: 'Copper(II) sulphate 硫酸銅 CuSO4', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 1', quantity: '—', hazards: '腐蝕性, 刺激性, 環境危害' },
        { id: 'inv_354', nameEn: 'Aluminium sulphate', nameZh: '硫酸鋁', formula: '(Al₂(SO₄)₃)', name: 'Aluminium sulphate 硫酸鋁 (Al₂(SO₄)₃)', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 1', quantity: '—', hazards: '腐蝕性' },
        { id: 'inv_355', nameEn: 'Potassium aluminium sulphate', nameZh: '硫酸鋁鉀', formula: '—', name: 'Potassium aluminium sulphate 硫酸鋁鉀', category: '固體/鹽類', location: '619A 準備室 SC1 - UL 1', quantity: '—', hazards: '刺激性' },
        { id: 'inv_356', nameEn: 'Iron(II) chloride', nameZh: '氯化亞鐵', formula: '—', name: 'Iron(II) chloride 氯化亞鐵', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 3', quantity: '—', hazards: '腐蝕性, 刺激性' },
        { id: 'inv_357', nameEn: 'Magnesium chloride', nameZh: '氯化鎂', formula: '—', name: 'Magnesium chloride 氯化鎂', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_358', nameEn: 'Barium chloride', nameZh: '氯化鋇', formula: '—', name: 'Barium chloride 氯化鋇', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 3', quantity: '—', hazards: '有毒' },
        { id: 'inv_359', nameEn: 'Calcium chloride', nameZh: '氯化鈣', formula: '—', name: 'Calcium chloride 氯化鈣', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_360', nameEn: 'Potassium chloride', nameZh: '氯化鉀', formula: '—', name: 'Potassium chloride 氯化鉀', category: '固體/鹽類', location: '619A 準備室 SC1 - LL 3', quantity: '—', hazards: '刺激性' },
        { id: 'inv_361', nameEn: 'TEST', nameZh: 'TEST', formula: '—', name: 'TEST TEST', category: '化學藥品', location: 'TEST', quantity: 'N/A', hazards: '無' }
    ];

    // 意外歷史日誌
    const DEFAULT_INCIDENTS = [
        { id: 'i1', studentClass: '中四A', classNumber: '12', date: '2025-09-12', time: '10:25', location: '619A 化學實驗室', category: '玻璃儀器碎裂', notes: '套接軟管時玻璃導管發生斷裂，劃破右手掌心，立即以無菌紗布壓迫止血並貼上創可貼。', severity: '中度 (需校內衛生急救)' },
        { id: 'i2', studentClass: '中三C', classNumber: '05', date: '2025-10-03', time: '14:10', location: '619A 化學實驗室', category: '玻璃儀器碎裂', notes: '清洗試管時，滑落在洗滌槽不鏽鋼板折斷碎裂，已用鑷子清理碎屑。', severity: '輕微 (自主觀察即可)' },
        { id: 'i3', studentClass: '中五B', classNumber: '18', date: '2025-11-18', time: '11:40', location: '619A 化學實驗室', category: '輕微化學液潑濺', notes: '滴定測試中，0.1M 的氫氧化鈉潑落在實驗桌，以抹布吸乾，稀醋酸中和後抹淨。', severity: '輕微 (自主觀察即可)' },
        { id: 'i4', studentClass: '中六A', classNumber: '22', date: '2026-01-08', time: '09:55', location: '619A 化學實驗室', category: '器材熱源灼燙', notes: '不慎用手觸碰了剛熄滅的酒精燈鐵三角架，中指輕度發紅，冰敷冷水 20 分鐘。', severity: '中度 (需校內衛生急救)' },
        { id: 'i5', studentClass: '中四B', classNumber: '09', date: '2026-02-21', time: '15:20', location: '619A 化學實驗室', category: '吸入刺激煙霧', notes: '通風櫥外的硫磺燃燒產生二氧化硫，引起學生一陣咳嗽，已帶去走廊呼吸新鮮空氣。', severity: '輕微 (自主觀察即可)' },
        { id: 'i6', studentClass: '中五A', classNumber: '15', date: '2026-03-15', time: '13:05', location: '619A 化學實驗室', category: '眼睛刺激或飛濺物', notes: '水滴潑濺，差點進入未戴護目鏡的學生眼中，生理食鹽水洗眼，虛驚一場。', severity: '中度 (需校內衛生急救)' }
    ];

    const DEFAULT_PROCEDURE_FILES = [
        { id: 'pf1', title: '酸鹼滴定實驗', subject: '化學', grade: '中三', labRoom: '619', notes: '滴定時須緩慢加入鹼液；NaOH 具腐蝕性，濺到皮膚須以大量清水沖洗。廢液統一收集，勿倒入水槽。', uploadedAt: '2025-09-01', equipment: ['50 mL 錐形瓶', '25 mL 滴定管', '鐵架台', '洗瓶'], reagents: ['0.1 M NaOH 溶液', '0.1 M HCl 溶液', '酚酞指示劑'], steps: ['檢查滴定管活塞是否漏液，以蒸餾水潤洗滴定管及錐形瓶', '用移液管量取 25.0 mL HCl 至錐形瓶，加入 2–3 滴酚酞', '將 NaOH 裝入滴定管，排除尖端氣泡後記錄初讀數', '緩慢滴定至溶液由無色轉淡粉紅色且 30 秒不褪色，記錄終讀數', '重複滴定至兩次讀數相差 ≤0.10 mL'], files: [] },
        { id: 'pf2', title: '金屬與酸反應', subject: '化學', grade: '中二', labRoom: '619', notes: '鎂帶勿用手直接觸碰；氫氣易燃，實驗遠離明火。稀鹽酸具腐蝕性，需戴護目鏡及手套。', uploadedAt: '2025-10-15', equipment: ['試管', '導管', '水槽', '本生燈'], reagents: ['鎂帶', '2 M HCl 稀鹽酸'], steps: ['於試管中加入約 2 mL 稀鹽酸', '以鑷子夾取小段鎂帶，投入試管中', '觀察氣泡產生，並以排水集氣法收集氣體', '以燃着的木條靠近集氣瓶口，測試氣體性質', '實驗後以大量清水沖洗試管'], files: [] },
        { id: 'pf3', title: '光的折射實驗', subject: '物理', grade: '中一', labRoom: '618', notes: '激光筆切勿直射眼睛或他人面部；半圓玻璃磚邊緣鋒利，搬運時小心割傷。', uploadedAt: '2025-11-20', equipment: ['半圓形玻璃磚', '激光筆', '量角器', '白紙'], reagents: [], steps: ['將白紙固定於桌面，畫出法線及入射點', '放置半圓玻璃磚，使直邊與法線重合', '以激光筆沿入射角射入玻璃磚', '標記折射光線路徑，用量角器量度入射角與折射角', '改變入射角，重複量度並記錄數據'], files: [] },
        { id: 'pf4', title: '顯微鏡觀察洋蔥表皮', subject: '生物', grade: '中二', labRoom: '616', notes: '碘液具刺激性，避免接觸皮膚；載玻片與蓋玻片邊緣鋒利，使用鑷子操作。', uploadedAt: '2026-01-10', equipment: ['光學顯微鏡', '載玻片', '蓋玻片', '鑷子'], reagents: ['碘液', '蒸餾水'], steps: ['以鑷子撕取洋蔥內表皮，置於載玻片中央', '滴加一滴蒸餾水，蓋上蓋玻片並排除氣泡', '以吸水紙在蓋玻片一側滴加碘液，另一側用紙吸引', '先以低倍鏡對焦，再轉高倍鏡觀察細胞壁與細胞核', '繪圖記錄觀察結果，清理載玻片'], files: [] }
    ];

    // ================= 全域狀態變數 =================
    let rules = [];
    let mistakes = [];
    let inventories = [];
    let incidents = [];
    let procedureDataFiles = [];
    let filteredProcedureDataFiles = [];
    let filteredIncidents = []; // 用於保存當前的篩選過濾數據狀態
    let labBookings = [];
    let filteredLabBookings = [];
    let labRooms = [];
    let safetyHandbook = null;
    let prepGuide = null;
    let isAdmin = false;
    const SAFETY_HANDBOOK_MAX_BYTES = 20 * 1024 * 1024;
    const PREP_GUIDE_MAX_BYTES = 20 * 1024 * 1024;
    const PREP_GUIDE_DEFAULT_PATH = 'assets/prep-guide-default.docx';
    const PREP_GUIDE_DEFAULT_NAME = '0.實驗室日誌和心得.docx';

    const DEFAULT_LAB_ROOMS = [
        { id: 'lab616', name: '616 生物實驗室', description: '生物實驗專用場地，適合顯微鏡觀察、解剖及生命科學探究活動。', photos: [], sortOrder: 1, isDefault: true },
        { id: 'lab617', name: '617 綜合科技實驗室', description: '綜合科技實驗場地，支援跨學科探究與科技實作活動。', photos: [], sortOrder: 2, isDefault: true },
        { id: 'lab618', name: '618 物理及STEM實驗室', description: '物理及 STEM 實驗場地，適合力學、光學、電學及跨科專題研習。', photos: [], sortOrder: 3, isDefault: true },
        { id: 'lab619', name: '619 化學實驗室', description: '化學實驗專用場地，配備通風櫥及化學實驗基本設施。', photos: [], sortOrder: 4, isDefault: true },
        { id: 'lab620', name: '620 多功能及物理實驗室', description: '多功能及物理實驗場地，可靈活安排分組實驗與示範教學。', photos: [], sortOrder: 5, isDefault: true },
        { id: 'lab621', name: '621 綜合科技實驗室', description: '綜合科技實驗場地，適合設計思維、製作與科技應用課程。', photos: [], sortOrder: 6, isDefault: true }
    ];

    const DEFAULT_LAB_LOCATIONS = DEFAULT_LAB_ROOMS.map(r => r.name);

    const LAB_ROOM_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
    const LAB_ROOM_PHOTO_MAX_FILES = 8;

    const BOOKING_CLASS_YEARS = ['初一', '初二', '初三', '高一', '高二', '高三', '活動'];
    const BOOKING_CLASS_SUBCLASSES = ['信', '望', '愛', '善', '樂', '多選'];
    const DEFAULT_BOOKING_SUBJECTS = ['生物', '化學', '物理', '科學', '多選'];
    const BOOKING_TIMESLOTS = [
        { id: 'morning_reading', label: '07:00-08:30 早讀' },
        { id: 'p1', label: '08:30-09:10 第一節' },
        { id: 'p2', label: '09:30-10:10 第二節' },
        { id: 'p3', label: '10:15-10:55 第三節' },
        { id: 'p4', label: '11:05-11:45 第四節' },
        { id: 'p5', label: '11:50-12:30 第五節' },
        { id: 'lunch', label: '12:30-14:05 中午' },
        { id: 'p6', label: '14:10-14:50 第六節' },
        { id: 'p7', label: '15:00-15:40 第七節' },
        { id: 'p8', label: '15:50-16:30 第八節' },
        { id: 'after_school', label: '16:30-20:30 課後' }
    ];
    const BOOKING_STATUS_LABELS = {
        pending: 'Pending laboratory admin for acknowledgement',
        approved: 'Approved',
        rejected: 'Rejected'
    };
    const BOOKING_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
    const BOOKING_ATTACHMENT_MAX_FILES = 8;
    const BOOKING_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
    let bookingDraftMaterials = [];
    let bookingDraftAttachments = [];

    let bookingSelectedDates = [];
    let bookingCalendarCursor = new Date();
    let bookingWeekViewAnchor = new Date();

    // ================= 介面主題切換 =================
    const LAB_SKIN_BODY = {
        default: 'theme-default bg-[#fcfbf9] text-stone-800',
        cyber: 'cyber-lab bg-[#050a12] text-stone-200',
        spring: 'spring-lab bg-[#faf8f5] text-stone-700'
    };

    function setLabSkin(skin) {
        if (!LAB_SKIN_BODY[skin]) skin = 'default';
        const body = document.getElementById('lab-body');
        if (body) {
            body.className = LAB_SKIN_BODY[skin] + ' font-sans antialiased min-h-screen';
            body.setAttribute('data-lab-skin', skin);
        }
        document.documentElement.setAttribute('data-lab-skin', skin);
        try { SafeStorage.setItem('lab_skin', skin); } catch (e) {
            try { localStorage.setItem('lab_skin', skin); } catch (e2) {}
        }
        document.querySelectorAll('.skin-btn').forEach(btn => {
            btn.classList.toggle('active-skin', btn.getAttribute('data-skin') === skin);
        });
        refreshActiveTabStyle();
    }

    function initLabSkin() {
        let skin = 'default';
        try { skin = SafeStorage.getItem('lab_skin') || document.getElementById('lab-body')?.getAttribute('data-lab-skin') || 'default'; } catch (e) {}
        if (!LAB_SKIN_BODY[skin]) skin = 'default';
        document.querySelectorAll('.skin-btn').forEach(btn => {
            btn.classList.toggle('active-skin', btn.getAttribute('data-skin') === skin);
        });
        refreshActiveTabStyle();
    }

    function refreshActiveTabStyle() {
        document.querySelectorAll('.tab-btn').forEach(t => {
            if (!t.classList.contains('active-tab')) {
                t.classList.add('text-stone-500');
            } else {
                t.classList.remove('text-stone-500');
            }
        });
    }

    window.setLabSkin = setLabSkin;

    window.addEventListener('cloudsync-ready', () => {
        if (window._deferredCloudIncidentsList) {
            window.applyCloudIncidents(window._deferredCloudIncidentsList);
            window._deferredCloudIncidentsList = null;
        }
        if (window._deferredCloudProcedureList) {
            window.applyCloudProcedures(window._deferredCloudProcedureList);
            window._deferredCloudProcedureList = null;
        }
        if (window._deferredCloudBookingsList) {
            window.applyCloudBookings(window._deferredCloudBookingsList);
            window._deferredCloudBookingsList = null;
        }
        if (window._deferredCloudLabRoomsList) {
            window.applyCloudLabRooms(window._deferredCloudLabRoomsList);
            window._deferredCloudLabRoomsList = null;
        }
        if (!window._incidentsCloudBootstrapDone || !window._procedureCloudBootstrapDone || !window._bookingsCloudBootstrapDone || !window._labRoomsCloudBootstrapDone) {
            bootstrapLabCloudSync().catch(err => console.error('Lab cloud bootstrap (ready):', err));
        }
    });

    // ================= 頁面初始化程序 =================
    window.onload = function() {
        initLabSkin();
        initStorage();
        initAuthStatus();  
        initAiEngineConfig(); 
        
        populateClassFilter();
        resetAnalyticsFilters();
        filterProcedureDataFiles();
        populateBookingFilterOptions();
        filterLabBookings();
        renderLabRoomButtons();
        renderBookingWeekCalendar();
        if (typeof relaxIosFileAccepts === 'function') relaxIosFileAccepts();

        if (window._deferredCloudInventoryList) {
            window.applyCloudInventories(window._deferredCloudInventoryList);
            window._deferredCloudInventoryList = null;
        }
        if (window._deferredCloudProcedureList) {
            window.applyCloudProcedures(window._deferredCloudProcedureList);
            window._deferredCloudProcedureList = null;
        }
        if (window._deferredCloudIncidentsList) {
            window.applyCloudIncidents(window._deferredCloudIncidentsList);
            window._deferredCloudIncidentsList = null;
        }
        if (window._deferredCloudBookingsList) {
            window.applyCloudBookings(window._deferredCloudBookingsList);
            window._deferredCloudBookingsList = null;
        }
        if (window._deferredCloudLabRoomsList) {
            window.applyCloudLabRooms(window._deferredCloudLabRoomsList);
            window._deferredCloudLabRoomsList = null;
        }
        bootstrapLabCloudSync().catch(err => console.error('Lab cloud bootstrap:', err));
    }

    // ================= 權限驗證邏輯 =================
    function initAuthStatus() {
        if (!SafeStorage.getItem('admin_pwd')) {
            SafeStorage.setItem('admin_pwd', 'admin123');
        }
        const storedAdmin = SafeStorage.getItem('is_lab_admin');
        if (storedAdmin === 'true') {
            setAdminMode(true);
        } else {
            setAdminMode(false);
        }
    }

    // ================= DeepSeek AI 連接配置 =================
    const DEEPSEEK_DEFAULTS = {
        url: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        key: "sk-2af42cdb5e4f474283944c939ad58060"
    };
    const AI_SETTINGS_VERSION = 'deepseek-only-v2';

    function isDeepSeekModel(model) {
        return typeof model === 'string' && /^deepseek[-\w]*/i.test(model.trim());
    }

    function migrateToDeepSeek() {
        const legacyKey = SafeStorage.getItem('user_gemini_api_key');
        const storedModel = SafeStorage.getItem('user_ai_model');

        if (SafeStorage.getItem('ai_settings_version') !== AI_SETTINGS_VERSION) {
            SafeStorage.setItem('user_ai_model', DEEPSEEK_DEFAULTS.model);
            SafeStorage.setItem('user_deepseek_api_key', DEEPSEEK_DEFAULTS.key);
            SafeStorage.setItem('ai_settings_version', AI_SETTINGS_VERSION);
        } else {
            if (!isDeepSeekModel(storedModel)) {
                SafeStorage.setItem('user_ai_model', DEEPSEEK_DEFAULTS.model);
            }
            if (legacyKey && !SafeStorage.getItem('user_deepseek_api_key')) {
                SafeStorage.setItem('user_deepseek_api_key', legacyKey);
            }
            if (!SafeStorage.getItem('user_deepseek_api_key')) {
                SafeStorage.setItem('user_deepseek_api_key', DEEPSEEK_DEFAULTS.key);
            }
        }

        ['user_ai_provider', 'user_gemini_api_key', 'user_ai_base'].forEach(key => {
            try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
        });
    }

    function initAiEngineConfig() {
        migrateToDeepSeek();

        const storedKey = SafeStorage.getItem('user_deepseek_api_key') || DEEPSEEK_DEFAULTS.key;
        const storedModel = SafeStorage.getItem('user_ai_model') || DEEPSEEK_DEFAULTS.model;
        const model = isDeepSeekModel(storedModel) ? storedModel : DEEPSEEK_DEFAULTS.model;

        const apiKeyEl = document.getElementById('user-api-key');
        const apiModelEl = document.getElementById('user-api-model');
        if (apiKeyEl) apiKeyEl.value = storedKey;
        if (apiModelEl) apiModelEl.value = model;

        updateModelInfoLabel();
    }

    function saveUserApiKey() {
        const keyVal = document.getElementById('user-api-key').value.trim();
        const modelVal = document.getElementById('user-api-model').value.trim() || DEEPSEEK_DEFAULTS.model;

        SafeStorage.setItem('user_deepseek_api_key', keyVal);
        SafeStorage.setItem('user_ai_model', modelVal);

        toggleModal('api-setup-modal');
        updateModelInfoLabel();
        openInfoModal('🔑 DeepSeek 設定已儲存', '已成功更新 DeepSeek API 連線設定。', '✨');
    }

    function updateModelInfoLabel() {
        const model = SafeStorage.getItem('user_ai_model') || DEEPSEEK_DEFAULTS.model;
        const label = `當前模型: [DeepSeek] ${model}`;
        const mainInfo = document.getElementById('active-ai-model-info');
        if (mainInfo) mainInfo.textContent = label;
        const procedureInfo = document.getElementById('procedure-ai-model-info');
        if (procedureInfo) procedureInfo.textContent = label;
    }

    // ================= 實驗程序文件分析 =================
    const PROCEDURE_FILE_LIMIT = 5;
    const PROCEDURE_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
    const PROCEDURE_MAX_DOC_BYTES = 10 * 1024 * 1024;
    let procedureImages = [];

    function getProcedureFileType(file) {
        const name = (file.name || '').toLowerCase();
        if (file.type.startsWith('image/')) return 'image';
        if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
        if (file.type === 'application/msword' || name.endsWith('.doc')) return 'doc';
        return null;
    }

    function getProcedureFileIcon(type) {
        if (type === 'pdf') return '📕';
        if (type === 'docx') return '📝';
        return '🖼️';
    }

    function renderProcedureImagePreview() {
        const container = document.getElementById('procedure-image-preview');
        if (!container) return;
        if (!procedureImages.length) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = procedureImages.map(file => {
            const preview = file.type === 'image'
                ? `<img src="${file.dataUrl}" alt="${file.name}" class="w-full h-24 object-cover">`
                : `<div class="w-full h-24 flex flex-col items-center justify-center bg-stone-100 text-stone-600">
                        <span class="text-3xl">${getProcedureFileIcon(file.type)}</span>
                        <span class="text-[10px] font-bold uppercase mt-1">${file.type}</span>
                   </div>`;
            return `
            <div class="relative group rounded-lg overflow-hidden border border-stone-200 bg-stone-50">
                ${preview}
                <button type="button" onclick="removeProcedureImage('${file.id}')" class="absolute top-1 right-1 bg-red-600/90 hover:bg-red-700 text-white text-xs w-6 h-6 rounded-full">✕</button>
                <p class="text-[10px] text-stone-500 px-2 py-1 truncate" title="${file.name}">${file.name}</p>
            </div>`;
        }).join('');
    }

    function handleProcedureDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('procedure-drop-active');
    }

    function handleProcedureDragLeave(event) {
        event.currentTarget.classList.remove('procedure-drop-active');
    }

    function handleProcedureDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('procedure-drop-active');
        if (event.dataTransfer?.files?.length) {
            addProcedureImageFiles(event.dataTransfer.files);
        }
    }

    function handleProcedureImageUpload(event) {
        if (event.target.files?.length) {
            addProcedureImageFiles(event.target.files);
            event.target.value = '';
        }
    }

    function addProcedureImageFiles(fileList) {
        const remaining = PROCEDURE_FILE_LIMIT - procedureImages.length;
        if (remaining <= 0) {
            openInfoModal('⚠️ 檔案數量上限', `最多只能上傳 ${PROCEDURE_FILE_LIMIT} 個檔案。`, '📁');
            return;
        }

        const files = Array.from(fileList).slice(0, remaining);
        files.forEach(file => {
            const type = getProcedureFileType(file);
            if (!type) {
                openInfoModal('⚠️ 格式不支援', '請上傳圖片（JPG/PNG/WEBP）、PDF 或 Word（.docx）。', '📁');
                return;
            }
            if (type === 'doc') {
                openInfoModal('⚠️ 格式不支援', '舊版 Word (.doc) 請在 Word 中另存為 .docx 或 PDF 後再上傳。', '📝');
                return;
            }

            const maxSize = type === 'image' ? PROCEDURE_MAX_IMAGE_BYTES : PROCEDURE_MAX_DOC_BYTES;
            const sizeLabel = type === 'image' ? '4MB' : '10MB';
            if (file.size > maxSize) {
                openInfoModal('⚠️ 檔案過大', `「${file.name}」超過 ${sizeLabel}，請壓縮或分割後再上傳。`, '📁');
                return;
            }

            const id = 'proc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            const reader = new FileReader();
            reader.onload = (e) => {
                const entry = { id, name: file.name, type };
                if (type === 'image') {
                    entry.dataUrl = e.target.result;
                } else {
                    entry.arrayBuffer = e.target.result;
                }
                procedureImages.push(entry);
                renderProcedureImagePreview();
            };
            if (type === 'image') {
                reader.readAsDataURL(file);
            } else {
                reader.readAsArrayBuffer(file);
            }
        });
    }

    function removeProcedureImage(id) {
        procedureImages = procedureImages.filter(img => img.id !== id);
        renderProcedureImagePreview();
    }

    function clearProcedureImages() {
        procedureImages = [];
        renderProcedureImagePreview();
        const context = document.getElementById('procedure-context');
        if (context) context.value = '';
    }

    function setProcedureLoadingMessage(message) {
        const el = document.getElementById('procedure-loading-message');
        if (el) el.textContent = message;
        const pdModal = document.getElementById('procedure-data-modal');
        const pdEl = document.getElementById('pd-ai-fill-status');
        if (pdEl && pdModal && !pdModal.classList.contains('hidden')) {
            pdEl.classList.remove('hidden');
            pdEl.className = 'text-[10px] mt-1 text-amber-700';
            pdEl.textContent = message;
        }
    }

    function setPdAiFillStatus(message, isError = false) {
        const el = document.getElementById('pd-ai-fill-status');
        if (!el) return;
        if (!message) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.classList.remove('hidden');
        el.className = `text-[10px] mt-1 ${isError ? 'text-red-600' : 'text-emerald-700'}`;
        el.textContent = message;
    }

    function resizeImageForOcr(dataUrl, maxWidth = 1600) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);
                const width = Math.max(1, Math.round(img.width * scale));
                const height = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => reject(new Error('無法讀取圖片以進行文字辨識。'));
            img.src = dataUrl;
        });
    }

    function initPdfJs() {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF 解析模組尚未載入，請重新整理頁面後再試。');
        }
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }

    async function ocrDataUrl(dataUrl) {
        if (typeof Tesseract === 'undefined') {
            throw new Error('文字辨識模組尚未載入，請重新整理頁面後再試。');
        }
        const optimized = await resizeImageForOcr(dataUrl);
        const result = await Tesseract.recognize(optimized, 'chi_tra+eng');
        return (result.data.text || '').replace(/\s+/g, ' ').trim();
    }

    async function ocrProcedureImage(img, index, total) {
        setProcedureLoadingMessage(`🔍 正在辨識圖片文字（${index + 1}/${total}）：${img.name}...`);
        return ocrDataUrl(img.dataUrl);
    }

    async function extractTextFromPdf(source, fileName, index, total) {
        initPdfJs();
        setProcedureLoadingMessage(`📕 正在讀取 PDF（${index + 1}/${total}）：${fileName}...`);
        let arrayBuffer = source?.arrayBuffer || null;
        if (!arrayBuffer && source?.url && !source.url.startsWith('data:')) {
            arrayBuffer = await downloadProcedureFileBytes({
                fileName,
                name: fileName,
                url: source.url,
                storagePath: source.storagePath || null
            });
        }
        const docParams = arrayBuffer
            ? { data: arrayBuffer }
            : source?.url
                ? { url: source.url, withCredentials: false }
                : null;
        if (!docParams) throw new Error(`無法讀取 PDF「${fileName}」：缺少檔案資料。`);
        let pdf;
        try {
            pdf = await pdfjsLib.getDocument(docParams).promise;
        } catch (err) {
            const hint = err.message === 'Failed to fetch'
                ? '無法從雲端讀取 PDF，請確認已同步至 Firebase 或改用本機上傳'
                : (err.message || 'PDF 解析失敗');
            throw new Error(`無法讀取 PDF「${fileName}」：${hint}`);
        }
        let text = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(' ') + '\n';
        }
        text = text.replace(/\s+/g, ' ').trim();

        if (text.length < 80) {
            setProcedureLoadingMessage(`🔍 PDF 文字較少，正在 OCR 掃描頁面（${index + 1}/${total}）：${fileName}...`);
            const maxOcrPages = Math.min(pdf.numPages, 8);
            let ocrText = '';
            for (let pageNum = 1; pageNum <= maxOcrPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                ocrText += await ocrDataUrl(canvas.toDataURL('image/jpeg', 0.85)) + '\n';
            }
            text = (text + '\n' + ocrText).replace(/\s+/g, ' ').trim();
        }
        return text;
    }

    async function extractTextFromDocx(arrayBuffer, fileName, index, total) {
        if (typeof mammoth === 'undefined') {
            throw new Error('Word 解析模組尚未載入，請重新整理頁面後再試。');
        }
        setProcedureLoadingMessage(`📝 正在讀取 Word（${index + 1}/${total}）：${fileName}...`);
        const result = await mammoth.extractRawText({ arrayBuffer });
        return (result.value || '').replace(/\s+/g, ' ').trim();
    }

    async function extractTextFromProcedureFile(file, index, total) {
        if (file.type === 'image') {
            if (!file.dataUrl && file.url && !file.dataBase64) {
                file.dataUrl = await downloadProcedureImageDataUrl({
                    fileName: file.name,
                    name: file.name,
                    url: file.url,
                    storagePath: file.storagePath || null,
                    mimeType: file.mimeType
                });
            }
            return ocrProcedureImage(file, index, total);
        }
        if (file.type === 'pdf') {
            if (!file.arrayBuffer && (file.url || file.dataBase64)) {
                file.arrayBuffer = await downloadProcedureFileBytes({
                    fileName: file.name,
                    name: file.name,
                    url: file.url,
                    storagePath: file.storagePath || null,
                    dataBase64: file.dataBase64
                });
            }
            return extractTextFromPdf(file, file.name, index, total);
        }
        if (file.type === 'docx') {
            if (!file.arrayBuffer && (file.url || file.dataBase64)) {
                file.arrayBuffer = await downloadProcedureFileBytes({
                    fileName: file.name,
                    name: file.name,
                    url: file.url,
                    storagePath: file.storagePath || null,
                    dataBase64: file.dataBase64
                });
            }
            return extractTextFromDocx(file.arrayBuffer, file.name, index, total);
        }
        return '';
    }

    async function extractTextFromProcedureImages(images) {
        const sections = [];
        for (let i = 0; i < images.length; i++) {
            const text = await extractTextFromProcedureFile(images[i], i, images.length);
            const emptyMsg = images[i].type === 'image'
                ? '（未能辨識出可讀文字，可能為純圖示、器材照片或字跡不清）'
                : '（未能從文件中擷取可讀文字，請確認檔案未加密或損壞）';
            sections.push({
                name: images[i].name,
                type: images[i].type,
                text: text || emptyMsg
            });
        }
        return sections;
    }

    function setAdminMode(status) {
        isAdmin = status;
        SafeStorage.setItem('is_lab_admin', status);
        
        const badge = document.getElementById('admin-badge');
        const badgeDot = document.getElementById('badge-dot');
        const badgeText = document.getElementById('badge-text');
        const authBtn = document.getElementById('auth-btn');

        if (badge && badgeDot && badgeText && authBtn) {
            if (isAdmin) {
                badge.className = "bg-stone-100 text-stone-600 px-3 py-1.5 rounded-full text-xs font-bold border border-stone-200 flex items-center gap-2";
                badgeDot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
                badgeText.textContent = "管理員編輯模式";
                authBtn.innerHTML = '<span class="theme-default-only theme-spring-only">🔒 登出</span><span class="theme-cyber-only font-mono tracking-wider">🔒 LOGOUT</span>';
                authBtn.className = "bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm";
                
                document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            } else {
                badge.className = "bg-stone-100 text-stone-600 px-3 py-1.5 rounded-full text-xs font-bold border border-stone-200 flex items-center gap-2";
                badgeDot.className = "w-2 h-2 rounded-full bg-stone-400";
                badgeText.textContent = "一般檢視者模式";
                authBtn.innerHTML = '<span class="theme-default-only theme-spring-only">🔑 管理員登入</span><span class="theme-cyber-only font-mono tracking-wider">🔑 ADMIN LOGIN</span>';
                authBtn.className = "bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow-sm";

                document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
            }
        }

        renderRules();
        renderMistakes();
        renderInventoryTable();
        renderProcedureDataTable();
        renderIncidents(filteredIncidents);
        filterLabBookings();
    }

    function handleAuthAction() {
        if (isAdmin) {
            setAdminMode(false);
            openInfoModal('🔒 已登出管理員身份', '您已順利切換回「一般檢視者模式」，編輯保護已重新啟動。', '👤');
        } else {
            const pwdInput = document.getElementById('admin-password');
            if (pwdInput) pwdInput.value = '';
            const errMsg = document.getElementById('login-error-msg');
            if (errMsg) errMsg.classList.add('hidden');
            toggleModal('login-modal');
        }
    }

    function attemptLogin() {
        const inputPwd = document.getElementById('admin-password').value;
        const actualPwd = SafeStorage.getItem('admin_pwd') || 'admin123';

        if (inputPwd === actualPwd) {
            toggleModal('login-modal');
            setAdminMode(true);
            openInfoModal('🔓 登入成功！', '您已解鎖管理員權限。現在可以自由增修數據。', '✨');
        } else {
            document.getElementById('login-error-msg').classList.remove('hidden');
        }
    }

    // ================= 自訂彈窗管理 =================
    let _iosLockedScrollY = 0;

    function syncBodyScrollLock() {
        const anyOpen = Array.from(document.querySelectorAll('[id$="-modal"]'))
            .some(m => m && !m.classList.contains('hidden'));
        if (anyOpen) {
            if (document.body.dataset.scrollLocked === '1') return;
            _iosLockedScrollY = window.scrollY || window.pageYOffset || 0;
            document.body.dataset.scrollLocked = '1';
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.top = '-' + _iosLockedScrollY + 'px';
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.width = '100%';
        } else if (document.body.dataset.scrollLocked === '1') {
            document.body.dataset.scrollLocked = '';
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            document.body.style.width = '';
            window.scrollTo(0, _iosLockedScrollY);
        }
    }

    function showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
        syncBodyScrollLock();
    }

    function hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
        syncBodyScrollLock();
    }

    function toggleModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.toggle('hidden');
        syncBodyScrollLock();
    }

    document.addEventListener('focusin', function (e) {
        if (!isAppleTouchDevice()) return;
        const el = e.target;
        if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
        setTimeout(function () {
            try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
        }, 350);
    });

    function getNowDateValue() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    function getNowTimeValue() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    function formatIncidentDateTime(inc) {
        if (!inc.date && !inc.time) return '未紀錄';
        return [inc.date || '', inc.time || ''].filter(Boolean).join(' ');
    }

    function openIncidentModal() {
        document.getElementById('incident-edit-id').value = '';
        document.getElementById('incident-modal-title').textContent = '登記實驗意外事件';
        document.getElementById('incident-submit-btn').textContent = '紀錄存檔';
        document.getElementById('incident-form').reset();
        document.getElementById('incident-edit-id').value = '';
        const dateEl = document.getElementById('incident-date');
        const timeEl = document.getElementById('incident-time');
        if (dateEl) dateEl.value = getNowDateValue();
        if (timeEl) timeEl.value = getNowTimeValue();
        populateIncidentLocationSelect();
        populateIncidentCategorySelect();
        setIncidentClassFields('');
        toggleModal('incident-modal');
    }

    function openEditIncidentModal(id) {
        const inc = incidents.find(i => i.id === id);
        if (!inc) return;

        document.getElementById('incident-edit-id').value = inc.id;
        document.getElementById('incident-modal-title').textContent = '✏️ 修改意外事故紀錄';
        document.getElementById('incident-submit-btn').textContent = '儲存修改';
        setIncidentClassFields(inc.studentClass || '');
        document.getElementById('incident-class-number').value = inc.classNumber || '';
        document.getElementById('incident-date').value = inc.date || '';
        document.getElementById('incident-time').value = inc.time || '';
        populateIncidentCategorySelect(inc.category || '');
        document.getElementById('incident-notes').value = inc.notes || '';
        document.getElementById('incident-severity').value = inc.severity || '';
        populateIncidentLocationSelect(inc.location || '');
        toggleModal('incident-modal');
    }

    function openInfoModal(title, desc, emoji = '💡') {
        const icon = document.getElementById('info-icon');
        const titleEl = document.getElementById('info-title');
        const descEl = document.getElementById('info-desc');
        if (icon && titleEl && descEl) {
            icon.textContent = emoji;
            titleEl.textContent = title;
            descEl.textContent = desc;
            showModal('info-modal');
        }
    }

    function openConfirmModal(type, targetId = null) {
        const confirmBtn = document.getElementById('confirm-action-btn');
        const descEl = document.getElementById('confirm-prompt-desc');
        if (!confirmBtn || !descEl) return;
        
        if (type === 'reset-system') {
            descEl.textContent = '確定要重置系統嗎？這將還原您自訂添加的所有資料，恢復成原始預設狀態。此操作不可逆。';
            confirmBtn.onclick = async function() {
                SafeStorage.clear();
                initStorage();
                renderRules();
                renderMistakes();
                renderInventoryTable();
                renderProcedureDataTable();
                populateClassFilter();
                resetAnalyticsFilters();
                populateBookingFilterOptions();
                filterLabBookings();
                labRooms = JSON.parse(JSON.stringify(DEFAULT_LAB_ROOMS));
                SafeStorage.setItem('lab_rooms', JSON.stringify(labRooms));
                renderLabRoomButtons();
                await persistRules();
                await persistMistakes();
                await persistInventories();
                await persistIncidents();
                await persistProcedureFiles();
                await persistBookings();
                await persistLabRooms();
                hideModal('confirm-modal');
                openInfoModal('🔄 重置完成', '實驗室數據已還原並同步至雲端。', '🔄');
            };
        } else if (type === 'delete-rule') {
            descEl.textContent = '確定要刪除這條安全守則嗎？';
            confirmBtn.onclick = async function() {
                rules = rules.filter(r => r.id !== targetId);
                await persistRules();
                renderRules();
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-mistake') {
            descEl.textContent = '確定要永久移除此項常見錯誤案例嗎？';
            confirmBtn.onclick = async function() {
                mistakes = mistakes.filter(m => m.id !== targetId);
                await persistMistakes();
                renderMistakes();
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-inv') {
            descEl.textContent = '確定要將此項藥品/物資永久從 619A 下架移除嗎？';
            confirmBtn.onclick = async function() {
                inventories = inventories.filter(v => v.id !== targetId);
                await persistInventories(targetId);
                renderInventoryTable();
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-incident') {
            descEl.textContent = '確定要移除此筆意外事故嗎？';
            confirmBtn.onclick = async function() {
                incidents = incidents.filter(i => i.id !== targetId);
                await persistIncidents();
                populateClassFilter();
                applyAnalyticsFilters();
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-booking') {
            descEl.textContent = '確定要刪除此筆實驗室預約嗎？';
            confirmBtn.onclick = async function() {
                labBookings = labBookings.filter(b => b.id !== targetId);
                await persistBookings();
                populateBookingFilterOptions();
                filterLabBookings();
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-lab-room') {
            descEl.textContent = '確定要刪除此實驗室地點嗎？預設實驗室不會被永久移除，僅清除自訂地點。';
            confirmBtn.onclick = async function() {
                const room = labRooms.find(r => r.id === targetId);
                if (room?.isDefault) {
                    openInfoModal('⚠️ 無法刪除', '預設實驗室不可刪除，但可編輯其簡介與照片。', '🏛️');
                    hideModal('confirm-modal');
                    return;
                }
                labRooms = labRooms.filter(r => r.id !== targetId);
                await persistLabRooms();
                renderLabRoomsManageList();
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-lab-room-photo') {
            const sep = (targetId || '').indexOf('::');
            const roomId = sep >= 0 ? targetId.slice(0, sep) : '';
            const photoId = sep >= 0 ? targetId.slice(sep + 2) : '';
            descEl.textContent = '確定要移除此實驗室照片嗎？';
            confirmBtn.onclick = async function() {
                const room = labRooms.find(r => r.id === roomId);
                if (room) {
                    room.photos = (room.photos || []).filter(p => p.id !== photoId);
                    await persistLabRooms();
                    renderLabRoomEditPhotos(roomId);
                    renderLabRoomsManageList();
                }
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-procedure-file') {
            descEl.textContent = '確定要從資料庫永久刪除此實驗程序記錄嗎？';
            confirmBtn.onclick = async function() {
                procedureDataFiles = procedureDataFiles.filter(p => p.id !== targetId);
                expandedProcedureIds.delete(targetId);
                await persistProcedureFiles();
                filterProcedureDataFiles();
                hideModal('confirm-modal');
            };
        } else if (type === 'clear-all-procedures') {
            const count = (procedureDataFiles || []).length;
            descEl.textContent = `確定要清空全部實驗程序資料嗎？將刪除本機與 Firebase 上的 ${count} 筆記錄（含雲端附件連結）。此操作不可逆。`;
            confirmBtn.onclick = async function() {
                hideModal('confirm-modal');
                try {
                    await clearAllProcedureData();
                    openInfoModal('🗑️ 已清空', '所有實驗程序資料已從本機與 Firebase 清除。', '🗑️');
                } catch (err) {
                    console.error('Clear all procedures failed:', err);
                    openInfoModal('⚠️ 清空失敗', (err.message || '未知錯誤') + '。請檢查網路與 Firebase 設定後重試。', '☁️');
                }
            };
        } else if (type === 'delete-procedure-attached-file') {
            const sep = (targetId || '').indexOf('::');
            const procId = sep >= 0 ? targetId.slice(0, sep) : '';
            const fileId = sep >= 0 ? targetId.slice(sep + 2) : '';
            descEl.textContent = '確定要移除此附件嗎？';
            confirmBtn.onclick = async function() {
                const proc = procedureDataFiles.find(p => p.id === procId);
                if (proc) {
                    proc.files = (proc.files || []).filter(f => f.id !== fileId);
                    await persistProcedureFiles();
                    filterProcedureDataFiles();
                    const editId = document.getElementById('pd-edit-id')?.value;
                    if (editId === procId) renderProcedureExistingFiles(procId);
                }
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-inventory-msds') {
            const [invId, fileId] = (targetId || '').split('::');
            descEl.textContent = '確定要移除此 MSDS 附件嗎？';
            confirmBtn.onclick = async function() {
                const item = inventories.find(v => v.id === invId);
                if (item) {
                    item.msds = getInventoryMsds(item).filter(f => f.id !== fileId);
                    await persistInventories();
                    filterInventory();
                    const editId = document.getElementById('edit-inv-id')?.value;
                    if (editId === invId) renderInventoryMsdsExisting('edit-inv-msds-existing', invId, true);
                }
                hideModal('confirm-modal');
            };
        } else if (type === 'delete-inventory-photo') {
            const [invId, fileId] = (targetId || '').split('::');
            descEl.textContent = '確定要移除此照片嗎？';
            confirmBtn.onclick = async function() {
                const item = inventories.find(v => v.id === invId);
                if (item) {
                    item.photos = getInventoryPhotos(item).filter(f => f.id !== fileId);
                    await persistInventories();
                    filterInventory();
                    const editId = document.getElementById('edit-inv-id')?.value;
                    if (editId === invId) renderInventoryPhotosExisting('edit-inv-photos-existing', invId, true);
                }
                hideModal('confirm-modal');
            };
        }

        showModal('confirm-modal');
    }

    // ================= 儲存與本地端持久數據 =================
    const INVENTORY_DATA_VERSION = '2026-inventory-user-20260710';
    const PROCEDURE_DATA_VERSION = 'procedure-v2-multi';

    function migrateProcedureRecord(item) {
        const rec = { ...item };
        if (!Array.isArray(rec.files)) {
            rec.files = [];
            if (rec.dataBase64) {
                rec.files.push({
                    id: 'file-' + rec.id,
                    fileName: rec.fileName || 'procedure-file',
                    fileType: rec.fileType || 'pdf',
                    mimeType: rec.mimeType || 'application/octet-stream',
                    fileSize: rec.fileSize || 0,
                    dataBase64: rec.dataBase64,
                    uploadedAt: rec.uploadedAt || ''
                });
            }
            delete rec.dataBase64;
            delete rec.fileName;
            delete rec.fileType;
            delete rec.mimeType;
            delete rec.fileSize;
        }
        if (!Array.isArray(rec.equipment)) rec.equipment = [];
        if (!Array.isArray(rec.reagents)) rec.reagents = [];
        if (!Array.isArray(rec.steps)) {
            rec.steps = typeof rec.steps === 'string' ? rec.steps.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
        }
        rec.files = (rec.files || []).map(f => {
            if (!f?.url || f.storagePath) return f;
            const match = String(f.url).match(/\/o\/([^?]+)/);
            if (!match) return f;
            try {
                return { ...f, storagePath: decodeURIComponent(match[1]) };
            } catch (_) {
                return f;
            }
        });
        const def = DEFAULT_PROCEDURE_FILES.find(d => d.id === rec.id);
        if (!rec.equipment.length && def?.equipment?.length) rec.equipment = [...def.equipment];
        if (!rec.reagents.length && def?.reagents?.length) rec.reagents = [...def.reagents];
        if (!rec.steps.length && def?.steps?.length) rec.steps = [...def.steps];
        return rec;
    }

    function migrateInventoryItem(item) {
        return enrichInventoryItem(item);
    }

    function getMsdsFileUrl(file) {
        if (!file) return null;
        if (file.url) return file.url;
        if (file.dataBase64) {
            const mime = file.mimeType || 'application/octet-stream';
            return `data:${mime};base64,${file.dataBase64}`;
        }
        return null;
    }

    function isCloudSyncReady() {
        return !!(window.CloudSync?.ready && typeof window.CloudSync.downloadFileBytes === 'function');
    }

    async function ensureCloudSync(maxWaitMs = 30000) {
        if (isCloudSyncReady()) return window.CloudSync;
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(isCloudSyncReady() ? window.CloudSync : null);
            };
            const onReady = () => {
                if (isCloudSyncReady()) finish();
            };
            window.addEventListener('cloudsync-ready', onReady);
            let waited = 0;
            const timer = setInterval(() => {
                waited += 100;
                if (isCloudSyncReady() || waited >= maxWaitMs) finish();
            }, 100);
            function cleanup() {
                clearInterval(timer);
                window.removeEventListener('cloudsync-ready', onReady);
            }
        });
    }

    function resolveCloudUploadResult(result) {
        if (typeof result === 'string') return { url: result, storagePath: null };
        return result || { url: null, storagePath: null };
    }

    function toKeyedCloudPayload(items) {
        const payload = {};
        (items || []).forEach(item => {
            if (!item?.id) return;
            payload[item.id] = item;
        });
        return payload;
    }

    async function pushToCloud(label, writeFn, { retries = 3, waitMs = 45000 } = {}) {
        let lastErr = null;
        for (let attempt = 0; attempt < retries; attempt++) {
            const cloud = await ensureCloudSync(waitMs);
            if (!cloud) {
                lastErr = new Error('雲端模組尚未就緒');
                await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
                continue;
            }
            try {
                await writeFn(cloud);
                return true;
            } catch (err) {
                lastErr = err;
                console.error(`Cloud sync failed (${label}) attempt ${attempt + 1}:`, err);
                await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
            }
        }
        openInfoModal(
            '⚠️ 雲端同步失敗',
            `${(lastErr && lastErr.message) || '未知錯誤'}。${label}已儲存於本機，系統將在重新整理後再試同步。`,
            '☁️'
        );
        return false;
    }

    async function persistInventories(deletedId) {
        SafeStorage.setItem('lab_inventories', JSON.stringify(inventories));
        const cloud = await ensureCloudSync();
        if (!cloud) return;
        try {
            if (deletedId) {
                await cloud.deleteInventoryItem(deletedId);
            } else {
                await cloud.saveAllInventories(inventories);
            }
        } catch (err) {
            console.error('Cloud sync failed:', err);
            openInfoModal('⚠️ 雲端同步失敗', (err.message || '未知錯誤') + '。資料已儲存於本機，請稍後重試。', '☁️');
        }
    }

    window.applyCloudInventories = function(cloudList) {
        if (!Array.isArray(cloudList)) return;
        if (!window._inventoryInitComplete) {
            window._deferredCloudInventoryList = cloudList;
            return;
        }
        const cloudItems = cloudList.map(migrateInventoryItem);
        if (window._pendingInventoryCloudMerge) {
            inventories = mergeInventoryAttachmentsFromPrevious(inventories, cloudItems);
            window._pendingInventoryCloudMerge = false;
            SafeStorage.setItem('lab_inventories', JSON.stringify(inventories));
            filterInventory();
            persistInventories().catch(err => console.error('Post-merge cloud sync failed:', err));
            return;
        }
        inventories = mergeInventoryAttachmentsFromPrevious(cloudItems, inventories);
        SafeStorage.setItem('lab_inventories', JSON.stringify(inventories));
        filterInventory();
    };

    window.getInventoriesForCloudSeed = function() {
        return inventories;
    };

    async function persistRules() {
        SafeStorage.setItem('lab_rules', JSON.stringify(rules));
        const cloud = await ensureCloudSync();
        if (!cloud) return;
        try {
            await cloud.saveRules(rules);
        } catch (err) {
            console.error('Cloud sync failed (rules):', err);
            openInfoModal('⚠️ 雲端同步失敗', (err.message || '未知錯誤') + '。守則已儲存於本機，請稍後重試。', '☁️');
        }
    }

    async function persistMistakes() {
        SafeStorage.setItem('lab_mistakes', JSON.stringify(mistakes));
        const cloud = await ensureCloudSync();
        if (!cloud) return;
        try {
            await cloud.saveMistakes(mistakes);
        } catch (err) {
            console.error('Cloud sync failed (mistakes):', err);
            openInfoModal('⚠️ 雲端同步失敗', (err.message || '未知錯誤') + '。案例已儲存於本機，請稍後重試。', '☁️');
        }
    }

    async function persistIncidents() {
        const stamped = (incidents || []).map(i => ({
            ...migrateIncidentRecord(i),
            lastUpdated: new Date().toISOString()
        }));
        incidents = stamped;
        SafeStorage.setItem('lab_incidents', JSON.stringify(incidents));
        return pushToCloud('事故紀錄', cloud => cloud.saveIncidents(incidents));
    }

    async function persistBookings() {
        const stamped = (labBookings || []).map(b => ({
            ...migrateBookingRecord(b),
            lastUpdated: new Date().toISOString()
        }));
        labBookings = stamped;
        SafeStorage.setItem('lab_bookings', JSON.stringify(labBookings));
        return pushToCloud('預約記錄', cloud => cloud.saveBookings(labBookings));
    }

    async function persistLabRooms() {
        labRooms = (labRooms || []).map(migrateLabRoomRecord);
        SafeStorage.setItem('lab_rooms', JSON.stringify(labRooms));
        renderLabRoomButtons();
        populateBookingFilterOptions();
        return pushToCloud('實驗室資料', cloud => cloud.saveLabRooms(labRooms));
    }

    async function persistProcedureFiles() {
        procedureDataFiles = (procedureDataFiles || []).map(p => ({
            ...migrateProcedureRecord(p),
            lastUpdated: new Date().toISOString()
        }));
        saveProcedureDataFiles();
        return pushToCloud('實驗程序', cloud => cloud.saveAllProcedures(procedureDataFiles));
    }

    async function clearAllProcedureData() {
        if (!isAdmin) throw new Error('只有管理員可以清空實驗程序資料');
        const cloud = await ensureCloudSync(45000);
        if (!cloud?.clearAllProcedures && !cloud?.saveAllProcedures) {
            throw new Error('雲端同步尚未就緒');
        }
        window._suppressProcedureCloudApply = true;
        try {
            procedureDataFiles = [];
            expandedProcedureIds.clear();
            saveProcedureDataFiles();
            filterProcedureDataFiles();
            if (cloud.clearAllProcedures) {
                await cloud.clearAllProcedures();
            } else {
                await cloud.saveAllProcedures([]);
            }
            window._proceduresLiveSyncReady = true;
            window._procedureCloudBootstrapDone = true;
        } finally {
            window._suppressProcedureCloudApply = false;
        }
    }
    window.clearAllProcedureData = clearAllProcedureData;

    function getSafetyHandbookUrl() {
        if (safetyHandbook?.url) return safetyHandbook.url;
        return SAFETY_HANDBOOK_PDF_URL;
    }

    function formatSafetyHandbookSize(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function renderSafetyHandbookManageInfo() {
        const infoEl = document.getElementById('sh-current-info');
        if (!infoEl) return;
        if (safetyHandbook?.url) {
            infoEl.innerHTML = `
                <p class="font-semibold text-stone-800 mb-1">目前使用雲端版本</p>
                <p class="text-xs"><span class="text-stone-500">檔案：</span>${escapeHtml(safetyHandbook.fileName || '安全手冊.pdf')}</p>
                <p class="text-xs"><span class="text-stone-500">大小：</span>${formatSafetyHandbookSize(safetyHandbook.fileSize)}</p>
                <p class="text-xs"><span class="text-stone-500">更新：</span>${escapeHtml(safetyHandbook.uploadedAt || '—')}</p>
            `;
        } else {
            infoEl.innerHTML = `
                <p class="font-semibold text-stone-800 mb-1">目前使用內建預設手冊</p>
                <p class="text-xs text-stone-500">管理員上傳 PDF 後，將取代內建版本並同步至所有裝置。</p>
            `;
        }
    }

    function openSafetyHandbookManageModal() {
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以管理安全手冊。', '🔒');
            return;
        }
        const form = document.getElementById('safety-handbook-form');
        form?.reset();
        renderSafetyHandbookManageInfo();
        toggleModal('safety-handbook-manage-modal');
    }

    function refreshSafetyHandbookFrame() {
        const url = getSafetyHandbookUrl();
        const viewUrl = toViewableFileUrl(url);
        const openBtn = document.getElementById('safety-handbook-open-btn');
        if (openBtn) {
            openBtn.href = viewUrl || '#';
            openBtn.target = '_blank';
            openBtn.rel = 'noopener';
        }
        const frame = document.getElementById('safety-handbook-frame');
        const pdfjsHost = document.getElementById('safety-handbook-pdfjs');
        const modal = document.getElementById('safety-handbook-modal');
        if (!modal || modal.classList.contains('hidden')) return;
        if (preferPdfJsEmbed() && pdfjsHost) {
            if (frame) {
                frame.classList.add('hidden');
                frame.removeAttribute('src');
            }
            pdfjsHost.classList.remove('hidden');
            embedPdfInContainer(pdfjsHost, url, '實驗室安全手冊.pdf');
            return;
        }
        if (pdfjsHost) pdfjsHost.classList.add('hidden');
        if (frame) {
            frame.classList.remove('hidden');
            frame.src = viewUrl;
        }
    }

    async function persistSafetyHandbook() {
        SafeStorage.setItem('lab_safety_handbook', JSON.stringify(safetyHandbook));
        const cloud = await ensureCloudSync();
        if (!cloud) return;
        try {
            await cloud.saveSafetyHandbook(safetyHandbook);
        } catch (err) {
            console.error('Cloud sync failed (safety handbook):', err);
            openInfoModal('⚠️ 雲端同步失敗', (err.message || '未知錯誤') + '。手冊已儲存於本機，請稍後重試。', '☁️');
        }
    }

    window.applyCloudSafetyHandbook = function(data) {
        if (!data || typeof data !== 'object' || !data.url) return;
        safetyHandbook = data;
        SafeStorage.setItem('lab_safety_handbook', JSON.stringify(safetyHandbook));
        renderSafetyHandbookManageInfo();
        refreshSafetyHandbookFrame();
    };

    window.applyCloudRules = function(cloudList) {
        if (!Array.isArray(cloudList)) return;
        rules = cloudList;
        SafeStorage.setItem('lab_rules', JSON.stringify(rules));
        renderRules();
    };

    window.applyCloudMistakes = function(cloudList) {
        if (!Array.isArray(cloudList)) return;
        mistakes = cloudList;
        SafeStorage.setItem('lab_mistakes', JSON.stringify(mistakes));
        renderMistakes();
    };

    window.applyCloudIncidents = function(cloudList) {
        if (!Array.isArray(cloudList)) return;
        if (window._suppressIncidentCloudApply) return;
        if (!window._incidentsInitComplete) {
            window._deferredCloudIncidentsList = cloudList;
            return;
        }
        // Cloud is authoritative for live sync across devices
        incidents = cloudList.map(migrateIncidentRecord)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
                || String(b.time || '').localeCompare(String(a.time || '')));
        SafeStorage.setItem('lab_incidents', JSON.stringify(incidents));
        populateClassFilter();
        applyAnalyticsFilters();
        populateBookingFilterOptions();
        filterLabBookings();
    };

    window.applyCloudBookings = function(cloudList) {
        if (!Array.isArray(cloudList)) return;
        if (window._suppressBookingCloudApply) return;
        if (!window._bookingsInitComplete) {
            window._deferredCloudBookingsList = cloudList;
            return;
        }
        labBookings = cloudList.map(migrateBookingRecord)
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        SafeStorage.setItem('lab_bookings', JSON.stringify(labBookings));
        populateBookingFilterOptions();
        filterLabBookings();
    };

    window.applyCloudLabRooms = function(cloudList) {
        if (!Array.isArray(cloudList)) return;
        if (window._suppressLabRoomsCloudApply) return;
        if (!window._labRoomsInitComplete) {
            window._deferredCloudLabRoomsList = cloudList;
            return;
        }
        labRooms = mergeLabRoomsCloudWithDefaults(cloudList.map(migrateLabRoomRecord));
        SafeStorage.setItem('lab_rooms', JSON.stringify(labRooms));
        renderLabRoomButtons();
        populateBookingFilterOptions();
    };

    function migrateBookingRecord(item) {
        const rec = { ...item };
        if (!rec.id) rec.id = 'bk_' + Date.now();
        rec.classYear = rec.classYear || '';
        rec.classSubclass = rec.classSubclass || '';
        rec.className = rec.className || rec.class || rec.studentClass
            || `${rec.classYear || ''}${rec.classSubclass || ''}`.trim()
            || '';
        rec.tutorName = rec.tutorName || '';
        rec.tutorNumber = rec.tutorNumber || '';
        rec.tutor = rec.tutor || formatBookingTutorLabel(rec.tutorName, rec.tutorNumber);
        rec.timeslotId = rec.timeslotId || '';
        rec.timeslot = rec.timeslot || (BOOKING_TIMESLOTS.find(t => t.id === rec.timeslotId)?.label || '');
        rec.location = rec.location || '';
        rec.subject = rec.subject || '';
        rec.experiment = rec.experiment || '';
        rec.remarks = rec.remarks || '';
        rec.ipadsNeeded = !!rec.ipadsNeeded;
        rec.sessionType = rec.sessionType === 'non-experimental' ? 'non-experimental' : 'experimental';
        const groups = Number(rec.groupCount);
        rec.groupCount = Number.isFinite(groups) && groups > 0 ? Math.round(groups) : (rec.sessionType === 'experimental' ? null : null);
        rec.status = rec.status === 'approved' || rec.status === 'rejected' ? rec.status : 'pending';
        rec.materials = Array.isArray(rec.materials) ? rec.materials.map(m => ({
            id: m.id || ('bm_' + Math.random().toString(36).slice(2, 8)),
            kind: m.kind === 'reagent' ? 'reagent' : 'equipment',
            name: String(m.name || '').trim(),
            quantity: String(m.quantity || '').trim(),
            unit: String(m.unit || '').trim()
        })).filter(m => m.name) : [];
        rec.attachments = Array.isArray(rec.attachments) ? rec.attachments : [];
        rec.reviewedAt = rec.reviewedAt || '';
        rec.reviewedBy = rec.reviewedBy || '';
        return rec;
    }

    function normalizeBookingStatus(status) {
        if (status === 'approved' || status === 'rejected') return status;
        return 'pending';
    }

    function getBookingStatusLabel(status) {
        return BOOKING_STATUS_LABELS[normalizeBookingStatus(status)] || BOOKING_STATUS_LABELS.pending;
    }

    function getBookingStatusBadgeHtml(status) {
        const key = normalizeBookingStatus(status);
        const textClass = key === 'approved' ? 'text-green-800' : key === 'rejected' ? 'text-red-800' : 'text-blue-800';
        return `<span class="booking-status-pill ${textClass}"><span class="booking-status-dot ${key}"></span><span>${escapeHtml(getBookingStatusLabel(key))}</span></span>`;
    }

    function formatBookingMaterialLine(m) {
        const qty = [m.quantity, m.unit].filter(Boolean).join(' ');
        return qty ? `${m.name} × ${qty}` : m.name;
    }

    function getBookingOverviewHtml(b) {
        const slot = b.timeslot || BOOKING_TIMESLOTS.find(t => t.id === b.timeslotId)?.label || '—';
        const tutor = b.tutor || formatBookingTutorLabel(b.tutorName, b.tutorNumber) || '—';
        const typeLabel = b.sessionType === 'non-experimental' ? '非實驗' : '實驗';
        const typeText = (b.sessionType === 'experimental' && b.groupCount)
            ? `${typeLabel} · ${b.groupCount} 組`
            : typeLabel;
        const materials = Array.isArray(b.materials) ? b.materials : [];
        const equipment = materials.filter(m => m.kind !== 'reagent').map(formatBookingMaterialLine);
        const reagents = materials.filter(m => m.kind === 'reagent').map(formatBookingMaterialLine);
        const attachments = Array.isArray(b.attachments) ? b.attachments : [];
        const attachText = attachments.length
            ? attachments.map(a => a.name || a.fileName || '檔案').join('、')
            : '無';
        const rows = [
            ['日期', b.date || '—'],
            ['時段', slot],
            ['班別', b.className || '—'],
            ['科目', b.subject || '—'],
            ['導師', tutor],
            ['實驗室', b.location || '—'],
            ['類型', typeText],
            ['iPad', b.ipadsNeeded ? '需要借用' : '不需要'],
            ['狀態', getBookingStatusLabel(b.status)],
            ['儀器', equipment.length ? equipment.join('、') : '無'],
            ['試劑', reagents.length ? reagents.join('、') : '無'],
            ['附件', attachText],
            ['備註', b.remarks || '無']
        ];
        return `
            <h4>${escapeHtml(b.experiment || '（未填寫實驗／活動項目）')}</h4>
            <dl>
                ${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}
            </dl>
        `;
    }

    function hideBookingHoverCard() {
        const card = document.getElementById('booking-hover-card');
        if (!card) return;
        card.style.display = 'none';
        card.classList.remove('is-interactive');
        card.innerHTML = '';
    }
    window.hideBookingHoverCard = hideBookingHoverCard;

    function dismissBookingHoverIfPassive() {
        const card = document.getElementById('booking-hover-card');
        if (card && card.classList.contains('is-interactive')) return;
        hideBookingHoverCard();
    }

    function showBookingHoverCard(event, id, options = {}) {
        if (!options.interactive && isCoarsePointerDevice()) return;
        const booking = labBookings.find(b => b.id === id);
        if (!booking) return;
        let card = document.getElementById('booking-hover-card');
        if (!card) {
            card = document.createElement('div');
            card.id = 'booking-hover-card';
            card.className = 'booking-hover-card';
            card.setAttribute('role', 'tooltip');
            document.body.appendChild(card);
        }
        const interactive = !!options.interactive;
        card.classList.toggle('is-interactive', interactive);
        card.innerHTML = getBookingOverviewHtml(booking) + (interactive ? `
            <div class="booking-hover-actions">
                <button type="button" class="booking-hover-close" onclick="hideBookingHoverCard()">關閉</button>
                <button type="button" class="booking-hover-open" onclick="openBookingModal('${id}')">開啟預約</button>
            </div>
        ` : '');
        card.style.display = 'block';
        const pad = 10;
        const anchor = event.currentTarget || event.target;
        const rect = anchor.getBoundingClientRect();
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;
        const cw = card.offsetWidth;
        const ch = card.offsetHeight;
        const spaceRight = vw - rect.right - pad;
        const spaceLeft = rect.left - pad;
        const preferLeft = rect.left > vw * 0.55;
        let left;
        if (preferLeft && spaceLeft >= cw) left = rect.left - cw - pad;
        else if (spaceRight >= cw) left = rect.right + pad;
        else if (spaceLeft >= cw) left = rect.left - cw - pad;
        else left = Math.max(pad, vw - cw - pad);
        let top = rect.top;
        if (top + ch > vh - pad) top = vh - ch - pad;
        if (top < pad) top = pad;
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
    }
    window.showBookingHoverCard = showBookingHoverCard;

    function handleBookingCalendarCardActivate(event, id) {
        if (isCoarsePointerDevice()) {
            event.preventDefault();
            showBookingHoverCard(event, id, { interactive: true });
            return;
        }
        openBookingModal(id);
    }
    window.handleBookingCalendarCardActivate = handleBookingCalendarCardActivate;

    if (!window._bookingHoverCardDismissBound) {
        window._bookingHoverCardDismissBound = true;
        window.addEventListener('scroll', dismissBookingHoverIfPassive, true);
        window.addEventListener('resize', dismissBookingHoverIfPassive);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') hideBookingHoverCard();
        });
        document.addEventListener('click', (e) => {
            const card = document.getElementById('booking-hover-card');
            if (!card || card.style.display === 'none' || !card.classList.contains('is-interactive')) return;
            if (card.contains(e.target)) return;
            if (e.target.closest && e.target.closest('#booking-week-calendar button')) return;
            hideBookingHoverCard();
        }, true);
    }

    function isRegisteredBookingLocation(location) {
        const key = normalizeBookingLocationKey(location);
        return getBookingLabLocations().some(name => normalizeBookingLocationKey(name) === key);
    }

    function getBookingAttachmentFileType(file) {
        const name = (file.name || '').toLowerCase();
        const type = file.type || '';
        if (type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(name)) return 'image';
        if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
        if (type.includes('wordprocessingml') || name.endsWith('.docx')) return 'docx';
        if (type === 'application/msword' || name.endsWith('.doc')) return 'doc';
        if (type.includes('presentationml') || name.endsWith('.pptx')) return 'pptx';
        if (type === 'application/vnd.ms-powerpoint' || name.endsWith('.ppt')) return 'ppt';
        return null;
    }

    function getBookingMaterialSuggestions() {
        return [...new Set((inventories || []).map(v => {
            try { return buildInventoryDisplayName(v); } catch (e) { return v.nameZh || v.name || ''; }
        }).filter(Boolean))];
    }

    function refreshBookingMaterialSuggestions() {
        const list = document.getElementById('booking-material-suggestions');
        if (!list) return;
        list.innerHTML = getBookingMaterialSuggestions()
            .slice(0, 400)
            .map(n => `<option value="${escapeHtml(n)}"></option>`)
            .join('');
    }

    function collectBookingMaterialsFromForm() {
        const rows = Array.from(document.querySelectorAll('#booking-materials-list [data-material-id]'));
        bookingDraftMaterials = rows.map(row => ({
            id: row.getAttribute('data-material-id'),
            kind: row.getAttribute('data-kind') === 'reagent' ? 'reagent' : 'equipment',
            name: row.querySelector('[data-field="name"]')?.value.trim() || '',
            quantity: row.querySelector('[data-field="quantity"]')?.value.trim() || '',
            unit: row.querySelector('[data-field="unit"]')?.value.trim() || ''
        })).filter(m => m.name);
        return bookingDraftMaterials.map(m => ({ ...m }));
    }

    function renderBookingMaterials() {
        const wrap = document.getElementById('booking-materials-list');
        if (!wrap) return;
        if (!bookingDraftMaterials.length) {
            wrap.innerHTML = '<p class="text-[11px] text-stone-400 italic">尚未加入儀器或試劑。</p>';
            return;
        }
        wrap.innerHTML = bookingDraftMaterials.map(m => `
            <div class="grid grid-cols-12 gap-2 items-center" data-material-id="${escapeHtml(m.id)}" data-kind="${m.kind}">
                <span class="col-span-12 sm:col-span-2 text-[10px] font-bold ${m.kind === 'reagent' ? 'text-emerald-700' : 'text-slate-700'}">${m.kind === 'reagent' ? '試劑' : '儀器'}</span>
                <input type="text" data-field="name" list="booking-material-suggestions" value="${escapeHtml(m.name)}" placeholder="名稱" class="col-span-12 sm:col-span-5 border border-stone-300 rounded-lg px-2 py-1.5 text-sm">
                <input type="text" data-field="quantity" value="${escapeHtml(m.quantity)}" placeholder="數量" class="col-span-6 sm:col-span-2 border border-stone-300 rounded-lg px-2 py-1.5 text-sm">
                <input type="text" data-field="unit" value="${escapeHtml(m.unit)}" placeholder="單位" class="col-span-4 sm:col-span-2 border border-stone-300 rounded-lg px-2 py-1.5 text-sm">
                <button type="button" onclick="removeBookingMaterialRow('${m.id}')" class="col-span-2 sm:col-span-1 text-red-500 text-xs font-semibold">移除</button>
            </div>
        `).join('');
    }

    function addBookingMaterialRow(kind) {
        collectBookingMaterialsFromForm();
        bookingDraftMaterials.push({
            id: 'bm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            kind: kind === 'reagent' ? 'reagent' : 'equipment',
            name: '',
            quantity: '',
            unit: ''
        });
        renderBookingMaterials();
    }
    window.addBookingMaterialRow = addBookingMaterialRow;

    function removeBookingMaterialRow(id) {
        collectBookingMaterialsFromForm();
        bookingDraftMaterials = bookingDraftMaterials.filter(m => m.id !== id);
        renderBookingMaterials();
    }
    window.removeBookingMaterialRow = removeBookingMaterialRow;

    function renderBookingAttachments() {
        const wrap = document.getElementById('booking-attachments-list');
        if (!wrap) return;
        if (!bookingDraftAttachments.length) {
            wrap.innerHTML = '<p class="text-[11px] text-stone-400 italic">尚未上傳附件。</p>';
            return;
        }
        wrap.innerHTML = bookingDraftAttachments.map(f => `
            <div class="flex items-center justify-between gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                <span class="text-xs text-stone-700 truncate">${escapeHtml(f.fileName || '附件')}</span>
                <div class="flex gap-2 shrink-0">
                    ${f.url ? `<button type="button" onclick="openBookingDraftAttachment('${f.id}')" class="text-slate-600 text-[10px] font-semibold">開啟</button>` : ''}
                    <button type="button" onclick="removeBookingDraftAttachment('${f.id}')" class="text-red-500 text-[10px] font-semibold">移除</button>
                </div>
            </div>
        `).join('');
    }

    function openBookingDraftAttachment(id) {
        const file = bookingDraftAttachments.find(f => f.id === id);
        if (file?.url) openOrDownloadFile(file.url, file.fileName || 'booking-file');
    }
    window.openBookingDraftAttachment = openBookingDraftAttachment;

    function removeBookingDraftAttachment(id) {
        bookingDraftAttachments = bookingDraftAttachments.filter(f => f.id !== id);
        renderBookingAttachments();
    }
    window.removeBookingDraftAttachment = removeBookingDraftAttachment;

    async function processBookingAttachmentUploads(fileList, existingCount = 0) {
        const files = Array.from(fileList || []);
        if (!files.length) return [];
        if (existingCount + files.length > BOOKING_ATTACHMENT_MAX_FILES) {
            throw new Error(`每筆預約最多 ${BOOKING_ATTACHMENT_MAX_FILES} 個附件。`);
        }
        const cloud = await ensureCloudSync();
        if (!cloud) throw new Error('雲端同步尚未就緒，請稍候數秒後重試。');
        const uploaded = [];
        const uploadedAt = getNowDateValue();
        for (const file of files) {
            const fileType = getBookingAttachmentFileType(file);
            if (!fileType) throw new Error(`「${file.name}」格式不支援。請使用 PDF、Word、PowerPoint 或圖片。`);
            if (file.size > BOOKING_ATTACHMENT_MAX_BYTES) throw new Error(`「${file.name}」超過 20MB 上限。`);
            const result = resolveCloudUploadResult(await cloud.uploadFile(file, 'booking_attachments'));
            if (!result.url) throw new Error(`「${file.name}」上傳失敗。`);
            uploaded.push({
                id: 'ba_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                fileName: file.name,
                fileType,
                mimeType: file.type || 'application/octet-stream',
                fileSize: file.size,
                url: result.url,
                storagePath: result.storagePath || '',
                uploadedAt
            });
        }
        return uploaded;
    }

    async function handleBookingAttachmentUpload(event) {
        const input = event?.target;
        try {
            const uploaded = await processBookingAttachmentUploads(input?.files, bookingDraftAttachments.length);
            bookingDraftAttachments = [...bookingDraftAttachments, ...uploaded];
            renderBookingAttachments();
        } catch (err) {
            openInfoModal('⚠️ 附件上傳失敗', err.message || '請稍後再試。', '📂');
        } finally {
            if (input) input.value = '';
        }
    }
    window.handleBookingAttachmentUpload = handleBookingAttachmentUpload;

    function formatBookingMaterialsSummary(booking) {
        const mats = Array.isArray(booking?.materials) ? booking.materials : [];
        const atts = Array.isArray(booking?.attachments) ? booking.attachments : [];
        const matText = mats.length
            ? mats.slice(0, 3).map(m => `${m.name}${m.quantity ? ` ×${m.quantity}${m.unit ? m.unit : ''}` : ''}`).join('、') + (mats.length > 3 ? '…' : '')
            : '';
        const attText = atts.length ? `${atts.length} 個附件` : '';
        return [matText, attText].filter(Boolean).join(' · ') || '—';
    }

    function updateBookingStatusBanner(status) {
        const banner = document.getElementById('booking-status-banner');
        if (!banner) return;
        const key = normalizeBookingStatus(status);
        banner.classList.remove('hidden', 'bg-blue-50', 'text-blue-800', 'bg-green-50', 'text-green-800', 'bg-red-50', 'text-red-800');
        if (key === 'approved') banner.classList.add('bg-green-50', 'text-green-800');
        else if (key === 'rejected') banner.classList.add('bg-red-50', 'text-red-800');
        else banner.classList.add('bg-blue-50', 'text-blue-800');
        banner.innerHTML = getBookingStatusBadgeHtml(key);
    }

    async function setBookingApprovalStatus(id, status) {
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以審批預約。', '🔒');
            return;
        }
        const idx = labBookings.findIndex(b => b.id === id);
        if (idx === -1) return;
        const next = normalizeBookingStatus(status);
        labBookings[idx] = {
            ...labBookings[idx],
            status: next,
            reviewedAt: getNowDateValue(),
            reviewedBy: 'admin'
        };
        const synced = await persistBookings();
        filterLabBookings();
        openInfoModal(
            next === 'approved' ? '✅ 已核准' : (next === 'rejected' ? '🚫 已拒絕' : '⏳ 已改回待審'),
            synced ? `預約狀態已更新為「${getBookingStatusLabel(next)}」，並同步至 Firebase。` : `預約狀態已更新為「${getBookingStatusLabel(next)}」，雲端同步稍後重試。`,
            '📅'
        );
    }
    window.setBookingApprovalStatus = setBookingApprovalStatus;

    function formatBookingTutorLabel(name, number) {
        const n = String(name || '').trim();
        const num = String(number || '').trim();
        if (n && num) return `${n}（${num}）`;
        return n || num || '';
    }

    function parseBookingTutorLabel(label) {
        const text = String(label || '').trim();
        if (!text) return { tutorName: '', tutorNumber: '' };
        const match = text.match(/^(.+?)[（(]\s*([^）)]+)\s*[）)]$/);
        if (match) return { tutorName: match[1].trim(), tutorNumber: match[2].trim() };
        if (text.includes('/')) {
            const [a, b] = text.split('/').map(s => s.trim());
            return { tutorName: a || '', tutorNumber: b || '' };
        }
        return { tutorName: text, tutorNumber: '' };
    }

    function migrateLabRoomRecord(item) {
        const rec = { ...(item || {}) };
        if (!rec.id) rec.id = 'lab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        rec.name = String(rec.name || '').trim();
        rec.description = rec.description || '';
        rec.photos = Array.isArray(rec.photos) ? rec.photos : [];
        rec.sortOrder = Number.isFinite(Number(rec.sortOrder)) ? Number(rec.sortOrder) : 999;
        rec.isDefault = !!rec.isDefault;
        return rec;
    }

    function mergeLabRoomsCloudWithDefaults(cloudItems) {
        const byId = new Map((cloudItems || []).map(r => [r.id, r]));
        const byName = new Map((cloudItems || []).map(r => [normalizeBookingLocationKey(r.name), r]));
        const merged = DEFAULT_LAB_ROOMS.map(def => {
            const found = byId.get(def.id) || byName.get(normalizeBookingLocationKey(def.name));
            if (!found) return { ...def };
            return {
                ...def,
                ...found,
                id: found.id || def.id,
                name: found.name || def.name,
                description: found.description || def.description,
                photos: Array.isArray(found.photos) ? found.photos : [],
                sortOrder: found.sortOrder ?? def.sortOrder,
                isDefault: true
            };
        });
        const defaultIds = new Set(merged.map(r => r.id));
        const defaultNames = new Set(merged.map(r => normalizeBookingLocationKey(r.name)));
        (cloudItems || []).forEach(r => {
            if (defaultIds.has(r.id) || defaultNames.has(normalizeBookingLocationKey(r.name))) return;
            merged.push(migrateLabRoomRecord(r));
        });
        return merged.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'zh-Hant'));
    }

    function mergeBookingsCloudWithLocal(cloudItems, localItems) {
        const cloudIds = new Set((cloudItems || []).map(b => b.id));
        const merged = (cloudItems || []).map(migrateBookingRecord);
        (localItems || []).forEach(li => {
            if (li?.id && !cloudIds.has(li.id)) merged.push(migrateBookingRecord(li));
        });
        return merged.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    function migrateIncidentRecord(item) {
        const rec = { ...item };
        if (!rec.id) rec.id = 'i_' + Date.now();
        delete rec.studentName;
        return rec;
    }

    const INCIDENT_CLASS_YEARS = ['初一', '初二', '初三', '高一', '高二', '高三'];
    const INCIDENT_CLASS_SUBCLASSES = ['信', '望', '愛', '善', '樂'];

    function formatIncidentClass(year, subclass) {
        return `${year}${subclass}`;
    }

    function parseIncidentClass(value) {
        const text = String(value || '');
        const year = INCIDENT_CLASS_YEARS.find((item) => text.startsWith(item));
        if (!year) return { year: '', subclass: '' };
        const subclass = text.slice(year.length);
        return INCIDENT_CLASS_SUBCLASSES.includes(subclass) ? { year, subclass } : { year: '', subclass: '' };
    }

    function getIncidentClassValue() {
        const year = document.getElementById('incident-class-year')?.value || '';
        const subclass = document.getElementById('incident-class-subclass')?.value || '';
        if (!year || !subclass) return '';
        return formatIncidentClass(year, subclass);
    }

    function setIncidentClassFields(studentClass) {
        const parsed = parseIncidentClass(studentClass);
        const yearEl = document.getElementById('incident-class-year');
        const subclassEl = document.getElementById('incident-class-subclass');
        if (yearEl) yearEl.value = parsed.year;
        if (subclassEl) subclassEl.value = parsed.subclass;
    }

    function formatIncidentStudentLabel(inc) {
        const className = inc.studentClass || '未紀錄';
        const number = inc.classNumber ? `${inc.classNumber}號` : '';
        return [className, number].filter(Boolean).join(' ');
    }

    function isDefaultIncidentSeed(items) {
        if (!Array.isArray(items) || !items.length) return false;
        const defaultIds = new Set(DEFAULT_INCIDENTS.map(i => i.id));
        return items.length === DEFAULT_INCIDENTS.length && items.every(i => defaultIds.has(i.id));
    }

    function isDefaultProcedureSeed(items) {
        if (!Array.isArray(items) || !items.length) return false;
        const defaultIds = new Set(DEFAULT_PROCEDURE_FILES.map(p => p.id));
        return items.length === DEFAULT_PROCEDURE_FILES.length && items.every(p => defaultIds.has(p.id));
    }

    function mergeIncidentsCloudWithLocal(cloudItems, localItems) {
        const cloudIds = new Set((cloudItems || []).map(i => i.id));
        const merged = (cloudItems || []).map(migrateIncidentRecord);
        (localItems || []).forEach(li => {
            if (li?.id && !cloudIds.has(li.id)) merged.push(migrateIncidentRecord(li));
        });
        return merged.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    }

    window.applyCloudProcedures = function(cloudList) {
        if (!Array.isArray(cloudList)) return;
        if (window._suppressProcedureCloudApply) return;
        if (!window._procedureInitComplete) {
            window._deferredCloudProcedureList = cloudList;
            return;
        }
        const cloudItems = cloudList.map(migrateProcedureRecord);
        // Live sync: cloud list is authoritative (deletes propagate).
        // Only keep local attachment caches (dataBase64) for faster AI on this device.
        procedureDataFiles = mergeProcedureCloudAuthoritative(cloudItems, procedureDataFiles);
        saveProcedureDataFiles();
        filterProcedureDataFiles();
    };

    /** Cloud wins for which records exist; preserve local file caches only. */
    function mergeProcedureCloudAuthoritative(cloudItems, localItems) {
        const localById = new Map((localItems || []).map(item => [item.id, item]));
        return (cloudItems || []).map(cloudItem => {
            const localItem = localById.get(cloudItem.id);
            if (!localItem) return cloudItem;
            const files = mergeProcedureFilesCloudWithLocal(
                getProcedureFiles(cloudItem),
                getProcedureFiles(localItem)
            );
            return { ...cloudItem, files };
        });
    }

    function guessProcedureFileMime(file) {
        if (file?.mimeType) return file.mimeType;
        if (file?.fileType === 'pdf') return 'application/pdf';
        if (file?.fileType === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (file?.fileType === 'image') return 'image/jpeg';
        return 'application/octet-stream';
    }

    function base64ToBlob(base64, mimeType) {
        return new Blob([base64ToArrayBuffer(base64)], { type: mimeType || 'application/octet-stream' });
    }

    async function syncProcedureAttachmentsToCloud() {
        const cloud = await ensureCloudSync();
        if (!cloud?.uploadBlob) throw new Error('雲端上傳模組尚未就緒');

        let uploadedCount = 0;
        let changed = false;

        for (let i = 0; i < procedureDataFiles.length; i++) {
            const proc = procedureDataFiles[i];
            let procChanged = false;
            const updatedFiles = [];

            for (const f of getProcedureFiles(proc)) {
                if (f.url || !f.dataBase64) {
                    updatedFiles.push(f);
                    continue;
                }
                const mime = guessProcedureFileMime(f);
                const blob = base64ToBlob(f.dataBase64, mime);
                const fileName = f.fileName || 'procedure-file';
                const result = resolveCloudUploadResult(
                    await cloud.uploadBlob(blob, 'procedure_documents', fileName)
                );
                if (!result.url) throw new Error(`上傳失敗：${fileName}`);
                updatedFiles.push({
                    ...f,
                    url: result.url,
                    storagePath: result.storagePath,
                    dataBase64: f.dataBase64
                });
                uploadedCount++;
                procChanged = true;
            }

            if (procChanged) {
                procedureDataFiles[i] = { ...proc, files: updatedFiles };
                changed = true;
            }
        }

        if (changed) {
            saveProcedureDataFiles();
            filterProcedureDataFiles();
        }

        return { uploadedCount, changed };
    }

    async function runProcedureCloudSync(manual = false) {
        try {
            const result = await syncProcedureAttachmentsToCloud();
            const ok = await persistProcedureFiles();
            if (manual) {
                openInfoModal(
                    ok ? '✅ 同步完成' : '⚠️ 部分同步失敗',
                    result.uploadedCount > 0
                        ? `已上傳 ${result.uploadedCount} 個程序附件至 Firebase，AI 分析與其他裝置現可讀取。`
                        : (ok ? '所有實驗程序與附件已在雲端，無需額外上傳。' : '本機資料已保留，請檢查網路後重試。'),
                    '☁️'
                );
            }
            return result;
        } catch (err) {
            console.error('Procedure cloud sync failed:', err);
            if (manual) {
                openInfoModal('⚠️ 同步失敗', (err.message || '未知錯誤') + '。請檢查網路與 Firebase 設定後重試。', '☁️');
            }
            throw err;
        }
    }
    window.runProcedureCloudSync = runProcedureCloudSync;

    async function bootstrapIncidentsCloudSync() {
        if (window._incidentsCloudBootstrapDone) return;
        const cloud = await ensureCloudSync(45000);
        if (!cloud?.fetchIncidents || !cloud?.saveIncidents) return;
        try {
            window._suppressIncidentCloudApply = true;
            const cloudList = (await cloud.fetchIncidents()).map(migrateIncidentRecord);
            const localMergeBase = isDefaultIncidentSeed(incidents) ? [] : incidents;
            if (!cloudList.length) {
                // Seed cloud once from this device if it has real local data
                if (localMergeBase.length) {
                    incidents = localMergeBase.map(migrateIncidentRecord);
                    SafeStorage.setItem('lab_incidents', JSON.stringify(incidents));
                    await cloud.saveIncidents(incidents);
                }
            } else {
                // Prefer cloud; only upload local-only records once during bootstrap
                incidents = mergeIncidentsCloudWithLocal(cloudList, localMergeBase);
                SafeStorage.setItem('lab_incidents', JSON.stringify(incidents));
                populateClassFilter();
                applyAnalyticsFilters();
                const cloudIds = new Set(cloudList.map(i => i.id));
                if (incidents.some(i => !cloudIds.has(i.id))) {
                    await cloud.saveIncidents(incidents);
                }
            }
            window._incidentsLiveSyncReady = true;
        } catch (err) {
            console.error('Incidents cloud bootstrap failed:', err);
        } finally {
            window._suppressIncidentCloudApply = false;
            window._incidentsCloudBootstrapDone = true;
        }
    }

    async function bootstrapProcedureCloudSync() {
        if (window._procedureCloudBootstrapDone) return;
        const cloud = await ensureCloudSync(45000);
        if (!cloud?.saveAllProcedures) return;
        try {
            window._suppressProcedureCloudApply = true;
            await syncProcedureAttachmentsToCloud();
            const cloudList = (await (cloud.fetchProcedures?.() || Promise.resolve([]))).map(migrateProcedureRecord);
            const localMergeBase = isDefaultProcedureSeed(procedureDataFiles) ? [] : procedureDataFiles;
            const intentionallyEmpty = !!(await cloud.fetchProcedureMeta?.())?.intentionallyEmpty;
            if (!cloudList.length) {
                if (intentionallyEmpty) {
                    // Cloud was intentionally cleared — keep empty and do not re-seed from local cache
                    procedureDataFiles = [];
                    saveProcedureDataFiles();
                    filterProcedureDataFiles();
                } else if (localMergeBase.length) {
                    procedureDataFiles = localMergeBase.map(migrateProcedureRecord);
                    saveProcedureDataFiles();
                    await cloud.saveAllProcedures(procedureDataFiles);
                }
            } else {
                procedureDataFiles = mergeProcedureCloudWithLocal(cloudList, localMergeBase);
                saveProcedureDataFiles();
                filterProcedureDataFiles();
                const cloudIds = new Set(cloudList.map(p => p.id));
                if (procedureDataFiles.some(p => !cloudIds.has(p.id))) {
                    await cloud.saveAllProcedures(procedureDataFiles);
                }
            }
            window._proceduresLiveSyncReady = true;
        } catch (err) {
            console.error('Procedure cloud bootstrap failed:', err);
        } finally {
            window._suppressProcedureCloudApply = false;
            window._procedureCloudBootstrapDone = true;
        }
    }

    async function bootstrapLabCloudSync() {
        await Promise.all([
            bootstrapIncidentsCloudSync(),
            bootstrapProcedureCloudSync(),
            bootstrapBookingsCloudSync(),
            bootstrapLabRoomsCloudSync()
        ]);
    }

    async function bootstrapLabRoomsCloudSync() {
        if (window._labRoomsCloudBootstrapDone) return;
        const cloud = await ensureCloudSync(45000);
        if (!cloud?.fetchLabRooms || !cloud?.saveLabRooms) return;
        try {
            window._suppressLabRoomsCloudApply = true;
            const cloudList = (await cloud.fetchLabRooms()).map(migrateLabRoomRecord);
            if (!cloudList.length) {
                if (labRooms.length) {
                    await cloud.saveLabRooms(labRooms);
                }
            } else {
                labRooms = mergeLabRoomsCloudWithDefaults(cloudList);
                SafeStorage.setItem('lab_rooms', JSON.stringify(labRooms));
                renderLabRoomButtons();
                populateBookingFilterOptions();
                await cloud.saveLabRooms(labRooms);
            }
        } catch (err) {
            console.error('Lab rooms cloud bootstrap failed:', err);
        } finally {
            window._suppressLabRoomsCloudApply = false;
            window._labRoomsCloudBootstrapDone = true;
        }
    }

    async function bootstrapBookingsCloudSync() {
        if (window._bookingsCloudBootstrapDone) return;
        const cloud = await ensureCloudSync();
        if (!cloud?.fetchBookings || !cloud?.saveBookings) return;
        try {
            window._suppressBookingCloudApply = true;
            const cloudList = (await cloud.fetchBookings()).map(migrateBookingRecord);
            if (!cloudList.length) {
                if (labBookings.length) {
                    await cloud.saveBookings(labBookings);
                }
            } else {
                labBookings = mergeBookingsCloudWithLocal(cloudList, labBookings);
                SafeStorage.setItem('lab_bookings', JSON.stringify(labBookings));
                populateBookingFilterOptions();
                filterLabBookings();
                const cloudIds = new Set(cloudList.map(b => b.id));
                const hasLocalOnly = labBookings.some(b => !cloudIds.has(b.id));
                if (hasLocalOnly || labBookings.length !== cloudList.length) {
                    await cloud.saveBookings(labBookings);
                }
            }
        } catch (err) {
            console.error('Bookings cloud bootstrap failed:', err);
        } finally {
            window._suppressBookingCloudApply = false;
            window._bookingsCloudBootstrapDone = true;
        }
    }

    function saveProcedureDataFiles() {
        SafeStorage.setItem('lab_procedure_files', JSON.stringify(procedureDataFiles));
        SafeStorage.setItem('lab_procedure_files_version', PROCEDURE_DATA_VERSION);
    }

    function normalizeInventoryMatchText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function getInventoryAttachmentKey(item) {
        return [item.location, item.nameEn, item.nameZh, item.name, item.quantity]
            .filter(Boolean)
            .map(normalizeInventoryMatchText)
            .join('|');
    }

    function getInventoryLocationNameKey(item) {
        return [item.location, item.nameZh, item.name, item.nameEn]
            .filter(Boolean)
            .map(normalizeInventoryMatchText)
            .join('|');
    }

    function copyInventoryItemAttachments(target, source) {
        if (!source) return target;
        const rec = { ...target };
        if (Array.isArray(source.msds) && source.msds.length) rec.msds = source.msds;
        if (Array.isArray(source.photos) && source.photos.length) rec.photos = source.photos;
        return rec;
    }

    function indexInventoryAttachments(items) {
        const byId = new Map();
        const byLocationName = new Map();
        const byAttachmentKey = new Map();
        (items || []).forEach(item => {
            if (!item?.msds?.length && !item?.photos?.length) return;
            const bundle = { msds: item.msds || [], photos: item.photos || [] };
            const idKey = normalizeInventoryMatchText(item.id);
            if (idKey) byId.set(idKey, bundle);
            const locationNameKey = getInventoryLocationNameKey(item);
            if (locationNameKey) byLocationName.set(locationNameKey, bundle);
            byAttachmentKey.set(getInventoryAttachmentKey(item), bundle);
        });
        return { byId, byLocationName, byAttachmentKey };
    }

    function findInventoryAttachmentBundle(item, indexes) {
        const idKey = normalizeInventoryMatchText(item.id);
        if (idKey && indexes.byId.has(idKey)) return indexes.byId.get(idKey);
        const locationNameKey = getInventoryLocationNameKey(item);
        if (locationNameKey && indexes.byLocationName.has(locationNameKey)) {
            return indexes.byLocationName.get(locationNameKey);
        }
        return indexes.byAttachmentKey.get(getInventoryAttachmentKey(item)) || null;
    }

    function mergeInventoryAttachmentsFromPrevious(nextItems, previousItems) {
        const indexes = indexInventoryAttachments(previousItems);
        return nextItems.map(item => {
            const saved = findInventoryAttachmentBundle(item, indexes);
            return saved ? copyInventoryItemAttachments(item, saved) : item;
        });
    }

    function normalizeStorageUrl(url) {
        if (!url) return '';
        try {
            const match = url.match(/\/o\/([^?]+)/);
            if (match) return decodeURIComponent(match[1]).toLowerCase();
        } catch (_) {}
        return String(url).split('?')[0].toLowerCase();
    }

    function mergeAttachmentFilesByUrl(localFiles, remoteFiles) {
        const merged = Array.isArray(localFiles) ? [...localFiles] : [];
        const seen = new Set(merged.map(f => normalizeStorageUrl(f?.url)).filter(Boolean));
        (remoteFiles || []).forEach(file => {
            const key = normalizeStorageUrl(file?.url);
            if (!key || seen.has(key)) return;
            merged.push(file);
            seen.add(key);
        });
        return merged;
    }

    function mergeProcedureAttachmentsFromPrevious(nextItems, previousItems) {
        const byId = new Map();
        const byTitle = new Map();
        (previousItems || []).forEach(item => {
            const files = getProcedureFiles(item);
            if (!files.length) return;
            if (item.id) byId.set(item.id, files);
            const titleKey = normalizeInventoryMatchText(item.title);
            if (titleKey) byTitle.set(titleKey, files);
        });
        return (nextItems || []).map(item => {
            const existing = getProcedureFiles(item);
            const remote = byId.get(item.id) || byTitle.get(normalizeInventoryMatchText(item.title));
            if (!remote?.length) return item;
            return { ...item, files: mergeAttachmentFilesByUrl(existing, remote) };
        });
    }

    /** Cloud is authoritative; only keep local files not yet uploaded (base64, no url). */
    function mergeProcedureFilesCloudWithLocal(cloudFiles, localFiles) {
        const localById = new Map((localFiles || []).map(f => [f.id, f]));
        return (cloudFiles || []).map(cf => {
            const lf = localById.get(cf.id);
            if (!lf) return cf;
            return {
                ...cf,
                ...(lf.dataBase64 && !cf.dataBase64 ? { dataBase64: lf.dataBase64 } : {}),
                ...(lf.storagePath && !cf.storagePath ? { storagePath: lf.storagePath } : {})
            };
        });
    }

    function mergeProcedureCloudWithLocal(cloudItems, localItems) {
        const localById = new Map((localItems || []).map(item => [item.id, item]));
        const merged = [];
        const seenIds = new Set();

        (cloudItems || []).forEach(cloudItem => {
            const localItem = localById.get(cloudItem.id);
            let item = cloudItem;
            if (localItem) {
                let files = mergeProcedureFilesCloudWithLocal(getProcedureFiles(cloudItem), getProcedureFiles(localItem));
                const pendingLocalFiles = getProcedureFiles(localItem).filter(f => f?.dataBase64 && !f?.url);
                if (pendingLocalFiles.length) {
                    files = mergeAttachmentFilesByUrl(files, pendingLocalFiles);
                }
                item = {
                    ...cloudItem,
                    files,
                    steps: (cloudItem.steps?.length ? cloudItem.steps : localItem.steps) || [],
                    notes: (cloudItem.notes?.trim() ? cloudItem.notes : localItem.notes) || cloudItem.notes || ''
                };
            }
            merged.push(item);
            seenIds.add(cloudItem.id);
        });

        (localItems || []).forEach(localItem => {
            if (!seenIds.has(localItem.id)) merged.push(localItem);
        });

        return merged;
    }

    function formatRecoveryDate(value) {
        if (!value) {
            const now = new Date();
            return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        }
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return formatRecoveryDate();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function decodeStorageFileName(rawName) {
        const stripped = String(rawName || '').replace(/^\d+_/, '');
        try {
            return decodeURIComponent(stripped);
        } catch (_) {
            return stripped;
        }
    }

    function inferAttachmentFileType(fileName, contentType, fallback = 'pdf') {
        const name = String(fileName || '').toLowerCase();
        const type = String(contentType || '').toLowerCase();
        if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(name)) return 'image';
        if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
        if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
        return fallback;
    }

    function buildAttachmentFromStorageFile(file, idPrefix, fallbackType = 'pdf') {
        const fileName = file.fileName || decodeStorageFileName(file.rawName);
        const fileType = inferAttachmentFileType(fileName, file.contentType, fallbackType);
        return {
            id: `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            fileName,
            fileType,
            mimeType: file.contentType || (fileType === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
            fileSize: file.size || 0,
            url: file.url,
            storagePath: file.storagePath || null,
            uploadedAt: formatRecoveryDate(file.timeCreated)
        };
    }

    function collectKnownAttachmentUrls(targetSet) {
        inventories.forEach(item => {
            (item.msds || []).forEach(f => {
                const key = normalizeStorageUrl(f?.url);
                if (key) targetSet.add(key);
            });
            (item.photos || []).forEach(f => {
                const key = normalizeStorageUrl(f?.url);
                if (key) targetSet.add(key);
            });
        });
        procedureDataFiles.forEach(item => {
            getProcedureFiles(item).forEach(f => {
                const key = normalizeStorageUrl(f?.url);
                if (key) targetSet.add(key);
            });
        });
        if (safetyHandbook?.url) {
            const key = normalizeStorageUrl(safetyHandbook.url);
            if (key) targetSet.add(key);
        }
        if (prepGuide?.url) {
            const key = normalizeStorageUrl(prepGuide.url);
            if (key) targetSet.add(key);
        }
    }

    function scoreInventoryFileMatch(item, fileName) {
        if (!supportsInventoryMsds(item.category) && inferAttachmentFileType(fileName, '', 'image') !== 'image') {
            return 0;
        }
        const normalizedFile = normalizeInventoryMatchText(fileName.replace(/\.[^.]+$/, ''));
        if (!normalizedFile) return 0;
        const terms = [item.nameEn, item.nameZh, item.name, item.formula]
            .filter(term => term && term !== '—')
            .map(normalizeInventoryMatchText);
        let score = 0;
        terms.forEach(term => {
            if (!term || term.length < 2) return;
            if (normalizedFile.includes(term) || term.includes(normalizedFile)) score += term.length;
            term.split(/[\s/／,，、+]+/).filter(part => part.length >= 2).forEach(part => {
                if (normalizedFile.includes(part)) score += part.length * 0.6;
            });
        });
        return score;
    }

    function findBestInventoryMatchForFile(file, kind) {
        const fileName = file.fileName || decodeStorageFileName(file.rawName);
        let best = null;
        let bestScore = kind === 'photo' ? 3 : 4;
        inventories.forEach(item => {
            if (kind === 'msds' && !supportsInventoryMsds(item.category)) return;
            const score = scoreInventoryFileMatch(item, fileName);
            if (score > bestScore) {
                bestScore = score;
                best = item;
            }
        });
        return best;
    }

    function scoreProcedureFileMatch(proc, fileName) {
        const normalizedFile = normalizeInventoryMatchText(fileName.replace(/\.[^.]+$/, ''));
        const title = normalizeInventoryMatchText(proc.title);
        if (!normalizedFile || !title) return 0;
        if (normalizedFile.includes(title) || title.includes(normalizedFile)) return title.length * 2;
        let score = 0;
        title.split(/[\s/／,，、+_-]+/).filter(part => part.length >= 2).forEach(part => {
            if (normalizedFile.includes(part)) score += part.length;
        });
        return score;
    }

    function findBestProcedureMatchForFile(file) {
        const fileName = file.fileName || decodeStorageFileName(file.rawName);
        let best = null;
        let bestScore = 4;
        procedureDataFiles.forEach(proc => {
            const score = scoreProcedureFileMatch(proc, fileName);
            if (score > bestScore) {
                bestScore = score;
                best = proc;
            }
        });
        return best;
    }

    function attachInventoryStorageFile(item, file, kind) {
        const maxFiles = kind === 'msds' ? INVENTORY_MSDS_MAX_FILES : INVENTORY_PHOTO_MAX_FILES;
        const field = kind === 'msds' ? 'msds' : 'photos';
        const idPrefix = kind === 'msds' ? 'msds' : 'photo';
        const fallbackType = kind === 'msds' ? 'pdf' : 'image';
        const current = Array.isArray(item[field]) ? item[field] : [];
        if (current.length >= maxFiles) return false;
        const attachment = buildAttachmentFromStorageFile(file, idPrefix, fallbackType);
        item[field] = [...current, attachment];
        return true;
    }

    function attachProcedureStorageFile(proc, file) {
        const current = getProcedureFiles(proc);
        if (current.length >= PROCEDURE_DATA_MAX_FILES_PER_RECORD) return false;
        const attachment = buildAttachmentFromStorageFile(file, 'file', inferAttachmentFileType(file.fileName, file.contentType, 'pdf'));
        proc.files = [...current, attachment];
        return true;
    }

    function createProcedureFromStorageFile(file) {
        const fileName = file.fileName || decodeStorageFileName(file.rawName);
        const title = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || '未命名實驗程序';
        const attachment = buildAttachmentFromStorageFile(file, 'file', inferAttachmentFileType(fileName, file.contentType, 'pdf'));
        return {
            id: 'proc_rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            title,
            subject: '其他',
            grade: '—',
            labRoom: '—',
            equipment: [],
            reagents: [],
            notes: '由雲端附件恢復工具自動建立。',
            uploadedAt: formatRecoveryDate(file.timeCreated),
            files: [attachment]
        };
    }

    window.applyAttachmentRecovery = async function(payload) {
        const storageFiles = payload?.storageFiles || {};
        const cloudInventories = (payload?.cloudInventories || []).map(migrateInventoryItem);
        const cloudProcedures = (payload?.cloudProcedures || []).map(migrateProcedureRecord);
        const cloudHandbook = payload?.cloudHandbook || null;
        const cloudPrepGuide = payload?.cloudPrepGuide || null;
        const stats = {
            msdsLinked: 0,
            photosLinked: 0,
            proceduresLinked: 0,
            proceduresCreated: 0,
            handbookLinked: 0,
            prepGuideLinked: 0,
            cloudMerged: 0,
            unmatched: []
        };

        inventories = mergeInventoryAttachmentsFromPrevious(inventories, cloudInventories);
        procedureDataFiles = mergeProcedureAttachmentsFromPrevious(procedureDataFiles, cloudProcedures);
        if (cloudHandbook?.url) {
            safetyHandbook = { ...safetyHandbook, ...cloudHandbook };
            stats.cloudMerged++;
        }
        if (payload?.cloudPrepGuide?.url) {
            prepGuide = { ...prepGuide, ...payload.cloudPrepGuide };
            stats.cloudMerged++;
        }

        const knownUrls = new Set();
        collectKnownAttachmentUrls(knownUrls);

        (storageFiles.msds_files || []).forEach(file => {
            const key = normalizeStorageUrl(file.url);
            if (!key || knownUrls.has(key)) return;
            const item = findBestInventoryMatchForFile(file, 'msds');
            if (item && attachInventoryStorageFile(item, file, 'msds')) {
                knownUrls.add(key);
                stats.msdsLinked++;
            } else {
                stats.unmatched.push({ kind: 'MSDS', name: file.fileName || file.rawName });
            }
        });

        (storageFiles.inventory_photos || []).forEach(file => {
            const key = normalizeStorageUrl(file.url);
            if (!key || knownUrls.has(key)) return;
            const item = findBestInventoryMatchForFile(file, 'photo');
            if (item && attachInventoryStorageFile(item, file, 'photo')) {
                knownUrls.add(key);
                stats.photosLinked++;
            } else {
                stats.unmatched.push({ kind: '照片', name: file.fileName || file.rawName });
            }
        });

        (storageFiles.procedure_documents || []).forEach(file => {
            const key = normalizeStorageUrl(file.url);
            if (!key || knownUrls.has(key)) return;
            const proc = findBestProcedureMatchForFile(file);
            if (proc && attachProcedureStorageFile(proc, file)) {
                knownUrls.add(key);
                stats.proceduresLinked++;
                return;
            }
            const created = createProcedureFromStorageFile(file);
            procedureDataFiles.push(created);
            knownUrls.add(key);
            stats.proceduresCreated++;
        });

        if (!safetyHandbook?.url) {
            const handbookFiles = (storageFiles.safety_handbook || [])
                .filter(file => inferAttachmentFileType(file.fileName || file.rawName, file.contentType, 'pdf') === 'pdf');
            if (handbookFiles.length) {
                const latest = handbookFiles.sort((a, b) => new Date(b.timeCreated || 0) - new Date(a.timeCreated || 0))[0];
                safetyHandbook = {
                    url: latest.url,
                    fileName: latest.fileName || decodeStorageFileName(latest.rawName),
                    fileSize: latest.size || 0,
                    mimeType: 'application/pdf',
                    uploadedAt: formatRecoveryDate(latest.timeCreated)
                };
                stats.handbookLinked++;
            }
        }

        if (!prepGuide?.url) {
            const prepGuideFiles = (storageFiles.prep_guide || [])
                .filter(file => {
                    const name = file.fileName || file.rawName || '';
                    const type = inferAttachmentFileType(name, file.contentType, 'docx');
                    return type === 'pdf' || type === 'docx';
                });
            if (prepGuideFiles.length) {
                const latest = prepGuideFiles.sort((a, b) => new Date(b.timeCreated || 0) - new Date(a.timeCreated || 0))[0];
                const fileName = latest.fileName || decodeStorageFileName(latest.rawName);
                const fileType = inferAttachmentFileType(fileName, latest.contentType, 'docx');
                prepGuide = {
                    url: latest.url,
                    fileName,
                    fileSize: latest.size || 0,
                    mimeType: fileType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    uploadedAt: formatRecoveryDate(latest.timeCreated)
                };
                stats.prepGuideLinked++;
            }
        }

        SafeStorage.setItem('lab_inventories', JSON.stringify(inventories));
        saveProcedureDataFiles();
        if (safetyHandbook) SafeStorage.setItem('lab_safety_handbook', JSON.stringify(safetyHandbook));
        if (prepGuide) SafeStorage.setItem('lab_prep_guide', JSON.stringify(prepGuide));

        await persistInventories();
        await persistProcedureFiles();
        if (safetyHandbook?.url) await persistSafetyHandbook();
        if (prepGuide?.url) await persistPrepGuide();

        renderInventoryTable();
        filterProcedureDataFiles();
        renderSafetyHandbookManageInfo();
        refreshSafetyHandbookFrame();
        renderPrepGuideManageInfo();

        return stats;
    };

    function openCloudRecoverModal() {
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以使用雲端附件恢復工具。', '🔒');
            return;
        }
        const statusEl = document.getElementById('cloud-recover-status');
        const progressEl = document.getElementById('cloud-recover-progress');
        const runBtn = document.getElementById('cloud-recover-run-btn');
        if (statusEl) {
            statusEl.classList.add('hidden');
            statusEl.innerHTML = '';
        }
        if (progressEl) progressEl.classList.add('hidden');
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = '開始恢復';
        }
        showModal('cloud-recover-modal');
    }

    async function runCloudAttachmentRecovery() {
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以使用雲端附件恢復工具。', '🔒');
            return;
        }
        const cloud = await ensureCloudSync();
        if (!cloud?.recoverAllAttachments) {
            openInfoModal('⚠️ 雲端尚未就緒', 'Firebase 同步模組尚未載入，請稍候數秒後重試。', '☁️');
            return;
        }

        const statusEl = document.getElementById('cloud-recover-status');
        const progressEl = document.getElementById('cloud-recover-progress');
        const runBtn = document.getElementById('cloud-recover-run-btn');
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.textContent = '恢復中...';
        }
        if (statusEl) statusEl.classList.add('hidden');
        if (progressEl) progressEl.classList.remove('hidden');

        try {
            const stats = await cloud.recoverAllAttachments();
            const unmatchedList = (stats.unmatched || []).slice(0, 12)
                .map(item => `<li>${escapeHtml(item.kind)}：${escapeHtml(item.name)}</li>`)
                .join('');
            const unmatchedMore = (stats.unmatched || []).length > 12
                ? `<p class="text-xs text-stone-500 mt-2">另有 ${stats.unmatched.length - 12} 個檔案未能自動配對。</p>`
                : '';

            if (statusEl) {
                statusEl.classList.remove('hidden');
                statusEl.innerHTML = `
                    <p class="font-semibold text-emerald-800 mb-2">✅ 恢復完成並已同步至雲端</p>
                    <ul class="space-y-1 text-stone-700">
                        <li>MSDS 重新連結：<strong>${stats.msdsLinked}</strong> 個</li>
                        <li>庫存照片重新連結：<strong>${stats.photosLinked}</strong> 個</li>
                        <li>實驗程序文件連結：<strong>${stats.proceduresLinked}</strong> 個</li>
                        <li>自動建立程序記錄：<strong>${stats.proceduresCreated}</strong> 筆</li>
                        <li>安全手冊恢復：<strong>${stats.handbookLinked}</strong> 份</li>
                        <li>備課指引恢復：<strong>${stats.prepGuideLinked}</strong> 份</li>
                    </ul>
                    ${unmatchedList ? `<div class="mt-3 border-t border-stone-200 pt-3"><p class="text-xs font-semibold text-amber-800 mb-1">未能自動配對的檔案</p><ul class="text-xs text-stone-600 list-disc pl-4 space-y-0.5">${unmatchedList}</ul>${unmatchedMore}</div>` : ''}
                `;
            }
        } catch (err) {
            if (statusEl) {
                statusEl.classList.remove('hidden');
                statusEl.innerHTML = `<p class="text-red-600 font-semibold">❌ 恢復失敗：${escapeHtml(err.message || '未知錯誤')}</p>`;
            }
        } finally {
            if (progressEl) progressEl.classList.add('hidden');
            if (runBtn) {
                runBtn.disabled = false;
                runBtn.textContent = '再次執行';
            }
        }
    }

    function initStorage() {
        if (!SafeStorage.getItem('lab_rules')) {
            SafeStorage.setItem('lab_rules', JSON.stringify(DEFAULT_RULES));
        }
        if (!SafeStorage.getItem('lab_mistakes')) {
            SafeStorage.setItem('lab_mistakes', JSON.stringify(DEFAULT_MISTAKES));
        }
        if (!SafeStorage.getItem('lab_inventories')) {
            SafeStorage.setItem('lab_inventories', JSON.stringify(DEFAULT_INVENTORIES.map(migrateInventoryItem)));
            SafeStorage.setItem('lab_inventories_version', INVENTORY_DATA_VERSION);
        } else if (SafeStorage.getItem('lab_inventories_version') !== INVENTORY_DATA_VERSION) {
            const previousItems = JSON.parse(SafeStorage.getItem('lab_inventories') || '[]');
            const refreshed = mergeInventoryAttachmentsFromPrevious(
                DEFAULT_INVENTORIES.map(migrateInventoryItem),
                previousItems.map(migrateInventoryItem)
            );
            SafeStorage.setItem('lab_inventories', JSON.stringify(refreshed));
            SafeStorage.setItem('lab_inventories_version', INVENTORY_DATA_VERSION);
            window._pendingInventoryCloudMerge = true;
        }
        if (!SafeStorage.getItem('lab_incidents')) {
            SafeStorage.setItem('lab_incidents', JSON.stringify(DEFAULT_INCIDENTS));
        }
        if (!SafeStorage.getItem('lab_procedure_files') || SafeStorage.getItem('lab_procedure_files_version') !== PROCEDURE_DATA_VERSION) {
            const existing = SafeStorage.getItem('lab_procedure_files');
            if (existing) {
                procedureDataFiles = JSON.parse(existing).map(migrateProcedureRecord);
            } else {
                procedureDataFiles = JSON.parse(JSON.stringify(DEFAULT_PROCEDURE_FILES));
            }
            saveProcedureDataFiles();
        } else {
            procedureDataFiles = JSON.parse(SafeStorage.getItem('lab_procedure_files')).map(migrateProcedureRecord);
        }

        const storedHandbook = SafeStorage.getItem('lab_safety_handbook');
        if (storedHandbook) {
            try {
                safetyHandbook = JSON.parse(storedHandbook);
            } catch (_) {
                safetyHandbook = null;
            }
        }

        const storedPrepGuide = SafeStorage.getItem('lab_prep_guide');
        if (storedPrepGuide) {
            try {
                prepGuide = JSON.parse(storedPrepGuide);
            } catch (_) {
                prepGuide = null;
            }
        }

        rules = JSON.parse(SafeStorage.getItem('lab_rules'));
        mistakes = JSON.parse(SafeStorage.getItem('lab_mistakes'));
        inventories = JSON.parse(SafeStorage.getItem('lab_inventories')).map(migrateInventoryItem);
        incidents = JSON.parse(SafeStorage.getItem('lab_incidents')).map(migrateIncidentRecord);
        if (!SafeStorage.getItem('lab_bookings')) {
            SafeStorage.setItem('lab_bookings', JSON.stringify([]));
        }
        labBookings = JSON.parse(SafeStorage.getItem('lab_bookings')).map(migrateBookingRecord);
        filteredLabBookings = [...labBookings];
        if (!SafeStorage.getItem('lab_rooms')) {
            SafeStorage.setItem('lab_rooms', JSON.stringify(DEFAULT_LAB_ROOMS));
        }
        labRooms = mergeLabRoomsCloudWithDefaults(
            JSON.parse(SafeStorage.getItem('lab_rooms') || '[]').map(migrateLabRoomRecord)
        );
        SafeStorage.setItem('lab_rooms', JSON.stringify(labRooms));
        filteredProcedureDataFiles = [...procedureDataFiles];
        window._inventoryInitComplete = true;
        window._procedureInitComplete = true;
        window._incidentsInitComplete = true;
        window._bookingsInitComplete = true;
        window._labRoomsInitComplete = true;
    }

    // ================= 分頁切換行為 =================
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = document.querySelectorAll('.content-section');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.tagName === 'A') return;
            const targetId = tab.getAttribute('data-target');
            const section = targetId ? document.getElementById(targetId) : null;
            if (!section) return;
            tabs.forEach(t => {
                t.classList.remove('active-tab', 'border-cyan-400', 'text-cyan-300', 'border-amber-600', 'text-amber-700', 'text-stone-500');
            });

            tab.classList.add('active-tab');
            sections.forEach(s => s.classList.add('hidden'));
            section.classList.remove('hidden');
            refreshActiveTabStyle();
        });
    });

    function switchToTab(targetId) {
        const tab = document.querySelector(`.tab-btn[data-target="${targetId}"]`);
        if (tab) {
            tab.click();
            return;
        }
        sections.forEach(s => s.classList.add('hidden'));
        const section = document.getElementById(targetId);
        if (section) section.classList.remove('hidden');
    }

    // ================= 實驗程序資料庫 =================
    const PROCEDURE_DATA_MAX_IMAGE_BYTES = 4 * 1024 * 1024;
    const PROCEDURE_DATA_MAX_DOC_BYTES = 2 * 1024 * 1024;
    const PROCEDURE_DATA_MAX_FILES_PER_RECORD = 8;
    const DEFAULT_PROCEDURE_SUBJECTS = ['化學', '物理', '生物', '綜合科學'];
    let expandedProcedureIds = new Set();

    function getProcedureSubjects() {
        const fromData = procedureDataFiles.map(p => p.subject).filter(Boolean);
        return [...new Set([...DEFAULT_PROCEDURE_SUBJECTS, ...fromData])].sort();
    }

    function populateProcedureSubjectSelect(selected = '') {
        populateComboSelect(
            'pd-subject-select',
            'pd-subject-custom',
            getProcedureSubjects(),
            selected,
            '— 選擇科目 —',
            '✏️ 手動輸入新科目...'
        );
    }

    function handleProcedureSubjectSelectChange() {
        handleComboSelectChange('pd-subject-select', 'pd-subject-custom');
    }

    function getProcedureSubjectValue() {
        return getComboSelectValue('pd-subject-select', 'pd-subject-custom');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function parseLinesToList(text) {
        return (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }

    function listToLines(arr) {
        return (arr || []).join('\n');
    }

    function getProcedureFileUrl(file) {
        if (!file) return null;
        if (file.url) return file.url;
        if (file.dataBase64) {
            const mime = file.mimeType || 'application/octet-stream';
            return `data:${mime};base64,${file.dataBase64}`;
        }
        return null;
    }

    function isFirebaseStorageUrl(url) {
        return /firebasestorage\.googleapis\.com|firebasestorage\.app/i.test(String(url || ''));
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('無法讀取圖片資料。'));
            reader.readAsDataURL(blob);
        });
    }

    async function downloadProcedureFileBytes(file) {
        const label = file?.fileName || file?.name || '檔案';
        if (file?.dataBase64) {
            return base64ToArrayBuffer(file.dataBase64);
        }
        if (!file?.url) {
            throw new Error(`找不到「${label}」內容。`);
        }
        if (file.url.startsWith('data:')) {
            const base64 = file.url.split(',')[1];
            if (!base64) throw new Error(`無法解析「${label}」資料。`);
            return base64ToArrayBuffer(base64);
        }
        if (isFirebaseStorageUrl(file.url)) {
            const cloud = await ensureCloudSync(45000);
            if (!cloud?.downloadFileBytes) {
                const initError = window.CloudSync?.initError;
                throw new Error(
                    initError
                        ? `雲端模組載入失敗：${initError}。請重新整理頁面後再試。`
                        : '雲端下載模組尚未就緒，請稍候數秒後重新整理頁面再試。'
                );
            }
            try {
                return await cloud.downloadFileBytes(file.url, file.storagePath || null);
            } catch (err) {
                throw new Error(`無法下載「${label}」：${err.message || '請檢查網路連線'}`);
            }
        }
        try {
            const resp = await fetch(file.url, { method: 'GET', cache: 'no-store' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.arrayBuffer();
        } catch (err) {
            throw new Error(`無法下載「${label}」：${err.message === 'Failed to fetch' ? '網路或跨域限制，請稍後重試' : (err.message || '下載失敗')}`);
        }
    }

    async function downloadProcedureImageDataUrl(file) {
        const arrayBuffer = await downloadProcedureFileBytes(file);
        const mime = file.mimeType || 'image/jpeg';
        return blobToDataUrl(new Blob([arrayBuffer], { type: mime }));
    }

    function getProcedureFiles(item) {
        return Array.isArray(item?.files) ? item.files : [];
    }

    function formatProcedureFileSize(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function getProcedureDataFileType(file) {
        const name = (file.name || '').toLowerCase();
        if (file.type.startsWith('image/')) return 'image';
        if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
        if (file.type === 'application/msword' || name.endsWith('.doc')) return 'doc';
        return null;
    }

    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    function readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                const base64 = result.includes(',') ? result.split(',')[1] : result;
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('無法讀取檔案。'));
            reader.readAsDataURL(file);
        });
    }

    function filterProcedureDataFiles() {
        const search = (document.getElementById('procedure-data-search')?.value || '').toLowerCase();
        const subject = document.getElementById('procedure-data-filter-subject')?.value || 'all';
        const grade = document.getElementById('procedure-data-filter-grade')?.value || 'all';

        filteredProcedureDataFiles = procedureDataFiles.filter(item => {
            const equipStr = (item.equipment || []).join(' ');
            const reagentStr = (item.reagents || []).join(' ');
            const stepStr = (item.steps || []).join(' ');
            const fileStr = getProcedureFiles(item).map(f => f.fileName).join(' ');
            const haystack = `${item.title} ${item.subject} ${item.grade} ${item.labRoom} ${item.notes} ${equipStr} ${reagentStr} ${stepStr} ${fileStr}`.toLowerCase();
            const matchSearch = !search || haystack.includes(search);
            const matchSubject = subject === 'all' || item.subject === subject;
            const matchGrade = grade === 'all' || item.grade === grade;
            return matchSearch && matchSubject && matchGrade;
        });
        renderProcedureDataTable();
    }

    function renderProcedureListTags(items, emptyText, colorClass) {
        if (!items?.length) {
            return `<p class="text-xs text-stone-400 italic">${emptyText}</p>`;
        }
        return `<ul class="flex flex-wrap gap-1.5">${items.map(i => `<li class="text-xs px-2 py-1 rounded-full ${colorClass}">${escapeHtml(i)}</li>`).join('')}</ul>`;
    }

    function renderProcedureStepsList(steps, emptyText = '尚未登記實驗步驟') {
        const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
        if (!list.length) {
            return `<p class="text-xs text-stone-400 italic">${emptyText}</p>`;
        }
        return `<ol class="list-decimal list-outside ml-4 space-y-2 text-sm text-stone-700 leading-relaxed">${list.map(s => `<li class="pl-1">${escapeHtml(s)}</li>`).join('')}</ol>`;
    }

    function renderProcedureSafetyBlock(notes, emptyText = '尚未登記安全建議') {
        if (!notes?.trim()) {
            return `<p class="text-xs text-stone-400 italic">${emptyText}</p>`;
        }
        return `<div class="text-sm text-stone-700 whitespace-pre-wrap leading-relaxed bg-red-50/50 border border-red-100 rounded-lg p-3">${escapeHtml(notes)}</div>`;
    }

    function toggleProcedureExpand(id) {
        if (expandedProcedureIds.has(id)) {
            expandedProcedureIds.delete(id);
        } else {
            expandedProcedureIds.add(id);
        }
        renderProcedureDataTable();
    }

    function renderProcedureDataTable() {
        const tbody = document.getElementById('procedure-data-table-body');
        const emptyEl = document.getElementById('procedure-data-empty');
        if (!tbody) return;

        const list = filteredProcedureDataFiles;
        tbody.innerHTML = '';

        if (!list.length) {
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');

        const typeIcons = { image: '🖼️', pdf: '📕', docx: '📝' };

        list.forEach(item => {
            const files = getProcedureFiles(item);
            const hasFiles = files.length > 0;
            const steps = item.steps || [];
            const hasSteps = steps.length > 0;
            const hasSafety = !!(item.notes || '').trim();
            const hasAnalyzable = hasFiles || hasSteps || hasSafety;
            const fileCountLabel = hasFiles
                ? `${files.length} 個檔案`
                : '<span class="text-stone-400 italic">無</span>';
            const isExpanded = expandedProcedureIds.has(item.id);
            const toggleIcon = isExpanded ? '➖' : '➕';
            const editBtn = isAdmin
                ? `<button onclick="event.stopPropagation(); openProcedureDataModal('${item.id}')" class="text-amber-700 hover:text-amber-900 text-xs font-semibold">編輯</button>`
                : '';
            const deleteBtn = isAdmin
                ? `<button onclick="event.stopPropagation(); openConfirmModal('delete-procedure-file', '${item.id}')" class="text-red-500 hover:text-red-700 text-xs font-semibold">刪除</button>`
                : '';

            const fileRows = files.map(f => {
                const fileUrl = getProcedureFileUrl(f);
                const thumb = f.fileType === 'image' && fileUrl
                    ? `<button type="button" onclick="event.stopPropagation(); previewProcedureDataFile('${item.id}', '${f.id}')" class="shrink-0 rounded overflow-hidden border border-stone-200 hover:ring-2 hover:ring-amber-400 transition" title="預覽圖片"><img src="${fileUrl}" alt="" class="w-10 h-10 object-cover"></button>`
                    : '';
                return `
                <div class="flex items-center justify-between gap-2 py-1 border-b border-stone-100 last:border-0">
                    <div class="flex items-center gap-2 min-w-0">
                        ${thumb}
                        <span class="text-xs text-stone-700 truncate">${typeIcons[f.fileType] || '📄'} ${escapeHtml(f.fileName)} <span class="text-stone-400">(${formatProcedureFileSize(f.fileSize)})</span></span>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button onclick="event.stopPropagation(); previewProcedureDataFile('${item.id}', '${f.id}')" class="text-amber-700 hover:text-amber-900 text-xs font-semibold">預覽</button>
                        <button onclick="event.stopPropagation(); downloadProcedureDataFile('${item.id}', '${f.id}')" class="text-slate-600 hover:text-slate-900 text-xs font-semibold">下載</button>
                        ${isAdmin ? `<button onclick="event.stopPropagation(); openConfirmModal('delete-procedure-attached-file', '${item.id}::${f.id}')" class="text-red-400 hover:text-red-600 text-xs">移除</button>` : ''}
                    </div>
                </div>
            `;
            }).join('');

            tbody.innerHTML += `
                <tr class="hover:bg-stone-50 transition cursor-pointer border-l-4 ${isExpanded ? 'border-l-amber-500 bg-amber-50/30' : 'border-l-transparent'}" onclick="toggleProcedureExpand('${item.id}')">
                    <td class="px-4 py-4 text-stone-500 font-bold text-sm">${toggleIcon}</td>
                    <td class="px-4 py-4">
                        <div class="font-semibold text-stone-900">${escapeHtml(item.title)}</div>
                        ${hasSteps ? `<div class="text-xs text-amber-700 mt-0.5">${steps.length} 個實驗步驟</div>` : ''}
                    </td>
                    <td class="px-4 py-4"><span class="bg-blue-50 text-blue-800 px-2 py-0.5 rounded text-xs font-bold">${escapeHtml(item.subject)}</span></td>
                    <td class="px-4 py-4 text-stone-700">${escapeHtml(item.grade)}</td>
                    <td class="px-4 py-4 text-stone-700">${escapeHtml(item.labRoom)}</td>
                    <td class="px-4 py-4 text-xs text-stone-600">${hasFiles ? `<button type="button" onclick="event.stopPropagation(); openProcedureFileViewer('${item.id}')" class="text-amber-700 hover:text-amber-900 font-semibold underline-offset-2 hover:underline">${files.length} 個檔案</button>` : fileCountLabel}</td>
                    <td class="px-4 py-4 text-right whitespace-nowrap" onclick="event.stopPropagation()">
                        <div class="flex flex-wrap justify-end gap-2">
                            ${hasAnalyzable ? `<button onclick="loadProcedureDataForAnalysis('${item.id}')" class="text-amber-700 hover:text-amber-900 text-xs font-semibold">✨ AI 分析</button>` : ''}
                            ${editBtn}
                            ${deleteBtn}
                        </div>
                    </td>
                </tr>
                <tr id="procedure-detail-${item.id}" class="${isExpanded ? '' : 'hidden'}">
                    <td colspan="7" class="px-4 pb-4 pt-0 bg-amber-50/20">
                        <div class="ml-8 p-4 rounded-xl border border-amber-100 bg-white space-y-4">
                            <div>
                                <h4 class="text-xs font-bold text-stone-700 uppercase mb-2 flex items-center gap-1">📋 實驗步驟</h4>
                                ${renderProcedureStepsList(steps)}
                            </div>
                            <div>
                                <h4 class="text-xs font-bold text-stone-700 uppercase mb-2 flex items-center gap-1">🛡️ 安全建議與注意事項</h4>
                                ${renderProcedureSafetyBlock(item.notes)}
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <h4 class="text-xs font-bold text-stone-700 uppercase mb-2 flex items-center gap-1">🔧 所需器材</h4>
                                    ${renderProcedureListTags(item.equipment, '尚未登記器材', 'bg-slate-100 text-slate-700')}
                                </div>
                                <div>
                                    <h4 class="text-xs font-bold text-stone-700 uppercase mb-2 flex items-center gap-1">🧪 所需試劑</h4>
                                    ${renderProcedureListTags(item.reagents, '無試劑 / 不適用', 'bg-emerald-50 text-emerald-800')}
                                </div>
                            </div>
                            <div>
                                <h4 class="text-xs font-bold text-stone-700 uppercase mb-2 flex items-center gap-1">📎 程序文件</h4>
                                ${hasFiles ? fileRows : '<p class="text-xs text-stone-400 italic">尚未上傳程序文件（可僅以文字步驟記錄）</p>'}
                            </div>
                            ${item.uploadedAt ? `<p class="text-[10px] text-stone-400">最後更新：${escapeHtml(item.uploadedAt)}</p>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    function renderProcedureExistingFiles(procId) {
        const wrap = document.getElementById('pd-existing-files-wrap');
        const container = document.getElementById('pd-existing-files');
        const proc = procedureDataFiles.find(p => p.id === procId);
        const files = getProcedureFiles(proc);
        if (!wrap || !container) return;

        if (!files.length) {
            wrap.classList.add('hidden');
            container.innerHTML = '';
            return;
        }
        wrap.classList.remove('hidden');
        const typeIcons = { image: '🖼️', pdf: '📕', docx: '📝' };
        container.innerHTML = files.map(f => `
            <div class="flex items-center justify-between bg-stone-50 rounded px-2 py-1.5 gap-2">
                <span class="min-w-0 truncate">${typeIcons[f.fileType] || '📄'} ${escapeHtml(f.fileName)}</span>
                <div class="flex gap-2 shrink-0">
                    <button type="button" onclick="previewProcedureDataFile('${procId}', '${f.id}')" class="text-amber-700 hover:text-amber-900 text-[10px] font-semibold">預覽</button>
                    <button type="button" onclick="openConfirmModal('delete-procedure-attached-file', '${procId}::${f.id}')" class="text-red-400 hover:text-red-600 text-[10px]">移除</button>
                </div>
            </div>
        `).join('');
    }

    function openProcedureDataModal(editId = null) {
        const form = document.getElementById('procedure-data-form');
        const titleEl = document.getElementById('pd-modal-title');
        const submitBtn = document.getElementById('pd-submit-btn');
        const fileRequired = document.getElementById('pd-file-required');
        form.reset();
        document.getElementById('pd-edit-id').value = editId || '';
        document.getElementById('pd-file').removeAttribute('required');

        if (editId) {
            const item = procedureDataFiles.find(p => p.id === editId);
            if (!item) return;
            titleEl.textContent = '編輯實驗程序';
            submitBtn.textContent = '儲存變更';
            if (fileRequired) fileRequired.classList.remove('hidden');
            document.getElementById('pd-title').value = item.title;
            populateProcedureSubjectSelect(item.subject);
            document.getElementById('pd-grade').value = item.grade;
            document.getElementById('pd-lab').value = item.labRoom;
            document.getElementById('pd-steps').value = listToLines(item.steps);
            document.getElementById('pd-equipment').value = listToLines(item.equipment);
            document.getElementById('pd-reagents').value = listToLines(item.reagents);
            document.getElementById('pd-notes').value = item.notes || '';
            renderProcedureExistingFiles(editId);
        } else {
            titleEl.textContent = '新增實驗程序';
            submitBtn.textContent = '儲存至資料庫';
            if (fileRequired) fileRequired.classList.remove('hidden');
            document.getElementById('pd-existing-files-wrap').classList.add('hidden');
            populateProcedureSubjectSelect('化學');
        }
        setPdAiFillStatus('');
        toggleModal('procedure-data-modal');
    }

    async function storedProcedureFileToExtractionEntry(f) {
        const entry = {
            name: f.fileName,
            type: f.fileType,
            url: f.url || null,
            storagePath: f.storagePath || null
        };
        if (f.dataBase64) {
            if (f.fileType === 'image') {
                const mime = f.mimeType || 'image/jpeg';
                entry.dataUrl = `data:${mime};base64,${f.dataBase64}`;
            } else {
                entry.arrayBuffer = base64ToArrayBuffer(f.dataBase64);
            }
            return entry;
        }
        if (f.fileType === 'image') {
            const directUrl = getProcedureFileUrl(f);
            if (directUrl?.startsWith('data:')) {
                entry.dataUrl = directUrl;
                return entry;
            }
            entry.dataUrl = await downloadProcedureImageDataUrl(f);
            return entry;
        }
        entry.arrayBuffer = await downloadProcedureFileBytes(f);
        return entry;
    }

    function readNewProcedureFileForExtraction(file) {
        const type = getProcedureDataFileType(file);
        if (!type || type === 'doc') {
            return Promise.reject(new Error(`「${file.name}」格式不支援。請使用圖片、PDF 或 .docx。`));
        }
        return new Promise((resolve, reject) => {
            const entry = { name: file.name, type };
            const reader = new FileReader();
            reader.onload = () => {
                if (type === 'image') entry.dataUrl = reader.result;
                else entry.arrayBuffer = reader.result;
                resolve(entry);
            };
            reader.onerror = () => reject(new Error(`無法讀取「${file.name}」。`));
            if (type === 'image') reader.readAsDataURL(file);
            else reader.readAsArrayBuffer(file);
        });
    }

    async function collectProcedureModalSourceFiles() {
        const sources = [];
        const editId = document.getElementById('pd-edit-id')?.value;
        if (editId) {
            const item = procedureDataFiles.find(p => p.id === editId);
            for (const f of getProcedureFiles(item)) {
                sources.push(await storedProcedureFileToExtractionEntry(f));
            }
        }
        const newFiles = Array.from(document.getElementById('pd-file')?.files || []);
        for (const file of newFiles) {
            sources.push(await readNewProcedureFileForExtraction(file));
        }
        return sources;
    }

    function parseProcedureAiFillJson(text) {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('AI 回覆格式無法解析，請重試。');
        const obj = JSON.parse(match[0]);
        const toList = (val) => {
            if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
            if (typeof val === 'string') return val.split(/[,、\n]/).map(s => s.trim()).filter(Boolean);
            return [];
        };
        const safety = obj.safety || obj.safetyConcerns || obj.safety_notes || obj.notes || '';
        const steps = obj.steps || obj.procedure_steps || obj.procedureSteps || obj.procedure || [];
        return {
            equipment: toList(obj.equipment),
            reagents: toList(obj.reagents),
            steps: toList(steps),
            safety: typeof safety === 'string' ? safety.trim() : String(safety)
        };
    }

    async function aiFillProcedureFromUploadedFiles() {
        const btn = document.getElementById('pd-ai-fill-btn');
        if (!btn || btn.disabled) return;

        let sources;
        try {
            sources = await collectProcedureModalSourceFiles();
        } catch (error) {
            openInfoModal('⚠️ 讀取檔案失敗', error.message, '📁');
            return;
        }
        if (!sources.length) {
            openInfoModal('⚠️ 請先上傳檔案', '請選擇至少一個程序文件（圖片、PDF 或 Word），或於編輯模式下保留既有檔案後再使用 AI 自動填寫。', '📁');
            return;
        }

        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = '⏳ 分析中...';
        setPdAiFillStatus('正在擷取文件內容...');

        try {
            const sections = [];
            for (let i = 0; i < sources.length; i++) {
                const text = await extractTextFromProcedureFile(sources[i], i, sources.length);
                const emptyMsg = sources[i].type === 'image'
                    ? '（未能辨識出可讀文字）'
                    : '（未能從文件中擷取可讀文字）';
                sections.push(`【${sources[i].name}】\n${text || emptyMsg}`);
            }
            const combined = sections.join('\n\n');
            const readableChars = combined
                .replace(/（未能辨識出可讀文字）/g, '')
                .replace(/（未能從文件中擷取可讀文字）/g, '')
                .replace(/\s/g, '').length;

            const title = document.getElementById('pd-title')?.value.trim() || '（未填）';
            const subject = getProcedureSubjectValue();
            const grade = document.getElementById('pd-grade')?.value || '';
            const lab = document.getElementById('pd-lab')?.value.trim() || '';

            if (readableChars < 15 && title === '（未填）') {
                throw new Error('文件中未能擷取足夠文字。請上傳含實驗步驟的 PDF/Word 或含文字的圖片，並可先填寫實驗名稱。');
            }

            setPdAiFillStatus('✨ DeepSeek 正在分析並填寫欄位...');

            const sysInstruction = `你是澳門浸信中學科學實驗室資深技術員。根據實驗程序文件擷取內容，辨識實驗步驟、所需器材、試劑及安全注意事項。僅輸出嚴格 JSON，不要 markdown 或說明：
{"steps":["步驟1","步驟2"],"equipment":["器材1","器材2"],"reagents":["試劑1"],"safety":"安全注意事項摘要（繁體中文，條列式或段落）"}
規則：steps 為按順序排列的實驗操作步驟陣列；equipment 與 reagents 為字串陣列，每項具體明確；若無試劑則 reagents 為空陣列；safety 涵蓋 PPE、操作風險、緊急應變與廢棄物處理要點。`;

            const prompt = `實驗名稱：${title}
科目：${subject}　年級：${grade}　實驗室：${lab}

文件擷取內容：
---
${combined}
---

請輸出 JSON。`;

            const result = await callAiAssistant(prompt, sysInstruction);
            const parsed = parseProcedureAiFillJson(result);

            document.getElementById('pd-steps').value = parsed.steps.join('\n');
            document.getElementById('pd-equipment').value = parsed.equipment.join('\n');
            document.getElementById('pd-reagents').value = parsed.reagents.join('\n');
            document.getElementById('pd-notes').value = parsed.safety;

            setPdAiFillStatus(`✅ 已填寫 ${parsed.steps.length} 個步驟、${parsed.equipment.length} 項器材、${parsed.reagents.length} 項試劑及安全要點`);
        } catch (error) {
            setPdAiFillStatus(`❌ ${error.message}`, true);
            openInfoModal('⚠️ AI 填寫失敗', error.message, '✨');
        } finally {
            btn.disabled = false;
            btn.textContent = origText;
        }
    }

    async function processProcedureUploadFiles(fileList, existingCount = 0) {
        const files = Array.from(fileList || []);
        if (!files.length) return [];

        if (existingCount + files.length > PROCEDURE_DATA_MAX_FILES_PER_RECORD) {
            throw new Error(`每個實驗最多 ${PROCEDURE_DATA_MAX_FILES_PER_RECORD} 個檔案。`);
        }

        const cloud = await ensureCloudSync();
        if (!cloud) {
            throw new Error('雲端同步尚未就緒，請稍候數秒後重試。');
        }

        const uploaded = [];
        const now = new Date();
        const uploadedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        for (const file of files) {
            const fileType = getProcedureDataFileType(file);
            if (!fileType || fileType === 'doc') {
                throw new Error(`「${file.name}」格式不支援。請使用圖片、PDF 或 .docx。`);
            }
            const maxSize = fileType === 'image' ? PROCEDURE_DATA_MAX_IMAGE_BYTES : PROCEDURE_DATA_MAX_DOC_BYTES;
            if (file.size > maxSize) {
                throw new Error(`「${file.name}」超過大小上限（${fileType === 'image' ? '4MB' : '2MB'}）。`);
            }
            const uploadResult = resolveCloudUploadResult(await cloud.uploadFile(file, 'procedure_documents'));
            const url = uploadResult.url;
            if (!url) {
                throw new Error(`「${file.name}」雲端上傳失敗，請檢查網路或 Firebase 設定。`);
            }
            let dataBase64 = null;
            try {
                if (fileType === 'image' && file.size <= PROCEDURE_DATA_MAX_IMAGE_BYTES) {
                    dataBase64 = await readFileAsBase64(file);
                } else if (fileType !== 'image' && file.size <= PROCEDURE_DATA_MAX_DOC_BYTES) {
                    dataBase64 = await readFileAsBase64(file);
                }
            } catch (_) {
                dataBase64 = null;
            }
            uploaded.push({
                id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                fileName: file.name,
                fileType,
                mimeType: file.type || (fileType === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
                fileSize: file.size,
                url,
                storagePath: uploadResult.storagePath,
                dataBase64,
                uploadedAt
            });
        }
        return uploaded;
    }

    function downloadProcedureDataFile(procId, fileId) {
        const item = procedureDataFiles.find(p => p.id === procId);
        const file = getProcedureFiles(item).find(f => f.id === fileId);
        const url = getProcedureFileUrl(file);
        if (!url) {
            openInfoModal('⚠️ 無法下載', '找不到此檔案。', '📂');
            return;
        }
        openOrDownloadFile(url, file.fileName || 'procedure-file');
    }

    function previewProcedureDataFile(procId, fileId, skipModalOpen = false) {
        const item = procedureDataFiles.find(p => p.id === procId);
        const file = getProcedureFiles(item).find(f => f.id === fileId);
        const preview = document.getElementById('procedure-file-view-preview');
        const url = getProcedureFileUrl(file);
        if (!file || !url || !preview) {
            openInfoModal('⚠️ 無法預覽', '找不到此檔案。', '📂');
            return;
        }

        const modal = document.getElementById('procedure-file-view-modal');
        if (!skipModalOpen && modal?.classList.contains('hidden')) {
            openProcedureFileViewer(procId, fileId);
            return;
        }

        const titleEl = document.getElementById('procedure-file-view-title');
        const subtitleEl = document.getElementById('procedure-file-view-subtitle');
        if (titleEl) titleEl.textContent = item?.title || '程序文件預覽';
        if (subtitleEl) subtitleEl.textContent = file.fileName || '';

        if (file.fileType === 'pdf') {
            preview.innerHTML = `<div class="w-full min-h-[320px]"></div>`;
            embedPdfInContainer(preview.firstElementChild, url, file.fileName);
        } else if (file.fileType === 'image') {
            preview.innerHTML = `<img src="${toViewableFileUrl(url)}" alt="${escapeHtml(file.fileName)}" class="max-w-full max-h-[min(70dvh,480px)] mx-auto rounded-lg border border-stone-200 object-contain">`;
        } else {
            preview.innerHTML = `<div class="text-center text-sm text-stone-600 space-y-3"><p>📝 Word 文件無法在瀏覽器內直接預覽。</p><button type="button" onclick="downloadProcedureDataFile('${procId}', '${file.id}')" class="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">下載 ${escapeHtml(file.fileName)}</button></div>`;
        }
    }

    function openProcedureFileViewer(procId, focusFileId = null) {
        const item = procedureDataFiles.find(p => p.id === procId);
        const files = getProcedureFiles(item);
        if (!item || !files.length) {
            openInfoModal('⚠️ 無法預覽', '此記錄尚未上傳程序文件。', '📂');
            return;
        }

        const titleEl = document.getElementById('procedure-file-view-title');
        const subtitleEl = document.getElementById('procedure-file-view-subtitle');
        const filesEl = document.getElementById('procedure-file-view-files');
        const previewEl = document.getElementById('procedure-file-view-preview');
        if (titleEl) titleEl.textContent = item.title || '程序文件預覽';
        if (subtitleEl) subtitleEl.textContent = `${item.subject} · ${item.grade} · ${item.labRoom}`;
        if (previewEl) {
            previewEl.innerHTML = '<p class="text-stone-400 text-sm text-center">點擊上方「預覽」以檢視程序文件</p>';
        }

        const typeIcons = { image: '🖼️', pdf: '📕', docx: '📝' };
        if (filesEl) {
            filesEl.innerHTML = files.map(f => `
                <div class="flex items-center justify-between gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                    <div class="min-w-0 flex items-center gap-2">
                        ${f.fileType === 'image' && getProcedureFileUrl(f) ? `<img src="${getProcedureFileUrl(f)}" alt="" class="w-10 h-10 object-cover rounded border border-stone-200 shrink-0">` : ''}
                        <div class="min-w-0">
                            <p class="text-sm font-semibold text-stone-800 truncate">${typeIcons[f.fileType] || '📄'} ${escapeHtml(f.fileName)}</p>
                            <p class="text-[10px] text-stone-400">${formatProcedureFileSize(f.fileSize)}${f.uploadedAt ? ` · 上傳於 ${escapeHtml(f.uploadedAt)}` : ''}</p>
                        </div>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button type="button" onclick="previewProcedureDataFile('${procId}', '${f.id}', true)" class="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">預覽</button>
                        <button type="button" onclick="downloadProcedureDataFile('${procId}', '${f.id}')" class="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">下載</button>
                    </div>
                </div>
            `).join('');
        }

        toggleModal('procedure-file-view-modal');
        const autoPreviewId = focusFileId || (files.length === 1 ? files[0].id : null);
        if (autoPreviewId) {
            previewProcedureDataFile(procId, autoPreviewId, true);
        }
    }

    function procedureFileNeedsCloudDownload(file) {
        if (!file) return false;
        const hasLocal = file.dataBase64 || file.dataUrl || file.arrayBuffer;
        if (hasLocal) return false;
        return !!(file.url && isFirebaseStorageUrl(file.url));
    }

    async function ensureCloudSyncForProcedureFiles(files, label = '程序文件') {
        const needsCloud = (files || []).some(procedureFileNeedsCloudDownload);
        if (!needsCloud) return true;
        const cloud = await ensureCloudSync(45000);
        if (cloud?.downloadFileBytes) return true;
        const initError = window.CloudSync?.initError;
        openInfoModal(
            '⚠️ 雲端尚未就緒',
            initError
                ? `Firebase 模組載入失敗：${initError}。請重新整理頁面後再載入${label}。`
                : `Firebase 同步模組尚在載入，請稍候數秒、重新整理頁面後再試。`,
            '☁️'
        );
        return false;
    }

    async function loadProcedureDataForAnalysis(id) {
        const item = procedureDataFiles.find(p => p.id === id);
        const files = getProcedureFiles(item);
        const steps = item?.steps || [];
        const hasTextContent = steps.length || (item?.notes || '').trim() || (item?.equipment || []).length;
        if (!files.length && !hasTextContent) {
            openInfoModal('⚠️ 無法分析', '此記錄尚未上傳程序文件或填寫實驗步驟。', '📂');
            return;
        }

        if (!(await ensureCloudSyncForProcedureFiles(files))) return;

        try {
            if (files.length) {
                procedureImages = await Promise.all(files.map(async (f) => {
                    const entry = await storedProcedureFileToExtractionEntry(f);
                    return { id: 'proc-lib-' + f.id, ...entry };
                }));
            } else {
                procedureImages = [];
            }
        } catch (err) {
            openInfoModal('⚠️ 無法載入檔案', err.message || '讀取程序文件時發生錯誤。', '📂');
            return;
        }
        renderProcedureImagePreview();

        const contextEl = document.getElementById('procedure-context');
        if (contextEl) {
            const equip = (item.equipment || []).join('、');
            const reag = (item.reagents || []).join('、');
            const stepsBlock = steps.length
                ? `實驗步驟：\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
                : '';
            contextEl.value = `【${item.title}】${item.subject} · ${item.grade} · ${item.labRoom}
器材：${equip || '（未登記）'}
試劑：${reag || '（無）'}
${stepsBlock}
安全建議：${item.notes || '（未登記）'}`.trim();
        }

        switchToTab('section-procedure');
        const loadMsg = files.length
            ? `「${item.title}」的 ${files.length} 個檔案已載入至 AI 分析頁。`
            : `「${item.title}」的實驗步驟與安全資料已載入至 AI 分析頁。`;
        openInfoModal('✅ 已載入', loadMsg, '📷');
    }

    function renderRules() {
        const ppeContainer = document.getElementById('rules-ppe');
        const behaviorContainer = document.getElementById('rules-behavior');
        const emergencyContainer = document.getElementById('rules-emergency');

        if(!ppeContainer || !behaviorContainer || !emergencyContainer) return;

        ppeContainer.innerHTML = '';
        behaviorContainer.innerHTML = '';
        emergencyContainer.innerHTML = '';

        rules.forEach(rule => {
            const deleteBtn = isAdmin ? `<button onclick="openConfirmModal('delete-rule', '${rule.id}')" class="text-stone-400 hover:text-red-500 font-bold ml-2 transition">✕</button>` : '';
            
            if (rule.category === 'ppe') {
                ppeContainer.innerHTML += `
                    <li class="flex items-start justify-between gap-3 group">
                        <div class="flex items-start gap-3">
                            <span class="text-green-600 mt-1">✅</span>
                            <span class="text-stone-700"><strong>${rule.title}:</strong> ${rule.desc}</span>
                        </div>
                        ${deleteBtn}
                    </li>
                `;
            } else if (rule.category === 'behavior') {
                behaviorContainer.innerHTML += `
                    <li class="flex items-start justify-between gap-3 group">
                        <div class="flex items-start gap-3">
                            <span class="text-amber-600 mt-1">⚠</span>
                            <span class="text-stone-700"><strong>${rule.title}:</strong> ${rule.desc}</span>
                        </div>
                        ${deleteBtn}
                    </li>
                `;
            } else if (rule.category === 'emergency') {
                const emergencyDelBtn = isAdmin ? `<button onclick="openConfirmModal('delete-rule', '${rule.id}')" class="absolute top-2 right-2 text-stone-400 hover:text-red-500 font-bold transition">✕</button>` : '';
                emergencyContainer.innerHTML += `
                    <div class="p-4 bg-stone-50 rounded-lg border border-stone-100 relative group">
                        ${emergencyDelBtn}
                        <strong class="block text-stone-900 mb-1">${rule.title}</strong>
                        <p class="text-sm text-stone-600">${rule.desc}</p>
                    </div>
                `;
            }
        });
    }

    function renderMistakes() {
        const container = document.getElementById('mistakes-container');
        if(!container) return;
        container.innerHTML = '';

        mistakes.forEach(m => {
            const deleteAction = isAdmin ? `
                <button onclick="event.stopPropagation(); openConfirmModal('delete-mistake', '${m.id}')" class="text-stone-400 hover:text-red-500 font-semibold text-sm transition">
                    永久移除
                </button>
            ` : '';

            container.innerHTML += `
                <div id="card-${m.id}" class="interactive-card mistake-card bg-white rounded-xl border-l-4 border-l-amber-600 border-t border-r border-b border-stone-200 shadow-sm overflow-hidden">
                    <div onclick="toggleMistakeAccordion('${m.id}')" class="p-5 flex justify-between items-center bg-stone-50 cursor-pointer">
                        <h3 class="font-bold text-stone-900 text-lg flex items-center gap-2">
                            <span class="text-2xl">${m.icon || '🧪'}</span> 常見錯誤：${m.title}
                        </h3>
                        <div class="flex items-center gap-4">
                            ${deleteAction}
                            <span class="toggle-icon text-stone-500 text-xl font-bold">➕</span>
                        </div>
                    </div>
                    <div id="details-${m.id}" class="details hidden p-5 bg-white border-t border-stone-100">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 class="text-sm font-bold text-red-600 uppercase tracking-wide mb-2">錯誤操作與潛在危險</h4>
                                <p class="text-stone-700 text-sm mb-3">${m.desc}</p>
                                <div class="bg-red-50 p-3 rounded text-red-800 text-sm border border-red-100">
                                    <strong>傷害後果：</strong> ${m.hazard}
                                </div>
                            </div>
                            <div>
                                <h4 class="text-sm font-bold text-green-700 uppercase tracking-wide mb-2">正確的操作方法</h4>
                                <p class="text-sm text-stone-700 leading-relaxed whitespace-pre-line">${m.correction}</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    function toggleMistakeAccordion(id) {
        const details = document.getElementById(`details-${id}`);
        const card = document.getElementById(`card-${id}`);
        const icon = card.querySelector('.toggle-icon');
        if (details.classList.contains('hidden')) {
            details.classList.remove('hidden');
            icon.textContent = '➖';
        } else {
            details.classList.add('hidden');
            icon.textContent = '➕';
        }
    }

    // ================= ✏️ 管理員編輯物資與化學品資料功能 =================
    // ================= 庫存危害標籤 AI 分類 =================
    const INVENTORY_HAZARD_TAGS = [
        '無', 'N/AP', '刺激性', '腐蝕性', '強氧化性', '高度易燃', '易燃', '易燃性', '易燃固體', '極度易燃',
        '劇毒', '有毒', '毒性', '健康危害', '致癌性', '強致癌', '環境危害', '遇水反應', '遇水釋放易燃氣體'
    ];

    function isReagentInventoryCategory(category) {
        return category && category !== '物理儀器';
    }

    function normalizeInventoryHazardTags(text) {
        if (!text) return '無';
        let cleaned = text.trim().split('\n')[0]
            .replace(/```[\s\S]*?```/g, '')
            .replace(/^[^:：]*[:：]\s*/, '')
            .replace(/[「」"']/g, '');
        const parts = cleaned.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
        const matched = [];
        parts.forEach(part => {
            if (/^N\/AP$/i.test(part)) { if (!matched.includes('N/AP')) matched.push('N/AP'); return; }
            const hit = INVENTORY_HAZARD_TAGS.find(tag => tag !== '無' && tag !== 'N/AP' && (part === tag || part.includes(tag) || tag.includes(part)));
            if (hit && !matched.includes(hit)) matched.push(hit);
        });
        if (matched.length) return matched.join(', ');
        if (/^N\/AP$/i.test(cleaned)) return 'N/AP';
        if (/^無$|無明顯|無危害|低危害/i.test(cleaned)) return '無';
        return cleaned.length <= 60 ? cleaned : '無';
    }

    async function suggestInventoryHazardsWithAi(name, category, quantity) {
        const sysInstruction = `你是澳門浸信中學 619A 化學準備室的安全標籤分類專家。請根據 GHS 及中學實驗室常用標準，從下列標籤中選擇所有適用項目（可多選），僅輸出一行逗號分隔的繁體中文標籤，不要加解釋：
可選：${INVENTORY_HAZARD_TAGS.join('、')}
若確實無明顯危害僅輸出：無`;

        const prompt = `請為以下庫存試劑/化學品分類安全危害標籤：
名稱：${name}
類別：${category}
規格/濃度：${quantity || '未指定'}

輸出格式範例：腐蝕性, 刺激性`;

        const result = await callAiAssistant(prompt, sysInstruction);
        return normalizeInventoryHazardTags(result);
    }

    function setInventoryHazardAiStatus(prefix, message, isError = false) {
        const el = document.getElementById(prefix === 'inv' ? 'inv-hazard-ai-status' : null);
        if (!el) return;
        if (!message) {
            el.classList.add('hidden');
            el.textContent = '';
            return;
        }
        el.classList.remove('hidden');
        el.className = `text-[10px] mt-1 ${isError ? 'text-red-600' : 'text-emerald-700'}`;
        el.textContent = message;
    }

    async function autoFillInventoryHazards(mode = 'inv') {
        const prefix = mode === 'edit' ? 'edit-inv' : 'inv';
        const name = document.getElementById(`${prefix}-name`)?.value.trim();
        const category = document.getElementById(`${prefix}-category`)?.value;
        const quantity = document.getElementById(`${prefix}-quantity`)?.value.trim();

        if (!name) {
            openInfoModal('⚠️ 請先填寫名稱', '請輸入化學品名稱後再生成危害標籤。', '🧪');
            return;
        }
        if (!isReagentInventoryCategory(category)) {
            document.getElementById(`${prefix}-hazards`).value = '無';
            openInfoModal('ℹ️ 物理儀器', '物理儀器預設標記為「無」危害。', '📦');
            return;
        }

        const btn = document.getElementById(mode === 'inv' ? 'inv-ai-hazard-btn' : null);
        const hazardsInput = document.getElementById(`${prefix}-hazards`);
        if (btn) { btn.disabled = true; btn.textContent = '✨ 生成中...'; }
        setInventoryHazardAiStatus('inv', 'DeepSeek 正在分析危害分類...');

        try {
            const tags = await suggestInventoryHazardsWithAi(name, category, quantity);
            hazardsInput.value = tags;
            setInventoryHazardAiStatus('inv', `已生成：${tags}`);
        } catch (err) {
            setInventoryHazardAiStatus('inv', err.message, true);
            openInfoModal('❌ AI 標籤生成失敗', err.message, '✨');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '✨ AI 生成標籤'; }
        }
    }

    async function resolveInventoryHazardsOnSave(name, category, quantity, currentHazards, autoAi) {
        const trimmed = (currentHazards || '').trim();
        if (!isReagentInventoryCategory(category)) {
            return trimmed || '無';
        }
        const shouldUseAi = autoAi || !trimmed;
        if (!shouldUseAi) return trimmed;
        return suggestInventoryHazardsWithAi(name, category, quantity);
    }

    // ================= 庫存 MSDS 附件 =================
    const INVENTORY_MSDS_MAX_BYTES = 4 * 1024 * 1024;
    const INVENTORY_MSDS_MAX_FILES = 3;
    const INVENTORY_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
    const INVENTORY_PHOTO_MAX_FILES = 6;

    function getInventoryMsds(item) {
        return Array.isArray(item?.msds) ? item.msds : [];
    }

    function getInventoryPhotos(item) {
        return Array.isArray(item?.photos) ? item.photos : [];
    }

    function getInventoryAttachmentUrl(file) {
        if (!file) return null;
        if (file.url) return file.url;
        if (file.dataBase64) {
            const mime = file.mimeType || 'application/octet-stream';
            return `data:${mime};base64,${file.dataBase64}`;
        }
        return null;
    }

    function supportsInventoryMsds(category) {
        return category && category !== '物理儀器';
    }

    function getMsdsFileType(file) {
        const name = (file.name || '').toLowerCase();
        if (file.type.startsWith('image/')) return 'image';
        if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) return 'docx';
        return null;
    }

    function formatMsdsFileSize(bytes) {
        if (!bytes) return '—';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function updateInventoryMsdsVisibility(mode) {
        const prefix = mode === 'edit' ? 'edit-inv' : 'inv';
        const category = getInventoryCategoryValue(prefix);
        const wrap = document.getElementById(`${prefix}-msds-wrap`);
        if (!wrap) return;
        if (supportsInventoryMsds(category)) {
            wrap.classList.remove('hidden');
        } else {
            wrap.classList.add('hidden');
        }
    }

    const DEFAULT_INVENTORY_CATEGORIES = ['化學藥品', '液體強酸強鹼', '有機溶劑/易燃', '有機溶劑/易燃品', '固體/鹽類', '物理儀器'];

    function populateComboSelect(selectId, inputId, options, selected = '', placeholder = '— 請選擇 —', customLabel = '✏️ 手動輸入...') {
        const select = document.getElementById(selectId);
        const input = document.getElementById(inputId);
        if (!select || !input) return;

        select.innerHTML = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = placeholder;
        select.appendChild(defaultOpt);

        options.forEach(value => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            select.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = '__custom__';
        customOpt.textContent = customLabel;
        select.appendChild(customOpt);

        if (selected && options.includes(selected)) {
            select.value = selected;
            input.classList.add('hidden');
            input.value = selected;
        } else if (selected) {
            select.value = '__custom__';
            input.classList.remove('hidden');
            input.value = selected;
        } else {
            select.value = '';
            input.classList.add('hidden');
            input.value = '';
        }
    }

    function handleComboSelectChange(selectId, inputId) {
        const select = document.getElementById(selectId);
        const input = document.getElementById(inputId);
        if (!select || !input) return;

        if (select.value === '__custom__') {
            input.classList.remove('hidden');
            input.value = '';
            input.focus();
        } else if (select.value) {
            input.classList.add('hidden');
            input.value = select.value;
        } else {
            input.classList.add('hidden');
            input.value = '';
        }
    }

    function getComboSelectValue(selectId, inputId) {
        const select = document.getElementById(selectId);
        const input = document.getElementById(inputId);
        if (select?.value === '__custom__') return input?.value.trim() || '';
        if (select?.value) return select.value;
        return input?.value.trim() || '';
    }

    function getInventoryCategories() {
        const fromData = inventories.map(v => v.category).filter(Boolean);
        return [...new Set([...DEFAULT_INVENTORY_CATEGORIES, ...fromData])].sort();
    }

    function refreshInventoryCategoryFilter() {
        const select = document.getElementById('inventory-filter-cat');
        if (!select) return false;
        const categories = getInventoryCategories();
        const current = select.value || 'all';
        const keep = current === 'all' || categories.includes(current);
        const next = keep ? current : 'all';
        const signature = categories.join('\0');
        if (select.dataset.categories === signature && select.value === next) return false;
        select.dataset.categories = signature;
        select.innerHTML = '<option value="all">所有類別</option>';
        categories.forEach((category) => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            select.appendChild(option);
        });
        select.value = next;
        return !keep;
    }

    function getInventoryCategoryValue(prefix) {
        return getComboSelectValue(`${prefix}-category-select`, `${prefix}-category-custom`);
    }

    function populateInventoryCategorySelect(prefix, selected = '') {
        populateComboSelect(
            `${prefix}-category-select`,
            `${prefix}-category-custom`,
            getInventoryCategories(),
            selected,
            '— 選擇物資類別 —',
            '✏️ 手動輸入新類別...'
        );
    }

    function handleInventoryCategorySelectChange(prefix) {
        handleComboSelectChange(`${prefix}-category-select`, `${prefix}-category-custom`);
        updateInventoryMsdsVisibility(prefix === 'edit-inv' ? 'edit' : 'inv');
    }

    function getIncidentLocations() {
        return [...new Set(incidents.map(i => i.location).filter(Boolean))].sort();
    }

    function populateIncidentLocationSelect(selected = '') {
        populateComboSelect(
            'incident-location-select',
            'incident-location',
            getIncidentLocations(),
            selected,
            '— 選擇現有地點 —',
            '✏️ 手動輸入新地點...'
        );
    }

    function getIncidentLocationValue() {
        return getComboSelectValue('incident-location-select', 'incident-location');
    }

    const DEFAULT_INCIDENT_CATEGORIES = [
        '玻璃儀器碎裂',
        '輕微化學液潑濺',
        '器材熱源灼燙',
        '吸入刺激煙霧',
        '眼睛刺激或飛濺物',
        '其他違規安全操作'
    ];

    function getIncidentCategories() {
        const fromData = incidents.map(i => i.category).filter(Boolean);
        return [...new Set([...DEFAULT_INCIDENT_CATEGORIES, ...fromData])].sort();
    }

    function populateIncidentCategorySelect(selected = '') {
        populateComboSelect(
            'incident-category-select',
            'incident-category-custom',
            getIncidentCategories(),
            selected,
            '— 選擇事故類別 —',
            '✏️ 手動輸入事故類別...'
        );
    }

    function getIncidentCategoryValue() {
        return getComboSelectValue('incident-category-select', 'incident-category-custom');
    }

    // ================= 實驗室預約 =================
    function getSortedLabRooms() {
        return [...(labRooms || [])].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'zh-Hant'));
    }

    function getBookingLabLocations() {
        return getSortedLabRooms().map(r => r.name).filter(Boolean);
    }

    function getBookingFilterLocations() {
        const fromRooms = getBookingLabLocations();
        const fromBookings = labBookings.map(b => b.location).filter(Boolean)
            .filter(name => !fromRooms.some(r => normalizeBookingLocationKey(r) === normalizeBookingLocationKey(name)));
        return [...fromRooms, ...fromBookings.sort((a, b) => a.localeCompare(b, 'zh-Hant'))];
    }

    function getLabRoomShortLabel(name) {
        const match = String(name || '').match(/^(\d{3})/);
        return match ? match[1] : (name || '').slice(0, 6);
    }

    function renderLabRoomButtons() {
        const container = document.getElementById('lab-room-buttons');
        if (!container) return;
        const rooms = getSortedLabRooms();
        if (!rooms.length) {
            container.innerHTML = '<p class="text-xs text-stone-400 italic">尚未設定實驗室地點。</p>';
            return;
        }
        container.innerHTML = rooms.map(room => `
            <button type="button" onclick="openLabInfoModal('${room.id}')"
                class="px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-800 hover:text-white hover:border-slate-800 text-slate-800 transition shadow-sm"
                title="${escapeHtml(room.name)}">
                <span class="font-mono text-amber-700">${escapeHtml(getLabRoomShortLabel(room.name))}</span>
                <span class="ml-1">${escapeHtml(room.name.replace(/^\d{3}\s*/, ''))}</span>
            </button>
        `).join('');
    }

    function openLabInfoModal(roomId) {
        const room = labRooms.find(r => r.id === roomId);
        if (!room) return;
        const titleEl = document.getElementById('lab-info-title');
        const descEl = document.getElementById('lab-info-description');
        const photosEl = document.getElementById('lab-info-photos');
        if (titleEl) titleEl.textContent = room.name;
        if (descEl) {
            descEl.textContent = room.description?.trim()
                ? room.description
                : '暫未提供詳細簡介。管理員可於「管理實驗室」補充說明與照片。';
        }
        if (photosEl) {
            const photos = room.photos || [];
            photosEl.innerHTML = photos.length
                ? photos.map(p => {
                    const src = toViewableFileUrl(p.url || '');
                    return `
                    <a href="${escapeHtml(src)}" target="_blank" rel="noopener" class="block rounded-lg overflow-hidden border border-stone-200 bg-stone-50">
                        <img src="${escapeHtml(src)}" alt="${escapeHtml(p.fileName || room.name)}" class="w-full h-40 object-cover">
                    </a>`;
                }).join('')
                : '<p class="text-xs text-stone-400 italic sm:col-span-2">尚未上傳實驗室照片。</p>';
        }
        toggleModal('lab-info-modal');
    }
    window.openLabInfoModal = openLabInfoModal;

    function openLabRoomsManageModal() {
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以管理實驗室資料。', '🔒');
            return;
        }
        renderLabRoomsManageList();
        toggleModal('lab-rooms-manage-modal');
    }
    window.openLabRoomsManageModal = openLabRoomsManageModal;

    function renderLabRoomsManageList() {
        const listEl = document.getElementById('lab-rooms-manage-list');
        if (!listEl) return;
        const rooms = getSortedLabRooms();
        listEl.innerHTML = rooms.map(room => `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-stone-200 rounded-lg p-3 bg-stone-50">
                <div class="min-w-0">
                    <p class="font-semibold text-stone-900 text-sm">${escapeHtml(room.name)} ${room.isDefault ? '<span class="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded ml-1">預設</span>' : ''}</p>
                    <p class="text-xs text-stone-500 mt-0.5 line-clamp-2">${escapeHtml(room.description || '（尚未填寫簡介）')}</p>
                    <p class="text-[10px] text-stone-400 mt-1">${(room.photos || []).length} 張照片</p>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button type="button" onclick="openLabRoomEditModal('${room.id}')" class="text-amber-700 hover:text-amber-900 text-xs font-semibold">編輯</button>
                    ${!room.isDefault ? `<button type="button" onclick="openConfirmModal('delete-lab-room', '${room.id}')" class="text-red-500 hover:text-red-700 text-xs font-semibold">刪除</button>` : ''}
                </div>
            </div>
        `).join('') || '<p class="text-xs text-stone-400 italic">尚無實驗室資料。</p>';
    }

    async function addLabRoomLocation() {
        if (!isAdmin) return;
        const input = document.getElementById('lab-room-new-name');
        const name = (input?.value || '').trim();
        if (!name) {
            openInfoModal('⚠️ 請輸入名稱', '請填寫新實驗室地點名稱。', '🏛️');
            return;
        }
        if (labRooms.some(r => normalizeBookingLocationKey(r.name) === normalizeBookingLocationKey(name))) {
            openInfoModal('⚠️ 地點已存在', `「${name}」已在清單中。`, '🏛️');
            return;
        }
        const maxOrder = labRooms.reduce((m, r) => Math.max(m, Number(r.sortOrder) || 0), 0);
        labRooms.push({
            id: 'lab_' + Date.now(),
            name,
            description: '',
            photos: [],
            sortOrder: maxOrder + 1,
            isDefault: false
        });
        if (input) input.value = '';
        await persistLabRooms();
        renderLabRoomsManageList();
        openInfoModal('✅ 已新增', `「${name}」已加入可用實驗室清單。`, '🏛️');
    }
    window.addLabRoomLocation = addLabRoomLocation;

    function openLabRoomEditModal(roomId) {
        if (!isAdmin) return;
        const room = labRooms.find(r => r.id === roomId);
        if (!room) return;
        document.getElementById('lab-room-edit-id').value = room.id;
        document.getElementById('lab-room-edit-title').textContent = `編輯：${room.name}`;
        document.getElementById('lab-room-edit-name').value = room.name;
        document.getElementById('lab-room-edit-description').value = room.description || '';
        const photoInput = document.getElementById('lab-room-edit-photo-input');
        if (photoInput) photoInput.value = '';
        renderLabRoomEditPhotos(roomId);
        toggleModal('lab-room-edit-modal');
    }
    window.openLabRoomEditModal = openLabRoomEditModal;

    function renderLabRoomEditPhotos(roomId) {
        const container = document.getElementById('lab-room-edit-photos');
        const room = labRooms.find(r => r.id === roomId);
        if (!container || !room) return;
        const photos = room.photos || [];
        if (!photos.length) {
            container.innerHTML = '<p class="text-stone-400 italic">尚未上傳照片。</p>';
            return;
        }
        container.innerHTML = photos.map(p => `
            <div class="flex items-center justify-between gap-2 bg-white border border-stone-200 rounded px-2 py-1.5">
                <div class="flex items-center gap-2 min-w-0">
                    <img src="${escapeHtml(p.url || '')}" alt="" class="w-10 h-10 object-cover rounded border border-stone-200">
                    <span class="truncate">${escapeHtml(p.fileName || 'photo')}</span>
                </div>
                <button type="button" onclick="openConfirmModal('delete-lab-room-photo', '${roomId}::${p.id}')" class="text-red-400 hover:text-red-600 text-[10px] shrink-0">移除</button>
            </div>
        `).join('');
    }

    async function processLabRoomPhotoUploads(fileList, existingCount = 0) {
        const files = Array.from(fileList || []);
        if (!files.length) return [];
        if (existingCount + files.length > LAB_ROOM_PHOTO_MAX_FILES) {
            throw new Error(`每個實驗室最多 ${LAB_ROOM_PHOTO_MAX_FILES} 張照片。`);
        }
        const cloud = await ensureCloudSync();
        if (!cloud) throw new Error('雲端同步尚未就緒，請稍候數秒後重試。');
        const uploaded = [];
        const now = new Date();
        const uploadedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        for (const file of files) {
            if (!file.type.startsWith('image/')) throw new Error(`「${file.name}」不是圖片檔。`);
            if (file.size > LAB_ROOM_PHOTO_MAX_BYTES) throw new Error(`「${file.name}」超過 4MB 上限。`);
            const result = resolveCloudUploadResult(await cloud.uploadFile(file, 'lab_room_photos'));
            if (!result.url) throw new Error(`「${file.name}」上傳失敗。`);
            uploaded.push({
                id: 'lrp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                fileName: file.name,
                fileType: 'image',
                mimeType: file.type || 'image/jpeg',
                fileSize: file.size,
                url: result.url,
                storagePath: result.storagePath,
                uploadedAt
            });
        }
        return uploaded;
    }

    function getBookingClassOptions() {
        const fromBookings = labBookings.map(b => b.className).filter(Boolean);
        return [...new Set(fromBookings)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    function getBookingTutorOptions() {
        const fromBookings = labBookings.map(b => b.tutor || formatBookingTutorLabel(b.tutorName, b.tutorNumber)).filter(Boolean);
        return [...new Set(fromBookings)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    function getBookingExperimentOptions() {
        const fromProcedures = procedureDataFiles.map(p => p.title).filter(Boolean);
        const fromBookings = labBookings.map(b => b.experiment).filter(Boolean);
        return [...new Set([...fromProcedures, ...fromBookings])].sort();
    }

    function populateBookingYearSelect(selected = '') {
        populateComboSelect(
            'booking-year-select',
            'booking-year-custom',
            BOOKING_CLASS_YEARS,
            selected,
            '— 空白 —',
            '✏️ 手動輸入...'
        );
    }

    function populateBookingSubclassSelect(selected = '') {
        populateComboSelect(
            'booking-subclass-select',
            'booking-subclass-custom',
            BOOKING_CLASS_SUBCLASSES,
            selected,
            '— 空白 —',
            '✏️ 手動輸入...'
        );
    }

    function populateBookingTutorSelect(selected = '') {
        populateComboSelect(
            'booking-tutor-select',
            'booking-tutor-custom',
            getBookingTutorOptions(),
            selected,
            '— 空白／選擇 —',
            '✏️ 手動輸入姓名與編號...'
        );
        const fields = document.getElementById('booking-tutor-custom-fields');
        const nameEl = document.getElementById('booking-tutor-name-custom');
        const numEl = document.getElementById('booking-tutor-number-custom');
        const sel = document.getElementById('booking-tutor-select');
        if (!fields || !nameEl || !numEl || !sel) return;
        if (sel.value === '__custom__') {
            const parsed = parseBookingTutorLabel(selected);
            nameEl.value = parsed.tutorName;
            numEl.value = parsed.tutorNumber;
            fields.classList.remove('hidden');
        } else {
            nameEl.value = '';
            numEl.value = '';
            fields.classList.add('hidden');
        }
    }

    function handleBookingTutorSelectChange() {
        const sel = document.getElementById('booking-tutor-select');
        const input = document.getElementById('booking-tutor-custom');
        const fields = document.getElementById('booking-tutor-custom-fields');
        const nameEl = document.getElementById('booking-tutor-name-custom');
        const numEl = document.getElementById('booking-tutor-number-custom');
        if (!sel || !input || !fields) return;
        if (sel.value === '__custom__') {
            fields.classList.remove('hidden');
            input.value = '';
            if (nameEl) { nameEl.value = ''; nameEl.focus(); }
            if (numEl) numEl.value = '';
        } else if (sel.value) {
            fields.classList.add('hidden');
            input.value = sel.value;
            if (nameEl) nameEl.value = '';
            if (numEl) numEl.value = '';
        } else {
            fields.classList.add('hidden');
            input.value = '';
            if (nameEl) nameEl.value = '';
            if (numEl) numEl.value = '';
        }
    }
    window.handleBookingTutorSelectChange = handleBookingTutorSelectChange;

    function isLabAvailableForSelection(location, dates, slots, excludeId = null) {
        if (!location || !dates?.length || !slots?.length) return false;
        return dates.every(date => slots.every(slotId => !isBookingTimeslotOccupied(date, location, slotId, excludeId)));
    }

    function refreshAvailableBookingLabs(preferred = '') {
        const sel = document.getElementById('booking-location-select');
        const hint = document.getElementById('booking-location-hint');
        if (!sel) return;
        const editId = document.getElementById('booking-edit-id')?.value || null;
        const dates = [...bookingSelectedDates];
        const slots = getSelectedBookingTimeslotIds();
        const current = preferred || sel.value;

        if (!dates.length || !slots.length) {
            sel.innerHTML = '<option value="">— 請先選擇日期與時段 —</option>';
            sel.disabled = true;
            if (hint) hint.textContent = '請先選擇日期與時段，系統才會顯示當時可用的實驗室。';
            return;
        }

        const available = getBookingLabLocations().filter(name =>
            isLabAvailableForSelection(name, dates, slots, editId)
        );
        sel.disabled = false;
        if (!available.length) {
            sel.innerHTML = '<option value="">— 此時段沒有可用實驗室 —</option>';
            if (hint) hint.textContent = '所選日期與時段沒有空閒實驗室，請改選其他時段。';
            return;
        }

        sel.innerHTML = '<option value="">— 選擇可用實驗室 —</option>' +
            available.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        const match = available.find(n => n === current || normalizeBookingLocationKey(n) === normalizeBookingLocationKey(current));
        sel.value = match || '';
        if (hint) hint.textContent = `已顯示 ${available.length} 間在所選時段可用的實驗室。`;
    }

    function populateBookingLocationSelect(selected = '') {
        refreshAvailableBookingLabs(selected);
    }

    function populateBookingExperimentSelect(selected = '') {
        populateComboSelect(
            'booking-experiment-select',
            'booking-experiment-custom',
            getBookingExperimentOptions(),
            selected,
            '— 選擇項目 —',
            '✏️ 手動輸入項目名稱...'
        );
    }

    function getBookingYearValue() {
        return getComboSelectValue('booking-year-select', 'booking-year-custom');
    }

    function getBookingSubclassValue() {
        return getComboSelectValue('booking-subclass-select', 'booking-subclass-custom');
    }

    function getBookingClassDisplayValue() {
        return `${getBookingYearValue() || ''}${getBookingSubclassValue() || ''}`.trim();
    }

    function getBookingTutorValue() {
        const sel = document.getElementById('booking-tutor-select');
        if (sel?.value === '__custom__') {
            const name = document.getElementById('booking-tutor-name-custom')?.value.trim() || '';
            const number = document.getElementById('booking-tutor-number-custom')?.value.trim() || '';
            return formatBookingTutorLabel(name, number) || name || number;
        }
        return getComboSelectValue('booking-tutor-select', 'booking-tutor-custom');
    }

    function getBookingLocationValue() {
        return (document.getElementById('booking-location-select')?.value || '').trim();
    }

    function getBookingExperimentValue() {
        return getComboSelectValue('booking-experiment-select', 'booking-experiment-custom');
    }

    function getSelectedBookingTimeslotIds() {
        const box = document.getElementById('booking-timeslots');
        if (!box) return [];
        return Array.from(box.querySelectorAll('[data-timeslot-id][aria-pressed="true"]'))
            .map(btn => btn.getAttribute('data-timeslot-id'))
            .filter(Boolean);
    }

    function toggleBookingTimeslot(id) {
        const btn = document.querySelector('#booking-timeslots [data-timeslot-id="' + id + '"]');
        if (!btn || btn.disabled) return;
        const next = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
        refreshAvailableBookingLabs();
        updateBookingConflictHint(document.getElementById('booking-edit-id')?.value || null);
    }
    window.toggleBookingTimeslot = toggleBookingTimeslot;

    function normalizeBookingLocationKey(location) {
        return String(location || '').trim().toLowerCase().replace(/\s+/g, '');
    }

    function getBookingSlotKey(date, location, timeslotId) {
        return `${date || ''}|${normalizeBookingLocationKey(location)}|${timeslotId || ''}`;
    }

    function getOccupiedBookingSlotKeys(excludeId = null) {
        const occupied = new Set();
        (labBookings || []).forEach(b => {
            if (!b?.date || !b?.location) return;
            if (normalizeBookingStatus(b.status) === 'rejected') return;
            if (excludeId && b.id === excludeId) return;
            const slotId = b.timeslotId || '_legacy';
            occupied.add(getBookingSlotKey(b.date, b.location, slotId));
            if (!b.timeslotId) occupied.add(getBookingSlotKey(b.date, b.location, ''));
        });
        return occupied;
    }

    function isBookingTimeslotOccupied(date, location, timeslotId, excludeId = null) {
        if (!date || !location || !timeslotId) return false;
        return getOccupiedBookingSlotKeys(excludeId).has(getBookingSlotKey(date, location, timeslotId));
    }

    function getBookingConflictMap(bookings) {
        const map = new Map();
        (bookings || []).forEach(b => {
            if (!b?.date || !b?.location) return;
            if (normalizeBookingStatus(b.status) === 'rejected') return;
            const key = getBookingSlotKey(b.date, b.location, b.timeslotId || '_legacy');
            map.set(key, (map.get(key) || 0) + 1);
        });
        return map;
    }

    function bookingHasConflict(booking, conflictMap) {
        if (!booking?.date || !booking?.location) return false;
        const key = getBookingSlotKey(booking.date, booking.location, booking.timeslotId || '_legacy');
        return (conflictMap.get(key) || 0) > 1;
    }

    function updateBookingConflictHint(excludeId = null) {
        const hint = document.getElementById('booking-conflict-hint');
        if (!hint) return;
        const location = getBookingLocationValue();
        const dates = [...bookingSelectedDates];
        const slots = getSelectedBookingTimeslotIds();
        if (!location || !dates.length || !slots.length) {
            hint.classList.add('hidden');
            return;
        }
        const conflicts = [];
        dates.forEach(date => {
            slots.forEach(slotId => {
                if (isBookingTimeslotOccupied(date, location, slotId, excludeId)) {
                    const label = BOOKING_TIMESLOTS.find(t => t.id === slotId)?.label || slotId;
                    conflicts.push(`${date} ${label}`);
                }
            });
        });
        if (!conflicts.length) {
            hint.classList.add('hidden');
            return;
        }
        hint.classList.remove('hidden');
        hint.textContent = `⚠️ 以下時段已被預約，無法選取：${conflicts.slice(0, 6).join('、')}${conflicts.length > 6 ? '…' : ''}`;
    }

    function handleBookingLocationChange() {
        updateBookingConflictHint(document.getElementById('booking-edit-id')?.value || null);
    }
    window.handleBookingLocationChange = handleBookingLocationChange;

    function formatBookingDateKey(dateObj) {
        const pad = n => String(n).padStart(2, '0');
        return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
    }

    function shiftBookingCalendar(deltaMonths) {
        bookingCalendarCursor = new Date(
            bookingCalendarCursor.getFullYear(),
            bookingCalendarCursor.getMonth() + deltaMonths,
            1
        );
        renderBookingCalendar();
    }
    window.shiftBookingCalendar = shiftBookingCalendar;

    function toggleBookingCalendarDate(dateStr) {
        const editId = document.getElementById('booking-edit-id')?.value;
        if (editId) {
            bookingSelectedDates = [dateStr];
        } else if (bookingSelectedDates.includes(dateStr)) {
            bookingSelectedDates = bookingSelectedDates.filter(d => d !== dateStr);
        } else {
            bookingSelectedDates = [...bookingSelectedDates, dateStr].sort();
        }
        renderBookingCalendar();
        refreshBookingTimeslotOptions();
        updateBookingConflictHint(editId || null);
    }
    window.toggleBookingCalendarDate = toggleBookingCalendarDate;

    function renderBookingCalendar() {
        const labelEl = document.getElementById('booking-cal-month-label');
        const daysEl = document.getElementById('booking-cal-days');
        const selectedEl = document.getElementById('booking-selected-dates');
        if (!daysEl) return;

        const year = bookingCalendarCursor.getFullYear();
        const month = bookingCalendarCursor.getMonth();
        if (labelEl) labelEl.textContent = `${year} 年 ${month + 1} 月`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push('<span></span>');
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = formatBookingDateKey(new Date(year, month, day));
            const selected = bookingSelectedDates.includes(dateStr);
            cells.push(`
                <button type="button"
                    onclick="toggleBookingCalendarDate('${dateStr}')"
                    class="aspect-square min-h-[40px] rounded-lg text-xs font-semibold transition border ${
                        selected
                            ? 'bg-amber-600 text-white border-amber-700 shadow'
                            : 'bg-white text-stone-700 border-stone-200 hover:border-amber-400'
                    }">
                    ${day}
                </button>
            `);
        }
        daysEl.innerHTML = cells.join('');

        if (selectedEl) {
            selectedEl.innerHTML = bookingSelectedDates.length
                ? bookingSelectedDates.map(d => `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">${escapeHtml(d)}</span>`).join('')
                : '<span class="text-stone-400 italic">尚未選擇日期</span>';
        }
    }

    function refreshBookingTimeslotOptions() {
        const box = document.getElementById('booking-timeslots');
        if (!box) return;
        const previouslySelected = new Set(getSelectedBookingTimeslotIds());

        box.innerHTML = BOOKING_TIMESLOTS.map(slot => {
            const selected = previouslySelected.has(slot.id);
            return `<button type="button" role="option" data-timeslot-id="${slot.id}" aria-pressed="${selected ? 'true' : 'false'}" onclick="toggleBookingTimeslot('${slot.id}')" class="booking-timeslot-btn">${slot.label}</button>`;
        }).join('');

        refreshAvailableBookingLabs();
        updateBookingConflictHint(document.getElementById('booking-edit-id')?.value || null);
    }
    window.refreshBookingTimeslotOptions = refreshBookingTimeslotOptions;

    function getBookingSubjectOptions() {
        const fromBookings = labBookings.map(b => b.subject).filter(Boolean);
        return [...new Set([...DEFAULT_BOOKING_SUBJECTS, ...fromBookings])];
    }

    function getBookingTeacherOptions() {
        return [...new Set(
            labBookings.map(b => b.tutor || formatBookingTutorLabel(b.tutorName, b.tutorNumber)).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    }

    function populateBookingSubjectSelect(selected = '') {
        populateComboSelect(
            'booking-subject-select',
            'booking-subject-custom',
            getBookingSubjectOptions(),
            selected,
            '— 選擇科目 —',
            '✏️ 手動輸入科目...'
        );
    }

    function getBookingSubjectValue() {
        return getComboSelectValue('booking-subject-select', 'booking-subject-custom');
    }

    function updateBookingGroupsVisibility() {
        const wrap = document.getElementById('booking-groups-wrap');
        const isExperimental = !!document.getElementById('booking-type-experimental')?.checked;
        if (wrap) wrap.classList.toggle('hidden', !isExperimental);
        if (!isExperimental) {
            const groupsEl = document.getElementById('booking-groups');
            if (groupsEl) groupsEl.value = '';
        }
    }
    window.updateBookingGroupsVisibility = updateBookingGroupsVisibility;

    function populateBookingFilterOptions() {
        const locEl = document.getElementById('booking-filter-location');
        const classEl = document.getElementById('booking-filter-class');
        const subjectEl = document.getElementById('booking-filter-subject');
        const teacherEl = document.getElementById('booking-filter-teacher');
        const locVal = locEl?.value || 'all';
        const classVal = classEl?.value || 'all';
        const subjectVal = subjectEl?.value || 'all';
        const teacherVal = teacherEl?.value || 'all';
        if (locEl) {
            locEl.innerHTML = '<option value="all">所有實驗室</option>' +
                getBookingFilterLocations().map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
            locEl.value = [...locEl.options].some(o => o.value === locVal) ? locVal : 'all';
        }
        if (classEl) {
            classEl.innerHTML = '<option value="all">所有班別</option>' +
                getBookingClassOptions().map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            classEl.value = [...classEl.options].some(o => o.value === classVal) ? classVal : 'all';
        }
        if (subjectEl) {
            subjectEl.innerHTML = '<option value="all">所有科目</option>' +
                getBookingSubjectOptions().map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
            subjectEl.value = [...subjectEl.options].some(o => o.value === subjectVal) ? subjectVal : 'all';
        }
        if (teacherEl) {
            teacherEl.innerHTML = '<option value="all">所有導師</option>' +
                getBookingTeacherOptions().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
            teacherEl.value = [...teacherEl.options].some(o => o.value === teacherVal) ? teacherVal : 'all';
        }
    }

    function resetBookingFilters() {
        const ids = ['booking-filter-search', 'booking-filter-date-from', 'booking-filter-date-to'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const locEl = document.getElementById('booking-filter-location');
        const classEl = document.getElementById('booking-filter-class');
        const subjectEl = document.getElementById('booking-filter-subject');
        const teacherEl = document.getElementById('booking-filter-teacher');
        const sortEl = document.getElementById('booking-filter-sort');
        const orderEl = document.getElementById('booking-filter-order');
        const ipadsEl = document.getElementById('booking-filter-ipads');
        const statusEl = document.getElementById('booking-filter-status');
        if (locEl) locEl.value = 'all';
        if (classEl) classEl.value = 'all';
        if (subjectEl) subjectEl.value = 'all';
        if (teacherEl) teacherEl.value = 'all';
        if (sortEl) sortEl.value = 'date';
        if (orderEl) orderEl.value = 'asc';
        if (ipadsEl) ipadsEl.checked = false;
        if (statusEl) statusEl.value = 'all';
        filterLabBookings();
    }

    const BOOKING_PAGE_SIZE = 40;
    let bookingTablePage = 1;

    function setBookingTablePage(page) {
        const total = filteredLabBookings?.length || 0;
        const pages = Math.max(1, Math.ceil(total / BOOKING_PAGE_SIZE));
        let next = bookingTablePage;
        if (page === 'prev') next -= 1;
        else if (page === 'next') next += 1;
        else next = Number(page) || 1;
        bookingTablePage = Math.min(Math.max(1, next), pages);
        renderBookingTable();
    }
    window.setBookingTablePage = setBookingTablePage;

    function filterLabBookings() {
        const search = (document.getElementById('booking-filter-search')?.value || '').toLowerCase();
        const dateFrom = document.getElementById('booking-filter-date-from')?.value || '';
        const dateTo = document.getElementById('booking-filter-date-to')?.value || '';
        const location = document.getElementById('booking-filter-location')?.value || 'all';
        const className = document.getElementById('booking-filter-class')?.value || 'all';
        const subject = document.getElementById('booking-filter-subject')?.value || 'all';
        const teacher = document.getElementById('booking-filter-teacher')?.value || 'all';
        const sortBy = document.getElementById('booking-filter-sort')?.value || 'date';
        const sortOrder = document.getElementById('booking-filter-order')?.value || 'asc';
        const ipadsOnly = document.getElementById('booking-filter-ipads')?.checked;
        const statusFilter = document.getElementById('booking-filter-status')?.value || 'all';

        filteredLabBookings = labBookings.filter(b => {
            const tutorLabel = b.tutor || formatBookingTutorLabel(b.tutorName, b.tutorNumber) || '';
            const materialText = (b.materials || []).map(m => `${m.name} ${m.quantity || ''}`).join(' ');
            const haystack = `${b.className} ${tutorLabel} ${b.subject || ''} ${b.timeslot || ''} ${b.location} ${b.experiment} ${b.remarks} ${materialText} ${getBookingStatusLabel(b.status)}`.toLowerCase();
            if (search && !haystack.includes(search)) return false;
            if (dateFrom && b.date < dateFrom) return false;
            if (dateTo && b.date > dateTo) return false;
            if (location !== 'all' && b.location !== location) return false;
            if (className !== 'all' && b.className !== className) return false;
            if (subject !== 'all' && b.subject !== subject) return false;
            if (teacher !== 'all' && tutorLabel !== teacher) return false;
            if (ipadsOnly && !b.ipadsNeeded) return false;
            if (statusFilter !== 'all' && normalizeBookingStatus(b.status) !== statusFilter) return false;
            return true;
        });

        const dir = sortOrder === 'desc' ? -1 : 1;
        filteredLabBookings.sort((a, b) => {
            let cmp = 0;
            if (sortBy === 'subject') {
                cmp = String(a.subject || '').localeCompare(String(b.subject || ''), 'zh-Hant')
                    || String(a.date || '').localeCompare(String(b.date || ''))
                    || String(a.timeslotId || '').localeCompare(String(b.timeslotId || ''));
            } else if (sortBy === 'location') {
                cmp = String(a.location || '').localeCompare(String(b.location || ''), 'zh-Hant')
                    || String(a.date || '').localeCompare(String(b.date || ''))
                    || String(a.timeslotId || '').localeCompare(String(b.timeslotId || ''));
            } else {
                cmp = String(a.date || '').localeCompare(String(b.date || ''))
                    || String(a.timeslotId || '').localeCompare(String(b.timeslotId || ''))
                    || String(a.location || '').localeCompare(String(b.location || ''), 'zh-Hant');
            }
            return cmp * dir;
        });

        bookingTablePage = 1;
        renderBookingTable();
        renderBookingWeekCalendar();
    }

    function renderBookingTable() {
        const tbody = document.getElementById('booking-table-body');
        const emptyEl = document.getElementById('booking-empty');
        const statsEl = document.getElementById('booking-stats');
        if (!tbody) return;

        const list = filteredLabBookings;
        const conflictMap = getBookingConflictMap(labBookings);
        tbody.innerHTML = '';

        if (statsEl) {
            statsEl.textContent = `顯示 ${list.length} / 共 ${labBookings.length} 筆預約`;
        }

        const pager = document.getElementById('booking-pager');
        const pagerLabel = document.getElementById('booking-pager-label');
        const pageCount = Math.max(1, Math.ceil(list.length / BOOKING_PAGE_SIZE));
        if (bookingTablePage > pageCount) bookingTablePage = pageCount;
        const pageStart = (bookingTablePage - 1) * BOOKING_PAGE_SIZE;
        const pageItems = list.slice(pageStart, pageStart + BOOKING_PAGE_SIZE);
        if (pager) {
            pager.classList.toggle('hidden', list.length <= BOOKING_PAGE_SIZE);
            if (pagerLabel) pagerLabel.textContent = `第 ${bookingTablePage} / ${pageCount} 頁`;
        }

        if (!list.length) {
            if (emptyEl) emptyEl.classList.remove('hidden');
            return;
        }
        if (emptyEl) emptyEl.classList.add('hidden');

        tbody.innerHTML = pageItems.map(b => {
            const status = normalizeBookingStatus(b.status);
            const conflict = bookingHasConflict(b, conflictMap);
            const rowClass = `booking-row-${status} booking-status-${status} transition text-sm border-b border-stone-100 last:border-0`;
            const conflictBadge = conflict
                ? '<span class="ml-1 text-[10px] text-amber-700 font-semibold" title="同日同室另有預約">⚠</span>'
                : '';
            const typeCell = b.sessionType === 'non-experimental'
                ? '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">非實驗</span>'
                : '<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">實驗</span>';
            const ipadCell = b.ipadsNeeded
                ? '<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs" title="需要 iPad">📱</span>'
                : '<span class="text-stone-300">—</span>';
            const timeslotLabel = b.timeslot || BOOKING_TIMESLOTS.find(t => t.id === b.timeslotId)?.label || '—';
            const tutorLabel = b.tutor || formatBookingTutorLabel(b.tutorName, b.tutorNumber) || '—';
            const groupsCell = b.sessionType === 'experimental' && b.groupCount
                ? escapeHtml(String(b.groupCount))
                : '<span class="text-stone-300">—</span>';
            const materialsSummary = formatBookingMaterialsSummary(b);
            const adminActions = isAdmin ? `
                ${status !== 'approved' ? `<button type="button" onclick="setBookingApprovalStatus('${b.id}', 'approved')" class="text-green-700 hover:text-green-900 text-xs font-semibold mr-2">核准</button>` : ''}
                ${status !== 'rejected' ? `<button type="button" onclick="setBookingApprovalStatus('${b.id}', 'rejected')" class="text-red-600 hover:text-red-800 text-xs font-semibold mr-2">拒絕</button>` : ''}
                <button type="button" onclick="openConfirmModal('delete-booking', '${b.id}')" class="text-red-500 hover:text-red-700 text-xs font-semibold">刪除</button>
            ` : '';
            return `
                <tr class="${rowClass}">
                    <td class="px-4 py-3 font-mono text-stone-800 whitespace-nowrap">${escapeHtml(b.date || '—')}${conflictBadge}</td>
                    <td class="px-4 py-3">${getBookingStatusBadgeHtml(status)}</td>
                    <td class="px-4 py-3 text-xs text-stone-700 whitespace-nowrap">${escapeHtml(timeslotLabel)}</td>
                    <td class="px-4 py-3 font-semibold text-stone-900">${escapeHtml(b.className || '—')}</td>
                    <td class="px-4 py-3 text-xs text-stone-700">${escapeHtml(b.subject || '—')}</td>
                    <td class="px-4 py-3 text-xs text-stone-600">${escapeHtml(tutorLabel)}</td>
                    <td class="px-4 py-3 text-stone-700">${escapeHtml(b.location || '—')}</td>
                    <td class="px-4 py-3 text-stone-800">${escapeHtml(b.experiment || '—')}</td>
                    <td class="px-4 py-3 text-center">${typeCell}</td>
                    <td class="px-4 py-3 text-center text-xs font-mono">${groupsCell}</td>
                    <td class="px-4 py-3 text-center">${ipadCell}</td>
                    <td class="px-4 py-3 text-stone-600 text-xs max-w-[200px] truncate" title="${escapeHtml(materialsSummary)}">${escapeHtml(materialsSummary)}</td>
                    <td class="px-4 py-3 text-stone-600 text-xs max-w-[160px] truncate" title="${escapeHtml(b.remarks || '')}">${escapeHtml(b.remarks || '—')}</td>
                    <td class="px-4 py-3 text-right whitespace-nowrap">
                        <button type="button" onclick="openBookingModal('${b.id}')" class="text-amber-700 hover:text-amber-900 text-xs font-semibold mr-2">編輯</button>
                        ${adminActions}
                    </td>
                </tr>
            `;
        }).join('');
    }

    function openBookingModal(editId = null) {
        hideBookingHoverCard();
        const form = document.getElementById('booking-form');
        const titleEl = document.getElementById('booking-modal-title');
        const submitBtn = document.getElementById('booking-submit-btn');
        form.reset();
        document.getElementById('booking-edit-id').value = editId || '';
        const hint = document.getElementById('booking-conflict-hint');
        if (hint) hint.classList.add('hidden');

        bookingCalendarCursor = new Date();
        bookingSelectedDates = [];
        bookingDraftMaterials = [];
        bookingDraftAttachments = [];
        const attachInput = document.getElementById('booking-attachments-file');
        if (attachInput) attachInput.value = '';
        refreshBookingMaterialSuggestions();

        if (editId) {
            const item = labBookings.find(b => b.id === editId);
            if (!item) return;
            titleEl.textContent = '編輯實驗室預約';
            submitBtn.textContent = '儲存變更';
            bookingSelectedDates = item.date ? [item.date] : [];
            if (item.date) bookingCalendarCursor = new Date(item.date + 'T00:00:00');
            document.getElementById('booking-remarks').value = item.remarks || '';
            document.getElementById('booking-ipads').checked = !!item.ipadsNeeded;
            const isNon = item.sessionType === 'non-experimental';
            document.getElementById('booking-type-experimental').checked = !isNon;
            document.getElementById('booking-type-non').checked = isNon;
            document.getElementById('booking-groups').value = item.groupCount || '';
            populateBookingYearSelect(item.classYear || '');
            populateBookingSubclassSelect(item.classSubclass || '');
            populateBookingTutorSelect(item.tutor || formatBookingTutorLabel(item.tutorName, item.tutorNumber));
            populateBookingSubjectSelect(item.subject || '');
            populateBookingExperimentSelect(item.experiment);
            bookingDraftMaterials = Array.isArray(item.materials) ? item.materials.map(m => ({ ...m })) : [];
            bookingDraftAttachments = Array.isArray(item.attachments) ? item.attachments.map(f => ({ ...f })) : [];
            const statusEl = document.getElementById('booking-approval-status');
            if (statusEl) statusEl.value = normalizeBookingStatus(item.status);
            updateBookingStatusBanner(item.status);
        } else {
            titleEl.textContent = '新增實驗室預約';
            submitBtn.textContent = '儲存預約';
            bookingSelectedDates = [getNowDateValue()];
            document.getElementById('booking-type-experimental').checked = true;
            document.getElementById('booking-type-non').checked = false;
            document.getElementById('booking-groups').value = '';
            populateBookingYearSelect();
            populateBookingSubclassSelect();
            populateBookingTutorSelect();
            populateBookingSubjectSelect();
            populateBookingExperimentSelect();
            const statusEl = document.getElementById('booking-approval-status');
            if (statusEl) statusEl.value = 'pending';
            updateBookingStatusBanner('pending');
        }

        renderBookingMaterials();
        renderBookingAttachments();
        updateBookingGroupsVisibility();
        renderBookingCalendar();
        refreshBookingTimeslotOptions();

        // Preselect timeslot when editing, then show labs free for that slot
        if (editId) {
            const item = labBookings.find(b => b.id === editId);
            if (item?.timeslotId) {
                const btn = document.querySelector('#booking-timeslots [data-timeslot-id="' + item.timeslotId + '"]');
                if (btn && !btn.disabled) btn.setAttribute('aria-pressed', 'true');
            }
            refreshAvailableBookingLabs(item?.location || '');
        } else {
            refreshAvailableBookingLabs();
        }

        toggleModal('booking-modal');
    }
    window.openBookingModal = openBookingModal;

    function formatDateYMD(date) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function getWeekDateStrings(anchorDate = bookingWeekViewAnchor) {
        const base = new Date(anchorDate);
        base.setHours(0, 0, 0, 0);
        const day = base.getDay(); // 0=Sun
        const sunday = new Date(base);
        sunday.setDate(base.getDate() - day);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(sunday);
            d.setDate(sunday.getDate() + i);
            return formatDateYMD(d);
        });
    }

    function getBookingsForWeek(weekDates) {
        const set = new Set(weekDates);
        return labBookings
            .filter(b => set.has(b.date))
            .sort((a, b) => String(a.date).localeCompare(String(b.date))
                || String(a.timeslotId || '').localeCompare(String(b.timeslotId || ''))
                || String(a.location || '').localeCompare(String(b.location || ''), 'zh-Hant'));
    }

    const BOOKING_PREVIEW_ROOMS = ['601', '616', '617', '618', '619', '620', '621'];
    const BOOKING_PREVIEW_DAY_NAMES = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const BOOKING_PREVIEW_COLORS = {
        '化學': '#fff2cc',
        '物理': '#ddebf7',
        '生物': '#e2efda',
        '科學': '#fce4d6',
        '數學': '#f8d7da',
        '電腦': '#ffe599',
        '多選': '#e4d7f5',
        '學會': '#eeeeee',
        '見備註': '#f8cbad'
    };
    const BOOKING_PREVIEW_ROWS = [
        { kind: 'period', slot: '1', n: 1, time: ['08:30', '09:10'] },
        { kind: 'band', label: '20 min RECESS 09:10-09:30' },
        { kind: 'period', slot: '2', n: 2, time: ['09:30', '10:10'] },
        { kind: 'period', slot: '3', n: 3, time: ['10:15', '10:55'] },
        { kind: 'band', label: '10 min RECESS 10:55-11:05' },
        { kind: 'period', slot: '4', n: 4, time: ['11:05', '11:45'] },
        { kind: 'period', slot: '5', n: 5, time: ['11:50', '12:30'] },
        { kind: 'rule' },
        { kind: 'lunch', slot: 'lunch', time: ['12:30', '14:05'], label: 'LUNCH' },
        { kind: 'rule' },
        { kind: 'period', slot: '6', n: 6, time: ['14:10', '14:50'] },
        { kind: 'band', label: '10 min RECESS 14:50-15:00' },
        { kind: 'period', slot: '7', n: 7, time: ['15:00', '15:40'] },
        { kind: 'band', label: '10 min RECESS 15:40-15:50' },
        { kind: 'period', slot: '8', n: 8, time: ['15:50', '16:30'] },
        { kind: 'after', slot: 'after', label: 'AFTER<br>SCHOOL' }
    ];

    function bookingPreviewRoom(location) {
        const text = String(location || '').trim();
        const match = text.match(/^(\d{3})\b/);
        return match ? match[1] : (text || '未填室號');
    }

    function bookingPreviewSlot(booking) {
        const id = booking.timeslotId || BOOKING_TIMESLOTS.find(t => t.label === booking.timeslot)?.id || '';
        if (id === 'lunch') return 'lunch';
        if (id === 'after_school') return 'after';
        if (id === 'morning_reading') return 'morning';
        const period = String(id).match(/^p(\d+)$/);
        if (period) return period[1];
        return 'other';
    }

    function bookingPreviewTitle(booking) {
        return String(booking.experiment || booking.subject || '已預約').trim() || '已預約';
    }

    function renderBookingPreviewCell(items) {
        const byRoom = {};
        (items || []).forEach(booking => {
            if (normalizeBookingStatus(booking.status) === 'rejected') return;
            const room = bookingPreviewRoom(booking.location);
            if (!byRoom[room]) byRoom[room] = [];
            byRoom[room].push(booking);
        });
        const extras = Object.keys(byRoom)
            .filter(room => !BOOKING_PREVIEW_ROOMS.includes(room))
            .sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
        return BOOKING_PREVIEW_ROOMS.concat(extras).map(room => {
            const roomItems = (byRoom[room] || []).slice().sort((a, b) => {
                const rank = item => item.sessionType === 'non-experimental' ? 0 : 1;
                return rank(a) - rank(b) || bookingPreviewTitle(a).localeCompare(bookingPreviewTitle(b), 'zh-Hant');
            });
            if (!roomItems.length) {
                return `<div class="line mute"><span class="rm">:${escapeHtml(room)}:</span><span class="tx"></span></div>`;
            }
            return roomItems.map((booking, index) => {
                const standing = booking.sessionType === 'non-experimental';
                const color = standing ? '' : (BOOKING_PREVIEW_COLORS[booking.subject] || '#f4f4f5');
                const style = standing ? '' : ` style="background-color:${color}"`;
                return `<button type="button" class="line ${standing ? 'standing' : 'booked'}"${style}
                    onclick="handleBookingCalendarCardActivate(event, '${booking.id}')"
                    onmouseenter="if(!isCoarsePointerDevice()) showBookingHoverCard(event, '${booking.id}')"
                    onmouseleave="if(!isCoarsePointerDevice()) hideBookingHoverCard()">
                    <span class="rm">${index === 0 ? `:${escapeHtml(room)}:` : ''}</span>
                    <span class="tx">${escapeHtml(bookingPreviewTitle(booking))}</span>
                </button>`;
            }).join('');
        }).join('');
    }

    function renderBookingWeekCalendar() {
        const container = document.getElementById('booking-week-calendar');
        const labelEl = document.getElementById('booking-week-range-label');
        if (!container) return;
        const weekDates = getWeekDateStrings();
        const days = weekDates.slice(1, 7);
        if (labelEl) {
            labelEl.textContent = `${days[0]}（一） ～ ${days[5]}（六）`;
        }
        const byDateSlot = {};
        days.forEach(date => { byDateSlot[date] = {}; });
        getBookingsForWeek(weekDates).forEach(booking => {
            if (!byDateSlot[booking.date]) return;
            const slot = bookingPreviewSlot(booking);
            if (!byDateSlot[booking.date][slot]) byDateSlot[booking.date][slot] = [];
            byDateSlot[booking.date][slot].push(booking);
        });
        const slotUsed = slot => days.some(date => (byDateSlot[date][slot] || []).some(booking => normalizeBookingStatus(booking.status) !== 'rejected'));
        const rows = BOOKING_PREVIEW_ROWS.slice();
        if (slotUsed('morning')) rows.unshift({ kind: 'period', slot: 'morning', n: '早', time: ['07:00', '08:30'] });
        if (slotUsed('other')) rows.push({ kind: 'period', slot: 'other', n: '其他', time: ['', ''] });

        const head = `<tr><th class="corner" colspan="2"></th>${days.map((date, index) => {
            const count = Object.values(byDateSlot[date]).flat().filter(booking => normalizeBookingStatus(booking.status) !== 'rejected').length;
            const [, month, day] = date.split('-');
            return `<th class="day${index === 5 ? ' sat' : ''}">${BOOKING_PREVIEW_DAY_NAMES[index]}<small>${Number(month)}/${Number(day)}${count ? ` · ${count}項` : ''}</small></th>`;
        }).join('')}</tr>`;

        const body = rows.map(row => {
            if (row.kind === 'rule') return '<tr class="rule"><td colspan="8"></td></tr>';
            if (row.kind === 'band') return `<tr class="band"><td class="time"></td><td colspan="7">${escapeHtml(row.label)}</td></tr>`;
            const lead = row.kind === 'after'
                ? `<td class="after-label" colspan="2">${row.label}</td>`
                : row.kind === 'lunch'
                    ? `<td class="time">${escapeHtml(row.time[0])}<br>${escapeHtml(row.time[1])}</td><td class="lunch-label">${escapeHtml(row.label)}</td>`
                    : `<td class="time">${row.time[0] ? `${escapeHtml(row.time[0])}<br>${escapeHtml(row.time[1])}` : ''}</td><td class="num">${escapeHtml(String(row.n))}</td>`;
            const cells = days.map((date, index) => `<td class="${index === 5 ? 'sat' : ''}">${renderBookingPreviewCell(byDateSlot[date][row.slot])}</td>`).join('');
            return `<tr>${lead}${cells}</tr>`;
        }).join('');

        const legend = `<div class="booking-sheet-legend"><span><i class="swatch" style="background:#fff"></i>長期借用</span>${
            Object.entries(BOOKING_PREVIEW_COLORS).map(([name, color]) =>
                `<span><i class="swatch" style="background-color:${color}"></i>${escapeHtml(name)}</span>`
            ).join('')
        }<span><i class="swatch" style="background-color:#f4f4f5"></i>其他本週實驗</span></div>`;

        container.innerHTML = `
            <table class="booking-sheet">
                <colgroup>
                    <col class="time"><col class="num">
                    <col><col><col><col><col><col>
                </colgroup>
                <thead>${head}</thead>
                <tbody>${body}</tbody>
            </table>
            ${legend}`;
    }

    function shiftBookingWeekView(deltaWeeks) {
        hideBookingHoverCard();
        const d = new Date(bookingWeekViewAnchor);
        d.setDate(d.getDate() + (deltaWeeks * 7));
        bookingWeekViewAnchor = d;
        renderBookingWeekCalendar();
    }
    window.shiftBookingWeekView = shiftBookingWeekView;

    function resetBookingWeekView() {
        hideBookingHoverCard();
        bookingWeekViewAnchor = new Date();
        renderBookingWeekCalendar();
    }
    window.resetBookingWeekView = resetBookingWeekView;

    function generateWeekBookingCalendar() {
        const weekDates = getWeekDateStrings();
        const bookings = getBookingsForWeek(weekDates);
        const byDate = {};
        weekDates.forEach(d => { byDate[d] = []; });
        bookings.forEach(b => { if (byDate[b.date]) byDate[b.date].push(b); });

        const dayColumns = weekDates.map((dateStr, idx) => {
            const items = byDate[dateStr] || [];
            const bySlot = {};
            items.forEach(b => {
                const slotId = b.timeslotId || BOOKING_TIMESLOTS.find(t => t.label === b.timeslot)?.id || '_other';
                if (!bySlot[slotId]) bySlot[slotId] = [];
                bySlot[slotId].push(b);
            });
            const cards = BOOKING_TIMESLOTS.map(slot => {
                const slotItems = bySlot[slot.id] || [];
                if (!slotItems.length) {
                    return `
                        <div style="border:1px dashed #e7e5e4;background:#fafaf9;border-radius:8px;padding:6px 8px;margin-bottom:6px;font-size:0.75rem;">
                            <div style="font-weight:700;color:#a8a29e;">${escapeHtml(slot.label)}</div>
                            <div style="color:#d6d3d1;font-style:italic;">空閒</div>
                        </div>
                    `;
                }
                return slotItems.map(b => {
                    const st = normalizeBookingStatus(b.status);
                    const colors = st === 'approved'
                        ? { border: '#86efac', bg: '#dcfce7', title: '#166534' }
                        : st === 'rejected'
                            ? { border: '#fca5a5', bg: '#fee2e2', title: '#991b1b' }
                            : { border: '#93c5fd', bg: '#dbeafe', title: '#1e40af' };
                    return `
                    <div style="border:1px solid ${colors.border};background:${colors.bg};border-radius:8px;padding:6px 8px;margin-bottom:6px;font-size:0.75rem;">
                        <div style="font-weight:700;color:${colors.title};">${escapeHtml(b.timeslot || slot.label)}</div>
                        <div style="font-weight:800;color:#1c1917;">${escapeHtml(b.experiment || '—')}</div>
                        <div>${escapeHtml(b.className || '—')} · ${escapeHtml(b.subject || '—')}</div>
                        <div style="color:#78716c;">${escapeHtml(b.location || '')}</div>
                        <div style="color:#57534e;">${b.sessionType === 'non-experimental' ? '非實驗' : '實驗'}${b.sessionType === 'experimental' && b.groupCount ? ` · ${b.groupCount} 組` : ''}</div>
                        <div style="color:#a8a29e;">${escapeHtml(b.tutor || formatBookingTutorLabel(b.tutorName, b.tutorNumber) || '')}</div>
                        <div style="font-weight:700;margin-top:4px;">${escapeHtml(getBookingStatusLabel(st))}</div>
                    </div>
                `;
                }).join('');
            }).join('');
            return `
                <td style="vertical-align:top;width:14.28%;">
                    <div style="font-weight:800;margin-bottom:4px;">週${BOOKING_WEEKDAY_LABELS[idx]} ${dateStr.slice(5)}</div>
                    <div style="font-size:0.7rem;color:#a8a29e;margin-bottom:8px;">${items.length} 筆</div>
                    ${cards}
                </td>
            `;
        }).join('');

        const bodyHtml = `
            <h1>本週實驗室預約日曆</h1>
            <p class="meta">${escapeHtml(weekDates[0])}（日） ～ ${escapeHtml(weekDates[6])}（六）　｜　共 ${bookings.length} 筆預約　｜　產生時間：${escapeHtml(formatReportTimestamp())}</p>
            <table>
                <tbody>
                    <tr>${dayColumns}</tr>
                </tbody>
            </table>
        `;
        openHtmlReportWindow('本週實驗室預約日曆', bodyHtml);
    }
    window.generateWeekBookingCalendar = generateWeekBookingCalendar;

    function openBookingUsageReportModal() {
        setBookingReportPreset('month');
        toggleModal('booking-report-modal');
    }
    window.openBookingUsageReportModal = openBookingUsageReportModal;

    function setBookingReportPreset(preset) {
        const fromEl = document.getElementById('booking-report-from');
        const toEl = document.getElementById('booking-report-to');
        if (!fromEl || !toEl) return;
        const today = new Date();
        const pad = n => String(n).padStart(2, '0');
        const toStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        toEl.value = toStr;
        if (preset === 'all') {
            fromEl.value = '';
            toEl.value = '';
            return;
        }
        if (preset === 'month') {
            fromEl.value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`;
            return;
        }
        if (preset === 'term') {
            const d = new Date(today);
            d.setMonth(d.getMonth() - 2);
            fromEl.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
            return;
        }
        if (preset === 'year') {
            // Academic year roughly Sep–Aug
            const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
            fromEl.value = `${year}-09-01`;
        }
    }
    window.setBookingReportPreset = setBookingReportPreset;

    function generateBookingUsageReport() {
        const from = document.getElementById('booking-report-from')?.value || '';
        const to = document.getElementById('booking-report-to')?.value || '';
        const inRange = labBookings.filter(b => {
            if (!b.date) return false;
            if (from && b.date < from) return false;
            if (to && b.date > to) return false;
            return true;
        });

        const roomNames = getBookingLabLocations();
        const usageByLab = {};
        roomNames.forEach(name => {
            usageByLab[name] = { total: 0, experimental: 0, nonExperimental: 0, ipads: 0 };
        });
        const usageBySubject = {};
        DEFAULT_BOOKING_SUBJECTS.forEach(s => { usageBySubject[s] = { bookings: 0, classes: new Set() }; });

        let totalExperimental = 0;
        let totalNonExperimental = 0;
        let totalIpads = 0;

        inRange.forEach(b => {
            const key = b.location || '（未指定）';
            if (!usageByLab[key]) usageByLab[key] = { total: 0, experimental: 0, nonExperimental: 0, ipads: 0 };
            usageByLab[key].total += 1;
            if (b.sessionType === 'non-experimental') {
                usageByLab[key].nonExperimental += 1;
                totalNonExperimental += 1;
            } else {
                usageByLab[key].experimental += 1;
                totalExperimental += 1;
            }
            if (b.ipadsNeeded) {
                usageByLab[key].ipads += 1;
                totalIpads += 1;
            }
            const subjectKey = b.subject || '（未指定）';
            if (!usageBySubject[subjectKey]) usageBySubject[subjectKey] = { bookings: 0, classes: new Set() };
            usageBySubject[subjectKey].bookings += 1;
            if (b.className) usageBySubject[subjectKey].classes.add(b.className);
        });

        const rangeLabel = from || to
            ? `${from || '（最早）'} ～ ${to || '（最晚）'}`
            : '全部時段';

        const rowsHtml = Object.entries(usageByLab)
            .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'zh-Hant'))
            .map(([name, s]) => `
                <tr>
                    <td>${escapeHtml(name)}</td>
                    <td>${s.total}</td>
                    <td>${s.experimental}</td>
                    <td>${s.nonExperimental}</td>
                    <td>${s.ipads}</td>
                </tr>
            `).join('');

        const subjectRowsHtml = Object.entries(usageBySubject)
            .sort((a, b) => b[1].bookings - a[1].bookings || a[0].localeCompare(b[0], 'zh-Hant'))
            .map(([name, s]) => `
                <tr>
                    <td>${escapeHtml(name)}</td>
                    <td>${s.bookings}</td>
                    <td>${s.classes.size}</td>
                </tr>
            `).join('');

        const detailRows = inRange
            .slice()
            .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.location.localeCompare(b.location || '', 'zh-Hant'))
            .map(b => `
                <tr>
                    <td>${escapeHtml(b.date || '')}</td>
                    <td>${escapeHtml(b.timeslot || BOOKING_TIMESLOTS.find(t => t.id === b.timeslotId)?.label || '')}</td>
                    <td>${escapeHtml(b.className || '')}</td>
                    <td>${escapeHtml(b.subject || '')}</td>
                    <td>${escapeHtml(b.tutor || formatBookingTutorLabel(b.tutorName, b.tutorNumber) || '')}</td>
                    <td>${escapeHtml(b.location || '')}</td>
                    <td>${escapeHtml(b.experiment || '')}</td>
                    <td>${b.sessionType === 'non-experimental' ? '非實驗課' : '實驗課'}</td>
                    <td>${b.sessionType === 'experimental' && b.groupCount ? escapeHtml(String(b.groupCount)) : '—'}</td>
                    <td>${escapeHtml(getBookingStatusLabel(b.status))}</td>
                    <td>${escapeHtml(formatBookingMaterialsSummary(b))}</td>
                    <td>${b.ipadsNeeded ? '是' : '否'}</td>
                    <td>${escapeHtml(b.remarks || '')}</td>
                </tr>
            `).join('');

        const bodyHtml = `
            <h1>實驗室使用報告</h1>
            <p class="meta">統計時段：${escapeHtml(rangeLabel)}　｜　產生時間：${escapeHtml(formatReportTimestamp())}　｜　預約筆數：${inRange.length}</p>
            <div class="summary">
                <div class="card"><div class="label">預約總數</div><div class="value">${inRange.length}</div></div>
                <div class="card"><div class="label">實驗課</div><div class="value">${totalExperimental}</div></div>
                <div class="card"><div class="label">非實驗課</div><div class="value">${totalNonExperimental}</div></div>
                <div class="card"><div class="label">需 iPad</div><div class="value">${totalIpads}</div></div>
            </div>
            <h2 style="font-size:1.1rem;margin:1.25rem 0 0.5rem;">各實驗室使用統計</h2>
            <table>
                <thead>
                    <tr>
                        <th>實驗室</th>
                        <th>使用次數</th>
                        <th>實驗課</th>
                        <th>非實驗課</th>
                        <th>需 iPad</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml || '<tr><td colspan="5">此時段沒有預約記錄</td></tr>'}</tbody>
            </table>
            <h2 style="font-size:1.1rem;margin:1.5rem 0 0.5rem;">各科目課堂統計</h2>
            <table>
                <thead>
                    <tr>
                        <th>科目</th>
                        <th>課堂／預約數</th>
                        <th>班別數</th>
                    </tr>
                </thead>
                <tbody>${subjectRowsHtml || '<tr><td colspan="3">此時段沒有預約記錄</td></tr>'}</tbody>
            </table>
            <h2 style="font-size:1.1rem;margin:1.5rem 0 0.5rem;">預約明細</h2>
            <table>
                <thead>
                    <tr>
                        <th>日期</th>
                        <th>時段</th>
                        <th>班別</th>
                        <th>科目</th>
                        <th>導師</th>
                        <th>實驗室</th>
                        <th>項目</th>
                        <th>類型</th>
                        <th>組數</th>
                        <th>狀態</th>
                        <th>物資／附件</th>
                        <th>iPad</th>
                        <th>備註</th>
                    </tr>
                </thead>
                <tbody>${detailRows || '<tr><td colspan="13">此時段沒有預約記錄</td></tr>'}</tbody>
            </table>
        `;

        openHtmlReportWindow('實驗室使用報告', bodyHtml);
        hideModal('booking-report-modal');
    }
    window.generateBookingUsageReport = generateBookingUsageReport;

    async function processMsdsUploadFiles(fileList, existingCount = 0) {
        const files = Array.from(fileList || []);
        if (!files.length) return [];

        if (existingCount + files.length > INVENTORY_MSDS_MAX_FILES) {
            throw new Error(`每項化學品最多 ${INVENTORY_MSDS_MAX_FILES} 份 MSDS。`);
        }

        const cloud = await ensureCloudSync();
        if (!cloud) {
            throw new Error('雲端同步尚未就緒，請稍候數秒後重試。');
        }

        const uploaded = [];
        const now = new Date();
        const uploadedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        for (const file of files) {
            const fileType = getMsdsFileType(file);
            if (!fileType) {
                throw new Error(`「${file.name}」格式不支援。請使用 PDF、圖片或 .docx。`);
            }
            if (file.size > INVENTORY_MSDS_MAX_BYTES) {
                throw new Error(`「${file.name}」超過 4MB 上限。`);
            }
            const url = resolveCloudUploadResult(await cloud.uploadFile(file, 'msds_files')).url;
            if (!url) {
                throw new Error(`「${file.name}」雲端上傳失敗，請檢查網路或 Firebase 設定。`);
            }
            uploaded.push({
                id: 'msds_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                fileName: file.name,
                fileType,
                mimeType: file.type || (fileType === 'pdf' ? 'application/pdf' : 'application/octet-stream'),
                fileSize: file.size,
                url,
                uploadedAt
            });
        }
        return uploaded;
    }

    async function processInventoryPhotoUploadFiles(fileList, existingCount = 0) {
        const files = Array.from(fileList || []);
        if (!files.length) return [];

        if (existingCount + files.length > INVENTORY_PHOTO_MAX_FILES) {
            throw new Error(`每項物資最多 ${INVENTORY_PHOTO_MAX_FILES} 張照片。`);
        }

        const cloud = await ensureCloudSync();
        if (!cloud) {
            throw new Error('雲端同步尚未就緒，請稍候數秒後重試。');
        }

        const uploaded = [];
        const now = new Date();
        const uploadedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                throw new Error(`「${file.name}」格式不支援。請上傳圖片（JPG/PNG/WEBP/GIF）。`);
            }
            if (file.size > INVENTORY_PHOTO_MAX_BYTES) {
                throw new Error(`「${file.name}」超過 4MB 上限。`);
            }
            const url = resolveCloudUploadResult(await cloud.uploadFile(file, 'inventory_photos')).url;
            if (!url) {
                throw new Error(`「${file.name}」雲端上傳失敗，請檢查網路或 Firebase 設定。`);
            }
            uploaded.push({
                id: 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                fileName: file.name,
                fileType: 'image',
                mimeType: file.type || 'image/jpeg',
                fileSize: file.size,
                url,
                uploadedAt
            });
        }
        return uploaded;
    }

    function renderInventoryMsdsExisting(containerId, invId, editable = false) {
        const container = document.getElementById(containerId);
        const item = inventories.find(v => v.id === invId);
        const files = getInventoryMsds(item);
        if (!container) return;

        if (!files.length) {
            container.innerHTML = '<p class="text-xs text-stone-400 italic">尚未上傳 MSDS</p>';
            return;
        }

        const typeIcons = { image: '🖼️', pdf: '📕', docx: '📝' };
        container.innerHTML = files.map(f => `
            <div class="flex items-center justify-between bg-stone-50 rounded px-2 py-1.5 gap-2">
                <span class="text-xs text-stone-700 truncate">${typeIcons[f.fileType] || '📄'} ${escapeHtml(f.fileName)} <span class="text-stone-400">(${formatMsdsFileSize(f.fileSize)})</span></span>
                <div class="flex gap-2 shrink-0">
                    <button type="button" onclick="previewInventoryMsds('${invId}', '${f.id}')" class="text-amber-700 hover:text-amber-900 text-[10px] font-semibold">預覽</button>
                    <button type="button" onclick="downloadInventoryMsds('${invId}', '${f.id}')" class="text-slate-600 hover:text-slate-900 text-[10px] font-semibold">下載</button>
                    ${editable ? `<button type="button" onclick="openConfirmModal('delete-inventory-msds', '${invId}::${f.id}')" class="text-red-400 hover:text-red-600 text-[10px]">移除</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    function renderInventoryPhotosExisting(containerId, invId, editable = false) {
        const container = document.getElementById(containerId);
        const item = inventories.find(v => v.id === invId);
        const files = getInventoryPhotos(item);
        if (!container) return;

        if (!files.length) {
            container.innerHTML = '<p class="text-xs text-stone-400 italic">尚未上傳照片</p>';
            return;
        }

        container.innerHTML = files.map(f => {
            const url = getInventoryAttachmentUrl(f);
            const thumb = url
                ? `<img src="${url}" alt="" class="w-8 h-8 object-cover rounded border border-stone-200 shrink-0">`
                : '🖼️';
            return `
            <div class="flex items-center justify-between bg-stone-50 rounded px-2 py-1.5 gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    ${thumb}
                    <span class="text-xs text-stone-700 truncate">${escapeHtml(f.fileName)} <span class="text-stone-400">(${formatMsdsFileSize(f.fileSize)})</span></span>
                </div>
                <div class="flex gap-2 shrink-0">
                    <button type="button" onclick="previewInventoryPhoto('${invId}', '${f.id}')" class="text-amber-700 hover:text-amber-900 text-[10px] font-semibold">預覽</button>
                    <button type="button" onclick="downloadInventoryPhoto('${invId}', '${f.id}')" class="text-slate-600 hover:text-slate-900 text-[10px] font-semibold">下載</button>
                    ${editable ? `<button type="button" onclick="openConfirmModal('delete-inventory-photo', '${invId}::${f.id}')" class="text-red-400 hover:text-red-600 text-[10px]">移除</button>` : ''}
                </div>
            </div>
        `;
        }).join('');
    }

    function downloadInventoryMsds(invId, fileId) {
        const item = inventories.find(v => v.id === invId);
        const file = getInventoryMsds(item).find(f => f.id === fileId);
        const url = getInventoryAttachmentUrl(file);
        if (!url) {
            openInfoModal('⚠️ 無法下載', '找不到此 MSDS 檔案。', '📂');
            return;
        }
        openOrDownloadFile(url, file.fileName || 'msds-file');
    }

    function previewInventoryMsds(invId, fileId) {
        const item = inventories.find(v => v.id === invId);
        const file = getInventoryMsds(item).find(f => f.id === fileId);
        const preview = document.getElementById('msds-view-preview');
        const url = getInventoryAttachmentUrl(file);
        if (!url || !preview) return;

        if (file.fileType === 'pdf') {
            preview.innerHTML = `<div class="w-full min-h-[320px]"></div>`;
            embedPdfInContainer(preview.firstElementChild, url, file.fileName);
        } else if (file.fileType === 'image') {
            preview.innerHTML = `<img src="${toViewableFileUrl(url)}" alt="${escapeHtml(file.fileName)}" class="max-w-full max-h-[min(70dvh,480px)] mx-auto rounded-lg border border-stone-200">`;
        } else {
            preview.innerHTML = `<div class="text-center text-sm text-stone-600 space-y-3"><p>📝 Word 文件無法在瀏覽器內直接預覽。</p><button type="button" onclick="downloadInventoryMsds('${invId}', '${file.id}')" class="bg-stone-800 hover:bg-stone-900 text-white px-4 py-2 rounded-lg text-sm font-semibold">下載 ${escapeHtml(file.fileName)}</button></div>`;
        }
    }

    function openMsdsViewer(invId) {
        const item = inventories.find(v => v.id === invId);
        const files = getInventoryMsds(item);
        if (!item || !files.length) {
            openInfoModal('⚠️ 無 MSDS', '此化學品尚未上傳安全資料表。', '📄');
            return;
        }

        const titleEl = document.getElementById('msds-view-title');
        const subtitleEl = document.getElementById('msds-view-subtitle');
        const filesEl = document.getElementById('msds-view-files');
        const previewEl = document.getElementById('msds-view-preview');
        if (titleEl) titleEl.textContent = buildInventoryDisplayName(item);
        if (subtitleEl) subtitleEl.textContent = `${item.category} · ${item.location} · ${item.quantity}${item.stockQuantity ? ` · 數量 ${item.stockQuantity}` : ''}`;
        if (previewEl) {
            previewEl.innerHTML = '<p class="text-stone-400 text-sm text-center">點擊上方「預覽」以檢視 MSDS 內容</p>';
        }

        const typeIcons = { image: '🖼️', pdf: '📕', docx: '📝' };
        if (filesEl) {
            filesEl.innerHTML = files.map(f => `
                <div class="flex items-center justify-between gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-stone-800 truncate">${typeIcons[f.fileType] || '📄'} ${escapeHtml(f.fileName)}</p>
                        <p class="text-[10px] text-stone-400">${formatMsdsFileSize(f.fileSize)}${f.uploadedAt ? ` · 上傳於 ${escapeHtml(f.uploadedAt)}` : ''}</p>
                    </div>
                    <div class="flex gap-2 shrink-0">
                        <button type="button" onclick="previewInventoryMsds('${invId}', '${f.id}')" class="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">預覽</button>
                        <button type="button" onclick="downloadInventoryMsds('${invId}', '${f.id}')" class="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold">下載</button>
                    </div>
                </div>
            `).join('');
        }

        toggleModal('msds-view-modal');
        if (files.length === 1) {
            previewInventoryMsds(invId, files[0].id);
        }
    }

    function downloadInventoryPhoto(invId, fileId) {
        const item = inventories.find(v => v.id === invId);
        const file = getInventoryPhotos(item).find(f => f.id === fileId);
        const url = getInventoryAttachmentUrl(file);
        if (!url) {
            openInfoModal('⚠️ 無法下載', '找不到此照片。', '📂');
            return;
        }
        openOrDownloadFile(url, file.fileName || 'inventory-photo');
    }

    function previewInventoryPhoto(invId, fileId, skipModalOpen = false) {
        const item = inventories.find(v => v.id === invId);
        const file = getInventoryPhotos(item).find(f => f.id === fileId);
        const preview = document.getElementById('inventory-photo-view-preview');
        const url = getInventoryAttachmentUrl(file);
        if (!file || !url || !preview) {
            openInfoModal('⚠️ 無法預覽', '找不到此照片。', '📂');
            return;
        }

        const modal = document.getElementById('inventory-photo-view-modal');
        if (!skipModalOpen && modal?.classList.contains('hidden')) {
            openInventoryPhotoViewer(invId, fileId);
            return;
        }

        const subtitleEl = document.getElementById('inventory-photo-view-subtitle');
        if (subtitleEl) subtitleEl.textContent = file.fileName || '';
        preview.innerHTML = `<img src="${toViewableFileUrl(url)}" alt="${escapeHtml(file.fileName)}" class="max-w-full max-h-[min(70dvh,520px)] mx-auto rounded-lg border border-stone-200 object-contain">`;
    }

    function openInventoryPhotoViewer(invId, focusFileId = null) {
        const item = inventories.find(v => v.id === invId);
        const files = getInventoryPhotos(item);
        if (!item || !files.length) {
            openInfoModal('⚠️ 無照片', '此物資尚未上傳照片。', '📷');
            return;
        }

        const titleEl = document.getElementById('inventory-photo-view-title');
        const subtitleEl = document.getElementById('inventory-photo-view-subtitle');
        const filesEl = document.getElementById('inventory-photo-view-files');
        const previewEl = document.getElementById('inventory-photo-view-preview');
        if (titleEl) titleEl.textContent = buildInventoryDisplayName(item);
        if (subtitleEl) subtitleEl.textContent = `${item.category} · ${item.location}`;
        if (previewEl) {
            previewEl.innerHTML = '<p class="text-stone-400 text-sm text-center">點擊縮圖或「預覽」以檢視照片</p>';
        }

        if (filesEl) {
            filesEl.innerHTML = files.map(f => {
                const url = getInventoryAttachmentUrl(f);
                return `
                <div class="bg-stone-50 border border-stone-200 rounded-lg p-2 flex flex-col gap-2">
                    <button type="button" onclick="previewInventoryPhoto('${invId}', '${f.id}', true)" class="rounded overflow-hidden border border-stone-200 hover:ring-2 hover:ring-indigo-400 transition aspect-square bg-white">
                        <img src="${url}" alt="" class="w-full h-full object-cover">
                    </button>
                    <p class="text-[10px] text-stone-600 truncate" title="${escapeHtml(f.fileName)}">${escapeHtml(f.fileName)}</p>
                    <div class="flex gap-1">
                        <button type="button" onclick="previewInventoryPhoto('${invId}', '${f.id}', true)" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded text-[10px] font-semibold">預覽</button>
                        <button type="button" onclick="downloadInventoryPhoto('${invId}', '${f.id}')" class="flex-1 bg-slate-600 hover:bg-slate-700 text-white px-2 py-1 rounded text-[10px] font-semibold">下載</button>
                    </div>
                </div>
            `;
            }).join('');
        }

        showModal('inventory-photo-view-modal');
        const autoPreviewId = focusFileId || (files.length === 1 ? files[0].id : null);
        if (autoPreviewId) {
            previewInventoryPhoto(invId, autoPreviewId, true);
        }
    }

    function renderInventoryPhotosCell(item) {
        const files = getInventoryPhotos(item);
        const firstUrl = files.length ? getInventoryAttachmentUrl(files[0]) : null;
        const thumb = firstUrl
            ? `<button type="button" onclick="openInventoryPhotoViewer('${item.id}')" class="shrink-0 rounded overflow-hidden border border-stone-200 hover:ring-2 hover:ring-indigo-400 transition" title="檢視照片"><img src="${firstUrl}" alt="" class="w-9 h-9 object-cover"></button>`
            : '';
        const countLabel = files.length
            ? `<span class="bg-indigo-50 text-indigo-800 text-xs px-2 py-0.5 rounded font-semibold">${files.length} 張</span>`
            : '<span class="text-xs text-stone-400 italic">無</span>';
        const viewBtn = files.length
            ? `<button onclick="openInventoryPhotoViewer('${item.id}')" class="text-indigo-700 hover:text-indigo-900 text-xs font-semibold ml-2">檢視</button>`
            : '';
        const uploadBtn = isAdmin
            ? `<button onclick="openEditInventoryModal('${item.id}')" class="text-slate-600 hover:text-slate-900 text-xs font-semibold ml-2">${files.length ? '管理' : '上傳'}</button>`
            : '';
        return `<div class="flex flex-wrap items-center gap-2">${thumb}${countLabel}${viewBtn}${uploadBtn}</div>`;
    }

    function renderInventoryMsdsCell(item) {
        if (!supportsInventoryMsds(item.category)) {
            return '<span class="text-xs text-stone-300">—</span>';
        }
        const files = getInventoryMsds(item);
        const countLabel = files.length
            ? `<span class="bg-emerald-50 text-emerald-800 text-xs px-2 py-0.5 rounded font-semibold">${files.length} 份</span>`
            : '<span class="text-xs text-stone-400 italic">未上傳</span>';
        const viewBtn = files.length
            ? `<button onclick="openMsdsViewer('${item.id}')" class="text-amber-700 hover:text-amber-900 text-xs font-semibold ml-2">檢視</button>`
            : '';
        const uploadBtn = isAdmin
            ? `<button onclick="openEditInventoryModal('${item.id}')" class="text-slate-600 hover:text-slate-900 text-xs font-semibold ${files.length ? 'ml-2' : 'ml-0'}">${files.length ? '管理' : '上傳'}</button>`
            : '';
        return `<div class="flex flex-wrap items-center">${countLabel}${viewBtn}${uploadBtn}</div>`;
    }

    function renderInventoryNameCell(item) {
        const zh = item.nameZh && item.nameZh !== '—' ? escapeHtml(item.nameZh) : '';
        const en = item.nameEn && item.nameEn !== '—' ? escapeHtml(item.nameEn) : '';
        if (!zh && !en) return '<span class="text-stone-400">—</span>';
        const zhLine = zh ? `<div class="font-bold text-stone-900 leading-snug">${zh}</div>` : '';
        const enLine = en ? `<div class="text-xs text-stone-500 mt-0.5 leading-snug">${en}</div>` : '';
        return `<div class="min-w-[8rem]">${zhLine}${enLine}</div>`;
    }

    function getInventoryLocations() {
        return [...new Set(inventories.map(v => v.location).filter(Boolean))].sort();
    }

    function populateInventoryLocationSelect(selected = '', prefix = 'inv') {
        populateComboSelect(
            `${prefix}-location-select`,
            `${prefix}-location`,
            getInventoryLocations(),
            selected,
            '— 選擇現有儲位 —',
            '✏️ 手動輸入新儲位...'
        );
    }

    function handleInvLocationSelectChange() {
        handleComboSelectChange('inv-location-select', 'inv-location');
    }

    function getInvLocationValue() {
        return getComboSelectValue('inv-location-select', 'inv-location');
    }

    function getEditInvLocationValue() {
        return getComboSelectValue('edit-inv-location-select', 'edit-inv-location');
    }

    function openInventoryModal() {
        document.getElementById('inventory-form').reset();
        const autoCb = document.getElementById('inv-auto-ai-hazards');
        if (autoCb) autoCb.checked = true;
        setInventoryHazardAiStatus('inv', '');
        updateInventoryMsdsVisibility('inv');
        populateInventoryLocationSelect();
        populateInventoryCategorySelect('inv');
        toggleModal('inventory-modal');
    }

    function openEditInventoryModal(id) {
        const item = inventories.find(v => v.id === id);
        if (!item) return;

        document.getElementById('edit-inv-id').value = item.id;
        document.getElementById('edit-inv-name-en').value = item.nameEn || '';
        document.getElementById('edit-inv-name-zh').value = item.nameZh || '';
        document.getElementById('edit-inv-formula').value = item.formula && item.formula !== '—' ? item.formula : '';
        populateInventoryCategorySelect('edit-inv', item.category);
        document.getElementById('edit-inv-quantity').value = item.quantity || '';
        document.getElementById('edit-inv-stock-quantity').value = item.stockQuantity || '';
        populateInventoryLocationSelect(item.location, 'edit-inv');
        document.getElementById('edit-inv-hazards').value = item.hazards;
        const msdsInput = document.getElementById('edit-inv-msds-file');
        if (msdsInput) msdsInput.value = '';
        const photosInput = document.getElementById('edit-inv-photos-file');
        if (photosInput) photosInput.value = '';
        updateInventoryMsdsVisibility('edit');
        renderInventoryMsdsExisting('edit-inv-msds-existing', id, true);
        renderInventoryPhotosExisting('edit-inv-photos-existing', id, true);

        toggleModal('edit-inventory-modal');
    }

    // 儲存修改後的物資
    document.getElementById('edit-inventory-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const id = document.getElementById('edit-inv-id').value;
        const index = inventories.findIndex(v => v.id === id);

        if (index === -1) return;

        const category = getInventoryCategoryValue('edit-inv');
        if (!category) {
            openInfoModal('⚠️ 請選擇類別', '請從下拉選單選擇物資類別，或選擇「手動輸入」後填寫新類別。', '📂');
            return;
        }
        const location = getEditInvLocationValue();
        if (!location) {
            openInfoModal('⚠️ 請選擇儲位', '請從下拉選單選擇現有儲位，或選擇「手動輸入」後填寫新位置。', '📍');
            return;
        }
        const existing = inventories[index];
        let msds = getInventoryMsds(existing);
        let photos = getInventoryPhotos(existing);

        try {
            if (supportsInventoryMsds(category)) {
                const newFiles = document.getElementById('edit-inv-msds-file')?.files;
                if (newFiles?.length) {
                    const added = await processMsdsUploadFiles(newFiles, msds.length);
                    msds = [...msds, ...added];
                }
            } else {
                msds = [];
            }

            const newPhotoFiles = document.getElementById('edit-inv-photos-file')?.files;
            if (newPhotoFiles?.length) {
                const addedPhotos = await processInventoryPhotoUploadFiles(newPhotoFiles, photos.length);
                photos = [...photos, ...addedPhotos];
            }

            inventories[index] = enrichInventoryItem({
                id,
                nameEn: document.getElementById('edit-inv-name-en').value.trim(),
                nameZh: document.getElementById('edit-inv-name-zh').value.trim(),
                formula: document.getElementById('edit-inv-formula').value.trim() || '—',
                category,
                quantity: document.getElementById('edit-inv-quantity').value.trim(),
                stockQuantity: document.getElementById('edit-inv-stock-quantity').value.trim(),
                location,
                hazards: document.getElementById('edit-inv-hazards').value.trim() || '無',
                msds,
                photos
            });

            await persistInventories();
            filterInventory();
            hideModal('edit-inventory-modal');
            this.reset();
            openInfoModal('✏️ 修改成功', '該化學品或物資記錄已成功更新並同步至雲端。', '✨');
        } catch (err) {
            openInfoModal('❌ 儲存失敗', err.message || '儲存時發生錯誤。', '⚠️');
        }
    });

    // ================= 3. 物資定位渲染與篩選 =================
    function renderInventoryTable(filteredList = null) {
        const selectionCleared = refreshInventoryCategoryFilter();
        const listToRender = selectionCleared ? getFilteredInventory() : (filteredList ?? getFilteredInventory());
        const tbody = document.getElementById('inventory-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        const adminHeaders = document.querySelectorAll('.admin-only');
        adminHeaders.forEach(th => {
            if (isAdmin) {
                th.classList.remove('hidden');
            } else {
                th.classList.add('hidden');
            }
        });

        if (listToRender.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="${isAdmin ? 10 : 9}" class="px-6 py-8 text-center text-stone-400 italic">
                        ❌ 未找到任何符合的物資或化學藥品紀錄
                    </td>
                </tr>
            `;
            return;
        }

        listToRender.forEach(v => {
            const hazardBadges = v.hazards.split(/[,，]/).map(tag => {
                const trimmed = tag.trim();
                if (!trimmed || trimmed === '—') {
                    return `<span class="bg-stone-100 text-stone-500 text-xs px-2 py-0.5 rounded">—</span>`;
                }
                if (trimmed === '無') {
                    return `<span class="bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded">無危害</span>`;
                }
                if (trimmed === 'N/AP') {
                    return `<span class="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded border border-slate-200">N/AP</span>`;
                }
                
                let badgeColor = "bg-red-100 text-red-700";
                if(trimmed.includes("易燃")) badgeColor = "bg-amber-100 text-amber-800 border border-amber-200";
                if(trimmed.includes("強氧化")) badgeColor = "bg-orange-100 text-orange-800 border border-orange-200";
                if(trimmed.includes("遇水")) badgeColor = "bg-blue-100 text-blue-800 border border-blue-200";
                if(trimmed.includes("劇毒")) badgeColor = "bg-purple-100 text-purple-800 border border-purple-200";

                return `<span class="${badgeColor} text-xs px-2 py-0.5 rounded font-semibold">${trimmed}</span>`;
            }).join(' ');

            // ✏️ 解鎖編輯按鈕並放置於「下架」按鈕旁
            const actionCell = isAdmin ? `
                <td class="px-6 py-4 text-right admin-only">
                    <button onclick="openEditInventoryModal('${v.id}')" class="text-amber-600 hover:text-amber-800 font-semibold text-xs mr-3 transition">編輯</button>
                    <button onclick="openConfirmModal('delete-inv', '${v.id}')" class="text-red-500 hover:text-red-700 font-semibold text-xs transition">下架</button>
                </td>
            ` : '';

            tbody.innerHTML += `
                <tr class="hover:bg-stone-50 transition">
                    <td class="px-6 py-4">${renderInventoryNameCell(v)}</td>
                    <td class="py-4 inv-col-formula font-mono text-indigo-800" title="${escapeHtml(v.formula && v.formula !== '—' ? v.formula : '—')}">${escapeHtml(v.formula && v.formula !== '—' ? v.formula : '—')}</td>
                    <td class="px-6 py-4 text-stone-600 text-xs font-semibold">${v.category}</td>
                    <td class="px-6 py-4 text-stone-700 font-mono text-xs">${v.location}</td>
                    <td class="px-6 py-4 text-stone-800 font-semibold text-xs">${escapeHtml(v.quantity || '—')}</td>
                    <td class="px-6 py-4 text-stone-800 font-semibold text-xs whitespace-nowrap">${escapeHtml(v.stockQuantity || '—')}</td>
                    <td class="px-6 py-4">${hazardBadges}</td>
                    <td class="px-6 py-4">${renderInventoryPhotosCell(v)}</td>
                    <td class="px-6 py-4">${renderInventoryMsdsCell(v)}</td>
                    ${actionCell}
                </tr>
            `;
        });
    }

    function compareInventoryText(a, b) {
        return (a || '').localeCompare(b || '', 'zh-Hant', { sensitivity: 'base', numeric: true });
    }

    function getInventorySortKey(item) {
        const sortBy = document.getElementById('inventory-sort')?.value || 'default';
        if (sortBy === 'location-asc' || sortBy === 'location-desc') return item.location || '';
        if (sortBy === 'category-asc' || sortBy === 'category-desc') return item.category || '';
        if (sortBy === 'name-asc' || sortBy === 'name-desc') {
            return item.nameEn || item.nameZh || item.name || '';
        }
        return '';
    }

    function sortInventoryList(list) {
        const sortBy = document.getElementById('inventory-sort')?.value || 'default';
        if (!list.length || sortBy === 'default') {
            const orderMap = new Map(inventories.map((v, i) => [v.id, i]));
            return [...list].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
        }

        const desc = sortBy.endsWith('-desc');
        return [...list].sort((a, b) => {
            const cmp = compareInventoryText(getInventorySortKey(a), getInventorySortKey(b));
            if (cmp !== 0) return desc ? -cmp : cmp;
            return compareInventoryText(a.name || '', b.name || '');
        });
    }

    function getFilteredInventory() {
        const query = document.getElementById('inventory-search').value.toLowerCase().trim();
        const categoryFilter = document.getElementById('inventory-filter-cat').value;

        const filtered = inventories.filter(v => {
            const matchesQuery = getInventorySearchLabel(v).includes(query);
            const matchesCat = (categoryFilter === 'all') || (v.category === categoryFilter);
            return matchesQuery && matchesCat;
        });

        return sortInventoryList(filtered);
    }

    function filterInventory() {
        renderInventoryTable(getFilteredInventory());
    }

    function populateIncidentFilterOptions() {
        const typeEl = document.getElementById('filter-analytics-type');
        const classEl = document.getElementById('filter-analytics-class');
        const locationEl = document.getElementById('filter-analytics-location');

        if (typeEl) {
            const currentType = typeEl.value;
            const types = getIncidentCategories();
            typeEl.innerHTML = '<option value="all">所有事故類別</option>';
            types.forEach(type => {
                typeEl.innerHTML += `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`;
            });
            typeEl.value = types.includes(currentType) ? currentType : 'all';
        }

        if (classEl) {
            const currentClass = classEl.value;
            const classes = [...new Set(incidents.map(inc => inc.studentClass).filter(Boolean))].sort();
            classEl.innerHTML = '<option value="all">所有班別</option>';
            classes.forEach(cls => {
                classEl.innerHTML += `<option value="${cls}">${cls}</option>`;
            });
            classEl.value = classes.includes(currentClass) ? currentClass : 'all';
        }

        if (locationEl) {
            const currentLocation = locationEl.value;
            const locations = [...new Set(incidents.map(inc => inc.location).filter(Boolean))].sort();
            locationEl.innerHTML = '<option value="all">所有地點</option>';
            locations.forEach(loc => {
                locationEl.innerHTML += `<option value="${loc}">${loc}</option>`;
            });
            locationEl.value = locations.includes(currentLocation) ? currentLocation : 'all';
        }
    }

    function populateClassFilter() {
        populateIncidentFilterOptions();
    }

    function incidentMatchesDateRange(inc, dateFrom, dateTo) {
        if (!dateFrom && !dateTo) return true;
        if (!inc.date) return false;
        if (dateFrom && inc.date < dateFrom) return false;
        if (dateTo && inc.date > dateTo) return false;
        return true;
    }

    function resetAnalyticsFilters() {
        const typeEl = document.getElementById('filter-analytics-type');
        const severityEl = document.getElementById('filter-analytics-severity');
        const classEl = document.getElementById('filter-analytics-class');
        const locationEl = document.getElementById('filter-analytics-location');
        const dateFromEl = document.getElementById('filter-analytics-date-from');
        const dateToEl = document.getElementById('filter-analytics-date-to');
        const searchEl = document.getElementById('filter-analytics-search');

        if (typeEl) typeEl.value = 'all';
        if (severityEl) severityEl.value = 'all';
        if (classEl) classEl.value = 'all';
        if (locationEl) locationEl.value = 'all';
        if (dateFromEl) dateFromEl.value = '';
        if (dateToEl) dateToEl.value = '';
        if (searchEl) searchEl.value = '';

        filteredIncidents = [...incidents];
        renderIncidents(filteredIncidents);
        calculateAndDisplayStats(filteredIncidents);
    }

    function applyAnalyticsFilters() {
        const typeFilter = document.getElementById('filter-analytics-type').value;
        const severityFilter = document.getElementById('filter-analytics-severity').value;
        const classFilter = document.getElementById('filter-analytics-class').value;
        const locationFilter = document.getElementById('filter-analytics-location').value;
        const dateFrom = document.getElementById('filter-analytics-date-from').value;
        const dateTo = document.getElementById('filter-analytics-date-to').value;
        const searchQuery = document.getElementById('filter-analytics-search').value.toLowerCase().trim();

        filteredIncidents = incidents.filter(inc => {
            const matchesType = (typeFilter === 'all') || (inc.category === typeFilter);
            const matchesSeverity = (severityFilter === 'all') || (inc.severity.includes(severityFilter));
            const matchesClass = (classFilter === 'all') || (inc.studentClass === classFilter);
            const matchesLocation = (locationFilter === 'all') || (inc.location === locationFilter);
            const matchesDate = incidentMatchesDateRange(inc, dateFrom, dateTo);
            const matchesSearch = !searchQuery || [
                inc.studentClass,
                inc.classNumber,
                inc.location,
                inc.category,
                inc.notes
            ].some(field => (field || '').toLowerCase().includes(searchQuery));

            return matchesType && matchesSeverity && matchesClass && matchesLocation && matchesDate && matchesSearch;
        });

        renderIncidents(filteredIncidents);
        calculateAndDisplayStats(filteredIncidents);
    }

    function calculateAndDisplayStats(filteredList) {
        const totalCountEl = document.getElementById('stats-total-count');
        const percentageEl = document.getElementById('stats-percentage');
        const severeEl = document.getElementById('stats-severe-count');
        const topCategoryEl = document.getElementById('stats-top-category');
        if (!totalCountEl || !percentageEl || !severeEl || !topCategoryEl) return;

        const totalFiltered = filteredList.length;
        const totalAll = incidents.length;

        totalCountEl.textContent = totalFiltered;

        const percentage = totalAll > 0 ? Math.round((totalFiltered / totalAll) * 100) : 0;
        percentageEl.textContent = `${percentage}%`;

        const severeCount = filteredList.filter(inc => inc.severity.includes('中度') || inc.severity.includes('嚴重')).length;
        severeEl.textContent = `${severeCount} 起`;
        if (totalFiltered === 0) {
            topCategoryEl.textContent = '無';
            return;
        }
        
        const counts = {};
        filteredList.forEach(inc => {
            counts[inc.category] = (counts[inc.category] || 0) + 1;
        });
        
        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
        if (sorted.length > 0) {
            topCategoryEl.textContent = sorted[0][0];
        } else {
            topCategoryEl.textContent = '無';
        }
    }

    function renderIncidents(filteredList = null) {
        const listToRender = filteredList || incidents;
        const tbody = document.getElementById('incident-table-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        const adminHeaders = document.querySelectorAll('.admin-only');
        adminHeaders.forEach(th => {
            if (isAdmin) {
                th.classList.remove('hidden');
            } else {
                th.classList.add('hidden');
            }
        });

        if (listToRender.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-8 text-center text-stone-400 italic">
                        ❌ 沒有符合此篩選條件的意外事故記錄
                    </td>
                </tr>
            `;
            return;
        }

        listToRender.forEach(inc => {
            let badgeStyle = "bg-stone-100 text-stone-700";
            if (inc.severity.includes("中度")) {
                badgeStyle = "bg-amber-100 text-amber-800 border border-amber-200";
            } else if (inc.severity.includes("嚴重")) {
                badgeStyle = "bg-red-100 text-red-800 border border-red-200";
            }

            const deleteBtnCell = isAdmin ? `
                <button onclick="openEditIncidentModal('${inc.id}')" class="text-amber-700 hover:text-amber-900 text-xs font-semibold">編輯</button>
                <button onclick="openConfirmModal('delete-incident', '${inc.id}')" class="text-red-500 hover:text-red-700 text-xs font-semibold">刪除</button>
            ` : '';

            tbody.innerHTML += `
                <tr class="hover:bg-stone-50 transition text-xs">
                    <td class="px-4 py-3">
                        <div class="font-bold text-stone-900">${inc.studentClass || '未紀錄'}</div>
                        <div class="text-[10px] text-stone-500 font-mono">${inc.classNumber ? inc.classNumber + '號' : '未填班號'}</div>
                    </td>
                    <td class="px-4 py-3 text-stone-700 font-mono whitespace-nowrap">${formatIncidentDateTime(inc)}</td>
                    <td class="px-4 py-3 text-stone-700">${inc.location || '未紀錄'}</td>
                    <td class="px-4 py-3 font-semibold text-stone-800">${inc.category}</td>
                    <td class="px-4 py-3 text-stone-600 leading-relaxed">${inc.notes}</td>
                    <td class="px-4 py-3">
                        <span class="px-2.5 py-1 rounded-full font-semibold ${badgeStyle}">${inc.severity}</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <button onclick="getAiFirstAidGuideFromRecord('${inc.id}')" class="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2 py-1 rounded text-[10px] transition shadow-sm flex items-center gap-0.5">
                                <span>✨ DeepSeek 應急建議</span>
                            </button>
                            ${deleteBtnCell}
                        </div>
                    </td>
                </tr>
            `;
        });

        renderMetrics(listToRender);
    }

    function renderMetrics(filteredList = null) {
        const listToUse = filteredList || incidents;
        const container = document.getElementById('metrics-container');
        if(!container) return;
        container.innerHTML = '';

        if (listToUse.length === 0) {
            container.innerHTML = `<p class="text-stone-500 text-xs italic">無符合篩選條件的類別統計數據。</p>`;
            return;
        }

        const counts = {};
        listToUse.forEach(inc => {
            counts[inc.category] = (counts[inc.category] || 0) + 1;
        });

        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);

        sorted.forEach(([cat, val]) => {
            const pct = Math.round((val / listToUse.length) * 100);
            container.innerHTML += `
                <div>
                    <div class="flex justify-between text-xs font-bold text-stone-700 mb-1">
                        <span>${cat}</span>
                        <span>${val} 起 (${pct}%)</span>
                    </div>
                    <div class="w-full bg-stone-200 rounded-full h-2">
                        <div class="bg-amber-600 h-2 rounded-full" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('rule-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const rule = {
            id: 'r_' + Date.now(),
            category: document.getElementById('rule-category').value,
            title: document.getElementById('rule-title').value,
            desc: document.getElementById('rule-desc').value
        };
        rules.push(rule);
        await persistRules();
        renderRules();
        toggleModal('rule-modal');
        this.reset();
        openInfoModal('📋 新增成功！', '安全規範已成功寫入並同步至雲端。', '✨');
    });

    document.getElementById('safety-handbook-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以管理安全手冊。', '🔒');
            return;
        }

        const fileInput = document.getElementById('sh-file');
        const file = fileInput?.files?.[0];
        if (!file) {
            openInfoModal('⚠️ 請選擇檔案', '請選擇要上傳的 PDF 安全手冊。', '📂');
            return;
        }

        const name = (file.name || '').toLowerCase();
        if (file.type !== 'application/pdf' && !name.endsWith('.pdf')) {
            openInfoModal('⚠️ 格式不支援', '安全手冊僅支援 PDF 格式。', '📄');
            return;
        }
        if (file.size > SAFETY_HANDBOOK_MAX_BYTES) {
            openInfoModal('⚠️ 檔案過大', 'PDF 大小上限為 20MB。', '📦');
            return;
        }

        const submitBtn = document.getElementById('sh-submit-btn');
        const origText = submitBtn?.textContent;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '上傳中...';
        }

        try {
            const cloud = await ensureCloudSync();
            if (!cloud) throw new Error('雲端同步尚未就緒，請稍候數秒後重試。');

            const url = resolveCloudUploadResult(await cloud.uploadFile(file, 'safety_handbook')).url;
            if (!url) throw new Error('雲端上傳失敗，請檢查網路或 Firebase 設定。');

            const now = new Date();
            safetyHandbook = {
                url,
                fileName: file.name,
                fileSize: file.size,
                mimeType: 'application/pdf',
                uploadedAt: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
            };

            await persistSafetyHandbook();
            renderSafetyHandbookManageInfo();
            refreshSafetyHandbookFrame();
            toggleModal('safety-handbook-manage-modal');
            this.reset();
            openInfoModal('✅ 上傳成功', '實驗室安全手冊已更新並同步至雲端，所有裝置將自動讀取新版本。', '📖');
        } catch (err) {
            openInfoModal('❌ 上傳失敗', err.message || '上傳時發生錯誤，請稍後重試。', '⚠️');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = origText || '上傳並取代';
            }
        }
    });

    document.getElementById('prep-guide-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以管理實驗備課指引。', '🔒');
            return;
        }

        const fileInput = document.getElementById('pg-file');
        const file = fileInput?.files?.[0];
        if (!file) {
            openInfoModal('⚠️ 請選擇檔案', '請選擇要上傳的備課指引檔案。', '📂');
            return;
        }

        const name = (file.name || '').toLowerCase();
        const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
        const isDocx = name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (!isPdf && !isDocx) {
            openInfoModal('⚠️ 格式不支援', '備課指引僅支援 Word (.docx) 或 PDF 格式。', '📄');
            return;
        }
        if (file.size > PREP_GUIDE_MAX_BYTES) {
            openInfoModal('⚠️ 檔案過大', '檔案大小上限為 20MB。', '📦');
            return;
        }

        const submitBtn = document.getElementById('pg-submit-btn');
        const origText = submitBtn?.textContent;
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '上傳中...';
        }

        try {
            const cloud = await ensureCloudSync();
            if (!cloud) throw new Error('雲端同步尚未就緒，請稍候數秒後重試。');

            const url = resolveCloudUploadResult(await cloud.uploadFile(file, 'prep_guide')).url;
            if (!url) throw new Error('雲端上傳失敗，請檢查網路或 Firebase 設定。');

            const now = new Date();
            prepGuide = {
                url,
                fileName: file.name,
                fileSize: file.size,
                mimeType: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                uploadedAt: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
            };

            await persistPrepGuide();
            renderPrepGuideManageInfo();
            const prepModal = document.getElementById('prep-guide-modal');
            if (prepModal && !prepModal.classList.contains('hidden')) {
                await renderPrepGuideViewer();
            }
            toggleModal('prep-guide-manage-modal');
            this.reset();
            openInfoModal('✅ 上傳成功', '實驗備課指引已更新並同步至雲端，所有裝置將自動讀取新版本。', '📝');
        } catch (err) {
            openInfoModal('❌ 上傳失敗', err.message || '上傳時發生錯誤，請稍後重試。', '⚠️');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = origText || '上傳並取代';
            }
        }
    });

    document.getElementById('mistake-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const mistake = {
            id: 'm_' + Date.now(),
            icon: document.getElementById('mistake-icon').value || '🧪',
            title: document.getElementById('mistake-title').value,
            desc: document.getElementById('mistake-desc').value,
            hazard: document.getElementById('mistake-hazard').value,
            correction: document.getElementById('mistake-correction').value
        };
        mistakes.push(mistake);
        await persistMistakes();
        renderMistakes();
        toggleModal('mistake-modal');
        this.reset();
        openInfoModal('❌ 新增成功！', '常見錯誤危害防範專案已同步至雲端。', '✨');
    });

    document.getElementById('inventory-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = buildInventoryDisplayName({
            nameEn: document.getElementById('inv-name-en').value.trim(),
            nameZh: document.getElementById('inv-name-zh').value.trim(),
            formula: document.getElementById('inv-formula').value.trim() || '—'
        });
        const nameEn = document.getElementById('inv-name-en').value.trim();
        const nameZh = document.getElementById('inv-name-zh').value.trim();
        const formula = document.getElementById('inv-formula').value.trim() || '—';
        const category = getInventoryCategoryValue('inv');
        const quantity = document.getElementById('inv-quantity').value.trim();
        const location = getInvLocationValue();
        if (!category) {
            openInfoModal('⚠️ 請選擇類別', '請從下拉選單選擇物資類別，或選擇「手動輸入」後填寫新類別。', '📂');
            return;
        }
        if (!location) {
            openInfoModal('⚠️ 請選擇儲位', '請從下拉選單選擇現有儲位，或選擇「手動輸入」後填寫新位置。', '📍');
            return;
        }
        const autoAi = document.getElementById('inv-auto-ai-hazards')?.checked ?? true;
        const submitBtn = document.getElementById('inv-submit-btn');

        let hazards = document.getElementById('inv-hazards').value.trim();
        const needsAi = isReagentInventoryCategory(category) && (autoAi || !hazards);

        if (needsAi) {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '✨ AI 生成標籤中...';
            }
            setInventoryHazardAiStatus('inv', 'DeepSeek 正在自動分類危害標籤...');
            try {
                hazards = await resolveInventoryHazardsOnSave(name, category, quantity, hazards, autoAi);
                document.getElementById('inv-hazards').value = hazards;
            } catch (err) {
                setInventoryHazardAiStatus('inv', err.message, true);
                openInfoModal('❌ AI 標籤生成失敗', err.message + '。請手動填寫危害標籤或取消自動生成後重試。', '✨');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '完成新增';
                }
                return;
            }
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '完成新增';
            }
        }

        const item = enrichInventoryItem({
            id: 'v_' + Date.now(),
            nameEn,
            nameZh,
            formula,
            name,
            category,
            quantity,
            stockQuantity: document.getElementById('inv-stock-quantity').value.trim(),
            location,
            hazards: hazards || '無',
            msds: [],
            photos: []
        });

        try {
            if (supportsInventoryMsds(category)) {
                const msdsFiles = document.getElementById('inv-msds-file')?.files;
                if (msdsFiles?.length) {
                    item.msds = await processMsdsUploadFiles(msdsFiles, 0);
                }
            }
            const photoFiles = document.getElementById('inv-photos-file')?.files;
            if (photoFiles?.length) {
                item.photos = await processInventoryPhotoUploadFiles(photoFiles, 0);
            }
        } catch (err) {
            openInfoModal('❌ 附件上傳失敗', err.message || '無法上傳附件，請重試。', '⚠️');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '完成新增';
            }
            return;
        }

        inventories.push(item);
        await persistInventories();
        renderInventoryTable();
        hideModal('inventory-modal');
        this.reset();
        const autoCb = document.getElementById('inv-auto-ai-hazards');
        if (autoCb) autoCb.checked = true;
        setInventoryHazardAiStatus('inv', '');
        openInfoModal('📦 新增成功！', `物品已建立並同步至雲端。危害標籤：${item.hazards}`, '✨');
    });

    document.getElementById('incident-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const editId = document.getElementById('incident-edit-id').value;
        const location = getIncidentLocationValue();
        if (!location) {
            openInfoModal('⚠️ 請選擇地點', '請從下拉選單選擇事故地點，或選擇「手動輸入」後填寫新地點。', '📍');
            return;
        }
        const category = getIncidentCategoryValue();
        if (!category) {
            openInfoModal('⚠️ 請選擇類別', '請從下拉選單選擇事故類別，或選擇「手動輸入」後填寫新類別。', '📋');
            return;
        }

        const studentClass = getIncidentClassValue();
        if (!studentClass) {
            openInfoModal('⚠️ 請選擇班別', '請選擇年級（初一至高三）及班別（信、望、愛、善、樂）。', '🏫');
            return;
        }
        const classNumber = document.getElementById('incident-class-number').value.trim();
        if (!classNumber) {
            openInfoModal('⚠️ 請填寫班號', '請填寫班號。紀錄不會保存學生姓名。', '🏫');
            return;
        }

        const payload = {
            studentClass,
            classNumber,
            date: document.getElementById('incident-date').value,
            time: document.getElementById('incident-time').value,
            location,
            category,
            notes: document.getElementById('incident-notes').value,
            severity: document.getElementById('incident-severity').value
        };

        if (editId) {
            const index = incidents.findIndex(i => i.id === editId);
            if (index === -1) {
                openInfoModal('⚠️ 找不到紀錄', '此事故紀錄可能已被刪除，請重新整理後再試。', '⚠️');
                return;
            }
            incidents[index] = { ...incidents[index], ...payload, id: editId };
            const synced = await persistIncidents();
            populateClassFilter();
            applyAnalyticsFilters();
            hideModal('incident-modal');
            this.reset();
            document.getElementById('incident-edit-id').value = '';
            openInfoModal(
                synced ? '✏️ 修改成功' : '✏️ 已儲存（雲端待同步）',
                synced ? '事故紀錄已即時更新至 Firebase，所有裝置將自動同步。' : '已儲存於本機，雲端同步稍後重試。',
                '✨'
            );
            return;
        }

        incidents.push({ id: 'i_' + Date.now(), ...payload });
        const synced = await persistIncidents();
        populateClassFilter();
        applyAnalyticsFilters();
        hideModal('incident-modal');
        this.reset();
        openInfoModal(
            synced ? '📊 事故紀錄登錄成功！' : '📊 已儲存（雲端待同步）',
            synced ? '事故紀錄已即時寫入 Firebase，所有裝置與平台將自動更新。' : '已儲存於本機，雲端同步稍後重試。',
            '✨'
        );
    });

    document.getElementById('booking-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const editId = document.getElementById('booking-edit-id').value;
        const location = getBookingLocationValue();
        const experiment = getBookingExperimentValue();
        const subject = getBookingSubjectValue();
        const dates = [...bookingSelectedDates].sort();
        const timeslotIds = getSelectedBookingTimeslotIds();
        const classYear = getBookingYearValue();
        const classSubclass = getBookingSubclassValue();
        const className = getBookingClassDisplayValue();
        const tutorRaw = getBookingTutorValue();
        const tutorParsed = parseBookingTutorLabel(tutorRaw);
        const tutor = formatBookingTutorLabel(tutorParsed.tutorName, tutorParsed.tutorNumber) || tutorRaw;

        if (!location || !isRegisteredBookingLocation(location)) {
            openInfoModal('⚠️ 請選擇實驗室', '只可預約系統內已登記的實驗室，請從清單選擇，不可手動輸入其他地點。', '📍');
            return;
        }
        if (!dates.length) {
            openInfoModal('⚠️ 請選擇日期', '請在日曆上點選至少一個預約日期（可點選多天）。', '📅');
            return;
        }
        if (!timeslotIds.length) {
            openInfoModal('⚠️ 請選擇時段', '請點選至少一個時段（可同時選多個）。', '⏰');
            return;
        }
        if (!subject) {
            openInfoModal('⚠️ 請選擇科目', '請選擇科目，或手動輸入新科目。', '📚');
            return;
        }
        if (!experiment) {
            openInfoModal('⚠️ 請填寫項目', '請選擇或輸入實驗／活動項目名稱。', '🧪');
            return;
        }

        const now = new Date();
        const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const sessionType = document.getElementById('booking-type-non')?.checked
            ? 'non-experimental'
            : 'experimental';
        let groupCount = null;
        if (sessionType === 'experimental') {
            const rawGroups = Number(document.getElementById('booking-groups')?.value);
            if (!Number.isFinite(rawGroups) || rawGroups < 1) {
                openInfoModal('⚠️ 請填寫組數', '實驗課請輸入班級分成多少組（至少 1 組）。', '🧪');
                return;
            }
            groupCount = Math.round(rawGroups);
        }
        const materials = collectBookingMaterialsFromForm();
        const attachments = bookingDraftAttachments.map(f => ({ ...f }));
        const existing = editId ? labBookings.find(b => b.id === editId) : null;
        let status = normalizeBookingStatus(existing?.status || 'pending');
        const statusEl = document.getElementById('booking-approval-status');
        if (isAdmin && statusEl?.value) {
            status = normalizeBookingStatus(statusEl.value);
        } else if (!editId) {
            status = 'pending';
        }
        const reviewedAt = existing && status === normalizeBookingStatus(existing.status)
            ? (existing.reviewedAt || '')
            : (status === 'pending' ? '' : getNowDateValue());
        const reviewedBy = existing && status === normalizeBookingStatus(existing.status)
            ? (existing.reviewedBy || '')
            : (status === 'pending' ? '' : (isAdmin ? 'admin' : ''));
        const basePayload = {
            classYear,
            classSubclass,
            className,
            tutorName: tutorParsed.tutorName,
            tutorNumber: tutorParsed.tutorNumber,
            tutor,
            location,
            subject,
            experiment,
            sessionType,
            groupCount,
            remarks: document.getElementById('booking-remarks').value.trim(),
            ipadsNeeded: !!document.getElementById('booking-ipads').checked,
            materials,
            attachments,
            status,
            reviewedAt,
            reviewedBy,
            updatedAt: createdAt
        };

        if (editId) {
            if (dates.length !== 1 || timeslotIds.length !== 1) {
                openInfoModal('⚠️ 編輯限制', '編輯單筆預約時，請只選擇一個日期與一個時段。若需一次預約多個時段，請新增預約。', '📅');
                return;
            }
            if (isBookingTimeslotOccupied(dates[0], location, timeslotIds[0], editId)) {
                openInfoModal('⚠️ 時段已被預約', '此時段已被佔用，請改選其他時段。', '📅');
                refreshBookingTimeslotOptions();
                return;
            }
            const idx = labBookings.findIndex(b => b.id === editId);
            if (idx === -1) {
                openInfoModal('⚠️ 找不到紀錄', '此預約可能已被刪除，請重新整理後再試。', '⚠️');
                return;
            }
            const slot = BOOKING_TIMESLOTS.find(t => t.id === timeslotIds[0]);
            labBookings[idx] = {
                ...labBookings[idx],
                ...basePayload,
                id: editId,
                date: dates[0],
                timeslotId: timeslotIds[0],
                timeslot: slot?.label || ''
            };
            labBookings.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.timeslotId || '').localeCompare(String(b.timeslotId || '')));
            const synced = await persistBookings();
            populateBookingFilterOptions();
            filterLabBookings();
            toggleModal('booking-modal');
            this.reset();
            document.getElementById('booking-edit-id').value = '';
            bookingDraftMaterials = [];
            bookingDraftAttachments = [];
            openInfoModal(
                synced ? '✅ 已更新' : '✅ 已儲存（雲端待同步）',
                synced ? '實驗室預約已即時寫入 Firebase，所有裝置將自動同步。' : '已儲存於本機，雲端同步稍後重試。',
                '📅'
            );
            return;
        }

        const blocked = [];
        let created = 0;
        dates.forEach(date => {
            timeslotIds.forEach(slotId => {
                if (isBookingTimeslotOccupied(date, location, slotId, null)) {
                    const label = BOOKING_TIMESLOTS.find(t => t.id === slotId)?.label || slotId;
                    blocked.push(`${date} ${label}`);
                    return;
                }
                const slot = BOOKING_TIMESLOTS.find(t => t.id === slotId);
                labBookings.unshift({
                    id: 'bk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                    ...basePayload,
                    date,
                    timeslotId: slotId,
                    timeslot: slot?.label || '',
                    createdAt
                });
                created += 1;
            });
        });

        if (!created) {
            openInfoModal('⚠️ 時段已被預約', `所選日期與時段均已被佔用，請改選：\n${blocked.slice(0, 8).join('\n')}`, '📅');
            refreshBookingTimeslotOptions();
            return;
        }

        labBookings.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.timeslotId || '').localeCompare(String(b.timeslotId || '')));
        const synced = await persistBookings();
        populateBookingFilterOptions();
        filterLabBookings();
        toggleModal('booking-modal');
        this.reset();
        document.getElementById('booking-edit-id').value = '';
        bookingSelectedDates = [];
        const skipNote = blocked.length
            ? `\n（已略過 ${blocked.length} 個已被佔用的時段）`
            : '';
        bookingDraftMaterials = [];
        bookingDraftAttachments = [];
        openInfoModal(
            synced ? '✅ 預約已提交' : '✅ 已儲存（雲端待同步）',
            synced
                ? `已建立 ${created} 筆預約，狀態為「Pending laboratory admin for acknowledgement」，並已同步至 Firebase。${skipNote}`
                : `已於本機建立 ${created} 筆待審批預約，雲端同步稍後重試。${skipNote}`,
            '📅'
        );
    });

    document.getElementById('lab-room-edit-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以管理實驗室資料。', '🔒');
            return;
        }
        const roomId = document.getElementById('lab-room-edit-id').value;
        const idx = labRooms.findIndex(r => r.id === roomId);
        if (idx === -1) {
            openInfoModal('⚠️ 找不到記錄', '此實驗室資料可能已被刪除。', '🏛️');
            return;
        }
        const name = document.getElementById('lab-room-edit-name').value.trim();
        if (!name) {
            openInfoModal('⚠️ 請填寫名稱', '實驗室名稱不可空白。', '🏛️');
            return;
        }
        const dup = labRooms.some(r => r.id !== roomId && normalizeBookingLocationKey(r.name) === normalizeBookingLocationKey(name));
        if (dup) {
            openInfoModal('⚠️ 名稱重複', `已有名為「${name}」的實驗室。`, '🏛️');
            return;
        }
        try {
            const photoInput = document.getElementById('lab-room-edit-photo-input');
            const newPhotos = photoInput?.files?.length
                ? await processLabRoomPhotoUploads(photoInput.files, (labRooms[idx].photos || []).length)
                : [];
            labRooms[idx] = {
                ...labRooms[idx],
                name,
                description: document.getElementById('lab-room-edit-description').value.trim(),
                photos: [...(labRooms[idx].photos || []), ...newPhotos],
                lastUpdated: new Date().toISOString()
            };
            await persistLabRooms();
            renderLabRoomsManageList();
            toggleModal('lab-room-edit-modal');
            openInfoModal('✅ 已儲存', `「${name}」的簡介與照片已更新並同步至雲端。`, '🏛️');
        } catch (err) {
            openInfoModal('❌ 儲存失敗', err.message || '儲存實驗室資料時發生錯誤。', '⚠️');
        }
    });

    document.getElementById('procedure-data-form')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!isAdmin) {
            openInfoModal('⚠️ 權限不足', '只有管理員可以管理程序文件。', '🔒');
            return;
        }

        const editId = document.getElementById('pd-edit-id').value;
        const fileInput = document.getElementById('pd-file');
        const newFiles = fileInput?.files || [];
        const title = document.getElementById('pd-title').value.trim();

        if (!title) {
            openInfoModal('⚠️ 請填寫名稱', '請輸入實驗名稱。', '📂');
            return;
        }

        try {
            const now = new Date();
            const uploadedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const equipment = parseLinesToList(document.getElementById('pd-equipment').value);
            const reagents = parseLinesToList(document.getElementById('pd-reagents').value);
            const steps = parseLinesToList(document.getElementById('pd-steps').value);
            const meta = {
                title,
                subject: getProcedureSubjectValue(),
                grade: document.getElementById('pd-grade').value,
                labRoom: document.getElementById('pd-lab').value.trim(),
                equipment,
                reagents,
                steps,
                notes: document.getElementById('pd-notes').value.trim(),
                uploadedAt
            };

            if (editId) {
                const idx = procedureDataFiles.findIndex(p => p.id === editId);
                if (idx === -1) throw new Error('找不到要編輯的記錄。');
                const existing = procedureDataFiles[idx];
                const addedFiles = newFiles.length
                    ? await processProcedureUploadFiles(newFiles, getProcedureFiles(existing).length)
                    : [];
                procedureDataFiles[idx] = {
                    ...existing,
                    ...meta,
                    files: [...getProcedureFiles(existing), ...addedFiles]
                };
            } else {
                const addedFiles = newFiles.length
                    ? await processProcedureUploadFiles(newFiles, 0)
                    : [];
                procedureDataFiles.unshift({
                    id: 'pf_' + Date.now(),
                    ...meta,
                    files: addedFiles
                });
            }

            const synced = await persistProcedureFiles();
            filterProcedureDataFiles();
            toggleModal('procedure-data-modal');
            this.reset();
            document.getElementById('pd-edit-id').value = '';
            openInfoModal(
                synced ? (editId ? '✅ 已更新' : '✅ 新增成功') : (editId ? '✅ 已儲存（雲端待同步）' : '✅ 已新增（雲端待同步）'),
                synced
                    ? `「${title}」已即時寫入 Firebase，所有裝置與平台將自動同步。`
                    : `「${title}」已儲存於本機，雲端同步稍後重試。`,
                '📂'
            );
        } catch (err) {
            openInfoModal('❌ 儲存失敗', err.message || '儲存時發生錯誤，請稍後重試。', '⚠️');
        }
    });

    // ================= 匯出報告模組 =================
    function formatReportTimestamp() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    function formatReportFilename(prefix) {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${prefix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    }

    function escapeCsvField(value) {
        const text = value == null ? '' : String(value);
        if (/[",\r\n]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    function buildCsv(rows) {
        return '\uFEFF' + rows.map(row => row.map(escapeCsvField).join(',')).join('\r\n');
    }

    async function downloadTextFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        if (isAppleTouchDevice()) {
            if (await tryShareBlob(blob, filename)) return;
            await openOrDownloadFile(url, filename);
            return;
        }
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function ensureHtmlReportModal() {
        let modal = document.getElementById('html-report-modal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.id = 'html-report-modal';
        modal.className = 'hidden fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl w-full max-w-5xl overflow-hidden border border-stone-200 flex flex-col" style="height: min(92dvh, 920px); max-height: 92dvh;">
                <div class="px-4 py-3 border-b border-stone-200 flex items-center justify-between gap-2 shrink-0">
                    <h3 id="html-report-modal-title" class="font-bold text-stone-800 truncate">報告</h3>
                    <button type="button" onclick="hideModal('html-report-modal')" class="text-stone-400 hover:text-stone-700 text-xl leading-none px-2 min-h-[44px]">✕</button>
                </div>
                <iframe id="html-report-frame" class="w-full flex-1 min-h-0 border-0 bg-white" title="報告"></iframe>
            </div>`;
        document.body.appendChild(modal);
        return modal;
    }

    function openHtmlReportWindow(title, bodyHtml) {
        const html = `<!DOCTYPE html>
<html lang="zh-HK">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${title}</title>
    <style>
        body { font-family: "PingFang TC", "Microsoft JhengHei", sans-serif; color: #1c1917; margin: 24px; line-height: 1.5; }
        h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
        .meta { color: #78716c; font-size: 0.85rem; margin-bottom: 1.5rem; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 1.5rem; }
        .card { border: 1px solid #e7e5e4; border-radius: 10px; padding: 12px; background: #fafaf9; }
        .card .label { font-size: 0.7rem; text-transform: uppercase; color: #a8a29e; font-weight: 700; }
        .card .value { font-size: 1.25rem; font-weight: 800; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
        th, td { border: 1px solid #e7e5e4; padding: 8px 10px; text-align: left; vertical-align: top; }
        th { background: #f5f5f4; font-size: 0.72rem; text-transform: uppercase; color: #57534e; }
        tr:nth-child(even) { background: #fafaf9; }
        .toolbar { margin-bottom: 1rem; }
        .toolbar button { background: #1e293b; color: white; border: none; padding: 10px 14px; border-radius: 8px; cursor: pointer; font-weight: 600; min-height: 44px; }
        @media print { .toolbar { display: none; } body { margin: 16px; } }
    </style>
</head>
<body>
    <div class="toolbar"><button onclick="window.print()">🖨️ 列印 / 另存為 PDF</button></div>
    ${bodyHtml}
</body>
</html>`;
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
        const reportWindow = window.open(url, '_blank');
        if (reportWindow) return;
        const modal = ensureHtmlReportModal();
        const titleEl = document.getElementById('html-report-modal-title');
        const frame = document.getElementById('html-report-frame');
        if (titleEl) titleEl.textContent = title;
        if (frame) {
            if (frame._reportBlobUrl) URL.revokeObjectURL(frame._reportBlobUrl);
            frame._reportBlobUrl = url;
            frame.src = url;
        }
        showModal('html-report-modal');
    }

    function getInventoryFilterSummary() {
        const query = document.getElementById('inventory-search').value.trim();
        const category = document.getElementById('inventory-filter-cat').value;
        const sortBy = document.getElementById('inventory-sort')?.value || 'default';
        const sortLabels = {
            default: '預設順序',
            'name-asc': '名稱 A→Z',
            'name-desc': '名稱 Z→A',
            'location-asc': '儲位 A→Z',
            'location-desc': '儲位 Z→A',
            'category-asc': '類別 A→Z',
            'category-desc': '類別 Z→A'
        };
        const parts = [];
        if (category !== 'all') parts.push(`類別：${category}`);
        if (query) parts.push(`搜尋：${query}`);
        if (sortBy !== 'default') parts.push(`排序：${sortLabels[sortBy] || sortBy}`);
        return parts.length ? parts.join('；') : '全部物資（未套用篩選）';
    }

    function getIncidentFilterSummary() {
        const type = document.getElementById('filter-analytics-type').value;
        const severity = document.getElementById('filter-analytics-severity').value;
        const cls = document.getElementById('filter-analytics-class').value;
        const location = document.getElementById('filter-analytics-location').value;
        const dateFrom = document.getElementById('filter-analytics-date-from').value;
        const dateTo = document.getElementById('filter-analytics-date-to').value;
        const search = document.getElementById('filter-analytics-search').value.trim();
        const parts = [];
        if (type !== 'all') parts.push(`類別：${type}`);
        if (severity !== 'all') parts.push(`嚴重程度：${severity}`);
        if (cls !== 'all') parts.push(`班別：${cls}`);
        if (location !== 'all') parts.push(`地點：${location}`);
        if (dateFrom) parts.push(`日期起：${dateFrom}`);
        if (dateTo) parts.push(`日期迄：${dateTo}`);
        if (search) parts.push(`搜尋：${search}`);
        return parts.length ? parts.join('；') : '全部事故（未套用篩選）';
    }

    function getCategoryCounts(items, key) {
        const counts = {};
        items.forEach(item => {
            const value = item[key] || '未分類';
            counts[value] = (counts[value] || 0) + 1;
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }

    function exportInventoryReport(format) {
        if (!isAdmin) {
            openInfoModal('🔒 權限不足', '匯出報告功能僅限管理員使用，請先登入管理員帳號。', '👤');
            return;
        }
        const data = getFilteredInventory();
        if (data.length === 0) {
            openInfoModal('⚠️ 無資料可匯出', '目前篩選條件下沒有任何物資記錄。', '📦');
            return;
        }

        const timestamp = formatReportTimestamp();
        const filterSummary = getInventoryFilterSummary();
        const categoryCounts = getCategoryCounts(data, 'category');

        if (format === 'csv') {
            const rows = [
                ['英文名稱', '中文名稱', '化學式', '類別', '存儲位置', '規格/濃度', '數量', '安全危害標籤'],
                ...data.map(v => [v.nameEn || '', v.nameZh || '', v.formula || '', v.category, v.location, v.quantity, v.stockQuantity || '', v.hazards])
            ];
            downloadTextFile(`${formatReportFilename('inventory')}.csv`, buildCsv(rows), 'text/csv;charset=utf-8');
            openInfoModal('✅ 匯出成功', `已匯出 ${data.length} 筆物資記錄為 CSV 檔案。`, '📥');
            return;
        }

        const categoryRows = categoryCounts.map(([name, count]) =>
            `<tr><td>${name}</td><td>${count}</td><td>${Math.round((count / data.length) * 100)}%</td></tr>`
        ).join('');

        const tableRows = data.map(v =>
            `<tr><td>${escapeHtml(v.nameEn || '')}</td><td>${escapeHtml(v.nameZh || '')}</td><td>${escapeHtml(v.formula || '')}</td><td>${escapeHtml(v.category)}</td><td>${escapeHtml(v.location)}</td><td>${escapeHtml(v.quantity)}</td><td>${escapeHtml(v.stockQuantity || '')}</td><td>${escapeHtml(v.hazards)}</td></tr>`
        ).join('');

        openHtmlReportWindow('實驗室物資庫存報告', `
            <h1>🧪 實驗室物資庫存報告</h1>
            <div class="meta">產生時間：${timestamp}<br>篩選條件：${filterSummary}</div>
            <div class="summary">
                <div class="card"><div class="label">匯出項目總數</div><div class="value">${data.length}</div></div>
                <div class="card"><div class="label">系統庫存總數</div><div class="value">${inventories.length}</div></div>
                <div class="card"><div class="label">類別數量</div><div class="value">${categoryCounts.length}</div></div>
            </div>
            <h2>類別分佈</h2>
            <table style="margin-bottom:1.5rem">
                <thead><tr><th>類別</th><th>數量</th><th>佔比</th></tr></thead>
                <tbody>${categoryRows}</tbody>
            </table>
            <h2>物資明細</h2>
            <table>
                <thead><tr><th>英文名稱</th><th>中文名稱</th><th>化學式</th><th>類別</th><th>存儲位置</th><th>規格/濃度</th><th>數量</th><th>安全危害標籤</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        `);
    }

    function exportIncidentsReport(format) {
        if (!isAdmin) {
            openInfoModal('🔒 權限不足', '匯出報告功能僅限管理員使用，請先登入管理員帳號。', '👤');
            return;
        }
        const data = filteredIncidents.length ? filteredIncidents : [...incidents];
        if (data.length === 0) {
            openInfoModal('⚠️ 無資料可匯出', '目前沒有任何意外事故記錄。', '📊');
            return;
        }

        const timestamp = formatReportTimestamp();
        const filterSummary = getIncidentFilterSummary();
        const totalAll = incidents.length;
        const severeCount = data.filter(inc => inc.severity.includes('中度') || inc.severity.includes('嚴重')).length;
        const categoryCounts = getCategoryCounts(data, 'category');
        const topCategory = categoryCounts.length ? categoryCounts[0][0] : '無';

        if (format === 'csv') {
            const rows = [
                ['班別', '班號', '事故日期', '紀錄時間', '事故地點', '事故類別', '嚴重程度', '詳細經過與處置說明'],
                ...data.map(inc => [
                    inc.studentClass || '',
                    inc.classNumber || '',
                    inc.date || '',
                    inc.time || '',
                    inc.location || '',
                    inc.category || '',
                    inc.severity || '',
                    inc.notes || ''
                ])
            ];
            downloadTextFile(`${formatReportFilename('incidents')}.csv`, buildCsv(rows), 'text/csv;charset=utf-8');
            openInfoModal('✅ 匯出成功', `已匯出 ${data.length} 筆意外事故記錄為 CSV 檔案。`, '📥');
            return;
        }

        const categoryRows = categoryCounts.map(([name, count]) =>
            `<tr><td>${name}</td><td>${count}</td><td>${Math.round((count / data.length) * 100)}%</td></tr>`
        ).join('');

        const tableRows = data.map(inc =>
            `<tr>
                <td>${inc.studentClass || '未紀錄'}<br><small>${inc.classNumber ? inc.classNumber + '號' : '未填班號'}</small></td>
                <td>${formatIncidentDateTime(inc)}</td>
                <td>${inc.location || '未紀錄'}</td>
                <td>${inc.category || ''}</td>
                <td>${inc.severity || ''}</td>
                <td>${inc.notes || ''}</td>
            </tr>`
        ).join('');

        openHtmlReportWindow('實驗室意外事故報告', `
            <h1>📊 實驗室意外事故報告</h1>
            <div class="meta">產生時間：${timestamp}<br>篩選條件：${filterSummary}</div>
            <div class="summary">
                <div class="card"><div class="label">匯出事件總數</div><div class="value">${data.length}</div></div>
                <div class="card"><div class="label">佔全部事故比例</div><div class="value">${totalAll > 0 ? Math.round((data.length / totalAll) * 100) : 0}%</div></div>
                <div class="card"><div class="label">中度/嚴重事故</div><div class="value">${severeCount} 起</div></div>
                <div class="card"><div class="label">最常發生類型</div><div class="value" style="font-size:0.95rem">${topCategory}</div></div>
            </div>
            <h2>事故類別分佈</h2>
            <table style="margin-bottom:1.5rem">
                <thead><tr><th>事故類別</th><th>數量</th><th>佔比</th></tr></thead>
                <tbody>${categoryRows}</tbody>
            </table>
            <h2>事故明細</h2>
            <table>
                <thead><tr><th>班別</th><th>日期/時間</th><th>地點</th><th>事故類別</th><th>嚴重程度</th><th>詳細經過 / 處置說明</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        `);
    }

    // ================= DeepSeek AI 通訊模組 =================
    async function callDeepSeekChat(messages) {
        migrateToDeepSeek();

        const apiKey = SafeStorage.getItem('user_deepseek_api_key') || DEEPSEEK_DEFAULTS.key;
        const apiBase = DEEPSEEK_DEFAULTS.url;
        const storedModel = SafeStorage.getItem('user_ai_model') || DEEPSEEK_DEFAULTS.model;
        const model = isDeepSeekModel(storedModel) ? storedModel : DEEPSEEK_DEFAULTS.model;

        if (!apiKey) {
            toggleModal('api-setup-modal');
            throw new Error("⚠️ 未設定金鑰！已為您彈出「DeepSeek 設定面板」，請完成 API 金鑰配置。");
        }

        const cleanUrl = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
        const url = `${cleanUrl}/chat/completions`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `DeepSeek API 連線失敗 (${response.status})。請確認 API 金鑰是否有效。`);
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
        throw new Error("未能從 DeepSeek API 獲取回應文字。");
    }

    async function callAiAssistant(prompt, systemInstruction = "") {
        const messages = [];
        if (systemInstruction) {
            messages.push({ role: 'system', content: systemInstruction });
        }
        messages.push({ role: 'user', content: prompt });
        return callDeepSeekChat(messages);
    }

    // ================= 訪客浮動 AI 聊天助理 =================
    const VISITOR_CHAT_SYSTEM = `你是澳門浸信中學科學實驗室管理與安全中心的 AI 助理（由 DeepSeek 驅動）。
你的職責：以繁體中文友善、精簡地回答訪客關於實驗室安全、化學品儲存、PPE、MSDS、庫存查詢、實驗程序、意外事故及本網站功能使用的問題。
原則：
- 優先強調安全與合規；不鼓勵危險操作。
- 每次對話會附上【即時庫存資料庫】【實驗程序資料庫】【意外事故紀錄】三份即時搜尋結果。
- 回答庫存問題時：若快照中列出某化學品/物資，必須明確告知「有庫存」並引用儲位、規格與危害標籤；不得說「沒有庫存」或「未找到」。
- 僅當快照明確寫著「未匹配到」且無相關記錄時，才可說目前資料庫中未找到；並建議使用者換關鍵字或到對應分頁搜尋。
- 回答實驗程序、事故紀錄時，同樣僅依快照內容，可摘要器材、試劑、地點、日期等。
- 若問題涉及具體操作，提醒遵循老師指示及學校安全手冊。
- 當涉及實驗室預約、借用、器材準備或試劑配製等安排時，結尾請依下列範本提供建議（勿改寫關鍵用語；勿使用「619 實驗室管理老師」「提前一天」「試劑分裝」等舊說法）：
  建議您：
  - 向 實驗室管理員 登記時間與組數
  - 至少提前七天預約，以便準備實驗儀器和配製藥品
  如需進一步協助（如查詢特定儲位、索取MSDS），請再告訴我！
- 回答宜條列清晰，一般 3–10 句；必要時可稍長。`;

    const VISITOR_CHAT_SUGGESTIONS = [
        '濃硫酸放在哪個儲位？',
        '有哪些化學實驗程序？',
        '最近實驗室意外事故紀錄',
        '氫氧化鈉的規格和危害'
    ];

    const VISITOR_CHAT_STOP_WORDS = new Set(['的', '在', '是', '有', '嗎', '什么', '什麼', '哪', '哪裡', '哪里', '查', '詢', '询', '找', '帮', '幫', '我', '请', '請', '一下', '可以', '能否', '如何', '怎樣', '怎样', '吗', '呢', '啊', '嗎', '沒有', '没有', '是否', '能不能', '可不可以', '請問', '请问', '幫我', '帮我', '想問', '想问', '告訴', '告诉', '知道', '库存', '庫存', '實驗室', '实验室']);

    function tokenizeChatQuery(text) {
        return (text || '').toLowerCase()
            .split(/[\s,，、。．；;:!?？！／/()（）\[\]【】「」"'`]+/)
            .map(t => t.trim())
            .filter(t => t.length > 0 && !VISITOR_CHAT_STOP_WORDS.has(t));
    }

    function addChemEntryToSearchTerms(terms, entry) {
        if (!entry) return;
        const en = entry.en || '';
        const zh = entry.zh || '';
        const formula = entry.f || entry.formula || '';
        if (en) {
            terms.add(en.toLowerCase());
            terms.add(normalizeChemKey(en));
            en.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4).forEach(t => terms.add(t));
            if (/bicarbonate/i.test(en)) {
                terms.add('sodium hydrogen carbonate');
                terms.add(normalizeChemKey('sodium hydrogen carbonate'));
                terms.add('sodium bicarbonate');
                terms.add('hydrogen carbonate');
                terms.add('碳酸氫鈉');
            }
            if (/hydroxide/i.test(en) && /sodium/i.test(en)) {
                terms.add('氫氧化鈉');
                terms.add('燒鹼');
            }
            if (/chloride/i.test(en) && /sodium/i.test(en)) {
                terms.add('氯化鈉');
                terms.add('食鹽');
            }
        }
        if (zh) terms.add(zh.toLowerCase());
        if (formula) {
            const f = String(formula).toLowerCase().replace(/\s/g, '');
            terms.add(f);
            terms.add(f.replace(/[₃₂₄₅₆₇₈₉₀₁₊₋₌₍₎]/g, ''));
        }
    }

    function resolveChemSynonymsFromQuery(query) {
        const terms = new Set();
        const labels = new Set();
        const q = (query || '').trim();
        const lower = q.toLowerCase();
        if (!q) return { terms: [], labels: [] };

        const registerMatch = (label, entry) => {
            if (label) labels.add(label);
            addChemEntryToSearchTerms(terms, entry);
        };

        if (typeof CHEM_ZH_ALIASES !== 'undefined') {
            const aliasKeys = Object.keys(CHEM_ZH_ALIASES).sort((a, b) => b.length - a.length);
            aliasKeys.forEach(alias => {
                const entry = CHEM_ZH_ALIASES[alias];
                if (q.includes(alias) || lower.includes(alias.toLowerCase())) {
                    registerMatch(alias, entry);
                }
            });
            (q.match(/[\u4e00-\u9fff]+/g) || []).forEach(run => {
                if (CHEM_ZH_ALIASES[run]) registerMatch(run, CHEM_ZH_ALIASES[run]);
                aliasKeys.forEach(alias => {
                    if (run.length >= 2 && (run.includes(alias) || alias.includes(run))) {
                        registerMatch(alias, CHEM_ZH_ALIASES[alias]);
                    }
                });
            });
        }

        if (typeof CHEMICAL_LOOKUP !== 'undefined') {
            CHEMICAL_LOOKUP.forEach(entry => {
                const en = (entry.en || '').toLowerCase();
                const zh = entry.zh || '';
                if ((zh && q.includes(zh)) || (en && lower.includes(en))) {
                    registerMatch(zh || entry.en, entry);
                }
            });
        }

        if (typeof CHEM_LOOKUP_MAPS !== 'undefined') {
            (q.match(/[\u4e00-\u9fff]+/g) || []).forEach(run => {
                const key = normalizeChemKey(run);
                const byZh = CHEM_LOOKUP_MAPS.byZh.get(key);
                if (byZh) registerMatch(run, { en: byZh.en, zh: byZh.zh, f: byZh.formula });
            });

            lower.split(/[^a-z0-9]+/).filter(t => t.length >= 4).forEach(token => {
                for (const [enKey, entry] of CHEM_LOOKUP_MAPS.byEn.entries()) {
                    if (enKey.includes(token) || token.includes(enKey)) {
                        registerMatch(entry.en || enKey, { en: entry.en, zh: entry.zh, f: entry.formula });
                    }
                }
            });
        }

        return { terms: [...terms].filter(t => t && t.length >= 2), labels: [...labels] };
    }

    function extractChatSearchTerms(query) {
        const terms = new Set();
        const q = (query || '').trim();
        const lower = q.toLowerCase();
        if (lower.length >= 2) terms.add(lower);

        tokenizeChatQuery(q).forEach(t => terms.add(t));
        lower.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(t => t.length >= 2).forEach(t => terms.add(t));

        if (typeof CHEM_ZH_ALIASES !== 'undefined') {
            Object.keys(CHEM_ZH_ALIASES).forEach(alias => {
                if (q.includes(alias)) {
                    terms.add(alias.toLowerCase());
                    const entry = CHEM_ZH_ALIASES[alias];
                    if (entry?.en) {
                        terms.add(entry.en.toLowerCase());
                        terms.add(normalizeChemKey(entry.en));
                    }
                    if (entry?.zh) terms.add(entry.zh.toLowerCase());
                    if (entry?.formula) terms.add(String(entry.formula).toLowerCase().replace(/\s/g, ''));
                }
            });
        }

        if (typeof CHEMICAL_LOOKUP !== 'undefined') {
            CHEMICAL_LOOKUP.forEach(entry => {
                const en = (entry.en || '').toLowerCase();
                const zh = (entry.zh || '').toLowerCase();
                if ((en && lower.includes(en)) || (zh && q.includes(entry.zh))) {
                    if (en) {
                        terms.add(en);
                        terms.add(normalizeChemKey(entry.en));
                    }
                    if (zh) terms.add(zh);
                    if (entry.formula) terms.add(String(entry.formula).toLowerCase().replace(/\s/g, ''));
                }
            });
        }

        (q.match(/[\u4e00-\u9fff]+/g) || []).forEach(run => {
            terms.add(run);
            for (let len = 2; len <= Math.min(6, run.length); len++) {
                for (let i = 0; i <= run.length - len; i++) {
                    terms.add(run.slice(i, i + len));
                }
            }
        });

        const { terms: synonymTerms } = resolveChemSynonymsFromQuery(q);
        synonymTerms.forEach(t => terms.add(t.toLowerCase()));

        return [...terms].filter(t => t && (t.length >= 2 || /^[a-z0-9]{2,}$/i.test(t)));
    }

    function searchInventoryWithSynonymFallback(query, limit = 25) {
        let matches = searchRecordsForChat(inventories, buildInventoryHaystack, query, limit);
        let synonymLabels = [];

        if (!matches.length) {
            const { terms, labels } = resolveChemSynonymsFromQuery(query);
            synonymLabels = labels;
            if (terms.length) {
                const altQuery = terms.join(' ');
                matches = searchRecordsForChat(inventories, buildInventoryHaystack, altQuery, limit);
                if (!matches.length) {
                    matches = inventories.filter(item => {
                        const h = buildInventoryHaystack(item);
                        const hCompact = h.replace(/\s+/g, '');
                        return terms.some(t => {
                            const tl = t.toLowerCase();
                            const tc = tl.replace(/\s+/g, '');
                            return h.includes(tl) || (tc.length >= 2 && hCompact.includes(tc));
                        });
                    }).slice(0, limit);
                }
            }
        }

        return { matches, synonymLabels };
    }

    function scoreHaystackMatch(haystack, terms, fullQuery) {
        let score = 0;
        const q = (fullQuery || '').trim().toLowerCase().replace(/\s+/g, '');
        const h = (haystack || '').toLowerCase();
        const hCompact = h.replace(/\s+/g, '');
        if (q.length >= 2) {
            if (h.includes(fullQuery.trim().toLowerCase())) score += 15;
            if (hCompact.includes(q)) score += 12;
        }
        for (const term of terms) {
            if (!term) continue;
            const t = term.toLowerCase();
            const tCompact = t.replace(/\s+/g, '');
            if (h.includes(t)) score += t.length >= 4 ? 7 : t.length >= 3 ? 5 : 3;
            if (tCompact.length >= 2 && hCompact.includes(tCompact)) score += 4;
        }
        return score;
    }

    function searchRecordsForChat(records, buildHaystack, query, limit = 25) {
        if (!Array.isArray(records) || !records.length) return [];
        const terms = extractChatSearchTerms(query);
        const q = (query || '').trim();

        let matches = records
            .map(record => ({ record, score: scoreHaystackMatch(buildHaystack(record), terms, q) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(x => x.record);

        if (!matches.length && terms.length) {
            matches = records.filter(record => {
                const h = buildHaystack(record);
                return terms.some(t => t.length >= 2 && h.toLowerCase().includes(t.toLowerCase()));
            }).slice(0, limit);
        }

        return matches;
    }

    function getVisitorChatSearchQuery(currentText) {
        const parts = [currentText];
        for (let i = visitorChatHistory.length - 1; i >= 0 && parts.length < 4; i--) {
            if (visitorChatHistory[i].role === 'user') {
                parts.push(visitorChatHistory[i].content);
            }
        }
        return parts.join(' ');
    }

    function buildInventoryHaystack(item) {
        return [
            item.nameEn, item.nameZh, item.formula, item.name,
            item.category, item.location, item.quantity, item.stockQuantity, item.hazards,
            buildInventoryDisplayName(item),
            normalizeChemKey(item.nameEn || ''),
            normalizeChemKey(item.name || '')
        ].filter(Boolean).join(' ').toLowerCase();
    }

    function buildProcedureHaystack(item) {
        const equipStr = (item.equipment || []).join(' ');
        const reagentStr = (item.reagents || []).join(' ');
        const stepStr = (item.steps || []).join(' ');
        const fileStr = getProcedureFiles(item).map(f => f.fileName).join(' ');
        return `${item.title} ${item.subject} ${item.grade} ${item.labRoom} ${item.notes || ''} ${equipStr} ${reagentStr} ${stepStr} ${fileStr}`.toLowerCase();
    }

    function buildIncidentHaystack(inc) {
        return [
            inc.studentClass, inc.classNumber,
            inc.date, inc.time, inc.location, inc.category,
            inc.notes, inc.severity
        ].filter(Boolean).join(' ').toLowerCase();
    }

    function getInventoryCategoryStats() {
        const counts = {};
        inventories.forEach(item => {
            const cat = item.category || '未分類';
            counts[cat] = (counts[cat] || 0) + 1;
        });
        return counts;
    }

    function formatInventoryItemForChat(item) {
        const name = buildInventoryDisplayName(item);
        const formula = item.formula && item.formula !== '—' ? ` | 化學式:${item.formula}` : '';
        const msdsCount = getInventoryMsds(item).length;
        const photoCount = getInventoryPhotos(item).length;
        const extras = [
            msdsCount ? `MSDS:${msdsCount}份` : '',
            photoCount ? `照片:${photoCount}張` : ''
        ].filter(Boolean).join(' | ');
        const extraSuffix = extras ? ` | ${extras}` : '';
        return `- ${name}${formula} | 類別:${item.category} | 儲位:${item.location} | 規格:${item.quantity} | 數量:${item.stockQuantity || '未填'} | 危害:${item.hazards || '無'}${extraSuffix}`;
    }

    function formatProcedureItemForChat(item) {
        const equip = (item.equipment || []).slice(0, 8).join('、') || '—';
        const reagents = (item.reagents || []).slice(0, 8).join('、') || '—';
        const files = getProcedureFiles(item).length;
        const stepCount = (item.steps || []).length;
        return `- ${item.title} | 科目:${item.subject} | 年級:${item.grade} | 實驗室:${item.labRoom} | 器材:${equip} | 試劑:${reagents}${stepCount ? ` | 步驟:${stepCount}項` : ''}${files ? ` | 檔案:${files}個` : ''}${item.notes ? ` | 安全:${item.notes}` : ''}`;
    }

    function formatIncidentItemForChat(inc) {
        const when = [inc.date, inc.time].filter(Boolean).join(' ') || '未紀錄';
        const student = formatIncidentStudentLabel(inc);
        return `- ${when} | 地點:${inc.location || '—'} | 類型:${inc.category || '—'} | 嚴重程度:${inc.severity || '—'} | 班別:${student}${inc.notes ? ` | 詳情:${inc.notes}` : ''}`;
    }

    function searchInventoryForChat(query, limit = 25) {
        if (!Array.isArray(inventories) || !inventories.length) {
            return { total: 0, matches: [], statsLine: '庫存資料尚未載入或為空。', synonymLabels: [] };
        }
        const categoryStats = getInventoryCategoryStats();
        const statsLine = `庫存總筆數:${inventories.length}；類別分佈:${Object.entries(categoryStats).map(([k, v]) => `${k}${v}項`).join('、')}`;
        const { matches, synonymLabels } = searchInventoryWithSynonymFallback(query, limit);
        return { total: inventories.length, matches, statsLine, synonymLabels };
    }

    function searchProceduresForChat(query, limit = 15) {
        if (!Array.isArray(procedureDataFiles) || !procedureDataFiles.length) {
            return { total: 0, matches: [], statsLine: '實驗程序資料尚未載入或為空。' };
        }
        const bySubject = {};
        procedureDataFiles.forEach(p => { bySubject[p.subject] = (bySubject[p.subject] || 0) + 1; });
        const statsLine = `程序總數:${procedureDataFiles.length}；科目分佈:${Object.entries(bySubject).map(([k, v]) => `${k}${v}項`).join('、')}`;
        const matches = searchRecordsForChat(procedureDataFiles, buildProcedureHaystack, query, limit);
        return { total: procedureDataFiles.length, matches, statsLine };
    }

    function searchIncidentsForChat(query, limit = 15) {
        if (!Array.isArray(incidents) || !incidents.length) {
            return { total: 0, matches: [], statsLine: '意外事故紀錄尚未載入或為空。' };
        }
        const statsLine = `事故紀錄總數:${incidents.length}`;
        const sorted = [...incidents].sort((a, b) => `${b.date || ''}${b.time || ''}`.localeCompare(`${a.date || ''}${a.time || ''}`));
        const matches = searchRecordsForChat(sorted, buildIncidentHaystack, query, limit);
        return { total: incidents.length, matches, statsLine };
    }

    function buildVisitorChatInventoryContext(searchQuery) {
        const { matches, statsLine, synonymLabels } = searchInventoryForChat(searchQuery);
        if (!inventories?.length) {
            return '庫存資料尚未載入。請稍候雲端同步完成後再查詢。';
        }
        const synonymNote = synonymLabels?.length
            ? `\n（已將「${searchQuery}」對應至同義化學品名稱搜尋：${synonymLabels.join('、')} → 如碳酸氫鈉 / Sodium bicarbonate / Sodium hydrogen carbonate）`
            : '';
        if (!matches.length) {
            return `${statsLine}${synonymNote}\n搜尋「${searchQuery}」：未匹配到具體庫存項目。（僅在確實無上述記錄時，方可告知使用者未找到；勿猜測。）`;
        }
        return `${statsLine}${synonymNote}\n搜尋「${searchQuery}」：以下為匹配庫存（有列出即代表有庫存，請明確回答儲位與規格）：\n${matches.map(formatInventoryItemForChat).join('\n')}`;
    }

    function buildVisitorChatProcedureContext(searchQuery) {
        const { matches, statsLine } = searchProceduresForChat(searchQuery);
        if (!procedureDataFiles?.length) {
            return '實驗程序資料尚未載入。';
        }
        if (!matches.length) {
            return `${statsLine}\n搜尋「${searchQuery}」：未匹配到具體實驗程序。`;
        }
        return `${statsLine}\n搜尋「${searchQuery}」：以下為匹配實驗程序：\n${matches.map(formatProcedureItemForChat).join('\n')}`;
    }

    function buildVisitorChatIncidentContext(searchQuery) {
        const { matches, statsLine } = searchIncidentsForChat(searchQuery);
        if (!incidents?.length) {
            return '目前無意外事故紀錄。';
        }
        if (!matches.length) {
            const recent = [...incidents]
                .sort((a, b) => `${b.date || ''}${b.time || ''}`.localeCompare(`${a.date || ''}${a.time || ''}`))
                .slice(0, 5);
            return `${statsLine}\n搜尋「${searchQuery}」：未匹配到具體事故。最近 5 筆紀錄供參考：\n${recent.map(formatIncidentItemForChat).join('\n')}`;
        }
        return `${statsLine}\n搜尋「${searchQuery}」：以下為匹配事故紀錄：\n${matches.map(formatIncidentItemForChat).join('\n')}`;
    }

    function buildVisitorChatSystemPrompt(userText) {
        const searchQuery = getVisitorChatSearchQuery(userText);
        const sections = [
            `【即時庫存資料庫】\n${buildVisitorChatInventoryContext(searchQuery)}`,
            `【實驗程序資料庫】\n${buildVisitorChatProcedureContext(searchQuery)}`,
            `【意外事故紀錄】\n${buildVisitorChatIncidentContext(searchQuery)}`
        ];
        return `${VISITOR_CHAT_SYSTEM}\n\n${sections.join('\n\n')}`;
    }

    let visitorChatHistory = [];
    let visitorChatInitialized = false;
    let visitorChatBusy = false;

    function openVisitorChat() {
        document.getElementById('visitor-chat-panel')?.classList.remove('hidden');
        document.getElementById('visitor-chat-fab')?.classList.add('hidden');
        if (!visitorChatInitialized) {
            visitorChatInitialized = true;
            appendVisitorChatMessage('bot', '您好！我是實驗室 AI 助理，可即時查詢庫存儲位、實驗程序與意外事故紀錄。請直接輸入問題，或點選下方建議。');
            renderVisitorChatSuggestions();
        }
        if (!isAppleTouchDevice()) {
            setTimeout(() => document.getElementById('visitor-chat-input')?.focus(), 100);
        }
    }

    function minimizeVisitorChat() {
        document.getElementById('visitor-chat-panel')?.classList.add('hidden');
        document.getElementById('visitor-chat-fab')?.classList.remove('hidden');
    }

    function clearVisitorChat() {
        visitorChatHistory = [];
        const box = document.getElementById('visitor-chat-messages');
        if (box) box.innerHTML = '';
        appendVisitorChatMessage('bot', '對話已清除。還有什麼可以協助您的嗎？');
        renderVisitorChatSuggestions();
    }

    function renderVisitorChatSuggestions() {
        const wrap = document.getElementById('visitor-chat-suggestions');
        if (!wrap) return;
        wrap.innerHTML = VISITOR_CHAT_SUGGESTIONS.map(q => `
            <button type="button" class="visitor-chat-suggestion text-[10px] bg-white border border-stone-200 hover:border-amber-400 hover:bg-amber-50 text-stone-600 px-2 py-1 rounded-full transition">${escapeHtml(q)}</button>
        `).join('');
        wrap.querySelectorAll('.visitor-chat-suggestion').forEach((btn, i) => {
            btn.addEventListener('click', () => askVisitorChatSuggestion(VISITOR_CHAT_SUGGESTIONS[i]));
        });
    }

    function askVisitorChatSuggestion(text) {
        const input = document.getElementById('visitor-chat-input');
        if (input) input.value = text;
        sendVisitorChatMessage(null, text);
    }

    function appendVisitorChatMessage(role, content, isHtml = false) {
        const box = document.getElementById('visitor-chat-messages');
        if (!box) return;

        const isUser = role === 'user';
        const bubble = document.createElement('div');
        bubble.className = `visitor-chat-msg ${isUser ? 'visitor-chat-msg-user' : 'visitor-chat-msg-bot'} rounded-2xl px-3 py-2 text-sm shadow-sm`;
        if (isUser) {
            bubble.textContent = content;
        } else if (isHtml) {
            bubble.innerHTML = `<div class="markdown-body text-sm">${content}</div>`;
        } else {
            bubble.textContent = content;
        }
        box.appendChild(bubble);
        box.scrollTop = box.scrollHeight;
    }

    function setVisitorChatTyping(show) {
        const box = document.getElementById('visitor-chat-messages');
        const existing = document.getElementById('visitor-chat-typing');
        if (!show) {
            existing?.remove();
            return;
        }
        if (existing || !box) return;
        const bubble = document.createElement('div');
        bubble.id = 'visitor-chat-typing';
        bubble.className = 'visitor-chat-msg visitor-chat-msg-bot rounded-2xl px-3 py-2 text-sm text-stone-400 italic';
        bubble.textContent = '正在思考...';
        box.appendChild(bubble);
        box.scrollTop = box.scrollHeight;
    }

    async function sendVisitorChatMessage(e, presetText = null) {
        e?.preventDefault();
        if (visitorChatBusy) return;

        const input = document.getElementById('visitor-chat-input');
        const sendBtn = document.getElementById('visitor-chat-send-btn');
        const text = (presetText ?? input?.value ?? '').trim();
        if (!text) return;

        if (input) input.value = '';
        appendVisitorChatMessage('user', text);
        visitorChatBusy = true;
        if (sendBtn) sendBtn.disabled = true;
        setVisitorChatTyping(true);

        const messages = [
            { role: 'system', content: buildVisitorChatSystemPrompt(text) },
            ...visitorChatHistory,
            { role: 'user', content: text }
        ];

        try {
            const reply = await callDeepSeekChat(messages);
            visitorChatHistory.push({ role: 'user', content: text });
            visitorChatHistory.push({ role: 'assistant', content: reply });
            if (visitorChatHistory.length > 20) {
                visitorChatHistory = visitorChatHistory.slice(-20);
            }
            setVisitorChatTyping(false);
            appendVisitorChatMessage('bot', parseSimpleMarkdown(reply), true);
        } catch (err) {
            setVisitorChatTyping(false);
            appendVisitorChatMessage('bot', err.message || '連線失敗，請稍後再試。');
        } finally {
            visitorChatBusy = false;
            if (sendBtn) sendBtn.disabled = false;
            input?.focus();
        }
    }

    function parseSimpleMarkdown(text) {
        let html = text
            .replace(/\r\n/g, '\n')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\*\*([^*]+)\*\"/g, '<strong>$1</strong>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\* ([^\n]+)/g, '<li>$1</li>')
            .replace(/# ([^\n]+)/g, '<h3>$1</h3>')
            .replace(/## ([^\n]+)/g, '<h3>$1</h3>')
            .replace(/### ([^\n]+)/g, '<h3>$1</h3>')
            .replace(/^- ([^\n]+)/g, '<li>$1</li>');
        
        return `<p>${html}</p>`.replace(/<p><li>/g, '<ul><li>').replace(/<\/li><\/p>/g, '</li></ul>');
    }

    async function getAiExperimentReport() {
        const expName = document.getElementById('ai-exp-name').value.trim();
        if (!expName) {
            openInfoModal('⚠️ 輸入錯誤', '請先輸入想要設計的化學實驗名稱或化學原料組合。', '🔬');
            return;
        }

        document.getElementById('ai-loading-container').classList.remove('hidden');
        document.getElementById('ai-report-body').classList.add('hidden');
        document.getElementById('ai-badge-status').textContent = "COMPUTING";
        document.getElementById('ai-badge-status').className = "bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-mono animate-pulse";

        const sysInstruction = "你是一位在中學化學準備室 619A 工作的高級實驗室技術員兼化學家。你的任務是撰寫一份全面、結構化且易於閱讀的實驗安全評估報告。請使用繁體中文。格式中需要使用 H3 標題，段落與無序列表。";
        const prompt = `針對實驗「${expName}」，請提供以下指南：
        1. 核心化學反應原理、預期產物與核心危險評估。
        2. 技術員專屬：前置準備室調劑指引，列舉所需濃度與儲存條件。
        3. 學生防護與操作注意事項（PPE要求、最容易犯的錯誤操作防範）。
        4. 意外緊急處置流程。`;

        try {
            const result = await callAiAssistant(prompt, sysInstruction);
            document.getElementById('ai-report-body').innerHTML = parseSimpleMarkdown(result);
            document.getElementById('ai-response-title').innerHTML = `🧪 「${expName}」安全評估報告`;
        } catch (error) {
            document.getElementById('ai-report-body').innerHTML = `<p class="text-red-500 font-semibold">❌ AI 智慧分析失敗：${error.message}</p>`;
        } finally {
            document.getElementById('ai-loading-container').classList.add('hidden');
            document.getElementById('ai-report-body').classList.remove('hidden');
            document.getElementById('ai-badge-status').textContent = "DONE";
            document.getElementById('ai-badge-status').className = "bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded font-mono";
        }
    }

    async function analyzeProcedureImages() {
        const context = document.getElementById('procedure-context')?.value.trim() || '（無額外說明）';
        const contextChars = context.replace(/\s/g, '').length;
        if (!procedureImages.length && contextChars < 15) {
            openInfoModal('⚠️ 請先提供內容', '請上傳程序文件，或從資料庫載入含實驗步驟的記錄，或在「補充說明」欄填寫實驗程序。', '📁');
            return;
        }

        const loading = document.getElementById('procedure-loading-container');
        const reportBody = document.getElementById('procedure-report-body');
        const badge = document.getElementById('procedure-badge-status');
        const title = document.getElementById('procedure-response-title');

        loading.classList.remove('hidden');
        reportBody.classList.add('hidden');
        badge.textContent = 'COMPUTING';
        badge.className = 'bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-mono animate-pulse';

        const sysInstruction = '你是一位澳門浸信中學科學實驗室資深技術員兼安全督導。請根據從實驗程序文件（圖片/PDF/Word）擷取的文字內容及使用者補充說明，撰寫完整、實用的繁體中文安全分析報告。使用 H3 標題與條列式清單，內容須具體、可執行，並符合中學實驗室安全規範。若擷取文字不足或含糊，請結合補充說明合理推斷，並明確列出需向老師確認的項目。';

        try {
            let ocrBlock = '';
            if (procedureImages.length) {
                if (!(await ensureCloudSyncForProcedureFiles(procedureImages, '分析檔案'))) {
                    loading.classList.add('hidden');
                    reportBody.classList.remove('hidden');
                    badge.textContent = 'READY';
                    badge.className = 'bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded font-mono';
                    return;
                }
                const ocrSections = await extractTextFromProcedureImages(procedureImages);
                const typeLabels = { image: '圖片', pdf: 'PDF', docx: 'Word' };
                ocrBlock = ocrSections.map((section, idx) => {
                    const label = typeLabels[section.type] || '檔案';
                    return `【${label} ${idx + 1}：${section.name}】\n${section.text}`;
                }).join('\n\n');
            }
            const readableChars = ocrBlock
                .replace(/（未能辨識出可讀文字[^）]*）/g, '')
                .replace(/（未能從文件中擷取可讀文字[^）]*）/g, '')
                .replace(/\s/g, '').length;

            if (readableChars < 15 && contextChars < 15) {
                throw new Error('文件中未能擷取足夠文字。請上傳含實驗步驟的 PDF/Word，或含文字的圖片，或在「補充說明」欄填寫實驗名稱與程序。');
            }

            setProcedureLoadingMessage('✨ DeepSeek 正在根據擷取內容撰寫安全分析報告...');

            const sourceLine = procedureImages.length
                ? `以下是由 ${procedureImages.length} 個實驗程序文件擷取的文字內容：`
                : '以下為資料庫中的實驗程序文字資料（無附件）：';
            const prompt = `${sourceLine}
---
${ocrBlock || '（無附件擷取內容，請依下方補充說明分析）'}
---
使用者補充說明：${context}

請依序提供：
1. **實驗識別**：從內容辨識的實驗名稱、年級適用性及主要學習目標。
2. **器材與藥品清單**：列出所需器材、試劑及濃度（如有）。
3. **技術員前置準備**：實驗前在準備室（619A）需完成的調配、分裝、標籤與儲位安排。
4. **課堂安全防護 (PPE)**：護目鏡、手套、實驗袍、通風櫃等要求。
5. **學生操作步驟與安全要點**：正確操作順序及每一步的危險防範。
6. **常見錯誤與禁止事項**：學生最容易犯的錯誤及可能後果。
7. **緊急應變措施**：化學灼傷、火災、割傷、毒氣吸入等對應處理。
8. **廢棄物處理**：實驗後廢液、固體廢棄物的正確分類與處置。`;

            const result = await callAiAssistant(prompt, sysInstruction);
            const ocrNote = readableChars < 40
                ? '<p class="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded p-2 mb-4">⚠️ 文件文字擷取較少，報告部分內容依補充說明推斷，建議向老師確認細節。</p>'
                : '';
            reportBody.innerHTML = ocrNote + parseSimpleMarkdown(result);
            title.innerHTML = procedureImages.length
                ? `📷 實驗程序安全分析（${procedureImages.length} 個檔案）`
                : '📋 實驗程序安全分析（文字資料）';
        } catch (error) {
            const msg = error.message === 'Failed to fetch'
                ? '無法從雲端讀取程序文件。請在「實驗程序資料庫」點「☁️ 同步至雲端」後，重新載入程序再分析。'
                : error.message;
            reportBody.innerHTML = `<p class="text-red-500 font-semibold">❌ 圖像分析失敗：${msg}</p>`;
        } finally {
            loading.classList.add('hidden');
            reportBody.classList.remove('hidden');
            badge.textContent = 'DONE';
            badge.className = 'bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded font-mono';
        }
    }

    async function getAiCompatibilityAdvice() {
        const query = document.getElementById('ai-compat-query').value.trim();
        if (!query) {
            openInfoModal('⚠️ 輸入錯誤', '請先輸入想要諮詢的化學品儲存與防震擺放問題。', '🔒');
            return;
        }

        document.getElementById('ai-loading-container').classList.remove('hidden');
        document.getElementById('ai-report-body').classList.add('hidden');
        document.getElementById('ai-badge-status').textContent = "COMPUTING";
        document.getElementById('ai-badge-status').className = "bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded font-mono animate-pulse";

        const sysInstruction = "你是一位中學化學準備室 619A 的安全總監。請根據 619A 液體櫃 (LC1-LC4)、固體櫃 (SC1-SC3) 與金屬乾燥櫃 (DC) 的劃分原則，評估化學品存儲安全度。請使用繁體中文。";
        const prompt = `針對以下諮詢問題：
        「${query}」
        請進行相容性與位置分析並給予儲存隔離建議。`;

        try {
            const result = await callAiAssistant(prompt, sysInstruction);
            document.getElementById('ai-report-body').innerHTML = parseSimpleMarkdown(result);
            document.getElementById('ai-response-title').innerHTML = `🔒 619A 儲位安全與相容性諮詢`;
        } catch (error) {
            document.getElementById('ai-report-body').innerHTML = `<p class="text-red-500 font-semibold">❌ AI 智慧分析失敗：${error.message}</p>`;
        } finally {
            document.getElementById('ai-loading-container').classList.add('hidden');
            document.getElementById('ai-report-body').classList.remove('hidden');
            document.getElementById('ai-badge-status').textContent = "DONE";
            document.getElementById('ai-badge-status').className = "bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded font-mono";
        }
    }

    function getAiFirstAidGuideFromRecord(id) {
        const inc = incidents.find(i => i.id === id);
        if (!inc) return;
        getAiFirstAidGuide(inc);
    }

    async function getAiFirstAidGuide(inc) {
        const studentLabel = formatIncidentStudentLabel(inc);
        const dateTime = formatIncidentDateTime(inc);
        const location = inc.location || '未紀錄';

        toggleModal('ai-modal');
        document.getElementById('ai-modal-loading').classList.remove('hidden');
        document.getElementById('ai-modal-body').classList.add('hidden');

        const sysInstruction = "你是一位經驗極其豐富的中學科學實驗室主管。當意外發生時，你必須迅速為現場人員提供精確的急救處置以及有害化學溢漏的處理指令。請使用繁體中文。不要使用或推測學生姓名，只以班別與班號稱呼。";
        const prompt = `涉事班別：${studentLabel}
        事故日期/時間：${dateTime}
        事故地點：${location}
        意外類別：${inc.category}
        嚴重程度：${inc.severity}
        經過與處置記錄：${inc.notes}

        請為該事故撰寫一份緊急應變建議書。不要寫出學生姓名，只以「${studentLabel}」稱呼：
        1. 即時身體急救程序
        2. 現場環境清理步驟
        3. 安全複查與事件記錄。`;

        try {
            const result = await callAiAssistant(prompt, sysInstruction);
            const htmlBody = parseSimpleMarkdown(result);
            document.getElementById('ai-modal-body').innerHTML = `
                <div class="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    <strong>涉事班別：</strong> ${studentLabel} | <strong>日期/時間：</strong> ${dateTime} | <strong>地點：</strong> ${location}<br>
                    <strong>事故類別：</strong> ${inc.category} | <strong>嚴重度：</strong> ${inc.severity}<br>
                    <strong>現場經過：</strong> ${inc.notes}
                </div>
                ${htmlBody}
            `;
            document.getElementById('ai-modal-loading').classList.add('hidden');
            document.getElementById('ai-modal-body').classList.remove('hidden');
        } catch (error) {
            document.getElementById('ai-modal-body').innerHTML = `<p class="text-red-500 font-semibold">❌ DeepSeek 智慧處置擬定失敗：${error.message}</p>`;
            document.getElementById('ai-modal-loading').classList.add('hidden');
            document.getElementById('ai-modal-body').classList.remove('hidden');
        }
    }
