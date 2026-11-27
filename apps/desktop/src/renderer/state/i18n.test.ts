import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  ORSO_WORKING_PHRASES,
  getOrsoStatusPhrase,
  getUiDictionary,
  resolveInitialLocale,
} from './i18n.js';

describe('bilingual i18n and Orso phrase catalog', () => {
  it('resolves stored locales cleanly with English default', () => {
    assert.equal(resolveInitialLocale(null), 'en');
    assert.equal(resolveInitialLocale('invalid'), 'en');
    assert.equal(resolveInitialLocale('es'), 'es');
  });

  it('provides balanced EN and ES dictionaries and rotating Orso phrases', () => {
    const en = getUiDictionary('en');
    const es = getUiDictionary('es');
    assert.equal(en.send, 'Send');
    assert.equal(es.send, 'Enviar');
    assert.equal(en.noModeWritesMain, 'No mode writes to main');
    assert.equal(es.noModeWritesMain, 'Ningún modo escribe en main');
    assert.ok(en.welcomeLinkCta.length > 0);
    assert.ok(es.welcomeLinkCta.length > 0);

    assert.equal(ORSO_WORKING_PHRASES.en.length, ORSO_WORKING_PHRASES.es.length);
    assert.equal(getOrsoStatusPhrase('en', 'working', 0), 'Orso is hammering out a clean diff...');
    assert.equal(getOrsoStatusPhrase('es', 'working', 0), 'Orso está picando un diff limpio...');
    assert.equal(getOrsoStatusPhrase('es', 'typing', 0), es.orsoTyping);
    assert.ok(getOrsoStatusPhrase('es', 'working', 7).startsWith('Orso '));
  });
});
