
/**
 * TUKU High-Performance Backtest Engine (Vectorized)
 */
export class BacktestEngine {
  /**
   * Run strategy backtest
   * @param {Array} data - OHLCV history
   * @param {number} initial_capital - Starting cash
   * @param {number} commission_rate - e.g. 0.0003
   * @param {Function} strategy_fn - (data) => Array of signals (-1, 0, 1)
   */
  static run(data, initial_capital, commission_rate, strategy_fn) {
    if (!data || data.length === 0) throw new Error("No data provided");

    const signals = strategy_fn(data);
    let cash = initial_capital;
    let shares = 0;
    const equity_curve = [];
    const trades = [];

    for (let i = 0; i < data.length; i++) {
      const day = data[i];
      const signal = signals[i];
      const price = day.close;

      if (signal === 1 && shares === 0) {
        const total_cost = cash;
        const commission = total_cost * commission_rate;
        const net_cash = cash - commission;
        shares = net_cash / price;
        cash = 0;
        trades.push({ date: day.date, type: 'BUY', price, shares, cost: total_cost, commission, value: net_cash });
      } else if (signal === -1 && shares > 0) {
        const raw_value = shares * price;
        const commission = raw_value * commission_rate;
        cash = raw_value - commission;
        trades.push({ date: day.date, type: 'SELL', price, shares, cost: raw_value, commission, value: cash });
        shares = 0;
      }
      const current_equity = cash + (shares * price);
      equity_curve.push({ date: day.date, value: current_equity });
    }
    return this.calculateMetrics(equity_curve, trades, initial_capital);
  }

  /**
   * Specialized Intraday Strategy (Custom Strategy 1)
   * Buys at open on specific frequency, sells at profit target or close.
   */
  static customIntraday(data, initial_capital, commission_rate, options) {
      const { frequency, targetProfit } = options;
      let cash = initial_capital;
      const equity_curve = [];
      const trades = [];

      for (const day of data) {
          const dateObj = new Date(day.date);
          let shouldTrade = false;
          
          if (frequency === 'daily') shouldTrade = true;
          else if (['mon', 'tue', 'wed', 'thu', 'fri'].includes(frequency)) {
              const dayMap = { 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5 };
              if (dateObj.getDay() === dayMap[frequency]) shouldTrade = true;
          } else if (frequency === 'day1') {
              if (dateObj.getDate() === 1) shouldTrade = true;
          } else if (frequency === 'day15') {
              if (dateObj.getDate() === 15) shouldTrade = true;
          }

          if (shouldTrade) {
              // 1. Buy at Open
              const buyPrice = day.open;
              const buyCommission = cash * commission_rate;
              const buyNetCash = cash - buyCommission;
              const shares = buyNetCash / buyPrice;
              trades.push({ date: day.date, type: 'BUY', price: buyPrice, shares, cost: cash, commission: buyCommission, value: buyNetCash });

              // 2. Intra-day Sell Logic
              const targetSellPrice = buyPrice * (1 + targetProfit);
              let sellPrice, sellCommission, sellValue;

              if (day.high >= targetSellPrice) {
                  // Sold at target profit
                  sellPrice = targetSellPrice;
              } else {
                  // Target not reached, sell at Close
                  sellPrice = day.close;
              }

              const rawSellValue = shares * sellPrice;
              sellCommission = rawSellValue * commission_rate;
              sellValue = rawSellValue - sellCommission;
              trades.push({ date: day.date, type: 'SELL', price: sellPrice, shares, cost: rawSellValue, commission: sellCommission, value: sellValue });
              
              cash = sellValue;
          }
          equity_curve.push({ date: day.date, value: cash });
      }
      return this.calculateMetrics(equity_curve, trades, initial_capital);
  }

  /**
   * Custom Strategy 2: Multi-Day Logic
   */
  static customStrategy2(data, initial_capital, commission_rate, options) {
    const { trackingDays, conditions, buyDay, buyField, sellRules } = options;
    let cash = initial_capital;
    let shares = 0;
    const equity_curve = [];
    const trades = [];

    const evaluateCondition = (cond, windowData) => {
      const val1 = windowData[cond.day - 1]?.[cond.field];
      const val2 = windowData[cond.compareDay - 1]?.[cond.compareField];
      if (val1 === undefined || val2 === undefined) return false;

      switch (cond.operator) {
        case '>': return val1 > val2;
        case '<': return val1 < val2;
        case '>=': return val1 >= val2;
        case '<=': return val1 <= val2;
        case '==': return val1 === val2;
        default: return false;
      }
    };

    let i = 0;
    while (i < data.length) {
      const day = data[i];
      equity_curve.push({ date: day.date, value: cash + shares * day.close });

      if (shares === 0) {
        // Check if we can start a tracking window
        if (i + trackingDays <= data.length) {
          const windowData = data.slice(i, i + trackingDays);
          
          // Evaluate screening conditions
          let match = true;
          if (conditions.length > 0) {
            match = evaluateCondition(conditions[0], windowData);
            for (let j = 0; j < conditions.length - 1; j++) {
              const nextMatch = evaluateCondition(conditions[j+1], windowData);
              if (conditions[j].logical === 'OR') {
                match = match || nextMatch;
              } else {
                match = match && nextMatch;
              }
            }
          }

          if (match) {
            // Buy condition
            const absoluteBuyDayIdx = i + (buyDay - 1);
            if (absoluteBuyDayIdx < data.length) {
              const buyDayData = data[absoluteBuyDayIdx];
              const price = buyDayData[buyField];
              const commission = cash * commission_rate;
              const net_cash = cash - commission;
              shares = net_cash / price;
              cash = 0;
              trades.push({ date: buyDayData.date, type: 'BUY', price, shares, cost: net_cash + commission, commission, value: net_cash });
              
              // Now look for sell
              let sellFound = false;
              for (let j = absoluteBuyDayIdx; j < data.length; j++) {
                const currentDay = data[j];
                const relativeDayIdx = j - i + 1; // 1-indexed relative to window start

                // Check sell rules
                for (const rule of sellRules) {
                  if (relativeDayIdx === rule.conditionDay) {
                    const openPrice = currentDay.open;
                    const prevClose = data[j-1]?.close || openPrice;
                    const isHigher = openPrice > prevClose;
                    const isLower = openPrice < prevClose;

                    let trigger = false;
                    if (rule.conditionType === 'higher' && isHigher) trigger = true;
                    if (rule.conditionType === 'lower' && isLower) trigger = true;
                    if (rule.conditionType === 'lower_and_down' && isLower && currentDay.close < currentDay.open) trigger = true;

                    if (trigger) {
                      let sellPrice;
                      if (rule.action === 'immediate') sellPrice = currentDay.open;
                      else if (rule.action === 'close') sellPrice = currentDay.close;
                      else if (rule.action === 'nextOpen' && data[j+1]) sellPrice = data[j+1].open;
                      else if (rule.action === 'nextClose' && data[j+1]) sellPrice = data[j+1].close;
                      
                      if (sellPrice) {
                        const sellDate = (rule.action.startsWith('next') && data[j+1]) ? data[j+1].date : currentDay.date;
                        const raw_value = shares * sellPrice;
                        const sellCommission = raw_value * commission_rate;
                        cash = raw_value - sellCommission;
                        trades.push({ date: sellDate, type: 'SELL', price: sellPrice, shares, cost: raw_value, commission: sellCommission, value: cash });
                        shares = 0;
                        sellFound = true;
                        i = j; // Move index to sell day
                        break;
                      }
                    }
                  }
                }
                if (sellFound) break;
                
                // If we reached the end of data without selling, sell at last available close
                if (j === data.length - 1 && shares > 0) {
                  const sellPrice = currentDay.close;
                  const raw_value = shares * sellPrice;
                  const sellCommission = raw_value * commission_rate;
                  cash = raw_value - sellCommission;
                  trades.push({ date: currentDay.date, type: 'SELL', price: sellPrice, shares, cost: raw_value, commission: sellCommission, value: cash });
                  shares = 0;
                  i = j;
                }
              }
            }
          }
        }
      }
      i++;
    }

    // Fill remaining equity curve if any
    while (equity_curve.length < data.length) {
        const day = data[equity_curve.length];
        equity_curve.push({ date: day.date, value: cash });
    }

    return this.calculateMetrics(equity_curve, trades, initial_capital);
  }

  static calculateMetrics(equity_curve, trades, initial_capital) {
    const final_value = equity_curve[equity_curve.length - 1].value;
    const total_return = (final_value - initial_capital) / initial_capital;
    let peak = initial_capital;
    let max_drawdown = 0;
    equity_curve.forEach(d => {
      if (d.value > peak) peak = d.value;
      const dd = peak === 0 ? 0 : (peak - d.value) / peak;
      if (dd > max_drawdown) max_drawdown = dd;
    });
    const daily_returns = [];
    for (let i = 1; i < equity_curve.length; i++) {
        if (equity_curve[i-1].value !== 0) daily_returns.push((equity_curve[i].value - equity_curve[i - 1].value) / equity_curve[i - 1].value);
    }
    const mean_return = daily_returns.length ? daily_returns.reduce((a, b) => a + b, 0) / daily_returns.length : 0;
    const std_dev = daily_returns.length ? Math.sqrt(daily_returns.map(x => Math.pow(x - mean_return, 2)).reduce((a, b) => a + b, 0) / daily_returns.length) : 0;
    const sharpe = std_dev !== 0 ? (mean_return / std_dev) * Math.sqrt(252) : 0;

    return { final_value, total_return, max_drawdown, sharpe, equity_curve, trades };
  }

  static smaCross(data, fast = 5, slow = 20) {
    const signals = new Array(data.length).fill(0);
    const closes = data.map(d => d.close);
    const calculateSMA = (arr, period, index) => {
      if (index < period - 1) return null;
      let sum = 0; for (let i = index; i > index - period; i--) sum += arr[i];
      return sum / period;
    };
    let last_signal = -1;
    for (let i = 0; i < data.length; i++) {
      const fastMA = calculateSMA(closes, fast, i);
      const slowMA = calculateSMA(closes, slow, i);
      if (fastMA !== null && slowMA !== null) {
        if (fastMA > slowMA && last_signal !== 1) { signals[i] = 1; last_signal = 1; }
        else if (fastMA < slowMA && last_signal !== -1) { signals[i] = -1; last_signal = -1; }
      }
    }
    return signals;
  }
}
