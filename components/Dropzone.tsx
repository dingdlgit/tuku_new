
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
      mainText: "UPLOAD",
      formats: "JPG, PNG, WEBP, BMP, RAW (UYVY, NV21, RGBA...)",
      limit: "MAX 20MB",
      formatError: "ERROR: INVALID FILE FORMAT",
      sizeError: "ERROR: FILE SIZE EXCEEDS 20MB LIMIT"
    },
    zh: {
      uploading: "数据流上传中...",
      mainText: "上传",
      formats: "支持 JPG, PNG, BMP, RAW (UYVY, NV21, RGBA...)",
      limit: "最大 20MB",
      formatError: "错误：不支持的文件格式",
      sizeError: "错误：文件大小超过 20MB 限制"
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
        relative w-full h-80 border border-dashed rounded-none flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group overflow-hidden
        ${isDragOver 
          ? 'border-cyan-400 bg-cyan-900/20' 
          : 'border-slate-600 bg-slate-900/40 hover:border-cyan-500 hover:bg-slate-800/60'}
        ${isUploading ? 'pointer-events-none' : ''}
        backdrop-blur-sm
      `}
    >
      {/* Decorative Corners */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-500"></div>
      <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-500"></div>
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-500"></div>
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-500"></div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleChange} 
        className="hidden" 
        accept="image/*,.uyvy,.yuv,.raw,.rgb,.bgr,.bin,.nv21,.rgba,.bgra"
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center z-10">
           <div className="relative w-16 h-16 mb-6">
              <div className="absolute inset-0 border-4 border-slate-700 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
           </div>
           <p className="text-lg font-tech tracking-widest text-cyan-400 animate-pulse">{t.uploading}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center z-10 group-hover:scale-105 transition-transform duration-300">
          <div className="bg-slate-800/50 p-6 rounded-full mb-6 border border-cyan-500/30 group-hover:border-cyan-400/80 group-hover:shadow-[0_0_25px_rgba(6,182,212,0.3)] transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 text-cyan-400">
              <path strokeLinecap="square" strokeLinejoin="miter" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="text-3xl font-bold text-white mb-3 font-tech tracking-[0.2em]">{t.mainText}</p>
          
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs text-slate-400 max-w-sm text-center font-code uppercase tracking-wider">
              {t.formats}
            </p>
            <p className="text-[10px] text-cyan-600 font-code font-bold border border-cyan-900/50 px-2 py-0.5 rounded bg-cyan-900/10">
              {t.limit}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
