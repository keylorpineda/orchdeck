import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  ZOMPO_WORKING_PHRASES,
  getUiDictionary,
  getZompoStatusPhrase,
  resolveInitialLocale,
} from './i18n.js';

describe('bilingual i18n and Zompo phrase catalog', () => {
  it('resolves stored locales cleanly with English default', () => {
    assert.equal(resolveInitialLocale(null), 'en');
    assert.equal(resolveInitialLocale('invalid'), 'en');
    assert.equal(resolveInitialLocale('es'), 'es');
  });

  it('provides balanced EN and ES dictionaries and rotating Zompo phrases', () => {
    const en = getUiDictionary('en');
    const es = getUiDictionary('es');
    assert.equal(en.send, 'Send');
    assert.equal(es.send, 'Enviar');
    assert.equal(en.noModeWritesMain, 'No mode writes to main');
    assert.equal(es.noModeWritesMain, 'Ningún modo escribe en main');

    assert.equal(ZOMPO_WORKING_PHRASES.en.length, ZOMPO_WORKING_PHRASES.es.length);
    assert.equal(getZompoStatusPhrase('en', 'working', 0), 'Zompo is cooking...');
    assert.equal(getZompoStatusPhrase('es', 'working', 0), 'Zompo está cocinando...');
    assert.ok(getZompoStatusPhrase('es', 'working', 7).startsWith('Zompo '));
  });
});
