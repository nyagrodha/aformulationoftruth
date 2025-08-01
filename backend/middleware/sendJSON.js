export default function sendJSONMiddleware(req, res, next) {
  res.sendJSON = (payload) => {
    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      data: payload
    });
  };

  res.sendError = (message, statusCode = 400) => {
    res.status(statusCode).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message
    });
  };

  next();
}
