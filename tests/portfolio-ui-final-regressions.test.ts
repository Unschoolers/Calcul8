import { describe, expect, it } from 'vitest';
import { buildPortfolioReceiptSummary } from '../src/app-core/computed/portfolio-receipt.ts';
import { portfolioWindowDefinition } from '../src/components/windows/portfolio/PortfolioWindow.definition.ts';
import { translateAppMessage } from '../src/app-core/i18n/index.ts';

const methods = portfolioWindowDefinition.methods;
const summaryAt = buildPortfolioReceiptSummary as (rows: Parameters<typeof buildPortfolioReceiptSummary>[0], today: string) => ReturnType<typeof buildPortfolioReceiptSummary>;
describe('receipt summary civil date', () => {
  const row = (expectedReceiptDate?: string) => ({ expectedReceiptDate, totalCost: 500, totalRevenue: 0, realizedProfit: 0 });
  it('keeps overdue paid lots awaiting but has no next date', () => {
    expect(summaryAt([row('2026-10-24')], '2026-10-25')).toMatchObject({ awaiting: { lotCount: 1, totalCost: 500 }, nextExpectedReceiptDate: null, capitalToRecover: 500 });
  });
  it('selects the earliest today or future estimate from mixed dates', () => {
    expect(summaryAt([row('2026-10-24'), row('2026-11-01'), row('2026-10-25')], '2026-10-25').nextExpectedReceiptDate).toBe('2026-10-25');
  });
  it('handles empty and received selections', () => {
    expect(summaryAt([], '2026-10-25')).toMatchObject({ nextExpectedReceiptDate: null, capitalToRecover: 0 });
    expect(summaryAt([row()], '2026-10-25')).toMatchObject({ awaiting: { lotCount: 0 }, received: { lotCount: 1 } });
  });
});
describe('Details commercial results', () => {
  it('summarizes realized losses and gains without calling a paid no-sale preorder a loss', () => {
    const vm = { allLotPerformance: [
      { expectedReceiptDate: '2026-12-01', totalProfit: -500, realizedProfit: 0 },
      { expectedReceiptDate: '2026-12-02', totalProfit: -400, realizedProfit: 80 },
      { expectedReceiptDate: '2026-12-03', totalProfit: -450, realizedProfit: -20 }
    ], fmtCurrency: (value: number) => String(value) };
    expect(methods.portfolioLotPerformanceUnderAmount.call(vm)).toBe('20');
    expect(methods.portfolioLotPerformanceOverAmount.call(vm)).toBe('80');
  });
  for (const language of ['en', 'fr']) it(`labels results explicitly realized in ${language}`, () => {
    const model = methods.portfolioPerformanceSheetModel.call({ portfolioCopy: (key: string) => translateAppMessage(language, key) });
    expect(model.lossLabel).toBe(language === 'fr' ? 'Perte réalisée' : 'Realized loss');
    expect(model.gainLabel).toBe(language === 'fr' ? 'Gain réalisé' : 'Realized gain');
  });
});
