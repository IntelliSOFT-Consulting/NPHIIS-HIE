import express from "express";
import cors from 'cors'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config() // Load environment variables

//Import routes 
import Index from './routes/main'
import Matching from './routes/matching'
import Auth from './routes/auth'
import Patients from './routes/patients'
import SHR from './routes/shr'
import Data from './routes/data'
import Facilities from "./routes/facilities";
import Summary from "./routes/ips";
import FHIR from './routes/fhir';

// import Reports from './routes/reports'

import { importMediators } from "./lib/utils";

const app = express();
const PORT = 3000;

app.use(cors())

app.use((req, res, next) => {
  try {
    // Starts when a new request is received by the server
    console.log(`${new Date().toUTCString()} : The Mediator has received ${req.method} request from ${req.hostname} on ${req.path}`);
    next()
  } catch (error) {
    // Starts when a new request is received by the server
    res.json(error);
    return;
  }
});




app.use('/', Index)
app.use('/matching', Matching)
app.use('/auth', Auth)
app.use('/Patient', Patients)
app.use('/patients', Patients)
app.use('/shr', SHR)
app.use('/data', Data)
app.use('/facilities', Facilities)
app.use('/summary', Summary)
app.use('/fhir', FHIR)




app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});