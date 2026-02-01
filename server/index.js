
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
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

// Ensure directories exist
[UPLOAD_DIR, PROCESSED_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Stats Logic
function getStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      const initial = { processedCount: 0 };
      fs.writeFileSync(STATS_FILE, JSON.stringify(initial));
      return initial;
    }
    const content = fs.readFileSync(STATS_FILE, 'utf8').trim();
    if (!content) return { processedCount: 0 };
    return JSON.parse(content);
  } catch (e) { 
    console.error("Stats read error:", e);
    return { processedCount: 0 }; 
  }
}

function incrementStats() {
  const stats = getStats();
  stats.processedCount += 1;
  try {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  } catch (e) {
    console.error("Stats write error:", e);
  }
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

// Simulation backup for analyze-stock if direct client call fails or if requested
app.post('/api/analyze-stock', (req, res) => {
  let { code } = req.body;
  if (!code) return res.status(400).json({ error: "Code required" });
  code = code.toUpperCase().trim();

  const hash = crypto.createHash('md5').update(code).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);
  const random = (() => {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  })();

  const latestPrice = 20 + random() * 100;
  res.json({
    name: `DeepTech ${code}`,
    currentPrice: latestPrice,
    changeAmount: 0.5,
    changePercent: 1.5,
    market: "A-Share"
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
