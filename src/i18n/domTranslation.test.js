import test from 'node:test';
import assert from 'node:assert/strict';
import { applyText, applyAttributes, textOriginals, attributeOriginals } from './domTranslation.js';
import { UI_DICTIONARIES } from './uiDictionary/index.js';

test('applyText preserves dynamic React text toggles in English', () => {
  const node = { data: 'Show account panel' };

  // Pass 1: English mount
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Show account panel');

  // React updates to 'Hide account panel'
  node.data = 'Hide account panel';

  // Pass 2: Observer runs in English
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide account panel', 'Must not revert React update to Show account panel');

  // React updates back to 'Show account panel'
  node.data = 'Show account panel';
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Show account panel');

  // React updates to 'Hide account panel' again
  node.data = 'Hide account panel';
  applyText(node, UI_DICTIONARIES.en, 'en');
  assert.equal(node.data, 'Hide account panel');
});

test('applyText dynamically translates toggled strings in non-English languages', () => {
  const node = { data: 'Show account panel' };
  const zhDict = UI_DICTIONARIES.zh;

  // Pass 1: Initial mount in Chinese
  applyText(node, zhDict, 'zh');
  assert.equal(node.data, '显示账户面板', 'Should translate initial Show label');

  // React toggles the state: React sets new English text on the node
  node.data = 'Hide account panel';

  // Pass 2: Observer runs in Chinese
  applyText(node, zhDict, 'zh');
  assert.equal(node.data, '隐藏账户面板', 'Must translate the toggled Hide label instead of staying on Show');

  // React toggles again back to Show
  node.data = 'Show account panel';
  applyText(node, zhDict, 'zh');
  assert.equal(node.data, '显示账户面板', 'Must translate back to Show');

  // React toggles again to Hide
  node.data = 'Hide account panel';
  applyText(node, zhDict, 'zh');
  assert.equal(node.data, '隐藏账户面板', 'Must correctly handle repeated toggling');
});

test('applyAttributes preserves dynamic attribute toggles in English and translated locales', () => {
  const attrs = { 'aria-label': 'Show account panel', title: 'Show account panel' };
  const element = {
    getAttribute: (attr) => attrs[attr] ?? null,
    setAttribute: (attr, val) => { attrs[attr] = val; },
  };

  // English mount
  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attrs['aria-label'], 'Show account panel');

  // React toggles attribute
  attrs['aria-label'] = 'Hide account panel';
  attrs['title'] = 'Hide account panel';

  applyAttributes(element, UI_DICTIONARIES.en, 'en');
  assert.equal(attrs['aria-label'], 'Hide account panel', 'Aria-label must not be reverted in English');
  assert.equal(attrs['title'], 'Hide account panel');

  // Chinese locale
  const zhDict = UI_DICTIONARIES.zh;
  applyAttributes(element, zhDict, 'zh');
  assert.equal(attrs['aria-label'], '隐藏账户面板');

  // React toggles back to Show
  attrs['aria-label'] = 'Show account panel';
  applyAttributes(element, zhDict, 'zh');
  assert.equal(attrs['aria-label'], '显示账户面板');
});

test('applyText translates word components in emails and identifiers while preserving symbols and numbers', () => {
  const zhDict = UI_DICTIONARIES.zh;

  // Uppercase and lowercase test emails (with .COM and .com translated to 商业)
  const emailNodeUpper = { data: 'TEST@TEST.COM' };
  applyText(emailNodeUpper, zhDict, 'zh');
  assert.equal(emailNodeUpper.data, '测试@测试.商业');

  const emailNodeLower = { data: 'test@test.com' };
  applyText(emailNodeLower, zhDict, 'zh');
  assert.equal(emailNodeLower.data, '测试@测试.商业');

  // Complex email with hyphens, numbers, and subdomains (Rust translated to 铁锈)
  const complexEmailNode = { data: 'rust-canary-20260910@example.test' };
  applyText(complexEmailNode, zhDict, 'zh');
  assert.equal(complexEmailNode.data, '铁锈-金丝雀-20260910@示例.测试');

  // Other email domains and tokens
  const orgEmailNode = { data: 'user@company.org' };
  applyText(orgEmailNode, zhDict, 'zh');
  assert.equal(orgEmailNode.data, '用户@公司.组织');

  const netEmailNode = { data: 'admin@demo.net' };
  applyText(netEmailNode, zhDict, 'zh');
  assert.equal(netEmailNode.data, '管理员@模拟.网络');

  // Rust compound phrases
  const rustCanaryNode = { data: 'Rust Canary' };
  applyText(rustCanaryNode, zhDict, 'zh');
  assert.equal(rustCanaryNode.data, '铁锈金丝雀');

  // Pure numbers (e.g. login numbers in email column) must NOT be modified
  const numberNode = { data: '200008' };
  applyText(numberNode, zhDict, 'zh');
  assert.equal(numberNode.data, '200008');

  // Trading symbols (e.g. BTCUSD, EURUSD) must NOT be translated
  const btcNode = { data: 'BTCUSD' };
  applyText(btcNode, zhDict, 'zh');
  assert.equal(btcNode.data, 'BTCUSD');

  const eurusdNode = { data: 'EURUSD' };
  applyText(eurusdNode, zhDict, 'zh');
  assert.equal(eurusdNode.data, 'EURUSD');

  // Uppercase action buttons
  const buyNode = { data: 'BUY' };
  applyText(buyNode, zhDict, 'zh');
  assert.equal(buyNode.data, '买入');

  const sellNode = { data: 'SELL' };
  applyText(sellNode, zhDict, 'zh');
  assert.equal(sellNode.data, '卖出');

  // Real account email address translation
  const realEmailNode = { data: 'real@real.com' };
  applyText(realEmailNode, zhDict, 'zh');
  assert.equal(realEmailNode.data, '真实@真实.商业');

  const realEmailPartialNode = { data: 'real@real.商业' };
  applyText(realEmailPartialNode, zhDict, 'zh');
  assert.equal(realEmailPartialNode.data, '真实@真实.商业');

  // Dynamic count + noun template
  const onlineUsersNode = { data: '5 online users' };
  applyText(onlineUsersNode, zhDict, 'zh');
  assert.equal(onlineUsersNode.data, '5 在线用户');

  const onlineUsersUpperNode = { data: '5 ONLINE USERS' };
  applyText(onlineUsersUpperNode, zhDict, 'zh');
  assert.equal(onlineUsersUpperNode.data, '5 在线用户');

  const activeSessionsCountNode = { data: '12 Active Sessions' };
  applyText(activeSessionsCountNode, zhDict, 'zh');
  assert.equal(activeSessionsCountNode.data, '12 活跃会话');

  // Column header Build
  const buildNode = { data: 'Build' };
  applyText(buildNode, zhDict, 'zh');
  assert.equal(buildNode.data, '版本');

  const buildUpperNode = { data: 'BUILD' };
  applyText(buildUpperNode, zhDict, 'zh');
  assert.equal(buildUpperNode.data, '版本');

  // Grid idle / loading states
  const idleOnlineNode = { data: 'Online users not loaded' };
  applyText(idleOnlineNode, zhDict, 'zh');
  assert.equal(idleOnlineNode.data, '在线用户未加载');

  // Tooltip sort by attribute
  const sortAttr = { 'title': 'Sort by Build' };
  const fakeTh = {
    getAttribute: (attr) => sortAttr[attr],
    setAttribute: (attr, val) => { sortAttr[attr] = val; },
  };
  applyAttributes(fakeTh, zhDict, 'zh');
  assert.equal(sortAttr['title'], '按版本排序');
});

test('applyText translates comments to Chinese in zh mode and shows English by default in en mode', () => {
  const zhDict = UI_DICTIONARIES.zh;
  const enDict = UI_DICTIONARIES.en;

  // 1. In Chinese mode: 'synthetic market open' translates to '合成市价开仓'
  const syntheticNode = { data: 'synthetic market open' };
  applyText(syntheticNode, zhDict, 'zh');
  assert.equal(syntheticNode.data, '合成市价开仓', 'Comment must be translated to Chinese in zh mode');

  const marketCloseNode = { data: 'market close' };
  applyText(marketCloseNode, zhDict, 'zh');
  assert.equal(marketCloseNode.data, '市价平仓');

  // 2. In English mode: Chinese comments translate to English by default
  const chineseCommentNode = { data: '合成市价开仓' };
  applyText(chineseCommentNode, enDict, 'en');
  assert.equal(chineseCommentNode.data, 'synthetic market open', 'Chinese comment must be shown in English by default in en mode');

  const manualTradeNode = { data: '手动交易' };
  applyText(manualTradeNode, enDict, 'en');
  assert.equal(manualTradeNode.data, 'manual trade');

  // 3. Normal English text in English mode remains unchanged
  const regularEnglishNode = { data: 'Orders' };
  applyText(regularEnglishNode, enDict, 'en');
  assert.equal(regularEnglishNode.data, 'Orders');
});

test('applyText cleanly translates full UI elements to French in fr mode without Chinese leakage', () => {
  const frDict = UI_DICTIONARIES.fr;

  const assertions = [
    // Top menu bar
    ['File', 'Fichier'],
    ['Edit', 'Modifier'],
    ['View', 'Affichage'],
    ['Tools', 'Outils'],
    ['Window', 'Fenêtre'],
    ['Help', 'Aide'],

    // Market Watch & Search
    ['Market Watch', 'Surveillance du marché'],
    ['Search symbols...', 'Rechercher des symboles...'],
    ['Symbols', 'Symboles'],
    ['Details', 'Détails'],
    ['Ticks', 'Ticks'],

    // Workspace & Tabs
    ['Operations', 'Opérations'],
    ['Exposure', 'Exposition'],
    ['Liquidity', 'Liquidité'],
    ['Risk Monitor', 'Moniteur de risque'],
    ['Compliance', 'Conformité'],

    // Filters
    ['Filter currently open trades', 'Filtrer les positions actuellement ouvertes'],
    ['All Types', 'Tous les types'],
    ['All Symbols', 'Tous les symboles'],
    ['All Reasons', 'Toutes les raisons'],

    // Table column headers
    ['LOGIN', 'Identifiant'],
    ['USER NAME', 'Nom d’utilisateur'],
    ['EMAIL', 'E-mail'],
    ['SYMBOL', 'Symbole'],
    ['ACTION', 'Action'],
    ['LOTS', 'Lots'],
    ['OPEN', 'Ouverture'],
    ['CURRENT', 'Actuel'],
    ['S/L', 'S/L'],
    ['T/P', 'T/P'],
    ['STORAGE', 'Stockage'],
    ['PROFIT', 'Profit'],
    ['COMMISSION', 'Commission'],
    ['COMMENT', 'Commentaire'],

    // Row Actions & Entities
    ['BUY', 'Acheter'],
    ['SELL', 'Vendre'],
    ['Latency Bench TEST', 'Test de référence de latence'],
    ['Rust Canary', 'Canari Rust'],
    ['rust-canary-20260910@example.test', 'Rust-Canari-20260910@exemple.Test'],
    ['TEST@TEST.COM', 'Test@Test.COM'],
    ['test@test.com', 'Test@Test.com'],

    // Summary & Pagination
    ['Showing 1-17 of 17', 'Affichage de 1-17 sur 17'],
    ['Page buy: 9', 'Achats de la page : 9'],
    ['Page sell: 8', 'Ventes de la page : 8'],
    ['Selected', 'Sélectionné'],
    ['Prev', 'Précédent'],
    ['Page 1 of 1', 'Page 1 sur 1'],
    ['Next', 'Suivant'],

    // Operations Terminal
    ['Operations Terminal', 'Terminal d’opérations'],
    ['Open trades · auto-refresh', 'Trades ouverts · actualisation auto'],
    ['Refresh', 'Actualiser'],
    ['Previous', 'Précédent'],

    // Owner Console & Quick Actions
    ['Owner Console', 'Console propriétaire'],
    ['Insights', 'Aperçus'],
    ['Alerts', 'Alertes'],
    ['Approvals', 'Approbations'],
    ['Quick Actions', 'Actions rapides'],
    ['Add New Client', 'Ajouter un nouveau client'],
    ['Manage IB Accounts', 'Gérer les comptes IB'],
    ['Server Management', 'Gestion des serveurs'],
    ['Risk Settings', 'Paramètres de risque'],
    ['View Reports', 'Voir les rapports'],
    ['System Configuration', 'Configuration du système'],

    // Navigator
    ['IB Management', 'Gestion des IB'],
    ['IB Accounts', 'Comptes IB'],
    ['IB Tree', 'Arbre IB'],
    ['Commissions', 'Commissions'],
    ['Payouts', 'Paiements'],
    ['Risk Management', 'Gestion des risques'],
    ['Margin Rules', 'Règles de marge'],
    ['Restricted Accounts', 'Comptes restreints'],
    ['Finance', 'Finance'],
    ['Markets', 'Marchés'],
    ['Groups', 'Groupes'],
    ['System', 'Système'],

    // Top action bar
    ['Find account', 'Rechercher un compte'],
    ['Reset', 'Réinitialiser'],
    ['+ New account', '+ Nouveau compte'],
    ['Desktop App', 'Application de bureau'],
    ['Production', 'Production'],
    ['Ready', 'Prêt'],
    ['Connected', 'Connecté'],
  ];

  for (const [english, expectedFrench] of assertions) {
    const node = { data: english };
    applyText(node, frDict, 'fr');
    assert.equal(node.data, expectedFrench, `Failed translating "${english}" to French`);
    assert.match(node.data, /^[^\u4e00-\u9fa5]+$/, `Translated string "${node.data}" contains Chinese characters!`);
  }
});

test('applyText translates Trading Accounts Dashboard elements to Chinese in zh mode', () => {
  const zhDict = UI_DICTIONARIES.zh;

  const assertions = [
    ['All Lead Campaign', '全部推广活动'],
    ['All Lead Source', '全部获客来源'],
    ['All Countries', '全部国家/地区'],
    ['Daily account registrations', '每日账户注册统计'],
    ['Geographic distribution', '全球地域分布统计'],
    ['Allocation across trading groups', '各交易组分配统计'],
    ['These reports are not available yet. Filters will apply once reporting is connected; individual accounts are available in the account list.', '这些报表暂未生成。连接报表服务后将应用筛选条件；可前往账户列表查看单笔账户。'],
    ['Registration trends by source and campaign.', '按获客来源与推广活动的注册增长趋势。'],
    ['Trading accounts, online users, and language distribution geographically.', '全球各地区的交易账户、在线用户与语言分布。'],
    ['Interactive world-map overlay.', '交互式世界地图图层。'],
    ['Live sentiment, symbol breakdown, and reason classification.', '实时多空情绪、交易品种细分及开仓原因分类。'],
    ['Admin Sessions', '后台管理员会话'],
    ['Unique account groups', '独立交易组'],
    ['Users on the current page', '当前页在线用户'],
  ];

  for (const [english, expectedChinese] of assertions) {
    const node = { data: english };
    applyText(node, zhDict, 'zh');
    assert.equal(node.data, expectedChinese, `Failed translating "${english}" to Chinese`);
  }
});




