const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(path.dirname(module.filename), '..');
const allowed = { beginner: ['A1'], intermediate: ['A2'], advanced: ['B1'], upperAdvanced: ['B2'], master: ['C1', 'C2'] };

function validateVocabulary(bank, review) {
  assert.deepEqual(Object.keys(bank).sort(), Object.keys(allowed).sort(), 'Only the five reviewed levels may ship');
  const seen = new Set();
  for (const [level, words] of Object.entries(bank)) {
    assert.equal(words.length, review.expectedCounts[level], `Reviewed count changed: ${level}`);
    assert(words.length >= 30, 'Every level must support a 30-word study session');
    for (const entry of words) {
      const { word, meaning, cefr, category } = entry;
      assert(word === 'I' || /^[a-z]+(?:[-'][a-z]+)*$/.test(word), `Proper-name or malformed spelling: ${word}`);
      assert(!seen.has(word.toLowerCase()), `Duplicate word: ${word}`);
      seen.add(word.toLowerCase());
      assert(!review.excluded[word], `Excluded item: ${word}`);
      const approved = review.entries[word];
      assert(approved, `New word needs an individual review: ${word}`);
      assert.equal(approved.status, 'accepted', `Unreviewed word: ${word}`);
      assert.equal(approved.method, 'assistant-entry-review');
      assert.equal(approved.properNoun, false, `Proper noun is not allowed: ${word}`);
      assert.equal(approved.category, 'general', `Specialist term is not allowed: ${word}`);
      assert.equal(category, 'general', `Specialist category is not allowed: ${word}`);
      assert.equal(approved.level, level, `Wrong learning level: ${word}`);
      assert(allowed[level].includes(cefr), `Wrong CEFR level: ${word}`);
      assert.equal(approved.cefr, cefr, `Unreviewed level change: ${word}`);
      assert.equal(meaning, approved.meaning, `Unreviewed meaning change: ${word}`);
      assert(/[가-힣]/.test(meaning) && meaning.trim() === meaning && meaning.length <= 100, `Malformed Korean meaning: ${word}`);
      assert(!/[\r\n\t<>\uFFFD]/.test(meaning), `Corrupted Korean meaning: ${word}`);
      assert(Array.isArray(approved.partsOfSpeech) && approved.partsOfSpeech.length, `Missing reference part of speech: ${word}`);
    }
    assert(new Set(words.map(w => w.meaning)).size >= 4, `Quiz needs distinct meanings: ${level}`);
  }
  assert.equal(seen.size, Object.keys(review.entries).length, 'Review ledger and deployed words differ');
  return seen.size;
}

if (require.main === module) {
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'vocabulary-data.json'), 'utf8'));
  const review = JSON.parse(fs.readFileSync(path.join(root, 'data/vocabulary-review.json'), 'utf8'));
  const count = validateVocabulary(bank, review);
  for (const [word, meaning] of [['apple', '사과'], ['train', '기차'], ['diet', '식단; 식이요법'], ['rubbish', '쓰레기; 헛소리']]) {
    assert.equal(Object.values(bank).flat().find(w => w.word === word)?.meaning, meaning);
  }
  for (const word of ['dior', 'dartmouth', 'spectroscopy', 'genome', 'grower']) {
    assert(!Object.values(bank).flat().some(w => w.word.toLowerCase() === word));
  }
  console.log(`PASS: ${count} reviewed general-vocabulary entries, CEFR levels, meanings, exclusions, unique spelling, and regression examples.`);
}

module.exports = { validateVocabulary };
