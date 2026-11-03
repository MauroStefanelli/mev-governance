import { detailReviewInput, detailReviewSignature, parseDetailReviews } from './offerDetailReview';

const item = { imported: true, sourceRowId: 'detail-1', interventionId: 'I1', id: 239, type: 'MODIFICA', complexity: 'Medio', qty: 1, detail: { detailDescription: 'Adeguare API', technology: 'Java' } };
const catalog = [{ id: 239, nome: 'API', ambito: 'Backend', criteri: { Medio: 'Un servizio' } }];
test('links each detail row to its intervention and the actual selected catalog criteria', () => {
  const input = detailReviewInput(item, catalog, [{ id: 'I1', requisiti: 'REQ-1', attivita: 'Controllo API' }], 'contract', '2', 0);
  expect(input.catalogEntry.criteria.Medio).toBe('Un servizio');
  expect(input.intervention.requirements).toBe('REQ-1');
  expect(input.detail.technology).toBe('Java');
  expect(detailReviewSignature(input)).not.toBe(detailReviewSignature(detailReviewInput({ ...item, complexity: 'Complesso' }, catalog, [], 'contract', '2', 0)));
});
test('does not apply one response to multiple detail lines or silently accept missing results', () => {
  const one = detailReviewInput(item, catalog, [], 'contract', '2', 0);
  const two = { ...one, rowId: 'detail-2' };
  const result = parseDetailReviews({ model: 'test', analysis: { reviews: [{ rowId: one.rowId, status: 'da_verificare', reason: 'Criteri insufficienti' }] } }, [one, two]);
  expect(result[0].status).toBe('da_verificare');
  expect(result[1].status).toBe('error');
  expect(parseDetailReviews({ analysis: { reviews: [{ rowId: one.rowId, status: 'approved', reason: 'ok' }] } }, [one])[0].status).toBe('error');
});
