// Build-time only: bundle selected Twemoji artwork for offline Expo Go use.
const fs = require('node:fs');
const path = require('node:path');
const vocabulary = JSON.parse(fs.readFileSync('vocabulary-data.json', 'utf8'));
const scenes = {};
for (const line of fs.readFileSync('data/starter-picture-plan.txt', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const [symbols, words] = line.split('|');
  for (const word of words.trim().split(/\s+/)) scenes[word] = symbols.trim().split(' ');
}
const selected = Object.fromEntries(vocabulary.starter.map(({ word }) => {
  if (!scenes[word]) throw new Error(`Missing illustration: ${word}`);
  return [word, scenes[word]];
}));
fs.writeFileSync('data/starter-scenes.json', JSON.stringify(selected, null, 2) + '\n');
const target = 'assets/word-art';
fs.mkdirSync(target, { recursive: true });
const symbols = [...new Set(Object.values(selected).flat())].filter(x => !/^[a-z0-9]+$/i.test(x));
const code = symbol => [...symbol].filter(x => x.codePointAt(0) !== 0xfe0f).map(x => x.codePointAt(0).toString(16)).join('-');
async function main() {
  const errors = [];
  if (process.argv.includes('--download')) {
    const queue = [...symbols];
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (queue.length) {
        const symbol = queue.shift();
        const filename = path.join(target, `${code(symbol)}.svg`);
        if (fs.existsSync(filename)) continue;
        try {
          const response = await fetch(`https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/${code(symbol)}.svg`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const svg = await response.text();
          if (!svg.includes('<svg')) throw new Error('Not SVG');
          fs.writeFileSync(filename, svg);
        } catch (error) { errors.push(`${symbol}: ${error.message}`); }
      }
    }));
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const artwork = Object.fromEntries(symbols.map(symbol => [symbol, fs.readFileSync(path.join(target, `${code(symbol)}.svg`), 'utf8')]));
  fs.writeFileSync('data/starter-artwork.json', JSON.stringify(artwork) + '\n');
  console.log(`Illustrations: ${Object.keys(selected).length} words, ${symbols.length} vector assets.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
