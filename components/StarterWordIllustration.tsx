import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import scenes from '../data/starter-scenes.json';
import artwork from '../data/starter-artwork.json';

const wordScenes: Record<string, string[]> = scenes;
const vectorArtwork: Record<string, string> = artwork;

/** Locally bundled picture clues; never makes an image search or network request. */
function StarterWordIllustration({ word }: { word: string }) {
  const symbols = wordScenes[word.toLowerCase()];
  if (!symbols) return null;
  const size = symbols.length === 1 ? 100 : symbols.length === 2 ? 70 : 54;

  return (
    <View style={styles.frame} accessible accessibilityRole="image" accessibilityLabel={`${word} 그림 힌트`}>
      <View style={styles.halo} />
      <View style={styles.dot} />
      <View style={styles.smallDot} />
      <View style={styles.scene}>
        {symbols.map((symbol, index) => vectorArtwork[symbol] ? (
          <SvgXml key={`${symbol}-${index}`} xml={vectorArtwork[symbol]} width={size} height={size} />
        ) : (
          <Text key={`${symbol}-${index}`} style={[styles.number, { fontSize: symbol.length > 2 ? 32 : 56 }]}>
            {symbol}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default memo(StarterWordIllustration);

const styles = StyleSheet.create({
  frame: { width: '100%', maxWidth: 270, height: 138, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  halo: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: '#F0EDF9' },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFD89B', top: 14, right: 26 },
  smallDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#B6DDCC', left: 30, bottom: 18 },
  scene: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  number: { color: '#5745CB', fontWeight: '900', textAlign: 'center' },
});
