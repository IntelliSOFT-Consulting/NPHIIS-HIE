import { Request, Response, NextFunction } from "express";
import { validateBearerToken, validateUserAuthentication } from "./keycloak";

/**
 * Authentication middleware that validates Bearer tokens and attaches user info to the request
 * @param req - Express request object
 * @param res - Express response object  
 * @param next - Express next function
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Validate Bearer token
        const accessToken = validateBearerToken(req);
        if (!accessToken) {
            return res.status(401).json({ status: "error", error: "Bearer token is required but not provided" });
        }

        // Validate user authentication
        const currentUser = await validateUserAuthentication(accessToken);
        if (!currentUser) {
            return res.status(401).json({ status: "error", error: "Invalid Bearer token provided" });
        }

        // Attach user info to request object for use in route handlers
        (req as any).user = currentUser;
        (req as any).accessToken = accessToken;

        next();
    } catch (error) {
        console.error('Authentication middleware error:', error);
        return res.status(401).json({ status: "error", error: "Authentication failed" });
    }
};
