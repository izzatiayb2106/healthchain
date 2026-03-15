const PROVIDER = 'did:ethr:hardhat'

export async function ensureDidForWallet(agent: any, walletAddress: string) {
	const alias = String(walletAddress || '').trim().toLowerCase()
	if (!alias) {
		throw new Error('Wallet address is required')
	}

	try {
		const existing = await agent.didManagerGetByAlias({
			alias,
			provider: PROVIDER,
		})

		return {
			created: false,
			identifier: existing,
		}
	} catch {
		const found = await agent.didManagerFind({ alias, provider: PROVIDER })
		if (Array.isArray(found) && found.length > 0) {
			return {
				created: false,
				identifier: found[0],
			}
		}

		const created = await agent.didManagerCreate({ provider: PROVIDER, alias })
		return {
			created: true,
			identifier: created,
		}
	}
}

export { PROVIDER }
