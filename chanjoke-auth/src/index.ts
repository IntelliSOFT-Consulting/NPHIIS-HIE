import express from "express";
import cors from 'cors'
import * as dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'

// Define rate limit options
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

dotenv.config() // Load environment variables

//Import routes
import ClientAuth from './routes/client-auth'
import ProviderAuth from './routes/provider-auth'

const app = express();
const PORT = 3000;

// app.use(limiter);
app.use(cors())

app.use((req, res, next) => {
  try {
    // Starts when a new request is received by the server
    console.log(`${new Date().toUTCString()} : The Auth Service has received ${req.method} request from ${req.hostname} on ${req.path}`);
    next()
  } catch (error) {
    // Starts when a new request is received by the server
    res.json(error);
    return;
  }
});

app.use('/client', ClientAuth)
app.use('/provider', ProviderAuth)


app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});