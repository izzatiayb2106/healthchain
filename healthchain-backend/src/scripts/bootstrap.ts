import { spawn } from 'child_process'
import path from 'path'

// Use current working directory (should be backend root when running npm run bootstrap)
const backendRoot = process.cwd()
const appRoot = path.resolve(backendRoot, '..', 'healthchain-app')

// Windows uses npm.cmd, Unix uses npm
const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'

interface StepResult {
  success: boolean
  message: string
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  label: string
): Promise<StepResult> {
  return new Promise((resolve) => {
    console.log(`\n[${label}] Starting...`)
    console.log(`Working dir: ${cwd}`)

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
    })

    child.on('error', (error) => {
      console.error(`[${label}] Error:`, error.message)
      resolve({ success: false, message: error.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[${label}] ✓ Complete`)
        resolve({
          success: true,
          message: `${label} succeeded`,
        })
      } else {
        console.error(`[${label}] ✗ Failed with code ${code}`)
        resolve({
          success: false,
          message: `${label} exited with code ${code}`,
        })
      }
    })
  })
}

async function bootstrap() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║  HealthChain Local Bootstrap Flow                      ║')
  console.log('║  (Reset Runtime Data → Deploy Contract → Start Backend)║')
  console.log('╚════════════════════════════════════════════════════════╝')

  // Step 1: Reset local state
  const resetResult = await runCommand(
    npmCmd,
    ['run', 'reset:local-state'],
    backendRoot,
    'Step 1: Reset Local State'
  )

  if (!resetResult.success) {
    console.error('\n✗ Bootstrap failed at reset step')
    process.exit(1)
  }

  // Step 2: Deploy contract
  const deployResult = await runCommand(
    npmCmd,
    ['run', 'deploy:safe'],
    appRoot,
    'Step 2: Deploy Smart Contract (Safe)'
  )

  if (!deployResult.success) {
    console.error('\n✗ Bootstrap failed at deploy step')
    process.exit(1)
  }

  // Step 3: Auto-fund discovered wallets for local testing
  const fundWalletsResult = await runCommand(
    npmCmd,
    ['run', 'fund:wallets'],
    backendRoot,
    'Step 3: Auto-Fund Wallets'
  )

  if (!fundWalletsResult.success) {
    console.error('\n✗ Bootstrap failed at auto-fund step')
    process.exit(1)
  }

  // Step 4: Start backend
  console.log('\n[Step 4: Start Backend Service] Starting server on port 3001...')
  const backendStart = spawn(npmCmd, ['run', 'dev'], {
    cwd: backendRoot,
    stdio: 'inherit',
    shell: true,
  })

  backendStart.on('error', (error) => {
    console.error('[Step 4] Error:', error.message)
    process.exit(1)
  })

  // Keep process alive
  console.log('\n✓ Bootstrap complete. Backend running.')
  console.log('  Frontend: http://localhost:5173')
  console.log('  Backend:  http://localhost:3001')
  console.log('\nPress Ctrl+C to stop.\n')
}

bootstrap().catch((error) => {
  console.error('Fatal bootstrap error:', error)
  process.exit(1)
})
