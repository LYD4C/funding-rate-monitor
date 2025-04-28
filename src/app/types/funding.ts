export interface FundingRate {
  symbol: string;
  lastFundingRate: number;
  nextFundingTime: number;
  changePercent: number;
}

export interface RateHistory {
  [symbol: string]: number;
}

export interface BinanceSymbolInfo {
  symbol: string;
  status: string;
  contractType: string;
  // 其他可能需要的字段...
}

export interface BinanceExchangeInfo {
  symbols: BinanceSymbolInfo[];
}

export interface BinancePremiumIndex {
  symbol: string;
  lastFundingRate: string;
  nextFundingTime: number;
}

// 新增数据类型
export interface OpenInterestHist {
  symbol: string;
  sumOpenInterestValue: number; // 持仓总价值
  sumOpenInterest: number;    // 持仓总数量
  timestamp: number;       // 时间戳（毫秒）
}

export interface FundingRateWithOI extends FundingRate {
  oiValues?: number[];          //  持仓值数组 [最新值, 1小时前, 3小时前]（单位：USD）
  oiChangeRates?: number[];     // 持仓变化率 [1小时变化率%, 3小时变化率%]
  topPositionRatio?: number;    // 大户持仓量多空比
  topAccountRatio?: number;     // 大户账户数多空比
  globalAccountRatio?: number;  // 多空持仓人数比
}