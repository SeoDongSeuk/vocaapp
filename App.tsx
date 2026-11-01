import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AdMobBanner from './components/AdMobBanner';
import HomeCardPager from './components/HomeCardPager';
import ReminderSettingsScreen from './components/ReminderSettingsScreen';
import { WORD_LEVEL, wordsForLevel, type LevelId, type Word } from './vocabulary';

type Screen = 'splash' | 'welcome' | 'home' | 'study' | 'studyResult' | 'countdown' | 'playing' | 'result' | 'reminders';
type Question = { answer: Word; choices: Word[] };
type WordCycle = { order: Word[]; cursor: number; lastWord: string | null };

const ROUND_SECONDS = 60;
const STUDY_SESSION_SIZE = 10;
const WELCOME_COMPLETED_KEY = 'wordrush.welcome.completed';
const LEVELS: { id: LevelId; title: string; english: string; description: string }[] = [
  { id: 'beginner', title: '초급', english: 'BEGINNER', description: '초등학생을 위한 생활 기초 단어예요.' },
  { id: 'intermediate', title: '중급', english: 'INTERMEDIATE', description: '중·고등학생 수준의 학교와 독해 단어예요.' },
  { id: 'advanced', title: '고급', english: 'ADVANCED', description: '대학 강의와 학술 글에서 쓰는 단어예요.' },
  { id: 'upperAdvanced', title: '최상급', english: 'EXPERT', description: '고급을 넘어 원어민 수준에 가까운 심화 어휘예요.' },
  { id: 'master', title: '마스터', english: 'MASTER', description: '성인과 원어민 수준의 섬세한 어휘예요.' },
];

const LEVEL_COLORS: Record<LevelId, string> = {
  starter: '#438A72',
  beginner: '#6E5AE6',
  intermediate: '#347EAE',
  advanced: '#C76A43',
  upperAdvanced: '#8B5AB8',
  master: '#292440',
};

const LEVEL_TINTS: Record<LevelId, string> = {
  starter: '#E5F4EF',
  beginner: '#ECE9FF',
  intermediate: '#E5F2F8',
  advanced: '#FFF0E8',
  upperAdvanced: '#F1EAF7',
  master: '#ECEAF1',
};

const COLORS = {
  ink: '#24213A',
  muted: '#89869D',
  purple: '#6E5AE6',
  purpleDark: '#5745CB',
  lavender: '#ECE9FF',
  canvas: '#F7F6FB',
  line: '#EAE8F1',
  green: '#21845A',
  orange: '#C76A43',
  white: '#FFFFFF',
};

const LETTERS = ['A', 'B', 'C', 'D'];

function shuffle<T,>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createWordCycle(words: Word[]): WordCycle {
  return { order: shuffle(words), cursor: 0, lastWord: null };
}

function takeCycleWords(cycle: WordCycle, words: Word[], count: number): Word[] {
  const taken: Word[] = [];

  while (taken.length < count) {
    if (cycle.cursor >= cycle.order.length) {
      cycle.order = shuffle(words);
      cycle.cursor = 0;

      const avoid = new Set(taken.map((word) => word.word));
      if (cycle.lastWord) avoid.add(cycle.lastWord);
      const prefixLength = Math.min(count - taken.length, cycle.order.length);
      for (let index = 0; index < prefixLength; index += 1) {
        if (!avoid.has(cycle.order[index].word)) continue;
        const replacementIndex = cycle.order.findIndex(
          (word, candidateIndex) => candidateIndex >= prefixLength && !avoid.has(word.word),
        );
        if (replacementIndex >= 0) {
          [cycle.order[index], cycle.order[replacementIndex]] = [cycle.order[replacementIndex], cycle.order[index]];
        }
      }
    }

    const nextWord = cycle.order[cycle.cursor];
    cycle.cursor += 1;
    if (taken.some((word) => word.word === nextWord.word)) continue;
    taken.push(nextWord);
    cycle.lastWord = nextWord.word;
  }

  return taken;
}

function createQuestion(answer: Word, levelWords: Word[]): Question {
  const distractors = shuffle(levelWords.filter((item) => item.word !== answer.word && item.meaning !== answer.meaning))
    .slice(0, 3);
  return { answer, choices: shuffle([answer, ...distractors]) };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [selectedLevel, setSelectedLevel] = useState<LevelId>('beginner');
  const [correct, setCorrect] = useState(0);
  const [incorrect, setIncorrect] = useState(0);
  const [bestScores, setBestScores] = useState<Record<LevelId, number>>({
    starter: 0,
    beginner: 0,
    intermediate: 0,
    advanced: 0,
    upperAdvanced: 0,
    master: 0,
  });
  const [question, setQuestion] = useState<Question>(() => {
    const initialWords = wordsForLevel('beginner');
    return createQuestion(initialWords[0], initialWords);
  });
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [countdown, setCountdown] = useState(3);
  const [selected, setSelected] = useState<number | null>(null);
  const [roundKey, setRoundKey] = useState(0);
  const [studyWords, setStudyWords] = useState<Word[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [studyRevealed, setStudyRevealed] = useState(false);
  const [studyKnown, setStudyKnown] = useState<Word[]>([]);
  const [studyMissed, setStudyMissed] = useState<Word[]>([]);
  const [reviewWords, setReviewWords] = useState<Word[]>([]);
  const wordCyclesRef = useRef<Record<LevelId, WordCycle> | null>(null);
  if (wordCyclesRef.current === null) {
    wordCyclesRef.current = {
      starter: createWordCycle(wordsForLevel('starter')),
      beginner: createWordCycle(wordsForLevel('beginner')),
      intermediate: createWordCycle(wordsForLevel('intermediate')),
      advanced: createWordCycle(wordsForLevel('advanced')),
      upperAdvanced: createWordCycle(wordsForLevel('upperAdvanced')),
      master: createWordCycle(wordsForLevel('master')),
    };
  }
  const correctRef = useRef(0);
  const incorrectRef = useRef(0);
  const activeLevel = LEVELS.find((level) => level.id === selectedLevel) ?? LEVELS[0];
  const bestScore = bestScores[selectedLevel];
  const activeReviewWords = reviewWords.filter((word) => WORD_LEVEL[word.word] === selectedLevel);

  const startChallenge = (level: LevelId = selectedLevel) => {
    setSelectedLevel(level);
    correctRef.current = 0;
    incorrectRef.current = 0;
    setCorrect(0);
    setIncorrect(0);
    setQuestion(createQuestion(
      takeCycleWords(wordCyclesRef.current![level], wordsForLevel(level), 1)[0],
      wordsForLevel(level),
    ));
    setRoundKey((value) => value + 1);
    setSelected(null);
    setSeconds(ROUND_SECONDS);
    setCountdown(3);
    setScreen('countdown');
  };

  const startStudy = (reviewOnly = false, level: LevelId = selectedLevel) => {
    setSelectedLevel(level);
    const levelWords = wordsForLevel(level);
    const wordsToReview = reviewWords.filter((word) => WORD_LEVEL[word.word] === level);
    const nextWords = reviewOnly && wordsToReview.length > 0
      ? shuffle(wordsToReview)
      : takeCycleWords(wordCyclesRef.current![level], levelWords, STUDY_SESSION_SIZE);
    setStudyWords(nextWords);
    setStudyIndex(0);
    setStudyRevealed(false);
    setStudyKnown([]);
    setStudyMissed([]);
    setScreen('study');
  };

  const completeWelcome = async () => {
    try {
      await AsyncStorage.setItem(WELCOME_COMPLETED_KEY, 'true');
    } catch (error) {
      console.warn('Could not save welcome screen status:', error);
    }
    setScreen('home');
  };

  const markStudyWord = (remembered: boolean) => {
    const currentWord = studyWords[studyIndex];
    if (!currentWord) return;

    if (remembered) {
      setStudyKnown((current) => [...current, currentWord]);
      setReviewWords((current) => current.filter((word) => word.word !== currentWord.word));
    } else {
      setStudyMissed((current) => [...current, currentWord]);
      setReviewWords((current) => [
        ...current.filter((word) => word.word !== currentWord.word),
        currentWord,
      ]);
    }

    if (studyIndex + 1 >= studyWords.length) {
      setScreen('studyResult');
    } else {
      setStudyIndex((current) => current + 1);
      setStudyRevealed(false);
    }
  };

  useEffect(() => {
    if (screen !== 'countdown') return;
    const countdownStartedAt = Date.now();
    const timer = setInterval(() => {
      const next = 3 - Math.floor((Date.now() - countdownStartedAt) / 1000);
      if (next <= 0) {
        clearInterval(timer);
        setSeconds(ROUND_SECONDS);
        setScreen('playing');
      } else {
        setCountdown(next);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [screen, roundKey]);

  useEffect(() => {
    if (screen !== 'playing') return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const left = Math.max(0, ROUND_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
      setSeconds(left);
      if (left === 0) {
        clearInterval(timer);
        setSelected(null);
        setScreen('result');
      }
    }, 150);
    return () => clearInterval(timer);
  }, [screen, roundKey]);

  useEffect(() => {
    if (selected === null || screen !== 'playing') return;
    const nextQuestion = setTimeout(() => {
      setSelected(null);
      const levelWords = wordsForLevel(selectedLevel);
      setQuestion(createQuestion(
        takeCycleWords(wordCyclesRef.current![selectedLevel], levelWords, 1)[0],
        levelWords,
      ));
    }, 420);
    return () => clearTimeout(nextQuestion);
  }, [selected, screen, selectedLevel]);

  const answerQuestion = (choice: Word) => {
    if (selected !== null || screen !== 'playing') return;
    const isCorrect = choice.word === question.answer.word;
    setSelected(question.choices.findIndex((item) => item.word === choice.word));
    if (isCorrect) {
      correctRef.current += 1;
      setCorrect(correctRef.current);
      setBestScores((current) => ({
        ...current,
        [selectedLevel]: Math.max(current[selectedLevel], correctRef.current),
      }));
    } else {
      incorrectRef.current += 1;
      setIncorrect(incorrectRef.current);
    }
  };

  const answered = correct + incorrect;
  const accuracy = answered === 0 ? 0 : Math.round((correct / answered) * 100);

  useEffect(() => {
    if (screen !== 'splash') return;
    let isMounted = true;
    const timer = setTimeout(() => {
      AsyncStorage.getItem(WELCOME_COMPLETED_KEY)
        .then((hasCompletedWelcome) => {
          if (isMounted) setScreen(hasCompletedWelcome === 'true' ? 'home' : 'welcome');
        })
        .catch((error) => {
          console.warn('Could not read welcome screen status:', error);
          if (isMounted) setScreen('welcome');
        });
    }, 1100);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [screen]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="dark" />
      {screen === 'splash' && (
        <View style={styles.launchSplash}>
          <View style={styles.launchSplashMark}><Text style={styles.launchSplashMarkText}>W</Text></View>
          <Text style={styles.launchSplashName}>WORD <Text style={styles.launchSplashAccent}>CHALLENGE</Text></Text>
          <Text style={styles.launchSplashTagline}>영단어를 차근차근 배워요</Text>
          <View style={styles.launchSplashDots}>
            <View style={styles.launchSplashDot} />
            <View style={[styles.launchSplashDot, styles.launchSplashDotAccent]} />
            <View style={[styles.launchSplashDot, styles.launchSplashDotGreen]} />
          </View>
        </View>
      )}
      {screen === 'welcome' && (
        <ScrollView contentContainerStyle={styles.welcomeContent} showsVerticalScrollIndicator={false}>
          <View style={styles.welcomeTopRow}>
            <View style={styles.brand}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>W</Text></View>
              <Text style={styles.brandName}>WORD <Text style={styles.brandNameAccent}>CHALLENGE</Text></Text>
            </View>
            <View style={styles.welcomeLanguage}><Text style={styles.welcomeLanguageText}>EN · KO</Text></View>
          </View>

          <View style={styles.welcomeCopyBlock}>
            <View style={styles.eyebrow}><View style={styles.eyebrowDot} /><Text style={styles.eyebrowText}>YOUR WORD JOURNEY</Text></View>
            <Text style={styles.welcomeTitle}>영단어 공부,{ '\n' }<Text style={styles.heroTitleAccent}>오늘부터 가볍게.</Text></Text>
            <Text style={styles.welcomeSubtitle}>매일 조금씩 익히고, 퀴즈로 확인하며{ '\n' }내 어휘를 차곡차곡 쌓아보세요.</Text>
          </View>

          <View style={styles.welcomeArtwork}>
            <View style={styles.artworkGlow} />
            <View style={[styles.artworkSpark, styles.artworkSparkLeft]}><Text style={styles.artworkSparkText}>✦</Text></View>
            <View style={[styles.artworkSpark, styles.artworkSparkRight]}><Text style={styles.artworkSparkText}>✧</Text></View>
            <View style={styles.artworkWordCard}>
              <View style={styles.artworkCardTop}>
                <Text style={styles.artworkCardLabel}>TODAY’S WORD</Text>
                <View style={styles.artworkCardMark}><Text style={styles.artworkCardMarkText}>Aa</Text></View>
              </View>
              <Text style={styles.artworkWord}>curious</Text>
              <View style={styles.artworkWordDivider} />
              <Text style={styles.artworkMeaning}>호기심 많은</Text>
              <Text style={styles.artworkExample}>She is curious about space.</Text>
            </View>
            <View style={styles.artworkBadge}><Text style={styles.artworkBadgeIcon}>✓</Text><Text style={styles.artworkBadgeText}>하루 10단어</Text></View>
          </View>

          <View style={styles.welcomeFeatures}>
            <View style={styles.welcomeFeature}><View style={styles.welcomeFeatureDot} /><Text style={styles.welcomeFeatureText}>카드로 익히기</Text></View>
            <View style={styles.welcomeFeatureDivider} />
            <View style={styles.welcomeFeature}><View style={[styles.welcomeFeatureDot, styles.welcomeFeatureDotOrange]} /><Text style={styles.welcomeFeatureText}>퀴즈로 확인</Text></View>
            <View style={styles.welcomeFeatureDivider} />
            <View style={styles.welcomeFeature}><View style={[styles.welcomeFeatureDot, styles.welcomeFeatureDotGreen]} /><Text style={styles.welcomeFeatureText}>헷갈린 단어 복습</Text></View>
          </View>

          <Pressable style={({ pressed }) => [styles.welcomeButton, pressed && styles.pressed]} onPress={() => void completeWelcome()}>
            <Text style={styles.welcomeButtonText}>시작하기</Text>
            <Text style={styles.welcomeButtonArrow}>→</Text>
          </Pressable>
          <Text style={styles.welcomeFootnote}>나만의 속도로 즐겁게 영어 단어를 배워요</Text>
        </ScrollView>
      )}

      {screen === 'home' && (
        <View style={styles.homeScreen}>
          <View style={styles.homePagerHeader}><Header onReminder={() => setScreen('reminders')} /></View>
          <HomeCardPager>
          <ScrollView contentContainerStyle={styles.homeContent} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View style={styles.levelCard}>
            <View style={styles.levelCardTop}>
              <View>
                <Text style={styles.levelEyebrow}>CHOOSE YOUR LEVEL</Text>
                <Text style={styles.levelTitle}>나의 학습 단계</Text>
              </View>
            </View>
            <Text style={styles.levelCycleHint}>학습·퀴즈 단어를 모두 본 뒤 순서를 섞어 다시 만나요.</Text>
            <View style={styles.levelOptions}>
              {LEVELS.map((level, index) => {
                const isActive = selectedLevel === level.id;
                return (
                  <View key={level.id} style={styles.levelOptionItem}>
                    <View
                      style={[
                        styles.levelOption,
                        {
                          borderColor: isActive ? LEVEL_COLORS[level.id] : '#ECEAF2',
                          backgroundColor: isActive ? LEVEL_TINTS[level.id] : '#FBFAFE',
                        },
                      ]}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        onPress={() => setSelectedLevel(level.id)}
                        style={({ pressed }) => [styles.levelOptionInfo, pressed && styles.pressed]}
                      >
                        <View style={[styles.levelOptionNumberBadge, { backgroundColor: isActive ? LEVEL_COLORS[level.id] : LEVEL_TINTS[level.id] }]}>
                          <Text style={[styles.levelOptionNumber, { color: isActive ? COLORS.white : LEVEL_COLORS[level.id] }]}>0{index + 1}</Text>
                        </View>
                        <View style={styles.levelOptionCopy}>
                          <Text style={styles.levelOptionText}>{level.title}</Text>
                          <Text style={styles.levelOptionEnglish}>{level.english}</Text>
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => startStudy(false, level.id)}
                        style={({ pressed }) => [
                          styles.levelStudyButton,
                          {
                            backgroundColor: isActive ? LEVEL_COLORS[level.id] : COLORS.white,
                            borderColor: LEVEL_COLORS[level.id],
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.levelStudyButtonText, { color: isActive ? COLORS.white : LEVEL_COLORS[level.id] }]}>학습하기</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => startChallenge(level.id)}
                        style={({ pressed }) => [styles.levelQuizButton, { backgroundColor: LEVEL_COLORS[level.id] }, pressed && styles.pressed]}
                      >
                        <Text style={styles.levelQuizButtonText}>1분 퀴즈</Text>
                      </Pressable>
                    </View>
                    <View style={styles.levelOptionRecord}>
                      <Text style={styles.levelOptionRecordLabel}>1분 퀴즈 최고 기록</Text>
                      <Text style={[styles.levelOptionRecordScore, { color: LEVEL_COLORS[level.id] }]}>
                        {bestScores[level.id]}<Text style={styles.levelOptionRecordUnit}>개</Text>
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={styles.levelDescriptionRow}>
              <View style={[styles.levelDescriptionDot, { backgroundColor: LEVEL_COLORS[selectedLevel] }]} />
              <Text style={styles.levelDescription}>{activeLevel.description}</Text>
            </View>
            </View>

            {activeReviewWords.length > 0 && (
              <Pressable style={styles.reviewLink} onPress={() => startStudy(true)}>
                <Text style={styles.reviewLinkText}>{activeLevel.title} 복습 단어 {activeReviewWords.length}개 다시 학습하기</Text>
                <Text style={styles.reviewLinkArrow}>↗</Text>
              </Pressable>
            )}
            <Text style={styles.homeFootnote}>원하는 단계에서 학습이나 1분 퀴즈를 시작해 보세요</Text>
          </ScrollView>
          </HomeCardPager>
          <AdMobBanner />
        </View>
      )}

      {screen === 'study' && (
        <SafeAreaView edges={['bottom']} style={styles.studyContent}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>W</Text></View>
              <Text style={styles.brandName}>WORD <Text style={styles.brandNameAccent}>CHALLENGE</Text></Text>
            </View>
            <Pressable onPress={() => setScreen('home')} hitSlop={10}><Text style={styles.exitStudyText}>나가기</Text></Pressable>
          </View>
          <View style={styles.studyProgressHeader}>
            <View>
              <Text style={styles.studyEyebrow}>WORD CARDS</Text>
              <Text style={styles.studyProgressTitle}>{activeLevel.title} 단어 학습</Text>
            </View>
            <Text style={styles.studyProgressCount}>{studyIndex + 1}<Text style={styles.studyProgressTotal}> / {studyWords.length}</Text></Text>
          </View>
          <View style={styles.studyProgressTrack}>
            <View style={[styles.studyProgressFill, { width: `${((studyIndex + 1) / Math.max(studyWords.length, 1)) * 100}%` }]} />
          </View>
          {studyWords[studyIndex] && (
            <ScrollView style={[styles.flashcard, studyRevealed && styles.flashcardOpen]} contentContainerStyle={styles.flashcardContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.flashcardWord} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{studyWords[studyIndex].word}</Text>
              <View style={styles.flashcardDivider} />
              {studyRevealed ? (
                <>
                  <Text style={styles.flashcardMeaning}>{studyWords[studyIndex].meaning}</Text>
                  {studyWords[studyIndex].example ? (
                    <Text style={styles.flashcardExample}>{studyWords[studyIndex].example}</Text>
                  ) : null}
                </>
              ) : (
                <Pressable style={styles.revealButton} onPress={() => setStudyRevealed(true)}>
                  <Text style={styles.revealButtonText}>탭해서 뜻 확인하기</Text>
                  <Text style={styles.revealButtonIcon}>↓</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
          {studyRevealed ? (
            <View style={styles.studyActions}>
              <Pressable style={({ pressed }) => [styles.studyAgainButton, pressed && styles.pressed]} onPress={() => markStudyWord(false)}>
                <Text style={styles.studyAgainEmoji}>↻</Text>
                <Text style={styles.studyAgainText}>다시 볼게요</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.studyKnownButton, pressed && styles.pressed]} onPress={() => markStudyWord(true)}>
                <Text style={styles.studyKnownText}>외웠어요</Text>
                <Text style={styles.studyKnownCheck}>✓</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.studyHint}>뜻을 떠올려 본 뒤 카드를 눌러 확인해요</Text>
          )}
        </SafeAreaView>
      )}

      {screen === 'reminders' && <ReminderSettingsScreen onBack={() => setScreen('home')} />}


      {screen === 'studyResult' && (
        <ScrollView contentContainerStyle={styles.studyResultContent} showsVerticalScrollIndicator={false}>
          <Header />
          <View style={styles.studyResultIcon}><Text style={styles.studyResultIconText}>✓</Text></View>
          <Text style={styles.resultEyebrow}>STUDY COMPLETE</Text>
          <Text style={styles.studyResultTitle}>{activeLevel.title} 학습 완료!</Text>
          <Text style={styles.resultSubtitle}>단어를 하나씩 익히는 좋은 습관을 만들었어요.</Text>
          <View style={styles.studySummaryCard}>
            <View style={styles.studySummaryMain}>
              <Text style={styles.studySummaryValue}>{studyWords.length}</Text>
              <Text style={styles.studySummaryLabel}>학습한 단어</Text>
            </View>
            <View style={styles.studySummaryDivider} />
            <View style={styles.studySummaryRow}>
              <View style={styles.studySummaryItem}>
                <Text style={styles.studySummaryKnown}>{studyKnown.length}</Text>
                <Text style={styles.studySummaryCaption}>기억했어요</Text>
              </View>
              <View style={styles.studySummaryItem}>
                <Text style={styles.studySummaryReview}>{studyMissed.length}</Text>
                <Text style={styles.studySummaryCaption}>복습할게요</Text>
              </View>
            </View>
          </View>
          {studyMissed.length > 0 && (
            <Pressable style={({ pressed }) => [styles.primaryButton, styles.reviewAgainButton, pressed && styles.pressed]} onPress={() => startStudy(true)}>
              <Text style={styles.primaryButtonText}>헷갈린 단어 복습하기</Text><Text style={styles.buttonArrow}>↻</Text>
            </Pressable>
          )}
          <Pressable style={({ pressed }) => [styles.primaryButton, studyMissed.length > 0 && styles.studySecondaryButton, pressed && styles.pressed]} onPress={() => startStudy()}>
            <Text style={[styles.primaryButtonText, studyMissed.length > 0 && styles.studySecondaryButtonText]}>새 단어 10개 학습하기</Text><Text style={[styles.buttonArrow, studyMissed.length > 0 && styles.studySecondaryArrow]}>→</Text>
          </Pressable>
          <Pressable style={styles.textButton} onPress={() => setScreen('home')}><Text style={styles.textButtonLabel}>홈으로</Text></Pressable>
        </ScrollView>
      )}

      {(screen === 'countdown' || screen === 'playing') && (
        <View style={styles.gameContent}>
          <Header trailing={`${activeLevel.english} CHALLENGE`} />
          <View style={styles.soloScoreBar}>
            <View style={styles.soloAvatar}><Text style={styles.soloAvatarText}>나</Text></View>
            <View style={styles.soloScoreCopy}>
              <Text style={styles.soloScoreTitle}>나의 점수</Text>
              <Text style={styles.soloScoreSubtitle}>{activeLevel.title} 최고 기록 {bestScore}개</Text>
            </View>
            <Text style={styles.soloScoreValue}>{correct}</Text>
          </View>
          {screen === 'countdown' ? (
            <View style={styles.countdownPanel}>
              <Text style={styles.countdownEyebrow}>나의 기록에 도전해요</Text>
              <Text style={styles.countdownNumber}>{countdown}</Text>
              <Text style={styles.countdownHint}>준비되면 바로 시작해요</Text>
            </View>
          ) : (
            <>
              <View style={styles.timerPanel}>
                <View>
                  <Text style={styles.timerLabel}>남은 시간</Text>
                  <Text style={[styles.timerValue, seconds <= 10 && styles.timerUrgent]}>
                    00:{String(seconds).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.timerRight}>
                  <Text style={styles.timerRoundLabel}>정답</Text>
                  <Text style={styles.timerScore}>{correct}<Text style={styles.timerScoreUnit}>개</Text></Text>
                </View>
                <View style={styles.timerTrack}><View style={[styles.timerFill, { width: `${(seconds / ROUND_SECONDS) * 100}%` }]} /></View>
              </View>
              <View style={styles.questionBlock}>
                <Text style={styles.questionEyebrow}>{activeLevel.title} · 뜻이 같은 단어를 골라요</Text>
                <Text style={styles.questionWord}>{question.answer.word}</Text>
                {question.answer.example ? <Text style={styles.exampleText}>{question.answer.example}</Text> : null}
              </View>
              <View style={styles.options}>
                {question.choices.map((choice, index) => {
                  const isSelected = selected === index;
                  const isAnswer = choice.word === question.answer.word;
                  const showCorrect = selected !== null && isAnswer;
                  const showWrong = selected !== null && isSelected && !isAnswer;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={`${question.answer.word}-${choice.word}`}
                      onPress={() => answerQuestion(choice)}
                      style={({ pressed }) => [
                        styles.option,
                        pressed && selected === null && styles.optionPressed,
                        showCorrect && styles.optionCorrect,
                        showWrong && styles.optionWrong,
                      ]}
                    >
                      <View style={[styles.optionLetter, showCorrect && styles.optionLetterCorrect, showWrong && styles.optionLetterWrong]}>
                        <Text style={[styles.optionLetterText, (showCorrect || showWrong) && styles.optionLetterTextActive]}>{LETTERS[index]}</Text>
                      </View>
                      <Text style={styles.optionText}>{choice.meaning}</Text>
                      {showCorrect && <Text style={styles.optionCheck}>✓</Text>}
                      {showWrong && <Text style={[styles.optionCheck, styles.optionCheckWrong]}>×</Text>}
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.gameFooter}>
                <Text style={styles.footerHint}>빠르게 골라보세요</Text>
                <Text style={styles.footerAnswered}>풀이 {answered}개</Text>
              </View>
            </>
          )}
        </View>
      )}

      {screen === 'result' && (
        <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <Header />
          <View style={styles.trophy}><Text style={styles.trophyText}>✦</Text></View>
          <Text style={styles.resultEyebrow}>1 MINUTE COMPLETE</Text>
          <Text style={styles.winnerTitle}>오늘의 학습 결과</Text>
          <Text style={styles.resultSubtitle}>집중해서 풀었어요. 다음 기록에도 도전해볼까요?</Text>
          <View style={styles.soloResultCard}>
            <View style={styles.mainResult}>
              <Text style={styles.mainResultValue}>{correct}</Text>
              <Text style={styles.mainResultLabel}>정답</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.miniResults}>
              <View style={styles.miniResultItem}>
                <Text style={styles.miniResultValue}>{incorrect}</Text>
                <Text style={styles.miniResultLabel}>오답</Text>
              </View>
              <View style={styles.miniResultItem}>
                <Text style={styles.miniResultValue}>{accuracy}%</Text>
                <Text style={styles.miniResultLabel}>정확도</Text>
              </View>
              <View style={styles.miniResultItem}>
                <Text style={styles.miniResultValue}>{answered}</Text>
                <Text style={styles.miniResultLabel}>풀이</Text>
              </View>
            </View>
            <View style={styles.bestRecordPill}>
              <Text style={styles.bestRecordText}>{activeLevel.title} 최고 기록 · {bestScore}개</Text>
            </View>
          </View>
          <View style={styles.resultButtons}>
            <Pressable style={({ pressed }) => [styles.primaryButton, styles.resultPrimaryButton, pressed && styles.pressed]} onPress={() => startChallenge()}>
              <Text style={styles.primaryButtonText}>다시 도전하기</Text><Text style={styles.buttonArrow}>↻</Text>
            </Pressable>
            <Pressable style={styles.textButton} onPress={() => setScreen('home')}>
              <Text style={styles.textButtonLabel}>홈으로</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
      </View>
    </SafeAreaProvider>
  );
}

function Header({ trailing, onReminder }: { trailing?: string; onReminder?: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <View style={styles.brandMark}><Text style={styles.brandMarkText}>W</Text></View>
        <Text style={styles.brandName}>WORD <Text style={styles.brandNameAccent}>CHALLENGE</Text></Text>
      </View>
      {trailing ? <Text style={styles.headerTrailing}>{trailing}</Text> : onReminder ? <Pressable accessibilityRole="button" onPress={onReminder} style={styles.reminderLink}><Text style={styles.reminderLinkText}>학습 알림 설정</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  reminderLink: { paddingVertical: 10, paddingHorizontal: 10, backgroundColor: '#ECE9FF', borderRadius: 20 },
  reminderLinkText: { color: '#5745CB', fontSize: 12, fontWeight: '700' },
  homePagerHeader: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 54 },
  root: { flex: 1, backgroundColor: COLORS.canvas },
  homeScreen: { flex: 1 },
  welcomeContent: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 22, paddingTop: 54, paddingBottom: 25 },
  welcomeTopRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  welcomeLanguage: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: COLORS.white },
  welcomeLanguageText: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  welcomeCopyBlock: { marginTop: 39 },
  welcomeTitle: { color: COLORS.ink, fontSize: 32, lineHeight: 40, fontWeight: '900', letterSpacing: -1.2 },
  welcomeSubtitle: { marginTop: 11, color: COLORS.muted, fontSize: 12, lineHeight: 19, fontWeight: '500' },
  welcomeArtwork: { height: 238, marginTop: 22, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#EFEDFF' },
  artworkGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: '#E2DDFF', top: 14, left: '50%', marginLeft: -105 },
  artworkSpark: { position: 'absolute', zIndex: 2, width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white },
  artworkSparkLeft: { top: 38, left: 28 },
  artworkSparkRight: { top: 50, right: 27 },
  artworkSparkText: { color: '#D29A31', fontSize: 17, fontWeight: '900' },
  artworkWordCard: { width: '78%', maxWidth: 290, paddingHorizontal: 17, paddingTop: 14, paddingBottom: 15, borderRadius: 18, backgroundColor: COLORS.white, shadowColor: '#33265D', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  artworkCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  artworkCardLabel: { color: COLORS.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  artworkCardMark: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lavender },
  artworkCardMarkText: { color: COLORS.purple, fontSize: 10, fontWeight: '900' },
  artworkWord: { marginTop: 10, color: COLORS.ink, fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -0.5 },
  artworkWordDivider: { width: 26, height: 2, borderRadius: 2, backgroundColor: COLORS.lavender, marginTop: 9, marginBottom: 8 },
  artworkMeaning: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '800' },
  artworkExample: { color: COLORS.muted, fontSize: 9, marginTop: 4 },
  artworkBadge: { position: 'absolute', right: 18, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: COLORS.white },
  artworkBadgeIcon: { color: COLORS.green, fontSize: 10, fontWeight: '900' },
  artworkBadgeText: { color: COLORS.ink, fontSize: 9, fontWeight: '800' },
  welcomeFeatures: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingHorizontal: 2 },
  welcomeFeature: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  welcomeFeatureDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.purple },
  welcomeFeatureDotOrange: { backgroundColor: '#E58A63' },
  welcomeFeatureDotGreen: { backgroundColor: '#42B77A' },
  welcomeFeatureText: { color: COLORS.muted, fontSize: 8, fontWeight: '700' },
  welcomeFeatureDivider: { width: 1, height: 14, backgroundColor: '#E6E3EF' },
  welcomeButton: { height: 56, marginTop: 23, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purple, shadowColor: COLORS.purple, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  welcomeButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  welcomeButtonArrow: { position: 'absolute', right: 20, color: COLORS.white, fontSize: 21, fontWeight: '500' },
  welcomeFootnote: { textAlign: 'center', color: '#A5A2B1', fontSize: 10, marginTop: 12, fontWeight: '600' },
  launchSplash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.canvas },
  launchSplashMark: { width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purple, shadowColor: COLORS.purple, shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 5 },
  launchSplashMarkText: { color: COLORS.white, fontSize: 51, lineHeight: 60, fontWeight: '900', fontStyle: 'italic' },
  launchSplashName: { color: COLORS.ink, fontSize: 26, fontWeight: '900', letterSpacing: 1.8, marginTop: 22 },
  launchSplashAccent: { color: COLORS.purple },
  launchSplashTagline: { color: COLORS.muted, fontSize: 13, fontWeight: '600', marginTop: 9 },
  launchSplashDots: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 36 },
  launchSplashDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#CFCBDF' },
  launchSplashDotAccent: { backgroundColor: COLORS.purple },
  launchSplashDotGreen: { backgroundColor: '#42B77A' },
  homeContent: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 22, paddingTop: 0, paddingBottom: 26 },
  gameContent: { width: '100%', maxWidth: 520, alignSelf: 'center', flex: 1, paddingHorizontal: 22, paddingTop: 54, paddingBottom: 22 },
  header: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purple },
  brandMarkText: { fontSize: 16, fontWeight: '900', color: COLORS.white, fontStyle: 'italic' },
  brandName: { color: COLORS.ink, fontSize: 14, fontWeight: '900', letterSpacing: 1.1 },
  brandNameAccent: { color: COLORS.purple },
  headerTrailing: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 15 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E58A63' },
  eyebrowText: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heroTitleAccent: { color: COLORS.purple },
  levelCard: { marginTop: 20, marginBottom: 15, padding: 15, borderRadius: 21, backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#DDD8F1', shadowColor: '#33265D', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  levelCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  levelEyebrow: { color: COLORS.purple, fontSize: 8, fontWeight: '900', letterSpacing: 1.4, marginBottom: 4 },
  levelTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '900' },
  levelCycleHint: { color: COLORS.muted, fontSize: 10, lineHeight: 14, marginTop: -5, marginBottom: 10 },
  levelOptions: { flexDirection: 'column', gap: 8 },
  levelOptionItem: { gap: 2 },
  levelOption: { width: '100%', minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, borderRadius: 14, borderWidth: 1.5 },
  levelOptionInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  levelOptionNumberBadge: { width: 31, height: 31, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  levelOptionNumber: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  levelOptionCopy: { flex: 1, marginLeft: 8 },
  levelOptionText: { color: COLORS.ink, fontSize: 13, fontWeight: '900' },
  levelOptionEnglish: { color: COLORS.muted, fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
  levelStudyButton: { width: 74, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1.5 },
  levelStudyButtonText: { fontSize: 10, fontWeight: '900' },
  levelQuizButton: { width: 76, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  levelQuizButtonText: { color: COLORS.white, fontSize: 9, fontWeight: '900' },
  levelOptionRecord: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 2 },
  levelOptionRecordLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  levelOptionRecordScore: { fontSize: 11, fontWeight: '900' },
  levelOptionRecordUnit: { color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  levelDescriptionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 11, paddingHorizontal: 2 },
  levelDescriptionDot: { width: 6, height: 6, borderRadius: 3, marginRight: 7 },
  levelDescription: { flex: 1, color: COLORS.muted, fontSize: 9, fontWeight: '700' },
  reviewLink: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 5, paddingTop: 12, paddingBottom: 1 },
  reviewLinkText: { color: COLORS.purpleDark, fontSize: 10, fontWeight: '800' },
  reviewLinkArrow: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '800' },
  primaryButton: { height: 58, marginTop: 18, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.purple, shadowColor: COLORS.purple, shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '800' },
  buttonArrow: { position: 'absolute', right: 20, color: COLORS.white, fontSize: 21, fontWeight: '500' },
  homeFootnote: { textAlign: 'center', color: '#A5A2B1', fontSize: 11, marginTop: 14, fontWeight: '600' },
  soloScoreBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 17, marginTop: 21, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#F0EEF5' },
  soloAvatar: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.lavender },
  soloAvatarText: { color: COLORS.purple, fontSize: 13, fontWeight: '900' },
  soloScoreCopy: { flex: 1, marginLeft: 10 },
  soloScoreTitle: { color: COLORS.ink, fontSize: 11, fontWeight: '800' },
  soloScoreSubtitle: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  soloScoreValue: { color: COLORS.purple, fontSize: 20, fontWeight: '900' },
  timerPanel: { height: 94, marginTop: 16, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 16, borderRadius: 20, backgroundColor: '#292440', flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden' },
  timerLabel: { color: '#B9B3D1', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  timerValue: { color: COLORS.white, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: 1 },
  timerUrgent: { color: '#FFB38F' },
  timerRight: { alignItems: 'flex-end', paddingRight: 2 },
  timerRoundLabel: { color: '#B9B3D1', fontSize: 10, fontWeight: '700', marginBottom: 2 },
  timerScore: { color: '#BBAEFF', fontSize: 25, lineHeight: 34, fontWeight: '900' },
  timerScoreUnit: { color: '#C8C1E6', fontSize: 11, fontWeight: '700' },
  timerTrack: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: '#48425E' },
  timerFill: { height: 4, backgroundColor: '#9A88FF', borderRadius: 3 },
  questionBlock: { alignItems: 'center', paddingTop: 24, paddingBottom: 19 },
  questionEyebrow: { color: COLORS.muted, fontSize: 11, fontWeight: '600', marginBottom: 5 },
  questionWord: { color: COLORS.ink, fontSize: 36, fontWeight: '900', letterSpacing: -0.8 },
  exampleText: { color: '#A09DAF', fontSize: 11, marginTop: 5, textAlign: 'center' },
  options: { gap: 9 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: '#EAE8F1', backgroundColor: COLORS.white },
  optionPressed: { borderColor: '#C6BFFF', backgroundColor: '#FBFAFF' },
  optionCorrect: { backgroundColor: '#F0FBF5', borderColor: '#BCE9D0' },
  optionWrong: { backgroundColor: '#FFF6F1', borderColor: '#F4D0BC' },
  optionLetter: { width: 29, height: 29, borderRadius: 10, backgroundColor: '#F4F2F9', justifyContent: 'center', alignItems: 'center' },
  optionLetterCorrect: { backgroundColor: '#C9EFDA' },
  optionLetterWrong: { backgroundColor: '#F8DDCF' },
  optionLetterText: { color: '#8E8A9E', fontSize: 10, fontWeight: '900' },
  optionLetterTextActive: { color: COLORS.ink },
  optionText: { marginLeft: 11, flex: 1, color: COLORS.ink, fontSize: 13, fontWeight: '700' },
  optionCheck: { color: COLORS.green, fontSize: 17, fontWeight: '900', paddingRight: 3 },
  optionCheckWrong: { color: COLORS.orange },
  gameFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 },
  footerHint: { color: '#A6A3B1', fontSize: 10, fontWeight: '600' },
  footerAnswered: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  countdownPanel: { flex: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 30 },
  countdownEyebrow: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  countdownNumber: { color: COLORS.purple, fontSize: 104, lineHeight: 124, fontWeight: '900' },
  countdownHint: { color: COLORS.muted, fontSize: 12 },
  studyContent: { width: '100%', maxWidth: 520, alignSelf: 'center', flex: 1, paddingHorizontal: 22, paddingTop: 54, paddingBottom: 22 },
  exitStudyText: { color: COLORS.muted, fontSize: 12, fontWeight: '700', paddingVertical: 8, paddingLeft: 10 },
  studyProgressHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 30, marginBottom: 12 },
  studyEyebrow: { color: COLORS.purple, fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 5 },
  studyProgressTitle: { color: COLORS.ink, fontSize: 19, fontWeight: '900' },
  studyProgressCount: { color: COLORS.purple, fontSize: 19, fontWeight: '900' },
  studyProgressTotal: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  studyProgressTrack: { height: 5, backgroundColor: '#E9E6F2', borderRadius: 4, overflow: 'hidden' },
  studyProgressFill: { height: 5, backgroundColor: COLORS.purple, borderRadius: 4 },
  flashcard: { flex: 1, minHeight: 0, marginTop: 19, marginBottom: 14, borderRadius: 25, backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#F0EEF5', shadowColor: '#282041', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 2 },
  flashcardContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 20 },
  flashcardOpen: { backgroundColor: '#FDFDFF' },
  flashcardWord: { width: '100%', textAlign: 'center', marginTop: 10, color: COLORS.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  flashcardDivider: { width: 42, height: 3, marginTop: 22, marginBottom: 20, borderRadius: 2, backgroundColor: '#E9E5FB' },
  flashcardMeaning: { color: COLORS.purpleDark, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  flashcardExample: { color: COLORS.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  revealButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#F6F4FC' },
  revealButtonText: { color: COLORS.purpleDark, fontSize: 12, fontWeight: '800' },
  revealButtonIcon: { color: COLORS.purple, fontSize: 15, fontWeight: '800' },
  studyActions: { flexDirection: 'row', gap: 10 },
  studyAgainButton: { flex: 1, height: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: '#FFF4EE', borderWidth: 1, borderColor: '#F6DDCE' },
  studyAgainEmoji: { color: COLORS.orange, fontSize: 17, fontWeight: '900' },
  studyAgainText: { color: '#A75D3E', fontSize: 12, fontWeight: '800' },
  studyKnownButton: { flex: 1, height: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, backgroundColor: '#EAF8F0', borderWidth: 1, borderColor: '#CDEBD9' },
  studyKnownText: { color: COLORS.green, fontSize: 12, fontWeight: '800' },
  studyKnownCheck: { color: COLORS.green, fontSize: 15, fontWeight: '900' },
  studyHint: { color: COLORS.muted, textAlign: 'center', fontSize: 10, fontWeight: '600', paddingVertical: 18 },
  studyResultContent: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 22, paddingTop: 54, paddingBottom: 26 },
  studyResultIcon: { width: 68, height: 68, alignSelf: 'center', marginTop: 38, marginBottom: 18, borderRadius: 24, backgroundColor: '#EAF8F0', alignItems: 'center', justifyContent: 'center' },
  studyResultIconText: { color: COLORS.green, fontSize: 32, fontWeight: '900' },
  studyResultTitle: { color: COLORS.ink, textAlign: 'center', fontSize: 30, fontWeight: '900', marginTop: 8 },
  studySummaryCard: { marginTop: 27, paddingHorizontal: 18, paddingVertical: 22, backgroundColor: COLORS.white, borderRadius: 22, borderWidth: 1, borderColor: '#F0EEF5' },
  studySummaryMain: { alignItems: 'center' },
  studySummaryValue: { color: COLORS.purple, fontSize: 52, lineHeight: 60, fontWeight: '900' },
  studySummaryLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  studySummaryDivider: { height: 1, backgroundColor: COLORS.line, marginVertical: 19 },
  studySummaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  studySummaryItem: { alignItems: 'center', flex: 1 },
  studySummaryKnown: { color: COLORS.green, fontSize: 20, fontWeight: '900' },
  studySummaryReview: { color: COLORS.orange, fontSize: 20, fontWeight: '900' },
  studySummaryCaption: { color: COLORS.muted, fontSize: 10, fontWeight: '600', marginTop: 4 },
  reviewAgainButton: { marginTop: 20 },
  studySecondaryButton: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#E6E2F1', shadowOpacity: 0, elevation: 0 },
  studySecondaryButtonText: { color: COLORS.purpleDark },
  studySecondaryArrow: { color: COLORS.purpleDark },
  resultEyebrow: { textAlign: 'center', color: COLORS.purple, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  resultContent: { width: '100%', maxWidth: 520, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 22, paddingTop: 54, paddingBottom: 26 },
  trophy: { width: 68, height: 68, alignSelf: 'center', marginTop: 42, marginBottom: 18, borderRadius: 24, backgroundColor: '#FFF2D8', alignItems: 'center', justifyContent: 'center' },
  trophyText: { color: '#D29A31', fontSize: 34, fontWeight: '900' },
  winnerTitle: { color: COLORS.ink, textAlign: 'center', fontSize: 30, fontWeight: '900', marginTop: 8 },
  resultSubtitle: { color: COLORS.muted, textAlign: 'center', fontSize: 12, marginTop: 7 },
  soloResultCard: { marginTop: 27, paddingHorizontal: 18, paddingVertical: 22, backgroundColor: COLORS.white, borderRadius: 22, borderWidth: 1, borderColor: '#F0EEF5' },
  mainResult: { alignItems: 'center' },
  mainResultValue: { color: COLORS.purple, fontSize: 58, lineHeight: 64, fontWeight: '900' },
  mainResultLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  resultDivider: { height: 1, backgroundColor: COLORS.line, marginVertical: 19 },
  miniResults: { flexDirection: 'row', justifyContent: 'space-around' },
  miniResultItem: { alignItems: 'center', flex: 1 },
  miniResultValue: { color: COLORS.ink, fontSize: 18, fontWeight: '900' },
  miniResultLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '600', marginTop: 4 },
  bestRecordPill: { marginTop: 18, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.lavender },
  bestRecordText: { color: COLORS.purpleDark, fontSize: 10, fontWeight: '800' },
  resultButtons: { marginTop: 5 },
  resultPrimaryButton: { marginTop: 17 },
  textButton: { height: 45, justifyContent: 'center', alignItems: 'center' },
  textButtonLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
});

