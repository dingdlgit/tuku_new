
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');
const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

[UPLOAD_DIR, PROCESSED_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

function getStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      const initial = { processedCount: 0 };
      fs.writeFileSync(STATS_FILE, JSON.stringify(initial));
      return initial;
    }
    const content = fs.readFileSync(STATS_FILE, 'utf8').trim();
    return content ? JSON.parse(content) : { processedCount: 0 };
  } catch (e) { return { processedCount: 0 }; }
}

function incrementStats() {
  const stats = getStats();
  stats.processedCount += 1;
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
}

app.get('/api/stats', (req, res) => res.json(getStats()));

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const metadata = await sharp(req.file.path).metadata();
    res.json({
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      filename: req.file.filename,
      url: `/api/files/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      depth: metadata.depth
    });
  } catch (err) {
    res.json({ id: uuidv4(), filename: req.file.filename, url: `/api/files/${req.file.filename}`, originalName: req.file.originalname, size: req.file.size });
  }
});

app.use('/api/files', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  const files = fs.readdirSync(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));
  if (!fileName) return res.status(404).json({ error: 'File not found' });

  const inputPath = path.join(UPLOAD_DIR, fileName);
  const outFilename = `processed_${uuidv4()}.${options.format === 'original' ? 'jpg' : options.format}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);

  try {
    let pipeline = sharp(inputPath);
    if (options.rotate) pipeline = pipeline.rotate(options.rotate);
    if (options.flipX) pipeline = pipeline.flop();
    if (options.flipY) pipeline = pipeline.flip();
    if (options.grayscale) pipeline = pipeline.grayscale();
    if (options.blur) pipeline = pipeline.blur(options.blur);
    if (options.sharpen) pipeline = pipeline.sharpen();
    if (options.width || options.height) pipeline = pipeline.resize(options.width, options.height, { fit: options.resizeMode || 'cover' });

    if (options.format === 'png') pipeline = pipeline.png();
    else if (options.format === 'webp') pipeline = pipeline.webp({ quality: options.quality });
    else pipeline = pipeline.jpeg({ quality: options.quality });

    await pipeline.toFile(outputPath);
    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });
  } catch (err) { res.status(500).json({ error: 'Processing failed' }); }
});

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { throw new Error("JSON_PARSE_ERROR"); }
    }
    throw e;
  }
}

app.post('/api/analyze-stock', async (req, res) => {
  const { code } = req.body;
  if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // 使用 flash 模型以获得极高的配额上限（非联网搜索模式下）
  const modelName = 'gemini-3-flash-preview';

  // 提示词明确要求日线级别数据，不强制要求实时性
  const prompt = `Task: Perform a Daily-level Technical and Fundamental Analysis for stock code: "${code}".
  Use your internal training data to estimate the latest available daily metrics (P/E, P/B, Market Cap).
  If it is a Chinese stock like "000021", please refer to "深科技".
  Return a JSON object ONLY:
  {
    "name": "string", 
    "market": "string", 
    "currentPrice": number, 
    "changeAmount": number, 
    "changePercent": number, 
    "pe": number, 
    "pb": number,
    "turnoverRate": number, 
    "amplitude": number, 
    "trend": "STRONG|VOLATILE|WEAK",
    "sentiment": number,
    "strategyAdvice": { "shortTerm": "string", "longTerm": "string", "trendFollower": "string" },
    "risks": ["string"]
  }`;

  try {
    // 移除 tools: [{ googleSearch: {} }]，彻底解决 429 问题
    const result = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const data = extractJson(result.text);
    data.isRealtime = false; // 标记为非实时数据

    // 生成模拟的历史K线数据（基于AI给出的当前价）
    const history = [];
    let p = (data.currentPrice || 10) / (1 + (data.changePercent || 0) / 100);
    for (let i = 0; i < 180; i++) {
      const change = (Math.random() - 0.5) * 0.04;
      const close = p * (1 + change);
      history.push({
        date: new Date(Date.now() - (180 - i) * 86400000).toISOString().split('T')[0],
        open: parseFloat(p.toFixed(2)),
        high: parseFloat((Math.max(p, close) * 1.01).toFixed(2)),
        low: parseFloat((Math.min(p, close) * 0.99).toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(1000000 + Math.random() * 5000000)
      });
      p = close;
    }
    
    // 计算移动平均线
    for (let i = 0; i < history.length; i++) {
        const ma = (d) => i < d - 1 ? null : parseFloat((history.slice(i - d + 1, i + 1).reduce((a, b) => a + b.close, 0) / d).toFixed(2));
        history[i].ma5 = ma(5);
        history[i].ma10 = ma(10);
        history[i].ma20 = ma(20);
    }

    return res.json({ ...data, history, code });

  } catch (err) {
    console.error("API Call Failed:", err);
    res.status(500).json({ 
      error: "ANALYSIS_FAILED", 
      message: err.message
    });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
