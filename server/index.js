import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Helper: Delete old files
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 mins
setInterval(() => {
  const now = Date.now();
  [UPLOAD_DIR, PROCESSED_DIR].forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (now - stats.mtimeMs > CLEANUP_INTERVAL) {
            fs.unlink(filePath, () => {});
          }
        });
      });
    });
  });
}, CLEANUP_INTERVAL);

// Serve static files
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/processed', express.static(PROCESSED_DIR));

// Routes
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const metadata = await sharp(req.file.path).metadata();
    
    res.json({
      id: path.parse(req.file.filename).name,
      filename: req.file.filename,
      url: `/api/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
      width: metadata.width,
      height: metadata.height
    });
  } catch (error) {
    console.error('Metadata error:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  
  if (!id || !options) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Find original file
  const files = fs.readdirSync(UPLOAD_DIR);
  const originalFile = files.find(f => f.startsWith(id));
  
  if (!originalFile) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  const inputPath = path.join(UPLOAD_DIR, originalFile);
  const outputFilename = `tuku_${id}_${Date.now()}.${options.format === 'original' ? path.extname(originalFile).slice(1) : options.format}`;
  const outputPath = path.join(PROCESSED_DIR, outputFilename);

  try {
    let pipeline = sharp(inputPath);

    // 1. Resize
    if (options.width || options.height) {
      pipeline = pipeline.resize({
        width: options.width || null,
        height: options.height || null,
        fit: options.maintainAspectRatio ? (options.resizeMode || 'cover') : 'fill'
      });
    }

    // 2. Rotate & Flip
    if (options.rotate) pipeline = pipeline.rotate(options.rotate);
    if (options.flipX) pipeline = pipeline.flop();
    if (options.flipY) pipeline = pipeline.flip();

    // 3. Filters
    if (options.grayscale) pipeline = pipeline.grayscale();
    if (options.blur > 0) pipeline = pipeline.blur(0.3 + options.blur); // Sharp needs > 0.3
    if (options.sharpen) pipeline = pipeline.sharpen();

    // 4. Watermark (Text via SVG overlay)
    if (options.watermarkText) {
       const width = options.width || 800; // approximation if not resizing
       const svgText = `
        <svg width="${width}" height="100">
          <style>
            .title { fill: rgba(255, 255, 255, 0.5); font-size: 48px; font-weight: bold; font-family: sans-serif; }
          </style>
          <text x="50%" y="50%" text-anchor="middle" class="title">${options.watermarkText}</text>
        </svg>`;
       pipeline = pipeline.composite([{
          input: Buffer.from(svgText),
          gravity: 'center'
       }]);
    }

    // 5. Format
    const format = options.format === 'original' ? path.extname(originalFile).slice(1) : options.format;
    
    // Quality adjustments
    if (['jpeg', 'webp', 'avif'].includes(format)) {
        // @ts-ignore
        pipeline = pipeline.toFormat(format, { quality: options.quality });
    } else if (format === 'png') {
        pipeline = pipeline.png({ quality: options.quality });
    } else {
        pipeline = pipeline.toFormat(format);
    }

    await pipeline.toFile(outputPath);
    
    const stats = fs.statSync(outputPath);

    res.json({
      url: `/api/processed/${outputFilename}`,
      filename: outputFilename,
      size: stats.size
    });

  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});