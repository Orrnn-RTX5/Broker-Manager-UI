// Translate interface templates while retaining names, identifiers and monetary values.
const templates = [
  [/^Account: (.+), (Hedge|Hedging|Netting)$/, (m,t) => `口座: ${m[1]}, ${t(m[2])}`],
  [/^Page\s+(\d+)\s+of\s+(\d+)$/i, m => `${m[1]} / ${m[2]} ページ`],
  [/^Showing\s+([\d,–-]+)\s+of\s+([\d,]+|many)(?:\s+([a-z ]+))?$/i, (m,t) => `${m[3] ? t(m[3]) : '項目'}: 全${m[2] === 'many' ? '多数' : m[2]}件中 ${m[1]}件を表示`],
  [/^Sort by (.+)$/i, (m,t) => `${t(m[1])}で並べ替え`],
  [/^([+-]?\d+) today$/i, m => `本日 ${m[1]}`],
  [/^(\d+) pending$/i, m => `${m[1]}件保留中`],
  [/^(Resize|Maximize|Restore|Select) (.+?)( panel)?$/, (m,t) => `${t(m[2])}を${{Resize:'サイズ変更',Maximize:'最大化',Restore:'復元',Select:'選択'}[m[1]]}`],
  [/^([^:]+):\s*([+-]?\d.*)$/, (m,t) => `${t(m[1])}: ${m[2]}`],
  [/^Latest desktop release: (.+)\. This browser session uses the web app; desktop updates are installed separately\.$/, m => `最新のデスクトップ版: ${m[1]}。このブラウザーではウェブアプリを使用しています。デスクトップ版の更新は別途インストールします。`],
  [/^User (.+) (blocked|unblocked) successfully\.$/, m => `ユーザー ${m[1]} のブロック${m[2] === 'blocked' ? '' : '解除'}が完了しました。`],
  [/^Are you sure you want to permanently delete account (.+)\?$/, m => `口座 ${m[1]} を完全に削除しますか？`],
  [/^Account (.+) deleted successfully\.$/, m => `口座 ${m[1]} を削除しました。`],
  [/^Rollback deal #(.+)\? This will adjust the account balance\.$/, m => `約定 #${m[1]} を取り消しますか？口座残高が調整されます。`],
  [/^Flip position #(.+)\?\s*Warning: SL\/TP values may be swapped due to a known issue\. Verify after flipping\.$/, m => `ポジション #${m[1]} を反転しますか？警告: 既知の問題によりSLとTPの値が入れ替わる場合があります。反転後に確認してください。`],
  [/^Force close ALL positions for login (.+)\?$/, m => `ログイン ${m[1]} のすべてのポジションを強制決済しますか？`],
  [/^Saving changes to account #(.+)\.$/, m => `口座 #${m[1]} の変更を保存中です。`],
  [/^Could not update account #(.+?): (.+) The fields have been reset to their last saved values\.$/, (m,t) => `口座 #${m[1]} を更新できませんでした: ${t(m[2])} 入力欄を最後に保存した値に戻しました。`],
  [/^Password (Check|Change) Result:\s*(.+)$/, (m,t) => `パスワード${m[1] === 'Check' ? '確認' : '変更'}結果: ${t(m[2])}`],
  [/^Error (checking|changing) password: (.+)$/, (m,t) => `パスワード${m[1] === 'checking' ? '確認' : '変更'}エラー: ${t(m[2])}`],
  [/^Deposit (.+) ([A-Z]{3}) into account #(\d+)\?$/, m => `口座 #${m[3]} に ${m[1]} ${m[2]} を入金しますか？`],
  [/^Deposited (.+) ([A-Z]{3}) into account #(\d+) successfully\.$/, m => `口座 #${m[3]} に ${m[1]} ${m[2]} を入金しました。`],
  [/^Deposit for account #(.+?): (.+)$/, (m,t) => `口座 #${m[1]} への入金: ${t(m[2])}`],
  [/^Live account details unavailable: (.+)$/, (m,t) => `ライブ口座情報を取得できません: ${t(m[1])}`],
  [/^Restrictions updated for login (.+)$/, m => `ログイン ${m[1]} の制限を更新しました`],
  [/^Clear all restrictions for login (.+)\?$/, m => `ログイン ${m[1]} のすべての制限を解除しますか？`],
  [/^Restrictions cleared for (?:login )?(.+)$/, m => `${m[1]} の制限を解除しました`],
  [/^Spread markup set: (.+) = (.+)$/, m => `スプレッド上乗せを設定しました: ${m[1]} = ${m[2]}`],
  [/^Execution set: (.+), delay (.+)ms$/, (m,t) => `約定方法を設定しました: ${t(m[1])}、遅延 ${m[2]}ms`],
  [/^Book set to: (.+)$/, m => `ブックを設定しました: ${m[1]}`],
  [/^Place a (BUY|SELL|buy|sell) market order for (.+) lots of (.+) on account #(\d+)\?$/, (m,t) => `口座 #${m[4]} で ${m[3]} を ${m[2]} ロット、${t(m[1])}の成行注文を出しますか？`],
  [/^Place (.+) order$/, (m,t) => `${t(m[1])}注文を出す`],
  [/^Order exposure\. Raw volume (.+)\.$/, m => `注文エクスポージャー。元の取引量 ${m[1]}。`],
  [/^Opened order details for login (.+)\.$/, m => `ログイン ${m[1]} の注文詳細を開きました。`],
  [/^Copied (.+) row\(s\) as (.+)\.$/, m => `${m[1]}行を${m[2]}形式でコピーしました。`],
  [/^Copy failed: (.+)$/, (m,t) => `コピーできませんでした: ${t(m[1])}`],
  [/^All \((.+)\)$/, m => `すべて (${m[1]})`],
  [/^Select all (.+) trades$/, m => `${m[1]}件の取引をすべて選択`],
  [/^Clear all (.+) trades$/, m => `${m[1]}件の取引の選択をすべて解除`],
  [/^Successfully moved accounts from (.+) to (.+)$/, m => `口座を ${m[1]} から ${m[2]} に移動しました`],
  [/^Are you sure you want to delete group '(.+)'\?$/, m => `グループ '${m[1]}' を削除しますか？`],
  [/^Group '(.+)' deleted successfully!$/, m => `グループ '${m[1]}' を削除しました！`],
  [/^Unlink client (.+) from IB (.+)\?$/, m => `顧客 ${m[1]} とIB ${m[2]} の関連付けを解除しますか？`],
  [/^Pay eligible commissions for IB (.+) from (.+) through (.+)\?$/, m => `IB ${m[1]} の ${m[2]} から ${m[3]} までの支払い対象手数料を支払いますか？`],
  [/^Eligible commissions for IB (.+) were submitted for payment\.$/, m => `IB ${m[1]} の対象手数料の支払いを申請しました。`],
  [/^Reason for rejecting IB (.+):$/, m => `IB ${m[1]} の却下理由:`],
  [/^Optional notes for (.+) IB (.+):$/, (m,t) => `IB ${m[2]} の${t(m[1])}に関する備考（任意）:`],
  [/^Confirm (.+) for IB (.+)\?$/, (m,t) => `IB ${m[2]} の${t(m[1])}を確定しますか？`],
  [/^Failed to (.+) IB\.$/, (m,t) => `IBの操作に失敗しました: ${t(m[1])}。`],
  [/^Type (.+) to remove IB (.+)\. This archives the IB and keeps audit history\.$/, m => `IB ${m[2]} を削除するには ${m[1]} と入力してください。IBはアーカイブされ、監査履歴は保持されます。`],
  [/^Search in (.+)\.\.\.$/, (m,t) => `${t(m[1])}内を検索...`],
  [/^Delete category "(.+)"\? This will fail if symbols are still assigned to it\.$/, m => `カテゴリー「${m[1]}」を削除しますか？銘柄が割り当てられている場合は削除できません。`],
];

const prefixes = {
  'Change Order Price — #': '注文価格を変更 — #', 'Approve Order — #': '注文を承認 — #',
  'Reject Order — #': '注文を却下 — #', 'Rollback Deal — #': '約定を取り消し — #',
  'Change Price — #': '価格を変更 — #', 'Change Volume — #': '取引量を変更 — #',
  'Change Comment — #': 'コメントを変更 — #', 'Force Close — #': '強制決済 — #',
  'Force Close All — Login ': 'すべて強制決済 — ログイン ', 'Cancel Order #': '注文を取り消し #',
  'Close Position #': 'ポジションを決済 #', 'Modify Position #': 'ポジションを変更 #',
  'Approve Order #': '注文を承認 #', 'Reject Order #': '注文を却下 #',
  'Account details for ': '口座詳細: ', 'Open details for client ': '顧客詳細を開く: ',
  'Open details for position ': 'ポジション詳細を開く: ', 'Select position ': 'ポジションを選択: ',
  'Edit account ': '口座を編集: ', 'Edit Group: ': 'グループを編集: ',
  'Duplicate Group: ': 'グループを複製: ', 'Account ': '口座 ', 'Client ': '顧客 ',
};

export function translateJapaneseDynamic(value, translateLabel) {
  for (const [pattern, translate] of templates) {
    const match = value.match(pattern);
    if (match) return translate(match, translateLabel);
  }
  for (const [prefix, translation] of Object.entries(prefixes)) {
    if (value.startsWith(prefix)) return translation + value.slice(prefix.length);
  }
  return null;
}
