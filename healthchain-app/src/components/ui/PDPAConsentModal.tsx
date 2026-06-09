import React, { useMemo, useState } from 'react';
import './PDPAConsentModal.css';

type PDPAConsentModalProps = {
  open: boolean;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

const PDPAConsentModal: React.FC<PDPAConsentModalProps> = ({
  open,
  busy = false,
  onAccept,
  onDecline,
}) => {
  const [checked, setChecked] = useState(false);

  const disabledConfirm = useMemo(() => busy || !checked, [busy, checked]);

  if (!open) return null;

  return (
    <div className="pdpa-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pdpa-modal-title">
      <div className="pdpa-modal-card">
        <h2 id="pdpa-modal-title">Personal Data Protection Consent Notice</h2>

        <div className="pdpa-modal-body">
          <p>
            - This system collects and processes your personal data in accordance with the Personal Data Protection Act
            2010 (PDPA) Malaysia. By continuing, you consent to the collection, use, storage, and processing of your
            personal data for the purposes stated in this notice.
          </p>

          <p>
            - The personal data that may be collected includes your wallet address, Decentralized Identifier (DID), role
            information, profile details, vaccination or medical credential information, encrypted credential files,
            IPFS content identifier (CID), and blockchain transaction or hash records.
          </p>

          <p>
            - Your personal data is collected for account registration, DID generation, role verification, credential
            issuance, encrypted credential storage, credential verification, audit logging, and system security
            purposes.
          </p>

          <p>
            -Medical credential data will be encrypted before storage. The system may store encrypted credential files
            using IPFS, while verification references such as hashes, CIDs, wallet addresses, and transaction records
            may be stored on the blockchain or system database. Access to data is restricted based on user roles, such
            as patient, doctor, verifier, and administrator.
          </p>

          <p>
            - Your personal data will not be disclosed to unauthorized third parties. It may only be accessed by
            authorized users according to their role and permission in the system.
          </p>

          <p>
            - Your personal data will only be retained for as long as necessary for system operation, credential
            verification, audit purposes, or legal and academic project requirements.
          </p>

          <label className="pdpa-modal-checkbox">
            <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            <span>
              I have read and understood this Personal Data Protection Consent Notice and consent to the collection,
              use, storage, and processing of my personal data for the purposes stated above.
            </span>
          </label>
        </div>

        <div className="pdpa-modal-actions">
          <button type="button" className="btn secondary" onClick={onDecline} disabled={busy}>
            Decline
          </button>
          <button type="button" className="btn primary" onClick={onAccept} disabled={disabledConfirm}>
            {busy ? 'Saving...' : 'I Consent'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PDPAConsentModal;
