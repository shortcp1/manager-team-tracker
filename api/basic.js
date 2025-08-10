// ES module syntax (compatible with "type": "module")  
export default function handler(req, res) {
  res.status(200).json({
    message: "Basic test works with ES modules",
    method: req.method,
    timestamp: new Date().toISOString()
  });
}