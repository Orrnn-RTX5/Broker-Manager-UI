import { UI_DICTIONARIES } from './uiDictionary/index.js';

const lowerMapCache = new WeakMap();

export const getLowerMap = (dictionary) => {
  let map = lowerMapCache.get(dictionary);
  if (!map) {
    map = new Map();
    for (const [key, val] of Object.entries(dictionary)) {
      map.set(key.toLowerCase(), val);
    }
    lowerMapCache.set(dictionary, map);
  }
  return map;
};

export const lookupTranslation = (dictionary, value) => {
  if (!dictionary) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Skip pure numbers, punctuation, codes, currency pairs, or hashes
  if (/^[\d.,\s%#$+\-—/:\\]+$/.test(trimmed)) return null;

  // Skip trading symbols (e.g. BTCUSD, EURUSD, XAUUSD, ETHUSD, USDJPY)
  if (/^[A-Z0-9]{3,10}$/.test(trimmed) && /^(BTC|ETH|EUR|USD|GBP|JPY|AUD|CAD|CHF|NZD|XAU|XAG|SOL|XRP|BNB|DOGE)[A-Z0-9]*$/i.test(trimmed)) {
    return null;
  }

  // 1. Exact match
  const hit = dictionary[trimmed];
  if (hit && hit !== trimmed) return hit;

  const lowerMap = getLowerMap(dictionary);
  const lower = trimmed.toLowerCase();

  // 2. Case-insensitive lookup (e.g. USER NAME, TICKET, STATUS, LOTS, OPEN, S/L, T/P)
  if (lowerMap.has(lower)) {
    const matched = lowerMap.get(lower);
    if (matched && (matched !== trimmed || matched.toLowerCase() !== lower)) return matched;
  }

  // 3. Trailing colon: e.g. "Page buy:", "Account login:", "Bid:"
  if (trimmed.endsWith(':')) {
    const base = trimmed.slice(0, -1).trim();
    const baseHit = dictionary[base] || lowerMap.get(base.toLowerCase());
    if (baseHit) return `${baseHit}:`;
  }

  // 4. Trailing ellipsis: e.g. "Loading orders…", "Synchronizing trades…", "Search symbols..."
  if (trimmed.endsWith('…')) {
    const base = trimmed.slice(0, -1).trim();
    const baseHit = dictionary[base] || lowerMap.get(base.toLowerCase());
    if (baseHit) return `${baseHit}…`;
  }
  if (trimmed.endsWith('...')) {
    const base = trimmed.slice(0, -3).trim();
    const baseHit = dictionary[base] || lowerMap.get(base.toLowerCase());
    if (baseHit) return `${baseHit}...`;
  }

  // 5. Trailing period: e.g. "Orders are not loaded.", "API Error."
  if (trimmed.endsWith('.') && !trimmed.includes('. ')) {
    const base = trimmed.slice(0, -1).trim();
    const baseHit = dictionary[base] || lowerMap.get(base.toLowerCase());
    if (baseHit) return `${baseHit}.`;
  }

  // 6. Leading plus: e.g. "+ New account" -> "+ " + translated("New account")
  if (trimmed.startsWith('+ ')) {
    const base = trimmed.slice(2).trim();
    const baseHit = dictionary[base] || lowerMap.get(base.toLowerCase());
    if (baseHit) return `+ ${baseHit}`;
  }

  // 7. Compound phrases separated by middle dot " · "
  // e.g. "Open trades · auto-refresh", "Right-click for actions · Double-click a row to modify"
  if (trimmed.includes(' · ')) {
    const parts = trimmed.split(' · ');
    let changed = false;
    const translatedParts = parts.map((part) => {
      const p = part.trim();
      const pHit = dictionary[p] || lowerMap.get(p.toLowerCase());
      if (pHit && pHit !== p) {
        changed = true;
        return pHit;
      }
      return p;
    });
    if (changed) return translatedParts.join(' · ');
  }

  // 8. Dynamic pagination templates:
  // "Page X" -> e.g. "Page 1"
  const pageMatch = trimmed.match(/^Page\s+(\d+)$/i);
  if (pageMatch) {
    const pageWord = dictionary['Page'] || 'Page';
    return `${pageWord} ${pageMatch[1]}`;
  }

  // "Page: X" -> e.g. "Page: 1"
  const pageColonMatch = trimmed.match(/^Page:\s*(\d+)$/i);
  if (pageColonMatch) {
    const pageWord = dictionary['Page'] || 'Page';
    return `${pageWord}: ${pageColonMatch[1]}`;
  }

  // "Page X of Y" -> e.g. "Page 1 of 5"
  const pageOfMatch = trimmed.match(/^Page\s+(\d+)\s+of\s+(\d+)$/i);
  if (pageOfMatch) {
    const pageWord = dictionary['Page'] || 'Page';
    const ofWord = dictionary['of'] || 'of';
    return `${pageWord} ${pageOfMatch[1]} ${ofWord} ${pageOfMatch[2]}`;
  }

  // "Showing X-Y of Z" or "Showing X of Y"
  const showingMatch = trimmed.match(/^Showing\s+([\d-]+)\s+of\s+(\d+|many)$/i);
  if (showingMatch) {
    const showingWord = dictionary['Showing'] || 'Showing';
    const ofWord = dictionary['of'] || 'of';
    const totalRaw = showingMatch[2];
    const totalWord = totalRaw.toLowerCase() === 'many' ? (dictionary['many'] || 'many') : totalRaw;
    return `${showingWord} ${showingMatch[1]} ${ofWord} ${totalWord}`;
  }

  // "Showing X records / symbols / items"
  const showingItemsMatch = trimmed.match(/^Showing\s+(\d+)\s+([a-zA-Z]+)(.*)$/i);
  if (showingItemsMatch) {
    const showingWord = dictionary['Showing'] || 'Showing';
    const noun = showingItemsMatch[2];
    const rest = showingItemsMatch[3] || '';
    const nounHit = dictionary[noun] || lowerMap.get(noun.toLowerCase()) || noun;
    return `${showingWord} ${showingItemsMatch[1]} ${nounHit}${rest}`;
  }

  // "Page buy: X" -> e.g. "Page buy: 9"
  const pageBuyMatch = trimmed.match(/^Page\s+buy:\s*(\d+)$/i);
  if (pageBuyMatch) {
    const pageBuyWord = dictionary['Page buy:'] || dictionary['Page buy'] || 'Page buy:';
    const cleanWord = pageBuyWord.endsWith(':') ? pageBuyWord : `${pageBuyWord}:`;
    return `${cleanWord} ${pageBuyMatch[1]}`;
  }

  // "Page sell: X" -> e.g. "Page sell: 8"
  const pageSellMatch = trimmed.match(/^Page\s+sell:\s*(\d+)$/i);
  if (pageSellMatch) {
    const pageSellWord = dictionary['Page sell:'] || dictionary['Page sell'] || 'Page sell:';
    const cleanWord = pageSellWord.endsWith(':') ? pageSellWord : `${pageSellWord}:`;
    return `${cleanWord} ${pageSellMatch[1]}`;
  }

  const isZh = dictionary['Yes'] === '是' || dictionary['Cancel'] === '取消' || dictionary['Today'] === '今日';

  // 9. Time delta or count today: e.g. "+12 today", "-10 today", "86 today"
  const todayMatch = trimmed.match(/^([+-]?\d+)\s+today$/i);
  if (todayMatch) {
    const todayWord = dictionary['today'] || lowerMap.get('today') || (isZh ? '今日' : 'today');
    return `${todayMatch[1]} ${todayWord}`;
  }

  // 10. Used resources: e.g. "Used $1.2M / $1.8M", "used 50%"
  const usedMatch = trimmed.match(/^(used)\s+(.+)$/i);
  if (usedMatch) {
    const usedWord = dictionary['Used'] || dictionary['used'] || lowerMap.get('used') || (isZh ? '已用' : 'Used');
    return `${usedWord} ${usedMatch[2]}`;
  }

  // 11. Pending items: e.g. "5 pending"
  const pendingMatch = trimmed.match(/^(\d+)\s+pending$/i);
  if (pendingMatch) {
    const pendingWord = dictionary['pending'] || lowerMap.get('pending') || (isZh ? '待处理' : 'pending');
    return `${pendingMatch[1]} ${pendingWord}`;
  }

  // 12. Numbered test entities: e.g. "Test 2", "Test 1"
  const testMatch = trimmed.match(/^test\s+(\d+)$/i);
  if (testMatch) {
    const testWord = dictionary['Test'] || lowerMap.get('test') || (isZh ? '测试' : 'Test');
    return `${testWord} ${testMatch[1]}`;
  }

  // 13. Dynamic multi-word compound phrases (e.g. "Latency Bench TEST", "Rust Canary", "Bench TEST", "Canary Test")
  if (trimmed.includes(' ') && !trimmed.includes('. ') && !trimmed.includes(', ')) {
    const words = trimmed.split(/\s+/);
    if (words.length >= 2 && words.length <= 6) {
      let allFound = true;
      const translatedWords = [];
      for (const w of words) {
        if (/^[\d.,%#$+\-]+$/.test(w)) {
          translatedWords.push(w);
          continue;
        }
        const wLower = w.toLowerCase();
        const hit = dictionary[w] || lowerMap.get(wLower);
        if (hit) {
          translatedWords.push(hit);
        } else if (wLower === 'rust') {
          translatedWords.push(dictionary['Rust'] || lowerMap.get('rust') || (isZh ? '铁锈' : 'Rust'));
        } else if (wLower === 'bench') {
          translatedWords.push(dictionary['Bench'] || lowerMap.get('bench') || (isZh ? '基准' : 'Bench'));
        } else if (wLower === 'latency') {
          translatedWords.push(dictionary['Latency'] || lowerMap.get('latency') || (isZh ? '延迟' : 'Latency'));
        } else if (wLower === 'canary') {
          translatedWords.push(dictionary['Canary'] || lowerMap.get('canary') || (isZh ? '金丝雀' : 'Canary'));
        } else {
          allFound = false;
          break;
        }
      }
      if (allFound) {
        const hasAscii = translatedWords.some((part) => /[a-zA-Z0-9]/.test(part));
        return hasAscii ? translatedWords.join(' ') : translatedWords.join('');
      }
    }
  }

  // 14. Email addresses or symbol-delimited identifiers (e.g. "TEST@TEST.COM", "test@test.com", "rust-canary-20260910@example.test")
  // Translates the word parts while preserving symbols (@, ., -, _) and numbers untouched.
  if (trimmed.includes('@') || (/[a-zA-Z]/.test(trimmed) && /[-_]/.test(trimmed) && !trimmed.includes(' '))) {
    const tokens = trimmed.split(/([@.\-_]+|\d+)/);
    let changed = false;
    const translatedTokens = tokens.map((token) => {
      if (!token) return '';
      // Preserve symbols, delimiters, and pure numbers
      if (/^[\d@.\-_]+$/.test(token)) {
        return token;
      }
      const tokenLower = token.toLowerCase();
      // Translate standard internet TLDs only if explicitly mapped or if Chinese locale
      if (['com', 'org', 'net', 'edu', 'gov', 'io', 'co', 'app', 'dev'].includes(tokenLower)) {
        if (isZh) {
          if (tokenLower === 'com') { changed = true; return dictionary['com'] || '商业'; }
          if (tokenLower === 'org') { changed = true; return dictionary['org'] || '组织'; }
          if (tokenLower === 'net') { changed = true; return dictionary['net'] || '网络'; }
          if (tokenLower === 'edu') { changed = true; return dictionary['edu'] || '教育'; }
          if (tokenLower === 'gov') { changed = true; return dictionary['gov'] || '政府'; }
          if (tokenLower === 'io') { changed = true; return dictionary['io'] || '科技'; }
          if (tokenLower === 'co') { changed = true; return dictionary['co'] || '公司'; }
          if (tokenLower === 'app') { changed = true; return dictionary['app'] || '应用'; }
          if (tokenLower === 'dev') { changed = true; return dictionary['dev'] || '开发'; }
        }
        if (dictionary[token] || dictionary[tokenLower]) {
          changed = true;
          return dictionary[token] || dictionary[tokenLower];
        }
        return token;
      }
      if (tokenLower === 'canary') {
        const canHit = dictionary['Canary'] || lowerMap.get('canary');
        if (canHit) { changed = true; return canHit; }
        if (isZh) { changed = true; return '金丝雀'; }
        return token;
      }
      if (tokenLower === 'rust') {
        const rustHit = dictionary['Rust'] || lowerMap.get('rust');
        if (rustHit) { changed = true; return rustHit; }
        if (isZh) { changed = true; return '铁锈'; }
        return token;
      }
      if (tokenLower === 'example') {
        const exHit = dictionary['example'] || lowerMap.get('example');
        if (exHit) { changed = true; return exHit; }
        if (isZh) { changed = true; return '示例'; }
        return token;
      }
      if (tokenLower === 'test') {
        const testHit = dictionary['Test'] || lowerMap.get('test');
        if (testHit) { changed = true; return testHit; }
        if (isZh) { changed = true; return '测试'; }
        return token;
      }
      const hit = dictionary[token] || lowerMap.get(tokenLower);
      if (hit && hit !== token) {
        changed = true;
        return hit;
      }
      return token;
    });

    if (changed) {
      return translatedTokens.join('');
    }
  }

  return null;
};



