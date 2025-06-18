import mongoose from 'mongoose';
import User from '../Models/user.model.js';

/**
 * Authentication middleware to verify user tokens
 * This middleware checks for a valid user ID in the Authorization header
 */
export const authMiddleware = async (req, res, next) => {
    try {
        // Get the authorization header
        const authHeader = req.headers.authorization;
        
        // Check if the header exists and has the correct format
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please log in.'
            });
        }
        
        // Extract the token (user ID in this case)
        const token = authHeader.split(' ')[1];
        
        // Validate the token format (should be a valid MongoDB ObjectId)
        if (!mongoose.Types.ObjectId.isValid(token)) {
            return res.status(401).json({
                success: false,
                error: 'Invalid authentication token'
            });
        }
        
        // Find the user with this ID
        const user = await User.findById(token);
        
        // If no user found, return error
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found. Please log in again.'
            });
        }
        
        // Add the user to the request object
        req.user = user;
        
        // Continue to the next middleware or route handler
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during authentication'
        });
    }
};
