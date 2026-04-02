import dotenv from 'dotenv'
import { runContractPreflight } from '../utils/contractPreflight'

dotenv.config()

runContractPreflight()
  .then(() => {
    console.log('[preflight] Backend contract compatibility check passed.')
    process.exit(0)
  })
  .catch((error: any) => {
    console.error('[preflight] Backend contract compatibility check failed:', error?.message || error)
    process.exit(1)
  })
