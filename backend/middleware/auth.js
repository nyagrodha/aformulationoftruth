import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Middleware to verify JWT token from request
 * Checks Authorization header or query parameter
 */
export function verifyToken(req, res, next) {
  try {
    // Get token from Authorization header or query parameter
    let token = req.headers.authorization?.replace('Bearer ', '');

    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user info to request
    req.user = {
      email: decoded.email,
      keybase_username: decoded.keybase_username
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please sign in again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Invalid authentication token'
      });
    }

    return res.status(500).json({
      error: 'Authentication error',
      message: 'Failed to authenticate'
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't require it
 */
export function optionalAuth(req, res, next) {
  try {
    let token = req.headers.authorization?.replace('Bearer ', '');

    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        email: decoded.email,
        keybase_username: decoded.keybase_username
      };
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}
