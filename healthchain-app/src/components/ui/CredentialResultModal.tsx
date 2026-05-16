import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  issuedTo?: string;
  credentialType?: string;
  cid?: string;
  recordId?: string | number | null;
  txHash?: string | null;
};

const CredentialResultModal: React.FC<Props> = ({ open, onClose, title = 'Credential issued successfully!', issuedTo, credentialType, cid, recordId, txHash }) => {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="vaccine-form-modal credential-result-modal">
        <h2>{title}</h2>

        <div style={{ marginTop: 12, color: 'var(--doctor-muted)' }}>
          {issuedTo ? (
            <p><strong>Issued to:</strong><br />{issuedTo}</p>
          ) : null}

          {credentialType ? <p><strong>Credential type:</strong> {credentialType}</p> : null}
          {cid ? <p style={{ wordBreak: 'break-all' }}><strong>CID:</strong> {cid}</p> : null}
          {recordId !== undefined && recordId !== null ? <p><strong>Record ID:</strong> {String(recordId)}</p> : null}
          {txHash ? <p style={{ wordBreak: 'break-all' }}><strong>Tx Hash:</strong> {txHash}</p> : null}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn btn-secondary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
};

export default CredentialResultModal;
