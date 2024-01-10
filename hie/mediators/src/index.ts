import express from "express";
import cors from 'cors'
import * as dotenv from 'dotenv'

dotenv.config() // Load environment variables

//Import routes
import OpenHIMAuth from './routes/openhim-auth'
import ClientAuth from './routes/client-auth'
import ProviderAuth from './routes/provider-auth'


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

app.use('/auth', OpenHIMAuth)
app.use('/client', ClientAuth)
app.use('/provider', ProviderAuth)


app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});