import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('doctor_profile')
export class DoctorProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text', { unique: true })
  did!: string;

  @Column('text', { unique: true })
  wallet!: string;

  @Column('text')
  displayName!: string;

  @Column('text')
  specialty!: string;

  @Column('text')
  hospitalOrClinic!: string;

  @Column('text')
  professionalId!: string;

  @Column('text', { nullable: true })
  licenseNumber?: string;

  @Column('text', { nullable: true })
  avatarUrl?: string;

  @Column('text')
  legalName!: string;

  @Column('boolean', { default: false })
  legalNameVerified!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
