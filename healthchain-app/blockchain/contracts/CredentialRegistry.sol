// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract CredentialRegistry {
    struct Record {
        uint256 recordId;
        address issuer;
        address patient;
        string cid;
        bytes32 payloadHash;
        string credentialType;
        uint256 issuedAt;
    }

    uint256 private _nextRecordId = 1;

    mapping(uint256 => Record) private _recordsById;
    mapping(address => uint256[]) private _recordIdsByPatient;

    event RecordIssued(
        uint256 indexed recordId,
        address indexed issuer,
        address indexed patient,
        string cid,
        bytes32 payloadHash,
        string credentialType,
        uint256 issuedAt
    );

    function issueRecord(
        address patient,
        string calldata cid,
        bytes32 payloadHash,
        string calldata credentialType
    ) external returns (uint256) {
        require(patient != address(0), "Invalid patient address");
        require(bytes(cid).length > 0, "CID required");

        uint256 recordId = _nextRecordId;
        _nextRecordId += 1;

        Record memory rec = Record({
            recordId: recordId,
            issuer: msg.sender,
            patient: patient,
            cid: cid,
            payloadHash: payloadHash,
            credentialType: credentialType,
            issuedAt: block.timestamp
        });

        _recordsById[recordId] = rec;
        _recordIdsByPatient[patient].push(recordId);

        emit RecordIssued(
            recordId,
            msg.sender,
            patient,
            cid,
            payloadHash,
            credentialType,
            block.timestamp
        );

        return recordId;
    }

    function getPatientRecordCount(address patient) external view returns (uint256) {
        return _recordIdsByPatient[patient].length;
    }

    function getPatientRecordAt(address patient, uint256 index)
        external
        view
        returns (
            uint256 recordId,
            address issuer,
            address subject,
            string memory cid,
            bytes32 payloadHash,
            string memory credentialType,
            uint256 issuedAt
        )
    {
        require(index < _recordIdsByPatient[patient].length, "Index out of range");
        uint256 id = _recordIdsByPatient[patient][index];
        Record memory rec = _recordsById[id];
        return (
            rec.recordId,
            rec.issuer,
            rec.patient,
            rec.cid,
            rec.payloadHash,
            rec.credentialType,
            rec.issuedAt
        );
    }

    function getRecordById(uint256 recordId)
        external
        view
        returns (
            address issuer,
            address patient,
            string memory cid,
            bytes32 payloadHash,
            string memory credentialType,
            uint256 issuedAt
        )
    {
        Record memory rec = _recordsById[recordId];
        require(rec.recordId != 0, "Record not found");

        return (
            rec.issuer,
            rec.patient,
            rec.cid,
            rec.payloadHash,
            rec.credentialType,
            rec.issuedAt
        );
    }

    function verifyRecord(
        uint256 recordId,
        string calldata cid,
        bytes32 payloadHash
    ) external view returns (bool) {
        Record memory rec = _recordsById[recordId];
        if (rec.recordId == 0) return false;
        if (keccak256(bytes(rec.cid)) != keccak256(bytes(cid))) return false;
        if (rec.payloadHash != payloadHash) return false;
        return true;
    }
}
