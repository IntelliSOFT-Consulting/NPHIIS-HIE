import { Request, Response, NextFunction } from 'express';
import { getUserInfoFromToken } from './notification';
import { OperationOutcome } from './utils';

// Extend Express Request to include user info
export interface AuthenticatedRequest extends Request {
    userInfo?: any;
}

/**
 * Middleware to authenticate user by validating Bearer token
 * Extracts token from Authorization header and validates it
 * Attaches user info to request object for downstream use
 */
export const authenticateUser = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        // Extract token from Authorization header
        const accessToken = req.headers.authorization?.split(' ')[1];
        
        if (!accessToken) {
            return res.status(401).json(
                OperationOutcome("Unauthorized - No token provided", "error", "security")
            );
        }

        // Validate token and get user info
        const userInfo = await getUserInfoFromToken(accessToken);
        
        if (!userInfo) {
            return res.status(401).json(
                OperationOutcome("Invalid Bearer token provided", "error", "security")
            );
        }

        // Attach user info to request object
        req.userInfo = userInfo;
        
        // Continue to next middleware/route handler
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json(
            OperationOutcome("Authentication failed", "error", "exception")
        );
    }
};

