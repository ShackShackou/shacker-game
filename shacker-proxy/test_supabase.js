const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const supabaseUrl = 'https://gbdlozmurnqrthxjihzk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiZGxvem11cm5xcnRoeGppaHprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDcyMjA4NCwiZXhwIjoyMDUwMjk4MDg0fQ.Uby2tXwCnJ1zC0nDq4MbXnKvD82HfgtSw4K7kH3uiAM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('Testing Supabase connection...');
    console.log('URL:', supabaseUrl);
    
    try {
        // Test 1: List tables
        console.log('\n1. Testing table access...');
        const { data: tables, error: tablesError } = await supabase
            .from('users')
            .select('*')
            .limit(1);
        
        if (tablesError) {
            console.error('❌ Error accessing users table:', tablesError);
            console.log('Error details:', JSON.stringify(tablesError, null, 2));
        } else {
            console.log('✅ Users table accessible');
            console.log('Sample data:', tables);
        }
        
        // Test 2: Try to insert a test user
        console.log('\n2. Testing user creation...');
        const testUser = {
            username: 'test_' + Date.now(),
            email: 'test_' + Date.now() + '@test.com',
            password_hash: 'test_hash',
            games_today: 0,
            total_games: 0,
            best_score: 0,
            is_banned: false
        };
        
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert(testUser)
            .select()
            .single();
        
        if (insertError) {
            console.error('❌ Error creating user:', insertError);
            console.log('Error details:', JSON.stringify(insertError, null, 2));
        } else {
            console.log('✅ User created successfully:', newUser);
            
            // Clean up test user
            const { error: deleteError } = await supabase
                .from('users')
                .delete()
                .eq('id', newUser.id);
            
            if (!deleteError) {
                console.log('✅ Test user cleaned up');
            }
        }
        
        // Test 3: Check if game_sessions table exists
        console.log('\n3. Testing game_sessions table...');
        const { data: sessions, error: sessionsError } = await supabase
            .from('game_sessions')
            .select('*')
            .limit(1);
        
        if (sessionsError) {
            console.error('❌ Error accessing game_sessions table:', sessionsError);
            console.log('Error details:', JSON.stringify(sessionsError, null, 2));
        } else {
            console.log('✅ Game_sessions table accessible');
        }
        
    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

testConnection();