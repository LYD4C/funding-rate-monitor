"use client"
import { useEffect, useState } from 'react';
import { useInterval } from 'react-use';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/solid';
import { BinanceExchangeInfo, BinancePremiumIndex, BinanceSymbolInfo, FundingRate, FundingRateWithOI, OpenInterestHist, RateHistory } from '../types/funding';

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
          // 请求持仓量历史（示例为过去5个小时数据）
          const oiRes = await fetch(
            `https://fapi.binance.com/futures/data/openInterestHist?symbol=${rate.symbol}&period=1h&startTime=${Date.now() - 5 * 60 * 60 * 1000}`
          ).then(res => res.json() as Promise<OpenInterestHist[]>);

            let avgOIO = 0;
            let timeRange = '无数据';
          
            if (oiRes.length > 0) {
              // 计算均值（保留两位小数）
              const totalOI = oiRes.reduce((sum, item) => sum + (item.sumOpenInterestValue / item.sumOpenInterest), 0);
              avgOIO = Number((totalOI / oiRes.length).toFixed(2));
            }

          return {
            ...rate,
            avgOIO,                  // 均值数据
          };
        } catch (err) {
          console.error(`Failed to fetch OI for ${rate.symbol}:`, err);
          return { ...rate, maxOIDiff: 0 }; // 容错处理
        }
      })
    );

    setRates(ratesWithOI);
    
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

  // useInterval(fetchData, 30000);

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
              最近5H 合约持仓均值(OI 大于 2表明短期激增)
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
                {rate.avgOIO}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};


export default FundingRateTable;