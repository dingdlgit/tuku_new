import React, { useRef, useState } from 'react';

interface DropzoneProps {
  onFileSelect: (file: File) => void;
  isUploading: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileSelect, isUploading }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/heic', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      alert('Format not supported. Please upload JPG, PNG, WEBP, BMP, or GIF.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('File too large. Max size is 20MB.');
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
        w-full h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300
        ${isDragOver 
          ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' 
          : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50'}
        ${isUploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleChange} 
        className="hidden" 
        accept="image/jpeg,image/png,image/webp,image/bmp,image/gif"
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center animate-pulse">
           <svg className="animate-spin h-10 w-10 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
           <p className="text-lg font-medium text-slate-600">Uploading...</p>
        </div>
      ) : (
        <>
          <div className="bg-indigo-100 p-4 rounded-full mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-indigo-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="text-xl font-semibold text-slate-700 mb-2">Click to Upload or Drag & Drop</p>
          <p className="text-sm text-slate-500">JPG, PNG, WEBP, BMP up to 20MB</p>
        </>
      )}
    </div>
  );
};