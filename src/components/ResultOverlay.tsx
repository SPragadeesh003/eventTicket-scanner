import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { styles } from '@/src/styles/main/ScannerScreenStyles';
import { type ScanResult } from '@/src/services/ScanService';

const RESULT_DISPLAY_MS = 2500;

interface ResultOverlayProps {
  result: ScanResult;
  onDismiss: () => void;
}

export const ResultOverlay: React.FC<ResultOverlayProps> = ({
  result,
  onDismiss,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true
      }).start(() => onDismiss());
    }, RESULT_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, [opacity, onDismiss]);

  const isValid = result.status === 'valid';
  const isDup = result.status === 'duplicate';
  const isError = !isValid;

  const bgStyle = isValid
    ? styles.resultValid
    : isDup
      ? styles.resultDuplicate
      : styles.resultInvalid;

  const title = isValid
    ? 'Ticket Valid'
    : isDup
      ? 'Ticket Already\nScanned'
      : 'Invalid Ticket';

  return (
    <Animated.View style={[styles.resultOverlay, bgStyle, { opacity }]}>
      <View style={styles.resultIconWrap}>
        {isValid ? (
          <View style={styles.checkMark} />
        ) : (
          <View style={styles.crossMark}>
            <View style={styles.crossLine1} />
            <View style={styles.crossLine2} />
          </View>
        )}
      </View>
      <Text style={[styles.resultTitle, isError && styles.resultTitleWhite]}>{title}</Text>
      <Text style={[styles.resultName, isError && styles.resultNameWhite]}>{result.name}</Text>
      <Text style={[styles.resultType, isError && styles.resultTypeWhite]}>{result.ticketType}</Text>
      <Text style={[styles.resultId, isError && styles.resultIdWhite]}>#{result.ticketId}</Text>
    </Animated.View>
  );
};
