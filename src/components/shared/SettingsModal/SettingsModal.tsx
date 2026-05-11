import type { ReactNode } from 'react';
import './SettingsModal.css';

interface SettingsModalProps {
  show: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function SettingsModal({ show, title, onClose, children }: SettingsModalProps) {
  if (!show) return null;
  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal__header">
          <h2>{title}</h2>
          <button
            type="button"
            className="settings-modal__close"
            aria-label="Close settings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="settings-modal__body">{children}</div>
      </div>
    </div>
  );
}
