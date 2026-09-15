// Complete UI templates preserve customer names, identifiers and monetary values.
const templates = [
  [/^Account: (.+), (Hedge|Hedging|Netting)$/, (m,t) => `Счёт: ${m[1]}, ${t(m[2])}`],
  [/^Page\s+(\d+)\s+of\s+(\d+)$/i, m => `Страница ${m[1]} из ${m[2]}`],
  [/^Showing\s+([\d,–-]+)\s+of\s+([\d,]+|many)(?:\s+([a-z ]+))?$/i, (m,t) => `${m[3] ? t(m[3]) + ': ' : ''}показано ${m[1]} из ${m[2] === 'many' ? 'многих' : m[2]}`],
  [/^Sort by (.+)$/i, (m,t) => `Сортировка: ${t(m[1])}`],
  [/^(Resize|Maximize|Restore|Select) (.+?)( panel)?$/, (m,t) => `${{Resize:'Изменить размер',Maximize:'Развернуть',Restore:'Восстановить',Select:'Выбрать'}[m[1]]}: ${t(m[2])}`],
  [/^([^:]+):\s*([+-]?\d.*)$/, (m,t) => `${t(m[1])}: ${m[2]}`],
  [/^Latest desktop release: (.+)\. This browser session uses the web app; desktop updates are installed separately\.$/, m => `Последняя настольная версия: ${m[1]}. В браузере используется веб-приложение; обновления настольной версии устанавливаются отдельно.`],
  [/^User (.+) (blocked|unblocked) successfully\.$/, m => `Пользователь ${m[1]} ${m[2] === 'blocked' ? 'заблокирован' : 'разблокирован'}.`],
  [/^Are you sure you want to permanently delete account (.+)\?$/, m => `Вы действительно хотите навсегда удалить счёт ${m[1]}?`],
  [/^Account (.+) deleted successfully\.$/, m => `Счёт ${m[1]} удалён.`],
  [/^Rollback deal #(.+)\? This will adjust the account balance\.$/, m => `Отменить сделку №${m[1]}? Баланс счёта будет скорректирован.`],
  [/^Flip position #(.+)\?\s*Warning: SL\/TP values may be swapped due to a known issue\. Verify after flipping\.$/, m => `Развернуть позицию №${m[1]}? Внимание: из-за известной ошибки значения SL и TP могут поменяться местами. Проверьте их после разворота.`],
  [/^Force close ALL positions for login (.+)\?$/, m => `Принудительно закрыть ВСЕ позиции логина ${m[1]}?`],
  [/^Saving changes to account #(.+)\.$/, m => `Сохранение изменений счёта №${m[1]}.`],
  [/^Could not update account #(.+?): (.+) The fields have been reset to their last saved values\.$/, (m,t) => `Не удалось обновить счёт №${m[1]}: ${t(m[2])} Восстановлены последние сохранённые значения полей.`],
  [/^Password (Check|Change) Result:\s*(.+)$/, (m,t) => `Результат ${m[1] === 'Check' ? 'проверки' : 'изменения'} пароля: ${t(m[2])}`],
  [/^Error (checking|changing) password: (.+)$/, (m,t) => `Ошибка ${m[1] === 'checking' ? 'проверки' : 'изменения'} пароля: ${t(m[2])}`],
  [/^Deposit (.+) ([A-Z]{3}) into account #(\d+)\?$/, m => `Зачислить ${m[1]} ${m[2]} на счёт №${m[3]}?`],
  [/^Deposited (.+) ([A-Z]{3}) into account #(\d+) successfully\.$/, m => `На счёт №${m[3]} зачислено ${m[1]} ${m[2]}.`],
  [/^Deposit for account #(.+?): (.+)$/, (m,t) => `Пополнение счёта №${m[1]}: ${t(m[2])}`],
  [/^Live account details unavailable: (.+)$/, (m,t) => `Текущие сведения о счёте недоступны: ${t(m[1])}`],
  [/^Restrictions updated for login (.+)$/, m => `Ограничения логина ${m[1]} обновлены`],
  [/^Clear all restrictions for login (.+)\?$/, m => `Снять все ограничения логина ${m[1]}?`],
  [/^Restrictions cleared for (?:login )?(.+)$/, m => `Ограничения для ${m[1]} сняты`],
  [/^Spread markup set: (.+) = (.+)$/, m => `Наценка спреда установлена: ${m[1]} = ${m[2]}`],
  [/^Execution set: (.+), delay (.+)ms$/, (m,t) => `Исполнение установлено: ${t(m[1])}, задержка ${m[2]} мс`],
  [/^Book set to: (.+)$/, m => `Книга установлена: ${m[1]}`],
  [/^Place a (BUY|SELL|buy|sell) market order for (.+) lots of (.+) on account #(\d+)\?$/, m => `Разместить рыночный ордер на ${m[1].toLowerCase() === 'buy' ? 'покупку' : 'продажу'} ${m[2]} лота ${m[3]} на счёте №${m[4]}?`],
  [/^Place (.+) order$/, (m,t) => `Разместить ордер: ${t(m[1])}`],
  [/^Order exposure\. Raw volume (.+)\.$/, m => `Экспозиция ордера. Исходный объём ${m[1]}.`],
  [/^Opened order details for login (.+)\.$/, m => `Сведения об открытых ордерах логина ${m[1]}.`],
  [/^Copied (.+) row\(s\) as (.+)\.$/, m => `Скопировано строк: ${m[1]}, формат: ${m[2]}.`],
  [/^Copy failed: (.+)$/, (m,t) => `Ошибка копирования: ${t(m[1])}`],
  [/^All \((.+)\)$/, m => `Все (${m[1]})`],
  [/^Select all (.+) trades$/, m => `Выбрать все сделки (${m[1]})`],
  [/^Clear all (.+) trades$/, m => `Снять выбор всех сделок (${m[1]})`],
  [/^Successfully moved accounts from (.+) to (.+)$/, m => `Счета перенесены из ${m[1]} в ${m[2]}`],
  [/^Are you sure you want to delete group '(.+)'\?$/, m => `Вы действительно хотите удалить группу '${m[1]}'?`],
  [/^Group '(.+)' deleted successfully!$/, m => `Группа '${m[1]}' удалена!`],
  [/^Unlink client (.+) from IB (.+)\?$/, m => `Отвязать клиента ${m[1]} от IB ${m[2]}?`],
  [/^Pay eligible commissions for IB (.+) from (.+) through (.+)\?$/, m => `Выплатить доступные комиссии IB ${m[1]} за период с ${m[2]} по ${m[3]}?`],
  [/^Eligible commissions for IB (.+) were submitted for payment\.$/, m => `Доступные комиссии IB ${m[1]} отправлены на выплату.`],
  [/^Reason for rejecting IB (.+):$/, m => `Причина отклонения IB ${m[1]}:`],
  [/^Optional notes for (.+) IB (.+):$/, (m,t) => `Необязательные заметки для действия «${t(m[1])}» с IB ${m[2]}:`],
  [/^Confirm (.+) for IB (.+)\?$/, (m,t) => `Подтвердить действие «${t(m[1])}» для IB ${m[2]}?`],
  [/^Failed to (.+) IB\.$/, (m,t) => `Ошибка действия с IB: ${t(m[1])}.`],
  [/^Type (.+) to remove IB (.+)\. This archives the IB and keeps audit history\.$/, m => `Введите ${m[1]}, чтобы удалить IB ${m[2]}. IB будет архивирован с сохранением истории аудита.`],
  [/^Search in (.+)\.\.\.$/, (m,t) => `Поиск в разделе «${t(m[1])}»...`],
  [/^Delete category "(.+)"\? This will fail if symbols are still assigned to it\.$/, m => `Удалить категорию «${m[1]}»? Удаление невозможно, если ей ещё назначены инструменты.`],
];

const prefixes = {
  'Change Order Price — #': 'Изменить цену ордера — №', 'Approve Order — #': 'Одобрить ордер — №',
  'Reject Order — #': 'Отклонить ордер — №', 'Rollback Deal — #': 'Отменить сделку — №',
  'Change Price — #': 'Изменить цену — №', 'Change Volume — #': 'Изменить объём — №',
  'Change Comment — #': 'Изменить комментарий — №', 'Force Close — #': 'Принудительно закрыть — №',
  'Force Close All — Login ': 'Принудительно закрыть все — Логин ', 'Cancel Order #': 'Отменить ордер №',
  'Close Position #': 'Закрыть позицию №', 'Modify Position #': 'Изменить позицию №',
  'Approve Order #': 'Одобрить ордер №', 'Reject Order #': 'Отклонить ордер №',
  'Account details for ': 'Сведения о счёте ', 'Open details for client ': 'Открыть сведения о клиенте ',
  'Open details for position ': 'Открыть сведения о позиции ', 'Select position ': 'Выбрать позицию ',
  'Edit account ': 'Изменить счёт ', 'Edit Group: ': 'Изменить группу: ',
  'Duplicate Group: ': 'Дублировать группу: ', 'Account ': 'Счёт ', 'Client ': 'Клиент ',
};

export function translateRussianDynamic(value, translateLabel) {
  for (const [pattern, translate] of templates) {
    const match = value.match(pattern);
    if (match) return translate(match, translateLabel);
  }
  for (const [prefix, translation] of Object.entries(prefixes)) {
    if (value.startsWith(prefix)) return translation + value.slice(prefix.length);
  }
  return null;
}
