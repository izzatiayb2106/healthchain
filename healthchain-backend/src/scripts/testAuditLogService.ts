import 'reflect-metadata'
import { initializeDatabase } from '../db'
import { appendAuditLog, listAuditLogs } from '../services/auditLogService'

async function testAuditLogService() {
  console.log('🧪 Testing AuditLog service with database...\n')

  try {
    // Initialize database
    await initializeDatabase()
    console.log('✅ Database initialized')

    // Test 1: Append an audit log
    console.log('\n📝 Test 1: Adding audit log...')
    const newLog = await appendAuditLog({
      action: 'login',
      role: 'doctor',
      wallet: '0x123ABC',
      did: 'did:ethr:hardhat:test',
      status: 'success',
      details: 'Doctor login test',
      metadata: { ip: '192.168.1.1' },
    })
    console.log('✅ Audit log created:', {
      id: newLog.id,
      action: newLog.action,
      wallet: newLog.wallet,
      status: newLog.status,
    })

    // Test 2: List all logs
    console.log('\n📋 Test 2: Listing audit logs...')
    const allLogs = await listAuditLogs({ limit: 5 })
    console.log(`✅ Retrieved ${allLogs.length} recent logs`)
    console.log('  Sample logs:')
    allLogs.slice(0, 3).forEach((log) => {
      console.log(`    - ${log.action} by ${log.role} (${log.wallet})`)
    })

    // Test 3: Filter by role
    console.log('\n🔍 Test 3: Filtering by role...')
    const doctorLogs = await listAuditLogs({ role: 'doctor', limit: 10 })
    console.log(`✅ Found ${doctorLogs.length} doctor logs`)

    // Test 4: Filter by action
    console.log('\n🔍 Test 4: Filtering by action...')
    const loginLogs = await listAuditLogs({ action: 'login', limit: 10 })
    console.log(`✅ Found ${loginLogs.length} login logs`)

    // Test 5: Filter by wallet
    console.log('\n🔍 Test 5: Filtering by wallet...')
    const walletLogs = await listAuditLogs({ wallet: '0x123abc', limit: 10 })
    console.log(`✅ Found ${walletLogs.length} logs for wallet 0x123abc`)

    console.log('\n✅ All AuditLog service tests passed!')
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

testAuditLogService()
