# Manage

Personal Sources and Problems library, built with Vite and PDF.js.

## Local development

```powershell
npm.cmd ci
npm.cmd run dev
```

Without Supabase environment variables, the app uses the original browser-local IndexedDB library. To use the connected private library, copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key. Never use a service-role or secret key in a `VITE_` variable.

## Cloud deployment

- Vercel project: `spacetimevoid/manage2`.
- Supabase project: `yyhzsgzqmqrlytpwtwbr`.
- Production requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Database and Storage setup is recorded in `supabase/schema.sql` and the hosted migration `private_library_storage`.
- `library_members` contains the approved owner email. Only an authenticated, approved owner can access their own records or files. The storage bucket `manage-files` is private.
- First use: create an account with the approved owner email, confirm the email, then sign in. The password stays with Supabase Auth.

Uploads, notes, difficulty, completion status and solutions are saved to Supabase. Existing non-sample records on the same browser origin are imported without overwriting cloud records. Data on localhost or a different deployment URL remains on that origin and is not automatically transferred across origins.

## Problem tag suggestions

In Upload Problem, **Suggest tags** sends the selected image and available subject labels to `gemini-3.5-flash-lite` through Google's Gemini API. Suggestions join the editable Subjects field and are saved only when you choose **Save**. PDF uploads use manual tags.

The route requires an approved Supabase session and a server-only `GEMINI_API_KEY`. For local AI testing, run the app with `vercel dev`. Vite alone serves the UI. If an image exceeds the Vercel Function request limit, it can still be uploaded with manual tags.

## Checks

```powershell
npm.cmd test
npm.cmd run build
```
