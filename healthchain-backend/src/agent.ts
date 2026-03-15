import 'reflect-metadata'
import { createAgent } from '@veramo/core'
import { DIDManager } from '@veramo/did-manager'
import { KeyManager } from '@veramo/key-manager'
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local'
import { Resolver } from 'did-resolver'
import { getResolver as ethrDidResolver } from 'ethr-did-resolver'
import { DataSource } from 'typeorm'
import { Entities, KeyStore, DIDStore, PrivateKeyStore } from '@veramo/data-store'
import { EthrDIDProvider } from '@veramo/did-provider-ethr'
import { CredentialPlugin } from '@veramo/credential-w3c'
import { DIDResolverPlugin } from '@veramo/did-resolver'
import dotenv from 'dotenv'

dotenv.config()

let agentInstance: any = null

// SecretBox expects a 32-byte hex string (64 hex chars, without 0x prefix).
const kmsSecretKey =
  process.env.KMS_SECRET_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

export async function createVeramoAgent() {
  // Return existing instance if already created
  if (agentInstance) {
    return agentInstance
  }

  const dbConnection = new DataSource({
    type: 'sqlite',
    database: 'database.sqlite',
    synchronize: true,
    logging: false,
    entities: Entities,
  })

  await dbConnection.initialize()
 
  const resolver = new Resolver({
    ...ethrDidResolver({
      networks: [
        {
          name: 'hardhat',
          rpcUrl: process.env.RPC_URL,
        },
      ],
    }),
  })

  agentInstance = createAgent({

    plugins: [
        //manage key
      new KeyManager({
        store: new KeyStore(dbConnection),
        kms: {
          local: new KeyManagementSystem(
            new PrivateKeyStore(
              dbConnection,
              new SecretBox(kmsSecretKey)
            )
          ),
        },
      }),
         //create did
      new DIDManager({
        store: new DIDStore(dbConnection),
        defaultProvider: 'did:ethr:hardhat',
        providers: {
          'did:ethr:hardhat': new EthrDIDProvider({
            defaultKms: 'local',
            network: 'hardhat',
            rpcUrl: process.env.RPC_URL,
          }),
        },
      }),

      //resolve did
      new DIDResolverPlugin({
        resolver,
      }),
      
      //issue credentials
      new CredentialPlugin([]),
      
    ],
  })

  return agentInstance
}