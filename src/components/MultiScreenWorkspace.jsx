import React from 'react';
import { NewAccountModalContent } from './Popups/NewAccountModal';
import NewGroupModal from '../features/groups/components/NewGroupModal';
import { buildScreenGridRows, useMultiScreenStore } from '../store/multiScreenStore';

export default function MultiScreenWorkspace({ mode = 'account', onGroupSuccess, onAccountSuccess }) {
  const accountScreens = useMultiScreenStore((state) => state.accountScreens);
  const activeAccountScreenId = useMultiScreenStore((state) => state.activeAccountScreenId);
  const closeAccountScreen = useMultiScreenStore((state) => state.closeAccountScreen);
  const setActiveAccountScreen = useMultiScreenStore((state) => state.setActiveAccountScreen);

  const groupScreens = useMultiScreenStore((state) => state.groupScreens);
  const activeGroupScreenId = useMultiScreenStore((state) => state.activeGroupScreenId);
  const closeGroupScreen = useMultiScreenStore((state) => state.closeGroupScreen);
  const setActiveGroupScreen = useMultiScreenStore((state) => state.setActiveGroupScreen);

  const isGroupMode = mode === 'group';
  const screens = isGroupMode ? groupScreens : accountScreens;
  const activeScreenId = isGroupMode ? activeGroupScreenId : activeAccountScreenId;
  const closeScreen = isGroupMode ? closeGroupScreen : closeAccountScreen;
  const setActiveScreen = isGroupMode ? setActiveGroupScreen : setActiveAccountScreen;

  if (!screens.length) return null;

  const rows = buildScreenGridRows(screens);
  const screenIndexById = new Map(screens.map((screen, index) => [screen.id, index + 1]));

  return (
    <div
      className={`multi-screen-workspace multi-screen-workspace--${mode} multi-screen-count-${screens.length}`}
      data-testid={`multi-screen-workspace-${mode}`}
      data-screen-count={screens.length}
    >
      {rows.map((row, rowIndex) => (
        <div key={row.map((item) => item.id).join(':') || rowIndex} className="multi-screen-row">
          {row.map((screen) => {
            const isActive = screen.id === activeScreenId;
            const screenNumber = screenIndexById.get(screen.id) || 1;
            return (
              <div
                key={screen.id}
                className={`multi-screen-pane${isActive ? ' is-active' : ''}`}
                data-testid={`multi-screen-pane-${mode}-${screenNumber}`}
                data-screen-id={screen.id}
                data-screen-active={isActive ? 'true' : 'false'}
                onMouseEnter={() => {
                  if (!isActive) setActiveScreen(screen.id);
                }}
                onPointerDown={() => {
                  if (!isActive) setActiveScreen(screen.id);
                }}
                onFocusCapture={() => {
                  if (!isActive) setActiveScreen(screen.id);
                }}
              >
                {isGroupMode ? (
                  <NewGroupModal
                    embedded
                    screenNumber={screenNumber}
                    initialData={screen.initialData}
                    duplicateData={screen.duplicateData}
                    presetName={screen.presetName}
                    onClose={() => closeScreen(screen.id)}
                    onSuccess={(saved) => {
                      onGroupSuccess?.(saved, screen);
                    }}
                  />
                ) : (
                  <NewAccountModalContent
                    embedded
                    screenNumber={screenNumber}
                    onClose={() => closeScreen(screen.id)}
                    onSuccess={(created) => {
                      onAccountSuccess?.(created, screen);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
