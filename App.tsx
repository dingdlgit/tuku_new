
import React, { useState, useRef, useEffect } from 'react';
import { Dropzone } from './components/Dropzone';
import { Controls } from './components/Controls';
import { StockDashboard } from './components/StockDashboard';
import { ImageFormat, ProcessOptions, UploadResponse, ProcessResponse, Language, RawPixelFormat } from './types';

const defaultOptions: ProcessOptions = {
  format: ImageFormat.ORIGINAL,
  quality: 85,
  width: null,
  height: null,
  maintainAspectRatio: true,
  resizeMode: 'cover',
  rotate: 0,
  flipX: false,
  flipY: false,
  grayscale: false,
  blur: 0,
  sharpen: false,
  watermarkText: '',
  watermarkPosition: 'bottom-right',
  rawWidth: undefined,
  rawHeight: undefined,
  rawPixelFormat: 'uyvy' // default
};

type AppMode = 'image' | 'data';

function App() {
  const [lang, setLang] = useState<Language>('en');
  const [mode, setMode] = useState<AppMode>('image');
  const [dataUnlocked, setDataUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  // Image Core States
  const [currentFile, setCurrentFile] = useState<UploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [options, setOptions] = useState<ProcessOptions>(defaultOptions);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);

  const t = {
    en: {
      appTitle: "TUKUKU",
      sloganTitle: "IMAGE PROCESSOR",
      uploadFailed: "CRITICAL ERROR: UPLOAD FAILED",
      processFailed: "PROCESSING ERROR",
      processedSuccess: "RENDER_COMPLETE",
      preview: "VISUAL_FEED",
      noPreview: "NO VISUAL FEED FOR RAW DATA",
      originalSize: "INPUT_SIZE",
      newSize: "OUTPUT_SIZE",
      savings: "EFFICIENCY",
      startOver: "RESET_SYSTEM",
      download: "EXTRACT_DATA",
      serverDesc: "SECURE SERVER CONNECTION :: ESTABLISHED",
      status: "STATUS",
      coord: "COORD",
      auto: "AUTO",
      modeImage: "IMAGE_CORE",
      modeData: "DATA_CORE",
      enterPwd: "ENTER ACCESS CODE",
      unlock: "UNLOCK",
      accessDenied: "ACCESS DENIED: MODULE UNDER CONSTRUCTION"
    },
    zh: {
      appTitle: "图酷酷",
      sloganTitle: "图像处理器",
      uploadFailed: "严重错误：上传失败",
      processFailed: "处理错误",
      processedSuccess: "渲染完毕",
      preview: "视觉反馈",
      noPreview: "RAW 数据无视觉反馈",
      originalSize: "输入体积",
      newSize: "输出体积",
      savings: "效率提升",
      startOver: "重置系统",
      download: "提取数据",
      serverDesc: "安全连接 :: 已建立",
      status: "状态",
      coord: "尺寸",
      auto: "自动",
      modeImage: "图像核心",
      modeData: "数据核心",
      enterPwd: "输入访问密钥",
      unlock: "解锁",
      accessDenied: "访问拒绝：功能正在新增中"
    }
  }[lang];

  // Fetch stats on load
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(data => {
        if (data.processedCount) setTotalProcessed(data.processedCount);
      })
      .catch(err => console.error("Failed to load stats", err));
  }, []);

  // Helper to guess pixel format from extension
  const getFormatFromExt = (filename: string): RawPixelFormat => {
      const lower = filename.toLowerCase();
      if (lower.endsWith('.uyvy')) return 'uyvy';
      if (lower.endsWith('.nv21')) return 'nv21';
      if (lower.endsWith('.rgba')) return 'rgba';
      if (lower.endsWith('.bgra')) return 'bgra';
      if (lower.endsWith('.rgb')) return 'rgb';
      if (lower.endsWith('.bgr')) return 'bgr';
      return 'uyvy'; 
  };
  
  const isRawFormat = (filename: string) => {
      const exts = ['.uyvy', '.yuv', '.nv21', '.raw', '.rgb', '.bgr', '.bgra', '.rgba', '.bin'];
      return exts.some(ext => filename.toLowerCase().endsWith(ext));
  };

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setResult(null);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = `${t.uploadFailed} (${response.status})`;
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch (e) {
          errorMessage = `${t.uploadFailed}: ${response.statusText || response.status}`;
        }
        throw new Error(errorMessage);
      }

      const data: UploadResponse = await response.json();
      setCurrentFile(data);
      
      const suggestedFormat = getFormatFromExt(data.originalName);
      const isRaw = isRawFormat(data.originalName);

      setOptions({
        ...defaultOptions,
        format: ImageFormat.ORIGINAL,
        width: data.width || null,
        height: data.height || null,
        rawWidth: isRaw ? (data.width || 1920) : undefined,
        rawHeight: isRaw ? (data.height || 1080) : undefined,
        rawPixelFormat: suggestedFormat
      });
    } catch (error: any) {
      console.error(error);
      alert(error.message || t.uploadFailed);
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!currentFile) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentFile.id,
          options
        })
      });

      if (!response.ok) {
        let errorMessage = t.processFailed;
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch (e) {
           errorMessage = `${t.processFailed}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: ProcessResponse = await response.json();

      await new Promise((resolve) => {
        const img = new Image();
        img.src = data.url;
        img.onload = resolve;
        img.onerror = resolve; 
      });

      setResult(data);
      setTotalProcessed(prev => prev + 1);

    } catch (error: any) {
      console.error(error);
      alert(error.message || t.processFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleReset = () => {
    setCurrentFile(null);
    setResult(null);
    setOptions(defaultOptions);
  };

  const getBitDepthLabel = (depth?: string) => {
    if (!depth) return null;
    if (depth === 'uchar') return null; 
    if (depth === 'ushort' || depth === 'short') return '16-BIT';
    if (depth === 'float') return '32-BIT FLOAT';
    if (depth === 'uint' || depth === 'int') return '32-BIT INT';
    return depth.toUpperCase();
  };

  const toggleLang = () => {
    setLang(prev => prev === 'en' ? 'zh' : 'en');
  };

  const handleModeSwitch = (newMode: AppMode) => {
    if (newMode === 'data' && !dataUnlocked) {
      setShowPasswordModal(true);
    } else {
      setMode(newMode);
    }
  };

  const handleUnlock = () => {
    if (passwordInput === '666888') {
      setDataUnlocked(true);
      setShowPasswordModal(false);
      setMode('data');
      setPasswordInput('');
    } else {
      alert(t.accessDenied);
      setShowPasswordModal(false);
      setPasswordInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent text-slate-300 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      
      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
           <div className="bg-slate-900 border border-cyan-500/50 p-8 max-w-sm w-full shadow-[0_0_50px_rgba(6,182,212,0.3)] relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-cyan-500 animate-pulse"></div>
               <h3 className="text-xl font-tech text-cyan-400 mb-6 text-center tracking-widest">{t.enterPwd}</h3>
               <input 
                 type="password" 
                 value={passwordInput}
                 onChange={(e) => setPasswordInput(e.target.value)}
                 className="w-full bg-black border border-slate-600 text-white px-4 py-2 font-code text-center tracking-[0.5em] mb-6 focus:outline-none focus:border-cyan-500"
                 autoFocus
                 onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
               />
               <div className="flex gap-4">
                  <button onClick={() => setShowPasswordModal(false)} className="flex-1 py-2 font-code text-slate-500 hover:text-white border border-transparent hover:border-slate-500">CANCEL</button>
                  <button onClick={handleUnlock} className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-tech tracking-wider clip-button">{t.unlock}</button>
               </div>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-cyan-900/50 bg-[#020617]/90 backdrop-blur-md py-4 px-6 shadow-[0_0_20px_rgba(6,182,212,0.1)] relative z-20">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={handleReset}>
            <div className={`w-10 h-10 border rounded-none flex items-center justify-center relative overflow-hidden transition-all duration-300 ${mode === 'image' ? 'bg-cyan-900/30 border-cyan-500' : 'bg-purple-900/30 border-purple-500'}`}>
               <div className={`absolute inset-0 animate-pulse ${mode === 'image' ? 'bg-cyan-400/10' : 'bg-purple-400/10'}`}></div>
               {mode === 'image' ? (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-cyan-400 relative z-10"><path strokeLinecap="square" strokeLinejoin="miter" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
               ) : (
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-purple-400 relative z-10"><path strokeLinecap="square" strokeLinejoin="miter" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
               )}
            </div>
            <div>
              <h1 className="text-2xl font-tech font-bold tracking-widest text-cyan-50 hover-glitch" data-text={t.appTitle}>{t.appTitle}</h1>
              <div className={`h-0.5 w-full bg-gradient-to-r to-transparent transition-colors duration-500 ${mode === 'image' ? 'from-cyan-500' : 'from-purple-500'}`}></div>
            </div>
          </div>

          {/* Core Switcher */}
          <div className="hidden md:flex bg-slate-900 border border-slate-700 p-1 rounded-sm">
             <button 
               onClick={() => handleModeSwitch('image')} 
               className={`px-4 py-1 text-xs font-tech tracking-wider transition-all ${mode === 'image' ? 'bg-cyan-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]' : 'text-slate-500 hover:text-slate-300'}`}
             >
               {t.modeImage}
             </button>
             <button 
               onClick={() => handleModeSwitch('data')}
               className={`px-4 py-1 text-xs font-tech tracking-wider transition-all ${mode === 'data' ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'text-slate-500 hover:text-slate-300'}`}
             >
               {t.modeData}
             </button>
          </div>

          <div className="flex items-center gap-6">
             <button 
               onClick={toggleLang}
               className="flex items-center justify-center px-4 py-1.5 text-xs font-code font-bold text-cyan-400 border border-cyan-800 hover:bg-cyan-900/30 hover:border-cyan-500 transition-all uppercase tracking-wider"
             >
                [{lang === 'en' ? 'CN' : 'EN'}]
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative z-10">
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar">
          
          {mode === 'data' ? (
             // --- DATA PROCESSOR CORE ---
             <div className="max-w-7xl mx-auto h-full min-h-[calc(100vh-80px)]">
                <StockDashboard lang={lang} />
             </div>
          ) : (
            // --- IMAGE PROCESSOR CORE ---
            <div className="max-w-7xl mx-auto p-6 h-full min-h-[calc(100vh-80px)]">
              {!currentFile ? (
                <div className="h-full flex flex-col justify-center items-center max-w-3xl mx-auto mt-20 md:mt-0">
                  <div className="w-full text-center mb-12 relative">
                     <h2 className="text-5xl md:text-6xl font-tech font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-500 mb-6 tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                       {t.sloganTitle}
                     </h2>
                  </div>
                  <div className="w-full max-w-xl">
                      <Dropzone onFileSelect={handleFileUpload} isUploading={isUploading} lang={lang} processedCount={totalProcessed} />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full pb-10">
                  {/* Left: Controls */}
                  <div className="lg:col-span-4 h-full max-h-[850px]">
                    <Controls 
                      options={options} 
                      setOptions={setOptions} 
                      onProcess={handleProcess}
                      isProcessing={isProcessing}
                      originalDimensions={{ width: currentFile.width || 0, height: currentFile.height || 0 }}
                      lang={lang}
                      inputFormat={currentFile.originalName} 
                    />
                  </div>

                  {/* Right: Preview & Result */}
                  <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* Preview Area Container */}
                    <div className="bg-slate-900/50 border border-slate-700 rounded-none flex-1 flex flex-col relative overflow-hidden group h-[500px] lg:h-auto">
                      {/* Tech Decor */}
                      <div className="absolute top-0 left-0 p-2 z-20 flex gap-1">
                          <div className="w-16 h-1 bg-cyan-600/50"></div>
                          <div className="w-4 h-1 bg-cyan-600/50"></div>
                      </div>
                      <div className="absolute bottom-0 right-0 p-2 z-20 text-[10px] font-code text-slate-500 uppercase">
                          {t.coord}: {options.width || t.auto} x {options.height || t.auto}
                      </div>

                      {/* Image Viewport */}
                      <div className="relative z-10 w-full h-full flex items-center justify-center p-8 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-900/5 to-transparent pointer-events-none"></div>
                        
                        {/* Holographic Scanner Effect (Overlay when processing) */}
                        {isProcessing && (
                           <div className="absolute inset-0 z-30 pointer-events-none">
                              <div className="scanner-overlay"></div>
                              <div className="scanner-line"></div>
                           </div>
                        )}

                        {/* Result View or Original View */}
                        {result ? (
                           <div className="flex flex-col items-center relative w-full h-full justify-center">
                              <img 
                                src={result.url} 
                                alt="Processed" 
                                className="max-h-[500px] w-full object-contain shadow-[0_0_30px_rgba(6,182,212,0.15)] border border-slate-700" 
                              />
                              
                              {/* Cyberpunk HUD Status Badge */}
                              <div className="absolute top-4 right-4 z-40 pointer-events-none">
                                  <div className="flex items-center gap-3 bg-cyan-950/80 border-l-2 border-cyan-400 px-4 py-2 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.2)] animate-pulse">
                                      <div className="flex flex-col items-end">
                                          <span className="text-[10px] font-tech text-cyan-400 tracking-widest">{t.status}</span>
                                          <span className="text-sm font-code font-bold text-white tracking-wider">{t.processedSuccess}</span>
                                      </div>
                                      <div className="w-2 h-2 bg-cyan-400 shadow-[0_0_10px_#06b6d4] rounded-full"></div>
                                  </div>
                              </div>
                           </div>
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center">
                             {isRawFormat(currentFile.filename) ? (
                                <div className="flex flex-col items-center justify-center p-8 border border-slate-700 bg-slate-900/80 backdrop-blur-sm relative z-20">
                                   {/* Glitch Effect on Icon */}
                                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 text-yellow-600 mb-4 opacity-80">
                                      <path strokeLinecap="square" strokeLinejoin="miter" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                   </svg>
                                   <span className="text-yellow-500 font-tech tracking-wider text-lg animate-pulse">{t.noPreview}</span>
                                   <span className="text-yellow-700 font-code text-xs mt-2 text-center max-w-xs uppercase border-t border-yellow-800/50 pt-2">
                                      {lang === 'en' ? 'Awaiting parameter configuration...' : '等待参数配置...'}
                                   </span>
                                </div>
                             ) : (
                               <>
                                 <img 
                                   src={currentFile.url} 
                                   alt="Original" 
                                   decoding="async"
                                   className="max-h-[500px] object-contain shadow-2xl border border-slate-700 transition-all duration-300 z-20" 
                                   style={{
                                     transform: `rotate(${options.rotate}deg) scaleX(${options.flipX ? -1 : 1}) scaleY(${options.flipY ? -1 : 1})`,
                                     filter: `
                                       grayscale(${options.grayscale ? 1 : 0}) 
                                       blur(${options.blur}px)
                                       ${options.sharpen ? 'contrast(1.2) brightness(1.1)' : ''}
                                     `
                                   }} 
                                 />
                                 <div className="absolute top-4 right-4 bg-black/70 border border-cyan-500/30 text-cyan-400 text-[10px] font-code px-3 py-1 backdrop-blur-md uppercase tracking-widest z-20">
                                   ● {t.preview}
                                 </div>
                               </>
                             )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Data Readout / Actions */}
                    {result && (
                      <div className="bg-slate-900/80 border-t border-b border-cyan-900/50 p-4 flex items-center justify-between relative backdrop-blur-md">
                         <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                         
                         <div className="flex items-center gap-8">
                            <div className="text-xs font-code">
                               <p className="text-slate-500 uppercase tracking-wider mb-1">{t.originalSize}</p>
                               <p className="text-slate-200">
                                 {formatSize(currentFile.size)} 
                                 {getBitDepthLabel(currentFile.depth) && (
                                   <span className="text-slate-600 ml-2">[{getBitDepthLabel(currentFile.depth)}]</span>
                                 )}
                               </p>
                            </div>
                            
                            <div className="text-2xl text-slate-700 font-thin">/</div>

                            <div className="text-xs font-code">
                               <p className="text-slate-500 uppercase tracking-wider mb-1">{t.newSize}</p>
                               <p className="text-cyan-400 font-bold glow-text">{formatSize(result.size)}</p>
                            </div>

                            <div className="text-2xl text-slate-700 font-thin">/</div>

                            <div className="text-xs font-code">
                               <p className="text-slate-500 uppercase tracking-wider mb-1">{t.savings}</p>
                               <p className="text-green-400">
                                 {currentFile.size > result.size 
                                   ? Math.round(((currentFile.size - result.size) / currentFile.size) * 100) + '%'
                                   : 'N/A'}
                               </p>
                            </div>
                         </div>
                         
                         <div className="flex gap-4">
                           <button 
                             onClick={handleReset}
                             className="px-4 py-2 text-xs font-code font-bold text-slate-400 hover:text-white border border-transparent hover:border-slate-500 transition-all uppercase tracking-wider"
                           >
                             {t.startOver}
                           </button>
                           <a 
                             href={result.url} 
                             download={result.filename}
                             className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-2 font-tech font-bold uppercase tracking-widest text-xs clip-button shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)] transition-all"
                           >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                              {t.download}
                           </a>
                         </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
