import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignOrderTypeToSide,
  depthExecutionForLevel,
  isLimitOrderType,
  isPendingSideValid,
  isStopLimitOrderType,
  isStopOrderType,
  normalizePendingOrderWireType,
  resolveSideForOrderType,
  resolveSymbolDigits,
  resolveSymbolPriceStep,
  resolveSymbolStopsLevel,
  stepPriceFieldValue,
} from './pendingOrderValidation.js';

test('order type classification and directional alignment helpers follow specification', () => {
  assert.equal(isLimitOrderType('Limit Order'), true);
  assert.equal(isLimitOrderType('Buy Limit'), true);
  assert.equal(isLimitOrderType('Sell Limit'), true);
  assert.equal(isLimitOrderType('Buy Stop'), false);

  assert.equal(isStopOrderType('Stop Order'), true);
  assert.equal(isStopOrderType('Buy Stop'), true);
  assert.equal(isStopOrderType('Sell Stop'), true);
  assert.equal(isStopOrderType('Buy Stop Limit'), false);

  assert.equal(isStopLimitOrderType('Stop Limit Order'), true);
  assert.equal(isStopLimitOrderType('Buy Stop Limit'), true);
  assert.equal(isStopLimitOrderType('Sell Stop Limit'), true);

  assert.equal(resolveSideForOrderType('Buy Limit'), 'buy');
  assert.equal(resolveSideForOrderType('Sell Stop Limit'), 'sell');
  assert.equal(resolveSideForOrderType('Limit Order'), null);
  assert.equal(resolveSideForOrderType('Market Execution'), null);

  assert.equal(alignOrderTypeToSide('Buy Limit', 'sell'), 'Sell Limit');
  assert.equal(alignOrderTypeToSide('Sell Stop', 'buy'), 'Buy Stop');
  assert.equal(alignOrderTypeToSide('Limit Order', 'sell'), 'Limit Order');

  assert.equal(normalizePendingOrderWireType('Limit Order', 'buy'), 'buy_limit');
  assert.equal(normalizePendingOrderWireType('Sell Stop Limit', 'sell'), 'sell_stop_limit');
});

test('broker metadata resolution resolves digits, priceStep, and stopsLevel without hardcoding symbols', () => {
  assert.equal(resolveSymbolDigits({ quote: { digits: 3 } }), 3);
  assert.equal(resolveSymbolDigits({ quote: { bid: '1.10452', ask: '1.10465' } }), 5);
  assert.equal(resolveSymbolPriceStep({ quote: { tick_size: 0.01 }, specDigits: 2 }), 0.01);
  assert.equal(resolveSymbolStopsLevel({ quote: { stops_level: 15 } }), 15);
});

test('stepPriceFieldValue seeds empty input with anchorPrice and increments valid price by step', () => {
  assert.equal(
    stepPriceFieldValue({
      currentValueStr: '',
      direction: 1,
      anchorPrice: 1.08542,
      specDigits: 5,
      priceStep: 0.00001,
    }),
    '1.08542'
  );
  assert.equal(
    stepPriceFieldValue({
      currentValueStr: '1.08542',
      direction: -1,
      anchorPrice: 1.0854,
      specDigits: 5,
      priceStep: 0.00001,
    }),
    '1.08541'
  );
});

test('isPendingSideValid enforces all 6 checks (side lock, volume/price, stops_level, market geometry, SL/TP, expiration)', () => {
  const base = {
    volume: '0.10',
    bid: 1.1000,
    ask: 1.1002,
    specDigits: 4,
    unitStep: 0.0001,
    specStopsLevel: 10, // minDist = 0.0010
    stopLoss: '0',
    takeProfit: '0',
    expiration: 'GTC',
    expirationDateStr: '',
  };

  // Check 1: Explicit Side Lock
  assert.equal(
    isPendingSideValid({ ...base, side: 'sell', orderType: 'Buy Limit', price: '1.0980' }),
    false
  );
  assert.equal(
    isPendingSideValid({ ...base, side: 'buy', orderType: 'Buy Limit', price: '1.0980' }),
    true
  );

  // Check 4: Buy Limit must be strictly below ask - minDist (1.1002 - 0.0010 = 1.0992)
  assert.equal(
    isPendingSideValid({ ...base, side: 'buy', orderType: 'Limit Order', price: '1.0992' }),
    false
  );
  assert.equal(
    isPendingSideValid({ ...base, side: 'buy', orderType: 'Limit Order', price: '1.0991' }),
    true
  );

  // Check 4: Sell Stop must be strictly below bid - minDist (1.1000 - 0.0010 = 1.0990)
  assert.equal(
    isPendingSideValid({ ...base, side: 'sell', orderType: 'Stop Order', price: '1.0990' }),
    false
  );
  assert.equal(
    isPendingSideValid({ ...base, side: 'sell', orderType: 'Stop Order', price: '1.0989' }),
    true
  );

  // Check 5: SL/TP geometry against entryRef
  assert.equal(
    isPendingSideValid({
      ...base,
      side: 'buy',
      orderType: 'Buy Limit',
      price: '1.0980',
      stopLoss: '1.0975', // too close: must be < 1.0980 - 0.0010 = 1.0970
    }),
    false
  );
  assert.equal(
    isPendingSideValid({
      ...base,
      side: 'buy',
      orderType: 'Buy Limit',
      price: '1.0980',
      stopLoss: '1.0965',
      takeProfit: '1.0995',
    }),
    true
  );

  // Check 6: Specified expiration in the past fails closed
  assert.equal(
    isPendingSideValid({
      ...base,
      side: 'buy',
      orderType: 'Buy Limit',
      price: '1.0980',
      expiration: 'Specified',
      expirationDateStr: '2020-01-01T00:00',
      nowMs: Date.parse('2026-11-02T12:00:00Z'),
    }),
    false
  );
  assert.equal(depthExecutionForLevel('BUY', 1.1010, 1.1000, 1.1002), 'stop');
  assert.equal(depthExecutionForLevel('BUY', 1.0995, 1.1000, 1.1002), 'limit');
});

test('aligned Buy/Sell pending buttons enable Buy when Buy is available and enable Sell when Sell is available', () => {
  const quoteContext = {
    volume: '0.01',
    bid: 77610.35,
    ask: 77615.35,
    specDigits: 5,
    unitStep: 0.00001,
    specStopsLevel: 0,
    stopLoss: '0.00000',
    takeProfit: '0.00000',
    expiration: 'GTC',
    expirationDateStr: '',
  };

  // When At Price (77649.50000) is above market (77610.35 / 77615.35) in Limit mode:
  // Sell Limit is available (enabled) and Buy Limit is unavailable (disabled).
  const checkSideAtPrice = (pendingOrderType, side, price) =>
    isPendingSideValid({
      ...quoteContext,
      side,
      orderType: alignOrderTypeToSide(pendingOrderType, side),
      price,
    });

  assert.equal(checkSideAtPrice('Buy Limit', 'sell', '77649.50000'), true);
  assert.equal(checkSideAtPrice('Buy Limit', 'buy', '77649.50000'), false);

  // When At Price (77600.00000) is below market (77610.35 / 77615.35) in Limit mode:
  // Buy Limit is available (enabled) and Sell Limit is unavailable (disabled).
  assert.equal(checkSideAtPrice('Buy Limit', 'buy', '77600.00000'), true);
  assert.equal(checkSideAtPrice('Buy Limit', 'sell', '77600.00000'), false);

  // In Stop mode: above Ask enables Buy Stop; below Bid enables Sell Stop.
  assert.equal(checkSideAtPrice('Buy Stop', 'buy', '77649.50000'), true);
  assert.equal(checkSideAtPrice('Buy Stop', 'sell', '77649.50000'), false);
  assert.equal(checkSideAtPrice('Sell Stop', 'sell', '77600.00000'), true);
  assert.equal(checkSideAtPrice('Sell Stop', 'buy', '77600.00000'), false);
});
