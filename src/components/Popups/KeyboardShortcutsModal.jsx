import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions.js';
import { PERMISSIONS } from '../../utils/permissions.js';

const SHORTCUT_GROUPS = [
  {
    title: 'Quick actions',
    shortcuts: [
      { keys: [['Ctrl', 'K']], label: 'Open quick search' },
      { keys: [['Ctrl', 'R']], label: 'Refresh current data' },
      { keys: [['Ctrl', 'Shift', 'N']], label: 'Create a new account' },
      { keys: [['Ctrl', '/']], label: 'Open this shortcut toolbox' },
      { keys: [['Alt', 'R'], ['F11']], label: 'Toggle fullscreen' },
    ],
  },
  {
    title: 'Workspace and panels',
    shortcuts: [
      { keys: [['Alt', 'N']], label: 'Show or hide Navigator' },
      { keys: [['Ctrl', 'M']], label: 'Show or hide Market Watch' },
      { keys: [['Ctrl', 'L']], label: 'Show or hide the account panel' },
      { keys: [['Ctrl', 'Q']], label: 'Open the dealer queue' },
      { keys: [['Ctrl', 'T']], label: 'Show or hide the toolbar' },
      { keys: [['Alt', 'T']], label: 'Reset the workspace layout' },
    ],
  },
  {
    title: 'Page navigation',
    description: 'Available when you are not typing in a field.',
    shortcuts: [
      { keys: [['C']], label: 'Open Clients' },
      { keys: [['O']], label: 'Open Orders' },
      { keys: [['P']], label: 'Open Positions', permission: PERMISSIONS.VIEW_POSITIONS },
    ],
  },
  {
    title: 'Groups page',
    description: 'Available while the Groups page is active.',
    shortcuts: [
      { keys: [['Ctrl', 'A']], label: 'Select visible groups' },
      { keys: [['Ctrl', 'C']], label: 'Copy selected groups' },
      { keys: [['Enter']], label: 'Edit the selected group' },
      { keys: [['Esc']], label: 'Clear the group selection' },
    ],
  },
];

const KeyCombination = ({ alternatives }) => (
  <span className="keyboard-shortcuts-keys">
    {alternatives.map((combination, alternativeIndex) => (
      <span key={combination.join('+')} className="keyboard-shortcuts-combination">
        {alternativeIndex > 0 && <span className="keyboard-shortcuts-or">or</span>}
        <kbd>{combination.join(' + ')}</kbd>
      </span>
    ))}
  </span>
);

const KeyboardShortcutsModal = ({ onClose }) => {
  const { canAct } = usePermissions();
  const canViewPositions = canAct(PERMISSIONS.VIEW_POSITIONS);
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [onClose]);

  return (
    <div className="keyboard-shortcuts-backdrop" role="presentation" onMouseDown={() => onClose?.()}>
      <section
        className="keyboard-shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="keyboard-shortcuts-header">
          <div className="keyboard-shortcuts-heading-icon"><Keyboard size={17} /></div>
          <div>
            <h2 id="keyboard-shortcuts-title">Shortcut Toolbox</h2>
            <p>Keyboard shortcuts available across Broker Manager.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close shortcut toolbox">
            <X size={16} />
          </button>
        </header>

        <div className="keyboard-shortcuts-body">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="keyboard-shortcuts-group">
              <div className="keyboard-shortcuts-group-heading">
                <h3>{group.title}</h3>
                {group.description && <p>{group.description}</p>}
              </div>
              <div>
                {group.shortcuts.filter((shortcut) => !shortcut.permission || canViewPositions).map((shortcut) => (
                  <div key={`${group.title}-${shortcut.label}`} className="keyboard-shortcuts-row">
                    <span>{shortcut.label}</span>
                    <KeyCombination alternatives={shortcut.keys} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="keyboard-shortcuts-footer">
          Shortcuts are paused while typing in a text field, except application commands such as Ctrl+K and Ctrl+/.
        </footer>
      </section>
    </div>
  );
};

export default KeyboardShortcutsModal;
