import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('verifier_profile')
export class VerifierProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  did!: string;

  @Column('text', { unique: true })
  wallet!: string;

  @Column('text')
  fullName!: string;

  @Column('text')
  professionalId!: string;

  @Column('text')
  specialty!: string;

  @Column('text')
  licenseType!: string;

  @Column('text')
  legalName!: string;

  @Column('boolean', { default: false })
  legalNameVerified!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
