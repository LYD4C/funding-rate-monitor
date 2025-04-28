"use client"
import { useEffect, useState } from 'react';
import { useInterval } from 'react-use';
import { BinanceExchangeInfo, BinancePremiumIndex, BinanceSymbolInfo, FundingRate, FundingRateWithOI, OpenInterestHist, RateHistory } from '../types/funding';


const convertRatioTo100 = (ratio: number): [number, number] => {
  // 异常值处理
  if (ratio <= 0 || !isFinite(ratio)) {
    console.warn(`Invalid ratio: ${ratio}, defaulting to 50:50`);
    return [50, 50];
  }

  // 计算精确百分比
  const total = ratio + 1;
  const long = (ratio / total) * 100;
  const short = 100 - long;

  // 处理浮点精度问题（确保总和严格为100）
  return [
    Number(long.toFixed(2)), 
    Number((100 - long).toFixed(2)) // 直接计算避免0.0000000001误差
  ];
};

const calculateOIChanges = (values: number[]): number[] => {
  if (values.length < 3) return [0, 0];
  
  const [current, h1, h3] = values;
  const change1h = h1 !== 0 ? ((current - h1) / h1) * 100 : current > 0 ? Infinity : 0;
  const change3h = h3 !== 0 ? ((current - h3) / h3) * 100 : current > 0 ? Infinity : 0;
  
  return [
    Number(change1h.toFixed(1)),  // 保留1位小数
    Number(change3h.toFixed(1))
  ];
};

// 持仓值单位转换
const formatOIVAlue = (value: number) => {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  return `${(value / 1e3).toFixed(0)}K`;
};

const rateHistory: RateHistory = {};

const FundingRateTable = () => {
  const [rates, setRates] = useState<FundingRateWithOI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [exchangeRes, premiumRes] = await Promise.all([
        fetch('https://fapi.binance.com/fapi/v1/exchangeInfo').then(res => res.json()) as Promise<BinanceExchangeInfo>,
        fetch('https://fapi.binance.com/fapi/v1/premiumIndex').then(res => res.json()) as Promise<BinancePremiumIndex[]>
      ]);
  
  
      const tradingSymbols = exchangeRes.symbols
        .filter((s: BinanceSymbolInfo) => s.symbol.endsWith('USDT') && s.status === 'TRADING')
        .map((s: BinanceSymbolInfo) => s.symbol);
  
      const rates: FundingRate[] = premiumRes
        .filter((item: BinancePremiumIndex): item is BinancePremiumIndex => tradingSymbols.includes(item.symbol))
        .map((item: BinancePremiumIndex) => {
          const currentRate = parseFloat(item.lastFundingRate);
          const previousRate = rateHistory[item.symbol] || currentRate;
          const changePercent = ((currentRate - previousRate) / previousRate) * 100;
          
          rateHistory[item.symbol] = currentRate;
          
          return {
            symbol: item.symbol,
            lastFundingRate: currentRate,
            nextFundingTime: item.nextFundingTime,
            changePercent: Number(changePercent.toFixed(2))
          };
        })
        .sort((a: FundingRate, b: FundingRate) => 
          Math.abs(b.lastFundingRate) - Math.abs(a.lastFundingRate)
        )
        .slice(0, 10);



       const ratesWithOI: FundingRateWithOI[] = await Promise.all(
          rates.map(async (rate) => {
            try {
              // 请求持仓量历史（示例为过去4个小时数据）
              const endTime = Date.now();
              const oiRes = await fetch(
                `https://fapi.binance.com/futures/data/openInterestHist?symbol=${rate.symbol}&period=1h&limit=4&startTime=${endTime - 4 * 60 * 60 * 1000}`
              ).then(res => res.json() as Promise<OpenInterestHist[]>);

                let oiValues = [0, 0, 0]
              
                if (oiRes.length > 0) {

                  const sortedData = oiRes.sort((a, b) => b.timestamp - a.timestamp);

                  const rawValues = sortedData.map(item => 
                    Number(item.sumOpenInterestValue)  // 直接使用原始持仓值
                  );
                      // 按时间间隔选取数据点（最新值，1小时前，3小时前）
                  oiValues = [
                    rawValues[0] || 0,                  // 当前小时
                    rawValues[1] || rawValues[0] || 0,  // 1小时前（降级使用更早数据）
                    rawValues[3] || rawValues[2] || 0    // 3小时前
                  ];
                }

              return {
                ...rate,
                oiValues,
                oiChangeRates: calculateOIChanges(oiValues),
              };
            } catch (err) {
              console.error(`Failed to fetch OI for ${rate.symbol}:`, err);
              return { ...rate, maxOIDiff: 0 }; // 容错处理
            }
          })
        );

        const ratesWithRatios = await Promise.all(
          ratesWithOI.map(async (rate) => {
            try {
              const symbol = rate.symbol;
              const endTime = Date.now();
              const startTime = endTime - 1 * 60 * 60 * 1000; // 5小时前
    
              // 并行获取三类多空比数据
              const [positionRes, accountRes, globalRes] = await Promise.all([
                fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${symbol}&period=1h&startTime=${startTime}&limit=1`).then(res => res.json()) ,
                fetch(`https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=${symbol}&period=1h&startTime=${startTime}&limit=1`).then(res => res.json()) ,
                fetch(`https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&startTime=${startTime}&limit=1`).then(res => res.json()) 
              ]);
    
    
              return {
                ...rate,
                topPositionRatio: Number(positionRes[0].longShortRatio),
                topAccountRatio:  Number(accountRes[0].longShortRatio),
                globalAccountRatio:  Number(globalRes[0].longShortRatio)
              };
            } catch (err) {
              console.error(`多空比数据获取失败: ${rate.symbol}`, err);
              return { ...rate, topPositionRatio: 0, topAccountRatio: 0, globalAccountRatio: 0 };
            }
          })
        );

      setRates(ratesWithRatios);
    
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useInterval(fetchData, 30000);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">正在加载资金费率数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 p-4 rounded-lg text-red-700 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              排名
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              交易对
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              资金费率
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              下次结算
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              最近0/1/3 合约持仓值
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              1/3 小时变化
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              大户持仓量多空比
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              大户账户数多空比
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              多空人数比
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rates.map((rate, index) => (
            <tr key={rate.symbol}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                #{index + 1}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                {rate.symbol}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span
                  className={`${
                    rate.lastFundingRate > 0 
                      ? 'text-green-600 bg-green-50'
                      : 'text-red-600 bg-red-50'
                  } px-2 py-1 rounded-full text-xs font-medium`}
                >
                  {(rate.lastFundingRate * 100).toFixed(4)}%
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {new Date(rate.nextFundingTime).toLocaleTimeString()}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {formatOIVAlue(rate?.oiValues?.[0] || 0)} /  {formatOIVAlue(rate?.oiValues?.[1] || 0)}/  {formatOIVAlue(rate?.oiValues?.[2] || 0)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {rate?.oiChangeRates?.[0]}% / {rate?.oiChangeRates?.[1]}%
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {rate.topPositionRatio}
                (<span className='text-green-600'>{convertRatioTo100(rate.topPositionRatio || 0)[0]} %</span> : 
                <span className='text-red-600'>{convertRatioTo100(rate.topPositionRatio || 0)[1]}%</span>)
              </td>
           
              <td className="px-6 py-4 whitespace-nowrap">
                {rate.topAccountRatio}
                (<span className='text-green-600'>{convertRatioTo100(rate.topAccountRatio || 0)[0]} %</span> : 
                <span className='text-red-600'>{convertRatioTo100(rate.topAccountRatio || 0)[1]}%</span>)
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                {rate.globalAccountRatio}
                (<span className='text-green-600'>{convertRatioTo100(rate.globalAccountRatio || 0)[0]} %</span> : 
                <span className='text-red-600'>{convertRatioTo100(rate.globalAccountRatio || 0)[1]}%</span>)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


export default FundingRateTable;