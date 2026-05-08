import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('identity_mapping')
export class IdentityMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  wallet!: string;

  @Column('text', { unique: true })
  did!: string;

  @Column('text')
  role!: 'pending' | 'patient' | 'doctor' | 'verifier' | 'admin';

  @Column('boolean', { default: false })
  locked!: boolean;

  @Column('text', { nullable: true })
  lockReason?: string;

  @Column('datetime', { nullable: true })
  lockedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
