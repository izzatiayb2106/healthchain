import { initializeDatabase, getHybridCredentialRepo } from '../db'

async function main() {
  try {
    console.log('[TEST] Initializing database...')
    const dataSource = await initializeDatabase()
    
    console.log('[TEST] Getting hybrid credential repository...')
    const repo = getHybridCredentialRepo()
    
    console.log('[TEST] Querying hybrid_credential table...')
    const records = await repo.find()
    
    console.log(`[TEST] Found ${records.length} hybrid credential records`)
    
    if (records.length > 0) {
      console.log('[TEST] Sample records:')
      records.slice(0, 3).forEach((rec, i) => {
        console.log(`  Record ${i + 1}: cid=${rec.cid}, subject=${rec.subjectWallet}, type=${rec.credentialType}`)
      })
    }
    
    console.log('[TEST] ✅ Hybrid credential storage in database is working!')
    process.exit(0)
  } catch (error) {
    console.error('[TEST] ❌ Error:', error)
    process.exit(1)
  }
}

main()
