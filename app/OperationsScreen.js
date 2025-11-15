import { View, Text, StyleSheet } from 'react-native';

const OperationsScreen = () => (
  <View style={styles.container}>
    <Text>Operations</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default OperationsScreen;
