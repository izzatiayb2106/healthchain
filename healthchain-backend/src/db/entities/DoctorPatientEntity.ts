import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('doctor_patient')
export class DoctorPatient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  doctorDid!: string;

  @Column('text')
  doctorWallet!: string;

  @Column('text')
  patientWallet!: string;

  @Column('text')
  patientDid!: string;

  @CreateDateColumn()
  addedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
