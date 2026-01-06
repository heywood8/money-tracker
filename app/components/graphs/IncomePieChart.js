import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import PropTypes from 'prop-types';
import { PieChart } from 'react-native-chart-kit';
import CustomLegend from './CustomLegend';

const screenWidth = Dimensions.get('window').width;

const IncomePieChart = ({
  colors,
  t,
  loadingIncome,
  incomeChartData,
  selectedCurrency,
  onLegendItemPress,
  selectedIncomeCategory,
}) => {
  return (
    <>
      {loadingIncome ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedText }]}>
            {t('loading_operations')}
          </Text>
        </View>
      ) : incomeChartData.length > 0 ? (
        <>
          <View style={styles.chartContainer}>
            <PieChart
              data={incomeChartData}
              width={screenWidth - 64}
              height={220}
              chartConfig={{
                color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
              }}
              accessor="amount"
              backgroundColor="transparent"
              paddingLeft="15"
              center={[0, 0]}
              hasLegend={false}
            />
          </View>
          <CustomLegend
            data={incomeChartData}
            currency={selectedCurrency}
            colors={colors}
            onItemPress={onLegendItemPress}
            isClickable={selectedIncomeCategory === 'all'}
          />
        </>
      ) : (
        <Text style={[styles.noData, { color: colors.mutedText }]}>
          {t('no_income_data')}
        </Text>
      )}
    </>
  );
};

IncomePieChart.propTypes = {
  colors: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  loadingIncome: PropTypes.bool.isRequired,
  incomeChartData: PropTypes.array.isRequired,
  selectedCurrency: PropTypes.string.isRequired,
  onLegendItemPress: PropTypes.func.isRequired,
  selectedIncomeCategory: PropTypes.string.isRequired,
};

const styles = StyleSheet.create({
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
  },
  chartContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  noData: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 32,
  },
});

export default IncomePieChart;
