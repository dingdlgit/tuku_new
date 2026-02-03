
import React, { useState, useRef, useEffect } from 'react';
import { Language, ChatMessage, AIModelVersion } from '../types';

interface AICoreProps {
  lang: Language;
}

export const AICore: React.FC<AICoreProps> = ({ lang }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState<AIModelVersion>('gemini-3-flash-preview');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const t = {
    en: {
      newChat: "NEW NEURAL LINK",
      placeholder: "Broadcast message to core...",
      modelFlash: "GEMINI 3 FLASH (SPEED)",
      modelPro: "GEMINI 3 PRO (REASONING)",
      history: "MEMORY LOGS",
      clear: "WIPE MEMORY",
      welcome: "NEURAL INTERFACE ONLINE",
      welcomeSub: "Select a protocol to begin interaction.",
      suggestion1: "Analyze System Architecture",
      suggestion2: "Write Quantum Algorithm",
      suggestion3: "Debug React Components",
      suggestion4: "Generate Cyberpunk Lore",
      thinking: "NEURAL PROCESSING..."
    },
    zh: {
      newChat: "新建神经连接",
      placeholder: "向核心广播消息...",
      modelFlash: "GEMINI 3 FLASH (极速)",
      modelPro: "GEMINI 3 PRO (推理)",
      history: "记忆日志",
      clear: "清除记忆",
      welcome: "神经接口已上线",
      welcomeSub: "请选择协议以开始交互。",
      suggestion1: "分析系统架构",
      suggestion2: "编写量子算法",
      suggestion3: "调试 React 组件",
      suggestion4: "生成赛博朋克设定",
      thinking: "神经网络计算中..."
    }
  }[lang];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input on load
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    // 1. Add User Message
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // 2. Create Placeholder for AI Response
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
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: messages.map(m => ({ role: m.role, parts: [{ text: m.text }] })), // Send context
          model: model
        })
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulatedText = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: !done });
        
        // The server sends chunks of text directly
        accumulatedText += chunkValue;

        setMessages(prev => prev.map(msg => 
          msg.id === aiMsgId 
            ? { ...msg, text: accumulatedText, isThinking: false } 
            : msg
        ));
      }

    } catch (error) {
      console.error("Chat Error", error);
      setMessages(prev => prev.map(msg => 
        msg.id === aiMsgId 
          ? { ...msg, text: "Error: Neural Link Severed (Connection Failed).", isThinking: false } 
          : msg
      ));
    } finally {
      setIsLoading(false);
      // Re-focus input after sending
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([]);
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full bg-[#020617] text-slate-200 overflow-hidden font-sans">
      
      {/* --- SIDEBAR --- */}
      <div className="w-64 hidden md:flex flex-col bg-slate-900/50 border-r border-cyan-900/30 backdrop-blur-md relative z-20">
        <div className="p-4">
          <button 
            onClick={clearChat}
            className="w-full flex items-center gap-3 px-4 py-3 bg-cyan-900/20 hover:bg-cyan-800/40 border border-cyan-500/30 text-cyan-400 font-tech text-xs tracking-widest uppercase transition-all shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t.newChat}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
           <div className="text-[10px] text-slate-500 font-code uppercase tracking-widest mb-4">{t.history}</div>
           {/* Mock History Items */}
           <div className="space-y-2 opacity-50 pointer-events-none grayscale">
              <div className="p-3 bg-slate-800/50 border border-slate-700 text-xs font-code truncate">System Optimization...</div>
              <div className="p-3 bg-slate-800/50 border border-slate-700 text-xs font-code truncate">Quantum Physics...</div>
              <div className="p-3 bg-slate-800/50 border border-slate-700 text-xs font-code truncate">Image Generation...</div>
           </div>
        </div>

        <div className="p-4 border-t border-cyan-900/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-purple-500 animate-pulse"></div>
            <div className="flex flex-col">
               <span className="text-xs font-bold font-tech text-white">USER_ADMIN</span>
               <span className="text-[9px] text-cyan-500 font-code">Lv.99 NETRUNNER</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- MAIN CHAT AREA --- */}
      <div className="flex-1 flex flex-col relative bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        
        {/* Header / Model Selector */}
        <div className="h-14 border-b border-cyan-900/30 bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-6 z-30">
           <div className="flex items-center gap-2">
              <span className="text-cyan-400 font-tech text-lg">AI_CORE</span>
              <span className="text-slate-600 font-thin">/</span>
              <select 
                value={model} 
                onChange={(e) => setModel(e.target.value as AIModelVersion)}
                className="bg-transparent text-xs font-code text-slate-300 focus:outline-none uppercase cursor-pointer hover:text-cyan-400"
              >
                 <option value="gemini-3-flash-preview">{t.modelFlash}</option>
                 <option value="gemini-3-pro-preview">{t.modelPro}</option>
              </select>
           </div>
           <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_5px_#22c55e]"></div>
              <span className="text-[10px] text-green-500 font-code tracking-wider">ONLINE</span>
           </div>
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-0 animate-[fadeIn_0.5s_ease-out_forwards]">
               <div className="w-24 h-24 mb-8 relative">
                  <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-[spin_10s_linear_infinite]"></div>
                  <div className="absolute inset-2 border-4 border-purple-500/30 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>
                  <svg className="absolute inset-0 m-auto w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
               </div>
               <h2 className="text-3xl md:text-4xl font-tech font-bold text-white mb-2">{t.welcome}</h2>
               <p className="text-slate-500 font-code text-sm mb-12">{t.welcomeSub}</p>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl w-full">
                  {[t.suggestion1, t.suggestion2, t.suggestion3, t.suggestion4].map((sug, i) => (
                    <button 
                      key={i}
                      onClick={() => handleSend(sug)}
                      className="text-left p-4 border border-slate-700 bg-slate-900/40 hover:bg-slate-800 hover:border-cyan-500/50 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-cyan-400/5 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300"></div>
                      <span className="text-xs text-slate-300 font-code group-hover:text-cyan-300 relative z-10">"{sug}"</span>
                    </button>
                  ))}
               </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
               {messages.map((msg) => (
                 <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm border ${msg.role === 'user' ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-400' : 'bg-purple-900/20 border-purple-500/50 text-purple-400'}`}>
                       {msg.role === 'user' ? (
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                       ) : (
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                       )}
                    </div>
                    
                    {/* Content */}
                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                       <div className={`text-[10px] font-code mb-1 uppercase tracking-wider ${msg.role === 'user' ? 'text-cyan-600' : 'text-purple-600'}`}>
                         {msg.role === 'user' ? 'OPERATOR' : 'TUKU_AI_CORE'} <span className="text-slate-700 mx-1">::</span> {new Date(msg.timestamp).toLocaleTimeString()}
                       </div>
                       <div className={`p-4 text-sm font-sans leading-relaxed shadow-lg whitespace-pre-wrap ${
                         msg.role === 'user' 
                           ? 'bg-cyan-950/30 border border-cyan-500/20 text-cyan-100 rounded-bl-xl' 
                           : 'bg-slate-900/80 border border-slate-700 text-slate-300 rounded-br-xl'
                       }`}>
                          {msg.isThinking ? (
                            <span className="flex items-center gap-2 text-purple-400 animate-pulse font-code text-xs">
                               <span className="w-1.5 h-1.5 bg-purple-500 rounded-full"></span>
                               {t.thinking}
                            </span>
                          ) : msg.text}
                       </div>
                    </div>
                 </div>
               ))}
               <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-slate-900/90 backdrop-blur-xl border-t border-cyan-900/30 relative z-30">
           <div className="max-w-3xl mx-auto relative group">
              {/* Decorative Corners */}
              <div className="absolute -top-1 -left-1 w-2 h-2 border-t border-l border-cyan-500/50"></div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b border-r border-cyan-500/50"></div>
              
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.placeholder}
                rows={1}
                className="w-full bg-black/60 border border-slate-700 text-white p-4 pr-12 focus:outline-none focus:border-cyan-500/50 focus:shadow-[0_0_20px_rgba(6,182,212,0.1)] transition-all font-sans resize-none custom-scrollbar max-h-40 overflow-y-auto rounded-none"
                style={{ minHeight: '56px' }}
              />
              
              <button 
                onClick={() => handleSend()}
                disabled={isLoading || !input.trim()}
                className={`absolute right-2 bottom-2 p-2 transition-all ${
                  input.trim() && !isLoading 
                    ? 'text-cyan-400 hover:text-white hover:bg-cyan-600' 
                    : 'text-slate-600 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                   <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : (
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                )}
              </button>
           </div>
           <div className="text-center mt-2">
             <span className="text-[9px] text-slate-600 font-code uppercase">TuKu Neural Network v2.5 // Secure Connection</span>
           </div>
        </div>
      </div>
    </div>
  );
};
