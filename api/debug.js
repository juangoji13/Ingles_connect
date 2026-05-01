export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    env_keys: Object.keys(process.env).filter(k => k.includes('ADMIN') || k.includes('SUPABASE')),
    received_headers: {
      'x-admin-password-exists': !!req.headers['x-admin-password'],
      'x-admin-password-length': req.headers['x-admin-password'] ? req.headers['x-admin-password'].length : 0
    },
    node_version: process.version
  });
}
