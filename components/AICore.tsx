
import React, { useState, useRef, useEffect } from 'react';
import { Language, ChatMessage, AIModelVersion, ChatSession, AIWorkMode, AIAttachment } from '../types';

interface AICoreProps {
  lang: Language;
}

export const AICore: React.FC<AICoreProps> = ({ lang }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<AIModelVersion>('gemini-3-flash-preview');
  
  // Attachments & Audio
  const [attachments, setAttachments] = useState<AIAttachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = {
    en: {
      newChat: "NEW SESSION",
      placeholder: "Broadcast message to core...",
      modelFlash: "GEMINI 3 FLASH",
      modelPro: "GEMINI 3 PRO",
      history: "SESSIONS",
      modes: "WORK MODE",
      modeGen: "GENERAL",
      modeCode: "ENGINEER",
      modeData: "ANALYST",
      modeCreate: "CREATIVE",
      upload: "UPLOAD FILE",
      voice: "VOICE",
      listening: "LISTENING...",
      attach: "ATTACHED RES:",
      play: "PLAY",
      tts: "READ ALOUD",
      emptyState: "AWAITING INPUT STREAM...",
      processing: "PROCESSING...",
      error: "Error: Neural Link Failed.",
      user: "U",
      ai: "AI"
    },
    zh: {
      newChat: "新建会话",
      placeholder: "输入指令或提问...",
      modelFlash: "GEMINI 3 FLASH",
      modelPro: "GEMINI 3 PRO",
      history: "历史会话",
      modes: "工作模式",
      modeGen: "通用助手",
      modeCode: "赛博工程师",
      modeData: "数据分析师",
      modeCreate: "创意总监",
      upload: "上传文件",
      voice: "语音输入",
      listening: "正在聆听...",
      attach: "已挂载资源:",
      play: "播放",
      tts: "朗读",
      emptyState: "等待输入信号...",
      processing: "计算中...",
      error: "错误：神经连接中断。",
      user: "我",
      ai: "AI"
    }
  }[lang];

  // --- Session Management ---
  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/ai/sessions');
      const data = await res.json();
      setSessions(data);
      if (data.length > 0 && !currentSessionId) {
          // Don't auto-select to allow "Fresh Start", or select first
          // setCurrentSessionId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const createSession = async (mode: AIWorkMode = 'general') => {
    const res = await fetch('/api/ai/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
    });
    const newSession = await res.json();
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
    setAttachments([]);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await fetch(`/api/ai/sessions/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSessionId === id) {
          setCurrentSessionId(null);
          setMessages([]);
      }
  };

  // --- Messaging ---
  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return;
    
    // Auto-create session if none
    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
        // Quick session creation
        const res = await fetch('/api/ai/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'general' }) });
        const newS = await res.json();
        setSessions(prev => [newS, ...prev]);
        activeSessionId = newS.id;
        setCurrentSessionId(newS.id);
    }

    const tempAttachments = [...attachments];
    
    // User Message
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: Date.now(),
      attachments: tempAttachments
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    // AI Placeholder
    const aiMsgId = (Date.now() + 1).toString();
    const aiMsgPlaceholder: ChatMessage = {
      id: aiMsgId,
      role: 'model',
      text: '',
      timestamp: Date.now() + 1,
      isThinking: true
    };
    setMessages(prev => [...prev, aiMsgPlaceholder]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: textToSend,
          attachments: tempAttachments, // Send metadata + base64 if small
          model: model,
          lang: lang // Pass language setting
        })
      });

      if (!response.body) throw new Error("No response");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedText = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: !done });
        accumulatedText += chunkValue;

        setMessages(prev => prev.map(msg => 
          msg.id === aiMsgId 
            ? { ...msg, text: accumulatedText, isThinking: false } 
            : msg
        ));
      }
      
      // Update Session Preview in list locally
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, lastMessageAt: Date.now(), preview: accumulatedText.substring(0, 50) } : s));

    } catch (error) {
      console.error(error);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId ? { ...msg, text: t.error, isThinking: false } : msg
      ));
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // --- Attachments ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          const formData = new FormData();
          formData.append('image', file);
          
          try {
              const res = await fetch('/api/upload', { method: 'POST', body: formData });
              const data = await res.json();
              
              // For small text files/images, we can also read client side for preview
              // For now, we trust server response
              const newAtt: AIAttachment = {
                  id: data.id,
                  type: file.type.startsWith('image/') ? 'image' : 'file',
                  url: data.url,
                  filename: data.filename,
                  mimeType: data.mimeType || file.type
              };
              setAttachments(prev => [...prev, newAtt]);
          } catch (e) { console.error(e); alert("Upload Failed"); }
      }
  };

  // --- Voice Input (STT) ---
  const startRecording = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          const chunks: Blob[] = [];

          mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
          mediaRecorder.onstop = async () => {
              const blob = new Blob(chunks, { type: 'audio/webm' }); // Chrome uses webm
              const formData = new FormData();
              formData.append('audio', blob, 'voice_input.webm');
              
              setIsLoading(true); // Temp loading while transcribing
              try {
                  const res = await fetch('/api/ai/transcribe', { method: 'POST', headers: { 'api-key': 'internal' }, body: formData });
                  const data = await res.json();
                  if (data.text) {
                      handleSend(data.text); // Auto send transcript
                  }
              } catch (e) { console.error(e); } finally { setIsLoading(false); }
          };

          mediaRecorder.start();
          setIsRecording(true);
      } catch (e) { alert("Mic Access Denied"); }
  };

  const stopRecording = () => {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
  };

  // --- TTS ---
  const playTTS = async (text: string) => {
      try {
          // Strip Markdown images from TTS
          const cleanText = text.replace(/!\[.*?\]\(.*?\)/g, '');
          
          const res = await fetch('/api/ai/tts', { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' }, 
              body: JSON.stringify({ text: cleanText }) 
          });
          const data = await res.json();
          if (data.audio) {
              const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
              audio.play();
          }
      } catch (e) { console.error(e); }
  };

  // --- Message Renderer with Markdown Image Support ---
  const renderMessageContent = (text: string) => {
      // Regex to find ![alt](url)
      const parts = text.split(/(!\[.*?\]\(.*?\))/g);
      return parts.map((part, index) => {
          const imgMatch = part.match(/!\[(.*?)\]\((.*?)\)/);
          if (imgMatch) {
              return (
                  <div key={index} className="my-2 rounded-lg overflow-hidden border border-slate-600 shadow-lg">
                      <img src={imgMatch[2]} alt={imgMatch[1]} className="w-full max-h-64 object-contain bg-black/20" />
                      <div className="bg-slate-900/50 p-1 text-[10px] text-slate-500 font-code text-center">GENERATED_ASSET</div>
                  </div>
              );
          }
          return <span key={index}>{part}</span>;
      });
  };

  // --- Render Helpers ---
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
      
      {/* --- SIDEBAR --- */}
      <div className="w-16 md:w-64 flex flex-col bg-slate-900/50 border-r border-cyan-900/30 backdrop-blur-md z-20 transition-all">
        <div className="p-4 flex flex-col gap-2">
          <button onClick={() => createSession('general')} className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-tech text-xs tracking-widest uppercase shadow-lg transition-all clip-button">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            <span className="hidden md:inline">{t.newChat}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
           <div className="hidden md:block text-[10px] text-slate-500 font-code uppercase tracking-widest mb-2 px-2">{t.history}</div>
           <div className="space-y-1">
             {sessions.map(s => (
               <div key={s.id} onClick={() => { setCurrentSessionId(s.id); setMessages([]); }} className={`group relative p-2 md:p-3 cursor-pointer border-l-2 transition-all ${currentSessionId === s.id ? 'bg-slate-800 border-cyan-500 text-cyan-100' : 'border-transparent text-slate-500 hover:bg-slate-800/50'}`}>
                  <div className="flex justify-between items-center">
                      <div className="font-bold text-xs truncate w-full pr-6">{s.title || "Untitled Link"}</div>
                      <button onClick={(e) => deleteSession(s.id, e)} className="absolute right-2 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-500">×</button>
                  </div>
                  <div className="hidden md:block text-[10px] font-code truncate opacity-70 mt-1">{s.preview}</div>
                  <div className="hidden md:flex gap-2 mt-1">
                      <span className={`text-[8px] px-1 rounded border ${s.mode==='coder'?'border-purple-500 text-purple-400':s.mode==='analyst'?'border-emerald-500 text-emerald-400':'border-slate-600'}`}>{s.mode.toUpperCase()}</span>
                  </div>
               </div>
             ))}
           </div>
        </div>

        {/* Mode Selector (Quick Switch) */}
        <div className="p-2 border-t border-slate-800 hidden md:block">
            <div className="text-[10px] text-slate-500 font-code mb-2">{t.modes}</div>
            <div className="grid grid-cols-2 gap-1">
                {(['general', 'coder', 'analyst', 'creative'] as AIWorkMode[]).map(m => (
                    <button key={m} onClick={() => createSession(m)} className="text-[9px] border border-slate-700 p-1 hover:border-cyan-500 hover:text-cyan-400 uppercase transition-colors">{m}</button>
                ))}
            </div>
        </div>
      </div>

      {/* --- MAIN CHAT AREA --- */}
      <div className="flex-1 flex flex-col relative bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        
        {/* Header */}
        <div className="h-14 border-b border-cyan-900/30 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-30">
           <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-tech text-lg">AI_CORE</span>
              <span className="text-slate-600 font-thin">/</span>
              <select value={model} onChange={(e) => setModel(e.target.value as AIModelVersion)} className="bg-transparent text-xs font-code text-slate-300 focus:outline-none uppercase cursor-pointer hover:text-cyan-400">
                 <option value="gemini-3-flash-preview">{t.modelFlash}</option>
                 <option value="gemini-3-pro-preview">{t.modelPro}</option>
              </select>
           </div>
           <div className="flex gap-4">
              {currentSessionId && <span className="text-xs font-code text-slate-500 uppercase border px-2 py-0.5 border-slate-700 rounded-full">{sessions.find(s=>s.id===currentSessionId)?.mode} MODE</span>}
           </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]">
               <div className="w-20 h-20 mb-6 relative">
                  <div className="absolute inset-0 border-t-2 border-cyan-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-2 border-b-2 border-purple-500 rounded-full animate-[spin_3s_linear_infinite]"></div>
                  <div className="absolute inset-0 flex items-center justify-center font-tech text-2xl text-white">AI</div>
               </div>
               <div className="text-slate-500 font-code text-sm uppercase">{t.emptyState}</div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
               {messages.map((msg) => (
                 <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm border ${msg.role === 'user' ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-400' : 'bg-purple-900/20 border-purple-500/50 text-purple-400'}`}>
                       {msg.role === 'user' ? t.user : t.ai}
                    </div>
                    
                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                       
                       {/* Attachments Display */}
                       {msg.attachments && msg.attachments.length > 0 && (
                           <div className="flex flex-wrap gap-2 mb-2 justify-end">
                               {msg.attachments.map(att => (
                                   <div key={att.id} className="relative group border border-slate-700 bg-slate-900 rounded overflow-hidden w-24 h-24 flex items-center justify-center">
                                       {att.type === 'image' ? (
                                           <img src={att.url} className="w-full h-full object-cover" />
                                       ) : (
                                           <div className="text-[9px] text-center p-1 text-slate-400 break-all">{att.filename}</div>
                                       )}
                                   </div>
                               ))}
                           </div>
                       )}

                       <div className={`p-4 text-sm font-sans leading-relaxed shadow-lg whitespace-pre-wrap ${msg.role === 'user' ? 'bg-cyan-950/30 border border-cyan-500/20 text-cyan-100 rounded-bl-xl' : 'bg-slate-900/80 border border-slate-700 text-slate-300 rounded-br-xl'}`}>
                          {msg.isThinking ? <span className="animate-pulse text-purple-400">{t.processing}</span> : renderMessageContent(msg.text)}
                       </div>
                       
                       {msg.role === 'model' && !msg.isThinking && (
                           <button onClick={() => playTTS(msg.text)} className="mt-1 text-[10px] text-slate-600 hover:text-cyan-400 flex items-center gap-1 cursor-pointer transition-colors">
                               <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                               {t.tts}
                           </button>
                       )}
                    </div>
                 </div>
               ))}
               <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-slate-900/90 backdrop-blur-xl border-t border-cyan-900/30 relative z-30">
           {/* Attachment Preview Bar */}
           {attachments.length > 0 && (
               <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
                   <span className="text-xs text-cyan-500 font-code self-center mr-2">{t.attach}</span>
                   {attachments.map((att, i) => (
                       <div key={i} className="relative bg-slate-800 border border-slate-600 rounded p-1 w-12 h-12 flex items-center justify-center shrink-0">
                           {att.type==='image' ? <img src={att.url} className="w-full h-full object-cover opacity-70" /> : <span className="text-[8px] text-slate-400">FILE</span>}
                           <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">×</button>
                       </div>
                   ))}
               </div>
           )}

           <div className="max-w-4xl mx-auto flex gap-3 items-end">
              {/* Tools: Upload & Voice */}
              <div className="flex gap-2 pb-2">
                  <button onClick={() => fileInputRef.current?.click()} className="text-slate-500 hover:text-cyan-400 p-2 border border-transparent hover:border-slate-700 rounded transition-all">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                  
                  <button 
                    onMouseDown={startRecording} 
                    onMouseUp={stopRecording} 
                    className={`p-2 rounded border transition-all ${isRecording ? 'bg-red-900/50 text-red-500 border-red-500 animate-pulse' : 'text-slate-500 hover:text-cyan-400 border-transparent hover:border-slate-700'}`}
                  >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>
              </div>

              <div className="relative flex-1 group">
                 <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-cyan-500/50"></div>
                 <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-cyan-500/50"></div>
                 
                 <textarea
                   ref={inputRef}
                   value={input}
                   onChange={(e) => setInput(e.target.value)}
                   onKeyDown={(e) => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                   placeholder={isRecording ? t.listening : t.placeholder}
                   className="w-full bg-black/60 border border-slate-700 text-white p-3 pr-10 focus:outline-none focus:border-cyan-500/50 transition-all font-sans resize-none custom-scrollbar max-h-32 min-h-[48px] rounded-none"
                   rows={1}
                 />
              </div>

              <button 
                onClick={() => handleSend()}
                disabled={isLoading || (!input.trim() && attachments.length===0)}
                className={`p-3 mb-1 bg-cyan-900/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600 hover:text-white transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};
