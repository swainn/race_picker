import type { Entry } from '../types';
import { EntryManager } from './EntryManager';
import './ManagementDialog.css';

interface Group {
  id: number;
  name: string;
  entries: Entry[];
  timestamp: number;
}

interface Props {
  entries: Entry[];
  onEntriesChange: (entries: Entry[]) => void;
  eliminatedIds: number[];
  winOrder: Map<number, number>;
  onResetAll: () => void;
  groupNameInput: string;
  onGroupNameInputChange: (value: string) => void;
  onSaveGroup: () => void;
  groups: Group[];
  onLoadGroup: (groupId: number) => void;
  onDeleteGroup: (groupId: number) => void;
  onClose: () => void;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ManagementDialog({
  entries,
  onEntriesChange,
  eliminatedIds,
  winOrder,
  onResetAll,
  groupNameInput,
  onGroupNameInputChange,
  onSaveGroup,
  groups,
  onLoadGroup,
  onDeleteGroup,
  onClose,
}: Props) {
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="management-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="management-header">
          <h2>⚙️ Manage Participants &amp; Groups</h2>
          <button
            type="button"
            className="management-close-x"
            aria-label="Close management dialog"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="management-body">
          <div className="management-section">
            <h3 className="section-title">👥 Participants</h3>
            <EntryManager
              entries={entries}
              onEntriesChange={onEntriesChange}
              eliminatedIds={eliminatedIds}
              winOrder={winOrder}
            />
            {entries.length > 0 && (
              <button onClick={onResetAll} className="reset-button-modal">
                Clear All Participants
              </button>
            )}
          </div>

          <div className="management-section">
            <h3 className="section-title">💾 Groups</h3>

            <div className="save-group-box">
              <p className="save-group-label">Save current participants as a group:</p>
              <div className="save-group-controls">
                <input
                  type="text"
                  value={groupNameInput}
                  onChange={(e) => onGroupNameInputChange(e.target.value)}
                  placeholder="Group name (optional)..."
                  className="group-name-input-modal"
                  onKeyPress={(e) => e.key === 'Enter' && onSaveGroup()}
                />
                <button
                  onClick={onSaveGroup}
                  className="save-group-button-modal"
                  disabled={entries.length === 0}
                >
                  Save Group
                </button>
              </div>
            </div>

            {groups.length > 0 ? (
              <div className="saved-groups-box">
                <p className="saved-groups-label">Saved groups ({groups.length}):</p>
                <div className="groups-list-modal">
                  {groups.map((group) => (
                    <div key={group.id} className="group-item-modal">
                      <div className="group-info-modal">
                        <p className="group-name-modal">{group.name}</p>
                        <p className="group-meta">
                          {group.entries.length} participants • {formatDate(group.timestamp)}
                        </p>
                      </div>
                      <div className="group-buttons-modal">
                        <button
                          onClick={() => {
                            onLoadGroup(group.id);
                            onClose();
                          }}
                          className="load-group-button-modal"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => onDeleteGroup(group.id)}
                          className="delete-group-button-modal"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="no-groups-message">
                No saved groups yet. Save your current participants to create a group!
              </p>
            )}
          </div>

          <button onClick={onClose} className="close-management-button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
