import express from 'express'
import cors from 'cors'
import { createVeramoAgent } from './agent'
import dotenv from 'dotenv'
import authRoutes from "./routes/auth"
import didRoutes from "./routes/did"
import credentialRoutes from "./routes/credential"
import doctorRoutes from "./routes/doctor"
import patientRoutes from "./routes/patient"
import { runContractPreflight } from './utils/contractPreflight'

dotenv.config()

async function startServer(){
  await runContractPreflight()

  const app = express()
  
  // Enable CORS for frontend - reflect request origin to allow any origin in dev
  // NOTE: reflecting origin (origin: true) allows credentials while permitting requests
  // from arbitrary origins. Avoid this in production; restrict origins appropriately.
  app.use(
    cors({
      origin: true, // reflect request origin
      credentials: true,
    }),
  )
  
  app.use(express.json())

  // Initialize agent once
  const agent = await createVeramoAgent()

  // Pass agent to routes
  app.use("/auth", authRoutes(agent))
  app.use("/did", didRoutes(agent))
  app.use("/credential", credentialRoutes(agent))
  app.use("/doctor", doctorRoutes())
  app.use("/patient", patientRoutes())

  app.get("/", (req,res)=>{
    res.send("HealthChain Backend Running")
  })

  app.post("/did/create", async (req,res)=>{
    try {
      const did = await agent.didManagerCreate({
        provider: "did:ethr:hardhat"
      })
      res.json(did)
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: "DID creation failed" })
    }
  })

  app.listen(3001,()=>{
    console.log('Backend server running on http://localhost:3001')
  })
}

startServer().catch(console.error)