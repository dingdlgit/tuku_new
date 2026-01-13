
import React, { useRef, useState } from 'react';
import { Language } from '../types';

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
  lang: Language;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileSelect, isUploading, lang }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = {
    en: {
      uploading: "UPLOADING DATA STREAM...",
      mainText: "INITIALIZE UPLOAD",
      subText: "SUPPORTED PROTOCOLS: JPG, PNG, WEBP, BMP, RAW (UYVY, NV21, RGB...)",
      formatError: "PROTOCOL MISMATCH: Format not supported.",
      sizeError: "MEMORY OVERFLOW: Max size is 20MB."
    },
    zh: {
      uploading: "数据流上传中...",
      mainText: "初始化上传序列",
      subText: "支持协议: JPG, PNG, BMP, RAW (UYVY, NV21, RGB...) (Max 20MB)",
      formatError: "协议不匹配：不支持该格式。",
      sizeError: "内存溢出：最大允许 20MB。"
    }
  }[lang];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(e.target.files[0]);
    }
  };

  const validateAndUpload = (file: File) => {
    const validExtensions = [
      '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.heic', 
      '.uyvy', '.yuv', '.raw', '.rgb', '.bgr', '.bgra', '.rgba', '.nv21', '.bin'
    ];
    
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
    const isValidExt = validExtensions.includes(fileExt);
    const isImageMime = file.type.startsWith('image/');

    if (!isValidExt && !isImageMime) {
      alert(t.formatError);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert(t.sizeError);
      return;
    }
    onFileSelect(file);
  };

  return (
    <div
      onClick={() => !isUploading && fileInputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative w-full h-72 border border-dashed rounded-none flex flex-col items-center justify-center cursor-pointer transition-all duration-300 overflow-hidden group
        ${isDragOver 
          ? 'border-cyan-400 bg-cyan-900/20 shadow-[0_0_30px_rgba(6,182,212,0.3)]' 
          : 'border-slate-600 bg-slate-900/50 hover:border-cyan-500 hover:bg-slate-900/80'}
        ${isUploading ? 'opacity-80 pointer-events-none' : ''}
      `}
      style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)" }}
    >
      {/* Scanning Line Animation */}
      <div className={`absolute top-0 left-0 w-full h-1 bg-cyan-500/50 shadow-[0_0_15px_#06b6d4] transition-all duration-1000 ${isUploading ? 'animate-[scan_1.5s_ease-in-out_infinite]' : 'opacity-0 group-hover:opacity-100 animate-[scan_3s_ease-in-out_infinite]'}`}></div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleChange} 
        className="hidden" 
        accept="image/*,.uyvy,.yuv,.raw,.rgb,.bgr,.bin,.nv21"
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center z-10">
           {/* Tech Spinner */}
           <div className="relative w-16 h-16 mb-4">
              <div className="absolute w-full h-full border-4 border-slate-700 rounded-full"></div>
              <div className="absolute w-full h-full border-t-4 border-cyan-500 rounded-full animate-spin"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-cyan-500 text-xs font-code animate-pulse">LOAD</div>
           </div>
           <p className="text-lg font-tech tracking-wider text-cyan-400 animate-pulse">{t.uploading}</p>
        </div>
      ) : (
        <>
          <div className="relative mb-6 group-hover:scale-110 transition-transform duration-300">
            <div className="absolute -inset-4 bg-cyan-500/20 rounded-full blur-xl group-hover:bg-cyan-500/40 transition-all"></div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 text-cyan-400 relative z-10">
              <path strokeLinecap="square" strokeLinejoin="miter" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="text-2xl font-tech font-bold text-slate-200 group-hover:text-cyan-300 transition-colors mb-2 tracking-wide uppercase">{t.mainText}</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></span>
            <p className="text-xs font-code text-slate-400 group-hover:text-cyan-200/70 uppercase tracking-tight">{t.subText}</p>
          </div>
        </>
      )}
      
      {/* Decorative Corners */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-600/50"></div>
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-600/50"></div>
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-600/50"></div>
      <div className="absolute bottom-0 right-0 w-20 h-20 border-b-0 border-r-0 bg-gradient-to-tl from-slate-800/50 to-transparent pointer-events-none" style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)"}}></div>
    </div>
  );
};
