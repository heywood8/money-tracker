import { View, Text, StyleSheet } from 'react-native';

const CategoriesScreen = () => (
  <View style={styles.container}>
    <Text>Categories</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default CategoriesScreen;
