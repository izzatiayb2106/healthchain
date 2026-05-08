import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('hybrid_credential')
export class HybridCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  cid!: string;

  @Column('text')
  payloadHash!: string;

  @Column('text')
  encryptedCredentialHex!: string;

  @Column('text')
  subjectDid!: string;

  @Column('text')
  subjectWallet!: string;

  @Column('text')
  issuerDid!: string;

  @Column('text')
  credentialType!: string;

  @CreateDateColumn()
  issuedAt!: Date;

  @Column('datetime', { nullable: true })
  expirationDate?: Date | null;

  @Column('text', { nullable: true })
  expirationPolicy?: string | null;

  @Column('text', { nullable: true })
  source?: string | null;

  @Column('text', { nullable: true })
  legacyIssuedAt?: string | null;

  @Column('text')
  storageMode!: string;

  @Column('text', { nullable: true })
  txHash?: string | null;

  @Column('text', { nullable: true })
  chainId?: string | null;

  @Column('text', { nullable: true })
  contractAddress?: string | null;

  @Column('text', { nullable: true })
  recordId?: string | null;

  @Column('datetime', { nullable: true })
  finalizedAt?: Date | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}
