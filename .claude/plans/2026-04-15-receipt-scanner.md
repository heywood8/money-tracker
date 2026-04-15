# Receipt Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add on-device receipt scanning to the Penny app — user takes a photo of a receipt, ML Kit OCR extracts the text, a parser finds line items and their prices, then a review modal lets the user select items to create as expense operations.

**Architecture:** Entry point is a new camera FAB on `OperationsScreen`. Tapping it opens `ReceiptScannerModal` (camera capture + OCR). After OCR, `ReceiptReviewModal` shows parsed items as a checkbox list; confirming creates operations via the existing `addOperation` context action. All OCR and parsing runs fully on-device with no network calls.

**Tech Stack:** `expo-camera` (bundled in Expo SDK, camera view + capture), `@react-native-ml-kit/text-recognition` (on-device OCR, new dep, requires custom dev build via `expo-dev-client` already present), pure JS regex parser for receipt line items.

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| Create | `app/services/receiptParser.js` | Parse raw OCR text → `{ items, total }` |
| Create | `app/components/operations/ReceiptScannerModal.js` | Camera view + OCR trigger |
| Create | `app/components/operations/ReceiptReviewModal.js` | Checkbox list of items + create operations |
| Modify | `app/screens/OperationsScreen.js` | Add scan FAB + wire modals |
| Modify | `app.config.js` | Add expo-camera plugin + CAMERA permission |
| Modify | `package.json` | Add `@react-native-ml-kit/text-recognition` |
| Modify | `assets/i18n/en.json` | Receipt scanner strings (EN) |
| Modify | `assets/i18n/ru.json` | Receipt scanner strings (RU) |
| Modify | `assets/i18n/de.json` | Receipt scanner strings (DE) |
| Modify | `assets/i18n/es.json` | Receipt scanner strings (ES) |
| Modify | `assets/i18n/fr.json` | Receipt scanner strings (FR) |
| Modify | `assets/i18n/it.json` | Receipt scanner strings (IT) |
| Modify | `assets/i18n/zh.json` | Receipt scanner strings (ZH) |
| Modify | `assets/i18n/hy.json` | Receipt scanner strings (HY) |
| Create | `__tests__/services/receiptParser.test.js` | Unit tests for parser |
| Create | `__tests__/components/operations/ReceiptReviewModal.test.js` | Component tests |

---

## Task 1: Install dependency and configure permissions

**Files:**
- Modify: `package.json`
- Modify: `app.config.js`

- [ ] **Step 1: Install @react-native-ml-kit/text-recognition**

```bash
cd money-tracker
bun add @react-native-ml-kit/text-recognition
```

Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Add expo-camera plugin and CAMERA permission to app.config.js**

In `app.config.js`, update the `android.permissions` array and `plugins` array:

```javascript
android: {
  adaptiveIcon: {
    foregroundImage: './assets/adaptive-icon.png',
    backgroundColor: '#ffffff',
  },
  edgeToEdgeEnabled: true,
  package: 'com.heywood8.monkeep',
  permissions: [
    'android.permission.REQUEST_INSTALL_PACKAGES',
    'android.permission.CAMERA',
  ],
},
```

And in the `plugins` array, add expo-camera before `expo-sqlite`:

```javascript
plugins: [
  [
    'expo-camera',
    {
      cameraPermission: 'Allow Penny to access your camera to scan receipts.',
    },
  ],
  'expo-sqlite',
  // ... rest unchanged
],
```

- [ ] **Step 3: Verify package.json has the new dependency**

```bash
grep -A1 "ml-kit" package.json
```

Expected: `"@react-native-ml-kit/text-recognition": "^2.x.x"` (or current latest).

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock app.config.js
git commit -m "chore: add ML Kit text recognition and camera permission for receipt scanner"
```

---

## Task 2: Add i18n strings for receipt scanner

**Files:**
- Modify: `assets/i18n/en.json`
- Modify: `assets/i18n/ru.json`
- Modify: `assets/i18n/de.json`
- Modify: `assets/i18n/es.json`
- Modify: `assets/i18n/fr.json`
- Modify: `assets/i18n/it.json`
- Modify: `assets/i18n/zh.json`
- Modify: `assets/i18n/hy.json`

- [ ] **Step 1: Add keys to en.json**

Append to the JSON object (before the closing `}`):

```json
  "scan_receipt": "Scan receipt",
  "receipt_scanner": "Receipt Scanner",
  "take_photo": "Take Photo",
  "retake": "Retake",
  "processing_receipt": "Processing receipt...",
  "receipt_items": "Receipt Items",
  "select_all": "Select All",
  "deselect_all": "Deselect All",
  "add_selected": "Add {count} item(s)",
  "no_items_detected": "No items detected. Try a clearer photo.",
  "receipt_total": "Total",
  "camera_permission_required": "Camera permission is required to scan receipts.",
  "allow_camera": "Allow Camera",
  "receipt_item_amount": "Amount"
```

- [ ] **Step 2: Add keys to ru.json**

```json
  "scan_receipt": "Сканировать чек",
  "receipt_scanner": "Сканер чека",
  "take_photo": "Сфотографировать",
  "retake": "Переснять",
  "processing_receipt": "Обработка чека...",
  "receipt_items": "Позиции чека",
  "select_all": "Выбрать все",
  "deselect_all": "Снять выбор",
  "add_selected": "Добавить {count} шт.",
  "no_items_detected": "Позиции не распознаны. Попробуйте более чёткое фото.",
  "receipt_total": "Итого",
  "camera_permission_required": "Для сканирования чеков необходимо разрешение камеры.",
  "allow_camera": "Разрешить",
  "receipt_item_amount": "Сумма"
```

- [ ] **Step 3: Add keys to de.json**

```json
  "scan_receipt": "Quittung scannen",
  "receipt_scanner": "Quittungsscanner",
  "take_photo": "Foto aufnehmen",
  "retake": "Wiederholen",
  "processing_receipt": "Quittung wird verarbeitet...",
  "receipt_items": "Quittungspositionen",
  "select_all": "Alle auswählen",
  "deselect_all": "Auswahl aufheben",
  "add_selected": "{count} Artikel hinzufügen",
  "no_items_detected": "Keine Artikel erkannt. Versuchen Sie ein klareres Foto.",
  "receipt_total": "Gesamt",
  "camera_permission_required": "Kamerazugriff ist zum Scannen von Quittungen erforderlich.",
  "allow_camera": "Erlauben",
  "receipt_item_amount": "Betrag"
```

- [ ] **Step 4: Add keys to es.json**

```json
  "scan_receipt": "Escanear recibo",
  "receipt_scanner": "Escáner de recibo",
  "take_photo": "Tomar foto",
  "retake": "Reintentar",
  "processing_receipt": "Procesando recibo...",
  "receipt_items": "Artículos del recibo",
  "select_all": "Seleccionar todo",
  "deselect_all": "Deseleccionar todo",
  "add_selected": "Agregar {count} artículo(s)",
  "no_items_detected": "No se detectaron artículos. Intente con una foto más clara.",
  "receipt_total": "Total",
  "camera_permission_required": "Se requiere permiso de cámara para escanear recibos.",
  "allow_camera": "Permitir",
  "receipt_item_amount": "Importe"
```

- [ ] **Step 5: Add keys to fr.json**

```json
  "scan_receipt": "Scanner le reçu",
  "receipt_scanner": "Scanner de reçu",
  "take_photo": "Prendre une photo",
  "retake": "Reprendre",
  "processing_receipt": "Traitement du reçu...",
  "receipt_items": "Articles du reçu",
  "select_all": "Tout sélectionner",
  "deselect_all": "Tout désélectionner",
  "add_selected": "Ajouter {count} article(s)",
  "no_items_detected": "Aucun article détecté. Essayez une photo plus nette.",
  "receipt_total": "Total",
  "camera_permission_required": "L'accès à la caméra est requis pour scanner les reçus.",
  "allow_camera": "Autoriser",
  "receipt_item_amount": "Montant"
```

- [ ] **Step 6: Add keys to it.json**

```json
  "scan_receipt": "Scansiona scontrino",
  "receipt_scanner": "Scanner scontrino",
  "take_photo": "Scatta foto",
  "retake": "Riprova",
  "processing_receipt": "Elaborazione scontrino...",
  "receipt_items": "Voci dello scontrino",
  "select_all": "Seleziona tutto",
  "deselect_all": "Deseleziona tutto",
  "add_selected": "Aggiungi {count} voce/i",
  "no_items_detected": "Nessuna voce rilevata. Prova con una foto più chiara.",
  "receipt_total": "Totale",
  "camera_permission_required": "Il permesso della fotocamera è richiesto per scansionare gli scontrini.",
  "allow_camera": "Consenti",
  "receipt_item_amount": "Importo"
```

- [ ] **Step 7: Add keys to zh.json**

```json
  "scan_receipt": "扫描收据",
  "receipt_scanner": "收据扫描仪",
  "take_photo": "拍照",
  "retake": "重拍",
  "processing_receipt": "正在处理收据...",
  "receipt_items": "收据项目",
  "select_all": "全选",
  "deselect_all": "取消全选",
  "add_selected": "添加 {count} 项",
  "no_items_detected": "未检测到项目，请尝试拍摄更清晰的照片。",
  "receipt_total": "合计",
  "camera_permission_required": "扫描收据需要相机权限。",
  "allow_camera": "允许",
  "receipt_item_amount": "金额"
```

- [ ] **Step 8: Add keys to hy.json**

```json
  "scan_receipt": "Սկանավորել կտրոնը",
  "receipt_scanner": "Կտրոնի սկաներ",
  "take_photo": "Նկարել",
  "retake": "Կրկին նկարել",
  "processing_receipt": "Կտրոնը մշակվում է...",
  "receipt_items": "Կտրոնի տարրեր",
  "select_all": "Ընտրել բոլորը",
  "deselect_all": "Ապընտրել բոլորը",
  "add_selected": "Ավելացնել {count} տարր",
  "no_items_detected": "Տարրեր չեն հայտնաբերվել։ Փորձեք ավելի հստակ լուսանկար:",
  "receipt_total": "Ընդամենը",
  "camera_permission_required": "Կտրոնները սկանավորելու համար անհրաժեշտ է տեսախցիկի թույլտվություն:",
  "allow_camera": "Թույլատրել",
  "receipt_item_amount": "Գումար"
```

- [ ] **Step 9: Run tests to verify no regressions**

```bash
npm test -- --silent
```

Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add assets/i18n/
git commit -m "feat(i18n): add receipt scanner strings to all languages"
```

---

## Task 3: Build receiptParser service (TDD)

**Files:**
- Create: `app/services/receiptParser.js`
- Create: `__tests__/services/receiptParser.test.js`

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/receiptParser.test.js`:

```javascript
import { parseReceiptText } from '../../app/services/receiptParser';

describe('parseReceiptText', () => {
  describe('basic parsing', () => {
    it('returns empty result for null input', () => {
      expect(parseReceiptText(null)).toEqual({ items: [], total: null });
    });

    it('returns empty result for empty string', () => {
      expect(parseReceiptText('')).toEqual({ items: [], total: null });
    });

    it('parses a single item with price at end of line', () => {
      const text = 'Молоко 2.5%   89.90';
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Молоко 2.5%');
      expect(result.items[0].amount).toBe('89.90');
    });

    it('parses a price with comma as decimal separator', () => {
      const text = 'Хлеб белый   45,00';
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].amount).toBe('45.00');
    });

    it('parses multiple items', () => {
      const text = `Молоко 2.5%   89.90
Хлеб белый   45.00
Яблоки 1кг   120.00`;
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(3);
      expect(result.items[0].name).toBe('Молоко 2.5%');
      expect(result.items[1].name).toBe('Хлеб белый');
      expect(result.items[2].name).toBe('Яблоки 1кг');
    });
  });

  describe('total detection', () => {
    it('extracts total from ИТОГО line', () => {
      const text = `Молоко   89.90
ИТОГО   89.90`;
      const result = parseReceiptText(text);
      expect(result.total).toBe('89.90');
    });

    it('extracts total from TOTAL line (English)', () => {
      const text = `Milk   2.50
TOTAL   2.50`;
      const result = parseReceiptText(text);
      expect(result.total).toBe('2.50');
    });

    it('extracts total from "К ОПЛАТЕ" line', () => {
      const text = `Сыр   250.00
К ОПЛАТЕ   250.00`;
      const result = parseReceiptText(text);
      expect(result.total).toBe('250.00');
    });

    it('does not add total line as an item', () => {
      const text = `Молоко   89.90
ИТОГО   89.90`;
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Молоко');
    });

    it('returns null total when no total line present', () => {
      const text = 'Молоко   89.90';
      const result = parseReceiptText(text);
      expect(result.total).toBeNull();
    });
  });

  describe('noise filtering', () => {
    it('ignores lines that are too short to be items', () => {
      const text = `A   5.00
Молоко   89.90`;
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Молоко');
    });

    it('ignores lines with zero or negative amounts', () => {
      const text = `Скидка   -10.00
Молоко   89.90`;
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
    });

    it('ignores lines that are purely numeric names', () => {
      const text = `12345   89.90
Молоко   89.90`;
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
    });

    it('ignores lines with no price pattern', () => {
      const text = `Магазин "Пятёрочка"
Чек №123456
Молоко   89.90`;
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('quantity × price format', () => {
    it('parses item with quantity multiplication and uses last price as amount', () => {
      // "Молоко 2.5%  2 x 89.90  179.80" → amount is 179.80 (total for that line)
      const text = 'Молоко 2.5%   2 x 89.90   179.80';
      const result = parseReceiptText(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].amount).toBe('179.80');
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --silent __tests__/services/receiptParser.test.js
```

Expected: All tests fail with "Cannot find module '../../app/services/receiptParser'".

- [ ] **Step 3: Implement receiptParser.js**

Create `app/services/receiptParser.js`:

```javascript
/**
 * Receipt Parser
 *
 * Parses raw OCR text from a receipt photo into structured line items.
 * Handles common formats found on Russian, Armenian, and European receipts.
 *
 * @param {string|null} text - Raw OCR text from ML Kit text recognition
 * @returns {{ items: Array<{name: string, amount: string}>, total: string|null }}
 */
export function parseReceiptText(text) {
  if (!text || typeof text !== 'string') {
    return { items: [], total: null };
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  let total = null;

  // Matches "ИТОГО", "TOTAL", "ИТОГ", "К ОПЛАТЕ", "СУММА", "SUM", "AMOUNT"
  const TOTAL_LINE = /^(итого|total|итог|к\s*оплате|сумма|sum|amount)\b/i;

  // Matches a price at the end of a line: digits, optional spaces, dot or comma, two digits
  // e.g. "89.90", "1 234.00", "45,00"
  const PRICE_AT_END = /^(.+?)\s+((?:\d[\d\s]*)[.,]\d{2})\s*$/;

  for (const line of lines) {
    if (TOTAL_LINE.test(line)) {
      const priceMatch = line.match(/((?:\d[\d\s]*)[.,]\d{2})\s*$/);
      if (priceMatch) {
        total = priceMatch[1].replace(/\s/g, '').replace(',', '.');
      }
      continue;
    }

    const match = line.match(PRICE_AT_END);
    if (!match) continue;

    const name = match[1].trim();
    const rawAmount = match[2].replace(/\s/g, '').replace(',', '.');
    const numericAmount = parseFloat(rawAmount);

    // Skip: name too short, name is purely digits, amount is zero or negative
    if (name.length < 2) continue;
    if (/^\d+$/.test(name)) continue;
    if (isNaN(numericAmount) || numericAmount <= 0) continue;

    items.push({ name, amount: rawAmount });
  }

  return { items, total };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --silent __tests__/services/receiptParser.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test -- --silent
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/services/receiptParser.js __tests__/services/receiptParser.test.js
git commit -m "feat(receipt): add receiptParser service with full test coverage"
```

---

## Task 4: Build ReceiptScannerModal (Camera + OCR)

**Files:**
- Create: `app/components/operations/ReceiptScannerModal.js`

This component handles camera permission request, live camera preview, photo capture, and ML Kit OCR. It calls `onResult(parsedReceipt)` when done, or `onClose()` to cancel.

- [ ] **Step 1: Create ReceiptScannerModal.js**

Create `app/components/operations/ReceiptScannerModal.js`:

```javascript
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { parseReceiptText } from '../../services/receiptParser';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';

/**
 * ReceiptScannerModal
 *
 * Full-screen modal that shows a camera preview, captures a photo, runs
 * on-device OCR via ML Kit, and returns parsed receipt items.
 *
 * Props:
 * - visible: boolean
 * - onClose: () => void
 * - onResult: ({ items, total }) => void
 * - t: translation function
 * - colors: theme colors object
 */
export default function ReceiptScannerModal({ visible, onClose, onResult, t, colors }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const cameraRef = useRef(null);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || processing) return;

    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      const recognitionResult = await TextRecognition.recognize(photo.uri);
      const parsed = parseReceiptText(recognitionResult.text);
      onResult(parsed);
    } catch (error) {
      Alert.alert(t('error'), error.message);
    } finally {
      setProcessing(false);
    }
  }, [processing, onResult, t]);

  const renderContent = () => {
    if (!permission) {
      // Permission status loading
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <Icon name="camera-off" size={64} color={colors.mutedText} />
          <Text style={[styles.permissionText, { color: colors.text }]}>
            {t('camera_permission_required')}
          </Text>
          <Pressable
            style={[styles.allowButton, { backgroundColor: colors.primary }]}
            onPress={requestPermission}
            accessibilityRole="button"
            accessibilityLabel={t('allow_camera')}
          >
            <Text style={[styles.allowButtonText, { color: '#fff' }]}>
              {t('allow_camera')}
            </Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
        />

        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
          >
            <Icon name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.topBarTitle}>{t('receipt_scanner')}</Text>
          <View style={styles.topBarSpacer} />
        </View>

        {/* Processing overlay */}
        {processing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.processingText}>{t('processing_receipt')}</Text>
          </View>
        )}

        {/* Capture button */}
        {!processing && (
          <View style={styles.captureBar}>
            <Pressable
              onPress={handleCapture}
              style={styles.captureButton}
              accessibilityRole="button"
              accessibilityLabel={t('take_photo')}
            >
              <View style={styles.captureButtonInner} />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {renderContent()}
      </View>
    </Modal>
  );
}

ReceiptScannerModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onResult: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
};

const styles = StyleSheet.create({
  allowButton: {
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  allowButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  captureBar: {
    alignItems: 'center',
    bottom: 48,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  captureButton: {
    alignItems: 'center',
    borderColor: '#fff',
    borderRadius: 40,
    borderWidth: 4,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  captureButtonInner: {
    backgroundColor: '#fff',
    borderRadius: 32,
    height: 64,
    width: 64,
  },
  cameraContainer: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  closeButton: {
    padding: SPACING.md,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionText: {
    fontSize: 16,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: SPACING.md,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    paddingTop: 48,
    paddingBottom: SPACING.md,
  },
  topBarSpacer: {
    width: 44,
  },
  topBarTitle: {
    color: '#fff',
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Run full test suite to check for regressions**

```bash
npm test -- --silent
```

Expected: All tests pass (ReceiptScannerModal has no unit tests — it depends on native camera/OCR APIs that can't be unit tested; it will be manually tested on device).

- [ ] **Step 3: Commit**

```bash
git add app/components/operations/ReceiptScannerModal.js
git commit -m "feat(receipt): add ReceiptScannerModal with camera capture and ML Kit OCR"
```

---

## Task 5: Build ReceiptReviewModal (TDD)

**Files:**
- Create: `app/components/operations/ReceiptReviewModal.js`
- Create: `__tests__/components/operations/ReceiptReviewModal.test.js`

This modal receives `{ items, total }` from the scanner, lets the user check/uncheck items and edit names, then calls `onConfirm(selectedItems)` to create operations.

- [ ] **Step 1: Write failing tests**

Create `__tests__/components/operations/ReceiptReviewModal.test.js`:

```javascript
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReceiptReviewModal from '../../../app/components/operations/ReceiptReviewModal';

const mockT = (key, params) => {
  const map = {
    receipt_items: 'Receipt Items',
    select_all: 'Select All',
    deselect_all: 'Deselect All',
    cancel: 'Cancel',
    retake: 'Retake',
    no_items_detected: 'No items detected.',
    receipt_total: 'Total',
    add_selected: `Add ${params?.count ?? 0} item(s)`,
    receipt_item_amount: 'Amount',
  };
  return map[key] ?? key;
};

const mockColors = {
  background: '#fff',
  surface: '#f5f5f5',
  primary: '#6200ee',
  text: '#000',
  mutedText: '#666',
  border: '#e0e0e0',
  altRow: '#fafafa',
};

const defaultProps = {
  visible: true,
  onClose: jest.fn(),
  onRetake: jest.fn(),
  onConfirm: jest.fn(),
  t: mockT,
  colors: mockColors,
  items: [
    { name: 'Молоко', amount: '89.90' },
    { name: 'Хлеб', amount: '45.00' },
  ],
  total: '134.90',
};

describe('ReceiptReviewModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders all parsed items', () => {
      const { getByText } = render(<ReceiptReviewModal {...defaultProps} />);
      expect(getByText('Молоко')).toBeTruthy();
      expect(getByText('Хлеб')).toBeTruthy();
    });

    it('renders item amounts', () => {
      const { getByDisplayValue } = render(<ReceiptReviewModal {...defaultProps} />);
      expect(getByDisplayValue('89.90')).toBeTruthy();
      expect(getByDisplayValue('45.00')).toBeTruthy();
    });

    it('renders total when provided', () => {
      const { getByText } = render(<ReceiptReviewModal {...defaultProps} />);
      expect(getByText('Total')).toBeTruthy();
      expect(getByText('134.90')).toBeTruthy();
    });

    it('does not render total row when total is null', () => {
      const { queryByText } = render(
        <ReceiptReviewModal {...defaultProps} total={null} />
      );
      expect(queryByText('Total')).toBeNull();
    });

    it('shows no items message when items array is empty', () => {
      const { getByText } = render(
        <ReceiptReviewModal {...defaultProps} items={[]} total={null} />
      );
      expect(getByText('No items detected.')).toBeTruthy();
    });
  });

  describe('selection', () => {
    it('starts with all items selected', () => {
      const { getByText } = render(<ReceiptReviewModal {...defaultProps} />);
      // add button shows count = 2 (all selected)
      expect(getByText('Add 2 item(s)')).toBeTruthy();
    });

    it('deselects an item when tapped', () => {
      const { getByText } = render(<ReceiptReviewModal {...defaultProps} />);
      fireEvent.press(getByText('Молоко'));
      expect(getByText('Add 1 item(s)')).toBeTruthy();
    });

    it('re-selects an item when tapped again', () => {
      const { getByText } = render(<ReceiptReviewModal {...defaultProps} />);
      fireEvent.press(getByText('Молоко'));
      fireEvent.press(getByText('Молоко'));
      expect(getByText('Add 2 item(s)')).toBeTruthy();
    });

    it('deselects all items via Deselect All button', () => {
      const { getByText } = render(<ReceiptReviewModal {...defaultProps} />);
      fireEvent.press(getByText('Deselect All'));
      expect(getByText('Add 0 item(s)')).toBeTruthy();
    });

    it('selects all items via Select All button after deselecting', () => {
      const { getByText } = render(<ReceiptReviewModal {...defaultProps} />);
      fireEvent.press(getByText('Deselect All'));
      fireEvent.press(getByText('Select All'));
      expect(getByText('Add 2 item(s)')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('calls onConfirm with selected items when add button pressed', () => {
      const onConfirm = jest.fn();
      const { getByText } = render(
        <ReceiptReviewModal {...defaultProps} onConfirm={onConfirm} />
      );
      fireEvent.press(getByText('Add 2 item(s)'));
      expect(onConfirm).toHaveBeenCalledWith([
        { name: 'Молоко', amount: '89.90' },
        { name: 'Хлеб', amount: '45.00' },
      ]);
    });

    it('calls onConfirm with only selected items', () => {
      const onConfirm = jest.fn();
      const { getByText } = render(
        <ReceiptReviewModal {...defaultProps} onConfirm={onConfirm} />
      );
      fireEvent.press(getByText('Молоко')); // deselect first item
      fireEvent.press(getByText('Add 1 item(s)'));
      expect(onConfirm).toHaveBeenCalledWith([
        { name: 'Хлеб', amount: '45.00' },
      ]);
    });

    it('calls onRetake when Retake is pressed', () => {
      const onRetake = jest.fn();
      const { getByText } = render(
        <ReceiptReviewModal {...defaultProps} onRetake={onRetake} />
      );
      fireEvent.press(getByText('Retake'));
      expect(onRetake).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Cancel is pressed', () => {
      const onClose = jest.fn();
      const { getByText } = render(
        <ReceiptReviewModal {...defaultProps} onClose={onClose} />
      );
      fireEvent.press(getByText('Cancel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --silent __tests__/components/operations/ReceiptReviewModal.test.js
```

Expected: All tests fail with "Cannot find module".

- [ ] **Step 3: Implement ReceiptReviewModal.js**

Create `app/components/operations/ReceiptReviewModal.js`:

```javascript
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  ScrollView,
} from 'react-native';
import PropTypes from 'prop-types';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { SPACING, BORDER_RADIUS } from '../../styles/designTokens';

/**
 * ReceiptReviewModal
 *
 * Shows parsed receipt items as a selectable list. User can toggle items,
 * edit amounts, then confirm to add selected items as expense operations.
 *
 * Props:
 * - visible: boolean
 * - onClose: () => void            cancel and close
 * - onRetake: () => void           go back to camera
 * - onConfirm: (items) => void     called with array of selected {name, amount}
 * - items: Array<{name, amount}>   parsed items from receiptParser
 * - total: string|null             detected receipt total
 * - t: translation function
 * - colors: theme colors object
 */
export default function ReceiptReviewModal({
  visible,
  onClose,
  onRetake,
  onConfirm,
  items,
  total,
  t,
  colors,
}) {
  const [selected, setSelected] = useState(() => new Set(items.map((_, i) => i)));
  const [amounts, setAmounts] = useState(() => Object.fromEntries(items.map((item, i) => [i, item.amount])));

  // Re-sync when items prop changes (new scan result)
  useEffect(() => {
    setSelected(new Set(items.map((_, i) => i)));
    setAmounts(Object.fromEntries(items.map((item, i) => [i, item.amount])));
  }, [items]);

  const toggleItem = useCallback((index) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((_, i) => i)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleConfirm = useCallback(() => {
    const selectedItems = items
      .map((item, i) => ({ ...item, amount: amounts[i] ?? item.amount }))
      .filter((_, i) => selected.has(i));
    onConfirm(selectedItems);
  }, [items, amounts, selected, onConfirm]);

  const selectedCount = selected.size;
  const allSelected = selectedCount === items.length;

  const renderItem = useCallback(({ item, index }) => {
    const isSelected = selected.has(index);
    return (
      <Pressable
        onPress={() => toggleItem(index)}
        style={[
          styles.itemRow,
          { borderBottomColor: colors.border },
          !isSelected && { opacity: 0.4 },
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={item.name}
      >
        <Icon
          name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={22}
          color={isSelected ? colors.primary : colors.mutedText}
          style={styles.checkbox}
        />
        <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>
          {item.name}
        </Text>
        <TextInput
          style={[styles.amountInput, { color: colors.text, borderColor: colors.border }]}
          value={amounts[index]}
          onChangeText={(text) => setAmounts((prev) => ({ ...prev, [index]: text }))}
          keyboardType="decimal-pad"
          accessibilityLabel={t('receipt_item_amount')}
        />
      </Pressable>
    );
  }, [selected, amounts, colors, t, toggleItem]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={onClose}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('cancel')}
          >
            <Text style={[styles.headerButtonText, { color: colors.primary }]}>
              {t('cancel')}
            </Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {t('receipt_items')}
          </Text>
          <Pressable
            onPress={onRetake}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel={t('retake')}
          >
            <Text style={[styles.headerButtonText, { color: colors.primary }]}>
              {t('retake')}
            </Text>
          </Pressable>
        </View>

        {/* Select all / deselect all */}
        {items.length > 0 && (
          <View style={[styles.selectAllRow, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={allSelected ? deselectAll : selectAll}
              accessibilityRole="button"
            >
              <Text style={[styles.selectAllText, { color: colors.primary }]}>
                {allSelected ? t('deselect_all') : t('select_all')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Item list */}
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="receipt" size={64} color={colors.mutedText} />
            <Text style={[styles.emptyText, { color: colors.mutedText }]}>
              {t('no_items_detected')}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* Total row */}
        {total !== null && (
          <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.totalLabel, { color: colors.mutedText }]}>
              {t('receipt_total')}
            </Text>
            <Text style={[styles.totalAmount, { color: colors.text }]}>
              {total}
            </Text>
          </View>
        )}

        {/* Confirm button */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleConfirm}
            style={[
              styles.confirmButton,
              { backgroundColor: selectedCount > 0 ? colors.primary : colors.border },
            ]}
            disabled={selectedCount === 0}
            accessibilityRole="button"
            accessibilityLabel={t('add_selected', { count: selectedCount })}
          >
            <Text style={styles.confirmButtonText}>
              {t('add_selected', { count: selectedCount })}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

ReceiptReviewModal.propTypes = {
  visible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onRetake: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  items: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    amount: PropTypes.string.isRequired,
  })).isRequired,
  total: PropTypes.string,
  t: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
};

ReceiptReviewModal.defaultProps = {
  total: null,
};

const styles = StyleSheet.create({
  amountInput: {
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    fontSize: 14,
    minWidth: 80,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    textAlign: 'right',
  },
  checkbox: {
    marginRight: SPACING.sm,
  },
  confirmButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  container: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: 16,
    marginTop: SPACING.lg,
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: 48,
    paddingBottom: SPACING.md,
  },
  headerButton: {
    minWidth: 70,
    padding: SPACING.sm,
  },
  headerButtonText: {
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  itemName: {
    flex: 1,
    fontSize: 14,
    marginRight: SPACING.sm,
  },
  itemRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  listContent: {
    flexGrow: 1,
  },
  selectAllRow: {
    borderBottomWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalLabel: {
    fontSize: 14,
  },
  totalRow: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
});
```

- [ ] **Step 4: Run the component tests**

```bash
npm test -- --silent __tests__/components/operations/ReceiptReviewModal.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm test -- --silent
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/components/operations/ReceiptReviewModal.js __tests__/components/operations/ReceiptReviewModal.test.js
git commit -m "feat(receipt): add ReceiptReviewModal with item selection and tests"
```

---

## Task 6: Wire up scan button in OperationsScreen

**Files:**
- Modify: `app/screens/OperationsScreen.js`

Add a scan FAB button that opens `ReceiptScannerModal`, then `ReceiptReviewModal`, and finally creates the selected operations using `addOperation`.

- [ ] **Step 1: Add imports to OperationsScreen.js**

At the top of `app/screens/OperationsScreen.js`, add after the existing imports:

```javascript
import ReceiptScannerModal from '../components/operations/ReceiptScannerModal';
import ReceiptReviewModal from '../components/operations/ReceiptReviewModal';
import { formatDate as toDateStringForOp } from '../services/BalanceHistoryDB';
```

- [ ] **Step 2: Add state variables for receipt scanner**

Inside the `OperationsScreen` component, after the existing `useState` declarations (around line 66), add:

```javascript
const [scannerVisible, setScannerVisible] = useState(false);
const [reviewVisible, setReviewVisible] = useState(false);
const [scannedReceipt, setScannedReceipt] = useState({ items: [], total: null });
```

- [ ] **Step 3: Add handler functions**

After the existing handlers in `OperationsScreen`, add:

```javascript
const handleOpenScanner = useCallback(() => {
  setScannerVisible(true);
}, []);

const handleScannerClose = useCallback(() => {
  setScannerVisible(false);
}, []);

const handleScanResult = useCallback((parsed) => {
  setScannerVisible(false);
  setScannedReceipt(parsed);
  setReviewVisible(true);
}, []);

const handleReviewRetake = useCallback(() => {
  setReviewVisible(false);
  setScannerVisible(true);
}, []);

const handleReviewClose = useCallback(() => {
  setReviewVisible(false);
  setScannedReceipt({ items: [], total: null });
}, []);

const handleReviewConfirm = useCallback(async (selectedItems) => {
  setReviewVisible(false);
  setScannedReceipt({ items: [], total: null });

  const today = toDateStringForOp(new Date());
  const defaultAccountId = visibleAccounts[0]?.id;
  if (!defaultAccountId) return;

  for (const item of selectedItems) {
    const operation = {
      type: 'expense',
      amount: item.amount,
      accountId: defaultAccountId,
      categoryId: null,
      date: today,
      description: item.name,
    };
    const errors = validateOperation(operation);
    if (!errors || Object.keys(errors).length === 0) {
      await addOperation(operation);
    }
  }
}, [visibleAccounts, addOperation, validateOperation]);
```

- [ ] **Step 4: Add scan FAB to JSX**

In the return JSX of `OperationsScreen`, locate the filter FAB (search for `filterFab` style). Add a new FAB above it. The filter FAB sits at `bottom: 100` — add the scan button at `bottom: 170`:

```jsx
{/* Receipt scan FAB */}
<Pressable
  style={[
    styles.scanFab,
    { backgroundColor: colors.surface, borderColor: colors.border },
  ]}
  onPress={handleOpenScanner}
  accessibilityRole="button"
  accessibilityLabel={t('scan_receipt')}
>
  <Icon name="receipt-text-outline" size={24} color={colors.text} />
</Pressable>
```

Place this immediately before the existing filter FAB `<FAB ...>` element.

- [ ] **Step 5: Add scanFab style to StyleSheet**

In the `StyleSheet.create` at the bottom of `OperationsScreen.js`, add:

```javascript
scanFab: {
  alignItems: 'center',
  borderRadius: 28,
  borderWidth: 1,
  bottom: 170,
  elevation: 8,
  height: 56,
  justifyContent: 'center',
  margin: SPACING.lg,
  position: 'absolute',
  right: 0,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  width: 56,
},
```

- [ ] **Step 6: Add modals to JSX**

After the existing `<OperationModal ...>` element in the return JSX, add:

```jsx
<ReceiptScannerModal
  visible={scannerVisible}
  onClose={handleScannerClose}
  onResult={handleScanResult}
  t={t}
  colors={colors}
/>

<ReceiptReviewModal
  visible={reviewVisible}
  onClose={handleReviewClose}
  onRetake={handleReviewRetake}
  onConfirm={handleReviewConfirm}
  items={scannedReceipt.items}
  total={scannedReceipt.total}
  t={t}
  colors={colors}
/>
```

- [ ] **Step 7: Run full test suite**

```bash
npm test -- --silent
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/screens/OperationsScreen.js
git commit -m "feat(receipt): wire receipt scanner FAB into OperationsScreen"
```

---

## Task 7: Create PR

- [ ] **Step 1: Push branch to remote**

```bash
git checkout -b feat/receipt-scanner
git push -u origin feat/receipt-scanner
```

- [ ] **Step 2: Create PR**

```bash
gh pr create \
  --title "feat: on-device receipt scanner" \
  --body "$(cat <<'EOF'
## Summary

- Adds a camera FAB on the Operations screen to scan receipts
- ML Kit OCR runs fully on-device (no network calls)
- Regex parser extracts line items and total from OCR text
- Review modal lets user select/deselect items and edit amounts before adding as expense operations
- All 8 app languages have receipt scanner strings

## New dependencies

- `@react-native-ml-kit/text-recognition` — on-device OCR (requires custom dev build via expo-dev-client, already present)
- `expo-camera` — bundled in Expo SDK, just needed plugin config

## Test plan

- [ ] `npm test` — all existing + new tests pass
- [ ] Build custom dev client: `eas build --profile development --platform android`
- [ ] Install on Pixel 7 Pro, tap camera FAB on Operations screen
- [ ] Grant camera permission when prompted
- [ ] Point camera at a receipt, tap shutter button
- [ ] Verify items appear in review modal with correct names and amounts
- [ ] Deselect an item, tap Add — verify only selected items are created
- [ ] Verify created operations appear in the operations list as expenses with receipt item names as descriptions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes

- **Custom dev build required**: `@react-native-ml-kit/text-recognition` is a native module that doesn't work in Expo Go. Run `eas build --profile development --platform android` to get a dev client build.
- **Receipt format variability**: The parser covers common Russian/Armenian receipt formats. For formats it misses, the user can still manually edit amounts in the review modal.
- **Account selection**: The first visible account is used as default for all created operations. A future improvement could let the user pick an account in the review modal.
- **Category assignment**: Created operations have `categoryId: null`. The user can tap on any operation afterward to assign a category.
