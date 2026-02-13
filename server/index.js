
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
import { BacktestEngine } from './backtestEngine.js'; // Import Engine

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

// Standard Image Processing
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
      const isFourChannel = ['rgba', 'bgra', 'uyvy'].includes(options.rawPixelFormat || '');
      p = sharp(filePath, { raw: { width: options.rawWidth, height: options.rawHeight, channels: isFourChannel ? 4 : 3 } });
    } else if (fileName.toLowerCase().endsWith('.bmp')) {
      try { p = sharp(filePath); await p.metadata(); } catch (e) {
        const buffer = fs.readFileSync(filePath);
        const bmpData = bmp.decode(buffer);
        const abgr = bmpData.data;
        const rgba = Buffer.alloc(abgr.length);
        for (let i = 0; i < abgr.length; i += 4) {
          const alpha = abgr[i]; const blue = abgr[i+1]; const green = abgr[i+2]; const red = abgr[i+3];
          rgba[i] = red; rgba[i+1] = green; rgba[i+2] = blue; rgba[i+3] = alpha === 0 ? 255 : alpha;
        }
        p = sharp(rgba, { raw: { width: bmpData.width, height: bmpData.height, channels: 4 } });
      }
    } else p = sharp(filePath);

    if (options.rotate) p = p.rotate(options.rotate);
    if (options.flipX) p = p.flop();
    if (options.flipY) p = p.flip();
    if (options.grayscale) p = p.grayscale();
    if (options.blur) p = p.blur(options.blur);
    if (options.sharpen) p = p.sharpen();
    if (options.width || options.height) p = p.resize(options.width, options.height, { fit: options.resizeMode || 'cover' });
    
    if (targetFormat === 'bmp') {
      p = p.toColorspace('srgb').ensureAlpha();
      const { data: rgbaBuffer, info } = await p.raw().toBuffer({ resolveWithObject: true });
      const abgrBuffer = Buffer.alloc(rgbaBuffer.length);
      for (let i = 0; i < rgbaBuffer.length; i += 4) {
        const r = rgbaBuffer[i]; const g = rgbaBuffer[i+1]; const b = rgbaBuffer[i+2]; const a = rgbaBuffer[i+3];
        abgrBuffer[i] = a; abgrBuffer[i+1] = b; abgrBuffer[i+2] = g; abgrBuffer[i+3] = r;
      }
      const bmpData = bmp.encode({ data: abgrBuffer, width: info.width, height: info.height });
      fs.writeFileSync(outputPath, bmpData.data);
    } else {
      if (targetFormat === 'png') p = p.png(); else if (targetFormat === 'webp') p = p.webp({ quality: options.quality }); else p = p.jpeg({ quality: options.quality });
      await p.toFile(outputPath);
    }
    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });
  } catch (err) { res.status(500).json({ error: 'Processing failed: ' + err.message }); }
});

// AI Core
app.get('/api/ai/sessions', (req, res) => {
    const sessionList = Array.from(sessions.values()).map(s => ({ id: s.id, title: s.title, mode: s.mode, createdAt: s.createdAt, lastMessageAt: s.lastMessageAt, preview: s.history.length > 0 && s.history[s.history.length-1].parts ? s.history[s.history.length-1].parts[0].text.substring(0, 50) + "..." : "New Session" })).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    res.json(sessionList);
});
app.get('/api/ai/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
});
app.post('/api/ai/sessions', (req, res) => {
    const { mode } = req.body;
    const id = uuidv4();
    const newSession = { id, title: "New Neural Link", mode: mode || 'general', history: [], createdAt: Date.now(), lastMessageAt: Date.now() };
    sessions.set(id, newSession);
    res.json(newSession);
});
app.delete('/api/ai/sessions/:id', (req, res) => { sessions.delete(req.params.id); res.json({ success: true }); });

app.post('/api/ai/chat', async (req, res) => {
  const { sessionId, message, attachments, model, lang } = req.body;
  const session = sessions.get(sessionId);
  const currentSession = session || { history: [], mode: 'general' };
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  const instructions = { en: { general: "You are TuKu AI Core...", coder: "Senior Engineer...", analyst: "Data Scientist...", creative: "Creative Director..." }, zh: { general: "你是图酷 AI 核心...", coder: "工程师...", analyst: "数据分析师...", creative: "创意总监..." } };
  const userLang = lang === 'zh' ? 'zh' : 'en';
  const systemInstruction = instructions[userLang][currentSession.mode] || instructions[userLang]['general'];

  if (!registry.isGemini(model)) {
    const adapter = registry.getAdapter(model);
    const enrichedAttachments = [];
    if (attachments) {
        for (const att of attachments) {
            if (att.data) enrichedAttachments.push(att);
            else if (att.filename) {
                const filePath = path.join(UPLOAD_DIR, att.filename);
                if (fs.existsSync(filePath)) enrichedAttachments.push({ ...att, data: (await fs.promises.readFile(filePath)).toString('base64') });
            }
        }
    }
    if (session && message) {
        session.history.push({ role: 'user', parts: [{ text: message }] });
        session.lastMessageAt = Date.now();
    }
    const fullText = await adapter.chatStream({ message, history: currentSession.history.slice(0, -1), attachments: enrichedAttachments, systemInstruction, model, res });
    if (session) session.history.push({ role: 'model', parts: [{ text: fullText }] });
    res.end();
    return;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const chatModel = model || 'gemini-3-flash-preview';
  const newParts = message ? [{ text: message }] : [];
  newParts.push(...(await (async () => {
      const parts = [];
      for (const att of (attachments || [])) {
          if (att.data) parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } });
          else if (att.filename) {
              const filePath = path.join(UPLOAD_DIR, att.filename);
              if (fs.existsSync(filePath)) parts.push({ inlineData: { mimeType: att.mimeType, data: (await fs.promises.readFile(filePath)).toString('base64') } });
          }
      }
      return parts;
  })()));

  const history = currentSession.history.map(h => ({ role: h.role, parts: h.parts }));
  const chat = ai.chats.create({ model: chatModel, history, config: { systemInstruction } });
  if (session) { session.history.push({ role: 'user', parts: newParts }); session.lastMessageAt = Date.now(); if (session.history.length === 1 && message) session.title = message.substring(0, 30); }

  const result = await chat.sendMessageStream({ message: newParts });
  let fullResponseText = '';
  for await (const chunk of result) { if (chunk.text) { res.write(chunk.text); fullResponseText += chunk.text; } }
  if (session) session.history.push({ role: 'model', parts: [{ text: fullResponseText }] });
  res.end();
});

// --- UPDATED QUANT ENDPOINTS ---

app.post('/api/analyze-stock', async (req, res) => {
  const { code, lang } = req.body;
  if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
  const ticker = code.trim().toUpperCase();

  function getSecId(ticker) {
      if (/^[6]/.test(ticker)) return `1.${ticker}`; 
      if (/^[03]/.test(ticker)) return `0.${ticker}`; 
      if (/^[5]/.test(ticker)) return `1.${ticker}`; 
      if (/^[1]/.test(ticker)) return `0.${ticker}`; 
      return null;
  }
  
  async function fetchRealTimeQuote(ticker) {
      const secid = getSecId(ticker);
      if (!secid) return null;
      try {
        const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f59,f60,f161,f162,f163,f164,f167,f168,f169,f170,f171,f116`;
        const response = await fetch(url);
        const json = await response.json();
        if (!json.data) return null;
        const d = json.data;
        const scale = Math.pow(10, d.f59 || 2);
        return { name: d.f58, price: d.f43 / scale, open: d.f46 / scale, high: d.f44 / scale, low: d.f45 / scale, vol: d.f47, turnover: d.f168 / 100, changePercent: d.f170 / 100, pe: d.f162 / 100, pb: d.f167 / 100 };
      } catch (e) { return null; }
  }

  async function fetchHistoricalKLines(ticker, limit = 180) {
      const secid = getSecId(ticker);
      if (!secid) return [];
      try {
        const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=${limit}`;
        const response = await fetch(url);
        const json = await response.json();
        if (!json.data || !json.data.klines) return [];
        return json.data.klines.map(line => {
          const [date, open, close, high, low, vol] = line.split(',');
          return { date, open: parseFloat(open), close: parseFloat(close), high: parseFloat(high), low: parseFloat(low), volume: parseFloat(vol) };
        });
      } catch (e) { return []; }
  }

  const [realQuote, history] = await Promise.all([fetchRealTimeQuote(ticker), fetchHistoricalKLines(ticker)]);
  
  res.json({
      code: ticker, name: realQuote?.name || ticker, market: "CN", currentPrice: realQuote?.price || 0, changePercent: realQuote?.changePercent || 0, pe: realQuote?.pe || 0, pb: realQuote?.pb || 0, history: history, dataSource: "Real-time Light"
  });
});

app.post('/api/ai-analyze-stock', async (req, res) => {
    const { code, history, lang } = req.body;
    if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
    const userLang = lang === 'zh' ? 'Chinese' : 'English';
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    try {
        const prompt = `Analyze this stock data for ${code}. History: ${JSON.stringify(history.slice(-20))}. Give strategic advice and risk assessment. Return JSON: { "sentiment": number, "strategyAdvice": { "shortTerm": "string", "longTerm": "string", "trendFollower": "string" }, "risks": ["string"] }. Language: ${userLang}`;
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        res.json(JSON.parse(response.text));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/backtest', async (req, res) => {
    const { history, initial_capital, commission_rate, strategy } = req.body;
    try {
        let strategyFn;
        if (strategy === 'smaCross') strategyFn = (data) => BacktestEngine.smaCross(data, 5, 20);
        else if (strategy === 'ma5Hold') strategyFn = (data) => data.map((d, i) => i === 0 ? 1 : 0); // Buy and hold
        else throw new Error("Unknown strategy");

        const result = BacktestEngine.run(history, initial_capital || 100000, commission_rate || 0.0003, strategyFn);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Backend Active: ${PORT}`));
