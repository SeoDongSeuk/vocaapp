const assert = require('node:assert/strict');
const { validateVocabulary } = require('./check-vocabulary.cjs');
const bank = require('../vocabulary-data.json');
const review = require('../data/vocabulary-review.json');

for (const mutate of [
  data => { data.beginner[0].word = 'Dior'; },
  data => { data.beginner[0].word = 'dior'; },
  data => { data.beginner[0].word = 'spectroscopy'; },
  data => { data.beginner[0].category = 'medicine'; },
  data => { data.beginner[0].meaning = '자라자지'; },
  data => { data.master[0] = data.beginner[0]; },
  data => { data.beginner.push(data.beginner[0]); },
]) {
  const changed = structuredClone(bank);
  mutate(changed);
  assert.throws(() => validateVocabulary(changed, review));
}
console.log('PASS: guards reject proper names, unreviewed lowercase names, specialist terms, damaged meanings, wrong levels and duplicates.');
