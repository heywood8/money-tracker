import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { Portal, Modal, Text, ActivityIndicator, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useTheme } from '../contexts/ThemeContext';
import { useImportProgress } from '../contexts/ImportProgressContext';

export default function ImportProgressModal() {
  const { colors } = useTheme();
  const { isImporting, steps, currentStep, finishImport } = useImportProgress();
  const scrollViewRef = useRef(null);
  const stepPositions = useRef({});

  const isComplete = currentStep === 'complete';

  const handleOkPress = async () => {
    // Close the modal
    finishImport();

    // Reload the app
    if (Platform.OS === 'web') {
      window.location?.reload?.();
    } else {
      try {
        await Updates.reloadAsync();
      } catch (error) {
        console.error('Failed to reload app:', error);
      }
    }
  };

  // Auto-scroll to current step when it changes
  useEffect(() => {
    if (currentStep && stepPositions.current[currentStep] !== undefined) {
      scrollViewRef.current?.scrollTo({
        y: stepPositions.current[currentStep],
        animated: true,
      });
    }
  }, [currentStep]);

  const handleStepLayout = (stepId, event) => {
    const { y } = event.nativeEvent.layout;
    stepPositions.current[stepId] = y;
  };

  const getStepLabel = (step) => {
    if (step.status === 'in_progress' && step.data) {
      // Format: "Restoring X operations..."
      switch (step.id) {
      case 'accounts':
        return `Restoring ${step.data} accounts...`;
      case 'categories':
        return `Restoring ${step.data} categories...`;
      case 'operations':
        return `Restoring ${step.data} operations...`;
      case 'budgets':
        return `Restoring ${step.data} budgets...`;
      case 'metadata':
        return `Restoring ${step.data} metadata entries...`;
      default:
        return step.label;
      }
    }

    // For completed steps with data, show the count
    if (step.status === 'completed' && step.data) {
      switch (step.id) {
      case 'format':
        return `Detected format: ${step.data}`;
      case 'accounts':
        return `Restored ${step.data} accounts`;
      case 'categories':
        return `Restored ${step.data} categories`;
      case 'operations':
        return `Restored ${step.data} operations`;
      case 'budgets':
        return `Restored ${step.data} budgets`;
      case 'metadata':
        return `Restored ${step.data} metadata entries`;
      default:
        return step.label;
      }
    }

    return step.label;
  };

  const renderStepIcon = (step) => {
    if (step.status === 'completed') {
      return (
        <Ionicons
          name="checkmark-circle"
          size={24}
          color="#4CAF50"
          style={styles.stepIcon}
        />
      );
    }

    if (step.status === 'in_progress') {
      return (
        <ActivityIndicator
          size={24}
          color={colors.primary}
          style={styles.stepIcon}
        />
      );
    }

    return (
      <View
        style={[
          styles.stepIconPlaceholder,
          { borderColor: colors.border },
        ]}
      />
    );
  };

  return (
    <Portal>
      <Modal
        visible={isImporting}
        dismissable={false}
        contentContainerStyle={[
          styles.modalContainer,
          { backgroundColor: colors.card },
        ]}
      >
        <View style={styles.header}>
          <Ionicons
            name="cloud-download"
            size={32}
            color={colors.primary}
          />
          <Text
            variant="headlineSmall"
            style={[styles.title, { color: colors.text }]}
          >
            Importing Database
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.subtitle, { color: colors.mutedText }]}
          >
            Please wait while your data is being restored...
          </Text>
        </View>

        <ScrollView
          ref={scrollViewRef}
          style={styles.stepsContainer}
          contentContainerStyle={styles.stepsContent}
        >
          {steps.map((step, index) => (
            <View
              key={step.id}
              onLayout={(event) => handleStepLayout(step.id, event)}
              style={[
                styles.stepRow,
                { borderBottomColor: colors.border },
                index === steps.length - 1 && styles.lastStepRow,
              ]}
            >
              {renderStepIcon(step)}
              <Text
                variant="bodyLarge"
                style={[
                  styles.stepLabel,
                  { color: step.status === 'pending' ? colors.mutedText : colors.text },
                  step.status === 'in_progress' && styles.stepLabelActive,
                ]}
              >
                {getStepLabel(step)}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={handleOkPress}
            disabled={!isComplete}
            style={styles.okButton}
          >
            <Text>OK</Text>
          </Button>
        </View>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    marginTop: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  lastStepRow: {
    borderBottomWidth: 0,
  },
  modalContainer: {
    borderRadius: 12,
    margin: 20,
    maxHeight: '80%',
    padding: 24,
  },
  okButton: {
    minWidth: 120,
  },
  stepIcon: {
    height: 24,
    marginRight: 12,
    width: 24,
  },
  stepIconPlaceholder: {
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    marginRight: 12,
    width: 24,
  },
  stepLabel: {
    flex: 1,
  },
  stepLabelActive: {
    fontWeight: '600',
  },
  stepRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 12,
  },
  stepsContainer: {
    maxHeight: 400,
  },
  stepsContent: {
    paddingBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  title: {
    marginBottom: 8,
    marginTop: 12,
    textAlign: 'center',
  },
});
