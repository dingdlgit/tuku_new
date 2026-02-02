
import React, { useState } from 'react';
import { ImageFormat, ProcessOptions, Language, RawPixelFormat, WatermarkPosition, AITaskType } from '../types';

interface ControlsProps {
  options: ProcessOptions;
  setOptions: React.Dispatch<React.SetStateAction<ProcessOptions>>;
  onProcess: () => void;
  onAIProcess: () => void;
  isProcessing: boolean;
  originalDimensions?: { width: number; height: number };
  lang: Language;
  inputFormat?: string; 
}

export const Controls: React.FC<ControlsProps> = ({ 
  options, 
  setOptions, 
  onProcess, 
  onAIProcess,
  isProcessing,
  originalDimensions,
  lang,
  inputFormat
}) => {
  // AI Security State
  const [isAiUnlocked, setIsAiUnlocked] = useState(false);
  const [showAiAuth, setShowAiAuth] = useState(false);
  const [aiPassword, setAiPassword] = useState('');

  const t = {
    en: {
      aiHeader: "NEURAL ENGINE",
      aiPrompt: "PROMPT / INSTRUCTION",
      aiTask: "AI TASK MODEL",
      taskVision: "VISION (DESCRIBE)",
      taskImgGen: "IMAGE GEN (EDIT)",
      taskVideo: "VIDEO GEN (VEO)",
      aiBtn: "ACTIVATE NEURAL NET",
      aiLocked: "NEURAL NET LOCKED // AUTH REQ",
      settings: "SYSTEM_CONFIG",
      sourceSettings: "RAW_DATA_INPUT",
      sourceDesc: "Required: Specify format & dimensions.",
      format: "OUTPUT_FORMAT",
      pixelFormat: "PIXEL_FORMAT",
      quality: "COMPRESSION",
      resize: "DIMENSIONS",
      maintainAspect: "LOCK_ASPECT",
      transform: "TRANSFORM",
      filters: "FILTERS",
      grayscale: "GRAYSCALE",
      sharpen: "SHARPEN",
      blur: "GAUSSIAN_BLUR",
      watermark: "WATERMARK",
      watermarkPos: "POSITION",
      posTL: "Top Left",
      posTR: "Top Right",
      posC: "Center",
      posBL: "Bottom Left",
      posBR: "Bottom Right",
      processBtn: "EXECUTE PROCESS",
      processing: "PROCESSING...",
      rotBtn: "ROT +90°",
      flipH: "FLIP H",
      flipV: "FLIP V",
      widthLabel: "W",
      heightLabel: "H",
      authTitle: "SECURITY PROTOCOL",
      enterPwd: "ENTER NEURAL TOKEN",
      unlock: "AUTHORIZE",
      cancel: "ABORT",
      accessDenied: "ACCESS DENIED: INVALID TOKEN"
    },
    zh: {
      aiHeader: "神经引擎 (AI)",
      aiPrompt: "提示词 / 指令",
      aiTask: "AI 任务模型",
      taskVision: "视觉理解 (描述场景)",
      taskImgGen: "图像生成 (AI修图)",
      taskVideo: "视频生成 (Veo)",
      aiBtn: "激活神经网络",
      aiLocked: "神经系统已锁定 // 需授权",
      settings: "系统配置",
      sourceSettings: "RAW 数据源",
      sourceDesc: "必填：指定格式与尺寸",
      format: "输出格式",
      pixelFormat: "像素格式",
      quality: "压缩质量",
      resize: "尺寸调整",
      maintainAspect: "锁定比例",
      transform: "变换控制",
      filters: "图像滤镜",
      grayscale: "灰度模式",
      sharpen: "锐化增强",
      blur: "高斯模糊",
      watermark: "水印叠加",
      watermarkPos: "位置",
      posTL: "左上",
      posTR: "右上",
      posC: "居中",
      posBL: "左下",
      posBR: "右下",
      processBtn: "执行处理",
      processing: "处理中...",
      rotBtn: "旋转 +90°",
      flipH: "水平翻转",
      flipV: "垂直翻转",
      widthLabel: "宽",
      heightLabel: "高",
      authTitle: "安全协议",
      enterPwd: "输入神经密钥",
      unlock: "授权",
      cancel: "取消",
      accessDenied: "访问拒绝：无效的密钥"
    }
  }[lang];

  const updateOption = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handleDimensionChange = (dimension: 'width' | 'height', value: string) => {
    const numValue = value ? Number(value) : null;
    
    setOptions(prev => {
      const next = { ...prev, [dimension]: numValue };
      if (
        prev.maintainAspectRatio && 
        originalDimensions && 
        originalDimensions.width > 0 && 
        originalDimensions.height > 0 && 
        numValue !== null
      ) {
        const ratio = originalDimensions.width / originalDimensions.height;
        if (dimension === 'width') {
          next.height = Math.round(numValue / ratio);
        } else {
          next.width = Math.round(numValue * ratio);
        }
      }
      return next;
    });
  };

  const handleAspectToggle = (checked: boolean) => {
    setOptions(prev => {
      const next = { ...prev, maintainAspectRatio: checked };
      if (
        checked && 
        originalDimensions && 
        originalDimensions.width > 0 && 
        originalDimensions.height > 0 && 
        next.width
      ) {
         const ratio = originalDimensions.width / originalDimensions.height;
         next.height = Math.round(next.width / ratio);
      }
      return next;
    });
  };

  // --- AI SECURITY LOGIC ---
  const handleAIButtonClick = () => {
    if (isAiUnlocked) {
      onAIProcess();
    } else {
      setAiPassword('');
      setShowAiAuth(true);
    }
  };

  const handleUnlockAttempt = () => {
    if (aiPassword === '666666') {
      setIsAiUnlocked(true);
      setShowAiAuth(false);
    } else {
      alert(t.accessDenied);
      setAiPassword('');
    }
  };

  const isRaw = inputFormat && (
      ['.uyvy', '.yuv', '.nv21', '.raw', '.rgb', '.bgr', '.bgra', '.rgba', '.bin'].some(ext => inputFormat.toLowerCase().endsWith(ext))
  );

  const rotateCount = (options.rotate % 360) / 90;

  return (
    <>
      {/* AI Password Modal */}
      {showAiAuth && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md">
           <div className="bg-slate-900 border border-purple-500/50 p-8 max-w-sm w-full shadow-[0_0_50px_rgba(168,85,247,0.4)] relative overflow-hidden group">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 animate-pulse"></div>
               
               <div className="text-center mb-6">
                 <div className="inline-block p-3 rounded-full bg-purple-900/30 border border-purple-500/30 mb-3">
                    <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                 </div>
                 <h3 className="text-xl font-tech text-purple-400 tracking-widest uppercase">{t.authTitle}</h3>
               </div>

               <p className="text-[10px] text-slate-500 font-code text-center mb-2 uppercase tracking-wider">{t.enterPwd}</p>
               <input 
                 type="password" 
                 value={aiPassword}
                 onChange={(e) => setAiPassword(e.target.value)}
                 className="w-full bg-black border border-purple-800 text-purple-100 px-4 py-3 font-code text-center tracking-[0.5em] mb-6 focus:outline-none focus:border-purple-500 focus:shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all"
                 autoFocus
                 placeholder="******"
                 onKeyDown={(e) => e.key === 'Enter' && handleUnlockAttempt()}
               />
               <div className="flex gap-4">
                  <button onClick={() => setShowAiAuth(false)} className="flex-1 py-2 font-code text-slate-500 hover:text-white border border-transparent hover:border-slate-500 transition-colors uppercase text-xs">{t.cancel}</button>
                  <button onClick={handleUnlockAttempt} className="flex-1 py-2 bg-purple-700 hover:bg-purple-600 text-white font-tech tracking-wider clip-button uppercase text-xs shadow-[0_0_15px_rgba(168,85,247,0.4)]">{t.unlock}</button>
               </div>
           </div>
        </div>
      )}

      <div className="bg-slate-900/80 backdrop-blur-md rounded-none border border-cyan-900/50 flex flex-col h-full overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-600 to-transparent"></div>

        <div className="p-4 border-b border-cyan-900/30 bg-slate-900/50 flex justify-between items-center">
          <h2 className="font-tech font-bold text-cyan-400 tracking-wider flex items-center">
            <span className="w-2 h-2 bg-cyan-500 mr-3 animate-pulse"></span>
            {t.settings}
          </h2>
          <div className="flex gap-1">
             <div className="w-1 h-1 bg-slate-600"></div>
             <div className="w-1 h-1 bg-slate-600"></div>
             <div className="w-1 h-1 bg-slate-600"></div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
          
          {/* --- AI SECTION --- */}
          <section className={`bg-purple-900/20 p-4 border-l-2 ${isAiUnlocked ? 'border-purple-500' : 'border-slate-600'} relative overflow-hidden group transition-all`}>
               <div className={`absolute inset-0 ${isAiUnlocked ? 'bg-purple-500/5 group-hover:bg-purple-500/10' : 'bg-black/40'} transition-colors pointer-events-none`}></div>
               
               <div className="flex justify-between items-start mb-3">
                 <label className={`block text-xs font-bold ${isAiUnlocked ? 'text-purple-400' : 'text-slate-500'} font-tech tracking-wider uppercase flex items-center gap-2`}>
                    <svg className={`w-4 h-4 ${isAiUnlocked ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    {t.aiHeader}
                 </label>
                 {!isAiUnlocked && <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
               </div>
               
               <div className={`transition-opacity duration-300 ${!isAiUnlocked ? 'opacity-50 grayscale pointer-events-none' : 'opacity-100'}`}>
                 <div className="mb-4">
                   <label className="block text-[10px] text-slate-400 mb-1 font-code">{t.aiTask}</label>
                   <select
                     value={options.aiTask || 'vision'}
                     onChange={(e) => updateOption('aiTask', e.target.value as AITaskType)}
                     className="w-full bg-black/40 border border-purple-500/30 text-purple-100 text-xs py-2 px-3 focus:outline-none focus:border-purple-500 font-code uppercase"
                   >
                     <option value="vision">{t.taskVision}</option>
                     <option value="generate-image">{t.taskImgGen}</option>
                     <option value="generate-video">{t.taskVideo}</option>
                   </select>
                 </div>

                 <div className="mb-4">
                    <label className="block text-[10px] text-slate-400 mb-1 font-code">{t.aiPrompt}</label>
                    <textarea 
                      rows={3}
                      value={options.aiPrompt}
                      onChange={(e) => updateOption('aiPrompt', e.target.value)}
                      placeholder={isAiUnlocked ? "e.g. Describe this image..." : "LOCKED"}
                      className="w-full bg-black/40 border border-purple-500/30 text-white text-xs py-2 px-3 focus:outline-none focus:border-purple-500 font-code rounded-sm"
                      disabled={!isAiUnlocked}
                    />
                 </div>
               </div>

               <button
                 onClick={handleAIButtonClick}
                 disabled={isProcessing}
                 className={`w-full py-2 px-3 font-tech font-bold uppercase tracking-wider text-[10px] clip-button transition-all relative overflow-hidden flex items-center justify-center gap-2
                   ${isProcessing 
                     ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                     : isAiUnlocked 
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                        : 'bg-slate-800 border border-slate-600 text-slate-400 hover:text-white hover:border-purple-500/50'
                   }
                 `}
               >
                 {!isAiUnlocked && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
                 {isProcessing ? t.processing : (isAiUnlocked ? t.aiBtn : t.aiLocked)}
               </button>
          </section>

          {isRaw && (
            <section className="bg-amber-900/20 p-4 border-l-2 border-amber-500">
               <label className="block text-xs font-bold text-amber-500 mb-1 font-tech tracking-wider">{t.sourceSettings}</label>
               <p className="text-[10px] text-amber-400/70 mb-4 font-code">{t.sourceDesc}</p>
               <div className="mb-4">
                 <label className="block text-[10px] font-semibold text-slate-400 mb-1 font-code">{t.pixelFormat}</label>
                 <select
                   value={options.rawPixelFormat || 'uyvy'}
                   onChange={(e) => updateOption('rawPixelFormat', e.target.value as RawPixelFormat)}
                   className="w-full bg-black/40 border border-amber-500/30 text-amber-100 text-xs py-2 px-3 focus:outline-none focus:border-amber-500 font-code uppercase"
                 >
                   <option value="uyvy">UYVY (YUV 4:2:2)</option>
                   <option value="nv21">NV21 (YUV 4:2:0)</option>
                   <option value="rgba">RGBA (32-bit)</option>
                   <option value="bgra">BGRA (32-bit)</option>
                   <option value="rgb">RGB (24-bit)</option>
                   <option value="bgr">BGR (24-bit)</option>
                 </select>
               </div>
               <div className="flex gap-2 items-center">
                  <div className="relative w-full">
                    <input type="number" placeholder="W" value={options.rawWidth || ''} onChange={(e) => updateOption('rawWidth', e.target.value ? Number(e.target.value) : undefined)} className="w-full bg-black/40 border border-amber-500/30 text-amber-100 text-xs py-2 px-3 pl-3 pr-8 focus:outline-none focus:border-amber-500 font-code" />
                    <span className="absolute right-3 top-2 text-[10px] text-slate-500">px</span>
                  </div>
                  <span className="text-slate-600">×</span>
                  <div className="relative w-full">
                    <input type="number" placeholder="H" value={options.rawHeight || ''} onChange={(e) => updateOption('rawHeight', e.target.value ? Number(e.target.value) : undefined)} className="w-full bg-black/40 border border-amber-500/30 text-amber-100 text-xs py-2 px-3 pl-3 pr-8 focus:outline-none focus:border-amber-500 font-code" />
                    <span className="absolute right-3 top-2 text-[10px] text-slate-500">px</span>
                  </div>
                </div>
            </section>
          )}

          <section>
            <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.format}</label>
            <div className="grid grid-cols-3 gap-2">
              {[ImageFormat.ORIGINAL, ImageFormat.JPEG, ImageFormat.PNG, ImageFormat.WEBP, ImageFormat.BMP].map(fmt => (
                <button key={fmt} onClick={() => updateOption('format', fmt)} className={`px-2 py-2 text-[10px] border font-code uppercase transition-all ${options.format === fmt ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}`}>{fmt === 'original' ? 'ORIG' : fmt}</button>
              ))}
            </div>
          </section>

          {options.format !== ImageFormat.PNG && options.format !== ImageFormat.BMP && (
            <section>
              <div className="flex justify-between mb-2">
                <label className="text-xs font-bold text-cyan-500 font-tech tracking-wider uppercase">{t.quality}</label>
                <span className="text-xs font-code text-cyan-300">{options.quality}%</span>
              </div>
              <input type="range" min="10" max="100" value={options.quality} onChange={(e) => updateOption('quality', Number(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
            </section>
          )}

          <section>
            <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.resize}</label>
            <div className="flex gap-2 items-center mb-3">
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">{t.widthLabel}</span>
                <input type="number" placeholder={originalDimensions?.width ? originalDimensions.width.toString() : ''} value={options.width || ''} onChange={(e) => handleDimensionChange('width', e.target.value)} className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 pl-8 pr-3 focus:outline-none focus:border-cyan-500 font-code placeholder-slate-700" />
              </div>
              <span className="text-slate-600 text-xs">×</span>
              <div className="relative w-full">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-bold">{t.heightLabel}</span>
                <input type="number" placeholder={originalDimensions?.height ? originalDimensions.height.toString() : ''} value={options.height || ''} onChange={(e) => handleDimensionChange('height', e.target.value)} className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 pl-8 pr-3 focus:outline-none focus:border-cyan-500 font-code placeholder-slate-700" />
              </div>
            </div>
            <div className="flex items-center">
              <input type="checkbox" id="aspect" checked={options.maintainAspectRatio} onChange={(e) => handleAspectToggle(e.target.checked)} className="h-3 w-3 text-cyan-600 bg-black border-slate-600 rounded focus:ring-cyan-500 focus:ring-offset-0" />
              <label htmlFor="aspect" className="ml-2 text-xs text-slate-400 font-code">{t.maintainAspect}</label>
            </div>
          </section>

          <section>
            <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.transform}</label>
            <div className="mb-2">
               <button onClick={() => updateOption('rotate', (options.rotate + 90) % 360)} className={`w-full py-1.5 border font-code text-[10px] transition-all relative overflow-hidden group ${rotateCount > 0 ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'bg-black/20 border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50'}`}>
                 <span className="relative z-10 flex items-center justify-center gap-2">{t.rotBtn} {rotateCount > 0 && (<span className="bg-cyan-500 text-black px-1.5 py-0.5 rounded-sm font-bold text-[9px] shadow-sm">x{rotateCount}</span>)}</span>
                 {rotateCount > 0 && <div className="absolute inset-0 bg-cyan-400/5 animate-pulse z-0"></div>}
               </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => updateOption('flipX', !options.flipX)} className={`flex-1 py-1.5 border text-[10px] font-code transition-colors ${options.flipX ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400' : 'border-slate-700 bg-black/20 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50'}`}>{t.flipH}</button>
              <button onClick={() => updateOption('flipY', !options.flipY)} className={`flex-1 py-1.5 border text-[10px] font-code transition-colors ${options.flipY ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400' : 'border-slate-700 bg-black/20 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50'}`}>{t.flipV}</button>
            </div>
          </section>

          <section>
             <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.filters}</label>
             <div className="space-y-3">
               <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs text-slate-400 font-code">{t.grayscale}</span>
                  <input type="checkbox" checked={options.grayscale} onChange={(e) => updateOption('grayscale', e.target.checked)} className="h-3 w-3 text-cyan-600 bg-black border-slate-600 rounded focus:ring-cyan-500 focus:ring-offset-0" />
               </div>
               <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs text-slate-400 font-code">{t.sharpen}</span>
                  <input type="checkbox" checked={options.sharpen} onChange={(e) => updateOption('sharpen', e.target.checked)} className="h-3 w-3 text-cyan-600 bg-black border-slate-600 rounded focus:ring-cyan-500 focus:ring-offset-0" />
               </div>
               <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-slate-400 font-code">{t.blur}</span>
                    <span className="text-[10px] text-cyan-500 font-code">{options.blur}px</span>
                  </div>
                  <input type="range" min="0" max="20" step="0.5" value={options.blur} onChange={(e) => updateOption('blur', Number(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
               </div>
             </div>
          </section>

          <section>
             <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.watermark}</label>
             <div className="mb-2">
               <label className="block text-[10px] text-slate-500 mb-1 font-code">{t.watermarkPos}</label>
               <select value={options.watermarkPosition || 'bottom-right'} onChange={(e) => updateOption('watermarkPosition', e.target.value as WatermarkPosition)} className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 px-3 focus:outline-none focus:border-cyan-500 font-code uppercase">
                 <option value="top-left">{t.posTL}</option>
                 <option value="top-right">{t.posTR}</option>
                 <option value="center">{t.posC}</option>
                 <option value="bottom-left">{t.posBL}</option>
                 <option value="bottom-right">{t.posBR}</option>
               </select>
             </div>
             <textarea rows={2} placeholder="" value={options.watermarkText} onChange={(e) => updateOption('watermarkText', e.target.value)} className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 px-3 focus:outline-none focus:border-cyan-500 font-code rounded-sm" />
          </section>
        </div>

        <div className="p-4 border-t border-cyan-900/30 bg-slate-900/50 relative">
          <button
            onClick={onProcess}
            disabled={isProcessing}
            className={`w-full py-3 px-4 font-tech font-bold uppercase tracking-widest text-sm clip-button transition-all relative overflow-hidden group
              ${isProcessing 
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]'
              }
            `}
          >
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
            {isProcessing ? t.processing : t.processBtn}
          </button>
        </div>
      </div>
    </>
  );
};
