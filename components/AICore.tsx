
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
  const [attachments, setAttachments] = useState<AIAttachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guard to prevent history loading from interrupting a fresh chat
  const isSendingRef = useRef(false);

  const t = {
    en: { 
      aiCoreTitle: "AI_CORE", 
      newChat: "NEW SESSION", 
      placeholder: "Broadcast message to core...", 
      modelFlash: "GEMINI 3 FLASH", 
      modelPro: "GEMINI 3 PRO", 
      history: "SESSIONS", 
      emptyState: "AWAITING INPUT STREAM...", 
      noSessions: "NO ACTIVE NEURAL LINKS",
      startFirst: "INITIATE FIRST LINK",
      processing: "PROCESSING...", 
      error: "Error: Neural Link Failed.", 
      user: "U", 
      ai: "AI", 
      cost: "COST", 
      iq: "IQ"
    },
    zh: { 
      aiCoreTitle: "AI 核心", 
      newChat: "新建会话", 
      placeholder: "输入指令或提问...", 
      modelFlash: "GEMINI 3 FLASH", 
      modelPro: "GEMINI 3 PRO", 
      history: "历史会话", 
      emptyState: "等待输入信号...", 
      noSessions: "当前无活跃神经连接",
      startFirst: "开启首个会话",
      processing: "计算中...", 
      error: "错误：神经连接中断。", 
      user: "我", 
      ai: "AI", 
      cost: "成本", 
      iq: "智商"
    }
  }[lang];

  useEffect(() => { 
    fetch('/api/ai/sessions')
      .then(r => r.json())
      .then(data => {
        setSessions(data);
        if (data.length > 0 && !currentSessionId) {
          setCurrentSessionId(data[0].id);
        }
      });
  }, []);

  useEffect(() => { 
    // Only load history if we aren't currently sending a message (which manually manages state)
    if (currentSessionId && !isSendingRef.current) {
      loadSessionHistory(currentSessionId); 
    }
  }, [currentSessionId]);

  const loadSessionHistory = async (id: string) => {
    setMessages([]); 
    try {
        const res = await fetch(`/api/ai/sessions/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.history) {
            setMessages(data.history.map((h: any, i: number) => ({
                id: `msg-${i}-${Date.now()}`, 
                role: h.role === 'model' ? 'model' : 'user', 
                text: (h.parts || []).map((p:any) => p.text || "").join(""),
                attachments: (h.parts || []).filter((p:any) => p.inlineData).map((p:any) => ({ 
                  id: `att-${i}-${Math.random()}`, 
                  type: 'image', 
                  url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` 
                }))
            })));
        }
    } catch (e) {}
  };

  const createSession = async (mode: AIWorkMode = 'general') => {
    try {
      const res = await fetch('/api/ai/sessions', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ mode }) 
      });
      const s = await res.json(); 
      setSessions(p => [s, ...p]); 
      setCurrentSessionId(s.id);
      setMessages([]);
    } catch (e) { console.error(e); }
  };

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if ((!text.trim() && attachments.length === 0) || isLoading) return;
    
    isSendingRef.current = true;
    setIsLoading(true);

    let sid = currentSessionId;
    if (!sid) {
        try {
          const res = await fetch('/api/ai/sessions', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ mode: 'general' }) 
          });
          const s = await res.json(); 
          setSessions(p => [s, ...p]); 
          sid = s.id; 
          setCurrentSessionId(s.id);
        } catch (e) {
          setIsLoading(false);
          isSendingRef.current = false;
          alert("Failed to initialize link");
          return;
        }
    }

    const atts = [...attachments];
    setMessages(p => [...p, { id: Date.now().toString(), role: 'user', text, timestamp: Date.now(), attachments: atts }]);
    setInput(''); setAttachments([]);

    const aiMsgId = (Date.now() + 1).toString();
    setMessages(p => [...p, { id: aiMsgId, role: 'model', text: '', isThinking: true, timestamp: Date.now() + 1 }]);

    try {
      const response = await fetch('/api/ai/chat', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ sessionId: sid, message: text, attachments: atts, model, lang }) 
      });
      
      if (!response.body) throw new Error("No body");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        acc += chunk;

        let displayAcc = acc;
        if (acc.includes('{"error"')) {
           try {
               const parsed = JSON.parse(acc.substring(acc.indexOf('{"error"')));
               displayAcc = parsed.error?.message || t.error;
           } catch(e) {}
        }

        setMessages(p => p.map(m => m.id === aiMsgId ? { ...m, text: displayAcc, isThinking: false } : m));
      }
      setSessions(p => p.map(s => s.id === sid ? { ...s, lastMessageAt: Date.now(), preview: acc.substring(0, 50) } : s));
    } catch (e: any) {
      setMessages(p => p.map(m => m.id === aiMsgId ? { ...m, text: t.error, isThinking: false } : m));
    } finally { 
      setIsLoading(false); 
      isSendingRef.current = false;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) {
          const file = e.target.files[0];
          const formData = new FormData(); formData.append('image', file);
          const res = await fetch('/api/upload', { method: 'POST', body: formData });
          const data = await res.json();
          setAttachments(p => [...p, { id: data.id, type: file.type.startsWith('image/') ? 'image' : 'file', url: data.url, filename: data.filename, mimeType: data.mimeType }]);
      }
  };

  const renderContent = (text: string) => {
      if (text.startsWith('[') && text.endsWith(']')) return <span className="text-amber-500 font-code italic bg-amber-500/10 px-2 py-1 border border-amber-500/20 block rounded">{text}</span>;
      return text.split(/(!\[.*?\]\(.*?\))/g).map((part, i) => {
          const match = part.match(/!\[(.*?)\]\((.*?)\)/);
          if (match) {
              const [_, alt, url] = match;
              return url.endsWith('.mp4') || alt.toLowerCase().includes('video') 
                ? <video key={i} src={url} controls className="my-2 w-full max-h-64 bg-black/50 rounded-lg border border-purple-600 shadow-lg" />
                : <img key={i} src={url} alt={alt} className="my-2 w-full max-h-64 object-contain bg-black/20 rounded-lg border border-slate-600 shadow-lg" />;
          }
          return <span key={i}>{part}</span>;
      });
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  return (
    <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden font-sans relative">
      <div className="w-16 md:w-64 flex flex-col bg-slate-900/50 border-r border-cyan-900/30 backdrop-blur-md z-20">
        <div className="p-4">
          <button onClick={() => createSession()} className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-tech text-xs tracking-widest uppercase shadow-lg transition-all clip-button">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            <span className="hidden md:inline">{t.newChat}</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
           <div className="hidden md:block text-[10px] text-slate-500 font-code px-2 mb-2 uppercase tracking-widest">{t.history}</div>
           {sessions.map(s => (
             <div key={s.id} onClick={() => setCurrentSessionId(s.id)} className={`group relative p-2 md:p-3 cursor-pointer border-l-2 transition-all ${currentSessionId === s.id ? 'bg-slate-800 border-cyan-500 text-cyan-100' : 'border-transparent text-slate-500 hover:bg-slate-800/50'}`}>
                <div className="font-bold text-xs truncate w-full pr-6">{s.title || "Untitled Link"}</div>
                <div className="hidden md:block text-[10px] truncate opacity-50 mt-1">{s.preview || "No content"}</div>
             </div>
           ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        <div className="h-14 border-b border-cyan-900/30 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-30">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-tech text-lg">{t.aiCoreTitle}</span>
            <span className="text-slate-600 font-thin mx-1">/</span>
            <select value={model} onChange={(e) => setModel(e.target.value as AIModelVersion)} className="bg-transparent text-xs font-code text-slate-300 focus:outline-none uppercase cursor-pointer hover:text-cyan-400">
               <optgroup label="GOOGLE CLOUD" className="bg-slate-900 text-cyan-400">
                  <option value="gemini-3-flash-preview">FLASH 3</option>
                  <option value="gemini-3-pro-preview">PRO 3</option>
               </optgroup>
               <optgroup label="OPENAI" className="bg-slate-900 text-green-400">
                  <option value="gpt-4o">GPT-4o</option>
               </optgroup>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-80">
               {sessions.length === 0 ? (
                 <>
                   <div className="w-16 h-16 mb-4 border-2 border-dashed border-slate-700 flex items-center justify-center rounded-full text-slate-700">?</div>
                   <div className="text-slate-500 font-code text-xs uppercase mb-6 tracking-widest">{t.noSessions}</div>
                   <button onClick={() => createSession()} className="px-6 py-2 border border-cyan-500 text-cyan-400 font-tech text-[10px] tracking-[0.2em] hover:bg-cyan-500/10 transition-all uppercase">{t.startFirst}</button>
                 </>
               ) : (
                 <>
                   <div className="w-20 h-20 mb-6 border-t-2 border-cyan-500 rounded-full animate-spin"></div>
                   <div className="text-slate-500 font-code text-sm uppercase tracking-widest">{t.emptyState}</div>
                 </>
               )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8">
               {messages.map((m) => (
                 <div key={m.id} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm border ${m.role === 'user' ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-400' : 'bg-purple-900/20 border-purple-500/50 text-purple-400'}`}>{m.role === 'user' ? t.user : t.ai}</div>
                    <div className={`flex flex-col max-w-[85%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                       {m.attachments?.map((a, i) => (
                         <div key={i} className="mb-2 w-24 h-24 border border-slate-700 rounded overflow-hidden">
                           {a.type==='image'?<img src={a.url} className="w-full h-full object-cover"/>:<div className="flex flex-col items-center justify-center h-full text-[8px] text-slate-500 uppercase">FILE</div>}
                         </div>
                       ))}
                       <div className={`p-4 text-sm leading-relaxed shadow-lg whitespace-pre-wrap ${m.role === 'user' ? 'bg-cyan-950/30 border border-cyan-500/20 text-cyan-100 rounded-bl-xl' : 'bg-slate-900/80 border border-slate-700 text-slate-300 rounded-br-xl'}`}>
                         {m.isThinking ? <span className="animate-pulse text-purple-400">{t.processing}</span> : renderContent(m.text)}
                       </div>
                    </div>
                 </div>
               ))}
               <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-900/90 backdrop-blur-xl border-t border-cyan-900/30">
           {attachments.length > 0 && (
             <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
               {attachments.map((a, i) => (
                 <div key={i} className="relative bg-slate-800 border border-slate-600 rounded p-1 w-12 h-12 flex items-center justify-center shrink-0">
                    {a.type==='image' ? <img src={a.url} className="w-full h-full object-cover opacity-70" /> : <div className="text-[8px] text-slate-400 uppercase">FILE</div>}
                    <button onClick={() => setAttachments(p => p.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center">×</button>
                 </div>
               ))}
             </div>
           )}
           <div className="max-w-4xl mx-auto flex gap-3 items-end">
              <div className="flex gap-2 pb-2">
                <button onClick={() => fileInputRef.current?.click()} className="text-slate-500 hover:text-cyan-400 p-2 border border-transparent hover:border-slate-700 rounded transition-all">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              </div>
              <div className="flex-1 relative">
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={t.placeholder} className="w-full bg-black/60 border border-slate-700 text-white p-3 pr-10 focus:outline-none focus:border-cyan-500/50 font-sans resize-none custom-scrollbar max-h-32 min-h-[48px] rounded-none" rows={1} />
              </div>
              <button onClick={() => handleSend()} disabled={isLoading || (!input.trim() && attachments.length===0)} className={`p-3 mb-1 bg-cyan-900/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-600 hover:text-white transition-all ${isLoading ? 'opacity-50' : ''}`}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
           </div>
        </div>
      </div>
    </div>
  );
};
