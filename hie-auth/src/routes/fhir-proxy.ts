import express, { Request, Response } from "express";
import { authenticateUser } from "../lib/middleware";

const router = express.Router();
router.use(express.json());

const FHIR_BASE_URL = process.env.FHIR_BASE_URL;

// Proxy all FHIR requests to HAPI FHIR server
router.all("*", authenticateUser, async (req: Request, res: Response) => {
    try {
        console.log(`[FHIR Proxy] Authenticated request from user: ${(req as any).user?.preferred_username || 'unknown'}`);
        
        if (!FHIR_BASE_URL) {
            return res.status(500).json({ 
                error: "FHIR_BASE_URL is not configured", 
                status: "error" 
            });
        }

        // Build the target URL
        const targetPath = req.params[0] || "";
        const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
        const targetUrl = `${FHIR_BASE_URL}/${targetPath}${queryString}`;

        // Prepare headers for HAPI FHIR server
        const reqContentType = req.headers['content-type'];
        const reqAccept = req.headers['accept'];
        
        const headers: HeadersInit = {
            'Content-Type': reqContentType 
                ? (Array.isArray(reqContentType) ? reqContentType[0] : reqContentType)
                : 'application/fhir+json',
            'Accept': reqAccept
                ? (Array.isArray(reqAccept) ? reqAccept[0] : reqAccept)
                : 'application/fhir+json',
        };

        // Forward authorization header if present
        if (req.headers.authorization) {
            headers['Authorization'] = Array.isArray(req.headers.authorization)
                ? req.headers.authorization[0]
                : req.headers.authorization;
        }

        // Forward FHIR-specific headers
        if (req.headers['if-match']) {
            headers['If-Match'] = Array.isArray(req.headers['if-match']) 
                ? req.headers['if-match'][0] 
                : req.headers['if-match'];
        }
        if (req.headers['if-none-match']) {
            headers['If-None-Match'] = Array.isArray(req.headers['if-none-match'])
                ? req.headers['if-none-match'][0]
                : req.headers['if-none-match'];
        }
        if (req.headers['if-modified-since']) {
            headers['If-Modified-Since'] = Array.isArray(req.headers['if-modified-since'])
                ? req.headers['if-modified-since'][0]
                : req.headers['if-modified-since'];
        }
        if (req.headers['prefer']) {
            headers['Prefer'] = Array.isArray(req.headers['prefer'])
                ? req.headers['prefer'][0]
                : req.headers['prefer'];
        }

        // Prepare fetch options
        const fetchOptions: RequestInit = {
            method: req.method,
            headers: headers,
        };

        // Add body for methods that support it
        if (['POST', 'PUT', 'PATCH'].indexOf(req.method) > -1 && req.body) {
            fetchOptions.body = typeof req.body === 'string' 
                ? req.body 
                : JSON.stringify(req.body);
        }

        // Make the request to HAPI FHIR server
        console.log(`Proxying ${req.method} request to HAPI FHIR: ${targetUrl}`);
        const response = await fetch(targetUrl, fetchOptions);
        
        // Get response body
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        // Forward the status code and response
        res.status(response.status);
        
        // Forward relevant response headers (HAPI FHIR specific)
        const headersToForward = [
            'content-type', 
            'etag', 
            'last-modified', 
            'location',
            'content-location',
            'x-request-id',
            'x-powered-by'
        ];
        headersToForward.forEach(header => {
            const value = response.headers.get(header);
            if (value) {
                res.setHeader(header, value);
            }
        });

        return res.send(data);

    } catch (error) {
        console.error('FHIR Proxy Error:', error);
        return res.status(500).json({ 
            error: "Error proxying request to FHIR server", 
            status: "error",
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

export default router;

