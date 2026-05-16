import React from 'react';

type Props = {
  open: boolean;
  title?: string;
  message?: string | React.ReactNode;
  onClose: () => void;
  okLabel?: string;
};

const InfoModal: React.FC<Props> = ({ open, title = 'Info', message, onClose, okLabel = 'OK' }) => {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="vaccine-form-modal info-modal">
        <h2>{title}</h2>
        <div style={{ marginTop: 12, color: 'var(--doctor-muted)' }}>{typeof message === 'string' ? <p style={{ whiteSpace: 'pre-wrap' }}>{message}</p> : message}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn btn-secondary" onClick={onClose}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;
