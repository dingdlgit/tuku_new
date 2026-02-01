
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bmp from 'bmp-js'; 
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Stats Logic
function getStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      const initial = { processedCount: 0 };
      fs.writeFileSync(STATS_FILE, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch (e) { return { processedCount: 0 }; }
}

function incrementStats() {
  const stats = getStats();
  stats.processedCount += 1;
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  return stats.processedCount;
}

app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

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
    // If sharp fails (e.g. RAW file), just return basic info
    res.json({
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      filename: req.file.filename,
      url: `/api/files/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size
    });
  }
});

app.use('/api/files', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  if (!id) return res.status(400).json({ error: 'ID is required' });

  const files = fs.readdirSync(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));
  if (!fileName) return res.status(404).json({ error: 'File not found' });

  const inputPath = path.join(UPLOAD_DIR, fileName);
  const outFilename = `processed_${uuidv4()}.${options.format === 'original' ? 'jpg' : options.format}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);

  try {
    let pipeline = sharp(inputPath);

    // If it's a RAW file, sharp might need help or we use custom logic
    // (Simplification: assume standard formats for now)
    
    if (options.rotate) pipeline = pipeline.rotate(options.rotate);
    if (options.flipX) pipeline = pipeline.flop();
    if (options.flipY) pipeline = pipeline.flip();
    if (options.grayscale) pipeline = pipeline.grayscale();
    if (options.blur) pipeline = pipeline.blur(options.blur);
    if (options.sharpen) pipeline = pipeline.sharpen();

    if (options.width || options.height) {
      pipeline = pipeline.resize(options.width, options.height, {
        fit: options.resizeMode || 'cover'
      });
    }

    if (options.format === 'jpeg' || options.format === 'original') {
      pipeline = pipeline.jpeg({ quality: options.quality });
    } else if (options.format === 'png') {
      pipeline = pipeline.png();
    } else if (options.format === 'webp') {
      pipeline = pipeline.webp({ quality: options.quality });
    }

    await pipeline.toFile(outputPath);
    incrementStats();

    const stats = fs.statSync(outputPath);
    res.json({
      url: `/api/processed/${outFilename}`,
      filename: outFilename,
      size: stats.size
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// --- STOCK ANALYSIS API ---
app.post('/api/analyze-stock', (req, res) => {
  let { code } = req.body;
  if (!code) return res.status(400).json({ error: "Code required" });
  code = code.toUpperCase().trim();

  // Seeded Random
  const hash = crypto.createHash('md5').update(code).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);
  const random = (() => {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  })();

  const history = [];
  let currentPrice = 20 + random() * 100;
  for (let i = 0; i < 180; i++) {
    const dayChange = (random() - 0.48) * 2 * 0.02;
    const open = currentPrice;
    const close = open * (1 + dayChange);
    const high = Math.max(open, close) * (1 + random() * 0.01);
    const low = Math.min(open, close) * (1 - random() * 0.01);
    history.push({
      date: new Date(Date.now() - (180 - i) * 86400000).toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(1000000 + random() * 9000000)
    });
    currentPrice = close;
  }

  // Calculate MAs
  for (let i = 0; i < history.length; i++) {
    const calcMA = (p) => {
      if (i < p - 1) return null;
      return parseFloat((history.slice(i - p + 1, i + 1).reduce((a, b) => a + b.close, 0) / p).toFixed(2));
    };
    history[i].ma5 = calcMA(5);
    history[i].ma10 = calcMA(10);
    history[i].ma20 = calcMA(20);
  }

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];

  res.json({
    code,
    market: "A-Share",
    name: `DeepTech ${code}`,
    currentPrice: latest.close,
    changeAmount: parseFloat((latest.close - prev.close).toFixed(2)),
    changePercent: parseFloat(((latest.close - prev.close) / prev.close * 100).toFixed(2)),
    pe: parseFloat((10 + random() * 40).toFixed(2)),
    pb: parseFloat((1 + random() * 5).toFixed(2)),
    turnoverRate: parseFloat((1 + random() * 10).toFixed(2)),
    amplitude: parseFloat(((latest.high - latest.low) / prev.close * 100).toFixed(2)),
    trend: 'VOLATILE',
    support: parseFloat((latest.close * 0.95).toFixed(2)),
    resistance: parseFloat((latest.close * 1.05).toFixed(2)),
    sentiment: Math.floor(30 + random() * 60),
    strategyAdvice: {
      shortTerm: "Neutral momentum.",
      longTerm: "Hold.",
      trendFollower: "Wait for signal."
    },
    risks: ["Systemic volatility"],
    history
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
