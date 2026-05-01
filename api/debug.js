export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({
    supabase_url: process.env.SUPABASE_URL,
    internal_password_length: process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim().length : 0
  });
}
