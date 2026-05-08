import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('patient_profile')
export class PatientProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  did!: string;

  @Column('text', { unique: true })
  wallet!: string;

  @Column('text')
  fullName!: string;

  @Column('text')
  dateOfBirth!: string;

  @Column('text')
  bloodType!: string;

  @Column('text')
  phone!: string;

  @Column('text')
  email!: string;

  @Column('text', { nullable: true })
  emergencyContact?: string;

  @Column('text', { nullable: true })
  encryptionPublicKey?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
