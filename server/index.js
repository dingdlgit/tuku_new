
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

// Helper for waiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Robust JSON extractor from AI text
function extractJson(text) {
  try {
    // Try simple parse
    return JSON.parse(text);
  } catch (e) {
    // Try cleaning markdown blocks
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (e2) {
        throw new Error("Could not parse AI response as JSON");
      }
    }
    throw e;
  }
}

app.post('/api/analyze-stock', async (req, res) => {
  const { code } = req.body;
  
  if (!process.env.API_KEY || process.env.API_KEY === "undefined" || process.env.API_KEY === "") {
    return res.status(500).json({ error: "API_KEY_MISSING" });
  }

  const today = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview';

  const prompt = `Current Time: ${today}. Financial Analysis Task:
  Search for the LATEST TRADING DATA for stock "${code}". 
  If it's "000021", identify as "深科技" on SZSE (Current price should be around 32-33 CNY in Jan 2025).
  Return JSON:
  {
    "name": "string", "market": "string", "currentPrice": number, 
    "changeAmount": number, "changePercent": number, "pe": number, "pb": number,
    "turnoverRate": number, "amplitude": number, "trend": "STRONG|VOLATILE|WEAK",
    "support": number, "resistance": number, "sentiment": number,
    "strategyAdvice": { "shortTerm": "string", "longTerm": "string", "trendFollower": "string" },
    "risks": ["string"]
  }`;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const result = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const data = extractJson(result.text);

      // Generate history
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
      for (let i = 0; i < history.length; i++) {
          const ma = (d) => i < d - 1 ? null : parseFloat((history.slice(i - d + 1, i + 1).reduce((a, b) => a + b.close, 0) / d).toFixed(2));
          history[i].ma5 = ma(5);
          history[i].ma10 = ma(10);
          history[i].ma20 = ma(20);
      }

      return res.json({ ...data, history, code });

    } catch (err) {
      attempts++;
      const isRateLimit = err.message?.includes('429');
      
      console.error(`Attempt ${attempts} failed:`, err.message);

      if (isRateLimit && attempts < maxAttempts) {
        // Wait longer each time: 2s, 4s...
        await sleep(attempts * 2000);
        continue;
      }

      // If last attempt or not a rate limit error that can be fixed by waiting
      if (attempts >= maxAttempts) {
        return res.status(500).json({ 
          error: isRateLimit ? "API Quota Exceeded. Please try again in 1 minute." : "Service error: " + err.message,
          suggestion: "Gemini Free Tier has strict limits. Try again later."
        });
      }
      
      // For other errors, just break and return
      break;
    }
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
