# HealthChain

### Decentralized Digital Health Passport Using Blockchain and Verifiable Credentials

HealthChain is a **decentralized digital health wallet prototype** designed to provide secure, verifiable, and user-controlled management of digital health records.

The project explores how **blockchain technology, decentralized storage, and Verifiable Credentials (VCs)** can be combined to improve the security, integrity, and accessibility of electronic medical records while giving users greater control over who can access their health information.

---

## Features

* **Decentralized Health Records**

  * Store health-record data using blockchain and decentralized storage technologies.
  * Leverage Ethereum and IPFS to support tamper-resistant record management.

* **Verifiable Credentials**

  * Issue and manage digitally verifiable health credentials.
  * Enable cryptographic verification of credential authenticity.

* **Blockchain-Based Verification**

  * Use Ethereum smart contracts to support trusted and immutable record-related operations.
  * Provide a transparent mechanism for verifying blockchain transactions and records.

* **Role-Based Access Control**

  * Control access to electronic medical records based on user roles.
  * Help ensure that sensitive health information is only accessible to authorized parties.

* **Digital Health Wallet**

  * Provide a centralized interface for users to manage their digital health credentials and records while using decentralized technologies underneath.

---

## Technology Stack

| Technology     | Purpose                                           |
| -------------- | ------------------------------------------------- |
| **React**      | Frontend application                              |
| **Vite**       | Frontend development and build tooling            |
| **Ethereum**   | Blockchain network                                |
| **Solidity**   | Smart contract development                        |
| **Hardhat**    | Smart contract development and testing            |
| **MetaMask**   | Blockchain wallet and transaction management      |
| **Veramo**     | Decentralized identity and Verifiable Credentials |
| **IPFS**       | Decentralized storage                             |
| **JavaScript** | Application development                           |

---

## System Overview

HealthChain combines several technologies to create a decentralized health-record ecosystem:

```text
                    ┌─────────────────────┐
                    │       User          │
                    │   Digital Wallet    │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    React + Vite     │
                    │   Web Application    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
     ┌─────────────────┐              ┌─────────────────┐
     │     Veramo      │              │    MetaMask     │
     │      DID/VC     │              │     Wallet      │
     └────────┬────────┘              └────────┬────────┘
              │                                │
              ▼                                ▼
     ┌─────────────────┐              ┌─────────────────┐
     │      IPFS       │              │    Ethereum     │
     │ Decentralized   │              │ Smart Contracts │
     │    Storage      │              │                 │
     └─────────────────┘              └─────────────────┘
```

### How It Works

1. A user interacts with the HealthChain web application.
2. Health records and credentials are managed through the digital health wallet.
3. Relevant data can be stored using **IPFS** for decentralized storage.
4. **Ethereum smart contracts** provide blockchain-based operations and verification.
5. **MetaMask** is used to interact with the Ethereum blockchain.
6. **Veramo** supports decentralized identity and Verifiable Credential functionality.
7. Role-based access control helps regulate access to electronic medical records.

---

## Project Objectives

The main objectives of HealthChain are to:

* Develop a decentralized approach to digital health-record management.
* Improve the integrity and traceability of health records.
* Explore the use of **Verifiable Credentials** for digital health information.
* Provide users with greater control over their health information.
* Implement access control mechanisms for sensitive medical records.
* Demonstrate the practical application of blockchain and decentralized identity technologies in healthcare.

---

## Key Concepts

### Blockchain

Ethereum is used to provide a decentralized and tamper-resistant environment for blockchain-based operations.

### Decentralized Storage

IPFS is used as a decentralized storage layer, reducing reliance on a single centralized storage location.

### Verifiable Credentials

Verifiable Credentials provide a cryptographically verifiable way to represent digital health information and credentials.

### Decentralized Identity

Veramo is used to explore decentralized identity functionality and credential management.

### Access Control

Role-based access control is implemented to manage permissions when accessing electronic medical records.

---

## Project Structure

```text
HealthChain/
│
├── contracts/          # Ethereum smart contracts
├── scripts/            # Blockchain deployment/scripts
├── test/               # Smart contract tests
├── src/                # React application
│   ├── components/     # Reusable UI components
│   ├── pages/          # Application pages
│   └── ...
│
├── public/             # Static assets
├── hardhat.config.js   # Hardhat configuration
├── package.json        # Project dependencies
└── README.md
```

> The project structure above may be adjusted to match the final repository structure.

---

## Getting Started

### Prerequisites

Make sure you have the following installed:

* Node.js
* npm
* MetaMask
* Git

### Installation

Clone the repository:

```bash
git clone https://github.com/your-username/healthchain.git
cd healthchain
```

Install dependencies:

```bash
npm install
```

### Run the Development Server

```bash
npm run dev
```

The application should then be available through the local development server provided by Vite.

### Compile Smart Contracts

```bash
npx hardhat compile
```

### Run Smart Contract Tests

```bash
npx hardhat test
```

---

## Security Considerations

HealthChain is an **academic prototype** developed to demonstrate the application of blockchain and decentralized identity technologies to digital health records.

Because healthcare data is highly sensitive, a production implementation would require additional security measures, including comprehensive privacy protection, secure key management, regulatory compliance, encryption strategies, and extensive security testing.

**Do not use real patient or medical information with this prototype.**

---

## Project Context

HealthChain was developed as a **Final Year Project (FYP)** at **Universiti Sains Malaysia (USM)**.

The project investigates the potential of blockchain, decentralized storage, decentralized identity, and Verifiable Credentials in addressing challenges associated with traditional centralized electronic health-record systems.

---

## Skills Demonstrated

This project provided practical experience in:

* Blockchain development
* Ethereum and smart contracts
* Solidity
* React.js
* Vite
* Decentralized storage with IPFS
* Decentralized Identity (DID)
* Verifiable Credentials
* MetaMask integration
* Role-Based Access Control (RBAC)
* Web application development
* System integration
* Security-focused application design

---

## Disclaimer

HealthChain is an academic prototype created for educational and research purposes. It is **not intended for use as a production healthcare information system** and should not be used to store real patient data.
