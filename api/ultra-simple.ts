export default function handler(req: any, res: any) {
  res.json({ message: "Ultra simple test works", timestamp: new Date().toISOString() });
}