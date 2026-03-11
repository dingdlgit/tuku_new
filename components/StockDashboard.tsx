
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StockAnalysisResult, Language, OHLC, BacktestResult, Trade } from '../types';

interface ExtendedStockResult extends StockAnalysisResult {
  isCached?: boolean;
  dataSource?: string;
}

interface StockDashboardProps {
  lang: Language;
}

type IndicatorType = 'VOL' | 'MACD' | 'AMT';

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExtendedStockResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [indicator, setIndicator] = useState<IndicatorType>('VOL');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  
  // Backtest State with new custom params
  const [btConfig, setBtConfig] = useState({ 
    capital: 100000, 
    commission: 0.0003, 
    strategy: 'smaCross',
    startDate: '', 
    endDate: '',
    frequency: 'daily',
    targetProfit: 0.5,
    custom2: {
      trackingDays: 3,
      conditions: [
        { day: 1, field: 'close', operator: '>', compareDay: 3, compareField: 'close', logical: 'AND' }
      ],
      buyDay: 3,
      buyField: 'close',
      sellRules: [
        { conditionDay: 4, conditionField: 'open', conditionType: 'higher', action: 'immediate', actionDayOffset: 0 },
        { conditionDay: 4, conditionField: 'open', conditionType: 'lower', action: 'close', actionDayOffset: 0 }
      ]
    }
  });

  const [displayHistory, setDisplayHistory] = useState<OHLC[]>([]);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "QUANT_DATA_CORE",
      placeholder: "SYMBOL (e.g. 513090, 000021)",
      search: "SEARCH",
      marketData: "MARKET OVERVIEW",
      aiAnalyze: "AI NEURAL ANALYSIS",
      backtest: "STRATEGY LAB / BACKTEST",
      runBt: "EXECUTE BACKTEST",
      btParams: "PARAMETERS",
      capital: "Initial Capital",
      commission: "Commission Rate",
      strategy: "Selection",
      frequency: "Frequency",
      targetProfit: "Target Profit (%)",
      startDate: "Start Date",
      endDate: "End Date",
      finalValue: "FINAL VALUE",
      totalReturn: "TOTAL RETURN",
      maxDD: "MAX DRAWDOWN",
      sharpe: "SHARPE RATIO",
      trades: "TRADE LOG",
      loading: "SYNCING...",
      aiHint: "Click to generate deep intelligence diagnostic.",
      noData: "AWAITING TICKER INPUT",
      indicator: "SUB_INDICATOR",
      vol: "VOL",
      macd: "MACD",
      strategyDesc: "STRATEGY INTEL",
      freqOptions: {
          daily: "Every Day",
          mon: "Every Monday",
          tue: "Every Tuesday",
          wed: "Every Wednesday",
          thu: "Every Thursday",
          fri: "Every Friday",
          day1: "1st of Month",
          day15: "15th of Month"
      },
      strategies: {
          smaCross: {
              name: "SMA Crossover (5/20)",
              desc: "A trend-following strategy that generates a BUY signal when the 5-day SMA crosses above the 20-day SMA and a SELL signal when it crosses below."
          },
          custom1: {
              name: "Custom Strategy 1 (Intraday Take-Profit)",
              desc: "Buys at Open price on scheduled days. If price rises by X% during the day (High >= Open * 1.X%), it sells immediately. Otherwise, sells at Close price."
          },
          ma5Hold: {
              name: "Buy & Hold Benchmark",
              desc: "Enters a full position at the start and holds until the end."
          },
          custom2: {
              name: "Custom Strategy 2 (Multi-Day Logic)",
              desc: "A complex strategy allowing multi-day tracking, custom screening conditions, and conditional buy/sell rules based on price action."
          }
      }
    },
    zh: {
      title: "量化数据核心",
      placeholder: "输入代码 (如 513090, 000021)",
      search: "查询",
      marketData: "市场实时概览",
      aiAnalyze: "AI 神经诊断",
      backtest: "策略实验室 / 回测",
      runBt: "执行回测",
      btParams: "回测参数配置",
      capital: "初始资金",
      commission: "手续费率",
      strategy: "策略选择",
      frequency: "执行频率",
      targetProfit: "止盈目标 (%)",
      startDate: "开始日期",
      endDate: "结束日期",
      finalValue: "最终资金",
      totalReturn: "累计收益",
      maxDD: "最大回撤",
      sharpe: "夏普比率",
      trades: "交易明细",
      loading: "同步中...",
      aiHint: "点击发起深度 AI 智能诊断与形态预测",
      noData: "等待输入代码信号",
      indicator: "副图指标",
      vol: "成交量",
      macd: "MACD",
      strategyDesc: "策略逻辑说明",
      freqOptions: {
          daily: "每一天",
          mon: "每周一",
          tue: "每周二",
          wed: "每周三",
          thu: "每周四",
          fri: "每周五",
          day1: "每月1号",
          day15: "每月15号"
      },
      strategies: {
          smaCross: {
              name: "双均线交叉策略 (5/20)",
              desc: "趋势跟随。当5日均线向上穿越20日线时买入；反之卖出。"
          },
          custom1: {
              name: "自定义策略1 (开盘买+日内止盈)",
              desc: "在选定日期开盘买入。盘中若最高价涨幅达到设定值则按止盈价卖出；若未达到，则在收盘前按收盘价卖出。属于高频日内交易策略。"
          },
          ma5Hold: {
              name: "买入持有 (基准测试)",
              desc: "回测首日全仓买入并一直持有到期末。"
          },
          custom2: {
              name: "自定义策略2 (多日逻辑)",
              desc: "支持多日跟踪、自定义筛选条件（如第一天收盘>第三天收盘）、自定义买入点及复杂的条件卖出逻辑。"
          }
      }
    }
  }[lang];

  const handleSearch = async () => {
    if (!code) return;
    setError(null); setLoading(true); setAiResult(null); setBtResult(null);
    try {
      const response = await fetch('/api/analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), lang })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connection Failed');
      setData(result);
      setDisplayHistory(result.history);
      if (result.history?.length > 0) {
        setBtConfig(prev => ({ ...prev, startDate: result.history[0].date, endDate: result.history[result.history.length - 1].date }));
      }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const handleBacktest = async () => {
    if (!data) return;
    setBtLoading(true);
    const filtered = data.history.filter(d => (!btConfig.startDate || d.date >= btConfig.startDate) && (!btConfig.endDate || d.date <= btConfig.endDate));
    if (filtered.length === 0) { setError("No data in range."); setBtLoading(false); return; }

    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: filtered,
          initial_capital: btConfig.capital,
          commission_rate: btConfig.commission,
          strategy: btConfig.strategy,
          options: {
              frequency: btConfig.frequency,
              targetProfit: btConfig.targetProfit / 100, // Convert to decimal
              custom2: btConfig.strategy === 'custom2' ? btConfig.custom2 : undefined
          }
        })
      });
      const result = await response.json();
      setBtResult(result);
      setDisplayHistory(filtered);
    } catch (e: any) { setError("Backtest Failed"); } finally { setBtLoading(false); }
  };

  // Add missing AI analysis handler
  const handleAiAnalysis = async () => {
    if (!data) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch('/api/ai-analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: data.code,
          history: data.history,
          lang
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'AI Analysis Failed');
      setAiResult(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const triggerDatePicker = (e: React.MouseEvent<HTMLInputElement>) => {
    try { (e.currentTarget as any).showPicker(); } catch (err) {}
  };

  const calculateMA = (hist: OHLC[], period: number) => {
    return hist.map((_, i, arr) => {
      if (i < period - 1) return null;
      const slice = arr.slice(i - period + 1, i + 1);
      return slice.reduce((sum, item) => sum + item.close, 0) / period;
    });
  };

  const calculateMACD = (hist: OHLC[]) => {
      const ema = (arr: number[], period: number) => {
          const k = 2 / (period + 1);
          let emaArr = [arr[0] || 0];
          for (let i = 1; i < arr.length; i++) emaArr.push(arr[i] * k + emaArr[i-1] * (1 - k));
          return emaArr;
      };
      const closes = hist.map(d => d.close);
      const ema12 = ema(closes, 12);
      const ema26 = ema(closes, 26);
      const diff = ema12.map((val, i) => val - ema26[i]);
      const dea = ema(diff, 9);
      const histMacd = diff.map((val, i) => (val - dea[i]) * 2);
      return { diff, dea, hist: histMacd };
  };

  useEffect(() => {
    if (displayHistory.length === 0 || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const logicalW = canvas.clientWidth;
    const logicalH = canvas.clientHeight;
    canvas.width = logicalW * dpr; canvas.height = logicalH * dpr;
    ctx.scale(dpr, dpr);
    const w = logicalW; const h = logicalH;
    const padding = { left: 60, right: 60, top: 40, bottom: 40, subTop: 0.75 * h };
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
    const hist = displayHistory;
    const ma5 = calculateMA(hist, 5); const ma10 = calculateMA(hist, 10);
    const ma20 = calculateMA(hist, 20); const ma30 = calculateMA(hist, 30);
    const macd = calculateMACD(hist);
    const maxPrice = Math.max(...hist.map(d => d.high)) * 1.01;
    const minPrice = Math.min(...hist.map(d => d.low)) * 0.99;
    const priceRange = maxPrice - minPrice;
    const stepX = (w - padding.left - padding.right) / hist.length;
    const getPriceY = (p: number) => padding.top + (1 - (p - minPrice) / priceRange) * (padding.subTop - 20 - padding.top);
    const getSubY = (val: number, max: number, min: number = 0) => {
        const range = Math.max(0.0001, max - min);
        return padding.subTop + 10 + (1 - (val - min) / range) * (h - padding.bottom - (padding.subTop + 10));
    };
    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (i/4) * (padding.subTop - 20 - padding.top);
        ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
        ctx.fillStyle = '#64748b'; ctx.font = '10px "JetBrains Mono"'; ctx.textAlign = 'right';
        ctx.fillText((maxPrice - (i/4) * priceRange).toFixed(2), padding.left - 5, y + 4);
    }
    const candleW = Math.max(1, stepX * 0.7);
    hist.forEach((d, i) => {
        const x = padding.left + i * stepX;
        const color = d.close >= d.open ? '#eb4432' : '#009b72'; 
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(x + candleW / 2, getPriceY(d.high)); ctx.lineTo(x + candleW / 2, getPriceY(d.low)); ctx.stroke();
        ctx.fillStyle = color;
        const bodyY = getPriceY(Math.max(d.open, d.close));
        const bodyH = Math.max(1, Math.abs(getPriceY(d.open) - getPriceY(d.close)));
        ctx.fillRect(x, bodyY, candleW, bodyH);
        if (i % Math.floor(hist.length / 6) === 0) {
            ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center'; ctx.fillText(d.date.substring(2), x + candleW/2, h - 15);
        }
    });
    const drawMA = (ma: (number | null)[], color: string) => {
        ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.beginPath();
        let first = true;
        ma.forEach((val, i) => {
            if (val === null) return;
            const x = padding.left + i * stepX + candleW / 2;
            const y = getPriceY(val);
            if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            first = false;
        }); ctx.stroke();
    };
    drawMA(ma5, '#000000'); drawMA(ma10, '#eab308'); drawMA(ma20, '#ec4899'); drawMA(ma30, '#22c55e');
    if (indicator === 'VOL') {
        const maxV = Math.max(...hist.map(d => d.volume));
        hist.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const vH = (d.volume / maxV) * (h - padding.bottom - padding.subTop - 10);
            ctx.fillStyle = d.close >= d.open ? '#eb4432' : '#009b72';
            ctx.fillRect(x, h - padding.bottom - vH, candleW, vH);
        });
    } else if (indicator === 'MACD') {
        const maxM = Math.max(...macd.diff, ...macd.dea, ...macd.hist.map(Math.abs));
        const minM = Math.min(...macd.diff, ...macd.dea, ...macd.hist.map(v => -Math.abs(v)));
        const zeroY = getSubY(0, maxM, minM);
        hist.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const val = macd.hist[i];
            const y = getSubY(val, maxM, minM);
            ctx.fillStyle = val >= 0 ? '#eb4432' : '#009b72';
            ctx.fillRect(x, Math.min(y, zeroY), candleW, Math.abs(y - zeroY));
        });
        const drawLine = (arr: number[], color: string) => {
            ctx.strokeStyle = color; ctx.beginPath();
            arr.forEach((v, i) => {
                const x = padding.left + i * stepX + candleW/2;
                const y = getSubY(v, maxM, minM);
                if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            }); ctx.stroke();
        };
        drawLine(macd.diff, '#000000'); drawLine(macd.dea, '#eab308');
    }
    if (btResult?.trades) {
        btResult.trades.forEach(trade => {
            const index = hist.findIndex(d => d.date === trade.date);
            if (index !== -1) {
                const x = padding.left + index * stepX + candleW / 2;
                const y = getPriceY(trade.price);
                ctx.font = 'bold 12px Rajdhani'; ctx.textAlign = 'center'; ctx.lineWidth = 2.5;
                if (trade.type === 'BUY') {
                    ctx.fillStyle = '#eb4432'; ctx.beginPath(); ctx.arc(x, y + 25, 12, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle = '#FFFFFF'; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fillText('B', x, y + 29);
                    ctx.strokeStyle = '#eb4432'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 13); ctx.stroke();
                } else {
                    ctx.fillStyle = '#009b72'; ctx.beginPath(); ctx.arc(x, y - 25, 12, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle = '#FFFFFF'; ctx.stroke(); ctx.fillStyle = '#FFFFFF'; ctx.fillText('S', x, y - 21);
                    ctx.strokeStyle = '#009b72'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 13); ctx.stroke();
                }
            }
        });
    }
  }, [displayHistory, btResult, indicator, lang]);

  return (
    <div className="h-full flex flex-col bg-[#020617] custom-scrollbar p-6">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-cyan-900/30 pb-6">
            <h2 className="text-3xl font-tech font-bold text-white tracking-widest uppercase">{t.title}</h2>
            <div className="flex bg-slate-900 border border-cyan-900/50 p-1 group">
                <input value={code} onChange={e => setCode(e.target.value)} placeholder={t.placeholder} className="bg-transparent text-white px-4 py-2 font-code focus:outline-none uppercase w-64" onKeyDown={e=>e.key==='Enter' && handleSearch()} />
                <button onClick={handleSearch} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-white font-tech px-8 py-2 font-bold tracking-widest clip-button transition-all">
                    {loading ? t.loading : t.search}
                </button>
            </div>
        </div>

        {error && <div className="p-3 bg-rose-950/20 border border-rose-500 text-rose-500 text-xs font-code uppercase animate-pulse">! SYSTEM ERROR: {error}</div>}

        {!data ? (
            <div className="h-96 flex flex-col items-center justify-center opacity-40">
                <div className="w-16 h-16 border-2 border-slate-800 rounded-full animate-spin mb-4 border-t-cyan-500"></div>
                <div className="font-code text-sm tracking-widest">{t.noData}</div>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-slate-900/60 border border-slate-800 p-6 relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-2xl font-tech font-bold text-white">{data.name} <span className="text-sm font-code text-cyan-500 ml-2">{data.code}</span></h3>
                                <div className="flex items-center gap-4 mt-1">
                                    <span className={`text-2xl font-code font-black ${data.changePercent >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{data.currentPrice.toFixed(2)}</span>
                                    <span className={`text-sm font-bold ${data.changePercent >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%</span>
                                    <div className="flex gap-2 text-[10px] font-bold font-code ml-4">
                                        <span className="text-white border-b border-white">MA5</span>
                                        <span className="text-yellow-400 border-b border-yellow-400">MA10</span>
                                        <span className="text-pink-400 border-b border-pink-400">MA20</span>
                                        <span className="text-emerald-400 border-b border-emerald-400">MA30</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                {(['VOL', 'MACD'] as IndicatorType[]).map(type => (
                                    <button key={type} onClick={() => setIndicator(type)} className={`px-4 py-1 text-[10px] font-tech border transition-all ${indicator === type ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'text-slate-500 border-slate-700 hover:border-cyan-500'}`}>
                                        {t[type.toLowerCase() as keyof typeof t] as string}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="relative h-[550px] w-full bg-white border border-slate-800 rounded-sm">
                            <canvas ref={mainCanvasRef} className="w-full h-full cursor-crosshair" />
                        </div>
                    </div>

                    <div className="bg-slate-900/60 border border-slate-800 p-6">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
                            <h4 className="font-tech text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 bg-cyan-500 animate-pulse"></span> {t.backtest}
                            </h4>
                            <button onClick={handleBacktest} disabled={btLoading} className="bg-cyan-600 text-white px-8 py-2 text-xs font-tech font-bold hover:bg-cyan-500 transition-all clip-button shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                {btLoading ? 'PROCESSING...' : t.runBt}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label htmlFor="bt-start-date" className="text-[10px] text-slate-500 font-code uppercase cursor-pointer hover:text-cyan-400 transition-colors">{t.startDate}</label>
                                        <input id="bt-start-date" type="date" value={btConfig.startDate} onChange={e=>setBtConfig({...btConfig, startDate: e.target.value})} onClick={triggerDatePicker} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500 cursor-pointer [color-scheme:dark]" />
                                    </div>
                                    <div className="space-y-1">
                                        <label htmlFor="bt-end-date" className="text-[10px] text-slate-500 font-code uppercase cursor-pointer hover:text-cyan-400 transition-colors">{t.endDate}</label>
                                        <input id="bt-end-date" type="date" value={btConfig.endDate} onChange={e=>setBtConfig({...btConfig, endDate: e.target.value})} onClick={triggerDatePicker} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500 cursor-pointer [color-scheme:dark]" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-code uppercase">{t.capital}</label>
                                        <input type="number" value={btConfig.capital} onChange={e=>setBtConfig({...btConfig, capital: Number(e.target.value)})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-code uppercase">{t.strategy}</label>
                                        <select value={btConfig.strategy} onChange={e=>setBtConfig({...btConfig, strategy: e.target.value})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500">
                                            <option value="smaCross">{t.strategies.smaCross.name}</option>
                                            <option value="custom1">{t.strategies.custom1.name}</option>
                                            <option value="custom2">{t.strategies.custom2.name}</option>
                                            <option value="ma5Hold">{t.strategies.ma5Hold.name}</option>
                                        </select>
                                    </div>
                                </div>
                                
                                {btConfig.strategy === 'custom1' && (
                                    <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-slate-500 font-code uppercase">{t.frequency}</label>
                                            <select value={btConfig.frequency} onChange={e=>setBtConfig({...btConfig, frequency: e.target.value})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500">
                                                <option value="daily">{t.freqOptions.daily}</option>
                                                <option value="mon">{t.freqOptions.mon}</option>
                                                <option value="tue">{t.freqOptions.tue}</option>
                                                <option value="wed">{t.freqOptions.wed}</option>
                                                <option value="thu">{t.freqOptions.thu}</option>
                                                <option value="fri">{t.freqOptions.fri}</option>
                                                <option value="day1">{t.freqOptions.day1}</option>
                                                <option value="day15">{t.freqOptions.day15}</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-slate-500 font-code uppercase">{t.targetProfit}</label>
                                            <input type="number" step="0.1" value={btConfig.targetProfit} onChange={e=>setBtConfig({...btConfig, targetProfit: Number(e.target.value)})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500" />
                                        </div>
                                    </div>
                                )}

                                {btConfig.strategy === 'custom2' && (
                                    <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 bg-slate-900/40 p-4 border border-slate-800">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] text-cyan-500 font-tech uppercase">Tracking Days</label>
                                            <input type="number" min="1" max="10" value={btConfig.custom2.trackingDays} onChange={e => setBtConfig({...btConfig, custom2: {...btConfig.custom2, trackingDays: parseInt(e.target.value)}})} className="w-16 bg-black border border-slate-700 text-white p-1 text-xs text-center" />
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] text-slate-500 font-tech uppercase">Screening Rules</label>
                                                <button onClick={() => {
                                                    const newConditions = [...btConfig.custom2.conditions, { day: 1, field: 'close', operator: '>', compareDay: 2, compareField: 'close', logical: 'AND' }];
                                                    setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConditions as any}});
                                                }} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-code">+ ADD RULE</button>
                                            </div>
                                            {btConfig.custom2.conditions.map((cond, idx) => (
                                                <div key={idx} className="flex flex-wrap gap-2 items-center bg-black/30 p-2 border border-slate-800/50">
                                                    <span className="text-[10px] text-slate-600 font-code">Day</span>
                                                    <input type="number" value={cond.day} onChange={e => {
                                                        const newConds = [...btConfig.custom2.conditions];
                                                        newConds[idx].day = parseInt(e.target.value);
                                                        setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConds}});
                                                    }} className="w-10 bg-black border border-slate-700 text-white p-1 text-[10px]" />
                                                    <select value={cond.field} onChange={e => {
                                                        const newConds = [...btConfig.custom2.conditions];
                                                        newConds[idx].field = e.target.value as any;
                                                        setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConds}});
                                                    }} className="bg-black border border-slate-700 text-white p-1 text-[10px]">
                                                        <option value="open">Open</option>
                                                        <option value="close">Close</option>
                                                        <option value="high">High</option>
                                                        <option value="low">Low</option>
                                                    </select>
                                                    <select value={cond.operator} onChange={e => {
                                                        const newConds = [...btConfig.custom2.conditions];
                                                        newConds[idx].operator = e.target.value as any;
                                                        setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConds}});
                                                    }} className="bg-black border border-slate-700 text-white p-1 text-[10px]">
                                                        <option value=">">&gt;</option>
                                                        <option value="<">&lt;</option>
                                                        <option value=">=">&gt;=</option>
                                                        <option value="<=">&lt;=</option>
                                                        <option value="==">==</option>
                                                    </select>
                                                    <span className="text-[10px] text-slate-600 font-code">Day</span>
                                                    <input type="number" value={cond.compareDay} onChange={e => {
                                                        const newConds = [...btConfig.custom2.conditions];
                                                        newConds[idx].compareDay = parseInt(e.target.value);
                                                        setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConds}});
                                                    }} className="w-10 bg-black border border-slate-700 text-white p-1 text-[10px]" />
                                                    <select value={cond.compareField} onChange={e => {
                                                        const newConds = [...btConfig.custom2.conditions];
                                                        newConds[idx].compareField = e.target.value as any;
                                                        setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConds}});
                                                    }} className="bg-black border border-slate-700 text-white p-1 text-[10px]">
                                                        <option value="open">Open</option>
                                                        <option value="close">Close</option>
                                                        <option value="high">High</option>
                                                        <option value="low">Low</option>
                                                    </select>
                                                    {idx < btConfig.custom2.conditions.length - 1 && (
                                                        <select value={cond.logical} onChange={e => {
                                                            const newConds = [...btConfig.custom2.conditions];
                                                            newConds[idx].logical = e.target.value as any;
                                                            setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConds}});
                                                        }} className="bg-cyan-900/30 border border-cyan-700 text-cyan-400 p-1 text-[10px] font-bold">
                                                            <option value="AND">AND</option>
                                                            <option value="OR">OR</option>
                                                        </select>
                                                    )}
                                                    <button onClick={() => {
                                                        const newConds = btConfig.custom2.conditions.filter((_, i) => i !== idx);
                                                        setBtConfig({...btConfig, custom2: {...btConfig.custom2, conditions: newConds}});
                                                    }} className="text-rose-500 hover:text-rose-400 ml-auto">×</button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-slate-500 font-tech uppercase">Buy Condition</label>
                                                <div className="flex gap-2">
                                                    <input type="number" value={btConfig.custom2.buyDay} onChange={e => setBtConfig({...btConfig, custom2: {...btConfig.custom2, buyDay: parseInt(e.target.value)}})} className="w-12 bg-black border border-slate-700 text-white p-1 text-[10px]" />
                                                    <select value={btConfig.custom2.buyField} onChange={e => setBtConfig({...btConfig, custom2: {...btConfig.custom2, buyField: e.target.value as any}})} className="flex-1 bg-black border border-slate-700 text-white p-1 text-[10px]">
                                                        <option value="open">Open</option>
                                                        <option value="close">Close</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2 border-t border-slate-800 pt-3">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] text-slate-500 font-tech uppercase">Sell Rules</label>
                                                <button onClick={() => {
                                                    const newRules = [...btConfig.custom2.sellRules, { conditionDay: 4, conditionField: 'open', conditionType: 'higher', action: 'immediate', actionDayOffset: 0 }];
                                                    setBtConfig({...btConfig, custom2: {...btConfig.custom2, sellRules: newRules as any}});
                                                }} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-code">+ ADD RULE</button>
                                            </div>
                                            {btConfig.custom2.sellRules.map((rule, idx) => (
                                                <div key={idx} className="space-y-2 bg-black/30 p-2 border border-slate-800/50">
                                                    <div className="flex flex-wrap gap-2 items-center">
                                                        <span className="text-[10px] text-slate-600 font-code">If Day</span>
                                                        <input type="number" value={rule.conditionDay} onChange={e => {
                                                            const newRules = [...btConfig.custom2.sellRules];
                                                            newRules[idx].conditionDay = parseInt(e.target.value);
                                                            setBtConfig({...btConfig, custom2: {...btConfig.custom2, sellRules: newRules}});
                                                        }} className="w-10 bg-black border border-slate-700 text-white p-1 text-[10px]" />
                                                        <select value={rule.conditionType} onChange={e => {
                                                            const newRules = [...btConfig.custom2.sellRules];
                                                            newRules[idx].conditionType = e.target.value as any;
                                                            setBtConfig({...btConfig, custom2: {...btConfig.custom2, sellRules: newRules}});
                                                        }} className="bg-black border border-slate-700 text-white p-1 text-[10px]">
                                                            <option value="higher">High Open</option>
                                                            <option value="lower">Low Open</option>
                                                            <option value="flat">Flat Open</option>
                                                            <option value="lower_and_down">Low Open & Close &lt; Open</option>
                                                        </select>
                                                        <span className="text-[10px] text-slate-600 font-code">then</span>
                                                        <select value={rule.action} onChange={e => {
                                                            const newRules = [...btConfig.custom2.sellRules];
                                                            newRules[idx].action = e.target.value as any;
                                                            setBtConfig({...btConfig, custom2: {...btConfig.custom2, sellRules: newRules}});
                                                        }} className="bg-black border border-slate-700 text-white p-1 text-[10px]">
                                                            <option value="immediate">Sell Immediately</option>
                                                            <option value="close">Sell at Close</option>
                                                            <option value="nextOpen">Sell Next Open</option>
                                                            <option value="nextClose">Sell Next Close</option>
                                                        </select>
                                                        <button onClick={() => {
                                                            const newRules = btConfig.custom2.sellRules.filter((_, i) => i !== idx);
                                                            setBtConfig({...btConfig, custom2: {...btConfig.custom2, sellRules: newRules}});
                                                        }} className="text-rose-500 hover:text-rose-400 ml-auto">×</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                             </div>
                             <div className="bg-black/40 p-4 border-l-2 border-cyan-500/30">
                                <h5 className="text-[10px] font-tech text-cyan-500 uppercase mb-2">{t.strategyDesc}</h5>
                                <p className="text-[11px] text-slate-400 font-code leading-relaxed">
                                    {t.strategies[btConfig.strategy as keyof typeof t.strategies]?.desc}
                                </p>
                             </div>
                        </div>

                        {btResult && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 animate-in fade-in zoom-in duration-300">
                                <div className="bg-black/40 p-4 border-l-2 border-cyan-500"><div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.finalValue}</div><div className="text-xl font-code font-bold text-white">{btResult.final_value.toFixed(2)}</div></div>
                                <div className="bg-black/40 p-4 border-l-2 border-purple-500"><div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.totalReturn}</div><div className={`text-xl font-code font-bold ${btResult.total_return >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{(btResult.total_return * 100).toFixed(2)}%</div></div>
                                <div className="bg-black/40 p-4 border-l-2 border-orange-500"><div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.maxDD}</div><div className="text-xl font-code font-bold text-orange-400">{(btResult.max_drawdown * 100).toFixed(2)}%</div></div>
                                <div className="bg-black/40 p-4 border-l-2 border-emerald-500"><div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.sharpe}</div><div className="text-xl font-code font-bold text-emerald-400">{btResult.sharpe.toFixed(3)}</div></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 p-6 relative overflow-hidden group">
                        <h4 className="font-tech text-purple-400 font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> {t.aiAnalyze}
                        </h4>
                        {!aiResult ? (
                            <div className="text-center py-6">
                                <p className="text-xs text-slate-500 font-code mb-6 uppercase tracking-tight">{t.aiHint}</p>
                                <button onClick={handleAiAnalysis} disabled={aiLoading} className="w-full py-3 bg-purple-900/20 border border-purple-500/50 text-purple-400 font-tech font-bold uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all clip-button">{aiLoading ? 'SYNCING...' : 'START DIAGNOSTIC'}</button>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in duration-500">
                                <div className="bg-black/40 p-3"><span className="text-[10px] font-tech text-slate-500 uppercase">Sentiment Index</span><div className="flex gap-1 mt-1">{[...Array(5)].map((_, i) => (<div key={i} className={`w-3 h-5 ${i < (aiResult.sentiment/20) ? 'bg-purple-500' : 'bg-slate-800'}`}></div>))}</div></div>
                                <div className="space-y-3">
                                    <div><div className="text-[9px] font-tech text-slate-600 uppercase mb-1">STRATEGY ADVICE</div><p className="text-[11px] text-slate-300 font-code leading-relaxed bg-black/20 p-2">{aiResult.strategyAdvice?.shortTerm}</p></div>
                                    <div><div className="text-[9px] font-tech text-rose-600 uppercase mb-1">RISK ALERT</div><ul className="text-[10px] text-rose-400/80 font-code list-disc list-inside">{aiResult.risks?.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul></div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="bg-slate-900 border border-slate-800 p-6 flex-1 flex flex-col h-[500px]">
                        <h4 className="font-tech text-slate-500 font-bold uppercase tracking-widest mb-4">{t.trades}</h4>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                             {btResult?.trades && btResult.trades.length > 0 ? (
                                 btResult.trades.map((trade, i) => (
                                     <div key={i} className={`p-3 border-l-4 bg-black/20 font-code flex justify-between items-center ${trade.type === 'BUY' ? 'border-rose-500' : 'border-emerald-500'}`}>
                                         <div><div className="text-[10px] text-slate-500">{trade.date}</div><div className={`text-xs font-bold ${trade.type === 'BUY' ? 'text-rose-400' : 'text-emerald-400'}`}>{trade.type} @ {trade.price.toFixed(2)}</div></div>
                                         <div className="text-right"><div className="text-[10px] text-slate-500">VAL: {trade.cost.toFixed(0)}</div><div className="text-[9px] text-slate-600">FEE: {trade.commission.toFixed(1)}</div></div>
                                     </div>
                                 )).reverse()
                             ) : (<div className="h-full flex items-center justify-center text-[10px] text-slate-700 font-code uppercase tracking-widest">Awaiting execution</div>)}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
