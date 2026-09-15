// Translate full interface templates while preserving customer data and amounts.
const templates = [
  [/^Account: (.+), (Hedge|Hedging|Netting)$/, (m,t) => `Cuenta: ${m[1]}, ${t(m[2])}`],
  [/^Page\s+(\d+)\s+of\s+(\d+)$/i, m => `Página ${m[1]} de ${m[2]}`],
  [/^Showing\s+([\d,–-]+)\s+of\s+([\d,]+|many)(?:\s+([a-z ]+))?$/i, (m,t) => `Mostrando ${m[1]} de ${m[2] === 'many' ? 'muchos' : m[2]}${m[3] ? ' ' + t(m[3]).toLowerCase() : ''}`],
  [/^Sort by (.+)$/i, (m,t) => `Ordenar por: ${t(m[1])}`],
  [/^(\d+) pending$/i, m => `${m[1]} ${m[1] === '1' ? 'pendiente' : 'pendientes'}`],
  [/^(Resize|Maximize|Restore|Select) (.+?)( panel)?$/, (m,t) => `${{Resize:'Cambiar tamaño',Maximize:'Maximizar',Restore:'Restaurar',Select:'Seleccionar'}[m[1]]}: ${t(m[2])}`],
  [/^([^:]+):\s*([+-]?\d.*)$/, (m,t) => t(m[1]) !== m[1] ? `${t(m[1])}: ${m[2]}` : null],
  [/^Latest desktop release: (.+)\. This browser session uses the web app; desktop updates are installed separately\.$/, m => `Última versión de escritorio: ${m[1]}. Esta sesión del navegador usa la aplicación web; las actualizaciones de escritorio se instalan por separado.`],
  [/^User (.+) (blocked|unblocked) successfully\.$/, m => `Usuario ${m[1]} ${m[2] === 'blocked' ? 'bloqueado' : 'desbloqueado'} correctamente.`],
  [/^Are you sure you want to permanently delete account (.+)\?$/, m => `¿Seguro que desea eliminar permanentemente la cuenta ${m[1]}?`],
  [/^Account (.+) deleted successfully\.$/, m => `Cuenta ${m[1]} eliminada correctamente.`],
  [/^Rollback deal #(.+)\? This will adjust the account balance\.$/, m => `¿Revertir la transacción n.º ${m[1]}? Se ajustará el saldo de la cuenta.`],
  [/^Flip position #(.+)\?\s*Warning: SL\/TP values may be swapped due to a known issue\. Verify after flipping\.$/, m => `¿Invertir la posición n.º ${m[1]}? Advertencia: un problema conocido puede intercambiar los valores SL y TP. Verifíquelos después de invertirla.`],
  [/^Force close ALL positions for login (.+)\?$/, m => `¿Forzar el cierre de TODAS las posiciones del ID de acceso ${m[1]}?`],
  [/^Saving changes to account #(.+)\.$/, m => `Guardando cambios en la cuenta n.º ${m[1]}.`],
  [/^Could not update account #(.+?): (.+) The fields have been reset to their last saved values\.$/, (m,t) => `No se pudo actualizar la cuenta n.º ${m[1]}: ${t(m[2])} Se han restaurado los últimos valores guardados de los campos.`],
  [/^Password (Check|Change) Result:\s*(.+)$/, (m,t) => `Resultado de ${m[1] === 'Check' ? 'verificación' : 'cambio'} de contraseña: ${t(m[2])}`],
  [/^Error (checking|changing) password: (.+)$/, (m,t) => `Error al ${m[1] === 'checking' ? 'verificar' : 'cambiar'} la contraseña: ${t(m[2])}`],
  [/^Deposit (.+) ([A-Z]{3}) into account #(\d+)\?$/, m => `¿Depositar ${m[1]} ${m[2]} en la cuenta n.º ${m[3]}?`],
  [/^Deposited (.+) ([A-Z]{3}) into account #(\d+) successfully\.$/, m => `Se depositaron ${m[1]} ${m[2]} en la cuenta n.º ${m[3]}.`],
  [/^Deposit for account #(.+?): (.+)$/, (m,t) => `Depósito para la cuenta n.º ${m[1]}: ${t(m[2])}`],
  [/^Live account details unavailable: (.+)$/, (m,t) => `Detalles de la cuenta en tiempo real no disponibles: ${t(m[1])}`],
  [/^Restrictions updated for login (.+)$/, m => `Restricciones actualizadas para el ID de acceso ${m[1]}`],
  [/^Clear all restrictions for login (.+)\?$/, m => `¿Quitar todas las restricciones del ID de acceso ${m[1]}?`],
  [/^Restrictions cleared for (?:login )?(.+)$/, m => `Restricciones eliminadas para ${m[1]}`],
  [/^Spread markup set: (.+) = (.+)$/, m => `Recargo del diferencial establecido: ${m[1]} = ${m[2]}`],
  [/^Execution set: (.+), delay (.+)ms$/, (m,t) => `Ejecución establecida: ${t(m[1])}, retraso de ${m[2]} ms`],
  [/^Book set to: (.+)$/, m => `Libro establecido: ${m[1]}`],
  [/^Place a (BUY|SELL|buy|sell) market order for (.+) lots of (.+) on account #(\d+)\?$/, m => `¿Colocar una orden de ${m[1].toLowerCase() === 'buy' ? 'compra' : 'venta'} a mercado de ${m[2]} lotes de ${m[3]} en la cuenta n.º ${m[4]}?`],
  [/^Place (.+) order$/, (m,t) => `Colocar orden: ${t(m[1])}`],
  [/^Order exposure\. Raw volume (.+)\.$/, m => `Exposición de la orden. Volumen original ${m[1]}.`],
  [/^Opened order details for login (.+)\.$/, m => `Detalles de órdenes abiertas para el ID de acceso ${m[1]}.`],
  [/^Copied (.+) row\(s\) as (.+)\.$/, m => `Filas copiadas: ${m[1]}, formato: ${m[2]}.`],
  [/^Copy failed: (.+)$/, (m,t) => `Error al copiar: ${t(m[1])}`],
  [/^All \((.+)\)$/, m => `Todos (${m[1]})`],
  [/^Select all (.+) trades$/, m => `Seleccionar todas las operaciones (${m[1]})`],
  [/^Clear all (.+) trades$/, m => `Deseleccionar todas las operaciones (${m[1]})`],
  [/^Successfully moved accounts from (.+) to (.+)$/, m => `Cuentas trasladadas de ${m[1]} a ${m[2]}`],
  [/^Are you sure you want to delete group '(.+)'\?$/, m => `¿Seguro que desea eliminar el grupo '${m[1]}'?`],
  [/^Group '(.+)' deleted successfully!$/, m => `¡Grupo '${m[1]}' eliminado!`],
  [/^Unlink client (.+) from IB (.+)\?$/, m => `¿Desvincular al cliente ${m[1]} del IB ${m[2]}?`],
  [/^Pay eligible commissions for IB (.+) from (.+) through (.+)\?$/, m => `¿Pagar las comisiones disponibles del IB ${m[1]} desde ${m[2]} hasta ${m[3]}?`],
  [/^Eligible commissions for IB (.+) were submitted for payment\.$/, m => `Se solicitó el pago de las comisiones disponibles del IB ${m[1]}.`],
  [/^Reason for rejecting IB (.+):$/, m => `Motivo del rechazo del IB ${m[1]}:`],
  [/^Optional notes for (.+) IB (.+):$/, (m,t) => `Notas opcionales para la acción «${t(m[1])}» del IB ${m[2]}:`],
  [/^Confirm (.+) for IB (.+)\?$/, (m,t) => `¿Confirmar la acción «${t(m[1])}» para el IB ${m[2]}?`],
  [/^Failed to (.+) IB\.$/, (m,t) => `Error en la acción del IB: ${t(m[1])}.`],
  [/^Type (.+) to remove IB (.+)\. This archives the IB and keeps audit history\.$/, m => `Escriba ${m[1]} para eliminar el IB ${m[2]}. Se archivará el IB y se conservará el historial de auditoría.`],
  [/^Search in (.+)\.\.\.$/, (m,t) => `Buscar en ${t(m[1])}...`],
  [/^Delete category "(.+)"\? This will fail if symbols are still assigned to it\.$/, m => `¿Eliminar la categoría «${m[1]}»? No será posible si aún tiene instrumentos asignados.`],
];

const prefixes = {
  'Change Order Price — #': 'Cambiar precio de la orden — n.º ', 'Approve Order — #': 'Aprobar orden — n.º ',
  'Reject Order — #': 'Rechazar orden — n.º ', 'Rollback Deal — #': 'Revertir transacción — n.º ',
  'Change Price — #': 'Cambiar precio — n.º ', 'Change Volume — #': 'Cambiar volumen — n.º ',
  'Change Comment — #': 'Cambiar comentario — n.º ', 'Force Close — #': 'Forzar cierre — n.º ',
  'Force Close All — Login ': 'Forzar cierre de todas — ID de acceso ', 'Cancel Order #': 'Cancelar orden n.º ',
  'Close Position #': 'Cerrar posición n.º ', 'Modify Position #': 'Modificar posición n.º ',
  'Approve Order #': 'Aprobar orden n.º ', 'Reject Order #': 'Rechazar orden n.º ',
  'Account details for ': 'Detalles de la cuenta ', 'Open details for client ': 'Abrir detalles del cliente ',
  'Open details for position ': 'Abrir detalles de la posición ', 'Select position ': 'Seleccionar posición ',
  'Edit account ': 'Editar cuenta ', 'Edit Group: ': 'Editar grupo: ',
  'Duplicate Group: ': 'Duplicar grupo: ', 'Account ': 'Cuenta ', 'Client ': 'Cliente ',
};

const countLabels = {
  accounts: ['cuenta', 'cuentas'], clients: ['cliente', 'clientes'],
  users: ['usuario', 'usuarios'], 'online users': ['usuario conectado', 'usuarios conectados'],
  sessions: ['sesión', 'sesiones'], 'active sessions': ['sesión activa', 'sesiones activas'],
  symbols: ['instrumento', 'instrumentos'], groups: ['grupo', 'grupos'],
  positions: ['posición', 'posiciones'], trades: ['operación', 'operaciones'],
  orders: ['orden', 'órdenes'], records: ['registro', 'registros'], items: ['elemento', 'elementos'], rows: ['fila', 'filas'],
};

export function translateSpanishDynamic(value, translateLabel) {
  const count = value.match(/^(\d+)\s+([a-z ]+)$/i);
  if (count && countLabels[count[2].toLowerCase()]) {
    return `${count[1]} ${countLabels[count[2].toLowerCase()][Number(count[1]) === 1 ? 0 : 1]}`;
  }
  for (const [pattern, translate] of templates) {
    const match = value.match(pattern);
    if (match) return translate(match, translateLabel);
  }
  for (const [prefix, translation] of Object.entries(prefixes)) {
    if (value.startsWith(prefix)) return translation + value.slice(prefix.length);
  }
  return null;
}
