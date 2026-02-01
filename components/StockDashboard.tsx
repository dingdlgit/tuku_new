
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
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
      inputPlaceholder: "STOCK CODE (e.g. 000021, 600519, AAPL)",
      analyze: "INITIATE SCAN",
      analyzing: "SEARCHING REAL-TIME MARKET...",
      metrics: "REAL-TIME METRICS",
      pe: "P/E", pb: "P/B", turnover: "Turnover", amp: "Amplitude",
      strategy: "AI STRATEGY ANALYSIS",
      shortTerm: "Short-term/Scalp",
      longTerm: "Value/Long-term",
      trend: "Trend/MA",
      risk: "RISK PROFILE",
      sentiment: "SENTIMENT",
      chartTitle: "180-DAY K-LINE (GROUNDED SIMULATION)",
      sources: "GROUNDING SOURCES",
      support: "Support", resistance: "Resistance"
    },
    zh: {
      title: "量子金融交易终端",
      inputPlaceholder: "输入股票代码 (如 000021, 600519, NVDA)",
      analyze: "开启扫描",
      analyzing: "正在检索实时联网数据...",
      metrics: "实时行情指标",
      pe: "市盈率", pb: "市净率", turnover: "换手率", amp: "振幅",
      strategy: "AI 投资策略建议",
      shortTerm: "短线 / 打板选手",
      longTerm: "长线 / 价值投资",
      trend: "趋势 / 均线跟踪",
      risk: "风险预警",
      sentiment: "多空情绪",
      chartTitle: "180日 K线走势 (实时锚定模拟)",
      sources: "参考来源",
      support: "支撑位", resistance: "阻力位"
    }
  }[lang];

  const generateAnchoredHistory = (currentPrice: number, changePercent: number) => {
    const history: OHLC[] = [];
    let p = currentPrice / (1 + (changePercent || 0) / 100);
    for (let i = 0; i < 180; i++) {
      const vol = 0.015 + Math.random() * 0.02;
      const change = (Math.random() - 0.51) * 2 * vol;
      const close = p;
      const open = close / (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.01);
      const low = Math.min(open, close) * (1 - Math.random() * 0.01);
      history.unshift({
        date: new Date(Date.now() - i * 86400000).toISOString().split('T')[0],
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: 1000000 + Math.random() * 5000000
      });
      p = open;
    }
    for (let i = 0; i < history.length; i++) {
      const ma = (days: number) => {
        if (i < days - 1) return undefined;
        return parseFloat((history.slice(i - days + 1, i + 1).reduce((a, b) => a + b.close, 0) / days).toFixed(2));
      };
      history[i].ma5 = ma(5);
      history[i].ma10 = ma(10);
      history[i].ma20 = ma(20);
    }
    return history;
  };

  const extractJson = (text: string) => {
    try {
      // First attempt: direct parse
      return JSON.parse(text);
    } catch (e) {
      // Second attempt: find JSON block in markdown
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      throw e;
    }
  };

  const handleAnalyze = async () => {
    if (!code) return;
    setLoading(true);
    setData(null);
    setSources([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Find REAL-TIME stock info for "${code}". 
      000021 is "深科技". 
      Provide: Name, Market, Current Price, Change Amount, Change %, PE, PB, Turnover, Amplitude, Trend, Support, Resistance, Sentiment, Strategy (shortTerm, longTerm, trendFollower), Risks.
      Return JSON ONLY. No markdown formatting if possible, just the string.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const responseText = response.text || "";
      const parsed = extractJson(responseText);
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks) {
        setSources(groundingChunks.filter(c => c.web).map(c => ({ title: c.web!.title, uri: c.web!.uri })));
      }

      const history = generateAnchoredHistory(parsed.currentPrice, parsed.changePercent);
      setData({ ...parsed, code, history });
    } catch (e) {
      console.error("Analysis Error:", e);
      alert("Analysis failed. See console for details.");
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
    const kH = h * 0.7;
    const padding = 40;
    ctx.clearRect(0, 0, w, h);

    const hist = data.history;
    const maxP = Math.max(...hist.map(d => d.high)) * 1.02;
    const minP = Math.min(...hist.map(d => d.low)) * 0.98;
    const range = maxP - minP;
    const stepX = (w - padding * 2) / hist.length;

    const getY = (p: number) => padding + (1 - (p - minP) / range) * (kH - padding * 2);

    hist.forEach((d, i) => {
      const x = padding + i * stepX;
      const isUp = d.close >= d.open;
      const color = isUp ? '#ef4444' : '#22c55e';
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + stepX*0.35, getY(d.high));
      ctx.lineTo(x + stepX*0.35, getY(d.low));
      ctx.stroke();
      
      ctx.fillStyle = color;
      const oY = getY(d.open);
      const cY = getY(d.close);
      ctx.fillRect(x, Math.min(oY, cY), stepX * 0.7, Math.max(1, Math.abs(oY - cY)));
    });

    const drawMA = (key: 'ma5'|'ma10'|'ma20', color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let first = true;
      hist.forEach((d, i) => {
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
    drawMA('ma5', '#fef08a'); drawMA('ma10', '#f472b6'); drawMA('ma20', '#60a5fa');
  }, [data]);

  return (
    <div className="h-full flex flex-col p-6 relative custom-scrollbar overflow-y-auto">
      <div className="max-w-6xl w-full mx-auto space-y-6 pb-12">
        <div className="text-center">
          <h2 className="text-4xl font-tech font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 uppercase tracking-widest">{t.title}</h2>
          <p className="text-[10px] text-slate-500 font-code mt-2">LIVE GROUNDING POWERED BY GOOGLE SEARCH</p>
        </div>

        <div className="flex gap-4 max-w-2xl mx-auto bg-slate-900/80 p-1.5 border border-cyan-500/30 backdrop-blur-xl clip-button">
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.inputPlaceholder} className="flex-1 bg-transparent border-none text-white font-code px-5 focus:outline-none text-lg" onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()} />
          <button onClick={handleAnalyze} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-white font-tech px-10 py-3 disabled:opacity-50 font-bold">{loading ? t.analyzing : t.analyze}</button>
        </div>

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-700">
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-slate-900/60 border border-slate-800 p-8 flex flex-wrap items-center justify-between relative backdrop-blur-sm">
                <div className="absolute top-0 left-0 w-2 h-full bg-cyan-500"></div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-tech text-xl font-bold">{data.name}</span>
                    <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-code border border-cyan-500/30">{data.market}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-code tracking-[0.3em]">{data.code}</div>
                  <div className="flex items-baseline gap-4 mt-4">
                    <span className="text-6xl font-code font-bold text-white tabular-nums">{(data.currentPrice || 0).toFixed(2)}</span>
                    <div className={`font-code font-bold ${(data.changePercent || 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      <span className="text-2xl">{(data.changePercent || 0) >= 0 ? '▲' : '▼'} {Math.abs(data.changeAmount || 0)}</span>
                      <span className="text-lg ml-2">({data.changePercent || 0}%)</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-tech uppercase">{t.sentiment}</div>
                  <div className="text-5xl font-code font-bold text-purple-400">{data.sentiment}%</div>
                </div>
              </div>

              <div className="bg-black/60 border border-slate-800 p-4 shadow-2xl">
                <canvas ref={mainCanvasRef} width={900} height={400} className="w-full h-[350px]" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {[
                   { title: t.shortTerm, color: 'cyan', text: data.strategyAdvice.shortTerm },
                   { title: t.longTerm, color: 'purple', text: data.strategyAdvice.longTerm },
                   { title: t.trend, color: 'blue', text: data.strategyAdvice.trendFollower }
                 ].map(s => (
                   <div key={s.title} className="bg-slate-900/80 p-5 border border-slate-800 clip-button">
                      <h5 className={`text-${s.color}-400 text-xs font-tech mb-3 uppercase`}>{s.title}</h5>
                      <p className="text-[12px] text-slate-300 leading-relaxed font-code">{s.text}</p>
                   </div>
                 ))}
              </div>
            </div>

            <div className="space-y-6">
               <div className="bg-slate-900/80 border border-slate-800 p-6">
                  <h4 className="text-[11px] font-tech font-bold text-slate-500 mb-6 uppercase border-b border-slate-800 pb-2">{t.metrics}</h4>
                  <div className="space-y-5">
                     {[
                       { label: t.pe, val: data.pe }, { label: t.pb, val: data.pb },
                       { label: t.turnover, val: data.turnoverRate + '%' }, { label: t.amp, val: data.amplitude + '%' }
                     ].map(item => (
                       <div key={item.label} className="flex justify-between items-end border-b border-slate-800/50 pb-1">
                          <span className="text-[11px] text-slate-400 font-code">{item.label}</span>
                          <span className="text-lg font-code text-white font-bold">{item.val}</span>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-red-900/10 border border-red-900/30 p-6">
                  <h4 className="text-[11px] font-tech font-bold text-red-500 mb-4 uppercase">{t.risk}</h4>
                  <ul className="space-y-3">
                     {data.risks.map((r, i) => (
                       <li key={i} className="text-[12px] text-red-200/70 font-code flex items-start gap-3">
                          <span className="mt-1.5 w-1.5 h-1.5 bg-red-500 shrink-0"></span>{r}
                       </li>
                     ))}
                  </ul>
               </div>

               {sources.length > 0 && (
                 <div className="bg-cyan-900/10 border border-cyan-900/30 p-6">
                    <h4 className="text-[11px] font-tech font-bold text-cyan-500 mb-4 uppercase">{t.sources}</h4>
                    <ul className="space-y-2">
                       {sources.slice(0, 3).map((s, i) => (
                         <li key={i} className="text-[10px] font-code truncate">
                            <a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300">» {s.title}</a>
                         </li>
                       ))}
                    </ul>
                 </div>
               )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
