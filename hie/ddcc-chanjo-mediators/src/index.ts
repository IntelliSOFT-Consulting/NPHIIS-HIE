import express from "express";
import cors from 'cors'
import * as dotenv from 'dotenv'
import {registerMediators} from './lib/openhim'
import { createFHIRSubscription } from "./lib/fhir";


dotenv.config() // Load environment variables

registerMediators();
createFHIRSubscription();

//Import routes
import SubscriptionHandler from './routes/subscriptions';
import DigitalCertificate from './routes/digital-certificate';

const app = express();
const PORT = 3000;

app.use(cors())

app.use((req, res, next) => {
  try {
    // Starts when a new request is received by the server
    console.log(`${new Date().toUTCString()} : The Chanjo DDCC Mediator Service has received ${req.method} request from ${req.hostname} on ${req.path}`);
    next()
  } catch (error) {
    // Starts when a new request is received by the server
    res.json(error);
    return;
  }
});


app.use('/subscriptions', SubscriptionHandler);
app.use('/digital-certificate', DigitalCertificate);

app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});