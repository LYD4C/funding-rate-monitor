import Head from 'next/head';
import FundingRateTable from './components/FundingRateTable';


export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Binance 资金费率监控</title>
        <meta name="description" content="实时监控 Binance 合约资金费率" />
      </Head>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Binance USDT 合约资金费率监控
          </h1>
          <p className="text-gray-600">
            数据每30秒自动刷新，绿色表示正费率，红色表示负费率
          </p>
        </div>
        
        <FundingRateTable />
        
        <div className="mt-6 text-sm text-gray-500 text-center">
          <p>数据来源：Binance Futures API</p>
          <p>下次结算时间以本地时区显示</p>
        </div>
      </main>
    </div>
  );
}