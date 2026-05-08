import 'reflect-metadata'
import { DataSource } from 'typeorm'

const DB = 'database.sqlite'

async function tableExists(ds: DataSource, name: string) {
  const rows: any[] = await ds.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name])
  return rows.length > 0
}

async function getColumns(ds: DataSource, table: string): Promise<string[]> {
  const cols: any[] = await ds.query(`PRAGMA table_info(\"${table}\")`)
  return cols.map(c => c.name)
}

async function mergeTables(ds: DataSource, src: string, dst: string) {
  const srcExists = await tableExists(ds, src)
  const dstExists = await tableExists(ds, dst)
  if (!srcExists) {
    console.log(`  - source table ${src} does not exist, skipping`)
    return
  }
  if (!dstExists) {
    console.log(`  - destination table ${dst} does not exist, skipping`)
    return
  }

  const srcCols = await getColumns(ds, src)
  const dstCols = await getColumns(ds, dst)
  const common = srcCols.filter(c => dstCols.includes(c))
  if (common.length === 0) {
    console.log(`  - no common columns between ${src} and ${dst}, skipping`)
    return
  }

  // Count before
  const before: any = await ds.query(`SELECT COUNT(*) as c FROM \"${dst}\"`)
  const beforeCount = before[0].c

  const colsList = common.map(c => `\"${c}\"`).join(',')

  // Determine matching key: prefer id, then did, then professionalId, then cid
  let matchKey: string | null = null
  if (common.includes('id')) matchKey = 'id'
  else if (common.includes('did')) matchKey = 'did'
  else if (common.includes('professionalId')) matchKey = 'professionalId'
  else if (common.includes('cid')) matchKey = 'cid'

  if (!matchKey) {
    console.log(`  - could not determine match key for ${src} -> ${dst}, skipping`)
    return
  }

  // Insert rows from src that don't exist in dst by matchKey
  const sql = `INSERT INTO \"${dst}\" (${colsList}) SELECT ${colsList} FROM \"${src}\" src WHERE NOT EXISTS (SELECT 1 FROM \"${dst}\" dst WHERE dst.\"${matchKey}\" = src.\"${matchKey}\")`
  await ds.query(sql)

  const after: any = await ds.query(`SELECT COUNT(*) as c FROM \"${dst}\"`)
  const afterCount = after[0].c
  console.log(`  - merged ${Math.max(0, afterCount - beforeCount)} rows from ${src} -> ${dst}`)
}

async function main() {
  const ds = new DataSource({ type: 'sqlite', database: DB, entities: [], synchronize: false })
  await ds.initialize()
  console.log('Connected to', DB)

  // Pairs of duplicate/plural -> canonical table names
  const pairs: Array<[string, string]> = [
    ['doctor_profiles', 'doctor_profile'],
    ['patient_profiles', 'patient_profile'],
    ['verifier_profiles', 'verifier_profile'],
    ['hybrid-credentials', 'hybrid_credential'],
    ['hybrid_credentials', 'hybrid_credential'],
    ['identity-mappings', 'identity_mapping'],
    ['message_presentations_presentation', 'message_presentations_presentation'],
    ['presentation_credentials_credential', 'presentation_credentials_credential'],
  ]

  for (const [src, dst] of pairs) {
    console.log(`Processing pair: ${src} -> ${dst}`)
    try {
      await mergeTables(ds, src, dst)
    } catch (err) {
      console.error('  Error merging', src, '->', dst, err)
    }
  }

  // Final counts for key tables
  const tables = ['doctor_profile','patient_profile','verifier_profile','identity_mapping','ministry_registry','audit_log','hybrid_credential']
  console.log('\nFinal counts:')
  for (const t of tables) {
    const exists = await tableExists(ds, t)
    if (!exists) continue
    const r: any = await ds.query(`SELECT COUNT(*) as c FROM \"${t}\"`)
    console.log(`  - ${t}: ${r[0].c}`)
  }

  await ds.destroy()
  console.log('Done')
}

main().catch(err => { console.error(err); process.exit(1) })
