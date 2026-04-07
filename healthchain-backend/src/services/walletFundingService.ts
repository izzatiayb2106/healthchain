import dotenv from 'dotenv'
import { ethers } from 'ethers'

dotenv.config()

type FundingResult = {
	status: 'funded' | 'skipped' | 'invalid'
	wallet: string
	reason: string
	targetEth: string
	balanceBefore?: string
	balanceAfter?: string
	fundedEth?: string
	txHash?: string
}

type FundingContext = {
	provider: ethers.JsonRpcProvider
	funder: ethers.Wallet
	targetWei: bigint
	targetEth: string
	nextNonce: number
}

let cachedContext: FundingContext | null = null
let fundingQueue: Promise<unknown> = Promise.resolve()

function normalizeWallet(wallet: string) {
	return String(wallet || '').trim().toLowerCase()
}

async function getFundingContext(): Promise<FundingContext> {
	if (cachedContext) {
		return cachedContext
	}

	const rpcUrl = String(process.env.RPC_URL || 'http://127.0.0.1:8545').trim()
	const fundingPrivateKey = String(process.env.PRIVATE_KEY || '').trim()
	const targetEth = String(process.env.AUTO_FUND_TARGET_ETH || '1000').trim()

	if (!fundingPrivateKey) {
		throw new Error('PRIVATE_KEY is required in .env for wallet auto-funding')
	}

	const provider = new ethers.JsonRpcProvider(rpcUrl)
	const funder = new ethers.Wallet(fundingPrivateKey, provider)
	const nextNonce = await provider.getTransactionCount(funder.address, 'latest')

	cachedContext = {
		provider,
		funder,
		targetWei: ethers.parseEther(targetEth),
		targetEth,
		nextNonce,
	}

	return cachedContext
}

function enqueueFunding<T>(task: () => Promise<T>): Promise<T> {
	const nextTask = fundingQueue.then(task, task)
	fundingQueue = nextTask.then(
		() => undefined,
		() => undefined,
	)
	return nextTask
}

export async function fundWalletIfNeeded(wallet: string, source = 'runtime registration'): Promise<FundingResult> {
	const normalizedWallet = normalizeWallet(wallet)
	if (!ethers.isAddress(normalizedWallet)) {
		return {
			status: 'invalid',
			wallet: normalizedWallet,
			reason: 'Invalid wallet address',
			targetEth: String(process.env.AUTO_FUND_TARGET_ETH || '1000').trim(),
		}
	}

	return enqueueFunding(async () => {
		const context = await getFundingContext()
		const provider = context.provider
		const funder = context.funder
		const targetEth = context.targetEth

		if (normalizedWallet === funder.address.toLowerCase()) {
			return {
				status: 'skipped',
				wallet: normalizedWallet,
				reason: 'Skipping funder wallet',
				targetEth,
			}
		}

		const code = await provider.getCode(normalizedWallet)
		if (code && code !== '0x') {
			return {
				status: 'skipped',
				wallet: normalizedWallet,
				reason: `Skipping contract address for ${source}`,
				targetEth,
			}
		}

		const balanceBefore = await provider.getBalance(normalizedWallet)
		if (balanceBefore >= context.targetWei) {
			return {
				status: 'skipped',
				wallet: normalizedWallet,
				reason: `Balance already meets target for ${source}`,
				targetEth,
				balanceBefore: ethers.formatEther(balanceBefore),
			}
		}

		const topUpAmount = context.targetWei - balanceBefore
		const tx = await funder.sendTransaction({
			to: normalizedWallet,
			value: topUpAmount,
			nonce: context.nextNonce,
		})
		context.nextNonce += 1
		const receipt = await tx.wait()
		if (!receipt || receipt.status !== 1) {
			throw new Error(`Funding transaction reverted for ${normalizedWallet}. Tx hash: ${tx.hash}`)
		}

		const balanceAfter = await provider.getBalance(normalizedWallet)
		return {
			status: 'funded',
			wallet: normalizedWallet,
			reason: `Funded for ${source}`,
			targetEth,
			balanceBefore: ethers.formatEther(balanceBefore),
			balanceAfter: ethers.formatEther(balanceAfter),
			fundedEth: ethers.formatEther(topUpAmount),
			txHash: tx.hash,
		}
	})
}
