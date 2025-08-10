// Plain JavaScript - no TypeScript
module.exports = (req, res) => {
  res.status(200).json({
    message: "Basic JS test",
    method: req.method,
    timestamp: new Date().toISOString()
  });
};