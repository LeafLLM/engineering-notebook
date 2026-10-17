// Copy your Project URL and publishable key from your Supabase project's Connect dialog.
// Use the sb_publishable_... key here. Never use a secret or service_role key in the browser.
const supabaseUrl = "https://wdlncujtesrctnztrpxi.supabase.co";
const supabasePublishableKey = "sb_publishable_HyZn8cBnp3TnCxMobCqUpw_aiX1PxoP";

// notebookDb is the object your future login and database code will use.
// Leave it null until both settings are filled in so the existing page still works.
let notebookDb = null;

if (window.supabase && supabaseUrl && supabasePublishableKey) {
    notebookDb = window.supabase.createClient(supabaseUrl, supabasePublishableKey);
}
