// Translate complete interface templates while preserving account data and amounts.
const templates = [
  [/^Latest desktop release: (.+)\. This browser session uses the web app; desktop updates are installed separately\.$/, (m) => `नवीनतम डेस्कटॉप संस्करण: ${m[1]}। इस ब्राउज़र सत्र में वेब ऐप है; डेस्कटॉप अपडेट अलग से इंस्टॉल होते हैं।`],
  [/^User (.+) (blocked|unblocked) successfully\.$/, (m) => `उपयोगकर्ता ${m[1]} ${m[2] === 'blocked' ? 'सफलतापूर्वक ब्लॉक हो गया' : 'से ब्लॉक सफलतापूर्वक हट गया'}।`],
  [/^Are you sure you want to permanently delete account (.+)\?$/, (m) => `क्या आप खाता ${m[1]} स्थायी रूप से हटाना चाहते हैं?`],
  [/^Account (.+) deleted successfully\.$/, (m) => `खाता ${m[1]} सफलतापूर्वक हट गया।`],
  [/^Rollback deal #(.+)\? This will adjust the account balance\.$/, (m) => `सौदा #${m[1]} वापस लें? इससे खाते की शेष राशि बदलेगी।`],
  [/^Flip position #(.+)\?\s*Warning: SL\/TP values may be swapped due to a known issue\. Verify after flipping\.$/, (m) => `पोज़िशन #${m[1]} उलटें? चेतावनी: ज्ञात समस्या के कारण स्टॉप लॉस और टेक प्रॉफ़िट के मान आपस में बदल सकते हैं। उलटने के बाद जाँचें।`],
  [/^Force close ALL positions for login (.+)\?$/, (m) => `लॉगिन ${m[1]} की सभी पोज़िशन अनिवार्य रूप से बंद करें?`],
  [/^Saving changes to account #(.+)\.$/, (m) => `खाता #${m[1]} के बदलाव सहेजे जा रहे हैं।`],
  [/^Could not update account #(.+?): (.+) The fields have been reset to their last saved values\.$/, (m, t) => `खाता #${m[1]} अपडेट नहीं हो सका: ${t(m[2])} फ़ील्ड के अंतिम सहेजे गए मान बहाल कर दिए गए हैं।`],
  [/^Password (Check|Change) Result:\s*(.+)$/, (m, t) => `पासवर्ड ${m[1] === 'Check' ? 'जाँच' : 'बदलाव'} का परिणाम: ${t(m[2])}`],
  [/^Error (checking|changing) password: (.+)$/, (m, t) => `पासवर्ड ${m[1] === 'checking' ? 'जाँचने' : 'बदलने'} में त्रुटि: ${t(m[2])}`],
  [/^Deposit (.+) ([A-Z]{3}) into account #(\d+)\?$/, (m) => `खाता #${m[3]} में ${m[1]} ${m[2]} जमा करें?`],
  [/^Deposited (.+) ([A-Z]{3}) into account #(\d+) successfully\.$/, (m) => `खाता #${m[3]} में ${m[1]} ${m[2]} सफलतापूर्वक जमा हुए।`],
  [/^Deposit for account #(.+?): (.+)$/, (m, t) => `खाता #${m[1]} में जमा: ${t(m[2])}`],
  [/^Live account details unavailable: (.+)$/, (m, t) => `लाइव खाता विवरण उपलब्ध नहीं है: ${t(m[1])}`],
  [/^Restrictions updated for login (.+)$/, (m) => `लॉगिन ${m[1]} के प्रतिबंध अपडेट हुए`],
  [/^Clear all restrictions for login (.+)\?$/, (m) => `लॉगिन ${m[1]} के सभी प्रतिबंध हटाएँ?`],
  [/^Restrictions cleared for (?:login )?(.+)$/, (m) => `${m[1]} के प्रतिबंध हटा दिए गए`],
  [/^Spread markup set: (.+) = (.+)$/, (m) => `स्प्रेड का अतिरिक्त शुल्क सेट हुआ: ${m[1]} = ${m[2]}`],
  [/^Execution set: (.+), delay (.+)ms$/, (m, t) => `निष्पादन सेट हुआ: ${t(m[1])}, विलंब ${m[2]}ms`],
  [/^Book set to: (.+)$/, (m) => `बुक सेट हुई: ${m[1]}`],
  [/^Place a (BUY|SELL|buy|sell) market order for (.+) lots of (.+) on account #(\d+)\?$/, (m, t) => `खाता #${m[4]} पर ${m[3]} के ${m[2]} लॉट का ${t(m[1])} बाज़ार ऑर्डर दें?`],
  [/^Place (.+) order$/, (m, t) => `${t(m[1])} ऑर्डर दें`],
  [/^Order exposure\. Raw volume (.+)\.$/, (m) => `ऑर्डर का जोखिम। मूल वॉल्यूम ${m[1]}।`],
  [/^Opened order details for login (.+)\.$/, (m) => `लॉगिन ${m[1]} के खुले ऑर्डर का विवरण।`],
  [/^Copied (.+) row\(s\) as (.+)\.$/, (m) => `${m[1]} पंक्तियाँ ${m[2]} के रूप में कॉपी हुईं।`],
  [/^Copy failed: (.+)$/, (m, t) => `कॉपी विफल रही: ${t(m[1])}`],
  [/^All \((.+)\)$/, (m) => `सभी (${m[1]})`],
  [/^Select all (.+) trades$/, (m) => `सभी ${m[1]} ट्रेड चुनें`],
  [/^Clear all (.+) trades$/, (m) => `सभी ${m[1]} ट्रेड का चयन हटाएँ`],
  [/^Successfully moved accounts from (.+) to (.+)$/, (m) => `खाते ${m[1]} से ${m[2]} में सफलतापूर्वक स्थानांतरित हुए`],
  [/^Are you sure you want to delete group '(.+)'\?$/, (m) => `क्या आप समूह '${m[1]}' हटाना चाहते हैं?`],
  [/^Group '(.+)' deleted successfully!$/, (m) => `समूह '${m[1]}' सफलतापूर्वक हट गया!`],
  [/^Unlink client (.+) from IB (.+)\?$/, (m) => `ग्राहक ${m[1]} को आईबी ${m[2]} से अलग करें?`],
  [/^Pay eligible commissions for IB (.+) from (.+) through (.+)\?$/, (m) => `आईबी ${m[1]} के लिए ${m[2]} से ${m[3]} तक के पात्र कमीशन का भुगतान करें?`],
  [/^Eligible commissions for IB (.+) were submitted for payment\.$/, (m) => `आईबी ${m[1]} के पात्र कमीशन भुगतान के लिए भेज दिए गए।`],
  [/^Reason for rejecting IB (.+):$/, (m) => `आईबी ${m[1]} को अस्वीकार करने का कारण:`],
  [/^Optional notes for (.+) IB (.+):$/, (m, t) => `आईबी ${m[2]} के लिए ${t(m[1])} संबंधी वैकल्पिक नोट्स:`],
  [/^Confirm (.+) for IB (.+)\?$/, (m, t) => `आईबी ${m[2]} के लिए ${t(m[1])} की पुष्टि करें?`],
  [/^Failed to (.+) IB\.$/, (m, t) => `आईबी कार्रवाई विफल रही: ${t(m[1])}।`],
  [/^Type (.+) to remove IB (.+)\. This archives the IB and keeps audit history\.$/, (m) => `आईबी ${m[2]} हटाने के लिए ${m[1]} टाइप करें। इससे आईबी संग्रहीत होता है और ऑडिट इतिहास सुरक्षित रहता है।`],
  [/^Search in (.+)\.\.\.$/, (m, t) => `${t(m[1])} में खोजें...`],
  [/^Delete category "(.+)"\? This will fail if symbols are still assigned to it\.$/, (m) => `श्रेणी "${m[1]}" हटाएँ? यदि इससे अभी सिंबल जुड़े हैं, तो यह कार्रवाई विफल होगी।`],
];

const prefixes = {
  'Change Order Price — #': 'ऑर्डर मूल्य बदलें — #',
  'Approve Order — #': 'ऑर्डर स्वीकार करें — #',
  'Reject Order — #': 'ऑर्डर अस्वीकार करें — #',
  'Rollback Deal — #': 'सौदा वापस लें — #',
  'Change Price — #': 'मूल्य बदलें — #',
  'Change Volume — #': 'वॉल्यूम बदलें — #',
  'Change Comment — #': 'टिप्पणी बदलें — #',
  'Force Close — #': 'अनिवार्य रूप से बंद करें — #',
  'Force Close All — Login ': 'सभी अनिवार्य रूप से बंद करें — लॉगिन ',
  'Cancel Order #': 'ऑर्डर रद्द करें #',
  'Close Position #': 'पोज़िशन बंद करें #',
  'Modify Position #': 'पोज़िशन बदलें #',
  'Approve Order #': 'ऑर्डर स्वीकार करें #',
  'Reject Order #': 'ऑर्डर अस्वीकार करें #',
  'Account details for ': 'खाता विवरण: ',
  'Open details for client ': 'ग्राहक विवरण खोलें: ',
  'Open details for position ': 'पोज़िशन विवरण खोलें: ',
  'Select position ': 'पोज़िशन चुनें: ',
  'Edit account ': 'खाता संपादित करें: ',
  'Edit Group: ': 'समूह संपादित करें: ',
  'Duplicate Group: ': 'समूह की प्रतिलिपि बनाएँ: ',
  'Account ': 'खाता ',
  'Client ': 'ग्राहक ',
};

export function translateHindiDynamic(value, translateLabel) {
  for (const [pattern, translate] of templates) {
    const match = value.match(pattern);
    if (match) return translate(match, translateLabel);
  }
  for (const [prefix, translation] of Object.entries(prefixes)) {
    if (value.startsWith(prefix)) return translation + value.slice(prefix.length);
  }
  return null;
}
