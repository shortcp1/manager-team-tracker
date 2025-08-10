// ES module syntax (compatible with "type": "module")
export default function handler(req, res) {
  res.status(200).json({ ping: "pong", timestamp: new Date().toISOString() });
}