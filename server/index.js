
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
import { registry } from './modelRegistry.js'; // Import Registry

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for Base64 uploads

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');
const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

const stockCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; 

// --- AI CORE SESSION STORAGE (In-Memory for this version) ---
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

// --- GENERIC FILE UPLOAD ---
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  
  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
  const isImage = req.file.mimetype.startsWith('image/');

  let meta = {};
  if (isImage) {
      try {
        const m = await sharp(req.file.path).metadata();
        meta = { width: m.width, height: m.height, format: m.format };
      } catch (err) {
         // Fallback for BMP/etc handled in main logic later or ignored here
      }
  }

  res.json({ 
    id: fileId, 
    filename: req.file.filename, 
    url: `/api/files/${req.file.filename}`, 
    originalName: req.file.originalname, 
    size: req.file.size, 
    mimeType: req.file.mimetype,
    ...meta
  });
});

app.use('/api/files', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

// --- STANDARD IMAGE PROCESSING (Existing Logic) ---
app.post('/api/process', async (req, res) => {
  // ... (Keep existing process logic completely intact)
  const { id, options } = req.body;
  const files = await fs.promises.readdir(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));
  
  if (!fileName) return res.status(404).json({ error: 'File not found' });
  
  const originalExt = path.extname(fileName).toLowerCase().replace('.', '');
  let targetFormat = options.format;
  
  if (targetFormat === 'original') {
    if (['bmp', 'png', 'webp', 'gif', 'avif', 'tiff'].includes(originalExt)) {
      targetFormat = originalExt;
    } else {
      targetFormat = 'jpeg'; 
    }
  }

  const outExt = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
  const outFilename = `processed_${uuidv4()}.${outExt}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);
  const filePath = path.join(UPLOAD_DIR, fileName);

  try {
    let p;
    if (options.rawWidth && options.rawHeight) {
      const isFourChannel = ['rgba', 'bgra', 'uyvy'].includes(options.rawPixelFormat || '');
      p = sharp(filePath, {
        raw: {
          width: options.rawWidth,
          height: options.rawHeight,
          channels: isFourChannel ? 4 : 3
        }
      });
    } else if (fileName.toLowerCase().endsWith('.bmp')) {
      try {
        p = sharp(filePath);
        await p.metadata(); 
      } catch (e) {
        const buffer = fs.readFileSync(filePath);
        const bmpData = bmp.decode(buffer);
        const abgr = bmpData.data;
        const rgba = Buffer.alloc(abgr.length);
        
        for (let i = 0; i < abgr.length; i += 4) {
          const alpha = abgr[i];
          const blue = abgr[i + 1];
          const green = abgr[i + 2];
          const red = abgr[i + 3];
          rgba[i]     = red;
          rgba[i + 1] = green;
          rgba[i + 2] = blue;
          rgba[i + 3] = alpha === 0 ? 255 : alpha; 
        }

        p = sharp(rgba, {
          raw: {
            width: bmpData.width,
            height: bmpData.height,
            channels: 4
          }
        });
      }
    } else {
      p = sharp(filePath);
    }

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
        const r = rgbaBuffer[i];
        const g = rgbaBuffer[i+1];
        const b = rgbaBuffer[i+2];
        const a = rgbaBuffer[i+3];
        abgrBuffer[i]   = a; 
        abgrBuffer[i+1] = b;
        abgrBuffer[i+2] = g;
        abgrBuffer[i+3] = r;
      }
      const bmpData = bmp.encode({
        data: abgrBuffer,
        width: info.width,
        height: info.height
      });
      fs.writeFileSync(outputPath, bmpData.data);
    } else {
      if (targetFormat === 'png') p = p.png(); 
      else if (targetFormat === 'webp') p = p.webp({ quality: options.quality }); 
      else p = p.jpeg({ quality: options.quality });
      await p.toFile(outputPath);
    }

    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });

  } catch (err) { 
    console.error("Processing Error", err);
    res.status(500).json({ error: 'Processing failed: ' + err.message }); 
  }
});

// ==========================================
// ========== AI CORE IMPLEMENTATION ========
// ==========================================

// Supported MIME types for Gemini API
const SUPPORTED_GEMINI_MIMES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv', 'video/mpg', 'video/wmv',
  'audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac',
  'application/pdf', 'text/plain', 'text/csv', 'text/html', 'text/javascript', 'text/x-python'
];

// Helper: Get File Parts for Gemini (and now reused for others via adapters)
async function getFileParts(attachments, lang = 'en') {
    if (!attachments || attachments.length === 0) return [];
    
    const parts = [];
    for (const att of attachments) {
        // Validation: Gemini only supports specific types
        if (!SUPPORTED_GEMINI_MIMES.includes(att.mimeType)) {
            const errorMsg = lang === 'zh' 
              ? `[系统提示：AI 核心暂时不支持直接读取 ${att.mimeType} (如 Word/Excel) 文件。请将其转换为 PDF 或纯文本后再试。]`
              : `[System Note: AI Core currently doesn't support ${att.mimeType} (like Word/Excel) directly. Please convert to PDF or Plain Text.]`;
            parts.push({ text: errorMsg });
            continue;
        }

        if (att.data) {
             parts.push({
                 inlineData: {
                     mimeType: att.mimeType,
                     data: att.data
                 }
             });
        } else if (att.filename) {
             try {
                const filePath = path.join(UPLOAD_DIR, att.filename);
                if (fs.existsSync(filePath)) {
                    const fileBuffer = await fs.promises.readFile(filePath);
                    parts.push({
                        inlineData: {
                            mimeType: att.mimeType,
                            data: fileBuffer.toString('base64')
                        }
                    });
                }
             } catch (e) {
                 console.error("Error reading attachment:", e);
             }
        }
    }
    return parts;
}

// Helper: Generate Image using Gemini 2.5 Flash Image
async function generateImageInternal(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: { parts: [{ text: prompt }] },
  });

  let outBase64 = null;
  if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
              outBase64 = part.inlineData.data;
              break;
          }
      }
  }

  if (outBase64) {
      const outFilename = `ai_chat_gen_${uuidv4()}.png`;
      const outputPath = path.join(PROCESSED_DIR, outFilename);
      fs.writeFileSync(outputPath, Buffer.from(outBase64, 'base64'));
      return `/api/processed/${outFilename}`;
  }
  return null;
}

// Helper: Generate Video using Veo
async function generateVideoInternal(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Use 'veo-3.1-fast-generate-preview' for general video tasks
  const model = 'veo-3.1-fast-generate-preview';
  
  let operation = await ai.models.generateVideos({
    model: model,
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p', // Only 720p available currently for this model/tier in this example context
      aspectRatio: '16:9'
    }
  });

  // Polling loop for video generation
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({operation: operation});
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (downloadLink) {
     // Must append API key to download
     const vidRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
     if (!vidRes.ok) throw new Error("Failed to download generated video");
     
     const arrayBuffer = await vidRes.arrayBuffer();
     const outFilename = `ai_chat_video_${uuidv4()}.mp4`;
     const outputPath = path.join(PROCESCESED_DIR, outFilename);
     fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
     return `/api/processed/${outFilename}`;
  }
  return null;
}

// 1. Session Management
app.get('/api/ai/sessions', (req, res) => {
    const sessionList = Array.from(sessions.values()).map(s => ({
        id: s.id,
        title: s.title,
        mode: s.mode,
        createdAt: s.createdAt,
        lastMessageAt: s.lastMessageAt,
        preview: s.history.length > 0 && s.history[s.history.length-1].parts ? s.history[s.history.length-1].parts[0].text.substring(0, 50) + "..." : "New Session"
    })).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    res.json(sessionList);
});

// Added Endpoint: Get Single Session (with history)
app.get('/api/ai/sessions/:id', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json(session);
});

app.post('/api/ai/sessions', (req, res) => {
    const { mode } = req.body;
    const id = uuidv4();
    const newSession = {
        id,
        title: "New Neural Link",
        mode: mode || 'general',
        history: [], // Gemini Format: { role: string, parts: [] }
        createdAt: Date.now(),
        lastMessageAt: Date.now()
    };
    sessions.set(id, newSession);
    res.json(newSession);
});

app.delete('/api/ai/sessions/:id', (req, res) => {
    sessions.delete(req.params.id);
    res.json({ success: true });
});

// 2. Main Chat Endpoint (Text + File + Image + Audio Input)
// UPDATED: Supports Adapter Routing
app.post('/api/ai/chat', async (req, res) => {
  const { sessionId, message, attachments, model, lang } = req.body;
  const session = sessions.get(sessionId);
  const currentSession = session || { history: [], mode: 'general' };
  
  // Set headers for streaming
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  // Common System Instructions
  const instructions = {
        en: {
            general: "You are TuKu AI Core, a helpful assistant. Keep answers concise.",
            coder: "You are an Elite Senior Engineer. Provide efficient, secure, robust code.",
            analyst: "You are a Data Scientist. Provide structured insights. Use JSON output where possible.",
            creative: "You are a Creative Director. Use vivid imagery and think outside the box."
        },
        zh: {
            general: "你是图酷 AI 核心，运行在赛博朋克接口中的智能助手。请用中文回答，保持简洁。",
            coder: "你是一位精英高级工程师。请提供高效、安全的代码。默认使用 TypeScript/Python。",
            analyst: "你是一位数据科学家。请提供结构化的见解，尽可能输出 JSON。",
            creative: "你是一位创意总监。请使用生动的意象进行创作。"
        }
  };
  const userLang = lang === 'zh' ? 'zh' : 'en';
  const systemInstruction = instructions[userLang][currentSession.mode] || instructions[userLang]['general'];

  // --- ROUTING LOGIC ---
  if (!registry.isGemini(model)) {
    // === ADAPTER PATH (OpenAI, Local, etc) ===
    try {
        const adapter = registry.getAdapter(model);
        if (!adapter) throw new Error(`Model adapter not found for: ${model}`);

        // Prepare attachments with data for adapters
        const enrichedAttachments = [];
        if (attachments) {
            for (const att of attachments) {
                if (att.data) enrichedAttachments.push(att);
                else if (att.filename) {
                    const filePath = path.join(UPLOAD_DIR, att.filename);
                    if (fs.existsSync(filePath)) {
                        const fileBuffer = await fs.promises.readFile(filePath);
                        enrichedAttachments.push({ ...att, data: fileBuffer.toString('base64') });
                    }
                }
            }
        }

        // Add user message to history temporarily for context (adapters handle history formatting internally)
        if (session && message) {
            session.history.push({ role: 'user', parts: [{ text: message }] }); // Gemini format stored for consistency
            session.lastMessageAt = Date.now();
            if (session.history.length === 1) session.title = message.substring(0, 30);
        }

        // Execute Adapter Stream
        const fullResponseText = await adapter.chatStream({
            message,
            history: currentSession.history.slice(0, -1), // Send history excluding current message
            attachments: enrichedAttachments,
            systemInstruction,
            model,
            res
        });

        // Save Response
        if (session) {
            session.history.push({ role: 'model', parts: [{ text: fullResponseText }] });
        }
        res.end();
        return;

    } catch (e) {
        console.error("Adapter Error:", e);
        res.write(`\n[SYSTEM ADAPTER ERROR: ${e.message}]\n`);
        res.end();
        return;
    }
  }

  // === EXISTING GEMINI LOGIC (Preserved) ===
  if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chatModel = model || 'gemini-3-flash-preview';

    const tools = [{
      functionDeclarations: [
        {
          name: "generate_image",
          description: "Generate an image based on a prompt.",
          parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING } }, required: ["prompt"] }
        },
        {
          name: "generate_video",
          description: "Generate a video based on a prompt.",
          parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING } }, required: ["prompt"] }
        }
      ]
    }];

    const newParts = [];
    if (message) newParts.push({ text: message });
    const attachmentParts = await getFileParts(attachments, userLang);
    newParts.push(...attachmentParts);

    const historyPayload = currentSession.history.map(h => ({ role: h.role, parts: h.parts }));

    const chat = ai.chats.create({
      model: chatModel,
      history: historyPayload,
      config: { systemInstruction, tools: tools },
    });

    if (session) {
        session.history.push({ role: 'user', parts: newParts });
        session.lastMessageAt = Date.now();
        if (session.history.length === 1 && message) session.title = message.substring(0, 30);
    }

    const result = await chat.sendMessageStream({ message: newParts });
    let fullResponseText = '';

    for await (const chunk of result) {
      if (chunk.functionCalls && chunk.functionCalls.length > 0) {
          const call = chunk.functionCalls[0];
          if (call.name === 'generate_image') {
              res.write(userLang === 'zh' ? "\n[系统：正在生成图像...]\n" : "\n[SYSTEM: Generating image...]\n");
              const imageUrl = await generateImageInternal(call.args.prompt);
              if (imageUrl) {
                  const md = `\n![Generated Image](${imageUrl})\n`;
                  res.write(md); fullResponseText += md;
              }
          } else if (call.name === 'generate_video') {
              res.write(userLang === 'zh' ? "\n[系统：正在生成视频...]\n" : "\n[SYSTEM: Generating video...]\n");
              const videoUrl = await generateVideoInternal(call.args.prompt);
              if (videoUrl) {
                  const md = `\n![Generated Video](${videoUrl})\n`;
                  res.write(md); fullResponseText += md;
              }
          }
      }
      if (chunk.text) {
        res.write(chunk.text);
        fullResponseText += chunk.text;
      }
    }

    if (session) session.history.push({ role: 'model', parts: [{ text: fullResponseText }] });
    res.end();

  } catch (error) {
    console.error("AI Core Error:", error);
    // Friendly error for Gemini unsupported types if it bypassed the check
    if (error.message?.includes("Unsupported MIME type")) {
        res.write(userLang === 'zh' 
          ? "\n[系统提示：AI 核心暂时不支持读取此类型文件。请尝试转换为 PDF 再上传。]\n" 
          : "\n[System Error: Unsupported file type. Please try PDF instead.]\n");
    } else {
        res.write(`\n[SYSTEM ERROR: ${error.message}]`);
    }
    res.end();
  }
});

// ... rest of the file stays same
app.post('/api/ai/transcribe', upload.single('audio'), async (req, res) => {
    if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
    if (!req.file) return res.status(400).json({ error: "No audio file" });

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const fileBuffer = await fs.promises.readFile(req.file.path);
        
        // Gemini 2.5/3 can transcribe directly via multimodal input
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-native-audio-preview-12-2025',
            contents: {
                parts: [
                    { inlineData: { mimeType: req.file.mimetype, data: fileBuffer.toString('base64') } },
                    { text: "Transcribe this audio exactly. Output only the text." }
                ]
            }
        });

        // Cleanup
        fs.unlink(req.file.path, () => {});

        res.json({ text: response.text });
    } catch (e) {
        console.error("Transcribe Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/ai/tts', async (req, res) => {
    if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
    const { text, voice } = req.body;

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text || "System Ready." }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            res.json({ audio: base64Audio });
        } else {
            throw new Error("No audio data generated");
        }
    } catch (e) {
        console.error("TTS Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ... existing endpoints like stock and image process ...
app.listen(PORT, () => console.log(`Backend Active: ${PORT}`));
