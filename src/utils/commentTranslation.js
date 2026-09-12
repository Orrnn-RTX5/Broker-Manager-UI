export const COMMENT_PRESETS = [
  { id: 'synthetic_market_open', en: 'synthetic market open', zh: '合成市价开仓' },
  { id: 'synthetic_market_close', en: 'synthetic market close', zh: '合成市价平仓' },
  { id: 'market_open', en: 'market open', zh: '市价开仓' },
  { id: 'market_close', en: 'market close', zh: '市价平仓' },
  { id: 'manual_trade', en: 'manual trade', zh: '手动交易' },
  { id: 'mobile_trade', en: 'mobile trade', zh: '移动端交易' },
  { id: 'scalp_trade', en: 'scalp trade', zh: '超短线交易' },
  { id: 'hedge_position', en: 'hedge position', zh: '对冲持仓' },
  { id: 'client_order', en: 'client order', zh: '客户订单' },
  { id: 'test_order', en: 'test order', zh: '测试订单' },
];

export const EN_TO_ZH_COMMENTS = {
  'synthetic market open': '合成市价开仓',
  'synthetic market close': '合成市价平仓',
  'synthetic open': '合成开仓',
  'synthetic close': '合成平仓',
  'synthetic': '合成',
  'market open': '市价开仓',
  'market close': '市价平仓',
  'manual trade': '手动交易',
  'manual open': '手动开仓',
  'mobile trade': '移动端交易',
  'mobile app': '移动端应用',
  'web trade': 'Web端交易',
  'api trade': 'API接口交易',
  'scalp trade': '超短线交易',
  'hedge position': '对冲持仓',
  'client request': '客户申请',
  'client order': '客户订单',
  'test trade': '测试交易',
  'test order': '测试订单',
  'stop loss': '止损触发',
  'take profit': '止盈触发',
  'stop out': '爆仓平仓',
  'partial close': '部分平仓',
  'rollover': '隔夜利息',
};

export const ZH_TO_EN_COMMENTS = {
  '合成市价开仓': 'synthetic market open',
  '合成市价平仓': 'synthetic market close',
  '合成开仓': 'synthetic open',
  '合成平仓': 'synthetic close',
  '合成': 'synthetic',
  '市价开仓': 'market open',
  '市价平仓': 'market close',
  '手动交易': 'manual trade',
  '手动开仓': 'manual open',
  '移动端交易': 'mobile trade',
  '移动端': 'mobile',
  'Web端交易': 'web trade',
  'API接口交易': 'api trade',
  '超短线交易': 'scalp trade',
  '超短线': 'scalp',
  '对冲持仓': 'hedge position',
  '对冲': 'hedge',
  '客户申请': 'client request',
  '客户订单': 'client order',
  '测试交易': 'test trade',
  '测试订单': 'test order',
  '止损触发': 'stop loss',
  '止损': 'stop loss',
  '止盈触发': 'take profit',
  '止盈': 'take profit',
  '爆仓平仓': 'stop out',
  '部分平仓': 'partial close',
  '隔夜利息': 'rollover',
};

export const detectCommentLanguage = (comment) => {
  if (!comment || typeof comment !== 'string') return 'en';
  return /[\u4e00-\u9fa5]/.test(comment) ? 'zh' : 'en';
};

export const translateComment = (comment, targetLang = 'en') => {
  if (!comment || typeof comment !== 'string') return '';
  const trimmed = comment.trim();
  if (targetLang === 'zh') {
    return EN_TO_ZH_COMMENTS[trimmed.toLowerCase()] || trimmed;
  }
  return ZH_TO_EN_COMMENTS[trimmed] || trimmed;
};

export const normalizeCommentForDefault = (comment) => {
  if (!comment || typeof comment !== 'string') return '';
  const trimmed = comment.trim();
  // If written in Chinese, convert to canonical English for default display
  if (ZH_TO_EN_COMMENTS[trimmed]) {
    return ZH_TO_EN_COMMENTS[trimmed];
  }
  return trimmed;
};
