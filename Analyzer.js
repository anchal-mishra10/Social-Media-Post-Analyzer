function setError(msg) {
    const el = document.getElementById('error');
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else { el.classList.add('hidden'); el.textContent = ''; }
}


function setProgress(v, text) {
    const p = document.getElementById('prog');
    const s = document.getElementById('status');
    if (v == null) { p.classList.add('hidden'); s.textContent = ''; return; }
    p.classList.remove('hidden');
    p.value = Math.max(0, Math.min(100, v));
    s.textContent = text || '';
}


function analyzeText(raw) {
    const text = (raw || '').trim();
    const tips = [];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 15) tips.push('Add a bit more context (aim for a short paragraph).');
    if (!/#\w/.test(text)) tips.push('Add 1–3 relevant hashtags.');
    if (!/[\p{Emoji_Presentation}\p{Emoji}\uFE0F]/u.test(text)) tips.push('Consider one emoji to humanize the tone.');
    const linkCount = (text.match(/https?:\/\//g) || []).length;
    if (linkCount > 1) tips.push('Keep only one outbound link.');
    if (!/(comment|share|follow|check|try|learn|download)/i.test(text)) tips.push('End with a clear call-to-action.');
    const score = Math.max(10 - tips.length * 2, 0);
    return { score, tips };
}

function renderAnalysis(result) {
    const scoreEl = document.getElementById('score');
    const tipsEl = document.getElementById('tips');
    scoreEl.textContent = result ? result.score : '—';
    tipsEl.innerHTML = '';
    (result?.tips || []).forEach(t => {
        const li = document.createElement('li');
        li.className = 'tip';
        li.textContent = t;
        tipsEl.appendChild(li);
    });
}


async function extractFromPDF(file) {
    if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
    const buf = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buf });
    const doc = await loadingTask.promise;
    let all = '';
    for (let i = 1; i <= doc.numPages; i++) {
        setProgress((i - 1) / doc.numPages * 100, `Reading PDF page ${i} / ${doc.numPages}…`);
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        all += content.items.map(it => it.str).join(' ') + '\n';
    }
    setProgress(100, 'PDF text extracted');
    return all.trim();
}


async function extractFromImage(file) {
    if (!window.Tesseract) throw new Error('Tesseract not loaded');
    const { data } = await Tesseract.recognize(file, 'eng', {
        logger: m => {
            if (m.status === 'recognizing text' && m.progress != null) {
                setProgress(Math.round(m.progress * 100), 'OCR: recognizing text…');
            } else if (m.status) {
                setProgress(null, m.status);
            }
        }
    });
    setProgress(100, 'OCR complete');
    return (data.text || '').trim();
}

async function extract(file) {
    setError('');
    setProgress(1, 'Starting…');
    const name = (file.name || '').toLowerCase();
    const type = file.type || '';
    try {
        if (type === 'application/pdf' || name.endsWith('.pdf')) {
            return await extractFromPDF(file);
        } else if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) {
            return await extractFromImage(file);
        } else {
            throw new Error('Unsupported file type. Please upload a PDF or image.');
        }
    } finally {
        setTimeout(() => setProgress(null), 400);
    }
}


const drop = document.getElementById('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
drop.addEventListener('drop', async (e) => {
    e.preventDefault(); drop.classList.remove('drag');
    const file = e.dataTransfer.files?.[0]; if (!file) return;
    const text = await extract(file).catch(err => setError(err.message));
    if (text) { document.getElementById('text').value = text; renderAnalysis(analyzeText(text)); }
});


const input = document.getElementById('file');
input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await extract(file).catch(err => setError(err.message));
    if (text) { document.getElementById('text').value = text; renderAnalysis(analyzeText(text)); }
    input.value = '';
});

document.getElementById('copyBtn').addEventListener('click', async () => {
    const t = document.getElementById('text').value;
    try { await navigator.clipboard.writeText(t); setError(''); }
    catch { setError('Copy failed. Select text and press Ctrl/Cmd+C.'); }
});

document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('text').value = '';
    renderAnalysis(null);
    setError('');
});

document.getElementById('analyzeBtn').addEventListener('click', () => {
    const t = document.getElementById('text').value;
    renderAnalysis(analyzeText(t));
});

document.getElementById('demoBtn').addEventListener('click', () => {
    const demo = "Launching our new feature tomorrow! Learn how it saves time and boosts productivity. Read more: https://example.com #Productivity #LaunchDay";
    const ta = document.getElementById('text');
    ta.value = demo;
    renderAnalysis(analyzeText(demo));
    setError('');
});

// Helpful tip: running from file:// may block PDF worker. Recommend Live Server or a simple http server.
if (location.protocol === 'file:') {
    console.warn('Tip: Run on a local server for PDF.js worker to load correctly.');
}