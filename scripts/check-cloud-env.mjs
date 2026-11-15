if (process.env.VERCEL) {
  const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].filter(key => !process.env[key]);
  if (missing.length) throw new Error(`Missing cloud configuration: ${missing.join(', ')}`);
}
