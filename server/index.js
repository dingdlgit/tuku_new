
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import bmp from 'bmp-js'; 
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { registry } from './modelRegistry.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');
const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

const stockCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; 

const sessions = new Map(); 

[UPLOAD_DIR, PROCESSED_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

function incrementStats() {
  try {
    const stats = fs.existsSync(STATS_FILE) ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) : { processedCount: 0 };
    stats.processedCount += 1;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  } catch (e) {}
}

app.get('/api/stats', (req, res) => {
  try {
    res.json(fs.existsSync(STATS_FILE) ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) : { processedCount: 0 });
  } catch (e) { res.json({ processedCount: 0 }); }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
  const isImage = req.file.mimetype.startsWith('image/');
  let meta = {};
  if (isImage) {
      try {
        const m = await sharp(req.file.path).metadata();
        meta = { width: m.width, height: m.height, format: m.format };
      } catch (err) {}
  }
  res.json({ id: fileId, filename: req.file.filename, url: `/api/files/${req.file.filename}`, originalName: req.file.originalname, size: req.file.size, mimeType: req.file.mimetype, ...meta });
});

app.use('/api/files', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

// Standard processing logic (kept intact)
app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  const files = await fs.promises.readdir(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));
  if (!fileName) return res.status(404).json({ error: 'File not found' });
  const originalExt = path.extname(fileName).toLowerCase().replace('.', '');
  let targetFormat = options.format;
  if (targetFormat === 'original') targetFormat = ['bmp', 'png', 'webp', 'gif', 'avif', 'tiff'].includes(originalExt) ? originalExt : 'jpeg';
  const outExt = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
  const outFilename = `processed_${uuidv4()}.${outExt}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);
  const filePath = path.join(UPLOAD_DIR, fileName);
  try {
    let p;
    if (options.rawWidth && options.rawHeight) {
      p = sharp(filePath, { raw: { width: options.rawWidth, height: options.rawHeight, channels: ['rgba', 'bgra', 'uyvy'].includes(options.rawPixelFormat || '') ? 4 : 3 } });
    } else if (fileName.toLowerCase().endsWith('.bmp')) {
      try { p = sharp(filePath); await p.metadata(); } catch (e) {
        const bmpData = bmp.decode(fs.readFileSync(filePath));
        const rgba = Buffer.alloc(bmpData.data.length);
        for (let i = 0; i < bmpData.data.length; i += 4) {
          rgba[i] = bmpData.data[i + 3]; rgba[i + 1] = bmpData.data[i + 2]; rgba[i + 2] = bmpData.data[i + 1]; rgba[i + 3] = bmpData.data[i] === 0 ? 255 : bmpData.data[i];
        }
        p = sharp(rgba, { raw: { width: bmpData.width, height: bmpData.height, channels: 4 } });
      }
    } else { p = sharp(filePath); }
    if (options.rotate) p = p.rotate(options.rotate);
    if (options.flipX) p = p.flop();
    if (options.flipY) p = p.flip();
    if (options.grayscale) p = p.grayscale();
    if (options.blur) p = p.blur(options.blur);
    if (options.sharpen) p = p.sharpen();
    if (options.width || options.height) p = p.resize(options.width, options.height, { fit: options.resizeMode || 'cover' });
    if (targetFormat === 'bmp') {
      const { data: rgba, info } = await p.toColorspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const abgr = Buffer.alloc(rgba.length);
      for (let i = 0; i < rgba.length; i += 4) { abgr[i] = rgba[i+3]; abgr[i+1] = rgba[i+2]; abgr[i+2] = rgba[i+1]; abgr[i+3] = rgba[i]; }
      fs.writeFileSync(outputPath, bmp.encode({ data: abgr, width: info.width, height: info.height }).data);
    } else {
      if (targetFormat === 'png') p = p.png(); else if (targetFormat === 'webp') p = p.webp({ quality: options.quality }); else p = p.jpeg({ quality: options.quality });
      await p.toFile(outputPath);
    }
    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });
  } catch (err) { res.status(500).json({ error: 'Processing failed: ' + err.message }); }
});

const SUPPORTED_GEMINI_MIMES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv', 'video/mpg', 'video/wmv',
  'audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac',
  'application/pdf', 'text/plain', 'text/csv', 'text/html', 'text/javascript', 'text/x-python'
];

async function getFileParts(attachments, lang = 'en') {
    if (!attachments || attachments.length === 0) return [];
    const parts = [];
    for (const att of attachments) {
        if (!SUPPORTED_GEMINI_MIMES.includes(att.mimeType)) {
            const errorMsg = lang === 'zh' ? `[系统提示：不支持读取 ${att.mimeType}。请转换为 PDF。]` : `[Note: Unsupported ${att.mimeType}. Use PDF.]`;
            parts.push({ text: errorMsg });
            continue;
        }
        if (att.data) parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
        else if (att.filename) {
            try {
                const filePath = path.join(UPLOAD_DIR, att.filename);
                if (fs.existsSync(filePath)) parts.push({ inlineData: { mimeType: att.mimeType, data: (await fs.promises.readFile(filePath)).toString('base64') } });
            } catch (e) {}
        }
    }
    return parts;
}

async function generateImageInternal(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: { parts: [{ text: prompt }] } });
  let b64 = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
  if (b64) {
      const out = `ai_chat_gen_${uuidv4()}.png`;
      fs.writeFileSync(path.join(PROCESSED_DIR, out), Buffer.from(b64, 'base64'));
      return `/api/processed/${out}`;
  }
  return null;
}

async function generateVideoInternal(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  let operation = await ai.models.generateVideos({ model: 'veo-3.1-fast-generate-preview', prompt: prompt, config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' } });
  while (!operation.done) { await new Promise(r => setTimeout(r, 5000)); operation = await ai.operations.getVideosOperation({operation: operation}); }
  const link = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (link) {
     const vidRes = await fetch(`${link}&key=${process.env.API_KEY}`);
     const out = `ai_chat_video_${uuidv4()}.mp4`;
     fs.writeFileSync(path.join(PROCESSED_DIR, out), Buffer.from(await vidRes.arrayBuffer()));
     return `/api/processed/${out}`;
  }
  return null;
}

app.get('/api/ai/sessions', (req, res) => {
    res.json(Array.from(sessions.values()).map(s => ({ id: s.id, title: s.title, mode: s.mode, createdAt: s.createdAt, lastMessageAt: s.lastMessageAt, preview: s.history.length > 0 ? s.history[s.history.length-1].parts[0].text.substring(0, 50) : "New" })).sort((a,b)=>b.lastMessageAt-a.lastMessageAt));
});

app.get('/api/ai/sessions/:id', (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json(s);
});

app.post('/api/ai/sessions', (req, res) => {
    const id = uuidv4();
    const s = { id, title: "New Neural Link", mode: req.body.mode || 'general', history: [], createdAt: Date.now(), lastMessageAt: Date.now() };
    sessions.set(id, s);
    res.json(s);
});

app.delete('/api/ai/sessions/:id', (req, res) => { sessions.delete(req.params.id); res.json({ success: true }); });

// Main Chat
app.post('/api/ai/chat', async (req, res) => {
  const { sessionId, message, attachments, model, lang } = req.body;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: "Session Expired" });

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const userLang = lang === 'zh' ? 'zh' : 'en';
  const systemInstruction = { en: { general: "TuKu AI Core. Concise.", coder: "Elite Dev. Robust code.", analyst: "Data Scientist. Structured.", creative: "Creative Director. Vivid." }, zh: { general: "图酷 AI 核心。简洁。", coder: "精英工程师。安全代码。", analyst: "数据科学家。见解。", creative: "创意总监。生动。" } }[userLang][session.mode] || "AI Assistant";

  // --- ADAPTER ROUTING ---
  if (!registry.isGemini(model)) {
    try {
        const adapter = registry.getAdapter(model);
        if (!adapter) throw new Error("Adapter Missing");
        const enriched = [];
        if (attachments) {
            for (const att of attachments) {
                const b64 = att.data || (fs.existsSync(path.join(UPLOAD_DIR, att.filename)) ? (await fs.promises.readFile(path.join(UPLOAD_DIR, att.filename))).toString('base64') : null);
                if (b64) enriched.push({ ...att, data: b64 });
            }
        }
        session.history.push({ role: 'user', parts: [{ text: message }] });
        const respText = await adapter.chatStream({ message, history: session.history.slice(0, -1), attachments: enriched, systemInstruction, model, res });
        session.history.push({ role: 'model', parts: [{ text: respText }] });
        session.lastMessageAt = Date.now();
        return res.end();
    } catch (e) { res.write(`\n[ADAPTER ERROR: ${e.message}]\n`); return res.end(); }
  }

  // --- GEMINI ROUTING ---
  if (!process.env.API_KEY) return res.write("[SYSTEM ERROR: API_KEY_MISSING]"), res.end();
  
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chatModel = model || 'gemini-3-flash-preview';

    const newParts = [];
    if (message) newParts.push({ text: message });
    newParts.push(...(await getFileParts(attachments, userLang)));

    // --- CRITICAL: HISTORY REPAIR ---
    // If the last entry in history is also 'user', we remove it (it means the previous request failed)
    if (session.history.length > 0 && session.history[session.history.length - 1].role === 'user') {
        session.history.pop();
    }

    const chat = ai.chats.create({
      model: chatModel,
      history: session.history,
      config: { 
          systemInstruction, 
          tools: [{ functionDeclarations: [{ name: "generate_image", description: "Gen image", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING } }, required: ["prompt"] } }, { name: "generate_video", description: "Gen video", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING } }, required: ["prompt"] } }] }] 
      },
    });

    const result = await chat.sendMessageStream({ message: newParts });
    
    // Only push User message if API successfully started stream
    session.history.push({ role: 'user', parts: newParts });
    session.lastMessageAt = Date.now();
    if (session.history.length === 1 && message) session.title = message.substring(0, 30);

    let fullText = '';
    for await (const chunk of result) {
      if (chunk.functionCalls) {
          for (const call of chunk.functionCalls) {
              if (call.name === 'generate_image') {
                  res.write(userLang==='zh'?"\n[系统：生成图像...]\n":"\n[SYSTEM: Gen image...]\n");
                  const url = await generateImageInternal(call.args.prompt);
                  if (url) { const md = `\n![Gen](${url})\n`; res.write(md); fullText += md; }
              } else if (call.name === 'generate_video') {
                  res.write(userLang==='zh'?"\n[系统：生成视频...]\n":"\n[SYSTEM: Gen video...]\n");
                  const url = await generateVideoInternal(call.args.prompt);
                  if (url) { const md = `\n![Gen](${url})\n`; res.write(md); fullText += md; }
              }
          }
      }
      if (chunk.text) { res.write(chunk.text); fullText += chunk.text; }
    }
    session.history.push({ role: 'model', parts: [{ text: fullText }] });
    res.end();
  } catch (error) {
    console.error("AI Error:", error);
    // Friendly error
    const msg = error.message?.includes("Unsupported MIME type") 
        ? (userLang==='zh'?"\n[系统提示：不支持此文件格式。请转换为 PDF 后上传。]\n":"\n[Note: Unsupported file type. Try PDF.]\n")
        : `\n[SYSTEM ERROR: ${error.message}]\n`;
    res.write(msg);
    res.end();
  }
});

// Transcription & TTS
app.post('/api/ai/transcribe', upload.single('audio'), async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const resp = await ai.models.generateContent({ model: 'gemini-2.5-flash-native-audio-preview-12-2025', contents: { parts: [{ inlineData: { mimeType: req.file.mimetype, data: (await fs.promises.readFile(req.file.path)).toString('base64') } }, { text: "Transcribe." }] } });
        fs.unlink(req.file.path, ()=>{});
        res.json({ text: resp.text });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/tts', async (req, res) => {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const resp = await ai.models.generateContent({ model: "gemini-2.5-flash-preview-tts", contents: [{ parts: [{ text: req.body.text || "Ready." }] }], config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.body.voice || 'Kore' } } } } });
        res.json({ audio: resp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy stock (kept intact)
app.post('/api/analyze-stock', async (req, res) => {
  const { code, forceSearch, lang } = req.body;
  const ticker = code.trim().toUpperCase();
  const cacheKey = `${ticker}_${lang || 'en'}`;
  if (!forceSearch && stockCache.has(cacheKey) && (Date.now() - stockCache.get(cacheKey).timestamp < CACHE_TTL)) return res.json({ ...stockCache.get(cacheKey).data, isCached: true });
  const getSecId = (t) => /^[65]/.test(t) ? `1.${t}` : /^[031]/.test(t) ? `0.${t}` : null;
  const secid = getSecId(ticker);
  if (!secid) return res.status(400).json({ error: "Invalid Symbol" });
  try {
    const [qRes, kRes] = await Promise.all([ fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f59,f60,f161,f162,f163,f164,f167,f168,f169,f170,f171,f116`).then(r=>r.json()), fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=180`).then(r=>r.json()) ]);
    const d = qRes.data; const scale = Math.pow(10, d.f59 || 2);
    const history = (kRes.data?.klines || []).map(line => { const [date, open, close, high, low, vol] = line.split(','); return { date, open: parseFloat(open), close: parseFloat(close), high: parseFloat(high), low: parseFloat(low), volume: parseFloat(vol) }; });
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const aiResp = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: `Analyze ${ticker}: Price ${d.f43/scale}. JSON only: { sentiment: 50, strategyAdvice: {shortTerm:"", longTerm:"", trendFollower:""}, risks: [] }.`, config: { responseMimeType: "application/json" } });
    const aiData = JSON.parse(aiResp.text);
    const final = { code: ticker, name: d.f58, currentPrice: d.f43/scale, changePercent: d.f170/100, pe: d.f162/100, pb: d.f167/100, sentiment: aiData.sentiment, strategyAdvice: aiData.strategyAdvice, risks: aiData.risks, history, dataSource: "EastMoney", lastUpdated: new Date().toISOString() };
    stockCache.set(cacheKey, { data: final, timestamp: Date.now() });
    res.json(final);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Backend Active: ${PORT}`));
