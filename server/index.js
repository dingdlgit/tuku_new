import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bmp from 'bmp-js'; // Import bmp-js for fallback decoding
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
app.use('/api/uploads', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

/**
 * Robust Image Loader Helper
 * Tries to load image with Sharp directly.
 * If that fails (common with BMPs), falls back to bmp-js decoding
 * and creates a Sharp instance from raw pixel data.
 */
async function getSharpInstance(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  // 1. Try standard Sharp loading first
  try {
    const instance = sharp(filePath, { 
      failOnError: false, 
      limitInputPixels: false 
    });
    // Force a metadata read to check if it's valid
    await instance.metadata(); 
    return instance;
  } catch (error) {
    // 2. If standard loading fails and it's a BMP, try manual decoding
    if (ext === '.bmp') {
      console.log(`Standard Sharp load failed for BMP, trying bmp-js fallback for: ${filePath}`);
      try {
        const buffer = fs.readFileSync(filePath);
        const bitmap = bmp.decode(buffer);
        
        // Return a new Sharp instance based on raw pixel data
        // bmp-js returns ABGR (usually), Sharp expects RGBA or similar. 
        // We pass it as raw 4-channel data.
        return sharp(bitmap.data, {
          raw: {
            width: bitmap.width,
            height: bitmap.height,
            channels: 4
          }
        });
      } catch (bmpError) {
        console.error('bmp-js fallback also failed:', bmpError);
        throw error; // Throw original error if fallback fails
      }
    }
    throw error;
  }
}

// Routes
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`Processing upload: ${req.file.originalname} (${req.file.size} bytes)`);

  try {
    // Use helper to get a valid instance (handles BMP fallback)
    const imagePipeline = await getSharpInstance(req.file.path);
    const metadata = await imagePipeline.metadata();
    
    console.log('Metadata extracted:', metadata.width, 'x', metadata.height, 'Format:', metadata.format);
    
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
    console.error('Metadata extraction completely failed:', error.message);
    res.json({
      id: path.parse(req.file.filename).name,
      filename: req.file.filename,
      url: `/api/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
      width: 0, 
      height: 0
    });
  }
});

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  
  if (!id || !options) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const files = fs.readdirSync(UPLOAD_DIR);
  const originalFile = files.find(f => f.startsWith(id));
  
  if (!originalFile) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  const inputPath = path.join(UPLOAD_DIR, originalFile);
  
  // Determine output format
  let format = options.format;
  if (format === 'original') {
    format = path.extname(originalFile).slice(1).toLowerCase();
  }

  // FORCE PNG FOR BMP INPUT/OUTPUT
  if (format === 'bmp') {
    format = 'png';
  }

  const outputFilename = `tuku_${id}_${Date.now()}.${format}`;
  const outputPath = path.join(PROCESSED_DIR, outputFilename);

  console.log(`Processing image ${id} -> ${format}`);

  try {
    // Use helper to get valid instance (handles BMP fallback)
    // We clone it because we might need to modify the pipeline
    let pipeline = (await getSharpInstance(inputPath)).clone();

    // 1. Resize
    if ((options.width && options.width > 0) || (options.height && options.height > 0)) {
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
    if (options.blur > 0) pipeline = pipeline.blur(0.3 + options.blur);
    if (options.sharpen) pipeline = pipeline.sharpen();

    // 4. Watermark
    if (options.watermarkText) {
       const width = options.width || 800;
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

    // 5. Format Output
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
    console.log(`Processing complete: ${outputFilename}`);

    res.json({
      url: `/api/processed/${outputFilename}`,
      filename: outputFilename,
      size: stats.size
    });

  } catch (error) {
    console.error('Processing error details:', error);
    res.status(500).json({ error: `Processing failed: ${error.message}` });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (Max 20MB)' });
    }
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});