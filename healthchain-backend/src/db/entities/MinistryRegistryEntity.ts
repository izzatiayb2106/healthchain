import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ministry_registry')
export class MinistryRegistry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  professionalId!: string;

  @Column('text')
  fullName!: string;

  @Column('text')
  licenseType!: string;

  @Column('text')
  specialty!: string;

  @Column('text')
  status!: 'active' | 'inactive' | 'suspended' | 'expired';

  @Column('text')
  role!: 'doctor' | 'verifier';

  @Column('date')
  validUntil!: Date;

  @Column('text', { nullable: true, default: '' })
  linkedWallet?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
