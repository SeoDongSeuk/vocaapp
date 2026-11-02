import vocabularyData from './vocabulary-data.json';

export type LevelId = 'beginner' | 'intermediate' | 'advanced' | 'upperAdvanced' | 'master';
export type Word = { word: string; phonetic: string; meaning: string; example?: string; cefr: string; category: 'general' };

export const LEVEL_WORDS = vocabularyData as unknown as Record<LevelId, Word[]>;

for (const level of Object.keys(LEVEL_WORDS) as LevelId[]) {
  if (LEVEL_WORDS[level].length < 30) {
    throw new Error(`${level} must contain at least 30 reviewed words.`);
  }
}

const allWords = Object.values(LEVEL_WORDS).flat();
const uniqueWords = new Set(allWords.map((word) => word.word.toLowerCase()));
if (uniqueWords.size !== allWords.length) {
  throw new Error('Vocabulary entries must be unique across levels.');
}

export const WORD_LEVEL: Record<string, LevelId> = Object.fromEntries(
  Object.entries(LEVEL_WORDS).flatMap(([level, words]) => words.map((word) => [word.word, level])),
) as Record<string, LevelId>;

export function wordsForLevel(level: LevelId): Word[] {
  const words = LEVEL_WORDS[level];
  if (Array.isArray(words) && words.length > 0) return words;

  const fallbackWords = LEVEL_WORDS.beginner;
  if (Array.isArray(fallbackWords) && fallbackWords.length > 0) return fallbackWords;

  throw new Error(`No vocabulary data is available for ${level}.`);
}
