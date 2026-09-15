// Full Turkish interface templates retain customer data and monetary values.
const templates = [
  [/^Account: (.+), (Hedge|Hedging|Netting)$/, (m,t) => `Hesap: ${m[1]}, ${t(m[2])}`],
  [/^Page\s+(\d+)\s+of\s+(\d+)$/i, m => `Sayfa ${m[1]} / ${m[2]}`],
  [/^Showing\s+([\d,–-]+)\s+of\s+([\d,]+|many)(?:\s+([a-z ]+))?$/i, (m,t) => `${m[3] ? t(m[3]) + ': ' : ''}${m[1]} gösteriliyor; toplam ${m[2] === 'many' ? 'çok sayıda' : m[2]}`],
  [/^Sort by (.+)$/i, (m,t) => `Sıralama ölçütü: ${t(m[1])}`],
  [/^([+-]?\d+) today$/i, m => `Bugün ${m[1]}`],
  [/^(\d+) pending$/i, m => `${m[1]} bekliyor`],
  [/^(Resize|Maximize|Restore|Select) (.+?)( panel)?$/, (m,t) => `${t(m[2])}: ${{Resize:'Boyutu değiştir',Maximize:'Büyüt',Restore:'Geri yükle',Select:'Seç'}[m[1]]}`],
  [/^([^:]+):\s*([+-]?\d.*)$/, (m,t) => t(m[1]) !== m[1] ? `${t(m[1])}: ${m[2]}` : null],
  [/^Latest desktop release: (.+)\. This browser session uses the web app; desktop updates are installed separately\.$/, m => `Son masaüstü sürümü: ${m[1]}. Bu tarayıcı oturumu web uygulamasını kullanır; masaüstü güncellemeleri ayrı yüklenir.`],
  [/^User (.+) (blocked|unblocked) successfully\.$/, m => `${m[1]} kullanıcısı için ${m[2] === 'blocked' ? 'engelleme' : 'engel kaldırma'} işlemi tamamlandı.`],
  [/^Are you sure you want to permanently delete account (.+)\?$/, m => `${m[1]} numaralı hesabı kalıcı olarak silmek istediğinizden emin misiniz?`],
  [/^Account (.+) deleted successfully\.$/, m => `${m[1]} numaralı hesap başarıyla silindi.`],
  [/^Rollback deal #(.+)\? This will adjust the account balance\.$/, m => `#${m[1]} numaralı gerçekleşen işlem geri alınsın mı? Hesap bakiyesi düzeltilecek.`],
  [/^Flip position #(.+)\?\s*Warning: SL\/TP values may be swapped due to a known issue\. Verify after flipping\.$/, m => `#${m[1]} numaralı pozisyon tersine çevrilsin mi? Uyarı: Bilinen bir sorun nedeniyle SL ve TP değerleri yer değiştirebilir. İşlemden sonra kontrol edin.`],
  [/^Force close ALL positions for login (.+)\?$/, m => `${m[1]} numaralı hesabın TÜM pozisyonları zorla kapatılsın mı?`],
  [/^Saving changes to account #(.+)\.$/, m => `#${m[1]} numaralı hesabın değişiklikleri kaydediliyor.`],
  [/^Could not update account #(.+?): (.+) The fields have been reset to their last saved values\.$/, (m,t) => `#${m[1]} numaralı hesap güncellenemedi: ${t(m[2])} Son kaydedilen alan değerleri geri yüklendi.`],
  [/^Password (Check|Change) Result:\s*(.+)$/, (m,t) => `Parola ${m[1] === 'Check' ? 'kontrol' : 'değiştirme'} sonucu: ${t(m[2])}`],
  [/^Error (checking|changing) password: (.+)$/, (m,t) => `Parola ${m[1] === 'checking' ? 'kontrol' : 'değiştirme'} hatası: ${t(m[2])}`],
  [/^Deposit (.+) ([A-Z]{3}) into account #(\d+)\?$/, m => `#${m[3]} numaralı hesaba ${m[1]} ${m[2]} yatırılsın mı?`],
  [/^Deposited (.+) ([A-Z]{3}) into account #(\d+) successfully\.$/, m => `#${m[3]} numaralı hesaba ${m[1]} ${m[2]} yatırıldı.`],
  [/^Deposit for account #(.+?): (.+)$/, (m,t) => `#${m[1]} numaralı hesaba para yatırma: ${t(m[2])}`],
  [/^Live account details unavailable: (.+)$/, (m,t) => `Canlı hesap ayrıntıları kullanılamıyor: ${t(m[1])}`],
  [/^Restrictions updated for login (.+)$/, m => `${m[1]} numaralı hesabın kısıtlamaları güncellendi`],
  [/^Clear all restrictions for login (.+)\?$/, m => `${m[1]} numaralı hesabın tüm kısıtlamaları kaldırılsın mı?`],
  [/^Restrictions cleared for (?:login )?(.+)$/, m => `${m[1]} için kısıtlamalar kaldırıldı`],
  [/^Spread markup set: (.+) = (.+)$/, m => `Makas ek ücreti ayarlandı: ${m[1]} = ${m[2]}`],
  [/^Execution set: (.+), delay (.+)ms$/, (m,t) => `Gerçekleştirme ayarlandı: ${t(m[1])}, gecikme ${m[2]} ms`],
  [/^Book set to: (.+)$/, m => `Defter ayarlandı: ${m[1]}`],
  [/^Place a (BUY|SELL|buy|sell) market order for (.+) lots of (.+) on account #(\d+)\?$/, m => `#${m[4]} numaralı hesapta ${m[2]} lot ${m[3]} için piyasadan ${m[1].toLowerCase() === 'buy' ? 'alış' : 'satış'} emri verilsin mi?`],
  [/^Place (.+) order$/, (m,t) => `Emir ver: ${t(m[1])}`],
  [/^Order exposure\. Raw volume (.+)\.$/, m => `Emir riski. Ham hacim ${m[1]}.`],
  [/^Opened order details for login (.+)\.$/, m => `${m[1]} numaralı hesabın açık emir ayrıntıları.`],
  [/^Copied (.+) row\(s\) as (.+)\.$/, m => `${m[1]} satır ${m[2]} biçiminde kopyalandı.`],
  [/^Copy failed: (.+)$/, (m,t) => `Kopyalama başarısız: ${t(m[1])}`],
  [/^All \((.+)\)$/, m => `Tümü (${m[1]})`],
  [/^Select all (.+) trades$/, m => `${m[1]} işlemin tümünü seç`],
  [/^Clear all (.+) trades$/, m => `${m[1]} işlemin seçimini kaldır`],
  [/^Successfully moved accounts from (.+) to (.+)$/, m => `Hesaplar taşındı. Kaynak: ${m[1]}, hedef: ${m[2]}`],
  [/^Are you sure you want to delete group '(.+)'\?$/, m => `'${m[1]}' grubunu silmek istediğinizden emin misiniz?`],
  [/^Group '(.+)' deleted successfully!$/, m => `'${m[1]}' grubu başarıyla silindi!`],
  [/^Unlink client (.+) from IB (.+)\?$/, m => `${m[1]} müşterisi ile ${m[2]} IB hesabı arasındaki bağlantı kaldırılsın mı?`],
  [/^Pay eligible commissions for IB (.+) from (.+) through (.+)\?$/, m => `${m[1]} IB hesabının ${m[2]} ile ${m[3]} arasındaki uygun komisyonları ödensin mi?`],
  [/^Eligible commissions for IB (.+) were submitted for payment\.$/, m => `${m[1]} IB hesabının uygun komisyonları ödeme için gönderildi.`],
  [/^Reason for rejecting IB (.+):$/, m => `${m[1]} IB hesabını reddetme nedeni:`],
  [/^Optional notes for (.+) IB (.+):$/, (m,t) => `${m[2]} IB hesabında «${t(m[1])}» işlemi için isteğe bağlı notlar:`],
  [/^Confirm (.+) for IB (.+)\?$/, (m,t) => `${m[2]} IB hesabında «${t(m[1])}» işlemi onaylansın mı?`],
  [/^Failed to (.+) IB\.$/, (m,t) => `IB işlemi başarısız: ${t(m[1])}.`],
  [/^Type (.+) to remove IB (.+)\. This archives the IB and keeps audit history\.$/, m => `${m[2]} IB hesabını kaldırmak için ${m[1]} yazın. IB arşivlenir ve denetim geçmişi korunur.`],
  [/^Search in (.+)\.\.\.$/, (m,t) => `${t(m[1])} içinde ara...`],
  [/^Delete category "(.+)"\? This will fail if symbols are still assigned to it\.$/, m => `«${m[1]}» kategorisi silinsin mi? Hâlâ atanmış enstrümanlar varsa silme işlemi başarısız olur.`],
];

const prefixes = {
  'Change Order Price — #': 'Emir fiyatını değiştir — #', 'Approve Order — #': 'Emri onayla — #',
  'Reject Order — #': 'Emri reddet — #', 'Rollback Deal — #': 'Gerçekleşen işlemi geri al — #',
  'Change Price — #': 'Fiyatı değiştir — #', 'Change Volume — #': 'Hacmi değiştir — #',
  'Change Comment — #': 'Açıklamayı değiştir — #', 'Force Close — #': 'Zorla kapat — #',
  'Force Close All — Login ': 'Tümünü zorla kapat — Hesap ', 'Cancel Order #': 'Emri iptal et #',
  'Close Position #': 'Pozisyonu kapat #', 'Modify Position #': 'Pozisyonu değiştir #',
  'Approve Order #': 'Emri onayla #', 'Reject Order #': 'Emri reddet #',
  'Account details for ': 'Hesap ayrıntıları: ', 'Open details for client ': 'Müşteri ayrıntılarını aç: ',
  'Open details for position ': 'Pozisyon ayrıntılarını aç: ', 'Select position ': 'Pozisyon seç: ',
  'Edit account ': 'Hesabı düzenle: ', 'Edit Group: ': 'Grubu düzenle: ',
  'Duplicate Group: ': 'Grubu kopyala: ', 'Account ': 'Hesap ', 'Client ': 'Müşteri ',
};

const countLabels = {
  accounts: 'hesap', clients: 'müşteri', users: 'kullanıcı', 'online users': 'çevrimiçi kullanıcı',
  sessions: 'oturum', 'active sessions': 'aktif oturum', symbols: 'enstrüman', groups: 'grup',
  positions: 'pozisyon', trades: 'işlem', orders: 'emir', records: 'kayıt', items: 'öğe', rows: 'satır',
};

export function translateTurkishDynamic(value, translateLabel) {
  const count = value.match(/^(\d+)\s+([a-z ]+)$/i);
  if (count && countLabels[count[2].toLowerCase()]) return `${count[1]} ${countLabels[count[2].toLowerCase()]}`;
  for (const [pattern, translate] of templates) {
    const match = value.match(pattern);
    if (match) return translate(match, translateLabel);
  }
  for (const [prefix, translation] of Object.entries(prefixes)) {
    if (value.startsWith(prefix)) return translation + value.slice(prefix.length);
  }
  return null;
}
