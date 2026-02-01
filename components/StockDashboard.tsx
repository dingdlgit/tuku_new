
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { StockAnalysisResult, Language, OHLC } from '../types';

interface StockDashboardProps {
  lang: Language;
}

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StockAnalysisResult | null>(null);
  const [sources, setSources] = useState<{title: string, uri: string}[]>([]);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "QUANTUM TRADING TERMINAL",
      inputPlaceholder: "STOCK CODE (e.g. 000021, 600519, AAPL, 00700)",
      analyze: "INITIATE SCAN",
      analyzing: "GROUNDING REAL-TIME DATA...",
      metrics: "FUNDAMENTALS & REAL-TIME DATA",
      pe: "P/E Ratio", pb: "P/B Ratio", turnover: "Turnover", amp: "Amplitude",
      strategy: "MULTI-ROLE STRATEGY ANALYSIS",
      shortTerm: "Scalper / Limit-up",
      longTerm: "Value / Long-term",
      trend: "Trend / Momentum",
      risk: "RISK PROFILE",
      sentiment: "MARKET SENTIMENT",
      chartTitle: "180-DAY K-LINE SIMULATION (ANCHORED)",
      sources: "GROUNDING SOURCES",
      up: "UP", down: "DOWN",
      support: "Support", resistance: "Resistance"
    },
    zh: {
      title: "量子金融交易终端",
      inputPlaceholder: "股票代码 (如 000021, 600519, 港股00700, 美股NVDA)",
      analyze: "开启扫描",
      analyzing: "正在检索实时市场数据...",
      metrics: "基本面与实时行情",
      pe: "市盈率", pb: "市净率", turnover: "换手率", amp: "振幅",
      strategy: "多角色投资决策建议",
      shortTerm: "打板选手 / 短线投机",
      longTerm: "价值投资 / 长期持股",
      trend: "趋势跟踪 / 均线策略",
      risk: "风险预警",
      sentiment: "多空情绪指数",
      chartTitle: "180日 K线走势模拟 (实时锚定)",
      sources: "数据来源",
      up: "涨", down: "跌",
      support: "支撑位", resistance: "阻力位"
    }
  }[lang];

  // Helper to generate anchored history
  const generateAnchoredHistory = (currentPrice: number, changePercent: number) => {
    const history: OHLC[] = [];
    let p = currentPrice / (1 + changePercent / 100); // Yesterday's close
    const volBase = 1.0;
    
    // Generate backwards
    for (let i = 0; i < 180; i++) {
      const dayVol = 0.015 + Math.random() * 0.02;
      const change = (Math.random() - 0.51) * 2 * dayVol; // Slight bias
      const close = p;
      const open = close / (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      const volume = 1000000 + Math.random() * 5000000;
      
      history.unshift({
        date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(volume)
      });
      p = open;
    }

    // Calc MAs
    for (let i = 0; i < history.length; i++) {
      const ma = (days: number) => {
        if (i < days - 1) return undefined;
        const slice = history.slice(i - days + 1, i + 1);
        return parseFloat((slice.reduce((a, b) => a + b.close, 0) / days).toFixed(2));
      };
      history[i].ma5 = ma(5);
      history[i].ma10 = ma(10);
      history[i].ma20 = ma(20);
    }
    return history;
  };

  const handleAnalyze = async () => {
    if (!code) return;
    setLoading(true);
    setData(null);
    setSources([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Analyze stock code "${code}". 
      1. Find its current real price, name, and market (A-Share Main/ChiNext/STAR/HKEX/US).
      2. Analyze its trend (STRONG/VOLATILE/WEAK), support/resistance levels.
      3. Provide PE, PB, turnover rate, and amplitude.
      4. Give 3-role strategy advice: Short-term (Limit-up/打板), Value investment, and Trend following.
      5. List key risks.
      Return the data strictly in JSON format matching this schema:
      {
        "name": string,
        "market": string,
        "currentPrice": number,
        "changeAmount": number,
        "changePercent": number,
        "pe": number,
        "pb": number,
        "turnoverRate": number,
        "amplitude": number,
        "trend": "STRONG" | "VOLATILE" | "WEAK",
        "support": number,
        "resistance": number,
        "sentiment": number (0-100),
        "techAnalysis": string,
        "strategyAdvice": { "shortTerm": string, "longTerm": string, "trendFollower": string },
        "risks": string[]
      }`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const text = response.text || "{}";
      const cleanJson = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleanJson);

      // Extract sources
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
        const foundSources = groundingChunks
          .filter(chunk => chunk.web)
          .map(chunk => ({ title: chunk.web!.title, uri: chunk.web!.uri }));
        setSources(foundSources);
      }

      // Generate history anchored to real price
      const history = generateAnchoredHistory(parsed.currentPrice, parsed.changePercent);
      
      setData({ ...parsed, code, history });
    } catch (e) {
      console.error("Analysis Error:", e);
      alert("Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const kLineHeight = h * 0.7;
    const volHeight = h * 0.2;
    const padding = 40;
    
    ctx.clearRect(0, 0, w, h);

    const history = data.history;
    const prices = history.map(d => [d.high, d.low, d.open, d.close]).flat();
    const maxP = Math.max(...prices) * 1.02;
    const minP = Math.min(...prices) * 0.98;
    const rangeP = maxP - minP;
    
    const maxV = Math.max(...history.map(d => d.volume));
    const stepX = (w - padding * 2) / history.length;

    const getY = (price: number) => padding + (1 - (price - minP) / rangeP) * (kLineHeight - padding * 2);
    const getVolY = (vol: number) => h - padding - (vol / maxV) * (volHeight);

    // 1. Grid
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.lineWidth = 0.5;
    for(let i=0; i<5; i++) {
       const y = padding + (i * (kLineHeight - padding*2)) / 4;
       ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke();
    }

    // 2. K-Lines
    history.forEach((d, i) => {
      const x = padding + i * stepX;
      const isUp = d.close >= d.open;
      const color = isUp ? '#ef4444' : '#22c55e'; // RED UP, GREEN DOWN
      
      ctx.fillStyle = color + '44';
      const vY = getVolY(d.volume);
      ctx.fillRect(x, vY, stepX * 0.7, h - padding - vY);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + stepX*0.35, getY(d.high));
      ctx.lineTo(x + stepX*0.35, getY(d.low));
      ctx.stroke();
      
      ctx.fillStyle = color;
      const openY = getY(d.open);
      const closeY = getY(d.close);
      ctx.fillRect(x, Math.min(openY, closeY), stepX * 0.7, Math.max(1, Math.abs(openY - closeY)));
    });

    // 3. MAs
    const drawMA = (key: 'ma5'|'ma10'|'ma20', color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let first = true;
      history.forEach((d, i) => {
        const val = d[key];
        if (val) {
          const x = padding + i * stepX + stepX * 0.35;
          const y = getY(val);
          if (first) { ctx.moveTo(x, y); first = false; }
          else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };
    drawMA('ma5', '#fef08a');   // Yellow
    drawMA('ma10', '#f472b6');  // Pink
    drawMA('ma20', '#60a5fa');  // Blue

  }, [data]);

  return (
    <div className="h-full flex flex-col p-6 bg-transparent relative custom-scrollbar overflow-y-auto">
      <div className="max-w-6xl w-full mx-auto space-y-6 pb-12">
        
        {/* Header Section */}
        <div className="text-center">
          <h2 className="text-4xl font-tech font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-cyan-400 to-blue-400 tracking-widest uppercase">
            {t.title}
          </h2>
          <p className="text-[10px] text-slate-500 font-code mt-2 tracking-[0.4em]">GROUNDED BY GOOGLE SEARCH & QUANTUM SIMULATION</p>
        </div>

        {/* Search Bar */}
        <div className="flex gap-4 max-w-2xl mx-auto bg-slate-900/80 p-1.5 border border-cyan-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(6,182,212,0.1)] clip-button">
          <input 
            type="text" value={code} onChange={(e) => setCode(e.target.value)}
            placeholder={t.inputPlaceholder}
            className="flex-1 bg-transparent border-none text-white font-code px-5 focus:outline-none placeholder-slate-600 text-lg"
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button 
            onClick={handleAnalyze} 
            disabled={loading} 
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-tech px-10 py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold"
          >
            {loading ? t.analyzing : t.analyze}
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            
            {/* Top Row: Real-time Stats */}
            <div className="lg:col-span-3 space-y-6">
              
              <div className="bg-slate-900/60 border border-slate-800 p-8 flex flex-wrap items-center justify-between relative group overflow-hidden backdrop-blur-sm">
                <div className="absolute top-0 left-0 w-2 h-full bg-cyan-500"></div>
                
                <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-3">
                      <span className="text-white font-tech text-xl font-bold">{data.name}</span>
                      <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-code border border-cyan-500/30 uppercase tracking-tighter">{data.market}</span>
                   </div>
                   <div className="text-[10px] text-slate-500 font-code tracking-[0.3em]">{data.code}</div>
                   
                   <div className="flex items-baseline gap-4 mt-4">
                      <span className="text-6xl font-code font-bold text-white tracking-tighter tabular-nums">{data.currentPrice.toFixed(2)}</span>
                      <div className={`flex flex-col font-code font-bold ${data.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                         <span className="text-2xl">{data.changePercent >= 0 ? '▲' : '▼'} {Math.abs(data.changeAmount)}</span>
                         <span className="text-lg">({data.changePercent}%)</span>
                      </div>
                   </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                   <div className="text-xs text-slate-500 font-tech uppercase tracking-widest">{t.sentiment}</div>
                   <div className="text-5xl font-code font-bold text-transparent bg-clip-text bg-gradient-to-t from-purple-600 to-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.3)]">{data.sentiment}%</div>
                   <div className="w-32 h-1.5 bg-slate-800 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-purple-500 animate-pulse" style={{width: `${data.sentiment}%`}}></div>
                   </div>
                </div>
              </div>

              {/* Chart Panel */}
              <div className="bg-black/60 border border-slate-800 p-4 relative group shadow-2xl">
                <div className="flex flex-wrap gap-4 text-[10px] font-code mb-4 border-b border-slate-800 pb-2">
                   <span className="text-yellow-400">MA5: {data.history[data.history.length-1].ma5}</span>
                   <span className="text-pink-400">MA10: {data.history[data.history.length-1].ma10}</span>
                   <span className="text-blue-400">MA20: {data.history[data.history.length-1].ma20}</span>
                   <span className="text-slate-500 ml-auto">{t.chartTitle}</span>
                </div>
                <canvas ref={mainCanvasRef} width={900} height={400} className="w-full h-[350px]" />
                
                {/* Support/Resistance Indicators */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                   <div className="bg-green-500/10 border-l-4 border-green-500 p-3">
                      <div className="text-[10px] font-tech text-green-500 uppercase">{t.support}</div>
                      <div className="text-xl font-code text-white">{data.support}</div>
                   </div>
                   <div className="bg-red-500/10 border-l-4 border-red-500 p-3">
                      <div className="text-[10px] font-tech text-red-500 uppercase">{t.resistance}</div>
                      <div className="text-xl font-code text-white">{data.resistance}</div>
                   </div>
                </div>
              </div>

              {/* Strategy Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="bg-slate-900/80 p-5 border border-slate-800 hover:border-cyan-500/50 transition-all group clip-button">
                    <h5 className="text-cyan-400 text-xs font-tech mb-3 tracking-tighter uppercase flex items-center gap-2">
                       <span className="w-1.5 h-1.5 bg-cyan-500 animate-ping"></span>
                       {t.shortTerm}
                    </h5>
                    <p className="text-[12px] text-slate-300 leading-relaxed font-code">{data.strategyAdvice.shortTerm}</p>
                 </div>
                 <div className="bg-slate-900/80 p-5 border border-slate-800 hover:border-purple-500/50 transition-all group clip-button">
                    <h5 className="text-purple-400 text-xs font-tech mb-3 tracking-tighter uppercase flex items-center gap-2">
                       <span className="w-1.5 h-1.5 bg-purple-500"></span>
                       {t.longTerm}
                    </h5>
                    <p className="text-[12px] text-slate-300 leading-relaxed font-code">{data.strategyAdvice.longTerm}</p>
                 </div>
                 <div className="bg-slate-900/80 p-5 border border-slate-800 hover:border-blue-500/50 transition-all group clip-button">
                    <h5 className="text-blue-400 text-xs font-tech mb-3 tracking-tighter uppercase flex items-center gap-2">
                       <span className="w-1.5 h-1.5 bg-blue-500"></span>
                       {t.trend}
                    </h5>
                    <p className="text-[12px] text-slate-300 leading-relaxed font-code">{data.strategyAdvice.trendFollower}</p>
                 </div>
              </div>
            </div>

            {/* Side Panel: Metrics, Risks & Sources */}
            <div className="space-y-6">
               
               <div className="bg-slate-900/80 border border-slate-800 p-6 backdrop-blur-sm">
                  <h4 className="text-[11px] font-tech font-bold text-slate-500 mb-6 tracking-widest uppercase border-b border-slate-800 pb-2">{t.metrics}</h4>
                  <div className="space-y-5">
                     {[
                       { label: t.pe, val: data.pe },
                       { label: t.pb, val: data.pb },
                       { label: t.turnover, val: data.turnoverRate + '%' },
                       { label: t.amp, val: data.amplitude + '%' }
                     ].map(item => (
                       <div key={item.label} className="flex justify-between items-end border-b border-slate-800/50 pb-1 hover:border-cyan-500/50 transition-colors">
                          <span className="text-[11px] text-slate-400 font-code uppercase tracking-tighter">{item.label}</span>
                          <span className="text-lg font-code text-white font-bold">{item.val}</span>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-red-900/10 border border-red-900/30 p-6">
                  <h4 className="text-[11px] font-tech font-bold text-red-500 mb-4 tracking-widest uppercase border-b border-red-900/20 pb-2">{t.risk}</h4>
                  <ul className="space-y-3">
                     {data.risks.map((r, i) => (
                       <li key={i} className="text-[12px] text-red-200/70 font-code flex items-start gap-3">
                          <span className="mt-1.5 w-1.5 h-1.5 bg-red-500 shrink-0 shadow-[0_0_5px_rgba(239,68,68,0.5)]"></span>
                          {r}
                       </li>
                     ))}
                  </ul>
               </div>

               {/* Grounding Sources */}
               {sources.length > 0 && (
                 <div className="bg-cyan-900/10 border border-cyan-900/30 p-6">
                    <h4 className="text-[11px] font-tech font-bold text-cyan-500 mb-4 tracking-widest uppercase border-b border-cyan-900/20 pb-2">{t.sources}</h4>
                    <ul className="space-y-2 overflow-hidden">
                       {sources.slice(0, 4).map((s, i) => (
                         <li key={i} className="text-[10px] font-code truncate">
                            <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-cyan-400/80 hover:text-cyan-300 transition-colors">
                               » {s.title}
                            </a>
                         </li>
                       ))}
                    </ul>
                 </div>
               )}

               <div className="p-4 bg-slate-900/40 border border-slate-800 text-center">
                  <p className="text-[9px] text-slate-500 font-tech uppercase italic leading-tight">
                    Quantum Node Operational :: <br/> Simulation Data Synced to Real-time Grounding
                  </p>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
