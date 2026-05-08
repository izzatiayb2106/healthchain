import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  timestamp!: Date;

  @Column('text')
  action!: string;

  @Column('text')
  role!: string;

  @Column('text')
  wallet!: string;

  @Column('text', { nullable: true })
  did?: string;

  @Column('text')
  status!: string;

  @Column('text', { nullable: true })
  details?: string;

  @Column('text', { nullable: true })
  metadata?: string | null;
}
