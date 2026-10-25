import { defineComponent, h, nextTick, reactive } from 'vue';
import { expect, test, vi } from 'vitest';
import { renderWithApp } from './render.ts';
import { createInitialState } from '../../src/app-core/state.ts';
import { translateAppMessage } from '../../src/app-core/i18n/index.ts';
import PortfolioReportModal from '../../src/components/shell/PortfolioReportModal.vue';
import { createCommerceDialogPorts, commerceDialogPortsKey } from '../../src/components/modals/commerceDialogPorts.ts';
import WhatnotReviewDialog from '../../src/components/windows/whatnot/WhatnotReviewDialog.vue';
import { createWhatnotDialogPorts, whatnotDialogPortsKey } from '../../src/components/windows/whatnot/whatnotDialogPorts.ts';
import { vuetify } from '../../src/vuetify.ts';
const Dialog = defineComponent({ setup(_, { slots }) { return () => h('div', slots.default?.()); } });
for (const language of ['en', 'fr']) {
  test(`report preserves paid balance and actual commercial sales with collapsed receipt ${language}`, () => {
    vuetify.display.width.value = 390;
    const state = reactive({ ...createInitialState(), showPortfolioReportModal: true, hasPortfolioData: true,
      allLotPerformance: [0, 80, -20].map((profit, i) => ({ lotId: i + 1, lotName: `Lot ${i}`, expectedReceiptDate: '2026-12-01', salesCount: i ? 1 : 0, realizedProfit: profit, totalProfit: -500 + i * 100 })),
      t: (key: string) => translateAppMessage(language, key), formatDate: (v: string) => v,
      formatCurrency: (v: number) => v.toFixed(2), togglePortfolioReportLot: vi.fn() });
    const { container } = renderWithApp(PortfolioReportModal, { global: { provide: { [commerceDialogPortsKey as symbol]: createCommerceDialogPorts(state as never) }, stubs: { AppDialogShell: Dialog } } });
    const cards = container.querySelectorAll('.portfolio-report-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain('2026-12-01');
    expect(cards[0]?.textContent).toContain(language === 'fr' ? 'Solde de récupération' : 'Investment recovery balance');
    expect(cards[0]?.textContent).toContain('$-500.00');
    expect(cards[1]?.textContent).toContain('+$80.00');
    expect(cards[2]?.textContent).toContain('$-20.00');
    expect(cards[0]?.querySelector('.portfolio-report-card-details')).toBeNull();
    expect(cards[0]?.querySelector('.portfolio-report-card-summary .app-financial-value--negative')).toBeNull();
  });
  test(`Whatnot mapped lot receipt metadata follows selection ${language}`, async () => {
    const row = { rowId: 'row', title: 'Sale', selectedLotId: 1, suggestedLotId: 1, selectedSaleType: 'pack', selectedImportAction: 'create', action: 'create', quantity: 1, price: 10, date: '2026-10-25', externalOrderId: 'order', externalSaleId: 'sale', matchSource: 'remembered', buyerName: 'Buyer' };
    const state = reactive({ ...createInitialState(), showWhatnotReviewDialog: true, whatnotReviewRows: [row],
      lotItems: [{ value: 1, title: 'Awaiting', subtitle: 'Bulk', lotType: 'bulk', isAwaitingReceipt: true, expectedReceiptDate: '2026-12-01' }, { value: 2, title: 'Received', subtitle: 'Bulk', lotType: 'bulk', isAwaitingReceipt: false }],
      t: (key: string, params?: Record<string, string | number | null | undefined>) => translateAppMessage(language, key, params), formatDate: (v: string) => v, formatCurrency: (v: number) => v.toFixed(2), loadSalesForLotId: vi.fn() });
    const { container } = renderWithApp(WhatnotReviewDialog, { global: { provide: { [whatnotDialogPortsKey as symbol]: createWhatnotDialogPorts(state as never) }, stubs: { AppDialogShell: Dialog }, mocks: { preferredLanguage: language } } });
    expect(container.querySelector('.whatnot-review-receipt')?.textContent).toContain('2026-12-01');
    expect(container.querySelector('.whatnot-review-receipt')?.textContent).toContain(language === 'fr' ? 'Prévu' : 'Expected');
    state.whatnotReviewRows[0]!.selectedLotId = 2; await nextTick();
    expect(container.querySelector('.whatnot-review-receipt')?.textContent).toContain(language === 'fr' ? 'Reçu' : 'Received');
    expect(container.querySelector('.whatnot-review-receipt')?.textContent).not.toContain('2026-12-01');
  });
}
