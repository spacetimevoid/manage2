if (process.env.VERCEL) {
  const cloudKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
  const localPreview = process.env.VERCEL_ENV === 'preview' && process.env.MANAGE_LOCAL_PREVIEW === '1';
  const missing = cloudKeys.filter(key => !process.env[key]);
  if (localPreview && missing.length !== cloudKeys.length) {
    throw new Error('Local Preview requires an isolated build without cloud configuration.');
  }
  if (!localPreview && missing.length) {
    throw new Error(`Missing cloud configuration: ${missing.join(', ')}`);
  }
}
