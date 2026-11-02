const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const bank = require('../vocabulary-data.json');
const source = fs.readFileSync('App.tsx', 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['shuffle', 'createWordCycle', 'takeCycleWords', 'createQuestion']);
const helpers = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n');
assert.equal(helpers.includes('function createQuestion'), true);
const code = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = {};
vm.runInNewContext(code, context);
for (const [level, words] of Object.entries(bank)) {
  const cycle = context.createWordCycle(words);
  const first = context.takeCycleWords(cycle, words, words.length);
  assert.equal(new Set(first.map(w => w.word)).size, words.length, `${level}: every word appears once per cycle`);
  const nextSession = context.takeCycleWords(cycle, words, 30);
  assert.equal(new Set(nextSession.map(w => w.word)).size, 30);
  for (const answer of words) {
    const question = context.createQuestion(answer, words);
    assert.equal(question.choices.length, 4);
    assert.equal(question.choices.filter(w => w.word === answer.word).length, 1);
    assert.equal(new Set(question.choices.map(w => w.meaning)).size, 4, `${answer.word}: distinct choice labels`);
  }
}
console.log('PASS: all 4,911 words produce valid four-choice quizzes; all five banks complete unique cycles and 30-word sessions.');
