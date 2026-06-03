const SUPABASE_URL =
    'https://bsfmhxcrqnzqwmwzwfif.supabase.co';

const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZm1oeGNycW56cXdtd3p3ZmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MzYyMjEsImV4cCI6MjA5NDAxMjIyMX0.0Oid2GO_8Hl4r0i-ORmgFSizsjx-dAIlPLpWCH4UJ9o';

window.supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );

console.log("✅ Supabase conectado");