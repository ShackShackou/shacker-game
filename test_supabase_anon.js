const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase avec ANON key (depuis l'image fournie)
const supabaseUrl = 'https://gbdlozmurnqrthxjihzk.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZGxvem11cm5xcnRoeGppaHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ3MjIwODQsImV4cCI6MjA1MDI5ODA4NH0.RcT2eEWn6aLRr7MYlBPvEaI79sX-Wb5G5G2TzZ3fZd0';

console.log('Testing with ANON key...');
console.log('URL:', supabaseUrl);
console.log('Key (first 50 chars):', supabaseAnonKey.substring(0, 50) + '...');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testWithAnon() {
    try {
        // Test simple query
        console.log('\nTesting basic connection...');
        const { data, error } = await supabase
            .from('users')
            .select('count')
            .single();
        
        if (error) {
            console.error('Error with ANON key:', error);
            
            // If the error is about missing table, that's actually good - it means the key works
            if (error.message.includes('relation') || error.message.includes('does not exist')) {
                console.log('✅ Connection works! But table might not exist yet.');
                return true;
            }
        } else {
            console.log('✅ Connection successful!');
            return true;
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
    return false;
}

testWithAnon();