import React, { useState } from 'react';
import { Dropzone } from './components/Dropzone';
import { Controls } from './components/Controls';
import { ImageFormat, ProcessOptions, UploadResponse, ProcessResponse } from './types';

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
  watermarkText: ''
};

function App() {
  const [currentFile, setCurrentFile] = useState<UploadResponse | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [options, setOptions] = useState<ProcessOptions>(defaultOptions);
  const [result, setResult] = useState<ProcessResponse | null>(null);

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
        let errorMessage = `Upload failed (${response.status})`;
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch (e) {
          // If response isn't JSON (e.g. Nginx 504 HTML), use status text
          errorMessage = `Upload failed: ${response.statusText || response.status}`;
        }
        throw new Error(errorMessage);
      }

      const data: UploadResponse = await response.json();
      setCurrentFile(data);
      // Reset sensitive options but keep generic ones if desired
      setOptions({
        ...defaultOptions,
        width: data.width || null,
        height: data.height || null
      });
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to upload image');
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
        let errorMessage = 'Processing failed';
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch (e) {
           errorMessage = `Processing failed: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data: ProcessResponse = await response.json();
      setResult(data);
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Failed to process image');
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-3 px-6 shadow-sm z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2" onClick={handleReset} role="button">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
               </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">TuKu <span className="font-normal text-slate-400">| 图酷</span></h1>
          </div>
          <div className="text-sm text-slate-500">
             Fast, secure image processing on your server
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden bg-slate-50 relative">
        <div className="absolute inset-0 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6 h-full min-h-[calc(100vh-64px)]">
            
            {!currentFile ? (
              <div className="h-full flex flex-col justify-center items-center max-w-2xl mx-auto">
                <div className="w-full text-center mb-10">
                   <h2 className="text-4xl font-extrabold text-slate-800 mb-4">Edit & Convert Images Instantly</h2>
                   <p className="text-lg text-slate-600">Drag and drop your images to start converting, resizing, and optimizing.</p>
                </div>
                <Dropzone onFileSelect={handleFileUpload} isUploading={isUploading} />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full pb-10">
                {/* Left: Controls */}
                <div className="lg:col-span-1 h-full max-h-[800px]">
                  <Controls 
                    options={options} 
                    setOptions={setOptions} 
                    onProcess={handleProcess}
                    isProcessing={isProcessing}
                    originalDimensions={{ width: currentFile.width || 0, height: currentFile.height || 0 }}
                  />
                </div>

                {/* Right: Preview & Result */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                  {/* Preview Area */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1 flex flex-col items-center justify-center relative overflow-hidden min-h-[400px]">
                    <div className="absolute inset-0" style={{
                      backgroundImage: 'linear-gradient(45deg, #f1f5f9 25%, transparent 25%), linear-gradient(-45deg, #f1f5f9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f1f5f9 75%), linear-gradient(-45deg, transparent 75%, #f1f5f9 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                    }}></div>
                    
                    <div className="relative z-10 max-w-full max-h-full p-4">
                      {result ? (
                         <div className="flex flex-col items-center">
                            <img src={result.url} alt="Processed" className="max-h-[500px] object-contain shadow-xl rounded-lg border border-slate-300" />
                            <div className="mt-4 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium border border-green-200 flex items-center">
                               <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                               Processed Successfully
                            </div>
                         </div>
                      ) : (
                        <div className="relative group">
                           <img src={currentFile.url} alt="Original" className="max-h-[500px] object-contain shadow-xl rounded-lg border border-slate-300 transition-transform duration-300" style={{
                             transform: `rotate(${options.rotate}deg) scaleX(${options.flipX ? -1 : 1}) scaleY(${options.flipY ? -1 : 1})`,
                             filter: `
                               grayscale(${options.grayscale ? 1 : 0}) 
                               blur(${options.blur}px)
                               ${options.sharpen ? 'contrast(1.2)' : ''}
                             `
                           }} />
                           {!result && <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">Preview</div>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  {result && (
                    <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex items-center justify-between animate-fade-in-up">
                       <div className="flex items-center gap-4">
                          <div className="text-sm">
                             <p className="text-slate-500">Original Size</p>
                             <p className="font-semibold text-slate-800">{formatSize(currentFile.size)}</p>
                          </div>
                          <div className="w-px h-8 bg-slate-200"></div>
                          <div className="text-sm">
                             <p className="text-slate-500">New Size</p>
                             <p className="font-semibold text-indigo-600">{formatSize(result.size)}</p>
                          </div>
                          <div className="w-px h-8 bg-slate-200"></div>
                          <div className="text-sm">
                             <p className="text-slate-500">Savings</p>
                             <p className="font-semibold text-green-600">
                               {currentFile.size > result.size 
                                 ? Math.round(((currentFile.size - result.size) / currentFile.size) * 100) + '%'
                                 : '-'}
                             </p>
                          </div>
                       </div>
                       
                       <div className="flex gap-3">
                         <button 
                           onClick={handleReset}
                           className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                         >
                           Start Over
                         </button>
                         <a 
                           href={result.url} 
                           download={result.filename}
                           className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95"
                         >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            Download
                         </a>
                       </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;